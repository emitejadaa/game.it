// Hamburguesería: pedidos según el rango, punto de la carne (los dos lados) y armado (orden y centrado).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../public/shared/cocina/core.js';
import { makeOrder, fullStack, newBurger, grillScore, buildScore, pattyScore, itemsAt, byId, BURN, expected, tipBase } from '../public/games/hamburgueseria/shared/rules.js';

function perfect(o) {
  const v = byId[o.cook].v;
  const b = newBurger();
  for (const id of [...o.stack, 'panarriba']) b.items.push({ id, x: 0, patty: id === 'carne' ? { a: v, b: v } : undefined });
  b.done = true;
  return b;
}

test('pedidos: la pila empieza con carne, la cantidad de carnes según el rango y solo lo que ya se abrió', () => {
  for (let rank = 1; rank <= 12; rank++) {
    for (let s = 0; s < 60; s++) {
      const o = makeOrder(rng(rank * 71 + s), rank);
      assert.equal(o.stack[0], 'carne');
      const meats = o.stack.filter((x) => x === 'carne').length;
      assert.ok(meats >= 1 && meats <= (rank >= 6 ? 3 : rank >= 2 ? 2 : 1));
      for (const id of o.stack) assert.ok(itemsAt(rank).some((x) => x.id === id), `${id} en rango ${rank}`);
      assert.ok(byId[o.cook].rank <= rank);
      assert.deepEqual(fullStack(o).slice(1, -1), o.stack);
      assert.ok(expected(o) > 30 && tipBase(o) > 2);
    }
  }
});

test('la hamburguesa perfecta saca 100 en las dos estaciones', () => {
  for (let s = 0; s < 30; s++) {
    const o = makeOrder(rng(5000 + s), 10);
    const b = perfect(o);
    assert.equal(grillScore(o, b), 100);
    assert.equal(buildScore(o, b), 100);
  }
});

test('punto de la carne: los dos lados cuentan y quemada vale poco', () => {
  assert.equal(pattyScore({ a: 0.75, b: 0.75 }, 'apunto'), 100);
  const oneSide = pattyScore({ a: 0.75, b: 0.1 }, 'apunto');
  assert.ok(oneSide < 60 && oneSide >= 50, `un solo lado: ${oneSide}`);
  assert.ok(pattyScore({ a: BURN + 0.1, b: BURN + 0.1 }, 'cocida') <= 25);
  assert.ok(pattyScore({ a: 0.5, b: 0.5 }, 'cocida') < pattyScore({ a: 0.9, b: 0.9 }, 'cocida'));
});

test('parrilla: falta carne o sobra', () => {
  const o = { cook: 'apunto', stack: ['carne', 'queso', 'carne', 'lechuga'] };
  const b = perfect(o);
  assert.equal(grillScore(o, b), 100);
  const one = perfect(o);
  one.items.splice(3, 1);
  assert.ok(grillScore(o, one) <= 50);
  const three = perfect(o);
  three.items.splice(2, 0, { id: 'carne', x: 0, patty: { a: 0.75, b: 0.75 } });
  assert.ok(grillScore(o, three) < 100);
});

test('armado: orden cambiado, cosas que faltan y torcida', () => {
  const o = { cook: 'apunto', stack: ['carne', 'queso', 'tomate', 'lechuga'] };
  const base = buildScore(o, perfect(o));
  const swapped = perfect(o);
  [swapped.items[2], swapped.items[4]] = [swapped.items[4], swapped.items[2]];
  assert.ok(buildScore(o, swapped) < base);
  const noTop = perfect(o);
  noTop.items.pop();
  assert.ok(buildScore(o, noTop) < base);
  const crooked = perfect(o);
  crooked.items.forEach((it, i) => i && (it.x = i % 2 ? 0.4 : -0.4));
  assert.ok(buildScore(o, crooked) < 70);
});
