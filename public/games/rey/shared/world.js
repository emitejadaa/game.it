/**
 * Rey de la Colina — simulación (la usan el servidor online y el modo sin conexión; determinista). La física de discos,
 * el Empujón y la entrada son los de Sumo (/shared/arena-physics.js).
 *
 * Arena cuadrada de 640×640 con paredes que rebotan y 3 pozos. Una "colina" (círculo de radio 70) cambia de lugar cada
 * 25 s entre cuatro puntos fijos y avisa 3 s antes adónde va. Estar SOLO adentro suma 1 punto por segundo; si hay dos o
 * más (o ninguno) nadie suma. Habilidades: Empujón (1,2 s de recarga) y Onda (6 s): empuja a todos los que estén a menos de
 * 120 px. Caer a un pozo = reaparecer a los 2 s. Gana la partida el primero en llegar a 100 puntos o, a los 3 min, quien
 * más tenga (a igual puntaje, el que llegó primero). Después, resultados 8 s y una partida nueva.
 */
import { TPS, RESTITUTION, newDisc, setMove, MOVE_STILL, encodeMove, collideAll, stepMotion, applyInputs, queueInputs, bounceRect, blast } from '../../../shared/arena-physics.js';

export { TPS };

export const CFG = {
  tps: TPS,
  half: 320, // medio lado de la arena
  discR: 18,
  pits: [
    [0, -200, 34],
    [-173, 100, 34],
    [173, 100, 34],
  ], // x, y, radio
  hills: [
    [0, 0],
    [-170, -110],
    [170, -110],
    [0, 205],
  ],
  hillR: 70,
  hillSec: 25, // cada cuánto se mueve
  warnSec: 3, // cuánto antes avisa adónde va
  goal: 100,
  matchSec: 180,
  overSec: 8, // resultados antes de la partida siguiente
  respawnSec: 2,
  waveR: 120,
  wavePower: 380,
  wallBounce: 0.8,
  koSec: 2, // ventana del último toque (para el aviso "tiraste a…", no da puntos)
  hitMin: 20,
};

export const PH = { play: 1, over: 2 };
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

export class World {
  constructor(seed = 1) {
    this.tps = TPS;
    this.rnd = mulberry32(seed);
    this.tick = 0;
    this.players = new Map();
    this.nextNum = 1;
    this.deaths = [];
    this.waveLog = []; // Ondas recientes { k, x, y, num, color } (cada jugador manda las que todavía no vio)
    this.hillTicks = CFG.hillSec * TPS;
    this.warnTicks = CFG.warnSec * TPS;
    this.respawnTicks = CFG.respawnSec * TPS;
    this.matchTicks = CFG.matchSec * TPS;
    this.koTicks = CFG.koSec * TPS;
    this.phase = PH.play;
    this.matchN = 1;
    this.t0 = 0; // paso en que empezó la partida
    this.overAt = 0;
    this.result = { n: 0, winner: 0, top: [] };
    this.hill = 0; // punto actual
    this.next = 0; // adónde va después
    this.hillAt = this.hillTicks; // paso en que se muda
    this.occ = 0; // quién está solo en la colina (num), 0 vacía, -1 disputada
    this.next = this._pickNext();
    this._alive = [];
  }

  // ------------------------------------------------ jugadores
  addPlayer({ id = null, name = '', color = 0, bot = false } = {}) {
    const num = this.nextNum++;
    const p = newDisc({ r: CFG.discR });
    Object.assign(p, { num, id, name, color, bot, alive: false, score: 0, acc: 0, falls: 0, hillSec: 0, wins: 0, lastHit: 0, lastHitAt: -1e9, deadAt: -1e9, reachedAt: 0, spawns: 0 });
    this.players.set(num, p);
    return p;
  }

  removePlayer(num) {
    this.players.delete(num);
  }

  canSpawn(num) {
    const p = this.players.get(num);
    return !!p && !p.alive && this.tick - p.deadAt >= this.respawnTicks;
  }

  waitTicks(num) {
    const p = this.players.get(num);
    return p ? Math.max(0, this.respawnTicks - (this.tick - p.deadAt)) : 0;
  }

  /** Hace nacer al disco en un lugar libre (lejos de pozos y de otros discos). En los resultados espera a la partida nueva. */
  spawn(num) {
    const p = this.players.get(num);
    if (!p || p.alive || !this.canSpawn(num)) return false;
    p.ready = true;
    if (this.phase !== PH.play) return false;
    this._place(p);
    return true;
  }

  _place(p) {
    const H = CFG.half - 40;
    let best = [0, 0];
    let bestD = -1;
    for (let t = 0; t < 16; t++) {
      const x = (this.rnd() * 2 - 1) * H;
      const y = (this.rnd() * 2 - 1) * H;
      let d = 1e9;
      for (const [px, py, pr] of CFG.pits) d = Math.min(d, Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) - pr - 20);
      for (const q of this.players.values()) {
        if (!q.alive || q === p) continue;
        d = Math.min(d, Math.sqrt((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y)) - 36);
      }
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    p.x = best[0];
    p.y = best[1];
    p.vx = p.vy = 0;
    p.invMass = p.invMass0;
    p.dashCd = p.dashT = 0;
    p.waveCd = 0;
    p.inbox = [];
    p.lastK = this.tick;
    p.lastHit = 0;
    p.lastHitAt = -1e9;
    p.alive = true;
    setMove(p, encodeMove(-p.x, -p.y));
    setMove(p, MOVE_STILL);
  }

