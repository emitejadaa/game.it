/**
 * Chorrito — el motor, sin DOM: tubos con capas de colores, qué se puede trasvasar, cuándo está resuelto, el generador de niveles
 * (siempre con solución comprobada por el resolvedor) y el resolvedor que da las pistas y valida las carreras online.
 *
 * Un nivel es una lista de tubos; cada tubo es una lista de colores (números del 0 en adelante) de abajo hacia arriba y entran
 * como mucho `cap` capas. Trasvasar de A a B pasa la tanda de capas del mismo color que está arriba de A a B si B está vacío o
 * tiene arriba ese mismo color, hasta donde entre. Está resuelto cuando cada tubo está vacío o lleno de un solo color.
 */
export const CAP = 4;
export const MAX_COLORS = 12;

/** Generador con semilla (mulberry32) a partir de un número. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Un texto cualquiera (por ejemplo la fecha) a un número para la semilla. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clone = (tubes) => tubes.map((t) => t.slice());

/** El color de arriba de un tubo y cuántas capas seguidas hay de ese color (o { color: -1, n: 0 } si está vacío). */
export function topRun(tube) {
  if (!tube.length) return { color: -1, n: 0 };
  const c = tube[tube.length - 1];
  let n = 1;
  while (n < tube.length && tube[tube.length - 1 - n] === c) n++;
  return { color: c, n };
}

/** ¿Se puede trasvasar de `a` a `b`? Devuelve cuántas capas pasarían (0 si no se puede). */
export function amount(tubes, a, b, cap = CAP) {
  if (a === b || a < 0 || b < 0 || a >= tubes.length || b >= tubes.length) return 0;
  const A = tubes[a], B = tubes[b];
  if (!A.length || B.length >= cap) return 0;
  const { color, n } = topRun(A);
  if (B.length && B[B.length - 1] !== color) return 0;
  return Math.min(n, cap - B.length);
}

/** Trasvasa (cambia los tubos). Devuelve cuántas capas pasaron (0 si no se podía). */
export function pour(tubes, a, b, cap = CAP) {
  const k = amount(tubes, a, b, cap);
  if (!k) return 0;
  const c = tubes[a][tubes[a].length - 1];
  for (let i = 0; i < k; i++) {
    tubes[a].pop();
    tubes[b].push(c);
  }
  return k;
}

const full = (t, cap) => t.length === cap && t.every((c) => c === t[0]);
export function isSolved(tubes, cap = CAP) {
  return tubes.every((t) => t.length === 0 || full(t, cap));
}
/** Cuántos tubos ya están completos (llenos de un solo color). */
export const doneCount = (tubes, cap = CAP) => tubes.filter((t) => full(t, cap)).length;
/**
 * Cuánto se ordenó: de cada color, la tanda más larga que arranca desde el fondo de algún tubo. Con todo resuelto da
 * `cap` × colores; sirve de avance en las carreras (más fino que contar tubos completos).
 */
export function settled(tubes) {
  const best = new Map();
  for (const t of tubes) {
    if (!t.length) continue;
    let n = 1;
    while (n < t.length && t[n] === t[0]) n++;
    best.set(t[0], Math.max(best.get(t[0]) || 0, n));
  }
  let s = 0;
  for (const v of best.values()) s += v;
  return s;
}

