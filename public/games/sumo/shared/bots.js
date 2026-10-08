/**
 * Sumo — bots. Cada paso hacen lo primero que haga falta:
 *   1. Borde: predicen dónde se detendrían si soltaran la entrada (posición + velocidad × K, con K la suma de la
 *      amortiguación) y, si ese punto se acerca al borde de la plataforma, empujan hacia el centro. Así frenan y
 *      vuelven antes de caerse solos (a la plataforma se la mira ya achicada).
 *   2. Perseguir: cada `every` pasos eligen al rival más cercano (de los niveles 2 y 3, con preferencia por los que
 *      están cerca del borde) y van hacia él; los niveles 2 y 3 se acomodan del lado del centro para empujarlo hacia afuera.
 *   3. Empujón: cuando miran al rival, está cerca y el Empujón está listo. Antes verifican que, si fallan, la inercia
 *      no los saque de la plataforma.
 * Sin rival (o esperando) pasean cerca del centro: nunca se quedan quietos en la ronda.
 * Tres niveles: reflejos, puntería, alcance del Empujón y margen contra el borde. Usan el azar del mundo (`w.rnd`).
 */
import { steer, dash, CTRL, brakeDist } from '../../../shared/arena-physics.js';

export { brakeDist };
import { PH } from './world.js';

export const BOT_NAMES = ['Tatami', 'Dohyo', 'Maru', 'Kenji', 'Sakura', 'Ronin', 'Koi', 'Mochi', 'Torii', 'Kaze', 'Hiro', 'Nami', 'Taro', 'Yuki', 'Riku', 'Sumi', 'Tori', 'Akira', 'Haru', 'Kuma', 'Ume', 'Sora', 'Tsuru', 'Fuji', 'Botan', 'Kiri', 'Kagi', 'Zen', 'Rai', 'Mizu'];

// every: pasos entre decisiones · margin: cuánto se alejan del borde · err: error de puntería (fracción de la distancia)
// dashRange: distancia máxima para el Empujón · align: cuánto tienen que mirar al rival (coseno) · dashP: chance por decisión
// slack: tolerancia del punto de frenado si fallan el Empujón (negativo = más prudentes) · lead: anticipo de la velocidad rival (s)
const LEVELS = [
  { every: 8, margin: 26, err: 0.35, dashRange: 85, align: 0.84, dashP: 0.22, slack: -25, lead: 0, smart: 0 },
  { every: 4, margin: 20, err: 0.15, dashRange: 100, align: 0.92, dashP: 0.5, slack: -10, lead: 0.05, smart: 1 },
  { every: 2, margin: 16, err: 0.04, dashRange: 120, align: 0.95, dashP: 0.8, slack: 0, lead: 0.15, smart: 2 },
];

export function brain(level, rnd) {
  const L = LEVELS[Math.max(1, Math.min(3, level)) - 1];
  return { level, ...L, next: Math.floor(rnd() * L.every), rival: 0, ox: 0, oy: 0, wx: 0, wy: 0, wnext: 0 };
}

