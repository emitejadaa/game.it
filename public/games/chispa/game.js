/* Chispa — game.it
 * Juego de cartas de colores: contra la compu (de 1 a 5 rivales) u online (2 a 6, con o sin compu).
 * La mesa (shared/table.js) es la misma en el navegador y en el servidor; esta parte dibuja lo que
 * ve cada jugador y anima las jugadas (repartir, jugar, robar).
 */
import { CARDS, fits, SKIP, REV, D2, WILD, W4 } from './shared/rules.js';
import { Table } from './shared/table.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const TXT = {
  tagline: { es: 'Colores, números y comodines: quedate sin cartas primero', en: 'Colors, numbers and wilds: be the first to run out of cards' },
  vsCpu: { es: 'CONTRA LA COMPU', en: 'VS CPU' },
  online: { es: 'ONLINE', en: 'ONLINE' },
  howTo: { es: 'Cómo se juega', en: 'How to play' },
  rivals: { es: 'Rivales', en: 'Opponents' },
  level: { es: 'Dificultad', en: 'Difficulty' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Normal', en: 'Normal' },
  lv3: { es: 'Difícil', en: 'Hard' },
  target: { es: 'Partida', en: 'Game' },
  oneRound: { es: '1 ronda', en: '1 round' },
  stack: { es: 'Acumular +2 y +4', en: 'Stack +2 and +4' },
  stackNote: { es: 'Con acumular, al que le tiran un +2 o +4 puede responder con otro y pasárselo al siguiente.', en: 'With stacking, whoever gets a +2 or +4 can answer with another and pass it on.' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  play: { es: 'JUGAR', en: 'PLAY' },
  back: { es: '← volver', en: '← back' },
  draw: { es: 'ROBAR', en: 'DRAW' },
  drawN: { es: 'ROBAR {n}', en: 'DRAW {n}' },
  pass: { es: 'PASAR', en: 'PASS' },
  call: { es: '¡ÚLTIMA!', en: 'LAST!' },
  catch: { es: '¡AGARRALO!', en: 'CATCH!' },
  yourTurn: { es: 'TU TURNO', en: 'YOUR TURN' },
  pick: { es: 'Elegí el color', en: 'Pick a color' },
  cancel: { es: 'cancelar', en: 'cancel' },
  colors: { es: ['rosa', 'cian', 'lima', 'ámbar'], en: ['pink', 'cyan', 'lime', 'amber'] },
  skipped: { es: '¡SALTEADO!', en: 'SKIPPED!' },
  reverse: { es: '¡REVERSA!', en: 'REVERSE!' },
  caught: { es: '¡{by} agarró a {p}! +2', en: '{by} caught {p}! +2' },
  caughtMe: { es: '¡Te agarraron! +2', en: 'You got caught! +2' },
  pass2: { es: 'paso', en: 'pass' },
  roundWin: { es: '¡{n} gana la ronda!', en: '{n} wins the round!' },
  roundWinMe: { es: '¡Ganaste la ronda!', en: 'You won the round!' },
  plusPts: { es: '+{n} puntos (lo que quedó en las otras manos)', en: '+{n} points (what was left in the other hands)' },
  nextIn: { es: 'Siguiente ronda en {n}…', en: 'Next round in {n}…' },
  nextRound: { es: 'SIGUIENTE RONDA', en: 'NEXT ROUND' },
  gameWin: { es: '¡{n} gana la partida!', en: '{n} wins the game!' },
  gameWinMe: { es: '¡GANASTE LA PARTIDA!', en: 'YOU WON THE GAME!' },
  again: { es: 'JUGAR OTRA', en: 'PLAY AGAIN' },
  menu: { es: 'menú', en: 'menu' },
  paused: { es: 'PAUSA', en: 'PAUSED' },
  resume: { es: 'SEGUIR', en: 'RESUME' },
  quit: { es: 'salir al menú', en: 'quit to menu' },
  you: { es: 'Vos', en: 'You' },
  host: { es: 'anfitrión', en: 'host' },
  create: { es: 'CREAR SALA', en: 'CREATE ROOM' },
  join: { es: 'UNIRSE', en: 'JOIN' },
  shareCode: { es: 'Compartí este código', en: 'Share this code' },
  copyLink: { es: 'COPIAR LINK', en: 'COPY LINK' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  addBots: { es: 'Sumar compu', en: 'Add CPU players' },
  start: { es: 'EMPEZAR', en: 'START' },
  waitingHost: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  needPlayers: { es: 'Hacen falta al menos 2 jugadores (sumá compu o invitá a alguien)', en: 'You need at least 2 players (add CPU or invite someone)' },
  lobbyInfo: { es: '{n} jugadores · {t}', en: '{n} players · {t}' },
  toPts: { es: 'a {n} puntos', en: 'to {n} points' },
  reward: { es: '▶ EMPEZAR CON UN +4 EXTRA', en: '▶ START WITH AN EXTRA +4' },
  waitAgain: { es: 'El anfitrión puede empezar otra', en: 'The host can start another one' },
  away: { es: 'desconectado', en: 'away' },
  cpu: { es: 'compu', en: 'CPU' },
  rules: {
    es: [
      'Jugá una carta del <b>mismo color</b>, del <b>mismo número</b> o del <b>mismo símbolo</b> que la de arriba de la pila.',
      '{sk} <b>Salto</b>: el siguiente pierde el turno. {rv} <b>Reversa</b>: cambia el sentido (de a dos, es un salto).',
      '{d2} <b>+2</b> y {w4} <b>+4</b>: el siguiente roba y pierde el turno. Con "acumular", puede responder con otro +2/+4 y pasar la suma.',
      '{wd} <b>Comodín</b>: va sobre cualquier carta y elegís el color. El +4 también.',
      'Si no podés jugar, <b>robás una</b>: si sirve, la podés jugar en el momento.',
      'Cuando te queda una carta tocá <b>¡ÚLTIMA!</b> (podés avisar antes de jugar la anteúltima). Si no avisás y te agarran antes de que juegue el siguiente, <b>robás 2</b>.',
      'El que se queda sin cartas gana la ronda y suma lo que quedó en las otras manos: números por su valor, acciones 20 y comodines 50.',
    ],
    en: [
      'Play a card of the <b>same color</b>, <b>same number</b> or <b>same symbol</b> as the top of the pile.',
      '{sk} <b>Skip</b>: the next player loses their turn. {rv} <b>Reverse</b>: switches direction (with two players it works as a skip).',
      '{d2} <b>+2</b> and {w4} <b>+4</b>: the next player draws and loses their turn. With "stacking", they can answer with another +2/+4 and pass the total on.',
      '{wd} <b>Wild</b>: goes on any card and you choose the color. So does the +4.',
      "If you can't play, <b>draw one</b>: if it fits, you can play it right away.",
      "When you're down to one card tap <b>LAST!</b> (you can call it before playing your second-to-last). If you don't and someone catches you before the next player moves, <b>you draw 2</b>.",
      'Whoever runs out of cards wins the round and scores what is left in the other hands: numbers at face value, actions 20 and wilds 50.',
    ],
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v && typeof s === 'string') for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const KCOL = ['#ff3fb4', '#22d3ff', '#a3ff3c', '#ffb627'];
const BOT_NAMES = ['Luna', 'Toto', 'Mora', 'Pipo', 'Kiara', 'Bruno', 'Nina', 'Tomi', 'Vera', 'Iván'];
const BOT_COLORS = ['#ff3fb4', '#a3ff3c', '#ffb627', '#b388ff', '#ff7a45'];

// ================================================================ dibujo de cartas
const SHAPES = ['<circle cx="5" cy="5" r="4.2"/>', '<path d="M5 .6 9.6 9.2H.4z"/>', '<rect x="1" y="1" width="8" height="8" rx="1"/>', '<path d="M5 0 10 5 5 10 0 5z"/>'];
const shape = (c) => (c < 4 ? `<svg class="sh" viewBox="0 0 10 10">${SHAPES[c]}</svg>` : '');
const ICON = {
  skip: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="4.5"><circle cx="20" cy="20" r="15"/><path d="M9.5 30.5 30.5 9.5"/></svg>',
  rev: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 15h22l-6-6M32 25H10l6 6"/></svg>',
  wild: '<svg viewBox="0 0 40 40"><path d="M20 20V3a17 17 0 0 1 17 17z" fill="#22d3ff"/><path d="M20 20h17a17 17 0 0 1-17 17z" fill="#a3ff3c"/><path d="M20 20v17A17 17 0 0 1 3 20z" fill="#ffb627"/><path d="M20 20H3A17 17 0 0 1 20 3z" fill="#ff3fb4"/><circle cx="20" cy="20" r="6" fill="#150b2b"/></svg>',
};
function faceHTML(id) {
  const k = CARDS[id];
  let big;
  let small;
  let sm = false;
  if (k.v <= 9) big = small = k.v === 6 || k.v === 9 ? `<span class="u">${k.v}</span>` : `${k.v}`;
  else if (k.v === SKIP) (big = ICON.skip), (small = '⦸');
  else if (k.v === REV) (big = ICON.rev), (small = '⇄');
  else if (k.v === D2) (big = '+2'), (small = '+2');
  else if (k.v === WILD) (big = ICON.wild), (small = '★');
  else (big = `<div style="display:grid;justify-items:center;gap:4px">${'+4'}<svg viewBox="0 0 40 40" style="width:70%">${ICON.wild.slice(ICON.wild.indexOf('>') + 1, -6)}</svg></div>`), (small = '+4'), (sm = true);
  return `<i class="ix">${small}${shape(k.c)}</i><span class="mid${sm ? ' sm' : ''}">${big}</span><i class="ix br">${small}${shape(k.c)}</i>`;
}
function cardEl(id) {
  const el = document.createElement('div');
  if (id === null || id === undefined) {
    el.className = 'card back';
    return el;
  }
  el.className = `card c${CARDS[id].c}`;
  el.dataset.id = id;
  el.innerHTML = faceHTML(id);
  return el;
}
const pileRot = (id, n) => (((id * 7919 + n * 104729) % 41) - 20) * 0.9;

// ================================================================ temporizadores pausables (modo compu)
class Timers {
  constructor() {
    this.m = new Map();
    this.paused = false;
  }
  set(name, ms, fn) {
    this.clear(name);
    const tm = { fn, due: performance.now() + ms, left: ms, h: 0 };
    this.m.set(name, tm);
    if (!this.paused) this.arm(name, tm);
  }
  arm(name, tm) {
    tm.due = performance.now() + tm.left;
    tm.h = setTimeout(() => {
      if (this.m.get(name) === tm) this.m.delete(name);
      tm.fn();
    }, tm.left);
  }
  clear(name) {
    const tm = this.m.get(name);
    if (tm) clearTimeout(tm.h);
    this.m.delete(name);
  }
  clearAll() {
    for (const k of [...this.m.keys()]) this.clear(k);
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    const now = performance.now();
    for (const tm of this.m.values()) {
      clearTimeout(tm.h);
      tm.left = Math.max(0, tm.due - now);
    }
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const [name, tm] of this.m) this.arm(name, tm);
  }
}

// ================================================================ estado del cliente
const S = {
  mode: null, // 'cpu' | 'online'
  opts: { rivals: 3, level: 2, target: 200, stack: 1 },
  v: null,
  pile: [],
  flying: 0,
  seatEls: [],
  handEls: new Map(),
  sel: -1,
  pickFor: null,
  endSeq: -1,
  overShown: -1,
  menuOpen: false,
  bonus: false,
  deadline: 0,
};
let table = null;
const timers = new Timers();
let online = null;

function send(msg) {
  if (S.mode === 'cpu') return table?.act(0, msg);
  if (S.mode === 'online') online?.send(msg);
}

// ================================================================ partida contra la compu
function startLocal() {
  const o = S.opts;
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const seats = [{ id: 'me', name: t('you'), color: '#22d3ff', bot: 0 }];
  for (let i = 0; i < o.rivals; i++) seats.push({ id: `b${i}`, name: names[i], color: BOT_COLORS[i], bot: o.level });
  timers.clearAll();
  timers.resume();
  const io = {
    emit: (i, v) => i === 0 && onView(v),
    timer: (k, ms, fn) => timers.set(k, ms, fn),
    clear: (k) => timers.clear(k),
    over: () => {},
  };
  table = new Table({ seats, opts: { target: o.target, stack: !!o.stack, turnMs: 0 }, io, rng: Math.random });
  S.mode = 'cpu';
  resetTable();
  show(null);
  let bonus = null;
  if (S.bonus) {
    // un +4 extra de premio (se busca uno que siga en el mazo al repartir)
    bonus = { seat: 0, id: CARDS.findIndex((k) => k.v === W4) };
    S.bonus = false;
  }
  table.start(bonus);
}

function resetTable() {
  S.v = null;
  S.pile = [];
  S.flying = 0;
  S.sel = -1;
  S.endSeq = -1;
  S.overShown = -1;
  S.dealtSeq = -1;
  S.seatEls = [];
  $('seats').innerHTML = '';
  $('hand').innerHTML = '';
  $('pile').innerHTML = '';
  $('fx').innerHTML = '';
  S.handEls.clear();
  $('picker').hidden = true;
}

// ================================================================ vista
function onView(v) {
  const prev = S.v;
  S.v = v;
  S.deadline = v.left ? performance.now() + v.left : 0;
  if (prev && prev.gid !== v.gid) {
    // empezó otra partida en la misma mesa
    S.endSeq = S.overShown = S.dealtSeq = -1;
    S.pile = [];
    for (const el of S.handEls.values()) el.remove();
    S.handEls.clear();
  }
  const fresh = !prev || prev.seq !== v.seq || prev.gid !== v.gid;
  if (!prev || prev.seats.length !== v.seats.length || prev.me !== v.me || prev.gid !== v.gid) buildSeats(v);
  if (fresh && v.ev) animate(prev, v, v.ev);
  render(v);
  // fin de ronda / partida
  if ((v.phase === 'end' || v.phase === 'over') && S.endSeq !== v.seq) {
    S.endSeq = v.seq;
    const seq = v.seq;
    setTimeout(() => {
      if (S.v?.seq !== seq) return;
      if (S.v.phase === 'over') showOver(S.v);
      else showRound(S.v);
    }, 1300);
  }
  if (v.phase === 'play' && ($('s-round').classList.contains('on') || $('s-over').classList.contains('on'))) show(null);
  syncGameplay();
}

function syncGameplay() {
  G.gameplay(!!S.mode && S.v?.phase === 'play' && !$$('.screen.on').length);
}

/** Posición de los rivales alrededor de la mesa (en orden de juego desde mí). */
function seatPos(j, m) {
  const W = innerWidth;
  const H = innerHeight;
  if (W < 640 && H > W) {
    // celular vertical: fila arriba (dos filas si son muchos)
    const perRow = m <= 3 ? m : Math.ceil(m / 2);
    const row = Math.floor(j / perRow);
    const inRow = row === 0 ? Math.min(perRow, m) : m - perRow;
    const k = j - row * perRow;
    return [((k + 0.5) / inRow) * 100, ((112 + row * 98) / H) * 100];
  }
  const a = Math.PI + ((j + 1) / (m + 1)) * Math.PI;
  // el punto es el centro del avatar; el de arriba queda debajo de la barra del portal
  const top = (H < 500 ? 58 : 66) / H;
  const cy = H < 500 ? 0.4 : 0.44;
  const ry = cy - top;
  return [50 + (W < 640 ? 40 : 42) * Math.cos(a), (cy + ry * Math.sin(a)) * 100];
}

function buildSeats(v) {
  const box = $('seats');
  box.innerHTML = '';
  S.seatEls = [];
  const n = v.seats.length;
  for (let j = 0; j < n - 1; j++) {
    const k = (v.me + 1 + j) % n;
    const el = document.createElement('div');
    el.className = 'seat';
    el.dataset.k = k;
    el.innerHTML = `<span class="bub"></span><div class="av"><i class="tm" hidden></i><span class="ini"></span></div><div class="nm"></div><div class="fan"></div><b class="cnt"></b><span class="tag" hidden></span><button class="catch" hidden></button>`;
    el.querySelector('.catch').onclick = () => {
      send({ t: 'catch', p: k });
      sfx('ui');
    };
    box.append(el);
    S.seatEls[k] = el;
  }
  placeSeats(v);
}
function placeSeats(v) {
  const n = v.seats.length;
  for (let j = 0; j < n - 1; j++) {
    const k = (v.me + 1 + j) % n;
    const el = S.seatEls[k];
    if (!el) continue;
    const [x, y] = seatPos(j, n - 1);
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
  }
}

function render(v) {
  const n = v.seats.length;
  const myTurn = v.phase === 'play' && v.turn === v.me;
  // rivales
  v.seats.forEach((st, k) => {
    const el = S.seatEls[k];
    if (!el) return;
    el.classList.toggle('turn', v.phase === 'play' && v.turn === k);
    el.classList.toggle('away', !!st.away);
    el.classList.toggle('one', st.n === 1);
    const av = el.querySelector('.av');
    av.style.setProperty('--pc', st.color);
    av.classList.toggle('bot', !!st.bot);
    av.querySelector('.ini').textContent = (st.name || '?').trim().charAt(0).toUpperCase();
    el.querySelector('.nm').innerHTML = `${esc(st.name)}<small>${st.score}</small>`;
    const fan = el.querySelector('.fan');
    const shown = Math.min(st.n, 12);
    if (fan.childElementCount !== shown) {
      fan.innerHTML = '';
      for (let i = 0; i < shown; i++) {
        const c = document.createElement('i');
        const tt = shown > 1 ? i / (shown - 1) - 0.5 : 0;
        c.style.transform = `translateX(-50%) translateX(${tt * Math.min(60, shown * 7)}px) rotate(${tt * Math.min(50, shown * 6)}deg)`;
        fan.append(c);
      }
    }
    el.querySelector('.cnt').textContent = st.n;
    const tag = el.querySelector('.tag');
    tag.hidden = !(st.called && st.n <= 2);
    tag.textContent = t('call');
    const cb = el.querySelector('.catch');
    cb.hidden = !(v.phase === 'play' && v.last === k);
    cb.textContent = t('catch');
    el.querySelector('.tm').hidden = !(v.phase === 'play' && v.turn === k && S.deadline);
    el.title = st.away ? t('away') : st.bot ? t('cpu') : '';
  });
  // centro
  const cur = KCOL[v.color] || '#fff';
  $('table').style.setProperty('--cur', cur);
  $('glow').style.setProperty('--cur', cur);
  $('cname').textContent = G.t(TXT.colors)[v.color] || '';
  $('dir').classList.toggle('ccw', v.dir < 0);
  $('deck-n').textContent = v.deck;
  const pend = $('pending');
  pend.hidden = !(v.pending > 0 && v.phase === 'play');
  pend.textContent = `+${v.pending}`;
  if (!S.flying) syncPile(v.top);
  // mi mano y botones
  renderHand(v);
  const me = v.seats[v.me];
  $('me-name').textContent = `${me.name} · ${me.score}`;
  $('me-turn').textContent = t('yourTurn');
  $('me-turn').classList.toggle('on', myTurn);
  const canPlayAny = myTurn && v.hand.some((id) => canPlayMine(v, id));
  const bd = $('b-draw');
  bd.disabled = !myTurn || v.drew >= 0;
  bd.textContent = v.pending > 0 && myTurn ? t('drawN', { n: v.pending }) : t('draw');
  bd.classList.toggle('hot', myTurn && v.drew < 0 && !canPlayAny);
  $('deck').classList.toggle('hot', myTurn && v.drew < 0 && !canPlayAny);
  $('b-pass').hidden = !(myTurn && v.drew >= 0);
  const bc = $('b-call');
  const h = v.hand.length;
  const callable = v.phase === 'play' && !me.called && (h === 1 || (h === 2 && myTurn));
  bc.disabled = !callable;
  bc.classList.toggle('hot', callable && (v.last === v.me || (h === 2 && canPlayAny)));
  $('b-call').textContent = me.called && h <= 2 && v.phase === 'play' ? `✓ ${t('call')}` : t('call');
  void n;
}

function canPlayMine(v, id) {
  if (v.phase !== 'play' || v.turn !== v.me) return false;
  if (v.drew >= 0 && id !== v.drew) return false;
  return fits({ discard: [v.top], color: v.color, pending: v.pending, opts: { stack: v.stack } }, id);
}

function syncPile(topId) {
  if (topId === undefined || topId === null) return;
  if (S.pile[S.pile.length - 1] === topId) return;
  S.pile.push(topId);
  if (S.pile.length > 6) S.pile.shift();
  drawPile();
}
function drawPile() {
  const box = $('pile');
  box.innerHTML = '';
  S.pile.forEach((id, i) => {
    const el = cardEl(id);
    const r = pileRot(id, i);
    el.style.transform = `rotate(${r}deg) translate(${(r % 5) * 0.8}px, ${(r % 3) * 0.8}px)`;
    if (i < S.pile.length - 3) el.style.opacity = '0.6';
    box.append(el);
  });
}

// ---------------------------------------------------------------- mi mano
function handLayout(n, W0, cw, ch) {
  const pad = 10;
  const W = W0 - pad * 2;
  let rows = 1;
  let per = n;
  let gap = n > 1 ? Math.min(cw * 0.78, (W - cw) / (n - 1)) : 0;
  if (gap < cw * 0.34 && n > 8) {
    rows = 2;
    per = Math.ceil(n / 2);
    gap = Math.min(cw * 0.78, (W - cw) / Math.max(1, per - 1));
  }
  const pos = [];
  for (let i = 0; i < n; i++) {
    const row = rows === 2 && i >= per ? 1 : 0;
    const inRow = rows === 2 ? (row ? n - per : per) : n;
    const k = row ? i - per : i;
    const total = cw + gap * (inRow - 1);
    const x = pad + (W - total) / 2 + k * gap;
    const half = (inRow - 1) / 2;
    const tt = inRow > 1 ? k - half : 0;
    const r = tt * Math.min(3, 30 / inRow);
    // abanico: el centro un poco más arriba que las puntas
    const y = -(half * half - tt * tt) * Math.min(1, 14 / Math.max(1, inRow)) * 0.5 - (rows === 2 && !row ? ch * 0.45 : 0);
    pos.push({ x, y, r });
  }
  return { pos, rows };
}

function renderHand(v) {
  const box = $('hand');
  const ids = v.hand;
  const W = box.clientWidth;
  const cs = getComputedStyle(document.documentElement);
  const cw = parseFloat(cs.getPropertyValue('--cw')) || box.querySelector('.card')?.offsetWidth || 70;
  const probe = S.handEls.values().next().value;
  const cwReal = probe ? probe.offsetWidth : cw;
  const chReal = probe ? probe.offsetHeight : cwReal * 1.46;
  const { pos, rows } = handLayout(ids.length, W, cwReal, chReal);
  box.classList.toggle('two', rows === 2);
  const keep = new Set(ids);
  for (const [id, el] of S.handEls)
    if (!keep.has(id)) {
      el.remove();
      S.handEls.delete(id);
    }
  // de dónde salen las cartas nuevas: del mazo
  const hb = box.getBoundingClientRect();
  const db = $('deck').getBoundingClientRect();
  const fromX = db.left - hb.left;
  const fromY = db.bottom - hb.bottom + 6;
  const dealing = v.ev?.k === 'deal' && S.v === v && S.dealtSeq !== v.seq;
  let newIdx = 0;
  ids.forEach((id, i) => {
    let el = S.handEls.get(id);
    const p = pos[i];
    if (!el) {
      el = cardEl(id);
      el.classList.add('new');
      el.style.setProperty('--x', `${fromX}px`);
      el.style.setProperty('--y', `${fromY}px`);
      el.style.setProperty('--r', '0deg');
      el.style.opacity = '0';
      el.onclick = () => clickCard(id);
      box.append(el);
      S.handEls.set(id, el);
      const delay = dealing ? 120 + i * 90 : 60 + newIdx * 110;
      newIdx++;
      el.style.transitionDelay = `${delay}ms`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.setProperty('--x', `${p.x}px`);
          el.style.setProperty('--y', `${p.y}px`);
          el.style.setProperty('--r', `${p.r}deg`);
          setTimeout(() => {
            el.style.transitionDelay = '';
            el.classList.remove('new');
          }, delay + 600);
        }),
      );
      if (!dealing) setTimeout(() => sfx('draw'), delay);
    } else {
      el.style.setProperty('--x', `${p.x}px`);
      el.style.setProperty('--y', `${p.y}px`);
      el.style.setProperty('--r', `${p.r}deg`);
    }
    el.style.zIndex = String(i + (rows === 2 && i >= Math.ceil(ids.length / 2) ? 100 : 0));
    const ok = canPlayMine(v, id);
    el.classList.toggle('ok', ok);
    el.classList.toggle('dim', v.phase === 'play' && v.turn === v.me && !ok);
    el.classList.toggle('sel', S.sel >= 0 && ids[S.sel] === id);
  });
  if (dealing) S.dealtSeq = v.seq;
}

