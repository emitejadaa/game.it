/** server/games/_arena.js: bucle, arranque automático, bots, presupuesto de CPU, backpressure y reconexión (con una api falsa). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { arenaGame, BudgetGovernor } from '../server/games/_arena.js';

class ToyWorld {
  constructor(seed, opts = {}) {
    this.tick = 0;
    this.tps = opts.tps;
    this.players = new Map();
    this.deaths = [];
    this.n = 1;
    this.rnd = () => 0.5;
    this.spin = 0;
    this.waits = new Map();
  }
  addPlayer(o) {
    const p = { num: this.n++, alive: false, ...o };
    this.players.set(p.num, p);
    return p;
  }
  removePlayer(n) {
    this.players.delete(n);
  }
  canSpawn(n) {
    return !(this.waits.get(n) > 0);
  }
  waitTicks(n) {
    return this.waits.get(n) || 0;
  }
  spawn(n) {
    const p = this.players.get(n);
    if (!p || p.alive) return false;
    p.alive = true;
    return true;
  }
  step() {
    this.tick++;
    if (this.spin) for (const t = performance.now(); performance.now() - t < this.spin; );
  }
  leaderboard() {
    return [...this.players.values()].map((p) => [p.num, 0]);
  }
}

function make(extra = {}) {
  const thinks = [];
  const views = [];
  const mod = arenaGame({
    id: 'toy',
    title: 'Toy',
    World: ToyWorld,
    tps: 50,
    maxHumans: 4,
    crowd: 6,
    botNames: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    brain: (level) => ({ level }),
    think: (w, p, b) => thinks.push(p.num),
    viewer: (w, num) => {
      const v = { num, built: 0, resets: 0, reset: () => v.resets++, build: () => (v.built++, { t: 's', k: w.tick }) };
      views.push(v);
      return v;
    },
    meExtra: () => ({ size: 9 }),
    command: ({ w, p }, msg) => (msg.t === 'i' ? true : undefined),
    governor: { windowSec: 0.2, min: 4 },
    ...extra,
  });
  const timers = new Map();
  const sent = [];
  const closed = [];
  const buffered = new Map();
  const api = {
    broadcast: (m, except) => sent.push(['*', m, except]),
    send: (pid, m) => sent.push([pid, m]),
    touch() {},
    sync() {},
    players: () => [],
    setTimer: (name, ms, fn) => timers.set(name, { ms, fn }),
    clearTimer: (name) => timers.delete(name),
    close: (r) => closed.push(r),
    bufferedAmount: (pid) => buffered.get(pid) || 0,
  };
  const room = { code: 'TOY01', game: 'toy', players: new Map(), settings: { ...mod.defaults }, state: 'lobby', data: null, host: null, timers: new Map() };
  const join = (id, connected = true) => {
    room.players.set(id, { id, name: id, connected });
    room.host ||= id;
    mod.onJoin(room, api, id);
  };
  /** Corre una vuelta del bucle con `n` pasos pendientes. */
  const run = (n = 1) => {
    const t = timers.get('loop');
    timers.delete('loop');
    room.data.t0 = performance.now() - (room.data.ticks + n) * room.data.tickMs - 0.5;
    t.fn();
  };
  return { mod, room, api, timers, sent, closed, buffered, join, run, thinks, views };
}
const types = (sent, who) => sent.filter((s) => s[0] === who).map((s) => s[1].t);

test('arranque automático: la primera persona pone en marcha la sala y recibe reset, pl, me y lb en orden', () => {
  const { mod, room, timers, sent, join } = make();
  assert.equal(room.state, 'lobby');
  join('p1');
  assert.equal(room.state, 'playing', 'no pasa por el lobby');
  assert.ok(room.data && timers.get('loop'), 'bucle en marcha');
  assert.equal(mod.realtime, true);
  assert.deepEqual(types(sent, 'p1'), ['reset', 'pl', 'me', 'lb']);
  const me = sent.find((s) => s[0] === 'p1' && s[1].t === 'me')[1];
  assert.equal(me.alive, false);
  assert.equal(me.size, 9, 'meExtra se suma al mensaje');
  assert.equal(room.data.bots.length, 5, 'los bots completan hasta 6');
  assert.ok([...room.data.w.players.values()].filter((p) => p.bot).every((p) => p.alive), 'los bots nacen solos');
  join('p2');
  assert.deepEqual(types(sent, 'p2').slice(0, 1), ['reset'], 'late join: también recibe reset primero');
  assert.equal(room.data.bots.length, 4);
});

test('bots: se sacan al entrar gente, se devuelven al salir y "sin bots" los apaga', () => {
  const { mod, room, api, join } = make();
  join('p1');
  join('p2');
  join('p3');
  assert.equal(room.data.bots.length, 3);
  room.players.delete('p3');
  mod.removed(room, api, 'p3');
  assert.equal(room.data.bots.length, 4);
  assert.equal([...room.data.w.players.values()].filter((p) => !p.bot).length, 2);
  const { mod: m2, room: r2, join: j2 } = make();
  r2.settings = m2.settings(r2.settings, { bots: false });
  j2('x');
  assert.equal(r2.data.bots.length, 0);
});

