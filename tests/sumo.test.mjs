/** Sumo: plataforma, caídas y KO, rondas, entrada tardía, bots, determinismo, snapshots y partida real contra un servidor. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { World, CFG, PH, platformR } from '../public/games/sumo/shared/world.js';
import { brain, think, brakeDist } from '../public/games/sumo/shared/bots.js';
import { Viewer } from '../public/games/sumo/shared/sync.js';
import { TPS, CTRL, encodeMove, speedOf } from '../public/shared/arena-physics.js';
import { startServer, connect, wait } from './helpers.mjs';

const steps = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
/** Mundo con `n` personas listas y la ronda en marcha (sin bots). */
function started(n, seed = 1) {
  const w = new World(seed);
  const ps = [];
  for (let i = 0; i < n; i++) {
    const p = w.addPlayer({ name: 'p' + i, color: i });
    w.spawn(p.num);
    ps.push(p);
  }
  let guard = 0;
  while ((w.phase !== PH.play || w.tick < w.rt0) && guard++ < 500) w.step();
  return { w, ps };
}
const put = (p, x, y, vx = 0, vy = 0) => Object.assign(p, { x, y, vx, vy });

test('plataforma: 100% → 35% en 75 s, se queda 15 s, y la muerte súbita la achica hasta cerrarse', () => {
  assert.equal(platformR(0), CFG.R0);
  assert.ok(Math.abs(platformR(75 * TPS) - CFG.R0 * 0.35) < 1e-9);
  assert.ok(Math.abs(platformR(37.5 * TPS) - CFG.R0 * 0.675) < 1e-9, 'lineal');
  assert.equal(platformR(80 * TPS), CFG.R0 * 0.35);
  assert.equal(platformR(90 * TPS), CFG.R0 * 0.35);
  assert.ok(platformR(100 * TPS) < CFG.R0 * 0.2);
  assert.equal(platformR(110 * TPS), 0);
  assert.equal(platformR(500 * TPS), 0);
  let prev = Infinity;
  for (let t = 0; t <= 115 * TPS; t += 15) {
    const r = platformR(t);
    assert.ok(r <= prev + 1e-9);
    prev = r;
  }
});

test('la primera persona arranca la cuenta atrás de 2 s y después empieza la ronda con todos mirando al centro', () => {
  const w = new World(3);
  const ps = [0, 1, 2, 3, 4].map((i) => w.addPlayer({ name: 'p' + i }));
  assert.equal(w.phase, PH.idle);
  for (const p of ps) assert.equal(w.spawn(p.num), false);
  assert.equal(w.phase, PH.wait);
  assert.equal(w.waitTicks(), 2 * TPS);
  steps(w, 2 * TPS - 1);
  assert.equal(w.phase, PH.wait);
  w.step();
  assert.equal(w.phase, PH.play);
  assert.equal(w.roundN, 1);
  assert.equal(w.startedWith, 5);
  const rr = CFG.R0 * CFG.ring;
  for (const p of ps) {
    assert.equal(p.alive, true);
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - rr) < 1e-6, 'sobre la ronda de aparición');
    assert.ok(p.fx * -p.x + p.fy * -p.y > 0.9 * rr, 'mira al centro');
    assert.equal(p.vx + p.vy, 0);
    assert.equal(p.r, 18);
  }
  // separados entre sí
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) > 60);
});

