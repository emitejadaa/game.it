/** Territorio: reglas del mundo, captura, bots, determinismo, sincronización por diferencias y partida real contra un servidor. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { World, CFG, DX, DY, applyInputs, enclosed, trailCells, turnTo } from '../public/games/territorio/shared/world.js';
import { brain, think } from '../public/games/territorio/shared/bots.js';
import { Viewer, Mirror, rectDiff } from '../public/games/territorio/shared/sync.js';
import { startServer, connect, wait } from './helpers.mjs';

const U = 0,
  Rt = 1,
  D = 2,
  L = 3; // arriba, derecha, abajo, izquierda
const world = (size = 40, seed = 1) => new World(seed, { size, tps: 10 });
/** Pone a un jugador vivo con su 5×5 centrado en (cx, cy) (como `spawn`, pero en el lugar que se pide). */
function place(w, cx, cy, dir = Rt, name = 'p') {
  const p = w.addPlayer({ name, color: 0 });
  p.alive = true;
  p.x = cx;
  p.y = cy;
  p.dir = dir;
  p.bb = [cx, cy, cx, cy];
  w._victims.clear();
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) w._give(p, y * w.size + x);
  p.peak = p.area;
  return p;
}
/** Deja a `p` afuera con una estela ya hecha: sale de la celda propia `exit`, pasa por las esquinas y termina en `head`. */
function lay(w, p, exit, corners, head, dir) {
  const verts = [...exit, ...corners.flat()];
  p.verts = verts;
  p.trail = trailCells(verts, head[0], head[1], w.size);
  for (const c of p.trail) w.trailAt[c] = p.num;
  p.out = true;
  p.tid++;
  [p.x, p.y] = head;
  p.dir = dir;
}
const steps = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
/** Hace que `p` gire en el próximo paso (como lo haría una entrada ya aplicable). */
const turn = (w, p, d) => p.inbox.push({ s: ++p.inSeq, k: w.tick + 1, d });
const own = (w, x, y) => w.owner[y * w.size + x];
const trailOwn = (w, x, y) => w.trailAt[y * w.size + x];
const count = (w, num) => w.owner.reduce((s, v) => s + (v === num ? 1 : 0), 0);

test('nacer: 5×5 propio dentro del mapa, mirando al centro, y el área cuenta', () => {
  const w = world(120);
  const p = w.addPlayer({ name: 'a' });
  assert.equal(w.spawn(p.num), true);
  assert.equal(p.alive, true);
  assert.equal(p.area, 25);
  assert.equal(count(w, p.num), 25);
  assert.ok(p.x >= 5 && p.x <= 114 && p.y >= 5 && p.y <= 114);
  const dx = 60 - p.x;
  const dy = 60 - p.y;
  const toward = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? Rt : L) : dy > 0 ? D : U;
  assert.equal(p.dir, toward);
  assert.equal(w.spawn(p.num), false, 'ya está vivo');
});

test('movimiento: una celda por paso, adentro no hay estela, afuera sí, y no hay vuelta en U', () => {
  const w = world();
  const p = place(w, 20, 20); // su 5×5 ocupa x 18..22
  w.step();
  assert.deepEqual([p.x, p.y], [21, 20]);
  assert.equal(p.out, false);
  assert.equal(p.trail.length, 0);
  w.step();
  assert.deepEqual([p.x, p.y], [22, 20]);
  assert.equal(p.out, false, 'el borde del 5×5 todavía es territorio');
  w.step();
  assert.equal(p.out, true);
  assert.deepEqual(p.verts, [22, 20], 'la poligonal arranca en la celda propia de la que salió');
  assert.deepEqual(p.trail, [20 * 40 + 23]);
  assert.equal(trailOwn(w, 23, 20), p.num);
  assert.equal(turnTo(p, L), false, 'vuelta en U');
  assert.equal(turnTo(p, Rt), false, 'ya va para ahí');
  assert.equal(p.verts.length, 2);
  assert.equal(turnTo(p, D), true);
  assert.deepEqual(p.verts, [22, 20, 23, 20], 'afuera, cada giro deja una esquina');
});

