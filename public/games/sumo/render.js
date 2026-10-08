/**
 * Sumo (y Rey de la Colina, que hereda de acá) — dibujo en canvas 2D.
 *  - Los discos salen de sprites pre-renderizados por color (cuerpo con degradé y brillo); el halo de neón es otro sprite,
 *    solo si el portal tiene el brillo prendido. Nunca shadowBlur ni degradados nuevos por cuadro.
 *  - La plataforma es un círculo que se achica: un contorno tenue marca el tamaño original y una banda roja el borde peligroso.
 *  - Las partículas (caídas, golpes) no existen con "reducir movimiento"; los destellos de KO sí, quietos y breves.
 * Todo se dibuja en píxeles CSS (el contexto ya trae la escala del dispositivo); una unidad del mundo mide `view.s` píxeles.
 */
import { PALETTE } from './shared/world.js';

const TAU = Math.PI * 2;

/** Color más oscuro (para fondos claros, donde los neones se pierden). */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}

export class DiscRenderer {
  constructor(canvas, palette = PALETTE) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.palette = palette;
    this.dark = true;
    this.glow = true;
    this.motion = true;
    this.fx = []; // partículas { x, y, vx, vy, age, life, color } en coordenadas del mundo
    this.rings = []; // destellos { x, y, color, age, life, r0, r1 }
    this.falls = []; // discos que se están cayendo { x, y, vx, vy, color, age }
    this.sprites = new Map();
    this.trails = new Map(); // id → últimas posiciones mientras hace el Empujón
    this.colors = palette.slice();
    this.view = { s: 1, cx: 0, cy: 0 };
    this.theme({});
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
    this.accent = p.colors?.accent || '#00f0ff';
    this.warn = this.dark ? '#ff3b5c' : '#d4143a';
    this.void = this.dark ? '#050508' : '#e6e6ee';
    this.floor = this.dark ? '#0d0d14' : '#fbfbfe';
    this.floor2 = this.dark ? '#13131d' : '#f0f0f7';
    this.ink = this.dark ? '#ffffff' : '#15151c';
    this.colors = this.palette.map((c) => (this.dark ? c : shade(c, 0.74)));
    this.sprites.clear();
  }

  /** Cuerpo del disco: degradé radial con un brillo arriba a la izquierda y el borde más oscuro. */
  body(color) {
    const key = `b${color}`;
    let s = this.sprites.get(key);
    if (!s) {
      const n = 96;
      s = document.createElement('canvas');
      s.width = s.height = n;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(n * 0.38, n * 0.34, n * 0.04, n / 2, n / 2, n / 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.18, color);
      g.addColorStop(0.85, color);
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(n / 2, n / 2, n / 2 - 1, 0, TAU);
      c.fill();
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = color;
      c.globalAlpha = 0.5;
      c.fillRect(0, 0, n, n);
      this.sprites.set(key, s);
    }
    return s;
  }

  /** Halo de neón pre-renderizado (se dibuja con drawImage: sin costo por cuadro). */
  halo(color) {
    const key = `h${color}`;
    let s = this.sprites.get(key);
    if (!s) {
      const size = 48;
      s = document.createElement('canvas');
      s.width = s.height = size * 2;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(size, size, 0, size, size, size);
      g.addColorStop(0, color);
      g.addColorStop(0.35, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 0.5;
      c.fillStyle = g;
      c.fillRect(0, 0, size * 2, size * 2);
      this.sprites.set(key, s);
    }
    return s;
  }

  col(i) {
    return this.colors[(i | 0) % this.colors.length];
  }

  // ------------------------------------------------ efectos (coordenadas del mundo)
  /** Un disco que cae: se achica y se va hacia afuera. */
  fall(x, y, vx, vy, color) {
    if (!this.motion) return;
    this.falls.push({ x, y, vx, vy, color, age: 0 });
    if (this.falls.length > 16) this.falls.shift();
    this.burst(x, y, this.col(color), 14);
  }
  burst(x, y, color, n = 16) {
    if (!this.motion) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.5;
      const v = 60 + Math.random() * 180;
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 350 + Math.random() * 350, color });
    }
    if (this.fx.length > 220) this.fx.splice(0, this.fx.length - 220);
  }
  /** Anillo que se abre (KO, Onda). Se muestra aun con movimiento reducido (es corto y no se mueve de lugar). */
  ring(x, y, color, r0, r1, life = 420) {
    this.rings.push({ x, y, color, age: 0, life: this.motion ? life : 160, r0, r1 });
    if (this.rings.length > 24) this.rings.shift();
  }

  // ------------------------------------------------ cuadro
  /**
   * @param f { view: {s, cx, cy}, R, R0, discs: [{ id, x, y, color, name, me, dash, ready, cd, fx, fy, dim }], dt, t, danger }
   */
  draw(f) {
    const { ctx, dpr } = this;
    this.view = f.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.void;
    ctx.fillRect(0, 0, this.w, this.h);
    this.arena(f);
    this.drawTrails(f);
    // los demás primero y la propia arriba
    for (let pass = 0; pass < 2; pass++) for (const d of f.discs) if (!!d.me === (pass === 1)) this.disc(d, f);
    this.drawEffects(f);
    this.top(f);
  }

  /** Lo de arriba de todo (los juegos lo sobreescriben). */
  top() {}

  /** El fondo del juego: acá, la plataforma redonda. */
  arena(f) {
    const { ctx } = this;
    const { s, cx, cy } = f.view;
    const R = f.R * s;
    const R0 = f.R0 * s;
    // contorno del tamaño original
    ctx.strokeStyle = this.ink;
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, R0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (R <= 0.5) return;
    // piso
    ctx.fillStyle = this.floor;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    // marcas del tatami: anillos concéntricos tenues
    ctx.strokeStyle = this.ink;
    ctx.globalAlpha = 0.05;
    ctx.lineWidth = 1;
    for (const k of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * k, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // banda de peligro: más viva cuanto más chica es la plataforma
    const urg = Math.max(0, Math.min(1, 1 - f.R / f.R0));
    ctx.strokeStyle = this.warn;
    ctx.globalAlpha = 0.07 + 0.13 * urg;
    ctx.lineWidth = Math.min(R, 26 * s);
    ctx.beginPath();
    ctx.arc(cx, cy, R - ctx.lineWidth / 2, 0, TAU);
    ctx.stroke();
    // borde
    const pulse = f.danger && this.motion ? 0.55 + 0.45 * Math.sin(f.t / 140) : 1;
    ctx.strokeStyle = f.danger ? this.warn : this.accent;
    if (this.glow) {
      ctx.globalAlpha = 0.16 * pulse;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9 * pulse + 0.1;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawTrails(f) {
    const { ctx } = this;
    const { s, cx, cy } = f.view;
    const seen = new Set();
    for (const d of f.discs) {
      if (!d.dash) continue;
      seen.add(d.id);
      let tr = this.trails.get(d.id);
      if (!tr) this.trails.set(d.id, (tr = []));
      tr.push(d.x, d.y);
      if (tr.length > 14) tr.splice(0, 2);
      const col = this.col(d.color);
      for (let i = 0; i < tr.length; i += 2) {
        const k = (i + 2) / tr.length;
        ctx.globalAlpha = 0.28 * k;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx + tr[i] * s, cy + tr[i + 1] * s, 18 * s * (0.55 + 0.4 * k), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const id of this.trails.keys()) if (!seen.has(id)) this.trails.delete(id);
  }

  disc(d, f) {
    const { ctx } = this;
    const { s, cx, cy } = f.view;
    const x = cx + d.x * s;
    const y = cy + d.y * s;
    const r = (d.r || 18) * s;
    if (x < -40 || y < -40 || x > this.w + 40 || y > this.h + 40) return;
    const col = this.col(d.color);
    if (this.glow) {
      ctx.globalAlpha = (d.dash ? 0.95 : 0.55) * (this.dark ? 1 : 0.45) * (d.dim ? 0.5 : 1);
      ctx.drawImage(this.halo(col), x - r * 2.3, y - r * 2.3, r * 4.6, r * 4.6);
    }
    // sombra
    ctx.globalAlpha = (this.dark ? 0.4 : 0.18) * (d.dim ? 0.5 : 1);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.28, r * 0.95, r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = d.dim ? 0.55 : 1;
    ctx.drawImage(this.body(col), x - r, y - r, r * 2, r * 2);
    // aro: el propio blanco / oscuro; el Empujón en curso, grueso
    ctx.strokeStyle = d.me ? this.ink : col;
    ctx.lineWidth = d.me ? 2 : 1.5;
    ctx.globalAlpha = d.me ? 0.9 : 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    if (d.me) {
      // recarga del Empujón alrededor del propio disco; lista = anillo completo
      const rr = r + 5;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = d.ready ? this.accent : this.ink;
      ctx.globalAlpha = d.ready ? 0.85 : 0.35;
      ctx.beginPath();
      ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * (d.ready ? 1 : Math.max(0.02, d.cd)));
      ctx.stroke();
      // hacia dónde sale el Empujón
      if (d.fx || d.fy) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = this.ink;
        const ax = x + d.fx * (r + 10);
        const ay = y + d.fy * (r + 10);
        ctx.beginPath();
        ctx.moveTo(ax + d.fx * 5, ay + d.fy * 5);
        ctx.lineTo(ax - d.fx * 2 - d.fy * 4, ay - d.fy * 2 + d.fx * 4);
        ctx.lineTo(ax - d.fx * 2 + d.fy * 4, ay - d.fy * 2 - d.fx * 4);
        ctx.fill();
      }
    } else if (d.name) {
      ctx.font = `600 ${Math.max(10, Math.min(13, r * 0.62))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = this.ink;
      ctx.globalAlpha = d.dim ? 0.4 : 0.8;
      ctx.fillText(d.name, x, y - r - 6);
    }
    ctx.globalAlpha = 1;
  }

  drawEffects(f) {
    const { ctx } = this;
    const { s, cx, cy } = f.view;
    const dt = f.dt / 1000;
    // discos que se caen
    if (this.falls.length) {
      let k = 0;
      for (const d of this.falls) {
        d.age += f.dt;
        if (d.age >= 520) continue;
        this.falls[k++] = d;
        const u = d.age / 520;
        const sc = 1 - u;
        const col = this.col(d.color);
        const x = cx + (d.x + d.vx * (d.age / 1000) * 0.5) * s;
        const y = cy + (d.y + d.vy * (d.age / 1000) * 0.5) * s;
        ctx.globalAlpha = 0.9 * sc;
        ctx.drawImage(this.body(col), x - 18 * s * sc, y - 18 * s * sc, 36 * s * sc, 36 * s * sc);
      }
      this.falls.length = k;
      ctx.globalAlpha = 1;
    }
    // anillos
    if (this.rings.length) {
      let k = 0;
      for (const g of this.rings) {
        g.age += f.dt;
        if (g.age >= g.life) continue;
        this.rings[k++] = g;
        const u = g.age / g.life;
        ctx.globalAlpha = 0.9 * (1 - u);
        ctx.strokeStyle = this.col(g.color);
        ctx.lineWidth = 3 * (1 - u) + 1;
        ctx.beginPath();
        ctx.arc(cx + g.x * s, cy + g.y * s, (g.r0 + (g.r1 - g.r0) * u) * s, 0, TAU);
        ctx.stroke();
      }
      this.rings.length = k;
      ctx.globalAlpha = 1;
    }
    // partículas
    if (this.fx.length) {
      let k = 0;
      for (const p of this.fx) {
        p.age += f.dt;
        if (p.age >= p.life) continue;
        this.fx[k++] = p;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.95;
        p.vy *= 0.95;
        ctx.globalAlpha = (1 - p.age / p.life) * 0.95;
        ctx.fillStyle = p.color;
        ctx.fillRect(cx + p.x * s - 1.5, cy + p.y * s - 1.5, 3, 3);
      }
      this.fx.length = k;
      ctx.globalAlpha = 1;
    }
  }
}
