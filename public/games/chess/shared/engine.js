/**
 * Ajedrez — motor de la computadora: alfa-beta con profundización iterativa, búsqueda de
 * quietud, tabla de transposición, jugada nula, killers e historia. La evaluación es propia:
 * material, tablas de posición (medio juego / final), pareja de alfiles, estructura de peones,
 * torres en columnas abiertas y empuje del rey rival al borde en finales ganados.
 */
import { Position, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, typeOf, colorOf, mFrom, mTo, mPromo, mFlags, F_CAPTURE, toUci } from './rules.js';

const VAL = [0, 100, 315, 330, 500, 920, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const MATE = 30000;
const INF = 32000;

// Tablas de posición (vistas desde las blancas, fila 8 arriba).
// prettier-ignore
const PST_MG = {
  [PAWN]: [
      0,  0,  0,  0,  0,  0,  0,  0,
     55, 58, 58, 60, 60, 58, 58, 55,
     14, 16, 22, 30, 30, 22, 16, 14,
      6,  6, 12, 24, 24, 12,  6,  6,
      0,  0,  6, 20, 20,  4,  0,  0,
      4, -3, -8,  2,  2, -8, -3,  4,
      4,  8,  8,-18,-18,  8,  8,  4,
      0,  0,  0,  0,  0,  0,  0,  0],
  [KNIGHT]: [
    -50,-38,-30,-28,-28,-30,-38,-50,
    -36,-18,  0,  4,  4,  0,-18,-36,
    -28,  4, 12, 16, 16, 12,  4,-28,
    -26,  6, 16, 22, 22, 16,  6,-26,
    -26,  2, 14, 20, 20, 14,  2,-26,
    -28,  4, 10, 12, 12, 10,  4,-28,
    -36,-18,  0,  4,  4,  0,-18,-36,
    -48,-30,-26,-26,-26,-26,-30,-48],
  [BISHOP]: [
    -18,-10,-10,-10,-10,-10,-10,-18,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  6, 10, 10,  6,  0,-10,
    -10,  6,  6, 10, 10,  6,  6,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  6,  0,  0,  0,  0,  6,-10,
    -18,-10,-12,-10,-10,-12,-10,-18],
  [ROOK]: [
      0,  0,  0,  0,  0,  0,  0,  0,
      6, 12, 12, 12, 12, 12, 12,  6,
     -4,  0,  0,  0,  0,  0,  0, -4,
     -4,  0,  0,  0,  0,  0,  0, -4,
     -4,  0,  0,  0,  0,  0,  0, -4,
     -4,  0,  0,  0,  0,  0,  0, -4,
     -4,  0,  0,  0,  0,  0,  0, -4,
      0,  0,  2,  6,  6,  4,  0,  0],
  [QUEEN]: [
    -18,-10,-10, -4, -4,-10,-10,-18,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  4,  4,  4,  4,  0,-10,
     -4,  0,  4,  4,  4,  4,  0, -4,
     -2,  0,  4,  4,  4,  4,  0, -4,
    -10,  4,  4,  4,  4,  4,  0,-10,
    -10,  0,  4,  0,  0,  0,  0,-10,
    -18,-10,-10, -4, -4,-10,-10,-18],
  [KING]: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-24,-24,-20,-20,-10,
     14, 14, -6,-12,-12, -6, 14, 14,
     18, 30, 10, -8,  0,  8, 32, 20],
};
// prettier-ignore
const PST_EG = {
  [PAWN]: [
      0,  0,  0,  0,  0,  0,  0,  0,
     95, 92, 90, 88, 88, 90, 92, 95,
     58, 56, 52, 50, 50, 52, 56, 58,
     32, 30, 26, 24, 24, 26, 30, 32,
     16, 14, 12, 10, 10, 12, 14, 16,
      6,  6,  4,  4,  4,  4,  6,  6,
      2,  2,  2,  2,  2,  2,  2,  2,
      0,  0,  0,  0,  0,  0,  0,  0],
  [KNIGHT]: null,
  [BISHOP]: null,
  [ROOK]: [
      4,  4,  4,  4,  4,  4,  4,  4,
      8,  8,  8,  8,  8,  8,  8,  8,
      2,  2,  2,  2,  2,  2,  2,  2,
      0,  0,  0,  0,  0,  0,  0,  0,
      0,  0,  0,  0,  0,  0,  0,  0,
     -2, -2, -2, -2, -2, -2, -2, -2,
     -4, -4, -4, -4, -4, -4, -4, -4,
     -4, -4, -2,  0,  0, -2, -4, -4],
  [QUEEN]: null,
  [KING]: [
    -50,-36,-26,-20,-20,-26,-36,-50,
    -30,-16, -4,  2,  2, -4,-16,-30,
    -26, -4, 18, 26, 26, 18, -4,-26,
    -24, -2, 26, 34, 34, 26, -2,-24,
    -24, -2, 26, 34, 34, 26, -2,-24,
    -26, -4, 18, 26, 26, 18, -4,-26,
    -32,-20,  0,  0,  0,  0,-20,-32,
    -50,-36,-30,-26,-26,-30,-36,-50],
};

