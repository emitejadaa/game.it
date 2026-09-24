/* Buscaminas — game.it
 * Tres dificultades, cronómetro con décimas, primer clic siempre seguro, banderas (clic derecho,
 * mantener apretado o modo bandera), apertura en cascada animada y "chord" sobre números.
 */
const G = window.GameIt;
const $ = (id) => document.getElementById(id);

const TXT = {
  easy: { es: 'Fácil', en: 'Easy' },
  medium: { es: 'Medio', en: 'Medium' },
  hard: { es: 'Difícil', en: 'Hard' },
  hintMouse: { es: 'Clic: abrir · clic derecho: bandera · clic en un número: abrir alrededor', en: 'Click: open · right click: flag · click a number: open around' },
  hintTouch: { es: 'Tocá para abrir · mantené apretado o usá el botón de bandera', en: 'Tap to open · long-press or use the flag button' },
  win: { es: '¡DESPEJADO!', en: 'CLEARED!' },
  lose: { es: '¡BOOM!', en: 'BOOM!' },
  time: { es: 'Tiempo', en: 'Time' },
  best: { es: 'Mejor (sesión)', en: 'Best (session)' },
  cleared: { es: 'Celdas abiertas', en: 'Cells opened' },
  clicks: { es: 'Clics', en: 'Clicks' },
  newBest: { es: '¡nuevo récord de la sesión!', en: 'new session best!' },
  again: { es: 'Otra vez', en: 'Again' },
  menu: { es: 'Menú', en: 'Menu' },
};
const tr = (k) => G.t(TXT[k]);

const LEVELS = [
  { cols: 9, rows: 9, mines: 10 },
  { cols: 16, rows: 16, mines: 40 },
  { cols: 30, rows: 16, mines: 99 },
];
const best = [null, null, null]; // solo esta sesión: los juegos no guardan memoria

const S = {
  level: 0,
  cols: 9,
  rows: 9,
  mines: 10,
  cells: [], // { mine, n, open, flag, el }
  started: false,
  over: false,
  opened: 0,
  flags: 0,
  clicks: 0,
  t0: 0,
  elapsed: 0,
  flagMode: false,
};

const board = $('board');

// ================= tablero =================
function newGame(level = S.level) {
  S.level = level;
  const L = LEVELS[level];
  // en pantallas verticales el tablero ancho se gira
  const portrait = innerHeight > innerWidth && L.cols > L.rows;
  S.cols = portrait ? L.rows : L.cols;
  S.rows = portrait ? L.cols : L.rows;
  S.mines = L.mines;
  S.cells = Array.from({ length: S.cols * S.rows }, () => ({ mine: false, n: 0, open: false, flag: false, el: null }));
  S.started = S.over = false;
  S.opened = S.flags = S.clicks = 0;
  S.elapsed = 0;
  board.classList.remove('won', 'shake');
  board.style.setProperty('--cols', S.cols);
  const frag = document.createDocumentFragment();
  S.cells.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'c';
    el.dataset.i = i;
    const x = i % S.cols;
    const y = (i / S.cols) | 0;
    el.style.setProperty('--d', Math.min(600, (x + y) * 12));
    c.el = el;
    frag.appendChild(el);
  });
  board.replaceChildren(frag);
  $('overlay').classList.remove('on');
  fit();
  hud();
}

function fit() {
  const wrap = $('wrap').getBoundingClientRect();
  const size = Math.floor(Math.min((wrap.width - 40) / S.cols, (wrap.height - 40) / S.rows)) - 3;
  document.documentElement.style.setProperty('--cell', `${Math.max(24, Math.min(46, size))}px`);
}

const idx = (x, y) => y * S.cols + x;
function neighbors(i) {
  const x = i % S.cols;
  const y = (i / S.cols) | 0;
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < S.cols && ny < S.rows) out.push(idx(nx, ny));
    }
  return out;
}

