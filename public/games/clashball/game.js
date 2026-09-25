/* Clashball — game.it
 * Fútbol 2D en tiempo real inspirado en HaxBall: mismas físicas, movilidad y mecánica de patada.
 * Modos: vs CPU (1v1 a 4v4 o práctica), 2 jugadores en el mismo teclado y online con salas
 * públicas o privadas, espectadores, bots y chat. Variantes: Clásico, Futsal, Hielo y Caos.
 */
import { TPS } from './shared/match.js';
import { MODES, STADIUMS, resolveStadium } from './shared/stadiums.js';
import { LocalSession, NetSession } from './play.js';
import { Renderer, COLORS } from './render.js';
import * as input from './input.js';
import * as sfx from './audio.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ====================================================================== textos
const TXT = {
  tagline: { es: 'Fútbol a toda velocidad. Mismas físicas del clásico, con salas online, bots y cuatro modos.', en: 'Fast-paced football. The classic physics, with online rooms, bots and four modes.' },
  solo: { es: 'JUGAR VS CPU', en: 'PLAY VS CPU' },
  soloSub: { es: 'De 1 contra 1 a 4 contra 4, o práctica libre', en: 'From 1v1 to 4v4, or free practice' },
  online: { es: 'ONLINE', en: 'ONLINE' },
  onlineSub: { es: 'Salas públicas, juego rápido o con código', en: 'Public rooms, quick play or room code' },
  local: { es: '2 JUGADORES', en: '2 PLAYERS' },
  localSub: { es: 'En el mismo teclado, contra o juntos', en: 'Same keyboard, versus or co-op' },
  help: { es: 'CÓMO SE JUEGA', en: 'HOW TO PLAY' },
  helpSub: { es: 'Controles, patada y modos', en: 'Controls, kicking and modes' },
  edit: { es: 'cambiar', en: 'edit' },
  profile: { es: 'Tu jugador', en: 'Your player' },
  name: { es: 'Nombre', en: 'Name' },
  avatar: { es: 'Avatar (1-2 caracteres)', en: 'Avatar (1-2 characters)' },
  avatarNote: { es: 'Se ve dentro de tu disco: un número, iniciales o un emoji.', en: 'Shown inside your disc: a number, initials or an emoji.' },
  save: { es: 'GUARDAR', en: 'SAVE' },
  back: { es: 'VOLVER', en: 'BACK' },
  mode: { es: 'Modo', en: 'Mode' },
  format: { es: 'Formato', en: 'Format' },
  teams: { es: 'Equipos', en: 'Teams' },
  level: { es: 'Dificultad CPU', en: 'CPU level' },
  stadium: { es: 'Estadio', en: 'Stadium' },
  goals: { es: 'Goles para ganar', en: 'Goals to win' },
  time: { es: 'Tiempo (min)', en: 'Time (min)' },
  play: { es: 'JUGAR', en: 'PLAY' },
  quick: { es: 'JUEGO RÁPIDO', en: 'QUICK PLAY' },
  create: { es: 'CREAR SALA', en: 'CREATE ROOM' },
  createGo: { es: 'CREAR', en: 'CREATE' },
  join: { es: 'UNIRSE', en: 'JOIN' },
  public: { es: 'Pública (aparece en la lista)', en: 'Public (listed)' },
  rooms: { es: 'Salas públicas', en: 'Public rooms' },
  refresh: { es: 'actualizar', en: 'refresh' },
  noRooms: { es: 'No hay salas abiertas. Creá una o usá Juego rápido.', en: 'No open rooms. Create one or use Quick play.' },
  loadingRooms: { es: 'Buscando salas…', en: 'Looking for rooms…' },
  red: { es: 'ROJO', en: 'RED' },
  tagRed: { es: 'ROJ', en: 'RED' },
  tagBlue: { es: 'AZU', en: 'BLU' },
  blue: { es: 'AZUL', en: 'BLUE' },
  specs: { es: 'ESPECTADORES', en: 'SPECTATORS' },
  joinTeam: { es: 'unirme', en: 'join' },
  lock: { es: 'Equipos bloqueados', en: 'Lock teams' },
  shuffle: { es: 'MEZCLAR', en: 'SHUFFLE' },
  stop: { es: 'DETENER', en: 'STOP' },
  pauseBtn: { es: 'PAUSAR', en: 'PAUSE' },
  unpauseBtn: { es: 'REANUDAR', en: 'RESUME' },
  backToGame: { es: 'VOLVER AL PARTIDO', en: 'BACK TO MATCH' },
  start: { es: 'EMPEZAR', en: 'START' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'CONTINUAR', en: 'RESUME' },
  restart: { es: 'REINICIAR', en: 'RESTART' },
  options: { es: 'OPCIONES', en: 'OPTIONS' },
  quitMatch: { es: 'SALIR AL MENÚ', en: 'QUIT TO MENU' },
  possession: { es: 'posesión', en: 'possession' },
  thGoals: { es: 'Gol', en: 'Gls' },
  thAssists: { es: 'Asist', en: 'Ast' },
  thKicks: { es: 'Pat', en: 'Kck' },
  thTouches: { es: 'Toq', en: 'Tch' },
  menu: { es: 'MENÚ', en: 'MENU' },
  kickBtn: { es: 'PATEAR', en: 'KICK' },
  soloTitle: { es: 'Partido vs CPU', en: 'Match vs CPU' },
  localTitle: { es: '2 jugadores', en: '2 players' },
  practice: { es: 'Práctica', en: 'Practice' },
  auto: { es: 'Auto', en: 'Auto' },
  easy: { es: 'Fácil', en: 'Easy' },
  normal: { es: 'Normal', en: 'Normal' },
  hard: { es: 'Difícil', en: 'Hard' },
  vs: { es: 'J1 vs J2', en: 'P1 vs P2' },
  coop: { es: 'J1 + J2 vs CPU', en: 'P1 + P2 vs CPU' },
  inf: { es: '∞', en: '∞' },
  you: { es: 'vos', en: 'you' },
  host: { es: 'anfitrión', en: 'host' },
  goal: { es: '¡GOL!', en: 'GOAL!' },
  ownGoal: { es: 'En contra de {n}', en: 'Own goal by {n}' },
  assist: { es: 'asist. {n}', en: 'assist {n}' },
  redWins: { es: '¡GANÓ ROJO!', en: 'RED WINS!' },
  blueWins: { es: '¡GANÓ AZUL!', en: 'BLUE WINS!' },
  youWin: { es: '¡GANASTE!', en: 'YOU WIN!' },
  youLose: { es: 'PERDISTE', en: 'YOU LOSE' },
  p1Wins: { es: '¡GANÓ J1!', en: 'P1 WINS!' },
  p2Wins: { es: '¡GANÓ J2!', en: 'P2 WINS!' },
  finalScore: { es: 'resultado final', en: 'final score' },
  again: { es: 'REVANCHA', en: 'REMATCH' },
  playAgain: { es: 'JUGAR OTRA VEZ', en: 'PLAY AGAIN' },
  toRoom: { es: 'SALA', en: 'ROOM' },
  kickoff: { es: 'saque', en: 'kick-off' },
  golden: { es: 'gol de oro', en: 'golden goal' },
  pausedHud: { es: 'pausa', en: 'paused' },
  toGoals: { es: 'a {n} goles', en: 'first to {n}' },
  toGoal1: { es: 'a 1 gol', en: 'first to 1' },
  waitingHost: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  needPlayers: { es: 'Poné al menos un jugador o bot en un equipo.', en: 'Put at least one player or bot in a team.' },
  copied: { es: 'Link copiado', en: 'Link copied' },
  joined: { es: '{n} entró a la sala', en: '{n} joined' },
  left: { es: '{n} se fue', en: '{n} left' },
  stoppedBy: { es: '{n} detuvo el partido', en: '{n} stopped the match' },
  pausedBy: { es: '{n} pausó el partido', en: '{n} paused the match' },
  resumedBy: { es: 'Partido reanudado', en: 'Match resumed' },
  roomOf: { es: 'Sala de {n}', en: "{n}'s room" },
  bot: { es: '+ Bot {l}', en: '+ Bot {l}' },
  addBot: { es: '+ bot', en: '+ bot' },
  spectating: { es: 'Estás mirando. Tocá "unirme" en un equipo para jugar.', en: 'You are spectating. Tap "join" on a team to play.' },
  chatHint: { es: 'Enter para chatear', en: 'Enter to chat' },
  inGame: { es: 'en juego', en: 'live' },
  inLobby: { es: 'en sala', en: 'lobby' },
  players: { es: 'jugadores', en: 'players' },
  mvp: { es: 'MVP', en: 'MVP' },
  practiceHint: { es: 'Práctica libre: sin rivales ni límite', en: 'Free practice: no rivals, no limit' },
  kickHintKb: { es: 'Mantené <kbd>X</kbd> / <kbd>Espacio</kbd> para patear', en: 'Hold <kbd>X</kbd> / <kbd>Space</kbd> to kick' },
  keysSolo: { es: '<kbd>↑↓←→</kbd> / <kbd>WASD</kbd> mover · <kbd>X</kbd> <kbd>Espacio</kbd> patear · <kbd>Esc</kbd> pausa', en: '<kbd>↑↓←→</kbd> / <kbd>WASD</kbd> move · <kbd>X</kbd> <kbd>Space</kbd> kick · <kbd>Esc</kbd> pause' },
  keysLocal: { es: 'J1: <kbd>WASD</kbd> + <kbd>Espacio</kbd>/<kbd>C</kbd> · J2: <kbd>↑↓←→</kbd> + <kbd>Enter</kbd>/<kbd>.</kbd>/<kbd>Ctrl der</kbd> · joysticks: 1 y 2', en: 'P1: <kbd>WASD</kbd> + <kbd>Space</kbd>/<kbd>C</kbd> · P2: <kbd>↑↓←→</kbd> + <kbd>Enter</kbd>/<kbd>.</kbd>/<kbd>R-Ctrl</kbd> · gamepads: 1 and 2' },
  keysOnline: { es: '<kbd>Enter</kbd> chat · <kbd>Esc</kbd> sala y equipos · <kbd>P</kbd> pausa (anfitrión)', en: '<kbd>Enter</kbd> chat · <kbd>Esc</kbd> room & teams · <kbd>P</kbd> pause (host)' },
  touchNote: { es: 'Joystick a la izquierda, PATEAR a la derecha (mantenelo apretado).', en: 'Joystick on the left, KICK on the right (hold it).' },
};
const t = (k, v) => {
  let s = TXT[k] ? G.t(TXT[k]) : k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};

