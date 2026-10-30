/* Chorrito — game.it
 * Tubos de vidrio con capas de colores: tocá uno para levantarlo y otro para trasvasar la tanda de arriba (si el de destino
 * está vacío o tiene arriba el mismo color y hay lugar). Dejá cada tubo de un solo color. Niveles que suben de a poco (hay
 * un resolvedor que da pistas y garantiza que todos tienen solución), el chorrito del día (el mismo para todos) y una carrera
 * online con el mismo nivel: el servidor rehace tus trasvases para validar. Motor y generador en shared/engine.js.
 */
import { CAP, generate, levelOf, solve, amount, pour, isSolved, settled, clone, stars as starsFor, encodeMoves, hashSeed, MAX_COLORS } from './shared/engine.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'chorrito';
const EPOCH = '2026-10-30';
const DAILY_COLORS = 10;
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Chorrito', en: 'Pour Sort' },
  tagline: { es: 'Pasá los colores de tubo en tubo hasta dejar cada uno de un solo color.', en: 'Pour the colors from tube to tube until each one holds a single color.' },
  play: { es: 'Jugar', en: 'Play' },
  playSub: { es: 'Nivel {n}', en: 'Level {n}' },
  playNew: { es: 'Empezar', en: 'Start' },
  daily: { es: 'Chorrito del día', en: 'Daily Pour' },
  dailySub: { es: 'n.º {n} · el mismo para todos', en: '#{n} · the same for everyone' },
  dailyGo: { es: 'n.º {n} · en curso', en: '#{n} · in progress' },
  dailyDone: { es: 'n.º {n} · ✓ {m} trasvases', en: '#{n} · ✓ {m} pours' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'carrera con el mismo nivel', en: 'race on the same level' },
  onlineLong: { es: 'Todos reciben el mismo nivel y gana el que lo resuelve primero. El servidor rehace tus trasvases para comprobarlo.', en: 'Everyone gets the same level and the first to solve it wins. The server replays your pours to check them.' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'entrar a una sala abierta', en: 'join an open room' },
  create: { es: 'Crear sala', en: 'Create room' },
  createSub: { es: 'privada con código', en: 'private, with a code' },
  join: { es: 'Entrar', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'Tocá el código para copiar el link', en: 'Tap the code to copy the link' },
  difficulty: { es: 'Colores', en: 'Colors' },
  d6: { es: '6 · fácil', en: '6 · easy' },
  d8: { es: '8', en: '8' },
  d10: { es: '10', en: '10' },
  d12: { es: '12 · difícil', en: '12 · hard' },
  startRace: { es: '¡Largar!', en: 'Start!' },
  leave: { es: 'Salir', en: 'Leave' },
  levels: { es: 'Niveles', en: 'Levels' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  back: { es: '← volver', en: '← back' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  symbols: { es: 'Símbolos en los colores', en: 'Symbols on colors' },
  on: { es: 'Sí', en: 'On' },
  off: { es: 'No', en: 'Off' },
  undo: { es: 'Deshacer', en: 'Undo' },
  restart: { es: 'Reiniciar', en: 'Restart' },
  hint: { es: 'Pista', en: 'Hint' },
  tube: { es: 'Tubo', en: 'Tube' },
  level: { es: 'Nivel {n}', en: 'Level {n}' },
  dailyTitle: { es: 'Chorrito del día', en: 'Daily Pour' },
  raceTitle: { es: 'Carrera', en: 'Race' },
  moves: { es: '{m} trasvases', en: '{m} pours' },
  noHint: { es: 'Desde acá no veo salida: probá deshacer.', en: 'I see no way out from here: try undo.' },
  noExtra: { es: 'Ya usaste el tubo extra.', en: 'You already used the extra tube.' },
  noMove: { es: 'Ahí no entra.', en: 'It does not fit there.' },
  extraAdded: { es: '¡Tubo extra!', en: 'Extra tube!' },
  hintShown: { es: 'Probá este trasvase.', en: 'Try this pour.' },
  // nivel resuelto
  winKicker: { es: '¡Resuelto!', en: 'Solved!' },
  winLevel: { es: 'Nivel {n} superado', en: 'Level {n} cleared' },
  winDaily: { es: '¡Chorrito del día!', en: 'Daily Pour solved!' },
  stMoves: { es: 'trasvases', en: 'pours' },
  stPar: { es: 'mejor del juego', en: 'game best' },
  stBest: { es: 'tu mejor', en: 'your best' },
  stTime: { es: 'tiempo', en: 'time' },
  stPlayed: { es: 'jugadas', en: 'played' },
  stStreak: { es: 'racha', en: 'streak' },
  stBestStreak: { es: 'mejor', en: 'best' },
  nextLevel: { es: 'Siguiente nivel', en: 'Next level' },
  retry: { es: 'Repetir', en: 'Retry' },
  nextDaily: { es: 'El próximo, en', en: 'Next one in' },
  share: { es: 'Compartir', en: 'Share' },
  sharedOk: { es: '¡Listo para pegar!', en: 'Ready to paste!' },
  // carrera
  ready: { es: 'Preparados…', en: 'Get ready…' },
  go: { es: '¡Ya!', en: 'Go!' },
  you: { es: 'vos', en: 'you' },
  win: { es: '¡Ganaste la carrera!', en: 'You won the race!' },
  place: { es: 'Terminaste {n}.º', en: 'You finished #{n}' },
  raceOver: { es: 'Fin de la carrera', en: 'Race over' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  dnf: { es: 'sin terminar · {d} %', en: 'unfinished · {d}%' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};

const RULES = {
  es: `<p>Cada <b>tubo</b> tiene capas de colores y entran <b>4</b> como mucho. Tocá un tubo para levantarlo y después tocá otro: la <b>tanda de arriba</b> (todas las capas seguidas del mismo color) pasa al segundo si está <b>vacío</b> o si arriba tiene <b>el mismo color</b>, hasta donde haya lugar.</p>
<p>Ganás cuando cada tubo queda <b>vacío o lleno de un solo color</b>. Hay siempre dos tubos vacíos para maniobrar.</p>
<h3>Ayudas</h3>
<p><b>Deshacer</b> vuelve atrás los trasvases que quieras, <b>Reiniciar</b> empieza de nuevo y la <b>Pista</b> te muestra un trasvase que lleva a la solución (el juego resuelve cada nivel antes de dártelo). Una vez por nivel podés sumar un <b>tubo extra</b>. Las estrellas salen de cuánto te acercás a la solución más corta que encuentra el juego.</p>
<h3>Modos</h3>
<p>Los <b>niveles</b> empiezan con 3 colores y llegan a 12. El <b>chorrito del día</b> es el mismo para todos y cuenta tus trasvases. En la <b>carrera online</b> todos reciben el mismo nivel y gana el primero en resolverlo.</p>`,
  en: `<p>Each <b>tube</b> holds layers of colors, <b>4</b> at most. Tap a tube to lift it, then tap another: the <b>top run</b> (all the layers in a row with the same color) pours into the second one if it is <b>empty</b> or has <b>the same color</b> on top, as far as there is room.</p>
<p>You win when every tube is <b>empty or full of a single color</b>. There are always two empty tubes to work with.</p>
<h3>Helpers</h3>
<p><b>Undo</b> takes back as many pours as you like, <b>Restart</b> begins again and <b>Hint</b> shows a pour that leads to the solution (the game solves every level before handing it to you). Once per level you can add an <b>extra tube</b>. Stars depend on how close you get to the shortest solution the game finds.</p>
<h3>Modes</h3>
<p><b>Levels</b> start with 3 colors and go up to 12. The <b>daily pour</b> is the same for everyone and counts your pours. In the <b>online race</b> everyone gets the same level and the first to solve it wins.</p>`,
};

// ---------------------------------------------------------------- guardado
const load = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`));
    return v ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};
/** progress: { level: el nivel al que llegó (el primero sin resolver), stars: { n: estrellas }, best: { n: trasvases } } */
const PROG = { level: 1, stars: {}, best: {}, ...load('progress', {}) };
const OPTS = { symbols: 0, ...load('opts', {}) };

// ---------------------------------------------------------------- colores y símbolos
const PALETTE = ['#ff4d5a', '#ff9f1c', '#ffd23c', '#8be04e', '#1faa59', '#22c7c0', '#3a86ff', '#6a4cff', '#d04cff', '#ff6fb1', '#9a6a4a', '#aab4c2'];
const dark = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
/** Un dibujito distinto por color (para quien no distingue bien los colores): rellena y, si `stroke`, perfila. */
function symbol(c, k, x, y, r, stroke) {
  c.beginPath();
  switch (k % 12) {
    case 0: c.arc(x, y, r, 0, Math.PI * 2); break; // círculo
    case 1: c.moveTo(x, y - r); c.lineTo(x + r, y + r * 0.8); c.lineTo(x - r, y + r * 0.8); c.closePath(); break; // triángulo
    case 2: c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break; // cuadrado
    case 3: c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); break; // rombo
    case 4: for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); break; // estrella
    case 5: c.rect(x - r * 0.28, y - r, r * 0.56, r * 2); c.rect(x - r, y - r * 0.28, r * 2, r * 0.56); break; // cruz
    case 6: c.moveTo(x, y + r); c.lineTo(x + r, y - r * 0.7); c.lineTo(x - r, y - r * 0.7); c.closePath(); break; // triángulo invertido
    case 7: for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); break; // hexágono
    case 8: c.arc(x, y, r, 0, Math.PI * 2); c.moveTo(x + r * 0.45, y); c.arc(x, y, r * 0.45, 0, Math.PI * 2, true); break; // anillo
    case 9: c.moveTo(x, y + r); c.bezierCurveTo(x + r * 1.5, y - r * 0.3, x + r * 0.7, y - r, x, y - r * 0.3); c.bezierCurveTo(x - r * 0.7, y - r, x - r * 1.5, y - r * 0.3, x, y + r); break; // corazón
    case 10: c.moveTo(x + r * 0.2, y - r); c.lineTo(x - r * 0.6, y + r * 0.1); c.lineTo(x, y + r * 0.1); c.lineTo(x - r * 0.2, y + r); c.lineTo(x + r * 0.6, y - r * 0.1); c.lineTo(x, y - r * 0.1); c.closePath(); break; // rayo
    default: c.arc(x, y, r, Math.PI * 0.2, Math.PI * 1.8); c.arc(x + r * 0.45, y, r * 0.8, Math.PI * 1.6, Math.PI * 0.4, true); // luna
  }
  c.fill();
  if (stroke) c.stroke();
}

// ---------------------------------------------------------------- sonidos
let pourSfxAt = 0;
const sfx = {
  pick: () => tone(660, 880, 0.06, { type: 'triangle', vol: 0.06 }),
  drop: () => tone(520, 380, 0.07, { type: 'triangle', vol: 0.05 }),
  pour(dur) {
    const now = performance.now();
    if (now - pourSfxAt < 60) return;
    pourSfxAt = now;
    noise(dur, { freq: 1500, q: 0.8, vol: 0.06, sweep: 600 });
    const n = Math.round(dur * 9);
    for (let i = 0; i < n; i++) tone(420 + Math.random() * 500, 700 + Math.random() * 700, 0.05, { type: 'sine', vol: 0.025, at: 0.03 + (i / n) * dur });
  },
  done: (n) => notes([659.25 + n * 40, 880 + n * 40, 1174.66 + n * 40].map((f) => Math.min(f, 2000)), { step: 0.06, dur: 0.18, type: 'triangle', vol: 0.07 }),
  bad: () => tone(240, 170, 0.12, { type: 'sawtooth', vol: 0.04 }),
  undo: () => tone(480, 320, 0.08, { type: 'triangle', vol: 0.05 }),
  hint: () => notes([784, 988], { step: 0.07, dur: 0.12, type: 'sine', vol: 0.05 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], { step: 0.09, dur: 0.28, type: 'triangle', vol: 0.09 }),
  star: (i) => tone(700 + i * 160, 900 + i * 160, 0.18, { type: 'triangle', vol: 0.07 }),
  tick: () => tone(880, 880, 0.08, { type: 'square', vol: 0.04 }),
  go: () => notes([880, 1318.5], { step: 0.08, dur: 0.2, type: 'square', vol: 0.06 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
};

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // level | daily | race
  n: 1,
  tubes: [],
  cap: CAP,
  par: 0,
  initial: [],
  hist: [], // [{ a, b, k }]
  sel: -1,
  anim: null,
  queue: [],
  extra: 0,
  maxExtra: 1,
  solved: false,
  hint: null,
  hintAt: 0,
  startedAt: 0,
  elapsed: 0,
  paused: false,
  daily: null,
  race: null,
  parts: [], // partículas
  done: new Set(), // tubos que ya estaban completos (para el sonido y el brillo)
  glow: new Map(),
};
/** En una carrera no se juega durante la cuenta regresiva ni después de terminar. */
const canPlay = () => !(S.mode === 'race' && S.race && S.race.phase !== 'play');
const cv = $('cv');
const ctx = cv.getContext('2d');
const L = { W: 0, H: 0, dpr: 1, pos: [], tw: 40, uh: 40, th: 190, bottomPad: 6, topPad: 22 };
const reduced = () => !!G.prefs?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode);
}
function setPlaying(on) {
  document.body.classList.toggle('playing', on);
  $('top').hidden = !on;
  $('tools').hidden = !on;
  if (on) requestAnimationFrame(resize);
}
let toastT = 0;
function toast(txt, ms = 1800) {
  const el = $('toast');
  el.textContent = txt;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), ms);
}
function confetti() {
  if (reduced()) return;
  const cols = PALETTE.concat(['#fff']);
  let html = '';
  for (let i = 0; i < 54; i++) html += `<i style="--x:${((Math.random() - 0.5) * 640).toFixed(0)}px;--y:${(120 + Math.random() * 420).toFixed(0)}px;--r:${((Math.random() - 0.5) * 900).toFixed(0)}deg;--c:${cols[i % cols.length]};--d:${(Math.random() * 0.3).toFixed(2)}s;left:${38 + Math.random() * 24}%"></i>`;
  $('confetti').innerHTML = html;
  setTimeout(() => ($('confetti').innerHTML = ''), 2500);
}

// ---------------------------------------------------------------- medidas
function resize() {
  const r = cv.getBoundingClientRect();
  L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  L.W = Math.max(1, Math.round(r.width));
  L.H = Math.max(1, Math.round(r.height));
  cv.width = Math.round(L.W * L.dpr);
  cv.height = Math.round(L.H * L.dpr);
  layout();
}
/** Acomoda los tubos en 1, 2 o 3 filas, las que dejen las capas más grandes (sin que queden petisos si el alto no alcanza). */
function layout() {
  const n = S.tubes.length || 6;
  const cap = S.cap;
  // en celulares apaisados la barra de arriba flota sobre el tablero y las herramientas pasan al costado
  const padTop = matchMedia('(max-height: 520px) and (orientation: landscape)').matches ? 46 : 0;
  const H = L.H - padTop;
  let best = null;
  for (let rows = 1; rows <= 3; rows++) {
    const cols = Math.ceil(n / rows);
    const twMax = Math.min(L.W / (cols + (cols + 1) * 0.4), 78);
    const uhOf = (tw) => Math.min(tw * 0.98, ((H - (rows + 1) * tw * 0.55) / rows - tw * 0.12) / (cap + 0.5));
    let tw = twMax;
    if (tw > uhOf(tw) * 1.15) {
      let lo = 4, hi = twMax;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (mid > uhOf(mid) * 1.15) hi = mid;
        else lo = mid;
      }
      tw = lo;
    }
    const uh = uhOf(tw);
    if (uh > 6 && (!best || uh > best.uh + 0.5)) best = { rows, cols, tw, uh, gapY: tw * 0.55 };
  }
  if (!best) best = { rows: 1, cols: n, tw: 30, uh: 30, gapY: 12 };
  const { rows, cols, tw, uh } = best;
  L.tw = tw;
  L.uh = uh;
  L.bottomPad = tw * 0.12;
  L.topPad = uh * 0.5;
  L.th = L.bottomPad + cap * uh + L.topPad;
  const gapX = (L.W - cols * tw) / (cols + 1);
  const totalH = rows * L.th + (rows - 1) * best.gapY;
  const top = padTop + (H - totalH) / 2 + L.th;
  L.pos = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    const col = i % cols;
    const rowW = inRow * tw + (inRow - 1) * gapX;
    const x = (L.W - rowW) / 2 + col * (tw + gapX) + tw / 2;
    L.pos.push({ x, y: top + row * (L.th + best.gapY) });
  }
  buildChamber();
}

// ---------------------------------------------------------------- dibujo
function tubePath(c, tw, th) {
  const x = -tw / 2, r = tw / 2, k = 6;
  c.beginPath();
  c.moveTo(x, -th + k);
  c.quadraticCurveTo(x, -th, x + k, -th);
  c.lineTo(x + tw - k, -th);
  c.quadraticCurveTo(x + tw, -th, x + tw, -th + k);
  c.lineTo(x + tw, -r);
  c.arc(0, -r, r, 0, Math.PI, false);
  c.closePath();
}

/**
 * El interior del tubo, donde va el líquido, como polígono (origen: centro de la base; hacia arriba es negativo): paredes
 * rectas y fondo redondeado que arranca un poco más arriba (el grosor del vidrio). Con él se reparte el líquido por volumen
 * cuando el tubo está inclinado, y la superficie queda siempre horizontal.
 */
function buildChamber() {
  const ri = (L.tw - 4) / 2;
  const top = -(L.th - 2);
  const a1 = Math.asin(clamp((ri - L.bottomPad) / ri, -1, 1));
  const pts = [[-ri, top], [ri, top]];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const a = (a1 * i) / N;
    pts.push([ri * Math.cos(a), -ri + ri * Math.sin(a)]);
  }
  for (let i = 0; i <= N; i++) {
    const a = Math.PI - a1 + (a1 * i) / N;
    pts.push([ri * Math.cos(a), -ri + ri * Math.sin(a)]);
  }
  L.chamber = pts;
  L.ri = ri;
}
const rotPts = (pts, th) => {
  const c = Math.cos(th), s = Math.sin(th);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
};
/** Área de la parte del polígono (convexo) que queda más abajo en pantalla que la altura `level`. */
function areaBelow(P, level) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const ia = a[1] >= level, ib = b[1] >= level;
    if (ia) out.push(a);
    if (ia !== ib) {
      const k = (level - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * k, level]);
    }
  }
  let s = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}
/** Volumen de `n` capas de líquido con el tubo parado. */
const volumeOf = (n) => areaBelow(L.chamber, -(L.bottomPad + n * L.uh));
/** La altura de la superficie de un líquido de volumen `v` en el tubo inclinado `P` (ya rotado). */
function levelFor(P, v) {
  let lo = Infinity, hi = -Infinity;
  for (const p of P) {
    lo = Math.min(lo, p[1]);
    hi = Math.max(hi, p[1]);
  }
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (areaBelow(P, mid) > v) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** Hasta qué ángulo se puede inclinar un tubo con `n` capas antes de que el líquido llegue al borde y empiece a salir. */
function tiltFor(n) {
  const v = volumeOf(n);
  const lx = L.ri, ly = -(L.th - 2);
  let lo = 0, hi = 1.75;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const cap = areaBelow(rotPts(L.chamber, mid), lx * Math.sin(mid) + ly * Math.cos(mid));
    if (cap > v) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Dibuja un tubo con sus capas (colores y alturas en capas, de abajo hacia arriba); el origen es el centro de la base y
 * `opts.tilt` cuánto está inclinado (el líquido siempre queda horizontal).
 */
function drawTube(c, layers, opts = {}) {
  const { tw, uh, th } = L;
  const tilt = opts.tilt || 0;
  const t = performance.now() / 1000;
  c.save();
  // vidrio de atrás
  tubePath(c, tw, th);
  c.fillStyle = 'rgba(214,236,255,0.16)';
  c.fill();
  // el líquido, recortado al interior
  c.save();
  c.beginPath();
  L.chamber.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.clip();
  const BIG = th * 2;
  const P = tilt ? rotPts(L.chamber, Math.abs(tilt)) : null;
  const cs = Math.cos(-tilt), sn = Math.sin(-tilt);
  const toLocal = (x, y) => [x * cs - y * sn, x * sn + y * cs];
  let acc = 0;
  let yBot = BIG;
  layers.forEach((ly, i) => {
    acc += ly.h;
    const yTop = tilt ? levelFor(P, volumeOf(acc)) : -(L.bottomPad + acc * uh);
    const col = PALETTE[ly.c % PALETTE.length];
    const wave = i === layers.length - 1 && !tilt ? Math.sin(t * 2.4 + (opts.seed || 0)) * 1.1 : 0;
    const g = c.createLinearGradient(-tw / 2, 0, tw / 2, 0);
    g.addColorStop(0, dark(col, 0.82));
    g.addColorStop(0.35, col);
    g.addColorStop(1, dark(col, 0.78));
    c.fillStyle = g;
    c.beginPath();
    [[-BIG, yTop - wave], [BIG, yTop + wave], [BIG, yBot + 1], [-BIG, yBot + 1]].forEach(([x, y], k) => {
      const [lx, ly2] = toLocal(x, y);
      if (k) c.lineTo(lx, ly2);
      else c.moveTo(lx, ly2);
    });
    c.closePath();
    c.fill();
    // brillo de la superficie
    c.strokeStyle = 'rgba(255,255,255,0.28)';
    c.lineWidth = 2;
    c.beginPath();
    const [x1, y1] = toLocal(-BIG, yTop - wave);
    const [x2, y2] = toLocal(BIG, yTop + wave);
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    if (OPTS.symbols && !tilt && ly.h >= 0.9) {
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 1.5;
      symbol(c, ly.c, 0, -(L.bottomPad + (acc - ly.h / 2) * uh), Math.min(uh, tw) * 0.27, true);
    }
    yBot = yTop;
  });
  c.restore();
  // reflejo del vidrio
  const gl = c.createLinearGradient(-tw / 2, 0, tw / 2, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0.3)');
  gl.addColorStop(0.28, 'rgba(255,255,255,0.05)');
  gl.addColorStop(0.8, 'rgba(255,255,255,0)');
  gl.addColorStop(1, 'rgba(255,255,255,0.14)');
  c.fillStyle = gl;
  tubePath(c, tw, th);
  c.fill();
  // borde
  tubePath(c, tw, th);
  c.lineWidth = Math.max(2.5, tw * 0.06);
  c.strokeStyle = opts.glow ? `rgba(255,224,110,${0.75 + 0.25 * Math.sin(t * 6)})` : opts.sel ? '#fff' : 'rgba(235,246,255,0.86)';
  if (opts.glow || opts.sel) {
    c.shadowColor = opts.glow ? '#ffd23c' : '#bfe1ff';
    c.shadowBlur = opts.glow ? 16 : 10;
  }
  c.stroke();
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(-tw / 2 + 4, -th + 1, tw - 8, 2);
  c.restore();
  // un tubo completo lleva tapa
  if (opts.cap >= 0) {
    c.save();
    c.fillStyle = PALETTE[opts.cap % PALETTE.length];
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2.5;
    const w = tw * 0.9, h = uh * 0.3;
    c.beginPath();
    c.roundRect(-w / 2, -th - h * 0.5, w, h, 6);
    c.fill();
    c.stroke();
    c.restore();
  }
}

/** Las capas de un tubo tal como se ven: las que acaban de pasar crecen en el destino y se achican en el origen. */
function layersOf(i) {
  const an = S.anim;
  const out = S.tubes[i].map((c) => ({ c, h: 1 }));
  if (an && an.k) {
    if (i === an.b) for (let j = out.length - an.k; j < out.length; j++) out[j].h = an.p;
    if (i === an.a) for (let j = 0; j < an.k; j++) out.push({ c: an.color, h: 1 - an.p });
  }
  return out;
}

function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
  frame.last = now;
  if (!S.paused) update(dt);
  draw(now / 1000);
  requestAnimationFrame(frame);
}

function update(dt) {
  const an = S.anim;
  if (an) {
    an.t += dt * (S.queue.length ? 1.8 : 1);
    const T = an.T;
    // tres fases: ir hasta la boca del otro tubo, verter y volver
    an.go = Math.min(1, an.t / T.go);
    an.p = clamp((an.t - T.go) / T.pour, 0, 1);
    an.back = clamp((an.t - T.go - T.pour) / T.back, 0, 1);
    an.th = tiltFor(S.tubes[an.a].length + an.k * (1 - an.p));
    if (!an.sound && an.t >= T.go) {
      an.sound = true;
      sfx.pour(T.pour);
    }
    if (an.t >= T.go + T.pour + T.back) endAnim();
  }
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
    if (p.life <= 0) S.parts.splice(i, 1);
  }
  for (const [k, v] of S.glow) {
    if (v - dt <= 0) S.glow.delete(k);
    else S.glow.set(k, v - dt);
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
/** Dónde está el tubo `i` (levantado si está elegido, o de viaje si está vertiendo) y cuánto inclinado. */
function poseOf(i) {
  const base = L.pos[i];
  if (!base) return { x: 0, y: 0, rot: 0 };
  const an = S.anim;
  if (an && an.a === i) {
    const tgt = L.pos[an.b];
    const dir = Math.sign(tgt.x - base.x) || 1;
    const theta = an.th * dir;
    const c = Math.cos(theta), s = Math.sin(theta);
    // la esquina del borde del lado del destino tiene que quedar justo arriba de la boca del otro tubo
    const lx = dir * L.ri, ly = -(L.th - 2);
    const tx = tgt.x - dir * L.tw * 0.1 - (lx * c - ly * s);
    const ty = tgt.y - L.th - L.uh * 0.3 - (lx * s + ly * c);
    const g = easeInOut(an.go), bk = easeInOut(an.back);
    const e = g * (1 - bk);
    return { x: lerp(base.x, tx, e), y: lerp(base.y, ty, e) - (1 - g) * (1 - bk) * L.uh * 0.55, rot: theta * e };
  }
  return { x: base.x, y: S.sel === i ? base.y - L.uh * 0.55 : base.y, rot: 0 };
}

function draw(now) {
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  ctx.clearRect(0, 0, L.W, L.H);
  if (!S.mode || !L.chamber) return;
  const an = S.anim;
  const order = S.tubes.map((_, i) => i);
  if (an) order.sort((a, b) => (a === an.a ? 1 : 0) - (b === an.a ? 1 : 0)); // el que vierte va arriba de todo
  for (const i of order) {
    const pz = poseOf(i);
    const base = L.pos[i];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + 3, L.tw * 0.56, L.tw * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(pz.x, pz.y);
    ctx.rotate(pz.rot);
    const tb = S.tubes[i];
    const busy = an && (an.a === i || an.b === i);
    const done = tb.length === S.cap && tb.every((c) => c === tb[0]);
    const hinted = S.hint && (S.hint[0] === i || S.hint[1] === i) && now * 1000 - S.hintAt < 6000;
    drawTube(ctx, layersOf(i), { glow: hinted || (S.glow.get(i) || 0) > 0, sel: S.sel === i, cap: done && !busy ? tb[0] : -1, seed: i * 1.7, tilt: pz.rot });
    ctx.restore();
  }
  // el chorro, del borde del que vierte a la superficie del otro
  if (an && an.go >= 1 && an.p > 0.001 && an.p < 0.999) {
    const pa = poseOf(an.a);
    const tgt = L.pos[an.b];
    const dir = Math.sign(tgt.x - L.pos[an.a].x) || 1;
    const c = Math.cos(pa.rot), s = Math.sin(pa.rot);
    const lx = dir * L.ri, ly = -(L.th - 2);
    const x0 = pa.x + lx * c - ly * s;
    const y0 = pa.y + lx * s + ly * c;
    const surface = tgt.y - L.bottomPad - (S.tubes[an.b].length - an.k + an.k * an.p) * L.uh;
    const col = PALETTE[an.color % PALETTE.length];
    const w = Math.max(4, L.tw * 0.16);
    const x1 = x0 + dir * L.tw * 0.04;
    const ym = (y0 + surface) / 2;
    ctx.save();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x0 - w / 2, y0);
    ctx.lineTo(x0 + w / 2, y0);
    ctx.quadraticCurveTo(x1 + w * 0.52, ym, x1 + w * 0.34, surface);
    ctx.lineTo(x1 - w * 0.34, surface);
    ctx.quadraticCurveTo(x1 - w * 0.52, ym, x0 - w / 2, y0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(x1 - w * 0.18, y0, w * 0.14, Math.max(0, surface - y0));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x1, surface, w * 0.95, w * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 4; k++) {
      const a = now * 11 + k * 1.9;
      ctx.beginPath();
      ctx.arc(x1 + Math.sin(a) * w * 1.1, surface - Math.abs(Math.cos(a * 1.3)) * w * 1.3, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const p of S.parts) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // la flecha de la pista
  if (S.hint && now * 1000 - S.hintAt < 6000 && !an) {
    const to = L.pos[S.hint[1]];
    const ax = to.x, ay = to.y - L.th - L.uh * 0.9 + Math.sin(now * 7) * 4;
    ctx.save();
    ctx.fillStyle = '#ffd23c';
    ctx.strokeStyle = '#3b2a00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 12);
    ctx.lineTo(ax - 11, ay - 6);
    ctx.lineTo(ax + 11, ay - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function burst(i, color) {
  const p = L.pos[i];
  if (!p || reduced()) return;
  const col = PALETTE[color % PALETTE.length];
  for (let k = 0; k < 16; k++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 140;
    S.parts.push({ x: p.x, y: p.y - L.th, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: 2 + Math.random() * 2.6, c: Math.random() < 0.5 ? col : '#fff', life: 0.9, max: 0.9 });
  }
}

// ---------------------------------------------------------------- jugadas
function hit(px, py) {
  let best = -1;
  let bd = 1e9;
  for (let i = 0; i < L.pos.length; i++) {
    const p = L.pos[i];
    const lift = S.sel === i ? L.uh * 0.55 : 0;
    const left = p.x - L.tw * 0.7, right = p.x + L.tw * 0.7, top = p.y - L.th - lift - L.uh * 0.5, bot = p.y + L.tw * 0.3;
    if (px >= left && px <= right && py >= top && py <= bot) {
      const d = Math.abs(px - p.x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  return best;
}
cv.addEventListener('pointerdown', (e) => {
  if (!S.mode || S.paused || S.solved || !canPlay() || $$('.screen.on').length) return;
  unlock();
  const r = cv.getBoundingClientRect();
  tap(hit(e.clientX - r.left, e.clientY - r.top));
});

function tap(i) {
  if (i < 0) {
    if (S.sel >= 0) {
      S.sel = -1;
      sfx.drop();
    }
    return;
  }
  S.hint = null;
  if (S.sel < 0) {
    if (!S.tubes[i].length) return sfx.bad();
    S.sel = i;
    sfx.pick();
    return;
  }
  if (S.sel === i) {
    S.sel = -1;
    sfx.drop();
    return;
  }
  const a = S.sel;
  if (!amount(S.tubes, a, i, S.cap)) {
    // si el tubo tocado tiene algo, pasa a ser el elegido; si no, error
    S.sel = S.tubes[i].length ? i : -1;
    if (S.sel < 0) toast(t('noMove'), 900);
    S.sel === i ? sfx.pick() : sfx.bad();
    return;
  }
  S.sel = -1;
  doPour(a, i);
}

/** Hace el trasvase en los datos y lo anima (los siguientes se encolan). */
function doPour(a, b) {
  const color = S.tubes[a][S.tubes[a].length - 1];
  const k = pour(S.tubes, a, b, S.cap);
  if (!k) return;
  S.hist.push({ a, b, k, color });
  const job = { a, b, k, color, t: 0, p: 0, go: 0, back: 0, sound: false, T: { go: 0.22, pour: 0.18 + 0.2 * k, back: 0.2 } };
  if (reduced()) job.T = { go: 0.05, pour: 0.1, back: 0.05 };
  if (S.anim) S.queue.push(job);
  else S.anim = job;
  renderInfo();
  sendProgress();
}
function endAnim() {
  const an = S.anim;
  S.anim = null;
  // ¿quedó completo el destino?
  const tb = S.tubes[an.b];
  if (tb.length === S.cap && tb.every((c) => c === tb[0]) && !S.done.has(an.b)) {
    S.done.add(an.b);
    S.glow.set(an.b, 0.9);
    burst(an.b, tb[0]);
    sfx.done(S.done.size);
  }
  // los tubos que dejaron de estar completos (por deshacer) salen de la lista
  for (const i of [...S.done]) {
    const t2 = S.tubes[i];
    if (!(t2 && t2.length === S.cap && t2.every((c) => c === t2[0]))) S.done.delete(i);
  }
  if (S.queue.length) S.anim = S.queue.shift();
  else if (isSolved(S.tubes, S.cap)) onSolved();
  renderInfo();
}

function renderInfo() {
  const lvl = S.mode === 'daily' ? t('dailyTitle') : S.mode === 'race' ? t('raceTitle') : t('level', { n: S.n });
  $('lvl').textContent = lvl;
  $('moves').textContent = t('moves', { m: S.hist.length });
  $('t-undo').disabled = !S.hist.length || !!S.anim || S.solved;
  $('t-restart').disabled = !S.hist.length || S.solved;
  $('t-hint').disabled = S.mode === 'race' || S.solved;
  const canExtra = S.mode === 'level' && S.extra < S.maxExtra && !S.solved;
  $('t-tube').disabled = !canExtra;
  $('t-tube-n').textContent = S.mode === 'level' ? String(S.maxExtra - S.extra) : '';
  $('t-tube-n').hidden = S.mode !== 'level';
}

function undo() {
  if (!S.hist.length || S.anim || S.queue.length || S.solved || !canPlay()) return;
  const h = S.hist.pop();
  for (let i = 0; i < h.k; i++) {
    S.tubes[h.b].pop();
    S.tubes[h.a].push(h.color);
  }
  S.sel = -1;
  S.hint = null;
  S.done.delete(h.b);
  sfx.undo();
  renderInfo();
  sendProgress();
}
function restart() {
  if (!S.hist.length || S.solved || !canPlay()) return;
  S.tubes = clone(S.initial);
  if (S.extra) for (let i = 0; i < S.extra; i++) S.tubes.push([]);
  S.hist = [];
  S.sel = -1;
  S.anim = null;
  S.queue = [];
  S.hint = null;
  S.done = new Set();
  sfx.undo();
  renderInfo();
  sendProgress();
}
function hint() {
  if (S.mode === 'race' || S.anim || S.solved) return;
  const path = solve(S.tubes, S.cap, { maxNodes: 50000 });
  if (!path || !path.length) return toast(t('noHint'), 2400);
  S.hint = path[0];
  S.hintAt = performance.now();
  S.sel = -1;
  sfx.hint();
  toast(t('hintShown'), 1500);
}
function addTube() {
  if (S.mode !== 'level' || S.extra >= S.maxExtra || S.solved) return S.mode === 'level' && !S.solved && toast(t('noExtra'), 1200);
  S.tubes.push([]);
  S.extra++;
  layout();
  sfx.pick();
  toast(t('extraAdded'), 1200);
  renderInfo();
}
$('t-undo').onclick = undo;
$('t-restart').onclick = restart;
$('t-hint').onclick = hint;
$('t-tube').onclick = addTube;

// ---------------------------------------------------------------- empezar
function begin(lv, extra = {}) {
  S.cap = lv.cap;
  S.tubes = clone(lv.tubes);
  S.initial = clone(lv.tubes);
  S.par = lv.par;
  S.hist = [];
  S.sel = -1;
  S.anim = null;
  S.queue = [];
  S.extra = 0;
  S.maxExtra = 1;
  S.solved = false;
  S.hint = null;
  S.parts = [];
  S.done = new Set();
  S.glow = new Map();
  S.startedAt = performance.now();
  S.base = settled(lv.tubes);
  S.max = lv.cap * new Set(lv.tubes.flat()).size;
  Object.assign(S, extra);
  $('race').hidden = S.mode !== 'race';
  layout();
  setPlaying(true);
  show(null);
  renderInfo();
}
function startLevel(n) {
  const p = levelOf(n);
  const lv = generate(p.seed, { colors: p.colors, extra: p.extra });
  S.mode = 'level';
  S.n = n;
  begin(lv);
}
function dailyInfo() {
  const date = today();
  return { date, n: dayNumber(EPOCH, date), rec: loadDay(ID, 'all', date) };
}
function startDaily() {
  const d = dailyInfo();
  if (d.rec) return showWin(true);
  S.daily = d;
  markPortal(ID, { date: d.date, done: false, won: false });
  const lv = generate(hashSeed(`chorrito-daily-${d.date}`), { colors: DAILY_COLORS, extra: 2 });
  S.mode = 'daily';
  begin(lv);
  S.maxExtra = 0;
  renderInfo();
  // partida en curso del día guardada
  const sv = load('dsave', null);
  if (sv && sv.date === d.date && typeof sv.moves === 'string') {
    for (let i = 0; i + 1 < sv.moves.length; i += 2) {
      const a = sv.moves.charCodeAt(i) - 97, b = sv.moves.charCodeAt(i + 1) - 97;
      const color = S.tubes[a]?.[S.tubes[a].length - 1];
      const k = pour(S.tubes, a, b, S.cap);
      if (k) {
        S.hist.push({ a, b, k, color });
        const tb = S.tubes[b];
        if (tb.length === S.cap && tb.every((c) => c === tb[0])) S.done.add(b);
      }
    }
    renderInfo();
  }
}
const saveDaily = () => S.mode === 'daily' && !S.solved && S.hist.length && save('dsave', { date: S.daily.date, moves: encodeMoves(S.hist.map((h) => [h.a, h.b])) });

// ---------------------------------------------------------------- nivel resuelto
function onSolved() {
  if (S.solved) return;
  S.solved = true;
  S.sel = -1;
  S.elapsed = Math.round(performance.now() - S.startedAt);
  const moves = S.hist.length;
  renderInfo();
  if (S.mode === 'race') return finishRace();
  sfx.win();
  confetti();
  if (S.mode === 'level') {
    const st = starsFor(moves, S.par);
    PROG.stars[S.n] = Math.max(PROG.stars[S.n] || 0, st);
    PROG.best[S.n] = Math.min(PROG.best[S.n] || 1e9, moves);
    PROG.level = Math.max(PROG.level, S.n + 1);
    save('progress', PROG);
  } else if (S.mode === 'daily') {
    const d = S.daily;
    const st = starsFor(moves, S.par);
    const stats = record(ID, 'all', { date: d.date, won: true, score: clamp(st - 1, 0, 2) });
    saveDay(ID, 'all', { moves, par: S.par, stars: st, time: S.elapsed }, d.date);
    markPortal(ID, { date: d.date, done: true, won: true, streak: stats.streak });
    save('dsave', null);
  }
  setTimeout(() => S.solved && showWin(false), reduced() ? 300 : 1100);
}
let dayTimer = 0;
function showWin(fromDaily) {
  const rec = fromDaily ? loadDay(ID, 'all', today()) : null;
  const moves = rec ? rec.moves : S.hist.length;
  const isDaily = fromDaily || S.mode === 'daily';
  const par = rec ? rec.par : S.par;
  const st = starsFor(moves, par);
  const dayShown = today();
  $('win-kicker').textContent = isDaily ? t('winDaily') : t('winKicker');
  $('win-title').textContent = isDaily ? t('dailyTitle') + ' · ' + t('moves', { m: moves }) : t('winLevel', { n: S.n });
  $('win-stars').innerHTML = [0, 1, 2].map((i) => `<i class="${i < st ? 'on' : ''}" style="--d:${0.2 + i * 0.22}s"></i>`).join('');
  for (let i = 0; i < st; i++) setTimeout(() => sfx.star(i), 250 + i * 220);
  const parts = [[moves, t('stMoves')]];
  if (!isDaily) parts.push([PROG.best[S.n] ?? moves, t('stBest')]);
  parts.push([par, t('stPar')]);
  $('win-stats').innerHTML = parts.map(([v, k]) => `<span><b>${esc(v)}</b><small>${esc(k)}</small></span>`).join('');
  $('win-stats').style.gridTemplateColumns = `repeat(${parts.length}, 1fr)`;
  $('win-day').hidden = !isDaily;
  $('win-next').hidden = !isDaily;
  $('b-share').hidden = !isDaily;
  clearInterval(dayTimer);
  if (isDaily) {
    const stt = loadStats(ID, 'all');
    $('win-day').innerHTML = [
      [stt.played, t('stPlayed')],
      [stt.streak, t('stStreak')],
      [Math.max(stt.best || 0, stt.streak), t('stBestStreak')],
    ]
      .map(([v, k]) => `<span><b>${v}</b><small>${k}</small></span>`)
      .join('');
    const tick = () => {
      $('win-clock').textContent = fmtClock(msUntilNext());
      if (today() !== dayShown) {
        clearInterval(dayTimer);
        refreshHome();
      }
    };
    tick();
    dayTimer = setInterval(tick, 1000);
  }
  $('b-next').hidden = isDaily;
  $('b-retry').hidden = isDaily;
  $('b-next-t').textContent = t('nextLevel');
  $('win-status').textContent = '';
  show('win');
}
$('b-next').onclick = () => startLevel(S.n + 1);
$('b-retry').onclick = () => startLevel(S.n);
$('b-win-menu').onclick = () => toMenu();
$('b-share').onclick = async () => {
  const rec = loadDay(ID, 'all', today());
  if (!rec) return;
  const d = dailyInfo();
  const r = await share(`game.it · ${t('title')} #${d.n}\n🧪 ${t('moves', { m: rec.moves })} ${'⭐'.repeat(starsFor(rec.moves, rec.par))}\n${shareLink(ID)}`);
  $('win-status').textContent = r === 'failed' ? '' : t('sharedOk');
};

// ---------------------------------------------------------------- niveles
let lvPage = 0;
const PER_PAGE = 20;
function renderLevels() {
  const cur = PROG.level;
  const pages = Math.max(1, Math.ceil(Math.max(cur + 10, PER_PAGE) / PER_PAGE));
  lvPage = clamp(lvPage, 0, pages - 1);
  const html = [];
  for (let k = 0; k < PER_PAGE; k++) {
    const n = lvPage * PER_PAGE + k + 1;
    const locked = n > cur;
    const stars = PROG.stars[n] || 0;
    html.push(`<button data-n="${n}" class="${n === cur ? 'cur' : stars ? 'done' : ''}" ${locked ? 'disabled' : ''}>${n}${stars ? `<small>${'★'.repeat(stars)}</small>` : ''}</button>`);
  }
  $('lv-grid').innerHTML = html.join('');
  $('lv-page').textContent = `${lvPage + 1} / ${pages}`;
  $('lv-prev').disabled = lvPage === 0;
  $('lv-next').disabled = lvPage >= pages - 1;
}
$('b-levels').onclick = () => {
  lvPage = Math.floor((PROG.level - 1) / PER_PAGE);
  renderLevels();
  show('levels');
};
$('lv-grid').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b && !b.disabled) {
    unlock();
    startLevel(+b.dataset.n);
  }
});
$('lv-prev').onclick = () => {
  lvPage--;
  renderLevels();
};
$('lv-next').onclick = () => {
  lvPage++;
  renderLevels();
};
$('lv-back').onclick = () => show('home');

