/* Mini Golf — game.it
 * Modos: práctica (solo), local (2-4 por turnos en el mismo dispositivo) y online (salas 1-4 con código).
 * Local y online comparten reglas (shared/match.js) y física (shared/physics.js); en online el
 * servidor simula y el cliente reproduce la trayectoria.
 */
import { HOLES, COURSES } from '../shared/holes.js';
import { simulate, simulatePush, findContact, shotDuration, SAMPLE_HZ } from '../shared/physics.js';
import { Match, COLORS } from '../shared/match.js';
import { Renderer } from './render.js';
import { Net } from './net.js';
import * as A from './audio.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ================= textos =================
const TXT = {
  es: {
    tagline: 'Golpes, rebotes y obstáculos locos',
    practice: 'Práctica',
    practiceSub: 'Solo, a tu ritmo',
    local: 'Local',
    localSub: '2 a 4 jugadores por turnos',
    online: 'Online',
    onlineSub: 'Creá una sala y compartí el código',
    course: 'Recorrido (hoyos)',
    play: '¡A jugar!',
    oneHole: 'O practicá un hoyo',
    players: 'Jugadores',
    yourName: 'Tu nombre',
    createRoom: 'Crear sala',
    or: 'o',
    roomCode: 'Código de sala',
    join: 'Unirse',
    lobby: 'Sala',
    shareCode: 'Compartí este código',
    copyLink: 'Copiar link',
    start: 'Empezar partida',
    waitingHost: 'Esperando a que el anfitrión empiece…',
    lobbyRules: 'Máx. 4 jugadores · 35 s por tiro · la sala se cierra tras 10 min sin actividad',
    paused: 'Pausa',
    resume: 'Continuar',
    scorecard: 'Tarjeta',
    quit: 'Abandonar partida',
    hole: 'Hoyo',
    par: 'Par',
    total: 'Total',
    you: 'vos',
    host: 'anfitrión',
    kick: 'Sacar',
    offline: 'desconectado',
    turnOf: 'Turno de {n}',
    yourTurn: '¡Tu turno!',
    hintTouch: 'Arrastrá hacia atrás y soltá para tirar',
    hintMouse: 'Arrastrá hacia atrás y soltá · ← → apuntar · ↑ ↓ fuerza · espacio tira',
    strokes: '{n} golpes',
    stroke: '1 golpe',
    ace: '¡HOYO EN UNO!',
    albatross: '¡ALBATROS!',
    eagle: '¡ÁGUILA!',
    birdie: '¡BIRDIE!',
    parL: '¡PAR!',
    bogey: 'BOGEY',
    double: 'DOBLE BOGEY',
    over: '+{n}',
    max: 'MÁXIMO DE GOLPES',
    water: '¡AL AGUA!',
    waterSub: '+1 golpe',
    timeout: 'TIEMPO',
    timeoutSub: '+1 golpe',
    finish: '¡Recorrido terminado!',
    won: '¡GANASTE!',
    lost: 'PERDISTE',
    winner: '¡Ganó {n}!',
    tie: '¡Empate!',
    again: 'Jugar de nuevo',
    rematch: 'Revancha',
    waitRematch: 'Esperando revancha…',
    backMenu: 'Menú del juego',
    leave: 'Salir de la sala',
    next: 'Siguiente hoyo…',
    close: 'Cerrar',
    copied: '¡Link copiado!',
    connecting: 'Conectando…',
    reconnecting: 'Reconectando…',
    netError: 'No se pudo conectar al servidor. Probá más tarde.',
    rate: 'Demasiados mensajes: esperá un momento.',
    err_not_found: 'No existe una sala con ese código.',
    err_room_full: 'La sala está llena (máx. 4).',
    err_in_progress: 'La partida ya empezó.',
    err_server_full: 'El servidor está lleno, probá en un rato.',
    err_too_many_rooms: 'Creaste demasiadas salas. Esperá unos minutos.',
    err_too_many_joins: 'Demasiados intentos. Esperá un minuto.',
    err_not_host: 'Solo el anfitrión puede hacer eso.',
    closed_idle: 'La sala se cerró por inactividad.',
    closed_max_life: 'La sala alcanzó su tiempo máximo.',
    closed_empty: 'La sala se cerró.',
    kicked: 'El anfitrión te sacó de la sala.',
    joinFromLink: 'Poné tu nombre y tocá Unirse',
    enterCode: 'Escribí un código de 5 letras',
    rel: '{n} vs par',
  },
  en: {
    tagline: 'Putts, bounces and crazy obstacles',
    practice: 'Practice',
    practiceSub: 'Solo, at your own pace',
    local: 'Local',
    localSub: '2 to 4 players taking turns',
    online: 'Online',
    onlineSub: 'Create a room and share the code',
    course: 'Course (holes)',
    play: "Let's play!",
    oneHole: 'Or practice one hole',
    players: 'Players',
    yourName: 'Your name',
    createRoom: 'Create room',
    or: 'or',
    roomCode: 'Room code',
    join: 'Join',
    lobby: 'Room',
    shareCode: 'Share this code',
    copyLink: 'Copy link',
    start: 'Start match',
    waitingHost: 'Waiting for the host to start…',
    lobbyRules: 'Max 4 players · 35 s per shot · room closes after 10 min idle',
    paused: 'Paused',
    resume: 'Resume',
    scorecard: 'Scorecard',
    quit: 'Quit match',
    hole: 'Hole',
    par: 'Par',
    total: 'Total',
    you: 'you',
    host: 'host',
    kick: 'Kick',
    offline: 'offline',
    turnOf: "{n}'s turn",
    yourTurn: 'Your turn!',
    hintTouch: 'Drag back and release to shoot',
    hintMouse: 'Drag back and release · ← → aim · ↑ ↓ power · space shoots',
    strokes: '{n} strokes',
    stroke: '1 stroke',
    ace: 'HOLE IN ONE!',
    albatross: 'ALBATROSS!',
    eagle: 'EAGLE!',
    birdie: 'BIRDIE!',
    parL: 'PAR!',
    bogey: 'BOGEY',
    double: 'DOUBLE BOGEY',
    over: '+{n}',
    max: 'MAX STROKES',
    water: 'SPLASH!',
    waterSub: '+1 stroke',
    timeout: 'TIME UP',
    timeoutSub: '+1 stroke',
    finish: 'Course complete!',
    won: 'YOU WIN!',
    lost: 'YOU LOSE',
    winner: '{n} wins!',
    tie: "It's a tie!",
    again: 'Play again',
    rematch: 'Rematch',
    waitRematch: 'Waiting for rematch…',
    backMenu: 'Game menu',
    leave: 'Leave room',
    next: 'Next hole…',
    close: 'Close',
    copied: 'Link copied!',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    netError: 'Could not reach the server. Try again later.',
    rate: 'Too many messages: wait a moment.',
    err_not_found: 'No room with that code.',
    err_room_full: 'The room is full (max 4).',
    err_in_progress: 'The match already started.',
    err_server_full: 'Server is full, try again soon.',
    err_too_many_rooms: 'Too many rooms created. Wait a few minutes.',
    err_too_many_joins: 'Too many attempts. Wait a minute.',
    err_not_host: 'Only the host can do that.',
    closed_idle: 'Room closed due to inactivity.',
    closed_max_life: 'Room reached its maximum time.',
    closed_empty: 'The room was closed.',
    kicked: 'The host removed you from the room.',
    joinFromLink: 'Enter your name and tap Join',
    enterCode: 'Type a 5-letter code',
    rel: '{n} vs par',
  },
};
const t = (k, v) => {
  let s = TXT[G.prefs.lang]?.[k] ?? TXT.es[k] ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const pick = (o) => (typeof o === 'string' ? o : o[G.prefs.lang] || o.es);
const relStr = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ================= estado =================
const R = new Renderer($('game'), $('fx'));
const S = {
  mode: null, // practice | local | online
  config: null, // para "jugar de nuevo"
  match: null,
  myId: null,
  room: null,
  holeShown: -1,
  holeBase: performance.now(),
  pausedAt: 0,
  paused: false,
  anim: null,
  pushes: new Map(), // pelotas empujadas por obstáculos móviles (se animan a la vez que el tiro)
  pushCheck: 0, // hasta qué tiempo del hoyo ya se revisó que nadie toque las pelotas quietas
  busy: false,
  waitingShot: false,
  disp: new Map(), // posiciones visibles de las pelotas
  fxBall: new Map(), // { hidden, scale }
  trail: new Map(),
  aim: null,
  kb: null,
  deadlineAt: 0,
  seq: Promise.resolve(),
};
const run = (fn) => (S.seq = S.seq.then(fn).catch((e) => console.error(e)));
const wait = (ms) => new Promise((r) => setTimeout(r, G.prefs.reducedMotion ? Math.min(ms, 300) : ms));
const holeT = () => ((S.paused ? S.pausedAt : performance.now()) - S.holeBase) / 1000;

// ================= pantallas =================
function show(name, dim = false) {
  $$('.screen').forEach((s) => {
    const on = s.dataset.screen === name;
    s.classList.toggle('on', on);
    s.classList.toggle('dim', on && dim);
  });
  const inGame = !name || dim;
  // anuncios (portal): banner aparte en menús, pausa y tarjeta final; nunca entre hoyos ni jugando
  G.gameplay(!name || (name === 'card' && !S.cardFinal));
  $('hud').hidden = !S.match || !inGame;
  $('players').hidden = !S.match || !inGame;
  if (name) $('hint').hidden = true;
  $('power').hidden = true;
}
const current = () => $$('.screen.on')[0]?.dataset.screen || null;

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

function translate() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('hole-grid').innerHTML = HOLES.map(
    (h, i) => `<button data-hole="${i}"><b>${i + 1}</b><small>${esc(pick(h.name))}</small></button>`,
  ).join('');
  renderLocalNames();
}

