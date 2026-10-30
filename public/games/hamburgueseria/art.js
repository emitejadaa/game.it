/**
 * Hamburguesería — dibujos: cada capa de la hamburguesa vista de costado (panes con sésamo, carne que cambia de color
 * según el punto, queso que chorrea, lechuga, tomate, cebolla, pepinillos, panceta, huevo, palta, hongos y salsas),
 * los medallones vistos desde arriba sobre la parrilla con sus marcas, la parrilla con brasas, los pomos y los íconos.
 */
import { A } from '/shared/cocina/shell.js';
import { TAU, clamp, rng } from '/shared/cocina/core.js';
import { byId, BURN } from './shared/rules.js';

const { INK, rr, fillStroke, circle, ellipse, mix, darker, lighter } = A;

/** Color de la carne según cuánto se cocinó (0 crudo, 1 bien cocido, más = quemado). */
export function meatColor(v) {
  if (v < 0.5) return mix('#e8838a', '#b8654a', v / 0.5);
  if (v < 1) return mix('#b8654a', '#6e3b22', (v - 0.5) / 0.5);
  return mix('#6e3b22', '#24160f', clamp((v - 1) / (BURN - 1 + 0.2), 0, 1));
}

/** Una capa de la hamburguesa vista de costado: (x, y) es el centro de abajo; w el ancho del pan. */
export function layer(g, it, x, y, w, s = 1) {
  const id = it.id;
  const h = byId[id].h * s;
  const L = Math.max(1.5, 3 * s);
  g.save();
  g.translate(x, y);
  switch (id) {
    case 'panabajo':
      g.beginPath();
      g.moveTo(-w / 2, -h);
      g.lineTo(w / 2, -h);
      g.quadraticCurveTo(w / 2 + 2 * s, -h * 0.1, w * 0.4, 0);
      g.lineTo(-w * 0.4, 0);
      g.quadraticCurveTo(-w / 2 - 2 * s, -h * 0.1, -w / 2, -h);
      g.closePath();
      fillStroke(g, '#e0a050', L);
      rr(g, -w / 2 + 2 * s, -h - 1, w - 4 * s, 7 * s, 3 * s);
      g.fillStyle = '#f7e2b0';
      g.fill();
      break;
    case 'panarriba': {
      g.beginPath();
      g.moveTo(-w / 2, 0);
      g.bezierCurveTo(-w / 2, -h * 1.35, w / 2, -h * 1.35, w / 2, 0);
      g.closePath();
      fillStroke(g, '#e39a43', L);
      g.beginPath();
      g.moveTo(-w * 0.38, -h * 0.75);
      g.bezierCurveTo(-w * 0.25, -h * 0.98, w * 0.05, -h * 1.02, w * 0.18, -h * 0.95);
      g.lineWidth = 6 * s;
      g.strokeStyle = 'rgba(255,255,255,.3)';
      g.lineCap = 'round';
      g.stroke();
      const r = rng(3);
      g.fillStyle = '#fff6d8';
      for (let i = 0; i < 11; i++) {
        const px = (r() - 0.5) * w * 0.75, py = -h * (0.35 + r() * 0.55);
        ellipse(g, px, py, 3.2 * s, 1.8 * s, r() * 3);
        g.fill();
      }
      break;
    }
    case 'carne': {
      const p = it.patty || { a: 0.75, b: 0.75 };
      const col = meatColor((p.a + p.b) / 2);
      rr(g, -w * 0.52, -h, w * 1.04, h, h * 0.45);
      fillStroke(g, col, L);
      g.fillStyle = darker(col, 0.18);
      const r = rng(5);
      for (let i = 0; i < 9; i++) {
        circle(g, (r() - 0.5) * w * 0.9, -h * (0.25 + r() * 0.5), 2.2 * s);
        g.fill();
      }
      break;
    }
    case 'queso':
      g.beginPath();
      g.moveTo(-w * 0.55, -h);
      g.lineTo(w * 0.55, -h);
      g.lineTo(w * 0.55, 0);
      g.lineTo(w * 0.36, 0);
      g.quadraticCurveTo(w * 0.3, h * 1.8, w * 0.24, 0);
      g.lineTo(-w * 0.18, 0);
      g.quadraticCurveTo(-w * 0.25, h * 2.4, -w * 0.32, 0);
      g.lineTo(-w * 0.55, 0);
      g.closePath();
      fillStroke(g, '#ffc928', L);
      break;
    case 'lechuga': {
      g.beginPath();
      g.moveTo(-w * 0.6, -h * 0.4);
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const xx = -w * 0.6 + (i / n) * w * 1.2;
        g.quadraticCurveTo(xx - w * 0.06, i % 2 ? -h * 1.25 : -h * 0.55, xx, -h * 0.75);
      }
      for (let i = n; i >= 0; i--) {
        const xx = -w * 0.6 + (i / n) * w * 1.2;
        g.quadraticCurveTo(xx + w * 0.06, i % 2 ? h * 0.45 : -h * 0.05, xx, h * 0.1);
      }
      g.closePath();
      fillStroke(g, '#6cc04a', L);
      break;
    }
    case 'tomate':
      for (const sx of [-0.25, 0.25]) {
        rr(g, sx * w - w * 0.27, -h, w * 0.54, h, h / 2);
        fillStroke(g, '#e8392f', L);
        g.fillStyle = '#ff8a7a';
        g.fillRect(sx * w - w * 0.2, -h * 0.62, w * 0.4, h * 0.22);
      }
      break;
    case 'cebolla':
      for (const sx of [-0.3, 0, 0.3]) {
        ellipse(g, sx * w, -h / 2, w * 0.17, h / 2);
        fillStroke(g, '#f4e9f4', L);
        ellipse(g, sx * w, -h / 2, w * 0.1, h * 0.25);
        g.fillStyle = '#c98ac9';
        g.fill();
      }
      break;
    case 'pepinos':
      for (const sx of [-0.32, -0.1, 0.12, 0.34]) {
        ellipse(g, sx * w, -h / 2, w * 0.1, h / 2);
        fillStroke(g, '#6f9a2e', L);
      }
      break;
    case 'panceta':
      for (const sy of [0]) {
        g.beginPath();
        g.moveTo(-w * 0.55, -h + sy);
        for (let i = 0; i <= 6; i++) g.quadraticCurveTo(-w * 0.55 + ((i + 0.5) * w * 1.1) / 7, -h * (i % 2 ? 1.5 : 0.5) + sy, -w * 0.55 + ((i + 1) * w * 1.1) / 7, -h + sy);
        g.lineTo(w * 0.55, sy);
        for (let i = 6; i >= 0; i--) g.quadraticCurveTo(-w * 0.55 + ((i + 0.5) * w * 1.1) / 7, h * (i % 2 ? 0.5 : -0.5) + sy, -w * 0.55 + (i * w * 1.1) / 7, sy);
        g.closePath();
        fillStroke(g, '#c94a3c', L);
      }
      break;
    case 'huevo':
      g.beginPath();
      g.moveTo(-w * 0.55, 0);
      g.quadraticCurveTo(-w * 0.5, -h * 0.8, -w * 0.2, -h * 0.5);
      g.quadraticCurveTo(0, -h * 1.6, w * 0.2, -h * 0.5);
      g.quadraticCurveTo(w * 0.5, -h * 0.8, w * 0.55, 0);
      g.closePath();
      fillStroke(g, '#fffdf4', L);
      ellipse(g, 0, -h * 0.75, w * 0.16, h * 0.42);
      fillStroke(g, '#ffb81f', L * 0.8);
      break;
    case 'palta':
      for (const sx of [-0.3, 0, 0.3]) {
        ellipse(g, sx * w, -h / 2, w * 0.17, h / 2);
        fillStroke(g, '#a8d36a', L);
      }
      break;
    case 'hongos':
      for (const sx of [-0.3, 0, 0.3]) {
        g.beginPath();
        g.moveTo(sx * w - w * 0.15, 0);
        g.quadraticCurveTo(sx * w - w * 0.15, -h * 1.1, sx * w, -h * 1.1);
        g.quadraticCurveTo(sx * w + w * 0.15, -h * 1.1, sx * w + w * 0.15, 0);
        g.closePath();
        fillStroke(g, '#b08a6a', L);
      }
      break;
    default:
      if (byId[id]?.sauce) {
        g.beginPath();
        const n = 7;
        g.moveTo(-w * 0.42, -h * 0.5);
        for (let i = 1; i <= n; i++) g.quadraticCurveTo(-w * 0.42 + ((i - 0.5) * w * 0.84) / n, i % 2 ? -h * 1.6 : h * 0.6, -w * 0.42 + (i * w * 0.84) / n, -h * 0.5);
        g.lineWidth = h * 1.1;
        g.strokeStyle = INK;
        g.lineCap = 'round';
        g.stroke();
        g.lineWidth = h * 0.7;
        g.strokeStyle = byId[id].color;
        g.stroke();
      }
  }
  g.restore();
  return h;
}

