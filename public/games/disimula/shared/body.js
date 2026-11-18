/**
 * Disimulá — el cuerpo compartido (JS puro, sin three.js).
 *
 * Define el maniquí: huesos, partes, poses y el atlas de pintura de 128×128 donde vive cada parte.
 * Este archivo es la única fuente de verdad:
 *  - el cliente arma UNA malla con `bodyMesh` y la deforma con `skinBody` (las UVs ya vienen en
 *    coordenadas del atlas),
 *  - el servidor y los bots usan `transforms`, `sampleBody`, `raycastBody` y `closestBodyPoint`
 *    para capturas, proyecciones de pintura y puntaje de camuflaje — sin WebGL.
 * Las matrices se calculan acá (no con Euler de three.js) para que CPU y GPU coincidan exacto.
 *
 * Cómo se arma la piel (una sola pieza):
 *  - Cada parte es una superficie de revolución con un perfil suave (`rings`: altura, radios en X y en Z y
 *    desplazamiento hacia adelante). El perfil se interpola con una curva que no se pasa de largo, así que no
 *    hay escalones ni tapas redondas entre un tramo y el siguiente.
 *  - En cada articulación (cuello, cintura, codo, rodilla, tobillo, muñeca) los dos tramos vecinos comparten el
 *    MISMO anillo y los vértices de las puntas se reparten entre los dos huesos (`skin`): al doblarse, la piel
 *    se estira y se curva sin grietas ni tubos abiertos. La misma función de pesos la usan la malla y el muestreo.
 *  - El reparto de la pintura no cambia: cada parte sigue con su rectángulo del atlas, su u (ángulo, 0,5 = frente)
 *    y su v (a lo largo del perfil).
 *  - Lo que valida el servidor (capturas) usa un proxy simple por parte (`shape`: cápsula, esfera o caja), liviano
 *    y sin sorpresas: el cuerpo visible está siempre dentro de esos proxies con unos centímetros de margen.
 */

export const ATLAS = 128; // lado del atlas de pintura
export const BASE_COLOR = [238, 238, 244]; // blanco del maniquí sin pintar

// ---------------------------------------------------------------- huesos
// [nombre, padre, pivote en el espacio del padre]. footL/footR son los tobillos (los últimos, para no mover los índices).
export const BONES = [
  ['root', null, [0, 0, 0]],
  ['torso', 'root', [0, 0.1, 0]],
  ['head', 'torso', [0, 0.46, 0]],
  ['uarmL', 'torso', [0.215, 0.38, 0]],
  ['foreL', 'uarmL', [0, -0.28, 0]],
  ['uarmR', 'torso', [-0.215, 0.38, 0]],
  ['foreR', 'uarmR', [0, -0.28, 0]],
  ['thighL', 'root', [0.115, -0.02, 0]],
  ['shinL', 'thighL', [0, -0.42, 0]],
  ['thighR', 'root', [-0.115, -0.02, 0]],
  ['shinR', 'thighR', [0, -0.42, 0]],
  ['footL', 'shinL', [0, -0.34, 0]],
  ['footR', 'shinR', [0, -0.34, 0]],
];
const BONE_I = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
// posición de cada hueso con el cuerpo en reposo (sin giros): la suma de los pivotes
const REST = [];
BONES.forEach(([, parent, pivot], i) => {
  const p = parent ? REST[BONE_I[parent]] : [0, 0, 0];
  REST[i] = [p[0] + pivot[0], p[1] + pivot[1], p[2] + pivot[2]];
});

// ---------------------------------------------------------------- perfiles de la piel
// Anillo = [altura en el espacio del hueso, radio en X, radio en Z, desplazamiento en Z (adelante +)].
// El primer anillo es v = 0 y el último v = 1. Un radio 0 cierra la punta (polo).
// Los anillos de las articulaciones están definidos una sola vez y los usan las dos partes que se tocan.
const NECK = [0.058, 0.06, -0.004];
const WAIST = [0.146, 0.108, 0];
const ELBOW = [0.053, 0.053, 0];
const WRIST = [0.039, 0.041, 0];
const KNEE = [0.069, 0.072, -0.001];
const ANKLE = [0.044, 0.049, 0];
const at = (y, k) => [y, k[0], k[1], k[2]];

