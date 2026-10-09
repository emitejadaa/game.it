/**
 * Rey de la Colina — bots. Cada paso, en este orden:
 *   1. Pozos: predicen dónde se detendrían (posición + velocidad con la tabla de frenado) y, si ese punto se acerca a un
 *      pozo, empujan en sentido contrario y frenan. Nunca hacen un Empujón cuyo recorrido pase por un pozo.
 *   2. Colina: van hacia la colina actual; si está vacía, se quedan en el centro (control suave: no se pasan);
 *      si están solos adentro, la sostienen. Los niveles 2 y 3 se adelantan a la próxima colina cuando avisa.
 *   3. Disputa: si hay otro adentro (o están los dos), van contra él: Empujón cuando lo miran y está cerca, y Onda cuando
 *      alguien está pegado a la colina y la Onda está lista.
 * Tres niveles: reflejos, puntería, uso de las habilidades y anticipación. Usan el azar del mundo (`w.rnd`).
 */
import { steer, dash, wave, CTRL, brakeDist } from '../../../shared/arena-physics.js';
import { CFG, PH } from './world.js';

export const BOT_NAMES = ['Reina', 'Cumbre', 'Pico', 'Nube', 'Roca', 'Altura', 'Cima', 'Loma', 'Brisa', 'Mesa', 'Faro', 'Duna', 'Risco', 'Monte', 'Sierra', 'Alba', 'Cerro', 'Cresta', 'Trébol', 'Lince', 'Zorro', 'Puma', 'Cóndor', 'Tala', 'Mica', 'Ñandú', 'Vizcacha', 'Guanaco', 'Yaguar', 'Pampa'];

// every: pasos entre decisiones · err: error de puntería · dashRange / align / dashP: Empujón · waveP: chance de usar la Onda
// ahead: se adelanta a la próxima colina (segundos antes de la mudanza) · margin: distancia extra a los pozos
// aggr: chance de meterse a pelear contra el que está en la colina (si no, esperan al borde a que se libere)
const LEVELS = [
  { every: 8, err: 0.35, dashRange: 80, align: 0.84, dashP: 0.2, waveP: 0.2, ahead: 0, margin: 26, aggr: 0.25 },
  { every: 4, err: 0.15, dashRange: 100, align: 0.92, dashP: 0.5, waveP: 0.5, ahead: 1.2, margin: 20, aggr: 0.5 },
  { every: 2, err: 0.04, dashRange: 120, align: 0.95, dashP: 0.8, waveP: 0.85, ahead: 2.2, margin: 16, aggr: 0.8 },
];

export function brain(level, rnd) {
  const L = LEVELS[Math.max(1, Math.min(3, level)) - 1];
  return { level, ...L, next: Math.floor(rnd() * L.every), rival: 0, ox: 0, fight: false };
}

/** ¿El punto (x, y) queda a salvo de los pozos (con `m` de margen y el radio del disco)? */
function pitSafe(x, y, r, m) {
  for (const [px, py, pr] of CFG.pits) {
    const dx = x - px;
    const dy = y - py;
    const lim = pr + r + m;
    if (dx * dx + dy * dy < lim * lim) return false;
  }
  return true;
}

/** ¿Todo el tramo (x0, y0) → (x1, y1) está a salvo de los pozos? */
function pathSafe(x0, y0, x1, y1, r, m) {
  for (let i = 0; i <= 5; i++) {
    const k = i / 5;
    if (!pitSafe(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, r, m)) return false;
  }
  return true;
}