function segValue(name) {
  return Number($$(`.seg[data-name="${name}"] button.on`)[0]?.dataset.v);
}

document.addEventListener('click', (e) => {
  const seg = e.target.closest('.seg button');
  if (seg) {
    $$('button', seg.parentElement).forEach((b) => b.classList.toggle('on', b === seg));
    A.S.click();
    if (seg.parentElement.dataset.name === 'l-count') renderLocalNames();
  }
  const go = e.target.closest('[data-go]');
  if (go) {
    A.ensure();
    A.S.click();
    show(go.dataset.go);
    if (go.dataset.go === 'online') $('on-name').value ||= defaultName();
  }
});

// ================= práctica / local =================
function defaultName() {
  try {
    const s = sessionStorage.getItem('minigolf:name');
    if (s) return s;
  } catch {}
  return (G.prefs.lang === 'es' ? 'Jugador ' : 'Player ') + (10 + Math.floor(Math.random() * 89));
}

function renderLocalNames() {
  const n = segValue('l-count') || 2;
  const box = $('local-names');
  const prev = $$('input', box).map((i) => i.value);
  box.innerHTML = Array.from(
    { length: n },
    (_, i) => `<div class="name-row" style="--pc:${COLORS[i]}"><i></i><input class="field" maxlength="16" value="${esc(prev[i] || `${G.prefs.lang === 'es' ? 'Jugador' : 'Player'} ${i + 1}`)}"></div>`,
  ).join('');
}