test('captura de una zona rectangular: área = 5×5 + estela + interior', () => {
  const w = world();
  const a = place(w, 20, 20);
  a.x = 22;
  a.y = 18; // borde derecho (x 18..22, y 18..22)
  // derecha 3 → (25,18); abajo 4 → (25,22); izquierda 3 → (22,22) vuelve a su 5×5
  steps(w, 3);
  assert.equal(a.out, true);
  turn(w, a, D);
  steps(w, 4);
  turn(w, a, L);
  steps(w, 3);
  assert.equal(a.out, false, 'volvió');
  assert.equal(a.trail.length, 0);
  assert.equal(a.verts.length, 0);
  // estela: (23..25,18) + (25,19..22) + (24..23,22) = 3 + 4 + 2 = 9; interior: x 23..24, y 19..21 = 6
  assert.equal(a.area, 25 + 9 + 6);
  assert.equal(count(w, a.num), a.area);
  assert.equal(own(w, 24, 20), a.num, 'interior capturado');
  assert.equal(own(w, 25, 20), a.num, 'estela convertida');
  assert.equal(own(w, 26, 20), 0, 'afuera sigue neutral');
  assert.equal(w.trailAt.reduce((s, v) => s + (v ? 1 : 0), 0), 0, 'no queda estela');
});

test('captura: el relleno no se escapa por las diagonales (un rombo de celdas que solo se tocan por la esquina encierra)', () => {
  const n = 20;
  const owner = new Uint16Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.abs(x - 10) + Math.abs(y - 10) === 3) owner[y * n + x] = 1;
  const got = new Set(enclosed(owner, n, 1, [7, 7, 13, 13]));
  assert.equal(got.size, 13, 'el interior del rombo: |dx| + |dy| < 3');
  for (const i of got) assert.ok(Math.abs((i % n) - 10) + Math.abs(((i / n) | 0) - 10) < 3);
});

test('enclosed: coincide con un relleno de referencia en formas al azar', () => {
  const n = 24;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 60; t++) {
    const owner = new Uint16Array(n * n);
    for (let i = 0; i < n * n; i++) owner[i] = rnd() < 0.35 ? 1 : rnd() < 0.2 ? 2 : 0;
    let x0 = n,
      y0 = n,
      x1 = -1,
      y1 = -1;
    for (let i = 0; i < n * n; i++) {
      if (owner[i] !== 1) continue;
      const x = i % n;
      const y = (i - x) / n;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (x1 < 0) continue;
    const got = new Set(enclosed(owner, n, 1, [x0, y0, x1, y1]));
    // referencia: relleno desde el borde del MAPA entero (la corona de afuera está fuera de la grilla)
    const seen = new Uint8Array(n * n);
    const st = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      const i = y * n + x;
      if (seen[i] || owner[i] === 1) return;
      seen[i] = 1;
      st.push(i);
    };
    for (let k = 0; k < n; k++) (push(k, 0), push(k, n - 1), push(0, k), push(n - 1, k));
    while (st.length) {
      const i = st.pop();
      const x = i % n;
      const y = (i - x) / n;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    // fuera del rectángulo envolvente no hay territorio, así que los dos rellenos tienen que dar exactamente lo mismo
    const ref = new Set();
    for (let i = 0; i < n * n; i++) if (!seen[i] && owner[i] !== 1) ref.add(i);
    for (const i of got) assert.ok(ref.has(i), `sobra una encerrada (${i})`);
    for (const i of ref) assert.ok(got.has(i), `falta una encerrada (${i})`);
  }
});

test('captura: se lleva el territorio ajeno que quedó adentro y al que se queda sin nada lo mata (KO para quien capturó)', () => {
  const w = world();
  const a = place(w, 10, 10); // x 8..12, y 8..12
  const v = place(w, 18, 14, Rt); // 5×5 ajeno en x 16..20, y 12..16
  // a ya hizo casi todo el lazo grande alrededor de v: sale de (12, 10), derecha hasta x = 22, abajo hasta y = 18, izquierda hasta x = 12
  lay(w, a, [12, 10], [[22, 10], [22, 18], [12, 18]], [12, 13], U);
  assert.equal(v.alive, true);
  w.step(); // (12, 12) es su 5×5: cierra
  assert.equal(a.out, false);
  assert.equal(v.alive, false, 'se quedó sin territorio');
  assert.equal(w.deaths.length, 1);
  assert.equal(w.deaths[0].num, v.num);
  assert.equal(w.deaths[0].by, a.num);
  assert.equal(w.deaths[0].stats.why, 'lost');
  assert.equal(a.kos, 1);
  assert.equal(count(w, v.num), 0);
  assert.equal(count(w, a.num), a.area);
  // 5×5 propio + estela (10 + 8 + 10 + 5) + interior 9 × 7 con el 5×5 de v adentro
  assert.equal(a.area, 25 + 33 + 63);
});