const HEAD_RINGS = [
  at(0, NECK), // cuello (empalma con el torso)
  [0.05, 0.058, 0.062, -0.002],
  [0.095, 0.1, 0.108, 0.008],
  [0.136, 0.146, 0.154, 0.017],
  [0.195, 0.175, 0.18, 0.02],
  [0.254, 0.178, 0.18, 0.017],
  [0.313, 0.16, 0.163, 0.012],
  [0.36, 0.12, 0.123, 0.005],
  [0.392, 0.066, 0.069, 0],
  [0.408, 0.024, 0.026, 0], // coronilla → antena
  [0.42, 0.013, 0.013, 0],
  [0.444, 0.012, 0.012, 0],
  [0.458, 0.024, 0.024, 0],
  [0.472, 0.032, 0.032, 0], // bolita de la antena
  [0.488, 0.025, 0.025, 0],
  [0.497, 0.012, 0.012, 0],
  [0.5, 0, 0, 0],
];
const TORSO_RINGS = [
  at(0, WAIST), // cintura (empalma con la cadera)
  [0.05, 0.152, 0.112, 0.002],
  [0.13, 0.168, 0.12, 0.006],
  [0.23, 0.186, 0.127, 0.01],
  [0.32, 0.198, 0.126, 0.008],
  [0.372, 0.198, 0.114, 0.004], // línea de los hombros
  [0.41, 0.152, 0.1, 0],
  [0.438, 0.095, 0.08, -0.003],
  at(0.46, NECK), // base del cuello (empalma con la cabeza)
];
const HIPS_RINGS = [
  [-0.14, 0, 0, 0],
  [-0.13, 0.05, 0.055, 0],
  [-0.1, 0.13, 0.1, 0],
  [-0.05, 0.19, 0.128, -0.004],
  [0.0, 0.205, 0.136, -0.004],
  [0.045, 0.19, 0.128, -0.003],
  [0.075, 0.165, 0.118, -0.001],
  at(0.1, WAIST), // cintura
];
const UARM_RINGS = [
  [0.062, 0, 0, 0], // hombro redondeado
  [0.052, 0.049, 0.049, 0],
  [0.01, 0.07, 0.07, 0],
  [-0.08, 0.066, 0.066, 0],
  [-0.19, 0.058, 0.058, 0],
  at(-0.28, ELBOW),
];
const FORE_RINGS = [at(0, ELBOW), [-0.05, 0.055, 0.056, 0], [-0.14, 0.048, 0.049, 0], at(-0.24, WRIST)];
const HAND_RINGS = [
  at(-0.24, WRIST),
  [-0.278, 0.034, 0.056, 0.004],
  [-0.325, 0.037, 0.063, 0.007],
  [-0.372, 0.032, 0.053, 0.007],
  [-0.402, 0.019, 0.032, 0.006],
  [-0.418, 0, 0, 0.005],
];
const THIGH_RINGS = [
  [0.09, 0, 0, 0], // adentro de la cadera
  [0.078, 0.054, 0.056, 0],
  [0.04, 0.09, 0.096, 0.002],
  [-0.04, 0.098, 0.105, 0.004],
  [-0.15, 0.09, 0.096, 0.003],
  [-0.27, 0.08, 0.084, 0],
  [-0.36, 0.072, 0.076, -0.001],
  at(-0.42, KNEE),
];
const SHIN_RINGS = [at(0, KNEE), [-0.05, 0.07, 0.077, -0.004], [-0.13, 0.066, 0.079, -0.01], [-0.23, 0.054, 0.062, -0.006], [-0.3, 0.047, 0.052, -0.002], at(-0.34, ANKLE)];
const FOOT_RINGS = [at(0, ANKLE), [-0.03, 0.056, 0.08, 0.028], [-0.062, 0.064, 0.122, 0.056], [-0.09, 0.062, 0.136, 0.067], [-0.104, 0.047, 0.113, 0.067], [-0.11, 0, 0, 0.067]];

// ---------------------------------------------------------------- partes
// rect: lugar en el atlas [x, y, ancho, alto]. region: grupo para el balde y el material.
// shape/a/b/c/r/s: PROXY de colisión (cápsula a→b radio r | esfera c radio r | caja c medidas s) en el espacio del hueso.
// rings/skin: la piel visible. skin: [{ end: 'first' | 'last', to: hueso vecino, zone: metros del reparto }].
export const PARTS = [
  { id: 'head', bone: 'head', shape: 'sph', c: [0, 0.22, 0], r: 0.2, rect: [0, 0, 48, 32], region: 'head', rings: HEAD_RINGS, skin: [{ end: 'first', to: 'torso', zone: 0.07 }] },
  { id: 'torso', bone: 'torso', shape: 'cap', a: [0, 0.02, 0], b: [0, 0.4, 0], r: 0.19, rect: [48, 0, 56, 36], region: 'torso', rings: TORSO_RINGS, skin: [{ end: 'first', to: 'root', zone: 0.09 }, { end: 'last', to: 'head', zone: 0.05 }] },
  { id: 'hips', bone: 'root', shape: 'cap', a: [0, -0.05, 0], b: [0, 0.07, 0], r: 0.185, rect: [48, 36, 56, 14], region: 'torso', rings: HIPS_RINGS, skin: [{ end: 'last', to: 'torso', zone: 0.07 }] },
  { id: 'uarmL', bone: 'uarmL', shape: 'cap', a: [0, 0, 0], b: [0, -0.27, 0], r: 0.06, rect: [104, 0, 24, 18], region: 'armL', rings: UARM_RINGS, skin: [{ end: 'last', to: 'foreL', zone: 0.09 }] },
  { id: 'foreL', bone: 'foreL', shape: 'cap', a: [0, 0, 0], b: [0, -0.25, 0], r: 0.052, rect: [104, 18, 24, 16], region: 'armL', rings: FORE_RINGS, skin: [{ end: 'first', to: 'uarmL', zone: 0.09 }] },
  { id: 'handL', bone: 'foreL', shape: 'sph', c: [0, -0.33, 0], r: 0.085, rect: [104, 34, 24, 14], region: 'handL', rings: HAND_RINGS, skin: [] },
  { id: 'uarmR', bone: 'uarmR', shape: 'cap', a: [0, 0, 0], b: [0, -0.27, 0], r: 0.06, rect: [48, 50, 24, 18], region: 'armR', rings: UARM_RINGS, skin: [{ end: 'last', to: 'foreR', zone: 0.09 }] },
  { id: 'foreR', bone: 'foreR', shape: 'cap', a: [0, 0, 0], b: [0, -0.25, 0], r: 0.052, rect: [48, 68, 24, 16], region: 'armR', rings: FORE_RINGS, skin: [{ end: 'first', to: 'uarmR', zone: 0.09 }] },
  { id: 'handR', bone: 'foreR', shape: 'sph', c: [0, -0.33, 0], r: 0.085, rect: [48, 84, 24, 14], region: 'handR', rings: HAND_RINGS, skin: [] },
  { id: 'thighL', bone: 'thighL', shape: 'cap', a: [0, 0, 0], b: [0, -0.41, 0], r: 0.09, rect: [0, 32, 24, 22], region: 'legL', rings: THIGH_RINGS, skin: [{ end: 'last', to: 'shinL', zone: 0.1 }] },
  { id: 'shinL', bone: 'shinL', shape: 'cap', a: [0, 0, 0], b: [0, -0.38, 0], r: 0.068, rect: [0, 54, 24, 20], region: 'legL', rings: SHIN_RINGS, skin: [{ end: 'first', to: 'thighL', zone: 0.1 }, { end: 'last', to: 'footL', zone: 0.05 }] },
  { id: 'footL', bone: 'footL', shape: 'box', c: [0, -0.06, 0.055], s: [0.12, 0.08, 0.26], rect: [0, 74, 24, 16], region: 'footL', rings: FOOT_RINGS, skin: [{ end: 'first', to: 'shinL', zone: 0.05 }] },
  { id: 'thighR', bone: 'thighR', shape: 'cap', a: [0, 0, 0], b: [0, -0.41, 0], r: 0.09, rect: [24, 32, 24, 22], region: 'legR', rings: THIGH_RINGS, skin: [{ end: 'last', to: 'shinR', zone: 0.1 }] },
  { id: 'shinR', bone: 'shinR', shape: 'cap', a: [0, 0, 0], b: [0, -0.38, 0], r: 0.068, rect: [24, 54, 24, 20], region: 'legR', rings: SHIN_RINGS, skin: [{ end: 'first', to: 'thighR', zone: 0.1 }, { end: 'last', to: 'footR', zone: 0.05 }] },
  { id: 'footR', bone: 'footR', shape: 'box', c: [0, -0.06, 0.055], s: [0.12, 0.08, 0.26], rect: [24, 74, 24, 16], region: 'footR', rings: FOOT_RINGS, skin: [{ end: 'first', to: 'shinR', zone: 0.05 }] },
];

