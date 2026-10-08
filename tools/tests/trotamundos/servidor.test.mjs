// Pruebas del módulo online de Trotamundos (server/games/trotamundos.js)  ·  npm test
// Levantan server/index.js como proceso (NODE_ENV=test, tiempos acelerados) y conectan clientes 'ws' reales.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from '../../../server/node_modules/ws/wrapper.mjs';
import { distanceKm, scoreFor, scopeScale, inScope, WORLD_D } from '../../../public/games/trotamundos/shared/geo.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DATOS = join(ROOT, 'public/games/trotamundos/datos');
const readData = (f) => JSON.parse(readFileSync(join(DATOS, f), 'utf8'));
const FAMOSOS = readData('famosos.json');
const MUNDO = readData('mundo.json');
const PAISES = readData('paises.json');
const poolSize = (mode, scope) => (mode === 'famosos' ? FAMOSOS : MUNDO).filter((l) => inScope(l, scope, PAISES)).length;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- servidor
/** Tiempos acelerados: 30 s de ronda = 1,5 s (factor 0,05); revelación 250 ms. */
const FAST = {
  TM_REVEAL_MS: '250',
  TM_LOOK_CAP_MS: '3000',
  TM_RUSH_MS: '500',
  TM_NOIMG_WINDOW_MS: '1200',
  TM_TIME_FACTOR: '0.05',
  TM_GONE_MS: '1', // sin espera de gracia, salvo en la prueba que la usa
};

async function startServer(env = {}, cwd = ROOT, entry = 'server/index.js') {
  for (let attempt = 0; attempt < 8; attempt++) {
    const port = 18000 + Math.floor(Math.random() * 1000);
    const logs = [];
    const proc = spawn(process.execPath, [entry], {
      cwd,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        MAX_CONN_PER_IP: '60',
        ROOMS_PER_IP: '1000',
        JOINS_PER_MIN: '1000',
        MAX_ROOMS: '1000',
        ...FAST,
        ...env,
      },
    });
    proc.stdout.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));
    proc.stderr.on('data', (d) => logs.push(...String(d).split('\n').filter((l) => l).map((l) => `STDERR ${l}`)));
    const up = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 8000);
      const check = setInterval(() => {
        if (logs.some((l) => l.includes('game.it server en'))) {
          clearInterval(check);
          clearTimeout(t);
          resolve(true);
        }
      }, 25);
      proc.on('exit', () => {
        clearInterval(check);
        clearTimeout(t);
        resolve(false);
      });
    });
    if (up) {
      const srv = {
        port,
        logs,
        proc,
        errors: () => logs.filter((l) => / error /.test(l) || l.startsWith('STDERR')),
        // con http (no fetch) para que no pase por un proxy del entorno
        health: () =>
          new Promise((resolve, reject) => {
            httpGet(`http://127.0.0.1:${port}/health`, (res) => {
              let body = '';
              res.on('data', (d) => (body += d));
              res.on('end', () => resolve(JSON.parse(body)));
            }).on('error', reject);
          }),
        async stop() {
          if (proc.exitCode === null) {
            proc.kill('SIGTERM');
            await new Promise((r) => proc.once('exit', r));
          }
        },
      };
      return srv;
    }
    proc.kill('SIGKILL');
  }
  throw new Error('no se pudo levantar el servidor');
}

// ---------------------------------------------------------------- cliente
class Client {
  constructor(port, name = 'J') {
    this.port = port;
    this.name = name;
    this.msgs = [];
    this.room = null;
    this.closeCode = null;
    this.auto = null;
    this.sent = new Map(); // ronda → pin enviado
    this.autoKey = '';
    this.waiters = new Set();
  }

  get tm() {
    return this.room?.tm || null;
  }

  async open() {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.ws.on('message', (raw) => this.onMsg(JSON.parse(String(raw))));
    this.ws.on('close', (code) => {
      this.closeCode = code;
      this.notify();
    });
    this.ws.on('error', () => {});
    await new Promise((res, rej) => {
      this.ws.once('open', res);
      this.ws.once('error', rej);
    });
    await this.until((m) => m.t === 'hello');
    return this;
  }

  onMsg(m) {
    this.msgs.push(m);
    if (m.t === 'joined') Object.assign(this, { id: m.id, token: m.token, code: m.code });
    if (m.t === 'room') {
      this.room = m.room;
      this.autoPlay();
    }
    this.notify();
  }

  /** Si hay `auto`, confirma un pin en cada ronda en la que juega. */
  autoPlay() {
    const tm = this.tm;
    if (!this.auto || !tm || tm.phase !== 'look' || !tm.playing.includes(this.id)) return;
    const key = `${tm.round}.${tm.swaps}`;
    if (key === this.autoKey) return;
    this.autoKey = key;
    const pin = this.auto(tm, this);
    if (!pin) return;
    this.sent.set(tm.round, pin);
    this.send({ t: 'guess', lat: pin.lat, lng: pin.lng });
  }

  send(o) {
    this.ws.send(JSON.stringify(o));
  }

  sendRaw(s) {
    this.ws.send(s);
  }

  notify() {
    for (const w of [...this.waiters]) w();
  }

  /** Espera un mensaje (de ahora en adelante o ya recibido desde `from`) que cumpla `pred`. */
  async until(pred, { from = 0, ms = 6000, label = '' } = {}) {
    return new Promise((resolve, reject) => {
      let scanned = from;
      const timer = setTimeout(() => {
        this.waiters.delete(check);
        reject(new Error(`timeout esperando ${label || pred}; último tm: ${JSON.stringify(this.tm && { ...this.tm, history: undefined })}`));
      }, ms);
      const check = () => {
        while (scanned < this.msgs.length) {
          const m = this.msgs[scanned++];
          if (pred(m)) {
            clearTimeout(timer);
            this.waiters.delete(check);
            resolve(m);
            return;
          }
        }
      };
      this.waiters.add(check);
      check();
    });
  }

  /** Espera un 'room' con tm que cumpla `pred` (mira desde `from`). */
  untilTm(pred, opts = {}) {
    return this.until((m) => m.t === 'room' && m.room.tm && pred(m.room.tm, m.room), { label: 'tm', ...opts });
  }

  mark() {
    return this.msgs.length;
  }

  close() {
    this.ws.close();
  }
}

/** Crea una sala de trotamundos con `n` jugadores; el primero es el anfitrión. */
async function makeRoom(srv, n, settings = {}) {
  const host = await new Client(srv.port, 'Host').open();
  host.send({ t: 'create', game: 'trotamundos', name: 'Host' });
  await host.until((m) => m.t === 'joined');
  const players = [host];
  for (let i = 1; i < n; i++) players.push(await joinRoom(srv, host.code, `J${i}`));
  if (Object.keys(settings).length) {
    host.send({ t: 'settings', settings });
    await host.until((m) => m.t === 'room' && Object.entries(settings).every(([k, v]) => m.room.settings[k] === v), { from: host.mark() - 1, label: 'settings' });
  }
  await host.until((m) => m.t === 'room' && m.room.players.length === n, { from: host.mark() - 1 });
  return players;
}

async function joinRoom(srv, code, name, extra = {}) {
  const c = await new Client(srv.port, name).open();
  c.send({ t: 'join', code, name, game: 'trotamundos', ...extra });
  await c.until((m) => m.t === 'joined' || m.t === 'error');
  return c;
}

