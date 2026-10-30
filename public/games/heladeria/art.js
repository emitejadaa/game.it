/**
 * Heladería — dibujos: el vaso transparente con su licuado (capas de jarabe y trocitos antes de licuar, cremoso
 * después), la crema en espiral, las salsas, las granas y lo de arriba; las mezclas, los jarabes con su bomba, la
 * licuadora, el pomo de crema, los frascos de granas y los íconos de pestañas y comanda.
 */
import { A } from '/shared/cocina/shell.js';
import { TAU, clamp, lerp, rng } from '/shared/cocina/core.js';
import { byId, sizeOf, SPOTS } from './shared/rules.js';

const { INK, rr, fillStroke, circle, ellipse, mix, darker, lighter, text } = A;

// ---------------------------------------------------------------- mezclas y lo de arriba
export function bit(g, id, x, y, s, a = 0, lw = null) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const L = lw ?? Math.max(1, s * 0.14);
  switch (id) {
    case 'frutilla':
    case 'frutillita': {
      g.beginPath();
      g.moveTo(0, s);
      g.bezierCurveTo(-s * 1.15, s * 0.2, -s * 0.9, -s * 0.85, 0, -s * 0.6);
      g.bezierCurveTo(s * 0.9, -s * 0.85, s * 1.15, s * 0.2, 0, s);
      fillStroke(g, '#e8384f', L);
      g.fillStyle = '#ffe28a';
      for (const [px, py] of [[-0.35, -0.1], [0.3, -0.2], [0, 0.3], [-0.2, 0.5], [0.35, 0.35]]) {
        ellipse(g, px * s, py * s, s * 0.07, s * 0.11);
        g.fill();
      }
      if (id === 'frutillita') {
        for (let i = 0; i < 4; i++) {
          g.save();
          g.translate(0, -s * 0.62);
          g.rotate(-0.9 + i * 0.6);
          ellipse(g, 0, -s * 0.18, s * 0.12, s * 0.28);
          fillStroke(g, '#4cae4f', L * 0.7);
          g.restore();
        }
      }
      break;
    }
    case 'chips':
      g.beginPath();
      g.moveTo(0, -s);
      g.quadraticCurveTo(s * 0.2, -s * 0.2, s * 0.85, s * 0.55);
      g.quadraticCurveTo(0, s * 1.0, -s * 0.85, s * 0.55);
      g.quadraticCurveTo(-s * 0.2, -s * 0.2, 0, -s);
      fillStroke(g, '#5b3320', L);
      break;
    case 'banana':
    case 'rodaja':
      circle(g, 0, 0, s);
      fillStroke(g, '#fff1b0', L);
      circle(g, 0, 0, s * 0.62);
      g.fillStyle = '#ffe17a';
      g.fill();
      g.fillStyle = '#8a6a3a';
      for (let i = 0; i < 3; i++) {
        circle(g, Math.cos((i * TAU) / 3) * s * 0.22, Math.sin((i * TAU) / 3) * s * 0.22, s * 0.07);
        g.fill();
      }
      break;
    case 'galleta':
      g.beginPath();
      for (let i = 0; i < 7; i++) {
        const aa = (i / 7) * TAU, rr2 = s * (0.75 + (i % 2) * 0.25);
        g.lineTo(Math.cos(aa) * rr2, Math.sin(aa) * rr2);
      }
      g.closePath();
      fillStroke(g, '#c98b4f', L);
      g.fillStyle = '#4f2b19';
      for (const [px, py] of [[-0.3, -0.2], [0.25, 0.15], [-0.05, 0.4]]) {
        circle(g, px * s, py * s, s * 0.14);
        g.fill();
      }
      break;
    case 'galletita':
      circle(g, 0, 0, s);
      fillStroke(g, '#3a2418', L);
      circle(g, 0, 0, s * 0.78);
      g.fillStyle = '#5a3a28';
      g.fill();
      rr(g, -s * 1.05, -s * 0.18, s * 2.1, s * 0.36, s * 0.15);
      fillStroke(g, '#fff6ea', L * 0.8);
      break;
    case 'durazno':
      g.beginPath();
      g.arc(0, s * 0.4, s, Math.PI * 1.1, Math.PI * 1.9);
      g.arc(0, s * 0.4, s * 0.45, Math.PI * 1.9, Math.PI * 1.1, true);
      g.closePath();
      fillStroke(g, '#ffb04f', L);
      break;
    case 'arandano':
      circle(g, 0, 0, s * 0.85);
      fillStroke(g, '#4057b8', L);
      circle(g, s * 0.1, -s * 0.15, s * 0.22);
      g.fillStyle = '#2a3a80';
      g.fill();
      break;
    case 'mani':
      ellipse(g, 0, 0, s * 0.95, s * 0.6);
      fillStroke(g, '#d9a86a', L);
      g.beginPath();
      g.moveTo(0, -s * 0.55);
      g.lineTo(0, s * 0.55);
      g.lineWidth = L * 0.7;
      g.strokeStyle = '#a9783e';
      g.stroke();
      break;
    case 'ddl':
      rr(g, -s * 0.8, -s * 0.8, s * 1.6, s * 1.6, s * 0.35);
      fillStroke(g, '#b56f2f', L);
      rr(g, -s * 0.5, -s * 0.55, s * 0.7, s * 0.4, s * 0.15);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fill();
      break;
    case 'kiwi':
      circle(g, 0, 0, s);
      fillStroke(g, '#7fbf3f', L);
      circle(g, 0, 0, s * 0.35);
      g.fillStyle = '#e9f6c8';
      g.fill();
      g.fillStyle = '#2a2a2a';
      for (let i = 0; i < 8; i++) {
        circle(g, Math.cos((i * TAU) / 8) * s * 0.55, Math.sin((i * TAU) / 8) * s * 0.55, s * 0.06);
        g.fill();
      }
      break;
    case 'menta':
      circle(g, 0, 0, s * 0.9);
      fillStroke(g, '#ffffff', L);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, s * 0.82, (i * TAU) / 4, (i * TAU) / 4 + 0.55);
        g.closePath();
        g.fillStyle = '#3fbf84';
        g.fill();
      }
      break;
    case 'cereza':
      g.beginPath();
      g.moveTo(0, -s * 0.4);
      g.quadraticCurveTo(s * 0.3, -s * 1.2, s * 0.8, -s * 1.5);
      g.lineWidth = L;
      g.strokeStyle = '#3e7a2e';
      g.stroke();
      circle(g, 0, 0, s * 0.75);
      fillStroke(g, '#e3203d', L);
      circle(g, -s * 0.25, -s * 0.25, s * 0.2);
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.fill();
      break;
    case 'oblea':
      g.rotate(-0.35);
      rr(g, -s * 0.3, -s * 1.6, s * 0.6, s * 2.6, s * 0.15);
      fillStroke(g, '#f0c27a', L);
      g.strokeStyle = '#c98f3f';
      g.lineWidth = L * 0.6;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(-s * 0.3, -s * 1.4 + i * s * 0.5);
        g.lineTo(s * 0.3, -s * 1.2 + i * s * 0.5);
        g.stroke();
      }
      break;
    case 'gomita':
      circle(g, -s * 0.42, -s * 0.72, s * 0.24);
      fillStroke(g, '#ff6b4a', L);
      circle(g, s * 0.42, -s * 0.72, s * 0.24);
      fillStroke(g, '#ff6b4a', L);
      ellipse(g, 0, -s * 0.45, s * 0.5, s * 0.45);
      fillStroke(g, '#ff6b4a', L);
      ellipse(g, 0, s * 0.35, s * 0.62, s * 0.7);
      fillStroke(g, '#ff6b4a', L);
      g.fillStyle = 'rgba(255,255,255,.35)';
      ellipse(g, -s * 0.2, s * 0.2, s * 0.15, s * 0.25);
      g.fill();
      break;
    case 'nuez':
      ellipse(g, 0, 0, s, s * 0.72);
      fillStroke(g, '#a06a3a', L);
      g.beginPath();
      g.moveTo(-s * 0.7, 0);
      g.bezierCurveTo(-s * 0.3, -s * 0.4, s * 0.3, s * 0.4, s * 0.7, 0);
      g.lineWidth = L * 0.8;
      g.strokeStyle = '#6d4220';
      g.stroke();
      break;
  }
  g.restore();
}

