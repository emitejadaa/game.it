/**
 * Rey de la Colina — lo que ve cada jugador (servidor y modo sin conexión). La arena entera cabe en pantalla y hay pocos
 * discos: cada snapshot lleva todos los que están en pie.
 *
 *   { t: 's', k: paso,
 *     r: [fase (1 partida, 2 resultados), nº de partida, pasos que faltan (para el tiempo de la partida o para la siguiente),
 *         punto de la colina actual, punto de la próxima, pasos hasta que se mude, quién la tiene (num; 0 vacía; -1 disputada)],
 *     h: [[num, x, y, vx, vy, flags], …]   la propia primero; flags: 1 empujón en curso · 2 empujón listo · 4 onda lista
 *     x: [[x, y, color, num, por]]          caídas a un pozo desde el mensaje anterior
 *     w: [[x, y, color]]                    Ondas que todavía no vio este jugador
 *     res: [nº, ganador, [[num, puntos], …], segundos]   una sola vez, al terminar la partida
 *     a: último seq aplicado · o: [recarga, empujón, puntos, movimiento, mirada, recarga de la Onda]   (solo la propia, en pie) }
 */
import { PH } from './world.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export class Viewer {
  constructor(world, num) {
    this.w = world;
    this.num = num;
    this.resSent = world.result.n;
    this.waveK = world.tick;
  }

  reset() {
    this.resSent = this.w.result.n;
    this.waveK = this.w.tick;
  }

  build(deaths) {
    const w = this.w;
    const me = w.players.get(this.num);
    const h = [];
    for (const p of w.players.values()) {
      if (!p.alive) continue;
      const flags = (p.dashT > 0 ? 1 : 0) | (p.dashCd === 0 ? 2 : 0) | (p.waveCd === 0 ? 4 : 0);
      if (p === me) h.unshift([p.num, r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), flags]);
      else h.push([p.num, r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy), flags]);
    }
    const left = w.phase === PH.play ? Math.max(0, w.t0 + Math.round(w.matchTicks) - w.tick) : Math.max(0, w.overAt - w.tick);
    const msg = { t: 's', k: w.tick, r: [w.phase, w.matchN, left, w.hill, w.next, w.hillIn(), w.occ], h };
    if (deaths && deaths.length) msg.x = deaths.map((d) => [Math.round(d.x), Math.round(d.y), d.color, d.num, d.by]);
    const waves = [];
    for (const g of w.waveLog) if (g.k > this.waveK) waves.push([Math.round(g.x), Math.round(g.y), g.color]);
    this.waveK = w.tick;
    if (waves.length) msg.w = waves;
    if (w.result.n > this.resSent) {
      msg.res = [w.result.n, w.result.winner, w.result.top, w.result.time];
      this.resSent = w.result.n;
    }
    if (me && me.alive) {
      msg.a = me.seq;
      msg.o = [me.dashCd, me.dashT, me.score, me.mc, me.fc, me.waveCd];
    }
    return msg;
  }
}
