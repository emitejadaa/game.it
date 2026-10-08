/** Caída Libre: reglas del tablero, partido (ataques, basura, KO, anti-trampa), bots, determinismo y partida real contra un servidor. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { W, H, HIDDEN, GARBAGE, CFG, SHAPES, ROTS, Feed, kindAt, spawnOf, newGrid, fits, dropY, supported, rotated, reachable, place, clearLines, addGarbage, isLockOut, heights, profile, gridToString, gridFromString, attackFor, comboBonus, gravityMs, scoreOf, PIECE_COLORS, PIECE_NAMES } from '../public/games/caida/shared/rules.js';
import { choose, brain, nextDelay } from '../public/games/caida/shared/bots.js';
import { Match } from '../public/games/caida/shared/match.js';
import { startServer, connect, wait } from './helpers.mjs';

const row = (g, y, except = []) => {
  for (let x = 0; x < W; x++) g[y * W + x] = except.includes(x) ? 0 : GARBAGE;
};

// ---------------------------------------------------------------- piezas y bolsa
test('piezas: 7 piezas de 4 celdas en las 4 rotaciones, nombres y colores propios, nacen en las filas ocultas', () => {
  assert.equal(SHAPES.length, 8);
  for (let k = 1; k <= 7; k++) {
    for (let r = 0; r < 4; r++) {
      const s = SHAPES[k][r];
      const cells = new Set();
      for (let i = 0; i < 8; i += 2) cells.add(`${s[i]},${s[i + 1]}`);
      assert.equal(cells.size, 4, `pieza ${k} rotación ${r}`);
    }
    const sp = spawnOf(k);
    assert.ok(fits(newGrid(), k, sp.r, sp.x, sp.y), `nace en el tablero vacío (${k})`);
    assert.ok(isLockOut(k, sp.r, sp.y), `y está en las filas ocultas (${k})`);
  }
  assert.equal(new Set(PIECE_COLORS).size, 7);
  assert.deepEqual(PIECE_NAMES.es.length, 7);
  assert.deepEqual(PIECE_NAMES.en.length, 7);
  // formas distintas (sin contar dónde caen en la caja): Riel 2, Bloque 1, Pico 4, Ola 2, Rayo 2, Ancla 4, Gancho 4
  const norm = (s) => {
    const xs = [];
    const ys = [];
    for (let i = 0; i < 8; i += 2) (xs.push(s[i]), ys.push(s[i + 1]));
    const mx = Math.min(...xs);
    const my = Math.min(...ys);
    return xs.map((x, i) => [x - mx, ys[i] - my]).sort().join();
  };
  for (let k = 1; k <= 7; k++) {
    const forms = new Set([0, 1, 2, 3].map((r) => norm(SHAPES[k][r])));
    assert.equal(forms.size, ROTS[k], `formas de la pieza ${k}`);
  }
});

test('bolsa: las piezas salen de a 7 sin repetir, igual para la misma semilla y distinta para otra', () => {
  for (const seed of [1, 7, 12345, 4294967295]) {
    for (let b = 0; b < 6; b++) {
      const bag = Array.from({ length: 7 }, (_, i) => kindAt(seed, b * 7 + i));
      assert.deepEqual([...bag].sort(), [1, 2, 3, 4, 5, 6, 7], `bolsa ${b} de la semilla ${seed}`);
    }
  }
  const a = Array.from({ length: 70 }, (_, i) => kindAt(99, i));
  const b = Array.from({ length: 70 }, (_, i) => kindAt(99, i));
  const c = Array.from({ length: 70 }, (_, i) => kindAt(100, i));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('Feed: la cola avanza, guardar toma la siguiente si no hay nada y se puede una vez por pieza', () => {
  const f = new Feed(42);
  const [p0, p1, p2] = [kindAt(42, 0), kindAt(42, 1), kindAt(42, 2)];
  assert.equal(f.active, p0);
  assert.deepEqual(f.preview(3), [p1, p2, kindAt(42, 3)]);
  assert.equal(f.expected(0), p0);
  assert.equal(f.expected(1), p1, 'si guarda, le toca la siguiente');
  assert.equal(f.hold(), true);
  assert.equal(f.held, p0);
  assert.equal(f.active, p1);
  assert.equal(f.hold(), false, 'una vez por pieza');
  assert.equal(f.expected(1), 0);
  f.next();
  assert.equal(f.active, p2);
  assert.equal(f.expected(1), p0, 'ahora guardar intercambia con la guardada');
  assert.equal(f.hold(), true);
  assert.deepEqual([f.active, f.held], [p0, p2]);
  const g = new Feed(42);
  g.load(f.state());
  assert.deepEqual(g.state(), f.state());
});

// ---------------------------------------------------------------- movimiento, patadas y alcance
test('patadas de pared: el Riel vertical gira pegado a la pared y sobre el piso; si no hay lugar, no gira', () => {
  const g = newGrid();
  // Riel vertical pegado a la pared izquierda: la caja se sale por la izquierda, tiene que patear
  const v = { kind: 1, r: 1, x: -2, y: 10 };
  assert.ok(fits(g, v.kind, v.r, v.x, v.y));
  const h = rotated(g, v, 1);
  assert.ok(h && fits(g, h.kind, h.r, h.x, h.y), 'gira con patada');
  assert.equal(h.r, 2);
  // apoyado en el piso: sube para poder girar
  const flat = { kind: 1, r: 0, x: 3, y: H - 2 };
  const up = rotated(g, flat, 1);
  assert.ok(up && fits(g, up.kind, up.r, up.x, up.y));
  // encerrado: no hay patada que valga
  const box = newGrid();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) box[y * W + x] = 1;
  for (const [x, y] of [[3, 10], [4, 10], [5, 10], [6, 10]]) box[y * W + x] = 0;
  assert.equal(rotated(box, { kind: 1, r: 0, x: 3, y: 9 }, 1), null);
  // el Bloque no cambia al girar
  assert.equal(rotated(g, { kind: 2, r: 0, x: 4, y: 5 }, 1), null);
  // ida y vuelta: 4 giros horarios dejan la pieza como estaba (en campo abierto)
  let p = { kind: 3, r: 0, x: 3, y: 8 };
  for (let i = 0; i < 4; i++) p = rotated(g, p, 1);
  assert.deepEqual(p, { kind: 3, r: 0, x: 3, y: 8 });
});

test('alcance: se llega a donde se cae, a un hueco lateral por deslizamiento, pero no a un hueco tapado', () => {
  const g = newGrid();
  // piso con un hueco en la columna 0 y un techo que lo tapa
  for (let x = 1; x < W; x++) g[(H - 1) * W + x] = 1;
  const k = 6;
  const y = dropY(g, k, 0, 3, 0);
  assert.ok(reachable(g, k, 0, 3, y), 'caída en el medio');
  assert.ok(supported(g, k, 0, 3, y));
  // túnel: una pared a la izquierda deja entrar de costado a ras del piso
  const t = newGrid();
  for (let x = 0; x < W; x++) t[(H - 1) * W + x] = 1;
  for (let x = 0; x < 9; x++) t[(H - 2) * W + x] = 1; // una fila entera salvo la columna 9
  const yy = dropY(t, 1, 0, 6, 0);
  assert.ok(reachable(t, 1, 0, 6, yy), 'cae sobre la fila');
  // hueco tapado: celdas libres bajo un techo sin entrada
  const c = newGrid();
  for (let x = 0; x < W; x++) c[10 * W + x] = 1; // techo completo
  assert.equal(reachable(c, 2, 0, 4, 20), false, 'no se teletransporta bajo el techo');
  assert.equal(supported(c, 2, 0, 4, 20), true, 'estaría apoyada en el piso, pero no pudo llegar');
  // el tablero lleno en el lugar donde nace: no hay pieza que mover
  const f = newGrid();
  f.fill(1, 0, W * 3);
  assert.equal(reachable(f, 3, 0, 3, 10), false);
});

// ---------------------------------------------------------------- líneas, basura y ataques
test('líneas: se limpian las llenas (juntas o separadas), se avisan sus filas y lo de arriba baja', () => {
  const g = newGrid();
  row(g, 21);
  row(g, 20, [3]);
  row(g, 19);
  g[18 * W + 2] = 5;
  const rows = [];
  assert.equal(clearLines(g, rows), 2);
  assert.deepEqual(rows.sort((a, b) => b - a), [21, 19]);
  assert.equal(g[20 * W + 2], 5, 'la celda suelta bajó dos filas');
  assert.equal(g[21 * W + 3], 0, 'la fila con hueco bajó una');
  assert.equal(g[21 * W + 0], GARBAGE);
  assert.equal(clearLines(newGrid()), 0);
});

test('ataques: 2 líneas = 1, 3 = 2, 4 = 4 y la racha suma de +1 a +3', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => attackFor(n, 0)), [0, 1, 2, 4]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(comboBonus), [0, 1, 1, 2, 2, 3, 3]);
  assert.equal(attackFor(1, 1), 1, 'una línea en racha ya cuenta');
  assert.equal(attackFor(4, 6), 7);
  assert.equal(attackFor(0, 5), 0);
  assert.equal(scoreOf(10, 5, 2), 10 * 10 + 5 * 20 + 2 * 100);
});

test('basura: sube el tablero, deja un único hueco por ataque y avisa si algo se sale por el techo', () => {
  const g = newGrid();
  g[(H - 1) * W + 4] = 3;
  assert.equal(addGarbage(g, 2, 7), false);
  assert.equal(g[(H - 3) * W + 4], 3, 'lo que había subió dos filas');
  for (const y of [H - 2, H - 1]) {
    assert.equal(g[y * W + 7], 0, 'hueco');
    assert.equal([...g.slice(y * W, y * W + W)].filter((v) => v === GARBAGE).length, 9);
  }
  const full = newGrid();
  full[0] = 2; // una celda en la fila de más arriba
  assert.equal(addGarbage(full, 1, 0), true, 'se sale por el techo');
  assert.equal(profile(g).length, 10);
  assert.deepEqual(heights(g).slice(0, 2), [2, 2]);
  const s = gridToString(g);
  assert.equal(s.length, W * H);
  assert.deepEqual([...gridFromString(s)], [...g]);
  assert.equal(gridFromString('x'), null);
  assert.equal(gridFromString('9'.repeat(W * H)), null, 'valor fuera de rango');
});

test('gravedad: arranca lenta y sube con el tiempo de partida hasta 20 filas por segundo', () => {
  assert.equal(gravityMs(0), 900);
  let prev = Infinity;
  for (let s = 0; s <= 900; s += 12) {
    const g = gravityMs(s);
    assert.ok(g <= prev && g >= 50);
    prev = g;
  }
  assert.equal(gravityMs(10000), 50);
  assert.ok(gravityMs(60) < gravityMs(0) * 0.8);
  assert.equal(CFG.lockMs, 500);
  assert.equal(CFG.garbageDelayMs, 1000);
});

// ---------------------------------------------------------------- partido
/** Partido con mensajes capturados por jugador. */
function setup(opts = {}) {
  const log = new Map(); // num → mensajes
  const all = [];
  const kicked = [];
  const push = (num, m) => {
    if (!log.has(num)) log.set(num, []);
    log.get(num).push(m);
  };
  const m = new Match({ seed: 7, bots: false, tide: false, ...opts, out: undefined });
  m.out = {
    to: (num, msg) => push(num, msg),
    all: (msg) => {
      all.push(msg);
      for (const p of m.players.values()) if (!p.bot) push(p.num, msg);
    },
    soft: (msg) => m.out.all(msg),
    kick: (num) => kicked.push(num),
  };
  const last = (num, t) => [...(log.get(num) || [])].reverse().find((x) => x.t === t);
  const of = (num, t) => (log.get(num) || []).filter((x) => x.t === t);
  return { m, log, all, kicked, last, of };
}

