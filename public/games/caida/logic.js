/**
 * Caída Libre — lógica pura del cliente (sin DOM, se prueba desde Node): el tablero propio que se simula acá para
 * responder al instante (Sim), repetición de teclas (Autoshift), gestos táctiles (Gesture), distribución en pantalla
 * (layoutFor), tableros chicos de los rivales (RivalBoards) y el modo sin conexión (OfflineSession: el mismo Match que
 * corre el servidor, dentro del navegador, con los mismos mensajes).
 *
 * Red: el cliente manda cada fijado `lk` y el servidor lo reaplica y contesta `ak`; si algo no coincide manda `bd` y
 * `Sim.resync()` deja el tablero y la cola como los tiene el servidor. La basura de un `ak` se aplica en cuanto llega
 * (`Sim.addGarbage`), y los fijados siguientes declaran cuántas filas ya aplicaron (`a`).
 */
import { choose } from './shared/bots.js';
import { W, H, CFG, Feed, mulberry32, newGrid, fits, dropY, rotated, place, clearLines, addGarbage, spawnOf, isLockOut, gridFromString, gravityMs, SHAPES } from './shared/rules.js';
import { Match } from './shared/match.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Nombre apto para mostrar: sin controles ni < >, acotado. */
export const sanitizeName = (raw, max = 16) =>
  String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- tablero propio
export class Sim {
  constructor() {
    this.grid = newGrid();
    this.feed = new Feed(0);
    this.piece = null;
    this.running = false;
    this.dead = false;
    this.locks = 0;
    this.ga = 0; // filas de basura ya aplicadas a este tablero
    this.timeMs = 0;
    this.soft = false;
  }

  /** Ronda nueva con esta semilla (la cuenta regresiva todavía no terminó: `running` queda apagado). */
  start(seed) {
    this.grid = newGrid();
    this.feed = new Feed(seed);
    this.locks = 0;
    this.ga = 0;
    this.timeMs = 0;
    this.running = false;
    this.dead = false;
    this.soft = false;
    this.spawn();
  }

  spawn() {
    const p = (this.piece = spawnOf(this.feed.active));
    this.gravAcc = 0;
    this.lockMs = 0;
    this.resets = 0;
    if (!fits(this.grid, p.kind, p.r, p.x, p.y)) this.dead = true;
    else if (fits(this.grid, p.kind, p.r, p.x, p.y + 1)) p.y++; // al nacer ya baja una fila, como para asomar en el tablero
  }

  get hasHeld() {
    return !this.feed.canHold;
  }

  grounded() {
    const p = this.piece;
    return !!p && !fits(this.grid, p.kind, p.r, p.x, p.y + 1);
  }

  ghostY() {
    const p = this.piece;
    return p ? dropY(this.grid, p.kind, p.r, p.x, p.y) : 0;
  }

  /** Mover o girar una pieza apoyada reinicia la demora de fijado (hasta 15 veces). */
  touched() {
    if (!this.grounded()) this.lockMs = 0;
    else if (this.resets < CFG.lockResets) {
      this.lockMs = 0;
      this.resets++;
    }
  }

  active() {
    return this.running && !this.dead && !!this.piece;
  }

  move(dx) {
    if (!this.active()) return false;
    const p = this.piece;
    if (!fits(this.grid, p.kind, p.r, p.x + dx, p.y)) return false;
    p.x += dx;
    this.touched();
    return true;
  }

  rotate(dir) {
    if (!this.active()) return false;
    const np = rotated(this.grid, this.piece, dir);
    if (!np) return false;
    this.piece = np;
    this.touched();
    return true;
  }

  setSoft(on) {
    this.soft = !!on;
  }

  down() {
    const p = this.piece;
    if (!p || !fits(this.grid, p.kind, p.r, p.x, p.y + 1)) return false;
    p.y++;
    return true;
  }

  hold() {
    if (!this.active() || !this.feed.hold()) return false;
    this.spawn(); // la pieza que sale de guardar nace arriba; `canHold` queda apagado hasta el próximo fijado
    return true;
  }

