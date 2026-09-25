/* Tateti — game.it
 * Cuaderno (claro) o pizarrón (oscuro). Cada trazo se dibuja a mano, con temblor aleatorio.
 * Modos: contra la CPU (fácil / imbatible), 2 jugadores en el mismo dispositivo y online.
 */
import { tictactoe as R } from '/shared/boardrules.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';

const TXT = {
  tagline: { es: 'el clásico de los márgenes del cuaderno', en: 'the notebook-margin classic' },
  vsCpu: { es: 'Contra la compu', en: 'Versus CPU' },
  vsCpuSub: { es: 'fácil o imbatible', en: 'easy or unbeatable' },
  local: { es: 'Dos jugadores', en: 'Two players' },
  localSub: { es: 'en el mismo dispositivo', en: 'on the same device' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'creá una sala y pasá el código', en: 'create a room and share the code' },
  easy: { es: 'fácil', en: 'easy' },
  hard: { es: 'imbatible', en: 'unbeatable' },
  play: { es: '¡a jugar!', en: "let's play!" },
  back: { es: '← volver', en: '← back' },
  create: { es: 'crear sala', en: 'create room' },
  orJoin: { es: 'o unite con un código', en: 'or join with a code' },
  join: { es: 'unirse', en: 'join' },
  shareCode: { es: 'pasale este código a tu rival', en: 'send this code to your opponent' },
  copyLink: { es: 'copiar link', en: 'copy link' },
  copied: { es: '¡link copiado!', en: 'link copied!' },
  start: { es: 'empezar', en: 'start' },
  waiting: { es: 'esperando rival…', en: 'waiting for opponent…' },
  waitingHost: { es: 'esperando que el anfitrión empiece…', en: 'waiting for the host…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  quit: { es: 'terminar', en: 'quit' },
  you: { es: 'vos', en: 'you' },
  cpu: { es: 'compu', en: 'cpu' },
  draws: { es: 'empates', en: 'draws' },
  yourTurn: { es: 'te toca', en: 'your turn' },
  theirTurn: { es: 'le toca a {n}', en: "{n}'s turn" },
  thinking: { es: 'la compu piensa…', en: 'cpu is thinking…' },
  youWin: { es: '¡ganaste!', en: 'you win!' },
  youLose: { es: 'perdiste…', en: 'you lose…' },
  wins: { es: '¡ganó {n}!', en: '{n} wins!' },
  draw: { es: 'empate', en: 'draw' },
  host: { es: 'anfitrión', en: 'host' },
  timeout: { es: 'se le acabó el tiempo', en: 'ran out of time' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};

// ================= estado =================
const S = {
  mode: null, // cpu | local | online
  level: 'easy',
  board: R.empty(),
  turn: 0, // 0 = X, 1 = O
  starter: 0,
  names: ['X', 'O'],
  score: [0, 0, 0], // X, O, empates
  result: null,
  busy: false,
  me: 0, // online / cpu: qué marca soy
  drawn: new Set(),
  deadlineAt: 0,
};
let online = null;

// ================= pantallas =================
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(id === 'game'); // en menús el portal puede mostrar un banner aparte
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  audio();
  scribble(0.05);
  const to = go.dataset.go;
  if (to === 'local') startLocal();
  else show(to);
  if (to === 'online') $('on-name').value ||= defaultName();
});
$('cpu-level').onclick = (e) => {
  const b = e.target.closest('.pill');
  if (!b) return;
  S.level = b.dataset.v;
  $$('#cpu-level .pill').forEach((p) => p.classList.toggle('on', p === b));
};
$('cpu-start').onclick = () => {
  S.mode = 'cpu';
  S.names = [t('you'), t('cpu')];
  S.me = 0;
  newMatch();
};
$('quit').onclick = () => {
  if (S.mode === 'online') online.leave();
  S.mode = null;
  show('home');
};

function startLocal() {
  S.mode = 'local';
  S.names = ['X', 'O'];
  newMatch();
}

function newMatch() {
  S.score = [0, 0, 0];
  S.starter = 0;
  show('game');
  newRound(true);
}

