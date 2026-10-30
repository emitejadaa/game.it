/**
 * Gemas — los niveles. Cada nivel sale de su número (semilla, tipo de objetivo, colores, hielo) y se calibra jugándolo con
 * la compu (que elige sin espiar lo que va a caer): las metas son una parte de lo que ella consigue, así que todos se
 * pueden pasar, y se van ajustando a medida que se avanza. Tres tipos de objetivo, uno detrás del otro:
 *   - puntos: llegar a un puntaje en las jugadas que hay (se juegan todas);
 *   - juntar: borrar cierta cantidad de gemas de dos o tres colores;
 *   - hielo: romper todo el hielo (hay casilleros con una o dos capas, que se rompen borrando gemas encima).
 * En los de juntar y hielo, al cumplir el objetivo las jugadas que sobran se vuelven rayos que explotan y suman puntos.
 * Las estrellas salen del puntaje final.
 */
import { Game, N, Rng, hashSeed, bestMove, idx, MAX_TYPES } from './engine.js';

export const KINDS = ['score', 'collect', 'ice'];
const round50 = (v) => Math.max(50, Math.round(v / 50) * 50);

/** Dibujos de hielo (simétricos) y cuál le toca a cada nivel. */
const PATTERNS = [
  (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5, // centro
  (r, c) => r >= 6, // fondo
  (r, c) => ((r === 1 || r === 6) && c >= 1 && c <= 6) || ((c === 1 || c === 6) && r >= 1 && r <= 6), // marco
  (r, c) => r === c || r + c === N - 1, // equis
  (r, c) => (r === 3 || r === 4) && c >= 1 && c <= 6, // banda
  (r, c) => (r < 2 || r > 5) && (c < 2 || c > 5), // esquinas
  (r, c) => (r + Math.min(c, N - 1 - c)) % 2 === 0 && r >= 1 && r <= 6 && c >= 1 && c <= 6, // zigzag (simétrico)
  (r, c) => r === 3 || r === 4 || c === 3 || c === 4, // cruz
  (r, c) => ((r >= 1 && r <= 2) || (r >= 5 && r <= 6)) && c >= 1 && c <= 6, // dos bandas
];
/** Las capas de hielo del nivel `n`: el dibujo y, más adelante, dobles en una parte (cada vez más). */
export function iceFor(n, variant = 0) {
  const p = PATTERNS[(Math.floor((n - 3) / 3) + variant) % PATTERNS.length];
  const ice = new Array(N * N).fill(0);
  const double = n >= 15 && variant < 2 ? Math.min(0.6, 0.15 + (n - 15) * 0.012) : 0;
  const r = new Rng(hashSeed(`gemas-ice-${n}-${variant}`));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!p(y, x)) continue;
      // las dobles van de a pares simétricos, para que el dibujo siga parejo
      if (x < N / 2) {
        const two = r.next() < double ? 2 : 1;
        ice[idx(y, x)] = two;
        if (p(y, N - 1 - x)) ice[idx(y, N - 1 - x)] = two;
      } else if (!p(y, N - 1 - x)) ice[idx(y, x)] = 1;
    }
  return ice;
}

/** ¿Se cumplió el objetivo del nivel? */
export function goalMet(level, g) {
  if (level.kind === 'score') return g.score >= level.goal.score;
  if (level.kind === 'collect') return level.goal.collect.every(([k, n]) => g.collected[k] >= n);
  if (level.kind === 'ice') return g.iceLeft === 0;
  return false;
}

/**
 * Juega un nivel con la compu, con las reglas de verdad: hasta cumplir (o quedarse sin jugadas) y el final con rayos.
 * `stream` distinto de 0 cambia las gemas que van cayendo (el tablero de entrada es el mismo): así la calibración no depende
 * de la suerte de una sola partida.
 */
export function botRun(level, want = {}, { all = false, stream = 0, moves = level.moves } = {}) {
  const g = new Game(level.seed, { types: level.types, ice: level.ice });
  if (stream) g.rng = new Rng(hashSeed(`${level.seed}:s${stream}`));
  let doneAt = 0;
  for (let m = 0; m < moves; m++) {
    const mv = bestMove(g, want);
    if (!mv) break;
    g.swap(mv[0], mv[1]);
    if (!all && level.goal && goalMet(level, g)) {
      doneAt = g.moves;
      break;
    }
  }
  if (!all && doneAt && level.kind !== 'score') for (let k = g.moves; k < moves; k++) if (!g.bonusLine()) break;
  return { g, doneAt };
}

const STREAMS = 5;
const runs = (level, want, opts) => Array.from({ length: STREAMS }, (_, k) => botRun(level, want, { ...opts, stream: k }));
const sorted = (arr) => arr.slice().sort((a, b) => a - b);
const low = (arr) => sorted(arr)[1]; // el segundo peor de cinco
const mid = (arr) => sorted(arr)[2];

