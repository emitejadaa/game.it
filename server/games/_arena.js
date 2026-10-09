/**
 * Base de las arenas en tiempo real (juegos "FFA" con bots): `arenaGame(config)` devuelve el módulo
 * completo para server/index.js. Un juego nuevo es un archivo de ~100 líneas: su mundo determinista,
 * sus bots y cómo arma lo que ve cada jugador. La base se ocupa de lo demás:
 *
 *  - Bucle de paso fijo (setTimer) con recuperación de atraso (máx. `maxCatchUp` pasos) dentro de try/catch:
 *    un error no congela la arena; 5 seguidos cierran la sala ('error').
 *  - Arranque automático al crear la sala (la primera persona que entra la pone en marcha): "Partida
 *    rápida" nunca cae en un lobby que nadie empezó. Se puede entrar con la partida en curso.
 *  - Bots que completan la arena hasta `crowd` y se sacan o suman según entran o salen personas. Un
 *    gobernador de presupuesto mide el costo de cada paso: si el promedio de 5 s pasa del 25% del
 *    intervalo saca 2 bots (mínimo 4); los devuelve cuando baja del 10%.
 *  - Un snapshot por jugador (lo arma el `viewer` del juego, con su área de interés) y con backpressure:
 *    si el socket tiene más de 64 KB sin enviar, ese snapshot se saltea (los viewers mandan deltas desde
 *    "lo último que mandé", así que el siguiente trae todo).
 *  - Ranking a 1 Hz, muertes ('dead' al que murió, 'ko' a quien lo mató) y tabla de jugadores ('pl').
 *  - Un jugador desconectado sigue en el mundo, manejado por un bot, hasta que vence la gracia del núcleo.
 *    Si no queda nadie conectado el mundo se pausa (no gasta CPU).
 *  - Mensaje 'reset' al entrar y al reconectar: el cliente borra lo viejo antes de recibir el estado.
 *
 * Contrato del mundo (`config.World`, determinista y compartido con el modo sin conexión):
 *   new World(seed, opts)   .tick  .rnd()  .players: Map<num, { num, id, name, color, bot, alive }>
 *   addPlayer({ id, name, color, bot }) → player · removePlayer(num) · spawn(num) → bool · step()
 *   .deaths: [{ num, id, by, stats… }] (la base lo vacía después de cada paso) · leaderboard(n) → [[num, puntaje], …]
 *   canSpawn(num) → bool (opcional: espera para reaparecer) · waitTicks(num) (opcional)
 *
 * Ejemplo (el esqueleto de un juego):
 *
 *   export default arenaGame({
 *     id: 'estela', title: 'Estela', World, tps: 20, maxHumans: 10, crowd: 10,
 *     botNames: BOT_NAMES, brain, think,                       // bots: brain(nivel, rnd) y think(mundo, jugador, cerebro)
 *     viewer: (w, num) => new Viewer(w, num),                  // { reset(), build(muertes) → mensaje | null }
 *     meExtra: (w) => ({ size: w.size, tps: w.tps }),          // datos extra para el cliente en { t: 'me' }
 *     command: ({ w, p }, msg) => (msg.t === 'i' ? w.queueInputs(p, msg.e) : undefined),
 *     settings: (out, s) => ({ ...out, speed: s.speed === 'fast' ? 'fast' : 'normal' }),
 *   });
 *
 * Mensajes que la base manda: reset · pl [[num, nombre, color, bot]] · me { num, alive, wait, …meExtra } ·
 * lb { l } · dead { by, stats } · ko { n } · s (lo arma el viewer). Del cliente entiende 'spawn' { name, color };
 * el resto lo resuelve `config.command`. Todo lo que llega ya pasó por el rate limit del núcleo; `command`
 * debe validar números (finitos, enteros, acotados) y devolver true / false (mal formado) / undefined (no es mío).
 */
import { performance } from 'node:perf_hooks';

const clean = (v, n) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, n);

const logError = (...a) => console.error(new Date().toISOString(), 'error', ...a);

/**
 * Gobernador de presupuesto: promedio móvil del costo de cada paso. `update()` (una vez por segundo) devuelve
 * -step / +step / 0 cuando hay que sacar o devolver bots; `cap` es la cantidad máxima de bots permitida.
 */
