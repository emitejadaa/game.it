/**
 * Rey de la Colina online: discos en una arena cuadrada con pozos y una colina que se muda (30 pasos/s, un snapshot cada 2 =
 * 15 por segundo). Misma red y misma física que Sumo; el mundo (public/games/rey/shared) es el mismo que corre sin conexión.
 *
 * Mensajes del cliente: spawn { name, color } (nacer o reaparecer), i { e: [[seq, paso, mov, acción], …] } con acción
 * 0 nada · 1 Empujón · 2 Onda (ver /shared/arena-physics.js).
 */
import { arenaGame } from './_arena.js';
import { World, PALETTE, CFG } from '../../public/games/rey/shared/world.js';
import { brain, think, BOT_NAMES } from '../../public/games/rey/shared/bots.js';
import { Viewer } from '../../public/games/rey/shared/sync.js';

export default arenaGame({
  id: 'rey',
  title: 'Rey de la Colina',
  World,
  tps: 30,
  snapEvery: 2,
  maxHumans: 10,
  crowd: 8,
  colors: PALETTE.length,
  botNames: BOT_NAMES,
  brain,
  think,
  viewer: (w, num) => new Viewer(w, num),
  meExtra: (w) => ({ half: CFG.half, r: CFG.discR, tps: w.tps }),
  command: ({ w, p }, msg) => (msg.t === 'i' ? w.queueInputs(p, msg.e) : undefined),
});
