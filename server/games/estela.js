/**
 * Estela online: motos de luz en una arena para hasta 10 personas más bots (20 pasos/s, un snapshot por paso).
 * El mundo (public/games/estela/shared) es el mismo que corre sin conexión; la base de arenas
 * (_arena.js) pone el bucle, los bots, el presupuesto de CPU y el backpressure.
 *
 * Mensajes del cliente: spawn { name, color }, i { e: [[seq, paso, dir, turbo], …] } (giros y turbo, con las
 * últimas 3 de redundancia; `paso` es el paso del servidor en el que el cliente la aplicó).
 */
import { arenaGame } from './_arena.js';
import { World, PALETTE } from '../../public/games/estela/shared/world.js';
import { brain, think, BOT_NAMES } from '../../public/games/estela/shared/bots.js';
import { Viewer } from '../../public/games/estela/shared/sync.js';

const SIZES = { small: 120, normal: 160, big: 200 };

export default arenaGame({
  id: 'estela',
  title: 'Estela',
  World,
  tps: (s) => (s.speed === 'fast' ? 26 : 20),
  worldOptions: (s) => ({ size: SIZES[s.size] || SIZES.normal }),
  maxHumans: 10,
  crowd: 10,
  colors: PALETTE.length,
  botNames: BOT_NAMES,
  brain,
  think,
  viewer: (w, num) => new Viewer(w, num),
  meExtra: (w) => ({ size: w.size, tps: w.tps }),
  defaults: { speed: 'normal', size: 'normal' },
  settings: (out, s) => {
    if (s.speed === 'normal' || s.speed === 'fast') out.speed = s.speed;
    if (typeof s.size === 'string' && Object.hasOwn(SIZES, s.size)) out.size = s.size;
    return out;
  },
  listInfo: (room) => ({ speed: room.settings.speed, size: room.settings.size }),
  command: ({ w, p }, msg) => (msg.t === 'i' ? w.queueInputs(p, msg.e) : undefined),
});
