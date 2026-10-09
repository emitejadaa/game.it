/** public/shared/countries/countries.js con los datos reales de public/shared/countries/countries.json. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCountries, findCountry, suggest, dailyPick, distanceKm, bearing, arrowFor, proximity, nameOf } from '../public/shared/countries/countries.js';

let ctx;
before(async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL('../public/shared/countries/countries.json', import.meta.url), 'utf8')) });
  ctx = await loadCountries();
});
const code = (c) => c?.c;

test('hay 193 posibles respuestas (miembros de la ONU) y más países para adivinar', () => {
  assert.equal(ctx.answers.length, 193);
  assert.ok(ctx.list.length > 193);
  for (const x of ['AR', 'ES', 'US', 'MM', 'KZ', 'IL', 'CU', 'PS']) assert.ok(ctx.byCode.has(x), x);
  assert.equal(ctx.byCode.get('TW').a, 0);
  assert.equal(ctx.byCode.get('VA').a, 0);
});

test('findCountry: sin tildes, mayúsculas ni signos, en español, inglés y con alias', () => {
  assert.equal(code(findCountry(ctx, 'España')), 'ES');
  assert.equal(code(findCountry(ctx, 'espana')), 'ES');
  assert.equal(code(findCountry(ctx, 'SPAIN')), 'ES');
  assert.equal(code(findCountry(ctx, 'EE.UU.')), 'US');
  assert.equal(code(findCountry(ctx, 'usa')), 'US');
  assert.equal(code(findCountry(ctx, 'Holanda')), 'NL');
  assert.equal(code(findCountry(ctx, 'birmania')), 'MM');
  assert.equal(code(findCountry(ctx, 'Côte d’Ivoire')), 'CI');
  assert.equal(code(findCountry(ctx, 'corea del sur')), 'KR');
  assert.equal(findCountry(ctx, 'Narnia'), null);
  assert.equal(findCountry(ctx, ''), null);
});

test('suggest: primero los que empiezan con el texto', () => {
  const s = suggest(ctx, 'arg', 'es').map(code);
  assert.deepEqual(s.slice(0, 2), ['DZ', 'AR']); // Argelia y Argentina, en orden alfabético
  assert.deepEqual(suggest(ctx, 'xyz', 'es'), []);
  assert.ok(suggest(ctx, 'sud', 'es').map(code).includes('SD'));
  assert.ok(suggest(ctx, 'sud', 'es').map(code).includes('ZA')); // "Sudáfrica"
  assert.ok(suggest(ctx, 'unidos', 'es').map(code).includes('US')); // por una palabra del medio del nombre
  assert.equal(suggest(ctx, 'a', 'es', 3).length, 3);
});

test('dailyPick: sin repetir durante 193 días y estable', () => {
  const seen = new Set();
  for (let d = 1; d <= 193; d++) seen.add(dailyPick(ctx.answers, d, 'test').c);
  assert.equal(seen.size, 193);
  assert.equal(dailyPick(ctx.answers, 5, 'test').c, dailyPick(ctx.answers, 5, 'test').c);
  assert.equal(dailyPick(ctx.answers, 1, 'test').c, dailyPick(ctx.answers, 194, 'test').c);
});

test('distancia y rumbo', () => {
  const ar = ctx.byCode.get('AR');
  const cl = ctx.byCode.get('CL');
  const es = ctx.byCode.get('ES');
  const d = distanceKm(ar, es);
  assert.ok(d > 9500 && d < 10800, `Argentina-España ${Math.round(d)} km`);
  assert.equal(arrowFor(bearing(ar, ctx.byCode.get('UY'))), '→');
  assert.equal(arrowFor(bearing(ar, ctx.byCode.get('BO'))), '↑');
  assert.equal(arrowFor(bearing(ar, es)), '↗');
  assert.equal(Math.round(distanceKm(ar, ar)), 0);
  assert.equal(proximity(0), 100);
  assert.equal(proximity(20000), 0);
  assert.equal(proximity(30000), 0);
  assert.equal(nameOf(ar, 'en'), 'Argentina');
});
