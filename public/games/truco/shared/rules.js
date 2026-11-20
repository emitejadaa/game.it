/**
 * Truco — las reglas puras, sin estado: el mazo español de 40 cartas, qué carta mata a cuál, los puntos del envido y
 * de la flor, cuánto vale cada canto (aceptado o no), quién gana cada baza y quién se lleva la mano.
 *
 * Una carta es un texto con el número y el palo: '1e' (ancho de espadas), '7o', '12c', '4b'.
 * Palos: e espadas · b bastos · o oros · c copas. Los equipos son el asiento % 2 (en el de a dos, cada uno es su equipo).
 */
export const SUITS = ['e', 'b', 'o', 'c'];
export const NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const DECK = SUITS.flatMap((s) => NUMS.map((n) => `${n}${s}`));
export const isCard = (c) => typeof c === 'string' && DECK.includes(c);

export const num = (c) => parseInt(c, 10);
export const suit = (c) => c[c.length - 1];
export const teamOf = (seat) => seat % 2;

/** Jerarquía del truco: 14 el ancho de espadas … 1 los cuatros. */
export function power(c) {
  const n = num(c), s = suit(c);
  if (n === 1 && s === 'e') return 14;
  if (n === 1 && s === 'b') return 13;
  if (n === 7 && s === 'e') return 12;
  if (n === 7 && s === 'o') return 11;
  if (n === 3) return 10;
  if (n === 2) return 9;
  if (n === 1) return 8;
  if (n === 12) return 7;
  if (n === 11) return 6;
  if (n === 10) return 5;
  if (n === 7) return 4;
  if (n === 6) return 3;
  if (n === 5) return 2;
  return 1;
}

/** Lo que vale una carta para el envido: las figuras (10, 11 y 12) no suman. */
export const envVal = (c) => (num(c) <= 7 ? num(c) : 0);

/** Puntos de envido de una mano (2 o 3 cartas): dos del mismo palo son 20 más sus valores; si no, la más alta. */
export function envido(cards) {
  let best = 0;
  for (let i = 0; i < cards.length; i++) {
    best = Math.max(best, envVal(cards[i]));
    for (let j = i + 1; j < cards.length; j++) if (suit(cards[i]) === suit(cards[j])) best = Math.max(best, 20 + envVal(cards[i]) + envVal(cards[j]));
  }
  return best;
}
/** Las cartas que forman el envido (para mostrarlas al final de la mano). */
export function envidoCards(cards) {
  const e = envido(cards);
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) if (suit(cards[i]) === suit(cards[j]) && 20 + envVal(cards[i]) + envVal(cards[j]) === e) return [cards[i], cards[j]];
  return [cards.find((c) => envVal(c) === e) ?? cards[0]];
}

export const hasFlor = (cards) => cards.length === 3 && cards.every((c) => suit(c) === suit(cards[0]));
export const florPts = (cards) => 20 + cards.reduce((a, c) => a + envVal(c), 0);

// ---------------------------------------------------------------- truco
/** Nivel del truco: 0 sin cantar, 1 truco, 2 retruco, 3 vale cuatro. */
export const TRUCO = ['', 'truco', 'retruco', 'vale4'];
/** Lo que vale la mano con el truco aceptado hasta ese nivel. */
export const trucoValue = (level) => level + 1;
/** Lo que se lleva el que cantó si le dicen que no quiero (lo que valía antes del canto). */
export const trucoRejected = (level) => level;

// ---------------------------------------------------------------- envido
export const ENVIDO_KINDS = ['envido', 'real', 'falta'];
/** Qué se puede cantar después de una cadena de envidos: envido (hasta dos), real envido (uno) y falta envido. */
export function envidoNext(chain) {
  if (chain.includes('falta')) return [];
  if (chain.includes('real')) return ['falta'];
  if (chain.filter((k) => k === 'envido').length >= 2) return ['real', 'falta'];
  return ['envido', 'real', 'falta'];
}
/** La falta envido vale lo que le falta al que va ganando para llegar al final. */
export const faltaValue = (scores, target) => Math.max(1, target - Math.max(...scores));
/** Puntos del envido querido. */
export function envidoAccepted(chain, scores, target) {
  if (chain.includes('falta')) return faltaValue(scores, target);
  return chain.reduce((a, k) => a + (k === 'real' ? 3 : 2), 0);
}
/** Puntos del envido no querido: lo querido antes del último canto, o 1 si fue el primero. */
export function envidoRejected(chain, scores, target) {
  if (chain.length <= 1) return 1;
  return envidoAccepted(chain.slice(0, -1), scores, target);
}

