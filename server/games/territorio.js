/**
 * Territorio online: captura de territorio en una grilla de 120×120 para hasta 10 personas más bots (10 pasos/s,
 * un snapshot por paso). El mundo (public/games/territorio/shared) es el mismo que corre sin conexión; la base de
 * arenas (_arena.js) pone el bucle, los bots, el presupuesto de CPU y el backpressure.
 *
 * Mensajes del cliente: spawn { name, color }, i { e: [[seq, paso, dir, 0], …] } (giros, con las últimas 3 de
 * redundancia; `paso` es el paso del servidor en el que el cliente la aplicó).
 */
import { arenaGame } from './_arena.js';
import { World, PALETTE } from '../../public/games/territorio/shared/world.js';
import { brain, think, BOT_NAMES } from '../../public/games/territorio/shared/bots.js';
import { Viewer } from '../../public/games/territorio/shared/sync.js';

export default arenaGame({
  id: 'territorio',
  title: 'Territorio',
  World,
  tps: 10,
  maxHumans: 10,
  crowd: 12,
  colors: PALETTE.length,
  botNames: BOT_NAMES,
  brain,
  think,
  viewer: (w, num) => new Viewer(w, num),
  meExtra: (w) => ({ size: w.size, tps: w.tps }),
  command: ({ w, p }, msg) => (msg.t === 'i' ? w.queueInputs(p, msg.e) : undefined),
});
