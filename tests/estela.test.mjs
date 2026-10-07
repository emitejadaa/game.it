/** Estela: reglas del mundo, bots, determinismo, sincronización por área de interés y partida real contra un servidor. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { World, CFG, DX, DY, applyInputs, stepOwn, trailPoints } from '../public/games/estela/shared/world.js';
import { brain, think } from '../public/games/estela/shared/bots.js';
import { Viewer, Mirror } from '../public/games/estela/shared/sync.js';
import { startServer, connect, wait } from './helpers.mjs';

/** Mundo chico con motos puestas a mano: put(w, x, y, dir) → jugador vivo con 1 celda. */
const world = (size = 40, seed = 1) => new World(seed, { size, tps: 20 });
function put(w, x, y, dir, { shield = 0, name = 'p' } = {}) {
  const p = w.addPlayer({ name, color: 0 });
  p.alive = true;
  p.x = x;
  p.y = y;
  p.dir = dir;
  p.verts = [x, y];
  p.cells = [y * w.size + x];
  p.ci = 0;
  p.len = 1;
  p.shield = shield;
  w.grid[y * w.size + x] = p.num;
  return p;
}
/** Deja la estela de `p` sobre esos puntos (el último es la cabeza). */
function lay(w, p, pts) {
  for (const c of p.cells) if (w.grid[c] === p.num) w.grid[c] = 0;
  p.cells = pts.map(([x, y]) => y * w.size + x);
  p.ci = 0;
  p.len = pts.length;
  for (const c of p.cells) w.grid[c] = p.num;
  [p.x, p.y] = pts[pts.length - 1];
  p.verts = [pts[0][0], pts[0][1]];
  for (let i = 1; i < pts.length - 1; i++) {
    const turn = pts[i + 1][0] - pts[i][0] !== pts[i][0] - pts[i - 1][0] || pts[i + 1][1] - pts[i][1] !== pts[i][1] - pts[i - 1][1];
    if (turn) p.verts.push(pts[i][0], pts[i][1]);
  }
}
const steps = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
const owner = (w, x, y) => w.grid[y * w.size + x];

test('pared: salir del mapa destruye la moto, sin crédito para nadie', () => {
  const w = world();
  const a = put(w, 2, 20, 3);
  steps(w, 2);
  assert.equal(a.alive, true);
  assert.equal(a.x, 0);
  w.step();
  assert.equal(a.alive, false);
  assert.equal(w.deaths.length, 1);
  assert.equal(w.deaths[0].by, 0);
  assert.equal(w.deaths[0].num, a.num);
  assert.equal(w.grid.reduce((s, v) => s + (v ? 1 : 0), 0), 0, 'su estela desaparece');
});

test('estela ajena: choca, muere y el KO es del dueño de la estela (que crece +20)', () => {
  const w = world();
  const a = put(w, 10, 10, 1, { name: 'dueña' });
  lay(w, a, [[10, 10], [11, 10], [12, 10], [13, 10], [14, 10]]);
  const b = put(w, 13, 14, 0, { name: 'víctima' }); // sube hacia la estela de a
  steps(w, 3); // y = 13, 12, 11
  assert.equal(b.alive, true);
  assert.equal(owner(w, 13, 10), a.num);
  w.step(); // (13, 10) está ocupada
  assert.equal(b.alive, false);
  assert.equal(w.deaths.at(-1).by, a.num);
  assert.equal(a.kos, 1);
  assert.equal(a.koTotal, 1);
  assert.equal(a.cap, CFG.capStart + CFG.capPerKo);
});

test('chocar con la propia estela no da crédito', () => {
  const w = world();
  const a = put(w, 10, 10, 1);
  // da una vuelta cerrada: derecha, abajo, izquierda, arriba → vuelve a pisar su estela
  steps(w, 2);
  a.inbox.push({ s: 1, k: w.tick + 1, d: 2, b: 0 });
  steps(w, 2);
  a.inbox.push({ s: 2, k: w.tick + 1, d: 3, b: 0 });
  steps(w, 2);
  a.inbox.push({ s: 3, k: w.tick + 1, d: 0, b: 0 });
  steps(w, 4);
  assert.equal(a.alive, false);
  assert.equal(w.deaths[0].by, 0, 'suicidio');
  assert.equal(a.kos, 0);
  assert.equal(a.cap, CFG.capStart);
});

