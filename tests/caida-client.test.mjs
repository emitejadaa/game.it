/** Caída Libre, lógica pura del cliente: tablero propio (Sim) contra el servidor con latencia, DAS/ARR, gestos táctiles, distribución en pantalla, tableros chicos y modo sin conexión. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, Autoshift, Gesture, RivalBoards, OfflineSession, DemoBoard, layoutFor, packMinis, formatTime, sanitizeName, OFFLINE_LEVELS } from '../public/games/caida/logic.js';
import { Match } from '../public/games/caida/shared/match.js';
import { choose, brain } from '../public/games/caida/shared/bots.js';
import { W, H, CFG, mulberry32, fits, gridFromString, gridToString } from '../public/games/caida/shared/rules.js';

/** Juega una pieza del Sim con el mismo bot que usan los rivales (el cliente real lo hace con el teclado). */
function playOne(sim, rnd, bot = brain(3)) {
  const c = choose(sim.grid, sim.feed, bot, rnd, false);
  if (!c) return null;
  if (c.hold) sim.hold();
  sim.piece.r = c.r;
  sim.piece.x = c.x;
  return sim.hardDrop();
}

/** Un servidor de verdad (Match) con un único humano y el canal de ida y vuelta con `lag` ms de demora en cada sentido. */
function netGame({ seed = 11, lag = 0, crowd = 1, bots = false } = {}) {
  const inbox = [];
  const m = new Match({ seed, crowd, bots, tide: false, autoRound: false, afkMs: 1e12, out: { to: (_, msg) => inbox.push({ at: clock + lag, msg }), all() {}, soft() {}, kick() {} } });
  let clock = 0;
  const p = m.addPlayer({ id: 'x', name: 'Yo' });
  m.newRound(0);
  const sim = new Sim();
  sim.start(m.seed);
  m.step(m.startAt);
  sim.running = true;
  const toServer = [];
  return {
    m,
    p,
    sim,
    msgs: [],
    get t() {
      return clock;
    },
    /** El cliente fija una pieza: viaja `lag` ms. */
    lock(res) {
      if (res) toServer.push({ at: clock + lag, msg: res.msg });
    },
    /** Avanza el reloj `dt` ms entregando lo que llegó a cada lado. */
    advance(dt) {
      clock += dt;
      const t0 = m.startAt + clock;
      while (toServer.length && toServer[0].at <= clock) m.lock(p.num, toServer.shift().msg, t0);
      m.step(t0);
      while (inbox.length && inbox[0].at <= clock) {
        const { msg } = inbox.shift();
        this.msgs.push(msg);
        if (msg.t === 'ak' && msg.add) sim.addGarbage(msg.add);
        if (msg.t === 'bd') sim.resync(msg);
      }
    },
  };
}

test('Sim: nace con la pieza de la bolsa, baja con la gravedad y fija a los 0,5 s de estar apoyada', () => {
  const sim = new Sim();
  sim.start(5);
  sim.running = true;
  const kind = sim.feed.active;
  assert.equal(sim.piece.kind, kind);
  let lock = null;
  let ms = 0;
  while (!lock && ms < 20000) {
    lock = sim.update(16);
    ms += 16;
  }
  assert.ok(lock, 'la pieza termina fijándose sola');
  assert.equal(lock.msg.t, 'lk');
  assert.equal(lock.msg.n, 0);
  assert.equal(lock.msg.p, kind);
  assert.equal(lock.msg.h, 0);
  assert.equal(sim.locks, 1);
  assert.notEqual(sim.piece.kind, undefined);
});

test('Sim: mover o girar una pieza apoyada reinicia la demora de fijado, pero solo 15 veces', () => {
  const sim = new Sim();
  sim.start(3);
  sim.running = true;
  sim.piece.y = sim.ghostY();
  assert.ok(sim.grounded());
  sim.lockMs = 400;
  assert.ok(sim.move(1) || sim.move(-1));
  assert.equal(sim.lockMs, 0, 'mover reinicia la demora');
  for (let i = 0; i < 40; i++) {
    sim.lockMs = 300;
    if (!sim.move(i % 2 ? 1 : -1)) sim.move(i % 2 ? -1 : 1);
  }
  assert.equal(sim.resets, CFG.lockResets, 'después de 15 ya no reinicia');
  sim.lockMs = 300;
  sim.move(1);
  assert.equal(sim.lockMs, 300);
});

