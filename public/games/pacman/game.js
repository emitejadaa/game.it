/* Pac-Man — game.it
 * Canvas 2D sin dependencias. Movimiento continuo con sub-pasos (fluido a cualquier tasa de refresco),
 * laberinto pre-renderizado (el costo por cuadro es mínimo) e IA clásica de los cuatro fantasmas.
 */
const G = window.GameIt;

// ================= Textos =================
const TXT = {
  title: { es: 'PAC-MAN', en: 'PAC-MAN' },
  start: { es: 'Presioná cualquier tecla o tocá para jugar', en: 'Press any key or tap to play' },
  hintKeys: { es: 'moverse', en: 'move' },
  hintPause: { es: 'pausa', en: 'pause' },
  hintSwipe: { es: 'deslizá para moverte', en: 'swipe to move' },
  ready: { es: '¡LISTO!', en: 'READY!' },
  pause: { es: 'PAUSA', en: 'PAUSED' },
  resume: { es: 'Continuar', en: 'Resume' },
  restart: { es: 'Reiniciar', en: 'Restart' },
  exit: { es: 'Salir al menú', en: 'Exit to menu' },
  over: { es: 'GAME OVER', en: 'GAME OVER' },
  again: { es: 'Jugar de nuevo', en: 'Play again' },
  score: { es: 'Puntaje', en: 'Score' },
  best: { es: 'Mejor (sesión)', en: 'Best (session)' },
  level: { es: 'Nivel', en: 'Level' },
};
const tr = (k) => G.t(TXT[k]);

// ================= Laberinto =================
const LAYOUT = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];
const W = 28;
const H = 31;
const TUNNEL_Y = 14;
const OPEN = 0,
  WALL = 1,
  DOOR = 2,
  VOID = 3;

