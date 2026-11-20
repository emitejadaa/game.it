/** Truco: jerarquía de cartas, envido, flor, cantos, bazas, la mesa (turnos, cantos, puntos, tiempos), la compu, el diario y el servidor. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECK, power, envido, envidoCards, hasFlor, florPts, envidoNext, envidoAccepted, envidoRejected, faltaValue, bazaWinner, handWinner, envidoResult, florResult, trucoValue, trucoRejected, shuffled, seatOrder, isCard, pieOf, isPie } from '../public/games/truco/shared/rules.js';
import { decide } from '../public/games/truco/shared/bot.js';
import { Table, PACE } from '../public/games/truco/shared/table.js';
import { cardSVG, backSVG } from '../public/shared/spanish-deck.js';
import { rng as seeded } from '../public/shared/daily.js';
import { startServer, connect, wait } from './helpers.mjs';

/** Generador con semilla (para que las pruebas den siempre lo mismo). */
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** io de prueba: los temporizadores se corren a mano. `settle` deja pasar solo las pausas (no las jugadas de la compu). */
function fakeIo() {
  const io = { views: [], timers: new Map(), now: 0, overCalls: 0, standings: null };
  io.emit = (i, v) => io.views.push([i, v]);
  io.timer = (k, ms, fn) => io.timers.set(k, { at: io.now + ms, fn });
  io.clear = (k) => io.timers.delete(k);
  io.over = (s) => {
    io.overCalls++;
    io.standings = s;
  };
  /** Corre el temporizador más próximo de entre `keys`. Devuelve su nombre o null. */
  io.runNext = (keys) => {
    const c = [...io.timers].filter(([k]) => keys.includes(k)).sort((a, b) => a[1].at - b[1].at)[0];
    if (!c) return null;
    io.timers.delete(c[0]);
    io.now = c[1].at;
    c[1].fn();
    return c[0];
  };
  io.settle = (T) => {
    for (let n = 0; n < 50 && T.phase === 'play' && T.actor() < 0; n++) if (!io.runNext(['resume', 'next'])) break;
  };
  return io;
}
const seats = (n, bot = 0) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: '#fff', bot }));

/** Un mazo en el que cada asiento recibe las cartas dadas (deck[s + k·n]). */
function deckFor(hands) {
  const n = hands.length;
  const deck = new Array(3 * n);
  hands.forEach((h, s) => h.forEach((c, k) => (deck[s + k * n] = c)));
  const used = new Set(deck);
  return [...deck, ...DECK.filter((c) => !used.has(c))];
}
/** Mesa de personas con las cartas elegidas, lista para que juegue el mano. */
function scene(hands, opts = {}, rng = mulberry(1)) {
  const io = fakeIo();
  const T = new Table({ seats: seats(hands.length), opts: { target: 30, first: 0, ...opts }, io, rng, dealFn: () => deckFor(hands) });
  T.start();
  io.settle(T);
  return { T, io };
}
/** El último evento de ese tipo (el resumen de la mano, por ejemplo: al terminar, `settle` ya empezó la siguiente). */
const lastEv = (T, k) => [...T.log].reverse().find((e) => e.k === k);
/** Una jugada que tiene que ser válida, y después las pausas. */
function go(S, seat, msg) {
  assert.ok(S.T.act(seat, msg), `${seat} ${JSON.stringify(msg)} debería ser válida (puede: ${JSON.stringify(S.T.legal(seat))})`);
  S.io.settle(S.T);
}

test('jerarquía: del ancho de espadas a los cuatros, con sus empates', () => {
  assert.equal(DECK.length, 40);
  assert.equal(new Set(DECK).size, 40);
  assert.ok(DECK.every(isCard));
  assert.ok(!isCard('8e') && !isCard('9o') && !isCard('1x') && !isCard(7));
  const order = ['1e', '1b', '7e', '7o', '3c', '2c', '1o', '12c', '11c', '10c', '7c', '6c', '5c', '4c'];
  const p = order.map(power);
  for (let i = 1; i < p.length; i++) assert.ok(p[i - 1] > p[i], `${order[i - 1]} mata a ${order[i]}`);
  // los treses, los doses y los cuatros valen lo mismo en todos los palos; los 7 de copas y bastos son bajos
  for (const s of ['e', 'b', 'o', 'c']) {
    assert.equal(power(`3${s}`), power('3e'));
    assert.equal(power(`2${s}`), power('2e'));
  }
  assert.equal(power('1o'), power('1c'));
  assert.equal(power('7c'), power('7b'));
  assert.ok(power('7c') < power('10c') && power('7c') > power('6c'));
  assert.equal(power('1e'), 14);
  assert.equal(power('4o'), 1);
});

test('envido: dos del mismo palo suman 20 más sus valores, las figuras valen 0 y sin pares cuenta la más alta', () => {
  assert.equal(envido(['7e', '6e', '12o']), 33);
  assert.equal(envido(['7e', '6e', '5e']), 33, 'con tres del mismo palo se eligen las dos mejores');
  assert.equal(envido(['5c', '12c', '1o']), 25, 'la figura no suma');
  assert.equal(envido(['12e', '11b', '10o']), 0);
  assert.equal(envido(['7o', '4b', '5c']), 7);
  assert.equal(envido(['12e', '11e', '3c']), 20, 'dos figuras del mismo palo valen 20');
  assert.equal(envido(['4o', '1c']), 4, 'con dos cartas (ya jugó una) también');
  assert.deepEqual(envidoCards(['7e', '6e', '12o']).sort(), ['6e', '7e']);
  assert.deepEqual(envidoCards(['7o', '4b', '5c']), ['7o']);
});

test('flor: tres del mismo palo, vale 20 más las tres', () => {
  assert.ok(hasFlor(['1e', '5e', '12e']));
  assert.ok(!hasFlor(['1e', '5e', '12o']));
  assert.ok(!hasFlor(['1e', '5e']));
  assert.equal(florPts(['1e', '5e', '12e']), 26);
  assert.equal(florPts(['7o', '6o', '5o']), 38);
});

