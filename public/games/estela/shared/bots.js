/**
 * Estela — bots. En cada paso miran siempre las celdas de adelante (para no chocar de tonto) y cada
 * `every` pasos evalúan seguir derecho, doblar a la izquierda o a la derecha: gana la opción con más
 * celdas alcanzables (relleno acotado, así no se meten en callejones) más un empujón por intentar
 * cortarle el paso a la cabeza enemiga más cercana. Tres niveles: más viveza, más alcance, más agresividad.
 * Todo usa el azar del mundo (`w.rnd`): mismo mundo + mismas entradas = mismas partidas.
 */
import { DX, DY } from './world.js';

export const BOT_NAMES = ['Volt', 'Nova', 'Pixel', 'Zeta', 'Kilo', 'Orbe', 'Arco', 'Rayo', 'Eco', 'Lince', 'Fénix', 'Cometa', 'Iris', 'Onda', 'Neón', 'Átomo', 'Quark', 'Bruma', 'Sigma', 'Delta', 'Hielo', 'Brasa', 'Lumen', 'Trazo', 'Vector', 'Gamma', 'Tango', 'Boreal', 'Salto', 'Chispa'];

// limit: celdas que cuenta el relleno · every: cada cuántos pasos decide · err: chance de elegir mal (siempre una opción libre)
const LEVELS = [
  { limit: 60, every: 3, err: 0.1, aggr: 0, turbo: 0 },
  { limit: 120, every: 2, err: 0.04, aggr: 0.6, turbo: 0.25 },
  { limit: 200, every: 1, err: 0, aggr: 1, turbo: 0.7 },
];

export function brain(level, rnd) {
  const L = LEVELS[Math.max(1, Math.min(3, level)) - 1];
  return { level, ...L, next: Math.floor(rnd() * L.every), target: null };
}

let scratch = null;

/** Cuántas celdas libres se alcanzan desde (sx, sy), contando hasta `limit` (búsqueda en anchura). */
function flood(w, sx, sy, limit) {
  const n = w.size;
  const g = w.grid;
  if (!scratch || scratch.stamp.length !== n * n) scratch = { stamp: new Int32Array(n * n), q: new Int32Array(2048), mark: 0 };
  const { stamp, q } = scratch;
  const mark = ++scratch.mark;
  let head = 0;
  let tail = 0;
  let count = 0;
  const start = sy * n + sx;
  stamp[start] = mark;
  q[tail++] = start;
  while (head < tail && count < limit) {
    const c = q[head++];
    count++;
    const x = c % n;
    const y = (c - x) / n;
    if (y > 0 && stamp[c - n] !== mark && !g[c - n]) (stamp[c - n] = mark), (q[tail++] = c - n);
    if (x < n - 1 && stamp[c + 1] !== mark && !g[c + 1]) (stamp[c + 1] = mark), (q[tail++] = c + 1);
    if (y < n - 1 && stamp[c + n] !== mark && !g[c + n]) (stamp[c + n] = mark), (q[tail++] = c + n);
    if (x > 0 && stamp[c - 1] !== mark && !g[c - 1]) (stamp[c - 1] = mark), (q[tail++] = c - 1);
  }
  return count;
}

export function think(w, p, b) {
  if (!p.alive) return;
  const n = w.size;
  const g = w.grid;
  // con escudo las estelas no molestan (hasta que está por terminar); las paredes siempre
  const ghost = p.shield > 3;
  const bad = (x, y) => x < 0 || y < 0 || x >= n || y >= n || (!ghost && g[y * n + x] !== 0);
  const reach = p.turboWant ? 3 : 2;
  let danger = false;
  for (let k = 1; k <= reach && !danger; k++) danger = bad(p.x + DX[p.dir] * k, p.y + DY[p.dir] * k);
  if (!danger && w.tick < b.next) return;
  b.next = w.tick + b.every;

  // la cabeza enemiga más cercana
  let foe = null;
  let fd = 1e9;
  if (b.aggr) {
    for (const q of w.players.values()) {
      if (q === p || !q.alive) continue;
      const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      if (d < fd) {
        fd = d;
        foe = q;
      }
    }
  }
  let tx = 0;
  let ty = 0;
  const chase = foe && fd <= 30;
  if (chase) {
    const lead = Math.min(6, fd >> 1);
    tx = foe.x + DX[foe.dir] * lead;
    ty = foe.y + DY[foe.dir] * lead;
  }

  const opts = [p.dir, (p.dir + 3) & 3, (p.dir + 1) & 3];
  const free = [];
  for (const d of opts) {
    const nx = p.x + DX[d];
    const ny = p.y + DY[d];
    if (bad(nx, ny)) continue;
    const open = flood(w, nx, ny, b.limit);
    // cuántas celdas libres hay en línea recta (para doblar antes de llegar a una pared)
    let ray = 0;
    while (ray < 10 && !bad(nx + DX[d] * ray, ny + DY[d] * ray)) ray++;
    let score = open + ray * 0.6 + (d === p.dir ? 5 : 0) + w.rnd() * 4;
    if (foe) {
      // no meterse delante de una cabeza que viene de frente
      const hx = foe.x + DX[foe.dir];
      const hy = foe.y + DY[foe.dir];
      const near = Math.abs(nx - hx) + Math.abs(ny - hy);
      if (near === 0) score -= 80;
      else if (near === 1 && b.level >= 2) score -= 25;
      if (chase && open >= b.limit * 0.6) score += b.aggr * (fd - (Math.abs(nx - tx) + Math.abs(ny - ty))) * 2.5;
    }
    free.push([d, score, open]);
  }
  if (!free.length) return; // sin salida: sigue derecho y se acabó
  let pick = free[0];
  if (b.err && free.length > 1 && w.rnd() < b.err) pick = free[1 + Math.floor(w.rnd() * (free.length - 1))];
  else for (const f of free) if (f[1] > pick[1]) pick = f;
  const d = pick[0];
  // turbo: para perseguir en campo abierto; nunca si la segunda celda está tapada
  let turbo = 0;
  if (b.turbo && chase && fd <= 14 && p.energy > 30 && pick[2] >= b.limit * 0.8 && w.rnd() < b.turbo) turbo = 1;
  if (turbo && bad(p.x + DX[d] * 2, p.y + DY[d] * 2)) turbo = 0;
  w.steer(p, d === p.dir ? -1 : d, turbo);
}
