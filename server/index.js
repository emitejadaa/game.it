/**
 * game.it — servidor de salas online.
 *
 * Núcleo genérico de salas (código de 5 letras, anfitrión, lobby, reconexión) y un módulo por juego
 * en ./games. Cada módulo define sus reglas; el núcleo aplica las protecciones para todos:
 * límite de conexiones y de salas por IP, límite global de salas, rate limit de mensajes (token
 * bucket), tamaño máximo de mensaje, intentos de unión limitados (evita adivinar códigos), salas
 * inactivas cerradas, vida máxima de sala, heartbeat, orígenes permitidos y validación de mensajes.
 *
 * Opcionales por módulo: `lateJoin` (se puede entrar con la partida en curso), `onJoin`,
 * `removed` (sale un jugador, en cualquier estado), `command` (mensajes propios en cualquier
 * estado: devuelve true si lo manejó, false si era inválido), `canStart` (código de error o null)
 * y `listable` + `listInfo` (aparece en la lista de salas públicas si settings.public).
 */
import { createServer } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import minigolf from './games/minigolf.js';
import tictactoe from './games/tictactoe.js';
import connect4 from './games/connect4.js';
import drift from './games/drift.js';
import doodle from './games/doodle.js';
import clashball from './games/clashball.js';
import chess from './games/chess.js';
import ameba from './games/ameba.js';
import serpentina from './games/serpentina.js';
import billar from './games/billar.js';
import chispa from './games/chispa.js';
import mecha from './games/mecha.js';

const GAMES = { minigolf, tictactoe, connect4, drift, doodle, clashball, chess, ameba, serpentina, billar, chispa, mecha };
/** Módulo de un juego por nombre (solo propios: evita "constructor", "__proto__", etc.). */
const gameMod = (g) => (typeof g === 'string' && Object.hasOwn(GAMES, g) ? GAMES[g] : null);

const env = (k, d) => (process.env[k] !== undefined ? process.env[k] : d);
const num = (k, d) => Number(env(k, d));

const CFG = {
  port: num('PORT', 8787),
  origins: env('ALLOWED_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: env('TRUST_PROXY', '1') === '1',
  maxRooms: num('MAX_ROOMS', 300),
  maxConnPerIp: num('MAX_CONN_PER_IP', 6),
  roomsPerIpWindow: num('ROOMS_PER_IP', 6),
  roomsWindowMs: num('ROOMS_WINDOW_MS', 10 * 60e3),
  joinsPerMinute: num('JOINS_PER_MIN', 20),
  msgRate: num('MSG_RATE', 30), // mensajes/seg sostenidos (los juegos en tiempo real mandan ~15/s)
  msgBurst: num('MSG_BURST', 60),
  maxPayload: num('MAX_PAYLOAD', 2048),
  lobbyIdleMs: num('LOBBY_IDLE_MS', 10 * 60e3),
  roomIdleMs: num('ROOM_IDLE_MS', 8 * 60e3),
  roomMaxLifeMs: num('ROOM_MAX_LIFE_MS', 2 * 3600e3),
  graceMs: num('RECONNECT_GRACE_MS', 45e3),
  heartbeatMs: num('HEARTBEAT_MS', 20e3),
};

const COLORS = ['#ff5a5f', '#3ec1ff', '#ffc93c', '#7bd389', '#c77dff', '#ff9f43', '#2de2e6', '#f15bb5'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
const rooms = new Map();
const ipConns = new Map();
const ipRooms = new Map();
const ipJoins = new Map();
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------- utilidades ----------------
function clientIp(req) {
  const fwd = CFG.trustProxy && req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '?').trim();
}

function windowHit(map, ip, limit, windowMs) {
  const now = Date.now();
  const list = (map.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    map.set(ip, list);
    return false;
  }
  list.push(now);
  map.set(ip, list);
  return true;
}

function newCode() {
  for (let tries = 0; tries < 50; tries++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

const cleanName = (v) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16) || 'Jugador';

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

// ---------------- API para los módulos de juego ----------------
function makeApi(room) {
  return {
    broadcast: (msg, exceptId) => broadcast(room, msg, exceptId),
    send: (pid, msg) => send(room.players.get(pid)?.ws, msg),
    sync: () => sync(room),
    touch: () => touch(room),
    players: () => [...room.players.values()],
    connected: (pid) => !!room.players.get(pid)?.connected,
    setTimer(name, ms, fn) {
      clearTimeout(room.timers.get(name));
      room.timers.set(
        name,
        setTimeout(() => {
          room.timers.delete(name);
          if (rooms.get(room.code) === room) fn();
        }, Math.max(0, ms)),
      );
    },
    clearTimer(name) {
      clearTimeout(room.timers.get(name));
      room.timers.delete(name);
    },
    /** Termina la partida: la sala queda en "finished" hasta la revancha. */
    end(payload) {
      room.state = 'finished';
      broadcast(room, { t: 'end', ...payload });
      sync(room);
    },
    /** Vuelve la sala al lobby (por ejemplo si quedan menos jugadores que el mínimo). */
    toLobby() {
      for (const k of room.timers.keys()) this.clearTimer(k);
      room.state = 'lobby';
      room.data = null;
      sync(room);
    },
  };
}

// ---------------- salas ----------------
function roomView(room) {
  const mod = GAMES[room.game];
  return {
    code: room.code,
    game: room.game,
    host: room.host,
    state: room.state,
    settings: room.settings,
    now: Date.now(),
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected })),
    ...(mod.view ? mod.view(room) : {}),
  };
}