test('cantos de envido: qué se puede subir, cuánto vale querido y cuánto no querido', () => {
  assert.deepEqual(envidoNext([]), ['envido', 'real', 'falta']);
  assert.deepEqual(envidoNext(['envido']), ['envido', 'real', 'falta']);
  assert.deepEqual(envidoNext(['envido', 'envido']), ['real', 'falta'], 'dos envidos nada más');
  assert.deepEqual(envidoNext(['real']), ['falta']);
  assert.deepEqual(envidoNext(['envido', 'real']), ['falta']);
  assert.deepEqual(envidoNext(['falta']), []);
  const sc = [10, 20];
  assert.equal(envidoAccepted(['envido'], sc, 30), 2);
  assert.equal(envidoAccepted(['envido', 'envido'], sc, 30), 4);
  assert.equal(envidoAccepted(['real'], sc, 30), 3);
  assert.equal(envidoAccepted(['envido', 'real'], sc, 30), 5);
  assert.equal(envidoAccepted(['envido', 'envido', 'real'], sc, 30), 7);
  assert.equal(envidoAccepted(['envido', 'falta'], sc, 30), 10, 'la falta: lo que le falta al que va ganando');
  assert.equal(faltaValue([0, 0], 30), 30);
  assert.equal(faltaValue([14, 3], 15), 1);
  assert.equal(faltaValue([15, 3], 15), 1, 'nunca menos de 1');
  assert.equal(envidoRejected(['envido'], sc, 30), 1);
  assert.equal(envidoRejected(['envido', 'envido'], sc, 30), 2);
  assert.equal(envidoRejected(['envido', 'real'], sc, 30), 2);
  assert.equal(envidoRejected(['envido', 'envido', 'real'], sc, 30), 4);
  assert.equal(envidoRejected(['real', 'falta'], sc, 30), 3);
  assert.equal(envidoRejected(['falta'], sc, 30), 1);
});

test('truco: lo que vale la mano querida y lo que se lleva el que canta si no quieren', () => {
  assert.deepEqual([1, 2, 3].map(trucoValue), [2, 3, 4]);
  assert.deepEqual([1, 2, 3].map(trucoRejected), [1, 2, 3]);
});

test('bazas: gana la más alta, la parda y el de a cuatro por equipos', () => {
  assert.deepEqual(bazaWinner([{ seat: 0, card: '7e' }, { seat: 1, card: '3b' }]), { team: 0, seat: 0 });
  assert.deepEqual(bazaWinner([{ seat: 0, card: '4o' }, { seat: 1, card: '5c' }]), { team: 1, seat: 1 });
  assert.equal(bazaWinner([{ seat: 0, card: '3e' }, { seat: 1, card: '3b' }]).team, -1, 'parda');
  assert.equal(bazaWinner([{ seat: 0, card: '1o' }, { seat: 1, card: '1c' }]).team, -1);
  const four = [{ seat: 0, card: '2e' }, { seat: 1, card: '2b' }, { seat: 2, card: '2o' }, { seat: 3, card: '2c' }];
  assert.equal(bazaWinner(four).team, -1);
  // dos del mismo equipo empatan arriba: no es parda, gana el equipo (con el primero que la tiró)
  assert.deepEqual(bazaWinner([{ seat: 0, card: '3e' }, { seat: 1, card: '4e' }, { seat: 2, card: '3b' }, { seat: 3, card: '5e' }]), { team: 0, seat: 0 });
  assert.deepEqual(bazaWinner([{ seat: 1, card: '3e' }, { seat: 2, card: '1e' }, { seat: 3, card: '3b' }, { seat: 0, card: '5e' }]), { team: 0, seat: 2 });
});

test('quién se lleva la mano: dos bazas, la parda y las tres pardas', () => {
  const w = (res, mano = 0) => handWinner(res, mano);
  assert.equal(w([0]), null);
  assert.equal(w([1]), null);
  assert.equal(w([0, 0]), 0);
  assert.equal(w([1, 1]), 1);
  assert.equal(w([0, 1]), null);
  assert.equal(w([0, 1, 0]), 0);
  assert.equal(w([0, 1, 1]), 1);
  assert.equal(w([1, 0, 0]), 0);
  assert.equal(w([-1]), null);
  assert.equal(w([-1, 0]), 0, 'si la primera es parda define la segunda');
  assert.equal(w([-1, 1]), 1);
  assert.equal(w([0, -1]), 0, 'si se empata después de ganar la primera, gana el de la primera');
  assert.equal(w([1, -1]), 1);
  assert.equal(w([-1, -1, 1]), 1);
  assert.equal(w([-1, -1, 0]), 0);
  assert.equal(w([0, 1, -1]), 0, 'tres bazas con la última parda: gana el de la primera');
  assert.equal(w([-1, -1, -1], 0), 0, 'todo pardas: gana el mano');
  assert.equal(w([-1, -1, -1], 1), 1);
});

test('envido: gana el que tiene más y, si empatan, el más cercano al mano', () => {
  // mano a mano: empate 33 a 33 → gana el mano
  const h2 = [['7e', '6e', '1o'], ['7c', '6c', '1b']];
  assert.equal(envidoResult(h2, 0).winner, 0);
  assert.equal(envidoResult(h2, 1).winner, 1);
  assert.deepEqual(envidoResult([['7e', '6e', '1o'], ['7c', '5b', '4o']], 1), { winner: 0, pts: [33, 7], seat: [0, 1] });
  // de a cuatro: cada equipo vale por su mejor jugador
  const h4 = [['1o', '2o', '12c'], ['7e', '6e', '4b'], ['5b', '4b', '3c'], ['7c', '6c', '1e']];
  const r0 = envidoResult(h4, 0);
  assert.equal(r0.winner, 1);
  assert.deepEqual(r0.pts, [29, 33]);
  assert.equal(r0.seat[1], 1, 'con mano en 0, el 33 más cercano es el del asiento 1');
  assert.equal(envidoResult(h4, 3).seat[1], 3, 'con mano en 3, el del asiento 3');
});

test('flor: una sola vale 3, entre equipos gana la mejor y se lleva 3 por cada flor (al menos 6)', () => {
  const none = [['1e', '5e', '12o'], ['3b', '4o', '6c']];
  assert.equal(florResult(none, 0), null);
  const one = florResult([['1e', '5e', '12e'], ['3b', '4o', '6c']], 0);
  assert.equal(one.winner, 0);
  assert.equal(one.pts, 3);
  assert.equal(one.against, false);
  const both = florResult([['1e', '5e', '12e'], ['2b', '3b', '7b']], 0);
  assert.equal(both.winner, 1, '32 contra 26');
  assert.equal(both.pts, 6);
  assert.equal(both.against, true);
  // en parejas, las dos flores de un mismo equipo suman 3 cada una
  const pair = florResult([['1e', '5e', '12e'], ['3b', '4o', '6c'], ['2o', '3o', '4o'], ['3e', '4c', '7b']], 0);
  assert.equal(pair.winner, 0);
  assert.equal(pair.pts, 6);
  assert.equal(pair.against, false);
});

