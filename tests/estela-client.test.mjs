/** Estela, lógica pura del cliente: giros, gestos, recorte de estelas, estado propio, puntaje estimado, modo sin conexión y predicción contra el mundo local con latencia simulada. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalTurn, effectiveDir, swipeDir, dirOf, fitCell, trimPath, trailPoints, ownFromBike, cloneOwn, ownPos, OwnTracker, estimateScore, formatTime, sanitizeName, LEVELS, OfflineSession } from '../public/games/estela/logic.js';
import { CFG, stepOwn } from '../public/games/estela/shared/world.js';
import { Mirror } from '../public/games/estela/shared/sync.js';
import { Predictor } from '../public/shared/net/predict.js';
import { SnapshotBuffer } from '../public/shared/net/interp.js';

test('legalTurn: nada de vuelta en U ni de "doblar" hacia donde ya va', () => {
  for (let cur = 0; cur < 4; cur++) {
    assert.equal(legalTurn(cur, cur), false);
    assert.equal(legalTurn(cur, (cur + 2) & 3), false);
    assert.equal(legalTurn(cur, (cur + 1) & 3), true);
    assert.equal(legalTurn(cur, (cur + 3) & 3), true);
  }
  assert.equal(legalTurn(0, -1), false);
  assert.equal(legalTurn(0, 4), false);
  assert.equal(legalTurn(0, 1.5), false);
});

test('effectiveDir: cuenta los giros ya pedidos que el mundo todavía no ejecutó', () => {
  const st = { dir: 0, seq: 5 };
  assert.equal(effectiveDir(st, []), 0);
  assert.equal(effectiveDir(st, [{ s: 6, k: 10, d: 1, b: 0 }]), 1);
  assert.equal(effectiveDir(st, [{ s: 5, k: 9, d: 3, b: 0 }]), 0, 'una entrada ya aplicada no cuenta');
  // derecha y después abajo (los dos pendientes): lo que sigue se valida contra "abajo"
  assert.equal(effectiveDir(st, [{ s: 6, k: 10, d: 1, b: 0 }, { s: 7, k: 10, d: 2, b: 0 }]), 2);
  // un giro ilegal en la cola no cambia nada (el servidor tampoco lo aplica)
  assert.equal(effectiveDir(st, [{ s: 6, k: 10, d: 2, b: 0 }]), 0);
  // un cambio de turbo (d = -1) no gira
  assert.equal(effectiveDir(st, [{ s: 6, k: 10, d: -1, b: 1 }]), 0);
});

test('swipeDir: eje dominante, con un mínimo; dirOf traduce GameIt.dir', () => {
  assert.equal(swipeDir(40, 5), 1);
  assert.equal(swipeDir(-40, 5), 3);
  assert.equal(swipeDir(3, 60), 2);
  assert.equal(swipeDir(3, -60), 0);
  assert.equal(swipeDir(10, 10), -1, 'muy corto');
  assert.equal(swipeDir(30, 30, 22), 2, 'empate: gana el vertical');
  assert.deepEqual(['up', 'right', 'down', 'left', null, 'x'].map(dirOf), [0, 1, 2, 3, -1, -1]);
});

test('fitCell: lo que cabe en pantalla nunca pasa del cuadro de interés del servidor y la celda es un píxel entero', () => {
  for (const [w, h, dpr] of [[360, 740, 2], [1280, 800, 1], [1920, 1080, 1], [800, 1280, 1.5], [390, 844, 3]]) {
    const c = fitCell(w, h, dpr);
    assert.ok(Number.isInteger(c * dpr + 1e-9) || Math.abs(c * dpr - Math.round(c * dpr)) < 1e-9, `${w}x${h}@${dpr}: ${c}`);
    assert.ok(Math.max(w, h) / c <= 2 * CFG.view, `${w}x${h}: ${Math.max(w, h) / c} celdas > ${2 * CFG.view}`);
    assert.ok(c >= 7 || Math.max(w, h) / 18 > 7);
  }
  assert.equal(fitCell(360, 740, 2), 7, 'celular: 7 px por celda');
});

test('trimPath: recorta la estela por la cabeza (dentro de un tramo y pasando esquinas) y la estira hacia adelante', () => {
  const mk = () => [0, 0, 10, 0, 10, 5]; // derecha 10, abajo 5; cabeza en (10, 5)
  let p = mk();
  assert.equal(trimPath(p, 0, 2), 6);
  assert.deepEqual(p, mk());
  p = mk();
  assert.equal(trimPath(p, 2, 2), 6);
  assert.deepEqual(p, [0, 0, 10, 0, 10, 3], 'dentro del último tramo');
  p = mk();
  assert.equal(trimPath(p, 5, 2), 4);
  assert.deepEqual(p.slice(0, 4), [0, 0, 10, 0], 'justo en la esquina: la cabeza queda en ella');
  p = mk();
  const n = trimPath(p, 7, 2);
  assert.equal(n, 4, 'se pasó la esquina: queda un punto menos');
  assert.deepEqual(p.slice(0, 4), [0, 0, 8, 0]);
  p = mk();
  assert.equal(trimPath(p, -1.5, 2), 6);
  assert.deepEqual(p, [0, 0, 10, 0, 10, 6.5], 'estirar en la misma dirección mueve la cabeza');
  p = mk();
  assert.equal(trimPath(p, -2, 1), 8);
  assert.deepEqual(p, [0, 0, 10, 0, 10, 5, 12, 5], 'si la dirección es otra, se agrega un tramo');
  p = [4, 4];
  assert.equal(trimPath(p, 3, 1), 2, 'una sola celda: no hay nada que recortar');
});

test('trailPoints + trimPath: la cabeza dibujada entre dos pasos avanza una celda por paso de manera continua', () => {
  const verts = [3, 3, 8, 3]; // derecha desde (3,3), dobla en (8,3) hacia abajo
  const heads = [];
  for (let f = 0; f <= 1.0001; f += 0.25) {
    const pts = trailPoints(verts, 8, 6, 20, []);
    const n = trimPath(pts, (1 - f) * 1, 2); // el snapshot trae la cabeza en (8,6): falta (1 - f) celdas
    heads.push([pts[n - 2], pts[n - 1]]);
  }
  assert.deepEqual(heads.map((h) => h[1]), [5, 5.25, 5.5, 5.75, 6]);
  assert.ok(heads.every((h) => h[0] === 8));
});

test('ownFromBike / cloneOwn / ownPos: arman el estado que simula stepOwn', () => {
  const bike = { num: 7, x: 20, y: 30, dir: 1, D: 55, len: 40, flags: 1, verts: [10, 30, 20, 30] };
  const o = [64, 80, 1, 0, 3, 0];
  const s = ownFromBike(bike, o, 12, 1);
  assert.deepEqual({ ...s, verts: undefined }, { x: 20, y: 30, dir: 1, D: 55, len: 40, cap: 80, verts: undefined, turboWant: 1, turbo: 1, lock: 0, energy: 64, frac: 1, shield: 0, seq: 12 });
  assert.notEqual(s.verts, bike.verts, 'copia: el espejo se sigue modificando');
  const c = cloneOwn(s);
  c.verts.push(1, 1);
  assert.equal(s.verts.length, 4);
  const out = {};
  ownPos(s, out);
  assert.deepEqual(out, { x: 20, y: 30 });
});

test('estimateScore y formatTime', () => {
  assert.equal(estimateScore({ banked: 100, lifeTicks: 45, tps: 20, kos: 2, len: 33 }), 100 + 2 + 20 + 33);
  assert.equal(estimateScore({}), 0);
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(75.4), '1:15');
  assert.equal(formatTime(-3), '0:00');
});

test('sanitizeName: sin < > ni controles', () => {
  assert.equal(sanitizeName('<b>Ana</b>\n'), 'bAna/b');
  assert.equal(sanitizeName('x'.repeat(30)).length, 16);
});

// ---------------------------------------------------------------- sin conexión
const collect = (opts = {}) => {
  const msgs = [];
  const s = new OfflineSession({ seed: 7, ...opts, emit: (m) => msgs.push(m) });
  return { s, msgs, of: (t) => msgs.filter((m) => m.t === t) };
};

test('sin conexión: tres niveles con más bots y cerebros más fuertes', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ['easy', 'normal', 'hard']);
  const counts = LEVELS.map((l) => collect({ level: l.id }).s.bots.length);
  assert.deepEqual(counts, [6, 9, 11]);
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
  const hard = collect({ level: 'hard' }).s;
  assert.ok([...hard.brains.values()].some((b) => b.level === 3), 'difícil: hay bots de nivel 3');
  const easy = collect({ level: 'easy' }).s;
  assert.ok([...easy.brains.values()].every((b) => b.level <= 2));
  assert.equal(collect({ level: 'nada' }).s.bots.length, 9, 'un nivel desconocido cae en normal');
});

test('sin conexión: manda los mismos mensajes de arranque que el servidor (reset, pl, me, lb) y espera el spawn', () => {
  const { msgs, s } = collect({ level: 'normal' });
  assert.deepEqual(msgs.map((m) => m.t), ['reset', 'pl', 'me', 'lb']);
  const me = msgs[2];
  assert.equal(me.alive, false);
  assert.equal(me.size, 160);
  assert.equal(me.tps, 20);
  assert.equal(me.wait, 0);
  assert.equal(msgs[1].p.length, 9 + 1, 'los bots y yo');
  assert.equal(s.update(50), 1);
  assert.equal(msgs.at(-1).t, 's');
  assert.equal(msgs.at(-1).h.every((e) => e[0] !== me.num), true, 'sin spawn no hay moto propia');
});

test('sin conexión: spawn con nombre y color saneados; la moto propia va primera en cada snapshot y trae a / o', () => {
  const { s, msgs, of } = collect({ name: 'Ana' });
  s.send({ t: 'spawn', name: '<b>Beto</b>', color: 5 });
  assert.equal(of('me').at(-1).alive, true);
  assert.equal(s.me.name, 'bBeto/b');
  assert.equal(s.me.color, 5);
  s.update(50);
  const snap = msgs.at(-1);
  assert.equal(snap.h[0][0], s.me.num);
  assert.ok(snap.o && snap.o[1] === CFG.capStart);
  assert.equal(typeof snap.a, 'number');
  // un color o nombre inválidos no rompen nada
  s.send({ t: 'spawn', name: 5, color: 99 });
});

test('sin conexión: dos pasos de tiempo avanzan dos pasos de mundo y un salto grande no lo acelera', () => {
  const { s } = collect();
  const k0 = s.w.tick;
  assert.equal(s.update(100), 2);
  assert.equal(s.w.tick, k0 + 2);
  assert.equal(s.update(10_000), 5, 'tope de 250 ms de atraso');
  assert.equal(s.update(20), 0, 'todavía no se cumple un paso');
  assert.equal(s.update(35), 1, 'el resto se acumula');
});

test('sin conexión: sin tocar nada la moto choca, llega `dead` con estadísticas y reaparecer exige esperar 2,5 s', () => {
  const { s, msgs, of } = collect({ level: 'easy' });
  s.send({ t: 'spawn', name: 'Ana', color: 2 });
  let died = null;
  for (let i = 0; i < 600 && !died; i++) {
    s.update(50);
    died = of('dead')[0];
  }
  assert.ok(died, 'una moto que va derecho termina chocando');
  assert.equal(typeof died.stats.score, 'number');
  assert.ok(died.stats.time >= 0 && died.stats.len >= 1);
  const before = of('me').length;
  s.send({ t: 'spawn', name: 'Ana', color: 2 });
  const me = of('me').at(-1);
  assert.equal(of('me').length, before + 1);
  assert.equal(me.alive, false);
  assert.ok(me.wait > 0 && me.wait <= 2500, `espera ${me.wait}`);
  for (let i = 0; i < 60; i++) s.update(50);
  s.send({ t: 'spawn', name: 'Ana', color: 2 });
  assert.equal(of('me').at(-1).alive, true, 'pasó la espera');
  assert.ok(msgs.length > 100);
});

test('sin conexión: una persona con entradas válidas se mueve y el ack coincide con lo aplicado', () => {
  const { s, msgs } = collect();
  s.send({ t: 'spawn', name: 'Ana', color: 0 });
  s.update(50);
  const k = s.w.tick;
  const d0 = s.me.dir;
  const turn = (d0 + 1) & 3;
  s.send({ t: 'i', e: [[1, k + 1, turn, 0]] });
  s.update(100);
  assert.equal(s.me.dir, turn);
  assert.equal(msgs.at(-1).a, 1);
  // entradas mal formadas no rompen
  s.send({ t: 'i', e: 'hola' });
  s.send({ t: 'i', e: [[2, 0, 9, 0]] });
  s.update(50);
  assert.equal(s.me.dir, turn);
});

// ---------------------------------------------------------------- predicción + interpolación contra el mundo local con latencia
/**
 * Un "cliente" mínimo con la misma lógica que game.js (espejo, OwnTracker, Predictor, SnapshotBuffer) conectado a un mundo
 * local por una red simulada de `oneWay` pasos de ida y de vuelta. Devuelve cuánto se desvió la predicción del mundo real.
 */
