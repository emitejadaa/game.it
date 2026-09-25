/**
 * Clashball — sesiones de juego.
 *  - LocalSession: vs CPU, 2 jugadores en el mismo teclado y el partido de fondo del menú.
 *  - NetSession: online. El servidor manda; el cliente predice su propio jugador para que el
 *    control responda al instante y corrige al llegar cada estado del servidor.
 */
import { Match, TPS } from './shared/match.js';
import { brain, think } from './shared/ai.js';

const DT = 1 / TPS;
const HIST = 4096;

function savePrev(m) {
  for (const d of m.world.discs) {
    d.ox = d.x;
    d.oy = d.y;
  }
}

export class LocalSession {
  /**
   * @param {object} o
   * @param {object} o.cfg     { stadium, mode, scoreLimit, timeLimit }
   * @param {Array} o.humans   [{ id, name, team, avatar, slot }]
   * @param {Array} o.bots     [{ id, name, team, level, avatar }]
   */
  constructor({ cfg, humans = [], bots = [], onEvent = () => {} }) {
    this.cfg = cfg;
    this.humans = humans;
    this.onEvent = onEvent;
    this.match = new Match({ ...cfg, players: [...humans, ...bots.map((b) => ({ ...b, bot: b.level }))] });
    this.brains = {};
    const seed = 1 + Math.floor(Math.random() * 9999);
    bots.forEach((b, i) => (this.brains[b.id] = brain(b.level, seed + i * 13)));
    this.acc = 0;
    this.alpha = 0;
    this.paused = false;
    this.me = humans[0]?.id ?? null;
    savePrev(this.match);
  }

  update(dt, readBits) {
    if (this.paused) return;
    this.acc = Math.min(this.acc + dt, 0.25);
    const m = this.match;
    while (this.acc >= DT) {
      this.acc -= DT;
      for (const h of this.humans) m.setInput(h.id, readBits(h.slot));
      for (const p of m.players) if (p.bot) m.setInput(p.id, think(m, p, (this.brains[p.id] ||= brain(p.bot, 5))));
      savePrev(m);
      m.step();
      for (const e of m.events) this.onEvent(e, 'local');
    }
    this.alpha = this.acc / DT;
  }
}

export class NetSession {
  constructor(net, live, { onEvent = () => {}, info = () => ({}) } = {}) {
    this.net = net;
    this.info = info;
    this.onEvent = onEvent;
    this.cfg = { stadium: live.stadium, mode: live.mode, scoreLimit: live.score, timeLimit: live.time };
    this.match = new Match({ ...this.cfg, players: [] });
    this.L = null; // tick local
    this.offset = null; // tick del servidor − tick local para el mismo input
    this.hist = new Uint8Array(HIST);
    this.queue = [];
    this.acc = 0;
    this.alpha = 0;
    this.paused = false;
    this.smooth = new Map();
    this.lastSent = -1;
    this.lastSendT = 0;
    this.tokens = 30;
    this.refillT = performance.now();
    this.sentAt = new Map();
    this.ping = 0;
    this.gotFirst = false;
  }

  get me() {
    return this.net.myId;
  }

  inMatch() {
    return !!this.match.player(this.me)?.d;
  }

  push(s) {
    this.queue.push(s);
  }

  positions() {
    const out = new Map();
    this.match.balls.forEach((b, i) => out.set('b' + i, [b.d.x, b.d.y]));
    for (const p of this.match.players) if (p.d) out.set(p.id, [p.d.x, p.d.y]);
    return out;
  }

