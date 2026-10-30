/**
 * Gemas online: duelo de hasta 6 con las mismas gemas (la semilla la pone el servidor y cada navegador arma la misma
 * partida con el motor compartido) y la misma cantidad de jugadas. Cada uno juega a su ritmo y va mandando su puntaje;
 * gana el que más puntos junta cuando todos terminaron. Para que nadie se invente un puntaje, al terminar cada uno manda
 * sus jugadas (dos letras cada una: el casillero y la dirección) y el servidor rehace la partida: tienen que ser todas
 * válidas y exactamente las que había, y el puntaje que cuenta es el que sale de ahí. Se rechaza lo que no entra en el
 * tiempo que pasó.
 *
 * Mensajes del cliente: state { s: [puntaje, jugadas hechas] } unas 3 veces por segundo; finish { moves: texto }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { replay } from '../../public/games/gemas/shared/engine.js';

const MOVES = ['20', '30', '40'];
const MIN_MS_PER_MOVE = process.env.GEMAS_FAST ? 0 : 350; // un intercambio con su animación no baja de esto (GEMAS_FAST: para las pruebas)

export default raceGame({
  maxPlayers: 6,
  countdownMs: 5000,
  maxMs: (room) => (Number(room.settings.moves || 30) * 10 + 30) * 1000,
  graceAfterFirstMs: 0, // gana el que más puntos junta, no el que termina primero
  rejoinMs: Number(process.env.GEMAS_REJOIN_MS) || 20e3,
  defaults: { moves: '30', public: false },
  settings: (cur, s) => ({
    moves: typeof s.moves === 'string' && MOVES.includes(s.moves) ? s.moves : cur.moves,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31), moves: Number(room.settings.moves || 30) };
  },
  partial: (s) => ({ score: Math.max(0, Math.min(9999999, Math.round(s[0]))) }),
  validateFinish(room, d, p, msg) {
    const elapsed = Date.now() - d.startAt;
    if (elapsed < 0) return null; // nadie termina antes de la largada
    const g = replay(d.pub.seed, { types: 6 }, msg.moves, { limit: d.pub.moves });
    if (!g || g.moves !== d.pub.moves) return null;
    if (g.moves * MIN_MS_PER_MOVE > elapsed + 1500) return null; // más rápido de lo posible
    return { score: g.score, time: Math.round(elapsed), chain: g.bestChain };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (b.score || 0) - (a.score || 0) || (a.time || 0) - (b.time || 0)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, moves: Number(room.settings.moves) }),
});
