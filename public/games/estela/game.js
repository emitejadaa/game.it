/* Estela — game.it
 * Motos de luz en una arena: cada una deja una estela sólida, chocar con una (propia o ajena) o con la pared
 * te destruye. Online (arena con gente y bots, sala privada) o sin conexión contra bots: en los dos casos el
 * cliente recibe los mismos mensajes y corre el mismo mundo determinista (shared/world.js).
 *
 * Red (kit en /shared/net): la moto propia se simula acá con el MISMO paso que el servidor (stepOwn) y va
 * adelantada un viaje de ida y vuelta, así que responde a la entrada en el mismo cuadro sin esperar al servidor;
 * cada snapshot trae el estado autoritativo y el último `seq` aplicado y se reconcilia (se vuelven a aplicar las
 * entradas sin confirmar). Las demás motos se dibujan unos 80-250 ms atrás, interpoladas entre snapshots.
 */
import { Mirror } from './shared/sync.js';
import { CFG, PALETTE, stepOwn, trailPoints } from './shared/world.js';
import { ArenaLobby } from '/shared/arena-lobby.js';
import { defaultName } from '/shared/online.js';
import { SnapshotBuffer } from '/shared/net/interp.js';
import { Predictor } from '/shared/net/predict.js';
import { InputSender } from '/shared/net/input.js';
import { clamp } from '/shared/net/clock.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { Renderer, drawMini } from './render.js';
import { OfflineSession, cloneOwn, dirOf, effectiveDir, estimateScore, formatTime, legalTurn, OwnTracker, ownPos, swipeDir, trimPath } from './logic.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');

const TXT = {
  title: { es: 'Estela', en: 'Trail' },
  tagline: { es: 'no choques con ninguna estela', en: 'don’t hit any trail' },
  score: { es: 'Puntaje', en: 'Score' },
  top: { es: 'Ranking', en: 'Leaderboard' },
  paused: { es: 'Pausa', en: 'Paused' },
  pauseOnline: { es: 'La arena sigue mientras mirás el menú.', en: 'The arena keeps going while you look at the menu.' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  copyLink: { es: 'Copiar link de la sala', en: 'Copy room link' },
  crashed: { es: 'Fin de la racha', en: 'Run over' },
  hitWall: { es: 'Te estrellaste', en: 'You crashed' },
  hitBy: { es: 'Te derribó {n}', en: '{n} took you out' },
  respawn: { es: 'Reaparecer', en: 'Respawn' },
  respawnIn: { es: 'Reaparecer ({s})', en: 'Respawn ({s})' },
  statScore: { es: 'puntaje', en: 'score' },
  statTime: { es: 'tiempo vivo', en: 'time alive' },
  statKos: { es: 'derribos', en: 'takedowns' },
  statLen: { es: 'largo máximo', en: 'longest trail' },
  ko: { es: '¡Derribaste a {n}! +10', en: 'You took out {n}! +10' },
  kos: { es: '{n} KO', en: '{n} KO' },
  rank: { es: 'Puesto {r}', en: 'Rank {r}' },
  hintDesk: { es: '{k} para girar · Espacio o Shift = turbo (se recarga rozando estelas y paredes)', en: '{k} to turn · Space or Shift = turbo (recharges by grazing trails and walls)' },
  hintTouch: { es: 'Deslizá para girar · mantené ⚡ para el turbo', en: 'Swipe to turn · hold ⚡ for turbo' },
  keysDesk: { es: '{k} · Espacio = turbo', en: '{k} · Space = turbo' },
  keyNames: { es: { both: 'Flechas o WASD', arrows: 'Flechas', wasd: 'WASD' }, en: { both: 'Arrows or WASD', arrows: 'Arrows', wasd: 'WASD' } },
  keysTouch: { es: 'Deslizá para girar · botón ⚡ = turbo', en: 'Swipe to turn · ⚡ button = turbo' },
  lost: { es: 'Se cortó la conexión.', en: 'Connection lost.' },
  slow: { es: 'Rápida', en: 'Fast' },
};
/** Cómo se llaman las teclas de giro según la preferencia del portal. */
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
  alive: false,
  hold: false, // pausa propia (sin conexión: congela el mundo)
  suspended: false, // pausa del portal
  frozen: false, // sin conexión con el servidor: la moto propia espera
  size: CFG.size,
  tps: CFG.tps,
  tickMs: 1000 / CFG.tps,
  players: new Map(), // num → { name, color, bot }
  lb: [],
  mirror: new Mirror(),
  buf: new SnapshotBuffer({ delay: 80, minDelay: 60, maxDelay: 250, maxExtrap: 100, extrapolate: ['D'] }),
  tf: null, // paso (con decimales) en el que va la moto propia
  turbo: 0,
  authHead: null,
  hud: { energy: CFG.energyMax, kos: 0, len: 0 },
  banked: 0,
  spawnTick: 0,
  lastK: 0,
  events: [], // muertes ajenas { t, x, y, color } para mostrarlas a la hora del servidor que corresponde
  ownDeath: null,
  respawnAt: 0,
  pendingSpawn: false, // hay que pedir nacer (al entrar, al tocar Reaparecer o cuando vence la espera)
  meKnown: false,
  lastSpawnTry: 0,
  off: null,
  sw: null,
  cam: { x: CFG.size / 2, y: CFG.size / 2 },
  camSnap: true,
  lastT: performance.now(),
  dbg: { resp: [], ack: [], err: [], snapped: 0, trace: [], track: null, pending: null, sent: new Map(), frames: 0, fps: 0, work: 0, t0: performance.now(), snaps: 0 },
};
const renderer = new Renderer($('cv'));
const pr = new Predictor({ step: (s, h, tick) => stepOwn(s, h, tick, S.size), clone: cloneOwn, pos: ownPos, smoothMs: 120, snapDist: 6 });
pr.seq = Math.floor(Date.now() / 50); // los `seq` no se repiten si se recarga la página dentro de la gracia del servidor
const own = new OwnTracker(pr);
const tx = new InputSender({ send: (m) => send(m), redundancy: 3, keepaliveMs: 250 });

