/* Drift Neon — game.it
 * Carreras de derrape vistas desde arriba en nueve pistas de neón.
 * Modos: carrera contra la compu, contrarreloj con fantasma de tu mejor recorrido de la sesión,
 * desafío de drift, 2 jugadores en pantalla dividida (con o sin compu) y carrera online.
 *
 * La física corre a paso fijo (120 por segundo) y el tiempo de carrera se cuenta en pasos, así un
 * bajón de cuadros no cambia los tiempos. El dibujo interpola entre pasos.
 */
import { TRACKS, build, locate } from './tracks.js';
import { makeCar, stepCar, hitWall, kmh, TUNE } from './shared/car.js';
import { makeDriver, drive, racingLine } from './shared/ai.js';
import { Painter, prepare, outline } from './render.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock, vol } from '/shared/sfx.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const TXT = {
  tagline: { es: 'Derrapá, cargá nitro y bajá tus tiempos', en: 'Drift, charge nitro and cut your times' },
  race: { es: 'CARRERA', en: 'RACE' },
  raceSub: { es: 'Contra hasta 5 pilotos de la compu', en: 'Against up to 5 CPU drivers' },
  trial: { es: 'CONTRARRELOJ', en: 'TIME TRIAL' },
  trialSub: { es: 'Superá a tu fantasma: tu mejor recorrido de la sesión', en: 'Beat your ghost: your best run this session' },
  driftMode: { es: 'DESAFÍO DE DRIFT', en: 'DRIFT CHALLENGE' },
  driftSub: { es: 'Sumá puntos derrapando antes de que se acabe el tiempo', en: 'Score drift points before time runs out' },
  local: { es: '2 JUGADORES', en: '2 PLAYERS' },
  localSub: { es: 'Pantalla dividida en el mismo teclado', en: 'Split screen on one keyboard' },
  online: { es: 'CARRERA ONLINE', en: 'ONLINE RACE' },
  onlineSub: { es: 'De 1 a 6 pilotos con código de sala', en: '1 to 6 drivers with a room code' },
  laps: { es: 'Vueltas', en: 'Laps' },
  rivals: { es: 'Rivales (compu)', en: 'CPU rivals' },
  level: { es: 'Dificultad', en: 'Difficulty' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Media', en: 'Medium' },
  lv3: { es: 'Difícil', en: 'Hard' },
  duration: { es: 'Tiempo', en: 'Time' },
  go: { es: 'CORRER', en: 'RACE' },
  back: { es: '← volver', en: '← back' },
  lap: { es: 'vuelta', en: 'lap' },
  time: { es: 'tiempo', en: 'time' },
  left: { es: 'quedan', en: 'left' },
  pos: { es: 'puesto', en: 'pos' },
  record: { es: 'récord', en: 'record' },
  driftPts: { es: 'drift', en: 'drift' },
  brakeBtn: { es: 'FRENO', en: 'BRAKE' },
  wrongWay: { es: '¡CONTRAMANO!', en: 'WRONG WAY!' },
  near: { es: 'AL MURO ×1.5', en: 'WALL ×1.5' },
  create: { es: 'CREAR SALA', en: 'CREATE ROOM' },
  join: { es: 'UNIRSE', en: 'JOIN' },
  shareCode: { es: 'Compartí este código', en: 'Share this code' },
  copyLink: { es: 'COPIAR LINK', en: 'COPY LINK' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  start: { es: 'LARGAR', en: 'START' },
  waitingHost: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  you: { es: 'vos', en: 'you' },
  host: { es: 'anfitrión', en: 'host' },
  again: { es: 'OTRA VEZ', en: 'AGAIN' },
  rematch: { es: 'VOLVER A LA SALA', en: 'BACK TO ROOM' },
  change: { es: 'cambiar pista', en: 'change track' },
  menu: { es: 'menú', en: 'menu' },
  paused: { es: 'PAUSA', en: 'PAUSED' },
  resume: { es: 'SEGUIR', en: 'RESUME' },
  restart: { es: 'REINICIAR', en: 'RESTART' },
  timeUp: { es: '¡TIEMPO!', en: 'TIME UP!' },
  winner: { es: '¡GANÓ {n}!', en: '{n} WINS!' },
  youWin: { es: '¡GANASTE!', en: 'YOU WIN!' },
  place: { es: 'PUESTO {n}', en: 'PLACE {n}' },
  finished: { es: '¡LLEGASTE!', en: 'FINISHED!' },
  newBest: { es: '¡NUEVO RÉCORD!', en: 'NEW RECORD!' },
  firstRun: { es: 'Tu fantasma ya está listo: ¡superalo!', en: 'Your ghost is ready: beat it!' },
  slower: { es: '{d} más lento que tu récord ({r})', en: '{d} slower than your record ({r})' },
  faster: { es: '{d} más rápido que tu récord anterior', en: '{d} faster than your previous record' },
  ghostNote: { es: 'Fantasma: {r} (tu mejor recorrido de esta sesión)', en: 'Ghost: {r} (your best run this session)' },
  ghostNone: { es: 'Tu mejor recorrido de la sesión va a aparecer como fantasma', en: 'Your best run this session will appear as a ghost' },
  driftNote: { es: 'Récord de la sesión en esta pista: {p}', en: 'Session record on this track: {p}' },
  localNote: { es: 'J1: WASD · ESPACIO drift · SHIFT IZQ nitro — J2: flechas · . drift · / nitro', en: 'P1: WASD · SPACE drift · L-SHIFT nitro — P2: arrows · . drift · / nitro' },
  total: { es: 'total', en: 'total' },
  bestLap: { es: 'mejor vuelta', en: 'best lap' },
  points: { es: 'puntos', en: 'points' },
  bestCombo: { es: 'mejor combo', en: 'best combo' },
  sessionBest: { es: 'récord sesión', en: 'session best' },
  lost: { es: '¡COMBO PERDIDO!', en: 'COMBO LOST!' },
  lastLap: { es: 'ÚLTIMA VUELTA', en: 'FINAL LAP' },
  waitOthers: { es: 'Esperando que lleguen los demás…', en: 'Waiting for the others…' },
  dnf: { es: 'no terminó', en: 'DNF' },
  player: { es: 'Jugador {n}', en: 'Player {n}' },
  lapN: { es: 'Vuelta {n}', en: 'Lap {n}' },
  reward: { es: '▶ LARGAR CON NITRO LLENO', en: '▶ START WITH FULL NITRO' },
  keys: { es: '<kbd>↑↓←→</kbd>/<kbd>WASD</kbd> manejar · <kbd>ESPACIO</kbd> freno de mano · <kbd>SHIFT</kbd> nitro<br><kbd>C</kbd> cámara · <kbd>R</kbd> reiniciar · <kbd>ESC</kbd> pausa', en: '<kbd>↑↓←→</kbd>/<kbd>WASD</kbd> drive · <kbd>SPACE</kbd> handbrake · <kbd>SHIFT</kbd> nitro<br><kbd>C</kbd> camera · <kbd>R</kbd> restart · <kbd>ESC</kbd> pause' },
  howDrift: { es: 'Para derrapar: doblá y tirá del freno de mano, después dosificá con acelerador y contravolante.', en: 'To drift: turn and pull the handbrake, then balance it with throttle and countersteer.' },
  howTouch: { es: 'Acelera solo. Mantené DRIFT mientras doblás para cruzar el auto.', en: 'Auto throttle. Hold DRIFT while turning to kick the tail out.' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fmt = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
};
const fmtD = (ms) => `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(2)}`;
const km = (T) => `${(T.length / 10000).toFixed(1)} km`;
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

const STEP = 1 / 120;
const SECTORS = 3; // parciales por vuelta
const AI_NAMES = ['Vector', 'Nova', 'Kaizen', 'Lumen', 'Ronin', 'Zenit', 'Pixel', 'Blitz', 'Orbit', 'Sable'];
const AI_COLORS = ['#ffb800', '#b6ff00', '#9d6bff', '#ff3b5c', '#ff7a2f', '#3dffa8'];
const NONE = { gas: 0, brake: 0, steer: 0, hand: false, boost: false };

// ================================================================ estado
const S = {
  state: 'menu', // menu | count | race | done
  mode: 'race',
  o: null, // opciones de la carrera en curso
  opts: { track: 0, laps: 3, rivals: 3, level: 2, time: 90 },
  setupMode: 'race',
  T: build(TRACKS[0]),
  cars: [],
  views: [],
  rt: 0, // tiempo de carrera (ms, en pasos de física)
  countT: 0,
  paused: false,
  acc: 0,
  ghost: null,
  rec: null,
  ghosts: {}, // pista:vueltas → { time, frames, splits, laps }
  bestLap: {},
  driftBest: {},
  camMode: 'chase',
  bonusNitro: false,
  doneAt: 0,
  seed: 1,
};
try {
  S.camMode = localStorage.getItem('drift.cam') === 'top' ? 'top' : 'chase';
} catch {}
let online = null;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ================================================================ autos
function racer(o) {
  const c = makeCar({
    id: o.id ?? null,
    name: o.name || '',
    label: o.label ?? null,
    color: o.color,
    human: !!o.human,
    slot: o.slot ?? -1,
    remote: !!o.remote,
    ai: o.ai || null,
    idx: -1,
    sPrev: 0,
    run: 0,
    lat: 0,
    lapsDone: -1,
    lapStartT: 0,
    lapTimes: [],
    best: null,
    finished: false,
    finishT: null,
    sector: -1,
    splits: [],
    dpts: 0,
    bestCombo: 0,
    maxMult: 1,
    combo: { pts: 0, t: 0, mult: 1, idle: 0, near: false },
    wrongT: 0,
    rw: null,
    inp: { ...NONE },
    inBrake: false,
    px: 0,
    py: 0,
    ph: 0,
    draw: { x: 0, y: 0, h: 0 },
    smokeT: 0,
    hitT: 0,
  });
  return c;
}

/** Grilla detrás de la línea de largada: dos columnas escalonadas. */
function placeOnGrid(c, slot) {
  const T = S.T;
  const back = 70 + slot * 58;
  const side = (slot % 2 ? 1 : -1) * T.width * 0.22;
  let i = T.N - 1;
  while (i > 0 && T.length - T.dist[i] < back) i--;
  const nx = -T.ty[i];
  const ny = T.tx[i];
  c.x = c.px = T.xs[i] + nx * side;
  c.y = c.py = T.ys[i] + ny * side;
  c.h = c.ph = Math.atan2(T.ty[i], T.tx[i]);
  c.vx = c.vy = c.w = 0;
  c.idx = i;
  const L = locate(T, c.x, c.y, i);
  c.sPrev = L.s;
  c.run = L.s - T.length;
  c.draw.x = c.x;
  c.draw.y = c.y;
  c.draw.h = c.h;
}

function aiDriver(level, r) {
  const d = makeDriver(level, r);
  d.base = d.aggro;
  return d;
}

// ================================================================ física de la carrera
function stepRacer(c, dt, racing) {
  const T = S.T;
  let inp;
  if (c.ai && (racing || c.finished || S.state === 'menu' || S.state === 'done')) inp = drive(c.ai, c, T, dt, S.cars);
  else if (c.human && racing && !c.finished) inp = c.inp;
  else inp = NONE;
  stepCar(c, inp, dt, T.grip);
  c.inBrake = (inp.brake > 0.2 && c.u > 30) || (inp.hand && c.speed > 40);
  c.gas = inp.gas;
  c.hand = inp.hand;
  // paredes: la barrera está al borde de la pista; el "radio" del auto depende de cómo esté cruzado
  const L = locate(T, c.x, c.y, c.idx, 24);
  c.idx = L.i;
  c.lat = L.lat;
  const rel = c.h - Math.atan2(T.ty[L.i], T.tx[L.i]);
  const r = 11 + 12 * Math.abs(Math.sin(rel));
  const lim = T.width / 2 - r;
  if (Math.abs(L.lat) > lim) {
    const sg = Math.sign(L.lat);
    const nx = -T.ty[L.i] * sg;
    const ny = T.tx[L.i] * sg;
    const over = Math.abs(L.lat) - lim;
    c.x -= nx * over;
    c.y -= ny * over;
    const imp = hitWall(c, -nx, -ny);
    if (imp > 70) wallHit(c, c.x + nx * r, c.y + ny * r, imp, sg);
    // rozar la barrera frena un poco y saca chispas
    if (c.speed > 150) {
      c.vx *= 1 - dt * 0.5;
      c.vy *= 1 - dt * 0.5;
      c.scrapeT = (c.scrapeT || 0) - dt;
      if (c.scrapeT <= 0 && S.state !== 'menu') {
        c.scrapeT = 0.05;
        painter.spark(c.x + nx * r, c.y + ny * r, 2, S.T.colors[sg > 0 ? 1 : 0]);
      }
    }
    // ayuda arcade: si la trompa apunta contra la barrera, el auto se acomoda y sigue de largo
    if (Math.cos(c.h) * nx + Math.sin(c.h) * ny > 0) {
      let tang = Math.atan2(T.ty[L.i], T.tx[L.i]);
      if (Math.cos(c.h - tang) < 0) tang += Math.PI;
      c.h += wrap(tang - c.h) * Math.min(1, dt * 3.2);
    }
  }
  // progreso a lo largo de la pista (continuo: sirve para vueltas, posiciones y contramano)
  let ds = L.s - c.sPrev;
  if (ds > T.length / 2) ds -= T.length;
  else if (ds < -T.length / 2) ds += T.length;
  c.run += ds;
  c.sPrev = L.s;
  const along = c.vx * T.tx[L.i] + c.vy * T.ty[L.i];
  if (c.human && racing && c.speed > 90 && along < -c.speed * 0.4) c.wrongT += dt;
  else c.wrongT = Math.max(0, c.wrongT - dt * 3);
  // nitro: se carga solo de a poco y mucho más derrapando
  c.nitro = Math.min(1, c.nitro + dt * 0.018);
  if (racing || S.state === 'done') {
    laps(c);
    scoreDrift(c, dt);
  }
}

function laps(c) {
  if (c.finished || c.remote) return;
  const T = S.T;
  const rt = S.rt;
  const sec = Math.floor(c.run / (T.length / SECTORS));
  if (sec > c.sector) {
    c.sector = sec;
    if (sec >= 1) {
      c.splits[sec - 1] = rt;
      if (c.human) onSplit(c, sec);
    }
  }
  const n = Math.floor(c.run / T.length);
  if (n <= c.lapsDone) return;
  c.lapsDone = n;
  if (n < 1) return;
  const lt = rt - c.lapStartT;
  c.lapTimes.push(lt);
  c.lapStartT = rt;
  if (c.best == null || lt < c.best) c.best = lt;
  const id = S.T.id;
  if (c.human && S.mode !== 'online' && (S.bestLap[id] == null || lt < S.bestLap[id])) S.bestLap[id] = lt;
  if (c.human) onLap(c, n, lt);
  if (S.mode !== 'drift' && n >= S.o.laps) finishCar(c);
}

function finishCar(c) {
  c.finished = true;
  c.finishT = S.rt;
  if (c.combo.pts > 0) bank(c);
  if (c.human) {
    // vuelta de enfriamiento: la compu maneja el auto del jugador
    c.ai = aiDriver(1, rng(S.seed + 99));
    c.ai.base = c.ai.aggro = 0.8;
    sfx('finish');
    if (S.mode === 'online') online.send({ t: 'finish', time: Math.round(c.finishT), best: c.best, drift: Math.round(c.dpts) });
  }
  checkEnd();
}

function scoreDrift(c, dt) {
  if (c.finished || c.remote) return;
  const K = c.combo;
  if (c.drifting && c.speed > 240) {
    K.t += dt;
    K.idle = 0;
    K.mult = Math.min(8, 1 + Math.floor(K.t / 1.4));
    K.near = Math.abs(c.lat) > S.T.width / 2 - 48;
    K.pts += Math.abs(Math.sin(c.slip)) * c.speed * dt * 0.6 * K.mult * (K.near ? 1.5 : 1);
    c.nitro = Math.min(1, c.nitro + dt * 0.2 * Math.min(1, Math.abs(c.slip) * 3));
  } else if (K.pts > 0) {
    K.idle += dt;
    K.near = false;
    if (K.idle > 0.9) bank(c);
  }
  if (c.spin > 0 && K.pts > 0) loseCombo(c);
}
function bank(c) {
  const K = c.combo;
  const pts = Math.round(K.pts);
  c.dpts += pts;
  c.bestCombo = Math.max(c.bestCombo, pts);
  c.maxMult = Math.max(c.maxMult, K.mult);
  if (c.human && pts > 60) {
    popup(c, `+${pts.toLocaleString()}${K.mult > 1 ? ` ×${K.mult}` : ''}`, 'bank');
    sfx('bank', K.mult);
  }
  K.pts = K.t = K.idle = 0;
  K.mult = 1;
}
function loseCombo(c) {
  const K = c.combo;
  if (c.human && K.pts > 60) {
    popup(c, t('lost'), 'lost');
    sfx('lost');
  }
  K.pts = K.t = K.idle = 0;
  K.mult = 1;
}

function wallHit(c, x, y, imp, side) {
  if (S.state === 'menu') return;
  if (imp > 200 && c.combo.pts > 0) loseCombo(c);
  if (c.hitT > 0) return;
  c.hitT = 0.12;
  painter.spark(x, y, Math.min(18, 3 + imp / 40), S.T.colors[side > 0 ? 1 : 0]);
  if (c.human) {
    sfx('hit', imp);
    const v = S.views.find((w) => w.car === c);
    if (v) v.cam.shake = Math.min(14, imp / 40);
  }
}

/** Choque entre autos: dos círculos por auto (trompa y cola). */
function collide(a, b) {
  const dx0 = b.x - a.x;
  const dy0 = b.y - a.y;
  if (dx0 * dx0 + dy0 * dy0 > 3600) return;
  let bd = 576;
  let bx = 0;
  let by = 0;
  for (const sa of [-11, 11])
    for (const sb of [-11, 11]) {
      const dx = b.x + Math.cos(b.h) * sb - (a.x + Math.cos(a.h) * sa);
      const dy = b.y + Math.sin(b.h) * sb - (a.y + Math.sin(a.h) * sa);
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) {
        bd = d2;
        bx = dx;
        by = dy;
      }
    }
  if (bd >= 576) return;
  const d = Math.sqrt(bd) || 1;
  const nx = bx / d;
  const ny = by / d;
  const push = 24 - d;
  const ka = b.remote ? 1 : a.remote ? 0 : 0.5;
  a.x -= nx * push * ka;
  a.y -= ny * push * ka;
  b.x += nx * push * (1 - ka);
  b.y += ny * push * (1 - ka);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return;
  const j = -rv * 0.8;
  a.vx -= nx * j * ka;
  a.vy -= ny * j * ka;
  b.vx += nx * j * (1 - ka);
  b.vy += ny * j * (1 - ka);
  // un toque de giro según dónde fue el golpe
  a.w += (Math.random() - 0.5) * j * 0.006 * ka;
  b.w += (Math.random() - 0.5) * j * 0.006 * (1 - ka);
  if (-rv > 140 && S.state !== 'menu') {
    painter.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#fff');
    if (a.human || b.human) sfx('bump', -rv);
    if (-rv > 260) {
      if (a.combo.pts > 0) loseCombo(a);
      if (b.combo.pts > 0) loseCombo(b);
    }
  }
}

function tick(dt) {
  const racing = S.state === 'race';
  if (S.state === 'count') countdown(dt);
  for (const c of S.cars) {
    c.px = c.x;
    c.py = c.y;
    c.ph = c.h;
    if (c.hitT > 0) c.hitT -= dt;
    if (c.remote) stepRemote(c, dt);
    else stepRacer(c, dt, racing);
  }
  const n = S.cars.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!(S.cars[i].remote && S.cars[j].remote)) collide(S.cars[i], S.cars[j]);
  if (racing || S.state === 'done') {
    S.rt += dt * 1000;
    if (S.mode === 'race' || S.mode === 'local') rubberBand();
  }
  if (racing) {
    if (S.rec && !S.views[0].car.finished && (S.stepN = (S.stepN || 0) + 1) % 3 === 0) {
      const c = S.views[0].car;
      S.rec.push(c.x, c.y, c.h, (c.boosting ? 1 : 0) | (c.drifting ? 2 : 0));
    }
    if (S.mode === 'drift' && S.rt >= S.o.time * 1000) endRace();
  }
  if (S.mode === 'online' && (racing || S.state === 'done')) sendState();
}

/** La compu afloja un poco si se escapa y aprieta si queda muy atrás (sin exagerar). */
function rubberBand() {
  let best = -Infinity;
  for (const c of S.cars) if (c.human) best = Math.max(best, c.run);
  for (const c of S.cars) {
    if (!c.ai || c.human || c.finished) continue;
    const gap = c.run - best;
    c.ai.aggro = c.ai.base * clamp(1 - gap / 18000, 0.95, 1.035);
  }
}

// ================================================================ cuenta regresiva y fin
function countdown(dt) {
  let lit;
  if (S.mode === 'online') {
    const rem = S.o.startAt - online.serverNow();
    lit = rem > 3000 ? 0 : rem > 2000 ? 1 : rem > 1000 ? 2 : rem > 0 ? 3 : 4;
  } else {
    S.countT += dt;
    lit = Math.min(4, Math.floor(S.countT / 0.6));
  }
  if (lit !== S.lit) {
    S.lit = lit;
    const L = $$('#lights i');
    L.forEach((el, k) => (el.className = lit === 4 ? 'g' : k < lit ? 'r' : ''));
    $('lights').classList.toggle('on', true);
    if (lit > 0 && lit < 4) sfx('beep');
    if (lit === 4) {
      sfx('go');
      S.state = 'race';
      S.rt = S.mode === 'online' ? clamp(online.serverNow() - S.o.startAt, 0, 60000) : 0;
      G.gameplay(true);
      setTimeout(() => $('lights').classList.remove('on'), 900);
    }
  }
}

function checkEnd() {
  if (S.state !== 'race' || S.mode === 'online') return;
  const humans = S.cars.filter((c) => c.human);
  if (humans.every((c) => c.finished)) {
    S.state = 'done';
    S.doneAt = performance.now();
    setTimeout(endRace, S.mode === 'trial' ? 1000 : 2200);
  }
}

function endRace() {
  if (S.state === 'menu' || S.results) return;
  S.state = 'done';
  for (const c of S.cars) {
    if (!c.remote && c.combo.pts > 0) bank(c);
    if (c.human && !c.ai) c.ai = Object.assign(aiDriver(1, rng(S.seed + 5)), { base: 0.8, aggro: 0.8 });
  }
  S.results = true;
  G.gameplay(false);
  const R = buildResults();
  showResults(R);
}

function standings() {
  return [...S.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishT - b.finishT;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.run - a.run;
  });
}