const SPR = {};
export function sprite(id) {
  if (SPR[id]) return SPR[id];
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  bit(c.getContext('2d'), id, 48, 50, 28, 0, 4);
  return (SPR[id] = c);
}

// ---------------------------------------------------------------- el vaso
/** Medidas del vaso de un tamaño con el piso en (x, y): rim = altura del borde. */
export function cupGeom(size, x, y, s) {
  const H = 190 * s * sizeOf(size).h;
  const W = 132 * s;
  return { x, y, s, W, H, bw: W * 0.66, rimY: y - H, U: W / 2 };
}
/** De coordenadas de arriba (normalizadas) a pantalla. */
export const topToScreen = (G, nx, ny) => [G.x + nx * G.U, G.rimY + (ny - 0.95) * G.U * 0.85];
export const screenToTop = (G, px, py) => [(px - G.x) / G.U, (py - G.rimY) / (G.U * 0.85) + 0.95];

function syrupColor(cup) {
  const ks = Object.keys(cup.syrup);
  if (!ks.length) return null;
  let r = 0, gg = 0, b = 0, tot = 0;
  for (const k of ks) {
    const c = parseInt(byId[k].color.slice(1), 16);
    const w = cup.syrup[k];
    r += ((c >> 16) & 255) * w;
    gg += ((c >> 8) & 255) * w;
    b += (c & 255) * w;
    tot += w;
  }
  return `rgb(${Math.round(r / tot)},${Math.round(gg / tot)},${Math.round(b / tot)})`;
}

