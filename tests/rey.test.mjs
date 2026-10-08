/** Rey de la Colina: arena, colina que se muda, puntaje, pozos, Onda, partidas, bots, snapshots y partida real contra un servidor. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { World, CFG, PH, TPS } from '../public/games/rey/shared/world.js';
import { brain, think } from '../public/games/rey/shared/bots.js';
import { Viewer } from '../public/games/rey/shared/sync.js';
import { CTRL, encodeMove } from '../public/shared/arena-physics.js';
import { startServer, connect, wait } from './helpers.mjs';

const steps = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
const put = (p, x, y, vx = 0, vy = 0) => Object.assign(p, { x, y, vx, vy });
/** Mundo con `n` personas en juego, quietas y puestas a mano lejos de todo. */
function arena(n, seed = 1) {
  const w = new World(seed);
  const ps = [];
  for (let i = 0; i < n; i++) {
    const p = w.addPlayer({ name: 'p' + i, color: i });
    w.spawn(p.num);
    ps.push(p);
  }
  return { w, ps };
}
const away = (ps) => ps.forEach((p, i) => put(p, -280 + i * 5, -290)); // rincón sin pozos ni colina

test('arena: 3 pozos y 4 puntos de colina dentro de las paredes, y la colina nunca nace pisando un pozo', () => {
  assert.equal(CFG.pits.length, 3);
  assert.equal(CFG.hillR, 70);
  for (const [x, y, r] of CFG.pits) assert.ok(Math.abs(x) + r < CFG.half && Math.abs(y) + r < CFG.half);
  for (const [hx, hy] of CFG.hills) {
    assert.ok(Math.abs(hx) + CFG.hillR < CFG.half && Math.abs(hy) + CFG.hillR < CFG.half);
    for (const [x, y, r] of CFG.pits) assert.ok(Math.hypot(hx - x, hy - y) > CFG.hillR + r + 40, 'colina y pozo separados');
  }
});

test('colina: arranca en el centro, avisa la próxima y se muda cada 25 s (nunca al mismo lugar)', () => {
  const w = new World(4);
  assert.equal(w.hill, 0);
  assert.notEqual(w.next, 0);
  const seen = new Set([0]);
  let prev = 0;
  for (let i = 0; i < 6; i++) {
    const plan = w.next;
    assert.equal(w.hillIn(), 25 * TPS - (w.tick - (w.hillAt - 25 * TPS)), 'cuenta atrás');
    steps(w, 25 * TPS - 1);
    assert.equal(w.hill, prev, 'todavía no');
    assert.equal(w.hillIn(), 1);
    w.step();
    assert.equal(w.hill, plan, 'va adonde avisó');
    assert.notEqual(w.hill, prev);
    seen.add(w.hill);
    prev = w.hill;
  }
  assert.ok(seen.size >= 3, 'recorre varios puntos');
});

test('puntaje: solo adentro suma 1 por segundo; con dos adentro, o vacía, nadie suma', () => {
  const { w, ps } = arena(3);
  const [a, b, c] = ps;
  away(ps);
  steps(w, 5 * TPS);
  assert.equal(w.occ, 0);
  assert.deepEqual(ps.map((p) => p.score), [0, 0, 0]);
  put(a, 20, 10); // adentro de la colina del centro (radio 70)
  steps(w, 3 * TPS);
  assert.equal(w.occ, a.num);
  assert.equal(a.score, 3, '3 s solo = 3 puntos');
  put(b, -30, 0);
  steps(w, 3 * TPS);
  assert.equal(w.occ, -1, 'disputada');
  assert.equal(a.score, 3);
  assert.equal(b.score, 0);
  put(b, -280, -290);
  steps(w, 5);
  put(a, 69, 0); // justo en el borde: adentro
  w.step();
  assert.equal(w.occ, a.num);
  put(a, 72, 0);
  w.step();
  assert.equal(w.occ, 0, 'a 72 px ya está afuera');
  void c;
});

test('el puntaje parcial no se pierde: 20 pasos adentro, salir, y 10 más completan el segundo', () => {
  const { w, ps } = arena(2);
  const [a] = ps;
  away(ps);
  put(a, 0, 0);
  steps(w, 20);
  assert.equal(a.score, 0);
  put(a, -280, -290);
  steps(w, 40);
  put(a, 0, 0);
  steps(w, 10);
  assert.equal(a.score, 1);
});

