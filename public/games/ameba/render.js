/**
 * Ameba — dibujo en canvas 2D. Las membranas se deforman al tocarse (burbujas que se aplastan
 * contra la línea que las separa), las esporas giran y la comida se dibuja agrupada por color.
 */
import { PALETTE, FOOD_COLORS } from './shared/world.js';

const TAU = Math.PI * 2;

const shadeCache = new Map();
/** Color más oscuro para el borde de cada célula. */
function shade(hex, k = 0.72) {
  const key = hex + k;
  let v = shadeCache.get(key);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * k);
    const g = Math.round(((n >> 8) & 255) * k);
    const b = Math.round((n & 255) * k);
    v = `rgb(${r},${g},${b})`;
    shadeCache.set(key, v);
  }
  return v;
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.dark = true;
    this.glow = true;
    this.motion = true;
    this.pts = new Float32Array(200);
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
  }

  theme(p) {
    this.dark = p.theme !== 'light';
    this.glow = p.glow !== false;
    this.motion = !p.reducedMotion;
    this.bg = this.dark ? '#07070a' : '#f3f3f7';
    this.gridColor = this.dark ? 'rgba(255,255,255,' : 'rgba(20,20,40,';
    this.accent = p.colors?.accent || '#00f0ff';
    this.text = '#fff';
  }

  /**
   * @param {object} v  { cam: {x, y, s}, size, cells, food, ghosts, players, me, t }
   */
  draw(v) {
    const { ctx, w, h, dpr } = this;
    const { cam } = v;
    const s = cam.s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    // mundo → pantalla
    const ox = w / 2 - cam.x * s;
    const oy = h / 2 - cam.y * s;
    const x0 = cam.x - w / 2 / s;
    const y0 = cam.y - h / 2 / s;
    const x1 = cam.x + w / 2 / s;
    const y1 = cam.y + h / 2 / s;
    this.grid(ox, oy, s, x0, y0, x1, y1, v.size);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    this.border(v.size, s);
    this.food(v.food, x0 - 10, y0 - 10, x1 + 10, y1 + 10, v.t);
    this.ghosts(v.ghosts, v.t);
    // de chica a grande: las grandes tapan a las chicas (y a las esporas)
    const list = v.cells;
    list.sort((a, b) => a.r - b.r);
    this.neighbors(list);
    for (const c of list) {
      if (c.x + c.r < x0 || c.x - c.r > x1 || c.y + c.r < y0 || c.y - c.r > y1) continue;
      if (c.o === -1) this.virus(c, v.t);
      else if (c.o <= -2) this.pellet(c);
      else this.cell(c, v, s);
    }
    // nombres arriba de todo
    for (const c of list) {
      if (c.o < 0 || c.r * s < 9) continue;
      if (c.x + c.r < x0 || c.x - c.r > x1 || c.y + c.r < y0 || c.y - c.r > y1) continue;
      this.label(c, v, s);
    }
  }

  grid(ox, oy, s, x0, y0, x1, y1, size) {
    const { ctx, dpr } = this;
    let step = 50;
    while (step * s < 16) step *= 2;
    const alpha = Math.min(0.07, Math.max(0.02, (step * s - 10) / 400));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = this.gridColor + alpha + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gx0 = Math.max(0, Math.floor(x0 / step) * step);
    const gy0 = Math.max(0, Math.floor(y0 / step) * step);
    const gx1 = Math.min(size, x1);
    const gy1 = Math.min(size, y1);
    const top = Math.max(0, y0) * s + oy;
    const bottom = Math.min(size, y1) * s + oy;
    const left = Math.max(0, x0) * s + ox;
    const right = Math.min(size, x1) * s + ox;
    for (let x = gx0; x <= gx1; x += step) {
      const px = Math.round(x * s + ox) + 0.5;
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
    }
    for (let y = gy0; y <= gy1; y += step) {
      const py = Math.round(y * s + oy) + 0.5;
      ctx.moveTo(left, py);
      ctx.lineTo(right, py);
    }
    ctx.stroke();
  }

  border(size, s) {
    const { ctx } = this;
    ctx.strokeStyle = this.accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 6 / s;
    ctx.strokeRect(0, 0, size, size);
    if (this.glow && this.dark) {
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 26 / s;
      ctx.strokeRect(0, 0, size, size);
    }
    ctx.globalAlpha = 1;
  }

  food(f, x0, y0, x1, y1, t) {
    if (!f) return;
    const { ctx } = this;
    const n = f.n;
    const fr = 5.5;
    for (let ci = 0; ci < FOOD_COLORS.length; ci++) {
      ctx.fillStyle = FOOD_COLORS[ci];
      ctx.beginPath();
      for (let i = ci; i < n; i += FOOD_COLORS.length) {
        const x = f.x[i];
        const y = f.y[i];
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const age = t - f.born[i];
        const r = age < 300 ? fr * (age / 300) : fr;
        if (r <= 0.3) continue;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fill();
    }
  }

  ghosts(list, t) {
    // comida que se está comiendo: se achica rumbo a la célula
    const { ctx } = this;
    for (const g of list) {
      const k = (t - g.t) / 140;
      if (k >= 1) continue;
      ctx.fillStyle = g.c;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.arc(g.x + (g.tx - g.x) * k, g.y + (g.ty - g.y) * k, 5.5 * (1 - k * 0.7), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Vecinas que se tocan y no se pueden comer entre sí (para aplastar las membranas). */
  neighbors(list) {
    for (const c of list) c.nb = null;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (a.o < 0) continue;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (b.o < 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const sum = a.r + b.r;
        if (dx * dx + dy * dy >= sum * sum) continue;
        const same = a.o === b.o;
        const ratio = a.r > b.r ? a.r / b.r : b.r / a.r;
        if (!same && ratio > 1.118) continue; // una se va a comer a la otra
        (a.nb ||= []).push(b);
        (b.nb ||= []).push(a);
      }
    }
  }

  cell(c, v, s) {
    const { ctx } = this;
    const p = v.players.get(c.o);
    const color = PALETTE[p?.color ?? 0] || PALETTE[0];
    const R = c.r * s;
    const n = Math.max(18, Math.min(72, Math.round(R / 2.4)));
    const pts = this.pts.length >= n * 2 ? this.pts : (this.pts = new Float32Array(n * 2));
    const wob = this.motion ? (c.r < 60 ? 0.02 : 0.011) : 0;
    const t = v.t / 1000;
    const seed = c.id * 0.37;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      let ri = c.r * (1 + wob * Math.sin(t * 3.1 + a * 5 + seed) + wob * 0.6 * Math.sin(t * 1.7 - a * 3 + seed));
      if (c.nb) {
        for (const o of c.nb) {
          const dx = o.x - c.x;
          const dy = o.y - c.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const dot = (ux * dx + uy * dy) / d;
          if (dot <= 0) continue;
          const dA = (d * d + c.r * c.r - o.r * o.r) / (2 * d);
          const lim = dA / dot;
          if (lim < ri) ri = Math.max(lim, c.r * 0.3);
        }
      }
      pts[i * 2] = c.x + ux * ri;
      pts[i * 2 + 1] = c.y + uy * ri;
    }
    const path = () => {
      ctx.beginPath();
      const mx = (pts[0] + pts[(n - 1) * 2]) / 2;
      const my = (pts[1] + pts[(n - 1) * 2 + 1]) / 2;
      ctx.moveTo(mx, my);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2);
      }
      ctx.closePath();
    };
    if (this.glow && this.dark && R > 6) {
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * 1.13, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    path();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(2.2 / s, c.r * 0.075);
    ctx.strokeStyle = shade(color);
    ctx.stroke();
    // brillo interior
    if (R > 14) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(c.x - c.r * 0.34, c.y - c.r * 0.4, c.r * 0.26, c.r * 0.15, -0.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (c.o === v.me && c.fresh) {
      // anillo al nacer
      ctx.globalAlpha = Math.max(0, 1 - c.fresh);
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 3 / s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * (1.1 + c.fresh * 0.6), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  label(c, v, s) {
    const { ctx } = this;
    const p = v.players.get(c.o);
    if (!p) return;
    const size = Math.max(12 / s, c.r * 0.36);
    const mine = c.o === v.me;
    ctx.font = `700 ${size}px Fredoka, Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5 / s, size * 0.14);
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    const name = p.name || '';
    if (name) {
      ctx.strokeText(name, c.x, c.y, c.r * 1.8);
      ctx.fillStyle = '#fff';
      ctx.fillText(name, c.x, c.y, c.r * 1.8);
    }
    if (mine && c.r * s > 22) {
      const ms = size * 0.52;
      ctx.font = `600 ${ms}px Fredoka, Rubik, system-ui, sans-serif`;
      const m = String(Math.round((c.r / 7) ** 2));
      const y = c.y + size * 0.72;
      ctx.lineWidth = Math.max(2 / s, ms * 0.14);
      ctx.strokeText(m, c.x, y);
      ctx.fillText(m, c.x, y);
    }
  }

  virus(c, t) {
    const { ctx } = this;
    const spikes = 22;
    const rot = this.motion ? (t / 1000) * 0.25 + c.id : c.id;
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = rot + (i / (spikes * 2)) * TAU;
      const r = i % 2 ? c.r * 0.9 : c.r * 1.06;
      const x = c.x + Math.cos(a) * r;
      const y = c.y + Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = this.dark ? 'rgba(182,255,0,.22)' : 'rgba(76,148,0,.28)';
    ctx.fill();
    ctx.lineWidth = Math.max(3, c.r * 0.06);
    ctx.strokeStyle = this.dark ? '#b6ff00' : '#4c9400';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 0.34, 0, TAU);
    ctx.fillStyle = this.dark ? 'rgba(182,255,0,.35)' : 'rgba(76,148,0,.35)';
    ctx.fill();
  }

  pellet(c) {
    const { ctx } = this;
    const color = PALETTE[-2 - c.o] || PALETTE[0];
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = c.r * 0.12;
    ctx.strokeStyle = shade(color);
    ctx.stroke();
  }
}

/** Minimapa: bordes del mundo, la vista y la posición propia. */
export function drawMini(cv, { size, cam, w, h, me, leaders, dark, accent }) {
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const k = W / size;
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
  ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
  for (const l of leaders) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.arc(l.x * k, l.y * k, 2.2, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.6;
  ctx.strokeRect((cam.x - w / 2 / cam.s) * k, (cam.y - h / 2 / cam.s) * k, (w / cam.s) * k, (h / cam.s) * k);
  ctx.globalAlpha = 1;
  if (me) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cam.x * k, cam.y * k, 3.5, 0, TAU);
    ctx.fill();
  }
}
