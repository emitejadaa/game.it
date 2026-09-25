/* Billar — game.it
 * Bola 8 con mesa en 3D: contra la compu (3 niveles), dos jugadores en el mismo dispositivo u
 * online. Apuntar arrastrando sobre la mesa (y ajuste fino), fuerza con la barra, efecto con la
 * bola grande, bola en mano, cantar tronera para la 8. La física es la misma en todos lados:
 * online el servidor decide y los dos navegadores ven exactamente el mismo tiro.
 */
import { L, W, R, DT, MAX_SPEED, POCKETS, HEAD_X, step, newEvents, strike, cloneBalls, canPlace, cast } from './shared/physics.js';
import { newGame, judge, legalTargets, onEight, groupOf } from './shared/rules.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { Table, ballColor, FELTS } from './scene.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TXT = {
  title: { es: 'Billar', en: 'Billiards' },
  tagline: { es: 'bola 8 con efecto, bandas y buen pulso', en: '8-ball with spin, banks and a steady hand' },
  vsCpu: { es: 'Contra la compu', en: 'Versus CPU' },
  vsCpuSub: { es: '3 niveles', en: '3 levels' },
  local: { es: 'Dos jugadores', en: 'Two players' },
  localSub: { es: 'por turnos en el mismo dispositivo', en: 'taking turns on one device' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'sala con código', en: 'room with a code' },
  level: { es: 'Nivel', en: 'Level' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Normal', en: 'Normal' },
  lv3: { es: 'Difícil', en: 'Hard' },
  play: { es: 'Jugar', en: 'Play' },
  back: { es: '← volver', en: '← back' },
  yourName: { es: 'Tu nombre', en: 'Your name' },
  create: { es: 'Crear sala', en: 'Create room' },
  orJoin: { es: 'o entrá con un código', en: 'or join with a code' },
  join: { es: 'Unirse', en: 'Join' },
  shareCode: { es: 'Pasale este código a tu rival', en: 'Send this code to your rival' },
  copyLink: { es: 'Copiar link', en: 'Copy link' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  start: { es: 'Empezar', en: 'Start' },
  waiting: { es: 'Esperando rival…', en: 'Waiting for a rival…' },
  waitingHost: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  host: { es: 'anfitrión', en: 'host' },
  you: { es: 'Vos', en: 'You' },
  cpu: { es: 'Compu', en: 'CPU' },
  p1: { es: 'Jugador 1', en: 'Player 1' },
  p2: { es: 'Jugador 2', en: 'Player 2' },
  power: { es: 'fuerza', en: 'power' },
  spin: { es: 'efecto', en: 'spin' },
  spinTitle: { es: 'Efecto', en: 'Spin' },
  spinHelp: { es: 'Arriba sigue, abajo retrocede, a los costados abre el rebote.', en: 'Top follows, bottom draws back, sides change the bounce.' },
  center: { es: 'Centrar', en: 'Center' },
  ok: { es: 'Listo', en: 'Done' },
  menu: { es: 'Menú', en: 'Menu' },
  menuBtn: { es: 'Menú', en: 'Menu' },
  resume: { es: 'Seguir', en: 'Resume' },
  rules: { es: 'Reglas', en: 'Rules' },
  quit: { es: 'Salir de la partida', en: 'Quit game' },
  open: { es: 'mesa abierta', en: 'open table' },
  yourTurn: { es: 'Te toca', en: 'Your turn' },
  turnOf: { es: 'Turno de {n}', en: "{n}'s turn" },
  inHand: { es: 'Bola en mano: mové la blanca', en: 'Ball in hand: move the cue ball' },
  inHandBreak: { es: 'Saque: ubicá la blanca detrás de la línea', en: 'Break: place the cue ball behind the line' },
  callPocket: { es: 'Tocá la tronera para la 8', en: 'Tap a pocket for the 8' },
  needCall: { es: 'Primero elegí la tronera para la 8', en: 'Choose a pocket for the 8 first' },
  badPlace: { es: 'La blanca no puede ir ahí', en: 'The cue ball can’t go there' },
  thinking: { es: 'La compu piensa…', en: 'CPU is thinking…' },
  foul_scratch: { es: 'Falta: la blanca entró', en: 'Foul: scratch' },
  foul_noHit: { es: 'Falta: no tocó ninguna bola', en: 'Foul: no ball hit' },
  foul_wrongFirst: { es: 'Falta: tocó primero una bola que no es suya', en: 'Foul: wrong ball first' },
  foul_eightFirst: { es: 'Falta: tocó primero la 8', en: 'Foul: hit the 8 first' },
  foul_noRail: { es: 'Falta: ninguna bola tocó banda', en: 'Foul: no rail after contact' },
  foul_timeout: { es: 'Falta: se acabó el tiempo', en: 'Foul: time ran out' },
  handFor: { es: 'Bola en mano para {n}', en: 'Ball in hand for {n}' },
  assigned: { es: '{n}: {g}', en: '{n}: {g}' },
  solids: { es: 'lisas', en: 'solids' },
  stripes: { es: 'rayadas', en: 'stripes' },
  again_: { es: '¡Sigue {n}!', en: '{n} goes again!' },
  respot: { es: 'La 8 entró en el saque: vuelve a su lugar', en: 'The 8 went in on the break: respotted' },
  win: { es: 'Victoria', en: 'Victory' },
  loss: { es: 'Derrota', en: 'Defeat' },
  end: { es: 'Fin de la partida', en: 'Game over' },
  youWon: { es: '¡Ganaste!', en: 'You won!' },
  youLost: { es: 'Perdiste', en: 'You lost' },
  wins: { es: '¡Ganó {n}!', en: '{n} wins!' },
  r_eightIn: { es: '{w} embocó la 8', en: '{w} sank the 8' },
  r_eightEarly: { es: '{l} embocó la 8 antes de tiempo', en: '{l} sank the 8 too early' },
  r_eightFoul: { es: '{l} embocó la 8 con falta', en: '{l} sank the 8 on a foul' },
  r_eightWrongPocket: { es: '{l} embocó la 8 en otra tronera', en: '{l} sank the 8 in the wrong pocket' },
  r_abandon: { es: '{l} se fue de la partida', en: '{l} left the game' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  again: { es: 'Otra partida', en: 'Play again' },
  acceptRematch: { es: 'Aceptar revancha', en: 'Accept rematch' },
  rematchSent: { es: 'Esperando a tu rival…', en: 'Waiting for your rival…' },
  rematchAsked: { es: '¡Tu rival quiere la revancha!', en: 'Your rival wants a rematch!' },
  offline: { es: '{n} se desconectó', en: '{n} disconnected' },
};
const RULES = {
  es: [
    'Saque con bola en mano detrás de la línea.',
    'La mesa queda abierta hasta que alguien emboca legalmente: se queda con ese grupo (lisas 1-7 o rayadas 9-15).',
    'Seguís tirando si embocás una tuya sin cometer falta.',
    'Falta: la blanca entra, no tocás ninguna bola, tocás primero una que no es tuya o, sin embocar, ninguna bola toca banda. El rival queda con bola en mano.',
    'Con tu grupo completo, tirale a la 8 cantando la tronera. Embocarla antes, en otra tronera o con falta es perder.',
    'Apuntá arrastrando sobre la mesa (o tocando una bola), ajustá con la ruedita y tirá soltando la barra de fuerza.',
  ],
  en: [
    'Break with ball in hand behind the head string.',
    'The table stays open until someone legally pockets a ball: that group is theirs (solids 1-7 or stripes 9-15).',
    'You keep shooting while you pocket your own balls without fouling.',
    'Foul: scratch, no ball hit, wrong ball first or, without pocketing, no ball hits a rail. Your rival gets ball in hand.',
    'With your group cleared, shoot the 8 calling the pocket. Sinking it early, in the wrong pocket or on a foul loses.',
    'Aim by dragging on the table (or tapping a ball), fine-tune with the wheel and shoot by releasing the power bar.',
  ],
};
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k }) ?? k;
  if (v) for (const x in v) s = s.split(`{${x}}`).join(v[x]);
  return s;
};

