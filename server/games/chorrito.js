/**
 * Chorrito online: carrera de hasta 6 con el mismo nivel de tubos (la semilla la pone el servidor y cada navegador arma el
 * mismo con el generador compartido). Cada uno va mandando cuánto lleva ordenado y gana el primero que lo resuelve.
 * El servidor arma el nivel una vez y, para dar por terminado a alguien, rehace uno por uno los trasvases que mandó: tienen
 * que ser todos válidos y dejar el nivel resuelto. El tiempo lo mide el servidor (con un piso de lo que lleva hacer tantos
 * trasvases a mano).
 *
 * Mensajes del cliente: state { s: [lo ordenado que lleva (engine.settled)] } unas 4 veces por segundo; finish { moves: texto, dos letras por trasvase }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { CAP, generate, replay } from '../../public/games/chorrito/shared/engine.js';

const COLORS = ['6', '8', '10', '12'];
const MS_PER_MOVE = 300;

export default raceGame({
  maxPlayers: 6,
  countdownMs: 5000,
  maxMs: 20 * 60e3,
  graceAfterFirstMs: 90e3,
  rejoinMs: Number(process.env.CHORRITO_REJOIN_MS) || 20e3, // si el último que falta recarga la página, se lo espera
  defaults: { colors: '8', public: false },
  settings: (cur, s) => ({
    colors: typeof s.colors === 'string' && COLORS.includes(s.colors) ? s.colors : cur.colors,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    const seed = randomInt(1, 2 ** 31);
    const colors = Number(room.settings.colors);
    d.pub = { seed, colors };
    d.level = generate(seed, { colors, extra: 2 });
  },
  partial: (s, d) => ({ done: Math.max(0, Math.min(CAP * d.pub.colors, Math.round(s[0]))) }),
  validateFinish(room, d, p, msg) {
    if (Date.now() < d.startAt) return null; // nadie termina antes de la largada
    const r = replay(d.level.tubes, msg.moves, CAP);
    if (!r.ok || !r.solved) return null;
    const elapsed = Date.now() - d.startAt;
    return { time: Math.round(Math.max(r.moves * MS_PER_MOVE, elapsed)), moves: r.moves };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (a.dnf ? (b.done || 0) - (a.done || 0) : a.time - b.time)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, colors: Number(room.settings.colors) }),
});
