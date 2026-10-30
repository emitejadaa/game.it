/**
 * Cocina — dibujos compartidos, todo con código: contornos de historieta, los clientes (cuerpo, cara, pelo, ropa y
 * gestos), cabecitas para las comandas, papel, monedas, estrellas, botones y el salón del local con su mostrador.
 */
import { TAU, clamp, lerp, rng } from './core.js';

export const INK = '#2b1d16';
export const FONT = '"Fredoka", "Nunito", system-ui, sans-serif';

// ---------------------------------------------------------------- formas
export function rr(g, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export function fillStroke(g, fill, lw = 3, stroke = INK) {
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (lw) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
  }
}
export function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}
export function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, TAU);
}

/** Mezcla dos colores hex (k = 0 → a, 1 → b). */
export function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const c = (s) => Math.round(lerp(ch(pa, s), ch(pb, s), k));
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}
export const darker = (c, k = 0.25) => mix(c, '#000000', k);
export const lighter = (c, k = 0.3) => mix(c, '#ffffff', k);

/** Texto de historieta: relleno con contorno grueso. */
export function text(g, s, x, y, size, { color = '#fff', stroke = INK, lw = null, align = 'center', base = 'middle', weight = 700, max = 0 } = {}) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = base;
  if (max) {
    const w = g.measureText(s).width;
    if (w > max) {
      size = Math.max(8, (size * max) / w);
      g.font = `${weight} ${size}px ${FONT}`;
    }
  }
  if (stroke) {
    g.lineWidth = lw ?? Math.max(2, size * 0.2);
    g.strokeStyle = stroke;
    g.lineJoin = 'round';
    g.strokeText(s, x, y);
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** Párrafo centrado en (x, y) que se corta en renglones de ancho `maxW`. */
export function para(g, s, x, y, maxW, size, opts = {}) {
  g.font = `${opts.weight || 600} ${size}px ${FONT}`;
  const words = String(s).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  const lh = size * 1.22;
  const y0 = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => text(g, l, x, y0 + i * lh, size, { stroke: null, weight: 600, ...opts }));
  return lines.length * lh;
}

export function star(g, x, y, r, fill = '#ffd23f', lw = 3) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
  fillStroke(g, fill, lw);
}

export function coin(g, x, y, r) {
  circle(g, x, y, r);
  fillStroke(g, '#ffcf33', Math.max(1.5, r * 0.18));
  circle(g, x, y, r * 0.66);
  g.lineWidth = Math.max(1, r * 0.1);
  g.strokeStyle = '#d79a12';
  g.stroke();
  text(g, '$', x, y + r * 0.05, r * 1.05, { color: '#d79a12', stroke: null, weight: 800 });
}

export function heart(g, x, y, s, fill = '#ff4f6d') {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  fillStroke(g, fill, Math.max(1.5, s * 0.22));
}

/** Papel de comanda con borde dentado abajo. */
export function paper(g, x, y, w, h, { color = '#fffdf4', lw = 3, teeth = true } = {}) {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + h);
  if (teeth) {
    const n = Math.max(4, Math.round(w / 14));
    for (let i = n; i >= 0; i--) g.lineTo(x + (w * i) / n, y + h - (i % 2 ? 6 : 0));
  } else g.lineTo(x, y + h);
  g.closePath();
  fillStroke(g, color, lw);
}

/** Botón de historieta dibujado en el canvas. */
export function button(g, x, y, w, h, label, { fill = '#ffd23f', color = INK, size = 26, on = true, hover = false, press = false, icon = null, r = 18 } = {}) {
  const dy = press ? 4 : 0;
  g.save();
  if (!on) g.globalAlpha = 0.45;
  rr(g, x, y + 6, w, h, r);
  g.fillStyle = INK;
  g.fill();
  rr(g, x, y + dy, w, h, r);
  fillStroke(g, hover && on ? lighter(fill, 0.18) : fill, 3.5);
  rr(g, x + 6, y + dy + 5, w - 12, h * 0.34, r * 0.6);
  g.fillStyle = 'rgba(255,255,255,.28)';
  g.fill();
  let tx = x + w / 2;
  if (icon) {
    icon(g, x + h * 0.55, y + dy + h / 2, h * 0.3);
    tx += h * 0.25;
  }
  if (label) text(g, label, tx, y + dy + h / 2 + 1, size, { color, stroke: null, weight: 700, max: w - (icon ? h : 0) - 16 });
  g.restore();
}

