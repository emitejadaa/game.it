/**
 * game.it — servidor de salas online (minigolf).
 *
 * - Salas por código de 5 letras, 1 a 4 jugadores.
 * - Física autoritativa: el servidor simula cada tiro con el mismo código que el cliente
 *   (public/games/minigolf/shared) y envía la trayectoria a todos.
 * - Protecciones: límite de conexiones y de salas por IP, límite global de salas, rate limit de
 *   mensajes (token bucket), tamaño máximo de mensaje, intentos de unión limitados (evita adivinar
 *   códigos), salas inactivas cerradas, vida máxima de sala, tiempo por turno, heartbeat, orígenes
 *   permitidos y validación estricta de cada mensaje.
 */
import { createServer } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { HOLES, COURSES } from '../public/games/minigolf/shared/holes.js';
import { simulate, shotDuration } from '../public/games/minigolf/shared/physics.js';
import { Match, COLORS } from '../public/games/minigolf/shared/match.js';

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
  roomsPerIpWindow: num('ROOMS_PER_IP', 6), // salas creadas por IP…
  roomsWindowMs: num('ROOMS_WINDOW_MS', 10 * 60e3), // …en esta ventana
  joinsPerMinute: num('JOINS_PER_MIN', 20),
  msgRate: num('MSG_RATE', 12), // mensajes/seg sostenidos
  msgBurst: num('MSG_BURST', 30),
  maxPayload: num('MAX_PAYLOAD', 2048),
  lobbyIdleMs: num('LOBBY_IDLE_MS', 10 * 60e3),
  roomIdleMs: num('ROOM_IDLE_MS', 8 * 60e3),
  roomMaxLifeMs: num('ROOM_MAX_LIFE_MS', 2 * 3600e3),
  turnMs: num('TURN_MS', 35e3),
  graceMs: num('RECONNECT_GRACE_MS', 45e3),
  heartbeatMs: num('HEARTBEAT_MS', 20e3),
  betweenHolesMs: num('BETWEEN_HOLES_MS', 4500),
  maxPlayers: 4,
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
const rooms = new Map(); // code -> room
const ipConns = new Map(); // ip -> count
const ipRooms = new Map(); // ip -> [timestamps]
const ipJoins = new Map(); // ip -> [timestamps]
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

// ---------------- salas ----------------
function roomView(room) {
  return {
    code: room.code,
    host: room.host,
    state: room.state,
    holes: room.holes,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected })),
    match: room.match ? room.match.toJSON() : null,
    holeTime: room.holeStart ? (Date.now() - room.holeStart) / 1000 : 0,
    turnDeadline: room.turnDeadline ? room.turnDeadline - Date.now() : 0,
    busy: Math.max(0, room.busyUntil - Date.now()),
  };
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(data);
}

const sync = (room) => broadcast(room, { t: 'room', room: roomView(room) });
const touch = (room) => (room.lastActivity = Date.now());

function closeRoom(room, reason) {
  clearTimeout(room.turnTimer);
  clearTimeout(room.nextTimer);
  broadcast(room, { t: 'closed', reason });
  for (const p of room.players.values()) if (p.ws) p.ws.room = null;
  rooms.delete(room.code);
  log('room closed', room.code, reason, 'rooms:', rooms.size);
}

function createRoom(ws, name) {
  if (rooms.size >= CFG.maxRooms) return send(ws, { t: 'error', code: 'server_full' });
  if (!windowHit(ipRooms, ws.ip, CFG.roomsPerIpWindow, CFG.roomsWindowMs)) return send(ws, { t: 'error', code: 'too_many_rooms' });
  const code = newCode();
  if (!code) return send(ws, { t: 'error', code: 'server_full' });
  const room = {
    code,
    host: null,
    players: new Map(),
    state: 'lobby',
    holes: 9,
    match: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    holeStart: 0,
    busyUntil: 0,
    turnDeadline: 0,
    turnTimer: null,
    nextTimer: null,
  };
  rooms.set(code, room);
  log('room created', code, 'rooms:', rooms.size);
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
  send(ws, { t: 'joined', code: room.code, id: p.id, token: p.token });
  sync(room);
}

function joinRoom(ws, code, name, token) {
  if (!windowHit(ipJoins, ws.ip, CFG.joinsPerMinute, 60e3)) return send(ws, { t: 'error', code: 'too_many_joins' });
  code = String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
  const room = rooms.get(code);
  if (!room) return send(ws, { t: 'error', code: 'not_found' });
  // reconexión con token
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
      send(ws, { t: 'joined', code: room.code, id: p.id, token: p.token });
      sync(room);
      return;
    }
  }
  if (room.state !== 'lobby') return send(ws, { t: 'error', code: 'in_progress' });
  if (room.players.size >= CFG.maxPlayers) return send(ws, { t: 'error', code: 'room_full' });
  addPlayer(room, ws, name);
}

function leave(ws, reason = 'left') {
  const room = ws.room;
  if (!room) return;
  const p = room.players.get(ws.pid);
  ws.room = null;
  if (!p) return;
  if (reason === 'disconnect' && room.state === 'playing') {
    // en partida se espera un rato por si vuelve
    p.connected = false;
    p.ws = null;
    p.goneAt = Date.now();
    if (room.match?.turn === p.id) scheduleTurn(room, 1500);
    sync(room);
    return;
  }
  removePlayer(room, p.id);
}

function removePlayer(room, id) {
  room.players.delete(id);
  room.match?.deactivate(id);
  if (!room.players.size || ![...room.players.values()].some((p) => p.connected)) return closeRoom(room, 'empty');
  if (room.host === id) room.host = [...room.players.values()].find((p) => p.connected)?.id;
  if (room.match) afterMatchChange(room);
  sync(room);
}

