/**
 * Estela — dibujo en canvas 2D.
 *  - La grilla es un patrón cacheado (un mosaico de 8×8 celdas que se repite), no se vuelve a dibujar línea por línea.
 *  - Las estelas son poligonales de ancho 3 con el color del jugador. El brillo sale de una segunda pasada ancha y
 *    transparente y de sprites pre-renderizados, solo si el portal tiene el brillo prendido; nunca shadowBlur.
 *  - Las partículas de los choques no existen con "reducir movimiento".
 * Todo se dibuja en píxeles CSS (el contexto ya trae la escala del dispositivo); una celda mide `cell` píxeles.
 */
import { PALETTE } from './shared/world.js';
import { fitCell } from './logic.js';

const TAU = Math.PI * 2;

/** Color más oscuro (para fondos claros, donde los neones se pierden). */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dark = true;
    this.glow = true;
    this.motion = true;
    this.fx = []; // partículas { x, y, vx, vy, age, life, color }
    this.sprites = new Map();
    this.pattern = null;
    this.colors = PALETTE.slice();
    this.theme({});
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.cell = fitCell(this.w, this.h, this.dpr);
    this.pattern = null;
  }

  theme(p) {
    this.dark = p.theme !== 'light';
    this.glow = p.glow !== false;
    this.motion = !p.reducedMotion;
    this.accent = p.colors?.accent || '#00f0ff';
    this.bg = p.colors?.bg || (this.dark ? '#07070a' : '#f3f3f7');
    this.void = this.dark ? '#030305' : '#e4e4ec';
    this.floor = this.dark ? '#0a0a10' : '#fbfbfe';
    this.ink = this.dark ? '#ffffff' : '#15151c';
    this.colors = PALETTE.map((c) => (this.dark ? c : shade(c, 0.74)));
    this.sprites.clear();
    this.pattern = null;
  }

  /** Mosaico de la grilla: líneas finas por celda y una algo más marcada cada 8. */
  makePattern() {
    const dev = Math.round(this.cell * this.dpr);
    const n = dev * 8;
    const t = document.createElement('canvas');
    t.width = t.height = n;
    const c = t.getContext('2d');
    const rgb = this.dark ? '255,255,255' : '20,20,50';
    c.fillStyle = `rgba(${rgb},0.045)`;
    for (let i = 1; i < 8; i++) {
      c.fillRect(i * dev, 0, 1, n);
      c.fillRect(0, i * dev, n, 1);
    }
    c.fillStyle = `rgba(${rgb},0.1)`;
    c.fillRect(0, 0, 1, n);
    c.fillRect(0, 0, n, 1);
    this.pattern = this.ctx.createPattern(t, 'repeat');
  }

  /** Halo pre-renderizado de un color (se dibuja con drawImage: sin costo por cuadro). */
  halo(color) {
    let s = this.sprites.get(color);
    if (!s) {
      const size = 44;
      s = document.createElement('canvas');
      s.width = s.height = size * 2;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(size, size, 0, size, size, size);
      g.addColorStop(0, color);
      g.addColorStop(0.25, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 0.55;
      c.fillStyle = g;
      c.fillRect(0, 0, size * 2, size * 2);
      this.sprites.set(color, s);
    }
    return s;
  }

  /** Explosión de una moto en la celda (x, y). Con movimiento reducido no hace nada. */
  burst(x, y, color) {
    if (!this.motion) return;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.5;
      const v = 6 + Math.random() * 22;
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 450 + Math.random() * 450, color });
    }
    if (this.fx.length > 260) this.fx.splice(0, this.fx.length - 260);
  }

  /** @param f { cam: {x, y}, size, bikes: [{ pts, n, color, dir, turbo, shield, me, name }], dt, t } */
  draw(f) {
    const { ctx, w, h, dpr, cell } = this;
    const { cam, size } = f;
    // desplazamiento del mundo en píxeles de dispositivo enteros: la grilla no tiembla
    const oxd = Math.round((w / 2 - cam.x * cell) * dpr);
    const oyd = Math.round((h / 2 - cam.y * cell) * dpr);
    const ox = oxd / dpr;
    const oy = oyd / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.void;
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    // suelo de la arena con su grilla
    const side = size * cell;
    const fx0 = Math.max(0, ox);
    const fy0 = Math.max(0, oy);
    const fx1 = Math.min(w, ox + side);
    const fy1 = Math.min(h, oy + side);
    if (fx1 > fx0 && fy1 > fy0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = this.floor;
      ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
      if (!this.pattern) this.makePattern();
      ctx.setTransform(1, 0, 0, 1, oxd, oyd); // el mosaico queda anclado a la esquina de la arena
      ctx.fillStyle = this.pattern;
      ctx.fillRect((fx0 - ox) * dpr, (fy0 - oy) * dpr, (fx1 - fx0) * dpr, (fy1 - fy0) * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // borde de la arena
    ctx.strokeStyle = this.accent;
    ctx.lineJoin = 'miter';
    if (this.glow) {
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 10;
      ctx.strokeRect(ox, oy, side, side);
    }
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, side, side);
    ctx.globalAlpha = 1;

    // estelas y motos (la propia al final: queda arriba)
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const bikes = f.bikes;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of bikes) if (!!b.me === (pass === 1)) this.bike(b, ox, oy, f.t);
    }
    ctx.lineCap = 'butt';

    // partículas
    if (this.fx.length) {
      const dt = f.dt / 1000;
      let k = 0;
      for (const p of this.fx) {
        p.age += f.dt;
        if (p.age >= p.life) continue;
        this.fx[k++] = p;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        ctx.globalAlpha = (1 - p.age / p.life) * 0.95;
        ctx.fillStyle = p.color;
        ctx.fillRect(ox + p.x * cell - 1.5, oy + p.y * cell - 1.5, 3, 3);
      }
      this.fx.length = k;
      ctx.globalAlpha = 1;
    }
  }

  bike(b, ox, oy, t) {
    const { ctx, cell, w, h } = this;
    const pts = b.pts;
    const n = b.n;
    if (n < 2) return;
    // cajón de la estela (para saltear lo que no se ve)
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    for (let i = 0; i < n; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const sx0 = ox + (x0 + 0.5) * cell;
    const sx1 = ox + (x1 + 0.5) * cell;
    const sy0 = oy + (y0 + 0.5) * cell;
    const sy1 = oy + (y1 + 0.5) * cell;
    if (sx1 < -20 || sx0 > w + 20 || sy1 < -20 || sy0 > h + 20) return;
    const color = this.colors[b.color % this.colors.length];
    const blink = b.shield && (Math.floor(t / 90) & 1) === 0;
    ctx.beginPath();
    ctx.moveTo(ox + (pts[0] + 0.5) * cell, oy + (pts[1] + 0.5) * cell);
    for (let i = 2; i < n; i += 2) ctx.lineTo(ox + (pts[i] + 0.5) * cell, oy + (pts[i + 1] + 0.5) * cell);
    ctx.strokeStyle = color;
    if (this.glow) {
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 9;
      ctx.stroke();
    }
    ctx.globalAlpha = blink ? 0.4 : 1;
    ctx.lineWidth = 3;
    ctx.stroke();
    const hx = ox + (pts[n - 2] + 0.5) * cell;
    const hy = oy + (pts[n - 1] + 0.5) * cell;
    if (b.turbo && n >= 4) {
      // chispa blanca pegada a la cabeza: se nota el turbo
      const px = ox + (pts[n - 4] + 0.5) * cell;
      const py = oy + (pts[n - 3] + 0.5) * cell;
      const d = Math.hypot(hx - px, hy - py) || 1;
      const k = Math.min(1, (cell * 4) / d);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx + (px - hx) * k, hy + (py - hy) * k);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (this.glow) {
      ctx.globalAlpha = (b.turbo ? 0.95 : 0.7) * (this.dark ? 1 : 0.5);
      ctx.drawImage(this.halo(color), hx - 22, hy - 22, 44, 44);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hx, hy, 3.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(hx, hy, 1.4, 0, TAU);
    ctx.fill();
    if (b.shield) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = blink ? 0.35 : 0.9;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, 9, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (b.me) {
      ctx.strokeStyle = this.ink;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, 6.5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (b.name) {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.ink;
      ctx.globalAlpha = 0.75;
      ctx.fillText(b.name, hx, hy - 12);
      ctx.globalAlpha = 1;
    }
  }
}

/** Minimapa: la arena, las motos que se conocen y el cuadro que se ve ahora. */
export function drawMini(cv, { size, bikes, cam, viewW, viewH, colors, dark, accent }) {
  const c = cv.getContext('2d');
  const W = cv.width;
  const k = W / size;
  c.clearRect(0, 0, W, W);
  c.fillStyle = dark ? 'rgba(10,10,16,0.7)' : 'rgba(255,255,255,0.7)';
  c.fillRect(0, 0, W, W);
  c.strokeStyle = accent;
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, W - 1, W - 1);
  c.strokeStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
  c.strokeRect((cam.x - viewW / 2) * k, (cam.y - viewH / 2) * k, viewW * k, viewH * k);
  for (const b of bikes) {
    c.fillStyle = colors[b.color % colors.length];
    const r = b.me ? 3 : 2;
    c.fillRect(b.x * k - r / 2, b.y * k - r / 2, r, r);
  }
}