// ---------------------------------------------------------------- perfiles: tablas densas por parte
// Cada anillo aporta 4 canales (y, rx, rz, cz) que se interpolan con una cúbica monótona por tramos (no se pasa
// de largo entre anillos) y se guardan en una tabla densa con el largo de arco acumulado: v = largo / total.
const SUB = 14; // muestras por tramo entre anillos

function pchip(f) {
  const n = f.length;
  const d = [];
  for (let k = 0; k < n - 1; k++) d.push(f[k + 1] - f[k]);
  const m = new Array(n).fill(0);
  if (n === 2) {
    m[0] = m[1] = d[0];
    return m;
  }
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (2 * d[k - 1] * d[k]) / (d[k - 1] + d[k]);
  const endSlope = (d0, d1) => {
    let e = (3 * d0 - d1) / 2;
    if (e * d0 <= 0) e = 0;
    else if (d0 * d1 <= 0 && Math.abs(e) > 3 * Math.abs(d0)) e = 3 * d0;
    return e;
  };
  m[0] = endSlope(d[0], d[1]);
  m[n - 1] = endSlope(d[n - 2], d[n - 3]);
  return m;
}

function buildProfile(rings) {
  const n = rings.length;
  const ch = [0, 1, 2, 3].map((c) => rings.map((r) => r[c]));
  const tg = ch.map(pchip);
  // los anillos abiertos son los que comparten dos partes: ahí el radio sale derecho (pendiente 0) de los dos lados,
  // así no queda una arruga ni un escalón en la articulación
  for (let c = 1; c < 4; c++) {
    if (rings[0][1] > 0 || rings[0][2] > 0) tg[c][0] = 0;
    if (rings[n - 1][1] > 0 || rings[n - 1][2] > 0) tg[c][n - 1] = 0;
  }
  const dense = [[], [], [], []];
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < SUB; s++) {
      const t = s / SUB;
      const h00 = 2 * t ** 3 - 3 * t * t + 1;
      const h10 = t ** 3 - 2 * t * t + t;
      const h01 = -2 * t ** 3 + 3 * t * t;
      const h11 = t ** 3 - t * t;
      for (let c = 0; c < 4; c++) dense[c].push(h00 * ch[c][i] + h10 * tg[c][i] + h01 * ch[c][i + 1] + h11 * tg[c][i + 1]);
    }
  }
  for (let c = 0; c < 4; c++) dense[c].push(ch[c][n - 1]);
  const N = dense[0].length;
  const [y, rx, rz, cz] = dense.map((a) => Float64Array.from(a));
  const s = new Float64Array(N);
  for (let i = 1; i < N; i++) s[i] = s[i - 1] + Math.hypot(y[i] - y[i - 1], ((rx[i] + rz[i]) - (rx[i - 1] + rz[i - 1])) / 2);
  const S = s[N - 1];
  // derivadas respecto del largo de arco (diferencias centrales)
  const der = (a) => {
    const o = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(N - 1, i + 1);
      o[i] = (a[i1] - a[i0]) / (s[i1] - s[i0] || 1);
    }
    return o;
  };
  return { N, S, s, y, rx, rz, cz, dy: der(y), drx: der(rx), drz: der(rz), dcz: der(cz), sgn: rings[n - 1][0] >= rings[0][0] ? 1 : -1, yFirst: rings[0][0], yLast: rings[n - 1][0] };
}
const PROFILES = PARTS.map((p) => buildProfile(p.rings));

