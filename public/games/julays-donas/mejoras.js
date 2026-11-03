/**
 * Mejoras de la cocina: herramientas que se compran con las propinas y cambian cómo se juega
 * (dos mesas de masa, freidora grande, termómetro, manga profesional…). Acá están sus efectos y sus
 * dibujos para la tienda.
 */
import { C, dificultadDe } from './data.js';
import { TAU, alfa } from './color.js';
import { dona } from './art.js';
import { T } from './local.js';

/** ¿La partida tiene esta mejora? */
export const tiene = (save, id) => !!save?.mejoras?.[id];

/** Zona justa de cada lado en la freidora (más ancha con el termómetro). */
export const zonaFritura = (save) => {
  const [a, b] = dificultadDe(save).punto;
  return tiene(save, 'termometro') ? [a - 0.04, b + 0.07] : [a, b];
};

/** Lugares en el aceite. */
export const lugaresFreidora = (save) => (tiene(save, 'freidora6') ? 6 : 4);

const lin = (ctx, w = 3) => {
  ctx.lineWidth = w;
  ctx.strokeStyle = C.tinta;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
};

/** Dibujo de cada mejora, centrado en (x, y), de unos 200 × 140 a escala 1. */
export function dibujarMejora(ctx, id, x, y, s = 1, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  lin(ctx);
  if (id === 'mesa2') {
    for (const [dx, masa] of [[-58, '#f1dfb8'], [58, '#9a6a4f']]) {
      ctx.fillStyle = C.madera3;
      ctx.beginPath();
      ctx.roundRect(dx - 52, -40, 104, 90, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = masa;
      ctx.beginPath();
      ctx.roundRect(dx - 40, -28, 80, 56, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.madera3;
      ctx.beginPath();
      ctx.arc(dx - 14, -6, 12, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = C.terracota;
    ctx.font = '700 22px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('×2', 0, 76);
  } else if (id === 'palote') {
    ctx.rotate(-0.15);
    ctx.fillStyle = C.madera2;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(sx * 92 - 22, -8, 44, 16, 8);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#eceae6';
    ctx.beginPath();
    ctx.roundRect(-74, -22, 148, 44, 22);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = alfa('#8d8780', 0.5);
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(-70 + k * 30, -22);
      ctx.bezierCurveTo(-60 + k * 30, -6, -50 + k * 30, 4, -36 + k * 30, 22);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillRect(-66, -16, 132, 6);
    ctx.restore();
    lin(ctx);
    ctx.stroke();
  } else if (id === 'freidora6') {
    ctx.fillStyle = C.acero2;
    ctx.beginPath();
    ctx.roundRect(-100, -66, 200, 132, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.aceite;
    ctx.beginPath();
    ctx.roundRect(-88, -54, 176, 108, 10);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 6; i++) dona(ctx, { id: 40 + i, masa: i % 2 ? 'chocolate' : 'vainilla', forma: 'anillo', coc: [0.9, 0.3], lado: 0 }, -58 + (i % 3) * 58, -26 + Math.floor(i / 3) * 52, 20, { sombra: false, lado: 0 });
  } else if (id === 'termometro') {
    ctx.fillStyle = C.acero;
    ctx.beginPath();
    ctx.arc(0, -8, 54, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.papel;
    ctx.beginPath();
    ctx.arc(0, -8, 44, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = alfa(C.oliva, 0.75);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, -8, 34, -Math.PI * 0.62, -Math.PI * 0.18);
    ctx.stroke();
    lin(ctx, 4);
    const a = -Math.PI * 0.4 + Math.sin(t * 1.5) * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(Math.cos(a) * 36, -8 + Math.sin(a) * 36);
    ctx.stroke();
    ctx.fillStyle = C.terracota;
    ctx.beginPath();
    ctx.arc(0, -8, 6, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.acero2;
    ctx.beginPath();
    ctx.roundRect(-5, 44, 10, 36, 4);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'manga') {
    ctx.rotate(0.5);
    ctx.fillStyle = C.crema;
    ctx.beginPath();
    ctx.moveTo(-44, -60);
    ctx.lineTo(44, -60);
    ctx.lineTo(8, 40);
    ctx.lineTo(-8, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a86a2c';
    ctx.beginPath();
    ctx.moveTo(-30, -20);
    ctx.lineTo(30, -20);
    ctx.lineTo(8, 40);
    ctx.lineTo(-8, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.acero;
    ctx.beginPath();
    ctx.moveTo(-10, 38);
    ctx.lineTo(10, 38);
    ctx.lineTo(4, 62);
    ctx.lineTo(-4, 62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.mostaza;
    ctx.font = '700 26px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.rotate(-0.5);
    ctx.fillText('★', 60, -40);
  } else if (id === 'pomo') {
    ctx.fillStyle = C.terracota;
    ctx.beginPath();
    ctx.roundRect(-26, -50, 52, 86, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.crema;
    ctx.beginPath();
    ctx.moveTo(-14, -50);
    ctx.lineTo(14, -50);
    ctx.lineTo(10, -76);
    ctx.lineTo(-10, -76);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#4a2a1c';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(40, 50);
    for (let k = 0; k < 6; k++) ctx.lineTo(40 + k * 14, k % 2 ? 66 : 40);
    ctx.stroke();
    lin(ctx);
  } else if (id === 'espolvoreador') {
    ctx.fillStyle = 'rgba(246,240,230,.9)';
    ctx.beginPath();
    ctx.roundRect(-46, -30, 92, 70, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.acero;
    ctx.beginPath();
    ctx.roundRect(-52, -50, 104, 22, 8);
    ctx.fill();
    ctx.stroke();
    const cols = [C.terracota, C.mostaza, C.oliva, C.petroleo, C.rosa];
    for (let i = 0; i < 26; i++) {
      const px = -60 + ((i * 37) % 120);
      const py = -70 - ((i * 23 + t * 60) % 60);
      ctx.fillStyle = cols[i % 5];
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(i);
      ctx.fillRect(-4, -1.5, 8, 3);
      ctx.restore();
    }
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = cols[i % 5];
      ctx.fillRect(-38 + ((i * 29) % 76), 4 + ((i * 17) % 30), 7, 3);
    }
  } else if (id === 'libreta') {
    ctx.rotate(-0.1);
    ctx.fillStyle = C.papel;
    ctx.beginPath();
    ctx.roundRect(-46, -58, 92, 116, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.terracota;
    ctx.fillRect(-46, -58, 92, 16);
    ctx.strokeRect(-46, -58, 92, 16);
    lin(ctx, 2);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-34, -24 + i * 16);
      ctx.lineTo(28 - (i % 2) * 18, -24 + i * 16);
      ctx.stroke();
    }
    ctx.rotate(0.7);
    lin(ctx);
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.roundRect(10, -80, 14, 90, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.crema;
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(24, 10);
    ctx.lineTo(17, 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (id === 'turnos') {
    ctx.fillStyle = C.tinta;
    ctx.beginPath();
    ctx.roundRect(-64, -46, 128, 86, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.mostaza2;
    ctx.font = '700 17px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(T('TURNO', 'NOW SERVING'), 0, -24, 120);
    ctx.font = '700 40px Fredoka, sans-serif';
    ctx.fillText(String(7 + (Math.floor(t / 2) % 3)).padStart(2, '0'), 0, 12);
    ctx.fillStyle = C.papel;
    ctx.beginPath();
    ctx.roundRect(70, -10, 40, 54, 4);
    ctx.fill();
    lin(ctx, 2.5);
    ctx.stroke();
    ctx.fillStyle = C.tinta;
    ctx.font = '700 18px Fredoka, sans-serif';
    ctx.fillText('08', 90, 18);
  }
  ctx.restore();
}

