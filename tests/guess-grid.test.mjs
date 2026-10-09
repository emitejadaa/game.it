/** Puntuación de colores del motor de grilla (letras repetidas incluidas). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGuess } from '../public/shared/guess-grid.js';

const sc = (g, s) => scoreGuess([...g], [...s]).join('');

test('acierto total y fallo total', () => {
  assert.equal(sc('perro', 'perro'), 'ggggg');
  assert.equal(sc('abcde', 'fghij'), 'xxxxx');
});

test('letras que están en otro lugar', () => {
  assert.equal(sc('error', 'perro'), 'yygyx');
  assert.equal(sc('orden', 'perro'), 'yyxyx');
});

test('letras repetidas: cada letra del secreto se cuenta una sola vez', () => {
  assert.equal(sc('lleno', 'hello'), 'yyyxg');
  assert.equal(sc('aaaaa', 'abaca'), 'gxgxg');
  // regla general: nunca hay más verdes+amarillas de una letra que apariciones en el secreto
  for (const [g, s] of [['sissy', 'mesas'], ['eerie', 'there'], ['alaba', 'banal'], ['11+11=22', '5+3*4=17']]) {
    const st = scoreGuess([...g], [...s]);
    for (const ch of new Set(g)) {
      const marked = [...g].filter((c, i) => c === ch && st[i] !== 'x').length;
      const inSecret = [...s].filter((c) => c === ch).length;
      assert.ok(marked <= inSecret, `${g} vs ${s}: "${ch}" marcada ${marked} veces y aparece ${inSecret}`);
    }
  }
});

test('con símbolos (ecuaciones)', () => {
  assert.equal(sc('12+34=46', '12+34=46'), 'gggggggg');
  assert.equal(sc('11+11=22', '12+34=46').length, 8);
});