const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem('gameit:billar:' + k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('gameit:billar:' + k, JSON.stringify(v));
    } catch {}
  },
};

// ---------------------------------------------------------------- estado
const S = {
  screen: 'home',
  mode: null, // cpu | local | online
  level: store.get('level', 2),
  felt: store.get('felt', 'blue'),
  game: null,
  names: ['', ''],
  phase: 'idle', // aim | roll | cpu | wait | over
  aim: 0,
  power: 0,
  spin: { x: 0, y: 0 },
  call: null,
  balls: null,
  sim: null,
  cueAnim: null,
  token: 0,
  pending: null,
  oppAim: null,
  myIdx: 0,
};
const table = new Table($('gl'));
const ov = $('ov');
const octx = ov.getContext('2d');

// ---------------------------------------------------------------- diseño
function layout() {
  const w = innerWidth;
  const h = innerHeight;
  const portrait = h > w * 1.05;
  document.body.classList.toggle('portrait', portrait);
  document.body.classList.toggle('landscape', !portrait);
  const area = portrait ? { x0: 8, y0: 110, x1: w - 8, y1: h - 118 } : { x0: 66, y0: 60, x1: w - 62, y1: h - 10 };
  table.layout(w, h, area, portrait);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ov.width = Math.round(w * dpr);
  ov.height = Math.round(h * dpr);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', layout);

// ---------------------------------------------------------------- pantallas
function show(id) {
  S.screen = id;
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  $('hud').hidden = !S.mode || id === 'home' || id === 'cpu' || id === 'online' || id === 'lobby';
  G.gameplay(id === null && S.phase !== 'over');
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  click();
  if (go.dataset.go === 'online') $('on-name').value ||= defaultName();
  if (go.dataset.go === 'local') return startLocal();
  show(go.dataset.go);
});

function renderSetup() {
  $('cpu-level').innerHTML = [1, 2, 3].map((l) => `<button data-v="${l}" class="${S.level === l ? 'on' : ''}">${esc(t('lv' + l))}</button>`).join('');
  $('felts').innerHTML = Object.entries(FELTS)
    .map(([k, [a]]) => `<button data-f="${k}" class="${S.felt === k ? 'on' : ''}" style="background:${a}" aria-label="${k}"></button>`)
    .join('');
  $('rules-list').innerHTML = (RULES[G.prefs.lang] || RULES.es).map((r) => `<li>${esc(r)}</li>`).join('');
}
$('cpu-level').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  click();
  S.level = Number(b.dataset.v);
  store.set('level', S.level);
  renderSetup();
};
$('felts').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  click();
  S.felt = b.dataset.f;
  store.set('felt', S.felt);
  table.buildTable(S.felt);
  renderSetup();
};
$('cpu-go').onclick = () => {
  click();
  S.mode = 'cpu';
  S.names = [t('you'), `${t('cpu')} · ${t('lv' + S.level)}`];
  begin(newGame(Math.random, 0));
};
function startLocal() {
  S.mode = 'local';
  S.names = [t('p1'), t('p2')];
  begin(newGame(Math.random, 0));
}

function begin(game) {
  S.token++;
  S.game = game;
  S.balls = game.balls;
  S.phase = 'idle';
  S.sim = null;
  S.pending = null;
  S.oppAim = null;
  table.syncBalls(S.balls, 0);
  show(null);
  sfx.rack();
  nextTurn(true);
}

// ---------------------------------------------------------------- turnos
const isHuman = (p) => (S.mode === 'local' ? true : S.mode === 'cpu' ? p === 0 : p === S.myIdx);
const nameOf = (p) => S.names[p] || '?';
const myTurn = () => S.phase === 'aim' && S.game && isHuman(S.game.turn);
const needsCall = () => !!S.game && onEight(S.game, S.game.turn);