const HELP = [
  {
    h: { es: 'Objetivo', en: 'Goal' },
    p: { es: 'Meté la pelota en el arco rival. Gana quien llega primero a los goles fijados o quien va arriba cuando se termina el tiempo. Si hay empate al final, se juega con gol de oro.', en: 'Put the ball in the other goal. First to the goal limit wins, or whoever leads when time runs out. A draw at the end goes to golden goal.' },
  },
  {
    h: { es: 'Moverse', en: 'Moving' },
    p: { es: 'Flechas o WASD (8 direcciones). Tenés inercia: acelerás y frenás de a poco, igual que en el clásico. Los choques con otros jugadores y la pelota rebotan según la masa.', en: 'Arrows or WASD (8 directions). You have inertia: you speed up and slow down gradually, like the classic. Collisions bounce by mass.' },
  },
  {
    h: { es: 'Patear', en: 'Kicking' },
    p: { es: 'Apretá X, Espacio o el botón PATEAR: tu borde se pone blanco y pateás apenas la pelota te toca. Mientras está armada corrés un poco más lento. Para volver a patear, soltá y apretá de nuevo. Sin patear, podés llevarla empujándola.', en: 'Press X, Space or KICK: your border turns white and you kick as soon as the ball touches you. While armed you move a bit slower. Release and press again to kick again. Without kicking you can dribble by pushing.' },
  },
  {
    h: { es: 'Saque', en: 'Kick-off' },
    p: { es: 'Nadie cruza la mitad hasta que se mueve la pelota, y el equipo que no saca no puede entrar al círculo. Saca el equipo que recibió el gol.', en: 'Nobody crosses halfway until the ball moves, and the defending team cannot enter the circle. The team that conceded kicks off.' },
  },
  {
    h: { es: 'Modos', en: 'Modes' },
    p: { es: 'Clásico: las físicas originales. Futsal: pelota chica y pesada, más control. Hielo: pista de hockey, patinás y cuesta frenar. Caos: tres pelotas a la vez.', en: 'Classic: the original physics. Futsal: small heavy ball, more control. Ice: hockey rink, you slide. Chaos: three balls at once.' },
  },
  {
    h: { es: 'Online', en: 'Online' },
    p: { es: 'Entrá a una sala pública, usá Juego rápido o compartí el código. Podés entrar con el partido empezado como espectador. El anfitrión arma los equipos (también arrastrando), agrega bots, pausa con P y cambia estadio, modo y límites. Enter abre el chat.', en: 'Join a public room, use Quick play or share the code. You can join mid-match as a spectator. The host sets teams (drag and drop too), adds bots, pauses with P and changes stadium, mode and limits. Enter opens chat.' },
  },
];

// ====================================================================== preferencias propias
const store = {
  get(k, d) {
    try {
      const v = JSON.parse(localStorage.getItem('clashball:' + k));
      return v && typeof v === 'object' ? { ...d, ...v } : { ...d };
    } catch {
      return { ...d };
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('clashball:' + k, JSON.stringify(v));
    } catch {}
  },
};
let profile = store.get('profile', { name: '', avatar: '' });
if (!profile.name) profile.name = defaultName();
const SETUP_DEF = { mode: 'classic', size: 2, level: 'normal', stadium: 'auto', score: 3, time: 3, format: 'vs' };
let setup = store.get('setup', SETUP_DEF);
let roomPrefs = store.get('room', { public: true });