// índice [pieza (tipo|color<<3)][casilla] → valor, ya con material incluido
const MG = Array.from({ length: 15 }, () => new Int16Array(64));
const EG = Array.from({ length: 15 }, () => new Int16Array(64));
for (let type = PAWN; type <= KING; type++) {
  for (let sq = 0; sq < 64; sq++) {
    const f = sq & 7;
    const r = sq >> 3;
    const wIdx = (7 - r) * 8 + f; // blancas: la fila 8 es la primera de la tabla
    const bIdx = r * 8 + f; // negras: espejo
    const mg = PST_MG[type];
    const eg = PST_EG[type] || mg;
    MG[type][sq] = VAL[type] + mg[wIdx];
    EG[type][sq] = VAL[type] + eg[wIdx];
    MG[type | 8][sq] = VAL[type] + mg[bIdx];
    EG[type | 8][sq] = VAL[type] + eg[bIdx];
  }
}

const centerDist = (sq) => Math.max(3 - (sq & 7), (sq & 7) - 4) + Math.max(3 - (sq >> 3), (sq >> 3) - 4);
const kingDist = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)));

/** Evaluación estática desde el punto de vista del que mueve. */
export function evaluate(pos) {
  const b = pos.board;
  let mg = 0;
  let eg = 0;
  let phase = 0;
  const bishops = [0, 0];
  const pawnFiles = [new Int8Array(8), new Int8Array(8)];
  const rooks = [];
  const mat = [0, 0];
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p) continue;
    const c = p >> 3;
    const t = p & 7;
    const s = c === WHITE ? 1 : -1;
    mg += s * MG[p][sq];
    eg += s * EG[p][sq];
    phase += PHASE[t];
    if (t !== KING) mat[c] += VAL[t];
    if (t === BISHOP) bishops[c]++;
    else if (t === PAWN) pawnFiles[c][sq & 7]++;
    else if (t === ROOK) rooks.push(sq, c);
  }
  // pareja de alfiles
  if (bishops[0] >= 2) {
    mg += 28;
    eg += 44;
  }
  if (bishops[1] >= 2) {
    mg -= 28;
    eg -= 44;
  }
  // estructura de peones: doblados, aislados y pasados
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if ((p & 7) !== PAWN) continue;
    const c = p >> 3;
    const s = c === WHITE ? 1 : -1;
    const f = sq & 7;
    const r = sq >> 3;
    const own = pawnFiles[c];
    if (own[f] > 1) {
      mg -= s * 8;
      eg -= s * 16;
    }
    if ((f === 0 || !own[f - 1]) && (f === 7 || !own[f + 1])) {
      mg -= s * 10;
      eg -= s * 12;
    }
    // pasado: ningún peón rival delante en su columna ni en las vecinas
    let passed = true;
    for (let df = -1; df <= 1 && passed; df++) {
      const ff = f + df;
      if (ff < 0 || ff > 7) continue;
      if (c === WHITE) {
        for (let rr = r + 1; rr < 7; rr++) if (b[ff + 8 * rr] === (PAWN | 8)) passed = false;
      } else {
        for (let rr = r - 1; rr > 0; rr--) if (b[ff + 8 * rr] === PAWN) passed = false;
      }
    }
    if (passed) {
      const adv = c === WHITE ? r : 7 - r;
      mg += s * adv * 4;
      eg += s * adv * adv * 3;
    }
  }
  // torres en columnas abiertas o semiabiertas
  for (let i = 0; i < rooks.length; i += 2) {
    const f = rooks[i] & 7;
    const c = rooks[i + 1];
    const s = c === WHITE ? 1 : -1;
    if (!pawnFiles[c][f]) {
      const open = !pawnFiles[c ^ 1][f];
      mg += s * (open ? 18 : 9);
      eg += s * (open ? 10 : 5);
    }
  }
  phase = Math.min(24, phase);
  let score = Math.round((mg * phase + eg * (24 - phase)) / 24);
  // final ganado: llevar al rey rival al borde y acercar el propio
  const diff = mat[0] - mat[1];
  if (phase < 10 && Math.abs(diff) >= 300) {
    const winner = diff > 0 ? WHITE : BLACK;
    const loserK = pos.kings[winner ^ 1];
    const bonus = centerDist(loserK) * 12 + (7 - kingDist(pos.kings[0], pos.kings[1])) * 6;
    score += winner === WHITE ? bonus : -bonus;
  }
  return (pos.turn === WHITE ? score : -score) + 12; // +12: ventaja de mover
}

