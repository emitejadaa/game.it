/**
 * Pizzería — dibujos: los ingredientes (cada uno con su forma), la pizza con sus capas (masa que se dora, salsa y
 * queso pintados a mano, ingredientes, cortes y porciones que se separan), las bateas, el cucharón, el horno de barro,
 * la tabla de cortar, la caja y los íconos de las pestañas y la comanda.
 */
import { A } from '/shared/cocina/shell.js';
import { TAU, clamp, lerp, rng } from '/shared/cocina/core.js';
import { INNER, BAKE_MAX } from './shared/rules.js';

const { INK, rr, fillStroke, circle, ellipse, mix, darker, lighter, text } = A;

// ---------------------------------------------------------------- ingredientes
/** Un ingrediente centrado en (x, y) con tamaño s (≈ radio) y giro a. */
export function topping(g, id, x, y, s, a = 0, lw = null) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const L = lw ?? Math.max(1.2, s * 0.13);
  switch (id) {
    case 'calabresa': {
      circle(g, 0, 0, s);
      fillStroke(g, '#d9412b', L);
      circle(g, 0, 0, s * 0.82);
      g.fillStyle = '#e8573c';
      g.fill();
      g.fillStyle = '#b3301f';
      for (const [px, py] of [[-0.35, -0.3], [0.32, -0.15], [-0.1, 0.38], [0.3, 0.4], [-0.45, 0.2]]) {
        circle(g, px * s, py * s, s * 0.12);
        g.fill();
      }
      ellipse(g, -s * 0.3, -s * 0.45, s * 0.3, s * 0.14, -0.5);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fill();
      break;
    }
    case 'hongos': {
      g.beginPath();
      g.moveTo(-s, 0);
      g.quadraticCurveTo(-s * 0.95, -s * 0.95, 0, -s * 0.95);
      g.quadraticCurveTo(s * 0.95, -s * 0.95, s, 0);
      g.quadraticCurveTo(s * 0.5, s * 0.12, s * 0.32, s * 0.12);
      g.lineTo(s * 0.32, s * 0.9);
      g.quadraticCurveTo(0, s * 1.05, -s * 0.32, s * 0.9);
      g.lineTo(-s * 0.32, s * 0.12);
      g.quadraticCurveTo(-s * 0.5, s * 0.12, -s, 0);
      g.closePath();
      fillStroke(g, '#efe0c4', L);
      g.beginPath();
      g.moveTo(-s * 0.92, -s * 0.12);
      g.quadraticCurveTo(-s * 0.85, -s * 0.85, 0, -s * 0.85);
      g.quadraticCurveTo(s * 0.85, -s * 0.85, s * 0.92, -s * 0.12);
      g.lineWidth = s * 0.18;
      g.strokeStyle = '#9b7350';
      g.stroke();
      break;
    }
    case 'aceitunas': {
      circle(g, 0, 0, s * 0.85);
      fillStroke(g, '#2c2a33', L);
      circle(g, 0, 0, s * 0.36);
      g.fillStyle = '#7a3c2a';
      g.fill();
      g.lineWidth = L * 0.8;
      g.stroke();
      ellipse(g, -s * 0.3, -s * 0.42, s * 0.22, s * 0.1, -0.6);
      g.fillStyle = 'rgba(255,255,255,.4)';
      g.fill();
      break;
    }
    case 'morron': {
      g.beginPath();
      g.arc(0, s * 0.9, s * 1.35, -Math.PI * 0.78, -Math.PI * 0.22);
      g.arc(0, s * 0.9, s * 0.88, -Math.PI * 0.22, -Math.PI * 0.78, true);
      g.closePath();
      fillStroke(g, '#e8392f', L);
      g.beginPath();
      g.arc(0, s * 0.9, s * 1.18, -Math.PI * 0.7, -Math.PI * 0.4);
      g.lineWidth = s * 0.12;
      g.strokeStyle = 'rgba(255,255,255,.4)';
      g.stroke();
      break;
    }
    case 'cebolla': {
      ellipse(g, 0, 0, s, s * 0.85);
      g.lineWidth = s * 0.34;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = s * 0.22;
      g.strokeStyle = '#c98ac9';
      g.stroke();
      ellipse(g, 0, 0, s * 0.62, s * 0.5);
      g.lineWidth = s * 0.12;
      g.strokeStyle = '#f2e6f2';
      g.stroke();
      break;
    }
    case 'jamon': {
      rr(g, -s * 0.9, -s * 0.8, s * 1.8, s * 1.6, s * 0.4);
      fillStroke(g, '#f2a3ad', L);
      rr(g, -s * 0.62, -s * 0.52, s * 1.24, s * 1.04, s * 0.3);
      g.fillStyle = '#f7bcc3';
      g.fill();
      break;
    }
    case 'anana': {
      g.beginPath();
      g.moveTo(-s * 0.95, s * 0.7);
      g.quadraticCurveTo(0, -s * 1.5, s * 0.95, s * 0.7);
      g.quadraticCurveTo(0, s * 0.95, -s * 0.95, s * 0.7);
      g.closePath();
      fillStroke(g, '#ffd34a', L);
      g.lineWidth = s * 0.08;
      g.strokeStyle = '#e5ad1f';
      g.beginPath();
      g.moveTo(-s * 0.4, s * 0.55);
      g.lineTo(-s * 0.1, -s * 0.3);
      g.moveTo(s * 0.4, s * 0.55);
      g.lineTo(s * 0.1, -s * 0.3);
      g.stroke();
      break;
    }
    case 'anchoas': {
      g.beginPath();
      g.moveTo(-s * 1.1, 0);
      g.quadraticCurveTo(-s * 0.3, -s * 0.48, s * 0.6, -s * 0.12);
      g.lineTo(s * 1.15, -s * 0.42);
      g.lineTo(s * 1.0, 0);
      g.lineTo(s * 1.15, s * 0.42);
      g.lineTo(s * 0.6, s * 0.12);
      g.quadraticCurveTo(-s * 0.3, s * 0.48, -s * 1.1, 0);
      g.closePath();
      fillStroke(g, '#8c6f5f', L);
      g.beginPath();
      g.moveTo(-s * 0.8, 0);
      g.lineTo(s * 0.55, 0);
      g.lineWidth = s * 0.09;
      g.strokeStyle = '#c7b7ad';
      g.stroke();
      break;
    }
    case 'panceta': {
      g.beginPath();
      const w = s * 1.15, h = s * 0.5;
      g.moveTo(-w, -h);
      for (let i = 0; i <= 4; i++) g.quadraticCurveTo(-w + ((i + 0.5) * 2 * w) / 5, -h + (i % 2 ? 0.22 : -0.22) * s, -w + ((i + 1) * 2 * w) / 5, -h);
      g.lineTo(w, h);
      for (let i = 4; i >= 0; i--) g.quadraticCurveTo(-w + ((i + 0.5) * 2 * w) / 5, h + (i % 2 ? 0.22 : -0.22) * s, -w + (i * 2 * w) / 5, h);
      g.closePath();
      fillStroke(g, '#c94a3c', L);
      g.fillStyle = '#f3c2b2';
      g.fillRect(-w * 0.95, -h * 0.25, w * 1.9, h * 0.35);
      break;
    }
    case 'tomate': {
      circle(g, 0, 0, s);
      fillStroke(g, '#e23b2e', L);
      circle(g, 0, 0, s * 0.78);
      g.fillStyle = '#f2655a';
      g.fill();
      for (let i = 0; i < 4; i++) {
        const aa = (i / 4) * TAU + 0.4;
        ellipse(g, Math.cos(aa) * s * 0.42, Math.sin(aa) * s * 0.42, s * 0.22, s * 0.14, aa);
        g.fillStyle = '#ffd6a6';
        g.fill();
      }
      break;
    }
    case 'albahaca': {
      g.beginPath();
      g.moveTo(-s * 1.05, 0);
      g.quadraticCurveTo(0, -s * 0.95, s * 1.05, 0);
      g.quadraticCurveTo(0, s * 0.95, -s * 1.05, 0);
      g.closePath();
      fillStroke(g, '#3e9b3a', L);
      g.beginPath();
      g.moveTo(-s * 0.85, 0);
      g.lineTo(s * 0.8, 0);
      g.lineWidth = s * 0.09;
      g.strokeStyle = '#7cd16a';
      g.stroke();
      break;
    }
    case 'huevo': {
      ellipse(g, 0, 0, s, s * 0.82);
      fillStroke(g, '#fbfaf2', L);
      circle(g, s * 0.05, 0, s * 0.45);
      fillStroke(g, '#ffc21f', L * 0.8);
      break;
    }
  }
  g.restore();
}

