/**
 * Cocina — la lógica pura que comparten los juegos de atender un local (pizzería, heladería, hamburguesería…):
 * azar con semilla, el padrón de clientes (cada uno con su cara y su pedido favorito), el plan de cada día (quién
 * viene y cuándo), el puntaje de la espera, las propinas, los rangos y el guardado. No toca el DOM: se prueba en Node.
 */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;

/** Azar con semilla (mulberry32): el mismo número da siempre la misma secuencia. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash FNV-1a de un texto → entero de 32 bits. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));

export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- clientes
/**
 * El padrón: los mismos vecinos van a todos los locales (cada uno con su favorito en cada juego).
 * `k` sugiere el estilo (f, m o n) solo para no ponerle bigote a la abuela; la cara sale de la semilla.
 */
export const NAMES = [
  ['Tito', 'm'], ['Marta', 'f'], ['Lucho', 'm'], ['Pili', 'f'], ['Coco', 'n'], ['Nacho', 'm'], ['Juli', 'f'], ['Fede', 'm'],
  ['Sofi', 'f'], ['Tomi', 'm'], ['Vale', 'f'], ['Rami', 'm'], ['Lola', 'f'], ['Beto', 'm'], ['Chela', 'f'], ['Don Ernesto', 'm'],
  ['Gladys', 'f'], ['Rocío', 'f'], ['Facu', 'm'], ['Cami', 'f'], ['Agus', 'n'], ['Mili', 'f'], ['Pancho', 'm'], ['Rosa', 'f'],
  ['Hugo', 'm'], ['Nora', 'f'], ['Sergio', 'm'], ['Tati', 'f'], ['Uli', 'n'], ['Vicky', 'f'], ['Walter', 'm'], ['Ximena', 'f'],
  ['Yami', 'f'], ['Zoe', 'f'], ['Bauti', 'm'], ['Clara', 'f'], ['Dante', 'm'], ['Emma', 'f'], ['Franco', 'm'], ['Gina', 'f'],
  ['Iván', 'm'], ['Kiara', 'f'], ['Mora', 'f'], ['Nico', 'm'], ['Quique', 'm'], ['Ruth', 'f'], ['Santi', 'm'], ['Doña Tere', 'f'],
];

export const SKINS = ['#ffe0c7', '#f9cfa8', '#eab48a', '#d29a6c', '#a86b45', '#7a4a2c'];
export const HAIRS = ['#2a1d17', '#4b2f22', '#7a4a26', '#b8742f', '#e2b15a', '#f1d38a', '#c9452c', '#9aa0a8', '#eeeeee', '#3a55c9', '#e45d9b'];
export const HAIR_STYLES = ['short', 'spiky', 'bob', 'long', 'pony', 'bun', 'curly', 'bald', 'buzz', 'side', 'pigtails', 'mohawk', 'wavy'];
export const SHIRTS = ['#e5484d', '#ff8a3d', '#f5c400', '#5cbf4f', '#21a6a0', '#3d7fe0', '#7a5ce6', '#e45d9b', '#ffffff', '#2f3a4a', '#8a5a3a', '#9fd3ff'];