// ---------------------------------------------------------------- búsqueda
const TT_SIZE = 1 << 20;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

export class Engine {
  constructor() {
    this.ttKey = new Float64Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int16Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.killers = Array.from({ length: 128 }, () => [0, 0]);
    this.history = new Int32Array(64 * 64);
  }

  /**
   * Busca la mejor jugada.
   * @param {Position} pos
   * @param {object} o  { time (ms), depth (máx), noise (cp al azar por jugada en la raíz), blunder (0..1) }
   */
  think(pos, { time = 1000, depth = 64, noise = 0, blunder = 0, rng = Math.random } = {}) {
    const legal = pos.moves();
    if (!legal.length) return { move: 0, score: 0, depth: 0 };
    if (legal.length === 1) return { move: legal[0], score: 0, depth: 0, uci: toUci(legal[0]) };
    this.nodes = 0;
    this.stopAt = performance.now() + time;
    this.stopped = false;
    this.killers.forEach((k) => (k[0] = k[1] = 0));
    this.history.fill(0);
    this.rootBest = 0;
    if (blunder && rng() < blunder) {
      const m = legal[Math.floor(rng() * legal.length)];
      return { move: m, score: 0, depth: 0, uci: toUci(m) };
    }
    let best = legal[0];
    let bestScore = 0;
    let done = 0;
    if (noise > 0) {
      // niveles bajos: cada jugada de la raíz con ventana completa y ruido
      for (let d = 1; d <= depth; d++) {
        const scored = [];
        for (const m of legal) {
          pos.make(m);
          const v = -this.search(pos, d - 1, -INF, INF, 1, true);
          pos.unmake();
          if (this.stopped) break;
          scored.push([m, v + (rng() * 2 - 1) * noise]);
        }
        if (this.stopped && scored.length < legal.length) break;
        scored.sort((a, b) => b[1] - a[1]);
        best = scored[0][0];
        bestScore = Math.round(scored[0][1]);
        done = d;
        if (performance.now() > this.stopAt) break;
      }
      return { move: best, score: bestScore, depth: done, uci: toUci(best) };
    }
    for (let d = 1; d <= depth; d++) {
      let alpha = -INF;
      let beta = INF;
      if (d >= 4) {
        alpha = bestScore - 40;
        beta = bestScore + 40;
      }
      let v;
      for (;;) {
        v = this.root(pos, legal, d, alpha, beta);
        if (this.stopped) break;
        if (v <= alpha) alpha = -INF;
        else if (v >= beta) beta = INF;
        else break;
      }
      if (this.stopped) break;
      best = this.rootBest;
      bestScore = v;
      done = d;
      if (Math.abs(v) > MATE - 100) break; // mate encontrado
      // si ya se usó más de la mitad del tiempo, otra iteración no va a terminar
      if (performance.now() - (this.stopAt - time) > time * 0.55) break;
    }
    return { move: best, score: bestScore, depth: done, uci: toUci(best), nodes: this.nodes };
  }