test('gana el primero en llegar a 100 puntos; después, resultados 8 s y una partida nueva con todo en cero', () => {
  const { w, ps } = arena(3, 2);
  const [a, b] = ps;
  away(ps);
  put(a, 0, 0);
  a.score = 99;
  b.score = 40;
  steps(w, TPS);
  assert.equal(a.score, 100);
  assert.equal(w.phase, PH.over);
  assert.equal(w.result.n, 1);
  assert.equal(w.result.winner, a.num);
  assert.equal(a.wins, 1);
  assert.deepEqual(w.result.top[0], [a.num, 100]);
  assert.equal(w.result.top[1][0], b.num);
  assert.ok(w.result.time <= 1);
  // en los resultados todo queda quieto y nadie suma
  const x0 = a.x;
  a.mx = 1;
  steps(w, 8 * TPS - 1);
  assert.equal(a.x, x0);
  assert.equal(a.score, 100);
  w.step();
  assert.equal(w.phase, PH.play);
  assert.equal(w.matchN, 2);
  assert.equal(w.hill, 0, 'la colina vuelve al centro');
  assert.ok(ps.every((p) => p.score === 0 && p.alive), 'puntajes en cero y todos de nuevo en juego');
  assert.equal(a.wins, 1, 'las victorias se conservan');
});

test('a los 3 minutos gana el que más tiene; a igual puntaje, el que llegó primero; sin puntos, nadie', () => {
  const run = (setup) => {
    const { w, ps } = arena(3, 5);
    away(ps);
    setup(w, ps);
    steps(w, 180 * TPS);
    return { w, ps };
  };
  const t1 = run((w, ps) => {
    ps[0].score = 5;
    ps[1].score = 9;
  });
  assert.equal(t1.w.phase, PH.over);
  assert.equal(t1.w.result.winner, t1.ps[1].num);
  const t2 = run((w, ps) => {
    ps[0].score = 7;
    ps[0].reachedAt = 900;
    ps[1].score = 7;
    ps[1].reachedAt = 300;
  });
  assert.equal(t2.w.result.winner, t2.ps[1].num, 'empate: el que llegó antes');
  const t3 = run(() => {});
  assert.equal(t3.w.result.winner, 0);
  assert.equal(t3.w.result.time, 180);
});

test('pozos: caer es salir del juego; se reaparece a los 2 s en un lugar libre (lejos de pozos y de otros)', () => {
  const { w, ps } = arena(3, 7);
  const [a, b, c] = ps;
  away(ps);
  put(b, 100, -250);
  // b toca a a y lo manda al pozo de abajo a la derecha: crédito en el aviso (no suma puntos)
  a.lastHit = b.num;
  a.lastHitAt = w.tick;
  put(a, 173, 100);
  w.step();
  assert.equal(a.alive, false);
  assert.equal(w.deaths.length, 1);
  assert.equal(w.deaths[0].by, b.num);
  assert.equal(w.deaths[0].stats.falls, 1);
  assert.equal(b.score, 0, 'tirar a alguien no da puntos');
  assert.equal(w.canSpawn(a.num), false);
  assert.equal(w.waitTicks(a.num), 60);
  steps(w, 59);
  assert.equal(w.canSpawn(a.num), false);
  w.step();
  assert.equal(w.canSpawn(a.num), true);
  put(c, -150, 150);
  for (let i = 0; i < 40; i++) {
    a.alive = false;
    a.deadAt = -1e9;
    assert.equal(w.spawn(a.num), true);
    for (const [px, py, pr] of CFG.pits) assert.ok(Math.hypot(a.x - px, a.y - py) > pr + 20, 'no nace en un pozo');
    for (const q of [b, c]) assert.ok(Math.hypot(a.x - q.x, a.y - q.y) > 36 || a.x === q.x, 'ni pegada a otro disco');
    assert.ok(Math.abs(a.x) <= CFG.half - 40 && Math.abs(a.y) <= CFG.half - 40);
  }
  assert.equal(w.spawn(a.num), false, 'ya está en juego');
  // un disco con el centro justo afuera del pozo no cae
  put(b, 173 + 34 + 1, 100);
  w.step();
  assert.equal(b.alive, true);
});