/** Espera el mensaje 'end' y el 'room' con la sala ya en 'finished' (llega justo después). */
async function waitEnd(c, opts = {}) {
  const end = await c.until((m) => m.t === 'end', opts);
  await c.until((m) => m.t === 'room' && m.room.state === 'finished', { ...opts, from: opts.from ?? 0 });
  return end;
}

const closeAll = async (cs) => {
  for (const c of cs) if (c.ws.readyState <= 1) c.close();
  await sleep(60);
};

/** Pin de prueba determinista por jugador y ronda (lejos o cerca de la ubicación según `k`). */
const pinFor = (k) => (tm) => ({ lat: Math.max(-80, Math.min(80, tm.loc.lat + k * 0.7)), lng: ((tm.loc.lng + k * 1.3 + 540) % 360) - 180 });

/** Las revelaciones de una ronda (la última vista de cada ronda) en el log de un cliente. */
function reveals(c) {
  const by = new Map();
  for (const m of c.msgs) if (m.t === 'room' && m.room.tm?.phase === 'reveal') by.set(m.room.tm.round, m.room.tm);
  return [...by.values()];
}

/**
 * Cuenta cuántas veces el núcleo anotó "falta" por mensajes inválidos: manda `msg` 45 veces y después ráfagas de ping hasta
 * vaciar el token bucket (MSG_BURST bajo en el servidor de faltas): con más de 40 faltas el núcleo corta con el código 4008.
 */
async function isInvalid(c, msg, times = 45) {
  for (let i = 0; i < times; i++) c.send(msg);
  for (let i = 0; i < 12; i++) c.send({ t: 'ping' });
  await sleep(250);
  return c.closeCode === 4008;
}

let srv;
const servers = [];
before(async () => {
  srv = await startServer();
  servers.push(srv);
});
after(async () => {
  for (const s of servers) await s.stop();
});

// ---------------------------------------------------------------- pruebas

test('el servidor registra el juego sin errores', async () => {
  const h = await srv.health();
  assert.ok(h.games.includes('trotamundos'));
  assert.deepEqual(srv.errors(), []);
});

test('ajustes: se validan y corrigen', async () => {
  const [host, guest] = await makeRoom(srv, 2);
  const set = async (settings) => {
    const from = host.mark();
    host.send({ t: 'settings', settings });
    const m = await host.until((x) => x.t === 'room', { from });
    return m.room.settings;
  };
  const d = host.room.settings;
  assert.deepEqual(d, { mode: 'random', scope: 'mundo', rounds: 5, time: 90, frozen: 0, rush: 0, public: false });

  assert.deepEqual(await set({ mode: 'famosos', rounds: 3, time: 30, frozen: 1, rush: 1, public: true }), { mode: 'famosos', scope: 'mundo', rounds: 3, time: 30, frozen: 1, rush: 1, public: true });
  // inválidos: quedan los valores anteriores
  assert.deepEqual(await set({ mode: 'otro', rounds: 7, time: 45, frozen: 2, rush: 'sí', public: 'true', scope: '__proto__' }), { mode: 'famosos', scope: 'mundo', rounds: 3, time: 30, frozen: 1, rush: 1, public: true });
  assert.deepEqual(await set({ rounds: null, time: null, mode: null, scope: 5, public: null }), { mode: 'famosos', scope: 'mundo', rounds: 3, time: 30, frozen: 1, rush: 1, public: true });
  // valores válidos en texto o booleano
  const s = await set({ rounds: '10', time: '0', frozen: false, rush: '0', public: false, mode: 'random' });
  assert.equal(s.rounds, 10);
  assert.equal(s.time, 0);
  assert.equal(s.frozen, 0);
  assert.equal(s.rush, 0);
  for (const t of [30, 60, 90, 120, 180, 0]) assert.equal((await set({ time: t })).time, t);
  for (const r of [3, 5, 10]) assert.equal((await set({ rounds: r })).rounds, r);

  // un ámbito sin lugares (o con menos lugares que rondas) cae a 'mundo'
  assert.equal((await set({ rounds: 3, mode: 'random', scope: 'ZZ' })).scope, 'mundo');
  assert.equal((await set({ scope: 'zz' })).scope, 'mundo');
  const withPlaces = ['latam', 'AR', 'europa', 'norteamerica', 'sudamerica', 'asia', 'africa', 'oceania'].filter((sc) => poolSize('random', sc) >= 3);
  for (const sc of withPlaces) assert.equal((await set({ rounds: 3, mode: 'random', scope: sc })).scope, sc, `ámbito ${sc}`);
  const few = ['latam', 'AR', 'europa', 'norteamerica', 'sudamerica', 'asia', 'africa', 'oceania'].filter((sc) => poolSize('random', sc) < 10);
  for (const sc of few) {
    await set({ rounds: 3, scope: sc });
    assert.equal((await set({ rounds: 10, scope: sc })).scope, 'mundo', `ámbito ${sc} con 10 rondas`);
  }
  assert.equal((await set({ mode: 'famosos', rounds: 3, scope: 'mundo' })).scope, 'mundo');
  assert.equal((await set({ scope: 'ar' })).scope, poolSize('famosos', 'AR') >= 3 ? 'AR' : 'mundo');

  // solo el anfitrión cambia ajustes
  guest.send({ t: 'settings', settings: { rounds: 10 } });
  await sleep(100);
  assert.equal(guest.room.settings.rounds, 3);
  assert.equal(host.room.settings.rounds, 3);
  // y al empezar también se validan
  host.send({ t: 'start', settings: { rounds: 99, time: 0, mode: 'random', scope: 'mundo' } });
  await host.untilTm((tm) => tm.phase === 'look');
  assert.equal(host.room.settings.rounds, 3);
  assert.equal(host.room.settings.time, 0);
  await closeAll([host, guest]);
});