/** La hamburguesa entera: cada capa con su corrimiento. Devuelve la altura total. */
export function burger(g, b, x, y, w, s = 1) {
  let yy = y;
  for (const it of b.items) {
    const h = byId[it.id].h * s;
    layer(g, it, x + it.x * w, yy, w, s);
    yy -= byId[it.id].sauce ? h * 0.5 : h * 0.92;
  }
  return y - yy;
}
/** Dónde termina la pila (para saber a qué altura cae lo próximo). */
export function stackTop(b, y, s = 1) {
  let yy = y;
  for (const it of b.items) yy -= byId[it.id].sauce ? byId[it.id].h * s * 0.5 : byId[it.id].h * s * 0.92;
  return yy;
}

/** Medallón visto desde arriba en la parrilla: se ve el lado de arriba (el que no se está cocinando). */
export function pattyTop(g, p, x, y, r, flipK = 1) {
  const up = p.down === 'a' ? p.b : p.a;
  const col = meatColor(up);
  ellipse(g, x, y, r, r * flipK);
  fillStroke(g, col, Math.max(2, r * 0.07));
  if (up > 0.25) {
    g.save();
    ellipse(g, x, y, r * 0.95, r * 0.95 * flipK);
    g.clip();
    g.strokeStyle = `rgba(40,20,10,${clamp((up - 0.25) * 0.8, 0, 0.6)})`;
    g.lineWidth = r * 0.12;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(x - r, y + i * r * 0.36 - r * 0.3);
      g.lineTo(x + r, y + i * r * 0.36 + r * 0.3);
      g.stroke();
    }
    g.restore();
  }
  const r2 = rng(Math.round(x + y));
  g.fillStyle = 'rgba(255,255,255,.12)';
  for (let i = 0; i < 6; i++) {
    circle(g, x + (r2() - 0.5) * r, y + (r2() - 0.5) * r * flipK, r * 0.08);
    g.fill();
  }
}

