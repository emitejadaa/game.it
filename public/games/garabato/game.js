/* Garabato — game.it
 * Dibujar y adivinar online: por turnos uno dibuja una palabra y los demás la adivinan en el chat.
 * Cuanto antes se adivina, más puntos. El servidor lleva la partida; acá se dibuja la hoja, se
 * mandan los trazos del que dibuja (en tandas chicas) y se muestran los de los demás en vivo.
 */
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const TXT = {
  title: { es: 'Garabato', en: 'Squiggle' },
  tagline: { es: 'Uno dibuja, los demás adivinan. ¡Cuanto antes, más puntos!', en: 'One draws, everyone guesses. The sooner, the more points!' },
  quick: { es: 'PARTIDA RÁPIDA', en: 'QUICK GAME' },
  createPrivate: { es: 'CREAR SALA PRIVADA', en: 'CREATE PRIVATE ROOM' },
  join: { es: 'UNIRSE', en: 'JOIN' },
  publicRooms: { es: 'Salas públicas', en: 'Public rooms' },
  noRooms: { es: 'No hay salas públicas ahora. ¡Creá una con Partida rápida!', en: 'No public rooms right now. Start one with Quick game!' },
  enter: { es: 'Entrar', en: 'Join' },
  playing: { es: 'jugando', en: 'playing' },
  waiting: { es: 'esperando', en: 'waiting' },
  howTo: { es: 'Cómo se juega', en: 'How to play' },
  back: { es: '← volver', en: '← back' },
  shareCode: { es: 'Compartí este código', en: 'Share this code' },
  copyLink: { es: 'COPIAR LINK', en: 'COPY LINK' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  lang: { es: 'Idioma de las palabras', en: 'Word language' },
  rounds: { es: 'Rondas', en: 'Rounds' },
  time: { es: 'Segundos para dibujar', en: 'Seconds to draw' },
  hints: { es: 'Pistas (letras)', en: 'Hints (letters)' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  visibility: { es: 'Sala', en: 'Room' },
  private: { es: 'Privada', en: 'Private' },
  public: { es: 'Pública', en: 'Public' },
  custom: { es: 'Palabras propias (separadas por comas)', en: 'Custom words (comma separated)' },
  onlyCustom: { es: 'Usar solo mis palabras (mínimo 6)', en: 'Use only my words (at least 6)' },
  start: { es: 'EMPEZAR', en: 'START' },
  needPlayers: { es: 'Hacen falta al menos 2 jugadores: pasales el código', en: 'You need at least 2 players: share the code' },
  waitingHost: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  lobbyInfo: { es: '{n} jugadores · {r} rondas · {s} s', en: '{n} players · {r} rounds · {s} s' },
  you: { es: 'vos', en: 'you' },
  host: { es: 'anfitrión', en: 'host' },
  roundOf: { es: 'Ronda {r} de {n}', en: 'Round {r} of {n}' },
  choose: { es: 'Elegí qué dibujar', en: 'Pick what to draw' },
  choosing: { es: '{n} está eligiendo qué dibujar…', en: '{n} is picking a word…' },
  drawNow: { es: 'Dibujá', en: 'Draw' },
  drawing: { es: 'Dibuja {n}', en: '{n} is drawing' },
  guessIt: { es: 'Adiviná', en: 'Guess' },
  letters: { es: '{n} letras', en: '{n} letters' },
  wordWas: { es: 'La palabra era', en: 'The word was' },
  allGuessed: { es: '¡Todos la adivinaron!', en: 'Everybody got it!' },
  timeUp: { es: '¡Se acabó el tiempo!', en: "Time's up!" },
  drawerLeft: { es: 'El que dibujaba se fue', en: 'The drawer left' },
  placeholder: { es: 'Escribí tu respuesta…', en: 'Type your guess…' },
  placeDraw: { es: 'Estás dibujando', en: "You're drawing" },
  placeDone: { es: '¡Adivinaste! Podés charlar con los que la sacaron', en: 'You got it! Chat with the others who did' },
  guessedMsg: { es: '¡{n} adivinó la palabra! (+{p})', en: '{n} guessed the word! (+{p})' },
  youGuessed: { es: '¡Adivinaste! +{p}', en: 'You got it! +{p}' },
  close: { es: '¡«{m}» está muy cerca!', en: '“{m}” is really close!' },
  joined: { es: '{n} entró', en: '{n} joined' },
  left: { es: '{n} salió', en: '{n} left' },
  newTurn: { es: 'Ahora dibuja {n}', en: 'Now {n} is drawing' },
  podium: { es: 'Podio', en: 'Podium' },
  again: { es: 'JUGAR OTRA', en: 'PLAY AGAIN' },
  waitAgain: { es: 'El anfitrión puede empezar otra', en: 'The host can start another one' },
  pts: { es: 'pts', en: 'pts' },
  rules: {
    es: [
      'Por turnos, a cada uno le toca <b>dibujar</b>: elige una de tres palabras y la dibuja sin letras ni números.',
      'Los demás escriben en el chat lo que creen que es. <b>Cuanto antes adivinás, más puntos</b> (y el primero suma un extra).',
      'El que dibuja gana puntos por cada uno que adivina su dibujo.',
      'Con el tiempo aparecen <b>letras de pista</b>. Si tu respuesta está muy cerca, te avisa solo a vos.',
      'Los que ya adivinaron pueden charlar entre ellos sin arruinarles la palabra a los demás.',
      'En cada ronda dibujan todos una vez. Al final, el podio.',
    ],
    en: [
      'Everyone takes turns to <b>draw</b>: pick one of three words and draw it without letters or numbers.',
      'The others type their guesses in the chat. <b>The sooner you guess, the more points</b> (and the first one gets a bonus).',
      'The drawer scores for everyone who guesses the drawing.',
      '<b>Letter hints</b> show up as time goes by. If your guess is really close, only you are told.',
      'Players who already guessed can chat with each other without spoiling the word.',
      'Everybody draws once per round. Podium at the end.',
    ],
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v && typeof s === 'string') for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ================================================================ hoja
const W = 1000;
const H = 750;
const PALETTE = ['#ffffff', '#c1c1c1', '#6b6b6b', '#111111', '#ef4444', '#f97316', '#facc15', '#a3e635', '#22c55e', '#14b8a6', '#38bdf8', '#3b82f6', '#1e3a8a', '#8b5cf6', '#ec4899', '#92400e', '#fcd9b6', '#7f1d1d'];
const SIZES = [4, 9, 18, 36];
const cv = $('cv');
const g = cv.getContext('2d', { willReadFrequently: true });

function blank() {
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
}
blank();

/** Dibuja un trazo desde el punto `from` (índice en coordenadas) hasta el final. */
function stroke(op, from = 0) {
  const p = op.p;
  g.strokeStyle = g.fillStyle = PALETTE[op.c] || '#111';
  g.lineWidth = SIZES[op.w] || 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (p.length === 2 || (from === 0 && p.length <= 2)) {
    g.beginPath();
    g.arc(p[0], p[1], g.lineWidth / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  const s = Math.max(0, from - 2);
  g.beginPath();
  g.moveTo(p[s], p[s + 1]);
  for (let i = s + 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.stroke();
}

/** Relleno con balde (tolerancia para los bordes suavizados). */
function fill(x, y, c) {
  x = Math.round(Math.max(0, Math.min(W - 1, x)));
  y = Math.round(Math.max(0, Math.min(H - 1, y)));
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const i0 = (y * W + x) * 4;
  const r0 = d[i0];
  const g0 = d[i0 + 1];
  const b0 = d[i0 + 2];
  const hex = PALETTE[c] || '#111111';
  const r1 = parseInt(hex.slice(1, 3), 16);
  const g1 = parseInt(hex.slice(3, 5), 16);
  const b1 = parseInt(hex.slice(5, 7), 16);
  if (Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1) < 8) return;
  const tol = 90;
  const seen = new Uint8Array(W * H);
  const stack = [x, y];
  const same = (k) => Math.abs(d[k] - r0) + Math.abs(d[k + 1] - g0) + Math.abs(d[k + 2] - b0) <= tol;
  while (stack.length) {
    const py = stack.pop();
    let px = stack.pop();
    let k = py * W + px;
    while (px > 0 && !seen[k - 1] && same((k - 1) * 4)) {
      px--;
      k--;
    }
    let up = false;
    let down = false;
    while (px < W && !seen[k] && same(k * 4)) {
      seen[k] = 1;
      const q = k * 4;
      d[q] = r1;
      d[q + 1] = g1;
      d[q + 2] = b1;
      d[q + 3] = 255;
      if (py > 0) {
        const u = k - W;
        if (!seen[u] && same(u * 4)) {
          if (!up) {
            stack.push(px, py - 1);
            up = true;
          }
        } else up = false;
      }
      if (py < H - 1) {
        const dn = k + W;
        if (!seen[dn] && same(dn * 4)) {
          if (!down) {
            stack.push(px, py + 1);
            down = true;
          }
        } else down = false;
      }
      px++;
      k++;
    }
  }
  // se engorda un píxel sobre los bordes suavizados para que no quede un halo blanco
  for (let yy = 1; yy < H - 1; yy++)
    for (let xx = 1; xx < W - 1; xx++) {
      const k = yy * W + xx;
      if (seen[k]) continue;
      if (seen[k - 1] || seen[k + 1] || seen[k - W] || seen[k + W]) {
        const q = k * 4;
        const diff = Math.abs(d[q] - r0) + Math.abs(d[q + 1] - g0) + Math.abs(d[q + 2] - b0);
        if (diff < 380) {
          d[q] = (d[q] + r1) >> 1;
          d[q + 1] = (d[q + 1] + g1) >> 1;
          d[q + 2] = (d[q + 2] + b1) >> 1;
        }
      }
    }
  g.putImageData(img, 0, 0);
}

function apply(op) {
  if (op.k === 's') stroke(op);
  else if (op.k === 'f') fill(op.x, op.y, op.c);
}
function redraw() {
  blank();
  for (const op of S.ops) apply(op);
}

// ================================================================ estado
const S = {
  room: null,
  gb: null,
  turn: 0,
  ops: [],
  word: '',
  choices: [],
  deadline: 0,
  total: 1,
  tool: 'brush',
  color: 3,
  size: 1,
  drawing: false,
  cur: null,
  buf: [],
  names: new Map(),
  lastPhase: '',
  endShown: false,
};
let online = null;
const meId = () => online?.myId;
const isDrawer = () => S.gb && S.gb.drawer === meId() && S.gb.phase === 'draw';

// ---------------------------------------------------------------- herramientas
function buildTools() {
  $('pal').innerHTML = PALETTE.map((c, i) => `<button data-c="${i}" style="--c:${c}" aria-label="${c}"></button>`).join('');
  $('sizes').innerHTML = SIZES.map((s, i) => `<button data-s="${i}" aria-label="${s}"><i style="width:${Math.max(4, s * 0.55)}px;height:${Math.max(4, s * 0.55)}px"></i></button>`).join('');
  syncTools();
}
function syncTools() {
  $$('#pal button').forEach((b) => b.classList.toggle('on', Number(b.dataset.c) === S.color && S.tool !== 'eraser'));
  $$('#sizes button').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === S.size));
  $$('.tb[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === S.tool));
}
$('pal').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.color = Number(b.dataset.c);
  if (S.tool === 'eraser') S.tool = 'brush';
  syncTools();
};
$('sizes').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.size = Number(b.dataset.s);
  syncTools();
};
$$('.tb[data-tool]').forEach((b) => (b.onclick = () => ((S.tool = b.dataset.tool), syncTools())));
$('b-undo').onclick = () => undo();
$('b-clear').onclick = () => {
  if (!isDrawer() || !S.ops.length) return;
  S.ops = [];
  redraw();
  online.send({ t: 'clear' });
};
function undo() {
  if (!isDrawer() || !S.ops.length) return;
  flush();
  S.ops.pop();
  redraw();
  online.send({ t: 'undo' });
}

// ---------------------------------------------------------------- dibujar (el que tiene el turno)
function toCanvas(e) {
  const r = cv.getBoundingClientRect();
  return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
}
const clampPt = ([x, y]) => [Math.max(-10, Math.min(W + 10, x)), Math.max(-10, Math.min(H + 10, y))];
cv.addEventListener('pointerdown', (e) => {
  if (!isDrawer()) return;
  e.preventDefault();
  unlock();
  const [x, y] = clampPt(toCanvas(e));
  if (S.tool === 'fill') {
    const op = { k: 'f', x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)), c: S.color };
    S.ops.push(op);
    apply(op);
    online.send({ t: 'op', o: op });
    return;
  }
  cv.setPointerCapture(e.pointerId);
  S.drawing = true;
  const op = { k: 's', c: S.tool === 'eraser' ? 0 : S.color, w: S.size, p: [x, y] };
  S.cur = op;
  S.ops.push(op);
  stroke(op);
  online.send({ t: 'op', o: { k: 's', c: op.c, w: op.w, p: [x, y] } });
  S.buf = [];
  S.sentAt = performance.now();
});
cv.addEventListener('pointermove', (e) => {
  if (!S.drawing || !S.cur) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const p = S.cur.p;
  const from = p.length;
  for (const ev of evs.length ? evs : [e]) {
    const [x, y] = clampPt(toCanvas(ev));
    const lx = p[p.length - 2];
    const ly = p[p.length - 1];
    if (Math.abs(x - lx) + Math.abs(y - ly) < 3) continue;
    p.push(x, y);
    S.buf.push(x, y);
  }
  if (p.length > from) stroke(S.cur, from);
  if (performance.now() - S.sentAt > 50 || S.buf.length >= 180) flush();
});
const endStroke = () => {
  if (!S.drawing) return;
  S.drawing = false;
  flush();
  S.cur = null;
};
cv.addEventListener('pointerup', endStroke);
cv.addEventListener('pointercancel', endStroke);
function flush() {
  S.sentAt = performance.now();
  while (S.buf.length) {
    const chunk = S.buf.splice(0, 180);
    online.send({ t: 'op', o: { k: '+', p: chunk } });
  }
}
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    undo();
  }
});