test('partida completa de 3 jugadores y 3 rondas: puntos contra distanceKm y scoreFor', async () => {
  const room = await makeRoom(srv, 3, { mode: 'random', scope: 'mundo', rounds: 3, time: 0 });
  const [a, b, c] = room;
  a.auto = pinFor(0); // acierta
  b.auto = pinFor(5);
  c.auto = pinFor(-30);
  const from = a.mark();
  a.send({ t: 'start' });
  const end = await waitEnd(a, { from, ms: 15000 });

  const revs = reveals(a);
  assert.equal(revs.length, 3);
  const scale = scopeScale('mundo', PAISES);
  assert.equal(scale, WORLD_D);
  const totals = { [a.id]: 0, [b.id]: 0, [c.id]: 0 };
  const seen = new Set();
  for (const tm of revs) {
    assert.equal(tm.rounds, 3);
    assert.equal(tm.scale, scale);
    seen.add(tm.reveal.place.id);
    const loc = MUNDO.find((l) => l.id === tm.reveal.place.id);
    assert.ok(loc, 'el lugar viene del conjunto de datos');
    assert.equal(tm.reveal.place.lat, loc.lat);
    assert.equal(tm.reveal.place.cc, loc.cc);
    assert.equal(tm.reveal.results.length, 3);
    for (const p of room) {
      const pin = p.sent.get(tm.round);
      assert.ok(pin, `jugador ${p.name} confirmó la ronda ${tm.round}`);
      const r = tm.reveal.results.find((x) => x.id === p.id);
      const km = distanceKm(loc.lat, loc.lng, pin.lat, pin.lng);
      assert.ok(Math.abs(r.km - km) < 1e-6);
      assert.equal(r.pts, scoreFor(km, scale));
      assert.equal(r.lat, pin.lat);
      assert.equal(r.lng, pin.lng);
      totals[p.id] += r.pts;
      assert.equal(tm.scores[p.id], totals[p.id], 'puntaje acumulado en la revelación');
    }
    const pts = tm.reveal.results.map((x) => x.pts);
    assert.deepEqual(pts, [...pts].sort((x, y) => y - x), 'resultados ordenados');
  }
  assert.equal(seen.size, 3, 'sin repetir lugares');
  const countries = new Set(revs.map((tm) => tm.reveal.place.cc));
  assert.equal(countries.size, Math.min(3, new Set(MUNDO.map((l) => l.cc)).size), 'países distintos');
  assert.ok(revs[0].round === 1 && revs[2].round === 3);

  // fin: podio ordenado y con los totales
  assert.equal(end.ranking.length, 3);
  for (const r of end.ranking) assert.equal(r.pts, totals[r.id]);
  assert.deepEqual(end.ranking.map((r) => r.pts), end.ranking.map((r) => r.pts).sort((x, y) => y - x));
  assert.equal(end.ranking[0].id, a.id, 'el que acertó gana');
  assert.equal(end.history.length, 3);
  assert.equal(end.rounds, 3);
  assert.equal(a.room.state, 'finished');
  assert.equal(a.tm.phase, 'end');
  assert.equal(a.tm.loc, null);
  assert.deepEqual(a.tm.ranking, end.ranking);
  assert.equal(a.tm.history.length, 3);
  await closeAll(room);
});

test('modo famosos: nada del nombre hasta la revelación; en la revelación, el nombre y el país', async () => {
  assert.ok(FAMOSOS.length >= 3);
  const room = await makeRoom(srv, 2, { mode: 'famosos', scope: 'mundo', rounds: 3, time: 0 });
  const [a, b] = room;
  a.auto = pinFor(2);
  b.auto = pinFor(3);
  const from = a.mark();
  a.send({ t: 'start' });
  await waitEnd(a, { from, ms: 15000 });
  const revs = reveals(a);
  assert.equal(revs.length, 3);
  for (const tm of revs) {
    const f = FAMOSOS.find((x) => x.id === tm.reveal.place.id);
    assert.ok(f);
    assert.deepEqual(tm.reveal.place.n, f.n);
    assert.equal(tm.reveal.place.cc, f.cc);
  }
  // en 'look' no viaja el nombre, ni el id, ni el país
  const looks = a.msgs.filter((m) => m.t === 'room' && m.room.tm?.phase === 'look');
  assert.ok(looks.length >= 3);
  for (const m of looks) {
    const text = JSON.stringify(m.room.tm);
    for (const f of FAMOSOS) {
      assert.ok(!text.includes(f.n.es) && !text.includes(f.n.en), `'look' no puede nombrar ${f.n.es}`);
      assert.ok(!text.includes(f.id), 'ni el id');
    }
    assert.deepEqual(Object.keys(m.room.tm.loc).sort(), ['h', 'lat', 'lng']);
    assert.ok(Number.isFinite(m.room.tm.loc.h) && m.room.tm.loc.h >= 0 && m.room.tm.loc.h < 360);
    assert.equal(m.room.tm.reveal, null);
  }
  await closeAll(room);
});

test('fin por tiempo sin que nadie confirme: 0 puntos y relojes del servidor', async () => {
  const [a, b] = await makeRoom(srv, 2, { rounds: 3, time: 30, mode: 'random', scope: 'mundo' });
  const from = a.mark();
  a.send({ t: 'start' });
  const look = await a.untilTm((tm) => tm.phase === 'look' && tm.round === 1, { from });
  assert.equal(look.room.tm.t1 - look.room.tm.t0, 1500, '30 s × factor de prueba');
  assert.ok(Math.abs(look.room.tm.t0 - look.room.now) < 500, 't0 en hora del servidor');
  const startedAt = Date.now();
  const rev = await a.untilTm((tm) => tm.phase === 'reveal' && tm.round === 1, { from });
  const took = Date.now() - startedAt;
  assert.ok(took >= 1000 && took < 3000, `la ronda duró ${took} ms`);
  assert.deepEqual(rev.room.tm.reveal.results.map((r) => [r.lat, r.lng, r.km, r.pts]), [[null, null, null, 0], [null, null, null, 0]]);
  const end = await waitEnd(a, { from, ms: 10000 });
  assert.deepEqual(end.ranking.map((r) => r.pts), [0, 0]);
  assert.equal(end.history.length, 3);
  await closeAll([a, b]);
});

test('sin límite de tiempo, el tope de la fase look termina la ronda', async () => {
  const [a, b] = await makeRoom(srv, 2, { rounds: 3, time: 0 });
  const from = a.mark();
  a.send({ t: 'start' });
  const look = await a.untilTm((tm) => tm.phase === 'look', { from });
  assert.equal(look.room.tm.t1 - look.room.tm.t0, 3000);
  const t = Date.now();
  await a.untilTm((tm) => tm.phase === 'reveal', { from, ms: 6000 });
  assert.ok(Date.now() - t >= 2000);
  await closeAll([a, b]);
});

test('fin anticipado cuando todos confirman', async () => {
  const [a, b, c] = await makeRoom(srv, 3, { rounds: 3, time: 180 }); // 9 s en la prueba
  const from = a.mark();
  a.send({ t: 'start' });
  const look = await a.untilTm((tm) => tm.phase === 'look', { from });
  assert.equal(look.room.tm.t1 - look.room.tm.t0, 9000);
  const t = Date.now();
  for (const p of [a, b]) p.send({ t: 'guess', lat: 10, lng: 10 });
  const mid = await a.untilTm((tm) => tm.phase === 'look' && tm.done.length === 2, { from });
  assert.deepEqual(new Set(mid.room.tm.done), new Set([a.id, b.id]));
  await sleep(150);
  assert.equal(a.tm.phase, 'look', 'con uno sin confirmar, sigue');
  c.send({ t: 'guess', lat: 10, lng: 10 });
  await a.untilTm((tm) => tm.phase === 'reveal', { from });
  assert.ok(Date.now() - t < 2000, 'terminó mucho antes del tiempo');
  await closeAll([a, b, c]);
});

