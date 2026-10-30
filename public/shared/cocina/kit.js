/**
 * Cocina — piezas de mecánica sin DOM, compartidas por las estaciones: la grilla de "pintado" (salsa, queso, crema,
 * glaseado) con su cobertura y lo que se chorreó afuera, lo parejo que quedaron los ingredientes, el orden de una pila
 * y la cocción con punto justo. Todo en coordenadas normalizadas (el producto ocupa el cuadrado [-1, 1]²).
 */
import { clamp } from './core.js';

/** Grilla de pintado: cada celda queda pintada (1) o no (0). */
export class Paint {
  constructor(n = 40) {
    this.n = n;
    this.c = new Uint8Array(n * n);
    this.strokes = 0;
  }
  /** Centro de la celda (i, j) en [-1, 1]. */
  at(i, j) {
    return [((i + 0.5) / this.n) * 2 - 1, ((j + 0.5) / this.n) * 2 - 1];
  }
  /** Pinta un círculo de radio r (en unidades normalizadas). Devuelve cuántas celdas nuevas pintó. */
  paint(x, y, r) {
    const n = this.n;
    const i0 = clamp(Math.floor(((x - r + 1) / 2) * n), 0, n - 1), i1 = clamp(Math.floor(((x + r + 1) / 2) * n), 0, n - 1);
    const j0 = clamp(Math.floor(((y - r + 1) / 2) * n), 0, n - 1), j1 = clamp(Math.floor(((y + r + 1) / 2) * n), 0, n - 1);
    let added = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const [cx, cy] = this.at(i, j);
        if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r && !this.c[j * n + i]) {
          this.c[j * n + i] = 1;
          added++;
        }
      }
    }
    return added;
  }
  /** Pinta un trazo de (x0, y0) a (x1, y1) con pasos cortos. */
  line(x0, y0, x1, y1, r) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(d / (r * 0.4)));
    let added = 0;
    for (let k = 1; k <= steps; k++) added += this.paint(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, r);
    return added;
  }
  /** Fracción pintada de las celdas donde `inside(x, y)` es verdadero. */
  coverage(inside) {
    let tot = 0, on = 0;
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const [x, y] = this.at(i, j);
        if (!inside(x, y)) continue;
        tot++;
        on += this.c[j * this.n + i];
      }
    }
    return tot ? on / tot : 0;
  }
  /**
   * Celdas pintadas donde no van (lo que se chorreó), como fracción de la zona. `outside` dice qué cuenta como
   * chorreado (por defecto, todo lo que no es la zona).
   */
  spill(inside, outside = (x, y) => !inside(x, y)) {
    let tot = 0, out = 0;
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const [x, y] = this.at(i, j);
        if (inside(x, y)) tot++;
        else if (outside(x, y)) out += this.c[j * this.n + i];
      }
    }
    return tot ? out / tot : 0;
  }
  get any() {
    return this.c.some((v) => v);
  }
}

/** Puntaje de una capa pintada (salsa, queso, glaseado): cobertura de la zona y castigo por chorrear. */
export function paintScore(p, inside, { full = 0.9, zero = 0.35, spillTol = 0.04, spillZero = 0.4, outside } = {}) {
  const cov = p.coverage(inside);
  const sp = p.spill(inside, outside);
  const a = clamp((cov - zero) / (full - zero), 0, 1);
  const b = clamp(1 - (sp - spillTol) / (spillZero - spillTol), 0, 1);
  return { cov, spill: sp, score: Math.round(100 * a * (sp <= spillTol ? 1 : b)) };
}

/**
 * Qué tan parejos quedaron n puntos en una zona de área `area`: compara la distancia al vecino más cercano con la
 * que tendrían repartidos en panal. 1 = bien repartidos, cerca de 0 = todos amontonados.
 */
export function evenness(pts, area) {
  const n = pts.length;
  if (n < 2) return 1;
  const ideal = Math.sqrt((2 * area) / (Math.sqrt(3) * n));
  let s = 0;
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < best) best = d;
    }
    s += clamp(best / (ideal * 0.55), 0, 1);
  }
  return s / n;
}

/** Largo de la subsecuencia común más larga (para comparar el orden de una pila con la comanda). */
export function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

/** 0..1: cuánto se parece una secuencia a la pedida (orden y cantidad). */
export function sequenceMatch(want, got) {
  if (!want.length) return got.length ? 0 : 1;
  const common = lcs(want, got);
  return clamp((2 * common) / (want.length + got.length), 0, 1);
}

/**
 * Cocción en "puntos" (0 = crudo). Cada producto avanza `rate` puntos por segundo; pasado `burn` se quema.
 * El puntaje mira la distancia al punto pedido.
 */
export function cookScore(level, target, { tol = 0.12, zero = 2.2, burn = Infinity } = {}) {
  const d = Math.abs(level - target);
  let s = d <= tol ? 100 : clamp(100 * (1 - (d - tol) / (zero - tol)), 0, 100);
  if (level > burn) s = Math.min(s, 25);
  return Math.round(s);
}

/** Medidor de "mantener apretado para llenar": nivel 0..max, con puntaje por cercanía al pedido. */
export function fillScore(level, target, { tol = 0.04, zero = 0.45 } = {}) {
  const d = Math.abs(level - target);
  return Math.round(d <= tol ? 100 : clamp(100 * (1 - (d - tol) / (zero - tol)), 0, 100));
}