test('"¡ya!": al empezar la ronda los discos están en su lugar pero quietos 1,5 s, sin entrada ni caídas, y el reloj de la plataforma arranca después', () => {
  const w = new World(3);
  const ps = [0, 1, 2].map((i) => w.addPlayer({ name: 'p' + i }));
  for (const p of ps) w.spawn(p.num);
  while (w.phase !== PH.play) w.step();
  assert.equal(w.rt0 - w.tick, 45);
  const right = encodeMove(1, 0);
  const x0 = ps.map((p) => p.x);
  w.queueInputs(ps[0], [[1, w.tick + 1, encodeMove(-ps[0].x, -ps[0].y), 1]]); // un Empujón hacia el centro
  steps(w, 44);
  assert.deepEqual(ps.map((p) => p.x), x0, 'quietos');
  assert.ok(ps.every((p) => p.alive && p.dashCd === 0));
  w.step();
  w.step();
  assert.ok(ps[0].x !== x0[0] && ps[0].dashCd > 0, 'y después se mueven: la entrada que esperó se aplica');
  assert.ok(right > 0);
  assert.ok(w.R > CFG.R0 * 0.99);
  steps(w, 2 * TPS);
  assert.ok(w.R < CFG.R0 * 0.99, 'la plataforma empieza a achicarse');
});

test('caer: el centro del disco sale de la plataforma → fuera de la ronda, con puesto y sin crédito si nadie lo tocó', () => {
  const { w, ps } = started(3);
  put(ps[0], 0, 0);
  put(ps[1], 100, 0);
  put(ps[2], w.R + 1, 0);
  w.step();
  assert.equal(ps[2].alive, false);
  assert.equal(w.deaths.length, 1);
  const d = w.deaths[0];
  assert.equal(d.num, ps[2].num);
  assert.equal(d.by, 0);
  assert.equal(d.stats.place, 3, 'puesto 3 de 3');
  assert.equal(d.stats.kos, 0);
  assert.ok(ps[0].alive && ps[1].alive);
  assert.equal(w.phase, PH.play, 'quedan dos');
  // un disco con el centro adentro todavía se sostiene aunque se asome
  put(ps[1], w.R - 2, 0);
  w.step();
  assert.equal(ps[1].alive, true);
});

test('KO: +1 a quien tocó al caído dentro de los últimos 2 s; después de 2 s, un roce suave o él mismo, nada', () => {
  const { w, ps } = started(4);
  const [a, b, c, e] = ps;
  put(a, -150, -150);
  put(e, 150, 150);
  // b y c chocan de verdad: c queda marcado como tocado por b
  put(b, 0, 0, 200, 0);
  put(c, 30, 0);
  w.step();
  assert.equal(c.lastHit, b.num);
  assert.equal(b.lastHit, c.num, 'el roce es de los dos');
  // c cae a los 0,5 s: crédito para b
  put(c, w.R + 5, 0);
  steps(w, 15);
  w.step();
  assert.equal(c.alive, false);
  assert.equal(w.deaths.at(-1).by, b.num);
  assert.equal(b.kos, 1);
  assert.equal(b.koTotal, 1);
  assert.equal(b.score, 1);
  assert.equal(w.deaths.at(-1).stats.kos, 0);
  // fuera de la ventana: sin crédito
  w.deaths.length = 0;
  e.lastHit = a.num;
  e.lastHitAt = w.tick - 61;
  put(e, w.R + 5, 0);
  w.step();
  assert.equal(w.deaths.at(-1).by, 0);
  assert.equal(a.score, 0);
  // un toque a 59 pasos todavía cuenta
  const { w: w2, ps: q } = started(3, 2);
  put(q[0], 0, 0);
  put(q[1], 60, 60);
  put(q[2], 0, 0);
  q[2].lastHit = q[0].num;
  q[2].lastHitAt = w2.tick - 58;
  put(q[2], w2.R + 5, 0);
  w2.step();
  assert.equal(w2.deaths.at(-1).by, q[0].num);
});

test('un roce suave (< 20 px/s de acercamiento) no cuenta como tocar', () => {
  const { w, ps } = started(3);
  put(ps[0], 0, 0, 10, 0);
  put(ps[1], 35, 0, 0, 0);
  put(ps[2], -150, 150);
  w.step();
  assert.equal(ps[1].lastHit, 0);
});

