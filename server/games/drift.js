import { raceGame } from './_race.js';
import { TRACKS, build, minLapMs } from '../../public/games/drift/tracks.js';

// tiempo mínimo razonable por vuelta de cada pista (largo / velocidad máxima con nitro), en ms
const MIN_LAP = TRACKS.map((tr) => minLapMs(build(tr)));
const LAPS = [1, 2, 3, 5];

export default raceGame({
  maxPlayers: 6,
  defaults: { track: 0, laps: 3 },
  settings: (cur, s) => {
    const track = Number(s.track);
    const laps = Number(s.laps);
    return {
      track: Number.isInteger(track) && track >= 0 && track < TRACKS.length ? track : cur.track,
      laps: LAPS.includes(laps) ? laps : cur.laps,
    };
  },
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