  /** Aplica el último estado del servidor y vuelve a simular hasta el presente predicho. */
  reconcile() {
    if (!this.queue.length) return;
    const list = this.queue.splice(0);
    const s = list[list.length - 1];
    for (const x of list) for (const e of x.ev || []) this.serverEvent(e);
    this.paused = !!s.pz;
    const now = performance.now();
    const ack = s.a?.[this.me];
    if (ack) {
      this.offset = ack[1] - ack[0];
      const t0 = this.sentAt.get(ack[0]);
      if (t0) {
        const rtt = now - t0;
        this.ping = this.ping ? this.ping * 0.8 + rtt * 0.2 : rtt;
        for (const q of this.sentAt.keys()) if (q <= ack[0]) this.sentAt.delete(q);
      }
    }
    const before = this.gotFirst ? this.positions() : null;
    const prevState = this.match.state;
    this.match.applySnapshot(s, this.info);
    this.gotFirst = true;
    const inMatch = this.inMatch();
    if (this.L === null) this.L = s.k + 2;
    let base = inMatch && this.offset !== null ? s.k - this.offset : s.k;
    if (!inMatch) this.L = base + (this.paused ? 0 : 2);
    if (base > this.L) this.L = base;
    if (this.L - base > 45) this.L = base + 45;
    if (this.paused) base = this.L;
    // re-simulación
    const m = this.match;
    savePrev(m);
    for (let t = base; t < this.L; t++) {
      if (inMatch) m.setInput(this.me, this.hist[t % HIST]);
      savePrev(m);
      m.step();
    }
    // suavizado: la corrección se reparte en unos cuadros en vez de saltar
    const teleport = prevState !== m.state && (m.state === 0 || prevState === 0);
    if (before) {
      const after = this.positions();
      for (const [k, [x, y]] of after) {
        const b = before.get(k);
        const off = this.smooth.get(k) || [0, 0];
        if (!b || teleport) {
          this.smooth.delete(k);
          continue;
        }
        const dx = b[0] - x + off[0];
        const dy = b[1] - y + off[1];
        if (Math.hypot(dx, dy) > 70) this.smooth.delete(k);
        else this.smooth.set(k, [dx, dy]);
      }
    }
  }

  sendInput(bits) {
    const now = performance.now();
    this.tokens = Math.min(40, this.tokens + ((now - this.refillT) / 1000) * 22);
    this.refillT = now;
    if (bits === this.lastSent && now - this.lastSendT < 250) return;
    if (this.tokens < 1 || this.net.ws?.readyState !== 1) return;
    this.tokens--;
    this.net.raw({ t: 'i', k: bits, q: this.L });
    this.lastSent = bits;
    this.lastSendT = now;
    this.sentAt.set(this.L, now);
    if (this.sentAt.size > 200) this.sentAt.delete(this.sentAt.keys().next().value);
  }

  update(dt, readBits) {
    this.reconcile();
    const k = Math.exp(-dt * 11);
    for (const [key, o] of this.smooth) {
      o[0] *= k;
      o[1] *= k;
      if (Math.abs(o[0]) + Math.abs(o[1]) < 0.05) this.smooth.delete(key);
    }
    if (this.paused || this.L === null) {
      this.alpha = 1;
      return;
    }
    this.acc = Math.min(this.acc + dt, 0.2);
    const m = this.match;
    while (this.acc >= DT) {
      this.acc -= DT;
      const inMatch = this.inMatch();
      const bits = inMatch ? readBits() : 0;
      this.hist[this.L % HIST] = bits;
      if (inMatch) {
        this.sendInput(bits);
        m.setInput(this.me, bits);
      }
      savePrev(m);
      m.step();
      for (const e of m.events) this.predicted(e);
      this.L++;
    }
    this.alpha = this.acc / DT;
  }

  /** Eventos de la predicción local: solo lo inmediato (mis patadas, rebotes). */
  predicted(e) {
    if ((e.t === 'kick' && e.id === this.me) || e.t === 'wall' || e.t === 'touch') this.onEvent(e, 'predicted');
  }

  /** Eventos confirmados por el servidor. */
  serverEvent(e) {
    if (e.t === 'kick' && e.id === this.me) return;
    this.onEvent(e, 'server');
  }
}
