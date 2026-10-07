/* Rumbo — geometría pura (sin DOM, se prueba en Node).
 * Los contornos vienen de world.json: grados × 10 como enteros, en anillos planos [lon, lat, lon, lat…].
 * Todo se trabaja con vectores unitarios (x, y, z): así los anillos que cruzan el antimeridiano o pasan cerca
 * de un polo no tienen saltos, y la distancia entre dos puntos es el arco entre sus vectores.
 */
export const R_KM = 6371;
const RAD = Math.PI / 180;
/** Por debajo de esta distancia entre fronteras (simplificadas) los países cuentan como limítrofes: 0 km. */
export const TOUCH_KM = 25;
/** Paso máximo al densificar: para dibujar (sin que una arista larga cruce el disco) y para medir distancias. */
export const DRAW_STEP = 1;
export const DIST_STEP = 0.25;

// ---------------------------------------------------------------- vectores
export function toVec(lon, lat) {
  const cl = Math.cos(lat * RAD);
  return [cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(lat * RAD)];
}
export const toLonLat = (x, y, z) => [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];

/** Distancia en km entre dos puntos (grados), haversine. */
export function haversineKm(lo1, la1, lo2, la2) {
  const h = Math.sin(((la2 - la1) * RAD) / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(((lo2 - lo1) * RAD) / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------------------------------------------------------------- proyección ortográfica
/**
 * Base de la vista centrada en (lon0, lat0): tres filas que llevan un vector unitario del mundo a (X derecha, Y arriba, Z hacia quien mira).
 * Rellena `out` (9 números) y lo devuelve; sirve para proyectar miles de puntos sin crear objetos.
 */
export function viewBasis(lon0, lat0, out = new Float64Array(9)) {
  const l = lon0 * RAD;
  const f = lat0 * RAD;
  const sl = Math.sin(l);
  const cl = Math.cos(l);
  const sf = Math.sin(f);
  const cf = Math.cos(f);
  out[0] = -sl;
  out[1] = cl;
  out[2] = 0;
  out[3] = -sf * cl;
  out[4] = -sf * sl;
  out[5] = cf;
  out[6] = cf * cl;
  out[7] = cf * sl;
  out[8] = sf;
  return out;
}

/** Proyección de un punto lon/lat (grados) con el globo centrado en (lon0, lat0). x a la derecha, y hacia arriba, en el disco unidad. */
export function project(lon, lat, lon0, lat0) {
  const b = viewBasis(lon0, lat0);
  const [px, py, pz] = toVec(lon, lat);
  const z = b[6] * px + b[7] * py + b[8] * pz;
  return { x: b[0] * px + b[1] * py + b[2] * pz, y: b[3] * px + b[4] * py + b[5] * pz, z, visible: z > 0 };
}

// ---------------------------------------------------------------- densificar contornos
/**
 * Anillo plano en grados×10 → vectores unitarios (Float64Array x,y,z…) con pasos de a lo sumo `step` grados
 * a lo largo del círculo máximo. El anillo se cierra solo (si el último punto repite el primero, se descarta).
 */
export function densifyRing(flat, step) {
  const n = flat.length / 2;
  const v = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = toVec(flat[2 * i] / 10, flat[2 * i + 1] / 10);
    v[3 * i] = p[0];
    v[3 * i + 1] = p[1];
    v[3 * i + 2] = p[2];
  }
  let m = n;
  if (m > 1 && Math.abs(v[0] - v[3 * (m - 1)]) + Math.abs(v[1] - v[3 * (m - 1) + 1]) + Math.abs(v[2] - v[3 * (m - 1) + 2]) < 1e-9) m--;
  const out = [];
  const stepRad = step * RAD;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const ax = v[3 * i];
    const ay = v[3 * i + 1];
    const az = v[3 * i + 2];
    const bx = v[3 * j];
    const by = v[3 * j + 1];
    const bz = v[3 * j + 2];
    out.push(ax, ay, az);
    const ang = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)));
    const k = Math.ceil(ang / stepRad);
    if (k > 1 && ang > 1e-9 && Math.PI - ang > 1e-6) {
      const s = Math.sin(ang);
      for (let q = 1; q < k; q++) {
        const t = q / k;
        const wa = Math.sin((1 - t) * ang) / s;
        const wb = Math.sin(t * ang) / s;
        out.push(wa * ax + wb * bx, wa * ay + wb * by, wa * az + wb * bz);
      }
    }
  }
  return Float64Array.from(out);
}

/** Casquete esférico que encierra un anillo: centro (vector unitario) y radio angular en radianes. */
function capOf(vec) {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  const n = vec.length / 3;
  for (let i = 0; i < vec.length; i += 3) {
    sx += vec[i];
    sy += vec[i + 1];
    sz += vec[i + 2];
  }
  let l = Math.hypot(sx, sy, sz);
  if (l < 1e-9) {
    sx = vec[0];
    sy = vec[1];
    sz = vec[2];
    l = 1;
  }
  sx /= l;
  sy /= l;
  sz /= l;
  let min = 1;
  for (let i = 0; i < vec.length; i += 3) min = Math.min(min, sx * vec[i] + sy * vec[i + 1] + sz * vec[i + 2]);
  const r = Math.acos(Math.max(-1, min));
  return { x: sx, y: sy, z: sz, r, sr: Math.sin(r), n };
}

/**
 * Forma de un país: `entry` es { c, p } de world.json; `center` es [lon, lat] del país (countries.json, `ll`).
 * Sin polígonos (islas diminutas) la forma es solo su centro.
 *   rings  anillos densificados a ≤ 1° para dibujar (con su casquete para descartar los de la cara oculta)
 *   dense  (perezoso) vectores a ≤ 0,25° de todos los anillos juntos, para medir distancias entre fronteras
 */