// ================================================================ vista de la partida
function nameOf(id) {
  const p = S.room?.players.find((x) => x.id === id);
  return p ? p.name : S.names.get(id) || '?';
}
function colorOf(id) {
  return S.room?.players.find((x) => x.id === id)?.color || '#9eabc2';
}

function applyRoom(room) {
  const prev = S.room;
  S.room = room;
  for (const p of room.players) S.names.set(p.id, p.name);
  // entradas y salidas en el chat
  if (prev && room.state !== 'lobby') {
    const before = new Set(prev.players.map((p) => p.id));
    const now = new Set(room.players.map((p) => p.id));
    for (const p of room.players) if (!before.has(p.id)) sys(t('joined', { n: p.name }));
    for (const p of prev.players) if (!now.has(p.id)) sys(t('left', { n: p.name }));
  }
  if (room.state === 'lobby') {
    S.gb = null;
    S.endShown = false;
    renderLobby(room);
    show('lobby');
    return;
  }
  const gb = room.gb;
  if (!gb) return;
  const turnChanged = gb.turn !== S.turn;
  if (turnChanged) {
    S.turn = gb.turn;
    S.ops = [];
    S.word = '';
    blank();
    if (gb.phase === 'choose' || gb.phase === 'draw') sys(t('newTurn', { n: nameOf(gb.drawer) }));
  }
  S.gb = gb;
  if (gb.phase !== 'end') S.endShown = false;
  S.deadline = performance.now() + gb.left;
  S.total = gb.total || 1;
  if (gb.phase !== S.lastPhase) {
    if (gb.phase === 'draw' && gb.drawer === meId()) sfx('go');
    if (gb.phase === 'reveal') {
      sys(`${t('wordWas')}: ${gb.results.word.toUpperCase()}`, 'rev');
      sfx('reveal');
    }
    S.lastPhase = gb.phase;
  }
  if (room.state === 'finished' || gb.phase === 'end') showEnd(gb);
  else {
    show(null);
    renderGame();
  }
  syncGameplay();
}

