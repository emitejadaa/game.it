// Cocina: el núcleo compartido por la pizzería, la heladería y la hamburguesería (azar con semilla, padrón,
// plan del día, rangos, propinas, guardado) y las piezas de mecánica (pintado, reparto parejo, pilas, cocción).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, hash, roster, NAMES, planDay, rankOf, xpFor, waitScore, tipFor, total, mood, money, clock, newSave, fixSave, record, buy, closeness } from '../public/shared/cocina/core.js';
import { Paint, paintScore, evenness, lcs, sequenceMatch, cookScore, fillScore } from '../public/shared/cocina/kit.js';

test('azar con semilla: misma semilla, misma secuencia', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const xa = [a(), a(), a()], xb = [b(), b(), b()];
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, [c(), c(), c()]);
  for (const v of xa) assert.ok(v >= 0 && v < 1);
  assert.equal(hash('pizza'), hash('pizza'));
  assert.notEqual(hash('pizza'), hash('helado'));
});

test('padrón: todos con nombre, cara y rango de llegada; los primeros cuatro desde el rango 1', () => {
  const ppl = roster();
  assert.equal(ppl.length, NAMES.length);
  assert.equal(new Set(ppl.map((p) => p.name)).size, ppl.length);
  assert.equal(ppl.filter((p) => p.unlock === 1).length, 4);
  for (const p of ppl) {
    assert.ok(p.look.skin && p.look.hair && p.look.shirt);
    if (p.kind === 'f') assert.equal(p.look.beard, null);
  }
  // la cara sale de la semilla: igual en cada carga
  assert.deepEqual(roster()[7].look, ppl[7].look);
});

test('plan del día: llegan en orden, sin repetir, solo los que ya se abrieron', () => {
  const people = roster();
  const d1 = planDay({ day: 1, rank: 1, people });
  assert.equal(d1.length, 3);
  assert.ok(d1.every((e) => people[e.p].unlock <= 1));
  for (let day = 2; day < 30; day++) {
    const rank = Math.min(12, 1 + Math.floor(day / 2));
    const plan = planDay({ day, rank, people, lastVisit: {} });
    assert.equal(new Set(plan.map((e) => e.p)).size, plan.length);
    assert.ok(plan.every((e) => people[e.p].unlock <= rank));
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].at > plan[i - 1].at + 20, 'deja tiempo entre llegadas');
  }
  // el cartel suma un cliente
  const base = planDay({ day: 6, rank: 6, people }).length;
  assert.equal(planDay({ day: 6, rank: 6, people, extra: 1 }).length, base + 1);
});

test('rangos: umbrales crecientes y avance dentro del rango', () => {
  assert.equal(rankOf(0).rank, 1);
  assert.equal(rankOf(xpFor(2)).rank, 2);
  assert.equal(rankOf(xpFor(2) - 1).rank, 1);
  for (let r = 2; r < 25; r++) assert.ok(xpFor(r + 1) - xpFor(r) > xpFor(r) - xpFor(r - 1));
  const k = rankOf(xpFor(3) + (xpFor(4) - xpFor(3)) / 2).k;
  assert.ok(Math.abs(k - 0.5) < 1e-9);
});

test('espera, propinas, total y reacción', () => {
  assert.equal(waitScore(30, 60), 100);
  assert.ok(waitScore(120, 60) < waitScore(90, 60));
  assert.ok(waitScore(120, 60, 1.6) > waitScore(120, 60, 1), 'las sillas cómodas dan más paciencia');
  assert.equal(waitScore(10000, 60), 0);
  assert.ok(tipFor(100, 3) > tipFor(90, 3) && tipFor(90, 3) > tipFor(50, 3));
  assert.equal(tipFor(0, 3), 0);
  assert.ok(tipFor(80, 3, 1.3) > tipFor(80, 3, 1));
  assert.equal(total([{ score: 100 }, { score: 50 }]), 75);
  assert.equal(mood(95), 'love');
  assert.equal(mood(40), 'sad');
  assert.equal(money(3.5, 'es'), '$ 3,50');
  assert.equal(money(3.5, 'en'), '$3.50');
  assert.equal(clock(0), '11:00');
  assert.equal(clock(75), '12:15');
  assert.equal(closeness(10, 10, 1, 5), 100);
  assert.equal(closeness(15, 10, 1, 5), 0);
});

