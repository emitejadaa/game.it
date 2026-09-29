/* Batalla Naval — dibujo en canvas: la mesa de mando, los dos mares, los barcos (dibujados a mano, vistos
 * desde arriba), las marcas y los efectos (disparos, piques, explosiones, sonar y torpedos).
 * Todo lo que se anima vive en coordenadas de celda de cada mar, así sigue a los tableros cuando cambian
 * de tamaño o de lugar. */
import { celdasDe } from './shared/rules.js';

let cv = null;
let c = null;
let W = 0;
let H = 0;
let DPR = 1;
let fondo = null;
let olas = null;
let reducido = false;

const COL = {
  ambar: '#ffb547',
  ambarSuave: 'rgba(255,181,71,.28)',
  cian: '#5fe1ff',
  verde: '#62f2a3',
  rojo: '#ff5a36',
  texto: '#e8f4f8',
  tenue: '#86a7b5',
};

const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// ruido estable por celda (llamas y humo distintos en cada una)
const hash = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function iniciar(canvas) {
  cv = canvas;
  c = cv.getContext('2d');
  redimensionar();
}
export function movimientoReducido(v) {
  reducido = !!v;
}
export function redimensionar() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  fondo = null;
}
export const tamano = () => ({ W, H });

// ------------------------------------------------------------------ texturas
function crearOlas() {
  const t = document.createElement('canvas');
  const n = 180;
  t.width = t.height = n;
  const g = t.getContext('2d');
  g.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    const x = Math.random() * n;
    const y = Math.random() * n;
    const w = rnd(14, 34);
    g.strokeStyle = `rgba(170,235,255,${rnd(0.05, 0.13).toFixed(3)})`;
    g.lineWidth = rnd(0.8, 1.6);
    for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
      g.beginPath();
      g.moveTo(x + ox - w / 2, y + oy);
      g.quadraticCurveTo(x + ox - w / 4, y + oy - 3, x + ox, y + oy);
      g.quadraticCurveTo(x + ox + w / 4, y + oy + 3, x + ox + w / 2, y + oy);
      g.stroke();
    }
  }
  return c.createPattern(t, 'repeat');
}
function crearFondo() {
  const t = document.createElement('canvas');
  t.width = Math.round(W * DPR);
  t.height = Math.round(H * DPR);
  const g = t.getContext('2d');
  g.scale(DPR, DPR);
  const gr = g.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.5, Math.max(W, H) * 0.8);
  gr.addColorStop(0, '#0b2a3d');
  gr.addColorStop(0.55, '#061a27');
  gr.addColorStop(1, '#020b12');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // cuadrícula de la mesa de mando
  g.strokeStyle = 'rgba(95,225,255,.045)';
  g.lineWidth = 1;
  for (let x = (W / 2) % 40; x < W; x += 40) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, H);
    g.stroke();
  }
  for (let y = (H / 2) % 40; y < H; y += 40) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(W, y + 0.5);
    g.stroke();
  }
  // rosa de los vientos tenue
  g.save();
  g.translate(W * 0.5, H * 0.55);
  g.globalAlpha = 0.05;
  g.strokeStyle = '#9fe9ff';
  g.lineWidth = 1.2;
  const R = Math.min(W, H) * 0.42;
  for (const r of [R, R * 0.72, R * 0.4]) {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const l = k % 4 === 0 ? R * 1.08 : k % 2 === 0 ? R * 0.8 : R * 0.6;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * l, Math.sin(a) * l);
    g.stroke();
  }
  g.restore();
  return t;
}

// ------------------------------------------------------------------ disposición
/**
 * Calcula dónde va cada mar. `ins` = { top, bottom } libres para la interfaz.
 * En vertical el mar que recibe el tiro es el grande (foco 0: el rival; 1: el mío).
 */
export function disponer(E, ins, foco) {
  const lab = 26;
  const side = W < 500 ? 10 : 18;
  const aw = W - side * 2;
  const ah = H - ins.top - ins.bottom;
  const tab = (x, y, s) => {
    const p = s >= 300 ? Math.round(s * 0.05) : s >= 200 ? Math.round(s * 0.045) : 5;
    return { x, y, s, p, cs: (s - 2 * p) / E.N, ox: x + p, oy: y + p, etiquetas: p >= 11 };
  };
  if (E.fase === 'colocar') {
    const s = Math.floor(Math.min(aw, ah - lab - 8, 620));
    return { mio: tab((W - s) / 2, ins.top + lab + Math.max(0, (ah - lab - s) / 2), s), rival: null, vertical: true };
  }
  const land = aw > ah * 1.12;
  if (land) {
    const gap = clamp(aw * 0.045, 14, 60);
    const s = Math.floor(Math.min((aw - gap) / 2, ah - lab - 6, 600));
    const x0 = (W - 2 * s - gap) / 2;
    const y = ins.top + lab + Math.max(0, (ah - lab - s) / 2);
    return { mio: tab(x0, y, s), rival: tab(x0 + s + gap, y, s), vertical: false };
  }
  const gap = 8;
  const avail = ah - 2 * lab - gap;
  let big = Math.min(aw, avail * 0.66, 620);
  let small = Math.min(aw * 0.62, avail - big);
  if (small < 96) {
    small = Math.min(96, avail * 0.3);
    big = Math.min(aw, avail - small);
  }
  const sr = Math.floor(lerp(big, small, foco));
  const sm = Math.floor(lerp(small, big, foco));
  const total = sr + sm + 2 * lab + gap;
  const y0 = ins.top + Math.max(0, (ah - total) / 2) + lab;
  return { rival: tab((W - sr) / 2, y0, sr), mio: tab((W - sm) / 2, y0 + sr + gap + lab, sm), vertical: true };
}

