/**
 * Ajedrez — reglas completas (cliente, IA y servidor usan este mismo archivo).
 *
 * Casillas: sq = columna + 8 * fila, con a1 = 0, h1 = 7, a8 = 56.
 * Piezas: tipo | color << 3  (blancas 1..6, negras 9..14, vacío 0).
 * Jugadas: enteros  desde | hasta << 6 | promoción << 12 | banderas << 15.
 */
export const WHITE = 0;
export const BLACK = 1;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const F_CAPTURE = 1;
export const F_EP = 2;
export const F_CASTLE = 4;
export const F_DOUBLE = 8;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const typeOf = (p) => p & 7;
export const colorOf = (p) => p >> 3;
export const makePiece = (type, color) => type | (color << 3);
export const fileOf = (sq) => sq & 7;
export const rankOf = (sq) => sq >> 3;
export const sqName = (sq) => 'abcdefgh'[sq & 7] + ((sq >> 3) + 1);
export const sqFromName = (s) => 'abcdefgh'.indexOf(s[0]) + 8 * (Number(s[1]) - 1);

export const mFrom = (m) => m & 63;
export const mTo = (m) => (m >> 6) & 63;
export const mPromo = (m) => (m >> 12) & 7;
export const mFlags = (m) => m >> 15;
const encode = (from, to, promo = 0, flags = 0) => from | (to << 6) | (promo << 12) | (flags << 15);

const LETTERS = ' pnbrqk';

// ---------------------------------------------------------------- tablas precalculadas
const inside = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const jumps = (deltas) =>
  Array.from({ length: 64 }, (_, sq) =>
    deltas.map(([df, dr]) => [fileOf(sq) + df, rankOf(sq) + dr]).filter(([f, r]) => inside(f, r)).map(([f, r]) => f + 8 * r),
  );
export const KNIGHT_JUMPS = jumps([[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]);
export const KING_STEPS = jumps([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]);
// rayos: 0-3 rectos (torre), 4-7 diagonales (alfil)
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
export const RAYS = DIRS.map(([df, dr]) =>
  Array.from({ length: 64 }, (_, sq) => {
    const out = [];
    let f = fileOf(sq) + df;
    let r = rankOf(sq) + dr;
    while (inside(f, r)) {
      out.push(f + 8 * r);
      f += df;
      r += dr;
    }
    return out;
  }),
);

// derechos de enroque: 1 = blanco corto, 2 = blanco largo, 4 = negro corto, 8 = negro largo
const CASTLE_MASK = new Uint8Array(64).fill(15);
CASTLE_MASK[0] = 13;
CASTLE_MASK[4] = 12;
CASTLE_MASK[7] = 14;
CASTLE_MASK[56] = 7;
CASTLE_MASK[60] = 3;
CASTLE_MASK[63] = 11;

// ---------------------------------------------------------------- zobrist (determinista)
let seed = 0x9e3779b9;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
};
const Z_PIECE = [new Uint32Array(15 * 64), new Uint32Array(15 * 64)];
for (let i = 0; i < 15 * 64; i++) {
  Z_PIECE[0][i] = rnd();
  Z_PIECE[1][i] = rnd();
}
const Z_CASTLE = [Array.from({ length: 16 }, rnd), Array.from({ length: 16 }, rnd)];
const Z_EP = [Array.from({ length: 8 }, rnd), Array.from({ length: 8 }, rnd)];
const Z_SIDE = [rnd(), rnd()];

// ---------------------------------------------------------------- posición
export class Position {
  constructor(fen = START_FEN) {
    this.board = new Int8Array(64);
    this.stack = [];
    this.keys = [];
    this.load(fen);
  }