/** Dibuja el vaso con todo lo que tiene. opts.swirl = girando en la licuadora. */
export function cup(g, c, x, y, s, opts = {}) {
  const Gm = cupGeom(c.size, x, y, s);
  const { W, H, bw, rimY } = Gm;
  const t = opts.t || 0;
  const path = () => {
    g.beginPath();
    g.moveTo(x - W / 2, rimY);
    g.lineTo(x + W / 2, rimY);
    g.lineTo(x + bw / 2, y);
    g.lineTo(x - bw / 2, y);
    g.closePath();
  };
  if (opts.shadow !== false) {
    ellipse(g, x, y + 4 * s, bw * 0.62, 8 * s);
    g.fillStyle = 'rgba(0,0,0,.16)';
    g.fill();
  }
  // contenido
  const lv = clamp(c.fill, 0, 1.25);
  const col = syrupColor(c);
  g.save();
  path();
  g.clip();
  g.fillStyle = 'rgba(235,248,255,.55)';
  g.fillRect(x - W, rimY - 10, W * 2, H + 20);
  const topY = y - H * 0.94 * Math.min(lv, 1.06);
  if (col) {
    if (c.blended || opts.swirl) {
      g.fillStyle = col;
      g.fillRect(x - W, topY, W * 2, y - topY + 2);
      // cremoso: brillo y remolino
      const k = clamp(c.blend, 0, 1.2);
      g.globalAlpha = 0.25;
      g.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        const yy = topY + ((i + 0.5) / 3) * (y - topY);
        const ph = opts.swirl ? t * 14 + i : i * 2;
        ellipse(g, x + Math.sin(ph) * W * 0.18, yy, W * 0.3, 6 * s);
        g.fill();
      }
      g.globalAlpha = 1;
      // trocitos que quedan según el punto (más grueso, más trocitos)
      const n = Math.round(clamp(1 - k, 0.05, 1) * 16 * c.mixes.length);
      const r = rng(7);
      for (let i = 0; i < n; i++) {
        const id = c.mixes[i % c.mixes.length];
        const yy = lerp(topY + 8 * s, y - 6 * s, r());
        const xx = x + (r() - 0.5) * W * 0.8 + (opts.swirl ? Math.sin(t * 10 + i) * 6 * s : 0);
        const sz = (4 + 5 * clamp(1 - k, 0.15, 1)) * s;
        g.drawImage(sprite(id), xx - sz * 1.7, yy - sz * 1.7, sz * 3.4, sz * 3.4);
      }
    } else {
      // capas de jarabe por orden de llegada
      let acc = 0;
      for (const k of Object.keys(c.syrup)) {
        const a0 = acc, a1 = acc + c.syrup[k];
        acc = a1;
        g.fillStyle = byId[k].color;
        g.fillRect(x - W, y - H * 0.94 * Math.min(a1, 1.06), W * 2, H * 0.94 * (Math.min(a1, 1.06) - Math.min(a0, 1.06)) + 1);
      }
    }
  }
  if (!c.blended && !opts.swirl) {
    // las mezclas, enteras en el fondo
    const r = rng(11);
    c.mixes.forEach((id, i) => {
      for (let k = 0; k < 5; k++) {
        const xx = x + (r() - 0.5) * bw * 0.8;
        const yy = y - 10 * s - r() * 26 * s - i * 14 * s;
        const sz = 11 * s;
        g.drawImage(sprite(id), xx - sz * 1.7, yy - sz * 1.7, sz * 3.4, sz * 3.4);
      }
    });
  }
  // reflejo del plástico
  g.fillStyle = 'rgba(255,255,255,.38)';
  g.beginPath();
  g.moveTo(x - W * 0.38, rimY + 8 * s);
  g.lineTo(x - W * 0.28, rimY + 8 * s);
  g.lineTo(x - bw * 0.26, y - 8 * s);
  g.lineTo(x - bw * 0.36, y - 8 * s);
  g.closePath();
  g.fill();
  g.restore();
  // marca del llenado justo
  if (opts.line) {
    const ly = y - H * 0.94;
    g.save();
    g.setLineDash([8 * s, 6 * s]);
    g.lineWidth = 3 * s;
    g.strokeStyle = '#e5484d';
    g.beginPath();
    g.moveTo(x - W * 0.6, ly);
    g.lineTo(x + W * 0.6, ly);
    g.stroke();
    g.restore();
  }
  // banda del local
  g.save();
  path();
  g.clip();
  g.fillStyle = '#ff7fae';
  g.fillRect(x - W, rimY + H * 0.08, W * 2, H * 0.12);
  g.fillStyle = '#fff';
  for (let i = -3; i <= 3; i++) {
    circle(g, x + i * 14 * s, rimY + H * 0.14, 3 * s);
    g.fill();
  }
  g.restore();
  path();
  g.lineWidth = Math.max(2, 3.5 * s);
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.stroke();
  // borde del vaso
  ellipse(g, x, rimY, W / 2 + 3 * s, 7 * s);
  fillStroke(g, 'rgba(240,250,255,.7)', Math.max(2, 3 * s));
  if (c.blended && col && lv > 0.9) {
    // copete del licuado que asoma
    ellipse(g, x, rimY - 2 * s, W / 2 - 2 * s, 10 * s);
    fillStroke(g, col, Math.max(1.5, 2.5 * s));
  }
  if (opts.noTop) return Gm;
  topping(g, c, Gm, t);
  return Gm;
}

