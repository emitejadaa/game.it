/* Teléfono Loco — game.it
 * El teléfono descompuesto con dibujos: cada uno escribe una frase, el siguiente la dibuja, el
 * otro describe el dibujo… y al final se ven los álbumes completos. El servidor lleva las
 * cadenas; acá se escribe, se dibuja (los trazos se mandan mientras se dibuja) y se muestran los
 * álbumes paso a paso con el dibujo repitiéndose trazo a trazo.
 */
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, notes, unlock } from '/shared/sfx.js';
import { W, H, PALETTE, SIZES, blank, stroke, apply, render, replay } from './paper.js';
import { PROMPTS } from './shared/prompts.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const TXT = {
  title1: { es: 'Teléfono', en: 'Wacky' },
  title2: { es: 'Loco', en: 'Phone' },
  tagline: { es: 'Escribí, dibujá, adiviná… y mirá cómo se deforma todo en el camino.', en: 'Write, draw, guess… and watch everything get lost along the way.' },
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
  startMode: { es: 'Cómo arranca', en: 'How it starts' },
  startWrite: { es: 'Cada uno escribe', en: 'Everyone writes' },
  startRandom: { es: 'Frases al azar', en: 'Random phrases' },
  lang: { es: 'Idioma de las frases', en: 'Phrase language' },
  drawTime: { es: 'Segundos para dibujar', en: 'Seconds to draw' },
  writeTime: { es: 'Segundos para escribir', en: 'Seconds to write' },
  chain: { es: 'Pasos por cadena', en: 'Steps per chain' },
  chainAll: { es: 'Todos', en: 'Everyone' },
  revealMode: { es: 'Mostrar los álbumes', en: 'Show albums' },
  revealManual: { es: 'El anfitrión', en: 'Host clicks' },
  revealAuto: { es: 'Solos', en: 'Automatic' },
  visibility: { es: 'Sala', en: 'Room' },
  private: { es: 'Privada', en: 'Private' },
  public: { es: 'Pública', en: 'Public' },
  start: { es: 'EMPEZAR', en: 'START' },
  needPlayers: { es: 'Hacen falta al menos 2 jugadores (mejor 4 o más): pasales el código', en: 'You need at least 2 players (4+ is best): share the code' },
  waitingHost: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  lobbyInfo: { es: '{n} jugadores · {s} pasos por cadena', en: '{n} players · {s} steps per chain' },
  you: { es: 'vos', en: 'you' },
  host: { es: 'anfitrión', en: 'host' },
  stepOf: { es: 'Paso {s} de {n}', en: 'Step {s} of {n}' },
  tWrite: { es: 'Escribí una frase', en: 'Write a phrase' },
  tDraw: { es: '¡A dibujar!', en: 'Draw it!' },
  tGuess: { es: '¿Qué es este dibujo?', en: 'What is this drawing?' },
  tReveal: { es: 'Los álbumes', en: 'The albums' },
  qWrite: { es: 'Escribí algo divertido para que lo dibujen', en: 'Write something fun for others to draw' },
  qGuess: { es: 'Describí el dibujo con una frase', en: 'Describe the drawing in one phrase' },
  qFree: { es: 'No te llegó ningún dibujo: escribí algo para dibujar', en: 'No drawing reached you: write something to draw' },
  drawThis: { es: 'Dibujá esto', en: 'Draw this' },
  done: { es: '¡LISTO!', en: 'DONE!' },
  edit: { es: 'EDITAR', en: 'EDIT' },
  ready: { es: '¡Listo!', en: 'Done!' },
  waitOthers: { es: 'Esperando a {n} jugador(es)…', en: 'Waiting for {n} player(s)…' },
  timeUp: { es: '¡Tiempo!', en: "Time's up!" },
  albumOf: { es: 'Álbum de {n}', en: "{n}'s album" },
  albumN: { es: 'Álbum {a} de {n}', en: 'Album {a} of {n}' },
  randomStart: { es: 'Frase al azar', en: 'Random phrase' },
  wrote: { es: '{n} escribió', en: '{n} wrote' },
  drew: { es: '{n} dibujó', en: '{n} drew' },
  described: { es: '{n} lo describió', en: '{n} described it' },
  nothingT: { es: '(no escribió nada)', en: '(wrote nothing)' },
  nothingD: { es: '(no dibujó nada)', en: '(drew nothing)' },
  next: { es: 'SIGUIENTE ▶', en: 'NEXT ▶' },
  nextAlbum: { es: 'SIGUIENTE ÁLBUM ▶', en: 'NEXT ALBUM ▶' },
  finish: { es: 'TERMINAR', en: 'FINISH' },
  hostShows: { es: '{n} va mostrando los álbumes', en: '{n} is showing the albums' },
  autoShows: { es: 'Los álbumes se muestran solos', en: 'Albums play automatically' },
  theEnd: { es: '¡Fin de la partida!', en: 'Game over!' },
  endSub: { es: 'Volvé a ver cualquier álbum o guardalo como imagen.', en: 'Watch any album again or save it as an image.' },
  again: { es: 'JUGAR OTRA', en: 'PLAY AGAIN' },
  backRoom: { es: 'VOLVER A LA SALA', en: 'BACK TO ROOM' },
  waitAgain: { es: 'El anfitrión puede empezar otra', en: 'The host can start another one' },
  save: { es: 'GUARDAR IMAGEN', en: 'SAVE IMAGE' },
  loading: { es: 'Cargando álbumes…', en: 'Loading albums…' },
  rules: {
    es: [
      '<b>Escribí una frase</b> divertida (o arrancá con frases al azar).',
      'Las frases rotan: <b>dibujá</b> la que te llega, sin letras ni números.',
      'Después te llega un dibujo de otro: <b>describilo</b> con palabras. Nunca ves lo anterior.',
      'Se sigue alternando hasta que cada cadena pasó por todos.',
      'Al final se muestran los <b>álbumes</b> paso a paso: ¡mirá cómo terminó tu frase! Reaccioná y guardá los mejores.',
    ],
    en: [
      '<b>Write a phrase</b> (or start with random ones).',
      'Phrases rotate: <b>draw</b> the one you get, no letters or numbers.',
      "Then you get someone else's drawing: <b>describe it</b> in words. You never see what came before.",
      'It keeps alternating until every chain went through everyone.',
      'At the end the <b>albums</b> are revealed step by step: see how your phrase ended up! React and save the best ones.',
    ],
  },
};
const t = (k, v) => {
  let s = TXT[k] ? G.t(TXT[k]) : k;
  if (v && typeof s === 'string') for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const REACTS = ['😂', '❤️', '🔥', '😮', '👏'];

// ================================================================ estado
const S = {
  room: null,
  tl: null,
  game: 0,
  task: null,
  done: false,
  ops: [],
  tool: 'brush',
  color: 3,
  size: 1,
  drawing: false,
  cur: null,
  buf: [],
  sentAt: 0,
  albums: {}, // álbum → entradas ya mostradas (partida en curso)
  all: null, // todos los álbumes (al terminar)
  revAlbum: -1,
  stops: [],
  endShown: false,
  deadline: 0,
  total: 1,
  lastPhase: '',
  timeUp: false,
};
let online = null;
const meId = () => online?.myId;
const nameOf = (id) => S.tl?.names?.[id] || S.room?.players.find((p) => p.id === id)?.name || '?';
const colorOf = (id) => S.tl?.colors?.[id] || S.room?.players.find((p) => p.id === id)?.color || '#9aa';

// ================================================================ hoja de dibujo
const cv = $('cv');
const g = cv.getContext('2d', { willReadFrequently: true });
blank(g);

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
const canDraw = () => S.task?.kind === 'draw' && !S.done && S.tl?.phase === 'draw' && !S.timeUp;
$('b-undo').onclick = () => undo();
$('b-clear').onclick = () => {
  if (!canDraw() || !S.ops.length) return;
  flush();
  S.ops = [];
  render(g, S.ops);
  online.send({ t: 'clear' });
};
function undo() {
  if (!canDraw() || !S.ops.length) return;
  flush();
  S.ops.pop();
  render(g, S.ops);
  online.send({ t: 'undo' });
}
function toCanvas(e) {
  const r = cv.getBoundingClientRect();
  return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
}
const clampPt = ([x, y]) => [Math.max(-10, Math.min(W + 10, x)), Math.max(-10, Math.min(H + 10, y))];
cv.addEventListener('pointerdown', (e) => {
  if (!canDraw()) return;
  e.preventDefault();
  unlock();
  const [x, y] = clampPt(toCanvas(e));
  if (S.tool === 'fill') {
    const op = { k: 'f', x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)), c: S.color };
    S.ops.push(op);
    apply(g, op);
    online.send({ t: 'op', o: op });
    return;
  }
  cv.setPointerCapture(e.pointerId);
  S.drawing = true;
  const op = { k: 's', c: S.tool === 'eraser' ? 0 : S.color, w: S.size, p: [x, y] };
  S.cur = op;
  S.ops.push(op);
  stroke(g, op);
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
    if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) < 3) continue;
    p.push(x, y);
    S.buf.push(x, y);
  }
  if (p.length > from) stroke(g, S.cur, from);
  if (performance.now() - S.sentAt > 60 || S.buf.length >= 180) flush();
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
  while (S.buf.length) online.send({ t: 'op', o: { k: '+', p: S.buf.splice(0, 180) } });
}
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    undo();
  }
});