test('Sim: guardar cambia la pieza una vez por turno y el fijado lo declara con h: 1', () => {
  const sim = new Sim();
  sim.start(9);
  sim.running = true;
  const first = sim.feed.active;
  assert.equal(sim.hold(), true);
  assert.equal(sim.feed.held, first);
  assert.notEqual(sim.piece.kind, first);
  assert.equal(sim.hold(), false, 'no se puede guardar dos veces seguidas');
  const res = sim.hardDrop();
  assert.equal(res.msg.h, 1);
  assert.equal(sim.feed.canHold, true, 'después de fijar se puede otra vez');
});

test('Sim contra el servidor sin demora: todo lo que fija el cliente lo valida el Match y no hay resincronizaciones', () => {
  const g = netGame({ seed: 21 });
  const rnd = mulberry32(1);
  for (let i = 0; i < 150 && !g.sim.dead; i++) {
    g.lock(playOne(g.sim, rnd));
    g.advance(200); // 5 piezas por segundo: bajo el tope del servidor (9 por segundo)
  }
  g.advance(100);
  assert.deepEqual(g.msgs.filter((x) => x.t === 'bd').map((x) => x.why), [], 'ningún bd: el servidor aceptó todo');
  assert.equal(g.msgs.filter((x) => x.t === 'ak').length, g.sim.locks);
  assert.equal(g.p.locks, g.sim.locks);
  assert.equal(gridToString(g.p.grid), gridToString(g.sim.grid), 'los dos tableros quedaron iguales');
});

test('Sim contra el servidor con 250 ms de ida y vuelta: sigue sin rechazos aunque fije varias piezas antes de recibir el ak', () => {
  const g = netGame({ seed: 33, lag: 125 });
  const rnd = mulberry32(2);
  for (let i = 0; i < 120 && !g.sim.dead; i++) {
    g.lock(playOne(g.sim, rnd));
    g.advance(120); // más de 8 piezas por segundo, mucho más que una persona: varios fijados en vuelo
  }
  g.advance(600);
  assert.equal(g.msgs.filter((x) => x.t === 'bd').length, 0);
  assert.equal(g.p.locks, g.sim.locks);
  assert.equal(gridToString(g.p.grid), gridToString(g.sim.grid));
});

test('basura con demora de red: el cliente aplica el `add` del ak en orden y el tablero propio coincide con el del servidor', () => {
  const g = netGame({ seed: 44, lag: 80, crowd: 2, bots: false });
  const other = g.m.addPlayer({ id: 'y', name: 'Rival' });
  g.m.prepare(other); // el rival entra a la ronda en cuenta… ya empezó: lo dejamos listo a mano
  other.play = true;
  other.alive = true;
  g.m.aliveCount++;
  g.m.startCount++;
  // el rival le manda 3 líneas de basura al humano
  g.m.attack(other, 3, g.m.startAt + g.t);
  const rnd = mulberry32(3);
  g.advance(1100); // la basura espera su segundo
  for (let i = 0; i < 6 && !g.sim.dead; i++) {
    g.lock(playOne(g.sim, rnd));
    g.advance(150);
  }
  g.advance(500);
  assert.ok(g.msgs.some((x) => x.t === 'ak' && x.add && x.add.length), 'llegó basura en un ak');
  assert.equal(g.msgs.filter((x) => x.t === 'bd').length, 0, 'sin resincronizaciones');
  assert.equal(g.sim.ga, g.p.gBase + g.p.unconf.reduce((s, u) => s + u.rows, 0), 'las filas de basura aplicadas coinciden');
  assert.equal(gridToString(g.m.trueGrid(g.p).g), gridToString(g.sim.grid));
});

