/** Colores y números al azar con semilla: lo usan todos los dibujos. */
export const TAU = Math.PI * 2;

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Mezcla de dos colores (t = 0 → a, t = 1 → b). */
export function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return hex(A.map((v, i) => v + (B[i] - v) * t));
}
/** Más oscuro (k < 0) o más claro (k > 0), de -1 a 1. */
export const tono = (c, k) => (k < 0 ? mix(c, '#2a1d15', -k) : mix(c, '#fffaf2', k));
export const alfa = (c, a) => {
  const [r, g, b] = rgb(c);
  return `rgba(${r},${g},${b},${a})`;
};

/** Números al azar pero siempre los mismos para la misma semilla (para que nada "tiemble"). */
export function azar(semilla) {
  let s = (semilla * 9301 + 49297) % 233280 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