test('el último en pie gana la ronda (+3), la siguiente arranca 4 s después y todos vuelven', () => {
  const { w, ps } = started(3);
  put(ps[0], 0, 0);
  put(ps[1], w.R + 5, 0);
  put(ps[2], -w.R - 5, 0);
  w.step();
  assert.equal(w.phase, PH.wait);
  assert.equal(w.result.n, 1);
  assert.equal(w.result.winner, ps[0].num);
  assert.equal(ps[0].wins, 1);
  assert.equal(ps[0].score, 3);
  assert.equal(w.startAt - w.tick, 4 * TPS);
  assert.deepEqual(w.leaderboard(3)[0], [ps[0].num, 3, 1]);
  // el ganador queda quieto en la plataforma durante la pausa
  const x0 = ps[0].x;
  steps(w, 4 * TPS - 1);
  assert.equal(w.phase, PH.wait);
  assert.equal(ps[0].x, x0);
  w.step();
  assert.equal(w.phase, PH.play);
  assert.equal(w.roundN, 2);
  assert.equal(w.R, CFG.R0, 'la plataforma vuelve a 100%');
  assert.ok(ps.every((p) => p.alive && p.kos === 0), 'los tres de nuevo adentro, KO de la ronda en cero');
  assert.equal(ps[0].score, 3, 'el puntaje se acumula entre rondas');
});

test('caídas en el mismo paso (nadie queda): ronda sin ganador; una sola persona juega hasta caerse', () => {
  const { w, ps } = started(2);
  put(ps[0], w.R + 3, 0);
  put(ps[1], -w.R - 3, 0);
  w.step();
  assert.equal(w.result.n, 1);
  assert.equal(w.result.winner, 0);
  assert.equal(w.phase, PH.wait);
  const solo = started(1);
  put(solo.ps[0], 0, 0);
  steps(solo.w, 60 * TPS);
  assert.equal(solo.w.phase, PH.play, 'una persona sola no gana por ser la última');
  assert.equal(solo.ps[0].alive, true);
  steps(solo.w, 60 * TPS); // muerte súbita: la plataforma se cierra
  assert.equal(solo.w.result.n, 1, 'la ronda terminó');
  assert.equal(solo.w.result.winner, 0, 'sin ganador');
});

test('la muerte súbita garantiza que toda ronda termina, aun con todos quietos', () => {
  const { w } = started(6, 4);
  steps(w, 111 * TPS);
  assert.ok(w.result.n >= 1, 'la ronda terminó (sin que nadie se moviera, la plataforma los fue dejando afuera)');
  const solo = started(1, 9);
  put(solo.ps[0], 0, 0);
  steps(solo.w, 111 * TPS);
  assert.equal(solo.w.result.n, 1, 'una persona quieta en el centro cae cuando la plataforma se cierra del todo');
  assert.equal(solo.ps[0].alive, false);
});

test('entrar tarde: juega si la ronda tiene menos de 10 s; si no, mira hasta la próxima; el que se cayó no vuelve', () => {
  const { w, ps } = started(3);
  steps(w, 5 * TPS);
  const late = w.addPlayer({ name: 'tarde' });
  assert.equal(w.spawn(late.num), true, 'a los 5 s todavía entra');
  assert.equal(late.alive, true);
  assert.ok(Math.hypot(late.x, late.y) <= w.R);
  assert.equal(w.startedWith, 4);
  // se cae y pide volver en la misma ronda: tiene que esperar a la que sigue
  put(late, w.R + 5, 0);
  w.step();
  assert.equal(late.alive, false);
  assert.equal(w.spawn(late.num), false);
  assert.equal(late.ready, true);
  // a los 12 s ya no entra nadie
  steps(w, 8 * TPS);
  const tarde = w.addPlayer({ name: 'muy tarde' });
  assert.equal(w.spawn(tarde.num), false);
  assert.equal(tarde.alive, false);
  assert.equal(tarde.ready, true);
  // y en la siguiente ronda están los dos
  put(ps[0], 0, 0);
  put(ps[1], w.R + 5, 0);
  put(ps[2], -w.R - 5, 0);
  w.step();
  steps(w, 4 * TPS);
  assert.equal(w.phase, PH.play);
  assert.ok(late.alive && tarde.alive);
  assert.equal(w.startedWith, 5);
});