/** Una persona simulada: lleva su propio tablero y cola como lo haría el cliente y arma los `lk` con el bot de nivel 3. */
class Pilot {
  constructor(m, num) {
    Object.assign(this, { m, num, n: 0, a: 0 });
    this.reset();
  }
  reset() {
    const p = this.m.players.get(this.num);
    this.grid = p.grid.slice();
    this.feed = new Feed(this.m.seed);
    this.feed.load(p.feed.state());
  }
  /** El `lk` de la mejor jugada, sin mandarlo. */
  plan(rnd = () => 0.5) {
    const c = choose(this.grid, this.feed, brain(3), rnd, false);
    return { t: 'lk', n: this.n, p: c.kind, r: c.r, x: c.x, y: c.y, h: c.hold ? 1 : 0, a: this.a };
  }
  /** Lo aplica en el tablero local como el cliente (después de mandarlo). */
  apply(msg) {
    if (msg.h) this.feed.hold();
    place(this.grid, msg.p, msg.r, msg.x, msg.y);
    clearLines(this.grid);
    this.feed.next();
    this.n++;
  }
  /** Aplica la basura de un `ak`. */
  garbage(ak) {
    for (const g of ak.add || []) {
      addGarbage(this.grid, g.rows, g.hole);
      this.a += g.rows;
    }
  }
}

