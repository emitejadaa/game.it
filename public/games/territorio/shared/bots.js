/**
 * Territorio — bots. Estrategia de rectángulo: salen `k` celdas, giran hacia un costado, vuelven y entran al
 * territorio por la misma columna; `k` crece mientras no haya peligro. Reglas de supervivencia (en todos los niveles):
 *  - jamás pisan su propia estela ni se van del mapa si hay otra celda libre;
 *  - si una cabeza enemiga está más cerca de su estela que ellos de su casa, abandonan el plan y vuelven (BFS);
 *  - (niveles 2 y 3) atacan estelas ajenas que pueden alcanzar antes de que su dueño llegue a casa, y evitan los
 *    choques de frente afuera de su territorio.
 * Tres niveles: 1 distraído (rectángulos chicos, reacciona tarde, no ataca), 2 atento, 3 agresivo con rectángulos grandes.
 * Todo usa el azar del mundo (`w.rnd`): mismo mundo + mismas entradas = mismas partidas.
 */
import { DX, DY } from './world.js';

export const BOT_NAMES = ['Volt', 'Nova', 'Pixel', 'Zeta', 'Kilo', 'Orbe', 'Arco', 'Rayo', 'Eco', 'Lince', 'Fénix', 'Cometa', 'Iris', 'Onda', 'Neón', 'Átomo', 'Quark', 'Bruma', 'Sigma', 'Delta', 'Hielo', 'Brasa', 'Lumen', 'Trazo', 'Vector', 'Gamma', 'Tango', 'Boreal', 'Salto', 'Chispa'];

// k0/kMin/kMax: largo de la salida · react: distancia a la que ven venir al enemigo (se suma al margen) ·
// attack: alcance para atacar (0 = no ataca) · sloppy: chance de salir distraído (sin vigilar al enemigo)
const LEVELS = [
  { k0: 3, kMin: 2, kMax: 8, margin: -2, attack: 0, sloppy: 0.2, heads: false },
  { k0: 4, kMin: 3, kMax: 16, margin: 1, attack: 10, sloppy: 0.05, heads: true },
  { k0: 5, kMin: 4, kMax: 26, margin: 2, attack: 18, sloppy: 0, heads: true },
];

export function brain(level, rnd) {
  const L = LEVELS[Math.max(1, Math.min(3, level)) - 1];
  return { level, ...L, k: L.k0, mode: 'plan', legs: [], leg: 0, rem: 0, good: true, careless: false, next: Math.floor(rnd() * 2) };
}

const opp = (d) => (d + 2) & 3;
let scratch = null;

function ensure(n) {
  if (!scratch || scratch.stamp.length !== n * n) {
    scratch = { stamp: new Int32Array(n * n), dist: new Int16Array(n * n), first: new Int8Array(n * n), q: new Int32Array(n * n), mark: 0 };
  }
  return scratch;
}

/**
 * Camino más corto (sin pisar la estela propia) desde (sx, sy) —yendo hacia `sdir`— hasta una celda del propio
 * territorio: { dist, dir } (dir = primer paso) o null si no hay camino. La celda de partida puede no ser todavía estela.
 */
function bfsFrom(w, p, sx, sy, sdir, limit = 3000) {
  const n = w.size;
  const { stamp, dist, first, q } = ensure(n);
  const mark = ++scratch.mark;
  const start = sy * n + sx;
  let head = 0;
  let tail = 0;
  stamp[start] = mark;
  dist[start] = 0;
  q[tail++] = start;
  if (w.owner[start] === p.num) return { dist: 0, dir: sdir };
  const order = [sdir, (sdir + 1) & 3, (sdir + 3) & 3, opp(sdir)]; // seguir derecho primero: caminos prolijos
  while (head < tail && tail < limit) {
    const c = q[head++];
    const x = c % n;
    const y = (c - x) / n;
    for (let i = 0; i < 4; i++) {
      const d = order[i];
      if (c === start && d === opp(sdir)) continue; // no hay vuelta en U
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const nc = ny * n + nx;
      if (stamp[nc] === mark || w.trailAt[nc] === p.num) continue;
      stamp[nc] = mark;
      dist[nc] = dist[c] + 1;
      first[nc] = c === start ? d : first[c];
      if (w.owner[nc] === p.num) return { dist: dist[nc], dir: first[nc] };
      q[tail++] = nc;
    }
  }
  return null;
}

const bfsHome = (w, p) => bfsFrom(w, p, p.x, p.y, p.dir);