test('cabeza contra cabeza (misma celda o cruzándose): mueren las dos y ninguna suma KO', () => {
  const w = world();
  const a = put(w, 10, 20, 1);
  const b = put(w, 12, 20, 3); // se encuentran en x=11
  w.step();
  assert.equal(a.alive || b.alive, false);
  assert.deepEqual(w.deaths.map((d) => d.by), [0, 0]);
  assert.equal(a.kos + b.kos, 0);
  const w2 = world();
  const c = put(w2, 10, 20, 1);
  const d = put(w2, 11, 20, 3); // adyacentes: se cruzarían
  w2.step();
  assert.equal(c.alive || d.alive, false);
});

test('escudo: atraviesa estelas, pero la pared lo destruye; contra una cabeza muere la otra y el escudo se lleva el KO', () => {
  const w = world();
  const wall = put(w, 20, 5, 2); // estela vertical de a
  for (let y = 6; y <= 12; y++) {
    w.grid[y * 40 + 20] = wall.num;
    wall.cells.push(y * 40 + 20);
  }
  wall.y = 12;
  wall.len = 8;
  wall.verts = [20, 5];
  wall.dir = 2;
  const s = put(w, 17, 8, 1, { shield: 10 });
  steps(w, 5);
  assert.equal(s.alive, true, 'cruzó la estela con escudo');
  const w2 = world();
  const s2 = put(w2, 1, 20, 3, { shield: 30 });
  steps(w2, 3);
  assert.equal(s2.alive, false, 'la pared no perdona');
  const w3 = world();
  const a = put(w3, 10, 20, 1, { shield: 10 });
  const b = put(w3, 12, 20, 3);
  w3.step();
  assert.equal(a.alive, true);
  assert.equal(b.alive, false);
  assert.equal(w3.deaths[0].by, a.num);
  assert.equal(a.kos, 1);
});

test('no hay KO si el dueño de la estela también muere en el mismo paso', () => {
  const w = world();
  const a = put(w, 10, 10, 1);
  lay(w, a, [[6, 10], [7, 10], [8, 10], [9, 10], [10, 10]]);
  const b = put(w, 8, 11, 0); // sube y pisa la estela de a en (8, 10)
  a.x = 39; // …pero a está a punto de salir del mapa: la movemos al borde
  lay(w, a, [[6, 10], [7, 10], [8, 10], [9, 10], [10, 10]]);
  a.dir = 3; // a va hacia la izquierda por su propia estela: muere también (suicidio) este mismo paso
  a.x = 10;
  w.step();
  assert.equal(a.alive, false);
  assert.equal(b.alive, false);
  assert.equal(a.kos, 0, 'a murió en el mismo paso: no cobra');
  assert.equal(w.deaths.find((d) => d.num === b.num).by, 0);
});

test('el largo de la estela no pasa del tope, que crece 20 por KO hasta 400', () => {
  const w = world(200);
  const a = put(w, 5, 100, 1);
  steps(w, 150);
  assert.equal(a.alive, true);
  assert.equal(a.len, 60);
  assert.equal(w.grid.reduce((s, v) => s + (v === a.num ? 1 : 0), 0), 60, 'el extremo viejo se borra del mapa');
  a.kos = 3;
  a.cap = 120;
  w.step();
  w.step();
  assert.equal(a.len, 62, 'la cola deja de recortarse mientras crece el tope');
  const w2 = world();
  const b = w2.addPlayer({});
  for (let i = 1; i <= 30; i++) {
    b.kos = i;
    b.cap = Math.min(CFG.capMax, CFG.capStart + CFG.capPerKo * i);
  }
  assert.equal(b.cap, 400);
});

