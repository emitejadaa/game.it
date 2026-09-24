import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';

export default raceGame({
  countdownMs: 3500,
  maxMs: 20 * 60e3,
  graceAfterFirstMs: 0, // se sigue jugando hasta que caen todos
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31) };
  },
  validateFinish(room, d, p, msg) {
    const score = Number(msg.score);
    const secs = (Date.now() - d.startAt) / 1000;
    // tope físico: ni con cohete se sube más de ~2500 unidades por segundo
    if (!Number.isFinite(score) || score < 0 || score > Math.max(500, secs * 2500)) return null;
    return { score: Math.round(score), time: Math.round(secs * 1000) };
  },
  rank: (list) => list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
});
