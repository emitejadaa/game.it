/** Chorrito: las reglas de los tubos, el generador (siempre resoluble, determinista), el resolvedor, la repetición de partidas y la carrera online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAP, MAX_COLORS, rng, hashSeed, clone, topRun, amount, pour, isSolved, doneCount, settled, legalMoves, solve, generate, encodeMoves, decodeMoves, replay, colorsFor, extraFor, levelOf, stars } from '../public/games/chorrito/shared/engine.js';
import { startServer, connect, wait } from './helpers.mjs';

const counts = (tubes) => {
  const n = new Map();
  for (const t of tubes) for (const c of t) n.set(c, (n.get(c) || 0) + 1);
  return n;
};

test('tanda de arriba: el color y cuántas capas seguidas hay', () => {
  assert.deepEqual(topRun([]), { color: -1, n: 0 });
  assert.deepEqual(topRun([3]), { color: 3, n: 1 });
  assert.deepEqual(topRun([1, 2, 2]), { color: 2, n: 2 });
  assert.deepEqual(topRun([2, 2, 1, 2]), { color: 2, n: 1 }, 'las capas de abajo del mismo color no cuentan si hay otra en el medio');
  assert.deepEqual(topRun([4, 4, 4, 4]), { color: 4, n: 4 });
});

test('trasvasar: pasa la tanda de arriba a un tubo vacío o con el mismo color arriba, hasta donde entre', () => {
  const t = [[0, 1, 1], [], [1], [0, 0, 1, 2], [2, 2, 2, 2], [1, 1, 1], [1, 1, 1]];
  assert.equal(amount(t, 0, 1), 2, 'a un tubo vacío pasan las dos');
  assert.equal(amount(t, 0, 2), 2, 'al que tiene un 1 arriba también');
  assert.equal(amount(t, 0, 0), 0, 'no a sí mismo');
  assert.equal(amount(t, 1, 0), 0, 'de un tubo vacío no hay nada');
  assert.equal(amount(t, 0, 3), 0, 'color distinto arriba');
  assert.equal(amount(t, 0, 4), 0, 'tubo lleno');
  assert.equal(amount(t, 5, 6), 1, 'solo entra una: el destino tiene tres de cuatro');
  assert.equal(amount(t, 0, 9), 0);
  assert.equal(amount(t, -1, 0), 0);
  const u = clone(t);
  assert.equal(pour(u, 5, 6), 1);
  assert.deepEqual(u[5], [1, 1]);
  assert.deepEqual(u[6], [1, 1, 1, 1]);
  assert.equal(pour(u, 0, 3), 0, 'un trasvase imposible no cambia nada');
  assert.deepEqual(u[0], [0, 1, 1]);
  assert.equal(pour(u, 0, 1), 2);
  assert.deepEqual([u[0], u[1]], [[0], [1, 1]]);
  assert.deepEqual(t[0], [0, 1, 1], 'clone: el original no se tocó');
  // la capacidad es un parámetro
  assert.equal(amount([[1, 1, 1], [1]], 0, 1, 3), 3 - 1, 'con capacidad 3 el destino solo admite 2');
  assert.equal(amount([[1, 1, 1], [1]], 0, 1, 5), 3);
});

test('resuelto: cada tubo vacío o lleno de un solo color; doneCount cuenta los completos', () => {
  assert.ok(isSolved([[0, 0, 0, 0], [], [1, 1, 1, 1]]));
  assert.ok(!isSolved([[0, 0, 0], [0], []]), 'el color partido en dos tubos no está resuelto');
  assert.ok(!isSolved([[0, 0, 0, 1], [1, 1, 1, 0]]));
  assert.ok(isSolved([[], []]));
  assert.equal(doneCount([[0, 0, 0, 0], [], [1, 1, 1], [2, 2, 2, 2]]), 2);
  assert.equal(doneCount([[0, 0, 0, 1]]), 0);
});

test('avance de la carrera: de cada color, la tanda más larga que arranca desde el fondo de un tubo', () => {
  assert.equal(settled([[0, 0, 0, 0], [], [1, 1, 1, 1]]), 8, 'resuelto: 4 por color');
  assert.equal(settled([[0, 0, 1], [1, 0, 0, 0]]), 2 + 1, 'el 0 llega a 2 en un tubo y el 1 a 1');
  assert.equal(settled([[0, 1, 0, 1], [1, 0, 1, 0], []]), 2, 'una capa por color');
  assert.equal(settled([[], []]), 0);
  assert.equal(settled([[2, 2, 3], [2, 2, 2], [3]]), 3 + 1, 'la mejor tanda de cada color, no la suma (y el 3 de arriba no cuenta)');
  // en un nivel recién generado se parte de poco y se llega a cap × colores
  const lv = generate(31, { colors: 6, extra: 2 });
  assert.ok(settled(lv.tubes) < 6 * CAP / 2);
  const done = clone(lv.tubes);
  for (const [a, b] of solve(lv.tubes, lv.cap)) pour(done, a, b, lv.cap);
  assert.equal(settled(done), 6 * CAP);
});

test('jugadas con sentido: no se ofrece mover un tubo parejo a uno vacío ni sacar de uno completo', () => {
  const t = [[0, 0, 0, 0], [1, 1], [], [1, 2]];
  const moves = legalMoves(t).map((m) => m.join('>'));
  assert.ok(!moves.some((m) => m.startsWith('0>')), 'el completo no se toca');
  assert.ok(!moves.includes('1>2'), 'el parejo a un vacío solo cambia de lugar');
  assert.ok(moves.includes('3>2'));
  assert.ok(moves.includes('3>1') === false, 'color distinto arriba (2 sobre 1)');
  assert.ok(moves.includes('1>3') === false, 'el 1 de arriba no entra en el 2');
  assert.deepEqual(legalMoves([[0, 0, 0, 0], [1, 1, 1, 1]]), []);
});

test('semillas: mismas entradas, mismas salidas', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const sa = Array.from({ length: 8 }, a), sb = Array.from({ length: 8 }, b), sc = Array.from({ length: 8 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
  assert.equal(hashSeed('chorrito-daily-2026-10-29'), hashSeed('chorrito-daily-2026-10-29'));
  assert.notEqual(hashSeed('chorrito-daily-2026-10-29'), hashSeed('chorrito-daily-2026-10-30'));
  assert.ok(Number.isInteger(hashSeed('x')) && hashSeed('x') >= 0);
});

test('generador: tubos llenos más vacíos, cada color con 4 capas, sin tubos ya completos y siempre con solución', () => {
  for (const colors of [3, 4, 6, 8, 10, MAX_COLORS]) {
    for (let k = 1; k <= 6; k++) {
      const lv = generate(1000 * colors + k, { colors, extra: 2 });
      assert.equal(lv.cap, CAP);
      assert.equal(lv.tubes.length, colors + 2);
      assert.equal(lv.tubes.filter((t) => !t.length).length, 2);
      assert.equal(lv.tubes.filter((t) => t.length === CAP).length, colors);
      const n = counts(lv.tubes);
      assert.equal(n.size, colors);
      for (const [, v] of n) assert.equal(v, CAP);
      assert.ok(lv.tubes.every((t) => t.length < CAP || !t.every((c) => c === t[0])), 'ninguno empieza completo');
      assert.ok(lv.par > 0);
      const sol = solve(lv.tubes, lv.cap);
      assert.ok(sol, `el nivel de ${colors} colores (semilla ${k}) se puede resolver`);
      const r = replay(lv.tubes, encodeMoves(sol), lv.cap);
      assert.ok(r.ok && r.solved && r.moves === sol.length);
      assert.equal(sol.length, lv.par, 'el par es lo que encontró el resolvedor');
    }
  }
  // determinista
  assert.deepEqual(generate(777, { colors: 7, extra: 2 }), generate(777, { colors: 7, extra: 2 }));
  assert.notDeepEqual(generate(777, { colors: 7, extra: 2 }).tubes, generate(778, { colors: 7, extra: 2 }).tubes);
  // los límites de colores se acotan
  assert.equal(generate(5, { colors: 99, extra: 2 }).tubes.length, MAX_COLORS + 2);
  assert.equal(generate(5, { colors: 0, extra: 1 }).tubes.length, 2 + 1);
});

test('resolvedor: ya resuelto → []; sin salida → null; con una sola jugada la encuentra', () => {
  assert.deepEqual(solve([[0, 0, 0, 0], []]), []);
  // sin ningún tubo vacío y con los dos de arriba distintos: no hay jugadas
  assert.equal(solve([[0, 1, 0, 1], [1, 0, 1, 0]]), null);
  const one = solve([[0, 0, 0], [0], [1, 1, 1, 1]]);
  assert.equal(one.length, 1, 'una sola jugada alcanza (las tres sobre la otra o al revés)');
  assert.ok(replay([[0, 0, 0], [0], [1, 1, 1, 1]], encodeMoves(one)).solved);
  // no modifica el original
  const t = [[0, 1], [1, 0], []];
  const before = JSON.stringify(t);
  const sol = solve(t, 2); // con capacidad 2 hay solución en tres trasvases
  assert.ok(sol && sol.length === 3);
  assert.ok(replay(t, encodeMoves(sol), 2).solved);
  assert.equal(JSON.stringify(t), before);
  assert.equal(solve(t), null, 'con capacidad 4 dos capas nunca llenan un tubo');
  // el límite de estados corta la búsqueda
  const lv = generate(99, { colors: 12, extra: 2 });
  assert.equal(solve(lv.tubes, lv.cap, { maxNodes: 3 }), null);
});

test('trasvases como texto: ida y vuelta, y la repetición los valida uno por uno', () => {
  assert.equal(encodeMoves([[0, 1], [2, 0]]), 'abca');
  assert.deepEqual(decodeMoves('abca'), [[0, 1], [2, 0]]);
  assert.deepEqual(decodeMoves(''), []);
  assert.equal(decodeMoves('abc'), null, 'largo impar');
  assert.equal(decodeMoves('a{'), null, 'fuera de a–z');
  assert.equal(decodeMoves('A1'), null);
  assert.equal(decodeMoves(12), null);
  assert.equal(decodeMoves(null), null);
  const lv = generate(2024, { colors: 5, extra: 2 });
  const sol = solve(lv.tubes, lv.cap);
  const txt = encodeMoves(sol);
  assert.deepEqual(replay(lv.tubes, txt), { ok: true, moves: sol.length, solved: true });
  // si falta el último, es válido pero no está resuelto
  const part = replay(lv.tubes, encodeMoves(sol.slice(0, -1)));
  assert.equal(part.ok, true);
  assert.equal(part.solved, false);
  // un trasvase que no se puede hace inválida toda la repetición
  assert.equal(replay(lv.tubes, 'aa').ok, false, 'de un tubo a sí mismo');
  assert.equal(replay(lv.tubes, txt + 'zz').ok, false, 'tubos que no existen');
  assert.equal(replay(lv.tubes, 'abc').ok, false);
  assert.equal(replay(lv.tubes, 'ab'.repeat(5000)).ok, false, 'demasiados trasvases');
  assert.deepEqual(replay([[0, 0, 0, 0], []], '').solved, true, 'ya resuelto sin hacer nada');
  // no toca los tubos que se le dan
  const copy = JSON.stringify(lv.tubes);
  replay(lv.tubes, txt);
  assert.equal(JSON.stringify(lv.tubes), copy);
});

test('niveles: los colores suben de a uno cada dos niveles, de 3 a 12; los vacíos son dos salvo algunos difíciles', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 17, 18, 19, 20, 21, 500].map(colorsFor), [3, 3, 4, 4, 5, 5, 11, 11, 12, 12, 12, 12]);
  assert.equal(colorsFor(0), 3);
  assert.equal(colorsFor(-5), 3);
  assert.equal(extraFor(1), 2);
  assert.equal(extraFor(24), 2);
  assert.equal(extraFor(25), 1);
  assert.equal(extraFor(30), 1);
  assert.equal(extraFor(26), 2);
  assert.deepEqual(levelOf(7), levelOf(7));
  assert.notEqual(levelOf(7).seed, levelOf(8).seed);
  assert.equal(levelOf(7).colors, colorsFor(7));
  // todos los primeros niveles (incluidos los de un solo tubo vacío) tienen solución
  for (let n = 1; n <= 60; n++) {
    const p = levelOf(n);
    const lv = generate(p.seed, { colors: p.colors, extra: p.extra });
    assert.ok(solve(lv.tubes, lv.cap), `el nivel ${n} se puede resolver`);
  }
});

test('estrellas: tres si te acercás al par, dos si a lo sumo casi el doble, una si no', () => {
  assert.equal(stars(20, 20), 3);
  assert.equal(stars(25, 20), 3, 'hasta 1,2 × par + 1');
  assert.equal(stars(26, 20), 2);
  assert.equal(stars(38, 20), 2);
  assert.equal(stars(39, 20), 1);
  assert.equal(stars(5, 0), 3, 'sin par no se castiga');
  assert.ok(stars(3, 10) === 3, 'mejor que el par también son tres');
});

test('servidor (carrera): el nivel sale de la semilla, el final se valida con la repetición y el tiempo lo mide el servidor', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'chorrito', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    assert.equal(a.last('room').room.settings.colors, '8');
    a.send({ t: 'settings', settings: { colors: '99', public: 'x' } });
    await wait(100);
    assert.equal(a.last('room').room.settings.colors, '8', 'una cantidad rara se ignora');
    a.send({ t: 'settings', settings: { colors: '6' } });
    await wait(100);
    assert.equal(a.last('room').room.settings.colors, '6');
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'chorrito', code, name: 'Beto' });
    await wait(250);
    b.send({ t: 'settings', settings: { colors: '12' } });
    await wait(100);
    assert.equal(a.last('room').room.settings.colors, '6', 'solo el anfitrión cambia los ajustes');
    a.send({ t: 'start' });
    await wait(300);
    const room = a.last('room').room;
    assert.equal(room.state, 'playing');
    assert.equal(room.race.colors, 6);
    assert.ok(Number.isInteger(room.race.seed));
    assert.ok(room.race.startAt > Date.now() - 1000, 'largan en unos segundos');
    // los dos navegadores arman el mismo nivel con la semilla
    const lv = generate(room.race.seed, { colors: room.race.colors, extra: 2 });
    const sol = solve(lv.tubes, lv.cap);
    const good = encodeMoves(sol);
    for (const c of [a, b]) assert.ok(!JSON.stringify(c.msgs).includes('"tubes"'), 'el servidor no manda los tubos');
    // nadie termina antes de la largada
    b.send({ t: 'finish', moves: good });
    await wait(250);
    assert.equal(b.all('finished').length, 0, 'antes de largar no vale');
    while (Date.now() < room.race.startAt + 200) await wait(100);
    // el avance de uno le llega al otro; datos raros se ignoran
    a.send({ t: 'state', s: [2] });
    a.send({ t: 'state', s: 'x' });
    await wait(200);
    assert.deepEqual(b.last('state').s, [2]);
    // finales que no valen: trasvases imposibles, incompletos, mal formados
    b.send({ t: 'finish', moves: 'aa' });
    b.send({ t: 'finish', moves: encodeMoves(sol.slice(0, -1)) });
    b.send({ t: 'finish', moves: 'abc' });
    b.send({ t: 'finish' });
    await wait(300);
    assert.equal(b.all('finished').length, 0);
    // uno correcto: el tiempo es el del servidor, con el piso de lo que lleva hacer esos trasvases a mano
    a.send({ t: 'finish', moves: good });
    await wait(300);
    const fa = a.last('finished');
    assert.equal(fa.name, 'Ana');
    assert.equal(fa.place, 1);
    assert.equal(fa.moves, sol.length);
    assert.equal(fa.time, sol.length * 300, 'imposiblemente rápido: se acota');
    assert.equal(b.last('finished').id, fa.id, 'el otro se entera');
    // el segundo cierra la carrera y llega el resultado ordenado
    b.send({ t: 'finish', moves: good });
    await wait(400);
    const end = a.last('end');
    assert.ok(end, 'terminó la carrera');
    assert.deepEqual(end.results.map((r) => r.name), ['Ana', 'Beto']);
    assert.ok(end.results.every((r) => !r.dnf && r.time >= sol.length * 300));
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});

test('servidor (carrera): quien no termina queda al final con lo que avanzó', async () => {
  const srv = await startServer({ CHORRITO_REJOIN_MS: '300' });
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'chorrito', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    a.send({ t: 'settings', settings: { colors: '6' } });
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'chorrito', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const room = a.last('room').room;
    const lv = generate(room.race.seed, { colors: room.race.colors, extra: 2 });
    const good = encodeMoves(solve(lv.tubes, lv.cap));
    while (Date.now() < room.race.startAt + 200) await wait(100);
    b.send({ t: 'state', s: [9] });
    await wait(150);
    b.send({ t: 'state', s: [400] });
    await wait(150);
    a.send({ t: 'finish', moves: good });
    await wait(300);
    assert.equal(a.last('finished').place, 1);
    assert.ok(!a.last('end'), 'falta Beto');
    b.ws.close(); // se va sin terminar: se lo espera un momento y después la carrera se cierra
    await wait(100);
    assert.ok(!a.last('end'), 'todavía lo esperan');
    await wait(900);
    const end = a.last('end');
    assert.ok(end, 'terminó al irse el último');
    assert.deepEqual(end.results.map((r) => [r.name, !!r.dnf]), [['Ana', false], ['Beto', true]]);
    assert.equal(end.results[1].done, 6 * 4, 'el avance se acota a 4 por color');
    a.ws.close();
  } finally {
    srv.stop();
  }
});

test('servidor (carrera): el último que falta puede recargar la página y seguir; si no vuelve, se cierra', async () => {
  const srv = await startServer({ CHORRITO_REJOIN_MS: '2500' });
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'chorrito', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    a.send({ t: 'settings', settings: { colors: '6' } });
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'chorrito', code, name: 'Beto' });
    await wait(250);
    const token = b.last('joined')?.token;
    assert.ok(token, 'el servidor da un token para volver');
    a.send({ t: 'start' });
    await wait(300);
    const room = a.last('room').room;
    const lv = generate(room.race.seed, { colors: room.race.colors, extra: 2 });
    const good = encodeMoves(solve(lv.tubes, lv.cap));
    while (Date.now() < room.race.startAt + 200) await wait(100);
    a.send({ t: 'finish', moves: good });
    await wait(300);
    assert.equal(a.last('finished').place, 1);
    // Beto recarga la página: se cae y vuelve enseguida
    b.ws.close();
    await wait(500);
    assert.ok(!a.last('end'), 'la carrera sigue abierta mientras lo esperan');
    const b2 = await connect(srv.port);
    b2.send({ t: 'join', game: 'chorrito', code, name: 'Beto', token });
    await wait(400);
    const back = b2.last('room').room;
    assert.equal(back.state, 'playing', 'vuelve a la carrera en curso');
    assert.equal(back.race.seed, room.race.seed);
    assert.equal(back.race.results.length, 1, 've que Ana ya terminó');
    await wait(2300); // pasa el tiempo de espera: como volvió, no se cierra
    assert.ok(!a.last('end'), 'ya no lo esperan, pero volvió: la carrera sigue');
    b2.send({ t: 'finish', moves: good });
    await wait(400);
    const end = a.last('end');
    assert.ok(end, 'termina cuando llega el segundo');
    assert.deepEqual(end.results.map((r) => [r.name, !!r.dnf]), [['Ana', false], ['Beto', false]]);
    a.ws.close();
    b2.ws.close();
  } finally {
    srv.stop();
  }
});