function runClient({ oneWay, steps = 400, seed = 11 }) {
  const msgs = [];
  const s = new OfflineSession({ level: 'normal', seed, emit: (m) => msgs.push(m) });
  s.send({ t: 'spawn', name: 'Ana', color: 1 });
  const tickMs = 50;
  const mirror = new Mirror();
  const pr = new Predictor({ step: (st, h, t) => stepOwn(st, h, t, 160), clone: cloneOwn, pos: ownPos, smoothMs: 120, snapDist: 6 });
  pr.seq = 5e9;
  const own = new OwnTracker(pr);
  const buf = new SnapshotBuffer({ delay: 80, extrapolate: ['D'] });
  const toServer = []; // { at, e }
  const toClient = []; // { at, m }
  let now = 0;
  let sent = 0;
  let errMax = 0;
  let errSum = 0;
  let errN = 0;
  let snaps = 0;
  let lead = 0;
  for (let step = 0; step < steps; step++) {
    now += tickMs;
    // entradas que llegan al servidor
    while (toServer.length && toServer[0].at <= now) s.send({ t: 'i', e: toServer.shift().e });
    s.update(tickMs);
    const out = msgs.splice(0);
    for (const m of out) if (m.t === 's') toClient.push({ at: now + oneWay * tickMs, m });
    // snapshots que llegan al cliente
    while (toClient.length && toClient[0].at <= now) {
      const { m } = toClient.shift();
      const bikes = mirror.apply(m);
      buf.push(m.k * tickMs, bikes.filter((b) => b.num !== s.me.num).map((b) => ({ id: b.num, x: b.x, y: b.y, D: b.D })), now);
      const mine = bikes.find((b) => b.num === s.me.num);
      if (mine && m.o) {
        const r = own.apply(mine, m.o, Number(m.a) || 0, m.k, now);
        snaps++;
        if (snaps > 5) {
          errMax = Math.max(errMax, r.err);
          errSum += r.err;
          errN++;
        }
      }
    }
    // el cliente va adelantado un viaje de ida y vuelta (más un margen)
    if (pr.state) {
      lead = oneWay * 2 + 1;
      pr.advanceTo(s.w.tick - oneWay + lead);
      // cada 7 pasos pide un giro legal
      if (step % 7 === 0 && step > 20) {
        const cur = pr.state.dir;
        const d = (cur + (step % 14 === 0 ? 1 : 3)) & 3;
        const near = pr.state.x < 30 || pr.state.y < 30 || pr.state.x > 130 || pr.state.y > 130;
        const pick = near ? ((cur + 1) & 3) : d;
        const ev = pr.record({ d: pick, b: step % 21 === 0 ? 1 : 0 }, pr.tick + 1);
        sent++;
        toServer.push({ at: now + oneWay * tickMs, e: [[ev.s, ev.k, ev.d, ev.b]] });
      }
    }
  }
  return { errMax, errMean: errN ? errSum / errN : 0, sent, snaps, alive: s.me.alive, buf };
}