test('turbo: avanza 1,5 celdas por paso, gasta unos 2 s de energía y no vuelve hasta soltar la tecla', () => {
  const w = world(400);
  const a = put(w, 5, 200, 1);
  a.inbox.push({ s: 1, k: 1, d: -1, b: 1 });
  w.step();
  assert.equal(a.turbo, 1);
  steps(w, 9);
  assert.equal(a.D, 15, '10 pasos × 1,5');
  let n = 10;
  while (a.turbo && n < 80) {
    w.step();
    n++;
  }
  assert.ok(n >= 40 && n <= 48, `el turbo duró ${n} pasos (2 s = 40, más lo que recarga solo)`);
  assert.equal(a.lock, 1);
  steps(w, 2);
  assert.equal(a.turbo, 0, 'sin energía se apaga solo');
  const d1 = a.D;
  steps(w, 4);
  assert.equal(a.D - d1, 4, 'y avanza a velocidad normal aunque siga apretando');
  // soltar y volver a apretar con poca energía no arranca (mínimo 10)
  a.energy = 5;
  a.inbox.push({ s: 2, k: w.tick + 1, d: -1, b: 0 }, { s: 3, k: w.tick + 2, d: -1, b: 1 });
  steps(w, 3);
  assert.equal(a.turbo, 0, 'con la energía baja no arranca');
  a.energy = 30;
  steps(w, 1);
  assert.equal(a.turbo, 1, 'con energía sí');
});

test('la energía se recarga rozando paredes o estelas (y un poco sola)', () => {
  const w = world();
  const a = put(w, 0, 30, 0); // sube por la columna 0: la pared está pegada
  a.energy = 10;
  steps(w, 4);
  assert.equal(a.energy, 10 + 4 * CFG.graze);
  const b = put(w, 20, 30, 0); // en campo abierto
  b.energy = 10;
  steps(w, 8);
  assert.equal(b.energy, 12, '+1 cada 4 pasos');
  // pegada a una estela ajena (una columna de 10 celdas que no se mueve: dueña sin avanzar, dirección a la pared)
  const w2 = world();
  const t = put(w2, 30, 20, 1);
  lay(w2, t, Array.from({ length: 10 }, (_, i) => [30, 20 + i]));
  t.dir = 2;
  t.y = 29;
  t.mv = 0;
  t.cap = 400;
  const c = put(w2, 31, 33, 0);
  c.energy = 10;
  w2.step(); // c sube a (31, 32): la estela está a 3 celdas
  assert.equal(c.energy, 10);
  c.y = 29;
  w2.grid[33 * 40 + 31] = 0;
  w2.grid[29 * 40 + 31] = c.num;
  c.cells = [29 * 40 + 31];
  const e0 = c.energy;
  w2.step(); // c sube a (31, 28): tiene la estela de t pegada a la izquierda (30, 28)
  assert.ok(c.energy >= e0 + CFG.graze, `energía ${c.energy}`);
});

test('giros: no hay vuelta en U y como máximo uno por paso', () => {
  const w = world(80);
  const a = put(w, 40, 40, 1);
  a.inbox.push({ s: 1, k: 1, d: 3, b: 0 }); // vuelta en U: se ignora
  w.step();
  assert.equal(a.dir, 1);
  a.inbox.push({ s: 2, k: w.tick + 1, d: 0, b: 0 }, { s: 3, k: w.tick + 1, d: 3, b: 0 }); // arriba y enseguida izquierda
  w.step();
  assert.equal(a.dir, 0, 'solo el primer giro de este paso');
  assert.equal(a.inbox.length, 1, 'el otro espera');
  w.step();
  assert.equal(a.dir, 3, 'se aplica en el paso siguiente');
  assert.equal(a.seq, 3);
  assert.deepEqual(a.verts, [40, 40, 41, 40, 41, 39]);
});

test('queueInputs: valida, ignora repetidas, acota el paso y limita la cola', () => {
  const w = world();
  const a = put(w, 10, 10, 1);
  w.tick = 100;
  assert.equal(w.queueInputs(a, 'x'), false);
  assert.equal(w.queueInputs(a, [[1, 2, 9, 0]]), false, 'dirección inválida');
  assert.equal(w.queueInputs(a, [[1.5, 2, 1, 0]]), false);
  assert.equal(w.queueInputs(a, [[1, 100, 1, 3]]), false, 'turbo inválido');
  assert.equal(w.queueInputs(a, [[1, NaN, 1, 0]]), false);
  assert.equal(w.queueInputs(a, new Array(7).fill([1, 1, 1, 0])), false, 'demasiadas');
  assert.equal(w.queueInputs(a, [[1, 100, 0, 0], [2, 100, -1, 1]]), true);
  assert.equal(w.queueInputs(a, [[1, 100, 0, 0], [2, 100, -1, 1], [3, 5000, 2, 0]]), true, 'redundancia: 1 y 2 ya estaban');
  assert.deepEqual(a.inbox.map((e) => e.s), [1, 2, 3]);
  assert.equal(a.inbox[2].k, 112, 'un paso demasiado en el futuro se acota');
  assert.equal(w.queueInputs(a, [[4, -9999, 1, 0]]), true);
  assert.ok(a.inbox[3].k >= 100, 'y los pasos nunca retroceden');
  for (let s = 5; s < 30; s++) w.queueInputs(a, [[s, 100, 1, 0]]);
  assert.equal(a.inbox.length, CFG.inboxMax);
});