// ---------------------------------------------------------------- clientes
const MOUTH = { love: 'grin', happy: 'smile', ok: 'flat', sad: 'frown', angry: 'frown', wait: 'flat', talk: 'talk', wow: 'o' };

/**
 * Un cliente de cuerpo entero con los pies en (x, y). s = escala (1 → ~250 de alto).
 * st: { mood, t (segundos), talk (0..1), walk (fase o null), arms: 'down'|'wave'|'hold'|'cheer', seed }
 */
export function person(g, p, x, y, s, st = {}) {
  const L = p.look;
  const t = st.t || 0;
  const kidS = L.kid ? 0.82 : 1;
  const sc = s * kidS * (L.tall || 1);
  const walk = st.walk;
  const bob = walk != null ? Math.abs(Math.sin(walk * 2)) * 6 : Math.sin(t * 1.6 + (p.seed % 7)) * 1.2;
  g.save();
  g.translate(x, y);
  g.scale(sc, sc);
  // sombra
  ellipse(g, 0, 0, 46, 9);
  g.fillStyle = 'rgba(0,0,0,.16)';
  g.fill();
  g.translate(0, -bob);
  const pants = darker(L.shirt2, 0.35);
  if (st.sit) {
    // sentado de frente: la falda de las piernas, las rodillas hacia adelante y las canillas hasta el piso
    for (const sgn of [-1, 1]) {
      rr(g, sgn * 18 - 10, -42, 20, 38, 8);
      fillStroke(g, pants, 3);
      ellipse(g, sgn * 20 + sgn * 3, -6, 15, 8);
      fillStroke(g, '#3b2f2a', 3);
    }
    rr(g, -34, -68, 68, 30, 12);
    fillStroke(g, pants, 3);
    for (const sgn of [-1, 1]) {
      ellipse(g, sgn * 18, -40, 16, 12);
      fillStroke(g, pants, 3);
    }
  } else {
    // piernas
    const legA = walk != null ? Math.sin(walk * 2) * 9 : 0;
    for (const sgn of [-1, 1]) {
      rr(g, sgn * 14 - 9 + sgn * legA * 0.3, -62, 18, 56 + (sgn * legA > 0 ? -3 : 0), 8);
      fillStroke(g, pants, 3);
      ellipse(g, sgn * 14 + sgn * legA * 0.3 + sgn * 3, -6, 15, 8);
      fillStroke(g, '#3b2f2a', 3);
    }
  }
  drawTorso(g, L, st);
  drawHeadAt(g, p, 0, -176, 1, st);
  g.restore();
}

function drawTorso(g, L, st) {
  const arms = st.arms || 'down';
  const t = st.t || 0;
  // brazos de atrás (los que saludan o festejan van arriba)
  const armUp = arms === 'cheer' ? [1, 1] : arms === 'wave' ? [0, 1] : [0, 0];
  const swing = st.walk != null ? Math.sin(st.walk * 2) * 0.35 : 0;
  for (const [i, sgn] of [[0, -1], [1, 1]]) {
    g.save();
    g.translate(sgn * 33, -128);
    let a = sgn * 0.18 + (i ? swing : -swing);
    if (armUp[i]) a = sgn * (2.5 + Math.sin(t * 9) * 0.25 * (arms === 'wave' ? 1.6 : 0.5));
    if (arms === 'hold') a = sgn * -0.55;
    g.rotate(a);
    rr(g, -9, -4, 18, 58, 9);
    fillStroke(g, L.shirt, 3);
    circle(g, 0, 58, 10);
    fillStroke(g, L.skin, 3);
    g.restore();
  }
  // torso
  g.beginPath();
  g.moveTo(-34, -142);
  g.quadraticCurveTo(-40, -100, -36, -58);
  g.lineTo(36, -58);
  g.quadraticCurveTo(40, -100, 34, -142);
  g.quadraticCurveTo(0, -152, -34, -142);
  g.closePath();
  fillStroke(g, L.shirt, 3);
  if (L.stripes) {
    g.save();
    g.clip();
    g.fillStyle = L.shirt2;
    for (let yy = -136; yy < -58; yy += 16) g.fillRect(-45, yy, 90, 7);
    g.restore();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
  }
  // cuello de la remera
  g.lineWidth = 3;
  g.strokeStyle = INK;
  if (L.collar === 'v') {
    g.beginPath();
    g.moveTo(-12, -146);
    g.lineTo(0, -128);
    g.lineTo(12, -146);
    g.fillStyle = L.skin;
    g.fill();
    g.stroke();
  } else if (L.collar === 'polo') {
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -140);
      g.lineTo(sgn * 18, -150);
      g.lineTo(sgn * 14, -132);
      g.closePath();
      fillStroke(g, lighter(L.shirt, 0.25), 3);
    }
  } else if (L.collar === 'hood') {
    g.beginPath();
    g.ellipse(0, -144, 26, 10, 0, 0, Math.PI);
    fillStroke(g, darker(L.shirt, 0.12), 3);
  } else {
    g.beginPath();
    g.ellipse(0, -145, 14, 6, 0, 0, Math.PI);
    g.stroke();
  }
}

