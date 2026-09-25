/* Sky Hop — game.it
 * Saltador infinito: una gotita de gelatina sube por un cielo de papel que cambia con la altura
 * (día → atardecer → noche → aurora → espacio). El mundo se genera con una semilla, así en online
 * todos juegan el mismo recorrido y se ven como fantasmas.
 */
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];

const TXT = {
  tagline: { es: 'Saltá lo más alto que puedas. El cielo no tiene fin.', en: 'Jump as high as you can. The sky never ends.' },
  solo: { es: 'Jugar', en: 'Play' },
  online: { es: 'Carrera online', en: 'Online race' },
  onlineSub: { es: 'Mismo cielo para todos: gana quien llegue más alto', en: 'Same sky for everyone: highest wins' },
  controls: { es: 'Controles en el celular', en: 'Phone controls' },
  touch: { es: 'Tocar lados', en: 'Tap sides' },
  tilt: { es: 'Inclinar', en: 'Tilt' },
  keys: { es: '← → o A D para moverte', en: '← → or A D to move' },
  best: { es: 'mejor', en: 'best' },
  create: { es: 'Crear sala', en: 'Create room' },
  join: { es: 'Unirse', en: 'Join' },
  back: { es: '← volver', en: '← back' },
  shareCode: { es: 'Compartí este código', en: 'Share this code' },
  copyLink: { es: 'Copiar link', en: 'Copy link' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  start: { es: '¡Empezar carrera!', en: 'Start race!' },
  waitingHost: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  you: { es: 'vos', en: 'you' },
  host: { es: 'anfitrión', en: 'host' },
  fell: { es: '¡Te caíste!', en: 'You fell!' },
  eaten: { es: '¡Te atraparon!', en: 'Caught!' },
  sucked: { es: '¡Agujero negro!', en: 'Black hole!' },
  newBest: { es: '¡Nuevo récord de la sesión!', en: 'New session best!' },
  bestWas: { es: 'Mejor de la sesión: {n} m', en: 'Session best: {n} m' },
  stomps: { es: 'monstruos', en: 'monsters' },
  springs: { es: 'resortes', en: 'springs' },
  reached: { es: 'llegaste a', en: 'reached' },
  again: { es: 'Otra vez', en: 'Again' },
  revive: { es: '▶ Continuar · ver anuncio', en: '▶ Continue · watch an ad' },
  menu: { es: 'Menú', en: 'Menu' },
  waitOthers: { es: 'Esperando que caigan los demás…', en: 'Waiting for the others to fall…' },
  playing: { es: 'jugando', en: 'playing' },
  win: { es: '¡Ganaste la carrera!', en: 'You won the race!' },
  place: { es: 'Terminaste {n}°', en: 'You finished #{n}' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  waitRematch: { es: 'Esperando revancha…', en: 'Waiting for rematch…' },
  b0: { es: 'Día', en: 'Daytime' },
  b1: { es: 'Atardecer', en: 'Sunset' },
  b2: { es: 'Noche', en: 'Night' },
  b3: { es: 'Aurora', en: 'Aurora' },
  b4: { es: 'Espacio', en: 'Outer space' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ================= constantes =================
const W = 400; // ancho del mundo
const GRAV = 1450;
const JUMP = 780;
const SPRING = 1320;
const TRAMP = 1750;
const MAXV = 430;
const R = 18;
const BIOMES = [
  { y: 0, top: [124, 200, 255], bot: [214, 240, 255], plat: '#8bd46e', platTop: '#b6ef8f', platSide: '#e9dcc0', ink: '#2d2a4a' },
  { y: 2600, top: [255, 140, 140], bot: [255, 214, 165], plat: '#ffb38a', platTop: '#ffd3b0', platSide: '#f2c9a0', ink: '#4a2a3a' },
  { y: 6200, top: [24, 36, 92], bot: [60, 76, 140], plat: '#8aa0ff', platTop: '#bfcaff', platSide: '#5d6fc4', ink: '#e8ecff' },
  { y: 11000, top: [16, 12, 52], bot: [44, 24, 92], plat: '#6fe3c1', platTop: '#b5ffe9', platSide: '#3d9f86', ink: '#e8fff8' },
  { y: 17000, top: [4, 3, 14], bot: [20, 10, 42], plat: '#b58cff', platTop: '#dcc7ff', platSide: '#6a4bb0', ink: '#f2ecff' },
];

// ================= RNG con semilla =================
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ================= estado =================
const S = {
  state: 'menu', // menu | countdown | play | dying | over
  mode: 'solo',
  seed: 1,
  rng: null,
  plats: [],
  mons: [],
  holes: [],
  pieces: [],
  parts: [],
  nextY: 0,
  camY: 0,
  best: 0,
  score: 0,
  stomps: 0,
  springs: 0,
  biome: 0,
  deathBy: 'fell',
  time: 0,
  startAt: 0,
  input: 0,
  control: 'touch',
};
const P = { x: W / 2, y: 60, vx: 0, vy: 0, face: 1, squash: 0, jet: 0, prop: 0, shield: false, blink: 0, spin: 0 };
const others = new Map();
let online = null;

// ================= mundo =================
function newWorld(seed) {
  S.seed = seed;
  S.rng = mulberry(seed);
  S.plats = [{ x: W / 2, baseX: W / 2, y: 40, baseY: 40, w: 150, type: 'normal', item: null, gone: 0, t: 0 }];
  S.mons = [];
  S.holes = [];
  S.pieces = [];
  S.parts = [];
  S.nextY = 40;
  S.camY = 0;
  S.score = 0;
  S.stomps = 0;
  S.springs = 0;
  S.biome = 0;
  S.time = 0;
  Object.assign(P, { x: W / 2, y: 40, vx: 0, vy: JUMP * 0.9, jet: 0, prop: 0, shield: false, squash: 0, spin: 0 });
  generate(1400);
}

function generate(upTo) {
  const r = S.rng;
  while (S.nextY < upTo) {
    const h = S.nextY;
    const d = Math.min(1, h / 16000);
    const gap = Math.min(182, lerp(58, 172, Math.pow(d, 0.75)) * (0.62 + r() * 0.38));
    S.nextY += gap;
    const y = S.nextY;
    const roll = r();
    let type = 'normal';
    const wMove = 0.08 + 0.34 * d;
    const wV = h > 1500 ? 0.04 + 0.08 * d : 0;
    const wVan = h > 800 ? 0.05 + 0.14 * d : 0;
    if (roll < wMove) type = 'move';
    else if (roll < wMove + wV) type = 'vmove';
    else if (roll < wMove + wV + wVan) type = 'vanish';
    const w = lerp(96, 62, d) * (type === 'move' ? 0.9 : 1);
    const amp = Math.min(115, (W - w) / 2 - 5);
    const x = type === 'move' ? w / 2 + amp + r() * (W - w - 2 * amp) : w / 2 + r() * (W - w);
    let item = null;
    const ir = r();
    if (ir < 0.075) item = 'spring';
    else if (ir < 0.09 && h > 2000) item = 'tramp';
    else if (ir < 0.1 && h > 1800) item = 'jet';
    else if (ir < 0.118 && h > 900) item = 'prop';
    else if (ir < 0.13 && h > 3000) item = 'shield';
    const p = { x, baseX: x, y, baseY: y, w, type, item, itemX: (r() - 0.5) * (w - 26), speed: lerp(60, 150, d) * (0.7 + r() * 0.6), phase: r() * 6.28, range: Math.min(30 + r() * 30, Math.max(0, (196 - gap) / 2)), gone: 0, t: 0 };
    if (type === 'vanish' || (item && item !== 'spring' && item !== 'tramp')) {
      // los objetos flotan arriba de la plataforma y no sobre las que desaparecen
      if (type === 'vanish' && item) p.item = null;
    }
    S.plats.push(p);
    // plataformas trampa (se rompen) como señuelo
    if (r() < 0.1 + 0.22 * d && h > 400) {
      const bw = lerp(90, 66, d);
      S.plats.push({ x: bw / 2 + r() * (W - bw), baseX: 0, y: y - gap * (0.35 + r() * 0.3), w: bw, type: 'break', item: null, t: 0, gone: 0 });
    }
    // monstruos
    if (h > 1400 && r() < 0.02 + 0.06 * d) {
      const kinds = h > 6200 ? ['blob', 'bat', 'ufo'] : ['blob', 'bat'];
      S.mons.push({ x: 40 + r() * (W - 80), y: y + gap * 0.5 + 30, r: 22, kind: kinds[Math.floor(r() * kinds.length)], phase: r() * 6.28, dead: 0 });
    }
    // agujeros negros en el espacio
    if (h > 17000 && r() < 0.018) S.holes.push({ x: 60 + r() * (W - 120), y: y + gap * 0.5, r: 26 });
  }
}

// ================= vista =================
const cv = $('c');
const g = cv.getContext('2d');
let dpr = 1;
let vw = 0;
let vh = 0;
let colW = 0;
let sc = 1;
let ox = 0;
let viewH = 0;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  vw = innerWidth;
  vh = innerHeight;
  cv.width = Math.round(vw * dpr);
  cv.height = Math.round(vh * dpr);
  colW = Math.min(vw, vh * 0.66, 560);
  sc = colW / W;
  ox = (vw - colW) / 2;
  viewH = vh / sc;
}
const sy = (y) => (S.camY + viewH - y) * sc;
const sx = (x) => ox + x * sc;

function biomeAt(y) {
  let i = 0;
  while (i < BIOMES.length - 1 && y >= BIOMES[i + 1].y) i++;
  const a = BIOMES[i];
  const b = BIOMES[Math.min(i + 1, BIOMES.length - 1)];
  const span = b.y - a.y || 1;
  // transición suave en los últimos 900 de cada bioma
  const k = i === BIOMES.length - 1 ? 0 : clamp((y - (b.y - 900)) / 900, 0, 1);
  return { i, a, b, k };
}
const mix = (c1, c2, k) => c1.map((v, j) => Math.round(lerp(v, c2[j], k)));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// ================= dibujo =================
function drawBackground(now) {
  const { a, b, k } = biomeAt(S.camY + viewH * 0.5);
  const top = mix(a.top, b.top, k);
  const bot = mix(a.bot, b.bot, k);
  const grad = g.createLinearGradient(0, 0, 0, vh);
  grad.addColorStop(0, rgb(top));
  grad.addColorStop(1, rgb(bot));
  g.fillStyle = grad;
  g.fillRect(0, 0, vw, vh);
  const camMid = S.camY + viewH * 0.5;

  // estrellas (desde la noche)
  const starA = clamp((camMid - 5200) / 1500, 0, 1);
  if (starA > 0) {
    const band = 260;
    const par = 0.3;
    const cy = S.camY * par;
    const b0 = Math.floor(cy / band) - 1;
    for (let bi = b0; bi < b0 + viewH / band + 3; bi++)
      for (let j = 0; j < 7; j++) {
        const hx = hash(bi * 31 + j);
        const hy = hash(bi * 57 + j * 13);
        const x = hx * vw;
        const y = (cy + viewH - (bi * band + hy * band)) * sc;
        const tw = 0.5 + 0.5 * Math.sin(now / 500 + j * 2 + bi);
        g.globalAlpha = starA * (0.35 + 0.65 * tw);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(x, y, (hash(bi * 7 + j) < 0.2 ? 2 : 1.2) * dpr * 0.8, 0, 6.28);
        g.fill();
      }
    g.globalAlpha = 1;
  }

  // aurora
  const auroraA = clamp((camMid - 10000) / 1500, 0, 1) * clamp((19000 - camMid) / 2000, 0, 1);
  if (auroraA > 0) {
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = auroraA * 0.22;
      g.fillStyle = ['#6fffc8', '#ff7ae0', '#7ab8ff'][i];
      g.beginPath();
      const base = vh * (0.25 + i * 0.12);
      g.moveTo(0, base);
      for (let x = 0; x <= vw; x += 20) g.lineTo(x, base + Math.sin(x / 90 + now / (1400 + i * 300) + i) * 40 + Math.sin(x / 37 + now / 900) * 12);
      g.lineTo(vw, base + 120);
      for (let x = vw; x >= 0; x -= 20) g.lineTo(x, base + 120 + Math.sin(x / 70 + now / 1600 + i) * 30);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // planetas en el espacio
  const spaceA = clamp((camMid - 16000) / 1500, 0, 1);
  if (spaceA > 0) {
    const band = 1400;
    const par = 0.18;
    const cy = S.camY * par;
    const b0 = Math.floor(cy / band) - 1;
    for (let bi = b0; bi < b0 + viewH / band + 3; bi++) {
      if (hash(bi * 99) < 0.35) continue;
      const x = hash(bi * 11) * vw;
      const y = (cy + viewH - (bi * band + hash(bi * 5) * band)) * sc;
      const r = (20 + hash(bi * 3) * 50) * sc;
      const hue = Math.floor(hash(bi * 17) * 360);
      g.globalAlpha = spaceA;
      g.fillStyle = `hsl(${hue} 60% 62%)`;
      g.beginPath();
      g.arc(x, y, r, 0, 6.28);
      g.fill();
      g.fillStyle = `hsl(${hue} 60% 48%)`;
      g.beginPath();
      g.arc(x + r * 0.25, y + r * 0.2, r * 0.8, 0, 6.28);
      g.fill();
      if (hash(bi * 23) < 0.5) {
        g.strokeStyle = `hsla(${hue + 40} 80% 80% / .8)`;
        g.lineWidth = 3 * sc;
        g.beginPath();
        g.ellipse(x, y, r * 1.7, r * 0.45, -0.3, 0, 6.28);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  // nubes de papel (se desvanecen hacia el espacio)
  const cloudA = clamp((12000 - camMid) / 3000, 0, 1);
  if (cloudA > 0) {
    for (const [par, band, alpha] of [
      [0.35, 420, 0.55],
      [0.6, 360, 0.85],
    ]) {
      const cy = S.camY * par;
      const b0 = Math.floor(cy / band) - 1;
      for (let bi = b0; bi < b0 + viewH / band + 3; bi++) {
        const x = ((hash(bi * 13 + band) * 1.4 - 0.2) * vw + (now / 1000) * 8 * par * sc) % (vw + 200) - 100;
        const y = (cy + viewH - (bi * band + hash(bi * 19 + band) * band)) * sc;
        const s = (40 + hash(bi * 29 + band) * 50) * sc * (par + 0.4);
        const night = camMid > 5500;
        g.globalAlpha = cloudA * alpha * (night ? 0.35 : 1);
        cloud(x, y, s, night ? '#c9d2ff' : '#ffffff');
      }
    }
    g.globalAlpha = 1;
  }

  // colinas al principio
  if (S.camY < 500) {
    const base = sy(-20);
    for (const [c, amp, off] of [
      ['#a8e08c', 60, 0],
      ['#7ccf6a', 40, 2],
    ]) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, vh);
      for (let x = 0; x <= vw; x += 16) g.lineTo(x, base - amp * sc * (0.6 + 0.4 * Math.sin(x / (90 * sc) + off)) - 20 * sc);
      g.lineTo(vw, vh);
      g.fill();
    }
  }
}

function cloud(x, y, s, color) {
  g.fillStyle = 'rgba(45,42,74,.08)';
  g.beginPath();
  g.ellipse(x + s * 0.08, y + s * 0.12, s, s * 0.34, 0, 0, 6.28);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, s, s * 0.32, 0, 0, 6.28);
  g.arc(x - s * 0.35, y - s * 0.12, s * 0.34, 0, 6.28);
  g.arc(x + s * 0.15, y - s * 0.22, s * 0.44, 0, 6.28);
  g.fill();
}

function roundRect(x, y, w, h, r) {
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
}

function drawPlatform(p, now) {
  const bi = biomeAt(p.y);
  const pal = bi.k > 0.5 ? bi.b : bi.a;
  const x = sx(p.x - p.w / 2);
  const y = sy(p.y);
  const w = p.w * sc;
  const h = 16 * sc;
  if (p.gone) g.globalAlpha = Math.max(0, 1 - p.gone);
  // sombra de papel
  g.fillStyle = 'rgba(30,20,60,.18)';
  roundRect(x + 3 * sc, y + 5 * sc, w, h, 8 * sc);
  g.fill();
  if (p.type === 'break') {
    g.fillStyle = '#c99d6b';
    roundRect(x, y, w, h, 8 * sc);
    g.fill();
    g.strokeStyle = '#8a643e';
    g.lineWidth = 2 * sc;
    g.beginPath();
    g.moveTo(x + w * 0.3, y);
    g.lineTo(x + w * 0.38, y + h * 0.5);
    g.lineTo(x + w * 0.32, y + h);
    g.moveTo(x + w * 0.68, y);
    g.lineTo(x + w * 0.62, y + h * 0.6);
    g.stroke();
  } else if (p.type === 'vanish') {
    g.globalAlpha *= 0.85;
    cloud(x + w / 2, y + h * 0.4, w * 0.55, bi.i < 2 ? '#ffffff' : pal.platTop);
  } else {
    g.fillStyle = pal.platSide;
    roundRect(x, y, w, h, 8 * sc);
    g.fill();
    g.fillStyle = p.type === 'move' ? '#ffd166' : p.type === 'vmove' ? '#ff9ecb' : pal.plat;
    roundRect(x, y, w, h * 0.62, 8 * sc);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.45)';
    roundRect(x + 5 * sc, y + 2.5 * sc, w - 10 * sc, 3 * sc, 2 * sc);
    g.fill();
    if (p.type === 'move' || p.type === 'vmove') {
      // flechitas que indican el movimiento
      g.fillStyle = 'rgba(45,42,74,.35)';
      const cx = x + w / 2;
      const cy = y + h * 0.78;
      g.beginPath();
      if (p.type === 'move') {
        g.moveTo(cx - 10 * sc, cy);
        g.lineTo(cx - 5 * sc, cy - 3 * sc);
        g.lineTo(cx - 5 * sc, cy + 3 * sc);
        g.moveTo(cx + 10 * sc, cy);
        g.lineTo(cx + 5 * sc, cy - 3 * sc);
        g.lineTo(cx + 5 * sc, cy + 3 * sc);
      } else {
        g.arc(cx, cy, 2.5 * sc, 0, 6.28);
      }
      g.fill();
    }
  }
  g.globalAlpha = 1;
  if (p.item) drawItem(p, now);
}

function drawItem(p, now) {
  const x = sx(p.x + p.itemX);
  const y = sy(p.y);
  if (p.item === 'spring') {
    const k = p.t > 0 ? Math.max(0, 1 - (now - p.t) / 300) : 0;
    const hgt = (10 + k * 14) * sc;
    g.strokeStyle = '#7a7699';
    g.lineWidth = 2.5 * sc;
    g.beginPath();
    for (let i = 0; i <= 4; i++) g.lineTo(x + (i % 2 ? 6 : -6) * sc, y - (i / 4) * hgt);
    g.stroke();
    g.fillStyle = '#ff6b8b';
    roundRect(x - 9 * sc, y - hgt - 4 * sc, 18 * sc, 5 * sc, 2 * sc);
    g.fill();
  } else if (p.item === 'tramp') {
    const k = p.t > 0 ? Math.max(0, 1 - (now - p.t) / 400) : 0;
    g.strokeStyle = '#2d2a4a';
    g.lineWidth = 3 * sc;
    g.beginPath();
    g.moveTo(x - 18 * sc, y);
    g.lineTo(x - 14 * sc, y - 10 * sc);
    g.moveTo(x + 18 * sc, y);
    g.lineTo(x + 14 * sc, y - 10 * sc);
    g.stroke();
    g.strokeStyle = '#6bc6ff';
    g.lineWidth = 4 * sc;
    g.beginPath();
    g.moveTo(x - 18 * sc, y - 10 * sc);
    g.quadraticCurveTo(x, y - 10 * sc + k * 10 * sc, x + 18 * sc, y - 10 * sc);
    g.stroke();
  } else {
    // objetos flotantes con leve vaivén
    const fy = y - (28 + Math.sin(now / 300 + p.phase) * 4) * sc;
    g.save();
    g.translate(x, fy);
    g.scale(sc, sc);
    if (p.item === 'jet') drawJetpack(0, 0);
    else if (p.item === 'prop') drawPropHat(0, 0, now);
    else if (p.item === 'shield') {
      g.strokeStyle = '#6bc6ff';
      g.lineWidth = 3;
      g.fillStyle = 'rgba(107,198,255,.25)';
      g.beginPath();
      g.arc(0, 0, 13, 0, 6.28);
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(-4, -4, 3, 0, 6.28);
      g.fill();
    }
    g.restore();
  }
}

function drawJetpack(x, y, flame = false, now = 0) {
  g.fillStyle = '#9aa3b5';
  roundRect(x - 11, y - 12, 9, 22, 4);
  g.fill();
  roundRect(x + 2, y - 12, 9, 22, 4);
  g.fill();
  g.fillStyle = '#ff6b8b';
  roundRect(x - 11, y - 12, 22, 6, 3);
  g.fill();
  if (flame) {
    for (const fx of [-6.5, 6.5]) {
      const l = 14 + Math.sin(now / 30 + fx) * 5;
      g.fillStyle = '#ffd166';
      g.beginPath();
      g.moveTo(fx - 4, y + 10);
      g.lineTo(fx, y + 10 + l);
      g.lineTo(fx + 4, y + 10);
      g.fill();
      g.fillStyle = '#ff8a3d';
      g.beginPath();
      g.moveTo(fx - 2, y + 10);
      g.lineTo(fx, y + 10 + l * 0.6);
      g.lineTo(fx + 2, y + 10);
      g.fill();
    }
  }
}

function drawPropHat(x, y, now) {
  g.fillStyle = '#ffd166';
  g.beginPath();
  g.arc(x, y + 4, 11, Math.PI, 0);
  g.fill();
  g.fillStyle = '#ff6b8b';
  g.fillRect(x - 12, y + 3, 24, 4);
  g.strokeStyle = '#2d2a4a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y - 7);
  g.lineTo(x, y - 12);
  g.stroke();
  const w = Math.abs(Math.cos(now / 40)) * 16 + 2;
  g.fillStyle = '#6bc6ff';
  g.beginPath();
  g.ellipse(x, y - 13, w, 3, 0, 0, 6.28);
  g.fill();
}

function drawMonster(m, now) {
  const x = sx(m.x + Math.sin(now / 700 + m.phase) * 30);
  const y = sy(m.y + Math.sin(now / 400 + m.phase) * 8);
  g.save();
  g.translate(x, y);
  g.scale(sc, sc);
  if (m.dead) {
    g.globalAlpha = Math.max(0, 1 - m.dead);
    g.rotate(m.dead * 4);
    g.scale(1 - m.dead * 0.5, 1 - m.dead * 0.5);
  }
  if (m.kind === 'ufo') {
    g.fillStyle = 'rgba(160,255,200,.35)';
    g.beginPath();
    g.moveTo(-10, 6);
    g.lineTo(10, 6);
    g.lineTo(18, 40);
    g.lineTo(-18, 40);
    g.fill();
    g.fillStyle = '#9aa3b5';
    g.beginPath();
    g.ellipse(0, 4, 26, 9, 0, 0, 6.28);
    g.fill();
    g.fillStyle = '#9fffd0';
    g.beginPath();
    g.arc(0, -2, 12, Math.PI, 0);
    g.fill();
    for (let i = -2; i <= 2; i++) {
      g.fillStyle = Math.floor(now / 200 + i) % 2 ? '#ffd166' : '#ff6b8b';
      g.beginPath();
      g.arc(i * 9, 7, 2.5, 0, 6.28);
      g.fill();
    }
  } else if (m.kind === 'bat') {
    const flap = Math.sin(now / 80 + m.phase) * 0.6;
    g.fillStyle = '#6a4bb0';
    for (const s of [-1, 1]) {
      g.save();
      g.scale(s, 1);
      g.rotate(flap);
      g.beginPath();
      g.moveTo(8, 0);
      g.quadraticCurveTo(26, -18, 34, -2);
      g.quadraticCurveTo(26, 2, 22, 8);
      g.quadraticCurveTo(16, 4, 8, 8);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#8a6bd0';
    g.beginPath();
    g.arc(0, 0, 13, 0, 6.28);
    g.fill();
    eyes(0, -2, 1, '#ffd166');
  } else {
    const wob = Math.sin(now / 150 + m.phase) * 0.08;
    g.fillStyle = '#7bd389';
    g.beginPath();
    g.ellipse(0, 0, 22 * (1 + wob), 18 * (1 - wob), 0, 0, 6.28);
    g.fill();
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * 8 - 4, -15);
      g.lineTo(i * 8, -24);
      g.lineTo(i * 8 + 4, -15);
      g.fill();
    }
    eyes(0, -3, 1.1, '#fff');
    g.strokeStyle = '#2d2a4a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-7, 8);
    for (let i = 0; i <= 4; i++) g.lineTo(-7 + i * 3.5, 8 + (i % 2 ? 3 : 0));
    g.stroke();
  }
  g.restore();
}

function eyes(x, y, s, white) {
  for (const d of [-1, 1]) {
    g.fillStyle = white;
    g.beginPath();
    g.arc(x + d * 5 * s, y, 4 * s, 0, 6.28);
    g.fill();
    g.fillStyle = '#2d2a4a';
    g.beginPath();
    g.arc(x + d * 5 * s + 1, y + 1, 2 * s, 0, 6.28);
    g.fill();
  }
}

function drawHole(h, now) {
  const x = sx(h.x);
  const y = sy(h.y);
  const r = h.r * sc;
  for (let i = 5; i >= 0; i--) {
    g.fillStyle = `rgba(${140 - i * 20},${60 - i * 8},${255 - i * 30},${0.12 + (5 - i) * 0.05})`;
    g.beginPath();
    g.arc(x, y, r * (1 + i * 0.35 + Math.sin(now / 300 + i) * 0.05), 0, 6.28);
    g.fill();
  }
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(x, y, r * 0.8, 0, 6.28);
  g.fill();
  g.strokeStyle = 'rgba(200,160,255,.7)';
  g.lineWidth = 2 * sc;
  g.beginPath();
  g.arc(x, y, r, now / 200, now / 200 + 4);
  g.stroke();
}

/** La gotita de gelatina: se estira al subir y se aplasta al caer. */
function drawBlob(x, y, vy, color, alpha = 1, face = 1, extra = null, now = 0) {
  const stretch = clamp(vy / 1600, -0.25, 0.3);
  const sq = extra?.squash || 0;
  const w = R * (1 - stretch * 0.5 + sq * 0.35);
  const h = R * (1 + stretch - sq * 0.35);
  g.save();
  g.globalAlpha = alpha;
  g.translate(sx(x), sy(y + h));
  g.scale(sc, sc);
  if (extra?.spin) g.rotate(extra.spin);
  if (extra?.jet) {
    g.save();
    g.translate(-face * 14, 4);
    drawJetpack(0, 0, true, now);
    g.restore();
  }
  // sombra del cuerpo
  g.fillStyle = 'rgba(30,20,60,.18)';
  g.beginPath();
  g.ellipse(3, 4, w, h, 0, 0, 6.28);
  g.fill();
  const grd = g.createRadialGradient(-w * 0.35, -h * 0.4, 2, 0, 0, Math.max(w, h) * 1.1);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(0.15, color);
  grd.addColorStop(1, shade(color, -30));
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(0, 0, w, h, 0, 0, 6.28);
  g.fill();
  // panza y cachetes
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.ellipse(face * 2, h * 0.35, w * 0.55, h * 0.35, 0, 0, 6.28);
  g.fill();
  const blink = extra?.blink && Math.sin(now / 90) > 0.6;
  for (const d of [-1, 1]) {
    const ex = face * 4 + d * 6.5;
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(ex, -h * 0.25, 5, blink ? 1 : 6, 0, 0, 6.28);
    g.fill();
    if (!blink) {
      g.fillStyle = '#2d2a4a';
      g.beginPath();
      g.arc(ex + face * 1.5, -h * 0.25 + clamp(-vy / 500, -2, 2), 2.8, 0, 6.28);
      g.fill();
    }
    g.fillStyle = 'rgba(255,120,150,.55)';
    g.beginPath();
    g.ellipse(ex + d * 5, -h * 0.02, 3.5, 2, 0, 0, 6.28);
    g.fill();
  }
  if (extra?.prop) {
    g.save();
    g.translate(0, -h - 4);
    drawPropHat(0, 0, now);
    g.restore();
  }
  if (extra?.shield) {
    g.strokeStyle = 'rgba(107,198,255,.9)';
    g.fillStyle = 'rgba(107,198,255,.18)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(0, 0, R * 1.55 + Math.sin(now / 150) * 1.5, 0, 6.28);
    g.fill();
    g.stroke();
  }
  g.restore();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => clamp(v + amt, 0, 255));
  return `rgb(${c.join(',')})`;
}

function drawParticles(dt) {
  for (const p of S.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 600 * dt;
    g.globalAlpha = Math.max(0, p.life / p.max);
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(sx(p.x), sy(p.y), p.r * sc, 0, 6.28);
    g.fill();
  }
  g.globalAlpha = 1;
  S.parts = S.parts.filter((p) => p.life > 0);
  for (const pc of S.pieces) {
    pc.vy -= GRAV * dt;
    pc.y += pc.vy * dt;
    pc.x += pc.vx * dt;
    pc.rot += pc.vr * dt;
    g.save();
    g.translate(sx(pc.x), sy(pc.y));
    g.rotate(pc.rot);
    g.fillStyle = '#c99d6b';
    g.fillRect((-pc.w / 2) * sc, -6 * sc, pc.w * sc, 12 * sc);
    g.restore();
  }
  S.pieces = S.pieces.filter((pc) => pc.y > S.camY - 200);
}

function dust(x, y, n = 8, color = 'rgba(255,255,255,.9)') {
  if (G.prefs.reducedMotion) return;
  for (let i = 0; i < n; i++) S.parts.push({ x, y, vx: (Math.random() - 0.5) * 240, vy: Math.random() * 120, r: 2 + Math.random() * 3, life: 0.5, max: 0.5, color });
}

// ================= actualización =================
function update(dt, now) {
  S.time += dt;
  // plataformas móviles
  for (const p of S.plats) {
    if (p.type === 'move') {
      p.x = p.baseX + Math.sin(S.time * (p.speed / 90) + p.phase) * Math.min(115, (W - p.w) / 2 - 5);
    } else if (p.type === 'vmove') p.y = p.baseY + Math.sin(S.time * 1.6 + p.phase) * p.range;
    if (p.gone) p.gone += dt * 3;
  }
  S.plats = S.plats.filter((p) => p.y > S.camY - 100 && !(p.gone >= 1));
  S.mons = S.mons.filter((m) => m.y > S.camY - 100 && m.dead < 1);
  S.holes = S.holes.filter((h) => h.y > S.camY - 100);
  for (const m of S.mons) if (m.dead) m.dead += dt * 2;

  if (S.state === 'dying') {
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    P.spin += dt * 8;
    if (P.y < S.camY - 300) gameOver();
    return;
  }
  if (S.state === 'menu' || S.state === 'countdown') {
    // en espera: la gotita rebota en la plataforma inicial
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    P.squash = Math.max(0, P.squash - dt * 5);
    if (P.y <= 40) {
      P.y = 40;
      P.vy = JUMP * 0.55;
      P.squash = 1;
    }
    return;
  }
  if (S.state !== 'play') return;
  if (P.spin) {
    P.spin += dt * 14;
    if (P.vy <= 0) P.spin = 0;
  }

  // control horizontal
  let dir = S.input;
  if (S.control === 'tilt' && G.prefs.touch && tiltValue !== null) dir = clamp(tiltValue / 22, -1, 1);
  const target = dir * MAXV;
  P.vx += clamp(target - P.vx, -2600 * dt, 2600 * dt);
  if (Math.abs(dir) > 0.1) P.face = Math.sign(dir);
  P.x += P.vx * dt;
  if (P.x < -R) P.x += W + 2 * R;
  if (P.x > W + R) P.x -= W + 2 * R;

  // vertical
  const prevY = P.y;
  if (P.jet > 0) {
    P.jet -= dt;
    P.vy = Math.max(P.vy, 1500);
    if (Math.random() < 0.5) dust(P.x - P.face * 14, P.y, 1, 'rgba(255,209,102,.9)');
  } else if (P.prop > 0) {
    P.prop -= dt;
    P.vy = Math.max(P.vy, 920);
  } else P.vy -= GRAV * dt;
  P.y += P.vy * dt;
  P.squash = Math.max(0, P.squash - dt * 5);

  // aterrizaje en plataformas (solo cayendo)
  if (P.vy < 0 && P.jet <= 0 && P.prop <= 0) {
    for (const p of S.plats) {
      if (p.gone) continue;
      if (prevY >= p.y && P.y <= p.y && Math.abs(P.x - p.x) < p.w / 2 + R * 0.55) {
        land(p, now);
        break;
      }
    }
  }

  // objetos flotantes
  for (const p of S.plats) {
    if (!p.item || p.item === 'spring' || p.item === 'tramp') continue;
    const ix = p.x + p.itemX;
    const iy = p.y + 28;
    if (Math.abs(P.x - ix) < 26 && Math.abs(P.y + R - iy) < 32) {
      if (p.item === 'jet') {
        P.jet = 2.4;
        P.prop = 0;
        sound('jet');
      } else if (p.item === 'prop') {
        P.prop = 3.2;
        sound('prop');
      } else if (p.item === 'shield') {
        P.shield = true;
        sound('pick');
      }
      p.item = null;
    }
  }

  // monstruos
  for (const m of S.mons) {
    if (m.dead) continue;
    const mx = m.x + Math.sin(now / 700 + m.phase) * 30;
    const my = m.y + Math.sin(now / 400 + m.phase) * 8;
    const dx = P.x - mx;
    const dy = P.y + R - my;
    if (dx * dx + dy * dy < (R + m.r) ** 2) {
      if ((P.vy < 0 && dy > 4) || P.jet > 0 || P.prop > 0) {
        m.dead = 0.01;
        S.stomps++;
        if (P.vy < 0) P.vy = JUMP * 1.05;
        P.squash = 1;
        dust(mx, my, 12, '#7bd389');
        sound('stomp');
      } else if (P.shield) {
        P.shield = false;
        m.dead = 0.01;
        P.vy = JUMP;
        sound('pop');
      } else return die('eaten');
    }
  }
  // agujeros negros
  for (const h of S.holes) {
    const dx = h.x - P.x;
    const dy = h.y - (P.y + R);
    const d = Math.hypot(dx, dy);
    if (d < 140) {
      P.vx += (dx / d) * 900 * dt;
      P.vy += (dy / d) * 700 * dt;
    }
    if (d < h.r + 6 && P.jet <= 0) return die('sucked');
  }

  // puntaje y cámara
  const height = Math.max(0, P.y - 40);
  if (height / 10 > S.score) S.score = Math.floor(height / 10);
  const target2 = P.y - viewH * 0.42;
  if (target2 > S.camY) S.camY += (target2 - S.camY) * Math.min(1, dt * 8);
  generate(S.camY + viewH * 1.8);

  const b = biomeAt(P.y).i;
  if (b > S.biome) {
    S.biome = b;
    const el = $('biome');
    el.textContent = t(`b${b}`);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    sound('biome');
  }

  if (P.y < S.camY - 40) die('fell');
}

function land(p, now) {
  if (p.type === 'break') {
    // se parte en dos y cae
    p.gone = 1;
    for (const s of [-1, 1]) S.pieces.push({ x: p.x + (s * p.w) / 4, y: p.y, w: p.w / 2, vx: s * 60, vy: 50, rot: 0, vr: s * 3 });
    sound('crack');
    return;
  }
  let v = JUMP;
  const onItem = p.item && Math.abs(P.x - (p.x + p.itemX)) < 16;
  if (onItem && p.item === 'spring') {
    v = SPRING;
    p.t = now;
    S.springs++;
    sound('spring');
  } else if (onItem && p.item === 'tramp') {
    v = TRAMP;
    p.t = now;
    S.springs++;
    P.spin = 0.01;
    sound('tramp');
  } else sound('jump', p.y);
  P.vy = v;
  P.y = p.y;
  P.squash = 1;
  dust(P.x, p.y, 6);
  if (p.type === 'vanish') p.gone = 0.01;
  if (navigator.vibrate && G.prefs.touch && v > JUMP) navigator.vibrate(15);
}

function die(by) {
  if (S.state !== 'play') return;
  S.deathBy = by;
  S.state = 'dying';
  P.spin = 0.01;
  P.vy = by === 'fell' ? P.vy : 500;
  sound('die');
  if (S.mode === 'online') online.send({ t: 'finish', score: S.score });
}

function gameOver() {
  S.state = 'over';
  const isBest = S.score > S.best;
  S.best = Math.max(S.best, S.score);
  $('over-title').textContent = t(S.deathBy);
  $('over-score').textContent = `${S.score} m`;
  $('over-best').textContent = isBest && S.score > 0 ? t('newBest') : t('bestWas', { n: S.best });
  $('over-stats').innerHTML = `<div><b>${S.stomps}</b><small>${t('stomps')}</small></div><div><b>${S.springs}</b><small>${t('springs')}</small></div><div><b>${t(`b${S.biome}`)}</b><small>${t('reached')}</small></div>`;
  $('hud').hidden = true;
  $('power').hidden = true;
  if (S.mode === 'online') {
    renderRank();
    $('over-again').textContent = online.isHost && online.room?.state === 'finished' ? t('rematch') : t('waitOthers');
    $('over-again').disabled = !(online.isHost && online.room?.state === 'finished');
  } else {
    $('over-rank').innerHTML = '';
    $('over-again').textContent = t('again');
    $('over-again').disabled = false;
  }
  show('over');
  offerRevive();
}

// ================= continuar con un anuncio (opcional, una vez por partida) =================
let reviveToken = 0;
function offerRevive() {
  const btn = $('over-revive');
  btn.hidden = true;
  if (S.mode !== 'solo' || S.revived || S.score < 10) return;
  const token = ++reviveToken;
  G.rewardAvailable('continuar').then((ok) => {
    if (ok && token === reviveToken && S.state === 'over') {
      btn.textContent = t('revive');
      btn.hidden = false;
    }
  });
}
$('over-revive').onclick = async () => {
  $('over-revive').hidden = true;
  reviveToken++;
  if (await G.showReward()) revive();
};
function revive() {
  // reaparece sobre una plataforma nueva abajo de la pantalla, con escudo y sin enemigos cerca
  S.revived = true;
  const y = S.camY + 90;
  S.plats.push({ x: W / 2, baseX: W / 2, y, baseY: y, w: 150, type: 'normal', item: null, gone: 0, t: 0 });
  S.mons = S.mons.filter((m) => m.y > y + 420);
  S.holes = S.holes.filter((h) => h.y > y + 420);
  Object.assign(P, { x: W / 2, y, vx: 0, vy: JUMP, spin: 0, shield: true, jet: 0, prop: 0, squash: 1 });
  S.state = 'play';
  show(null);
}

// ================= bucle =================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused) dt = 0;
  if (S.state === 'countdown') {
    const left = S.startAt - online.serverNow();
    const n = Math.ceil(left / 1000);
    if (n !== lastCount && n > 0 && n <= 3) countPop(String(n));
    lastCount = n;
    if (left <= 0) {
      countPop('¡YA!');
      S.state = 'play';
    }
  }
  const steps = Math.ceil(dt / (1 / 120)) || 1;
  for (let i = 0; i < steps; i++) update(dt / steps, now);

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(now);
  for (const p of S.plats) if (sy(p.y) > -40 && sy(p.y) < vh + 40) drawPlatform(p, now);
  for (const h of S.holes) drawHole(h, now);
  for (const m of S.mons) if (sy(m.y) > -60 && sy(m.y) < vh + 60) drawMonster(m, now);
  drawParticles(dt);
  // fantasmas de los otros jugadores (online)
  for (const o of others.values()) {
    if (o.dead) continue;
    o.x += (o.tx - o.x) * Math.min(1, dt * 12);
    o.y += (o.ty - o.y) * Math.min(1, dt * 12);
    drawBlob(o.x, o.y, o.vy, o.color, 0.45, 1, null, now);
    g.globalAlpha = 0.8;
    g.fillStyle = BIOMES[biomeAt(o.y).i].ink;
    g.font = `800 ${12 * Math.max(1, sc)}px Nunito, sans-serif`;
    g.textAlign = 'center';
    g.fillText(o.name, sx(o.x), sy(o.y + R * 2.6));
    g.globalAlpha = 1;
  }
  {
    const extra = { squash: P.squash, jet: P.jet > 0, prop: P.prop > 0, shield: P.shield, spin: P.spin, blink: S.state === 'dying' };
    drawBlob(P.x, P.y, P.vy, '#ff7aa8', 1, P.face, extra, now);
    // copia en el borde opuesto al cruzar la pantalla
    if (P.x < R) drawBlob(P.x + W, P.y, P.vy, '#ff7aa8', 1, P.face, extra, now);
    if (P.x > W - R) drawBlob(P.x - W, P.y, P.vy, '#ff7aa8', 1, P.face, extra, now);
  }
  // bordes de la columna de juego en pantallas anchas
  if (ox > 0) {
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(ox - 2, 0, 2, vh);
    g.fillRect(ox + colW, 0, 2, vh);
  }

  if (S.state === 'play' || S.state === 'countdown') {
    $('h-score').textContent = S.score;
    $('h-best').textContent = Math.max(S.best, S.score);
    const pw = P.jet > 0 ? P.jet / 2.4 : P.prop > 0 ? P.prop / 3.2 : 0;
    $('power').hidden = !pw;
    if (pw) $('power').firstElementChild.style.transform = `scaleX(${pw})`;
    if (S.mode === 'online') sendState(now);
    engine(P.jet > 0 ? 1 : P.prop > 0 ? 0.5 : 0);
  } else engine(0);
}
let lastCount = 0;
function countPop(txt) {
  const el = $('count');
  el.textContent = txt;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  sound(txt.length > 1 ? 'go' : 'tick');
}

