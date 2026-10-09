/* Caída Libre — game.it
 * Bloques que caen en modo "último en pie": cada persona tiene su tablero, limpiar líneas manda basura a los demás
 * y gana el último que sigue vivo. Online (hasta 16 personas más bots, sala privada) o sin conexión (Maratón y
 * Contra la compu): en los tres casos el cliente recibe los mismos mensajes (shared/match.js).
 *
 * Red: el tablero propio se simula acá (Sim) para que responda en el mismo cuadro; cada fijado viaja como `lk`, el
 * servidor lo reaplica con las mismas reglas y contesta `ak` (líneas, ataque y la basura que entra); si algo no
 * coincide manda `bd` y el tablero se resincroniza. Los rivales llegan como resúmenes de 2 Hz (perfil de alturas) que
 * se suavizan; al estar eliminado se mira el tablero completo de cualquiera (`wg`).
 */
import { ArenaLobby } from '/shared/arena-lobby.js';
import { defaultName } from '/shared/online.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { PALETTE, PIECE_NAMES, CFG, HIDDEN, VISIBLE, scoreOf, levelAt, newGrid, gridFromString, W } from './shared/rules.js';
import { brain, choose } from './shared/bots.js';
import { Renderer } from './render.js';
import { Sim, Autoshift, Gesture, RivalBoards, OfflineSession, DemoBoard, layoutFor, formatTime, clamp } from './logic.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const TARGETS = ['random', 'attackers', 'weakest', 'leader'];

const TXT = {
  title: { es: 'Caída Libre', en: 'Free Fall' },
  tagline: { es: 'limpiá líneas, mandales basura y quedá último en pie', en: 'clear lines, send them garbage and be the last one standing' },
  score: { es: 'Puntaje', en: 'Score' },
  top: { es: 'Ranking', en: 'Leaderboard' },
  paused: { es: 'Pausa', en: 'Paused' },
  pauseOnline: { es: 'La partida sigue mientras mirás el menú.', en: 'The match keeps going while you look at the menu.' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  copyLink: { es: 'Copiar link de la sala', en: 'Copy room link' },
  das: { es: 'Retardo de repetición (DAS)', en: 'Repeat delay (DAS)' },
  arr: { es: 'Velocidad de repetición (ARR)', en: 'Repeat rate (ARR)' },
  arrInstant: { es: 'instantánea', en: 'instant' },
  hold: { es: 'Guardar', en: 'Hold' },
  holdBox: { es: 'GUARDAR', en: 'HOLD' },
  nextBox: { es: 'SIGUE', en: 'NEXT' },
  lines: { es: '{n} líneas', en: '{n} lines' },
  line1: { es: '1 línea', en: '1 line' },
  kos: { es: '{n} KO', en: '{n} KO' },
  alive: { es: '{n} vivos', en: '{n} alive' },
  alive1: { es: '1 vivo', en: '1 alive' },
  target: { es: 'Objetivo', en: 'Target' },
  targets: {
    random: { es: 'Al azar', en: 'Random' },
    attackers: { es: 'Quien me ataca', en: 'Attackers' },
    weakest: { es: 'El más débil', en: 'Weakest' },
    leader: { es: 'El líder', en: 'Leader' },
  },
  hintDesk: { es: '← → mover · ↓ bajar · Espacio caída · Z / X girar · C guardar · T objetivo', en: '← → move · ↓ drop · Space hard drop · Z / X rotate · C hold · T target' },
  hintTouch: { es: 'Tocá = girar · arrastrá de costado = mover · deslizá rápido abajo = caída', en: 'Tap = rotate · drag sideways = move · fast swipe down = hard drop' },
  keysDesk: { es: '← → mover · ↓ bajar · Espacio caída · Z / X girar · C guardar', en: '← → move · ↓ drop · Space hard drop · Z / X rotate · C hold' },
  keysTouch: { es: 'Tocá = girar · arrastrá = mover · deslizá abajo = caída · botón Guardar', en: 'Tap = rotate · drag = move · swipe down = drop · Hold button' },
  lost: { es: 'Se cortó la conexión.', en: 'Connection lost.' },
  banned: { es: 'Te sacamos de la sala por jugadas inválidas.', en: 'You were removed for invalid moves.' },
  go: { es: '¡Ya!', en: 'Go!' },
  watching: { es: 'Mirando a {n}', en: 'Watching {n}' },
  watchPrev: { es: 'Anterior', en: 'Previous' },
  watchNext: { es: 'Siguiente', en: 'Next' },
  // pantallas de resultado
  rankOf: { es: 'Puesto {r} de {n}', en: 'Place {r} of {n}' },
  round: { es: 'Ronda {n}', en: 'Round {n}' },
  marathon: { es: 'Maratón', en: 'Marathon' },
  topped: { es: 'Te llenaste', en: 'You topped out' },
  hitBy: { es: 'Te eliminó {n}', en: '{n} knocked you out' },
  afk: { es: 'Estabas ausente', en: 'You were away' },
  cheat: { es: 'Jugadas inválidas', en: 'Invalid moves' },
  youWon: { es: '¡Ganaste!', en: 'You won!' },
  wonBy: { es: 'Ganó {n}', en: '{n} won' },
  noWinner: { es: 'Fin de la partida', en: 'Match over' },
  marathonEnd: { es: 'Fin de la maratón', en: 'Marathon over' },
  statScore: { es: 'puntaje', en: 'score' },
  statTime: { es: 'tiempo', en: 'time' },
  statLines: { es: 'líneas', en: 'lines' },
  statSent: { es: 'basura mandada', en: 'garbage sent' },
  statKos: { es: 'eliminaciones', en: 'knockouts' },
  statPieces: { es: 'piezas', en: 'pieces' },
  watch: { es: 'Mirar', en: 'Watch' },
  respawn: { es: 'Reaparecer', en: 'Respawn' },
  respawnIn: { es: 'Reaparecer ({s})', en: 'Respawn ({s})' },
  nextRound: { es: 'La próxima ronda empieza en {s} s.', en: 'Next round starts in {s} s.' },
  nextAfter: { es: 'Reaparecés cuando empiece la próxima ronda.', en: 'You respawn when the next round starts.' },
  koYou: { es: '¡Eliminaste a {n}!', en: 'You knocked out {n}!' },
  koOther: { es: '{n} afuera · quedan {l}', en: '{n} is out · {l} left' },
  tide: { es: '¡Sube la marea!', en: 'The tide is rising!' },
  quad: { es: '¡Cuádruple!', en: 'Quad!' },
  combo: { es: 'Racha x{n}', en: 'Streak x{n}' },
  piece: { es: 'Pieza', en: 'Piece' },
};
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k }) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`gameit:caida:${k}`);
      return v === null ? d : v;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`gameit:caida:${k}`, String(v));
    } catch {}
  },
};