  load(fen) {
    const [placement, side, castle, ep, half, full] = fen.trim().split(/\s+/);
    this.board.fill(0);
    let r = 7;
    let f = 0;
    for (const ch of placement) {
      if (ch === '/') {
        r--;
        f = 0;
      } else if (/\d/.test(ch)) f += Number(ch);
      else {
        const type = LETTERS.indexOf(ch.toLowerCase());
        if (type < 1) throw new Error('FEN inválido');
        this.board[f + 8 * r] = makePiece(type, ch === ch.toLowerCase() ? BLACK : WHITE);
        f++;
      }
    }
    this.turn = side === 'b' ? BLACK : WHITE;
    this.castle = 0;
    if (castle && castle !== '-') {
      if (castle.includes('K')) this.castle |= 1;
      if (castle.includes('Q')) this.castle |= 2;
      if (castle.includes('k')) this.castle |= 4;
      if (castle.includes('q')) this.castle |= 8;
    }
    this.ep = ep && ep !== '-' ? sqFromName(ep) : -1;
    this.half = Number(half) || 0;
    this.full = Number(full) || 1;
    this.kings = [this.board.indexOf(makePiece(KING, WHITE)), this.board.indexOf(makePiece(KING, BLACK))];
    this.stack.length = 0;
    this.rehash();
    this.keys = [this.key()];
  }

