/**
 * Rey de la Colina — lógica pura del cliente, sin DOM (se prueba desde Node): entrada (teclas y joystick → código de
 * movimiento), vista, disco propio a partir de un snapshot, predicción con rebote en las paredes, la colina que se muda
 * (dónde está y cuánto falta, a la hora del servidor que se está mostrando), resumen de la partida y el modo sin conexión
 * (el mismo mundo del servidor corriendo en el navegador, con los mismos mensajes).
 */
import { CTRL, MOVE_STILL, newDisc, setMove, setFace, applyInputs, stepMotion, bounceRect, encodeMove } from '../../shared/arena-physics.js';
import { CFG } from './shared/world.js';

export { CTRL, MOVE_STILL, encodeMove };

/** Predicción del disco propio: igual que el servidor menos los choques (que corrige la reconciliación): entrada, movimiento y paredes. */
export function stepOwn(p, list, tick) {
  applyInputs(p, list, tick);
  stepMotion(p);
  bounceRect(p, CFG.half, CFG.half, CFG.wallBounce);
}

/** Nombre apto para mostrar: sin controles ni < >, acotado. */
export const sanitizeName = (raw, max = 16) =>
  String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- entrada
/** Vector de movimiento de las teclas apretadas ({up, down, left, right}); las opuestas se anulan. */
export function keysVector(k) {
  const x = (k.right ? 1 : 0) - (k.left ? 1 : 0);
  const y = (k.down ? 1 : 0) - (k.up ? 1 : 0);
  return [x, y];
}

/**
 * Vector del joystick virtual a partir de lo que el dedo se corrió (dx, dy) del punto de apoyo, con radio `radius`
 * y una zona muerta: nada hasta `dead` del radio y de ahí al máximo (módulo ≤ 1).
 */
export function stickVector(dx, dy, radius = 52, dead = 0.18) {
  const l = Math.sqrt(dx * dx + dy * dy);
  if (!(l > 0)) return [0, 0];
  const m = Math.min(1, l / radius);
  if (m < dead) return [0, 0];
  const k = (m - dead) / (1 - dead) / l; // el módulo sube desde 0 después de la zona muerta
  return [dx * k, dy * k];
}

/**
 * Convierte lo que se mantiene apretado en pedidos de movimiento para la red: `poll(now, vx, vy)` devuelve el código
 * nuevo cuando cambió (con un mínimo de `gapMs` entre mensajes, para no pasar del límite del servidor con un joystick
 * que se mueve todo el tiempo) o -1 si no hay nada que mandar.
 */
export class MoveGate {
  constructor(gapMs = 50) {
    this.gapMs = gapMs;
    this.sent = MOVE_STILL;
    this.at = -1e9;
  }
  reset() {
    this.sent = MOVE_STILL;
    this.at = -1e9;
  }
  poll(now, vx, vy) {
    const code = encodeMove(vx, vy);
    if (code === this.sent) return -1;
    // soltar todo se manda enseguida (frenar tarde se siente mal); lo demás, espaciado
    if (code !== MOVE_STILL && now - this.at < this.gapMs) return -1;
    this.sent = code;
    this.at = now;
    return code;
  }
}

// ---------------------------------------------------------------- vista
/**
 * Escala y centro para que la arena (un círculo o un cuadrado de medio ancho `half`) entre en pantalla dejando libres los
 * `top` píxeles del portal y un margen. Devuelve { s, cx, cy }: x_pantalla = cx + x × s.
 */
export function fitView(w, h, half, { top = 56, bottom = 0, pad = 14, max = 1.7 } = {}) {
  const availW = Math.max(60, w - 2 * pad);
  const availH = Math.max(60, h - top - bottom - 2 * pad);
  const s = Math.min(max, Math.min(availW, availH) / (2 * half));
  return { s, cx: w / 2, cy: top + pad + availH / 2 };
}

// ---------------------------------------------------------------- colina
/**
 * Estado de la colina a la hora del servidor `k` (en pasos, con decimales) a partir del último `r` del snapshot
 * ({ k, hill, next, hillIn }): { at: punto actual, to: punto al que va, in: pasos que faltan, warn: avisando (<= warnSec) }.
 * Pasada la mudanza, y hasta que llegue un snapshot nuevo, `at` ya es el destino.
 */
export function hillAt(ri, k) {
  const left = ri.hillIn - (k - ri.k);
  if (left <= 0) return { at: ri.next, to: ri.next, in: 0, warn: false };
  return { at: ri.hill, to: ri.next, in: left, warn: left <= CFG.warnSec * CFG.tps };
}

/** Tiempo que queda de la partida (segundos enteros) según lo último que dijo el servidor (`left` en pasos) y los ms pasados desde entonces. */
export function matchLeft(left, elapsedMs) {
  return Math.max(0, Math.ceil((left - (elapsedMs * CFG.tps) / 1000) / CFG.tps));
}

