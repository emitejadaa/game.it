/* Sumo — game.it
 * Discos que se empujan sobre una plataforma redonda que se achica: el que se cae queda fuera de la ronda y el último en pie
 * la gana. Online (arena con gente y bots, sala privada) o sin conexión contra bots: en los dos casos el cliente recibe los
 * mismos mensajes y corre el mismo mundo determinista (shared/world.js, física en /shared/arena-physics.js).
 *
 * Red (kit en /shared/net): el disco propio se simula acá con el MISMO paso que el servidor (stepOwn) y va adelantado un
 * poco, así que responde a la entrada en el mismo cuadro; cada snapshot (15 por segundo) trae el estado autoritativo y el
 * último `seq` aplicado y se reconcilia (se vuelven a aplicar las entradas sin confirmar; la diferencia se disuelve en
 * 150 ms y por encima de 40 px se salta). Los demás discos se dibujan unos 100 ms atrás, interpolados entre snapshots.
 */
import { World, CFG, PH, PALETTE, platformR } from './shared/world.js';
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
import { CTRL, MOVE_STILL, OfflineSession, MoveGate, cloneOwn, encodeMove, fitView, formatTime, ownFromEntry, ownPos, stepOwn } from './logic.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const TPS = CFG.tps;
const TICK_MS = 1000 / TPS;