test('ajustes: solo se aceptan valores del tipo correcto y el nombre se limpia', () => {
  const { mod } = make({ settings: (out, s) => ({ ...out, speed: s.speed === 'fast' ? 'fast' : out.speed }) });
  const s = mod.settings({ name: '', public: true, bots: true }, { name: '<b>Hola</b>\u0001'.repeat(10), public: 'si', bots: false, speed: 'fast' });
  assert.equal(s.public, true);
  assert.equal(s.bots, false);
  assert.equal(s.speed, 'fast');
  assert.ok(s.name.length <= 28 && !/[<>\u0001]/.test(s.name));
});

test('bucle: un error no congela la arena y el 5.º seguido cierra la sala', () => {
  const { room, timers, closed, join, run } = make();
  join('p1');
  room.data.w.step = () => {
    throw new Error('boom');
  };
  const orig = console.error;
  const errors = [];
  console.error = (...a) => errors.push(a.join(' '));
  try {
    let runs = 0;
    while (timers.get('loop') && runs < 10) {
      run(1);
      runs++;
      if (!closed.length) assert.ok(timers.get('loop'), `tras el fallo ${runs} sigue programado`);
    }
    assert.equal(runs, 5);
    assert.deepEqual(closed, ['error']);
    assert.equal(timers.get('loop'), undefined);
    assert.equal(errors.length, 5);
  } finally {
    console.error = orig;
  }
});

test('bucle: la recuperación del atraso se limita a 3 pasos y un paso bueno reinicia los fallos', () => {
  const { room, join, run } = make();
  join('p1');
  run(50); // el servidor se trabó 50 pasos
  assert.equal(room.data.ticks, 3);
  assert.equal(room.data.fails, 0);
  const orig = console.error;
  console.error = () => {};
  try {
    const w = room.data.w;
    const real = w.step;
    w.step = () => {
      throw new Error('x');
    };
    run(1);
    run(1);
    assert.equal(room.data.fails, 2);
    w.step = real;
    run(1);
    assert.equal(room.data.fails, 0);
  } finally {
    console.error = orig;
  }
});

test('sin nadie conectado el mundo se pausa; al volver sigue donde estaba', () => {
  const { room, join, run } = make();
  join('p1');
  run(2);
  const t = room.data.w.tick;
  room.players.get('p1').connected = false;
  run(30);
  assert.equal(room.data.w.tick, t, 'pausado');
  room.players.get('p1').connected = true;
  run(1);
  assert.equal(room.data.w.tick, t + 1, 'sin ráfaga de pasos atrasados');
});

test('BudgetGovernor: saca 2 bots (mínimo 4) pasando el 25% y los devuelve bajando del 10%', () => {
  const g = new BudgetGovernor({ tickMs: 50, windowTicks: 100, min: 4, max: 10 });
  assert.equal(g.cap, 10);
  for (let i = 0; i < 99; i++) g.add(20); // 40% del paso
  assert.equal(g.update(), 0, 'falta una ventana completa');
  g.add(20);
  assert.equal(g.update(), -2);
  assert.equal(g.cap, 8);
  assert.equal(g.update(), 0, 'después de un cambio se espera una ventana nueva');
  for (const want of [6, 4, 4]) {
    for (let i = 0; i < 100; i++) g.add(20);
    g.update();
    assert.equal(g.cap, want);
  }
  for (let i = 0; i < 100; i++) g.add(8); // 16%: ni sube ni baja
  assert.equal(g.update(), 0);
  for (let i = 0; i < 100; i++) g.add(2); // 4%
  assert.equal(g.update(), 2);
  assert.equal(g.cap, 6);
  for (let i = 0; i < 700; i++) {
    g.add(1);
    g.update();
  }
  assert.equal(g.cap, 10, 'nunca pasa del máximo');
});

test('presupuesto: una arena lenta pierde bots y los recupera cuando se alivia (se informa avgTickMs)', () => {
  const { room, join, run } = make({ tps: 100, crowd: 10, governor: { windowSec: 0.3, min: 4 } });
  join('p1');
  assert.equal(room.data.bots.length, 9);
  room.data.w.spin = 3.5; // 35% de un paso de 10 ms
  for (let i = 0; i < 120 && room.data.bots.length > 4; i++) run(3);
  assert.equal(room.data.bots.length, 4, 'bajó hasta el mínimo de 4 bots');
  assert.ok(room.avgTickMs > 2.5, `avgTickMs ${room.avgTickMs}`);
  room.data.w.spin = 0;
  for (let i = 0; i < 400 && room.data.bots.length < 9; i++) run(3);
  assert.equal(room.data.bots.length, 9, 'volvieron todos');
  assert.ok(room.avgTickMs < 1);
});