test('paredes: rebotan (no se sale de la arena) y la velocidad que se devuelve es menor', () => {
  const { w, ps } = arena(1);
  const [a] = ps;
  put(a, 295, -250, 400, 0);
  w.step();
  assert.ok(a.x <= CFG.half - a.r + 1e-9);
  assert.ok(a.vx < 0 && a.vx > -400);
  for (let i = 0; i < 300; i++) {
    a.mx = 1;
    a.my = -1;
    w.step();
    assert.ok(Math.abs(a.x) <= CFG.half && Math.abs(a.y) <= CFG.half);
    if (!a.alive) break;
  }
});

test('Onda: empuja a todos los que están a menos de 120 px (más fuerte cerca), no al que la hace, recarga 6 s y la ven los demás', () => {
  const { w, ps } = arena(4);
  const [a, near, mid, far] = ps;
  put(a, -280, -280);
  put(near, -250, -280);
  put(mid, -190, -280);
  put(far, -100, -280);
  assert.equal(w.queueInputs(a, [[1, w.tick + 1, encodeMove(0, 0), 2]]), true, 'Rey acepta la Onda');
  w.step();
  assert.equal(a.waveCd, CTRL.waveCd - 1);
  assert.ok(near.vx > mid.vx && mid.vx > 0, `cerca ${near.vx} lejos ${mid.vx}`);
  assert.equal(far.vx, 0, 'a 180 px no llega');
  assert.ok(Math.abs(a.vx) < 1e-9, 'quien la hace no se mueve');
  assert.equal(w.waveLog.length, 1);
  assert.equal(near.lastHit, a.num, 'los empujados quedan marcados para el crédito del pozo');
  // recarga
  const v = near.vx;
  w.queueInputs(a, [[2, w.tick + 1, encodeMove(0, 0), 2]]);
  w.step();
  assert.equal(w.waveLog.length, 1, 'recargando: no sale otra');
  assert.ok(near.vx <= v);
  steps(w, 6 * TPS);
  assert.equal(a.waveCd, 0);
});

test('Empujón y entradas: valida el formato y acepta acción hasta 2', () => {
  const { w, ps } = arena(1);
  const [a] = ps;
  assert.equal(w.queueInputs(a, [[1, 1, 99, 0]]), false);
  assert.equal(w.queueInputs(a, [[1, 1, 40, 3]]), false);
  assert.equal(w.queueInputs(a, 'x'), false);
  assert.equal(w.queueInputs(a, [[1, 1, 40, 1]]), true);
  put(a, -250, -250);
  steps(w, 3);
  assert.equal(a.dashCd > 0, true);
});

test('determinismo: misma semilla y mismas entradas dan el mismo mundo; otra semilla, otro', () => {
  function play(seed) {
    const w = new World(seed);
    const bots = [];
    for (let i = 0; i < 6; i++) {
      const p = w.addPlayer({ bot: true });
      bots.push([p, brain(1 + (i % 3), w.rnd)]);
      w.spawn(p.num);
    }
    const me = w.addPlayer({ name: 'yo' });
    w.spawn(me.num);
    let seq = 0;
    const hashes = [];
    for (let t = 0; t < 5000; t++) {
      for (const [p, b] of bots) (p.alive ? think(w, p, b) : w.spawn(p.num));
      if (!me.alive) w.spawn(me.num);
      if (t % 11 === 0) w.queueInputs(me, [[++seq, w.tick + 1, (t * 7) % 81, t % 7 === 0 ? 1 + (t % 2) : 0]]);
      w.step();
      w.deaths.length = 0;
      if (t % 250 === 0) hashes.push(w.digest());
    }
    return hashes.join(',');
  }
  assert.equal(play(42), play(42));
  assert.notEqual(play(42), play(43));
});

// ---------------------------------------------------------------- bots
function botWorld(n, seed) {
  const w = new World(seed);
  const bots = [];
  for (let i = 0; i < n; i++) {
    const lv = 1 + (i % 3);
    const p = w.addPlayer({ bot: true });
    bots.push([p, brain(lv, w.rnd), lv]);
    w.spawn(p.num);
  }
  return { w, bots };
}