test('asientos online: parejas mezcladas o juntas', () => {
  assert.deepEqual(seatOrder(2, 4, 0), [0, 1]);
  assert.deepEqual(seatOrder(2, 4, 1), [0, 2], 'juntos: los dos primeros son compañeros');
  assert.deepEqual(seatOrder(3, 4, 1), [0, 2, 1]);
  assert.deepEqual(seatOrder(4, 4, 1), [0, 2, 1, 3]);
  assert.deepEqual(seatOrder(2, 2, 1), [0, 1], 'mano a mano no tiene parejas');
  assert.deepEqual(seatOrder(5, 4, 0), [0, 1, 2, 3], 'no más que los lugares');
  assert.deepEqual(shuffled(DECK, mulberry(5)), shuffled(DECK, mulberry(5)));
  assert.notDeepEqual(shuffled(DECK, mulberry(5)), shuffled(DECK, mulberry(6)));
  assert.deepEqual(shuffled(DECK, mulberry(5)).slice().sort(), DECK.slice().sort(), 'no se pierde ni se repite ninguna');
});

test('mesa: reparte tres cartas a cada uno y cada uno solo ve las suyas', () => {
  const hands = [['7e', '12c', '5c'], ['3b', '4o', '6c'], ['1o', '2o', '10e'], ['11b', '12b', '4e']];
  const { T } = scene(hands);
  for (let s = 0; s < 4; s++) {
    const v = T.view(s);
    assert.deepEqual(v.hand.mine, hands[s]);
    assert.equal(v.me, s);
    assert.deepEqual(v.seats.map((x) => x.left), [3, 3, 3, 3]);
    const json = JSON.stringify(v);
    for (let o = 0; o < 4; o++) if (o !== s) for (const c of hands[o]) assert.ok(!json.includes(`"${c}"`), `el asiento ${s} no puede ver ${c} del ${o}`);
  }
  // y lo que se juega es de todos
  assert.ok(T.act(0, { t: 'play', card: '7e' }));
  const json = JSON.stringify(T.view(2));
  assert.ok(json.includes('"7e"'));
  assert.ok(!json.includes('"12c"'));
});

test('mesa: se juega por turnos, sin cartas ajenas ni jugadas fuera de turno', () => {
  const S = scene([['7e', '12c', '5c'], ['3b', '4o', '6c']]);
  const { T } = S;
  assert.equal(T.actor(), 0);
  assert.ok(!T.act(1, { t: 'play', card: '3b' }), 'no le toca');
  assert.ok(!T.act(0, { t: 'play', card: '3b' }), 'esa carta no es suya');
  assert.ok(!T.act(0, { t: 'play', card: 'zz' }));
  assert.ok(!T.act(0, { t: 'play' }));
  assert.ok(!T.act(0, { t: 'quiero' }), 'no hay nada que querer');
  assert.ok(!T.act(0, { t: 'envido', kind: 'inventado' }));
  assert.ok(!T.act(0, null));
  go(S, 0, { t: 'play', card: '7e' });
  assert.equal(T.actor(), 1);
  assert.ok(!T.act(0, { t: 'play', card: '12c' }), 'ya jugó');
  assert.ok(!T.act(1, { t: 'play', card: '7e' }), 'esa ya la jugó el otro');
  go(S, 1, { t: 'play', card: '3b' });
  assert.equal(T.h.bazas[0].res, 0, 'el 7 de espadas mata al 3');
  assert.equal(T.actor(), 0, 'la baza la ganó 0 y juega primero');
});

test('mano sin cantos: vale 1 para el que hace dos bazas y después es mano el otro', () => {
  const S = scene([['7e', '12c', '5c'], ['3b', '4o', '6c']]);
  const { T } = S;
  go(S, 0, { t: 'play', card: '7e' });
  go(S, 1, { t: 'play', card: '3b' });
  go(S, 0, { t: 'play', card: '12c' });
  go(S, 1, { t: 'play', card: '4o' });
  assert.deepEqual(T.scores, [1, 0]);
  const he = lastEv(T, 'hand');
  assert.equal(he.why, 'bazas');
  assert.equal(he.pts, 1);
  assert.equal(he.team, 0);
  assert.equal(T.h.num, 1, 'ya empezó la siguiente');
  assert.equal(T.h.mano, 1, 'rota el mano');
  assert.equal(T.actor(), 1);
});

test('mano que se empata: la primera parda la define la segunda y las tres pardas son del mano', () => {
  // primera parda (3e contra 3b), la segunda la gana el 1
  const A = scene([['3e', '1e', '4c'], ['3b', '2b', '5c']]);
  go(A, 0, { t: 'play', card: '3e' });
  go(A, 1, { t: 'play', card: '3b' });
  assert.equal(A.T.h.bazas[0].res, -1);
  assert.equal(A.T.actor(), 0, 'tras la parda sigue el mano');
  go(A, 0, { t: 'play', card: '1e' });
  go(A, 1, { t: 'play', card: '2b' });
  assert.deepEqual(A.T.scores, [1, 0]);
  // las tres pardas: gana el mano
  const B = scene([['3e', '2e', '1o'], ['3b', '2b', '1c']]);
  go(B, 0, { t: 'play', card: '3e' });
  go(B, 1, { t: 'play', card: '3b' });
  go(B, 0, { t: 'play', card: '2e' });
  go(B, 1, { t: 'play', card: '2b' });
  assert.equal(B.T.phase, 'play');
  assert.equal(B.T.h.over, false, 'con dos pardas sigue la mano');
  go(B, 0, { t: 'play', card: '1o' });
  go(B, 1, { t: 'play', card: '1c' });
  assert.deepEqual(B.T.scores, [1, 0], 'el mano (asiento 0) se lleva la mano de tres pardas');
});

test('truco: no quiero da 1; querido sube la mano y solo puede subir el que quiso', () => {
  // no quiero
  const A = scene([['1e', '2o', '4c'], ['3b', '4o', '6c']]);
  assert.equal(A.T.legal(0).truco, 'truco');
  go(A, 0, { t: 'truco' });
  assert.equal(A.T.actor(), 1);
  const L1 = A.T.legal(1);
  assert.equal(L1.quiero, true);
  assert.equal(L1.truco, 'retruco');
  assert.ok(!L1.play, 'primero hay que contestar');
  assert.ok(!A.T.act(1, { t: 'play', card: '3b' }));
  go(A, 1, { t: 'noquiero' });
  assert.deepEqual(A.T.scores, [1, 0]);
  assert.equal(lastEv(A.T, 'hand').why, 'noquiero');
  // querido: la mano vale 2 y solo el que quiso puede subir
  const B = scene([['1e', '2o', '4c'], ['3b', '4o', '6c']]);
  go(B, 0, { t: 'truco' });
  go(B, 1, { t: 'quiero' });
  assert.equal(B.T.h.truco.level, 1);
  assert.equal(B.T.actor(), 0, 'sigue jugando el mano');
  assert.equal(B.T.legal(0).truco, null, 'el que cantó no puede volver a subir');
  assert.ok(!B.T.act(0, { t: 'truco' }));
  go(B, 0, { t: 'play', card: '1e' });
  assert.equal(B.T.legal(1).truco, 'retruco', 'el que quiso sí');
  go(B, 1, { t: 'play', card: '3b' });
  go(B, 0, { t: 'play', card: '2o' });
  go(B, 1, { t: 'play', card: '4o' });
  assert.deepEqual(B.T.scores, [2, 0], 'dos bazas con truco querido: 2 puntos');
});