function broadcast(room, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) if (p.id !== exceptId && p.ws && p.ws.readyState === 1) p.ws.send(data);
}

const sync = (room) => broadcast(room, { t: 'room', room: roomView(room) });
const touch = (room) => (room.lastActivity = Date.now());

function closeRoom(room, reason) {
  for (const t of room.timers.values()) clearTimeout(t);
  room.timers.clear();
  broadcast(room, { t: 'closed', reason });
  for (const p of room.players.values()) if (p.ws) p.ws.room = null;
  rooms.delete(room.code);
  log('room closed', room.code, room.game, reason, 'rooms:', rooms.size);
}

function createRoom(ws, name, game) {
  const mod = gameMod(game);
  if (!mod) return send(ws, { t: 'error', code: 'bad_game' });
  if (rooms.size >= CFG.maxRooms) return send(ws, { t: 'error', code: 'server_full' });
  if (!windowHit(ipRooms, ws.ip, CFG.roomsPerIpWindow, CFG.roomsWindowMs)) return send(ws, { t: 'error', code: 'too_many_rooms' });
  const code = newCode();
  if (!code) return send(ws, { t: 'error', code: 'server_full' });
  const room = {
    code,
    game,
    host: null,
    players: new Map(),
    state: 'lobby',
    createdAt: Date.now(),
    lastActivity: Date.now(),
    timers: new Map(),
    data: null, // estado propio del juego
    settings: mod.defaults ? { ...mod.defaults } : {},
  };
  room.api = makeApi(room);
  rooms.set(code, room);
  log('room created', code, game, 'rooms:', rooms.size);
  addPlayer(room, ws, name);
}

function addPlayer(room, ws, name) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  const p = {
    id: randomBytes(6).toString('hex'),
    token: randomBytes(16).toString('hex'),
    name: cleanName(name),
    color: COLORS.find((c) => !used.has(c)) || COLORS[0],
    ws,
    connected: true,
    goneAt: 0,
  };
  room.players.set(p.id, p);
  if (!room.host) room.host = p.id;
  ws.room = room;
  ws.pid = p.id;
  touch(room);
  send(ws, { t: 'joined', code: room.code, game: room.game, id: p.id, token: p.token });
  GAMES[room.game].onJoin?.(room, room.api, p.id);
  sync(room);
}

