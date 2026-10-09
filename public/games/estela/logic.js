/**
 * Estela — lógica pura del cliente (sin DOM, se prueba desde Node): giros y gestos, recorte de estelas para dibujar
 * entre dos pasos del servidor, estado de la moto propia a partir de un snapshot, puntaje estimado y el modo sin
 * conexión (el mismo mundo del servidor corriendo en el navegador, con los mismos mensajes).
 */
import { World, CFG, DX, DY, applyInputs, trailPoints } from './shared/world.js';
import { brain, think, BOT_NAMES } from './shared/bots.js';
import { Viewer } from './shared/sync.js';

export { trailPoints };

// ---------------------------------------------------------------- giros
/** Dirección absoluta de GameIt.dir(): 0 arriba, 1 derecha, 2 abajo, 3 izquierda. */
export const DIR_OF = { up: 0, right: 1, down: 2, left: 3 };
export const dirOf = (name) => DIR_OF[name] ?? -1;
/** ¿Se puede doblar de `cur` a `d`? (no hay vuelta en U ni "doblar" hacia donde ya va) */
export const legalTurn = (cur, d) => Number.isInteger(d) && d >= 0 && d <= 3 && d !== cur && d !== ((cur + 2) & 3);

/** Hacia dónde va la moto una vez aplicadas las entradas que todavía no se ejecutaron (para validar el próximo giro). */
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
 * Píxeles CSS por celda. El servidor solo manda motos dentro de ±CFG.view celdas de la propia: con esta escala
 * lo que cabe en la pantalla (el lado mayor) nunca pasa de `span` celdas, así que nada "aparece de golpe" en el borde.
 * Es un entero en píxeles del dispositivo para que la grilla y las estelas caigan siempre en el mismo píxel.
 */
export function fitCell(w, h, dpr = 1, { min = 7, span = 128, max = 18 } = {}) {
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

// ---------------------------------------------------------------- moto propia
/** Estado de la moto propia (el que simula stepOwn) a partir de su entrada en el espejo y los datos `o` / `a` del snapshot. */
export function ownFromBike(b, o, ack, turboWant = 0) {
  return {
    x: b.x,
    y: b.y,
    dir: b.dir,
    D: b.D,
    len: b.len,
    cap: o ? o[1] : CFG.capStart,
    verts: b.verts.slice(),
    turboWant,
    turbo: b.flags & 1,
    lock: o ? o[5] | 0 : 0,
    energy: o ? o[0] : CFG.energyMax,
    frac: o ? o[2] : 0,
    shield: o ? o[3] : 0,
    seq: ack,
  };
}
/**
 * Reconciliación de la moto propia con cada snapshot. El servidor no manda si el turbo estaba pedido (solo si estaba
 * encendido), así que se deduce de la última entrada confirmada: `ackTurbo`.
 */
export class OwnTracker {
  constructor(predictor) {
    this.pr = predictor;
    this.ackTurbo = 0;
  }
  reset() {
    this.ackTurbo = 0;
  }
  /** @returns { err, snapped } de Predictor.reconcile */
  apply(bike, o, ack, tick, now) {
    let want = this.ackTurbo;
    for (const e of this.pr.history) if (e.s <= ack) want = e.b;
    this.ackTurbo = want;
    return this.pr.reconcile(ownFromBike(bike, o, ack, want), tick, ack, now);
  }
}
export const cloneOwn = (s) => ({ ...s, verts: s.verts.slice() });
export const ownPos = (s, out) => {
  out.x = s.x;
  out.y = s.y;
};

/** Puntaje que se muestra entre dos rankings del servidor: lo ya cobrado + tiempo vivo + 10 por KO + largo. */
export const estimateScore = ({ banked = 0, lifeTicks = 0, tps = 20, kos = 0, len = 0 }) => banked + Math.floor(lifeTicks / tps) + kos * CFG.koPoints + len;

export function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- modo sin conexión
/** Niveles: cuántos bots y de qué nivel de cerebro (1 distraído … 3 agresivo, con turbo). */
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
    for (let i = 0; i < 80; i++) this.step(false); // el mundo ya arranca "vivo"
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

export { applyInputs };
