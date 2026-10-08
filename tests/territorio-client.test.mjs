/** Territorio, lógica pura del cliente: giros, vista, estelas, predicción de la cabeza y de la captura contra el mundo del servidor, modo sin conexión. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, CFG } from '../public/games/territorio/shared/world.js';
import { Viewer, Mirror } from '../public/games/territorio/shared/sync.js';
import { Predictor } from '../public/shared/net/predict.js';
import { InputSender } from '../public/shared/net/input.js';
import {
  OfflineSession,
  Overlay,
  OwnTracker,
  LEVELS,
  cloneOwn,
  dirOf,
  effectiveDir,
  fitCell,
  formatTime,
  legalTurn,
  ownedStats,
  ownPos,
  pathPoints,
  pctText,
  predictCapture,
  sanitizeName,
  stepOwn,
  swipeDir,
  trimPath,
} from '../public/games/territorio/logic.js';

test('giros: nombres del SDK → dirección, sin vuelta en U, y el próximo giro se valida contra los pendientes', () => {
  assert.deepEqual(['up', 'right', 'down', 'left', 'x'].map(dirOf), [0, 1, 2, 3, -1]);
  assert.equal(legalTurn(1, 3), false);
  assert.equal(legalTurn(1, 1), false);
  assert.equal(legalTurn(1, 0), true);
  assert.equal(legalTurn(1, 4), false);
  // yendo a la derecha con "abajo" pendiente: ahora "arriba" sería una vuelta en U
  const state = { dir: 1, seq: 4 };
  const history = [{ s: 5, k: 9, d: 2, b: 0 }];
  assert.equal(effectiveDir(state, history), 2);
  assert.equal(legalTurn(effectiveDir(state, history), 0), false);
  assert.equal(effectiveDir(state, [{ s: 3, k: 8, d: 0 }]), 1, 'lo ya aplicado no cuenta');
});

test('deslizar: eje dominante, mínimo de píxeles', () => {
  assert.equal(swipeDir(5, 5), -1);
  assert.equal(swipeDir(30, 10), 1);
  assert.equal(swipeDir(-30, 10), 3);
  assert.equal(swipeDir(3, 40), 2);
  assert.equal(swipeDir(3, -40), 0);
  assert.equal(swipeDir(24, 0, 24), 1);
});

test('fitCell: entero en píxeles del dispositivo y el lado mayor nunca pasa de 60 celdas visibles', () => {
  for (const [w, h, dpr] of [[1920, 1080, 1], [1366, 768, 1], [390, 780, 2], [360, 640, 3], [800, 600, 1.5], [2560, 1440, 1]]) {
    const cell = fitCell(w, h, dpr);
    assert.ok(Number.isInteger(Math.round(cell * dpr * 1e6) / 1e6), `${w}×${h}@${dpr}`);
    assert.ok(Math.max(w, h) / cell <= 60 + 1e-6 || cell >= 26, `${w}×${h}@${dpr}: ${Math.max(w, h) / cell} celdas`);
    assert.ok(cell >= 8 && cell <= 26);
  }
});

test('nombres, tiempo y porcentaje', () => {
  assert.equal(sanitizeName('  <b>Ana</b>\n  Lu  '), 'bAna/b Lu');
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
  assert.equal(formatTime(75), '1:15');
  assert.equal(pctText(1440, 120), '10,0');
  assert.equal(pctText(25, 120), '0,2');
  assert.equal(pctText(1440, 120, 'en'), '10.0');
});

test('trimPath y pathPoints: la cabeza se dibuja entre dos pasos sin cortar esquinas', () => {
  // estela: sale de (5,5), dobla en (9,5), cabeza en (9,8)
  const out = [];
  let n = pathPoints([5, 5, 9, 5], 9, 8, 2, 0, out);
  assert.deepEqual(out.slice(0, n), [5, 5, 9, 5, 9, 8]);
  n = pathPoints([5, 5, 9, 5], 9, 8, 2, 0.5, out);
  assert.deepEqual(out.slice(0, n), [5, 5, 9, 5, 9, 7.5]);
  n = pathPoints([5, 5, 9, 5], 9, 8, 2, 3.5, out); // retrocede más que el último tramo: queda en el tramo anterior
  assert.deepEqual(out.slice(0, n), [5, 5, 8.5, 5]);
  // recién doblada: la cabeza justo después de la esquina; con 1 celda de retroceso queda en la esquina
  n = pathPoints([5, 5, 9, 5], 9, 6, 2, 1, out);
  assert.deepEqual(out.slice(0, n), [5, 5, 9, 5]);
  // sin estela: un solo punto, retrocedido por la dirección
  n = pathPoints([], 10, 10, 1, 0.25, out);
  assert.deepEqual(out.slice(0, n), [9.75, 10]);
  n = pathPoints([], 10, 10, 1, -0.5, out);
  assert.deepEqual(out.slice(0, n), [10.5, 10]);
  const pts = [0, 0, 4, 0];
  assert.equal(trimPath(pts, -1, 1), 4);
  assert.deepEqual(pts, [0, 0, 5, 0], 'estirar: sigue derecho');
});

// ---------------------------------------------------------------- predicción contra el servidor
/** Una persona (con un piloto que da vueltas) en un mundo con bots, un cliente con retardo entero de pasos y su espejo. */
function netSim({ ticks = 900, up = 2, down = 2, seed = 21 } = {}) {
  const size = 120;
  const w = new World(seed, { size, tps: 10 });
  const me = w.addPlayer({ id: 'me', name: 'yo', color: 4 });
  w.spawn(me.num);
  const mirror = new Mirror(size);
  const viewer = new Viewer(w, me.num);
  const ctx = { size, isHome: (x, y) => mirror.shown[y * size + x] === me.num };
  const pr = new Predictor({ step: (s, h, tick) => stepOwn(s, h, tick, ctx), clone: cloneOwn, pos: ownPos, smoothMs: 120, snapDist: 6 });
  const own = new OwnTracker(pr);
  const ovl = new Overlay(2);
  const sent = [];
  const tx = new InputSender({ send: (m) => sent.push({ m, at: w.tick }), redundancy: 3, keepaliveMs: 1e12, now: () => 0 });
  const toServer = []; // { at, m }
  const toClient = []; // { at, snap }
  const lead = up + down; // el cliente va adelantado un viaje de ida y vuelta
  const stats = { reconciles: 0, snapped: 0, maxErr: 0, predictedCells: 0, mismatch: 0, captures: 0, mirrorBad: 0 };
  let appliedK = 0;
  const handleSnap = (m) => {
    const bikes = mirror.apply(m);
    mirror.applyTerritory(m);
    appliedK = m.k;
    const back = ovl.expire(appliedK);
    for (const c of back) {
      if (mirror.shown[c] !== mirror.owner[c]) stats.mismatch++;
      mirror.shown[c] = mirror.owner[c];
    }
    const mine = bikes.find((b) => b.num === me.num);
    if (mine && m.o) {
      const first = !pr.state;
      const rc = own.apply(mine, Number(m.a) || 0, m.k, 0);
      tx.ack(Number(m.a) || 0);
      if (!first) {
        stats.reconciles++;
        if (rc.snapped) stats.snapped++;
        stats.maxErr = Math.max(stats.maxErr, rc.err);
      }
    }
  };
  const pilot = { out: -1, turns: 0 };
  const steer = (d) => {
    const cur = effectiveDir(pr.state, pr.history);
    if (!legalTurn(cur, d)) return;
    tx.push(pr.record({ d, b: 0 }, pr.tick + 1));
  };
  let guard = 0;
  for (let T = 1; T <= ticks; T++) {
    // el servidor
    while (toServer.length && toServer[0].at <= T) {
      const { m } = toServer.shift();
      if (m.t === 'i' && me.alive) w.queueInputs(me, m.e);
    }
    w.step();
    if (!me.alive && w.canSpawn(me.num)) {
      w.spawn(me.num);
      pr.state = null;
      pr.history.length = 0;
      tx.recent.length = 0;
      ovl.clear();
    }
    w.deaths.length = 0;
    const snap = viewer.build([]);
    toClient.push({ at: T + down, snap });
    // el cliente
    while (toClient.length && toClient[0].at <= T) handleSnap(toClient.shift().snap);
    if (pr.state) {
      pr.advanceTo(T + lead);
      for (const ev of pr.state.closes) {
        if (ev.k <= appliedK || ovl.has(ev.k)) continue;
        const cells = predictCapture(mirror.shown, size, me.num, ev.cells);
        ovl.add(ev.k, cells);
        stats.predictedCells += cells.length;
        stats.captures++;
      }
      pr.state.closes.length = 0;
      // piloto: rectángulo de 7 × 2 (la salida es de un 5×5: una columna a 2 celdas del centro sigue siendo territorio)
      const s = pr.state;
      const n = size;
      const ax = s.x + [0, 1, 0, -1][s.dir] * 3;
      const ay = s.y + [-1, 0, 1, 0][s.dir] * 3;
      if (ax < 2 || ay < 2 || ax > n - 3 || ay > n - 3) steer((s.dir + 1) & 3);
      else if (!s.out) pilot.out = -1, (pilot.turns = 0);
      else {
        if (pilot.out < 0) pilot.out = pr.tick;
        const since = pr.tick - pilot.out;
        if (pilot.turns === 0 && since >= 7) (steer((s.dir + 1) & 3), (pilot.turns = 1), (pilot.out = pr.tick));
        else if (pilot.turns === 1 && since >= 2) (steer((s.dir + 1) & 3), (pilot.turns = 2), (pilot.out = pr.tick));
      }
      while (sent.length) toServer.push({ at: T + up, m: sent.shift().m });
    }
    guard++;
  }
  // al final, lo que se ve coincide con el servidor
  const win = viewer.win;
  for (let y = win[1]; y <= win[3]; y++) for (let x = win[0]; x <= win[2]; x++) if (mirror.owner[y * size + x] !== w.owner[y * size + x] && appliedK === w.tick - down) stats.mirrorBad++;
  return { w, me, stats, mirror, pr };
}