function profileAt(P, v) {
  const s = Math.min(Math.max(v, 0), 1) * P.S;
  let lo = 0;
  let hi = P.N - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (P.s[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - P.s[lo]) / (P.s[hi] - P.s[lo] || 1);
  const L = (a) => a[lo] + (a[hi] - a[lo]) * t;
  return { y: L(P.y), rx: L(P.rx), rz: L(P.rz), cz: L(P.cz), dy: L(P.dy), drx: L(P.drx), drz: L(P.drz), dcz: L(P.dcz) };
}

/** v del perfil de una parte a una altura dada (para ubicar la cara, la cinta de la cabeza, etc.): el primer cruce desde v = 0. */
function vAtY(pi, y) {
  const P = PROFILES[pi];
  for (let i = 1; i < P.N; i++) {
    if ((P.y[i - 1] - y) * (P.y[i] - y) <= 0 && P.y[i] !== P.y[i - 1]) {
      const t = (y - P.y[i - 1]) / (P.y[i] - P.y[i - 1]);
      return (P.s[i - 1] + (P.s[i] - P.s[i - 1]) * t) / P.S;
    }
  }
  return null;
}

/**
 * Punto de la superficie de una parte en el espacio de SU hueso, con la normal hacia afuera.
 * u = ángulo alrededor del eje (0,5 = frente, +Z) y envuelve; v = a lo largo del perfil (0 = primer anillo).
 */
export function surface(pi, u, v) {
  const P = PROFILES[pi];
  const phi = (u - 0.5) * Math.PI * 2;
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  // la posición es exacta hasta en los extremos: los anillos que comparten dos partes tienen que coincidir al milímetro
  const p = profileAt(P, v);
  // normal = dP/dφ × dP/ds (de afuera hacia adentro si el perfil baja: se corrige con sgn). En un polo el radio es 0 y
  // no hay normal definida: se la toma apenas hacia adentro.
  const q = profileAt(P, Math.min(0.9999, Math.max(0.0001, v)));
  let nx = q.rz * sp * q.dy;
  let ny = -q.rz * q.drx * sp * sp - q.rx * cp * q.dcz - q.rx * q.drz * cp * cp;
  let nz = q.rx * cp * q.dy;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx = (nx / l) * P.sgn;
  ny = (ny / l) * P.sgn;
  nz = (nz / l) * P.sgn;
  return { x: p.rx * sp, y: p.y, z: p.cz + p.rz * cp, nx, ny, nz };
}

/** Radios del perfil de una parte a una altura (ancho, fondo y corrimiento adelante del cuerpo ahí). */
export function sectionAtY(partId, y) {
  const pi = PARTS.findIndex((p) => p.id === partId);
  const v = vAtY(pi, y);
  if (v === null) return null;
  const q = profileAt(PROFILES[pi], v);
  return { rx: q.rx, rz: q.rz, cz: q.cz };
}

/** Pesos de la piel: { b0, b1, w } = hueso propio, hueso vecino (-1 si no hay) y peso del vecino (0 a 0,5). */
function skinOf(pi, y) {
  const part = PARTS[pi];
  const P = PROFILES[pi];
  let b1 = -1;
  let w = 0;
  for (const j of part.skin) {
    const yEnd = j.end === 'first' ? P.yFirst : P.yLast;
    const d = Math.abs(y - yEnd);
    if (d >= j.zone) continue;
    const x = d / j.zone;
    const k = 0.5 * (1 - x * x * (3 - 2 * x)); // 0,5 en el anillo, 0 al final de la zona
    if (k > w) {
      w = k;
      b1 = BONE_I[j.to];
    }
  }
  return { b0: BONE_I[part.bone], b1, w };
}

/**
 * Regiones para el balde y el material. face/front/back son sub-zonas solo de balde
 * (u es el ángulo: 0,5 = frente); las demás también tienen material propio.
 */
const FACE_V = [vAtY(0, 0.1), vAtY(0, 0.345)]; // de la barbilla a la frente
export const REGIONS = [
  { id: 'head', parts: ['head'] },
  { id: 'face', parts: ['head'], u: [0.33, 0.67], v: FACE_V },
  { id: 'torso', parts: ['torso', 'hips'] },
  { id: 'front', parts: ['torso', 'hips'], u: [0.26, 0.74] },
  { id: 'back', parts: ['torso', 'hips'], uOut: [0.26, 0.74] }, // el complemento: la espalda
  { id: 'armL', parts: ['uarmL', 'foreL'] },
  { id: 'armR', parts: ['uarmR', 'foreR'] },
  { id: 'handL', parts: ['handL'] },
  { id: 'handR', parts: ['handR'] },
  { id: 'legL', parts: ['thighL', 'shinL'] },
  { id: 'legR', parts: ['thighR', 'shinR'] },
  { id: 'footL', parts: ['footL'] },
  { id: 'footR', parts: ['footR'] },
];
export const MAT_REGIONS = REGIONS.filter((r) => !r.u && !r.uOut).map((r) => r.id); // 10 regiones con material propio

/** ¿El texel (u,v) de una parte pertenece a la región? */
export function inRegion(reg, partId, u, v) {
  if (!reg.parts.includes(partId)) return false;
  if (reg.u && (u < reg.u[0] || u > reg.u[1])) return false;
  if (reg.uOut && u >= reg.uOut[0] && u <= reg.uOut[1]) return false;
  if (reg.v && (v < reg.v[0] || v > reg.v[1])) return false;
  return true;
}

// dueño de cada texel del atlas (índice de parte o -1): para pinceles y balde
let OWNER = null;
export function atlasOwner() {
  if (OWNER) return OWNER;
  OWNER = new Int8Array(ATLAS * ATLAS).fill(-1);
  PARTS.forEach((p, i) => {
    const [x, y, w, h] = p.rect;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) OWNER[yy * ATLAS + xx] = i;
  });
  return OWNER;
}

/** Texel del atlas para el (u,v) de una parte. */
export function uvToTexel(part, u, v) {
  const [x, y, w, h] = part.rect;
  return [x + Math.min(w - 1, Math.max(0, Math.floor(u * w))), y + Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)))];
}

/** (u,v) del centro de un texel de una parte. */
export function texelToUv(part, tx, ty) {
  const [x, y, w, h] = part.rect;
  return [(tx - x + 0.5) / w, 1 - (ty - y + 0.5) / h];
}

