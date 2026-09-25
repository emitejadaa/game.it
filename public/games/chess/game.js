/* Ajedrez — game.it
 * Contra la compu (5 niveles, IA en un worker), dos jugadores en el mismo dispositivo (con reloj
 * opcional) y online con reloj validado por el servidor. Piezas SVG propias, arrastrar o tocar,
 * repaso de jugadas, pista y deshacer.
 */
import { Position, replay, toUci, mFrom, mTo, mPromo, mFlags, F_CAPTURE, F_CASTLE, typeOf, colorOf, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK } from './shared/rules.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes } from '/shared/sfx.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TXT = {
  title: { es: 'Ajedrez', en: 'Chess' },
  tagline: { es: 'el juego de siempre, liviano y fluido', en: 'the timeless game, light and smooth' },
  vsCpu: { es: 'Contra la compu', en: 'Versus CPU' },
  vsCpuSub: { es: '5 niveles, pistas y deshacer', en: '5 levels, hints and undo' },
  local: { es: 'Dos jugadores', en: 'Two players' },
  localSub: { es: 'en el mismo dispositivo, con reloj', en: 'on one device, with a clock' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'sala con código y reloj', en: 'room code and clock' },
  level: { es: 'Nivel', en: 'Level' },
  side: { es: 'Jugás con', en: 'You play' },
  white: { es: 'Blancas', en: 'White' },
  black: { es: 'Negras', en: 'Black' },
  random: { es: 'Al azar', en: 'Random' },
  play: { es: 'Jugar', en: 'Play' },
  back: { es: '← volver', en: '← back' },
  clock: { es: 'Reloj', en: 'Clock' },
  noClock: { es: 'Sin reloj', en: 'No clock' },
  autoFlip: { es: 'Girar el tablero en cada turno', en: 'Flip the board every turn' },
  yourName: { es: 'Tu nombre', en: 'Your name' },
  create: { es: 'Crear sala', en: 'Create room' },
  orJoin: { es: 'o entrá con un código', en: 'or join with a code' },
  join: { es: 'Unirse', en: 'Join' },
  shareCode: { es: 'Pasale este código a tu rival', en: 'Send this code to your rival' },
  copyLink: { es: 'Copiar link', en: 'Copy link' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  start: { es: 'Empezar partida', en: 'Start game' },
  waiting: { es: 'Esperando rival…', en: 'Waiting for a rival…' },
  waitingHost: { es: 'Esperando que el anfitrión empiece…', en: 'Waiting for the host to start…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  host: { es: 'anfitrión', en: 'host' },
  you: { es: 'Vos', en: 'You' },
  cpu: { es: 'Compu', en: 'CPU' },
  review: { es: 'Revisar la partida', en: 'Review the game' },
  menu: { es: 'Menú', en: 'Menu' },
  backToLive: { es: 'Volver a la partida →', en: 'Back to the game →' },
  noMoves: { es: 'Las jugadas aparecen acá', en: 'Moves show up here' },
  undo: { es: 'Deshacer', en: 'Undo' },
  hint: { es: 'Pista', en: 'Hint' },
  flip: { es: 'Girar', en: 'Flip' },
  resign: { es: 'Rendirse', en: 'Resign' },
  draw: { es: 'Tablas', en: 'Draw' },
  newGame: { es: 'Nueva', en: 'New' },
  exit: { es: 'Salir', en: 'Exit' },
  again: { es: 'Otra partida', en: 'Play again' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  acceptRematch: { es: 'Aceptar revancha', en: 'Accept rematch' },
  rematchSent: { es: 'Esperando a tu rival…', en: 'Waiting for your rival…' },
  rematchAsked: { es: '¡Tu rival quiere la revancha!', en: 'Your rival wants a rematch!' },
  confirm: { es: 'Tocá de nuevo para confirmar', en: 'Tap again to confirm' },
  hintIs: { es: 'Pista: {m}', en: 'Hint: {m}' },
  thinking: { es: 'pensando', en: 'thinking' },
  offline: { es: 'desconectado', en: 'disconnected' },
  drawOffered: { es: 'Ofreciste tablas', en: 'You offered a draw' },
  drawAsked: { es: 'Tu rival ofrece tablas', en: 'Your rival offers a draw' },
  acceptDraw: { es: 'Aceptar', en: 'Accept' },
  drawDeclined: { es: 'Tu rival rechazó las tablas', en: 'Your rival declined the draw' },
  // resultados
  win: { es: 'Victoria', en: 'Victory' },
  loss: { es: 'Derrota', en: 'Defeat' },
  drawK: { es: 'Tablas', en: 'Draw' },
  endK: { es: 'Fin de la partida', en: 'Game over' },
  mate: { es: '¡Jaque mate!', en: 'Checkmate!' },
  timeout: { es: 'Se acabó el tiempo', en: 'Out of time' },
  resigned: { es: 'Abandono', en: 'Resignation' },
  abandon: { es: 'Tu rival se fue', en: 'Your rival left' },
  stalemate: { es: 'Rey ahogado', en: 'Stalemate' },
  material: { es: 'Material insuficiente', en: 'Insufficient material' },
  fifty: { es: 'Regla de las 50 jugadas', en: 'Fifty-move rule' },
  repetition: { es: 'Triple repetición', en: 'Threefold repetition' },
  agreement: { es: 'Tablas de mutuo acuerdo', en: 'Draw by agreement' },
  timeoutDraw: { es: 'Tiempo agotado sin material para ganar', en: 'Timeout vs insufficient material' },
  aborted: { es: 'Partida anulada', en: 'Game aborted' },
  abortedSub: { es: 'Nadie movió a tiempo', en: 'Nobody moved in time' },
  youWon: { es: 'Ganaste con las {c}', en: 'You won with {c}' },
  youLost: { es: 'Ganaron las {c}', en: '{c} won' },
  sideWins: { es: 'Ganan las {c}', en: '{c} win' },
  whiteL: { es: 'blancas', en: 'White' },
  blackL: { es: 'negras', en: 'Black' },
  theyResigned: { es: '{n} se rindió', en: '{n} resigned' },
  youResigned: { es: 'Te rendiste', en: 'You resigned' },
};
const LEVELS = [
  null,
  { es: 'Principiante', en: 'Beginner' },
  { es: 'Fácil', en: 'Easy' },
  { es: 'Normal', en: 'Normal' },
  { es: 'Difícil', en: 'Hard' },
  { es: 'Maestro', en: 'Master' },
];
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k }) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};

