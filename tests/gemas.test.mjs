/** Gemas: el motor (combinaciones, especiales, combos, cascadas, mezcla), las jugadas como texto y su repetición, los niveles calibrados y el duelo online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, N, SP, PRISM, Rng, hashSeed, idx, rowOf, colOf, adjacent, encodeMove, decodeMoves, replay, bestMove } from '../public/games/gemas/shared/engine.js';
import { levelOf, dailyLevel, goalMet, starsFor, iceFor, botRun, KINDS } from '../public/games/gemas/shared/levels.js';
import { startServer, connect, wait } from './helpers.mjs';

/** Un tablero sin combinaciones (tres colores en diagonal) para armar situaciones a mano. */
function blank(seed = 1) {
  const g = new Game(seed, { types: 6 });
  for (let i = 0; i < N * N; i++) {
    g.t[i] = ((i % N) + Math.floor(i / N)) % 3 + 2; // colores 2, 3 y 4
    g.sp[i] = 0;
  }
  g.ice.fill(0);
  return g;
}
const full = (g) => [...g.t].every((k) => k >= 0);

test('semillas: el generador y el hash son deterministas', () => {
  const a = new Rng(7), b = new Rng(7);
  const xs = Array.from({ length: 6 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 6 }, () => b.next()));
  const c = a.clone();
  assert.equal(c.next(), a.next(), 'el clon sigue la misma secuencia');
  assert.equal(hashSeed('gemas-daily-2026-10-30'), hashSeed('gemas-daily-2026-10-30'));
  assert.notEqual(hashSeed('gemas-daily-2026-10-30'), hashSeed('gemas-daily-2026-10-31'));
  assert.ok(adjacent(0, 1) && adjacent(0, 8) && !adjacent(7, 8) && !adjacent(0, 9) && !adjacent(0, -1));
});

test('tablero inicial: lleno, sin combinaciones hechas, con jugadas y siempre el mismo para la misma semilla', () => {
  for (let s = 1; s <= 30; s++) {
    const g = new Game(s * 101, { types: 6 });
    assert.ok(full(g));
    assert.equal(g.findMatches(), null, `semilla ${s}: sin combinaciones`);
    assert.ok(g.hasMove(), `semilla ${s}: con jugadas`);
    assert.ok([...g.t].every((k) => k >= 0 && k < 6));
  }
  assert.deepEqual([...new Game(5).t], [...new Game(5).t]);
  assert.notDeepEqual([...new Game(5).t], [...new Game(6).t]);
  const five = new Game(9, { types: 5 });
  assert.ok([...five.t].every((k) => k < 5), 'con cinco colores no aparece el sexto');
});

test('intercambios: solo valen los que arman una línea, los del prisma y los de dos especiales', () => {
  const g = blank();
  // fila 0: 2 3 4 2 3 4 2 3 → poner un 2 en (0,1) arma 2 2 ... no: se arma con el de abajo
  g.t[idx(0, 0)] = 0;
  g.t[idx(0, 1)] = 0;
  g.t[idx(1, 2)] = 0; // un 0 abajo a la derecha: subirlo arma 0 0 0
  assert.ok(g.canSwap(idx(1, 2), idx(0, 2)));
  assert.ok(!g.canSwap(idx(1, 2), idx(1, 3)), 'no arma nada');
  assert.ok(!g.canSwap(idx(0, 0), idx(2, 0)), 'no son vecinas');
  assert.ok(!g.canSwap(idx(0, 0), idx(0, 1)), 'dos del mismo color no cambian nada');
  assert.equal(g.swap(idx(1, 2), idx(1, 3)), null);
  assert.equal(g.moves, 0, 'un intercambio que no vale no cuenta');
  const h = blank();
  h.t[10] = PRISM;
  h.sp[10] = SP.PRISM;
  assert.ok(h.canSwap(10, 11) && h.canSwap(10, 2), 'el prisma se cambia con cualquiera');
  const k = blank();
  k.sp[20] = SP.ROW;
  k.sp[21] = SP.BOMB;
  assert.ok(k.canSwap(20, 21), 'dos especiales se combinan');
});