function clickCard(id) {
  const v = S.v;
  if (!v || !canPlayMine(v, id)) {
    if (v && v.phase === 'play' && v.turn === v.me) {
      const el = S.handEls.get(id);
      el?.animate([{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '5px 0' }, { translate: '0 0' }], { duration: 220 });
      sfx('no');
    }
    return;
  }
  unlock();
  if (CARDS[id].c === 4) {
    S.pickFor = id;
    $('picker').hidden = false;
    return;
  }
  send({ t: 'play', id });
}
for (const b of $$('.quad button')) {
  const c = Number(b.dataset.c);
  b.innerHTML = `<svg viewBox="0 0 10 10">${SHAPES[c]}</svg>`;
  b.onclick = () => {
    $('picker').hidden = true;
    if (S.pickFor !== null) send({ t: 'play', id: S.pickFor, color: c });
    S.pickFor = null;
  };
}
$('pk-cancel').onclick = () => {
  $('picker').hidden = true;
  S.pickFor = null;
};
$('b-draw').onclick = () => doDraw();
$('deck').onclick = () => doDraw();
function doDraw() {
  const v = S.v;
  if (!v || v.phase !== 'play' || v.turn !== v.me || v.drew >= 0) return;
  unlock();
  send({ t: 'draw' });
}
$('b-pass').onclick = () => send({ t: 'pass' });
$('b-call').onclick = () => {
  unlock();
  send({ t: 'call' });
};

