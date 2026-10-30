/**
 * Estación de decorado: relleno (mantener apretado), baño (mantener hasta cubrir), hilos (arrastrar
 * en zigzag), toppings (pasar por encima para espolvorear) y piezas (tocar para poner cada una).
 * Cuando todas las donas del ticket están, se entrega.
 */
import { C, RELLENOS, BANOS, HILOS, TOPPINGS, PIEZAS, TXT, disponibles, byId } from './data.js';
import { TAU, dona, alfa, tono, pieza as dibujarPieza } from './art.js';
import { cocina } from './local.js';
import { ticketGrande, icono } from './ticket.js';
import { boton, dentroRect, F, panel, barra } from './dibujo.js';
import { GEOM, dentro, celda, marcarTrazo, cobertura, grilla } from './geom.js';
import { notaCantidad, notaCobertura, notaHilos, notaTopping } from './orders.js';
import { tiene } from './mejoras.js';

const PLATO = { x: 585, y: 390, rx: 250, ry: 170 }; // debajo de las pestañas de categoría
const RADIO = { anillo: 138, bola: 138, baston: 110 };
const CATS = [
  { id: 'relleno', lista: RELLENOS },
  { id: 'bano', lista: BANOS },
  { id: 'hilos', lista: HILOS },
  { id: 'topping', lista: TOPPINGS },
  { id: 'pieza', lista: PIEZAS },
];
const ENTREGAR = { x: 772, y: 576, w: 230, h: 58 };
const TIRAR = { x: 590, y: 584, w: 160, h: 46 };
const MEDIDOR = { x: 868, y: 226, w: 30, h: 300 };
const MAX_REL = 1.6;
const MAX_BANO = 1.8;
const TOPE = { azucar: 1100 };

export const estado = () => ({ cat: 'bano', item: {}, idx: 0, pres: null, puntero: null, acumSnd: 0 });

const cats = (day) => CATS.filter((c) => disponibles(c.lista, day).length);
// las pestañas van debajo de los tickets colgados (que llegan hasta y≈148)
const pills = (day) => cats(day).map((c, i) => ({ c, r: { x: 210 + i * 130, y: 154, w: 122, h: 44 } }));
const items = (day, cat) => disponibles(CATS.find((c) => c.id === cat).lista, day).map((it, i) => ({ it, r: { x: 14, y: 182 + i * 74, w: 184, h: 66 } }));
const slotsFila = (n) => Array.from({ length: n }, (_, i) => ({ x: 262 + i * 98, y: 600 }));

/** Ticket a decorar: el elegido; si no, el más viejo listo para decorar; si no, alguno con donas fritas. */
export function ticketDeco(J) {
  const dia = J.dia;
  let tk = J.sel.decorado;
  if (!tk || tk.entregado) {
    const pend = dia.pendientes();
    tk = pend.find((t) => dia.estadoTicket(t) === 'decorado') || pend.find((t) => t.hechas.some((h) => h && h.etapa === 'lista')) || null;
  }
  J.sel.decorado = tk;
  return tk;
}

function activa(J, tk) {
  const M = J.decorado;
  if (!tk) return null;
  let d = tk.hechas[M.idx];
  if (!d || d.etapa !== 'lista') {
    M.idx = tk.hechas.findIndex((h) => h && h.etapa === 'lista');
    d = M.idx >= 0 ? tk.hechas[M.idx] : null;
  }
  return d;
}

const itemSel = (J, cat) => J.decorado.item[cat] || disponibles(CATS.find((c) => c.id === cat).lista, J.dia.n)[0]?.id;

/** Coordenadas de la dona (en unidades de r) de un punto de la pantalla. */
function local(d, p) {
  const r = RADIO[d.forma];
  return { x: (p.x - PLATO.x) / r, y: (p.y - PLATO.y) / r };
}

export function update(J, dt) {
  const M = J.decorado;
  const tk = ticketDeco(J);
  const d = activa(J, tk);
  if (!M.pres || !d) return;
  M.acumSnd += dt;
  const pro = tiene(J.save, 'manga');
  /** Con la manga profesional va más rápido y frena un momento justo en la raya. */
  const llenar = (v, vel, meta, max) => {
    if (M.pres.freno > 0) {
      M.pres.freno -= dt;
      return v;
    }
    const nv = Math.min(max, v + vel * dt);
    if (pro && M.pres.freno === undefined && v < meta && nv >= meta) {
      M.pres.freno = 0.55;
      J.snd('punto');
      return meta;
    }
    return nv;
  };
  if (M.pres.tipo === 'relleno') {
    d.relleno.cant = llenar(d.relleno.cant, pro ? 0.8 : 0.5, 0.97, MAX_REL);
    if (M.acumSnd > 0.22) (M.acumSnd = 0), J.snd('relleno');
  } else if (M.pres.tipo === 'bano') {
    d.bano.cob = llenar(d.bano.cob, pro ? 1.15 : 0.72, 1.025, MAX_BANO);
    if (M.acumSnd > 0.3) (M.acumSnd = 0), J.snd('bano');
  } else if (M.pres.tipo === 'topping' && M.puntero) {
    espolvorear(J, d, M.puntero, (tiene(J.save, 'espolvoreador') ? 85 : 55) * dt);
    if (M.acumSnd > 0.09) (M.acumSnd = 0), J.snd('topping');
  }
}

