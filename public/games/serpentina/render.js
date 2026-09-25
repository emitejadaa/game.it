/**
 * Serpentina — dibujo en canvas 2D. Cada serpiente es un Path2D que se traza varias veces
 * (contorno, cuerpo, rayas que acompañan el movimiento y brillo); la comida son sprites de luz
 * precalculados por color; el fondo es una trama hexagonal que se escala con el zoom.
 */
import { PALETTE, bodyR, foodR, spacing } from './shared/world.js';

const TAU = Math.PI * 2;

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const shades = new Map();
function shade(hex, k) {
  const key = hex + k;
  let v = shades.get(key);
  if (!v) {
    const [r, g, b] = rgb(hex);
    v = k <= 1 ? `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})` : `rgb(${Math.round(r + (255 - r) * (k - 1))},${Math.round(g + (255 - g) * (k - 1))},${Math.round(b + (255 - b) * (k - 1))})`;
    shades.set(key, v);
  }
  return v;
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sprites = PALETTE.map((c) => this.sprite(c));
    this.resize();
    this.theme({ theme: 'dark', glow: true, colors: {} });
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
    this.accent = p.colors?.accent || '#00f0ff';
    this.bg = this.dark ? '#08090d' : '#eef0f5';
    this.outside = this.dark ? '#140609' : '#f5dde2';
    this.hex = this.hexTile();
  }

  sprite(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const [r, gg, b] = rgb(color);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, `rgba(${r},${gg},${b},1)`);
    grad.addColorStop(0.42, `rgba(${r},${gg},${b},.45)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  hexTile() {
    const c = document.createElement('canvas');
    const w = 84;
    const h = Math.round(w * Math.sqrt(3));
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = this.bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = this.dark ? 'rgba(255,255,255,.045)' : 'rgba(20,20,60,.07)';
    g.lineWidth = 2;
    const r = w / 3;
    const hex = (cx, cy) => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      g.stroke();
    };
    hex(0, 0);
    hex(w, 0);
    hex(0, h);
    hex(w, h);
    hex(w / 2, h / 2);
    return c;
  }

  draw(v) {
    const { ctx, w, h, dpr } = this;
    const { cam } = v;
    const s = cam.s;
    const ox = w / 2 - cam.x * s;
    const oy = h / 2 - cam.y * s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.outside;
    ctx.fillRect(0, 0, w, h);
    // arena con trama hexagonal
    if (!this.pattern || this.patternFor !== this.hex) {
      this.pattern = ctx.createPattern(this.hex, 'repeat');
      this.patternFor = this.hex;
    }
    this.pattern.setTransform(new DOMMatrix([s, 0, 0, s, ox, oy]));
    ctx.save();
    ctx.beginPath();
    ctx.arc(ox, oy, v.R * s, 0, TAU);
    ctx.fillStyle = this.pattern;
    ctx.fill();
    ctx.restore();
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    const x0 = cam.x - w / 2 / s - 40;
    const x1 = cam.x + w / 2 / s + 40;
    const y0 = cam.y - h / 2 / s - 40;
    const y1 = cam.y + h / 2 / s + 40;
    // borde
    ctx.strokeStyle = '#ff3b5c';
    ctx.lineWidth = 8 / s;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, v.R, 0, TAU);
    ctx.stroke();
    if (this.glow) {
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 40 / s;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.food(v, x0, y0, x1, y1);
    // serpientes: muertas (desvaneciéndose), el resto y la propia arriba
    for (const c of v.corpses) this.snake(c, v, s, x0, y0, x1, y1, Math.max(0, 1 - (v.t - c.diedAt) / 600));
    let mine = null;
    for (const sn of v.snakes.values()) {
      if (sn.num === v.me) mine = sn;
      else this.snake(sn, v, s, x0, y0, x1, y1, 1);
    }
    if (mine) this.snake(mine, v, s, x0, y0, x1, y1, 1);
    for (const sn of v.snakes.values()) if (sn.num !== v.me) this.name(sn, v, s);
  }

  food(v, x0, y0, x1, y1) {
    const { ctx } = this;
    const t = v.t / 1000;
    ctx.globalCompositeOperation = this.dark ? 'lighter' : 'source-over';
    for (const f of v.foods) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      let r = foodR(f.v);
      const age = v.t - f.born;
      if (age < 400) r *= age / 400;
      const pulse = this.motion ? 1 + 0.14 * Math.sin(t * 3.2 + f.id) : 1;
      const size = r * 4.2 * pulse;
      ctx.drawImage(this.sprites[f.c] || this.sprites[0], f.x - size / 2, f.y - size / 2, size, size);
    }
    // comida que vuela a la boca
    for (const e of v.sucked) {
      const k = Math.min(1, (v.t - e.t) / 160);
      const to = v.snakes.get(e.by);
      const tx = to ? to.hx : e.x;
      const ty = to ? to.hy : e.y;
      const size = foodR(e.v) * 4.2 * (1 - k * 0.8);
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.drawImage(this.sprites[e.c] || this.sprites[0], e.x + (tx - e.x) * k - size / 2, e.y + (ty - e.y) * k - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  snake(sn, v, s, x0, y0, x1, y1, alpha) {
    const pts = sn.pts;
    if (pts.length < 2 || alpha <= 0) return;
    const r = bodyR(sn.m);
    // descarte rápido si está fuera de pantalla
    let inView = sn.hx > x0 - r && sn.hx < x1 + r && sn.hy > y0 - r && sn.hy < y1 + r;
    if (!inView) {
      for (let i = 0; i < pts.length; i += 8) {
        if (pts[i] > x0 - r && pts[i] < x1 + r && pts[i + 1] > y0 - r && pts[i + 1] < y1 + r) {
          inView = true;
          break;
        }
      }
    }
    if (!inView) return;
    const { ctx } = this;
    const color = PALETTE[sn.color] || PALETTE[0];
    const path = new Path2D();
    path.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
    path.lineTo(sn.hx, sn.hy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    if (sn.boost && this.glow) {
      ctx.globalCompositeOperation = this.dark ? 'lighter' : 'source-over';
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * (0.22 + (this.motion ? 0.1 * Math.sin(v.t / 45) : 0));
      ctx.lineWidth = r * 3.2;
      ctx.stroke(path);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }
    if (alpha < 1) {
      // al morir: brillo que se expande
      ctx.globalCompositeOperation = this.dark ? 'lighter' : 'source-over';
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.4;
      ctx.lineWidth = r * (2 + (1 - alpha) * 3);
      ctx.stroke(path);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = r * 2 + 3 / s;
    ctx.stroke(path);
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 2;
    ctx.stroke(path);
    // rayas fijas al cuerpo
    const S = spacing(sn.m);
    ctx.setLineDash([r * 0.9, r * 1.3]);
    ctx.lineDashOffset = sn.trimmed * S;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = shade(color, 0.72);
    ctx.lineWidth = r * 1.8;
    ctx.stroke(path);
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = r * 0.55;
    ctx.stroke(path);
    // cabeza y ojos
    const a = sn.look ?? sn.a;
    const ca = Math.cos(sn.a);
    const sa = Math.sin(sn.a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sn.hx, sn.hy, r * 1.04, 0, TAU);
    ctx.fill();
    for (const side of [-1, 1]) {
      const ex = sn.hx + ca * r * 0.32 - sa * r * 0.48 * side;
      const ey = sn.hy + sa * r * 0.32 + ca * r * 0.48 * side;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0b0c12';
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * r * 0.17, ey + Math.sin(a) * r * 0.17, r * 0.23, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  name(sn, v, s) {
    const p = v.players.get(sn.num);
    if (!p?.name) return;
    const r = bodyR(sn.m);
    const { ctx } = this;
    const size = 13 / s;
    ctx.font = `600 ${size}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.dark ? 'rgba(255,255,255,.7)' : 'rgba(20,20,30,.7)';
    ctx.fillText(p.name, sn.hx, sn.hy - r * 1.3 - 4 / s);
  }
}

/** Minimapa circular con la arena, los líderes y la posición propia. */
export function drawMini(cv, { R, me, lb, meNum, dark, accent }) {
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const k = (W / 2 - 3) / R;
  ctx.clearRect(0, 0, W, W);
  ctx.beginPath();
  ctx.arc(W / 2, W / 2, W / 2 - 2, 0, TAU);
  ctx.fillStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,59,92,.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const [num, , x, y] of lb) {
    if (num === meNum) continue;
    ctx.fillStyle = dark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.arc(W / 2 + x * k, W / 2 + y * k, 2.4, 0, TAU);
    ctx.fill();
  }
  if (me) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(W / 2 + me.x * k, W / 2 + me.y * k, 4, 0, TAU);
    ctx.fill();
  }
}