  /** Suelta la pieza hasta abajo y la fija. Devuelve el resultado del fijado (ver `lock`). */
  hardDrop() {
    if (!this.active()) return null;
    const p = this.piece;
    p.y = dropY(this.grid, p.kind, p.r, p.x, p.y);
    return this.lock();
  }

  /** Avanza `dt` ms: gravedad (más rápida con el tiempo de partida y con la caída suave) y demora de fijado. Devuelve un fijado o null. */
  update(dt) {
    if (!this.active()) return null;
    this.timeMs += dt;
    const g = gravityMs(this.timeMs / 1000);
    const interval = this.soft ? Math.min(CFG.softMs, g) : g;
    if (this.grounded()) this.gravAcc = 0;
    else {
      this.gravAcc += dt;
      while (this.gravAcc >= interval) {
        this.gravAcc -= interval;
        if (!this.down()) break;
      }
    }
    if (this.grounded()) {
      this.lockMs += dt;
      if (this.lockMs >= CFG.lockMs) return this.lock();
    } else this.lockMs = 0;
    return null;
  }

  /**
   * Fija la pieza donde está. Devuelve { msg, clr, rows, lockOut, cells, kind }: `msg` es el `lk` para el servidor; `rows` las
   * filas que se limpiaron (índices antes de bajar); `cells` las 4 celdas fijadas.
   */
  lock() {
    const p = this.piece;
    const msg = { t: 'lk', n: this.locks, p: p.kind, r: p.r, x: p.x, y: p.y, h: this.feed.canHold ? 0 : 1, a: this.ga };
    const s = SHAPES[p.kind][p.r];
    const cells = [];
    for (let i = 0; i < 8; i += 2) cells.push([p.x + s[i], p.y + s[i + 1]]);
    const lockOut = isLockOut(p.kind, p.r, p.y);
    place(this.grid, p.kind, p.r, p.x, p.y);
    const rows = [];
    const clr = clearLines(this.grid, rows);
    this.locks++;
    this.feed.next();
    this.spawn();
    return { msg, clr, rows, lockOut, cells, kind: p.kind };
  }

  /** Basura que mandó el servidor en un `ak`: sube el tablero y, si la pieza en mano queda encima, la sube también. */
  addGarbage(add) {
    let over = false;
    let total = 0;
    for (const g of add || []) {
      if (!(g.rows > 0 && g.rows <= CFG.garbageCap && g.hole >= 0 && g.hole < W)) continue;
      over = addGarbage(this.grid, g.rows, g.hole) || over;
      this.ga += g.rows;
      total += g.rows;
    }
    const p = this.piece;
    if (p && total && !fits(this.grid, p.kind, p.r, p.x, p.y)) {
      let ok = false;
      for (let k = 1; k <= total + 2 && !ok; k++)
        if (fits(this.grid, p.kind, p.r, p.x, p.y - k)) {
          p.y -= k;
          ok = true;
        }
      if (!ok) this.spawn(); // no hay lugar para subirla: vuelve a nacer (si tampoco entra, perdió)
    }
    if (over) this.dead = true;
    return total;
  }

  /** `bd` del servidor: tablero, cola y contadores reales. */
  resync(bd) {
    const g = gridFromString(bd.grid, this.grid);
    if (!g) return false;
    this.feed.load(bd);
    this.locks = bd.n;
    this.ga = bd.a;
    if (bd.el > 0) this.timeMs = bd.el; // la gravedad sigue donde iba la partida
    this.dead = false;
    this.spawn();
    return true;
  }

  height() {
    let i = 0;
    while (i < this.grid.length && this.grid[i] === 0) i++;
    return H - ((i / W) | 0);
  }
}

// ---------------------------------------------------------------- teclado: DAS / ARR
export class Autoshift {
  /** `das`: ms hasta que empieza a repetir · `arr`: ms entre pasos (0 = hasta la pared). */
  constructor({ das = 150, arr = 33 } = {}) {
    this.das = das;
    this.arr = arr;
    this.clear();
  }

  clear() {
    this.down = { '-1': false, 1: false };
    this.dir = 0;
    this.t = 0;
    this.charged = false;
  }

  /** Se apretó la tecla: devuelve el paso inmediato (-1 o +1). */
  press(dir) {
    this.down[dir] = true;
    this.dir = dir;
    this.t = 0;
    this.charged = false;
    return dir;
  }