const cells = new Uint8Array(W * H);
const dotsInit = new Uint8Array(W * H); // 1 = punto, 2 = pastilla de poder
LAYOUT.forEach((row, y) =>
  [...row].forEach((ch, x) => {
    const i = y * W + x;
    cells[i] = ch === '#' ? WALL : ch === '-' ? DOOR : OPEN;
    dotsInit[i] = ch === '.' ? 1 : ch === 'o' ? 2 : 0;
  }),
);
// Lo que no se alcanza desde el inicio (fuera de los bordes laterales) es vacío, no pasillo.
(() => {
  const seen = new Uint8Array(W * H);
  const stack = [[13, 23]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (seen[i] || cells[i] === WALL) continue;
    seen[i] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (let i = 0; i < W * H; i++) if (cells[i] === OPEN && !seen[i]) cells[i] = VOID;
})();

function cell(x, y) {
  if (y < 0 || y >= H) return VOID;
  if (x < 0 || x >= W) return y === TUNNEL_Y ? OPEN : VOID;
  return cells[y * W + x];
}
const isOpen = (x, y) => cell(x, y) === OPEN;
const inTunnel = (x, y) => Math.round(y) === TUNNEL_Y && (x < 5.5 || x > 21.5);

const DIRS = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
const DIR_ORDER = ['up', 'left', 'down', 'right'];
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const EPS = 1e-6;
const near = (v) => Math.abs(v - Math.round(v)) < EPS;

// ================= Reglas por nivel =================
const BASE_SPEED = 9.47; // casillas/segundo al 100% (arcade)
function speeds(level) {
  if (level === 1) return { pac: 0.8, pacFright: 0.9, ghost: 0.75, fright: 0.5, tunnel: 0.4 };
  if (level <= 4) return { pac: 0.9, pacFright: 0.95, ghost: 0.85, fright: 0.55, tunnel: 0.45 };
  return { pac: 1, pacFright: 1, ghost: 0.95, fright: 0.6, tunnel: 0.5 };
}
const FRIGHT_TIME = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
const frightTime = (level) => FRIGHT_TIME[Math.min(level - 1, FRIGHT_TIME.length - 1)];
const MODES = (level) =>
  level === 1 ? [7, 20, 7, 20, 5, 20, 5, Infinity] : level <= 4 ? [7, 20, 7, 20, 5, 1033, 0.02, Infinity] : [5, 20, 5, 20, 5, 1037, 0.02, Infinity];
const FRUITS = [
  ['cherry', 100],
  ['strawberry', 300],
  ['orange', 500],
  ['orange', 500],
  ['apple', 700],
  ['apple', 700],
  ['melon', 1000],
  ['melon', 1000],
  ['key', 2000],
];
const fruitFor = (level) => FRUITS[Math.min(level - 1, FRUITS.length - 1)];

// ================= Estado =================
const S = {
  state: 'intro', // intro | ready | play | dying | clear | over
  level: 1,
  score: 0,
  best: 0,
  lives: 3,
  extraGiven: false,
  dots: new Uint8Array(W * H),
  dotsLeft: 0,
  dotsEaten: 0,
  timer: 0, // temporizador del estado actual
  modeIdx: 0,
  modeTime: 0,
  fright: 0,
  chain: 0,
  freeze: 0, // pausa breve al comer un fantasma
  sinceDot: 0,
  houseDots: 0,
  diedThisLevel: false,
  fruit: null,
  popups: [],
  sparks: [],
  userPaused: false,
  sysPaused: false,
  time: 0,
};

const pac = { x: 13.5, y: 23, dir: 'left', next: null, moving: false, phase: 0, deathT: 0 };

const GHOSTS = [
  { name: 'blinky', color: 'red', home: [13.5, 14], start: [13.5, 11], corner: [25, -3], limit: [0, 0, 0] },
  { name: 'pinky', color: 'pink', home: [13.5, 14], start: [13.5, 14], corner: [2, -3], limit: [0, 0, 0] },
  { name: 'inky', color: 'cyan', home: [11.5, 14], start: [11.5, 14], corner: [27, 31], limit: [30, 0, 0] },
  { name: 'clyde', color: 'orange', home: [15.5, 14], start: [15.5, 14], corner: [0, 31], limit: [60, 50, 0] },
].map((g) => ({ ...g, x: 0, y: 0, dir: 'left', mode: 'house', frightened: false, reverse: false, path: null, bob: 0 }));

// ================= Canvas =================
const wrap = document.getElementById('stage');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let T = 16; // px de dispositivo por casilla
let dpr = 1;
let mazeLayer, mazeFlash, dotsLayer;
let colors = {};

function palette() {
  const p = G.prefs;
  const c = p.colors;
  const dark = p.theme === 'dark';
  colors = {
    bg: c.bg,
    fg: c.fg,
    wall: c.accent,
    dot: dark ? 'rgba(234,234,240,.72)' : 'rgba(21,21,28,.6)',
    power: c.fg,
    door: c.magenta,
    pac: dark ? '#ffe600' : '#e3a400',
    red: c.red,
    pink: dark ? '#ff7ad9' : '#e04fb8',
    cyan: c.cyan,
    orange: c.amber,
    frightened: dark ? '#3d5afe' : '#2f45d8',
    flash: dark ? '#f4f4ff' : '#9aa0b8',
    eye: '#ffffff',
    pupil: dark ? '#1c2cff' : '#1422b8',
    glow: p.glow,
  };
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = wrap.getBoundingClientRect();
  T = Math.max(6, Math.floor(Math.min((r.width * dpr) / W, (r.height * dpr) / H)));
  canvas.width = W * T;
  canvas.height = H * T;
  canvas.style.width = `${(W * T) / dpr}px`;
  canvas.style.height = `${(H * T) / dpr}px`;
  buildLayers();
}

/** Contorno de las paredes: una línea por el centro de cada casilla de pared que toca pasillo, con esquinas redondeadas. */
function wallPath() {
  const path = new Path2D();
  const open = (x, y) => {
    const c = cell(x, y);
    return c === OPEN || c === DOOR;
  };
  const wall = (x, y) => cell(x, y) === WALL;
  const boundary = (x, y) => {
    if (!wall(x, y)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, y + dy)) return true;
    return false;
  };
  const link = (x, y, d) => {
    const [dx, dy] = DIRS[d];
    const nx = x + dx;
    const ny = y + dy;
    if (!boundary(nx, ny)) return false;
    // el segmento debe correr junto a un pasillo, si no son dos paredes paralelas
    if (dx) return open(x, y - 1) || open(nx, y - 1) || open(x, y + 1) || open(nx, y + 1);
    return open(x - 1, y) || open(x - 1, ny) || open(x + 1, y) || open(x + 1, ny);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!boundary(x, y)) continue;
      const cx = (x + 0.5) * T;
      const cy = (y + 0.5) * T;
      const conns = DIR_ORDER.filter((d) => link(x, y, d));
      const mid = (d) => [cx + (DIRS[d][0] * T) / 2, cy + (DIRS[d][1] * T) / 2];
      if (conns.length === 2 && DIRS[conns[0]][0] !== DIRS[conns[1]][0] && DIRS[conns[0]][1] !== DIRS[conns[1]][1]) {
        const [ax, ay] = mid(conns[0]);
        const [bx, by] = mid(conns[1]);
        path.moveTo(ax, ay);
        path.arcTo(cx, cy, bx, by, T / 2);
      } else if (conns.length === 0) {
        path.moveTo(cx, cy);
        path.lineTo(cx + 0.01, cy);
      } else {
        for (const d of conns) {
          path.moveTo(cx, cy);
          path.lineTo(...mid(d));
        }
      }
    }
  return path;
}

function buildMaze(color) {
  const c = document.createElement('canvas');
  c.width = W * T;
  c.height = H * T;
  const g = c.getContext('2d');
  const path = wallPath();
  const tube = T * 0.4;
  const line = Math.max(1, Math.round(T * 0.08));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (colors.glow) {
    g.save();
    g.shadowColor = color;
    g.shadowBlur = T * 0.7;
    g.strokeStyle = color;
    g.globalAlpha = 0.55;
    g.lineWidth = tube;
    g.stroke(path);
    g.restore();
  }
  // "tubo" de neón: trazo ancho de color y por dentro trazo de fondo = doble línea fina
  g.strokeStyle = color;
  g.lineWidth = tube;
  g.stroke(path);
  g.strokeStyle = colors.bg;
  g.lineWidth = tube - line * 2;
  g.stroke(path);
  // puerta de la casa de los fantasmas
  g.strokeStyle = colors.door;
  g.lineWidth = line * 1.5;
  g.beginPath();
  g.moveTo(13 * T, 12.5 * T);
  g.lineTo(15 * T, 12.5 * T);
  g.stroke();
  return c;
}

