/**
 * Ameba online: arenas en tiempo real (estilo .io). El mundo corre acá a 25 pasos/s con el mismo
 * código que el modo sin conexión; cada jugador recibe solo lo que tiene cerca ({ t: 's' }) más
 * la comida que reapareció y quién se comió a quién. Los bots completan la arena.
 *
 * Mensajes del cliente: spawn { name, color }, i { x, y, w } (hacia dónde va y si expulsa masa),
 * sp (dividirse).
 */
import { performance } from 'node:perf_hooks';
import { World, TPS, PALETTE } from '../../public/games/ameba/shared/world.js';
import { brain, think, BOT_NAMES } from '../../public/games/ameba/shared/bots.js';

const TICK_MS = 1000 / TPS;
const MAX_HUMANS = 16;
const CROWD = 18; // personas + bots
const BOT_RESPAWN = 3 * TPS;

const clean = (v, n) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, n);

function nums(room) {
  return (room.am ||= new Map()); // id de jugador → número en el mundo
}

function table(w) {
  const out = [];
  for (const p of w.players.values()) out.push([p.num, p.name, p.color, p.bot ? 1 : 0]);
  return out;
}

function fillBots(room, api) {
  const d = room.data;
  if (!d) return;
  const w = d.w;
  const humans = [...w.players.values()].filter((p) => !p.bot).length;
  const want = Math.max(0, CROWD - humans);
  let changed = false;
  while (d.bots.length < want) {
    const n = d.botSeq++;
    const p = w.addPlayer({ name: BOT_NAMES[n % BOT_NAMES.length], color: n % PALETTE.length, bot: true });
    d.brains.set(p.num, brain(1 + (n % 3), w.rnd));
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

/** Alta de una persona en el mundo (sin nacer todavía) y todo lo que necesita para dibujar. */
function init(room, api, id) {
  const d = room.data;
  if (!d) return;
  const map = nums(room);
  let num = map.get(id);
  if (!num || !d.w.players.has(num)) {
    const person = room.players.get(id);
    const p = d.w.addPlayer({ id, name: person?.name || '', color: 0 });
    num = p.num;
    map.set(id, num);
    fillBots(room, api);
  }
  const p = d.w.players.get(num);
  api.broadcast({ t: 'pl', p: table(d.w) });
  api.send(id, { t: 'f0', f: d.w.foodList(), size: d.w.size });
  api.send(id, { t: 'me', num, alive: p.alive });
  api.send(id, { t: 'lb', l: d.w.leaderboard() });
}

function loop(room, api) {
  const d = room.data;
  if (!d) return;
  const now = performance.now();
  let due = Math.floor((now - d.t0) / TICK_MS) - d.ticks;
  if (due > 5) {
    d.t0 += (due - 5) * TICK_MS; // el servidor se trabó: no acelerar el mundo
    due = 5;
  }
  const w = d.w;
  const map = nums(room);
  for (let i = 0; i < due; i++) {
    for (const num of d.bots) {
      const p = w.players.get(num);
      if (!p) continue;
      if (!p.alive) {
        if (w.tick - p.deadAt > BOT_RESPAWN) w.spawn(num);
      } else think(w, p, d.brains.get(num));
    }
    w.step();
    d.ticks++;
    // muertes: aviso al que murió y al que se lo comió
    for (const x of w.deaths) {
      const victim = w.players.get(x.num);
      if (victim && !victim.bot && victim.id) api.send(victim.id, { t: 'dead', by: x.by, stats: x.stats });
      const killer = w.players.get(x.by);
      if (killer && !killer.bot && killer.id) api.send(killer.id, { t: 'ko', n: x.num });
    }
    w.deaths.length = 0;
    const f = w.foodEvents.splice(0);
    const e = w.eatEvents.splice(0);
    for (const person of room.players.values()) {
      if (!person.connected) continue;
      const num = map.get(person.id);
      const p = num && w.players.get(num);
      if (!p) continue;
      api.send(person.id, { t: 's', k: w.tick, c: w.view(p), f, e });
    }
    if (w.tick % TPS === 0) api.broadcast({ t: 'lb', l: w.leaderboard() });
  }
  const next = d.t0 + (d.ticks + 1) * TICK_MS - performance.now();
  api.setTimer('loop', Math.max(1, next), () => loop(room, api));
}

export default {
  minPlayers: 1,
  maxPlayers: MAX_HUMANS,
  lateJoin: true,
  listable: true,
  defaults: { name: '', public: true },

  settings(cur, s) {
    const out = { ...cur };
    if (typeof s.name === 'string') out.name = clean(s.name, 28);
    if (typeof s.public === 'boolean') out.public = s.public;
    return out;
  },

  view(room) {
    return { arena: !!room.data };
  },

  listInfo(room) {
    const host = room.players.get(room.host);
    const top = room.data?.w.leaderboard(1)[0];
    return { name: room.settings.name || host?.name || 'Ameba', top: top ? top[1] : 0, bots: room.data?.bots.length || 0 };
  },

  start(room, api) {
    const w = new World((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    room.data = { w, brains: new Map(), bots: [], botSeq: Math.floor(Math.random() * 30), t0: performance.now(), ticks: 0 };
    fillBots(room, api);
    for (const p of room.players.values()) init(room, api, p.id);
    api.setTimer('loop', TICK_MS, () => loop(room, api));
  },

  onJoin(room, api, id) {
    if (room.data) init(room, api, id);
  },

  onReconnect(room, api, id) {
    if (room.data) init(room, api, id);
  },

  onDisconnect(room, api, id) {
    const d = room.data;
    const num = nums(room).get(id);
    const p = d && num && d.w.players.get(num);
    if (p && p.alive) {
      const [x, y] = d.w.centroid(p);
      d.w.setInput(num, x, y, false);
    }
  },

  removed(room, api, id) {
    const d = room.data;
    const map = nums(room);
    const num = map.get(id);
    map.delete(id);
    if (!d || !num) return;
    d.w.removePlayer(num);
    fillBots(room, api);
    api.broadcast({ t: 'pl', p: table(d.w) });
  },

  command(room, api, person, msg) {
    const d = room.data;
    switch (msg.t) {
      case 'spawn': {
        if (!d) return true;
        const num = nums(room).get(person.id);
        const p = num && d.w.players.get(num);
        if (!p) {
          init(room, api, person.id);
          return true;
        }
        if (p.alive) return true;
        p.name = clean(msg.name, 16) || person.name;
        const c = Number(msg.color);
        p.color = Number.isInteger(c) && c >= 0 && c < PALETTE.length ? c : 0;
        d.w.spawn(num);
        api.broadcast({ t: 'pl', p: table(d.w) });
        api.send(person.id, { t: 'me', num, alive: true });
        api.touch();
        return true;
      }
      case 'i': {
        if (!d) return true;
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const num = nums(room).get(person.id);
        if (num) d.w.setInput(num, x, y, msg.w === 1);
        api.touch();
        return true;
      }
      case 'sp': {
        const num = nums(room).get(person.id);
        if (d && num) d.w.split(num);
        return true;
      }
      default:
        return undefined;
    }
  },
};