test('Empujón por entrada: se aplica en su paso, empuja al rival y recarga 1,2 s; las entradas inválidas no rompen nada', () => {
  const { w, ps } = started(2);
  const [a, b] = ps;
  put(a, 0, 0);
  put(b, 80, 0);
  a.vx = a.vy = 0;
  const right = encodeMove(1, 0);
  assert.equal(w.queueInputs(a, [[1, w.tick + 1, right, 0]]), true);
  steps(w, 6);
  assert.ok(a.vx > 80, 'ya se mueve');
  assert.equal(w.queueInputs(a, [[2, w.tick + 1, right, 1]]), true);
  w.step();
  assert.equal(a.dashCd, CTRL.dashCd - 1);
  assert.ok(a.vx > 300);
  let hit = false;
  for (let i = 0; i < 12 && !hit; i++) {
    w.step();
    hit = b.vx > 150;
  }
  assert.ok(hit, `el rival salió disparado (vx ${b.vx})`);
  assert.equal(b.lastHit, a.num);
  const cd = a.dashCd;
  w.queueInputs(a, [[3, w.tick + 1, right, 1]]);
  w.step();
  assert.equal(a.dashCd, cd - 1, 'recargando: el segundo Empujón no sale');
  assert.equal(w.queueInputs(a, [[4, 1, 99, 0]]), false);
  assert.equal(w.queueInputs(a, [[5, 1, 40, 2]]), false, 'Sumo no tiene Onda');
  assert.equal(w.queueInputs(a, 'hola'), false);
});

test('un Empujón bien dado manda al rival varias veces más lejos que un simple empujón', () => {
  const run = (dashIt) => {
    const w = new World(1);
    const a = w.addPlayer({});
    const b = w.addPlayer({});
    w.spawn(a.num);
    w.spawn(b.num);
    while (w.phase !== PH.play || w.tick < w.rt0) w.step();
    put(a, -100, 0);
    put(b, 0, 0);
    const right = encodeMove(1, 0);
    w.queueInputs(a, [[1, w.tick, right, 0]]);
    steps(w, 4);
    if (dashIt) w.queueInputs(a, [[2, w.tick, right, 1]]);
    let max = 0;
    for (let i = 0; i < 40; i++) {
      w.step();
      max = Math.max(max, b.x);
      if (!b.alive) break;
    }
    return max;
  };
  assert.ok(run(true) > run(false) + 60, `${run(true)} vs ${run(false)}`);
});

test('determinismo: misma semilla y mismas entradas dan el mismo mundo; otra semilla, otro', () => {
  function play(seed) {
    const w = new World(seed);
    const bots = [];
    for (let i = 0; i < 6; i++) {
      const p = w.addPlayer({ name: 'b' + i, bot: true });
      bots.push([p, brain(1 + (i % 3), w.rnd)]);
      w.spawn(p.num);
    }
    const me = w.addPlayer({ name: 'yo' });
    w.spawn(me.num);
    let seq = 0;
    const hashes = [];
    for (let t = 0; t < 4000; t++) {
      for (const [p, b] of bots) (p.alive ? think(w, p, b) : w.spawn(p.num));
      if (!me.alive) w.spawn(me.num);
      if (t % 13 === 0) w.queueInputs(me, [[++seq, w.tick + 1, (t * 7) % 81, t % 5 === 0 ? 1 : 0]]);
      w.step();
      w.deaths.length = 0;
      if (t % 200 === 0) hashes.push(w.digest());
    }
    return hashes.join(',');
  }
  assert.equal(play(42), play(42));
  assert.notEqual(play(42), play(43));
});

// ---------------------------------------------------------------- bots
function botWorld(n, seed, levels = [1, 2, 3]) {
  const w = new World(seed);
  const bots = [];
  for (let i = 0; i < n; i++) {
    const p = w.addPlayer({ name: 'b' + i, bot: true });
    bots.push([p, brain(levels[i % levels.length], w.rnd), levels[i % levels.length]]);
    w.spawn(p.num);
  }
  return { w, bots };
}