/** Tira partículas de topping alrededor del puntero. */
function espolvorear(J, d, p, cuantas) {
  const id = itemSel(J, 'topping');
  const tp = byId(TOPPINGS, id);
  const q = local(d, p);
  const tope = TOPE[id] || 420;
  let n = d.parts.filter((x) => x.id === id).length;
  const key = 't:' + id;
  d.cells[key] = d.cells[key] || new Uint8Array(grilla(d.forma).mask.length);
  M_acum.v += cuantas;
  while (M_acum.v >= 1 && n < tope) {
    M_acum.v -= 1;
    const a = Math.random() * TAU;
    const rr = Math.sqrt(Math.random()) * (tiene(J.save, 'espolvoreador') ? 0.3 : 0.2);
    const x = q.x + Math.cos(a) * rr;
    const y = q.y + Math.sin(a) * rr;
    if (!dentro(d.forma, x, y, 0.03)) continue;
    d.parts.push({ id, x, y, a: Math.random() * TAU, k: Math.floor(Math.random() * tp.colores.length), s: id === 'azucar' ? 0.7 : 0.85 + Math.random() * 0.3 });
    n++;
    const k = celda(d.forma, x, y);
    if (k >= 0) d.cells[key][k] = 1;
  }
  if (M_acum.v > 3) M_acum.v = 0;
  d.tops[id] = cobertura(d.forma, d.cells[key]);
}
const M_acum = { v: 0 };