test('muerte: pisar la propia estela', () => {
  const w = world();
  const a = place(w, 20, 20);
  a.x = 22;
  steps(w, 4); // (26, 20)
  turn(w, a, D);
  steps(w, 2); // (26, 22)
  turn(w, a, L);
  steps(w, 2); // (24, 22)
  turn(w, a, U);
  steps(w, 2); // (24, 20) es estela propia: ahí va
  assert.equal(a.alive, false);
  assert.equal(w.deaths.at(-1).stats.why, 'self');
  assert.equal(w.deaths.at(-1).by, 0);
  assert.equal(count(w, a.num), 0, 'su territorio queda neutral');
  assert.equal(w.trailAt.reduce((s, v) => s + (v ? 1 : 0), 0), 0, 'y su estela se borra');
});

test('pared: afuera del territorio mata; adentro solo frena', () => {
  const w = world(40);
  const a = place(w, 2, 15, L); // 5×5 en x 0..4: pegado a la pared izquierda
  steps(w, 2); // (1, 15), (0, 15)
  assert.deepEqual([a.x, a.y], [0, 15]);
  w.step();
  assert.deepEqual([a.x, a.y], [0, 15], 'adentro: se queda');
  assert.equal(a.alive, true);
  assert.equal(a.moves, 2);
  // afuera: choca
  const b = place(w, 35, 15, Rt); // x 33..37
  steps(w, 4); // (36) (37) y afuera: (38,15) (39,15)
  assert.equal(b.out, true);
  w.step(); // x = 40 no existe
  assert.equal(b.alive, false);
  assert.equal(w.deaths.at(-1).stats.why, 'wall');
});

test('cruzar la estela de otro: él muere, el KO es de quien la cruzó y su territorio queda neutral', () => {
  const w = world();
  const a = place(w, 10, 20); // x 8..12
  const b = place(w, 30, 20, L); // x 28..32, y 18..22
  a.x = 12;
  a.dir = Rt;
  steps(w, 4); // a: (16, 20), con estela desde x = 13
  assert.equal(a.out, true);
  // b baja y cruza por la estela de a: b sale por arriba (y = 17), se acerca
  b.x = 15;
  b.y = 17;
  b.dir = D;
  b.out = true;
  b.verts = [15, 16];
  b.trail = [17 * 40 + 15];
  w.trailAt[17 * 40 + 15] = b.num;
  // (15,17) es neutral: b.out=true; sigue bajando → (15,18),(15,19),(15,20) es la estela de a (13..16, 20)
  steps(w, 2);
  assert.equal(a.alive && b.alive, true);
  w.step(); // b pisa (15,20)
  assert.equal(a.alive, false, 'a pierde: le cruzaron la estela');
  assert.equal(b.alive, true);
  assert.equal(w.deaths.at(-1).num, a.num);
  assert.equal(w.deaths.at(-1).by, b.num);
  assert.equal(w.deaths.at(-1).stats.why, 'cut');
  assert.equal(b.kos, 1);
  assert.equal(count(w, a.num), 0);
  assert.equal(w.trailAt.reduce((s, v) => s + (v === a.num ? 1 : 0), 0), 0);
});

test('adentro de su territorio uno cruza la estela de un invasor y lo mata', () => {
  const w = world();
  const a = place(w, 20, 20, D); // 18..22
  const v = place(w, 35, 20, L);
  // v entra por arriba con estela sobre el territorio de a: (20, 17), (20, 18), (20, 19)
  v.x = 20;
  v.y = 19;
  v.dir = D;
  v.out = true;
  v.verts = [20, 16];
  v.trail = [17 * 40 + 20, 18 * 40 + 20, 19 * 40 + 20];
  for (const c of v.trail) w.trailAt[c] = v.num;
  a.x = 20;
  a.y = 17; // a justo arriba, adentro? (20, 17) es neutral → mejor: a en (21, 19) yendo a la izquierda
  a.x = 21;
  a.y = 19;
  a.dir = L; // próximo paso: (20, 19) = estela de v
  w.step();
  assert.equal(v.alive, false);
  assert.equal(a.alive, true);
  assert.equal(w.deaths.at(-1).by, a.num);
});