const BOT_NAMES = ['Tito', 'Lola', 'Rulo', 'Pipa', 'Nacho', 'Mora', 'Chelo', 'Kiara', 'Dante', 'Uma', 'Beto', 'Ramiro'];
const SCORE_OPTS = [1, 2, 3, 5, 7, 0];
const TIME_OPTS = [0, 2, 3, 5, 7, 10];
const LEVELS = ['easy', 'normal', 'hard'];
const MODE_ICON = {
  classic: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/></svg>',
  futsal: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M12 6v12"/><circle cx="12" cy="12" r="2.5"/></svg>',
  ice: '<svg viewBox="0 0 24 24"><path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/><path d="M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/></svg>',
  chaos: '<svg viewBox="0 0 24 24"><circle cx="7" cy="8" r="3.2"/><circle cx="16.5" cy="7" r="2.6"/><circle cx="13" cy="16" r="3.6"/></svg>',
};

// ====================================================================== estado
const renderer = new Renderer($('cv'));
const S = {
  screen: 's-home',
  history: [],
  kind: null, // 'solo' | 'local' | 'online' | null
  session: null,
  demo: null,
  lastCfg: null,
  chat: [],
  room: null,
  prevPlayers: new Map(),
  ended: null,
};
let net = null;

// ====================================================================== pantallas
function show(id, { push = true } = {}) {
  if (S.screen === id) return;
  if (push && S.screen && id !== 's-home') S.history.push(S.screen);
  if (id === 's-home') S.history = [];
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  S.screen = id;
  refreshChrome();
  if (id === 's-online') requestRooms();
}
function hideScreens() {
  $$('.screen').forEach((s) => s.classList.remove('on'));
  S.screen = null;
  refreshChrome();
}
function back() {
  const prev = S.history.pop() || 's-home';
  show(prev, { push: false });
}
$$('[data-back]').forEach((b) => (b.onclick = () => (sfx.play('ui'), back())));

/** Muestra/oculta HUD, oscurecido, controles táctiles y chat según el momento. */
function refreshChrome() {
  const inMatch = !!S.session;
  const menuOpen = !!S.screen;
  $('shade').classList.toggle('on', menuOpen);
  $('hud').hidden = !inMatch;
  const touch = !!G.prefs.touch;
  document.body.classList.toggle('is-touch', touch);
  const playing = S.kind !== 'online' || !!S.session?.inMatch?.();
  $('touch').hidden = !(inMatch && touch && !menuOpen && S.kind !== 'local' && playing);
  $('chat').hidden = !(S.kind === 'online' && inMatch && !menuOpen);
  $('btn-chat').hidden = !(S.kind === 'online' && touch);
  input.setEnabled(inMatch && !menuOpen);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 2200);
}

// ====================================================================== textos y perfil
function applyTexts() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('go-local').hidden = !!G.prefs.touch;
  $('help-body').innerHTML = HELP.map((s) => `<section><h3>${esc(G.t(s.h))}</h3><p>${esc(G.t(s.p))}</p></section>`).join('') + `<section><h3>${esc(G.t({ es: 'Teclas', en: 'Keys' }))}</h3><p class="keys" style="text-align:left">${t('keysSolo')}<br>${t('keysLocal')}<br>${t('keysOnline')}<br>${t('touchNote')}</p></section>`;
  $('on-code').placeholder = G.t({ es: 'CÓDIGO', en: 'CODE' });
  $('chat-in').placeholder = t('chatHint');
  $('room-chat-in').placeholder = G.t({ es: 'Escribí un mensaje…', en: 'Type a message…' });
  renderProfile();
  buildSetup();
  if (S.room) renderRoom(S.room);
}

function renderProfile() {
  for (const [av, nm] of [
    ['me-av', 'me-name'],
    ['on-av', 'on-name'],
  ]) {
    $(av).textContent = profile.avatar;
    $(nm).textContent = profile.name;
  }
}

$$('[data-go]').forEach(
  (b) =>
    (b.onclick = () => {
      sfx.unlock();
      sfx.play('ui');
      const go = b.dataset.go;
      if (go === 'solo' || go === 'local') openSetup(go);
      else if (go === 'online') {
        ensureNet();
        show('s-online');
      } else if (go === 'help') show('s-help');
      else if (go === 'profile') {
        $('pf-name').value = profile.name;
        $('pf-av').value = profile.avatar;
        show('s-profile');
        setTimeout(() => $('pf-name').focus(), 50);
      }
    }),
);
$('pf-save').onclick = () => {
  profile.name = $('pf-name').value.replace(/[<>]/g, '').trim().slice(0, 16) || defaultName();
  profile.avatar = Array.from($('pf-av').value.replace(/\s/g, '')).slice(0, 2).join('');
  store.set('profile', profile);
  renderProfile();
  if (net?.room) net.send({ t: 'avatar', a: profile.avatar });
  sfx.play('ui');
  back();
};

// ====================================================================== configurar (sin conexión)
let setupKind = 'solo';
function segHtml(opts, cur) {
  return opts.map(([v, label]) => `<button data-v="${esc(v)}" class="${String(v) === String(cur) ? 'on' : ''}">${esc(label)}</button>`).join('');
}
function buildSetup() {
  const local = setupKind === 'local';
  $('setup-title').textContent = t(local ? 'localTitle' : 'soloTitle');
  $('opt-mode').innerHTML = Object.entries(MODES)
    .map(([id, m]) => `<button class="mode ${id === setup.mode ? 'on' : ''}" data-v="${id}">${MODE_ICON[id]}<b>${esc(G.t(m.name))}</b><small>${esc(G.t(m.desc))}</small></button>`)
    .join('');
  $('opt-format-row').hidden = !local;
  $('opt-format').innerHTML = segHtml(
    [
      ['vs', t('vs')],
      ['coop', t('coop')],
    ],
    setup.format,
  );
  const sizes = local ? (setup.format === 'coop' ? [2, 3, 4] : [1, 2, 3, 4]) : [1, 2, 3, 4, 0];
  if (!sizes.includes(setup.size)) setup.size = sizes[0];
  $('opt-size').innerHTML = segHtml(
    sizes.map((n) => [n, n ? `${n}v${n}` : t('practice')]),
    setup.size,
  );
  const needBots = !(local && setup.format === 'vs' && setup.size === 1) && setup.size !== 0;
  $('opt-level-row').hidden = !needBots;
  $('opt-level').innerHTML = segHtml(
    LEVELS.map((l) => [l, t(l)]),
    setup.level,
  );
  $('opt-stadium').innerHTML = segHtml([['auto', t('auto')], ...Object.entries(STADIUMS).map(([id, s]) => [id, G.t(s.name)])], setup.stadium);
  $('opt-score').innerHTML = segHtml(
    SCORE_OPTS.map((n) => [n, n || t('inf')]),
    setup.score,
  );
  $('opt-time').innerHTML = segHtml(
    TIME_OPTS.map((n) => [n, n || t('inf')]),
    setup.time,
  );
  $('setup-keys').innerHTML = G.prefs.touch ? esc(t('touchNote')) : local ? t('keysLocal') : t('keysSolo');
}
function bindSeg(id, key, num) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    setup[key] = num ? Number(b.dataset.v) : b.dataset.v;
    store.set('setup', setup);
    sfx.play('ui');
    buildSetup();
  });
}
bindSeg('opt-mode', 'mode');
bindSeg('opt-format', 'format');
bindSeg('opt-size', 'size', true);
bindSeg('opt-level', 'level');
bindSeg('opt-stadium', 'stadium');
bindSeg('opt-score', 'score', true);
bindSeg('opt-time', 'time', true);