function buildResults() {
  const T = S.T;
  const me = S.views[0].car;
  const total = S.o.laps * T.length;
  const rows = standings().map((c) => {
    let time = c.finishT;
    let est = false;
    if (!c.finished) {
      const avg = Math.max(200, (c.run / Math.max(1, S.rt)) * 1000);
      time = S.rt + ((total - c.run) / avg) * 1000;
      est = true;
    }
    return { c, time, est };
  });
  return { rows, me };
}

// ================================================================ online
let lastSent = 0;
function sendState() {
  const now = performance.now();
  if (now - lastSent < 50) return;
  lastSent = now;
  const c = S.views[0]?.car;
  if (!c) return;
  const flags = (c.drifting ? 1 : 0) | (c.boosting ? 2 : 0) | (c.inBrake ? 4 : 0) | (c.finished ? 8 : 0);
  online.raw({ t: 'state', s: [Math.round(c.x), Math.round(c.y), +c.h.toFixed(3), Math.round(c.vx), Math.round(c.vy), Math.round(c.run), flags, +c.steer.toFixed(2)] });
}
function stepRemote(c, dt) {
  if (c.tx == null) return;
  // extrapola con la última velocidad conocida y se acerca suave al estado recibido
  c.tx += c.vx * dt;
  c.ty += c.vy * dt;
  const k = Math.min(1, dt * 12);
  c.x += (c.tx - c.x) * k;
  c.y += (c.ty - c.y) * k;
  c.h += wrap(c.th - c.h) * k;
  c.speed = Math.hypot(c.vx, c.vy);
  c.slip = c.drifting ? 0.4 : 0;
}