const cache = new Map();
/**
 * Los datos del nivel `n`: { n, seed, kind, types, moves, ice, goal, stars: [tres puntajes] }. `goal` es { score } o
 * { collect: [[color, cantidad], …] } o { ice: capas }.
 */
export function levelOf(n) {
  n = Math.max(1, Math.floor(n));
  if (cache.has(n)) return cache.get(n);
  const seed = hashSeed(`gemas-level-${n}`);
  const r = new Rng(seed ^ 0x2545f491);
  const kind = KINDS[(n - 1) % 3];
  const types = n <= 3 ? 5 : MAX_TYPES;
  const tight = Math.min(1, (n - 1) / 45); // de 0 a 1 a lo largo de los primeros 45
  const level = { n, seed, kind, types, moves: 0, ice: null, goal: null, stars: [0, 0, 0] };
  if (kind === 'score') {
    level.moves = 18 + ((n * 7) % 4) * 2;
    const scores = runs(level, {}, { all: true }).map((x) => x.g.score);
    level.goal = { score: round50(low(scores) * (0.7 + 0.15 * tight)) };
    level.stars = [level.goal.score, round50(mid(scores) * (0.95 + 0.1 * tight)), round50(mid(scores) * (1.2 + 0.1 * tight))];
  } else if (kind === 'collect') {
    level.moves = 20 + ((n * 5) % 3) * 2;
    const colors = [];
    while (colors.length < (n < 12 ? 2 : 3)) {
      const k = r.int(types);
      if (!colors.includes(k)) colors.push(k);
    }
    colors.sort((a, b) => a - b);
    const want = { colors: Object.fromEntries(colors.map((k) => [k, 18])) };
    const probes = runs(level, want, { all: true }).map((x) => x.g);
    let f = 0.62 + 0.18 * tight;
    let finals = [];
    for (let tries = 0; tries < 4; tries++) {
      level.goal = { collect: colors.map((k) => [k, Math.max(6, Math.floor(low(probes.map((g) => g.collected[k])) * f))]) };
      finals = runs(level, want).filter((x) => x.doneAt);
      if (finals.length >= 3) break;
      f *= 0.85;
    }
    const sc = finals.map((x) => x.g.score);
    level.stars = [0, round50(mid(sc.concat(sc)) * (0.75 + 0.15 * tight)), round50(mid(sc.concat(sc)) * (1.05 + 0.15 * tight))];
  } else {
    // hielo: el dibujo del nivel, y si a la compu le cuesta demasiado, uno más liviano
    let need = 0;
    for (let variant = 0; variant < 4 && !need; variant++) {
      level.ice = variant < 3 ? iceFor(n, variant) : iceFor(3, 0);
      level.goal = { ice: level.ice.reduce((a, b) => a + b, 0) };
      const done = runs(level, { ice: 45 }, { moves: 60 }).map((x) => x.doneAt || 999);
      const d = sorted(done)[STREAMS - 1]; // lo que tardó la más lenta de las cinco
      if (d <= 34 || variant === 3) need = Math.min(d, 34);
    }
    level.moves = Math.max(14, Math.min(48, Math.ceil(need * (1.3 - 0.15 * tight)) + 2));
    const finals = runs(level, { ice: 45 }).filter((x) => x.doneAt);
    const sc = finals.length ? finals.map((x) => x.g.score) : [1000];
    level.stars = [0, round50(mid(sc.concat(sc)) * (0.75 + 0.15 * tight)), round50(mid(sc.concat(sc)) * (1.05 + 0.15 * tight))];
  }
  cache.set(n, level);
  return level;
}

/** Estrellas de un puntaje (0 a 3) según los umbrales; en los niveles de juntar y hielo, cumplir ya vale una. */
export function starsFor(level, score, met = true) {
  if (!met) return 0;
  let s = level.kind === 'score' ? 0 : 1;
  if (level.kind === 'score' && score >= level.stars[0]) s = 1;
  if (score >= level.stars[1]) s = Math.max(s, 2);
  if (score >= level.stars[2]) s = 3;
  return s;
}

/** Las gemas del día: 25 jugadas, seis colores, y estrellas según lo que consigue la compu con esas mismas gemas. */
export function dailyLevel(date) {
  const key = `daily:${date}`;
  if (cache.has(key)) return cache.get(key);
  const level = { n: 0, seed: hashSeed(`gemas-daily-${date}`), kind: 'score', types: MAX_TYPES, moves: 25, ice: null, goal: { score: 0 }, stars: [0, 0, 0] };
  const scores = runs(level, {}, { all: true }).map((x) => x.g.score);
  level.stars = [round50(low(scores) * 0.6), round50(mid(scores) * 0.9), round50(mid(scores) * 1.2)];
  level.goal.score = level.stars[0];
  cache.set(key, level);
  return level;
}