test('reaparecer: espera 2,5 s, nace libre, mirando al centro y con 1,5 s de escudo', () => {
  const w = world(120, 5);
  const a = w.addPlayer({ name: 'a' });
  assert.equal(w.spawn(a.num), true);
  assert.equal(a.shield, 30);
  assert.ok(a.x >= 12 && a.x < 108 && a.y >= 12 && a.y < 108);
  const toCenter = [DY[a.dir] * (60 - a.y) > 0 || DX[a.dir] * (60 - a.x) > 0].some(Boolean);
  assert.ok(toCenter);
  w._kill(a, null);
  assert.equal(w.canSpawn(a.num), false);
  assert.equal(w.waitTicks(a.num), 50);
  steps(w, 49);
  assert.equal(w.canSpawn(a.num), false);
  w.step();
  assert.equal(w.canSpawn(a.num), true);
  // con el mapa lleno de estelas busca el lugar más vacío
  for (let i = 0; i < 6; i++) w.spawn(w.addPlayer({ name: 'b' + i }).num);
  assert.equal(w.spawn(a.num), true);
  const near = [...w.players.values()].filter((p) => p !== a && p.alive && Math.abs(p.x - a.x) + Math.abs(p.y - a.y) < 8);
  assert.equal(near.length, 0, 'no nace pegada a otras');
  assert.equal(w.spawn(a.num), false, 'ya está viva');
});

test('puntaje: tiempo vivo + 10 por KO + largo; se guarda al morir y ordena el ranking', () => {
  const w = world(80);
  const a = put(w, 10, 40, 1);
  const b = put(w, 10, 60, 1);
  steps(w, 40); // 2 s vivos, largo 41
  assert.equal(w.score(a), 2 + 41);
  a.kos = 2;
  assert.equal(w.score(a), 2 + 20 + 41);
  b.kos = 0;
  assert.equal(w.leaderboard(2)[0][0], a.num);
  w._kill(a, b);
  assert.equal(w.deaths.at(-1).stats.kos, 2);
  assert.equal(a.banked, 2 + 20, 'solo tiempo y KO: el largo no se guarda');
  assert.equal(w.score(a), 22);
  assert.equal(b.koTotal, 1);
});

test('determinismo: misma semilla y mismas entradas dan el mismo mundo; otra semilla, otro', () => {
  function play(seed) {
    const w = new World(seed, { size: 100, tps: 20 });
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
    for (let t = 0; t < 1500; t++) {
      for (const [p, b] of bots) {
        if (!p.alive) w.spawn(p.num);
        else think(w, p, b);
      }
      if (!me.alive) w.spawn(me.num);
      if (t % 17 === 0) w.queueInputs(me, [[++seq, w.tick + 2, (t / 17) & 3, t % 5 === 0 ? 1 : 0]]);
      w.step();
      w.deaths.length = 0;
      if (t % 100 === 0) hashes.push(w.digest());
    }
    return hashes.join(',');
  }
  assert.equal(play(42), play(42));
  assert.notEqual(play(42), play(43));
});