// ---------------------------------------------------------------- poses
// bones: [rx, ry, rz] por hueso. rootY: altura de la cadera. rootRX: inclinación de todo el cuerpo.
// hitH/hitR: cápsula del lugar que ocupa (validez del escondite). eye: altura de cámara propia.
export const POSES = {
  // de pie, relajado: los brazos un poco separados para no atravesar los muslos
  stand: {
    rootY: 0.893,
    rootRX: 0,
    hitH: 1.8,
    hitR: 0.3,
    eye: 1.6,
    bones: { uarmL: [0.03, 0, -0.14], uarmR: [0.03, 0, 0.14], foreL: [-0.16, 0, 0.05], foreR: [-0.16, 0, -0.05] },
  },
  // en cuclillas: pies planos, rodillas adelante, el torso inclinado y los brazos apoyados en las rodillas
  crouch: {
    rootY: 0.451,
    rootRX: 0,
    hitH: 1.15,
    hitR: 0.34,
    eye: 0.95,
    bones: { torso: [0.42, 0, 0], head: [-0.3, 0, 0], thighL: [-1.62, 0, 0.12], shinL: [1.52, 0, 0], footL: [0.1, 0, -0.1], thighR: [-1.62, 0, -0.12], shinR: [1.52, 0, 0], footR: [0.1, 0, 0.1], uarmL: [-0.8, 0, -0.2], foreL: [-0.85, 0, 0.1], uarmR: [-0.8, 0, 0.2], foreR: [-0.85, 0, -0.1] },
  },
  // sentado en el piso con las piernas estiradas: la cadera y los talones apoyan a la vez
  sit: {
    rootY: 0.149,
    rootRX: 0,
    hitH: 0.95,
    hitR: 0.4,
    eye: 0.75,
    bones: { torso: [0.1, 0, 0], head: [-0.1, 0, 0], thighL: [-1.58, 0, 0.14], shinL: [0.06, 0, 0], footL: [1.17, 0, -0.12], thighR: [-1.58, 0, -0.14], shinR: [0.06, 0, 0], footR: [1.17, 0, 0.12], uarmL: [-0.95, 0, -0.2], foreL: [-0.3, 0, 0.05], uarmR: [-0.95, 0, 0.2], foreR: [-0.3, 0, -0.05] },
  },
  // acostado boca arriba (cabeza hacia -Z), los pies caen hacia afuera
  lie: {
    rootY: 0.143,
    rootRX: -1.5708,
    hitH: 0.5,
    hitR: 0.55,
    eye: 0.35,
    bones: { head: [0.12, 0, 0], uarmL: [0, 0, -0.16], uarmR: [0, 0, 0.16], foreL: [0, 0, 0.04], foreR: [0, 0, -0.04], thighL: [0.02, 0, 0.07], thighR: [0.02, 0, -0.07], footL: [0, -0.28, 0], footR: [0, 0.28, 0] },
  },
  // estrella: brazos y piernas abiertos, los pies planos
  star: {
    rootY: 0.863,
    rootRX: 0,
    hitH: 1.8,
    hitR: 0.55,
    eye: 1.6,
    bones: { head: [-0.04, 0, 0], uarmL: [0, 0, -1.45], uarmR: [0, 0, 1.45], foreL: [0, 0, -0.08], foreR: [0, 0, 0.08], thighL: [0, 0, 0.32], thighR: [0, 0, -0.32], shinL: [0, 0, -0.1], shinR: [0, 0, 0.1], footL: [0, 0, -0.22], footR: [0, 0, 0.22] },
  },
  // de espaldas a la pared: parado derecho, con los brazos un poco hacia atrás como apoyados
  wall: {
    rootY: 0.893,
    rootRX: 0,
    hitH: 1.8,
    hitR: 0.3,
    eye: 1.6,
    bones: { head: [0.02, 0, 0], uarmL: [0.22, 0, -0.2], uarmR: [0.22, 0, 0.2], foreL: [0, 0, -0.04], foreR: [0, 0, 0.04] },
  },
};
export const POSE_IDS = Object.keys(POSES);

// Ajuste fino: 6 articulaciones de -1 a 1, cada una suma una rotación con límite.
// [hueso, eje (0=rx 2=rz), rango en radianes]
export const JOINTS = [
  ['head', 0, 0.6],
  ['torso', 0, 0.45],
  ['uarmL', 2, -1.3],
  ['uarmR', 2, 1.3],
  ['thighL', 0, -1.1],
  ['thighR', 0, -1.1],
];

export const eyeHeight = (pose) => (POSES[pose] || POSES.stand).eye;
export const poseHit = (pose) => {
  const p = POSES[pose] || POSES.stand;
  return { r: p.hitR, h: p.hitH };
};

// ---------------------------------------------------------------- matrices (3×3 por filas + posición)
const matMul = (a, b) => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const matVec = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
const rotXYZ = (rx, ry, rz) => {
  // orden fijo: primero giro propio Z, después X, después Y (R = Ry·Rx·Rz)
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return matMul(Ry, matMul(Rx, Rz));
};
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Transformaciones de cada parte en el mundo para un estado
 * { pos: [x,y,z] (pies), yaw, pose, joints: [6] } → { parts: [{ m: mat3, p: [x,y,z] }, …] (una por PARTS), bones }.
 * Solo visual y opcional (no viaja por la red): `poseDef` (una pose a medias entre dos, para las transiciones) y
 * `anim` ({ hueso: [rx, ry, rz], _y: subida de la cadera, root: [rx, ry, rz] giro del cuerpo entero }) para caminar, respirar, etc.
 */