// ================================================================ fantasma
function ghostAt(ms) {
  const g = S.ghost;
  if (!g) return null;
  const f = ms / 25;
  const n = g.frames.length / 4;
  if (f >= n - 1) return null;
  const i = Math.floor(f);
  const a = f - i;
  const F = g.frames;
  const o = S.ghostCar;
  o.x = F[i * 4] + (F[i * 4 + 4] - F[i * 4]) * a;
  o.y = F[i * 4 + 1] + (F[i * 4 + 5] - F[i * 4 + 1]) * a;
  o.h = F[i * 4 + 2] + wrap(F[i * 4 + 6] - F[i * 4 + 2]) * a;
  o.boosting = !!(F[i * 4 + 3] & 1);
  return o;
}

// ================================================================ arranque de carrera
function startRace(o) {
  S.o = o;
  S.mode = o.mode;
  S.T = build(TRACKS[o.track]);
  prepare(S.T);
  racingLine(S.T);
  painter.resetEffects();
  S.seed = (Math.random() * 1e9) | 0;
  const r = rng(S.seed);
  S.cars = [];
  S.results = false;
  S.paused = false;
  S.state = 'count';
  S.countT = 0;
  S.lit = -1;
  S.rt = 0;
  S.acc = 0;
  S.stepN = 0;
  const grid = [];
  if (o.mode === 'online') {
    for (const p of o.players) grid.push(racer({ id: p.id, name: p.name, label: p.me ? null : p.name, color: p.color, human: p.me, slot: p.me ? 0 : -1, remote: !p.me }));
  } else {
    const humans = o.mode === 'local' ? 2 : 1;
    const rivals = o.mode === 'race' || o.mode === 'local' ? o.rivals : 0;
    const names = AI_NAMES.slice().sort(() => r() - 0.5);
    for (let k = 0; k < rivals; k++) {
      // en difícil, todos al tope; en los otros niveles hay algo de variedad
      const lv = o.level === 3 ? 3 : clamp(o.level + (k % 3 === 2 ? 1 : 0) - (k % 3 === 1 ? 1 : 0), 1, 3);
      grid.push(racer({ name: names[k], label: names[k], color: AI_COLORS[k % AI_COLORS.length], ai: aiDriver(lv, rng(S.seed + k * 7)) }));
    }
    for (let k = 0; k < humans; k++)
      grid.push(racer({ name: humans > 1 ? t('player', { n: k + 1 }) : t('you'), label: humans > 1 ? `J${k + 1}` : null, color: k ? '#ff2bd6' : '#00f0ff', human: true, slot: k }));
  }
  grid.forEach((c, i) => {
    placeOnGrid(c, i);
    if (c.human && S.bonusNitro) c.nitro = 1;
  });
  S.bonusNitro = false;
  S.cars = grid;
  const humans = grid.filter((c) => c.human).sort((a, b) => a.slot - b.slot);
  // fantasma (contrarreloj)
  S.ghost = o.mode === 'trial' ? S.ghosts[`${S.T.id}:${o.laps}`] || null : null;
  S.ghostCar = { x: 0, y: 0, h: 0, color: '#e8f4ff', steer: 0, boosting: false };
  S.rec = o.mode === 'trial' ? [] : null;
  setupViews(humans);
  S.miniMap = null;
  show(null);
  $('lights').classList.add('on');
  $$('#lights i').forEach((el) => (el.className = ''));
  G.gameplay(true);
  audioOn();
}