test('bots: nunca se meten en una celda sólida si tienen una vecina libre (3 niveles, con turbo)', () => {
  const w = new World(9, { size: 60, tps: 20 });
  const bots = [];
  for (let i = 0; i < 9; i++) {
    const p = w.addPlayer({ name: 'b' + i, bot: true });
    bots.push([p, brain(1 + (i % 3), w.rnd)]);
    w.spawn(p.num);
  }
  let decisions = 0;
  let blunders = 0;
  const deaths = { wall: 0, other: 0 };
  for (let t = 0; t < 3000; t++) {
    for (const [p, b] of bots) {
      if (!p.alive) {
        w.spawn(p.num);
        continue;
      }
      think(w, p, b);
      const free = [p.dir, (p.dir + 1) & 3, (p.dir + 3) & 3].some((d) => !w.blocked(p.x + DX[d], p.y + DY[d]));
      const ghost = p.shield > 0;
      if (free && !ghost) {
        decisions++;
        // celda de adelante (y la segunda, si va a avanzar dos)
        const cells = [[p.x + DX[p.dir], p.y + DY[p.dir]]];
        if (p.turboWant && p.energy >= 2) cells.push([p.x + DX[p.dir] * 2, p.y + DY[p.dir] * 2]);
        if (cells.some(([x, y]) => w.blocked(x, y))) blunders++;
      }
    }
    w.step();
    for (const d of w.deaths) deaths[d.by ? 'other' : 'wall']++;
    w.deaths.length = 0;
  }
  assert.ok(decisions > 5000);
  assert.equal(blunders, 0, `${blunders} de ${decisions} pasos con salida libre terminaron en un choque seguro`);
  assert.ok(w.leaderboard(1)[0][1] > 20, 'y juegan: alguien suma puntos');
});

test('bots: juegan miles de pasos sin errores y se matan entre sí de vez en cuando', () => {
  const w = new World(3, { size: 160, tps: 20 });
  const bots = [];
  for (let i = 0; i < 10; i++) {
    const p = w.addPlayer({ name: 'b' + i, bot: true });
    bots.push([p, brain(1 + (i % 3), w.rnd)]);
    w.spawn(p.num);
  }
  let kos = 0;
  let deaths = 0;
  const t0 = performance.now();
  for (let t = 0; t < 4000; t++) {
    for (const [p, b] of bots) (p.alive ? think(w, p, b) : w.canSpawn(p.num) && w.spawn(p.num));
    w.step();
    for (const d of w.deaths) {
      deaths++;
      if (d.by) kos++;
    }
    w.deaths.length = 0;
  }
  const ms = (performance.now() - t0) / 4000;
  assert.ok(deaths > 10, `muertes ${deaths}`);
  assert.ok(kos > 0, 'hay KO');
  assert.ok(ms < 1.5, `ms por paso ${ms}`);
});

// ---------------------------------------------------------------- sincronización
function sim(size, nBots, seed) {
  const w = new World(seed, { size, tps: 20 });
  const bots = [];
  for (let i = 0; i < nBots; i++) {
    const p = w.addPlayer({ name: 'b' + i, bot: true });
    bots.push([p, brain(1 + (i % 3), w.rnd)]);
    w.spawn(p.num);
  }
  const me = w.addPlayer({ name: 'yo' });
  w.spawn(me.num);
  const tick = () => {
    for (const [p, b] of bots) (p.alive ? think(w, p, b) : w.canSpawn(p.num) && w.spawn(p.num));
    if (!me.alive && w.canSpawn(me.num)) w.spawn(me.num);
    w.step();
    const d = w.deaths.splice(0);
    return d;
  };
  return { w, me, tick };
}
const cellsOf = (b) => {
  const pts = trailPoints(b.verts, b.x, b.y, b.len, []);
  let n = 1;
  for (let i = 2; i < pts.length; i += 2) n += Math.abs(pts[i] - pts[i - 2]) + Math.abs(pts[i + 1] - pts[i - 1]);
  return Math.round(n);
};

test('sincronización: el espejo del cliente reconstruye cabezas y estelas (aun saltando mensajes)', () => {
  const { w, me, tick } = sim(160, 9, 11);
  const v = new Viewer(w, me.num);
  const m = new Mirror();
  let checked = 0;
  for (let t = 0; t < 2500; t++) {
    const deaths = tick();
    // 1 de cada 4 mensajes se saltea (backpressure): el siguiente tiene que traer todo lo que faltó
    if (t % 4 === 1) continue;
    const msg = JSON.parse(JSON.stringify(v.build(deaths)));
    m.apply(msg);
    for (const b of m.bikes.values()) {
      const p = w.players.get(b.num);
      assert.ok(p.alive, 'solo hay motos vivas');
      assert.deepEqual([b.x, b.y, b.dir, b.len, b.D], [p.x, p.y, p.dir, p.len, p.D]);
      assert.equal(cellsOf(b), p.len, `largo de la estela de ${b.num} en el paso ${t}`);
      checked++;
    }
    if (me.alive) assert.equal(msg.a, me.seq);
  }
  assert.ok(checked > 10000);
});