// ---------------------------------------------------------------- estado
const S = {
  mode: 'demo', // demo (fondo del menú) | online | offline
  screen: null, // null | pause | result
  me: 0,
  round: 0,
  phase: 'idle', // idle | count | play | over
  alive: false, // juego en esta ronda y sigo en pie
  inRound: false,
  hold: false, // pausa propia sin conexión (congela el mundo)
  suspended: false, // pausa del portal
  frozen: false, // sin conexión con el servidor
  marathon: false,
  players: new Map(),
  lb: [],
  left: 0,
  startN: 0,
  order: [], // rivales, en el orden de los tableros chicos
  countEnd: 0,
  goAt: 0, // cuándo empezó a jugar la ronda (para el tiempo)
  pend: 0,
  lines: 0,
  sent: 0,
  kos: 0,
  combo: -1,
  watchNum: 0,
  watch: null, // { num, grid, pend }
  target: store.get('target', 'random'),
  lastStats: null,
  resultAt: 0,
  deadTimer: 0,
  endAt: 0,
  off: null,
  lastT: performance.now(),
  dbg: { frames: 0, fps: 0, work: 0, t0: performance.now(), bd: 0, locks: 0, aks: 0, resp: [] },
};
if (!TARGETS.includes(S.target)) S.target = 'random';

const sim = new Sim();
const shifter = new Autoshift({ das: Number(store.get('das', 150)), arr: Number(store.get('arr', 33)) });
const gesture = new Gesture();
const rivals = new RivalBoards();
const renderer = new Renderer($('cv'));
const watchGrid = newGrid();
const ownView = { grid: sim.grid, piece: null, ghostY: 0, hold: 0, canHold: true, next: [], pend: 0, dead: false };
const watchView = { grid: watchGrid, piece: null, ghostY: 0, color: 0, pend: 0 };
const F = { lay: null, now: 0, dt: 0, own: ownView, watch: null, rivals, order: S.order, players: S.players, me: 0, target: 0, watching: 0, count: 0, demo: null, text: {} };
let nextKey = -1;