const SPRITES = {};
/** Sprite cacheado de un ingrediente (para dibujar decenas por cuadro sin costo). */
export function sprite(id) {
  if (SPRITES[id]) return SPRITES[id];
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const cg = c.getContext('2d');
  topping(cg, id, 48, 48, 32, 0, 4);
  return (SPRITES[id] = c);
}

// ---------------------------------------------------------------- capas pintadas
const PAINT_PX = 256;
/** Lienzo de una capa pintada (salsa o queso) de una pizza; se crea la primera vez. */
function layer(pz, key) {
  pz._layers ||= {};
  if (!pz._layers[key]) {
    const c = document.createElement('canvas');
    c.width = c.height = PAINT_PX;
    pz._layers[key] = c;
  }
  return pz._layers[key];
}

/** Pinta en la capa visible (además de la grilla de puntaje, que la maneja la estación). */
export function paintBlob(pz, key, x, y, r, seed = 0) {
  const c = layer(pz, key);
  const cg = c.getContext('2d');
  const px = ((x + 1) / 2) * PAINT_PX, py = ((y + 1) / 2) * PAINT_PX, pr = (r / 2) * PAINT_PX;
  const rnd = rng(seed);
  if (key === 'sauce') {
    for (let i = 0; i < 3; i++) {
      const ox = (rnd() - 0.5) * pr * 0.5, oy = (rnd() - 0.5) * pr * 0.5;
      const gr = cg.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, pr);
      gr.addColorStop(0, 'rgba(206,46,32,1)');
      gr.addColorStop(0.72, 'rgba(214,52,36,.95)');
      gr.addColorStop(1, 'rgba(214,52,36,0)');
      cg.fillStyle = gr;
      cg.beginPath();
      cg.arc(px + ox, py + oy, pr, 0, TAU);
      cg.fill();
    }
  } else {
    // queso rallado: tiritas cortas
    for (let i = 0; i < 16; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * pr;
      const sx = px + Math.cos(a) * d, sy = py + Math.sin(a) * d;
      cg.save();
      cg.translate(sx, sy);
      cg.rotate(rnd() * TAU);
      cg.fillStyle = rnd() < 0.5 ? '#fff3c4' : '#ffe48f';
      cg.beginPath();
      cg.roundRect(-5, -1.6, 10, 3.2, 1.6);
      cg.fill();
      cg.restore();
    }
  }
}