function nextTurn(first = false) {
  const g = S.game;
  S.power = 0;
  S.spin = { x: 0, y: 0 };
  S.call = null;
  S.cueAnim = null;
  renderSpin();
  renderPower();
  if (g.winner !== null && g.winner !== undefined) return gameOver();
  const p = g.turn;
  if (!isHuman(p)) {
    S.phase = S.mode === 'cpu' ? 'cpu' : 'wait';
    if (S.mode === 'cpu') cpuTurn();
    else msg(t('turnOf', { n: nameOf(p) }));
  } else {
    S.phase = 'aim';
    aimAtNearest();
    if (g.inHand) msg(g.kitchen ? t('inHandBreak') : t('inHand'));
    else if (needsCall()) msg(t('callPocket'));
    else msg(S.mode === 'local' ? t('turnOf', { n: nameOf(p) }) : t('yourTurn'), false, 2600);
  }
  document.body.classList.toggle('locked', S.phase !== 'aim');
  renderPlayers();
  G.gameplay(S.screen === null);
}

function aimAtNearest() {
  const cue = S.game.balls[0];
  const legal = legalTargets(S.game, S.game.turn);
  let best = null;
  let bd = Infinity;
  for (const b of S.game.balls) {
    if (!b.on || !legal.includes(b.n)) continue;
    const d = (b.x - cue.x) ** 2 + (b.y - cue.y) ** 2;
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  if (best) S.aim = Math.atan2(best.y - cue.y, best.x - cue.x);
}

// ---------------------------------------------------------------- tiro
function speedFor(power) {
  return Math.max(12, MAX_SPEED * Math.pow(power, 1.35));
}

function shoot(power) {
  if (!myTurn() || power < 0.02) return;
  const g = S.game;
  const cue = g.balls[0];
  if (g.inHand && !canPlace(g.balls, cue.x, cue.y, g.kitchen)) {
    toast(t('badPlace'));
    return;
  }
  if (needsCall() && S.call === null) {
    toast(t('needCall'));
    return;
  }
  const s = strike(Math.cos(S.aim), Math.sin(S.aim), speedFor(power), S.spin.x, S.spin.y);
  const cuePos = g.inHand ? [cue.x, cue.y] : null;
  const call = needsCall() ? S.call : null;
  if (S.mode === 'online') {
    net.send({ t: 'shot', s, cue: cuePos, call, k: g.shots });
    S.pending = null;
  }
  roll(s, cuePos, call, power);
}

function roll(s, cuePos, call, power) {
  const balls = cloneBalls(S.game.balls);
  if (cuePos) {
    balls[0].x = cuePos[0];
    balls[0].y = cuePos[1];
    balls[0].on = true;
  }
  Object.assign(balls[0], s);
  balls[0].rest = false;
  S.sim = { balls, ev: newEvents(), acc: 0, call, t0: performance.now(), last: { rails: 0, hits: 0, pocketed: 0 } };
  S.balls = balls;
  S.phase = 'roll';
  document.body.classList.add('locked');
  S.cueAnim = { t: performance.now(), a: S.aim, x: balls[0].x, y: balls[0].y, pull: 4 + power * 16 };
  sfx.strike(power);
  msg('');
}

function advanceSim(dt) {
  const sim = S.sim;
  sim.acc = Math.min(sim.acc + dt / 1000, 0.2);
  let moving = true;
  let n = 0;
  while (sim.acc >= DT && moving && n < 240) {
    moving = step(sim.balls, sim.ev);
    sim.acc -= DT;
    n++;
  }
  // sonidos de lo que pasó en este cuadro
  const ev = sim.ev;
  if (ev.hits > sim.last.hits) {
    sfx.clack(ev.impact);
    ev.impact = 0;
  }
  if (ev.rails > sim.last.rails) {
    sfx.rail(ev.railV);
    ev.railV = 0;
  }
  if (ev.pocketed.length > sim.last.pocketed) sfx.pocket();
  sim.last = { rails: ev.rails, hits: ev.hits, pocketed: ev.pocketed.length };
  if (!moving) finishRoll();
}

function finishRoll() {
  const sim = S.sim;
  for (const b of sim.balls) {
    b.vx = b.vy = b.wx = b.wy = b.wz = 0;
    b.rest = true;
  }
  if (S.mode === 'online') {
    S.phase = 'wait';
    S.simDone = true;
    if (S.pending) applyPending();
    return;
  }
  const { state, summary } = judge(S.game, sim.balls, sim.ev, sim.call);
  S.sim = null;
  S.game = state;
  S.balls = state.balls;
  announce(summary);
  nextTurn();
}

function announce(sum) {
  const byName = nameOf(sum.by);
  const parts = [];
  let warn = false;
  if (sum.respot8) parts.push(t('respot'));
  if (sum.foul) {
    warn = true;
    parts.push(t('foul_' + sum.foul));
    if (sum.winner === undefined) parts.push(t('handFor', { n: nameOf(1 - sum.by) }));
  } else if (sum.assigned) parts.push(t('assigned', { n: byName, g: t(sum.assigned === 'solid' ? 'solids' : 'stripes') }));
  else if (sum.continues) parts.push(t('again_', { n: byName }));
  if (sum.foul) sfx.foul();
  if (parts.length) msg(parts.join(' · '), warn, 3200);
}

function gameOver() {
  S.phase = 'over';
  document.body.classList.add('locked');
  const g = S.game;
  const w = g.winner;
  const mine = S.mode !== 'local';
  const human = mine ? (S.mode === 'cpu' ? 0 : S.myIdx) : null;
  $('over-kicker').textContent = mine ? t(w === human ? 'win' : 'loss') : t('end');
  $('over-title').textContent = mine ? t(w === human ? 'youWon' : 'youLost') : t('wins', { n: nameOf(w) });
  $('over-sub').textContent = t('r_' + g.reason, { w: nameOf(w), l: nameOf(1 - w) });
  renderAgain();
  if (!mine || w === human) sfx.win();
  else sfx.lose();
  renderPlayers();
  setTimeout(() => {
    if (S.phase === 'over') show('over');
  }, 900);
}

function renderAgain() {
  const b = $('over-again');
  if (S.mode === 'online') {
    const again = S.again || [];
    const sent = again.includes(net?.myId);
    const asked = again.length && !sent;
    b.textContent = sent ? t('rematchSent') : asked ? t('acceptRematch') : t('rematch');
    b.disabled = sent || (net?.room?.players?.length || 0) < 2;
  } else {
    b.textContent = S.mode === 'local' ? t('rematch') : t('again');
    b.disabled = false;
  }
}
$('over-again').onclick = async () => {
  click();
  if (S.mode === 'online') {
    net.send({ t: 'again' });
    S.again = [...(S.again || []), net.myId];
    renderAgain();
    return;
  }
  await G.commercialBreak('otra-partida'); // pausa natural (por defecto sin anuncio)
  const first = S.game ? 1 - (S.lastFirst ?? 0) : 0;
  S.lastFirst = first;
  begin(newGame(Math.random, S.mode === 'cpu' ? first : first));
};
$('over-menu').onclick = () => (click(), quit());

function quit() {
  S.token++;
  if (S.mode === 'online' && net) net.leave();
  S.mode = null;
  S.phase = 'idle';
  S.sim = null;
  table.setCue(false);
  show('home');
}

// ---------------------------------------------------------------- compu
let worker = null;
let reqId = 0;
function cpuTurn() {
  msg(t('thinking'));
  const token = S.token;
  const id = ++reqId;
  if (!worker) worker = new Worker('./ai-worker.js', { type: 'module' });
  const started = performance.now();
  worker.onmessage = ({ data }) => {
    if (data.id !== reqId || token !== S.token) return;
    const wait = Math.max(0, 700 - (performance.now() - started));
    setTimeout(() => token === S.token && playCpu(data.plan, token), wait);
  };
  worker.postMessage({ id, state: S.game, level: S.level, seed: (Math.random() * 2 ** 31) | 0 });
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
async function playCpu(plan, token) {
  const g = S.game;
  const cue = g.balls[0];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // ubicar la blanca (bola en mano)
  if (plan.cue) {
    const [x0, y0] = [cue.x, cue.y];
    const t0 = performance.now();
    while (performance.now() - t0 < 520) {
      if (token !== S.token) return;
      const k = ease((performance.now() - t0) / 520);
      cue.x = x0 + (plan.cue[0] - x0) * k;
      cue.y = y0 + (plan.cue[1] - y0) * k;
      await wait(16);
    }
    cue.x = plan.cue[0];
    cue.y = plan.cue[1];
    cue.on = true;
  }
  // girar el taco hasta el ángulo elegido
  const target = Math.atan2(plan.dir[1], plan.dir[0]);
  const from = S.aim;
  let delta = Math.atan2(Math.sin(target - from), Math.cos(target - from));
  const t1 = performance.now();
  const dur = 450 + Math.abs(delta) * 260;
  while (performance.now() - t1 < dur) {
    if (token !== S.token) return;
    S.aim = from + delta * ease((performance.now() - t1) / dur);
    await wait(16);
  }
  S.aim = target;
  if (plan.call !== null && plan.call !== undefined) S.call = plan.call;
  S.spin = { x: plan.spinX || 0, y: plan.spinY || 0 };
  renderSpin();
  await wait(220);
  // tirar del taco
  const power = Math.min(1, Math.pow(plan.speed / MAX_SPEED, 1 / 1.35));
  const t2 = performance.now();
  while (performance.now() - t2 < 520) {
    if (token !== S.token) return;
    S.power = power * ease((performance.now() - t2) / 520);
    renderPower();
    await wait(16);
  }
  if (token !== S.token) return;
  S.power = 0;
  renderPower();
  const s = strike(plan.dir[0], plan.dir[1], plan.speed, plan.spinX || 0, plan.spinY || 0);
  roll(s, g.inHand ? [cue.x, cue.y] : null, plan.call ?? null, power);
}

// ---------------------------------------------------------------- dibujo de guías
function drawOverlay(now) {
  const w = innerWidth;
  const h = innerHeight;
  octx.clearRect(0, 0, w, h);
  const g = S.game;
  if (!g || S.screen !== null) return;
  const k = table.k;
  const balls = S.balls;
  const cue = balls[0];
  const aiming = S.phase === 'aim' || S.phase === 'cpu' || (S.phase === 'wait' && S.oppAim);
  // troneras para cantar la 8
  if ((S.phase === 'aim' && needsCall()) || (S.call !== null && S.phase !== 'roll')) {
    POCKETS.forEach(([x, y], i) => {
      const [px, py] = table.toScreen(x, y);
      const on = S.call === i;
      octx.beginPath();
      octx.arc(px, py, (on ? 7.5 : 6.5) * k, 0, Math.PI * 2);
      octx.lineWidth = on ? 3 : 1.5;
      octx.strokeStyle = on ? table.accent : 'rgba(255,255,255,.45)';
      octx.setLineDash(on ? [] : [4, 4]);
      octx.stroke();
      octx.setLineDash([]);
      if (on) {
        octx.fillStyle = table.accent;
        octx.font = `800 ${Math.max(11, 3.4 * k)}px Manrope, sans-serif`;
        octx.textAlign = 'center';
        octx.textBaseline = 'middle';
        octx.fillText('8', px, py);
      }
    });
  }
  if (!aiming || !cue.on) return;
  let aim = S.aim;
  let cx = cue.x;
  let cy = cue.y;
  if (S.phase === 'wait' && S.oppAim) {
    aim = S.oppAim.a;
    if (S.oppAim.x !== undefined) [cx, cy] = [S.oppAim.x, S.oppAim.y];
  }
  // bola en mano: aro alrededor de la blanca
  if (g.inHand && (S.phase === 'aim' || S.phase === 'cpu')) {
    const [px, py] = table.toScreen(cue.x, cue.y);
    const ok = canPlace(balls, cue.x, cue.y, g.kitchen);
    octx.beginPath();
    octx.arc(px, py, R * k * (1.9 + 0.12 * Math.sin(now / 200)), 0, Math.PI * 2);
    octx.strokeStyle = ok ? 'rgba(255,255,255,.7)' : 'rgba(255,59,92,.9)';
    octx.lineWidth = 2;
    octx.setLineDash([5, 5]);
    octx.stroke();
    octx.setLineDash([]);
    if (g.kitchen) {
      const [ax, ay] = table.toScreen(HEAD_X, 0);
      const [bx, by] = table.toScreen(HEAD_X, W);
      octx.beginPath();
      octx.moveTo(ax, ay);
      octx.lineTo(bx, by);
      octx.strokeStyle = 'rgba(255,255,255,.35)';
      octx.lineWidth = 1.5;
      octx.stroke();
    }
  }
  const dx = Math.cos(aim);
  const dy = Math.sin(aim);
  const hit = cast(balls.map((b) => (b.n === 0 ? { ...b, x: cx, y: cy } : b)), cx, cy, dx, dy, 0);
  const [sx0, sy0] = table.toScreen(cx + dx * R, cy + dy * R);
  const [gx, gy] = table.toScreen(hit.gx, hit.gy);
  const alpha = S.phase === 'aim' ? 0.9 : 0.45;
  octx.lineWidth = 2;
  octx.strokeStyle = `rgba(255,255,255,${alpha})`;
  octx.beginPath();
  octx.moveTo(sx0, sy0);
  octx.lineTo(gx, gy);
  octx.stroke();
  // bola fantasma
  const legal = hit.ball ? legalTargets(g, g.turn).includes(hit.ball.n) : true;
  octx.beginPath();
  octx.arc(gx, gy, R * k, 0, Math.PI * 2);
  octx.strokeStyle = legal ? `rgba(255,255,255,${alpha})` : 'rgba(255,59,92,.95)';
  octx.stroke();
  if (hit.ball && !legal) {
    const q = R * k * 0.55;
    octx.beginPath();
    octx.moveTo(gx - q, gy - q);
    octx.lineTo(gx + q, gy + q);
    octx.moveTo(gx + q, gy - q);
    octx.lineTo(gx - q, gy + q);
    octx.stroke();
  }
  if (hit.ball) {
    // hacia dónde sale la bola y hacia dónde se desvía la blanca
    let nx = hit.ball.x - hit.gx;
    let ny = hit.ball.y - hit.gy;
    const nd = Math.hypot(nx, ny) || 1;
    nx /= nd;
    ny /= nd;
    const cut = dx * nx + dy * ny;
    const [bx, by] = table.toScreen(hit.ball.x, hit.ball.y);
    const [ex, ey] = table.toScreen(hit.ball.x + nx * (10 + 30 * cut), hit.ball.y + ny * (10 + 30 * cut));
    octx.strokeStyle = legal ? `rgba(255,255,255,${alpha})` : 'rgba(255,59,92,.6)';
    octx.beginPath();
    octx.moveTo(bx, by);
    octx.lineTo(ex, ey);
    octx.stroke();
    let tx = dx - cut * nx;
    let ty = dy - cut * ny;
    const tl = Math.hypot(tx, ty);
    if (tl > 0.02) {
      tx /= tl;
      ty /= tl;
      const [fx, fy] = table.toScreen(hit.gx + tx * 16 * tl, hit.gy + ty * 16 * tl);
      octx.setLineDash([4, 4]);
      octx.strokeStyle = `rgba(255,255,255,${alpha * 0.6})`;
      octx.beginPath();
      octx.moveTo(gx, gy);
      octx.lineTo(fx, fy);
      octx.stroke();
      octx.setLineDash([]);
    }
  } else if (hit.rail) {
    // rebote en la banda
    const rx = hit.nx ? -dx : dx;
    const ry = hit.ny ? -dy : dy;
    const [fx, fy] = table.toScreen(hit.gx + rx * 22, hit.gy + ry * 22);
    octx.setLineDash([4, 4]);
    octx.strokeStyle = `rgba(255,255,255,${alpha * 0.6})`;
    octx.beginPath();
    octx.moveTo(gx, gy);
    octx.lineTo(fx, fy);
    octx.stroke();
    octx.setLineDash([]);
  }
}

// ---------------------------------------------------------------- bucle
let lastT = performance.now();
let glKey = '';
let ovKey = '';
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - lastT);
  lastT = now;
  const rolling = S.phase === 'roll' && S.sim;
  if (rolling && !(S.screen === 'pause' && S.mode !== 'online')) advanceSim(dt);
  if (rolling) S.animUntil = now + 450; // las embocadas terminan de caer
  const animating = now < (S.animUntil || 0) || (S.cueAnim && now - S.cueAnim.t < 300);
  // la mesa se vuelve a dibujar solo si algo cambió (ahorra batería en los turnos quietos)
  const cue = S.balls?.[0];
  const key = animating ? now : [S.aim.toFixed(4), S.power.toFixed(3), cue?.x, cue?.y, cue?.on, S.phase, S.oppAim?.a, S.oppAim?.p, S.oppAim?.x, innerWidth, innerHeight, table.version, S.screen].join('|');
  if (key !== glKey) {
    glKey = key;
    if (S.balls) table.syncBalls(S.balls, rolling ? dt / 1000 : 0, now);
    if (S.cueAnim && (S.phase === 'roll' || animating)) {
      // golpe: el taco avanza y se desvanece
      const k = (now - S.cueAnim.t) / 260;
      if (k < 1) table.setCue(true, S.cueAnim.x, S.cueAnim.y, S.cueAnim.a, Math.max(0, S.cueAnim.pull * (1 - k * 4)), Math.max(0, 1 - k));
      else table.setCue(false);
    } else if (cue?.on && S.game && (S.phase === 'aim' || S.phase === 'cpu')) {
      table.setCue(true, cue.x, cue.y, S.aim, 1.5 + S.power * 18);
    } else if (cue?.on && S.phase === 'wait' && S.oppAim) {
      table.setCue(true, S.oppAim.x ?? cue.x, S.oppAim.y ?? cue.y, S.oppAim.a, 1.5 + (S.oppAim.p || 0) * 18, 0.85);
    } else table.setCue(false);
    table.render();
  }
  const pulse = S.game?.inHand && (S.phase === 'aim' || S.phase === 'cpu') ? Math.floor(now / 33) : 0;
  const okey = `${key}|${pulse}|${S.call}`;
  if (okey !== ovKey) {
    ovKey = okey;
    drawOverlay(now);
  }
  if (S.mode === 'online') {
    tickTimer();
    sendAim(now);
  }
}