function openSetup(kind) {
  setupKind = kind;
  buildSetup();
  show('s-setup');
}

$('setup-go').onclick = () => {
  sfx.unlock();
  startLocal(setupKind, { ...setup });
};

function makeBots(list, team, n, level, start = 0) {
  for (let i = 0; i < n; i++) {
    const k = list.length + start;
    list.push({ id: `cpu${team}_${i}`, name: BOT_NAMES[(k * 5 + team * 3) % BOT_NAMES.length], team, level, avatar: String(2 + i + (team === 2 ? 5 : 0)) });
  }
}

function startLocal(kind, o) {
  const humans = [];
  const bots = [];
  const n = o.size;
  if (kind === 'solo') {
    humans.push({ id: 'me', name: profile.name, team: 1, avatar: profile.avatar, slot: 0 });
    if (n > 0) {
      makeBots(bots, 1, n - 1, o.level);
      makeBots(bots, 2, n, o.level);
    }
  } else if (o.format === 'coop') {
    humans.push({ id: 'p1', name: G.t({ es: 'J1', en: 'P1' }), team: 1, avatar: '1', slot: 1 }, { id: 'p2', name: G.t({ es: 'J2', en: 'P2' }), team: 1, avatar: '2', slot: 2 });
    makeBots(bots, 1, n - 2, o.level);
    makeBots(bots, 2, n, o.level);
  } else {
    humans.push({ id: 'p1', name: G.t({ es: 'J1', en: 'P1' }), team: 1, avatar: '1', slot: 1 }, { id: 'p2', name: G.t({ es: 'J2', en: 'P2' }), team: 2, avatar: '2', slot: 2 });
    makeBots(bots, 1, n - 1, o.level);
    makeBots(bots, 2, n - 1, o.level);
  }
  const perTeam = Math.max(1, n);
  const practice = kind === 'solo' && n === 0;
  const cfg = {
    stadium: resolveStadium(o.stadium, perTeam, o.mode),
    mode: o.mode,
    scoreLimit: practice ? 0 : o.score,
    timeLimit: practice ? 0 : o.time,
  };
  S.lastCfg = { kind, o };
  S.kind = kind;
  S.session = new LocalSession({ cfg, humans, bots, onEvent });
  S.demo = null;
  S.ended = null;
  renderer.noRot = kind === 'local';
  renderer.setStadium(S.session.match.st);
  hideScreens();
  resetHud();
  sfx.play('whistle');
  const hint = G.prefs.touch ? t('touchNote') : practice ? t('practiceHint') : kind === 'local' ? t('keysLocal') : t('kickHintKb');
  showHint(hint);
}

function showHint(html, ms = 5000) {
  const h = $('hint');
  h.innerHTML = html;
  h.classList.remove('off');
  clearTimeout(showHint.t);
  showHint.t = setTimeout(() => h.classList.add('off'), ms);
}

// ---------------------------------------------------------------- pausa (sin conexión)
function pauseLocal(on) {
  if (!S.session || S.kind === 'online' || S.ended) return;
  S.session.paused = on;
  if (on) {
    $('pz-keys').innerHTML = G.prefs.touch ? '' : S.kind === 'local' ? t('keysLocal') : t('keysSolo');
    S.history = [];
    $$('.screen').forEach((s) => s.classList.toggle('on', s.id === 's-pause'));
    S.screen = 's-pause';
  } else hideScreens();
  refreshChrome();
}
$('btn-pause').onclick = () => {
  sfx.play('ui');
  if (S.kind === 'online') openRoomOverlay();
  else pauseLocal(true);
};
$('pz-resume').onclick = () => pauseLocal(false);
$('pz-restart').onclick = () => startLocal(S.lastCfg.kind, S.lastCfg.o);
$('pz-setup').onclick = () => {
  quitToMenu();
  openSetup(S.lastCfg.kind);
};
$('pz-quit').onclick = () => quitToMenu();

function quitToMenu() {
  if (S.kind === 'online') net?.leave();
  S.session = null;
  S.kind = null;
  S.room = null;
  S.ended = null;
  startDemo();
  show('s-home');
}

// ====================================================================== eventos del partido
const lastSound = {};
function throttled(k, ms) {
  const now = performance.now();
  if (now - (lastSound[k] || 0) < ms) return false;
  lastSound[k] = now;
  return true;
}

function nameOf(id) {
  return S.session?.match.player(id)?.name || S.session?.match.stats[id]?.name || '?';
}

function onEvent(e, src) {
  const sess = S.session;
  if (!sess) return;
  const m = sess.match;
  switch (e.t) {
    case 'kick': {
      const p = m.player(e.id);
      sfx.play('kick');
      renderer.kick(e.x, e.y, p?.team === 2 ? COLORS.blue : COLORS.red);
      break;
    }
    case 'touch':
      if (throttled('touch', 70)) sfx.play('touch', e.v);
      break;
    case 'wall':
      if (throttled('wall', 60)) sfx.play('wall', e.v);
      break;
    case 'post': {
      sfx.play('post');
      const b = m.balls[e.ball || 0]?.d;
      if (b) renderer.post(b.x, b.y);
      break;
    }
    case 'reset':
      sfx.play('whistle');
      break;
    case 'goal': {
      sfx.play('goal');
      const b = m.balls[e.ball || 0]?.d;
      renderer.goal(e.team, b ? b.x : 0, b ? b.y : 0);
      bump(e.team);
      let sub = '';
      if (e.scorer) sub = e.og ? t('ownGoal', { n: e.scorer.name }) : e.scorer.name + (e.assist ? ` · ${t('assist', { n: e.assist.name })}` : '');
      banner(t('goal'), sub, e.team);
      if (S.kind === 'online') addChat({ sys: true, text: `⚽ ${e.score[0]}-${e.score[1]} ${sub}` });
      break;
    }
    case 'end': {
      sfx.play('end');
      banner(winnerText(e.winner), '', e.winner);
      break;
    }
    case 'over':
      if (S.kind !== 'online') localOver();
      break;
  }
}