// ---------------------------------------------------------------- la pizza
export function doughColor(bake) {
  const k = clamp(bake / BAKE_MAX, 0, 1.3);
  if (k < 0.5) return mix('#f6dca6', '#eec27a', k / 0.5);
  if (k < 1) return mix('#eec27a', '#c9853f', (k - 0.5) / 0.5);
  return mix('#c9853f', '#4a3022', clamp((k - 1) / 0.3, 0, 1));
}

/**
 * Dibuja una pizza centrada en (cx, cy) con radio R. opts: { slices: separarlas, raw: sin hornear, shadow, scale }.
 */
export function pizza(g, pz, cx, cy, R, opts = {}) {
  if (!pz) return;
  const sep = opts.separate ? R * 0.05 : 0;
  if (sep && pz.cuts.length) {
    // porciones separadas: se dibuja la pizza entera dentro de cada cuña desplazada
    const angles = sliceList(pz);
    for (let i = 0; i < angles.length; i++) {
      const a0 = angles[i], a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + TAU;
      const mid = (a0 + a1) / 2;
      g.save();
      g.translate(Math.cos(mid) * sep, Math.sin(mid) * sep);
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R * 1.05, a0, a1);
      g.closePath();
      g.clip();
      whole(g, pz, cx, cy, R, opts);
      g.restore();
    }
    return;
  }
  whole(g, pz, cx, cy, R, opts);
}

