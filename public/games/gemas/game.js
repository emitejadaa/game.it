/* Gemas — game.it
 * Intercambiá gemas vecinas para alinear tres o más del mismo color. Cuatro en línea hacen un rayo, una L o una T una bomba
 * y cinco un prisma; las especiales se combinan entre sí. Niveles con objetivos (puntos, juntar colores, romper hielo)
 * calibrados por la compu, contrarreloj de 90 segundos, las gemas del día (las mismas para todos) y un duelo online donde
 * todos juegan las mismas gemas y el servidor rehace las jugadas para validar el puntaje. Motor en shared/engine.js.
 */
import { Game, N, SP, PRISM, idx, rowOf, colOf, adjacent, encodeMove, replay, bestMove, hashSeed } from './shared/engine.js';
import { levelOf, dailyLevel, goalMet, starsFor } from './shared/levels.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'gemas';
const EPOCH = '2026-10-30';
const TIMED_SECS = 90;
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Gemas', en: 'Gem Swap' },
  tagline: { es: 'Intercambiá gemas vecinas y alineá tres o más del mismo color.', en: 'Swap neighbouring gems and line up three or more of a colour.' },
  play: { es: 'Jugar', en: 'Play' },
  playNew: { es: 'Empezar', en: 'Start' },
  playSub: { es: 'Nivel {n}', en: 'Level {n}' },
  daily: { es: 'Gemas del día', en: 'Daily Gems' },
  dailySub: { es: 'n.º {n} · las mismas para todos', en: '#{n} · the same for everyone' },
  dailyGo: { es: 'n.º {n} · en curso', en: '#{n} · in progress' },
  dailyDone: { es: 'n.º {n} · ✓ {p} puntos', en: '#{n} · ✓ {p} points' },
  timed: { es: 'Contrarreloj', en: 'Time Attack' },
  timedSub: { es: '90 segundos', en: '90 seconds' },
  timedBest: { es: 'récord {p}', en: 'best {p}' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'duelo con las mismas gemas', en: 'duel with the same gems' },
  onlineLong: { es: 'Todos juegan las mismas gemas con las mismas jugadas y gana el que más puntos junta. El servidor rehace tus jugadas para contar los puntos.', en: 'Everyone plays the same gems with the same number of moves and the highest score wins. The server replays your moves to count the points.' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'entrar a una sala abierta', en: 'join an open room' },
  create: { es: 'Crear sala', en: 'Create room' },
  createSub: { es: 'privada con código', en: 'private, with a code' },
  join: { es: 'Entrar', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'Tocá el código para copiar el link', en: 'Tap the code to copy the link' },
  movesSetting: { es: 'Jugadas', en: 'Moves' },
  startRace: { es: '¡Largar!', en: 'Start!' },
  leave: { es: 'Salir', en: 'Leave' },
  levels: { es: 'Niveles', en: 'Levels' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  back: { es: '← volver', en: '← back' },
  go: { es: '¡Vamos!', en: "Let's go!" },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  restart: { es: 'Empezar de nuevo', en: 'Start over' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  level: { es: 'Nivel {n}', en: 'Level {n}' },
  movesLbl: { es: 'jugadas', en: 'moves' },
  secsLbl: { es: 'seg', en: 'sec' },
  duel: { es: 'Duelo', en: 'Duel' },
  // objetivos
  gScore: { es: 'Llegá a {p} puntos', en: 'Reach {p} points' },
  gCollect: { es: 'Juntá las gemas', en: 'Collect the gems' },
  gIce: { es: 'Rompé todo el hielo', en: 'Break all the ice' },
  gDaily: { es: 'Hacé todos los puntos que puedas', en: 'Score as much as you can' },
  gTimed: { es: 'Todos los puntos que puedas en 90 s', en: 'As many points as you can in 90 s' },
  goalScoreLong: { es: 'Llegá a {p} puntos en {m} jugadas.', en: 'Reach {p} points in {m} moves.' },
  goalCollectLong: { es: 'Borrá estas gemas en {m} jugadas. Las jugadas que sobren se vuelven rayos.', en: 'Clear these gems in {m} moves. Leftover moves turn into rockets.' },
  goalIceLong: { es: 'Rompé todo el hielo en {m} jugadas: se rompe borrando gemas encima (algunos tienen dos capas).', en: 'Break all the ice in {m} moves: it breaks when gems on it are cleared (some have two layers).' },
  points: { es: 'puntos', en: 'points' },
  iceLbl: { es: 'hielo', en: 'ice' },
  // durante el juego
  noMove: { es: 'Así no se arma nada', en: 'That makes no match' },
  shuffle: { es: '¡A mezclar!', en: 'Shuffle!' },
  goalDone: { es: '¡Objetivo cumplido!', en: 'Goal complete!' },
  rain: { es: '¡Lluvia de rayos!', en: 'Rocket rain!' },
  timeUp: { es: '¡Tiempo!', en: "Time's up!" },
  outOfMoves: { es: '¡Sin jugadas!', en: 'Out of moves!' },
  combo3: { es: '¡Bien!', en: 'Nice!' },
  combo4: { es: '¡Genial!', en: 'Great!' },
  combo5: { es: '¡Increíble!', en: 'Amazing!' },
  combo6: { es: '¡Espectacular!', en: 'Spectacular!' },
  ready: { es: 'Preparados…', en: 'Get ready…' },
  goNow: { es: '¡Ya!', en: 'Go!' },
  // fin
  winKicker: { es: '¡Nivel superado!', en: 'Level complete!' },
  loseKicker: { es: '¡Uy, se terminaron las jugadas!', en: 'Out of moves!' },
  loseTitle: { es: 'Te faltó poco', en: 'So close' },
  missScore: { es: 'Faltaron {p} puntos', en: '{p} points short' },
  missCollect: { es: 'Faltaron: {list}', en: 'Missing: {list}' },
  missIce: { es: 'Quedaron {n} capas de hielo', en: '{n} layers of ice left' },
  stScore: { es: 'puntos', en: 'points' },
  stBest: { es: 'tu récord', en: 'your best' },
  stChain: { es: 'mejor cascada', en: 'best chain' },
  stMade: { es: 'especiales', en: 'specials' },
  stPlayed: { es: 'jugadas', en: 'played' },
  stStreak: { es: 'racha', en: 'streak' },
  stBestStreak: { es: 'mejor', en: 'best' },
  nextLevel: { es: 'Siguiente nivel', en: 'Next level' },
  retry: { es: 'Reintentar', en: 'Retry' },
  again: { es: 'Otra vez', en: 'Play again' },
  replayLevel: { es: 'Repetir', en: 'Replay' },
  dailyKicker: { es: 'Gemas del día n.º {n}', en: 'Daily Gems #{n}' },
  timedKicker: { es: 'Contrarreloj', en: 'Time Attack' },
  newBest: { es: '¡Nuevo récord!', en: 'New best!' },
  nextDaily: { es: 'Las próximas, en', en: 'Next ones in' },
  share: { es: 'Compartir', en: 'Share' },
  sharedOk: { es: '¡Listo para pegar!', en: 'Ready to paste!' },
  // carrera
  you: { es: 'vos', en: 'you' },
  win: { es: '¡Ganaste el duelo!', en: 'You won the duel!' },
  place: { es: 'Quedaste {n}.º', en: 'You came #{n}' },
  raceOver: { es: 'Fin del duelo', en: 'Duel over' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  dnf: { es: '{p} · sin terminar', en: '{p} · unfinished' },
  doneMoves: { es: '¡Listo!', en: 'Done!' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const lang = () => (G.prefs?.lang === 'en' ? 'en' : 'es');
const fmt = (n) => Math.round(n).toLocaleString(lang() === 'en' ? 'en-US' : 'es-AR');
const GEM_NAMES = {
  es: ['rubíes', 'ámbares', 'citrinos', 'esmeraldas', 'zafiros', 'amatistas'],
  en: ['rubies', 'ambers', 'citrines', 'emeralds', 'sapphires', 'amethysts'],
};

const RULES = {
  es: `<p>Tocá una gema y después una de al lado (o deslizala) para <b>intercambiarlas</b>. El cambio vale si arma una línea de <b>tres o más</b> del mismo color, que se borra; las de arriba caen y entran nuevas. Si lo que cae arma otra línea, es una <b>cascada</b> y cada paso vale más.</p>
<h3>Especiales</h3>
<p><b>4 en línea</b> hacen un <b>rayo</b>, que al explotar borra su fila (si la línea era horizontal) o su columna. Una <b>L o una T</b> hacen una <b>bomba</b>, que borra todo a su alrededor. <b>5 en línea</b> hacen un <b>prisma</b>: cambialo por cualquier gema y se lleva todas las de ese color. Dos especiales cambiadas entre sí <b>se combinan</b>: rayo con rayo, una cruz; rayo con bomba, tres filas y tres columnas; bomba con bomba, una explosión enorme; un prisma con un rayo o una bomba convierte todas las de ese color; y dos prismas, todo el tablero.</p>
<h3>Modos</h3>
<p>Los <b>niveles</b> tienen un objetivo y pocas jugadas: llegar a un puntaje, <b>juntar</b> gemas de ciertos colores o <b>romper el hielo</b> (se rompe borrando gemas encima; a veces tiene dos capas). Si lo cumplís con jugadas de sobra, se vuelven rayos que suman puntos. La compu juega cada nivel antes que vos para que siempre se pueda. El <b>contrarreloj</b> da 90 segundos, las <b>gemas del día</b> son 25 jugadas con las mismas gemas para todos y en el <b>duelo online</b> todos juegan el mismo tablero con las mismas jugadas.</p>
<p>Cada color tiene su forma (rubí, ámbar, citrino, esmeralda, zafiro y amatista), así se distinguen aunque los colores cuesten. Si te quedás un rato quieto, te muestra una jugada.</p>`,
  en: `<p>Tap a gem and then a neighbouring one (or slide it) to <b>swap</b> them. A swap counts if it lines up <b>three or more</b> of a colour, which are cleared; the gems above fall and new ones drop in. If the falling gems make another line it's a <b>cascade</b>, and every step is worth more.</p>
<h3>Specials</h3>
<p><b>4 in a line</b> make a <b>rocket</b> that clears its row (if the line was horizontal) or its column. An <b>L or T</b> makes a <b>bomb</b> that clears everything around it. <b>5 in a line</b> make a <b>prism</b>: swap it with any gem and it takes every gem of that colour. Two specials swapped together <b>combine</b>: rocket + rocket, a cross; rocket + bomb, three rows and three columns; bomb + bomb, a huge blast; a prism with a rocket or bomb turns every gem of that colour; and two prisms, the whole board.</p>
<h3>Modes</h3>
<p><b>Levels</b> have a goal and few moves: reach a score, <b>collect</b> gems of some colours or <b>break the ice</b> (it breaks when gems on it are cleared; sometimes it has two layers). Finish with moves to spare and they turn into rockets for extra points. The computer plays every level first so it can always be done. <b>Time attack</b> gives you 90 seconds, the <b>daily gems</b> are 25 moves with the same gems for everyone and in the <b>online duel</b> everyone plays the same board with the same number of moves.</p>
<p>Every colour has its own shape (ruby, amber, citrine, emerald, sapphire and amethyst), so they can be told apart even when colours are hard to see. Stay still for a while and it will show you a move.</p>`,
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
/** progress: { level: el primero sin pasar, stars: { n: estrellas }, best: { n: puntaje } } */
const PROG = { level: 1, stars: {}, best: {}, ...load('progress', {}) };
let TIMED_BEST = load('timed', 0) | 0;

// ---------------------------------------------------------------- las gemas
const GEMS = [
  { base: '#ff3d5a', light: '#ffa7b4', dark: '#a50f2a', shape: 'hex' },
  { base: '#ff9419', light: '#ffd393', dark: '#b05300', shape: 'square' },
  { base: '#ffd51c', light: '#fff3a6', dark: '#b08a00', shape: 'diamond' },
  { base: '#1fc35a', light: '#a3f2bd', dark: '#0d7533', shape: 'oct' },
  { base: '#2f7bff', light: '#a6c8ff', dark: '#123fa3', shape: 'circle' },
  { base: '#a955f7', light: '#dfbcff', dark: '#621fa3', shape: 'tri' },
];
const OUTLINE = '#1a0b2e';
const SHAPES = {
  hex: Array.from({ length: 6 }, (_, k) => [Math.cos(-Math.PI / 2 + (k * Math.PI) / 3) * 1.02, Math.sin(-Math.PI / 2 + (k * Math.PI) / 3) * 1.02]),
  square: [[-0.62, -0.84], [0.62, -0.84], [0.84, -0.62], [0.84, 0.62], [0.62, 0.84], [-0.62, 0.84], [-0.84, 0.62], [-0.84, -0.62]],
  diamond: [[0, -1.08], [0.86, 0], [0, 1.08], [-0.86, 0]],
  oct: [[-0.46, -0.98], [0.46, -0.98], [0.8, -0.64], [0.8, 0.64], [0.46, 0.98], [-0.46, 0.98], [-0.8, 0.64], [-0.8, -0.64]],
  circle: Array.from({ length: 10 }, (_, k) => [Math.cos((k * Math.PI) / 5 - Math.PI / 2), Math.sin((k * Math.PI) / 5 - Math.PI / 2)]),
  tri: [[0, -1.02], [1.0, 0.8], [-1.0, 0.8]],
};
const mix = (hex, other, k) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
function polyPath(c, pts, R, cx, cy) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(cx + x * R, cy + y * R) : c.moveTo(cx + x * R, cy + y * R)));
  c.closePath();
}
function sparkle(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x, y, x + s, y);
  c.quadraticCurveTo(x, y, x, y + s);
  c.quadraticCurveTo(x, y, x - s, y);
  c.quadraticCurveTo(x, y, x, y - s);
  c.fill();
}
/** Dibuja una gema facetada (o el prisma) centrada en (cx, cy) con radio R. */
function paintGem(c, k, sp, cx, cy, R) {
  const lw = Math.max(1.5, R * 0.12);
  c.save();
  c.lineJoin = 'round';
  if (k === PRISM) {
    c.beginPath();
    c.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
    const g = c.createConicGradient ? c.createConicGradient(0, cx, cy) : null;
    if (g) {
      ['#ff3d5a', '#ff9419', '#ffd51c', '#1fc35a', '#2f7bff', '#a955f7', '#ff3d5a'].forEach((col, i) => g.addColorStop(i / 6, col));
      c.fillStyle = g;
    } else c.fillStyle = '#d070ff';
    c.fill();
    const hl = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    hl.addColorStop(0, 'rgba(255,255,255,0.95)');
    hl.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl;
    c.fill();
    c.lineWidth = lw;
    c.strokeStyle = OUTLINE;
    c.stroke();
    c.fillStyle = '#fff';
    sparkle(c, cx + R * 0.38, cy + R * 0.3, R * 0.2);
    sparkle(c, cx - R * 0.3, cy + R * 0.45, R * 0.12);
    c.restore();
    return;
  }
  const gem = GEMS[k];
  const pts = SHAPES[gem.shape];
  const r = sp === SP.BOMB ? R * 0.84 : R;
  // facetas de la corona: cada lado entre el borde y la mesa, más claro si mira hacia la luz (arriba a la izquierda)
  const inner = pts.map(([x, y]) => [x * 0.52 - 0.05, y * 0.52 - 0.08]);
  const outerPath = () => (gem.shape === 'circle' ? (c.beginPath(), c.arc(cx, cy, r, 0, Math.PI * 2)) : polyPath(c, pts, r, cx, cy));
  outerPath();
  c.fillStyle = gem.base;
  c.fill();
  c.save();
  outerPath();
  c.clip();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = inner[i], ib = inner[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const light = (-mx * 0.6 - my * 0.8) / Math.hypot(mx, my || 1e-6);
    c.beginPath();
    const ext = gem.shape === 'circle' ? 1.3 : 1;
    c.moveTo(cx + a[0] * r * ext, cy + a[1] * r * ext);
    c.lineTo(cx + b[0] * r * ext, cy + b[1] * r * ext);
    c.lineTo(cx + ib[0] * r, cy + ib[1] * r);
    c.lineTo(cx + ia[0] * r, cy + ia[1] * r);
    c.closePath();
    c.fillStyle = light > 0 ? mix(gem.base, gem.light.length === 7 ? gem.light : '#ffffff', Math.min(0.75, light * 0.7)) : mix(gem.base, gem.dark, Math.min(0.8, -light * 0.75));
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.lineWidth = Math.max(0.8, R * 0.025);
    c.stroke();
  }
  // la mesa
  polyPath(c, inner, r, cx, cy);
  const tg = c.createLinearGradient(cx - r * 0.5, cy - r * 0.6, cx + r * 0.4, cy + r * 0.5);
  tg.addColorStop(0, gem.light);
  tg.addColorStop(1, gem.base);
  c.fillStyle = tg;
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.stroke();
  c.restore();
  outerPath();
  c.lineWidth = lw;
  c.strokeStyle = OUTLINE;
  c.stroke();
  // brillo
  c.fillStyle = 'rgba(255,255,255,0.92)';
  sparkle(c, cx - r * 0.38, cy - r * 0.42, r * 0.2);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.beginPath();
  c.ellipse(cx - r * 0.12, cy - r * 0.55, r * 0.22, r * 0.08, -0.4, 0, Math.PI * 2);
  c.fill();
  // especiales
  if (sp === SP.ROW || sp === SP.COL) {
    c.save();
    c.translate(cx, cy);
    if (sp === SP.COL) c.rotate(Math.PI / 2);
    c.shadowColor = '#fff';
    c.shadowBlur = R * 0.35;
    c.fillStyle = '#fff';
    c.strokeStyle = OUTLINE;
    c.lineWidth = lw * 0.55;
    c.beginPath();
    c.roundRect(-R * 0.9, -R * 0.12, R * 1.8, R * 0.24, R * 0.12);
    c.fill();
    c.stroke();
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * R * 1.22, 0);
      c.lineTo(s * R * 0.8, -R * 0.3);
      c.lineTo(s * R * 0.8, R * 0.3);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
  } else if (sp === SP.BOMB) {
    c.save();
    c.translate(cx, cy);
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i * Math.PI) / 4 + Math.PI / 8);
      c.beginPath();
      c.moveTo(-R * 0.12, -R * 0.98);
      c.lineTo(0, -R * 1.24);
      c.lineTo(R * 0.12, -R * 0.98);
      c.closePath();
      c.fillStyle = '#ffd84a';
      c.fill();
      c.lineWidth = lw * 0.45;
      c.strokeStyle = OUTLINE;
      c.stroke();
      c.restore();
    }
    c.beginPath();
    c.arc(0, 0, R * 0.98, 0, Math.PI * 2);
    c.lineWidth = R * 0.16;
    c.strokeStyle = OUTLINE;
    c.stroke();
    c.lineWidth = R * 0.09;
    c.strokeStyle = '#ffd84a';
    c.stroke();
    c.restore();
  }
  c.restore();
}
const sprites = new Map();
/** La gema ya dibujada en un canvas aparte (una por color, especial y tamaño). */
function sprite(k, sp, size) {
  const key = `${k}:${sp}:${size}`;
  let s = sprites.get(key);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = size;
    paintGem(s.getContext('2d'), k, sp, size / 2, size / 2, size * 0.36);
    sprites.set(key, s);
  }
  return s;
}
const icons = new Map();
function gemIcon(k) {
  if (!icons.has(k)) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    paintGem(c.getContext('2d'), k, 0, 48, 48, 40);
    icons.set(k, c.toDataURL());
  }
  return icons.get(k);
}

