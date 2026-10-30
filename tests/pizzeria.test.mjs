// Pizzería: pedidos favoritos según el rango y puntaje de armado, horno y corte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../public/shared/cocina/core.js';
import { TOPPINGS, toppingsAt, makeOrder, newPizza, buildScore, bakeScore, cutScore, toppingDetail, inRegion, REGIONS, slicesAt, bakesAt, expected, tipBase, BAKE_MAX } from '../public/games/pizzeria/shared/rules.js';

const ANG = { all: [0, Math.PI * 2], L: [Math.PI / 2, Math.PI * 1.5], R: [-Math.PI / 2, Math.PI / 2], TL: [Math.PI, Math.PI * 1.5], TR: [Math.PI * 1.5, Math.PI * 2], BL: [Math.PI / 2, Math.PI], BR: [0, Math.PI / 2] };

/** Arma la pizza perfecta para un pedido (salsa y queso parejos, ingredientes repartidos en su zona). */
function perfect(order) {
  const pz = newPizza();
  for (let y = -0.8; y <= 0.8; y += 0.08) for (let x = -0.8; x <= 0.8; x += 0.08) if (x * x + y * y < 0.76 * 0.76) {
    pz.sauce.paint(x, y, 0.1);
    pz.cheese.paint(x, y, 0.1);
  }
  for (const w of order.toppings) {
    const [a0, a1] = ANG[w.reg];
    for (let i = 0; i < w.n; i++) {
      const a = a0 + ((a1 - a0) * (i + 0.5)) / w.n;
      const r = w.reg === 'all' ? (i % 2 ? 0.32 : 0.66) : w.n > 3 ? (i % 2 ? 0.35 : 0.65) : 0.5;
      pz.pieces.push({ t: w.t, x: Math.cos(a) * r, y: Math.sin(a) * r, a: 0 });
    }
  }
  pz.bake = order.bake;
  pz.baked = true;
  for (let i = 0; i < order.slices / 2; i++) {
    const a = (i * Math.PI) / (order.slices / 2);
    pz.cuts.push({ x1: Math.cos(a), y1: Math.sin(a), x2: -Math.cos(a), y2: -Math.sin(a) });
  }
  return pz;
}

test('ingredientes: ids únicos y se abren de a poco', () => {
  assert.equal(new Set(TOPPINGS.map((t) => t.id)).size, TOPPINGS.length);
  assert.equal(toppingsAt(1).length, 2);
  for (let r = 1; r < 12; r++) assert.ok(toppingsAt(r + 1).length >= toppingsAt(r).length);
  assert.deepEqual(slicesAt(1), [4]);
  assert.deepEqual(bakesAt(1), [4]);
});

test('zonas: cada cuarto está en su mitad y nada fuera de la pizza cuenta', () => {
  for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const q = REGIONS.slice(3).filter((r) => inRegion(r, x, y));
    assert.equal(q.length, 1);
    assert.ok(inRegion(q[0][1] === 'L' ? 'L' : 'R', x, y));
    assert.ok(inRegion('all', x, y));
  }
  assert.ok(!inRegion('all', 0.99, 0));
});

test('pedidos: válidos para el rango, sin ingredientes repetidos y con cantidades razonables', () => {
  for (let rank = 1; rank <= 14; rank++) {
    for (let s = 0; s < 60; s++) {
      const o = makeOrder(rng(rank * 1000 + s), rank);
      const ids = o.toppings.map((t) => t.t);
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(o.toppings.length >= 1);
      for (const t of o.toppings) {
        assert.ok(toppingsAt(rank).some((x) => x.id === t.t), `${t.t} no se abrió en el rango ${rank}`);
        assert.ok(REGIONS.includes(t.reg));
        assert.ok(t.n >= 2 && t.n <= 12);
        if (rank < 2) assert.ok(!['TL', 'TR', 'BL', 'BR'].includes(t.reg), 'los cuartos llegan en el rango 2');
      }
      assert.ok(slicesAt(rank).includes(o.slices));
      assert.ok(bakesAt(rank).includes(o.bake));
      assert.ok(expected(o) > 40 && tipBase(o) > 2);
    }
  }
});

test('la pizza perfecta saca casi todo en cada estación', () => {
  for (let s = 0; s < 40; s++) {
    const o = makeOrder(rng(777 + s), 9);
    const pz = perfect(o);
    assert.ok(buildScore(o, pz) >= 95, `armado ${buildScore(o, pz)} ${JSON.stringify(toppingDetail(o, pz.pieces).rows)}`);
    assert.equal(bakeScore(o, pz), 100);
    assert.ok(cutScore(o, pz) >= 98);
  }
});

test('armado: faltan ingredientes, sobran, están en otra zona o amontonados', () => {
  const o = { toppings: [{ t: 'calabresa', reg: 'L', n: 4 }], bake: 4, slices: 4 };
  const good = perfect(o);
  const base = buildScore(o, good);
  const missing = perfect(o);
  missing.pieces.splice(0, 2);
  assert.ok(buildScore(o, missing) < base - 10);
  const wrongSide = perfect(o);
  for (const p of wrongSide.pieces) p.x = -p.x;
  assert.ok(buildScore(o, wrongSide) < base - 40);
  const extra = perfect(o);
  extra.pieces.push({ t: 'anchoas', x: 0.2, y: 0.2, a: 0 }, { t: 'anchoas', x: -0.3, y: 0.1, a: 0 });
  assert.ok(buildScore(o, extra) < base);
  const pile = perfect(o);
  pile.pieces.forEach((p, i) => Object.assign(p, { x: -0.4 + i * 0.01, y: 0.01 * i }));
  assert.ok(toppingDetail(o, pile.pieces).rows[0].ev < 0.3);
  const noSauce = perfect(o);
  noSauce.sauce.c.fill(0);
  assert.ok(buildScore(o, noSauce) <= base - 18);
});

test('horno: cruda, a punto, pasada y quemada', () => {
  const o = { toppings: [], bake: 4, slices: 4 };
  const pz = newPizza();
  assert.equal(bakeScore(o, pz), 0, 'sin hornear');
  pz.baked = true;
  pz.bake = 4.05;
  assert.equal(bakeScore(o, pz), 100);
  pz.bake = 5;
  const late = bakeScore(o, pz);
  pz.bake = 6.5;
  assert.ok(bakeScore(o, pz) < late);
  pz.bake = BAKE_MAX + 0.5;
  assert.ok(bakeScore(o, pz) <= 25);
});

test('corte: por el centro y parejo; torcido, corrido o de menos baja', () => {
  const o = { toppings: [], bake: 4, slices: 6 };
  const pz = newPizza();
  const cut = (a, off = 0) => ({ x1: Math.cos(a) + off, y1: Math.sin(a), x2: -Math.cos(a) + off, y2: -Math.sin(a) });
  pz.cuts = [cut(0), cut(Math.PI / 3), cut((2 * Math.PI) / 3)];
  assert.ok(cutScore(o, pz) >= 99);
  pz.cuts = [cut(0), cut(0.5), cut(2.2)];
  const crooked = cutScore(o, pz);
  assert.ok(crooked < 80);
  pz.cuts = [cut(0, 0.4), cut(Math.PI / 3, 0.4), cut((2 * Math.PI) / 3, 0.4)];
  assert.ok(cutScore(o, pz) < 70, 'corrido del centro');
  pz.cuts = [cut(0), cut(Math.PI / 2)];
  assert.ok(cutScore(o, pz) < 80, 'faltó un corte');
  pz.cuts = [];
  assert.equal(cutScore(o, pz), 0);
});
