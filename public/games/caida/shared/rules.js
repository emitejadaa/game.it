/**
 * Caída Libre — reglas del tablero (las usan el servidor, el modo sin conexión, los bots y el cliente; todo entero
 * y determinista, sin DOM, sin Math.random ni Date.now).
 *
 * Tablero de 10 columnas por 22 filas: las 2 de arriba están ocultas (ahí nacen las piezas) y las 20 de abajo se
 * ven. Fila 0 = arriba. Una celda vale 0 (vacía), 1..7 (la pieza que la dejó) u 8 (basura).
 *
 * Una pieza es { kind, r, x, y }: `kind` 1..7, `r` rotación 0..3 y (x, y) la esquina de su caja de 2×2, 3×3 o 4×4.
 * Piezas (nombres propios, de 1 a 7): Riel, Bloque, Pico, Ola, Rayo, Ancla, Gancho.
 */
export const W = 10;
export const VISIBLE = 20;
export const HIDDEN = 2;
export const H = VISIBLE + HIDDEN;
export const GARBAGE = 8;

export const PIECE_NAMES = {
  es: ['Riel', 'Bloque', 'Pico', 'Ola', 'Rayo', 'Ancla', 'Gancho'],
  en: ['Rail', 'Block', 'Spike', 'Wave', 'Bolt', 'Anchor', 'Hook'],
};
/** Color neón de cada pieza (índice = kind - 1). Paleta propia, no sigue el reparto de ningún otro juego del género. */
export const PIECE_COLORS = ['#ff5ec4', '#7dff4d', '#00e5ff', '#ffb800', '#9d6bff', '#ff6a3d', '#4d8bff'];
/** Colores elegibles de jugador (los mismos neones que el resto de las arenas). */
export const PALETTE = ['#00f0ff', '#ff2bd6', '#b6ff00', '#ffb800', '#9d6bff', '#ff3b5c', '#3dffa8', '#ff7a2f', '#4d8bff', '#ffe23d', '#ff66a3', '#7dfff2'];

export const CFG = {
  lockMs: 500, // demora de fijado: la pieza apoyada espera medio segundo antes de quedar
  lockResets: 15, // cuántas veces mover o girar la pieza apoyada reinicia esa demora
  softMs: 30, // caída suave: una fila cada tanto
  garbageDelayMs: 1000, // la basura recién entra 1 s después de que te la mandan
  garbageCap: 8, // filas de basura que entran de una sola vez
  garbageQueueCap: 20, // filas pendientes máximas
  queueShown: 5,
  koWindowMs: 12000, // el KO se le acredita a quien te atacó hasta hace tanto
};

// ---------------------------------------------------------------- piezas
const DEFS = [
  { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] }, // 1 Riel
  { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] }, // 2 Bloque
  { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] }, // 3 Pico
  { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] }, // 4 Ola
  { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] }, // 5 Rayo
  { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] }, // 6 Ancla
  { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] }, // 7 Gancho
];

/** SHAPES[kind][r] = [x0, y0, x1, y1, x2, y2, x3, y3] dentro de la caja de la pieza. */
export const SHAPES = [null];
for (const { n, c } of DEFS) {
  const rots = [];
  let cur = c;
  for (let r = 0; r < 4; r++) {
    rots.push(Int8Array.from(cur.flat()));
    cur = cur.map(([x, y]) => [n - 1 - y, x]); // giro horario dentro de la caja
  }
  SHAPES.push(rots);
}

/** Cuántas rotaciones distintas tiene cada pieza (el Bloque, 1; Riel, Ola y Rayo, 2; el resto, 4). */
export const ROTS = [0, 2, 1, 4, 2, 2, 4, 4];

/** Dónde nace una pieza: centrada, en las filas ocultas. */
export function spawnOf(kind) {
  const n = DEFS[kind - 1].n;
  return { kind, r: 0, x: (W - n) >> 1, y: kind === 1 ? -1 : 0 };
}

