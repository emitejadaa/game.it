/**
 * Clashball: servidor autoritativo en tiempo real (fútbol estilo HaxBall).
 *
 * - La física corre acá a 60 ticks/s con el mismo código que el cliente (shared/match.js).
 * - Cada cliente manda sus teclas solo cuando cambian ({ t: 'i', k, q }); el servidor las aplica
 *   al llegar y confirma el número q y el tick en que empezó a aplicarlas, para que el cliente
 *   corrija su predicción.
 * - 30 veces por segundo se envía el estado completo ({ t: 's' }) más los eventos (patadas, goles).
 * - Como en HaxBall, se puede entrar con el partido en curso (como espectador), el anfitrión arma
 *   los equipos, agrega bots, pausa o corta el partido, y hay chat.
 */
import { performance } from 'node:perf_hooks';
import { Match } from '../../public/games/clashball/shared/match.js';
import { brain, think } from '../../public/games/clashball/shared/ai.js';
import { MODES, STADIUMS, resolveStadium } from '../../public/games/clashball/shared/stadiums.js';

const MAX_PEOPLE = 12;
const MAX_TEAM = 6;
const TICK_MS = 1000 / 60;
const SNAP_EVERY = 2;
const CHAT_GAP_MS = 600;
const BOT_NAMES = ['Tito', 'Lola', 'Rulo', 'Pipa', 'Nacho', 'Mora', 'Chelo', 'Ramiro', 'Kiara', 'Dante', 'Uma', 'Beto'];
const LEVELS = ['easy', 'normal', 'hard'];

const clean = (v, n, strip = /[\u0000-\u001f\u007f<>]/g) =>
  String(v ?? '')
    .replace(strip, '')
    .trim()
    .slice(0, n);
const avatarOf = (v) => Array.from(clean(v, 8).replace(/\s/g, '')).slice(0, 2).join('');

function state(room) {
  return (room.cb ||= { teams: new Map(), avatars: new Map(), bots: [], botSeq: 0, chatAt: new Map(), last: null });
}

function members(room) {
  const cb = state(room);
  const out = [];
  for (const p of room.players.values()) {
    const team = cb.teams.get(p.id) || 0;
    if (team) out.push({ id: p.id, team, name: p.name, avatar: cb.avatars.get(p.id) || '' });
  }
  for (const b of cb.bots) if (b.team) out.push({ id: b.id, team: b.team, name: b.name, avatar: b.avatar, bot: b.level });
  return out;
}

const teamSize = (room, team) => members(room).filter((m) => m.team === team).length;

function perTeam(room) {
  const m = members(room);
  return Math.max(1, m.filter((x) => x.team === 1).length, m.filter((x) => x.team === 2).length);
}

/** Cambia de equipo a alguien (persona o bot) y lo refleja en el partido en curso. */
function moveTo(room, api, id, team) {
  const cb = state(room);
  const bot = cb.bots.find((b) => b.id === id);
  if (!bot && !room.players.has(id)) return;
  const cur = bot ? bot.team : cb.teams.get(id) || 0;
  if (cur === team) return;
  if (team && teamSize(room, team) >= MAX_TEAM) return;
  if (bot) {
    if (!team) {
      removeBot(room, api, id);
      return;
    }
    bot.team = team;
  } else cb.teams.set(id, team);
  const d = room.data;
  if (d?.match) {
    const m = d.match;
    if (!team) m.removePlayer(id);
    else {
      const p = room.players.get(id);
      m.addPlayer({ id, team, name: bot ? bot.name : p.name, avatar: bot ? bot.avatar : cb.avatars.get(id) || '', bot: bot?.level || null });
      if (bot && !d.brains[id]) d.brains[id] = brain(bot.level, ++d.seed);
    }
  }
}

function removeBot(room, api, id) {
  const cb = state(room);
  cb.bots = cb.bots.filter((b) => b.id !== id);
  room.data?.match?.removePlayer(id);
}

function snapshot(room, api) {
  const d = room.data;
  const acks = {};
  for (const [id, a] of d.acks) acks[id] = a;
  api.broadcast({ t: 's', ...d.match.snapshot(), a: acks, ev: d.ev.splice(0), pz: d.paused ? 1 : 0 });
}