// ================= entrada =================
const keys = new Set();
addEventListener('keydown', (e) => {
  const d = G.dir(e);
  if (d === 'left' || d === 'right') {
    keys.add(d);
    e.preventDefault();
  }
  updateInput();
  if ((e.code === 'Space' || e.key === 'Enter') && S.state === 'over' && S.mode === 'solo') startSolo();
});
addEventListener('keyup', (e) => {
  const d = G.dir(e);
  if (d) keys.delete(d);
  updateInput();
});
let touchDir = 0;
cv.addEventListener('pointerdown', (e) => {
  audio();
  touchDir = e.clientX < vw / 2 ? -1 : 1;
  cv.setPointerCapture(e.pointerId);
  updateInput();
});
cv.addEventListener('pointermove', (e) => {
  if (!touchDir || e.pointerType === 'mouse') return;
  touchDir = e.clientX < vw / 2 ? -1 : 1;
  updateInput();
});
const endTouch = () => {
  touchDir = 0;
  updateInput();
};
cv.addEventListener('pointerup', endTouch);
cv.addEventListener('pointercancel', endTouch);
function updateInput() {
  S.input = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0) || touchDir;
}
let tiltValue = null;
addEventListener('deviceorientation', (e) => {
  if (e.gamma == null) return;
  // en horizontal, beta hace de "inclinación lateral"
  const landscape = Math.abs(screen.orientation?.angle ?? window.orientation ?? 0) === 90;
  tiltValue = landscape ? (e.beta ?? 0) * Math.sign(screen.orientation?.angle ?? 90) : e.gamma;
});
$('ctrl').onclick = async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.control = b.dataset.v;
  $$('#ctrl button').forEach((x) => x.classList.toggle('on', x === b));
  if (S.control === 'tilt' && typeof DeviceOrientationEvent?.requestPermission === 'function') {
    try {
      await DeviceOrientationEvent.requestPermission();
    } catch {}
  }
};