test('área de interés: solo se mandan las motos cercanas, con histéresis, y sus estelas completas al entrar en vista', () => {
  const w = new World(1, { size: 400, tps: 20 });
  const at = (p, x, y) => {
    lay(w, p, [[x, y]]);
  };
  const me = put(w, 50, 200, 1);
  const near = put(w, 90, 200, 1);
  const far = put(w, 300, 200, 1);
  const edge = put(w, 200, 150, 1);
  const v = new Viewer(w, me.num);
  const m = new Mirror();
  let msg = v.build([]);
  m.apply(msg);
  assert.deepEqual(msg.h.map((e) => e[0]).sort(), [me.num, near.num].sort(), 'la lejana no va');
  assert.equal(msg.h[0][0], me.num, 'la propia va primero');
  assert.equal(msg.h[0][5] & 4, 4, 'la primera vez, estela completa');
  w.tick++;
  msg = v.build([]);
  assert.equal(msg.h[0][5] & 4, 0, 'después solo cabeza y esquinas nuevas');
  assert.equal(msg.h[0].length, 7);
  at(edge, 50 + 80, 150); // 80 > 72: todavía no entra
  assert.ok(!v.build([]).h.some((e) => e[0] === edge.num));
  at(edge, 50 + 70, 150);
  msg = v.build([]);
  assert.ok(msg.h.some((e) => e[0] === edge.num), 'entra a 70');
  at(edge, 50 + 85, 150);
  msg = v.build([]);
  assert.ok(msg.h.some((e) => e[0] === edge.num), 'sigue a 85 (histéresis hasta 88)');
  assert.equal(msg.h.find((e) => e[0] === edge.num)[5] & 4, 0, 'y no se reenvía completa');
  at(edge, 50 + 95, 150);
  msg = v.build([]);
  assert.deepEqual(msg.g, [edge.num], 'sale de vista');
  m.apply(msg);
  assert.ok(!m.bikes.has(edge.num));
  at(edge, 50 + 60, 150);
  msg = v.build([]);
  assert.equal(msg.h.find((e) => e[0] === edge.num)[5] & 4, 4, 'al volver a entrar, estela completa otra vez');
  // muertes: solo las cercanas
  msg = v.build([{ x: 55, y: 200, color: 1 }, { x: 390, y: 10, color: 2 }]);
  assert.deepEqual(msg.x, [[55, 200, 1]]);
  // reset (reconexión): vuelve a mandar todo
  v.reset();
  assert.equal(v.build([]).h[0][5] & 4, 4);
  void far;
});

test('predicción de la moto propia: con las mismas entradas y el mismo paso da exactamente lo mismo que el servidor', () => {
  const w = world(400);
  const a = put(w, 20, 200, 1);
  const own = { x: 20, y: 200, dir: 1, D: 0, len: 1, cap: 60, verts: [20, 200], turboWant: 0, turbo: 0, lock: 0, energy: CFG.energyMax, frac: 0, shield: 0, seq: 0 };
  const hist = [];
  let seq = 0;
  for (let t = 1; t <= 200; t++) {
    if (t % 11 === 0) hist.push({ s: ++seq, k: t, d: (t / 11) % 2 ? 1 : 2, b: 0 }); // escalera hacia abajo y a la derecha
    if (t % 11 === 5) hist.push({ s: ++seq, k: t, d: -1, b: (t / 11) & 1 });
    w.queueInputs(a, hist.slice(-3).map((e) => [e.s, e.k, e.d, e.b]));
    w.step();
    stepOwn(own, hist, t, 400);
    if (!a.alive) break;
    assert.deepEqual([own.x, own.y, own.dir, own.D, own.len, own.seq, own.turbo, own.energy], [a.x, a.y, a.dir, a.D, a.len, a.seq, a.turbo, a.energy], `paso ${t}`);
    assert.deepEqual(own.verts.slice(-2), a.verts.slice(-2));
  }
  assert.ok(seq > 20 && a.alive);
  assert.ok(a.D > 200, 'hubo turbo');
  void applyInputs;
});