/** Coloca las minas después del primer clic: la celda y sus vecinas quedan libres. */
function placeMines(safe) {
  const forbidden = new Set([safe, ...neighbors(safe)]);
  const pool = [];
  for (let i = 0; i < S.cells.length; i++) if (!forbidden.has(i)) pool.push(i);
  for (let k = 0; k < S.mines; k++) {
    const j = k + Math.floor(Math.random() * (pool.length - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
    S.cells[pool[k]].mine = true;
  }
  S.cells.forEach((c, i) => (c.n = neighbors(i).filter((j) => S.cells[j].mine).length));
  S.started = true;
  S.t0 = performance.now();
}

// ================= acciones =================
function open(i) {
  const c = S.cells[i];
  if (S.over || c.flag) return;
  if (!S.started) placeMines(i);
  if (c.open) return chord(i);
  S.clicks++;
  if (c.mine) return lose(i);
  // apertura en cascada (BFS) con retraso por distancia: se ve como una onda
  const queue = [[i, 0]];
  const seen = new Set([i]);
  while (queue.length) {
    const [j, depth] = queue.shift();
    const cj = S.cells[j];
    if (cj.open || cj.flag) continue;
    reveal(j, depth * 22);
    if (cj.n === 0)
      for (const k of neighbors(j))
        if (!seen.has(k) && !S.cells[k].mine) {
          seen.add(k);
          queue.push([k, depth + 1]);
        }
  }
  sound(seen.size > 1 ? 'cascade' : 'open');
  hud();
  checkWin();
}

function reveal(j, delay) {
  const c = S.cells[j];
  c.open = true;
  S.opened++;
  const el = c.el;
  el.style.setProperty('--d', delay);
  el.className = `c open${c.n ? ` n${c.n}` : ''}`;
  el.textContent = c.n || '';
}

/** Clic sobre un número con las banderas justas: abre todas las vecinas. */
function chord(i) {
  const c = S.cells[i];
  if (!c.n) return;
  const nb = neighbors(i);
  const flags = nb.filter((j) => S.cells[j].flag).length;
  if (flags !== c.n) {
    // pista: resalta las vecinas cerradas
    nb.forEach((j) => {
      const el = S.cells[j].el;
      if (S.cells[j].open || S.cells[j].flag) return;
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(.85)' }, { transform: 'scale(1)' }], { duration: 220 });
    });
    return;
  }
  S.clicks++;
  for (const j of nb) {
    const cj = S.cells[j];
    if (cj.open || cj.flag) continue;
    if (cj.mine) return lose(j);
    open(j);
  }
}

function toggleFlag(i) {
  const c = S.cells[i];
  if (S.over || c.open) return;
  c.flag = !c.flag;
  S.flags += c.flag ? 1 : -1;
  c.el.classList.toggle('flag', c.flag);
  sound(c.flag ? 'flag' : 'unflag');
  if (navigator.vibrate && G.prefs.touch) navigator.vibrate(12);
  hud();
}

function checkWin() {
  if (S.opened !== S.cells.length - S.mines) return;
  S.over = true;
  S.elapsed = performance.now() - S.t0;
  // se marcan solas las minas restantes
  S.cells.forEach((c) => {
    if (c.mine && !c.flag) {
      c.flag = true;
      c.el.classList.add('flag');
    }
  });
  S.flags = S.mines;
  const cx = S.cols / 2;
  const cy = S.rows / 2;
  S.cells.forEach((c, i) => c.el.style.setProperty('--w', Math.round(Math.hypot((i % S.cols) - cx, ((i / S.cols) | 0) - cy) * 40)));
  board.classList.add('won');
  const prev = best[S.level];
  const isBest = prev === null || S.elapsed < prev;
  if (isBest) best[S.level] = S.elapsed;
  hud();
  sound('win');
  confetti();
  setTimeout(() => result(true, isBest), 900);
}

function lose(i) {
  S.over = true;
  S.elapsed = performance.now() - S.t0;
  const hit = S.cells[i];
  // las minas explotan en orden de distancia al clic
  const x0 = i % S.cols;
  const y0 = (i / S.cols) | 0;
  S.cells.forEach((c, j) => {
    const d = Math.hypot((j % S.cols) - x0, ((j / S.cols) | 0) - y0);
    if (c.mine && !c.flag) {
      c.el.style.setProperty('--d', Math.round(d * 45));
      c.el.classList.add('mine');
    } else if (!c.mine && c.flag) c.el.classList.add('wrong');
  });
  hit.el.style.setProperty('--d', 0);
  hit.el.classList.add('hit');
  board.classList.add('shake');
  sound('boom');
  hud();
  setTimeout(() => result(false), 1200);
}

function result(win, isBest) {
  const secs = (S.elapsed / 1000).toFixed(1);
  const b = best[S.level];
  $('panel').className = `panel ${win ? 'win' : 'lose'}`;
  $('panel').innerHTML = `<h2>${tr(win ? 'win' : 'lose')}</h2>
    <dl>
      <dt>${tr('time')}</dt><dd>${secs}s</dd>
      <dt>${tr('best')}</dt><dd>${b !== null ? (b / 1000).toFixed(1) + 's' : '—'}</dd>
      <dt>${tr('cleared')}</dt><dd>${S.opened}/${S.cells.length - S.mines}</dd>
      <dt>${tr('clicks')}</dt><dd>${S.clicks}</dd>
    </dl>
    ${win && isBest ? `<span class="new">${tr('newBest')}</span>` : ''}
    <div class="row"><button class="btn primary" data-a="again">${tr('again')}</button><button class="btn" data-a="menu">${tr('menu')}</button></div>`;
  $('overlay').classList.add('on');
  setTimeout(() => $('panel').querySelector('.primary')?.focus(), 50);
}

$('panel').addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'again') newGame();
  else if (a === 'menu') G.exit();
});