// ---------------------------------------------------------------- menú y red
const lobby = new ArenaLobby({
  game: 'caida',
  mount: $('lobby'),
  title: TXT.title,
  tagline: TXT.tagline,
  palette: PALETTE,
  logo: makeLogo(),
  keys: () => t('keysDesk'),
  touchKeys: () => t('keysTouch'),
  settings: [{ key: 'crowd', label: { es: 'Jugadores (con bots)', en: 'Players (with bots)' }, options: [{ value: 'normal', label: { es: '12', en: '12' } }, { value: 'small', label: { es: '8', en: '8' } }, { value: 'big', label: { es: '16', en: '16' } }] }],
  offline: {
    levels: [
      { id: 'marathon', label: { es: 'Maratón', en: 'Marathon' }, hint: { es: 'solo vos: la gravedad sube sola', en: 'just you: gravity keeps rising' } },
      { id: 'easy', label: { es: 'Contra la compu · fácil', en: 'Versus CPU · easy' }, hint: { es: '5 bots tranquilos', en: '5 relaxed bots' } },
      { id: 'normal', label: { es: 'Contra la compu · normal', en: 'Versus CPU · normal' }, hint: { es: '9 bots, algunos rápidos', en: '9 bots, some quick' } },
      { id: 'hard', label: { es: 'Contra la compu · difícil', en: 'Versus CPU · hard' }, hint: { es: '11 bots rápidos y apuntados', en: '11 fast, sharp bots' } },
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

/** Logo: tres bloques cayendo. */
function makeLogo() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 40');
  svg.setAttribute('class', 'ar-logo');
  svg.setAttribute('aria-hidden', 'true');
  for (const [x, y, c] of [
    [8, 4, '#ff5ec4'],
    [30, 16, '#00e5ff'],
    [52, 4, '#ffb800'],
    [74, 22, '#7dff4d'],
  ]) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', 14);
    r.setAttribute('height', 14);
    r.setAttribute('rx', 3);
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', c);
    svg.append(r);
  }
  return svg;
}

function send(m) {
  if (S.mode === 'offline') S.off?.send(m);
  else if (S.mode === 'online' && lobby.net.ws?.readyState === 1) lobby.net.raw(m);
}

function resetRound(keepStats = false) {
  S.alive = false;
  S.inRound = false;
  S.countEnd = 0;
  S.pend = 0;
  if (!keepStats) {
    S.lines = S.sent = S.kos = 0;
    S.combo = -1;
  }
  S.watchNum = 0;
  S.watch = null;
  S.lastStats = null;
  clearTimeout(S.deadTimer);
  rivals.clear();
  S.order.length = 0;
  nextKey = -1;
  sim.running = false;
  sim.setSoft(false);
  shifter.clear();
}

function resetWorld(keepStats = false) {
  resetRound(keepStats);
  S.lb = [];
  S.phase = 'idle';
  S.left = 0;
  renderer.beams.length = 0;
}

function stopSessions() {
  S.off = null;
  S.hold = false;
  S.frozen = false;
  S.marathon = false;
  document.body.classList.remove('reconnecting');
  resetWorld();
}

/** Mundo local: los mensajes que salen mientras se construye se entregan recién cuando `S.off` ya existe. */
function makeSession(opts) {
  const early = [];
  const off = new OfflineSession({ ...opts, emit: (m) => (S.off ? onMsg(m) : early.push(m)) });
  S.off = off;
  for (const m of early) onMsg(m);
}

const demos = [];
function startDemo() {
  stopSessions();
  chip.el.hidden = false;
  S.mode = 'demo';
  if (!demos.length) for (let i = 0; i < 3; i++) demos.push(new DemoBoard((Date.now() + i * 977) >>> 0));
}

function enterOnline() {
  stopSessions();
  S.mode = 'online';
  showScreen(null);
  $('hud').hidden = false;
  document.body.classList.add('playing');
  hint();
  G.gameplay(false);
}

function onRejoined() {
  // la conexión volvió: el servidor manda reset + estado y seguimos con el mismo tablero real
  S.frozen = false;
  document.body.classList.remove('reconnecting');
}

function onNetStatus(st) {
  if (S.mode !== 'online') return;
  if (st === 'reconnecting') {
    S.frozen = true;
    document.body.classList.add('reconnecting');
    shifter.clear();
    sim.setSoft(false);
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
  S.marathon = level === 'marathon';
  chip.el.hidden = true; // sin red no hay ping que mostrar
  makeSession({ level, name, color });
  send({ t: 'tg', m: S.target });
  showScreen(null);
  $('hud').hidden = false;
  document.body.classList.add('playing');
  hint();
  G.gameplay(false);
}

function goMenu(fromNet = false) {
  if (!fromNet && S.mode === 'online') lobby.leave();
  startDemo();
  showScreen(null);
  $('hud').hidden = true;
  document.body.classList.remove('playing');
  G.gameplay(false);
  if (!fromNet) lobby.show(); // si la sala se cerró, el menú ya se muestra solo con su aviso
}

// ---------------------------------------------------------------- mensajes (online o sin conexión)
function onMsg(m) {
  if (DEBUG) (S.dbg.log ||= []).push(`${Math.round(performance.now())} ${m.t}${m.t === 'me' ? ` play=${m.play} alive=${m.alive} ${m.phase} in=${m.in}` : ''}${m.t === 'rs' ? ` n=${m.n} in=${m.in}` : ''}${m.t === 'dead' ? ` ${m.cause}` : ''}`);
  switch (m.t) {
    case 'reset':
      resetWorld(true); // al reconectar el servidor manda reset + estado: el puntaje de la ronda sigue
      return;
    case 'pl':
      S.players = new Map(m.p.map(([num, name, color, bot]) => [num, { name, color, bot }]));
      F.players = S.players;
      lbDirty = true;
      return;
    case 'me':
      onMe(m);
      return;
    case 'rs':
      onRound(m);
      return;
    case 'bd':
      if (S.mode === 'demo') return;
      if (sim.resync(m)) S.dbg.bd++;
      S.pend = m.pend | 0;
      S.combo = m.cb ?? -1;
      return;
    case 'ak':
      onAck(m);
      return;
    case 'pg':
      S.pend = m.n | 0;
      return;
    case 'sm':
      rivals.apply(m, S.me);
      syncOrder();
      return;
    case 'at':
      onAttack(m);
      return;
    case 'ko':
      onKo(m);
      return;
    case 'dead':
      onDead(m);
      return;
    case 'wg':
      if (!gridFromString(m.g, watchGrid)) return;
      S.watch = { num: m.n, pend: m.pend | 0 };
      S.watchNum = m.n;
      return;
    case 'lb':
      S.lb = m.l;
      S.left = m.a;
      S.startN = m.n;
      lbDirty = true;
      return;
    case 'tide':
      feed(t('tide'), 'warn');
      sfx.tide();
      return;
    case 'end':
      onEnd(m);
      return;
    case 'banned':
      toast(t('banned'));
      return;
  }
}

/** Datos de la ronda en la que se entró (o se volvió): si juego, el tablero espera a la cuenta regresiva. */
function onMe(m) {
  S.me = m.num;
  F.me = m.num;
  if (S.mode === 'demo') return;
  const same = m.round === S.round;
  S.round = m.round;
  S.phase = m.phase === 'count' && m.in <= 0 ? 'play' : m.phase; // la cuenta ya terminó aunque el servidor todavía no dio el paso
  S.left = m.left;
  S.startN = m.n;
  if (TARGETS.includes(S.target) && m.tg !== S.target) send({ t: 'tg', m: S.target });
  if (!(m.play && m.alive && (m.phase === 'count' || m.phase === 'play'))) {
    S.alive = false;
    S.inRound = false;
    sim.running = false;
    G.gameplay(false);
    if (m.phase === 'play' || m.phase === 'count') S.watchNum = 0;
    return;
  }
  if (!same) {
    S.lines = S.sent = S.kos = 0;
    S.combo = -1;
  }
  sim.start(m.seed);
  S.alive = true;
  S.inRound = true;
  S.countEnd = m.in > 0 ? performance.now() + m.in : 0;
  S.goAt = S.countEnd || performance.now();
  sim.running = m.in <= 0 && !S.hold;
  nextKey = -1;
  showScreen(null);
  updateGameplay();
}

/** Ronda nueva: tablero vacío con la semilla compartida y cuenta regresiva. */
function onRound(m) {
  const mode = S.mode;
  if (mode === 'demo') return;
  const marathon = S.marathon;
  resetRound();
  S.round = m.round;
  S.phase = 'count';
  S.startN = m.n;
  S.alive = true;
  S.inRound = true;
  sim.start(m.seed);
  S.countEnd = performance.now() + m.in;
  S.goAt = S.countEnd;
  for (const num of S.players.keys()) if (num !== S.me) rivals.get(num);
  syncOrder();
  showScreen(null);
  if (marathon) S.left = 1;
  lbDirty = true;
  updateGameplay();
  renderer.beams.length = 0;
}

/** El orden de los tableros chicos sigue a los rivales que se conocen (los que ya no están en la sala se sacan). */
function syncOrder() {
  let changed = S.order.length !== rivals.map.size;
  const keep = [];
  for (const num of rivals.map.keys()) {
    if (num === S.me || !S.players.has(num)) {
      rivals.map.delete(num);
      changed = true;
      continue;
    }
    keep.push(num);
  }
  keep.sort((a, b) => a - b);
  if (!changed) for (let i = 0; i < keep.length; i++) if (S.order[i] !== keep[i]) changed = true;
  if (changed) {
    S.order.length = 0;
    S.order.push(...keep);
    F.lay = null;
  }
}

function onAck(m) {
  S.dbg.aks++;
  S.pend = m.pend | 0;
  S.lines += m.clr | 0;
  S.sent += m.sent | 0;
  if (m.add && m.add.length) {
    const rows = sim.addGarbage(m.add);
    if (rows) {
      renderer.garbage(rows);
      sfx.garbage(rows);
    }
  }
  if (m.sent > 0) sfx.sent(m.sent);
}

function onAttack(m) {
  const from = F.lay && centerOf(m.f);
  const to = F.lay && centerOf(m.to);
  const col = renderer.players[(S.players.get(m.f)?.color ?? 0) % renderer.players.length];
  if (from && to) renderer.beam(from, to, m.n, col);
  const r = rivals.map.get(m.to);
  if (r) r.hit = 260;
  if (m.to === S.me && S.alive) sfx.incoming(m.n);
}

function centerOf(num) {
  if (!S.alive && num === S.watchNum) return { x: F.lay.board.x + F.lay.board.w / 2, y: F.lay.board.y + F.lay.board.h / 2 };
  return renderer.centerOf(F, num);
}

function onKo(m) {
  const victim = S.players.get(m.n);
  S.left = m.left;
  if (m.n === S.me) return;
  rivals.ko(m.n, m.r);
  if (m.by === S.me) {
    S.kos++;
    feed(t('koYou', { n: victim?.name || '?' }), 'ko');
    sfx.ko();
  } else if (S.mode !== 'demo') feed(t('koOther', { n: victim?.name || '?', l: m.left }));
  lbDirty = true;
}

function onDead(m) {
  if (!S.alive) return;
  S.alive = false;
  sim.running = false;
  sim.setSoft(false);
  shifter.clear();
  gesture.cancel();
  S.watchNum = m.w || 0;
  S.lastStats = m.st || null;
  sfx.dead();
  updateGameplay();
  const killer = m.by ? S.players.get(m.by) : null;
  const st = m.st || {};
  let title = t('topped');
  if (killer) title = t('hitBy', { n: killer.name || '?' });
  else if (m.cause === 'afk') title = t('afk');
  else if (m.cause === 'cheat') title = t('cheat');
  S.result = { kind: 'dead', kicker: S.marathon ? t('marathon') : t('rankOf', { r: m.rank, n: m.of }), title, st, rank: null };
  clearTimeout(S.deadTimer);
  S.deadTimer = setTimeout(() => {
    if (!S.alive && S.screen === null && S.mode !== 'demo' && S.phase === 'play') showResult();
  }, 800);
}

function onEnd(m) {
  const wasAlive = S.alive;
  S.phase = 'over';
  S.alive = false;
  sim.running = false;
  sim.setSoft(false);
  shifter.clear();
  clearTimeout(S.deadTimer);
  const rows = m.res || [];
  const mine = rows.find((r) => r[0] === S.me);
  const won = m.win === S.me && !S.marathon;
  const wp = S.players.get(m.win);
  const st = { ...(S.lastStats || {}) };
  if (mine) Object.assign(st, { kos: mine[2], lines: mine[3], sent: mine[4], score: mine[5] });
  else if (!st.score && wasAlive) st.score = scoreOf(S.lines, S.sent, S.kos);
  if (won || wasAlive) st.time = Math.max(0, Math.round(performance.now() - S.goAt));
  let title = t('noWinner');
  if (S.marathon) title = t('marathonEnd');
  else if (won) title = t('youWon');
  else if (wp) title = t('wonBy', { n: wp.name || '?' });
  S.result = {
    kind: 'end',
    kicker: S.marathon ? t('marathon') : mine ? t('rankOf', { r: mine[1], n: rows.length }) : t('round', { n: m.round }),
    title,
    st,
    rows,
  };
  S.endAt = m.next > 0 ? performance.now() + m.next : 0;
  if (won) sfx.win();
  updateGameplay();
  setTimeout(() => S.phase === 'over' && S.screen !== 'pause' && showResult(), won ? 600 : 300);
}

// ---------------------------------------------------------------- jugadas propias
function doLock(res) {
  if (!res) return;
  S.dbg.locks++;
  send(res.msg);
  renderer.lockCells(res.cells);
  if (res.clr > 0) {
    renderer.clearRows(res.rows);
    S.combo++;
    sfx.clear(res.clr, S.combo);
    if (res.clr >= 4) feed(t('quad'), 'ko');
    else if (S.combo >= 2) feed(t('combo', { n: S.combo }), 'ko');
  } else {
    S.combo = -1;
    sfx.lock();
  }
}

const canPlay = () => S.mode !== 'demo' && S.alive && S.screen === null && !S.hold && !S.frozen && sim.running && !sim.dead;

function doMove(dx) {
  if (canPlay() && sim.move(dx)) sfx.move();
}
function doRotate(dir) {
  if (canPlay() && sim.rotate(dir)) sfx.rotate();
}
function doHard() {
  if (!canPlay()) return;
  sfx.hard();
  doLock(sim.hardDrop());
}
function doHold() {
  if (!canPlay()) return;
  if (sim.hold()) sfx.hold();
  else sfx.nope();
}
function setSoft(on) {
  sim.setSoft(on && canPlay());
}

function cycleTarget(dir = 1) {
  const i = TARGETS.indexOf(S.target);
  S.target = TARGETS[(i + dir + TARGETS.length) % TARGETS.length];
  store.set('target', S.target);
  send({ t: 'tg', m: S.target });
  sfx.click();
  updateTargetBtn();
}

function watchStep(dir) {
  const alive = S.order.filter((n) => rivals.map.get(n)?.alive);
  if (!alive.length) return;
  let i = alive.indexOf(S.watchNum);
  i = i < 0 ? 0 : (i + dir + alive.length) % alive.length;
  S.watchNum = alive[i];
  send({ t: 'watch', n: S.watchNum });
  sfx.click();
}

// ---------------------------------------------------------------- entrada
const typing = (e) => e.target.closest?.('input, select, textarea');
const held = { left: false, right: false };

addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.mode === 'demo' || e.repeat) return;
    if (S.screen === 'pause') closePause();
    else if (S.screen === null) openPause();
    return;
  }
  if (S.mode === 'demo' || S.screen === 'pause') return;
  const name = G.dir(e);
  if (!S.alive) {
    if (S.screen === null && S.phase === 'play' && (name === 'left' || name === 'right') && !e.repeat) {
      e.preventDefault();
      watchStep(name === 'left' ? -1 : 1);
    }
    return;
  }
  if (S.screen !== null) return;
  if (name === 'left' || name === 'right') {
    e.preventDefault();
    if (e.repeat) return; // la repetición la maneja Autoshift (DAS / ARR configurables)
    const d = name === 'left' ? -1 : 1;
    held[name] = true;
    shifter.press(d);
    doMove(d);
  } else if (name === 'down') {
    e.preventDefault();
    setSoft(true);
  } else if (name === 'up') {
    e.preventDefault();
    if (!e.repeat) doRotate(1);
  } else if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) doHard();
  } else if (e.code === 'KeyZ') {
    if (!e.repeat) doRotate(-1);
  } else if (e.code === 'KeyX') {
    if (!e.repeat) doRotate(1);
  } else if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    e.preventDefault();
    if (!e.repeat) doHold();
  } else if (e.code === 'KeyT') {
    if (!e.repeat) cycleTarget(1);
  }
});
addEventListener('keyup', (e) => {
  const name = G.dir(e);
  if (name === 'left' || name === 'right') {
    held[name] = false;
    shifter.release(name === 'left' ? -1 : 1);
  } else if (name === 'down') setSoft(false);
});
function releaseKeys() {
  held.left = held.right = false;
  shifter.clear();
  sim.setSoft(false);
  gesture.cancel();
}
addEventListener('blur', releaseKeys);