function winnerText(w) {
  if (S.kind === 'local' && S.lastCfg?.o.format === 'vs') return t(w === 1 ? 'p1Wins' : 'p2Wins');
  const my = myTeam();
  if (my) return t(w === my ? 'youWin' : 'youLose');
  return t(w === 1 ? 'redWins' : 'blueWins');
}

function myTeam() {
  const s = S.session;
  if (!s) return 0;
  if (S.kind === 'local') return S.lastCfg?.o.format === 'coop' ? 1 : 0;
  const me = s.match.player(S.kind === 'online' ? net?.myId : 'me');
  return me?.team || 0;
}

function banner(title, sub, team) {
  const el = $('banner');
  $('banner-t').textContent = title;
  $('banner-s').textContent = sub;
  $('banner-s').hidden = !sub;
  el.className = `banner t${team || 0}`;
  void el.offsetWidth;
  el.classList.add('show');
}

function bump(team) {
  const el = $(team === 1 ? 'sc-red' : 'sc-blue');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ====================================================================== HUD
let hudKey = '';
function resetHud() {
  hudKey = '';
  $('banner').className = 'banner';
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateHud() {
  const s = S.session;
  if (!s) return;
  const m = s.match;
  const lim = m.cfg.timeLimit * 60;
  const secs = m.time / TPS;
  let clock;
  let phase = '';
  if (lim) clock = secs <= lim ? fmt(lim - secs) : '+' + fmt(secs - lim);
  else clock = fmt(secs);
  if (s.paused) phase = t('pausedHud');
  else if (m.overtime) phase = t('golden');
  else if (m.state === 0) phase = t('kickoff');
  else if (m.cfg.scoreLimit) phase = m.cfg.scoreLimit === 1 ? t('toGoal1') : t('toGoals', { n: m.cfg.scoreLimit });
  const key = `${m.score[1]}|${m.score[2]}|${clock}|${phase}`;
  if (key !== hudKey) {
    hudKey = key;
    $('sc-red').textContent = m.score[1];
    $('sc-blue').textContent = m.score[2];
    $('clock').textContent = clock;
    $('phase').textContent = phase;
  }
  if (S.kind === 'online' && s.ping) {
    const p = $('ping');
    p.hidden = false;
    const ms = Math.round(s.ping);
    p.textContent = `${ms} ms`;
    p.classList.toggle('bad', ms > 160);
  } else $('ping').hidden = true;
}

// ====================================================================== resultados
function statsRows(sum, mineIds) {
  const rows = [...sum.stats].sort((a, b) => a.team - b.team || b.goals - a.goals || b.assists - a.assists);
  let mvp = null;
  let best = -1;
  for (const r of rows) {
    const sc = r.goals * 3 + r.assists * 2 + r.kicks * 0.1 + r.touches * 0.05 - r.og * 2 + (r.team === sum.winner ? 1 : 0);
    if (sc > best) {
      best = sc;
      mvp = r.id;
    }
  }
  return rows
    .filter((r) => r.team)
    .map(
      (r) =>
        `<tr class="${r.id === mvp ? 'mvp' : ''} ${mineIds.includes(r.id) ? 'mine' : ''}"><td><i style="background:${r.team === 1 ? COLORS.red : COLORS.blue}"></i>${esc(r.name)}</td><td>${r.goals}${r.og ? ` <small title="en contra">(${r.og} ec)</small>` : ''}</td><td>${r.assists}</td><td>${r.kicks}</td><td>${r.touches}</td></tr>`,
    )
    .join('');
}

function showResults(sum, { online = false } = {}) {
  const w = sum.winner;
  $('res-kicker').textContent = t('finalScore');
  const title = $('res-title');
  title.textContent = winnerText(w);
  title.className = `res-title t${w}`;
  $('res-r').textContent = sum.score[0];
  $('res-b').textContent = sum.score[1];
  $('poss-r').textContent = `${sum.poss[0]}%`;
  $('poss-b').textContent = `${sum.poss[1]}%`;
  $('poss-bar').style.width = '50%';
  requestAnimationFrame(() => ($('poss-bar').style.width = `${sum.poss[0] || (sum.poss[1] ? 0 : 50)}%`));
  const mine = online ? [net?.myId] : ['me', 'p1', 'p2'];
  $('res-stats').innerHTML = statsRows(sum, mine);
  const again = $('res-again');
  const alt = $('res-alt');
  if (online) {
    const host = net?.isHost;
    again.textContent = t('playAgain');
    again.hidden = !host;
    alt.textContent = t('toRoom');
    alt.hidden = false;
  } else {
    again.textContent = t('again');
    again.hidden = false;
    alt.textContent = t('options');
    alt.hidden = false;
  }
  S.history = [];
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === 's-results'));
  S.screen = 's-results';
  refreshChrome();
}

function localOver() {
  S.ended = S.session.match.summary();
  showResults(S.ended);
}
$('res-again').onclick = () => {
  sfx.play('ui');
  if (S.kind === 'online') net.send({ t: 'start' });
  else startLocal(S.lastCfg.kind, S.lastCfg.o);
};
$('res-alt').onclick = () => {
  sfx.play('ui');
  if (S.kind === 'online') {
    if (net.isHost && net.room?.state === 'finished') net.send({ t: 'rematch' });
    endNetSession();
    show('s-room', { push: false });
  } else {
    const k = S.lastCfg.kind;
    quitToMenu();
    openSetup(k);
  }
};
$('res-menu').onclick = () => {
  sfx.play('ui');
  quitToMenu();
};

// ====================================================================== fondo animado del menú
function startDemo() {
  const bots = [];
  makeBots(bots, 1, 2, 'hard');
  makeBots(bots, 2, 2, 'hard');
  S.demo = new LocalSession({ cfg: { stadium: 'classic', mode: 'classic', scoreLimit: 0, timeLimit: 0 }, bots, onEvent: demoEvent });
  renderer.noRot = false;
  renderer.setStadium(S.demo.match.st);
}
function demoEvent(e) {
  const m = S.demo?.match;
  if (!m) return;
  if (e.t === 'kick') renderer.kick(e.x, e.y, m.player(e.id)?.team === 2 ? COLORS.blue : COLORS.red);
  else if (e.t === 'goal') {
    const b = m.balls[e.ball || 0].d;
    renderer.goal(e.team, b.x, b.y);
    if (m.tick > 60 * 60 * 4) startDemo();
  }
}

// ====================================================================== bucle principal
let lastT = performance.now();
let padWas = false;
function readBits(slot) {
  let b = input.bits(slot);
  if (S.kind !== 'local' && renderer.cam.rot) b = input.rotate(b, 1, myTeam() === 2 ? -1 : 1);
  return b;
}
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const sess = S.session || S.demo;
  if (sess) {
    const typing = document.activeElement?.tagName === 'INPUT';
    const menuOpen = !!S.screen && S.kind !== 'online';
    sess.update(dt, (slot) => (typing || menuOpen || (S.kind === 'online' && S.screen) ? 0 : readBits(slot)));
    const me = S.kind === 'online' ? net?.myId : S.kind === 'solo' ? 'me' : null;
    renderer.glow = G.prefs.glow;
    renderer.reduced = G.prefs.reducedMotion;
    renderer.setStadium(sess.match.st);
    renderer.frame(sess.match, { alpha: sess.alpha, me, focusTeam: myTeam(), offsets: sess.smooth, dt, names: sess !== S.demo });
    if (S.session) updateHud();
  }
  const pz = input.padPause();
  if (pz && !padWas && S.session && S.kind !== 'online') pauseLocal(!S.session.paused);
  padWas = pz;
  requestAnimationFrame(frame);
}

