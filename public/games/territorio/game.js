/* Territorio — game.it
 * Salís de tu territorio dejando una estela y, si volvés a él, te quedás con todo lo que encerraste. Si alguien pisa
 * tu estela (o vos la tuya), perdés el territorio. Online (arena con gente y bots, sala privada) o sin conexión contra
 * bots: en los dos casos el cliente recibe los mismos mensajes y corre el mismo mundo determinista (shared/world.js).
 *
 * Red (kit en /shared/net): la cabeza propia se simula acá con el MISMO paso que el servidor (stepOwn) y va adelantada
 * un viaje de ida y vuelta, así que responde a la entrada en el mismo cuadro; cada snapshot trae el estado autoritativo y
 * el último `seq` aplicado y se reconcilia. Cuando la cabeza propia vuelve a casa se predice también la captura (mismo
 * algoritmo: relleno desde afuera del rectángulo envolvente) y se dibuja al instante; el territorio del servidor llega
 * como diferencias (retrasado a la hora que se está mostrando) y reemplaza a la predicción. Los demás se dibujan unos
 * 90-250 ms atrás, interpolados entre snapshots.
 */
import { Mirror } from './shared/sync.js';
import { CFG, PALETTE } from './shared/world.js';
import { ArenaLobby } from '/shared/arena-lobby.js';
import { defaultName } from '/shared/online.js';
import { SnapshotBuffer } from '/shared/net/interp.js';
import { Predictor } from '/shared/net/predict.js';
import { InputSender } from '/shared/net/input.js';
import { clamp } from '/shared/net/clock.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { Renderer } from './render.js';
import { OfflineSession, Overlay, OwnTracker, cloneOwn, dirOf, effectiveDir, formatTime, legalTurn, ownPos, ownedStats, pathPoints, pctText, predictCapture, stepOwn, swipeDir } from './logic.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');