// ================================================================ animaciones
function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}
function cardSize() {
  const probe = document.querySelector('#pile .card') || document.querySelector('.deck .card');
  return probe ? { w: probe.offsetWidth, h: probe.offsetHeight } : { w: 70, h: 102 };
}
/** Una carta que vuela de un punto a otro (capa de efectos). */
function fly(id, from, to, { delay = 0, r0 = 0, r1 = 0, s0 = 1, s1 = 1, face = false, done } = {}) {
  const fx = $('fx');
  const el = cardEl(id);
  const { w, h } = cardSize();
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  const tf = (p, r, s) => `translate(${p.x - w / 2}px, ${p.y - h / 2}px) rotate(${r}deg) scale(${s})`;
  el.style.transform = tf(from, r0, s0);
  el.style.opacity = '0';
  if (face) el.classList.add('flip');
  fx.append(el);
  setTimeout(() => {
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.transform = tf(to, r1, s1);
    });
    setTimeout(() => {
      el.remove();
      done?.();
    }, 440);
  }, delay);
}

function bubble(k, text, cls = '') {
  const el = S.seatEls[k]?.querySelector('.bub');
  if (!el) return;
  el.textContent = text;
  el.className = `bub ${cls}`;
  void el.offsetWidth;
  el.classList.add('show');
}
function toast(text, color = '#fff') {
  const el = $('toast');
  el.textContent = text;
  el.style.color = color;
  el.className = 'toast';
  void el.offsetWidth;
  el.classList.add('show');
}
const nameOf = (v, k) => (k === v.me ? t('you') : v.seats[k]?.name || '?');
function seatRect(k) {
  const v = S.v;
  if (k === v.me) {
    const hb = $('hand').getBoundingClientRect();
    return { x: hb.left + hb.width / 2, y: hb.top + hb.height * 0.6, w: 60, h: 80 };
  }
  const av = S.seatEls[k]?.querySelector('.av');
  return av ? rectOf(av) : { x: innerWidth / 2, y: 40, w: 40, h: 40 };
}