/** Medidor de un medallón: dos barras (lado de abajo y de arriba) con la marca del punto. */
export function pattyMeter(g, p, x, y, h, target) {
  const w = 12;
  for (const [i, side] of [[0, 'a'], [1, 'b']]) {
    const bx = x + i * (w + 4);
    rr(g, bx, y, w, h, 5);
    fillStroke(g, '#fffdf4', 2);
    const v = clamp(p[side] / BURN, 0, 1);
    rr(g, bx + 2, y + h - h * v, w - 4, Math.max(0, h * v - 2), 3);
    g.fillStyle = meatColor(p[side]);
    g.fill();
    const ty = y + h - (h * target) / BURN;
    g.fillStyle = '#5cbf4f';
    g.fillRect(bx - 3, ty - 2, w + 6, 4);
    if (p.down === side) {
      g.beginPath();
      g.moveTo(bx + w / 2 - 5, y + h + 4);
      g.lineTo(bx + w / 2 + 5, y + h + 4);
      g.lineTo(bx + w / 2, y + h + 11);
      g.closePath();
      g.fillStyle = '#ff6b2a';
      g.fill();
    }
  }
}

export function grillTop(g, x, y, w, h, t) {
  rr(g, x - 14, y - 14, w + 28, h + 28, 22);
  fillStroke(g, '#3a3f47', 4);
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#2a1a14');
  gr.addColorStop(1, '#4a2014');
  rr(g, x, y, w, h, 14);
  g.fillStyle = gr;
  g.fill();
  // brasas que laten
  for (let i = 0; i < 14; i++) {
    const bx = x + ((i * 97) % (w - 40)) + 20, by = y + ((i * 53) % (h - 40)) + 20;
    circle(g, bx, by, 10 + ((i * 7) % 6));
    g.fillStyle = `rgba(255,${120 + ((i * 31) % 80)},40,${0.25 + 0.15 * Math.sin(t * 3 + i)})`;
    g.fill();
  }
  g.strokeStyle = '#8a929e';
  g.lineWidth = 6;
  for (let xx = x + 18; xx < x + w; xx += 30) {
    g.beginPath();
    g.moveTo(xx, y + 6);
    g.lineTo(xx, y + h - 6);
    g.stroke();
  }
  rr(g, x, y, w, h, 14);
  g.lineWidth = 3.5;
  g.strokeStyle = INK;
  g.stroke();
}

export function sauceBottle(g, id, x, y, s, active) {
  const col = byId[id].color;
  rr(g, x - 20 * s, y - 72 * s, 40 * s, 72 * s, 12 * s);
  fillStroke(g, col, 3);
  rr(g, x - 14 * s, y - 50 * s, 28 * s, 20 * s, 5 * s);
  fillStroke(g, active ? '#ffe27a' : '#fffdf4', 2);
  g.beginPath();
  g.moveTo(x - 9 * s, y - 72 * s);
  g.lineTo(x - 2 * s, y - 96 * s);
  g.lineTo(x + 2 * s, y - 96 * s);
  g.lineTo(x + 9 * s, y - 72 * s);
  g.closePath();
  fillStroke(g, col, 2.5);
}

// ---------------------------------------------------------------- íconos
export function grillIcon(g, x, y, s) {
  rr(g, x - s, y - s * 0.6, s * 2, s * 1.2, s * 0.25);
  fillStroke(g, '#3a3f47', Math.max(2, s * 0.12));
  g.strokeStyle = '#c9ced6';
  g.lineWidth = Math.max(1.5, s * 0.1);
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(x + i * s * 0.36, y - s * 0.5);
    g.lineTo(x + i * s * 0.36, y + s * 0.5);
    g.stroke();
  }
  pattyTop(g, { a: 0.7, b: 0.7, down: 'a' }, x, y, s * 0.5);
}
export function buildIcon(g, x, y, s) {
  const b = { items: [{ id: 'panabajo', x: 0 }, { id: 'carne', x: 0, patty: { a: 0.75, b: 0.75 } }, { id: 'queso', x: 0 }, { id: 'lechuga', x: 0 }, { id: 'panarriba', x: 0 }] };
  burger(g, b, x, y + s * 0.85, s * 1.8, s / 40);
}