// ================= dibujo a mano =================
const board = $('board');
const jit = (a) => (Math.random() - 0.5) * a;

function wobblyLine(x1, y1, x2, y2, amp = 5) {
  const mx = (x1 + x2) / 2 + jit(amp);
  const my = (y1 + y2) / 2 + jit(amp);
  return `M${x1 + jit(3)} ${y1 + jit(3)} Q${mx} ${my} ${x2 + jit(3)} ${y2 + jit(3)}`;
}
function wobblyCircle(cx, cy, r) {
  const start = Math.random() * Math.PI * 2;
  const pts = [];
  const turns = 1.12;
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * Math.PI * 2 * turns;
    const rr = r * (1 + jit(0.12)) * (i > n * 0.85 ? 1.05 : 1);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  return d;
}

function stroke(d, cls, delay = 0, dur = 0.35) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('class', `stroke ${cls}`);
  board.appendChild(p);
  const len = p.getTotalLength();
  p.style.strokeDasharray = len;
  p.style.strokeDashoffset = len;
  p.style.setProperty('--delay', `${delay}s`);
  p.style.setProperty('--dur', `${dur}s`);
  p.classList.add('draw');
  return p;
}

function drawGrid() {
  board.innerHTML = '';
  S.drawn.clear();
  stroke(wobblyLine(100, 4, 100, 296), 'g', 0, 0.3);
  stroke(wobblyLine(200, 4, 200, 296), 'g', 0.12, 0.3);
  stroke(wobblyLine(4, 100, 296, 100), 'g', 0.24, 0.3);
  stroke(wobblyLine(4, 200, 296, 200), 'g', 0.36, 0.3);
  for (let i = 0; i < 9; i++) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', (i % 3) * 100 + 4);
    r.setAttribute('y', Math.floor(i / 3) * 100 + 4);
    r.setAttribute('width', 92);
    r.setAttribute('height', 92);
    r.setAttribute('rx', 12);
    r.setAttribute('class', 'hit');
    r.dataset.i = i;
    board.appendChild(r);
  }
  scribble(0.25);
}

function drawMark(i, p) {
  if (S.drawn.has(i)) return;
  S.drawn.add(i);
  const cx = (i % 3) * 100 + 50;
  const cy = Math.floor(i / 3) * 100 + 50;
  if (p === 0) {
    stroke(wobblyLine(cx - 26, cy - 26, cx + 26, cy + 26, 6), 'mx', 0, 0.16);
    stroke(wobblyLine(cx + 26, cy - 26, cx - 26, cy + 26, 6), 'mx', 0.17, 0.16);
  } else stroke(wobblyCircle(cx, cy, 29), 'mo', 0, 0.32);
  scribble(0.18);
}

function drawWin(line) {
  const c = (i) => [(i % 3) * 100 + 50, Math.floor(i / 3) * 100 + 50];
  const [x1, y1] = c(line[0]);
  const [x2, y2] = c(line[2]);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const k = 0.28;
  // el resaltador va detrás de las marcas
  const p = stroke(wobblyLine(x1 - dx * k, y1 - dy * k, x2 + dx * k, y2 + dy * k, 4), 'win', 0.35, 0.45);
  board.insertBefore(p, board.firstChild);
}

// ================= ronda =================
function newRound(first = false) {
  const go = () => {
    board.classList.remove('erase');
    S.board = R.empty();
    S.result = null;
    S.turn = S.starter;
    drawGrid();
    renderScore();
    msg('');
    afterMove();
  };
  if (first) go();
  else {
    board.classList.add('erase');
    setTimeout(go, 480);
  }
}

function myTurn() {
  if (S.result || S.busy) return false;
  if (S.mode === 'local') return true;
  return S.turn === S.me;
}

board.addEventListener('click', (e) => {
  const r = e.target.closest('.hit');
  if (!r) return;
  const i = Number(r.dataset.i);
  if (!myTurn() || !R.legal(S.board, i)) return;
  audio();
  if (S.mode === 'online') {
    S.busy = true;
    online.send({ t: 'move', move: i });
    return;
  }
  play(i);
});

