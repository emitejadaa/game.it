/**
 * Heladería — reglas puras: los vasos, las mezclas (frutas, chips, galletitas…), los jarabes que dan el sabor, el
 * punto del licuado (grueso, normal o suave), la crema, las salsas, las granas y lo que va arriba (cereza, oblea…),
 * cada cosa con el rango en que aparece; el pedido favorito de cada cliente y el puntaje de cada estación.
 * La parte de arriba del licuado (donde van crema, salsas y granas) vive en coordenadas normalizadas [-1, 1]².
 */
import { clamp, pick, int, shuffle } from '/shared/cocina/core.js';
import { Paint, cookScore, fillScore } from '/shared/cocina/kit.js';

export const SIZES = [
  { id: 'S', h: 0.78, name: { es: 'Chico', en: 'Small' } },
  { id: 'M', h: 0.92, name: { es: 'Mediano', en: 'Medium' } },
  { id: 'L', h: 1.06, name: { es: 'Grande', en: 'Large' } },
];
export const sizeOf = (id) => SIZES.find((s) => s.id === id) || SIZES[1];

export const MIXES = [
  { id: 'frutilla', rank: 1, name: { es: 'Frutillas', en: 'Strawberries' } },
  { id: 'chips', rank: 1, name: { es: 'Chips de chocolate', en: 'Chocolate chips' } },
  { id: 'banana', rank: 2, name: { es: 'Banana', en: 'Banana' } },
  { id: 'galleta', rank: 3, name: { es: 'Galletitas', en: 'Cookies' } },
  { id: 'durazno', rank: 4, name: { es: 'Durazno', en: 'Peach' } },
  { id: 'arandano', rank: 5, name: { es: 'Arándanos', en: 'Blueberries' } },
  { id: 'mani', rank: 6, name: { es: 'Maní', en: 'Peanuts' } },
  { id: 'ddl', rank: 7, name: { es: 'Bocaditos de dulce de leche', en: 'Caramel bites' } },
  { id: 'kiwi', rank: 8, name: { es: 'Kiwi', en: 'Kiwi' } },
  { id: 'menta', rank: 9, name: { es: 'Caramelos de menta', en: 'Mint candy' } },
];
export const SYRUPS = [
  { id: 'vainilla', rank: 1, color: '#fff0c4', name: { es: 'Vainilla', en: 'Vanilla' } },
  { id: 'choco', rank: 1, color: '#86553a', name: { es: 'Chocolate', en: 'Chocolate' } },
  { id: 'frut', rank: 2, color: '#ff9cbd', name: { es: 'Frutilla', en: 'Strawberry' } },
  { id: 'dulce', rank: 4, color: '#d39a5c', name: { es: 'Dulce de leche', en: 'Dulce de leche' } },
  { id: 'menta', rank: 6, color: '#a6ead0', name: { es: 'Menta', en: 'Mint' } },
  { id: 'limon', rank: 8, color: '#fff38a', name: { es: 'Limón', en: 'Lemon' } },
];
export const BLENDS = [
  { id: 'grueso', rank: 2, v: 0.32, name: { es: 'Grueso', en: 'Chunky' } },
  { id: 'normal', rank: 1, v: 0.62, name: { es: 'Normal', en: 'Regular' } },
  { id: 'suave', rank: 3, v: 0.92, name: { es: 'Suave', en: 'Smooth' } },
];
export const BLEND_SECS = 13; // segundos para llegar a 1 (bien licuado)
export const BLEND_MAX = 1.18; // pasado esto queda aguado
export const CREAMS = [
  { id: 'crema', rank: 1, color: '#fffaf1', name: { es: 'Crema', en: 'Whipped cream' } },
  { id: 'cremachoco', rank: 5, color: '#a77452', name: { es: 'Crema de chocolate', en: 'Chocolate cream' } },
  { id: 'cremafrut', rank: 9, color: '#ffc8da', name: { es: 'Crema de frutilla', en: 'Strawberry cream' } },
];
export const DRIZZLES = [
  { id: 'salsachoco', rank: 1, color: '#4f2b19', name: { es: 'Salsa de chocolate', en: 'Chocolate sauce' } },
  { id: 'caramelo', rank: 3, color: '#d8902a', name: { es: 'Caramelo', en: 'Caramel' } },
  { id: 'salsafrut', rank: 6, color: '#e2335a', name: { es: 'Salsa de frutilla', en: 'Strawberry sauce' } },
];
export const SPRINKLES = [
  { id: 'granas', rank: 2, name: { es: 'Granas de colores', en: 'Rainbow sprinkles' } },
  { id: 'rallado', rank: 4, name: { es: 'Chocolate rallado', en: 'Chocolate shavings' } },
  { id: 'coco', rank: 7, name: { es: 'Coco', en: 'Coconut' } },
];
export const GARNISH = [
  { id: 'cereza', rank: 1, name: { es: 'Cereza', en: 'Cherry' } },
  { id: 'oblea', rank: 2, name: { es: 'Oblea', en: 'Wafer' } },
  { id: 'galletita', rank: 3, name: { es: 'Galletita', en: 'Cookie' } },
  { id: 'gomita', rank: 5, name: { es: 'Osito de goma', en: 'Gummy bear' } },
  { id: 'frutillita', rank: 6, name: { es: 'Frutilla', en: 'Strawberry' } },
  { id: 'nuez', rank: 8, name: { es: 'Nuez', en: 'Walnut' } },
  { id: 'rodaja', rank: 10, name: { es: 'Banana', en: 'Banana slice' } },
];
/** Dónde va cada cosa de arriba (en la parte de arriba normalizada). */
export const SPOTS = { L: { x: -0.56, y: -0.18 }, C: { x: 0, y: -0.7 }, R: { x: 0.56, y: -0.18 } };

