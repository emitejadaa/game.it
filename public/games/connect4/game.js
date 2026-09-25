/* 4 en línea — game.it
 * Juguete de plástico: las fichas caen con gravedad y rebotan. CPU con búsqueda alfa-beta
 * (3 niveles), 2 jugadores en el mismo dispositivo y online.
 */
import { connect4 as R, C4 } from '/shared/boardrules.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';

const TXT = {
  title: { es: '4 en línea', en: 'Connect Four' },
  tagline: { es: 'alineá cuatro antes que tu rival', en: 'line up four before your rival' },
  vsCpu: { es: 'Contra la compu', en: 'Versus CPU' },
  vsCpuSub: { es: '3 niveles de dificultad', en: '3 difficulty levels' },
  local: { es: 'Dos jugadores', en: 'Two players' },
  localSub: { es: 'en el mismo dispositivo', en: 'on the same device' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'sala con código', en: 'room with a code' },
  easy: { es: 'Fácil', en: 'Easy' },
  normal: { es: 'Normal', en: 'Normal' },
  hard: { es: 'Difícil', en: 'Hard' },
  play: { es: '¡Jugar!', en: 'Play!' },
  back: { es: '← volver', en: '← back' },
  create: { es: 'Crear sala', en: 'Create room' },
  orJoin: { es: 'o unite con un código', en: 'or join with a code' },
  join: { es: 'Unirse', en: 'Join' },
  shareCode: { es: 'Pasale este código a tu rival', en: 'Send this code to your rival' },
  copyLink: { es: 'Copiar link', en: 'Copy link' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  start: { es: 'Empezar', en: 'Start' },
  waiting: { es: 'Esperando rival…', en: 'Waiting for rival…' },
  waitingHost: { es: 'Esperando al anfitrión…', en: 'Waiting for host…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  quit: { es: 'terminar', en: 'quit' },
  you: { es: 'Vos', en: 'You' },
  cpu: { es: 'Compu', en: 'CPU' },
  red: { es: 'Rojo', en: 'Red' },
  yellow: { es: 'Amarillo', en: 'Yellow' },
  draws: { es: 'empates', en: 'draws' },
  yourTurn: { es: '¡Te toca!', en: 'Your turn!' },
  theirTurn: { es: 'Turno de {n}', en: "{n}'s turn" },
  thinking: { es: 'La compu piensa…', en: 'CPU is thinking…' },
  youWin: { es: '¡Ganaste! 🎉', en: 'You win! 🎉' },
  youLose: { es: 'Perdiste…', en: 'You lose…' },
  wins: { es: '¡Ganó {n}!', en: '{n} wins!' },
  draw: { es: 'Empate', en: 'Draw' },
  host: { es: 'anfitrión', en: 'host' },
  timeout: { es: 'Se acabó el tiempo: jugada al azar', en: 'Time up: random move' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const S = { mode: null, level: 2, board: R.empty(), turn: 0, starter: 0, names: ['', ''], score: [0, 0, 0], result: null, busy: false, me: 0, discs: new Map(), deadlineAt: 0 };
let online = null;

// ================= tablero SVG =================
const CELL = 100;
const board = $('board');
board.innerHTML = `
  <defs>
    <radialGradient id="gr" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ff7a7a"/><stop offset=".6" stop-color="#ef3b3b"/><stop offset="1" stop-color="#b81f2a"/></radialGradient>
    <radialGradient id="gy" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffe680"/><stop offset=".6" stop-color="#ffc928"/><stop offset="1" stop-color="#d99a00"/></radialGradient>
    <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a6cff"/><stop offset="1" stop-color="#1b44c9"/></linearGradient>
    <mask id="holes"><rect x="0" y="0" width="700" height="600" fill="#fff"/>${Array.from({ length: 42 }, (_, i) => `<circle cx="${(i % 7) * CELL + 50}" cy="${Math.floor(i / 7) * CELL + 50}" r="40" fill="#000"/>`).join('')}</mask>
  </defs>
  <g id="discs"></g>
  <g id="preview"></g>
  <rect x="0" y="0" width="700" height="600" rx="34" fill="url(#gb)" mask="url(#holes)"/>
  ${Array.from({ length: 42 }, (_, i) => `<circle cx="${(i % 7) * CELL + 50}" cy="${Math.floor(i / 7) * CELL + 50}" r="41" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="4"/>`).join('')}
  <rect x="0" y="0" width="700" height="600" rx="34" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="4"/>
  <rect x="0" y="-100" width="700" height="700" fill="transparent" id="hitarea"/>`;
const discsG = $('discs');
const previewG = $('preview');

function discEl(p) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'disc');
  g.innerHTML = `<circle r="42" fill="url(#${p ? 'gy' : 'gr'})"/><circle r="30" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="5"/><ellipse cx="-14" cy="-18" rx="12" ry="7" fill="rgba(255,255,255,.45)" transform="rotate(-30 -14 -18)"/>`;
  return g;
}

function dropDisc(cell, p, animate = true) {
  if (S.discs.has(cell)) return;
  const c = cell % 7;
  const r = Math.floor(cell / 7);
  const g = discEl(p);
  const x = c * CELL + 50;
  const y = r * CELL + 50;
  g.setAttribute('transform', `translate(${x} ${y})`);
  discsG.appendChild(g);
  S.discs.set(cell, g);
  if (!animate || G.prefs.reducedMotion) return;
  // caída con gravedad y rebotes (duración según la altura)
  const fall = y + 60;
  const dur = 260 + Math.sqrt(fall) * 18;
  g.animate(
    [
      { transform: `translate(${x}px, -50px)`, easing: 'cubic-bezier(.5,0,1,1)' },
      { transform: `translate(${x}px, ${y}px)`, offset: 0.6, easing: 'cubic-bezier(0,0,.4,1)' },
      { transform: `translate(${x}px, ${y - Math.min(40, fall * 0.1)}px)`, offset: 0.75, easing: 'cubic-bezier(.6,0,1,1)' },
      { transform: `translate(${x}px, ${y}px)`, offset: 0.88, easing: 'cubic-bezier(0,0,.4,1)' },
      { transform: `translate(${x}px, ${y - Math.min(10, fall * 0.03)}px)`, offset: 0.94 },
      { transform: `translate(${x}px, ${y}px)` },
    ],
    { duration: dur },
  );
  setTimeout(() => clack(r), dur * 0.6);
}

let hoverCol = -1;
function renderPreview() {
  previewG.innerHTML = '';
  if (hoverCol < 0 || !canPlay()) return;
  const g = discEl(S.turn);
  g.setAttribute('transform', `translate(${hoverCol * CELL + 50} -55)`);
  g.style.opacity = '0.9';
  previewG.appendChild(g);
}

function colFromEvent(e) {
  const pt = board.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(board.getScreenCTM().inverse());
  return Math.max(0, Math.min(6, Math.floor(p.x / CELL)));
}
board.addEventListener('pointermove', (e) => {
  const c = colFromEvent(e);
  if (c !== hoverCol) {
    hoverCol = c;
    renderPreview();
  }
});
board.addEventListener('pointerleave', () => {
  hoverCol = -1;
  renderPreview();
});
board.addEventListener('click', (e) => {
  audio();
  const c = colFromEvent(e);
  if (!canPlay() || !R.legal(S.board, c)) return;
  if (S.mode === 'online') {
    S.busy = true;
    online.send({ t: 'move', move: c });
  } else play(c);
  renderPreview();
});
addEventListener('keydown', (e) => {
  if (!canPlay()) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 7) hoverCol = n - 1;
  const d = n >= 1 && n <= 7 ? 'down' : G.dir(e);
  if (d === 'left' || d === 'right') {
    hoverCol = Math.max(0, Math.min(6, (hoverCol < 0 ? 3 : hoverCol) + (d === 'left' ? -1 : 1)));
    renderPreview();
  } else if ((d === 'down' || e.code === 'Space' || e.key === 'Enter') && hoverCol >= 0 && R.legal(S.board, hoverCol)) {
    e.preventDefault();
    if (S.mode === 'online') {
      S.busy = true;
      online.send({ t: 'move', move: hoverCol });
    } else play(hoverCol);
    renderPreview();
  }
});

function canPlay() {
  if (!S.mode || S.result || S.busy) return false;
  return S.mode === 'local' || S.turn === S.me;
}

// ================= flujo =================
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(id === 'game'); // en menús el portal puede mostrar un banner aparte
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  audio();
  const to = go.dataset.go;
  if (to === 'local') {
    S.mode = 'local';
    S.names = [t('red'), t('yellow')];
    newMatch();
  } else show(to);
  if (to === 'online') $('on-name').value ||= defaultName();
});
$('cpu-level').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.level = Number(b.dataset.v);
  $$('#cpu-level button').forEach((x) => x.classList.toggle('on', x === b));
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