function twoHumans(opts) {
  const s = setup(opts);
  const a = s.m.addPlayer({ id: 'a', name: 'Ana' });
  const b = s.m.addPlayer({ id: 'b', name: 'Beto' });
  s.m.newRound(0);
  s.m.step(3000); // arranca
  assert.equal(s.m.phase, 'play');
  return { ...s, a, b, pa: new Pilot(s.m, a.num), pb: new Pilot(s.m, b.num) };
}

test('fijar: el servidor reaplica el fijado, avanza la cola y contesta con ak', () => {
  const { m, a, last, pa } = twoHumans();
  const msg = pa.plan();
  assert.equal(msg.p, kindAt(m.seed, 0), 'la primera pieza es la primera de la bolsa');
  assert.equal(m.lock(a.num, msg, 3100), true);
  const ak = last(a.num, 'ak');
  assert.ok(ak && ak.n === 0 && ak.clr === 0 && ak.sent === 0);
  assert.equal(a.locks, 1);
  assert.equal(a.pieces, 1);
  assert.equal(a.feed.active, kindAt(m.seed, 1));
  pa.apply(msg);
  assert.deepEqual([...a.grid], [...pa.grid], 'el tablero del servidor es igual al del cliente');
  // dos fijados seguidos más, con guardar de por medio
  for (let i = 0; i < 6; i++) {
    const nx = pa.plan();
    assert.equal(m.lock(a.num, nx, 3200 + i * 200), true);
    pa.apply(nx);
  }
  assert.deepEqual([...a.grid], [...pa.grid]);
  assert.equal(last(a.num, 'bd'), undefined, 'ninguna resincronización');
});

test('4 líneas: ataque de 4, el rival la recibe como pendiente y entra recién un segundo después, en su siguiente fijado', () => {
  const { m, a, b, last, all, pa, pb } = twoHumans();
  for (let y = 18; y < 22; y++) row(a.grid, y, [9]);
  a.feed.active = 1; // Riel en la mano
  pa.grid = a.grid.slice();
  pa.feed.load(a.feed.state());
  const msg = { t: 'lk', n: 0, p: 1, r: 1, x: 7, y: 18, h: 0, a: 0 };
  assert.equal(m.lock(a.num, msg, 4000), true);
  const ak = last(a.num, 'ak');
  assert.equal(ak.clr, 4);
  assert.equal(ak.sent, 4);
  assert.deepEqual(all.filter((x) => x.t === 'at'), [{ t: 'at', f: a.num, to: b.num, n: 4 }]);
  assert.equal(last(b.num, 'pg').n, 4);
  assert.equal(m.pendRows(b), 4);
  // b fija a los 500 ms del ataque: todavía no entra
  let nx = pb.plan();
  m.lock(b.num, nx, 4500);
  assert.equal(last(b.num, 'ak').add, undefined, 'falta para el segundo');
  pb.apply(nx);
  // a los 1100 ms entra, con un solo hueco
  nx = pb.plan();
  m.lock(b.num, nx, 5100);
  const akb = last(b.num, 'ak');
  assert.equal(akb.add.length, 1);
  assert.equal(akb.add[0].rows, 4);
  assert.ok(akb.add[0].hole >= 0 && akb.add[0].hole < W);
  assert.equal(m.pendRows(b), 0);
  // el servidor todavía no la sumó a su tablero (b no confirmó con `a`): sigue como el del cliente antes de recibirla
  pb.apply(nx);
  assert.deepEqual([...b.grid], [...pb.grid]);
  pb.garbage(akb);
  // y el siguiente fijado de b declara que ya la aplicó: el servidor suma la basura antes de validar
  nx = pb.plan();
  assert.equal(nx.a, 4);
  assert.equal(m.lock(b.num, nx, 5400), true);
  assert.equal(last(b.num, 'bd'), undefined);
  pb.apply(nx);
  assert.deepEqual([...b.grid], [...pb.grid], 'ambos aplicaron las mismas cosas en el mismo orden');
});

test('si el cliente fija otra pieza antes de recibir el ak con basura, el servidor lo acepta igual (mismo orden que el cliente)', () => {
  const { m, a, b, last, pa, pb } = twoHumans();
  b.pending.push({ rows: 3, hole: 5, at: 0 });
  // b fija (sin líneas): la basura entra y viaja en el ak
  let nx = pb.plan();
  m.lock(b.num, nx, 4000);
  const ak = last(b.num, 'ak');
  assert.equal(ak.add[0].rows, 3);
  pb.apply(nx);
  // …pero el cliente fija la siguiente antes de que le llegue (a todavía = 0)
  nx = pb.plan();
  assert.equal(nx.a, 0);
  assert.equal(m.lock(b.num, nx, 4100), true);
  assert.equal(last(b.num, 'bd'), undefined);
  pb.apply(nx);
  // recién ahora llega el ak: lo aplica, y confirma en el fijado que sigue
  pb.garbage(ak);
  nx = pb.plan();
  assert.equal(nx.a, 3);
  assert.equal(m.lock(b.num, nx, 4300), true);
  assert.equal(last(b.num, 'bd'), undefined);
  pb.apply(nx);
  assert.deepEqual([...b.grid], [...pb.grid]);
  void a;
});