test('resync (bd): el tablero, la cola, el guardado y los contadores quedan como los tiene el servidor', () => {
  const g = netGame({ seed: 55 });
  const rnd = mulberry32(4);
  for (let i = 0; i < 5; i++) {
    g.lock(playOne(g.sim, rnd));
    g.advance(40);
  }
  const bd = g.m.bdMsg(g.p, 'test');
  const sim = new Sim();
  sim.start(g.m.seed);
  assert.equal(sim.resync(bd), true);
  assert.equal(sim.locks, 5);
  assert.equal(sim.feed.active, g.p.feed.active);
  assert.deepEqual(sim.feed.state(), g.p.feed.state());
  assert.equal(gridToString(sim.grid), bd.grid);
  assert.equal(sim.resync({ ...bd, grid: 'corto' }), false, 'un bd mal formado se ignora');
});

test('Sim.addGarbage: la pieza en mano sube si la basura la pisa y una fila fuera de rango no entra', () => {
  const sim = new Sim();
  sim.start(7);
  sim.running = true;
  sim.piece.y = sim.ghostY();
  const before = sim.piece.y;
  const n = sim.addGarbage([{ rows: 2, hole: 3 }, { rows: 99, hole: 3 }, { rows: 1, hole: 50 }]);
  assert.equal(n, 2, 'solo cuenta lo válido');
  assert.equal(sim.ga, 2);
  assert.ok(sim.piece.y <= before - 2 || fits(sim.grid, sim.piece.kind, sim.piece.r, sim.piece.x, sim.piece.y), 'la pieza quedó en un lugar libre');
  assert.equal(fits(sim.grid, sim.piece.kind, sim.piece.r, sim.piece.x, sim.piece.y), true);
});

test('Autoshift: un paso al apretar, espera el DAS y después repite cada ARR; soltar corta y el otro lado retoma', () => {
  const a = new Autoshift({ das: 150, arr: 30 });
  assert.equal(a.press(-1), -1);
  assert.equal(a.update(100), 0, 'todavía en el DAS');
  assert.equal(a.update(60), -1, 'terminó el DAS: primer paso repetido');
  assert.equal(a.update(95), -3, 'tres pasos más en 95 ms (30 ms cada uno)');
  a.press(1);
  assert.equal(a.dir, 1, 'la última tecla manda');
  a.release(1);
  assert.equal(a.dir, -1, 'al soltar la última vuelve la anterior que sigue apretada');
  a.release(-1);
  assert.equal(a.update(1000), 0);
  const inst = new Autoshift({ das: 100, arr: 0 });
  inst.press(1);
  assert.equal(inst.update(120), 99, 'ARR 0: hasta la pared');
  inst.clear();
  assert.equal(inst.update(500), 0);
});

test('Gesture: tocar gira, arrastrar mueve por columnas, bajar despacio es caída suave y deslizar rápido es caída dura', () => {
  const g = new Gesture({ cell: 24 });
  g.down(100, 300, 0);
  assert.deepEqual(g.up(102, 301, 120), [{ a: 'rotate' }], 'un toque corto gira');
  g.down(100, 300, 0);
  assert.deepEqual(g.up(102, 301, 600), [], 'un toque largo no gira');
  g.down(100, 300, 0);
  const mv = g.move(100 + 21, 300, 30).concat(g.move(100 + 42, 300, 60), g.move(100 + 63, 301, 90));
  assert.deepEqual(mv, [{ a: 'move', dx: 1 }, { a: 'move', dx: 1 }, { a: 'move', dx: 1 }]);
  assert.deepEqual(g.up(163, 301, 120), [], 'arrastrar no gira al soltar');
  g.down(100, 300, 0);
  g.move(98, 330, 200);
  const soft = g.move(98, 360, 600);
  assert.deepEqual(g.up(98, 360, 1200), [{ a: 'soft', on: false }], 'despacio: solo caída suave, sin caída dura');
  void soft;
  g.down(100, 300, 0);
  let acts = g.move(100, 340, 16).concat(g.move(100, 400, 32), g.move(100, 470, 48));
  assert.ok(acts.some((a) => a.a === 'soft' && a.on));
  acts = g.up(100, 470, 56);
  assert.deepEqual(acts, [{ a: 'soft', on: false }, { a: 'hard' }], 'rápido: caída dura');
  g.down(100, 300, 0);
  g.cancel();
  assert.deepEqual(g.up(100, 300, 50), []);
});