// ================================================================ escribir / describir
let textTimer = 0;
$('txt').addEventListener('input', () => {
  clearTimeout(textTimer);
  textTimer = setTimeout(() => online?.send({ t: 'text', v: $('txt').value }), 350);
});
$('say').onsubmit = (e) => {
  e.preventDefault();
  setDone(true);
};
$('b-dice').onclick = () => {
  const lang = S.room?.settings?.lang || 'es';
  const list = PROMPTS[lang] || PROMPTS.es;
  $('txt').value = list[Math.floor(Math.random() * list.length)];
  $('txt').dispatchEvent(new Event('input'));
  sfx('ui');
};
$('b-done-t').onclick = () => setDone(true);
$('b-done-d').onclick = () => setDone(true);
$('b-edit').onclick = () => setDone(false);

function setDone(on) {
  if (!S.task || S.timeUp) return;
  unlock();
  if (on && S.task.kind === 'text' && !$('txt').value.trim()) {
    $('txt').focus();
    $('txt').classList.remove('shake');
    void $('txt').offsetWidth;
    $('txt').classList.add('shake');
    return;
  }
  if (S.task.kind === 'draw') flush();
  clearTimeout(textTimer);
  S.done = on;
  online.send({ t: 'done', on, ...(S.task.kind === 'text' ? { v: $('txt').value } : {}) });
  sfx(on ? 'done' : 'ui');
  renderWork();
}

