/**
 * Lista de países de los juegos de geografía (Banderín, Silueta, Rumbo): nombres en español e inglés con alias para
 * el autocompletado, centro de cada país (para distancia y rumbo) y qué países pueden ser respuesta.
 * Los datos salen de tools/daily/countries.mjs (Natural Earth, dominio público).
 */
import { rng, shuffle } from '/shared/daily.js';

/** Minúsculas, sin tildes ni signos: así se comparan los nombres con lo que escribe la gente. */
export const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export async function loadCountries() {
  const r = await fetch('/shared/countries/countries.json');
  if (!r.ok) throw new Error('countries');
  const list = await r.json();
  for (const c of list) c.keys = [...new Set([norm(c.es), norm(c.en), ...c.alt.map(norm)])];
  return { list, byCode: new Map(list.map((c) => [c.c, c])), answers: list.filter((c) => c.a) };
}

export const nameOf = (c, lang) => c[lang] || c.es;

/** País que coincide exactamente (sin tildes ni mayúsculas) con el texto, o null. */
export function findCountry(ctx, text) {
  const t = norm(text);
  if (!t) return null;
  return ctx.list.find((c) => c.keys.includes(t)) || null;
}

/** Sugerencias para el autocompletado: primero las que empiezan con el texto, después las que tienen una palabra que empieza con él. */
export function suggest(ctx, text, lang, max = 6) {
  const t = norm(text);
  if (!t) return [];
  const starts = [];
  const words = [];
  for (const c of ctx.list) {
    if (c.keys.some((k) => k.startsWith(t))) starts.push(c);
    else if (c.keys.some((k) => k.split(' ').some((w) => w.startsWith(t)))) words.push(c);
  }
  const byName = (a, b) => nameOf(a, lang).localeCompare(nameOf(b, lang), lang);
  return [...starts.sort(byName), ...words.sort(byName)].slice(0, max);
}

/** Respuesta del día: recorre todas las posibles en un orden mezclado una vez con semilla fija (sin repetir hasta agotarlas). */
export function dailyPick(pool, dayNo, seed) {
  const order = shuffle(rng(`orden:${seed}`), [...pool].sort((a, b) => a.c.localeCompare(b.c)));
  return order[(((dayNo - 1) % order.length) + order.length) % order.length];
}

// ---------------------------------------------------------------- distancia y rumbo
const RAD = Math.PI / 180;
/** Distancia en km entre los centros de dos países (haversine). */
export function distanceKm(a, b) {
  const [lo1, la1] = a.ll;
  const [lo2, la2] = b.ll;
  const h = Math.sin(((la2 - la1) * RAD) / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(((lo2 - lo1) * RAD) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** Rumbo (0° = norte, sentido horario) para ir del centro de `a` al de `b`. */
export function bearing(a, b) {
  const [lo1, la1] = a.ll;
  const [lo2, la2] = b.ll;
  const y = Math.sin((lo2 - lo1) * RAD) * Math.cos(la2 * RAD);
  const x = Math.cos(la1 * RAD) * Math.sin(la2 * RAD) - Math.sin(la1 * RAD) * Math.cos(la2 * RAD) * Math.cos((lo2 - lo1) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
export const arrowFor = (deg) => ARROWS[Math.round(deg / 45) % 8];
/** Cercanía en % (20 000 km, la mitad de la vuelta al mundo, es 0 %). */
export const proximity = (km) => Math.max(0, Math.round(100 * (1 - km / 20000)));