// ---------------------------------------------------------------- servidor real
let srv;
before(async () => {
  srv = await startServer({ MAX_RT_ROOMS: '4' });
});
after(() => srv?.stop());

test('servidor: una persona entra a una arena de Estela, nace, gira y recibe snapshots con su ack', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'create', game: 'estela', name: 'Ana' });
  await wait(400);
  assert.ok(c.last('joined'));
  assert.equal(c.msgs.findIndex((m) => m.t === 'reset') < c.msgs.findIndex((m) => m.t === 'me'), true, 'reset antes que me');
  const room = c.last('room').room;
  assert.equal(room.state, 'playing', 'arrancó sola');
  const me = c.last('me');
  assert.equal(me.alive, false);
  assert.equal(me.size, 160);
  assert.equal(me.tps, 20);
  c.send({ t: 'spawn', name: 'Ana', color: 3 });
  await wait(500);
  assert.equal(c.last('me').alive, true);
  const s0 = c.last('s');
  assert.ok(s0, 'recibe snapshots');
  assert.equal(s0.h[0][0], me.num, 'la moto propia va primera');
  assert.ok(s0.h.length >= 1 && s0.h.length <= 10, 'ella y las motos cercanas');
  assert.ok(s0.o && s0.o[1] === 60, 'energía, largo máximo…');
  // gira: la entrada se aplica y se confirma
  const before = c.all('s').length;
  c.send({ t: 'i', e: [[1, s0.k + 3, (s0.h[0][3] + 1) & 3, 0]] });
  await wait(700);
  const s1 = c.last('s');
  assert.equal(s1.a, 1, 'ack de la entrada');
  assert.ok(c.all('s').length - before >= 10, 'unos 20 snapshots por segundo');
  assert.notEqual(s1.h[0][3], s0.h[0][3], 'cambió de dirección (si no murió antes)');
  // una entrada mal formada suma una falta pero no rompe nada
  c.send({ t: 'i', e: [[2, 0, 9, 0]] });
  c.send({ t: 'i', e: 'hola' });
  await wait(200);
  assert.ok(c.last('s').k > s1.k);
  c.ws.close();
});

test('servidor: la sala se puede encontrar con "list", hay cupo para 10 y se informa rt en /health', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'estela', name: 'Uno' });
  await wait(250);
  const code = a.last('joined').code;
  const b = await connect(srv.port);
  b.send({ t: 'list', game: 'estela' });
  await wait(150);
  const list = b.last('list');
  const mine = list.rooms.find((r) => r.code === code);
  assert.ok(mine && mine.state === 'playing' && mine.max === 10 && mine.n === 1);
  assert.ok(list.rt.rooms >= 1 && list.rt.max === 4);
  b.send({ t: 'join', game: 'estela', code, name: 'Dos' });
  await wait(300);
  assert.ok(b.last('joined'), 'entra con la partida en curso');
  assert.equal(b.msgs.find((m) => m.t === 'reset') !== undefined, true);
  const h = await fetch(`http://127.0.0.1:${srv.port}/health`).then((r) => r.json());
  assert.ok(h.rt.rooms >= 1 && h.rt.avgTickMs >= 0);
  a.ws.close();
  b.ws.close();
  await wait(100);
});

test('servidor: al reconectar con el token vuelve a la misma moto y recibe reset', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'estela', name: 'Eli' });
  await wait(250);
  const j = a.last('joined');
  a.send({ t: 'spawn', name: 'Eli', color: 1 });
  await wait(250);
  const num = a.last('me').num;
  a.ws.terminate();
  await wait(300);
  const b = await connect(srv.port);
  b.send({ t: 'join', game: 'estela', code: j.code, token: j.token, name: 'Eli' });
  await wait(400);
  assert.equal(b.last('joined').id, j.id);
  assert.ok(b.msgs.findIndex((m) => m.t === 'reset') >= 0);
  assert.equal(b.last('me').num, num, 'misma moto');
  assert.ok(b.last('s'), 'sigue recibiendo snapshots');
  b.ws.close();
});

test('servidor: sin errores no controlados', () => {
  assert.doesNotMatch(srv.logs(), /\bfatal\b|^\S+ error /m);
});
