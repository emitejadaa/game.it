/** Minigolf: física autoritativa con el mismo código que el cliente. */
import { COURSES } from '../../public/games/minigolf/shared/holes.js';
import { simulate, simulatePush, findContact, shotDuration } from '../../public/games/minigolf/shared/physics.js';
import { Match } from '../../public/games/minigolf/shared/match.js';

const TURN_MS = 35e3;
const BETWEEN_MS = 4500;
const CHECK_MS = 100; // cada cuánto se revisa si un obstáculo móvil toca una pelota quieta
const LOOK_S = 0.3; // anticipación: el empujón se avisa un poco antes para que llegue a tiempo

/**
 * Obstáculos móviles: empujan las pelotas quietas de todos (sea o no su turno). El servidor
 * busca el primer contacto de cada pelota, simula el empujón y lo reparte como un tiro.
 */
export function checkMovers(room, api) {
  const d = room.data;
  const m = d?.match;
  if (!m || m.state !== 'playing' || !m.hole.movers.length) return;
  const now = Date.now();
  const tEnd = (now - d.holeStart) / 1000 + LOOK_S;
  let changed = false;
  for (const p of m.players) {
    if (p.done || !p.active || !p.ball) continue;
    // desde que la pelota quedó quieta (o desde lo último revisado)
    const from = Math.max(d.checked[p.id] ?? 0, ((d.flight[p.id] || 0) - d.holeStart) / 1000);
    if (from > tEnd) continue;
    const tc = findContact(m.hole, p.ball, from, tEnd);
    if (tc < 0) {
      d.checked[p.id] = tEnd;
      continue;
    }
    const res = simulatePush(m.hole, p.ball, tc);
    const dur = shotDuration(res);
    const outcome = m.applyPush(p.id, res);
    d.flight[p.id] = d.holeStart + tc * 1000 + dur;
    d.checked[p.id] = tc + dur / 1000;
    api.broadcast({ t: 'push', id: p.id, hole: m.holeIdx, res: { path: res.path, events: res.events, x: res.x, y: res.y, holed: res.holed, water: res.water, t0: tc, push: true } });
    if (outcome) api.broadcast({ t: 'outcome', ...outcome });
    // si era la pelota del que tiene el turno, no puede tirar hasta que se quede quieta
    if (m.turn === p.id || outcome) d.busyUntil = Math.max(d.busyUntil, d.flight[p.id] + 300);
    changed = true;
  }
  if (changed) afterChange(room, api);
  api.setTimer('movers', CHECK_MS, () => checkMovers(room, api));
}

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
  d.flight = {};
  d.checked = {};
  scheduleTurn(room, api);
  api.setTimer('movers', CHECK_MS, () => checkMovers(room, api));
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
      flight: {},
      checked: {},
    };
    nextHole(room, api);
  },
  message(room, api, p, msg) {
    if (msg.t !== 'shot') return false;
    const d = room.data;
    const m = d.match;
    if (m.turn !== p.id) return api.send(p.id, { t: 'error', code: 'not_your_turn' });
    if (Date.now() < d.busyUntil || Date.now() < (d.flight[p.id] || 0)) return api.send(p.id, { t: 'error', code: 'busy' });
    const angle = Number(msg.a);
    const power = Number(msg.p);
    if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0 || power > 1) return false;
    const t0 = (Date.now() - d.holeStart) / 1000;
    const res = simulate(m.hole, m.player(p.id).ball, angle, power, t0);
    d.busyUntil = Date.now() + shotDuration(res) + 600;
    // mientras vuela, los obstáculos no la empujan; se vuelve a revisar desde que se detiene
    d.flight[p.id] = Date.now() + shotDuration(res);
    d.checked[p.id] = t0 + shotDuration(res) / 1000;
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
