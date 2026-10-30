/**
 * Pizzería — reglas puras: los ingredientes (y en qué rango se abren), las zonas de la pizza (entera, mitades y
 * cuartos), el pedido favorito de cada cliente y el puntaje de cada estación: armado (salsa, queso y que cada
 * ingrediente esté en su zona, en la cantidad pedida y bien repartido), horno (el punto justo) y corte (cortes que
 * pasan por el centro y porciones parejas). La pizza vive en coordenadas normalizadas: centro (0, 0), borde en 1.
 */
import { clamp, pick, int, shuffle } from '/shared/cocina/core.js';
import { Paint, paintScore, evenness, cookScore } from '/shared/cocina/kit.js';

export const INNER = 0.84; // hasta dónde va la salsa (después viene el borde de masa)
export const EDGE = 0.93; // un ingrediente más afuera que esto quedó sobre el borde
export const BAKE_SECS = 4.5; // segundos por octavo de cocción
export const BAKE_MAX = 8; // pasado esto se quema

export const TOPPINGS = [
  { id: 'calabresa', rank: 1, name: { es: 'Calabresa', en: 'Pepperoni' } },
  { id: 'hongos', rank: 1, name: { es: 'Champiñones', en: 'Mushrooms' } },
  { id: 'aceitunas', rank: 2, name: { es: 'Aceitunas', en: 'Olives' } },
  { id: 'morron', rank: 3, name: { es: 'Morrón', en: 'Red pepper' } },
  { id: 'cebolla', rank: 4, name: { es: 'Cebolla', en: 'Onion' } },
  { id: 'jamon', rank: 5, name: { es: 'Jamón', en: 'Ham' } },
  { id: 'anana', rank: 6, name: { es: 'Ananá', en: 'Pineapple' } },
  { id: 'anchoas', rank: 7, name: { es: 'Anchoas', en: 'Anchovies' } },
  { id: 'panceta', rank: 8, name: { es: 'Panceta', en: 'Bacon' } },
  { id: 'tomate', rank: 9, name: { es: 'Tomate', en: 'Tomato' } },
  { id: 'albahaca', rank: 10, name: { es: 'Albahaca', en: 'Basil' } },
  { id: 'huevo', rank: 11, name: { es: 'Huevo', en: 'Egg' } },
];
export const byId = Object.fromEntries(TOPPINGS.map((t) => [t.id, t]));
export const toppingsAt = (rank) => TOPPINGS.filter((t) => t.rank <= rank);

/** Zonas: entera, mitad izquierda/derecha y los cuatro cuartos (y crece hacia abajo, como en la pantalla). */
export const REGIONS = ['all', 'L', 'R', 'TL', 'TR', 'BL', 'BR'];
export function inRegion(reg, x, y) {
  if (x * x + y * y > EDGE * EDGE) return false;
  switch (reg) {
    case 'all':
      return true;
    case 'L':
      return x < 0;
    case 'R':
      return x >= 0;
    case 'TL':
      return x < 0 && y < 0;
    case 'TR':
      return x >= 0 && y < 0;
    case 'BL':
      return x < 0 && y >= 0;
    case 'BR':
      return x >= 0 && y >= 0;
  }
  return false;
}
export const regionArea = (reg) => (Math.PI * INNER * INNER) / (reg === 'all' ? 1 : reg.length === 1 ? 2 : 4);
const inner = (x, y) => x * x + y * y <= INNER * INNER;

/** Qué cortes se pueden pedir y desde qué rango. */
export const slicesAt = (rank) => (rank >= 3 ? [4, 6, 8] : rank >= 2 ? [4, 6] : [4]);
/** Puntos de horno (en octavos) que se pueden pedir según el rango. */
export const bakesAt = (rank) => (rank >= 7 ? [2, 3, 4, 5, 6, 7] : rank >= 4 ? [3, 4, 5, 6] : rank >= 2 ? [3, 4, 5] : [4]);

/** Pedido favorito de un cliente (r = azar con semilla del cliente). */
export function makeOrder(r, rank) {
  const avail = toppingsAt(rank);
  const maxKinds = rank >= 6 ? 4 : rank >= 3 ? 3 : 2;
  const kinds = clamp(int(r, 1, maxKinds), 1, avail.length);
  const chosen = shuffle(r, avail).slice(0, kinds);
  const used = [];
  const toppings = chosen.map((tp) => {
    let reg = 'all';
    const roll = r();
    if (rank >= 2 && roll < 0.22) reg = pick(r, ['TL', 'TR', 'BL', 'BR']);
    else if (roll < 0.55) reg = pick(r, ['L', 'R']);
    // que no queden todos en el mismo lugar chiquito
    if (used.includes(reg) && reg !== 'all') reg = r() < 0.5 ? 'all' : reg === 'L' ? 'R' : reg === 'R' ? 'L' : reg;
    used.push(reg);
    const n = reg === 'all' ? pick(r, rank >= 3 ? [6, 8, 8, 10, 12] : [6, 8, 8]) : reg.length === 1 ? pick(r, [3, 4, 4, 5, 6]) : pick(r, [2, 3, 3]);
    return { t: tp.id, reg, n };
  });
  return { toppings, bake: pick(r, bakesAt(rank)), slices: pick(r, slicesAt(rank)) };
}

