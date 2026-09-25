/**
 * Serpentina — bots: prueban varios rumbos posibles y eligen el que los acerca a la comida sin
 * chocar cuerpos ni el borde. Los más vivos aceleran hacia los restos de serpientes muertas y a
 * veces intentan cerrarle el paso a una más chica.
 */
import { CFG, bodyR, foodR } from './world.js';

export const BOT_NAMES = ['Víbora', 'Fideo', 'Slinky', 'Culebra', 'Zigzag', 'Manguera', 'Tallarín', 'Cordón', 'Neón', 'Ñandú', 'Espiral', 'Chicle', 'Sierpe', 'Anaconda', 'Rulo', 'Pixel', 'Lombriz', 'Serpen', 'Kraken', 'Cometa', 'Onda', 'Tren', 'Fleco', 'Hilo', 'Bucle', 'Laser', 'Mambo', 'Cascabel', 'Ovillo', 'Trenza'];

const CAND = [0, 0.35, -0.35, 0.75, -0.75, 1.2, -1.2, 1.7, -1.7, 2.4, -2.4, Math.PI];

export function brain(level, rnd) {
  return { level, next: 0, wander: null, dir: rnd() * Math.PI * 2, boostUntil: 0 };
}

/** Qué tan peligroso es ir por el rumbo `a` (0 = libre). */
function danger(w, s, a, others, look) {
  const r = bodyR(s.m);
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  let worst = 0;
  for (let k = 1; k <= 5; k++) {
    const dist = (look * k) / 5;
    const px = s.x + cs * dist;
    const py = s.y + sn * dist;
    // borde
    const edge = w.R - Math.hypot(px, py) - r;
    if (edge < 50 + r * 1.5) worst = Math.max(worst, (6 - k) * 2 + (edge < 0 ? 4 : 0));
    for (const o of others) {
      const or = bodyR(o.m) + r + 12;
      if (px < o.bx0 - or || px > o.bx1 + or || py < o.by0 - or || py > o.by1 + or) continue;
      const lim = or * or;
      const pts = o.pts;
      // se revisa salteando puntos (alcanza para no chocar y es barato)
      for (let i = 0; i < pts.length; i += 4) {
        const dx = pts[i] - px;
        const dy = pts[i + 1] - py;
        if (dx * dx + dy * dy < lim) {
          worst = Math.max(worst, 6 - k);
          break;
        }
      }
      if ((o.x - px) ** 2 + (o.y - py) ** 2 < lim * 1.6) worst = Math.max(worst, 6 - k);
    }
    if (worst >= 5) break;
  }
  return worst;
}

export function think(w, p, b) {
  const s = p.snake;
  if (!s || w.tick < b.next) return;
  b.next = w.tick + [0, 4, 3, 2][b.level];
  const r = bodyR(s.m);
  const look = 90 + r * 3 + (s.boosting ? 110 : 40);
  const near = 500 + r * 4;
  const others = [];
  for (const o of w.snakes.values()) {
    if (o === s) continue;
    if (o.bx1 < s.x - near || o.bx0 > s.x + near || o.by1 < s.y - near || o.by0 > s.y + near) continue;
    others.push(o);
  }
  // objetivo: la comida que más conviene cerca (o pasear)
  let goal = null;
  let best = 0;
  const reach = 260 + r * 3;
  const C = CFG.chunk;
  const gx0 = Math.max(0, Math.floor((s.x - reach + w.R) / C));
  const gx1 = Math.min(w.cols - 1, Math.floor((s.x + reach + w.R) / C));
  const gy0 = Math.max(0, Math.floor((s.y - reach + w.R) / C));
  const gy1 = Math.min(w.cols - 1, Math.floor((s.y + reach + w.R) / C));
  for (let gy = gy0; gy <= gy1; gy++)
    for (let gx = gx0; gx <= gx1; gx++)
      for (const f of w.chunks[gx + gy * w.cols].values()) {
        const d = Math.hypot(f.x - s.x, f.y - s.y);
        if (d > reach) continue;
        // lo que queda atrás cuesta dar la vuelta
        const ahead = Math.cos(Math.atan2(f.y - s.y, f.x - s.x) - s.a);
        const score = (f.v + foodR(f.v) * 0.05) / (d + 40) * (1.4 + ahead);
        if (score > best) {
          best = score;
          goal = f;
        }
      }
  let want;
  if (goal) want = Math.atan2(goal.y - s.y, goal.x - s.x);
  else {
    if (!b.wander || Math.hypot(b.wander[0] - s.x, b.wander[1] - s.y) < 200) {
      const a = w.rnd() * Math.PI * 2;
      const rr = Math.sqrt(w.rnd()) * w.R * 0.7;
      b.wander = [Math.cos(a) * rr, Math.sin(a) * rr];
    }
    want = Math.atan2(b.wander[1] - s.y, b.wander[0] - s.x);
  }
  // cerca del borde: volver hacia el centro
  if (Math.hypot(s.x, s.y) > w.R - 240 - r * 3) {
    const home = Math.atan2(-s.y, -s.x);
    want = Math.atan2(Math.sin(want) + Math.sin(home) * 2, Math.cos(want) + Math.cos(home) * 2);
  }
  // cazador: cortarle el paso a una cabeza más chica que viene cruzando
  if (b.level >= 3 && s.m > 40) {
    for (const o of others) {
      if (o.m > s.m * 0.8) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d > 320 + r * 2) continue;
      const lead = 60 + d * 0.5;
      want = Math.atan2(o.y + Math.sin(o.a) * lead - s.y, o.x + Math.cos(o.a) * lead - s.x);
      if (w.rnd() < 0.3) b.boostUntil = w.tick + 12;
      break;
    }
  }
  // elegir el rumbo más seguro cerca del deseado (el deseado también se evalúa)
  let pick = want;
  let pickScore = Infinity;
  for (let i = -1; i < CAND.length; i++) {
    const a = i < 0 ? want : s.a + CAND[i];
    const dz = danger(w, s, a, others, look);
    const dev = Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)));
    const score = dz * 10 + dev;
    if (score < pickScore) {
      pickScore = score;
      pick = a;
    }
    if (i < 0 && dz === 0) break; // el rumbo deseado está libre
  }
  if (b.level === 1 && w.rnd() < 0.08) pick += (w.rnd() - 0.5) * 1.2; // los novatos se distraen
  // turbo hacia restos grandes o cuando lo decide el cazador
  let boost = w.tick < b.boostUntil;
  if (!boost && b.level >= 2 && goal && goal.v >= 2 && s.m > 25 && pickScore < 1 && w.rnd() < 0.25) {
    b.boostUntil = w.tick + 10;
    boost = true;
  }
  if (pickScore >= 10) boost = false;
  w.setInput(p.num, Math.cos(pick), Math.sin(pick), boost);
}
