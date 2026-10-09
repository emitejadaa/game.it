/**
 * Caída Libre online: bloques que caen en modo "último en pie" para hasta 16 personas más bots. Cada persona simula su
 * propio tablero en su navegador y manda cada fijado; el servidor lo reaplica con las mismas reglas
 * (public/games/caida/shared/rules.js), valida y contesta con líneas, ataque y basura (ver shared/match.js).
 *
 * Por qué un módulo propio y no `arenaGame` (_arena.js): esa base gira alrededor de un paso fijo de física con
 * snapshots por jugador (mundo.step() a 20-30 Hz). Acá no hay física en el servidor: todo ocurre por eventos (un fijado,
 * un ataque, una eliminación) y las únicas cosas con reloj son los bots, la basura (que entra 1 s después) y los
 * resúmenes de rivales a 2 Hz. Un bucle de 100 ms alcanza (cuesta ~0,05 ms por vuelta con 16 bots), así que tampoco
 * se declara `realtime`: no ocupa uno de los MAX_RT_ROOMS. Del contrato de `arenaGame` se reusa lo que sirve: arranque
 * automático al crear (así "Partida rápida" nunca cae en un lobby), entrada tardía como espectador, bots que
 * completan la sala, persona desconectada = bot hasta que vence la gracia, mensaje `reset` al entrar o reconectar,
 * backpressure en lo que se puede perder (resúmenes y ranking) y un bucle protegido con try/catch.
 *
 * Mensajes del cliente: hi { color }, lk { n, p, r, x, y, h, a } (fijado), tg { m } (objetivo del ataque), watch { n }.
 */
import { performance } from 'node:perf_hooks';
import { Match } from '../../public/games/caida/shared/match.js';

const CROWDS = { small: 8, normal: 12, big: 16 };
const TICK_MS = 100;
const MAX_BUFFERED = 64 * 1024; // un cliente con más de esto sin enviar se saltea los mensajes descartables

const clean = (v, n) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, n);
const logError = (...a) => console.error(new Date().toISOString(), 'error', ...a);

function makeOut(api, d) {
  const human = (num) => {
    const p = d.m.players.get(num);
    return p && !p.bot && p.id ? p : null;
  };
  return {
    to: (num, msg) => {
      const p = human(num);
      if (p) api.send(p.id, msg);
    },
    all: (msg) => api.broadcast(msg),
    // resúmenes y ranking: se serializan una vez y se saltean los clientes que no dan abasto (el siguiente trae todo)
    soft: (msg) => {
      const text = JSON.stringify(msg);
      for (const person of api.players()) {
        if (!person.connected) continue;
        if (api.bufferedAmount(person.id) > MAX_BUFFERED) {
          d.skipped++;
          continue;
        }
        api.sendRaw(person.id, text);
      }
    },
    kick: (num) => {
      const p = human(num);
      if (!p) return;
      d.banned.add(p.id);
      api.players().find((x) => x.id === p.id)?.ws?.close(4003, 'cheat');
    },
  };
}

function anyConnected(room) {
  for (const p of room.players.values()) if (p.connected) return true;
  return false;
}

function sendJoin(d, api, id) {
  const num = d.ids.get(id);
  for (const m of d.m.joinMessages(num)) api.send(id, m);
}

/** Alta de una persona (espectadora hasta la próxima ronda si ya empezó) y todo lo que necesita para ponerse al día. */
function init(room, api, id) {
  const d = room.data;
  if (!d) return;
  let num = d.ids.get(id);
  if (!num || !d.m.players.has(num)) {
    const person = room.players.get(id);
    const p = d.m.addPlayer({ id, name: person?.name || '', color: d.ids.size % 12 });
    num = p.num;
    d.ids.set(id, num);
    api.broadcast({ t: 'pl', p: d.m.table() }, id);
  } else {
    d.m.t = d.clock();
    d.m.setAuto(num, false); // vuelve a jugar la persona
  }
  d.m.t = d.clock();
  sendJoin(d, api, id);
}

function tick(room, api, d) {
  const now = performance.now();
  if (!anyConnected(room)) {
    d.paused += now - d.last; // nadie mira: la partida se pausa (no gasta CPU)
    d.last = now;
    return;
  }
  d.last = now;
  d.m.step(d.clock());
  const ms = performance.now() - now;
  room.avgTickMs = room.avgTickMs ? room.avgTickMs * 0.98 + ms * 0.02 : ms;
}