// ---------------------------------------------------------------- menú
function toMenu() {
  clearInterval(dayTimer);
  if (S.mode === 'race') lobby.leave();
  S.mode = null;
  S.anim = null;
  S.queue = [];
  S.paused = false;
  S.race = null;
  if (coverEl) coverEl.hidden = true;
  setPlaying(false);
  refreshHome();
  show('home');
}
function refreshHome() {
  $('b-play-t').textContent = PROG.level > 1 ? t('play') : t('playNew');
  $('b-play-sub').textContent = t('playSub', { n: PROG.level });
  const d = dailyInfo();
  const sv = load('dsave', null);
  $('b-daily-sub').textContent = d.rec ? t('dailyDone', { n: d.n, m: d.rec.moves }) : sv && sv.date === d.date && sv.moves ? t('dailyGo', { n: d.n }) : t('dailySub', { n: d.n });
}
$('b-play').onclick = () => {
  unlock();
  startLevel(PROG.level);
};
$('b-daily').onclick = () => {
  unlock();
  startDaily();
};
$('b-rules').onclick = () => {
  S.rulesBack = 'home';
  show('rules');
};
$('b-rules-ok').onclick = () => show(S.rulesBack === 'pause' ? 'pause' : 'home');
function renderRules() {
  $('rules-body').innerHTML = G.t(RULES);
}
function pause() {
  if (!S.mode || $$('.screen.on').length) return;
  if (S.mode !== 'race') S.paused = true;
  $$('#o-symbols button').forEach((b) => b.classList.toggle('on', +b.dataset.v === OPTS.symbols));
  show('pause');
}
function resume() {
  S.paused = false;
  show(null);
}
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
for (const b of $$('#o-symbols button'))
  b.onclick = () => {
    OPTS.symbols = +b.dataset.v;
    save('opts', OPTS);
    $$('#o-symbols button').forEach((x) => x.classList.toggle('on', x === b));
  };
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- carrera online
const others = new Map();
let lastSent = 0;
let sentVal = -1;
const lobby = new RaceLobby({
  game: ID,
  settings: ['colors'],
  defaults: { colors: '8' },
  show: (id) => {
    S.mode = 'race';
    S.race = null;
    show(id);
  },
  onRace: beginRace,
  onLobby: () => {
    setPlaying(false);
    S.race = null;
  },
  onMessage: onNet,
  onRoom: (room) => room.state === 'finished' && document.querySelector('#s-results.on') && showResults(),
  onClosed: () => {
    toMenu();
    show('online');
  },
});
function beginRace(room) {
  const r = room.race;
  const lv = generate(r.seed, { colors: r.colors, extra: 2 });
  S.mode = 'race';
  S.results = null;
  begin(lv, { race: { startAt: r.startAt, phase: 'countdown', tick: 0 } });
  S.maxExtra = 0;
  S.paused = false;
  others.clear();
  for (const p of room.players) if (p.id !== lobby.net.myId) others.set(p.id, { name: p.name, color: p.color, done: 0, fin: false });
  sentVal = -1;
  cover(t('ready'), '');
  renderInfo();
  renderRace();
}
let coverEl = null;
function cover(big, small) {
  if (!coverEl) {
    coverEl = document.createElement('div');
    coverEl.className = 'cover';
    $('game').append(coverEl);
  }
  coverEl.hidden = !big && !small;
  coverEl.innerHTML = `<b>${esc(big)}</b><span>${esc(small)}</span>`;
}
function sendProgress() {
  if (S.mode !== 'race' || !S.race || S.race.phase !== 'play') return;
  const v = settled(S.tubes);
  const now = performance.now();
  if (v === sentVal || now - lastSent < 250) return;
  sentVal = v;
  lastSent = now;
  lobby.net.raw({ t: 'state', s: [v] });
}
function finishRace() {
  S.race.phase = 'done';
  S.elapsed = Math.max(1, Math.round(lobby.net.serverNow() - S.race.startAt));
  lobby.net.send({ t: 'finish', moves: encodeMoves(S.hist.map((h) => [h.a, h.b])) });
  sfx.win();
  cover('✓', t('waitOthers'));
  setTimeout(showResults, 900);
}
function onNet(m) {
  if (m.t === 'state') {
    const o = others.get(m.id);
    if (o) o.done = Math.max(o.done, Number(m.s[0]) || 0);
    return;
  }
  if (m.t === 'finished') {
    if (m.id === lobby.net.myId) S.elapsed = m.time;
    const o = others.get(m.id);
    if (o) {
      o.fin = true;
      o.done = S.max;
      o.time = m.time;
    }
    if (S.race?.phase === 'done') showResults();
    return;
  }
  if (m.t === 'end') {
    S.results = m.results;
    if (S.mode === 'race') {
      if (S.race) S.race.phase = 'done';
      showResults();
    }
  }
}
/** El avance (lo ordenado) como porcentaje de lo que falta para resolver este nivel. */
const pct = (v) => Math.round(100 * clamp((v - S.base) / Math.max(1, S.max - S.base), 0, 1));
function renderRace() {
  if (S.mode !== 'race' || !S.race) return;
  const me = { id: lobby.net.myId, name: lobby.name, color: '#6fb7ff', done: settled(S.tubes), fin: S.solved, me: true };
  const all = [me, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))].sort((a, b) => b.done - a.done);
  $('race').innerHTML = all.map((p) => `<span class="rp${p.me ? ' me' : ''}${p.fin ? ' done' : ''}" style="--c2:${esc(p.color)}"><i></i>${esc(p.name)}${p.me ? ` (${esc(t('you'))})` : ''} <b>${p.fin ? 100 : pct(p.done)}%</b></span>`).join('');
}
function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function showResults() {
  if (S.mode !== 'race' || !S.race) return; // ya volvió a la sala o al menú (por ejemplo, un aviso demorado)
  const final = S.results;
  const me = lobby.net.myId;
  let rows;
  if (final) rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, dnf: !!r.dnf, val: r.dnf ? t('dnf', { d: pct(r.done ?? 0) }) : fmtMs(r.time) }));
  else {
    const all = [{ id: me, name: lobby.name, color: '#fff', fin: true, time: S.elapsed }, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))];
    all.sort((a, b) => (b.fin ? 1 : 0) - (a.fin ? 1 : 0) || (a.time || 0) - (b.time || 0));
    rows = all.map((r) => ({ id: r.id, name: r.name, color: r.color, val: r.fin ? fmtMs(r.time || 0) : '…' }));
  }
  const place = rows.findIndex((r) => r.id === me) + 1;
  const mine = rows[place - 1];
  $('res-title').textContent = !final ? t('waitOthers') : mine && !mine.dnf ? (place === 1 ? t('win') : t('place', { n: place })) : t('raceOver');
  $('res-rank').innerHTML = rows.map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${esc(r.color)}"></i><span>${esc(r.name)}${r.id === me ? ` (${esc(t('you'))})` : ''}</span><b>${esc(r.val)}</b></li>`).join('');
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && mine && !mine.dnf && place === 1) sfx.win();
  show('results');
}
$('res-leave').onclick = () => toMenu();
$('b-online').onclick = () => {
  unlock();
  lobby.open();
};
$('on-back').onclick = () => {
  lobby.leave();
  toMenu();
};
setInterval(() => {
  if (S.mode === 'race' && S.race) {
    renderRace();
    const r = S.race;
    if (r.phase === 'play') sendProgress();
    if (r.phase === 'countdown') {
      const left = (r.startAt - lobby.net.serverNow()) / 1000;
      if (left > 0) {
        const n = Math.ceil(left);
        if (n !== r.tick) {
          r.tick = n;
          cover(String(n), t('ready'));
          sfx.tick();
        }
      } else {
        r.phase = 'play';
        cover(t('go'), '');
        sfx.go();
        setTimeout(() => r.phase === 'play' && cover('', ''), 700);
        sendProgress();
      }
    }
  }
}, 200);

