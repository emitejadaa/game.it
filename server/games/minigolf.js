/** Minigolf: física autoritativa con el mismo código que el cliente. */
import { COURSES } from '../../public/games/minigolf/shared/holes.js';
import { simulate, shotDuration } from '../../public/games/minigolf/shared/physics.js';
import { Match } from '../../public/games/minigolf/shared/match.js';

const TURN_MS = 35e3;
const BETWEEN_MS = 4500;

function scheduleTurn(room, api, delay) {
  const d = room.data;
  const m = d.match;
  api.clearTimer('turn');
  if (!m.turn) return;
  const connected = api.connected(m.turn);
  const wait = delay ?? Math.max(0, d.busyUntil - Date.now()) + (connected ? TURN_MS : 1500);
  d.turnDeadline = Date.now() + wait;
  api.setTimer('turn', wait, () => {
    if (!m.turn) return;
    const id = m.turn;
    const outcome = m.skip(id, 1);
    api.broadcast({ t: 'timeout', id });
    if (outcome) api.broadcast({ t: 'outcome', ...outcome });
    afterChange(room, api);
  });
}

function nextHole(room, api) {
  const d = room.data;
  api.clearTimer('next');
  if (!d.match.nextHole()) return finish(room, api);
  d.holeStart = Date.now();
  d.busyUntil = Date.now() + 1800;
  scheduleTurn(room, api);
  api.broadcast({ t: 'hole', idx: d.match.holeIdx });
  api.sync();
}

function afterChange(room, api) {
  const d = room.data;
  const m = d.match;
  if (m.state === 'playing') scheduleTurn(room, api);
  else if (m.state === 'between') {
    api.clearTimer('turn');
    d.turnDeadline = 0;
    api.setTimer('next', Math.max(0, d.busyUntil - Date.now()) + BETWEEN_MS, () => nextHole(room, api));
  } else if (m.state === 'finished') {
    api.clearTimer('turn');
    api.setTimer('next', Math.max(0, d.busyUntil - Date.now()) + 800, () => finish(room, api));
  }
  api.sync();
}

function finish(room, api) {
  room.data.turnDeadline = 0;
  api.end({ standings: room.data.match.standings() });
}

export default {
  minPlayers: 1,
  maxPlayers: 4,
  defaults: { holes: 9 },
  settings: (cur, s) => ({ holes: COURSES[Number(s.holes)] ? Number(s.holes) : cur.holes }),
  view(room) {
    const d = room.data;
    return {
      holes: room.settings.holes,
      match: d ? d.match.toJSON() : null,
      holeTime: d?.holeStart ? (Date.now() - d.holeStart) / 1000 : 0,
      turnDeadline: d?.turnDeadline ? d.turnDeadline - Date.now() : 0,
      busy: d ? Math.max(0, d.busyUntil - Date.now()) : 0,
    };
  },
  start(room, api) {
    room.data = {
      match: new Match({ course: COURSES[room.settings.holes], players: api.players().map((p) => ({ id: p.id, name: p.name, color: p.color })) }),
      holeStart: 0,
      busyUntil: 0,
      turnDeadline: 0,
    };
    nextHole(room, api);
  },
  message(room, api, p, msg) {
    if (msg.t !== 'shot') return false;
    const d = room.data;
    const m = d.match;
    if (m.turn !== p.id) return api.send(p.id, { t: 'error', code: 'not_your_turn' });
    if (Date.now() < d.busyUntil) return api.send(p.id, { t: 'error', code: 'busy' });
    const angle = Number(msg.a);
    const power = Number(msg.p);
    if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0 || power > 1) return false;
    const t0 = (Date.now() - d.holeStart) / 1000;
    const res = simulate(m.hole, m.player(p.id).ball, angle, power, t0);
    d.busyUntil = Date.now() + shotDuration(res) + 600;
    api.touch();
    const outcome = m.applyShot(p.id, res);
    api.broadcast({ t: 'shot', id: p.id, res: { path: res.path, events: res.events, x: res.x, y: res.y, holed: res.holed, water: res.water, t0 } });
    if (outcome) api.broadcast({ t: 'outcome', ...outcome });
    afterChange(room, api);
  },
  onDisconnect(room, api, id) {
    if (room.data?.match.turn === id) scheduleTurn(room, api, 1500);
  },
  leave(room, api, id) {
    room.data.match.deactivate(id);
    afterChange(room, api);
  },
};