/** Los trasvases con sentido: se descartan los que no cambian nada (de un tubo ya completo, o pasar un tubo parejo a uno vacío). */
export function legalMoves(tubes, cap = CAP) {
  const out = [];
  for (let a = 0; a < tubes.length; a++) {
    const A = tubes[a];
    if (!A.length || full(A, cap)) continue;
    const uniform = A.every((c) => c === A[0]);
    for (let b = 0; b < tubes.length; b++) {
      if (!amount(tubes, a, b, cap)) continue;
      if (uniform && !tubes[b].length) continue; // un tubo parejo a otro vacío: solo lo cambia de lugar
      out.push([a, b]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- resolvedor
const keyOf = (tubes) => tubes.map((t) => t.join(',')).sort().join('|');
/** Cuántas tandas de colores seguidos hay en total, menos los colores: cada trasvase baja eso como mucho en uno. */
function blocks(tubes) {
  let b = 0;
  const colors = new Set();
  for (const t of tubes) {
    for (let i = 0; i < t.length; i++) {
      colors.add(t[i]);
      if (i === 0 || t[i] !== t[i - 1]) b++;
    }
  }
  return b - colors.size;
}

class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Busca una secuencia de trasvases que resuelva los tubos (búsqueda A* con peso: no siempre es la más corta, pero casi).
 * Devuelve [[a, b], …] (vacía si ya está resuelto) o null si no encontró en `maxNodes` estados.
 */
export function solve(tubes0, cap = CAP, { maxNodes = 60000, weight = 2 } = {}) {
  if (isSolved(tubes0, cap)) return [];
  const start = clone(tubes0);
  const heap = new Heap();
  const seen = new Map();
  seen.set(keyOf(start), 0);
  heap.push({ f: weight * blocks(start), g: 0, tubes: start, path: null });
  let nodes = 0;
  while (heap.size && nodes < maxNodes) {
    const cur = heap.pop();
    nodes++;
    for (const [a, b] of legalMoves(cur.tubes, cap)) {
      const next = clone(cur.tubes);
      pour(next, a, b, cap);
      const g = cur.g + 1;
      const k = keyOf(next);
      const prev = seen.get(k);
      if (prev !== undefined && prev <= g) continue;
      seen.set(k, g);
      const node = { f: g + weight * blocks(next), g, tubes: next, path: { move: [a, b], prev: cur.path } };
      if (isSolved(next, cap)) {
        const out = [];
        for (let p = node.path; p; p = p.prev) out.push(p.move);
        return out.reverse();
      }
      heap.push(node);
    }
  }
  return null;
}

// ---------------------------------------------------------------- niveles
/**
 * Un nivel: `colors` colores con `cap` capas cada uno, repartidos al azar en `colors` tubos llenos y `extra` vacíos. Con la misma
 * semilla sale siempre el mismo. Se descartan los que salen resueltos de entrada y los que el resolvedor no puede resolver.
 * Devuelve { tubes, cap, par } con `par` = cuántos trasvases usó el resolvedor (sirve de referencia para las estrellas).
 */
export function generate(seed, { colors = 4, extra = 2, cap = CAP } = {}) {
  colors = Math.max(2, Math.min(MAX_COLORS, colors));
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = rng((seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0);
    const units = [];
    for (let c = 0; c < colors; c++) for (let i = 0; i < cap; i++) units.push(c);
    for (let i = units.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [units[i], units[j]] = [units[j], units[i]];
    }
    const tubes = [];
    for (let t = 0; t < colors; t++) tubes.push(units.slice(t * cap, (t + 1) * cap));
    for (let e = 0; e < extra; e++) tubes.push([]);
    // que no empiece con tubos ya terminados
    if (tubes.some((t) => full(t, cap))) continue;
    const sol = solve(tubes, cap, { maxNodes: 40000 });
    if (!sol) continue;
    return { tubes, cap, par: sol.length };
  }
  // por las dudas (casi imposible): un nivel armado a mano que siempre tiene solución
  const tubes = [];
  for (let c = 0; c < colors; c++) tubes.push(Array.from({ length: cap }, (_, i) => (c + (i % 2 ? 1 : 0)) % colors));
  for (let e = 0; e < extra; e++) tubes.push([]);
  const sol = solve(tubes, cap, { maxNodes: 60000 }) || [];
  return { tubes, cap, par: sol.length };
}

/** Los trasvases como texto (dos letras por trasvase: a = tubo 0, b = tubo 1…), para mandarlos al servidor. */
export const encodeMoves = (moves) => moves.map(([a, b]) => String.fromCharCode(97 + a, 97 + b)).join('');
export function decodeMoves(str) {
  if (typeof str !== 'string' || str.length % 2) return null;
  const out = [];
  for (let i = 0; i < str.length; i += 2) {
    const a = str.charCodeAt(i) - 97, b = str.charCodeAt(i + 1) - 97;
    if (a < 0 || a > 25 || b < 0 || b > 25) return null;
    out.push([a, b]);
  }
  return out;
}

/** Rehace una partida con los trasvases dados (texto): { ok, moves, solved }. `ok` es falso si alguno no se podía. */
export function replay(tubes0, movesStr, cap = CAP, { max = 4000 } = {}) {
  const moves = decodeMoves(movesStr);
  if (!moves || moves.length > max) return { ok: false, moves: 0, solved: false };
  const tubes = clone(tubes0);
  for (const [a, b] of moves) if (!pour(tubes, a, b, cap)) return { ok: false, moves: 0, solved: false };
  return { ok: true, moves: moves.length, solved: isSolved(tubes, cap) };
}

/** Cuántos colores tiene el nivel `n` (1, 2, …): de 3 a 12, subiendo de a uno cada dos niveles. */
export const colorsFor = (n) => Math.max(3, Math.min(MAX_COLORS, 3 + Math.floor((Math.max(1, n) - 1) / 2)));
/** Cuántos tubos vacíos tiene el nivel `n`: dos, y de a uno solo los más difíciles (de 25 para arriba, cada tanto). */
export const extraFor = (n) => (n >= 25 && n % 5 === 0 ? 1 : 2);
/** Los datos del nivel `n` para generar(). */
export const levelOf = (n) => ({ seed: hashSeed(`chorrito-level-${n}`), colors: colorsFor(n), extra: extraFor(n) });

/** Estrellas según cuánto se parece lo que se hizo a lo que encontró el resolvedor. */
export function stars(moves, par) {
  if (!par) return 3;
  if (moves <= Math.ceil(par * 1.2) + 1) return 3;
  if (moves <= Math.ceil(par * 1.8) + 2) return 2;
  return 1;
}