function renderGame() {
  const gb = S.gb;
  const me = meId();
  $('app').hidden = false;
  // barra
  $('round').textContent = t('roundOf', { r: gb.round, n: gb.rounds });
  const hint = $('hint');
  if (gb.phase === 'draw' && (gb.drawer === me || S.word)) hint.innerHTML = `<small>${gb.drawer === me ? t('drawNow') : t('guessIt')}</small><span class="me">${esc(S.word.toUpperCase())}</span>`;
  else if (gb.phase === 'draw') {
    const n = [...gb.hint].filter((c) => c !== ' ').length;
    hint.innerHTML = `<small>${t('letters', { n })}</small>${esc(gb.hint.toUpperCase().replace(/ /g, ' ').split('').join(' '))}`;
  } else if (gb.phase === 'choose') hint.innerHTML = `<small>${esc(t('choosing', { n: nameOf(gb.drawer) }))}</small>…`;
  else hint.textContent = '';
  // jugadores ordenados por puntos
  const list = S.room.players
    .map((p) => ({ ...p, pts: gb.scores[p.id] ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  $('players').innerHTML = list
    .map((p) => {
      const cls = [p.id === me ? 'me' : '', p.id === gb.drawer && gb.phase !== 'end' ? 'drawing' : '', gb.guessed.includes(p.id) ? 'guessed' : '', !p.connected ? 'away' : ''].join(' ');
      const st = p.id === gb.drawer && gb.phase !== 'end' ? '✏️' : gb.guessed.includes(p.id) ? '✅' : '';
      const gain = gb.phase === 'reveal' ? gb.results.gains[p.id] || (p.id === gb.results.drawer ? gb.results.drawerGain : 0) : 0;
      return `<div class="pl ${cls}" style="--pc:${p.color}"><span class="av">${esc(p.name.charAt(0).toUpperCase())}</span><span class="nm"><b>${esc(p.name)}${p.id === me ? ` (${t('you')})` : ''}</b><small>${p.pts} ${t('pts')}${gain ? ` <span class="gain">+${gain}</span>` : ''}</small></span><span class="st">${st}</span></div>`;
    })
    .join('');
  // herramientas y chat
  const drawer = isDrawer();
  $('tools').hidden = !drawer;
  cv.classList.toggle('can', drawer);
  const msg = $('msg');
  const guessed = gb.guessed.includes(me);
  msg.disabled = drawer;
  msg.placeholder = drawer ? t('placeDraw') : guessed ? t('placeDone') : t('placeholder');
  // capa sobre la hoja
  const over = $('over');
  if (gb.phase === 'choose') {
    over.hidden = false;
    if (gb.drawer === me && S.choices.length && S.choicesTurn === gb.turn) {
      if (over.dataset.k !== `c${gb.turn}`) {
        over.dataset.k = `c${gb.turn}`;
        over.innerHTML = `<h3>${t('choose')}</h3><div class="choices">${S.choices.map((w, i) => `<button data-i="${i}">${esc(w)}</button>`).join('')}</div>`;
        sfx('turn');
      }
    } else if (over.dataset.k !== `w${gb.turn}`) {
      over.dataset.k = `w${gb.turn}`;
      over.innerHTML = `<h3>${esc(t('choosing', { n: nameOf(gb.drawer) }))}</h3>`;
    }
  } else if (gb.phase === 'reveal') {
    over.hidden = false;
    if (over.dataset.k !== `r${gb.turn}`) {
      over.dataset.k = `r${gb.turn}`;
      const R = gb.results;
      const why = { all: t('allGuessed'), time: t('timeUp'), left: t('drawerLeft') }[R.why] || '';
      const rows = S.room.players
        .map((p) => ({ p, v: p.id === R.drawer ? R.drawerGain : R.gains[p.id] || 0 }))
        .sort((a, b) => b.v - a.v)
        .map(({ p, v }, i) => `<li class="${v ? '' : 'zero'}" style="animation-delay:${i * 60}ms"><span>${p.id === R.drawer ? '✏️ ' : ''}${esc(p.name)}</span><b>+${v}</b></li>`)
        .join('');
      over.innerHTML = `<p>${why}</p><p>${t('wordWas')}</p><div class="big">${esc(R.word)}</div><ul class="gains">${rows}</ul>`;
    }
  } else {
    over.hidden = true;
    over.dataset.k = '';
  }
}
$('over').onclick = (e) => {
  const b = e.target.closest('.choices button');
  if (!b) return;
  unlock();
  online.send({ t: 'pick', i: Number(b.dataset.i) });
  sfx('ui');
};

// temporizador
function tick() {
  requestAnimationFrame(tick);
  const gb = S.gb;
  if (!gb || $('app').hidden) return;
  const left = Math.max(0, S.deadline - performance.now());
  const sec = Math.ceil(left / 1000);
  const n = $('t-num');
  if (n.textContent !== String(sec)) {
    n.textContent = sec;
    if (gb.phase === 'draw' && sec <= 10 && sec > 0) sfx('tick');
  }
  $('t-arc').style.strokeDashoffset = String(100 - (left / S.total) * 100);
  $('timer').classList.toggle('low', gb.phase === 'draw' && sec <= 10);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------- chat
function addLine(html, cls = '') {
  const log = $('log');
  const p = document.createElement('p');
  p.className = cls;
  p.innerHTML = html;
  const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
  log.append(p);
  while (log.childElementCount > 150) log.firstElementChild.remove();
  if (stick) log.scrollTop = log.scrollHeight;
}
function sys(txt, cls = 'sys') {
  addLine(esc(txt), cls);
}
$('say').onsubmit = (e) => {
  e.preventDefault();
  const m = $('msg').value.trim();
  if (!m || !online) return;
  unlock();
  online.send({ t: 'guess', m });
  $('msg').value = '';
};

// ================================================================ fin
function showEnd(gb) {
  if (S.endShown) return;
  S.endShown = true;
  const pod = gb.podium || [];
  const order = [pod[1], pod[0], pod[2]];
  const colors = ['#c1c1c1', '#ffd23f', '#e8a15c'];
  const heights = [110, 150, 80];
  $('podium').innerHTML = order
    .map((p, i) => (p ? `<div><b>${esc(p.name)}</b><small>${p.pts} ${t('pts')}</small><i style="--c:${colors[i]};height:${heights[i]}px">${[2, 1, 3][i]}</i></div>` : '<div></div>'))
    .join('');
  $('rank').innerHTML = pod
    .slice(3)
    .map((p, i) => `<li><i style="background:${p.color}"></i><span>${i + 4}. ${esc(p.name)}</span><small>${p.pts}</small></li>`)
    .join('');
  const host = online?.isHost;
  $('e-again').hidden = !host;
  $('e-status').textContent = host ? '' : t('waitAgain');
  sfx(pod[0]?.id === meId() ? 'win' : 'reveal');
  show('end');
}
$('e-again').onclick = async () => {
  unlock();
  await G.commercialBreak('revancha');
  online?.send({ t: 'again' });
};
$('e-leave').onclick = () => leave();
$('b-exit').onclick = () => leave();
function leave() {
  online?.leave();
  S.room = null;
  S.gb = null;
  $('app').hidden = true;
  $('log').innerHTML = '';
  show('home');
  refreshRooms();
}

// ================================================================ sala
function renderLobby(room) {
  $('app').hidden = true;
  $('l-code').textContent = room.code;
  $('l-players').innerHTML = room.players
    .map((p) => `<li><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${[p.id === meId() ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
    .join('');
  const st = room.settings || {};
  const host = online.isHost;
  for (const seg of $$('#l-host .seg')) {
    const k = seg.dataset.l;
    $$('button', seg).forEach((b) => {
      b.classList.toggle('on', String(st[k]) === b.dataset.v);
      b.disabled = !host;
    });
  }
  const ta = $('l-custom');
  if (document.activeElement !== ta) ta.value = st.custom || '';
  ta.disabled = !host;
  $('l-only').checked = !!st.onlyCustom;
  $('l-only').disabled = !host;
  $('l-info').textContent = t('lobbyInfo', { n: room.players.length, r: st.rounds, s: st.time });
  $('l-start').hidden = !host;
  const few = room.players.filter((p) => p.connected).length < 2;
  $('l-status').textContent = few ? t('needPlayers') : host ? '' : t('waitingHost');
  $('l-status').style.color = few ? '' : 'var(--muted)';
}
function setting(k, v) {
  if (!online?.isHost) return;
  online.send({ t: 'settings', settings: { ...(online.room.settings || {}), [k]: v } });
}
for (const seg of $$('#l-host .seg'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = seg.dataset.l;
    const v = b.dataset.v;
    setting(k, k === 'lang' ? v : k === 'public' ? v === 'true' : Number(v));
    sfx('ui');
  };
$('l-custom').addEventListener('change', (e) => setting('custom', e.target.value));
$('l-only').addEventListener('change', (e) => setting('onlyCustom', e.target.checked ? 1 : 0));
$('l-start').onclick = () => online.send({ t: 'start' });
$('l-leave').onclick = () => leave();
$('l-share').onclick = async () => {
  const r = await share('garabato', online.room.code);
  $('l-status').textContent = r === 'copied' ? t('copied') : '';
};

// ================================================================ conexión
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('garabato', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('h-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: onMessage,
  });
  return online;
}
function onMessage(m) {
  if (m.t === 'list') return renderRooms(m.rooms || []);
  if (m.t === 'op') {
    const o = m.o;
    if (o.k === '+') {
      const last = S.ops[S.ops.length - 1];
      if (last?.k === 's') {
        const from = last.p.length;
        last.p.push(...o.p);
        stroke(last, from);
      }
    } else {
      const op = o.k === 's' ? { ...o, p: o.p.slice() } : o;
      S.ops.push(op);
      apply(op);
    }
    return;
  }
  if (m.t === 'undo') {
    S.ops.pop();
    return redraw();
  }
  if (m.t === 'clear') {
    S.ops = [];
    return redraw();
  }
  if (m.t === 'ops') {
    if (m.turn !== S.turn) S.turn = m.turn;
    S.ops = (m.ops || []).map((o) => (o.k === 's' ? { ...o, p: o.p.slice() } : o));
    return redraw();
  }
  if (m.t === 'choices') {
    S.choices = m.w;
    S.choicesTurn = m.turn;
    if (S.gb) renderGame();
    return;
  }
  if (m.t === 'word') {
    S.word = m.w;
    if (S.gb) renderGame();
    return;
  }
  if (m.t === 'chat') {
    const col = colorOf(m.p);
    if (m.ok) {
      if (m.p === meId()) {
        addLine(esc(t('youGuessed', { p: m.gain })), 'ok');
        sfx('win');
      } else {
        addLine(esc(t('guessedMsg', { n: nameOf(m.p), p: m.gain })), 'ok');
        sfx('ding');
      }
      return;
    }
    addLine(`<b style="--pc:${col}">${esc(nameOf(m.p))}:</b> ${esc(m.m)}`, m.g ? 'g' : '');
    return;
  }
  if (m.t === 'close') {
    addLine(esc(t('close', { m: m.m })), 'close');
    return;
  }
  if (m.t === 'error') {
    const txt = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
    $('h-status').textContent = txt;
    $('l-status').textContent = txt;
    return;
  }
  if (m.t === 'closed' || m.t === 'kicked') {
    $('h-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
    S.room = null;
    S.gb = null;
    $('app').hidden = true;
    show('home');
  }
}

const myName = () => {
  const n = $('name').value.trim() || defaultName();
  $('name').value = n;
  return n;
};
let wantQuick = false;
$('b-quick').onclick = () => {
  unlock();
  wantQuick = true;
  ensureOnline().send({ t: 'list', game: 'garabato' });
};
$('b-create').onclick = () => {
  unlock();
  ensureOnline().create(myName());
};
$('b-join').onclick = () => {
  unlock();
  const code = $('code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureOnline().join(code, myName());
};
$('code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
let pendingPublic = false;
function renderRooms(rooms) {
  const open = rooms.filter((r) => r.n < r.max).sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || b.n - a.n);
  if (wantQuick) {
    wantQuick = false;
    if (open.length) return ensureOnline().join(open[0].code, myName());
    pendingPublic = true;
    return ensureOnline().create(myName());
  }
  $('rooms').innerHTML = open.length
    ? open
        .map((r) => `<li><span>${esc(r.name)} · ${r.lang === 'en' ? 'EN' : 'ES'}</span><small>${r.n}/${r.max} · ${r.state === 'lobby' ? t('waiting') : t('playing')}</small><button data-code="${r.code}">${t('enter')}</button></li>`)
        .join('')
    : `<li class="empty">${t('noRooms')}</li>`;
}
$('rooms').onclick = (e) => {
  const b = e.target.closest('button[data-code]');
  if (b) {
    unlock();
    ensureOnline().join(b.dataset.code, myName());
  }
};
let roomsTimer = 0;
function refreshRooms() {
  clearInterval(roomsTimer);
  const ask = () => $('s-home').classList.contains('on') && ensureOnline().send({ t: 'list', game: 'garabato' });
  ask();
  roomsTimer = setInterval(ask, 6000);
}
// la sala nueva de "partida rápida" se hace pública
const origRoom = applyRoom;
function applyRoomWrap(room) {
  if (pendingPublic && room.host === meId() && room.state === 'lobby') {
    pendingPublic = false;
    online.send({ t: 'settings', settings: { ...(room.settings || {}), public: true, lang: G.prefs.lang === 'en' ? 'en' : 'es' } });
  }
  origRoom(room);
}

// ================================================================ pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  syncGameplay();
}
function syncGameplay() {
  G.gameplay(!!S.gb && S.room?.state === 'playing' && !$$('.screen.on').length);
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-go="rules"]')) return show('rules');
  if (e.target.closest('[data-back]')) show('home');
});

// ================================================================ sonido
function sfx(k) {
  if (k === 'ding') tone(880, 1320, 0.14, { type: 'triangle', vol: 0.08 });
  else if (k === 'win') notes([523, 659, 784, 1047], { step: 0.08, dur: 0.18, type: 'square', vol: 0.07 });
  else if (k === 'go') notes([660, 880], { step: 0.08, dur: 0.14, vol: 0.09 });
  else if (k === 'turn') notes([784, 1047], { step: 0.07, dur: 0.12, vol: 0.08 });
  else if (k === 'reveal') tone(300, 700, 0.3, { type: 'triangle', vol: 0.08 });
  else if (k === 'tick') tone(1200, 1100, 0.04, { type: 'square', vol: 0.03 });
  else if (k === 'ui') tone(900, 620, 0.05, { type: 'square', vol: 0.04 });
}

// ================================================================ arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('rules-body').innerHTML = G.t(TXT.rules)
    .map((l) => `<p>${l}</p>`)
    .join('');
  if (S.room) applyRoom(S.room);
}
const vv = window.visualViewport;
function fitViewport() {
  document.documentElement.style.setProperty('--vh', `${vv ? vv.height : innerHeight}px`);
  if (vv?.offsetTop) window.scrollTo(0, 0);
}
vv?.addEventListener('resize', fitViewport);
addEventListener('resize', fitViewport);
fitViewport();
buildTools();
G.onPrefs(applyPrefs, true);
$('name').value = defaultName();
ensureOnline().onRoom = applyRoomWrap;
const code = roomFromUrl();
if (code) $('code').value = code;
if (!ensureOnline().resume()) refreshRooms();
G.gameplay(false);
G.ready();
if (/[?&]debug\b/.test(location.search))
  window.__garabato = {
    S,
    get online() {
      return online;
    },
  };
