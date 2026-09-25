/**
 * Drift Neon — pistas. Las clásicas son puntos de control de una curva cerrada (Catmull-Rom);
 * las nuevas se trazan con rectas y curvas de radio exacto (shared/turtle.js). build() las
 * convierte en una línea central muestreada con distancias, tangentes, normales y curvatura.
 *
 * Todas se validaron: ningún tramo se superpone con otro (ni siquiera en las horquillas).
 */
import { trace } from './shared/turtle.js';

export const THEMES = {
  city: { bg: '#0a0614', ground: '#120a24', grid: 'rgba(157,107,255,.09)', asphalt: '#150d28', line: 'rgba(255,255,255,.07)' },
  bridge: { bg: '#050a18', ground: '#07122a', grid: 'rgba(0,240,255,.06)', asphalt: '#121528', line: 'rgba(255,255,255,.08)' },
  desert: { bg: '#1a0a12', ground: '#2a1218', grid: 'rgba(255,140,60,.05)', asphalt: '#1d1220', line: 'rgba(255,220,180,.09)' },
  port: { bg: '#07090f', ground: '#0e1219', grid: 'rgba(255,184,0,.05)', asphalt: '#14161f', line: 'rgba(255,220,120,.1)' },
  tokyo: { bg: '#0b0514', ground: '#130a1f', grid: 'rgba(255,43,214,.06)', asphalt: '#160f22', line: 'rgba(255,255,255,.08)' },
  coast: { bg: '#03121c', ground: '#1d1a24', grid: 'rgba(0,240,255,.04)', asphalt: '#141824', line: 'rgba(255,255,255,.09)' },
  mountain: { bg: '#060d0a', ground: '#0b1712', grid: 'rgba(182,255,0,.04)', asphalt: '#141a1c', line: 'rgba(255,255,255,.08)' },
  snow: { bg: '#0c1422', ground: '#1b2638', grid: 'rgba(200,230,255,.05)', asphalt: '#1c2230', line: 'rgba(255,255,255,.14)' },
  cyber: { bg: '#050807', ground: '#08110c', grid: 'rgba(182,255,0,.08)', asphalt: '#10161a', line: 'rgba(182,255,0,.12)' },
};