  release(dir) {
    this.down[dir] = false;
    if (this.dir !== dir) return;
    const other = -dir;
    this.dir = this.down[other] ? other : 0;
    this.t = 0;
    this.charged = false;
  }

  /** Pasos (con signo) a dar en estos `dt` ms. Con ARR 0 devuelve 99 (el que llama se frena en la pared). */
  update(dt) {
    if (!this.dir) return 0;
    this.t += dt;
    let n = 0;
    if (!this.charged) {
      if (this.t < this.das) return 0;
      this.charged = true;
      this.t -= this.das;
      n = 1;
    }
    if (this.arr <= 0) return this.dir * 99;
    const k = Math.floor(this.t / this.arr);
    this.t -= k * this.arr;
    return this.dir * (n + k);
  }
}

// ---------------------------------------------------------------- táctil
/**
 * Gestos sobre el tablero: tocar = girar, arrastrar de costado = mover por columnas, arrastrar hacia abajo despacio = caída
 * suave, deslizar rápido hacia abajo = caída dura. Devuelve listas de acciones { a: 'move', dx } | { a: 'soft', on } |
 * { a: 'rotate' } | { a: 'hard' }.
 */
export class Gesture {
  constructor({ cell = 24, tapMs = 280, tapPx = 14, hardV = 0.7, hardMin = 36 } = {}) {
    Object.assign(this, { cell, tapMs, tapPx, hardV, hardMin });
    this.active = false;
  }

  down(x, y, t) {
    Object.assign(this, { active: true, x0: x, y0: y, ax: x, t0: t, moved: false, soft: false, samples: [{ y, t }] });
  }

  move(x, y, t) {
    if (!this.active) return [];
    const out = [];
    this.samples.push({ y, t });
    if (this.samples.length > 8) this.samples.shift();
    const step = this.cell * 0.85;
    while (x - this.ax >= step) {
      out.push({ a: 'move', dx: 1 });
      this.ax += step;
      this.moved = true;
    }
    while (this.ax - x >= step) {
      out.push({ a: 'move', dx: -1 });
      this.ax -= step;
      this.moved = true;
    }
    const dy = y - this.y0;
    const dx = x - this.x0;
    if (!this.soft && dy > 22 && dy > Math.abs(dx) * 1.2) {
      this.soft = true;
      this.moved = true;
      out.push({ a: 'soft', on: true });
    } else if (this.soft && dy < 12) {
      this.soft = false;
      out.push({ a: 'soft', on: false });
    }
    return out;
  }

  up(x, y, t) {
    if (!this.active) return [];
    this.active = false;
    const out = [];
    if (this.soft) out.push({ a: 'soft', on: false });
    const dy = y - this.y0;
    const dist = Math.hypot(x - this.x0, dy);
    // velocidad vertical máxima entre muestras seguidas de los últimos ~120 ms (un deslizamiento rápido no es parejo)
    let v = 0;
    const pts = [...this.samples, { y, t }];
    for (let i = 1; i < pts.length; i++) {
      const dt = pts[i].t - pts[i - 1].t;
      if (t - pts[i].t <= 120 && dt >= 6) v = Math.max(v, (pts[i].y - pts[i - 1].y) / dt);
    }
    if (dy > this.hardMin && v >= this.hardV) out.push({ a: 'hard' });
    else if (!this.moved && t - this.t0 <= this.tapMs && dist <= this.tapPx) out.push({ a: 'rotate' });
    return out;
  }

  cancel() {
    this.active = false;
  }
}

// ---------------------------------------------------------------- distribución en pantalla
const TOP = 60; // los 56 px de arriba son del portal

