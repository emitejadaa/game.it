/**
 * Pedidos y puntajes. Sin nada de pantalla: se puede probar suelto con Node.
 *
 * Un pedido: { donas: [spec, …] } y cada spec:
 *   { masa, forma, relleno|null, bano|null, hilos|null, toppings: [ids], pieza: { id, n }|null }
 * Lo que arma el jugador (una dona hecha):
 *   { masa, forma, coc: [ladoA, ladoB], relleno: { id, cant }|null, bano: { id, cob }|null,
 *     hilos: { [id]: cobertura }, tops: { [id]: cobertura }, piezas: [{ id, x, y }] }
 */
import { MASAS, FORMAS, RELLENOS, BANOS, HILOS, TOPPINGS, PIEZAS, disponibles } from './data.js';
import { reparto } from './geom.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------ armar pedidos

function elegir(rng, lista) {
  return lista[Math.floor(rng() * lista.length)];
}

/** Elige de lo que le gusta al cliente (si ya existe) o cualquier cosa disponible. */
function preferido(rng, lista, likes, p = 0.7) {
  const ok = likes ? lista.filter((x) => likes.includes(x.id)) : [];
  return (ok.length && rng() < p ? elegir(rng, ok) : elegir(rng, lista)).id;
}

/** Cuántas donas pide según el día (los exigentes piden más). */
function cuantas(rng, day, exigente) {
  if (exigente) return day < 3 ? 1 : day < 6 ? 2 : rng() < 0.5 ? 2 : 3;
  if (day <= 1) return 1;
  if (day <= 4) return rng() < (day === 2 ? 0.3 : 0.5) ? 2 : 1;
  if (day <= 7) return rng() < 0.25 ? 1 : rng() < 0.75 ? 2 : 3;
  return rng() < 0.55 ? 2 : 3;
}

/**
 * Pedido de un cliente para el día dado. simple: el primer pedido del juego (para aprender).
 */
export function crearPedido(cliente, day, rng = Math.random, { exigente = false, simple = false } = {}) {
  const L = cliente.likes || {};
  const masas = disponibles(MASAS, day);
  const formas = disponibles(FORMAS, day);
  const rellenos = disponibles(RELLENOS, day);
  const banos = disponibles(BANOS, day);
  const hilos = disponibles(HILOS, day);
  const tops = disponibles(TOPPINGS, day);
  const piezas = disponibles(PIEZAS, day);
  const n = simple ? 1 : cuantas(rng, day, exigente);
  const donas = [];
  for (let i = 0; i < n; i++) {
    const d = { masa: preferido(rng, masas, L.masa), forma: simple ? 'anillo' : preferido(rng, formas, L.forma, 0.6), relleno: null, bano: null, hilos: null, toppings: [], pieza: null };
    if (d.forma === 'bola' || (d.forma === 'baston' && rng() < (exigente ? 0.7 : 0.5))) d.relleno = preferido(rng, rellenos, L.relleno);
    if (simple || day === 1 || exigente || rng() < 0.92) d.bano = preferido(rng, banos, L.bano);
    if (!simple && hilos.length && rng() < (exigente ? 0.85 : clamp(0.12 + 0.045 * day, 0, 0.6))) d.hilos = preferido(rng, hilos, L.hilos);
    if (simple || rng() < (exigente ? 0.85 : clamp(0.55 + 0.02 * day, 0, 0.8))) {
      d.toppings.push(preferido(rng, tops, L.topping));
      if (tops.length > 1 && day >= 8 && rng() < (exigente ? 0.5 : 0.25)) {
        const otro = preferido(rng, tops.filter((t) => t.id !== d.toppings[0]), L.topping);
        d.toppings.push(otro);
      }
    }
    if (!simple && piezas.length && rng() < (exigente ? 0.7 : clamp(0.1 + 0.03 * day, 0, 0.45))) {
      const max = d.forma === 'baston' ? 4 : 6;
      d.pieza = { id: preferido(rng, piezas, L.pieza), n: 3 + Math.floor(rng() * (max - 2)) };
    }
    donas.push(d);
  }
  return { donas };
}

// ------------------------------------------------------------------ fritura

/** Velocidad: cuánto se cocina un lado por segundo (1 = punto justo a los ~8 s). */
export const COCCION = 1 / 8;
/** Zona perfecta de cada lado. */
export const PUNTO = [0.9, 1.15];

/** Puntaje (0..1) de un lado según cuánto se cocinó. */
export function notaLado(c, zona = PUNTO) {
  if (c >= zona[0] && c <= zona[1]) return 1;
  if (c < zona[0]) return clamp((c - 0.45) / (zona[0] - 0.45));
  return clamp(1 - (c - zona[1]) / 0.65);
}

/** Cómo se ve un lado: 'crudo' | 'casi' | 'dorado' | 'pasado' | 'quemado'. */
export function puntoDe(c, zona = PUNTO) {
  if (c < 0.6) return 'crudo';
  if (c < zona[0]) return 'casi';
  if (c <= zona[1]) return 'dorado';
  if (c < 1.4) return 'pasado';
  return 'quemado';
}

// ------------------------------------------------------------------ puntajes por estación

/** Masa: que cada dona tenga la masa y la forma pedidas. */
export function notaMasa(pedido, hechas) {
  let s = 0;
  pedido.donas.forEach((spec, i) => {
    const d = hechas[i];
    if (!d) return;
    s += (d.masa === spec.masa ? 0.5 : 0) + (d.forma === spec.forma ? 0.5 : 0);
  });
  return Math.round((100 * s) / pedido.donas.length);
}