// ---------------------------------------------------------------- menú y red
const lobby = new ArenaLobby({
  game: 'estela',
  mount: $('lobby'),
  title: TXT.title,
  tagline: TXT.tagline,
  palette: PALETTE,
  logo: makeLogo(),
  keys: () => t('keysDesk', { k: keyName() }),
  touchKeys: () => t('keysTouch'),
  settings: [
    { key: 'speed', label: { es: 'Velocidad', en: 'Speed' }, options: [{ value: 'normal', label: { es: 'Normal', en: 'Normal' } }, { value: 'fast', label: { es: 'Rápida', en: 'Fast' } }] },
    { key: 'size', label: { es: 'Tamaño del mapa', en: 'Map size' }, options: [{ value: 'small', label: { es: 'Chico', en: 'Small' } }, { value: 'normal', label: { es: 'Normal', en: 'Normal' } }, { value: 'big', label: { es: 'Grande', en: 'Big' } }] },
  ],
  offline: {
    levels: [
      { id: 'easy', label: { es: 'Fácil', en: 'Easy' }, hint: { es: '6 bots distraídos', en: '6 easygoing bots' } },
      { id: 'normal', label: { es: 'Normal', en: 'Normal' }, hint: { es: '9 bots, algunos ágiles', en: '9 bots, some sharp' } },
      { id: 'hard', label: { es: 'Difícil', en: 'Hard' }, hint: { es: '11 bots agresivos con turbo', en: '11 aggressive bots with turbo' } },
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

/** Logo: dos estelas que se cruzan. */
function makeLogo() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 40');
  svg.setAttribute('class', 'ar-logo');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, c] of [
    ['M4 32 H44 V8 H92', '#00f0ff'],
    ['M4 8 H28 V24 H66 V36 H92', '#ff2bd6'],
  ]) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', c);
    svg.append(p);
  }
  return svg;
}

function send(m) {
  if (S.mode === 'offline') S.off.send(m);
  else if (S.mode === 'online' && lobby.net.ws?.readyState === 1) lobby.net.raw(m);
}

function resetWorld() {
  S.meKnown = false;
  S.mirror.clear();
  S.buf.clear();
  S.events.length = 0;
  pr.state = null;
  pr.history.length = 0;
  tx.recent.length = 0;
  S.tf = null;
  S.authHead = null;
  own.reset();
  S.camSnap = true;
}

function stopSessions() {
  S.off = null;
  S.hold = false;
  S.frozen = false;
  document.body.classList.remove('reconnecting');
  resetWorld();
  S.alive = false;
  S.turbo = 0;
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
  S.banked = 0;
  showScreen(null);
  $('hud').hidden = false;
  document.body.classList.add('playing');
  hint();
  G.gameplay(false);
}

