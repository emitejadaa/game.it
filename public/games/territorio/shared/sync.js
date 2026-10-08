/**
 * Territorio — lo que ve cada jugador en cada paso (lo usan el servidor y el modo sin conexión) y cómo lo
 * reconstruye el cliente.
 *
 * Viewer (servidor): arma el mensaje de un jugador. Tiene dos partes:
 *  - Cabezas y estelas, igual que Estela: de cada jugador cercano `[num, x, y, dir, flags, …esquinas]`; las
 *    esquinas de la estela que ese jugador todavía no tiene van pegadas al final (la primera vez, todas, con el bit 4).
 *      flags: 1 está afuera de su territorio (tiene estela) · 4 estela completa (reemplaza la que había)
 *  - Territorio por diferencias dentro de la ventana de interés: un rectángulo alineado a bloques de 8 celdas que
 *    cubre ±40 celdas alrededor de la cabeza más el territorio y la estela propios (hace falta para predecir la
 *    captura). Al entrar una zona nueva en la ventana se manda completa (`r`, corridas por rectángulo); después
 *    solo lo que cambió (`c`, por fila, una corrida por tramo cambiado). Si se saltea un mensaje (backpressure), el
 *    siguiente trae todo lo que faltó: las diferencias salen de "lo último que mandé", no de "el paso anterior".
 *
 *   { t: 's', k: paso, h: [[…], …], g: [nums que salieron de vista o murieron], x: [[x, y, color], …] muertes cercanas,
 *     r: [[x0, y0, w, h, dueño, largo, …], …], c: [y, x, corridas, dueño, largo, …, y, x, …],
 *     a: última entrada aplicada, o: [celdas propias, KO]  (a y o solo para el jugador propio, vivo),
 *     mm: minimapa [dueño, largo, …] cada ~2,5 s }
 *
 * Mirror (cliente): aplica esos mensajes. `owner` es lo que dijo el servidor; `shown` es lo que se dibuja (el servidor
 * más las capturas propias predichas que todavía no confirmó).
 */
import { CFG } from './world.js';

const contains = (a, b) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];
const areaOf = (r) => (r[2] - r[0] + 1) * (r[3] - r[1] + 1);

/** Partes de `a` que no están en `b` (hasta 4 rectángulos [x0, y0, x1, y1]). */
export function rectDiff(a, b) {
  if (b[2] < a[0] || b[0] > a[2] || b[3] < a[1] || b[1] > a[3]) return [a];
  const out = [];
  if (b[1] > a[1]) out.push([a[0], a[1], a[2], b[1] - 1]);
  if (b[3] < a[3]) out.push([a[0], b[3] + 1, a[2], a[3]]);
  const y0 = Math.max(a[1], b[1]);
  const y1 = Math.min(a[3], b[3]);
  if (b[0] > a[0]) out.push([a[0], y0, b[0] - 1, y1]);
  if (b[2] < a[2]) out.push([b[2] + 1, y0, a[2], y1]);
  return out;
}

export class Viewer {
  constructor(world, num) {
    this.w = world;
    this.num = num;
    this.known = new Map(); // num de jugador → { tid, n } (cuántas esquinas de qué estela ya tiene este jugador)
    this.win = null; // ventana de territorio que el cliente ya tiene: [x0, y0, x1, y1]
    this.lastK = 0; // paso del último mensaje armado
    this.mini = true; // falta mandar el minimapa
  }

  reset() {
    this.known.clear();
    this.win = null;
    this.mini = true;
  }

  /** Corridas [dueño, largo, …] de las celdas de la fila y, de x0 a x1 (se agregan a `out`). */
  _runs(y, x0, x1, out) {
    const row = y * this.w.size;
    const owner = this.w.owner;
    let cur = owner[row + x0];
    let len = 0;
    let runs = 0;
    for (let x = x0; x <= x1; x++) {
      const o = owner[row + x];
      if (o === cur) len++;
      else {
        out.push(cur, len);
        runs++;
        cur = o;
        len = 1;
      }
    }
    out.push(cur, len);
    return runs + 1;
  }