  root(pos, legal, depth, alpha, beta) {
    const ttIdx = pos.lo & TT_MASK;
    const hint = this.ttKey[ttIdx] === pos.key() ? this.ttMove[ttIdx] : this.rootBest || 0;
    const moves = this.order(pos, legal.slice(), hint, 0);
    let best = -INF;
    let bestMove = moves[0];
    const a0 = alpha;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      pos.make(m);
      let v;
      if (i === 0) v = -this.search(pos, depth - 1, -beta, -alpha, 1, true);
      else {
        v = -this.search(pos, depth - 1, -alpha - 1, -alpha, 1, true);
        if (v > alpha && v < beta) v = -this.search(pos, depth - 1, -beta, -alpha, 1, true);
      }
      pos.unmake();
      if (this.stopped) return best;
      if (v > best) {
        best = v;
        bestMove = m;
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    this.rootBest = bestMove;
    this.store(pos, depth, best, best <= a0 ? UPPER : best >= beta ? LOWER : EXACT, bestMove, 0);
    return best;
  }

  store(pos, depth, score, flag, move, ply) {
    const i = pos.lo & TT_MASK;
    // los mates se guardan relativos a esta posición (no a la raíz)
    if (score > MATE - 200) score += ply;
    else if (score < -MATE + 200) score -= ply;
    if (this.ttKey[i] === pos.key() && this.ttDepth[i] > depth && flag !== EXACT) return;
    this.ttKey[i] = pos.key();
    this.ttDepth[i] = depth;
    this.ttScore[i] = score;
    this.ttFlag[i] = flag;
    this.ttMove[i] = move;
  }

  order(pos, moves, hint, ply) {
    const b = pos.board;
    const k = this.killers[ply] || [0, 0];
    const scores = new Int32Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      let s;
      if (m === hint) s = 1e9;
      else if (mFlags(m) & F_CAPTURE) {
        const victim = b[mTo(m)] & 7 || PAWN;
        s = 1e8 + VAL[victim] * 10 - VAL[b[mFrom(m)] & 7] / 10;
      } else if (mPromo(m)) s = 9e7 + mPromo(m);
      else if (m === k[0]) s = 8e7;
      else if (m === k[1]) s = 7e7;
      else s = this.history[(mFrom(m) << 6) | mTo(m)];
      scores[i] = s;
    }
    // ordenamiento por inserción (listas cortas)
    for (let i = 1; i < moves.length; i++) {
      const m = moves[i];
      const s = scores[i];
      let j = i - 1;
      while (j >= 0 && scores[j] < s) {
        moves[j + 1] = moves[j];
        scores[j + 1] = scores[j];
        j--;
      }
      moves[j + 1] = m;
      scores[j + 1] = s;
    }
    return moves;
  }