export function think(w, p, b) {
  if (!p.alive) return;
  if (w.phase !== PH.play) {
    steer(p, 0, 0);
    return;
  }
  const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  const bd = sp > 1 ? brakeDist(sp) / sp : 0;
  const sx = p.x + p.vx * bd;
  const sy = p.y + p.vy * bd;
  // 1. pozos
  for (const [px, py, pr] of CFG.pits) {
    const lim = pr + p.r + b.margin;
    const ex = sx - px;
    const ey = sy - py;
    const cx = p.x - px;
    const cy = p.y - py;
    if (ex * ex + ey * ey < lim * lim || cx * cx + cy * cy < lim * lim) {
      const d = Math.sqrt(cx * cx + cy * cy) || 1;
      steer(p, cx / d - (sp > 1 ? (p.vx / sp) * 0.8 : 0), cy / d - (sp > 1 ? (p.vy / sp) * 0.8 : 0));
      return;
    }
  }
  // 2. colina: la actual, o la próxima si ya avisó y el nivel se adelanta
  const soon = w.hillIn() < b.ahead * 30;
  const H = CFG.hills[soon && b.ahead ? w.next : w.hill];
  const cur = CFG.hills[w.hill];
  const inCur = (p.x - cur[0]) ** 2 + (p.y - cur[1]) ** 2 <= (CFG.hillR - 8) ** 2;
  const mine = w.occ === p.num;
  const decided = w.tick >= b.next;
  // cuántos hay adentro de la colina además de mí
  let nIn = 0;
  for (const q of w.players.values()) if (q !== p && q.alive && (q.x - cur[0]) ** 2 + (q.y - cur[1]) ** 2 <= (CFG.hillR + 10) ** 2) nIn++;
  if (decided) {
    b.next = w.tick + b.every;
    b.ox = (w.rnd() - 0.5) * 2 * b.err;
    // desde afuera: con la colina libre se entra; si ya hay gente, se pelea según el carácter (y menos cuantos más haya)
    b.fight = inCur || nIn === 0 || w.rnd() < b.aggr / Math.max(1, nIn);
  }

  // el rival más cercano a la colina actual (el que hay que sacar) o, si no hay, el más cercano a mí
  let foe = null;
  let fd = 1e12;
  for (const q of w.players.values()) {
    if (q === p || !q.alive) continue;
    const dh = (q.x - cur[0]) ** 2 + (q.y - cur[1]) ** 2;
    const inside = dh <= (CFG.hillR + 20) ** 2;
    const d = inside ? dh - 1e6 : (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < fd) {
      fd = d;
      foe = q;
    }
  }
  const foeInside = foe && (foe.x - cur[0]) ** 2 + (foe.y - cur[1]) ** 2 <= (CFG.hillR + 20) ** 2;

  if (mine && !(soon && b.ahead)) {
    // la sostiene: control suave hacia el centro de la colina
    const ux = (cur[0] - p.x) * 0.03 - p.vx * 0.02;
    const uy = (cur[1] - p.y) * 0.03 - p.vy * 0.02;
    steer(p, ux, uy);
    // defensa: alguien se acerca → Onda
    if (foe && p.waveCd === 0) {
      const d2 = (foe.x - p.x) ** 2 + (foe.y - p.y) ** 2;
      if (d2 < 100 * 100 && decided && w.rnd() < b.waveP * 0.8 && b.level >= 2) wave(p);
    }
    return;
  }

  if (foeInside && !soon && b.fight) {
    // disputa: contra el que está adentro
    let dx = foe.x + foe.vx * 0.1 * b.level - p.x;
    let dy = foe.y + foe.vy * 0.1 * b.level - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const lat = dist > 60 ? b.ox * dist * 0.5 : 0;
    steer(p, dx - (dy / dist) * lat, dy + (dx / dist) * lat);
    if (decided) {
      const tx = foe.x - p.x;
      const ty = foe.y - p.y;
      const td = Math.sqrt(tx * tx + ty * ty) || 1;
      if (p.dashCd === 0 && td < b.dashRange && (p.fx * tx + p.fy * ty) / td > b.align && w.rnd() < b.dashP) {
        const vx = p.vx + p.fx * CTRL.dashSpeed;
        const vy = p.vy + p.fy * CTRL.dashSpeed;
        const vs = Math.sqrt(vx * vx + vy * vy) || 1;
        const f = brakeDist(vs) / vs;
        if (pathSafe(p.x, p.y, p.x + vx * f, p.y + vy * f, p.r, 8)) dash(p);
      }
      // Onda: dentro o pegada a la colina y el rival al alcance
      if (p.waveCd === 0 && td < CFG.waveR - 15 && (inCur || td < 70) && w.rnd() < b.waveP * 0.7) wave(p);
    }
    return;
  }

  // esperar a que se libere (en el borde, a ~120 px del centro) o ir a la colina libre
  const dx = H[0] - p.x;
  const dy = H[1] - p.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  if (foeInside && !soon) {
    // punto de espera: sobre la recta hacia la colina, a 125 px
    const wx = H[0] - (dx / dist) * 125;
    const wy = H[1] - (dy / dist) * 125;
    if (dist > 150) steer(p, dx, dy);
    else steer(p, (wx - p.x) * 0.03 - p.vx * 0.02, (wy - p.y) * 0.03 - p.vy * 0.02);
  } else if (dist > 90) steer(p, dx, dy);
  else steer(p, dx * 0.03 - p.vx * 0.02, dy * 0.03 - p.vy * 0.02);
}

/** Niveles del modo sin conexión: cuántos bots y de qué nivel de cerebro (1 distraído … 3 afilado). */
export const OFFLINE_LEVELS = [
  { id: 'easy', bots: 4, mix: [1] },
  { id: 'normal', bots: 6, mix: [1, 2, 2] },
  { id: 'hard', bots: 8, mix: [2, 3, 3] },
];