/** Acomoda `n` tableros chicos de a `cols` columnas dentro de una zona: el mayor tamaño de celda `m` que entra. */
export function packMinis(n, zone, { gap = 8, label = 12, mMax = 8, mMin = 1.6 } = {}) {
  if (n <= 0 || zone.w <= 0 || zone.h <= 0) return { m: 0, pos: [] };
  for (let m = mMax; m >= mMin - 1e-9; m -= 0.2) {
    const bw = 10 * m;
    const lab = m >= 3.4 ? label : 0;
    const bh = 20 * m + lab;
    const cols = Math.max(1, Math.floor((zone.w + gap) / (bw + gap)));
    const rows = Math.ceil(n / cols);
    if (rows * (bh + gap) - gap <= zone.h + 1e-6 && cols >= 1 && bw <= zone.w + 1e-6) {
      const pos = [];
      const usedCols = Math.min(cols, n);
      const x0 = zone.x + Math.max(0, (zone.w - (usedCols * (bw + gap) - gap)) / 2);
      for (let i = 0; i < n; i++) pos.push({ x: x0 + (i % cols) * (bw + gap), y: zone.y + Math.floor(i / cols) * (bh + gap) });
      return { m, lab, pos };
    }
  }
  return { m: 0, lab: 0, pos: [] };
}

/**
 * Dónde va cada cosa en una pantalla de w×h: tablero propio (20 filas más la de nacimiento), guardado, cola, medidor de
 * basura y los tableros chicos de `rivals` rivales. 'side' (escritorio y horizontal): los rivales a los costados ·
 * 'strip' (celular vertical): una tira arriba. Nada pasa de los 56 px de arriba, que son del portal.
 */
export function layoutFor(w, h, { rivals = 11, touch = false } = {}) {
  const strip = w < 600 || h > w * 1.15;
  const out = { mode: strip ? 'strip' : 'side', w, h };
  const pad = 8;
  let top = TOP;
  let bottom = 16;
  let c;
  let s;
  let P;
  let nextN = CFG.queueShown;
  // ancho ocupado por el tablero con el guardado a la izquierda y la cola a la derecha
  const spanFor = (cc, ss) => 10 * cc + 2 * (Math.round((strip ? 3.5 : 4.4) * ss) + 18);
  if (strip) {
    const sy = TOP + 44; // debajo de la fila de botones del juego
    const gap = 3;
    const m = clamp(((w - 2 * pad + gap) / Math.max(1, rivals) - gap) / 10, 1.6, 2.8);
    out.strip = { x: pad, y: sy, w: w - 2 * pad, h: rivals > 0 ? Math.ceil(20 * m + 4) : 0, m, gap };
    top = sy + (out.strip.h ? out.strip.h + 10 : 4);
    bottom = touch ? 88 : 24;
    nextN = 3;
    c = clamp(Math.floor((h - top - bottom) / 21), 10, 40);
    s = Math.max(8, Math.floor(c * 0.55));
    while (c > 8 && spanFor(c, s) > w - 2 * pad) (c--, (s = Math.max(8, Math.floor(c * 0.55))));
  } else {
    c = clamp(Math.floor((h - TOP - bottom) / 21), 12, 38);
    s = Math.max(9, Math.floor(c * 0.6));
    // si hay lugar se dejan al menos 120 px a cada lado para los rivales; si no, lo que quede
    while (c > 10 && spanFor(c, s) > w - 2 * 120) (c--, (s = Math.max(9, Math.floor(c * 0.6))));
    while (c > 8 && spanFor(c, s) > w - 2 * pad) (c--, (s = Math.max(8, Math.floor(c * 0.6))));
  }
  P = Math.round((strip ? 3.5 : 4.4) * s);
  const bw = 10 * c;
  const bh = 20 * c;
  const bx = Math.round((w - bw) / 2);
  const spare = Math.max(0, h - top - bottom - 21 * c);
  const rowTop = top + (strip ? 0 : Math.floor(spare / 2)); // arriba de la fila de nacimiento
  const by = rowTop + c;
  out.cell = c;
  out.board = { x: bx, y: by, w: bw, h: bh, top: rowTop };
  out.preview = s;
  out.meter = { x: bx - 12, y: by, w: 7, h: bh };
  out.hold = { x: bx - 18 - P, y: rowTop, w: P, h: Math.round(3 * s + 14) };
  out.next = { x: bx + bw + 12, y: rowTop, w: P, h: Math.round(nextN * 2.9 * s + 14), n: nextN };
  if (strip) {
    const m = out.strip.m;
    const pos = [];
    const used = rivals * (10 * m + out.strip.gap) - out.strip.gap;
    const x0 = out.strip.x + Math.max(0, (out.strip.w - used) / 2);
    for (let i = 0; i < rivals; i++) pos.push({ x: x0 + i * (10 * m + out.strip.gap), y: out.strip.y + 2 });
    out.minis = { m, lab: 0, pos };
  } else {
    const lx = out.hold.x - 14;
    const rx = out.next.x + P + 14;
    const zt = h < 600 ? 108 : 270; // pantallas bajas: el ranking pasa a ser un desplegable y los rivales suben
    const left = { x: 12, y: zt, w: lx - 12, h: h - zt - (h < 600 ? 16 : 46) };
    const right = { x: rx, y: zt, w: w - 12 - rx, h: h - zt - 16 };
    const nl = Math.ceil(rivals / 2);
    const nr = rivals - nl;
    const m = Math.min(nl ? packMinis(nl, left).m : 99, nr ? packMinis(nr, right).m : 99);
    if (!(m > 0 && m < 99)) out.minis = { m: 0, lab: 0, pos: [] };
    else {
      const L = nl ? packMinis(nl, left, { mMax: m }) : { pos: [], lab: 9 };
      const R = nr ? packMinis(nr, right, { mMax: m }) : { pos: [], lab: 9 };
      out.minis = { m, lab: Math.min(L.lab, R.lab) === 9 ? 0 : Math.min(L.lab, R.lab), pos: [...L.pos, ...R.pos] };
    }
    out.zones = { left, right };
  }
  return out;
}

