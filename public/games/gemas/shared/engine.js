/**
 * Gemas — el motor, sin DOM: un tablero de 8 × 8 con gemas de colores, los intercambios que valen, las combinaciones, las
 * gemas especiales, las cascadas, la gravedad y la mezcla cuando no queda ninguna jugada. Todo lo que es azar sale de una
 * semilla, así que la misma semilla con las mismas jugadas da siempre la misma partida (en cualquier navegador y en el
 * servidor, que rehace las partidas online para validar el puntaje).
 *
 * Especiales: 4 en línea → rayo (borra su fila si la combinación era horizontal, su columna si era vertical); una L o una T
 * → bomba (borra el 3 × 3 de alrededor); 5 en línea → prisma (no tiene color; cambiado por una gema borra todas las de ese
 * color). Dos especiales cambiados entre sí se combinan (rayo + rayo: cruz; rayo + bomba: tres filas y tres columnas;
 * bomba + bomba: 5 × 5; prisma + rayo o bomba: todas las de ese color se vuelven rayos o bombas y explotan; prisma + prisma:
 * todo el tablero).
 *
 * Cada jugada devuelve la lista de lo que pasó (intercambio, limpiezas con sus efectos, caídas, mezcla) para animarlo.
 */
export const N = 8;
export const MAX_TYPES = 6;
/** El "color" de la gema prisma: no combina con ninguna. */
export const PRISM = 6;
export const SP = { NONE: 0, ROW: 1, COL: 2, BOMB: 3, PRISM: 4 };

