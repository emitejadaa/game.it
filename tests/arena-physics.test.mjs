/** Física de discos compartida (Sumo y Rey de la Colina): movimiento, choques, rebotes, habilidades, entradas y determinismo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TPS, DT, CTRL, MOVE_STILL, MOVE_UP, MOVE_X, MOVE_Y, encodeMove, validMove, newDisc, setMove, steer, dash, wave, act, queueInputs, applyInputs, stepMotion, stepOwn, collide, collideAll, bounceRect, blast, kinetic, momentum, speedOf } from '../public/shared/arena-physics.js';

function lcg(seed) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}
const at = (x, y, o = {}) => newDisc({ x, y, ...o });

test('paso fijo de 1/30 s', () => {
  assert.equal(TPS, 30);
  assert.equal(DT, 1 / 30);
});

test('código de movimiento: ida y vuelta, módulo ≤ 1 y quieto = 40', () => {
  assert.equal(MOVE_STILL, 40);
  assert.equal(encodeMove(0, 0), MOVE_STILL);
  assert.equal(encodeMove(0, -1), MOVE_UP);
  assert.equal(encodeMove(NaN, 3), MOVE_STILL, 'basura → quieto');
  for (let c = 0; c <= 80; c++) {
    assert.ok(validMove(c));
    assert.ok(Math.hypot(MOVE_X[c], MOVE_Y[c]) <= 1 + 1e-12, `código ${c}`);
    // ida y vuelta: el código que sale apunta casi igual (las esquinas se normalizan y se vuelven a redondear)
    const c2 = encodeMove(MOVE_X[c], MOVE_Y[c]);
    const l1 = Math.hypot(MOVE_X[c], MOVE_Y[c]);
    const l2 = Math.hypot(MOVE_X[c2], MOVE_Y[c2]);
    if (l1 > 0) assert.ok((MOVE_X[c] * MOVE_X[c2] + MOVE_Y[c] * MOVE_Y[c2]) / (l1 * l2) > 0.96, `ida y vuelta ${c}`);
    else assert.equal(c2, MOVE_STILL);
  }
  // diagonal del teclado: (4, 4) se normaliza (no corre más rápido en diagonal)
  const d = encodeMove(1, 1);
  assert.ok(Math.abs(Math.hypot(MOVE_X[d], MOVE_Y[d]) - 1) < 1e-12);
  assert.equal(validMove(81), false);
  assert.equal(validMove(-1), false);
  assert.equal(validMove(3.5), false);
  assert.equal(validMove('40'), false);
  // un vector enorme se recorta
  assert.equal(encodeMove(1000, 0), encodeMove(1, 0));
});

test('movimiento: acelera hasta la velocidad terminal y se frena solo al soltar', () => {
  const p = at(0, 0);
  setMove(p, encodeMove(1, 0));
  for (let i = 0; i < 120; i++) stepMotion(p);
  const vmax = (CTRL.acc * CTRL.damping) / (1 - CTRL.damping);
  assert.ok(Math.abs(p.vx - vmax) < 0.5 && Math.abs(vmax - 252) < 1, `terminal ${p.vx} ≈ ${vmax}`);
  assert.ok(Math.abs(p.vy) < 1e-9);
  assert.ok(p.x > 800);
  setMove(p, MOVE_STILL);
  for (let i = 0; i < 90; i++) stepMotion(p);
  assert.ok(speedOf(p) < 1, 'se frena');
  assert.ok(p.fx === 1 && p.fy === 0, 'y sigue mirando hacia donde iba');
  // responde enseguida: en 6 pasos ya va a más de la mitad
  const q = at(0, 0);
  setMove(q, encodeMove(0, 1));
  for (let i = 0; i < 7; i++) stepMotion(q);
  assert.ok(q.vy > vmax * 0.5, `a los 7 pasos (0,23 s) ya va a ${q.vy}`);
});

test('Empujón: suma velocidad hacia donde mira, recarga 1,2 s y pesa más mientras dura', () => {
  const p = at(0, 0);
  setMove(p, encodeMove(1, 0));
  stepMotion(p);
  const v0 = p.vx;
  assert.equal(dash(p), true);
  assert.equal(p.vx - v0, CTRL.dashSpeed);
  assert.ok(p.invMass < p.invMass0, 'más pesado');
  assert.equal(dash(p), false, 'recarga');
  assert.equal(p.dashCd, 36);
  for (let i = 0; i < CTRL.dashTicks; i++) stepMotion(p);
  assert.equal(p.invMass, p.invMass0, 'vuelve a su peso');
  for (let i = 0; i < 36 - CTRL.dashTicks; i++) stepMotion(p);
  assert.equal(p.dashCd, 0);
  assert.equal(dash(p), true);
  assert.equal(CTRL.dashCd / TPS, 1.2);
  assert.equal(CTRL.waveCd / TPS, 6);
});

test('Onda: solo arranca la recarga de 6 s; act() distingue las dos habilidades', () => {
  const p = at(0, 0);
  assert.equal(act(p, 2), 2);
  assert.equal(act(p, 2), 0);
  assert.equal(p.waveCd, 180);
  assert.equal(act(p, 1), 1);
  assert.equal(act(p, 0), 0);
  assert.equal(act(p, 7), 0);
  assert.equal(wave(p), false);
  for (let i = 0; i < 180; i++) stepMotion(p);
  assert.equal(wave(p), true);
});

test('steer (bots): vector libre, módulo acotado y mirada exacta', () => {
  const p = at(0, 0);
  steer(p, 300, 400);
  assert.ok(Math.abs(Math.hypot(p.mx, p.my) - 1) < 1e-12);
  assert.ok(Math.abs(p.fx - 0.6) < 1e-12 && Math.abs(p.fy - 0.8) < 1e-12);
  steer(p, 0.1, 0);
  assert.ok(Math.abs(p.mx - 0.1) < 1e-12, 'poco empuje = poco empuje');
  steer(p, 0, 0);
  assert.equal(p.mx + p.my, 0);
  assert.ok(Math.abs(p.fx - 1) < 1e-12, 'sin orden conserva la mirada');
});

test('choque elástico entre iguales (e = 1): intercambian velocidad y se conservan impulso y energía', () => {
  const a = at(0, 0, { vx: 300 });
  const b = at(30, 0, { vx: 0 });
  const k0 = kinetic([a, b]);
  const m0 = momentum([a, b]);
  const s = collide(a, b, 1);
  assert.ok(Math.abs(s - 300) < 1e-9, 'velocidad de acercamiento');
  assert.ok(Math.abs(a.vx) < 1e-9 && Math.abs(b.vx - 300) < 1e-9);
  assert.ok(Math.abs(kinetic([a, b]) - k0) < 1e-6);
  assert.ok(Math.abs(momentum([a, b]).x - m0.x) < 1e-6);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 1e-9, 'quedan separados');
});

test('choque con masas distintas: se conserva el impulso, el liviano sale más rápido y el pesado se corre menos', () => {
  const heavy = at(0, 0, { vx: 200, invMass: 0.25 }); // masa 4
  const light = at(30, 0, { vx: 0, invMass: 1 });
  const m0 = momentum([heavy, light]);
  collide(heavy, light, 1);
  assert.ok(Math.abs(momentum([heavy, light]).x - m0.x) < 1e-6);
  assert.ok(light.vx > heavy.vx);
  assert.ok(light.vx > 200, 'el liviano sale disparado');
  const h2 = at(0, 0, { invMass: 0.25 });
  const l2 = at(20, 0, { invMass: 1 });
  collide(h2, l2, 1);
  assert.ok(Math.abs(h2.x) < Math.abs(l2.x - 20), 'el pesado se corre menos al separarse');
});

test('sin choque si no se tocan o ya se alejan; encimados exactos se separan sin NaN', () => {
  const a = at(0, 0, { vx: 100 });
  const b = at(100, 0);
  assert.equal(collide(a, b), 0);
  const c = at(0, 0, { vx: -100 });
  const d = at(30, 0, { vx: 100 });
  assert.equal(collide(c, d), 0, 'se alejan: se separan pero no hay impulso');
  const e = at(5, 5);
  const f = at(5, 5);
  collide(e, f);
  assert.ok(Number.isFinite(e.x) && Number.isFinite(f.x));
  assert.ok(e.x !== f.x);
  const wall = at(0, 0, { invMass: 0 });
  assert.equal(collide(wall, at(0, 0, { invMass: 0 })), 0, 'dos inmóviles');
});

test('ningún choque gana energía: 12 discos con restitución 0,85 sin motor solo pierden', () => {
  const rnd = lcg(7);
  const discs = Array.from({ length: 12 }, () => at((rnd() - 0.5) * 300, (rnd() - 0.5) * 300, { vx: (rnd() - 0.5) * 900, vy: (rnd() - 0.5) * 900, invMass: 0.5 + rnd(), damping: 1 }));
  let prev = kinetic(discs);
  let hits = 0;
  for (let t = 0; t < 600; t++) {
    for (const d of discs) {
      d.x += d.vx * DT;
      d.y += d.vy * DT;
      bounceRect(d, 220, 220, 1); // pared perfecta: no resta ni suma
    }
    hits += collideAll(discs, 0.85);
    const k = kinetic(discs);
    assert.ok(k <= prev * (1 + 1e-9) + 1e-6, `paso ${t}: ${k} > ${prev}`);
    prev = k;
  }
  assert.ok(hits > 50, `hubo choques (${hits})`);
  // y con e = 1 y paredes perfectas la energía se mantiene
  const rnd2 = lcg(9);
  const eq = Array.from({ length: 8 }, () => at((rnd2() - 0.5) * 300, (rnd2() - 0.5) * 300, { vx: (rnd2() - 0.5) * 600, vy: (rnd2() - 0.5) * 600, damping: 1 }));
  const k0 = kinetic(eq);
  for (let t = 0; t < 300; t++) {
    for (const d of eq) {
      d.x += d.vx * DT;
      d.y += d.vy * DT;
      bounceRect(d, 250, 250, 1);
    }
    collideAll(eq, 1);
  }
  assert.ok(Math.abs(kinetic(eq) - k0) / k0 < 0.02, `energía ${kinetic(eq)} vs ${k0}`);
});

test('collideAll avisa cada choque con la velocidad de acercamiento', () => {
  const list = [at(0, 0, { vx: 100 }), at(30, 0), at(500, 500)];
  const got = [];
  const n = collideAll(list, 0.85, (a, b, s) => got.push([list.indexOf(a), list.indexOf(b), s]));
  assert.equal(n, 1);
  assert.deepEqual(got.map((g) => g.slice(0, 2)), [[0, 1]]);
  assert.ok(Math.abs(got[0][2] - 100) < 1e-9);
});

test('paredes: rebota con restitución, nunca sale del rectángulo y las esquinas rebotan en los dos ejes', () => {
  const d = at(190, 0, { vx: 400 });
  const hit = bounceRect(d, 200, 200, 0.8);
  assert.ok(Math.abs(hit - 400) < 1e-9);
  assert.equal(d.x, 200 - d.r);
  assert.ok(Math.abs(d.vx + 320) < 1e-9);
  const c = at(-199, 199, { vx: -100, vy: 50 });
  bounceRect(c, 200, 200, 1);
  assert.deepEqual([c.x, c.y, c.vx, c.vy], [-182, 182, 100, -50]);
  const s = at(0, 0, { vx: 10 });
  assert.equal(bounceRect(s, 200, 200), 0);
});

test('Onda: empuja hacia afuera, más fuerte cerca, nada fuera del radio ni al que la hizo', () => {
  const me = at(0, 0);
  const near = at(30, 0);
  const far = at(100, 0);
  const out = at(200, 0);
  const heavy = at(0, 30, { invMass: 0.5 });
  const n = blast([me, near, far, out, heavy], 0, 0, 120, 300, me);
  assert.equal(n, 3);
  assert.equal(me.vx, 0);
  assert.equal(out.vx, 0);
  assert.ok(near.vx > far.vx && far.vx > 0);
  assert.ok(heavy.vy > 0 && heavy.vy < near.vx, 'el pesado se mueve menos');
  const on = at(0, 0);
  blast([on], 0, 0, 120, 300);
  assert.ok(Number.isFinite(on.vx) && on.vx > 0, 'justo encima: eje fijo, sin NaN');
});

test('entradas: valida el formato, ignora repetidas, acota el paso, limita la cola y respeta la acción máxima', () => {
  const p = newDisc();
  assert.equal(queueInputs(p, 'x', 100), false);
  assert.equal(queueInputs(p, [[1, 100]], 100), false, 'faltan campos');
  assert.equal(queueInputs(p, [[1.5, 100, 40, 0]], 100), false);
  assert.equal(queueInputs(p, [[1, NaN, 40, 0]], 100), false);
  assert.equal(queueInputs(p, [[1, 100, 81, 0]], 100), false, 'movimiento fuera de rango');
  assert.equal(queueInputs(p, [[1, 100, 40, 2]], 100, 1), false, 'sin Onda en Sumo');
  assert.equal(queueInputs(p, [[1, 100, 40, 2]], 100, 2), true, 'con Onda en Rey');
  assert.equal(queueInputs(p, [[1, 100, 40, -1]], 100, 2), false);
  assert.equal(queueInputs(p, new Array(7).fill([1, 1, 40, 0]), 100), false, 'demasiadas');
  const q = newDisc();
  assert.equal(queueInputs(q, [[1, 100, 10, 0], [2, 100, 20, 1]], 100), true);
  assert.equal(queueInputs(q, [[1, 100, 10, 0], [2, 100, 20, 1], [3, 5000, 30, 0]], 100), true, 'redundancia: 1 y 2 ya estaban');
  assert.deepEqual(q.inbox.map((e) => e.s), [1, 2, 3]);
  assert.equal(q.inbox[2].k, 100 + CTRL.kAhead, 'un paso demasiado en el futuro se acota');
  assert.equal(queueInputs(q, [[4, -9999, 40, 0]], 100), true);
  assert.ok(q.inbox.at(-1).k >= q.inbox.at(-2).k, 'y los pasos nunca retroceden');
  for (let s = 5; s < 40; s++) queueInputs(q, [[s, 100, 40, 0]], 100);
  assert.equal(q.inbox.length, CTRL.inboxMax);
});

test('applyInputs: respeta el paso, el orden y no repite; llama a onAct solo cuando la acción arranca', () => {
  const p = newDisc();
  const list = [{ s: 1, k: 5, d: encodeMove(1, 0), b: 0 }, { s: 2, k: 8, d: encodeMove(0, 1), b: 1 }, { s: 3, k: 8, d: encodeMove(0, 1), b: 1 }];
  const acts = [];
  assert.equal(applyInputs(p, list, 4, (q, a) => acts.push(a)), 0);
  assert.equal(applyInputs(p, list, 6), 1);
  assert.equal(p.mx, 1);
  assert.equal(p.seq, 1);
  assert.equal(applyInputs(p, list, 6), 0, 'no repite');
  assert.equal(applyInputs(p, list, 9, (q, a) => acts.push(a)), 2);
  assert.equal(p.seq, 3);
  assert.deepEqual(acts, [1], 'el segundo Empujón cae en la recarga');
  assert.equal(p.my, 1);
});

test('predicción: stepOwn con las mismas entradas da exactamente el mismo disco que el servidor (240 pasos)', () => {
  const server = at(10, -20);
  const client = at(10, -20);
  const hist = [];
  let seq = 0;
  const rnd = lcg(3);
  for (let t = 1; t <= 240; t++) {
    if (rnd() < 0.12) hist.push({ s: ++seq, k: t, d: Math.floor(rnd() * 81), b: rnd() < 0.3 ? 1 : 0 });
    queueInputs(server, hist.slice(-3).map((e) => [e.s, e.k, e.d, e.b]), t - 1);
    applyInputs(server, server.inbox, t);
    while (server.inbox.length && server.inbox[0].s <= server.seq) server.inbox.shift();
    stepMotion(server);
    stepOwn(client, hist, t);
    assert.deepEqual([client.x, client.y, client.vx, client.vy, client.dashCd, client.seq], [server.x, server.y, server.vx, server.vy, server.dashCd, server.seq], `paso ${t}`);
  }
  assert.ok(seq > 15);
});

test('determinismo: misma semilla y mismas entradas dan el mismo resultado bit a bit; otra semilla, otro', () => {
  function play(seed) {
    const rnd = lcg(seed);
    const discs = Array.from({ length: 10 }, (_, i) => at((rnd() - 0.5) * 300, (rnd() - 0.5) * 300, { invMass: 0.6 + (i % 3) * 0.2 }));
    let h = 0;
    for (let t = 0; t < 900; t++) {
      for (const d of discs) {
        if (rnd() < 0.05) setMove(d, Math.floor(rnd() * 81));
        if (rnd() < 0.01) act(d, 1);
        stepMotion(d);
        bounceRect(d, 300, 300);
      }
      collideAll(discs);
      if (t % 100 === 0) blast(discs, 0, 0, 150, 200, discs[0]);
    }
    for (const d of discs) h = (h * 31 + Math.round(d.x * 1e6) + Math.round(d.y * 1e6)) | 0;
    return [h, discs.map((d) => [d.x, d.y, d.vx, d.vy].join()).join('|')];
  }
  assert.deepEqual(play(5), play(5));
  assert.notDeepEqual(play(5), play(6));
});

test('costo: 14 discos con choques cuestan una fracción de milisegundo por paso', () => {
  const rnd = lcg(1);
  const discs = Array.from({ length: 14 }, () => at((rnd() - 0.5) * 200, (rnd() - 0.5) * 200));
  const t0 = performance.now();
  for (let t = 0; t < 3000; t++) {
    for (const d of discs) {
      if (t % 20 === 0) setMove(d, Math.floor(rnd() * 81));
      stepMotion(d);
    }
    collideAll(discs);
  }
  const ms = (performance.now() - t0) / 3000;
  assert.ok(ms < 0.2, `ms por paso ${ms}`);
});
