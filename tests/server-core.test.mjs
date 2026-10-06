/**
 * Núcleo de salas del servidor (server/index.js), con clientes WebSocket reales contra un servidor local.
 *
 *   npm test        (necesita `npm ci` dentro de server/ para tener `ws`)
 *
 * Sin dependencias nuevas: usa node:test. Cada archivo de tests/ levanta su propio servidor en un puerto libre.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const WebSocket = require('ws');
const SERVER = new URL('../server/index.js', import.meta.url).pathname;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((res) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

let proc;
let port;
let logs = '';

before(async () => {
  port = await freePort();
  proc = spawn('node', [SERVER], {
    env: { ...process.env, PORT: String(port), MAX_CONN_PER_IP: '3', HEARTBEAT_MS: '300', RECONNECT_GRACE_MS: '1200', ROOM_IDLE_MS: '1500', TRUST_PROXY_HOPS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => (logs += d));
  proc.stderr.on('data', (d) => (logs += d));
  for (let i = 0; i < 50 && !/game\.it server en/.test(logs); i++) await wait(100);
  assert.match(logs, /game\.it server en/, 'el servidor no arrancó');
});

after(() => proc?.kill());

/** Cliente de prueba: `xff` es lo que dice el proxy (la última entrada es la que agregó el proxy de confianza). */
function connect(xff) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: xff ? { 'x-forwarded-for': xff } : {} });
    const c = { ws, msgs: [], open: false, status: 0 };
    ws.on('message', (m) => c.msgs.push(JSON.parse(m)));
    ws.on('open', () => resolve(Object.assign(c, { open: true })));
    ws.on('unexpected-response', (_, res) => resolve(Object.assign(c, { status: res.statusCode })));
    ws.on('error', () => resolve(c));
    c.send = (m) => ws.send(JSON.stringify(m));
    c.last = (t) => [...c.msgs].reverse().find((m) => m.t === t);
  });
}

test('el anfitrión que se cae en el lobby no cierra la sala y conserva el rol al volver', async () => {
  const a = await connect('10.1.0.1');
  a.send({ t: 'create', game: 'tictactoe', name: 'Ana' });
  await wait(150);
  const joined = a.last('joined');
  assert.ok(joined, 'la sala se crea');
  a.ws.terminate();
  await wait(200);

  const b = await connect('10.1.0.2');
  b.send({ t: 'join', game: 'tictactoe', code: joined.code, name: 'Beto' });
  await wait(150);
  const room = b.last('room').room;
  assert.equal(room.host, joined.id, 'el anfitrión sigue siéndolo mientras está en gracia');
  assert.equal(room.players.find((p) => p.id === joined.id).connected, false);

  const a2 = await connect('10.1.0.1');
  a2.send({ t: 'join', game: 'tictactoe', code: joined.code, token: joined.token, name: 'Ana' });
  await wait(150);
  assert.equal(a2.last('joined').id, joined.id, 'vuelve con el mismo jugador');
  assert.equal(a2.last('room').room.host, joined.id);

  // si no vuelve a tiempo, el rol pasa al que sigue conectado
  a2.ws.terminate();
  await wait(1900);
  const after = b.last('room').room;
  assert.equal(after.host, b.last('joined').id);
  assert.equal(after.players.length, 1);
  b.ws.close();
});

test('una sala sin nadie se cierra al vencer la gracia', async () => {
  const a = await connect('10.2.0.1');
  a.send({ t: 'create', game: 'tictactoe', name: 'Caro' });
  await wait(150);
  const { code } = a.last('joined');
  a.ws.terminate();
  await wait(2000);
  const b = await connect('10.2.0.2');
  b.send({ t: 'join', game: 'tictactoe', code, name: 'Dani' });
  await wait(150);
  assert.equal(b.last('error')?.code, 'not_found');
  b.ws.close();
});

test('el límite por IP no se evade con un X-Forwarded-For inventado', async () => {
  // el proxy de confianza agrega la IP real a la derecha: lo que el cliente escribe a la izquierda no cuenta
  const real = '10.3.0.9';
  const conns = [];
  for (let i = 0; i < 3; i++) conns.push(await connect(`${i + 1}.${i + 1}.${i + 1}.${i + 1}, ${real}`));
  const fourth = await connect(`9.9.9.9, ${real}`);
  assert.deepEqual(conns.map((c) => c.open), [true, true, true]);
  assert.equal(fourth.status, 429);
  conns.forEach((c) => c.ws.close());
});

test('IPv6: todo un /64 cuenta como un solo cliente', async () => {
  const conns = [];
  for (let i = 1; i <= 3; i++) conns.push(await connect(`2001:db8:aaaa:bbbb::${i}`));
  const fourth = await connect('2001:db8:aaaa:bbbb:1:2:3:4');
  const other = await connect('2001:db8:aaaa:cccc::1');
  assert.equal(fourth.status, 429);
  assert.ok(other.open, 'otro /64 no se ve afectado');
  [...conns, other].forEach((c) => c.ws.close());
});

test('jugar mantiene viva la sala aunque el módulo no renueve la actividad (ROOM_IDLE_MS = 1,5 s)', async () => {
  const a = await connect('10.5.0.1');
  a.send({ t: 'create', game: 'drift', name: 'Eli' });
  await wait(150);
  assert.ok(a.last('joined'));
  a.send({ t: 'start' });
  await wait(150);
  assert.equal(a.last('room').room.state, 'playing');
  // 3,5 s mandando su estado cada 100 ms (más del doble del tope de inactividad)
  for (let i = 0; i < 35; i++) {
    a.send({ t: 'state', s: [i, 0, 0, 0, 0, 0, 0, 0] });
    await wait(100);
  }
  assert.equal(a.last('closed'), undefined, 'la sala sigue viva en pleno juego');
  // sin ningún mensaje durante más del tope, la sala sí se cierra por inactividad
  await wait(2300);
  assert.equal(a.last('closed')?.reason, 'idle');
  a.ws.close();
});

test('el servidor no registra errores no controlados durante las pruebas', () => {
  assert.doesNotMatch(logs, /\bfatal\b|TypeError|ReferenceError/);
});