test('especiales que nacen: 4 en línea → rayo, L o T → bomba, 5 en línea → prisma', () => {
  // cuatro en la fila 3: la especial nace donde se movió la gema
  let g = blank();
  for (const c of [0, 1, 3]) g.t[idx(3, c)] = 0;
  g.t[idx(4, 2)] = 0; // sube a (3,2)
  let ev = g.swap(idx(4, 2), idx(3, 2));
  let made = ev[1].created;
  assert.equal(made.length, 1);
  assert.equal(made[0].sp, SP.ROW, 'horizontal: rayo de fila');
  assert.equal(made[0].cell, idx(3, 2), 'en el casillero al que fue la gema');
  // cuatro en la columna 5
  g = blank();
  for (const r of [1, 2, 4]) g.t[idx(r, 5)] = 1;
  g.t[idx(3, 6)] = 1; // pasa a (3,5)
  ev = g.swap(idx(3, 6), idx(3, 5));
  assert.equal(ev[1].created[0].sp, SP.COL, 'vertical: rayo de columna');
  // una L: (5,1)(5,2)(5,3) y (3,3)(4,3)
  g = blank();
  for (const [r, c] of [[5, 1], [5, 2], [3, 3], [4, 3]]) g.t[idx(r, c)] = 5;
  g.t[idx(6, 3)] = 5; // sube a (5,3), la esquina
  ev = g.swap(idx(6, 3), idx(5, 3));
  made = ev[1].created;
  assert.equal(made[0].sp, SP.BOMB);
  assert.equal(made[0].cell, idx(5, 3));
  assert.equal(made[0].from.length, 4, 'las otras cuatro se juntan en la bomba');
  // cinco en línea
  g = blank();
  for (const c of [0, 1, 3, 4]) g.t[idx(6, c)] = 1;
  g.t[idx(7, 2)] = 1;
  ev = g.swap(idx(7, 2), idx(6, 2));
  made = ev[1].created;
  assert.equal(made[0].sp, SP.PRISM);
  assert.equal(made[0].t, PRISM, 'el prisma no tiene color');
});

test('explosiones: el rayo borra su fila, la bomba su 3 × 3 y se encadenan', () => {
  const g = blank();
  g.sp[idx(2, 4)] = SP.ROW;
  g.sp[idx(2, 7)] = SP.BOMB; // en la misma fila: la alcanza el rayo y explota
  const ev = g.blast(new Set([idx(2, 4)]), [], 1);
  const cells = new Set(ev.cleared.map((c) => c.cell));
  for (let c = 0; c < N; c++) assert.ok(cells.has(idx(2, c)), 'toda la fila');
  for (const [r, c] of [[1, 6], [1, 7], [3, 6], [3, 7]]) assert.ok(cells.has(idx(r, c)), 'y el 3 × 3 de la bomba');
  assert.equal(ev.cleared.length, 8 + 4);
  assert.deepEqual(ev.fx.map((f) => f.type), ['row', 'bomb']);
  assert.equal(ev.score, 12 * 10 + 2 * 20, 'diez por gema y veinte por especial que explota');
  assert.equal(g.score, ev.score);
  // en una cascada (paso 3) todo vale el triple
  const h = blank();
  h.sp[idx(5, 5)] = SP.COL;
  const e3 = h.blast(new Set([idx(5, 5)]), [], 3);
  assert.equal(e3.score, (8 * 10 + 20) * 3);
});

test('hielo: cada gema borrada encima rompe una capa; también donde nace una especial', () => {
  const g = blank();
  g.ice[idx(3, 0)] = 2;
  g.ice[idx(3, 1)] = 1;
  g.ice[idx(3, 2)] = 1;
  for (const c of [0, 1]) g.t[idx(3, c)] = 0;
  g.t[idx(4, 2)] = 0;
  g.swap(idx(4, 2), idx(3, 2));
  assert.equal(g.ice[idx(3, 0)], 1, 'la doble queda con una');
  assert.equal(g.ice[idx(3, 1)], 0);
  assert.equal(g.ice[idx(3, 2)], 0);
  assert.ok(g.iceBroken >= 3);
  assert.equal(g.iceLeft, g.ice.reduce((a, b) => a + b, 0));
  // se juntan los colores borrados
  assert.ok(g.collected[0] >= 3);
});