const all = [...MIXES, ...SYRUPS, ...BLENDS, ...CREAMS, ...DRIZZLES, ...SPRINKLES, ...GARNISH];
export const byId = Object.fromEntries(all.map((x) => [x.id, x]));
const open = (list, rank) => list.filter((x) => x.rank <= rank);
export const mixesAt = (rank) => open(MIXES, rank);
export const syrupsAt = (rank) => open(SYRUPS, rank);
export const blendsAt = (rank) => open(BLENDS, rank);
export const creamsAt = (rank) => open(CREAMS, rank);
export const drizzlesAt = (rank) => open(DRIZZLES, rank);
export const sprinklesAt = (rank) => open(SPRINKLES, rank);
export const garnishAt = (rank) => open(GARNISH, rank);

/** La zona de arriba donde va la crema y lo que se le pone: media cúpula sobre el borde del vaso. */
export const dome = (x, y) => y <= 0.95 && (x * x) / 1.0 + ((y - 0.95) * (y - 0.95)) / (1.95 * 1.95) <= 1;

/** Pedido favorito de un cliente. */
export function makeOrder(r, rank) {
  const mixes = shuffle(r, mixesAt(rank)).slice(0, rank >= 4 && r() < 0.5 ? 2 : 1).map((m) => m.id);
  const cream = rank >= 3 && r() < 0.15 ? null : pick(r, creamsAt(rank)).id;
  const drizzle = r() < (rank >= 2 ? 0.7 : 0.55) ? pick(r, drizzlesAt(rank)).id : null;
  const sprinkles = rank >= 2 && r() < 0.55 ? pick(r, sprinklesAt(rank)).id : null;
  const nG = clamp(int(r, rank >= 4 ? 1 : 0, rank >= 6 ? 3 : 2), 0, 3);
  const spots = nG === 1 ? ['C'] : nG === 2 ? (r() < 0.5 ? ['L', 'R'] : ['C', r() < 0.5 ? 'L' : 'R']) : ['L', 'C', 'R'];
  const garnish = spots.slice(0, nG).map((pos) => ({ id: pick(r, garnishAt(rank)).id, pos }));
  return {
    size: pick(r, SIZES).id,
    mixes,
    syrup: pick(r, syrupsAt(rank)).id,
    blend: pick(r, blendsAt(rank)).id,
    cream,
    drizzle,
    sprinkles,
    garnish: cream || nG <= 1 ? garnish : garnish.slice(0, 1),
  };
}

/** Licuado nuevo (lo que se va armando). */
export function newCup(size) {
  return { size, mixes: [], syrup: {}, fill: 0, blend: 0, blended: false, cream: null, drizzle: {}, sprinkles: {}, garnish: [] };
}
/** Agrega jarabe de un sabor: `amt` es la fracción del vaso. */
export function pour(cup, id, amt) {
  cup.syrup[id] = (cup.syrup[id] || 0) + amt;
  cup.fill = Object.values(cup.syrup).reduce((a, b) => a + b, 0);
}
/** Capa pintada de arriba (salsa o granas) para un sabor; se crea la primera vez. */
export function topLayer(cup, kind, id) {
  cup[kind][id] ||= new Paint(32);
  return cup[kind][id];
}

