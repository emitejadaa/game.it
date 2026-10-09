/** Rey de la Colina, lógica pura del cliente: entrada, vista, predicción con paredes, colina que se muda, resultados y modo sin conexión (con latencia simulada). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysVector, stickVector, MoveGate, fitView, hillAt, matchLeft, resultRows, formatTime, sanitizeName, ownFromEntry, cloneOwn, ownPos, stepOwn, OfflineSession, CTRL, MOVE_STILL, encodeMove } from '../public/games/rey/logic.js';
import { World, CFG, PH, PALETTE } from '../public/games/rey/shared/world.js';
import { brain, think, BOT_NAMES, OFFLINE_LEVELS } from '../public/games/rey/shared/bots.js';
import { Viewer } from '../public/games/rey/shared/sync.js';
import { Predictor } from '../public/shared/net/predict.js';
import { newDisc } from '../public/shared/arena-physics.js';

const base = { World, brain, think, Viewer, botNames: BOT_NAMES, colors: PALETTE.length, snapEvery: 2, meExtra: (w) => ({ half: CFG.half, r: CFG.discR, tps: w.tps }) };

test('keysVector y stickVector: opuestas se anulan, zona muerta y módulo <= 1', () => {
  assert.deepEqual(keysVector({ left: true, right: true, up: true }), [0, -1]);
  assert.deepEqual(keysVector({}), [0, 0]);
  assert.deepEqual(stickVector(3, 3), [0, 0], 'dentro de la zona muerta');
  const [x, y] = stickVector(200, 0);
  assert.ok(Math.abs(x - 1) < 1e-9 && y === 0);
  const [a, b] = stickVector(80, 80);
  assert.ok(Math.hypot(a, b) <= 1 + 1e-9);
});

test('MoveGate: soltar se manda ya, lo demás espaciado y sin repetir', () => {
  const g = new MoveGate(50);
  assert.equal(g.poll(0, 0, 0), -1, 'quieto y sigue quieto');
  const c = g.poll(1000, 1, 0);
  assert.equal(c, encodeMove(1, 0));
  assert.equal(g.poll(1010, 0, 1), -1, 'muy pronto');
  assert.equal(g.poll(1060, 0, 1), encodeMove(0, 1));
  assert.equal(g.poll(1061, 0, 0), MOVE_STILL, 'soltar no espera');
});

test('fitView: la arena cuadrada entra entera dejando libres los 56 px de arriba', () => {
  for (const [w, h] of [[360, 740], [390, 844], [1280, 720], [844, 390], [1920, 1080]]) {
    const v = fitView(w, h, CFG.half * 1.02, { top: 56, bottom: w < 600 ? 70 : 0, pad: 12 });
    const top = v.cy - CFG.half * v.s;
    assert.ok(top >= 56 - 1e-6, `${w}x${h}: arriba ${top}`);
    assert.ok(v.cx - CFG.half * v.s >= 0 && v.cx + CFG.half * v.s <= w, `${w}x${h}: ancho`);
    assert.ok(v.cy + CFG.half * v.s <= h + 1e-6, `${w}x${h}: alto`);
  }
});

test('hillAt: avisa en los últimos 3 s y, pasada la mudanza, el punto actual ya es el destino', () => {
  const ri = { k: 100, hill: 0, next: 2, hillIn: 200 };
  assert.deepEqual(hillAt(ri, 100), { at: 0, to: 2, in: 200, warn: false });
  assert.equal(hillAt(ri, 100 + 109).warn, false);
  assert.equal(hillAt(ri, 100 + 111).warn, true, 'faltan 89 pasos (< 3 s)');
  assert.equal(hillAt(ri, 100 + 111).at, 0);
  const moved = hillAt(ri, 100 + 200);
  assert.equal(moved.at, 2);
  assert.equal(moved.warn, false);
});

test('matchLeft y formatTime: segundos enteros hacia arriba, nunca negativos', () => {
  assert.equal(matchLeft(180 * 30, 0), 180);
  assert.equal(matchLeft(180 * 30, 1000), 179);
  assert.equal(matchLeft(10, 5000), 0);
  assert.equal(formatTime(179), '2:59');
  assert.equal(formatTime(-3), '0:00');
});

test('resultRows: los primeros y, si quien mira quedó afuera, su fila al final', () => {
  const top = [[1, 100], [2, 80], [3, 60], [4, 40], [5, 30], [6, 10]];
  assert.equal(resultRows(top, 2).length, 5);
  const r = resultRows(top, 6);
  assert.equal(r.length, 6);
  assert.deepEqual(r[5], { rank: 6, num: 6, score: 10 });
  assert.equal(resultRows(top, 99).length, 5);
});

test('sanitizeName: sin controles ni < >, acotado', () => {
  assert.equal(sanitizeName('  <b>Ana\u0007</b>  '), 'bAna/b');
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
  assert.equal(sanitizeName(null), '');
});

test('stepOwn: la predicción rebota en las paredes igual que el mundo', () => {
  const p = newDisc({ r: CFG.discR, x: CFG.half - 20, y: 0, vx: 300, vy: 0 });
  stepOwn(p, [], 1);
  assert.ok(p.x <= CFG.half - CFG.discR + 1e-9);
  assert.ok(p.vx < 0, 'rebotó');
});

/** Un cliente mínimo con la lógica de game.js (Predictor + ownFromEntry) conectado a un mundo local por una red de `oneWay` pasos de ida y de vuelta. */
function runClient({ oneWay, steps = 360, seed = 7 }) {
  const msgs = [];
  const s = new OfflineSession({ ...base, level: OFFLINE_LEVELS[0], name: 'Ana', color: 1, seed, emit: (m) => msgs.push(m) });
  const tickMs = 1000 / 30;
  const pr = new Predictor({ step: (st, h, t) => stepOwn(st, h, t), clone: cloneOwn, pos: ownPos, smoothMs: 150, snapDist: 40 });
  pr.seq = 5e9;
  const toServer = [];
  const toClient = [];
  let now = 0;
  let errSum = 0;
  let errMax = 0;
  let errN = 0;
  let snaps = 0;
  let sent = 0;
  let snapped = 0;
  for (let step = 0; step < steps; step++) {
    now += tickMs;
    while (toServer.length && toServer[0].at <= now) s.send({ t: 'i', e: toServer.shift().e });
    s.update(tickMs);
    for (const m of msgs.splice(0)) if (m.t === 's') toClient.push({ at: now + oneWay * tickMs, m });
    while (toClient.length && toClient[0].at <= now) {
      const { m } = toClient.shift();
      const mine = m.h.find((e) => e[0] === s.me.num);
      if (mine && m.o) {
        const ack = Number(m.a) || 0;
        const r = pr.reconcile(ownFromEntry(mine, m.o, ack, CFG.discR), m.k, ack, now);
        snaps++;
        if (r.snapped) snapped++;
        if (snaps > 6 && m.r[0] === PH.play) {
          errSum += r.err;
          errMax = Math.max(errMax, r.err);
          errN++;
        }
      }
    }
    if (pr.state) {
      pr.advanceTo(s.w.tick - oneWay + 2 * oneWay + 1);
      // cada 11 pasos cambia el rumbo; a veces un Empujón o una Onda
      if (step % 11 === 0 && step > 20) {
        // se queda en el centro (lejos de los pozos) yendo y viniendo
        const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        const [dx, dy] = pr.state.x > 110 ? [-1, 0] : pr.state.x < -110 ? [1, 0] : pr.state.y > 60 ? [0, -1] : pr.state.y < -110 ? [0, 1] : dirs[(step / 11) & 3];
        const b = step % 55 === 0 ? 1 : step % 77 === 0 ? 2 : 0;
        const ev = pr.record({ d: encodeMove(dx, dy), b }, pr.tick + 1);
        sent++;
        toServer.push({ at: now + oneWay * tickMs, e: [[ev.s, ev.k, ev.d, ev.b]] });
      }
    }
  }
  return { errMean: errN ? errSum / errN : 0, errMax, sent, snaps, snapped };
}