const TXT = {
  title: { es: 'Territorio', en: 'Turf' },
  tagline: { es: 'rodeá una zona y volvé para quedártela', en: 'loop around an area and come back to claim it' },
  score: { es: 'Territorio', en: 'Turf' },
  top: { es: 'Ranking', en: 'Leaderboard' },
  paused: { es: 'Pausa', en: 'Paused' },
  pauseOnline: { es: 'La arena sigue mientras mirás el menú.', en: 'The arena keeps going while you look at the menu.' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  copyLink: { es: 'Copiar link de la sala', en: 'Copy room link' },
  out: { es: 'Eliminado', en: 'Knocked out' },
  whySelf: { es: 'Pisaste tu propio rastro', en: 'You crossed your own trail' },
  whyWall: { es: 'Te fuiste del mapa', en: 'You left the map' },
  whyCut: { es: '{n} te cortó el rastro', en: '{n} cut your trail' },
  whyHead: { es: 'Choque de frente', en: 'Head-on crash' },
  whyHeadBy: { es: 'Choque de frente con {n}', en: 'Head-on crash with {n}' },
  whyOut: { es: 'Quedaste eliminado', en: 'You were knocked out' },
  whyLost: { es: 'Perdiste todo tu territorio', en: 'You lost all your turf' },
  whyLostBy: { es: '{n} se quedó con todo tu territorio', en: '{n} took all your turf' },
  respawn: { es: 'Reaparecer', en: 'Respawn' },
  respawnIn: { es: 'Reaparecer ({s})', en: 'Respawn ({s})' },
  statPeak: { es: 'máximo del mapa', en: 'peak of the map' },
  statTime: { es: 'tiempo vivo', en: 'time alive' },
  statKos: { es: 'KO', en: 'KOs' },
  statGained: { es: 'celdas ganadas', en: 'cells claimed' },
  ko: { es: '¡Eliminaste a {n}!', en: 'You knocked out {n}!' },
  gain: { es: '+{p}% del mapa', en: '+{p}% of the map' },
  kos: { es: '{n} KO', en: '{n} KO' },
  rank: { es: 'Puesto {r}', en: 'Rank {r}' },
  hintDesk: { es: '{k} para girar · salí de tu territorio y volvé para quedarte con lo que rodeaste', en: '{k} to turn · leave your turf and come back to keep what you looped' },
  hintTouch: { es: 'Deslizá para girar · salí de tu territorio y volvé para capturar', en: 'Swipe to turn · leave your turf and come back to capture' },
  keysDesk: { es: '{k} · cuidá tu rastro', en: '{k} · guard your trail' },
  keyNames: { es: { both: 'Flechas o WASD', arrows: 'Flechas', wasd: 'WASD' }, en: { both: 'Arrows or WASD', arrows: 'Arrows', wasd: 'WASD' } },
  keysTouch: { es: 'Deslizá para girar (o usá la cruceta) · cuidá tu rastro', en: 'Swipe to turn (or use the d-pad) · guard your trail' },
  lost: { es: 'Se cortó la conexión.', en: 'Connection lost.' },
  dpad: { es: 'Cruceta', en: 'D-pad' },
  up: { es: 'Arriba', en: 'Up' },
  left: { es: 'Izquierda', en: 'Left' },
  right: { es: 'Derecha', en: 'Right' },
  down: { es: 'Abajo', en: 'Down' },
  pauseBtn: { es: 'Pausa', en: 'Pause' },
};
/** Cómo se llaman las teclas de giro según la preferencia del portal. */
const keyName = (lang) => TXT.keyNames[lang || (G.prefs.lang === 'en' ? 'en' : 'es')][G.prefs.keys] || TXT.keyNames.es.both;
const lang = () => (G.prefs.lang === 'en' ? 'en' : 'es');
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
  alive: false,
  hold: false, // pausa propia (sin conexión: congela el mundo)
  suspended: false, // pausa del portal
  frozen: false, // sin conexión con el servidor: el jugador propio espera
  size: CFG.size,
  tps: CFG.tps,
  tickMs: 1000 / CFG.tps,
  players: new Map(), // num → { name, color, bot }
  colorSig: '',
  lb: [],
  mirror: new Mirror(CFG.size),
  buf: new SnapshotBuffer({ delay: 90, minDelay: 70, maxDelay: 260, maxExtrap: 120, extrapolate: ['m'] }),
  tq: [], // territorio recibido, a la espera de la hora que se está mostrando: { k, m }
  appliedK: 0, // último paso de territorio aplicado
  changed: [],
  ovl: new Overlay(2), // capturas propias predichas que el servidor todavía no confirmó
  tf: null, // paso (con decimales) en el que va el jugador propio
  authHead: null,
  hud: { kos: 0, area: 0 },
  lastK: 0,
  events: [], // muertes ajenas { t, x, y, color } para mostrarlas a la hora del servidor que corresponde
  ownDeath: null,
  respawnAt: 0,
  pendingSpawn: false, // hay que pedir nacer (al entrar, al tocar Reaparecer o cuando vence la espera)
  meKnown: false,
  lastSpawnTry: 0,
  off: null,
  sw: null,
  dpad: false,
  cam: { x: CFG.size / 2, y: CFG.size / 2 },
  camSnap: true,
  lastT: performance.now(),
  dbg: { resp: [], ack: [], err: [], snapped: 0, pending: null, sent: new Map(), frames: 0, fps: 0, work: 0, t0: performance.now(), snaps: 0, caps: 0, mismatch: 0, predicted: 0, trace: [] },
};
const renderer = new Renderer($('cv'));
renderer.setSize(S.size);
renderer.colorOf = (num) => S.players.get(num)?.color ?? num;
const ctx = { size: S.size, isHome: (x, y) => S.mirror.shown[y * S.size + x] === S.me };
const pr = new Predictor({ step: (s, h, tick) => stepOwn(s, h, tick, ctx), clone: cloneOwn, pos: ownPos, smoothMs: 120, snapDist: 6 });
pr.seq = Math.floor(Date.now() / 50); // los `seq` no se repiten si se recarga la página dentro de la gracia del servidor
const own = new OwnTracker(pr);
const tx = new InputSender({ send: (m) => send(m), redundancy: 3, keepaliveMs: 250 });

