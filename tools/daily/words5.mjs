/**
 * Datos de Quinteto y Cuarteto (public/shared/words5/):
 *
 *   allowed-{es,en}.txt   todas las palabras de 5 letras de los diccionarios de Mecha Corta (valen como intento),
 *                         una por línea, sin tildes (la ñ se conserva). Las genera este script.
 *   answers-{es,en}.json  palabras posibles del día: selección propia de palabras comunes (sin plurales, formas
 *                         conjugadas, nombres propios ni palabras ofensivas), con tilde para mostrarlas bien y
 *                         mezcladas una vez con semilla fija. El desafío n.º N es answers[(N − 1) % largo].
 *                         No se generan: se editan a mano. Para sumar palabras, agregarlas AL FINAL (si no,
 *                         cambian los desafíos de los días siguientes).
 *
 *   node tools/daily/words5.mjs            regenera allowed-* y revisa las respuestas
 *
 * Las respuestas se eligieron con ayuda de listas de frecuencia de subtítulos (hermitdave/FrequencyWords,
 * CC BY-SA 4.0), que no se incluyen; ver public/shared/words5/LEEME.txt.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decode, norm } from '../../public/games/mecha/shared/dict.js';

const DICT = new URL('../../public/games/mecha/dict/', import.meta.url);
const OUT = new URL('../../public/shared/words5/', import.meta.url);
let errors = 0;

for (const lang of ['es', 'en']) {
  const five = decode(readFileSync(new URL(`${lang}.txt`, DICT), 'utf8')).filter((w) => w.length === 5);
  writeFileSync(new URL(`allowed-${lang}.txt`, OUT), five.join('\n') + '\n');
  const allowed = new Set(five);
  const answers = JSON.parse(readFileSync(new URL(`answers-${lang}.json`, OUT), 'utf8'));
  const seen = new Set();
  for (const a of answers) {
    const n = norm(a, lang);
    if (n.length !== 5) console.log(`  ✗ ${lang}: "${a}" no tiene 5 letras`), errors++;
    else if (!allowed.has(n)) console.log(`  ✗ ${lang}: "${a}" no está en el diccionario`), errors++;
    else if (seen.has(n)) console.log(`  ✗ ${lang}: "${a}" está repetida`), errors++;
    seen.add(n);
  }
  console.log(`${lang}: ${five.length} palabras válidas, ${answers.length} respuestas`);
}
process.exit(errors ? 1 : 0);