test('predicción: con 0, 3 y 5 pasos de ida (0 / 200 / 330 ms) el error medio contra el mundo real es de pocos píxeles y casi no hay saltos', () => {
  for (const oneWay of [0, 3, 5]) {
    const r = runClient({ oneWay });
    assert.ok(r.sent > 15, `ida ${oneWay}: mandó ${r.sent}`);
    assert.ok(r.snaps > 80, `ida ${oneWay}: ${r.snaps} snapshots`);
    // con bots chocando el error puntual sube, pero el promedio tiene que ser chico
    assert.ok(r.errMean < 12, `ida ${oneWay}: error medio ${r.errMean.toFixed(2)} px`);
    assert.ok(r.snapped <= 0.25 * r.snaps, `ida ${oneWay}: ${r.snapped}/${r.snaps} saltos`);
  }
});

test('predicción: el disco propio responde en el mismo paso aunque el servidor esté a 330 ms', () => {
  const pr = new Predictor({ step: (st, h, t) => stepOwn(st, h, t), clone: cloneOwn, pos: ownPos });
  pr.reset(ownFromEntry([1, 0, 0, 0, 0, 7], [0, 0, 0, MOVE_STILL, MOVE_STILL, 0], 0, CFG.discR), 100);
  pr.advanceTo(110);
  const x0 = pr.peek().x;
  pr.record({ d: encodeMove(1, 0), b: 0 }, pr.tick + 1);
  assert.ok(pr.peek().x > x0 + 0.1, 'el paso siguiente ya se mueve: no se espera al servidor');
  pr.advanceTo(pr.tick + 10);
  assert.ok(pr.state.x > 5, 'después de 10 pasos avanzó');
});