export function think(w, p, b) {
  if (!p.alive) return;
  if (w.phase !== PH.play || w.tick < w.rt0) {
    steer(p, 0, 0);
    return;
  }
  const R = w.R;
  // pasados ~55 s la plataforma ya es chica: se animan a pelear más cerca del borde (si no, esperarían a la muerte súbita)
  const u = Math.min(1, Math.max(0, (w.tick - w.rt0 - 55 * 30) / (20 * 30)));
  const margin = b.margin * (1 - 0.6 * u);
  // 1. borde
  const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  const bd = sp > 1 ? brakeDist(sp) / sp : 0;
  const sx = p.x + p.vx * bd;
  const sy = p.y + p.vy * bd;
  if (sx * sx + sy * sy > (R - p.r - margin) * (R - p.r - margin)) {
    // frena y vuelve hacia el centro
    const pd = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
    steer(p, -p.x / pd - (sp > 1 ? (p.vx / sp) * 0.7 : 0), -p.y / pd - (sp > 1 ? (p.vy / sp) * 0.7 : 0));
    return;
  }
  // 2. elegir rival
  let q = b.rival ? w.players.get(b.rival) : null;
  const decided = !q || !q.alive || w.tick >= b.next;
  if (decided) {
    b.next = w.tick + b.every;
    q = null;
    let bs = 1e12;
    for (const o of w.players.values()) {
      if (o === p || !o.alive) continue;
      const d = Math.sqrt((o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y));
      let score = d;
      if (b.smart) {
        const od = Math.sqrt(o.x * o.x + o.y * o.y);
        score -= 0.5 * Math.max(0, od - R * 0.55); // los que están cerca del borde son presa fácil
      }
      if (score < bs) {
        bs = score;
        q = o;
      }
    }
    b.rival = q ? q.num : 0;
    // error de puntería: un corrimiento lateral nuevo en cada decisión
    b.ox = (w.rnd() - 0.5) * 2 * b.err;
    b.oy = (w.rnd() - 0.5) * 2 * b.err;
  }
  if (!q) {
    // solo en la plataforma: pasea cerca del centro
    if (w.tick >= b.wnext) {
      b.wnext = w.tick + 45 + Math.floor(w.rnd() * 45);
      b.wx = (w.rnd() - 0.5) * R * 0.7;
      b.wy = (w.rnd() - 0.5) * R * 0.7;
    }
    steer(p, b.wx - p.x, b.wy - p.y);
    return;
  }

  // 3. hacia el rival
  let ax = q.x + q.vx * b.lead;
  let ay = q.y + q.vy * b.lead;
  let dx = ax - p.x;
  let dy = ay - p.y;
  let dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const qd = Math.sqrt(q.x * q.x + q.y * q.y) || 1;
  if (b.smart && dist > 55 && qd > R * 0.3) {
    // acomodarse del lado del centro: el empujón lo manda hacia el borde
    const ux = q.x / qd;
    const uy = q.y / qd;
    const outer = (p.x - q.x) * ux + (p.y - q.y) * uy > -2 * p.r;
    if (outer && dist < 170) {
      // rodear: tangente hacia el lado en que ya está, y un poco hacia adentro
      const side = (p.x - q.x) * -uy + (p.y - q.y) * ux >= 0 ? 1 : -1;
      ax = q.x - ux * 30 + -uy * side * 80;
      ay = q.y - uy * 30 + ux * side * 80;
    } else {
      ax = q.x - ux * 24;
      ay = q.y - uy * 24;
    }
    dx = ax - p.x;
    dy = ay - p.y;
    dist = Math.sqrt(dx * dx + dy * dy) || 1;
  }
  // el corrimiento de puntería solo mientras está lejos
  const lat = dist > 60 ? b.ox * dist * 0.5 : 0;
  steer(p, dx - (dy / dist) * lat, dy + (dx / dist) * lat);

  // 4. Empujón (no en los primeros 2 s: quien recién entra necesita un momento para agarrar el control)
  if (decided && p.dashCd === 0 && w.tick >= w.rt0 + 60) {
    const tx = q.x - p.x;
    const ty = q.y - p.y;
    const td = Math.sqrt(tx * tx + ty * ty) || 1;
    if (td < b.dashRange) {
      const cos = (p.fx * tx + p.fy * ty) / td;
      if (cos > b.align) {
        const edge = qd > R * 0.62 ? 1.6 : 1;
        if (w.rnd() < b.dashP * edge) {
          // si el rival esquiva, ¿la inercia me deja adentro?
          const vx = p.vx + p.fx * CTRL.dashSpeed;
          const vy = p.vy + p.fy * CTRL.dashSpeed;
          const vs = Math.sqrt(vx * vx + vy * vy) || 1;
          const f = brakeDist(vs) / vs;
          const mx = p.x + vx * f;
          const my = p.y + vy * f;
          const lim = R - p.r + b.slack + 70 * u;
          if (lim > 0 && mx * mx + my * my < lim * lim) dash(p);
        }
      }
    }
  }
}

/** Niveles del modo sin conexión: cuántos bots y de qué nivel de cerebro (1 distraído … 3 afilado). */
export const OFFLINE_LEVELS = [
  { id: 'easy', bots: 5, mix: [1] },
  { id: 'normal', bots: 7, mix: [1, 2, 2] },
  { id: 'hard', bots: 9, mix: [2, 3, 3] },
];