/** Ángulos (vistos desde el centro) de los puntos donde cada corte toca el borde: separan las porciones. */
function sliceList(pz) {
  const all = [];
  for (const c of pz.cuts) {
    const [ax, ay, bx, by] = chord(c);
    all.push((Math.atan2(ay, ax) + TAU) % TAU, (Math.atan2(by, bx) + TAU) % TAU);
  }
  return all.sort((a, b) => a - b);
}

function whole(g, pz, cx, cy, R, opts) {
  const bake = pz.bake || 0;
  if (opts.shadow !== false) {
    ellipse(g, cx + R * 0.05, cy + R * 0.08, R * 1.02, R * 0.98);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fill();
  }
  // borde de masa
  circle(g, cx, cy, R);
  fillStroke(g, doughColor(bake), Math.max(2, R * 0.025));
  // brillo del borde
  g.beginPath();
  g.arc(cx, cy, R * 0.93, Math.PI * 1.05, Math.PI * 1.6);
  g.lineWidth = R * 0.05;
  g.strokeStyle = 'rgba(255,255,255,.22)';
  g.stroke();
  circle(g, cx, cy, R * INNER);
  g.fillStyle = mix(doughColor(bake), '#fff0c8', 0.25);
  g.fill();
  g.lineWidth = Math.max(1, R * 0.012);
  g.strokeStyle = 'rgba(120,70,30,.35)';
  g.stroke();
  // capas pintadas
  g.save();
  circle(g, cx, cy, R * 0.99);
  g.clip();
  if (pz._layers?.sauce) {
    g.globalAlpha = 1 - clamp((bake - 6) / 6, 0, 0.35);
    g.drawImage(pz._layers.sauce, cx - R, cy - R, R * 2, R * 2);
    g.globalAlpha = 1;
  }
  if (pz._layers?.cheese) {
    g.drawImage(pz._layers.cheese, cx - R, cy - R, R * 2, R * 2);
    // el queso se dora en el horno
    if (bake > 2) meltLayer(g, pz, cx, cy, R, bake);
  }
  g.restore();
  // ingredientes
  for (const p of pz.pieces) {
    const s = sprite(p.t);
    const sz = R * 0.16 * (p.k || 1);
    g.save();
    g.translate(cx + p.x * R, cy + p.y * R);
    g.rotate(p.a);
    g.drawImage(s, -sz * 1.5, -sz * 1.5, sz * 3, sz * 3);
    g.restore();
  }
  // dorado general y quemado
  if (bake > 0.2) {
    const k = clamp(bake / BAKE_MAX, 0, 1.4);
    const gr = g.createRadialGradient(cx, cy, R * 0.3, cx, cy, R);
    gr.addColorStop(0, `rgba(140,70,20,${0.05 * k})`);
    gr.addColorStop(1, `rgba(110,50,10,${0.22 * k})`);
    circle(g, cx, cy, R);
    g.fillStyle = gr;
    g.fill();
    if (bake > BAKE_MAX) {
      const burn = clamp((bake - BAKE_MAX) / 2.5, 0, 1);
      circle(g, cx, cy, R);
      g.fillStyle = `rgba(40,25,15,${0.55 * burn})`;
      g.fill();
    }
  }
  // cortes
  if (pz.cuts.length && !opts.separate) {
    g.save();
    circle(g, cx, cy, R * 0.995);
    g.clip();
    for (const c of pz.cuts) {
      const [ax, ay, bx, by] = chord(c);
      g.lineCap = 'round';
      g.lineWidth = Math.max(2, R * 0.02);
      g.strokeStyle = 'rgba(70,35,15,.55)';
      g.beginPath();
      g.moveTo(cx + ax * R, cy + ay * R);
      g.lineTo(cx + bx * R, cy + by * R);
      g.stroke();
    }
    g.restore();
  }
}

