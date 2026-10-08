/* Rey de la Colina — game.it
 * Discos en una arena cuadrada con paredes que rebotan y tres pozos. Una colina (un círculo) cambia de lugar cada 25 s y avisa
 * 3 s antes adónde va: quien está SOLO adentro suma 1 punto por segundo (si hay dos o más, nadie). Empujón y Onda para sacar a
 * los demás. Gana el primero en llegar a 100 o, a los 3 min, el que más tiene; después resultados y partida nueva.
 * Online (arena con gente y bots, sala privada) o sin conexión contra bots: en los dos casos el cliente recibe los mismos
 * mensajes y corre el mismo mundo determinista (shared/world.js, física en /shared/arena-physics.js).
 *
 * Red (kit en /shared/net): el disco propio se simula acá con el MISMO paso que el servidor (stepOwn, con paredes) y va
 * adelantado un poco, así que responde a la entrada en el mismo cuadro; cada snapshot (15 por segundo) trae el estado
 * autoritativo y el último `seq` aplicado y se reconcilia (la diferencia se disuelve en 150 ms y por encima de 40 px se salta).
 * Los demás discos se dibujan unos 100 ms atrás, interpolados entre snapshots; la colina, los pozos y las Ondas, a esa misma hora.
 */
import { World, CFG, PH, PALETTE } from './shared/world.js';
import { brain, think, BOT_NAMES, OFFLINE_LEVELS } from './shared/bots.js';
import { Viewer } from './shared/sync.js';
import { ArenaLobby } from '/shared/arena-lobby.js';
import { defaultName } from '/shared/online.js';
import { SnapshotBuffer } from '/shared/net/interp.js';
import { Predictor } from '/shared/net/predict.js';
import { InputSender } from '/shared/net/input.js';
import { clamp } from '/shared/net/clock.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { DiscRenderer } from './render.js';
import { Controls } from './controls.js';
import { CTRL, MOVE_STILL, OfflineSession, MoveGate, cloneOwn, encodeMove, fitView, formatTime, hillAt, matchLeft, ownFromEntry, ownPos, resultRows, stepOwn } from './logic.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const TPS = CFG.tps;
const TICK_MS = 1000 / TPS;

const TXT = {
  title: { es: 'Rey de la Colina', en: 'King of the Hill' },
  tagline: { es: 'quedate solo en la colina y sacá a los demás', en: 'hold the hill alone and shove the rest off' },
  score: { es: 'Puntos', en: 'Points' },
  top: { es: 'Ranking', en: 'Leaderboard' },
  paused: { es: 'Pausa', en: 'Paused' },
  pauseOnline: { es: 'La partida sigue mientras mirás el menú.', en: 'The match keeps going while you look at the menu.' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  copyLink: { es: 'Copiar link de la sala', en: 'Copy room link' },
  again: { es: 'Seguir jugando', en: 'Keep playing' },
  matchOver: { es: 'Fin de la partida', en: 'Match over' },
  youWonMatch: { es: '¡Sos el Rey de la Colina!', en: 'You are King of the Hill!' },
  wonMatch: { es: 'Ganó {n}', en: '{n} wins' },
  noWinner: { es: 'Nadie llegó a la colina', en: 'Nobody made it to the hill' },
  nextMatch: { es: 'Partida nueva en {s}', en: 'New match in {s}' },
  statPlace: { es: 'puesto', en: 'place' },
  statScore: { es: 'puntos', en: 'points' },
  statFalls: { es: 'caídas', en: 'falls' },
  statTime: { es: 'duración', en: 'length' },
  ko: { es: 'Mandaste a {n} al pozo', en: 'You sent {n} into a pit' },
  rank: { es: 'Puesto {r}', en: 'Rank {r}' },
  goal: { es: '{n} {p} / {g}', en: '{n} {p} / {g}' },
  goalNone: { es: 'Meta {g}', en: 'Goal {g}' },
  hsFree: { es: 'Colina libre', en: 'Hill is free' },
  hsMe: { es: 'Sos el Rey: +1 por segundo', en: 'You are King: +1 per second' },
  hsOther: { es: '{n} tiene la colina', en: '{n} holds the hill' },
  hsFight: { es: 'Disputada: nadie suma', en: 'Contested: no points' },
  moving: { es: 'La colina se muda', en: 'The hill is moving' },
  fell: { es: 'Caíste al pozo', en: 'You fell in a pit' },
  fellBy: { es: '{n} te mandó al pozo', en: '{n} sent you into a pit' },
  respawnIn: { es: 'Volvés en {s}', en: 'Back in {s}' },
  respawning: { es: 'Volviendo…', en: 'Coming back…' },
  go: { es: '¡A la colina!', en: 'To the hill!' },
  goSub: { es: 'Primero a {g} puntos', en: 'First to {g} points' },
  waiting: { es: 'Esperando jugadores…', en: 'Waiting for players…' },
  hintDesk: { es: '{k} para moverte · Espacio = empujón · E = onda', en: '{k} to move · Space = shove · E = wave' },
  hintTouch: { es: 'Joystick a la izquierda · botones: empujón y onda', en: 'Joystick on the left · buttons: shove and wave' },
  keysDesk: { es: '{k} · Espacio = empujón · E = onda', en: '{k} · Space = shove · E = wave' },
  keyNames: { es: { both: 'Flechas o WASD', arrows: 'Flechas', wasd: 'WASD' }, en: { both: 'Arrows or WASD', arrows: 'Arrows', wasd: 'WASD' } },
  keysTouch: { es: 'Joystick a la izquierda · botones: empujón y onda', en: 'Joystick on the left · buttons: shove and wave' },
  lost: { es: 'Se cortó la conexión.', en: 'Connection lost.' },
};
const keyName = (lang) => TXT.keyNames[lang || (G.prefs.lang === 'en' ? 'en' : 'es')][G.prefs.keys] || TXT.keyNames.es.both;
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k }) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};