export const TRACKS = [
  {
    id: 'city',
    name: { es: 'Neón City', en: 'Neon City' },
    about: { es: 'Calles anchas y curvas rápidas entre rascacielos', en: 'Wide streets and fast bends between towers' },
    theme: 'city',
    colors: ['#ff2bd6', '#00f0ff'],
    level: 1,
    width: 200,
    pts: [[525, 525], [1925, 385], [3325, 525], [4025, 1138], [3850, 2013], [3063, 2363], [2590, 1855], [2048, 1855], [1663, 2328], [875, 2450], [315, 1750], [263, 1050]],
  },
  {
    id: 'viaduct',
    name: { es: 'Viaducto', en: 'Viaduct' },
    about: { es: 'Autopista elevada sobre la bahía, con eses encadenadas', en: 'Elevated highway over the bay with linked esses' },
    theme: 'bridge',
    colors: ['#00f0ff', '#9d6bff'],
    level: 1,
    width: 190,
    pts: [[680, 680], [2040, 510], [2890, 1105], [3655, 510], [4675, 765], [4845, 1870], [3910, 2635], [2890, 2125], [2040, 2805], [1020, 2635], [510, 1700]],
  },
  {
    id: 'sunset',
    name: { es: 'Ocaso', en: 'Sunset' },
    about: { es: 'Desierto al atardecer: curvas largas y un rulo final', en: 'Desert at dusk: long curves and a final loop' },
    theme: 'desert',
    colors: ['#ffb800', '#ff3b5c'],
    level: 2,
    width: 190,
    pts: [[725, 435], [2175, 363], [3625, 580], [4278, 1305], [3698, 1958], [2828, 1668], [2248, 1885], [2001, 2262], [2320, 2581], [2987, 2755], [2944, 3190], [2248, 3451], [1160, 3263], [435, 2538], [943, 1668], [363, 1015]],
  },
  {
    id: 'port',
    name: { es: 'Puerto Ámbar', en: 'Amber Port' },
    about: { es: 'Entre contenedores: esquinas en ángulo recto y una horquilla', en: 'Among containers: square corners and a hairpin' },
    theme: 'port',
    colors: ['#ffb800', '#ff7a2f'],
    level: 2,
    width: 190,
    scale: [1.45, 1.2],
    prog: [['S', 1500], ['L', 20, 300], ['R', 40, 300], ['L', 20, 300], ['S', 700], ['R', 90, 220], ['S', 400], ['R', 90, 170], ['S', 300], ['L', 90, 170], ['S', 400], ['R', 90, 200], ['S', 900], ['R', 180, 140], ['S', 500], ['L', 180, 140], ['S', 700], ['R', 90, 220], ['S', 600], ['L', 45, 300], ['R', 45, 300], ['S', 400], ['R', 90, 240]],
  },
  {
    id: 'tokyo',
    name: { es: 'Tokio Nocturno', en: 'Tokyo Nights' },
    about: { es: 'Técnica y angosta: eses, chicanas y dos horquillas', en: 'Tight and technical: esses, chicanes and two hairpins' },
    theme: 'tokyo',
    colors: ['#ff2bd6', '#9d6bff'],
    level: 3,
    width: 175,
    scale: [1.75, 1.15],
    prog: [['S', 900], ['R', 90, 150], ['S', 300], ['L', 35, 200], ['R', 70, 200], ['L', 35, 200], ['S', 350], ['R', 90, 150], ['S', 500], ['R', 180, 120], ['S', 450], ['L', 180, 120], ['S', 400], ['R', 90, 160], ['S', 300], ['R', 90, 150], ['S', 250], ['L', 90, 150], ['S', 300], ['L', 30, 200], ['R', 60, 200], ['L', 30, 200], ['S', 200], ['R', 90, 160]],
  },
  {
    id: 'coast',
    name: { es: 'Costa Synth', en: 'Synth Coast' },
    about: { es: 'La más rápida: rectas largas junto al mar y curvas abiertas', en: 'The fastest: long straights by the sea and open bends' },
    theme: 'coast',
    colors: ['#00f0ff', '#ffb800'],
    level: 1,
    width: 215,
    scale: [1.15, 1.05],
    prog: [['S', 2600], ['R', 60, 800], ['S', 600], ['R', 30, 600], ['S', 900], ['L', 25, 900], ['R', 25, 900], ['S', 400], ['R', 90, 180], ['S', 1600], ['L', 40, 500], ['R', 40, 500], ['S', 1200], ['R', 70, 400], ['S', 500], ['R', 20, 600], ['S', 700], ['R', 30, 700], ['L', 30, 700], ['S', 300], ['R', 90, 350]],
  },
  {
    id: 'mountain',
    name: { es: 'Paso de Montaña', en: 'Mountain Pass' },
    about: { es: 'Angosta, con zigzag de horquillas: ideal para derrapar', en: 'Narrow with a zigzag of hairpins: made for drifting' },
    theme: 'mountain',
    colors: ['#b6ff00', '#3dffa8'],
    level: 3,
    width: 165,
    scale: [1.35, 1.1],
    prog: [['S', 900], ['R', 30, 500], ['S', 500], ['L', 30, 500], ['S', 400], ['R', 90, 250], ['S', 600], ['L', 30, 400], ['R', 60, 350], ['L', 30, 400], ['S', 500], ['R', 90, 200], ['S', 900], ['R', 45, 300], ['L', 45, 300], ['S', 600], ['R', 90, 200], ['S', 200], ['R', 90, 120], ['S', 550], ['L', 180, 115], ['S', 550], ['R', 180, 115], ['S', 550], ['L', 90, 120], ['S', 300], ['R', 90, 250]],
  },
  {
    id: 'snow',
    name: { es: 'Nieve Boreal', en: 'Boreal Snow' },
    about: { es: 'Poco agarre bajo la aurora: todo es un derrape', en: 'Low grip under the aurora: everything is a drift' },
    theme: 'snow',
    colors: ['#7dfff2', '#9d6bff'],
    level: 2,
    width: 205,
    grip: 0.78,
    scale: [1.3, 1.15],
    prog: [['S', 1200], ['R', 45, 500], ['L', 45, 500], ['S', 600], ['R', 90, 300], ['S', 500], ['R', 30, 400], ['L', 60, 350], ['R', 30, 400], ['S', 400], ['R', 90, 260], ['S', 800], ['L', 70, 330], ['R', 140, 240], ['L', 70, 330], ['S', 700], ['R', 90, 280], ['S', 800], ['R', 40, 600], ['L', 40, 600], ['S', 300], ['R', 90, 400]],
  },
  {
    id: 'cyber',
    name: { es: 'Anillo Cyber', en: 'Cyber Ring' },
    about: { es: 'Óvalo veloz con una sección interna revirada', en: 'Fast oval with a twisty infield' },
    theme: 'cyber',
    colors: ['#b6ff00', '#00f0ff'],
    level: 2,
    width: 210,
    scale: [1.5, 1.2],
    prog: [['S', 2800], ['R', 180, 700], ['S', 700], ['L', 25, 300], ['R', 50, 300], ['L', 25, 300], ['S', 900], ['R', 90, 280], ['S', 100], ['R', 90, 170], ['S', 600], ['L', 180, 150], ['S', 600], ['R', 90, 170], ['S', 100], ['R', 90, 260]],
  },
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

function rawLine(track) {
  if (track.prog) {
    const [sl, sr] = track.scale || [1, 1];
    const prog = track.prog.map((op) => (op[0] === 'S' ? ['S', op[1] * sl] : [op[0], op[1], op[2] * sr]));
    const pts = trace(prog, 14);
    // corrida al primer cuadrante con margen
    let x0 = Infinity;
    let y0 = Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
    }
    return pts.map(([x, y]) => [x - x0 + 700, y - y0 + 700]);
  }
  const P = track.pts;
  const n = P.length;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    const steps = Math.max(8, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 14));
    for (let s = 0; s < steps; s++) raw.push(catmull(p0, p1, p2, p3, s / steps));
  }
  return raw;
}