$('practice-start').onclick = () => startLocal({ mode: 'practice', course: COURSES[segValue('p-holes')], players: [{ id: 'p1', name: t('you') }] });
$('hole-grid').onclick = (e) => {
  const b = e.target.closest('[data-hole]');
  if (b) startLocal({ mode: 'practice', course: [Number(b.dataset.hole)], players: [{ id: 'p1', name: t('you') }] });
};
$('local-start').onclick = () =>
  startLocal({
    mode: 'local',
    course: COURSES[segValue('l-holes')],
    players: $$('#local-names input').map((inp, i) => ({ id: `p${i + 1}`, name: inp.value.trim().slice(0, 16) || `P${i + 1}` })),
  });

function startLocal(cfg) {
  A.ensure();
  S.mode = cfg.mode;
  S.config = cfg;
  S.myId = null;
  S.match = new Match({ course: cfg.course, players: cfg.players });
  S.disp.clear();
  S.holeShown = -1;
  S.match.nextHole();
  show(null);
  run(() => enterHole());
}

/** "Servidor" local: aplica el tiro con las mismas reglas que el online. */
function localShot(angle, power) {
  const m = S.match;
  const id = m.turn;
  const p = m.player(id);
  const res = simulate(m.hole, p.ball, angle, power, holeT());
  const outcome = m.applyShot(id, res);
  run(() => playShot(id, res));
  if (outcome) run(() => showOutcome(outcome));
  run(async () => {
    if (m.state === 'between') {
      showCard(false);
      await wait(3200);
      if (S.match !== m) return;
      m.nextHole();
      await enterHole();
    } else if (m.state === 'finished') {
      await wait(600);
      finish(m.standings());
    } else updateHud();
  });
}

// ================= online =================
const net = new Net(onNet, (st) => {
  const map = { connecting: 'connecting', reconnecting: 'reconnecting', error: 'netError', rate: 'rate' };
  if (map[st]) setStatus(t(map[st]), st === 'connecting' || st === 'reconnecting');
  if (st === 'open') setStatus('');
  if (st === 'reconnecting' && S.mode === 'online' && S.match) toast(t('reconnecting'));
});

function setStatus(msg, ok = false) {
  for (const id of ['on-status']) {
    $(id).textContent = msg;
    $(id).classList.toggle('ok', ok);
  }
}

const saveName = (n) => {
  try {
    sessionStorage.setItem('minigolf:name', n);
  } catch {}
};