function play(i) {
  R.apply(S.board, i, S.turn);
  drawMark(i, S.turn);
  const r = R.check(S.board);
  if (r.winner >= 0 || r.full) return endRound(r);
  S.turn = 1 - S.turn;
  afterMove();
}

function afterMove() {
  renderScore();
  if (S.mode === 'cpu' && S.turn === 1 && !S.result) {
    S.busy = true;
    msg(t('thinking'));
    setTimeout(() => {
      S.busy = false;
      play(cpuMove());
    }, 420 + Math.random() * 380);
    return;
  }
  if (S.mode === 'local') msg(t('theirTurn', { n: S.names[S.turn] }));
  else if (S.mode === 'cpu') msg(t('yourTurn'));
}

function endRound(r) {
  S.result = r;
  if (r.winner >= 0) {
    S.score[r.winner]++;
    drawWin(r.line);
  } else S.score[2]++;
  renderScore();
  let text;
  if (r.winner < 0) text = t('draw');
  else if (S.mode === 'local') text = t('wins', { n: S.names[r.winner] });
  else text = r.winner === S.me ? t('youWin') : t('youLose');
  msg(text, true);
  sound(r.winner < 0 ? 'draw' : S.mode !== 'local' && r.winner !== S.me ? 'lose' : 'win');
  S.starter = 1 - S.starter;
  setTimeout(() => S.mode && S.mode !== 'online' && newRound(), 1900);
}

function renderScore() {
  const turnCls = (p) => (!S.result && S.turn === p ? ' turn' : '');
  $('score').innerHTML = `<span class="x${turnCls(0)}">✕ ${esc(S.names[0])} ${S.score[0]}</span><small>${t('draws')} ${S.score[2]}</small><span class="o${turnCls(1)}">${S.score[1]} ${esc(S.names[1])} ◯</span>`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function msg(text, pop = false) {
  const m = $('msg');
  m.textContent = text;
  if (pop) {
    m.classList.remove('pop');
    void m.offsetWidth;
    m.classList.add('pop');
  }
}

// ================= CPU =================
function cpuMove() {
  const b = S.board;
  const moves = R.moves(b);
  if (S.level === 'easy') {
    // a veces ve la jugada obvia, a veces no
    if (Math.random() < 0.55) {
      for (const p of [1, 0])
        for (const m of moves) {
          const c = b.slice();
          c[m] = p;
          if (R.check(c).winner === p) return m;
        }
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }
  let best = -Infinity;
  let pick = moves[0];
  for (const m of moves) {
    const c = b.slice();
    c[m] = 1;
    const v = minimax(c, 0, false);
    if (v > best) {
      best = v;
      pick = m;
    }
  }
  return pick;
}
function minimax(b, depth, maxing) {
  const r = R.check(b);
  if (r.winner === 1) return 10 - depth;
  if (r.winner === 0) return depth - 10;
  if (r.full) return 0;
  let best = maxing ? -Infinity : Infinity;
  for (const m of R.moves(b)) {
    b[m] = maxing ? 1 : 0;
    const v = minimax(b, depth + 1, !maxing);
    b[m] = -1;
    best = maxing ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

// ================= online =================
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('tictactoe', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'move') {
        if (m.timeout) msg(t('timeout'));
      } else if (m.t === 'error') {
        S.busy = false;
        $('on-status').textContent = netText(m.code);
        $('lobby-status').textContent = netText(m.code);
      } else if (m.t === 'opponent_left') msg(netText('opponent_left'), true);
      else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = null;
        show('online');
      }
    },
  });
  return online;
}

