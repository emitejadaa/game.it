/**
 * Sumo — simulación (la usan el servidor online y el modo sin conexión; determinista: mismo mundo + mismas entradas
 * = misma partida). La física de discos es la de /shared/arena-physics.js.
 *
 * Cada ronda empieza con los discos quietos 1,5 s (el reloj `rt0` arranca después). Una plataforma circular se achica de 100% a 35% en 75 s (se queda ahí 15 s y después entra la muerte súbita: se
 * achica hasta casi nada, así una ronda siempre termina). Discos de radio 18 que empujan con WASD / joystick y hacen
 * un Empujón con recarga de 1,2 s. Un disco cuyo centro sale de la plataforma queda fuera de la ronda (se mira).
 *
 *   Rondas continuas: IDLE (nadie listo) → WAIT (cuenta atrás) → PLAY → al terminar, WAIT de 4 s y la siguiente.
 *   Gana la ronda el último en pie (+3). Cada caída da +1 a quien te tocó por última vez dentro de los 2 s anteriores.
 *   Quien entra mira hasta la próxima ronda, salvo que la actual tenga menos de 10 s.
 *
 * El contrato con la base de arenas (server/games/_arena.js) está en su cabecera: players, addPlayer, removePlayer,
 * spawn, step, deaths, leaderboard, canSpawn, waitTicks.
 */
import { TPS, RESTITUTION, newDisc, setMove, MOVE_STILL, encodeMove, collideAll, stepMotion, applyInputs, queueInputs } from '../../../shared/arena-physics.js';

export { TPS };

export const CFG = {
  tps: TPS,
  R0: 260, // radio de la plataforma al empezar
  discR: 18,
  shrinkSec: 75, // de 100% a minFrac
  minFrac: 0.35,
  holdSec: 15, // se queda en 35% antes de la muerte súbita
  suddenSec: 20, // y después se achica hasta suddenFrac
  suddenFrac: 0,
  waitSec: 4, // entre una ronda y la siguiente
  startSec: 2, // cuenta atrás cuando arranca la primera ronda de la arena
  freezeSec: 1.5, // los discos ya están en su lugar pero quietos: "¡Prepará el empujón!"
  lateSec: 10, // quien entra durante los primeros 10 s de la ronda juega
  koSec: 2, // ventana del último toque
  winPoints: 3,
  koPoints: 1,
  hitMin: 20, // velocidad de acercamiento (px/s) mínima para que un roce cuente como "tocar"
  ring: 0.68, // radio de la ronda de aparición, sobre el de la plataforma
};