// ---------------------------------------------------------------- sonidos
const sfx = {
  pick: () => tone(700, 900, 0.05, { type: 'triangle', vol: 0.05 }),
  swap: () => tone(480, 760, 0.09, { type: 'triangle', vol: 0.06 }),
  bad: () => {
    tone(260, 170, 0.14, { type: 'sawtooth', vol: 0.04 });
    noise(0.08, { freq: 300, q: 1, vol: 0.06 });
  },
  match(chain) {
    const b = 523.25 * Math.pow(2, Math.min(chain - 1, 9) / 6);
    notes([b, b * 1.26, b * 1.5], { step: 0.045, dur: 0.16, type: 'triangle', vol: 0.07 });
    noise(0.1, { freq: 5200, q: 0.8, vol: 0.03 });
  },
  made: () => notes([1046.5, 1318.5, 1568, 2093], { step: 0.05, dur: 0.14, type: 'sine', vol: 0.06 }),
  zap: () => {
    noise(0.28, { freq: 3800, q: 0.7, vol: 0.06, sweep: 700 });
    tone(1400, 300, 0.24, { type: 'sawtooth', vol: 0.03 });
  },
  boom: () => {
    noise(0.45, { freq: 260, q: 0.7, vol: 0.14, sweep: 60 });
    tone(140, 45, 0.4, { type: 'sine', vol: 0.12 });
  },
  prism: () => {
    notes([784, 988, 1175, 1397, 1661, 1976], { step: 0.04, dur: 0.2, type: 'sine', vol: 0.05 });
    noise(0.5, { freq: 6000, q: 0.6, vol: 0.04, sweep: 2000 });
  },
  ice: () => {
    noise(0.07, { freq: 4200, q: 2, vol: 0.06 });
    tone(1900, 1300, 0.06, { type: 'triangle', vol: 0.03 });
  },
  land: () => noise(0.05, { freq: 900, q: 1.2, vol: 0.025 }),
  shuffle: () => noise(0.5, { freq: 700, q: 0.6, vol: 0.06, sweep: 2400 }),
  turn: () => notes([1568, 2093], { step: 0.05, dur: 0.12, type: 'sine', vol: 0.05 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], { step: 0.09, dur: 0.28, type: 'triangle', vol: 0.09 }),
  lose: () => notes([523.25, 440, 349.23, 261.63], { step: 0.14, dur: 0.3, type: 'triangle', vol: 0.07 }),
  star: (i) => tone(700 + i * 160, 900 + i * 160, 0.18, { type: 'triangle', vol: 0.07 }),
  tick: () => tone(880, 880, 0.06, { type: 'square', vol: 0.035 }),
  go: () => notes([880, 1318.5], { step: 0.08, dur: 0.2, type: 'square', vol: 0.06 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
};

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // level | daily | timed | race
  lv: null,
  g: null,
  str: '', // las jugadas hechas, como texto
  busy: false,
  over: false,
  paused: false,
  sel: -1,
  cur: -1, // cursor del teclado
  clock: 0, // segundos de juego (no corre en pausa)
  idle: 0,
  hint: null,
  timeLeft: 0,
  extra: 0, // jugadas que ya se volvieron rayos al final
  combo: null,
  shake: 0,
  daily: null,
  race: null,
  results: null,
  iceShown: new Uint8Array(N * N),
};
const V = new Map(); // id → { id, t, sp, x, y, s, a, r }
const cv = $('cv');
const ctx = cv.getContext('2d');
const L = { W: 1, H: 1, dpr: 1, x0: 0, y0: 0, cs: 40, size: 40 };
const reduced = () => !!G.prefs?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- tiempo y animaciones
const tweens = [];
const timers = [];
let speedK = 1;
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x));
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const easeIn = (x) => x * x;
const linear = (x) => x;
function tween(obj, to, dur, ease = easeInOut, delay = 0) {
  return new Promise((resolve) => tweens.push({ obj, to, from: null, t0: S.clock + delay * speedK, dur: Math.max(0.001, dur * speedK), ease, resolve }));
}
const wait = (sec) => new Promise((resolve) => timers.push({ at: S.clock + sec * speedK, resolve }));
function stepTweens() {
  for (let i = 0; i < tweens.length; i++) {
    const tw = tweens[i];
    const p = (S.clock - tw.t0) / tw.dur;
    if (p < 0) continue;
    if (!tw.from) {
      tw.from = {};
      for (const k in tw.to) tw.from[k] = tw.obj[k];
    }
    const e = tw.ease(Math.min(1, p));
    for (const k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
    if (p >= 1) {
      tweens.splice(i--, 1);
      tw.resolve();
    }
  }
  for (let i = 0; i < timers.length; i++)
    if (S.clock >= timers[i].at) {
      const tm = timers[i];
      timers.splice(i--, 1);
      tm.resolve();
    }
}

// ---------------------------------------------------------------- efectos (rayos, ondas, chispas, puntos)
const FX = [];
const parts = [];
const pops = [];
function burst(x, y, color, n = 9, power = 1) {
  if (reduced()) n = Math.ceil(n / 3);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (2.2 + Math.random() * 3.2) * power;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 0.55 + Math.random() * 0.35, max: 0.9, r: 0.05 + Math.random() * 0.06, c: Math.random() < 0.3 ? '#ffffff' : color, rot: Math.random() * 6, shard: Math.random() < 0.6 });
  }
}
function addFx(f) {
  FX.push({ t: 0, ...f });
}
function popText(x, y, text, color = '#fff', big = false) {
  pops.push({ x, y, text, color, t: 0, big });
}

