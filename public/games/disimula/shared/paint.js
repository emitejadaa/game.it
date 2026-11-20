/**
 * Disimulá — sistema de pintura compartido (JS puro, sin canvas).
 *
 * El atlas es un Uint8ClampedArray RGBA de 128×128: alfa 0 = sin pintar (se ve el blanco
 * del maniquí), alfa 255 = pintado. La pintura viaja como OPERACIONES chicas (pinceladas,
 * balde, patrones) que caben en el límite de 2 KB por mensaje del servidor; el servidor
 * aplica las mismas operaciones y el atlas que queda es la autoridad (sirve para el
 * camuflaje, los bots y para mandar el estado final comprimido con paleta ≤ 64 + RLE).
 *
 * Operaciones (arrays JSON):
 *   ['b', size, soft, color, pts, cont]              pincel (color entero 0xRRGGBB, pts [x,y,…])
 *   ['e', size, pts, cont]                           goma
 *   ['p', size, pat, scale, rot, colA, colB, pts, cont]  pincel de patrón
 *   ['f', region, color]                             balde por región
 *   ['F', region, pat, scale, rot, colA, colB]       balde con patrón
 *   ['P', seed, level, x, y, z, …]                   proyección de un bot (determinista)
 * `cont` = 1 marca que la operación continúa el trazo anterior (deshacer saca el trazo entero).
 */
import { ATLAS, BASE_COLOR, PARTS, REGIONS, atlasOwner, texelToUv, inRegion, sampleBody } from './body.js';
import { raycastColor, lambert } from './maps.js';
import { rng } from './geom.js';

export const BRUSH_SIZES = [1.2, 2.4, 4, 6.5]; // radios en texels
export const MAX_PTS = 48; // pares x,y por operación
export const UNDO_STEPS = 30;

// Patrones de pintura (para imitar superficies con dibujo): 2 colores, escala y rotación.
export const PAINT_PATTERNS = ['stripes', 'checker', 'dots', 'bricks', 'noise'];
function patColor(pat, x, y, scale, rot, a, b) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const u = (x * c - y * s) / scale;
  const v = (x * s + y * c) / scale;
  switch (pat) {
    case 0: return ((Math.floor(u) % 2) + 2) % 2 ? a : b;
    case 1: return (((Math.floor(u) + Math.floor(v)) % 2) + 2) % 2 ? a : b;
    case 2: {
      const fu = u - Math.floor(u) - 0.5;
      const fv = v - Math.floor(v) - 0.5;
      return fu * fu + fv * fv < 0.09 ? a : b;
    }
    case 3: {
      const row = Math.floor(v);
      const uu = u + (((row % 2) + 2) % 2) * 0.5;
      return uu - Math.floor(uu) < 0.07 || v - Math.floor(v) < 0.14 ? b : a;
    }
    default: {
      let h = (Math.floor(u * 2) * 374761393 + Math.floor(v * 2) * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296 < 0.5 ? a : b;
    }
  }
}

const int2rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const rgb2int = (r, g, b) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const okPts = (pts, max = MAX_PTS) => Array.isArray(pts) && pts.length >= 2 && pts.length <= max * 2 && pts.length % 2 === 0 && pts.every((v) => isInt(v, 0, ATLAS - 1));

/** ¿La operación está bien formada? (tipos, rangos y tamaños; el servidor descarta lo inválido). */
export function validateOp(op) {
  if (!Array.isArray(op) || typeof op[0] !== 'string') return false;
  const [t] = op;
  if (t === 'b') return op.length === 6 && isInt(op[1], 0, 3) && isInt(op[2], 0, 1) && isInt(op[3], 0, 0xffffff) && okPts(op[4]) && isInt(op[5], 0, 1);
  if (t === 'e') return op.length === 4 && isInt(op[1], 0, 3) && okPts(op[2]) && isInt(op[3], 0, 1);
  if (t === 'p')
    return op.length === 9 && isInt(op[1], 0, 3) && isInt(op[2], 0, PAINT_PATTERNS.length - 1) && isInt(op[3], 2, 40) && isInt(op[4], 0, 7) && isInt(op[5], 0, 0xffffff) && isInt(op[6], 0, 0xffffff) && okPts(op[7]) && isInt(op[8], 0, 1);
  if (t === 'f') return op.length === 3 && isInt(op[1], 0, REGIONS.length - 1) && isInt(op[2], 0, 0xffffff);
  if (t === 'F') return op.length === 7 && isInt(op[1], 0, REGIONS.length - 1) && isInt(op[2], 0, PAINT_PATTERNS.length - 1) && isInt(op[3], 2, 40) && isInt(op[4], 0, 7) && isInt(op[5], 0, 0xffffff) && isInt(op[6], 0, 0xffffff);
  if (t === 'P') return op.length === 6 && isInt(op[1], 0, 2 ** 31) && isInt(op[2], 1, 3) && op.slice(3).every((v) => Number.isFinite(v) && Math.abs(v) < 100);
  if (t === 'c') return op.length === 1; // borrar todo
  return false;
}