/** Generador con semilla (mulberry32) con estado copiable, para poder clonar partidas. */
export class Rng {
  constructor(seed) {
    this.a = seed >>> 0;
  }
  next() {
    let t = (this.a = (this.a + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) {
    return Math.floor(this.next() * n);
  }
  clone() {
    const r = new Rng(0);
    r.a = this.a;
    return r;
  }
}
/** Un texto cualquiera (por ejemplo la fecha) a un número para la semilla. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const idx = (r, c) => r * N + c;
export const rowOf = (i) => Math.floor(i / N);
export const colOf = (i) => i % N;
/** ¿Son vecinas (al lado o arriba/abajo, sin pasar de una fila a la otra)? */
export function adjacent(a, b) {
  if (!(a >= 0 && a < N * N && b >= 0 && b < N * N)) return false;
  const dr = Math.abs(rowOf(a) - rowOf(b)), dc = Math.abs(colOf(a) - colOf(b));
  return dr + dc === 1;
}

const SCORE_GEM = 10;
const BONUS_MADE = { [SP.ROW]: 30, [SP.COL]: 30, [SP.BOMB]: 50, [SP.PRISM]: 80 };
const BONUS_FIRED = 20;

export class Game {
  /**
   * `types`: cuántos colores (3 a 6). `ice`: capas de hielo por casillero (64 números de 0 a 2), que se rompen de a una
   * cuando se borra una gema encima.
   */
  constructor(seed, { types = MAX_TYPES, ice = null } = {}) {
    this.types = Math.max(3, Math.min(MAX_TYPES, types | 0));
    this.rng = new Rng(seed);
    this.t = new Int8Array(N * N).fill(-1);
    this.sp = new Uint8Array(N * N);
    this.id = new Int32Array(N * N);
    this.ice = new Uint8Array(N * N);
    if (ice) for (let i = 0; i < N * N; i++) this.ice[i] = Math.max(0, Math.min(2, ice[i] | 0));
    this.nextId = 1;
    this.score = 0;
    this.moves = 0;
    this.collected = new Array(MAX_TYPES).fill(0);
    this.iceBroken = 0;
    this.bestChain = 0;
    this.made = 0;
    this.fillInitial();
  }

  clone({ blind = false } = {}) {
    const g = Object.create(Game.prototype);
    g.types = this.types;
    // a ciegas: lo que va a caer no se puede espiar (para la compu y las pistas)
    g.rng = blind ? new Rng(hashSeed(`${this.rng.a}:${this.moves}:${this.score}`)) : this.rng.clone();
    g.t = this.t.slice();
    g.sp = this.sp.slice();
    g.id = this.id.slice();
    g.ice = this.ice.slice();
    g.nextId = this.nextId;
    g.score = this.score;
    g.moves = this.moves;
    g.collected = this.collected.slice();
    g.iceBroken = this.iceBroken;
    g.bestChain = this.bestChain;
    g.made = this.made;
    return g;
  }

  get iceLeft() {
    let n = 0;
    for (let i = 0; i < N * N; i++) n += this.ice[i];
    return n;
  }

  /** Tablero inicial sin combinaciones hechas y con al menos una jugada. */
  fillInitial() {
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const i = idx(r, c);
        let k;
        let guard = 0;
        do {
          k = this.rng.int(this.types);
          guard++;
        } while (guard < 60 && ((c >= 2 && this.t[i - 1] === k && this.t[i - 2] === k) || (r >= 2 && this.t[i - N] === k && this.t[i - 2 * N] === k)));
        this.t[i] = k;
        this.sp[i] = 0;
        this.id[i] = this.nextId++;
      }
    if (!this.hasMove()) this.shuffle();
  }

  /** ¿Hay una combinación de 3 o más que pase por el casillero `i`? */
  matchAt(i) {
    const k = this.t[i];
    if (k < 0 || k >= this.types) return false;
    const r = rowOf(i), c = colOf(i);
    let n = 1;
    for (let x = c - 1; x >= 0 && this.t[idx(r, x)] === k; x--) n++;
    for (let x = c + 1; x < N && this.t[idx(r, x)] === k; x++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let y = r - 1; y >= 0 && this.t[idx(y, c)] === k; y--) n++;
    for (let y = r + 1; y < N && this.t[idx(y, c)] === k; y++) n++;
    return n >= 3;
  }

  exchange(a, b) {
    const t = this.t[a], s = this.sp[a], d = this.id[a];
    this.t[a] = this.t[b];
    this.sp[a] = this.sp[b];
    this.id[a] = this.id[b];
    this.t[b] = t;
    this.sp[b] = s;
    this.id[b] = d;
  }

  /** ¿Vale cambiar la gema de `a` con la de `b`? (arma una combinación, o hay un prisma, o son dos especiales) */
  canSwap(a, b) {
    if (!adjacent(a, b) || this.t[a] < 0 || this.t[b] < 0) return false;
    if (this.t[a] === PRISM || this.t[b] === PRISM) return true;
    if (this.sp[a] && this.sp[b]) return true;
    if (this.t[a] === this.t[b]) return false;
    this.exchange(a, b);
    const ok = this.matchAt(a) || this.matchAt(b);
    this.exchange(a, b);
    return ok;
  }

  /** Todas las jugadas que valen, como [a, b] con b a la derecha o abajo de a. */
  validMoves() {
    const out = [];
    for (let i = 0; i < N * N; i++) {
      if (colOf(i) < N - 1 && this.canSwap(i, i + 1)) out.push([i, i + 1]);
      if (rowOf(i) < N - 1 && this.canSwap(i, i + N)) out.push([i, i + N]);
    }
    return out;
  }
  hasMove() {
    for (let i = 0; i < N * N; i++) {
      if (colOf(i) < N - 1 && this.canSwap(i, i + 1)) return true;
      if (rowOf(i) < N - 1 && this.canSwap(i, i + N)) return true;
    }
    return false;
  }

  /**
   * Busca las combinaciones del tablero y las agrupa (las que comparten casilleros forman una L, una T o una cruz).
   * Devuelve null si no hay, o { clear: Set de casilleros a borrar, create: [{ cell, sp, t, from }] } con las especiales que
   * nacen (en `prefer` si alguno de esos casilleros es parte del grupo: es donde el jugador movió la gema).
   */
  findMatches(prefer = []) {
    const runs = [];
    const T = this.types;
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const k = this.t[idx(r, c)];
        let e = c + 1;
        if (k >= 0 && k < T) while (e < N && this.t[idx(r, e)] === k) e++;
        if (k >= 0 && k < T && e - c >= 3) {
          const cells = [];
          for (let x = c; x < e; x++) cells.push(idx(r, x));
          runs.push({ h: true, cells });
        }
        c = e;
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const k = this.t[idx(r, c)];
        let e = r + 1;
        if (k >= 0 && k < T) while (e < N && this.t[idx(e, c)] === k) e++;
        if (k >= 0 && k < T && e - r >= 3) {
          const cells = [];
          for (let y = r; y < e; y++) cells.push(idx(y, c));
          runs.push({ h: false, cells });
        }
        r = e;
      }
    }
    if (!runs.length) return null;
    // las corridas que comparten casilleros van al mismo grupo
    const parent = runs.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const owner = new Map();
    runs.forEach((run, i) =>
      run.cells.forEach((cell) => {
        if (owner.has(cell)) parent[find(i)] = find(owner.get(cell));
        else owner.set(cell, i);
      }),
    );
    const groups = new Map();
    runs.forEach((run, i) => {
      const g = find(i);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(run);
    });
    const clear = new Set();
    const create = [];
    for (const rs of groups.values()) {
      const cells = [...new Set(rs.flatMap((r) => r.cells))].sort((x, y) => x - y);
      const longest = rs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      const hasH = rs.some((r) => r.h), hasV = rs.some((r) => !r.h);
      let sp = SP.NONE;
      if (longest.cells.length >= 5) sp = SP.PRISM;
      else if (hasH && hasV) sp = SP.BOMB;
      else if (longest.cells.length === 4) sp = longest.h ? SP.ROW : SP.COL;
      let at = -1;
      if (sp) {
        const ok = (i) => cells.includes(i) && !this.sp[i];
        at = prefer.find(ok) ?? -1;
        if (at < 0 && sp === SP.BOMB) at = cells.find((i) => ok(i) && rs.filter((r) => r.cells.includes(i)).length >= 2) ?? -1;
        if (at < 0) {
          const mid = longest.cells[Math.floor((longest.cells.length - 1) / 2)];
          at = ok(mid) ? mid : (longest.cells.find(ok) ?? cells.find(ok) ?? -1);
        }
      }
      for (const i of cells) if (i !== at) clear.add(i);
      if (at >= 0) create.push({ cell: at, sp, t: sp === SP.PRISM ? PRISM : this.t[at], from: cells.filter((i) => i !== at) });
    }
    return { clear, create };
  }

  /** El color más común entre las gemas comunes (el que se lleva un prisma que explota sin que lo cambien). */
  commonColor() {
    const n = new Array(this.types).fill(0);
    for (let i = 0; i < N * N; i++) if (this.t[i] >= 0 && this.t[i] < this.types) n[this.t[i]]++;
    let best = 0;
    for (let k = 1; k < this.types; k++) if (n[k] > n[best]) best = k;
    return best;
  }

  /** Los casilleros que borra una especial al explotar. */
  effectCells(i, sp = this.sp[i]) {
    const r = rowOf(i), c = colOf(i);
    const out = [];
    if (sp === SP.ROW) for (let x = 0; x < N; x++) out.push(idx(r, x));
    else if (sp === SP.COL) for (let y = 0; y < N; y++) out.push(idx(y, c));
    else if (sp === SP.BOMB) {
      for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) if (y >= 0 && y < N && x >= 0 && x < N) out.push(idx(y, x));
    } else if (sp === SP.PRISM) {
      const k = this.commonColor();
      for (let j = 0; j < N * N; j++) if (this.t[j] === k) out.push(j);
    }
    return out;
  }

  /**
   * Borra los casilleros de `clear`, hace explotar las especiales que caigan ahí (y las que alcancen esas explosiones),
   * rompe el hielo y suma los puntos (multiplicados por el paso de la cascada). `fired` son especiales que ya se usaron
   * (las de un combo) y `create` las que nacen en este paso (no se borran). Devuelve el evento para animar.
   */
  blast(clear, create = [], chain = 1, fx = [], fired = new Set()) {
    const protect = new Set(create.map((c) => c.cell));
    const queue = [...clear].filter((i) => this.sp[i] && !fired.has(i) && !protect.has(i));
    while (queue.length) {
      const i = queue.shift();
      if (fired.has(i)) continue;
      fired.add(i);
      const sp = this.sp[i];
      const cells = this.effectCells(i);
      fx.push({ type: sp === SP.ROW ? 'row' : sp === SP.COL ? 'col' : sp === SP.BOMB ? 'bomb' : 'prism', cell: i, cells, color: sp === SP.PRISM ? this.commonColor() : this.t[i] });
      for (const j of cells) {
        if (protect.has(j) || this.t[j] < 0 || clear.has(j)) continue;
        clear.add(j);
        if (this.sp[j] && !fired.has(j)) queue.push(j);
      }
    }
    const cleared = [];
    const ice = [];
    let bonus = 0;
    for (const i of [...clear].sort((x, y) => x - y)) {
      if (this.t[i] < 0 || protect.has(i)) continue;
      if (this.t[i] < this.types) this.collected[this.t[i]]++;
      if (this.ice[i]) {
        this.ice[i]--;
        this.iceBroken++;
        ice.push(i);
      }
      cleared.push({ cell: i, id: this.id[i], t: this.t[i], sp: this.sp[i] });
      if (this.sp[i]) bonus += BONUS_FIRED;
      this.t[i] = -1;
      this.sp[i] = 0;
      this.id[i] = 0;
    }
    for (const c of create) {
      if (this.ice[c.cell]) {
        this.ice[c.cell]--;
        this.iceBroken++;
        ice.push(c.cell);
      }
      this.sp[c.cell] = c.sp;
      this.t[c.cell] = c.t;
      bonus += BONUS_MADE[c.sp] || 0;
      this.made++;
    }
    const gained = (cleared.length * SCORE_GEM + bonus) * chain;
    this.score += gained;
    this.bestChain = Math.max(this.bestChain, chain);
    return { k: 'clear', chain, cleared, created: create.map((c) => ({ cell: c.cell, id: this.id[c.cell], sp: c.sp, t: c.t, from: c.from })), fx, ice, score: gained };
  }

  /** Gravedad: las gemas caen y entran nuevas por arriba (de izquierda a derecha y de abajo hacia arriba). */
  fall() {
    const moves = [];
    const spawns = [];
    for (let c = 0; c < N; c++) {
      let w = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        const i = idx(r, c);
        if (this.t[i] < 0) continue;
        if (r !== w) {
          const j = idx(w, c);
          this.t[j] = this.t[i];
          this.sp[j] = this.sp[i];
          this.id[j] = this.id[i];
          this.t[i] = -1;
          this.sp[i] = 0;
          this.id[i] = 0;
          moves.push({ id: this.id[j], from: i, to: j });
        }
        w--;
      }
      const k = w + 1;
      for (let r = w; r >= 0; r--) {
        const i = idx(r, c);
        this.t[i] = this.rng.int(this.types);
        this.sp[i] = 0;
        this.id[i] = this.nextId++;
        spawns.push({ id: this.id[i], to: i, t: this.t[i], fromRow: r - k });
      }
    }
    return { k: 'fall', moves, spawns };
  }

  /** Cascadas hasta que no quede ninguna combinación; después, si no hay jugadas, mezcla. */
  settle(ev, chain = 1) {
    for (let guard = 0; guard < 200; guard++) {
      const m = this.findMatches();
      if (!m) break;
      ev.push(this.blast(m.clear, m.create, chain++));
      ev.push(this.fall());
    }
    if (!this.hasMove()) ev.push(this.shuffle());
    return ev;
  }

  /** Mezcla las gemas comunes (las especiales se quedan) hasta que no haya combinaciones y sí alguna jugada. */
  shuffle() {
    const cells = [];
    for (let i = 0; i < N * N; i++) if (this.t[i] >= 0 && this.t[i] < this.types && !this.sp[i]) cells.push(i);
    const before = cells.map((i) => ({ t: this.t[i], id: this.id[i] }));
    for (let tries = 0; tries < 200; tries++) {
      const vals = before.slice();
      for (let k = vals.length - 1; k > 0; k--) {
        const j = this.rng.int(k + 1);
        [vals[k], vals[j]] = [vals[j], vals[k]];
      }
      cells.forEach((cell, k) => {
        this.t[cell] = vals[k].t;
        this.id[cell] = vals[k].id;
      });
      if (!this.findMatches() && this.hasMove()) return { k: 'shuffle', map: cells.map((cell) => ({ id: this.id[cell], to: cell })) };
    }
    // muy raro: se rearman los colores de las comunes
    for (const cell of cells) {
      let k;
      let guard = 0;
      do {
        k = this.rng.int(this.types);
        this.t[cell] = k;
        guard++;
      } while (guard < 60 && this.matchAt(cell));
    }
    if (!this.hasMove() && cells.length >= 3) {
      // se fuerza una jugada: dos iguales y una tercera al lado de la fila
      const r = rowOf(cells[0]);
      const row = cells.filter((i) => rowOf(i) === r);
      if (row.length >= 3) {
        this.t[row[0]] = this.t[row[1]] = 0;
        this.t[row[2]] = 1;
      }
    }
    return { k: 'shuffle', map: cells.map((cell) => ({ id: this.id[cell], to: cell, t: this.t[cell] })) };
  }

  /**
   * La jugada: la gema de `a` va a `b` (y la de `b` a `a`). Devuelve null si no vale, o la lista de eventos: el intercambio,
   * cada limpieza (con sus efectos y especiales nuevas), cada caída y la mezcla si hizo falta.
   */
  swap(a, b) {
    if (!this.canSwap(a, b)) return null;
    this.moves++;
    const ev = [{ k: 'swap', a, b, ida: this.id[a], idb: this.id[b] }];
    this.exchange(a, b);
    const ta = this.t[a], tb = this.t[b], sa = this.sp[a], sb = this.sp[b];
    // dos prismas: todo el tablero
    if (ta === PRISM && tb === PRISM) {
      const clear = new Set();
      for (let i = 0; i < N * N; i++) if (this.t[i] >= 0) clear.add(i);
      ev.push(this.blast(clear, [], 1, [{ type: 'prism2', cell: b, cells: [...clear] }], new Set([a, b])));
      ev.push(this.fall());
      return this.settle(ev, 2);
    }
    // un prisma con otra gema
    if (ta === PRISM || tb === PRISM) {
      const P = tb === PRISM ? b : a, Q = P === b ? a : b;
      const color = this.t[Q], sq = this.sp[Q];
      const targets = [];
      for (let i = 0; i < N * N; i++) if (this.t[i] === color) targets.push(i);
      if (sq === SP.ROW || sq === SP.COL || sq === SP.BOMB) {
        // todas las de ese color se vuelven especiales (rayos con dirección al azar, o bombas) y explotan
        const turned = [];
        for (const i of targets) {
          if (this.sp[i]) continue;
          this.sp[i] = sq === SP.BOMB ? SP.BOMB : this.rng.int(2) ? SP.ROW : SP.COL;
          turned.push({ cell: i, id: this.id[i], sp: this.sp[i] });
        }
        ev.push({ k: 'turn', cell: P, color, turned });
      }
      const clear = new Set([P, ...targets]);
      ev.push(this.blast(clear, [], 1, [{ type: 'prism', cell: P, cells: targets, color }], new Set([P])));
      ev.push(this.fall());
      return this.settle(ev, 2);
    }
    // dos especiales (rayos y bombas)
    if (sa && sb) {
      const bombs = (sa === SP.BOMB) + (sb === SP.BOMB);
      const r = rowOf(b), c = colOf(b);
      const clear = new Set([a, b]);
      const fxType = bombs === 2 ? 'bomb2' : bombs === 1 ? 'linebomb' : 'cross';
      const rad = bombs === 2 ? 2 : bombs === 1 ? 1 : 0;
      if (bombs === 2) {
        for (let y = r - 2; y <= r + 2; y++) for (let x = c - 2; x <= c + 2; x++) if (y >= 0 && y < N && x >= 0 && x < N) clear.add(idx(y, x));
      } else {
        for (let d = -rad; d <= rad; d++) {
          if (r + d >= 0 && r + d < N) for (let x = 0; x < N; x++) clear.add(idx(r + d, x));
          if (c + d >= 0 && c + d < N) for (let y = 0; y < N; y++) clear.add(idx(y, c + d));
        }
      }
      ev.push(this.blast(clear, [], 1, [{ type: fxType, cell: b, cells: [...clear], rad }], new Set([a, b])));
      ev.push(this.fall());
      return this.settle(ev, 2);
    }
    // jugada común: las especiales nacen donde se movió la gema
    const m = this.findMatches([b, a]);
    ev.push(this.blast(m.clear, m.create, 1));
    ev.push(this.fall());
    return this.settle(ev, 2);
  }

  /**
   * El final de un nivel ganado con jugadas de sobra: una gema común al azar se vuelve rayo y explota (con sus cascadas).
   * Devuelve los eventos, o null si no queda ninguna gema común.
   */
  bonusLine() {
    const cells = [];
    for (let i = 0; i < N * N; i++) if (this.t[i] >= 0 && this.t[i] < this.types && !this.sp[i]) cells.push(i);
    if (!cells.length) return null;
    const i = cells[this.rng.int(cells.length)];
    this.sp[i] = this.rng.int(2) ? SP.ROW : SP.COL;
    const ev = [{ k: 'turn', cell: i, color: this.t[i], turned: [{ cell: i, id: this.id[i], sp: this.sp[i] }] }];
    ev.push(this.blast(new Set([i]), [], 1));
    ev.push(this.fall());
    return this.settle(ev, 2);
  }
}

