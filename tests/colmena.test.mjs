import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { norm, fits, isPangram, scoreWord, answersFor, totalPoints, thresholds, rankIndex, scanDict, RANKS, WIN_IDX } from '../public/games/colmena/logic.js';
import { decode } from '../public/games/mecha/shared/dict.js';

const DATA = new URL('../public/games/colmena/data/', import.meta.url);
const read = (f) => readFileSync(new URL(f, DATA), 'utf8');
const L = 'cdhimos';

test('puntos: 4 letras = 1, más largas = su largo, panagrama = largo + 7', () => {
  assert.equal(scoreWord('modo', L), 1);
  assert.equal(scoreWord('mismo', L), 5);
  assert.equal(scoreWord('hicimos', L), 7);
  assert.equal(scoreWord('homicidio', L), 9); // le falta la s
  assert.equal(scoreWord('homicidios', L), 10 + 7);
});

test('panagrama: usa las 7 letras', () => {
  assert.equal(isPangram('homicidios', L), true);
  assert.equal(isPangram('hicimos', L), false); // le falta la d
  assert.equal(isPangram('comidos', L), false); // le falta la h
});

test('fits: largo mínimo, solo letras del panal y la central', () => {
  assert.equal(fits('mio', L, 'm'), false); // 3 letras
  assert.equal(fits('modo', L, 'm'), true);
  assert.equal(fits('modo', L, 'h'), false); // sin la central
  assert.equal(fits('mora', L, 'm'), false); // r y a no están
  assert.equal(fits('mimismo', L, 'm'), true); // se pueden repetir
});

test('answersFor filtra la lista con las letras del panal', () => {
  const words = ['como', 'comida', 'comido', 'modo', 'moho', 'mora', 'oso', 'sima', 'simio', 'soda', 'sodio'];
  assert.deepEqual(answersFor(words, L, 'm'), ['como', 'comido', 'modo', 'moho', 'simio']);
  assert.deepEqual(answersFor(words, L, 'd'), ['comido', 'modo', 'sodio']);
  assert.equal(totalPoints(['modo', 'moho', 'simio'], L), 1 + 1 + 5);
});

test('rangos: umbrales como % del máximo y victoria en Genial', () => {
  assert.deepEqual(RANKS, [0, 5, 15, 30, 50, 70, 100]);
  assert.equal(RANKS[WIN_IDX], 30);
  assert.deepEqual(thresholds(100), [0, 5, 15, 30, 50, 70, 100]);
  assert.deepEqual(thresholds(184), [0, 10, 28, 56, 92, 129, 184]);
  assert.equal(rankIndex(0, 100), 0);
  assert.equal(rankIndex(4, 100), 0);
  assert.equal(rankIndex(5, 100), 1);
  assert.equal(rankIndex(29, 100), 2);
  assert.equal(rankIndex(30, 100), 3);
  assert.equal(rankIndex(69, 100), 4);
  assert.equal(rankIndex(70, 100), 5);
  assert.equal(rankIndex(99, 100), 5);
  assert.equal(rankIndex(100, 100), 6);
  assert.equal(rankIndex(55, 184), 2);
  assert.equal(rankIndex(56, 184), 3);
});

test('norm: sin tildes, ñ solo en español', () => {
  assert.equal(norm('Árbol', 'es'), 'arbol');
  assert.equal(norm('NIÑO', 'es'), 'niño');
  assert.equal(norm('ñ', 'en'), '');
  assert.equal(norm('Dead', 'en'), 'dead');
});

test('scanDict da lo mismo que decodificar todo el diccionario', () => {
  const text = readFileSync(new URL('../public/games/mecha/dict/es.txt', import.meta.url), 'utf8');
  const expected = decode(text).filter((w) => fits(w, L, 'm'));
  assert.ok(expected.length > 50);
  assert.deepEqual(scanDict(text, L, 'm'), expected);
});

for (const [lang, banned] of [
  ['es', 'kwxzqjñ'],
  ['en', 'jqxzkw'],
]) {
  test(`datos ${lang}: lista de palabras`, () => {
    const txt = read(`words-${lang}.txt`);
    const words = txt.trim().split('\n');
    assert.ok(words.length >= 12000 && words.length <= 25000, `${words.length} palabras`);
    assert.ok(statSync(new URL(`words-${lang}.txt`, DATA)).size <= 250 * 1024);
    assert.deepEqual([...new Set(words)].sort(), words, 'ordenadas y sin repetidas');
    for (const w of words) {
      assert.ok(w.length >= 4, w);
      assert.equal(norm(w, lang), w, w);
    }
    // todas están en el diccionario de Mecha Corta
    const dict = new Set(decode(readFileSync(new URL(`../public/games/mecha/dict/${lang}.txt`, import.meta.url), 'utf8')));
    assert.deepEqual(
      words.filter((w) => !dict.has(w)),
      [],
    );
  });

  test(`datos ${lang}: 730 desafíos válidos`, () => {
    const words = read(`words-${lang}.txt`).trim().split('\n');
    const puzzles = JSON.parse(read(`puzzles-${lang}.json`));
    assert.equal(puzzles.length, 730);
    const seen = new Set();
    for (const [letters, center] of puzzles) {
      assert.match(letters, /^[a-zñ]{7}$/);
      assert.equal([...letters].sort().join(''), letters, 'letras ordenadas');
      assert.equal(new Set(letters).size, 7);
      assert.ok(letters.includes(center), 'letra central');
      for (const b of banned) assert.ok(!letters.includes(b), `${letters} tiene ${b}`);
      assert.ok(!seen.has(letters), `repetido ${letters}`);
      seen.add(letters);
      const ans = answersFor(words, letters, center);
      assert.ok(ans.length >= 20 && ans.length <= 60, `${letters}/${center}: ${ans.length} respuestas`);
      assert.ok(
        ans.some((w) => isPangram(w, letters)),
        `${letters}/${center}: sin panagrama`,
      );
      const pts = totalPoints(ans, letters);
      assert.ok(pts >= 40 && pts <= 250, `${letters}/${center}: ${pts} puntos`);
    }
    assert.equal(seen.size, 730);
  });
}