// ---------------------------------------------------------------- medidas
function resize() {
  const r = cv.getBoundingClientRect();
  L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  L.W = Math.max(1, Math.round(r.width));
  L.H = Math.max(1, Math.round(r.height));
  cv.width = Math.round(L.W * L.dpr);
  cv.height = Math.round(L.H * L.dpr);
  // margen y lugar para el marco del tablero (que sobresale un poco de las casillas)
  const m = Math.min(L.W, L.H) < 520 ? 6 : 14;
  L.cs = Math.max(16, Math.floor(Math.min(L.W - 2 * m, L.H - 2 * m) / (N + 0.34)));
  L.x0 = Math.round((L.W - L.cs * N) / 2);
  L.y0 = Math.round((L.H - L.cs * N) / 2);
  const size = Math.round(L.cs * L.dpr);
  if (size !== L.size) {
    L.size = size;
    sprites.clear();
  }
}
const cellAt = (px, py) => {
  const c = Math.floor((px - L.x0) / L.cs), r = Math.floor((py - L.y0) / L.cs);
  return r >= 0 && r < N && c >= 0 && c < N ? idx(r, c) : -1;
};
const cx = (col) => L.x0 + (col + 0.5) * L.cs;
const cy = (row) => L.y0 + (row + 0.5) * L.cs;

// ---------------------------------------------------------------- las gemas en pantalla
function mkVis(id, k, sp, i) {
  return { id, t: k, sp, x: colOf(i), y: rowOf(i), s: 1, a: 1, r: 0, flash: 0 };
}
/** Deja cada gema de la pantalla exactamente donde está en el motor (después de cada jugada, por las dudas). */
function syncVisuals() {
  const g = S.g;
  const seen = new Set();
  for (let i = 0; i < N * N; i++) {
    const id = g.id[i];
    if (!id) continue;
    seen.add(id);
    let v = V.get(id);
    if (!v) V.set(id, (v = mkVis(id, g.t[i], g.sp[i], i)));
    Object.assign(v, { t: g.t[i], sp: g.sp[i], x: colOf(i), y: rowOf(i), s: 1, a: 1, r: 0 });
  }
  for (const id of [...V.keys()]) if (!seen.has(id)) V.delete(id);
  S.iceShown = g.ice.slice();
}

