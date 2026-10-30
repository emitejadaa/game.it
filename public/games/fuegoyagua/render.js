/**
 * Fuego y Agua — dibujo del templo en canvas 2D: la piedra y las rampas se pintan una sola vez en un lienzo aparte
 * (a la escala de la pantalla) y cada cuadro se suman los charcos con olas, las gemas que brillan, las puertas, los
 * botones, las palancas, las plataformas, las cajas, los dos personajes (Llama con su pelo de fuego, Gota con su
 * gota) y las chispas.
 */
import { T, POOL, tileAt, isPool } from './shared/sim.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const INK = '#1d150c';
export const C = {
  stone: '#7a6640',
  stone2: '#8c7650',
  edge: '#a99167',
  dark: '#4d3f26',
  bg: '#2c2416',
  bg2: '#352b1b',
  moss: '#7da13a',
  fire: '#ff5a2a',
  fire2: '#ffb12e',
  water: '#2b8bff',
  water2: '#8fd0ff',
  goo: '#56c93f',
  goo2: '#2f8a2b',
  gold: '#e0b23a',
};
const LIQ = { [T.LAVA]: ['#ff5a1f', '#ffc23a', '#ff8a2a'], [T.WATER]: ['#2a7fe8', '#9ad6ff', '#58aefc'], [T.GOO]: ['#3fae32', '#a6f07a', '#66d44a'] };

// ---------------------------------------------------------------- capa fija (piedra)
export function staticLayer(W, ts) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(W.w * ts);
  c.height = Math.ceil(W.h * ts);
  const g = c.getContext('2d');
  // pared del fondo: ladrillos oscuros
  g.fillStyle = C.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = C.bg2;
  for (let y = 0; y < W.h * 2; y++) {
    for (let x = -1; x < W.w; x++) {
      const bx = (x + (y % 2) * 0.5) * ts, by = (y * ts) / 2;
      g.fillRect(bx + 1.5, by + 1.5, ts - 3, ts / 2 - 3);
    }
  }
  // un poco de luz que baja del techo
  const gr = g.createLinearGradient(0, 0, 0, c.height);
  gr.addColorStop(0, 'rgba(255,220,150,.08)');
  gr.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = gr;
  g.fillRect(0, 0, c.width, c.height);
  const solid = (x, y) => {
    const t = tileAt(W, x, y);
    return t === T.S || isPool(t);
  };
  // bloques
  for (let y = 0; y < W.h; y++) {
    for (let x = 0; x < W.w; x++) {
      const t = tileAt(W, x, y);
      const px = x * ts, py = y * ts;
      if (t === T.S) {
        g.fillStyle = (x * 7 + y * 13) % 5 === 0 ? C.stone2 : C.stone;
        g.fillRect(px, py, ts + 0.5, ts + 0.5);
        // juntas de los bloques
        g.fillStyle = C.dark;
        g.fillRect(px, py + ts - Math.max(1, ts * 0.06), ts, Math.max(1, ts * 0.06));
        const off = y % 2 ? 0 : ts / 2;
        g.fillRect(px + off, py, Math.max(1, ts * 0.06), ts);
      } else if (isPool(t)) {
        g.fillStyle = C.stone;
        g.fillRect(px, py + ts * POOL, ts + 0.5, ts * (1 - POOL) + 0.5);
      } else if (t === T.UR || t === T.UL) {
        g.fillStyle = C.stone;
        g.beginPath();
        if (t === T.UR) {
          g.moveTo(px, py + ts);
          g.lineTo(px + ts, py);
          g.lineTo(px + ts, py + ts);
        } else {
          g.moveTo(px, py);
          g.lineTo(px + ts, py + ts);
          g.lineTo(px, py + ts);
        }
        g.closePath();
        g.fill();
      }
    }
  }
  // bordes: contorno oscuro donde la piedra toca el aire y una luz con musgo arriba
  const lw = Math.max(2, ts * 0.1);
  g.lineCap = 'square';
  for (let y = 0; y < W.h; y++) {
    for (let x = 0; x < W.w; x++) {
      const t = tileAt(W, x, y);
      const px = x * ts, py = y * ts;
      if (t === T.S) {
        const up = tileAt(W, x, y - 1);
        if (!solid(x, y - 1) && up !== T.UR && up !== T.UL) {
          g.fillStyle = C.edge;
          g.fillRect(px, py, ts, lw);
          if ((x * 5 + y * 3) % 4 !== 0) {
            g.fillStyle = C.moss;
            g.fillRect(px, py - lw * 0.3, ts, lw * 0.8);
            if ((x + y) % 3 === 0) {
              g.beginPath();
              g.ellipse(px + ts * 0.5, py + lw * 0.6, ts * 0.12, ts * 0.22, 0, 0, Math.PI);
              g.fill();
            }
          }
        }
        g.fillStyle = INK;
        if (!solid(x, y + 1) && tileAt(W, x, y + 1) !== T.UR) g.fillRect(px, py + ts - lw * 0.6, ts, lw * 0.6);
        if (!solid(x - 1, y) && tileAt(W, x - 1, y) !== T.UL && tileAt(W, x - 1, y) !== T.UR) g.fillRect(px, py, lw * 0.6, ts);
        if (!solid(x + 1, y) && tileAt(W, x + 1, y) !== T.UR && tileAt(W, x + 1, y) !== T.UL) g.fillRect(px + ts - lw * 0.6, py, lw * 0.6, ts);
      } else if (t === T.UR || t === T.UL) {
        g.strokeStyle = C.edge;
        g.lineWidth = lw;
        g.beginPath();
        if (t === T.UR) {
          g.moveTo(px, py + ts);
          g.lineTo(px + ts, py);
        } else {
          g.moveTo(px, py);
          g.lineTo(px + ts, py + ts);
        }
        g.stroke();
      } else if (isPool(t)) {
        g.fillStyle = INK;
        g.fillRect(px, py + ts - lw * 0.6, ts, lw * 0.6);
      }
    }
  }
  return c;
}