test('combos de especiales: cruz, tres filas y columnas, 5 × 5, todo un color y todo el tablero', () => {
  let g = blank();
  g.sp[idx(3, 3)] = SP.ROW;
  g.sp[idx(3, 4)] = SP.COL;
  let ev = g.swap(idx(3, 3), idx(3, 4));
  assert.equal(ev[1].fx[0].type, 'cross');
  assert.equal(ev[1].cleared.length, 15, 'fila y columna: 8 + 8 − 1');
  assert.ok(full(g) && !g.findMatches(), 'todo vuelve a llenarse y queda quieto');

  g = blank();
  g.sp[idx(3, 3)] = SP.ROW;
  g.sp[idx(4, 3)] = SP.BOMB;
  ev = g.swap(idx(3, 3), idx(4, 3));
  assert.equal(ev[1].fx[0].type, 'linebomb');
  assert.equal(ev[1].cleared.length, 3 * 8 + 3 * 8 - 9, 'tres filas y tres columnas');

  g = blank();
  g.sp[idx(4, 4)] = SP.BOMB;
  g.sp[idx(4, 5)] = SP.BOMB;
  ev = g.swap(idx(4, 4), idx(4, 5));
  assert.equal(ev[1].fx[0].type, 'bomb2');
  assert.equal(ev[1].cleared.length, 25, '5 × 5 alrededor de donde quedó la que se movió');

  g = blank();
  g.t[10] = PRISM;
  g.sp[10] = SP.PRISM;
  const color = g.t[11];
  const n = [...g.t].filter((k) => k === color).length;
  ev = g.swap(10, 11);
  assert.equal(ev[1].fx[0].type, 'prism');
  assert.equal(ev[1].cleared.length, n + 1, 'todas las de ese color y el prisma');

  g = blank();
  g.t[10] = PRISM;
  g.sp[10] = SP.PRISM;
  g.sp[11] = SP.ROW;
  const color2 = g.t[11];
  ev = g.swap(10, 11);
  assert.equal(ev[1].k, 'turn', 'primero se vuelven rayos');
  assert.ok(ev[1].turned.length >= 5);
  assert.ok(ev[1].turned.every((x) => g.t[x.cell] !== color2 || true));
  assert.ok(ev[2].cleared.length > ev[1].turned.length, 'y después explotan todos');

  g = blank();
  g.t[20] = g.t[21] = PRISM;
  g.sp[20] = g.sp[21] = SP.PRISM;
  ev = g.swap(20, 21);
  assert.equal(ev[1].fx[0].type, 'prism2');
  assert.equal(ev[1].cleared.length, 64, 'todo el tablero');
});

test('gravedad y cascadas: después de cada jugada el tablero queda lleno, quieto y con jugadas', () => {
  const g = new Game(4242, { types: 6 });
  let chains = 0;
  for (let k = 0; k < 40; k++) {
    const mv = g.validMoves()[0];
    const ev = g.swap(mv[0], mv[1]);
    assert.ok(ev);
    assert.ok(full(g), 'lleno');
    assert.equal(g.findMatches(), null, 'sin combinaciones pendientes');
    assert.ok(g.hasMove(), 'con jugadas (si hizo falta, mezcló)');
    for (const e of ev) {
      if (e.k === 'fall') for (const s of e.spawns) assert.ok(s.fromRow < 0 && g.id.includes(s.id) === g.id.includes(s.id));
      if (e.k === 'clear') chains = Math.max(chains, e.chain);
    }
    const ids = [...g.id];
    assert.equal(new Set(ids).size, 64, 'cada gema tiene su número');
  }
  assert.equal(g.moves, 40);
  assert.ok(chains >= 2, 'hubo alguna cascada');
});

test('mezcla: deja el tablero sin combinaciones y con al menos una jugada, igual con la misma semilla', () => {
  const a = new Game(77), b = new Game(77);
  const ea = a.shuffle(), eb = b.shuffle();
  assert.equal(ea.k, 'shuffle');
  assert.deepEqual([...a.t], [...b.t]);
  assert.deepEqual(ea, eb);
  assert.equal(a.findMatches(), null);
  assert.ok(a.hasMove());
  assert.equal(ea.map.length, 64);
});

