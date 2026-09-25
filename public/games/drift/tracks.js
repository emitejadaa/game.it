/**
 * Drift Neon — pistas. Las clásicas son puntos de control de una curva cerrada (Catmull-Rom);
 * las nuevas se trazan con rectas y curvas de radio exacto (shared/turtle.js). build() las
 * convierte en una línea central muestreada con distancias, tangentes, normales y curvatura.
 *
 * `size` agranda la pista entera (rectas y radios). Todas se validaron: ningún tramo se
 * superpone con otro (ni siquiera en las horquillas).
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
  airport: { bg: '#060a12', ground: '#0c141a', grid: 'rgba(61,139,255,.05)', asphalt: '#181d27', line: 'rgba(255,255,255,.16)', runoff: 'rgba(120,170,120,.1)' },
  canyon: { bg: '#1a0806', ground: '#34150e', grid: 'rgba(255,120,60,.04)', asphalt: '#221519', line: 'rgba(255,220,180,.1)', runoff: 'rgba(255,190,130,.12)' },
  forest: { bg: '#03100a', ground: '#0a1d13', grid: 'rgba(61,255,168,.035)', asphalt: '#141b1d', line: 'rgba(255,255,255,.08)', runoff: 'rgba(200,190,150,.09)' },
  volcano: { bg: '#0a0404', ground: '#140a0a', grid: 'rgba(255,59,31,.045)', asphalt: '#1b1315', line: 'rgba(255,184,0,.12)', runoff: 'rgba(90,70,70,.3)' },
  moon: { bg: '#07070c', ground: '#1b1c23', grid: 'rgba(232,244,255,.035)', asphalt: '#111118', line: 'rgba(255,255,255,.1)', runoff: 'rgba(255,255,255,.05)' },
  rain: { bg: '#040a10', ground: '#0a111b', grid: 'rgba(0,240,255,.05)', asphalt: '#0e1520', line: 'rgba(255,255,255,.1)' },
};

export const TRACKS = [
  {
    id: 'city',
    name: { es: 'Neón City', en: 'Neon City' },
    about: { es: 'Calles anchas y curvas rápidas entre rascacielos', en: 'Wide streets and fast bends between towers' },
    theme: 'city',
    colors: ['#ff2bd6', '#00f0ff'],
    level: 1,
    width: 215,
    size: 1.5,
    pts: [[525, 525], [1925, 385], [3325, 525], [4025, 1138], [3850, 2013], [3063, 2363], [2590, 1855], [2048, 1855], [1663, 2328], [875, 2450], [315, 1750], [263, 1050]],
  },
  {
    id: 'viaduct',
    name: { es: 'Viaducto', en: 'Viaduct' },
    about: { es: 'Autopista elevada sobre la bahía, con eses encadenadas', en: 'Elevated highway over the bay with linked esses' },
    theme: 'bridge',
    colors: ['#00f0ff', '#9d6bff'],
    level: 1,
    width: 205,
    size: 1.4,
    pts: [[680, 680], [2040, 510], [2890, 1105], [3655, 510], [4675, 765], [4845, 1870], [3910, 2635], [2890, 2125], [2040, 2805], [1020, 2635], [510, 1700]],
  },
  {
    id: 'sunset',
    name: { es: 'Ocaso', en: 'Sunset' },
    about: { es: 'Desierto al atardecer: curvas largas y un rulo final', en: 'Desert at dusk: long curves and a final loop' },
    theme: 'desert',
    colors: ['#ffb800', '#ff3b5c'],
    level: 2,
    width: 205,
    size: 1.4,
    pts: [[725, 435], [2175, 363], [3625, 580], [4278, 1305], [3698, 1958], [2828, 1668], [2248, 1885], [2001, 2262], [2320, 2581], [2987, 2755], [2944, 3190], [2248, 3451], [1160, 3263], [435, 2538], [943, 1668], [363, 1015]],
  },
  {
    id: 'port',
    name: { es: 'Puerto Ámbar', en: 'Amber Port' },
    about: { es: 'Entre contenedores: esquinas en ángulo recto y una horquilla', en: 'Among containers: square corners and a hairpin' },
    theme: 'port',
    colors: ['#ffb800', '#ff7a2f'],
    level: 2,
    width: 200,
    size: 1.4,
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
    width: 185,
    size: 1.55,
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
    width: 230,
    size: 1.3,
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
    width: 178,
    size: 1.45,
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
    width: 220,
    size: 1.4,
    grip: 0.78,
    surface: { es: '❄ poco agarre', en: '❄ low grip' },
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
    width: 225,
    size: 1.35,
    scale: [1.5, 1.2],
    prog: [['S', 2800], ['R', 180, 700], ['S', 700], ['L', 25, 300], ['R', 50, 300], ['L', 25, 300], ['S', 900], ['R', 90, 280], ['S', 100], ['R', 90, 170], ['S', 600], ['L', 180, 150], ['S', 600], ['R', 90, 170], ['S', 100], ['R', 90, 260]],
  },
  {
    id: 'airport',
    isNew: true,
    name: { es: 'Aeródromo', en: 'Airfield' },
    about: { es: 'Una pista de aterrizaje entera de recta y horquillas en los extremos', en: 'A whole runway as a straight, with hairpins at both ends' },
    theme: 'airport',
    colors: ['#3d8bff', '#b6ff00'],
    level: 1,
    width: 235,
    size: 1.4,
    prog: [['S', 4200], ['R', 180, 300], ['S', 900], ['L', 90, 320], ['S', 500], ['R', 90, 320], ['S', 900], ['L', 35, 450], ['R', 70, 450], ['L', 35, 450], ['S', 700], ['R', 90, 380], ['S', 700], ['R', 90, 520]],
  },
  {
    id: 'canyon',
    isNew: true,
    name: { es: 'Cañón Carmesí', en: 'Crimson Canyon' },
    about: { es: 'Una serpiente entre paredones de roca: curva tras curva', en: 'A snake between rock walls: bend after bend' },
    theme: 'canyon',
    colors: ['#ff6a3d', '#ffd23f'],
    level: 2,
    width: 205,
    size: 1,
    pts: [[600, 600], [2000, 450], [3000, 900], [3700, 650], [4600, 550], [5500, 1000], [5600, 1900], [4700, 2250], [3800, 1850], [2950, 2350], [3250, 3150], [4400, 3050], [5400, 3350], [5300, 4050], [4000, 4250], [2600, 3950], [1750, 3250], [1950, 2450], [1550, 1850], [950, 2050], [500, 2050], [350, 1350]],
  },
  {
    id: 'forest',
    isNew: true,
    name: { es: 'Bosque Esmeralda', en: 'Emerald Forest' },
    about: { es: 'Curvas enlazadas entre árboles y dos puentes sobre el río', en: 'Linked bends through the trees and two bridges over the river' },
    theme: 'forest',
    colors: ['#3dffa8', '#d4ff3d'],
    level: 2,
    width: 200,
    size: 1,
    pts: [[1400, 700], [2600, 500], [3700, 1000], [4800, 1500], [6200, 1600], [7400, 1450], [8000, 1850], [7600, 2350], [6200, 2400], [4800, 2350], [3700, 2800], [2600, 3300], [1300, 3100], [700, 2200], [800, 1200]],
  },
  {
    id: 'volcano',
    isNew: true,
    name: { es: 'Volcán Ígneo', en: 'Igneous Volcano' },
    about: { es: 'Horquillas alrededor del cráter, con ríos de lava', en: 'Hairpins around the crater, among rivers of lava' },
    theme: 'volcano',
    colors: ['#ff3b1f', '#ffb800'],
    level: 3,
    width: 182,
    size: 1,
    prog: [['S', 800], ['R', 180, 900], ['S', 300], ['L', 90, 220], ['S', 400], ['L', 90, 220], ['S', 900], ['R', 180, 180], ['S', 900], ['L', 180, 180], ['S', 1600], ['L', 90, 300], ['S', 3460], ['L', 90, 300], ['S', 2400], ['L', 90, 300], ['L', 90, 400], ['S', 200]],
  },
  {
    id: 'moon',
    isNew: true,
    name: { es: 'Base Lunar', en: 'Moon Base' },
    about: { es: 'Poca gravedad y poco agarre: curvas largas entre cráteres', en: 'Low gravity, low grip: long bends between craters' },
    theme: 'moon',
    colors: ['#e8f4ff', '#9d6bff'],
    level: 2,
    width: 215,
    grip: 0.86,
    surface: { es: '☾ baja gravedad', en: '☾ low gravity' },
    size: 1,
    pts: [[2571, 677], [3829, 677], [4524, 1506], [4482, 2460], [5329, 2901], [5699, 3917], [5070, 5006], [4005, 5193], [3200, 4680], [2395, 5193], [1330, 5006], [701, 3917], [1071, 2901], [1918, 2460], [1876, 1506]],
  },
  {
    id: 'rain',
    isNew: true,
    name: { es: 'Bahía Lluviosa', en: 'Rainy Bay' },
    about: { es: 'Circuito callejero mojado: esquinas a 90° y el piso resbala', en: 'Wet street circuit: square corners on a slippery road' },
    theme: 'rain',
    colors: ['#00f0ff', '#ff2bd6'],
    level: 3,
    width: 188,
    grip: 0.9,
    surface: { es: '☂ piso mojado', en: '☂ wet road' },
    size: 1.3,
    prog: [['S', 1900], ['R', 90, 190], ['S', 600], ['L', 90, 190], ['S', 500], ['R', 90, 190], ['S', 900], ['R', 90, 200], ['S', 500], ['L', 90, 180], ['S', 400], ['R', 90, 180], ['S', 400], ['R', 45, 300], ['L', 45, 300], ['S', 340], ['R', 90, 200], ['S', 580], ['L', 90, 190], ['S', 400], ['R', 90, 220], ['S', 1400], ['R', 90, 260]],
  },
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

function rawLine(track) {
  const z = track.size || 1;
  if (track.prog) {
    const [sl, sr] = track.scale || [1, 1];
    const prog = track.prog.map((op) => (op[0] === 'S' ? ['S', op[1] * sl * z] : [op[0], op[1], op[2] * sr * z]));
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
  const P = track.pts.map(([x, y]) => [x * z, y * z]);
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
