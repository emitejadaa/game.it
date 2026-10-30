// Fuego y Agua: la física (salto, choques, rampas, charcos, palancas, botones, cajas) y que cada templo se gana
// con todas las gemas siguiendo su solución guionada (shared/solutions.js) con el piloto automático.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, step, DT, P, T, grade, gemsGot, tileAt } from '../public/games/fuegoyagua/shared/sim.js';
import { LEVELS } from '../public/games/fuegoyagua/shared/levels.js';
import { SOLUTIONS } from '../public/games/fuegoyagua/shared/solutions.js';
import { pilot } from '../public/games/fuegoyagua/shared/pilot.js';

/** Un templo de prueba: piso abajo, los dos parados y las puertas lejos. */
function room(rows, objects = []) {
  // las puertas quedan arriba a la derecha, en un estante que no estorba
  const doors = ['..................D.E...', '..................######'];
  const map = ['##########################', ...[...doors, ...rows].map((r) => `#${r.padEnd(24, '.')}#`), '##########################'];
  objects = objects.map((o) => ({ ...o, y: o.y + doors.length + 1 })); // y de los objetos = índice de su fila en `rows`
  return load({ id: 'prueba', name: { es: 'p', en: 'p' }, par: 60, map, objects });
}
const idle = { F: {}, W: {} };
const run = (W, secs, inp = idle) => {
  for (let i = 0; i < secs / DT; i++) step(W, typeof inp === 'function' ? inp(W) : inp);
  return W;
};

test('los templos están bien armados', () => {
  assert.ok(LEVELS.length >= 10);
  const ids = new Set();
  for (const lv of LEVELS) {
    assert.ok(!ids.has(lv.id), `id repetido ${lv.id}`);
    ids.add(lv.id);
    const W = load(lv);
    assert.equal(W.w, 36);
    assert.equal(W.h, 26);
    for (let x = 0; x < W.w; x++) assert.equal(tileAt(W, x, 0), T.S, `${lv.id}: techo abierto`);
    assert.ok(W.gems.some((g) => g.k === 'F') && W.gems.some((g) => g.k === 'W'), `${lv.id}: gemas de los dos colores`);
    assert.ok(lv.par > 0 && lv.name.es && lv.name.en);
    for (const o of lv.objects) if (o.link) for (const id of [].concat(o.link)) assert.ok(W.movers.some((m) => m.id === id), `${lv.id}: ${id} no existe`);
    assert.ok(SOLUTIONS[lv.id], `${lv.id}: falta su solución`);
  }
});

test('el salto sube tres baldosas y cruza cinco corriendo', () => {
  const W = room(['', '', '', '', '', '', '', '', '', '', '..F.A', '########################']);
  run(W, 0.3);
  const y0 = W.chars.F.y;
  let top = y0;
  for (let i = 0; i < 120; i++) {
    step(W, { F: { u: i < 2 }, W: {} });
    top = Math.min(top, W.chars.F.y);
  }
  const h = y0 - top;
  assert.ok(h > 2.95 && h < 3.15, `altura ${h}`);
  assert.ok(Math.abs(W.chars.F.y - y0) < 1e-6, 'vuelve al piso');
  // distancia de un salto corriendo
  const R = room(['', '', '', '', '', '', '', '', '', '', 'F.A', '########################']);
  run(R, 0.5, { F: { r: true }, W: {} });
  const x0 = R.chars.F.x;
  step(R, { F: { r: true, u: true }, W: {} });
  while (!R.chars.F.ground) step(R, { F: { r: true }, W: {} });
  assert.ok(R.chars.F.x - x0 > 5 && R.chars.F.x - x0 < 6, `distancia ${R.chars.F.x - x0}`);
});

test('no se atraviesan paredes y las rampas se suben caminando', () => {
  const W = room(['', '', '', '', '', '', '', '', '...../##', '..../###', 'F.A/####', '########################']);
  // camina a la derecha: sube la rampa hasta arriba de los bloques (la fila 8 del cuarto → piso en y = 11)
  let high = Infinity;
  run(W, 1.2, (w) => {
    high = Math.min(high, w.chars.F.y);
    return { F: { r: true }, W: {} };
  });
  assert.ok(high <= 11.001 && W.chars.F.x > 8, `llegó a ${high} y quedó en ${W.chars.F.x}`);
  const wall = room(['', '', '', '', '', '', '', '', '', '#', 'F.A....#', '########################']);
  run(wall, 2, { F: { r: true }, W: {} });
  assert.ok(wall.chars.F.x < 7 - P.w / 2 + 1e-3, 'frena contra la pared');
});

