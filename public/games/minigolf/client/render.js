/**
 * Dibujo del minigolf en estilo cartoon: contornos gruesos, sombras sólidas y colores planos.
 * Lo estático (pasto, paredes, zonas) se pre-renderiza una vez por hoyo/tamaño; por cuadro solo se
 * dibujan obstáculos móviles, pelotas y efectos.
 */
import { bounds } from '../shared/holes.js';
import { moverState, BALL_R, CUP_R } from '../shared/physics.js';

const THEMES = {
  light: {
    bg: '#ffe9c7',
    bgDot: 'rgba(255,160,90,.25)',
    ink: '#2b2d42',
    grass: '#7ed957',
    stripe: '#74cf4d',
    wall: '#8e6bff',
    wallTop: '#a88cff',
    sand: '#f7d774',
    sandDot: '#e8c257',
    ice: '#d4f4ff',
    iceLine: '#ffffff',
    water: '#4da8ff',
    waterLine: '#9fd2ff',
    slope: 'rgba(255,255,255,.18)',
    tee: '#b6f09c',
    shadow: 'rgba(43,45,66,.22)',
  },
  dark: {
    bg: '#1d1b3a',
    bgDot: 'rgba(142,107,255,.18)',
    ink: '#0e0c1f',
    grass: '#3fae5a',
    stripe: '#39a352',
    wall: '#7a5cff',
    wallTop: '#9a83ff',
    sand: '#d9b85a',
    sandDot: '#c4a347',
    ice: '#9fd8ea',
    iceLine: '#d9f6ff',
    water: '#2f7fe0',
    waterLine: '#6fb1ff',
    slope: 'rgba(255,255,255,.12)',
    tee: '#63c77a',
    shadow: 'rgba(0,0,0,.35)',
  },
};