test('bots (3 niveles): van a la colina, la disputan, no se tiran a los pozos y los de nivel alto ganan más', () => {
  let falls = 0;
  let occ = 0;
  let ticks = 0;
  let matches = 0;
  let points = 0;
  const wins = [0, 0, 0, 0];
  for (const seed of [21, 22, 23]) {
    const { w, bots } = botWorld(8, seed);
    let last = 0;
    for (let t = 0; t < 900 * TPS; t++) {
      for (const [p, b] of bots) (p.alive ? think(w, p, b) : w.spawn(p.num));
      w.step();
      falls += w.deaths.length;
      w.deaths.length = 0;
      if (w.phase === PH.play) {
        ticks++;
        if (w.occ > 0) occ++;
      }
      if (w.result.n !== last) {
        last = w.result.n;
        matches++;
        const wp = bots.find(([p]) => p.num === w.result.winner);
        if (wp) wins[wp[2]]++;
        points += w.result.top[0][1];
      }
    }
    for (const [p] of bots) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.vx), 'sin NaN');
  }
  assert.ok(matches >= 12, `partidas ${matches}`);
  assert.ok(occ / ticks > 0.1, `la colina tuvo dueño solo el ${((100 * occ) / ticks).toFixed(0)}% del tiempo`);
  assert.ok(points / matches >= 6, 'el puntero suma puntos');
  assert.ok(falls <= 6, `caídas a pozos ${falls}: no se tiran solos`);
  assert.ok(wins[3] >= wins[1], `ganan más los de nivel alto: ${wins}`);
});

test('bot solo: va a la colina y la sostiene sumando 1 punto por segundo', () => {
  const { w, bots } = botWorld(1, 3);
  const [p, b] = bots[0];
  for (let t = 0; t < 22 * TPS; t++) {
    think(w, p, b);
    w.step();
  }
  assert.ok(p.score >= 14, `puntos ${p.score}`);
  assert.ok(Math.hypot(p.x, p.y) < CFG.hillR);
  assert.equal(p.falls, 0);
});

test('bots: costo de un paso con 12 discos', () => {
  const { w, bots } = botWorld(12, 5);
  const t0 = performance.now();
  const N = 4000;
  for (let t = 0; t < N; t++) {
    for (const [p, b] of bots) (p.alive ? think(w, p, b) : w.spawn(p.num));
    w.step();
    w.deaths.length = 0;
  }
  const ms = (performance.now() - t0) / N;
  assert.ok(ms < 0.5, `ms por paso ${ms}`);
});

// ---------------------------------------------------------------- snapshots
test('snapshot: colina, quién la tiene, propia primero con más decimales, Ondas una sola vez y resultado una vez', () => {
  const { w, ps } = arena(3);
  const [a, b] = ps;
  away(ps);
  const v = new Viewer(w, b.num);
  put(a, 10, 10);
  put(b, -270.123456, -280.987654, 55.555, -1.2345);
  w.step();
  let m = JSON.parse(JSON.stringify(v.build([])));
  assert.deepEqual(m.r.slice(0, 2), [PH.play, 1]);
  assert.equal(m.r[3], 0);
  assert.equal(m.r[4], w.next);
  assert.equal(m.r[5], w.hillIn());
  assert.equal(m.r[6], a.num, 'quién tiene la colina');
  assert.equal(m.r[2], 180 * TPS - 1, 'tiempo que falta');
  assert.equal(m.h[0][0], b.num);
  const r2 = (v) => Math.round(v * 100) / 100;
  assert.deepEqual(m.h[0].slice(1, 5), [r2(b.x), r2(b.y), r2(b.vx), r2(b.vy)]);
  assert.ok(String(m.h[0][1]).split('.')[1].length <= 2);
  assert.equal(m.h[0][5], 2 | 4, 'Empujón y Onda listos');
  assert.deepEqual(m.o.length, 6);
  assert.equal(m.o[2], b.score);
  // Onda de otro: llega una vez
  w.queueInputs(a, [[1, w.tick + 1, encodeMove(0, 0), 2]]);
  w.step();
  m = v.build([]);
  assert.equal(m.w.length, 1);
  assert.equal(v.build([]).w, undefined);
  // caída
  m = v.build([{ x: 173.4, y: 100.2, color: 2, num: a.num, by: b.num }]);
  assert.deepEqual(m.x, [[173, 100, 2, a.num, b.num]]);
  // resultado
  a.score = 99;
  put(a, 0, 0);
  steps(w, TPS);
  m = v.build([]);
  assert.equal(m.res[0], 1);
  assert.equal(m.res[1], a.num);
  assert.equal(m.r[0], PH.over);
  assert.equal(v.build([]).res, undefined);
  const bytes = JSON.stringify(m).length;
  assert.ok(bytes < 500, `${bytes} B`);
});