// ---------------------------------------------------------------- menú y red
const lobby = new ArenaLobby({
  game: 'territorio',
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
      { id: 'easy', label: { es: 'Fácil', en: 'Easy' }, hint: { es: '6 bots distraídos', en: '6 easygoing bots' } },
      { id: 'normal', label: { es: 'Normal', en: 'Normal' }, hint: { es: '9 bots, algunos atentos', en: '9 bots, some alert' } },
      { id: 'hard', label: { es: 'Difícil', en: 'Hard' }, hint: { es: '11 bots que te cazan el rastro', en: '11 bots hunting your trail' } },
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

/** Logo: un territorio con su estela dando la vuelta. */
function makeLogo() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 40');
  svg.setAttribute('class', 'ar-logo');
  svg.setAttribute('aria-hidden', 'true');
  const mk = (tag, attrs) => {
    const e = document.createElementNS(ns, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    svg.append(e);
  };
  mk('rect', { x: 6, y: 20, width: 34, height: 16, fill: '#00f0ff', 'fill-opacity': 0.25, stroke: '#00f0ff' });
  mk('path', { d: 'M18 20V6H70V20', fill: 'none', stroke: '#00f0ff' });
  mk('rect', { x: 56, y: 22, width: 34, height: 14, fill: '#ff2bd6', 'fill-opacity': 0.25, stroke: '#ff2bd6' });
  return svg;
}

function send(m) {
  if (S.mode === 'offline') S.off.send(m);
  else if (S.mode === 'online' && lobby.net.ws?.readyState === 1) lobby.net.raw(m);
}

function setSize(n) {
  if (S.size === n && renderer.n === n) return;
  S.size = n;
  ctx.size = n;
  S.mirror.setSize(n);
  renderer.setSize(n);
}

function resetWorld() {
  S.meKnown = false;
  S.mirror.clear();
  S.buf.clear();
  S.tq.length = 0;
  S.appliedK = 0;
  S.ovl.clear();
  S.events.length = 0;
  pr.state = null;
  pr.history.length = 0;
  tx.recent.length = 0;
  S.tf = null;
  S.authHead = null;
  own.reset();
  S.camSnap = true;
  renderer.invalidate();
}

function stopSessions() {
  S.off = null;
  S.hold = false;
  S.frozen = false;
  document.body.classList.remove('reconnecting');
  resetWorld();
  S.alive = false;
}

/** Mundo local: los mensajes que salen mientras se construye se entregan recién cuando `S.off` ya existe. */
function makeSession(opts) {
  const early = [];
  const off = new OfflineSession({ ...opts, emit: (m) => (S.off ? onMsg(m) : early.push(m)) });
  S.off = off;
  for (const m of early) onMsg(m);
}

function startDemo() {
  stopSessions();
  chip.el.hidden = false;
  S.mode = 'demo';
  makeSession({ level: 'hard' });
  S.cam.x = S.cam.y = S.size / 2;
}

function enterOnline() {
  stopSessions();
  S.mode = 'online';
  S.pendingSpawn = true;
  S.respawnAt = 0;
  showScreen(null);
  $('hud').hidden = false;
  document.body.classList.add('playing');
  hint();
  G.gameplay(false);
}

function onRejoined() {
  // la conexión volvió: el servidor manda reset + estado y seguimos con el mismo jugador
  S.frozen = false;
  document.body.classList.remove('reconnecting');
  tx.resend();
}

function onNetStatus(st) {
  if (S.mode !== 'online') return;
  if (st === 'reconnecting') {
    S.frozen = true;
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
  S.respawnAt = 0;
  makeSession({ level, name, color });
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
    case 'pl': {
      S.players = new Map(m.p.map(([num, name, color, bot]) => [num, { name, color, bot }]));
      const sig = m.p.map((p) => p[0] + ':' + p[2]).join(',');
      if (sig !== S.colorSig) {
        S.colorSig = sig;
        renderer.invalidate(); // alguien cambió de color: el territorio se repinta
      }
      renderLb();
      return;
    }
    case 'me':
      onMe(m);
      return;
    case 's':
      onSnap(m, performance.now());
      return;
    case 'lb':
      S.lb = m.l;
      renderLb();
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

function onMe(m) {
  S.me = m.num;
  renderer.meNum = m.num;
  S.meKnown = true;
  if (m.size) {
    setSize(m.size);
    S.tps = m.tps || CFG.tps;
    S.tickMs = 1000 / S.tps;
  }
  renderer.invalidate();
  if (S.mode === 'demo') return;
  if (m.alive) {
    S.pendingSpawn = false;
    if (!S.alive) {
      S.alive = true;
      S.authHead = null; // la cámara no va a la cabeza de la vida anterior
      S.camSnap = true;
      showScreen(null);
      sfx.spawn();
    }
    return;
  }
  if (S.alive && S.mode === 'online') {
    // murió mientras no había conexión: no llegó el `dead`
    onDead({ by: 0, stats: null });
    return;
  }
  if (m.wait > 0) S.respawnAt = performance.now() + m.wait; // todavía falta: el servidor avisa cuánto
}

/** Pide nacer cuando corresponde (sin mandar de más: el servidor contesta con `me`). */
function pumpSpawn(now) {
  if (!S.pendingSpawn || S.alive || S.mode === 'demo' || !S.meKnown || now < S.respawnAt || now - S.lastSpawnTry < 700) return;
  S.lastSpawnTry = now;
  send({ t: 'spawn', name: lobby.profile.name || defaultName(), color: lobby.profile.color });
}

/** Un snapshot (`s`): cabezas y estelas al instante, territorio en cola, y se reconcilia el jugador propio. */
function onSnap(m, now) {
  S.dbg.snaps++;
  S.lastK = m.k;
  const bikes = S.mirror.apply(m);
  const ents = [];
  let mine = null;
  for (const b of bikes) {
    if (b.num === S.me && S.mode !== 'demo') {
      mine = b;
      continue;
    }
    // `raw` guarda la cabeza y la distancia recorrida exactas de este snapshot (los números sueltos se interpolan)
    ents.push({ id: b.num, m: b.m, out: !!(b.flags & 1), raw: [b.x, b.y, b.m, b.dir], verts: b.verts.slice() });
  }
  S.buf.push(m.k * S.tickMs, ents, now);
  if (m.r || m.c) S.tq.push({ k: m.k, m });
  else S.tq.push({ k: m.k, m: null });
  if (m.mm) {
    S.mirror.applyMini(m.mm);
    renderer.paintMini(S.mirror.mini);
  }
  if (m.x) for (const [x, y, color] of m.x) S.events.push({ t: m.k * S.tickMs, x, y, color });
  if (!S.alive || !mine || !m.o) return;
  // --- jugador propio
  if (!pr.state) S.camSnap = true; // primer snapshot de esta vida: la cámara salta a la cabeza
  const ack = Number(m.a) || 0; // no `| 0`: los seq arrancan de la hora y no entran en 32 bits
  const rc = own.apply(mine, ack, m.k, now);
  if (DEBUG) {
    S.dbg.err.push(Math.round(rc.err * 100) / 100);
    if (rc.snapped) S.dbg.snapped++;
  }
  tx.ack(ack);
  S.authHead = { x: mine.x, y: mine.y, color: S.players.get(S.me)?.color ?? lobby.profile.color };
  S.hud.area = m.o[0];
  S.hud.kos = m.o[1];
  if (DEBUG) {
    // tiempo hasta que el servidor confirma cada entrada (≈ un viaje de ida y vuelta)
    for (const [seq, t0] of S.dbg.sent) {
      if (seq > ack) break;
      S.dbg.ack.push(Math.round(now - t0));
      S.dbg.sent.delete(seq);
    }
  }
}

/** Aplica el territorio que ya le toca a la hora que se está mostrando y retira las capturas predichas ya confirmadas. */
function applyTerritory(time) {
  const q = S.tq;
  let i = 0;
  while (i < q.length && (q[i].k * S.tickMs <= time || q.length - i > 40)) {
    const e = q[i++];
    if (e.m) S.mirror.applyTerritory(e.m, S.changed);
    S.appliedK = e.k;
  }
  if (i) q.splice(0, i);
  if (S.changed.length) {
    renderer.paint(S.mirror.shown, S.changed);
    S.changed.length = 0;
  }
  const back = S.ovl.expire(S.appliedK);
  if (back.length) restore(back);
}

/** Vuelve a mostrar lo que dijo el servidor en esas celdas. */
function restore(cells) {
  const { owner, shown } = S.mirror;
  if (DEBUG) for (const c of cells) if (shown[c] !== owner[c]) S.dbg.mismatch++; // la predicción no coincidió con el servidor
  for (const c of cells) shown[c] = owner[c];
  renderer.paint(shown, cells);
}

/** Si la cabeza propia (predicha) volvió a casa con estela: se dibuja ya la captura que el servidor va a confirmar. */
function checkCloses() {
  const st = pr.state;
  if (!st || !st.closes.length) return;
  for (const ev of st.closes) {
    if (ev.k <= S.appliedK || S.ovl.has(ev.k)) continue;
    const before = ownedStats(S.mirror.shown, S.size, S.me).count;
    const cells = predictCapture(S.mirror.shown, S.size, S.me, ev.cells);
    S.ovl.add(ev.k, cells);
    renderer.paint(S.mirror.shown, cells);
    S.dbg.caps++;
    S.dbg.predicted += cells.length;
    const gained = ownedStats(S.mirror.shown, S.size, S.me).count - before;
    if (gained > 0) {
      feed(t('gain', { p: pctText(gained, S.size, lang()) }), 'gain');
      sfx.capture(gained);
    }
  }
  st.closes.length = 0;
}

function onDead(m) {
  if (!S.alive) return;
  S.alive = false;
  S.sw = null;
  pr.state = null;
  pr.history.length = 0;
  tx.recent.length = 0;
  const cells = S.ovl.clear();
  if (cells.length) restore(cells);
  const head = S.authHead;
  const color = S.players.get(S.me)?.color ?? lobby.profile.color;
  if (head) {
    renderer.burst(head.x + 0.5, head.y + 0.5, renderer.colors[color % renderer.colors.length]);
    S.ownDeath = { x: head.x, y: head.y, until: performance.now() + 500 };
  }
  sfx.dead();
  updateGameplay();
  const st = m.stats || {};
  S.respawnAt = performance.now() + CFG.respawnSec * 1000;
  const killer = m.by ? S.players.get(m.by) : null;
  const n = killer?.name || '?';
  const title =
    st.why === 'self' ? t('whySelf') : st.why === 'wall' ? t('whyWall') : st.why === 'cut' ? t('whyCut', { n }) : st.why === 'head' ? (killer ? t('whyHeadBy', { n }) : t('whyHead')) : st.why === 'lost' ? (killer ? t('whyLostBy', { n }) : t('whyLost')) : t('whyOut');
  $('dead-title').textContent = title;
  const rows = [
    [st.peak !== undefined ? pctText(st.peak, S.size, lang()) + '%' : '–', t('statPeak')],
    [st.time !== undefined ? formatTime(st.time) : '–', t('statTime')],
    [st.kos ?? '–', t('statKos')],
    [st.gained ?? '–', t('statGained')],
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
  clearTimeout(onDead.timer);
  onDead.timer = setTimeout(() => {
    if (!S.alive && S.mode !== 'demo' && S.screen === null) showScreen('dead');
  }, 750);
}

// ---------------------------------------------------------------- entrada
function steer(d) {
  if (!S.alive || S.screen !== null || S.hold || S.frozen || !pr.state) return;
  const cur = effectiveDir(pr.state, pr.history);
  if (!legalTurn(cur, d)) return;
  const ev = pr.record({ d, b: 0 }, pr.tick + 1);
  tx.push(ev);
  if (DEBUG) {
    S.dbg.sent.set(ev.s, performance.now());
    S.dbg.pending = { d, t: performance.now() }; // la próxima vez que se dibuje la cabeza girada se mide
  }
  sfx.turn();
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea')) return;
  const name = G.dir(e);
  if (name) {
    if (S.alive && S.screen === null) {
      e.preventDefault();
      if (!e.repeat) steer(dirOf(name));
    }
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.mode === 'demo') return;
    if (S.screen === 'pause') closePause();
    else if (S.screen === null) openPause();
  }
});

// deslizar para girar: cada vez que el dedo recorre unos píxeles en una dirección se gira y se vuelve a medir desde ahí
const cv = $('cv');
cv.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || !S.alive || S.screen !== null) return;
  S.sw = { id: e.pointerId, x: e.clientX, y: e.clientY };
  cv.setPointerCapture?.(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (!S.sw || e.pointerId !== S.sw.id) return;
  const d = swipeDir(e.clientX - S.sw.x, e.clientY - S.sw.y, 24);
  if (d < 0) return;
  steer(d);
  S.sw.x = e.clientX;
  S.sw.y = e.clientY;
});
const endSwipe = (e) => {
  if (S.sw && e.pointerId === S.sw.id) S.sw = null;
};
cv.addEventListener('pointerup', endSwipe);
cv.addEventListener('pointercancel', endSwipe);

// cruceta opcional en pantalla (se recuerda)
function setDpad(on) {
  S.dpad = !!on;
  $('dpad').hidden = !S.dpad;
  document.body.classList.toggle('dpad-on', S.dpad); // el aviso sube para no taparse con la cruceta
  $('dpad-toggle').setAttribute('aria-pressed', String(S.dpad));
  try {
    localStorage.setItem('gameit:territorio:dpad', S.dpad ? '1' : '0');
  } catch {}
}
try {
  setDpad(localStorage.getItem('gameit:territorio:dpad') === '1');
} catch {
  setDpad(false);
}
$('dpad-toggle').onclick = () => (click(), setDpad(!S.dpad));
for (const b of $('dpad').querySelectorAll('button')) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    b.setPointerCapture?.(e.pointerId);
    steer(Number(b.dataset.d));
  });
}