function joinRoom(ws, code, name, token, game) {
  if (!windowHit(ipJoins, ws.ip, CFG.joinsPerMinute, 60e3)) return send(ws, { t: 'error', code: 'too_many_joins' });
  code = String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
  const room = rooms.get(code);
  if (!room || (game && room.game !== game)) return send(ws, { t: 'error', code: 'not_found' });
  if (token) {
    const p = [...room.players.values()].find((x) => x.token === token);
    if (p) {
      if (p.ws && p.ws !== ws) {
        p.ws.room = null;
        p.ws.close(4000, 'replaced');
      }
      p.ws = ws;
      p.connected = true;
      p.goneAt = 0;
      ws.room = room;
      ws.pid = p.id;
      touch(room);
      send(ws, { t: 'joined', code: room.code, game: room.game, id: p.id, token: p.token });
      GAMES[room.game].onReconnect?.(room, room.api, p.id);
      sync(room);
      return;
    }
  }
  const mod = GAMES[room.game];
  if (room.state !== 'lobby' && !mod.lateJoin) return send(ws, { t: 'error', code: 'in_progress' });
  if (room.players.size >= mod.maxPlayers) return send(ws, { t: 'error', code: 'room_full' });
  addPlayer(room, ws, name);
}

function leave(ws, reason = 'left') {
  const room = ws.room;
  if (!room) return;
  const p = room.players.get(ws.pid);
  ws.room = null;
  if (!p) return;
  if (reason === 'disconnect' && room.state === 'playing') {
    p.connected = false;
    p.ws = null;
    p.goneAt = Date.now();
    GAMES[room.game].onDisconnect?.(room, room.api, p.id);
    sync(room);
    return;
  }
  removePlayer(room, p.id);
}

function removePlayer(room, id) {
  room.players.delete(id);
  if (!room.players.size || ![...room.players.values()].some((p) => p.connected)) return closeRoom(room, 'empty');
  if (room.host === id) room.host = [...room.players.values()].find((p) => p.connected)?.id;
  GAMES[room.game].removed?.(room, room.api, id);
  if (room.state === 'playing') GAMES[room.game].leave?.(room, room.api, id);
  sync(room);
}

// ---------------- mensajes ----------------
function onMessage(ws, raw) {
  const now = Date.now();
  ws.tokens = Math.min(CFG.msgBurst, ws.tokens + ((now - ws.lastRefill) / 1000) * CFG.msgRate);
  ws.lastRefill = now;
  if (ws.tokens < 1) {
    ws.strikes++;
    if (ws.strikes > 40) ws.close(4008, 'rate_limited');
    return;
  }
  ws.tokens -= 1;

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    ws.strikes++;
    return;
  }
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
  ws.lastMsg = now;
  const room = ws.room;

  switch (msg.t) {
    case 'ping':
      return send(ws, { t: 'pong', now });
    case 'create':
      if (room) leave(ws);
      return createRoom(ws, msg.name, typeof msg.game === 'string' ? msg.game : 'minigolf');
    case 'join':
      if (room) leave(ws);
      return joinRoom(ws, msg.code, msg.name, typeof msg.token === 'string' ? msg.token.slice(0, 64) : null, typeof msg.game === 'string' ? msg.game : null);
    case 'leave':
      return leave(ws, 'left');
    case 'list': {
      // salas públicas de un juego (solo módulos con `listable`)
      const mod = gameMod(msg.game);
      if (!mod?.listable) return send(ws, { t: 'list', game: msg.game, rooms: [] });
      const list = [...rooms.values()]
        .filter((r) => r.game === msg.game && r.settings?.public)
        .slice(0, 60)
        .map((r) => ({ code: r.code, n: r.players.size, max: mod.maxPlayers, state: r.state, ...mod.listInfo?.(r) }));
      return send(ws, { t: 'list', game: msg.game, rooms: list });
    }
    case 'settings': {
      // el anfitrión cambia opciones en el lobby (pista, vueltas, hoyos…)
      if (!room || room.host !== ws.pid || room.state !== 'lobby') return;
      const mod = GAMES[room.game];
      if (mod.settings) {
        room.settings = mod.settings(room.settings, msg.settings || {});
        touch(room);
        sync(room);
      }
      return;
    }
    case 'start': {
      if (!room) return;
      if (room.host !== ws.pid) return send(ws, { t: 'error', code: 'not_host' });
      if (room.state === 'playing') return;
      const mod = GAMES[room.game];
      const active = [...room.players.values()].filter((p) => p.connected);
      if (active.length < (mod.minPlayers || 1)) return send(ws, { t: 'error', code: 'need_players' });
      if (mod.settings) room.settings = mod.settings(room.settings, msg.settings || msg);
      const why = mod.canStart?.(room);
      if (why) return send(ws, { t: 'error', code: why });
      room.state = 'playing';
      touch(room);
      mod.start(room, room.api);
      sync(room);
      return;
    }
    case 'rematch': {
      if (!room || room.host !== ws.pid || room.state !== 'finished') return;
      for (const p of [...room.players.values()]) if (!p.connected) room.players.delete(p.id);
      room.api.toLobby();
      touch(room);
      return;
    }
    case 'kick': {
      const kickable = room && (room.state === 'lobby' || GAMES[room.game].lateJoin);
      if (kickable && room.host === ws.pid && msg.id !== ws.pid && room.players.has(msg.id)) {
        const target = room.players.get(msg.id);
        send(target.ws, { t: 'kicked' });
        if (target.ws) target.ws.room = null;
        removePlayer(room, msg.id);
      }
      return;
    }
    default: {
      // mensajes propios de cada juego
      if (!room) return;
      const p = room.players.get(ws.pid);
      if (!p) return;
      const mod = GAMES[room.game];
      if (mod.command) {
        const handled = mod.command(room, room.api, p, msg);
        if (handled === false) ws.strikes++;
        if (handled !== undefined) return;
      }
      if (room.state !== 'playing') return;
      const ok = mod.message?.(room, room.api, p, msg);
      if (ok === false) ws.strikes++;
    }
  }
}