/** Filas del resultado: [{ rank, num, score }] con los `n` primeros y, si `me` quedó afuera, su fila al final. */
export function resultRows(top, me, n = 5) {
  const rows = top.slice(0, n).map((r, i) => ({ rank: i + 1, num: r[0], score: r[1] }));
  const i = top.findIndex((r) => r[0] === me);
  if (i >= n) rows.push({ rank: i + 1, num: me, score: top[i][1] });
  return rows;
}

// ---------------------------------------------------------------- disco propio
/** Estado del disco propio (el que simula stepOwn) a partir de su fila en el snapshot y los datos `o` / `a`. */
export function ownFromEntry(e, o, ack, r = 18) {
  const p = newDisc({ r, x: e[1], y: e[2], vx: e[3], vy: e[4], seq: ack });
  if (o) {
    p.dashCd = o[0];
    p.dashT = o[1];
    p.waveCd = o[5] | 0;
    if (p.dashT > 0) p.invMass = p.invMass0 * CTRL.dashMass;
    setFace(p, o[4]);
    setMove(p, o[3]);
  }
  return p;
}
export const cloneOwn = (s) => ({ ...s, inbox: [] });
export const ownPos = (s, out) => {
  out.x = s.x;
  out.y = s.y;
};

// ---------------------------------------------------------------- modo sin conexión
/**
 * El mundo del servidor corriendo en el navegador con los mismos mensajes (reset, pl, me, s, lb, dead, ko): el cliente
 * no distingue si juega online o sin conexión. `update(ms)` avanza el reloj en pasos fijos y manda un snapshot cada
 * `snapEvery` pasos. Sin `name` (null) es una demostración sin persona (el fondo del menú).
 */
export class OfflineSession {
  constructor({ World, brain, think, Viewer, botNames, level, emit, seed = (Math.random() * 2 ** 31) >>> 0, name = null, color = 0, colors = 12, snapEvery = 2, meExtra, ready = true }) {
    this.emit = emit;
    this.think = think;
    this.snapEvery = snapEvery;
    this.meExtra = meExtra;
    this.w = new World(seed);
    this.tickMs = 1000 / this.w.tps;
    this.acc = 0;
    this.pending = [];
    this.brains = new Map();
    this.bots = [];
    const off = Math.floor(this.w.rnd() * botNames.length);
    for (let i = 0; i < level.bots; i++) {
      const p = this.w.addPlayer({ name: botNames[(off + i) % botNames.length], color: (off + i) % colors, bot: true });
      this.brains.set(p.num, brain(level.mix[i % level.mix.length], this.w.rnd));
      this.bots.push(p.num);
      this.w.spawn(p.num);
    }
    this.me = name === null ? null : this.w.addPlayer({ id: 'me', name, color });
    this.colors = colors;
    this.viewer = new Viewer(this.w, this.me ? this.me.num : 0);
    emit({ t: 'reset' });
    this.table();
    this.meMsg();
    emit({ t: 'lb', l: this.w.leaderboard(10) });
    if (this.me && ready) this.w.spawn(this.me.num);
  }

  table() {
    this.emit({ t: 'pl', p: [...this.w.players.values()].map((p) => [p.num, p.name, p.color, p.bot ? 1 : 0]) });
  }
  meMsg() {
    const w = this.w;
    const me = this.me;
    const msg = { t: 'me', num: me ? me.num : 0, alive: !!me?.alive, ...this.meExtra?.(w) };
    if (me && !me.alive && w.waitTicks) msg.wait = Math.round((w.waitTicks(me.num) * 1000) / w.tps);
    this.emit(msg);
  }

  /** Mismos mensajes que entiende el servidor. */
  send(msg) {
    const w = this.w;
    const me = this.me;
    if (!me) return;
    if (msg.t === 'spawn') {
      if (me.alive) return;
      me.name = sanitizeName(msg.name) || me.name;
      const c = Number(msg.color);
      if (Number.isInteger(c) && c >= 0 && c < this.colors) me.color = c;
      w.spawn(me.num);
      this.table();
      this.meMsg();
    } else if (msg.t === 'i' && me.alive) w.queueInputs(me, msg.e);
  }

  step() {
    const w = this.w;
    for (const num of this.bots) {
      const p = w.players.get(num);
      if (!p.alive) w.spawn(num);
      else this.think(w, p, this.brains.get(num));
    }
    w.step();
    for (const x of w.deaths) {
      if (this.me && x.num === this.me.num) this.emit({ t: 'dead', by: x.by, stats: x.stats });
      if (this.me && x.by === this.me.num) this.emit({ t: 'ko', n: x.num });
      if (this.pending.length < 40) this.pending.push(x);
    }
    w.deaths.length = 0;
  }

  update(dtMs) {
    this.acc = Math.min(this.acc + dtMs, 250);
    let n = 0;
    while (this.acc >= this.tickMs) {
      this.acc -= this.tickMs;
      this.step();
      if (this.w.tick % this.snapEvery === 0) {
        this.emit(this.viewer.build(this.pending));
        this.pending.length = 0;
      }
      if (this.w.tick % this.w.tps === 0) this.emit({ t: 'lb', l: this.w.leaderboard(10) });
      n++;
    }
    return n;
  }
}