  rehash() {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq];
      if (p) {
        lo ^= Z_PIECE[0][p * 64 + sq];
        hi ^= Z_PIECE[1][p * 64 + sq];
      }
    }
    lo ^= Z_CASTLE[0][this.castle];
    hi ^= Z_CASTLE[1][this.castle];
    if (this.ep >= 0) {
      lo ^= Z_EP[0][this.ep & 7];
      hi ^= Z_EP[1][this.ep & 7];
    }
    if (this.turn) {
      lo ^= Z_SIDE[0];
      hi ^= Z_SIDE[1];
    }
    this.lo = lo >>> 0;
    this.hi = hi >>> 0;
  }

  /** Clave numérica de la posición (53 bits) para repeticiones y tabla de transposición. */
  key() {
    return (this.hi & 0x1fffff) * 4294967296 + this.lo;
  }

  clone() {
    const p = Object.create(Position.prototype);
    p.board = this.board.slice();
    p.turn = this.turn;
    p.castle = this.castle;
    p.ep = this.ep;
    p.half = this.half;
    p.full = this.full;
    p.kings = this.kings.slice();
    p.lo = this.lo;
    p.hi = this.hi;
    p.stack = [];
    p.keys = this.keys.slice();
    return p;
  }

  fen() {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[f + 8 * r];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) s += empty;
        empty = 0;
        const ch = LETTERS[typeOf(p)];
        s += colorOf(p) === WHITE ? ch.toUpperCase() : ch;
      }
      if (empty) s += empty;
      if (r) s += '/';
    }
    let c = '';
    if (this.castle & 1) c += 'K';
    if (this.castle & 2) c += 'Q';
    if (this.castle & 4) c += 'k';
    if (this.castle & 8) c += 'q';
    return `${s} ${this.turn ? 'b' : 'w'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }

  // ------------------------------------------------------------ ataques
  /** ¿La casilla sq está atacada por el color `by`? */
  attacked(sq, by) {
    const b = this.board;
    // peones
    const f = sq & 7;
    if (by === WHITE) {
      if (f > 0 && sq - 9 >= 0 && b[sq - 9] === PAWN) return true;
      if (f < 7 && sq - 7 >= 0 && b[sq - 7] === PAWN) return true;
    } else {
      if (f > 0 && sq + 7 < 64 && b[sq + 7] === 9) return true;
      if (f < 7 && sq + 9 < 64 && b[sq + 9] === 9) return true;
    }
    const knight = makePiece(KNIGHT, by);
    for (const t of KNIGHT_JUMPS[sq]) if (b[t] === knight) return true;
    const king = makePiece(KING, by);
    for (const t of KING_STEPS[sq]) if (b[t] === king) return true;
    const queen = makePiece(QUEEN, by);
    const rook = makePiece(ROOK, by);
    const bishop = makePiece(BISHOP, by);
    for (let d = 0; d < 8; d++) {
      const slider = d < 4 ? rook : bishop;
      for (const t of RAYS[d][sq]) {
        const p = b[t];
        if (!p) continue;
        if (p === slider || p === queen) return true;
        break;
      }
    }
    return false;
  }

  inCheck(color = this.turn) {
    return this.attacked(this.kings[color], color ^ 1);
  }

  // ------------------------------------------------------------ generación
  /** Jugadas pseudo-legales (pueden dejar al rey en jaque). Con `captures` solo capturas y coronaciones. */
  pseudo(captures = false, out = []) {
    const b = this.board;
    const us = this.turn;
    const them = us ^ 1;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p || colorOf(p) !== us) continue;
      const type = typeOf(p);
      if (type === PAWN) {
        const dir = us === WHITE ? 8 : -8;
        const startRank = us === WHITE ? 1 : 6;
        const promoRank = us === WHITE ? 6 : 1;
        const r = sq >> 3;
        const f = sq & 7;
        const one = sq + dir;
        if (!b[one]) {
          if (r === promoRank) for (let pr = QUEEN; pr >= KNIGHT; pr--) out.push(encode(sq, one, pr));
          else if (!captures) {
            out.push(encode(sq, one));
            if (r === startRank && !b[one + dir]) out.push(encode(sq, one + dir, 0, F_DOUBLE));
          }
        }
        for (const df of [-1, 1]) {
          if (f + df < 0 || f + df > 7) continue;
          const t = one + df;
          const q = b[t];
          if (q && colorOf(q) === them) {
            if (r === promoRank) for (let pr = QUEEN; pr >= KNIGHT; pr--) out.push(encode(sq, t, pr, F_CAPTURE));
            else out.push(encode(sq, t, 0, F_CAPTURE));
          } else if (t === this.ep) out.push(encode(sq, t, 0, F_CAPTURE | F_EP));
        }
      } else if (type === KNIGHT || type === KING) {
        for (const t of type === KNIGHT ? KNIGHT_JUMPS[sq] : KING_STEPS[sq]) {
          const q = b[t];
          if (!q) {
            if (!captures) out.push(encode(sq, t));
          } else if (colorOf(q) === them) out.push(encode(sq, t, 0, F_CAPTURE));
        }
        if (type === KING && !captures) this.castles(sq, out);
      } else {
        const d0 = type === BISHOP ? 4 : 0;
        const d1 = type === ROOK ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          for (const t of RAYS[d][sq]) {
            const q = b[t];
            if (!q) {
              if (!captures) out.push(encode(sq, t));
              continue;
            }
            if (colorOf(q) === them) out.push(encode(sq, t, 0, F_CAPTURE));
            break;
          }
        }
      }
    }
    return out;
  }

  castles(sq, out) {
    const b = this.board;
    const us = this.turn;
    const them = us ^ 1;
    const home = us === WHITE ? 4 : 60;
    if (sq !== home) return;
    const rook = makePiece(ROOK, us);
    const kBit = us === WHITE ? 1 : 4;
    const qBit = us === WHITE ? 2 : 8;
    if (this.castle & kBit && !b[home + 1] && !b[home + 2] && b[home + 3] === rook) {
      if (!this.attacked(home, them) && !this.attacked(home + 1, them) && !this.attacked(home + 2, them)) out.push(encode(home, home + 2, 0, F_CASTLE));
    }
    if (this.castle & qBit && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rook) {
      if (!this.attacked(home, them) && !this.attacked(home - 1, them) && !this.attacked(home - 2, them)) out.push(encode(home, home - 2, 0, F_CASTLE));
    }
  }

  /** Jugadas legales. */
  moves() {
    const list = this.pseudo();
    const out = [];
    const us = this.turn;
    for (const m of list) {
      this.make(m);
      if (!this.attacked(this.kings[us], us ^ 1)) out.push(m);
      this.unmake();
    }
    return out;
  }

  // ------------------------------------------------------------ hacer / deshacer
  put(sq, p) {
    const old = this.board[sq];
    if (old) {
      this.lo ^= Z_PIECE[0][old * 64 + sq];
      this.hi ^= Z_PIECE[1][old * 64 + sq];
    }
    this.board[sq] = p;
    if (p) {
      this.lo ^= Z_PIECE[0][p * 64 + sq];
      this.hi ^= Z_PIECE[1][p * 64 + sq];
    }
  }

  make(m) {
    const from = m & 63;
    const to = (m >> 6) & 63;
    const promo = (m >> 12) & 7;
    const flags = m >> 15;
    const b = this.board;
    const p = b[from];
    const us = this.turn;
    let captured = b[to];
    let capSq = to;
    if (flags & F_EP) {
      capSq = us === WHITE ? to - 8 : to + 8;
      captured = b[capSq];
    }
    this.stack.push({ m, captured, capSq, castle: this.castle, ep: this.ep, half: this.half, lo: this.lo, hi: this.hi });

    // quitar estado viejo del hash
    this.lo ^= Z_CASTLE[0][this.castle];
    this.hi ^= Z_CASTLE[1][this.castle];
    if (this.ep >= 0) {
      this.lo ^= Z_EP[0][this.ep & 7];
      this.hi ^= Z_EP[1][this.ep & 7];
    }

    if (flags & F_EP) this.put(capSq, 0);
    this.put(from, 0);
    this.put(to, promo ? makePiece(promo, us) : p);
    if (flags & F_CASTLE) {
      const rookFrom = to > from ? to + 1 : to - 2;
      const rookTo = to > from ? to - 1 : to + 1;
      const rook = b[rookFrom];
      this.put(rookFrom, 0);
      this.put(rookTo, rook);
    }
    if (typeOf(p) === KING) this.kings[us] = to;

    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flags & F_DOUBLE ? (from + to) >> 1 : -1;
    this.half = typeOf(p) === PAWN || captured ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.turn = us ^ 1;

    this.lo ^= Z_CASTLE[0][this.castle] ^ Z_SIDE[0];
    this.hi ^= Z_CASTLE[1][this.castle] ^ Z_SIDE[1];
    if (this.ep >= 0) {
      this.lo ^= Z_EP[0][this.ep & 7];
      this.hi ^= Z_EP[1][this.ep & 7];
    }
    this.lo >>>= 0;
    this.hi >>>= 0;
    this.keys.push(this.key());
  }

  unmake() {
    const s = this.stack.pop();
    const { m } = s;
    const from = m & 63;
    const to = (m >> 6) & 63;
    const promo = (m >> 12) & 7;
    const flags = m >> 15;
    const b = this.board;
    this.turn ^= 1;
    const us = this.turn;
    const moved = promo ? makePiece(PAWN, us) : b[to];
    b[from] = moved;
    b[to] = 0;
    if (s.captured) b[s.capSq] = s.captured;
    if (flags & F_CASTLE) {
      const rookFrom = to > from ? to + 1 : to - 2;
      const rookTo = to > from ? to - 1 : to + 1;
      b[rookFrom] = b[rookTo];
      b[rookTo] = 0;
    }
    if (typeOf(moved) === KING) this.kings[us] = from;
    this.castle = s.castle;
    this.ep = s.ep;
    this.half = s.half;
    if (us === BLACK) this.full--;
    this.lo = s.lo;
    this.hi = s.hi;
    this.keys.pop();
    return m;
  }

  /** "Jugada nula" (para la búsqueda de la IA). */
  makeNull() {
    this.stack.push({ m: -1, ep: this.ep, lo: this.lo, hi: this.hi, half: this.half });
    if (this.ep >= 0) {
      this.lo ^= Z_EP[0][this.ep & 7];
      this.hi ^= Z_EP[1][this.ep & 7];
    }
    this.ep = -1;
    this.turn ^= 1;
    this.lo = (this.lo ^ Z_SIDE[0]) >>> 0;
    this.hi = (this.hi ^ Z_SIDE[1]) >>> 0;
    this.half++;
    this.keys.push(this.key());
  }

  unmakeNull() {
    const s = this.stack.pop();
    this.turn ^= 1;
    this.ep = s.ep;
    this.lo = s.lo;
    this.hi = s.hi;
    this.half = s.half;
    this.keys.pop();
  }

  // ------------------------------------------------------------ estado
  /** Veces que la posición actual ya apareció (desde la última jugada irreversible). */
  repetitions() {
    const k = this.keys[this.keys.length - 1];
    let n = 0;
    const stop = Math.max(0, this.keys.length - 1 - this.half);
    for (let i = this.keys.length - 1; i >= stop; i -= 2) if (this.keys[i] === k) n++;
    return n;
  }

  /** ¿Puede este color dar mate con lo que tiene? (para tiempo agotado y material insuficiente) */
  canMate(color) {
    let minors = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq];
      if (!p || colorOf(p) !== color) continue;
      const t = typeOf(p);
      if (t === PAWN || t === ROOK || t === QUEEN) return true;
      if (t === KNIGHT || t === BISHOP) minors++;
    }
    return minors >= 2;
  }

  insufficient() {
    const pieces = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq];
      if (!p || typeOf(p) === KING) continue;
      const t = typeOf(p);
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      pieces.push({ t, sq });
    }
    if (pieces.length <= 1) return true;
    // solo alfiles, todos en casillas del mismo color
    if (pieces.every((x) => x.t === BISHOP)) {
      const shade = (sq) => ((sq & 7) + (sq >> 3)) & 1;
      return pieces.every((x) => shade(x.sq) === shade(pieces[0].sq));
    }
    return false;
  }

  /**
   * Estado de la partida: { over, winner (0/1/null), reason }.
   * Razones: mate, stalemate, material, fifty, repetition.
   */
  status(legal = this.moves()) {
    if (!legal.length) {
      if (this.inCheck()) return { over: true, winner: this.turn ^ 1, reason: 'mate' };
      return { over: true, winner: null, reason: 'stalemate' };
    }
    if (this.insufficient()) return { over: true, winner: null, reason: 'material' };
    if (this.half >= 100) return { over: true, winner: null, reason: 'fifty' };
    if (this.repetitions() >= 3) return { over: true, winner: null, reason: 'repetition' };
    return { over: false, winner: null, reason: null };
  }

  // ------------------------------------------------------------ notación
  /** Notación algebraica estándar (SAN) de una jugada legal, antes de hacerla. */
  san(m, legal = this.moves()) {
    const from = mFrom(m);
    const to = mTo(m);
    const flags = mFlags(m);
    const p = this.board[from];
    const type = typeOf(p);
    let s;
    if (flags & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
    else if (type === PAWN) {
      s = flags & F_CAPTURE ? `${'abcdefgh'[from & 7]}x${sqName(to)}` : sqName(to);
      if (mPromo(m)) s += '=' + LETTERS[mPromo(m)].toUpperCase();
    } else {
      s = LETTERS[type].toUpperCase();
      const rivals = legal.filter((o) => o !== m && mTo(o) === to && this.board[mFrom(o)] === p);
      if (rivals.length) {
        const sameFile = rivals.some((o) => (mFrom(o) & 7) === (from & 7));
        const sameRank = rivals.some((o) => mFrom(o) >> 3 === from >> 3);
        if (!sameFile) s += 'abcdefgh'[from & 7];
        else if (!sameRank) s += (from >> 3) + 1;
        else s += sqName(from);
      }
      if (flags & F_CAPTURE) s += 'x';
      s += sqName(to);
    }
    this.make(m);
    if (this.inCheck()) s += this.moves().length ? '+' : '#';
    this.unmake();
    return s;
  }

  /** Busca una jugada legal a partir de "e2e4" / "e7e8q". */
  fromUci(str, legal = this.moves()) {
    if (typeof str !== 'string' || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(str)) return 0;
    const from = sqFromName(str.slice(0, 2));
    const to = sqFromName(str.slice(2, 4));
    const promo = str[4] ? LETTERS.indexOf(str[4]) : 0;
    return legal.find((m) => mFrom(m) === from && mTo(m) === to && mPromo(m) === promo) || 0;
  }
}

export const toUci = (m) => sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? LETTERS[mPromo(m)] : '');

/** Recorre una lista de jugadas UCI desde el inicio. Devuelve null si alguna es ilegal. */
export function replay(uciMoves, fen = START_FEN) {
  const pos = new Position(fen);
  const sans = [];
  for (const u of uciMoves) {
    const legal = pos.moves();
    const m = pos.fromUci(u, legal);
    if (!m) return null;
    sans.push(pos.san(m, legal));
    pos.make(m);
  }
  return { pos, sans };
}

/** Cuenta nodos (para verificar la generación de jugadas). */
export function perft(pos, depth) {
  if (depth === 0) return 1;
  let n = 0;
  const us = pos.turn;
  for (const m of pos.pseudo()) {
    pos.make(m);
    if (!pos.attacked(pos.kings[us], us ^ 1)) n += depth === 1 ? 1 : perft(pos, depth - 1);
    pos.unmake();
  }
  return n;
}