// ================= modos =================
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  const inGame = !id;
  G.gameplay(inGame); // en menús y fin de partida el portal puede mostrar un banner aparte
  $('hud').hidden = !inGame;
  if (!inGame) $('power').hidden = true;
}
function begin(seed) {
  newWorld(seed);
  show(null);
  $('others').innerHTML = '';
}
function startSolo() {
  audio();
  S.mode = 'solo';
  S.revived = false;
  others.clear();
  begin(Math.floor(Math.random() * 2 ** 31));
  S.state = 'play';
}
$('play-solo').onclick = startSolo;
$('over-again').onclick = () => {
  if (S.mode === 'online') {
    if (online.isHost) online.send({ t: 'rematch' });
  } else G.commercialBreak('otra-vez').then(startSolo); // pausa natural (por defecto sin anuncio)
};
$('over-menu').onclick = () => {
  if (S.mode === 'online') online.leave();
  S.mode = 'solo';
  S.state = 'menu';
  others.clear();
  show('home');
};
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  audio();
  show(go.dataset.go);
  if (go.dataset.go === 'online') $('on-name').value ||= defaultName();
});

// ================= online =================
let lastSent = 0;
function sendState(now) {
  if (now - lastSent < 80 || S.state !== 'play') return;
  lastSent = now;
  online.raw({ t: 'state', s: [Math.round(P.x), Math.round(P.y), Math.round(P.vy), S.score] });
}

