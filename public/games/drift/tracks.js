/**
 * Pistas de Drift Neon: puntos de control de una curva cerrada (Catmull-Rom) + ancho.
 * build() las convierte en una línea central muestreada con distancias, tangentes y normales.
 */
export const TRACKS = [
  {
    name: { es: 'Neón City', en: 'Neon City' },
    colors: ['#ff2bd6', '#00f0ff'],
    width: 180,
    pts: [[300, 300], [1100, 220], [1900, 300], [2300, 650], [2200, 1150], [1750, 1350], [1480, 1060], [1170, 1060], [950, 1330], [500, 1400], [180, 1000], [150, 600]],
  },
  {
    name: { es: 'Serpentina', en: 'Serpentine' },
    colors: ['#b6ff00', '#9d6bff'],
    width: 170,
    pts: [[400, 400], [1200, 300], [1700, 650], [2150, 300], [2750, 450], [2850, 1100], [2300, 1550], [1700, 1250], [1200, 1650], [600, 1550], [300, 1000]],
  },
  {
    name: { es: 'Ocaso', en: 'Sunset Loop' },
    colors: ['#ffb800', '#ff3b5c'],
    width: 170,
    pts: [[500, 300], [1500, 250], [2500, 400], [2950, 900], [2550, 1350], [1950, 1150], [1550, 1300], [1380, 1560], [1600, 1780], [2060, 1900], [2030, 2200], [1550, 2380], [800, 2250], [300, 1750], [650, 1150], [250, 700]],
  },
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

/** Línea central cada ~14 unidades: x, y, distancia acumulada, tangente y normal. */
export function build(track) {
  const P = track.pts;
  const n = P.length;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(8, Math.round(len / 14));
    for (let s = 0; s < steps; s++) raw.push(catmull(p0, p1, p2, p3, s / steps));
  }
  const N = raw.length;
  const xs = new Float32Array(N);
  const ys = new Float32Array(N);
  const dist = new Float32Array(N + 1);
  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    xs[i] = raw[i][0];
    ys[i] = raw[i][1];
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const dx = xs[j] - xs[i];
    const dy = ys[j] - ys[i];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
    dist[i + 1] = dist[i] + l;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, xs[i]);
    y0 = Math.min(y0, ys[i]);
    x1 = Math.max(x1, xs[i]);
    y1 = Math.max(y1, ys[i]);
  }
  const m = track.width;
  return { ...track, N, xs, ys, dist, tx, ty, length: dist[N], bounds: { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m } };
}

/** Punto más cercano de la línea central, buscando cerca del último índice conocido. */
export function locate(T, x, y, hint = -1, window = 30) {
  let best = -1;
  let bd = Infinity;
  const scan = (i) => {
    const d = (T.xs[i] - x) ** 2 + (T.ys[i] - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  };
  if (hint < 0) for (let i = 0; i < T.N; i++) scan(i);
  else for (let k = -window; k <= window; k++) scan((hint + k + T.N) % T.N);
  // proyección sobre el segmento para una distancia lateral precisa
  const i = best;
  const px = x - T.xs[i];
  const py = y - T.ys[i];
  const along = px * T.tx[i] + py * T.ty[i];
  const lat = -px * T.ty[i] + py * T.tx[i]; // positivo = a la derecha
  return { i, lat, s: T.dist[i] + along };
}
