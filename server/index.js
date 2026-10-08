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
 * y `listable` + `listInfo` (aparece en la lista de salas públicas si settings.public). `realtime: true` marca a los juegos que
 * simulan a ritmo fijo: comparten el tope MAX_RT_ROOMS (crear otra devuelve `server_full_rt`) y pueden informar el costo de su
 * paso en `room.avgTickMs` (sale en /health y en la lista de salas). `create` acepta `settings` (opciones iniciales).
 */
import { createServer } from 'node:http';
import { isIP } from 'node:net';
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
import garabato from './games/garabato.js';
import telefono from './games/telefono.js';
import padel from './games/padel.js';
import naval from './games/naval.js';
import estela from './games/estela.js';
import sumo from './games/sumo.js';
import rey from './games/rey.js';
import territorio from './games/territorio.js';

const GAMES = { minigolf, tictactoe, connect4, drift, doodle, clashball, chess, ameba, serpentina, billar, chispa, mecha, garabato, telefono, padel, naval, estela, sumo, rey, territorio };
/** Módulo de un juego por nombre (solo propios: evita "constructor", "__proto__", etc.). */
const gameMod = (g) => (typeof g === 'string' && Object.hasOwn(GAMES, g) ? GAMES[g] : null);
/**
 * Juegos en tiempo real (simulan en el servidor a ritmo fijo): comparten el tope MAX_RT_ROOMS. Un módulo se declara con
 * `realtime: true`; esta lista cubre a los que todavía no lo declaran.
 */
const RT_LEGACY = new Set(['ameba', 'serpentina', 'clashball', 'padel']);
const isRealtime = (game) => !!(GAMES[game]?.realtime || RT_LEGACY.has(game));

const env = (k, d) => (process.env[k] !== undefined ? process.env[k] : d);
const num = (k, d) => Number(env(k, d));

