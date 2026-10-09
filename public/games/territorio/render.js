/**
 * Territorio — dibujo en canvas 2D.
 *  - El territorio vive en una textura de UN píxel por celda (canvas fuera de pantalla). Cuando llega una diferencia
 *    solo se repintan las celdas que cambiaron (y sus vecinas, por el borde) y se sube el rectángulo sucio; cada cuadro
 *    es un único drawImage escalado sin suavizar. Nunca se recorre el mapa celda por celda al dibujar.
 *  - La grilla es un patrón cacheado (mosaico de 8×8 celdas). Las estelas son poligonales; el brillo sale de una segunda
 *    pasada ancha y transparente y de sprites pre-renderizados, solo si el portal tiene el brillo prendido; nunca shadowBlur.
 *  - Las partículas de las muertes no existen con "reducir movimiento".
 * Todo se dibuja en píxeles CSS (el contexto ya trae la escala del dispositivo); una celda mide `cell` píxeles.
 */
import { PALETTE } from './shared/world.js';
import { fitCell } from './logic.js';

const TAU = Math.PI * 2;

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Color más oscuro (para fondos claros, donde los neones se pierden). */
const shade = (h, k) => `rgb(${hex(h).map((v) => Math.round(v * k)).join(',')})`;

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
    this.rgbs = PALETTE.map(hex);
    this.colorOf = () => 0; // num de jugador → índice de color (lo pone el juego)
    this.meNum = 0;
    this.rgbCache = new Map();
    this.n = 0;
    this.dirty = null;
    this.theme({});
    this.resize();
  }

  /** Cambia el tamaño del mapa (crea la textura del territorio). */
  setSize(n) {
    if (this.n === n) return;
    this.n = n;
    this.tex = document.createElement('canvas');
    this.tex.width = this.tex.height = n;
    this.texCtx = this.tex.getContext('2d');
    this.img = this.texCtx.createImageData(n, n);
    this.dirty = null;
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
    this.rgbs = PALETTE.map((c) => (this.dark ? hex(c) : hex(c).map((v) => Math.round(v * 0.74))));
    this.sprites.clear();
    this.pattern = null;
    this.invalidate();
  }

  /** Los colores de los jugadores o el tema cambiaron: hay que repintar todo el territorio. */
  invalidate() {
    this.rgbCache.clear();
    this.allDirty = true;
  }

  rgbOf(num) {
    let c = this.rgbCache.get(num);
    if (!c) {
      c = this.rgbs[this.colorOf(num) % this.rgbs.length];
      this.rgbCache.set(num, c);
    }
    return c;
  }

  // ------------------------------------------------ territorio
  setPx(grid, c) {
    const n = this.n;
    const d = this.img.data;
    const o = grid[c];
    const i = c * 4;
    if (!o) {
      d[i + 3] = 0;
      return;
    }
    const x = c % n;
    // borde: algún vecino de otro dueño (el borde del mapa no cuenta)
    const edge = (x > 0 && grid[c - 1] !== o) || (x < n - 1 && grid[c + 1] !== o) || (c >= n && grid[c - n] !== o) || (c < n * (n - 1) && grid[c + n] !== o);
    const rgb = this.rgbOf(o);
    d[i] = rgb[0];
    d[i + 1] = rgb[1];
    d[i + 2] = rgb[2];
    const mine = o === this.meNum;
    d[i + 3] = edge ? (this.dark ? 215 : 225) : mine ? (this.dark ? 112 : 120) : this.dark ? 88 : 100;
  }

  /** Repinta las celdas `idx` (índices que cambiaron en `grid`) y sus vecinas. */
  paint(grid, idx) {
    if (!this.n) return;
    const n = this.n;
    let x0 = n;
    let y0 = n;
    let x1 = -1;
    let y1 = -1;
    for (let k = 0; k < idx.length; k++) {
      const c = idx[k];
      const x = c % n;
      const y = (c - x) / n;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) return;
    x0 = Math.max(0, x0 - 1);
    y0 = Math.max(0, y0 - 1);
    x1 = Math.min(n - 1, x1 + 1);
    y1 = Math.min(n - 1, y1 + 1);
    // solo las celdas cambiadas y sus 4 vecinas (el rectángulo es solo para subir la textura)
    for (let k = 0; k < idx.length; k++) {
      const c = idx[k];
      const x = c % n;
      this.setPx(grid, c);
      if (x > 0) this.setPx(grid, c - 1);
      if (x < n - 1) this.setPx(grid, c + 1);
      if (c >= n) this.setPx(grid, c - n);
      if (c < n * (n - 1)) this.setPx(grid, c + n);
    }
    const d = this.dirty;
    if (d) {
      d[0] = Math.min(d[0], x0);
      d[1] = Math.min(d[1], y0);
      d[2] = Math.max(d[2], x1);
      d[3] = Math.max(d[3], y1);
    } else this.dirty = [x0, y0, x1, y1];
  }

  paintAll(grid) {
    if (!this.n) return;
    const total = this.n * this.n;
    for (let c = 0; c < total; c++) this.setPx(grid, c);
    this.dirty = [0, 0, this.n - 1, this.n - 1];
    this.allDirty = false;
  }

  flush() {
    const d = this.dirty;
    if (!d) return;
    this.texCtx.putImageData(this.img, 0, 0, d[0], d[1], d[2] - d[0] + 1, d[3] - d[1] + 1);
    this.dirty = null;
  }

  // ------------------------------------------------ patrón de la grilla
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
      const size = 36;
      s = document.createElement('canvas');
      s.width = s.height = size * 2;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(size, size, 0, size, size, size);
      g.addColorStop(0, color);
      g.addColorStop(0.25, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 0.5;
      c.fillStyle = g;
      c.fillRect(0, 0, size * 2, size * 2);
      this.sprites.set(color, s);
    }
    return s;
  }

  /** Explosión de un jugador en la celda (x, y). Con movimiento reducido no hace nada. */
  burst(x, y, color) {
    if (!this.motion) return;
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.5;
      const v = 4 + Math.random() * 14;
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 450 + Math.random() * 450, color });
    }
    if (this.fx.length > 240) this.fx.splice(0, this.fx.length - 240);
  }

  // ------------------------------------------------ cuadro
  /** @param f { cam: {x, y}, size, bikes: [{ pts, n, color, dir, me, name }], dt, t } */
  draw(f) {
    const { ctx, w, h, dpr, cell } = this;
    const { cam, size } = f;
    if (this.allDirty && f.grid) this.paintAll(f.grid);
    this.flush();
    // desplazamiento del mundo en píxeles de dispositivo enteros: la grilla y el territorio no tiemblan
    const oxd = Math.round((w / 2 - cam.x * cell) * dpr);
    const oyd = Math.round((h / 2 - cam.y * cell) * dpr);
    const ox = oxd / dpr;
    const oy = oyd / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.void;
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
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
      ctx.setTransform(1, 0, 0, 1, oxd, oyd); // el mosaico queda anclado a la esquina del mapa
      ctx.fillStyle = this.pattern;
      ctx.fillRect((fx0 - ox) * dpr, (fy0 - oy) * dpr, (fx1 - fx0) * dpr, (fy1 - fy0) * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // territorio: una sola imagen escalada
    if (this.n === size) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.tex, ox, oy, side, side);
    }
    // borde del mapa
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

    // estelas y cabezas (la propia al final: queda arriba)
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) for (const b of f.bikes) if (!!b.me === (pass === 1)) this.trail(b, ox, oy);
    ctx.lineCap = 'butt';
    for (let pass = 0; pass < 2; pass++) for (const b of f.bikes) if (!!b.me === (pass === 1)) this.head(b, ox, oy, f.t);

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
        ctx.fillRect(ox + p.x * cell - 2, oy + p.y * cell - 2, 4, 4);
      }
      this.fx.length = k;
      ctx.globalAlpha = 1;
    }
  }

  trail(b, ox, oy) {
    const { ctx, cell, w, h } = this;
    const pts = b.pts;
    const n = b.n;
    if (n < 4) return;
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
    if (ox + (x1 + 0.5) * cell < -20 || ox + (x0 + 0.5) * cell > w + 20 || oy + (y1 + 0.5) * cell < -20 || oy + (y0 + 0.5) * cell > h + 20) return;
    const color = this.colors[b.color % this.colors.length];
    ctx.beginPath();
    ctx.moveTo(ox + (pts[0] + 0.5) * cell, oy + (pts[1] + 0.5) * cell);
    for (let i = 2; i < n; i += 2) ctx.lineTo(ox + (pts[i] + 0.5) * cell, oy + (pts[i + 1] + 0.5) * cell);
    ctx.strokeStyle = color;
    const lw = Math.max(3, cell * 0.46);
    if (this.glow) {
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = lw * 2.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  head(b, ox, oy, t) {
    const { ctx, cell, w, h } = this;
    const n = b.n;
    if (n < 2) return;
    const hx = ox + (b.pts[n - 2] + 0.5) * cell;
    const hy = oy + (b.pts[n - 1] + 0.5) * cell;
    if (hx < -30 || hx > w + 30 || hy < -30 || hy > h + 30) return;
    const color = this.colors[b.color % this.colors.length];
    const s = Math.max(7, cell * 0.8);
    if (this.glow) {
      ctx.globalAlpha = (b.out ? 0.8 : 0.5) * (this.dark ? 1 : 0.5);
      ctx.drawImage(this.halo(color), hx - 22, hy - 22, 44, 44);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
    ctx.fillStyle = '#fff';
    ctx.fillRect(hx - s * 0.18, hy - s * 0.18, s * 0.36, s * 0.36);
    if (b.me) {
      ctx.strokeStyle = this.ink;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx - s / 2 - 3, hy - s / 2 - 3, s + 6, s + 6);
      ctx.globalAlpha = 1;
    } else if (b.name) {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.ink;
      ctx.globalAlpha = 0.8;
      ctx.fillText(b.name, hx, hy - s / 2 - 6);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------ minimapa
  /** Pinta el minimapa que mandó el servidor (corridas ya decodificadas) en un canvas chico. */
  paintMini(mini) {
    if (!mini) return;
    const side = mini.side;
    if (!this.mini || this.mini.width !== side) {
      this.mini = document.createElement('canvas');
      this.mini.width = this.mini.height = side;
    }
    const c = this.mini.getContext('2d');
    const img = c.createImageData(side, side);
    const d = img.data;
    for (let i = 0; i < mini.owner.length; i++) {
      const o = mini.owner[i];
      if (!o) continue;
      const rgb = this.rgbOf(o);
      d[i * 4] = rgb[0];
      d[i * 4 + 1] = rgb[1];
      d[i * 4 + 2] = rgb[2];
      d[i * 4 + 3] = o === this.meNum ? 255 : 190;
    }
    c.putImageData(img, 0, 0);
  }

  /** Minimapa: el mapa en baja resolución, el cuadro que se ve ahora y las cabezas que se conocen. */
  drawMini(cv, { size, bikes, cam, viewW, viewH }) {
    const c = cv.getContext('2d');
    const W = cv.width;
    const k = W / size;
    c.clearRect(0, 0, W, W);
    c.fillStyle = this.dark ? 'rgba(10,10,16,0.75)' : 'rgba(255,255,255,0.75)';
    c.fillRect(0, 0, W, W);
    if (this.mini) {
      c.imageSmoothingEnabled = false;
      c.drawImage(this.mini, 0, 0, W, W);
    }
    c.strokeStyle = this.accent;
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, W - 1, W - 1);
    c.strokeStyle = this.dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
    c.strokeRect((cam.x - viewW / 2) * k, (cam.y - viewH / 2) * k, viewW * k, viewH * k);
    for (const b of bikes) {
      c.fillStyle = b.me ? this.ink : this.colors[b.color % this.colors.length];
      const r = b.me ? 4 : 3;
      c.fillRect(b.x * k - r / 2, b.y * k - r / 2, r, r);
    }
  }
}