// ---------------------------------------------------------------- dibujo
let timeScale = 1; // solo para depurar (cámara lenta)
function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000) * timeScale;
  frame.last = now;
  if (!S.paused) update(dt);
  draw(now / 1000);
  requestAnimationFrame(frame);
}
function update(dt) {
  S.clock += dt;
  stepTweens();
  for (const f of FX) f.t += dt;
  for (let i = FX.length - 1; i >= 0; i--) if (FX[i].t > (FX[i].dur || 0.5)) FX.splice(i, 1);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 9 * dt;
    p.rot += dt * 8;
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (let i = pops.length - 1; i >= 0; i--) if ((pops[i].t += dt) > 1) pops.splice(i, 1);
  if (S.combo && (S.combo.t += dt) > 1.1) S.combo = null;
  S.shake = Math.max(0, S.shake - dt * 2.5);
  const playing = S.mode && S.g && !S.over && !$$('.screen.on').length;
  // el reloj del contrarreloj corre también durante las cascadas
  if (playing && S.mode === 'timed' && S.timeLeft > 0) {
    const before = Math.ceil(S.timeLeft);
    S.timeLeft = Math.max(0, S.timeLeft - dt);
    if (Math.ceil(S.timeLeft) !== before) {
      renderHud();
      if (S.timeLeft <= 10 && S.timeLeft > 0) sfx.tick();
    }
    if (S.timeLeft <= 0) endTimed();
  }
  if (playing && !S.busy) {
    S.idle += dt;
    if ((S.mode === 'level' || S.mode === 'timed') && S.idle > 6 && !S.hint) S.hint = bestMove(S.g);
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}
function draw(now) {
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  ctx.clearRect(0, 0, L.W, L.H);
  if (!S.mode || !S.g) return;
  const cs = L.cs;
  ctx.save();
  if (S.shake > 0 && !reduced()) ctx.translate((Math.random() - 0.5) * S.shake * cs * 0.25, (Math.random() - 0.5) * S.shake * cs * 0.25);
  // el tablero
  const pad = Math.max(4, cs * 0.12);
  roundRect(ctx, L.x0 - pad, L.y0 - pad, cs * N + pad * 2, cs * N + pad * 2, cs * 0.35);
  ctx.fillStyle = 'rgba(12,5,30,0.62)';
  ctx.fill();
  ctx.lineWidth = Math.max(3, cs * 0.08);
  ctx.strokeStyle = '#0d0520';
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, cs * 0.035);
  ctx.strokeStyle = 'rgba(214,180,255,0.35)';
  roundRect(ctx, L.x0 - pad * 0.45, L.y0 - pad * 0.45, cs * N + pad * 0.9, cs * N + pad * 0.9, cs * 0.28);
  ctx.stroke();
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const i = idx(r, c);
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.095)';
      roundRect(ctx, L.x0 + c * cs + 1.5, L.y0 + r * cs + 1.5, cs - 3, cs - 3, cs * 0.16);
      ctx.fill();
      if (S.iceShown[i]) {
        ctx.fillStyle = S.iceShown[i] > 1 ? 'rgba(170,220,255,0.42)' : 'rgba(170,220,255,0.24)';
        ctx.fill();
      }
    }
  // cursor del teclado, elegida y pista
  const hl = (i, color, w = 3) => {
    roundRect(ctx, L.x0 + colOf(i) * cs + 2, L.y0 + rowOf(i) * cs + 2, cs - 4, cs - 4, cs * 0.18);
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  if (S.sel >= 0) {
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
    hl(S.sel, 'rgba(255,255,255,0.95)', 3.5);
    ctx.restore();
  }
  if (S.cur >= 0 && S.cur !== S.sel && !S.busy) hl(S.cur, 'rgba(255,214,90,0.9)', 3);
  const hintOn = S.hint && !S.busy && !S.over;
  if (hintOn) for (const i of S.hint) hl(i, `rgba(255,230,120,${0.45 + 0.4 * Math.sin(now * 6)})`, 3);
  // las gemas (recortadas al tablero: las nuevas entran desde arriba)
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x0 - pad, L.y0 - pad * 0.2, cs * N + pad * 2, cs * N + pad * 1.2);
  ctx.clip();
  const list = [...V.values()].sort((a, b) => a.y - b.y);
  for (const v of list) {
    if (v.a <= 0.01 || v.s <= 0.01) continue;
    let x = cx(v.x), y = cy(v.y), s = v.s;
    if (hintOn && v.y === Math.round(v.y)) {
      const i = idx(Math.round(v.y), Math.round(v.x));
      const k = S.hint.indexOf(i);
      if (k >= 0) {
        const o = S.hint[1 - k];
        const w = Math.sin(now * 9) * cs * 0.06;
        x += Math.sign(colOf(o) - colOf(i)) * w;
        y += Math.sign(rowOf(o) - rowOf(i)) * w;
      }
    }
    const i = Math.round(v.y) * N + Math.round(v.x);
    if (i === S.sel && !S.busy) s *= 1.08 + 0.03 * Math.sin(now * 8);
    if (v.sp) s *= 1 + 0.045 * Math.sin(now * 5 + v.id);
    const img = sprite(v.t, v.sp, L.size);
    const d = cs * s;
    ctx.globalAlpha = clamp(v.a, 0, 1);
    if (v.t === PRISM || v.r) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((v.t === PRISM ? now * 0.8 : 0) + v.r);
      ctx.drawImage(img, -d / 2, -d / 2, d, d);
      ctx.restore();
    } else ctx.drawImage(img, x - d / 2, y - d / 2, d, d);
    if (v.flash > 0) {
      // un destello: blanco en el centro que se desvanece hacia el borde
      ctx.globalAlpha = clamp(v.flash * 0.85, 0, 1);
      const gl = ctx.createRadialGradient(x, y, 0, x, y, d * 0.55);
      gl.addColorStop(0, 'rgba(255,255,255,0.95)');
      gl.addColorStop(0.45, 'rgba(255,255,255,0.45)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(x, y, d * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // el hielo: un borde de cristal encima (no tapa la gema)
  for (let i = 0; i < N * N; i++) {
    const n = S.iceShown[i];
    if (!n) continue;
    const x = L.x0 + colOf(i) * cs, y = L.y0 + rowOf(i) * cs;
    ctx.save();
    roundRect(ctx, x + 3, y + 3, cs - 6, cs - 6, cs * 0.16);
    ctx.lineWidth = Math.max(2, cs * (n > 1 ? 0.11 : 0.07));
    ctx.strokeStyle = n > 1 ? 'rgba(225,245,255,0.95)' : 'rgba(205,238,255,0.85)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(x + cs * 0.12, y + cs * 0.3);
    ctx.lineTo(x + cs * 0.12, y + cs * 0.12);
    ctx.lineTo(x + cs * 0.3, y + cs * 0.12);
    ctx.lineWidth = Math.max(1.5, cs * 0.04);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    if (n > 1) {
      ctx.lineWidth = Math.max(1, cs * 0.025);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(x + cs * 0.82, y + cs * 0.12);
      ctx.lineTo(x + cs * 0.72, y + cs * 0.24);
      ctx.lineTo(x + cs * 0.86, y + cs * 0.3);
      ctx.moveTo(x + cs * 0.14, y + cs * 0.86);
      ctx.lineTo(x + cs * 0.27, y + cs * 0.76);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawFx(now);
  ctx.restore();
}

function drawFx(now) {
  const cs = L.cs;
  const bx = L.x0, by = L.y0, bw = cs * N;
  for (const f of FX) {
    if (f.t < 0) continue;
    const p = f.t / (f.dur || 0.5);
    const a = 1 - p;
    if (f.type === 'beam') {
      // un haz a lo largo de una fila o una columna
      const w = cs * (f.wide || 1) * (0.55 + 0.45 * Math.sin(Math.min(1, p * 2) * Math.PI * 0.5)) * (1 - p * 0.6);
      ctx.save();
      ctx.globalAlpha = clamp(a * 1.3, 0, 1);
      const g = f.h ? ctx.createLinearGradient(0, cy(f.line) - w / 2, 0, cy(f.line) + w / 2) : ctx.createLinearGradient(cx(f.line) - w / 2, 0, cx(f.line) + w / 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.3, f.color);
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(0.7, f.color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      if (f.h) ctx.fillRect(bx - cs * 0.3, cy(f.line) - w / 2, bw + cs * 0.6, w);
      else ctx.fillRect(cx(f.line) - w / 2, by - cs * 0.3, w, bw + cs * 0.6);
      ctx.restore();
    } else if (f.type === 'ring') {
      const R = cs * (0.4 + f.rad * easeOut(Math.min(1, p * 1.3)));
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.beginPath();
      ctx.arc(cx(f.x), cy(f.y), R, 0, Math.PI * 2);
      ctx.lineWidth = cs * 0.22 * (1 - p);
      ctx.strokeStyle = f.color || '#ffd84a';
      ctx.stroke();
      ctx.globalAlpha = clamp(a * 0.55 - 0.1, 0, 1);
      ctx.fillStyle = '#fff6d0';
      ctx.fill();
      ctx.restore();
    } else if (f.type === 'arc') {
      // rayitos del prisma a cada gema de ese color
      ctx.save();
      ctx.globalAlpha = clamp(a * 1.2, 0, 1);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = Math.max(2, cs * 0.07);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8;
      const x0 = cx(f.x0), y0 = cy(f.y0);
      for (const [tx, ty] of f.to) {
        const x1 = cx(tx), y1 = cy(ty);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        const seg = 5;
        for (let k = 1; k < seg; k++) {
          const q = k / seg;
          const j = (Math.sin(now * 40 + k * 7 + tx * 3 + ty) * cs) / 5;
          ctx.lineTo(x0 + (x1 - x0) * q + j, y0 + (y1 - y0) * q - j);
        }
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    } else if (f.type === 'flash') {
      ctx.save();
      ctx.globalAlpha = clamp(a * 0.4, 0, 1);
      ctx.fillStyle = f.color || '#fff';
      ctx.fillRect(bx, by, bw, bw);
      ctx.restore();
    }
  }
  for (const p of parts) {
    ctx.save();
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.c;
    ctx.translate(cx(p.x), cy(p.y));
    ctx.rotate(p.rot);
    const r = p.r * cs;
    if (p.shard) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.6);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r * 1.6);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const p of pops) {
    const q = p.t;
    ctx.save();
    ctx.globalAlpha = clamp(1.4 - q * 1.4, 0, 1);
    const sz = cs * (p.big ? 0.62 : 0.44) * (q < 0.15 ? 0.6 + q * 2.7 : 1);
    ctx.font = `700 ${sz}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, sz * 0.16);
    ctx.strokeStyle = '#1a0b2e';
    const y = cy(p.y) - q * cs * 0.9;
    ctx.strokeText(p.text, cx(p.x), y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, cx(p.x), y);
    ctx.restore();
  }
  if (S.combo) {
    const q = S.combo.t;
    const sc = q < 0.2 ? easeOut(q / 0.2) * 1.15 : q < 0.3 ? 1.15 - (q - 0.2) * 1.5 : 1;
    ctx.save();
    ctx.globalAlpha = clamp((1.1 - q) * 3, 0, 1);
    ctx.translate(L.x0 + (cs * N) / 2, L.y0 + cs * N * 0.42);
    ctx.scale(sc, sc);
    ctx.rotate(-0.06);
    ctx.font = `700 ${Math.min(cs * 1.15, 64)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a0b2e';
    ctx.strokeText(S.combo.text, 0, 0);
    const g = ctx.createLinearGradient(0, -cs * 0.5, 0, cs * 0.5);
    g.addColorStop(0, '#fff1a8');
    g.addColorStop(1, '#ff9ad5');
    ctx.fillStyle = g;
    ctx.fillText(S.combo.text, 0, 0);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- animar lo que pasó en una jugada
const xyOf = (i) => ({ x: colOf(i), y: rowOf(i) });
async function play(events) {
  for (const e of events) {
    if (e.k === 'swap') await animSwap(e);
    else if (e.k === 'turn') await animTurn(e);
    else if (e.k === 'clear') await animClear(e);
    else if (e.k === 'fall') await animFall(e);
    else if (e.k === 'shuffle') await animShuffle(e);
  }
}
async function animSwap(e) {
  const va = V.get(e.ida), vb = V.get(e.idb);
  sfx.swap();
  if (!va || !vb) return;
  const A = xyOf(e.a), B = xyOf(e.b);
  await Promise.all([tween(va, { x: B.x, y: B.y }, 0.15), tween(vb, { x: A.x, y: A.y }, 0.15)]);
}
async function animBadSwap(a, b) {
  const va = V.get(S.g.id[a]), vb = V.get(S.g.id[b]);
  sfx.bad();
  toast(t('noMove'), 900);
  if (!va || !vb) return;
  const A = xyOf(a), B = xyOf(b);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  await Promise.all([tween(va, { x: A.x + (mx - A.x) * 0.9, y: A.y + (my - A.y) * 0.9 }, 0.1, easeOut), tween(vb, { x: B.x + (mx - B.x) * 0.9, y: B.y + (my - B.y) * 0.9 }, 0.1, easeOut)]);
  await Promise.all([tween(va, { x: A.x, y: A.y }, 0.16, easeOut), tween(vb, { x: B.x, y: B.y }, 0.16, easeOut)]);
}
async function animTurn(e) {
  const P = xyOf(e.cell);
  if (e.turned.length > 1) {
    addFx({ type: 'arc', x0: P.x, y0: P.y, to: e.turned.map((x) => [colOf(x.cell), rowOf(x.cell)]), color: GEMS[e.color]?.light || '#fff', dur: 0.45 });
    sfx.prism();
  }
  sfx.turn();
  for (const x of e.turned) {
    const v = V.get(x.id);
    if (!v) continue;
    v.sp = x.sp;
    v.flash = 1;
    tween(v, { flash: 0 }, 0.35);
    burst(colOf(x.cell), rowOf(x.cell), '#ffffff', 5, 0.6);
  }
  await wait(e.turned.length > 1 ? 0.45 : 0.25);
}
async function animClear(e) {
  const merge = new Map();
  for (const c of e.created) for (const j of c.from) merge.set(j, c.cell);
  // efectos de las especiales
  let big = 0;
  e.fx.forEach((f, k) => {
    const P = xyOf(f.cell);
    const color = f.color >= 0 && f.color < 6 ? GEMS[f.color].base : '#ffffff';
    const delay = k * 0.04;
    if (f.type === 'row' || f.type === 'col') addFx({ type: 'beam', h: f.type === 'row', line: f.type === 'row' ? P.y : P.x, color, dur: 0.42, t: -delay });
    else if (f.type === 'cross' || f.type === 'linebomb') {
      for (let d = -(f.rad || 0); d <= (f.rad || 0); d++) {
        if (P.y + d >= 0 && P.y + d < N) addFx({ type: 'beam', h: true, line: P.y + d, color: '#ffd84a', dur: 0.5, wide: 1.1 });
        if (P.x + d >= 0 && P.x + d < N) addFx({ type: 'beam', h: false, line: P.x + d, color: '#ffd84a', dur: 0.5, wide: 1.1 });
      }
      big = Math.max(big, 1);
    } else if (f.type === 'bomb') {
      addFx({ type: 'ring', x: P.x, y: P.y, rad: 1.6, dur: 0.45 });
      big = Math.max(big, 0.7);
    } else if (f.type === 'bomb2') {
      addFx({ type: 'ring', x: P.x, y: P.y, rad: 3.2, dur: 0.6 });
      addFx({ type: 'flash', dur: 0.3, color: '#fff3c0' });
      big = 1.6;
    } else if (f.type === 'prism') {
      addFx({ type: 'arc', x0: P.x, y0: P.y, to: f.cells.map((j) => [colOf(j), rowOf(j)]), color: f.color >= 0 && f.color < 6 ? GEMS[f.color].light : '#fff', dur: 0.5 });
      big = Math.max(big, 0.8);
    } else if (f.type === 'prism2') {
      addFx({ type: 'flash', dur: 0.5, color: '#ffffff' });
      addFx({ type: 'ring', x: P.x, y: P.y, rad: 6, dur: 0.8, color: '#ff9ad5' });
      big = 2;
    }
  });
  const types = new Set(e.fx.map((f) => f.type));
  if (types.has('prism') || types.has('prism2')) sfx.prism();
  if (types.has('bomb') || types.has('bomb2') || types.has('linebomb')) sfx.boom();
  if (types.has('row') || types.has('col') || types.has('cross') || types.has('linebomb')) sfx.zap();
  sfx.match(e.chain);
  if (big) S.shake = Math.max(S.shake, big);
  // las que se juntan en una especial vuelan hacia ella; las demás revientan
  let sx = 0, sy = 0;
  const T = e.fx.length ? 0.28 : 0.22;
  for (const c of e.cleared) {
    const v = V.get(c.id);
    const P = xyOf(c.cell);
    sx += P.x;
    sy += P.y;
    if (!v) continue;
    if (merge.has(c.cell)) {
      const to = xyOf(merge.get(c.cell));
      tween(v, { x: to.x, y: to.y, s: 0.5, a: 0 }, 0.17, easeIn);
    } else {
      const d = Math.random() * 0.05;
      tween(v, { s: 1.22 }, 0.07, easeOut, d).then(() => tween(v, { s: 0, a: 0 }, T - 0.07, easeIn));
      burst(P.x, P.y, c.t >= 0 && c.t < 6 ? GEMS[c.t].base : '#ffffff', c.sp ? 12 : 7);
    }
  }
  for (const i of e.ice) {
    S.iceShown[i] = Math.max(0, S.iceShown[i] - 1);
    burst(colOf(i), rowOf(i), '#d8f3ff', 8, 0.8);
  }
  if (e.ice.length) sfx.ice();
  if (e.cleared.length) {
    const n = e.cleared.length;
    popText(sx / n, sy / n, `+${fmt(e.score)}`, e.chain > 1 ? '#ffe680' : '#ffffff', e.chain > 2 || e.score >= 500);
  }
  if (e.chain >= 3) S.combo = { text: t(e.chain >= 6 ? 'combo6' : e.chain === 5 ? 'combo5' : e.chain === 4 ? 'combo4' : 'combo3'), t: 0 };
  await wait(0.17);
  // nacen las especiales
  for (const c of e.created) {
    const v = V.get(c.id);
    if (!v) continue;
    v.sp = c.sp;
    v.t = c.t;
    v.flash = 1;
    tween(v, { flash: 0 }, 0.3);
    burst(colOf(c.cell), rowOf(c.cell), '#ffffff', 10, 0.8);
  }
  if (e.created.length) sfx.made();
  updateLive();
  await wait(Math.max(0.06, T - 0.12));
}
async function animFall(e) {
  const jobs = [];
  let maxT = 0;
  const fallT = (d) => 0.1 + 0.07 * Math.pow(Math.max(0, d), 0.75);
  for (const m of e.moves) {
    const v = V.get(m.id);
    if (!v) continue;
    const to = rowOf(m.to);
    const T = fallT(to - v.y);
    maxT = Math.max(maxT, T);
    jobs.push(tween(v, { y: to }, T, easeIn));
  }
  for (const s of e.spawns) {
    const v = mkVis(s.id, s.t, 0, s.to);
    v.y = s.fromRow;
    V.set(s.id, v);
    const T = fallT(rowOf(s.to) - s.fromRow) + 0.02;
    maxT = Math.max(maxT, T);
    jobs.push(tween(v, { y: rowOf(s.to) }, T, easeIn));
  }
  await Promise.all(jobs);
  if (jobs.length) sfx.land();
}
async function animShuffle(e) {
  banner(t('shuffle'));
  sfx.shuffle();
  await Promise.all(
    e.map.map((m) => {
      const v = V.get(m.id);
      if (!v) return null;
      if (m.t !== undefined) v.t = m.t;
      const P = xyOf(m.to);
      return tween(v, { x: P.x, y: P.y, r: Math.PI * 2 }, 0.55);
    }),
  );
  for (const m of e.map) {
    const v = V.get(m.id);
    if (v) v.r = 0;
  }
}

// ---------------------------------------------------------------- pantallas y avisos
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode && !S.over);
}
function setPlaying(on) {
  document.body.classList.toggle('playing', on);
  $('hud').hidden = !on;
  if (on) requestAnimationFrame(resize);
}
let toastT = 0;
function toast(txt, ms = 1600) {
  const el = $('toast');
  el.textContent = txt;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), ms);
}
function banner(big, small = '', stay = false) {
  const el = $('banner');
  el.innerHTML = `${esc(big)}${small ? `<small>${esc(small)}</small>` : ''}`;
  el.classList.remove('on', 'stay');
  void el.offsetWidth;
  if (big || small) el.classList.add(stay ? 'stay' : 'on');
}
function confetti() {
  if (reduced()) return;
  const cols = GEMS.map((g) => g.base).concat(['#fff', '#ffd84a']);
  let html = '';
  for (let i = 0; i < 60; i++) html += `<i style="--x:${((Math.random() - 0.5) * 680).toFixed(0)}px;--y:${(120 + Math.random() * 440).toFixed(0)}px;--r:${((Math.random() - 0.5) * 900).toFixed(0)}deg;--c:${cols[i % cols.length]};--d:${(Math.random() * 0.3).toFixed(2)}s;left:${38 + Math.random() * 24}%"></i>`;
  $('confetti').innerHTML = html;
  setTimeout(() => ($('confetti').innerHTML = ''), 2600);
}

// ---------------------------------------------------------------- el panel de arriba
const movesLeft = () => (S.lv ? S.lv.moves - S.g.moves - S.extra : S.race ? S.race.moves - S.g.moves : 0);
function renderHud() {
  if (!S.g) return;
  const m = S.mode;
  $('lvl').textContent = m === 'level' ? t('level', { n: S.lv.n }) : m === 'daily' ? t('daily') : m === 'timed' ? t('timed') : t('duel');
  $('lvl-sub').textContent =
    m === 'level' ? (S.lv.kind === 'score' ? t('gScore', { p: fmt(S.lv.goal.score) }) : S.lv.kind === 'collect' ? t('gCollect') : t('gIce')) : m === 'daily' ? t('gDaily') : m === 'timed' ? t('gTimed') : '';
  const timed = m === 'timed';
  const left = timed ? Math.ceil(S.timeLeft) : Math.max(0, movesLeft());
  $('moves').textContent = left;
  $('moves-lbl').textContent = timed ? t('secsLbl') : t('movesLbl');
  $('moves-box').classList.toggle('low', !S.over && (timed ? left <= 10 : left <= 3));
  updateLive();
}
/** Lo que cambia durante una jugada: puntaje, estrellas y objetivos. */
function updateLive() {
  if (!S.g) return;
  $('score').textContent = fmt(S.g.score);
  const st = S.lv?.stars;
  const bar = $('bar');
  bar.hidden = !st || S.mode === 'race';
  if (st && S.mode !== 'race') {
    const max = st[2] * 1.08;
    $('bar-fill').style.width = `${clamp((S.g.score / max) * 100, 0, 100)}%`;
    $$('#bar em').forEach((em, k) => {
      const show = S.lv.kind === 'score' || S.mode === 'daily' || k > 0;
      em.hidden = !show;
      em.style.left = `${(st[k] / max) * 100}%`;
      const on = S.g.score >= st[k] && (k > 0 || S.lv.kind === 'score' || S.mode === 'daily');
      if (on && !em.classList.contains('on') && S.clock > S.quietUntil) sfx.star(k);
      em.classList.toggle('on', on);
    });
  }
  const goals = $('goals');
  if (S.mode === 'level' && S.lv.kind === 'collect') {
    goals.innerHTML = S.lv.goal.collect.map(([k, n]) => `<span class="goal${S.g.collected[k] >= n ? ' done' : ''}"><img src="${gemIcon(k)}" alt="${esc(GEM_NAMES[lang()][k])}" /><b>${Math.min(S.g.collected[k], n)}/${n}</b></span>`).join('');
  } else if (S.mode === 'level' && S.lv.kind === 'ice') {
    const left = S.g.iceLeft;
    goals.innerHTML = `<span class="goal${left === 0 ? ' done' : ''}"><i class="ice"></i><b>${left}</b></span>`;
  } else goals.innerHTML = '';
  if (S.mode === 'race') renderRace();
}

// ---------------------------------------------------------------- jugar
function input() {
  S.idle = 0;
  S.hint = null;
}
const canPlay = () => !!S.g && !S.busy && !S.over && !S.paused && !(S.mode === 'race' && (!S.race || S.race.phase !== 'play')) && !$$('.screen.on').length && (S.mode !== 'timed' || S.timeLeft > 0);
async function trySwap(a, b) {
  if (!canPlay() || !adjacent(a, b)) return;
  input();
  S.sel = -1;
  const ev = S.g.swap(a, b);
  S.busy = true;
  if (!ev) {
    await animBadSwap(a, b);
    S.busy = false;
    return;
  }
  S.str += encodeMove(a, b);
  renderHud();
  await play(ev);
  syncVisuals();
  S.busy = false;
  input();
  await afterMove();
}
async function afterMove() {
  renderHud();
  sendProgress();
  if (S.mode === 'daily') save('dsave', { date: S.daily.date, moves: S.str });
  if (S.mode === 'race') raceSave();
  if (S.mode === 'level') {
    const met = goalMet(S.lv, S.g);
    if (S.lv.kind !== 'score' && met) return finale();
    if (movesLeft() <= 0) return endLevel(S.lv.kind === 'score' ? S.g.score >= S.lv.goal.score : met);
  } else if (S.mode === 'daily') {
    if (movesLeft() <= 0) return endDaily();
  } else if (S.mode === 'race') {
    if (movesLeft() <= 0) return finishRace();
  } else if (S.mode === 'timed' && S.timeLeft <= 0) endTimed();
}
/** Objetivo cumplido con jugadas de sobra: cada una se vuelve un rayo que explota. */
async function finale() {
  S.busy = true;
  sfx.win();
  banner(t('goalDone'));
  await wait(1.0);
  const left = movesLeft();
  if (left > 0) {
    banner(t('rain'));
    await wait(0.7);
    speedK = 0.65;
    for (let k = 0; k < left; k++) {
      const ev = S.g.bonusLine();
      if (!ev) break;
      S.extra++;
      renderHud();
      await play(ev);
      syncVisuals();
    }
    speedK = 1;
  }
  S.busy = false;
  endLevel(true);
}

// ---------------------------------------------------------------- entrada: tocar, deslizar, teclado
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  if (!canPlay()) return;
  unlock();
  const r = cv.getBoundingClientRect();
  const i = cellAt(e.clientX - r.left, e.clientY - r.top);
  if (i < 0) {
    S.sel = -1;
    return;
  }
  input();
  S.cur = -1;
  drag = { i, x: e.clientX, y: e.clientY, id: e.pointerId, wasSel: S.sel === i };
  try {
    cv.setPointerCapture(e.pointerId);
  } catch {}
  if (S.sel >= 0 && S.sel !== i && adjacent(S.sel, i)) {
    const a = S.sel;
    drag = null;
    trySwap(a, i);
    return;
  }
  if (S.sel !== i) sfx.pick();
  S.sel = i;
});
cv.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) < L.cs * 0.35) return;
  const r = rowOf(drag.i), c = colOf(drag.i);
  const [nr, nc] = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
  const a = drag.i;
  drag = null;
  if (nr < 0 || nr >= N || nc < 0 || nc >= N) return;
  trySwap(a, idx(nr, nc));
});
const endDrag = (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  if (drag.wasSel && e.type === 'pointerup') S.sel = -1; // tocar otra vez la elegida la suelta
  drag = null;
};
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key;
  if (document.querySelector('#s-pause.on')) {
    if (k === 'Escape' || k === 'p' || k === 'P') resume();
    return;
  }
  if (!S.mode || $$('.screen.on').length) return;
  if (k === 'Escape' || k === 'p' || k === 'P') return pause();
  if (k === 'h' || k === 'H') {
    if (S.mode === 'level' || S.mode === 'timed') {
      input();
      S.hint = bestMove(S.g);
      S.idle = 7;
    }
    return;
  }
  const dir = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], a: [0, -1], d: [0, 1], w: [-1, 0], s: [1, 0] }[k];
  if (dir) {
    e.preventDefault();
    if (S.cur < 0) S.cur = S.sel >= 0 ? S.sel : idx(N / 2, N / 2 - 1);
    const r = rowOf(S.cur) + dir[0], c = colOf(S.cur) + dir[1];
    if (S.sel >= 0) {
      // con una elegida, la flecha la cambia hacia ese lado
      if (r >= 0 && r < N && c >= 0 && c < N) {
        const a = S.sel;
        S.cur = idx(r, c);
        trySwap(a, idx(r, c));
      }
      return;
    }
    if (r >= 0 && r < N && c >= 0 && c < N) S.cur = idx(r, c);
    input();
    return;
  }
  if (k === 'Enter' || k === ' ') {
    e.preventDefault();
    if (!canPlay()) return;
    if (S.cur < 0) S.cur = idx(N / 2, N / 2 - 1);
    if (S.sel === S.cur) S.sel = -1;
    else if (S.sel >= 0 && adjacent(S.sel, S.cur)) trySwap(S.sel, S.cur);
    else {
      S.sel = S.cur;
      sfx.pick();
    }
    input();
  }
});

