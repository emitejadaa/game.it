import { raceGame } from './_race.js';

// tiempo mínimo por vuelta de cada pista (ms): si alguien reporta menos, es trampa
const MIN_LAP = [14000, 16000, 18000];

export default raceGame({
  defaults: { track: 0, laps: 3 },
  settings: (cur, s) => ({
    track: [0, 1, 2].includes(Number(s.track)) ? Number(s.track) : cur.track,
    laps: Math.max(1, Math.min(5, Number(s.laps) || cur.laps)),
  }),
  onStart(room, d) {
    d.pub = { track: room.settings.track, laps: room.settings.laps };
  },
  validateFinish(room, d, p, msg) {
    const time = Number(msg.time);
    const elapsed = Date.now() - d.startAt;
    if (!Number.isFinite(time) || time < MIN_LAP[d.pub.track] * d.pub.laps || time > elapsed + 3000) return null;
    const best = Number(msg.best);
    return { time: Math.round(time), best: Number.isFinite(best) ? Math.round(best) : null, drift: Math.max(0, Math.min(1e8, Math.round(Number(msg.drift) || 0))) };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (a.time ?? 1e12) - (b.time ?? 1e12)),
});
