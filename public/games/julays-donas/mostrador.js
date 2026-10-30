/**
 * Estación del mostrador: el salón con los clientes. El primero de la fila espera que le tomes el
 * pedido; los que ya pidieron esperan sentados (la carita muestra su paciencia).
 */
import { C, TXT } from './data.js';
import { TAU, persona, dona, donaIdeal, altoPersona, lookJugador } from './art.js';
import { salon, mesas, rincon, mostrador as dibujarMostrador, LUGARES, decoDe } from './local.js';
import { boton, burbuja, carita, dentroRect, F } from './dibujo.js';

const BOTON = { x: LUGARES.caja.x - 115, y: 268, w: 230, h: 62 };
const ESCALA_SENTADO = 0.8;
/** Más lejos (más arriba en el piso) se ven más chicos: así entran desde el fondo, por la puerta. */
export const escalaPiso = (y) => Math.max(0.8, Math.min(1, 0.8 + (y - 540) * 0.002));

export const estado = () => ({});

/** El aspecto del jugador (con su delantal). */
export { lookJugador };

export function update() {}

export function draw(ctx, J, t) {
  const dia = J.dia;
  const deco = decoDe(J.save);
  const turno = J.save.mejoras?.turnos ? (dia.nTicket || 0) + (dia.puedeTomar() ? 1 : 0) : 0;
  salon(ctx, deco, t, { campana: J.campana, puerta: J.puerta || 0, cartel: J.save.final ? `Julay’s Donas` : undefined, turnos: turno });
  // sentados (atrás de las mesas)
  const sentados = dia.actores.filter((a) => a.estado === 'esperando' && a.asiento >= 0 && !a.camina);
  for (const a of sentados.sort((p, q) => p.y - q.y)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 1280, 490);
    ctx.clip();
    persona(ctx, a.def.look, a.x, a.y, ESCALA_SENTADO, { animo: a.animo, t: t + a.id });
    ctx.restore();
  }
  mesas(ctx, deco);
  rincon(ctx, deco.rincon, t);
  // quien atiende
  const pidiendo = dia.actores.find((a) => a.estado === 'pidiendo');
  persona(ctx, lookJugador(J.save), LUGARES.empleado.x, LUGARES.empleado.y, 1, { t, pose: pidiendo ? 'anota' : undefined, animo: 'feliz' });
  dibujarMostrador(ctx, deco, t, { monedas: J.save.monedas });
  // parados (en la fila, retirando o yéndose) y los que caminan a su silla
  const parados = dia.actores.filter((a) => a.estado !== 'fuera' && !sentados.includes(a));
  for (const a of parados.sort((p, q) => p.y - q.y || p.x - q.x)) {
    const s = escalaPiso(a.y);
    a.escala = s;
    persona(ctx, a.def.look, a.x, a.y, s, { animo: a.estado === 'sale' && a.animoFinal ? a.animoFinal : a.animo, t: t + a.id, camina: a.camina ? a.fase : undefined, dir: a.dir, pose: a.estado === 'sale' && a.animoFinal === 'encantado' ? 'saluda' : undefined });
    if (a.exigente && a.estado !== 'sale') {
      ctx.fillStyle = C.terracota;
      ctx.font = F(700, 26);
      ctx.textAlign = 'center';
      ctx.fillText('★', a.x + 46, a.y - altoPersona(a.def.look) * s + 6);
    }
  }
  // caritas de paciencia
  for (const a of dia.actores) {
    if (a.estado !== 'fila' && a.estado !== 'esperando') continue;
    const s = a.estado === 'esperando' && !a.camina ? ESCALA_SENTADO : escalaPiso(a.y);
    const top = a.y - altoPersona(a.def.look) * s - 22;
    carita(ctx, a.x, top, 12, a.animo);
  }
  // el pedido en una burbuja
  if (pidiendo) {
    const k = 1 - pidiendo.tPedido / (pidiendo.tPedidoTotal || 2.6);
    const donas = pidiendo.ticket.pedido.donas;
    const w = 120 + donas.length * 92;
    const x = Math.min(1060 - w, Math.max(160, pidiendo.x - w / 2 + 40));
    const top = pidiendo.y - altoPersona(pidiendo.def.look) - 150;
    burbuja(ctx, x, top, w, 120, pidiendo.x + 20, pidiendo.y - altoPersona(pidiendo.def.look) - 10);
    ctx.fillStyle = C.tinta;
    ctx.font = F(600, 16);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(J.tr(pidiendo.def.line), x + 16, top + 20, w - 30);
    donas.forEach((spec, i) => {
      if (k < 0.15 + i * 0.25) return;
      dona(ctx, donaIdeal(spec), x + 60 + i * 92, top + 72, spec.forma === 'baston' ? 28 : 34, { sombra: false });
    });
  } else if (dia.puedeTomar()) {
    boton(ctx, BOTON, J.tr(TXT.tomarPedido), { tam: 24 });
  }
}

export function down(J, p) {
  if (dentroRect(p, BOTON) && J.dia.puedeTomar()) {
    J.dia.tomarPedido();
    J.snd('pedido');
  }
}

export function move() {}
export function up() {}

export function ayuda(J) {
  if (J.dia.puedeTomar()) return { k: 'tomar', x: BOTON.x + BOTON.w / 2, y: BOTON.y - 8, lado: 'abajo' };
  if (J.dia.pendientes().some((t) => J.dia.estadoTicket(t) === 'masa')) return { k: 'irMasa', x: 565, y: 650, lado: 'abajo' };
  return null;
}