// ---------------- partida ----------------
function startMatch(ws, holes) {
  const room = ws.room;
  if (!room || room.host !== ws.pid) return send(ws, { t: 'error', code: 'not_host' });
  if (room.state === 'playing') return;
  room.holes = COURSES[holes] ? holes : 9;
  room.match = new Match({
    course: COURSES[room.holes],
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color })),
  });
  room.state = 'playing';
  touch(room);
  nextHole(room);
}

function nextHole(room) {
  clearTimeout(room.nextTimer);
  if (!room.match.nextHole()) {
    finish(room);
    return;
  }
  room.holeStart = Date.now();
  room.busyUntil = Date.now() + 1800; // tiempo para la animación de presentación del hoyo
  scheduleTurn(room);
  broadcast(room, { t: 'hole', idx: room.match.holeIdx });
  sync(room);
}

function scheduleTurn(room, delay) {
  clearTimeout(room.turnTimer);
  const m = room.match;
  if (!m || !m.turn) return;
  const p = room.players.get(m.turn);
  const wait = delay ?? Math.max(0, room.busyUntil - Date.now()) + (p?.connected ? CFG.turnMs : 1500);
  room.turnDeadline = Date.now() + wait;
  room.turnTimer = setTimeout(() => {
    if (room.match !== m || !m.turn) return;
    const id = m.turn;
    const outcome = m.skip(id, 1);
    broadcast(room, { t: 'timeout', id });
    if (outcome) broadcast(room, { t: 'outcome', ...outcome });
    afterMatchChange(room);
  }, wait);
}

function afterMatchChange(room) {
  const m = room.match;
  if (m.state === 'playing') {
    scheduleTurn(room);
  } else if (m.state === 'between') {
    clearTimeout(room.turnTimer);
    room.turnDeadline = 0;
    const wait = Math.max(0, room.busyUntil - Date.now()) + CFG.betweenHolesMs;
    room.nextTimer = setTimeout(() => nextHole(room), wait);
  } else if (m.state === 'finished') {
    clearTimeout(room.turnTimer);
    room.nextTimer = setTimeout(() => finish(room), Math.max(0, room.busyUntil - Date.now()) + 800);
  }
  sync(room);
}

function finish(room) {
  room.state = 'finished';
  room.turnDeadline = 0;
  broadcast(room, { t: 'end', standings: room.match.standings() });
  sync(room);
}

function shot(ws, angle, power) {
  const room = ws.room;
  const m = room?.match;
  if (!m || room.state !== 'playing' || m.turn !== ws.pid) return send(ws, { t: 'error', code: 'not_your_turn' });
  if (Date.now() < room.busyUntil) return send(ws, { t: 'error', code: 'busy' });
  if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0 || power > 1) return send(ws, { t: 'error', code: 'bad_shot' });
  const p = m.player(ws.pid);
  const t0 = (Date.now() - room.holeStart) / 1000;
  const res = simulate(m.hole, p.ball, angle, power, t0);
  const dur = shotDuration(res);
  room.busyUntil = Date.now() + dur + 600;
  touch(room);
  const outcome = m.applyShot(ws.pid, res);
  broadcast(room, { t: 'shot', id: ws.pid, res: { path: res.path, events: res.events, x: res.x, y: res.y, holed: res.holed, water: res.water, t0 } });
  if (outcome) broadcast(room, { t: 'outcome', ...outcome });
  afterMatchChange(room);
}

function rematch(ws) {
  const room = ws.room;
  if (!room || room.host !== ws.pid || room.state !== 'finished') return;
  // vuelven al lobby solo los conectados
  for (const p of [...room.players.values()]) if (!p.connected) room.players.delete(p.id);
  room.state = 'lobby';
  room.match = null;
  room.holeStart = 0;
  touch(room);
  sync(room);
}

// ---------------- mensajes ----------------
function onMessage(ws, raw) {
  // token bucket por conexión
  const now = Date.now();
  ws.tokens = Math.min(CFG.msgBurst, ws.tokens + ((now - ws.lastRefill) / 1000) * CFG.msgRate);
  ws.lastRefill = now;
  if (ws.tokens < 1) {
    ws.strikes++;
    if (ws.strikes > 20) ws.close(4008, 'rate_limited');
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

  switch (msg.t) {
    case 'ping':
      return send(ws, { t: 'pong', now });
    case 'create':
      if (ws.room) leave(ws);
      return createRoom(ws, msg.name);
    case 'join':
      if (ws.room) leave(ws);
      return joinRoom(ws, msg.code, msg.name, typeof msg.token === 'string' ? msg.token.slice(0, 64) : null);
    case 'leave':
      return leave(ws, 'left');
    case 'start':
      return startMatch(ws, Number(msg.holes));
    case 'shot':
      return shot(ws, Number(msg.a), Number(msg.p));
    case 'rematch':
      return rematch(ws);
    case 'kick': {
      const room = ws.room;
      if (room && room.host === ws.pid && room.state === 'lobby' && msg.id !== ws.pid && room.players.has(msg.id)) {
        const target = room.players.get(msg.id);
        send(target.ws, { t: 'kicked' });
        if (target.ws) target.ws.room = null;
        removePlayer(room, msg.id);
      }
      return;
    }
    default:
      ws.strikes++;
  }
}

// ---------------- servidor ----------------
const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, conns: wss.clients.size }));
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
  send(ws, { t: 'hello', maxPlayers: CFG.maxPlayers, turnMs: CFG.turnMs });
});

// heartbeat + limpieza periódica
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
    // conexión sin sala y sin mensajes por mucho tiempo
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

http.listen(CFG.port, () => log(`game.it server en :${CFG.port}`, CFG.origins.length ? `orígenes: ${CFG.origins.join(', ')}` : 'orígenes: todos'));

export { HOLES };
