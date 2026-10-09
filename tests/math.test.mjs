/** public/shared/math-expr.js: cuentas exactas, ecuaciones válidas, forma canónica y generadores. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, checkEquation, canon, randomEquation, randomCalc, fracEq, isInt } from '../public/shared/math-expr.js';
import { rng } from '../public/shared/daily.js';

const val = (s) => {
  const v = evaluate(s);
  return v && `${v.n}/${v.d}`;
};

test('evaluate: precedencia, fracciones intermedias exactas y entradas inválidas', () => {
  assert.equal(val('2+3*4'), '14/1');
  assert.equal(val('12/4*3'), '9/1');
  assert.equal(val('6/4*2'), '3/1'); // 6/4 = 3/2 en el medio: el resultado igual es exacto
  assert.equal(val('12/8'), '3/2');
  assert.equal(val('10-4-3'), '3/1');
  assert.equal(val('0'), '0/1');
  assert.equal(val('7'), '7/1');
  for (const bad of ['', '8/0', '007', '+5', '5+', '5++3', '5*-3', '1 + 2', '2^3', '1e3', '12345678', '(1+2)']) assert.equal(val(bad), null, `"${bad}" debería ser inválida`);
});

test('checkEquation', () => {
  assert.equal(checkEquation('12+34=46'), null);
  assert.equal(checkEquation('45=9*5'), null);
  assert.equal(checkEquation('6/4*2=3'), null);
  assert.equal(checkEquation('12+34=47'), 'notEqual');
  assert.equal(checkEquation('1+1=2=2'), 'oneEq');
  assert.equal(checkEquation('1+12'), 'oneEq');
  assert.equal(checkEquation('12+=4'), 'syntax');
  assert.equal(checkEquation('01+1=2'), 'syntax');
  assert.equal(checkEquation('=2'), 'syntax');
});

test('canon: el orden de lo que se suma o multiplica no importa, la cuenta sí', () => {
  assert.equal(canon('2+3*4'), canon('4*3+2'));
  assert.equal(canon('8-3+5'), canon('5+8-3'));
  assert.equal(canon('12/4*3'), canon('3*12/4'));
  assert.notEqual(canon('2*6'), canon('3*4'));
  assert.notEqual(canon('8-3'), canon('3-8'));
  assert.notEqual(canon('12/4'), canon('4/12'));
  assert.equal(canon('2++'), null);
});

test('generadores: mismas semillas, mismas respuestas; siempre válidas y del largo pedido', () => {
  const eqs = new Set();
  for (let i = 0; i < 400; i++) {
    const day = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}:${i}`;
    const eq = randomEquation(rng(`ecuacion:${day}`));
    assert.equal(eq.length, 8, eq);
    assert.equal(checkEquation(eq), null, eq);
    assert.deepEqual(randomEquation(rng(`ecuacion:${day}`)), eq);
    eqs.add(eq);
    const { calc, target } = randomCalc(rng(`calculo:${day}`));
    assert.equal(calc.length, 6, calc);
    const v = evaluate(calc);
    assert.ok(isInt(v) && v.n === target && target >= 2, `${calc} = ${target}`);
    assert.deepEqual(randomCalc(rng(`calculo:${day}`)), { calc, target });
  }
  assert.ok(eqs.size > 300, `poca variedad de ecuaciones (${eqs.size})`);
});

test('fracEq compara sin decimales', () => {
  assert.ok(fracEq(evaluate('1/3'), evaluate('2/6')));
  assert.ok(!fracEq(evaluate('1/3'), evaluate('1/4')));
});