test('cancelar: las líneas propias descuentan la basura que viene, y lo que sobra se manda', () => {
  const { m, a, b, last, pa } = twoHumans();
  a.pending.push({ rows: 3, hole: 0, at: 99999 });
  for (let y = 18; y < 22; y++) row(a.grid, y, [9]);
  a.feed.active = 1;
  const msg = { t: 'lk', n: 0, p: 1, r: 1, x: 7, y: 18, h: 0, a: 0 };
  m.lock(a.num, msg, 4000);
  const ak = last(a.num, 'ak');
  assert.equal(ak.clr, 4);
  assert.equal(ak.cx, 3, 'canceló las 3 que venían');
  assert.equal(ak.sent, 1, 'y le queda 1 para mandar');
  assert.equal(m.pendRows(a), 0);
  assert.equal(m.pendRows(b), 1);
});

test('racha: fijar con líneas seguido suma al ataque y se corta al fijar sin líneas', () => {
  const { m, a, last } = twoHumans();
  const clear2 = (n, t, ak0) => {
    for (let y = 20; y < 22; y++) row(a.grid, y, [4, 5]);
    a.feed.active = 2; // Bloque en las columnas 4-5, filas 20-21
    const msg = { t: 'lk', n, p: 2, r: 0, x: 4, y: 20, h: 0, a: 0 };
    assert.equal(m.lock(a.num, msg, t), true);
    return last(a.num, 'ak');
  };
  assert.equal(clear2(0, 4000).sent, 1, '2 líneas = 1');
  assert.equal(clear2(1, 4300).sent, 2, '2 líneas + racha +1');
  assert.equal(a.combo, 1);
  a.feed.active = 2;
  assert.equal(m.lock(a.num, { t: 'lk', n: 2, p: 2, r: 0, x: 4, y: 20, h: 0, a: 0 }, 4700), true);
  assert.equal(a.combo, -1, 'sin líneas se corta');
});

test('KO: la pila que se sale por el techo elimina, da puesto y el último vivo gana; después arranca otra ronda', () => {
  const s = twoHumans({ overMs: 5000 });
  const { m, a, b, all, last } = s;
  // a ya tiene casi todo el tablero lleno hasta el techo: la próxima basura lo saca
  for (let y = 2; y < H; y++) row(a.grid, y, [0]);
  a.pending.push({ rows: 2, hole: 1, at: 0 });
  a.feed.active = 3;
  // fija una pieza a la derecha sin líneas (la columna 0 queda libre): entra la basura y la pila se pasa
  const y = dropY(a.grid, 3, 0, 4, 0);
  assert.ok(supported(a.grid, 3, 0, 4, y));
  m.lock(a.num, { t: 'lk', n: 0, p: 3, r: 0, x: 4, y, h: 0, a: 0 }, 4000);
  assert.equal(a.alive, false);
  const dead = last(a.num, 'dead');
  assert.equal(dead.rank, 2, 'segundo puesto de 2');
  assert.equal(dead.of, 2);
  assert.ok(all.some((x) => x.t === 'ko' && x.n === a.num && x.r === 2 && x.left === 1));
  const end = all.find((x) => x.t === 'end');
  assert.ok(end, 'quedó uno solo: termina la ronda');
  assert.equal(end.win, b.num);
  assert.deepEqual(end.res.map((r) => r[0]), [b.num, a.num]);
  assert.equal(m.phase, 'over');
  // a la ronda siguiente
  m.step(4000 + 4999);
  assert.equal(m.phase, 'over');
  m.step(4000 + 5000);
  assert.equal(m.phase, 'count');
  assert.equal(m.round, 2);
  assert.ok(a.alive && b.alive);
  assert.ok(all.filter((x) => x.t === 'rs').length === 2);
  assert.notEqual(all.filter((x) => x.t === 'rs')[0].seed, all.filter((x) => x.t === 'rs')[1].seed, 'otra bolsa');
});

test('el KO se acredita a quien te atacó hace poco', () => {
  const { m, a, b, last } = twoHumans();
  for (let y = 18; y < 22; y++) row(a.grid, y, [9]);
  a.feed.active = 1;
  m.lock(a.num, { t: 'lk', n: 0, p: 1, r: 1, x: 7, y: 18, h: 0, a: 0 }, 4000); // a ataca a b
  assert.equal(b.lastAtt, a.num);
  for (let y = 2; y < H; y++) row(b.grid, y, [0]);
  b.feed.active = 3;
  const y = dropY(b.grid, 3, 0, 4, 0);
  m.lock(b.num, { t: 'lk', n: 0, p: 3, r: 0, x: 4, y, h: 0, a: 0 }, 5200);
  assert.equal(b.alive, false);
  assert.equal(a.kos, 1);
  assert.equal(last(b.num, 'dead').by, a.num);
});

test('objetivo: al azar, a quien te ataca, al más débil (pila más alta) o al líder', () => {
  const s = setup();
  const [p, q, r, u] = ['p', 'q', 'r', 'u'].map((id) => s.m.addPlayer({ id, name: id }));
  s.m.newRound(0);
  s.m.step(3000);
  r.grid.fill(1, 6 * W); // pila alta
  q.sent = 30; // el líder
  assert.equal(s.m.setTarget(p.num, 'weakest'), true);
  assert.equal(s.m.pickTarget(p, 3100), r);
  s.m.setTarget(p.num, 'leader');
  assert.equal(s.m.pickTarget(p, 3100), q);
  s.m.setTarget(p.num, 'attackers');
  u.lastAtt = 0;
  p.lastAtt = u.num;
  p.lastAttAt = 3000;
  assert.equal(s.m.pickTarget(p, 3100), u, 'quien lo atacó hace poco');
  assert.equal(s.m.pickTarget(p, 3000 + CFG.koWindowMs + 1) !== null, true, 'si fue hace mucho, al azar');
  s.m.setTarget(p.num, 'random');
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(s.m.pickTarget(p, 3100).num);
  assert.ok(seen.size >= 2 && !seen.has(p.num));
  assert.equal(s.m.setTarget(p.num, 'nadie'), false, 'modo inválido = mal formado');
});

