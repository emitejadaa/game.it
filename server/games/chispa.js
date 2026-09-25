/**
 * Chispa online: la mesa (public/games/chispa/shared/table.js) corre en el servidor, que baraja,
 * valida cada jugada y le manda a cada jugador solo lo que puede ver (su mano y cuántas cartas
 * tienen los demás). El anfitrión puede sumar jugadores de la compu. Si alguien se desconecta,
 * juega solo hasta que vuelva; si se va, lo reemplaza la compu.
 *
 * Mensajes: play { id, color }, draw, pass, call, catch { p }; again (otra partida, anfitrión).
 */
import { randomInt } from 'node:crypto';
import { Table } from '../../public/games/chispa/shared/table.js';

const TURN_MS = 25e3;
const MAX = 6;
const BOT_NAMES = ['Luna', 'Toto', 'Mora', 'Pipo', 'Kiara', 'Bruno', 'Nina', 'Tomi', 'Vera', 'Iván'];
const BOT_COLORS = ['#ff3fb4', '#a3ff3c', '#ffb627', '#b388ff', '#ff7a45'];
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const humans = (api) => api.players().filter((p) => p.connected);

function start(room, api) {
  const st = room.settings;
  const people = humans(api).slice(0, MAX);
  const bots = Math.max(0, Math.min(st.bots, MAX - people.length));
  const seats = people.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: 0 }));
  for (let i = 0; i < bots; i++) seats.push({ id: `bot${i}`, name: BOT_NAMES[i], color: BOT_COLORS[i], bot: st.level });
  // orden de la mesa al azar
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  const io = {
    emit: (i, view) => api.send(seats[i].id, { t: 'g', s: view }),
    timer: (k, ms, fn) =>
      api.setTimer(k, ms, () => {
        fn();
        api.touch();
      }),
    clear: (k) => api.clearTimer(k),
    over: (standings) => setTimeout(() => room.data?.table === table && room.state === 'playing' && api.end({ standings }), 0),
  };
  const table = new Table({ seats, opts: { target: st.target, stack: !!st.stack, turnMs: TURN_MS }, io, rng });
  room.data = { table };
  table.start();
}

const seatOf = (room, pid) => room.data?.table.seats.findIndex((s) => s.id === pid) ?? -1;

export default {
  minPlayers: 1,
  maxPlayers: MAX,
  defaults: { bots: 1, level: 2, target: 200, stack: 1 },

  settings(cur, s) {
    const n = (v, ok, d) => (ok.includes(Number(v)) ? Number(v) : d);
    return {
      bots: n(s.bots, [0, 1, 2, 3, 4], cur.bots),
      level: n(s.level, [1, 2, 3], cur.level),
      target: n(s.target, [0, 200, 500], cur.target),
      stack: n(s.stack, [0, 1], cur.stack),
    };
  },

  canStart(room) {
    const people = [...room.players.values()].filter((p) => p.connected).length;
    return people + Math.min(room.settings.bots, MAX - people) >= 2 ? null : 'need_players';
  },

  view(room) {
    const T = room.data?.table;
    return { chispa: T ? { round: T.round, phase: T.phase, n: T.seats.length } : null };
  },

  start,

  message(room, api, p, msg) {
    const T = room.data?.table;
    if (!T) return true;
    const i = seatOf(room, p.id);
    if (i < 0) return false;
    if (!['play', 'draw', 'pass', 'call', 'catch'].includes(msg.t)) return false;
    if (msg.t === 'play' && !Number.isInteger(msg.id)) return false;
    T.act(i, msg);
    api.touch();
    return true;
  },

  /** Otra partida con la misma mesa (solo el anfitrión, con la partida terminada). */
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
    const T = room.data?.table;
    if (!T) return;
    const i = seatOf(room, pid);
    if (i < 0) return;
    T.setAway(i, false);
    api.send(pid, { t: 'g', s: T.view(i) });
  },

  onDisconnect(room, api, pid) {
    const i = seatOf(room, pid);
    if (i >= 0) room.data.table.setAway(i, true);
  },

  leave(room, api, pid) {
    const T = room.data?.table;
    if (!T || T.phase === 'over') return;
    const i = seatOf(room, pid);
    if (i >= 0) T.toBot(i);
    // si no queda ninguna persona, se corta
    if (!T.seats.some((s) => !s.bot)) api.toLobby();
  },
};