const TXT = {
  title: { es: 'Sumo', en: 'Sumo' },
  tagline: { es: 'empujá a todos fuera de la plataforma', en: 'push everyone off the platform' },
  score: { es: 'Puntos', en: 'Points' },
  top: { es: 'Ranking', en: 'Leaderboard' },
  paused: { es: 'Pausa', en: 'Paused' },
  pauseOnline: { es: 'La ronda sigue mientras mirás el menú.', en: 'The round keeps going while you look at the menu.' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  copyLink: { es: 'Copiar link de la sala', en: 'Copy room link' },
  out: { es: 'Fuera de la ronda', en: 'Out of the round' },
  fell: { es: 'Te caíste', en: 'You fell off' },
  hitBy: { es: 'Te sacó {n}', en: '{n} knocked you out' },
  watch: { es: 'Seguir mirando', en: 'Keep watching' },
  deadSub: { es: 'Volvés a la plataforma en la próxima ronda.', en: 'You are back on the platform next round.' },
  statPlace: { es: 'puesto', en: 'place' },
  statKos: { es: 'derribos', en: 'knockouts' },
  statTime: { es: 'tiempo', en: 'time' },
  statScore: { es: 'puntos', en: 'points' },
  ko: { es: '¡Sacaste a {n}! +1', en: 'You knocked out {n}! +1' },
  kos: { es: '{n} KO', en: '{n} KO' },
  rank: { es: 'Puesto {r}', en: 'Rank {r}' },
  alive: { es: '{n} en pie · plataforma {p}%', en: '{n} left · platform {p}%' },
  getReady: { es: '¡Prepará el empujón!', en: 'Get ready!' },
  startsIn: { es: 'Empieza en {s}', en: 'Starts in {s}' },
  nextIn: { es: 'Próxima ronda en {s}', en: 'Next round in {s}' },
  youWon: { es: '¡Ganaste la ronda! +3', en: 'You won the round! +3' },
  wonBy: { es: 'Ganó {n}', en: '{n} wins the round' },
  noWinner: { es: 'Nadie ganó la ronda', en: 'Nobody won the round' },
  watching: { es: 'Estás mirando', en: 'You are watching' },
  watchingSub: { es: 'Entrás en la próxima ronda.', en: 'You join the next round.' },
  waiting: { es: 'Esperando jugadores…', en: 'Waiting for players…' },
  go: { es: '¡Empujá a todos afuera!', en: 'Push everyone off!' },
  hintDesk: { es: '{k} para moverte · Espacio o Shift = empujón', en: '{k} to move · Space or Shift = shove' },
  hintTouch: { es: 'Joystick a la izquierda · botón ⚡ = empujón', en: 'Joystick on the left · ⚡ button = shove' },
  keysDesk: { es: '{k} · Espacio = empujón', en: '{k} · Space = shove' },
  keyNames: { es: { both: 'Flechas o WASD', arrows: 'Flechas', wasd: 'WASD' }, en: { both: 'Arrows or WASD', arrows: 'Arrows', wasd: 'WASD' } },
  keysTouch: { es: 'Joystick a la izquierda · botón ⚡ = empujón', en: 'Joystick on the left · ⚡ button = shove' },
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
  screen: null, // null (jugando) | pause | dead
  me: 0,
  alive: false, // en la plataforma
  hold: false, // pausa propia (sin conexión: congela el mundo)
  suspended: false, // pausa del portal
  frozen: false, // sin conexión con el servidor: el disco propio espera
  R0: CFG.R0,
  discR: CFG.discR,
  players: new Map(), // num → { name, color, bot }
  lb: [],
  buf: new SnapshotBuffer({ delay: 100, minDelay: 80, maxDelay: 260, maxExtrap: 120, extrapolate: ['x', 'y'] }),
  tf: null, // paso (con decimales) en el que va el disco propio
  lastK: 0,
  goTick: 0, // paso del servidor en que empieza a moverse todo (fin de la espera de la ronda)
  goShown: false,
  ri: { k: 0, phase: PH.idle, n: 0, rt: 0, R: CFG.R0, alive: 0, at: 0 }, // lo último que dijo el servidor de la ronda
  result: null, // { n, winner } de la última ronda terminada
  own: { cd: 0, cdFrac: 1, ready: true, fx: 0, fy: -1, kos: 0 },
  meKnown: false,
  pendingSpawn: false,
  lastSpawnTry: 0,
  off: null,
  fx: [], // caídas { t, x, y, vx, vy, color, by, num } a mostrar a la hora del servidor que corresponde
  ownDeath: null,
  lastBeep: -1,
  lastT: performance.now(),
  dbg: { err: [], snapped: 0, snaps: 0, ack: [], sent: new Map(), frames: 0, fps: 0, work: 0, t0: performance.now(), resp: [] },
};
const renderer = new DiscRenderer($('cv'), PALETTE);
// quieto hasta el "¡ya!" (`goTick`): el servidor tampoco mueve a nadie antes
const pr = new Predictor({ step: (st, h, tick) => tick >= S.goTick && stepOwn(st, h, tick), clone: cloneOwn, pos: ownPos, smoothMs: 150, snapDist: 40 });
pr.seq = Math.floor(Date.now() / 50); // los `seq` no se repiten si se recarga la página dentro de la gracia del servidor
const tx = new InputSender({ send: (m) => send(m), redundancy: 3, keepaliveMs: 250 });
const gate = new MoveGate(50);
const ctl = new Controls({ stage: $('cv'), stick: $('stick'), knob: $('knob'), dashBtn: $('dash'), enabled: () => canAct(), onDash: () => doDash() });
/** ¿Se puede mandar entrada ahora? (en pie, ronda en marcha, sin pantallas ni cortes) */
const canAct = () => S.mode !== 'demo' && S.alive && S.screen === null && !S.hold && !S.frozen && !S.suspended && !!pr.state && S.ri.phase === PH.play;

// ---------------------------------------------------------------- menú y red
const lobby = new ArenaLobby({
  game: 'sumo',
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
      { id: 'easy', label: { es: 'Fácil', en: 'Easy' }, hint: { es: '5 bots distraídos', en: '5 easygoing bots' } },
      { id: 'normal', label: { es: 'Normal', en: 'Normal' }, hint: { es: '7 bots, algunos ágiles', en: '7 bots, some sharp' } },
      { id: 'hard', label: { es: 'Difícil', en: 'Hard' }, hint: { es: '9 bots que empujan al borde', en: '9 bots that shove you to the edge' } },
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

/** Logo: una plataforma con dos discos que se chocan. */
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
  mk('ellipse', { cx: 48, cy: 22, rx: 40, ry: 15, fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.4', 'stroke-width': 2 });
  mk('circle', { cx: 38, cy: 20, r: 10, fill: '#00f0ff' });
  mk('circle', { cx: 60, cy: 20, r: 10, fill: '#ff2bd6' });
  mk('path', { d: 'M49 12v16', stroke: '#fff', 'stroke-opacity': '0.8', 'stroke-width': 1.5, 'stroke-linecap': 'round' });
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
  S.ri = { k: 0, phase: PH.idle, n: 0, rt: 0, R: CFG.R0, alive: 0, at: 0 };
  S.result = null;
  S.goShown = false;
  S.lastBeep = -1;
}

function stopSessions() {
  S.off = null;
  S.hold = false;
  S.frozen = false;
  document.body.classList.remove('reconnecting');
  resetWorld();
  S.alive = false;
  ctl.release();
}

const sessionBase = { World, brain, think, Viewer, botNames: BOT_NAMES, colors: PALETTE.length, snapEvery: 2, meExtra: (w) => ({ R0: w.R0, r: CFG.discR, tps: w.tps }) };

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
      if (m.R0) {
        S.R0 = m.R0;
        S.discR = m.r || CFG.discR;
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

/** Pide anotarse para jugar cuando corresponde (el servidor contesta con `me`; entra a la ronda que sigue). */
function pumpSpawn(now) {
  if (!S.pendingSpawn || S.mode === 'demo' || !S.meKnown || now - S.lastSpawnTry < 700) return;
  S.lastSpawnTry = now;
  send({ t: 'spawn', name: lobby.profile.name || defaultName(), color: lobby.profile.color });
  S.pendingSpawn = false; // el servidor lo anota: entra solo a la ronda que sigue (o a esta si es recién empezada)
}

/** Un snapshot (`s`): se reconstruye el mundo visible y se reconcilia el disco propio. */
function onSnap(m, now) {
  S.dbg.snaps++;
  S.lastK = m.k;
  const [phase, n, rt, R, alive] = m.r;
  const prev = S.ri;
  S.ri = { k: m.k, phase, n, rt, R, alive, at: now };
  S.goTick = m.k - rt; // el reloj de la ronda (rt) es negativo mientras los discos esperan quietos
  if (n !== prev.n || (phase === PH.play && prev.phase !== PH.play)) onNewRound(n);
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
  if (m.x) for (const [x, y, color, num, by] of m.x) S.fx.push({ t: m.k * TICK_MS, x, y, color, num, by });
  if (m.res) onResult(m.res[0], m.res[1]);
  if (S.mode === 'demo') return;
  if (!mine || !m.o) {
    // ya no está en la plataforma (si el `dead` no llegó, por ejemplo cayó mientras no había conexión)
    if (S.alive && phase === PH.play) onDead({ by: 0, stats: null });
    return;
  }
  const ack = Number(m.a) || 0; // no `| 0`: los seq arrancan de la hora y no entran en 32 bits
  if (!S.alive) onAlive();
  const rc = pr.reconcile(ownFromEntry(mine, m.o, ack, S.discR), m.k, ack, now);
  tx.ack(ack);
  S.own.cd = m.o[0];
  S.own.kos = m.o[2];
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

function onNewRound(n) {
  pr.history.length = 0;
  tx.recent.length = 0;
  gate.reset();
  S.lastBeep = -1;
  S.goShown = false;
  S.result = S.result && S.result.n === n ? S.result : null;
}

function onResult(n, winner) {
  S.result = { n, winner };
  if (S.mode === 'demo') return;
  if (winner && winner === S.me) sfx.win();
  else sfx.roundEnd();
}

function onAlive() {
  S.alive = true;
  S.pendingSpawn = false;
  if (S.screen === 'dead') showScreen(null);
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
  pr.state = null;
  pr.history.length = 0;
  tx.recent.length = 0;
  ctl.release();
  sfx.dead();
  updateGameplay();
  const st = m.stats || {};
  const killer = m.by ? S.players.get(m.by) : null;
  $('dead-title').textContent = killer ? t('hitBy', { n: killer.name || '?' }) : t('fell');
  const rows = [
    [st.place !== undefined ? `#${st.place}` : '–', t('statPlace')],
    [st.kos ?? '–', t('statKos')],
    [st.time !== undefined ? formatTime(st.time) : '–', t('statTime')],
    [st.score ?? '–', t('statScore')],
  ];
  const dl = $('dead-stats');
  dl.textContent = '';
  for (const [v, l] of rows) {
    const d = document.createElement('div');
    const dd = document.createElement('dd');
    const dt = document.createElement('dt');
    dd.textContent = String(v);
    dt.textContent = l;
    d.append(dd, dt);
    dl.append(d);
  }
  $('dead-sub').textContent = t('deadSub');
  clearTimeout(onDead.timer);
  // un instante para ver cómo cae antes de tapar la pantalla
  onDead.timer = setTimeout(() => {
    if (!S.alive && S.mode !== 'demo' && S.screen === null) showScreen('dead');
  }, 800);
}

// ---------------------------------------------------------------- entrada
/** Manda un cambio de movimiento / Empujón: se predice acá y se manda al servidor con el paso en que va a valer. */
function push(d, b) {
  $('hint').classList.add('off'); // ya sabe cómo se juega
  const ev = pr.record({ d, b }, pr.tick + 1);
  tx.push(ev);
  if (DEBUG) {
    S.dbg.sent.set(ev.s, performance.now());
    if (d !== MOVE_STILL) S.dbg.pending = { t: performance.now(), x: pr.state.x, y: pr.state.y };
  }
}

function doDash() {
  if (!canAct() || pr.state.dashCd > 0) return;
  const v = ctl.vector();
  const code = encodeMove(v[0], v[1]);
  gate.sent = code;
  gate.at = performance.now();
  push(code, 1);
  sfx.dash();
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
  let rNow = S.ri.R;
  if (sm) {
    for (const e of sm.entities) {
      const p = S.players.get(e.id);
      list.push({ id: e.id, x: e.x, y: e.y, r: S.discR, color: p ? p.color : e.id, name: p?.name || '', me: false, dash: e.dash > 0.5, ready: e.ready > 0.5 });
    }
    // la plataforma y los eventos, a la hora del servidor que se está mostrando
    if (S.ri.phase === PH.play) rNow = platformR(Math.max(0, S.ri.rt + sm.time / TICK_MS - S.ri.k), TPS, S.R0);
    for (let i = S.fx.length - 1; i >= 0; i--) {
      const ev = S.fx[i];
      if (ev.t > sm.time && ev.t - sm.time < 1000) continue; // todavía no llegó a esa hora del servidor
      S.fx.splice(i, 1);
      showFall(ev);
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
    meList = { id: S.me, x, y, r: S.discR, color: S.players.get(S.me)?.color ?? lobby.profile.color, name: '', me: true, dash: st.dashT > 0, ready: st.dashCd === 0, cd: S.own.cdFrac, fx: st.fx, fy: st.fy };
    if (DEBUG && D.pending && Math.hypot(x - D.pending.x, y - D.pending.y) > 0.5) {
      D.resp.push(Math.round((performance.now() - D.pending.t) * 10) / 10);
      D.pending = null;
    }
  }
  if (meList) list.push(meList);

  // en un celu vertical el ranking y el cartel de ronda ocupan la franja de arriba: la plataforma baja para no taparse con ellos
  const touch = document.body.classList.contains('touch') && S.mode !== 'demo';
  const view = fitView(renderer.w, renderer.h, S.R0 * 1.03, { top: touch && renderer.h > renderer.w * 1.2 ? 150 : 56, bottom: touch ? 70 : 0, pad: 12 });
  const danger = S.ri.phase === PH.play && rNow < S.R0 * 0.5;
  renderer.draw({ view, R: rNow, R0: S.R0, discs: list, dt, t: now, danger });

  if (S.mode !== 'demo') {
    if (now - lastHud > 100) {
      lastHud = now;
      updateHud(now, rNow);
    }
  }
  if (S.alive && S.mode === 'online') tx.tick(now);
  if (DEBUG) D.work = D.work * 0.95 + (performance.now() - w0) * 0.05;
}

/** Efecto de una caída a la hora del servidor (la propia también: se la ve irse). */
function showFall(ev) {
  renderer.fall(ev.x, ev.y, ev.x, ev.y, ev.color);
  if (ev.by && ev.by !== ev.num) renderer.ring(ev.x, ev.y, ev.color, 10, 60);
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

function updateHud(now, R) {
  if (lbDirty) drawLb();
  const idx = S.lb.findIndex(([num]) => num === S.me);
  $('score').textContent = String(idx >= 0 ? S.lb[idx][1] : 0);
  $('rank').textContent = idx >= 0 ? t('rank', { r: idx + 1 }) : '';
  $('kos').textContent = S.alive && S.own.kos > 0 ? t('kos', { n: S.own.kos }) : '';
  const ri = S.ri;
  const play = ri.phase === PH.play;
  $('alive').textContent = play ? t('alive', { n: ri.alive, p: Math.max(0, Math.round((R / S.R0) * 100)) }) : '';
  $('dash').classList.toggle('dim', !S.own.ready || !S.alive);
  $('dash').style.setProperty('--cd', String(S.alive ? clamp(S.own.cdFrac ?? 1, 0, 1) : 0));

  // texto del centro según la fase
  if (bannerUntil && now < bannerUntil) return;
  bannerUntil = 0;
  if (S.screen === 'dead') {
    setBanner('');
    return;
  }
  if (ri.phase === PH.wait) {
    const s = Math.max(0, Math.ceil(ri.rt / TPS - (now - ri.at) / 1000));
    const res = S.result;
    if (res && res.n === ri.n) {
      const winner = res.winner ? S.players.get(res.winner) : null;
      setBanner(res.winner === S.me ? t('youWon') : winner ? t('wonBy', { n: winner.name || '?' }) : t('noWinner'), t('nextIn', { s }));
    } else setBanner(t('getReady'), t('startsIn', { s }));
    if (s <= 3 && s !== S.lastBeep && s > 0) {
      S.lastBeep = s;
      sfx.tick();
    }
  } else if (ri.phase === PH.idle) setBanner(t('waiting'));
  else {
    // ronda en marcha: quietos hasta el "¡ya!" (rt < 0), y después solo se avisa a quien mira
    const rt = ri.rt + (now - ri.at) / TICK_MS;
    if (rt < 0) setBanner(t('getReady'));
    else if (!S.goShown) {
      S.goShown = true;
      sfx.start();
      setBanner(t('go'), '', 1100);
    } else if (!S.alive) setBanner(t('watching'), t('watchingSub'), 0, true);
    else setBanner('');
  }
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
  $('s-dead').hidden = id !== 'dead';
  document.body.classList.toggle('playing', S.mode !== 'demo' && id === null);
  if (id === 'dead') $('dead-again').focus({ preventScroll: true });
  else if (id === 'pause') $('pz-resume').focus({ preventScroll: true });
  stopMoving();
  updateGameplay();
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
    else if (S.screen === null) openPause();
  }
});
$('btn-pause').onclick = () => (click(), S.screen === null && openPause());
$('pz-resume').onclick = () => (click(), closePause());
$('pz-quit').onclick = () => (click(), goMenu());
$('pz-share').onclick = () => lobby.shareRoom();
$('dead-menu').onclick = () => (click(), goMenu());
$('dead-again').onclick = () => {
  click();
  showScreen(null); // se queda mirando; en la próxima ronda entra solo
};

// ---------------------------------------------------------------- sonidos
function click() {
  tone(620, 480, 0.05, { type: 'triangle', vol: 0.06 });
}
const sfx = {
  dash: () => noise(0.18, { freq: 700, q: 0.8, vol: 0.1, sweep: 2400 }),
  thud: (k = 0.5) => tone(150, 55, 0.14, { type: 'sine', vol: 0.18 * k + 0.05 }),
  ko: () => notes([523, 659, 784], { step: 0.07, dur: 0.16, vol: 0.12 }),
  fall: () => tone(420, 90, 0.35, { type: 'triangle', vol: 0.07 }),
  dead: () => {
    noise(0.35, { freq: 1500, q: 0.7, vol: 0.18, sweep: 140 });
    tone(260, 50, 0.45, { type: 'sawtooth', vol: 0.1 });
  },
  tick: () => tone(660, 660, 0.07, { type: 'square', vol: 0.05 }),
  start: () => notes([392, 523, 784], { step: 0.06, dur: 0.14, vol: 0.1 }),
  win: () => notes([523, 659, 784, 1047], { step: 0.09, dur: 0.22, vol: 0.14 }),
  roundEnd: () => tone(330, 220, 0.3, { type: 'triangle', vol: 0.08 }),
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
if (DEBUG) window.__sumo = { S, pr, tx, lobby, renderer, onMsg, doDash, ctl };
G.ready();