/** Cabeza (con pelo, cara y accesorios) centrada en (x, y); s = escala (1 → radio 50). */
export function drawHeadAt(g, p, x, y, s, st = {}) {
  const L = p.look;
  const t = st.t || 0;
  const hw = 50 * (L.head || 1);
  const hh = 50;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  // cuello
  rr(g, -10, 34, 20, 22, 6);
  fillStroke(g, darker(L.skin, 0.08), 3);
  hairBack(g, L, hw, hh);
  // orejas
  for (const sgn of [-1, 1]) {
    ellipse(g, sgn * hw * 0.97, 6, 10, 13);
    fillStroke(g, L.skin, 3);
    if (L.earrings) {
      circle(g, sgn * hw * 0.98, 21, 4);
      fillStroke(g, '#ffd23f', 2);
    }
  }
  ellipse(g, 0, 0, hw, hh);
  fillStroke(g, L.skin, 3.2);
  face(g, p, hw, hh, st, t);
  hairFront(g, L, hw, hh);
  if (L.beard) beard(g, L, hw);
  if (L.glasses) glasses(g, L.glasses, hw);
  if (L.hat) hat(g, L, hw, hh);
  g.restore();
}

/** Cabecita sola para las comandas y la libreta (cabe en un círculo de radio r). */
export function head(g, p, x, y, r, st = {}) {
  drawHeadAt(g, p, x, y + r * 0.08, r / 62, st);
}

function hairBack(g, L, hw, hh) {
  const c = L.hairC;
  if (L.hair === 'long' || L.hair === 'wavy') {
    g.beginPath();
    g.moveTo(-hw * 1.06, -10);
    g.quadraticCurveTo(-hw * 1.25, 52, -hw * 0.95, L.hair === 'long' ? 78 : 58);
    g.lineTo(hw * 0.95, L.hair === 'long' ? 78 : 58);
    g.quadraticCurveTo(hw * 1.25, 52, hw * 1.06, -10);
    g.closePath();
    fillStroke(g, darker(c, 0.1), 3);
  } else if (L.hair === 'pony') {
    g.beginPath();
    g.moveTo(hw * 0.55, -36);
    g.quadraticCurveTo(hw * 1.45, -20, hw * 1.12, 46);
    g.quadraticCurveTo(hw * 0.95, 20, hw * 0.6, -6);
    g.closePath();
    fillStroke(g, c, 3);
  } else if (L.hair === 'bun') {
    circle(g, 0, -hh * 1.12, 20);
    fillStroke(g, c, 3);
  } else if (L.hair === 'pigtails') {
    for (const sgn of [-1, 1]) {
      ellipse(g, sgn * hw * 1.18, 10, 15, 24, sgn * 0.3);
      fillStroke(g, c, 3);
    }
  } else if (L.hair === 'curly') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 1.02 + (i / 8) * Math.PI * 0.96;
      circle(g, Math.cos(a) * hw * 1.02, Math.sin(a) * hh * 1.0 - 4, 19);
      fillStroke(g, c, 3);
    }
  }
}