export class Paint {
  constructor() {
    this.data = new Uint8ClampedArray(ATLAS * ATLAS * 4);
    this.ops = [];
    this.redoStack = [];
    this.dirty = null; // [x0, y0, x1, y1] desde la última vez que lo pidieron
  }

  touch(x0, y0, x1, y1) {
    if (!this.dirty) this.dirty = [x0, y0, x1, y1];
    else {
      this.dirty[0] = Math.min(this.dirty[0], x0);
      this.dirty[1] = Math.min(this.dirty[1], y0);
      this.dirty[2] = Math.max(this.dirty[2], x1);
      this.dirty[3] = Math.max(this.dirty[3], y1);
    }
  }
  takeDirty() {
    const d = this.dirty;
    this.dirty = null;
    return d;
  }

  /**
   * Aplica una operación validada. `ctx` = { state, map } hace falta solo para 'P'.
   * Devuelve true si la aplicó. Las operaciones nuevas borran el historial de rehacer.
   */
  apply(op, ctx, replaying = false) {
    if (!this.raster(op, ctx)) return false;
    if (!replaying) {
      this.ops.push(op);
      this.redoStack.length = 0;
      if (this.ops.length > 900) this.ops.splice(0, 300); // tope de memoria: lo más viejo ya no se deshace
    }
    return true;
  }

  raster(op, ctx) {
    const t = op[0];
    if (t === 'b') return this.stroke(op[4], BRUSH_SIZES[op[1]], (x, y) => int2rgb(op[3]), op[2]);
    if (t === 'e') return this.stroke(op[2], BRUSH_SIZES[op[1]], null, 0);
    if (t === 'p') {
      const a = int2rgb(op[5]);
      const b = int2rgb(op[6]);
      return this.stroke(op[7], BRUSH_SIZES[op[1]], (x, y) => patColor(op[2], x, y, op[3], (op[4] * Math.PI) / 8, a, b), 0);
    }
    if (t === 'f') return this.fillRegion(op[1], () => int2rgb(op[2]));
    if (t === 'F') {
      const a = int2rgb(op[5]);
      const b = int2rgb(op[6]);
      return this.fillRegion(op[1], (x, y) => patColor(op[2], x, y, op[3], (op[4] * Math.PI) / 8, a, b));
    }
    if (t === 'P') return ctx ? (projectRaster(this, ctx.state, ctx.map, op), true) : false;
    if (t === 'c') {
      this.data.fill(0);
      this.touch(0, 0, ATLAS - 1, ATLAS - 1);
      return true;
    }
    return false;
  }

