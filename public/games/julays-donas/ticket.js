/**
 * Los tickets de los pedidos: chiquitos colgados del riel y grandes como referencia en cada estación.
 */
import { C, MASAS, FORMAS, RELLENOS, BANOS, HILOS, TOPPINGS, PIEZAS, byId } from './data.js';
import { TAU, dona, donaIdeal, retrato, iconoManga, iconoBowl, iconoPomo, iconoSalero, pieza, alfa, tono } from './art.js';

const F = (peso, px) => `${peso} ${px}px Fredoka, "Trebuchet MS", sans-serif`;

function papel(ctx, x, y, w, h, sel) {
  ctx.save();
  ctx.fillStyle = 'rgba(59,42,32,.15)';
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 5, w, h, 8);
  ctx.fill();
  ctx.fillStyle = C.papel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.lineWidth = sel ? 4 : 2.5;
  ctx.strokeStyle = sel ? C.terracota : C.tinta;
  ctx.stroke();
  // renglones
  ctx.strokeStyle = alfa(C.petroleo2, 0.18);
  ctx.lineWidth = 1;
  for (let yy = y + 30; yy < y + h - 6; yy += 16) {
    ctx.beginPath();
    ctx.moveTo(x + 6, yy);
    ctx.lineTo(x + w - 6, yy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Ícono del estado del ticket: qué falta hacer. */
function estadoIcono(ctx, estado, x, y) {
  const col = { masa: C.madera3, fritura: C.mostaza, decorado: C.rosa, listo: C.oliva }[estado] || C.acero;
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.tinta;
  ctx.font = F(700, 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText({ masa: 'M', fritura: 'F', decorado: 'D', listo: '✓' }[estado] || '·', x, y + 1);
  ctx.restore();
}

/** Ticket chiquito del riel (96 × 118). sel: el elegido en esta estación. util: sirve en esta estación. */
export function ticketMini(ctx, tk, x, y, o = {}) {
  const w = 96;
  const h = 118;
  ctx.save();
  if (o.apagado) ctx.globalAlpha = 0.55;
  papel(ctx, x, y, w, h, o.sel);
  // broche
  ctx.fillStyle = C.acero;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 14, y - 8, 28, 14, 4);
  ctx.fill();
  ctx.stroke();
  // número y cara
  ctx.fillStyle = C.tinta;
  ctx.font = F(700, 16);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('#' + tk.n, x + 8, y + 17);
  retrato(ctx, tk.cliente.look, x + w - 20, y + 18, 13, { animo: 'feliz' });
  if (tk.exigente) {
    ctx.fillStyle = C.terracota;
    ctx.font = F(700, 14);
    ctx.fillText('★', x + w - 46, y + 17);
  }
  // donas
  const n = tk.pedido.donas.length;
  const paso = n === 1 ? 0 : 58 / (n - 1);
  tk.pedido.donas.forEach((spec, i) => {
    const r = spec.forma === 'baston' ? 13 : 17;
    dona(ctx, donaIdeal(spec), x + w / 2 - 8, y + (n === 1 ? 70 : 44 + paso * i), r, { lod: 'baja', sombra: false });
    if (spec.pieza) {
      ctx.fillStyle = C.tinta;
      ctx.font = F(700, 11);
      ctx.fillText('×' + spec.pieza.n, x + w / 2 + 14, y + (n === 1 ? 70 : 44 + paso * i));
    }
  });
  if (o.estado) estadoIcono(ctx, o.estado, x + w - 14, y + h - 14);
  ctx.restore();
}

const nombre = (lista, id, lang) => (byId(lista, id) || { name: { es: id, en: id } }).name[lang];

/** Rótulos de cada renglón de la comanda: así no se confunde la masa de chocolate con el baño de chocolate. */
const ROTULOS = {
  masa: { es: 'MASA', en: 'DOUGH' },
  forma: { es: 'FORMA', en: 'SHAPE' },
  fritura: { es: 'FRITURA', en: 'FRYING' },
  relleno: { es: 'RELLENO', en: 'FILLING' },
  bano: { es: 'BAÑO', en: 'ICING' },
  hilos: { es: 'HILOS', en: 'DRIZZLE' },
  topping: { es: 'TOPPING', en: 'TOPPING' },
  pieza: { es: 'PIEZAS', en: 'PIECES' },
};

/** Los renglones de una dona del pedido, en el orden en que se hace. */
export function renglones(spec, lang, estacion) {
  const f = [];
  f.push({ cat: 'masa', d: 'masa', t: nombre(MASAS, spec.masa, lang), color: byId(MASAS, spec.masa)?.crudo });
  f.push({ cat: 'forma', d: 'masa', t: nombre(FORMAS, spec.forma, lang), forma: spec.forma });
  if (estacion === 'fritura') f.push({ cat: 'fritura', d: 'fritura', t: lang === 'es' ? 'Dorada de los 2 lados' : 'Golden both sides', color: byId(MASAS, spec.masa)?.dorado });
  if (spec.relleno) f.push({ cat: 'relleno', d: 'decorado', ic: 'relleno', id: spec.relleno, t: nombre(RELLENOS, spec.relleno, lang) });
  if (spec.bano) f.push({ cat: 'bano', d: 'decorado', ic: 'bano', id: spec.bano, t: nombre(BANOS, spec.bano, lang) });
  if (spec.hilos) f.push({ cat: 'hilos', d: 'decorado', ic: 'hilos', id: spec.hilos, t: nombre(HILOS, spec.hilos, lang) });
  for (const tp of spec.toppings) f.push({ cat: 'topping', d: 'decorado', ic: 'topping', id: tp, t: nombre(TOPPINGS, tp, lang) });
  if (spec.pieza) f.push({ cat: 'pieza', d: 'decorado', ic: 'pieza', id: spec.pieza.id, t: `${nombre(PIEZAS, spec.pieza.id, lang)} × ${spec.pieza.n}` });
  return f;
}

/** Muestra de color redonda (la masa cruda, el dorado de la fritura). */
function muestra(ctx, color, x, y, r) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Silueta chiquita de la forma. */
export function iconoForma(ctx, forma, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = '#e8d2a6';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (forma === 'baston') ctx.roundRect(-s * 0.62, -s * 0.26, s * 1.24, s * 0.52, s * 0.26);
  else ctx.arc(0, 0, s * 0.48, 0, TAU);
  ctx.fill();
  ctx.stroke();
  if (forma === 'anillo') {
    ctx.fillStyle = C.papel;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.18, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Ticket grande de referencia. o.estacion: 'masa' | 'fritura' | 'decorado' (resalta lo que importa).
 * o.marcas[i]: estado de cada dona en esta estación ('ok' | 'mal' | 'falta' | texto).
 * Cada renglón dice qué es (MASA, BAÑO, TOPPING…) con su muestra de color o su ícono.
 */
export function ticketGrande(ctx, tk, x, y, w, h, o = {}) {
  const lang = o.lang || 'es';
  ctx.save();
  papel(ctx, x, y, w, h, false);
  // encabezado
  retrato(ctx, tk.cliente.look, x + 30, y + 30, 22, { animo: 'feliz' });
  ctx.fillStyle = C.tinta;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = F(700, 18);
  ctx.fillText(tk.cliente.name, x + 60, y + 22, w - 70);
  ctx.font = F(600, 13);
  ctx.fillStyle = tk.exigente ? C.terracota : C.tinta2;
  ctx.fillText(tk.exigente ? (lang === 'es' ? '★ Exigente · #' : '★ Tough · #') + tk.n : (lang === 'es' ? 'Pedido #' : 'Order #') + tk.n, x + 60, y + 42);
  const n = tk.pedido.donas.length;
  const top = y + 60;
  const alto = (h - 66) / Math.max(n, 1);
  tk.pedido.donas.forEach((spec, i) => {
    const by = top + alto * i;
    if (i) {
      ctx.strokeStyle = alfa(C.tinta, 0.3);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 10, by - 2);
      ctx.lineTo(x + w - 10, by - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const filas = renglones(spec, lang, o.estacion);
    // la dona terminada, chiquita, a la izquierda (con su número si hay varias)
    const r = spec.forma === 'baston' ? Math.min(18, alto * 0.13) : Math.min(27, alto * 0.2);
    const cx = x + 36;
    const cy = by + 8 + r + (n > 1 ? 12 : 0);
    if (n > 1) {
      ctx.fillStyle = C.tinta2;
      ctx.font = F(700, 11);
      ctx.textAlign = 'center';
      ctx.fillText((lang === 'es' ? 'DONA ' : 'DONUT ') + (i + 1), cx, by + 9);
    }
    dona(ctx, donaIdeal(spec), cx, cy, r, { sombra: false });
    const m = o.marcas?.[i];
    if (m) {
      ctx.font = F(700, 13);
      ctx.textAlign = 'center';
      ctx.fillStyle = m === 'ok' ? C.oliva : m === 'mal' ? C.terracota : C.tinta2;
      ctx.fillText(m === 'ok' ? '✓' : m === 'mal' ? '✗' : m, cx, cy + r + 13, 62);
    }
    // renglones: RÓTULO arriba en chiquito y el nombre abajo, con su muestra
    const x0 = x + 70;
    const ancho = w - (x0 - x) - 10;
    const disp = alto - 10;
    const doble = filas.length * 30 <= disp; // si entra, rótulo y valor en dos líneas
    const paso = doble ? Math.min(34, disp / filas.length) : Math.min(19, disp / filas.length);
    filas.forEach((f, k) => {
      const fy = by + 6 + k * paso + (doble ? 0 : paso / 2);
      const fuerte = !o.estacion || f.d === o.estacion;
      ctx.globalAlpha = fuerte ? 1 : 0.45;
      const ok = o.checks?.[i]?.[f.ic];
      const der = ok !== undefined ? 16 : 0;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (doble) {
        ctx.fillStyle = f.cat === 'masa' ? C.madera2 : f.cat === 'bano' ? C.ciruela : C.tinta2;
        ctx.font = F(700, 10.5);
        ctx.fillText(J_tr(ROTULOS[f.cat], lang), x0, fy + 6);
        const vy = fy + 20;
        let tx = x0;
        if (f.color) (muestra(ctx, f.color, x0 + 7, vy, 6.5), (tx += 18));
        else if (f.forma) (iconoForma(ctx, f.forma, x0 + 8, vy, 16), (tx += 20));
        else if (f.ic) (icono(ctx, f.ic, f.id, x0 + 7, vy, 15), (tx += 18));
        ctx.fillStyle = C.tinta;
        ctx.font = F(fuerte ? 700 : 600, 13.5);
        ctx.fillText(f.t, tx, vy + 1, ancho - (tx - x0) - der);
        if (ok !== undefined) check(ctx, ok, x + w - 12, vy);
      } else {
        const rot = J_tr(ROTULOS[f.cat], lang);
        ctx.font = F(700, 9.5);
        ctx.fillStyle = f.cat === 'masa' ? C.madera2 : f.cat === 'bano' ? C.ciruela : C.tinta2;
        ctx.fillText(rot, x0, fy);
        let tx = x0 + 50;
        if (f.color) (muestra(ctx, f.color, tx + 5, fy, 5), (tx += 13));
        else if (f.ic) (icono(ctx, f.ic, f.id, tx + 5, fy, 12), (tx += 13));
        ctx.fillStyle = C.tinta;
        ctx.font = F(fuerte ? 700 : 600, 12);
        ctx.fillText(f.t, tx, fy + 1, ancho - (tx - x0) - der);
        if (ok !== undefined) check(ctx, ok, x + w - 12, fy);
      }
      ctx.globalAlpha = 1;
    });
  });
  ctx.restore();
}

const J_tr = (t, lang) => t[lang] || t.es;

function check(ctx, ok, x, y) {
  ctx.fillStyle = ok ? C.oliva : alfa(C.tinta, 0.3);
  ctx.font = F(700, 13);
  ctx.textAlign = 'right';
  ctx.fillText(ok ? '✓' : '○', x + 4, y + 1);
  ctx.textAlign = 'left';
}

/** Ícono chiquito de un ingrediente (para el ticket y los botones). */
export function icono(ctx, cat, id, x, y, s) {
  if (cat === 'relleno') iconoManga(ctx, byId(RELLENOS, id).color, x, y, s);
  else if (cat === 'bano') iconoBowl(ctx, byId(BANOS, id).color, x, y, s);
  else if (cat === 'hilos') iconoPomo(ctx, byId(HILOS, id).color, x, y, s);
  else if (cat === 'topping') iconoSalero(ctx, byId(TOPPINGS, id), x, y, s);
  else if (cat === 'pieza') {
    ctx.save();
    ctx.translate(x, y);
    pieza(ctx, id, s * 0.9, 0, 1);
    ctx.restore();
  } else if (cat === 'masa') {
    const m = byId(MASAS, id);
    ctx.save();
    ctx.fillStyle = m.crudo;
    ctx.strokeStyle = C.tinta;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.55, s * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export { tono };