function animate(prev, v, ev) {
  const pileR = rectOf($('pile'));
  const deckR = rectOf($('deck'));
  const me = v.me;
  if (ev.k === 'deal') {
    S.pile = [];
    drawPile();
    S.flying++;
    sfx('shuffle');
    const n = v.seats.length;
    let i = 0;
    for (let r = 0; r < 7; r++)
      for (let j = 0; j < n; j++) {
        const k = (v.dealer + 1 + j) % n;
        if (k === me) continue;
        const to = seatRect(k);
        fly(null, deckR, to, { delay: 80 + (r * n + j) * 38, s1: 0.45 });
        i++;
      }
    setTimeout(() => {
      S.flying--;
      syncPile(S.v.top);
      sfx('card');
    }, 80 + 7 * n * 38 + 300);
    return;
  }
  if (ev.k === 'play') {
    const id = ev.id;
    const r1 = pileRot(id, S.pile.length);
    S.flying++;
    const land = () => {
      S.flying--;
      syncPile(id);
      if (!S.flying) syncPile(S.v.top);
      sfx(CARDS[id].v >= 10 ? 'action' : 'card');
    };
    if (ev.p === me) {
      const el = S.handEls.get(id);
      const from = el ? rectOf(el) : seatRect(me);
      el?.remove();
      S.handEls.delete(id);
      fly(id, from, pileR, { r0: 0, r1, done: land });
    } else fly(id, seatRect(ev.p), pileR, { r0: -30, r1, s0: 0.5, face: true, done: land });
    const k = CARDS[id];
    setTimeout(() => {
      if (k.c === 4) toast(`${G.t(TXT.colors)[ev.color].toUpperCase()}`, KCOL[ev.color]);
      if (ev.skip !== undefined && !ev.draw) {
        if (ev.skip === me) toast(t('skipped'), '#ff3b5c');
        else bubble(ev.skip, '⦸', 'bad');
      }
      if (ev.rev) {
        toast(t('reverse'), KCOL[k.c] || '#fff');
        sfx('rev');
      }
      if (ev.pending) toast(`+${ev.pending}`, '#ff3b5c');
      if (ev.draw) {
        const who = ev.draw.p;
        if (who !== me) {
          for (let i = 0; i < ev.draw.n; i++) fly(null, deckR, seatRect(who), { delay: i * 90, s1: 0.45 });
          bubble(who, `+${ev.draw.n}`, 'bad');
        } else toast(`+${ev.draw.n}`, '#ff3b5c');
        sfx('plus');
      }
    }, 380);
    return;
  }
  if (ev.k === 'draw' || ev.k === 'caught') {
    if (ev.p !== me) {
      for (let i = 0; i < ev.n; i++) fly(null, deckR, seatRect(ev.p), { delay: i * 90, s1: 0.45 });
      bubble(ev.p, `+${ev.n}`, ev.forced || ev.k === 'caught' ? 'bad' : '');
      sfx('draw');
    }
    if (ev.k === 'caught') {
      if (ev.p === me) toast(t('caughtMe'), '#ff3b5c');
      else toast(t('caught', { by: nameOf(v, ev.by), p: nameOf(v, ev.p) }), '#ffb627');
      sfx('caught');
    }
    return;
  }
  if (ev.k === 'pass') {
    if (ev.p !== me) bubble(ev.p, t('pass2'));
    return;
  }
  if (ev.k === 'call') {
    if (ev.p !== me) bubble(ev.p, t('call'), 'call');
    else toast(t('call'), '#ffb627');
    sfx('call');
  }
  void prev;
}