const TCS = { 0: null, '1+0': [60, 0], '3+2': [180, 2], '5+0': [300, 0], '10+0': [600, 0], '15+10': [900, 10] };
const LOCAL_TCS = ['0', '1+0', '3+2', '5+0', '10+0'];
const ONLINE_TCS = ['1+0', '3+2', '5+0', '10+0', '15+10'];
const tcLabel = (k) => (k === '0' ? t('noClock') : k.replace('+', ' + '));
const PIECE_SYM = ['', 'pp', 'pn', 'pb', 'pr', 'pq', 'pk'];
const VALUE = [0, 1, 3, 3, 5, 9, 0];
const THEMES = [
  ['slate', '#dfe3ea', '#7b8599'],
  ['wood', '#efd9b4', '#b98a62'],
  ['ocean', '#dbe8f1', '#5d88aa'],
  ['neon', '#262a3a', '#171a26'],
];

// ---------------------------------------------------------------- preferencias locales
const store = {
  get(k, d) {
    try {
      const v = JSON.parse(localStorage.getItem('gameit:chess:' + k));
      return v ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('gameit:chess:' + k, JSON.stringify(v));
    } catch {}
  },
};
const cfg = { board: store.get('board', 'slate'), level: store.get('level', 3), side: store.get('side', 'w'), tc: store.get('tc', '0'), autoFlip: store.get('autoFlip', false) };

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'cpu' | 'local' | 'online'
  pos: new Position(),
  moves: [],
  sans: [],
  view: null, // jugada que se está repasando (null = en vivo)
  orient: WHITE,
  me: WHITE,
  names: ['', ''],
  result: null,
  clock: null, // { inc, left: [ms, ms], running: -1|0|1, since }
  sel: -1,
  targets: [],
  thinking: false,
  hints: 0,
  hint: null,
  rewardOk: false,
  confirm: null,
  gameNo: 0,
};
let online = null;

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  S.screen = id;
  G.gameplay(id === 'game' && !S.result);
  if (id === 'game') layout();
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  const to = go.dataset.go;
  click();
  if (to === 'online') $('on-name').value ||= defaultName();
  show(to);
});

// temas de tablero
function renderThemes() {
  $('themes').innerHTML = THEMES.map(([id, a, b]) => `<button data-theme="${id}" class="${cfg.board === id ? 'on' : ''}" aria-label="${id}"><i style="background:${a}"></i><i style="background:${b}"></i><i style="background:${b}"></i><i style="background:${a}"></i></button>`).join('');
  document.body.dataset.board = cfg.board;
}
$('themes').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  click();
  cfg.board = b.dataset.theme;
  store.set('board', cfg.board);
  renderThemes();
};

// configuración contra la compu
function renderSetup() {
  $('cpu-level').innerHTML = LEVELS.slice(1)
    .map((l, i) => `<button data-v="${i + 1}" class="${cfg.level === i + 1 ? 'on' : ''}"><i>${[1, 2, 3, 4, 5].map((k) => `<em class="${k <= i + 1 ? 'f' : ''}"></em>`).join('')}</i>${esc(G.t(l))}</button>`)
    .join('');
  $$('#cpu-side button').forEach((b) => b.classList.toggle('on', b.dataset.v === cfg.side));
  $('local-tc').innerHTML = LOCAL_TCS.map((k) => `<button data-v="${k}" class="${cfg.tc === k ? 'on' : ''}">${esc(tcLabel(k))}</button>`).join('');
  $('local-flip').checked = cfg.autoFlip;
}
$('cpu-level').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  click();
  cfg.level = Number(b.dataset.v);
  store.set('level', cfg.level);
  renderSetup();
};
$('cpu-side').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  click();
  cfg.side = b.dataset.v;
  store.set('side', cfg.side);
  renderSetup();
};
$('local-tc').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  click();
  cfg.tc = b.dataset.v;
  store.set('tc', cfg.tc);
  renderSetup();
};
$('local-flip').onchange = (e) => {
  cfg.autoFlip = e.target.checked;
  store.set('autoFlip', cfg.autoFlip);
};
$('cpu-go').onclick = () => {
  click();
  const me = cfg.side === 'r' ? (Math.random() < 0.5 ? WHITE : BLACK) : cfg.side === 'w' ? WHITE : BLACK;
  newGame({ mode: 'cpu', me });
};
$('local-go').onclick = () => {
  click();
  newGame({ mode: 'local', me: WHITE });
};

// ---------------------------------------------------------------- partida
function newGame({ mode, me, moves = [], names, tc }) {
  cancelCpu();
  S.mode = mode;
  S.me = me;
  S.orient = me;
  S.pos = new Position();
  S.moves = [];
  S.sans = [];
  S.view = null;
  S.result = null;
  S.sel = -1;
  S.targets = [];
  S.hint = null;
  S.hints = 0;
  S.confirm = null;
  S.gameNo++;
  S.drawOffer = null;
  S.again = null;
  S.names = names || (mode === 'cpu' ? (me === WHITE ? [t('you'), `${t('cpu')} · ${G.t(LEVELS[cfg.level])}`] : [`${t('cpu')} · ${G.t(LEVELS[cfg.level])}`, t('you')]) : [t('white'), t('black')]);
  const tcKey = tc ?? (mode === 'local' ? cfg.tc : '0');
  const tcv = TCS[tcKey];
  S.clock = tcv ? { inc: tcv[1] * 1000, left: [tcv[0] * 1000, tcv[0] * 1000], running: -1, since: 0 } : null;
  for (const u of moves) applyUci(u, false);
  $('over').hidden = true;
  show('game');
  syncPieces(S.pos.board, false);
  renderAll();
  layout();
  if (!moves.length) sfx.start();
  checkReward();
  afterMove();
}

function applyUci(u, animate = true) {
  const legal = S.pos.moves();
  const m = S.pos.fromUci(u, legal);
  if (!m) return false;
  S.sans.push(S.pos.san(m, legal));
  S.pos.make(m);
  S.moves.push(u);
  if (animate) syncPieces(S.pos.board, true);
  return m;
}