  queueInputs(p, list) {
    return queueInputs(p, list, this.tick, 2);
  }

  // ------------------------------------------------ puntaje
  leaderboard(n = 10) {
    const list = [];
    for (const p of this.players.values()) list.push([p.num, p.score, p.wins]);
    list.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return n ? list.slice(0, n) : list;
  }

  _pickNext() {
    const n = CFG.hills.length;
    return (this.hill + 1 + Math.floor(this.rnd() * (n - 1))) % n;
  }

  /** Ticks que faltan para que la colina se mude. */
  hillIn() {
    return Math.max(0, this.hillAt - this.tick);
  }

  // ------------------------------------------------ un paso
  step() {
    this.tick++;
    if (this.phase === PH.over) {
      if (this.tick >= this.overAt) this._newMatch();
      return;
    }
    const alive = this._alive;
    alive.length = 0;
    for (const p of this.players.values()) if (p.alive) alive.push(p);
    const tick = this.tick;
    for (const p of alive) {
      if (p.inbox.length) {
        applyInputs(p, p.inbox, tick, (q, a) => a === 2 && this._wave(q));
        while (p.inbox.length && p.inbox[0].s <= p.seq) p.inbox.shift();
      }
      stepMotion(p);
      bounceRect(p, CFG.half, CFG.half, CFG.wallBounce);
    }
    collideAll(alive, RESTITUTION, (a, b, speed) => {
      if (speed < CFG.hitMin) return;
      a.lastHit = b.num;
      a.lastHitAt = tick;
      b.lastHit = a.num;
      b.lastHitAt = tick;
    });
    // pozos
    for (const p of alive) {
      for (const [px, py, pr] of CFG.pits) {
        if ((p.x - px) * (p.x - px) + (p.y - py) * (p.y - py) < pr * pr) {
          this._fall(p);
          break;
        }
      }
    }
    // la colina se muda
    if (tick >= this.hillAt) {
      this.hill = this.next;
      this.next = this._pickNext();
      this.hillAt = tick + this.hillTicks;
    }
    // quién está adentro: solo una persona suma
    const [hx, hy] = CFG.hills[this.hill];
    const R2 = CFG.hillR * CFG.hillR;
    let who = 0;
    for (const p of alive) {
      if (!p.alive) continue;
      if ((p.x - hx) * (p.x - hx) + (p.y - hy) * (p.y - hy) <= R2) who = who === 0 ? p.num : -1;
    }
    this.occ = who;
    if (who > 0) {
      const p = this.players.get(who);
      if (++p.acc >= TPS) {
        p.acc = 0;
        p.score++;
        p.hillSec++;
        p.reachedAt = tick;
        if (p.score >= CFG.goal) return this._endMatch();
      }
    }
    if (tick - this.t0 >= this.matchTicks) this._endMatch();
  }

  _wave(p) {
    blast(this._alive, p.x, p.y, CFG.waveR, CFG.wavePower, p);
    for (const q of this._alive) {
      if (q === p) continue;
      const d2 = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
      if (d2 <= CFG.waveR * CFG.waveR) {
        q.lastHit = p.num;
        q.lastHitAt = this.tick;
      }
    }
    this.waveLog.push({ k: this.tick, x: p.x, y: p.y, num: p.num, color: p.color });
    while (this.waveLog.length && this.tick - this.waveLog[0].k > 90) this.waveLog.shift();
  }

  _fall(p) {
    const credit = p.lastHit && this.tick - p.lastHitAt <= this.koTicks ? this.players.get(p.lastHit) : null;
    p.alive = false;
    p.deadAt = this.tick;
    p.falls++;
    p.dashT = 0;
    p.invMass = p.invMass0;
    this.deaths.push({ num: p.num, id: p.id, by: credit ? credit.num : 0, x: p.x, y: p.y, color: p.color, stats: { score: p.score, falls: p.falls, hill: p.hillSec } });
  }

  _endMatch() {
    // gana el que más tiene; a igual puntaje, el que llegó primero
    let best = null;
    for (const p of this.players.values()) {
      if (!best || p.score > best.score || (p.score === best.score && p.reachedAt < best.reachedAt)) best = p;
    }
    const winner = best && best.score > 0 ? best : null;
    if (winner) winner.wins++;
    this.result = { n: this.matchN, winner: winner ? winner.num : 0, top: this.leaderboard(5).map(([num, score]) => [num, score]), time: Math.floor((this.tick - this.t0) / TPS) };
    this.phase = PH.over;
    this.overAt = this.tick + CFG.overSec * TPS;
    this.occ = 0;
  }

  _newMatch() {
    this.matchN++;
    this.phase = PH.play;
    this.t0 = this.tick;
    this.hill = 0;
    this.hillAt = this.tick + this.hillTicks;
    this.next = this._pickNext();
    for (const p of this.players.values()) {
      p.score = p.acc = p.hillSec = p.falls = 0;
      p.reachedAt = 0;
      p.alive = false;
      p.deadAt = -1e9;
    }
    for (const p of this.players.values()) if (p.ready) this._place(p);
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
    mix(this.hill);
    for (const p of this.players.values()) {
      mix(p.num);
      mix(p.alive ? 1 : 0);
      mix(p.x);
      mix(p.y);
      mix(p.vx);
      mix(p.vy);
      mix(p.score);
    }
    return h >>> 0;
  }
}