test('cabeza contra cabeza afuera de los territorios: mueren los dos, sin KO', () => {
  const w = world();
  const a = place(w, 10, 10);
  const b = place(w, 30, 10, L);
  a.x = 12;
  b.x = 28;
  a.dir = Rt;
  b.dir = L;
  steps(w, 1); // a (13,10), b (27,10): afuera los dos
  assert.equal(a.out && b.out, true);
  // se acercan de a dos celdas: 14 y 26 … se juntan en 20: faltan 7 pasos y en el 8.º quedan en la misma celda o cruzados
  let guard = 0;
  while (a.alive && b.alive && guard++ < 20) w.step();
  assert.equal(a.alive, false);
  assert.equal(b.alive, false);
  assert.equal(w.deaths.length, 2);
  assert.ok(w.deaths.every((d) => d.by === 0 && d.stats.why === 'head'));
});

test('cabeza contra cabeza en la celda de uno de los dos: gana el dueño de la celda', () => {
  const w = world();
  const a = place(w, 20, 20, Rt); // x 18..22
  const b = place(w, 30, 20, L);
  a.x = 22; // borde derecho; el próximo paso (23, 20) ya no es suyo
  // b va hacia la izquierda y llega a (23,20)... para chocar en una celda de a hace falta un territorio mayor:
  for (let x = 23; x <= 24; x++) w._give(a, 20 * 40 + x);
  b.x = 26;
  b.y = 20;
  b.dir = L; // (25, 20) y luego (24, 20) es de a
  a.dir = Rt; // a va a (23, 20) → (24, 20): se encuentran en (24, 20)? a: 22→23→24 ; b: 26→25→24
  steps(w, 1); // a (23,20) b (25,20)
  assert.equal(a.alive && b.alive, true);
  w.step(); // ambos quieren (24, 20), que es de a
  assert.equal(b.alive, false, 'el que entra a territorio ajeno pierde');
  assert.equal(a.alive, true);
  assert.equal(w.deaths.at(-1).by, a.num);
  assert.equal(w.deaths.at(-1).stats.why, 'head');
});

test('reaparecer: espera de 3 s (30 pasos) y 5×5 nuevo', () => {
  const w = world(60);
  const a = place(w, 10, 10);
  w._kill(a, null, 'wall');
  assert.equal(a.alive, false);
  assert.equal(w.canSpawn(a.num), false);
  assert.equal(w.waitTicks(a.num), 30);
  steps(w, 29);
  assert.equal(w.canSpawn(a.num), false);
  w.step();
  assert.equal(w.canSpawn(a.num), true);
  assert.equal(w.waitTicks(a.num), 0);
  assert.equal(w.spawn(a.num), true);
  assert.equal(a.area, 25);
  assert.equal(a.out, false);
  assert.equal(a.kos, 0);
});

test('entradas: se validan, se aplican a su paso y como mucho un giro por paso', () => {
  const w = world();
  const a = place(w, 20, 20, Rt);
  assert.equal(w.queueInputs(a, 'hola'), false);
  assert.equal(w.queueInputs(a, [[1, 2, 9, 0]]), false);
  assert.equal(w.queueInputs(a, [[1.5, 2, 1, 0]]), false);
  assert.equal(w.queueInputs(a, [[1, 1, D, 0], [2, 1, L, 0]]), true);
  assert.equal(a.inbox.length, 2);
  w.step(); // aplica D (y L espera: ya sería giro a la izquierda desde abajo)
  assert.equal(a.dir, D);
  assert.equal(a.seq, 1);
  w.step();
  assert.equal(a.dir, L);
  assert.equal(a.seq, 2);
  assert.equal(w.queueInputs(a, [[2, 1, U, 0]]), true, 'repetida: se ignora');
  assert.equal(a.inbox.length, 0);
});