/** El jugador (o la compu) hace una jugada. */
function commit(m, { dropped = null } = {}) {
  const pos = S.pos;
  const legal = pos.moves();
  if (!legal.includes(m)) return;
  const mover = pos.turn;
  const san = pos.san(m, legal);
  if (dropped) {
    // la pieza arrastrada ya está en su casilla: se reubica sin animación
    const o = els.get(mFrom(m));
    if (o) {
      els.delete(mFrom(m));
      const cap = els.get(mTo(m));
      if (cap) {
        cap.el.classList.add('gone');
        setTimeout(() => cap.el.remove(), 200);
      }
      els.set(mTo(m), o);
      o.el.classList.remove('drag');
      place(o.el, mTo(m), false);
    }
  }
  pos.make(m);
  S.moves.push(toUci(m));
  S.sans.push(san);
  S.view = null;
  S.sel = -1;
  S.targets = [];
  S.hint = null;
  // reloj (local): se descuenta el tiempo usado y se suma el incremento
  if (S.clock && S.mode !== 'online') {
    const c = S.clock;
    const now = performance.now();
    if (c.running === mover) {
      c.left[mover] = Math.max(0, c.left[mover] - (now - c.since)) + c.inc;
    }
    if (S.moves.length >= 1) {
      c.running = mover ^ 1;
      c.since = now;
    }
  }
  syncPieces(pos.board, true);
  moveSound(m, san);
  if (S.mode === 'online') {
    online.send({ t: 'move', m: toUci(m) });
    S.clockSent = performance.now();
  }
  renderAll();
  const st = pos.status();
  if (st.over && S.mode !== 'online') return endGame({ winner: st.winner, reason: st.reason });
  afterMove();
}

function afterMove() {
  if (S.result) return;
  if (S.mode === 'cpu' && S.pos.turn !== S.me) cpuMove();
  if (S.mode === 'local' && cfg.autoFlip && S.orient !== S.pos.turn) setTimeout(() => S.mode === 'local' && flip(S.pos.turn), 380);
}

function moveSound(m, san) {
  if (san.endsWith('#') || san.endsWith('+')) sfx.check();
  else if (mFlags(m) & F_CASTLE) sfx.castle();
  else if (mFlags(m) & F_CAPTURE) sfx.capture();
  else sfx.move();
}

// ---------------------------------------------------------------- compu
let worker = null;
let cpuReq = 0;
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker('./ai.js', { type: 'module' });
  worker.onmessage = ({ data }) => pending.get(data.id)?.(data);
  worker.onerror = () => {
    S.thinking = false;
    toast('⚠');
  };
  return worker;
}
const pending = new Map();
function ask(payload) {
  const id = ++cpuReq;
  ensureWorker().postMessage({ id, moves: S.moves.slice(), ...payload });
  return new Promise((resolve) => pending.set(id, (d) => (pending.delete(id), resolve(d))));
}
function cancelCpu() {
  cpuReq++;
  pending.clear();
  S.thinking = false;
}
async function cpuMove() {
  S.thinking = true;
  renderCards();
  const game = S.gameNo;
  const ply = S.moves.length;
  const t0 = performance.now();
  const d = await ask({ level: cfg.level });
  if (game !== S.gameNo || ply !== S.moves.length || S.result || S.mode !== 'cpu') return;
  // un pequeño respiro para que la jugada no aparezca de golpe
  const wait = Math.max(0, 380 + Math.random() * 380 - (performance.now() - t0));
  setTimeout(() => {
    if (game !== S.gameNo || ply !== S.moves.length || S.mode !== 'cpu') return;
    S.thinking = false;
    const m = d.uci && S.pos.fromUci(d.uci);
    if (m) commit(m);
    else renderAll();
  }, wait);
}

async function hint() {
  if (S.thinking || S.result || S.view !== null) return;
  if (S.hints >= 1 && S.rewardOk) {
    if (!(await G.showReward())) return checkReward();
    checkReward();
  }
  S.hints++;
  const game = S.gameNo;
  const ply = S.moves.length;
  $('tools').querySelector('[data-k="hint"]')?.classList.add('hot');
  const d = await ask({ hint: true });
  if (game !== S.gameNo || ply !== S.moves.length) return;
  const m = d.uci && S.pos.fromUci(d.uci);
  if (!m) return renderTools();
  S.hint = [mFrom(m), mTo(m)];
  toast(t('hintIs', { m: localSan(S.pos.san(m)) }));
  renderAll();
}
function checkReward() {
  const game = S.gameNo;
  G.rewardAvailable('pista').then((ok) => {
    if (game !== S.gameNo) return;
    S.rewardOk = ok;
    renderTools();
  });
}

function undo() {
  if (!S.moves.length || S.mode === 'online') return;
  cancelCpu();
  let n = 1;
  if (S.mode === 'cpu') n = S.pos.turn === S.me ? 2 : 1;
  const moves = S.moves.slice(0, Math.max(0, S.moves.length - n));
  const r = replay(moves);
  S.pos = r.pos;
  S.moves = moves;
  S.sans = r.sans;
  S.view = null;
  S.sel = -1;
  S.targets = [];
  S.hint = null;
  if (S.result) {
    S.result = null;
    $('over').hidden = true;
    G.gameplay(true);
  }
  if (S.clock) S.clock.since = performance.now();
  syncPieces(S.pos.board, true);
  sfx.move();
  renderAll();
  afterMove();
}

function flip(to = S.orient ^ 1) {
  S.orient = to;
  placeAll(true);
  renderAll();
}

// ---------------------------------------------------------------- fin
function endGame(result) {
  if (S.result) return;
  S.result = result;
  S.thinking = false;
  S.sel = -1;
  S.targets = [];
  if (S.clock) S.clock.running = -1;
  cancelCpu();
  renderAll();
  const w = result.winner;
  const mine = S.mode !== 'local';
  const colorName = (c) => t(c === WHITE ? 'whiteL' : 'blackL');
  let kicker;
  let title;
  let sub;
  if (result.reason === 'aborted') {
    kicker = t('endK');
    title = t('aborted');
    sub = t('abortedSub');
  } else if (w === null || w === undefined) {
    kicker = t('drawK');
    title = t('drawK');
    sub = t({ stalemate: 'stalemate', material: 'material', fifty: 'fifty', repetition: 'repetition', agreement: 'agreement', timeout: 'timeoutDraw' }[result.reason] || 'drawK');
  } else {
    kicker = mine ? t(w === S.me ? 'win' : 'loss') : t('endK');
    title = { mate: t('mate'), timeout: t('timeout'), resign: t('resigned'), abandon: mine && w === S.me ? t('abandon') : t('resigned') }[result.reason] || t('endK');
    if (result.reason === 'resign' && result.by) sub = result.by === 'me' ? t('youResigned') : t('theyResigned', { n: result.by });
    else sub = mine ? (w === S.me ? t('youWon', { c: colorName(w) }) : t('youLost', { c: colorName(w) })) : t('sideWins', { c: colorName(w) });
  }
  $('over-kicker').textContent = kicker;
  $('over-title').textContent = title;
  $('over-sub').textContent = sub;
  renderAgain();
  if (w === null || w === undefined) sfx.draw();
  else if (!mine || w === S.me) sfx.win();
  else sfx.lose();
  setTimeout(() => {
    if (S.result !== result) return;
    $('over').hidden = false;
    G.gameplay(false);
  }, 650);
}