  /** Pinta una polilínea con un pincel. `colorFn(x, y)` → [r,g,b]; null = goma. `soft` difumina el borde. */
  stroke(pts, radius, colorFn, soft) {
    const owner = atlasOwner();
    const startPart = owner[pts[1] * ATLAS + pts[0]];
    if (startPart < 0) return true; // fuera del cuerpo: no hace nada (pero no es inválido)
    const part = PARTS[startPart];
    const [rx, ry, rw, rh] = part.rect;
    const wrap = true; // todas las partes son superficies de revolución (los pies también): la u envuelve y no hay costura atrás
    const stamp = (cx, cy) => {
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++) {
        const y = cy + dy;
        if (y < ry || y >= ry + rh) continue;
        for (let dx = -r; dx <= r; dx++) {
          let x = cx + dx;
          if (wrap) x = rx + ((((x - rx) % rw) + rw) % rw); // la u envuelve: sin costura atrás
          if (x < rx || x >= rx + rw) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > radius) continue;
          const i = (y * ATLAS + x) * 4;
          if (!colorFn) {
            this.data[i + 3] = 0;
            continue;
          }
          const c = colorFn(x, y);
          let a = 1;
          if (soft) a = Math.min(1, Math.max(0, 1.25 - d / radius));
          if (a >= 0.995 || !this.data[i + 3]) {
            const br = this.data[i + 3] ? this.data[i] : BASE_COLOR[0];
            const bg = this.data[i + 3] ? this.data[i + 1] : BASE_COLOR[1];
            const bb = this.data[i + 3] ? this.data[i + 2] : BASE_COLOR[2];
            this.data[i] = br + (c[0] - br) * a;
            this.data[i + 1] = bg + (c[1] - bg) * a;
            this.data[i + 2] = bb + (c[2] - bb) * a;
          } else {
            this.data[i] += (c[0] - this.data[i]) * a;
            this.data[i + 1] += (c[1] - this.data[i + 1]) * a;
            this.data[i + 2] += (c[2] - this.data[i + 2]) * a;
          }
          this.data[i + 3] = 255;
        }
      }
      this.touch(Math.max(rx, cx - r - 1), Math.max(ry, cy - r - 1), Math.min(rx + rw - 1, cx + r + 1), Math.min(ry + rh - 1, cy + r + 1));
      if (wrap) this.touch(rx, Math.max(ry, cy - r - 1), rx + rw - 1, Math.min(ry + rh - 1, cy + r + 1));
    };
    let px = pts[0];
    let py = pts[1];
    stamp(px, py);
    for (let i = 2; i < pts.length; i += 2) {
      const qx = pts[i];
      const qy = pts[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(qx - px, qy - py)));
      for (let s = 1; s <= steps; s++) stamp(Math.round(px + ((qx - px) * s) / steps), Math.round(py + ((qy - py) * s) / steps));
      px = qx;
      py = qy;
    }
    return true;
  }

  fillRegion(regionIdx, colorFn) {
    const reg = REGIONS[regionIdx];
    if (!reg) return false;
    for (const pid of reg.parts) {
      const part = PARTS.find((p) => p.id === pid);
      const [rx, ry, rw, rh] = part.rect;
      for (let y = ry; y < ry + rh; y++)
        for (let x = rx; x < rx + rw; x++) {
          const [u, v] = texelToUv(part, x, y);
          if (!inRegion(reg, pid, u, v)) continue;
          const i = (y * ATLAS + x) * 4;
          const c = colorFn(x, y);
          this.data[i] = c[0];
          this.data[i + 1] = c[1];
          this.data[i + 2] = c[2];
          this.data[i + 3] = 255;
        }
      this.touch(rx, ry, rx + rw - 1, ry + rh - 1);
    }
    return true;
  }

  /** Deshace el último trazo (las operaciones encadenadas con cont=1 caen juntas). */
  undo(ctx) {
    if (!this.ops.length) return false;
    const group = [];
    do group.unshift(this.ops.pop());
    while (this.ops.length && !['f', 'F', 'P', 'c'].includes(group[0][0]) && group[0][group[0].length - 1] === 1);
    this.redoStack.push(group);
    if (this.redoStack.length > UNDO_STEPS) this.redoStack.shift();
    this.rebuild(ctx);
    return true;
  }

  redo(ctx) {
    const group = this.redoStack.pop();
    if (!group) return false;
    for (const op of group) {
      this.raster(op, ctx);
      this.ops.push(op);
    }
    return true;
  }

  rebuild(ctx) {
    this.data.fill(0);
    for (const op of this.ops) this.raster(op, ctx);
    this.touch(0, 0, ATLAS - 1, ATLAS - 1);
  }

  clear() {
    this.data.fill(0);
    this.ops.length = 0;
    this.redoStack.length = 0;
    this.touch(0, 0, ATLAS - 1, ATLAS - 1);
  }

  /** Color visible de un texel (pintura o el blanco de base). */
  colorAt(tx, ty) {
    const i = (ty * ATLAS + tx) * 4;
    return this.data[i + 3] ? [this.data[i], this.data[i + 1], this.data[i + 2]] : BASE_COLOR;
  }
}