// ---------------------------------------------------------------- entrada
const gl = $('gl');
let drag = null;
gl.addEventListener('pointerdown', (e) => {
  if (!myTurn()) return;
  const [x, y] = table.fromScreen(e.clientX, e.clientY);
  const g = S.game;
  const cue = g.balls[0];
  if (needsCall()) {
    let best = -1;
    let bd = 12 * 12;
    POCKETS.forEach(([px, py], i) => {
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) {
      S.call = best;
      click();
      msg('');
      return;
    }
  }
  if (g.inHand && (x - cue.x) ** 2 + (y - cue.y) ** 2 < (R * 3) ** 2) {
    drag = { kind: 'cue', id: e.pointerId, ox: cue.x - x, oy: cue.y - y };
  } else {
    drag = { kind: 'aim', id: e.pointerId, touch: e.pointerType !== 'mouse', a0: Math.atan2(y - cue.y, x - cue.x), x0: e.clientX, y0: e.clientY, moved: false };
    if (!drag.touch) S.aim = drag.a0;
  }
  gl.setPointerCapture(e.pointerId);
});
gl.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || !myTurn()) return;
  const [x, y] = table.fromScreen(e.clientX, e.clientY);
  const cue = S.game.balls[0];
  if (drag.kind === 'cue') {
    const nx = Math.max(R, Math.min((S.game.kitchen ? HEAD_X : L - R), x + drag.ox));
    const ny = Math.max(R, Math.min(W - R, y + drag.oy));
    cue.x = nx;
    cue.y = ny;
    return;
  }
  const a = Math.atan2(y - cue.y, x - cue.x);
  if (drag.touch) {
    // en pantallas táctiles el giro es relativo (y a media velocidad, para afinar)
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.moved = true;
    const d = Math.atan2(Math.sin(a - drag.a0), Math.cos(a - drag.a0));
    S.aim += d * 0.6;
    drag.a0 = a;
  } else S.aim = a;
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (d.kind === 'cue') {
    const cue = S.game.balls[0];
    if (!canPlace(S.game.balls, cue.x, cue.y, S.game.kitchen)) toast(t('badPlace'));
    return;
  }
  if (d.touch && !d.moved && myTurn()) {
    // toque: apuntar a ese punto (o al centro de la bola tocada)
    const [x, y] = table.fromScreen(e.clientX, e.clientY);
    const cue = S.game.balls[0];
    let tx = x;
    let ty = y;
    for (const b of S.game.balls) if (b.on && b.n !== 0 && (b.x - x) ** 2 + (b.y - y) ** 2 < (R * 1.6) ** 2) [tx, ty] = [b.x, b.y];
    S.aim = Math.atan2(ty - cue.y, tx - cue.x);
  }
};
gl.addEventListener('pointerup', endDrag);
gl.addEventListener('pointercancel', endDrag);
gl.addEventListener(
  'wheel',
  (e) => {
    if (!myTurn()) return;
    e.preventDefault();
    S.aim += Math.sign(e.deltaY) * (e.shiftKey ? 0.02 : 0.0035);
  },
  { passive: false },
);

