/**
 * Colmena — lógica pura (sin DOM): puntos, panagramas, rangos y filtrado de respuestas.
 * Se usa en el navegador y en las pruebas / el generador de tools/daily/colmena-gen.mjs.
 */
export const MIN_LEN = 4;
export const PANGRAM_BONUS = 7;
export const LETTERS = 7;

/** Rangos en % del máximo de puntos posible; el 3.º (Genial) es el que cuenta como victoria. */
export const RANKS = [0, 5, 15, 30, 50, 70, 100];
export const WIN_IDX = 3; // índice del rango Genial (0 = Novato): desde ahí el día cuenta como ganado

/** Minúsculas, sin tildes (la ñ se conserva) y solo letras válidas del idioma. */
export function norm(w, lang = 'es') {
  const s = String(w || '')
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ');
  return lang === 'es' ? s.replace(/[^a-zñ]/g, '') : s.replace(/[^a-z]/g, '');
}

/** ¿La palabra usa solo `letters` (cadena de 7) y contiene `center`? (y tiene el largo mínimo). */
export function fits(w, letters, center) {
  if (w.length < MIN_LEN || !w.includes(center)) return false;
  for (let i = 0; i < w.length; i++) if (!letters.includes(w[i])) return false;
  return true;
}

export function isPangram(w, letters) {
  for (let i = 0; i < letters.length; i++) if (!w.includes(letters[i])) return false;
  return true;
}

/** 4 letras = 1 punto; más largas = su largo; panagrama = largo + 7. */
export function scoreWord(w, letters) {
  const base = w.length === MIN_LEN ? 1 : w.length;
  return isPangram(w, letters) ? base + PANGRAM_BONUS : base;
}

/** Todas las palabras de la lista que valen para el panal (la lista ya viene ordenada). */
export function answersFor(words, letters, center) {
  const out = [];
  for (let i = 0; i < words.length; i++) if (fits(words[i], letters, center)) out.push(words[i]);
  return out;
}

export const totalPoints = (answers, letters) => answers.reduce((s, w) => s + scoreWord(w, letters), 0);

/** Puntos que hay que juntar para cada rango (el último, "Panal completo", es el 100 % redondeado hacia arriba). */
export const thresholds = (max) => RANKS.map((p) => Math.ceil((max * p) / 100));

/** Rango alcanzado con `points`: índice 0…6 (0 = Novato). */
export function rankIndex(points, max) {
  const t = thresholds(max);
  let r = 0;
  for (let i = 1; i < t.length; i++) if (points >= t[i]) r = i;
  return r;
}

/**
 * Recorre el diccionario completo de Mecha Corta (codificado por prefijos, ver mecha/shared/dict.js) y devuelve solo las
 * palabras que valen para el panal. Así no hace falta armar un arreglo de 600 mil palabras para validar las "rebuscadas".
 */
export function scanDict(text, letters, center) {
  const out = [];
  let prev = '';
  let from = 0;
  const n = text.length;
  while (from <= n) {
    let end = text.indexOf('\n', from);
    if (end < 0) end = n;
    // la primera letra (base 36) es cuántas letras comparte con la palabra anterior
    const w = prev.slice(0, parseInt(text[from], 36)) + text.slice(from + 1, end);
    prev = w;
    if (fits(w, letters, center)) out.push(w);
    from = end + 1;
  }
  return out;
}