// ---------------------------------------------------------------- bucle
const ownPts = [];
const pool = []; // arreglos reutilizados para las estelas de cada cuadro
const bikesOut = [];
const miniBikes = [];
let lastHud = 0;
let lastMini = 0;
let raf = 0;

function updateGameplay() {
  G.gameplay(S.mode !== 'demo' && S.alive && S.screen === null && !S.hold && !S.suspended);
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

  // --- reloj del jugador propio: va adelantado un viaje de ida y vuelta (más un margen por el jitter)
  const clk = S.buf.clock;
  const online = S.mode === 'online';
  if (S.alive && pr.state && clk.ready && !S.frozen && !S.hold) {
    const lead = online ? lobby.rtt + clamp(30 + 2 * clk.jitter, 30, 120) : 0;
    const target = (clk.serverTimeAt(now) + lead) / S.tickMs;
    if (S.tf === null || Math.abs(target - S.tf) > 4) S.tf = target;
    else S.tf += dt / S.tickMs + (target - S.tf) * (1 - Math.exp(-dt / 200));
    pr.advanceTo(Math.floor(S.tf));
  }

  // --- los demás, interpolados; el territorio llega a la hora que se está mostrando
  const sm = S.buf.sample(now);
  applyTerritory(sm ? sm.time : Infinity);
  checkCloses();
  const bikes = bikesOut;
  bikes.length = 0;
  let pi = 0;
  if (sm) {
    for (const e of sm.entities) {
      const raw = e.raw;
      let back = raw[2] - e.m; // cuánto falta para llegar a la cabeza del snapshot
      if (Math.abs(back) > 3) back = 0; // reapareció: no hay nada que recortar
      back = clamp(back, -1.5, 3);
      const pts = pool[pi] || (pool[pi] = []);
      pi++;
      const n = pathPoints(e.out ? e.verts : [], raw[0], raw[1], raw[3], back, pts);
      const p = S.players.get(e.id);
      bikes.push({ id: e.id, pts, n, color: p ? p.color : e.id, dir: raw[3], out: e.out, me: false, name: p?.name || '' });
    }
    // eventos (muertes cercanas) a la hora del servidor que ya se está mostrando
    for (let i = S.events.length - 1; i >= 0; i--) {
      const ev = S.events[i];
      if (ev.t > sm.time && ev.t - sm.time < 1000) continue; // todavía no llegó a esa hora del servidor
      S.events.splice(i, 1);
      if (S.ownDeath && now < S.ownDeath.until && Math.abs(ev.x - S.ownDeath.x) <= 3 && Math.abs(ev.y - S.ownDeath.y) <= 3) continue; // la propia ya explotó
      renderer.burst(ev.x + 0.5, ev.y + 0.5, renderer.colors[ev.color % renderer.colors.length]);
      if (S.mode !== 'demo') sfx.boom();
    }
  } else S.events.length = 0;

  // --- jugador propio: estado predicho + un poco de lo que falta hasta el paso siguiente
  let headX = S.cam.x;
  let headY = S.cam.y;
  if (S.alive && pr.state) {
    const st = pr.state;
    const pk = pr.peek();
    const f = clamp(S.tf - pr.tick, 0, 1);
    const n = pathPoints(pk.verts, pk.x, pk.y, pk.dir, (1 - f) * (pk.moves - st.moves), ownPts);
    const err = pr.errorAt(now);
    if (err.x || err.y) for (let i = 0; i < n; i += 2) (ownPts[i] += err.x), (ownPts[i + 1] += err.y);
    headX = ownPts[n - 2];
    headY = ownPts[n - 1];
    bikes.push({ pts: ownPts, n, color: S.players.get(S.me)?.color ?? lobby.profile.color, dir: pk.dir, out: pk.out, me: true, name: '' });
    if (DEBUG && D.pending && pk.dir === D.pending.d) {
      D.resp.push(Math.round((now - D.pending.t) * 10) / 10);
      D.pending = null;
    }
  } else if (S.authHead && S.mode !== 'demo') {
    headX = S.authHead.x;
    headY = S.authHead.y;
  } else if (S.mode === 'demo') headX = headY = S.size / 2;

  // medición: recorrido de una cabeza remota cuadro a cuadro (suavidad), solo con ?debug
  if (DEBUG && sm && bikes.length > 1 && D.trace.length < 4000) {
    const rb = bikes[0].me ? bikes[1] : bikes[0];
    D.trace.push([now, rb.id, rb.pts[rb.n - 2], rb.pts[rb.n - 1]]);
  }

  // --- cámara
  if (S.camSnap || S.mode === 'demo') {
    S.cam.x = headX;
    S.cam.y = headY;
    S.camSnap = false;
  } else {
    const k = 1 - Math.exp(-dt / 90);
    S.cam.x += (headX - S.cam.x) * k;
    S.cam.y += (headY - S.cam.y) * k;
  }
  // las coordenadas son de celda (esquina): el centro de la celda es +0.5
  renderer.draw({ cam: { x: S.cam.x + 0.5, y: S.cam.y + 0.5 }, size: S.size, grid: S.mirror.shown, bikes, dt, t: now });

  if (S.mode !== 'demo') {
    if (now - lastHud > 100) {
      lastHud = now;
      updateHud(now);
    }
    if (now - lastMini > 250) {
      lastMini = now;
      miniBikes.length = 0;
      for (const b of bikes) miniBikes.push({ x: b.pts[b.n - 2], y: b.pts[b.n - 1], color: b.color, me: b.me });
      renderer.drawMini($('mini'), { size: S.size, bikes: miniBikes, cam: S.cam, viewW: renderer.w / renderer.cell, viewH: renderer.h / renderer.cell });
    }
  }
  if (S.alive && S.mode === 'online') tx.tick(now);
  if (DEBUG) D.work = D.work * 0.95 + (performance.now() - w0) * 0.05;
}