// ====================================================================== online
function ensureNet() {
  if (net) return net;
  net = new OnlineRoom('clashball', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) {
        $('on-status').textContent = txt;
        if (S.room) $('room-status').textContent = txt;
      }
      if (st === 'open' && S.screen === 's-online') requestRooms();
    },
    onJoined: () => {
      S.chat = [];
      S.prevPlayers = new Map();
      renderChat();
    },
    onRoom: applyRoom,
    onMessage: onNetMessage,
  });
  return net;
}

let listTimer = 0;
function requestRooms() {
  if (!net) return;
  clearTimeout(listTimer);
  if (!$('rooms').children.length) $('rooms').innerHTML = `<li class="empty">${esc(t('loadingRooms'))}</li>`;
  net.send({ t: 'list', game: 'clashball' });
  listTimer = setTimeout(() => S.screen === 's-online' && requestRooms(), 6000);
}

function renderRooms(list) {
  const el = $('rooms');
  if (!list.length) {
    el.innerHTML = `<li class="empty">${esc(t('noRooms'))}</li>`;
    return;
  }
  list.sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || b.n - a.n);
  el.innerHTML = list
    .map((r) => {
      const mode = MODES[r.mode] ? G.t(MODES[r.mode].name) : '';
      const st = STADIUMS[r.stadium] ? G.t(STADIUMS[r.stadium].name) : t('auto');
      const live = r.state === 'playing';
      return `<li data-code="${esc(r.code)}" class="${r.n >= r.max ? 'full' : ''}"><div style="min-width:0;display:grid"><b>${esc(r.name)}</b><small>${esc(mode)} · ${esc(st)}${r.bots ? ` · ${r.bots} bots` : ''}</small></div><span class="pill ${live ? 'live' : ''}">${live && r.sc ? `${r.sc[0]}-${r.sc[1]}` : t(live ? 'inGame' : 'inLobby')}</span><small>${esc(r.code)}</small><span class="n">${r.n}/${r.max}</span></li>`;
    })
    .join('');
}
$('rooms').onclick = (e) => {
  const li = e.target.closest('li[data-code]');
  if (!li) return;
  sfx.unlock();
  sfx.play('ui');
  joinRoom(li.dataset.code);
};
$('on-refresh').onclick = () => {
  $('rooms').innerHTML = '';
  requestRooms();
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('on-join-form').onsubmit = (e) => {
  e.preventDefault();
  const code = $('on-code').value;
  if (code.length === 5) joinRoom(code);
};
$('on-create-open').onclick = () => {
  const f = $('on-create-form');
  f.hidden = !f.hidden;
  $('on-room-name').value = t('roomOf', { n: profile.name });
  $('on-public').checked = roomPrefs.public;
  if (!f.hidden) $('on-room-name').focus();
};
$('on-create-form').onsubmit = (e) => {
  e.preventDefault();
  sfx.unlock();
  roomPrefs = { public: $('on-public').checked };
  store.set('room', roomPrefs);
  createRoom($('on-room-name').value.trim() || t('roomOf', { n: profile.name }), roomPrefs.public);
};
let pendingCreate = null;
function createRoom(name, pub) {
  pendingCreate = { name, public: pub };
  ensureNet().create(profile.name);
}
function joinRoom(code) {
  ensureNet().join(code, profile.name);
}
let quickWanted = false;
$('on-quick').onclick = () => {
  sfx.unlock();
  quickWanted = true;
  $('on-status').textContent = t('loadingRooms');
  ensureNet().send({ t: 'list', game: 'clashball' });
};

function onNetMessage(m) {
  switch (m.t) {
    case 'list': {
      if (quickWanted) {
        quickWanted = false;
        const open = m.rooms.filter((r) => r.n < r.max).sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || b.n - a.n);
        if (open.length) joinRoom(open[0].code);
        else createRoom(t('roomOf', { n: profile.name }), true);
        return;
      }
      renderRooms(m.rooms);
      return;
    }
    case 's':
      if ((!S.session || S.session.liveId !== net.room?.live?.id) && net.room?.state === 'playing' && net.room.live) startNetSession(net.room);
      S.session?.push?.(m);
      return;
    case 'chat':
      addChat({ name: m.name, team: m.team, text: m.m });
      if (m.id !== net.myId) sfx.play('chat');
      return;
    case 'end':
      if (S.session && S.kind === 'online') {
        S.session.reconcile?.();
        S.ended = m.summary;
        showResults(m.summary, { online: true });
      }
      return;
    case 'paused':
      addChat({ sys: true, text: m.on ? t('pausedBy', { n: m.by }) : t('resumedBy') });
      return;
    case 'stopped':
      addChat({ sys: true, text: t('stoppedBy', { n: m.by }) });
      toast(t('stoppedBy', { n: m.by }));
      return;
    case 'error': {
      const txt = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
      $('on-status').textContent = txt;
      $('room-status').textContent = txt;
      return;
    }
    case 'closed':
    case 'kicked':
      $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
      leaveOnline(false);
      return;
  }
}

function applyRoom(room) {
  const first = !S.room || S.room.code !== room.code;
  S.room = room;
  if (first) {
    if (pendingCreate && room.host === net.myId) {
      net.send({ t: 'settings', settings: { name: pendingCreate.name, public: pendingCreate.public } });
      pendingCreate = null;
    }
    if (profile.avatar) net.send({ t: 'avatar', a: profile.avatar });
    $('on-status').textContent = '';
  }
  // entradas y salidas en el chat
  const now = new Map(room.players.map((p) => [p.id, p.name]));
  if (!first) {
    for (const [id, n] of now) if (!S.prevPlayers.has(id)) addChat({ sys: true, text: t('joined', { n }) });
    for (const [id, n] of S.prevPlayers) if (!now.has(id)) addChat({ sys: true, text: t('left', { n }) });
  }
  S.prevPlayers = now;

  if (room.state === 'playing' && room.live) {
    // partido nuevo (también la revancha desde los resultados): sesión nueva
    if (!S.session || S.kind !== 'online' || S.session.liveId !== room.live.id) startNetSession(room);
  } else if (S.session && S.kind === 'online' && room.state === 'lobby') {
    endNetSession();
    show('s-room', { push: false });
  } else if (!S.session && (first || S.screen === 's-online')) {
    show('s-room', { push: false });
    if (room.state === 'finished' && room.last && first) showResults(room.last, { online: true });
  }
  renderRoom(room);
  // el equipo pudo cambiar: controles táctiles solo si juego (tras aplicar el próximo estado)
  setTimeout(refreshChrome, 120);
}