test('lava, agua y barro: cada uno se apaga en lo del otro', () => {
  const lava = room(['', '', '', '', '', '', '', '', '', '', 'F.A', '###LL###################']);
  run(lava, 2, { F: { r: true }, W: {} });
  assert.equal(lava.dead, null, 'Llama camina por la lava');
  assert.ok(lava.chars.F.x > 6);
  const lava2 = room(['', '', '', '', '', '', '', '', '', '', 'F.A', '###LL###################']);
  run(lava2, 2, { F: {}, W: { r: true } });
  assert.equal(lava2.dead?.k, 'W', 'la lava apaga a Gota');
  const water = room(['', '', '', '', '', '', '', '', '', '', 'A.F', '###WW###################']);
  run(water, 2, { F: { r: true }, W: {} });
  assert.equal(water.dead?.k, 'F', 'el agua apaga a Llama');
  const goo = room(['', '', '', '', '', '', '', '', '', '', 'A.F', '###GG###################']);
  run(goo, 2, { F: {}, W: { r: true } });
  assert.equal(goo.dead?.k, 'W', 'el barro apaga a los dos');
});

test('palancas: se empujan caminando y no saltando; botones: se sostienen con una caja', () => {
  const objs = [
    { t: 'lever', x: 6, y: 10, link: 'm' },
    { t: 'mover', id: 'm', x: 20, y: 5, w: 1, h: 3, dy: -3 },
  ];
  const W = room(['', '', '', '', '', '', '', '', '', '', 'F.A', '########################'], objs);
  run(W, 1.5, { F: { r: true }, W: {} });
  assert.ok(W.levers[0].on, 'caminando hacia la derecha la prende');
  run(W, 1, { F: { l: true }, W: {} });
  assert.ok(!W.levers[0].on, 'caminando de vuelta la apaga');
  const B = room(['', '', '', '', '', '', '', '', '', '', 'F.A', '########################'], [
    { t: 'box', x: 5, y: 10 },
    { t: 'button', x: 9, y: 10, link: 'g' },
    { t: 'mover', id: 'g', x: 20, y: 8, w: 1, h: 3, dy: -3 },
  ]);
  // Gota empuja la caja hasta el botón y se va
  run(B, 2, (w) => ({ F: {}, W: { r: w.boxes[0].x < 9.4 } }));
  run(B, 2, { F: {}, W: { l: true } });
  assert.ok(B.buttons[0].pressed, 'la caja sostiene el botón');
  assert.ok(B.movers[0].k > 0.99, 'la compuerta quedó abierta');
});

test('cada templo se gana con todas las gemas siguiendo su solución', () => {
  for (const lv of LEVELS) {
    const W = load(lv);
    const p = pilot(SOLUTIONS[lv.id]);
    for (let i = 0; i < 120 / DT && !W.won && !W.dead; i++) step(W, p.input(W));
    assert.equal(W.dead, null, `${lv.id}: se apagó ${JSON.stringify(W.dead)}`);
    assert.ok(W.won, `${lv.id}: no llegó a las puertas (${JSON.stringify(p.where())})`);
    assert.equal(gemsGot(W), W.gems.length, `${lv.id}: faltaron gemas`);
    assert.equal(grade(W, lv.par), 'A', `${lv.id}: ${W.time.toFixed(1)} s para un par de ${lv.par}`);
  }
});

test('la simulación es determinista', () => {
  const lv = LEVELS.find((l) => l.id === 'cima');
  const play = () => {
    const W = load(lv);
    const p = pilot(SOLUTIONS[lv.id]);
    for (let i = 0; i < 120 / DT && !W.won; i++) step(W, p.input(W));
    return [W.steps, W.chars.F.x, W.chars.W.x, W.boxes.map((b) => b.x)];
  };
  assert.deepEqual(play(), play());
});
