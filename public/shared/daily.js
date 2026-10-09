/**
 * Infraestructura de los juegos diarios de game.it (Quinteto, Vínculos, Colmena, Banderín…).
 *
 * - El desafío cambia a las 00:00 de Argentina para todos (UTC−3 fijo: el país no tiene horario de verano
 *   desde 2009), así que todos juegan el mismo desafío al mismo tiempo y pueden comparar resultados.
 * - `dayNumber(epoch)` numera los desafíos: el día `epoch` ("AAAA-MM-DD", el del lanzamiento) es el n.º 1.
 * - El estado del día y las estadísticas viven en localStorage con el prefijo `gameit:<id>:`, siempre
 *   dentro de try/catch. Las estadísticas van por idioma porque cada idioma tiene su propio desafío.
 * - `markPortal` deja un resumen en `gameit:daily:<id>` que lee el menú del portal (mismo origen) para
 *   mostrar "Nuevo" o "✓ Racha N" en la tarjeta del juego.
 */
const DAY = 86400e3;
const OFFSET = -3 * 3600e3;

// ---------------------------------------------------------------- fechas (hora de Argentina)
/** "AAAA-MM-DD" del día actual en Argentina. */
export const today = (now = Date.now()) => new Date(now + OFFSET).toISOString().slice(0, 10);

/** Cantidad de días desde 1970-01-01 de una fecha "AAAA-MM-DD". */
export const dayIndex = (date) => {
  const [y, m, d] = String(date).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
};

/** N.º de desafío de `date`: el día `epoch` es el 1. */
export const dayNumber = (epoch, date = today()) => dayIndex(date) - dayIndex(epoch) + 1;

/** Milisegundos que faltan para el próximo desafío (la medianoche de Argentina). */
export const msUntilNext = (now = Date.now()) => DAY - ((((now + OFFSET) % DAY) + DAY) % DAY);

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Pinta la cuenta regresiva al próximo desafío en `el`. Devuelve la función que la detiene. */
export function countdown(el, onZero) {
  let iv = 0;
  const tick = () => {
    const ms = msUntilNext();
    el.textContent = fmtClock(ms);
    if (ms < 1000) {
      clearInterval(iv);
      onZero?.();
    }
  };
  tick();
  iv = setInterval(tick, 500);
  return () => clearInterval(iv);
}

/** Avisa cuando cambia el día mientras la pestaña sigue abierta (o al volver a ella). */
export function onNewDay(cb) {
  let d = today();
  const check = () => {
    const n = today();
    if (n !== d) {
      d = n;
      cb(n);
    }
  };
  const iv = setInterval(check, 15000);
  document.addEventListener('visibilitychange', check);
  return () => {
    clearInterval(iv);
    document.removeEventListener('visibilitychange', check);
  };
}

// ---------------------------------------------------------------- números al azar con semilla
/** cyrb128: de un texto a cuatro enteros de 32 bits. */
export function hash128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** Generador sfc32 sembrado con un texto (p. ej. `${id}:${fecha}`): mismo texto, misma secuencia en todos los navegadores. */
export function rng(seed) {
  let [a, b, c, d] = hash128(String(seed));
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
export const rint = (r, n) => Math.floor(r() * n);
export const pick = (r, arr) => arr[rint(r, arr.length)];
export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rint(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- guardado
const read = (k, d) => {
  try {
    const v = JSON.parse(globalThis.localStorage.getItem(k));
    return v ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    globalThis.localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

/** Estado guardado del día (solo vale el del día actual). */
export function loadDay(id, lang, date = today()) {
  const v = read(`gameit:${id}:day:${lang}`, null);
  return v && v.date === date ? v : null;
}
export const saveDay = (id, lang, state, date = today()) => write(`gameit:${id}:day:${lang}`, { ...state, date });

const emptyStats = () => ({ played: 0, won: 0, streak: 0, best: 0, last: null, lastWon: null, dist: {} });
export const loadStats = (id, lang) => ({ ...emptyStats(), ...read(`gameit:${id}:stats:${lang}`, {}) });

/** Racha vigente: cuenta solo si se ganó hoy o ayer. */
export function liveStreak(stats, date = today()) {
  return stats.lastWon && dayIndex(date) - dayIndex(stats.lastWon) <= 1 ? stats.streak : 0;
}

/**
 * Registra el resultado de un día (una sola vez por día). `score` es lo que se reparte en el histograma
 * (intentos usados, errores, rango…). Devuelve las estadísticas ya actualizadas.
 */
export function record(id, lang, { date = today(), won, score }) {
  const s = loadStats(id, lang);
  if (s.last === date) return s;
  s.played++;
  s.last = date;
  if (won) {
    s.won++;
    s.streak = s.lastWon && dayIndex(date) - dayIndex(s.lastWon) === 1 ? s.streak + 1 : 1;
    s.lastWon = date;
    s.best = Math.max(s.best, s.streak);
    if (score !== undefined) s.dist[score] = (s.dist[score] || 0) + 1;
  } else s.streak = 0;
  write(`gameit:${id}:stats:${lang}`, s);
  return s;
}

/** Resumen para la tarjeta del menú del portal. */
export function markPortal(id, { date = today(), done, won, streak = 0 }) {
  write(`gameit:daily:${id}`, { date, done: !!done, won: !!won, streak: streak | 0 });
}
export const readPortal = (id) => read(`gameit:daily:${id}`, null);

// ---------------------------------------------------------------- compartir
/** Copia el texto (o abre el menú de compartir en celulares). Devuelve 'shared' | 'copied' | 'failed'. */
export async function share(text) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export const shareLink = (id) => `${location.origin}/#play/${id}`;

/** Idioma de las preferencias del portal. */
export const lang = () => (globalThis.GameIt?.prefs?.lang === 'en' ? 'en' : 'es');
