#!/usr/bin/env node
/**
 * Carga de prueba para las arenas: N clientes `ws` sin interfaz que entran a la misma sala y juegan con entradas
 * al azar (esquivan las paredes, reaparecen al morir). Mide lo que importa en el servidor gratis de Render
 * (0,1 CPU): milisegundos por paso del servidor (`rt.avgTickMs` de /health, sin contar la red) y bytes/s por cliente.
 *
 *   PORT=18800 node server/index.js &
 *   node tools/load-bots.mjs --url ws://localhost:18800 --clients 10 --seconds 30 [--game estela] [--bots on|off] [--pid <pid del servidor>]
 *
 *   --clients  personas simuladas en UNA sala (máx. las de la arena)      --bots  on = el servidor completa con bots (por defecto)
 *   --seconds  duración de la medición (después de 3 s de calentamiento)  --pid   PID del servidor: informa su CPU (de /proc)
 *   --json     imprime solo un JSON con los números
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const WebSocket = require('ws');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
}
const URL_WS = args.url || 'ws://localhost:18800';
const N = Number(args.clients ?? 10);
const SECONDS = Number(args.seconds ?? 30);
const GAME = args.game || 'estela';
const BOTS = (args.bots || 'on') !== 'off';
const WARM = 3000;
const HTTP = URL_WS.replace(/^ws/, 'http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(i) {
    this.i = i;
    this.name = `Carga${i}`;
    this.bytes = 0;
    this.msgs = 0;
    this.snaps = 0;
    this.measuring = false;
    this.alive = false;
    this.seq = Math.floor(Date.now() / 50) + i * 1000;
    this.k = 0;
    this.me = 0;
    this.size = 160;
    this.deaths = 0;
    this.recent = [];
  }

  open(onJoined, mode, code) {
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(URL_WS));
      ws.on('error', reject);
      ws.on('open', () => {
        ws.send(JSON.stringify(mode === 'create' ? { t: 'create', game: GAME, name: this.name, settings: { public: true, bots: BOTS } } : { t: 'join', game: GAME, code, name: this.name }));
      });
      ws.on('message', (raw) => {
        const len = raw.length;
        let m;
        try {
          m = JSON.parse(raw);
        } catch {
          return;
        }
        if (this.measuring) {
          this.bytes += len;
          this.msgs++;
          if (m.t === 's') this.snaps++;
        }
        if (m.t === 'joined') {
          onJoined?.(m.code);
          resolve(m.code);
        } else this.onMsg(m);
      });
      ws.on('close', () => (this.closed = true));
    });
  }

  onMsg(m) {
    if (m.t === 'me') {
      this.me = m.num;
      this.size = m.size || this.size;
      if (!m.alive) setTimeout(() => this.spawn(), (m.wait || 0) + 50);
      else this.alive = true;
    } else if (m.t === 's') {
      this.k = m.k;
      const mine = m.h?.[0];
      if (mine && mine[0] === this.me) {
        this.alive = true;
        this.head = mine;
        if (!this.next || m.k >= this.next) this.think(m.k);
      }
    } else if (m.t === 'dead') {
      this.alive = false;
      this.deaths++;
      setTimeout(() => this.spawn(), 2600);
    }
  }

  spawn() {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'spawn', name: this.name, color: this.i % 12 }));
  }

  /** Un giro al azar cada ~0,4–1,2 s, esquivando la pared de adelante. */
  think(k) {
    const [, x, y, dir] = this.head;
    this.next = k + 8 + Math.floor(Math.random() * 16);
    const ahead = (d, n) => [x + [0, 1, 0, -1][d] * n, y + [-1, 0, 1, 0][d] * n];
    const wall = (d, n) => {
      const [ax, ay] = ahead(d, n);
      return ax < 1 || ay < 1 || ax > this.size - 2 || ay > this.size - 2;
    };
    const opts = [dir, (dir + 1) & 3, (dir + 3) & 3];
    let d = Math.random() < 0.55 ? dir : opts[1 + (Math.random() < 0.5 ? 0 : 1)];
    if (wall(d, 6)) d = opts.find((o) => !wall(o, 8)) ?? d;
    if (d === dir && Math.random() < 0.85) return;
    this.input(d, k);
  }

  input(d, k) {
    const turbo = Math.random() < 0.15 ? 1 : 0;
    this.recent.push([++this.seq, k + 2, d, turbo]);
    if (this.recent.length > 3) this.recent.shift();
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'i', e: this.recent }));
  }
}

async function health() {
  try {
    return await (await fetch(`${HTTP}/health`)).json();
  } catch {
    return null;
  }
}
function cpuTicks(pid) {
  try {
    const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    return Number(f[11]) + Number(f[12]); // utime + stime (ticks de reloj)
  } catch {
    return null;
  }
}

const clients = Array.from({ length: N }, (_, i) => new Client(i + 1));
const code = await clients[0].open(null, 'create');
await Promise.all(clients.slice(1).map((c) => c.open(null, 'join', code)));
await sleep(WARM);
for (const c of clients) c.measuring = true;
const ticks0 = args.pid ? cpuTicks(args.pid) : null;
const t0 = Date.now();
const samples = [];
const timer = setInterval(async () => {
  const h = await health();
  if (h?.rt?.avgTickMs >= 0) samples.push(h.rt.avgTickMs);
}, 1000);
await sleep(SECONDS * 1000);
clearInterval(timer);
const secs = (Date.now() - t0) / 1000;
const ticks1 = args.pid ? cpuTicks(args.pid) : null;
for (const c of clients) c.measuring = false;
const h = await health();
for (const c of clients) c.ws.close();

const perClient = clients.map((c) => c.bytes / secs / 1024);
const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const out = {
  game: GAME,
  clients: N,
  bots: BOTS,
  seconds: Math.round(secs),
  kbPerSecAvg: +avg(perClient).toFixed(2),
  kbPerSecMax: +Math.max(...perClient).toFixed(2),
  snapsPerSec: +avg(clients.map((c) => c.snaps / secs)).toFixed(1),
  msgsPerSec: +avg(clients.map((c) => c.msgs / secs)).toFixed(1),
  deaths: clients.reduce((s, c) => s + c.deaths, 0),
  serverMsPerTickAvg: +avg(samples).toFixed(3),
  serverMsPerTickMax: +Math.max(0, ...samples).toFixed(3),
  rt: h?.rt,
  serverCpuPct: ticks0 !== null && ticks1 !== null ? +(((ticks1 - ticks0) / 100 / secs) * 100).toFixed(1) : undefined,
};
if (args.json) console.log(JSON.stringify(out));
else {
  console.log(`Arena ${GAME}: ${N} personas${BOTS ? ' + bots del servidor' : ' (sin bots)'}, ${out.seconds} s`);
  console.log(`  por cliente:  ${out.kbPerSecAvg} KB/s en promedio (máx. ${out.kbPerSecMax}), ${out.snapsPerSec} snapshots/s, ${out.msgsPerSec} mensajes/s`);
  console.log(`  servidor:     ${out.serverMsPerTickAvg} ms por paso en promedio (máx. ${out.serverMsPerTickMax})${out.serverCpuPct !== undefined ? `, CPU ${out.serverCpuPct}%` : ''}`);
  console.log(`  muertes: ${out.deaths}   rt: ${JSON.stringify(out.rt)}`);
  console.log('  metas del plan: ≤ 1,5 ms por paso y ≤ 15 KB/s por cliente');
}
process.exit(0);