/** Cara y ropa de un cliente: sale de su semilla, así se ve igual en todos los juegos. */
export function look(seed, kind = 'n') {
  const r = rng(seed ^ 0x5bd1e995);
  const fem = kind === 'f', masc = kind === 'm';
  const styles = fem ? ['bob', 'long', 'pony', 'bun', 'curly', 'pigtails', 'wavy', 'short', 'side'] : masc ? ['short', 'spiky', 'bald', 'buzz', 'side', 'curly', 'mohawk', 'wavy', 'short'] : HAIR_STYLES;
  const old = r() < 0.18;
  const hairC = old ? pick(r, ['#9aa0a8', '#eeeeee', '#d8d8d8']) : r() < 0.06 ? pick(r, ['#3a55c9', '#e45d9b', '#21a6a0']) : pick(r, HAIRS.slice(0, 7));
  return {
    skin: pick(r, SKINS),
    hair: pick(r, styles),
    hairC,
    shirt: pick(r, SHIRTS),
    shirt2: pick(r, SHIRTS),
    stripes: r() < 0.22,
    collar: pick(r, ['round', 'v', 'polo', 'hood']),
    head: 0.92 + r() * 0.16, // ancho relativo de la cabeza
    tall: old ? 0.92 : 0.9 + r() * 0.2,
    kid: !old && r() < 0.12,
    old,
    eyes: pick(r, ['dot', 'dot', 'oval', 'happy', 'lash']),
    brows: pick(r, ['flat', 'arch', 'thick', 'none']),
    nose: pick(r, ['dot', 'curve', 'round']),
    cheeks: r() < 0.45,
    glasses: r() < (old ? 0.55 : 0.2) ? pick(r, ['round', 'square', 'sun']) : null,
    hat: r() < 0.16 ? pick(r, ['cap', 'beanie', 'bow', 'band', 'beret']) : null,
    hatC: pick(r, SHIRTS),
    beard: masc && r() < 0.3 ? pick(r, ['mustache', 'beard', 'goatee', 'stubble']) : null,
    freckles: r() < 0.15,
    earrings: fem && r() < 0.3,
  };
}

/** El padrón completo: nombre, semilla, rango en que aparece por primera vez y su cara. */
export function roster() {
  return NAMES.map(([name, kind], i) => {
    const seed = hash(name) ^ (i * 0x9e3779b1);
    return { i, name, kind, seed: seed >>> 0, unlock: i < 4 ? 1 : 1 + Math.ceil((i - 3) / 2), look: look(seed, kind) };
  });
}

// ---------------------------------------------------------------- rangos
/** Puntos necesarios para llegar al rango r (rango 1 = 0). */
export const xpFor = (r) => (r <= 1 ? 0 : 50 * r * (r + 1) - 100);
export function rankOf(xp) {
  let r = 1;
  while (xpFor(r + 1) <= xp) r++;
  const a = xpFor(r), b = xpFor(r + 1);
  return { rank: r, into: xp - a, need: b - a, k: (xp - a) / (b - a) };
}

// ---------------------------------------------------------------- el día
/** Cuántos clientes vienen un día según el rango (y el cartel de la vereda, si se compró). */
export const customersFor = (day, rank, extra = 0) => (day <= 1 ? 3 : clamp(3 + Math.floor((rank + day) / 3), 4, 10) + extra);

/**
 * Plan de un día: quién viene y a qué segundo llega (tiempo de juego, sin contar pausas).
 * Prefiere a los que hace más que no vienen y hace entrar primero a los nuevos del rango.
 */
export function planDay({ day, rank, people, lastVisit = {}, extra = 0, gap = 1, seed = 0 }) {
  const r = rng(hash(`dia:${day}`) ^ seed);
  const open = people.filter((p) => p.unlock <= rank);
  const n = Math.min(open.length, customersFor(day, rank, extra));
  const fresh = open.filter((p) => lastVisit[p.i] == null);
  const rest = shuffle(r, open.filter((p) => lastVisit[p.i] != null)).sort((a, b) => (lastVisit[a.i] ?? -1) - (lastVisit[b.i] ?? -1));
  // los nuevos de a dos por día (así cada cara nueva se presenta); si no alcanza con los conocidos, vienen más nuevos
  const newOnes = fresh.slice(0, day <= 1 ? n : Math.min(2, n));
  const chosen = [...newOnes, ...rest, ...fresh.slice(newOnes.length)].slice(0, n);
  const order = day <= 1 ? chosen : shuffle(r, chosen);
  // separación entre llegadas: más apretada a medida que sube el rango
  const base = clamp(64 - rank * 2.5, 30, 64) * gap;
  let t = 3;
  return order.map((p, k) => {
    const at = t;
    t += base * (0.75 + r() * 0.5) * (k === 0 && day <= 1 ? 1.25 : 1);
    return { p: p.i, at: Math.round(at * 10) / 10 };
  });
}

