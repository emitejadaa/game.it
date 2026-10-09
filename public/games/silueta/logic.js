/* Silueta — lógica pura (sin DOM): qué países pueden ser respuesta, distancia, rumbo y texto para compartir. */
import { distanceKm, bearing, proximity } from '/shared/countries/countries.js';

export const TRIES = 6;
/** Debajo de este tamaño (km²) la silueta es irreconocible, así que esos países no son respuesta (pero sí se pueden probar). */
export const MIN_KM2 = 2500;

/** Posibles respuestas: países de la lista de respuestas, grandes y con silueta dibujada. */
export const poolOf = (answers, shapes) => answers.filter((c) => c.km2 >= MIN_KM2 && shapes[c.c]?.d);

/** Distancia redondeada a 10 km (los centros son aproximados, no tiene sentido mostrar más precisión). */
export const roundKm = (km) => Math.round(km / 10) * 10;

/** Lo que se muestra de un intento: km entre centros, rumbo hacia la respuesta, cercanía en % (99 como máximo si no acertó). */
export function guessInfo(guess, answer) {
  if (guess.c === answer.c) return { right: true, km: 0, deg: 0, pct: 100 };
  const km = distanceKm(guess, answer);
  return { right: false, km, deg: bearing(guess, answer), pct: Math.min(99, proximity(km)) };
}

const EMOJI_ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
export const emojiArrow = (deg) => EMOJI_ARROWS[Math.round(deg / 45) % 8];

/** Cinco cuadrados: uno verde por cada 20 % de cercanía. */
export const squares = (pct) => {
  const n = Math.max(0, Math.min(5, Math.floor(pct / 20)));
  return '🟩'.repeat(n) + '⬜'.repeat(5 - n);
};

export const shareRow = (info) => `${squares(info.pct)}${info.right ? '🎉' : emojiArrow(info.deg)}`;

export function shareText({ name, dayNo, infos, won, link }) {
  return `game.it · ${name} #${dayNo} ${won ? infos.length : 'X'}/${TRIES}\n\n${infos.map(shareRow).join('\n')}\n${link}`;
}

/** Cuál de los intentos erróneos quedó más cerca (índice) o -1 si hay menos de dos intentos. */
export function closestIndex(infos) {
  if (infos.length < 2) return -1;
  let best = -1;
  infos.forEach((x, i) => {
    if (!x.right && (best < 0 || x.km < infos[best].km)) best = i;
  });
  return best;
}