// turno: aviso sonoro y anillo de tiempo
function tickLoop() {
  requestAnimationFrame(tickLoop);
  const v = S.v;
  if (!v) return;
  const mine = v.phase === 'play' && v.turn === v.me;
  if (mine && !S.wasMine) sfx('turn');
  S.wasMine = mine;
  if (S.deadline && v.phase === 'play') {
    const p = clamp((S.deadline - performance.now()) / (v.turnMs || 25000), 0, 1);
    const el = S.seatEls[v.turn]?.querySelector('.tm');
    if (el) el.style.setProperty('--p', p.toFixed(3));
    const mt = $('me-turn');
    if (v.turn === v.me) mt.textContent = `${t('yourTurn')} · ${Math.ceil((S.deadline - performance.now()) / 1000)}`;
  }
}
requestAnimationFrame(tickLoop);

// ================================================================ fin de ronda y de partida
function scoreRows(v, { withHands }) {
  const order = v.seats.map((s, k) => ({ ...s, k })).sort((a, b) => b.score - a.score);
  const R = v.result;
  const tgt = v.target || Math.max(1, ...order.map((o) => o.score));
  return order
    .map((s, i) => {
      const win = R && R.winner === s.k;
      const hand = withHands && R ? R.hands[s.k] : [];
      const mini = hand.length ? `<div class="mini">${hand.map((id) => cardEl(id).outerHTML).join('')}</div>` : '';
      const bar = v.target ? `<div class="bar"><i style="transform:scaleX(${clamp(s.score / tgt, 0, 1)})"></i></div>` : '';
      return `<li class="${win ? 'win' : ''} ${s.k === v.me ? 'me' : ''}"><span class="pos">${i + 1}</span><div><b class="nm2">${esc(s.k === v.me ? t('you') : s.name)}</b>${mini}${bar}</div><span class="pts">${s.score}${win && R.pts ? `<small>+${R.pts}</small>` : ''}</span></li>`;
    })
    .join('');
}

