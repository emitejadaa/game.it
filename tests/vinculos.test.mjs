/** Vínculos: lógica pura (public/games/vinculos/logic.js) y validación de los desafíos reales. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/games/vinculos/logic.js';
import * as D from '../public/shared/daily.js';
import { validate, checkFiles } from '../tools/daily/vinculos-check.mjs';

const pz = {
  grupos: [
    { nivel: 1, tema: 'Frutas', palabras: ['PERA', 'UVA', 'KIWI', 'LIMA'] },
    { nivel: 2, tema: 'Ciudades', palabras: ['ROMA', 'QUITO', 'MADRID', 'PARÍS'] },
    { nivel: 3, tema: 'Colores', palabras: ['ROJO', 'VERDE', 'ROSA', 'AZUL'] },
    { nivel: 4, tema: 'Esconden un animal', palabras: ['GLOBO', 'PIRATA', 'ESPOSO', 'GRANADA'] },
  ],
};

test('checkSelection: grupo completo, a una y error', () => {
  assert.deepEqual(L.checkSelection(pz, ['ROMA', 'QUITO', 'MADRID', 'PARÍS']), { ok: true, group: 1 });
  assert.deepEqual(L.checkSelection(pz, ['PARÍS', 'MADRID', 'QUITO', 'ROMA']), { ok: true, group: 1 }); // el orden no importa
  assert.deepEqual(L.checkSelection(pz, ['ROMA', 'QUITO', 'MADRID', 'UVA']), { oneAway: true });
  assert.deepEqual(L.checkSelection(pz, ['ROMA', 'QUITO', 'UVA', 'KIWI']), { wrong: true });
  assert.deepEqual(L.checkSelection(pz, ['ROMA', 'UVA', 'ROJO', 'GLOBO']), { wrong: true });
  assert.deepEqual(L.checkSelection(pz, ['ROMA', 'QUITO', 'MADRID']), { wrong: true }); // faltan palabras
});

test('comboKey ignora el orden', () => {
  assert.equal(L.comboKey(['B', 'A', 'D', 'C']), L.comboKey(['A', 'B', 'C', 'D']));
  assert.notEqual(L.comboKey(['A', 'B', 'C', 'D']), L.comboKey(['A', 'B', 'C', 'E']));
});

test('initialOrder: estable con la misma semilla, 16 palabras y ninguna fila resuelta', () => {
  const a = L.initialOrder(pz, D.rng('vinculos:es:2026-10-06'));
  const b = L.initialOrder(pz, D.rng('vinculos:es:2026-10-06'));
  assert.deepEqual(a, b);
  assert.ok(L.validOrder(pz, a));
  assert.notDeepEqual(a, L.allWords(pz));
  for (let d = 1; d <= 200; d++) {
    const o = L.initialOrder(pz, D.rng(`vinculos:es:${d}`));
    for (let r = 0; r < 16; r += 4) {
      const g = L.groupOf(pz, o[r]);
      assert.ok(!o.slice(r, r + 4).every((w) => L.groupOf(pz, w) === g), `día ${d}: fila ${r / 4} ya resuelta`);
    }
  }
});

test('validOrder rechaza órdenes mal formados', () => {
  const o = L.allWords(pz);
  assert.ok(L.validOrder(pz, o));
  assert.ok(!L.validOrder(pz, o.slice(1)));
  assert.ok(!L.validOrder(pz, [...o.slice(1), 'XXXX']));
  assert.ok(!L.validOrder(pz, [...o.slice(1), o[1]]));
  assert.ok(!L.validOrder(pz, null));
});

test('reshuffle: solo mezcla las que quedan y siempre cambia el orden', () => {
  const order = L.allWords(pz);
  const found = new Set(pz.grupos[0].palabras);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const next = L.reshuffle(pz, order, found, D.rng('s' + i));
    assert.ok(L.validOrder(pz, next));
    const left = L.remaining(next, found);
    assert.equal(left.length, 12);
    assert.notDeepEqual(left, L.remaining(order, found));
    assert.deepEqual(next.slice(12).sort(), [...found].sort()); // las encontradas quedan al final
    seen.add(left.join());
  }
  assert.ok(seen.size > 20);
});

test('derive: grupos hallados, errores y combinaciones probadas', () => {
  const g1 = pz.grupos[1].palabras;
  const g0 = pz.grupos[0].palabras;
  const bad = ['ROMA', 'UVA', 'ROJO', 'GLOBO'];
  let s = L.derive(pz, [g1, bad]);
  assert.deepEqual(s.found, [1]);
  assert.equal(s.mistakes, 1);
  assert.ok(s.tried.has(L.comboKey(bad)));
  assert.ok(!s.over);
  // ganar con 1 error
  s = L.derive(pz, [bad, g1, g0, pz.grupos[2].palabras, pz.grupos[3].palabras]);
  assert.ok(s.won && s.over && !s.lost);
  assert.deepEqual(s.found, [1, 0, 2, 3]);
  assert.equal(s.mistakes, 1);
  // perder con 4 errores (ignora jugadas posteriores)
  const w = [['ROMA', 'UVA', 'ROJO', 'GLOBO'], ['ROMA', 'UVA', 'ROJO', 'PIRATA'], ['KIWI', 'UVA', 'ROJO', 'PIRATA'], ['KIWI', 'QUITO', 'ROJO', 'PIRATA']];
  s = L.derive(pz, [...w, g1]);
  assert.ok(s.lost && s.over && !s.won);
  assert.equal(s.mistakes, 4);
  assert.deepEqual(s.found, []);
  assert.deepEqual(L.missing(pz, [1]), [0, 2, 3]); // del más fácil al más difícil
  assert.deepEqual(L.missing(pz, []), [0, 1, 2, 3]);
});

test('validPicks', () => {
  assert.ok(L.validPicks(pz, []));
  assert.ok(L.validPicks(pz, [['ROMA', 'QUITO', 'UVA', 'PERA']]));
  assert.ok(!L.validPicks(pz, [['ROMA', 'QUITO', 'UVA']]));
  assert.ok(!L.validPicks(pz, [['ROMA', 'ROMA', 'UVA', 'PERA']]));
  assert.ok(!L.validPicks(pz, [['ROMA', 'QUITO', 'UVA', 'ZZZ']]));
  assert.ok(!L.validPicks(pz, 'x'));
});

test('pickPuzzle: el desafío N es el (N-1) módulo el largo', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(L.pickPuzzle(list, 1), 'a');
  assert.equal(L.pickPuzzle(list, 3), 'c');
  assert.equal(L.pickPuzzle(list, 4), 'a');
  assert.equal(L.pickPuzzle(list, 7), 'a');
  assert.equal(L.pickPuzzle(list, 8), 'b');
});

test('fontSize: palabras largas más chicas, con piso y techo', () => {
  assert.equal(L.fontSize('SOL'), 17);
  assert.ok(L.fontSize('MEDIANOCHE') < L.fontSize('PIANO'));
  assert.ok(L.fontSize('UNIVERSIDAD') >= 9);
  assert.equal(L.fontSize('ABCDEFGHIJKLMNOP'), 9);
  // las de dos palabras se miden por la más larga (se parten en el espacio)
  assert.equal(L.fontSize('AÑO NUEVO'), L.fontSize('NUEVO'));
  // a 360 px la ficha deja unos 71 px: con 0,6 em por letra la palabra más larga entra
  for (const w of ['MEDIANOCHE', 'UNIVERSIDAD', 'MATEMÁTICA', 'HIPOPÓTAMO', 'ABRILLANTAR']) assert.ok(w.length * 0.6 * L.fontSize(w) <= 71, w);
});

test('shareText: errores y una fila de cuadraditos por jugada, en el orden elegido', () => {
  const picks = [['UVA', 'ROMA', 'PERA', 'KIWI'], pz.grupos[0].palabras, ['GLOBO', 'PIRATA', 'ROJO', 'ROMA'], pz.grupos[1].palabras];
  const txt = L.shareText({ pz, picks, mistakes: 2, dayNo: 7, link: 'https://x/#play/vinculos' });
  assert.equal(txt.split('\n')[0], 'game.it · Vínculos #7');
  assert.equal(txt.split('\n')[1], 'errores: 2');
  const rows = txt.split('\n').filter((l) => /^[🟨🟩🟦🟪]+$/u.test(l));
  assert.deepEqual(rows, ['🟨🟩🟨🟨', '🟨🟨🟨🟨', '🟪🟪🟦🟩', '🟩🟩🟩🟩']);
  assert.ok(txt.endsWith('https://x/#play/vinculos'));
  assert.equal(L.shareText({ pz, picks: [], mistakes: 0, dayNo: 1, lang: 'en' }).split('\n')[1], 'mistakes: 0');
});

// ---------------------------------------------------------------- datos reales
test('validate detecta desafíos mal armados', () => {
  const ok = () => JSON.parse(JSON.stringify([pz]));
  assert.deepEqual(validate(ok()).errors, []);
  let p = ok();
  p[0].grupos[3].nivel = 3;
  assert.match(validate(p).errors.join(), /niveles/);
  p = ok();
  p[0].grupos[0].palabras[0] = 'ROMA';
  assert.match(validate(p).errors.join(), /repetida/);
  p = ok();
  p[0].grupos[2].tema = '  ';
  assert.match(validate(p).errors.join(), /sin tema/);
  p = ok();
  p[0].grupos[1].palabras.pop();
  assert.match(validate(p).errors.join(), /4 palabras/);
  p = ok();
  p[0].grupos.pop();
  assert.match(validate(p).errors.join(), /4 grupos/);
  p = ok();
  p[0].grupos[0].palabras[1] = 'roma'; // igual a otra tras normalizar
  p[0].grupos[0].palabras[0] = 'Róma';
  assert.match(validate(p).errors.join(), /repetida/);
  assert.match(validate([]).errors.join(), /arreglo/);
});

test('validate avisa de temas y palabras repetidas', () => {
  const a = JSON.parse(JSON.stringify(pz));
  const b = JSON.parse(JSON.stringify(pz));
  const r = validate([a, b]);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /tema repetido/.test(w)));
  assert.ok(r.warnings.some((w) => /desafíos seguidos/.test(w)));
});

test('los desafíos reales (es y, si ya existe, en) pasan la validación', () => {
  const res = checkFiles();
  const es = res.find((r) => r.lang === 'es');
  assert.ok(es.found, 'falta data/puzzles-es.json');
  assert.ok(es.count >= 60, `solo hay ${es.count} desafíos en español`);
  for (const r of res.filter((x) => x.found)) {
    assert.deepEqual(r.errors, [], `${r.lang}: ${r.errors.join(' | ')}`);
    assert.deepEqual(r.warnings, [], `${r.lang}: ${r.warnings.join(' | ')}`);
  }
});