test('rush: al confirmar el primero, a los demás les quedan 15 s (500 ms en la prueba)', async () => {
  const [a, b, c] = await makeRoom(srv, 3, { rounds: 3, time: 180, rush: 1 }); // 9 s en la prueba
  const from = a.mark();
  a.send({ t: 'start' });
  const look = await a.untilTm((tm) => tm.phase === 'look', { from });
  assert.equal(look.room.tm.t1 - look.room.tm.t0, 9000);
  await sleep(100);
  const t = Date.now();
  b.send({ t: 'guess', lat: 1, lng: 1 });
  const mid = await a.untilTm((tm) => tm.done.length === 1, { from });
  assert.ok(mid.room.tm.t1 - mid.room.now <= 500 && mid.room.tm.t1 - mid.room.now > 300, `t1 se acortó a ~500 ms (${mid.room.tm.t1 - mid.room.now})`);
  // un segundo pin no vuelve a mover el reloj
  const t1 = mid.room.tm.t1;
  a.send({ t: 'guess', lat: 2, lng: 2 });
  const mid2 = await a.untilTm((tm) => tm.done.length === 2, { from });
  assert.equal(mid2.room.tm.t1, t1);
  const rev = await a.untilTm((tm) => tm.phase === 'reveal', { from });
  const took = Date.now() - t;
  assert.ok(took >= 350 && took < 1500, `terminó a los ${took} ms del primer pin`);
  const r = rev.room.tm.reveal.results;
  assert.equal(r.find((x) => x.id === c.id).pts, 0);
  assert.equal(r.find((x) => x.id === c.id).lat, null);
  assert.ok(r.find((x) => x.id === b.id).lat === 1);
  // sin rush no se acorta
  await closeAll([a, b, c]);
  const [d, e] = await makeRoom(srv, 2, { rounds: 3, time: 180, rush: 0 });
  const f2 = d.mark();
  d.send({ t: 'start' });
  await d.untilTm((tm) => tm.phase === 'look', { from: f2 });
  e.send({ t: 'guess', lat: 1, lng: 1 });
  const m3 = await d.untilTm((tm) => tm.done.length === 1, { from: f2 });
  assert.equal(m3.room.tm.t1 - m3.room.tm.t0, 9000);
  await closeAll([d, e]);
});

test('noimg: umbral de más de la mitad, cuenta una vez por jugador, tope de 2 cambios', async () => {
  const [a, b, c] = await makeRoom(srv, 3, { rounds: 3, time: 180 });
  const from = a.mark();
  a.send({ t: 'start' });
  const look = await a.untilTm((tm) => tm.phase === 'look', { from });
  const loc0 = look.room.tm.loc;
  const id0 = look.room.tm.t0;
  assert.equal(look.room.tm.swapsLeft, 2);

  // un jugador no alcanza (aunque lo pida varias veces)
  a.send({ t: 'noimg' });
  a.send({ t: 'noimg' });
  a.send({ t: 'noimg' });
  await a.untilTm((tm) => tm.noimg.length === 1, { from });
  await sleep(150);
  assert.deepEqual(a.tm.noimg, [a.id]);
  assert.deepEqual(a.tm.loc, loc0);
  assert.equal(a.tm.swaps, 0);
  // el segundo (2 de 3 > mitad) cambia la ubicación y reinicia el reloj
  const m1 = a.mark();
  b.send({ t: 'noimg' });
  const swap = await a.until((m) => m.t === 'swap', { from: m1 });
  assert.equal(swap.round, 1);
  assert.equal(swap.n, 1);
  const after1 = await a.untilTm((tm) => tm.swaps === 1, { from: m1 });
  assert.notDeepEqual(after1.room.tm.loc, loc0);
  assert.ok(after1.room.tm.t0 > id0, 'se reinició el reloj');
  assert.equal(after1.room.tm.t1 - after1.room.tm.t0, 9000);
  assert.deepEqual(after1.room.tm.noimg, []);
  assert.deepEqual(after1.room.tm.done, []);
  assert.equal(after1.room.tm.swapsLeft, 1);
  assert.equal(after1.room.tm.round, 1);
  // los jugadores avisan a todos: un cliente cualquiera también recibe el swap
  await c.until((m) => m.t === 'swap', { label: 'swap en el tercero' });

  // segundo cambio
  const loc1 = after1.room.tm.loc;
  const m2 = a.mark();
  b.send({ t: 'noimg' });
  c.send({ t: 'noimg' });
  const after2 = await a.untilTm((tm) => tm.swaps === 2, { from: m2 });
  assert.notDeepEqual(after2.room.tm.loc, loc1);
  assert.equal(after2.room.tm.swapsLeft, 0);

  // tercer intento: no pasa nada
  const loc2 = after2.room.tm.loc;
  const m3 = a.mark();
  a.send({ t: 'noimg' });
  b.send({ t: 'noimg' });
  c.send({ t: 'noimg' });
  await sleep(300);
  assert.equal(a.tm.swaps, 2);
  assert.deepEqual(a.tm.loc, loc2);
  assert.ok(!a.msgs.slice(m3).some((m) => m.t === 'swap'));
  // ni se repiten lugares: el lugar cambiado no vuelve a salir en la partida
  const used = new Set([loc0, loc1, loc2].map((l) => `${l.lat},${l.lng}`));
  assert.equal(used.size, 3);

  // la ronda sigue y se juega con la ubicación nueva
  for (const p of [a, b, c]) p.send({ t: 'guess', lat: loc2.lat, lng: loc2.lng });
  const rev = await a.untilTm((tm) => tm.phase === 'reveal', { from: m3 });
  assert.equal(rev.room.tm.round, 1);
  assert.equal(`${rev.room.tm.reveal.place.lat},${rev.room.tm.reveal.place.lng}`, `${loc2.lat},${loc2.lng}`);
  assert.ok(rev.room.tm.reveal.results.every((r) => r.pts >= 4990), 'acertando el lugar nuevo');
  // en la ronda siguiente, de nuevo hay 2 cambios disponibles
  const next = await a.untilTm((tm) => tm.phase === 'look' && tm.round === 2, { from: m3 });
  assert.equal(next.room.tm.swaps, 0);
  assert.equal(next.room.tm.swapsLeft, 2);
  await closeAll([a, b, c]);
});

test('noimg: pasado el margen de los primeros 25 s (1,2 s en la prueba) se ignora; los espectadores no cuentan', async () => {
  const [a, b] = await makeRoom(srv, 2, { rounds: 3, time: 180 });
  const from = a.mark();
  a.send({ t: 'start' });
  const look = await a.untilTm((tm) => tm.phase === 'look', { from });
  const loc0 = look.room.tm.loc;
  // un espectador (entró durante la ronda) no puede pedirlo, aunque sea "mayoría" entre los conectados
  const e = await joinRoom(srv, a.code, 'Tarde');
  e.send({ t: 'noimg' });
  e.send({ t: 'noimg' });
  await sleep(150);
  assert.deepEqual(a.tm.loc, loc0);
  assert.deepEqual(a.tm.noimg, []);
  await sleep(1300);
  const m1 = a.mark();
  a.send({ t: 'noimg' });
  b.send({ t: 'noimg' });
  await sleep(300);
  assert.deepEqual(a.tm.loc, loc0, 'fuera de margen no cambia');
  assert.equal(a.tm.swaps, 0);
  assert.ok(!a.msgs.slice(m1).some((m) => m.t === 'swap'));
  await closeAll([a, b, e]);
});