function renderAgain() {
  const b = $('over-again');
  if (S.mode === 'online') {
    const asked = S.again && S.again.length && !S.again.includes(online?.myId);
    const sent = S.again?.includes(online?.myId);
    b.textContent = sent ? t('rematchSent') : asked ? t('acceptRematch') : t('rematch');
    b.disabled = !!sent || (online?.room?.players?.length || 0) < 2;
  } else {
    b.textContent = S.mode === 'local' ? t('rematch') : t('again');
    b.disabled = false;
  }
}

$('over-again').onclick = async () => {
  click();
  if (S.mode === 'online') {
    online.send({ t: 'again' });
    S.again = [...(S.again || []), online.myId];
    renderAgain();
    return;
  }
  $('over').hidden = true;
  await G.commercialBreak('otra-partida'); // pausa natural (por defecto sin anuncio)
  if (S.mode === 'cpu') {
    const me = cfg.side === 'r' ? S.me ^ 1 : cfg.side === 'w' ? WHITE : BLACK;
    newGame({ mode: 'cpu', me });
  } else newGame({ mode: 'local', me: WHITE });
};
$('over-review').onclick = () => {
  click();
  $('over').hidden = true;
  renderTools();
};
$('over-menu').onclick = () => {
  click();
  quit();
};

function quit() {
  cancelCpu();
  if (S.mode === 'online' && online) {
    online.leave();
    S.mode = null;
    show('online');
    return;
  }
  S.mode = null;
  show('home');
}

// ---------------------------------------------------------------- tablero: piezas
const boardEl = $('board');
const piecesEl = $('pieces');
const marksEl = $('marks');
const els = new Map(); // casilla → { el, p }

const cellOf = (sq) => {
  const f = sq & 7;
  const r = sq >> 3;
  return S.orient === WHITE ? [f, 7 - r] : [7 - f, r];
};
const xform = (sq) => {
  const [c, r] = cellOf(sq);
  return `translate(${c * 100}%, ${r * 100}%)`;
};

function pieceEl(p) {
  const el = document.createElement('div');
  el.className = 'pc';
  el.innerHTML = `<svg viewBox="0 0 100 100" class="${colorOf(p) === WHITE ? 'w' : 'b'}"><use href="#${PIECE_SYM[typeOf(p)]}"/></svg>`;
  return el;
}

function place(el, sq, animate) {
  if (!animate) {
    el.style.transition = 'none';
    el.style.transform = xform(sq);
    void el.offsetWidth;
    el.style.transition = '';
  } else el.style.transform = xform(sq);
}

function placeAll(animate) {
  for (const [sq, o] of els) place(o.el, sq, animate);
}

/** Lleva las piezas del tablero a `board`, deslizando las que se movieron. */
function syncPieces(board, animate) {
  const want = new Map();
  for (let sq = 0; sq < 64; sq++) if (board[sq]) want.set(sq, board[sq]);
  const next = new Map();
  const free = [];
  for (const [sq, o] of els) {
    if (want.get(sq) === o.p) {
      next.set(sq, o);
      want.delete(sq);
    } else free.push({ ...o, sq });
  }
  for (const [sq, p] of want) {
    let bi = -1;
    let bd = 99;
    free.forEach((o, i) => {
      if (o.p !== p) return;
      const d = Math.abs((o.sq & 7) - (sq & 7)) + Math.abs((o.sq >> 3) - (sq >> 3));
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    if (bi >= 0) {
      const o = free.splice(bi, 1)[0];
      place(o.el, sq, animate);
      next.set(sq, { el: o.el, p });
    } else {
      const el = pieceEl(p);
      place(el, sq, false);
      if (animate) el.classList.add('born');
      piecesEl.appendChild(el);
      next.set(sq, { el, p });
    }
  }
  for (const o of free) {
    if (animate) {
      o.el.classList.add('gone');
      setTimeout(() => o.el.remove(), 220);
    } else o.el.remove();
  }
  els.clear();
  for (const [k, v] of next) els.set(k, v);
}

// ---------------------------------------------------------------- tablero: marcas
function viewPos() {
  if (S.view === null) return S.pos;
  if (S.viewCache?.ply !== S.view || S.viewCache.game !== S.gameNo || S.viewCache.len !== S.moves.length) {
    S.viewCache = { ply: S.view, game: S.gameNo, len: S.moves.length, pos: replay(S.moves.slice(0, S.view)).pos };
  }
  return S.viewCache.pos;
}

function renderMarks() {
  const pos = viewPos();
  const ply = S.view ?? S.moves.length;
  const html = [];
  const mk = (sq, cls) => html.push(`<div class="mk ${cls}" style="transform:${xform(sq)}"></div>`);
  if (ply > 0) {
    const u = S.moves[ply - 1];
    const sqOf = (s) => 'abcdefgh'.indexOf(s[0]) + 8 * (Number(s[1]) - 1);
    mk(sqOf(u.slice(0, 2)), 'last');
    mk(sqOf(u.slice(2, 4)), 'last');
  }
  if (S.sel >= 0) mk(S.sel, 'sel');
  if (pos.inCheck()) mk(pos.kings[pos.turn], 'check');
  for (const m of S.targets) mk(mTo(m), mFlags(m) & F_CAPTURE ? 'cap' : 'dot');
  if (S.hint && S.view === null) {
    mk(S.hint[0], 'hint');
    mk(S.hint[1], 'hint');
  }
  html.push('<div class="mk over" id="over-mk" hidden></div>');
  marksEl.innerHTML = html.join('');
}

function renderCoords() {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const file = S.orient === WHITE ? i : 7 - i;
    const rank = S.orient === WHITE ? 7 - i : i;
    // columna (fila de abajo) y fila (columna izquierda)
    const bottomRank = S.orient === WHITE ? 0 : 7;
    const leftFile = S.orient === WHITE ? 0 : 7;
    const fDark = (file + bottomRank) % 2 === 0;
    const rDark = (leftFile + rank) % 2 === 0;
    out.push(`<span class="f ${fDark ? 'on-dark' : 'on-light'}" style="left:calc(${(i + 1) * 12.5}% - ${0.9}em)">${'abcdefgh'[file]}</span>`);
    out.push(`<span class="r ${rDark ? 'on-dark' : 'on-light'}" style="top:calc(${i * 12.5}% + 3px)">${rank + 1}</span>`);
  }
  $('coords').innerHTML = out.join('');
}

// ---------------------------------------------------------------- interacción
function canAct() {
  if (!S.mode || S.result || S.view !== null || S.thinking) return false;
  if (S.mode === 'local') return true;
  if (S.mode === 'online' && (!online?.room || online.room.state !== 'playing')) return false;
  return S.pos.turn === S.me;
}

function sqAt(x, y) {
  const r = boardEl.getBoundingClientRect();
  const c = Math.floor(((x - r.left) / r.width) * 8);
  const w = Math.floor(((y - r.top) / r.height) * 8);
  if (c < 0 || c > 7 || w < 0 || w > 7) return -1;
  return S.orient === WHITE ? c + 8 * (7 - w) : 7 - c + 8 * w;
}

function select(sq) {
  S.sel = sq;
  S.targets = sq >= 0 ? S.pos.moves().filter((m) => mFrom(m) === sq) : [];
  renderMarks();
}

let drag = null;
boardEl.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  hidePromo();
  if (!canAct()) {
    if (S.view !== null) setView(null);
    return;
  }
  const sq = sqAt(e.clientX, e.clientY);
  if (sq < 0) return;
  const p = S.pos.board[sq];
  if (S.sel >= 0 && S.targets.some((m) => mTo(m) === sq)) {
    tryMove(S.sel, sq);
    return;
  }
  if (p && colorOf(p) === S.pos.turn) {
    const was = S.sel === sq;
    select(sq);
    const o = els.get(sq);
    if (!o) return;
    drag = { sq, el: o.el, x0: e.clientX, y0: e.clientY, moving: false, was, id: e.pointerId };
    boardEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else select(-1);
});