// táctil: tocar = girar · arrastrar de costado = mover por columnas · lento hacia abajo = caída suave · rápido = caída dura
const cv = $('cv');
let ptr = 0;
cv.addEventListener('pointerdown', (e) => {
  if (S.mode === 'demo' || S.screen !== null) return;
  if (!S.alive) {
    pickMini(e.clientX, e.clientY);
    return;
  }
  if (e.pointerType === 'mouse' || ptr) return;
  ptr = e.pointerId;
  gesture.cell = F.lay ? F.lay.cell : 24;
  gesture.down(e.clientX, e.clientY, e.timeStamp);
  cv.setPointerCapture?.(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (e.pointerId !== ptr) return;
  runGesture(gesture.move(e.clientX, e.clientY, e.timeStamp));
});
const endPtr = (e) => {
  if (e.pointerId !== ptr) return;
  ptr = 0;
  runGesture(e.type === 'pointercancel' ? (gesture.cancel(), [{ a: 'soft', on: false }]) : gesture.up(e.clientX, e.clientY, e.timeStamp));
};
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
function runGesture(acts) {
  for (const a of acts) {
    if (a.a === 'move') doMove(a.dx);
    else if (a.a === 'soft') setSoft(a.on);
    else if (a.a === 'rotate') doRotate(1);
    else if (a.a === 'hard') doHard();
  }
}
/** Un toque sobre un tablero chico (estando eliminado) pasa a mirar ese tablero. */
function pickMini(x, y) {
  const lay = F.lay;
  if (!lay || !lay.minis.m) return;
  const m = lay.minis.m;
  S.order.forEach((num, i) => {
    const p = lay.minis.pos[i];
    if (!p || x < p.x - 4 || x > p.x + 10 * m + 4 || y < p.y - 4 || y > p.y + 20 * m + 4) return;
    if (!rivals.map.get(num)?.alive) return;
    S.watchNum = num;
    send({ t: 'watch', n: num });
    sfx.click();
  });
}

const holdBtn = $('btn-hold');
holdBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  doHold();
});
$('watch-prev').onclick = () => watchStep(-1);
$('watch-next').onclick = () => watchStep(1);
$('btn-target').onclick = () => cycleTarget(1);
$('btn-alive').onclick = () => {
  const lb = $('lb');
  const open = !lb.classList.contains('open');
  lb.classList.toggle('open', open);
  $('btn-alive').setAttribute('aria-expanded', String(open));
};