function hairFront(g, L, hw, hh) {
  const c = L.hairC;
  g.lineWidth = 3;
  g.strokeStyle = INK;
  switch (L.hair) {
    case 'bald':
      g.beginPath();
      g.arc(-hw * 0.4, -hh * 0.55, 9, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fill();
      return;
    case 'buzz':
      g.beginPath();
      g.ellipse(0, -6, hw * 1.0, hh * 0.98, 0, Math.PI * 1.06, Math.PI * 1.94);
      g.quadraticCurveTo(0, -hh * 0.55, -hw * 0.98, -16);
      g.closePath();
      fillStroke(g, mix(c, L.skin, 0.35), 3);
      return;
    case 'spiky': {
      g.beginPath();
      g.moveTo(-hw * 1.0, -4);
      for (let i = 0; i <= 7; i++) {
        const k = i / 7;
        const xx = lerp(-hw * 1.0, hw * 1.0, k);
        const top = -hh * (0.75 + Math.sin(k * Math.PI) * 0.35);
        g.lineTo(xx - hw * 0.08, top + (i % 2 ? 18 : -14));
      }
      g.lineTo(hw * 1.0, -4);
      g.quadraticCurveTo(0, -hh * 0.45, -hw * 1.0, -4);
      g.closePath();
      fillStroke(g, c, 3);
      return;
    }
    case 'mohawk':
      g.beginPath();
      g.moveTo(-14, -hh * 0.7);
      for (let i = 0; i <= 5; i++) g.lineTo(-14 + i * 5.6, -hh * (1.25 + (i % 2) * 0.18));
      g.lineTo(14, -hh * 0.7);
      g.closePath();
      fillStroke(g, c, 3);
      return;
    case 'curly':
      for (let i = 0; i < 6; i++) {
        circle(g, -hw * 0.75 + i * hw * 0.3, -hh * 0.78 + (i % 2) * 6, 16);
        fillStroke(g, c, 3);
      }
      return;
    case 'bob':
    case 'long':
    case 'wavy':
    case 'pigtails':
    case 'pony':
    case 'bun':
    case 'short':
    case 'side':
    default: {
      g.beginPath();
      g.moveTo(-hw * 1.04, 10);
      g.quadraticCurveTo(-hw * 1.12, -hh * 1.05, 0, -hh * 1.08);
      g.quadraticCurveTo(hw * 1.12, -hh * 1.05, hw * 1.04, 10);
      if (L.hair === 'side') {
        g.quadraticCurveTo(hw * 0.7, -hh * 0.5, -hw * 0.2, -hh * 0.55);
        g.quadraticCurveTo(-hw * 0.7, -hh * 0.4, -hw * 1.04, 10);
      } else if (L.hair === 'bob') {
        g.lineTo(hw * 1.06, 30);
        g.quadraticCurveTo(hw * 0.7, -hh * 0.45, 0, -hh * 0.5);
        g.quadraticCurveTo(-hw * 0.7, -hh * 0.45, -hw * 1.06, 30);
      } else {
        // flequillo en ondas
        const n = L.hair === 'short' ? 3 : 4;
        for (let i = n; i >= 0; i--) {
          const xx = lerp(-hw * 1.0, hw * 1.0, i / n);
          g.quadraticCurveTo(xx + hw / n, -hh * 0.35, xx, -hh * (i % 2 ? 0.55 : 0.4));
        }
      }
      g.closePath();
      fillStroke(g, c, 3);
      // brillo
      g.beginPath();
      g.ellipse(-hw * 0.35, -hh * 0.78, hw * 0.22, 6, -0.3, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.fill();
    }
  }
}

function face(g, p, hw, hh, st, t) {
  const L = p.look;
  const m = st.mood || 'ok';
  const blink = ((t + (p.seed % 13) * 0.37) % 4.1) < 0.12;
  const ey = -4;
  const ex = hw * 0.36;
  // cejas
  if (L.brows !== 'none') {
    g.lineWidth = L.brows === 'thick' ? 6 : 3.5;
    g.strokeStyle = darker(L.hairC, 0.3);
    for (const sgn of [-1, 1]) {
      g.beginPath();
      const tilt = m === 'sad' ? -6 : m === 'angry' ? 7 : 0;
      const yy = ey - 20 - (m === 'wow' ? 6 : 0);
      // extremo de adentro (hacia la nariz) y de afuera: tristes suben adentro, enojados bajan adentro
      const inX = sgn * (ex - 11), outX = sgn * (ex + 11);
      if (L.brows === 'arch') {
        g.moveTo(inX, yy + 3 + tilt * 0.5);
        g.quadraticCurveTo(sgn * ex, yy - 6, outX, yy + 3 - tilt * 0.5);
      } else {
        g.moveTo(inX, yy + tilt * 0.5);
        g.lineTo(outX, yy - tilt * 0.5);
      }
      g.stroke();
    }
  }
  // ojos
  for (const sgn of [-1, 1]) {
    const x = sgn * ex;
    if (blink || m === 'love') {
      g.beginPath();
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      if (m === 'love') g.arc(x, ey + 3, 8, Math.PI * 1.15, Math.PI * 1.85);
      else {
        g.moveTo(x - 8, ey);
        g.lineTo(x + 8, ey);
      }
      g.stroke();
      continue;
    }
    if (L.eyes === 'happy' && (m === 'happy' || m === 'ok')) {
      g.beginPath();
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.arc(x, ey + 4, 7, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      continue;
    }
    const big = L.eyes === 'oval' || L.eyes === 'lash' || m === 'wow';
    ellipse(g, x, ey, big ? 8 : 6.5, big ? 11 : 8);
    g.fillStyle = INK;
    g.fill();
    circle(g, x + 2.5, ey - 3, 2.6);
    g.fillStyle = '#fff';
    g.fill();
    if (L.eyes === 'lash') {
      g.lineWidth = 2.5;
      g.strokeStyle = INK;
      g.beginPath();
      g.moveTo(x + sgn * 7, ey - 8);
      g.lineTo(x + sgn * 12, ey - 12);
      g.stroke();
    }
  }
  // nariz
  g.lineWidth = 3;
  g.strokeStyle = darker(L.skin, 0.35);
  g.beginPath();
  if (L.nose === 'dot') {
    ellipse(g, 0, 10, 4.5, 3.5);
    g.fillStyle = darker(L.skin, 0.18);
    g.fill();
  } else if (L.nose === 'round') {
    g.arc(0, 10, 7, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  } else {
    g.moveTo(-2, 2);
    g.quadraticCurveTo(7, 12, -3, 15);
    g.stroke();
  }
  // cachetes y pecas
  if (L.cheeks || m === 'love') {
    for (const sgn of [-1, 1]) {
      ellipse(g, sgn * hw * 0.55, 16, 10, 6);
      g.fillStyle = m === 'love' ? 'rgba(255,80,110,.45)' : 'rgba(255,110,110,.28)';
      g.fill();
    }
  }
  if (L.freckles) {
    g.fillStyle = darker(L.skin, 0.3);
    for (const [fx, fy] of [[-20, 12], [-26, 8], [-15, 9], [20, 12], [26, 8], [15, 9]]) {
      circle(g, fx, fy, 1.6);
      g.fill();
    }
  }
  // boca
  const mouth = st.talk ? 'talk' : MOUTH[m] || 'flat';
  g.lineWidth = 3.5;
  g.strokeStyle = INK;
  const my = 26;
  g.beginPath();
  if (mouth === 'grin') {
    g.moveTo(-15, my - 3);
    g.quadraticCurveTo(0, my + 18, 15, my - 3);
    g.closePath();
    fillStroke(g, '#8a2a2a', 3);
    g.beginPath();
    g.moveTo(-11, my - 1);
    g.lineTo(11, my - 1);
    g.lineTo(9, my + 3);
    g.lineTo(-9, my + 3);
    g.closePath();
    g.fillStyle = '#fff';
    g.fill();
  } else if (mouth === 'smile') {
    g.moveTo(-12, my - 2);
    g.quadraticCurveTo(0, my + 10, 12, my - 2);
    g.stroke();
  } else if (mouth === 'frown') {
    g.moveTo(-11, my + 5);
    g.quadraticCurveTo(0, my - 6, 11, my + 5);
    g.stroke();
  } else if (mouth === 'talk') {
    const o = 3 + Math.abs(Math.sin(t * 16)) * 7;
    ellipse(g, 0, my + 2, 9, o);
    fillStroke(g, '#8a2a2a', 3);
  } else if (mouth === 'o') {
    ellipse(g, 0, my + 3, 6, 8);
    fillStroke(g, '#8a2a2a', 3);
  } else {
    g.moveTo(-9, my + 1);
    g.lineTo(9, my + 1);
    g.stroke();
  }
  if (m === 'angry') {
    // venita
    g.lineWidth = 3;
    g.strokeStyle = '#e5484d';
    g.beginPath();
    const vx = hw * 0.55, vy = -hh * 0.62;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.moveTo(vx + a * 3, vy + b * 3);
      g.lineTo(vx + a * 9, vy + b * 9);
    }
    g.stroke();
  }
}

function beard(g, L, hw) {
  const c = darker(L.hairC, 0.05);
  g.lineWidth = 3;
  g.strokeStyle = INK;
  if (L.beard === 'mustache') {
    g.beginPath();
    g.moveTo(0, 17);
    g.quadraticCurveTo(-14, 13, -20, 24);
    g.quadraticCurveTo(-8, 22, 0, 21);
    g.quadraticCurveTo(8, 22, 20, 24);
    g.quadraticCurveTo(14, 13, 0, 17);
    fillStroke(g, c, 2.5);
  } else if (L.beard === 'goatee') {
    g.beginPath();
    g.moveTo(-9, 38);
    g.quadraticCurveTo(0, 56, 9, 38);
    g.quadraticCurveTo(0, 42, -9, 38);
    fillStroke(g, c, 2.5);
  } else if (L.beard === 'stubble') {
    g.fillStyle = 'rgba(40,30,30,.18)';
    ellipse(g, 0, 30, hw * 0.75, 20);
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(-hw * 0.95, 4);
    g.quadraticCurveTo(-hw * 0.9, 58, 0, 62);
    g.quadraticCurveTo(hw * 0.9, 58, hw * 0.95, 4);
    g.quadraticCurveTo(hw * 0.6, 30, 12, 20);
    g.quadraticCurveTo(0, 38, -12, 20);
    g.quadraticCurveTo(-hw * 0.6, 30, -hw * 0.95, 4);
    fillStroke(g, c, 3);
    g.beginPath();
    g.moveTo(-9, 28);
    g.quadraticCurveTo(0, 34, 9, 28);
    g.stroke();
  }
}

function glasses(g, kind, hw) {
  const ex = hw * 0.36;
  g.lineWidth = 3;
  g.strokeStyle = INK;
  for (const sgn of [-1, 1]) {
    g.beginPath();
    if (kind === 'round') g.arc(sgn * ex, -4, 13, 0, TAU);
    else rr(g, sgn * ex - 15, -15, 30, 22, 6);
    if (kind === 'sun') {
      g.fillStyle = 'rgba(25,25,35,.85)';
      g.fill();
    } else {
      g.fillStyle = 'rgba(200,235,255,.25)';
      g.fill();
    }
    g.stroke();
  }
  g.beginPath();
  g.moveTo(-ex + (kind === 'round' ? 13 : 15), -6);
  g.quadraticCurveTo(0, -11, ex - (kind === 'round' ? 13 : 15), -6);
  g.moveTo(-ex - 14, -6);
  g.lineTo(-hw * 0.98, -9);
  g.moveTo(ex + 14, -6);
  g.lineTo(hw * 0.98, -9);
  g.stroke();
}

function hat(g, L, hw, hh) {
  const c = L.hatC;
  g.lineWidth = 3;
  g.strokeStyle = INK;
  if (L.hat === 'cap') {
    g.beginPath();
    g.moveTo(-hw * 1.02, -hh * 0.42);
    g.quadraticCurveTo(-hw * 0.9, -hh * 1.28, 0, -hh * 1.25);
    g.quadraticCurveTo(hw * 0.9, -hh * 1.28, hw * 1.02, -hh * 0.42);
    g.closePath();
    fillStroke(g, c, 3);
    g.beginPath();
    g.moveTo(hw * 0.2, -hh * 0.48);
    g.quadraticCurveTo(hw * 1.2, -hh * 0.62, hw * 1.55, -hh * 0.32);
    g.quadraticCurveTo(hw * 1.1, -hh * 0.28, hw * 0.2, -hh * 0.36);
    g.closePath();
    fillStroke(g, darker(c, 0.15), 3);
    circle(g, 0, -hh * 1.24, 5);
    fillStroke(g, darker(c, 0.2), 2);
  } else if (L.hat === 'beanie') {
    g.beginPath();
    g.moveTo(-hw * 1.02, -hh * 0.38);
    g.quadraticCurveTo(-hw * 0.95, -hh * 1.32, 0, -hh * 1.3);
    g.quadraticCurveTo(hw * 0.95, -hh * 1.32, hw * 1.02, -hh * 0.38);
    g.closePath();
    fillStroke(g, c, 3);
    rr(g, -hw * 1.06, -hh * 0.55, hw * 2.12, 18, 8);
    fillStroke(g, darker(c, 0.15), 3);
    circle(g, 0, -hh * 1.32, 11);
    fillStroke(g, lighter(c, 0.35), 3);
  } else if (L.hat === 'bow') {
    const bx = hw * 0.55, by = -hh * 0.85;
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + sgn * 20, by - 13);
      g.lineTo(bx + sgn * 20, by + 13);
      g.closePath();
      fillStroke(g, c, 3);
    }
    circle(g, bx, by, 6);
    fillStroke(g, darker(c, 0.15), 3);
  } else if (L.hat === 'band') {
    g.beginPath();
    g.ellipse(0, -hh * 0.62, hw * 1.0, 13, 0, Math.PI, TAU);
    g.lineWidth = 9;
    g.strokeStyle = c;
    g.stroke();
  } else if (L.hat === 'beret') {
    ellipse(g, -hw * 0.15, -hh * 0.95, hw * 1.0, 22, -0.18);
    fillStroke(g, c, 3);
    rr(g, -4, -hh * 1.28, 8, 12, 3);
    fillStroke(g, darker(c, 0.2), 2);
  }
}

// ---------------------------------------------------------------- el salón
/**
 * Fondo del salón: pared con su dibujo, ventana, cuadros, piso, puerta y sillas de espera. `th` es el tema del local.
 * Devuelve dónde quedan las cosas para ubicar a los clientes.
 */
export function salon(g, th, x, y, w, h, t, portrait) {
  const floorY = y + h * (portrait ? 0.62 : 0.66);
  // pared
  g.fillStyle = th.wall;
  g.fillRect(x, y, w, floorY - y);
  wallPattern(g, th, x, y, w, floorY - y);
  // friso
  g.fillStyle = th.trim;
  g.fillRect(x, floorY - h * 0.16, w, h * 0.16);
  g.fillStyle = darker(th.trim, 0.18);
  g.fillRect(x, floorY - h * 0.16, w, 7);
  // piso
  floorPattern(g, th, x, floorY, w, y + h - floorY);
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fillRect(x, floorY, w, 6);
  // ventana con cielo
  const ww = Math.min(w * 0.22, 260), wh = h * 0.3;
  const wx = x + w * (portrait ? 0.08 : 0.06), wy = y + h * 0.08;
  rr(g, wx - 10, wy - 10, ww + 20, wh + 20, 14);
  fillStroke(g, th.frame, 3.5);
  const sky = g.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, th.sky || '#8fd3ff');
  sky.addColorStop(1, '#e9f7ff');
  g.fillStyle = sky;
  g.fillRect(wx, wy, ww, wh);
  // nubes que pasan
  g.save();
  g.beginPath();
  g.rect(wx, wy, ww, wh);
  g.clip();
  for (let i = 0; i < 3; i++) {
    const cx = wx + ((t * (6 + i * 3) + i * 140) % (ww + 120)) - 60;
    const cy = wy + wh * (0.25 + i * 0.22);
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (const [dx, dy, r] of [[0, 0, 16], [16, -6, 18], [34, 0, 14]]) {
      circle(g, cx + dx, cy + dy, r);
      g.fill();
    }
  }
  // edificios
  g.fillStyle = th.city || '#b7c6d8';
  for (let i = 0; i < 6; i++) {
    const bw = ww / 5;
    const bh = wh * (0.25 + ((i * 37) % 5) * 0.08);
    g.fillRect(wx + i * bw * 0.9 - 8, wy + wh - bh, bw * 0.8, bh);
  }
  g.restore();
  g.lineWidth = 6;
  g.strokeStyle = th.frame;
  g.beginPath();
  g.moveTo(wx + ww / 2, wy);
  g.lineTo(wx + ww / 2, wy + wh);
  g.moveTo(wx, wy + wh / 2);
  g.lineTo(wx + ww, wy + wh / 2);
  g.stroke();
  rr(g, wx, wy, ww, wh, 4);
  g.lineWidth = 3.5;
  g.strokeStyle = INK;
  g.stroke();
  // cartel del local
  const sx = x + w * (portrait ? 0.5 : 0.47);
  const sy = y + h * 0.13;
  const sw = Math.min(w * 0.32, 420);
  rr(g, sx - sw / 2, sy - 34, sw, 68, 20);
  fillStroke(g, th.sign, 4);
  text(g, th.signText || '', sx, sy + 2, 36, { color: th.signInk || '#fff', max: sw - 30 });
  // puerta
  const dw = Math.min(150, w * 0.13), dh = (floorY - y) * 0.72;
  const dx = x + w - dw - w * 0.04;
  rr(g, dx - 10, floorY - dh - 10, dw + 20, dh + 12, 10);
  fillStroke(g, th.frame, 3.5);
  rr(g, dx, floorY - dh, dw, dh, 6);
  fillStroke(g, th.door || '#a8653b', 3);
  rr(g, dx + 14, floorY - dh + 14, dw - 28, dh * 0.42, 6);
  fillStroke(g, '#cfeeff', 3);
  circle(g, dx + dw - 18, floorY - dh * 0.45, 6);
  fillStroke(g, '#ffd23f', 2.5);
  // campanita
  circle(g, dx + dw / 2, floorY - dh - 4, 8);
  fillStroke(g, '#ffd23f', 2.5);
  return { floorY, door: { x: dx + dw / 2, y: floorY } };
}

