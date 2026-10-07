/**
 * Estela — lo que ve cada jugador en cada paso (lo usan el servidor y el modo sin conexión) y cómo
 * lo reconstruye el cliente.
 *
 * Viewer (servidor): arma el mensaje de un jugador con solo las motos cercanas. De cada una manda la
 * cabeza `[num, x, y, dir, len, flags, D]` y, pegadas al final, las esquinas de la estela que ese
 * jugador todavía no tiene (la primera vez, todas, con el bit 4 en `flags`). Así el cuerpo entero se
 * manda una sola vez y después solo cabezas y esquinas nuevas. Si se saltea un mensaje (backpressure),
 * el siguiente trae todo lo que faltó: no hace falta ningún reinicio.
 *   flags: 1 turbo · 2 escudo · 4 estela completa (reemplaza)
 *   { t: 's', k: paso, h: [[...], …], g: [nums que salieron de vista o murieron], x: [[x, y, color], …] muertes cercanas,
 *     a: última entrada aplicada, o: [energía, largo máx., frac, escudo, KO] }  (a y o solo para la moto propia, viva)
 *
 * Mirror (cliente): aplica esos mensajes y deja, por moto, el estado y la poligonal de la estela.
 */
import { CFG, prunable } from './world.js';

export class Viewer {
  constructor(world, num) {
    this.w = world;
    this.num = num;
    this.known = new Map(); // num de moto → cuántas esquinas (absolutas) ya tiene este jugador
  }

  reset() {
    this.known.clear();
  }

  /** @param deaths  muertes ocurridas desde el mensaje anterior: [{x, y, color}] */
  build(deaths) {
    const w = this.w;
    const me = w.players.get(this.num);
    const cx = me ? (me.alive ? me.x : me.lastX) : w.size >> 1;
    const cy = me ? (me.alive ? me.y : me.lastY) : w.size >> 1;
    const h = [];
    const seen = new Set();
    for (const p of w.players.values()) {
      if (!p.alive) continue;
      const mine = p === me;
      if (!mine) {
        const r = this.known.has(p.num) ? CFG.viewKeep : CFG.view;
        if (!inView(p, cx, cy, r)) continue;
      }
      seen.add(p.num);
      const seq = w.vseq(p);
      let from = this.known.get(p.num);
      let flags = (p.turbo ? 1 : 0) | (p.shield > 0 ? 2 : 0);
      if (from === undefined || from < p.vbase) {
        from = p.vbase;
        flags |= 4;
      }
      const e = [p.num, p.x, p.y, p.dir, p.len, flags, p.D];
      for (let i = (from - p.vbase) * 2; i < p.verts.length; i++) e.push(p.verts[i]);
      this.known.set(p.num, seq);
      if (mine) h.unshift(e);
      else h.push(e);
    }
    const g = [];
    for (const num of this.known.keys()) {
      if (seen.has(num)) continue;
      this.known.delete(num);
      g.push(num);
    }
    const msg = { t: 's', k: w.tick, h };
    if (g.length) msg.g = g;
    if (deaths && deaths.length) {
      const x = [];
      for (const d of deaths) if (Math.abs(d.x - cx) <= CFG.view && Math.abs(d.y - cy) <= CFG.view) x.push([d.x, d.y, d.color]);
      if (x.length) msg.x = x;
    }
    if (me && me.alive) {
      msg.a = me.seq;
      msg.o = [me.energy, me.cap, me.frac, me.shield, me.kos, me.lock];
    }
    return msg;
  }
}

/** ¿Alguna parte de la moto cae en el cuadro de radio r? (cabeza, o la caja de su estela) */
function inView(p, cx, cy, r) {
  let x0 = p.x;
  let x1 = p.x;
  let y0 = p.y;
  let y1 = p.y;
  const v = p.verts;
  for (let i = 0; i < v.length; i += 2) {
    if (v[i] < x0) x0 = v[i];
    else if (v[i] > x1) x1 = v[i];
    if (v[i + 1] < y0) y0 = v[i + 1];
    else if (v[i + 1] > y1) y1 = v[i + 1];
  }
  return x1 >= cx - r && x0 <= cx + r && y1 >= cy - r && y0 <= cy + r;
}

export class Mirror {
  constructor() {
    this.bikes = new Map(); // num → { num, x, y, dir, len, flags, D, verts }
  }

  clear() {
    this.bikes.clear();
  }

  /** Aplica un mensaje 's' y devuelve las motos presentes (en el orden del mensaje). */
  apply(m) {
    const out = [];
    if (m.g) for (const num of m.g) this.bikes.delete(num);
    for (const e of m.h || []) {
      const [num, x, y, dir, len, flags, D] = e;
      let b = this.bikes.get(num);
      if (!b || flags & 4) {
        b = b || { num, verts: [] };
        b.verts = [];
        this.bikes.set(num, b);
      }
      for (let i = 7; i < e.length; i++) b.verts.push(e[i]);
      b.x = x;
      b.y = y;
      b.dir = dir;
      b.len = len;
      b.flags = flags;
      b.D = D;
      // las esquinas que quedaron detrás de la cola no sirven
      const drop = prunable(b.verts, x, y, len);
      if (drop > 0) b.verts.splice(0, drop * 2);
      out.push(b);
    }
    return out;
  }
}