test('snapshot: 10 discos entran en 15 KB/s a 15 por segundo', () => {
  const { w, ps } = arena(10, 9);
  steps(w, 100);
  for (const p of ps) put(p, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 500);
  const bytes = JSON.stringify(new Viewer(w, ps[0].num).build([])).length;
  assert.ok(bytes * 15 < 15 * 1024, `${bytes} B × 15`);
});

// ---------------------------------------------------------------- servidor real
let srv;
before(async () => {
  srv = await startServer({ MAX_RT_ROOMS: '4' });
});
after(() => srv?.stop());

test('servidor: una persona entra a Rey, nace al instante, se mueve, hace una Onda y recibe snapshots a 15 Hz con su ack', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'create', game: 'rey', name: 'Ana' });
  await wait(400);
  assert.ok(c.last('joined'));
  assert.ok(c.msgs.findIndex((m) => m.t === 'reset') < c.msgs.findIndex((m) => m.t === 'me'));
  const me0 = c.last('me');
  assert.equal(me0.alive, false);
  assert.equal(me0.half, 320);
  c.send({ t: 'spawn', name: 'Ana', color: 2 });
  await wait(500);
  assert.equal(c.last('me').alive, true);
  const s0 = c.last('s');
  assert.ok(s0.o, 'en juego');
  assert.equal(s0.h[0][0], me0.num);
  assert.ok(s0.h.length >= 5 && s0.h.length <= 10, `Ana y los bots (${s0.h.length})`);
  assert.equal(s0.r[0], PH.play);
  c.send({ t: 'i', e: [[1, s0.k + 1, encodeMove(1, 0), 0]] });
  c.send({ t: 'i', e: [[1, s0.k + 1, encodeMove(1, 0), 0], [2, s0.k + 6, encodeMove(1, 0), 2]] });
  await wait(900);
  const s1 = c.last('s');
  assert.equal(s1.a, 2);
  assert.ok(s1.o[5] > 0, 'la Onda quedó recargando');
  const n0 = c.all('s').length;
  await wait(1000);
  const rate = c.all('s').length - n0;
  assert.ok(rate >= 11 && rate <= 17, `${rate} snapshots por segundo`);
  c.send({ t: 'i', e: [[3, 0, 99, 0]] });
  c.send({ t: 'i', e: [[4, 0, 40, 5]] });
  c.send({ t: 'i', e: 'hola' });
  await wait(200);
  assert.ok(c.last('s').k > s1.k);
  c.ws.close();
});

test('servidor: reconexión con token, "list" y /health', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'rey', name: 'Eli' });
  await wait(250);
  const j = a.last('joined');
  a.send({ t: 'spawn', name: 'Eli', color: 1 });
  await wait(300);
  const num = a.last('me').num;
  const l = await connect(srv.port);
  l.send({ t: 'list', game: 'rey' });
  await wait(150);
  const mine = l.last('list').rooms.find((r) => r.code === j.code);
  assert.ok(mine && mine.state === 'playing' && mine.max === 10);
  a.ws.terminate();
  await wait(300);
  const b = await connect(srv.port);
  b.send({ t: 'join', game: 'rey', code: j.code, token: j.token, name: 'Eli' });
  await wait(400);
  assert.equal(b.last('joined').id, j.id);
  assert.ok(b.msgs.findIndex((m) => m.t === 'reset') >= 0);
  assert.equal(b.last('me').num, num);
  assert.ok(b.last('s'));
  const h = await fetch(`http://127.0.0.1:${srv.port}/health`).then((r) => r.json());
  assert.ok(h.rt.rooms >= 1);
  b.ws.close();
  l.ws.close();
});

test('servidor: sin errores no controlados', () => {
  assert.doesNotMatch(srv.logs(), /\bfatal\b|^\S+ error /m);
});