function meltLayer(g, pz, cx, cy, R, bake) {
  // manchitas doradas del queso (siempre en el mismo lugar para cada pizza)
  pz._spots ||= Array.from({ length: 26 }, (_, i) => {
    const r = rng(i * 977 + 13);
    const a = r() * TAU, d = Math.sqrt(r()) * INNER * 0.95;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 0.03 + r() * 0.05 };
  });
  const k = clamp((bake - 2) / 5, 0, 1);
  for (const s of pz._spots) {
    if (!pz.cheese.c[cellOf(pz.cheese, s.x, s.y)]) continue;
    circle(g, cx + s.x * R, cy + s.y * R, s.s * R);
    g.fillStyle = `rgba(222,150,50,${0.45 * k})`;
    g.fill();
  }
}

function cellOf(p, x, y) {
  const i = clamp(Math.floor(((x + 1) / 2) * p.n), 0, p.n - 1), j = clamp(Math.floor(((y + 1) / 2) * p.n), 0, p.n - 1);
  return j * p.n + i;
}

/** La cuerda de un corte (sus dos puntas sobre el borde), en coordenadas normalizadas. */
export function chord(c) {
  const dx = c.x2 - c.x1, dy = c.y2 - c.y1;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  // punto más cercano al centro
  const t = -(c.x1 * ux + c.y1 * uy);
  const px = c.x1 + ux * t, py = c.y1 + uy * t;
  const d2 = px * px + py * py;
  const h = Math.sqrt(Math.max(0, 1 - d2));
  return [px - ux * h, py - uy * h, px + ux * h, py + uy * h];
}

// ---------------------------------------------------------------- utensilios y muebles
export function sauceBin(g, x, y, s, active) {
  rr(g, x - s, y - s * 0.55, s * 2, s * 1.25, s * 0.3);
  fillStroke(g, active ? '#ffe27a' : '#c9ced6', 3);
  ellipse(g, x, y - s * 0.5, s * 0.9, s * 0.32);
  fillStroke(g, '#d43a28', 3);
  ellipse(g, x - s * 0.3, y - s * 0.58, s * 0.25, s * 0.08);
  g.fillStyle = 'rgba(255,255,255,.4)';
  g.fill();
  ladle(g, x + s * 0.45, y - s * 0.9, s * 0.55);
}
export function ladle(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.rotate(0.5);
  rr(g, -s * 0.12, -s * 1.6, s * 0.24, s * 1.3, s * 0.1);
  fillStroke(g, '#9aa3ae', 2.5);
  ellipse(g, 0, 0, s * 0.6, s * 0.42);
  fillStroke(g, '#c9ced6', 2.5);
  g.restore();
}
export function cheeseBin(g, x, y, s, active) {
  rr(g, x - s, y - s * 0.55, s * 2, s * 1.25, s * 0.3);
  fillStroke(g, active ? '#ffe27a' : '#c9ced6', 3);
  ellipse(g, x, y - s * 0.5, s * 0.9, s * 0.32);
  fillStroke(g, '#fff0b5', 3);
  const r = rng(5);
  for (let i = 0; i < 14; i++) {
    g.save();
    g.translate(x + (r() - 0.5) * s * 1.5, y - s * 0.55 + (r() - 0.5) * s * 0.4);
    g.rotate(r() * TAU);
    g.fillStyle = r() < 0.5 ? '#ffe48f' : '#fff9da';
    g.fillRect(-s * 0.14, -s * 0.04, s * 0.28, s * 0.08);
    g.restore();
  }
}
/** Batea de un ingrediente (con un montoncito adentro). */
export function bin(g, id, x, y, w, h, active, label) {
  rr(g, x, y + 6, w, h, 14);
  g.fillStyle = INK;
  g.fill();
  rr(g, x, y, w, h, 14);
  fillStroke(g, active ? '#ffe27a' : '#dfe3e8', 3);
  rr(g, x + 8, y + 8, w - 16, h - 30, 10);
  fillStroke(g, '#aab2bc', 2.5);
  const r = rng(id.length * 31 + id.charCodeAt(0));
  const s = Math.min(w, h) * 0.17;
  for (let i = 0; i < 6; i++) {
    const px = x + w / 2 + (r() - 0.5) * (w - 44), py = y + 8 + (h - 30) / 2 + (r() - 0.5) * (h - 52);
    g.drawImage(sprite(id), px - s * 1.5, py - s * 1.5, s * 3, s * 3);
  }
  text(g, label, x + w / 2, y + h - 12, 15, { color: INK, stroke: null, weight: 600, max: w - 10 });
}