test('predicción: la cabeza propia y la captura predicha coinciden con el servidor con 400 ms de ida y vuelta', () => {
  const { stats, me } = netSim({ ticks: 1200, up: 2, down: 2 });
  assert.ok(stats.reconciles > 400, 'se reconcilió en cada snapshot');
  assert.ok(stats.captures >= 3, `capturas predichas: ${stats.captures}`);
  assert.equal(stats.snapped, 0, 'ningún salto de la cabeza propia');
  assert.equal(stats.maxErr, 0, 'el error visual es siempre 0: el cliente simula lo mismo que el servidor');
  assert.equal(stats.mismatch, 0, 'ninguna celda de las capturas predichas difirió de lo que dijo el servidor');
  assert.ok(stats.predictedCells > 20);
  void me;
});

test('predicción: con más demora (700 ms) sigue sin saltos', () => {
  const { stats } = netSim({ ticks: 900, up: 3, down: 4, seed: 8 });
  assert.equal(stats.snapped, 0);
  assert.equal(stats.maxErr, 0);
  assert.equal(stats.mismatch, 0);
});

test('Overlay: una captura predicha vive hasta que el servidor llega 2 pasos más allá y devuelve sus celdas', () => {
  const o = new Overlay(2);
  o.add(10, [1, 2, 3]);
  o.add(12, [9]);
  assert.equal(o.has(10), true);
  assert.deepEqual(o.expire(11), []);
  assert.deepEqual(o.expire(12), [1, 2, 3]);
  assert.equal(o.has(10), false);
  assert.deepEqual(o.expire(13), []);
  assert.deepEqual(o.expire(14), [9]);
  o.add(20, [5]);
  assert.deepEqual(o.clear(), [5]);
  assert.deepEqual(o.list, []);
});

