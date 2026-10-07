/**
 * Tibio — lógica pura (sin DOM): vectores int8, ranking por similitud y ayudas.
 * Los vectores salen de tools/daily/tibio-build.py (fastText reducido con PCA, ver data/LICENSE.txt).
 */

/** Pasa el buffer de vectores (N x dims, int8) a algo usable: la inversa de la norma de cada fila. */
export function prepare(buf, n, dims) {
  const vecs = buf instanceof Int8Array ? buf : new Int8Array(buf);
  if (vecs.length !== n * dims) throw new Error('vectores con tamaño incorrecto');
  const inv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * dims;
    for (let k = 0; k < dims; k++) s += vecs[o + k] * vecs[o + k];
    inv[i] = s ? 1 / Math.sqrt(s) : 0;
  }
  return { vecs, inv, n, dims };
}

/** Coseno entre dos palabras (por índice). */
export function cosine(m, a, b) {
  const { vecs, inv, dims } = m;
  let s = 0;
  for (let k = 0, oa = a * dims, ob = b * dims; k < dims; k++) s += vecs[oa + k] * vecs[ob + k];
  return s * inv[a] * inv[b];
}

/**
 * Ordena todo el vocabulario por cercanía a la palabra secreta.
 * Devuelve { order, rankOf }: order[r - 1] es el índice de la palabra en el puesto r y rankOf[i] el puesto (1 = el secreto) de la palabra i.
 * Los empates se desempatan por índice (más frecuente primero), así que el resultado es el mismo en todos los navegadores.
 */
export function rankAll(m, secret) {
  const { vecs, inv, n, dims } = m;
  const sims = new Float32Array(n);
  const so = secret * dims;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * dims;
    for (let k = 0; k < dims; k++) s += vecs[o + k] * vecs[so + k];
    sims[i] = s * inv[i];
  }
  sims[secret] = Infinity; // el secreto siempre es el puesto 1, aunque la cuantización lo empate
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => sims[b] - sims[a] || a - b);
  const rankOf = new Uint32Array(n);
  for (let r = 0; r < n; r++) rankOf[order[r]] = r + 1;
  return { order, rankOf };
}

// ---------------------------------------------------------------- presentación
export const TIERS = { near: 300, mid: 1500 };

/** 'near' (verde), 'mid' (ámbar) o 'far' (rojo) según el puesto. */
export const tier = (rank) => (rank <= TIERS.near ? 'near' : rank <= TIERS.mid ? 'mid' : 'far');

/** Largo de la barra (0..1) en escala logarítmica: el puesto 1 llena la barra y el último la deja casi vacía. */
export function bar(rank, n) {
  if (rank <= 1) return 1;
  return Math.max(0.02, 1 - Math.log(rank) / Math.log(Math.max(n, 3)));
}

/** Casilleros de colores para compartir: los `k` mejores puestos, de menor a mayor. */
export function squares(ranks, k = 8) {
  const mark = { near: '🟩', mid: '🟨', far: '🟥' };
  return [...ranks]
    .sort((a, b) => a - b)
    .slice(0, k)
    .map((r) => mark[tier(r)])
    .join('');
}

/** Casillero del histograma según los intentos usados (1..6). */
export const BUCKETS = [10, 25, 50, 100, 200];
export const bucket = (guesses) => {
  const i = BUCKETS.findIndex((m) => guesses <= m);
  return (i < 0 ? BUCKETS.length : i) + 1;
};

export const MAX_HINTS = 3;

/**
 * Puesto de la palabra que revela una pista: más o menos la mitad del mejor puesto actual (sin tener ninguno, 1000).
 * Busca hacia abajo (más lejos) y luego hacia arriba una palabra que no se haya probado; nunca devuelve el puesto 1.
 * `taken` es un Set de puestos ya probados. Devuelve 0 si no hay ninguna que mejore el mejor puesto.
 */
export function hintRank(best, taken, n) {
  const top = best && best < Infinity ? best : n;
  const goal = best && best < Infinity ? Math.max(2, Math.floor(best / 2)) : 1000;
  for (let d = 0; d < n; d++) {
    for (const r of d ? [goal + d, goal - d] : [goal]) {
      if (r >= 2 && r < top && !taken.has(r)) return r;
    }
  }
  return 0;
}