function loop(room, api) {
  const d = room.data;
  if (!d) return;
  try {
    tick(room, api, d);
    d.fails = 0;
  } catch (e) {
    // un error no puede dejar la sala congelada: se reprograma. Si se repite, algo está roto y se cierra
    logError('caida', room.code, 'loop', e?.stack || e);
    d.fails++;
    if (d.fails >= 5) return api.close('error');
  }
  api.setTimer('loop', TICK_MS, () => loop(room, api));
}

function start(room, api) {
  const now = performance.now();
  const d = (room.data = { m: null, ids: new Map(), banned: new Set(), paused: 0, last: now, fails: 0, skipped: 0, clock: () => performance.now() - d.paused });
  d.m = new Match({ seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, crowd: CROWDS[room.settings.crowd] || 12, bots: room.settings.bots !== false, out: makeOut(api, d) });
  room.avgTickMs = 0;
  for (const person of room.players.values()) {
    const p = d.m.addPlayer({ id: person.id, name: person.name, color: d.ids.size % 12 });
    d.ids.set(person.id, p.num);
  }
  d.m.t = d.clock();
  for (const person of room.players.values()) sendJoin(d, api, person.id);
  d.m.newRound(d.clock()); // la primera persona que entra pone en marcha la sala
  api.setTimer('loop', TICK_MS, () => loop(room, api));
}

export default {
  realtime: false,
  minPlayers: 1,
  maxPlayers: 16,
  lateJoin: true,
  listable: true,
  defaults: { name: '', public: true, bots: true, crowd: 'normal' },

  settings(cur, s) {
    const out = { ...cur };
    if (typeof s.name === 'string') out.name = clean(s.name, 28);
    if (typeof s.public === 'boolean') out.public = s.public;
    if (typeof s.bots === 'boolean') out.bots = s.bots;
    if (typeof s.crowd === 'string' && Object.hasOwn(CROWDS, s.crowd)) out.crowd = s.crowd;
    return out;
  },

  view(room) {
    return { arena: !!room.data, round: room.data?.m.round || 0, phase: room.data?.m.phase || 'idle' };
  },

  listInfo(room) {
    const host = room.players.get(room.host);
    const d = room.data;
    const top = d?.m.leaderboard(1)[0];
    const topName = top && d.m.players.get(top[0])?.name;
    let bots = 0;
    if (d) for (const p of d.m.players.values()) if (p.bot) bots++;
    return { name: room.settings.name || host?.name || 'Caída Libre', top: topName || '', bots, crowd: room.settings.crowd, round: d?.m.round || 0, left: d?.m.aliveCount || 0 };
  },

  start,

  onJoin(room, api, id) {
    if (!room.data) {
      // arranque automático: la sala no pasa por el lobby
      room.state = 'playing';
      try {
        start(room, api);
      } catch (e) {
        logError('caida', room.code, 'start', e?.stack || e);
        for (const t of room.timers.keys()) api.clearTimer(t);
        room.state = 'lobby';
        room.data = null;
      }
      return;
    }
    init(room, api, id);
  },

  onReconnect(room, api, id) {
    const d = room.data;
    if (!d) return;
    if (d.banned.has(id)) {
      api.send(id, { t: 'banned' });
      api.players().find((x) => x.id === id)?.ws?.close(4003, 'cheat');
      return;
    }
    init(room, api, id);
  },

  onDisconnect(room, api, id) {
    const d = room.data;
    const num = d?.ids.get(id);
    if (!num) return;
    d.m.t = d.clock();
    d.m.setAuto(num, true); // sigue en la partida con un bot hasta que venza la gracia del núcleo
  },

  removed(room, api, id) {
    const d = room.data;
    const num = d?.ids.get(id);
    if (!d || !num) return;
    d.ids.delete(id);
    d.banned.delete(id);
    d.m.leave(num, d.clock());
    api.broadcast({ t: 'pl', p: d.m.table() });
  },

  command(room, api, person, msg) {
    const d = room.data;
    if (!d) return undefined;
    const num = d.ids.get(person.id);
    if (!num) return undefined;
    switch (msg.t) {
      case 'lk':
        return d.m.lock(num, msg, d.clock());
      case 'tg':
        return d.m.setTarget(num, msg.m);
      case 'watch':
        return d.m.watch(num, msg.n);
      case 'hi':
        return d.m.hello(num, msg);
      default:
        return undefined;
    }
  },
};