// ---------------------------------------------------------------- estado
const S = {
  mode: 'demo', // demo (el fondo del menú) | online | offline
  screen: null, // null (jugando) | pause | over
  me: 0,
  alive: false, // en la arena
  hold: false, // pausa propia (sin conexión: congela el mundo)
  suspended: false, // pausa del portal
  frozen: false, // sin conexión con el servidor: el disco propio espera
  half: CFG.half,
  discR: CFG.discR,
  players: new Map(), // num → { name, color, bot }
  lb: [],
  buf: new SnapshotBuffer({ delay: 100, minDelay: 80, maxDelay: 260, maxExtrap: 120, extrapolate: ['x', 'y'] }),
  tf: null, // paso (con decimales) en el que va el disco propio
  lastK: 0,
  ri: { k: 0, phase: PH.play, n: 0, left: 0, hill: 0, next: 0, hillIn: 0, occ: 0, at: 0 }, // lo último que dijo el servidor de la partida
  result: null, // { n, winner, top, time } de la última partida terminada
  own: { cdFrac: 1, ready: true, wcdFrac: 1, wready: true, fx: 0, fy: -1, score: 0 },
  meKnown: false,
  pendingSpawn: false,
  spawnAt: 0, // hora (performance.now) desde la que se puede pedir reaparecer
  lastSpawnTry: 0,
  falls: 0, // caídas propias en esta partida
  lastOcc: 0,
  deadBy: 0,
  lastBeep: -1,
  lastWaveAt: -1e9,
  off: null,
  fx: [], // caídas y Ondas { t, kind, x, y, color, by, num } a mostrar a la hora del servidor que corresponde
  lastT: performance.now(),
  dbg: { err: [], snapped: 0, snaps: 0, ack: [], sent: new Map(), frames: 0, fps: 0, work: 0, t0: performance.now(), resp: [] },
};
const renderer = new DiscRenderer($('cv'), PALETTE);
const pr = new Predictor({ step: (st, h, tick) => stepOwn(st, h, tick), clone: cloneOwn, pos: ownPos, smoothMs: 150, snapDist: 40 });
pr.seq = Math.floor(Date.now() / 50); // los `seq` no se repiten si se recarga la página dentro de la gracia del servidor
const tx = new InputSender({ send: (m) => send(m), redundancy: 3, keepaliveMs: 250 });
const gate = new MoveGate(50);
const ctl = new Controls({ stage: $('cv'), stick: $('stick'), knob: $('knob'), dashBtn: $('dash'), waveBtn: $('wave'), enabled: () => canAct(), onDash: () => doDash(), onWave: () => doWave() });
/** ¿Se puede mandar entrada ahora? (en pie, partida en marcha, sin pantallas ni cortes) */
const canAct = () => S.mode !== 'demo' && S.alive && S.screen !== 'pause' && !S.hold && !S.frozen && !S.suspended && !!pr.state && S.ri.phase === PH.play;

// ---------------------------------------------------------------- menú y red
const lobby = new ArenaLobby({
  game: 'rey',
  mount: $('lobby'),
  title: TXT.title,
  tagline: TXT.tagline,
  palette: PALETTE,
  logo: makeLogo(),
  keys: () => t('keysDesk', { k: keyName() }),
  touchKeys: () => t('keysTouch'),
  settings: [],
  offline: {
    levels: [
      { id: 'easy', label: { es: 'Fácil', en: 'Easy' }, hint: { es: '4 bots distraídos', en: '4 easygoing bots' } },
      { id: 'normal', label: { es: 'Normal', en: 'Normal' }, hint: { es: '6 bots, algunos ágiles', en: '6 bots, some sharp' } },
      { id: 'hard', label: { es: 'Difícil', en: 'Hard' }, hint: { es: '8 bots que pelean la colina', en: '8 bots that fight for the hill' } },
    ],
  },
  onJoin: ({ rejoined }) => (rejoined ? onRejoined() : enterOnline()),
  onMessage: (m) => onMsg(m),
  onOffline: ({ name, color, level }) => startOffline(level, name, color),
  onLeave: () => goMenu(true),
  onNotice: (text) => toast(text),
  onStatus: (st) => onNetStatus(st),
});
const chip = lobby.attachChip($('chips'));
lobby.roomChip($('chips'));

