#!/usr/bin/env node
/**
 * Proxy WebSocket con red "mala" para probar el netcode de las arenas sin salir de la compu.
 * Se pone entre el navegador y el servidor del juego y le suma a cada mensaje (en las dos direcciones):
 *   - latencia de ida (--latency, ms) y jitter (--jitter, ± ms), sin reordenar (WebSocket va sobre TCP: un mensaje
 *     lento demora a los que siguen),
 *   - paradas ocasionales (--stall-ms cada --stall-every ms, con algo de azar): todo queda retenido y sale junto,
 *     como cuando se pierde un paquete y TCP retransmite.
 *
 *   node server/index.js &                       # PORT=18800 node server/index.js
 *   node tools/netsim/delay-proxy.mjs --listen 18801 --target 18800 --latency 80 --jitter 20
 *   # abrir el juego con ?server=ws://localhost:18801  (RTT ≈ 2 × latency)
 *
 * Opciones: --listen 18801  --target 18800  --host 127.0.0.1  --latency 80  --jitter 20  --stall-ms 0  --stall-every 15000
 *
 * Control por HTTP en el mismo puerto (para probar reconexiones):
 *   GET /__netsim/down          corta todas las conexiones y rechaza las nuevas
 *   GET /__netsim/up            vuelve a aceptar
 *   GET /__netsim/set?latency=120&jitter=30&stallMs=400&stallEvery=8000   cambia los valores en caliente
 *   GET /__netsim/stats         mensajes y bytes que pasaron
 * Cualquier otro GET (por ejemplo /health) se reenvía al servidor.
 * Solo depende de `ws`, que se importa de server/node_modules igual que tests/helpers.mjs.
 */
import { createRequire } from 'node:module';
import { createServer, request } from 'node:http';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const { WebSocketServer, WebSocket } = require('ws');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
}
const cfg = {
  listen: Number(args.listen ?? 18801),
  target: Number(args.target ?? 18800),
  host: args.host ?? '127.0.0.1',
  latency: Number(args.latency ?? 80),
  jitter: Number(args.jitter ?? 20),
  stallMs: Number(args['stall-ms'] ?? 0),
  stallEvery: Number(args['stall-every'] ?? 15000),
};
const stats = { conns: 0, msgs: 0, bytes: 0, stalls: 0 };
let down = false;
let stallUntil = 0;
const pairs = new Set();

// paradas: cada tanto (con azar) se retiene todo un rato
function scheduleStall() {
  if (!(cfg.stallMs > 0)) return setTimeout(scheduleStall, 1000).unref();
  setTimeout(() => {
    stallUntil = Date.now() + cfg.stallMs * (0.6 + Math.random() * 0.8);
    stats.stalls++;
    scheduleStall();
  }, cfg.stallEvery * (0.5 + Math.random())).unref();
}
scheduleStall();

/** Cola de un sentido: cada mensaje sale a su hora, nunca antes que el anterior. */
function pipe(deliver) {
  let last = 0;
  return (data, isBinary) => {
    const now = Date.now();
    let at = now + cfg.latency + (Math.random() * 2 - 1) * cfg.jitter;
    if (at < stallUntil) at = stallUntil + Math.random() * 5;
    at = Math.max(at, last + 0.01);
    last = at;
    stats.msgs++;
    stats.bytes += data.length;
    setTimeout(() => deliver(data, isBinary), Math.max(0, at - now));
  };
}
const validClose = (c) => (c >= 1000 && c <= 4999 && c !== 1005 && c !== 1006 && c !== 1015 ? c : 1000);

const http = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/__netsim/')) {
    const cmd = url.pathname.slice('/__netsim/'.length);
    if (cmd === 'down') {
      down = true;
      for (const p of pairs) p.client.terminate();
    } else if (cmd === 'up') down = false;
    else if (cmd === 'set') {
      for (const k of ['latency', 'jitter', 'stallMs', 'stallEvery']) if (url.searchParams.has(k)) cfg[k] = Number(url.searchParams.get(k));
    }
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ down, ...cfg, ...stats, open: pairs.size }));
  }
  if (down) {
    res.writeHead(503);
    return res.end('netsim: down');
  }
  const up = request({ host: cfg.host, port: cfg.target, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on('error', () => (res.writeHead(502), res.end()));
  req.pipe(up);
});

const wss = new WebSocketServer({ noServer: true });
http.on('upgrade', (req, socket, head) => {
  if (down) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (client) => {
    stats.conns++;
    const headers = {};
    if (req.headers['x-forwarded-for']) headers['x-forwarded-for'] = req.headers['x-forwarded-for'];
    if (req.headers.origin) headers.origin = req.headers.origin;
    const upstream = new WebSocket(`ws://${cfg.host}:${cfg.target}${req.url}`, { headers });
    const pair = { client, upstream };
    pairs.add(pair);
    // hasta que el servidor abre, lo que mande el cliente espera (con su demora)
    const toUp = pipe((d, b) => upstream.readyState === 1 && upstream.send(d, { binary: b }));
    const toClient = pipe((d, b) => client.readyState === 1 && client.send(d, { binary: b }));
    const pending = [];
    client.on('message', (d, b) => (upstream.readyState === 1 ? toUp(d, b) : pending.push([d, b])));
    upstream.on('open', () => pending.splice(0).forEach(([d, b]) => toUp(d, b)));
    upstream.on('message', (d, b) => toClient(d, b));
    const end = (to, code) => setTimeout(() => (pairs.delete(pair), to.readyState <= 1 && to.close(validClose(code))), cfg.latency);
    client.on('close', (c) => end(upstream, c));
    upstream.on('close', (c) => end(client, c));
    client.on('error', () => {});
    upstream.on('error', () => client.terminate());
  });
});

http.listen(cfg.listen, () => {
  console.log(`netsim: :${cfg.listen} → :${cfg.target}  latencia ${cfg.latency} ± ${cfg.jitter} ms por sentido (RTT ≈ ${cfg.latency * 2} ms)${cfg.stallMs ? `, paradas de ~${cfg.stallMs} ms cada ~${cfg.stallEvery} ms` : ''}`);
});