/** Pizza nueva (lo que se va armando). */
export function newPizza(n = 44) {
  return { sauce: new Paint(n), cheese: new Paint(n), pieces: [], bake: 0, cuts: [], baked: false };
}

// ---------------------------------------------------------------- puntajes
// pasarse un poco sobre el borde no cuenta: lo que castiga es ensuciar la parte de afuera de la masa
const crust = (x, y) => x * x + y * y > 0.93 * 0.93;
export function sauceScore(pz) {
  return paintScore(pz.sauce, inner, { full: 0.86, zero: 0.3, spillTol: 0.04, spillZero: 0.3, outside: crust });
}
export function cheeseScore(pz) {
  return paintScore(pz.cheese, inner, { full: 0.84, zero: 0.3, spillTol: 0.04, spillZero: 0.3, outside: crust });
}

/** Ingredientes: cantidad en su zona, repartidos parejo, castigo por los que quedaron afuera o nadie pidió. */
export function toppingDetail(order, pieces) {
  const rows = order.toppings.map((w) => {
    const mine = pieces.filter((p) => p.t === w.t);
    const inside = mine.filter((p) => inRegion(w.reg, p.x, p.y));
    const out = mine.length - inside.length;
    const cnt = Math.max(0, 1 - Math.abs(inside.length - w.n) / w.n);
    const ev = inside.length >= 2 ? evenness(inside, regionArea(w.reg)) : inside.length ? 0.6 : 0;
    const s = clamp(cnt * 0.75 + ev * 0.25 - out * 0.12, 0, 1);
    return { ...w, have: inside.length, out, cnt, ev, s };
  });
  const extra = pieces.filter((p) => !order.toppings.some((w) => w.t === p.t)).length;
  const base = rows.length ? rows.reduce((a, b) => a + b.s, 0) / rows.length : extra ? 0 : 1;
  return { rows, extra, score: Math.round(100 * clamp(base - extra * 0.08, 0, 1)) };
}

/** Puntaje del armado: salsa 20 %, queso 20 %, ingredientes 60 %. */
export function buildScore(order, pz) {
  const s = sauceScore(pz).score, c = cheeseScore(pz).score, tp = toppingDetail(order, pz.pieces).score;
  return Math.round(s * 0.2 + c * 0.2 + tp * 0.6);
}

export function bakeScore(order, pz) {
  if (!pz.baked) return 0;
  return cookScore(pz.bake, order.bake, { tol: 0.15, zero: 2.2, burn: BAKE_MAX });
}

/**
 * Corte: cada corte es una recta (la que pasa por los dos puntos del gesto). Tienen que ser `slices / 2` rectas que
 * pasen por el centro y con ángulos repartidos parejo.
 */
export function cutDetail(order, cuts) {
  const k = order.slices / 2;
  if (!cuts.length) return { lines: [], center: 0, angle: 0, count: 0, score: 0 };
  const lines = cuts.map((c) => {
    const dx = c.x2 - c.x1, dy = c.y2 - c.y1;
    const L = Math.hypot(dx, dy) || 1;
    const d = Math.abs(c.x1 * dy - c.y1 * dx) / L;
    const a = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI;
    return { d, a };
  });
  const count = clamp(1 - Math.abs(lines.length - k) / k, 0, 1);
  const center = lines.reduce((s, l) => s + clamp(1 - Math.max(0, l.d - 0.05) / 0.26, 0, 1), 0) / lines.length;
  let angle = 1;
  if (lines.length >= 2) {
    const as = lines.map((l) => l.a).sort((a, b) => a - b);
    const ideal = Math.PI / as.length;
    let err = 0;
    for (let i = 0; i < as.length; i++) {
      const gap = i + 1 < as.length ? as[i + 1] - as[i] : as[0] + Math.PI - as[i];
      err += Math.abs(gap - ideal);
    }
    angle = clamp(1 - (err / Math.PI) * 2.2, 0, 1);
  }
  return { lines, center, angle, count, score: Math.round(100 * count * (0.5 * center + 0.5 * angle)) };
}
export const cutScore = (order, pz) => cutDetail(order, pz.cuts).score;

/** Segundos razonables para tenerla lista (armar, hornear y cortar). */
export const expected = (order) => 34 + order.bake * BAKE_SECS + order.toppings.length * 4;

/** Propina base: más ingredientes y más cortes, más propina. */
export const tipBase = (order) => 2.2 + order.toppings.length * 0.5 + (order.slices === 8 ? 0.4 : 0) + Math.abs(order.bake - 4) * 0.15;

/** Cuántas porciones quedan según los cortes (para dibujarla separada al entregar). */
export function sliceAngles(cuts) {
  const as = cuts.map((c) => ((Math.atan2(c.y2 - c.y1, c.x2 - c.x1) % Math.PI) + Math.PI) % Math.PI);
  const all = [...as, ...as.map((a) => a + Math.PI)].sort((a, b) => a - b);
  return all;
}