export const PH = { idle: 0, wait: 1, play: 2 };
export const PALETTE = ['#00f0ff', '#ff2bd6', '#b6ff00', '#ffb800', '#9d6bff', '#ff3b5c', '#3dffa8', '#ff7a2f', '#4d8bff', '#ffe23d', '#ff66a3', '#7dfff2'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Radio de la plataforma `t` pasos después de empezar la ronda (pura: la usa también el dibujo del cliente). */
export function platformR(t, tps = CFG.tps, R0 = CFG.R0) {
  const s = t / tps;
  if (s <= CFG.shrinkSec) return R0 * (1 - (1 - CFG.minFrac) * (s / CFG.shrinkSec));
  if (s <= CFG.shrinkSec + CFG.holdSec) return R0 * CFG.minFrac;
  const u = Math.min(1, (s - CFG.shrinkSec - CFG.holdSec) / CFG.suddenSec);
  return R0 * (CFG.minFrac - (CFG.minFrac - CFG.suddenFrac) * u);
}

export class World {
  constructor(seed = 1, opts = {}) {
    this.tps = TPS;
    this.rnd = mulberry32(seed);
    this.tick = 0;
    this.players = new Map();
    this.nextNum = 1;
    this.deaths = []; // lo vacía quien maneja el mundo después de cada paso
    this.phase = PH.idle;
    this.roundN = 0;
    this.rt0 = 0; // paso en que empezó la ronda
    this.startAt = 0; // paso en que empieza la próxima
    this.startedWith = 0;
    this.R = CFG.R0 * (opts.scale || 1); // radio actual (se actualiza en cada paso de la ronda)
    this.R0 = this.R;
    this.result = { n: 0, winner: 0, tick: 0 };
    this.waitTicksN = CFG.waitSec * TPS;
    this.startTicksN = CFG.startSec * TPS;
    this.freezeTicks = Math.round(CFG.freezeSec * TPS);
    this.lateTicks = CFG.lateSec * TPS;
    this.koTicks = CFG.koSec * TPS;
    this._alive = [];
  }

  // ------------------------------------------------ jugadores
  addPlayer({ id = null, name = '', color = 0, bot = false } = {}) {
    const num = this.nextNum++;
    const p = newDisc({ r: CFG.discR });
    Object.assign(p, {
      num,
      id,
      name,
      color,
      bot,
      alive: false,
      ready: false, // quiere jugar: entra a la próxima ronda (o a esta si recién empezó)
      kos: 0, // derribos de esta ronda
      koTotal: 0,
      wins: 0,
      score: 0,
      lastHit: 0, // num de quien me tocó por última vez
      lastHitAt: -1e9,
      spawnTick: 0,
      round: 0, // última ronda en la que entró a la plataforma
      lastX: 0,
      lastY: 0,
    });
    this.players.set(num, p);
    return p;
  }

  removePlayer(num) {
    this.players.delete(num);
  }

  canSpawn(num) {
    const p = this.players.get(num);
    return !!p && !p.alive;
  }

  /** Ticks hasta que empiece la ronda (0 si ya está en juego o no hay fecha). */
  waitTicks() {
    return this.phase === PH.wait ? Math.max(0, this.startAt - this.tick) : 0;
  }

  /**
   * "Quiero jugar". Entra de inmediato si la ronda recién empezó; si no, queda listo para la próxima.
   * Devuelve true si quedó en la plataforma ahora.
   */
  spawn(num) {
    const p = this.players.get(num);
    if (!p || p.alive) return false;
    p.ready = true;
    if (this.phase === PH.idle) {
      this.phase = PH.wait;
      this.startAt = this.tick + this.startTicksN;
      return false;
    }
    // quien ya jugó esta ronda (y se cayó) no vuelve a entrar: espera a la que sigue
    if (this.phase === PH.play && p.round !== this.roundN && this.tick - this.rt0 < this.lateTicks) {
      this._place(p, this._freeSpot(p));
      this.startedWith++;
      return true;
    }
    return false;
  }

  /** Pone al disco en (x, y) mirando al centro y lo deja listo para jugar. */
  _place(p, [x, y]) {
    p.x = x;
    p.y = y;
    p.vx = p.vy = 0;
    p.invMass = p.invMass0;
    p.dashCd = p.dashT = p.waveCd = 0;
    p.inbox = [];
    p.lastK = this.tick;
    p.kos = 0;
    p.lastHit = 0;
    p.lastHitAt = -1e9;
    p.spawnTick = this.tick;
    p.round = this.roundN;
    p.alive = true;
    setMove(p, encodeMove(-x, -y)); // mira al centro…
    setMove(p, MOVE_STILL); // …y no se mueve hasta que le den una orden
  }

  /** Lugar libre sobre la ronda de aparición: el candidato más lejos de los discos que hay. */
  _freeSpot(me) {
    const rr = Math.min(this.R, CFG.R0) * CFG.ring;
    let best = [rr, 0];
    let bestD = -1;
    for (let t = 0; t < 12; t++) {
      const a = this.rnd() * 6.283185307179586;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      let d = 1e9;
      for (const q of this.players.values()) {
        if (!q.alive || q === me) continue;
        const dd = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y);
        if (dd < d) d = dd;
      }
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    return best;
  }

  _startRound() {
    const ready = [];
    for (const p of this.players.values()) {
      p.alive = false;
      if (p.ready) ready.push(p);
    }
    if (!ready.length) {
      this.phase = PH.idle;
      return;
    }
    // reparto al azar por una ronda: nadie tiene siempre el mismo lugar
    for (let i = ready.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [ready[i], ready[j]] = [ready[j], ready[i]];
    }
    this.roundN++;
    const rr = CFG.R0 * CFG.ring;
    const off = this.rnd() * 6.283185307179586;
    ready.forEach((p, i) => {
      const a = off + (i / ready.length) * 6.283185307179586;
      this._place(p, [Math.cos(a) * rr, Math.sin(a) * rr]);
    });
    this.phase = PH.play;
    this.rt0 = this.tick + this.freezeTicks; // el reloj de la ronda (y de la plataforma) arranca recién al terminar la espera
    this.startedWith = ready.length;
    this.R = CFG.R0;
  }

  /** Entradas de una persona (valida todo; false si el mensaje está mal formado). Sumo no tiene Onda: acción máxima 1. */
  queueInputs(p, list) {
    return queueInputs(p, list, this.tick, 1);
  }

  // ------------------------------------------------ puntaje
  leaderboard(n = 10) {
    const list = [];
    for (const p of this.players.values()) list.push([p.num, p.score, p.wins]);
    list.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return n ? list.slice(0, n) : list;
  }

  aliveCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.alive) n++;
    return n;
  }

  // ------------------------------------------------ un paso
  step() {
    this.tick++;
    if (this.phase === PH.wait && this.tick >= this.startAt) this._startRound();
    if (this.phase !== PH.play || this.tick < this.rt0) return; // quietos hasta el "¡ya!"
    const alive = this._alive;
    alive.length = 0;
    for (const p of this.players.values()) if (p.alive) alive.push(p);
    for (const p of alive) {
      if (p.inbox.length) {
        applyInputs(p, p.inbox, this.tick);
        while (p.inbox.length && p.inbox[0].s <= p.seq) p.inbox.shift();
      }
      stepMotion(p);
    }
    const tick = this.tick;
    collideAll(alive, RESTITUTION, (a, b, speed) => {
      if (speed < CFG.hitMin) return; // un roce no cuenta como tocar
      a.lastHit = b.num;
      a.lastHitAt = tick;
      b.lastHit = a.num;
      b.lastHitAt = tick;
    });
    const t = tick - this.rt0;
    const R = platformR(t, TPS, this.R0);
    this.R = R;
    const R2 = R * R;
    let left = alive.length;
    for (const p of alive) {
      if (p.x * p.x + p.y * p.y >= R2) {
        this._fall(p, left);
        left--;
      }
    }
    // fin de la ronda: queda uno (o nadie); si empezó una sola persona, cuando cae
    const n = this.aliveCount();
    if (n <= 1 && (this.startedWith >= 2 || n === 0)) this._endRound();
  }

  _fall(p, place) {
    const credit = p.lastHit && this.tick - p.lastHitAt <= this.koTicks ? this.players.get(p.lastHit) : null;
    if (credit) {
      credit.kos++;
      credit.koTotal++;
      credit.score += CFG.koPoints;
    }
    p.alive = false;
    p.lastX = p.x;
    p.lastY = p.y;
    p.dashT = 0;
    p.invMass = p.invMass0;
    const stats = { place, kos: p.kos, time: Math.floor((this.tick - this.rt0) / TPS), score: p.score };
    this.deaths.push({ num: p.num, id: p.id, by: credit ? credit.num : 0, x: p.x, y: p.y, color: p.color, stats });
  }

  _endRound() {
    let winner = 0;
    for (const p of this.players.values()) {
      if (p.alive && this.startedWith >= 2) {
        winner = p.num;
        p.wins++;
        p.score += CFG.winPoints;
      }
    }
    this.result = { n: this.roundN, winner, tick: this.tick };
    this.phase = PH.wait;
    this.startAt = this.tick + this.waitTicksN;
  }

  /** Resumen del estado (para comparar mundos en las pruebas de determinismo). */
  digest() {
    let h = 2166136261;
    const mix = (v) => {
      h ^= Math.round(v * 100) | 0;
      h = Math.imul(h, 16777619) >>> 0;
    };
    mix(this.tick);
    mix(this.phase);
    mix(this.roundN);
    for (const p of this.players.values()) {
      mix(p.num);
      mix(p.alive ? 1 : 0);
      mix(p.x);
      mix(p.y);
      mix(p.vx);
      mix(p.vy);
      mix(p.score);
      mix(p.dashCd);
    }
    return h >>> 0;
  }
}