// ================= entrada =================
let press = null;
board.addEventListener('contextmenu', (e) => e.preventDefault());
board.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.c');
  if (!el) return;
  ensureAudio();
  const i = Number(el.dataset.i);
  if (e.button === 2) {
    toggleFlag(i);
    return;
  }
  // mantener apretado = bandera (táctil)
  press = { i, done: false, timer: setTimeout(() => {
    if (!press) return;
    press.done = true;
    if (!S.cells[i].open) toggleFlag(i);
  }, 380) };
});
board.addEventListener('pointerup', (e) => {
  if (!press || e.button === 2) return;
  clearTimeout(press.timer);
  const { i, done } = press;
  press = null;
  if (done) return;
  if (S.flagMode && !S.cells[i].open) toggleFlag(i);
  else open(i);
});
board.addEventListener('pointerleave', () => {
  if (press) clearTimeout(press.timer);
  press = null;
});
board.addEventListener('pointercancel', () => {
  if (press) clearTimeout(press.timer);
  press = null;
});

$('diff').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = Number(b.dataset.d);
  [...$('diff').children].forEach((x) => x.classList.toggle('on', x === b));
  $('diff').style.setProperty('--i', d);
  newGame(d);
});
$('restart').onclick = () => newGame();
$('flagmode').onclick = () => {
  S.flagMode = !S.flagMode;
  $('flagmode').classList.toggle('on', S.flagMode);
};
addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') newGame();
  if (e.key === 'f' || e.key === 'F') $('flagmode').click();
  if (e.key === 'Escape' && $('overlay').classList.contains('on')) newGame();
});

// ================= HUD y reloj =================
function hud() {
  $('mines').textContent = S.mines - S.flags;
}
function tick() {
  requestAnimationFrame(tick);
  const ms = S.over ? S.elapsed : S.started && !G.paused ? performance.now() - S.t0 : S.elapsed;
  if (!S.over && S.started && !G.paused) S.elapsed = ms;
  const txt = (ms / 1000).toFixed(1);
  if ($('time').textContent !== txt) $('time').textContent = txt;
}
// pausa del portal: el reloj no avanza
let pausedAt = 0;
G.onPause(() => (pausedAt = performance.now()));
G.onResume(() => {
  if (pausedAt && S.started && !S.over) S.t0 += performance.now() - pausedAt;
  pausedAt = 0;
});

// ================= sonido y confeti =================
let ac = null;
function ensureAudio() {
  if (ac) return ac.state === 'suspended' && ac.resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) ac = new AC();
}
function beep(f0, f1, dur, type = 'sine', vol = 0.2, at = 0) {
  if (!ac) return;
  const v = G.prefs.volume.sfx;
  if (!v) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol * v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function sound(k) {
  if (k === 'open') beep(660, 520, 0.06, 'triangle', 0.15);
  else if (k === 'cascade') [0, 0.05, 0.1].forEach((at, i) => beep(520 + i * 160, 700 + i * 160, 0.08, 'triangle', 0.12, at));
  else if (k === 'flag') beep(880, 1320, 0.08, 'square', 0.06);
  else if (k === 'unflag') beep(1320, 880, 0.08, 'square', 0.05);
  else if (k === 'boom') {
    beep(180, 40, 0.6, 'sawtooth', 0.25);
    beep(90, 30, 0.8, 'square', 0.15, 0.05);
  } else if (k === 'win') [523, 659, 784, 1047].forEach((f, i) => beep(f, f, 0.18, 'triangle', 0.15, i * 0.1));
}

function confetti() {
  if (G.prefs.reducedMotion) return;
  const c = $('confetti');
  const dpr = Math.min(devicePixelRatio, 2);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const g = c.getContext('2d');
  const col = G.prefs.colors;
  const colors = [col.cyan, col.magenta, col.lime, col.amber, col.violet];
  const bits = Array.from({ length: 140 }, (_, i) => ({
    x: innerWidth / 2,
    y: innerHeight / 2,
    vx: (Math.random() - 0.5) * 900,
    vy: -Math.random() * 900 - 200,
    r: Math.random() * 6,
    vr: (Math.random() - 0.5) * 12,
    s: 5 + Math.random() * 5,
    color: colors[i % colors.length],
  }));
  const t0 = performance.now();
  let last = t0;
  (function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 1400 * dt;
      b.vx *= 0.99;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.r += b.vr * dt;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.fillStyle = b.color;
      g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      g.restore();
    }
    if (now - t0 < 2600) requestAnimationFrame(step);
    else g.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

// ================= arranque =================
function texts() {
  document.documentElement.lang = G.prefs.lang;
  document.querySelectorAll('[data-t]').forEach((n) => (n.textContent = tr(n.dataset.t)));
  $('hint').textContent = G.prefs.touch ? tr('hintTouch') : tr('hintMouse');
}
G.onPrefs(texts, true);
let lastPortrait = innerHeight > innerWidth;
addEventListener('resize', () => {
  const p = innerHeight > innerWidth;
  // si gira la pantalla antes de empezar, se re-arma el tablero orientado
  if (p !== lastPortrait && !S.started) newGame();
  lastPortrait = p;
  fit();
});
newGame(0);
tick();
G.ready();