// ================================================================ vistas, cámara y HUD
const cv = $('c');
const painter = new Painter(cv);

function setupViews(humans) {
  for (const v of S.views) v.hud?.root.remove();
  S.views = humans.map((c) => ({ car: c, cam: { x: c.x, y: c.y, z: 0.7, rot: null, ang: c.h, shake: 0 }, hud: makeHud(), rect: null }));
  layout();
  for (const v of S.views) v.cam.z = baseZoom(v.rect);
  applyKeys();
}

function layout() {
  painter.resize();
  painter.flush();
  const W = innerWidth;
  const H = innerHeight;
  const n = S.views.length;
  const side = W >= H;
  S.views.forEach((v, i) => {
    v.rect = n === 1 ? { x: 0, y: 0, w: W, h: H } : side ? { x: (i * W) / 2, y: 0, w: W / 2, h: H } : { x: 0, y: (i * H) / 2, w: W, h: H / 2 };
    if (v.hud) {
      const r = v.rect;
      Object.assign(v.hud.root.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      v.hud.root.classList.toggle('tb', n > 1 && !side);
      v.hud.root.classList.toggle('narrow', r.w < 700 || W < 640);
    }
  });
  $('hud').classList.toggle('narrow', W < 640);
  $('hud').classList.toggle('split', n > 1);
  S.miniMap = null;
}

function makeHud() {
  const root = $('hud-tpl').content.firstElementChild.cloneNode(true);
  $('hud').insertBefore(root, $('mini'));
  const q = (s) => root.querySelector(s);
  $$('[data-t]', root).forEach((n) => (n.textContent = t(n.dataset.t)));
  return {
    root,
    lap: q('.h-lap'),
    time: q('.h-time'),
    timeL: q('.h-time-l'),
    pos: q('.h-pos'),
    posBox: q('.pos'),
    posL: q('.pos small'),
    ptsBox: q('.pts'),
    pts: q('.h-pts'),
    split: q('.split'),
    warn: q('.warn'),
    combo: q('.combo'),
    cpts: q('.c-pts'),
    cmult: q('.c-mult'),
    cnear: q('.c-near'),
    pop: q('.pop'),
    nitroBox: q('.nitro'),
    nitro: q('.nitro i'),
    gauge: q('.gauge'),
    speed: q('.h-speed'),
    last: {},
  };
}

const setText = (h, k, el, v) => {
  if (h.last[k] === v) return;
  h.last[k] = v;
  el.textContent = v;
};

function hud() {
  const order = standings();
  const T = S.T;
  for (const v of S.views) {
    const c = v.car;
    const h = v.hud;
    if (!h) continue;
    const mode = S.mode;
    const drift = mode === 'drift';
    const lap = clamp(c.lapsDone + 1, 1, drift ? 99 : S.o.laps);
    setText(h, 'lap', h.lap, drift ? `${lap}` : `${lap}/${S.o.laps}`);
    const shown = drift ? Math.max(0, S.o.time * 1000 - S.rt) : c.finished ? c.finishT : S.state === 'race' || S.state === 'done' ? S.rt : 0;
    setText(h, 'time', h.time, fmt(shown));
    setText(h, 'timeL', h.timeL, t(drift ? 'left' : 'time'));
    h.posBox.hidden = drift;
    h.ptsBox.hidden = !drift;
    if (mode === 'trial') {
      setText(h, 'posL', h.posL, t('record'));
      setText(h, 'pos', h.pos, S.ghost ? fmt(S.ghost.time) : '—');
    } else if (!drift) {
      setText(h, 'posL', h.posL, t('pos'));
      setText(h, 'pos', h.pos, `${order.indexOf(c) + 1}/${order.length}`);
    }
    if (drift) setText(h, 'pts', h.pts, Math.round(c.dpts).toLocaleString());
    const K = c.combo;
    const on = K.pts > 30;
    h.combo.classList.toggle('on', on);
    if (on) {
      setText(h, 'cpts', h.cpts, Math.round(K.pts).toLocaleString());
      setText(h, 'cmult', h.cmult, `DRIFT ×${K.mult}`);
      h.cnear.classList.toggle('on', K.near);
    }
    h.warn.classList.toggle('on', c.wrongT > 0.8);
    setText(h, 'speed', h.speed, `${kmh(c.speed)}`);
    const g = (100 - clamp(c.speed / TUNE.boostV, 0, 1) * 100).toFixed(1);
    if (h.last.g !== g) {
      h.last.g = g;
      h.gauge.style.strokeDashoffset = g;
    }
    const nt = c.nitro.toFixed(2);
    if (h.last.nt !== nt) {
      h.last.nt = nt;
      h.nitro.style.transform = `scaleX(${nt})`;
      h.nitroBox.classList.toggle('full', c.nitro > 0.99);
    }
  }
  // tabla de posiciones
  const board = $('board');
  const showBoard = S.cars.length > 1 && S.mode !== 'trial' && !(S.views.length > 1 && innerWidth < 1100);
  board.hidden = !showBoard;
  if (showBoard) {
    const html = order
      .map((c, i) => {
        const me = S.views.some((v) => v.car === c);
        const extra = c.finished ? '✓' : '';
        return `<div class="${me ? 'me' : ''}"><i style="background:${c.color}"></i>${i + 1}. ${esc(c.name)}<em>${extra}</em></div>`;
      })
      .join('');
    if (board._html !== html) board.innerHTML = board._html = html;
  }
  drawMini(T);
}

function drawMini(T) {
  const mm = $('mini');
  const w = mm.clientWidth;
  const h = mm.clientHeight;
  if (!w || !h) return;
  if (!S.miniMap || S.miniMap.T !== T || S.miniMap.w !== w || S.miniMap.h !== h) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    mm.width = Math.round(w * dpr);
    mm.height = Math.round(h * dpr);
    S.miniMap = { T, ...outline(T, w, h, 8, 3) };
  }
  const M = S.miniMap;
  const g = mm.getContext('2d');
  const dpr = mm.width / M.w;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, mm.width, mm.height);
  g.drawImage(M.canvas, 0, 0, mm.width, mm.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dot = (x, y, col, r) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x * M.k + M.ox, y * M.k + M.oy, r, 0, Math.PI * 2);
    g.fill();
  };
  if (S.ghost && S.state !== 'menu') {
    const gc = ghostAt(S.rt);
    if (gc) dot(gc.x, gc.y, 'rgba(232,244,255,.6)', 3);
  }
  for (const c of S.cars) if (!S.views.some((v) => v.car === c)) dot(c.x, c.y, c.color, 3);
  for (const v of S.views) {
    dot(v.car.x, v.car.y, '#fff', 5);
    dot(v.car.x, v.car.y, v.car.color, 3.5);
  }
}