test('marea: después de un rato todos reciben basura que no se cancela y que entra aunque haya líneas', () => {
  const { m, a, b, last } = twoHumans({ tide: true, tideStartMs: 10000, tideEveryMs: 4000, tideMinMs: 1000 });
  m.step(3000 + 10000);
  assert.equal(m.pendRows(a), 1);
  assert.equal(m.pendRows(b), 1);
  assert.ok(a.pending[0].hard);
  for (let y = 18; y < 22; y++) row(a.grid, y, [9]);
  a.feed.active = 1;
  m.lock(a.num, { t: 'lk', n: 0, p: 1, r: 1, x: 7, y: 18, h: 0, a: 0 }, 13500);
  const ak = last(a.num, 'ak');
  assert.equal(ak.clr, 4);
  assert.equal(ak.cx, undefined, 'la marea no se cancela');
  assert.equal(ak.sent, 4);
  assert.equal(ak.add?.[0]?.rows, 1, 'y entra aunque hubo líneas');
  assert.ok(m.tideAt > 13000);
});

// ---------------------------------------------------------------- anti-trampa
test('anti-trampa: pieza flotando, pieza que no es la que toca, posición inalcanzable y guardar de más → resincroniza con bd', () => {
  const { m, a, last, of, pa } = twoHumans();
  const good = pa.plan();
  // 1. flotando
  assert.equal(m.lock(a.num, { ...good, y: 5 }, 3100), true);
  let bd = last(a.num, 'bd');
  assert.ok(bd && bd.why === 'pos');
  assert.equal(bd.n, 0);
  assert.equal(bd.grid.length, W * H);
  assert.equal(bd.cur, kindAt(m.seed, 0));
  assert.equal(a.locks, 0, 'no avanzó nada');
  // 2. pieza equivocada (no es la 1ª de la bolsa)
  const wrong = (good.p % 7) + 1;
  assert.equal(m.lock(a.num, { ...good, n: 0, p: wrong, r: 0, x: 3, y: H - 2 }, 5000), true);
  assert.equal(last(a.num, 'bd').why, 'piece');
  // 3. hueco inalcanzable: un techo tapa el piso
  for (let x = 0; x < W; x++) a.grid[10 * W + x] = 1;
  const kind = a.feed.active;
  const under = dropY(a.grid, kind, 0, 4, 10) > 10 ? 10 : 11; // por debajo del techo (fila 10)
  const y = dropY(a.grid, kind, 0, 4, under + 1);
  assert.equal(supported(a.grid, kind, 0, 4, y), true);
  assert.equal(m.lock(a.num, { t: 'lk', n: 0, p: kind, r: 0, x: 4, y, h: 0, a: 0 }, 7000), true);
  assert.equal(last(a.num, 'bd').why, 'pos', 'apoyada pero imposible de alcanzar');
  assert.equal(of(a.num, 'bd').length, 3);
});

test('anti-trampa: un fijado repetido (replay) o salteado se rechaza; lo que venía en camino de un rechazo no suma faltas', () => {
  const { m, a, last, of, pa } = twoHumans();
  const first = pa.plan();
  assert.equal(m.lock(a.num, first, 3100), true);
  assert.equal(of(a.num, 'bd').length, 0);
  pa.apply(first);
  // el mismo mensaje otra vez
  assert.equal(m.lock(a.num, first, 3600), true);
  assert.equal(last(a.num, 'bd').why, 'replay');
  assert.equal(a.locks, 1, 'no se aplicó dos veces');
  assert.equal(a.strikes.length, 1);
  // n salteado, mucho después del bd
  assert.equal(m.lock(a.num, { ...pa.plan(), n: 5 }, 6000), true);
  assert.equal(last(a.num, 'bd').why, 'seq');
  // un fijado en camino (n+1) justo después de un bd no cuenta como falta
  const strikes = a.strikes.length;
  assert.equal(m.lock(a.num, { ...pa.plan(), n: 6 }, 6300), true);
  assert.equal(a.strikes.length, strikes);
  // y tras el bd el cliente puede seguir normalmente con el n del servidor
  const ok = pa.plan();
  assert.equal(ok.n, 1);
  assert.equal(m.lock(a.num, ok, 6500), true);
  assert.equal(a.locks, 2);
});

test('anti-trampa: 4 faltas en un minuto = fuera (banned, KO y kick)', () => {
  const { m, a, last, all, kicked, pa } = twoHumans();
  for (let i = 0; i < 4; i++) m.lock(a.num, { ...pa.plan(), y: 3 }, 4000 + i * 2000);
  assert.ok(last(a.num, 'banned'));
  assert.deepEqual(kicked, [a.num]);
  assert.equal(a.alive, false);
  assert.equal(a.cause, 'cheat');
  assert.ok(all.some((x) => x.t === 'ko' && x.n === a.num));
  // faltas espaciadas más de un minuto no suman
  const t = twoHumans();
  for (let i = 0; i < 6; i++) t.m.lock(t.a.num, { ...t.pa.plan(), y: 3 }, 4000 + i * 61000);
  assert.equal(t.a.alive, true);
});

test('anti-trampa: mensajes mal formados devuelven false y el ritmo de fijados tiene tope', () => {
  const { m, a, b, last, pa } = twoHumans();
  for (const bad of [null, {}, { n: 'x' }, { ...pa.plan(), p: 9 }, { ...pa.plan(), r: 7 }, { ...pa.plan(), h: 2 }, { ...pa.plan(), x: 1.5 }, { ...pa.plan(), a: -1 }, { ...pa.plan(), n: -1 }]) {
    assert.equal(m.lock(a.num, bad, 3100), false, JSON.stringify(bad));
  }
  assert.equal(m.lock(999, pa.plan(), 3100), undefined, 'jugador que no existe');
  // ráfaga de 40 fijados en el mismo instante: pasan los primeros y el resto se descarta sin romper nada
  let accepted = 0;
  for (let i = 0; i < 40; i++) {
    const nx = pa.plan();
    m.lock(a.num, nx, 5000);
    if (a.locks > accepted) {
      accepted = a.locks;
      pa.apply(nx);
    }
  }
  assert.ok(accepted <= 9, `aceptó ${accepted}`);
  assert.ok(a.strikes.length >= 1);
  void b;
  void last;
});