test('bots: la tabla de frenado coincide con frenar de verdad', () => {
  const w = new World(1);
  const p = w.addPlayer({});
  w.spawn(p.num);
  while (w.phase !== PH.play || w.tick < w.rt0) w.step();
  for (const v of [60, 250, 600]) {
    put(p, 0, 0, v, 0);
    p.mx = -1;
    p.my = 0;
    const x0 = p.x;
    for (let i = 0; i < 80; i++) {
      w.step();
      if (p.vx <= 0) break;
    }
    const real = p.x - x0;
    const est = brakeDist(v);
    assert.ok(Math.abs(real - est) < 0.2 * est + 6, `v=${v}: real ${real.toFixed(1)} vs tabla ${est.toFixed(1)}`);
  }
});

test('bots (los 3 niveles): no se caen solos, no se quedan quietos y las rondas terminan con ganador', () => {
  let falls = 0;
  let self = 0;
  let rounds = 0;
  let noWinner = 0;
  let still = 0;
  let longestStill = 0;
  let aliveTicks = 0;
  const wins = [0, 0, 0, 0];
  for (const seed of [11, 12, 13]) {
    const { w, bots } = botWorld(9, seed);
    const run = new Map();
    let last = 0;
    for (let t = 0; t < 700 * TPS; t++) {
      for (const [p, b] of bots) {
        if (!p.alive) w.spawn(p.num);
        else {
          think(w, p, b);
          if (w.phase === PH.play && w.tick >= w.rt0) {
            const quiet = speedOf(p) < 8 ? (run.get(p.num) || 0) + 1 : 0;
            run.set(p.num, quiet);
            still += quiet ? 1 : 0;
            aliveTicks++;
            longestStill = Math.max(longestStill, quiet);
          }
        }
      }
      w.step();
      for (const d of w.deaths) {
        falls++;
        if (!d.by) self++;
      }
      w.deaths.length = 0;
      if (w.result.n !== last) {
        last = w.result.n;
        rounds++;
        if (!w.result.winner) noWinner++;
      }
    }
    for (const [p, , lv] of bots) wins[lv] += p.wins;
    for (const [p] of bots) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.vx), 'sin NaN');
  }
  assert.ok(rounds >= 25, `rondas ${rounds}`);
  assert.ok(falls > 180, `caídas ${falls}`);
  assert.ok(self / falls < 0.03, `caídas sin que nadie los toque: ${self} de ${falls}`);
  assert.ok(noWinner <= 1, `rondas sin ganador ${noWinner}`);
  assert.ok(longestStill < 2 * TPS, `un bot se quedó quieto ${longestStill} pasos seguidos`);
  assert.ok(still / aliveTicks < 0.1, `tiempo casi quieto: ${((100 * still) / aliveTicks).toFixed(1)}%`);
  assert.ok(wins[3] > wins[1] && wins[2] > wins[1], `ganan más los de nivel alto: ${wins}`);
});

test('bot solo en la plataforma: pasea, nunca se cae mientras haya lugar y la ronda cierra con la muerte súbita', () => {
  const { w, bots } = botWorld(1, 5, [1]);
  const [p, b] = bots[0];
  let moved = 0;
  for (let t = 0; t < 70 * TPS + 60; t++) {
    think(w, p, b);
    w.step();
    if (w.phase === PH.play && speedOf(p) > 20) moved++;
  }
  assert.equal(p.alive, true, 'a los 70 s sigue en pie');
  assert.ok(moved > 40 * TPS, 'y se movió casi todo el tiempo');
  for (let t = 0; t < 60 * TPS && p.alive; t++) {
    think(w, p, b);
    w.step();
  }
  assert.equal(p.alive, false, 'la plataforma se cierra');
});