/** Crema, salsas, granas y lo de arriba. */
export function topping(g, c, Gm, t = 0) {
  const s = Gm.s;
  if (c.cream && c.cream.amt > 0.02) cream(g, Gm, c.cream);
  // salsas: los trazos tal cual se hicieron, recortados a la cúpula
  if (c.dz?.length) {
    g.save();
    domeClip(g, Gm, c.cream);
    for (const d of c.dz) {
      g.strokeStyle = byId[d.id].color;
      g.lineWidth = 7 * s;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      d.pts.forEach(([nx, ny], i) => {
        const [px, py] = topToScreen(Gm, nx, ny);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.stroke();
      // brillo
      g.strokeStyle = 'rgba(255,255,255,.28)';
      g.lineWidth = 2.2 * s;
      g.stroke();
    }
    g.restore();
  }
  if (c.sp?.length) {
    g.save();
    domeClip(g, Gm, c.cream);
    for (const p of c.sp) {
      const [px, py] = topToScreen(Gm, p.x, p.y);
      g.save();
      g.translate(px, py);
      g.rotate(p.a);
      g.fillStyle = p.c;
      if (p.id === 'granas') {
        rr(g, -4 * s, -1.4 * s, 8 * s, 2.8 * s, 1.4 * s);
        g.fill();
      } else if (p.id === 'rallado') {
        g.fillRect(-3.5 * s, -1.6 * s, 7 * s, 3.2 * s);
      } else {
        rr(g, -3 * s, -1 * s, 6 * s, 2 * s, 1 * s);
        g.fill();
      }
      g.restore();
    }
    g.restore();
  }
  for (const it of c.garnish) {
    const [px, py] = topToScreen(Gm, it.x, it.y);
    const sz = 15 * s;
    g.drawImage(sprite(it.id), px - sz * 1.7, py - sz * 1.7, sz * 3.4, sz * 3.4);
  }
}

function creamHeight(Gm, cr) {
  return Gm.U * 1.55 * clamp(cr.amt, 0, 1.4);
}
function domeClip(g, Gm, cr) {
  g.beginPath();
  if (cr && cr.amt > 0.05) {
    const h = creamHeight(Gm, cr);
    const cx = Gm.x + cr.off * Gm.U;
    g.ellipse(cx, Gm.rimY, Gm.U * (0.82 + 0.25 * Math.min(1, cr.amt)) + 4, h + 6, 0, Math.PI, TAU);
  } else g.ellipse(Gm.x, Gm.rimY, Gm.U, Gm.U * 0.35, 0, 0, TAU);
  g.clip();
}

/** La crema en espiral: tres anillos que crecen con la cantidad. */
export function cream(g, Gm, cr) {
  const col = byId[cr.id].color;
  const h = creamHeight(Gm, cr);
  const cx = Gm.x + cr.off * Gm.U;
  const w = Gm.U * (0.82 + 0.25 * Math.min(1, cr.amt));
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers;
    const ty = Gm.rimY - h * k;
    const tw = w * (1 - k * 0.55);
    const th = h / tiers + 6 * Gm.s;
    g.beginPath();
    g.moveTo(cx - tw, ty);
    g.bezierCurveTo(cx - tw, ty - th * 1.2, cx + tw, ty - th * 1.2, cx + tw, ty);
    g.quadraticCurveTo(cx, ty + th * 0.35, cx - tw, ty);
    fillStroke(g, i % 2 ? darker(col, 0.04) : col, Math.max(1.5, 3 * Gm.s));
  }
  // puntita
  g.beginPath();
  g.moveTo(cx - w * 0.22, Gm.rimY - h * 0.92);
  g.quadraticCurveTo(cx + w * 0.05, Gm.rimY - h * 1.25, cx + w * 0.18, Gm.rimY - h * 1.12);
  g.quadraticCurveTo(cx + w * 0.1, Gm.rimY - h * 0.9, cx - w * 0.22, Gm.rimY - h * 0.92);
  fillStroke(g, lighter(col, 0.2), Math.max(1.5, 3 * Gm.s));
}

// ---------------------------------------------------------------- muebles y aparatos
export function parlorWall(g, a) {
  g.fillStyle = '#fff4f8';
  g.fillRect(a.x, a.y, a.w, a.h);
  g.fillStyle = '#ffe1ec';
  for (let x = a.x; x < a.x + a.w; x += 56) g.fillRect(x, a.y, 26, a.h);
}
export function counterTop(g, x, y, w, h) {
  rr(g, x, y, w, h, 14);
  fillStroke(g, '#9fe3cf', 4);
  g.fillStyle = 'rgba(255,255,255,.4)';
  g.fillRect(x + 12, y + 8, w - 24, 6);
}
/** Dispensador de mezclas (un frasco con tapa y su contenido). */
export function mixJar(g, id, x, y, w, h, active, label) {
  rr(g, x, y + 6, w, h, 16);
  g.fillStyle = INK;
  g.fill();
  rr(g, x, y, w, h, 16);
  fillStroke(g, active ? '#ffe27a' : '#ffffff', 3);
  rr(g, x + 10, y + 16, w - 20, h - 44, 12);
  fillStroke(g, 'rgba(220,240,255,.8)', 2.5);
  const r = rng(id.length * 17 + id.charCodeAt(1));
  for (let i = 0; i < 7; i++) {
    const s = Math.min(w, h) * 0.12;
    g.drawImage(sprite(id), x + 16 + r() * (w - 32) - s * 1.6, y + 22 + r() * (h - 60) - s * 1.6, s * 3.2, s * 3.2);
  }
  rr(g, x + 6, y + 4, w - 12, 14, 6);
  fillStroke(g, '#ff7fae', 2.5);
  text(g, label, x + w / 2, y + h - 13, 14, { color: INK, stroke: null, weight: 600, max: w - 10 });
}
/** Botella de jarabe con su bomba. */
export function syrupBottle(g, id, x, y, w, h, active, press = 0) {
  const col = byId[id].color;
  rr(g, x + w * 0.12, y + h * 0.3, w * 0.76, h * 0.7, 14);
  fillStroke(g, col, 3);
  rr(g, x + w * 0.2, y + h * 0.42, w * 0.6, h * 0.3, 8);
  fillStroke(g, '#fffdf4', 2);
  // bomba
  const py = y + h * 0.08 + press * h * 0.1;
  rr(g, x + w * 0.42, py, w * 0.16, h * 0.26, 4);
  fillStroke(g, '#dfe3e8', 2.5);
  rr(g, x + w * 0.25, py - 6, w * 0.5, 12, 6);
  fillStroke(g, active ? '#ffe27a' : '#c9ced6', 2.5);
  rr(g, x + w * 0.55, py + 4, w * 0.3, 8, 4);
  fillStroke(g, '#dfe3e8', 2);
}
export function blender(g, x, y, s, running, t) {
  // base
  rr(g, x - 70 * s, y - 60 * s, 140 * s, 60 * s, 14 * s);
  fillStroke(g, '#ff7fae', 3.5);
  circle(g, x, y - 30 * s, 13 * s);
  fillStroke(g, running ? '#7ddc6b' : '#ffffff', 3);
  // vaso de vidrio
  g.beginPath();
  g.moveTo(x - 62 * s, y - 250 * s);
  g.lineTo(x + 62 * s, y - 250 * s);
  g.lineTo(x + 48 * s, y - 64 * s);
  g.lineTo(x - 48 * s, y - 64 * s);
  g.closePath();
  g.fillStyle = 'rgba(215,240,255,.45)';
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = INK;
  g.stroke();
  // tapa
  rr(g, x - 66 * s, y - 262 * s, 132 * s, 18 * s, 8 * s);
  fillStroke(g, '#ff7fae', 3);
  // cuchillas
  const a = running ? t * 40 : 0;
  g.save();
  g.translate(x, y - 76 * s);
  g.scale(1, 0.35);
  g.rotate(a);
  g.lineWidth = 5 * s;
  g.strokeStyle = '#8a929e';
  g.beginPath();
  g.moveTo(-26 * s, 0);
  g.lineTo(26 * s, 0);
  g.moveTo(0, -26 * s);
  g.lineTo(0, 26 * s);
  g.stroke();
  g.restore();
}
export function creamCan(g, id, x, y, s, active) {
  const col = byId[id].color;
  rr(g, x - 22 * s, y - 70 * s, 44 * s, 90 * s, 12 * s);
  fillStroke(g, active ? '#ffe27a' : '#e8edf2', 3);
  rr(g, x - 22 * s, y - 40 * s, 44 * s, 26 * s, 4 * s);
  fillStroke(g, col, 2.5);
  rr(g, x - 9 * s, y - 92 * s, 18 * s, 24 * s, 5 * s);
  fillStroke(g, '#c9ced6', 2.5);
  g.beginPath();
  g.moveTo(x - 6 * s, y - 92 * s);
  g.lineTo(x, y - 106 * s);
  g.lineTo(x + 6 * s, y - 92 * s);
  fillStroke(g, '#c9ced6', 2.5);
}
export function sauceBottle(g, id, x, y, s, active) {
  const col = byId[id].color;
  rr(g, x - 20 * s, y - 70 * s, 40 * s, 76 * s, 14 * s);
  fillStroke(g, col, 3);
  rr(g, x - 13 * s, y - 50 * s, 26 * s, 22 * s, 5 * s);
  fillStroke(g, active ? '#ffe27a' : '#fffdf4', 2);
  g.beginPath();
  g.moveTo(x - 10 * s, y - 70 * s);
  g.lineTo(x - 3 * s, y - 96 * s);
  g.lineTo(x + 3 * s, y - 96 * s);
  g.lineTo(x + 10 * s, y - 70 * s);
  g.closePath();
  fillStroke(g, '#fffdf4', 2.5);
}
export function shaker(g, id, x, y, s, active) {
  rr(g, x - 22 * s, y - 64 * s, 44 * s, 70 * s, 10 * s);
  fillStroke(g, 'rgba(225,245,255,.9)', 3);
  const r = rng(id.length);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = sprinkleColor(id, r);
    g.fillRect(x - 16 * s + r() * 32 * s, y - 34 * s + r() * 36 * s, 5 * s, 2.4 * s);
  }
  rr(g, x - 24 * s, y - 80 * s, 48 * s, 18 * s, 6 * s);
  fillStroke(g, active ? '#ffe27a' : '#ff7fae', 3);
  g.fillStyle = INK;
  for (let i = -1; i <= 1; i++) {
    circle(g, x + i * 10 * s, y - 71 * s, 2 * s);
    g.fill();
  }
}
export function sprinkleColor(id, r) {
  if (id === 'granas') return ['#ff4f6d', '#ffd23f', '#3d7fe0', '#5cbf4f', '#ff8a3d', '#b07ae6'][Math.floor(r() * 6)];
  if (id === 'rallado') return r() < 0.5 ? '#4f2b19' : '#6b3c22';
  return r() < 0.5 ? '#ffffff' : '#f4efe4';
}