/** Pared de azulejos y mesada de acero de la cocina. */
export function kitchen(g, a, t) {
  g.fillStyle = '#f4efe6';
  g.fillRect(a.x, a.y, a.w, a.h);
  g.fillStyle = '#e6ddcf';
  const s = 48;
  for (let y = a.y; y < a.y + a.h; y += s) for (let x = a.x + (((y - a.y) / s) % 2) * (s / 2); x < a.x + a.w; x += s) g.fillRect(x + 2, y + 2, s - 4, s - 4);
  void t;
}
export function steel(g, x, y, w, h) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#d9dee4');
  gr.addColorStop(1, '#aeb6c0');
  rr(g, x, y, w, h, 12);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.fillRect(x + 10, y + 6, w - 20, 4);
}
export function board(g, cx, cy, R) {
  rr(g, cx - R * 1.18, cy - R * 1.12, R * 2.36, R * 2.24, R * 0.2);
  fillStroke(g, '#c98b4f', 4);
  g.strokeStyle = 'rgba(120,70,30,.25)';
  g.lineWidth = 3;
  for (let i = -4; i <= 4; i++) {
    g.beginPath();
    g.moveTo(cx - R * 1.1, cy + i * R * 0.24);
    g.bezierCurveTo(cx - R * 0.3, cy + i * R * 0.24 + 8, cx + R * 0.3, cy + i * R * 0.24 - 8, cx + R * 1.1, cy + i * R * 0.24);
    g.stroke();
  }
  circle(g, cx + R * 0.98, cy - R * 0.94, R * 0.06);
  fillStroke(g, '#8b5a2b', 3);
}
export function cutter(g, x, y, s, a = -0.7, spin = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  rr(g, -s * 0.12, s * 0.2, s * 0.24, s * 1.3, s * 0.1);
  fillStroke(g, '#e5484d', 3);
  circle(g, 0, 0, s * 0.55);
  fillStroke(g, '#dfe3e8', 3);
  g.rotate(spin);
  g.lineWidth = 2;
  g.strokeStyle = '#8a929e';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos((i * TAU) / 3) * s * 0.45, Math.sin((i * TAU) / 3) * s * 0.45);
    g.stroke();
  }
  circle(g, 0, 0, s * 0.12);
  fillStroke(g, '#8a929e', 2);
  g.restore();
}
export function box(g, cx, cy, s, open = 1) {
  rr(g, cx - s, cy - s * 0.12, s * 2, s * 0.5, 8);
  fillStroke(g, '#e9c690', 3.5);
  if (open < 1) {
    rr(g, cx - s, cy - s * 0.12 - s * 0.4 * (1 - open), s * 2, s * 0.5, 8);
    fillStroke(g, '#f2d6a6', 3.5);
  }
}