test('predictCapture / ownedStats sobre una grilla', () => {
  const n = 20;
  const g = new Uint16Array(n * n);
  for (let y = 5; y <= 7; y++) for (let x = 5; x <= 7; x++) g[y * n + x] = 3;
  assert.deepEqual(ownedStats(g, n, 3), { count: 9, bb: [5, 5, 7, 7] });
  assert.deepEqual(ownedStats(g, n, 9), { count: 0, bb: null });
  // estela que sale por (8,6), rodea y vuelve: (8..10,6) (10,7..8) (9..8,8)
  const cells = [6 * n + 8, 6 * n + 9, 6 * n + 10, 7 * n + 10, 8 * n + 10, 8 * n + 9, 8 * n + 8];
  const changed = predictCapture(g, n, 3, cells);
  assert.equal(changed.length, 7 + 2, 'la estela y el interior (8,7) y (9,7)');
  assert.equal(g[7 * n + 9], 3);
  assert.equal(ownedStats(g, n, 3).count, 9 + 9);
});

// ---------------------------------------------------------------- sin conexión
test('OfflineSession: arranca con los mismos mensajes que el servidor, nace, se mueve y el espejo coincide con el mundo', () => {
  assert.deepEqual(LEVELS.map((l) => l.bots), [6, 9, 11]);
  const msgs = [];
  const off = new OfflineSession({ level: 'normal', emit: (m) => msgs.push(m), seed: 5, name: 'Ana', color: 2 });
  assert.deepEqual(msgs.slice(0, 4).map((m) => m.t), ['reset', 'pl', 'me', 'lb']);
  const me = msgs.find((m) => m.t === 'me');
  assert.equal(me.alive, false);
  assert.equal(me.size, 120);
  assert.equal(me.tps, 10);
  assert.equal(msgs.find((m) => m.t === 'pl').p.length, 10, '9 bots y la persona');
  msgs.length = 0;
  assert.equal(off.update(100), 1);
  assert.equal(msgs.filter((m) => m.t === 's').length, 1);
  off.send({ t: 'spawn', name: '<b>Ana</b>', color: 2 });
  assert.equal(msgs.find((m) => m.t === 'me').alive, true);
  assert.equal(off.me.name, 'bAna/b');
  const mirror = new Mirror(120);
  let kos = 0;
  for (let i = 0; i < 400; i++) {
    for (const m of msgs.splice(0)) {
      if (m.t === 's') {
        mirror.apply(m);
        mirror.applyTerritory(m);
      } else if (m.t === 'ko') kos++;
    }
    off.update(100);
  }
  for (const m of msgs.splice(0)) if (m.t === 's') (mirror.apply(m), mirror.applyTerritory(m));
  const w = off.w;
  const win = off.viewer.win;
  for (let y = win[1]; y <= win[3]; y++) for (let x = win[0]; x <= win[2]; x++) assert.equal(mirror.owner[y * 120 + x], w.owner[y * 120 + x]);
  assert.ok(w.tick >= 550, 'el reloj avanza en pasos fijos de 100 ms (más los 150 de arranque)');
  void kos;
});