test('entrada tardía: mira la ronda en curso y juega desde la siguiente con 0 puntos', async () => {
  const [a, b] = await makeRoom(srv, 2, { rounds: 3, time: 180 });
  const from = a.mark();
  a.send({ t: 'start' });
  await a.untilTm((tm) => tm.phase === 'look' && tm.round === 1, { from });
  const late = await joinRoom(srv, a.code, 'Tarde');
  assert.ok(late.id, 'pudo entrar con la partida empezada');
  const view = await late.untilTm((tm) => tm.round === 1 && tm.phase === 'look');
  assert.equal(view.room.tm.scores[late.id], 0);
  assert.ok(!view.room.tm.playing.includes(late.id));
  assert.ok(view.room.tm.loc, 've la ubicación en curso');
  // se juega la ronda 1 sin él (su pin no cuenta y no frena el cierre)
  late.send({ t: 'guess', lat: 1, lng: 1 });
  a.send({ t: 'guess', lat: 10, lng: 10 });
  b.send({ t: 'guess', lat: 20, lng: 20 });
  const rev1 = await a.untilTm((tm) => tm.phase === 'reveal' && tm.round === 1, { from });
  assert.equal(rev1.room.tm.reveal.results.length, 2);
  assert.ok(!rev1.room.tm.reveal.results.some((r) => r.id === late.id));
  assert.equal(rev1.room.tm.scores[late.id], 0);
  // desde la ronda 2, juega
  const look2 = await late.untilTm((tm) => tm.phase === 'look' && tm.round === 2);
  assert.ok(look2.room.tm.playing.includes(late.id));
  const loc = look2.room.tm.loc;
  late.send({ t: 'guess', lat: loc.lat, lng: loc.lng }); // acierta
  await a.untilTm((tm) => tm.phase === 'look' && tm.round === 2 && tm.done.includes(late.id), { from });
  a.send({ t: 'guess', lat: 10, lng: 10 });
  b.send({ t: 'guess', lat: 20, lng: 20 });
  const rev2 = await a.untilTm((tm) => tm.phase === 'reveal' && tm.round === 2, { from });
  assert.equal(rev2.room.tm.reveal.results.length, 3);
  const mine = rev2.room.tm.reveal.results.find((r) => r.id === late.id);
  assert.equal(mine.pts, 5000);
  assert.equal(rev2.room.tm.scores[late.id], 5000);
  await closeAll([a, b, late]);
});

test('reconexión con token: sigue en la sala, sus rondas sin confirmar valen 0 y recibe el estado', async () => {
  const [a, b, c] = await makeRoom(srv, 3, { rounds: 3, time: 180 });
  const from = a.mark();
  a.send({ t: 'start' });
  await b.untilTm((tm) => tm.phase === 'look' && tm.round === 1);
  const bToken = b.token;
  const bId = b.id;
  b.close();
  await a.until((m) => m.t === 'room' && m.room.players.find((p) => p.id === bId && !p.connected), { from });
  // A y C confirman: la ronda cierra sin esperar a B (desconectado)
  a.send({ t: 'guess', lat: 10, lng: 10 });
  c.send({ t: 'guess', lat: 20, lng: 20 });
  const rev = await a.untilTm((tm) => tm.phase === 'reveal' && tm.round === 1, { from });
  const rb = rev.room.tm.reveal.results.find((r) => r.id === bId);
  assert.equal(rb.pts, 0);
  assert.equal(rb.lat, null);
  assert.ok(a.room.players.some((p) => p.id === bId), 'sigue en la sala');
  // vuelve en la ronda 2 con su token y recibe el estado de la partida
  await a.untilTm((tm) => tm.phase === 'look' && tm.round === 2, { from });
  const b2 = await new Client(srv.port, 'B2').open();
  b2.send({ t: 'join', code: a.code, token: bToken, game: 'trotamundos' });
  const j = await b2.until((m) => m.t === 'joined');
  assert.equal(j.id, bId, 'mismo jugador');
  const st = await b2.untilTm((tm) => tm.round === 2);
  assert.ok(st.room.tm.playing.includes(bId));
  assert.ok(st.room.tm.loc);
  assert.equal(st.room.tm.scores[bId], 0);
  assert.ok(st.room.players.find((p) => p.id === bId).connected);
  // y puede jugar: confirma, se vuelve a ir y a la vuelta recibe su pin
  b2.send({ t: 'guess', lat: 12.5, lng: -45.25 });
  await b2.untilTm((tm) => tm.done.includes(bId));
  const tokenAfter = b2.token;
  b2.close();
  await sleep(100);
  const b3 = await new Client(srv.port, 'B3').open();
  b3.send({ t: 'join', code: a.code, token: tokenAfter, game: 'trotamundos' });
  const mine = await b3.until((m) => m.t === 'mine');
  assert.deepEqual([mine.round, mine.lat, mine.lng], [2, 12.5, -45.25]);
  const st3 = await b3.untilTm((tm) => tm.round === 2);
  assert.ok(st3.room.tm.done.includes(bId));
  // no puede confirmar dos veces, y la ronda sigue
  b3.send({ t: 'guess', lat: 1, lng: 1 });
  a.send({ t: 'guess', lat: 10, lng: 10 });
  c.send({ t: 'guess', lat: 20, lng: 20 });
  const rev2 = await a.untilTm((tm) => tm.phase === 'reveal' && tm.round === 2, { from });
  const r2 = rev2.room.tm.reveal.results.find((r) => r.id === bId);
  assert.deepEqual([r2.lat, r2.lng], [12.5, -45.25], 'vale su primer pin');
  await closeAll([a, b3, c]);
});

test('una caída breve no le saca la ronda: se lo espera un rato y si vuelve conserva su turno', async () => {
  const gone = await startServer({ TM_GONE_MS: '700', RECONNECT_GRACE_MS: '5000' });
  servers.push(gone);
  // 1) vuelve a tiempo: la ronda sigue abierta y puede confirmar
  {
    const [a, b] = await makeRoom(gone, 2, { rounds: 3, time: 180 });
    const from = a.mark();
    a.send({ t: 'start' });
    await b.untilTm((tm) => tm.phase === 'look' && tm.round === 1);
    const token = a.token;
    const aId = a.id;
    b.send({ t: 'guess', lat: 10, lng: 10 });
    a.close();
    await sleep(250);
    assert.equal(b.room.tm.phase, 'look', 'la ronda no se cierra en el acto');
    const a2 = await new Client(gone.port, 'A2').open();
    a2.send({ t: 'join', code: b.code, token, game: 'trotamundos' });
    await a2.until((m) => m.t === 'joined');
    await sleep(700);
    assert.equal(b.room.tm.phase, 'look', 'sigue abierta tras vencer la espera, porque volvió');
    a2.send({ t: 'guess', lat: 20, lng: 20 });
    const rev = await b.untilTm((tm) => tm.phase === 'reveal' && tm.round === 1, { from });
    assert.ok(rev.room.tm.reveal.results.find((r) => r.id === aId).pts > 0);
    await closeAll([a2, b]);
  }
  // 2) no vuelve: al vencer la espera, la ronda cierra con 0 para él
  {
    const [a, b] = await makeRoom(gone, 2, { rounds: 3, time: 180 });
    const from = a.mark();
    a.send({ t: 'start' });
    await b.untilTm((tm) => tm.phase === 'look' && tm.round === 1);
    const aId = a.id;
    b.send({ t: 'guess', lat: 10, lng: 10 });
    a.close();
    await sleep(250);
    assert.equal(b.room.tm.phase, 'look');
    const rev = await b.untilTm((tm) => tm.phase === 'reveal' && tm.round === 1, { from });
    assert.equal(rev.room.tm.reveal.results.find((r) => r.id === aId).pts, 0);
    await closeAll([b]);
  }
});