// ---------------------------------------------------------------- empezar
function begin(mode, g, extra = {}) {
  S.mode = mode;
  S.g = g;
  S.str = '';
  S.busy = false;
  S.over = false;
  S.paused = false;
  S.sel = -1;
  S.cur = -1;
  S.hint = null;
  S.idle = 0;
  S.extra = 0;
  S.combo = null;
  S.shake = 0;
  S.lv = null;
  S.race = null;
  Object.assign(S, extra);
  V.clear();
  FX.length = 0;
  parts.length = 0;
  pops.length = 0;
  tweens.length = 0;
  timers.length = 0;
  speedK = 1;
  S.quietUntil = S.clock + 0.3; // al retomar una partida avanzada no suenan las estrellas ya ganadas
  syncVisuals();
  $('race').hidden = mode !== 'race';
  $$('#bar em').forEach((em) => em.classList.remove('on'));
  banner('');
  setPlaying(true);
  resize();
  renderHud();
}
/** Muestra el objetivo del nivel y espera el "¡Vamos!". */
function openLevel(n) {
  const lv = levelOf(n);
  S.pendingLevel = n;
  $('goal-kicker').textContent = t('level', { n });
  const big = $('goal-big');
  if (lv.kind === 'score') {
    $('goal-title').textContent = t('gScore', { p: fmt(lv.goal.score) });
    big.innerHTML = `<span><i class="star"></i><b>${fmt(lv.goal.score)}</b><small>${esc(t('points'))}</small></span>`;
    $('goal-text').textContent = t('goalScoreLong', { p: fmt(lv.goal.score), m: lv.moves });
  } else if (lv.kind === 'collect') {
    $('goal-title').textContent = t('gCollect');
    big.innerHTML = lv.goal.collect.map(([k, c]) => `<span><img src="${gemIcon(k)}" alt="" /><b>${c}</b><small>${esc(GEM_NAMES[lang()][k])}</small></span>`).join('');
    $('goal-text').textContent = t('goalCollectLong', { m: lv.moves });
  } else {
    $('goal-title').textContent = t('gIce');
    big.innerHTML = `<span><i class="ice"></i><b>${lv.goal.ice}</b><small>${esc(t('iceLbl'))}</small></span>`;
    $('goal-text').textContent = t('goalIceLong', { m: lv.moves });
  }
  show('goal');
}
function startLevel(n) {
  const lv = levelOf(n);
  begin('level', new Game(lv.seed, { types: lv.types, ice: lv.ice }), { lv });
  show(null);
}
$('b-goal-go').onclick = () => {
  unlock();
  startLevel(S.pendingLevel);
};
$('b-goal-back').onclick = () => toMenu();
function dailyInfo() {
  const date = today();
  return { date, n: dayNumber(EPOCH, date), rec: loadDay(ID, 'all', date) };
}
function startDaily() {
  const d = dailyInfo();
  if (d.rec) return showDailyEnd(d, true);
  const lv = dailyLevel(d.date);
  markPortal(ID, { date: d.date, done: false, won: false });
  let g = new Game(lv.seed, { types: lv.types });
  const sv = load('dsave', null);
  let str = '';
  if (sv && sv.date === d.date && typeof sv.moves === 'string') {
    const r = replay(lv.seed, { types: lv.types }, sv.moves, { limit: lv.moves });
    if (r) {
      g = r;
      str = sv.moves;
    }
  }
  begin('daily', g, { lv, daily: d });
  S.str = str;
  show(null);
  renderHud();
  if (movesLeft() <= 0) endDaily();
}
function startTimed() {
  begin('timed', new Game(hashSeed(`gemas-timed-${Date.now()}-${Math.random()}`), { types: 6 }), { timeLeft: TIMED_SECS });
  show(null);
  renderHud();
}

