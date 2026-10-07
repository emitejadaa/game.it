/** Silueta: datos (siluetas), respuestas posibles, ciclo diario y cálculo de distancia, flecha y texto para compartir. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCountries, dailyPick } from '../public/shared/countries/countries.js';
import { poolOf, roundKm, guessInfo, emojiArrow, squares, shareRow, shareText, closestIndex, MIN_KM2, TRIES } from '../public/games/silueta/logic.js';

let ctx;
let shapes;
let pool;
before(async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL('../public/shared/countries/countries.json', import.meta.url), 'utf8')) });
  ctx = await loadCountries();
  shapes = JSON.parse(readFileSync(new URL('../public/games/silueta/shapes.json', import.meta.url), 'utf8'));
  pool = poolOf(ctx.answers, shapes);
});
const get = (code) => ctx.byCode.get(code);

test('hay silueta para las 193 posibles respuestas, hecha solo de M/L/Z y números, dentro de la caja 0..100', () => {
  assert.equal(Object.keys(shapes).length, 193);
  for (const c of ctx.answers) {
    const s = shapes[c.c];
    assert.ok(s?.d?.length > 10, `${c.c} sin trazo`);
    assert.match(s.d, /^M[-\d. MLZ]+Z$/, `${c.c} trazo inválido`);
    assert.ok(!/[A-KN-Ya-z]/.test(s.d), `${c.c} comandos no permitidos`);
    const nums = s.d.match(/-?\d+(\.\d+)?/g).map(Number);
    assert.ok(nums.every((n) => n >= -0.01 && n <= 100.01), `${c.c} fuera de la caja`);
    assert.ok(s.w > 0 && s.w <= 100 && s.h > 0 && s.h <= 100, `${c.c} w/h`);
    assert.ok(Math.max(s.w, s.h) >= 99.9, `${c.c} no llena la caja`);
  }
});

test('el grupo de respuestas son los países de 2500 km² o más', () => {
  assert.equal(pool.length, 167);
  assert.ok(pool.every((c) => c.a && c.km2 >= MIN_KM2));
  assert.ok(pool.some((c) => c.c === 'AR'));
  assert.ok(!pool.some((c) => c.c === 'VA' || c.c === 'MC' || c.c === 'MT'));
});

test('dailyPick recorre todo el grupo sin repetir en un ciclo completo y es estable', () => {
  const seen = new Set();
  for (let d = 1; d <= pool.length; d++) seen.add(dailyPick(pool, d, 'silueta').c);
  assert.equal(seen.size, pool.length);
  assert.equal(dailyPick(pool, 1, 'silueta').c, dailyPick(pool, 1 + pool.length, 'silueta').c);
  assert.equal(dailyPick(pool, 5, 'silueta').c, dailyPick([...pool].reverse(), 5, 'silueta').c);
});

test('guessInfo: distancia, rumbo y cercanía de pares conocidos', () => {
  const ar = get('AR');
  const cl = get('CL');
  const br = get('BR');
  const au = get('AU');
  const a = guessInfo(cl, ar); // de Chile hacia Argentina: al este
  assert.ok(a.km > 700 && a.km < 1400, `AR-CL ${a.km}`);
  assert.ok(['➡️', '↗️'].includes(emojiArrow(a.deg)), emojiArrow(a.deg));
  const b = guessInfo(br, ar); // de Brasil hacia Argentina: al sur/suroeste
  assert.ok(['⬇️', '↙️'].includes(emojiArrow(b.deg)), emojiArrow(b.deg));
  const c = guessInfo(au, ar); // Australia queda lejos
  assert.ok(c.km > 11000 && c.pct < 50, `AR-AU ${c.km}`);
  const win = guessInfo(ar, ar);
  assert.deepEqual(win, { right: true, km: 0, deg: 0, pct: 100 });
});

test('un error nunca llega a 100 % aunque los centros estén cerca', () => {
  const x = guessInfo(get('LU'), get('BE'));
  assert.equal(x.right, false);
  assert.ok(x.pct <= 99);
});

test('roundKm redondea a 10 km', () => {
  assert.equal(roundKm(1234.4), 1230);
  assert.equal(roundKm(1235), 1240);
  assert.equal(roundKm(4), 0);
});

test('flechas de emoji en las 8 direcciones y cuadrados por cercanía', () => {
  const deg = [0, 45, 90, 135, 180, 225, 270, 315, 359];
  assert.deepEqual(deg.map(emojiArrow), ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '⬆️']);
  assert.equal(squares(0), '⬜⬜⬜⬜⬜');
  assert.equal(squares(19), '⬜⬜⬜⬜⬜');
  assert.equal(squares(20), '🟩⬜⬜⬜⬜');
  assert.equal(squares(99), '🟩🟩🟩🟩⬜');
  assert.equal(squares(100), '🟩🟩🟩🟩🟩');
  assert.equal(shareRow({ right: true, pct: 100, deg: 0 }), '🟩🟩🟩🟩🟩🎉');
  assert.equal(shareRow({ right: false, pct: 63, deg: 92 }), '🟩🟩🟩⬜⬜➡️');
});

test('texto para compartir: encabezado con k/6 o X/6, una línea por intento y el enlace', () => {
  const infos = [
    { right: false, pct: 45, deg: 225 },
    { right: true, pct: 100, deg: 0 },
  ];
  assert.equal(shareText({ name: 'Silueta', dayNo: 3, infos, won: true, link: 'https://x/#play/silueta' }), 'game.it · Silueta #3 2/6\n\n🟩🟩⬜⬜⬜↙️\n🟩🟩🟩🟩🟩🎉\nhttps://x/#play/silueta');
  const lost = Array.from({ length: TRIES }, () => ({ right: false, pct: 10, deg: 90 }));
  assert.ok(shareText({ name: 'Silueta', dayNo: 9, infos: lost, won: false, link: 'l' }).startsWith('game.it · Silueta #9 X/6\n'));
});

test('closestIndex marca el intento erróneo más cercano (solo con 2 o más intentos)', () => {
  assert.equal(closestIndex([{ km: 500 }]), -1);
  assert.equal(closestIndex([{ km: 900 }, { km: 300 }, { km: 700 }]), 1);
  assert.equal(closestIndex([{ km: 900 }, { right: true, km: 0 }]), 0);
});