test('applyInputs: una entrada fechada en el futuro espera su paso', () => {
  const p = { dir: Rt, x: 0, y: 0, out: false, verts: [], seq: 0 };
  const list = [{ s: 1, k: 5, d: D }];
  applyInputs(p, list, 4);
  assert.equal(p.dir, Rt);
  applyInputs(p, list, 5);
  assert.equal(p.dir, D);
});

test('trailCells recorre la poligonal sin contar la celda de salida', () => {
  const cells = trailCells([5, 5, 8, 5, 8, 7], 6, 7, 20);
  assert.deepEqual(cells.map((c) => [c % 20, (c / 20) | 0]), [[6, 5], [7, 5], [8, 5], [8, 6], [8, 7], [7, 7], [6, 7]]);
});

test('el peor caso de la captura: una estela de 100×100 se resuelve en pocos milisegundos', () => {
  const w = new World(1, { size: 120 });
  const a = w.addPlayer({ name: 'x' });
  a.alive = true;
  a.x = 12;
  a.y = 10;
  a.dir = Rt;
  a.bb = [12, 10, 12, 10];
  for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) w._give(a, y * 120 + x);
  const go = (d, n) => {
    if (a.dir !== d) a.inbox.push({ s: ++a.inSeq, k: w.tick + 1, d });
    steps(w, n);
  };
  go(Rt, 98); // x = 110
  go(D, 100); // y = 110
  go(L, 100); // x = 10
  go(U, 97); // y = 13
  assert.equal(a.out, true);
  const t0 = performance.now();
  w.step(); // (10, 12) es su 5×5: cierra el lazo
  const closing = performance.now() - t0;
  assert.equal(a.alive, true);
  assert.equal(a.out, false, 'cerró el lazo');
  assert.ok(a.area > 9500, `capturó el cuadrado (${a.area})`);
  assert.equal(count(w, a.num), a.area);
  console.log(`  paso que cierra un lazo de 100×100: ${closing.toFixed(3)} ms (área ${a.area})`);
  // el relleno solo, repetido, sobre un anillo hueco de 100×100
  const owner = new Uint16Array(120 * 120);
  for (let i = 10; i <= 110; i++) for (const [x, y] of [[i, 10], [i, 110], [10, i], [110, i]]) owner[y * 120 + x] = 1;
  const bb = [10, 10, 110, 110];
  assert.equal(enclosed(owner, 120, 1, bb).length, 99 * 99);
  const t1 = performance.now();
  const N = 300;
  for (let i = 0; i < N; i++) enclosed(owner, 120, 1, bb);
  const per = (performance.now() - t1) / N;
  console.log(`  relleno de un anillo de 100×100: ${per.toFixed(3)} ms`);
  assert.ok(per < 3, `demasiado lento: ${per} ms`);
  assert.ok(closing < 15, `el paso que cierra tardó ${closing} ms`);
});

// ---------------------------------------------------------------- bots y determinismo
function simulate(seed, ticks, { nb = 12, size = 120 } = {}) {
  const w = new World(seed, { size, tps: 10 });
  const bots = [];
  const brains = new Map();
  for (let i = 0; i < nb; i++) {
    const p = w.addPlayer({ name: 'b' + i, color: i % 12, bot: true });
    brains.set(p.num, brain(1 + (i % 3), w.rnd));
    bots.push(p.num);
    w.spawn(p.num);
  }
  const stat = { still: 0, moved: 0, why: {}, deaths: 0 };
  for (let t = 0; t < ticks; t++) {
    for (const num of bots) {
      const p = w.players.get(num);
      if (!p.alive) {
        if (w.canSpawn(num)) w.spawn(num);
      } else think(w, p, brains.get(num));
    }
    const before = [...w.players.values()].filter((p) => p.alive).map((p) => [p, p.x, p.y]);
    w.step();
    for (const [p, x, y] of before) if (p.alive) (p.x !== x || p.y !== y ? stat.moved++ : stat.still++);
    for (const d of w.deaths) {
      stat.deaths++;
      stat.why[d.stats.why] = (stat.why[d.stats.why] || 0) + 1;
    }
    w.deaths.length = 0;
  }
  return { w, stat, brains };
}