function wallPattern(g, th, x, y, w, h) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = th.wall2;
  if (th.pattern === 'stripes') {
    for (let xx = x; xx < x + w; xx += 48) g.fillRect(xx, y, 22, h);
  } else if (th.pattern === 'bricks') {
    g.globalAlpha = 0.5;
    for (let yy = y, row = 0; yy < y + h; yy += 30, row++) {
      for (let xx = x - (row % 2) * 34; xx < x + w; xx += 68) {
        rr(g, xx + 3, yy + 3, 62, 24, 4);
        g.fill();
      }
    }
  } else if (th.pattern === 'dots') {
    for (let yy = y + 20, row = 0; yy < y + h; yy += 44, row++) {
      for (let xx = x + 20 + (row % 2) * 22; xx < x + w; xx += 44) {
        circle(g, xx, yy, 6);
        g.fill();
      }
    }
  } else if (th.pattern === 'diamonds') {
    for (let yy = y, row = 0; yy < y + h + 40; yy += 40, row++) {
      for (let xx = x + (row % 2) * 30; xx < x + w + 40; xx += 60) {
        g.beginPath();
        g.moveTo(xx, yy - 16);
        g.lineTo(xx + 14, yy);
        g.lineTo(xx, yy + 16);
        g.lineTo(xx - 14, yy);
        g.closePath();
        g.fill();
      }
    }
  }
  g.restore();
}