test('OfflineSession: update() nunca avanza más de 2 o 3 pasos de golpe (una pestaña dormida no acelera el mundo)', () => {
  const off = new OfflineSession({ level: 'easy', emit: () => {}, seed: 2 });
  const t0 = off.w.tick;
  const n = off.update(60_000);
  assert.ok(n <= 3);
  assert.equal(off.w.tick - t0, n);
});

test('OfflineSession: avisa la muerte de la persona con el motivo y quién fue', () => {
  const msgs = [];
  const off = new OfflineSession({ level: 'easy', emit: (m) => msgs.push(m), seed: 9, name: 'Ana', color: 1 });
  off.send({ t: 'spawn', name: 'Ana', color: 1 });
  // sin tocar nada la persona sale al centro y tarde o temprano muere (pared, estela de un bot…)
  for (let i = 0; i < 2000 && !msgs.some((m) => m.t === 'dead'); i++) off.update(100);
  const dead = msgs.find((m) => m.t === 'dead');
  assert.ok(dead, 'murió');
  assert.ok(['self', 'wall', 'cut', 'head', 'lost'].includes(dead.stats.why));
  assert.equal(typeof dead.stats.peak, 'number');
  assert.ok(dead.stats.peak >= 25);
  // reaparecer: antes de los 3 s el mundo avisa cuánto falta
  msgs.length = 0;
  off.send({ t: 'spawn', name: 'Ana', color: 1 });
  const me = msgs.find((m) => m.t === 'me');
  assert.equal(me.alive, false);
  assert.ok(me.wait > 0 && me.wait <= CFG.respawnSec * 1000);
});
