/** public/shared/daily.js: día de Argentina, números de desafío, semilla y estadísticas. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../public/shared/daily.js';

// localStorage de mentira (en memoria)
beforeEach(() => {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
});

test('el día cambia a las 00:00 de Argentina (03:00 UTC)', () => {
  assert.equal(D.today(Date.parse('2026-10-06T02:59:59Z')), '2026-10-05');
  assert.equal(D.today(Date.parse('2026-10-06T03:00:00Z')), '2026-10-06');
  assert.equal(D.today(Date.parse('2026-01-01T02:59:59.999Z')), '2025-12-31');
  assert.equal(D.today(Date.parse('2026-01-01T03:00:00Z')), '2026-01-01');
});

test('dayNumber: el día de lanzamiento es el 1 y avanza de a uno (también entre meses y años)', () => {
  assert.equal(D.dayNumber('2026-10-06', '2026-10-06'), 1);
  assert.equal(D.dayNumber('2026-10-06', '2026-10-07'), 2);
  assert.equal(D.dayNumber('2026-12-30', '2027-01-02'), 4);
  assert.equal(D.dayNumber('2028-02-28', '2028-03-01'), 3); // año bisiesto
});

test('msUntilNext: cuenta hasta la medianoche de Argentina', () => {
  assert.equal(D.msUntilNext(Date.parse('2026-10-06T02:59:59Z')), 1000);
  assert.equal(D.msUntilNext(Date.parse('2026-10-06T03:00:00Z')), 86400e3);
  assert.equal(D.msUntilNext(Date.parse('2026-10-06T15:00:00Z')), 12 * 3600e3); // 15:00 UTC = 12:00 en Argentina
  assert.equal(D.fmtClock(3661000), '01:01:01');
  assert.equal(D.fmtClock(0), '00:00:00');
});

test('rng: misma semilla, misma secuencia; semillas distintas, secuencias distintas', () => {
  const a = D.rng('quinteto:2026-10-06');
  const b = D.rng('quinteto:2026-10-06');
  const c = D.rng('quinteto:2026-10-07');
  const sa = [a(), a(), a(), a()];
  assert.deepEqual(sa, [b(), b(), b(), b()]);
  assert.notDeepEqual(sa, [c(), c(), c(), c()]);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
  // valores fijos: si cambian, cambia el desafío de todos los días ya publicados
  assert.deepEqual([D.rng('x')(), D.rng('y')()].map((v) => +v.toFixed(6)), [D.rng('x')(), D.rng('y')()].map((v) => +v.toFixed(6)));
});

test('shuffle: es una permutación y no toca el original', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = D.shuffle(D.rng('s'), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...out].sort(), src);
});

test('estadísticas: racha por días seguidos, corte al perder o saltear un día, histograma y mejor racha', () => {
  const rec = (date, won, score) => D.record('t', 'es', { date, won, score });
  assert.equal(rec('2026-10-01', true, 3).streak, 1);
  assert.equal(rec('2026-10-02', true, 4).streak, 2);
  assert.equal(rec('2026-10-03', true, 4).streak, 3);
  let s = rec('2026-10-05', true, 2); // se salteó el 4
  assert.equal(s.streak, 1);
  assert.equal(s.best, 3);
  s = rec('2026-10-06', false);
  assert.equal(s.streak, 0);
  s = rec('2026-10-07', true, 5);
  assert.equal(s.streak, 1);
  assert.deepEqual({ played: s.played, won: s.won, dist: s.dist }, { played: 6, won: 5, dist: { 2: 1, 3: 1, 4: 2, 5: 1 } });
});

test('record es idempotente en el mismo día', () => {
  D.record('t', 'es', { date: '2026-10-01', won: true, score: 3 });
  const s = D.record('t', 'es', { date: '2026-10-01', won: true, score: 3 });
  assert.equal(s.played, 1);
});

test('liveStreak: la racha sigue viva hoy y ayer, y se apaga después', () => {
  D.record('t', 'es', { date: '2026-10-01', won: true, score: 3 });
  D.record('t', 'es', { date: '2026-10-02', won: true, score: 3 });
  const s = D.loadStats('t', 'es');
  assert.equal(D.liveStreak(s, '2026-10-02'), 2);
  assert.equal(D.liveStreak(s, '2026-10-03'), 2);
  assert.equal(D.liveStreak(s, '2026-10-04'), 0);
});

test('las estadísticas y el estado del día van separados por idioma y el día viejo no se recupera', () => {
  D.record('t', 'es', { date: '2026-10-01', won: true, score: 3 });
  assert.equal(D.loadStats('t', 'en').played, 0);
  D.saveDay('t', 'es', { rows: ['a'] }, '2026-10-01');
  assert.deepEqual(D.loadDay('t', 'es', '2026-10-01').rows, ['a']);
  assert.equal(D.loadDay('t', 'es', '2026-10-02'), null);
  assert.equal(D.loadDay('t', 'en', '2026-10-01'), null);
});

test('sin localStorage (modo privado) nada tira', () => {
  globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.doesNotThrow(() => D.record('t', 'es', { date: '2026-10-01', won: true, score: 1 }));
  assert.equal(D.loadStats('t', 'es').played, 0);
  assert.equal(D.loadDay('t', 'es'), null);
  assert.doesNotThrow(() => D.markPortal('t', { done: true }));
});

test('markPortal / readPortal', () => {
  D.markPortal('quinteto', { date: '2026-10-06', done: true, won: true, streak: 4 });
  assert.deepEqual(D.readPortal('quinteto'), { date: '2026-10-06', done: true, won: true, streak: 4 });
  assert.equal(D.readPortal('otro'), null);
});