// ================================================================ vista de la partida
function applyRoom(room) {
  S.room = room;
  if (room.state === 'lobby') {
    S.tl = null;
    S.task = null;
    S.endShown = false;
    stopReplays();
    renderLobby(room);
    $('app').hidden = true;
    show('lobby');
    return;
  }
  const tl = room.tl;
  if (!tl) return;
  if (tl.game > S.game) newGame(tl.game);
  S.tl = tl;
  S.deadline = performance.now() + tl.left;
  S.total = tl.total || 1;
  if (tl.phase !== S.lastPhase) {
    S.lastPhase = tl.phase;
    S.timeUp = false;
    if (tl.phase === 'reveal') sfx('reveal');
  }
  if (room.state === 'finished' || tl.phase === 'end') return showEnd();
  show(null);
  $('app').hidden = false;
  renderWho();
  if (tl.phase === 'reveal') renderReveal();
  else renderWork();
  syncGameplay();
}

/** Partida nueva (el primer aviso puede ser la tarea o la sala). */
function newGame(n) {
  S.game = n;
  S.albums = {};
  S.all = null;
  S.revAlbum = -1;
  S.task = null;
  S.endShown = false;
  stopReplays();
  $('feed').innerHTML = '';
}

function renderWho() {
  const tl = S.tl;
  const reveal = tl.phase === 'reveal';
  const owner = reveal ? tl.owners[tl.album] : null;
  $('who').innerHTML = tl.order
    .map((id) => {
      const p = S.room.players.find((x) => x.id === id);
      const done = tl.done.includes(id);
      const cls = [id === meId() ? 'me' : '', done && !reveal ? 'done' : '', !p?.connected ? 'away' : '', id === owner ? 'owner' : ''].join(' ');
      return `<span class="chip ${cls}" style="--pc:${colorOf(id)}"><i>${esc(nameOf(id).charAt(0).toUpperCase())}</i>${esc(nameOf(id))}${done && !reveal ? ' ✓' : ''}</span>`;
    })
    .join('');
}