test('determinismo: misma semilla y mismos bots dan exactamente el mismo mundo; otra semilla, otro', () => {
  const a = simulate(11, 800);
  const b = simulate(11, 800);
  const c = simulate(12, 800);
  assert.equal(a.w.digest(), b.w.digest());
  assert.notEqual(a.w.digest(), c.w.digest());
});

test('bots: nunca se quedan quietos, nunca se suicidan (pared o su estela) y no se escapan del mapa', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { stat, w } = simulate(seed, 2500);
    assert.equal(stat.still, 0, `seed ${seed}: un bot se quedó quieto`);
    assert.equal(stat.why.self || 0, 0, `seed ${seed}: se pisó la estela`);
    assert.equal(stat.why.wall || 0, 0, `seed ${seed}: chocó con la pared`);
    assert.ok(stat.deaths > 0, 'hay combate');
    for (const p of w.players.values()) if (p.alive) assert.ok(p.x >= 0 && p.x < w.size && p.y >= 0 && p.y < w.size);
  }
});

test('bots: expanden territorio (los de nivel 2 y 3 llegan a varias veces el 5×5 inicial)', () => {
  let best = 0;
  let total = 0;
  let n = 0;
  for (const seed of [1, 2, 3]) {
    const { w, brains } = simulate(seed, 3000);
    for (const p of w.players.values()) {
      if (!p.alive || brains.get(p.num).level < 2) continue;
      total += p.area;
      n++;
      best = Math.max(best, p.area);
    }
  }
  assert.ok(best >= 300, `el mejor bot llegó a ${best} celdas`);
  assert.ok(total / n >= 60, `promedio de ${(total / n).toFixed(0)} celdas`);
});

test('bots: atacan estelas ajenas (hay KO entre bots) y el nivel 3 sobrevive más que el 1', () => {
  let kos = 0;
  const survive = { 1: 0, 2: 0, 3: 0 };
  for (const seed of [1, 2, 3, 4]) {
    const { w, stat, brains } = simulate(seed, 4000);
    for (const p of w.players.values()) kos += p.koTotal;
    for (const [num, b] of brains) survive[b.level] += w.players.get(num)?.koTotal || 0;
    assert.ok(stat.deaths > 0);
  }
  assert.ok(kos >= 10, `KO entre bots: ${kos}`);
});

test('CPU: un paso del mundo con 12 bots cuesta mucho menos que el presupuesto (1,5 ms)', () => {
  const { w, brains } = simulate(3, 600);
  const bots = [...w.players.values()];
  const t0 = performance.now();
  const N = 600;
  for (let t = 0; t < N; t++) {
    for (const p of bots) {
      if (!p.alive) w.canSpawn(p.num) && w.spawn(p.num);
      else think(w, p, brains.get(p.num));
    }
    w.step();
    w.deaths.length = 0;
  }
  const per = (performance.now() - t0) / N;
  console.log(`  mundo + 12 bots: ${per.toFixed(3)} ms por paso`);
  assert.ok(per < 1.5, `${per} ms`);
});