test('view: no filtra los pines de los demás antes de la revelación', async () => {
  const [a, b, c] = await makeRoom(srv, 3, { rounds: 3, time: 180, mode: 'random' });
  const from = a.mark();
  a.send({ t: 'start' });
  await a.untilTm((tm) => tm.phase === 'look', { from });
  const PIN = { lat: 12.3456789, lng: -65.4321987 };
  const PIN2 = { lat: -23.9876543, lng: 101.1234567 };
  a.send({ t: 'guess', ...PIN });
  b.send({ t: 'guess', ...PIN2 });
  await c.untilTm((tm) => tm.phase === 'look' && tm.done.length === 2);
  for (const who of [a, b, c]) {
    for (const m of who.msgs) {
      if (m.t !== 'room' || m.room.tm?.phase !== 'look') continue;
      const text = JSON.stringify(m);
      for (const v of ['12.3456789', '-65.4321987', '-23.9876543', '101.1234567']) assert.ok(!text.includes(v), `'look' filtra ${v}`);
    }
  }
  assert.deepEqual(new Set(c.tm.done), new Set([a.id, b.id]));
  c.send({ t: 'guess', lat: 0, lng: 0 });
  const rev = await c.untilTm((tm) => tm.phase === 'reveal', { from });
  const ra = rev.room.tm.reveal.results.find((r) => r.id === a.id);
  assert.deepEqual([ra.lat, ra.lng], [PIN.lat, PIN.lng], 'en la revelación sí se ven');
  assert.equal(rev.room.tm.done.length, 0);
  await closeAll([a, b, c]);
});

test('sala de 10 jugadores: partida completa; el 11.º no entra', async () => {
  const room = await makeRoom(srv, 10, { rounds: 3, time: 0, mode: 'random', public: true });
  const extra = await joinRoom(srv, room[0].code, 'Once');
  assert.equal(extra.msgs.find((m) => m.t === 'error')?.code, 'room_full');
  room.forEach((p, i) => (p.auto = pinFor(i - 4)));
  const [host] = room;
  // aparece en la lista de salas públicas con sus datos
  const lister = await new Client(srv.port).open();
  lister.send({ t: 'list', game: 'trotamundos' });
  const list = await lister.until((m) => m.t === 'list');
  const entry = list.rooms.find((r) => r.code === host.code);
  assert.deepEqual([entry.n, entry.max, entry.rounds, entry.mode, entry.scope], [10, 10, 3, 'random', 'mundo']);
  const from = host.mark();
  host.send({ t: 'start' });
  const end = await waitEnd(host, { from, ms: 15000 });
  assert.equal(end.ranking.length, 10);
  assert.equal(new Set(host.room.players.map((p) => p.color)).size, 10, 'colores distintos con 10 jugadores');
  for (const tm of reveals(host)) assert.equal(tm.reveal.results.length, 10);
  const sum = reveals(host).reduce((s, tm) => s + tm.reveal.results.find((r) => r.id === host.id).pts, 0);
  assert.equal(end.ranking.find((r) => r.id === host.id).pts, sum);
  lister.close();
  await closeAll([...room, extra]);
});

test('el anfitrión adelanta la revelación con next; el último next lleva al podio', async () => {
  // revelación larga (solo este servidor) para comprobar que 'next' la adelanta
  const slow = await startServer({ TM_REVEAL_MS: '60000' });
  servers.push(slow);
  const [h, g] = await makeRoom(slow, 2, { rounds: 3, time: 0 });
  h.auto = pinFor(1);
  g.auto = pinFor(2);
  const from = h.mark();
  h.send({ t: 'start' });
  for (let r = 1; r <= 3; r++) {
    const rev = await h.untilTm((tm) => tm.phase === 'reveal' && tm.round === r, { from });
    assert.ok(rev.room.tm.t1 - rev.room.now > 50000, 'la revelación todavía tiene tiempo');
    g.send({ t: 'next' }); // un invitado no puede
    await sleep(100);
    assert.equal(h.tm.phase, 'reveal');
    assert.equal(h.tm.round, r);
    h.send({ t: 'next' });
    if (r < 3) await h.untilTm((tm) => tm.phase === 'look' && tm.round === r + 1, { from });
  }
  await waitEnd(h, { from });
  assert.equal(h.room.state, 'finished');
  await closeAll([h, g]);
  await sleep(100);
  assert.deepEqual(slow.errors(), []);
  await slow.stop();
});

test('revancha: la sala vuelve limpia al lobby y se puede jugar de nuevo', async () => {
  const room = await makeRoom(srv, 3, { rounds: 3, time: 0, mode: 'famosos', rush: 1 });
  const [a, b, c] = room;
  room.forEach((p, i) => (p.auto = pinFor(i)));
  let from = a.mark();
  a.send({ t: 'start' });
  await waitEnd(a, { from, ms: 15000 });
  assert.equal(a.room.state, 'finished');
  // solo el anfitrión
  b.send({ t: 'rematch' });
  await sleep(100);
  assert.equal(a.room.state, 'finished');
  from = a.mark();
  a.send({ t: 'rematch' });
  const lobby = await a.until((m) => m.t === 'room' && m.room.state === 'lobby', { from });
  assert.equal(lobby.room.tm, null);
  assert.deepEqual([lobby.room.settings.mode, lobby.room.settings.rounds, lobby.room.settings.rush], ['famosos', 3, 1], 'se conservan los ajustes');
  await sleep(400); // ningún timer de la partida anterior puede mover la sala
  assert.equal(a.room.state, 'lobby');
  assert.equal(a.tm, null);
  // segunda partida: arranca de cero
  room.forEach((p) => p.sent.clear());
  room.forEach((p) => (p.autoKey = ''));
  from = a.mark();
  a.send({ t: 'start' });
  const look = await a.untilTm((tm) => tm.phase === 'look', { from });
  assert.equal(look.room.tm.round, 1);
  assert.deepEqual(Object.values(look.room.tm.scores), [0, 0, 0]);
  assert.deepEqual(look.room.tm.done, []);
  const end2 = await waitEnd(a, { from, ms: 15000 });
  assert.equal(end2.history.length, 3);
  assert.equal(end2.ranking.length, 3);
  await closeAll(room);
});

test('se cierra limpio: sin errores ni timers sueltos al irse todos', async () => {
  const room = await makeRoom(srv, 3, { rounds: 3, time: 30 });
  const [a, b, c] = room;
  const from = a.mark();
  a.send({ t: 'start' });
  await a.untilTm((tm) => tm.phase === 'look', { from });
  const code = a.code;
  const rooms0 = (await srv.health()).rooms;
  // se van todos en pleno 'look' (con el reloj corriendo) y la sala se cierra
  for (const p of [a, b, c]) p.send({ t: 'leave' });
  await sleep(150);
  assert.ok(srv.logs.some((l) => l.includes(`room closed ${code} trotamundos empty`)));
  assert.equal((await srv.health()).rooms, rooms0 - 1);
  // también en medio de la revelación
  const [d, e] = await makeRoom(srv, 2, { rounds: 3, time: 30 });
  const f2 = d.mark();
  d.send({ t: 'start' });
  await d.untilTm((tm) => tm.phase === 'reveal', { from: f2 });
  d.close();
  e.close();
  await sleep(1800); // pasa más que cualquier timer de la fase (look 1,5 s, revelación 250 ms)
  assert.deepEqual(srv.errors(), []);
  await closeAll(room);
});