// ajuste fino
const fine = $('fine');
let fineDrag = null;
fine.addEventListener('pointerdown', (e) => {
  if (!myTurn()) return;
  fineDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  fine.setPointerCapture(e.pointerId);
});
fine.addEventListener('pointermove', (e) => {
  if (!fineDrag || e.pointerId !== fineDrag.id || !myTurn()) return;
  const portrait = document.body.classList.contains('portrait');
  const d = portrait ? e.clientX - fineDrag.x : e.clientY - fineDrag.y;
  fineDrag.x = e.clientX;
  fineDrag.y = e.clientY;
  S.aim += d * 0.0011;
  S.fineOff = (S.fineOff || 0) + d;
  fine.style.setProperty('--fo', `${S.fineOff}px`);
});
fine.addEventListener('pointerup', () => (fineDrag = null));
fine.addEventListener('pointercancel', () => (fineDrag = null));

// fuerza
const power = $('power');
const track = power.querySelector('.track');
let powerDrag = null;
function powerFrom(e) {
  const r = track.getBoundingClientRect();
  const portrait = document.body.classList.contains('portrait');
  const v = portrait ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  return Math.max(0, Math.min(1, v));
}
function renderPower() {
  power.style.setProperty('--p', `${(S.power * 100).toFixed(1)}%`);
}
track.addEventListener('pointerdown', (e) => {
  if (!myTurn()) return;
  powerDrag = { id: e.pointerId };
  track.setPointerCapture(e.pointerId);
  S.power = powerFrom(e);
  renderPower();
});
track.addEventListener('pointermove', (e) => {
  if (!powerDrag || e.pointerId !== powerDrag.id) return;
  S.power = powerFrom(e);
  renderPower();
});
track.addEventListener('pointerup', (e) => {
  if (!powerDrag || e.pointerId !== powerDrag.id) return;
  powerDrag = null;
  const p = S.power;
  S.power = 0;
  renderPower();
  shoot(p);
});
track.addEventListener('pointercancel', () => {
  powerDrag = null;
  S.power = 0;
  renderPower();
});