test('bots: costo de un paso con 12 discos', () => {
  const { w, bots } = botWorld(12, 21);
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
test('snapshot: la propia primero y con más decimales, banderas, cuenta atrás, fin de ronda una sola vez y caídas', () => {
  const { w, ps } = started(4);
  const v = new Viewer(w, ps[2].num);
  const me = ps[2];
  put(me, 12.34567, -8.76543, 100.123456, -3.3333);
  me.fc = 17;
  let m = JSON.parse(JSON.stringify(v.build([])));
  assert.equal(m.t, 's');
  assert.equal(m.k, w.tick);
  assert.deepEqual(m.r.slice(0, 2), [PH.play, 1]);
  assert.equal(m.r[4], 4);
  assert.equal(m.h.length, 4);
  assert.deepEqual(m.h[0], [me.num, 12.35, -8.77, 100.12, -3.33, 2]);
  assert.equal(m.a, me.seq);
  assert.deepEqual(m.o, [me.dashCd, me.dashT, 0, me.mc, 17]);
  const other = m.h.find((e) => e[0] === ps[0].num);
  assert.ok(Number.isInteger(other[3]) && Number.isInteger(other[4]), 'las demás: velocidad entera');
  assert.ok((String(other[1]).split('.')[1] || '').length <= 1, 'las demás: un decimal');
  // dash en curso
  me.dashT = 5;
  assert.equal(v.build([]).h[0][5] & 1, 1);
  me.dashT = 0;
  // una caída llega con su por quién
  const d = [{ x: 100.4, y: -50.6, color: 3, num: ps[1].num, by: ps[0].num }];
  m = v.build(d);
  assert.deepEqual(m.x, [[100, -51, 3, ps[1].num, ps[0].num]]);
  assert.equal(m.res, undefined);
  // fin de la ronda: el resultado va una vez (aunque se saltee un mensaje, el próximo lo trae)
  put(ps[1], w.R + 5, 0);
  put(ps[2], -w.R - 5, 0);
  put(ps[3], 0, w.R + 5);
  w.step();
  m = v.build([]);
  assert.deepEqual(m.res, [1, ps[0].num]);
  assert.equal(m.a, undefined, 'no está en pie: sin datos propios');
  assert.equal(m.r[0], PH.wait);
  assert.equal(m.r[2], 4 * TPS);
  assert.equal(v.build([]).res, undefined, 'una sola vez');
  // quien entra a mitad de la pausa no ve el resultado de una ronda que no vio
  const v2 = new Viewer(w, ps[1].num);
  assert.equal(v2.build([]).res, undefined);
  // reconectar: el resultado viejo no vuelve
  v.reset();
  assert.equal(v.build([]).res, undefined);
});

test('snapshot: 12 discos pesan lo justo para 15 por segundo (≤ 15 KB/s por cliente)', () => {
  const { w, ps } = started(12, 8);
  steps(w, 100);
  for (const p of ps) put(p, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 500);
  const bytes = JSON.stringify(new Viewer(w, ps[0].num).build([])).length;
  assert.ok(bytes * 15 < 15 * 1024, `${bytes} B × 15 = ${bytes * 15} B/s`);
  assert.ok(bytes < 700, `${bytes} B`);
});

// ---------------------------------------------------------------- servidor real
let srv;
before(async () => {
  srv = await startServer({ MAX_RT_ROOMS: '4' });
});
after(() => srv?.stop());

test('servidor: una persona entra a Sumo, se une a la ronda, mueve su disco y recibe snapshots a 15 Hz con su ack', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'create', game: 'sumo', name: 'Ana' });
  await wait(400);
  assert.ok(c.last('joined'));
  assert.ok(c.msgs.findIndex((m) => m.t === 'reset') < c.msgs.findIndex((m) => m.t === 'me'), 'reset antes que me');
  assert.equal(c.last('room').room.state, 'playing', 'arrancó sola');
  const me0 = c.last('me');
  assert.equal(me0.alive, false);
  assert.equal(me0.R0, 260);
  assert.equal(me0.r, 18);
  assert.equal(me0.tps, 30);
  c.send({ t: 'spawn', name: 'Ana', color: 3 });
  await wait(300);
  // la primera ronda de la arena empieza a los 2 s de que alguien se anota; con bots y gente la cuenta ya corre
  let alive = false;
  for (let i = 0; i < 40 && !alive; i++) {
    await wait(100);
    alive = !!c.last('me')?.alive || !!c.last('s')?.o;
  }
  const s0 = c.last('s');
  assert.ok(s0, 'recibe snapshots');
  assert.ok(s0.o, 'ya está en la plataforma (hay datos propios)');
  assert.equal(s0.h[0][0], c.last('me').num, 'el propio va primero');
  assert.equal(s0.r[0], PH.play);
  assert.ok(s0.h.length >= 2 && s0.h.length <= 10, `Ana y los bots (${s0.h.length})`);
  const toCenter = encodeMove(-s0.h[0][1], -s0.h[0][2]);
  c.send({ t: 'i', e: [[1, s0.k + 1, toCenter, 0]] });
  c.send({ t: 'i', e: [[1, s0.k + 1, toCenter, 0], [2, s0.k + 4, toCenter, 1]] });
  await wait(1000);
  for (let i = 0; i < 30 && !(c.last('s').a >= 2); i++) await wait(100);
  const s1 = c.last('s');
  assert.equal(s1.a, 2, 'ack de la última entrada');
  const before = c.all('s').length;
  await wait(1000);
  const rate = c.all('s').length - before;
  assert.ok(rate >= 11 && rate <= 17, `${rate} snapshots por segundo`);
  assert.ok(Math.hypot(s1.h[0][1], s1.h[0][2]) < Math.hypot(s0.h[0][1], s0.h[0][2]) - 20, 'se acercó al centro (o ya chocó)');
  // entradas mal formadas no rompen nada
  c.send({ t: 'i', e: [[3, 0, 99, 0]] });
  c.send({ t: 'i', e: 'hola' });
  await wait(200);
  assert.ok(c.last('s').k > s1.k);
  c.ws.close();
});

