/**
 * Chispa — reglas (compartidas por el navegador y el servidor).
 *
 * Mazo de 108 cartas: 4 colores con un 0, dos de cada número del 1 al 9 y dos de cada acción
 * (salto, reversa y +2), más 4 comodines y 4 comodines +4. Se juega por color, por número o por
 * símbolo; el comodín va sobre cualquier carta y elige color. El que se queda con una sola carta
 * tiene que avisar "¡Última!": si otro lo agarra antes de que juegue el siguiente, roba 2.
 *
 * Las cartas son números (0..107); CARDS[id] = { c: color 0..3 (4 = comodín), v: valor }.
 * Valores: 0..9 números, 10 salto, 11 reversa, 12 +2, 13 comodín, 14 comodín +4.
 */
export const SKIP = 10;
export const REV = 11;
export const D2 = 12;
export const WILD = 13;
export const W4 = 14;
export const HAND = 7;

export const CARDS = [];
for (let c = 0; c < 4; c++) {
  CARDS.push({ c, v: 0 });
  for (let v = 1; v <= 12; v++) CARDS.push({ c, v }, { c, v });
}
for (let i = 0; i < 4; i++) CARDS.push({ c: 4, v: WILD });
for (let i = 0; i < 4; i++) CARDS.push({ c: 4, v: W4 });

export const points = (id) => {
  const v = CARDS[id].v;
  return v < 10 ? v : v < WILD ? 20 : 50;
};

export function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Orden de la mano: por color y valor (los comodines al final). */
export const sortHand = (h) => h.sort((a, b) => CARDS[a].c - CARDS[b].c || CARDS[a].v - CARDS[b].v || a - b);

export const top = (s) => s.discard[s.discard.length - 1];
export const step = (s, k = 1, from = s.turn) => (((from + s.dir * k) % s.n) + s.n) % s.n;

/** Reparte una ronda nueva. opts: { stack: acumular +2/+4 }. */
export function newRound(n, dealer, opts, rng) {
  const deck = shuffle([...Array(CARDS.length).keys()], rng);
  const hands = Array.from({ length: n }, () => []);
  for (let k = 0; k < HAND; k++) for (let p = 0; p < n; p++) hands[(dealer + 1 + p) % n].push(deck.pop());
  hands.forEach(sortHand);
  // la primera carta de la pila es siempre un número (las acciones vuelven al mazo)
  let first = deck.pop();
  while (CARDS[first].v > 9) {
    deck.unshift(first);
    first = deck.pop();
  }
  return {
    n,
    hands,
    draw: deck,
    discard: [first],
    color: CARDS[first].c,
    turn: (dealer + 1) % n,
    dir: 1,
    pending: 0, // cartas acumuladas por +2/+4 que tiene que robar el de turno
    drew: -1, // carta recién robada que se puede jugar (el resto de la mano no)
    last: -1, // jugador con una carta que no avisó (se lo puede agarrar)
    called: new Array(n).fill(false),
    winner: -1,
    opts: { stack: !!opts.stack },
  };
}

/** ¿Se puede jugar esta carta ahora (sin mirar de quién es el turno)? */
export function fits(s, id) {
  const k = CARDS[id];
  const t = CARDS[top(s)];
  if (s.pending > 0) return s.opts.stack && (k.v === W4 || (k.v === D2 && t.v === D2));
  return k.c === 4 || k.c === s.color || k.v === t.v;
}

export function canPlay(s, p, id) {
  if (s.winner >= 0 || s.turn !== p) return false;
  if (!s.hands[p].includes(id)) return false;
  if (s.drew >= 0 && id !== s.drew) return false;
  return fits(s, id);
}

export const playable = (s, p) => (s.winner >= 0 || s.turn !== p ? [] : s.hands[p].filter((id) => canPlay(s, p, id)));

/** Roba n cartas (rearma el mazo con la pila si hace falta). Devuelve las cartas robadas. */
export function drawCards(s, p, n, rng) {
  const got = [];
  for (let i = 0; i < n; i++) {
    if (!s.draw.length) {
      const keep = s.discard.pop();
      s.draw = shuffle(s.discard, rng);
      s.discard = [keep];
      if (!s.draw.length) break;
    }
    const id = s.draw.pop();
    s.hands[p].push(id);
    got.push(id);
  }
  if (s.hands[p].length > 1) {
    s.called[p] = false;
    if (s.last === p) s.last = -1;
  }
  return got;
}