// ---------------------------------------------------------------- jugadas como texto (para guardar y validar)
const DIR = { r: 1, l: -1, d: N, u: -N };
/** Una jugada (de `a` a `b`) en dos letras: el casillero y la dirección. */
export function encodeMove(a, b) {
  const d = b - a === 1 ? 'r' : b - a === -1 ? 'l' : b - a === N ? 'd' : 'u';
  return String.fromCharCode(48 + a) + d;
}
export function decodeMoves(str) {
  if (typeof str !== 'string' || str.length % 2) return null;
  const out = [];
  for (let k = 0; k < str.length; k += 2) {
    const a = str.charCodeAt(k) - 48;
    const d = DIR[str[k + 1]];
    if (d === undefined || !(a >= 0 && a < N * N)) return null;
    const b = a + d;
    if (!adjacent(a, b)) return null;
    out.push([a, b]);
  }
  return out;
}
/** Rehace una partida desde la semilla con las jugadas dadas. Devuelve la partida, o null si alguna no valía o sobran. */
export function replay(seed, opts, str, { limit = Infinity } = {}) {
  const moves = decodeMoves(str);
  if (!moves || moves.length > limit) return null;
  const g = new Game(seed, opts);
  for (const [a, b] of moves) if (!g.swap(a, b)) return null;
  return g;
}