// ---------------------------------------------------------------- HUD
let lbDirty = true;
function renderLb() {
  lbDirty = true;
}
const lbItems = [];
let liveCells = 0;
function drawLb() {
  lbDirty = false;
  const list = $('lb-list');
  const small = matchMedia('(max-width: 560px)').matches;
  const max = small ? 5 : 8;
  const idx = S.lb.findIndex(([num]) => num === S.me);
  const rows = S.lb.slice(0, max).map((r, i) => ({ rank: i + 1, num: r[0], cells: r[1], kos: r[2] }));
  if (S.alive && idx >= max) rows.push({ rank: idx + 1, num: S.me, cells: S.lb[idx][1], kos: S.lb[idx][2], me: true });
  else if (S.alive && idx < 0) rows.push({ rank: '–', num: S.me, cells: liveCells, kos: 0, me: true });
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
  list.textContent = '';
  rows.forEach((row, i) => {
    const li = lbItems[i];
    const p = S.players.get(row.num);
    li.className = row.num === S.me && S.alive ? 'me' : '';
    li.children[0].textContent = String(row.rank);
    li.children[1].style.setProperty('--c', renderer.colors[(p?.color ?? 0) % renderer.colors.length]);
    li.children[2].textContent = p?.name || '…';
    li.children[3].textContent = pctText(row.cells, S.size, lang()) + '%' + (row.kos ? ` · ${row.kos}` : '');
    list.append(li);
  });
}