/** Cualquier jugada de otro cierra la ventana para agarrar al que no avisó. */
function closeWindow(s, p) {
  if (s.last >= 0 && s.last !== p) s.last = -1;
}

/** Juega una carta. color: el elegido si es comodín. Devuelve el evento o null si no vale. */
export function play(s, p, id, color, rng) {
  if (!canPlay(s, p, id)) return null;
  const k = CARDS[id];
  if (k.c === 4 && !(Number.isInteger(color) && color >= 0 && color < 4)) return null;
  closeWindow(s, p);
  const h = s.hands[p];
  h.splice(h.indexOf(id), 1);
  s.discard.push(id);
  s.color = k.c < 4 ? k.c : color;
  s.drew = -1;
  const ev = { k: 'play', p, id, color: s.color };
  const next = step(s, 1, p);
  if (h.length === 1 && !s.called[p]) s.last = p;
  if (!h.length) {
    s.winner = p;
    // el +2/+4 final igual se roba (suma puntos al ganador)
    if (k.v === D2 || k.v === W4) {
      const n = s.pending + (k.v === D2 ? 2 : 4);
      s.pending = 0;
      ev.draw = { p: next, n: drawCards(s, next, n, rng).length };
    }
    ev.win = true;
    return ev;
  }
  if (k.v === SKIP) {
    ev.skip = next;
    s.turn = step(s, 2, p);
  } else if (k.v === REV) {
    s.dir = -s.dir;
    ev.rev = true;
    // con dos jugadores la reversa funciona como salto
    s.turn = s.n === 2 ? p : step(s, 1, p);
  } else if (k.v === D2 || k.v === W4) {
    const n = k.v === D2 ? 2 : 4;
    if (s.opts.stack) {
      s.pending += n;
      ev.pending = s.pending;
      s.turn = next;
    } else {
      ev.draw = { p: next, n: drawCards(s, next, n, rng).length };
      ev.skip = next;
      s.turn = step(s, 2, p);
    }
  } else s.turn = next;
  return ev;
}

/**
 * Robar. Si hay un +2/+4 acumulado se roba todo y se pierde el turno. Si no, se roba una: si se
 * puede jugar, el jugador elige (jugarla o pasar); si no, pasa solo.
 */
export function draw(s, p, rng) {
  if (s.winner >= 0 || s.turn !== p || s.drew >= 0) return null;
  closeWindow(s, p);
  if (s.pending > 0) {
    const n = s.pending;
    s.pending = 0;
    const got = drawCards(s, p, n, rng);
    s.turn = step(s, 1, p);
    return { k: 'draw', p, n: got.length, ids: got, forced: true };
  }
  const got = drawCards(s, p, 1, rng);
  const id = got[0];
  if (id !== undefined && fits(s, id)) {
    s.drew = id;
    return { k: 'draw', p, n: 1, ids: got, keep: true };
  }
  s.turn = step(s, 1, p);
  return { k: 'draw', p, n: got.length, ids: got };
}

/** Pasar después de robar una carta jugable. */
export function pass(s, p) {
  if (s.winner >= 0 || s.turn !== p || s.drew < 0) return null;
  s.drew = -1;
  s.turn = step(s, 1, p);
  return { k: 'pass', p };
}

/** "¡Última!": con 2 cartas en el turno propio (antes de jugar) o con 1 si todavía no avisó. */
export function call(s, p) {
  if (s.winner >= 0 || s.called[p]) return null;
  const n = s.hands[p].length;
  if (!(n === 1 || (n === 2 && s.turn === p))) return null;
  s.called[p] = true;
  if (s.last === p) s.last = -1;
  return { k: 'call', p };
}

/** Agarrar al que se quedó con una carta sin avisar: roba 2. */
export function catchLast(s, by, target, rng) {
  if (s.winner >= 0 || s.last !== target || by === target || s.called[target] || s.hands[target].length !== 1) return null;
  const got = drawCards(s, target, 2, rng);
  s.last = -1;
  return { k: 'caught', p: target, by, n: got.length, ids: got };
}

/** Puntos que se lleva el ganador de la ronda (lo que les quedó en la mano a los demás). */
export function roundPoints(s) {
  let t = 0;
  s.hands.forEach((h, i) => {
    if (i !== s.winner) for (const id of h) t += points(id);
  });
  return t;
}