/** Celda bajo un punto de la pantalla (o null). */
export function celdaEn(t, px, py) {
  if (!t) return null;
  const x = Math.floor((px - t.ox) / t.cs);
  const y = Math.floor((py - t.oy) / t.cs);
  if (x < 0 || y < 0 || x >= Math.round((t.s - 2 * t.p) / t.cs) || y >= Math.round((t.s - 2 * t.p) / t.cs)) return null;
  return { x, y, fx: (px - t.ox) / t.cs, fy: (py - t.oy) / t.cs };
}

// ------------------------------------------------------------------ barcos
const ANCHO = { porta: 0.4, acor: 0.36, frag: 0.33, cruc: 0.34, sub: 0.25, dest: 0.3, lancha: 0.27 };
const PALETAS = {
  propio: { casco: ['#c3d2dc', '#7890a0'], borde: '#34495a', cubierta: '#9fb3c1', det: '#e5edf2', det2: '#5f7686', torre: '#8ea3b2' },
  sub: { casco: ['#51687a', '#27363f'], borde: '#15212a', cubierta: '#3b4f5d', det: '#8aa0ae', det2: '#1c2a33', torre: '#44596a' },
  hundido: { casco: ['#4a4744', '#242221'], borde: '#141312', cubierta: '#393634', det: '#5c5552', det2: '#2a2725', torre: '#433f3c' },
};

function casco(L, Wd, tipo) {
  const hw = Wd * ANCHO[tipo];
  const cy = Wd / 2;
  const x0 = Wd * 0.1;
  const x1 = L - Wd * 0.05;
  const proa = Math.min(Wd * 1.15, L * 0.32);
  c.beginPath();
  if (tipo === 'sub') {
    c.moveTo(x0 + hw, cy - hw);
    c.lineTo(x1 - proa * 0.6, cy - hw);
    c.quadraticCurveTo(x1, cy - hw, x1, cy);
    c.quadraticCurveTo(x1, cy + hw, x1 - proa * 0.6, cy + hw);
    c.lineTo(x0 + hw, cy + hw);
    c.arc(x0 + hw, cy, hw, Math.PI / 2, Math.PI * 1.5);
  } else {
    const r = hw * 0.55;
    c.moveTo(x0 + r, cy - hw);
    c.lineTo(x1 - proa, cy - hw);
    c.quadraticCurveTo(x1 - proa * 0.2, cy - hw * 0.92, x1, cy);
    c.quadraticCurveTo(x1 - proa * 0.2, cy + hw * 0.92, x1 - proa, cy + hw);
    c.lineTo(x0 + r, cy + hw);
    c.quadraticCurveTo(x0, cy + hw, x0, cy + hw - r);
    c.lineTo(x0, cy - hw + r);
    c.quadraticCurveTo(x0, cy - hw, x0 + r, cy - hw);
  }
  c.closePath();
}
function rrect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  if (c.roundRect) return c.roundRect(x, y, w, h, r);
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function torreta(x, cy, r, dir, pal) {
  c.strokeStyle = pal.det2;
  c.lineWidth = Math.max(1, r * 0.34);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, cy - r * 0.32);
  c.lineTo(x + dir * r * 1.9, cy - r * 0.32);
  c.moveTo(x, cy + r * 0.32);
  c.lineTo(x + dir * r * 1.9, cy + r * 0.32);
  c.stroke();
  c.fillStyle = pal.torre;
  c.beginPath();
  c.arc(x, cy, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = pal.borde;
  c.lineWidth = Math.max(0.8, r * 0.18);
  c.stroke();
  c.fillStyle = pal.det;
  c.beginPath();
  c.arc(x - r * 0.2, cy - r * 0.2, r * 0.32, 0, Math.PI * 2);
  c.fill();
}