function renderWork() {
  const tl = S.tl;
  const task = S.task;
  $('st-reveal').hidden = true;
  $('p-step').textContent = t('stepOf', { s: tl.step, n: tl.steps });
  $('p-title').textContent = t({ write: 'tWrite', draw: 'tDraw', guess: 'tGuess' }[tl.phase]);
  if (!task || task.step !== currentStep()) {
    $('st-text').hidden = $('st-draw').hidden = true;
    $('waiting').hidden = true;
    return;
  }
  const draw = task.kind === 'draw';
  $('st-text').hidden = draw;
  $('st-draw').hidden = !draw;
  if (draw) {
    $('draw-lbl').textContent = t('drawThis');
    $('draw-txt').textContent = task.input?.v || '';
    $('b-done-d').textContent = t('done');
    cv.classList.toggle('can', canDraw());
  } else {
    const drawing = task.input?.k === 'draw';
    $('seen-draw').hidden = !drawing;
    $('b-dice').hidden = tl.phase !== 'write';
    $('write-q').textContent = tl.phase === 'write' ? t('qWrite') : drawing ? t('qGuess') : t('qFree');
    $('write-art').className = `art ${tl.phase === 'write' ? 'a-write' : 'a-guess'}`;
    $('write-art').hidden = drawing;
    $('b-done-t').textContent = t('done');
    $('txt').disabled = S.done || S.timeUp;
  }
  const wait = $('waiting');
  wait.hidden = !(S.done || S.timeUp);
  if (!wait.hidden) {
    const live = tl.order.filter((id) => S.room.players.find((p) => p.id === id)?.connected);
    const left = live.filter((id) => !tl.done.includes(id)).length;
    $('wait-t').textContent = S.timeUp && !S.done ? t('timeUp') : t('ready');
    $('wait-n').textContent = t('waitOthers', { n: Math.max(0, left) });
    $('b-edit').textContent = t('edit');
    $('b-edit').hidden = !S.done || S.timeUp;
  }
}
/** Número de paso interno (el del servidor) que corresponde a la vista actual. */
function currentStep() {
  const tl = S.tl;
  return tl.step - 1 + (tl.len - tl.steps);
}

function onTask(m) {
  if (m.game < S.game) return;
  if (m.game > S.game) newGame(m.game);
  S.task = m;
  S.done = !!m.mine?.done;
  S.timeUp = false;
  if (m.kind === 'draw') {
    S.ops = (m.mine?.ops || []).map((o) => (o.k === 's' ? { ...o, p: o.p.slice() } : o));
    render(g, S.ops);
    S.tool = 'brush';
    syncTools();
  } else {
    $('txt').value = m.mine?.text || '';
    $('txt').placeholder = m.phase === 'write' ? pickPlaceholder() : '…';
    if (m.input?.k === 'draw') {
      const sg = $('seen-cv').getContext('2d', { willReadFrequently: true });
      render(sg, m.input.v);
    }
    if (!S.done && !G.prefs.touch) setTimeout(() => $('txt').focus(), 60);
  }
  sfx('step');
  if (['write', 'draw', 'guess'].includes(S.tl?.phase) && S.room?.state === 'playing') renderWork();
}
function pickPlaceholder() {
  const list = PROMPTS[S.room?.settings?.lang || 'es'] || PROMPTS.es;
  return `${list[Math.floor(Math.random() * list.length)]}…`;
}

