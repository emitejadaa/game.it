/**
 * Territorio — lógica pura del cliente (sin DOM, se prueba desde Node): giros y gestos, escala de la vista, recorte
 * de estelas para dibujar entre dos pasos del servidor, estado del jugador propio a partir de un snapshot, captura
 * predicha (con su "capa" provisoria hasta que el servidor confirma) y el modo sin conexión (el mismo mundo del
 * servidor corriendo en el navegador, con los mismos mensajes).
 */
import { World, CFG, DX, DY, applyInputs, enclosed, legalTurn, trailCells } from './shared/world.js';
import { brain, think, BOT_NAMES } from './shared/bots.js';
import { Viewer } from './shared/sync.js';

export { legalTurn };

// ---------------------------------------------------------------- giros
/** Dirección absoluta de GameIt.dir(): 0 arriba, 1 derecha, 2 abajo, 3 izquierda. */
export const DIR_OF = { up: 0, right: 1, down: 2, left: 3 };
export const dirOf = (name) => DIR_OF[name] ?? -1;

/** Hacia dónde va el jugador una vez aplicadas las entradas que todavía no se ejecutaron (para validar el próximo giro). */
export function effectiveDir(state, history) {
  let cur = state.dir;
  for (const e of history) if (e.s > state.seq && e.d >= 0 && legalTurn(cur, e.d)) cur = e.d;
  return cur;
}

/** Dirección de un gesto de deslizar (dominio del eje mayor), o -1 si no pasó del mínimo. */
export function swipeDir(dx, dy, min = 22) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < min) return -1;
  return ax > ay ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
}

/** Nombre apto para mostrar: sin controles ni < >, acotado. */
export const sanitizeName = (raw, max = 16) =>
  String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// ---------------------------------------------------------------- vista
/**
 * Píxeles CSS por celda. El servidor manda territorio en ±CFG.view celdas de la cabeza: con esta escala lo que cabe en
 * la pantalla (el lado mayor) nunca pasa de `span` celdas, así que nada "aparece de golpe" en el borde. Es un entero
 * en píxeles del dispositivo para que el territorio (una textura de un píxel por celda) caiga siempre en el mismo píxel.
 */
export function fitCell(w, h, dpr = 1, { min = 8, span = 60, max = 26 } = {}) {
  const long = Math.max(w, h);
  const dev = Math.max(Math.round(min * dpr), Math.ceil((long * dpr) / span));
  return Math.min(max, dev / dpr);
}

/**
 * Recorta (delta > 0) o estira (delta < 0) la estela por la cabeza. `pts` = x0, y0, x1, y1… con la cabeza al final;
 * `delta` en celdas recorridas. Trabaja sobre el arreglo y devuelve cuántos números quedan válidos.
 */
export function trimPath(pts, delta, dir = 0) {
  let n = pts.length;
  if (delta < 0) {
    const k = -delta;
    const sx = n >= 4 ? Math.sign(pts[n - 2] - pts[n - 4]) : 0;
    const sy = n >= 4 ? Math.sign(pts[n - 1] - pts[n - 3]) : 0;
    if (n >= 4 && sx === DX[dir] && sy === DY[dir]) {
      pts[n - 2] += DX[dir] * k;
      pts[n - 1] += DY[dir] * k;
    } else {
      pts.push(pts[n - 2] + DX[dir] * k, pts[n - 1] + DY[dir] * k);
      n += 2;
    }
    return n;
  }
  while (delta > 0 && n >= 4) {
    const dx = pts[n - 2] - pts[n - 4];
    const dy = pts[n - 1] - pts[n - 3];
    const seg = Math.abs(dx) + Math.abs(dy);
    if (seg <= delta) {
      n -= 2;
      delta -= seg;
    } else {
      pts[n - 2] -= Math.sign(dx) * delta;
      pts[n - 1] -= Math.sign(dy) * delta;
      delta = 0;
    }
  }
  return n;
}

/**
 * Puntos para dibujar a un jugador: la poligonal de su estela (celda de salida + esquinas) terminando en la cabeza
 * (x, y), retrocedida `back` celdas por el camino (la cabeza se dibuja entre dos pasos). Sin estela es un solo punto.
 * Se escribe en `out` (se vacía antes) y devuelve cuántos números quedan válidos.
 */
export function pathPoints(verts, x, y, dir, back, out) {
  out.length = 0;
  for (let i = 0; i < verts.length; i++) out.push(verts[i]);
  out.push(x, y);
  if (out.length < 4) {
    // sin estela: la cabeza sola, retrocedida (o adelantada) en línea recta
    out[0] = x - DX[dir] * back;
    out[1] = y - DY[dir] * back;
    return 2;
  }
  return trimPath(out, back, dir);
}