boardEl.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const r = boardEl.getBoundingClientRect();
  if (!drag.moving && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
  drag.moving = true;
  const cell = r.width / 8;
  drag.el.classList.add('drag');
  drag.el.style.transform = `translate(${e.clientX - r.left - cell / 2}px, ${e.clientY - r.top - cell / 2}px)`;
  const over = $('over-mk');
  const sq = sqAt(e.clientX, e.clientY);
  if (over) {
    over.hidden = sq < 0;
    if (sq >= 0) over.style.transform = xform(sq);
  }
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  const over = $('over-mk');
  if (over) over.hidden = true;
  if (!d.moving) {
    if (d.was) select(-1); // segundo toque sobre la misma pieza: se deselecciona
    return;
  }
  const sq = e.type === 'pointercancel' ? -1 : sqAt(e.clientX, e.clientY);
  if (sq >= 0 && sq !== d.sq && S.targets.some((m) => mTo(m) === sq)) {
    tryMove(d.sq, sq, d.el);
    return;
  }
  d.el.classList.remove('drag');
  place(d.el, d.sq, true);
  if (sq >= 0 && sq !== d.sq) sfx.illegal();
}
boardEl.addEventListener('pointerup', endDrag);
boardEl.addEventListener('pointercancel', endDrag);

function tryMove(from, to, dragged = null) {
  const opts = S.targets.filter((m) => mFrom(m) === from && mTo(m) === to);
  if (!opts.length) return;
  if (opts.length > 1) {
    // coronación: elegir pieza
    if (dragged) {
      dragged.classList.remove('drag');
      dragged.style.transition = 'none';
      dragged.style.transform = xform(to);
      void dragged.offsetWidth;
      dragged.style.transition = '';
    }
    showPromo(from, to, opts, dragged);
    return;
  }
  commit(opts[0], { dropped: dragged ? true : null });
}

function showPromo(from, to, opts, dragged) {
  const el = $('promo');
  const color = S.pos.turn;
  const [c, r] = cellOf(to);
  const down = r === 0; // la lista se despliega hacia adentro del tablero
  el.style.left = `${c * 12.5}%`;
  el.style.top = down ? '0' : 'auto';
  el.style.bottom = down ? 'auto' : '0';
  const order = [QUEEN, KNIGHT, ROOK, BISHOP];
  el.innerHTML = (down ? order : order.slice().reverse()).map((p) => `<button data-p="${p}"><svg viewBox="0 0 100 100" class="${color === WHITE ? 'w' : 'b'}"><use href="#${PIECE_SYM[p]}"/></svg></button>`).join('');
  el.hidden = false;
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    const m = opts.find((x) => mPromo(x) === Number(b.dataset.p));
    el.hidden = true;
    commit(m, { dropped: dragged ? true : null });
  };
  el.onpointerdown = (e) => e.stopPropagation();
  S.promoBack = () => {
    if (dragged) place(dragged, from, true);
  };
}
function hidePromo() {
  const el = $('promo');
  if (el.hidden) return;
  el.hidden = true;
  S.promoBack?.();
  S.promoBack = null;
}

addEventListener('keydown', (e) => {
  if (S.screen !== 'game' || e.target.closest('input')) return;
  if (e.key === 'ArrowLeft') setView((S.view ?? S.moves.length) - 1);
  else if (e.key === 'ArrowRight') setView((S.view ?? S.moves.length) + 1);
  else if (e.key === 'ArrowUp' || e.key === 'Home') setView(0);
  else if (e.key === 'ArrowDown' || e.key === 'End') setView(null);
  else if (e.key === 'f' || e.key === 'F') flip();
  else if (e.key === 'Escape') {
    hidePromo();
    select(-1);
  } else return;
  e.preventDefault();
});