// teclado: flechas para apuntar, espacio (mantener) para cargar
let charging = null;
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  if (e.key === 'Escape' && S.mode && S.screen === null) return openPause();
  if (!myTurn()) return;
  const fineStep = e.shiftKey ? 0.02 : 0.0025;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') S.aim -= e.key === 'ArrowDown' ? 0.03 : fineStep;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') S.aim += e.key === 'ArrowUp' ? 0.03 : fineStep;
  else if (e.code === 'Space') {
    e.preventDefault();
    if (!charging) charging = { t: performance.now() };
    S.power = Math.min(1, (performance.now() - charging.t) / 1400);
    renderPower();
  } else return;
  e.preventDefault();
});
addEventListener('keyup', (e) => {
  if (e.code !== 'Space' || !charging) return;
  charging = null;
  const p = S.power;
  S.power = 0;
  renderPower();
  shoot(p);
});

// efecto
function renderSpin() {
  const x = S.spin.x * 50 * 0.8;
  const y = -S.spin.y * 50 * 0.8;
  $('spin-dot').style.transform = `translate(${x * 0.48}px, ${y * 0.48}px)`;
  $('bigdot').style.transform = `translate(${x * 1.9}px, ${y * 1.9}px)`;
}
$('spin-btn').onclick = () => {
  if (!myTurn()) return;
  click();
  $('spin-pop').hidden = false;
};
const big = $('bigball');
let spinDrag = false;
function setSpin(e) {
  const r = big.getBoundingClientRect();
  let x = (e.clientX - r.left) / r.width - 0.5;
  let y = (e.clientY - r.top) / r.height - 0.5;
  const d = Math.hypot(x, y);
  if (d > 0.4) {
    x *= 0.4 / d;
    y *= 0.4 / d;
  }
  S.spin = { x: x / 0.4, y: -y / 0.4 };
  renderSpin();
}
big.addEventListener('pointerdown', (e) => {
  spinDrag = true;
  big.setPointerCapture(e.pointerId);
  setSpin(e);
});
big.addEventListener('pointermove', (e) => spinDrag && setSpin(e));
big.addEventListener('pointerup', () => (spinDrag = false));
$('spin-reset').onclick = () => {
  S.spin = { x: 0, y: 0 };
  renderSpin();
};
$('spin-ok').onclick = () => {
  click();
  $('spin-pop').hidden = true;
};
$('spin-pop').addEventListener('pointerdown', (e) => {
  if (e.target === $('spin-pop')) $('spin-pop').hidden = true;
});