function updateHud(now) {
  if (lbDirty) drawLb();
  const alive = S.alive;
  // lo que se ve: las celdas propias del mapa que se dibuja (incluye la captura predicha)
  liveCells = alive ? ownedStats(S.mirror.shown, S.size, S.me).count : 0;
  const idx = S.lb.findIndex(([num]) => num === S.me);
  $('score').textContent = alive ? pctText(liveCells, S.size, lang()) + '%' : '–';
  const mine = $('lb-list').querySelector('.me b');
  if (mine) {
    const txt = pctText(liveCells, S.size, lang()) + '%' + (S.hud.kos ? ` · ${S.hud.kos}` : '');
    if (mine.textContent !== txt) mine.textContent = txt;
  }
  $('rank').textContent = alive && idx >= 0 ? t('rank', { r: idx + 1 }) : '';
  $('kos').textContent = alive && S.hud.kos > 0 ? t('kos', { n: S.hud.kos }) : '';
  if (S.screen === 'dead') updateRespawn(now);
}

function updateRespawn(now) {
  const left = Math.max(0, Math.ceil((S.respawnAt - now) / 1000));
  const btn = $('dead-again');
  const label = left > 0 ? t('respawnIn', { s: left }) : t('respawn');
  if (btn.textContent !== label) btn.textContent = label;
  btn.setAttribute('aria-disabled', String(left > 0));
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
  hintT = setTimeout(() => el.classList.add('off'), 8000);
}