export class Renderer {
  constructor(canvas, fx) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = fx;
    this.fctx = fx.getContext('2d');
    this.hole = null;
    this.theme = THEMES.light;
    this.layer = null;
    this.particles = [];
    this.confetti = [];
    this.bumperHit = new Map();
    this.moverHit = new Map();
    this.flagJump = 0;
    this.shake = 0;
    this.glow = true;
    this.reduced = false;
    this.insets = { top: 70, bottom: 90, side: 20 };
  }

  setTheme(name, glow, reduced) {
    this.theme = THEMES[name] || THEMES.light;
    this.glow = glow;
    this.reduced = reduced;
    this.layer = null;
  }

  setHole(hole) {
    this.hole = hole;
    this.layer = null;
    this.bumperHit.clear();
    this.moverHit.clear();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = innerWidth;
    this.h = innerHeight;
    for (const c of [this.c, this.fx]) {
      c.width = Math.round(this.w * dpr);
      c.height = Math.round(this.h * dpr);
    }
    this.layer = null;
  }

  /** Calcula escala/rotación para que el hoyo entre en pantalla (gira 90° en celular vertical). */
  computeView() {
    const b = bounds(this.hole);
    const pad = 30;
    const aw = this.w - this.insets.side * 2;
    const ah = this.h - this.insets.top - this.insets.bottom;
    const rot = ah > aw * 1.1 && b.w > b.h * 1.1;
    const ww = (rot ? b.h : b.w) + pad * 2;
    const wh = (rot ? b.w : b.h) + pad * 2;
    const s = Math.min(aw / ww, ah / wh);
    const ox = this.insets.side + (aw - (rot ? b.h : b.w) * s) / 2;
    const oy = this.insets.top + (ah - (rot ? b.w : b.h) * s) / 2;
    // matriz mundo → pantalla (css px)
    this.view = rot ? { rot, s, a: 0, b: -s, c: s, d: 0, e: ox - s * b.y, f: oy + s * (b.w + b.x) } : { rot, s, a: s, b: 0, c: 0, d: s, e: ox - s * b.x, f: oy - s * b.y };
    this.bounds = b;
    // desplazamiento de sombras: siempre "hacia abajo" en pantalla
    this.sh = (n) => (rot ? [-n, 0] : [0, n]);
  }

  toWorld(sx, sy) {
    const v = this.view;
    return v.rot ? { x: (v.f - sy) / v.s, y: (sx - v.e) / v.s } : { x: (sx - v.e) / v.s, y: (sy - v.f) / v.s };
  }

  toScreen(x, y) {
    const v = this.view;
    return { x: v.a * x + v.c * y + v.e, y: v.b * x + v.d * y + v.f };
  }

  /** Convierte un arrastre en pantalla a un vector del mundo. */
  dragToWorld(dx, dy) {
    return this.view.rot ? { x: -dy, y: dx } : { x: dx, y: dy };
  }

  apply(ctx, extra = 0) {
    const v = this.view;
    const d = this.dpr;
    ctx.setTransform(v.a * d, v.b * d, v.c * d, v.d * d, (v.e + extra) * d, v.f * d);
  }

  lw(px) {
    return px / this.view.s;
  }

  // ---------------- capa estática ----------------
  buildLayer() {
    this.computeView();
    const L = document.createElement('canvas');
    L.width = this.c.width;
    L.height = this.c.height;
    const g = L.getContext('2d');
    const T = this.theme;
    const h = this.hole;
    const b = this.bounds;

    // fondo con lunares
    g.fillStyle = T.bg;
    g.fillRect(0, 0, L.width, L.height);
    g.fillStyle = T.bgDot;
    const step = 34 * this.dpr;
    for (let y = 0; y < L.height + step; y += step)
      for (let x = (y / step) % 2 ? step / 2 : 0; x < L.width + step; x += step) {
        g.beginPath();
        g.arc(x, y, 3 * this.dpr, 0, Math.PI * 2);
        g.fill();
      }

    this.apply(g);
    const outline = () => {
      g.beginPath();
      h.outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    const W = 26; // grosor visual del muro exterior

    // sombra + muro exterior (anillo alrededor del contorno)
    g.save();
    g.lineJoin = 'round';
    g.translate(...this.sh(8));
    outline();
    g.lineWidth = W * 2;
    g.strokeStyle = T.shadow;
    g.stroke();
    g.restore();
    g.lineJoin = 'round';
    outline();
    g.lineWidth = W * 2 + this.lw(6);
    g.strokeStyle = T.ink;
    g.stroke();
    outline();
    g.lineWidth = W * 2;
    g.strokeStyle = T.wall;
    g.stroke();
    outline();
    g.lineWidth = W;
    g.strokeStyle = T.wallTop;
    g.stroke();

    // pasto con franjas de cortadora
    g.save();
    outline();
    g.clip();
    g.fillStyle = T.grass;
    g.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    g.fillStyle = T.stripe;
    for (let x = b.x - b.h; x < b.x + b.w; x += 80) {
      g.beginPath();
      g.moveTo(x, b.y + b.h);
      g.lineTo(x + 40, b.y + b.h);
      g.lineTo(x + 40 + b.h, b.y);
      g.lineTo(x + b.h, b.y);
      g.fill();
    }
    // zonas
    for (const z of h.zones) this.drawZone(g, z);
    // sombra interior del borde
    outline();
    g.lineWidth = this.lw(10);
    g.strokeStyle = 'rgba(0,0,0,.12)';
    g.stroke();
    g.restore();

    // línea de contorno interior
    outline();
    g.lineWidth = this.lw(4);
    g.strokeStyle = T.ink;
    g.stroke();

    // tee
    const [tx, ty] = h.tee;
    this.roundRect(g, tx - 20, ty - 20, 40, 40, 8);
    g.fillStyle = T.tee;
    g.fill();
    g.lineWidth = this.lw(3);
    g.strokeStyle = 'rgba(43,45,66,.35)';
    g.stroke();

    // bloques interiores
    for (const poly of h.blocks) {
      g.save();
      g.translate(...this.sh(7));
      this.poly(g, poly);
      g.fillStyle = T.shadow;
      g.fill();
      g.restore();
      this.poly(g, poly);
      g.fillStyle = T.wall;
      g.fill();
      g.lineWidth = this.lw(4);
      g.strokeStyle = T.ink;
      g.stroke();
    }

    // hoyo
    const [cx, cy] = h.cup;
    g.beginPath();
    g.arc(cx, cy, CUP_R + 4, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fill();
    g.beginPath();
    g.arc(cx, cy, CUP_R, 0, Math.PI * 2);
    g.fillStyle = '#1b1b2b';
    g.fill();
    g.lineWidth = this.lw(3);
    g.strokeStyle = T.ink;
    g.stroke();

    this.layer = L;
  }

  drawZone(g, z) {
    const T = this.theme;
    const shape = () => {
      g.beginPath();
      if (z.rect) this.roundRect(g, ...z.rect, 14);
      else g.arc(z.circle[0], z.circle[1], z.circle[2], 0, Math.PI * 2);
    };
    if (z.type === 'sand') {
      shape();
      g.fillStyle = T.sand;
      g.fill();
      g.save();
      shape();
      g.clip();
      g.fillStyle = T.sandDot;
      const [x0, y0, w, hh] = z.rect || [z.circle[0] - z.circle[2], z.circle[1] - z.circle[2], z.circle[2] * 2, z.circle[2] * 2];
      for (let i = 0; i < (w * hh) / 220; i++) {
        const x = x0 + ((i * 37.7) % w);
        const y = y0 + ((i * 61.3) % hh);
        g.beginPath();
        g.arc(x, y, 1.8, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      shape();
      g.lineWidth = this.lw(3);
      g.strokeStyle = 'rgba(43,45,66,.35)';
      g.stroke();
    } else if (z.type === 'ice') {
      shape();
      g.fillStyle = T.ice;
      g.fill();
      g.save();
      shape();
      g.clip();
      g.strokeStyle = T.iceLine;
      g.lineWidth = 4;
      const [x0, y0, w, hh] = z.rect;
      for (let x = x0 - hh; x < x0 + w; x += 46) {
        g.beginPath();
        g.moveTo(x, y0 + hh);
        g.lineTo(x + hh * 0.5, y0 + hh * 0.5);
        g.stroke();
      }
      g.restore();
    } else if (z.type === 'water') {
      shape();
      g.fillStyle = T.water;
      g.fill();
      g.lineWidth = this.lw(4);
      g.strokeStyle = T.ink;
      g.stroke();
    } else if (z.type === 'slope') {
      shape();
      g.fillStyle = T.slope;
      g.fill();
    } else if (z.type === 'boost') {
      shape();
      g.fillStyle = '#ffb347';
      g.fill();
      g.lineWidth = this.lw(3);
      g.strokeStyle = T.ink;
      g.stroke();
    }
  }

  poly(g, pts) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  }

  roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
  }

  // ---------------- cuadro ----------------
  /**
   * @param st { t: tiempo del hoyo, now: ms, balls: [{x,y,color,turn,hidden,scale,trail}], aim: {x,y,angle,power,color}|null }
   */
  frame(st) {
    if (!this.hole) return;
    if (!this.layer) this.buildLayer();
    const g = this.ctx;
    const T = this.theme;
    const h = this.hole;
    const now = st.now;
    const shakeX = this.shake > 0 && !this.reduced ? Math.sin(now / 16) * this.shake * 6 : 0;
    this.shake = Math.max(0, this.shake - 0.05);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.layer, shakeX * this.dpr, 0);
    this.apply(g, shakeX);

    // agua animada y flechas de pendientes/impulsos
    for (const z of h.zones) {
      if (z.type === 'water') this.drawWaves(g, z, now);
      else if (z.type === 'slope') this.drawArrows(g, z.rect, z.force, now, 'rgba(255,255,255,.55)', 0.06);
      else if (z.type === 'boost') this.drawArrows(g, z.rect, z.dir, now, T.ink, 0.25);
    }

    // portales
    for (const [ax, ay, bx, by] of h.portals) {
      this.drawPortal(g, ax, ay, now, '#8e6bff');
      this.drawPortal(g, bx, by, now, '#3ec1ff');
    }

    // bumpers
    h.bumpers.forEach(([x, y, r], i) => {
      const hit = this.bumperHit.get(i);
      const k = hit ? Math.max(0, 1 - (now - hit) / 350) : 0;
      const sc = 1 + Math.sin(k * Math.PI) * 0.22;
      g.save();
      g.translate(x, y);
      g.beginPath();
      g.arc(...this.sh(6), r, 0, Math.PI * 2);
      g.fillStyle = T.shadow;
      g.fill();
      g.scale(sc, sc);
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fillStyle = k > 0 ? '#ffd166' : '#ff5a5f';
      g.fill();
      g.lineWidth = this.lw(4);
      g.strokeStyle = T.ink;
      g.stroke();
      g.beginPath();
      g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.beginPath();
      g.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      g.fillStyle = '#ff5a5f';
      g.fill();
      g.restore();
    });

    // obstáculos móviles
    h.movers.forEach((m, i) => {
      const s = moverState(m, st.t);
      const hit = this.moverHit.get(i);
      const k = hit ? Math.max(0, 1 - (now - hit) / 250) : 0;
      const color = m.kind === 'bar' ? '#3ec1ff' : '#ff8a3d';
      g.save();
      g.translate(...this.sh(6));
      this.poly(g, s.pts);
      g.fillStyle = T.shadow;
      g.fill();
      g.restore();
      this.poly(g, s.pts);
      g.fillStyle = k > 0 ? '#fff3b0' : color;
      g.fill();
      g.lineWidth = this.lw(4);
      g.lineJoin = 'round';
      g.strokeStyle = T.ink;
      g.stroke();
      if (m.kind === 'bar') {
        g.beginPath();
        g.arc(s.cx, s.cy, 14, 0, Math.PI * 2);
        g.fillStyle = '#ffc93c';
        g.fill();
        g.stroke();
      } else {
        // franjas de advertencia
        g.save();
        this.poly(g, s.pts);
        g.clip();
        g.strokeStyle = 'rgba(43,45,66,.35)';
        g.lineWidth = 6;
        for (let d = -80; d < 80; d += 16) {
          g.beginPath();
          g.moveTo(s.cx + d, s.cy - 60);
          g.lineTo(s.cx + d + 40, s.cy + 60);
          g.stroke();
        }
        g.restore();
      }
    });

    // bandera
    this.drawFlag(g, h.cup, now);

    // partículas del mundo (salpicaduras, arena, destellos)
    this.drawParticles(g, now);

    // pelotas
    for (const b of st.balls) this.drawBall(g, b, now);

    // mira
    if (st.aim) this.drawAim(g, st.aim, now);

    // confeti (en pantalla)
    this.drawConfetti();
  }

  drawWaves(g, z, now) {
    const T = this.theme;
    const [x0, y0, w, h] = z.rect || [z.circle[0] - z.circle[2], z.circle[1] - z.circle[2], z.circle[2] * 2, z.circle[2] * 2];
    g.save();
    g.beginPath();
    if (z.rect) this.roundRect(g, x0, y0, w, h, 14);
    else g.arc(z.circle[0], z.circle[1], z.circle[2], 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = T.waterLine;
    g.lineWidth = 3;
    g.lineCap = 'round';
    const off = this.reduced ? 0 : (now / 40) % 40;
    for (let y = y0 + 18; y < y0 + h; y += 26) {
      g.beginPath();
      for (let x = x0 - 40 + off; x < x0 + w; x += 40) {
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 10, y - 6, x + 20, y);
      }
      g.stroke();
    }
    g.restore();
  }

  drawArrows(g, [x0, y0, w, h], dir, now, color, alpha) {
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const dx = dir[0] / len;
    const dy = dir[1] / len;
    const ang = Math.atan2(dy, dx);
    const step = 60;
    const off = this.reduced ? 0 : ((now / 20) % step) - step;
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();
    g.strokeStyle = color;
    g.globalAlpha = alpha > 0.2 ? 0.8 : 1;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = -1; i < (Math.abs(dx) > 0.5 ? w : h) / step + 1; i++)
      for (let j = 0; j < (Math.abs(dx) > 0.5 ? h : w) / 70 + 1; j++) {
        const along = i * step + off;
        const across = j * 70 + 35;
        const x = Math.abs(dx) > 0.5 ? x0 + (dx > 0 ? along : w - along) : x0 + across;
        const y = Math.abs(dx) > 0.5 ? y0 + across : y0 + (dy > 0 ? along : h - along);
        g.save();
        g.translate(x, y);
        g.rotate(ang);
        g.beginPath();
        g.moveTo(-8, -12);
        g.lineTo(6, 0);
        g.lineTo(-8, 12);
        g.stroke();
        g.restore();
      }
    g.restore();
  }

  drawPortal(g, x, y, now, color) {
    const T = this.theme;
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.arc(0, 0, 20, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.lineWidth = this.lw(4);
    g.strokeStyle = T.ink;
    g.stroke();
    g.rotate(this.reduced ? 0 : now / 300);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      g.rotate((Math.PI * 2) / 3);
      g.beginPath();
      g.arc(0, 0, 12, 0, 1.4);
      g.stroke();
    }
    g.restore();
  }

  drawFlag(g, [cx, cy], now) {
    const T = this.theme;
    const jump = this.flagJump > now ? Math.sin(((this.flagJump - now) / 600) * Math.PI) * 12 : 0;
    const wave = this.reduced ? 0 : Math.sin(now / 180) * 4;
    g.save();
    g.translate(cx, cy);
    if (this.view.rot) g.rotate(Math.PI / 2); // la bandera siempre "parada" en pantalla
    g.translate(2, -jump);
    g.strokeStyle = T.ink;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -58);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -58);
    g.quadraticCurveTo(18, -56 + wave, 34, -50 + wave * 0.5);
    g.lineTo(0, -38);
    g.closePath();
    g.fillStyle = '#ff5a5f';
    g.fill();
    g.lineWidth = this.lw(3);
    g.stroke();
    g.restore();
  }

  drawBall(g, b, now) {
    if (b.hidden) return;
    const T = this.theme;
    const sc = b.scale ?? 1;
    // estela
    if (b.trail && b.trail.length > 1 && !this.reduced) {
      g.lineCap = 'round';
      for (let i = 1; i < b.trail.length; i++) {
        g.globalAlpha = (i / b.trail.length) * 0.5;
        g.strokeStyle = b.color;
        g.lineWidth = BALL_R * 1.4 * (i / b.trail.length);
        g.beginPath();
        g.moveTo(b.trail[i - 1][0], b.trail[i - 1][1]);
        g.lineTo(b.trail[i][0], b.trail[i][1]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.save();
    g.translate(b.x, b.y);
    g.scale(sc, sc);
    if (b.turn) {
      const k = (now % 1200) / 1200;
      g.beginPath();
      g.arc(0, 0, BALL_R + 6 + k * 14, 0, Math.PI * 2);
      g.strokeStyle = b.color;
      g.globalAlpha = 1 - k;
      g.lineWidth = 4;
      g.stroke();
      g.globalAlpha = 1;
    }
    g.beginPath();
    g.ellipse(...this.sh(4), BALL_R, BALL_R * 0.8, 0, 0, Math.PI * 2);
    g.fillStyle = T.shadow;
    g.fill();
    g.beginPath();
    g.arc(0, 0, BALL_R, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = this.lw(3);
    g.strokeStyle = T.ink;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, BALL_R * 0.55, 0, Math.PI * 2);
    g.fillStyle = b.color;
    g.fill();
    g.beginPath();
    g.arc(-2.5, -2.5, 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.fill();
    g.restore();
  }

  drawAim(g, a, now) {
    const T = this.theme;
    const len = 30 + a.power * 170;
    const dx = Math.cos(a.angle);
    const dy = Math.sin(a.angle);
    const color = a.power < 0.45 ? '#7bd389' : a.power < 0.75 ? '#ffc93c' : '#ff5a5f';
    // puntos animados
    const off = this.reduced ? 0 : (now / 30) % 16;
    g.fillStyle = '#fff';
    g.strokeStyle = T.ink;
    g.lineWidth = this.lw(2);
    for (let d = 18 + off; d < len; d += 16) {
      g.beginPath();
      g.arc(a.x + dx * d, a.y + dy * d, 3.2, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // flecha
    const tx = a.x + dx * (len + 8);
    const ty = a.y + dy * (len + 8);
    g.save();
    g.translate(tx, ty);
    g.rotate(a.angle);
    g.beginPath();
    g.moveTo(10, 0);
    g.lineTo(-8, -10);
    g.lineTo(-8, 10);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.lineWidth = this.lw(3);
    g.stroke();
    g.restore();
    // anillo de potencia
    g.beginPath();
    g.arc(a.x, a.y, BALL_R + 10, -Math.PI / 2, -Math.PI / 2 + a.power * Math.PI * 2);
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.stroke();
  }

  // ---------------- efectos ----------------
  burst(x, y, kind) {
    if (this.reduced) return;
    const now = performance.now();
    const n = kind === 'splash' ? 18 : kind === 'sand' ? 10 : kind === 'sparkle' ? 16 : 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (kind === 'splash' ? 90 : 60) + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        born: now,
        life: 500 + Math.random() * 400,
        kind,
        r: kind === 'sparkle' ? 5 : 3 + Math.random() * 4,
        color: kind === 'splash' ? '#9fd2ff' : kind === 'sand' ? '#f7d774' : kind === 'sparkle' ? ['#ffc93c', '#ff5a5f', '#3ec1ff', '#fff'][i % 4] : '#ffffff',
      });
    }
  }

  drawParticles(g, now) {
    const T = this.theme;
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    for (const p of this.particles) {
      const t = (now - p.born) / 1000;
      const k = 1 - (now - p.born) / p.life;
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + (p.kind === 'splash' ? 160 * t * t : 0);
      g.globalAlpha = k;
      g.beginPath();
      if (p.kind === 'sparkle') {
        g.save();
        g.translate(x, y);
        g.rotate(t * 6);
        const r = p.r * (0.5 + k);
        for (let i = 0; i < 4; i++) {
          g.rotate(Math.PI / 2);
          g.moveTo(0, 0);
          g.quadraticCurveTo(r * 0.2, r * 0.2, r, 0);
          g.quadraticCurveTo(r * 0.2, -r * 0.2, 0, 0);
        }
        g.fillStyle = p.color;
        g.fill();
        g.restore();
      } else {
        g.arc(x, y, p.r * (0.6 + k * 0.4), 0, Math.PI * 2);
        g.fillStyle = p.color;
        g.fill();
        g.lineWidth = this.lw(1.5);
        g.strokeStyle = T.ink;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  /** Lluvia de confeti en pantalla (celebraciones). */
  celebrate(amount = 120) {
    if (this.reduced) return;
    const colors = ['#ff5a5f', '#3ec1ff', '#ffc93c', '#7bd389', '#8e6bff', '#ffffff'];
    for (let i = 0; i < amount; i++) {
      this.confetti.push({
        x: Math.random() * this.w,
        y: -20 - Math.random() * this.h * 0.4,
        vx: (Math.random() - 0.5) * 120,
        vy: 120 + Math.random() * 180,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        w: 6 + Math.random() * 6,
        h: 10 + Math.random() * 8,
        color: colors[i % colors.length],
      });
    }
  }

  drawConfetti() {
    const g = this.fctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!this.confetti.length) return;
    const dt = 1 / 60;
    for (const c of this.confetti) {
      c.x += c.vx * dt + Math.sin(c.y / 40) * 0.8;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      g.scale(1, Math.cos(c.rot * 2));
      g.fillStyle = c.color;
      g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      g.restore();
    }
    this.confetti = this.confetti.filter((c) => c.y < this.h + 30);
  }
}
