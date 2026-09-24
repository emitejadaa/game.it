/* Drift Neon — game.it
 * Carreras de derrape vistas desde arriba en una ciudad synthwave.
 * Modos: contrarreloj (con fantasma de tu mejor vuelta), desafío de drift, 2 jugadores en el mismo
 * teclado y carrera online de 1 a 4 jugadores.
 */
import { TRACKS, build, locate } from './tracks.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];

const TXT = {
  tagline: { es: 'Derrapá, cargá nitro y bajá tus tiempos', en: 'Drift, charge nitro and cut your times' },
  trial: { es: 'CONTRARRELOJ', en: 'TIME TRIAL' },
  trialSub: { es: 'Contra tu fantasma de la mejor vuelta', en: 'Race your best-lap ghost' },
  driftMode: { es: 'DESAFÍO DE DRIFT', en: 'DRIFT CHALLENGE' },
  driftSub: { es: '90 segundos para sumar la mayor cantidad de puntos', en: '90 seconds to rack up drift points' },
  local: { es: '2 JUGADORES', en: '2 PLAYERS' },
  localSub: { es: 'En el mismo teclado', en: 'Same keyboard' },
  online: { es: 'CARRERA ONLINE', en: 'ONLINE RACE' },
  onlineSub: { es: 'De 1 a 4 pilotos con código de sala', en: '1 to 4 drivers with a room code' },
  track: { es: 'Pista', en: 'Track' },
  laps: { es: 'Vueltas', en: 'Laps' },
  race: { es: 'CORRER', en: 'RACE' },
  back: { es: '← volver', en: '← back' },
  lap: { es: 'vuelta', en: 'lap' },
  time: { es: 'tiempo', en: 'time' },
  pos: { es: 'puesto', en: 'pos' },
  driftPts: { es: 'drift', en: 'drift' },
  brakeBtn: { es: 'FRENO', en: 'BRAKE' },
  quit: { es: 'salir', en: 'quit' },
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
  rematch: { es: 'REVANCHA', en: 'REMATCH' },
  waitRematch: { es: 'Esperando revancha…', en: 'Waiting for rematch…' },
  menu: { es: 'menú', en: 'menu' },
  finish: { es: '¡LLEGASTE!', en: 'FINISHED!' },
  timeUp: { es: '¡TIEMPO!', en: 'TIME UP!' },
  winner: { es: '¡GANÓ {n}!', en: '{n} WINS!' },
  youWin: { es: '¡GANASTE!', en: 'YOU WIN!' },
  place: { es: 'PUESTO {n}', en: 'PLACE {n}' },
  total: { es: 'total', en: 'total' },
  bestLap: { es: 'mejor vuelta', en: 'best lap' },
  sessionBest: { es: 'récord sesión', en: 'session best' },
  points: { es: 'puntos', en: 'points' },
  bestCombo: { es: 'mejor combo', en: 'best combo' },
  lost: { es: '¡COMBO PERDIDO!', en: 'COMBO LOST!' },
  newBest: { es: '¡NUEVO RÉCORD!', en: 'NEW RECORD!' },
  waitFinish: { es: 'Esperando que lleguen los demás…', en: 'Waiting for the others…' },
  dnf: { es: 'no terminó', en: 'DNF' },
  player: { es: 'Jugador {n}', en: 'Player {n}' },
  keysSolo: { es: '<kbd>↑↓←→</kbd>/<kbd>WASD</kbd> manejar · <kbd>ESPACIO</kbd> freno de mano (drift) · <kbd>SHIFT</kbd> nitro', en: '<kbd>↑↓←→</kbd>/<kbd>WASD</kbd> drive · <kbd>SPACE</kbd> handbrake (drift) · <kbd>SHIFT</kbd> nitro' },
  keysLocal: { es: 'J1: <kbd>WASD</kbd> <kbd>ESPACIO</kbd> drift <kbd>SHIFT IZQ</kbd> nitro · J2: <kbd>↑↓←→</kbd> <kbd>.</kbd>/<kbd>CTRL DER</kbd> drift <kbd>/</kbd>/<kbd>SHIFT DER</kbd> nitro', en: 'P1: <kbd>WASD</kbd> <kbd>SPACE</kbd> drift <kbd>L-SHIFT</kbd> nitro · P2: <kbd>↑↓←→</kbd> <kbd>.</kbd>/<kbd>R-CTRL</kbd> drift <kbd>/</kbd>/<kbd>R-SHIFT</kbd> nitro' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
};

// ================= física del auto =================
const CAR = { acc: 880, maxV: 840, boostV: 1120, brake: 1700, rev: 260, turn: 3.1, gripN: 10, gripDrift: 3.0, gripHand: 1.25, drag: 0.42, r: 15 };
const CP = 8; // puntos de control por vuelta

function makeCar(opts) {
  return { x: 0, y: 0, a: 0, vx: 0, vy: 0, idx: -1, s: 0, prevS: 0, lap: 0, nextCp: CP, negate: false, lapStart: 0, lapTimes: [], best: null, finished: false, finishTime: null, nitro: 0.3, boosting: false, drifting: false, vr: 0, steerVis: 0, trail: [], combo: 0, comboT: 0, comboPts: 0, lostT: 0, driftScore: 0, bestCombo: 0, wheels: null, in: { up: 0, down: 0, left: 0, right: 0, hand: 0, boost: 0 }, ...opts };
}

function placeOnGrid(car, slot) {
  // detrás de la línea de largada, en dos columnas
  const back = 70 + Math.floor(slot / 2) * 70;
  const side = (slot % 2 ? 1 : -1) * 38;
  const i = (T.N - Math.round(back / 14) + T.N) % T.N;
  const nx = -T.ty[i];
  const ny = T.tx[i];
  car.x = T.xs[i] + nx * side;
  car.y = T.ys[i] + ny * side;
  car.a = Math.atan2(T.ty[i], T.tx[i]);
  car.vx = car.vy = 0;
  car.idx = i;
  car.s = car.prevS = T.dist[i];
}

function stepCar(c, dt, now) {
  const I = c.in;
  const fx = Math.cos(c.a);
  const fy = Math.sin(c.a);
  const rx = -fy;
  const ry = fx;
  let vf = c.vx * fx + c.vy * fy;
  let vr = c.vx * rx + c.vy * ry;
  const speed = Math.hypot(c.vx, c.vy);
  const racing = S.state === 'race' && !c.finished;
  const gas = racing ? I.up : 0;
  const brk = racing ? I.down : 0;
  c.boosting = racing && I.boost && c.nitro > 0.01 && gas;
  const maxV = c.boosting ? CAR.boostV : CAR.maxV;
  if (gas && vf < maxV) vf += CAR.acc * (c.boosting ? 1.6 : 1) * dt * (1 - Math.max(0, vf) / (maxV * 1.15));
  if (brk) vf -= vf > 30 ? CAR.brake * dt : vf > -CAR.rev ? CAR.acc * 0.6 * dt : 0;
  vf -= vf * CAR.drag * dt;
  if (!gas && !brk) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 70 * dt);
  if (c.boosting) c.nitro = Math.max(0, c.nitro - dt * 0.42);

  // dirección: gira más a velocidad media, y más todavía con el freno de mano
  const steer = (I.right ? 1 : 0) - (I.left ? 1 : 0);
  c.steerVis += (steer - c.steerVis) * Math.min(1, dt * 10);
  const sf = clamp(speed / 260, 0, 1) * (1 - clamp((speed - 700) / 1400, 0, 0.35));
  const handMul = I.hand ? 1.35 : 1;
  c.a += steer * CAR.turn * sf * handMul * dt * (vf >= 0 ? 1 : -1);

  // agarre lateral: con freno de mano o cruzado, el auto desliza
  const grip = I.hand && speed > 150 ? CAR.gripHand : Math.abs(vr) > 150 ? CAR.gripDrift : CAR.gripN;
  vr *= Math.exp(-grip * dt);
  if (I.hand) vf -= vf * 0.35 * dt;

  const nfx = Math.cos(c.a);
  const nfy = Math.sin(c.a);
  c.vx = nfx * vf - nfy * vr;
  c.vy = nfy * vf + nfx * vr;
  c.vr = vr;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.drifting = Math.abs(vr) > 110 && speed > 240;

  // paredes de la pista
  const L = locate(T, c.x, c.y, c.idx);
  c.idx = L.i;
  const lim = T.width / 2 - CAR.r;
  if (Math.abs(L.lat) > lim) {
    const sgn = Math.sign(L.lat);
    const nx = -T.ty[L.i] * sgn;
    const ny = T.tx[L.i] * sgn;
    const over = Math.abs(L.lat) - lim;
    c.x -= nx * over;
    c.y -= ny * over;
    const vn = c.vx * nx + c.vy * ny;
    if (vn > 0) {
      c.vx -= nx * vn * 1.35;
      c.vy -= ny * vn * 1.35;
      c.vx *= 0.93;
      c.vy *= 0.93;
      if (vn > 90) {
        sparks(c.x + nx * CAR.r, c.y + ny * CAR.r, Math.min(20, vn / 25), c);
        if (c.local) sfx('hit', vn);
      }
      if (vn > 170 && c.comboPts > 0) loseCombo(c);
    }
  }

  // progreso y vueltas
  c.prevS = c.s;
  c.s = ((L.s % T.length) + T.length) % T.length;
  if (racing) laps(c, now);
  drift(c, dt);

  // estela de luces traseras
  if (!G.prefs.reducedMotion) {
    c.trail.push([c.x - nfx * 20, c.y - nfy * 20]);
    if (c.trail.length > 18) c.trail.shift();
  }
  if (c.drifting) skid(c);
  else c.wheels = null;
}

