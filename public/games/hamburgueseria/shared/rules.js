/**
 * Hamburguesería — reglas puras: los ingredientes que se apilan (y en qué rango se abren), el punto de la carne
 * (jugosa, a punto o bien cocida) con la cocción de cada lado en la parrilla, el pedido favorito de cada cliente y el
 * puntaje de cada estación: parrilla (los dos lados de cada medallón cerca del punto pedido) y armado (el orden de la
 * pila igual al de la comanda y cada cosa bien centrada sobre el pan).
 */
import { clamp, pick, int, shuffle } from '/shared/cocina/core.js';
import { sequenceMatch, cookScore } from '/shared/cocina/kit.js';

export const COOK_SECS = 11; // segundos para que un lado llegue a 1 (bien cocido)
export const BURN = 1.3; // pasado esto, ese lado se quemó
export const DONENESS = [
  { id: 'jugosa', rank: 1, v: 0.5, name: { es: 'Jugosa', en: 'Rare' } },
  { id: 'apunto', rank: 1, v: 0.75, name: { es: 'A punto', en: 'Medium' } },
  { id: 'cocida', rank: 3, v: 1.0, name: { es: 'Bien cocida', en: 'Well done' } },
];
export const ITEMS = [
  { id: 'carne', rank: 1, h: 26, name: { es: 'Carne', en: 'Patty' } },
  { id: 'queso', rank: 1, h: 7, name: { es: 'Queso', en: 'Cheese' } },
  { id: 'lechuga', rank: 1, h: 12, name: { es: 'Lechuga', en: 'Lettuce' } },
  { id: 'tomate', rank: 1, h: 11, name: { es: 'Tomate', en: 'Tomato' } },
  { id: 'ketchup', rank: 1, h: 6, sauce: true, color: '#d8261c', name: { es: 'Kétchup', en: 'Ketchup' } },
  { id: 'cebolla', rank: 2, h: 8, name: { es: 'Cebolla', en: 'Onion' } },
  { id: 'mostaza', rank: 3, h: 6, sauce: true, color: '#f3c21b', name: { es: 'Mostaza', en: 'Mustard' } },
  { id: 'pepinos', rank: 4, h: 8, name: { es: 'Pepinillos', en: 'Pickles' } },
  { id: 'panceta', rank: 5, h: 9, name: { es: 'Panceta', en: 'Bacon' } },
  { id: 'mayo', rank: 6, h: 6, sauce: true, color: '#fff6d8', name: { es: 'Mayonesa', en: 'Mayo' } },
  { id: 'huevo', rank: 7, h: 13, name: { es: 'Huevo frito', en: 'Fried egg' } },
  { id: 'barbacoa', rank: 8, h: 6, sauce: true, color: '#6b2a17', name: { es: 'Barbacoa', en: 'BBQ sauce' } },
  { id: 'palta', rank: 9, h: 11, name: { es: 'Palta', en: 'Avocado' } },
  { id: 'hongos', rank: 10, h: 11, name: { es: 'Hongos', en: 'Mushrooms' } },
];
export const BUN_BOTTOM = { id: 'panabajo', h: 30, name: { es: 'Pan de abajo', en: 'Bottom bun' } };
export const BUN_TOP = { id: 'panarriba', h: 46, name: { es: 'Pan de arriba', en: 'Top bun' } };
export const byId = Object.fromEntries([...ITEMS, BUN_BOTTOM, BUN_TOP, ...DONENESS].map((x) => [x.id, x]));
export const itemsAt = (rank) => ITEMS.filter((x) => x.rank <= rank);
export const donenessAt = (rank) => DONENESS.filter((x) => x.rank <= rank);
export const BUN_W = 1; // el ancho del pan es la unidad para medir lo centrado

/** Pedido favorito: cuántas carnes, su punto y la pila de abajo hacia arriba (sin los panes). */
export function makeOrder(r, rank) {
  const patties = clamp(int(r, 1, rank >= 6 ? 3 : rank >= 2 ? 2 : 1), 1, 3);
  const extras = shuffle(r, itemsAt(rank).filter((x) => x.id !== 'carne'));
  const nTop = clamp(int(r, 1, rank >= 4 ? 5 : 3), 1, extras.length);
  const tops = extras.slice(0, nTop).map((x) => x.id);
  // las salsas van arriba de todo o pegadas a la carne; lo demás en cualquier orden
  const stack = [];
  const layers = Array.from({ length: patties }, () => []);
  tops.forEach((id, i) => layers[i % patties].push(id));
  for (let i = 0; i < patties; i++) {
    stack.push('carne');
    for (const id of shuffle(r, layers[i])) stack.push(id);
  }
  // a veces el queso va directo sobre cada carne (la clásica)
  return { cook: pick(r, donenessAt(rank)).id, stack };
}

/** Lo que pide de abajo hacia arriba, con los panes. */
export const fullStack = (order) => [BUN_BOTTOM.id, ...order.stack, BUN_TOP.id];

/** Hamburguesa nueva: la pila que se va armando (cada cosa con su corrimiento x respecto del centro del pan). */
export function newBurger() {
  return { items: [{ id: BUN_BOTTOM.id, x: 0 }], done: false };
}
/** Medallón nuevo en la parrilla (lados a y b; abajo está el lado `down`). */
export const newPatty = () => ({ a: 0, b: 0, down: 'a' });

// ---------------------------------------------------------------- puntajes
/** Punto de un medallón: los dos lados cerca de lo pedido, quemado castiga. */
export function pattyScore(p, cook) {
  const v = byId[cook].v;
  const side = (x) => cookScore(x, v, { tol: 0.07, zero: 0.55, burn: BURN });
  return (side(p.a) + side(p.b)) / 2;
}

/** Parrilla: el promedio de los medallones de la hamburguesa (los que faltan valen 0 y los de más restan). */
export function grillScore(order, burger) {
  const want = order.stack.filter((x) => x === 'carne').length;
  const got = burger.items.filter((x) => x.id === 'carne');
  if (!want) return got.length ? 50 : 100;
  let s = 0;
  for (let i = 0; i < Math.min(want, got.length); i++) s += pattyScore(got[i].patty || { a: 0, b: 0 }, order.cook);
  const extra = Math.max(0, got.length - want);
  return Math.round(clamp(s / want - extra * 15, 0, 100));
}

/** Armado: orden de la pila (subsecuencia común) por lo centrado que quedó cada cosa. */
export function buildDetail(order, burger) {
  const want = fullStack(order);
  const got = burger.items.map((x) => x.id);
  const seq = sequenceMatch(want, got);
  const offs = burger.items.slice(1).map((x) => Math.abs(x.x));
  const mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
  const center = clamp(1 - Math.max(0, mean - 0.06) / 0.4, 0, 1);
  return { seq, center, score: Math.round(100 * seq * (0.55 + 0.45 * center)) };
}
export const buildScore = (order, burger) => buildDetail(order, burger).score;

export const expected = (order) => 26 + byId[order.cook].v * COOK_SECS * 2 + order.stack.length * 3;
export const tipBase = (order) => 2 + order.stack.length * 0.32 + (order.cook === 'cocida' ? 0.3 : 0);