function buildLayers() {
  // fondo liso bajo el laberinto (el alfa se pierde en "alpha:false")
  const withBg = (layer) => {
    const c = document.createElement('canvas');
    c.width = layer.width;
    c.height = layer.height;
    const g = c.getContext('2d');
    g.fillStyle = colors.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(layer, 0, 0);
    return c;
  };
  mazeLayer = withBg(buildMaze(colors.wall));
  mazeFlash = withBg(buildMaze(colors.flash));
  dotsLayer = document.createElement('canvas');
  dotsLayer.width = W * T;
  dotsLayer.height = H * T;
  const g = dotsLayer.getContext('2d');
  g.fillStyle = colors.dot;
  const r = Math.max(1, T * 0.12);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (S.dots[y * W + x] === 1) {
        g.beginPath();
        g.arc((x + 0.5) * T, (y + 0.5) * T, r, 0, Math.PI * 2);
        g.fill();
      }
}

// ================= Sonido (sintetizado, sin archivos) =================
const Sound = {
  ctx: null,
  sfx: null,
  music: null,
  siren: null,
  sirenGain: null,
  waka: false,
  ensure() {
    if (this.ctx) return this.ctx.state === 'suspended' && !paused() && this.ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.sfx = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx.connect(this.ctx.destination);
    this.music.connect(this.ctx.destination);
    this.volumes();
  },
  volumes() {
    if (!this.ctx) return;
    const v = G.prefs.volume;
    this.sfx.gain.value = v.sfx * 0.5;
    this.music.gain.value = v.music * 0.5;
  },
  tone(f0, f1, dur, { type = 'square', vol = 0.3, bus = 'sfx', at = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this[bus]);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  eat() {
    this.waka = !this.waka;
    this.waka ? this.tone(520, 260, 0.08, { type: 'triangle', vol: 0.35 }) : this.tone(260, 520, 0.08, { type: 'triangle', vol: 0.35 });
  },
  power() {
    this.tone(180, 720, 0.25, { type: 'sawtooth', vol: 0.15 });
  },
  ghost() {
    this.tone(220, 1400, 0.28, { vol: 0.2 });
  },
  fruit() {
    this.tone(700, 1400, 0.1, { type: 'triangle', vol: 0.3 });
    this.tone(900, 1800, 0.12, { type: 'triangle', vol: 0.3, at: 0.1 });
  },
  life() {
    [880, 1109, 1319].forEach((f, i) => this.tone(f, f, 0.12, { type: 'triangle', vol: 0.3, at: i * 0.1 }));
  },
  death() {
    this.tone(900, 120, 1.1, { type: 'sawtooth', vol: 0.18, at: 0.5 });
    this.tone(300, 60, 0.15, { vol: 0.2, at: 1.65 });
    this.tone(300, 60, 0.15, { vol: 0.2, at: 1.85 });
  },
  jingle() {
    const n = [494, 988, 740, 622, 988, 740, 622, 0, 523, 1047, 784, 659, 1047, 784, 659, 0];
    n.forEach((f, i) => f && this.tone(f, f, 0.1, { type: 'square', vol: 0.12, bus: 'music', at: i * 0.11 }));
  },
  /** Sirena continua de fondo: cambia según el estado (normal, asustados, ojos volviendo). */
  setSiren(kind) {
    if (!this.ctx) return;
    if (!kind) {
      if (this.siren) {
        this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        this.siren.stop(this.ctx.currentTime + 0.3);
        this.siren = null;
      }
      return;
    }
    if (!this.siren) {
      this.siren = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.siren.connect(this.sirenGain).connect(this.music);
      this.siren.start();
    }
    const t = this.ctx.currentTime;
    const cfg = { normal: ['sine', 0.05], fright: ['square', 0.03], eyes: ['triangle', 0.06] }[kind];
    this.siren.type = cfg[0];
    this.sirenGain.gain.setTargetAtTime(cfg[1], t, 0.08);
    this.sirenKind = kind;
  },
  tickSiren(time) {
    if (!this.siren) return;
    const k = this.sirenKind;
    const f =
      k === 'fright'
        ? 190 + 70 * Math.abs(Math.sin(time * 14))
        : k === 'eyes'
          ? 700 + 300 * Math.abs(Math.sin(time * 12))
          : 330 + 110 * (1 - S.dotsLeft / 244) + 90 * Math.sin(time * 5.2);
    this.siren.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.02);
  },
  pause(v) {
    if (!this.ctx) return;
    v ? this.ctx.suspend() : this.ctx.resume();
  },
};

// ================= Juego =================
function resetLevel() {
  S.dots.set(dotsInit);
  S.dotsLeft = 0;
  for (let i = 0; i < S.dots.length; i++) if (S.dots[i]) S.dotsLeft++;
  S.dotsEaten = 0;
  S.diedThisLevel = false;
  S.fruit = null;
  buildLayers();
}

function resetActors() {
  Object.assign(pac, { x: 13.5, y: 23, dir: 'left', next: null, moving: false, phase: 0, deathT: 0 });
  for (const g of GHOSTS) {
    Object.assign(g, { x: g.start[0], y: g.start[1], frightened: false, reverse: false, path: null, bob: Math.random() * 6 });
    g.mode = g.name === 'blinky' ? 'active' : 'house';
    g.dir = g.name === 'blinky' ? 'left' : g.name === 'inky' ? 'up' : 'down';
  }
  S.modeIdx = 0;
  S.modeTime = MODES(S.level)[0];
  S.fright = 0;
  S.chain = 0;
  S.sinceDot = 0;
  S.houseDots = 0;
  S.popups.length = 0;
  S.sparks.length = 0;
}