let nextTimer = 0;
function showRound(v) {
  const R = v.result;
  $('rd-title').textContent = R.winner === v.me ? t('roundWinMe') : t('roundWin', { n: v.seats[R.winner].name });
  $('rd-sub').textContent = t('plusPts', { n: R.pts });
  $('rd-list').innerHTML = scoreRows(v, { withHands: true });
  $('rd-go').hidden = S.mode !== 'cpu';
  const end = performance.now() + (v.next || 0) - 1300;
  clearInterval(nextTimer);
  const upd = () => {
    const s = Math.max(0, Math.ceil((end - performance.now()) / 1000));
    $('rd-next').textContent = t('nextIn', { n: s });
  };
  upd();
  nextTimer = setInterval(upd, 250);
  sfx(R.winner === v.me ? 'win' : 'round');
  show('round');
}
$('rd-go').onclick = () => {
  clearInterval(nextTimer);
  if (S.mode === 'cpu' && table?.phase === 'end') table.nextRound();
};

function showOver(v) {
  if (S.overShown === v.seq) return;
  S.overShown = v.seq;
  const top = [...v.seats.keys()].sort((a, b) => v.seats[b].score - v.seats[a].score)[0];
  const w = v.result ? v.result.winner : top;
  const champ = v.target ? top : w;
  $('ov-title').textContent = champ === v.me ? t('gameWinMe') : t('gameWin', { n: v.seats[champ].name });
  $('ov-list').innerHTML = scoreRows(v, { withHands: !v.target });
  $('ov-status').textContent = '';
  const ag = $('ov-again');
  ag.textContent = t('again');
  ag.hidden = S.mode === 'online' && !online?.isHost;
  if (S.mode === 'online' && !online?.isHost) $('ov-status').textContent = t('waitAgain');
  $('ov-reward').hidden = true;
  if (S.mode === 'cpu')
    G.rewardAvailable('comodin').then((ok) => {
      if (ok && $('s-over').classList.contains('on')) {
        $('ov-reward').textContent = t('reward');
        $('ov-reward').hidden = false;
      }
    });
  sfx(champ === v.me ? 'win' : 'lose');
  show('over');
}
$('ov-again').onclick = async () => {
  sfx('ui');
  if (S.mode === 'online') return online?.send({ t: 'again' });
  await G.commercialBreak('revancha');
  startLocal();
};
$('ov-reward').onclick = async () => {
  $('ov-reward').hidden = true;
  if (await G.showReward()) {
    S.bonus = true;
    startLocal();
  }
};
$('ov-menu').onclick = () => toMenu();