export function draw(ctx, J, t) {
  const M = J.decorado;
  const day = J.dia.n;
  cocina(ctx, 'decorado');
  if (!cats(day).some((c) => c.id === M.cat)) M.cat = 'bano';
  // categorías
  for (const { c, r } of pills(day)) {
    const sel = c.id === M.cat;
    boton(ctx, r, J.tr(TXT.categoriasDeco[c.id]), { estilo: sel ? 'primario' : 'secundario', tam: 18, radio: 24 });
  }
  // ingredientes de la categoría
  const sel = itemSel(J, M.cat);
  for (const { it, r } of items(day, M.cat)) {
    const on = it.id === sel;
    panel(ctx, r.x, r.y, r.w, r.h, { radio: 14, fondo: on ? '#f6e3c8' : C.papel, borde: on ? C.terracota : C.tinta, grosor: on ? 4 : 2.5 });
    icono(ctx, M.cat, it.id, r.x + 34, r.y + r.h / 2, 40);
    ctx.fillStyle = C.tinta;
    ctx.font = F(600, 15);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(J.tr(it.name), r.x + 64, r.y + r.h / 2 + 1, r.w - 70);
  }
  // plato
  ctx.save();
  ctx.fillStyle = 'rgba(59,42,32,.15)';
  ctx.beginPath();
  ctx.ellipse(PLATO.x + 6, PLATO.y + 12, PLATO.rx, PLATO.ry, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f7f2ea';
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(PLATO.x, PLATO.y, PLATO.rx, PLATO.ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = alfa(C.petroleo2, 0.4);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(PLATO.x, PLATO.y, PLATO.rx - 22, PLATO.ry - 18, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  const tk = ticketDeco(J);
  const d = activa(J, tk);
  if (d) {
    dona(ctx, d, PLATO.x, PLATO.y, RADIO[d.forma]);
    // medidor de relleno o baño
    if (M.cat === 'relleno' || M.cat === 'bano') {
      const rel = M.cat === 'relleno';
      const v = rel ? (d.relleno ? d.relleno.cant / MAX_REL : 0) : d.bano ? d.bano.cob / MAX_BANO : 0;
      const zona = rel ? [0.88 / MAX_REL, 1.06 / MAX_REL] : [0.93 / MAX_BANO, 1.12 / MAX_BANO];
      medidor(ctx, v, zona, rel ? J.tr(TXT.categoriasDeco.relleno) : J.tr(TXT.categoriasDeco.bano));
    }
    // la herramienta, donde está el puntero
    if (M.puntero && Math.hypot((M.puntero.x - PLATO.x) / PLATO.rx, (M.puntero.y - PLATO.y) / PLATO.ry) < 1.05) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      if (M.cat === 'pieza') {
        ctx.translate(M.puntero.x, M.puntero.y);
        dibujarPieza(ctx, sel, RADIO[d.forma] * 0.2, 0, 1);
      } else icono(ctx, M.cat, sel, M.puntero.x + 26, M.puntero.y - 34, 52);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = C.tinta2;
    ctx.font = F(600, 21);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(J.tr(TXT.nadaParaDecorar), PLATO.x, PLATO.y, 440);
  }
  // fila de donas del ticket
  if (tk) {
    slotsFila(tk.hechas.length).forEach((s, i) => {
      const h = tk.hechas[i];
      if (h && h.etapa === 'lista') {
        if (i === M.idx) {
          ctx.fillStyle = alfa(C.terracota, 0.25);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 42, 0, TAU);
          ctx.fill();
        }
        dona(ctx, h, s.x, s.y, h.forma === 'baston' ? 26 : 32, { lod: 'baja' });
      } else {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = alfa(C.tinta, 0.4);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 30, 0, TAU);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.tinta2;
        ctx.font = F(600, 12);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(!h ? J.tr(TXT.falta) : h.etapa === 'cruda' ? J.tr(TXT.cruda) : J.tr(TXT.enFreidora), s.x, s.y, 80);
      }
    });
    if (d) boton(ctx, TIRAR, J.tr(TXT.tirar), { estilo: 'secundario', tam: 17 });
    const listo = J.dia.estadoTicket(tk) === 'decorado';
    boton(ctx, ENTREGAR, J.tr(TXT.entregar), { estilo: listo ? 'verde' : 'apagado', tam: 24 });
    ticketGrande(ctx, tk, 1020, 130, 250, 504, { estacion: 'decorado', lang: J.lang, checks: tk.hechas.map((h, i) => checks(tk.pedido.donas[i], h)) });
  }
}

function medidor(ctx, v, zona, texto) {
  const m = MEDIDOR;
  ctx.save();
  ctx.fillStyle = '#e6dccd';
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(m.x, m.y, m.w, m.h, 12);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = alfa(C.oliva, 0.5);
  ctx.fillRect(m.x, m.y + m.h * (1 - zona[1]), m.w, m.h * (zona[1] - zona[0]));
  ctx.fillStyle = v > zona[1] ? C.terracota : C.mostaza;
  ctx.fillRect(m.x, m.y + m.h * (1 - Math.min(1, v)), m.w, m.h * Math.min(1, v));
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(m.x, m.y, m.w, m.h, 12);
  ctx.stroke();
  // raya objetivo
  ctx.lineWidth = 3;
  ctx.beginPath();
  const y = m.y + m.h * (1 - (zona[0] + zona[1]) / 2);
  ctx.moveTo(m.x - 8, y);
  ctx.lineTo(m.x + m.w + 8, y);
  ctx.stroke();
  ctx.translate(m.x + m.w / 2, m.y + m.h + 18);
  ctx.fillStyle = C.tinta;
  ctx.font = F(600, 13);
  ctx.textAlign = 'center';
  ctx.fillText(texto, 0, 0);
  ctx.restore();
}

/** Qué partes de la dona ya están bien (para tildar el ticket). */
function checks(spec, d) {
  const c = {};
  if (!d) return c;
  if (spec.relleno) c.relleno = !!d.relleno && d.relleno.id === spec.relleno && notaCantidad(d.relleno.cant) >= 0.85;
  if (spec.bano) c.bano = !!d.bano && d.bano.id === spec.bano && notaCobertura(d.bano.cob) >= 0.85;
  if (spec.hilos) c.hilos = notaHilos(d.hilos[spec.hilos] || 0) >= 0.85;
  if (spec.toppings.length) c.topping = spec.toppings.every((t) => notaTopping(d.tops[t] || 0) >= 0.85);
  if (spec.pieza) c.pieza = d.piezas.filter((p) => p.id === spec.pieza.id).length === spec.pieza.n;
  return c;
}

function sobreDona(d, p) {
  if (!d) return false;
  const q = local(d, p);
  const g = GEOM[d.forma];
  if (d.forma === 'baston') return Math.abs(q.x) < g.w + 0.25 && Math.abs(q.y) < g.h + 0.35;
  return Math.hypot(q.x, q.y) < g.w + 0.25;
}

export function down(J, p) {
  const M = J.decorado;
  const day = J.dia.n;
  M.puntero = p;
  for (const { c, r } of pills(day))
    if (dentroRect(p, r)) {
      M.cat = c.id;
      J.snd('click');
      return;
    }
  for (const { it, r } of items(day, M.cat))
    if (dentroRect(p, r)) {
      M.item[M.cat] = it.id;
      J.snd('click');
      return;
    }
  const tk = ticketDeco(J);
  if (!tk) return;
  const fila = slotsFila(tk.hechas.length);
  for (let i = 0; i < fila.length; i++)
    if (Math.hypot(p.x - fila[i].x, p.y - fila[i].y) < 40 && tk.hechas[i]?.etapa === 'lista') {
      M.idx = i;
      J.snd('click');
      return;
    }
  if (dentroRect(p, ENTREGAR)) {
    if (J.dia.estadoTicket(tk) === 'decorado') J.servir(tk);
    else J.toast(J.lang === 'es' ? 'Faltan donas de este pedido' : 'This order is missing donuts');
    return;
  }
  const d = activa(J, tk);
  if (d && dentroRect(p, TIRAR)) {
    J.dia.tirar(d);
    return;
  }
  // hilos y toppings se pueden empezar desde cualquier parte del plato (solo quedan sobre la dona)
  const enPlato = Math.hypot((p.x - PLATO.x) / PLATO.rx, (p.y - PLATO.y) / PLATO.ry) < 1.08;
  if (!d || !(sobreDona(d, p) || ((M.cat === 'hilos' || M.cat === 'topping') && enPlato))) return;
  const id = itemSel(J, M.cat);
  const q = local(d, p);
  M.acumSnd = 1;
  if (M.cat === 'relleno') {
    if (d.forma === 'anillo') {
      J.toast(J.lang === 'es' ? 'Los anillos no se rellenan' : 'Rings don’t get filled');
      return;
    }
    if (!d.relleno || d.relleno.id !== id) d.relleno = { id, cant: d.relleno ? d.relleno.cant : 0 };
    M.pres = { tipo: 'relleno' };
  } else if (M.cat === 'bano') {
    if (!d.bano || d.bano.id !== id) d.bano = { id, cob: 0 };
    M.pres = { tipo: 'bano' };
  } else if (M.cat === 'hilos') {
    const linea = { id, pts: [q.x, q.y], w: tiene(J.save, 'pomo') ? 1.7 : 1 };
    d.lineas.push(linea);
    M.pres = { tipo: 'hilos', linea };
    J.snd('hilos');
  } else if (M.cat === 'topping') {
    M.pres = { tipo: 'topping' };
    espolvorear(J, d, p, 6);
  } else if (M.cat === 'pieza') {
    if (!dentro(d.forma, q.x, q.y, 0.08)) return;
    if (d.piezas.length >= 12) return;
    d.piezas.push({ id, x: q.x, y: q.y, a: (Math.random() - 0.5) * 0.6, k: d.piezas.length });
    J.snd('pieza');
  }
}

export function move(J, p) {
  const M = J.decorado;
  M.puntero = p;
  if (!M.pres) return;
  const d = activa(J, ticketDeco(J));
  if (!d) return;
  if (M.pres.tipo === 'hilos') {
    const L = M.pres.linea;
    const q = local(d, p);
    const ax = L.pts[L.pts.length - 2];
    const ay = L.pts[L.pts.length - 1];
    if (Math.hypot(q.x - ax, q.y - ay) < 0.03) return;
    L.pts.push(q.x, q.y);
    const key = 'h:' + L.id;
    d.cells[key] = d.cells[key] || new Uint8Array(grilla(d.forma).mask.length);
    marcarTrazo(d.forma, d.cells[key], ax, ay, q.x, q.y, 0.035 * (L.w || 1));
    d.hilos[L.id] = cobertura(d.forma, d.cells[key]);
    M.acumSnd += 0.05;
    if (M.acumSnd > 0.25) (M.acumSnd = 0), J.snd('hilos');
  } else if (M.pres.tipo === 'topping') {
    espolvorear(J, d, p, tiene(J.save, 'espolvoreador') ? 4.5 : 3);
  }
}

export function up(J) {
  J.decorado.pres = null;
}

export function ayuda(J) {
  const tk = ticketDeco(J);
  const d = activa(J, tk);
  if (!d) return null;
  const spec = tk.pedido.donas[J.decorado.idx];
  const c = checks(spec, d);
  const enLista = { x: 200, y: 230, lado: 'izq' };
  if (spec.relleno && !c.relleno) return { k: 'rellenar', ...enLista, cat: 'relleno' };
  if (spec.bano && !c.bano) return { k: 'banar', ...enLista, cat: 'bano' };
  if (spec.hilos && !c.hilos) return { k: 'hilos', ...enLista, cat: 'hilos' };
  if (spec.toppings.length && !c.topping) return { k: 'toppings', ...enLista, cat: 'topping' };
  if (spec.pieza && !c.pieza) return { k: 'piezas', ...enLista, cat: 'pieza' };
  if (J.dia.estadoTicket(tk) === 'decorado') return { k: 'entregar', x: ENTREGAR.x + ENTREGAR.w / 2, y: ENTREGAR.y - 6, lado: 'abajo' };
  return null;
}