// ---------------------------------------------------------------- íconos
export function cupIcon(g, x, y, s) {
  g.beginPath();
  g.moveTo(x - s * 0.7, y - s * 0.7);
  g.lineTo(x + s * 0.7, y - s * 0.7);
  g.lineTo(x + s * 0.45, y + s * 0.9);
  g.lineTo(x - s * 0.45, y + s * 0.9);
  g.closePath();
  fillStroke(g, '#ff9cbd', Math.max(2, s * 0.13));
  g.beginPath();
  g.moveTo(x - s * 0.65, y - s * 0.35);
  g.lineTo(x + s * 0.65, y - s * 0.35);
  g.lineWidth = Math.max(1.5, s * 0.1);
  g.strokeStyle = '#fff';
  g.stroke();
}
export function blendIcon(g, x, y, s) {
  rr(g, x - s * 0.8, y + s * 0.4, s * 1.6, s * 0.55, s * 0.15);
  fillStroke(g, '#ff7fae', Math.max(2, s * 0.13));
  g.beginPath();
  g.moveTo(x - s * 0.7, y - s * 0.95);
  g.lineTo(x + s * 0.7, y - s * 0.95);
  g.lineTo(x + s * 0.5, y + s * 0.4);
  g.lineTo(x - s * 0.5, y + s * 0.4);
  g.closePath();
  fillStroke(g, 'rgba(200,235,255,.9)', Math.max(2, s * 0.13));
  g.beginPath();
  g.moveTo(x - s * 0.4, y + s * 0.2);
  g.quadraticCurveTo(x, y - s * 0.1, x + s * 0.4, y + s * 0.2);
  g.lineWidth = Math.max(1.5, s * 0.12);
  g.strokeStyle = '#8a929e';
  g.stroke();
}
export function topIcon(g, x, y, s) {
  const Gm = { x, rimY: y + s * 0.6, U: s * 0.85, s: s / 40 };
  cream(g, Gm, { id: 'crema', amt: 0.9, off: 0 });
  bit(g, 'cereza', x + s * 0.05, y - s * 0.55, s * 0.32, 0, 1.5);
}
export function blendMeter(g, x, y, w, h, level, target) {
  rr(g, x, y, w, h, h / 2);
  fillStroke(g, '#fffdf4', 3);
  // zonas
  const z = [
    ['grueso', 0.2, 0.44],
    ['normal', 0.5, 0.74],
    ['suave', 0.8, 1.04],
  ];
  for (const [, a, b] of z) {
    rr(g, x + (w * a) / 1.2, y + 4, (w * (b - a)) / 1.2, h - 8, 6);
    g.fillStyle = 'rgba(140,200,255,.25)';
    g.fill();
  }
  if (target != null) {
    rr(g, x + (w * (target - 0.12)) / 1.2, y + 3, (w * 0.24) / 1.2, h - 6, 6);
    g.fillStyle = 'rgba(92,191,79,.55)';
    g.fill();
  }
  const lx = x + (w * clamp(level, 0, 1.2)) / 1.2;
  rr(g, x + 3, y + 3, Math.max(0, lx - x - 6), h - 6, (h - 6) / 2);
  g.fillStyle = level > 1.15 ? 'rgba(229,72,77,.55)' : 'rgba(255,127,174,.55)';
  g.fill();
  g.beginPath();
  g.moveTo(lx, y - 6);
  g.lineTo(lx, y + h + 6);
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.stroke();
}

export { SPOTS, lerp };
