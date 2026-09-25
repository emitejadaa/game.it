/**
 * Drift Neon — dibujo (canvas 2D).
 *
 * La pista se parte en tramos con su caja: solo se dibujan los tramos a la vista (y la vista
 * puede estar girada, con cámara que sigue al auto). Cada tema tiene su piso y su decoración
 * (edificios, contenedores, mar y palmeras, pinos, nieve, tribunas…), generada una sola vez con
 * semilla fija. Las marcas de derrape se guardan como segmentos en un buffer circular.
 */
import { THEMES } from './tracks.js';

const TAU = Math.PI * 2;
const ROCK = { desert: '#6e3a36', canyon: '#6a2a1c', volcano: '#2b2224', moon: '#2c2d36' };
const CHUNK = 40; // puntos de la línea central por tramo
const TILE = 512; // lado de cada mosaico del fondo (unidades del mundo)
const MAX_TILES = 110;

const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- geometría de la pista
export function prepare(T) {
  if (T.geo) return T.geo;
  const hw = T.width / 2;
  const N = T.N;
  const chunks = [];
  for (let c0 = 0; c0 < N; c0 += CHUNK) {
    const c1 = Math.min(N, c0 + CHUNK);
    const surf = new Path2D();
    const left = new Path2D();
    const right = new Path2D();
    const center = new Path2D();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const L = [];
    const Rr = [];
    for (let i = c0; i <= c1; i++) {
      const k = i % N;
      const nx = -T.ty[k];
      const ny = T.tx[k];
      const lx = T.xs[k] - nx * hw;
      const ly = T.ys[k] - ny * hw;
      const rx = T.xs[k] + nx * hw;
      const ry = T.ys[k] + ny * hw;
      L.push([lx, ly]);
      Rr.push([rx, ry]);
      x0 = Math.min(x0, lx, rx);
      y0 = Math.min(y0, ly, ry);
      x1 = Math.max(x1, lx, rx);
      y1 = Math.max(y1, ly, ry);
      if (i === c0) {
        left.moveTo(lx, ly);
        right.moveTo(rx, ry);
        center.moveTo(T.xs[k], T.ys[k]);
      } else {
        left.lineTo(lx, ly);
        right.lineTo(rx, ry);
        center.lineTo(T.xs[k], T.ys[k]);
      }
    }
    surf.moveTo(L[0][0], L[0][1]);
    for (const p of L) surf.lineTo(p[0], p[1]);
    for (let i = Rr.length - 1; i >= 0; i--) surf.lineTo(Rr[i][0], Rr[i][1]);
    surf.closePath();
    // pianos en las curvas cerradas (del lado de adentro y de afuera)
    const curbs = [];
    for (let i = c0; i < c1; i += 2) {
      const k = i % N;
      if (Math.abs(T.curv[k]) < 1 / 520) continue;
      const side = Math.sign(T.curv[k]); // interior
      for (const s of [side, -side]) {
        const nx = -T.ty[k] * s;
        const ny = T.tx[k] * s;
        const k2 = (k + 2) % N;
        const nx2 = -T.ty[k2] * s;
        const ny2 = T.tx[k2] * s;
        curbs.push([T.xs[k] + nx * hw, T.ys[k] + ny * hw, T.xs[k] + nx * (hw - 14), T.ys[k] + ny * (hw - 14), T.xs[k2] + nx2 * (hw - 14), T.ys[k2] + ny2 * (hw - 14), T.xs[k2] + nx2 * hw, T.ys[k2] + ny2 * hw, (i >> 1) & 1]);
      }
    }
    // cama de grava del lado de afuera de las curvas cerradas (debajo de todo)
    let runoff = null;
    for (let i = c0; i < c1; i++) {
      const k = i % N;
      const k2 = (k + 1) % N;
      if (Math.abs(T.curv[k]) < 1 / 520 || Math.abs(T.curv[k2]) < 1 / 520) continue;
      const s = -Math.sign(T.curv[k]);
      const wOut = (a) => hw + 14 + Math.min(150, 40 + 26000 * Math.abs(T.curv[a]));
      runoff ||= new Path2D();
      const q = [k, k2].map((a) => [-T.ty[a] * s, T.tx[a] * s, a]);
      runoff.moveTo(T.xs[k] + q[0][0] * hw, T.ys[k] + q[0][1] * hw);
      runoff.lineTo(T.xs[k] + q[0][0] * wOut(k), T.ys[k] + q[0][1] * wOut(k));
      runoff.lineTo(T.xs[k2] + q[1][0] * wOut(k2), T.ys[k2] + q[1][1] * wOut(k2));
      runoff.lineTo(T.xs[k2] + q[1][0] * hw, T.ys[k2] + q[1][1] * hw);
      runoff.closePath();
    }
    chunks.push({ surf, left, right, center, curbs, runoff, box: [x0 - 200, y0 - 200, x1 + 200, y1 + 200] });
  }
  // grilla de la línea central para medir distancias rápido (decoración)
  const cell = 260;
  const grid = new Map();
  for (let i = 0; i < N; i++) {
    const key = `${Math.floor(T.xs[i] / cell)},${Math.floor(T.ys[i] / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  const distTo = (x, y) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    let best = Infinity;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++) {
        const list = grid.get(`${gx + a},${gy + b}`);
        if (!list) continue;
        for (const i of list) {
          const d = (T.xs[i] - x) ** 2 + (T.ys[i] - y) ** 2;
          if (d < best) best = d;
        }
      }
    return Math.sqrt(best);
  };
  T.geo = { chunks, distTo, decos: decorate(T, distTo) };
  return T.geo;
}

/** La recta más larga (para la pista de aterrizaje). */
function longestStraight(T) {
  let best = null;
  let i0 = -1;
  for (let i = 0; i <= T.N; i++) {
    const straight = i < T.N && Math.abs(T.curv[i]) < 1 / 6000;
    if (straight && i0 < 0) i0 = i;
    if (!straight && i0 >= 0) {
      const len = T.dist[i - 1] - T.dist[i0];
      if (!best || len > best.len) best = { i0, i1: i - 1, len };
      i0 = -1;
    }
  }
  return best;
}

/** Punto más lejos de la pista dentro del recuadro (para el cráter). */
function emptiest(T, distTo, step = 120) {
  const B = T.bounds;
  let best = { x: B.x + B.w / 2, y: B.y + B.h / 2, d: 0 };
  for (let y = B.y + 200; y < B.y + B.h - 200; y += step)
    for (let x = B.x + 200; x < B.x + B.w - 200; x += step) {
      const d = distTo(x, y);
      if (d > best.d) best = { x, y, d };
    }
  return best;
}

/** Polígono irregular alrededor de (0,0). */
function blob(rnd, r, n = 9, jitter = 0.3) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rnd() - 0.5) * 0.4;
    const k = r * (1 - jitter + rnd() * jitter * 1.4);
    pts.push([Math.cos(a) * k, Math.sin(a) * k]);
  }
  return pts;
}

// ---------------------------------------------------------------- decoración por tema
function decorate(T, distTo) {
  const rnd = mulberry(T.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  const B = T.bounds;
  const hw = T.width / 2;
  const out = [];
  const box = (x, y, r) => [x - r, y - r, x + r, y + r];
  const scatter = (step, minD, maxD, make) => {
    for (let y = B.y - 900; y < B.y + B.h + 900; y += step)
      for (let x = B.x - 900; x < B.x + B.w + 900; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.8;
        const py = y + (rnd() - 0.5) * step * 0.8;
        const d = distTo(px, py);
        if (d < minD || d > maxD) continue;
        const o = make(px, py, d);
        if (o) out.push(o);
      }
  };
  // luces a los costados de la pista
  const lamps = (every, color) => {
    for (let i = 0; i < T.N; i += Math.round(every / 14)) {
      if (Math.abs(T.curv[i]) > 1 / 520) continue;
      for (const s of [-1, 1]) {
        const x = T.xs[i] - T.ty[i] * s * (hw + 34);
        const y = T.ys[i] + T.tx[i] * s * (hw + 34);
        if (distTo(x, y) < hw + 20) continue;
        out.push({ t: 'lamp', x, y, c: color, b: box(x, y, 50) });
      }
    }
  };
  const [c1, c2] = T.colors;
  switch (T.theme) {
    case 'city':
    case 'tokyo': {
      const dense = T.theme === 'tokyo';
      scatter(dense ? 170 : 230, hw + 90, 1400, (x, y) => {
        const w = (dense ? 60 : 80) + rnd() * (dense ? 110 : 150);
        const h = (dense ? 60 : 80) + rnd() * (dense ? 110 : 150);
        if (distTo(x, y) < hw + 40 + Math.max(w, h) * 0.72) return null;
        return { t: 'bld', x: x - w / 2, y: y - h / 2, w, h, c: rnd() < 0.5 ? c1 : c2, win: Math.floor(rnd() * 1000), sign: dense && rnd() < 0.5, b: [x - w / 2 - 8, y - h / 2 - 8, x + w / 2 + 8, y + h / 2 + 8] };
      });
      lamps(dense ? 240 : 320, dense ? '#ff9ae8' : '#9fe9ff');
      break;
    }
    case 'bridge':
      for (let i = 0; i < T.N; i += 22) out.push({ t: 'pillar', under: 1, x: T.xs[i], y: T.ys[i], a: Math.atan2(T.ty[i], T.tx[i]), w: T.width + 50, b: box(T.xs[i], T.ys[i], T.width) });
      scatter(260, hw + 220, 2400, (x, y) => (rnd() < 0.35 ? { t: 'glint', live: 1, x, y, s: 2 + rnd() * 4, c: rnd() < 0.5 ? c1 : c2, ph: rnd() * TAU, b: box(x, y, 10) } : null));
      lamps(360, '#9fe9ff');
      break;
    case 'desert':
      scatter(520, hw + 260, 2400, (x, y) => ({ t: 'dune', under: 1, x, y, rx: 160 + rnd() * 260, ry: 60 + rnd() * 90, a: rnd() * 0.6 - 0.3, b: box(x, y, 420) }));
      scatter(150, hw + 60, 1600, (x, y) => (rnd() < 0.45 ? (rnd() < 0.6 ? { t: 'cactus', x, y, s: 10 + rnd() * 12, b: box(x, y, 40) } : { t: 'rock', x, y, s: 12 + rnd() * 26, a: rnd() * TAU, b: box(x, y, 40) }) : null));
      break;
    case 'port': {
      scatter(210, hw + 80, 1500, (x, y) => {
        if (rnd() < 0.3) return null;
        const horiz = rnd() < 0.5;
        const n = 1 + Math.floor(rnd() * 3);
        const w = horiz ? 120 : 40;
        const h = horiz ? 40 : 120;
        const tw = horiz ? w : w * n + 4 * (n - 1);
        const th = horiz ? h * n + 4 * (n - 1) : h;
        if (distTo(x, y) < hw + 50 + Math.max(tw, th) * 0.7) return null;
        const cols = ['#ff7a2f', '#1f6fd6', '#e2262d', '#138a45', '#ffb800', '#6b2cb8'];
        return { t: 'box', x: x - tw / 2, y: y - th / 2, w, h, n, horiz, c: cols[Math.floor(rnd() * cols.length)], b: [x - tw / 2, y - th / 2, x + tw / 2, y + th / 2] };
      });
      scatter(700, hw + 260, 1800, (x, y) => (rnd() < 0.35 ? { t: 'crane', x, y, a: rnd() * TAU, b: box(x, y, 260) } : null));
      lamps(300, '#ffd27a');
      break;
    }
    case 'coast': {
      // mar al sur de la pista, playa y palmeras
      const seaY = B.y + B.h + 60;
      out.push({ t: 'sea', big: 1, y: seaY, b: [-1e5, seaY - 200, 1e5, 1e5] });
      scatter(170, hw + 50, 1300, (x, y) => (y < seaY - 60 && rnd() < 0.5 ? { t: 'palm', x, y, s: 16 + rnd() * 12, a: rnd() * TAU, b: box(x, y, 60) } : null));
      lamps(340, '#ffd27a');
      break;
    }
    case 'mountain':
    case 'snow': {
      const snow = T.theme === 'snow';
      scatter(95, hw + 45, 1400, (x, y, d) => {
        if (rnd() < (d < hw + 200 ? 0.35 : 0.1)) return null;
        return { t: 'pine', x, y, s: 16 + rnd() * 22, snow, b: box(x, y, 60) };
      });
      scatter(260, hw + 60, 1200, (x, y) => (rnd() < 0.3 ? { t: 'rock', x, y, s: 14 + rnd() * 30, a: rnd() * TAU, snow, b: box(x, y, 50) } : null));
      break;
    }
    case 'cyber': {
      // tribunas en las rectas largas
      for (let i = 0; i < T.N; i += 18) {
        if (Math.abs(T.curv[i]) > 1 / 3000) continue;
        for (const s of [-1, 1]) {
          const x = T.xs[i] - T.ty[i] * s * (hw + 120);
          const y = T.ys[i] + T.tx[i] * s * (hw + 120);
          if (distTo(x, y) < hw + 90) continue;
          out.push({ t: 'stand', x, y, a: Math.atan2(T.ty[i], T.tx[i]), c: c1, b: box(x, y, 160) });
        }
      }
      scatter(600, hw + 260, 1500, (x, y) => (rnd() < 0.4 ? { t: 'tower', x, y, b: box(x, y, 200) } : null));
      break;
    }
    case 'airport': {
      // pista de aterrizaje debajo de la recta más larga
      const run = longestStraight(T);
      if (run && run.len > 1500) {
        const ax = T.xs[run.i0];
        const ay = T.ys[run.i0];
        const bx = T.xs[run.i1];
        const by = T.ys[run.i1];
        const len = run.len + 500;
        const w = T.width + 480;
        const r = Math.hypot(len, w) / 2;
        out.push({ t: 'runway', under: 1, x: (ax + bx) / 2, y: (ay + by) / 2, a: Math.atan2(by - ay, bx - ax), len, w, b: box((ax + bx) / 2, (ay + by) / 2, r) });
      }
      scatter(620, hw + 420, 1900, (x, y, d) => {
        if (rnd() < 0.55) return null;
        if (rnd() < 0.5) {
          const w = 260 + rnd() * 160;
          const h = 180 + rnd() * 80;
          if (d < hw + 60 + Math.hypot(w, h) / 2) return null;
          return { t: 'hangar', x, y, w, h, a: Math.round(rnd() * 4) * (Math.PI / 2), b: box(x, y, Math.hypot(w, h) / 2 + 10) };
        }
        return { t: 'plane', x, y, a: rnd() * TAU, s: 0.8 + rnd() * 0.5, c: rnd() < 0.5 ? c1 : c2, b: box(x, y, 170) };
      });
      lamps(240, '#5aa0ff');
      break;
    }
    case 'canyon': {
      scatter(430, hw + 200, 2200, (x, y, d) => {
        const r = 150 + rnd() * 330;
        if (d < hw + 70 + r * 1.15 || rnd() < 0.25) return null;
        return { t: 'mesa', x, y, r, pts: blob(rnd, r), b: box(x, y, r * 1.2) };
      });
      scatter(140, hw + 50, 1500, (x, y) => (rnd() < 0.5 ? (rnd() < 0.55 ? { t: 'rock', x, y, s: 10 + rnd() * 24, a: rnd() * TAU, b: box(x, y, 36) } : { t: 'shrub', x, y, s: 7 + rnd() * 8, b: box(x, y, 26) }) : null));
      break;
    }
    case 'forest': {
      // río que cruza la pista (dos puentes)
      const cx = B.x + B.w * 0.62;
      const rx = (y) => cx + Math.sin(y / 700) * 260 + Math.sin(y / 310) * 80;
      const pts = [];
      for (let y = B.y - 1000; y <= B.y + B.h + 1000; y += 60) pts.push([rx(y), y]);
      const rw = 240;
      // la corriente animada no se dibuja sobre los puentes
      const runs = [];
      let cur = null;
      for (const p of pts) {
        if (distTo(p[0], p[1]) > hw + 90) (cur ||= []).push(p);
        else if (cur) {
          runs.push(cur);
          cur = null;
        }
      }
      if (cur) runs.push(cur);
      out.push({ t: 'river', big: 1, under: 1, pts, runs, w: rw, b: [cx - 600, B.y - 1000, cx + 600, B.y + B.h + 1000] });
      const tones = ['#0f4a2a', '#135836', '#1a6a3e', '#0d3f2c'];
      scatter(82, hw + 40, 1500, (x, y, d) => {
        if (Math.abs(x - rx(y)) < rw / 2 + 40) return null;
        if (rnd() < (d < hw + 180 ? 0.55 : 0.18)) return null;
        return { t: 'tree', x, y, s: 20 + rnd() * 26, c: tones[Math.floor(rnd() * tones.length)], k: rnd(), b: box(x, y, 70) };
      });
      scatter(170, hw + 30, 600, (x, y) => (rnd() < 0.3 ? { t: 'fly', live: 1, x, y, ph: rnd() * TAU, b: box(x, y, 14) } : null));
      lamps(460, '#ffe27a');
      break;
    }
    case 'volcano': {
      // cráter con lava donde hay más lugar, y ríos de lava que salen de él
      const e = emptiest(T, distTo);
      const r = Math.max(260, Math.min(1000, e.d - hw - 170));
      out.push({ t: 'lava', under: 1, x: e.x, y: e.y, r, pts: blob(rnd, r, 14, 0.18), b: box(e.x, e.y, r * 1.35) });
      out.push({ t: 'lavaglow', live: 1, x: e.x, y: e.y, r, b: box(e.x, e.y, r * 1.35) });
      for (let k = 0; k < 5; k++) {
        let a = (k / 5) * TAU + rnd() * 0.8;
        let x = e.x + Math.cos(a) * r * 0.9;
        let y = e.y + Math.sin(a) * r * 0.9;
        const pts = [[x, y]];
        let bx0 = x;
        let by0 = y;
        let bx1 = x;
        let by1 = y;
        const n = 30 + Math.floor(rnd() * 40);
        for (let i = 0; i < n; i++) {
          a += (rnd() - 0.5) * 0.7;
          x += Math.cos(a) * 70;
          y += Math.sin(a) * 70;
          pts.push([x, y]);
          bx0 = Math.min(bx0, x);
          by0 = Math.min(by0, y);
          bx1 = Math.max(bx1, x);
          by1 = Math.max(by1, y);
        }
        out.push({ t: 'lavar', under: 1, pts, w: 16 + rnd() * 22, b: [bx0 - 60, by0 - 60, bx1 + 60, by1 + 60] });
      }
      scatter(120, hw + 50, 1500, (x, y) => (rnd() < 0.42 ? { t: 'rock', x, y, s: 10 + rnd() * 30, a: rnd() * TAU, b: box(x, y, 42) } : null));
      break;
    }
    case 'moon': {
      const e = emptiest(T, distTo);
      if (e.d > hw + 400) out.push({ t: 'crater', under: 1, x: e.x, y: e.y, r: Math.min(1100, e.d - hw - 120), b: box(e.x, e.y, Math.min(1100, e.d) * 1.1) });
      scatter(700, hw + 200, 2000, (x, y, d) => {
        const r = 120 + rnd() * 380;
        if (d < hw + 40 + r) return null;
        return { t: 'crater', under: 1, x, y, r, b: box(x, y, r * 1.1) };
      });
      scatter(200, hw + 40, 1600, (x, y, d) => {
        const r = 14 + rnd() * 50;
        if (d < hw + 16 + r || rnd() < 0.45) return null;
        return { t: 'crater', under: 1, x, y, r, b: box(x, y, r * 1.1) };
      });
      scatter(1000, hw + 260, 1500, (x, y, d) => {
        if (rnd() < 0.55) return null;
        if (rnd() < 0.55) {
          const r = 70 + rnd() * 70;
          return d > hw + 60 + r ? { t: 'dome', x, y, r, b: box(x, y, r + 20) } : null;
        }
        return d > hw + 260 ? { t: 'solar', x, y, a: rnd() * Math.PI, b: box(x, y, 190) } : null;
      });
      lamps(420, '#e8f4ff');
      break;
    }
    case 'rain': {
      const cols = [c1, c2, '#9d6bff'];
      scatter(175, hw + 90, 1400, (x, y) => {
        const w = 60 + rnd() * 120;
        const h = 60 + rnd() * 120;
        if (distTo(x, y) < hw + 40 + Math.max(w, h) * 0.72) return null;
        return { t: 'bld', x: x - w / 2, y: y - h / 2, w, h, c: cols[Math.floor(rnd() * 3)], win: Math.floor(rnd() * 1000), sign: rnd() < 0.35, b: [x - w / 2 - 8, y - h / 2 - 8, x + w / 2 + 8, y + h / 2 + 8] };
      });
      // charcos sobre la calzada que reflejan el neón
      for (let i = 0; i < T.N; i += 4) {
        if (rnd() < 0.72) continue;
        const lat = (rnd() - 0.5) * (T.width - 70);
        const x = T.xs[i] - T.ty[i] * lat;
        const y = T.ys[i] + T.tx[i] * lat;
        const rx = 30 + rnd() * 60;
        out.push({ t: 'puddle', x, y, rx, ry: 10 + rnd() * 18, a: Math.atan2(T.ty[i], T.tx[i]) + (rnd() - 0.5) * 0.4, c: rnd() < 0.3 ? '#ffffff' : cols[Math.floor(rnd() * 3)], b: box(x, y, rx + 4) });
      }
      lamps(260, '#9fe9ff');
      break;
    }
  }
  // ---- común a todas: flechas en las curvas cerradas, carteles de frenada y tribunas en la largada
  for (let i = 0; i < T.N; i++) {
    const k = T.curv[i];
    if (Math.abs(k) < 1 / 400 || i % 4) continue;
    const s = -Math.sign(k); // lado de afuera
    const x = T.xs[i] - T.ty[i] * s * (hw + 26);
    const y = T.ys[i] + T.tx[i] * s * (hw + 26);
    if (distTo(x, y) < hw + 16) continue;
    out.push({ t: 'chev', x, y, a: Math.atan2(T.ty[i], T.tx[i]), c: s < 0 ? c1 : c2, b: box(x, y, 20) });
  }
  for (let i = 0; i < T.N; i++) {
    const p = (i - 1 + T.N) % T.N;
    if (Math.abs(T.curv[i]) < 1 / 420 || Math.abs(T.curv[p]) >= 1 / 420) continue;
    // cuánto dobla la curva que empieza acá
    let turn = 0;
    for (let j = i; Math.abs(T.curv[j % T.N]) >= 1 / 900 && j < i + T.N; j++) turn += T.curv[j % T.N] * (T.dist[(j % T.N) + 1] - T.dist[j % T.N]);
    if (Math.abs(turn) < 1.1) continue;
    const s = -Math.sign(T.curv[i]);
    for (let n = 1; n <= 3; n++) {
      let j = i;
      while (T.dist[i] - T.dist[j] + (j > i ? T.length : 0) < n * 140) j = (j - 1 + T.N) % T.N;
      const x = T.xs[j] - T.ty[j] * s * (hw + 48);
      const y = T.ys[j] + T.tx[j] * s * (hw + 48);
      if (distTo(x, y) < hw + 30) continue;
      out.push({ t: 'board', x, y, a: Math.atan2(T.ty[j], T.tx[j]), n, b: box(x, y, 24) });
    }
  }
  for (const along of T.theme === 'cyber' ? [] : [-700, -300, 300]) {
    let j = 0;
    const want = (along + T.length) % T.length;
    while (j < T.N - 1 && T.dist[j] < want) j++;
    for (const s of [-1, 1]) {
      const off = hw + 110;
      const x = T.xs[j] - T.ty[j] * s * off;
      const y = T.ys[j] + T.tx[j] * s * off;
      const ok = [-150, 0, 150].every((d) => distTo(x + T.tx[j] * d, y + T.ty[j] * d) > hw + 70);
      if (ok) out.push({ t: 'stand', x, y, a: Math.atan2(T.ty[j], T.tx[j]), c: s < 0 ? c1 : c2, b: box(x, y, 160) });
    }
  }
  // grilla de búsqueda para dibujar solo lo visible
  const cell = 600;
  const grid = new Map();
  const big = [];
  for (const o of out) {
    if (o.big) {
      big.push(o);
      continue;
    }
    const gx0 = Math.floor(o.b[0] / cell);
    const gx1 = Math.floor(o.b[2] / cell);
    const gy0 = Math.floor(o.b[1] / cell);
    const gy1 = Math.floor(o.b[3] / cell);
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const k = gx * 73856093 + gy * 19349663;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(o);
      }
  }
  return { grid, cell, big, count: out.length };
}

function visibleDecos(D, x0, y0, x1, y1, out) {
  out.length = 0;
  const seen = new Set();
  const gx0 = Math.floor(x0 / D.cell);
  const gx1 = Math.floor(x1 / D.cell);
  const gy0 = Math.floor(y0 / D.cell);
  const gy1 = Math.floor(y1 / D.cell);
  for (let gy = gy0; gy <= gy1; gy++)
    for (let gx = gx0; gx <= gx1; gx++) {
      const list = D.grid.get(gx * 73856093 + gy * 19349663);
      if (!list) continue;
      for (const o of list) {
        if (seen.has(o) || o.b[0] > x1 || o.b[2] < x0 || o.b[1] > y1 || o.b[3] < y0) continue;
        seen.add(o);
        out.push(o);
      }
    }
  return out;
}

const riverPaths = new WeakMap();
function riverPath(o, flow = false) {
  let p = riverPaths.get(o);
  if (!p) {
    const line = (runs) => {
      const q = new Path2D();
      for (const r of runs) r.forEach(([x, y], i) => (i ? q.lineTo(x, y) : q.moveTo(x, y)));
      return q;
    };
    p = { bed: line([o.pts]), flow: line(o.runs) };
    riverPaths.set(o, p);
  }
  return flow ? p.flow : p.bed;
}

// ---------------------------------------------------------------- dibujo
export class Painter {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.vis = [];
    this.tiles = new Map();
    this.tileScale = 1;
    this.tileT = null;
    this.skids = new Float32Array(6 * 6000);
    this.skidN = 0;
    this.skidHead = 0;
    this.smoke = [];
    this.sparks = [];
    this.glow = true;
    this.motion = true;
    this.smokeSprite = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(230,225,245,.55)');
      gr.addColorStop(0.6, 'rgba(210,205,230,.18)');
      gr.addColorStop(1, 'rgba(200,200,220,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return c;
    })();
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
  }

  resetEffects() {
    this.skidN = 0;
    this.skidHead = 0;
    this.smoke.length = 0;
    this.sparks.length = 0;
  }

  addSkid(x1, y1, x2, y2, a) {
    const i = this.skidHead * 6;
    const s = this.skids;
    s[i] = x1;
    s[i + 1] = y1;
    s[i + 2] = x2;
    s[i + 3] = y2;
    s[i + 4] = a;
    this.skidHead = (this.skidHead + 1) % 6000;
    this.skidN = Math.min(6000, this.skidN + 1);
  }

  puff(x, y, vx, vy, size) {
    if (this.smoke.length > 260) this.smoke.shift();
    this.smoke.push({ x, y, vx, vy, s: size, life: 0, max: 0.9 + Math.random() * 0.6 });
  }

  spark(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length > 200) this.sparks.shift();
      const a = Math.random() * TAU;
      const v = 120 + Math.random() * 380;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.25 + Math.random() * 0.35, c: color });
    }
  }

  tickEffects(dt) {
    for (const p of this.smoke) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.8;
      p.vy *= 1 - dt * 1.8;
      p.s += dt * 38;
    }
    while (this.smoke.length && this.smoke[0].life > this.smoke[0].max) this.smoke.shift();
    for (const p of this.sparks) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 4;
      p.vy *= 1 - dt * 4;
    }
    this.sparks = this.sparks.filter((p) => p.life < p.max);
  }

  /** Vacía la caché de mosaicos (cambio de pista, de preferencias o de tamaño). */
  flush() {
    this.tiles.clear();
  }

  /**
   * Mosaico estático (piso, pista y decoración quieta) de TILE×TILE unidades, dibujado una sola vez
   * y reutilizado mientras esté a la vista (los más viejos se descartan).
   */
  tileFor(T, tx, ty) {
    const key = tx * 100003 + ty;
    let tile = this.tiles.get(key);
    if (tile) {
      this.tiles.delete(key);
      this.tiles.set(key, tile);
      return tile;
    }
    const sc = this.tileScale;
    const pad = 2 / sc;
    const size = TILE + 2 * pad;
    const px = Math.ceil(size * sc);
    let cv;
    if (this.tiles.size >= MAX_TILES) {
      const [k0, old] = this.tiles.entries().next().value;
      this.tiles.delete(k0);
      cv = old.cv;
    } else cv = document.createElement('canvas');
    if (cv.width !== px) {
      cv.width = px;
      cv.height = px;
    }
    const g = cv.getContext('2d', { alpha: false });
    const x0 = tx * TILE - pad;
    const y0 = ty * TILE - pad;
    g.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
    const main = this.g;
    this.g = g;
    try {
      this.staticLayer(T, x0, y0, x0 + size, y0 + size);
    } finally {
      this.g = main;
    }
    tile = { cv, x0, y0, s: size };
    this.tiles.set(key, tile);
    return tile;
  }

  staticLayer(T, x0, y0, x1, y1) {
    const { g } = this;
    const th = THEMES[T.theme] || THEMES.city;
    g.fillStyle = th.ground;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const step = 160;
    g.strokeStyle = th.grid;
    g.lineWidth = 1.6;
    g.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x < x1; x += step) {
      g.moveTo(x, y0);
      g.lineTo(x, y1);
    }
    for (let y = Math.ceil(y0 / step) * step; y < y1; y += step) {
      g.moveTo(x0, y);
      g.lineTo(x1, y);
    }
    g.stroke();
    const geo = prepare(T);
    for (const o of geo.decos.big) this.bigStatic(o, x0, y0, x1, y1);
    const decos = visibleDecos(geo.decos, x0, y0, x1, y1, this.vis);
    for (const o of decos) if (o.under) this.deco(o, T, 0);
    this.track(T, geo, x0, y0, x1, y1, th);
    for (const o of decos) if (!o.under && !o.live) this.deco(o, T, 0);
  }

  /**
   * Dibuja una vista. view: { x, y, w, h (en pantalla), cam: { x, y, z, rot } }.
   * scene: { T, cars, ghost, t }
   */
  view(v, scene) {
    const { g, dpr } = this;
    const { T, t } = scene;
    const th = THEMES[T.theme] || THEMES.city;
    const cam = v.cam;
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.beginPath();
    g.rect(v.x, v.y, v.w, v.h);
    g.clip();
    g.fillStyle = th.bg;
    g.fillRect(v.x, v.y, v.w, v.h);
    // mundo
    const cx = v.x + v.w / 2;
    const cy = v.y + v.h * (cam.rot === null ? 0.5 : 0.68);
    g.translate(cx, cy);
    const rot = cam.rot ?? 0;
    if (rot) g.rotate(rot);
    g.scale(cam.z, cam.z);
    g.translate(-cam.x, -cam.y);
    // caja visible en el mundo (las cuatro esquinas de la vista, deshaciendo la rotación)
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [sx, sy] of [
      [v.x, v.y],
      [v.x + v.w, v.y],
      [v.x, v.y + v.h],
      [v.x + v.w, v.y + v.h],
    ]) {
      const dx = (sx - cx) / cam.z;
      const dy = (sy - cy) / cam.z;
      const wx = cam.x + dx * cs + dy * sn;
      const wy = cam.y - dx * sn + dy * cs;
      if (wx < x0) x0 = wx;
      if (wx > x1) x1 = wx;
      if (wy < y0) y0 = wy;
      if (wy > y1) y1 = wy;
    }
    x0 -= 40;
    y0 -= 40;
    x1 += 40;
    y1 += 40;
    // escala de los mosaicos: se rehacen solo si el zoom cambia mucho (o cambia la pista)
    const want = Math.max(0.2, Math.min(1, dpr * cam.z));
    if (this.tileT !== T || want > this.tileScale * 1.3 || want < this.tileScale * 0.6) {
      this.flush();
      this.tileT = T;
      this.tileScale = Math.round(want * 20) / 20;
    }
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++)
      for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
        // con la vista girada, las esquinas de la caja quedan afuera: se saltean
        const mx = (tx + 0.5) * TILE - cam.x;
        const my = (ty + 0.5) * TILE - cam.y;
        const sx = (mx * cs - my * sn) * cam.z + cx;
        const sy = (mx * sn + my * cs) * cam.z + cy;
        const m = TILE * 0.71 * cam.z;
        if (sx < v.x - m || sx > v.x + v.w + m || sy < v.y - m || sy > v.y + v.h + m) continue;
        const tile = this.tileFor(T, tx, ty);
        g.drawImage(tile.cv, tile.x0, tile.y0, tile.s, tile.s);
      }
    // lo que se mueve
    this.live(T, x0, y0, x1, y1, t);
    this.skidsDraw(x0, y0, x1, y1);
    this.smokeDraw(x0, y0, x1, y1);
    if (scene.ghost) this.car(scene.ghost, t, true);
    for (const c of scene.cars) if (c.x > x0 && c.x < x1 && c.y > y0 && c.y < y1) this.car(c, t, false);
    this.sparksDraw();
    // nombres (siempre derechos, aunque la cámara gire)
    g.font = `700 ${13 / cam.z}px Rajdhani, system-ui, sans-serif`;
    g.textAlign = 'center';
    for (const c of scene.cars) {
      if (!c.label || c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      g.save();
      g.translate(c.x, c.y);
      if (rot) g.rotate(-rot);
      g.fillStyle = 'rgba(10,6,20,.55)';
      const w = g.measureText(c.label).width + 10 / cam.z;
      g.fillRect(-w / 2, -44 / cam.z, w, 17 / cam.z);
      g.fillStyle = c.color;
      g.fillText(c.label, 0, -31 / cam.z);
      g.restore();
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (T.theme === 'snow') this.aurora(v, t);
    else if (T.theme === 'rain') this.rainFx(v, t);
    else if (T.theme === 'volcano') this.embers(v, t);
    g.restore();
  }

  /** Lluvia: rayitas que caen en diagonal sobre la vista (solo con animaciones). */
  rainFx(v, t) {
    if (!this.motion) return;
    const { g } = this;
    const n = Math.round((v.w * v.h) / 9000);
    g.strokeStyle = 'rgba(170,220,255,.22)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = hash(i);
      const b = hash(i + 999);
      const sp = 0.9 + hash(i + 77) * 0.6;
      const y = v.y + ((b * v.h * 4 + t * sp * 1.1) % (v.h + 40)) - 20;
      const x = v.x + ((a * v.w + (y - v.y) * 0.3) % v.w);
      g.moveTo(x, y);
      g.lineTo(x - 5, y - 20);
    }
    g.stroke();
  }

  /** Brasas que suben del volcán. */
  embers(v, t) {
    if (!this.motion) return;
    const { g } = this;
    const n = Math.round((v.w * v.h) / 26000);
    for (let i = 0; i < n; i++) {
      const a = hash(i);
      const sp = 0.25 + hash(i + 31) * 0.5;
      const y = v.y + v.h - ((hash(i + 7) * v.h * 3 + t * sp * 0.08) % (v.h + 20));
      const x = v.x + a * v.w + Math.sin(t / 900 + i) * 16;
      const life = (y - v.y) / v.h;
      g.fillStyle = i % 3 ? '#ff7a2f' : '#ffd23f';
      g.globalAlpha = 0.15 + life * 0.5;
      g.fillRect(x, y, 3, 3);
    }
    g.globalAlpha = 1;
  }

  aurora(v, t) {
    const { g } = this;
    const k = this.motion ? t / 4000 : 0;
    for (let i = 0; i < 3; i++) {
      const y = v.y + v.h * (0.12 + i * 0.1) + Math.sin(k + i) * 20;
      const grad = g.createLinearGradient(v.x, y - 70, v.x, y + 70);
      grad.addColorStop(0, 'rgba(61,255,168,0)');
      grad.addColorStop(0.5, i % 2 ? 'rgba(157,107,255,.07)' : 'rgba(61,255,168,.07)');
      grad.addColorStop(1, 'rgba(61,255,168,0)');
      g.fillStyle = grad;
      g.fillRect(v.x, y - 70, v.w, 140);
    }
  }

  /** Capas animadas: reflejos del agua, olas, destellos. */
  live(T, x0, y0, x1, y1, t) {
    const { g } = this;
    if (T.theme === 'bridge') {
      g.strokeStyle = 'rgba(0,240,255,.07)';
      g.lineWidth = 3;
      g.beginPath();
      const ph = this.motion ? (t / 900) % 1 : 0;
      for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90)
        for (let x = Math.floor(x0 / 240) * 240; x < x1; x += 240) {
          const ox = ((y / 90) % 2) * 120 + ph * 60;
          g.moveTo(x + ox, y);
          g.lineTo(x + ox + 60, y);
        }
      g.stroke();
    }
    const geo = prepare(T);
    for (const o of visibleDecos(geo.decos, x0, y0, x1, y1, this.vis)) if (o.live) this.deco(o, T, t);
    for (const o of geo.decos.big) {
      if (o.t === 'river' && !(o.b[0] > x1 || o.b[2] < x0)) {
        // corriente: rayitas que bajan con el agua
        const path = riverPath(o, true);
        g.save();
        g.setLineDash([36, 110]);
        g.lineDashOffset = this.motion ? -t / 14 : 0;
        g.strokeStyle = 'rgba(170,240,255,.2)';
        g.lineWidth = 3;
        g.translate(-o.w * 0.22, 0);
        g.stroke(path);
        g.translate(o.w * 0.44, 0);
        g.lineDashOffset = this.motion ? -t / 11 + 60 : 60;
        g.stroke(path);
        g.restore();
        continue;
      }
      if (o.t !== 'sea' || y1 < o.y - 40) continue;
      const ph = this.motion ? t / 700 : 0;
      g.strokeStyle = 'rgba(125,255,242,.25)';
      g.lineWidth = 3;
      g.beginPath();
      for (let y = Math.max(o.y + 70, Math.floor(y0 / 70) * 70); y < y1; y += 70) {
        const k = Math.round((y - o.y) / 70);
        for (let x = Math.floor(x0 / 200) * 200; x < x1; x += 200) {
          const ox = Math.sin(ph + k) * 30 + (k % 2) * 100;
          const oy = Math.sin(ph * 1.3 + x) * 4;
          g.moveTo(x + ox, y + oy);
          g.lineTo(x + ox + 70, y + oy);
        }
      }
      g.stroke();
      // espuma de la orilla
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 5;
      g.beginPath();
      const xs = Math.floor(x0 / 60) * 60;
      for (let x = xs; x < x1 + 60; x += 60) {
        const y = o.y + Math.sin(x / 90 + ph) * 8;
        if (x === xs) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }

  bigStatic(o, x0, y0, x1, y1) {
    const { g } = this;
    if (o.t === 'river') {
      if (o.b[0] > x1 || o.b[2] < x0) return;
      const path = riverPath(o);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(70,60,36,.55)';
      g.lineWidth = o.w + 50;
      g.stroke(path);
      g.strokeStyle = '#08323d';
      g.lineWidth = o.w;
      g.stroke(path);
      g.strokeStyle = 'rgba(40,150,170,.22)';
      g.lineWidth = o.w * 0.45;
      g.stroke(path);
      g.lineCap = 'butt';
    }
    if (o.t === 'sea') {
      if (y1 < o.y - 200) return;
      g.fillStyle = 'rgba(232,201,143,.18)';
      g.fillRect(x0, o.y - 130, x1 - x0, 130);
      const top = Math.max(o.y, y0);
      if (top < y1) {
        g.fillStyle = '#062a3a';
        g.fillRect(x0, top, x1 - x0, y1 - top);
      }
    }
  }

  track(T, geo, x0, y0, x1, y1, th) {
    const { g } = this;
    const vis = [];
    for (const c of geo.chunks) if (!(c.box[0] > x1 || c.box[2] < x0 || c.box[1] > y1 || c.box[3] < y0)) vis.push(c);
    // montículos de nieve contra las barreras
    if (T.theme === 'snow') {
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(225,238,255,.14)';
      g.lineWidth = 64;
      for (const c of vis) {
        g.stroke(c.left);
        g.stroke(c.right);
      }
      g.strokeStyle = 'rgba(235,245,255,.2)';
      g.lineWidth = 36;
      for (const c of vis) {
        g.stroke(c.left);
        g.stroke(c.right);
      }
    }
    // paredones del cañón
    if (T.theme === 'canyon') {
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(22,6,4,.5)';
      g.lineWidth = 150;
      for (const c of vis) {
        g.stroke(c.left);
        g.stroke(c.right);
      }
      g.strokeStyle = 'rgba(96,34,18,.55)';
      g.lineWidth = 84;
      for (const c of vis) {
        g.stroke(c.left);
        g.stroke(c.right);
      }
    }
    // grava en las curvas cerradas
    g.fillStyle = th.runoff || 'rgba(230,210,180,.09)';
    for (const c of vis) if (c.runoff) g.fill(c.runoff);
    // sombra/borde exterior
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.lineWidth = 26;
    for (const c of vis) {
      g.stroke(c.left);
      g.stroke(c.right);
    }
    g.fillStyle = th.asphalt;
    g.strokeStyle = th.asphalt;
    g.lineWidth = 2;
    for (const c of vis) {
      g.fill(c.surf);
      g.stroke(c.surf); // tapa las micro-rendijas entre tramos
    }
    // pianos
    for (const c of vis) {
      for (const q of c.curbs) {
        g.fillStyle = q[8] ? T.colors[0] : '#f2eefc';
        g.globalAlpha = q[8] ? 0.75 : 0.55;
        g.beginPath();
        g.moveTo(q[0], q[1]);
        g.lineTo(q[2], q[3]);
        g.lineTo(q[4], q[5]);
        g.lineTo(q[6], q[7]);
        g.closePath();
        g.fill();
      }
    }
    g.globalAlpha = 1;
    // línea central
    g.setLineDash([46, 58]);
    g.strokeStyle = th.line;
    g.lineWidth = 4;
    for (const c of vis) g.stroke(c.center);
    g.setLineDash([]);
    // barreras de neón
    for (const [key, col] of [
      ['left', T.colors[0]],
      ['right', T.colors[1]],
    ]) {
      if (this.glow) {
        g.strokeStyle = col;
        g.globalAlpha = 0.12;
        g.lineWidth = 24;
        for (const c of vis) g.stroke(c[key]);
        g.globalAlpha = 0.3;
        g.lineWidth = 10;
        for (const c of vis) g.stroke(c[key]);
      }
      g.globalAlpha = 1;
      g.lineWidth = 4;
      g.strokeStyle = col;
      for (const c of vis) g.stroke(c[key]);
    }
    // largada a cuadros y pórtico
    const i = 0;
    const nx = -T.ty[i];
    const ny = T.tx[i];
    const hw = T.width / 2;
    g.save();
    g.translate(T.xs[i], T.ys[i]);
    g.rotate(Math.atan2(T.ty[i], T.tx[i]));
    const n = 14;
    const sq = T.width / n;
    for (let k = 0; k < n; k++)
      for (let r = 0; r < 2; r++) {
        g.fillStyle = (k + r) % 2 ? '#fff' : '#111';
        g.fillRect(r * sq - sq, -hw + k * sq, sq, sq);
      }
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.fillRect(-6, -hw - 22, 12, 16);
    g.fillRect(-6, hw + 6, 12, 16);
    g.strokeStyle = T.colors[0];
    g.lineWidth = 5;
    g.globalAlpha = 0.8;
    g.beginPath();
    g.moveTo(0, -hw - 14);
    g.lineTo(0, hw + 14);
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
    void nx;
    void ny;
  }

  skidsDraw(x0, y0, x1, y1) {
    const { g, skids } = this;
    const n = this.skidN;
    if (!n) return;
    g.lineCap = 'round';
    g.lineWidth = 5;
    for (const bucket of [0.1, 0.2, 0.32]) {
      g.strokeStyle = `rgba(0,0,0,${bucket + 0.1})`;
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const i = k * 6;
        const a = skids[i + 4];
        if (a <= bucket - 0.1 || a > bucket) continue;
        const x = skids[i];
        const y = skids[i + 1];
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        g.moveTo(x, y);
        g.lineTo(skids[i + 2], skids[i + 3]);
      }
      g.stroke();
    }
    g.lineCap = 'butt';
  }

  smokeDraw(x0, y0, x1, y1) {
    const { g } = this;
    for (const p of this.smoke) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      g.globalAlpha = Math.max(0, 1 - p.life / p.max) * 0.8;
      g.drawImage(this.smokeSprite, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
    }
    g.globalAlpha = 1;
  }

  sparksDraw() {
    const { g } = this;
    g.lineCap = 'round';
    for (const p of this.sparks) {
      g.strokeStyle = p.c;
      g.globalAlpha = 1 - p.life / p.max;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.lineCap = 'butt';
  }

  deco(o, T, t) {
    const { g } = this;
    switch (o.t) {
      case 'bld': {
        g.fillStyle = 'rgba(16,9,34,.95)';
        g.fillRect(o.x, o.y, o.w, o.h);
        if (this.glow) {
          g.strokeStyle = o.c;
          g.globalAlpha = 0.22;
          g.lineWidth = 9;
          g.strokeRect(o.x, o.y, o.w, o.h);
        }
        g.globalAlpha = 0.9;
        g.lineWidth = 2;
        g.strokeStyle = o.c;
        g.strokeRect(o.x, o.y, o.w, o.h);
        g.globalAlpha = 0.45;
        g.fillStyle = o.c;
        for (let wy = o.y + 14; wy < o.y + o.h - 10; wy += 18) for (let wx = o.x + 12; wx < o.x + o.w - 10; wx += 16) if ((o.win + wx * 7 + wy * 13) % 5 < 2) g.fillRect(wx, wy, 6, 8);
        if (o.sign) {
          g.globalAlpha = 0.8 + (this.motion ? 0.2 * Math.sin(t / 180 + o.win) : 0);
          g.fillStyle = o.win % 2 ? '#ff2bd6' : '#00f0ff';
          g.fillRect(o.x + o.w * 0.15, o.y + o.h * 0.35, o.w * 0.7, 10);
        }
        g.globalAlpha = 1;
        break;
      }
      case 'lamp': {
        g.fillStyle = o.c;
        g.globalAlpha = 0.09;
        g.beginPath();
        g.arc(o.x, o.y, 46, 0, TAU);
        g.fill();
        g.globalAlpha = 0.9;
        g.beginPath();
        g.arc(o.x, o.y, 5, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
        break;
      }
      case 'pillar': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(-14, -o.w / 2, 28, o.w);
        g.fillStyle = '#1b2440';
        g.fillRect(-10, -o.w / 2 - 12, 20, 24);
        g.fillRect(-10, o.w / 2 - 12, 20, 24);
        g.restore();
        break;
      }
      case 'glint': {
        g.fillStyle = o.c;
        g.globalAlpha = 0.35 + (this.motion ? 0.3 * Math.sin(t / 500 + o.ph) : 0);
        g.fillRect(o.x - o.s, o.y, o.s * 2, 2);
        g.globalAlpha = 1;
        break;
      }
      case 'dune': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.fillStyle = 'rgba(255,150,90,.07)';
        g.beginPath();
        g.ellipse(0, 0, o.rx, o.ry, 0, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(255,190,120,.1)';
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(0, -o.ry * 0.3, o.rx * 0.8, o.ry * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
        g.restore();
        break;
      }
      case 'cactus': {
        g.strokeStyle = '#3dbb6a';
        g.lineCap = 'round';
        g.lineWidth = o.s * 0.5;
        g.beginPath();
        g.moveTo(o.x, o.y + o.s);
        g.lineTo(o.x, o.y - o.s);
        g.moveTo(o.x, o.y);
        g.lineTo(o.x - o.s * 0.8, o.y);
        g.lineTo(o.x - o.s * 0.8, o.y - o.s * 0.6);
        g.moveTo(o.x, o.y + o.s * 0.2);
        g.lineTo(o.x + o.s * 0.7, o.y + o.s * 0.2);
        g.lineTo(o.x + o.s * 0.7, o.y - o.s * 0.4);
        g.stroke();
        g.lineCap = 'butt';
        break;
      }
      case 'rock': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.fillStyle = o.snow ? '#8a98b0' : ROCK[T.theme] || '#3a4a44';
        g.beginPath();
        g.moveTo(-o.s, 0);
        g.lineTo(-o.s * 0.4, -o.s * 0.7);
        g.lineTo(o.s * 0.6, -o.s * 0.5);
        g.lineTo(o.s, o.s * 0.2);
        g.lineTo(0, o.s * 0.7);
        g.closePath();
        g.fill();
        if (o.snow) {
          g.fillStyle = 'rgba(240,248,255,.8)';
          g.beginPath();
          g.moveTo(-o.s * 0.4, -o.s * 0.7);
          g.lineTo(o.s * 0.6, -o.s * 0.5);
          g.lineTo(o.s * 0.2, -o.s * 0.1);
          g.closePath();
          g.fill();
        }
        g.restore();
        break;
      }
      case 'pine': {
        g.fillStyle = 'rgba(0,0,0,.3)';
        g.beginPath();
        g.arc(o.x + o.s * 0.3, o.y + o.s * 0.3, o.s, 0, TAU);
        g.fill();
        g.fillStyle = o.snow ? '#1d4a4a' : '#0f3a26';
        g.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          const r = i % 2 ? o.s * 0.62 : o.s;
          if (i) g.lineTo(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r);
          else g.moveTo(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.fillStyle = o.snow ? 'rgba(235,245,255,.85)' : '#1d5a38';
        g.beginPath();
        g.arc(o.x - o.s * 0.15, o.y - o.s * 0.15, o.s * 0.45, 0, TAU);
        g.fill();
        break;
      }
      case 'bank': {
        g.fillStyle = 'rgba(235,245,255,.75)';
        g.beginPath();
        g.arc(o.x, o.y, o.s, 0, TAU);
        g.fill();
        break;
      }
      case 'box': {
        const n = o.n;
        for (let k = 0; k < n; k++) {
          const x = o.horiz ? o.x : o.x + k * (o.w + 4);
          const y = o.horiz ? o.y + k * (o.h + 4) : o.y;
          g.fillStyle = o.c;
          g.globalAlpha = 0.85;
          g.fillRect(x, y, o.w, o.h);
          g.globalAlpha = 1;
          g.strokeStyle = 'rgba(0,0,0,.35)';
          g.lineWidth = 2;
          g.beginPath();
          const long = o.horiz ? o.w : o.h;
          for (let s = 8; s < long; s += 10) {
            if (o.horiz) {
              g.moveTo(x + s, y + 2);
              g.lineTo(x + s, y + o.h - 2);
            } else {
              g.moveTo(x + 2, y + s);
              g.lineTo(x + o.w - 2, y + s);
            }
          }
          g.stroke();
        }
        break;
      }
      case 'crane': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.strokeStyle = '#ffb800';
        g.lineWidth = 8;
        g.globalAlpha = 0.85;
        g.strokeRect(-30, -30, 60, 60);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(240, 0);
        g.moveTo(0, 0);
        g.lineTo(-70, 0);
        g.stroke();
        g.fillStyle = '#ff3b5c';
        g.beginPath();
        g.arc(240, 0, 7, 0, TAU);
        g.fill();
        g.restore();
        g.globalAlpha = 1;
        break;
      }
      case 'palm': {
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.beginPath();
        g.arc(o.x + 10, o.y + 10, o.s, 0, TAU);
        g.fill();
        g.strokeStyle = '#2fbf6f';
        g.lineWidth = 5;
        g.lineCap = 'round';
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = o.a + (i / 6) * TAU;
          g.moveTo(o.x, o.y);
          g.quadraticCurveTo(o.x + Math.cos(a + 0.3) * o.s * 0.8, o.y + Math.sin(a + 0.3) * o.s * 0.8, o.x + Math.cos(a) * o.s * 1.3, o.y + Math.sin(a) * o.s * 1.3);
        }
        g.stroke();
        g.lineCap = 'butt';
        g.fillStyle = '#7a4a2a';
        g.beginPath();
        g.arc(o.x, o.y, 4, 0, TAU);
        g.fill();
        break;
      }
      case 'stand': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.fillStyle = '#10181c';
        g.fillRect(-150, -34, 300, 68);
        g.strokeStyle = o.c || '#b6ff00';
        g.globalAlpha = 0.5;
        g.lineWidth = 2;
        g.strokeRect(-150, -34, 300, 68);
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(255,255,255,.25)';
        for (let k = -140; k < 140; k += 9) for (let r = -26; r < 28; r += 10) if ((k * 3 + r * 7) % 5) g.fillRect(k, r, 4, 4);
        g.restore();
        break;
      }
      case 'tower': {
        g.fillStyle = '#0c1410';
        g.fillRect(o.x - 18, o.y - 18, 36, 36);
        g.fillStyle = '#e8ffe0';
        g.globalAlpha = 0.9;
        g.fillRect(o.x - 12, o.y - 12, 24, 24);
        g.globalAlpha = 0.06;
        g.beginPath();
        g.arc(o.x, o.y, 190, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
        break;
      }
      case 'chev': {
        // flecha pintada del lado de afuera de la curva, apuntando hacia donde se va
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.strokeStyle = o.c;
        g.globalAlpha = 0.75;
        g.lineWidth = 5;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(-8, -10);
        g.lineTo(6, 0);
        g.lineTo(-8, 10);
        g.stroke();
        g.restore();
        g.lineCap = 'butt';
        break;
      }
      case 'board': {
        // cartel de frenada: 3, 2 y 1 rayas antes de la curva
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.fillStyle = 'rgba(0,0,0,.4)';
        g.fillRect(-9, -17, 22, 38);
        g.fillStyle = '#f2eefc';
        g.fillRect(-11, -19, 22, 38);
        g.fillStyle = '#16102a';
        for (let k = 0; k < o.n; k++) g.fillRect(-6 + k * 5 - (o.n - 1) * 2.5, -13, 3, 26);
        g.restore();
        break;
      }
      case 'runway': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        const L = o.len / 2;
        const W = o.w / 2;
        g.fillStyle = '#161c28';
        g.fillRect(-L, -W, o.len, o.w);
        g.fillStyle = 'rgba(255,255,255,.4)';
        g.fillRect(-L, -W + 16, o.len, 6);
        g.fillRect(-L, W - 22, o.len, 6);
        // cabeceras (franjas) y marcas de toque, en los márgenes a los costados de la calzada
        for (const e of [-1, 1]) {
          for (let k = -W + 40; k < W - 40; k += 38) {
            if (Math.abs(k + 11) < 150) continue;
            g.fillRect(e * L - (e > 0 ? 150 : -40), k, 110, 22);
          }
          for (const k of [-W + 70, W - 130]) g.fillRect(e * (L - 520) - 90, k, 180, 60);
        }
        g.fillStyle = '#ffe9a8';
        for (let x = -L + 30; x < L; x += 130) {
          g.fillRect(x - 5, -W - 5, 10, 10);
          g.fillRect(x - 5, W - 5, 10, 10);
        }
        g.restore();
        break;
      }
      case 'hangar': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(-o.w / 2 + 14, -o.h / 2 + 14, o.w, o.h);
        g.fillStyle = '#1b2433';
        g.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
        g.strokeStyle = 'rgba(160,190,230,.18)';
        g.lineWidth = 3;
        g.beginPath();
        for (let x = -o.w / 2 + 22; x < o.w / 2; x += 22) {
          g.moveTo(x, -o.h / 2 + 4);
          g.lineTo(x, o.h / 2 - 4);
        }
        g.stroke();
        g.strokeStyle = '#3d8bff';
        g.globalAlpha = 0.55;
        g.lineWidth = 3;
        g.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
        g.globalAlpha = 1;
        g.fillStyle = '#ffd23f';
        g.fillRect(-o.w / 2, o.h / 2 - 8, o.w, 8);
        g.restore();
        break;
      }
      case 'plane': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.scale(o.s, o.s);
        for (const pass of [0, 1]) {
          if (!pass) {
            g.save();
            g.translate(16, 16);
            g.fillStyle = 'rgba(0,0,0,.35)';
          } else g.fillStyle = '#d9e2f0';
          g.beginPath();
          g.moveTo(110, 0);
          g.quadraticCurveTo(104, -14, 80, -14);
          g.lineTo(-96, -10);
          g.lineTo(-110, 0);
          g.lineTo(-96, 10);
          g.lineTo(80, 14);
          g.quadraticCurveTo(104, 14, 110, 0);
          g.moveTo(22, -12);
          g.lineTo(-18, -120);
          g.lineTo(-40, -120);
          g.lineTo(-22, -12);
          g.moveTo(22, 12);
          g.lineTo(-18, 120);
          g.lineTo(-40, 120);
          g.lineTo(-22, 12);
          g.moveTo(-80, -8);
          g.lineTo(-100, -46);
          g.lineTo(-110, -46);
          g.lineTo(-102, -6);
          g.moveTo(-80, 8);
          g.lineTo(-100, 46);
          g.lineTo(-110, 46);
          g.lineTo(-102, 6);
          g.fill();
          if (!pass) g.restore();
        }
        g.fillStyle = o.c;
        g.fillRect(-90, -3, 170, 6);
        g.fillStyle = 'rgba(10,20,40,.8)';
        g.fillRect(88, -7, 10, 14);
        g.restore();
        break;
      }
      case 'mesa': {
        // meseta de roca vista desde arriba: capas de estratos cada vez más claras
        const tones = ['#2a0e08', '#4a1a10', '#5c2314', '#6e2c18', '#84381f'];
        g.save();
        g.translate(o.x, o.y);
        for (let k = 0; k < tones.length; k++) {
          const f = 1.1 - k * 0.17;
          const off = k === 0 ? 22 : -k * 5;
          g.fillStyle = tones[k];
          g.beginPath();
          o.pts.forEach(([x, y], i) => (i ? g.lineTo(x * f + off, y * f + off) : g.moveTo(x * f + off, y * f + off)));
          g.closePath();
          g.fill();
        }
        g.restore();
        break;
      }
      case 'shrub': {
        g.fillStyle = '#3b3a1c';
        g.beginPath();
        g.arc(o.x, o.y, o.s, 0, TAU);
        g.arc(o.x + o.s * 0.9, o.y + o.s * 0.3, o.s * 0.7, 0, TAU);
        g.fill();
        g.fillStyle = '#56542a';
        g.beginPath();
        g.arc(o.x - o.s * 0.2, o.y - o.s * 0.25, o.s * 0.5, 0, TAU);
        g.fill();
        break;
      }
      case 'tree': {
        const r = o.s;
        g.fillStyle = 'rgba(0,0,0,.32)';
        g.beginPath();
        g.arc(o.x + r * 0.35, o.y + r * 0.35, r, 0, TAU);
        g.fill();
        g.fillStyle = o.c;
        g.beginPath();
        g.arc(o.x, o.y, r, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(120,255,170,.1)';
        g.beginPath();
        g.arc(o.x - r * 0.28, o.y - r * 0.3, r * 0.55, 0, TAU);
        g.fill();
        if (o.k < 0.4) {
          g.fillStyle = 'rgba(0,0,0,.18)';
          g.beginPath();
          g.arc(o.x + r * 0.3, o.y + r * 0.1, r * 0.4, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'fly': {
        const a = this.motion ? 0.5 + 0.5 * Math.sin(t / 420 + o.ph) : 0.7;
        if (a < 0.08) break;
        const dx = this.motion ? Math.sin(t / 1300 + o.ph) * 18 : 0;
        const dy = this.motion ? Math.cos(t / 1700 + o.ph * 2) * 14 : 0;
        g.fillStyle = '#d4ff3d';
        g.globalAlpha = a * 0.22;
        g.beginPath();
        g.arc(o.x + dx, o.y + dy, 11, 0, TAU);
        g.fill();
        g.globalAlpha = a;
        g.fillRect(o.x + dx - 2, o.y + dy - 2, 4, 4);
        g.globalAlpha = 1;
        break;
      }
      case 'lava': {
        g.save();
        g.translate(o.x, o.y);
        const path = (f) => {
          g.beginPath();
          o.pts.forEach(([x, y], i) => (i ? g.lineTo(x * f, y * f) : g.moveTo(x * f, y * f)));
          g.closePath();
        };
        g.fillStyle = '#241210';
        path(1.28);
        g.fill();
        g.fillStyle = '#3a1a14';
        path(1.12);
        g.fill();
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, o.r);
        gr.addColorStop(0, '#ffd24a');
        gr.addColorStop(0.45, '#ff7a1f');
        gr.addColorStop(1, '#b3200c');
        g.fillStyle = gr;
        path(1);
        g.fill();
        // costra que flota
        g.strokeStyle = 'rgba(40,10,6,.55)';
        g.lineWidth = 10;
        g.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = k * 0.9;
          const rr = o.r * (0.25 + (k % 3) * 0.2);
          g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          g.quadraticCurveTo(Math.cos(a + 0.4) * rr * 1.2, Math.sin(a + 0.4) * rr * 1.2, Math.cos(a + 0.8) * rr, Math.sin(a + 0.8) * rr);
        }
        g.stroke();
        g.restore();
        break;
      }
      case 'lavaglow': {
        if (!this.glow) break;
        const a = this.motion ? 0.1 + 0.06 * Math.sin(t / 700) : 0.12;
        g.fillStyle = '#ff5a1f';
        g.globalAlpha = a;
        g.beginPath();
        g.arc(o.x, o.y, o.r * 1.3, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
        break;
      }
      case 'lavar': {
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.beginPath();
        o.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        if (this.glow) {
          g.strokeStyle = 'rgba(255,90,30,.18)';
          g.lineWidth = o.w * 2.6;
          g.stroke();
        }
        g.strokeStyle = '#2a0f0a';
        g.lineWidth = o.w + 10;
        g.stroke();
        g.strokeStyle = '#ff5a1f';
        g.lineWidth = o.w;
        g.stroke();
        g.strokeStyle = '#ffc040';
        g.lineWidth = o.w * 0.3;
        g.stroke();
        g.lineCap = 'butt';
        break;
      }
      case 'crater': {
        const r = o.r;
        g.fillStyle = 'rgba(255,255,255,.035)';
        g.beginPath();
        g.arc(o.x, o.y, r * 1.1, 0, TAU);
        g.fill();
        g.fillStyle = '#15161c';
        g.beginPath();
        g.arc(o.x, o.y, r, 0, TAU);
        g.fill();
        g.fillStyle = '#1e1f27';
        g.beginPath();
        g.arc(o.x + r * 0.14, o.y + r * 0.14, r * 0.84, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,.12)';
        g.lineWidth = Math.max(3, r * 0.08);
        g.beginPath();
        g.arc(o.x, o.y, r, Math.PI * 0.95, Math.PI * 1.6);
        g.stroke();
        break;
      }
      case 'dome': {
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.arc(o.x + 14, o.y + 14, o.r, 0, TAU);
        g.fill();
        g.fillStyle = '#1b2230';
        g.beginPath();
        g.arc(o.x, o.y, o.r, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(157,107,255,.35)';
        g.lineWidth = 2;
        g.beginPath();
        for (let k = -2; k <= 2; k++) {
          const d = (k / 3) * o.r;
          const h = Math.sqrt(o.r * o.r - d * d);
          g.moveTo(o.x + d, o.y - h);
          g.lineTo(o.x + d, o.y + h);
          g.moveTo(o.x - h, o.y + d);
          g.lineTo(o.x + h, o.y + d);
        }
        g.stroke();
        g.strokeStyle = '#9d6bff';
        g.lineWidth = 4;
        g.globalAlpha = 0.8;
        g.beginPath();
        g.arc(o.x, o.y, o.r, 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(232,244,255,.25)';
        g.beginPath();
        g.arc(o.x - o.r * 0.35, o.y - o.r * 0.35, o.r * 0.25, 0, TAU);
        g.fill();
        break;
      }
      case 'solar': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        for (let r = -2; r <= 2; r++) {
          g.fillStyle = '#1b2a5c';
          g.fillRect(-160, r * 60 - 20, 320, 40);
          g.strokeStyle = 'rgba(120,170,255,.35)';
          g.lineWidth = 2;
          g.beginPath();
          for (let x = -160; x <= 160; x += 32) {
            g.moveTo(x, r * 60 - 20);
            g.lineTo(x, r * 60 + 20);
          }
          g.stroke();
        }
        g.restore();
        break;
      }
      case 'puddle': {
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.a);
        g.fillStyle = 'rgba(120,160,200,.07)';
        g.beginPath();
        g.ellipse(0, 0, o.rx, o.ry, 0, 0, TAU);
        g.fill();
        g.fillStyle = o.c;
        g.globalAlpha = 0.12;
        g.beginPath();
        g.ellipse(-o.rx * 0.15, 0, o.rx * 0.6, o.ry * 0.45, 0, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
        g.restore();
        break;
      }
    }
  }

  /** Auto: carrocería, faros, luces de freno, nitro y nombre. */
  car(c, t, ghost = false) {
    const { g } = this;
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.h);
    if (ghost) g.globalAlpha = 0.32;
    // sombra
    if (!ghost) {
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.beginPath();
      g.roundRect(-22, -11, 48, 26, 8);
      g.fill();
    }
    // faros
    if (!ghost && this.glow) {
      const beam = g.createLinearGradient(22, 0, 190, 0);
      beam.addColorStop(0, 'rgba(255,255,240,.2)');
      beam.addColorStop(1, 'rgba(255,255,240,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(22, -9);
      g.lineTo(190, -60);
      g.lineTo(190, 60);
      g.lineTo(22, 9);
      g.fill();
    }
    // nitro
    if (c.boosting) {
      const l = 26 + Math.sin(t / 25) * 8;
      for (const y of [-6, 6]) {
        g.fillStyle = '#00f0ff';
        g.beginPath();
        g.moveTo(-23, y - 4);
        g.lineTo(-23 - l, y);
        g.lineTo(-23, y + 4);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(-23, y - 2);
        g.lineTo(-23 - l * 0.5, y);
        g.lineTo(-23, y + 2);
        g.fill();
      }
    }
    // ruedas
    g.fillStyle = '#05030a';
    const st = (c.steer || 0) * 0.9;
    for (const [wx, wy, front] of [
      [13, -12, 1],
      [13, 12, 1],
      [-14, -12, 0],
      [-14, 12, 0],
    ]) {
      g.save();
      g.translate(wx, wy);
      if (front) g.rotate(st);
      g.fillRect(-6, -3.5, 12, 7);
      g.restore();
    }
    // carrocería
    g.fillStyle = '#140a24';
    g.beginPath();
    g.roundRect(-23, -11, 46, 22, 7);
    g.fill();
    if (this.glow && !ghost) {
      g.strokeStyle = c.color;
      g.globalAlpha = 0.35;
      g.lineWidth = 7;
      g.stroke();
      g.globalAlpha = 1;
    }
    g.strokeStyle = c.color;
    g.lineWidth = 2.5;
    g.stroke();
    // techo, parabrisas y franja
    g.fillStyle = c.color;
    g.globalAlpha = ghost ? 0.32 : 0.9;
    g.beginPath();
    g.roundRect(-9, -7.5, 17, 15, 4);
    g.fill();
    g.globalAlpha = ghost ? 0.32 : 1;
    g.fillStyle = 'rgba(0,240,255,.85)';
    g.fillRect(8, -6.5, 5, 13);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(-21, -1.5, 42, 3);
    // luces
    g.fillStyle = '#fffbe8';
    g.fillRect(19, -9, 3.5, 5);
    g.fillRect(19, 4, 3.5, 5);
    const braking = c.inBrake;
    g.fillStyle = braking ? '#ff3b5c' : 'rgba(255,59,92,.55)';
    g.fillRect(-23, -9, 3, 5);
    g.fillRect(-23, 4, 3, 5);
    if (braking && this.glow && !ghost) {
      g.fillStyle = 'rgba(255,59,92,.25)';
      g.fillRect(-34, -12, 12, 24);
    }
    g.restore();
  }
}

/** Miniatura del trazado (para el minimapa y los botones de pista); `road` le agrega la calzada. */
export function outline(T, w, h, pad = 6, lineW = 3, road = false) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const B = T.bounds;
  const k = Math.min((w - pad * 2) / B.w, (h - pad * 2) / B.h);
  const ox = (w - B.w * k) / 2 - B.x * k;
  const oy = (h - B.h * k) / 2 - B.y * k;
  g.lineJoin = 'round';
  const line = () => {
    g.beginPath();
    for (let i = 0; i <= T.N; i++) {
      const j = i % T.N;
      if (i) g.lineTo(T.xs[j] * k + ox, T.ys[j] * k + oy);
      else g.moveTo(T.xs[j] * k + ox, T.ys[j] * k + oy);
    }
  };
  if (road) {
    line();
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.lineWidth = Math.max(5, T.width * k) + 5;
    g.stroke();
    g.strokeStyle = 'rgba(8,4,18,.9)';
    g.lineWidth = Math.max(5, T.width * k);
    g.stroke();
  }
  g.lineWidth = lineW;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, T.colors[0]);
  grad.addColorStop(1, T.colors[1]);
  g.strokeStyle = grad;
  line();
  g.stroke();
  if (road) {
    // largada: raya a cuadros y flecha con el sentido de marcha
    const x = T.xs[0] * k + ox;
    const y = T.ys[0] * k + oy;
    const a = Math.atan2(T.ty[0], T.tx[0]);
    const hw = Math.max(5, T.width * k) / 2 + 2;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    for (let q = -hw; q < hw; q += 3) {
      g.fillStyle = Math.round((q + hw) / 3) % 2 ? '#fff' : '#111';
      g.fillRect(-1.5, q, 3, 3);
    }
    g.translate(Math.max(14, hw * 2.4), 0);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(5, 0);
    g.lineTo(-3, -4);
    g.lineTo(-3, 4);
    g.closePath();
    g.fill();
    g.restore();
  } else {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(T.xs[0] * k + ox, T.ys[0] * k + oy, lineW, 0, TAU);
    g.fill();
  }
  return { canvas: c, k, ox, oy, w, h };
}
