/**
 * Mecha Corta — diccionario (compartido por el navegador y el servidor).
 *
 * Los archivos dict/{es,en}.txt tienen las palabras ordenadas con "codificación de prefijo" (cada
 * línea empieza con cuántas letras comparte con la anterior, en base 36). Se decodifican a un
 * arreglo ordenado y se busca con búsqueda binaria (sin armar un Set de 600 mil palabras).
 * Listas de palabras: an-array-of-spanish-words y an-array-of-english-words (licencia MIT).
 */
export const LANGS = ['es', 'en'];

/** Letras para la vida extra (las raras no cuentan). */
export const ALPHA = { es: 'abcdefghijlmnopqrstuvz', en: 'abcdefghijklmnopqrstuvwy' };

/** Mínimo de palabras que tienen que contener una sílaba para salir en cada dificultad. */
export const DIFF = { es: [0, 6000, 1500, 400], en: [0, 2500, 700, 200] };

/** Minúsculas, sin tildes (la ñ queda) y solo letras válidas del idioma. */
export function norm(w, lang = 'es') {
  const s = String(w || '')
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ');
  return lang === 'es' ? s.replace(/[^a-zñ]/g, '') : s.replace(/[^a-z]/g, '');
}

export function decode(text) {
  const lines = text.split('\n');
  const words = new Array(lines.length);
  let prev = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const w = prev.slice(0, parseInt(l[0], 36)) + l.slice(1);
    words[i] = w;
    prev = w;
  }
  return words;
}

export class Dict {
  /** words: arreglo ordenado; prompts: { n, list: [[sílaba, cantidad], …] } */
  constructor(lang, words, prompts) {
    this.lang = lang;
    this.words = words;
    this.prompts = prompts.list;
    this.count = new Map(prompts.list);
    this.pools = {};
  }

  has(w) {
    const a = this.words;
    let lo = 0;
    let hi = a.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const x = a[mid];
      if (x === w) return true;
      if (x < w) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  }

  /** Sílabas posibles para una dificultad (1 fácil … 3 difícil). */
  pool(diff) {
    if (!this.pools[diff]) {
      const min = DIFF[this.lang][diff] || DIFF[this.lang][2];
      this.pools[diff] = this.prompts.filter(([s, c]) => c >= min && !/[^a-z]/.test(s)).map(([s]) => s);
    }
    return this.pools[diff];
  }

  /** Cuántas palabras contienen la sílaba (para que la compu sepa si es difícil). */
  rarity(prompt) {
    return this.count.get(prompt) || 0;
  }

  /**
   * Busca palabras que contengan la sílaba y no se hayan usado. Recorre desde un lugar al azar y
   * junta hasta `max` candidatas.
   */
  find(prompt, used, rng, max = 24) {
    const a = this.words;
    const n = a.length;
    const start = Math.floor(rng() * n);
    const out = [];
    for (let k = 0; k < n && out.length < max; k++) {
      const w = a[(start + k) % n];
      if (w.includes(prompt) && !used.has(w)) out.push(w);
    }
    return out;
  }
}