test('anti-trampa: no se puede guardar dos veces en la misma pieza', () => {
  const { m, a, last } = twoHumans();
  const f = new Feed(m.seed);
  f.hold(); // guardó una vez
  const k = f.active; // la pieza que tiene ahora
  const y = dropY(a.grid, k, 0, 3, spawnOf(k).y);
  // el cliente dice h=1 pero ya había guardado en esta pieza: el servidor solo lo sabe si el estado coincide, así que se prueba el segundo guardar
  a.feed.hold();
  assert.equal(m.lock(a.num, { t: 'lk', n: 0, p: k, r: 0, x: 3, y, h: 1, a: 0 }, 4000), true);
  assert.equal(last(a.num, 'bd').why, 'hold');
});

// ---------------------------------------------------------------- bots, espectadores y reconexión
test('bots: cada nivel juega a su ritmo (0,8 / 1,4 / 2,2 piezas por segundo) y nunca se queda quieto', () => {
  const rates = [];
  for (const level of [1, 2, 3]) {
    const s = setup({ crowd: 1 });
    s.m.newRound(0);
    const b = s.m.addPlayer({ name: 'bot', bot: true, level }); // entra a la cuenta regresiva: juega la ronda
    let t = 0;
    s.m.step((t = 3000));
    const n0 = b.pieces;
    for (; t < 3000 + 30000; t += 50) s.m.step(t);
    rates.push((b.pieces - n0) / 30);
    assert.ok(b.alive || b.pieces > 0);
  }
  assert.ok(rates[0] > 0.55 && rates[0] < 1.1, `nivel 1: ${rates[0]}`);
  assert.ok(rates[1] > 1.1 && rates[1] < 1.8, `nivel 2: ${rates[1]}`);
  assert.ok(rates[2] > 1.8 && rates[2] < 2.7, `nivel 3: ${rates[2]}`);
  assert.ok(nextDelay(brain(3), () => 0.5) > 400);
});

test('bots: no se matan solos si hay una jugada segura (tableros al azar con la pila alta)', () => {
  let seeds = 0;
  for (let seed = 1; seed <= 60; seed++) {
    let a = seed * 2654435761;
    const rnd = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
    const g = newGrid();
    const top = 4 + Math.floor(rnd() * 14); // alturas hasta 18
    for (let x = 0; x < W; x++) {
      const h = Math.max(0, top + Math.floor(rnd() * 5) - 2);
      for (let y = H - h; y < H; y++) g[y * W + x] = rnd() < 0.9 ? 8 : 0;
    }
    const feed = new Feed(seed);
    for (const level of [1, 2, 3]) {
      const c = choose(g, feed, brain(level), rnd, false);
      if (!c) continue;
      // ¿existe alguna jugada que no pierda? (probando todas las posiciones de la pieza)
      let safeExists = false;
      for (let r = 0; r < ROTS[feed.active] && !safeExists; r++)
        for (let x = -2; x < W && !safeExists; x++) {
          const y0 = 0;
          if (!fits(g, feed.active, r, x, y0)) continue;
          const y = dropY(g, feed.active, r, x, y0);
          if (!isLockOut(feed.active, r, y)) safeExists = true;
        }
      if (safeExists) assert.equal(isLockOut(c.kind, c.r, c.y), false, `semilla ${seed} nivel ${level}`);
      assert.ok(supported(g, c.kind, c.r, c.x, c.y), 'la jugada elegida es legal y apoyada');
    }
    seeds++;
  }
  assert.equal(seeds, 60);
});

test('bots: solos, los de nivel 2 y 3 aguantan 5 minutos sin perder (juegan bien) y el 1 limpia líneas un buen rato', () => {
  for (const level of [1, 2, 3]) {
    const s = setup({ crowd: 1 });
    s.m.newRound(0);
    const b = s.m.addPlayer({ name: 'bot', bot: true, level });
    let t = 3000;
    for (; t < 3000 + 300000 && s.m.phase !== 'over'; t += 50) s.m.step(t);
    if (level >= 2) assert.equal(b.alive, true, `nivel ${level} perdió a los ${(t - 3000) / 1000} s`);
    assert.ok(b.lines > (level === 1 ? 20 : 100), `nivel ${level}: ${b.lines} líneas`);
  }
});

test('partido de bots: termina con un ganador, la marea corta los empates y cuesta poco CPU', () => {
  const s = setup({ crowd: 12, bots: true, tide: true, afkMs: 1e9 });
  const h = s.m.addPlayer({ id: 'h', name: 'Ana' });
  s.m.newRound(0);
  s.m.setAuto(h.num, true);
  let t = 0;
  const t0 = performance.now();
  let steps = 0;
  for (; t < 900000 && s.m.phase !== 'over'; t += 50, steps++) s.m.step(t);
  const per = (performance.now() - t0) / steps;
  assert.equal(s.m.phase, 'over', 'terminó en menos de 15 minutos');
  assert.ok(t < 600000, `duró ${t / 1000} s`);
  const end = s.all.find((x) => x.t === 'end');
  assert.ok(end && end.win > 0);
  assert.equal(end.res[0][1], 1);
  assert.deepEqual(end.res.map((r) => r[1]), end.res.map((_, i) => i + 1), 'puestos 1..N sin repetir');
  assert.ok(per < 1.5, `${per.toFixed(3)} ms por paso de 50 ms`);
});

test('determinismo: misma semilla y mismas entradas dan el mismo partido; otra semilla, otro', () => {
  const run = (seed) => {
    const events = [];
    const m = new Match({ seed, crowd: 10, bots: true, afkMs: 1e9, out: { to() {}, all: (x) => x.t === 'ko' && events.push([x.n, x.by, x.r]), soft() {}, kick() {} } });
    const h = m.addPlayer({ id: 'h', name: 'Ana' });
    m.newRound(0);
    m.setAuto(h.num, true);
    for (let t = 0; t < 120000; t += 50) m.step(t);
    return JSON.stringify([m.seed, events, [...m.players.values()].map((p) => [p.name, p.lines, p.sent, p.kos, p.alive, gridToString(p.grid)])]);
  };
  assert.equal(run(11), run(11));
  assert.notEqual(run(11), run(12));
});