// pausa y reglas
function openPause() {
  show('pause');
}
$('btn-menu').onclick = () => (click(), openPause());
$('pz-resume').onclick = () => (click(), show(null));
$('pz-rules').onclick = () => (click(), show('rules'));
$('rules-ok').onclick = () => (click(), show(S.mode ? 'pause' : 'home'));
$('pz-quit').onclick = () => (click(), quit());

// ---------------------------------------------------------------- HUD
function renderPlayers() {
  const g = S.game;
  if (!g) return;
  for (const p of [0, 1]) {
    const el = $('pl' + p);
    el.classList.toggle('turn', g.winner === null && g.turn === p);
    el.querySelector('.nm').textContent = nameOf(p);
    el.querySelector('.av').textContent = (nameOf(p)[0] || '?').toUpperCase();
    const grp = g.groups[p];
    let html;
    if (!grp) html = `<em>${esc(t('open'))}</em>`;
    else {
      const nums = grp === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
      const onT = new Set(g.balls.filter((b) => b.on).map((b) => b.n));
      html = nums.map((n) => `<i class="${n >= 9 ? 'st' : ''} ${onT.has(n) ? '' : 'gone'}" style="background-color:${ballColor(n)}"></i>`).join('');
      if (onEight(g, p)) html += `<i style="background-color:#131313;box-shadow:0 0 0 2px ${table.accent}"></i>`;
    }
    el.querySelector('.grp').innerHTML = html;
  }
}

let msgT = 0;
function msg(text, warn = false, ms = 0) {
  const el = $('msg');
  el.textContent = text;
  el.classList.toggle('on', !!text);
  el.classList.toggle('warn', warn);
  clearTimeout(msgT);
  if (ms) msgT = setTimeout(() => el.classList.remove('on'), ms);
}
let toastT = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2200);
}

// ---------------------------------------------------------------- online
let net = null;
const ser = (g) => ({ b: g.balls.map((b) => [b.n, b.x, b.y, b.on ? 1 : 0]), t: g.turn, g: g.groups, o: g.open, k: g.brk, h: g.inHand, c: g.kitchen, w: g.winner, r: g.reason, s: g.shots });
const des = (d) => ({
  balls: d.b.map(([n, x, y, on]) => ({ n, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: !!on, rest: true })),
  turn: d.t,
  groups: d.g,
  open: d.o,
  brk: d.k,
  inHand: d.h,
  kitchen: d.c,
  winner: d.w,
  reason: d.r,
  shots: d.s,
  foul: null,
});

