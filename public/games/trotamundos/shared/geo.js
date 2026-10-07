/* Trotamundos — utilidades compartidas (las usan el navegador y el servidor online).
 * Distancia, puntaje, azar con semilla, ámbitos de juego (mundo / región / país), pistas y URL del visor.
 * Sin DOM ni dependencias: tiene que andar igual en el navegador y en Node. */

export const R_KM = 6371.0088; // radio medio de la Tierra
export const WORLD_D = 14916.862; // "tamaño" del mapa mundo (km): escala del puntaje
export const MAX_SCORE = 5000;
export const ROUNDS_DAILY = 5;
export const REGIONS = ['AF', 'AS', 'EU', 'NA', 'SA', 'OC']; // continentes (NA incluye Centroamérica y el Caribe)
/** Radio de cada pista como fracción de la escala del mapa. Cada una es ≤ 1/3 de la anterior, así quedan anidadas. */
export const HINT_FRACTIONS = [0.2, 0.065, 0.02];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// ---------------------------------------------------------------- geografía
export function validCoord(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Distancia entre dos puntos en km (haversine). */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Punto a `km` de distancia desde (lat, lng) con rumbo `bearingDeg` (0 = norte, horario). */
export function destinationPoint(lat, lng, bearingDeg, km) {
  const d = km / R_KM;
  const b = rad(bearingDeg);
  const p1 = rad(lat);
  const l1 = rad(lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lng: ((deg(l2) + 540) % 360) - 180 };
}

/** Rumbo inicial de A hacia B, en grados 0..360. */
export function bearingDeg(lat1, lng1, lat2, lng2) {
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dl = rad(lng2 - lng1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// ---------------------------------------------------------------- puntaje
/** Puntos de una ronda: 5000 · e^(−10 · distancia / escala). La escala es la del mapa elegido (mundo, región o país). */
export function scoreFor(km, scaleKm = WORLD_D) {
  if (!(km >= 0) || !(scaleKm > 0)) return 0;
  return Math.max(0, Math.min(MAX_SCORE, Math.round(MAX_SCORE * Math.exp((-10 * km) / scaleKm))));
}

// ---------------------------------------------------------------- ámbitos
const clampScale = (d) => (Number.isFinite(d) && d > 0 ? Math.min(WORLD_D, Math.max(250, d)) : WORLD_D);

/**
 * ¿La ubicación entra en el ámbito? scope: 'mundo' | 'latam' | un continente de REGIONS | un código de país (ISO-2).
 * `meta` es datos/paises.json: { paises: { AR: { cont: 'SA', latam: 1, d: 3900 } }, regiones: { EU: { d: 5200 } } }.
 */
export function inScope(loc, scope, meta) {
  if (!scope || scope === 'mundo') return true;
  const p = meta?.paises?.[loc.cc];
  if (scope === 'latam') return !!p?.latam;
  if (REGIONS.includes(scope)) return p?.cont === scope;
  return loc.cc === scope;
}

/** Escala (km) del puntaje para un ámbito. */
export function scopeScale(scope, meta) {
  if (!scope || scope === 'mundo') return WORLD_D;
  if (scope === 'latam' || REGIONS.includes(scope)) return clampScale(meta?.regiones?.[scope]?.d);
  return clampScale(meta?.paises?.[scope]?.d);
}

// ---------------------------------------------------------------- azar con semilla
/** Hash de texto a entero de 32 bits sin signo (xmur3). */
export function hashSeed(str) {
  str = String(str);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Generador de números en [0, 1) a partir de una semilla (mulberry32). Misma semilla = misma secuencia. */
export function rngFrom(seed) {
  let a = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Elige hasta `n` ubicaciones distintas de `list`. Con `spread` (por defecto) evita repetir país mientras se pueda.
 * `exclude` es un Set de ids que no se pueden elegir (las ya jugadas).
 */
export function pickLocations(list, n, rng = Math.random, { spread = true, exclude } = {}) {
  const pool = list.filter((l) => !exclude?.has(l.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (!spread) return pool.slice(0, n);
  const out = [];
  const seen = new Set();
  const rest = [];
  for (const l of pool) {
    if (out.length < n && !seen.has(l.cc)) {
      out.push(l);
      seen.add(l.cc);
    } else rest.push(l);
  }
  for (const l of rest) if (out.length < n) out.push(l);
  return out;
}

/** Rumbo inicial de la vista: el de la ubicación si lo trae, si no uno al azar. */
export const headingFor = (loc, rng = Math.random) => (Number.isFinite(loc.h) ? loc.h : Math.floor(rng() * 360));

// ---------------------------------------------------------------- desafío diario
/** Fecha del desafío diario (AAAA-MM-DD) en hora de Argentina: cambia a las 0 h de allá, igual para todos. */
export function dailyKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Las 5 ubicaciones del día, iguales para todos: 1 sitio famoso y 4 lugares al azar, de países distintos.
 * Depende del orden de los archivos de datos y de `v` (versión del conjunto): al cambiar los datos, cambia el desafío.
 */
export function dailyRounds(famosos, mundo, key, v = 1) {
  const rng = rngFrom(`trotamundos:${v}:${key}`);
  const f = pickLocations(famosos, 1, rng, { spread: false });
  const used = new Set(f.map((l) => l.cc));
  const m = pickLocations(
    mundo.filter((l) => !used.has(l.cc)),
    ROUNDS_DAILY - f.length,
    rng,
  );
  const all = [...f, ...m];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.map((l) => ({ ...l, h: headingFor(l, rng) }));
}

// ---------------------------------------------------------------- pistas
/**
 * Círculo de una pista (nivel 1, 2 o 3): contiene el lugar pero no está centrado en él, y cada nivel queda
 * adentro del anterior. Con la misma ubicación y semilla da siempre lo mismo.
 */
export function hintCircle(loc, level, scaleKm, seed = '') {
  const k = Math.min(Math.max(Math.round(level) || 1, 1), HINT_FRACTIONS.length) - 1;
  const radiusKm = scaleKm * HINT_FRACTIONS[k];
  const rng = rngFrom(`${seed}:${loc.id ?? `${loc.lat},${loc.lng}`}:${k}`);
  const offset = radiusKm * (0.1 + 0.4 * rng()); // a lo sumo medio radio del lugar
  const c = destinationPoint(loc.lat, loc.lng, rng() * 360, offset);
  return { lat: c.lat, lng: c.lng, radiusKm };
}

/** Polígono (anillo cerrado de [lng, lat]) de un círculo geodésico, para dibujarlo en el mapa. */
export function circleRing(lat, lng, radiusKm, steps = 64) {
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const p = destinationPoint(lat, lng, (i / steps) * 360, radiusKm);
    ring.push([p.lng, p.lat]);
  }
  ring.push(ring[0]);
  return ring;
}

// ---------------------------------------------------------------- visor de Street View
const num = (v) => String(Number(Number(v).toFixed(6)));

/**
 * URL del visor de Street View para un iframe.
 *  - Sin clave: el embed de "Compartir → Insertar" de Google (google.com/maps/embed?pb=…), que no pide cuenta ni clave.
 *    Resuelve la panorámica más cercana a lat/lng. El idioma lo toma del navegador.
 *  - Con clave (config.js): la Maps Embed API oficial (embed/v1/streetview), gratis y sin límite.
 */
export function embedUrl({ lat, lng, heading = 0, pitch = 0, fov = 90, lang = 'es', key = '' }) {
  const h = Math.round(((heading % 360) + 360) % 360);
  const p = Math.round(Math.max(-90, Math.min(90, pitch)));
  if (key) {
    const f = Math.round(Math.max(10, Math.min(100, fov)));
    return `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${num(lat)},${num(lng)}&heading=${h}&pitch=${p}&fov=${f}&language=${lang === 'en' ? 'en' : 'es'}`;
  }
  return `https://www.google.com/maps/embed?pb=!6m6!1m5!2m2!1d${num(lat)}!2d${num(lng)}!3f${h}!4f${p}!5f0.78`;
}