test('servidor: se encuentra con "list", hay cupo para 10, entrar con la ronda en curso funciona y /health informa rt', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'sumo', name: 'Uno' });
  await wait(250);
  const code = a.last('joined').code;
  const b = await connect(srv.port);
  b.send({ t: 'list', game: 'sumo' });
  await wait(150);
  const mine = b.last('list').rooms.find((r) => r.code === code);
  assert.ok(mine && mine.state === 'playing' && mine.max === 10 && mine.n === 1);
  b.send({ t: 'join', game: 'sumo', code, name: 'Dos' });
  await wait(300);
  assert.ok(b.last('joined'));
  assert.ok(b.msgs.find((m) => m.t === 'reset'));
  assert.ok(b.last('pl').p.length >= 9, 'la tabla de jugadores incluye a los bots');
  const h = await fetch(`http://127.0.0.1:${srv.port}/health`).then((r) => r.json());
  assert.ok(h.rt.rooms >= 1 && h.rt.avgTickMs >= 0);
  a.ws.close();
  b.ws.close();
  await wait(100);
});

test('servidor: al reconectar con el token vuelve a su disco y recibe reset', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'sumo', name: 'Eli' });
  await wait(250);
  const j = a.last('joined');
  a.send({ t: 'spawn', name: 'Eli', color: 1 });
  await wait(250);
  const num = a.last('me').num;
  a.ws.terminate();
  await wait(300);
  const b = await connect(srv.port);
  b.send({ t: 'join', game: 'sumo', code: j.code, token: j.token, name: 'Eli' });
  await wait(400);
  assert.equal(b.last('joined').id, j.id);
  assert.ok(b.msgs.findIndex((m) => m.t === 'reset') >= 0);
  assert.equal(b.last('me').num, num, 'mismo disco');
  assert.ok(b.last('s'), 'sigue recibiendo snapshots');
  b.ws.close();
});

test('servidor: sin errores no controlados', () => {
  assert.doesNotMatch(srv.logs(), /\bfatal\b|^\S+ error /m);
});
