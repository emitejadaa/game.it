/**
 * Piezas de interfaz dibujadas en el canvas: botones, burbujas de diálogo, monedas, barras y textos.
 */
import { C } from './data.js';
import { TAU, tono, alfa } from './art.js';

export const F = (peso, px) => `${peso} ${px}px Fredoka, "Trebuchet MS", sans-serif`;

export const dentroRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Botón redondeado. estilo: 'primario' | 'secundario' | 'peligro' | 'apagado'. */
export function boton(ctx, r, texto, o = {}) {
  const estilo = o.estilo || 'primario';
  const col = { primario: C.terracota, secundario: C.crema, peligro: '#b9653f', apagado: '#d8cfc2', verde: C.oliva }[estilo];
  const presionado = o.presionado ? 3 : 0;
  ctx.save();
  ctx.fillStyle = tono(col, -0.3);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y + 5, r.w, r.h, o.radio ?? 14);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y + presionado, r.w, r.h, o.radio ?? 14);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.tinta;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y + presionado, r.w, r.h + 5 - presionado, o.radio ?? 14);
  ctx.stroke();
  ctx.fillStyle = estilo === 'secundario' || estilo === 'apagado' ? C.tinta : C.crema;
  if (estilo === 'apagado') ctx.globalAlpha = 0.6;
  ctx.font = F(700, o.tam || 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, r.x + r.w / 2 + (o.icono ? 12 : 0), r.y + r.h / 2 + presionado + 1, r.w - 16);
  ctx.restore();
}

/** Texto en varias líneas dentro de un ancho. Devuelve el alto usado. */
export function parrafo(ctx, texto, x, y, ancho, alto, o = {}) {
  ctx.save();
  ctx.font = o.font || F(500, 18);
  ctx.fillStyle = o.color || C.tinta;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'top';
  const lineas = [];
  for (const par of String(texto).split('\n')) {
    let l = '';
    for (const w of par.split(' ')) {
      const prueba = l ? l + ' ' + w : w;
      if (ctx.measureText(prueba).width > ancho && l) {
        lineas.push(l);
        l = w;
      } else l = prueba;
    }
    lineas.push(l);
  }
  lineas.forEach((l, i) => ctx.fillText(l, x, y + i * alto));
  ctx.restore();
  return lineas.length * alto;
}

/** Burbuja de diálogo con la colita apuntando a (px, py). */
export function burbuja(ctx, x, y, w, h, px, py, o = {}) {
  ctx.save();
  ctx.fillStyle = o.fondo || C.papel;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  const bx = Math.max(x + 22, Math.min(x + w - 22, px));
  const abajo = py > y + h;
  const by = abajo ? y + h : y;
  ctx.moveTo(bx - 12, by);
  ctx.lineTo(px, py);
  ctx.lineTo(bx + 12, by);
  ctx.fill();
  ctx.stroke();
  // tapar la línea entre la colita y la burbuja
  ctx.fillRect(bx - 10, abajo ? by - 3 : by, 20, 4);
  ctx.restore();
}

export function moneda(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = C.mostaza;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = tono(C.mostaza, -0.3);
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = tono(C.mostaza, -0.35);
  ctx.font = F(700, r * 1.05);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', x, y + r * 0.06);
  ctx.restore();
}

/** Barra de progreso horizontal con zona marcada. */
export function barra(ctx, x, y, w, h, v, o = {}) {
  ctx.save();
  ctx.fillStyle = o.fondo || '#e6dccd';
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (o.zona) {
    ctx.fillStyle = alfa(C.oliva, 0.45);
    ctx.fillRect(x + w * o.zona[0], y, w * (o.zona[1] - o.zona[0]), h);
  }
  ctx.fillStyle = o.color || C.terracota;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.stroke();
  ctx.restore();
}

/** Panel de papel (tarjetas de puntaje, consejos). */
export function panel(ctx, x, y, w, h, o = {}) {
  ctx.save();
  ctx.fillStyle = 'rgba(59,42,32,.2)';
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 7, w, h, o.radio ?? 20);
  ctx.fill();
  ctx.fillStyle = o.fondo || C.papel;
  ctx.strokeStyle = o.borde || C.tinta;
  ctx.lineWidth = o.grosor || 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, o.radio ?? 20);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Carita de humor (para la paciencia de los clientes). */
export function carita(ctx, x, y, r, animo) {
  const col = { feliz: C.oliva, normal: C.mostaza, molesto: '#d08a3a', enojado: C.terracota }[animo] || C.oliva;
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.tinta;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + sx * r * 0.35, y - r * 0.2, r * 0.12, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  if (animo === 'feliz') ctx.arc(x, y + r * 0.05, r * 0.45, 0.2 * Math.PI, 0.8 * Math.PI);
  else if (animo === 'normal') {
    ctx.moveTo(x - r * 0.35, y + r * 0.35);
    ctx.lineTo(x + r * 0.35, y + r * 0.35);
  } else ctx.arc(x, y + r * 0.75, r * 0.4, 1.2 * Math.PI, 1.8 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

/** Estrellas de 0 a 5 (con medias). */
export function estrellas(ctx, x, y, r, valor, total = 5) {
  ctx.save();
  for (let i = 0; i < total; i++) {
    const cx = x + i * r * 2.3;
    const lleno = Math.max(0, Math.min(1, valor - i));
    estrella(ctx, cx, y, r, '#e6dccd');
    if (lleno > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - r, y - r, r * 2 * lleno, r * 2);
      ctx.clip();
      estrella(ctx, cx, y, r, C.mostaza);
      ctx.restore();
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = C.tinta;
    caminoEstrella(ctx, cx, y, r);
    ctx.stroke();
  }
  ctx.restore();
}

function caminoEstrella(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function estrella(ctx, x, y, r, col) {
  caminoEstrella(ctx, x, y, r);
  ctx.fillStyle = col;
  ctx.fill();
}