// ---------------------------------------------------------------- temporizador
function tick() {
  requestAnimationFrame(tick);
  const tl = S.tl;
  if (!tl || $('app').hidden) return;
  const showT = tl.phase !== 'reveal' || S.room?.settings?.reveal === 'auto';
  $('timer').style.visibility = showT ? '' : 'hidden';
  const left = Math.max(0, S.deadline - performance.now());
  const sec = Math.ceil(left / 1000);
  const n = $('t-num');
  if (n.textContent !== String(sec)) {
    n.textContent = sec;
    if (tl.phase !== 'reveal' && sec <= 5 && sec > 0 && !S.done) sfx('tick');
  }
  $('t-arc').style.strokeDashoffset = String(100 - (left / S.total) * 100);
  $('timer').classList.toggle('low', tl.phase !== 'reveal' && sec <= 10);
  // se acabó el tiempo: se manda lo último y se espera el paso siguiente
  if (left <= 0 && !S.timeUp && ['write', 'draw', 'guess'].includes(tl.phase) && S.task) {
    S.timeUp = true;
    if (S.task.kind === 'draw') endStroke();
    else if (!S.done) online?.send({ t: 'text', v: $('txt').value });
    renderWork();
  }
}
requestAnimationFrame(tick);

// ================================================================ álbumes
function stopReplays() {
  for (const s of S.stops) s();
  S.stops = [];
}

function entryEl(item, i, animate) {
  const el = document.createElement('div');
  const mine = item.by && item.by === meId();
  el.className = `entry ${item.k}${mine ? ' mine' : ''}${animate ? ' pop' : ''}`;
  const who = item.by ? item.name : null;
  const label = !who || item.auto ? t('randomStart') : item.k === 'draw' ? t('drew', { n: who }) : i === 0 ? t('wrote', { n: who }) : t('described', { n: who });
  const av = who && !item.auto ? `<span class="av" style="--pc:${item.color}">${esc(who.charAt(0).toUpperCase())}</span>` : '<span class="av dice">🎲</span>';
  if (item.k === 'text') {
    const txt = item.empty ? `<em>${t('nothingT')}</em>` : esc(item.v);
    el.innerHTML = `${av}<div class="body"><small>${esc(label)}</small><p class="bubble hand">${txt}</p></div>`;
  } else {
    el.innerHTML = `${av}<div class="body"><small>${esc(label)}</small><div class="pic"><canvas width="${W}" height="${H}"></canvas>${item.empty ? `<em>${t('nothingD')}</em>` : ''}</div></div>`;
    const c = el.querySelector('canvas').getContext('2d', { willReadFrequently: true });
    S.stops.push(replay(c, item.v || [], 2400, !animate || G.prefs.reducedMotion));
  }
  return el;
}

function renderReveal() {
  const tl = S.tl;
  $('st-text').hidden = $('st-draw').hidden = true;
  $('waiting').hidden = true;
  $('st-reveal').hidden = false;
  $('p-step').textContent = t('albumN', { a: tl.album + 1, n: tl.albums });
  $('p-title').textContent = t('tReveal');
  const owner = tl.owners[tl.album];
  $('al-title').textContent = owner ? t('albumOf', { n: nameOf(owner) }) : t('albumN', { a: tl.album + 1, n: tl.albums });
  $('al-count').textContent = `${Math.min(tl.entry + 1, tl.len)}/${tl.len}`;
  const host = online?.isHost;
  const last = tl.entry >= tl.len - 1;
  const b = $('b-next');
  b.hidden = !host;
  b.textContent = !last ? t('next') : tl.album < tl.albums - 1 ? t('nextAlbum') : t('finish');
  const hostName = S.room.players.find((p) => p.id === S.room.host)?.name || '';
  $('rev-note').textContent = S.room.settings.reveal === 'auto' ? t('autoShows') : host ? '' : t('hostShows', { n: hostName });
}

