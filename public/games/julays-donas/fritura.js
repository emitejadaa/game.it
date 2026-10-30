/**
 * Estación de fritura: las donas crudas esperan a la izquierda; tocándolas (o arrastrándolas) van al
 * aceite. Cada lado se cocina solo, aunque estés en otra estación. Tocás la dona para darla vuelta
 * cuando la aguja entra en la zona verde, y otra vez para sacarla cuando el otro lado está dorado.
 */
import { C, TXT } from './data.js';
import { TAU, dona, alfa, tono, azar } from './art.js';
import { cocina } from './local.js';
import { ticketGrande } from './ticket.js';
import { barra, dentroRect, F, panel } from './dibujo.js';
import { puntoDe } from './orders.js';

export const SLOTS = [
  { x: 388, y: 280 },
  { x: 672, y: 280 },
  { x: 388, y: 498 },
  { x: 672, y: 498 },
];
/** Con la freidora grande entran seis: tres columnas. */
const SLOTS6 = [
  { x: 340, y: 280 },
  { x: 530, y: 280 },
  { x: 720, y: 280 },
  { x: 340, y: 498 },
  { x: 530, y: 498 },
  { x: 720, y: 498 },
];
export const lugares = (n) => (n === 6 ? SLOTS6 : SLOTS);
/** Tamaño de las donas en el aceite y de su barra, según cuántos lugares hay. */
const medida = (n) => (n === 6 ? { r: 58, barra: 160, toque: 68 } : { r: 70, barra: 200, toque: 80 });
const CRUDAS = { x: 14, y: 150, w: 194, h: 400 };
const RACK = { x: 852, y: 150, w: 160, h: 482 };
const TACHO = { x: 60, y: 596, r: 34 };
const MAX = 1.6; // escala de la barra de cocción

export const estado = () => ({ arrastre: null, burbujas: [] });

const radio = (d, base) => (d.forma === 'baston' ? base * 0.8 : base);

function celdas(lista, area, cols, alto) {
  return lista.map((d, i) => ({ d, x: area.x + 50 + (i % cols) * 92, y: area.y + 60 + Math.floor(i / cols) * alto }));
}

export function update(J, dt) {
  const M = J.fritura;
  // burbujitas del aceite alrededor de cada dona
  const R = Math.random;
  const L = lugares(J.dia.freidora.length);
  J.dia.freidora.forEach((d, i) => {
    if (d && R() < dt * 9) M.burbujas.push({ x: L[i].x + (R() - 0.5) * 150, y: L[i].y + (R() - 0.5) * 120, t: 0 });
  });
  for (const b of M.burbujas) b.t += dt;
  M.burbujas = M.burbujas.filter((b) => b.t < 0.7);
}