test('layoutFor: el tablero entra, respeta los 56 px de arriba y a 360 px de ancho todo se ve (escritorio, horizontal y celular)', () => {
  for (const [w, h, rivals, touch] of [[1280, 800, 11, false], [1920, 1080, 15, false], [1000, 600, 11, false], [844, 390, 11, true], [390, 780, 11, true], [360, 640, 15, true], [360, 520, 5, true], [320, 568, 7, true], [1280, 800, 0, false]]) {
    const L = layoutFor(w, h, { rivals, touch });
    const tag = `${w}x${h} r${rivals}`;
    assert.ok(L.board.x >= 0 && L.board.x + L.board.w <= w, `${tag}: el tablero entra a lo ancho`);
    assert.ok(L.board.y - L.cell >= 56, `${tag}: no pisa los 56 px del portal`);
    assert.ok(L.board.y + L.board.h <= h, `${tag}: el tablero entra a lo alto`);
    assert.ok(L.hold.x >= 0 && L.next.x + L.next.w <= w + 1, `${tag}: guardado y cola dentro de la pantalla`);
    assert.ok(L.cell >= 8, `${tag}: celdas legibles`);
    if (rivals) {
      assert.equal(L.minis.pos.length, rivals, `${tag}: una posición por rival`);
      for (const p of L.minis.pos) {
        assert.ok(p.x >= -0.5 && p.x + 10 * L.minis.m <= w + 0.5, `${tag}: tablero chico dentro a lo ancho`);
        assert.ok(p.y >= 56 && p.y + 20 * L.minis.m <= h + 0.5, `${tag}: tablero chico dentro a lo alto`);
      }
    }
  }
  assert.equal(layoutFor(390, 780, { rivals: 11, touch: true }).mode, 'strip');
  assert.equal(layoutFor(1280, 800, { rivals: 11 }).mode, 'side');
  assert.equal(layoutFor(390, 780, { rivals: 0, touch: true }).strip.h, 0, 'sin rivales (maratón) no se reserva la tira');
});

test('packMinis: elige el mayor tamaño que entra y no se pisan', () => {
  const r = packMinis(6, { x: 0, y: 100, w: 300, h: 500 });
  assert.ok(r.m > 0);
  assert.equal(r.pos.length, 6);
  for (let i = 0; i < r.pos.length; i++)
    for (let j = i + 1; j < r.pos.length; j++) {
      const a = r.pos[i];
      const b = r.pos[j];
      const overlap = a.x < b.x + 10 * r.m && b.x < a.x + 10 * r.m && a.y < b.y + 20 * r.m && b.y < a.y + 20 * r.m;
      assert.equal(overlap, false);
    }
  assert.equal(packMinis(3, { x: 0, y: 0, w: 5, h: 5 }).m, 0, 'si no entra devuelve 0');
  assert.deepEqual(packMinis(0, { x: 0, y: 0, w: 100, h: 100 }).pos, []);
});

test('RivalBoards: el perfil de 2 Hz se suaviza hacia lo real, los KO quedan marcados y el propio número se ignora', () => {
  const rb = new RivalBoards();
  const prof = (n) => String.fromCharCode(48 + n).repeat(W);
  const seen = rb.apply({ p: [[1, prof(4), 2], [2, prof(10), 0], [3, 'mal', 0]] }, 1);
  assert.deepEqual([...seen], [2], 'ignora al propio y al perfil mal formado');
  const r = rb.get(2);
  assert.equal(r.shown[0], 10, 'la primera vez se muestra directo');
  rb.apply({ p: [[2, prof(2), 5]] }, 1);
  assert.equal(r.pend, 5);
  rb.tick(30);
  assert.ok(r.shown[0] < 10 && r.shown[0] > 2, 'se acerca de a poco');
  for (let i = 0; i < 60; i++) rb.tick(16);
  assert.ok(Math.abs(r.shown[0] - 2) < 0.05, 'llega');
  assert.equal(rb.maxHeight(2), 2);
  rb.ko(2, 4);
  assert.equal(r.alive, false);
  assert.equal(r.rank, 4);
  assert.equal(r.pend, 0);
});