// ---------------------------------------------------------------- jugador propio
/** Estado del jugador propio (el que simula stepOwn) a partir de su entrada en el espejo y el `ack` del snapshot. */
export function ownFromBike(b, ack) {
  return { x: b.x, y: b.y, dir: b.dir, out: !!(b.flags & 1), verts: b.verts.slice(), moves: b.m, seq: ack, closes: [] };
}
export const cloneOwn = (s) => ({ ...s, verts: s.verts.slice(), closes: s.closes.slice() });
export const ownPos = (s, out) => {
  out.x = s.x;
  out.y = s.y;
};

/**
 * Un paso del jugador propio (predicción del cliente): entradas y avance, con las mismas reglas que el servidor
 * salvo las muertes (eso lo decide él). `ctx.isHome(x, y)` dice si la celda es territorio propio; al volver a casa con
 * estela queda anotado un evento de captura en `s.closes` ({ k: paso, cells: celdas de la estela }).
 */
export function stepOwn(s, list, tick, ctx) {
  applyInputs(s, list, tick);
  const nx = s.x + DX[s.dir];
  const ny = s.y + DY[s.dir];
  if (nx < 0 || ny < 0 || nx >= ctx.size || ny >= ctx.size) return; // adentro la pared frena; afuera el servidor la mata
  const ox = s.x;
  const oy = s.y;
  s.x = nx;
  s.y = ny;
  s.moves++;
  if (ctx.isHome(nx, ny)) {
    if (s.out) {
      s.closes.push({ k: tick, cells: trailCells(s.verts, ox, oy, ctx.size) });
      s.verts = [];
      s.out = false;
    }
  } else if (!s.out) {
    s.out = true;
    s.verts = [ox, oy];
  }
}

/** Reconciliación del jugador propio con cada snapshot. */
export class OwnTracker {
  constructor(predictor) {
    this.pr = predictor;
  }
  reset() {}
  /** @returns { err, snapped } de Predictor.reconcile */
  apply(bike, ack, tick, now) {
    return this.pr.reconcile(ownFromBike(bike, ack), tick, ack, now);
  }
}

// ---------------------------------------------------------------- captura predicha
/** Cuántas celdas de `grid` son de `num`, y su rectángulo envolvente. */
export function ownedStats(grid, n, num) {
  let count = 0;
  let x0 = n;
  let y0 = n;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < n; y++) {
    const row = y * n;
    for (let x = 0; x < n; x++) {
      if (grid[row + x] !== num) continue;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y1 < y) y1 = y;
    }
  }
  return { count, bb: count ? [x0, y0, x1, y1] : null };
}

/**
 * Aplica sobre `grid` (lo que se dibuja) la captura que el servidor va a hacer cuando llegue la entrada: la estela pasa a
 * ser territorio y también lo encerrado (mismo algoritmo que el mundo). Devuelve las celdas que cambiaron.
 */
export function predictCapture(grid, n, num, cells) {
  const changed = [];
  for (const c of cells) {
    if (grid[c] !== num) {
      grid[c] = num;
      changed.push(c);
    }
  }
  const st = ownedStats(grid, n, num);
  if (!st.bb) return changed;
  for (const c of enclosed(grid, n, num, st.bb)) {
    if (grid[c] !== num) {
      grid[c] = num;
      changed.push(c);
    }
  }
  return changed;
}

/**
 * Capturas propias que se dibujan antes de que el servidor las confirme. Cada una vive hasta que el territorio del
 * servidor llega (aplicado) un par de pasos más allá de su paso; ahí `expire` devuelve sus celdas para volver a
 * pintarlas con lo que dijo el servidor (si coincide no se nota; si no, se corrige).
 */
export class Overlay {
  constructor(grace = 2) {
    this.list = []; // { k, cells }
    this.grace = grace;
  }
  has(k) {
    return this.list.some((e) => e.k === k);
  }
  add(k, cells) {
    this.list.push({ k, cells });
  }
  /** Celdas de las capturas ya confirmadas (según el último paso aplicado). Las saca de la lista. */
  expire(appliedK) {
    const out = [];
    this.list = this.list.filter((e) => {
      if (appliedK < e.k + this.grace) return true;
      for (const c of e.cells) out.push(c);
      return false;
    });
    return out;
  }
  /** Todas las celdas (y vacía la lista). */
  clear() {
    const out = [];
    for (const e of this.list) for (const c of e.cells) out.push(c);
    this.list = [];
    return out;
  }
}