export function transforms(state) {
  const pose = state.poseDef || POSES[state.pose] || POSES.stand;
  const joints = state.joints || [];
  const anim = state.anim || null;
  const rots = {};
  for (const [name] of BONES) rots[name] = pose.bones?.[name] ? pose.bones[name].slice() : [0, 0, 0];
  JOINTS.forEach(([bone, axis, range], i) => {
    const v = Math.max(-1, Math.min(1, joints[i] || 0));
    rots[bone][axis] += v * range;
  });
  if (anim) {
    for (const k in anim) {
      const r = rots[k];
      if (!r || k === 'root') continue;
      r[0] += anim[k][0];
      r[1] += anim[k][1] || 0;
      r[2] += anim[k][2] || 0;
    }
  }
  const world = [];
  const rr = anim?.root;
  const yawM = rotXYZ(pose.rootRX + (rr ? rr[0] : 0), (state.yaw || 0) + (rr ? rr[1] || 0 : 0), rr ? rr[2] || 0 : 0);
  for (let i = 0; i < BONES.length; i++) {
    const [name, parent, pivot] = BONES[i];
    const local = name === 'root' ? IDENT : rotXYZ(rots[name][0], rots[name][1], rots[name][2]);
    if (!parent) {
      world.push({ m: yawM, p: [state.pos[0], state.pos[1] + pose.rootY + (anim?._y || 0), state.pos[2]] });
    } else {
      const pw = world[BONE_I[parent]];
      const off = matVec(pw.m, pivot[0], pivot[1], pivot[2]);
      world.push({ m: matMul(pw.m, local), p: [pw.p[0] + off[0], pw.p[1] + off[1], pw.p[2] + off[2]] });
    }
  }
  const parts = PARTS.map((part) => world[BONE_I[part.bone]]);
  return { parts, bones: world };
}

/** Pose intermedia entre dos poses (k de 0 a 1), lista para `state.poseDef`. */
export function blendPose(a, b, k) {
  const A = typeof a === 'string' ? POSES[a] || POSES.stand : a;
  const B = typeof b === 'string' ? POSES[b] || POSES.stand : b;
  const bones = {};
  for (const [name] of BONES) {
    const x = A.bones?.[name] || [0, 0, 0];
    const y = B.bones?.[name] || [0, 0, 0];
    if (A.bones?.[name] || B.bones?.[name]) bones[name] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  }
  return { rootY: A.rootY + (B.rootY - A.rootY) * k, rootRX: A.rootRX + (B.rootRX - A.rootRX) * k, bones };
}

// ---------------------------------------------------------------- la malla: una sola pieza, con piel entre huesos
const MESHES = new Map();

/**
 * La malla en reposo de todo el cuerpo (se arma una vez por nivel de detalle; no se usa en el servidor). Cada vértice
 * guarda su lugar en el espacio de su hueso (q0), en el del hueso vecino (q1) y el peso del vecino (w): ver `skinBody`.
 * `detail`: 1 = completa (14 lados, una fila cada 2 cm) · 0 = liviana para celulares (10 lados, una fila cada 3 cm).
 * Las articulaciones coinciden igual en las dos (todos los tramos usan los mismos lados).
 */
export function bodyMesh(detail = 1) {
  if (MESHES.has(detail)) return MESHES.get(detail);
  const RADIAL = detail ? 14 : 10; // lados alrededor de cada tramo
  const STEP = detail ? 0.02 : 0.03;
  const parts = []; // por parte: { first, rows }
  const rowsOf = PARTS.map((_, i) => Math.max(detail ? 6 : 4, Math.min(26, Math.round(PROFILES[i].S / STEP))));
  const cols = RADIAL + 1;
  let n = 0;
  rowsOf.forEach((rows) => {
    parts.push({ first: n, rows });
    n += (rows + 1) * cols;
  });
  const m = {
    n,
    part: new Uint8Array(n),
    mat: new Uint8Array(n), // región con material propio (índice en MAT_REGIONS)
    b0: new Uint8Array(n),
    b1: new Int8Array(n),
    w: new Float32Array(n),
    q0: new Float32Array(n * 3),
    q1: new Float32Array(n * 3),
    n0: new Float32Array(n * 3),
    uv: new Float32Array(n * 2),
    idx: [],
  };
  PARTS.forEach((part, pi) => {
    const { first, rows } = parts[pi];
    const [rx, ry, rw, rh] = part.rect;
    const P = PROFILES[pi];
    const matI = MAT_REGIONS.indexOf(part.region);
    for (let iv = 0; iv <= rows; iv++) {
      const v = iv / rows;
      for (let iu = 0; iu <= RADIAL; iu++) {
        const u = iu / RADIAL;
        const k = first + iv * cols + iu;
        const q = surface(pi, u === 1 ? 1 : u, v);
        const sk = skinOf(pi, q.y);
        m.part[k] = pi;
        m.mat[k] = matI;
        m.b0[k] = sk.b0;
        m.b1[k] = sk.b1;
        m.w[k] = sk.w;
        m.q0.set([q.x, q.y, q.z], k * 3);
        if (sk.b1 >= 0) {
          const o = REST[sk.b0];
          const t = REST[sk.b1];
          m.q1.set([q.x + o[0] - t[0], q.y + o[1] - t[1], q.z + o[2] - t[2]], k * 3);
        }
        m.n0.set([q.nx, q.ny, q.nz], k * 3);
        m.uv.set([(rx + u * rw) / ATLAS, 1 - (ry + (1 - v) * rh) / ATLAS], k * 2);
      }
    }
    for (let iv = 0; iv < rows; iv++)
      for (let iu = 0; iu < RADIAL; iu++) {
        const a = first + iv * cols + iu;
        if (P.sgn > 0) m.idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
        else m.idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
  });
  // soldadura de normales: los vértices que coinciden en el reposo (los anillos que comparten dos partes, los polos)
  // comparten una sola normal, así el sombreado cruza la articulación sin costura. Se agrupan por distancia (no por una
  // grilla redondeada, que podría separar dos puntos que son el mismo).
  const wx = new Float64Array(n);
  const wy = new Float64Array(n);
  const wz = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const o = REST[m.b0[k]];
    wx[k] = m.q0[k * 3] + o[0];
    wy[k] = m.q0[k * 3 + 1] + o[1];
    wz[k] = m.q0[k * 3 + 2] + o[2];
  }
  const CELL = 2e-3;
  const TOL = 1e-5;
  const cell = new Map();
  const ck = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  for (let k = 0; k < n; k++) {
    const g = ck(wx[k], wy[k], wz[k]);
    (cell.get(g) || cell.set(g, []).get(g)).push(k);
  }
  const root = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (root[i] !== i) i = root[i] = root[root[i]];
    return i;
  };
  for (let k = 0; k < n; k++)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = cell.get(ck(wx[k] + dx * CELL, wy[k] + dy * CELL, wz[k] + dz * CELL));
          if (!list) continue;
          for (const j of list) if (j > k && Math.abs(wx[j] - wx[k]) < TOL && Math.abs(wy[j] - wy[k]) < TOL && Math.abs(wz[j] - wz[k]) < TOL) root[find(j)] = find(k);
        }
  const groups = new Map();
  for (let k = 0; k < n; k++) {
    const g = find(k);
    (groups.get(g) || groups.set(g, []).get(g)).push(k);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const k of ids) {
      sx += m.n0[k * 3];
      sy += m.n0[k * 3 + 1];
      sz += m.n0[k * 3 + 2];
    }
    const l = Math.hypot(sx, sy, sz) || 1;
    for (const k of ids) m.n0.set([sx / l, sy / l, sz / l], k * 3);
  }
  m.idx = n < 65535 ? Uint16Array.from(m.idx) : Uint32Array.from(m.idx);
  MESHES.set(detail, m);
  return m;
}