// ================================================================ menús
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  syncGameplay();
  $('b-menu').hidden = !S.mode || (id && id !== 'round' && id !== 'over');
  if (S.mode === 'cpu') {
    if (id === 'menu' || id === 'rules') timers.pause();
    else if (!id || id === 'round' || id === 'over') timers.resume();
  }
}
function toMenu() {
  if (S.mode === 'online') online?.leave();
  timers.clearAll();
  table = null;
  S.mode = null;
  resetTable();
  show('home');
}
$('b-menu').onclick = () => {
  sfx('ui');
  show('menu');
};
$('m-resume').onclick = () => show(null);
$('m-rules').onclick = () => {
  S.rulesBack = 'menu';
  show('rules');
};
$('m-quit').onclick = () => toMenu();

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    unlock();
    sfx('ui');
    const k = go.dataset.go;
    if (k === 'cpu') {
      refreshSetup();
      return show('setup');
    }
    if (k === 'online') {
      $('on-name').value ||= defaultName();
      return show('online');
    }
    if (k === 'rules') {
      S.rulesBack = 'home';
      return show('rules');
    }
  }
  if (e.target.closest('[data-back]')) {
    sfx('ui');
    const back = $('s-rules').classList.contains('on') && S.rulesBack === 'menu' ? 'menu' : 'home';
    show(back);
  }
});
function refreshSetup() {
  for (const seg of $$('#s-setup .seg')) {
    const k = seg.dataset.o;
    $$('button', seg).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(S.opts[k])));
  }
}
for (const seg of $$('#s-setup .seg'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.opts[seg.dataset.o] = Number(b.dataset.v);
    try {
      localStorage.setItem('chispa.opts', JSON.stringify(S.opts));
    } catch {}
    sfx('ui');
    refreshSetup();
  };
try {
  Object.assign(S.opts, JSON.parse(localStorage.getItem('chispa.opts') || '{}'));
} catch {}
$('setup-go').onclick = () => {
  sfx('ui');
  startLocal();
};

function rulesHTML() {
  const ic = (id) => cardEl(id).outerHTML;
  const find = (c, v) => CARDS.findIndex((k) => k.c === c && k.v === v);
  const rep = { sk: ic(find(0, SKIP)), rv: ic(find(1, REV)), d2: ic(find(2, D2)), w4: ic(find(4, W4)), wd: ic(find(4, WILD)) };
  return G.t(TXT.rules)
    .map((line) => {
      const icons = [];
      const text = line.replace(/\{(\w+)\}/g, (_, k) => {
        icons.push(rep[k]);
        return '';
      });
      return `<div class="rc">${icons.join('')}<p>${text}</p></div>`;
    })
    .join('');
}
function fanLogo() {
  const box = $('fanlogo');
  box.innerHTML = '';
  const ids = [CARDS.findIndex((k) => k.c === 0 && k.v === 7), CARDS.findIndex((k) => k.c === 1 && k.v === REV), CARDS.findIndex((k) => k.v === W4), CARDS.findIndex((k) => k.c === 2 && k.v === D2), CARDS.findIndex((k) => k.c === 3 && k.v === 5)];
  ids.forEach((id, i) => {
    const el = cardEl(id);
    el.style.transform = `rotate(${(i - 2) * 14}deg)`;
    el.style.animationDelay = `${i * 70}ms`;
    box.append(el);
  });
}

// ================================================================ online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('chispa', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'g') {
        if (S.mode !== 'online') {
          S.mode = 'online';
          resetTable();
        }
        if ($('s-lobby').classList.contains('on') || $('s-online').classList.contains('on')) show(null);
        onView(m.s);
      } else if (m.t === 'error') {
        $('on-status').textContent = netText(m.code);
        $('lobby-status').textContent = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = null;
        resetTable();
        show('online');
      }
    },
  });
  return online;
}
$('on-create').onclick = () => {
  unlock();
  ensureOnline().create($('on-name').value.trim() || defaultName());
};
$('on-join').onclick = () => {
  unlock();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureOnline().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => online.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online.leave();
  S.mode = null;
  show('online');
};
$('lobby-share').onclick = async () => {
  const r = await share('chispa', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};
for (const seg of $$('#lobby-host .seg'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !online?.isHost) return;
    const st = { ...(online.room.settings || {}) };
    st[seg.dataset.l] = Number(b.dataset.v);
    online.send({ t: 'settings', settings: st });
    sfx('ui');
  };

function applyRoom(room) {
  if (room.state === 'lobby') {
    if (S.mode === 'online' && S.v) {
      resetTable();
    }
    S.mode = null;
    $('lobby-code').textContent = room.code;
    const st = room.settings || {};
    const bots = Math.max(0, Math.min(st.bots ?? 0, 6 - room.players.length));
    $('lobby-players').innerHTML =
      room.players.map((p) => `<li><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('you').toLowerCase() : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`).join('') +
      Array.from({ length: bots }, (_, i) => `<li><i style="background:${BOT_COLORS[i]}"></i><span>${BOT_NAMES[i]}</span><small>${t('cpu')}</small></li>`).join('');
    for (const seg of $$('#lobby-host .seg')) {
      const k = seg.dataset.l;
      $$('button', seg).forEach((b) => {
        b.classList.toggle('on', Number(b.dataset.v) === Number(st[k]));
        b.disabled = !online.isHost;
      });
    }
    $('lobby-info').textContent = t('lobbyInfo', { n: room.players.length + bots, t: st.target ? t('toPts', { n: st.target }) : t('oneRound') });
    $('lobby-start').hidden = !online.isHost;
    $('lobby-status').textContent = online.isHost ? (room.players.length + bots < 2 ? t('needPlayers') : '') : t('waitingHost');
    $('lobby-status').style.color = online.isHost ? '' : 'var(--muted)';
    show('lobby');
  }
}

// ================================================================ teclado
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const v = S.v;
  if (!v || $$('.screen.on').length) return;
  if (!$('picker').hidden) {
    const c = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
    if (c !== undefined) $$('.quad button')[c].click();
    if (e.code === 'Escape') $('pk-cancel').click();
    return;
  }
  const n = v.hand.length;
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    S.sel = S.sel < 0 ? 0 : clamp(S.sel + (e.code === 'ArrowRight' ? 1 : -1), 0, n - 1);
    renderHand(v);
    e.preventDefault();
  } else if ((e.code === 'Enter' || e.code === 'ArrowUp') && S.sel >= 0 && S.sel < n) {
    clickCard(v.hand[S.sel]);
    e.preventDefault();
  } else if (e.code === 'KeyD') doDraw();
  else if (e.code === 'KeyP' && !$('b-pass').hidden) send({ t: 'pass' });
  else if (e.code === 'KeyU' || e.code === 'Space') {
    if (!$('b-call').disabled) send({ t: 'call' });
    e.preventDefault();
  } else if (e.code === 'Escape') show('menu');
});