function tick(room, api) {
  const d = room.data;
  const m = d.match;
  for (const p of m.players) if (p.bot) m.setInput(p.id, think(m, p, (d.brains[p.id] ||= brain(p.bot, ++d.seed))));
  m.step();
  for (const e of m.events) {
    if (e.t === 'kick') d.ev.push({ t: 'kick', id: e.id, x: Math.round(e.x), y: Math.round(e.y) });
    else if (e.t === 'goal' || e.t === 'end' || e.t === 'kickoff' || e.t === 'reset') d.ev.push(e);
    else if (e.t === 'post') d.ev.push({ t: 'post', v: +e.v.toFixed(2) });
  }
  d.ticks++;
}

function loop(room, api) {
  const d = room.data;
  if (!d || d.done) return;
  const now = performance.now();
  if (d.paused) d.t0 = now - d.ticks * TICK_MS;
  let due = Math.floor((now - d.t0) / TICK_MS) - d.ticks;
  if (due > 10) {
    // el servidor se trabó: se descarta el tiempo perdido en vez de acelerar el partido
    d.t0 += (due - 10) * TICK_MS;
    due = 10;
  }
  for (let i = 0; i < due && !d.match.over; i++) tick(room, api);
  if (d.match.over) return finish(room, api);
  // 30 estados/s; en salas grandes 20/s para cuidar el ancho de banda
  const every = room.players.size > 6 ? SNAP_EVERY + 1 : SNAP_EVERY;
  if (d.ticks - d.lastSnap >= every || (d.paused && now - d.lastPauseSnap > 500)) {
    d.lastSnap = d.ticks;
    d.lastPauseSnap = now;
    snapshot(room, api);
  }
  const next = d.t0 + (d.ticks + 1) * TICK_MS - performance.now();
  api.setTimer('loop', Math.max(1, next), () => loop(room, api));
}

function finish(room, api) {
  const d = room.data;
  d.done = true;
  snapshot(room, api);
  const summary = d.match.summary();
  state(room).last = summary;
  api.clearTimer('loop');
  api.end({ summary });
}