function laps(c, now) {
  const Lg = T.length;
  // puntos de control en orden
  if (c.nextCp < CP) {
    const at = (c.nextCp * Lg) / CP;
    if (c.s >= at && c.s < at + Lg / CP) c.nextCp++;
  }
  const fwd = c.prevS > Lg * 0.75 && c.s < Lg * 0.25;
  const back = c.prevS < Lg * 0.25 && c.s > Lg * 0.75;
  if (back) c.negate = true;
  if (!fwd) return;
  if (c.negate) {
    c.negate = false;
    return;
  }
  if (c.nextCp < CP) return; // se salteó parte de la pista
  c.nextCp = 1;
  const tNow = now - S.raceStart;
  if (c.lap > 0) {
    const lt = tNow - c.lapStart;
    c.lapTimes.push(lt);
    const prevBest = c.best;
    if (c.best == null || lt < c.best) {
      c.best = lt;
      if (c.local && S.mode === 'trial') {
        S.ghostBest = c.ghostRec.slice();
        S.ghostBestLap = lt;
      }
    }
    if (c.local && c === me()) {
      const el = $('split');
      if (prevBest != null) {
        const d = lt - prevBest;
        el.textContent = `${d < 0 ? '−' : '+'}${(Math.abs(d) / 1000).toFixed(2)}s`;
        el.className = `split show ${d < 0 ? 'good' : 'bad'}`;
      } else {
        el.textContent = fmt(lt);
        el.className = 'split show good';
      }
      sfx('lap');
    }
  }
  c.lap++;
  c.lapStart = tNow;
  c.ghostRec = [];
  if (S.mode !== 'drift' && c.lap > S.laps) finishCar(c, tNow);
}

function drift(c, dt) {
  // mientras derrapa suma puntos con multiplicador creciente; al soltar, se "cobran"
  if (S.state !== 'race' || c.finished) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (c.drifting) {
    c.comboT += dt;
    c.lostT = 0;
    const mult = 1 + Math.min(7, Math.floor(c.comboT / 1.2));
    c.combo = mult;
    c.comboPts += Math.abs(c.vr) * (speed / 600) * dt * 0.9 * mult;
    c.nitro = Math.min(1, c.nitro + dt * 0.2);
  } else if (c.comboPts > 0) {
    c.lostT += dt;
    if (c.lostT > 0.6) bank(c);
  }
}
function bank(c) {
  const pts = Math.round(c.comboPts);
  c.driftScore += pts;
  c.bestCombo = Math.max(c.bestCombo, pts);
  if (c.local && pts > 50) popup(`+${pts.toLocaleString()} ×${c.combo}`, 'bank');
  if (c.local && pts > 50) sfx('bank');
  c.comboPts = 0;
  c.comboT = 0;
  c.combo = 0;
}
function loseCombo(c) {
  if (c.local) popup(t('lost'), 'lost');
  c.comboPts = 0;
  c.comboT = 0;
  c.combo = 0;
}

function finishCar(c, tNow) {
  c.finished = true;
  c.finishTime = tNow;
  if (c.comboPts > 0) bank(c);
  if (S.mode === 'online' && c.local) online.send({ t: 'finish', time: Math.round(tNow), best: c.best, drift: c.driftScore });
  if (c.local) sfx('finish');
  checkEnd();
}