function popup(c, txt, cls) {
  const v = S.views.find((w) => w.car === c);
  if (!v?.hud) return;
  const el = v.hud.pop;
  el.textContent = txt;
  el.className = `pop ${cls}`;
  void el.offsetWidth;
  el.classList.add('show');
}
function splitMsg(c, txt, cls) {
  const v = S.views.find((w) => w.car === c);
  if (!v?.hud) return;
  const el = v.hud.split;
  el.textContent = txt;
  el.className = `split ${cls}`;
  void el.offsetWidth;
  el.classList.add('show');
}

function onSplit(c, sec) {
  const g = S.ghost;
  if (S.mode !== 'trial' || !g || sec % SECTORS === 0) return; // al completar la vuelta se muestra la vuelta
  const ref = g.splits[sec - 1];
  if (ref == null) return;
  const d = S.rt - ref;
  splitMsg(c, fmtD(d), d < 0 ? 'good' : 'bad');
}
function onLap(c, n, lt) {
  sfx('lap');
  const g = S.ghost;
  if (S.mode === 'trial' && g && g.splits[n * SECTORS - 1] != null) {
    const d = S.rt - g.splits[n * SECTORS - 1];
    splitMsg(c, `${t('lapN', { n })} ${fmt(lt)}  ${fmtD(d)}`, d < 0 ? 'good' : 'bad');
  } else splitMsg(c, `${t('lapN', { n })} ${fmt(lt)}`, 'info');
  if (S.mode !== 'drift' && n === S.o.laps - 1) setTimeout(() => popup(c, t('lastLap'), 'info'), 900);
}

// ---------------------------------------------------------------- cámara
function baseZoom(r) {
  return clamp(Math.min(r.w * 1.3, r.h * 1.6) / 1500, 0.3, 0.85);
}
function camera(v, dt, forceChase = false) {
  const c = v.car;
  const cam = v.cam;
  const d = c.draw;
  const chase = forceChase || S.camMode === 'chase';
  const tz = baseZoom(v.rect) * (1 - clamp(c.speed / 3600, 0, 0.26));
  cam.z += (tz - cam.z) * Math.min(1, dt * 1.6);
  if (chase) {
    // mira hacia donde va el auto (así se ve el ángulo del derrape)
    const w = c.u > 0 ? clamp((c.speed - 60) / 220, 0, 1) : 0;
    const va = Math.atan2(c.vy, c.vx);
    const target = d.h + wrap(va - d.h) * w * 0.75;
    cam.ang += wrap(target - cam.ang) * Math.min(1, dt * 3.2);
    cam.x = d.x;
    cam.y = d.y;
    cam.rot = -cam.ang - Math.PI / 2;
  } else {
    const tx = d.x + c.vx * 0.3;
    const ty = d.y + c.vy * 0.3;
    const f = Math.min(1, dt * 4);
    cam.x += (tx - cam.x) * f;
    cam.y += (ty - cam.y) * f;
    cam.rot = null;
    cam.ang = d.h;
  }
  if (cam.shake > 0.3) {
    cam.x += (Math.random() - 0.5) * cam.shake;
    cam.y += (Math.random() - 0.5) * cam.shake;
    cam.shake *= Math.pow(0.02, dt);
  } else cam.shake = 0;
}