  /** @param deaths  muertes ocurridas desde el mensaje anterior: [{x, y, color}] */
  build(deaths) {
    const w = this.w;
    const n = w.size;
    const me = w.players.get(this.num);
    const live = !!(me && me.alive);
    const cx = me ? (live ? me.x : me.lastX) : n >> 1;
    const cy = me ? (live ? me.y : me.lastY) : n >> 1;

    // --- ventana de territorio
    const R = CFG.view;
    let x0 = cx - R;
    let y0 = cy - R;
    let x1 = cx + R;
    let y1 = cy + R;
    if (live) {
      // el territorio y la estela propios van siempre: el cliente los necesita para predecir la captura
      const bb = me.bb;
      x0 = Math.min(x0, bb[0]);
      y0 = Math.min(y0, bb[1]);
      x1 = Math.max(x1, bb[2]);
      y1 = Math.max(y1, bb[3]);
      const v = me.verts;
      for (let i = 0; i < v.length; i += 2) {
        x0 = Math.min(x0, v[i]);
        x1 = Math.max(x1, v[i]);
        y0 = Math.min(y0, v[i + 1]);
        y1 = Math.max(y1, v[i + 1]);
      }
    }
    const C = CFG.chunk;
    const snap = (a, b, hi) => [Math.max(0, Math.floor(a / C) * C), Math.min(hi, (Math.floor(b / C) + 1) * C - 1)];
    const [ax0, ax1] = snap(x0, x1, n - 1);
    const [ay0, ay1] = snap(y0, y1, n - 1);
    const need = [ax0, ay0, ax1, ay1];
    let win = this.win;
    if (!win || !contains(win, need) || areaOf(win) > 2.2 * areaOf(need)) {
      win = [Math.max(0, ax0 - C), Math.max(0, ay0 - C), Math.min(n - 1, ax1 + C), Math.min(n - 1, ay1 + C)];
    }
    const old = this.win;
    const msg = { t: 's', k: w.tick, h: [] };
    if (old) {
      // diferencias dentro de lo que el cliente ya tiene
      const ix0 = Math.max(old[0], win[0]);
      const ix1 = Math.min(old[2], win[2]);
      const iy0 = Math.max(old[1], win[1]);
      const iy1 = Math.min(old[3], win[3]);
      const c = [];
      for (let y = iy0; y <= iy1; y++) {
        if (w.rowVer[y] <= this.lastK) continue;
        const row = y * n;
        let a = -1;
        let b = -1;
        for (let x = ix0; x <= ix1; x++) {
          if (w.ver[row + x] > this.lastK) {
            if (a < 0) a = x;
            b = x;
          }
        }
        if (a < 0) continue;
        const at = c.length;
        c.push(y, a, 0);
        c[at + 2] = this._runs(y, a, b, c);
      }
      if (c.length) msg.c = c;
    }
    const rects = old ? rectDiff(win, old) : [win];
    if (rects.length) {
      const r = [];
      for (const q of rects) {
        if (q[2] < q[0] || q[3] < q[1]) continue;
        const e = [q[0], q[1], q[2] - q[0] + 1, q[3] - q[1] + 1];
        // corridas a lo largo de todo el rectángulo (fila tras fila)
        let cur = -1;
        let len = 0;
        for (let y = q[1]; y <= q[3]; y++) {
          const row = y * n;
          for (let x = q[0]; x <= q[2]; x++) {
            const o = w.owner[row + x];
            if (o === cur) len++;
            else {
              if (len) e.push(cur, len);
              cur = o;
              len = 1;
            }
          }
        }
        e.push(cur, len);
        r.push(e);
      }
      if (r.length) msg.r = r;
    }
    this.win = win;
    this.lastK = w.tick;

    // --- cabezas y estelas
    const h = msg.h;
    const seen = new Set();
    for (const p of w.players.values()) {
      if (!p.alive) continue;
      const mine = p === me;
      if (!mine) {
        const r = this.known.has(p.num) ? CFG.viewKeep : CFG.view;
        if (!inView(p, cx, cy, r)) continue;
      }
      seen.add(p.num);
      let from = 0;
      let flags = p.out ? 1 : 0;
      const k = this.known.get(p.num);
      if (p.out) {
        if (k && k.tid === p.tid) from = k.n;
        else flags |= 4;
      }
      const e = [p.num, p.x, p.y, p.dir, flags];
      for (let i = from * 2; i < p.verts.length; i++) e.push(p.verts[i]);
      this.known.set(p.num, { tid: p.tid, n: p.verts.length / 2 });
      if (mine) h.unshift(e);
      else h.push(e);
    }
    const g = [];
    for (const num of this.known.keys()) {
      if (seen.has(num)) continue;
      this.known.delete(num);
      g.push(num);
    }
    if (g.length) msg.g = g;
    if (deaths && deaths.length) {
      const x = [];
      for (const d of deaths) if (Math.abs(d.x - cx) <= R && Math.abs(d.y - cy) <= R) x.push([d.x, d.y, d.color]);
      if (x.length) msg.x = x;
    }
    if (live) {
      msg.a = me.seq;
      msg.o = [me.area, me.kos];
    }
    if (this.mini || w.tick % 25 === this.num % 25) {
      this.mini = false;
      msg.mm = w.miniRLE();
    }
    return msg;
  }
}