// ---------------------------------------------------------------- códec (paleta ≤ 64 + RLE + base64)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? B64[c & 63] : '=');
  }
  return out;
}
export function b64ToBytes(str) {
  const inv = {};
  for (let i = 0; i < 64; i++) inv[B64[i]] = i;
  const clean = str.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = inv[clean[i]] || 0;
    const b = inv[clean[i + 1]] || 0;
    const c = inv[clean[i + 2]] || 0;
    const d = inv[clean[i + 3]] || 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

/**
 * Comprime el atlas: { p: [enteros 0xRRGGBB…], d: base64 } con índice 0 = sin pintar.
 * Si hay más de 63 colores, los menos usados se acercan al más parecido de la paleta
 * (con los pinceles duros y los patrones el viaje de ida y vuelta es sin pérdida).
 */
export function serializePaint(data) {
  const counts = new Map();
  for (let i = 0; i < ATLAS * ATLAS; i++) {
    if (!data[i * 4 + 3]) continue;
    const key = rgb2int(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 63).map((e) => e[0]);
  const palRgb = palette.map(int2rgb);
  const index = new Map(palette.map((c, i) => [c, i + 1]));
  const nearest = (r, g, b) => {
    let bi = 1;
    let bd = Infinity;
    for (let i = 0; i < palRgb.length; i++) {
      const p = palRgb[i];
      const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
      if (d < bd) {
        bd = d;
        bi = i + 1;
      }
    }
    return bi;
  };
  const bytes = [];
  let run = 0;
  let cur = -1;
  const push = () => {
    while (run > 0) {
      const n = Math.min(255, run);
      bytes.push(n, cur);
      run -= n;
    }
  };
  for (let i = 0; i < ATLAS * ATLAS; i++) {
    let idx = 0;
    if (data[i * 4 + 3]) {
      const key = rgb2int(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      idx = index.get(key) ?? nearest(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    }
    if (idx === cur) run++;
    else {
      push();
      cur = idx;
      run = 1;
    }
  }
  push();
  return { p: palette, d: bytesToB64(Uint8Array.from(bytes)) };
}

/** Descomprime a un Uint8ClampedArray RGBA (o al `out` que le pasen). */
export function deserializePaint(packed, out) {
  const data = out || new Uint8ClampedArray(ATLAS * ATLAS * 4);
  data.fill(0);
  if (!packed || !Array.isArray(packed.p) || typeof packed.d !== 'string') return data;
  const pal = packed.p.slice(0, 63).map((c) => int2rgb(c & 0xffffff));
  const bytes = b64ToBytes(packed.d);
  let o = 0;
  for (let i = 0; i + 1 < bytes.length && o < ATLAS * ATLAS; i += 2) {
    const run = bytes[i];
    const idx = bytes[i + 1];
    for (let k = 0; k < run && o < ATLAS * ATLAS; k++, o++) {
      if (idx > 0 && idx <= pal.length) {
        const c = pal[idx - 1];
        data[o * 4] = c[0];
        data[o * 4 + 1] = c[1];
        data[o * 4 + 2] = c[2];
        data[o * 4 + 3] = 255;
      }
    }
  }
  return data;
}

/** ¿El paquete comprimido tiene una pinta razonable? (validación del servidor). */
export const validPacked = (p) => p && typeof p === 'object' && Array.isArray(p.p) && p.p.length <= 63 && p.p.every((c) => isInt(c, 0, 0xffffff)) && typeof p.d === 'string' && p.d.length <= 26000;

// ---------------------------------------------------------------- proyección (pintado de los bots)
/**
 * Pinta el cuerpo copiando lo que hay detrás visto desde `vp` (la mecánica de los bots):
 * para cada texel, un rayo desde el punto de vista que pasa por ese punto del cuerpo
 * sigue de largo hasta el escenario y copia su color compensando la luz del cuerpo.
 * Determinista (mismo estado + mismo op → mismos texels en el servidor y en el cliente).
 */
export function projectRaster(paint, state, map, op) {
  const [, seed, level, vx, vy, vz] = op;
  const rnd = rng(seed);
  const samples = sampleBody(state, 1, 1);
  const regionSum = {};
  for (const s of samples) {
    const dx = s.x - vx;
    const dy = s.y - vy;
    const dz = s.z - vz;
    const len = Math.hypot(dx, dy, dz) || 1;
    const hit = raycastColor(map, s.x + (dx / len) * 0.06, s.y + (dy / len) * 0.06, s.z + (dz / len) * 0.06, dx / len, dy / len, dz / len, 30);
    if (!hit) continue;
    // el cuerpo recibe su propia luz: se compensa para que el color visto coincida
    const kBody = Math.max(0.3, lambert(s.nx, s.ny, s.nz));
    let r = hit.lit[0] / kBody;
    let g = hit.lit[1] / kBody;
    let b = hit.lit[2] / kBody;
    if (level === 1) {
      const acc = (regionSum[PARTS[s.part].region] ||= [0, 0, 0, 0]);
      acc[0] += r;
      acc[1] += g;
      acc[2] += b;
      acc[3]++;
      continue;
    }
    const noise = level === 2 ? 16 : 6;
    // cuantizado a pasos de 10: el atlas comprimido queda chico y el ojo no lo nota
    const q = (v) => Math.max(0, Math.min(255, Math.round((v + (rnd() - 0.5) * noise) / 10) * 10));
    const i = (s.ty * ATLAS + s.tx) * 4;
    paint.data[i] = q(r);
    paint.data[i + 1] = q(g);
    paint.data[i + 2] = q(b);
    paint.data[i + 3] = 255;
  }
  if (level === 1) {
    // fácil: un color promedio por región, con un error fijo por región
    REGIONS.forEach((reg, i) => {
      const s = regionSum[reg.id];
      if (!s || reg.u || reg.uOut) return;
      const jr = (rnd() - 0.5) * 44;
      const jg = (rnd() - 0.5) * 44;
      const jb = (rnd() - 0.5) * 44;
      const c = [Math.round(s[0] / s[3] + jr), Math.round(s[1] / s[3] + jg), Math.round(s[2] / s[3] + jb)];
      paint.fillRegion(i, () => c);
    });
  }
  paint.touch(0, 0, ATLAS - 1, ATLAS - 1);
}