// ---------------------------------------------------------------- efectos (marcas, humo)
function carFx(c, dt) {
  const d = c.draw;
  const fx = Math.cos(d.h);
  const fy = Math.sin(d.h);
  const rxv = -fy;
  const ryv = fx;
  const bx = d.x - fx * 14;
  const by = d.y - fy * 14;
  const l = [bx - rxv * 10, by - ryv * 10];
  const r = [bx + rxv * 10, by + ryv * 10];
  const hard = c.drifting || c.spin > 0 || (c.hand && c.speed > 120) || (c.inBrake && c.speed > 380 && !c.remote);
  if (hard && c.rw && S.state !== 'menu') {
    const a = clamp(Math.abs(Math.sin(c.slip)) * 0.55 + (c.spin > 0 ? 0.2 : 0) + 0.06, 0.06, 0.32);
    const m = Math.hypot(l[0] - c.rw[0], l[1] - c.rw[1]);
    if (m > 3 && m < 80) {
      painter.addSkid(c.rw[0], c.rw[1], l[0], l[1], a);
      painter.addSkid(c.rw[2], c.rw[3], r[0], r[1], a);
    } else if (m <= 3) return;
  }
  c.rw = hard ? [l[0], l[1], r[0], r[1]] : null;
  if ((c.drifting || c.spin > 0) && painter.motion) {
    c.smokeT -= dt;
    if (c.smokeT <= 0) {
      c.smokeT = 0.035;
      const k = clamp(Math.abs(c.slip) * 1.6, 0.4, 1.2);
      for (const p of [l, r]) painter.puff(p[0], p[1], c.vx * 0.12 + (Math.random() - 0.5) * 60, c.vy * 0.12 + (Math.random() - 0.5) * 60, 10 + 10 * k);
    }
  }
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
let lastHud = 0;
const demo = { on: true, cam: { x: 0, y: 0, z: 0.6, rot: null, ang: 0, shake: 0 }, follow: 0, switchT: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const frozen = S.paused || (G.paused && S.mode !== 'online');
  if (!frozen) {
    S.acc += dt;
    let n = 0;
    while (S.acc >= STEP && n < 10) {
      tick(STEP);
      S.acc -= STEP;
      n++;
    }
    if (n === 10) S.acc = 0;
    painter.tickEffects(dt);
  }
  // posiciones interpoladas para dibujar
  const a = frozen ? 1 : clamp(S.acc / STEP, 0, 1);
  for (const c of S.cars) {
    c.draw.x = c.px + (c.x - c.px) * a;
    c.draw.y = c.py + (c.y - c.py) * a;
    c.draw.h = c.ph + wrap(c.h - c.ph) * a;
    if (!frozen) carFx(c, dt);
  }
  render(now, frozen ? 0 : dt);
  if (S.state !== 'menu' && now - lastHud > 66) {
    lastHud = now;
    hud();
  }
  engineSound();
}

const drawList = [];
function drawCars() {
  drawList.length = 0;
  for (const c of S.cars) {
    const d = c.draw;
    d.color = c.color;
    d.steer = c.steer;
    d.boosting = c.boosting;
    d.inBrake = c.inBrake;
    d.label = c.label;
    drawList.push(d);
  }
  return drawList;
}

function render(now, dt) {
  const T = S.T;
  const cars = drawCars();
  if (S.state === 'menu') {
    // modo demostración: la compu corre y la cámara sigue al que va adelante
    const lead = S.cars[demo.follow] || S.cars[0];
    if (!lead) return;
    const v = { car: lead, cam: demo.cam, rect: { x: 0, y: 0, w: innerWidth, h: innerHeight } };
    demo.switchT -= dt;
    if (demo.switchT <= 0) {
      demo.switchT = 9;
      demo.follow = (demo.follow + 1) % S.cars.length;
    }
    camera(v, dt, true);
    demo.cam.z = baseZoom(v.rect) * 0.8;
    painter.view({ ...v.rect, cam: demo.cam }, { T, cars, ghost: null, t: now });
    return;
  }
  const ghost = S.ghost && (S.state === 'race' || S.state === 'done') ? ghostAt(S.rt) : null;
  for (const v of S.views) {
    camera(v, dt);
    painter.view({ ...v.rect, cam: v.cam }, { T, cars, ghost, t: now });
  }
}

// ================================================================ demo de fondo (menú)
function startDemo(track = S.opts.track) {
  S.state = 'menu';
  S.mode = 'demo';
  S.T = build(TRACKS[track]);
  prepare(S.T);
  racingLine(S.T);
  painter.resetEffects();
  for (const v of S.views) v.hud?.root.remove();
  S.views = [];
  S.cars = [0, 1, 2, 3].map((k) => racer({ name: AI_NAMES[k], color: k ? AI_COLORS[k] : '#00f0ff', ai: aiDriver(k % 2 ? 2 : 3, rng(track * 13 + k)) }));
  S.cars.forEach((c, i) => placeOnGrid(c, i));
  demo.follow = 0;
  demo.switchT = 9;
  const c = S.cars[0];
  demo.cam.x = c.x;
  demo.cam.y = c.y;
  demo.cam.ang = c.h;
  S.results = false;
  S.paused = false;
  S.ghost = null;
}

// ================================================================ entrada
const down = new Set();
const touchIn = { left: 0, right: 0, hand: 0, boost: 0, brake: 0 };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    else if (e.code === 'KeyC' && S.views.length) toggleCam();
    else if (e.code === 'KeyR' && S.mode !== 'online' && S.mode !== 'local' && S.o && (S.state === 'race' || S.state === 'count' || S.state === 'done') && !S.results) restart();
  }
  down.add(e.code);
  applyKeys();
});
addEventListener('keyup', (e) => {
  down.delete(e.code);
  applyKeys();
});
addEventListener('blur', () => {
  down.clear();
  applyKeys();
});
function applyKeys() {
  const has = (...k) => (k.some((x) => down.has(x)) ? 1 : 0);
  const keys = G.prefs.keys;
  const arrows = keys !== 'wasd';
  const wasd = keys !== 'arrows';
  for (const v of S.views) {
    const c = v.car;
    if (S.mode === 'local') {
      const p1 = c.slot === 0;
      const I = p1
        ? { up: has('KeyW'), down: has('KeyS'), left: has('KeyA'), right: has('KeyD'), hand: has('Space'), boost: has('ShiftLeft') }
        : { up: has('ArrowUp'), down: has('ArrowDown'), left: has('ArrowLeft'), right: has('ArrowRight'), hand: has('Period', 'ControlRight', 'Numpad0', 'Enter'), boost: has('Slash', 'ShiftRight', 'NumpadDecimal') };
      c.inp = { gas: I.up, brake: I.down, steer: I.right - I.left, hand: !!I.hand, boost: !!I.boost };
    } else {
      const tch = G.prefs.touch;
      const up = (arrows && has('ArrowUp')) || (wasd && has('KeyW'));
      const dn = touchIn.brake || (arrows && has('ArrowDown')) || (wasd && has('KeyS'));
      const lf = touchIn.left || (arrows && has('ArrowLeft')) || (wasd && has('KeyA'));
      const rt = touchIn.right || (arrows && has('ArrowRight')) || (wasd && has('KeyD'));
      c.inp = {
        gas: tch && !up ? (touchIn.brake ? 0 : 1) : up ? 1 : 0,
        brake: dn ? 1 : 0,
        steer: (rt ? 1 : 0) - (lf ? 1 : 0),
        hand: !!(touchIn.hand || has('Space')),
        boost: !!(touchIn.boost || has('ShiftLeft', 'ShiftRight')),
      };
    }
  }
}
for (const b of $$('.pad button')) {
  const k = b.dataset.k;
  const on = (v) => (e) => {
    e.preventDefault();
    touchIn[k] = v;
    b.classList.toggle('on', !!v);
    applyKeys();
  };
  b.addEventListener('pointerdown', on(1));
  b.addEventListener('pointerup', on(0));
  b.addEventListener('pointercancel', on(0));
  b.addEventListener('pointerleave', on(0));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
function toggleCam() {
  S.camMode = S.camMode === 'chase' ? 'top' : 'chase';
  try {
    localStorage.setItem('drift.cam', S.camMode);
  } catch {}
  sfx('ui');
}
$('b-cam').onclick = toggleCam;
$('b-pause').onclick = () => togglePause();

function togglePause() {
  if (S.mode === 'online' || !S.o || S.results || !(S.state === 'race' || S.state === 'count')) return;
  S.paused = !S.paused;
  if (S.paused) {
    show('pause');
    G.gameplay(false);
  } else {
    show(null);
    G.gameplay(true);
  }
  sfx('ui');
}
$('p-resume').onclick = () => togglePause();
$('p-restart').onclick = () => restart();
$('p-quit').onclick = () => toMenu();
function restart() {
  S.paused = false;
  startRace(S.o);
}
function toMenu() {
  if (S.mode === 'online') online?.leave();
  S.o = null;
  startDemo(S.opts.track);
  G.gameplay(false);
  show('home');
}

// ================================================================ menús
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  const inGame = !id;
  const racingView = S.state !== 'menu' && S.views.length > 0;
  $('hud').hidden = !racingView || id === 'results';
  $('b-pause').hidden = S.mode === 'online';
  const touch = G.prefs.touch && inGame && S.mode !== 'local' && racingView;
  $('pad-l').hidden = !touch;
  $('pad-r').hidden = !touch;
  document.body.classList.toggle('touch', !!G.prefs.touch);
  if (!inGame) {
    for (const k in touchIn) touchIn[k] = 0;
    $$('.pad button').forEach((b) => b.classList.remove('on'));
  }
}

const thumbs = new Map();
function thumb(i) {
  if (!thumbs.has(i)) thumbs.set(i, outline(build(TRACKS[i]), 150, 62, 5, 2.5).canvas);
  return thumbs.get(i);
}
function trackCards(el, cur, { disabled = false, badge } = {}) {
  el.innerHTML = '';
  TRACKS.forEach((tr, i) => {
    const b = document.createElement('button');
    b.className = `tcard${i === cur ? ' on' : ''}`;
    b.dataset.v = i;
    b.disabled = disabled;
    const T = build(tr);
    const cvs = document.createElement('canvas');
    const src = thumb(i);
    cvs.width = src.width;
    cvs.height = src.height;
    cvs.getContext('2d').drawImage(src, 0, 0);
    b.append(cvs);
    b.insertAdjacentHTML('beforeend', `<b>${esc(G.t(tr.name))}</b><small>${stars(tr.level)} · ${km(T)}</small>${badge?.(tr) ? `<span class="best">${badge(tr)}</span>` : ''}`);
    el.append(b);
  });
}
function trackInfo(el, i) {
  const tr = TRACKS[i];
  const T = build(tr);
  el.innerHTML = `<b>${esc(G.t(tr.name))}</b> · ${esc(G.t(tr.about))} · ${km(T)}${T.grip < 1 ? ' · ❄' : ''}`;
}

function openSetup(mode) {
  S.setupMode = mode;
  $('setup-title').textContent = t({ race: 'race', trial: 'trial', drift: 'driftMode', local: 'local' }[mode]);
  $('o-laps').hidden = mode === 'drift';
  $('o-rivals').hidden = !(mode === 'race' || mode === 'local');
  $('o-level').hidden = !(mode === 'race' || mode === 'local');
  $('o-time').hidden = mode !== 'drift';
  const zero = $('o-rivals').querySelector('[data-v="0"]');
  zero.hidden = mode === 'race';
  if (mode === 'race' && S.opts.rivals === 0) S.opts.rivals = 3;
  refreshSetup();
  show('setup');
}
function refreshSetup() {
  const mode = S.setupMode;
  const o = S.opts;
  const badge = (tr) => {
    if (mode === 'trial') {
      const g = S.ghosts[`${tr.id}:${o.laps}`];
      return g ? fmt(g.time) : '';
    }
    if (mode === 'drift') return S.driftBest[tr.id] ? Math.round(S.driftBest[tr.id]).toLocaleString() : '';
    return S.bestLap[tr.id] != null ? fmt(S.bestLap[tr.id]) : '';
  };
  trackCards($('tracks'), o.track, { badge });
  trackInfo($('tinfo'), o.track);
  for (const seg of $$('#s-setup .seg')) {
    const k = seg.dataset.o;
    $$('button', seg).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === o[k]));
  }
  const tr = TRACKS[o.track];
  let note = '';
  if (mode === 'trial') {
    const g = S.ghosts[`${tr.id}:${o.laps}`];
    note = g ? t('ghostNote', { r: fmt(g.time) }) : t('ghostNone');
  } else if (mode === 'drift') note = S.driftBest[tr.id] ? t('driftNote', { p: Math.round(S.driftBest[tr.id]).toLocaleString() }) : G.prefs.touch ? t('howTouch') : t('howDrift');
  else if (mode === 'local') note = t('localNote');
  else note = G.prefs.touch ? t('howTouch') : t('howDrift');
  $('setup-note').textContent = note;
}
$('tracks').onclick = (e) => {
  const b = e.target.closest('.tcard');
  if (!b) return;
  S.opts.track = Number(b.dataset.v);
  sfx('ui');
  refreshSetup();
  startDemo(S.opts.track);
};
for (const seg of $$('#s-setup .seg'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.opts[seg.dataset.o] = Number(b.dataset.v);
    sfx('ui');
    refreshSetup();
  };
$('setup-go').onclick = () => {
  sfx('ui');
  const o = S.opts;
  startRace({ mode: S.setupMode, track: o.track, laps: S.setupMode === 'drift' ? 999 : o.laps, rivals: S.setupMode === 'race' ? Math.max(1, o.rivals) : o.rivals, level: o.level, time: o.time });
};

document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]');
  if (m) {
    unlock();
    sfx('ui');
    const mode = m.dataset.mode;
    if (mode === 'online') {
      $('on-name').value ||= defaultName();
      return show('online');
    }
    return openSetup(mode);
  }
  if (e.target.closest('[data-back]')) {
    sfx('ui');
    show('home');
  }
});