/** Logo: una colina con una corona sobre dos discos. */
function makeLogo() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 40');
  svg.setAttribute('class', 'ar-logo');
  svg.setAttribute('aria-hidden', 'true');
  const mk = (tag, a) => {
    const el = document.createElementNS(ns, tag);
    for (const k in a) el.setAttribute(k, a[k]);
    svg.append(el);
  };
  mk('ellipse', { cx: 48, cy: 29, rx: 38, ry: 9, fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.4', 'stroke-width': 2, 'stroke-dasharray': '5 4' });
  mk('circle', { cx: 36, cy: 27, r: 8, fill: '#ff2bd6' });
  mk('circle', { cx: 60, cy: 27, r: 8, fill: '#b6ff00' });
  mk('path', { d: 'M42 17l3-8 3 5 3-5 3 8z', fill: '#ffb800' });
  return svg;
}

function send(m) {
  if (S.mode === 'offline') S.off.send(m);
  else if (S.mode === 'online' && lobby.net.ws?.readyState === 1) lobby.net.raw(m);
}

function resetWorld() {
  S.meKnown = false;
  S.buf.clear();
  S.fx.length = 0;
  pr.state = null;
  pr.history.length = 0;
  tx.recent.length = 0;
  gate.reset();
  S.tf = null;
  S.ri = { k: 0, phase: PH.play, n: 0, left: 0, hill: 0, next: 0, hillIn: 0, occ: 0, at: 0 };
  S.result = null;
  S.falls = 0;
  S.lastBeep = -1;
  S.lastOcc = 0;
}

function stopSessions() {
  S.off = null;
  S.hold = false;
  S.frozen = false;
  document.body.classList.remove('reconnecting');
  resetWorld();
  S.alive = false;
  clearTimeout(overTimer);
  ctl.release();
}

const sessionBase = { World, brain, think, Viewer, botNames: BOT_NAMES, colors: PALETTE.length, snapEvery: 2, meExtra: (w) => ({ half: CFG.half, r: CFG.discR, tps: w.tps }) };

/** Mundo local: los mensajes que salen mientras se construye se entregan recién cuando `S.off` ya existe. */
function newSession(level, name, color) {
  const lv = OFFLINE_LEVELS.find((l) => l.id === level) || OFFLINE_LEVELS[1];
  const early = [];
  const off = new OfflineSession({ ...sessionBase, level: lv, name, color, emit: (m) => (S.off ? onMsg(m) : early.push(m)) });
  S.off = off;
  for (const m of early) onMsg(m);
}

function startDemo() {
  stopSessions();
  chip.el.hidden = false;
  S.mode = 'demo';
  newSession('hard', null, 0);
}

function enterOnline() {
  stopSessions();
  S.mode = 'online';
  S.pendingSpawn = true;
  S.spawnAt = 0;
  showScreen(null);
  $('hud').hidden = false;
  document.body.classList.add('playing');
  hint();
  G.gameplay(false);
}

function onRejoined() {
  // la conexión volvió: el servidor manda reset + estado y seguimos con el mismo disco
  S.frozen = false;
  document.body.classList.remove('reconnecting');
  tx.resend();
}

function onNetStatus(st) {
  if (S.mode !== 'online') return;
  if (st === 'reconnecting') {
    S.frozen = true;
    ctl.release();
    document.body.classList.add('reconnecting');
  } else if (st === 'open') {
    S.frozen = false;
    document.body.classList.remove('reconnecting');
  } else if (st === 'netError') {
    S.frozen = true;
    document.body.classList.add('reconnecting');
    toast(t('lost'));
  }
}

function startOffline(level, name, color) {
  stopSessions();
  S.mode = 'offline';
  chip.el.hidden = true; // sin red no hay ping que mostrar
  S.pendingSpawn = true;
  S.spawnAt = 0;
  newSession(level, name, color);
  showScreen(null);
  $('hud').hidden = false;
  document.body.classList.add('playing');
  hint();
  G.gameplay(false);
}

function goMenu(fromNet = false) {
  if (!fromNet && S.mode === 'online') lobby.leave();
  S.pendingSpawn = false;
  startDemo();
  showScreen(null);
  $('hud').hidden = true;
  document.body.classList.remove('playing');
  G.gameplay(false);
  if (!fromNet) lobby.show(); // si la sala se cerró, el menú ya se muestra solo con su aviso
}

// ---------------------------------------------------------------- mensajes (online o sin conexión)
function onMsg(m) {
  switch (m.t) {
    case 'reset':
      resetWorld();
      return;
    case 'pl':
      S.players = new Map(m.p.map(([num, name, color, bot]) => [num, { name, color, bot }]));
      lbDirty = true;
      return;
    case 'me':
      S.me = m.num;
      S.meKnown = true;
      if (m.half) {
        S.half = m.half;
        S.discR = m.r || CFG.discR;
      }
      // el servidor dice cuánto falta para poder reaparecer: se vuelve a pedir justo después
      if (!m.alive && m.wait > 0 && S.mode !== 'demo') {
        S.pendingSpawn = true;
        S.spawnAt = performance.now() + m.wait + 40;
      }
      return;
    case 's':
      onSnap(m, performance.now());
      return;
    case 'lb':
      S.lb = m.l;
      lbDirty = true;
      return;
    case 'dead':
      onDead(m);
      return;
    case 'ko': {
      const p = S.players.get(m.n);
      feed(t('ko', { n: p?.name || '?' }), 'ko');
      sfx.ko();
      return;
    }
  }
}

/** Pide anotarse (o reaparecer) cuando corresponde; el servidor contesta con `me` y, si falta, cuánto. */
function pumpSpawn(now) {
  if (!S.pendingSpawn || S.mode === 'demo' || !S.meKnown || now < S.spawnAt || now - S.lastSpawnTry < 500) return;
  S.lastSpawnTry = now;
  send({ t: 'spawn', name: lobby.profile.name || defaultName(), color: lobby.profile.color });
  S.pendingSpawn = false;
}

/** Un snapshot (`s`): se reconstruye el mundo visible y se reconcilia el disco propio. */
function onSnap(m, now) {
  S.dbg.snaps++;
  S.lastK = m.k;
  const [phase, n, left, hill, next, hillIn, occ] = m.r;
  const prev = S.ri;
  S.ri = { k: m.k, phase, n, left, hill, next, hillIn, occ, at: now };
  if (n !== prev.n) onNewMatch(n, prev.n);
  const ents = [];
  let mine = null;
  for (const e of m.h) {
    if (e[0] === S.me && S.mode !== 'demo') {
      mine = e;
      continue;
    }
    ents.push({ id: e[0], x: e[1], y: e[2], vx: e[3], vy: e[4], dash: e[5] & 1, ready: e[5] & 2 ? 1 : 0 });
  }
  S.buf.push(m.k * TICK_MS, ents, now);
  const kt = m.k * TICK_MS;
  if (m.x) for (const [x, y, color, num, by] of m.x) S.fx.push({ t: kt, kind: 'fall', x, y, color, num, by });
  if (m.w) {
    for (const [x, y, color] of m.w) {
      // la Onda propia ya se mostró al apretar el botón
      if (S.mode !== 'demo' && color === lobby.profile.color && now - S.lastWaveAt < 1500) continue;
      S.fx.push({ t: kt, kind: 'wave', x, y, color });
    }
  }
  if (m.res) onResult(m.res);
  // la partida terminó: abrir los resultados con las posiciones ya conocidas
  if (phase === PH.over && prev.phase !== PH.over && S.mode !== 'demo') scheduleOver();
  if (S.mode === 'demo') return;
  if (!mine || !m.o) {
    // ya no está en la arena (si el `dead` no llegó, por ejemplo cayó mientras no había conexión)
    if (S.alive && phase === PH.play) onDead({ by: 0, stats: null });
    return;
  }
  const ack = Number(m.a) || 0; // no `| 0`: los seq arrancan de la hora y no entran en 32 bits
  if (!S.alive) onAlive();
  const rc = pr.reconcile(ownFromEntry(mine, m.o, ack, S.discR), m.k, ack, now);
  tx.ack(ack);
  if (m.o[2] > S.own.score && S.own.score >= 0 && prev.n === n) sfx.point();
  S.own.score = m.o[2];
  if (rc.err > 14 && !rc.snapped) sfx.thud(Math.min(1, rc.err / 80));
  if (DEBUG) {
    S.dbg.err.push(Math.round(rc.err * 100) / 100);
    if (rc.snapped) S.dbg.snapped++;
    for (const [seq, t0] of S.dbg.sent) {
      if (seq > ack) break;
      S.dbg.ack.push(Math.round(now - t0));
      S.dbg.sent.delete(seq);
    }
  }
}

function onNewMatch(n, prevN) {
  pr.history.length = 0;
  tx.recent.length = 0;
  gate.reset();
  S.lastBeep = -1;
  S.falls = 0;
  S.own.score = 0;
  S.result = S.result && S.result.n === n ? S.result : null;
  clearTimeout(overTimer);
  if (S.screen === 'over') showScreen(null);
  if (S.mode !== 'demo' && prevN > 0) {
    sfx.start();
    setBanner(t('go'), t('goSub', { g: CFG.goal }), 2200);
  }
}

function onResult(res) {
  const [n, winner, top, time] = res;
  S.result = { n, winner, top, time };
  if (S.mode === 'demo') return;
  if (winner && winner === S.me) sfx.win();
  else sfx.matchEnd();
}

function onAlive() {
  S.alive = true;
  S.pendingSpawn = false;
  ctl.release();
  gate.reset();
  tx.recent.length = 0;
  pr.state = null;
  pr.history.length = 0;
  S.tf = null;
  updateGameplay();
}

function onDead(m) {
  if (!S.alive) return;
  S.alive = false;
  S.falls++;
  pr.state = null;
  pr.history.length = 0;
  tx.recent.length = 0;
  ctl.release();
  sfx.dead();
  // reaparece solo: se vuelve a pedir cuando pasan los 2 s de la espera
  S.pendingSpawn = true;
  S.spawnAt = performance.now() + CFG.respawnSec * 1000;
  S.deadBy = m.by || 0;
  updateGameplay();
}

// ---------------------------------------------------------------- entrada
/** Manda un cambio de movimiento / habilidad: se predice acá y se manda al servidor con el paso en que va a valer. */
function push(d, b) {
  const ev = pr.record({ d, b }, pr.tick + 1);
  tx.push(ev);
  if (DEBUG) {
    S.dbg.sent.set(ev.s, performance.now());
    if (d !== MOVE_STILL) S.dbg.pending = { t: performance.now(), x: pr.state.x, y: pr.state.y };
  }
}

function doDash() {
  if (!canAct() || pr.state.dashCd > 0) return;
  const code = encodeMove(...ctl.vector());
  gate.sent = code;
  gate.at = performance.now();
  push(code, 1);
  sfx.dash();
}

function doWave() {
  if (!canAct() || pr.state.waveCd > 0) return;
  const code = encodeMove(...ctl.vector());
  gate.sent = code;
  gate.at = performance.now();
  push(code, 2);
  S.lastWaveAt = performance.now();
  // el anillo sale ya, desde donde está el disco propio en pantalla (el servidor empuja a los demás un viaje después)
  renderer.ring(pr.state.x, pr.state.y, S.players.get(S.me)?.color ?? lobby.profile.color, 18, CFG.waveR, 520);
  sfx.wave();
}

/** Suelta el movimiento (pausa, otra pestaña): si no, el servidor seguiría empujando con la última tecla. */
function stopMoving() {
  ctl.release();
  if (S.mode !== 'demo' && S.alive && pr.state && S.ri.phase === PH.play && !S.frozen && gate.sent !== MOVE_STILL) {
    gate.sent = MOVE_STILL;
    push(MOVE_STILL, 0);
  }
}

function pollMove(now) {
  if (!canAct()) return;
  const v = ctl.vector();
  const code = gate.poll(now, v[0], v[1]);
  if (code >= 0) push(code, 0);
}

// ---------------------------------------------------------------- bucle
let lastHud = 0;
let raf = 0;
const list = [];
const SPOTS = CFG.hills;
const hillView = { x: 0, y: 0, r: CFG.hillR, state: 0, color: 0 };
const nextView = { x: 0, y: 0, r: CFG.hillR, left: 0 };
const frameInfo = { view: null, half: CFG.half, pits: CFG.pits, spots: SPOTS, hill: hillView, next: nextView, discs: list, dt: 0, t: 0 };

function updateGameplay() {
  G.gameplay(S.mode !== 'demo' && S.alive && S.ri.phase === PH.play && S.screen === null && !S.hold && !S.suspended);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const w0 = DEBUG ? performance.now() : 0;
  const dt = Math.min(100, now - S.lastT);
  S.lastT = now;
  const D = S.dbg;
  D.frames++;
  if (now - D.t0 >= 1000) {
    D.fps = Math.round((D.frames * 1000) / (now - D.t0));
    D.frames = 0;
    D.t0 = now;
  }
  if (S.off && !S.hold) S.off.update(dt);
  pumpSpawn(now);
  pollMove(now);

  // --- reloj del disco propio: va adelantado parte del viaje de ida y vuelta (más un margen por el jitter)
  const clk = S.buf.clock;
  const online = S.mode === 'online';
  if (S.alive && pr.state && clk.ready && !S.frozen && !S.hold && S.ri.phase === PH.play) {
    const lead = online ? 0.5 * lobby.rtt + clamp(25 + 2 * clk.jitter, 25, 100) : 0;
    const target = (clk.serverTimeAt(now) + lead) / TICK_MS;
    if (S.tf === null || Math.abs(target - S.tf) > 5) S.tf = target;
    else S.tf += dt / TICK_MS + (target - S.tf) * (1 - Math.exp(-dt / 200));
    pr.advanceTo(Math.floor(S.tf));
  }

  // --- discos ajenos, interpolados
  const sm = S.buf.sample(now);
  list.length = 0;
  let shownTick = S.ri.k + (now - S.ri.at) / TICK_MS;
  if (sm) {
    shownTick = sm.time / TICK_MS;
    for (const e of sm.entities) {
      const p = S.players.get(e.id);
      list.push({ id: e.id, x: e.x, y: e.y, r: S.discR, color: p ? p.color : e.id, name: p?.name || '', me: false, dash: e.dash > 0.5, ready: e.ready > 0.5 });
    }
    // los eventos, a la hora del servidor que se está mostrando
    for (let i = S.fx.length - 1; i >= 0; i--) {
      const ev = S.fx[i];
      if (ev.t > sm.time && ev.t - sm.time < 1000) continue; // todavía no llegó a esa hora del servidor
      S.fx.splice(i, 1);
      showEvent(ev);
    }
  } else S.fx.length = 0;

  // --- disco propio: estado predicho + un poco de lo que falta hasta el paso siguiente
  let meList = null;
  if (S.alive && pr.state && S.mode !== 'demo') {
    const st = pr.state;
    const pk = pr.peek();
    const f = clamp(S.tf - pr.tick, 0, 1);
    const err = pr.errorAt(now);
    const x = st.x + (pk.x - st.x) * f + err.x;
    const y = st.y + (pk.y - st.y) * f + err.y;
    S.own.fx = st.fx;
    S.own.fy = st.fy;
    S.own.ready = st.dashCd === 0;
    S.own.cdFrac = 1 - st.dashCd / CTRL.dashCd;
    S.own.wready = st.waveCd === 0;
    S.own.wcdFrac = 1 - st.waveCd / CTRL.waveCd;
    meList = { id: S.me, x, y, r: S.discR, color: S.players.get(S.me)?.color ?? lobby.profile.color, name: '', me: true, dash: st.dashT > 0, ready: st.dashCd === 0, cd: S.own.cdFrac, waveReady: S.own.wready, wcd: S.own.wcdFrac, fx: st.fx, fy: st.fy };
    if (DEBUG && D.pending && Math.hypot(x - D.pending.x, y - D.pending.y) > 0.5) {
      D.resp.push(Math.round((performance.now() - D.pending.t) * 10) / 10);
      D.pending = null;
    }
  }
  if (meList) list.push(meList);

  // --- la colina (y adónde se muda)
  const ri = S.ri;
  const hv = hillAt(ri, shownTick);
  const h = CFG.hills[hv.at] || CFG.hills[0];
  hillView.x = h[0];
  hillView.y = h[1];
  const occ = ri.phase === PH.play ? ri.occ : 0;
  hillView.state = occ > 0 ? 1 : occ < 0 ? 2 : 0;
  hillView.color = occ > 0 ? (S.players.get(occ)?.color ?? 0) : 0;
  if (hv.warn && ri.phase === PH.play) {
    const n = CFG.hills[hv.to] || CFG.hills[0];
    nextView.x = n[0];
    nextView.y = n[1];
    nextView.left = hv.in / TPS;
    const c = Math.ceil(nextView.left);
    if (c !== S.lastBeep && c > 0 && S.mode !== 'demo') {
      S.lastBeep = c;
      sfx.tick();
    }
  } else nextView.left = 0;

  const touch = document.body.classList.contains('touch');
  // la arena baja para dejar lugar a las fichas del HUD (reloj, líder, colina): en pantallas angostas van en dos filas
  const top = S.mode === 'demo' ? 56 : renderer.w <= 560 ? 282 : 100;
  frameInfo.view = fitView(renderer.w, renderer.h, S.half * 1.02, { top, bottom: touch && S.mode !== 'demo' ? 112 : 0, pad: 12 });
  frameInfo.half = S.half;
  frameInfo.dt = dt;
  frameInfo.t = now;
  renderer.draw(frameInfo);

  if (S.mode !== 'demo') {
    if (now - lastHud > 100) {
      lastHud = now;
      updateHud(now);
    }
  }
  if (S.alive && S.mode === 'online') tx.tick(now);
  if (DEBUG) D.work = D.work * 0.95 + (performance.now() - w0) * 0.05;
}

/** Efecto de un evento a la hora del servidor: una caída (la propia también: se la ve irse) o una Onda. */
function showEvent(ev) {
  if (ev.kind === 'wave') {
    renderer.ring(ev.x, ev.y, ev.color, 18, CFG.waveR, 520);
    renderer.burst(ev.x, ev.y, renderer.col(ev.color), 10);
    if (S.mode !== 'demo') sfx.waveFar();
    return;
  }
  renderer.fall(ev.x, ev.y, ev.x, ev.y, ev.color);
  if (S.mode !== 'demo' && ev.num !== S.me) sfx.fall();
}

// ---------------------------------------------------------------- HUD
let lbDirty = true;
const lbItems = [];
function drawLb() {
  lbDirty = false;
  const listEl = $('lb-list');
  const small = matchMedia('(max-width: 560px)').matches;
  const max = small ? 5 : 8;
  const idx = S.lb.findIndex(([num]) => num === S.me);
  const rows = S.lb.slice(0, max).map((r, i) => ({ rank: i + 1, num: r[0], score: r[1] }));
  if (idx >= max) rows.push({ rank: idx + 1, num: S.me, score: S.lb[idx][1] });
  while (lbItems.length < rows.length) {
    const li = document.createElement('li');
    const r = document.createElement('span');
    r.className = 'r';
    const dot = document.createElement('i');
    const n = document.createElement('span');
    n.className = 'n';
    const b = document.createElement('b');
    li.append(r, dot, n, b);
    lbItems.push(li);
  }
  listEl.textContent = '';
  rows.forEach((row, i) => {
    const li = lbItems[i];
    const p = S.players.get(row.num);
    li.className = row.num === S.me ? 'me' : '';
    li.children[0].textContent = String(row.rank);
    li.children[1].style.setProperty('--c', renderer.col(p?.color ?? 0));
    li.children[2].textContent = p?.name || '…';
    li.children[3].textContent = String(row.score);
    listEl.append(li);
  });
}

let bannerUntil = 0;
function setBanner(a, b = '', ms = 0, small = false) {
  $('b1').textContent = a;
  $('b2').textContent = b;
  $('banner').classList.toggle('on', !!a);
  $('banner').classList.toggle('small', small);
  bannerUntil = ms ? performance.now() + ms : 0;
}

function setText(el, v) {
  if (el.textContent !== v) el.textContent = v;
}

function updateHud(now) {
  if (lbDirty) drawLb();
  const ri = S.ri;
  const play = ri.phase === PH.play;
  const idx = S.lb.findIndex(([num]) => num === S.me);
  setText($('score'), String(S.alive ? S.own.score : idx >= 0 ? S.lb[idx][1] : 0));
  setText($('rank'), idx >= 0 ? t('rank', { r: idx + 1 }) : '');
  // reloj de la partida y puntaje del líder
  setText($('clock'), play ? formatTime(matchLeft(ri.left, now - ri.at)) : '');
  const lead = S.lb[0];
  const leadP = lead ? S.players.get(lead[0]) : null;
  setText($('goal'), play ? (lead && lead[1] > 0 ? t('goal', { n: leadP?.name || '?', p: lead[1], g: CFG.goal }) : t('goalNone', { g: CFG.goal })) : '');
  // quién tiene la colina
  const occ = ri.occ;
  const hs = $('hs');
  if (play) {
    setText(hs, occ === S.me && occ > 0 ? t('hsMe') : occ > 0 ? t('hsOther', { n: S.players.get(occ)?.name || '?' }) : occ < 0 ? t('hsFight') : t('hsFree'));
    hs.dataset.s = occ > 0 ? (occ === S.me ? 'me' : 'one') : occ < 0 ? 'fight' : 'free';
  } else setText(hs, '');
  $('dash').classList.toggle('dim', !S.own.ready || !S.alive);
  $('dash').style.setProperty('--cd', String(S.alive ? clamp(S.own.cdFrac ?? 1, 0, 1) : 0));
  $('wave').classList.toggle('dim', !S.own.wready || !S.alive);
  $('wave').style.setProperty('--cd', String(S.alive ? clamp(S.own.wcdFrac ?? 1, 0, 1) : 0));

  // resultados: la cuenta regresiva de la partida que sigue
  if (S.screen === 'over') setText($('over-sub'), t('nextMatch', { s: Math.max(0, Math.ceil((ri.left - ((now - ri.at) * TPS) / 1000) / TPS)) }));

  // texto del centro según la fase
  if (bannerUntil && now < bannerUntil) return;
  bannerUntil = 0;
  if (!play) {
    if (S.screen === 'over') return setBanner('');
    const res = S.result;
    const s = matchLeft(ri.left, now - ri.at);
    const winner = res?.winner ? S.players.get(res.winner) : null;
    setBanner(res ? (res.winner === S.me ? t('youWonMatch') : winner ? t('wonMatch', { n: winner.name || '?' }) : t('noWinner')) : t('matchOver'), t('nextMatch', { s }));
  } else if (!S.alive) {
    const killer = S.deadBy ? S.players.get(S.deadBy) : null;
    const s = Math.ceil((S.spawnAt - now) / 1000);
    if (S.pendingSpawn || S.falls > 0) setBanner(killer ? t('fellBy', { n: killer.name || '?' }) : t('fell'), s > 0 ? t('respawnIn', { s }) : t('respawning'));
    else setBanner('');
  } else setBanner('');
}

function feed(text, cls = '') {
  const ul = $('feed');
  while (ul.children.length >= 3) ul.firstChild.remove();
  const li = document.createElement('li');
  li.className = cls;
  li.textContent = text;
  ul.append(li);
  setTimeout(() => li.remove(), 2500);
}

let toastT = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2600);
}