function onRev(m) {
  if (m.game !== S.game) return;
  const list = (S.albums[m.album] ||= []);
  list[m.i] = m.item;
  const feed = $('feed');
  if (S.revAlbum !== m.album || feed.childElementCount !== m.i) {
    // álbum nuevo (o faltaba algo): se arma de cero
    S.revAlbum = m.album;
    stopReplays();
    feed.innerHTML = '';
    feed.scrollTop = 0;
    list.forEach((it, k) => it && feed.append(entryEl(it, k, k === m.i)));
    if (m.i === 0) sfx('album');
  } else feed.append(entryEl(m.item, m.i, true));
  sfx(m.item.k === 'draw' ? 'draw' : 'pop');
  requestAnimationFrame(() => feed.lastElementChild?.scrollIntoView({ behavior: G.prefs.reducedMotion ? 'auto' : 'smooth', block: 'end' }));
}

function onAlbum(m) {
  if (m.game !== S.game) return;
  S.albums[m.album] = m.items;
  S.revAlbum = m.album;
  stopReplays();
  const feed = $('feed');
  feed.innerHTML = '';
  m.items.forEach((it, k) => feed.append(entryEl(it, k, false)));
  feed.scrollTop = feed.scrollHeight;
}

$('b-next').onclick = () => {
  unlock();
  online?.send({ t: 'next' });
};
$('reacts').innerHTML = REACTS.map((e) => `<button data-e="${e}">${e}</button>`).join('');
$('reacts').onclick = (e) => {
  const b = e.target.closest('button[data-e]');
  if (!b) return;
  unlock();
  online?.send({ t: 'react', e: b.dataset.e });
};
function floatEmoji(e, pid) {
  if (G.prefs.reducedMotion) return;
  const el = document.createElement('div');
  el.className = 'float';
  el.style.left = `${10 + Math.random() * 80}%`;
  el.innerHTML = `${e}<small style="--pc:${colorOf(pid)}">${esc(nameOf(pid))}</small>`;
  $('floaters').append(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------------------------------------------------------------- fin y visor
function showEnd() {
  G.gameplay(false);
  if (!S.endShown) {
    S.endShown = true;
    if (!S.all) online?.send({ t: 'albums' });
    sfx('end');
  }
  renderEnd();
  if (!$('s-album').classList.contains('on')) show('end');
}
function renderEnd() {
  const tl = S.tl;
  const host = online?.isHost;
  $('e-again').hidden = !host;
  $('e-room').hidden = !host;
  $('e-status').textContent = host ? '' : t('waitAgain');
  if (!tl) return;
  $('e-albums').innerHTML = S.all
    ? S.all
        .map((items, a) => {
          const owner = items.find((e) => e.by);
          const first = items[0];
          return `<button class="alb" data-a="${a}" style="--pc:${owner?.color || '#aaa'}"><b>${esc(owner ? t('albumOf', { n: owner.name }) : t('albumN', { a: a + 1, n: S.all.length }))}</b><small class="hand">${esc(first.empty ? '…' : first.v)}</small></button>`;
        })
        .join('')
    : `<p class="note">${t('loading')}</p>`;
}
$('e-albums').onclick = (e) => {
  const b = e.target.closest('.alb');
  if (b) openViewer(Number(b.dataset.a));
};
let viewing = -1;
function openViewer(a) {
  viewing = a;
  const items = S.all[a];
  const owner = items.find((e) => e.by);
  $('v-title').textContent = owner ? t('albumOf', { n: owner.name }) : t('albumN', { a: a + 1, n: S.all.length });
  $('v-count').textContent = t('albumN', { a: a + 1, n: S.all.length });
  stopReplays();
  const feed = $('v-feed');
  feed.innerHTML = '';
  items.forEach((it, k) => feed.append(entryEl(it, k, false)));
  feed.scrollTop = 0;
  show('album');
}
$('v-back').onclick = () => {
  stopReplays();
  show('end');
};
$('v-save').onclick = () => viewing >= 0 && saveAlbum(S.all[viewing]);
$('e-again').onclick = async () => {
  unlock();
  await G.commercialBreak('revancha');
  online?.send({ t: 'again' });
};
$('e-room').onclick = () => online?.send({ t: 'rematch' });
$('e-leave').onclick = () => leave();
$('b-exit').onclick = () => leave();

/** Guarda un álbum como una imagen larga (frases en burbujas y dibujos). */
async function saveAlbum(items) {
  try {
    await document.fonts.load('38px "Gochi Hand"');
  } catch {}
  const CW = 900;
  const pad = 40;
  const inner = CW - pad * 2;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = '38px "Gochi Hand", cursive';
  const wrap = (s) => {
    const words = String(s).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (meas.measureText(next).width > inner - 60 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const blocks = items.map((it) => {
    if (it.k === 'text') {
      const lines = wrap(it.empty ? t('nothingT') : it.v);
      return { it, lines, h: 40 + lines.length * 46 + 36 };
    }
    return { it, h: 40 + (inner * H) / W + 24 };
  });
  const total = 120 + blocks.reduce((s, b) => s + b.h, 0) + 60;
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = total;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, total);
  bg.addColorStop(0, '#3b1d6e');
  bg.addColorStop(1, '#b8386b');
  x.fillStyle = bg;
  x.fillRect(0, 0, CW, total);
  const owner = items.find((e) => e.by);
  x.fillStyle = '#fff';
  x.font = '52px "Gochi Hand", cursive';
  x.textAlign = 'center';
  x.fillText(owner ? t('albumOf', { n: owner.name }) : 'Teléfono Loco', CW / 2, 80);
  x.textAlign = 'left';
  let y = 120;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const og = off.getContext('2d', { willReadFrequently: true });
  items.forEach((it, i) => {
    const b = blocks[i];
    const who = it.by ? it.name : t('randomStart');
    x.font = '600 22px Fredoka, sans-serif';
    x.fillStyle = it.color || '#ffd23f';
    x.fillText(it.by && !it.auto ? (it.k === 'draw' ? t('drew', { n: who }) : i === 0 ? t('wrote', { n: who }) : t('described', { n: who })) : who, pad, y + 26);
    if (it.k === 'text') {
      x.fillStyle = '#fffdf6';
      x.beginPath();
      x.roundRect(pad, y + 38, inner, b.lines.length * 46 + 24, 18);
      x.fill();
      x.fillStyle = '#1d1633';
      x.font = '38px "Gochi Hand", cursive';
      b.lines.forEach((l, k) => x.fillText(l, pad + 24, y + 38 + 42 + k * 46));
    } else {
      render(og, it.v || []);
      x.save();
      x.beginPath();
      x.roundRect(pad, y + 38, inner, (inner * H) / W, 14);
      x.clip();
      x.drawImage(off, pad, y + 38, inner, (inner * H) / W);
      x.restore();
    }
    y += b.h;
  });
  x.font = '600 20px Fredoka, sans-serif';
  x.fillStyle = 'rgba(255,255,255,.7)';
  x.textAlign = 'center';
  x.fillText('Teléfono Loco · game.it', CW / 2, total - 24);
  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telefono-loco-${(owner?.name || 'album').replace(/[^\w-]+/g, '_')}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }, 'image/png');
  sfx('ui');
}

function leave() {
  online?.leave();
  S.room = null;
  S.tl = null;
  S.task = null;
  stopReplays();
  $('app').hidden = true;
  show('home');
  refreshRooms();
}

// ================================================================ sala
function renderLobby(room) {
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
  const n = room.players.length;
  $('l-info').textContent = t('lobbyInfo', { n, s: st.chain ? Math.min(n, st.chain) : n });
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
    setting(k, ['lang', 'start', 'reveal'].includes(k) ? v : k === 'public' ? v === 'true' : Number(v));
    sfx('ui');
  };
$('l-start').onclick = () => online.send({ t: 'start' });
$('l-leave').onclick = () => leave();
$('l-share').onclick = async () => {
  const r = await share('telefono', online.room.code);
  $('l-status').textContent = r === 'copied' ? t('copied') : '';
};

// ================================================================ conexión
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('telefono', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('h-status').textContent = txt;
    },
    onRoom: applyRoomWrap,
    onMessage,
  });
  return online;
}
function onMessage(m) {
  if (m.t === 'list') return renderRooms(m.rooms || []);
  if (m.t === 'task') return onTask(m);
  if (m.t === 'rev') return onRev(m);
  if (m.t === 'album') return onAlbum(m);
  if (m.t === 'albums') {
    if (m.game !== S.game) return;
    S.all = m.albums;
    if (S.endShown) renderEnd();
    return;
  }
  if (m.t === 'react') {
    floatEmoji(m.e, m.p);
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
    S.tl = null;
    $('app').hidden = true;
    stopReplays();
    show('home');
  }
}

