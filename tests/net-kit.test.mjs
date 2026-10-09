/** Kit de red del cliente (public/shared/net): relojes, interpolación, predicción, entradas y chip de estado. Todo puro, sin DOM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Clock, Pinger, ArrivalClock } from '../public/shared/net/clock.js';
import { SnapshotBuffer } from '../public/shared/net/interp.js';
import { Predictor } from '../public/shared/net/predict.js';
import { InputSender } from '../public/shared/net/input.js';
import { chipModel, pingLevel } from '../public/shared/net/status.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// ---------------------------------------------------------------- clock.js
test('Clock: se queda con la muestra de menor RTT para el desfase', () => {
  const c = new Clock();
  // servidor = local + 1000. Primera muestra con cola de ida (RTT 200, asimétrica), segunda limpia (RTT 80)
  c.sample(0, 200, 1000 + 160); // mala: el servidor respondió a los 160 ms locales
  assert.equal(c.rtt, 200);
  c.sample(1000, 1080, 1000 + 1040);
  assert.equal(c.rtt, 80);
  near(c.offset, 1000); // serverNow + rtt/2 - recv = 2040 + 40 - 1080
  near(c.serverNow(5000), 6000);
  assert.ok(c.ready);
  assert.ok(c.jitter > 0);
});

test('Clock: descarta muestras inválidas y envejece las viejas', () => {
  const c = new Clock({ keep: 3, maxAge: 1000 });
  assert.equal(c.sample(10, 5, 0), false, 'RTT negativo');
  assert.equal(c.sample(0, 10, NaN), false);
  c.sample(0, 50, 100); // RTT 50 (la mejor), pero vieja
  c.sample(5000, 5120, 5200);
  assert.equal(c.rtt, 120, 'la muestra de 50 ms ya venció');
  c.sample(5200, 5400, 5300);
  c.sample(5400, 5600, 5500);
  c.sample(5600, 5790, 5700);
  assert.equal(c.samples.length, 3);
});

test('Pinger: ráfaga de 5 al abrir y después uno cada `every`; el pong alimenta al reloj', () => {
  const sent = [];
  const timers = [];
  let t = 0;
  const p = new Pinger({
    send: (m) => sent.push(m),
    clock: new Clock(),
    now: () => t,
    timers: { set: (fn, ms) => (timers.push({ fn, ms }), timers.length), clear() {} },
  });
  p.start();
  for (let i = 0; i < 6; i++) {
    t += 10;
    timers[timers.length - 1].fn();
  }
  assert.equal(sent.length, 7);
  assert.deepEqual(timers.slice(0, 7).map((x) => x.ms), [200, 200, 200, 200, 3000, 3000, 3000]);
  assert.equal(sent[0].t, 'ping');
  t = 100;
  assert.equal(p.pong({ t: 'pong', c: 40, now: 5000 }), true);
  assert.equal(p.clock.rtt, 60);
  assert.equal(p.pong({ t: 'pong', now: 1 }), false, 'un pong sin eco no sirve (servidor viejo)');
});

test('ArrivalClock: mínimo de la ventana, jitter y resincronización tras un hueco', () => {
  const a = new ArrivalClock({ bucketMs: 100, buckets: 3, resyncMs: 300 });
  // snapshots cada 50 ms con 100 ms de latencia base y algo de jitter
  for (let k = 0; k < 40; k++) a.observe(k * 50, k * 50 + 100 + (k % 4) * 10);
  near(a.base, 100);
  assert.ok(a.jitter > 0 && a.jitter < 40);
  near(a.serverTimeAt(2100), 2000);
  near(a.leadTimeAt(2100, 160, 50), 2000 + 160 + 50);
  // un corte largo (pestaña oculta): llega algo 1 s tarde
  a.observe(40 * 50, 40 * 50 + 1100);
  near(a.base, 1100, 1e-6);
});

// ---------------------------------------------------------------- interp.js
const ent = (id, x, a = 0) => ({ id, x, y: x * 2, a });

test('SnapshotBuffer: interpola por id entre dos snapshots y toma lo no numérico del más nuevo', () => {
  const b = new SnapshotBuffer({ delay: 100, minDelay: 100 });
  b.push(0, [{ ...ent(1, 0), name: 'A' }, ent(2, 10)], 1000);
  b.push(50, [{ ...ent(1, 10), name: 'B' }, ent(3, 5)], 1050);
  b.push(100, [ent(1, 20)], 1100);
  // la hora de render es 100 ms antes de lo último llegado sin demora (serverTime 100 → local 1100): rt = 0 + 25
  const s = b.sample(1125);
  assert.equal(s.extrapolated, false);
  near(s.time, 25);
  const e1 = s.entities.find((e) => e.id === 1);
  near(e1.x, 5);
  near(e1.y, 10);
  assert.equal(e1.name, 'B');
  assert.ok(s.entities.find((e) => e.id === 3), 'las que aparecen entran tal cual');
  assert.ok(!s.entities.find((e) => e.id === 2), 'las que no están en el snapshot nuevo salen');
});

test('SnapshotBuffer: los ángulos van por el camino corto', () => {
  const b = new SnapshotBuffer({ delay: 50, minDelay: 50, angles: ['a'] });
  b.push(0, [ent(1, 0, 3.0)], 0);
  b.push(100, [ent(1, 0, -3.0)], 100);
  b.push(200, [ent(1, 0, -3.0)], 200);
  const e = b.sample(100).entities[0]; // rt = 100 - 50 = 50 → mitad del primer par
  const wrapped = 3.0 + ((-3.0 - 3.0 + 2 * Math.PI) % (2 * Math.PI)) * 0.5; // pasa por π, no por 0
  near(e.a, wrapped, 1e-9);
  assert.ok(Math.abs(e.a) > 3, 'no cruza por cero');
});

test('SnapshotBuffer: extrapola con la velocidad hasta 100 ms y después se queda quieto', () => {
  const b = new SnapshotBuffer({ delay: 60, minDelay: 60, extrapolate: ['x'], maxExtrap: 100 });
  b.push(0, [ent(1, 0)], 0);
  b.push(50, [ent(1, 10)], 50); // 0.2 por ms
  const at = (local) => b.sample(local);
  // rt = (local - 0) - 60. Para rt = 80 (30 ms después del último snapshot): x = 10 + 0.2·30 = 16
  let s = at(140);
  assert.equal(s.extrapolated, true);
  near(s.entities[0].x, 16);
  s = at(500); // muy pasado: tope de 100 ms → 10 + 20
  near(s.entities[0].x, 30);
});

test('SnapshotBuffer: descarta snapshots viejos y repetidos, y se resincroniza tras un hueco grande', () => {
  const b = new SnapshotBuffer({ delay: 60, minDelay: 60, maxSnaps: 10 });
  for (let k = 0; k < 100; k++) {
    assert.equal(b.push(k * 50, [ent(1, k)], k * 50 + 100), true);
    b.sample(k * 50 + 100);
  }
  assert.ok(b.snaps.length <= 10);
  assert.equal(b.push(99 * 50, [ent(1, 99)], 9999), false, 'repetido');
  assert.equal(b.push(98 * 50, [ent(1, 98)], 9999), false, 'viejo');
  b.push(99 * 50 + 5000, [ent(1, 500)], 99 * 50 + 5100); // hueco de 5 s
  assert.equal(b.snaps.length, 1);
  b.push(10, [ent(1, 1)], 50000); // el tiempo del servidor volvió atrás (reinició)
  assert.equal(b.snaps.length, 1);
});

test('SnapshotBuffer: el retardo se adapta al jitter y respeta 60 y 250 ms', () => {
  const calm = new SnapshotBuffer({ delay: 40 });
  for (let k = 0; k < 50; k++) calm.push(k * 50, [ent(1, k)], k * 50 + 100);
  assert.equal(calm.delay, 60, 'mínimo');
  const rough = new SnapshotBuffer({ delay: 80 });
  for (let k = 0; k < 200; k++) rough.push(k * 50, [ent(1, k)], k * 50 + 100 + (k % 2 ? 150 : 0));
  assert.ok(rough.delay > 150 && rough.delay <= 250, `delay ${rough.delay}`);
  const awful = new SnapshotBuffer({ delay: 200 });
  for (let k = 0; k < 200; k++) awful.push(k * 50, [ent(1, k)], k * 50 + 100 + (k % 2 ? 280 : 0));
  assert.equal(awful.delay, 250, 'máximo');
});

// ---------------------------------------------------------------- predict.js
// Juego de juguete: una línea; la entrada cambia la velocidad (-1, 0, 1) y el paso avanza x.
const toy = {
  step(s, hist, tick) {
    for (const e of hist) if (e.s > s.seq && e.k <= tick) {
      s.seq = e.s;
      s.v = e.d;
    }
    s.x += s.v;
  },
  clone: (s) => ({ ...s }),
  pos: (s, o) => ((o.x = s.x), (o.y = 0)),
};
const mk = (opts) => new Predictor({ ...toy, step: toy.step, clone: toy.clone, pos: toy.pos, ...opts });

test('Predictor: responde en el paso siguiente sin esperar al servidor', () => {
  const p = mk();
  p.reset({ x: 0, v: 0, seq: 0 }, 10);
  const ev = p.record({ d: 1 }, 11);
  assert.deepEqual([ev.s, ev.k, ev.d], [1, 11, 1]);
  assert.equal(p.peek().x, 1, 'anticipado: el próximo paso ya se mueve');
  assert.equal(p.state.x, 0);
  p.advanceTo(13);
  assert.equal(p.state.x, 3);
  assert.equal(p.tick, 13);
});

test('Predictor: si el servidor aplicó la entrada a tiempo no hay error al reconciliar', () => {
  const p = mk();
  p.reset({ x: 0, v: 0, seq: 0 }, 10);
  p.record({ d: 1 }, 12);
  p.advanceTo(18); // el servidor lleva 5 pasos de atraso
  const server = { x: 4, v: 1, seq: 1 }; // paso 15: aplicó la entrada en el 12 → se movió en los pasos 12..15
  const r = p.reconcile(server, 15, 1, 0);
  assert.equal(r.err, 0);
  assert.equal(r.snapped, false);
  assert.equal(p.state.x, 7);
  assert.equal(p.history.length, 0, 'las confirmadas se descartan');
});

test('Predictor: reaplica las entradas que el servidor todavía no vio y suaviza el error', () => {
  const p = mk({ smoothMs: 100, snapDist: 5 });
  p.reset({ x: 0, v: 0, seq: 0 }, 10);
  p.record({ d: 1 }, 11);
  p.advanceTo(16); // predice x = 6
  assert.equal(p.state.x, 6);
  // el servidor (paso 13) todavía no recibió la entrada (ack 0) y sigue en x = 0
  const r = p.reconcile({ x: 0, v: 0, seq: 0 }, 13, 0, 1000);
  assert.equal(p.state.x, 3, 'reaplica la entrada desde el paso 14 (no desde el 11): x = 3');
  assert.equal(r.err, 3);
  assert.equal(r.snapped, false);
  near(p.errorAt(1000).x, 3); // se sigue dibujando donde estaba
  near(p.errorAt(1050).x, 1.5);
  near(p.errorAt(1200).x, 0);
});

test('Predictor: un error enorme salta directo (snap)', () => {
  const p = mk({ snapDist: 3 });
  p.reset({ x: 0, v: 1, seq: 0 }, 0);
  p.advanceTo(10);
  const r = p.reconcile({ x: -20, v: 1, seq: 0 }, 5, 0, 0);
  assert.equal(r.snapped, true);
  assert.equal(p.errorAt(0).x, 0);
  assert.equal(p.state.x, -15);
});

test('Predictor: si el servidor va adelante del cliente adopta su paso; el historial no crece sin límite', () => {
  const p = mk({ maxHistory: 5 });
  p.reset({ x: 0, v: 0, seq: 0 }, 5);
  for (let i = 0; i < 20; i++) p.record({ d: i % 2 }, 5 + i);
  assert.equal(p.history.length, 5);
  p.reconcile({ x: 40, v: 0, seq: 12 }, 30, 12, 0);
  assert.equal(p.tick, 30);
  assert.equal(p.state.x, 40);
  p.advanceTo(10000);
  assert.ok(p.tick - 30 <= 10000);
  assert.ok(p.tick === 10000);
});

// ---------------------------------------------------------------- input.js
test('InputSender: redundancia de las últimas 3 sin confirmar y keepalive', () => {
  const sent = [];
  let now = 0;
  const tx = new InputSender({ send: (m) => sent.push(m), now: () => now, keepaliveMs: 250 });
  for (let i = 1; i <= 5; i++) tx.push({ s: i, k: 10 + i, d: i % 4, b: 0 });
  assert.deepEqual(sent.at(-1).e.map((e) => e[0]), [3, 4, 5]);
  assert.deepEqual(sent.at(-1).e[2], [5, 15, 1, 0]);
  tx.ack(4);
  tx.push({ s: 6, k: 16, d: 2, b: 1 });
  assert.deepEqual(sent.at(-1).e.map((e) => e[0]), [5, 6], 'la 4 ya está confirmada');
  const n = sent.length;
  now = 100;
  tx.tick(now);
  assert.equal(sent.length, n, 'todavía no toca el keepalive');
  now = 400;
  tx.tick(now);
  assert.equal(sent.length, n + 1);
  assert.equal(sent.at(-1).t, 'i');
  tx.ack(99);
  tx.resend();
  assert.deepEqual(sent.at(-1).e, []);
});

// ---------------------------------------------------------------- status.js
test('chipModel: ping con nivel, reconexión y textos es/en', () => {
  assert.deepEqual(chipModel({ state: 'ok', ping: 42.4, lang: 'es' }), { text: '42 ms', label: 'Conectado', level: 'good', live: false });
  assert.equal(chipModel({ state: 'ok', ping: 0, lang: 'en' }).text, 'Connected');
  assert.equal(chipModel({ state: 'reconnecting', lang: 'es' }).text, 'Reconectando…');
  assert.equal(chipModel({ state: 'reconnecting', lang: 'en' }).text, 'Reconnecting…');
  assert.equal(chipModel({ state: 'reconnecting', lang: 'es' }).live, true);
  assert.equal(chipModel({ state: 'lost', lang: 'fr' }).text, 'Sin conexión', 'idioma desconocido: español');
  assert.deepEqual([60, 120, 250, 400].map(pingLevel), ['good', 'ok', 'warn', 'bad']);
});