const cache = new Map();

/** Línea central cada ~14 unidades: x, y, distancia acumulada, tangente, normal y curvatura. */
export function build(track) {
  if (cache.has(track.id)) return cache.get(track.id);
  const raw = rawLine(track);
  const N = raw.length;
  const xs = new Float32Array(N);
  const ys = new Float32Array(N);
  const dist = new Float32Array(N + 1);
  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  const curv = new Float32Array(N);
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
  // curvatura con signo (positiva = dobla a la derecha), suavizada
  for (let i = 0; i < N; i++) {
    const a = (i - 3 + N) % N;
    const b = (i + 3) % N;
    let da = Math.atan2(ty[b], tx[b]) - Math.atan2(ty[a], tx[a]);
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const len = dist[i + 3 > N ? N : i + 3] - dist[i - 3 < 0 ? 0 : i - 3] || 84;
    curv[i] = da / Math.max(40, Math.abs(len));
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, xs[i]);
    y0 = Math.min(y0, ys[i]);
    x1 = Math.max(x1, xs[i]);
    y1 = Math.max(y1, ys[i]);
  }
  const m = track.width;
  const T = { ...track, grip: track.grip ?? 1, N, xs, ys, dist, tx, ty, curv, length: dist[N], bounds: { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m } };
  cache.set(track.id, T);
  return T;
}

/** Punto más cercano de la línea central, buscando cerca del último índice conocido. */
export function locate(T, x, y, hint = -1, window = 30) {
  let best = -1;
  let bd = Infinity;
  if (hint < 0) {
    for (let i = 0; i < T.N; i++) {
      const d = (T.xs[i] - x) ** 2 + (T.ys[i] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  } else {
    for (let k = -window; k <= window; k++) {
      const i = (hint + k + T.N) % T.N;
      const d = (T.xs[i] - x) ** 2 + (T.ys[i] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  const i = best;
  const px = x - T.xs[i];
  const py = y - T.ys[i];
  const along = px * T.tx[i] + py * T.ty[i];
  const lat = -px * T.ty[i] + py * T.tx[i]; // positivo = a la derecha
  return { i, lat, s: T.dist[i] + along };
}

/** Tiempo mínimo razonable de una vuelta (ms), para validar resultados online. */
export const minLapMs = (T) => (T.length / 1250) * 1000;