test('predicción: la Onda propia arranca la recarga de 6 s en el mismo paso', () => {
  const pr = new Predictor({ step: (st, h, t) => stepOwn(st, h, t), clone: cloneOwn, pos: ownPos });
  pr.reset(ownFromEntry([1, 0, 0, 0, 0, 7], [0, 0, 0, MOVE_STILL, MOVE_STILL, 0], 0, CFG.discR), 100);
  pr.advanceTo(105);
  pr.record({ d: MOVE_STILL, b: 2 }, pr.tick + 1);
  pr.advanceTo(pr.tick + 2);
  assert.ok(pr.state.waveCd > CTRL.waveCd - 4);
});

test('modo sin conexión: mismos mensajes que el servidor, bots a la colina y la persona nace', () => {
  const msgs = [];
  const s = new OfflineSession({ ...base, level: OFFLINE_LEVELS[2], name: 'Ana', color: 3, seed: 5, emit: (m) => msgs.push(m) });
  assert.ok(msgs.some((m) => m.t === 'reset') && msgs.some((m) => m.t === 'pl') && msgs.some((m) => m.t === 'me'));
  assert.equal(OFFLINE_LEVELS.map((l) => l.bots).join(), '4,6,8');
  assert.equal(s.me.alive, true, 'con ready nace al instante');
  const me = msgs.find((m) => m.t === 'me');
  assert.equal(me.half, CFG.half);
  // 30 s de juego: hay snapshots a 15 Hz, el ranking sale cada segundo y alguien puntúa
  msgs.length = 0;
  for (let i = 0; i < 30 * 30; i++) s.update(1000 / 30);
  const snaps = msgs.filter((m) => m.t === 's');
  assert.ok(snaps.length >= 440 && snaps.length <= 460, `${snaps.length} snapshots en 30 s`);
  assert.ok(msgs.filter((m) => m.t === 'lb').length >= 29);
  const lb = msgs.filter((m) => m.t === 'lb').pop().l;
  assert.ok(lb.some((r) => r[1] > 0), 'algún bot sumó puntos en la colina');
});

test('modo sin conexión: si la persona cae en un pozo recibe dead, espera 2 s y reaparece al pedirlo', () => {
  const msgs = [];
  const s = new OfflineSession({ ...base, level: OFFLINE_LEVELS[0], name: 'Ana', color: 3, seed: 2, emit: (m) => msgs.push(m) });
  const [px, py] = CFG.pits[0];
  Object.assign(s.me, { x: px, y: py, vx: 0, vy: 0 });
  s.update(100);
  const dead = msgs.find((m) => m.t === 'dead');
  assert.ok(dead, 'llegó el aviso de caída');
  assert.equal(s.me.alive, false);
  s.send({ t: 'spawn', name: 'Ana', color: 3 });
  assert.equal(s.me.alive, false, 'todavía no pasaron los 2 s');
  const wait = msgs.filter((m) => m.t === 'me').pop();
  assert.ok(wait.wait > 0 && wait.wait <= 2000, `espera ${wait.wait} ms`);
  for (let i = 0; i < 24; i++) s.update(100); // la sesión recorta los saltos de reloj grandes: 2,4 s en pasos de 100 ms
  s.send({ t: 'spawn', name: 'Ana', color: 3 });
  assert.equal(s.me.alive, true);
});

test('modo sin conexión: una partida entera termina con resultado y arranca otra', () => {
  const msgs = [];
  const s = new OfflineSession({ ...base, level: OFFLINE_LEVELS[2], name: 'Ana', color: 3, seed: 9, emit: (m) => msgs.push(m) });
  for (let i = 0; i < 30 * (CFG.matchSec + CFG.overSec + 8); i++) s.update(1000 / 30);
  const res = msgs.filter((m) => m.t === 's' && m.res).map((m) => m.res);
  assert.ok(res.length >= 1, 'al menos un resultado');
  assert.ok(res[0][2].length >= 1);
  const last = msgs.filter((m) => m.t === 's').pop();
  assert.equal(last.r[1], 2, 'ya va por la segunda partida');
});