/**
 * Deforma la malla con la pose de `state`: escribe las posiciones y normales en el mundo en `pos` y `nor`
 * (Float32Array de 3·n). Cada vértice mezcla su hueso con el vecino (piel continua en las articulaciones).
 */
export function skinBody(mesh, state, pos, nor) {
  const B = transforms(state).bones;
  const { n, b0, b1, w, q0, q1, n0 } = mesh;
  for (let k = 0; k < n; k++) {
    const i = k * 3;
    const A = B[b0[k]];
    const am = A.m;
    const x0 = q0[i];
    const y0 = q0[i + 1];
    const z0 = q0[i + 2];
    const nx0 = n0[i];
    const ny0 = n0[i + 1];
    const nz0 = n0[i + 2];
    let px = am[0] * x0 + am[1] * y0 + am[2] * z0 + A.p[0];
    let py = am[3] * x0 + am[4] * y0 + am[5] * z0 + A.p[1];
    let pz = am[6] * x0 + am[7] * y0 + am[8] * z0 + A.p[2];
    let ax = am[0] * nx0 + am[1] * ny0 + am[2] * nz0;
    let ay = am[3] * nx0 + am[4] * ny0 + am[5] * nz0;
    let az = am[6] * nx0 + am[7] * ny0 + am[8] * nz0;
    if (b1[k] >= 0 && w[k] > 0) {
      const C = B[b1[k]];
      const cm = C.m;
      const t = w[k];
      const s = 1 - t;
      const x1 = q1[i];
      const y1 = q1[i + 1];
      const z1 = q1[i + 2];
      px = s * px + t * (cm[0] * x1 + cm[1] * y1 + cm[2] * z1 + C.p[0]);
      py = s * py + t * (cm[3] * x1 + cm[4] * y1 + cm[5] * z1 + C.p[1]);
      pz = s * pz + t * (cm[6] * x1 + cm[7] * y1 + cm[8] * z1 + C.p[2]);
      ax = s * ax + t * (cm[0] * nx0 + cm[1] * ny0 + cm[2] * nz0);
      ay = s * ay + t * (cm[3] * nx0 + cm[4] * ny0 + cm[5] * nz0);
      az = s * az + t * (cm[6] * nx0 + cm[7] * ny0 + cm[8] * nz0);
    }
    const l = Math.hypot(ax, ay, az) || 1;
    pos[i] = px;
    pos[i + 1] = py;
    pos[i + 2] = pz;
    nor[i] = ax / l;
    nor[i + 1] = ay / l;
    nor[i + 2] = az / l;
  }
}

// ---------------------------------------------------------------- muestreo y rayo del cuerpo

const SAMPLE_CACHE = new Map();
function restSamples(du, dv) {
  const key = `${du}x${dv}`;
  if (SAMPLE_CACHE.has(key)) return SAMPLE_CACHE.get(key);
  const out = [];
  PARTS.forEach((part, pi) => {
    const [rx, ry, rw, rh] = part.rect;
    for (let ty = ry; ty < ry + rh; ty += dv)
      for (let tx = rx; tx < rx + rw; tx += du) {
        const [u, v] = texelToUv(part, tx, ty);
        const q = surface(pi, u, v);
        const sk = skinOf(pi, q.y);
        const s = { tx, ty, part: pi, b0: sk.b0, b1: sk.b1, w: sk.w, q0: [q.x, q.y, q.z], q1: null, n: [q.nx, q.ny, q.nz] };
        if (sk.b1 >= 0) {
          const o = REST[sk.b0];
          const t = REST[sk.b1];
          s.q1 = [q.x + o[0] - t[0], q.y + o[1] - t[1], q.z + o[2] - t[2]];
        }
        out.push(s);
      }
  });
  SAMPLE_CACHE.set(key, out);
  return out;
}

/**
 * Puntos de la superficie del cuerpo en el mundo (para el camuflaje y la proyección de los bots).
 * `du`/`dv` son los pasos en texels del atlas. Devuelve [{ x,y,z, nx,ny,nz, tx,ty, part }].
 */