// ---------------------------------------------------------------- bucle
let raf = 0;
let lastHud = 0;

function updateGameplay() {
  G.gameplay(S.mode !== 'demo' && S.alive && S.phase === 'play' && S.screen === null && !S.hold && !S.suspended);
}

function relayout() {
  const w = innerWidth;
  const h = innerHeight;
  const touch = !!G.prefs.touch;
  const n = S.mode === 'demo' ? 0 : S.order.length;
  const L = F.lay;
  if (L && L.w === w && L.h === h && L.n === n && L.touch === touch) return;
  F.lay = layoutFor(w, h, { rivals: n, touch });
  Object.assign(F.lay, { n, touch });
  const lay = F.lay;
  document.body.classList.toggle('strip', lay.mode === 'strip');
  document.body.classList.toggle('compact', lay.mode === 'side' && h < 600);
  const wb = $('watchbar').style;
  wb.left = `${lay.board.x}px`;
  wb.width = `${lay.board.w}px`;
  wb.top = `${lay.board.y + 6}px`;
  const ct = $('count').style;
  ct.left = `${lay.board.x}px`;
  ct.width = `${lay.board.w}px`;
  ct.top = `${lay.board.y + lay.board.h / 2 - 70}px`;
  ct.height = '140px';
  const hb = holdBtn.style;
  if (lay.mode === 'strip') {
    hb.left = `${Math.max(8, lay.hold.x - 4)}px`;
  } else hb.left = '';
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
  relayout();
  F.now = now;
  F.dt = dt;
  if (S.off && !S.hold) S.off.update(dt);

  // cuenta regresiva (en pausa sin conexión el partido no avanza, así que la cuenta tampoco)
  if (S.hold) {
    if (S.countEnd) S.countEnd += dt;
    S.goAt += dt;
  }
  if (S.countEnd) {
    const left = S.countEnd - now;
    if (left <= 0) {
      S.countEnd = 0;
      S.phase = 'play';
      sim.running = S.alive && !S.hold;
      goCount();
      updateGameplay();
    }
  }
  if (S.phase === 'play' && S.alive && !S.countEnd && !S.hold && !sim.running && !sim.dead && S.mode !== 'demo') sim.running = true;
  // tablero propio
  if (S.mode !== 'demo' && S.alive && S.screen === null && !S.frozen && !S.hold) {
    if (sim.running) {
      const k = shifter.update(dt);
      if (k) {
        const d = Math.sign(k);
        for (let i = Math.min(Math.abs(k), 12); i > 0 && !sim.dead; i--) if (!sim.move(d)) break;
      }
      if (!sim.dead) doLock(sim.update(dt));
    }
  }
  rivals.tick(dt);
  if (S.mode === 'demo') {
    for (const d of demos) d.update(dt);
    F.demo = demoViews();
  } else F.demo = null;

  // vista
  fillViews(now);
  F.watch = !S.alive && S.watch && S.phase === 'play' ? watchView : null;
  F.count = S.countEnd ? S.countEnd - now : 0;
  F.watching = F.watch ? S.watchNum : 0;
  renderer.draw(F);

  if (S.mode !== 'demo' && now - lastHud > 100) {
    lastHud = now;
    updateHud(now);
  }
  if (DEBUG) D.work = D.work * 0.95 + (performance.now() - w0) * 0.05;
}