// ---------------------------------------------------------------- sincronización
test('rectDiff: lo de a que no está en b', () => {
  const cover = (a, parts) => {
    const set = new Set();
    for (const [x0, y0, x1, y1] of parts) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set.add(`${x},${y}`);
    return set;
  };
  const a = [10, 10, 30, 30];
  for (const b of [[0, 0, 5, 5], [15, 15, 25, 25], [5, 15, 20, 25], [20, 0, 40, 40], [10, 10, 30, 30], [0, 0, 100, 100], [12, 5, 18, 40]]) {
    const got = cover(a, rectDiff(a, b));
    const want = new Set();
    for (let y = a[1]; y <= a[3]; y++) for (let x = a[0]; x <= a[2]; x++) if (!(x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) want.add(`${x},${y}`);
    assert.deepEqual([...got].sort(), [...want].sort(), `b = ${b}`);
  }
});

/** Un mundo con bots y una persona (`me`) que juega con el piloto de los bots, y su Mirror: se aplican todos los mensajes. */
function sync({ ticks = 600, every = 1, seed = 5 } = {}) {
  const w = new World(seed, { size: 120, tps: 10 });
  const bots = [];
  const brains = new Map();
  for (let i = 0; i < 11; i++) {
    const p = w.addPlayer({ name: 'b' + i, color: i % 12, bot: true });
    brains.set(p.num, brain(1 + (i % 3), w.rnd));
    bots.push(p.num);
    w.spawn(p.num);
  }
  const me = w.addPlayer({ id: 'me', name: 'yo', color: 4 });
  me.deadAt = -1e9;
  w.spawn(me.num);
  brains.set(me.num, brain(3, w.rnd));
  bots.push(me.num);
  const viewer = new Viewer(w, me.num);
  const mirror = new Mirror(120);
  const msgs = [];
  let bytes = 0;
  const pending = [];
  let checks = 0;
  for (let t = 0; t < ticks; t++) {
    for (const num of bots) {
      const p = w.players.get(num);
      if (!p.alive) {
        if (w.canSpawn(num)) w.spawn(num);
      } else think(w, p, brains.get(num));
    }
    w.step();
    for (const d of w.deaths) pending.push(d);
    w.deaths.length = 0;
    if (t % every === 0) {
      const m = viewer.build(pending);
      pending.length = 0;
      bytes += JSON.stringify(m).length;
      msgs.push(m);
      mirror.apply(m);
      mirror.applyTerritory(m);
      // dentro de la ventana que el cliente tiene, el espejo coincide con el mundo
      const win = viewer.win;
      for (let y = win[1]; y <= win[3]; y++) for (let x = win[0]; x <= win[2]; x++) {
        const i = y * 120 + x;
        if (mirror.owner[i] !== w.owner[i]) assert.fail(`tick ${w.tick}: celda (${x}, ${y}) = ${mirror.owner[i]} en el espejo y ${w.owner[i]} en el mundo`);
      }
      checks++;
    }
  }
  return { w, me, viewer, mirror, msgs, bytes, checks };
}

test('Viewer → Mirror: el territorio de la ventana queda idéntico (región completa al entrar, diferencias después)', () => {
  const { msgs, checks, mirror, w, me } = sync({ ticks: 700 });
  assert.ok(checks >= 700);
  assert.ok(msgs[0].r && !msgs[0].c, 'el primer mensaje trae la región completa');
  assert.ok(msgs.some((m) => m.c), 'después van diferencias');
  assert.ok(msgs.some((m, i) => i > 0 && m.r), 'al moverse la ventana entran regiones nuevas');
  assert.ok(mirror.bikes.has(me.num) || !me.alive);
  void w;
});

test('Viewer: si se saltean mensajes (backpressure) el siguiente trae todo lo que faltó', () => {
  const { checks } = sync({ ticks: 600, every: 4 });
  assert.ok(checks >= 150);
});

test('Viewer: la estela se manda una vez y después solo esquinas nuevas; el espejo reconstruye la poligonal exacta', () => {
  const w = world(120);
  const me = place(w, 30, 30, Rt);
  const viewer = new Viewer(w, me.num);
  const mirror = new Mirror(120);
  const apply = () => {
    const m = viewer.build([]);
    mirror.apply(m);
    mirror.applyTerritory(m);
    return m;
  };
  me.x = 32;
  apply();
  steps(w, 4); // sale a la derecha
  let m = apply();
  assert.ok(m.h[0][4] & 4, 'la primera vez la estela va completa');
  turn(w, me, D);
  steps(w, 3);
  m = apply();
  assert.equal(m.h[0].length, 5 + 2, 'solo la esquina nueva');
  assert.deepEqual(mirror.bikes.get(me.num).verts, me.verts);
  turn(w, me, L);
  steps(w, 3);
  turn(w, me, U);
  steps(w, 1);
  m = apply();
  assert.deepEqual(mirror.bikes.get(me.num).verts, me.verts);
  // al volver a casa la estela desaparece
  turn(w, me, L);
  steps(w, 2);
  m = apply();
  assert.equal(me.out, false);
  assert.equal(mirror.bikes.get(me.num).verts.length, 0);
});

test('mensajes compactos: bytes por paso para una persona con 11 bots capturando', () => {
  const { bytes, msgs } = sync({ ticks: 1500 });
  const perTick = bytes / msgs.length;
  const kbs = (perTick * 10) / 1024;
  console.log(`  ${perTick.toFixed(0)} B por mensaje, ${kbs.toFixed(2)} KB/s por cliente (máx. de un mensaje: ${Math.max(...msgs.map((m) => JSON.stringify(m).length))} B)`);
  assert.ok(kbs < 15, `${kbs.toFixed(2)} KB/s`);
});

// ---------------------------------------------------------------- servidor real
let srv;
before(async () => {
  srv = await startServer({ MAX_RT_ROOMS: '4' });
});
after(() => srv?.stop());

test('servidor: una persona entra a una arena de Territorio, nace, gira y recibe snapshots con territorio y su ack', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'create', game: 'territorio', name: 'Ana' });
  await wait(400);
  assert.ok(c.last('joined'));
  assert.equal(c.msgs.findIndex((m) => m.t === 'reset') < c.msgs.findIndex((m) => m.t === 'me'), true, 'reset antes que me');
  assert.equal(c.last('room').room.state, 'playing', 'arrancó sola');
  const me = c.last('me');
  assert.equal(me.alive, false);
  assert.equal(me.size, 120);
  assert.equal(me.tps, 10);
  c.send({ t: 'spawn', name: 'Ana', color: 3 });
  await wait(500);
  assert.equal(c.last('me').alive, true);
  const s0 = c.all('s').find((m) => m.o) || c.last('s');
  assert.ok(s0 && s0.o && s0.o[0] === 25, 'recibe snapshots con su área (25 celdas al nacer)');
  assert.equal(s0.h[0][0], me.num, 'la propia va primera');
  assert.ok(c.all('s').some((m) => m.r), 'región de territorio completa');
  // gira: la entrada se aplica y se confirma
  const before = c.all('s').length;
  c.send({ t: 'i', e: [[1, s0.k + 2, (s0.h[0][3] + 1) & 3, 0]] });
  await wait(900);
  const s1 = c.last('s');
  assert.equal(s1.a, 1, 'ack de la entrada');
  assert.ok(c.all('s').length - before >= 7, 'unos 10 snapshots por segundo');
  assert.ok(c.all('s').some((m) => m.mm), 'minimapa');
  // una entrada mal formada no rompe nada
  c.send({ t: 'i', e: [[2, 0, 9, 0]] });
  c.send({ t: 'i', e: 'hola' });
  await wait(250);
  assert.ok(c.last('s').k > s1.k);
  c.ws.close();
});

