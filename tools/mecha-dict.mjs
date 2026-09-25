/**
 * Genera los diccionarios de Mecha Corta (public/games/mecha/dict/) a partir de las listas MIT
 * `an-array-of-spanish-words` y `an-array-of-english-words`:
 *
 *   npm i --no-save an-array-of-spanish-words an-array-of-english-words
 *   node tools/mecha-dict.mjs
 *
 * - {es,en}.txt: palabras ordenadas, en minúscula y sin tildes (la ñ se conserva), con
 *   "codificación de prefijo": cada línea empieza con un carácter en base 36 que dice cuántas
 *   letras comparte con la anterior. Así pesan un tercio y se buscan con búsqueda binaria.
 * - prompts.json: sílabas de 2 y 3 letras con cuántas palabras las contienen (para elegir las de
 *   cada dificultad).
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = new URL('../public/games/mecha/dict/', import.meta.url);
const norm = (w) => w.toLowerCase().replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
const ok = { es: /^[a-zñ]{2,}$/, en: /^[a-z]{2,}$/ };
const prompts = {};
for (const [lang, pkg] of [
  ['es', 'an-array-of-spanish-words'],
  ['en', 'an-array-of-english-words'],
]) {
  const raw = JSON.parse(readFileSync(require.resolve(`${pkg}/index.json`), 'utf8'));
  const words = [...new Set(raw.map(norm).filter((w) => ok[lang].test(w)))].sort();
  let prev = '';
  const lines = [];
  for (const w of words) {
    let k = 0;
    while (k < prev.length && k < w.length && k < 35 && prev[k] === w[k]) k++;
    lines.push(k.toString(36) + w.slice(k));
    prev = w;
  }
  writeFileSync(new URL(`${lang}.txt`, OUT), lines.join('\n'));
  // cuántas palabras contienen cada sílaba de 2 y 3 letras
  const count = new Map();
  for (const w of words) {
    const seen = new Set();
    for (let n = 2; n <= 3; n++) for (let i = 0; i + n <= w.length; i++) seen.add(w.slice(i, i + n));
    for (const s of seen) count.set(s, (count.get(s) || 0) + 1);
  }
  const min = Math.round(words.length / 4000); // descarta las rarísimas
  prompts[lang] = { n: words.length, list: [...count].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]) };
  console.log(lang, words.length, 'palabras;', prompts[lang].list.length, 'sílabas');
}
writeFileSync(new URL('prompts.json', OUT), JSON.stringify(prompts));