// ---------------------------------------------------------------- fin de partida
let dayTimer = 0;
function setEnd({ kicker, title, stars = -1, stats, main, alt, share: sh = false, day = null }) {
  $('end-kicker').textContent = kicker;
  $('end-title').textContent = title;
  const st = $('end-stars');
  st.hidden = stars < 0;
  if (stars >= 0) {
    st.innerHTML = [0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="--d:${0.2 + i * 0.22}s"></i>`).join('');
    for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(i), 250 + i * 220);
  }
  $('end-stats').innerHTML = stats.map(([v, k]) => `<span><b>${esc(v)}</b><small>${esc(k)}</small></span>`).join('');
  $('end-stats').style.gridTemplateColumns = `repeat(${stats.length}, 1fr)`;
  $('end-day').hidden = !day;
  $('end-next').hidden = !day;
  clearInterval(dayTimer);
  if (day) {
    $('end-day').innerHTML = day.map(([v, k]) => `<span><b>${esc(v)}</b><small>${esc(k)}</small></span>`).join('');
    const shown = today();
    const tick = () => {
      $('end-clock').textContent = fmtClock(msUntilNext());
      if (today() !== shown) {
        clearInterval(dayTimer);
        refreshHome();
      }
    };
    tick();
    dayTimer = setInterval(tick, 1000);
  }
  $('b-share').hidden = !sh;
  $('end-status').textContent = '';
  $('b-end-main').hidden = !main;
  $('b-end-alt').hidden = !alt;
  if (main) {
    $('b-end-main-t').textContent = main[0];
    $('b-end-main').onclick = main[1];
  }
  if (alt) {
    $('b-end-alt-t').textContent = alt[0];
    $('b-end-alt').onclick = alt[1];
  }
  show('end');
}
async function endLevel(won) {
  if (S.over) return;
  S.over = true;
  const lv = S.lv;
  const score = S.g.score;
  await wait(won ? 0.4 : 0.6);
  if (won) {
    const st = Math.max(1, starsFor(lv, score, true));
    PROG.stars[lv.n] = Math.max(PROG.stars[lv.n] || 0, st);
    PROG.best[lv.n] = Math.max(PROG.best[lv.n] || 0, score);
    PROG.level = Math.max(PROG.level, lv.n + 1);
    save('progress', PROG);
    confetti();
    setEnd({
      kicker: t('winKicker'),
      title: t('level', { n: lv.n }),
      stars: st,
      stats: [[fmt(score), t('stScore')], [fmt(PROG.best[lv.n]), t('stBest')], [S.g.bestChain, t('stChain')]],
      main: [t('nextLevel'), () => openLevel(lv.n + 1)],
      alt: [t('replayLevel'), () => openLevel(lv.n)],
    });
  } else {
    sfx.lose();
    banner(t('outOfMoves'));
    await wait(1.2);
    let miss = '';
    if (lv.kind === 'score') miss = t('missScore', { p: fmt(lv.goal.score - score) });
    else if (lv.kind === 'collect')
      miss = t('missCollect', {
        list: lv.goal.collect
          .filter(([k, n]) => S.g.collected[k] < n)
          .map(([k, n]) => `${n - S.g.collected[k]} ${GEM_NAMES[lang()][k]}`)
          .join(', '),
      });
    else miss = t('missIce', { n: S.g.iceLeft });
    setEnd({
      kicker: t('loseKicker'),
      title: t('loseTitle'),
      stars: -1,
      stats: [[fmt(score), t('stScore')], [miss, '']],
      main: [t('retry'), () => openLevel(lv.n)],
      alt: null,
    });
    $('end-stats').style.gridTemplateColumns = '1fr';
  }
}
function endDaily() {
  if (S.over) return;
  S.over = true;
  const d = S.daily;
  const lv = S.lv;
  const score = S.g.score;
  const st = starsFor(lv, score, true);
  const stats = record(ID, 'all', { date: d.date, won: true, score: st });
  saveDay(ID, 'all', { score, stars: st, chain: S.g.bestChain, made: S.g.made }, d.date);
  markPortal(ID, { date: d.date, done: true, won: true, streak: stats.streak });
  save('dsave', null);
  sfx.win();
  if (st) confetti();
  setTimeout(() => showDailyEnd(dailyInfo(), false), 900);
}
function showDailyEnd(d, fromMenu) {
  const rec = d.rec || loadDay(ID, 'all', d.date);
  if (!rec) return;
  const stt = loadStats(ID, 'all');
  setEnd({
    kicker: t('dailyKicker', { n: d.n }),
    title: `${fmt(rec.score)} ${t('points')}`,
    stars: rec.stars,
    stats: [[fmt(rec.score), t('stScore')], [rec.chain ?? 0, t('stChain')], [rec.made ?? 0, t('stMade')]],
    day: [[stt.played, t('stPlayed')], [stt.streak, t('stStreak')], [Math.max(stt.best || 0, stt.streak), t('stBestStreak')]],
    share: true,
    main: null,
    alt: null,
  });
  if (fromMenu) G.gameplay(false);
}
$('b-share').onclick = async () => {
  const d = dailyInfo();
  const rec = d.rec;
  if (!rec) return;
  const gems = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
  const r = await share(`game.it · ${t('daily')} #${d.n}\n💎 ${fmt(rec.score)} ${t('points')} ${'⭐'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}\n${gems.join('')}\n${shareLink(ID)}`);
  $('end-status').textContent = r === 'failed' ? '' : t('sharedOk');
};
async function endTimed() {
  if (S.over || S.mode !== 'timed') return;
  S.over = true;
  S.sel = -1;
  while (S.busy) await wait(0.1);
  banner(t('timeUp'));
  sfx.go();
  await wait(1.2);
  const score = S.g.score;
  const best = score > TIMED_BEST;
  if (best) {
    TIMED_BEST = score;
    save('timed', score);
    confetti();
  }
  setEnd({
    kicker: best ? t('newBest') : t('timedKicker'),
    title: `${fmt(score)} ${t('points')}`,
    stars: -1,
    stats: [[fmt(score), t('stScore')], [fmt(TIMED_BEST), t('stBest')], [S.g.bestChain, t('stChain')]],
    main: [t('again'), () => startTimed()],
    alt: null,
  });
}
$('b-end-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- niveles
let lvPage = 0;
const PER_PAGE = 20;
function renderLevels() {
  const cur = PROG.level;
  const pages = Math.max(1, Math.ceil(Math.max(cur + 10, PER_PAGE) / PER_PAGE));
  lvPage = clamp(lvPage, 0, pages - 1);
  const mark = { score: '🎯', collect: '💎', ice: '❄' };
  const html = [];
  for (let k = 0; k < PER_PAGE; k++) {
    const n = lvPage * PER_PAGE + k + 1;
    const stars = PROG.stars[n] || 0;
    html.push(`<button data-n="${n}" class="${n === cur ? 'cur' : stars ? 'done' : ''}" ${n > cur ? 'disabled' : ''}><em>${mark[['score', 'collect', 'ice'][(n - 1) % 3]]}</em>${n}${stars ? `<small>${'★'.repeat(stars)}</small>` : ''}</button>`);
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
    openLevel(+b.dataset.n);
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

// ---------------------------------------------------------------- menú y pausa
function toMenu() {
  clearInterval(dayTimer);
  if (S.mode === 'race') lobby.leave();
  S.mode = null;
  S.g = null;
  S.race = null;
  S.busy = false;
  S.paused = false;
  banner('');
  setPlaying(false);
  refreshHome();
  show('home');
}
function refreshHome() {
  $('b-play-t').textContent = PROG.level > 1 ? t('play') : t('playNew');
  $('b-play-sub').textContent = t('playSub', { n: PROG.level });
  const d = dailyInfo();
  const sv = load('dsave', null);
  $('b-daily-sub').textContent = d.rec ? t('dailyDone', { n: d.n, p: fmt(d.rec.score) }) : sv && sv.date === d.date && sv.moves ? t('dailyGo', { n: d.n }) : t('dailySub', { n: d.n });
  $('b-timed-sub').textContent = TIMED_BEST ? t('timedBest', { p: fmt(TIMED_BEST) }) : t('timedSub');
}
$('b-play').onclick = () => {
  unlock();
  openLevel(PROG.level);
};
$('b-daily').onclick = () => {
  unlock();
  startDaily();
};
$('b-timed').onclick = () => {
  unlock();
  startTimed();
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
  if (!S.mode || S.over || $$('.screen.on').length) return;
  if (S.mode !== 'race') S.paused = true;
  $('b-restart').hidden = S.mode === 'daily' || S.mode === 'race';
  show('pause');
}
function resume() {
  S.paused = false;
  show(null);
}
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-restart').onclick = () => {
  if (S.mode === 'level') openLevel(S.lv.n);
  else if (S.mode === 'timed') startTimed();
};
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- duelo online
const others = new Map();
let lastSent = 0;
let sentKey = '';
const lobby = new RaceLobby({
  game: ID,
  settings: ['moves'],
  defaults: { moves: '30' },
  show: (id) => {
    S.mode = 'race';
    S.race = null;
    show(id);
  },
  onRace: beginRace,
  onLobby: () => {
    setPlaying(false);
    S.race = null;
    banner('');
  },
  onMessage: onNet,
  onRoom: (room) => room.state === 'finished' && document.querySelector('#s-results.on') && showResults(),
  onClosed: () => {
    toMenu();
    show('online');
  },
});
/** La partida del duelo en curso queda guardada en la pestaña: si se recarga la página, sigue donde estaba. */
const RACE_KEY = `gameit:${ID}:race`;
function raceSaved(r) {
  try {
    const v = JSON.parse(sessionStorage.getItem(RACE_KEY));
    return v && v.seed === r.seed && v.startAt === r.startAt && typeof v.str === 'string' ? v.str : '';
  } catch {
    return '';
  }
}
function raceSave() {
  try {
    sessionStorage.setItem(RACE_KEY, JSON.stringify({ seed: S.race.seed, startAt: S.race.startAt, str: S.str }));
  } catch {}
}
function beginRace(room) {
  const r = room.race;
  const str = raceSaved(r);
  const g = (str && replay(r.seed, { types: 6 }, str, { limit: r.moves })) || new Game(r.seed, { types: 6 });
  begin('race', g, { race: { seed: r.seed, startAt: r.startAt, moves: r.moves, phase: 'countdown', tick: 0 }, results: null });
  if (g.moves) S.str = str;
  others.clear();
  for (const p of room.players) if (p.id !== lobby.net.myId) others.set(p.id, { name: p.name, color: p.color, score: 0, left: r.moves, fin: false });
  sentKey = '';
  show(null);
  renderHud();
  banner(t('ready'), '', true);
}
function sendProgress(force = false) {
  if (S.mode !== 'race' || !S.race || S.race.phase === 'countdown') return;
  const key = `${S.g.score}:${S.g.moves}`;
  const now = performance.now();
  if (!force && (key === sentKey || now - lastSent < 300)) return;
  sentKey = key;
  lastSent = now;
  lobby.net.raw({ t: 'state', s: [S.g.score, S.g.moves] });
}
async function finishRace() {
  if (S.race.phase === 'done') return;
  S.race.phase = 'done';
  S.over = true;
  sendProgress(true);
  lobby.net.send({ t: 'finish', moves: S.str });
  banner(t('doneMoves'), t('waitOthers'), true);
  sfx.win();
  await wait(1.2);
  showResults();
}
function onNet(m) {
  if (m.t === 'state') {
    const o = others.get(m.id);
    if (o) {
      o.score = Number(m.s[0]) || 0;
      o.left = S.race ? S.race.moves - (Number(m.s[1]) || 0) : 0;
    }
    return;
  }
  if (m.t === 'finished') {
    const o = others.get(m.id);
    if (o) {
      o.fin = true;
      o.score = m.score;
      o.left = 0;
    }
    if (S.race?.phase === 'done') showResults();
    return;
  }
  if (m.t === 'end') {
    S.results = m.results;
    if (S.mode === 'race') {
      if (S.race) S.race.phase = 'done';
      S.over = true;
      showResults();
    }
  }
}
function renderRace() {
  if (S.mode !== 'race' || !S.race) return;
  const me = { id: lobby.net.myId, name: lobby.name, color: '#ffd23f', score: S.g.score, left: movesLeft(), fin: S.race.phase === 'done', me: true };
  const all = [me, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))].sort((a, b) => b.score - a.score);
  $('race').innerHTML = all.map((p) => `<span class="rp${p.me ? ' me' : ''}${p.fin ? ' done' : ''}" style="--c2:${esc(p.color)}"><i></i>${esc(p.name)}${p.me ? ` (${esc(t('you'))})` : ''} <b>${fmt(p.score)}</b></span>`).join('');
}
function showResults() {
  if (S.mode !== 'race' || !S.race) return;
  const final = S.results;
  const me = lobby.net.myId;
  let rows;
  if (final) rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, dnf: !!r.dnf, val: r.dnf ? t('dnf', { p: fmt(r.score || 0) }) : fmt(r.score) }));
  else {
    const all = [{ id: me, name: lobby.name, color: '#fff', fin: true, score: S.g.score }, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))];
    all.sort((a, b) => (b.fin ? 1 : 0) - (a.fin ? 1 : 0) || b.score - a.score);
    rows = all.map((r) => ({ id: r.id, name: r.name, color: r.color, val: r.fin ? fmt(r.score) : `${fmt(r.score)} …` }));
  }
  const place = rows.findIndex((r) => r.id === me) + 1;
  const mine = rows[place - 1];
  $('res-title').textContent = !final ? t('waitOthers') : mine && !mine.dnf ? (place === 1 ? t('win') : t('place', { n: place })) : t('raceOver');
  $('res-rank').innerHTML = rows.map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${esc(r.color)}"></i><span>${esc(r.name)}${r.id === me ? ` (${esc(t('you'))})` : ''}</span><b>${esc(r.val)}</b></li>`).join('');
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && mine && !mine.dnf && place === 1) sfx.win();
  banner('');
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
  if (S.mode !== 'race' || !S.race) return;
  renderRace();
  const r = S.race;
  if (r.phase === 'play') sendProgress();
  if (r.phase !== 'countdown') return;
  const left = (r.startAt - lobby.net.serverNow()) / 1000;
  if (left > 0) {
    const n = Math.ceil(left);
    if (n !== r.tick) {
      r.tick = n;
      banner(String(n), t('ready'), true);
      sfx.tick();
    }
  } else {
    r.phase = 'play';
    banner(t('goNow'));
    sfx.go();
    sendProgress(true);
  }
}, 200);