// ---------------------------------------------------------------- repaso
function setView(ply) {
  if (ply !== null) ply = Math.max(0, Math.min(S.moves.length, ply));
  if (ply === S.moves.length) ply = null;
  if (ply === S.view) return;
  S.view = ply;
  S.sel = -1;
  S.targets = [];
  hidePromo();
  syncPieces(viewPos().board, true);
  sfx.move();
  renderAll();
}
$('nav-first').onclick = () => setView(0);
$('nav-prev').onclick = () => setView((S.view ?? S.moves.length) - 1);
$('nav-next').onclick = () => setView((S.view ?? S.moves.length) + 1);
$('nav-last').onclick = () => setView(null);
$('live-pill').onclick = () => setView(null);
$('nav-exit').onclick = () => {
  click();
  if (S.mode === 'online' && !S.result && S.moves.length && !confirmTwice('exit')) return;
  quit();
};
$('moves').onclick = (e) => {
  const b = e.target.closest('button[data-ply]');
  if (b) setView(Number(b.dataset.ply));
};

// ---------------------------------------------------------------- panel
const LOCAL_LETTERS = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' };
function localSan(s) {
  if (G.prefs.lang !== 'es') return s;
  return s.replace(/^[KQRBN]/, (c) => LOCAL_LETTERS[c]).replace(/=([QRBN])/, (_, c) => '=' + LOCAL_LETTERS[c]);
}

function renderMoves() {
  const el = $('moves');
  if (!S.sans.length) {
    el.innerHTML = `<p class="empty">${esc(t('noMoves'))}</p>`;
    return;
  }
  const cur = S.view ?? S.moves.length;
  const out = [];
  for (let i = 0; i < S.sans.length; i += 2) {
    out.push(`<span class="n">${i / 2 + 1}.</span>`);
    out.push(`<button data-ply="${i + 1}" class="${cur === i + 1 ? 'cur' : ''}">${esc(localSan(S.sans[i]))}</button>`);
    if (S.sans[i + 1]) out.push(`<button data-ply="${i + 2}" class="${cur === i + 2 ? 'cur' : ''}">${esc(localSan(S.sans[i + 1]))}</button>`);
  }
  el.innerHTML = out.join('');
  const c = el.querySelector('.cur');
  if (c) {
    // desplazamiento solo dentro de la lista (sin mover la página)
    const tall = $('table').classList.contains('tall');
    if (tall) el.scrollLeft = c.offsetLeft - el.clientWidth / 2 + c.offsetWidth / 2;
    else el.scrollTop = c.offsetTop - el.clientHeight / 2;
  }
}

function captured(pos) {
  const count = [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ];
  let mat = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (!p) continue;
    count[colorOf(p)][typeOf(p)]++;
    mat += (colorOf(p) === WHITE ? 1 : -1) * VALUE[typeOf(p)];
  }
  const start = [0, 8, 2, 2, 2, 1, 1];
  // piezas que capturó cada color (las que le faltan al rival)
  const took = [WHITE, BLACK].map((c) => [QUEEN, ROOK, BISHOP, KNIGHT, PAWN].flatMap((ty) => Array(Math.max(0, start[ty] - count[c ^ 1][ty])).fill(ty)));
  return { took, mat };
}

function clockText(ms) {
  if (ms === null) return '';
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `0:0${s.toFixed(1)}`;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function clockLeft(c) {
  if (!S.clock) return null;
  if (S.mode === 'online') {
    const k = S.clock;
    if (k.running === c && !S.result) return k.left[c] - Math.max(0, online.serverNow() - k.since);
    return k.left[c];
  }
  const k = S.clock;
  if (k.running === c && !S.result) return k.left[c] - (performance.now() - k.since);
  return k.left[c];
}

function renderCards() {
  const pos = viewPos();
  const cap = captured(pos);
  for (const [id, color] of [['pc-bottom', S.orient], ['pc-top', S.orient ^ 1]]) {
    const el = $(id);
    const turn = !S.result && S.pos.turn === color;
    const took = cap.took[color];
    const adv = color === WHITE ? cap.mat : -cap.mat;
    const oppColor = color === WHITE ? 'b' : 'w';
    const capHtml = took.map((ty) => `<svg viewBox="0 0 100 100" class="${oppColor}"><use href="#${PIECE_SYM[ty]}"/></svg>`).join('') + (adv > 0 ? `<b>+${adv}</b>` : '');
    const isCpu = S.mode === 'cpu' && color !== S.me;
    const off = S.mode === 'online' && S.offline?.[color];
    const thinking = isCpu && S.thinking;
    el.classList.toggle('turn', turn);
    el.innerHTML = `<div class="av"><svg viewBox="0 0 100 100" class="${color === WHITE ? 'w' : 'b'}"><use href="#pk"/></svg></div>
      <div class="who"><span class="name">${esc(S.names[color] || '')}${thinking ? `<span class="dots"><i></i><i></i><i></i></span>` : ''}${off ? `<small class="off">${esc(t('offline'))}</small>` : ''}</span><span class="cap-row">${capHtml}</span></div>
      ${S.clock ? `<div class="clock" data-c="${color}"></div>` : ''}`;
  }
  tickClocks();
}

function tickClocks() {
  if (!S.clock) return;
  for (const el of $$('.clock')) {
    const c = Number(el.dataset.c);
    const ms = clockLeft(c);
    el.textContent = clockText(ms);
    el.classList.toggle('low', ms !== null && ms < 20000);
  }
}

const ICONS = {
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  hint: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  flip: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  resign: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  draw: '<path d="M8 12h8"/><circle cx="12" cy="12" r="9"/>',
  newGame: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  exit: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  again: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
};

function renderTools() {
  const list = [];
  const over = !!S.result;
  if (S.mode === 'cpu') {
    list.push(['undo', !S.moves.length], ['hint', over || S.thinking || S.view !== null || S.pos.turn !== S.me], ['flip'], over ? ['again'] : ['resign', S.moves.length < 1], ['exit']);
  } else if (S.mode === 'local') {
    list.push(['undo', !S.moves.length], ['flip'], over ? ['again'] : ['draw', S.moves.length < 2], over ? null : ['resign', S.moves.length < 1], ['exit']);
  } else if (S.mode === 'online') {
    const offered = S.drawOffer && S.drawOffer !== online?.myId;
    list.push(over ? ['again'] : ['draw', S.moves.length < 2 || S.drawOffer === online?.myId, offered], over ? null : ['resign'], ['flip'], ['exit']);
  }
  // en pantallas anchas "Salir" va en la fila de navegación
  const wide = $('table').classList.contains('wide');
  $('nav-exit').classList.toggle('hot', S.confirm === 'exit');
  $('tools').innerHTML = list
    .filter((x) => x && !(wide && x[0] === 'exit'))
    .map(([k, dis, hot]) => {
      let label = t(k === 'again' ? (S.mode === 'online' ? 'rematch' : S.mode === 'local' ? 'rematch' : 'again') : k);
      if (k === 'draw' && hot) label = t('acceptDraw');
      const ad = k === 'hint' && S.hints >= 1 && S.rewardOk ? '<span class="ad">▶</span>' : '';
      const conf = S.confirm === k ? ' hot' : '';
      return `<button data-k="${k}" class="${hot ? 'hot' : ''}${conf}" ${dis ? 'disabled' : ''}><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${esc(label)}${ad}</button>`;
    })
    .join('');
}

function confirmTwice(k) {
  if (S.confirm === k) {
    S.confirm = null;
    return true;
  }
  S.confirm = k;
  toast(t('confirm'));
  renderTools();
  clearTimeout(S.confirmT);
  S.confirmT = setTimeout(() => {
    S.confirm = null;
    renderTools();
  }, 3000);
  return false;
}

$('tools').onclick = (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b || b.disabled) return;
  click();
  const k = b.dataset.k;
  if (k === 'undo') undo();
  else if (k === 'hint') hint();
  else if (k === 'flip') flip();
  else if (k === 'again') $('over-again').click();
  else if (k === 'exit') {
    if (S.mode === 'online' && !S.result && S.moves.length && !confirmTwice('exit')) return;
    quit();
  } else if (k === 'resign') {
    if (!confirmTwice('resign')) return;
    if (S.mode === 'online') online.send({ t: 'resign' });
    else if (S.mode === 'cpu') endGame({ winner: S.me ^ 1, reason: 'resign', by: 'me' });
    else endGame({ winner: S.pos.turn ^ 1, reason: 'resign', by: S.names[S.pos.turn] });
  } else if (k === 'draw') {
    if (S.mode === 'online') {
      if (S.drawOffer && S.drawOffer !== online.myId) online.send({ t: 'draw', a: 'accept' });
      else {
        online.send({ t: 'draw', a: 'offer' });
        toast(t('drawOffered'));
      }
    } else if (confirmTwice('draw')) endGame({ winner: null, reason: 'agreement' });
  }
  renderTools();
};