/** ¿Las `k` celdas desde (x, y) en la dirección d son libres (dentro del mapa y sin mi estela)? Devuelve cuántas. */
function runFree(w, p, x, y, d, k) {
  const n = w.size;
  let i = 0;
  while (i < k) {
    const nx = x + DX[d] * (i + 1);
    const ny = y + DY[d] * (i + 1);
    if (nx < 0 || ny < 0 || nx >= n || ny >= n || w.trailAt[ny * n + nx] === p.num) break;
    i++;
  }
  return i;
}

/** Arma un rectángulo desde la cabeza (adentro del territorio): [{ d, n }, …] o null si no entra ninguno. */
function makePlan(w, p, b) {
  const n = w.size;
  const own = w.owner;
  let best = null;
  let bestScore = -1;
  for (let t = 0; t < 10; t++) {
    const d = (p.dir + [0, 1, 3][Math.floor(w.rnd() * 3)]) & 3; // nunca la vuelta en U
    // pasos que faltan para salir del territorio por d
    let j = 1;
    while (true) {
      const x = p.x + DX[d] * j;
      const y = p.y + DY[d] * j;
      if (x < 0 || y < 0 || x >= n || y >= n) {
        j = 0;
        break;
      }
      if (own[y * n + x] !== p.num) break;
      j++;
    }
    if (j === 0) continue;
    const fx = p.x + DX[d] * j;
    const fy = p.y + DY[d] * j;
    const want = Math.max(b.kMin, Math.min(b.k, b.kMax));
    const kk = 1 + runFree(w, p, fx, fy, d, want - 1); // celdas afuera (la primera ya se vio libre)
    if (kk < 2) continue;
    const tx = p.x + DX[d] * (j + kk - 1);
    const ty = p.y + DY[d] * (j + kk - 1);
    const s = (d + (w.rnd() < 0.5 ? 1 : 3)) & 3;
    const room = runFree(w, p, tx, ty, s, Math.max(2, Math.round(kk * (0.6 + w.rnd() * 0.9))));
    if (room < 2) continue;
    // la vuelta: desde (tx + m·s, ty + m·s) hacia atrás hasta pisar territorio propio por una columna libre
    for (let m = room; m >= 2; m--) {
      const bx = tx + DX[s] * m;
      const by = ty + DY[s] * m;
      let back = 0;
      let ok = false;
      for (let i = 1; i <= j + kk + 1; i++) {
        const x = bx - DX[d] * i;
        const y = by - DY[d] * i;
        if (x < 0 || y < 0 || x >= n || y >= n || w.trailAt[y * n + x] === p.num) break;
        back = i;
        if (own[y * n + x] === p.num) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
      const score = kk * m + w.rnd() * 3;
      if (score > bestScore) {
        bestScore = score;
        best = [
          { d, n: j + kk - 1 },
          { d: s, n: m },
          { d: opp(d), n: back },
        ];
      }
      break;
    }
  }
  return best;
}

/** La presa: celda de una estela ajena que alcanzo antes de que su dueño llegue a casa. */
function findPrey(w, p, b) {
  let best = null;
  let bestD = b.attack + 1;
  for (const q of w.players.values()) {
    if (q === p || !q.alive || !q.out || !q.trail.length) continue;
    const dq = Math.abs(q.x - q.verts[0]) + Math.abs(q.y - q.verts[1]); // cuánto le falta al dueño para volver
    const step = q.trail.length > 40 ? 3 : 2;
    for (let i = 0; i < q.trail.length; i += step) {
      const c = q.trail[i];
      const cx = c % w.size;
      const cy = (c - cx) / w.size;
      const dm = Math.abs(cx - p.x) + Math.abs(cy - p.y);
      if (dm < bestD && dm + 1 < dq) {
        bestD = dm;
        best = { x: cx, y: cy, q: q.num };
      }
    }
  }
  return best;
}

/** ¿Algún enemigo llega a mi estela antes (o casi) de lo que yo llego a casa? */
function threatened(w, p, b, dHome) {
  const lim = dHome + b.margin;
  const n = w.size;
  for (const q of w.players.values()) {
    if (q === p || !q.alive) continue;
    if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) > lim + p.trail.length + 2) continue;
    for (let i = p.trail.length - 1; i >= 0; i--) {
      const c = p.trail[i];
      const cx = c % n;
      const cy = (c - cx) / n;
      if (Math.abs(q.x - cx) + Math.abs(q.y - cy) <= lim) return true;
    }
  }
  return false;
}

/** ¿Hay una cabeza enemiga que pueda llegar a (x, y) en este paso? (choque de frente) */
function headNear(w, p, x, y) {
  for (const q of w.players.values()) {
    if (q === p || !q.alive) continue;
    if (Math.abs(q.x - x) + Math.abs(q.y - y) <= 1) return true;
  }
  return false;
}