function newMatch() {
  S.score = [0, 0, 0];
  S.starter = 0;
  show('game');
  newRound();
}

function clearBoard() {
  // las fichas caen por abajo al "abrir la traba" del tablero
  const old = [...S.discs.values()];
  S.discs.clear();
  old.forEach((g, i) => {
    const a = g.animate([{ transform: g.getAttribute('transform').replace(/translate\(([^ ]+) ([^)]+)\)/, 'translate($1px, $2px)') }, { transform: g.getAttribute('transform').replace(/translate\(([^ ]+) ([^)]+)\)/, (m, x, y) => `translate(${x}px, ${Number(y) + 800}px)`) }], {
      duration: 500 + (i % 7) * 30,
      easing: 'cubic-bezier(.5,0,1,1)',
      fill: 'forwards',
    });
    a.onfinish = () => g.remove();
  });
}

function newRound() {
  clearBoard();
  S.board = R.empty();
  S.result = null;
  S.turn = S.starter;
  renderScore();
  msg('');
  afterMove();
}

function play(c) {
  const cell = R.apply(S.board, c, S.turn);
  dropDisc(cell, S.turn);
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
      const c = cpuMove();
      S.busy = false;
      play(c);
    }, 450);
    return;
  }
  msg(S.mode === 'local' ? t('theirTurn', { n: S.names[S.turn] }) : t('yourTurn'));
  renderPreview();
}