function renderAll() {
  if (S.screen !== 'game') return;
  boardEl.classList.toggle('interactive', canAct());
  renderCoords();
  renderMarks();
  renderCards();
  renderMoves();
  renderTools();
  $('live-pill').hidden = S.view === null;
}

// ---------------------------------------------------------------- diseño
function layout() {
  const W = innerWidth;
  const H = innerHeight;
  const top = 58;
  const pad = 12;
  const sideW = Math.max(250, Math.min(300, W * 0.28));
  const wide = Math.min(H - top - 16, W - sideW - 18 - pad * 2);
  const tall = Math.min(W - pad * 2, H - top - 236);
  const useWide = wide >= tall * 0.97 && wide >= 260;
  const bs = Math.max(200, Math.floor((useWide ? wide : tall) / 8) * 8);
  const table = $('table');
  table.className = `table ${useWide ? 'wide' : 'tall'}`;
  table.style.setProperty('--bs', `${bs}px`);
  document.documentElement.style.setProperty('--bs', `${bs}px`);
  // centrado en el espacio debajo de la barra del portal
  const h = table.offsetHeight;
  table.style.top = `${Math.max(top, top + (H - top - h) / 2) + h / 2}px`;
}
addEventListener('resize', () => S.screen === 'game' && (layout(), renderMoves(), renderTools()));

// ---------------------------------------------------------------- reloj
(function loop() {
  requestAnimationFrame(loop);
  if (S.screen !== 'game' || !S.clock || S.result) return;
  tickClocks();
  if (S.mode === 'online') return; // el servidor decide la caída de bandera
  const c = S.clock.running;
  if (c < 0) return;
  const left = clockLeft(c);
  if (left <= 10000 && Math.floor(left / 1000) !== S.lastTick && left > 0) {
    S.lastTick = Math.floor(left / 1000);
    sfx.tick();
  }
  if (left <= 0) {
    S.clock.left[c] = 0;
    const winner = S.pos.canMate(c ^ 1) ? c ^ 1 : null;
    endGame({ winner, reason: 'timeout' });
  }
})();

// ---------------------------------------------------------------- online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('chess', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt === undefined) return;
      $('on-status').textContent = txt;
      $('lobby-status').textContent = txt;
      if (S.mode === 'online' && txt) toast(txt);
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'error') {
        const txt = netText(m.code);
        $('on-status').textContent = txt;
        $('lobby-status').textContent = txt;
        if (S.mode === 'online' && S.screen === 'game') {
          toast(txt);
          resyncFromRoom(online.room);
        }
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = null;
        show('online');
      } else if (m.t === 'declined') toast(t('drawDeclined'));
    },
  });
  return online;
}

$('on-create').onclick = () => {
  click();
  ensureOnline().create($('on-name').value.trim() || defaultName());
};
$('on-join').onsubmit = (e) => {
  e.preventDefault();
  click();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureOnline().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => {
  click();
  online.send({ t: 'start' });
};
$('lobby-leave').onclick = () => {
  click();
  online.leave();
  S.mode = null;
  show('online');
};
const doShare = async () => {
  const r = await share('chess', online.room.code);
  if (r === 'copied') toast(t('copied'));
};
$('lobby-share').onclick = doShare;
$('lobby-code').onclick = doShare;
$('lobby-tc').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || !online?.isHost) return;
  click();
  online.send({ t: 'settings', settings: { tc: b.dataset.v } });
};