const myName = () => {
  const n = $('name').value.trim() || defaultName();
  $('name').value = n;
  return n;
};
let wantQuick = false;
let pendingPublic = false;
$('b-quick').onclick = () => {
  unlock();
  wantQuick = true;
  ensureOnline().send({ t: 'list', game: 'telefono' });
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
function renderRooms(rooms) {
  const open = rooms.filter((r) => r.n < r.max && r.state === 'lobby').sort((a, b) => b.n - a.n);
  if (wantQuick) {
    wantQuick = false;
    if (open.length) return ensureOnline().join(open[0].code, myName());
    pendingPublic = true;
    return ensureOnline().create(myName());
  }
  $('rooms').innerHTML = rooms.length
    ? rooms
        .filter((r) => r.n < r.max)
        .map((r) => `<li><span>${esc(r.name)} · ${r.lang === 'en' ? 'EN' : 'ES'}</span><small>${r.n}/${r.max} · ${r.state === 'lobby' ? t('waiting') : t('playing')}</small>${r.state === 'lobby' ? `<button data-code="${r.code}">${t('enter')}</button>` : ''}</li>`)
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
  const ask = () => $('s-home').classList.contains('on') && ensureOnline().send({ t: 'list', game: 'telefono' });
  ask();
  roomsTimer = setInterval(ask, 6000);
}
function applyRoomWrap(room) {
  // la sala nueva de "partida rápida" se hace pública
  if (pendingPublic && room.host === meId() && room.state === 'lobby') {
    pendingPublic = false;
    online.send({ t: 'settings', settings: { ...(room.settings || {}), public: true, lang: G.prefs.lang === 'en' ? 'en' : 'es' } });
  }
  applyRoom(room);
}

// ================================================================ pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  syncGameplay();
}
function syncGameplay() {
  G.gameplay(!!S.tl && S.room?.state === 'playing' && !$$('.screen.on').length);
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-go="rules"]')) return show('rules');
  if (e.target.closest('[data-back]')) show('home');
});