test('predicción: contra un mundo local con 0, 3 y 5 pasos de ida (0 / 300 / 500 ms de ping) el error de reconciliación es casi nulo', () => {
  for (const oneWay of [0, 1, 3, 5]) {
    const r = runClient({ oneWay, steps: 300 });
    assert.ok(r.sent > 15, `ida ${oneWay}: mandó ${r.sent} entradas`);
    assert.ok(r.snaps > 100, `ida ${oneWay}: ${r.snaps} snapshots`);
    assert.ok(r.errMean < 1.2, `ida ${oneWay}: error medio ${r.errMean.toFixed(2)} celdas`);
  }
});

test('predicción: la moto propia responde en el mismo paso aunque el servidor esté a 500 ms', () => {
  const pr = new Predictor({ step: (st, h, t) => stepOwn(st, h, t, 160), clone: cloneOwn, pos: ownPos });
  const bike = { x: 50, y: 50, dir: 1, D: 0, len: 1, flags: 0, verts: [50, 50] };
  pr.reset(ownFromBike(bike, [80, 60, 0, 0, 0, 0], 0, 0), 100);
  pr.advanceTo(110); // va adelantada diez pasos (un RTT de 500 ms)
  const before = pr.peek().dir;
  assert.equal(before, 1);
  const ev = pr.record({ d: 2, b: 0 }, pr.tick + 1);
  assert.equal(ev.k, 111);
  assert.equal(pr.peek().dir, 2, 'el paso siguiente ya gira: no se espera al servidor');
  assert.equal(effectiveDir(pr.state, pr.history), 2);
  assert.equal(legalTurn(effectiveDir(pr.state, pr.history), 0), false, 'ahora subir sería una vuelta en U');
});
