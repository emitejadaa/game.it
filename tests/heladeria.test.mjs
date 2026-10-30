// Heladería: pedidos según el rango y puntaje de armado (vaso, mezclas y jarabe), licuado y decorado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../public/shared/cocina/core.js';
import { makeOrder, newCup, pour, topLayer, buildScore, buildDetail, blendScore, topScore, topDetail, byId, mixesAt, garnishAt, dome, SPOTS, BLEND_MAX, expected, tipBase } from '../public/games/heladeria/shared/rules.js';

/** El licuado perfecto para un pedido. */
function perfect(o) {
  const c = newCup(o.size);
  c.mixes = o.mixes.slice();
  pour(c, o.syrup, 1);
  c.blend = byId[o.blend].v;
  c.blended = true;
  if (o.cream) c.cream = { id: o.cream, amt: 1, off: 0 };
  if (o.drizzle) {
    const p = topLayer(c, 'drizzle', o.drizzle);
    for (let y = -0.85; y <= 0.9; y += 0.42) p.line(-0.9, y, 0.9, y, 0.1);
  }
  if (o.sprinkles) {
    const p = topLayer(c, 'sprinkles', o.sprinkles);
    for (let y = -0.9; y <= 0.9; y += 0.2) for (let x = -0.9; x <= 0.9; x += 0.3) if (dome(x, y)) p.paint(x, y, 0.1);
  }
  c.garnish = o.garnish.map((gg) => ({ id: gg.id, ...SPOTS[gg.pos] }));
  return c;
}

test('pedidos válidos para cada rango', () => {
  for (let rank = 1; rank <= 12; rank++) {
    for (let s = 0; s < 60; s++) {
      const o = makeOrder(rng(rank * 313 + s), rank);
      assert.ok(['S', 'M', 'L'].includes(o.size));
      assert.ok(o.mixes.length >= 1 && o.mixes.length <= 2);
      assert.equal(new Set(o.mixes).size, o.mixes.length);
      for (const m of o.mixes) assert.ok(mixesAt(rank).some((x) => x.id === m));
      for (const gg of o.garnish) assert.ok(garnishAt(rank).some((x) => x.id === gg.id) && SPOTS[gg.pos]);
      assert.equal(new Set(o.garnish.map((x) => x.pos)).size, o.garnish.length, 'cada cosa en su lugar');
      for (const k of ['syrup', 'blend', 'cream', 'drizzle', 'sprinkles']) if (o[k]) assert.ok(byId[o[k]].rank <= rank, `${k} ${o[k]}`);
      assert.ok(expected(o) > 30 && tipBase(o) > 2);
    }
  }
});

test('el licuado perfecto saca casi todo', () => {
  for (let s = 0; s < 40; s++) {
    const o = makeOrder(rng(900 + s), 10);
    const c = perfect(o);
    assert.equal(buildScore(o, c), 100);
    assert.equal(blendScore(o, c), 100);
    assert.ok(topScore(o, c) >= 90, `decorado ${JSON.stringify(topDetail(o, c))} ${JSON.stringify(o)}`);
  }
});

test('armado: vaso, mezclas y jarabe', () => {
  const o = { size: 'M', mixes: ['frutilla'], syrup: 'vainilla', blend: 'normal', cream: null, drizzle: null, sprinkles: null, garnish: [] };
  assert.equal(buildScore(o, perfect(o)), 100);
  const wrongCup = perfect(o);
  wrongCup.size = 'L';
  assert.ok(buildScore(o, wrongCup) < 60);
  const noMix = perfect(o);
  noMix.mixes = [];
  assert.ok(buildScore(o, noMix) <= 66);
  const extraMix = perfect(o);
  extraMix.mixes.push('chips');
  assert.ok(buildScore(o, extraMix) < 100);
  const low = newCup('M');
  low.mixes = ['frutilla'];
  pour(low, 'vainilla', 0.6);
  assert.ok(buildDetail(o, low).fill < 0.5);
  const mixed = newCup('M');
  mixed.mixes = ['frutilla'];
  pour(mixed, 'vainilla', 0.5);
  pour(mixed, 'choco', 0.5);
  assert.ok(buildScore(o, mixed) < 70, 'mezcló sabores');
});

test('licuado: grueso, normal, suave y aguado', () => {
  const o = { blend: 'grueso' };
  const c = newCup('M');
  assert.equal(blendScore(o, c), 0, 'sin licuar');
  c.blended = true;
  c.blend = byId.grueso.v;
  assert.equal(blendScore(o, c), 100);
  c.blend = byId.suave.v;
  assert.ok(blendScore(o, c) < 10);
  c.blend = BLEND_MAX + 0.1;
  assert.ok(blendScore({ blend: 'suave' }, c) <= 25);
});

test('decorado: crema torcida o de más, salsa que nadie pidió, cereza fuera de lugar', () => {
  const o = { size: 'M', mixes: ['frutilla'], syrup: 'vainilla', blend: 'normal', cream: 'crema', drizzle: null, sprinkles: null, garnish: [{ id: 'cereza', pos: 'C' }] };
  const good = perfect(o);
  const base = topScore(o, good);
  assert.ok(base >= 95);
  const crooked = perfect(o);
  crooked.cream.off = 0.7;
  assert.ok(topScore(o, crooked) < base - 10);
  const tiny = perfect(o);
  tiny.cream.amt = 0.3;
  assert.ok(topScore(o, tiny) < base - 15);
  const extra = perfect(o);
  const p = topLayer(extra, 'drizzle', 'salsachoco');
  for (let y = -0.8; y <= 0.9; y += 0.2) p.line(-0.9, y, 0.9, y, 0.1);
  assert.ok(topScore(o, extra) < base);
  const moved = perfect(o);
  moved.garnish[0] = { id: 'cereza', x: 0.6, y: 0.5 };
  assert.ok(topScore(o, moved) < base - 15);
  const none = perfect(o);
  none.garnish = [];
  assert.ok(topScore(o, none) < base - 20);
});