export function makeShape(entry, center) {
  const [clon, clat] = center;
  const shape = { c: entry.c, center, cv: toVec(clon, clat), rings: [], caps: [], hasPoly: entry.p.length > 0, _dense: null, _flat: entry.p };
  for (const flat of entry.p) {
    const v = densifyRing(flat, DRAW_STEP);
    shape.rings.push(v);
    shape.caps.push(capOf(v));
  }
  return shape;
}

/** Vectores densos para medir (o el centro si el país no tiene polígonos). */
export function denseOf(shape) {
  if (shape._dense) return shape._dense;
  if (!shape.hasPoly) return (shape._dense = Float64Array.from(shape.cv));
  const parts = shape._flat.map((f) => densifyRing(f, DIST_STEP));
  const out = new Float64Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return (shape._dense = out);
}

// ---------------------------------------------------------------- distancia entre fronteras
const cache = new Map();
/**
 * Distancia mínima en km entre las fronteras de dos países: el menor arco entre cualquier vértice densificado de uno
 * y cualquiera del otro. Menos de 25 km (limítrofes, o superpuestos por la simplificación) cuenta como 0.
 * Simétrica y con caché. Un país sin polígonos usa su centro.
 */
export function borderDistanceKm(a, b) {
  if (a.c === b.c) return 0;
  const key = a.c < b.c ? `${a.c}|${b.c}` : `${b.c}|${a.c}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const A = denseOf(a);
  const B = denseOf(b);
  // si el mejor par ya cae dentro del umbral no hace falta seguir mirando
  const stop = Math.cos(TOUCH_KM / R_KM);
  let best = -2;
  outer: for (let i = 0; i < A.length; i += 3) {
    const ax = A[i];
    const ay = A[i + 1];
    const az = A[i + 2];
    for (let j = 0; j < B.length; j += 3) {
      const d = ax * B[j] + ay * B[j + 1] + az * B[j + 2];
      if (d > best) {
        best = d;
        if (best >= stop) break outer;
      }
    }
  }
  const km = best >= stop ? 0 : R_KM * Math.acos(Math.max(-1, Math.min(1, best)));
  cache.set(key, km);
  return km;
}
export const clearDistanceCache = () => cache.clear();

// ---------------------------------------------------------------- escala de color
/**
 * Escala de calor según la distancia entre fronteras: 0 km (limítrofe) es lo más caliente y a partir de 4000 km lo más frío.
 * Las tonalidades siguen los cuadraditos de compartir (rojo, naranja, amarillo, verde, azul), pero además la luminosidad
 * es distinta en cada tramo y en la lista siempre figuran los km, así que no depende solo del rojo y el verde.
 * `HEAT_MAX` es la distancia desde la que el color ya no cambia.
 */
export const HEAT_MAX = 4000;
const STOPS = [0, 300, 1000, 2000, 3000, HEAT_MAX];
export const PALETTES = {
  dark: [
    [255, 51, 85],
    [255, 122, 26],
    [255, 205, 38],
    [122, 224, 92],
    [38, 196, 214],
    [74, 120, 255],
  ],
  light: [
    [210, 16, 62],
    [232, 84, 16],
    [196, 148, 0],
    [60, 158, 44],
    [14, 140, 166],
    [46, 80, 214],
  ],
  // alto contraste: una sola línea de amarillo a violeta, con la luminosidad bajando de forma pareja
  hcDark: [
    [255, 244, 120],
    [255, 205, 70],
    [255, 140, 70],
    [214, 90, 140],
    [150, 80, 190],
    [96, 80, 220],
  ],
  hcLight: [
    [205, 145, 0],
    [215, 100, 30],
    [200, 60, 80],
    [150, 50, 140],
    [100, 50, 180],
    [50, 50, 200],
  ],
};

/** Color [r, g, b] para una distancia en km (interpolado entre los tramos de la paleta). Escribe en `out` si se le pasa uno. */
export function heatRgb(km, palette = PALETTES.dark, out = [0, 0, 0]) {
  const d = Math.max(0, Math.min(HEAT_MAX, km));
  let i = 0;
  while (i < STOPS.length - 2 && d > STOPS[i + 1]) i++;
  const t = (d - STOPS[i]) / (STOPS[i + 1] - STOPS[i]);
  for (let k = 0; k < 3; k++) out[k] = Math.round(palette[i][k] + (palette[i + 1][k] - palette[i][k]) * t);
  return out;
}
export const heatColor = (km, palette) => {
  const c = heatRgb(km, palette);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
/** Texto negro o blanco, el que mejor se lee sobre ese color. */
export function inkFor(rgb) {
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  return L > 0.3 ? '#07070a' : '#ffffff';
}

/** Tramo (0 a 5) de una distancia: define el cuadradito al compartir. 0 = limítrofe, 5 = lejísimos. */
export function heatBucket(km) {
  if (km <= 0) return 0;
  if (km <= 500) return 1;
  if (km <= 1500) return 2;
  if (km <= 2500) return 3;
  if (km < HEAT_MAX) return 4;
  return 5;
}
export const SQUARES = ['🟥', '🟧', '🟨', '🟩', '🟦', '⬜'];

/** Barra del histograma (1 a 6) según los intentos usados al ganar: ≤5, 6-10, 11-15, 16-20, 21-30, 31+. */
export function attemptsBucket(n) {
  if (n <= 5) return 1;
  if (n <= 10) return 2;
  if (n <= 15) return 3;
  if (n <= 20) return 4;
  if (n <= 30) return 5;
  return 6;
}

// ---------------------------------------------------------------- animación de la cámara
/** Diferencia de longitud más corta (de `from` a `to`), en (−180, 180]. */
export function lonDelta(from, to) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}
/** Suavizado de entrada y salida. */
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