// ---------------------------------------------------------------- la compu (pistas y calibración de niveles)
const SPECIAL_VALUE = { [SP.ROW]: 70, [SP.COL]: 70, [SP.BOMB]: 110, [SP.PRISM]: 220 };
/**
 * Elige una jugada probando cada una sobre una copia a ciegas (sin espiar lo que va a caer). `want` pondera lo que importa
 * en un nivel: { colors: { k: peso por gema de ese color }, ice: peso por capa de hielo rota }. Devuelve [a, b] o null.
 */
export function bestMove(g, want = {}) {
  const moves = g.validMoves();
  let best = null;
  let bestV = -Infinity;
  for (const [a, b] of moves) {
    for (const [x, y] of [[a, b], [b, a]]) {
      const h = g.clone({ blind: true });
      const before = h.collected.slice();
      const ice0 = h.iceBroken;
      const ev = h.swap(x, y);
      if (!ev) continue;
      let v = h.score - g.score;
      for (const e of ev) if (e.k === 'clear') for (const c of e.created) v += SPECIAL_VALUE[c.sp] || 0;
      if (want.colors) for (const k in want.colors) v += (h.collected[k] - before[k]) * want.colors[k];
      if (want.ice) v += (h.iceBroken - ice0) * want.ice;
      // las especiales que quedan en el tablero valen algo; las jugadas cerca del fondo dejan más cascadas
      v += rowOf(y) * 0.5;
      if (v > bestV) {
        bestV = v;
        best = [x, y];
      }
    }
  }
  return best;
}