export class BudgetGovernor {
  constructor({ tickMs, windowTicks = 100, hi = 0.25, lo = 0.1, step = 2, min = 4, max = 12 }) {
    Object.assign(this, { tickMs, windowTicks, hi, lo, step, min, max, cap: max });
    this.buf = new Float64Array(windowTicks);
    this.reset();
  }

  reset() {
    this.n = 0;
    this.i = 0;
    this.sum = 0;
    this.buf.fill(0);
  }

  add(ms) {
    this.sum += ms - this.buf[this.i];
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.windowTicks;
    if (this.n < this.windowTicks) this.n++;
  }

  get avg() {
    return this.n ? this.sum / this.n : 0;
  }

  update() {
    if (this.n < this.windowTicks) return 0; // hace falta una ventana completa con los bots actuales
    const a = this.avg;
    let next = this.cap;
    if (a > this.hi * this.tickMs) next = Math.max(Math.min(this.min, this.cap), this.cap - this.step);
    else if (a < this.lo * this.tickMs) next = Math.min(this.max, this.cap + this.step);
    const delta = next - this.cap;
    this.cap = next;
    if (delta) this.reset();
    return delta;
  }
}

export function arenaGame(cfg) {
  const {
    World,
    id: gameId = 'arena',
    title = 'Arena',
    snapEvery = 1,
    maxHumans = 10,
    maxCatchUp = 3,
    maxBuffered = 64 * 1024,
    colors = 12,
    botNames = ['Bot'],
    autopilot = true,
  } = cfg;
  const gov = { windowSec: 5, hi: 0.25, lo: 0.1, step: 2, min: 4, ...cfg.governor };
  const val = (v, settings) => (typeof v === 'function' ? v(settings) : v);

  // ------------------------------------------------------------ jugadores y bots
  const table = (w) => [...w.players.values()].map((p) => [p.num, p.name, p.color, p.bot ? 1 : 0]);
  const humansIn = (w) => {
    let n = 0;
    for (const p of w.players.values()) if (!p.bot) n++;
    return n;
  };

  /** Bots que corresponden ahora: hasta `crowd` entre personas y bots, sin pasar del tope del gobernador. */
  function fillBots(room, api) {
    const d = room.data;
    if (!d) return;
    const w = d.w;
    const crowd = room.settings.bots === false ? 0 : val(cfg.crowd ?? maxHumans, room.settings);
    const want = Math.max(0, Math.min(d.gov.cap, crowd - humansIn(w)));
    let changed = false;
    while (d.bots.length < want && cfg.brain) {
      const n = d.botSeq++;
      const p = w.addPlayer({ name: botNames[n % botNames.length], color: n % colors, bot: true });
      d.brains.set(p.num, cfg.brain(1 + (n % 3), w.rnd));
      d.bots.push(p.num);
      w.spawn(p.num);
      changed = true;
    }
    while (d.bots.length > want) {
      const num = d.bots.pop();
      w.removePlayer(num);
      d.brains.delete(num);
      changed = true;
    }
    if (changed) api.broadcast({ t: 'pl', p: table(w) });
  }

  /** Alta de una persona en el mundo (sin nacer todavía) y todo lo que el cliente necesita para empezar. */
  function init(room, api, id) {
    const d = room.data;
    if (!d) return;
    const w = d.w;
    let num = d.nums.get(id);
    let p = num && w.players.get(num);
    if (!p) {
      const person = room.players.get(id);
      p = w.addPlayer({ id, name: person?.name || '', color: d.nums.size % colors });
      num = p.num;
      d.nums.set(id, num);
      d.viewers.set(id, cfg.viewer(w, num));
      fillBots(room, api);
    } else {
      d.viewers.get(id)?.reset(); // reconexión: se vuelve a mandar todo
      d.autos.delete(num); // vuelve a manejar la persona
      d.brains.delete(num);
    }
    api.send(id, { t: 'reset' });
    api.send(id, { t: 'pl', p: table(w) });
    api.send(id, meMsg(d, p));
    api.send(id, { t: 'lb', l: w.leaderboard(10) });
    api.broadcast({ t: 'pl', p: table(w) }, id);
  }

  function meMsg(d, p) {
    const msg = { t: 'me', num: p.num, alive: p.alive, ...cfg.meExtra?.(d.w, p) };
    if (!p.alive && d.w.waitTicks) msg.wait = Math.round((d.w.waitTicks(p.num) * 1000) / d.tps);
    return msg;
  }

  // ------------------------------------------------------------ bucle
  function botsStep(d, w) {
    const drive = (num) => {
      const p = w.players.get(num);
      if (!p) return;
      if (!p.alive) {
        if (!w.canSpawn || w.canSpawn(num)) w.spawn(num);
      } else cfg.think?.(w, p, d.brains.get(num));
    };
    for (const num of d.bots) drive(num);
    for (const num of d.autos) drive(num);
  }

  function sendSnapshots(room, api, d) {
    for (const person of room.players.values()) {
      if (!person.connected) continue;
      const v = d.viewers.get(person.id);
      if (!v) continue;
      if (api.bufferedAmount && api.bufferedAmount(person.id) > maxBuffered) {
        d.skipped++; // el cliente no da abasto: este snapshot se descarta
        continue;
      }
      const msg = v.build(d.pending);
      if (msg) api.send(person.id, msg);
    }
    d.pending.length = 0;
  }

  function anyConnected(room) {
    for (const p of room.players.values()) if (p.connected) return true;
    return false;
  }

  function tick(room, api) {
    const d = room.data;
    if (!d) return;
    const w = d.w;
    const start = performance.now();
    if (!anyConnected(room)) {
      d.t0 = start - d.ticks * d.tickMs; // nadie mira: el mundo se pausa
      return;
    }
    let due = Math.floor((start - d.t0) / d.tickMs) - d.ticks;
    if (due > maxCatchUp) {
      d.t0 += (due - maxCatchUp) * d.tickMs; // el servidor se trabó: no acelerar el mundo
      due = maxCatchUp;
    }
    if (due <= 0) return;
    for (let i = 0; i < due; i++) {
      botsStep(d, w);
      w.step();
      d.ticks++;
      for (const x of w.deaths) {
        const victim = w.players.get(x.num);
        if (victim && !victim.bot && victim.id) api.send(victim.id, { t: 'dead', by: x.by, stats: x.stats });
        const killer = x.by ? w.players.get(x.by) : null;
        if (killer && !killer.bot && killer.id) api.send(killer.id, { t: 'ko', n: x.num });
        if (d.pending.length < 40) d.pending.push(x);
      }
      w.deaths.length = 0;
      if (d.ticks % d.tps === 0) api.broadcast({ t: 'lb', l: w.leaderboard(10) });
    }
    if (d.ticks - d.lastSnap >= snapEvery) {
      d.lastSnap = d.ticks;
      sendSnapshots(room, api, d);
    }
    const per = (performance.now() - start) / due;
    for (let i = 0; i < due; i++) d.gov.add(per);
    room.avgTickMs = d.gov.avg; // lo lee el núcleo para /health
    if (d.ticks - d.lastGov >= d.tps) {
      d.lastGov = d.ticks;
      if (d.gov.update()) fillBots(room, api);
    }
  }

  function loop(room, api) {
    const d = room.data;
    if (!d) return;
    try {
      tick(room, api);
      d.fails = 0;
    } catch (e) {
      // un error no puede dejar la arena congelada: se reprograma. Si se repite, algo está roto y se cierra la sala.
      logError(gameId, room.code, 'loop', e?.stack || e);
      d.fails++;
      if (d.fails >= 5) return api.close('error');
    }
    const next = d.t0 + (d.ticks + 1) * d.tickMs - performance.now();
    api.setTimer('loop', Math.max(1, next), () => loop(room, api));
  }

  function start(room, api) {
    const tps = val(cfg.tps, room.settings);
    const tickMs = 1000 / tps;
    const seed = cfg.seed ? cfg.seed() : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const w = new World(seed, { ...cfg.worldOptions?.(room.settings), tps });
    const crowd = val(cfg.crowd ?? maxHumans, room.settings);
    room.data = {
      w,
      tps,
      tickMs,
      nums: new Map(), // id de persona → num en el mundo
      viewers: new Map(),
      bots: [],
      brains: new Map(),
      autos: new Set(), // personas desconectadas que maneja un bot
      botSeq: Math.floor(Math.random() * 30),
      t0: performance.now(),
      ticks: 0,
      lastSnap: 0,
      lastGov: 0,
      fails: 0,
      skipped: 0,
      pending: [],
      gov: new BudgetGovernor({ tickMs, windowTicks: Math.round(gov.windowSec * tps), hi: gov.hi, lo: gov.lo, step: gov.step, min: gov.min, max: Math.max(gov.min, crowd) }),
    };
    room.avgTickMs = 0;
    fillBots(room, api);
    for (const p of room.players.values()) init(room, api, p.id);
    api.setTimer('loop', tickMs, () => loop(room, api));
  }

  // ------------------------------------------------------------ módulo para server/index.js
  return {
    realtime: true,
    minPlayers: 1,
    maxPlayers: maxHumans,
    lateJoin: true,
    listable: true,
    defaults: { name: '', public: true, bots: true, ...cfg.defaults },

    settings(cur, s) {
      let out = { ...cur };
      if (typeof s.name === 'string') out.name = clean(s.name, 28);
      if (typeof s.public === 'boolean') out.public = s.public;
      if (typeof s.bots === 'boolean') out.bots = s.bots;
      if (cfg.settings) out = cfg.settings(out, s, clean);
      return out;
    },

    view(room) {
      return { arena: !!room.data, ...cfg.view?.(room) };
    },

    listInfo(room) {
      const host = room.players.get(room.host);
      const d = room.data;
      const top = d?.w.leaderboard(1)[0];
      const topName = top && d.w.players.get(top[0])?.name;
      return { name: room.settings.name || host?.name || title, top: topName || '', bots: d?.bots.length || 0, ...cfg.listInfo?.(room) };
    },

    start,

    onJoin(room, api, id) {
      if (!room.data) {
        // arranque automático: la sala no pasa por el lobby
        room.state = 'playing';
        try {
          start(room, api);
        } catch (e) {
          logError(gameId, room.code, 'start', e?.stack || e);
          for (const t of room.timers.keys()) api.clearTimer(t);
          room.state = 'lobby';
          room.data = null;
        }
        return;
      }
      init(room, api, id);
    },

    onReconnect(room, api, id) {
      if (room.data) init(room, api, id);
    },

    onDisconnect(room, api, id) {
      const d = room.data;
      const num = d?.nums.get(id);
      const p = num && d.w.players.get(num);
      if (!p || !cfg.brain || !autopilot) return;
      // sigue en el mundo con un bot al volante hasta que venza la gracia del núcleo
      d.autos.add(num);
      d.brains.set(num, cfg.brain(2, d.w.rnd));
    },

    removed(room, api, id) {
      const d = room.data;
      const num = d?.nums.get(id);
      if (!d || !num) return;
      d.nums.delete(id);
      d.viewers.delete(id);
      d.autos.delete(num);
      d.brains.delete(num);
      d.w.removePlayer(num);
      fillBots(room, api);
      api.broadcast({ t: 'pl', p: table(d.w) });
    },

    command(room, api, person, msg) {
      const d = room.data;
      if (!d) return undefined;
      const num = d.nums.get(person.id);
      const p = num && d.w.players.get(num);
      if (msg.t === 'spawn') {
        if (!p) {
          init(room, api, person.id);
          return true;
        }
        if (p.alive) return true;
        if (d.w.canSpawn && !d.w.canSpawn(num)) {
          api.send(person.id, meMsg(d, p)); // todavía falta: le avisa cuánto
          return true;
        }
        p.name = clean(msg.name, 16) || person.name;
        const c = Number(msg.color);
        p.color = Number.isInteger(c) && c >= 0 && c < colors ? c : p.color;
        d.w.spawn(num);
        api.broadcast({ t: 'pl', p: table(d.w) });
        api.send(person.id, meMsg(d, p));
        return true;
      }
      if (!p) return undefined;
      return cfg.command?.({ room, api, d, w: d.w, p, person }, msg);
    },
  };
}