const CFG = {
  port: num('PORT', 8787),
  origins: env('ALLOWED_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // IP del cliente (ver clientIp): por defecto es automática. Opcional: CLIENT_IP_HEADER (encabezado que escribe el proxy, p. ej.
  // cf-connecting-ip) o TRUST_PROXY_HOPS (cantidad de proxies que agregan una entrada a X-Forwarded-For, contando desde la derecha).
  proxyHops: num('TRUST_PROXY_HOPS', 0),
  ipHeader: env('CLIENT_IP_HEADER', '').toLowerCase(),
  maxRooms: num('MAX_ROOMS', 300),
  maxRtRooms: num('MAX_RT_ROOMS', 4), // salas en tiempo real a la vez (el servidor gratis de Render tiene 0,1 CPU)
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
/** IPv6: una casa o un celular reciben un /64 entero, así que se limita por prefijo y no por dirección. */
function normIp(ip) {
  ip = String(ip || '').trim().replace(/^::ffff:(?=\d+\.)/, '');
  if (isIP(ip) !== 6) return ip || '?';
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

const unmap = (ip) => String(ip || '').trim().replace(/^::ffff:(?=\d+\.)/i, '');
const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
/** ¿Es una dirección interna (privada, loopback, enlace local, CGNAT)? Esas nunca son un jugador de internet. */
function isPrivate(ip) {
  ip = unmap(ip);
  if (isIP(ip) === 4) return PRIVATE_V4.some((r) => r.test(ip));
  if (isIP(ip) === 6) return /^(::1?$|f[cd]|fe[89ab])/i.test(ip);
  return true;
}

/**
 * IP del cliente para los límites (conexiones, salas y uniones por IP).
 *  1. Si quien se conecta por TCP es una dirección pública, no hay un proxy nuestro delante: los encabezados los escribe el
 *     propio cliente y no se les cree.
 *  2. Detrás de un proxy (el par TCP es privado, como el balanceador de Render), en este orden: CLIENT_IP_HEADER si está;
 *     TRUST_PROXY_HOPS si está (entrada N desde la derecha de X-Forwarded-For); cf-connecting-ip (Cloudflare lo pisa);
 *     y si no, la primera dirección pública de X-Forwarded-For contando desde la derecha (se saltean los saltos internos).
 *     La entrada de más a la izquierda la escribe el cliente, así que nunca se usa sola.
 */
function clientIp(req) {
  const peer = unmap(req.socket.remoteAddress || '?');
  if (!isPrivate(peer)) return normIp(peer);
  const header = (name) => {
    const v = String(req.headers[name] || '').trim();
    return isIP(v) ? v : '';
  };
  if (CFG.ipHeader && header(CFG.ipHeader)) return normIp(header(CFG.ipHeader));
  const list = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map(unmap)
    .filter(Boolean);
  if (CFG.proxyHops) {
    const ip = list.length >= CFG.proxyHops ? list[list.length - CFG.proxyHops] : '';
    if (isIP(ip)) return normIp(ip);
  } else {
    if (header('cf-connecting-ip')) return normIp(header('cf-connecting-ip'));
    for (let i = list.length - 1; i >= 0; i--) if (isIP(list[i]) && !isPrivate(list[i])) return normIp(list[i]);
  }
  return normIp(peer);
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
    /** Manda un texto JSON ya armado (para payloads grandes que se reparten a varios jugadores sin volver a serializarlos). */
    sendRaw: (pid, text) => {
      const ws = room.players.get(pid)?.ws;
      if (ws && ws.readyState === 1) ws.send(text);
    },
    sync: () => sync(room),
    /** Cierra la sala (los clientes reciben { t: 'closed', reason }): para errores graves del módulo. */
    close: (reason) => closeRoom(room, reason),
    touch: () => touch(room),
    players: () => [...room.players.values()],
    connected: (pid) => !!room.players.get(pid)?.connected,
    /** Bytes que esperan en el socket de un jugador (para saltear snapshots descartables si el cliente no da abasto). */
    bufferedAmount: (pid) => room.players.get(pid)?.ws?.bufferedAmount || 0,
    setTimer(name, ms, fn) {
      clearTimeout(room.timers.get(name));
      room.timers.set(
        name,
        setTimeout(() => {
          room.timers.delete(name);
          if (rooms.get(room.code) !== room) return;
          try {
            fn();
          } catch (e) {
            log('error', room.game, room.code, 'timer', name, e?.stack || e);
          }
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

/** Salas en tiempo real abiertas y el costo medio de su paso (lo informan los módulos en `room.avgTickMs`). */
function rtStats() {
  let n = 0;
  let sum = 0;
  let timed = 0;
  for (const r of rooms.values()) {
    if (!isRealtime(r.game)) continue;
    n++;
    if (r.avgTickMs > 0) {
      sum += r.avgTickMs;
      timed++;
    }
  }
  return { rooms: n, max: CFG.maxRtRooms, avgTickMs: timed ? Math.round((sum / timed) * 1000) / 1000 : 0 };
}

function createRoom(ws, name, game, settings) {
  const mod = gameMod(game);
  if (!mod) return send(ws, { t: 'error', code: 'bad_game' });
  if (rooms.size >= CFG.maxRooms) return send(ws, { t: 'error', code: 'server_full' });
  if (isRealtime(game) && rtStats().rooms >= CFG.maxRtRooms) return send(ws, { t: 'error', code: 'server_full_rt' });
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
  // opciones elegidas al crear (para los juegos que arrancan solos y no pasan por el lobby)
  if (mod.settings && settings && typeof settings === 'object') {
    try {
      room.settings = mod.settings(room.settings, settings);
    } catch (e) {
      log('error', game, 'create settings', e?.stack || e);
    }
  }
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
  if (room.players.size >= mod.maxPlayers && (room.state !== 'playing' || mod.lateJoin)) {
    // alguien que se desconectó (y espera volver) no puede dejar afuera a quien quiere entrar: se libera el lugar del que hace más que se fue (nunca el del anfitrión)
    const ghost = [...room.players.values()].filter((p) => !p.connected && p.id !== room.host).sort((a, b) => a.goneAt - b.goneAt)[0];
    if (ghost) removePlayer(room, ghost.id);
    if (rooms.get(room.code) !== room) return send(ws, { t: 'error', code: 'not_found' });
  }
  if (room.players.size >= mod.maxPlayers) return send(ws, { t: 'error', code: 'room_full' });
  addPlayer(room, ws, name);
}

function leave(ws, reason = 'left') {
  const room = ws.room;
  if (!room) return;
  const p = room.players.get(ws.pid);
  ws.room = null;
  if (!p) return;
  if (reason === 'disconnect') {
    // En cualquier estado se espera la reconexión (graceMs): en el lobby, compartir el link desde el celular
    // suspende la pestaña y corta el socket. El barrido del heartbeat lo saca si no vuelve a tiempo.
    p.connected = false;
    p.ws = null;
    p.goneAt = Date.now();
    if (room.state === 'playing') GAMES[room.game].onDisconnect?.(room, room.api, p.id);
    sync(room);
    return;
  }
  removePlayer(room, p.id);
}

function removePlayer(room, id) {
  room.players.delete(id);
  if (!room.players.size) return closeRoom(room, 'empty');
  // quedan solo desconectados dentro de su gracia: la sala espera (el barrido los saca y la última baja la cierra)
  if (room.host === id) {
    const rest = [...room.players.values()];
    room.host = (rest.find((p) => p.connected) || rest[0]).id;
  }
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
      return send(ws, { t: 'pong', now, ...(Number.isFinite(msg.c) ? { c: msg.c } : {}) }); // `c` es el reloj del cliente: sirve para medir el ping
    case 'create':
      if (room) leave(ws);
      return createRoom(ws, msg.name, typeof msg.game === 'string' ? msg.game : 'minigolf', msg.settings);
    case 'join':
      if (room) leave(ws);
      return joinRoom(ws, msg.code, msg.name, typeof msg.token === 'string' ? msg.token.slice(0, 64) : null, typeof msg.game === 'string' ? msg.game : null);
    case 'leave':
      return leave(ws, 'left');
    case 'list': {
      // salas públicas de un juego (solo módulos con `listable`)
      const mod = gameMod(msg.game);
      if (!mod?.listable) return send(ws, { t: 'list', game: msg.game, rooms: [], rt: rtStats() });
      const list = [...rooms.values()]
        .filter((r) => r.game === msg.game && r.settings?.public)
        .slice(0, 60)
        .map((r) => ({ code: r.code, n: r.players.size, max: mod.maxPlayers, state: r.state, ...mod.listInfo?.(r) }));
      return send(ws, { t: 'list', game: msg.game, rooms: list, rt: rtStats() });
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
      // primero se valida con los que están conectados; solo si se va a empezar se saca a quien se desconectó y no volvió (no ocupa lugar en la partida)
      if ([...room.players.values()].filter((p) => p.connected).length < (mod.minPlayers || 1)) return send(ws, { t: 'error', code: 'need_players' });
      for (const p of [...room.players.values()]) if (!p.connected) removePlayer(room, p.id);
      if (rooms.get(room.code) !== room) return;
      if (mod.settings) room.settings = mod.settings(room.settings, msg.settings || msg);
      const why = mod.canStart?.(room);
      if (why) return send(ws, { t: 'error', code: why });
      room.state = 'playing';
      touch(room);
      try {
        mod.start(room, room.api);
      } catch (e) {
        // un error al arrancar no deja la sala trabada en 'playing' sin partida
        log('error', room.game, room.code, 'start', e?.stack || e);
        for (const t of room.timers.values()) clearTimeout(t);
        room.timers.clear();
        room.state = 'lobby';
        room.data = null;
        send(ws, { t: 'error', code: 'start_failed' });
      }
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
        else if (handled !== undefined && room.state === 'playing') touch(room);
        if (handled !== undefined) return;
      }
      if (room.state !== 'playing') return;
      const ok = mod.message?.(room, room.api, p, msg);
      if (ok === false) ws.strikes++;
      else touch(room); // jugar cuenta como actividad: la sala no se cierra por 'idle' en pleno partido
    }
  }
}

// ---------------- servidor ----------------
const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, conns: wss.clients.size, games: Object.keys(GAMES), rt: rtStats() }));
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
    try {
      onMessage(ws, data.toString());
    } catch (e) {
      // un error en el módulo de un juego no tira abajo las demás salas
      log('error', ws.room?.game, ws.room?.code, e?.stack || e);
    }
  });
  ws.on('close', () => {
    const n = (ipConns.get(ws.ip) || 1) - 1;
    n ? ipConns.set(ws.ip, n) : ipConns.delete(ws.ip);
    try {
      leave(ws, 'disconnect');
    } catch (e) {
      log('error', ws.room?.game, ws.room?.code, 'close', e?.stack || e);
    }
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
    try {
      const idle = now - room.lastActivity;
      if (now - room.createdAt > CFG.roomMaxLifeMs) closeRoom(room, 'max_life');
      else if (room.state !== 'playing' && idle > CFG.lobbyIdleMs) closeRoom(room, 'idle');
      else if (room.state === 'playing' && idle > CFG.roomIdleMs) closeRoom(room, 'idle');
      else
        for (const p of [...room.players.values()])
          if (!p.connected && p.goneAt && now - p.goneAt > CFG.graceMs && rooms.get(room.code) === room) removePlayer(room, p.id);
    } catch (e) {
      // un módulo que falla al sacar a un jugador no frena el barrido de las demás salas
      log('error', room.game, room.code, 'sweep', e?.stack || e);
    }
  }
  for (const map of [ipRooms, ipJoins])
    for (const [ip, list] of map) if (!list.some((t) => now - t < CFG.roomsWindowMs)) map.delete(ip);
}, CFG.heartbeatMs);

// Último recurso: se registra y se sigue (reiniciar el proceso cortaría todas las salas). Si los errores
// se disparan, se sale y Render levanta uno nuevo.
let fatal = [];
const onFatal = (kind) => (e) => {
  log('fatal', kind, e?.stack || e);
  const now = Date.now();
  fatal = fatal.filter((t) => now - t < 60e3);
  fatal.push(now);
  if (fatal.length > 20) process.exit(1);
};
process.on('uncaughtException', onFatal('uncaughtException'));
process.on('unhandledRejection', onFatal('unhandledRejection'));

const onListenError = (e) => {
  // puerto ocupado o sin permiso: si el proceso siguiera vivo (el heartbeat lo mantiene) quedaría colgado sin escuchar
  log('fatal', 'listen', e?.message || e);
  process.exit(1);
};
http.on('error', onListenError);
wss.on('error', onListenError);

http.listen(CFG.port, () => log(`game.it server en :${CFG.port}`, `juegos: ${Object.keys(GAMES).join(', ')}`, CFG.origins.length ? `orígenes: ${CFG.origins.join(', ')}` : 'orígenes: todos'));
