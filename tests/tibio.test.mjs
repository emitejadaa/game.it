/** Tibio: ranking por coseno, vectores int8, ayudas y validez de los datos (vocabulario y palabras secretas). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare, cosine, rankAll, tier, bar, squares, bucket, hintRank, MAX_HINTS } from '../public/games/tibio/rank.js';
import { norm } from '../public/shared/words5/norm.js';

const DATA = new URL('../public/games/tibio/data/', import.meta.url);
const load = (lang) => {
  const meta = JSON.parse(readFileSync(new URL(`meta-${lang}.json`, DATA), 'utf8'));
  const buf = readFileSync(new URL(`vectors-${lang}.bin`, DATA));
  const words = readFileSync(new URL(`words-${lang}.txt`, DATA), 'utf8').split('\n').filter(Boolean);
  const secrets = JSON.parse(readFileSync(new URL(`secrets-${lang}.json`, DATA), 'utf8'));
  return { meta, m: prepare(new Int8Array(buf.buffer, buf.byteOffset, buf.length), meta.n, meta.dims), words, secrets };
};

// vectores de juguete: 2 dimensiones, 5 palabras
const toy = () => prepare(Int8Array.from([100, 0, 90, 40, 0, 100, -100, 0, 60, 60]), 5, 2);

test('prepare calcula la inversa de la norma y rechaza tamaños incorrectos', () => {
  const m = toy();
  assert.ok(Math.abs(m.inv[0] - 0.01) < 1e-6);
  assert.throws(() => prepare(new Int8Array(7), 5, 2));
});

test('cosine: 1 consigo misma, 0 en ortogonales, -1 en opuestas', () => {
  const m = toy();
  assert.ok(Math.abs(cosine(m, 0, 0) - 1) < 1e-6);
  assert.ok(Math.abs(cosine(m, 0, 2)) < 1e-6);
  assert.ok(Math.abs(cosine(m, 0, 3) + 1) < 1e-6);
});

test('rankAll ordena por cercanía y el secreto es el puesto 1', () => {
  const { order, rankOf } = rankAll(toy(), 0);
  assert.deepEqual([...order], [0, 1, 4, 2, 3]);
  assert.equal(rankOf[0], 1);
  assert.equal(rankOf[3], 5);
  assert.equal(rankOf[order[2]], 3); // order y rankOf son inversos
});

test('rankAll: desempata por índice y es determinista', () => {
  const m = prepare(Int8Array.from([100, 0, 0, 100, 0, 100, 0, 100]), 4, 2);
  const a = rankAll(m, 0);
  const b = rankAll(m, 0);
  assert.deepEqual([...a.order], [0, 1, 2, 3].sort((x, y) => (x === 0 ? -1 : y === 0 ? 1 : x - y)));
  assert.deepEqual([...a.order], [...b.order]);
});

test('tier, bar y bucket', () => {
  assert.equal(tier(1), 'near');
  assert.equal(tier(300), 'near');
  assert.equal(tier(301), 'mid');
  assert.equal(tier(1500), 'mid');
  assert.equal(tier(1501), 'far');
  assert.equal(bar(1, 30000), 1);
  assert.ok(bar(10, 30000) > bar(1000, 30000));
  assert.ok(bar(30000, 30000) >= 0.02 && bar(30000, 30000) < 0.05);
  assert.deepEqual([1, 10, 11, 25, 26, 50, 51, 100, 101, 200, 201, 999].map(bucket), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
});

test('squares: los mejores 8 puestos, de menor a mayor, por color', () => {
  assert.equal(squares([5000, 20, 700, 1, 400, 90000, 31, 2000, 3000, 12000]), '🟩🟩🟩🟨🟨🟥🟥🟥');
  assert.equal(squares([]), '');
});

test('hintRank: cerca de la mitad del mejor puesto, sin repetir ni devolver el puesto 1', () => {
  assert.equal(hintRank(200, new Set(), 30000), 100);
  assert.equal(hintRank(200, new Set([100]), 30000), 101);
  assert.equal(hintRank(Infinity, new Set(), 30000), 1000);
  assert.equal(hintRank(3, new Set(), 30000), 2);
  assert.equal(hintRank(2, new Set(), 30000), 0); // no hay nada entre el 1 y el 2
  assert.equal(hintRank(3, new Set([2]), 30000), 0);
  for (let best = 2; best < 400; best++) {
    const r = hintRank(best, new Set(), 30000);
    assert.ok(r === 0 || (r >= 2 && r < best));
  }
  assert.equal(MAX_HINTS, 3);
});

for (const lang of ['es', 'en']) {
  test(`datos ${lang}: tamaños, vocabulario y palabras secretas`, () => {
    const { meta, m, words, secrets } = load(lang);
    assert.equal(words.length, meta.n);
    assert.ok(meta.n >= 20000);
    assert.ok(meta.n * meta.dims <= 3e6, 'los vectores no pasan de 3 MB');
    assert.ok(words.join('\n').length < 400e3, 'la lista de palabras no pasa de 400 KB');
    const index = new Map();
    words.forEach((w, i) => {
      const k = norm(w, lang);
      assert.ok(k.length >= 3, w);
      assert.ok(!index.has(k), `repetida: ${w}`);
      index.set(k, i);
    });
    assert.ok(secrets.length >= 700);
    const seen = new Set();
    for (const s of secrets) {
      assert.equal(s, norm(s, lang), `sin normalizar: ${s}`);
      assert.ok(index.has(s), `${s} no está en el vocabulario`);
      assert.ok(!seen.has(s), `repetida: ${s}`);
      seen.add(s);
    }
    // todas las filas tienen vector (no hay filas en cero)
    for (let i = 0; i < meta.n; i++) assert.ok(m.inv[i] > 0, `fila vacía ${words[i]}`);
  });
}

test('los vecinos más cercanos tienen sentido (es y en)', () => {
  const near = { es: [['perro', ['gato', 'cachorro', 'mascota']], ['rojo', ['azul', 'verde', 'amarillo']]], en: [['dog', ['cat', 'puppy', 'pet']], ['red', ['blue', 'green', 'yellow']]] };
  for (const lang of ['es', 'en']) {
    const { m, words } = load(lang);
    const idx = (w) => words.findIndex((x) => norm(x, lang) === w);
    for (const [secret, expected] of near[lang]) {
      const { rankOf } = rankAll(m, idx(secret));
      for (const w of expected) assert.ok(rankOf[idx(w)] <= 30, `${lang}: ${w} debería estar entre las 30 más cercanas de ${secret} (puesto ${rankOf[idx(w)]})`);
      assert.ok(rankOf[idx(lang === 'es' ? 'impuesto' : 'tax')] > 500, 'una palabra sin relación queda lejos');
    }
  }
});