function newGame() {
  S.level = 1;
  S.score = 0;
  S.lives = 3;
  S.extraGiven = false;
  resetLevel();
  resetActors();
  setState('ready', 2.1);
  Sound.jingle();
  hud();
}

function setState(state, timer = 0) {
  S.state = state;
  S.timer = timer;
  if (state !== 'play') Sound.setSiren(null);
  overlay();
}

const scatter = () => S.modeIdx % 2 === 0;

function addScore(n) {
  S.score += n;
  if (!S.extraGiven && S.score >= 10000) {
    S.extraGiven = true;
    S.lives++;
    Sound.life();
  }
  if (S.score > S.best) S.best = S.score;
  hud();
}

function popup(x, y, text, color) {
  S.popups.push({ x, y, text, color, t: 0 });
}

/**
 * Avanza un actor `dist` casillas sobre la grilla. En cada centro de casilla llama a
 * `decide(actor)` para elegir dirección. Devuelve la distancia realmente recorrida.
 */
function advance(a, dist, decide, canGo) {
  let moved = 0;
  let guard = 8;
  while (dist > EPS && guard--) {
    if (near(a.x) && near(a.y)) {
      a.x = Math.round(a.x);
      a.y = Math.round(a.y);
      decide(a);
      const [dx, dy] = DIRS[a.dir];
      if (!canGo(a.x + dx, a.y + dy)) return moved;
    }
    const [dx, dy] = DIRS[a.dir];
    const pos = dx ? a.x : a.y;
    const s = dx || dy;
    const target = s > 0 ? Math.floor(pos + EPS) + 1 : Math.ceil(pos - EPS) - 1;
    const m = Math.min(Math.abs(target - pos), dist);
    a.x += dx * m;
    a.y += dy * m;
    dist -= m;
    moved += m;
    // túnel: sale por un lado y entra por el otro
    if (a.x <= -1 - EPS || (a.x <= -1 + EPS && dx < 0)) a.x = W;
    else if (a.x >= W + EPS || (a.x >= W - EPS && dx > 0)) a.x = -1;
  }
  return moved;
}

function updatePac(dt) {
  const sp = speeds(S.level);
  const speed = BASE_SPEED * (S.fright > 0 ? sp.pacFright : sp.pac);
  // girar 180° está permitido en cualquier momento
  if (pac.next && pac.next === OPP[pac.dir]) {
    pac.dir = pac.next;
    pac.next = null;
  }
  const moved = advance(
    pac,
    speed * dt,
    (a) => {
      eatAt(a.x, a.y);
      if (a.next) {
        const [dx, dy] = DIRS[a.next];
        if (isOpen(a.x + dx, a.y + dy)) {
          a.dir = a.next;
          a.next = null;
        }
      }
    },
    isOpen,
  );
  pac.moving = moved > 0;
  pac.phase += moved * Math.PI * 1.35;
}

function eatAt(x, y) {
  if (x < 0 || x >= W) return;
  const i = y * W + x;
  const d = S.dots[i];
  if (!d) return;
  S.dots[i] = 0;
  S.dotsLeft--;
  S.dotsEaten++;
  S.sinceDot = 0;
  S.houseDots++;
  const g = dotsLayer.getContext('2d');
  g.clearRect(x * T, y * T, T, T);
  if (d === 1) {
    addScore(10);
    Sound.eat();
  } else {
    addScore(50);
    Sound.power();
    frighten();
  }
  if (S.dotsEaten === 70 || S.dotsEaten === 170) {
    const [kind, points] = fruitFor(S.level);
    S.fruit = { kind, points, t: 9.5 };
  }
  if (S.dotsLeft === 0) setState('clear', 2.2);
}

function frighten() {
  S.fright = frightTime(S.level);
  S.chain = 0;
  for (const g of GHOSTS) {
    if (g.mode === 'eaten' || g.mode === 'entering') continue;
    if (g.mode === 'active') g.reverse = true;
    g.frightened = S.fright > 0;
  }
}

function ghostTarget(g) {
  if (g.mode === 'eaten') return [13, 11];
  if (scatter()) return g.corner;
  const px = Math.round(pac.x);
  const py = Math.round(pac.y);
  const [dx, dy] = DIRS[pac.dir];
  switch (g.name) {
    case 'blinky':
      return [px, py];
    case 'pinky':
      return [px + dx * 4, py + dy * 4];
    case 'inky': {
      const b = GHOSTS[0];
      const ax = px + dx * 2;
      const ay = py + dy * 2;
      return [ax * 2 - Math.round(b.x), ay * 2 - Math.round(b.y)];
    }
    default: {
      const d2 = (px - g.x) ** 2 + (py - g.y) ** 2;
      return d2 > 64 ? [px, py] : g.corner;
    }
  }
}