// ================================================================ sonido
function sfx(k) {
  if (k === 'card') noise(0.09, { freq: 2600, q: 0.8, vol: 0.22, sweep: 900 });
  else if (k === 'action') {
    noise(0.09, { freq: 2600, q: 0.8, vol: 0.22, sweep: 900 });
    tone(520, 880, 0.12, { type: 'triangle', vol: 0.1, at: 0.04 });
  } else if (k === 'draw') noise(0.07, { freq: 1600, q: 1.2, vol: 0.14, sweep: 3000 });
  else if (k === 'shuffle') for (let i = 0; i < 8; i++) noise(0.05, { freq: 2200 + i * 150, q: 1, vol: 0.1, at: i * 0.05 });
  else if (k === 'turn') notes([660, 990], { step: 0.07, dur: 0.12, vol: 0.09 });
  else if (k === 'call') notes([784, 1047, 1319], { step: 0.06, dur: 0.14, type: 'square', vol: 0.07 });
  else if (k === 'caught') tone(220, 110, 0.35, { type: 'sawtooth', vol: 0.1 });
  else if (k === 'plus') tone(300, 160, 0.22, { type: 'square', vol: 0.08 });
  else if (k === 'rev') tone(400, 800, 0.18, { type: 'triangle', vol: 0.1 });
  else if (k === 'no') tone(180, 140, 0.08, { type: 'square', vol: 0.05 });
  else if (k === 'win') notes([523, 659, 784, 1047, 1319], { step: 0.09, dur: 0.22, type: 'square', vol: 0.07 });
  else if (k === 'round') notes([523, 659, 784], { step: 0.1, dur: 0.18, vol: 0.08 });
  else if (k === 'lose') notes([392, 330, 262], { step: 0.14, dur: 0.26, type: 'sawtooth', vol: 0.05 });
  else if (k === 'ui') tone(900, 620, 0.05, { type: 'square', vol: 0.04 });
}

// ================================================================ arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('rules-body').innerHTML = rulesHTML();
  fanLogo();
  if (S.v) render(S.v);
  if (online?.room && $('s-lobby').classList.contains('on')) applyRoom(online.room);
}
G.onPrefs(applyPrefs, true);
G.onPause(() => timers.pause());
G.onResume(() => {
  if (!$('s-menu').classList.contains('on') && !$('s-rules').classList.contains('on')) timers.resume();
});
addEventListener('resize', () => {
  if (!S.v) return;
  placeSeats(S.v);
  renderHand(S.v);
});
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
else show('home');
G.gameplay(false);
G.ready();
if (/[?&]debug\b/.test(location.search)) window.__chispa = { S, get table() { return table; }, send };