// ---------------------------------------------------------------- bazas y manos
/** Quién gana una baza: { team: 0 | 1 | -1 (parda), seat: el que la ganó (o el primero de los empardados) }. */
export function bazaWinner(plays) {
  let best = -1;
  let top = [];
  for (const p of plays) {
    const pw = power(p.card);
    if (pw > best) {
      best = pw;
      top = [p];
    } else if (pw === best) top.push(p);
  }
  const teams = new Set(top.map((p) => teamOf(p.seat)));
  return { team: teams.size > 1 ? -1 : teamOf(top[0].seat), seat: top[0].seat };
}

/**
 * Quién se lleva la mano con los resultados de las bazas jugadas (0 | 1 | -1 parda), o null si sigue.
 * Gana el que hace dos; si la primera es parda, define la siguiente que no lo sea; si se emparda después de una
 * ganada, gana el que hizo la primera; si las tres son pardas, gana el equipo que es mano.
 */
export function handWinner(res, manoTeam) {
  const w = [0, 0];
  for (const r of res) if (r >= 0) w[r]++;
  if (w[0] >= 2) return 0;
  if (w[1] >= 2) return 1;
  const [a, b, c] = res;
  if (res.length >= 2) {
    if (a >= 0 && b === -1) return a;
    if (a === -1 && b >= 0) return b;
  }
  if (res.length === 3) {
    if (c === -1) return a >= 0 ? a : manoTeam;
    return c;
  }
  return null;
}

/** El orden de juego a partir de un asiento (contrario a las agujas del reloj: el siguiente es el de la derecha). */
export const orderFrom = (start, n) => Array.from({ length: n }, (_, k) => (start + k) % n);

/**
 * El pie de un equipo: el último de ese equipo en jugar la primera baza. De a cuatro son el que repartió y el
 * compañero del mano, y solo ellos cantan el envido (mano a mano, cada uno es su propio pie).
 */
export const pieOf = (team, mano, n) => orderFrom(mano, n).filter((s) => teamOf(s) === team).pop();
export const isPie = (seat, mano, n) => pieOf(teamOf(seat), mano, n) === seat;

/**
 * El envido de cada equipo y quién gana: el que tiene más; si empatan, el que está más cerca de la mano.
 * hands: las tres cartas de cada asiento. Devuelve { winner, pts: [mejor de cada equipo], seat: [quién lo tiene] }.
 */
export function envidoResult(hands, mano) {
  const n = hands.length;
  const pts = [-1, -1];
  const seat = [-1, -1];
  const pos = [99, 99];
  orderFrom(mano, n).forEach((s, k) => {
    const tm = teamOf(s);
    const e = envido(hands[s]);
    if (e > pts[tm]) {
      pts[tm] = e;
      seat[tm] = s;
      pos[tm] = k;
    }
  });
  const winner = pts[0] !== pts[1] ? (pts[0] > pts[1] ? 0 : 1) : pos[0] < pos[1] ? 0 : 1;
  return { winner, pts, seat };
}

/** Lo mismo con la flor (solo cuentan los que la tienen). Devuelve null si nadie tiene. */
export function florResult(hands, mano) {
  const n = hands.length;
  const flores = [];
  orderFrom(mano, n).forEach((s, k) => hasFlor(hands[s]) && flores.push({ seat: s, team: teamOf(s), pts: florPts(hands[s]), k }));
  if (!flores.length) return null;
  const teams = new Set(flores.map((f) => f.team));
  let best = flores[0];
  for (const f of flores) if (f.pts > best.pts) best = f;
  // una sola flor (o solo un equipo con flor): 3 por flor; flor contra flor: la mejor se lleva 3 por cada una (mínimo 6)
  const pts = teams.size > 1 ? Math.max(6, 3 * flores.length) : 3 * flores.length;
  return { winner: best.team, pts, seats: flores.map((f) => f.seat), best: best.seat, against: teams.size > 1 };
}

/** Mezcla con el rng dado (Fisher-Yates). */
export function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** En qué asiento queda cada persona de una sala online: en 2 vs 2 con las parejas "juntas", las dos primeras van del mismo lado. */
export function seatOrder(count, n, pair) {
  const order = n === 4 && pair ? [0, 2, 1, 3] : [0, 1, 2, 3];
  return Array.from({ length: Math.min(count, n) }, (_, k) => order[k]);
}