const demoRects = [];
function demoViews() {
  const w = innerWidth;
  const h = innerHeight;
  const c = clamp(Math.floor((h - 140) / 23), 8, 26);
  const gap = 28;
  const n = w >= 10 * c * 3 + gap * 4 ? 3 : w >= 10 * c * 2 + gap * 3 ? 2 : 1;
  demoRects.length = 0;
  for (let i = 0; i < n; i++) {
    const d = demos[i];
    const x = Math.round(w / 2 - (n * 10 * c + (n - 1) * gap) / 2 + i * (10 * c + gap));
    demoRects.push({ grid: d.grid, piece: d.piece, x, y: Math.round(h / 2 - (VISIBLE * c) / 2) + 16, c });
  }
  return demoRects;
}

const nextCache = [];
function fillViews(now) {
  const o = ownView;
  o.grid = sim.grid;
  o.piece = sim.dead || !S.alive ? null : sim.piece;
  o.ghostY = o.piece ? sim.ghostY() : 0;
  o.hold = sim.feed.held;
  o.canHold = sim.feed.canHold;
  if (nextKey !== sim.feed.qi) {
    nextKey = sim.feed.qi;
    nextCache.length = 0;
    nextCache.push(...sim.feed.preview(CFG.queueShown));
  }
  o.next = nextCache;
  o.pend = S.pend;
  o.dead = sim.dead;
  if (S.watch) {
    const p = S.players.get(S.watch.num);
    watchView.color = p?.color ?? 0;
    watchView.pend = S.watch.pend;
  }
  void now;
}

/** Cuenta regresiva: 3, 2, 1 y "¡Ya!". */
let lastCountN = 0;
function goCount() {
  const el = $('count');
  el.textContent = t('go');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  sfx.go();
  setTimeout(() => {
    if (!S.countEnd) el.textContent = '';
  }, 600);
}

// ---------------------------------------------------------------- HUD
let lbDirty = true;
const lbItems = [];
function drawLb() {
  lbDirty = false;
  const list = $('lb-list');
  const small = matchMedia('(max-width: 560px)').matches;
  const max = small ? 5 : 8;
  const rows = S.lb.slice(0, max).map((r, i) => ({ rank: i + 1, num: r[0], score: r[1], kos: r[2], out: r[3] > 0 }));
  const idx = S.lb.findIndex(([num]) => num === S.me);
  if (idx >= max) rows.push({ rank: idx + 1, num: S.me, score: S.lb[idx][1], kos: S.lb[idx][2], out: S.lb[idx][3] > 0 });
  while (lbItems.length < rows.length) {
    const li = document.createElement('li');
    const r = document.createElement('span');
    r.className = 'r';
    const dot = document.createElement('i');
    const n = document.createElement('span');
    n.className = 'n';
    const b = document.createElement('b');
    const em = document.createElement('em');
    li.append(r, dot, n, b, em);
    lbItems.push(li);
  }
  list.textContent = '';
  rows.forEach((row, i) => {
    const li = lbItems[i];
    const p = S.players.get(row.num);
    li.className = (row.num === S.me ? 'me ' : '') + (row.out ? 'out' : '');
    li.children[0].textContent = String(row.rank);
    li.children[1].style.setProperty('--c', renderer.players[(p?.color ?? 0) % renderer.players.length]);
    li.children[2].textContent = p?.name || '…';
    li.children[3].textContent = String(row.score);
    li.children[4].textContent = row.kos > 0 ? `${row.kos}KO` : '';
    list.append(li);
  });
}