function renderLobby(room) {
  $('lobby-code').textContent = room.code;
  $('lobby-players').innerHTML = room.players
    .map((p, i) => `<li class="${p.connected ? '' : 'off'}"><svg viewBox="0 0 100 100" class="${i ? 'b' : 'w'}"><use href="#pk"/></svg>${esc(p.name)}<small>${[p.id === online.myId ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
    .join('');
  const tc = room.settings?.tc || '5+0';
  $('lobby-tc').innerHTML = ONLINE_TCS.map((k) => `<button data-v="${k}" class="${tc === k ? 'on' : ''}" ${online.isHost ? '' : 'disabled'}>${esc(tcLabel(k))}</button>`).join('');
  const full = room.players.length >= 2;
  $('lobby-start').hidden = !online.isHost || !full;
  $('lobby-status').textContent = !full ? t('waiting') : online.isHost ? '' : t('waitingHost');
}

function applyRoom(room) {
  const g = room.chess;
  if (room.state === 'lobby' || !g) {
    S.mode = 'online-lobby';
    renderLobby(room);
    if (S.screen !== 'lobby') show('lobby');
    return;
  }
  const me = g.white === online.myId ? WHITE : g.black === online.myId ? BLACK : WHITE;
  const name = (id) => (id === online.myId ? t('you') : room.players.find((p) => p.id === id)?.name ?? '?');
  const names = [name(g.white), name(g.black)];
  S.offline = [g.white, g.black].map((id) => {
    const p = room.players.find((x) => x.id === id);
    return !p || !p.connected;
  });
  if (S.mode !== 'online' || S.onlineN !== g.n) {
    // partida nueva (o reconexión): se arma desde la lista de jugadas del servidor
    S.onlineN = g.n;
    newGame({ mode: 'online', me, moves: g.moves, names, tc: g.tc });
  } else {
    S.names = names;
    syncMoves(g.moves);
  }
  // reloj del servidor
  if (S.clock && g.clock) {
    S.clock.left = g.clock.slice();
    S.clock.running = g.running;
    S.clock.since = g.since;
  }
  S.drawOffer = g.draw || null;
  if (g.draw && g.draw !== online.myId && S.lastDrawSeen !== `${g.n}:${S.moves.length}`) {
    S.lastDrawSeen = `${g.n}:${S.moves.length}`;
    toast(t('drawAsked'));
    sfx.notify();
  }
  const prevAgain = S.again || [];
  S.again = g.again || [];
  if (S.again.some((id) => id !== online.myId && !prevAgain.includes(id))) {
    toast(t('rematchAsked'));
    sfx.notify();
  }
  if (g.result && !S.result) {
    const by = g.result.by ? (g.result.by === online.myId ? 'me' : name(g.result.by)) : null;
    endGame({ winner: g.result.winner, reason: g.result.reason, by });
  }
  renderAll();
  renderAgain();
}

/** Aplica las jugadas nuevas del servidor (o reconstruye si hubo diferencias). */
function syncMoves(server) {
  const mine = S.moves;
  const samePrefix = mine.every((u, i) => server[i] === u);
  if (samePrefix && server.length >= mine.length) {
    for (let i = mine.length; i < server.length; i++) {
      const m = applyUci(server[i], false);
      if (!m) return resyncFromRoom(online.room);
      moveSound(m, S.sans[S.sans.length - 1]);
    }
    if (server.length > mine.length || S.view !== null) {
      S.view = null;
      S.sel = -1;
      S.targets = [];
      syncPieces(S.pos.board, true);
    }
    return;
  }
  resyncFromRoom(online.room);
}

function resyncFromRoom(room) {
  const g = room?.chess;
  if (!g) return;
  const r = replay(g.moves);
  if (!r) return;
  S.pos = r.pos;
  S.moves = g.moves.slice();
  S.sans = r.sans;
  S.view = null;
  S.sel = -1;
  S.targets = [];
  syncPieces(S.pos.board, true);
  renderAll();
}

// ---------------------------------------------------------------- sonidos y avisos
function click() {
  tone(660, 520, 0.05, { type: 'triangle', vol: 0.08 });
}
const sfx = {
  move: () => {
    noise(0.045, { freq: 1700, q: 1.4, vol: 0.55 });
    tone(210, 120, 0.07, { type: 'sine', vol: 0.3 });
  },
  capture: () => {
    noise(0.06, { freq: 2600, q: 1, vol: 0.7 });
    tone(320, 110, 0.09, { type: 'triangle', vol: 0.28 });
    noise(0.035, { freq: 1300, q: 1.5, vol: 0.4, at: 0.05 });
  },
  castle: () => {
    sfx.move();
    noise(0.045, { freq: 1500, q: 1.4, vol: 0.5, at: 0.09 });
    tone(190, 110, 0.07, { type: 'sine', vol: 0.26, at: 0.09 });
  },
  check: () => {
    sfx.move();
    tone(880, 880, 0.12, { type: 'triangle', vol: 0.16, at: 0.03 });
    tone(1320, 1320, 0.18, { type: 'triangle', vol: 0.1, at: 0.1 });
  },
  start: () => notes([392, 523, 659], { step: 0.08, dur: 0.18, vol: 0.1 }),
  win: () => notes([523, 659, 784, 1047], { step: 0.1, dur: 0.3, vol: 0.14 }),
  lose: () => notes([392, 330, 262], { step: 0.14, dur: 0.35, vol: 0.12 }),
  draw: () => notes([440, 440], { step: 0.16, dur: 0.25, vol: 0.12 }),
  tick: () => tone(1100, 1100, 0.03, { type: 'square', vol: 0.04 }),
  illegal: () => tone(150, 110, 0.12, { type: 'square', vol: 0.06 }),
  notify: () => notes([784, 988], { step: 0.08, dur: 0.14, vol: 0.1 }),
};

let toastT = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2400);
}

// ---------------------------------------------------------------- arranque
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('on-name').placeholder = defaultName();
  renderSetup();
  if (S.screen === 'game') renderAll();
  if (S.mode === 'online-lobby' && online?.room) renderLobby(online.room);
}, true);
G.onPause(() => {
  // pausa del portal: el reloj local se detiene
  if (S.clock && S.mode === 'local' && S.clock.running >= 0 && !S.result) {
    const c = S.clock.running;
    S.clock.left[c] -= performance.now() - S.clock.since;
    S.pausedClock = c;
    S.clock.running = -1;
  }
});
G.onResume(() => {
  if (S.pausedClock !== undefined && S.clock && S.mode === 'local' && !S.result) {
    S.clock.running = S.pausedClock;
    S.clock.since = performance.now();
  }
  S.pausedClock = undefined;
});

renderThemes();
S.screen = 'home';
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
else G.gameplay(false);
G.ready();
