/**
 * Geometría de las donas vistas desde arriba, en unidades de "r" (el radio de la dona):
 *   anillo: círculo de radio 1 con agujero de 0.38
 *   bola:   círculo de radio 0.95
 *   bastón: cápsula de 1.55 de largo (mitad) por 0.62 de alto (mitad)
 * La usan el dibujo, el decorado (qué parte de la dona tocaste) y los puntajes.
 */

export const GEOM = {
  anillo: { w: 1, h: 1, hueco: 0.38 },
  bola: { w: 0.95, h: 0.95, hueco: 0 },
  baston: { w: 1.55, h: 0.62, hueco: 0 },
};

/** ¿El punto (x, y) cae sobre la dona? margen > 0 achica la forma (para que algo no quede en el borde). */
export function dentro(forma, x, y, margen = 0) {
  const g = GEOM[forma];
  if (forma === 'baston') {
    const cx = Math.max(-(g.w - g.h), Math.min(g.w - g.h, x));
    return Math.hypot(x - cx, y) <= g.h - margen;
  }
  const d = Math.hypot(x, y);
  return d <= g.w - margen && d >= g.hueco + (g.hueco ? margen : 0);
}

/** Distancia (normalizada 0..1) desde el centro hacia el borde: 0 en el centro (o el agujero), 1 en el borde. */
export function profundidad(forma, x, y) {
  const g = GEOM[forma];
  if (forma === 'baston') {
    const cx = Math.max(-(g.w - g.h), Math.min(g.w - g.h, x));
    return Math.hypot(x - cx, y) / g.h;
  }
  const d = Math.hypot(x, y);
  if (g.hueco) return Math.max(0, Math.min(1, Math.abs(d - (g.w + g.hueco) / 2) / ((g.w - g.hueco) / 2)));
  return d / g.w;
}

const CELDA = 0.1;
const grillas = {};

/** Grilla de celdas que cubren la dona: para medir cuánto taparon los toppings y los hilos. */
export function grilla(forma) {
  if (grillas[forma]) return grillas[forma];
  const g = GEOM[forma];
  const nx = Math.ceil((g.w * 2) / CELDA);
  const ny = Math.ceil((g.h * 2) / CELDA);
  const x0 = -g.w;
  const y0 = -g.h;
  const mask = new Uint8Array(nx * ny);
  let n = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * CELDA;
      const y = y0 + (j + 0.5) * CELDA;
      if (dentro(forma, x, y, 0.04)) {
        mask[j * nx + i] = 1;
        n++;
      }
    }
  return (grillas[forma] = { nx, ny, x0, y0, cell: CELDA, mask, n });
}

/** Índice de la celda de (x, y), o -1 si cae afuera de la dona. */
export function celda(forma, x, y) {
  const G = grilla(forma);
  const i = Math.floor((x - G.x0) / G.cell);
  const j = Math.floor((y - G.y0) / G.cell);
  if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) return -1;
  const k = j * G.nx + i;
  return G.mask[k] ? k : -1;
}

/** Marca las celdas que toca un trazo de (ax, ay) a (bx, by) con el ancho dado. */
export function marcarTrazo(forma, cells, ax, ay, bx, by, ancho) {
  const G = grilla(forma);
  const len = Math.hypot(bx - ax, by - ay);
  const pasos = Math.max(1, Math.ceil(len / (G.cell * 0.5)));
  for (let s = 0; s <= pasos; s++) {
    const x = ax + ((bx - ax) * s) / pasos;
    const y = ay + ((by - ay) * s) / pasos;
    for (const [dx, dy] of [[0, 0], [ancho, 0], [-ancho, 0], [0, ancho], [0, -ancho]]) {
      const k = celda(forma, x + dx, y + dy);
      if (k >= 0) cells[k] = 1;
    }
  }
}

/** Fracción de la dona cubierta (0..1). */
export function cobertura(forma, cells) {
  const G = grilla(forma);
  let c = 0;
  for (let k = 0; k < cells.length; k++) if (cells[k] && G.mask[k]) c++;
  return c / G.n;
}

/** Qué tan parejas quedaron las piezas (1 = perfectamente repartidas). */
export function reparto(forma, piezas) {
  const n = piezas.length;
  if (n <= 1) return 1;
  let gaps;
  if (forma === 'baston') {
    const xs = piezas.map((p) => p.x).sort((a, b) => a - b);
    if (n === 2) return Math.min(1, (xs[1] - xs[0]) / (GEOM.baston.w * 0.8));
    gaps = xs.slice(1).map((x, i) => x - xs[i]);
  } else {
    const as = piezas.map((p) => Math.atan2(p.y, p.x)).sort((a, b) => a - b);
    gaps = as.map((a, i) => (i ? a - as[i - 1] : a + Math.PI * 2 - as[n - 1]));
  }
  const m = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (m <= 0) return 0;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - m) ** 2, 0) / gaps.length);
  return Math.max(0, Math.min(1, 1 - sd / m));
}