$('on-create').onclick = () => {
  A.ensure();
  const name = $('on-name').value.trim() || defaultName();
  saveName(name);
  net.session = null;
  net.send({ t: 'create', name });
};
$('on-join').onclick = () => {
  A.ensure();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return setStatus(t('enterCode'));
  const name = $('on-name').value.trim() || defaultName();
  saveName(name);
  net.session = null;
  net.send({ t: 'join', code, name });
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('on-code').addEventListener('keydown', (e) => e.key === 'Enter' && $('on-join').click());
$('lobby-leave').onclick = () => leaveOnline();
$('lobby-start').onclick = () => net.send({ t: 'start', holes: segValue('o-holes') });
$('lobby-copy').onclick = async () => {
  const url = `${location.origin}/#play/minigolf?room=${S.room.code}`;
  try {
    if (navigator.share && G.prefs.touch) await navigator.share({ title: 'Mini Golf · game.it', text: S.room.code, url });
    else {
      await navigator.clipboard.writeText(url);
      toast(t('copied'));
    }
  } catch {
    toast(S.room.code);
  }
};
$('lobby-players').onclick = (e) => {
  const k = e.target.closest('[data-kick]');
  if (k) net.send({ t: 'kick', id: k.dataset.kick });
};

function leaveOnline() {
  net.close();
  S.room = null;
  S.match = null;
  S.mode = null;
  R.confetti = [];
  show('online');
}

function onNet(msg) {
  switch (msg.t) {
    case 'joined':
      S.myId = msg.id;
      S.mode = 'online';
      net.session = { code: msg.code, token: msg.token, name: $('on-name').value };
      break;
    case 'room':
      run(() => applyRoom(msg.room));
      break;
    case 'shot':
      S.waitingShot = false;
      run(() => playShot(msg.id, msg.res));
      break;
    case 'push':
      if (S.match && msg.hole === S.match.holeIdx) startPush(msg.id, msg.res);
      break;
    case 'outcome':
      run(() => showOutcome(msg));
      break;
    case 'timeout':
      run(() => {
        if (msg.id === S.myId) banner(t('timeout'), t('timeoutSub'), '#ff5a5f', true);
        else toast(`${S.match?.player(msg.id)?.name ?? ''}: ${t('timeout')}`);
        A.S.meh();
      });
      break;
    case 'end':
      run(() => finish(msg.standings));
      break;
    case 'error':
      S.waitingShot = false;
      if (msg.code === 'not_found' || msg.code === 'in_progress') net.session = null;
      if (t(`err_${msg.code}`) !== `err_${msg.code}`) {
        setStatus(t(`err_${msg.code}`));
        if (S.match) toast(t(`err_${msg.code}`));
      }
      if (msg.code === 'not_found' && current() !== 'online') leaveOnline();
      break;
    case 'closed':
      toast(t(`closed_${msg.reason}`) || t('closed_empty'));
      leaveOnline();
      break;
    case 'kicked':
      toast(t('kicked'));
      leaveOnline();
      break;
  }
}

async function applyRoom(room) {
  if (S.mode !== 'online') return;
  S.room = room;
  if (room.state === 'lobby') {
    S.match = null;
    S.holeShown = -1;
    R.confetti = [];
    renderLobby();
    if (current() !== 'lobby') show('lobby');
    return;
  }
  if (!room.match) return;
  const prevIdx = S.match?.holeIdx;
  S.match = Match.from(room.match);
  S.deadlineAt = room.turnDeadline > 0 ? performance.now() + room.turnDeadline : 0;
  if (room.state === 'playing' && S.match.holeIdx !== S.holeShown) {
    S.holeBase = performance.now() - room.holeTime * 1000;
    S.disp.clear();
    if (prevIdx !== S.match.holeIdx || S.holeShown === -1) {
      show(null);
      await enterHole();
    }
  }
  if (room.state === 'playing' && ['lobby', 'online'].includes(current())) show(null);
  if (S.match.state === 'between' && current() !== 'card') showCard(false);
  updateHud();
}

function renderLobby() {
  const r = S.room;
  const isHost = r.host === S.myId;
  $('lobby-code').textContent = r.code;
  $('lobby-count').textContent = `${r.players.length}/4`;
  const rows = r.players.map(
    (p) => `<li style="--pc:${p.color}"><i></i><span>${esc(p.name)}</span>
      <small>${[p.id === S.myId ? t('you') : '', p.id === r.host ? t('host') : '', p.connected ? '' : t('offline')].filter(Boolean).join(' · ')}</small>
      ${isHost && p.id !== S.myId ? `<button class="chip-btn" data-kick="${p.id}">${t('kick')}</button>` : ''}</li>`,
  );
  for (let i = r.players.length; i < 4; i++) rows.push(`<li class="empty"><i style="--pc:transparent"></i><span>—</span></li>`);
  $('lobby-players').innerHTML = rows.join('');
  $('lobby-host').hidden = !isHost;
  $('lobby-wait').hidden = isHost;
  $$('.seg[data-name="o-holes"] button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === r.holes));
}

// ================= flujo del hoyo =================
async function enterHole() {
  const m = S.match;
  S.holeShown = m.holeIdx;
  if (S.mode !== 'online') S.holeBase = performance.now();
  R.setHole(m.hole);
  S.pushes.clear();
  S.pushCheck = 0;
  for (const p of m.players) S.disp.set(p.id, { ...p.ball });
  S.fxBall.clear();
  S.trail.clear();
  $('hud').hidden = false;
  $('players').hidden = false;
  if (current() === 'card') show(null);
  updateHud();
  // presentación del hoyo
  const intro = $('intro');
  intro.querySelector('small').textContent = `${t('hole')} ${m.holeIdx + 1}/${m.course.length}`;
  intro.querySelector('b').textContent = pick(m.hole.name);
  intro.querySelector('em').textContent = `${t('par')} ${m.hole.par}`;
  intro.classList.remove('show');
  void intro.offsetWidth;
  intro.classList.add('show');
  S.busy = true;
  await wait(1600);
  S.busy = false;
  updateHud();
}

function playShot(id, res) {
  return new Promise((resolve) => {
    const from = S.disp.get(id) || { ...res };
    if (S.mode === 'online') S.holeBase = performance.now() - res.t0 * 1000;
    S.busy = true;
    S.aim = null;
    const p0 = Math.min(1, Math.hypot(res.path[2] - res.path[0], res.path[3] - res.path[1]) / 30);
    A.S.putt(p0);
    S.anim = { id, res, start: performance.now(), dur: shotDuration(res), next: 0, resolve, from };
    S.trail.set(id, []);
    S.fxBall.set(id, { hidden: false, scale: 1 });
  });
}

function stepAnim(now) {
  if (S.anim && advance(S.anim, now)) S.anim = null;
  for (const [id, a] of S.pushes) if (advance(a, now)) S.pushes.delete(id);
}

/** Avanza la animación de un tiro o de un empujón. Devuelve true cuando terminó. */
function advance(a, now) {
  if (now < a.start) return false; // empujón programado para dentro de un momento
  const { res } = a;
  const n = res.path.length / 2;
  const f = Math.min(n - 1, ((now - a.start) / 1000) * SAMPLE_HZ);
  const i = Math.floor(f);
  const k = f - i;
  const j = Math.min(n - 1, i + 1);
  const x = res.path[i * 2] + (res.path[j * 2] - res.path[i * 2]) * k;
  const y = res.path[i * 2 + 1] + (res.path[j * 2 + 1] - res.path[i * 2 + 1]) * k;
  let fb = S.fxBall.get(a.id);
  if (!fb) S.fxBall.set(a.id, (fb = { hidden: false, scale: 1 }));
  if (!fb.hidden) S.disp.set(a.id, { x, y });
  let tr = S.trail.get(a.id);
  if (!tr) S.trail.set(a.id, (tr = []));
  tr.push([x, y]);
  if (tr.length > 14) tr.shift();

  // eventos que ya pasaron
  while (a.next < res.events.length && res.events[a.next].i <= f + 0.01) {
    const e = res.events[a.next++];
    const pos = S.disp.get(a.id);
    switch (e.type) {
      case 'wall':
        A.S.wall(e.v);
        if (e.v > 500) R.shake = 0.6;
        break;
      case 'bumper':
        A.S.bumper();
        R.bumperHit.set(e.b, now);
        R.shake = 0.4;
        break;
      case 'mover':
        A.S.mover();
        R.moverHit.set(e.m, now);
        break;
      case 'sand':
        A.S.sand();
        R.burst(pos.x, pos.y, 'sand');
        break;
      case 'portal':
        A.S.portal();
        R.burst(pos.x, pos.y, 'sparkle');
        break;
      case 'boost':
        A.S.boost();
        break;
      case 'water':
        A.S.water();
        R.burst(e.x, e.y, 'splash');
        fb.hidden = true;
        break;
      case 'hole':
        A.S.cup();
        R.flagJump = now + 600;
        R.burst(res.x, res.y, 'sparkle');
        fb.sinkAt = now;
        break;
    }
  }
  if (fb.sinkAt) fb.scale = Math.max(0, 1 - (now - fb.sinkAt) / 280);

  if (now - a.start >= a.dur) {
    S.trail.set(a.id, []);
    const done = async () => {
      if (res.water) {
        if (!res.push) banner(t('water'), t('waterSub'), '#3ec1ff', true);
        await wait(700);
        S.disp.set(a.id, { x: res.x, y: res.y });
        fb.hidden = false;
        fb.popAt = performance.now();
      } else S.disp.set(a.id, { x: res.x, y: res.y });
      if (res.push) return updateHud();
      await wait(res.holed ? 350 : 150);
      S.busy = false;
      updateHud();
      a.resolve();
    };
    done();
    return true;
  }
  return false;
}

/** Un obstáculo móvil empujó una pelota: se anima a partir del momento del contacto. */
function startPush(id, res) {
  const lag = (res.t0 - holeT()) * 1000;
  S.pushes.set(id, { id, res, start: performance.now() + lag, dur: shotDuration(res), next: 0 });
  S.fxBall.set(id, { hidden: false, scale: 1 });
}

/** Sin conexión: los obstáculos empujan las pelotas quietas (en cualquier turno). */
function localPushes() {
  const m = S.match;
  if (S.mode === 'online' || !m || m.state !== 'playing' || S.paused || !m.hole.movers.length) return;
  const t1 = holeT();
  const t0 = Math.min(S.pushCheck, t1);
  S.pushCheck = t1;
  for (const p of m.players) {
    if (p.done || p.active === false || S.anim?.id === p.id || S.pushes.has(p.id)) continue;
    const tc = findContact(m.hole, p.ball, t0, t1);
    if (tc < 0) continue;
    const res = simulatePush(m.hole, p.ball, tc);
    const outcome = m.applyPush(p.id, res);
    startPush(p.id, res);
    if (outcome) {
      run(() => showOutcome(outcome));
      run(async () => {
        if (S.match !== m) return;
        if (m.state === 'between') {
          showCard(false);
          await wait(3200);
          if (S.match !== m) return;
          m.nextHole();
          await enterHole();
        } else if (m.state === 'finished') {
          await wait(600);
          finish(m.standings());
        } else updateHud();
      });
    }
  }
}

function showOutcome(o) {
  const m = S.match;
  const p = m?.player(o.id);
  const multi = m && m.players.length > 1;
  const who = multi && p ? `${p.name} · ` : '';
  const sub = who + (o.strokes === 1 ? t('stroke') : t('strokes', { n: o.strokes }));
  const L = o.label;
  const txt = { ace: t('ace'), albatross: t('albatross'), eagle: t('eagle'), birdie: t('birdie'), par: t('parL'), bogey: t('bogey'), double: t('double'), max: t('max'), over: t('over', { n: o.rel }) }[L];
  const good = ['ace', 'albatross', 'eagle', 'birdie'].includes(L);
  const sad = ['double', 'over', 'max'].includes(L);
  const color = L === 'ace' ? '#ffc93c' : good ? '#7bd389' : L === 'par' ? '#3ec1ff' : L === 'bogey' ? '#ff9f5a' : '#ff5a5f';
  banner(txt, sub, color, sad);
  if (L === 'ace') {
    R.celebrate(220);
    A.S.great();
  } else if (good) {
    R.celebrate(L === 'birdie' ? 90 : 160);
    A.S.great();
  } else if (L === 'par') A.S.good();
  else if (L === 'bogey') A.S.meh();
  else A.S.bad();
  updateHud();
  return wait(900);
}

function banner(text, sub, color, sad = false) {
  const b = $('banner');
  b.querySelector('b').textContent = text;
  b.querySelector('small').textContent = sub || '';
  b.style.setProperty('--bc', color);
  b.classList.remove('show', 'sad');
  void b.offsetWidth;
  b.classList.toggle('sad', sad);
  b.classList.add('show');
}

// ================= HUD =================
function canAim() {
  const m = S.match;
  if (!m || S.busy || S.anim || S.paused || current() || m.state !== 'playing' || !m.turn || S.waitingShot || S.pushes.has(m.turn)) return false;
  return S.mode === 'online' ? m.turn === S.myId : true;
}

function updateHud() {
  const m = S.match;
  if (!m || m.holeIdx < 0) return;
  $('hud-hole').textContent = `${m.holeIdx + 1}/${m.course.length}`;
  $('hud-name').textContent = pick(m.hole.name);
  $('hud-par').textContent = `${t('par')} ${m.hole.par}`;
  $('players').innerHTML = m.players
    .map((p) => {
      const total = p.scores.reduce((s, v) => s + v, 0);
      const rel = total - m.parTotal(p.scores.length);
      const cls = [p.id === m.turn ? 'turn' : '', p.done ? 'done' : '', p.active === false ? 'off' : ''].join(' ');
      const nm = S.mode === 'practice' ? t('hole') + ' ' + (m.holeIdx + 1) : p.name + (p.id === S.myId ? ` (${t('you')})` : '');
      return `<div class="pchip ${cls}" style="--pc:${p.color}" data-id="${p.id}"><span class="dot"></span><span class="nm">${esc(nm)}</span>
        <span class="st">${p.strokes}${p.scores.length ? ` · ${relStr(rel)}` : ''}</span>${p.id === m.turn && S.mode === 'online' ? '<i class="timer"></i>' : ''}</div>`;
    })
    .join('');
  const hint = $('hint');
  let msg = '';
  if (m.state === 'playing' && !S.busy && !current()) {
    if (S.mode === 'online' && m.turn !== S.myId) msg = t('turnOf', { n: m.player(m.turn)?.name ?? '' });
    else if (S.mode === 'local') msg = `${t('turnOf', { n: m.player(m.turn)?.name ?? '' })} · ${G.prefs.touch ? t('hintTouch') : t('hintMouse')}`;
    else msg = G.prefs.touch ? t('hintTouch') : t('hintMouse');
  }
  hint.hidden = !msg;
  if (hint.textContent !== msg) hint.textContent = msg;
}

// ================= tarjeta y final =================
function scoreTable(m) {
  const cols = m.course.map((hi, i) => `<th>${i + 1}</th>`).join('');
  const parRow = m.course.map((hi) => `<td>${HOLES[hi].par}</td>`).join('');
  const rows = m.players
    .map((p) => {
      const cells = m.course
        .map((hi, i) => {
          const v = p.scores[i];
          if (v == null) return `<td class="${i === m.holeIdx ? 'cur' : ''}">${i === m.holeIdx && p.strokes ? p.strokes : '·'}</td>`;
          const rel = v - HOLES[hi].par;
          const cls = v === 1 ? 'ace' : rel < 0 ? 'under' : rel > 0 ? 'over' : '';
          return `<td class="${i === m.holeIdx ? 'cur' : ''}"><span class="b ${cls}">${v}</span></td>`;
        })
        .join('');
      const total = p.scores.reduce((s, v) => s + v, 0);
      return `<tr><td><span style="color:${p.color}">●</span> ${esc(p.name)}</td>${cells}<td class="tot">${total} <small>(${relStr(total - m.parTotal(p.scores.length))})</small></td></tr>`;
    })
    .join('');
  return `<thead><tr><th>${t('hole')}</th>${cols}<th>${t('total')}</th></tr></thead><tbody><tr class="par"><td>${t('par')}</td>${parRow}<td>${m.parTotal()}</td></tr>${rows}</tbody>`;
}

function showCard(final, standings) {
  const m = S.match;
  S.cardFinal = !!final;
  $('score-table').innerHTML = scoreTable(m);
  $('podium').innerHTML = '';
  const act = $('card-actions');
  if (!final) {
    $('card-title').textContent = m.state === 'between' ? t('next') : t('scorecard');
    act.innerHTML = m.state === 'between' ? '' : `<button class="cta" data-card="close">${t('close')}</button>`;
    show('card', true);
    return;
  }
  // podio
  if (standings.length > 1) {
    const order = [standings[1], standings[0], standings[2]].filter(Boolean);
    $('podium').innerHTML = order
      .map((s) => {
        const rank = standings.indexOf(s) + 1;
        return `<div style="--pc:${s.color}"><b>${esc(s.name)}</b><small>${s.total} (${relStr(s.rel)})</small><i style="height:${[0, 96, 70, 50][rank]}px">${rank}</i></div>`;
      })
      .join('');
  }
  const btns = [];
  if (S.mode === 'online') {
    if (S.room?.host === S.myId) btns.push(`<button class="cta" data-card="rematch">${t('rematch')}</button>`);
    else btns.push(`<button class="ghost" disabled>${t('waitRematch')}</button>`);
    btns.push(`<button class="ghost" data-card="leave">${t('leave')}</button>`);
  } else {
    btns.push(`<button class="cta" data-card="again">${t('again')}</button>`, `<button class="ghost" data-card="menu">${t('backMenu')}</button>`);
  }
  act.innerHTML = btns.join('');
  show('card', true);
}

$('card-actions').onclick = (e) => {
  const a = e.target.closest('[data-card]')?.dataset.card;
  A.S.click();
  if (a === 'close') show(null);
  else if (a === 'again') G.commercialBreak('otra-vez').then(() => startLocal(S.config)); // pausa natural
  else if (a === 'menu') quitToMenu();
  else if (a === 'rematch') net.send({ t: 'rematch' });
  else if (a === 'leave') leaveOnline();
};

function finish(standings) {
  const m = S.match;
  if (!m) return;
  const top = standings[0];
  const tie = standings.length > 1 && standings[1].total === top.total && standings[1].active;
  let title;
  let win = true;
  if (S.mode === 'practice') {
    title = `${t('finish')} ${relStr(top.rel)}`;
    win = top.rel <= 0;
  } else if (tie) title = t('tie');
  else if (S.mode === 'online') {
    win = top.id === S.myId;
    title = win ? t('won') : `${t('lost')} · ${t('winner', { n: top.name })}`;
  } else title = t('winner', { n: top.name });
  $('card-title').textContent = title;
  showCard(true, standings);
  if (win) {
    R.celebrate(260);
    A.S.win();
    banner(S.mode === 'online' ? t('won') : S.mode === 'practice' ? relStr(top.rel) : t('winner', { n: top.name }), '', '#ffc93c');
  } else {
    A.S.lose();
    banner(t('lost'), '', '#ff5a5f', true);
  }
}

function quitToMenu() {
  if (S.mode === 'online') return leaveOnline();
  S.match = null;
  S.mode = null;
  S.anim = null;
  S.pushes.clear();
  S.busy = false;
  S.seq = Promise.resolve();
  R.confetti = [];
  show('home');
}

// ================= pausa =================
$('btn-pause').onclick = () => {
  A.S.click();
  openPause();
};
function openPause() {
  if (!S.match || current()) return;
  setPaused(true);
  show('pause', true);
}
$$('[data-action]').forEach(
  (b) =>
    (b.onclick = () => {
      const a = b.dataset.action;
      A.S.click();
      if (a === 'resume') {
        show(null);
        setPaused(false);
        updateHud();
      } else if (a === 'card') {
        setPaused(false);
        showCard(false);
      } else if (a === 'quit') {
        setPaused(false);
        quitToMenu();
      }
    }),
);

function setPaused(v) {
  // en online el tiempo del hoyo lo maneja el servidor: no se congela
  if (S.mode === 'online') return;
  if (v && !S.paused) {
    S.paused = true;
    S.pausedAt = performance.now();
  } else if (!v && S.paused) {
    S.paused = false;
    S.holeBase += performance.now() - S.pausedAt;
  }
}

// ================= entrada =================
const canvas = $('game');
canvas.addEventListener('pointerdown', (e) => {
  A.ensure();
  if (!canAim()) return;
  canvas.setPointerCapture(e.pointerId);
  S.aim = { sx: e.clientX, sy: e.clientY, angle: 0, power: 0 };
  S.kb = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!S.aim) return;
  const dx = S.aim.sx - e.clientX;
  const dy = S.aim.sy - e.clientY;
  const v = R.dragToWorld(dx, dy);
  const maxDrag = Math.min(220, Math.min(innerWidth, innerHeight) * 0.38);
  S.aim.angle = Math.atan2(v.y, v.x);
  const p = Math.min(1, Math.hypot(dx, dy) / maxDrag);
  if (Math.floor(p * 10) !== Math.floor(S.aim.power * 10)) A.S.tick();
  S.aim.power = p;
});
const release = () => {
  if (!S.aim) return;
  const { angle, power } = S.aim;
  S.aim = null;
  if (power > 0.04 && canAim()) shoot(angle, power);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', () => (S.aim = null));

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape' || e.code === 'KeyP') {
    if (current() === 'pause') $$('[data-action="resume"]')[0].click();
    else openPause();
    return;
  }
  if (!canAim()) return;
  const d = G.dir(e);
  if (!d && e.code !== 'Space' && e.key !== 'Enter') return;
  e.preventDefault();
  if (!S.kb) {
    const m = S.match;
    const b = m.player(m.turn).ball;
    S.kb = { angle: Math.atan2(m.hole.cup[1] - b.y, m.hole.cup[0] - b.x), power: 0.5 };
  }
  const rot = R.view.rot ? -1 : 1;
  if (d === 'left') S.kb.angle -= 0.05 * rot;
  if (d === 'right') S.kb.angle += 0.05 * rot;
  if (d === 'up') S.kb.power = Math.min(1, S.kb.power + 0.04);
  if (d === 'down') S.kb.power = Math.max(0.05, S.kb.power - 0.04);
  if (e.code === 'Space' || e.key === 'Enter') {
    const { angle, power } = S.kb;
    S.kb = null;
    shoot(angle, power);
  }
});