function ghostDecide(g) {
  if (g.mode === 'eaten' && g.y === 11 && (g.x === 13 || g.x === 14)) {
    // llegó a la puerta: entra a la casa por guion
    g.mode = 'entering';
    g.path = [
      [13.5, 11],
      [13.5, 14],
      [g.home[0], 14],
    ];
    return;
  }
  if (g.reverse) {
    g.reverse = false;
    const [dx, dy] = DIRS[OPP[g.dir]];
    if (isOpen(g.x + dx, g.y + dy)) {
      g.dir = OPP[g.dir];
      return;
    }
  }
  const options = DIR_ORDER.filter((d) => {
    if (d === OPP[g.dir]) return false;
    const [dx, dy] = DIRS[d];
    return isOpen(g.x + dx, g.y + dy);
  });
  if (!options.length) {
    g.dir = OPP[g.dir];
    return;
  }
  if (g.frightened) {
    g.dir = options[(Math.random() * options.length) | 0];
    return;
  }
  const [tx, ty] = ghostTarget(g);
  let best = options[0];
  let bestD = Infinity;
  for (const d of options) {
    const [dx, dy] = DIRS[d];
    const dd = (g.x + dx - tx) ** 2 + (g.y + dy - ty) ** 2;
    if (dd < bestD - EPS) {
      bestD = dd;
      best = d;
    }
  }
  g.dir = best;
}

/** Movimiento por guion (salir/entrar de la casa): recorre puntos en línea recta. */
function followPath(g, dist) {
  while (dist > EPS && g.path.length) {
    const [tx, ty] = g.path[0];
    const dx = tx - g.x;
    const dy = ty - g.y;
    const len = Math.abs(dx) + Math.abs(dy);
    if (len < EPS) {
      g.path.shift();
      continue;
    }
    g.dir = Math.abs(dx) > EPS ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    const m = Math.min(dist, len);
    if (Math.abs(dx) > EPS) g.x += Math.sign(dx) * Math.min(m, Math.abs(dx));
    else g.y += Math.sign(dy) * m;
    dist -= m;
  }
  return !g.path.length;
}

function release(g) {
  g.mode = 'leaving';
  g.path = [
    [13.5, 14],
    [13.5, 11],
  ];
}

function updateGhosts(dt) {
  const sp = speeds(S.level);
  // liberar fantasmas de la casa: por puntos comidos o si Pac-Man no come por un rato
  const lvl = Math.min(S.level, 3) - 1;
  const waiting = GHOSTS.filter((g) => g.mode === 'house');
  if (waiting.length) {
    const next = waiting[0];
    const limit = S.diedThisLevel ? { pinky: 7, inky: 17, clyde: 32 }[next.name] ?? 0 : next.limit[lvl];
    if (S.houseDots >= limit || S.sinceDot > (S.level < 5 ? 4 : 3)) {
      release(next);
      S.houseDots = 0;
      S.sinceDot = 0;
    }
  }

  for (const g of GHOSTS) {
    let speed = BASE_SPEED * sp.ghost;
    if (g.mode === 'eaten' || g.mode === 'entering') speed = BASE_SPEED * 1.9;
    else if (g.frightened) speed = BASE_SPEED * sp.fright;
    else if (inTunnel(g.x, g.y)) speed = BASE_SPEED * sp.tunnel;
    if (g.mode !== 'eaten' && g.mode !== 'entering' && inTunnel(g.x, g.y)) speed = Math.min(speed, BASE_SPEED * sp.tunnel);

    if (g.mode === 'house') {
      g.bob += dt * 4;
      g.y = 14 + Math.sin(g.bob) * 0.35;
      g.dir = Math.cos(g.bob) > 0 ? 'down' : 'up';
    } else if (g.mode === 'leaving') {
      if (followPath(g, speed * 0.6 * dt)) {
        g.mode = 'active';
        g.dir = 'left';
      }
    } else if (g.mode === 'entering') {
      if (followPath(g, speed * dt)) release(g);
    } else {
      advance(g, speed * dt, ghostDecide, (x, y) => isOpen(x, y));
    }
  }
}

function collide() {
  for (const g of GHOSTS) {
    if (g.mode === 'eaten' || g.mode === 'entering' || g.mode === 'house') continue;
    const d2 = (g.x - pac.x) ** 2 + (g.y - pac.y) ** 2;
    if (d2 > 0.36) continue;
    if (g.frightened) {
      g.frightened = false;
      if (g.mode === 'leaving') {
        g.mode = 'entering';
        g.path = [
          [13.5, 14],
          [g.home[0], 14],
        ];
      } else g.mode = 'eaten';
      const pts = 200 * 2 ** S.chain++;
      addScore(pts);
      popup(g.x, g.y, pts, colors.cyan);
      burst(g.x, g.y, colors[g.color]);
      Sound.ghost();
      S.freeze = 0.55;
    } else {
      setState('dying', 2.2);
      pac.deathT = 0;
      Sound.death();
      return;
    }
  }
  if (S.fruit && Math.abs(pac.y - 17) < 0.5 && Math.abs(pac.x - 13.5) < 0.8) {
    addScore(S.fruit.points);
    popup(13.5, 17, S.fruit.points, colors.pink);
    Sound.fruit();
    S.fruit = null;
  }
}

function burst(x, y, color, n = 10) {
  if (G.prefs.reducedMotion) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    S.sparks.push({ x, y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, t: 0, life: 0.5 + Math.random() * 0.2, color });
  }
}