function floorPattern(g, th, x, y, w, h) {
  g.fillStyle = th.floor;
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = th.floor2;
  if (th.floorKind === 'checker') {
    const s = 56;
    for (let yy = y, r = 0; yy < y + h; yy += s * 0.6, r++) for (let xx = x + (r % 2) * s; xx < x + w; xx += s * 2) g.fillRect(xx, yy, s, s * 0.6);
  } else {
    for (let yy = y, r = 0; yy < y + h; yy += 26, r++) {
      g.fillRect(x, yy, w, 3);
      for (let xx = x + ((r * 97) % 180); xx < x + w; xx += 180) g.fillRect(xx, yy, 3, 26);
    }
  }
  g.restore();
}

/** Mostrador con el frente del color del local. */
export function counter(g, th, x, y, w, h) {
  rr(g, x, y + 16, w, h - 16, 10);
  fillStroke(g, th.counter, 3.5);
  // paneles
  const n = Math.max(2, Math.round(w / 220));
  for (let i = 0; i < n; i++) {
    const pw = w / n;
    rr(g, x + i * pw + 14, y + 34, pw - 28, h - 52, 10);
    fillStroke(g, darker(th.counter, 0.1), 2.5, darker(th.counter, 0.35));
  }
  rr(g, x - 12, y, w + 24, 26, 10);
  fillStroke(g, th.counterTop, 3.5);
  g.fillStyle = 'rgba(255,255,255,.3)';
  g.fillRect(x, y + 5, w, 5);
}