function ensureNet() {
  if (net) return net;
  net = new OnlineRoom('billar', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt === undefined) return;
      $('on-status').textContent = txt;
      $('lobby-status').textContent = txt;
      if (S.mode === 'online' && txt && S.screen === null) toast(txt);
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'shot') return onShot(m);
      if (m.t === 'aim') {
        if (S.phase === 'wait') S.oppAim = m;
        return;
      }
      if (m.t === 'timeout') {
        msg(t('foul_timeout') + ' · ' + t('handFor', { n: nameOf(1 - m.p) }), true, 3000);
        sfx.foul();
        return;
      }
      if (m.t === 'error') {
        const txt = netText(m.code);
        $('on-status').textContent = txt;
        $('lobby-status').textContent = txt;
        if (S.mode === 'online' && S.screen === null) toast(txt);
        return;
      }
      if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = null;
        S.token++;
        show('online');
      }
    },
  });
  return net;
}
$('on-create').onclick = () => {
  click();
  ensureNet().create($('on-name').value.trim() || defaultName());
};
$('on-join').onsubmit = (e) => {
  e.preventDefault();
  click();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureNet().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => (click(), net.send({ t: 'start' }));
$('lobby-leave').onclick = () => {
  click();
  net.leave();
  S.mode = null;
  show('online');
};
const doShare = async () => {
  const r = await share('billar', net.room.code);
  if (r === 'copied') toast(t('copied'));
};
$('lobby-share').onclick = doShare;
$('lobby-code').onclick = doShare;

function applyRoom(room) {
  const d = room.pool;
  if (room.state === 'lobby' || !d) {
    S.mode = null;
    $('lobby-code').textContent = room.code;
    $('lobby-players').innerHTML = room.players.map((p, i) => `<li><i style="background:${i ? '#1f4fd6' : '#f5b301'}"></i>${esc(p.name)}<small>${[p.id === net.myId ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`).join('');
    const full = room.players.length >= 2;
    $('lobby-start').hidden = !net.isHost || !full;
    $('lobby-status').textContent = !full ? t('waiting') : net.isHost ? '' : t('waitingHost');
    if (S.screen !== 'lobby') show('lobby');
    return;
  }
  S.myIdx = Math.max(0, d.order.indexOf(net.myId));
  S.names = d.order.map((id) => (id === net.myId ? t('you') : room.players.find((p) => p.id === id)?.name ?? '?'));
  S.deadline = d.left > 0 ? performance.now() + d.left : 0;
  S.turnMs = d.turnMs || 40000;
  const prevAgain = S.again || [];
  S.again = d.again || [];
  if (S.again.some((id) => id !== net.myId && !prevAgain.includes(id))) {
    toast(t('rematchAsked'));
    sfx.notify();
  }
  if (S.mode !== 'online' || S.onlineN !== d.n) {
    S.mode = 'online';
    S.onlineN = d.n;
    begin(des(d.st));
    return;
  }
  // estado del servidor (reconexión, tiempo agotado): se aplica si no hay un tiro en curso
  if (S.phase !== 'roll' && !S.pending && d.st.s !== S.game.shots) {
    S.game = des(d.st);
    S.balls = S.game.balls;
    nextTurn();
  } else if (S.phase !== 'roll' && !S.pending && d.st.t !== S.game.turn && d.st.s === S.game.shots) {
    S.game = des(d.st);
    S.balls = S.game.balls;
    nextTurn();
  }
  const opp = room.players.find((p) => p.id !== net.myId);
  if (opp && !opp.connected && !S.offWarned) {
    S.offWarned = true;
    toast(t('offline', { n: opp.name }));
  } else if (opp?.connected) S.offWarned = false;
  renderAgain();
  renderPlayers();
}

function onShot(m) {
  // el resultado llega junto con el tiro; el propio ya se está animando
  S.pending = m;
  if (m.by !== net.myId) {
    S.oppAim = null;
    S.simDone = false;
    roll(m.s, m.cue, m.call, Math.min(1, Math.hypot(m.s.vx, m.s.vy) / MAX_SPEED));
  } else if (S.phase !== 'roll') applyPending();
}

function applyPending() {
  const m = S.pending;
  if (!m) return;
  if (S.phase === 'roll') return;
  S.pending = null;
  S.sim = null;
  const next = des(m.st);
  S.game = next;
  S.balls = next.balls;
  const sum = { ...m.sum, by: S.game ? m.p : 0 };
  sum.by = m.p;
  announce(sum);
  nextTurn();
}

let lastAimSent = 0;
let lastAimKey = '';
function sendAim(now) {
  if (!myTurn() || now - lastAimSent < 110) return;
  const cue = S.game.balls[0];
  const key = `${S.aim.toFixed(3)}|${S.power.toFixed(2)}|${cue.x.toFixed(1)}|${cue.y.toFixed(1)}`;
  if (key === lastAimKey) return;
  lastAimKey = key;
  lastAimSent = now;
  if (net.ws?.readyState === 1) net.raw({ t: 'aim', a: +S.aim.toFixed(4), p: +S.power.toFixed(2), ...(S.game.inHand ? { x: +cue.x.toFixed(2), y: +cue.y.toFixed(2) } : {}) });
}

function tickTimer() {
  const g = S.game;
  if (!g) return;
  for (const p of [0, 1]) {
    const ring = $('pl' + p).querySelector('.ring');
    const on = S.deadline && g.turn === p && g.winner === null && S.phase !== 'roll';
    ring.style.display = on ? 'block' : 'none';
    if (on) {
      const left = Math.max(0, S.deadline - performance.now());
      const c = ring.querySelector('circle');
      c.style.strokeDasharray = '113';
      c.style.strokeDashoffset = String(113 * (1 - left / S.turnMs));
      c.style.stroke = left < 8000 ? '#ff3b5c' : table.accent;
    }
  }
}

// ---------------------------------------------------------------- sonidos
function click() {
  tone(640, 500, 0.05, { type: 'triangle', vol: 0.07 });
}
let lastClack = 0;
const sfx = {
  strike: (p) => {
    noise(0.05, { freq: 2600, q: 1.5, vol: 0.25 + p * 0.5 });
    tone(260, 140, 0.06, { type: 'triangle', vol: 0.15 + p * 0.2 });
  },
  clack: (v) => {
    const now = performance.now();
    if (now - lastClack < 22) return;
    lastClack = now;
    const k = Math.min(1, v / 300);
    tone(2400, 2100, 0.035, { type: 'sine', vol: 0.05 + k * 0.35 });
    noise(0.03, { freq: 3500, q: 2, vol: 0.05 + k * 0.3 });
  },
  rail: (v) => {
    const k = Math.min(1, v / 350);
    if (k < 0.04) return;
    tone(140, 70, 0.1, { type: 'sine', vol: 0.08 + k * 0.3 });
    noise(0.06, { freq: 400, q: 0.8, type: 'lowpass', vol: 0.05 + k * 0.2 });
  },
  pocket: () => {
    tone(330, 110, 0.18, { type: 'triangle', vol: 0.22 });
    noise(0.16, { freq: 700, q: 0.7, vol: 0.18, sweep: 200 });
    tone(180, 90, 0.12, { type: 'sine', vol: 0.18, at: 0.12 });
  },
  foul: () => tone(180, 120, 0.25, { type: 'square', vol: 0.06 }),
  rack: () => {
    for (let i = 0; i < 6; i++) tone(2200 + i * 60, 2000, 0.03, { type: 'sine', vol: 0.08, at: i * 0.04 });
  },
  win: () => notes([523, 659, 784, 1047], { step: 0.1, dur: 0.3, vol: 0.14 }),
  lose: () => notes([392, 330, 262], { step: 0.14, dur: 0.35, vol: 0.12 }),
  notify: () => notes([784, 988], { step: 0.08, dur: 0.14, vol: 0.1 }),
};

// ---------------------------------------------------------------- arranque
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  table.setAccent(G.prefs.colors?.accent || '#00f0ff');
  renderSetup();
  renderPlayers();
}, true);
table.buildTable(S.felt);
table.setAccent(G.prefs.colors?.accent || '#00f0ff');
// mesa de fondo en el menú
S.balls = newGame(Math.random).balls;
layout();
table.syncBalls(S.balls, 0);
renderSetup();
requestAnimationFrame(frame);
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureNet().resume()) show('online');
else show('home');
if (new URLSearchParams(location.search).has('debug')) window.__pool = { S, table };
G.ready();
