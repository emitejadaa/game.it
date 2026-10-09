/* Vínculos: lógica pura (sin DOM), para poder probarla en Node.
 * Un desafío es { grupos: [{ nivel 1..4, tema, palabras: [4] } x4] }. Los grupos se identifican por su posición (0..3)
 * dentro de `grupos`; las palabras se comparan tal cual están escritas en el archivo (ya son únicas por desafío).
 */
import { shuffle } from '/shared/daily.js';

export const MISTAKES = 4;
/** Un cuadradito por nivel para el texto de compartir: 1 = el más fácil … 4 = el más difícil. */
export const SQUARES = ['🟨', '🟩', '🟦', '🟪'];

/** Desafío del día: el n.º N es puzzles[(N − 1) % largo]. */
export const pickPuzzle = (puzzles, dayNo) => puzzles[(((dayNo - 1) % puzzles.length) + puzzles.length) % puzzles.length];

/** Las 16 palabras en el orden del archivo. */
export const allWords = (pz) => pz.grupos.flatMap((g) => g.palabras);

/** Índice del grupo al que pertenece una palabra (o -1). */
export const groupOf = (pz, word) => pz.grupos.findIndex((g) => g.palabras.includes(word));

/** Nivel (1..4) de una palabra (0 si no existe). */
export const levelOf = (pz, word) => pz.grupos[groupOf(pz, word)]?.nivel ?? 0;

/** Clave de una combinación sin importar el orden en que se eligieron las palabras. */
export const comboKey = (words) => [...words].sort().join('|');

/**
 * Revisa 4 palabras elegidas:
 *   { ok: true, group }   las 4 son de un mismo grupo (group = índice en pz.grupos)
 *   { oneAway: true }     3 de las 4 son de un mismo grupo
 *   { wrong: true }       cualquier otra cosa
 */
export function checkSelection(pz, words) {
  if (words.length !== 4) return { wrong: true };
  const count = new Array(pz.grupos.length).fill(0);
  for (const w of words) {
    const g = groupOf(pz, w);
    if (g >= 0) count[g]++;
  }
  const best = Math.max(...count);
  if (best === 4) return { ok: true, group: count.indexOf(4) };
  if (best === 3) return { oneAway: true };
  return { wrong: true };
}

/**
 * Orden inicial de las 16 palabras con el generador `rnd`. Se vuelve a mezclar (hasta 25 veces) si alguna fila de la
 * grilla de 4x4 quedara justo igual a un grupo, para que el tablero no empiece resuelto por casualidad.
 */
export function initialOrder(pz, rnd) {
  const words = allWords(pz);
  let order = shuffle(rnd, words);
  for (let n = 0; n < 25 && hasSolvedRow(pz, order); n++) order = shuffle(rnd, words);
  return order;
}

function hasSolvedRow(pz, order) {
  for (let r = 0; r < 16; r += 4) {
    const g = groupOf(pz, order[r]);
    if (order.slice(r, r + 4).every((w) => groupOf(pz, w) === g)) return true;
  }
  return false;
}

/** ¿Es `order` una permutación de las 16 palabras del desafío? (para validar lo guardado) */
export function validOrder(pz, order) {
  if (!Array.isArray(order) || order.length !== 16) return false;
  const all = new Set(allWords(pz));
  return order.every((w) => all.delete(w)) && all.size === 0;
}

/** Orden de las palabras que quedan (las de los grupos ya encontrados salen del tablero). */
export const remaining = (order, foundWords) => order.filter((w) => !foundWords.has(w));

/** Mezcla solo las que quedan: devuelve el orden completo nuevo (las encontradas quedan al final, no se ven). */
export function reshuffle(pz, order, foundWords, rnd) {
  const left = remaining(order, foundWords);
  let next = shuffle(rnd, left);
  // si por azar quedó igual, se rota para que "Mezclar" siempre se note
  if (left.length > 1 && next.every((w, i) => w === left[i])) next = [...next.slice(1), next[0]];
  return [...next, ...order.filter((w) => foundWords.has(w))];
}

/**
 * Rehace el estado a partir de las jugadas (cada una es una lista de 4 palabras en el orden en que se eligieron):
 * grupos encontrados (en orden de hallazgo), errores, combinaciones ya probadas y si terminó.
 */
export function derive(pz, picks) {
  const found = [];
  const tried = new Set();
  let mistakes = 0;
  for (const p of picks) {
    if (found.length === 4 || mistakes >= MISTAKES) break;
    tried.add(comboKey(p));
    const r = checkSelection(pz, p);
    if (r.ok) {
      if (!found.includes(r.group)) found.push(r.group);
    } else mistakes++;
  }
  const won = found.length === 4;
  const lost = !won && mistakes >= MISTAKES;
  return { found, mistakes, tried, won, lost, over: won || lost };
}

/** ¿Son `picks` jugadas bien formadas del desafío? (4 palabras distintas que existen en él) */
export function validPicks(pz, picks) {
  const all = new Set(allWords(pz));
  return Array.isArray(picks) && picks.length <= 16 && picks.every((p) => Array.isArray(p) && p.length === 4 && new Set(p).size === 4 && p.every((w) => all.has(w)));
}

/** Grupos que faltan por mostrar al perder, del más fácil al más difícil. */
export const missing = (pz, found) =>
  pz.grupos
    .map((g, i) => [g, i])
    .filter(([, i]) => !found.includes(i))
    .sort((a, b) => a[0].nivel - b[0].nivel)
    .map(([, i]) => i);

/** Tamaño de letra (px) de una ficha según su palabra más larga: una sola vez, sin medir el DOM. */
export function fontSize(word) {
  const longest = Math.max(...String(word).split(/\s+/).map((t) => [...t].length));
  return Math.max(9, Math.min(17, Math.floor(66 / (0.6 * longest))));
}

/** Texto para compartir: título, errores y una fila de 4 cuadraditos por jugada (en el orden en que se eligieron). */
export function shareText({ pz, picks, mistakes, dayNo, name = 'Vínculos', lang = 'es', link = '' }) {
  const label = lang === 'en' ? 'mistakes' : 'errores';
  const rows = picks.map((p) => p.map((w) => SQUARES[levelOf(pz, w) - 1] ?? '⬜').join(''));
  return [`game.it · ${name} #${dayNo}`, `${label}: ${mistakes}`, '', ...rows, link].join('\n');
}