// ---------------------------------------------------------------- resultados
function showResults(R) {
  const { rows, me } = R;
  const T = S.T;
  const mode = S.mode;
  const big = $('res-big');
  big.classList.remove('rec');
  $('res-sub').textContent = '';
  $('res-list').innerHTML = '';
  $('res-stats').innerHTML = '';
  const stat = (v, l, cls = '') => `<div><b class="${cls}">${v}</b><small>${l}</small></div>`;
  if (mode === 'trial') {
    const key = `${T.id}:${S.o.laps}`;
    const prev = S.ghosts[key];
    const time = me.finishT;
    const isRec = !prev || time < prev.time;
    if (isRec && S.rec) S.ghosts[key] = { time, frames: Float32Array.from(S.rec), splits: me.splits.slice(), laps: me.lapTimes.slice() };
    $('res-title').textContent = isRec ? t('newBest') : t('finished');
    big.textContent = fmt(time);
    big.classList.toggle('rec', isRec);
    $('res-sub').textContent = !prev ? t('firstRun') : isRec ? t('faster', { d: `${((prev.time - time) / 1000).toFixed(2)} s` }) : t('slower', { d: `${((time - prev.time) / 1000).toFixed(2)} s`, r: fmt(prev.time) });
    $('res-stats').innerHTML = stat(fmt(me.best), t('bestLap')) + stat(fmt(S.bestLap[T.id]), t('sessionBest')) + stat(Math.round(me.dpts).toLocaleString(), t('points'));
    $('res-list').innerHTML = me.lapTimes
      .map((lt, i) => {
        const ref = prev?.laps?.[i];
        const d = ref != null ? lt - ref : null;
        return `<li><b>${i + 1}</b><span>${t('lapN', { n: i + 1 })}</span><b class="${d == null ? '' : d < 0 ? 'good' : 'bad'}">${fmt(lt)}${d == null ? '' : ` <small>${fmtD(d)}</small>`}</b></li>`;
      })
      .join('');
    sfx(isRec ? 'win' : 'finish');
  } else if (mode === 'drift') {
    const pts = Math.round(me.dpts);
    const prev = S.driftBest[T.id];
    const isRec = !prev || pts > prev;
    if (isRec) S.driftBest[T.id] = pts;
    $('res-title').textContent = isRec && pts > 0 ? t('newBest') : t('timeUp');
    big.textContent = pts.toLocaleString();
    big.classList.toggle('rec', isRec && pts > 0);
    $('res-stats').innerHTML = stat(me.bestCombo.toLocaleString(), t('bestCombo')) + stat(`×${me.maxMult}`, 'max') + stat((S.driftBest[T.id] || 0).toLocaleString(), t('sessionBest'));
    sfx(isRec && pts > 0 ? 'win' : 'finish');
  } else {
    const place = rows.findIndex((r) => r.c === me) + 1;
    const winner = rows[0].c;
    if (mode === 'local') $('res-title').textContent = t('winner', { n: winner.name });
    else $('res-title').textContent = place === 1 ? t('youWin') : t('place', { n: `${place}°` });
    big.textContent = mode === 'local' ? fmt(rows[0].time) : fmt(me.finishT);
    $('res-stats').innerHTML = stat(`${place}/${rows.length}`, t('pos')) + stat(fmt(me.best), t('bestLap')) + stat(Math.round(me.dpts).toLocaleString(), t('points'));
    $('res-list').innerHTML = rows
      .map((r, i) => {
        const mine = S.views.some((v) => v.car === r.c);
        return `<li class="${mine ? 'me' : ''}"><b>${i + 1}</b><span><i style="background:${r.c.color}"></i>${esc(r.c.name)}<small>${t('bestLap')}: ${fmt(r.c.best)}</small></span><b>${r.est ? '≈ ' : ''}${fmt(r.time)}</b></li>`;
      })
      .join('');
    sfx(place === 1 || mode === 'local' ? 'win' : 'lose');
  }
  $('res-again').textContent = t('again');
  $('res-setup').hidden = false;
  offerReward();
  show('results');
}

function showOnlineResults(results) {
  S.results = true;
  S.state = 'done';
  G.gameplay(false);
  const myId = online.myId;
  const i = results.findIndex((r) => r.id === myId);
  const me = results[i];
  $('res-title').textContent = i === 0 && !me?.dnf ? t('youWin') : t('place', { n: `${i + 1}°` });
  const big = $('res-big');
  big.classList.remove('rec');
  big.textContent = me && !me.dnf ? fmt(me.time) : t('dnf');
  $('res-sub').textContent = '';
  $('res-stats').innerHTML = '';
  $('res-list').innerHTML = results
    .map((r, k) => `<li class="${r.id === myId ? 'me' : ''}"><b>${k + 1}</b><span><i style="background:${r.color}"></i>${esc(r.name)}<small>${t('bestLap')}: ${fmt(r.best)}</small></span><b>${r.dnf ? t('dnf') : fmt(r.time)}</b></li>`)
    .join('');
  $('res-again').textContent = t('rematch');
  $('res-again').hidden = !online.isHost;
  $('res-setup').hidden = true;
  $('res-reward').hidden = true;
  sfx(i === 0 ? 'win' : 'lose');
  show('results');
}

function offerReward() {
  const b = $('res-reward');
  b.hidden = true;
  b.textContent = t('reward');
  if (S.mode === 'online') return;
  G.rewardAvailable('nitro').then((ok) => {
    if (ok && S.results && S.mode !== 'online') b.hidden = false;
  });
}
$('res-reward').onclick = async () => {
  $('res-reward').hidden = true;
  if (await G.showReward()) {
    S.bonusNitro = true;
    startRace(S.o);
  }
};
$('res-again').onclick = async () => {
  if (S.mode === 'online') {
    if (online.isHost) online.send({ t: 'rematch' });
    return;
  }
  sfx('ui');
  await G.commercialBreak('revancha');
  startRace(S.o);
};
$('res-setup').onclick = () => {
  sfx('ui');
  const mode = S.mode;
  startDemo(S.opts.track);
  openSetup(mode);
};
$('res-menu').onclick = () => toMenu();