test('si quedan menos de 2 conectados la partida termina con el podio (sin colgarse)', async () => {
  const quick = await startServer({ RECONNECT_GRACE_MS: '600', HEARTBEAT_MS: '150' });
  servers.push(quick);
  // 1) se desconecta y no vuelve: al vencer el tiempo de reconexión, termina
  {
    const [a, b] = await makeRoom(quick, 2, { rounds: 3, time: 180 });
    const from = a.mark();
    a.send({ t: 'start' });
    await a.untilTm((tm) => tm.phase === 'look', { from });
    a.auto = pinFor(0);
    a.autoPlay();
    b.close();
    const end = await waitEnd(a, { from, ms: 5000 });
    assert.equal(end.ranking.length, 1);
    assert.equal(end.ranking[0].id, a.id);
    assert.equal(a.room.state, 'finished');
    await sleep(300);
    assert.equal(a.room.state, 'finished', 'no sigue corriendo');
    // se puede volver al lobby
    const f = a.mark();
    a.send({ t: 'rematch' });
    await a.until((m) => m.t === 'room' && m.room.state === 'lobby', { from: f });
    a.close();
  }
  // 2) se va el otro a propósito: termina en el momento
  {
    const [a, b] = await makeRoom(quick, 2, { rounds: 3, time: 0 });
    const from = a.mark();
    a.send({ t: 'start' });
    await a.untilTm((tm) => tm.phase === 'look', { from });
    b.send({ t: 'leave' });
    const end = await waitEnd(a, { from, ms: 2000 });
    assert.deepEqual(end.ranking.map((r) => r.id), [a.id]);
    a.close();
  }
  // 3) con 3 jugadores, si se va uno con el resto confirmado, la ronda sigue
  {
    const [a, b, c] = await makeRoom(quick, 3, { rounds: 3, time: 180 });
    const from = a.mark();
    a.send({ t: 'start' });
    await a.untilTm((tm) => tm.phase === 'look', { from });
    a.send({ t: 'guess', lat: 3, lng: 3 });
    b.send({ t: 'guess', lat: 4, lng: 4 });
    await a.untilTm((tm) => tm.done.length === 2, { from });
    c.send({ t: 'leave' });
    const rev = await a.untilTm((tm) => tm.phase === 'reveal', { from });
    assert.equal(rev.room.tm.reveal.results.length, 2);
    assert.ok(!rev.room.tm.scores[c.id] && !(c.id in rev.room.tm.scores));
    await closeAll([a, b, c]);
  }
  // 4) se van todos los que juegan la ronda y quedan solo espectadores: la ronda no espera al reloj (180 s = 9 s en la prueba)
  {
    const [a, b] = await makeRoom(quick, 2, { rounds: 3, time: 180 });
    const from = a.mark();
    a.send({ t: 'start' });
    await a.untilTm((tm) => tm.phase === 'look' && tm.round === 1, { from });
    const c = await joinRoom(quick, a.code, 'Tarde1');
    const d = await joinRoom(quick, a.code, 'Tarde2');
    await c.untilTm((tm) => tm.round === 1);
    const t = Date.now();
    a.close();
    b.close();
    const rev = await c.untilTm((tm) => tm.phase === 'reveal' && tm.round === 1, { ms: 4000 });
    assert.ok(Date.now() - t < 4000, 'cerró la ronda sin esperar los 9 s');
    assert.ok(rev.room.tm.reveal.results.every((r) => r.pts === 0));
    // en la ronda siguiente juegan los espectadores
    const look2 = await c.untilTm((tm) => tm.phase === 'look' && tm.round === 2);
    assert.ok(look2.room.tm.playing.includes(c.id) && look2.room.tm.playing.includes(d.id));
    await closeAll([c, d]);
  }
  assert.deepEqual(quick.errors(), []);
  await quick.stop();
});

// ---------------------------------------------------------------- mensajes inválidos
test('mensajes inválidos: suman falta (devuelven false), nunca tiran el servidor', async () => {
  // MSG_BURST bajo: con más de 40 faltas, el núcleo corta con 4008 al vaciarse el bucket
  const strict = await startServer({ MSG_BURST: '50', MSG_RATE: '1', TM_LOOK_CAP_MS: '60000' });
  servers.push(strict);
  const probe = async (label, setup, msg, expectInvalid = true) => {
    const room = await makeRoom(strict, 3, { rounds: 3, time: 0 });
    const [a, b, c] = room;
    const from = a.mark();
    a.send({ t: 'start' });
    await a.untilTm((tm) => tm.phase === 'look', { from });
    const who = await setup({ a, b, c, room });
    const bad = await isInvalid(who, typeof msg === 'function' ? msg({ a, b, c, who }) : msg);
    assert.equal(bad, expectInvalid, label);
    await closeAll(room);
  };
  const self = ({ b }) => b; // un jugador de la ronda
  await probe('lat NaN (JSON roto)', self, { t: 'guess', lat: 'NaN', lng: 1 });
  await probe('lat como texto', self, { t: 'guess', lat: '12', lng: '13' });
  await probe('lat fuera de rango', self, { t: 'guess', lat: 91, lng: 0 });
  await probe('lng fuera de rango', self, { t: 'guess', lat: 0, lng: -181 });
  await probe('lat null', self, { t: 'guess', lat: null, lng: 3 });
  await probe('sin coordenadas', self, { t: 'guess' });
  await probe('lat enorme', self, { t: 'guess', lat: 1e308, lng: 1 });
  await probe('lat objeto', self, { t: 'guess', lat: {}, lng: [] });
  await probe('tipo desconocido en la partida', self, { t: 'volar', x: 1 });
  await probe('next de un invitado', self, { t: 'next' });
  await probe('next del anfitrión en look', ({ a }) => a, { t: 'next' });
  // doble confirmación: la primera vale, las demás son falta
  await probe(
    'doble confirmación',
    async ({ a }) => {
      a.send({ t: 'guess', lat: 1, lng: 1 });
      await sleep(50);
      return a;
    },
    { t: 'guess', lat: 2, lng: 2 },
  );
  // espectador: entra con la ronda empezada
  await probe(
    'guess de un espectador',
    async ({ a }) => joinRoom(strict, a.code, 'Tarde'),
    { t: 'guess', lat: 1, lng: 1 },
  );
  await probe('noimg de un espectador', async ({ a }) => joinRoom(strict, a.code, 'Tarde'), { t: 'noimg' });
  // controles: estos NO son faltas
  await probe('noimg repetido (se cuenta una vez, se ignora)', self, { t: 'noimg' }, false);
  await probe('mensaje normal: ping', self, { t: 'ping' }, false);

  // mensajes del juego en el lobby y con la partida terminada
  const [a, b] = await makeRoom(strict, 2, { rounds: 3, time: 0 });
  assert.equal(await isInvalid(b, { t: 'guess', lat: 1, lng: 1 }), true, 'guess en el lobby');
  const [c, d] = await makeRoom(strict, 2, { rounds: 3, time: 0 });
  assert.equal(await isInvalid(d, { t: 'noimg' }), true, 'noimg en el lobby');
  const [e, f] = await makeRoom(strict, 2, { rounds: 3, time: 0 });
  assert.equal(await isInvalid(e, { t: 'next' }), true, 'next en el lobby');
  await closeAll([a, b, c, d, e, f]);
  // el servidor sigue sano, sin errores
  assert.deepEqual(strict.errors(), []);
  assert.ok((await strict.health()).ok);
  await strict.stop();
});