let hintT = 0;
function hint() {
  const el = $('hint');
  el.textContent = t(document.body.classList.contains('touch') ? 'hintTouch' : 'hintDesk', { k: keyName() });
  el.classList.remove('off');
  clearTimeout(hintT);
  hintT = setTimeout(() => el.classList.add('off'), 7000);
}

// ---------------------------------------------------------------- pantallas
function showScreen(id) {
  S.screen = id;
  $('s-pause').hidden = id !== 'pause';
  $('s-over').hidden = id !== 'over';
  document.body.classList.toggle('playing', S.mode !== 'demo' && id !== 'pause');
  if (id === 'over') $('over-again').focus({ preventScroll: true });
  else if (id === 'pause') $('pz-resume').focus({ preventScroll: true });
  if (id !== null) stopMoving();
  updateGameplay();
}

/** Resultados de la partida: ganador, ranking y las cifras propias. */
let overTimer = 0;
function scheduleOver() {
  clearTimeout(overTimer);
  // un instante para ver el último punto antes de tapar la arena
  overTimer = setTimeout(() => {
    if (S.ri.phase === PH.over && S.mode !== 'demo' && S.screen === null) showOver();
  }, 900);
}

function showOver() {
  const res = S.result;
  const winner = res?.winner ? S.players.get(res.winner) : null;
  $('over-kicker').textContent = t('matchOver');
  $('over-title').textContent = res ? (res.winner === S.me ? t('youWonMatch') : winner ? t('wonMatch', { n: winner.name || '?' }) : t('noWinner')) : t('matchOver');
  const top = res ? res.top : S.lb.slice(0, 5);
  const rows = resultRows(top, S.me, 5);
  const ol = $('over-rows');
  ol.textContent = '';
  for (const r of rows) {
    const p = S.players.get(r.num);
    const li = document.createElement('li');
    li.className = (r.num === S.me ? 'me ' : '') + (res && r.num === res.winner ? 'win' : '');
    const rk = document.createElement('span');
    rk.className = 'r';
    rk.textContent = String(r.rank);
    const dot = document.createElement('i');
    dot.style.setProperty('--c', renderer.col(p?.color ?? 0));
    const nm = document.createElement('span');
    nm.className = 'n';
    nm.textContent = p?.name || '…';
    const sc = document.createElement('b');
    sc.textContent = String(r.score);
    li.append(rk, dot, nm, sc);
    ol.append(li);
  }
  const mine = top.findIndex((r) => r[0] === S.me);
  const stats = [
    [mine >= 0 ? `#${mine + 1}` : '–', t('statPlace')],
    [mine >= 0 ? top[mine][1] : S.own.score, t('statScore')],
    [S.falls, t('statFalls')],
    [res ? formatTime(res.time) : '–', t('statTime')],
  ];
  const dl = $('over-stats');
  dl.textContent = '';
  for (const [v, l] of stats) {
    const d = document.createElement('div');
    const dd = document.createElement('dd');
    const dt = document.createElement('dt');
    dd.textContent = String(v);
    dt.textContent = l;
    d.append(dd, dt);
    dl.append(d);
  }
  showScreen('over');
  lastHud = 0;
}