test('truco: retruco y vale cuatro, lo que vale cada no quiero y el mazo', () => {
  // truco → retruco → vale cuatro → quiero → mano de 4 que se entrega con el mazo
  const A = scene([['1e', '2o', '4c'], ['3b', '4o', '6c']]);
  go(A, 0, { t: 'truco' });
  go(A, 1, { t: 'truco' }); // subir: quiere el truco y canta retruco
  assert.equal(A.T.h.truco.level, 1);
  assert.equal(A.T.h.pending.level, 2);
  assert.equal(A.T.actor(), 0);
  assert.equal(A.T.legal(0).truco, 'vale4');
  go(A, 0, { t: 'truco' });
  assert.equal(A.T.legal(1).truco, null, 'ya no se sube más');
  go(A, 1, { t: 'quiero' });
  assert.equal(A.T.h.truco.level, 3);
  assert.equal(A.T.legal(0).truco, null);
  go(A, 0, { t: 'play', card: '1e' });
  go(A, 1, { t: 'mazo' });
  assert.deepEqual(A.T.scores, [4, 0], 'el mazo con vale cuatro entrega 4');
  // retruco no querido: 2 para el que lo cantó
  const B = scene([['1e', '2o', '4c'], ['3b', '4o', '6c']]);
  go(B, 0, { t: 'truco' });
  go(B, 1, { t: 'truco' });
  go(B, 0, { t: 'noquiero' });
  assert.deepEqual(B.T.scores, [0, 2]);
  // vale cuatro no querido: 3
  const C = scene([['1e', '2o', '4c'], ['3b', '4o', '6c']]);
  go(C, 0, { t: 'truco' });
  go(C, 1, { t: 'truco' });
  go(C, 0, { t: 'truco' });
  go(C, 1, { t: 'noquiero' });
  assert.deepEqual(C.T.scores, [3, 0]);
  // mazo sin cantos en la primera entrega 2 (1 por el envido que no se jugó); con retruco querido, 3
  const D = scene([['1e', '2o', '4c'], ['3b', '4o', '6c']]);
  go(D, 0, { t: 'mazo' });
  assert.deepEqual(D.T.scores, [0, 2]);
  const E = scene([['1e', '2o', '4c'], ['3b', '4o', '6c']]);
  go(E, 0, { t: 'truco' });
  go(E, 1, { t: 'truco' });
  go(E, 0, { t: 'quiero' });
  assert.equal(E.T.h.truco.level, 2);
  go(E, 0, { t: 'mazo' });
  assert.deepEqual(E.T.scores, [0, 3]);
});

test('envido: cadena con real, querido, no querido y falta', () => {
  const hands = [['7e', '6e', '1o'], ['7c', '5b', '4o']]; // 33 contra 7
  const A = scene(hands);
  assert.deepEqual(A.T.legal(0).envido, ['envido', 'real', 'falta']);
  go(A, 0, { t: 'envido', kind: 'envido' });
  assert.equal(A.T.actor(), 1);
  assert.deepEqual(A.T.legal(1).envido, ['envido', 'real', 'falta']);
  assert.ok(!A.T.legal(1).play, 'hay que contestar antes de jugar');
  go(A, 1, { t: 'envido', kind: 'envido' });
  assert.deepEqual(A.T.legal(0).envido, ['real', 'falta']);
  assert.ok(!A.T.act(0, { t: 'envido', kind: 'envido' }), 'solo dos envidos');
  go(A, 0, { t: 'envido', kind: 'real' });
  assert.deepEqual(A.T.legal(1).envido, ['falta']);
  go(A, 1, { t: 'quiero' });
  assert.deepEqual(A.T.scores, [7, 0], '2 + 2 + 3 para el de 33');
  const er = A.T.h.env.result;
  assert.equal(er.yes, true);
  assert.equal(er.winner, 0);
  assert.deepEqual(er.said, [{ seat: 0, pts: 33 }, { seat: 1, pts: 7, buenas: true }], 'el segundo dice "son buenas" y se ven sus puntos');
  assert.equal(A.T.legal(0).envido.length, 0, 'ya se jugó el envido');
  assert.ok(A.T.legal(0).play, 'y sigue la mano');
  // no querido: lo de antes del último canto (o 1 si fue el primero)
  const B = scene(hands);
  go(B, 0, { t: 'envido', kind: 'envido' });
  go(B, 1, { t: 'noquiero' });
  assert.deepEqual(B.T.scores, [1, 0]);
  const C = scene(hands);
  go(C, 0, { t: 'envido', kind: 'envido' });
  go(C, 1, { t: 'envido', kind: 'real' });
  go(C, 0, { t: 'noquiero' });
  assert.deepEqual(C.T.scores, [0, 2], 'no quiso el real: se lleva el envido que sí quiso');
  // los puntos que se dicen: el que pierde dice sus puntos solo si gana el otro
  const D = scene([['7c', '5b', '4o'], ['7e', '6e', '1o']]); // 7 contra 33: gana el segundo
  go(D, 0, { t: 'envido', kind: 'envido' });
  go(D, 1, { t: 'quiero' });
  assert.deepEqual(D.T.scores, [0, 2]);
  assert.deepEqual(D.T.h.env.result.said, [{ seat: 0, pts: 7 }, { seat: 1, pts: 33, buenas: false }], 'el mano dice 7 y el otro lo supera con 33');
  // falta envido querida: todo lo que falta (acá, la partida)
  const E = scene(hands);
  go(E, 0, { t: 'envido', kind: 'falta' });
  go(E, 1, { t: 'quiero' });
  assert.equal(E.T.phase, 'over');
  assert.equal(E.T.result.winner, 0);
  assert.deepEqual(E.T.scores, [30, 0]);
});

test('envido: solo antes de tirar la primera carta propia; el que lleva la mano a la segunda no puede', () => {
  const S = scene([['7e', '6e', '1o'], ['7c', '5b', '4o']]);
  const { T } = S;
  assert.equal(T.legal(0).envido.length, 3);
  go(S, 0, { t: 'play', card: '7e' });
  assert.equal(T.actor(), 1);
  assert.equal(T.legal(1).envido.length, 3, 'el segundo todavía no tiró');
  go(S, 1, { t: 'play', card: '7c' });
  assert.equal(T.h.bazas.length, 2);
  assert.equal(T.legal(T.actor()).envido.length, 0, 'en la segunda baza ya no');
  assert.ok(!T.act(T.actor(), { t: 'envido', kind: 'envido' }));
});