function info(id) {
  const r = S.room;
  if (!r) return {};
  const p = r.players.find((x) => x.id === id);
  if (p) return { name: p.name, avatar: r.avatars?.[id] || '' };
  const b = r.bots?.find((x) => x.id === id);
  return b ? { name: b.name, avatar: b.avatar || '' } : {};
}

function startNetSession(room) {
  S.kind = 'online';
  S.demo = null;
  S.ended = null;
  S.session = new NetSession(net, room.live, { onEvent, info });
  S.session.liveId = room.live.id;
  renderer.noRot = false;
  renderer.setStadium(S.session.match.st);
  resetHud();
  if (S.screen !== 's-room' || !overlayWanted) hideScreens();
  sfx.play('whistle');
  const team = room.teams?.[net.myId] || 0;
  showHint(team ? (G.prefs.touch ? t('touchNote') : t('keysOnline')) : t('spectating'), 6000);
  refreshChrome();
}

function endNetSession() {
  if (S.kind !== 'online') return;
  S.session = null;
  overlayWanted = false;
  startDemo();
  S.kind = 'online';
  refreshChrome();
}

function leaveOnline(sendLeave = true) {
  if (sendLeave) net?.leave();
  S.session = null;
  S.kind = null;
  S.room = null;
  overlayWanted = false;
  if (!S.demo) startDemo();
  show('s-online', { push: false });
  S.history = ['s-home'];
}

// ---------------------------------------------------------------- sala
let overlayWanted = false;
function openRoomOverlay() {
  overlayWanted = true;
  S.history = [];
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === 's-room'));
  S.screen = 's-room';
  if (S.room) renderRoom(S.room);
  refreshChrome();
}
function closeRoomOverlay() {
  overlayWanted = false;
  hideScreens();
}

function playerChip(id, name, { team, avatar, isBot, level, connected = true, host }) {
  const me = id === net?.myId;
  const tags = [me ? t('you') : '', host ? '★' : '', isBot ? t(level || 'normal') : ''].filter(Boolean).join(' · ');
  const col = team === 1 ? COLORS.red : team === 2 ? COLORS.blue : '#56607d';
  const mv = [];
  if (team !== 1) mv.push(`<button data-mv="1" title="Rojo">${team === 2 ? '«' : '‹'}</button>`);
  if (team !== 0 && !isBot) mv.push(`<button data-mv="0" title="Espectadores">•</button>`);
  if (team !== 2) mv.push(`<button data-mv="2" title="Azul">${team === 1 ? '»' : '›'}</button>`);
  if (!me) mv.push(`<button data-kick title="Sacar">✕</button>`);
  return `<li class="pl ${me ? 'me' : ''}" data-id="${esc(id)}" data-bot="${isBot ? 1 : ''}" draggable="${net?.isHost ? 'true' : 'false'}"><i style="background:${col}">${esc(avatar || '')}</i><span class="${connected ? '' : 'off'}">${esc(name)}</span><small>${esc(tags)}</small><span class="mv">${mv.join('')}</span></li>`;
}

function renderRoom(room) {
  const host = net?.isHost;
  const panel = $('s-room').querySelector('.panel');
  panel.classList.toggle('host-view', !!host);
  $('room-name').textContent = room.settings?.name || t('roomOf', { n: room.players.find((p) => p.id === room.host)?.name || '' });
  const st = room.settings || {};
  const playing = room.state === 'playing';
  const live = room.live;
  const modeId = playing && live ? live.mode : st.mode;
  const stadiumId = playing && live ? live.stadium : st.stadium;
  $('room-sub').textContent = `${G.t(MODES[modeId]?.name || MODES.classic.name)} · ${STADIUMS[stadiumId] ? G.t(STADIUMS[stadiumId].name) : t('auto')} · ${room.players.length} ${t('players')}${playing ? ` · ${t('inGame')}` : ''}`;
  $('room-code').textContent = room.code;
  const cols = { 0: [], 1: [], 2: [] };
  for (const p of room.players) {
    const team = room.teams?.[p.id] || 0;
    cols[team].push(playerChip(p.id, p.name, { team, avatar: room.avatars?.[p.id], connected: p.connected, host: p.id === room.host }));
  }
  for (const b of room.bots || []) cols[b.team]?.push(playerChip(b.id, b.name, { team: b.team, avatar: b.avatar, isBot: true, level: b.level }));
  for (const k of [0, 1, 2]) $(`team-${k}`).innerHTML = cols[k].join('');
  const myT = room.teams?.[net?.myId] || 0;
  $$('[data-join]').forEach((b) => (b.hidden = Number(b.dataset.join) === myT || (st.lock && !host)));
  $$('.addbot').forEach((d) => (d.innerHTML = `<span>${esc(t('addBot'))}</span>` + LEVELS.map((l) => `<button data-lvl="${l}" title="${esc(t('bot', { l: t(l) }))}">${esc(t(l))}</button>`).join('')));
  // opciones
  const ro = !host || room.state !== 'lobby';
  const setSeg = (id, opts, cur) => {
    const el = $(id);
    el.innerHTML = segHtml(opts, cur);
    el.classList.toggle('ro', ro);
  };
  setSeg(
    'rs-mode',
    Object.entries(MODES).map(([id, m]) => [id, G.t(m.name)]),
    modeId,
  );
  setSeg('rs-stadium', [['auto', t('auto')], ...Object.entries(STADIUMS).map(([id, s]) => [id, G.t(s.name)])], stadiumId);
  setSeg(
    'rs-score',
    SCORE_OPTS.map((n) => [n, n || '∞']),
    playing && live ? live.score : st.score,
  );
  setSeg(
    'rs-time',
    TIME_OPTS.map((n) => [n, n || '∞']),
    playing && live ? live.time : st.time,
  );
  $('rs-lock').checked = !!st.lock;
  $('rs-public').checked = !!st.public;
  $('rs-lock').disabled = $('rs-public').disabled = ro;
  // pie
  $('room-start').hidden = !host || playing;
  $('room-shuffle').hidden = !host;
  $('room-stop').hidden = !host || !playing;
  $('room-back').hidden = !(playing && S.session);
  $('room-pause').hidden = !host || !playing;
  $('room-pause').textContent = room.paused ? t('unpauseBtn') : t('pauseBtn');
  if (!host) $('room-status').textContent = playing ? (myT ? '' : t('spectating')) : t('waitingHost');
  else if (!$('room-status').textContent.startsWith('⚠')) $('room-status').textContent = '';
}