test('desconexión: un bot juega por la persona y al volver recibe el estado real (bd) para seguir', () => {
  const { m, a, last, pa } = twoHumans();
  const first = pa.plan();
  m.lock(a.num, first, 3100);
  pa.apply(first);
  m.setAuto(a.num, true);
  const before = a.pieces;
  for (let t = 3200; t < 8000; t += 50) m.step(t);
  assert.ok(a.pieces > before + 2, 'el bot fijó piezas');
  assert.equal(m.lock(a.num, pa.plan(), 8100), true, 'mientras está en automático no se aceptan fijados');
  assert.equal(a.pieces > before + 2, true);
  m.setAuto(a.num, false);
  const msgs = m.joinMessages(a.num);
  assert.deepEqual(msgs.map((x) => x.t), ['reset', 'pl', 'me', 'lb', 'bd']);
  const bd = msgs.at(-1);
  assert.equal(bd.n, a.locks);
  assert.equal(bd.grid, gridToString(a.grid));
  // el cliente se resincroniza con bd y sigue con el n correcto
  pa.grid = gridFromString(bd.grid);
  pa.feed.load(bd);
  pa.n = bd.n;
  pa.a = bd.a;
  const nx = pa.plan();
  assert.equal(m.lock(a.num, nx, 8200), true);
  assert.equal(a.locks, bd.n + 1);
  void last;
});

test('espectadores: quien entra con la ronda en marcha mira, el eliminado recibe el tablero que sigue y se arma de nuevo en la ronda que viene', () => {
  const { m, a, b, last } = twoHumans({ crowd: 3, bots: true });
  const late = m.addPlayer({ id: 'c', name: 'Cata' });
  assert.equal(late.play, false);
  assert.equal(late.alive, false);
  const join = m.joinMessages(late.num);
  assert.equal(join.find((x) => x.t === 'me').play, false);
  assert.equal(join.find((x) => x.t === 'bd'), undefined, 'espectador: no hay tablero propio que resincronizar');
  m.step(3500);
  m.step(4000);
  const wg = last(late.num, 'wg');
  assert.ok(wg && wg.g.length === W * H, 'recibe el tablero de alguien vivo');
  assert.ok(m.players.get(wg.n).alive);
  assert.equal(m.watch(late.num, b.num), true);
  m.step(4300);
  assert.equal(last(late.num, 'wg').n, b.num);
  // sus fijados se ignoran sin sumar faltas
  assert.equal(m.lock(late.num, { t: 'lk', n: 0, p: 1, r: 0, x: 0, y: 0, h: 0, a: 0 }, 4400), true);
  assert.equal(late.strikes.length, 0);
  void a;
});

test('afk: quien no fija nada en 30 s queda eliminado', () => {
  const { m, a, b, last } = twoHumans({ afkMs: 30000 });
  const nx = new Pilot(m, b.num);
  for (let t = 3000; t <= 3000 + 31000; t += 500) {
    m.step(t);
    if (t % 5000 === 0 && b.alive) {
      const mv = nx.plan();
      m.lock(b.num, mv, t);
      nx.apply(mv);
    }
  }
  assert.equal(a.alive, false);
  assert.equal(a.cause, 'afk');
  assert.equal(last(a.num, 'dead').cause, 'afk');
});

test('resúmenes: 2 por segundo, perfil de 10 caracteres y basura pendiente; ranking con vivos y eliminados', () => {
  const { m, a, b, all } = twoHumans();
  a.grid[(H - 1) * W + 3] = 1;
  b.pending.push({ rows: 2, hole: 0, at: 99999 });
  m.step(3500);
  m.step(4000);
  const sm = all.filter((x) => x.t === 'sm');
  assert.ok(sm.length >= 1);
  const row = sm.at(-1).p.find((r) => r[0] === a.num);
  assert.equal(row[1].length, 10);
  assert.equal(row[1].charCodeAt(3) - 48, 1);
  assert.equal(sm.at(-1).p.find((r) => r[0] === b.num)[2], 2);
  const lb = m.leaderboard(5);
  assert.equal(lb.length, 2);
  assert.ok(lb.every((r) => r[3] === 0));
});

test('salirse en plena ronda elimina y cuenta el puesto; no queda nada colgado', () => {
  const s = setup({ crowd: 3, bots: false });
  const [a, b, c] = ['a', 'b', 'c'].map((id) => s.m.addPlayer({ id, name: id }));
  s.m.newRound(0);
  s.m.step(3000);
  s.m.leave(a.num, 4000);
  assert.equal(s.m.aliveCount, 2);
  assert.equal(s.m.players.has(a.num), false);
  s.m.leave(b.num, 4500);
  assert.equal(s.m.phase, 'over', 'quedó uno: gana');
  assert.equal(s.all.find((x) => x.t === 'end').win, c.num);
});

// ---------------------------------------------------------------- servidor real
let srv;
before(async () => {
  srv = await startServer({ MAX_RT_ROOMS: '4' });
});
after(() => srv?.stop());

/** Cliente de prueba que juega como lo haría el navegador (bot de nivel 3 sobre su propio tablero). */
class NetPlayer {
  constructor(c) {
    this.c = c;
    this.handled = 0;
    this.n = 0;
    this.a = 0;
    this.grid = newGrid();
    this.feed = null;
  }
  /** Procesa lo que llegó desde la última vez. */
  pump() {
    for (; this.handled < this.c.msgs.length; this.handled++) {
      const m = this.c.msgs[this.handled];
      if (m.t === 'bd') this.sync(m);
      else if (m.t === 'ak') this.ak(m);
    }
  }
  /** Arranque de ronda: tablero vacío y cola nueva con la semilla de `rs`. */
  begin(rs) {
    this.seed = rs.seed;
    this.grid = newGrid();
    this.feed = new Feed(rs.seed);
    this.n = 0;
    this.a = 0;
  }
  sync(bd) {
    this.grid = gridFromString(bd.grid);
    this.feed = new Feed(this.seed ?? 0);
    this.feed.load(bd);
    this.n = bd.n;
    this.a = bd.a;
  }
  ak(ak) {
    for (const g of ak.add || []) {
      addGarbage(this.grid, g.rows, g.hole);
      this.a += g.rows;
    }
  }
  plan() {
    const c = choose(this.grid, this.feed, brain(3), () => 0.5, false);
    return { t: 'lk', n: this.n, p: c.kind, r: c.r, x: c.x, y: c.y, h: c.hold ? 1 : 0, a: this.a };
  }
  play() {
    const msg = this.plan();
    this.c.send(msg);
    if (msg.h) this.feed.hold();
    place(this.grid, msg.p, msg.r, msg.x, msg.y);
    clearLines(this.grid);
    this.feed.next();
    this.n++;
    return msg;
  }
}