test('el envido está primero: contra el truco se contesta con envido y después se responde el truco', () => {
  const S = scene([['7e', '6e', '1o'], ['7c', '5b', '4o']]);
  const { T } = S;
  go(S, 0, { t: 'truco' });
  assert.equal(T.legal(1).envido.length, 3, 'todavía no jugó su primera carta');
  go(S, 1, { t: 'envido', kind: 'envido' });
  assert.equal(T.h.pending.kind, 'envido');
  assert.equal(T.actor(), 0, 'le toca contestar al del truco');
  go(S, 0, { t: 'quiero' });
  assert.deepEqual(T.scores, [2, 0], 'el envido se jugó y lo ganó el de 33');
  assert.equal(T.h.pending.kind, 'truco', 'vuelve el truco que estaba esperando');
  assert.equal(T.actor(), 1);
  go(S, 1, { t: 'quiero' });
  assert.equal(T.h.truco.level, 1);
  assert.equal(T.h.truco.owner, 1);
  // y no se puede cantar envido con el truco ya querido
  assert.equal(T.legal(T.actor()).envido.length, 0);
});

test('flor: se canta sola, anula el envido y se cobra al terminar la primera baza', () => {
  const S = scene([['1e', '5e', '12e'], ['3b', '4o', '6c']], { flor: true });
  const { T } = S;
  assert.ok(T.log.some((e) => e.k === 'call' && e.what === 'flor' && e.seat === 0), 'cantó flor sin que lo pida');
  assert.equal(T.legal(0).envido.length, 0, 'la flor anula el envido');
  assert.equal(T.h.env.state, 'void');
  go(S, 0, { t: 'play', card: '12e' });
  go(S, 1, { t: 'play', card: '3b' });
  const fl = T.log.find((e) => e.k === 'flor');
  assert.ok(fl);
  assert.equal(fl.pts, 3);
  assert.equal(fl.winner, 0);
  assert.deepEqual(T.scores, [3, 0]);
  // flor contra flor: gana la mejor y se lleva 6
  const B = scene([['1e', '5e', '12e'], ['2b', '3b', '7b']], { flor: true });
  go(B, 0, { t: 'play', card: '1e' });
  go(B, 1, { t: 'play', card: '2b' });
  assert.deepEqual(B.T.scores, [0, 6]);
  // sin flor en la partida, se juega el envido de siempre
  const C = scene([['1e', '5e', '12e'], ['3b', '4o', '6c']], { flor: false });
  assert.ok(!C.T.log.some((e) => e.what === 'flor'));
  assert.equal(C.T.legal(0).envido.length, 3);
  // una mano que se entrega al toque cobra igual la flor
  const D = scene([['1e', '5e', '12e'], ['3b', '4o', '6c']], { flor: true });
  go(D, 0, { t: 'mazo' });
  assert.deepEqual(D.T.scores, [3, 1], '3 de la flor y 1 de la mano');
});

test('la partida termina al llegar al tanteo, una sola vez y sin pasarse', () => {
  const S = scene([['1e', '2o', '4c'], ['3b', '4o', '6c']], { target: 15 });
  const { T, io } = S;
  for (let k = 0; k < 40 && T.phase === 'play'; k++) {
    const a = T.actor();
    if (a === 0) {
      go(S, 0, { t: 'truco' });
      go(S, 1, { t: 'noquiero' });
    } else go(S, 1, { t: 'mazo' });
    if (T.phase === 'play') {
      io.runNext(['next']);
      io.settle(T);
    }
  }
  assert.equal(T.phase, 'over');
  assert.deepEqual(T.scores, [15, 0]);
  assert.equal(io.overCalls, 1);
  assert.equal(T.result.winner, 0);
  assert.deepEqual(io.standings.map((s) => [s.seat, s.won]), [[0, true], [1, false]]);
  assert.ok(!T.act(0, { t: 'play', card: '1e' }), 'terminada');
  assert.equal(T.actor(), -1);
  // el envido grande que pasa del tanteo queda en el tanteo
  const F = scene([['7e', '6e', '1o'], ['7c', '5b', '4o']], { target: 15 });
  F.T.scores[0] = 13;
  go(F, 0, { t: 'envido', kind: 'real' });
  go(F, 1, { t: 'quiero' });
  assert.equal(F.T.scores[0], 15);
  assert.equal(F.T.phase, 'over');
});

test('de a cuatro: el primer truco lo contesta el pie rival (por el envido) y las bazas son por equipo', () => {
  const hands = [['7e', '12c', '5c'], ['3b', '4o', '6c'], ['1o', '2o', '10e'], ['11b', '12b', '4e']];
  const S = scene(hands);
  const { T } = S;
  go(S, 0, { t: 'truco' });
  assert.equal(T.actor(), 3, 'contesta el pie del otro equipo, que todavía puede cantar el envido');
  go(S, 3, { t: 'quiero' });
  // baza 0: 0 juega 7e, 1 juega 3b, 2 juega 1o, 3 juega 4e → gana el 7e (equipo 0)
  go(S, 0, { t: 'play', card: '7e' });
  go(S, 1, { t: 'play', card: '3b' });
  go(S, 2, { t: 'play', card: '1o' });
  go(S, 3, { t: 'play', card: '12b' });
  assert.equal(T.h.bazas[0].res, 0);
  assert.equal(T.h.bazas[0].win, 0);
  assert.equal(T.actor(), 0);
  // el equipo que no quiso el truco último (1 y 3) es el que puede subir; el 0 y el 2 no
  assert.equal(T.legal(0).truco, null);
  assert.equal(T.seats[0].team, 0);
  assert.equal(T.seats[3].team, 1);
  // las bazas se ganan por equipo: el compañero (2) también cuenta
  go(S, 0, { t: 'play', card: '12c' });
  go(S, 1, { t: 'play', card: '4o' });
  go(S, 2, { t: 'play', card: '2o' });
  go(S, 3, { t: 'play', card: '11b' });
  const bz = T.log.filter((e) => e.k === 'baza');
  assert.equal(bz.length, 2);
  assert.deepEqual([bz[1].team, bz[1].seat], [0, 2], 'el 2 de oros del compañero mata al 12 de copas');
  assert.deepEqual(T.scores, [2, 0], 'dos bazas del equipo con el truco querido: 2 puntos');
});