// ---------------------------------------------------------------- puntajes
export function buildDetail(order, cup) {
  const size = cup.size === order.size ? 1 : 0.55;
  const want = new Set(order.mixes);
  const got = cup.mixes;
  const uniq = new Set(got);
  const hit = [...want].filter((m) => uniq.has(m)).length;
  const wrong = [...uniq].filter((m) => !want.has(m)).length;
  const repeats = got.length - uniq.size;
  const mix = clamp((hit - wrong * 0.75 - repeats * 0.2) / Math.max(1, want.size), 0, 1);
  const flavor = cup.fill > 0 ? (cup.syrup[order.syrup] || 0) / cup.fill : 0;
  const fill = fillScore(cup.fill, 1, { tol: 0.05, zero: 0.5 }) / 100;
  const syrup = flavor * fill;
  return { size, mix, flavor, fill, score: Math.round(100 * size * (0.35 * mix + 0.65 * syrup)) };
}
export const buildScore = (order, cup) => buildDetail(order, cup).score;

export function blendScore(order, cup) {
  if (!cup.blended) return 0;
  return cookScore(cup.blend, byId[order.blend].v, { tol: 0.06, zero: 0.55, burn: BLEND_MAX });
}

/** Cantidad de crema y qué tan centrada quedó. */
export function creamScore(order, cup) {
  if (!order.cream) return cup.cream ? clamp(1 - cup.cream.amt * 0.8, 0, 1) : 1;
  if (!cup.cream) return 0;
  const kind = cup.cream.id === order.cream ? 1 : 0.5;
  const amt = fillScore(cup.cream.amt, 1, { tol: 0.08, zero: 0.7 }) / 100;
  const center = clamp(1 - Math.max(0, Math.abs(cup.cream.off) - 0.08) / 0.5, 0, 1);
  return kind * (0.6 * amt + 0.4 * center);
}

/** Salsas y granas: cobertura cerca de lo justo (no hay que tapar todo) y castigo por las que no se pidieron. */
function layerScore(want, layers, target, tol, zero) {
  let s = 1;
  for (const id in layers) {
    const cov = layers[id].coverage(dome);
    if (id === want) s *= fillScore(cov, target, { tol, zero }) / 100;
    else if (cov > 0.02) s *= clamp(1 - cov * 2.5, 0.2, 1);
  }
  if (want && !layers[want]) return 0;
  return s;
}
export const drizzleScore = (order, cup) => layerScore(order.drizzle, cup.drizzle, 0.42, 0.14, 0.42);
export const sprinkleScore = (order, cup) => layerScore(order.sprinkles, cup.sprinkles, 0.5, 0.18, 0.5);

/** Lo de arriba: cada cosa pedida en su lugar; lo que sobra resta. */
export function garnishScore(order, cup) {
  const left = cup.garnish.slice();
  let s = 0;
  for (const w of order.garnish) {
    const spot = SPOTS[w.pos];
    let best = -1, bestD = Infinity;
    left.forEach((g, i) => {
      if (g.id !== w.id) return;
      const d = Math.hypot(g.x - spot.x, g.y - spot.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      s += clamp(1 - Math.max(0, bestD - 0.12) / 0.55, 0, 1);
      left.splice(best, 1);
    }
  }
  const n = order.garnish.length;
  if (!n) return left.length ? clamp(1 - left.length * 0.3, 0, 1) : 1;
  return clamp(s / n - left.length * 0.2, 0, 1);
}

/** Decorado: promedio de lo que lleva (crema, salsa, granas y lo de arriba). */
export function topDetail(order, cup) {
  const parts = { cream: creamScore(order, cup), drizzle: drizzleScore(order, cup), sprinkles: sprinkleScore(order, cup), garnish: garnishScore(order, cup) };
  const w = { cream: order.cream ? 1 : 0.5, drizzle: order.drizzle ? 1 : 0.4, sprinkles: order.sprinkles ? 1 : 0.4, garnish: order.garnish.length ? 1.2 : 0.4 };
  let a = 0, b = 0;
  for (const k in parts) {
    a += parts[k] * w[k];
    b += w[k];
  }
  return { ...parts, score: Math.round((100 * a) / b) };
}
export const topScore = (order, cup) => topDetail(order, cup).score;

export const expected = (order) => 30 + byId[order.blend].v * BLEND_SECS + (order.cream ? 4 : 0) + (order.drizzle ? 4 : 0) + (order.sprinkles ? 3 : 0) + order.garnish.length * 3;
export const tipBase = (order) => 2.1 + order.mixes.length * 0.4 + (order.cream ? 0.3 : 0) + (order.drizzle ? 0.3 : 0) + (order.sprinkles ? 0.3 : 0) + order.garnish.length * 0.3 + (order.size === 'L' ? 0.3 : 0);