// ================= estado =================
const S = {
  state: 'menu', // menu | countdown | race | done
  mode: 'trial',
  track: 0,
  laps: 3,
  cars: [],
  raceStart: 0,
  countStart: 0,
  duration: 90000,
  ghostBest: null,
  ghostBestLap: null,
  best: {}, // récords de la sesión por pista/modo
  parts: [],
  cam: { x: 0, y: 0, z: 1 },
};
let T = build(TRACKS[0]);
let online = null;
const me = () => S.cars.find((c) => c.local && c.slot === 0) || S.cars[0];

// ================= render =================
const cv = $('c');
const g = cv.getContext('2d');
let dpr = 1;
let vw = 0;
let vh = 0;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  vw = innerWidth;
  vh = innerHeight;
  cv.width = Math.round(vw * dpr);
  cv.height = Math.round(vh * dpr);
}

let skidCv = null;
let skidG = null;
const SK = 0.5; // resolución de la capa de marcas
let city = [];
let miniPath = null;
function setupTrack(i) {
  S.track = i;
  T = build(TRACKS[i]);
  skidCv = document.createElement('canvas');
  skidCv.width = Math.ceil(T.bounds.w * SK);
  skidCv.height = Math.ceil(T.bounds.h * SK);
  skidG = skidCv.getContext('2d');
  // edificios de neón alrededor, lejos de la pista
  city = [];
  let seed = 7 + i * 101;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const B = T.bounds;
  for (let k = 0; k < 400 && city.length < 90; k++) {
    const w = 60 + rnd() * 140;
    const h = 60 + rnd() * 140;
    const x = B.x - 600 + rnd() * (B.w + 1200);
    const y = B.y - 600 + rnd() * (B.h + 1200);
    let ok = true;
    for (let j = 0; j < T.N && ok; j += 3) if (Math.hypot(T.xs[j] - (x + w / 2), T.ys[j] - (y + h / 2)) < T.width / 2 + Math.max(w, h) * 0.75 + 30) ok = false;
    if (ok && !city.some((c) => x < c.x + c.w + 30 && x + w + 30 > c.x && y < c.y + c.h + 30 && y + h + 30 > c.y)) city.push({ x, y, w, h, c: rnd() < 0.5 ? T.colors[0] : T.colors[1], win: Math.floor(rnd() * 1000) });
  }
  miniPath = null;
}

function trackPath(off) {
  const p = new Path2D();
  for (let i = 0; i <= T.N; i++) {
    const k = i % T.N;
    const x = T.xs[k] - T.ty[k] * off;
    const y = T.ys[k] + T.tx[k] * off;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
  return p;
}
let edges = null;
function edgesFor() {
  if (edges?.T === T) return edges;
  const hw = T.width / 2;
  const surf = new Path2D();
  // superficie: borde derecho hacia adelante y borde izquierdo hacia atrás
  for (let i = 0; i <= T.N; i++) {
    const k = i % T.N;
    const x = T.xs[k] - T.ty[k] * hw;
    const y = T.ys[k] + T.tx[k] * hw;
    i ? surf.lineTo(x, y) : surf.moveTo(x, y);
  }
  for (let i = T.N; i >= 0; i--) {
    const k = i % T.N;
    surf.lineTo(T.xs[k] + T.ty[k] * hw, T.ys[k] - T.tx[k] * hw);
  }
  surf.closePath();
  edges = { T, surf, right: trackPath(hw), left: trackPath(-hw), center: trackPath(0) };
  return edges;
}

function draw(now) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // fondo con resplandor
  const bg = g.createRadialGradient(vw / 2, vh * 1.1, 0, vw / 2, vh * 1.1, Math.max(vw, vh));
  bg.addColorStop(0, '#2a0f3f');
  bg.addColorStop(1, '#0a0614');
  g.fillStyle = bg;
  g.fillRect(0, 0, vw, vh);

  const z = S.cam.z;
  g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - S.cam.x * z), dpr * (vh / 2 - S.cam.y * z));
  const x0 = S.cam.x - vw / 2 / z;
  const y0 = S.cam.y - vh / 2 / z;
  const x1 = S.cam.x + vw / 2 / z;
  const y1 = S.cam.y + vh / 2 / z;

  // grilla del piso
  g.strokeStyle = 'rgba(157,107,255,.09)';
  g.lineWidth = 1.5 / z;
  g.beginPath();
  const step = 120;
  for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
    g.moveTo(x, y0);
    g.lineTo(x, y1);
  }
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
    g.moveTo(x0, y);
    g.lineTo(x1, y);
  }
  g.stroke();

  // edificios
  for (const b of city) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    g.fillStyle = 'rgba(20,10,40,.9)';
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = b.c;
    g.globalAlpha = 0.25;
    g.lineWidth = 8;
    g.strokeRect(b.x, b.y, b.w, b.h);
    g.globalAlpha = 0.9;
    g.lineWidth = 2;
    g.strokeRect(b.x, b.y, b.w, b.h);
    g.globalAlpha = 0.5;
    g.fillStyle = b.c;
    for (let wy = b.y + 14; wy < b.y + b.h - 10; wy += 18)
      for (let wx = b.x + 12; wx < b.x + b.w - 10; wx += 16) if ((b.win + wx * 7 + wy * 13) % 5 < 2) g.fillRect(wx, wy, 6, 8);
    g.globalAlpha = 1;
  }

  // pista
  const E = edgesFor();
  g.fillStyle = '#140b26';
  g.fill(E.surf);
  g.setLineDash([40, 50]);
  g.strokeStyle = 'rgba(255,255,255,.07)';
  g.lineWidth = 4;
  g.stroke(E.center);
  g.setLineDash([]);
  for (const [path, col] of [
    [E.left, T.colors[0]],
    [E.right, T.colors[1]],
  ]) {
    if (G.prefs.glow) {
      g.strokeStyle = col;
      g.globalAlpha = 0.12;
      g.lineWidth = 26;
      g.stroke(path);
      g.globalAlpha = 0.3;
      g.lineWidth = 12;
      g.stroke(path);
    }
    g.globalAlpha = 1;
    g.lineWidth = 4;
    g.strokeStyle = col;
    g.stroke(path);
  }
  // línea de largada a cuadros
  {
    const i = 0;
    const nx = -T.ty[i];
    const ny = T.tx[i];
    const hw = T.width / 2;
    const n = 12;
    for (let k = 0; k < n; k++)
      for (let r = 0; r < 2; r++) {
        g.fillStyle = (k + r) % 2 ? '#fff' : '#1a0f30';
        const a = -hw + (k / n) * T.width;
        const px = T.xs[i] + nx * a + T.tx[i] * (r * 12 - 12);
        const py = T.ys[i] + ny * a + T.ty[i] * (r * 12 - 12);
        g.save();
        g.translate(px, py);
        g.rotate(Math.atan2(T.ty[i], T.tx[i]));
        g.fillRect(0, 0, 12, T.width / n);
        g.restore();
      }
  }

  // marcas de derrape
  g.drawImage(skidCv, T.bounds.x, T.bounds.y, skidCv.width / SK, skidCv.height / SK);

  // fantasma de la mejor vuelta
  if (S.mode === 'trial' && S.ghostBest && S.state === 'race') {
    const c = me();
    const el = now - S.raceStart - c.lapStart;
    const gp = ghostAt(el);
    if (gp) drawCar({ x: gp[1], y: gp[2], a: gp[3], color: '#ffffff', ghost: true, steerVis: 0, trail: [] }, now);
  }

  // partículas
  for (const p of S.parts) {
    const k = p.life / p.max;
    g.globalAlpha = k;
    g.fillStyle = p.c;
    g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  g.globalAlpha = 1;

  // autos
  for (const c of S.cars) drawCar(c, now);
}

