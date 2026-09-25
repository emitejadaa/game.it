/**
 * Mecha Corta online: la partida (public/games/mecha/shared/game.js) corre en el servidor, que
 * valida cada palabra con el diccionario, reparte la bomba y lleva la mecha (el tiempo que le
 * queda no se manda a nadie). Lo que escribe el jugador de turno se reenvía en vivo a todos.
 * El diccionario de cada idioma se carga recién la primera vez que se usa.
 *
 * Mensajes: type { w }, word { w }; again (otra partida, anfitrión).
 */
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { Dict, decode } from '../../public/games/mecha/shared/dict.js';
import { Bomb } from '../../public/games/mecha/shared/game.js';

const MAX = 12;
const DIR = new URL('../../public/games/mecha/dict/', import.meta.url);
const BOT_NAMES = ['Luna', 'Toto', 'Mora', 'Pipo', 'Kiara', 'Bruno', 'Nina', 'Tomi'];
const BOT_COLORS = ['#ff3fb4', '#3dd68c', '#ffd23f', '#b388ff', '#22d3ff', '#ff7a45', '#a3ff3c'];
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const dicts = {};
let prompts = null;
function dict(lang) {
  if (!dicts[lang]) {
    prompts ||= JSON.parse(readFileSync(new URL('prompts.json', DIR), 'utf8'));
    dicts[lang] = new Dict(lang, decode(readFileSync(new URL(`${lang}.txt`, DIR), 'utf8')), prompts[lang]);
  }
  return dicts[lang];
}

function start(room, api) {
  const st = room.settings;
  const people = api
    .players()
    .filter((p) => p.connected)
    .slice(0, MAX);
  const bots = Math.max(0, Math.min(st.bots, MAX - people.length));
  const players = people.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: 0 }));
  for (let i = 0; i < bots; i++) players.push({ id: `bot${i}`, name: BOT_NAMES[i], color: BOT_COLORS[i], bot: st.level });
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  const io = {
    now: () => Date.now(),
    emit: (view) => api.broadcast({ t: 'g', s: view }),
    event: (e) => api.broadcast(e),
    timer: (k, ms, fn) =>
      api.setTimer(k, ms, () => {
        fn();
        api.touch();
      }),
    clear: (k) => api.clearTimer(k),
    over: (result) => setTimeout(() => room.data?.game === game && room.state === 'playing' && api.end({ result }), 0),
  };
  const game = new Bomb({ players, opts: { lives: st.lives, diff: st.diff, fuse: st.fuse }, dict: dict(st.lang), io, rng });
  room.data = { game, lastType: new Map() };
  game.start();
}

const indexOf = (room, pid) => room.data?.game.players.findIndex((p) => p.id === pid) ?? -1;

export default {
  minPlayers: 1,
  maxPlayers: MAX,
  defaults: { lang: 'es', diff: 2, lives: 2, fuse: 'normal', bots: 0, level: 2 },

  settings(cur, s) {
    const pick = (v, ok, d) => (ok.includes(v) ? v : d);
    return {
      lang: pick(s.lang, ['es', 'en'], cur.lang),
      diff: pick(Number(s.diff), [1, 2, 3], cur.diff),
      lives: pick(Number(s.lives), [1, 2, 3], cur.lives),
      fuse: pick(s.fuse, ['short', 'normal', 'long'], cur.fuse),
      bots: pick(Number(s.bots), [0, 1, 2, 3, 5], cur.bots),
      level: pick(Number(s.level), [1, 2, 3], cur.level),
    };
  },

  canStart(room) {
    const people = [...room.players.values()].filter((p) => p.connected).length;
    return people + Math.min(room.settings.bots, MAX - people) >= 2 ? null : 'need_players';
  },

  view(room) {
    const g = room.data?.game;
    return { mecha: g ? { phase: g.phase, n: g.players.length } : null };
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    if (!d) return true;
    const i = indexOf(room, p.id);
    if (i < 0) return false;
    if (typeof msg.w !== 'string' || msg.w.length > 40) return false;
    if (msg.t === 'type') {
      // como mucho ~20 por segundo
      const now = Date.now();
      if (now - (d.lastType.get(p.id) || 0) < 45) return true;
      d.lastType.set(p.id, now);
      d.game.type(i, msg.w);
      return true;
    }
    if (msg.t === 'word') {
      d.game.submit(i, msg.w);
      api.touch();
      return true;
    }
    return false;
  },

  command(room, api, p, msg) {
    if (msg.t !== 'again') return undefined;
    if (room.state !== 'finished' || room.host !== p.id) return true;
    room.state = 'playing';
    start(room, api);
    api.touch();
    api.sync();
    return true;
  },

  onReconnect(room, api, pid) {
    const g = room.data?.game;
    if (!g) return;
    const i = indexOf(room, pid);
    if (i >= 0) g.setAway(i, false);
    api.send(pid, { t: 'g', s: g.view() });
  },

  onDisconnect(room, api, pid) {
    const i = indexOf(room, pid);
    if (i >= 0) room.data.game.setAway(i, true);
  },

  leave(room, api, pid) {
    const g = room.data?.game;
    if (!g || g.phase !== 'play') return;
    const i = indexOf(room, pid);
    if (i >= 0) g.remove(i);
  },
};