function shoot(angle, power) {
  $('hint').hidden = true;
  $('power').hidden = true;
  if (S.mode === 'online') {
    S.waitingShot = true;
    net.send({ t: 'shot', a: Number(angle.toFixed(4)), p: Number(power.toFixed(3)) });
    setTimeout(() => (S.waitingShot = false), 4000);
  } else localShot(angle, power);
}

// ================= bucle =================
function frame(now) {
  requestAnimationFrame(frame);
  const m = S.match;
  if (!m || m.holeIdx < 0 || !R.hole) {
    // pantalla de inicio: se dibuja el primer hoyo de fondo
    if (!R.hole) R.setHole(HOLES[2]);
    R.frame({ t: now / 1000, now, balls: [], aim: null });
    return;
  }
  localPushes();
  stepAnim(now);
  const balls = m.players
    .filter((p) => p.active !== false && !(p.done && !(S.anim?.id === p.id) && !S.pushes.has(p.id)))
    .map((p) => {
      const pos = S.disp.get(p.id) || p.ball;
      const fb = S.fxBall.get(p.id) || {};
      let scale = fb.scale ?? 1;
      if (fb.popAt) {
        const k = Math.min(1, (now - fb.popAt) / 300);
        scale = k < 1 ? Math.sin(k * Math.PI * 0.5) * 1.15 : 1;
      }
      return { x: pos.x, y: pos.y, color: p.color, turn: p.id === m.turn && !S.busy && !S.anim && !S.pushes.has(p.id), hidden: fb.hidden, scale, trail: S.trail.get(p.id) };
    });
  // la pelota que se está moviendo se dibuja arriba
  balls.sort((a, b) => (a.trail?.length || 0) - (b.trail?.length || 0));
  let aim = null;
  const src = S.aim || S.kb;
  if (src && canAim()) {
    const b = m.player(m.turn).ball;
    aim = { x: b.x, y: b.y, angle: src.angle, power: src.power };
    const pw = $('power');
    pw.hidden = false;
    pw.style.setProperty('--p', src.power.toFixed(3));
    pw.querySelector('span').textContent = `${Math.round(src.power * 100)}%`;
  } else if (!$('power').hidden) $('power').hidden = true;
  R.frame({ t: holeT(), now, balls, aim });

  // barra de tiempo del turno (online)
  if (S.mode === 'online' && S.deadlineAt) {
    const bar = document.querySelector('.pchip.turn .timer');
    if (bar) {
      const left = Math.max(0, S.deadlineAt - performance.now());
      bar.style.width = '100%';
      bar.style.transform = `scaleX(${Math.min(1, left / 35000)})`;
      bar.style.background = left < 8000 ? '#ff5a5f' : '';
    }
  }
}

// ================= arranque =================
function layout() {
  R.insets = {
    top: innerWidth < 520 ? 100 : 66,
    bottom: 84,
    side: innerWidth < 520 ? 10 : 24,
  };
  R.resize();
}

G.onPrefs((p) => {
  R.setTheme(p.theme, p.glow, p.reducedMotion);
  A.volumes();
  translate();
  updateHud();
}, true);
G.onPause(() => {
  A.pause(true);
  setPaused(true);
});
G.onResume(() => {
  A.pause(false);
  if (current() !== 'pause') setPaused(false);
});
addEventListener('resize', layout);
layout();
requestAnimationFrame(frame);

// entrar directo a una sala desde un link compartido (?room=CODE)
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  $('on-code').value = roomParam.toUpperCase().slice(0, 5);
  $('on-name').value = defaultName();
  show('online');
  setStatus(t('joinFromLink'), true);
} else if (net.session?.code) {
  // recarga en medio de una partida online: reconecta
  S.mode = 'online';
  net.connect();
  show('online');
} else show('home');

G.progress(1);
document.fonts.ready.then(() => G.ready());
setTimeout(() => G.ready(), 1500);
if (/[?&]debug\b/.test(location.search)) window.__golf = { S };