/** Porcentaje del mapa con un decimal ("12,3" se escribe con el separador del idioma). */
export function pctText(cells, size, lang = 'es') {
  const v = Math.round((cells / (size * size)) * 1000) / 10;
  const s = v.toFixed(1);
  return lang === 'en' ? s : s.replace('.', ',');
}

export function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- modo sin conexión
/** Niveles: cuántos bots y de qué nivel de cerebro (1 distraído … 3 agresivo). */
export const LEVELS = [
  { id: 'easy', bots: 6, mix: [1] },
  { id: 'normal', bots: 9, mix: [1, 2, 2] },
  { id: 'hard', bots: 11, mix: [2, 3, 3] },
];

/**
 * El mundo del servidor corriendo en el navegador con los mismos mensajes (reset, pl, me, s, lb, dead, ko):
 * el cliente no distingue si juega online o sin conexión. `update(ms)` avanza el reloj en pasos fijos.
 */
export class OfflineSession {
  constructor({ level = 'normal', emit, seed = (Math.random() * 2 ** 31) >>> 0, name = '', color = 0 }) {
    this.emit = emit;
    const lv = LEVELS.find((l) => l.id === level) || LEVELS[1];
    this.w = new World(seed, { size: CFG.size, tps: CFG.tps });
    this.tickMs = 1000 / this.w.tps;
    this.acc = 0;
    this.pending = [];
    this.brains = new Map();
    this.bots = [];
    const off = Math.floor(this.w.rnd() * BOT_NAMES.length);
    for (let i = 0; i < lv.bots; i++) {
      const p = this.w.addPlayer({ name: BOT_NAMES[(off + i) % BOT_NAMES.length], color: (off + i) % 12, bot: true });
      this.brains.set(p.num, brain(lv.mix[i % lv.mix.length], this.w.rnd));
      this.bots.push(p.num);
      this.w.spawn(p.num);
    }
    for (let i = 0; i < 150; i++) this.step(false); // el mundo ya arranca "vivo"
    this.pending.length = 0;
    this.me = this.w.addPlayer({ id: 'me', name, color });
    this.viewer = new Viewer(this.w, this.me.num);
    emit({ t: 'reset' });
    this.table();
    this.meMsg();
    emit({ t: 'lb', l: this.w.leaderboard(10) });
  }

  table() {
    this.emit({ t: 'pl', p: [...this.w.players.values()].map((p) => [p.num, p.name, p.color, p.bot ? 1 : 0]) });
  }
  meMsg() {
    const w = this.w;
    const msg = { t: 'me', num: this.me.num, alive: this.me.alive, size: w.size, tps: w.tps };
    if (!this.me.alive) msg.wait = Math.round((w.waitTicks(this.me.num) * 1000) / w.tps);
    this.emit(msg);
  }

  /** Mismos mensajes que entiende el servidor. */
  send(msg) {
    const w = this.w;
    if (msg.t === 'spawn') {
      if (this.me.alive) return;
      if (!w.canSpawn(this.me.num)) return this.meMsg();
      this.me.name = sanitizeName(msg.name) || this.me.name;
      const c = Number(msg.color);
      if (Number.isInteger(c) && c >= 0 && c < 12) this.me.color = c;
      w.spawn(this.me.num);
      this.table();
      this.meMsg();
    } else if (msg.t === 'i' && this.me.alive) w.queueInputs(this.me, msg.e);
  }

  step(emit) {
    const w = this.w;
    for (const num of this.bots) {
      const p = w.players.get(num);
      if (!p.alive) {
        if (w.canSpawn(num)) w.spawn(num);
      } else think(w, p, this.brains.get(num));
    }
    w.step();
    for (const x of w.deaths) {
      if (emit && this.me && x.num === this.me.num) this.emit({ t: 'dead', by: x.by, stats: x.stats });
      if (emit && this.me && x.by === this.me.num) this.emit({ t: 'ko', n: x.num });
      if (this.pending.length < 40) this.pending.push(x);
    }
    w.deaths.length = 0;
  }

  update(dtMs) {
    this.acc = Math.min(this.acc + dtMs, 250);
    let n = 0;
    while (this.acc >= this.tickMs) {
      this.acc -= this.tickMs;
      this.step(true);
      this.emit(this.viewer.build(this.pending));
      this.pending.length = 0;
      if (this.w.tick % this.w.tps === 0) this.emit({ t: 'lb', l: this.w.leaderboard(10) });
      n++;
    }
    return n;
  }
}

export { applyInputs, trailCells };