test('JSON raro, mensajes enormes o sin tipo no rompen la partida', async () => {
  const [a, b] = await makeRoom(srv, 2, { rounds: 3, time: 0 });
  const from = a.mark();
  a.send({ t: 'start' });
  await a.untilTm((tm) => tm.phase === 'look', { from });
  for (const raw of ['{"t":"guess","lat":NaN,"lng":0}', '{"t":"guess","lat":1e999,"lng":0}', '{"t":"guess"', '[]', 'null', '{"t":5}', '{"t":"guess","lat":[1],"lng":{"a":1}}', '{"t":"guess","lat":-0,"lng":-0}'])
    b.sendRaw(raw);
  await sleep(150);
  // el último ("-0", "-0") es válido y quedó confirmado
  assert.deepEqual(a.tm.done, [b.id]);
  a.send({ t: 'guess', lat: 5, lng: 5 });
  await a.untilTm((tm) => tm.phase === 'reveal', { from });
  assert.deepEqual(srv.errors(), []);
  await closeAll([a, b]);
});

// ---------------------------------------------------------------- datos que faltan
test('si faltan los datos, el servidor arranca igual (y avisa al empezar)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'tm-sin-datos-'));
  try {
    // copia mínima del repo: server/ y los shared de public/games (el módulo lee los datos con una ruta relativa a sí mismo)
    cpSync(join(ROOT, 'server'), join(tmp, 'server'), { recursive: true });
    mkdirSync(join(tmp, 'public/games'), { recursive: true });
    symlinkSync(join(ROOT, 'public/shared'), join(tmp, 'public/shared'));
    for (const g of readdirSync(join(ROOT, 'public/games'))) {
      if (g === 'trotamundos') continue;
      symlinkSync(join(ROOT, 'public/games', g), join(tmp, 'public/games', g));
    }
    mkdirSync(join(tmp, 'public/games/trotamundos/datos'), { recursive: true });
    symlinkSync(join(ROOT, 'public/games/trotamundos/shared'), join(tmp, 'public/games/trotamundos/shared'));

    // 1) sin ningún archivo y con uno roto
    writeFileSync(join(tmp, 'public/games/trotamundos/datos/famosos.json'), '{esto no es json');
    const s1 = await startServer({}, tmp, 'server/index.js');
    servers.push(s1);
    assert.ok((await s1.health()).games.includes('trotamundos'));
    assert.ok(s1.logs.some((l) => l.includes('trotamundos: no se pudo leer datos/mundo.json')));
    assert.ok(s1.logs.some((l) => l.includes('trotamundos: no se pudo leer datos/famosos.json')));
    const [a, b] = await makeRoom(s1, 2);
    const from = a.mark();
    a.send({ t: 'start' });
    const err = await a.until((m) => m.t === 'error', { from });
    assert.equal(err.code, 'no_data');
    assert.equal(a.room.state, 'lobby');
    await closeAll([a, b]);
    // las demás salas siguen funcionando
    const t = await new Client(s1.port).open();
    t.send({ t: 'create', game: 'tictactoe', name: 'x' });
    await t.until((m) => m.t === 'joined');
    t.close();
    await s1.stop();

    // 2) solo mundo.json: el modo famosos usa esos lugares
    writeFileSync(join(tmp, 'public/games/trotamundos/datos/mundo.json'), readFileSync(join(DATOS, 'mundo.json')));
    const s2 = await startServer({}, tmp, 'server/index.js');
    servers.push(s2);
    const [c, d] = await makeRoom(s2, 2, { mode: 'famosos', rounds: 3, time: 0, scope: 'mundo' });
    c.auto = pinFor(1);
    d.auto = pinFor(2);
    const f2 = c.mark();
    c.send({ t: 'start' });
    const end = await waitEnd(c, { from: f2, ms: 15000 });
    assert.equal(end.history.length, 3);
    // sin paises.json: la escala es la del mundo y un continente cae a 'mundo'
    assert.equal(reveals(c)[0].scale, WORLD_D);
    c.send({ t: 'rematch' });
    await c.until((m) => m.t === 'room' && m.room.state === 'lobby', { from: f2 });
    c.send({ t: 'settings', settings: { scope: 'europa', rounds: 3 } });
    await c.until((m) => m.t === 'room' && m.room.state === 'lobby' && m.room.settings.scope === 'mundo', { from: f2 });
    await closeAll([c, d]);
    assert.deepEqual(s2.errors().filter((l) => !l.includes('no se pudo leer')), []);
    await s2.stop();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('con pocos lugares se juegan menos rondas (nunca se rompe la partida)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'tm-pocos-'));
  try {
    cpSync(join(ROOT, 'server'), join(tmp, 'server'), { recursive: true });
    mkdirSync(join(tmp, 'public/games'), { recursive: true });
    symlinkSync(join(ROOT, 'public/shared'), join(tmp, 'public/shared'));
    for (const g of readdirSync(join(ROOT, 'public/games'))) {
      if (g === 'trotamundos') continue;
      symlinkSync(join(ROOT, 'public/games', g), join(tmp, 'public/games', g));
    }
    const dd = join(tmp, 'public/games/trotamundos/datos');
    mkdirSync(dd, { recursive: true });
    symlinkSync(join(ROOT, 'public/games/trotamundos/shared'), join(tmp, 'public/games/trotamundos/shared'));
    // 2 lugares del mismo país, uno repetido y uno mal formado
    const mundo = [
      { id: 'x-1', lat: -34.6, lng: -58.4, cc: 'AR' },
      { id: 'x-2', lat: -31.4, lng: -64.2, cc: 'AR', p: 'Córdoba' },
      { id: 'x-2', lat: 1, lng: 1, cc: 'AR' },
      { id: 'x-3', lat: 999, lng: 1, cc: 'AR' },
    ];
    writeFileSync(join(dd, 'mundo.json'), JSON.stringify(mundo));
    writeFileSync(join(dd, 'famosos.json'), '[]');
    const s = await startServer({}, tmp, 'server/index.js');
    servers.push(s);
    const [a, b] = await makeRoom(s, 2, { rounds: 5, time: 0 });
    a.auto = pinFor(0);
    b.auto = pinFor(1);
    const from = a.mark();
    a.send({ t: 'start' });
    const first = await a.untilTm((tm) => tm.phase === 'look', { from });
    assert.equal(first.room.tm.rounds, 2, 'solo hay 2 lugares válidos');
    const end = await waitEnd(a, { from, ms: 10000 });
    assert.equal(end.history.length, 2);
    assert.equal(new Set(end.history.map((h) => h.place.id)).size, 2);
    assert.ok(end.history.some((h) => h.place.p === 'Córdoba'));
    // sin lugares de repuesto, noimg se ignora sin romper nada
    const f2 = a.mark();
    a.send({ t: 'rematch' });
    await a.until((m) => m.t === 'room' && m.room.state === 'lobby', { from: f2 });
    a.send({ t: 'start' });
    const l2 = await a.untilTm((tm) => tm.phase === 'look', { from: f2 });
    assert.equal(l2.room.tm.swapsLeft, 0);
    a.send({ t: 'noimg' });
    b.send({ t: 'noimg' });
    await sleep(200);
    assert.equal(a.tm.swaps, 0);
    assert.deepEqual(s.errors().filter((l) => !l.includes('no se pudo leer')), []);
    await closeAll([a, b]);
    await s.stop();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