function onRejoined() {
  // la conexión volvió: el servidor manda reset + estado y seguimos con la misma moto
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
  S.banked = 0;
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
    case 'pl':
      S.players = new Map(m.p.map(([num, name, color, bot]) => [num, { name, color, bot }]));
      renderLb();
      return;
    case 'me':
      onMe(m);
      return;
    case 's':
      onSnap(m, performance.now());
      return;
    case 'lb': {
      S.lb = m.l;
      // el servidor manda el puntaje exacto una vez por segundo: ahí se recalibra lo ya cobrado
      const mine = S.alive ? m.l.find(([num]) => num === S.me) : null;
      if (mine) S.banked += mine[1] - liveScore();
      renderLb();
      return;
    }
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
  S.meKnown = true;
  if (m.size) {
    S.size = m.size;
    S.tps = m.tps || CFG.tps;
    S.tickMs = 1000 / S.tps;
  }
  if (S.mode === 'demo') return;
  if (m.alive) {
    S.pendingSpawn = false;
    if (!S.alive) {
      S.alive = true;
      S.spawnTick = S.lastK;
      S.camSnap = true;
      S.turbo = 0;
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
  S.turbo = 0;
  send({ t: 'spawn', name: lobby.profile.name || defaultName(), color: lobby.profile.color });
}

/** Un snapshot (`s`): se reconstruye el mundo visible y se reconcilia la moto propia. */
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
    // `raw` guarda la cabeza, la distancia y la dirección exactas de este snapshot (los números sueltos se interpolan)
    ents.push({ id: b.num, D: b.D, turbo: !!(b.flags & 1), shield: !!(b.flags & 2), raw: [b.x, b.y, b.D, b.len, b.dir], verts: b.verts.slice() });
  }
  S.buf.push(m.k * S.tickMs, ents, now);
  if (m.x) for (const [x, y, color] of m.x) S.events.push({ t: m.k * S.tickMs, x, y, color });
  if (!S.alive || !mine || !m.o) return;
  // --- moto propia
  const ack = Number(m.a) || 0; // no `| 0`: los seq arrancan de la hora y no entran en 32 bits
  const rc = own.apply(mine, m.o, ack, m.k, now);
  if (DEBUG) {
    S.dbg.err.push(Math.round(rc.err * 100) / 100);
    if (rc.snapped) S.dbg.snapped++;
  }
  tx.ack(ack);
  S.authHead = { x: mine.x, y: mine.y, color: S.players.get(S.me)?.color ?? lobby.profile.color };
  S.hud.energy = m.o[0];
  S.hud.kos = m.o[4];
  S.hud.len = mine.len;
  if (DEBUG) {
    // tiempo hasta que el servidor confirma cada entrada (≈ un viaje de ida y vuelta)
    for (const [seq, t0] of S.dbg.sent) {
      if (seq > ack) break;
      S.dbg.ack.push(Math.round(now - t0));
      S.dbg.sent.delete(seq);
    }
  }
}