test('servidor: se encuentra con "list", hay cupo para 10, y /health informa rt', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'territorio', name: 'Uno' });
  await wait(250);
  const code = a.last('joined').code;
  const b = await connect(srv.port);
  b.send({ t: 'list', game: 'territorio' });
  await wait(150);
  const mine = b.last('list').rooms.find((r) => r.code === code);
  assert.ok(mine && mine.state === 'playing' && mine.max === 10 && mine.n === 1);
  b.send({ t: 'join', game: 'territorio', code, name: 'Dos' });
  await wait(300);
  assert.ok(b.last('joined'), 'entra con la partida en curso');
  assert.ok(b.msgs.find((m) => m.t === 'reset'));
  assert.ok(b.last('pl').p.length >= 8, 'hay bots de relleno');
  const h = await fetch(`http://127.0.0.1:${srv.port}/health`).then((r) => r.json());
  assert.ok(h.rt.rooms >= 1 && h.rt.avgTickMs >= 0);
  a.ws.close();
  b.ws.close();
  await wait(100);
});

test('servidor: al reconectar con el token vuelve al mismo jugador y recibe reset y la región completa', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'territorio', name: 'Eli' });
  await wait(250);
  const j = a.last('joined');
  a.send({ t: 'spawn', name: 'Eli', color: 1 });
  await wait(300);
  const num = a.last('me').num;
  a.ws.terminate();
  await wait(300);
  const b = await connect(srv.port);
  b.send({ t: 'join', game: 'territorio', code: j.code, token: j.token, name: 'Eli' });
  await wait(400);
  assert.equal(b.last('joined').id, j.id);
  assert.ok(b.msgs.findIndex((m) => m.t === 'reset') >= 0);
  assert.equal(b.last('me').num, num, 'mismo jugador');
  assert.ok(b.all('s').some((m) => m.r), 'vuelve a recibir el territorio completo');
  b.ws.close();
});

test('servidor: sin errores no controlados', () => {
  assert.doesNotMatch(srv.logs(), /\bfatal\b|^\S+ error /m);
});