function highlightWin(line) {
  for (const [cell, g] of S.discs) g.classList.add(line.includes(cell) ? 'win' : 'dim');
  // el anillo de la ficha ganadora "brilla"
  for (const cell of line) S.discs.get(cell)?.querySelector('circle:nth-child(2)').setAttribute('stroke', '#fff');
}

function endRound(r) {
  S.result = r;
  if (r.winner >= 0) {
    S.score[r.winner]++;
    setTimeout(() => highlightWin(r.line), 450);
  } else S.score[2]++;
  renderScore();
  const text = r.winner < 0 ? t('draw') : S.mode === 'local' ? t('wins', { n: S.names[r.winner] }) : r.winner === S.me ? t('youWin') : t('youLose');
  setTimeout(() => {
    msg(text, true);
    sound(r.winner < 0 ? 'draw' : S.mode !== 'local' && r.winner !== S.me ? 'lose' : 'win');
  }, 450);
  S.starter = 1 - S.starter;
  if (S.mode !== 'online') setTimeout(() => S.mode && newRound(), 2600);
}

function renderScore() {
  const tc = (p) => (!S.result && S.turn === p ? ' turn' : '');
  $('score').innerHTML = `<div class="chip r${tc(0)}"><i></i><span>${esc(S.names[0])} · ${S.score[0]}</span></div><span class="draws">${t('draws')} ${S.score[2]}</span><div class="chip y${tc(1)}"><i></i><span>${esc(S.names[1])} · ${S.score[1]}</span></div>`;
}

function msg(text, pop = false) {
  const m = $('msg');
  m.textContent = text;
  if (pop) {
    m.classList.remove('pop');
    void m.offsetWidth;
    m.classList.add('pop');
  }
}

// ================= CPU (negamax con poda alfa-beta) =================
const WINDOWS = (() => {
  const w = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 7; c++)
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= 6 || cc < 0 || cc >= 7) break;
          cells.push(rr * 7 + cc);
        }
        if (cells.length === 4) w.push(cells);
      }
  return w;
})();

