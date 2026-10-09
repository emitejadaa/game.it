/**
 * Revisa los desafíos de Vínculos (public/games/vinculos/data/puzzles-{es,en}.json).
 *
 *   node tools/daily/vinculos-check.mjs
 *
 * Errores (salida 1): estructura, 4 grupos con niveles 1-4 una sola vez, 4 palabras por grupo, 16 palabras
 * distintas (comparadas con norm()), temas vacíos, palabras fuera de 2-12 caracteres.
 * Avisos: tema repetido entre desafíos y palabra repetida en 10 desafíos seguidos.
 * Si falta un idioma se informa y se sigue con el otro.
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { norm } from '../../public/shared/words5/norm.js';

const DATA = new URL('../../public/games/vinculos/data/', import.meta.url);
const EPOCH = '2026-10-06';
const NEAR = 10;

/** Valida un arreglo de desafíos. Devuelve { errors, warnings }. */
export function validate(puzzles, lang = 'es') {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(puzzles) || !puzzles.length) return { errors: ['el archivo debe ser un arreglo con al menos un desafío'], warnings };
  const themes = new Map();
  const last = new Map(); // palabra normalizada -> último desafío donde apareció
  puzzles.forEach((pz, i) => {
    const at = `#${i + 1}`;
    const gs = pz?.grupos;
    if (!Array.isArray(gs) || gs.length !== 4) return errors.push(`${at}: debe tener exactamente 4 grupos`);
    const levels = gs.map((g) => g?.nivel).sort().join(',');
    if (levels !== '1,2,3,4') errors.push(`${at}: los niveles deben ser 1, 2, 3 y 4 una vez cada uno (hay ${levels})`);
    const seen = new Map();
    for (const g of gs) {
      if (typeof g?.tema !== 'string' || !g.tema.trim()) errors.push(`${at}: grupo de nivel ${g?.nivel} sin tema`);
      else {
        const key = norm(g.tema, lang);
        if (themes.has(key)) warnings.push(`${at}: tema repetido "${g.tema}" (ya estaba en ${themes.get(key)})`);
        else themes.set(key, at);
      }
      if (!Array.isArray(g?.palabras) || g.palabras.length !== 4) {
        errors.push(`${at}: el grupo "${g?.tema}" debe tener 4 palabras`);
        continue;
      }
      for (const w of g.palabras) {
        if (typeof w !== 'string' || !w.trim()) {
          errors.push(`${at}: palabra vacía en "${g.tema}"`);
          continue;
        }
        const n = norm(w, lang);
        if (!n) errors.push(`${at}: la palabra "${w}" no tiene letras válidas`);
        if (n.length < 2 || w.trim().length > 12) errors.push(`${at}: largo raro en "${w}" (${w.trim().length} caracteres)`);
        if (seen.has(n)) errors.push(`${at}: palabra repetida "${w}" (también en "${seen.get(n)}")`);
        else seen.set(n, g.tema);
      }
    }
    if (seen.size !== 16 && !errors.some((e) => e.startsWith(at))) errors.push(`${at}: debe haber 16 palabras distintas (hay ${seen.size})`);
    for (const n of seen.keys()) {
      if (last.has(n) && i - last.get(n) < NEAR) warnings.push(`${at}: "${n}" ya apareció en ${NEAR} desafíos seguidos (#${last.get(n) + 1})`);
      last.set(n, i);
    }
  });
  return { errors, warnings };
}

const lastDay = (n) => {
  const d = new Date(Date.parse(EPOCH + 'T00:00:00Z') + (n - 1) * 86400e3);
  return d.toISOString().slice(0, 10);
};

/** Lee y valida los archivos que existan. Devuelve [{ lang, found, count, errors, warnings }]. */
export function checkFiles(langs = ['es', 'en']) {
  return langs.map((lang) => {
    const url = new URL(`puzzles-${lang}.json`, DATA);
    if (!existsSync(url)) return { lang, found: false, count: 0, errors: [], warnings: [] };
    let puzzles;
    try {
      puzzles = JSON.parse(readFileSync(url, 'utf8'));
    } catch (e) {
      return { lang, found: true, count: 0, errors: [`JSON inválido: ${e.message}`], warnings: [] };
    }
    return { lang, found: true, count: Array.isArray(puzzles) ? puzzles.length : 0, ...validate(puzzles, lang) };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let bad = 0;
  for (const r of checkFiles()) {
    if (!r.found) {
      console.log(`[${r.lang}] puzzles-${r.lang}.json no existe todavía`);
      continue;
    }
    console.log(`[${r.lang}] ${r.count} desafíos, cubren ${r.count} días (hasta el ${lastDay(r.count)})`);
    r.warnings.forEach((w) => console.log(`  aviso: ${w}`));
    r.errors.forEach((e) => console.log(`  ERROR: ${e}`));
    if (r.errors.length) bad++;
    else console.log(`  sin errores${r.warnings.length ? `, ${r.warnings.length} avisos` : ''}`);
  }
  process.exit(bad ? 1 : 0);
}