/** Dibuja un barco en celdas (x, y) de un mar. estilo: propio | hundido | revelado | fantasma */
export function barco(t, b, estilo, tinte) {
  const cs = t.cs;
  const L = b.len * cs;
  const Wd = cs;
  const tipo = b.id;
  const pal = estilo === 'hundido' ? PALETAS.hundido : tipo === 'sub' ? PALETAS.sub : PALETAS.propio;
  c.save();
  c.translate(t.ox + b.x * cs, t.oy + b.y * cs);
  if (b.v) {
    c.translate(cs, 0);
    c.rotate(Math.PI / 2);
  }
  if (estilo === 'revelado') c.globalAlpha = 0.55;
  if (estilo === 'fantasma') c.globalAlpha = 0.88;
  const cy = Wd / 2;
  const hw = Wd * ANCHO[tipo];
  // espuma alrededor
  if (estilo !== 'hundido') {
    casco(L, Wd, tipo);
    c.strokeStyle = 'rgba(210,245,255,.16)';
    c.lineWidth = Math.max(2, cs * 0.12);
    c.stroke();
  }
  casco(L, Wd, tipo);
  const g = c.createLinearGradient(0, cy - hw, 0, cy + hw);
  g.addColorStop(0, pal.casco[0]);
  g.addColorStop(1, pal.casco[1]);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = pal.borde;
  c.lineWidth = Math.max(1, cs * 0.05);
  c.stroke();
  c.save();
  casco(L, Wd, tipo);
  c.clip();
  const u = (f) => L * f;
  if (tipo === 'porta') {
    c.fillStyle = estilo === 'hundido' ? '#2f2d2b' : '#5b6873';
    c.fillRect(u(0.04), cy - hw * 0.86, u(0.84), hw * 1.72);
    c.strokeStyle = 'rgba(240,248,255,.75)';
    c.setLineDash([cs * 0.18, cs * 0.14]);
    c.lineWidth = Math.max(1, cs * 0.04);
    c.beginPath();
    c.moveTo(u(0.08), cy + hw * 0.1);
    c.lineTo(u(0.84), cy + hw * 0.1);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = 'rgba(255,214,110,.6)';
    c.beginPath();
    c.moveTo(u(0.1), cy + hw * 0.6);
    c.lineTo(u(0.5), cy - hw * 0.5);
    c.stroke();
    // avioncitos
    c.fillStyle = pal.det;
    for (const f of [0.22, 0.34]) {
      const x = u(f);
      const yy = cy + hw * 0.42;
      c.beginPath();
      c.moveTo(x + cs * 0.16, yy);
      c.lineTo(x - cs * 0.12, yy - cs * 0.03);
      c.lineTo(x - cs * 0.12, yy + cs * 0.03);
      c.closePath();
      c.fill();
      c.fillRect(x - cs * 0.02, yy - cs * 0.13, cs * 0.06, cs * 0.26);
    }
    // isla
    c.fillStyle = pal.det;
    rrect(u(0.6), cy - hw * 0.98, u(0.14), hw * 0.62, cs * 0.05);
    c.fill();
    c.fillStyle = pal.det2;
    c.fillRect(u(0.64), cy - hw * 0.9, u(0.04), hw * 0.4);
  } else if (tipo === 'sub') {
    c.fillStyle = pal.det2;
    for (let k = 1; k < b.len * 3; k++) c.fillRect(u(k / (b.len * 3)) - cs * 0.015, cy - hw * 0.15, cs * 0.03, hw * 0.3);
    c.restore();
    c.save();
    c.fillStyle = pal.torre;
    rrect(u(0.5), cy - hw * 0.62, u(0.16), hw * 1.24, hw * 0.6);
    c.fill();
    c.strokeStyle = pal.borde;
    c.lineWidth = Math.max(1, cs * 0.04);
    c.stroke();
    c.fillStyle = pal.det;
    c.fillRect(u(0.55), cy - cs * 0.02, u(0.07), cs * 0.04);
  } else {
    // línea de crujía
    c.strokeStyle = 'rgba(255,255,255,.12)';
    c.lineWidth = Math.max(1, cs * 0.03);
    c.beginPath();
    c.moveTo(u(0.06), cy);
    c.lineTo(u(0.86), cy);
    c.stroke();
    const r = cs * (tipo === 'acor' ? 0.2 : tipo === 'lancha' ? 0.12 : 0.16);
    const sup = { acor: [0.34, 0.24], frag: [0.36, 0.24], cruc: [0.36, 0.24], dest: [0.4, 0.2], lancha: [0.3, 0.32] }[tipo];
    c.fillStyle = pal.det;
    rrect(u(sup[0]), cy - hw * 0.62, u(sup[1]), hw * 1.24, cs * 0.08);
    c.fill();
    c.strokeStyle = pal.det2;
    c.lineWidth = Math.max(0.8, cs * 0.03);
    c.stroke();
    if (tipo !== 'lancha') {
      c.fillStyle = pal.det2;
      c.beginPath();
      c.arc(u(sup[0] + sup[1] * 0.62), cy, cs * 0.1, 0, Math.PI * 2);
      c.fill();
    }
    if (tipo === 'acor') {
      torreta(u(0.17), cy, r, -1, pal);
      torreta(u(0.66), cy, r, 1, pal);
      torreta(u(0.8), cy, r * 0.9, 1, pal);
    } else if (tipo === 'cruc') {
      torreta(u(0.2), cy, r, -1, pal);
      torreta(u(0.74), cy, r, 1, pal);
    } else if (tipo === 'frag') {
      c.strokeStyle = pal.det;
      c.lineWidth = Math.max(1, cs * 0.035);
      c.beginPath();
      c.arc(u(0.17), cy, hw * 0.7, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = pal.det;
      c.font = `900 ${Math.max(6, hw * 0.9)}px Inter, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('H', u(0.17), cy + 0.5);
      torreta(u(0.76), cy, r, 1, pal);
    } else if (tipo === 'dest') torreta(u(0.72), cy, r, 1, pal);
    else if (tipo === 'lancha') torreta(u(0.76), cy, r, 1, pal);
  }
  c.restore();
  if (estilo === 'hundido') {
    // chamuscado
    for (let k = 0; k < b.len; k++) {
      const h = hash(b.x * 13 + b.y * 7 + k);
      c.fillStyle = `rgba(20,10,6,${0.35 + h * 0.3})`;
      c.beginPath();
      c.ellipse(cs * (k + 0.3 + h * 0.4), cy + (h - 0.5) * hw, cs * 0.2, hw * 0.5, h * 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (estilo === 'revelado') {
    casco(L, Wd, tipo);
    c.setLineDash([cs * 0.12, cs * 0.1]);
    c.strokeStyle = COL.cian;
    c.lineWidth = Math.max(1, cs * 0.05);
    c.stroke();
    c.setLineDash([]);
  }
  if (tinte) {
    casco(L, Wd, tipo);
    c.fillStyle = tinte;
    c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ marcas
function fuego(x, y, cs, i, t, fuerza) {
  const h = hash(i);
  const fl = 0.75 + 0.25 * Math.sin(t * (9 + h * 5) + h * 10);
  // brasa
  const g = c.createRadialGradient(x, y, 0, x, y, cs * 0.55 * fuerza);
  g.addColorStop(0, `rgba(255,190,90,${0.55 * fl * fuerza})`);
  g.addColorStop(1, 'rgba(255,80,20,0)');
  c.fillStyle = g;
  c.fillRect(x - cs * 0.6, y - cs * 0.6, cs * 1.2, cs * 1.2);
  if (fuerza > 0.4)
    for (let k = 0; k < 3; k++) {
      const ph = t * (7 + k * 2.3 + h * 3) + k * 2 + h * 6;
      const fx = x + (k - 1) * cs * 0.13 + Math.sin(ph) * cs * 0.03;
      const hh = cs * (0.22 + 0.1 * Math.sin(ph * 1.3)) * fuerza;
      c.fillStyle = k === 1 ? '#ffe39a' : '#ff7a2e';
      c.beginPath();
      c.moveTo(fx - cs * 0.07, y + cs * 0.05);
      c.quadraticCurveTo(fx - cs * 0.05, y - hh * 0.6, fx + Math.sin(ph) * cs * 0.05, y - hh);
      c.quadraticCurveTo(fx + cs * 0.05, y - hh * 0.6, fx + cs * 0.07, y + cs * 0.05);
      c.closePath();
      c.fill();
    }
  if (reducido) return;
  // humo
  for (let k = 0; k < 2; k++) {
    const per = 2.2 + h;
    const u = ((t + k * per * 0.5 + h * 3) % per) / per;
    const r = cs * (0.12 + u * 0.3);
    c.fillStyle = `rgba(40,44,48,${0.34 * (1 - u) * (0.6 + fuerza * 0.4)})`;
    c.beginPath();
    c.arc(x + Math.sin(u * 4 + h * 9) * cs * 0.15 + u * cs * 0.2, y - cs * 0.15 - u * cs * 0.9, r, 0, Math.PI * 2);
    c.fill();
  }
}

function marcas(t, m, esRival, oc, t0, hundidas) {
  const N = Math.round((t.s - 2 * t.p) / t.cs);
  const cs = t.cs;
  for (let i = 0; i < N * N; i++) {
    const ch = m[i];
    if (ch === '.') continue;
    const x = t.ox + ((i % N) + 0.5) * cs;
    const y = t.oy + (((i / N) | 0) + 0.5) * cs;
    if (ch === 'a') {
      c.strokeStyle = 'rgba(220,245,255,.28)';
      c.lineWidth = Math.max(1, cs * 0.04);
      c.beginPath();
      c.arc(x, y, cs * 0.3, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#eef9ff';
      c.beginPath();
      c.arc(x, y, Math.max(2, cs * 0.12), 0, Math.PI * 2);
      c.fill();
    } else if (ch === 'x') {
      c.fillStyle = 'rgba(200,235,250,.32)';
      c.beginPath();
      c.arc(x, y, Math.max(1.3, cs * 0.06), 0, Math.PI * 2);
      c.fill();
    } else if (ch === 'c') {
      const pul = 0.5 + 0.5 * Math.sin(t0 * 5 + i);
      c.strokeStyle = `rgba(98,242,163,${0.55 + pul * 0.4})`;
      c.lineWidth = Math.max(1.2, cs * 0.06);
      c.beginPath();
      c.arc(x, y, cs * (0.24 + pul * 0.08), 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = COL.verde;
      c.beginPath();
      c.arc(x, y, Math.max(1.5, cs * 0.08), 0, Math.PI * 2);
      c.fill();
    } else if (ch === 't') {
      const hund = hundidas.has(i);
      if (esRival && !hund) {
        c.fillStyle = 'rgba(255,90,54,.22)';
        c.fillRect(x - cs / 2 + 1, y - cs / 2 + 1, cs - 2, cs - 2);
      }
      fuego(x, y, cs, i, t0, hund ? 0.35 : 1);
      if (esRival || !oc) {
        c.fillStyle = hund ? '#8a2b1a' : COL.rojo;
        c.beginPath();
        c.arc(x, y, Math.max(2, cs * 0.13), 0, Math.PI * 2);
        c.fill();
      }
    }
  }
}

function esquinas(x, y, s, color, grosor) {
  const l = s * 0.28;
  c.strokeStyle = color;
  c.lineWidth = grosor;
  c.lineCap = 'round';
  c.beginPath();
  for (const [ax, ay, dx, dy] of [[x, y, 1, 1], [x + s, y, -1, 1], [x, y + s, 1, -1], [x + s, y + s, -1, -1]]) {
    c.moveTo(ax + dx * l, ay);
    c.lineTo(ax, ay);
    c.lineTo(ax, ay + dy * l);
  }
  c.stroke();
}

function flotaMini(x, y, lista, alinear) {
  // siluetas chiquitas del estado de la flota; alinear = 'der' | 'izq'
  const u = 5;
  const total = lista.reduce((s, b) => s + b.len * u + 5, -5);
  let px = alinear === 'der' ? x - total : x;
  for (const b of lista) {
    const w = b.len * u;
    c.fillStyle = b.hundido ? 'rgba(255,90,54,.85)' : 'rgba(200,225,238,.75)';
    rrect(px, y - 3, w, 6, 3);
    c.fill();
    if (b.hundido) {
      c.strokeStyle = '#1a0a06';
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(px + 1, y - 3);
      c.lineTo(px + w - 1, y + 3);
      c.stroke();
    }
    px += w + 5;
  }
}

function tablero(t, E, lado, t0) {
  const esRival = lado === 'rival';
  const D = E[lado];
  const N = E.N;
  const activo = E.fase === 'batalla' && (esRival ? E.turnoMio : !E.turnoMio);
  // etiqueta
  c.font = `800 ${t.s < 200 ? 11 : 12.5}px Inter, system-ui, sans-serif`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = activo ? (esRival ? COL.ambar : '#ff8a70') : COL.tenue;
  const tit = D.titulo.toUpperCase();
  c.fillText(tit, t.x + 2, t.y - 12);
  if (D.flota && t.s >= 150) flotaMini(t.x + t.s - 2, t.y - 12, D.flota, 'der');
  // marco
  c.save();
  if (activo) {
    c.shadowColor = esRival ? 'rgba(255,181,71,.55)' : 'rgba(255,90,54,.5)';
    c.shadowBlur = 22;
  }
  c.fillStyle = '#081d2b';
  rrect(t.x, t.y, t.s, t.s, 12);
  c.fill();
  c.restore();
  c.strokeStyle = activo ? (esRival ? COL.ambar : '#ff7050') : 'rgba(120,210,240,.28)';
  c.lineWidth = activo ? 2 : 1.2;
  rrect(t.x + 0.5, t.y + 0.5, t.s - 1, t.s - 1, 12);
  c.stroke();
  // coordenadas
  if (t.etiquetas) {
    c.fillStyle = 'rgba(160,215,235,.55)';
    c.font = `700 ${Math.round(t.p * 0.62)}px Inter, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = 0; k < N; k++) {
      c.fillText(String.fromCharCode(65 + k), t.ox + (k + 0.5) * t.cs, t.y + t.p / 2 + 0.5);
      c.fillText(String(k + 1), t.x + t.p / 2, t.oy + (k + 0.5) * t.cs + 0.5);
    }
  }
  // agua
  const aw = t.cs * N;
  c.save();
  c.beginPath();
  c.rect(t.ox, t.oy, aw, aw);
  c.clip();
  const g = c.createLinearGradient(t.ox, t.oy, t.ox + aw, t.oy + aw);
  g.addColorStop(0, esRival ? '#0c3b52' : '#0f4262');
  g.addColorStop(1, esRival ? '#072636' : '#082c45');
  c.fillStyle = g;
  c.fillRect(t.ox, t.oy, aw, aw);
  olas ||= crearOlas();
  const off = reducido ? 0 : t0 * 9;
  c.save();
  c.translate(t.ox + (off % 180) - 180, t.oy + ((off * 0.35) % 180) - 180);
  c.fillStyle = olas;
  c.fillRect(0, 0, aw + 360, aw + 360);
  c.restore();
  // niebla sobre lo que no se sabe del rival
  if (esRival) {
    c.fillStyle = 'rgba(2,12,20,.42)';
    for (let i = 0; i < N * N; i++) if (D.marcas[i] === '.' || D.marcas[i] === 'c') c.fillRect(t.ox + (i % N) * t.cs, t.oy + ((i / N) | 0) * t.cs, t.cs + 0.5, t.cs + 0.5);
    // barrido de radar cuando te toca
    if (activo && !reducido) {
      const a = (t0 * 1.3) % (Math.PI * 2);
      const cx = t.ox + aw / 2;
      const cy = t.oy + aw / 2;
      const R = aw * 0.75;
      const gg = c.createConicGradient ? c.createConicGradient(a - 0.6, cx, cy) : null;
      if (gg) {
        gg.addColorStop(0, 'rgba(95,225,255,0)');
        gg.addColorStop(0.09, 'rgba(95,225,255,.10)');
        gg.addColorStop(0.1, 'rgba(95,225,255,0)');
        gg.addColorStop(1, 'rgba(95,225,255,0)');
        c.fillStyle = gg;
        c.beginPath();
        c.arc(cx, cy, R, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  // grilla
  c.strokeStyle = 'rgba(150,225,255,.16)';
  c.lineWidth = 1;
  c.beginPath();
  for (let k = 1; k < N; k++) {
    const v = Math.round(t.ox + k * t.cs) + 0.5;
    const h = Math.round(t.oy + k * t.cs) + 0.5;
    c.moveTo(v, t.oy);
    c.lineTo(v, t.oy + aw);
    c.moveTo(t.ox, h);
    c.lineTo(t.ox + aw, h);
  }
  c.stroke();
  // barcos
  const hundidas = new Set();
  for (const b of D.hundidos) for (const i of celdasDe(b, b.len, N)) hundidas.add(i);
  if (!esRival && D.barcos)
    D.barcos.forEach((b, k) => {
      if (E.arrastre && E.arrastre.k === k) return;
      const hund = D.hundidos.some((h) => h.x === b.x && h.y === b.y && h.v === b.v && h.len === b.len);
      barco(t, b, hund ? 'hundido' : 'propio', E.sel === k && E.fase === 'colocar' ? 'rgba(255,181,71,.25)' : null);
    });
  if (esRival) {
    for (const b of D.hundidos) barco(t, b, 'hundido');
    if (D.revelados) for (const b of D.revelados) if (!D.hundidos.some((h) => h.x === b.x && h.y === b.y && h.len === b.len)) barco(t, b, 'revelado');
  }
  marcas(t, D.marcas, esRival, !esRival && D.barcos, t0, hundidas);
  // colocación: el barco que se arrastra
  if (!esRival && E.arrastre) {
    const a = E.arrastre;
    if (a.fantasma) barco(t, a.fantasma, 'fantasma', a.ok ? 'rgba(98,242,163,.28)' : 'rgba(255,90,54,.4)');
  }
  // apuntar
  if (esRival && E.apunte && activo) apuntar(t, E, N);
  c.restore();
}

function apuntar(t, E, N) {
  const A = E.apunte;
  const cs = t.cs;
  const X = (x) => t.ox + x * cs;
  const Y = (y) => t.oy + y * cs;
  const tinte = (x, y, col) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    c.fillStyle = col;
    c.fillRect(X(x) + 1, Y(y) + 1, cs - 2, cs - 2);
  };
  if (E.salva)
    E.salva.forEach((i, n) => {
      const x = i % N;
      const y = (i / N) | 0;
      tinte(x, y, 'rgba(255,181,71,.3)');
      esquinas(X(x) + 2, Y(y) + 2, cs - 4, COL.ambar, Math.max(1.5, cs * 0.07));
      c.fillStyle = COL.ambar;
      c.font = `900 ${Math.max(9, cs * 0.38)}px Inter, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(n + 1), X(x) + cs / 2, Y(y) + cs / 2 + 1);
    });
  if (!A) return;
  const k = E.arma;
  if (k === 'bomba') for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) tinte(A.x + dx, A.y + dy, 'rgba(255,120,60,.32)');
  else if (k === 'sonar') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tinte(A.x + dx, A.y + dy, 'rgba(98,242,163,.2)');
    c.strokeStyle = 'rgba(98,242,163,.8)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(X(A.x + 0.5), Y(A.y + 0.5), cs * 1.45, 0, Math.PI * 2);
    c.stroke();
  } else if (k === 'torpedo') {
    for (let s = 0; s < N; s++) (E.torpV ? tinte(A.x, s, 'rgba(255,181,71,.2)') : tinte(s, A.y, 'rgba(255,181,71,.2)'));
    // flecha desde el borde
    const ax = E.torpV ? X(A.x + 0.5) : X(0);
    const ay = E.torpV ? Y(0) : Y(A.y + 0.5);
    c.fillStyle = COL.ambar;
    c.save();
    c.translate(ax, ay);
    if (E.torpV) c.rotate(Math.PI / 2);
    c.beginPath();
    c.moveTo(cs * 0.5, 0);
    c.lineTo(cs * 0.1, -cs * 0.22);
    c.lineTo(cs * 0.1, cs * 0.22);
    c.closePath();
    c.fill();
    c.restore();
  }
  const ok = E.apunteOk !== false;
  esquinas(X(A.x) + 2, Y(A.y) + 2, cs - 4, ok ? COL.ambar : COL.rojo, Math.max(1.8, cs * 0.08));
  if (ok && k === 'tiro') {
    c.strokeStyle = 'rgba(255,181,71,.7)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(X(A.x + 0.5), Y(A.y + 0.28));
    c.lineTo(X(A.x + 0.5), Y(A.y + 0.72));
    c.moveTo(X(A.x + 0.28), Y(A.y + 0.5));
    c.lineTo(X(A.x + 0.72), Y(A.y + 0.5));
    c.stroke();
  }
}

// ------------------------------------------------------------------ efectos
export const FX = {
  proyectiles: [],
  particulas: [],
  anillos: [],
  textos: [],
  torpedos: [],
  flashes: [],
  shake: 0,
  R: null,
  reset() {
    this.proyectiles = [];
    this.particulas = [];
    this.anillos = [];
    this.textos = [];
    this.torpedos = [];
    this.flashes = [];
    this.shake = 0;
  },
  /** Disparo con arco desde el centro de un mar a una celda del otro. */
  proyectil(desde, hacia, cx, cy, dur, grande, alLlegar) {
    this.proyectiles.push({ desde, hacia, cx, cy, dur: reducido ? dur * 0.6 : dur, u: 0, grande, alLlegar });
  },
  piques(b, cx, cy) {
    this.anillos.push({ b, x: cx, y: cy, r0: 0.1, r1: 0.75, vida: 0.7, max: 0.7, color: '220,245,255' });
    this.anillos.push({ b, x: cx, y: cy, r0: 0.05, r1: 0.5, vida: 0.5, max: 0.5, color: '220,245,255' });
    if (reducido) return;
    for (let k = 0; k < 14; k++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(0.6, 1.8);
      this.particulas.push({ b, x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 0, vz: rnd(1.5, 3), vida: 0.6, max: 0.6, tipo: 'gota', r: rnd(0.03, 0.07) });
    }
  },
  explosion(b, cx, cy, fuerte) {
    this.flashes.push({ b, x: cx, y: cy, vida: 0.35, max: 0.35, r: fuerte ? 1.8 : 1.1 });
    this.anillos.push({ b, x: cx, y: cy, r0: 0.2, r1: fuerte ? 2 : 1.1, vida: 0.45, max: 0.45, color: '255,170,80' });
    if (!reducido) this.shake = Math.max(this.shake, fuerte ? 10 : 5);
    const n = reducido ? 6 : fuerte ? 34 : 18;
    for (let k = 0; k < n; k++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(0.8, fuerte ? 4 : 2.6);
      this.particulas.push({ b, x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 0, vz: 0, vida: rnd(0.35, 0.7), max: 0.7, tipo: 'chispa', r: rnd(0.03, 0.08) });
    }
    for (let k = 0; k < (fuerte ? 8 : 4); k++) this.particulas.push({ b, x: cx + rnd(-0.3, 0.3), y: cy + rnd(-0.3, 0.3), vx: rnd(-0.3, 0.3), vy: rnd(-0.9, -0.3), z: 0, vz: 0, vida: rnd(0.8, 1.4), max: 1.4, tipo: 'humo', r: rnd(0.25, 0.45) });
  },
  sonar(b, cx, cy) {
    for (let k = 0; k < 3; k++) this.anillos.push({ b, x: cx, y: cy, r0: 0.1, r1: 2.2, vida: 0.9, max: 0.9, retraso: k * 0.22, color: '98,242,163', grueso: 2 });
  },
  torpedo(b, v, k, largoN, finS, dur, alPasar, alFinal) {
    this.torpedos.push({ b, v, k, largoN, finS, u: 0, dur: reducido ? dur * 0.6 : dur, pasados: -1, alPasar, alFinal });
  },
  texto(b, cx, cy, txt, color) {
    this.textos.push({ b, x: cx, y: cy, txt, color, vida: 1.1, max: 1.1 });
  },
};

function aPantalla(R, b, x, y) {
  const t = R[b];
  if (!t) return null;
  return [t.ox + x * t.cs, t.oy + y * t.cs, t.cs];
}

function efectos(R, dt) {
  // proyectiles
  for (const p of FX.proyectiles) {
    p.u += dt / p.dur;
    const tD = R[p.desde];
    const a = tD ? [tD.x + tD.s / 2, tD.y + tD.s / 2] : [W / 2, H];
    const bP = aPantalla(R, p.hacia, p.cx + 0.5, p.cy + 0.5);
    if (!bP) continue;
    const u = Math.min(1, p.u);
    const dist = Math.hypot(bP[0] - a[0], bP[1] - a[1]);
    const alto = Math.min(220, dist * 0.45 + 40);
    const pos = (q) => [lerp(a[0], bP[0], q), lerp(a[1], bP[1], q) - alto * 4 * q * (1 - q)];
    const esc = 1 + 0.9 * Math.sin(Math.PI * u);
    // estela que se desvanece
    c.lineCap = 'round';
    const pasos = 6;
    for (let k = 0; k < pasos; k++) {
      const q0 = Math.max(0, u - 0.1 + (k * 0.1) / pasos);
      const q1 = Math.max(0, u - 0.1 + ((k + 1) * 0.1) / pasos);
      const [x0, y0] = pos(q0);
      const [x1, y1] = pos(q1);
      c.strokeStyle = `rgba(255,220,160,${(0.45 * (k + 1)) / pasos})`;
      c.lineWidth = (1 + (1.6 * (k + 1)) / pasos) * esc;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    const [x, y] = pos(u);
    // sombra en el agua
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.beginPath();
    c.ellipse(lerp(a[0], bP[0], u), lerp(a[1], bP[1], u), 4 * esc, 2 * esc, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = p.grande ? '#2a2f35' : '#fff1c8';
    c.beginPath();
    c.arc(x, y, (p.grande ? 5.5 : 3.2) * esc, 0, Math.PI * 2);
    c.fill();
    if (p.grande) {
      c.strokeStyle = '#ffb547';
      c.lineWidth = 1.5;
      c.stroke();
    }
    if (p.u >= 1 && !p.hecho) {
      p.hecho = true;
      p.alLlegar?.();
    }
  }
  FX.proyectiles = FX.proyectiles.filter((p) => !p.hecho);
  // torpedos
  for (const tp of FX.torpedos) {
    tp.u += dt / tp.dur;
    const s = Math.min(tp.finS + 0.5, tp.u * tp.largoN);
    const cel = Math.floor(s);
    while (tp.pasados < Math.min(cel, tp.finS) - 0) {
      tp.pasados++;
      if (tp.pasados < tp.finS) tp.alPasar?.(tp.pasados);
    }
    const t = R[tp.b];
    if (t) {
      const cs = t.cs;
      const x0 = tp.v ? t.ox + (tp.k + 0.5) * cs : t.ox;
      const y0 = tp.v ? t.oy : t.oy + (tp.k + 0.5) * cs;
      const x1 = tp.v ? x0 : t.ox + s * cs;
      const y1 = tp.v ? t.oy + s * cs : y0;
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(220,245,255,0)');
      g.addColorStop(1, 'rgba(220,245,255,.75)');
      c.strokeStyle = g;
      c.lineWidth = Math.max(2, cs * 0.14);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.fillStyle = '#1b2228';
      c.beginPath();
      c.ellipse(x1, y1, tp.v ? cs * 0.08 : cs * 0.2, tp.v ? cs * 0.2 : cs * 0.08, 0, 0, Math.PI * 2);
      c.fill();
      if (!reducido && Math.random() < 0.6) FX.particulas.push({ b: tp.b, x: (x1 - t.ox) / cs + rnd(-0.1, 0.1), y: (y1 - t.oy) / cs + rnd(-0.1, 0.1), vx: 0, vy: 0, z: 0, vz: 0, vida: 0.5, max: 0.5, tipo: 'burbuja', r: rnd(0.03, 0.07) });
    }
    if (s >= tp.finS + 0.5 && !tp.hecho) {
      tp.hecho = true;
      tp.alFinal?.();
    }
  }
  FX.torpedos = FX.torpedos.filter((p) => !p.hecho);
  // destellos
  for (const f of FX.flashes) {
    f.vida -= dt;
    const P = aPantalla(R, f.b, f.x + 0.5, f.y + 0.5);
    if (!P) continue;
    const k = Math.max(0, f.vida / f.max);
    const g = c.createRadialGradient(P[0], P[1], 0, P[0], P[1], P[2] * f.r);
    g.addColorStop(0, `rgba(255,250,220,${k})`);
    g.addColorStop(0.35, `rgba(255,170,60,${k * 0.8})`);
    g.addColorStop(1, 'rgba(255,90,30,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(P[0], P[1], P[2] * f.r, 0, Math.PI * 2);
    c.fill();
  }
  FX.flashes = FX.flashes.filter((f) => f.vida > 0);
  // anillos
  for (const a of FX.anillos) {
    if (a.retraso > 0) {
      a.retraso -= dt;
      continue;
    }
    a.vida -= dt;
    const P = aPantalla(R, a.b, a.x + 0.5, a.y + 0.5);
    if (!P) continue;
    const k = Math.max(0, a.vida / a.max);
    c.strokeStyle = `rgba(${a.color},${k * 0.9})`;
    c.lineWidth = (a.grueso || 1.5) * (0.5 + k);
    c.beginPath();
    c.arc(P[0], P[1], P[2] * lerp(a.r1, a.r0, k), 0, Math.PI * 2);
    c.stroke();
  }
  FX.anillos = FX.anillos.filter((a) => a.vida > 0);
  // partículas
  for (const p of FX.particulas) {
    p.vida -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.tipo === 'gota') {
      p.z += p.vz * dt;
      p.vz -= 9 * dt;
    }
    if (p.tipo === 'chispa') {
      p.vx *= 1 - 2.5 * dt;
      p.vy *= 1 - 2.5 * dt;
    }
    const P = aPantalla(R, p.b, p.x + 0.5, p.y + 0.5 - Math.max(0, p.z) * 0.25);
    if (!P) continue;
    const k = Math.max(0, p.vida / p.max);
    const r = P[2] * p.r * (p.tipo === 'humo' ? 2 - k : 1);
    c.fillStyle =
      p.tipo === 'gota' ? `rgba(225,245,255,${k})` : p.tipo === 'chispa' ? `rgba(255,${150 + Math.round(k * 90)},70,${k})` : p.tipo === 'burbuja' ? `rgba(220,245,255,${k * 0.6})` : `rgba(40,42,46,${k * 0.5})`;
    c.beginPath();
    c.arc(P[0], P[1], Math.max(0.8, r), 0, Math.PI * 2);
    c.fill();
  }
  FX.particulas = FX.particulas.filter((p) => p.vida > 0);
  // textos flotantes
  for (const tx of FX.textos) {
    tx.vida -= dt;
    const P = aPantalla(R, tx.b, tx.x + 0.5, tx.y + 0.5);
    if (!P) continue;
    const k = Math.max(0, tx.vida / tx.max);
    const sube = (1 - k) * P[2] * 0.9;
    c.globalAlpha = Math.min(1, k * 2.2);
    c.font = `900 ${Math.max(11, Math.min(18, P[2] * 0.42))}px Inter, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 3.5;
    c.strokeStyle = 'rgba(2,10,16,.85)';
    c.strokeText(tx.txt, P[0], P[1] - P[2] * 0.55 - sube);
    c.fillStyle = tx.color;
    c.fillText(tx.txt, P[0], P[1] - P[2] * 0.55 - sube);
    c.globalAlpha = 1;
  }
  FX.textos = FX.textos.filter((t) => t.vida > 0);
}

export const ocupado = () => FX.proyectiles.length + FX.torpedos.length > 0;

/* detrás de los menús: un radar grande que barre y encuentra contactos */
const BLIPS = Array.from({ length: 9 }, () => ({ a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.7 }));
function portada(t0) {
  const cx = W / 2;
  const cy = H * 0.52;
  const R = Math.max(W, H) * 0.55;
  const giro = reducido ? 0.6 : (t0 * 0.9) % (Math.PI * 2);
  c.save();
  c.strokeStyle = 'rgba(95,225,255,.07)';
  c.lineWidth = 1;
  for (let k = 1; k <= 5; k++) {
    c.beginPath();
    c.arc(cx, cy, (R * k) / 5, 0, Math.PI * 2);
    c.stroke();
  }
  if (c.createConicGradient) {
    const g = c.createConicGradient(giro - 0.9, cx, cy);
    g.addColorStop(0, 'rgba(98,242,163,0)');
    g.addColorStop(0.14, 'rgba(98,242,163,.07)');
    g.addColorStop(0.145, 'rgba(98,242,163,0)');
    g.addColorStop(1, 'rgba(98,242,163,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
  }
  for (const b of BLIPS) {
    // brilla cuando pasa el barrido y se apaga de a poco
    const d = (((giro - b.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const k = Math.max(0, 1 - d / 2.4);
    if (k <= 0) continue;
    const x = cx + Math.cos(b.a) * b.r * R;
    const y = cy + Math.sin(b.a) * b.r * R;
    c.fillStyle = `rgba(255,120,80,${0.55 * k})`;
    c.beginPath();
    c.arc(x, y, 3 + 3 * k, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Un cuadro. E = estado a mostrar; R = disposición (de disponer). */
export function dibujar(E, R, t0, dt) {
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  fondo ||= crearFondo();
  c.drawImage(fondo, 0, 0, W, H);
  if (!E) return portada(t0);
  FX.R = R;
  c.save();
  if (FX.shake > 0.3) {
    c.translate(rnd(-FX.shake, FX.shake) * 0.6, rnd(-FX.shake, FX.shake) * 0.6);
    FX.shake *= Math.pow(0.001, dt);
  }
  if (R.rival) tablero(R.rival, E, 'rival', t0);
  if (R.mio) tablero(R.mio, E, 'mio', t0);
  efectos(R, dt);
  c.restore();
}