export default {
  minPlayers: 1,
  maxPlayers: MAX_PEOPLE,
  lateJoin: true,
  listable: true,
  defaults: { name: '', public: true, mode: 'classic', stadium: 'auto', score: 3, time: 3, lock: false },

  settings(cur, s) {
    const out = { ...cur };
    if (typeof s.name === 'string') out.name = clean(s.name, 28);
    if (typeof s.public === 'boolean') out.public = s.public;
    if (MODES[s.mode]) out.mode = s.mode;
    if (s.stadium === 'auto' || STADIUMS[s.stadium]) out.stadium = s.stadium;
    const score = Number(s.score);
    if (Number.isInteger(score) && score >= 0 && score <= 14) out.score = score;
    const time = Number(s.time);
    if (Number.isInteger(time) && time >= 0 && time <= 14) out.time = time;
    if (typeof s.lock === 'boolean') out.lock = s.lock;
    return out;
  },

  view(room) {
    const cb = state(room);
    const d = room.data;
    return {
      teams: Object.fromEntries(cb.teams),
      avatars: Object.fromEntries(cb.avatars),
      bots: cb.bots.map(({ id, name, team, level, avatar }) => ({ id, name, team, level, avatar })),
      last: cb.last,
      live: d?.match ? { id: d.id, stadium: d.match.cfg.stadium, mode: d.match.cfg.mode, score: d.match.cfg.scoreLimit, time: d.match.cfg.timeLimit } : null,
      paused: !!d?.paused,
    };
  },

  listInfo(room) {
    const s = room.settings;
    const host = room.players.get(room.host);
    const m = room.data?.match;
    return {
      name: s.name || host?.name || 'Clashball',
      mode: s.mode,
      stadium: m?.cfg.stadium || s.stadium,
      bots: state(room).bots.length,
      sc: m ? [m.score[1], m.score[2]] : null,
    };
  },

  onJoin(room, api, id) {
    state(room).teams.set(id, 0);
  },

  onReconnect(room, api) {
    if (room.data?.match && !room.data.done) snapshot(room, api);
  },

  onDisconnect(room, api, id) {
    room.data?.match?.setInput(id, 0);
  },

  removed(room, api, id) {
    const cb = state(room);
    cb.teams.delete(id);
    cb.avatars.delete(id);
    cb.chatAt.delete(id);
    room.data?.match?.removePlayer(id);
    room.data?.acks.delete(id);
    if (!room.players.size) cb.bots = [];
  },

  canStart(room) {
    return members(room).length ? null : 'need_players';
  },

  start(room, api) {
    const s = room.settings;
    const stadium = resolveStadium(s.stadium, perTeam(room), s.mode);
    const match = new Match({ stadium, mode: s.mode, scoreLimit: s.score, timeLimit: s.time, players: members(room) });
    room.data = { id: (state(room).matches = (state(room).matches || 0) + 1), match, brains: {}, seed: 7, acks: new Map(), ev: [], ticks: 0, t0: performance.now(), lastSnap: -99, lastPauseSnap: 0, paused: false, done: false };
    state(room).last = null;
    snapshot(room, api);
    api.setTimer('loop', TICK_MS, () => loop(room, api));
  },

  /** Mensajes propios, en cualquier estado de la sala. */
  command(room, api, p, msg) {
    const cb = state(room);
    const isHost = room.host === p.id;
    const d = room.data;
    switch (msg.t) {
      case 'i': {
        const k = msg.k;
        const q = msg.q;
        if (!Number.isInteger(k) || k < 0 || k > 31 || !Number.isInteger(q) || q < 0 || q > 2 ** 31) return false;
        if (!d?.match || d.done) return true;
        if (d.paused) return true;
        d.match.setInput(p.id, k);
        d.acks.set(p.id, [q, d.match.tick]);
        api.touch();
        return true;
      }
      case 'chat': {
        const text = clean(msg.m, 140, /[\u0000-\u001f\u007f]/g); // el cliente lo muestra como texto plano
        const now = Date.now();
        if (!text || now - (cb.chatAt.get(p.id) || 0) < CHAT_GAP_MS) return true;
        cb.chatAt.set(p.id, now);
        api.broadcast({ t: 'chat', id: p.id, name: p.name, team: cb.teams.get(p.id) || 0, m: text });
        api.touch();
        return true;
      }
      case 'avatar': {
        cb.avatars.set(p.id, avatarOf(msg.a));
        const pl = d?.match?.player(p.id);
        if (pl) pl.avatar = cb.avatars.get(p.id);
        api.sync();
        return true;
      }
      case 'team': {
        const team = Number(msg.team);
        if (![0, 1, 2].includes(team)) return false;
        const target = typeof msg.id === 'string' ? msg.id : p.id;
        if (target !== p.id && !isHost) return true;
        if (target === p.id && room.settings.lock && !isHost) return true;
        moveTo(room, api, target, team);
        api.touch();
        api.sync();
        return true;
      }
      case 'bot': {
        if (!isHost) return true;
        if (typeof msg.rm === 'string') removeBot(room, api, msg.rm);
        else {
          const team = Number(msg.team);
          const level = LEVELS.includes(msg.level) ? msg.level : 'normal';
          if (![1, 2].includes(team) || cb.bots.length >= MAX_PEOPLE || teamSize(room, team) >= MAX_TEAM) return true;
          const n = cb.botSeq++;
          const bot = { id: `bot${n}`, name: `${BOT_NAMES[n % BOT_NAMES.length]} (bot)`, team: 0, level, avatar: '' };
          cb.bots.push(bot);
          moveTo(room, api, bot.id, team);
        }
        api.sync();
        return true;
      }
      case 'shuffle': {
        // mezcla a todos los que están en un equipo y los reparte parejo
        if (!isHost) return true;
        const list = members(room).map((m) => m.id);
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        list.forEach((id) => moveTo(room, api, id, 0));
        list.forEach((id, i) => moveTo(room, api, id, (i % 2) + 1));
        api.sync();
        return true;
      }
      case 'pause': {
        if (!isHost || !d?.match || d.done) return true;
        d.paused = !!msg.on;
        api.broadcast({ t: 'paused', on: d.paused, by: p.name });
        api.sync();
        return true;
      }
      case 'stop': {
        if (!isHost || room.state !== 'playing') return true;
        api.clearTimer('loop');
        if (d) d.done = true;
        api.broadcast({ t: 'stopped', by: p.name });
        api.toLobby();
        return true;
      }
      default:
        return undefined;
    }
  },
};
