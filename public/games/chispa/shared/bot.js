/**
 * Chispa — jugadores de la compu.
 * Fácil: juega casi al azar y a veces se olvida de avisar "¡Última!".
 * Normal/Difícil: guardan los comodines, juegan del color que más tienen, atacan con acciones al
 * que está por ganar y eligen el color que más les conviene.
 */
import { CARDS, playable, step, points, SKIP, REV, D2, W4 } from './rules.js';

export const LEVELS = {
  1: { call: 0.72, catchMs: [2400, 4200], smart: 0.4 },
  2: { call: 0.92, catchMs: [1100, 2300], smart: 0.9 },
  3: { call: 0.99, catchMs: [650, 1400], smart: 1 },
};

function colorWeights(hand, skip) {
  const w = [0, 0, 0, 0];
  for (const id of hand) {
    if (id === skip) continue;
    const k = CARDS[id];
    if (k.c < 4) w[k.c] += k.v >= 10 ? 1.4 : 1;
  }
  return w;
}

/** Color para un comodín: el que más tiene en la mano. */
export function pickColor(s, p, id, level, rng) {
  if (rng() > (LEVELS[level] || LEVELS[2]).smart) return Math.floor(rng() * 4);
  const w = colorWeights(s.hands[p], id);
  let best = 0;
  for (let c = 1; c < 4; c++) if (w[c] > w[best] || (w[c] === w[best] && rng() < 0.5)) best = c;
  return best;
}

/** Decide la jugada: { t: 'play', id, color } | { t: 'draw' } | { t: 'pass' }. */
export function decide(s, p, level, rng) {
  const L = LEVELS[level] || LEVELS[2];
  const opts = playable(s, p);
  if (s.drew >= 0) {
    if (!opts.length) return { t: 'pass' };
    const id = s.drew;
    // un comodín robado se guarda si todavía hay muchas cartas (jugada de los buenos)
    if (level >= 2 && CARDS[id].c === 4 && s.hands[p].length > 4 && rng() < 0.5) return { t: 'pass' };
    return { t: 'play', id, color: pickColor(s, p, id, level, rng) };
  }
  if (!opts.length) return { t: 'draw' };
  let choice;
  if (rng() > L.smart) choice = opts[Math.floor(rng() * opts.length)];
  else {
    const hand = s.hands[p];
    const next = step(s, 1, p);
    const nextN = s.hands[next].length;
    const leader = Math.min(...s.hands.map((h, i) => (i === p ? 99 : h.length)));
    let best = -Infinity;
    for (const id of opts) {
      const k = CARDS[id];
      const w = colorWeights(hand, id);
      let sc = rng() * 2;
      if (k.c === 4) sc += hand.length <= 2 ? 30 : -25 + (leader <= 2 ? 20 : 0);
      else {
        sc += w[k.c] * 4;
        if (k.c !== s.color) sc += w[k.c] > 0 ? 2 : -6;
      }
      if (k.v === SKIP || k.v === D2) sc += nextN <= 2 ? 35 : 5;
      if (k.v === REV) sc += nextN <= 2 && s.n > 2 ? 25 : 4;
      if (k.v === W4) sc += nextN <= 2 ? 40 : 0;
      if (s.pending > 0 && k.v === D2) sc += 12; // el +4 se guarda si alcanza con un +2
      sc += points(id) * 0.25;
      if (sc > best) {
        best = sc;
        choice = id;
      }
    }
  }
  return { t: 'play', id: choice, color: CARDS[choice].c === 4 ? pickColor(s, p, choice, level, rng) : undefined };
}