// ---------------------------------------------------------------- teclado y arranque
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (document.querySelector('#s-pause.on')) {
    if (k === 'escape' || k === 'p') resume();
    return;
  }
  if (!S.mode || $$('.screen.on').length) return;
  if (k === 'escape' || k === 'p') pause();
  else if (k === 'z' || (k === 'u')) undo();
  else if (k === 'r') restart();
  else if (k === 'h') hint();
  else if (/^[1-9]$/.test(k) && canPlay() && !S.solved) tap(+k - 1);
  else if (k === '0' && canPlay() && !S.solved) tap(9);
});
new ResizeObserver(() => resize()).observe(cv);
addEventListener('blur', () => S.mode && S.mode !== 'race' && !S.solved && pause());
document.addEventListener('visibilitychange', () => document.hidden && S.mode && S.mode !== 'race' && !S.solved && pause());
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => {
  if (!$$('.screen.on').length) S.paused = false;
});
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  renderRules();
  refreshHome();
  if (S.mode) renderInfo();
}, true);
setInterval(() => saveDaily(), 2000);
requestAnimationFrame(frame);
resize();
if (lobby.pending) {
  S.mode = 'race';
  show('online');
} else show('home');
G.gameplay(false);

if (DEBUG)
  window.__chorrito = {
    S,
    PROG,
    L,
    startLevel,
    startDaily,
    tap,
    undo,
    hint,
    solve: () => solve(S.tubes, S.cap),
    toMenu,
    lobby,
    maxColors: MAX_COLORS,
    /** Resuelve el nivel de una con el resolvedor (para probar la pantalla de victoria y las carreras). */
    autosolve() {
      const path = solve(S.tubes, S.cap, { maxNodes: 80000 }) || [];
      let i = 0;
      const step = () => {
        if (!S.anim && i < path.length) doPour(...path[i++]);
        if (i < path.length || S.anim) setTimeout(step, 30);
      };
      step();
    },
  };
G.ready();