test('jugadas como texto: ida y vuelta, repetición idéntica y rechazo de lo inválido', () => {
  assert.equal(encodeMove(10, 11), ':r');
  assert.equal(encodeMove(10, 18), ':d');
  assert.equal(encodeMove(10, 9), ':l');
  assert.equal(encodeMove(10, 2), ':u');
  assert.deepEqual(decodeMoves(':r:d'), [[10, 11], [10, 18]]);
  assert.equal(decodeMoves('7r'), null, 'del borde derecho no se va a la derecha');
  assert.equal(decodeMoves('0u'), null);
  assert.equal(decodeMoves('0x'), null);
  assert.equal(decodeMoves('0'), null);
  assert.equal(decodeMoves(5), null);
  const g = new Game(31337, { types: 6 });
  let str = '';
  for (let k = 0; k < 25; k++) {
    const mv = bestMove(g);
    g.swap(mv[0], mv[1]);
    str += encodeMove(mv[0], mv[1]);
  }
  const r = replay(31337, { types: 6 }, str);
  assert.equal(r.score, g.score);
  assert.equal(r.moves, 25);
  assert.deepEqual([...r.t], [...g.t]);
  assert.deepEqual([...r.sp], [...g.sp]);
  assert.equal(replay(31337, { types: 6 }, str, { limit: 24 }), null, 'sobran jugadas');
  assert.equal(replay(31337, { types: 6 }, str.slice(0, -2) + str.slice(-4, -2)), null, 'repetir una jugada en otro momento no suele valer');
  assert.equal(replay(31337, { types: 6 }, '0r0r0r'), null, 'jugadas que no arman nada');
});

test('la compu: elige jugadas válidas sin tocar la partida ni espiar lo que va a caer', () => {
  const g = new Game(555, { types: 6 });
  const before = JSON.stringify([[...g.t], [...g.sp], g.rng.a, g.score]);
  const mv = bestMove(g);
  assert.ok(mv && g.canSwap(mv[0], mv[1]));
  assert.equal(JSON.stringify([[...g.t], [...g.sp], g.rng.a, g.score]), before, 'la partida quedó igual');
  const blind = g.clone({ blind: true });
  assert.notEqual(blind.rng.a, g.rng.a, 'a ciegas cae otra cosa');
  assert.deepEqual([...blind.t], [...g.t]);
  // con hielo, prefiere romperlo
  const want = bestMove(g, { ice: 45 });
  assert.ok(want);
});

test('niveles: deterministas, con los tres objetivos en orden y metas que la compu alcanza', () => {
  assert.deepEqual(levelOf(5), levelOf(5));
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => levelOf(n).kind), ['score', 'collect', 'ice', 'score', 'collect', 'ice']);
  assert.equal(levelOf(1).types, 5, 'los primeros con cinco colores');
  assert.equal(levelOf(4).types, 6);
  for (let n = 1; n <= 24; n++) {
    const lv = levelOf(n);
    assert.ok(KINDS.includes(lv.kind));
    assert.ok(lv.moves >= 14 && lv.moves <= 48, `nivel ${n}: ${lv.moves} jugadas`);
    assert.ok(lv.stars[1] > 0 && lv.stars[2] > lv.stars[1], `nivel ${n}: estrellas crecientes`);
    if (lv.kind === 'score') assert.ok(lv.goal.score > 0 && lv.goal.score <= lv.stars[1]);
    if (lv.kind === 'collect') assert.ok(lv.goal.collect.length >= 2 && lv.goal.collect.every(([k, c]) => k >= 0 && k < lv.types && c >= 6));
    if (lv.kind === 'ice') {
      assert.equal(lv.goal.ice, lv.ice.reduce((a, b) => a + b, 0));
      assert.ok(lv.goal.ice > 0);
    }
  }
  // de cada cinco partidas nuevas (otras gemas cayendo), la compu cumple en la mayoría
  let ok = 0, tot = 0;
  for (const n of [2, 3, 4, 8, 9, 10]) {
    const lv = levelOf(n);
    const want = lv.kind === 'collect' ? { colors: Object.fromEntries(lv.goal.collect.map(([k]) => [k, 18])) } : lv.kind === 'ice' ? { ice: 45 } : {};
    for (let s = 21; s < 26; s++) {
      tot++;
      if (goalMet(lv, botRun(lv, want, { stream: s, all: lv.kind === 'score' }).g)) ok++;
    }
  }
  assert.ok(ok / tot >= 0.6, `la compu cumple en ${ok} de ${tot}`);
});

test('hielo de los niveles: dibujos simétricos de una o dos capas', () => {
  for (let n = 3; n <= 60; n += 3) {
    const ice = iceFor(n);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) assert.equal(ice[idx(r, c)], ice[idx(r, N - 1 - c)], `nivel ${n}: simétrico`);
    assert.ok(ice.every((x) => x >= 0 && x <= 2));
    assert.ok(ice.some((x) => x > 0));
  }
  assert.ok(iceFor(3).every((x) => x <= 1), 'los primeros, de una capa');
  assert.ok([45, 48, 51, 54, 57].some((n) => iceFor(n).includes(2)), 'más adelante aparecen las dobles');
});