export function sampleBody(state, du = 3, dv = 3) {
  const B = transforms(state).bones;
  const apply = (T, q) => {
    const r = matVec(T.m, q[0], q[1], q[2]);
    return [r[0] + T.p[0], r[1] + T.p[1], r[2] + T.p[2]];
  };
  return restSamples(du, dv).map((s) => {
    const A = B[s.b0];
    let p = apply(A, s.q0);
    let nm = matVec(A.m, s.n[0], s.n[1], s.n[2]);
    if (s.b1 >= 0 && s.w > 0) {
      const C = B[s.b1];
      const p1 = apply(C, s.q1);
      const n1 = matVec(C.m, s.n[0], s.n[1], s.n[2]);
      const k = s.w;
      p = [p[0] + (p1[0] - p[0]) * k, p[1] + (p1[1] - p[1]) * k, p[2] + (p1[2] - p[2]) * k];
      nm = [nm[0] + (n1[0] - nm[0]) * k, nm[1] + (n1[1] - nm[1]) * k, nm[2] + (n1[2] - nm[2]) * k];
      const l = Math.hypot(nm[0], nm[1], nm[2]) || 1;
      nm = [nm[0] / l, nm[1] / l, nm[2] / l];
    }
    return { x: p[0], y: p[1], z: p[2], nx: nm[0], ny: nm[1], nz: nm[2], tx: s.tx, ty: s.ty, part: s.part };
  });
}

/** Rayo contra el cuerpo (la malla deformada): devuelve { t, part, u, v, tx, ty } del choque más cercano o null. */
export function raycastBody(state, ox, oy, oz, dx, dy, dz, maxT = Infinity) {
  const mesh = bodyMesh();
  const pos = new Float32Array(mesh.n * 3);
  const nor = new Float32Array(mesh.n * 3);
  skinBody(mesh, state, pos, nor);
  const idx = mesh.idx;
  let best = null;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3;
    const b = idx[f + 1] * 3;
    const c = idx[f + 2] * 3;
    const e1x = pos[b] - pos[a];
    const e1y = pos[b + 1] - pos[a + 1];
    const e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a];
    const e2y = pos[c + 1] - pos[a + 1];
    const e2z = pos[c + 2] - pos[a + 2];
    // Möller–Trumbore (sin descartar caras: se golpea el cuerpo desde cualquier lado)
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - pos[a];
    const ty = oy - pos[a + 1];
    const tz = oz - pos[a + 2];
    const bu = (tx * px + ty * py + tz * pz) * inv;
    if (bu < 0 || bu > 1) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const bv = (dx * qx + dy * qy + dz * qz) * inv;
    if (bv < 0 || bu + bv > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t < 0 || t >= (best?.t ?? maxT)) continue;
    const i0 = idx[f] * 2;
    const i1 = idx[f + 1] * 2;
    const i2 = idx[f + 2] * 2;
    const w0 = 1 - bu - bv;
    const au = mesh.uv[i0] * w0 + mesh.uv[i1] * bu + mesh.uv[i2] * bv;
    const av = mesh.uv[i0 + 1] * w0 + mesh.uv[i1 + 1] * bu + mesh.uv[i2 + 1] * bv;
    best = { t, au, av };
  }
  if (!best) return null;
  const tx = Math.min(ATLAS - 1, Math.max(0, Math.floor(best.au * ATLAS)));
  const ty = Math.min(ATLAS - 1, Math.max(0, Math.floor((1 - best.av) * ATLAS)));
  const part = atlasOwner()[ty * ATLAS + tx];
  if (part < 0) return null;
  const [u, v] = texelToUv(PARTS[part], tx, ty);
  return { t: best.t, part, u, v, tx, ty };
}

/** El punto del cuerpo más cercano a (px,py,pz): { x,y,z, d } (para validar capturas). Usa los proxies de colisión. */
export function closestBodyPoint(state, px, py, pz) {
  const tf = transforms(state).parts;
  let best = null;
  PARTS.forEach((part, pi) => {
    const t = tf[pi];
    let ax;
    let bx;
    let r;
    if (part.shape === 'sph') {
      ax = bx = matVecAdd(t, part.c);
      r = part.r;
    } else if (part.shape === 'cap') {
      ax = matVecAdd(t, part.a);
      bx = matVecAdd(t, part.b);
      r = part.r;
    } else {
      ax = bx = matVecAdd(t, part.c);
      r = Math.max(part.s[0], part.s[1], part.s[2]) / 2;
    }
    const q = closestOnSeg(px, py, pz, ax, bx);
    const d = Math.max(0, Math.sqrt((px - q[0]) ** 2 + (py - q[1]) ** 2 + (pz - q[2]) ** 2) - r);
    if (!best || d < best.d) {
      // punto sobre la superficie, hacia quien pregunta
      const dd = Math.sqrt((px - q[0]) ** 2 + (py - q[1]) ** 2 + (pz - q[2]) ** 2) || 1;
      best = { d, x: q[0] + ((px - q[0]) / dd) * r, y: q[1] + ((py - q[1]) / dd) * r, z: q[2] + ((pz - q[2]) / dd) * r };
    }
  });
  return best;
}
const matVecAdd = (t, v) => {
  const r = matVec(t.m, v[0], v[1], v[2]);
  return [t.p[0] + r[0], t.p[1] + r[1], t.p[2] + r[2]];
};
function closestOnSeg(px, py, pz, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + abx * t, a[1] + aby * t, a[2] + abz * t];
}

/** Posición del centro de la cabeza en el mundo (origen del silbido, cartel del nombre). */
export function headPos(state) {
  const tf = transforms(state);
  const t = tf.parts[0];
  return matVecAdd(t, PARTS[0].c);
}