/** Horno de barro con `n` bocas. Devuelve dónde está cada boca. */
export function oven(g, x, y, w, h, n, t) {
  // cuerpo
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + h * 0.35);
  g.quadraticCurveTo(x, y, x + w * 0.2, y);
  g.lineTo(x + w * 0.8, y);
  g.quadraticCurveTo(x + w, y, x + w, y + h * 0.35);
  g.lineTo(x + w, y + h);
  g.closePath();
  fillStroke(g, '#c46a3c', 4);
  // ladrillos
  g.save();
  g.clip();
  g.fillStyle = 'rgba(120,50,20,.25)';
  for (let yy = y + 10, r = 0; yy < y + h; yy += 26, r++) for (let xx = x - 30 + (r % 2) * 30; xx < x + w; xx += 60) g.fillRect(xx, yy, 52, 3);
  g.restore();
  rr(g, x - 10, y + h - 26, w + 20, 30, 8);
  fillStroke(g, '#8b4a2b', 4);
  // chimenea con humo
  rr(g, x + w * 0.72, y - 60, 46, 66, 6);
  fillStroke(g, '#a8552f', 4);
  for (let i = 0; i < 3; i++) {
    const k = ((t * 0.5 + i / 3) % 1);
    circle(g, x + w * 0.72 + 23 + Math.sin(k * 6 + i) * 10, y - 64 - k * 70, 10 + k * 14);
    g.fillStyle = `rgba(230,230,235,${0.5 * (1 - k)})`;
    g.fill();
  }
  const mouths = ovenMouths(x, y, w, h, n);
  for (const m of mouths) {
    const { x: mx, y: my, w: mw, h: mh } = m;
    const i = mouths.indexOf(m);
    g.beginPath();
    g.moveTo(mx, my + mh);
    g.lineTo(mx, my + mh * 0.4);
    g.quadraticCurveTo(mx, my, mx + mw / 2, my);
    g.quadraticCurveTo(mx + mw, my, mx + mw, my + mh * 0.4);
    g.lineTo(mx + mw, my + mh);
    g.closePath();
    const fire = g.createLinearGradient(0, my, 0, my + mh);
    fire.addColorStop(0, '#2a120a');
    fire.addColorStop(1, '#5a2410');
    g.fillStyle = fire;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.stroke();
    // brasas
    for (let k = 0; k < 4; k++) {
      const fx = mx + 18 + k * ((mw - 36) / 3);
      const fh = 10 + Math.sin(t * 7 + k * 2 + i) * 4;
      ellipse(g, fx, my + mh - 10, 12, fh);
      g.fillStyle = k % 2 ? '#ff8a2a' : '#ffc23a';
      g.globalAlpha = 0.8;
      g.fill();
      g.globalAlpha = 1;
    }
  }
  return mouths;
}

/** Dónde quedan las bocas del horno (mismo cálculo para dibujar y para tocar). */
export function ovenMouths(x, y, w, h, n) {
  const mw = Math.min(210, (w - 60) / n - 20);
  const total = n * mw + (n - 1) * 26;
  return Array.from({ length: n }, (_, i) => {
    const mx = x + (w - total) / 2 + i * (mw + 26);
    const my = y + h * 0.42, mh = h * 0.42;
    return { x: mx, y: my, w: mw, h: mh, cx: mx + mw / 2, cy: my + mh * 0.62 };
  });
}