function evaluate(b, p) {
  let s = 0;
  for (let r = 0; r < 6; r++) s += (b[r * 7 + 3] === p ? 3 : b[r * 7 + 3] === 1 - p ? -3 : 0);
  for (const w of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const i of w) {
      if (b[i] === p) mine++;
      else if (b[i] === 1 - p) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) s += 5;
    else if (mine === 2) s += 2;
    if (theirs === 3) s -= 6;
    else if (theirs === 2) s -= 2;
  }
  return s;
}

function negamax(b, depth, alpha, beta, p) {
  const r = R.check(b);
  if (r.winner >= 0) return r.winner === p ? 100000 + depth : -100000 - depth;
  if (r.full) return 0;
  if (depth === 0) return evaluate(b, p);
  let best = -Infinity;
  for (const c of R.moves(b)) {
    const cell = R.apply(b, c, p);
    const v = -negamax(b, depth - 1, -beta, -alpha, 1 - p);
    b[cell] = -1;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function cpuMove() {
  const b = S.board.slice();
  const moves = R.moves(b);
  if (S.level === 1 && Math.random() < 0.45) return moves[Math.floor(Math.random() * moves.length)];
  const depth = [0, 2, 5, 7][S.level];
  let best = -Infinity;
  let pick = moves[0];
  for (const c of moves) {
    const cell = R.apply(b, c, 1);
    const v = -negamax(b, depth - 1, -Infinity, Infinity, 0) + (S.level === 1 ? Math.random() * 6 : 0);
    b[cell] = -1;
    if (v > best) {
      best = v;
      pick = c;
    }
  }
  return pick;
}

// ================= online =================
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('connect4', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'move' && m.timeout) msg(t('timeout'));
      else if (m.t === 'error') {
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
  if (code.length === 5) ensureOnline().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => online.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online.leave();
  show('online');
};
$('lobby-share').onclick = async () => {
  const r = await share('connect4', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};

let lastRound = 0;
function applyRoom(room) {
  S.mode = 'online';
  if (room.state === 'lobby' || !room.match) {
    $('lobby-code').textContent = room.code;
    $('lobby-players').innerHTML = room.players
      .map((p, i) => `<li><i style="background:var(--${i ? 'yel' : 'red'})"></i>${esc(p.name)}<small>${[p.id === online.myId ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
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
  if (m.round !== lastRound) {
    if (lastRound) clearBoard();
    lastRound = m.round;
    S.result = null;
  }
  S.board = m.board.slice();
  S.board.forEach((v, i) => v >= 0 && dropDisc(i, v, i === m.last));
  S.turn = m.turn ? m.order.indexOf(m.turn) : S.turn;
  if (m.result && !S.result) {
    const w = m.result.winner ? m.order.indexOf(m.result.winner) : -1;
    S.result = m.result;
    if (w >= 0) setTimeout(() => highlightWin(m.result.line), 450);
    setTimeout(() => {
      msg(w < 0 ? t('draw') : w === S.me ? t('youWin') : t('youLose'), true);
      sound(w < 0 ? 'draw' : w === S.me ? 'win' : 'lose');
    }, 450);
  } else if (!m.result) msg(S.turn === S.me ? t('yourTurn') : t('theirTurn', { n: S.names[S.turn] }));
  S.deadlineAt = m.deadline > 0 ? performance.now() + m.deadline : 0;
  renderScore();
  renderPreview();
}

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
function tone(f0, f1, dur, type, vol, at = 0) {
  if (!ac || !G.prefs.volume.sfx) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  const t0 = ac.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(vol * G.prefs.volume.sfx, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
/** "Clac" de plástico: más grave cuanto más abajo cae. */
function clack(row) {
  tone(900 - row * 60, 300, 0.07, 'square', 0.12);
  tone(1800 - row * 90, 900, 0.04, 'triangle', 0.08, 0.02);
}
function sound(k) {
  const n = { win: [523, 659, 784, 1047, 1319], lose: [392, 330, 262], draw: [440, 440] }[k];
  n.forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.15, i * 0.1));
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
