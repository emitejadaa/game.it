/**
 * Caída Libre — bots. Miran la pieza de la mano (y la que saldría si la guardan), prueban cada columna y rotación,
 * dejan caer la pieza y puntúan el tablero que queda: altura total, huecos tapados, irregularidad y líneas. Gana la
 * mejor (con algo de ruido en los niveles bajos). Búsqueda de una sola pieza: barata para el servidor gratis.
 * Nunca eligen a propósito una posición que los haga perder si hay otra segura, y siempre juegan algo.
 * Todo usa el azar que les pasan (el del partido): mismo partido + mismas entradas = mismas jugadas.
 */
import { W, H, SHAPES, ROTS, fits, dropY, spawnOf, place, clearLines, isLockOut } from './rules.js';

export const BOT_NAMES = ['Volt', 'Nova', 'Pixel', 'Zeta', 'Kilo', 'Orbe', 'Arco', 'Rayo', 'Eco', 'Lince', 'Fénix', 'Cometa', 'Iris', 'Onda', 'Neón', 'Átomo', 'Quark', 'Bruma', 'Sigma', 'Delta', 'Hielo', 'Brasa', 'Lumen', 'Trazo', 'Vector', 'Gamma', 'Tango', 'Boreal', 'Salto', 'Chispa'];

// pps: piezas por segundo · noise: ruido sobre el puntaje · slip: chance de elegir una de las mejores sin ser la primera · hold: usa guardar
const LEVELS = [
  { pps: 0.8, noise: 1.0, slip: 0.05, hold: false },
  { pps: 1.4, noise: 0.5, slip: 0.03, hold: true },
  { pps: 2.2, noise: 0, slip: 0, hold: true },
];

export function brain(level) {
  const lv = Math.max(1, Math.min(3, level | 0));
  return { level: lv, ...LEVELS[lv - 1] };
}

/** Milisegundos hasta la próxima jugada de un bot (con algo de variación para que no jueguen todos a la vez). */
export const nextDelay = (b, rnd) => (1000 / b.pps) * (0.8 + 0.4 * rnd());

const LINE_W = [0, 0.9, 2.2, 3.8, 7.5];
const scratch = new Uint8Array(W * H);

/** Puntaje del tablero que queda después de fijar la pieza (mayor = mejor). */
function score(grid, kind, r, x, y, urgent) {
  scratch.set(grid);
  const lockOut = isLockOut(kind, r, y);
  place(scratch, kind, r, x, y);
  const lines = clearLines(scratch);
  let agg = 0;
  let holes = 0;
  let bump = 0;
  let maxH = 0;
  let prev = -1;
  for (let cx = 0; cx < W; cx++) {
    let top = 0;
    while (top < H && scratch[top * W + cx] === 0) top++;
    const h = H - top;
    agg += h;
    if (h > maxH) maxH = h;
    for (let yy = top + 1; yy < H; yy++) if (scratch[yy * W + cx] === 0) holes++;
    if (prev >= 0) bump += Math.abs(h - prev);
    prev = h;
  }
  let s = -0.5 * agg - 0.95 * holes - 0.2 * bump + LINE_W[lines] * (urgent ? 1.6 : 1);
  if (maxH > 14) s -= (maxH - 14) * 1.6;
  if (maxH >= H - 1) s -= 500; // taparía la salida de las piezas
  if (lockOut) s -= 1000;
  return s;
}

/**
 * La mejor jugada para `grid` con la pieza de la mano de `feed`: { kind, r, x, y, hold } o null si no entra ninguna.
 * `urgent`: hay basura por entrar o la pila está alta, se prioriza limpiar líneas.
 */
export function choose(grid, feed, b, rnd, urgent = false) {
  const cands = [];
  const kinds = [feed.active];
  if (b.hold) {
    const hk = feed.peekHold();
    if (hk && hk !== feed.active) kinds.push(hk);
  }
  for (let ki = 0; ki < kinds.length; ki++) {
    const kind = kinds[ki];
    const sp = spawnOf(kind);
    for (let r = 0; r < ROTS[kind]; r++) {
      const s = SHAPES[kind][r];
      let minX = 9;
      let maxX = 0;
      let minY = 9;
      for (let i = 0; i < 8; i += 2) {
        if (s[i] < minX) minX = s[i];
        if (s[i] > maxX) maxX = s[i];
        if (s[i + 1] < minY) minY = s[i + 1];
      }
      const y0 = -minY;
      for (let x = -minX; x <= W - 1 - maxX; x++) {
        // tiene que poder llegar a la columna deslizándose por arriba desde donde nace
        if (!fits(grid, kind, r, sp.x, y0)) continue;
        let free = true;
        for (let cx = sp.x; cx !== x && free; cx += x > sp.x ? 1 : -1) free = fits(grid, kind, r, cx + (x > sp.x ? 1 : -1), y0);
        if (!free) continue;
        const y = dropY(grid, kind, r, x, y0);
        cands.push({ kind, r, x, y, hold: ki === 1, score: score(grid, kind, r, x, y, urgent) });
      }
    }
  }
  if (!cands.length) return null;
  if (b.noise) for (const c of cands) c.score += (rnd() - 0.5) * 2 * b.noise;
  cands.sort((a, c) => c.score - a.score);
  let pick = cands[0];
  if (b.slip && rnd() < b.slip) {
    // un descuido: una de las mejores 6, nunca una que lo haga perder si hay otra
    const alt = cands.slice(0, 6).filter((c) => c.score > -400);
    if (alt.length) pick = alt[Math.floor(rnd() * alt.length)];
  }
  return pick;
}