function sendSetting(key, val) {
  if (!net?.isHost || net.room?.state !== 'lobby') return;
  net.send({ t: 'settings', settings: { [key]: val } });
}
$('rs-mode').onclick = (e) => {
  const b = e.target.closest('[data-v]');
  if (b) sendSetting('mode', b.dataset.v);
};
$('rs-stadium').onclick = (e) => {
  const b = e.target.closest('[data-v]');
  if (b) sendSetting('stadium', b.dataset.v);
};
$('rs-score').onclick = (e) => {
  const b = e.target.closest('[data-v]');
  if (b) sendSetting('score', Number(b.dataset.v));
};
$('rs-time').onclick = (e) => {
  const b = e.target.closest('[data-v]');
  if (b) sendSetting('time', Number(b.dataset.v));
};
$('rs-lock').onchange = (e) => sendSetting('lock', e.target.checked);
$('rs-public').onchange = (e) => sendSetting('public', e.target.checked);

$('s-room').addEventListener('click', (e) => {
  const join = e.target.closest('[data-join]');
  if (join) {
    sfx.play('ui');
    return net.send({ t: 'team', team: Number(join.dataset.join) });
  }
  const lvl = e.target.closest('[data-lvl]');
  if (lvl) {
    const team = Number(lvl.closest('[data-bot]').dataset.bot);
    return net.send({ t: 'bot', team, level: lvl.dataset.lvl });
  }
  const li = e.target.closest('.pl');
  if (!li || !net?.isHost) return;
  const id = li.dataset.id;
  const mv = e.target.closest('[data-mv]');
  if (mv) {
    const team = Number(mv.dataset.mv);
    if (li.dataset.bot && team === 0) return net.send({ t: 'bot', rm: id });
    return net.send({ t: 'team', id, team });
  }
  if (e.target.closest('[data-kick]')) {
    if (li.dataset.bot) net.send({ t: 'bot', rm: id });
    else net.send({ t: 'kick', id });
  }
});
// arrastrar y soltar (anfitrión, en computadora)
$('s-room').addEventListener('dragstart', (e) => {
  const li = e.target.closest?.('.pl');
  if (!li || !net?.isHost) return;
  e.dataTransfer.setData('text/plain', li.dataset.id + '|' + (li.dataset.bot || ''));
  e.dataTransfer.effectAllowed = 'move';
});
$$('.tcol').forEach((col) => {
  col.addEventListener('dragover', (e) => {
    if (!net?.isHost) return;
    e.preventDefault();
    col.classList.add('drop');
  });
  col.addEventListener('dragleave', () => col.classList.remove('drop'));
  col.addEventListener('drop', (e) => {
    e.preventDefault();
    col.classList.remove('drop');
    const [id, bot] = (e.dataTransfer.getData('text/plain') || '').split('|');
    if (!id) return;
    const team = Number(col.dataset.team);
    if (bot && team === 0) net.send({ t: 'bot', rm: id });
    else net.send({ t: 'team', id, team });
  });
});

$('room-start').onclick = () => {
  sfx.unlock();
  sfx.play('ui');
  overlayWanted = false;
  net.send({ t: 'start' });
};
$('room-shuffle').onclick = () => net.send({ t: 'shuffle' });
$('room-stop').onclick = () => net.send({ t: 'stop' });
$('room-back').onclick = () => closeRoomOverlay();
$('room-pause').onclick = () => net.send({ t: 'pause', on: !net.room?.paused });
$('room-leave').onclick = () => {
  sfx.play('ui');
  leaveOnline(true);
};
$('room-code').onclick = async () => {
  const r = await share('clashball', net.room.code);
  if (r === 'copied') toast(t('copied'));
};

// ---------------------------------------------------------------- chat
function addChat(msg) {
  msg.at = performance.now();
  S.chat.push(msg);
  if (S.chat.length > 80) S.chat.shift();
  renderChat();
}
function chatLine(m) {
  if (m.sys) return `<li class="msg sys">${esc(m.text)}</li>`;
  return `<li class="msg"><b class="t${m.team || 0}">${esc(m.name)}:</b> ${esc(m.text)}</li>`;
}
function renderChat() {
  const now = performance.now();
  const hud = S.chat.slice(-7);
  $('chat-log').innerHTML = hud.map((m) => chatLine(m).replace('<li class="msg', `<li class="msg${now - m.at > 9000 ? ' old' : ''}`)).join('');
  const rc = $('room-chat');
  rc.innerHTML = S.chat.slice(-60).map(chatLine).join('');
  rc.scrollTop = rc.scrollHeight;
}
setInterval(() => S.kind === 'online' && renderChat(), 3000);
function openChat() {
  if (S.kind !== 'online' || !S.session) return;
  $('chat').classList.add('typing');
  $('chat-in').focus();
  input.setEnabled(false);
}
function closeChat() {
  $('chat').classList.remove('typing');
  $('chat-in').blur();
  $('chat-in').value = '';
  refreshChrome();
}
$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const v = $('chat-in').value.trim();
  if (v) net.send({ t: 'chat', m: v });
  closeChat();
};
$('chat-in').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeChat();
  }
});
$('chat-in').addEventListener('blur', () => setTimeout(() => document.activeElement !== $('chat-in') && $('chat').classList.remove('typing'), 50));
$('room-chat-form').onsubmit = (e) => {
  e.preventDefault();
  const v = $('room-chat-in').value.trim();
  if (v) net.send({ t: 'chat', m: v });
  $('room-chat-in').value = '';
};
$('btn-chat').onclick = () => openChat();

// ====================================================================== teclado global
addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT') {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (S.kind === 'online' && S.session) return S.screen === 's-room' ? closeRoomOverlay() : openRoomOverlay();
    if (S.session && S.kind !== 'online' && !S.ended) return pauseLocal(!S.session.paused);
    if (S.screen && S.screen !== 's-home' && S.screen !== 's-results' && S.screen !== 's-room') back();
    return;
  }
  if (S.kind === 'online' && S.session && !S.screen && (e.key === 'Enter' || e.code === 'KeyT')) {
    e.preventDefault();
    return openChat();
  }
  if (e.code === 'KeyP' && S.session && !S.ended) {
    if (S.kind === 'online') net.isHost && net.send({ t: 'pause', on: !net.room?.paused });
    else pauseLocal(!S.session.paused);
  }
});

// ====================================================================== arranque
document.body.classList.toggle('embedded', !!G.embedded);
input.initTouch($('stick-zone'), $('stick'), $('knob'), $('kick-btn'));
addEventListener('pointerdown', () => sfx.unlock(), { once: true });
G.onPrefs(() => {
  applyTexts();
  refreshChrome();
}, true);
G.onPause(() => {
  sfx.suspend();
  if (S.session && S.kind !== 'online' && !S.session.paused && !S.ended) pauseLocal(true);
});
G.onResume(() => sfx.resume());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.session && S.kind !== 'online' && !S.ended) pauseLocal(true);
});

if (/[?&]debug\b/.test(location.search)) window.__clashball = S;
startDemo();
requestAnimationFrame(frame);
const code = roomFromUrl();
if (code) {
  ensureNet();
  show('s-online');
  joinRoom(code);
} else if (sessionStorage.getItem('gameit:session:clashball') && ensureNet().resume()) show('s-online');
G.ready();
