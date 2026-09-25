/**
 * Serpentina — lo que ve cada jugador en cada paso (lo usan el servidor y el modo sin conexión).
 *
 * - Serpientes: la primera vez que una entra en vista se manda el cuerpo entero; después solo la
 *   cabeza, el largo y el turbo (el cliente reconstruye el cuerpo con el mismo `grow`).
 * - Comida por casilleros: al entrar en vista se manda el casillero completo; después, solo lo
 *   que se agregó o se comió ahí.
 */
import { CFG, viewSpan } from './world.js';

const r10 = (v) => Math.round(v * 10);

export class Viewer {
  constructor(world, num) {
    this.w = world;
    this.num = num;
    this.known = new Set();
    this.chunks = new Set();
  }

  reset() {
    this.known.clear();
    this.chunks.clear();
  }

  build(deadIds) {
    const w = this.w;
    const p = w.players.get(this.num);
    const s = p?.snake;
    const cx = s ? s.x : (p?.lastX ?? 0);
    const cy = s ? s.y : (p?.lastY ?? 0);
    const m = s ? s.m : (p?.lastM ?? CFG.startMass);
    const half = viewSpan(m) * 0.62 + 250;
    const x0 = cx - half;
    const x1 = cx + half;
    const y0 = cy - half;
    const y1 = cy + half;

    const n = [];
    const b = [];
    const g = [];
    const seen = new Set();
    for (const sn of w.snakes.values()) {
      if (sn.bx1 < x0 || sn.bx0 > x1 || sn.by1 < y0 || sn.by0 > y1) continue;
      seen.add(sn.id);
      const flags = sn.boosting ? 1 : 0;
      if (this.known.has(sn.id)) n.push(sn.id, r10(sn.x), r10(sn.y), r10(sn.m), flags, Math.round(sn.a * 100));
      else {
        this.known.add(sn.id);
        const pts = new Array(sn.pts.length);
        for (let i = 0; i < pts.length; i++) pts[i] = r10(sn.pts[i]);
        b.push([sn.id, sn.num, sn.color, r10(sn.m), flags, r10(sn.x), r10(sn.y), Math.round(sn.a * 100), pts]);
      }
    }
    const dd = [];
    for (const id of this.known) {
      if (seen.has(id)) continue;
      g.push(id);
      this.known.delete(id);
      if (deadIds?.has(id)) dd.push(id);
    }

    // comida por casilleros (con margen para no suscribir y soltar a cada rato)
    const C = CFG.chunk;
    const R = w.R;
    const cols = w.cols;
    const inRange = (pad) => {
      const out = new Set();
      const gx0 = Math.max(0, Math.floor((x0 - pad + R) / C));
      const gx1 = Math.min(cols - 1, Math.floor((x1 + pad + R) / C));
      const gy0 = Math.max(0, Math.floor((y0 - pad + R) / C));
      const gy1 = Math.min(cols - 1, Math.floor((y1 + pad + R) / C));
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) out.add(gx + gy * cols);
      return out;
    };
    const want = inRange(0);
    const keep = inRange(C);
    const fa = [];
    const fe = [];
    const fr = [];
    const fd = [];
    for (const ch of this.chunks) {
      if (!keep.has(ch)) {
        this.chunks.delete(ch);
        fd.push(ch);
        continue;
      }
      const e = w.events.get(ch);
      if (e) {
        for (const v of e.add) fe.push(v);
        for (const v of e.rem) fr.push(v);
      }
    }
    for (const ch of want) {
      if (this.chunks.has(ch)) continue;
      this.chunks.add(ch);
      const list = [];
      for (const f of w.chunks[ch].values()) list.push(f.id, Math.round(f.x), Math.round(f.y), r10(f.v), f.c);
      fa.push(ch, list);
    }
    const msg = { t: 's', k: w.tick };
    if (n.length) msg.n = n;
    if (b.length) msg.b = b;
    if (g.length) msg.g = g;
    if (dd.length) msg.dd = dd;
    if (fa.length) msg.fa = fa;
    if (fe.length) msg.fe = fe;
    if (fr.length) msg.fr = fr;
    if (fd.length) msg.fd = fd;
    return msg;
  }
}