function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('doodle', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'state') {
        const o = others.get(m.id);
        if (o) {
          [o.tx, o.ty, o.vy, o.score] = m.s;
          if (Math.abs(o.x - o.tx) > W / 2) o.x = o.tx; // cruzó el borde
        }
      } else if (m.t === 'finished') {
        const o = others.get(m.id);
        if (o) {
          o.dead = true;
          o.score = m.score;
        }
        renderOthers();
        if (S.state === 'over') renderRank();
      } else if (m.t === 'end') {
        S.results = m.results;
        if (S.state === 'over' || S.state === 'dying') {
          renderRank();
          $('over-again').textContent = online.isHost ? t('rematch') : t('waitRematch');
          $('over-again').disabled = !online.isHost;
          const place = m.results.findIndex((r) => r.id === online.myId) + 1;
          $('over-title').textContent = place === 1 ? t('win') : t('place', { n: place });
          if (place === 1) sound('win');
        }
      } else if (m.t === 'error') {
        $('on-status').textContent = netText(m.code);
        $('lobby-status').textContent = netText(m.code);
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = 'solo';
        S.state = 'menu';
        show('online');
      }
    },
  });
  return online;
}
$('on-create').onclick = () => {
  audio();
  ensureOnline().create($('on-name').value.trim() || defaultName());
};
$('on-join').onclick = () => {
  audio();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureOnline().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => online.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online.leave();
  show('online');
};
$('lobby-share').onclick = async () => {
  const r = await share('skyhop', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};

let raceKey = null;
function applyRoom(room) {
  S.mode = 'online';
  if (room.state === 'lobby' || !room.race) {
    raceKey = null;
    $('lobby-code').textContent = room.code;
    $('lobby-players').innerHTML = room.players
      .map((p) => `<li><i style="background:${p.color}"></i>${esc(p.name)}<small>${[p.id === online.myId ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
      .join('');
    $('lobby-start').hidden = !online.isHost;
    $('lobby-status').textContent = online.isHost ? '' : t('waitingHost');
    S.state = 'menu';
    show('lobby');
    return;
  }
  // arranca una carrera nueva
  const key = `${room.race.seed}:${room.race.startAt}`;
  if (key !== raceKey && room.state === 'playing') {
    raceKey = key;
    S.results = null;
    others.clear();
    for (const p of room.players) if (p.id !== online.myId) others.set(p.id, { name: p.name, color: p.color, x: W / 2, y: 40, tx: W / 2, ty: 40, vy: 0, score: 0, dead: false });
    begin(room.race.seed);
    S.startAt = room.race.startAt;
    S.state = 'countdown';
    lastCount = 0;
  }
  for (const r of room.race.results || []) {
    const o = others.get(r.id);
    if (o) {
      o.dead = true;
      o.score = r.score;
    }
  }
  if (room.state === 'finished' && S.state === 'over') {
    $('over-again').textContent = online.isHost ? t('rematch') : t('waitRematch');
    $('over-again').disabled = !online.isHost;
  }
  renderOthers();
}

function renderOthers() {
  if (S.mode !== 'online') return;
  $('others').innerHTML = [...others.values()].map((o) => `<div class="${o.dead ? 'dead' : ''}"><i style="background:${o.color}"></i>${esc(o.name)} · ${o.score} m</div>`).join('');
}
setInterval(renderOthers, 500);

function renderRank() {
  const list = S.results
    ? S.results.map((r) => ({ name: r.id === online.myId ? `${r.name} (${t('you')})` : r.name, color: r.color, score: r.score ?? 0, playing: false }))
    : [{ name: t('you'), color: '#ff7aa8', score: S.score, playing: false }, ...[...others.values()].map((o) => ({ name: o.name, color: o.color, score: o.score, playing: !o.dead }))].sort((a, b) => b.score - a.score);
  $('over-rank').innerHTML = list.map((r, i) => `<li><span>${i + 1}.</span><i style="width:12px;height:12px;border-radius:50%;background:${r.color}"></i>${esc(r.name)}<b>${r.score} m${r.playing ? ` · ${t('playing')}…` : ''}</b></li>`).join('');
}

// ================= sonido =================
let ac = null;
let eng = null;
function audio() {
  if (ac) return ac.state === 'suspended' && ac.resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) ac = new AC();
}
function tone(f0, f1, dur, type = 'sine', vol = 0.2, at = 0) {
  if (!ac || !G.prefs.volume.sfx) return;
  const o = ac.createOscillator();
  const gn = ac.createGain();
  const t0 = ac.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  gn.gain.setValueAtTime(vol * G.prefs.volume.sfx, t0);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
function sound(k, y = 0) {
  if (k === 'jump') {
    const f = 380 + ((y / 7) % 180);
    tone(f, f * 1.9, 0.12, 'sine', 0.18);
  } else if (k === 'spring') tone(300, 1300, 0.3, 'triangle', 0.2);
  else if (k === 'tramp') {
    tone(250, 1100, 0.4, 'square', 0.1);
    tone(500, 2200, 0.35, 'sine', 0.12, 0.05);
  } else if (k === 'crack') tone(300, 80, 0.2, 'sawtooth', 0.15);
  else if (k === 'stomp') {
    tone(500, 120, 0.15, 'square', 0.15);
    tone(900, 1400, 0.1, 'sine', 0.12, 0.08);
  } else if (k === 'pop') tone(1200, 300, 0.2, 'triangle', 0.18);
  else if (k === 'pick') [880, 1320].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.15, i * 0.07));
  else if (k === 'jet' || k === 'prop') tone(200, 800, 0.4, 'sawtooth', 0.08);
  else if (k === 'die') tone(900, 90, 1.1, 'sine', 0.2);
  else if (k === 'biome') [523, 659, 784].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.12, i * 0.1));
  else if (k === 'tick') tone(660, 660, 0.1, 'square', 0.08);
  else if (k === 'go') tone(990, 990, 0.25, 'square', 0.1);
  else if (k === 'win') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.15, i * 0.1));
}
/** Zumbido continuo del jetpack/hélice. */
function engine(level) {
  if (!ac) return;
  if (!eng && level > 0) {
    const o = ac.createOscillator();
    const f = ac.createBiquadFilter();
    const gn = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 90;
    f.type = 'lowpass';
    f.frequency.value = 600;
    gn.gain.value = 0;
    o.connect(f).connect(gn).connect(ac.destination);
    o.start();
    eng = { o, gn };
  }
  if (eng) {
    eng.gn.gain.setTargetAtTime(level * 0.06 * G.prefs.volume.sfx, ac.currentTime, 0.05);
    eng.o.frequency.setTargetAtTime(level > 0.7 ? 110 + Math.random() * 20 : 180, ac.currentTime, 0.05);
  }
}

// ================= arranque =================
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('ctrl-box').hidden = !G.prefs.touch;
  $('hint-keys').hidden = !!G.prefs.touch;
}, true);
G.onPause(() => ac?.suspend());
G.onResume(() => ac?.resume());
addEventListener('resize', resize);
resize();
newWorld(12345);
S.camY = 0;
S.state = 'menu';
requestAnimationFrame(frame);
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
if (/[?&]debug\b/.test(location.search)) window.__skyhop = { S, P, die };
G.gameplay(false);
G.ready();