let chipsKey = '';
function updateHud(now) {
  if (lbDirty) drawLb();
  const live = scoreOf(S.lines, S.sent, S.kos);
  $('score').textContent = String(live);
  const mine = $('lb-list').querySelector('.me b');
  if (mine && S.alive && mine.textContent !== String(live)) mine.textContent = String(live);
  const lines = S.lines === 1 ? t('line1') : t('lines', { n: S.lines });
  $('lines').textContent = S.marathon ? `${lines} · Nv ${levelAt(sim.timeMs / 1000)}` : lines;
  $('kos').textContent = S.kos > 0 ? t('kos', { n: S.kos }) : '';
  const ab = $('alive');
  ab.textContent = S.marathon ? formatTime(S.alive ? now - S.goAt : S.lastStats?.time ?? 0) : S.left === 1 ? t('alive1') : t('alive', { n: S.left });
  $('btn-alive').hidden = false;
  $('btn-target').hidden = S.marathon;
  holdBtn.classList.toggle('dim', !sim.feed.canHold || !S.alive);
  // cuenta regresiva (número entero)
  if (S.countEnd) {
    const n = Math.max(1, Math.ceil((S.countEnd - now) / 1000));
    if (n !== lastCountN) {
      lastCountN = n;
      const el = $('count');
      el.textContent = String(n);
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      sfx.beep(n);
    }
  } else lastCountN = 0;
  // barra de quien mira
  const spectating = !S.alive && S.phase === 'play' && S.screen === null && S.watch;
  $('watchbar').hidden = !spectating;
  if (spectating) $('watch-name').textContent = t('watching', { n: S.players.get(S.watchNum)?.name || '…' });
  const k = `${S.target}|${G.prefs.lang}`;
  if (k !== chipsKey) {
    chipsKey = k;
    updateTargetBtn();
  }
  if (S.screen === 'result') updateResultNote(now);
}

function updateTargetBtn() {
  const b = $('btn-target');
  b.textContent = '';
  const label = document.createElement('span');
  label.textContent = `${t('target')}: `;
  const v = document.createElement('b');
  v.textContent = G.t(TXT.targets[S.target]);
  b.append(label, v);
  b.setAttribute('aria-label', `${t('target')}: ${G.t(TXT.targets[S.target])}`);
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
  el.textContent = t(document.body.classList.contains('touch') ? 'hintTouch' : 'hintDesk');
  el.classList.remove('off');
  clearTimeout(hintT);
  hintT = setTimeout(() => el.classList.add('off'), 8000);
}

// ---------------------------------------------------------------- pantallas
function showScreen(id) {
  S.screen = id;
  $('s-pause').hidden = id !== 'pause';
  $('s-result').hidden = id !== 'result';
  if (id) releaseKeys();
  document.body.classList.toggle('playing', S.mode !== 'demo' && id === null && S.alive);
  if (id === 'pause') $('pz-resume').focus({ preventScroll: true });
  updateGameplay();
}

function statRows(st) {
  const rows = [
    [st.score ?? '–', t('statScore')],
    [st.time !== undefined ? formatTime(st.time) : '–', t('statTime')],
    [st.lines ?? '–', t('statLines')],
    [st.kos ?? '–', t('statKos')],
  ];
  if (!S.marathon) rows.push([st.sent ?? '–', t('statSent')]);
  if (st.pieces !== undefined) rows.push([st.pieces, t('statPieces')]);
  return rows;
}

function showResult() {
  const r = S.result;
  if (!r || S.mode === 'demo') return;
  const isEnd = r.kind === 'end';
  $('res-kicker').textContent = r.kicker || '';
  $('res-title').textContent = r.title;
  $('res-sub').textContent = '';
  const dl = $('res-stats');
  dl.textContent = '';
  for (const [v, l] of statRows(r.st || {})) {
    const d = document.createElement('div');
    const dd = document.createElement('dd');
    const dt = document.createElement('dt');
    dd.textContent = String(v);
    dt.textContent = l;
    d.append(dd, dt);
    dl.append(d);
  }
  const ol = $('res-rank');
  ol.textContent = '';
  if (isEnd && !S.marathon && r.rows) {
    const idx = r.rows.findIndex((x) => x[0] === S.me);
    const show = r.rows.slice(0, 5);
    if (idx >= 5) show.push(r.rows[idx]);
    for (const row of show) {
      const li = document.createElement('li');
      if (row[0] === S.me) li.className = 'me';
      const a = document.createElement('span');
      a.className = 'r';
      a.textContent = String(row[1]);
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = S.players.get(row[0])?.name || '…';
      const k = document.createElement('span');
      k.textContent = row[2] > 0 ? `${row[2]} KO` : '';
      const s = document.createElement('span');
      s.textContent = String(row[5]);
      li.append(a, n, k, s);
      ol.append(li);
    }
  }
  const online = S.mode === 'online';
  const a = $('res-a');
  const b = $('res-b');
  a.hidden = false;
  b.hidden = true;
  if (isEnd) {
    a.textContent = t('respawn');
    a.setAttribute('aria-disabled', online ? 'true' : 'false');
  } else if (online) {
    a.textContent = t('watch');
    a.setAttribute('aria-disabled', 'false');
  } else {
    a.textContent = t('respawn');
    a.setAttribute('aria-disabled', 'false');
    b.hidden = false;
    b.textContent = t('watch');
  }
  S.resultKind = r.kind;
  S.resultAt = performance.now();
  showScreen('result');
  updateResultNote(performance.now());
  a.focus({ preventScroll: true });
}

function updateResultNote(now) {
  const note = $('res-note');
  const a = $('res-a');
  let text = '';
  if (S.resultKind === 'end' && S.mode === 'online') {
    const s = S.endAt ? Math.max(0, Math.ceil((S.endAt - now) / 1000)) : 0;
    text = t('nextRound', { s });
    const label = s > 0 ? t('respawnIn', { s }) : t('respawn');
    if (a.textContent !== label) a.textContent = label;
  } else if (S.resultKind === 'dead' && S.mode === 'online') text = t('nextAfter');
  if (note.textContent !== text) note.textContent = text;
}

function openPause() {
  releaseKeys();
  S.hold = S.mode === 'offline';
  if (S.hold) sim.setSoft(false);
  $('pause-sub').textContent = S.mode === 'online' ? t('pauseOnline') : '';
  $('pz-share').hidden = !(S.mode === 'online' && lobby.net.room?.settings?.public === false);
  S.pausedFrom = S.screen;
  showScreen('pause');
}
function closePause() {
  S.hold = false;
  showScreen(S.pausedFrom === 'result' ? 'result' : null);
}