export function think(w, p, b) {
  if (!p.alive) return;
  const n = w.size;
  const own = w.owner;
  const free = (x, y) => x >= 0 && y >= 0 && x < n && y < n && w.trailAt[y * n + x] !== p.num;
  /** La opción libre (seguir, izquierda, derecha) que más acerca a (tx, ty). */
  const toward = (tx, ty) => {
    let best = p.dir;
    let bestD = 1e9;
    for (const d of [p.dir, (p.dir + 3) & 3, (p.dir + 1) & 3]) {
      const x = p.x + DX[d];
      const y = p.y + DY[d];
      if (!free(x, y)) continue;
      const dd = Math.abs(tx - x) + Math.abs(ty - y) + (d === p.dir ? 0 : 0.5);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  };
  const planDone = () => b.leg >= b.legs.length || (b.leg === b.legs.length - 1 && b.rem <= 0);
  const arrived = () => {
    if (b.good) b.k = Math.min(b.kMax, b.k + 1 + (w.rnd() < 0.5 ? 1 : 0)); // una salida sin sustos: la próxima, más lejos
    b.good = true;
    b.mode = 'plan';
    b.legs = [];
    b.leg = 0;
  };
  const fresh = w.tick >= b.next;
  let want = p.dir;
  let prey = null;

  if (!p.out) {
    // adentro del territorio: terminó una salida, o planea la próxima (o ataca si hay una presa a tiro)
    if (b.mode === 'return' || (b.mode === 'plan' && b.legs.length && planDone())) arrived();
    prey = b.attack && fresh ? findPrey(w, p, b) : null;
    if (b.mode === 'attack' && !prey) {
      b.mode = 'plan';
      b.legs = [];
      b.leg = 0;
    } else if (prey && b.mode === 'plan' && !b.legs.length) b.mode = 'attack';
    if (b.mode === 'plan' && !b.legs.length) {
      const plan = makePlan(w, p, b);
      if (plan) {
        b.legs = plan;
        b.leg = 0;
        b.rem = plan[0].n;
        b.careless = w.rnd() < b.sloppy;
      }
    }
    if (b.mode === 'attack') want = toward(prey.x, prey.y);
  } else {
    const home = bfsHome(w, p);
    const dHome = home ? home.dist : 99;
    if (b.mode === 'plan' && !b.careless && threatened(w, p, b, dHome)) {
      b.mode = 'return';
      b.good = false;
      b.k = Math.max(b.kMin, b.k - 2); // la próxima sale más cerca
    }
    if (b.mode === 'plan' && b.attack && !b.careless && fresh && dHome <= b.attack) {
      prey = findPrey(w, p, b);
      if (prey) b.mode = 'attack';
    } else if (b.mode === 'attack') prey = findPrey(w, p, b);
    if (b.mode === 'attack') {
      if (!prey || threatened(w, p, b, dHome) || dHome > b.attack + 8) {
        b.mode = 'return';
        b.next = w.tick + 4;
      } else want = toward(prey.x, prey.y);
    }
    if (b.mode === 'plan' && (!b.legs.length || planDone())) b.mode = 'return'; // el rectángulo se acabó afuera
    if (b.mode === 'return' && home) want = home.dir;
  }

  if (b.mode === 'plan' && b.legs.length) {
    // seguir el rectángulo
    let leg = b.legs[b.leg];
    while (leg && b.rem <= 0) {
      leg = b.legs[++b.leg];
      if (leg) b.rem = leg.n;
    }
    if (leg) {
      want = leg.d;
      b.rem--;
    }
  }

  // --- la última palabra: nunca una celda que lo mata si hay otra. Orden: lo que quería, seguir, izquierda, derecha.
  const tryDirs = [want, p.dir, (p.dir + 3) & 3, (p.dir + 1) & 3];
  let pick = -1;
  let fallback = -1;
  for (const d of tryDirs) {
    if (d === opp(p.dir)) continue;
    const x = p.x + DX[d];
    const y = p.y + DY[d];
    if (!free(x, y)) continue;
    if (fallback < 0) fallback = d;
    if (b.heads && own[y * n + x] !== p.num && headNear(w, p, x, y)) continue;
    // persiguiendo no se mete en un callejón de su propia estela: desde la celda nueva tiene que haber camino a casa
    if (p.out && b.mode === 'attack' && own[y * n + x] !== p.num && !bfsFrom(w, p, x, y, d)) continue;
    pick = d;
    break;
  }
  if (pick < 0) pick = fallback;
  if (pick < 0) return; // sin salida: sigue derecho y se acabó
  if (pick !== want && b.mode === 'plan') {
    // el plan ya no se puede seguir
    if (p.out) {
      b.mode = 'return';
      b.good = false;
    } else {
      b.legs = [];
      b.leg = 0;
    }
  }
  if (pick !== p.dir) w.steer(p, pick);
}