// ---------------------------------------------------------------- arranque
new ResizeObserver(() => resize()).observe(cv);
addEventListener('blur', () => S.mode && S.mode !== 'race' && !S.over && pause());
document.addEventListener('visibilitychange', () => document.hidden && S.mode && S.mode !== 'race' && !S.over && pause());
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => {
  if (!$$('.screen.on').length) S.paused = false;
});
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  renderRules();
  refreshHome();
  if (S.g) renderHud();
}, true);
requestAnimationFrame(frame);
resize();
if (lobby.pending) {
  S.mode = 'race';
  show('online');
} else show('home');
G.gameplay(false);

if (DEBUG)
  window.__gemas = {
    S,
    V,
    L,
    PROG,
    levelOf,
    openLevel,
    startLevel,
    startDaily,
    startTimed,
    trySwap,
    toMenu,
    sync: syncVisuals,
    renderHud,
    slow: (k) => (timeScale = k),
    lobby,
    bestMove: () => bestMove(S.g),
    /** Juega `n` jugadas con la compu (para probar finales, cascadas y el online). */
    async autoplay(n = 999) {
      for (let k = 0; k < n && S.mode && !S.over; k++) {
        while (S.busy) await wait(0.05);
        if (S.over || !S.mode) break;
        const mv = bestMove(S.g);
        if (!mv) break;
        await trySwap(mv[0], mv[1]);
      }
    },
  };
G.ready();