// ---------------------------------------------------------------- azar
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bagCache = new Map();
/** La bolsa número `j` de una partida: las 7 piezas barajadas (misma semilla = misma bolsa para todos). */
function bagOf(seed, j) {
  let bags = bagCache.get(seed);
  if (!bags) {
    if (bagCache.size >= 12) bagCache.delete(bagCache.keys().next().value);
    bags = [];
    bagCache.set(seed, bags);
  }
  while (bags.length <= j) {
    const rnd = mulberry32((seed ^ Math.imul(bags.length + 1, 0x9e3779b1)) >>> 0);
    const bag = [1, 2, 3, 4, 5, 6, 7];
    for (let i = 6; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [bag[i], bag[k]] = [bag[k], bag[i]];
    }
    bags.push(bag);
  }
  return bags[j];
}

/** La pieza número `i` (desde 0) de la partida con esa semilla. */
export const kindAt = (seed, i) => bagOf(seed, (i / 7) | 0)[i % 7];

/**
 * Cola de piezas y guardado de un jugador. `active` es la pieza que tiene en la mano, `qi` el índice de la próxima
 * que sale de la bolsa y `held` la guardada (0 = nada). Se puede guardar una vez por pieza.
 */
export class Feed {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.qi = 0;
    this.held = 0;
    this.canHold = true;
    this.active = 0;
    this.next();
  }

  /** La pieza siguiente pasa a la mano. */
  next() {
    this.active = kindAt(this.seed, this.qi++);
    this.canHold = true;
  }

  /** Qué pieza tendría en la mano si guardara ahora (0 = no se puede). No cambia nada. */
  peekHold() {
    if (!this.canHold) return 0;
    return this.held || kindAt(this.seed, this.qi);
  }

  /** Guarda la pieza de la mano. Devuelve false si ya se guardó en esta pieza. */
  hold() {
    if (!this.canHold) return false;
    if (this.held) [this.held, this.active] = [this.active, this.held];
    else {
      this.held = this.active;
      this.active = kindAt(this.seed, this.qi++);
    }
    this.canHold = false;
    return true;
  }

  /** Las próximas `n` piezas (la vista previa). */
  preview(n = CFG.queueShown) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(kindAt(this.seed, this.qi + i));
    return out;
  }

  /** Qué pieza debería fijar quien dice haber guardado (h = 1) o no (h = 0). 0 si no es posible. */
  expected(h) {
    if (!h) return this.active;
    return this.peekHold();
  }

  state() {
    return { q: this.qi, hd: this.held, cur: this.active, ch: this.canHold ? 1 : 0 };
  }

  load(s) {
    this.qi = s.q;
    this.held = s.hd;
    this.active = s.cur;
    this.canHold = !!s.ch;
  }
}

// ---------------------------------------------------------------- tablero
export const newGrid = () => new Uint8Array(W * H);

/** ¿Entra la pieza ahí? (dentro de las paredes y el piso, sobre celdas vacías; las celdas no pueden estar por encima del tablero). */
export function fits(grid, kind, r, x, y) {
  const s = SHAPES[kind][r];
  for (let i = 0; i < 8; i += 2) {
    const cx = x + s[i];
    const cy = y + s[i + 1];
    if (cx < 0 || cx >= W || cy < 0 || cy >= H || grid[cy * W + cx] !== 0) return false;
  }
  return true;
}

/** Fila hasta donde cae la pieza soltándola en esa columna y rotación. */
export function dropY(grid, kind, r, x, y) {
  while (fits(grid, kind, r, x, y + 1)) y++;
  return y;
}

/** Legal y apoyada: no puede bajar más. */
export const supported = (grid, kind, r, x, y) => fits(grid, kind, r, x, y) && !fits(grid, kind, r, x, y + 1);

// Patadas de pared propias: se prueba quedarse, correrse a los costados y subir; el orden favorece al lado hacia donde se gira.
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-2, 0], [2, 0], [-2, -1], [2, -1]];