test('guardado: se arregla si viene roto y registra visitas, plata y compras', () => {
  assert.deepEqual(fixSave(null), newSave());
  assert.deepEqual(fixSave({ v: 99 }), newSave());
  const s = fixSave({ ...newSave(), day: 3.7, money: -4, xp: 'x' });
  assert.equal(s.day, 3);
  assert.equal(s.money, 0);
  assert.equal(s.xp, 0);
  record(s, 5, 92, 4.25);
  record(s, 5, 100, 3);
  assert.equal(s.visits[5], 2);
  assert.equal(s.best[5], 100);
  assert.equal(s.money, 7.25);
  assert.equal(s.stats.perfect, 1);
  const up = { id: 'horno', cost: [5, 10], max: 2 };
  assert.ok(buy(s, up));
  assert.equal(s.upgrades.horno, 1);
  assert.equal(s.money, 2.25);
  assert.ok(!buy(s, up), 'no alcanza la plata');
  s.money = 100;
  assert.ok(buy(s, up));
  assert.ok(!buy(s, up), 'ya está al máximo');
});

test('pintado: cobertura de la zona y lo que se chorrea afuera', () => {
  const inside = (x, y) => x * x + y * y < 0.8 * 0.8;
  const p = new Paint(40);
  assert.equal(p.coverage(inside), 0);
  for (let y = -0.8; y <= 0.8; y += 0.1) for (let x = -0.8; x <= 0.8; x += 0.1) if (x * x + y * y < 0.7 * 0.7) p.paint(x, y, 0.1);
  assert.ok(p.coverage(inside) > 0.8);
  const s = paintScore(p, inside);
  assert.ok(s.score >= 85, `cubierto: ${JSON.stringify(s)}`);
  const half = new Paint(40);
  half.line(-0.7, 0, 0.7, 0, 0.3);
  assert.ok(paintScore(half, inside).score < s.score);
  const messy = new Paint(40);
  for (let y = -1; y <= 1; y += 0.1) for (let x = -1; x <= 1; x += 0.1) messy.paint(x, y, 0.12);
  assert.ok(paintScore(messy, inside).score < 30, 'todo enchastrado');
});

test('reparto parejo, orden de la pila, cocción y llenado', () => {
  const ring = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i * 0.785) * 0.55, y: Math.sin(i * 0.785) * 0.55 }));
  const pile = Array.from({ length: 8 }, (_, i) => ({ x: 0.02 * i, y: 0.01 * i }));
  const area = Math.PI * 0.84 * 0.84;
  assert.ok(evenness(ring, area) > 0.9);
  assert.ok(evenness(pile, area) < 0.2);
  assert.equal(lcs(['a', 'b', 'c'], ['a', 'c']), 2);
  assert.equal(sequenceMatch(['pan', 'carne', 'queso', 'pan'], ['pan', 'carne', 'queso', 'pan']), 1);
  assert.ok(sequenceMatch(['pan', 'carne', 'queso', 'pan'], ['pan', 'queso', 'carne', 'pan']) < 1);
  assert.equal(cookScore(4, 4), 100);
  assert.ok(cookScore(5, 4) < 100 && cookScore(5, 4) > cookScore(6, 4));
  assert.ok(cookScore(9, 8.5, { burn: 8 }) <= 25, 'quemado');
  assert.equal(fillScore(0.5, 0.5), 100);
  assert.ok(fillScore(0.8, 0.5) < fillScore(0.6, 0.5));
});