$('btn-pause').onclick = () => (sfx.click(), S.screen === null && openPause());
$('pz-resume').onclick = () => (sfx.click(), closePause());
$('pz-quit').onclick = () => (sfx.click(), goMenu());
$('pz-share').onclick = () => lobby.shareRoom();
$('res-c').onclick = () => (sfx.click(), goMenu());
// los primeros instantes no cuentan: quien sigue apretando Espacio al perder no tiene que cerrar la pantalla sin querer
const tooSoon = () => performance.now() - S.resultAt < 700;
$('res-a').onclick = () => {
  if ($('res-a').getAttribute('aria-disabled') === 'true' || tooSoon()) return;
  sfx.click();
  if (S.mode === 'offline' && S.off) {
    S.off.restart(); // otra ronda ya: reaparece con todos de nuevo
    return;
  }
  showScreen(null); // online: 'Mirar' (o ya empezó la ronda)
};
$('res-b').onclick = () => {
  if (tooSoon()) return;
  sfx.click();
  showScreen(null);
};

// ajustes de repetición de teclas
const dasEl = $('das');
const arrEl = $('arr');
dasEl.value = String(shifter.das);
arrEl.value = String(shifter.arr);
function syncCtl() {
  shifter.das = Number(dasEl.value);
  shifter.arr = Number(arrEl.value);
  $('das-v').textContent = `${shifter.das} ms`;
  $('arr-v').textContent = shifter.arr === 0 ? t('arrInstant') : `${shifter.arr} ms`;
  store.set('das', shifter.das);
  store.set('arr', shifter.arr);
}
dasEl.oninput = arrEl.oninput = syncCtl;

// ---------------------------------------------------------------- sonidos
const sfx = {
  click: () => tone(620, 480, 0.05, { type: 'triangle', vol: 0.06 }),
  move: () => tone(300, 260, 0.025, { type: 'square', vol: 0.012 }),
  rotate: () => tone(520, 700, 0.035, { type: 'triangle', vol: 0.035 }),
  hold: () => tone(420, 320, 0.07, { type: 'triangle', vol: 0.05 }),
  nope: () => tone(160, 130, 0.05, { type: 'square', vol: 0.025 }),
  lock: () => tone(170, 100, 0.07, { type: 'sine', vol: 0.1 }),
  hard: () => noise(0.07, { freq: 900, q: 0.8, vol: 0.05, sweep: 250 }),
  clear: (n, combo) => notes([440, 554, 659, 880, 1109].slice(0, Math.min(5, n + 1 + (combo >= 2 ? 1 : 0))), { step: 0.045, dur: 0.12, vol: 0.1 }),
  sent: (n) => tone(700, 700 + 160 * Math.min(6, n), 0.1, { type: 'square', vol: 0.04 }),
  incoming: (n) => tone(220, 150, 0.12 + Math.min(0.15, n * 0.02), { type: 'sawtooth', vol: 0.05 }),
  garbage: (n) => {
    tone(120, 60, 0.16 + Math.min(0.2, n * 0.03), { type: 'sawtooth', vol: 0.09 });
    noise(0.12, { freq: 300, q: 0.8, vol: 0.1, sweep: 90 });
  },
  tide: () => notes([196, 165], { step: 0.14, dur: 0.22, type: 'sawtooth', vol: 0.06 }),
  ko: () => notes([523, 659, 784], { step: 0.07, dur: 0.16, vol: 0.12 }),
  dead: () => {
    noise(0.4, { freq: 1800, q: 0.7, vol: 0.2, sweep: 140 });
    tone(240, 50, 0.45, { type: 'sawtooth', vol: 0.11 });
  },
  win: () => notes([523, 659, 784, 1047, 1319], { step: 0.09, dur: 0.22, vol: 0.14 }),
  beep: (n) => tone(n === 1 ? 560 : 440, n === 1 ? 560 : 440, 0.09, { type: 'triangle', vol: 0.08 }),
  go: () => tone(660, 1100, 0.22, { type: 'triangle', vol: 0.1 }),
};

// ---------------------------------------------------------------- arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  for (const n of document.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t);
  document.body.classList.toggle('touch', !!G.prefs.touch);
  renderer.theme(G.prefs);
  chip.setLang(G.prefs.lang === 'en' ? 'en' : 'es');
  F.text = { hold: t('holdBox'), next: t('nextBox') };
  F.lay = null;
  chipsKey = '';
  syncCtl();
  lbDirty = true;
}
G.onPrefs(applyPrefs, true);
G.onPause(() => {
  S.suspended = true;
  releaseKeys();
  cancelAnimationFrame(raf);
  raf = 0;
  updateGameplay();
});
G.onResume(() => {
  if (!S.suspended) return;
  S.suspended = false;
  S.lastT = performance.now();
  if (!raf) raf = requestAnimationFrame(frame);
  updateGameplay();
});
addEventListener('resize', () => {
  renderer.resize();
  F.lay = null;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseKeys();
});

startDemo();
lobby.show();
raf = requestAnimationFrame(frame);
if (DEBUG) {
  // ayudas para las pruebas en el navegador: juega una pieza con el mismo bot que usan los rivales
  const bot = brain(3);
  const rnd = () => Math.random();
  window.__caida = {
    S,
    sim,
    F,
    lobby,
    renderer,
    rivals,
    onMsg,
    send,
    doLock,
    autoplay(on = true) {
      clearInterval(window.__caida.timer);
      if (!on) return;
      window.__caida.timer = setInterval(() => {
        if (!canPlay()) return;
        const c = choose(sim.grid, sim.feed, bot, rnd, S.pend > 0);
        if (!c) return;
        if (c.hold && !sim.hold()) return;
        const p = sim.piece;
        p.r = c.r;
        p.x = c.x;
        doHard();
      }, 450);
    },
    names: PIECE_NAMES,
    HIDDEN,
    W,
    defaultName,
  };
}
G.ready();