  search(pos, depth, alpha, beta, ply, allowNull) {
    if ((++this.nodes & 2047) === 0 && performance.now() > this.stopAt) this.stopped = true;
    if (this.stopped) return 0;
    if (ply && (pos.half >= 100 || pos.repetitions() >= 2)) return 0;

    const us = pos.turn;
    const inCheck = pos.attacked(pos.kings[us], us ^ 1);
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(pos, alpha, beta, ply);

    // tabla de transposición
    const key = pos.key();
    const ti = pos.lo & TT_MASK;
    let hint = 0;
    if (this.ttKey[ti] === key) {
      hint = this.ttMove[ti];
      if (this.ttDepth[ti] >= depth && beta - alpha === 1) {
        let s = this.ttScore[ti];
        if (s > MATE - 200) s -= ply;
        else if (s < -MATE + 200) s += ply;
        const f = this.ttFlag[ti];
        if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
      }
    }

    // jugada nula
    if (allowNull && !inCheck && depth >= 3 && beta - alpha === 1 && this.hasPieces(pos, us)) {
      pos.makeNull();
      const v = -this.search(pos, depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stopped) return 0;
      if (v >= beta) return beta;
    }

    const moves = this.order(pos, pos.pseudo(), hint, ply);
    let legal = 0;
    let best = -INF;
    let bestMove = 0;
    const a0 = alpha;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      pos.make(m);
      if (pos.attacked(pos.kings[us], us ^ 1)) {
        pos.unmake();
        continue;
      }
      legal++;
      const quiet = !(mFlags(m) & F_CAPTURE) && !mPromo(m);
      let v;
      if (legal === 1) v = -this.search(pos, depth - 1, -beta, -alpha, ply + 1, true);
      else {
        // reducción para jugadas tranquilas tardías
        let r = 0;
        if (quiet && !inCheck && depth >= 3 && legal > 3) r = legal > 8 ? 2 : 1;
        v = -this.search(pos, depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && r) v = -this.search(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && v < beta) v = -this.search(pos, depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stopped) return 0;
      if (v > best) {
        best = v;
        bestMove = m;
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (quiet) {
          const k = this.killers[ply];
          if (k && k[0] !== m) {
            k[1] = k[0];
            k[0] = m;
          }
          this.history[(mFrom(m) << 6) | mTo(m)] += depth * depth;
        }
        break;
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    this.store(pos, depth, best, best <= a0 ? UPPER : best >= beta ? LOWER : EXACT, bestMove, ply);
    return best;
  }

  hasPieces(pos, c) {
    for (let sq = 0; sq < 64; sq++) {
      const p = pos.board[sq];
      if (p && p >> 3 === c) {
        const t = p & 7;
        if (t !== PAWN && t !== KING) return true;
      }
    }
    return false;
  }

  quiesce(pos, alpha, beta, ply) {
    if ((++this.nodes & 2047) === 0 && performance.now() > this.stopAt) this.stopped = true;
    if (this.stopped) return 0;
    const stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 60) return stand;
    const us = pos.turn;
    const moves = this.order(pos, pos.pseudo(true), 0, 0);
    for (const m of moves) {
      // poda delta: una captura que ni así alcanza alfa
      const victim = pos.board[mTo(m)] & 7;
      if (!mPromo(m) && stand + VAL[victim || PAWN] + 200 < alpha) continue;
      pos.make(m);
      if (pos.attacked(pos.kings[us], us ^ 1)) {
        pos.unmake();
        continue;
      }
      const v = -this.quiesce(pos, -beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stopped) return 0;
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
}

/** Niveles de la computadora. */
export const LEVELS = [
  null,
  { time: 250, depth: 1, noise: 180, blunder: 0.22 }, // principiante
  { time: 400, depth: 2, noise: 70, blunder: 0.05 }, // fácil
  { time: 500, depth: 3, noise: 22 }, // normal
  { time: 1200, depth: 64 }, // difícil
  { time: 2600, depth: 64 }, // maestro
];

export { Position, colorOf, typeOf };