// ---------------- servidor ----------------
const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, conns: wss.clients.size, games: Object.keys(GAMES) }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('game.it server');
});

const wss = new WebSocketServer({
  server: http,
  maxPayload: CFG.maxPayload,
  perMessageDeflate: false,
  verifyClient: ({ req, origin }, cb) => {
    if (CFG.origins.length && !CFG.origins.includes(origin)) return cb(false, 403, 'origin');
    const ip = clientIp(req);
    if ((ipConns.get(ip) || 0) >= CFG.maxConnPerIp) return cb(false, 429, 'too many connections');
    cb(true);
  },
});

wss.on('connection', (ws, req) => {
  ws.ip = clientIp(req);
  ipConns.set(ws.ip, (ipConns.get(ws.ip) || 0) + 1);
  ws.tokens = CFG.msgBurst;
  ws.lastRefill = Date.now();
  ws.lastMsg = Date.now();
  ws.strikes = 0;
  ws.alive = true;
  ws.room = null;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (data, isBinary) => {
    if (isBinary) return ws.close(1003, 'binary');
    onMessage(ws, data.toString());
  });
  ws.on('close', () => {
    const n = (ipConns.get(ws.ip) || 1) - 1;
    n ? ipConns.set(ws.ip, n) : ipConns.delete(ws.ip);
    leave(ws, 'disconnect');
  });
  ws.on('error', () => {});
  send(ws, { t: 'hello', now: Date.now() });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
    if (!ws.room && Date.now() - ws.lastMsg > 5 * 60e3) ws.close(4001, 'idle');
  }
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    const idle = now - room.lastActivity;
    if (now - room.createdAt > CFG.roomMaxLifeMs) closeRoom(room, 'max_life');
    else if (room.state !== 'playing' && idle > CFG.lobbyIdleMs) closeRoom(room, 'idle');
    else if (room.state === 'playing' && idle > CFG.roomIdleMs) closeRoom(room, 'idle');
    else
      for (const p of [...room.players.values()])
        if (!p.connected && p.goneAt && now - p.goneAt > CFG.graceMs) removePlayer(room, p.id);
  }
  for (const map of [ipRooms, ipJoins])
    for (const [ip, list] of map) if (!list.some((t) => now - t < CFG.roomsWindowMs)) map.delete(ip);
}, CFG.heartbeatMs);

http.listen(CFG.port, () => log(`game.it server en :${CFG.port}`, `juegos: ${Object.keys(GAMES).join(', ')}`, CFG.origins.length ? `orígenes: ${CFG.origins.join(', ')}` : 'orígenes: todos'));