export function draw(ctx, J, t) {
  const M = J.fritura;
  const dia = J.dia;
  cocina(ctx, 'fritura');
  // bandeja de crudas
  panel(ctx, CRUDAS.x, CRUDAS.y, CRUDAS.w, CRUDAS.h, { radio: 16, fondo: '#efe6d8' });
  titulo(ctx, J.tr(TXT.crudas), CRUDAS.x + CRUDAS.w / 2, CRUDAS.y + 22);
  const crudas = dia.crudas();
  for (const c of celdas(crudas, CRUDAS, 2, 84)) {
    if (M.arrastre?.d === c.d) continue;
    if (c.y > CRUDAS.y + CRUDAS.h - 30) continue;
    dona(ctx, c.d, c.x, c.y, radio(c.d, 30), { lado: 0 });
    etiqueta(ctx, '#' + c.d.ticket.n, c.x, c.y + 38);
  }
  // tacho
  tacho(ctx, TACHO.x, TACHO.y, M.arrastre && Math.hypot(M.arrastre.x - TACHO.x, M.arrastre.y - TACHO.y) < 60);
  // freidora
  ctx.save();
  ctx.fillStyle = C.acero2;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(224, 148, 612, 486, 26);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.aceite;
  ctx.beginPath();
  ctx.roundRect(246, 168, 568, 446, 18);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.stroke();
  // reflejos del aceite
  ctx.strokeStyle = alfa('#f6dd9a', 0.6);
  ctx.lineWidth = 3;
  const R = azar(5);
  for (let i = 0; i < 14; i++) {
    const x = 270 + R() * 520;
    const y = 190 + R() * 400;
    ctx.beginPath();
    ctx.arc(x, y, 14 + R() * 18, 3.6 + Math.sin(t * 2 + i) * 0.2, 4.6);
    ctx.stroke();
  }
  for (const b of M.burbujas) {
    ctx.strokeStyle = alfa('#fbeec8', 0.8 * (1 - b.t / 0.7));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4 + b.t * 10, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  const L = lugares(dia.freidora.length);
  const md = medida(dia.freidora.length);
  if (J.save.mejoras?.termometro) termometro(ctx, 800, 168, t, dia);
  dia.freidora.forEach((d, i) => {
    const s = L[i];
    if (!d) {
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = alfa(C.tinta, 0.3);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, md.r - 4, 0, TAU);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (M.arrastre?.d === d) return;
    // al darla vuelta se "achica" un instante
    const g = d.giro || 0;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, 1 - Math.sin(g * Math.PI) * 0.75);
    dona(ctx, d, 0, 0, radio(d, md.r), { lado: 1 - d.lado, sombra: false });
    ctx.restore();
    // barra del lado que se está cocinando
    const c = d.coc[d.lado];
    const p = puntoDe(c, dia.punto);
    const col = p === 'dorado' ? C.oliva : p === 'pasado' || p === 'quemado' ? C.terracota : C.mostaza;
    const bw = md.barra;
    barra(ctx, s.x - bw / 2, s.y + md.r + 12, bw, 16, c / MAX, { zona: [dia.punto[0] / MAX, dia.punto[1] / MAX], color: col });
    ctx.fillStyle = C.tinta;
    ctx.font = F(700, 14);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.lado === 0 ? (J.lang === 'es' ? 'Lado 1' : 'Side 1') : J.lang === 'es' ? 'Lado 2' : 'Side 2', s.x - md.barra / 2, s.y - md.r - 16);
    etiqueta(ctx, '#' + d.ticket.n, s.x + md.barra / 2 - 14, s.y - md.r - 16);
    if (p === 'dorado') {
      // aviso: ¡ahora!
      ctx.fillStyle = C.oliva;
      ctx.font = F(700, 20);
      ctx.textAlign = 'center';
      ctx.fillText(d.lado === 0 ? (J.lang === 'es' ? '¡Dala vuelta!' : 'Flip it!') : J.lang === 'es' ? '¡Sacala!' : 'Take it out!', s.x, s.y - 2 + Math.sin(t * 8) * 2);
    } else if (p === 'quemado') {
      ctx.fillStyle = C.terracota;
      ctx.font = F(700, 18);
      ctx.textAlign = 'center';
      ctx.fillText(J.lang === 'es' ? '¡Se quema!' : 'Burning!', s.x, s.y);
    }
  });
  // escurridor
  panel(ctx, RACK.x, RACK.y, RACK.w, RACK.h, { radio: 16, fondo: '#efe6d8' });
  titulo(ctx, J.tr(TXT.escurridor), RACK.x + RACK.w / 2, RACK.y + 22);
  ctx.strokeStyle = alfa(C.acero2, 0.6);
  ctx.lineWidth = 2;
  for (let y = RACK.y + 44; y < RACK.y + RACK.h - 10; y += 18) {
    ctx.beginPath();
    ctx.moveTo(RACK.x + 12, y);
    ctx.lineTo(RACK.x + RACK.w - 12, y);
    ctx.stroke();
  }
  for (const c of celdas(dia.listas(), { x: RACK.x - 12, y: RACK.y }, 2, 80)) {
    if (M.arrastre?.d === c.d) continue;
    if (c.y > RACK.y + RACK.h - 30) continue;
    dona(ctx, c.d, c.x, c.y, radio(c.d, 26));
    etiqueta(ctx, '#' + c.d.ticket.n, c.x, c.y + 34);
  }
  // lo que se arrastra
  if (M.arrastre) dona(ctx, M.arrastre.d, M.arrastre.x, M.arrastre.y, radio(M.arrastre.d, 50), { lado: M.arrastre.d.etapa === 'aceite' ? 1 - M.arrastre.d.lado : 0 });
  // ticket
  const tk = ticketFritura(J);
  if (tk) {
    const marcas = tk.hechas.map((h) => (!h ? J.tr(TXT.falta) : h.etapa === 'cruda' ? J.tr(TXT.cruda) : h.etapa === 'aceite' ? '…' : 'ok'));
    ticketGrande(ctx, tk, 1020, 130, 250, 504, { estacion: 'fritura', lang: J.lang, marcas });
  }
}

export function ticketFritura(J) {
  const d = J.dia;
  let tk = J.sel.fritura;
  if (!tk || tk.entregado) tk = d.pendientes().find((t) => d.estadoTicket(t) === 'fritura') || d.pendientes()[0] || null;
  J.sel.fritura = tk;
  return tk;
}

function titulo(ctx, texto, x, y) {
  ctx.fillStyle = C.tinta;
  ctx.font = F(700, 17);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y);
}

function etiqueta(ctx, texto, x, y) {
  ctx.save();
  ctx.font = F(700, 12);
  const w = ctx.measureText(texto).width + 10;
  ctx.fillStyle = C.papel;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 9, w, 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.tinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 1);
  ctx.restore();
}

