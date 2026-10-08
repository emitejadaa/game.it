/**
 * Sumo — lo que ve cada jugador (lo usan el servidor y el modo sin conexión). Hay pocos discos (≤ 14) y la plataforma
 * cabe entera en pantalla, así que no hace falta área de interés: cada snapshot lleva todos los discos en juego.
 *
 *   { t: 's', k: paso,
 *     r: [fase (0 nadie, 1 cuenta atrás, 2 ronda), nº de ronda, pasos (desde que empezó la ronda, o los que faltan para
 *         que empiece), radio de la plataforma, discos en pie],
 *     h: [[num, x, y, vx, vy, flags], …]   la propia primero; flags: 1 empujón en curso · 2 empujón listo
 *     x: [[x, y, color, num, por]]          caídas desde el mensaje anterior (para el efecto y el KO)
 *     res: [nº de ronda, ganador]           una sola vez, cuando termina una ronda
 *     a: último seq aplicado · o: [recarga, empujón, KO, movimiento, mirada]   (solo la propia, en pie) }
 * Los discos propios van con más decimales: el cliente los usa como punto de partida de la predicción.
 */
import { PH } from './world.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export class Viewer {
  constructor(world, num) {
    this.w = world;
    this.num = num;
    this.resSent = world.result.n; // el resultado de una ronda vieja no se muestra a quien recién entra
  }

  reset() {
    this.resSent = this.w.result.n;
  }

  /** @param deaths  caídas ocurridas desde el mensaje anterior */
  build(deaths) {
    const w = this.w;
    const me = w.players.get(this.num);
    const h = [];
    for (const p of w.players.values()) {
      if (!p.alive) continue;
      const flags = (p.dashT > 0 ? 1 : 0) | (p.dashCd === 0 ? 2 : 0);
      if (p === me) h.unshift([p.num, r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), flags]);
      else h.push([p.num, r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy), flags]);
    }
    const t = w.phase === PH.play ? w.tick - w.rt0 : w.phase === PH.wait ? Math.max(0, w.startAt - w.tick) : 0;
    const msg = { t: 's', k: w.tick, r: [w.phase, w.roundN, t, r1(w.R), h.length], h };
    if (deaths && deaths.length) msg.x = deaths.map((d) => [Math.round(d.x), Math.round(d.y), d.color, d.num, d.by]);
    if (w.result.n > this.resSent) {
      msg.res = [w.result.n, w.result.winner];
      this.resSent = w.result.n;
    }
    if (me && me.alive) {
      msg.a = me.seq;
      msg.o = [me.dashCd, me.dashT, me.kos, me.mc, me.fc];
    }
    return msg;
  }
}