test('pies: el último de cada equipo en la primera (de a cuatro, el que repartió y el compañero del mano)', () => {
  assert.deepEqual([pieOf(0, 0, 4), pieOf(1, 0, 4)], [2, 3]);
  assert.deepEqual([pieOf(0, 1, 4), pieOf(1, 1, 4)], [0, 3], 'mano el 1: reparte el 0, que es el pie de su equipo');
  assert.deepEqual([pieOf(0, 3, 4), pieOf(1, 3, 4)], [2, 1]);
  assert.deepEqual([pieOf(0, 0, 2), pieOf(1, 0, 2)], [0, 1], 'mano a mano, cada uno es su pie');
  assert.ok(isPie(2, 0, 4) && isPie(3, 0, 4) && !isPie(0, 0, 4) && !isPie(1, 0, 4));
});

test('mazo: en la primera, con el envido sin jugar, el otro se lleva 1 más; después, lo que vale la mano', () => {
  const hands = [['7e', '6e', '1o'], ['7c', '5b', '4o']];
  // el mano se va sin tirar: 2
  const A = scene(hands);
  go(A, 0, { t: 'mazo' });
  assert.deepEqual(A.T.scores, [0, 2]);
  const ev = lastEv(A.T, 'hand');
  assert.deepEqual([ev.pts, ev.env, ev.why], [2, 1, 'mazo'], 'el resumen dice que 1 es del envido');
  // el pie se va después de que tiró el mano, sin tirar él: también 2
  const B = scene(hands);
  go(B, 0, { t: 'play', card: '1o' });
  go(B, 1, { t: 'mazo' });
  assert.deepEqual(B.T.scores, [2, 0]);
  // en la segunda baza ya no hay envido: 1
  const C = scene(hands);
  go(C, 0, { t: 'play', card: '7e' });
  go(C, 1, { t: 'play', card: '4o' });
  go(C, C.T.actor(), { t: 'mazo' });
  assert.deepEqual(C.T.scores, [0, 1]);
  assert.equal(lastEv(C.T, 'hand').env, 0);
  // con el envido ya jugado, el mazo en la primera entrega solo la mano
  const D = scene(hands);
  go(D, 0, { t: 'envido', kind: 'envido' });
  go(D, 1, { t: 'noquiero' });
  assert.deepEqual(D.T.scores, [1, 0]);
  go(D, 0, { t: 'mazo' });
  assert.deepEqual(D.T.scores, [1, 1]);
  // con el truco querido (ya no se puede cantar el envido): lo que vale el truco, sin el punto del envido
  const E = scene(hands);
  go(E, 0, { t: 'truco' });
  go(E, 1, { t: 'quiero' });
  go(E, 0, { t: 'mazo' });
  assert.deepEqual(E.T.scores, [0, 2]);
  // con flor en la mesa no hay envido que perder: la flor se cobra y el mazo vale 1
  const F = scene([['7e', '6e', '1e'], ['7c', '5b', '4o']], { flor: true });
  go(F, 0, { t: 'play', card: '1e' });
  go(F, 1, { t: 'mazo' });
  assert.deepEqual(F.T.scores, [3 + 1, 0], 'flor 3 y mazo 1');
  // de a cuatro: el mano se va antes de tirar y el envido de su pareja no se jugó: 2
  const G = scene([['7e', '12c', '5c'], ['3b', '4o', '6c'], ['1o', '2o', '10e'], ['11b', '12b', '4e']]);
  go(G, 0, { t: 'mazo' });
  assert.deepEqual(G.T.scores, [0, 2]);
});

test('de a cuatro: el envido lo cantan y lo contestan solo los pies', () => {
  const hands = [['7e', '6e', '1o'], ['7c', '5c', '4o'], ['3b', '2b', '11o'], ['12e', '6b', '4c']];
  const S = scene(hands);
  const { T } = S;
  // mano 0, reparte el 3: los pies son el 2 (compañero del mano) y el 3
  assert.equal(T.actor(), 0);
  assert.deepEqual(T.legal(0).envido, [], 'el mano no canta el envido');
  assert.ok(!T.act(0, { t: 'envido', kind: 'envido' }));
  go(S, 0, { t: 'play', card: '1o' });
  assert.deepEqual(T.legal(1).envido, [], 'el que sigue tampoco (no es pie)');
  go(S, 1, { t: 'play', card: '4o' });
  assert.equal(T.legal(2).envido.length, 3, 'el compañero del mano es pie');
  go(S, 2, { t: 'play', card: '11o' });
  assert.equal(T.legal(3).envido.length, 3, 'el que repartió es pie');
  go(S, 3, { t: 'envido', kind: 'envido' });
  assert.equal(T.actor(), 2, 'lo contesta el pie del otro equipo (aunque ya tiró)');
  go(S, 2, { t: 'envido', kind: 'real' });
  assert.equal(T.actor(), 3);
  go(S, 3, { t: 'quiero' });
  // el 0 tiene 33 (7 y 6 de espadas) y gana su pareja: envido 2 + real 3
  assert.deepEqual(T.scores, [5, 0]);
  // la seña: mientras se puede cantar, cada uno ve los puntos de su compañero (y nada mientras no hay envido)
  const V = scene(hands);
  assert.equal(V.T.view(2).hand.partnerEnv, 33);
  assert.equal(V.T.view(3).hand.partnerEnv, envido(hands[1]));
  assert.equal(scene([['7e', '6e', '1o'], ['7c', '5b', '4o']]).T.view(1).hand.partnerEnv, null, 'mano a mano no hay seña');
});

test('de a cuatro: contra el primer truco, el pie rival canta el envido y después se sigue con el truco', () => {
  const hands = [['7e', '6e', '1o'], ['7c', '5c', '4o'], ['3b', '2b', '11o'], ['12e', '6b', '4c']];
  const S = scene(hands);
  const { T } = S;
  go(S, 0, { t: 'truco' });
  assert.equal(T.actor(), 3, 'el truco lo contesta el pie rival');
  assert.equal(T.legal(3).envido.length, 3, 'y puede cantar el envido: está primero');
  go(S, 3, { t: 'envido', kind: 'envido' });
  assert.equal(T.actor(), 2, 'el envido lo contesta el pie del equipo del truco');
  go(S, 2, { t: 'quiero' });
  assert.deepEqual(T.scores, [2, 0]);
  assert.equal(T.h.pending.kind, 'truco');
  assert.equal(T.actor(), 3, 'vuelve el truco al pie que lo tenía que contestar');
  go(S, 3, { t: 'quiero' });
  // después de la primera baza, el truco lo contesta el que sigue
  const R = scene(hands);
  go(R, 0, { t: 'play', card: '7e' });
  go(R, 1, { t: 'play', card: '7c' });
  go(R, 2, { t: 'play', card: '11o' });
  go(R, 3, { t: 'play', card: '4c' });
  assert.equal(R.T.actor(), 0);
  go(R, 0, { t: 'truco' });
  assert.equal(R.T.actor(), 1);
  // si el pie rival ya tiró en la primera, contesta el que sigue
  const Q = scene(hands);
  go(Q, 0, { t: 'play', card: '1o' });
  go(Q, 1, { t: 'play', card: '4o' });
  go(Q, 2, { t: 'play', card: '11o' });
  go(Q, 3, { t: 'truco' });
  assert.equal(Q.T.actor(), 0, 'el pie del otro equipo (2) ya tiró: contesta el que sigue');
  assert.deepEqual(Q.T.legal(0).envido, []);
});