function drawCar(c, now) {
  // estela de luz
  if (c.trail?.length > 1) {
    g.lineCap = 'round';
    for (let i = 1; i < c.trail.length; i++) {
      g.strokeStyle = c.color;
      g.globalAlpha = (i / c.trail.length) * (c.ghost ? 0.15 : 0.45);
      g.lineWidth = (i / c.trail.length) * 7;
      g.beginPath();
      g.moveTo(c.trail[i - 1][0], c.trail[i - 1][1]);
      g.lineTo(c.trail[i][0], c.trail[i][1]);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  g.save();
  g.translate(c.x, c.y);
  g.rotate(c.a);
  if (c.ghost) g.globalAlpha = 0.28;
  // luz de los faros
  if (!c.ghost) {
    const beam = g.createLinearGradient(20, 0, 170, 0);
    beam.addColorStop(0, 'rgba(255,255,255,.22)');
    beam.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(20, -8);
    g.lineTo(170, -50);
    g.lineTo(170, 50);
    g.lineTo(20, 8);
    g.fill();
  }
  // llamas del nitro
  if (c.boosting) {
    const l = 26 + Math.sin(now / 25) * 8;
    for (const y of [-6, 6]) {
      g.fillStyle = '#00f0ff';
      g.beginPath();
      g.moveTo(-22, y - 4);
      g.lineTo(-22 - l, y);
      g.lineTo(-22, y + 4);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(-22, y - 2);
      g.lineTo(-22 - l * 0.5, y);
      g.lineTo(-22, y + 2);
      g.fill();
    }
  }
  // ruedas delanteras giradas
  g.fillStyle = '#05030a';
  for (const [wx, wy, st] of [
    [13, -12, 1],
    [13, 12, 1],
    [-13, -12, 0],
    [-13, 12, 0],
  ]) {
    g.save();
    g.translate(wx, wy);
    g.rotate(st ? c.steerVis * 0.45 : 0);
    g.fillRect(-6, -3, 12, 6);
    g.restore();
  }
  // carrocería
  if (G.prefs.glow && !c.ghost) {
    g.shadowColor = c.color;
    g.shadowBlur = 16;
  }
  g.fillStyle = '#12091f';
  g.beginPath();
  g.roundRect(-22, -11, 44, 22, 7);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = c.color;
  g.lineWidth = 2.5;
  g.stroke();
  // techo / parabrisas
  g.fillStyle = c.color;
  g.globalAlpha *= 0.85;
  g.beginPath();
  g.roundRect(-8, -7, 16, 14, 4);
  g.fill();
  g.globalAlpha = c.ghost ? 0.28 : 1;
  g.fillStyle = 'rgba(0,240,255,.8)';
  g.fillRect(8, -6, 5, 12);
  // luces
  g.fillStyle = '#fff';
  g.fillRect(19, -9, 3, 5);
  g.fillRect(19, 4, 3, 5);
  g.fillStyle = c.in?.down ? '#ff2b4a' : '#b0183a';
  g.fillRect(-22, -9, 3, 5);
  g.fillRect(-22, 4, 3, 5);
  g.restore();
  // nombre (online / local)
  if (c.label && !c.ghost) {
    g.font = `700 ${14 / S.cam.z > 20 ? 20 : 14}px Rajdhani, sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = c.color;
    g.fillText(c.label, c.x, c.y - 30);
  }
}

function skid(c) {
  const fx = Math.cos(c.a);
  const fy = Math.sin(c.a);
  const pts = [
    [c.x - fx * 13 + fy * 11, c.y - fy * 13 - fx * 11],
    [c.x - fx * 13 - fy * 11, c.y - fy * 13 + fx * 11],
  ];
  if (c.wheels) {
    skidG.strokeStyle = c.color;
    skidG.globalAlpha = 0.28;
    skidG.lineWidth = 3;
    skidG.lineCap = 'round';
    skidG.beginPath();
    for (let k = 0; k < 2; k++) {
      skidG.moveTo((c.wheels[k][0] - T.bounds.x) * SK, (c.wheels[k][1] - T.bounds.y) * SK);
      skidG.lineTo((pts[k][0] - T.bounds.x) * SK, (pts[k][1] - T.bounds.y) * SK);
    }
    skidG.stroke();
    if (Math.random() < 0.35 && !G.prefs.reducedMotion) S.parts.push({ x: pts[0][0], y: pts[0][1], vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.6, max: 0.6, s: 10 + Math.random() * 10, c: 'rgba(200,180,255,.18)' });
  }
  c.wheels = pts;
}

function sparks(x, y, n, c) {
  if (G.prefs.reducedMotion) return;
  for (let i = 0; i < n; i++) S.parts.push({ x, y, vx: (Math.random() - 0.5) * 500 + c.vx * 0.3, vy: (Math.random() - 0.5) * 500 + c.vy * 0.3, life: 0.35, max: 0.35, s: 3, c: Math.random() < 0.5 ? '#ffd166' : '#fff' });
}

function ghostAt(ms) {
  const gh = S.ghostBest;
  if (!gh || !gh.length || ms > gh[gh.length - 1][0]) return null;
  let lo = 0;
  let hi = gh.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (gh[mid][0] <= ms) lo = mid;
    else hi = mid;
  }
  const a = gh[lo];
  const b = gh[hi];
  const k = clamp((ms - a[0]) / (b[0] - a[0] || 1), 0, 1);
  let da = b[3] - a[3];
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;
  return [ms, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + da * k];
}

// minimapa
const mini = $('mini');
const mg = mini.getContext('2d');
function drawMini() {
  const w = mini.clientWidth;
  const h = mini.clientHeight;
  if (mini.width !== w * dpr) {
    mini.width = w * dpr;
    mini.height = h * dpr;
    miniPath = null;
  }
  const B = T.bounds;
  const s = Math.min((w - 8) / B.w, (h - 8) / B.h);
  const ox = (w - B.w * s) / 2 - B.x * s;
  const oy = (h - B.h * s) / 2 - B.y * s;
  mg.setTransform(dpr, 0, 0, dpr, 0, 0);
  mg.clearRect(0, 0, w, h);
  mg.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  mg.strokeStyle = 'rgba(255,255,255,.35)';
  mg.lineWidth = 60;
  mg.stroke(edgesFor().center);
  for (const c of S.cars) {
    mg.fillStyle = c.color;
    mg.beginPath();
    mg.arc(c.x, c.y, c.local ? 110 : 85, 0, 6.28);
    mg.fill();
  }
}

// ================= carrera =================
function startRace(opts) {
  setupTrack(opts.track);
  S.mode = opts.mode;
  S.laps = opts.laps;
  S.cars = [];
  S.parts = [];
  S.ghostBest = S.mode === 'trial' && S.ghostTrack === opts.track ? S.ghostBest : null;
  S.ghostTrack = opts.track;
  const players = opts.players;
  players.forEach((p, i) => {
    const c = makeCar({ ...p, slot: i });
    placeOnGrid(c, p.grid ?? i);
    S.cars.push(c);
  });
  S.cam = { x: S.cars[0].x, y: S.cars[0].y, z: baseZoom() };
  S.state = 'countdown';
  S.countStart = opts.startAt ?? performance.now() + 600;
  S.startAtServer = opts.startAtServer ?? null;
  lightsStep = -1;
  $('h-score-box').hidden = S.mode !== 'drift';
  $('h-pos-box').hidden = S.mode === 'trial' || S.mode === 'drift';
  $('board').innerHTML = '';
  show(null);
  audio();
}

let lightsStep = -1;
function countdown(now) {
  // semáforo: tres rojas y verde
  const left = S.startAtServer ? S.startAtServer - online.serverNow() : S.countStart + 3000 - now;
  const step = left > 3000 ? -1 : left > 2000 ? 0 : left > 1000 ? 1 : left > 0 ? 2 : 3;
  if (step !== lightsStep) {
    lightsStep = step;
    const L = $$('#lights i');
    $('lights').classList.toggle('on', step >= 0);
    L.forEach((l, i) => (l.className = step === 3 ? 'g' : i <= step ? 'r' : ''));
    if (step >= 0 && step < 3) sfx('beep');
    if (step === 3) {
      sfx('go');
      S.state = 'race';
      S.raceStart = now;
      setTimeout(() => $('lights').classList.remove('on'), 900);
    }
  }
}

function checkEnd() {
  const locals = S.cars.filter((c) => c.local);
  if (S.mode === 'online') {
    if (me().finished && S.state === 'race') showWaiting();
    return;
  }
  if (S.mode === 'local') {
    // termina cuando llegan los dos (o 20 s después del primero)
    if (locals.every((c) => c.finished)) endRace();
    else if (!S.localTimer) S.localTimer = setTimeout(endRace, 20000);
    return;
  }
  if (locals.every((c) => c.finished)) endRace();
}

function endRace() {
  clearTimeout(S.localTimer);
  S.localTimer = null;
  if (S.state === 'done') return;
  S.state = 'done';
  for (const c of S.cars) if (c.comboPts > 0) bank(c);
  showResults();
}

// ================= resultados =================
function showWaiting() {
  $('res-title').textContent = t('finish');
  $('res-big').textContent = fmt(me().finishTime);
  $('res-stats').innerHTML = statsHtml(me());
  $('res-list').innerHTML = `<li><span></span><span>${t('waitFinish')}</span><b></b></li>`;
  $('res-again').hidden = true;
  show('results');
}

function statsHtml(c) {
  return `<div><b>${fmt(c.best)}</b><small>${t('bestLap')}</small></div><div><b>${Math.round(c.driftScore).toLocaleString()}</b><small>${t('points')}</small></div><div><b>${Math.round(c.bestCombo).toLocaleString()}</b><small>${t('bestCombo')}</small></div>`;
}

function showResults(serverResults) {
  const c = me();
  const key = `${S.mode}:${S.track}:${S.laps}`;
  $('res-again').hidden = false;
  $('res-again').textContent = t('again');
  $('res-again').disabled = false;
  if (S.mode === 'trial') {
    const total = c.finishTime;
    const prev = S.best[key];
    const isBest = total != null && (prev == null || total < prev);
    if (isBest) S.best[key] = total;
    $('res-title').textContent = isBest ? t('newBest') : t('finish');
    $('res-big').textContent = fmt(total);
    $('res-stats').innerHTML = statsHtml(c);
    $('res-list').innerHTML = c.lapTimes.map((lt, i) => `<li><span>${i + 1}</span><span>${t('lap')} ${i + 1}</span><b>${fmt(lt)}</b></li>`).join('') + `<li><span>★</span><span>${t('sessionBest')}</span><b>${fmt(S.best[key])}</b></li>`;
    if (isBest) sfx('win');
  } else if (S.mode === 'drift') {
    const pts = Math.round(c.driftScore);
    const prev = S.best[key];
    const isBest = prev == null || pts > prev;
    if (isBest) S.best[key] = pts;
    $('res-title').textContent = isBest ? t('newBest') : t('timeUp');
    $('res-big').textContent = pts.toLocaleString();
    $('res-stats').innerHTML = statsHtml(c);
    $('res-list').innerHTML = `<li><span>★</span><span>${t('sessionBest')}</span><b>${(S.best[key] || 0).toLocaleString()}</b></li>`;
    if (isBest) sfx('win');
  } else {
    const list = serverResults
      ? serverResults.map((r) => ({ name: r.name, color: r.color, time: r.dnf ? null : r.time, best: r.best, drift: r.drift, me: r.id === online.myId }))
      : [...S.cars]
          .map((x) => ({ name: x.label, color: x.color, time: x.finishTime, best: x.best, drift: x.driftScore, me: false, lap: x.lap, s: x.s }))
          .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || b.lap - a.lap || b.s - a.s);
    const top = list[0];
    const mine = list.findIndex((r) => r.me) + 1;
    $('res-title').textContent = S.mode === 'online' ? (mine === 1 ? t('youWin') : t('place', { n: mine })) : t('winner', { n: top.name });
    $('res-big').textContent = fmt(top.time);
    $('res-stats').innerHTML = S.mode === 'online' ? statsHtml(c) : '';
    $('res-list').innerHTML = list
      .map((r, i) => `<li><span style="color:${r.color}">${i + 1}</span><span>${esc(r.name)}${r.me ? ` (${t('you')})` : ''}<small>${t('bestLap')} ${fmt(r.best)} · ${Math.round(r.drift || 0).toLocaleString()} ${t('points')}</small></span><b>${r.time != null ? fmt(r.time) : t('dnf')}</b></li>`)
      .join('');
    if (S.mode === 'online') {
      $('res-again').textContent = online.isHost ? t('rematch') : t('waitRematch');
      $('res-again').disabled = !online.isHost;
    }
    sfx(S.mode === 'online' && mine !== 1 ? 'lose' : 'win');
  }
  show('results');
}

$('res-again').onclick = () => {
  if (S.mode === 'online') return online.isHost && online.send({ t: 'rematch' });
  startRace(S.lastOpts);
};
$('res-menu').onclick = () => {
  if (S.mode === 'online') online.leave();
  S.state = 'menu';
  S.cars = [];
  show('home');
};
$('quit').onclick = () => {
  if (S.mode === 'online') online.leave();
  clearTimeout(S.localTimer);
  S.state = 'menu';
  S.cars = [];
  show('home');
};

// ================= bucle =================
let last = performance.now();
let lastHud = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused && S.mode !== 'online') dt = 0;
  if (S.state === 'countdown') countdown(now);
  if (S.state === 'race' || S.state === 'countdown' || S.state === 'done') {
    const steps = Math.ceil(dt / (1 / 120)) || 1;
    for (let k = 0; k < steps; k++) {
      for (const c of S.cars) if (c.local) stepCar(c, dt / steps, now);
      if (S.mode === 'local') carCollide(S.cars[0], S.cars[1]);
    }
    for (const c of S.cars) if (!c.local) stepRemote(c, dt);
    // grabación del fantasma
    const m = me();
    if (S.mode === 'trial' && S.state === 'race' && m.lap > 0) {
      m.ghostRec ||= [];
      const el = now - S.raceStart - m.lapStart;
      if (!m.ghostRec.length || el - m.ghostRec[m.ghostRec.length - 1][0] > 50) m.ghostRec.push([el, m.x, m.y, m.a]);
    }
    if (S.mode === 'drift' && S.state === 'race' && now - S.raceStart > S.duration) endRace();
    if (S.mode === 'online' && S.state === 'race') sendState(now);
  }
  for (const p of S.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  S.parts = S.parts.filter((p) => p.life > 0);
  camera(dt);
  draw(now);
  if (S.state !== 'menu' && now - lastHud > 60) {
    lastHud = now;
    hud(now);
    drawMini();
  }
  engine();
}

function baseZoom() {
  return clamp(Math.min(vw, vh * 1.4) / 900, 0.45, 1.25);
}
function camera(dt) {
  if (!S.cars.length) {
    // menú: la cámara recorre la pista lentamente
    const k = ((performance.now() / 1000) * 60) % T.length;
    const L = Math.floor((k / T.length) * T.N);
    S.cam.x += (T.xs[L] - S.cam.x) * Math.min(1, dt * 1.5);
    S.cam.y += (T.ys[L] - S.cam.y) * Math.min(1, dt * 1.5);
    S.cam.z = baseZoom() * 0.8;
    return;
  }
  let tx;
  let ty;
  let tz = baseZoom();
  if (S.mode === 'local' && S.cars.length === 2) {
    const [a, b] = S.cars;
    tx = (a.x + b.x) / 2;
    ty = (a.y + b.y) / 2;
    const span = Math.max(Math.abs(a.x - b.x) / (vw * 0.7), Math.abs(a.y - b.y) / (vh * 0.7));
    tz = clamp(Math.min(tz, 1 / Math.max(span, 0.001)), 0.22, tz);
  } else {
    const c = me();
    tx = c.x + c.vx * 0.35;
    ty = c.y + c.vy * 0.35;
    tz *= 1 - clamp(Math.hypot(c.vx, c.vy) / 3200, 0, 0.3);
  }
  const f = Math.min(1, dt * 4);
  S.cam.x += (tx - S.cam.x) * f;
  S.cam.y += (ty - S.cam.y) * f;
  S.cam.z += (tz - S.cam.z) * Math.min(1, dt * 2);
}

function carCollide(a, b) {
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = CAR.r * 2.2;
  if (d > min || d < 0.01) return;
  const nx = dx / d;
  const ny = dy / d;
  const push = (min - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = -rv * 0.8;
    a.vx -= nx * j * 0.5;
    a.vy -= ny * j * 0.5;
    b.vx += nx * j * 0.5;
    b.vy += ny * j * 0.5;
    if (-rv > 120) sfx('hit', -rv);
  }
}

function positions() {
  return [...S.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.lap - a.lap || progress(b) - progress(a);
  });
}
const progress = (c) => (c.s < T.length * 0.5 && c.nextCp >= CP - 1 ? c.s + T.length : c.s);

function hud(now) {
  const c = me();
  const el = S.state === 'race' ? now - S.raceStart : 0;
  $('h-lap').textContent = S.mode === 'drift' ? `${Math.max(1, c.lap)}` : `${clamp(c.lap, 1, S.laps)}/${S.laps}`;
  $('h-time').textContent = S.mode === 'drift' ? fmt(Math.max(0, S.duration - el)) : fmt(c.finished ? c.finishTime : el);
  const order = positions();
  $('h-pos').textContent = `${order.indexOf(c) + 1}°`;
  $('h-score').textContent = Math.round(c.driftScore + c.comboPts).toLocaleString();
  const spd = Math.hypot(c.vx, c.vy);
  $('h-speed').textContent = Math.round(spd * 0.28);
  $('gauge').style.strokeDashoffset = 100 - clamp(spd / CAR.boostV, 0, 1) * 100;
  $('nitro').style.transform = `scaleX(${c.nitro})`;
  const dr = $('drift');
  dr.classList.toggle('on', c.comboPts > 20);
  if (c.comboPts > 20) {
    $('drift-pts').textContent = Math.round(c.comboPts).toLocaleString();
    $('drift-mult').textContent = `DRIFT ×${c.combo || 1}`;
  }
  if (S.cars.length > 1)
    $('board').innerHTML = order.map((x, i) => `<div class="${x === c ? 'me' : ''}"><i style="background:${x.color}"></i>${i + 1}. ${esc(x.label)}${x.finished ? ' ✓' : ''}</div>`).join('');
}

function popup(txt, cls) {
  const el = $('pop');
  el.textContent = txt;
  el.className = `pop ${cls}`;
  void el.offsetWidth;
  el.classList.add('show');
}

// ================= entrada =================
const down = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  down.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
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
const touchIn = { left: 0, right: 0, hand: 0, boost: 0, brake: 0 };
function applyKeys() {
  const has = (...k) => (k.some((x) => down.has(x)) ? 1 : 0);
  const keys = G.prefs.keys;
  const arrows = keys !== 'wasd';
  const wasd = keys !== 'arrows';
  for (const c of S.cars) {
    if (!c.local) continue;
    if (S.mode === 'local') {
      const p1 = c.slot === 0;
      c.in = p1
        ? { up: has('KeyW'), down: has('KeyS'), left: has('KeyA'), right: has('KeyD'), hand: has('Space'), boost: has('ShiftLeft') }
        : { up: has('ArrowUp'), down: has('ArrowDown'), left: has('ArrowLeft'), right: has('ArrowRight'), hand: has('Period', 'ControlRight', 'Numpad0', 'Enter'), boost: has('Slash', 'ShiftRight', 'NumpadDecimal') };
    } else {
      const tch = G.prefs.touch;
      c.in = {
        up: tch ? (touchIn.brake ? 0 : 1) : (arrows && has('ArrowUp')) || (wasd && has('KeyW')) ? 1 : 0,
        down: touchIn.brake || (arrows && has('ArrowDown')) || (wasd && has('KeyS')) ? 1 : 0,
        left: touchIn.left || (arrows && has('ArrowLeft')) || (wasd && has('KeyA')) ? 1 : 0,
        right: touchIn.right || (arrows && has('ArrowRight')) || (wasd && has('KeyD')) ? 1 : 0,
        hand: touchIn.hand || has('Space') ? 1 : 0,
        boost: touchIn.boost || has('ShiftLeft', 'ShiftRight') ? 1 : 0,
      };
    }
  }
}
// botones táctiles (multi-touch)
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
}

// ================= menús =================
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  const inGame = !id;
  $('hud').hidden = !inGame;
  $('quit').hidden = !inGame;
  const touch = G.prefs.touch && inGame && S.mode !== 'local';
  $('pad-l').hidden = !touch;
  $('pad-r').hidden = !touch;
  document.body.classList.toggle('touch', !!G.prefs.touch);
}

let setupMode = 'trial';
function trackButtons(el, cur) {
  el.innerHTML = TRACKS.map((tr, i) => `<button data-v="${i}" class="${i === cur ? 'on' : ''}">${esc(G.t(tr.name))}</button>`).join('');
}
function previewTrack(i) {
  const c = $('track-preview');
  const w = c.clientWidth || 400;
  const h = c.clientHeight || 150;
  c.width = w * dpr;
  c.height = h * dpr;
  const x = c.getContext('2d');
  const Tt = build(TRACKS[i]);
  const B = Tt.bounds;
  const s = Math.min(w / B.w, h / B.h) * 0.92;
  x.setTransform(dpr * s, 0, 0, dpr * s, dpr * ((w - B.w * s) / 2 - B.x * s), dpr * ((h - B.h * s) / 2 - B.y * s));
  x.lineJoin = 'round';
  x.beginPath();
  for (let k = 0; k <= Tt.N; k++) x.lineTo(Tt.xs[k % Tt.N], Tt.ys[k % Tt.N]);
  x.strokeStyle = Tt.colors[0];
  x.globalAlpha = 0.25;
  x.lineWidth = Tt.width * 1.2;
  x.stroke();
  x.globalAlpha = 1;
  x.lineWidth = 24;
  x.strokeStyle = Tt.colors[1];
  x.stroke();
}
document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]');
  if (m) {
    audio();
    sfx('ui');
    setupMode = m.dataset.mode;
    if (setupMode === 'online') {
      $('on-name').value ||= defaultName();
      return show('online');
    }
    $('setup-title').textContent = t(setupMode === 'trial' ? 'trial' : setupMode === 'drift' ? 'driftMode' : 'local');
    $('laps-lbl').hidden = $('laps-seg').hidden = setupMode === 'drift';
    trackButtons($('track-seg'), S.track);
    show('setup');
    requestAnimationFrame(() => previewTrack(S.track));
    return;
  }
  if (e.target.closest('[data-back]')) {
    sfx('ui');
    show('home');
  }
});
$('track-seg').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.track = Number(b.dataset.v);
  trackButtons($('track-seg'), S.track);
  previewTrack(S.track);
  setupTrack(S.track);
  sfx('ui');
};
$('laps-seg').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#laps-seg button').forEach((x) => x.classList.toggle('on', x === b));
  sfx('ui');
};
$('setup-go').onclick = () => {
  const laps = Number($$('#laps-seg button.on')[0]?.dataset.v || 3);
  const players =
    setupMode === 'local'
      ? [
          { local: true, color: '#ff2bd6', label: t('player', { n: 1 }) },
          { local: true, color: '#00f0ff', label: t('player', { n: 2 }) },
        ]
      : [{ local: true, color: '#00f0ff', label: t('you') }];
  S.lastOpts = { mode: setupMode, track: S.track, laps: setupMode === 'drift' ? 99 : laps, players };
  startRace(S.lastOpts);
};

// ================= online =================
let lastSent = 0;
function sendState(now) {
  if (now - lastSent < 66) return;
  lastSent = now;
  const c = me();
  online.raw({ t: 'state', s: [Math.round(c.x), Math.round(c.y), +c.a.toFixed(3), Math.round(c.vx), Math.round(c.vy), c.lap, Math.round(c.s), c.drifting ? 1 : 0] });
}
function stepRemote(c, dt) {
  // interpolación hacia el último estado recibido + extrapolación con su velocidad
  if (c.tx == null) return;
  c.tx += c.vx * dt;
  c.ty += c.vy * dt;
  const k = Math.min(1, dt * 10);
  c.x += (c.tx - c.x) * k;
  c.y += (c.ty - c.y) * k;
  let da = c.ta - c.a;
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;
  c.a += da * k;
  c.trail.push([c.x - Math.cos(c.a) * 20, c.y - Math.sin(c.a) * 20]);
  if (c.trail.length > 18) c.trail.shift();
  c.idx = locate(T, c.x, c.y, c.idx).i;
  if (c.drifting) skid(c);
  else c.wheels = null;
}

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
        if (c) {
          const [x, y, a, vx, vy, lap, s, dr] = m.s;
          if (c.tx == null) {
            c.x = x;
            c.y = y;
            c.a = a;
          }
          Object.assign(c, { tx: x, ty: y, ta: a, vx, vy, lap, s, drifting: !!dr });
        }
      } else if (m.t === 'finished') {
        const c = S.cars.find((x) => x.id === m.id);
        if (c && !c.local) {
          c.finished = true;
          c.finishTime = m.time;
        }
      } else if (m.t === 'end') {
        if (S.state !== 'menu') {
          S.state = 'done';
          showResults(m.results);
        }
      } else if (m.t === 'error') {
        $('on-status').textContent = netText(m.code);
        $('lobby-status').textContent = netText(m.code);
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.state = 'menu';
        S.cars = [];
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
  const r = await share('drift', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};
$('lobby-track').onclick = (e) => {
  const b = e.target.closest('button');
  if (b && online.isHost) online.send({ t: 'settings', settings: { track: Number(b.dataset.v), laps: online.room.settings?.laps ?? 3 } });
};
$('lobby-laps').onclick = (e) => {
  const b = e.target.closest('button');
  if (b && online.isHost) online.send({ t: 'settings', settings: { laps: Number(b.dataset.v), track: lobbyTrack } });
};

let raceKey = null;
let lobbyTrack = 0;
function applyRoom(room) {
  S.mode = 'online';
  if (room.state === 'lobby' || !room.race) {
    raceKey = null;
    $('lobby-code').textContent = room.code;
    $('lobby-players').innerHTML = room.players
      .map((p) => `<li><i style="background:${p.color}"></i>${esc(p.name)}<small>${[p.id === online.myId ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
      .join('');
    // la sala guarda la pista y vueltas elegidas por el anfitrión
    const st = room.settings || {};
    lobbyTrack = st.track ?? 0;
    trackButtons($('lobby-track'), lobbyTrack);
    $$('#lobby-laps button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === (st.laps ?? 3)));
    $('lobby-host').hidden = !online.isHost;
    $('lobby-info').textContent = `${G.t(TRACKS[lobbyTrack].name)} · ${st.laps ?? 3} ${t('laps').toLowerCase()}`;
    $('lobby-start').hidden = !online.isHost;
    $('lobby-status').textContent = online.isHost ? '' : t('waitingHost');
    if (S.state !== 'menu' && S.state !== 'done') S.state = 'menu';
    show('lobby');
    return;
  }
  const key = `${room.race.startAt}`;
  if (key !== raceKey && room.state === 'playing') {
    raceKey = key;
    const players = room.players.map((p, i) => ({ id: p.id, local: p.id === online.myId, color: p.color, label: p.name, grid: i }));
    // mi auto primero (es el que sigue la cámara)
    players.sort((a, b) => b.local - a.local);
    startRace({ mode: 'online', track: room.race.track, laps: room.race.laps, players, startAtServer: room.race.startAt });
  }
}

// ================= sonido =================
let ac = null;
let eng = null;
let screech = null;
function audio() {
  if (ac) return ac.state === 'suspended' && ac.resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
}
function tone(f0, f1, dur, type, vol, at = 0) {
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
function sfx(k, v = 0) {
  if (k === 'hit') tone(140, 50, 0.15, 'square', Math.min(0.25, v / 1500));
  else if (k === 'beep') tone(520, 520, 0.18, 'square', 0.12);
  else if (k === 'go') tone(1040, 1040, 0.4, 'square', 0.14);
  else if (k === 'lap') [880, 1320].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.14, i * 0.08));
  else if (k === 'bank') tone(660, 1320, 0.15, 'triangle', 0.12);
  else if (k === 'finish' || k === 'win') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.2, 'square', 0.08, i * 0.1));
  else if (k === 'lose') [392, 330, 262].forEach((f, i) => tone(f, f, 0.25, 'sawtooth', 0.06, i * 0.15));
  else if (k === 'ui') tone(900, 600, 0.05, 'square', 0.05);
}
/** Motor (dos osciladores filtrados) y chirrido de gomas (ruido) según velocidad y derrape. */
function engine() {
  if (!ac) return;
  const c = S.cars.length && S.state !== 'menu' ? me() : null;
  const vol = G.prefs.volume.sfx;
  if (!eng) {
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    const f = ac.createBiquadFilter();
    const gn = ac.createGain();
    o1.type = 'sawtooth';
    o2.type = 'square';
    f.type = 'lowpass';
    f.frequency.value = 900;
    gn.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(gn).connect(ac.destination);
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
    bp.frequency.value = 2400;
    bp.Q.value = 3;
    const sg = ac.createGain();
    sg.gain.value = 0;
    src.connect(bp).connect(sg).connect(ac.destination);
    src.start();
    eng = { o1, o2, gn, f };
    screech = sg;
  }
  const sp = c ? Math.hypot(c.vx, c.vy) : 0;
  const now = ac.currentTime;
  const base = 55 + sp * 0.2 + (c?.boosting ? 40 : 0);
  eng.o1.frequency.setTargetAtTime(base, now, 0.05);
  eng.o2.frequency.setTargetAtTime(base * 0.5, now, 0.05);
  eng.f.frequency.setTargetAtTime(500 + sp * 1.4, now, 0.05);
  eng.gn.gain.setTargetAtTime(c && !G.paused ? (0.035 + (c.in.up ? 0.03 : 0)) * vol : 0, now, 0.08);
  screech.gain.setTargetAtTime(c && c.drifting && !G.paused ? Math.min(0.1, Math.abs(c.vr) / 4000) * vol : 0, now, 0.05);
}

// ================= arranque =================
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('mode-local').hidden = !!G.prefs.touch;
  $('keys-hint').innerHTML = G.prefs.touch ? '' : `${t('keysSolo')}<br>${t('keysLocal')}`;
  applyKeys();
}, true);
G.onPause(() => ac?.suspend());
G.onResume(() => ac?.resume());
addEventListener('resize', resize);
resize();
setupTrack(0);
S.cam = { x: T.xs[0], y: T.ys[0], z: baseZoom() * 0.8 };
requestAnimationFrame(frame);
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
G.ready();