function update(dt) {
  S.time += dt;
  for (const p of S.popups) p.t += dt;
  S.popups = S.popups.filter((p) => p.t < 1);
  for (const s of S.sparks) {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.9;
    s.vy *= 0.9;
  }
  S.sparks = S.sparks.filter((s) => s.t < s.life);

  if (S.state === 'ready') {
    S.timer -= dt;
    if (S.timer <= 0) setState('play');
    return;
  }
  if (S.state === 'dying') {
    S.timer -= dt;
    pac.deathT += dt;
    if (pac.deathT > 0.5 && pac.deathT - dt <= 0.5) Sound.setSiren(null);
    if (pac.deathT > 1.65 && pac.deathT - dt <= 1.65) burst(pac.x, pac.y, colors.pac, 14);
    if (S.timer <= 0) {
      S.lives--;
      hud();
      if (S.lives <= 0) return setState('over');
      S.diedThisLevel = true;
      resetActors();
      setState('ready', 1.6);
    }
    return;
  }
  if (S.state === 'clear') {
    S.timer -= dt;
    if (S.timer <= 0) {
      S.level++;
      resetLevel();
      resetActors();
      hud();
      setState('ready', 1.6);
    }
    return;
  }
  if (S.state !== 'play') return;

  if (S.freeze > 0) {
    S.freeze -= dt;
    return;
  }

  // modos dispersión/persecución (se congelan mientras dura el susto)
  if (S.fright > 0) {
    S.fright -= dt;
    if (S.fright <= 0) {
      S.fright = 0;
      GHOSTS.forEach((g) => (g.frightened = false));
    }
  } else {
    S.modeTime -= dt;
    if (S.modeTime <= 0) {
      const modes = MODES(S.level);
      S.modeIdx = Math.min(S.modeIdx + 1, modes.length - 1);
      S.modeTime = modes[S.modeIdx];
      GHOSTS.forEach((g) => g.mode === 'active' && (g.reverse = true));
    }
  }
  S.sinceDot += dt;
  if (S.fruit && (S.fruit.t -= dt) <= 0) S.fruit = null;

  // sub-pasos: ningún actor avanza más de ~0.15 casillas por paso (colisiones precisas)
  const steps = Math.ceil(dt / (1 / 120));
  const h = dt / steps;
  for (let i = 0; i < steps && S.state === 'play' && S.freeze <= 0; i++) {
    updatePac(h);
    if (S.state !== 'play') break;
    updateGhosts(h);
    collide();
  }

  const eyes = GHOSTS.some((g) => g.mode === 'eaten' || g.mode === 'entering');
  Sound.setSiren(S.state === 'play' ? (eyes ? 'eyes' : S.fright > 0 ? 'fright' : 'normal') : null);
  Sound.tickSiren(S.time);
}

// ================= Dibujo =================
function glow(color, amount = 0.55) {
  if (colors.glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = T * amount;
  }
}
const noGlow = () => (ctx.shadowBlur = 0);
const px = (v) => (v + 0.5) * T;