test('tiempo: si se le acaba el turno juega la compu por él y el ausente juega solo hasta que vuelve', () => {
  const io = fakeIo();
  const T = new Table({ seats: seats(2), opts: { target: 30, first: 0, turnMs: 30000 }, io, rng: mulberry(3), dealFn: () => deckFor([['7e', '6e', '1o'], ['7c', '5b', '4o']]) });
  T.start();
  io.settle(T);
  assert.ok(io.timers.has('turn'), 'hay reloj para el que juega');
  assert.ok(T.deadline > 0);
  const before = T.log.length;
  io.runNext(['turn']);
  assert.ok(T.log.length > before, 'la compu hizo algo por él');
  // ausente
  const io2 = fakeIo();
  const T2 = new Table({ seats: seats(2), opts: { target: 30, first: 0 }, io: io2, rng: mulberry(4), botRng: mulberry(9), dealFn: () => deckFor([['7e', '6e', '1o'], ['7c', '5b', '4o']]) });
  T2.start();
  io2.settle(T2);
  assert.ok(!io2.timers.has('bot'));
  T2.setAway(0, true);
  assert.ok(io2.timers.has('bot'), 'el ausente juega la compu');
  const n = T2.log.length;
  io2.runNext(['bot']);
  assert.ok(T2.log.length > n);
  assert.equal(T2.view(1).seats[0].away, true);
  T2.setAway(0, false);
  assert.equal(T2.view(1).seats[0].away, false);
  // si se va, queda la compu en su lugar
  T2.toBot(1);
  assert.ok(T2.seats[1].bot > 0);
});

/**
 * Juega una partida entera con la compu en todos los asientos (sin esperas): cada jugada tiene que ser válida.
 * `human` ({ seat, play(view) → mensaje }) pone una persona scripteada en un asiento.
 */
function botGame({ n = 2, levels = [2, 2, 2, 2], target = 15, flor = false, seed = 1, human = null, onEvent = null }) {
  const io = fakeIo();
  const rng = mulberry(seed);
  const T = new Table({ seats: seats(n).map((s, i) => ({ ...s, bot: human?.seat === i ? 0 : levels[i] })), opts: { target, flor }, io, rng, botRng: mulberry(seed + 77) });
  const push = T.push.bind(T);
  T.push = (e) => {
    push(e);
    onEvent?.(e);
  };
  T.start();
  let steps = 0;
  for (; steps < 6000 && T.phase === 'play'; steps++) {
    const a = T.actor();
    if (a < 0) {
      assert.ok(io.runNext(['resume', 'next']), 'siempre hay algo que esperar');
      continue;
    }
    const view = JSON.parse(JSON.stringify(T.view(a)));
    const msg = human?.seat === a ? human.play(view) : decide(view, levels[a], rng);
    assert.ok(msg && T.act(a, msg), `la jugada del ${a} (${JSON.stringify(msg)}) tiene que ser válida: ${JSON.stringify(T.legal(a))}`);
  }
  return { T, io, steps };
}

test('la compu juega partidas completas con jugadas siempre válidas (1 vs 1, 2 vs 2, con y sin flor, tres niveles)', () => {
  const cfgs = [];
  for (const level of [1, 2, 3]) for (const flor of [false, true]) for (const n of [2, 4]) cfgs.push({ n, level, flor });
  for (const [k, c] of cfgs.entries()) {
    const { T, io, steps } = botGame({ n: c.n, levels: [c.level, c.level, c.level, c.level], flor: c.flor, target: c.n === 4 ? 15 : 30, seed: 10 + k });
    assert.equal(T.phase, 'over', `terminó (${JSON.stringify(c)}) en ${steps} pasos`);
    const w = T.result.winner;
    assert.equal(T.scores[w], T.opts.target);
    assert.ok(T.scores[1 - w] < T.opts.target);
    assert.equal(io.overCalls, 1);
  }
});

test('la compu canta, sube, quiere, no quiere y se va al mazo (no es de una sola nota)', () => {
  const seen = {};
  const count = (e) => {
    if (e.k === 'call') seen[e.what] = (seen[e.what] || 0) + 1;
    if (e.k === 'answer') seen[`${e.what}:${e.yes ? 'quiero' : 'no'}`] = (seen[`${e.what}:${e.yes ? 'quiero' : 'no'}`] || 0) + 1;
    if (e.k === 'mazo') seen.mazo = (seen.mazo || 0) + 1;
    if (e.k === 'hand') seen[`fin:${e.why}`] = (seen[`fin:${e.why}`] || 0) + 1;
  };
  for (let g = 0; g < 8; g++) botGame({ n: 2, levels: [2, 2], target: 15, seed: 200 + g, onEvent: count });
  for (const k of ['truco', 'retruco', 'envido', 'real', 'truco:quiero', 'truco:no', 'envido:quiero', 'envido:no', 'fin:bazas', 'fin:noquiero']) assert.ok(seen[k] > 0, `vio ${k} (${JSON.stringify(seen)})`);
});

test('la compu les gana a los que siempre quieren y a los que nunca quieren, en los dos niveles altos', () => {
  const lowest = (view) => view.hand.mine.slice().sort((a, b) => power(a) - power(b))[0];
  const highest = (view) => view.hand.mine.slice().sort((a, b) => power(b) - power(a))[0];
  const calling = (view) => (view.can.quiero ? { t: 'quiero' } : { t: 'play', card: lowest(view) });
  const coward = (view) => (view.can.quiero ? { t: 'noquiero' } : { t: 'play', card: highest(view) });
  for (const level of [2, 3]) {
    for (const [name, play] of [['siempre quiere', calling], ['nunca quiere', coward]]) {
      let wins = 0;
      const N = 14;
      for (let g = 0; g < N; g++) {
        const { T } = botGame({ n: 2, levels: [0, level], target: 15, seed: 500 + g, human: { seat: 0, play } });
        if (T.result.winner === 1) wins++;
      }
      assert.ok(wins >= 11, `nivel ${level} contra el que ${name}: ${wins}/${N}`);
    }
  }
});

