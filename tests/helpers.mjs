/** Utilidades compartidas por las pruebas que levantan el servidor de salas (server/index.js) en un puerto libre. */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(new URL('../server/package.json', import.meta.url));
export const WebSocket = require('ws');
const SERVER = new URL('../server/index.js', import.meta.url).pathname;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () =>
  new Promise((res) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

/** Arranca el servidor con variables de entorno propias. Devuelve { port, logs(), stop() }. */
export async function startServer(env = {}) {
  const port = await freePort();
  const proc = spawn('node', [SERVER], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  proc.stdout.on('data', (d) => (logs += d));
  proc.stderr.on('data', (d) => (logs += d));
  for (let i = 0; i < 50 && !/game\.it server en/.test(logs); i++) await wait(100);
  if (!/game\.it server en/.test(logs)) {
    proc.kill();
    throw new Error(`el servidor no arrancó:\n${logs}`);
  }
  return { port, logs: () => logs, stop: () => proc.kill() };
}

/** Cliente de prueba. `xff` es lo que dice el proxy (la última entrada es la que agregó el proxy de confianza). */
export function connect(port, hdrs) {
  const headers = typeof hdrs === 'string' ? { 'x-forwarded-for': hdrs } : hdrs || {};
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
    const c = { ws, msgs: [], open: false, status: 0 };
    ws.on('message', (m) => c.msgs.push(JSON.parse(m)));
    ws.on('open', () => resolve(Object.assign(c, { open: true })));
    ws.on('unexpected-response', (_, res) => resolve(Object.assign(c, { status: res.statusCode })));
    ws.on('error', () => resolve(c));
    c.send = (m) => ws.send(JSON.stringify(m));
    c.last = (t) => [...c.msgs].reverse().find((m) => m.t === t);
    c.all = (t) => c.msgs.filter((m) => m.t === t);
    return c;
  });
}