/** Reloj del horno: 8 octavos, la marca del punto pedido y la aguja. */
export function dial(g, x, y, r, level, target) {
  circle(g, x, y, r);
  fillStroke(g, '#fffdf4', 3.5);
  // zona pedida
  const a0 = -Math.PI / 2;
  const seg = TAU / 8;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, r * 0.86, a0, a0 + seg * Math.min(level, 8));
  g.closePath();
  g.fillStyle = level > BAKE_MAX ? '#5a3a2a' : level > target + 0.4 ? '#ff8a3d' : '#ffd23f';
  g.fill();
  for (let i = 0; i < 8; i++) {
    const a = a0 + i * seg;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
    g.lineTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(0,0,0,.3)';
    g.stroke();
  }
  // marca roja del punto
  const at = a0 + seg * target;
  g.beginPath();
  g.moveTo(x + Math.cos(at) * r * 0.5, y + Math.sin(at) * r * 0.5);
  g.lineTo(x + Math.cos(at) * r * 1.08, y + Math.sin(at) * r * 1.08);
  g.lineWidth = 5;
  g.strokeStyle = '#e5484d';
  g.stroke();
  // aguja
  const an = a0 + seg * Math.min(level, 9);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(an) * r * 0.8, y + Math.sin(an) * r * 0.8);
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.stroke();
  circle(g, x, y, r * 0.12);
  fillStroke(g, INK, 0);
}

// ---------------------------------------------------------------- íconos
export function regionIcon(g, reg, x, y, r) {
  circle(g, x, y, r);
  fillStroke(g, '#f6dca6', 2.5);
  g.beginPath();
  g.moveTo(x, y);
  const a = { all: [0, TAU], L: [Math.PI / 2, Math.PI * 1.5], R: [-Math.PI / 2, Math.PI / 2], TL: [Math.PI, Math.PI * 1.5], TR: [-Math.PI / 2, 0], BL: [Math.PI / 2, Math.PI], BR: [0, Math.PI / 2] }[reg];
  g.arc(x, y, r * 0.82, a[0], a[1]);
  g.closePath();
  g.fillStyle = '#e5484d';
  g.fill();
  if (reg !== 'all') {
    g.lineWidth = 1.5;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x, y + r);
    if (reg.length === 2) {
      g.moveTo(x - r, y);
      g.lineTo(x + r, y);
    }
    g.stroke();
  }
}
export function slicesIcon(g, x, y, r, n) {
  circle(g, x, y, r);
  fillStroke(g, '#eec27a', 2.5);
  circle(g, x, y, r * 0.8);
  g.fillStyle = '#ffd86b';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = INK;
  for (let i = 0; i < n / 2; i++) {
    const a = (i / (n / 2)) * Math.PI - Math.PI / 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.lineTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    g.stroke();
  }
}
export function ovenIcon(g, x, y, s) {
  g.beginPath();
  g.moveTo(x - s, y + s * 0.8);
  g.lineTo(x - s, y);
  g.quadraticCurveTo(x - s, y - s * 0.9, x, y - s * 0.9);
  g.quadraticCurveTo(x + s, y - s * 0.9, x + s, y);
  g.lineTo(x + s, y + s * 0.8);
  g.closePath();
  fillStroke(g, '#c46a3c', Math.max(2, s * 0.14));
  g.beginPath();
  g.moveTo(x - s * 0.5, y + s * 0.8);
  g.lineTo(x - s * 0.5, y + s * 0.1);
  g.quadraticCurveTo(x, y - s * 0.4, x + s * 0.5, y + s * 0.1);
  g.lineTo(x + s * 0.5, y + s * 0.8);
  g.closePath();
  fillStroke(g, '#3a160c', Math.max(1.5, s * 0.1));
  ellipse(g, x, y + s * 0.55, s * 0.3, s * 0.18);
  g.fillStyle = '#ffb02e';
  g.fill();
}
export function buildIcon(g, x, y, s) {
  circle(g, x, y, s);
  fillStroke(g, '#eec27a', Math.max(2, s * 0.13));
  circle(g, x, y, s * 0.75);
  g.fillStyle = '#d43a28';
  g.fill();
  for (const [px, py] of [[-0.3, -0.25], [0.32, -0.1], [0, 0.35]]) topping(g, 'calabresa', x + px * s, y + py * s, s * 0.22, 0, 1.5);
}
export function cutIcon(g, x, y, s) {
  slicesIcon(g, x - s * 0.15, y + s * 0.1, s * 0.82, 4);
  cutter(g, x + s * 0.55, y - s * 0.35, s * 0.55, -0.7);
}

export { lerp };