function openPause() {
  S.hold = S.mode === 'offline';
  $('pause-sub').textContent = S.mode === 'online' ? t('pauseOnline') : '';
  $('pz-share').hidden = !(S.mode === 'online' && lobby.net.room?.settings?.public === false);
  showScreen('pause');
}
function closePause() {
  if (S.hold) resync();
  S.hold = false;
  showScreen(null);
}
/** Después de una pausa los relojes se vuelven a sincronizar con lo próximo que llegue. */
function resync() {
  S.buf.clear();
  S.tf = null;
  if (pr.state) pr.history.length = 0;
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.mode === 'demo') return;
    if (S.screen === 'pause') closePause();
    else openPause();
  }
});
$('btn-pause').onclick = () => (click(), S.screen !== 'pause' && openPause());
$('pz-resume').onclick = () => (click(), closePause());
$('pz-quit').onclick = () => (click(), goMenu());
$('pz-share').onclick = () => lobby.shareRoom();
$('over-menu').onclick = () => (click(), goMenu());
$('over-again').onclick = () => {
  click();
  showScreen(null); // se queda mirando la arena; la partida nueva arranca sola
};

// ---------------------------------------------------------------- sonidos
function click() {
  tone(620, 480, 0.05, { type: 'triangle', vol: 0.06 });
}
const sfx = {
  dash: () => noise(0.18, { freq: 700, q: 0.8, vol: 0.1, sweep: 2400 }),
  wave: () => {
    tone(180, 520, 0.28, { type: 'sine', vol: 0.14 });
    noise(0.22, { freq: 500, q: 0.6, vol: 0.07, sweep: 1800 });
  },
  waveFar: () => tone(220, 330, 0.16, { type: 'sine', vol: 0.04 }),
  thud: (k = 0.5) => tone(150, 55, 0.14, { type: 'sine', vol: 0.18 * k + 0.05 }),
  ko: () => notes([523, 659, 784], { step: 0.07, dur: 0.16, vol: 0.12 }),
  point: () => tone(880, 990, 0.06, { type: 'triangle', vol: 0.05 }),
  fall: () => tone(420, 90, 0.35, { type: 'triangle', vol: 0.07 }),
  dead: () => {
    noise(0.35, { freq: 1500, q: 0.7, vol: 0.18, sweep: 140 });
    tone(260, 50, 0.45, { type: 'sawtooth', vol: 0.1 });
  },
  tick: () => tone(660, 660, 0.07, { type: 'square', vol: 0.05 }),
  start: () => notes([392, 523, 784], { step: 0.06, dur: 0.14, vol: 0.1 }),
  win: () => notes([523, 659, 784, 1047], { step: 0.09, dur: 0.22, vol: 0.14 }),
  matchEnd: () => tone(330, 220, 0.3, { type: 'triangle', vol: 0.08 }),
};

// ---------------------------------------------------------------- arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  for (const n of document.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t);
  document.body.classList.toggle('touch', !!G.prefs.touch);
  renderer.theme(G.prefs);
  chip.setLang(G.prefs.lang === 'en' ? 'en' : 'es');
  lbDirty = true;
}
G.onPrefs(applyPrefs, true);
G.onPause(() => {
  S.suspended = true;
  stopMoving();
  cancelAnimationFrame(raf);
  raf = 0;
  updateGameplay();
});
G.onResume(() => {
  if (!S.suspended) return;
  S.suspended = false;
  resync();
  S.lastT = performance.now();
  if (!raf) raf = requestAnimationFrame(frame);
  updateGameplay();
});
addEventListener('resize', () => renderer.resize());
addEventListener('blur', () => stopMoving());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMoving();
  else resync();
});

startDemo();
lobby.show();
raf = requestAnimationFrame(frame);
if (DEBUG) window.__rey = { S, pr, tx, lobby, renderer, onMsg, doDash, doWave, ctl, CFG };
G.ready();