/** Silla de espera (vista de frente). */
export function chair(g, th, x, y, s = 1) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  rr(g, -34, -120, 68, 76, 16);
  fillStroke(g, th.chair, 3);
  rr(g, -40, -50, 80, 18, 8);
  fillStroke(g, darker(th.chair, 0.15), 3);
  for (const sgn of [-1, 1]) {
    rr(g, sgn * 28 - 4, -34, 8, 34, 3);
    fillStroke(g, '#4a3a33', 2.5);
  }
  g.restore();
}

/** Planta en maceta. */
export function plant(g, x, y, s = 1, t = 0) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.42 + Math.sin(t * 0.8 + i) * 0.04;
    g.save();
    g.rotate(a + Math.PI / 2);
    ellipse(g, 0, -62, 14, 40);
    fillStroke(g, i % 2 ? '#4cae4f' : '#3b9a44', 3);
    g.restore();
  }
  g.beginPath();
  g.moveTo(-30, -44);
  g.lineTo(30, -44);
  g.lineTo(22, 0);
  g.lineTo(-22, 0);
  g.closePath();
  fillStroke(g, '#d9773f', 3);
  rr(g, -34, -52, 68, 14, 6);
  fillStroke(g, '#c4632f', 3);
  g.restore();
}

/** Pequeño ruido determinista para texturas (granitos, manchas). */
export function speckles(seed, n) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, r: r(), a: r() * TAU }));
}

export { clamp };