/** ¿Alguna parte del jugador (cabeza o caja de su estela) cae en el cuadro de radio r? */
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
  constructor(size = CFG.size) {
    this.setSize(size);
    this.bikes = new Map(); // num → { num, x, y, dir, flags, m, verts }
    this.mini = null; // { n, owner: Uint16Array } minimapa
  }

  setSize(size) {
    this.size = size;
    this.owner = new Uint16Array(size * size);
    this.shown = new Uint16Array(size * size);
  }

  clear() {
    this.bikes.clear();
    this.owner.fill(0);
    this.shown.fill(0);
    this.mini = null;
  }

  /** Aplica un mensaje 's' (cabezas y estelas) y devuelve los jugadores presentes (en el orden del mensaje). */
  apply(m) {
    const out = [];
    if (m.g) for (const num of m.g) this.bikes.delete(num);
    for (const e of m.h || []) {
      const [num, x, y, dir, flags] = e;
      let b = this.bikes.get(num);
      if (!b) {
        b = { num, verts: [], x, y, m: 0 };
        this.bikes.set(num, b);
      }
      if (flags & 4) b.verts = [];
      for (let i = 5; i < e.length; i++) b.verts.push(e[i]);
      if (!(flags & 1)) b.verts.length = 0;
      // celdas recorridas (para interpolar por el camino y no en diagonal)
      const dist = Math.abs(x - b.x) + Math.abs(y - b.y);
      if (dist <= 3) b.m += dist;
      b.x = x;
      b.y = y;
      b.dir = dir;
      b.flags = flags;
      out.push(b);
    }
    return out;
  }

  /** Aplica el territorio de un mensaje 's' (`r` y `c`) a `owner` y `shown`. Devuelve los índices que cambiaron (se agregan a `changed`). */
  applyTerritory(m, changed = []) {
    const n = this.size;
    const { owner, shown } = this;
    if (m.r) {
      for (const e of m.r) {
        const [x0, y0, w] = e;
        let x = 0;
        let y = 0;
        for (let i = 4; i < e.length; i += 2) {
          const o = e[i];
          for (let k = e[i + 1]; k > 0; k--) {
            const c = (y0 + y) * n + x0 + x;
            if (owner[c] !== o || shown[c] !== o) {
              owner[c] = o;
              shown[c] = o;
              changed.push(c);
            }
            if (++x >= w) {
              x = 0;
              y++;
            }
          }
        }
      }
    }
    const c = m.c;
    if (c) {
      let i = 0;
      while (i < c.length) {
        const y = c[i++];
        let x = c[i++];
        const runs = c[i++];
        for (let r = 0; r < runs; r++) {
          const o = c[i++];
          for (let k = c[i++]; k > 0; k--, x++) {
            const idx = y * n + x;
            if (owner[idx] !== o || shown[idx] !== o) {
              owner[idx] = o;
              shown[idx] = o;
              changed.push(idx);
            }
          }
        }
      }
    }
    return changed;
  }

  /** Minimapa (`mm`): corridas de un cuadrado de ceil(size / mini) celdas de lado. */
  applyMini(mm) {
    const side = Math.ceil(this.size / CFG.mini);
    const owner = new Uint16Array(side * side);
    let i = 0;
    for (let k = 0; k < mm.length && i < owner.length; k += 2) for (let r = mm[k + 1]; r > 0 && i < owner.length; r--) owner[i++] = mm[k];
    this.mini = { side, owner };
  }
}