// ---------------------------------------------------------------- lo que se mueve
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function pools(g, W, ts, t, still) {
  for (let y = 0; y < W.h; y++) {
    for (let x = 0; x < W.w; x++) {
      const tt = tileAt(W, x, y);
      if (!isPool(tt)) continue;
      const [a, b, m] = LIQ[tt];
      const px = x * ts, py = y * ts;
      const top = py + ts * 0.12;
      const bot = py + ts * (POOL + 0.08);
      g.beginPath();
      g.moveTo(px, bot);
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const xx = px + (i / n) * ts;
        const wave = still ? 0 : Math.sin(t * 3.2 + (x + i / n) * 2.4) * ts * 0.035;
        g.lineTo(xx, top + wave);
      }
      g.lineTo(px + ts, bot);
      g.closePath();
      const gr = g.createLinearGradient(0, top, 0, bot);
      gr.addColorStop(0, b);
      gr.addColorStop(0.35, m);
      gr.addColorStop(1, a);
      g.fillStyle = gr;
      g.fill();
      // brillo y burbujas
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(px + ts * 0.1, top + ts * 0.03, ts * 0.3, Math.max(1, ts * 0.03));
      if (!still && tt !== T.WATER) {
        const k = (t * 0.7 + x * 0.37) % 1;
        g.beginPath();
        g.arc(px + ts * (0.3 + ((x * 31) % 5) * 0.1), bot - k * (bot - top), ts * 0.05 * (1 - k), 0, TAU);
        g.fillStyle = b;
        g.fill();
      }
    }
  }
  // resplandor de la lava
  if (!still) {
    for (let y = 0; y < W.h; y++) {
      for (let x = 0; x < W.w; x++) {
        if (tileAt(W, x, y) !== T.LAVA) continue;
        const gr = g.createRadialGradient(x * ts + ts / 2, y * ts, 0, x * ts + ts / 2, y * ts, ts * 1.6);
        gr.addColorStop(0, 'rgba(255,140,40,.22)');
        gr.addColorStop(1, 'rgba(255,140,40,0)');
        g.fillStyle = gr;
        g.fillRect(x * ts - ts, y * ts - ts * 1.6, ts * 3, ts * 2);
      }
    }
  }
}