function onDead(m) {
  if (!S.alive) return;
  S.alive = false;
  S.turbo = 0;
  S.sw = null;
  pr.state = null;
  pr.history.length = 0;
  tx.recent.length = 0;
  const head = S.authHead;
  const color = S.players.get(S.me)?.color ?? lobby.profile.color;
  if (head) {
    renderer.burst(head.x + 0.5, head.y + 0.5, renderer.colors[color % renderer.colors.length]);
    S.ownDeath = { x: head.x, y: head.y, until: performance.now() + 500 };
  }
  sfx.dead();
  updateGameplay();
  const st = m.stats || {};
  S.banked += (st.time || 0) + (st.kos || 0) * CFG.koPoints;
  S.respawnAt = performance.now() + CFG.respawnSec * 1000;
  const killer = m.by ? S.players.get(m.by) : null;
  $('dead-title').textContent = killer ? t('hitBy', { n: killer.name || '?' }) : t('hitWall');
  const rows = [
    [st.score ?? '–', t('statScore')],
    [st.time !== undefined ? formatTime(st.time) : '–', t('statTime')],
    [st.kos ?? '–', t('statKos')],
    [st.len ?? '–', t('statLen')],
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
  const ev = pr.record({ d, b: S.turbo }, pr.tick + 1);
  tx.push(ev);
  if (DEBUG) {
    S.dbg.sent.set(ev.s, performance.now());
    S.dbg.pending = { d, t: performance.now() }; // la próxima vez que se dibuje la moto girada se mide
  }
  sfx.turn();
}

function setTurbo(on) {
  on = on ? 1 : 0;
  if (S.turbo === on) return;
  S.turbo = on;
  $('turbo').classList.toggle('on', !!on);
  if (!S.alive || S.screen !== null || S.hold || S.frozen || !pr.state) return;
  tx.push(pr.record({ d: -1, b: on }, pr.tick + 1));
  if (on && S.hud.energy >= CFG.turboMin) sfx.turbo();
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
  if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (S.alive && S.screen === null) {
      e.preventDefault();
      setTurbo(1);
    }
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.mode === 'demo') return;
    if (S.screen === 'pause') closePause();
    else if (S.screen === null) openPause();
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') setTurbo(0);
});
addEventListener('blur', () => setTurbo(0));

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
const turboBtn = $('turbo');
turboBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  turboBtn.setPointerCapture?.(e.pointerId);
  setTurbo(1);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) turboBtn.addEventListener(ev, () => setTurbo(0));

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

  // --- reloj de la moto propia: va adelantada un viaje de ida y vuelta (más un margen por el jitter)
  const clk = S.buf.clock;
  const online = S.mode === 'online';
  if (S.alive && pr.state && clk.ready && !S.frozen && !S.hold) {
    const lead = online ? lobby.rtt + clamp(30 + 2 * clk.jitter, 30, 120) : 0;
    const target = (clk.serverTimeAt(now) + lead) / S.tickMs;
    if (S.tf === null || Math.abs(target - S.tf) > 4) S.tf = target;
    else S.tf += dt / S.tickMs + (target - S.tf) * (1 - Math.exp(-dt / 200));
    pr.advanceTo(Math.floor(S.tf));
  }

  // --- remotas, interpoladas
  const sm = S.buf.sample(now);
  const bikes = bikesOut;
  bikes.length = 0;
  let pi = 0;
  if (sm) {
    for (const e of sm.entities) {
      const pts = trailPoints(e.verts, e.raw[0], e.raw[1], e.raw[3], pool[pi] || (pool[pi] = []));
      pi++;
      let delta = e.raw[2] - e.D; // cuánto falta para llegar a la cabeza del snapshot: la estela se recorta por la punta
      if (Math.abs(delta) > 3) delta = 0; // reapareció: no hay nada que recortar
      const n = trimPath(pts, delta, e.raw[4]);
      const p = S.players.get(e.id);
      bikes.push({ id: e.id, pts, n, color: p ? p.color : e.id, dir: e.raw[4], turbo: e.turbo, shield: e.shield, me: false, name: p?.name || '' });
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

  if (DEBUG) {
    // traza de la cabeza de una moto remota (la primera que se vea) para medir qué tan suave se mueve
    let rb = bikes.find((b) => !b.me && b.id === D.track);
    if (!rb) {
      rb = bikes.find((b) => !b.me && b.n >= 2);
      D.track = rb ? rb.id : null;
    }
    if (rb && D.trace.length < 1500) D.trace.push([Math.round(now * 10) / 10, rb.id, rb.pts[rb.n - 2], rb.pts[rb.n - 1]]);
  }

  // --- moto propia: estado predicho + un poco de lo que falta hasta el paso siguiente
  let headX = S.cam.x;
  let headY = S.cam.y;
  if (S.alive && pr.state) {
    const st = pr.state;
    const pk = pr.peek();
    const f = clamp(S.tf - pr.tick, 0, 1);
    trailPoints(pk.verts, pk.x, pk.y, pk.len, ownPts);
    const n = trimPath(ownPts, (1 - f) * (pk.D - st.D), pk.dir);
    const err = pr.errorAt(now);
    if (err.x || err.y) for (let i = 0; i < n; i += 2) (ownPts[i] += err.x), (ownPts[i + 1] += err.y);
    headX = ownPts[n - 2] ?? pk.x;
    headY = ownPts[n - 1] ?? pk.y;
    bikes.push({ pts: ownPts, n, color: S.players.get(S.me)?.color ?? lobby.profile.color, dir: pk.dir, turbo: !!pk.turbo, shield: pk.shield > 0, me: true, name: '' });
    if (DEBUG && D.pending && pk.dir === D.pending.d) {
      D.resp.push(Math.round((now - D.pending.t) * 10) / 10);
      D.pending = null;
    }
  } else if (S.authHead && S.mode !== 'demo') {
    headX = S.authHead.x;
    headY = S.authHead.y;
  } else if (S.mode === 'demo') headX = headY = S.size / 2;

  // --- cámara
  const tgx = headX;
  const tgy = headY;
  if (S.camSnap || S.mode === 'demo') {
    S.cam.x = tgx;
    S.cam.y = tgy;
    S.camSnap = false;
  } else {
    const k = 1 - Math.exp(-dt / 55);
    S.cam.x += (tgx - S.cam.x) * k;
    S.cam.y += (tgy - S.cam.y) * k;
  }
  // las coordenadas son de celda (esquina): el centro de la celda es +0.5
  renderer.draw({ cam: { x: S.cam.x + 0.5, y: S.cam.y + 0.5 }, size: S.size, bikes, dt, t: now });

  if (S.mode !== 'demo') {
    if (now - lastHud > 100) {
      lastHud = now;
      updateHud(now);
    }
    if (!document.body.classList.contains('touch') && now - lastMini > 250) {
      lastMini = now;
      miniBikes.length = 0;
      for (const b of bikes) miniBikes.push({ x: b.pts[b.n - 2], y: b.pts[b.n - 1], color: b.color, me: b.me });
      drawMini($('mini'), { size: S.size, bikes: miniBikes, cam: S.cam, viewW: renderer.w / renderer.cell, viewH: renderer.h / renderer.cell, colors: renderer.colors, dark: renderer.dark, accent: renderer.accent });
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
function drawLb() {
  lbDirty = false;
  const list = $('lb-list');
  const small = matchMedia('(max-width: 560px)').matches;
  const max = small ? 5 : 10;
  let idx = S.lb.findIndex(([num]) => num === S.me);
  const rows = S.lb.slice(0, max).map((r, i) => ({ rank: i + 1, num: r[0], score: r[1] }));
  if (S.alive && idx >= max) rows.push({ rank: idx + 1, num: S.me, score: S.lb[idx][1], me: true });
  else if (S.alive && idx < 0) rows.push({ rank: '–', num: S.me, score: Math.round(liveScore()), me: true });
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
    li.children[3].textContent = String(row.score);
    list.append(li);
  });
}

function liveScore() {
  return estimateScore({ banked: S.banked, lifeTicks: Math.max(0, S.lastK - S.spawnTick), tps: S.tps, kos: S.hud.kos, len: S.hud.len });
}

function updateHud(now) {
  if (lbDirty) drawLb();
  const alive = S.alive;
  const idx = S.lb.findIndex(([num]) => num === S.me);
  const live = alive ? Math.max(0, Math.round(liveScore())) : 0;
  $('score').textContent = String(live);
  const mine = $('lb-list').querySelector('.me b');
  if (mine && mine.textContent !== String(live)) mine.textContent = String(live); // la fila propia del ranking sigue al puntaje en vivo
  $('rank').textContent = alive && idx >= 0 ? t('rank', { r: idx + 1 }) : '';
  $('kos').textContent = alive && S.hud.kos > 0 ? t('kos', { n: S.hud.kos }) : '';
  const energy = alive && pr.state ? pr.peek().energy : S.hud.energy;
  const pct = clamp(energy / CFG.energyMax, 0, 1);
  const bar = $('energy');
  $('energy-fill').style.transform = `scaleX(${pct.toFixed(3)})`;
  bar.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
  const lock = pr.state?.lock;
  bar.classList.toggle('low', energy < CFG.turboMin && !lock);
  bar.classList.toggle('lock', !!lock);
  turboBtn.classList.toggle('dim', energy < CFG.turboMin);
  // cuenta regresiva de la pantalla de choque
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
  hintT = setTimeout(() => el.classList.add('off'), 7000);
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
  setTurbo(0);
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
  turbo: () => noise(0.2, { freq: 500, q: 0.8, vol: 0.1, sweep: 2600 }),
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
  document.body.classList.toggle('touch', !!G.prefs.touch);
  renderer.theme(G.prefs);
  chip.setLang(G.prefs.lang === 'en' ? 'en' : 'es');
  if (!S.alive) $('dead-again').textContent = t('respawn');
  renderLb();
}
G.onPrefs(applyPrefs, true);
G.onPause(() => {
  S.suspended = true;
  setTurbo(0);
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
  if (document.hidden) setTurbo(0);
  else resync();
});

startDemo();
lobby.show();
raf = requestAnimationFrame(frame);
if (DEBUG) window.__estela = { S, pr, tx, lobby, renderer, onMsg, steer, setTurbo };
G.ready();