// ---------------------------------------------------------------- tableros chicos de los rivales
/**
 * Lo que se sabe de cada rival: perfil de alturas (llega a 2 Hz y se suaviza para dibujarlo), basura pendiente y si sigue vivo.
 * `shown` se acerca a lo que dijo el servidor un poco por cuadro: los rivales se ven fluidos aunque lleguen pocos datos.
 */
export class RivalBoards {
  constructor() {
    this.map = new Map();
  }

  clear() {
    this.map.clear();
  }

  get(num) {
    let r = this.map.get(num);
    if (!r) this.map.set(num, (r = { num, target: new Float32Array(W), shown: new Float32Array(W), pend: 0, alive: true, rank: 0, hit: 0, flash: 0 }));
    return r;
  }

  /** `sm`: { p: [[num, perfil, pendiente]] }. */
  apply(sm, skip = 0) {
    const seen = new Set();
    for (const row of sm.p || []) {
      const [num, prof, pend] = row;
      if (num === skip || typeof prof !== 'string' || prof.length !== W) continue;
      const r = this.get(num);
      seen.add(num);
      for (let x = 0; x < W; x++) r.target[x] = clamp(prof.charCodeAt(x) - 48, 0, H);
      r.pend = pend | 0;
      if (!r.init) {
        r.shown.set(r.target);
        r.init = true;
      }
    }
    return seen;
  }

  ko(num, rank) {
    const r = this.get(num);
    r.alive = false;
    r.rank = rank;
    r.pend = 0;
  }

  /** Acerca lo mostrado a lo real (cerca de 120 ms para llegar) y apaga los destellos. */
  tick(dt) {
    const k = 1 - Math.exp(-dt / 90);
    for (const r of this.map.values()) {
      for (let x = 0; x < W; x++) r.shown[x] += (r.target[x] - r.shown[x]) * k;
      if (r.hit > 0) r.hit = Math.max(0, r.hit - dt);
      if (r.flash > 0) r.flash = Math.max(0, r.flash - dt);
    }
  }

  maxHeight(num) {
    const r = this.map.get(num);
    if (!r) return 0;
    let m = 0;
    for (let x = 0; x < W; x++) if (r.target[x] > m) m = r.target[x];
    return m;
  }
}

// ---------------------------------------------------------------- sin conexión
/** Niveles del modo "Contra la compu": cuántas personas en total y qué niveles de bot se mezclan. */
export const OFFLINE_LEVELS = {
  easy: { crowd: 6, levels: [1, 1, 1, 2] },
  normal: { crowd: 10, levels: [1, 2, 2, 3, 2] },
  hard: { crowd: 12, levels: [3, 2, 3, 3] },
};