// ---------------------------------------------------------------- puntajes
/** 100 si la diferencia está dentro de `tol`; después baja de forma lineal hasta 0 en `zero`. */
export function closeness(actual, target, tol, zero) {
  const d = Math.abs(actual - target);
  if (d <= tol) return 100;
  return clamp(100 * (1 - (d - tol) / (zero - tol)), 0, 100);
}

/** Puntaje de la espera: desde que llegó al mostrador hasta que recibió el pedido. */
export function waitScore(waited, target, patience = 1) {
  if (waited <= target) return 100;
  return clamp(100 - ((waited - target) / (1.45 * patience)), 0, 100);
}

/** Promedio de las estaciones más la espera, redondeado. */
export const total = (parts) => Math.round(parts.reduce((s, p) => s + p.score, 0) / Math.max(1, parts.length));

/** Propina según el puntaje (castiga fuerte los pedidos flojos, premia los perfectos). */
export function tipFor(score, base = 3, mult = 1) {
  const k = clamp(score / 100, 0, 1);
  let tip = base * Math.pow(k, 1.6);
  if (score >= 100) tip += base * 0.5;
  return Math.round(tip * mult * 100) / 100;
}

/** Cómo reacciona el cliente. */
export const mood = (score) => (score >= 90 ? 'love' : score >= 72 ? 'happy' : score >= 50 ? 'ok' : 'sad');

/** Formato de dinero: $ 3,75 en español, $3.75 en inglés. */
export function money(v, lang = 'es') {
  const s = (Math.round(v * 100) / 100).toFixed(2);
  return lang === 'es' ? `$ ${s.replace('.', ',')}` : `$${s}`;
}

/** Hora del reloj del local: arranca a las 11:00 y cada segundo de juego es un minuto. */
export function clock(t, start = 11 * 60) {
  const m = Math.floor(start + t);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- guardado
export const SAVE_V = 1;
export function newSave() {
  return { v: SAVE_V, day: 1, money: 0, xp: 0, upgrades: {}, fav: {}, visits: {}, best: {}, last: {}, tips: [], stats: { served: 0, perfect: 0, earned: 0 } };
}
export function fixSave(s) {
  const n = newSave();
  if (!s || typeof s !== 'object' || s.v !== SAVE_V) return n;
  for (const k in n) if (typeof s[k] !== typeof n[k] || s[k] === null) s[k] = n[k];
  s.day = Math.max(1, Math.floor(s.day) || 1);
  s.money = Math.max(0, +s.money || 0);
  s.xp = Math.max(0, +s.xp || 0);
  return s;
}

/** Suma el resultado de un pedido al guardado (puntos, plata, historial del cliente). */
export function record(save, p, score, tip) {
  save.xp += score;
  save.money = Math.round((save.money + tip) * 100) / 100;
  save.visits[p] = (save.visits[p] || 0) + 1;
  save.best[p] = Math.max(save.best[p] || 0, score);
  save.last[p] = save.day;
  save.stats.served++;
  if (score >= 100) save.stats.perfect++;
  save.stats.earned = Math.round((save.stats.earned + tip) * 100) / 100;
}

/** Comprar una mejora: devuelve true si alcanzó la plata y no estaba al máximo. */
export function buy(save, up) {
  const lv = save.upgrades[up.id] || 0;
  if (lv >= (up.max || 1)) return false;
  const cost = upCost(up, lv);
  if (save.money < cost) return false;
  save.money = Math.round((save.money - cost) * 100) / 100;
  save.upgrades[up.id] = lv + 1;
  return true;
}
export const upCost = (up, lv) => (Array.isArray(up.cost) ? up.cost[Math.min(lv, up.cost.length - 1)] : up.cost * (lv + 1));