export function gem(g, gm, ts, t, still) {
  if (gm.got) return;
  const x = gm.x * ts, y = gm.y * ts + (still ? 0 : Math.sin(t * 2.6 + gm.x) * ts * 0.06);
  const s = ts * 0.34;
  const col = gm.k === 'F' ? ['#ff4a3d', '#ffb3a8', '#b3201a'] : ['#3d8bff', '#bfe0ff', '#1c4fb3'];
  // halo
  const gr = g.createRadialGradient(x, y, 0, x, y, s * 2.2);
  gr.addColorStop(0, gm.k === 'F' ? 'rgba(255,90,60,.35)' : 'rgba(60,140,255,.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(x - s * 2.2, y - s * 2.2, s * 4.4, s * 4.4);
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s * 0.85, y - s * 0.25);
  g.lineTo(x, y + s);
  g.lineTo(x - s * 0.85, y - s * 0.25);
  g.closePath();
  g.fillStyle = col[0];
  g.fill();
  g.lineWidth = Math.max(1, ts * 0.05);
  g.strokeStyle = col[2];
  g.stroke();
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s * 0.35, y - s * 0.25);
  g.lineTo(x, y + s * 0.45);
  g.lineTo(x - s * 0.35, y - s * 0.25);
  g.closePath();
  g.fillStyle = col[1];
  g.globalAlpha = 0.6 + (still ? 0 : 0.3 * Math.sin(t * 5 + gm.y));
  g.fill();
  g.globalAlpha = 1;
}