test('el truco del día: las mismas cartas para todos y la misma partida con las mismas jugadas', () => {
  const day = '2026-10-27';
  const deal = (k) => shuffled(DECK, seeded(`truco:${day}:${k}`));
  assert.deepEqual(deal(0), deal(0));
  assert.notDeepEqual(deal(0), deal(1));
  assert.notDeepEqual(shuffled(DECK, seeded('truco:2026-10-28:0')), deal(0));
  // dos mesas con lo mismo (cartas, suerte de la compu) y las mismas jugadas dan el mismo resultado
  const run = () => {
    const io = fakeIo();
    const T = new Table({ seats: [{ id: 'me', name: 'Vos', color: '#fff', bot: 0 }, { id: 'b', name: 'Don Mate', color: '#fff', bot: 2 }], opts: { target: 15, flor: false, first: 0 }, io, rng: mulberry(1), dealFn: (k) => deal(k), botRng: seeded(`truco:${day}:compu`) });
    T.start();
    for (let s = 0; s < 3000 && T.phase === 'play'; s++) {
      const a = T.actor();
      if (a < 0) {
        io.runNext(['resume', 'next']);
        continue;
      }
      const v = T.view(a);
      if (a === 0) {
        if (v.can.quiero) T.act(0, { t: 'quiero' });
        else T.act(0, { t: 'play', card: v.hand.mine.slice().sort((x, y) => power(y) - power(x))[0] });
      } else io.runNext(['bot']);
    }
    return { scores: T.scores.slice(), hands: T.handNum, log: T.log.map((e) => e.k).join('') };
  };
  assert.deepEqual(run(), run());
});

test('cartas: las 40 y el dorso se dibujan (SVG válido, distinto cada una)', () => {
  const svgs = DECK.map(cardSVG);
  assert.equal(new Set(svgs).size, 40);
  for (const s of svgs) assert.ok(s.startsWith('<svg') && s.endsWith('</svg>') && s.includes('viewBox'));
  assert.ok(backSVG().startsWith('<svg'));
  // cada espada tiene una hoja: el ancho una sola (la grande) y del 2 al 7, tantas como el número
  const blades = (c) => cardSVG(c).split('fill="#36aee4"').length - 1;
  for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.equal(blades(`${n}e`), n, `${n} de espadas`);
  assert.equal(blades('1e'), 1);
});

test('servidor: valida los ajustes, pide dos personas, reparte sin mostrar las cartas ajenas y completa con la compu', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'truco', name: 'Ana' });
    await wait(150);
    const code = a.last('joined').code;
    a.send({ t: 'start' });
    await wait(150);
    assert.equal(a.last('error')?.code, 'need_players');
    a.send({ t: 'settings', settings: { n: 4, pair: 1, target: 15, flor: 1, level: 3 } });
    await wait(100);
    const st = a.last('room').room.settings;
    assert.deepEqual(st, { n: 4, pair: 1, target: 15, flor: 1, level: 3 });
    a.send({ t: 'settings', settings: { n: 3, target: 99, level: 'x', pair: 7 } });
    await wait(100);
    assert.deepEqual(a.last('room').room.settings, st, 'valores raros se ignoran');
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'truco', code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(500);
    const va = a.last('g')?.s, vb = b.last('g')?.s;
    assert.ok(va && vb, 'llegó la mesa a los dos');
    assert.equal(va.n, 4);
    assert.equal(va.target, 15);
    assert.equal(va.flor, true);
    // parejas juntas: Ana en el 0 y Beto en el 2 (compañeros); la compu en el 1 y el 3
    assert.equal(va.me, 0);
    assert.equal(vb.me, 2);
    assert.deepEqual(va.seats.map((s) => [s.name, !!s.bot]), [['Ana', false], ['Cacho', true], ['Beto', false], ['Pocha', true]]);
    assert.equal(va.hand.mine.length, 3);
    assert.equal(vb.hand.mine.length, 3);
    // privacidad: lo del otro no viaja
    const ja = JSON.stringify(va), jb = JSON.stringify(vb);
    for (const c of vb.hand.mine) assert.ok(!ja.includes(`"${c}"`), `Ana no ve ${c}`);
    for (const c of va.hand.mine) assert.ok(!jb.includes(`"${c}"`), `Beto no ve ${c}`);
    // una jugada mal formada o fuera de turno no rompe nada
    b.send({ t: 'play', card: 'zz' });
    b.send({ t: 'envido', kind: 'inventado' });
    b.send({ t: 'truco', extra: true });
    a.send({ t: 'noquiero' });
    a.send({ t: 'play', card: vb.hand.mine[0] });
    await wait(200);
    assert.ok(a.last('g').s.hand.mine.length === 3, 'lo ajeno no cambia mi mano');
    // los dos juegan lo que haga falta hasta que Ana tira una carta: todos la ven
    let card = null;
    for (let k = 0; k < 60 && !card; k++) {
      for (const [c, who] of [[a, 'a'], [b, 'b']]) {
        const v = c.last('g').s;
        if (v.hand.actor !== v.me) continue;
        if (v.can.quiero) c.send({ t: 'quiero' });
        else if (v.can.play) {
          const pick = v.hand.mine[0];
          c.send({ t: 'play', card: pick });
          if (who === 'a') card = pick;
        }
      }
      await wait(300);
    }
    assert.ok(card, 'Ana llegó a jugar una carta');
    await wait(300);
    assert.ok(JSON.stringify(b.last('g').s).includes(`"${card}"`), 'Beto ve lo que jugó Ana');
    assert.ok(a.last('g').s.hand.bazas.some((bz) => bz.plays.some((p) => p.card === card && p.seat === 0)));
    // si Beto se desconecta, juega la compu por él y los demás lo ven ausente
    b.ws.close();
    await wait(400);
    assert.equal(a.last('g').s.seats[2].away, true);
    a.ws.close();
  } finally {
    srv.stop();
  }
});

test('servidor: con tres personas y mano a mano avisa que son demasiadas', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'truco', name: 'Ana' });
    await wait(150);
    const code = a.last('joined').code;
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'truco', code, name: 'Beto' });
    const c = await connect(srv.port);
    c.send({ t: 'join', game: 'truco', code, name: 'Cata' });
    await wait(200);
    a.send({ t: 'start' });
    await wait(200);
    assert.equal(a.last('error')?.code, 'too_many');
    a.send({ t: 'settings', settings: { n: 4 } });
    await wait(100);
    a.send({ t: 'start' });
    await wait(400);
    const v = a.last('g')?.s;
    assert.ok(v, 'de a cuatro entran los tres');
    assert.equal(v.seats.filter((s) => s.bot).length, 1, 'completa un lugar con la compu');
    a.ws.close();
    b.ws.close();
    c.ws.close();
  } finally {
    srv.stop();
  }
});