test('servidor: una persona crea la sala, la ronda arranca sola, fija piezas válidas y recibe ak, resúmenes y ranking', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'create', game: 'caida', name: 'Ana' });
  await wait(400);
  assert.ok(c.last('joined'));
  const idx = (t) => c.msgs.findIndex((m) => m.t === t);
  assert.ok(idx('reset') >= 0 && idx('reset') < idx('me'), 'reset antes que me');
  assert.equal(c.last('room').room.state, 'playing', 'arrancó sola');
  assert.equal(c.last('room').room.arena, true);
  const me = c.last('me');
  assert.equal(c.last('pl').p.length, 12, 'bots completan hasta 12');
  c.send({ t: 'hi', color: 4 });
  const rs = c.last('rs');
  assert.ok(rs && rs.in > 0 && rs.in <= 3000 && rs.n === 12);
  const pl = new NetPlayer(c);
  pl.begin(rs);
  await wait(3300);
  for (let i = 0; i < 8; i++) {
    pl.play();
    await wait(260);
    pl.pump();
  }
  const aks = c.all('ak');
  assert.equal(aks.length, 8);
  assert.deepEqual(aks.map((a) => a.n), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(c.msgs.filter((m) => m.t === 'bd').length, 0, 'ninguna resincronización');
  assert.ok(c.all('sm').length >= 3, 'resúmenes de rivales (2 Hz)');
  const sm = c.last('sm');
  assert.ok(sm.p.length >= 10 && sm.p[0][1].length === 10);
  assert.ok(c.last('lb').l.length > 0);
  assert.ok(me.num > 0);
  c.ws.close();
});

test('servidor: un fijado ilegal y uno repetido reciben bd; a las 4 faltas el servidor saca a la persona (banned)', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'create', game: 'caida', name: 'Tramposa' });
  await wait(300);
  const rs = c.last('rs');
  const pl = new NetPlayer(c);
  pl.begin(rs);
  await wait(3200);
  const good = pl.play();
  await wait(250);
  pl.pump();
  assert.equal(c.all('ak').length, 1);
  // repetido
  c.send(good);
  await wait(200);
  assert.equal(c.last('bd').why, 'replay');
  pl.pump();
  assert.equal(c.last('bd').n, 1, 'el bd trae el n real');
  // ilegal: flotando
  c.send({ ...pl.plan(), y: 4 });
  await wait(200);
  assert.equal(c.last('bd').why, 'pos');
  // dos más y se va
  c.send({ ...pl.plan(), p: (pl.plan().p % 7) + 1 });
  await wait(1700);
  c.send({ ...pl.plan(), y: 4 });
  await wait(300);
  assert.ok(c.last('banned'), 'banned');
  assert.ok(c.last('dead'), 'y eliminada');
  await wait(200);
  assert.equal(c.ws.readyState, 3, 'el servidor cerró el socket');
});

test('servidor: quien entra con la ronda en curso mira (no juega) y recibe tableros; la lista informa la sala y no cuenta como tiempo real', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'caida', name: 'Uno', settings: { public: true, crowd: 'small' } });
  await wait(300);
  const code = a.last('joined').code;
  await wait(3300);
  const b = await connect(srv.port);
  b.send({ t: 'list', game: 'caida' });
  await wait(150);
  const list = b.last('list');
  const mine = list.rooms.find((r) => r.code === code);
  assert.ok(mine && mine.state === 'playing' && mine.max === 16 && mine.n === 1 && mine.bots === 7, JSON.stringify(mine));
  b.send({ t: 'join', game: 'caida', code, name: 'Dos' });
  await wait(900);
  assert.ok(b.last('joined'));
  const me = b.last('me');
  assert.equal(me.play, false, 'espectador');
  assert.equal(me.phase, 'play');
  assert.ok(b.last('wg'), 'recibe un tablero para mirar');
  b.send({ t: 'watch', n: b.last('wg').n });
  const h = await fetch(`http://127.0.0.1:${srv.port}/health`).then((r) => r.json());
  assert.ok(h.games.includes('caida'));
  a.ws.close();
  b.ws.close();
  await wait(100);
});

test('servidor: al reconectar con el token vuelve a la misma partida con reset y su tablero real', async () => {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'caida', name: 'Eli' });
  await wait(300);
  const j = a.last('joined');
  const num = a.last('me').num;
  await wait(3300);
  const pl = new NetPlayer(a);
  pl.begin(a.last('rs'));
  for (let i = 0; i < 3; i++) {
    pl.play();
    await wait(300);
  }
  a.ws.terminate();
  await wait(1200); // un bot juega por ella
  const b = await connect(srv.port);
  b.send({ t: 'join', game: 'caida', code: j.code, token: j.token, name: 'Eli' });
  await wait(500);
  assert.equal(b.last('joined').id, j.id);
  assert.ok(b.msgs.findIndex((m) => m.t === 'reset') >= 0);
  assert.equal(b.last('me').num, num, 'misma persona');
  const bd = b.last('bd');
  assert.ok(bd && bd.n >= 3, 'su tablero real, con lo que jugó el bot');
  const again = new NetPlayer(b);
  again.seed = pl.seed;
  again.sync(bd);
  again.play();
  await wait(300);
  assert.equal(b.last('ak').n, bd.n, 'sigue jugando desde donde quedó');
  b.ws.close();
});

test('servidor: sin errores no controlados', () => {
  assert.doesNotMatch(srv.logs(), /\bfatal\b|^\S+ error /m);
});