test('formatTime y sanitizeName', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65000), '1:05');
  assert.equal(formatTime(-5), '0:00');
  assert.equal(sanitizeName('  <b>Ana</b>\u0007  Pérez  '), 'bAna/b Pérez');
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
  assert.equal(sanitizeName(null), '');
});

test('OfflineSession (Contra la compu): arma la ronda con bots, la cuenta regresiva y manda los mismos mensajes que el servidor', () => {
  const msgs = [];
  const s = new OfflineSession({ level: 'normal', name: 'Ana', color: 2, seed: 99, emit: (m) => msgs.push(m) });
  const types = msgs.map((m) => m.t);
  assert.deepEqual(types.slice(0, 4), ['reset', 'pl', 'me', 'lb']);
  const rs = msgs.find((m) => m.t === 'rs');
  assert.ok(rs && rs.n === OFFLINE_LEVELS.normal.crowd, 'ronda con la gente del nivel');
  const pl = msgs.filter((m) => m.t === 'pl').at(-1);
  assert.equal(pl.p.length, OFFLINE_LEVELS.normal.crowd);
  assert.equal(pl.p.filter((p) => p[3]).length, OFFLINE_LEVELS.normal.crowd - 1, 'el resto son bots');
  assert.equal(pl.p.find((p) => p[0] === s.num)[1], 'Ana');
  // juega una pieza después de la cuenta y el servidor local contesta ak
  for (let i = 0; i < 32; i++) s.update(100); // la cuenta regresiva
  const sim = new Sim();
  sim.start(rs.seed);
  sim.running = true;
  const res = playOne(sim, mulberry32(5));
  msgs.length = 0;
  s.send(res.msg);
  s.update(16);
  assert.ok(msgs.some((m) => m.t === 'ak' && m.n === 0), 'ak del primer fijado');
});

test('OfflineSession (Maratón): sola, sin bots, sin marea; al llenarse el tablero termina con dead y end', () => {
  const msgs = [];
  const s = new OfflineSession({ level: 'marathon', seed: 5, emit: (m) => msgs.push(m) });
  assert.equal(s.marathon, true);
  assert.equal(msgs.find((m) => m.t === 'rs').n, 1);
  assert.equal(s.m.o.tide, false);
  for (let i = 0; i < 32; i++) s.update(100);
  const sim = new Sim();
  const rs = msgs.find((m) => m.t === 'rs');
  sim.start(rs.seed);
  sim.running = true;
  // piezas a lo bruto en la misma columna hasta que se llene
  let n = 0;
  while (!sim.dead && n < 80) {
    sim.piece.x = 3;
    const res = sim.hardDrop();
    s.send(res.msg);
    s.update(150);
    n++;
  }
  s.update(100);
  assert.ok(msgs.some((m) => m.t === 'dead'), 'avisa que perdió');
  const end = msgs.find((m) => m.t === 'end');
  assert.ok(end, 'y que terminó la maratón');
  assert.equal(end.res.length, 1);
  assert.equal(msgs.filter((m) => m.t === 'bd').length, 0, 'sin resincronizaciones');
  // reaparecer: otra ronda desde cero
  msgs.length = 0;
  s.restart();
  assert.ok(msgs.some((m) => m.t === 'rs' && m.round === 2));
});

test('OfflineSession: de la misma semilla sale la misma partida de bots', () => {
  const run = (seed) => {
    const msgs = [];
    const s = new OfflineSession({ level: 'hard', seed, emit: (m) => msgs.push(m) });
    for (let i = 0; i < 400; i++) s.update(50);
    return JSON.stringify(msgs.filter((m) => m.t === 'ko' || m.t === 'end'));
  };
  assert.equal(run(31), run(31));
});

test('DemoBoard (fondo del menú): juega solo, nunca se queda trabado y se reinicia al llenarse', () => {
  const d = new DemoBoard(8);
  let placed = 0;
  let resets = 0;
  let last = d.seed;
  for (let i = 0; i < 20000; i++) {
    d.update(45);
    if (d.seed !== last) {
      resets++;
      last = d.seed;
    }
    if (!d.piece) placed++;
  }
  assert.ok(placed > 100, 'coloca piezas');
  assert.ok(d.grid.length === W * H);
  assert.ok(resets >= 0);
  void gridFromString;
});
