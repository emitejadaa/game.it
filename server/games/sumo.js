/**
 * Sumo online: discos que se empujan sobre una plataforma que se achica (30 pasos/s, un snapshot cada 2 = 15 por segundo).
 * El mundo (public/games/sumo/shared) es el mismo que corre sin conexión; la base de arenas (_arena.js) pone el bucle,
 * los bots, el presupuesto de CPU y el backpressure. Rondas continuas: ver world.js.
 *
 * Mensajes del cliente: spawn { name, color } (quiero jugar: entra a la próxima ronda), i { e: [[seq, paso, mov, empujón], …] }
 * (el movimiento que mantiene apretado, solo cuando cambia, con las últimas 3 de redundancia; ver /shared/arena-physics.js).
 */
import { arenaGame } from './_arena.js';
import { World, PALETTE, CFG } from '../../public/games/sumo/shared/world.js';
import { brain, think, BOT_NAMES } from '../../public/games/sumo/shared/bots.js';
import { Viewer } from '../../public/games/sumo/shared/sync.js';

export default arenaGame({
  id: 'sumo',
  title: 'Sumo',
  World,
  tps: 30,
  snapEvery: 2,
  maxHumans: 10,
  crowd: 10,
  colors: PALETTE.length,
  botNames: BOT_NAMES,
  brain,
  think,
  viewer: (w, num) => new Viewer(w, num),
  meExtra: (w) => ({ R0: w.R0, r: CFG.discR, tps: w.tps }),
  command: ({ w, p }, msg) => (msg.t === 'i' ? w.queueInputs(p, msg.e) : undefined),
});