// ================================================================ online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('drift', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'state') {
        const c = S.cars.find((x) => x.id === m.id);
        if (c && c.remote) {
          const [x, y, h, vx, vy, run, fl, st] = m.s;
          if (c.tx == null || Math.hypot(x - c.x, y - c.y) > 600) {
            c.x = c.px = x;
            c.y = c.py = y;
            c.h = c.ph = h;
          }
          Object.assign(c, { tx: x, ty: y, th: h, vx, vy, run, steer: st, drifting: !!(fl & 1), boosting: !!(fl & 2), inBrake: !!(fl & 4) });
          if (fl & 8 && !c.finished) c.finished = true;
        }
      } else if (m.t === 'finished') {
        const c = S.cars.find((x) => x.id === m.id);
        if (c) {
          c.finished = true;
          c.finishT = m.time;
          c.best = m.best;
          if (c.human) splitMsg(c, t('waitOthers'), 'info');
        }
      } else if (m.t === 'end') {
        if (S.mode === 'online' && S.state !== 'menu') showOnlineResults(m.results || []);
      } else if (m.t === 'error') {
        $('on-status').textContent = netText(m.code);
        $('lobby-status').textContent = netText(m.code);
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        startDemo(S.opts.track);
        show('online');
      }
    },
  });
  return online;
}
$('on-create').onclick = () => {
  unlock();
  ensureOnline().create($('on-name').value.trim() || defaultName());
};
$('on-join').onclick = () => {
  unlock();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureOnline().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => online.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online.leave();
  startDemo(S.opts.track);
  show('online');
};
$('lobby-share').onclick = async () => {
  const r = await share('drift', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};
$('lobby-tracks').onclick = (e) => {
  const b = e.target.closest('.tcard');
  if (b && online.isHost) online.send({ t: 'settings', settings: { track: Number(b.dataset.v), laps: lobby.laps } });
};
$('lobby-laps').onclick = (e) => {
  const b = e.target.closest('button');
  if (b && online.isHost) online.send({ t: 'settings', settings: { laps: Number(b.dataset.v), track: lobby.track } });
};

let raceKey = null;
const lobby = { track: -1, laps: 3 };
function applyRoom(room) {
  if (room.state === 'lobby' || !room.race) {
    raceKey = null;
    $('lobby-code').textContent = room.code;
    $('lobby-players').innerHTML = room.players
      .map((p) => `<li><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
      .join('');
    const st = room.settings || {};
    const tr = clamp(st.track ?? 0, 0, TRACKS.length - 1);
    if (tr !== lobby.track || $('lobby-tracks').dataset.host !== String(online.isHost)) {
      trackCards($('lobby-tracks'), tr, { disabled: !online.isHost });
      $('lobby-tracks').dataset.host = String(online.isHost);
      if (S.state === 'menu' && S.T.id !== TRACKS[tr].id) startDemo(tr);
    }
    lobby.track = tr;
    lobby.laps = st.laps ?? 3;
    trackInfo($('lobby-tinfo'), tr);
    $$('#lobby-laps button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.v) === lobby.laps);
      b.disabled = !online.isHost;
    });
    $('lobby-start').hidden = !online.isHost;
    $('lobby-status').textContent = online.isHost ? '' : t('waitingHost');
    if (S.mode === 'online' && S.state !== 'menu') startDemo(tr);
    S.mode = 'online-lobby';
    show('lobby');
    return;
  }
  const key = `${room.race.startAt}`;
  if (key !== raceKey && room.state === 'playing') {
    raceKey = key;
    const players = room.players.map((p) => ({ id: p.id, name: p.name, color: p.color, me: p.id === online.myId }));
    startRace({ mode: 'online', track: clamp(room.race.track, 0, TRACKS.length - 1), laps: room.race.laps, players, startAt: room.race.startAt });
    // si entramos tarde (reconexión), la carrera ya empezó
    for (const r of room.race.results || []) {
      const c = S.cars.find((x) => x.id === r.id);
      if (c) {
        c.finished = true;
        c.finishT = r.time;
      }
    }
  }
}

// ================================================================ sonido
const sfx = (k, v = 0) => {
  if (k === 'hit') noise(0.12, { freq: 380, q: 1.2, vol: Math.min(0.5, v / 900), type: 'lowpass' });
  else if (k === 'bump') noise(0.1, { freq: 600, q: 1, vol: Math.min(0.35, v / 900) });
  else if (k === 'beep') tone(520, 520, 0.2, { type: 'square', vol: 0.1 });
  else if (k === 'go') tone(1040, 1040, 0.45, { type: 'square', vol: 0.12 });
  else if (k === 'lap') notes([880, 1320], { step: 0.08, dur: 0.12, vol: 0.12 });
  else if (k === 'bank') tone(560 + v * 60, 1120 + v * 120, 0.16, { type: 'triangle', vol: 0.12 });
  else if (k === 'lost') tone(300, 120, 0.3, { type: 'sawtooth', vol: 0.08 });
  else if (k === 'finish') notes([523, 659, 784, 1047], { step: 0.09, dur: 0.2, type: 'square', vol: 0.07 });
  else if (k === 'win') notes([523, 659, 784, 1047, 1319, 1568], { step: 0.09, dur: 0.24, type: 'square', vol: 0.07 });
  else if (k === 'lose') notes([392, 330, 262], { step: 0.15, dur: 0.28, type: 'sawtooth', vol: 0.05 });
  else if (k === 'ui') tone(900, 620, 0.05, { type: 'square', vol: 0.04 });
};

/** Motor (dos osciladores filtrados con "cambios") y chirrido de gomas (ruido filtrado). */
const motors = [];
function makeMotor(ac, pan) {
  const o1 = ac.createOscillator();
  const o2 = ac.createOscillator();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  o1.type = 'sawtooth';
  o2.type = 'square';
  f.type = 'lowpass';
  f.frequency.value = 800;
  g.gain.value = 0;
  const out = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
  if (out.pan) out.pan.value = pan;
  o1.connect(f);
  o2.connect(f);
  f.connect(g).connect(out).connect(ac.destination);
  o1.start();
  o2.start();
  const len = ac.sampleRate;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 4;
  const sg = ac.createGain();
  sg.gain.value = 0;
  src.connect(bp).connect(sg).connect(out);
  src.start();
  return { o1, o2, f, g, sg, bp };
}
const GEARS = [0, 170, 330, 490, 650, 820, 2000];
let actx = null;
function audioOn() {
  if (motors.length) return;
  actx = unlock();
  if (actx) motors.push(makeMotor(actx, -0.4), makeMotor(actx, 0.4));
}
function engineSound() {
  if (!motors.length) return;
  const ac = actx;
  const v = vol();
  const now = ac.currentTime;
  const active = S.state !== 'menu' && !S.paused && !G.paused && !S.results;
  motors.forEach((m, i) => {
    const c = active ? S.views[i]?.car : null;
    const solo = S.views.length === 1;
    if (!c) {
      m.g.gain.setTargetAtTime(0, now, 0.08);
      m.sg.gain.setTargetAtTime(0, now, 0.05);
      return;
    }
    const sp = c.speed;
    let gi = 0;
    while (gi < GEARS.length - 2 && sp > GEARS[gi + 1]) gi++;
    const rpm = clamp((sp - GEARS[gi]) / (GEARS[gi + 1] - GEARS[gi]), 0, 1);
    const rev = S.state === 'count' && c.inp.gas ? 0.6 + Math.random() * 0.1 : 0;
    const base = 48 + (0.35 + 0.65 * Math.max(rpm, rev)) * (70 + gi * 12) + (c.boosting ? 30 : 0);
    m.o1.frequency.setTargetAtTime(base, now, 0.04);
    m.o2.frequency.setTargetAtTime(base * 0.5, now, 0.04);
    m.f.frequency.setTargetAtTime(420 + sp * 1.3 + (c.gas ? 400 : 0), now, 0.05);
    const k = solo ? 1 : 0.7;
    m.g.gain.setTargetAtTime((0.03 + (c.gas ? 0.028 : 0) + (c.boosting ? 0.02 : 0)) * v * k, now, 0.08);
    const sq = c.drifting || (c.hand && c.speed > 120) || c.spin > 0 ? Math.min(0.09, Math.abs(Math.sin(c.slip)) * 0.12 + 0.02) : 0;
    m.bp.frequency.setTargetAtTime(1800 + Math.abs(c.slip) * 900, now, 0.05);
    m.sg.gain.setTargetAtTime(sq * v * k, now, 0.05);
  });
}

// ================================================================ arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('mode-local').hidden = !!G.prefs.touch;
  $('keys-hint').innerHTML = G.prefs.touch ? esc(t('howTouch')) : t('keys');
  painter.glow = G.prefs.glow !== false;
  painter.motion = !G.prefs.reducedMotion;
  painter.flush();
  document.body.classList.toggle('touch', !!G.prefs.touch);
  if ($('s-setup').classList.contains('on')) refreshSetup();
  if (online?.room && $('s-lobby').classList.contains('on')) {
    lobby.track = -1;
    applyRoom(online.room);
  }
  for (const v of S.views)
    if (v.hud) {
      $$('[data-t]', v.hud.root).forEach((n) => (n.textContent = t(n.dataset.t)));
      v.hud.last = {};
    }
  applyKeys();
}
G.onPrefs(applyPrefs, true);
G.onPause(() => {
  for (const k in touchIn) touchIn[k] = 0;
  down.clear();
  applyKeys();
});
addEventListener('resize', () => {
  layout();
  lastHud = 0;
});
addEventListener('pointerdown', () => {
  if (S.state !== 'menu') audioOn();
});
startDemo(0);
layout();
requestAnimationFrame(frame);
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
G.gameplay(false);
G.ready();
if (/[?&]debug\b/.test(location.search)) window.__drift = { S, startRace, painter, standings };