function tacho(ctx, x, y, activo) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = activo ? C.terracota : C.acero;
  ctx.beginPath();
  ctx.moveTo(-26, -20);
  ctx.lineTo(26, -20);
  ctx.lineTo(20, 30);
  ctx.lineTo(-20, 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-32, -30, 64, 12, 5);
  ctx.fill();
  ctx.stroke();
  for (const dx of [-10, 0, 10]) {
    ctx.beginPath();
    ctx.moveTo(dx, -10);
    ctx.lineTo(dx * 0.8, 22);
    ctx.stroke();
  }
  ctx.restore();
}

/** Qué hay en el punto p: una cruda, una en el aceite (slot) o una lista. */
function tocado(J, p) {
  const dia = J.dia;
  for (const c of celdas(dia.crudas(), CRUDAS, 2, 84)) if (Math.hypot(p.x - c.x, p.y - c.y) < 38) return { d: c.d, desde: 'cruda' };
  const L = lugares(dia.freidora.length);
  const md = medida(dia.freidora.length);
  for (let i = 0; i < dia.freidora.length; i++) {
    const d = dia.freidora[i];
    if (d && Math.hypot(p.x - L[i].x, p.y - L[i].y) < md.toque) return { d, desde: 'slot', slot: i };
  }
  for (const c of celdas(dia.listas(), { x: RACK.x - 12, y: RACK.y }, 2, 80)) if (Math.hypot(p.x - c.x, p.y - c.y) < 34) return { d: c.d, desde: 'lista' };
  return null;
}

export function down(J, p) {
  const t = tocado(J, p);
  if (!t) return;
  J.fritura.arrastre = { ...t, x: p.x, y: p.y, x0: p.x, y0: p.y, movio: false };
}

export function move(J, p) {
  const a = J.fritura.arrastre;
  if (!a) return;
  a.x = p.x;
  a.y = p.y;
  if (Math.hypot(p.x - a.x0, p.y - a.y0) > 14) a.movio = true;
}

export function up(J, p) {
  const M = J.fritura;
  const a = M.arrastre;
  M.arrastre = null;
  if (!a) return;
  const dia = J.dia;
  const alTacho = Math.hypot(p.x - TACHO.x, p.y - TACHO.y) < 60;
  if (a.movio && alTacho) {
    dia.tirar(a.d);
    return;
  }
  if (a.desde === 'cruda') {
    if (!a.movio) {
      if (!dia.meterAlAceite(a.d)) J.toast(J.lang === 'es' ? 'La freidora está llena' : 'The fryer is full');
      J.sel.fritura = a.d.ticket;
      return;
    }
    const k = lugares(dia.freidora.length).findIndex((s, i) => !dia.freidora[i] && Math.hypot(p.x - s.x, p.y - s.y) < 100);
    if (k >= 0) dia.meterAlAceite(a.d, k);
    return;
  }
  if (a.desde === 'slot') {
    if (!a.movio) dia.tocarEnAceite(a.slot);
    else if (p.x > RACK.x - 20) {
      // arrastrada al escurridor: sale aunque esté en el primer lado
      if (a.d.lado === 0) dia.tocarEnAceite(a.slot);
      dia.tocarEnAceite(a.slot);
    }
    J.sel.fritura = a.d.ticket;
    return;
  }
  if (a.desde === 'lista' && !a.movio) {
    J.sel.decorado = a.d.ticket;
    J.decorado.idx = a.d.slot;
    J.irA('decorado');
  }
}

export function ayuda(J) {
  const dia = J.dia;
  const i = dia.freidora.findIndex((d) => d);
  if (i >= 0) {
    // el consejo va debajo de la barra (fila de arriba) o encima de la dona (fila de abajo)
    const d = dia.freidora[i];
    const s = lugares(dia.freidora.length)[i];
    return s.y < 400 ? { k: d.lado ? 'sacar' : 'darVuelta', x: s.x, y: s.y + 104, lado: 'arriba' } : { k: d.lado ? 'sacar' : 'darVuelta', x: s.x, y: s.y - 96, lado: 'abajo' };
  }
  if (dia.crudas().length) return { k: 'meter', x: 210, y: 210, lado: 'izq' };
  if (dia.listas().length) return { k: 'irDecorado', x: 925, y: 640, lado: 'abajo' };
  return null;
}

/** El termómetro (mejora): marca cuánto le falta al lado que más se está cocinando. */
function termometro(ctx, x, y, t, dia) {
  const max = Math.max(0, ...dia.freidora.map((d) => (d ? d.coc[d.lado] : 0)));
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = C.acero;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.papel;
  ctx.beginPath();
  ctx.arc(0, 0, 23, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const ang = (v) => Math.PI * 0.8 + (Math.min(1.6, v) / 1.6) * Math.PI * 1.4;
  ctx.strokeStyle = alfa(C.oliva, 0.8);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 17, ang(dia.punto[0]), ang(dia.punto[1]));
  ctx.stroke();
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 3;
  const a = ang(max) + Math.sin(t * 20) * 0.02;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
  ctx.stroke();
  ctx.fillStyle = C.terracota;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
}