/**
 * El mismo partido del servidor corriendo en el navegador: entrega al juego los mismos mensajes (`reset`, `pl`, `me`, `rs`,
 * `ak`, `sm`, `ko`, `end`…) y recibe los mismos (`lk`, `tg`, `watch`, `hi`). Los mensajes salen en la próxima llamada a
 * `update` (como si hubieran viajado), así el cliente tiene un solo camino de entrada.
 */
export class OfflineSession {
  constructor({ level = 'normal', name = 'Jugador', color = 0, emit, seed }) {
    this.emit = emit;
    this.queue = [];
    this.t = 0;
    this.marathon = level === 'marathon';
    const cfg = OFFLINE_LEVELS[level] || OFFLINE_LEVELS.normal;
    const push = (m) => this.queue.push(m);
    this.m = new Match({
      seed: seed ?? (Date.now() ^ (Math.random() * 1e9)) >>> 0,
      crowd: this.marathon ? 1 : cfg.crowd,
      levels: cfg.levels,
      bots: !this.marathon,
      tide: !this.marathon,
      autoRound: false,
      afkMs: 1e12,
      out: { to: (_, m) => push(m), all: push, soft: push, kick() {} },
    });
    this.me = this.m.addPlayer({ name: sanitizeName(name), color });
    this.num = this.me.num;
    for (const msg of this.m.joinMessages(this.num)) push(msg);
    this.m.newRound(0);
    this.flush();
  }

  flush() {
    const q = this.queue;
    this.queue = [];
    for (const m of q) this.emit(m);
  }

  /** Avanza `dt` ms del partido. */
  update(dt) {
    this.flush();
    this.t += Math.min(dt, 250);
    this.m.step(this.t);
    this.flush();
  }

  send(msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'lk') this.m.lock(this.num, msg, this.t);
    else if (msg.t === 'tg') this.m.setTarget(this.num, msg.m);
    else if (msg.t === 'watch') this.m.watch(this.num, msg.n);
    else if (msg.t === 'hi') this.m.hello(this.num, msg);
  }

  /** Otra ronda (después del final de una). */
  restart() {
    this.m.newRound(this.t);
    this.flush();
  }
}


// ---------------------------------------------------------------- fondo del menú
/** Un tablero que juega solo (para el fondo del menú): el bot elige, la pieza baja, se acomoda y se reinicia si se llena. */
export class DemoBoard {
  constructor(seed) {
    this.brain = { level: 3, noise: 0.3, slip: 0, hold: false };
    this.reset(seed);
  }

  reset(seed) {
    this.seed = seed >>> 0;
    this.grid = newGrid();
    this.feed = new Feed(this.seed);
    this.rnd = mulberry32(this.seed);
    this.piece = null;
    this.target = null;
    this.acc = 0;
  }

  update(dt) {
    this.acc += dt;
    while (this.acc >= 45) {
      this.acc -= 45;
      this.tick();
    }
  }

  tick() {
    if (!this.piece) {
      const c = choose(this.grid, this.feed, this.brain, this.rnd, false);
      if (!c) return this.reset((this.seed + 1) >>> 0);
      this.target = c;
      const sp = spawnOf(c.kind);
      let minY = 9;
      const sh = SHAPES[c.kind][c.r];
      for (let i = 1; i < 8; i += 2) minY = Math.min(minY, sh[i]);
      this.piece = { kind: c.kind, r: c.r, x: sp.x, y: -minY };
      return;
    }
    const p = this.piece;
    const tg = this.target;
    if (p.x !== tg.x) p.x += Math.sign(tg.x - p.x);
    else if (p.y < tg.y) p.y++;
    else {
      place(this.grid, p.kind, p.r, p.x, p.y);
      clearLines(this.grid);
      this.feed.next();
      this.piece = null;
      let i = 0;
      while (i < this.grid.length && this.grid[i] === 0) i++;
      if (H - ((i / W) | 0) > 15) this.reset((this.seed + 7) >>> 0);
    }
  }
}

// ---------------------------------------------------------------- puntaje y textos
export { scoreOf, levelAt } from './shared/rules.js';