/** Gira la pieza (+1 horario, -1 antihorario) con patadas. Devuelve la pieza nueva o null si no hay forma de girar (o si no cambia nada). */
export function rotated(grid, p, dir) {
  if (p.kind === 2) return null; // el Bloque no cambia al girar
  const r = (p.r + dir) & 3;
  for (const [kx, ky] of KICKS) {
    const x = p.x + (dir > 0 ? kx : -kx);
    const y = p.y + ky;
    if (fits(grid, p.kind, r, x, y)) return { kind: p.kind, r, x, y };
  }
  return null;
}

// Búsqueda de alcanzabilidad: ¿puede una pieza que nace arriba llegar a (r, x, y) moviéndose, girando y bajando?
const SX = W + 8;
const SY = H + 6;
const stamp = new Uint32Array(4 * SX * SY);
const queue = new Int32Array(4 * SX * SY);
let stampN = 0;

/** Camino directo (el que hace casi todo el mundo): girar donde nace, deslizar hasta la columna y bajar derecho. Si existe, el destino es alcanzable. */
function directPath(grid, kind, sp, r, x, y) {
  let p = { kind, r: sp.r, x: sp.x, y: sp.y };
  const turns = (r - sp.r) & 3;
  const dir = turns === 3 ? -1 : 1;
  for (let i = 0, n = turns === 3 ? 1 : turns; i < n; i++) {
    p = rotated(grid, p, dir);
    if (!p) return false;
  }
  if (p.r !== r) return false; // el Bloque (sin giro) o una patada que cambió la rotación: lo resuelve la búsqueda completa
  for (let cx = p.x; cx !== x; ) {
    cx += x > cx ? 1 : -1;
    if (!fits(grid, kind, r, cx, p.y)) return false;
  }
  if (p.y > y) return false;
  for (let cy = p.y + 1; cy <= y; cy++) if (!fits(grid, kind, r, x, cy)) return false;
  return true;
}

/**
 * El servidor no puede confiar en la posición que dice el cliente: se comprueba que la pieza pudo llegar ahí desde
 * donde nace (sin mirar el tiempo: es más permisivo que el juego real, pero no deja teletransportar piezas).
 */
export function reachable(grid, kind, r, x, y) {
  const sp = spawnOf(kind);
  if (!fits(grid, kind, sp.r, sp.x, sp.y)) return false;
  if (directPath(grid, kind, sp, r, x, y)) return true; // casi siempre alcanza: girar arriba, deslizar y soltar
  if (++stampN >= 0xfffffff0) {
    stamp.fill(0);
    stampN = 1;
  }
  const code = (rr, xx, yy) => (rr * SX + (xx + 4)) * SY + (yy + 3);
  let head = 0;
  let tail = 0;
  const target = code(r, x, y);
  const push = (rr, xx, yy) => {
    if (xx < -4 || xx >= W + 4 || yy < -3 || yy >= H + 3) return;
    const c = code(rr, xx, yy);
    if (stamp[c] === stampN) return;
    stamp[c] = stampN;
    queue[tail++] = c;
  };
  push(sp.r, sp.x, sp.y);
  const p = { kind, r: 0, x: 0, y: 0 };
  while (head < tail) {
    const c = queue[head++];
    if (c === target) return true;
    const yy = (c % SY) - 3;
    const rest = (c / SY) | 0;
    const xx = (rest % SX) - 4;
    const rr = (rest / SX) | 0;
    if (fits(grid, kind, rr, xx - 1, yy)) push(rr, xx - 1, yy);
    if (fits(grid, kind, rr, xx + 1, yy)) push(rr, xx + 1, yy);
    if (fits(grid, kind, rr, xx, yy + 1)) push(rr, xx, yy + 1);
    if (kind !== 2) {
      p.r = rr;
      p.x = xx;
      p.y = yy;
      const cw = rotated(grid, p, 1);
      if (cw) push(cw.r, cw.x, cw.y);
      const ccw = rotated(grid, p, -1);
      if (ccw) push(ccw.r, ccw.x, ccw.y);
    }
  }
  return false;
}

/** Deja las 4 celdas de la pieza en el tablero. Devuelve la fila más baja (mayor) y la más alta (menor) que tocó. */
export function place(grid, kind, r, x, y) {
  const s = SHAPES[kind][r];
  let lo = 0;
  let hi = H;
  for (let i = 0; i < 8; i += 2) {
    const cy = y + s[i + 1];
    grid[cy * W + x + s[i]] = kind;
    if (cy > lo) lo = cy;
    if (cy < hi) hi = cy;
  }
  return { lo, hi };
}