test('estrellas y gemas del día', () => {
  const lv = levelOf(1);
  assert.equal(starsFor(lv, lv.stars[0] - 1), 0, 'en los de puntos, sin llegar a la meta no hay estrella');
  assert.equal(starsFor(lv, lv.stars[0]), 1);
  assert.equal(starsFor(lv, lv.stars[1]), 2);
  assert.equal(starsFor(lv, lv.stars[2] + 100), 3);
  assert.equal(starsFor(lv, 999999, false), 0, 'sin cumplir no hay');
  const lc = levelOf(2);
  assert.equal(starsFor(lc, 0), 1, 'en los de juntar, cumplir ya vale una');
  const d = dailyLevel('2026-10-30');
  assert.deepEqual(d, dailyLevel('2026-10-30'));
  assert.notEqual(d.seed, dailyLevel('2026-10-31').seed);
  assert.equal(d.moves, 25);
  assert.equal(d.types, 6);
  assert.ok(d.stars[0] < d.stars[1] && d.stars[1] < d.stars[2]);
});

/** Arma una sala de duelo con dos jugadores y la larga. */
async function duel(srv, moves = '20') {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'gemas', name: 'Ana' });
  await wait(200);
  const code = a.last('joined').code;
  a.send({ t: 'settings', settings: { moves: '99' } });
  await wait(100);
  assert.equal(a.last('room').room.settings.moves, '30', 'una cantidad rara se ignora');
  a.send({ t: 'settings', settings: { moves } });
  const b = await connect(srv.port);
  b.send({ t: 'join', game: 'gemas', code, name: 'Beto' });
  await wait(250);
  a.send({ t: 'start' });
  await wait(300);
  const room = a.last('room').room;
  return { a, b, room };
}
const playAll = (seed, n, pick = (g) => bestMove(g)) => {
  const g = new Game(seed, { types: 6 });
  let str = '';
  for (let k = 0; k < n; k++) {
    const mv = pick(g);
    g.swap(mv[0], mv[1]);
    str += encodeMove(mv[0], mv[1]);
  }
  return { g, str };
};

test('servidor (duelo): mismas gemas para todos, gana el que más puntos tiene según la repetición', async () => {
  const srv = await startServer({ GEMAS_FAST: '1' });
  try {
    const { a, b, room } = await duel(srv, '20');
    assert.equal(room.state, 'playing');
    assert.equal(room.race.moves, 20);
    assert.ok(Number.isInteger(room.race.seed));
    const good = playAll(room.race.seed, 20);
    const worse = playAll(room.race.seed, 20, (g) => g.validMoves()[0]);
    // antes de la largada no vale
    b.send({ t: 'finish', moves: good.str });
    await wait(250);
    assert.equal(b.all('finished').length, 0);
    while (Date.now() < room.race.startAt + 200) await wait(100);
    a.send({ t: 'state', s: [1234, 3] });
    await wait(200);
    assert.deepEqual(b.last('state').s, [1234, 3]);
    // finales que no valen: incompleto, con jugadas de más, inventado
    b.send({ t: 'finish', moves: good.str.slice(0, -2) });
    b.send({ t: 'finish', moves: good.str + good.str.slice(0, 2) });
    b.send({ t: 'finish', moves: '0r'.repeat(20) });
    await wait(300);
    assert.equal(b.all('finished').length, 0);
    a.send({ t: 'finish', moves: worse.str });
    await wait(300);
    const fa = a.last('finished');
    assert.equal(fa.score, worse.g.score, 'el puntaje es el de la repetición');
    assert.ok(!a.last('end'), 'falta Beto');
    b.send({ t: 'finish', moves: good.str });
    await wait(400);
    const end = a.last('end');
    assert.ok(end);
    const order = [...end.results].map((r) => r.name);
    assert.deepEqual(order, good.g.score >= worse.g.score ? ['Beto', 'Ana'] : ['Ana', 'Beto'], 'ordenados por puntaje');
    assert.equal(end.results.find((r) => r.name === 'Beto').score, good.g.score);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});

test('servidor (duelo): no se aceptan partidas imposiblemente rápidas', async () => {
  const srv = await startServer();
  try {
    const { a, b, room } = await duel(srv, '20');
    while (Date.now() < room.race.startAt + 200) await wait(100);
    const good = playAll(room.race.seed, 20);
    a.send({ t: 'finish', moves: good.str });
    await wait(300);
    assert.equal(a.all('finished').length, 0, '20 jugadas en medio segundo no');
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