// ================================================================ sonido
function sfx(k) {
  if (k === 'step') notes([523, 784], { step: 0.08, dur: 0.14, type: 'triangle', vol: 0.08 });
  else if (k === 'done') notes([659, 988], { step: 0.07, dur: 0.12, vol: 0.08 });
  else if (k === 'pop') tone(520, 880, 0.12, { type: 'triangle', vol: 0.07 });
  else if (k === 'draw') tone(300, 600, 0.2, { type: 'triangle', vol: 0.06 });
  else if (k === 'album') notes([392, 523, 659], { step: 0.09, dur: 0.16, type: 'square', vol: 0.05 });
  else if (k === 'reveal') notes([523, 659, 784, 1047], { step: 0.08, dur: 0.18, type: 'square', vol: 0.06 });
  else if (k === 'end') notes([523, 659, 784, 1047, 1319], { step: 0.09, dur: 0.22, type: 'square', vol: 0.06 });
  else if (k === 'tick') tone(1200, 1100, 0.04, { type: 'square', vol: 0.03 });
  else if (k === 'ui') tone(900, 620, 0.05, { type: 'square', vol: 0.04 });
}

// ================================================================ arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('rules-body').innerHTML = G.t(TXT.rules)
    .map((l) => `<li>${l}</li>`)
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
const code = roomFromUrl();
if (code) $('code').value = code;
if (!ensureOnline().resume()) refreshRooms();
G.gameplay(false);
G.ready();
if (/[?&]debug\b/.test(location.search))
  window.__tel = {
    S,
    get online() {
      return online;
    },
  };
