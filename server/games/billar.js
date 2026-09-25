/**
 * Billar online (bola 8): el servidor es el árbitro. Recibe el golpe exacto del jugador de turno
 * (velocidad y giro iniciales), lo valida, lo simula con la misma física determinista que el
 * navegador, aplica las reglas y reparte el tiro y el resultado: los dos clientes animan el mismo
 * tiro y terminan en el mismo estado.
 *
 * Mensajes: shot { s, cue, call, k }, aim { a, p, x, y } (se reenvía al rival), again (revancha).
 */
import { simulate, canPlace, validStrike, POCKETS, cloneBalls } from '../../public/games/billar/shared/physics.js';
import { newGame, judge, onEight } from '../../public/games/billar/shared/rules.js';

const TURN_MS = 40e3;

const ser = (g) => ({ b: g.balls.map((b) => [b.n, b.x, b.y, b.on ? 1 : 0]), t: g.turn, g: g.groups, o: g.open, k: g.brk, h: g.inHand, c: g.kitchen, w: g.winner, r: g.reason, s: g.shots });

function state(room) {
  return (room.bs ||= { n: 0, first: null });
}

function start(room, api) {
  const bs = state(room);
  const ids = api
    .players()
    .filter((p) => p.connected)
    .map((p) => p.id)
    .slice(0, 2);
  // el que saca se alterna entre partidas
  const first = bs.first === null ? (Math.random() < 0.5 ? 0 : 1) : 1 - bs.first;
  bs.first = first;
  bs.n++;
  room.data = { n: bs.n, order: ids, game: newGame(Math.random, first), again: [], deadline: 0 };
  schedule(room, api);
}

function schedule(room, api) {
  const d = room.data;
  if (d.game.winner !== null) {
    api.clearTimer('turn');
    d.deadline = 0;
    return;
  }
  d.deadline = Date.now() + TURN_MS;
  api.setTimer('turn', TURN_MS, () => {
    // se acabó el tiempo: falta, bola en mano para el rival
    const g = d.game;
    api.broadcast({ t: 'timeout', p: g.turn });
    d.game = { ...g, turn: 1 - g.turn, inHand: true, kitchen: g.brk, shots: g.shots + 1, foul: 'timeout' };
    schedule(room, api);
    api.sync();
  });
}

function finish(room, api, winner, reason) {
  const d = room.data;
  d.game = { ...d.game, winner, reason };
  api.clearTimer('turn');
  d.deadline = 0;
  api.end({ winner, reason });
}

export default {
  minPlayers: 2,
  maxPlayers: 2,

  view(room) {
    const d = room.data;
    if (!d) return { pool: null };
    return { pool: { n: d.n, order: d.order, st: ser(d.game), left: d.deadline ? d.deadline - Date.now() : 0, turnMs: TURN_MS, again: d.again } };
  },

  canStart(room) {
    return [...room.players.values()].filter((p) => p.connected).length >= 2 ? null : 'need_players';
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    if (!d || d.game.winner !== null) return true;
    const idx = d.order.indexOf(p.id);
    if (idx < 0) return false;
    const g = d.game;
    if (msg.t === 'aim') {
      if (g.turn !== idx) return true;
      const a = Number(msg.a);
      const pw = Number(msg.p);
      if (!Number.isFinite(a) || !Number.isFinite(pw)) return false;
      const out = { t: 'aim', a, p: Math.max(0, Math.min(1, pw)) };
      if (msg.x !== undefined) {
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          out.x = x;
          out.y = y;
        }
      }
      api.broadcast(out, p.id);
      return true;
    }
    if (msg.t !== 'shot') return false;
    if (g.turn !== idx) return api.send(p.id, { t: 'error', code: 'not_your_turn' });
    if (msg.k !== undefined && msg.k !== g.shots) return true; // tiro de un turno viejo
    const s = msg.s || {};
    if (!validStrike(s)) return false;
    const balls = cloneBalls(g.balls);
    let cue = null;
    if (g.inHand) {
      const c = msg.cue;
      if (!Array.isArray(c) || !canPlace(balls, Number(c[0]), Number(c[1]), g.kitchen)) return api.send(p.id, { t: 'error', code: 'bad_place' });
      cue = [Number(c[0]), Number(c[1])];
      balls[0].x = cue[0];
      balls[0].y = cue[1];
      balls[0].on = true;
    }
    let call = null;
    if (onEight(g, idx)) {
      call = Number(msg.call);
      if (!Number.isInteger(call) || call < 0 || call >= POCKETS.length) return api.send(p.id, { t: 'error', code: 'need_call' });
    }
    Object.assign(balls[0], { vx: s.vx, vy: s.vy, wx: s.wx, wy: s.wy, wz: s.wz, rest: false });
    const ev = simulate(balls);
    const { state: next, summary } = judge(g, balls, ev, call);
    d.game = next;
    api.touch();
    api.broadcast({ t: 'shot', by: p.id, p: idx, s: { vx: s.vx, vy: s.vy, wx: s.wx, wy: s.wy, wz: s.wz }, cue, call, st: ser(next), sum: summary });
    if (next.winner !== null) finish(room, api, next.winner, next.reason);
    else {
      schedule(room, api);
      api.sync();
    }
    return true;
  },

  /** Revancha: cuando los dos la piden arranca otra partida (saca el otro). */
  command(room, api, p, msg) {
    if (msg.t !== 'again') return undefined;
    const d = room.data;
    if (room.state !== 'finished' || !d) return true;
    if (!d.again.includes(p.id)) d.again.push(p.id);
    const active = [...room.players.values()].filter((x) => x.connected).map((x) => x.id);
    if (active.length >= 2 && active.every((id) => d.again.includes(id))) {
      room.state = 'playing';
      start(room, api);
    }
    api.touch();
    api.sync();
    return true;
  },

  leave(room, api, id) {
    const d = room.data;
    if (!d || d.game.winner !== null) return;
    const idx = d.order.indexOf(id);
    if (idx < 0) return;
    finish(room, api, 1 - idx, 'abandon');
  },
};