$('on-create').onclick = () => {
  audio();
  ensureOnline().create($('on-name').value.trim() || defaultName());
};
$('on-join').onclick = () => {
  audio();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return;
  ensureOnline().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => online.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online.leave();
  show('online');
};
$('lobby-share').onclick = async () => {
  const r = await share('tictactoe', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};

let lastRound = 0;
function applyRoom(room) {
  S.mode = 'online';
  if (room.state === 'lobby' || !room.match) {
    $('lobby-code').textContent = room.code;
    $('lobby-players').innerHTML = room.players
      .map((p, i) => `<li><span style="color:var(--${i ? 'o' : 'x'})">${i ? '◯' : '✕'}</span> ${esc(p.name)} <small>${[p.id === online.myId ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
      .join('');
    const full = room.players.length >= 2;
    $('lobby-start').hidden = !online.isHost || !full;
    $('lobby-status').textContent = !full ? t('waiting') : online.isHost ? '' : t('waitingHost');
    lastRound = 0;
    show('lobby');
    return;
  }
  const m = room.match;
  if (!$('s-game').classList.contains('on')) show('game');
  S.me = Math.max(0, m.order.indexOf(online.myId));
  S.names = m.order.map((id) => (id === online.myId ? t('you') : room.players.find((p) => p.id === id)?.name ?? '?'));
  S.score = [m.score[m.order[0]] || 0, m.score[m.order[1]] || 0, m.score.draws || 0];
  S.busy = false;
  const apply = () => {
    S.board = m.board.slice();
    S.turn = m.turn ? m.order.indexOf(m.turn) : S.turn;
    S.board.forEach((v, i) => v >= 0 && drawMark(i, v));
    if (m.result && !S.result) {
      const winIdx = m.result.winner ? m.order.indexOf(m.result.winner) : -1;
      S.result = m.result;
      if (winIdx >= 0) drawWin(m.result.line);
      msg(winIdx < 0 ? t('draw') : winIdx === S.me ? t('youWin') : t('youLose'), true);
      sound(winIdx < 0 ? 'draw' : winIdx === S.me ? 'win' : 'lose');
    } else if (!m.result) {
      S.result = null;
      msg(S.turn === S.me ? t('yourTurn') : t('theirTurn', { n: S.names[S.turn] }));
    }
    renderScore();
    S.deadlineAt = m.deadline > 0 ? performance.now() + m.deadline : 0;
  };
  if (m.round !== lastRound) {
    const first = lastRound === 0;
    lastRound = m.round;
    if (first) {
      drawGrid();
      apply();
    } else {
      board.classList.add('erase');
      setTimeout(() => {
        board.classList.remove('erase');
        drawGrid();
        S.result = null;
        apply();
      }, 480);
    }
  } else apply();
}

// barra de tiempo del turno online
(function tick() {
  requestAnimationFrame(tick);
  const bar = $('timer');
  const on = S.mode === 'online' && S.deadlineAt && !S.result;
  bar.hidden = !on;
  if (on) bar.firstElementChild.style.transform = `scaleX(${Math.max(0, (S.deadlineAt - performance.now()) / 30000)})`;
})();

// ================= sonido =================
let ac = null;
function audio() {
  if (ac) return ac.state === 'suspended' && ac.resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) ac = new AC();
}
/** Raspado de lápiz / tiza: ruido filtrado. */
function scribble(dur) {
  if (!ac || !G.prefs.volume.sfx) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(i / 90)) * (1 - i / len);
  const s = ac.createBufferSource();
  s.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = G.prefs.theme === 'dark' ? 2400 : 4200;
  const g = ac.createGain();
  g.gain.value = 0.18 * G.prefs.volume.sfx;
  s.connect(f).connect(g).connect(ac.destination);
  s.start();
}
function sound(k) {
  if (!ac || !G.prefs.volume.sfx) return;
  const notes = { win: [523, 659, 784, 1047], lose: [392, 330, 262], draw: [440, 440] }[k];
  notes.forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const at = ac.currentTime + 0.25 + i * 0.12;
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.15 * G.prefs.volume.sfx, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    o.connect(g).connect(ac.destination);
    o.start(at);
    o.stop(at + 0.32);
  });
}

// ================= arranque =================
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  if (S.mode) renderScore();
}, true);

const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
if (!$('s-game').classList.contains('on')) G.gameplay(false);
G.ready();
