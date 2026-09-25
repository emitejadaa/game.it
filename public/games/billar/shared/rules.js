/**
 * Billar — reglas de bola 8 (cliente, CPU y servidor).
 *
 * - Saque con bola en mano detrás de la línea. Si la 8 entra en el saque, se repone.
 * - Mesa abierta hasta que alguien emboca legalmente: se queda con ese grupo (lisas 1-7 o
 *   rayadas 9-15).
 * - Falta (bola en mano para el rival en toda la mesa): la blanca entra, no toca ninguna bola,
 *   toca primero una que no es suya, o nada toca banda después del contacto sin embocar.
 * - Sigue tirando quien emboca una propia sin falta.
 * - Con su grupo completo se juega la 8 cantando tronera: embocarla ahí gana; embocarla antes,
 *   en otra tronera o con falta, pierde.
 */
import { rack, FOOT, R, canPlace, L, W } from './physics.js';

export const groupOf = (n) => (n >= 1 && n <= 7 ? 'solid' : n >= 9 && n <= 15 ? 'stripe' : n === 8 ? 'eight' : 'cue');

export function newGame(rnd = Math.random, first = 0) {
  return { balls: rack(rnd), turn: first, groups: [null, null], open: true, brk: true, inHand: true, kitchen: true, winner: null, reason: null, foul: null, shots: 0 };
}

/** Bolas de su grupo que le quedan en la mesa. */
export function remaining(state, p) {
  const g = state.groups[p];
  if (!g) return 7;
  return state.balls.filter((b) => b.on && groupOf(b.n) === g).length;
}

/** ¿Le toca tirarle a la 8? */
export const onEight = (state, p) => !!state.groups[p] && remaining(state, p) === 0;

/** Bolas a las que puede pegarle primero. */
export function legalTargets(state, p) {
  if (onEight(state, p)) return [8];
  const g = state.groups[p];
  return state.balls.filter((b) => b.on && b.n !== 0 && b.n !== 8 && (!g || groupOf(b.n) === g)).map((b) => b.n);
}

/**
 * Aplica el resultado de un tiro ya simulado. `balls` es el estado final de la simulación y
 * `ev` sus eventos. `call` es la tronera cantada para la 8 (o null).
 * Devuelve el nuevo estado y un resumen para mostrar.
 */
export function judge(state, balls, ev, call = null) {
  const p = state.turn;
  const opp = 1 - p;
  const was8 = onEight(state, p);
  const pocketed = ev.pocketed.map((x) => x[0]);
  const scratch = pocketed.includes(0);
  const eight = ev.pocketed.find((x) => x[0] === 8);
  const g = state.groups[p];
  let foul = null;
  if (ev.first === null) foul = 'noHit';
  else if (was8 && ev.first !== 8) foul = 'wrongFirst';
  else if (!was8 && g && groupOf(ev.first) !== g) foul = 'wrongFirst';
  else if (!was8 && !g && ev.first === 8 && !state.brk) foul = 'eightFirst';
  if (scratch) foul = 'scratch';
  if (!foul && !state.brk && pocketed.length === 0 && ev.railAfter === 0) foul = 'noRail';

  const next = { ...state, balls, groups: state.groups.slice(), brk: false, kitchen: false, inHand: false, foul, shots: state.shots + 1 };
  let winner = null;
  let reason = null;
  const summary = { by: p, foul, pocketed, assigned: null, respot8: false, continues: false };

  if (eight) {
    if (state.brk) {
      // la 8 en el saque se repone en su lugar
      respot(balls, 8);
      summary.respot8 = true;
    } else if (!was8) {
      winner = opp;
      reason = 'eightEarly';
    } else if (foul) {
      winner = opp;
      reason = 'eightFoul';
    } else if (call !== null && eight[1] !== call) {
      winner = opp;
      reason = 'eightWrongPocket';
    } else {
      winner = p;
      reason = 'eightIn';
    }
  }
  if (winner !== null) {
    next.winner = winner;
    next.reason = reason;
    summary.winner = winner;
    summary.reason = reason;
    return { state: next, summary };
  }

  // asignación de grupos (mesa abierta, embocada legal, no en el saque)
  if (!foul && next.open && !state.brk) {
    const firstIn = pocketed.find((n) => n !== 0 && n !== 8);
    if (firstIn) {
      const mine = groupOf(firstIn);
      next.groups[p] = mine;
      next.groups[opp] = mine === 'solid' ? 'stripe' : 'solid';
      next.open = false;
      summary.assigned = mine;
    }
  }
  const myGroup = next.groups[p];
  const good = pocketed.some((n) => n !== 0 && n !== 8 && (!myGroup || next.open || groupOf(n) === myGroup));
  const continues = !foul && good;
  summary.continues = continues;
  next.turn = continues ? p : opp;
  if (foul) {
    next.inHand = true;
    if (scratch) {
      const cue = balls[0];
      cue.on = true;
      cue.pocket = undefined;
      placeCueDefault(balls);
    }
  }
  return { state: next, summary };
}

/** Repone una bola en el punto de pie (o lo más cerca posible, hacia atrás). */
export function respot(balls, n) {
  const b = balls.find((x) => x.n === n);
  b.on = true;
  b.pocket = undefined;
  b.vx = b.vy = b.wx = b.wy = b.wz = 0;
  b.rest = true;
  const y = FOOT[1];
  const free = (x) => balls.every((o) => o === b || !o.on || (o.x - x) ** 2 + (o.y - y) ** 2 >= (2 * R + 0.05) ** 2);
  let x = FOOT[0];
  while (x < L - R && !free(x)) x += 0.5;
  b.x = x;
  b.y = y;
}

function placeCueDefault(balls) {
  const cue = balls[0];
  let x = L / 4;
  let y = W / 2;
  for (let k = 0; k < 200 && !canPlace(balls, x, y); k++) {
    x = L / 4 + ((k % 10) - 5) * 3;
    y = W / 2 + (Math.floor(k / 10) - 10) * 3;
  }
  cue.x = x;
  cue.y = y;
  cue.rest = true;
}