function drawPac() {
  const x = px(pac.x);
  const y = px(pac.y);
  const r = T * 0.72;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = colors.pac;
  glow(colors.pac);
  if (S.state === 'dying') {
    const k = Math.max(0, Math.min(1, (pac.deathT - 0.5) / 1.15));
    if (k >= 1) return ctx.restore();
    ctx.rotate(-Math.PI / 2);
    const a = 0.1 + k * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, a, Math.PI * 2 - a);
    ctx.closePath();
    ctx.fill();
    return ctx.restore();
  }
  ctx.rotate(ANGLE[pac.dir]);
  const open = S.state === 'play' || S.state === 'dying' ? 0.04 + 0.26 * Math.PI * Math.abs(Math.sin(pac.phase)) : 0.25;
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, 0);
  ctx.arc(0, 0, r, open, Math.PI * 2 - open);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGhost(g) {
  const x = px(g.x);
  const y = px(g.y);
  const r = T * 0.7;
  const eyesOnly = g.mode === 'eaten' || g.mode === 'entering';
  let body = colors[g.color];
  let scared = false;
  if (g.frightened && !eyesOnly) {
    scared = true;
    const flashing = S.fright < 2 && Math.floor(S.fright * 5) % 2 === 0;
    body = flashing ? colors.flash : colors.frightened;
  }
  ctx.save();
  ctx.translate(x, y);
  if (!eyesOnly) {
    ctx.fillStyle = body;
    glow(body, 0.45);
    const top = -r * 0.15;
    const bottom = r * 0.92;
    const wave = Math.floor(S.time * 8) % 2;
    ctx.beginPath();
    ctx.arc(0, top, r, Math.PI, 0);
    ctx.lineTo(r, bottom);
    const n = 3;
    const w = (r * 2) / n;
    for (let i = 0; i < n; i++) {
      const x0 = r - i * w;
      const peak = (i + wave) % 2 ? bottom - r * 0.28 : bottom - r * 0.12;
      ctx.lineTo(x0 - w / 2, peak);
      ctx.lineTo(x0 - w, bottom);
    }
    ctx.closePath();
    ctx.fill();
    noGlow();
  }
  if (scared) {
    ctx.fillStyle = S.fright < 2 && Math.floor(S.fright * 5) % 2 === 0 ? colors.red : '#ffd9e6';
    const e = r * 0.16;
    ctx.fillRect(-r * 0.38 - e / 2, -r * 0.3, e, e);
    ctx.fillRect(r * 0.38 - e / 2, -r * 0.3, e, e);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, T * 0.1);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) ctx.lineTo(-r * 0.55 + (i * r * 1.1) / 6, r * 0.3 + (i % 2 ? -r * 0.12 : 0));
    ctx.stroke();
  } else {
    const [dx, dy] = DIRS[g.dir];
    for (const s of [-1, 1]) {
      const ex = s * r * 0.36 + dx * r * 0.1;
      const ey = -r * 0.22 + dy * r * 0.1;
      ctx.fillStyle = colors.eye;
      ctx.beginPath();
      ctx.ellipse(ex, ey, r * 0.26, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.pupil;
      ctx.beginPath();
      ctx.arc(ex + dx * r * 0.13, ey + dy * r * 0.15, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawFruit(kind, x, y) {
  const r = T * 0.5;
  ctx.save();
  ctx.translate(x, y);
  const c = { cherry: colors.red, strawberry: colors.red, orange: colors.orange, apple: colors.red, melon: '#3ddc84', key: colors.cyan }[kind];
  glow(c, 0.5);
  ctx.fillStyle = c;
  ctx.strokeStyle = '#3ddc84';
  ctx.lineWidth = Math.max(1, T * 0.1);
  if (kind === 'cherry') {
    ctx.beginPath();
    ctx.arc(-r * 0.45, r * 0.35, r * 0.45, 0, Math.PI * 2);
    ctx.arc(r * 0.5, r * 0.5, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, 0);
    ctx.quadraticCurveTo(0, -r, r * 0.7, -r * 0.9);
    ctx.moveTo(r * 0.5, r * 0.1);
    ctx.lineTo(r * 0.7, -r * 0.9);
    ctx.stroke();
  } else if (kind === 'strawberry') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.4);
    ctx.quadraticCurveTo(0, -r * 0.8, r * 0.8, -r * 0.4);
    ctx.quadraticCurveTo(r * 0.6, r * 0.6, 0, r);
    ctx.quadraticCurveTo(-r * 0.6, r * 0.6, -r * 0.8, -r * 0.4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.6);
    ctx.lineTo(0, -r * 0.35);
    ctx.lineTo(r * 0.4, -r * 0.6);
    ctx.stroke();
  } else if (kind === 'key') {
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(0, -r * 0.45, r * 0.4, 0, Math.PI * 2);
    ctx.moveTo(0, -r * 0.05);
    ctx.lineTo(0, r);
    ctx.moveTo(0, r * 0.55);
    ctx.lineTo(r * 0.35, r * 0.55);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, r * 0.1, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7);
    ctx.quadraticCurveTo(r * 0.3, -r * 1.1, r * 0.6, -r);
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(text, x, y, color, size = 0.9) {
  ctx.save();
  ctx.font = `700 ${Math.round(T * size)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  glow(color, 0.5);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function draw() {
  // laberinto (parpadea al completar el nivel)
  const flash = S.state === 'clear' && S.timer < 1.8 && Math.floor(S.timer * 5) % 2 === 0;
  ctx.drawImage(flash ? mazeFlash : mazeLayer, 0, 0);
  ctx.drawImage(dotsLayer, 0, 0);

  // pastillas de poder (laten)
  const pulse = G.prefs.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(S.time * 7);
  ctx.fillStyle = colors.power;
  glow(colors.power, 0.6);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (S.dots[y * W + x] === 2) {
        if (S.state === 'play' && !G.prefs.reducedMotion && Math.floor(S.time * 4) % 2) continue;
        ctx.beginPath();
        ctx.arc(px(x), px(y), T * 0.36 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
  noGlow();

  if (S.fruit) drawFruit(S.fruit.kind, px(13.5), px(17));

  if (S.state !== 'clear' && S.state !== 'intro' && S.state !== 'over') {
    const hideGhosts = S.state === 'dying' && pac.deathT > 0.5;
    if (!hideGhosts) for (const g of GHOSTS) drawGhost(g);
    if (S.freeze <= 0 || S.state !== 'play') drawPac();
  } else if (S.state === 'clear') drawPac();

  for (const s of S.sparks) {
    const k = 1 - s.t / s.life;
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = k;
    ctx.lineWidth = Math.max(1, T * 0.1);
    ctx.beginPath();
    ctx.moveTo(px(s.x), px(s.y));
    ctx.lineTo(px(s.x - s.vx * 0.06), px(s.y - s.vy * 0.06));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of S.popups) {
    ctx.globalAlpha = 1 - p.t;
    drawText(String(p.text), px(p.x), px(p.y) - p.t * T * 1.2, p.color, 0.8);
  }
  ctx.globalAlpha = 1;

  if (S.state === 'ready') drawText(tr('ready'), px(13.5), px(17), colors.pac, 1.1);
  if (S.state === 'clear' && S.timer < 1) drawText(`${tr('level')} ${S.level + 1}`, px(13.5), px(17), colors.wall, 1.1);
}

// ================= Interfaz (HUD y pantallas) =================
const $ = (id) => document.getElementById(id);
const hudScore = $('score');
const hudBest = $('best');
const hudLevel = $('level');
const hudLives = $('lives');
const ov = $('overlay');

function hud() {
  hudScore.textContent = String(S.score).padStart(5, '0');
  hudBest.textContent = String(S.best).padStart(5, '0');
  hudLevel.textContent = S.level;
  const n = Math.max(0, S.lives - 1);
  if (hudLives.childElementCount !== n) hudLives.innerHTML = '<i></i>'.repeat(n);
}

function overlay() {
  const st = S.userPaused && S.state !== 'over' && S.state !== 'intro' ? 'pause' : S.state;
  ov.dataset.state = st;
  const show = st === 'intro' || st === 'pause' || st === 'over';
  ov.classList.toggle('on', show);
  if (!show) return;
  const touch = G.prefs.touch;
  const keys = G.prefs.keys === 'wasd' ? 'W A S D' : G.prefs.keys === 'arrows' ? '← ↑ → ↓' : '← ↑ → ↓ / WASD';
  const hints = touch ? `<p class="hint">${tr('hintSwipe')}</p>` : `<p class="hint"><kbd>${keys}</kbd> ${tr('hintKeys')} · <kbd>P</kbd> ${tr('hintPause')}</p>`;
  if (st === 'intro') {
    ov.innerHTML = `<div class="panel"><h1 class="logo">${tr('title')}</h1><p class="blink">${tr('start')}</p>${hints}</div>`;
  } else if (st === 'pause') {
    ov.innerHTML = `<div class="panel"><h2>${tr('pause')}</h2><div class="btns">
      <button data-a="resume" class="primary">${tr('resume')}</button>
      <button data-a="restart">${tr('restart')}</button>
      <button data-a="exit">${tr('exit')}</button></div>${hints}</div>`;
  } else {
    ov.innerHTML = `<div class="panel"><h2>${tr('over')}</h2>
      <p class="big">${tr('score')} <b>${S.score}</b></p><p class="sub">${tr('best')} ${S.best}</p>
      <div class="btns"><button data-a="restart" class="primary">${tr('again')}</button><button data-a="exit">${tr('exit')}</button></div></div>`;
  }
  requestAnimationFrame(() => ov.querySelector('button.primary')?.focus({ preventScroll: true }));
}

ov.addEventListener('click', (e) => {
  const a = e.target.closest('button')?.dataset.a;
  if (a === 'resume') setUserPause(false);
  else if (a === 'restart') {
    S.userPaused = false;
    Sound.pause(false);
    newGame();
  } else if (a === 'exit') G.exit();
  else if (S.state === 'intro') start();
});

function start() {
  Sound.ensure();
  newGame();
}

const paused = () => S.userPaused || S.sysPaused;

function setUserPause(v) {
  if (S.state === 'intro' || S.state === 'over') return;
  S.userPaused = v;
  Sound.pause(paused());
  overlay();
}

// ================= Entrada =================
function setDir(d) {
  if (!d) return;
  pac.next = d;
}

addEventListener('keydown', (e) => {
  const d = G.dir(e);
  if (S.state === 'intro') {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    start();
    setDir(d);
    return;
  }
  if (e.code === 'KeyP' || e.key === 'Escape') {
    e.preventDefault();
    setUserPause(!S.userPaused);
    return;
  }
  if (S.state === 'over' && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    return start();
  }
  if (d) {
    e.preventDefault();
    if (!paused()) setDir(d);
  }
});

// deslizar el dedo en cualquier parte de la pantalla
let touchStart = null;
wrap.parentElement.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType === 'mouse') return;
    touchStart = { x: e.clientX, y: e.clientY };
    Sound.ensure();
    if (S.state === 'intro') start();
  },
  { passive: true },
);
addEventListener(
  'pointermove',
  (e) => {
    if (!touchStart || e.pointerType === 'mouse') return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    if (Math.hypot(dx, dy) < 18) return;
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    touchStart = { x: e.clientX, y: e.clientY };
  },
  { passive: true },
);
addEventListener('pointerup', () => (touchStart = null));
addEventListener('pointercancel', () => (touchStart = null));

// cruceta táctil (preferencia "Controles táctiles")
document.querySelectorAll('.dpad button').forEach((b) =>
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Sound.ensure();
    if (S.state === 'intro') start();
    setDir(b.dataset.d);
    b.classList.remove('hit');
    void b.offsetWidth;
    b.classList.add('hit');
  }),
);

$('btn-pause').addEventListener('click', () => setUserPause(!S.userPaused));

document.addEventListener('visibilitychange', () => document.hidden && S.state === 'play' && setUserPause(true));
G.onPause(() => {
  S.sysPaused = true;
  Sound.pause(true);
});
G.onResume(() => {
  S.sysPaused = false;
  Sound.pause(paused());
});

// ================= Bucle =================
let last = 0;
function frame(now) {
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
  last = now;
  if (!paused()) update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ================= Arranque =================
function applyPrefs() {
  palette();
  document.documentElement.lang = G.prefs.lang;
  document.querySelectorAll('[data-t]').forEach((n) => (n.textContent = tr(n.dataset.t)));
  document.body.classList.toggle('touch', !!G.prefs.touch);
  Sound.volumes();
  if (canvas.width) {
    // la cruceta cambia el espacio disponible
    requestAnimationFrame(resize);
  }
  overlay();
}

async function boot() {
  G.progress(0.2);
  palette();
  S.dots.set(dotsInit);
  document.body.classList.toggle('touch', !!G.prefs.touch);
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
  G.progress(0.6);
  resize();
  hud();
  overlay();
  G.onPrefs(applyPrefs, true);
  new ResizeObserver(() => resize()).observe(wrap);
  requestAnimationFrame((t) => {
    frame(t);
    G.progress(1);
    G.ready();
  });
}

boot();