/** Fritura: los dos lados en su punto. */
export function notaFritura(pedido, hechas, zona = PUNTO) {
  let s = 0;
  pedido.donas.forEach((_, i) => {
    const d = hechas[i];
    if (!d) return;
    s += (notaLado(d.coc[0], zona) + notaLado(d.coc[1], zona)) / 2;
  });
  return Math.round((100 * s) / pedido.donas.length);
}

const meseta = (v, lo, hi, cero, techo, piso = 0) => {
  if (v >= lo && v <= hi) return 1;
  if (v < lo) return clamp((v - cero) / (lo - cero));
  return Math.max(piso, clamp(1 - (v - hi) / (techo - hi)));
};

/** Calidad del relleno según la cantidad (1 = la raya). */
export const notaCantidad = (c) => meseta(c, 0.88, 1.06, 0.2, 1.55, 0.25);
/** Calidad del baño según cuánto cubre (1 = toda la dona). */
export const notaCobertura = (c) => meseta(c, 0.93, 1.12, 0.3, 1.7, 0.4);
/** Calidad de los hilos: ni muy poquito ni todo tapado. */
export const notaHilos = (c) => meseta(c, 0.22, 0.6, 0.03, 1.0, 0.4);
/** Calidad de un topping espolvoreado: que cubra casi toda la dona. */
export const notaTopping = (c) => clamp((c - 0.12) / (0.7 - 0.12));

/** Decorado de una dona: cada cosa pedida suma, lo que no se pidió resta. Devuelve 0..1 y el detalle. */
export function notaDona(spec, d) {
  if (!d) return { nota: 0, partes: [] };
  const partes = [];
  const add = (que, v, w = 1) => partes.push({ que, v, w });
  // relleno
  if (spec.relleno) add('relleno', d.relleno ? (d.relleno.id === spec.relleno ? 1 : 0.35) * notaCantidad(d.relleno.cant) : 0);
  else if (d.relleno) add('relleno', 0, 0.5);
  // baño
  if (spec.bano) add('bano', d.bano ? (d.bano.id === spec.bano ? 1 : 0.3) * notaCobertura(d.bano.cob) : 0);
  else if (d.bano) add('bano', 0, 0.5);
  // hilos
  const hilos = d.hilos || {};
  const otrosHilos = Object.keys(hilos).filter((k) => k !== spec.hilos && hilos[k] > 0.01);
  if (spec.hilos) {
    const c = hilos[spec.hilos] || 0;
    if (c > 0.01) add('hilos', notaHilos(c) * (otrosHilos.length ? 0.6 : 1));
    else add('hilos', otrosHilos.length ? 0.3 * notaHilos(hilos[otrosHilos[0]]) : 0);
  } else if (otrosHilos.length) add('hilos', 0, 0.5);
  // toppings
  const tops = d.tops || {};
  for (const t of spec.toppings) add('topping', notaTopping(tops[t] || 0));
  for (const t of Object.keys(tops)) if (!spec.toppings.includes(t) && tops[t] > 0.02) add('topping', 0, 0.5);
  // piezas
  const piezas = d.piezas || [];
  if (spec.pieza) {
    const mias = piezas.filter((p) => p.id === spec.pieza.id);
    const m = mias.length;
    const cuenta = clamp(1 - Math.abs(m - spec.pieza.n) / spec.pieza.n);
    const parejo = m ? reparto(d.forma, mias) : 0;
    add('pieza', (0.6 * cuenta + 0.4 * parejo) * (m < piezas.length ? 0.7 : 1));
  } else if (piezas.length) add('pieza', 0, 0.5);
  if (!partes.length) return { nota: 1, partes };
  const w = partes.reduce((a, p) => a + p.w, 0);
  return { nota: partes.reduce((a, p) => a + p.v * p.w, 0) / w, partes };
}

export function notaDecorado(pedido, hechas) {
  let s = 0;
  pedido.donas.forEach((spec, i) => (s += notaDona(spec, hechas[i]).nota));
  return Math.round((100 * s) / pedido.donas.length);
}

/** Cuánto espera tranquilo un cliente (segundos) antes de empezar a enojarse. */
export function tolerancia(nDonas, paciencia = 1) {
  return (50 + 32 * nDonas) * paciencia;
}

/** Espera: 100 si lo atendiste dentro de su tolerancia; después baja. */
export function notaEspera(seg, nDonas, paciencia = 1, exigente = false) {
  const t = tolerancia(nDonas, paciencia);
  if (seg <= t) return 100;
  return Math.round(Math.max(0, 100 - ((seg - t) * 100) / (exigente ? 120 : 180)));
}

/** Paciencia propia de algunos clientes (1 = normal). */
export const PACIENCIA = { beto: 0.85, gaston: 0.85, toto: 0.9, olga: 1.15, martina: 1.1, ruth: 1.1, crocante: 0.8 };

/** Las cuatro notas, endurecidas si es un cliente exigente, y el total. */
export function notaFinal(notas, exigente, day = 99) {
  const out = { ...notas };
  if (exigente) {
    const suave = day <= 1 ? 0.5 : 1; // el primer día, Doña Pocha es un poco más buena
    for (const k of Object.keys(out)) {
      const e = 1 + ((k === exigente.foco ? exigente.fuerza : exigente.estricto) - 1) * suave;
      out[k] = Math.round(100 * Math.pow(out[k] / 100, e));
    }
  }
  const total = Math.round((out.espera + out.masa + out.fritura + out.decorado) / 4);
  return { notas: out, total };
}

/** Propina en monedas. extra: suma de los bonus de propina de la decoración (0.15 = +15%). */
export function propina(total, nDonas, exigente, extra = 0) {
  const base = 2 + 6 * Math.pow(total / 100, 2) * (1 + 0.5 * (nDonas - 1));
  return Math.round(base * (exigente ? 2.2 : 1) * (1 + extra));
}