// ---------------------------------------------------------------- pantallas
function showScreen(id) {
  S.screen = id;
  $('s-pause').hidden = id !== 'pause';
  $('s-dead').hidden = id !== 'dead';
  document.body.classList.toggle('playing', S.mode !== 'demo' && id === null && S.alive);
  if (id === 'dead') {
    updateRespawn(performance.now());
    $('dead-again').focus({ preventScroll: true });
  } else if (id === 'pause') $('pz-resume').focus({ preventScroll: true });
  updateGameplay();
}

function openPause() {
  S.sw = null;
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
  S.camSnap = true;
}

$('btn-pause').onclick = () => (click(), S.screen === null && openPause());
$('pz-resume').onclick = () => (click(), closePause());
$('pz-quit').onclick = () => (click(), goMenu());
$('pz-share').onclick = () => lobby.shareRoom();
$('dead-menu').onclick = () => (click(), goMenu());
$('dead-again').onclick = () => {
  if (S.respawnAt - performance.now() > 0) return; // todavía falta: el servidor tampoco deja
  click();
  S.pendingSpawn = true;
  S.lastSpawnTry = 0;
  showScreen(null);
  // si el servidor contesta que falta (me.wait) la espera se respeta y se vuelve a pedir sola
};

// ---------------------------------------------------------------- sonidos
function click() {
  tone(620, 480, 0.05, { type: 'triangle', vol: 0.06 });
}
const sfx = {
  turn: () => tone(760, 560, 0.03, { type: 'square', vol: 0.02 }),
  // más celdas, más arpegio
  capture: (cells) => notes(cells > 150 ? [392, 523, 659, 784] : cells > 40 ? [440, 554, 659] : [494, 659], { step: 0.06, dur: 0.14, vol: 0.1 }),
  ko: () => notes([523, 659, 784], { step: 0.07, dur: 0.16, vol: 0.12 }),
  spawn: () => tone(300, 900, 0.18, { type: 'triangle', vol: 0.09 }),
  dead: () => {
    noise(0.4, { freq: 2000, q: 0.7, vol: 0.22, sweep: 160 });
    tone(240, 50, 0.45, { type: 'sawtooth', vol: 0.12 });
  },
  boom: () => noise(0.16, { freq: 900, q: 0.8, vol: 0.05, sweep: 200 }),
};

// ---------------------------------------------------------------- arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  for (const n of document.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t);
  $('btn-pause').setAttribute('aria-label', t('pauseBtn'));
  $('dpad-toggle').setAttribute('aria-label', t('dpad'));
  for (const [d, k] of [['0', 'up'], ['3', 'left'], ['1', 'right'], ['2', 'down']]) $('dpad').querySelector(`[data-d="${d}"]`).setAttribute('aria-label', t(k));
  document.body.classList.toggle('touch', !!G.prefs.touch);
  renderer.theme(G.prefs);
  chip.setLang(lang());
  if (!S.alive) $('dead-again').textContent = t('respawn');
  if (S.mirror.mini) renderer.paintMini(S.mirror.mini);
  renderLb();
}
G.onPrefs(applyPrefs, true);
G.onPause(() => {
  S.suspended = true;
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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resync();
});

startDemo();
lobby.show();
raf = requestAnimationFrame(frame);
if (DEBUG) window.__territorio = { S, pr, tx, lobby, renderer, onMsg, steer };
G.ready();