export function door(g, d, k, ts, t) {
  const x = d.x0 * ts, y = (d.y - 2) * ts, w = 2 * ts, h = 2 * ts;
  const col = k === 'F' ? C.fire : C.water;
  // marco de piedra con arco
  g.fillStyle = '#5e4c2c';
  rr(g, x - ts * 0.15, y - ts * 0.3, w + ts * 0.3, h + ts * 0.3, ts * 0.5);
  g.fill();
  g.lineWidth = Math.max(1.5, ts * 0.08);
  g.strokeStyle = INK;
  g.stroke();
  // adentro (oscuro, con luz del color cuando se abre)
  rr(g, x + ts * 0.15, y + ts * 0.05, w - ts * 0.3, h - ts * 0.05, ts * 0.4);
  g.fillStyle = '#120c06';
  g.fill();
  const open = clamp(d.open, 0, 1);
  if (open > 0.02) {
    const gr = g.createRadialGradient(x + w / 2, y + h * 0.7, 0, x + w / 2, y + h * 0.7, w * 0.7);
    gr.addColorStop(0, k === 'F' ? `rgba(255,140,60,${0.7 * open})` : `rgba(90,170,255,${0.7 * open})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fill();
  }
  // hoja de la puerta que sube
  g.save();
  rr(g, x + ts * 0.15, y + ts * 0.05, w - ts * 0.3, h - ts * 0.05, ts * 0.4);
  g.clip();
  const dy = open * h * 0.92;
  g.fillStyle = k === 'F' ? '#c9542c' : '#2e6cc4';
  g.fillRect(x, y - dy, w, h);
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (let i = 1; i < 4; i++) g.fillRect(x, y - dy + (i * h) / 4, w, Math.max(1, ts * 0.05));
  // emblema
  emblem(g, k, x + w / 2, y - dy + h * 0.46, ts * 0.42, t);
  g.restore();
  void col;
}

function emblem(g, k, x, y, s, t) {
  g.save();
  g.translate(x, y);
  if (k === 'F') {
    g.beginPath();
    g.moveTo(0, -s);
    g.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.6, s * 0.8, 0, s * 0.8);
    g.bezierCurveTo(-s * 0.6, s * 0.8, -s * 0.9, -s * 0.2, 0, -s);
    g.fillStyle = '#ffd07a';
  } else {
    g.beginPath();
    g.moveTo(0, -s);
    g.bezierCurveTo(s * 0.2, -s * 0.5, s * 0.75, 0, s * 0.75, s * 0.25);
    g.arc(0, s * 0.25, s * 0.75, 0, Math.PI);
    g.bezierCurveTo(-s * 0.75, 0, -s * 0.2, -s * 0.5, 0, -s);
    g.fillStyle = '#cfe9ff';
  }
  g.fill();
  g.lineWidth = Math.max(1, s * 0.12);
  g.strokeStyle = INK;
  g.stroke();
  g.restore();
  void t;
}

export function button(g, b, ts) {
  const x = b.x * ts, y = b.y * ts;
  const h = ts * (0.3 - 0.2 * b.down);
  // base de piedra y botón como una cúpula del color de lo que mueve, que brilla mientras está apretado
  g.fillStyle = '#3a2e1c';
  rr(g, x - ts * 0.05, y - ts * 0.14, ts * 1.1, ts * 0.16, ts * 0.05);
  g.fill();
  g.beginPath();
  g.ellipse(x + ts * 0.5, y - ts * 0.12, ts * 0.36, h, 0, Math.PI, 0);
  g.closePath();
  g.fillStyle = b.color;
  g.fill();
  g.lineWidth = Math.max(1, ts * 0.05);
  g.strokeStyle = INK;
  g.stroke();
  if (b.down > 0.3) {
    const gr = g.createRadialGradient(x + ts * 0.5, y - ts * 0.2, 0, x + ts * 0.5, y - ts * 0.2, ts);
    gr.addColorStop(0, 'rgba(255,240,180,.35)');
    gr.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = gr;
    g.fillRect(x - ts * 0.5, y - ts * 1.2, ts * 2, ts * 1.2);
  }
}

export function lever(g, l, ts) {
  const x = l.x * ts + ts / 2, y = l.y * ts;
  g.save();
  g.translate(x, y - ts * 0.12);
  g.rotate(l.a * 0.6);
  g.fillStyle = '#c9ced6';
  rr(g, -ts * 0.06, -ts * 0.8, ts * 0.12, ts * 0.8, ts * 0.05);
  g.fill();
  g.lineWidth = Math.max(1, ts * 0.05);
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  g.arc(0, -ts * 0.82, ts * 0.14, 0, TAU);
  g.fillStyle = l.color;
  g.fill();
  g.stroke();
  g.restore();
  g.fillStyle = '#5e4c2c';
  rr(g, x - ts * 0.34, y - ts * 0.24, ts * 0.68, ts * 0.24, ts * 0.12);
  g.fill();
  g.lineWidth = Math.max(1, ts * 0.05);
  g.strokeStyle = INK;
  g.stroke();
}

export function mover(g, m, ts) {
  // la guía por donde se mueve
  g.save();
  g.setLineDash([ts * 0.15, ts * 0.2]);
  g.strokeStyle = 'rgba(255,230,160,.16)';
  g.lineWidth = Math.max(1, ts * 0.06);
  g.beginPath();
  g.moveTo((m.x0 + m.w / 2) * ts, (m.y0 + m.h / 2) * ts);
  g.lineTo((m.x1 + m.w / 2) * ts, (m.y1 + m.h / 2) * ts);
  g.stroke();
  g.restore();
  const x = m.x * ts, y = m.y * ts, w = m.w * ts, h = m.h * ts;
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#d8c08a');
  gr.addColorStop(1, '#9c8452');
  rr(g, x, y, w, h, ts * 0.12);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = Math.max(1.5, ts * 0.07);
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = m.color;
  const stripe = Math.min(h * 0.35, ts * 0.22);
  rr(g, x + ts * 0.12, y + h / 2 - stripe / 2, w - ts * 0.24, stripe, stripe / 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.3)';
  g.fillRect(x + ts * 0.1, y + ts * 0.06, w - ts * 0.2, Math.max(1, ts * 0.06));
}

export function box(g, b, ts) {
  const x = (b.x - b.w / 2) * ts, y = (b.y - b.h) * ts, s = b.w * ts;
  rr(g, x, y, s, s, ts * 0.08);
  g.fillStyle = '#b07a3e';
  g.fill();
  g.lineWidth = Math.max(1.5, ts * 0.07);
  g.strokeStyle = INK;
  g.stroke();
  g.strokeStyle = '#7a4f24';
  g.lineWidth = Math.max(1, ts * 0.08);
  g.strokeRect(x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.72);
  g.beginPath();
  g.moveTo(x + s * 0.18, y + s * 0.18);
  g.lineTo(x + s * 0.82, y + s * 0.82);
  g.stroke();
}

/** Llama (fuego) o Gota (agua). */
export function hero(g, c, ts, t, opts = {}) {
  const fire = c.k === 'F';
  const x = c.x * ts, y = c.y * ts;
  const s = ts * 1.22; // un poco más grande que la caja de choque, como en los dibujos animados
  const run = c.ground && Math.abs(c.vx) > 0.3;
  const ph = c.walk * 6.5;
  const air = !c.ground;
  g.save();
  g.translate(x, y);
  if (opts.fade != null) g.globalAlpha = opts.fade;
  const body = fire ? '#ff6a2e' : '#2f8cff';
  const dark = fire ? '#b3361a' : '#1d5bb8';
  // piernas
  for (const sgn of [-1, 1]) {
    const k = run ? Math.sin(ph + (sgn > 0 ? Math.PI : 0)) : air ? 0.4 * sgn : 0;
    g.save();
    g.translate(sgn * s * 0.12, -s * 0.3);
    g.rotate(k * 0.5);
    rr(g, -s * 0.06, 0, s * 0.12, s * 0.3, s * 0.06);
    g.fillStyle = dark;
    g.fill();
    g.restore();
  }
  // cuerpo
  rr(g, -s * 0.2, -s * 0.62, s * 0.4, s * 0.38, s * 0.14);
  g.fillStyle = body;
  g.fill();
  g.lineWidth = Math.max(1, s * 0.05);
  g.strokeStyle = INK;
  g.stroke();
  // cabeza
  const hy = -s * 0.86;
  const hr = s * 0.27;
  if (fire) {
    // pelo de fuego que flamea
    for (let i = 0; i < 4; i++) {
      const fl = opts.still ? 0 : Math.sin(t * 14 + i * 1.7) * s * 0.06;
      const fx = (-0.18 + i * 0.12) * s * (c.face || 1);
      g.beginPath();
      g.moveTo(fx - s * 0.1, hy - hr * 0.3);
      g.quadraticCurveTo(fx - s * 0.02 - c.face * s * 0.08, hy - hr * 1.6 - fl - (i === 1 ? s * 0.14 : 0), fx + s * 0.08, hy - hr * 0.3);
      g.fillStyle = i % 2 ? '#ffd23f' : '#ff8a2a';
      g.fill();
    }
  } else {
    // gota de pelo
    g.beginPath();
    g.moveTo(-c.face * s * 0.05, hy - hr * 2.0);
    g.quadraticCurveTo(c.face * s * 0.3, hy - hr * 0.9, c.face * s * 0.08, hy - hr * 0.5);
    g.quadraticCurveTo(-c.face * s * 0.2, hy - hr * 0.6, -c.face * s * 0.05, hy - hr * 2.0);
    g.fillStyle = '#7fc8ff';
    g.fill();
    g.lineWidth = Math.max(1, s * 0.04);
    g.strokeStyle = INK;
    g.stroke();
  }
  g.beginPath();
  g.arc(0, hy, hr, 0, TAU);
  g.fillStyle = fire ? '#ffb347' : '#8fd0ff';
  g.fill();
  g.lineWidth = Math.max(1, s * 0.05);
  g.strokeStyle = INK;
  g.stroke();
  // ojos
  const blink = !opts.still && (t + (fire ? 0 : 1.3)) % 3.6 < 0.1;
  for (const sgn of [-1, 1]) {
    const ex = sgn * hr * 0.42 + c.face * hr * 0.12;
    g.beginPath();
    if (blink) {
      g.moveTo(ex - hr * 0.16, hy);
      g.lineTo(ex + hr * 0.16, hy);
      g.strokeStyle = INK;
      g.stroke();
    } else {
      g.ellipse(ex, hy - hr * 0.05, hr * 0.17, hr * 0.24, 0, 0, TAU);
      g.fillStyle = '#fff';
      g.fill();
      g.beginPath();
      g.arc(ex + c.face * hr * 0.06, hy - hr * 0.02, hr * 0.09, 0, TAU);
      g.fillStyle = INK;
      g.fill();
    }
  }
  if (opts.happy) {
    g.beginPath();
    g.arc(c.face * hr * 0.1, hy + hr * 0.3, hr * 0.25, 0.15 * Math.PI, 0.85 * Math.PI);
    g.lineWidth = Math.max(1, s * 0.04);
    g.strokeStyle = INK;
    g.stroke();
  }
  g.restore();
  // resplandor
  if (!opts.still) {
    const gr = g.createRadialGradient(x, y - s * 0.7, 0, x, y - s * 0.7, s * 1.3);
    gr.addColorStop(0, fire ? 'rgba(255,120,40,.18)' : 'rgba(80,160,255,.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - s * 1.3, y - s * 2, s * 2.6, s * 2.6);
  }
}