/** ¿Quedó toda la pieza en las filas ocultas? (perdés: la pila se pasó del techo) */
export function isLockOut(kind, r, y) {
  const s = SHAPES[kind][r];
  for (let i = 1; i < 8; i += 2) if (y + s[i] >= HIDDEN) return false;
  return true;
}

/** Saca las filas llenas y baja lo de arriba. Devuelve cuántas; `rows` (opcional) recibe sus índices antes de bajar. */
export function clearLines(grid, rows) {
  let n = 0;
  for (let y = H - 1; y >= 0; ) {
    let full = true;
    for (let x = 0; x < W; x++)
      if (grid[y * W + x] === 0) {
        full = false;
        break;
      }
    if (!full) {
      y--;
      continue;
    }
    rows?.push(y - n); // índice que tenía en el tablero original (lo de arriba ya bajó `n` filas)
    grid.copyWithin(W, 0, y * W); // todo lo de arriba baja una fila
    grid.fill(0, 0, W);
    n++;
  }
  return n;
}

/**
 * Sube el tablero `rows` filas y deja basura abajo con un único hueco en la columna `hole`.
 * Devuelve true si algo quedó fuera del techo (la pila se pasó: perdés).
 */
export function addGarbage(grid, rows, hole) {
  let out = false;
  for (let i = 0; i < rows * W && !out; i++) if (grid[i]) out = true;
  grid.copyWithin(0, rows * W);
  for (let y = H - rows; y < H; y++) for (let x = 0; x < W; x++) grid[y * W + x] = x === hole ? 0 : GARBAGE;
  return out;
}

/** Altura de cada columna (0..22). */
export function heights(grid, out = new Array(W)) {
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H && grid[y * W + x] === 0) y++;
    out[x] = H - y;
  }
  return out;
}

const CH = Array.from({ length: 64 }, (_, i) => String.fromCharCode(48 + i));
/** Perfil de alturas en 10 caracteres ('0' = 0 … '>' = 14 … 'F' = 22). */
export function profile(grid) {
  let s = '';
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H && grid[y * W + x] === 0) y++;
    s += CH[H - y];
  }
  return s;
}
export const profileHeights = (s) => Array.from(s, (c) => c.charCodeAt(0) - 48);

export function gridToString(grid) {
  let s = '';
  for (let i = 0; i < grid.length; i++) s += CH[grid[i]];
  return s;
}
export function gridFromString(s, out = newGrid()) {
  if (typeof s !== 'string' || s.length !== W * H) return null;
  for (let i = 0; i < s.length; i++) {
    const v = s.charCodeAt(i) - 48;
    if (!(v >= 0 && v <= GARBAGE)) return null;
    out[i] = v;
  }
  return out;
}

// ---------------------------------------------------------------- ataques y ritmo
const BASE_ATTACK = [0, 0, 1, 2, 4]; // 1 línea → nada, 2 → 1, 3 → 2, 4 → 4
/** Bonus por racha: `combo` es cuántos fijados seguidos con líneas hubo antes de este (0 = el primero). */
export const comboBonus = (combo) => (combo <= 0 ? 0 : combo <= 2 ? 1 : combo <= 4 ? 2 : 3);
export const attackFor = (lines, combo) => (lines > 0 ? BASE_ATTACK[Math.min(4, lines)] + comboBonus(combo) : 0);

/** Milisegundos por fila de la gravedad a los `sec` segundos de partida: arranca lenta y se acelera hasta 20 filas/s. */
export const gravityMs = (sec) => Math.max(50, 900 * Math.pow(0.93, Math.floor(Math.max(0, sec) / 12)));
/** Nivel mostrado (1 = arranque). */
export const levelAt = (sec) => 1 + Math.floor(Math.max(0, sec) / 12);

export const scoreOf = (lines, sent, kos) => lines * 10 + sent * 20 + kos * 100;