test('backpressure: no arma ni manda snapshots a quien tiene más de 64 KB sin enviar, y retoma después', () => {
  const { room, sent, buffered, join, run, views } = make();
  join('slow');
  join('fast');
  const slow = views.find((v) => v.num === room.data.nums.get('slow'));
  const fast = views.find((v) => v.num === room.data.nums.get('fast'));
  buffered.set('slow', 70 * 1024);
  run(1);
  run(1);
  run(1);
  assert.equal(slow.built, 0, 'ni se arma');
  assert.equal(fast.built, 3);
  assert.equal(room.data.skipped, 3);
  assert.equal(sent.filter((s) => s[0] === 'slow' && s[1].t === 's').length, 0);
  buffered.set('slow', 1024);
  run(1);
  assert.equal(slow.built, 1);
  assert.equal(sent.filter((s) => s[0] === 'slow' && s[1].t === 's').length, 1);
});

test('desconexión: queda en el mundo con un bot al volante; al volver recibe reset y recupera el control', () => {
  const { mod, room, api, sent, join, run, thinks } = make();
  join('p1');
  join('p2');
  const num = room.data.nums.get('p2');
  room.data.w.spawn(num);
  room.players.get('p2').connected = false;
  mod.onDisconnect(room, api, 'p2');
  assert.ok(room.data.autos.has(num));
  thinks.length = 0;
  run(2);
  assert.ok(thinks.includes(num), 'el piloto automático decide por él');
  assert.ok(room.data.w.players.has(num), 'sigue en el mundo');
  sent.length = 0;
  room.players.get('p2').connected = true;
  mod.onReconnect(room, api, 'p2');
  assert.equal(types(sent, 'p2')[0], 'reset');
  assert.ok(!room.data.autos.has(num));
  thinks.length = 0;
  run(2);
  assert.ok(!thinks.includes(num));
});

test('spawn: respeta la espera, limpia el nombre y valida el color', () => {
  const { mod, room, api, sent, join } = make();
  join('p1');
  const num = room.data.nums.get('p1');
  const person = room.players.get('p1');
  room.data.w.waits.set(num, 40);
  sent.length = 0;
  assert.equal(mod.command(room, api, person, { t: 'spawn', name: 'Ana', color: 3 }), true);
  assert.equal(room.data.w.players.get(num).alive, false);
  assert.equal(sent.find((s) => s[0] === 'p1').at(1).wait, 800, 'avisa cuánto falta (ms)');
  room.data.w.waits.set(num, 0);
  assert.equal(mod.command(room, api, person, { t: 'spawn', name: '<i>Ana</i>', color: 99 }), true);
  const p = room.data.w.players.get(num);
  assert.equal(p.alive, true);
  assert.equal(p.name, 'iAna/i');
  assert.equal(p.color, 0, 'color fuera de rango: queda el que tenía');
  assert.equal(mod.command(room, api, person, { t: 'i' }), true, 'lo demás va al command del juego');
  assert.equal(mod.command(room, api, person, { t: 'otra' }), undefined);
});

test('muertes: avisa al que murió y a su asesino, y las manda con el siguiente snapshot', () => {
  const { room, sent, join, run, views } = make();
  join('p1');
  join('p2');
  const [n1, n2] = ['p1', 'p2'].map((id) => room.data.nums.get(id));
  const w = room.data.w;
  const step = w.step.bind(w);
  w.step = () => {
    step();
    if (w.tick === 2) w.deaths.push({ num: n1, id: 'p1', by: n2, x: 1, y: 2, color: 0, stats: { time: 3 } });
  };
  sent.length = 0;
  run(2);
  assert.deepEqual(sent.find((s) => s[0] === 'p1' && s[1].t === 'dead')[1], { t: 'dead', by: n2, stats: { time: 3 } });
  assert.deepEqual(sent.find((s) => s[0] === 'p2' && s[1].t === 'ko')[1], { t: 'ko', n: n1 });
  assert.equal(room.data.w.deaths.length, 0, 'la lista del mundo se vacía');
});

test('ranking a 1 Hz y avgTickMs en la sala', () => {
  const { room, sent, join, run } = make();
  join('p1');
  sent.length = 0;
  for (let i = 0; i < 40; i++) run(3);
  const lbs = sent.filter((s) => s[0] === '*' && s[1].t === 'lb').length;
  assert.equal(lbs, Math.floor(room.data.ticks / 50));
  assert.ok(lbs >= 1);
  assert.equal(typeof room.avgTickMs, 'number');
});

test('listInfo y view: nombre, bots y sala en marcha', () => {
  const { mod, room, join } = make();
  assert.equal(mod.view(room).arena, false);
  join('Zoe');
  assert.equal(mod.view(room).arena, true);
  const info = mod.listInfo(room);
  assert.equal(info.name, 'Zoe');
  assert.equal(info.bots, 5);
});
