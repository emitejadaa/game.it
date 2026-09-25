/**
 * Serpentina online: arenas en tiempo real. El mundo corre acá a 25 pasos/s; cada jugador recibe
 * (vía shared/sync.js) solo las serpientes y la comida que tiene cerca: el cuerpo entero la primera
 * vez y después solo la cabeza. Los bots completan la arena.
 *
 * Mensajes del cliente: spawn { name, color }, i { x, y, b } (dirección y turbo).
 */
import { performance } from 'node:perf_hooks';
import { World, TPS, PALETTE } from '../../public/games/serpentina/shared/world.js';
import { brain, think, BOT_NAMES } from '../../public/games/serpentina/shared/bots.js';
import { Viewer } from '../../public/games/serpentina/shared/sync.js';

const TICK_MS = 1000 / TPS;
const MAX_HUMANS = 16;
const CROWD = 16;
const BOT_RESPAWN = 2.5 * TPS;

const clean = (v, n) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, n);

const table = (w) => [...w.players.values()].map((p) => [p.num, p.name, p.color, p.bot ? 1 : 0]);

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

function init(room, api, id) {
  const d = room.data;
  if (!d) return;
  let v = d.viewers.get(id);
  if (!v || !d.w.players.has(v.num)) {
    const person = room.players.get(id);
    const p = d.w.addPlayer({ id, name: person?.name || '', color: 0 });
    v = new Viewer(d.w, p.num);
    d.viewers.set(id, v);
    fillBots(room, api);
  } else v.reset(); // reconexión: se vuelve a mandar todo
  const p = d.w.players.get(v.num);
  api.broadcast({ t: 'pl', p: table(d.w) });
  api.send(id, { t: 'me', num: v.num, alive: p.alive, R: d.w.R });
  api.send(id, { t: 'lb', l: d.w.leaderboard() });
}

function loop(room, api) {
  const d = room.data;
  if (!d) return;
  const now = performance.now();
  let due = Math.floor((now - d.t0) / TICK_MS) - d.ticks;
  if (due > 5) {
    d.t0 += (due - 5) * TICK_MS;
    due = 5;
  }
  const w = d.w;
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
    const dead = new Set();
    for (const x of w.deaths) {
      dead.add(x.id);
      const victim = w.players.get(x.num);
      if (victim && !victim.bot && victim.id) api.send(victim.id, { t: 'dead', by: x.by, stats: x.stats });
      const killer = w.players.get(x.by);
      if (killer && !killer.bot && killer.id) api.send(killer.id, { t: 'ko', n: x.num });
    }
    w.deaths.length = 0;
    for (const person of room.players.values()) {
      if (!person.connected) continue;
      const v = d.viewers.get(person.id);
      if (v) api.send(person.id, v.build(dead));
    }
    w.events.clear();
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
    return { name: room.settings.name || host?.name || 'Serpentina', top: top ? top[1] : 0, bots: room.data?.bots.length || 0 };
  },

  start(room, api) {
    const w = new World((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    room.data = { w, brains: new Map(), bots: [], viewers: new Map(), botSeq: Math.floor(Math.random() * 30), t0: performance.now(), ticks: 0 };
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
    const v = d?.viewers.get(id);
    if (v) d.w.setInput(v.num, 0, 0, false);
  },

  removed(room, api, id) {
    const d = room.data;
    const v = d?.viewers.get(id);
    if (!d || !v) return;
    d.viewers.delete(id);
    d.w.removePlayer(v.num);
    fillBots(room, api);
    api.broadcast({ t: 'pl', p: table(d.w) });
  },

  command(room, api, person, msg) {
    const d = room.data;
    switch (msg.t) {
      case 'spawn': {
        if (!d) return true;
        const v = d.viewers.get(person.id);
        const p = v && d.w.players.get(v.num);
        if (!p) {
          init(room, api, person.id);
          return true;
        }
        if (p.alive) return true;
        p.name = clean(msg.name, 16) || person.name;
        const c = Number(msg.color);
        p.color = Number.isInteger(c) && c >= 0 && c < PALETTE.length ? c : 0;
        d.w.spawn(v.num);
        api.broadcast({ t: 'pl', p: table(d.w) });
        api.send(person.id, { t: 'me', num: v.num, alive: true, R: d.w.R });
        api.touch();
        return true;
      }
      case 'i': {
        if (!d) return true;
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const v = d.viewers.get(person.id);
        if (v) d.w.setInput(v.num, x, y, msg.b === 1);
        api.touch();
        return true;
      }
      default:
        return undefined;
    }
  },
};
