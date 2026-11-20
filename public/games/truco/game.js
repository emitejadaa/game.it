/* Truco — game.it
 * El truco argentino con el mazo español: tres cartas, tres bazas, el truco que sube hasta el vale cuatro, el envido
 * (y la flor, si se juega con flor) y los porotos anotados con fósforos. Contra la compu (mano a mano o en parejas),
 * online 1 vs 1 o 2 vs 2 (el servidor reparte) y el truco del día, con las mismas cartas para todos.
 * Reglas en shared/rules.js, la compu en shared/bot.js, la mesa (turnos, cantos, puntos) en shared/table.js y el
 * mazo dibujado en /shared/spanish-deck.js.
 */
import { DECK, TRUCO, teamOf, envido, hasFlor, shuffled, seatOrder, pieOf } from './shared/rules.js';
import { Table, PACE } from './shared/table.js';
import { cardURL } from '/shared/spanish-deck.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink, rng as seeded } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'truco';
const EPOCH = '2026-10-27';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Truco', en: 'Truco' },
  tagline: { es: 'El juego de cartas de los argentinos: truco, envido y flor. ¿Te la bancás?', en: 'Argentina’s favourite card game: truco, envido and flor. Can you bluff your way?' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'mano a mano o en parejas', en: 'one on one or in pairs' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: '1 vs 1 o 2 vs 2 con amigos', en: '1 vs 1 or 2 vs 2 with friends' },
  onlineLong: { es: 'Creá una sala y compartí el código, o entrá con el de un amigo. Reparte el servidor: nadie ve las cartas de nadie.', en: 'Create a room and share the code, or join a friend’s room. The server deals: nobody sees anyone else’s cards.' },
  daily: { es: 'Truco del día', en: 'Daily Truco' },
  dailySub: { es: 'n.º {n} · a 15 · las mismas cartas para todos', en: '#{n} · to 15 · the same cards for everyone' },
  dailyDoneW: { es: 'n.º {n} · ✓ ganaste {a} a {b}', en: '#{n} · ✓ won {a}–{b}' },
  dailyDoneL: { es: 'n.º {n} · ✗ perdiste {a} a {b}', en: '#{n} · ✗ lost {a}–{b}' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  format: { es: 'Partida', en: 'Game' },
  f2: { es: '1 vs 1', en: '1 vs 1' },
  f4: { es: '2 vs 2', en: '2 vs 2' },
  fHelp2: { es: 'Mano a mano contra la compu.', en: 'One on one against the computer.' },
  fHelp4: { es: 'Vos y un compañero de la compu contra otros dos.', en: 'You and a computer partner against two more.' },
  level: { es: 'Nivel', en: 'Level' },
  cpuLevel: { es: 'Compu', en: 'CPU' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Normal', en: 'Normal' },
  lv3: { es: 'Difícil', en: 'Hard' },
  target: { es: 'A cuántos', en: 'Points' },
  florOpt: { es: 'Flor', en: 'Flor' },
  sinFlor: { es: 'Sin flor', en: 'No flor' },
  conFlor: { es: 'Con flor', en: 'With flor' },
  pairs: { es: 'Parejas', en: 'Teams' },
  pairMix: { es: 'Mezclados', en: 'Mixed' },
  pairTogether: { es: 'Juntos', en: 'Together' },
  go: { es: '¡A jugar!', en: 'Let’s play!' },
  back: { es: '← volver', en: '← back' },
  create: { es: 'Crear sala', en: 'Create room' },
  createSub: { es: 'y compartir el código', en: 'and share the code' },
  join: { es: 'Entrar', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'Tocá el código para copiar el link', en: 'Tap the code to copy the link' },
  start: { es: 'Empezar', en: 'Start' },
  leave: { es: 'Salir de la sala', en: 'Leave room' },
  host: { es: 'anfitrión', en: 'host' },
  cpu: { es: 'compu', en: 'CPU' },
  you: { es: 'Vos', en: 'You' },
  youLower: { es: 'vos', en: 'you' },
  teamA: { es: 'equipo A', en: 'team A' },
  teamB: { es: 'equipo B', en: 'team B' },
  needPlayers: { es: 'Hacen falta al menos 2 personas.', en: 'You need at least 2 people.' },
  tooMany: { es: 'Para 3 o 4 personas, elegí 2 vs 2.', en: 'For 3 or 4 people, choose 2 vs 2.' },
  waitingHost: { es: 'Esperando que el anfitrión empiece…', en: 'Waiting for the host to start…' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  us: { es: 'Nosotros', en: 'Us' },
  them: { es: 'Ellos', en: 'Them' },
  usShort: { es: 'Nos', en: 'Us' },
  themShort: { es: 'Ellos', en: 'Them' },
  // cantos
  c_truco: { es: '¡Truco!', en: 'Truco!' },
  c_retruco: { es: '¡Quiero retruco!', en: 'Retruco!' },
  c_vale4: { es: '¡Quiero vale cuatro!', en: 'Vale cuatro!' },
  c_envido: { es: '¡Envido!', en: 'Envido!' },
  c_real: { es: '¡Real envido!', en: 'Real envido!' },
  c_falta: { es: '¡Falta envido!', en: 'Falta envido!' },
  c_flor: { es: '¡Flor!', en: 'Flor!' },
  c_quiero: { es: '¡Quiero!', en: 'I accept!' },
  c_noquiero: { es: 'No quiero', en: 'I decline' },
  c_mazo: { es: 'Me voy al mazo', en: 'I fold' },
  c_buenas: { es: '{p}, son buenas', en: '{p}, you win' },
  c_mejores: { es: '{p} son mejores', en: '{p} beats it' },
  c_tengo: { es: '{p}', en: '{p}' },
  n_truco: { es: 'el truco', en: 'truco' },
  n_retruco: { es: 'el retruco', en: 'retruco' },
  n_vale4: { es: 'el vale cuatro', en: 'vale cuatro' },
  n_envido: { es: 'el envido', en: 'the envido' },
  // botones
  b_truco: { es: 'Truco', en: 'Truco' },
  b_retruco: { es: 'Retruco', en: 'Retruco' },
  b_vale4: { es: 'Vale cuatro', en: 'Vale cuatro' },
  b_envido: { es: 'Envido', en: 'Envido' },
  b_real: { es: 'Real envido', en: 'Real envido' },
  b_falta: { es: 'Falta envido', en: 'Falta envido' },
  b_envidoMenu: { es: 'Envido…', en: 'Envido…' },
  b_quiero: { es: '¡Quiero!', en: 'Accept' },
  b_noquiero: { es: 'No quiero', en: 'Decline' },
  b_mazo: { es: 'Mazo', en: 'Fold' },
  b_mazoSure: { es: '¿Al mazo?', en: 'Fold?' },
  // estado
  st_play: { es: 'Tocá una carta para tirarla', en: 'Tap a card to play it' },
  st_wait: { es: 'Juega {name}…', en: '{name} to play…' },
  st_answer: { es: '{name} tiene que contestar…', en: '{name} has to answer…' },
  st_you: { es: 'Te cantaron {what}: ¿querés?', en: 'They called {what}: accept?' },
  st_think: { es: '{name} está pensando…', en: '{name} is thinking…' },
  st_away: { es: '{name} se desconectó: juega la compu por ahora', en: '{name} disconnected: the CPU plays for now' },
  st_deal: { es: 'Reparte {name}…', en: '{name} deals…' },
  st_dealYou: { es: 'Repartís vos…', en: 'You deal…' },
  worth: { es: '{x} · vale {n}', en: '{x} · worth {n}' },
  envHint: { es: 'Envido {p}', en: 'Envido {p}' },
  envHintMate: { es: 'Envido {p} · tu compañero {q}', en: 'Envido {p} · partner {q}' },
  envHintPie: { es: 'Envido {p} · lo canta {name}', en: 'Envido {p} · {name} calls it' },
  florHint: { es: 'Tenés flor', en: 'You have flor' },
  manoTag: { es: 'Sos mano', en: 'You lead' },
  mano: { es: 'mano', en: 'lead' },
  // resumen de la mano
  h_you: { es: '¡Mano para vos!', en: 'Your hand!' },
  h_us: { es: '¡Mano para nosotros!', en: 'Our hand!' },
  h_them: { es: 'Mano para ellos', en: 'Their hand' },
  h_name: { es: 'Mano para {name}', en: '{name}’s hand' },
  w_plain: { es: 'Sin truco', en: 'No truco' },
  w_quiso: { es: '{x} querido', en: '{x} accepted' },
  w_noYou: { es: 'No quisiste {x}', en: 'You declined {x}' },
  w_noUs: { es: 'No quisimos {x}', en: 'We declined {x}' },
  w_noThem: { es: 'No quisieron {x}', en: 'They declined {x}' },
  w_noName: { es: '{name} no quiso {x}', en: '{name} declined {x}' },
  w_mazoYou: { es: 'Te fuiste al mazo', en: 'You folded' },
  w_mazoUs: { es: 'Nos fuimos al mazo', en: 'We folded' },
  w_mazoThem: { es: 'Se fueron al mazo', en: 'They folded' },
  w_mazoName: { es: '{name} se fue al mazo', en: '{name} folded' },
  w_mazoEnv: { es: '1 es por el envido que no se jugó', en: '1 is for the envido nobody played' },
  e_line: { es: 'Envido: {who} +{p}', en: 'Envido: {who} +{p}' },
  e_pts: { es: '{a} {p} · {b} {q}', en: '{a} {p} · {b} {q}' },
  e_no: { es: 'no quiso', en: 'declined' },
  f_line: { es: 'Flor: {who} +{p}', en: 'Flor: {who} +{p}' },
  pt1: { es: 'punto', en: 'point' },
  ptN: { es: 'puntos', en: 'points' },
  proof: { es: 'los puntos', en: 'the points' },
  // fin
  youWin: { es: '¡Ganaste!', en: 'You win!' },
  youLose: { es: 'Perdiste', en: 'You lose' },
  usWin: { es: '¡Ganamos!', en: 'We win!' },
  usLose: { es: 'Perdimos', en: 'We lose' },
  overKicker: { es: 'Fin de la partida', en: 'Game over' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  again: { es: 'Otra partida', en: 'Play again' },
  waitAgain: { es: 'Esperando al anfitrión', en: 'Waiting for the host' },
  handsWon: { es: 'manos', en: 'hands' },
  dailyKicker: { es: 'Truco del día · n.º {n}', en: 'Daily Truco · #{n}' },
  dailyWon: { es: '¡Ganaste {a} a {b}!', en: 'You won {a}–{b}!' },
  dailyLost: { es: 'Perdiste {a} a {b}', en: 'You lost {a}–{b}' },
  stPlayed: { es: 'jugados', en: 'played' },
  stStreak: { es: 'racha', en: 'streak' },
  stBest: { es: 'mejor', en: 'best' },
  nextDaily: { es: 'El próximo, en', en: 'Next one in' },
  share: { es: 'Compartir', en: 'Share' },
  sharedOk: { es: '¡Listo para pegar!', en: 'Ready to paste!' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const pts = (n) => `${n} ${n === 1 ? t('pt1') : t('ptN')}`;

const RULES = {
  es: `<p>Se juega con el <b>mazo español</b> de 40 cartas (sin ochos ni nueves). Cada uno recibe <b>tres cartas</b> y la mano se juega en hasta <b>tres bazas</b>: en cada una tiran todos una carta y gana la más alta. Se lleva la mano el que gana dos bazas.</p>
<h3>Qué carta mata a cuál</h3><div class="rank">{rank}</div>
<p>Si en una baza empatan (es <b>parda</b>), define la siguiente; si la primera la ganó alguien y después hay parda, gana el de la primera. Si todas son pardas, gana el que es mano.</p>
<h3>El truco</h3>
<p>En tu turno podés cantar <b>truco</b> (la mano pasa a valer 2). El otro contesta <b>quiero</b>, <b>no quiero</b> (y vos te llevás 1) o lo sube: <b>retruco</b> (3) y <b>vale cuatro</b> (4). Solo puede subir el que quiso el último canto. Si nadie canta, la mano vale 1. Irse al <b>mazo</b> es entregar la mano; si todavía se podía cantar el envido (en la primera, antes de que se juegue), el otro se lleva además 1 por el envido: irse sin que nadie cante nada da 2.</p>
<h3>El envido</h3>
<p>Antes de tirar tu primera carta podés cantar <b>envido</b> (2), <b>real envido</b> (3) o <b>falta envido</b> (lo que le falta al que va ganando para terminar). Se pueden encadenar: envido, envido, real, falta. Tus puntos: dos cartas del mismo palo suman 20 más sus valores (las figuras valen 0); si no tenés dos del mismo palo, vale la más alta. Gana el que tiene más; si empatan, el que es mano. Si te cantan truco en la primera, todavía podés contestar con envido: <b>el envido está primero</b>. De a cuatro, el envido lo cantan y lo contestan solo los <b>pies</b>, el último de cada pareja en tirar (el que repartió y el compañero del mano); el pie sabe cuántos tiene su compañero, como si le hiciera la seña.</p>
<p><b>Con flor</b>: tres cartas del mismo palo se cantan solas, valen 3 y anulan el envido; si los dos equipos tienen flor, el de la mejor se lleva 3 por cada flor (al menos 6).</p>
<p>Se juega a 15 o a 30 puntos (los primeros 15 son las <b>malas</b> y los otros, las <b>buenas</b>). Los porotos se anotan con fósforos: cada cuadradito cerrado son cinco.</p>`,
  en: `<p>Played with the 40-card <b>Spanish deck</b> (no eights or nines). Everyone gets <b>three cards</b> and the hand is played in up to <b>three tricks</b>: everybody plays a card and the highest wins. Win two tricks to win the hand.</p>
<h3>Which card beats which</h3><div class="rank">{rank}</div>
<p>A tied trick (<b>parda</b>) is decided by the next one; if someone won the first trick and a later one ties, the first winner takes it. If all are tied, the leading player wins.</p>
<h3>Truco</h3>
<p>On your turn you can call <b>truco</b> (the hand is worth 2). The other side answers <b>accept</b>, <b>decline</b> (you get 1) or raises: <b>retruco</b> (3) and <b>vale cuatro</b> (4). Only whoever accepted the last call can raise. If nobody calls, the hand is worth 1. <b>Folding</b> gives the hand away; if the envido could still be called (on the first trick, before it is played), the other side also gets 1 for the envido: folding before anyone calls anything gives 2.</p>
<h3>Envido</h3>
<p>Before playing your first card you can call <b>envido</b> (2), <b>real envido</b> (3) or <b>falta envido</b> (whatever the leader needs to finish). They chain: envido, envido, real, falta. Your points: two cards of the same suit score 20 plus their values (face cards are 0); otherwise your highest card. Highest wins, ties go to the leading player. If they call truco on the first trick, you can still answer with envido: <b>envido comes first</b>. In pairs, only the <b>pies</b> (the last of each pair to play: the dealer and the leader's partner) call and answer the envido; the pie knows their partner's points, as if signalled.</p>
<p><b>With flor</b>: three cards of the same suit are announced automatically, score 3 and cancel the envido; if both sides have flor, the best one takes 3 per flor (at least 6).</p>
<p>Games go to 15 or 30 points, tallied with matchsticks: each closed square is five.</p>`,
};

// ---------------------------------------------------------------- guardado
const load = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`));
    return v ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};
const OPTS = { n: 2, level: 2, target: 30, flor: 0, ...load('opts', {}) };

const BOT_NAMES = ['Cacho', 'Pocha', 'Tito', 'Rosa', 'Beto', 'Chela', 'Ñato', 'Mirta', 'Coco', 'Tota'];
const COLORS = ['#ffc93c', '#ff7a59', '#4fd1a5', '#6fb7ff', '#d9a6ff', '#ff9ec7'];

// ---------------------------------------------------------------- temporizadores que se pausan
class Timers {
  constructor() {
    this.m = new Map();
    this.paused = false;
    this.speed = 1; // las pruebas lo suben para jugar rápido
  }
  set(name, ms, fn) {
    this.clear(name);
    const tm = { fn, due: 0, left: ms / this.speed, h: 0 };
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
const timers = new Timers();
/** Efectos que se cancelan juntos (al salir o al empezar otra partida). */
const fx = new Set();
const later = (ms, fn) => {
  const h = setTimeout(() => {
    fx.delete(h);
    fn();
  }, ms);
  fx.add(h);
  return h;
};
const cancelFx = () => {
  for (const h of fx) clearTimeout(h);
  fx.clear();
};

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // cpu | online | daily
  v: null,
  gid: -1,
  lastEv: 0,
  hand: -1,
  envMenu: false,
  mazoSure: 0,
  sel: -1, // carta elegida con teclado o mando
  daily: null,
  overShown: -1,
  handLog: [], // ganador de cada mano (para el resumen)
  handFlor: null,
  handEnv: null,
  rects: new Map(), // dónde estaba cada carta de mi mano (para animar la jugada)
};
let table = null;
let online = null;

const tableEl = $('table');
const pileEl = $('pile');
const handEl = $('hand');
const seatsEl = $('seats');
const L = { W: 0, H: 0, tw: 66, hw: 96, seat: [], seen: new Set() };

// ---------------------------------------------------------------- sonidos
const sfx = {
  card() {
    noise(0.05, { freq: 2600, q: 1.2, vol: 0.13, sweep: -1200 });
    noise(0.03, { freq: 900, q: 2, vol: 0.06, at: 0.04 });
  },
  deal(k) {
    for (let i = 0; i < k; i++) noise(0.035, { freq: 3000 + Math.random() * 800, q: 1.4, vol: 0.07, at: i * 0.075, sweep: -1500 });
  },
  shuffle() {
    for (let i = 0; i < 14; i++) noise(0.03, { freq: 2200 + Math.random() * 1400, q: 1.8, vol: 0.05, at: i * 0.028 });
  },
  truco: () => {
    tone(196, 147, 0.18, { type: 'square', vol: 0.06 });
    notes([392, 523.25], { step: 0.07, dur: 0.16, type: 'square', vol: 0.06, at: 0.04 });
  },
  envido: () => notes([523.25, 659.25, 587.33], { step: 0.07, dur: 0.14, type: 'triangle', vol: 0.08 }),
  flor: () => notes([783.99, 987.77, 1174.66, 1567.98], { step: 0.06, dur: 0.18, type: 'triangle', vol: 0.07 }),
  yes: () => notes([440, 554.37, 659.25], { step: 0.06, dur: 0.16, type: 'triangle', vol: 0.08 }),
  no: () => tone(330, 220, 0.22, { type: 'triangle', vol: 0.06 }),
  baza: (good) => (good ? notes([880, 1174.66], { step: 0.06, dur: 0.12, type: 'triangle', vol: 0.05 }) : tone(392, 330, 0.12, { type: 'triangle', vol: 0.04 })),
  point: () => notes([659.25, 783.99, 1046.5], { step: 0.07, dur: 0.18, type: 'triangle', vol: 0.07 }),
  lose: () => notes([440, 370, 294], { step: 0.12, dur: 0.24, type: 'triangle', vol: 0.05 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.09 }),
  turn: () => notes([660, 880], { step: 0.07, dur: 0.1, vol: 0.05 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode);
}
function setPlaying(on) {
  document.body.classList.toggle('playing', on);
}

// ---------------------------------------------------------------- empezar
function localIo() {
  return {
    emit: (i, view) => onView(view),
    timer: (k, ms, fn) => timers.set(k, ms, fn),
    clear: (k) => timers.clear(k),
    over: () => {},
  };
}
function resetGame(mode) {
  timers.clearAll();
  timers.resume();
  cancelFx();
  if (online && mode !== 'online') {
    online.leave();
    online = null;
  }
  S.mode = mode;
  S.gid = -1;
  S.v = null;
  S.overShown = -1;
  S.envMenu = false;
  S.sel = -1;
}
function begin(mode, seats, opts, extra = {}) {
  resetGame(mode);
  table = new Table({ seats, opts, io: localIo(), rng: Math.random, ...extra });
  setPlaying(true);
  show(null);
  table.start();
}
function cpuSeats(n, level) {
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const seats = [{ id: 'me', name: t('you'), color: COLORS[0], bot: 0 }];
  for (let i = 1; i < n; i++) seats.push({ id: `b${i}`, name: names[i - 1], color: COLORS[i], bot: level });
  return seats;
}
function startCpu() {
  begin('cpu', cpuSeats(OPTS.n, OPTS.level), { target: OPTS.target, flor: !!OPTS.flor });
}
function dailyInfo() {
  const date = today();
  return { date, n: dayNumber(EPOCH, date), rec: loadDay(ID, 'all', date) };
}
function startDaily() {
  const d = dailyInfo();
  if (d.rec) return showDailyResult(d);
  S.daily = d;
  markPortal(ID, { date: d.date, done: false, won: false });
  // cada mano del día sale de la fecha: todos reciben las mismas cartas, y la compu decide con la misma suerte
  const dealFn = (k) => shuffled(DECK, seeded(`truco:${d.date}:${k}`));
  const seats = [
    { id: 'me', name: t('you'), color: COLORS[0], bot: 0 },
    { id: 'b', name: 'Don Mate', color: '#4fd1a5', bot: 2 },
  ];
  begin('daily', seats, { target: 15, flor: false, first: 0 }, { dealFn, botRng: seeded(`truco:${d.date}:compu`) });
}

// ---------------------------------------------------------------- medidas y lugares
const relOf = (v, seat) => (seat - v.me + v.n) % v.n;
/** Lugar de un asiento según dónde está respecto de mí: 'me' abajo, 'top' enfrente, 'right' y 'left' a los costados. */
const placeOf = (v, seat) => (v.n === 2 ? ['me', 'top'] : ['me', 'right', 'top', 'left'])[relOf(v, seat)];

const landscapeMQ = matchMedia('(min-width: 820px) and (min-aspect-ratio: 13/10)');
landscapeMQ.addEventListener?.('change', () => {
  measure();
  if (S.v) render(S.v, false);
});
function measure() {
  const W = tableEl.clientWidth || innerWidth;
  const vh = innerHeight - 56;
  const hw = Math.round(clamp(landscapeMQ.matches ? vh * 0.185 : Math.min(innerWidth * 0.25, vh * 0.17), 74, 132));
  document.documentElement.style.setProperty('--hw', `${hw}px`);
  const H = tableEl.clientHeight || vh * 0.6;
  const four = S.v?.n === 4;
  const tw = Math.round(clamp(Math.min(W * (four ? 0.14 : 0.16), H * (four ? 0.19 : 0.2)), 46, 104));
  document.documentElement.style.setProperty('--tw', `${tw}px`);
  L.W = W;
  L.H = H;
  L.narrow = W < 600;
  L.tw = tw;
  L.hw = hw;
}

/** Dónde va la carta de la baza `b` del lugar `place` (centro, en coordenadas de la mesa). */
function slot(place, b, card) {
  const { W, H, tw } = L;
  const th = tw * 1.5;
  const four = S.v?.n === 4;
  const cx = W / 2;
  const rot = ((hashCard(card) % 9) - 4) * 0.9;
  const topSeat = 12 + 44 + 18 + tw * 0.62 * 1.5 * 0.7;
  const topY = Math.max(H * (four ? 0.3 : 0.33), topSeat + th * 0.5);
  const botY = Math.min(H * (four ? 0.76 : 0.8), H - th * 0.5 - 14);
  const gap = tw * (four ? 1.02 : 1.12);
  if (place === 'me') return { x: cx + (b - 1) * gap, y: Math.max(botY, topY + th * 1.05), r: rot };
  if (place === 'top') return { x: cx + (b - 1) * gap, y: topY, r: rot };
  const midY = (topY + botY) / 2;
  const sx = Math.min(tw * 2.12, W / 2 - (L.narrow ? 58 : 96) - tw * 0.5);
  return { x: place === 'right' ? cx + sx : cx - sx, y: midY + (b - 1) * th * 0.4, r: rot + (place === 'right' ? 4 : -4) };
}
function hashCard(c) {
  let h = 7;
  for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h;
}
/** Centro del asiento (para los globos, el mazo y las cartas que salen de ahí). */
function seatPoint(place) {
  const { W, H } = L;
  if (place === 'top') return { x: W / 2, y: 40 };
  const side = L.narrow ? 30 : 56;
  if (place === 'right') return { x: W - side, y: H * 0.5 };
  if (place === 'left') return { x: side, y: H * 0.5 };
  return { x: W / 2, y: H + L.hw * 0.6 };
}

// ---------------------------------------------------------------- lo que llega de la mesa
function onView(v) {
  if (v.gid !== S.gid) {
    // otra partida (o la primera vista): nada de animar lo viejo
    S.gid = v.gid;
    S.lastEv = v.ev.length ? v.ev[v.ev.length - 1].id : 0;
    S.hand = v.hand ? v.hand.num : -1;
    S.overShown = -1;
    S.handLog = [];
    pileEl.innerHTML = '';
    handEl.innerHTML = '';
    hideToast();
    S.v = v;
    measure();
    render(v, false);
    return;
  }
  const prev = S.v;
  S.v = v;
  if (prev?.n !== v.n) measure();
  // las cartas de mi mano antes de cambiar (para que la jugada salga de ahí)
  for (const el of handEl.children) S.rects.set(el.dataset.card, el.getBoundingClientRect());
  const fresh = v.ev.filter((e) => e.id > S.lastEv);
  if (fresh.length) S.lastEv = fresh[fresh.length - 1].id;
  const newHand = v.hand && v.hand.num !== S.hand;
  if (newHand) {
    S.hand = v.hand.num;
    S.envMenu = false;
    S.mazoSure = 0;
    S.sel = -1;
    S.handEnv = null;
    S.handFlor = null;
  }
  render(v, true, newHand);
  fresh.forEach((e) => playEvent(e, v));
  if (v.phase === 'over' && S.overShown !== v.gid) {
    S.overShown = v.gid;
    later(2600, () => S.v === v && showOver(v));
  }
}

function seatName(v, i) {
  return v.seats[i]?.name ?? '';
}
const mineTeam = (v) => teamOf(v.me);
/** Cómo se nombra a un equipo desde mi lugar: en el mano a mano, vos o el nombre del otro; en parejas, nosotros o ellos. */
function teamLabel(v, team, short = false) {
  if (v.n === 2) return team === mineTeam(v) ? t('you') : seatName(v, (v.me + 1) % 2);
  return team === mineTeam(v) ? t(short ? 'usShort' : 'us') : t(short ? 'themShort' : 'them');
}

function playEvent(e, v) {
  const place = (s) => placeOf(v, s);
  switch (e.k) {
    case 'deal':
      sfx.shuffle();
      later(260, () => sfx.deal(v.n * 3));
      break;
    case 'play':
      sfx.card();
      break;
    case 'baza':
      later(380, () => {
        if (e.team >= 0) sfx.baza(e.team === mineTeam(v));
      });
      break;
    case 'call': {
      const what = e.what;
      const cls = what === 'flor' ? 'flor' : ['envido', 'real', 'falta'].includes(what) ? 'envido' : 'truco';
      bubble(v, e.seat, t(`c_${what}`), cls, '', 2400);
      if (cls === 'truco') {
        sfx.truco();
        if (place(e.seat) !== 'me' || v.n === 4) callout(t(`c_${what}`).replace('Quiero ', '').replace('quiero ', ''), seatName(v, e.seat), 'truco');
      } else if (cls === 'flor') sfx.flor();
      else {
        sfx.envido();
        if (what === 'falta') callout(t('c_falta'), seatName(v, e.seat), 'envido');
      }
      if (e.seat !== v.me) S.envMenu = false;
      break;
    }
    case 'answer':
      bubble(v, e.seat, t(e.yes ? 'c_quiero' : 'c_noquiero'), e.yes ? 'yes' : 'no', '', 1800);
      (e.yes ? sfx.yes : sfx.no)();
      break;
    case 'envido':
      S.handEnv = e;
      if (e.yes) {
        const [a, b] = e.said;
        later(650, () => bubble(v, a.seat, t('c_tengo', { p: a.pts }), 'pts', t('b_envido'), 2400));
        // el segundo dice si son mejores o son buenas, y siempre se ven sus puntos
        const buenas = b.buenas ?? b.pts === null;
        later(1450, () => bubble(v, b.seat, t(buenas ? 'c_buenas' : 'c_mejores', { p: b.pts ?? '?' }), buenas ? 'no' : 'pts', '', 2400));
        later(1500, () => {
          flashScore(e.winner);
          (e.winner === mineTeam(v) ? sfx.point : sfx.lose)();
        });
      } else
        later(300, () => {
          flashScore(e.winner);
          if (e.winner === mineTeam(v)) sfx.point();
        });
      break;
    case 'flor':
      S.handFlor = e;
      later(400, () => {
        sfx.flor();
        callout(t('c_flor'), `${teamLabel(v, e.winner)} +${e.pts}`, 'flor');
        flashScore(e.winner);
      });
      break;
    case 'mazo':
      bubble(v, e.seat, t('c_mazo'), 'no', '', 2200);
      sfx.no();
      break;
    case 'hand':
      S.handLog.push(e.team);
      later(e.why === 'bazas' ? 700 : 900, () => {
        if (S.v?.gid !== v.gid) return;
        showToast(v, e);
        flashScore(e.team);
        (e.team === mineTeam(v) ? sfx.point : sfx.lose)();
      });
      break;
    case 'over':
      later(1800, () => (e.team === mineTeam(v) ? sfx.win : sfx.lose)());
      break;
  }
}

// ---------------------------------------------------------------- dibujo
function render(v, animate, newHand = false) {
  if (!v.hand) return;
  renderSeats(v, animate && newHand);
  renderPile(v, animate, newHand);
  renderHand(v, animate && newHand);
  renderBar(v);
  renderInfo(v);
  renderScore(v);
  renderWorth(v);
  $('b-pause').hidden = false;
}

/** Lo que vale la mano ahora (con el truco querido o, en gris, lo que se está proponiendo). */
function renderWorth(v) {
  const el = $('worth');
  const h = v.hand;
  const p = h.pending?.kind === 'truco' ? h.pending : null;
  const level = p ? p.level : h.truco.level;
  el.hidden = !level || h.over;
  if (el.hidden) return;
  const txt = t('worth', { x: t(`b_${TRUCO[level]}`), n: level + 1 });
  if (el.textContent !== txt) {
    el.textContent = txt;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }
  el.classList.toggle('asking', !!p);
}

function renderSeats(v, dealing) {
  const h = v.hand;
  const want = v.seats.map((s, i) => i).filter((i) => i !== v.me);
  // un elemento por asiento (se arma una vez por partida y se actualiza)
  if (seatsEl.dataset.gid !== String(v.gid) || seatsEl.children.length !== want.length) {
    seatsEl.dataset.gid = String(v.gid);
    seatsEl.innerHTML = want
      .map((i) => {
        const s = v.seats[i];
        const pl = placeOf(v, i);
        return `<div class="seat ${pl === 'top' ? '' : 'side'} ${pl}" data-seat="${i}">
          <div class="av" style="--c:${esc(s.color)}">${esc([...s.name][0] || '?')}${v.n === 4 ? `<i class="team-dot t${teamOf(i) === mineTeam(v) ? 0 : 1}"></i>` : ''}<i class="chip-mano" hidden>${t('mano')}</i><i class="cnt"></i></div>
          <div class="nm">${esc(s.name)}${s.bot ? ` <small>${t('cpu')}</small>` : ''}</div>
          <div class="backs"></div>
          <div class="bubble"></div>
        </div>`;
      })
      .join('');
    L.seen.clear();
  }
  for (const el of seatsEl.children) {
    const i = +el.dataset.seat;
    const s = v.seats[i];
    const pl = placeOf(v, i);
    const p = seatPoint(pl);
    if (pl === 'top') {
      el.style.left = `${p.x}px`;
      el.style.top = '10px';
    } else {
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }
    el.classList.toggle('turn', h.actor === i);
    el.classList.toggle('narrow', !!L.narrow);
    el.querySelector('.cnt').textContent = s.left ? `×${s.left}` : '';
    el.classList.toggle('away', !!s.away);
    el.querySelector('.chip-mano').hidden = h.mano !== i;
    const backs = el.querySelector('.backs');
    const k = s.left;
    if (backs.children.length !== k || dealing) {
      backs.innerHTML = '';
      for (let j = 0; j < k; j++) {
        const img = document.createElement('img');
        img.src = cardURL(null);
        img.alt = '';
        const off = j - (k - 1) / 2;
        img.style.transform = `translateX(${off * L.tw * 0.32}px) rotate(${off * 9}deg)`;
        if (dealing && !reduced()) img.animate([{ opacity: 0, transform: `translateY(30px) scale(.6)` }, { opacity: 1 }], { duration: 260, delay: 120 + (j * v.n + relOf(v, i)) * 75, fill: 'backwards', easing: 'ease-out' });
        backs.append(img);
      }
    }
  }
}

const reduced = () => document.documentElement.classList.contains('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;

function renderPile(v, animate, newHand) {
  const h = v.hand;
  const keep = new Set();
  // en una mano nueva, lo de la anterior se va al mazo
  if (newHand) {
    const dealer = (h.mano - 1 + v.n) % v.n;
    const to = seatPoint(placeOf(v, dealer));
    for (const el of [...pileEl.children]) {
      if (!animate || reduced()) {
        el.remove();
        continue;
      }
      const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
      el.animate([{ opacity: 1 }, { transform: `translate(${to.x - x}px, ${to.y - y}px) rotate(0deg) scale(.5)`, opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).onfinish = () => el.remove();
    }
  }
  h.bazas.forEach((b, bi) => {
    b.plays.forEach((p) => {
      const key = `${h.num}:${p.card}`;
      keep.add(key);
      let el = pileEl.querySelector(`[data-key="${key}"]`);
      const pl = placeOf(v, p.seat);
      const pos = slot(pl, bi, p.card);
      if (!el) {
        el = document.createElement('div');
        el.className = 'naipe';
        el.dataset.key = key;
        el.innerHTML = `<img alt="" src="${cardURL(p.card)}">`;
        pileEl.append(el);
        place(el, pos);
        if (animate && !reduced()) flyIn(el, p, pl, pos, v);
      } else place(el, pos);
      el.style.zIndex = String(10 + bi * 4 + (pl === 'me' ? 2 : 1));
      const done = b.res !== null && b.res !== undefined;
      el.classList.toggle('won', done && b.res >= 0 && teamOf(p.seat) === b.res && b.win === p.seat);
      el.classList.toggle('lost', done && b.res >= 0 && !(teamOf(p.seat) === b.res && b.win === p.seat));
      el.classList.toggle('parda', done && b.res === -1);
    });
  });
  for (const el of [...pileEl.children]) if (el.dataset.key && !keep.has(el.dataset.key) && !el.getAnimations().length) el.remove();
}
function place(el, pos) {
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.style.transform = `rotate(${pos.r}deg)`;
}
/** La carta vuela desde la mano (o desde el lugar del que la tiró) hasta la mesa. */
function flyIn(el, p, pl, pos, v) {
  let from;
  if (pl === 'me') {
    const r = S.rects.get(p.card);
    const tr = tableEl.getBoundingClientRect();
    from = r ? { x: r.left + r.width / 2 - tr.left, y: r.top + r.height / 2 - tr.top, s: r.width / L.tw } : { x: L.W / 2, y: L.H + L.hw * 0.6, s: L.hw / L.tw };
  } else {
    const sp = seatPoint(pl);
    from = { x: sp.x, y: sp.y + (pl === 'top' ? L.tw * 0.9 : 0), s: 0.6 };
  }
  el.animate(
    [
      { transform: `translate(${from.x - pos.x}px, ${from.y - pos.y}px) rotate(${pl === 'me' ? 0 : pos.r * 4}deg) scale(${from.s})` },
      { transform: `rotate(${pos.r}deg)` },
    ],
    { duration: 330, easing: 'cubic-bezier(.2,.8,.3,1)' },
  );
}
function renderHand(v, dealing) {
  const h = v.hand;
  const mine = h.mine;
  const live = !!v.can.play;
  handEl.classList.toggle('idle', !live && !v.can.quiero);
  // sacar las que ya no están
  for (const el of [...handEl.children]) if (!mine.includes(el.dataset.card)) el.remove();
  const k = mine.length;
  const W = handEl.clientWidth || innerWidth;
  const spread = Math.min(L.hw * 0.82, (W - L.hw) / Math.max(1, k - 1));
  mine.forEach((c, i) => {
    let el = handEl.querySelector(`[data-card="${c}"]`);
    const isNew = !el;
    if (!el) {
      el = document.createElement('button');
      el.className = 'naipe';
      el.dataset.card = c;
      el.setAttribute('aria-label', c);
      el.innerHTML = `<img alt="" src="${cardURL(c)}">`;
      el.onclick = () => playCard(c);
      handEl.append(el);
    }
    const off = i - (k - 1) / 2;
    el.style.left = `${W / 2 + off * spread}px`;
    el.style.setProperty('--tf', `translateY(${Math.abs(off) * 7}px) rotate(${off * 6}deg)`);
    el.style.transform = 'var(--tf)';
    el.style.zIndex = String(i + 1);
    el.classList.toggle('live', live);
    el.classList.toggle('sel', S.sel === i && live);
    if (isNew && dealing && !reduced()) {
      const dealer = (h.mano - 1 + v.n) % v.n;
      const dp = seatPoint(placeOf(v, dealer));
      const tr = tableEl.getBoundingClientRect(), hr = handEl.getBoundingClientRect();
      const dx = dp.x + tr.left - (hr.left + W / 2 + off * spread), dy = dp.y + tr.top - (hr.top + L.hw * 0.75);
      const order = i * v.n + ((v.me - h.mano + v.n) % v.n);
      el.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(${-20 + off * 10}deg) scale(.45)`, opacity: 0.4 }, { transform: `translateY(${Math.abs(off) * 7}px) rotate(${off * 6}deg)`, opacity: 1 }], {
        duration: 360,
        delay: 140 + order * 75,
        easing: 'cubic-bezier(.2,.8,.3,1)',
        fill: 'backwards',
      });
    }
  });
}

function btn(label, cls, fn, title = '') {
  const b = document.createElement('button');
  b.className = `act ${cls}`;
  b.textContent = label;
  if (title) b.title = title;
  b.onclick = () => {
    sfx.ui();
    fn();
  };
  return b;
}
function renderBar(v) {
  const bar = $('bar');
  const C = v.can;
  const h = v.hand;
  const items = [];
  const envOpts = (kinds) => kinds.map((k) => btn(t(`b_${k}`), 'envido small', () => send({ t: 'envido', kind: k })));
  if (C.quiero) {
    const p = h.pending;
    items.push(btn(t('b_quiero'), 'yes', () => send({ t: 'quiero' })), btn(t('b_noquiero'), 'no', () => send({ t: 'noquiero' })));
    if (C.truco) items.push(btn(t(`b_${C.truco}`), 'truco', () => send({ t: 'truco' })));
    if (C.envido.length) {
      if (p.kind === 'envido' || S.envMenu) items.push(...envOpts(C.envido));
      else items.push(btn(t('b_envidoMenu'), 'envido', () => ((S.envMenu = true), renderBar(S.v))));
    }
  } else if (C.play) {
    if (S.envMenu && C.envido.length) {
      items.push(...envOpts(C.envido), btn('✕', 'x', () => ((S.envMenu = false), renderBar(S.v))));
    } else {
      if (C.truco) items.push(btn(t(`b_${C.truco}`), 'truco', () => send({ t: 'truco' })));
      if (C.envido.length) items.push(btn(t('b_envidoMenu'), 'envido', () => ((S.envMenu = true), renderBar(S.v))));
      const sure = S.mazoSure > performance.now();
      items.push(
        btn(t(sure ? 'b_mazoSure' : 'b_mazo'), 'mazo', () => {
          if (S.mazoSure > performance.now()) send({ t: 'mazo' });
          else {
            S.mazoSure = performance.now() + 2500;
            renderBar(S.v);
            later(2600, () => S.v && renderBar(S.v));
          }
        }),
      );
    }
  }
  const sig = items.map((b) => b.textContent + b.className).join('|');
  if (bar.dataset.sig === sig) return;
  bar.dataset.sig = sig;
  bar.replaceChildren(...items);
}

function renderInfo(v) {
  const h = v.hand;
  const a = h.actor;
  let st = '';
  if (h.over || v.phase !== 'play') st = '';
  else if (a === v.me) st = h.pending ? t('st_you', { what: t(h.pending.kind === 'envido' ? 'n_envido' : `n_${TRUCO[h.pending.level]}`) }) : t('st_play');
  else if (a >= 0) {
    const s = v.seats[a];
    st = s.away ? t('st_away', { name: s.name }) : h.pending ? t('st_answer', { name: s.name }) : s.bot ? t('st_think', { name: s.name }) : t('st_wait', { name: s.name });
  } else if (h.wait && h.bazas.length === 1 && !h.bazas[0].plays.length && !h.calls.length) {
    const dealer = (h.mano - 1 + v.n) % v.n;
    st = dealer === v.me ? t('st_dealYou') : t('st_deal', { name: seatName(v, dealer) });
  }
  $('status').textContent = st;
  // mis puntos de envido (solo mientras se puede cantar) y si soy mano
  const first = h.bazas.length === 1 && !h.bazas[0].plays.some((p) => p.seat === v.me) && !h.over;
  const hint = $('env-hint');
  if (first && h.env.state === 'open') {
    hint.hidden = false;
    const pie = pieOf(teamOf(v.me), h.mano, v.n);
    const p = envido(h.dealt);
    // de a cuatro el envido lo canta el pie: él ve los puntos de su compañero (la seña) y el otro sabe quién canta
    if (v.flor && hasFlor(h.dealt)) hint.textContent = t('florHint');
    else if (v.n === 4 && pie !== v.me) hint.textContent = t('envHintPie', { p, name: seatName(v, pie) });
    else if (v.n === 4 && typeof h.partnerEnv === 'number') hint.textContent = t('envHintMate', { p, q: h.partnerEnv });
    else hint.textContent = t('envHint', { p });
  } else hint.hidden = true;
  $('me-mano').hidden = !(h.mano === v.me && first);
  $('me-mano').textContent = t('manoTag');
}

/** Fósforos: cada cinco puntos, un cuadradito con su diagonal. */
function matchSVG(n, target, size) {
  const groups = target / 5;
  const gw = size, gap = Math.round(size * 0.35);
  const sep = target === 30 ? Math.round(size * 0.55) : 0;
  const width = groups * gw + (groups - 1) * gap + sep;
  const sw = Math.max(1.6, size * 0.12);
  let out = '';
  for (let g = 0; g < groups; g++) {
    const x = g * (gw + gap) + (g >= 3 && sep ? sep : 0);
    const k = clamp(n - g * 5, 0, 5);
    const m = sw;
    const sticks = [
      [x + m, m, x + m, gw - m], // izquierda
      [x + m, m, x + gw - m, m], // arriba
      [x + gw - m, m, x + gw - m, gw - m], // derecha
      [x + m, gw - m, x + gw - m, gw - m], // abajo
      [x + m * 1.5, gw - m * 1.5, x + gw - m * 1.5, m * 1.5], // diagonal
    ];
    sticks.forEach(([x1, y1, x2, y2], i) => {
      const on = i < k;
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? '#f0d2a0' : 'rgba(255,255,255,.12)'}" stroke-width="${sw}" stroke-linecap="round"/>`;
      if (on) out += `<circle cx="${x2}" cy="${y2}" r="${sw * 0.95}" fill="#e2412b"/>`;
    });
  }
  if (sep) out += `<line x1="${3 * (gw + gap) - gap / 2 + sep / 2}" y1="0" x2="${3 * (gw + gap) - gap / 2 + sep / 2}" y2="${gw}" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-dasharray="2 2"/>`;
  return `<svg width="${width}" height="${gw}" viewBox="0 0 ${width} ${gw}">${out}</svg>`;
}
function renderScore(v) {
  const el = $('score');
  // grande y claro cuando hay lugar; en pantallas bajas (celular acostado) queda chico, para no tapar a los de los costados
  const big = L.W > 700 && L.H > 520;
  const mid = !big && L.H > 420;
  const size = big ? 25 : mid ? 20 : L.W > 700 ? 18 : 15;
  const me = mineTeam(v);
  const teams = [me, 1 - me];
  const html = teams
    .map(
      (tm, k) =>
        `<span class="h">${esc(teamLabel(v, tm, true))}</span><span class="n t${k}" data-team="${tm}">${v.scores[tm]}</span><span style="grid-column:1/3">${matchSVG(v.scores[tm], v.target, size)}</span>`,
    )
    .join('');
  const sig = `${v.scores}|${v.target}|${size}|${G.prefs.lang}|${v.gid}`;
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.innerHTML = html;
  el.style.gridTemplateColumns = 'auto auto';
  el.classList.toggle('big', big);
  el.classList.toggle('mid', mid);
}
function flashScore(team) {
  const el = $('score').querySelector(`[data-team="${team}"]`);
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// globos, anuncios y resumen
const bubbleT = new Map();
function bubble(v, seat, text, cls, small = '', ms = 2000) {
  const el = seat === v.me ? $('me-bubble') : seatsEl.querySelector(`[data-seat="${seat}"] .bubble`);
  if (!el) return;
  el.innerHTML = `${esc(text)}${small ? `<small>${esc(small)}</small>` : ''}`;
  el.className = `bubble ${seat === v.me ? 'mine' : ''} ${cls}`;
  const pl = placeOf(v, seat);
  if (pl === 'top') Object.assign(el.style, { left: `calc(50% + 32px)`, top: '0px', right: '' });
  else if (pl === 'right') Object.assign(el.style, { right: `calc(50% + 28px)`, left: '', top: '-6px' });
  else if (pl === 'left') Object.assign(el.style, { left: `calc(50% + 28px)`, right: '', top: '-6px' });
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(bubbleT.get(el));
  bubbleT.set(
    el,
    setTimeout(() => el.classList.remove('on'), ms),
  );
}
let calloutT = 0;
function callout(big, small, kind) {
  const el = $('callout');
  $('callout-t').textContent = big;
  $('callout-s').textContent = small;
  $('callout-s').hidden = !small;
  el.className = `callout ${kind || ''}`;
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(calloutT);
  calloutT = setTimeout(() => el.classList.remove('on'), 1600);
}
let toastT = 0;
function showToast(v, e) {
  const me = mineTeam(v);
  const mine = e.team === me;
  const loser = 1 - e.team;
  const other = seatName(v, (v.me + 1) % 2);
  const title = v.n === 2 ? (mine ? t('h_you') : t('h_name', { name: other })) : mine ? t('h_us') : t('h_them');
  let why;
  if (e.why === 'bazas') why = e.truco ? t('w_quiso', { x: t(`b_${TRUCO[e.truco]}`) }) : t('w_plain');
  else if (e.why === 'noquiero') {
    const x = noquieroWhat(v, e);
    why = v.n === 2 ? (loser === me ? t('w_noYou', { x }) : t('w_noName', { name: other, x })) : loser === me ? t('w_noUs', { x }) : t('w_noThem', { x });
  } else why = v.n === 2 ? (loser === me ? t('w_mazoYou') : t('w_mazoName', { name: other })) : loser === me ? t('w_mazoUs') : t('w_mazoThem');
  const lines = [`<p>${esc(why)} · <em>+${e.pts}</em>${e.env ? ` <small>(${esc(t('w_mazoEnv'))})</small>` : ''}</p>`];
  const en = S.handEnv;
  if (en) {
    // cuánto tenía cada uno: primero lo mío (o lo de mi pareja) y después lo del rival
    let detail = t('e_no');
    if (en.yes) {
      const me = mineTeam(v);
      const ptsOf = (tm) => en.said.find((x) => teamOf(x.seat) === tm)?.pts ?? '?';
      detail = t('e_pts', { a: teamLabel(v, me), p: ptsOf(me), b: teamLabel(v, 1 - me), q: ptsOf(1 - me) });
    }
    lines.push(`<p>${esc(t('e_line', { who: teamLabel(v, en.winner), p: en.pts }))} ${en.yes ? `<b class="env-pts">${esc(detail)}</b>` : `<small>(${esc(detail)})</small>`}</p>`);
  }
  if (S.handFlor) lines.push(`<p>${esc(t('f_line', { who: teamLabel(v, S.handFlor.winner), p: S.handFlor.pts }))}</p>`);
  // las cartas con las que se ganó el envido (o la flor), para que se vea que eran ciertos
  const proof = e.show?.[0] || S.handFlor?.show;
  if (proof) lines.push(`<div class="proof"><span>${esc(proof.seat === v.me ? t('you') : seatName(v, proof.seat))}</span>${proof.cards.map((c) => `<img alt="" src="${cardURL(c)}">`).join('')}</div>`);
  const el = $('toast');
  el.innerHTML = `<b class="t${mine ? 0 : 1}">${esc(title)}</b>${lines.join('')}`;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastT);
  toastT = setTimeout(hideToast, PACE.HAND - 1000);
}
/** Qué no se quiso (el último canto de truco de la mano). */
function noquieroWhat(v, e) {
  const calls = v.hand.calls.filter((c) => c.what === 'truco' || c.what === 'retruco' || c.what === 'vale4');
  const last = calls[calls.length - 1];
  return t(`n_${last ? last.what : 'truco'}`);
}
function hideToast() {
  clearTimeout(toastT);
  $('toast').hidden = true;
}

// ---------------------------------------------------------------- acciones
function send(msg) {
  unlock();
  S.envMenu = false;
  S.mazoSure = 0;
  if (S.mode === 'online') online?.send(msg);
  else if (table) {
    if (!table.act(table.seats.findIndex((s) => !s.bot), msg)) return;
  }
  if (S.v && S.mode === 'online') renderBar(S.v);
}
function playCard(c) {
  const v = S.v;
  if (!v?.can.play || !v.hand.mine.includes(c)) return;
  send({ t: 'play', card: c });
}

// ---------------------------------------------------------------- fin de la partida
function showOver(v) {
  const res = v.result;
  if (!res) return;
  if (S.mode === 'daily') return finishDaily(v);
  const me = mineTeam(v);
  const won = res.winner === me;
  $('over-kicker').textContent = t('overKicker');
  $('over-title').textContent = v.n === 2 ? t(won ? 'youWin' : 'youLose') : t(won ? 'usWin' : 'usLose');
  renderFinal(v);
  $('over-stats').hidden = true;
  $('over-next').hidden = true;
  $('b-share').hidden = true;
  $('over-status').textContent = '';
  const again = $('b-again');
  if (S.mode === 'online') {
    const host = online?.isHost;
    $('b-again-t').textContent = host ? t('again') : t('waitAgain');
    again.disabled = !host;
  } else {
    $('b-again-t').textContent = t('rematch');
    again.disabled = false;
  }
  again.hidden = false;
  show('over');
}
function renderFinal(v) {
  const me = mineTeam(v);
  const w = v.result?.winner;
  const who = (tm) =>
    v.seats
      .map((s, i) => (teamOf(i) === tm ? (i === v.me ? t('you') : s.name) : null))
      .filter(Boolean)
      .join(' y ');
  $('over-final').innerHTML = [me, 1 - me]
    .map((tm) => {
      const hands = S.handLog.filter((x) => x === tm).length;
      return `<div class="${tm === w ? 'win' : ''}"><span class="h">${esc(teamLabel(v, tm))}</span><span class="n">${v.scores[tm]}</span>${v.n === 4 ? `<span class="who">${esc(who(tm))}</span>` : ''}<span class="who">${hands} ${t('handsWon')}</span></div>`;
    })
    .join('');
}

function finishDaily(v) {
  const d = S.daily || dailyInfo();
  const me = mineTeam(v);
  const won = v.result.winner === me;
  const a = v.scores[me], b = v.scores[1 - me];
  const stats = record(ID, 'all', { date: d.date, won, score: clamp(a - b, 0, 15) });
  saveDay(ID, 'all', { won, a, b, hands: S.handLog.map((x) => (x === me ? 1 : 0)) }, d.date);
  markPortal(ID, { date: d.date, done: true, won, streak: stats.streak });
  showDailyResult(dailyInfo(), stats);
}
let dayTimer = 0;
function showDailyResult(d, stats = null) {
  const rec = d.rec;
  if (!rec) return;
  const st = stats || loadStats(ID, 'all');
  $('over-kicker').textContent = t('dailyKicker', { n: d.n });
  $('over-title').textContent = t(rec.won ? 'dailyWon' : 'dailyLost', { a: rec.a, b: rec.b });
  $('over-final').innerHTML = `<div class="${rec.won ? 'win' : ''}"><span class="hands">${(rec.hands || []).map((x) => (x ? '🟩' : '🟥')).join('')}</span><span class="who">${(rec.hands || []).filter(Boolean).length}/${(rec.hands || []).length} ${t('handsWon')}</span></div>`;
  $('over-stats').hidden = false;
  $('over-stats').innerHTML = [
    [st.played, t('stPlayed')],
    [st.streak, t('stStreak')],
    [Math.max(st.best || 0, st.streak), t('stBest')],
  ]
    .map(([x, k]) => `<span><b>${x}</b><small>${k}</small></span>`)
    .join('');
  $('over-next').hidden = false;
  clearInterval(dayTimer);
  const tick = () => {
    $('over-clock').textContent = fmtClock(msUntilNext());
    if (today() !== d.date) {
      clearInterval(dayTimer);
      refreshHome();
    }
  };
  tick();
  dayTimer = setInterval(tick, 1000);
  $('b-share').hidden = false;
  $('b-again').hidden = true;
  $('over-status').textContent = '';
  show('over');
}
$('b-share').onclick = async () => {
  const d = dailyInfo();
  if (!d.rec) return;
  const row = (d.rec.hands || []).map((x) => (x ? '🟩' : '🟥')).join('');
  const r = await share(`game.it · ${t('title')} #${d.n}\n🃏 ${t(d.rec.won ? 'dailyWon' : 'dailyLost', { a: d.rec.a, b: d.rec.b })}\n${row}\n${shareLink(ID)}`);
  $('over-status').textContent = r === 'failed' ? '' : t('sharedOk');
};
$('b-again').onclick = async () => {
  if (S.mode === 'online') {
    if (online?.isHost) online.send({ t: 'again' });
    return;
  }
  try {
    await G.commercialBreak('revancha');
  } catch {}
  startCpu();
};
$('b-over-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- menú
function toMenu() {
  timers.clearAll();
  cancelFx();
  clearInterval(dayTimer);
  if (online) {
    online.leave();
    online = null;
  }
  table = null;
  S.mode = null;
  S.v = null;
  S.gid = -1;
  pileEl.innerHTML = '';
  handEl.innerHTML = '';
  seatsEl.innerHTML = '';
  hideToast();
  setPlaying(false);
  refreshHome();
  show('home');
}
function refreshHome() {
  const d = dailyInfo();
  $('b-daily-sub').textContent = d.rec ? t(d.rec.won ? 'dailyDoneW' : 'dailyDoneL', { n: d.n, a: d.rec.a, b: d.rec.b }) : t('dailySub', { n: d.n });
  $('logo').innerHTML = ['7e', '1e', '1b'].map((c) => `<img alt="" src="${cardURL(c)}">`).join('');
}
function syncSeg(id, val) {
  $$(`#${id} button`).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(val)));
}
function bindSeg(id, key, after) {
  for (const b of $$(`#${id} button`))
    b.onclick = () => {
      OPTS[key] = Number(b.dataset.v);
      save('opts', OPTS);
      syncSeg(id, OPTS[key]);
      after?.();
    };
}
const nHelp = () => ($('o-n-help').textContent = t(OPTS.n === 4 ? 'fHelp4' : 'fHelp2'));
bindSeg('o-n', 'n', nHelp);
bindSeg('o-level', 'level');
bindSeg('o-target', 'target');
bindSeg('o-flor', 'flor');
function syncOpts() {
  syncSeg('o-n', OPTS.n);
  syncSeg('o-level', OPTS.level);
  syncSeg('o-target', OPTS.target);
  syncSeg('o-flor', OPTS.flor);
  nHelp();
}
$('b-cpu').onclick = () => {
  syncOpts();
  show('cpu');
};
$('b-cpu-go').onclick = () => {
  unlock();
  startCpu();
};
$('b-cpu-back').onclick = () => show('home');
$('b-daily').onclick = () => {
  unlock();
  startDaily();
};
$('b-rules').onclick = () => {
  S.rulesBack = 'home';
  show('rules');
};
$('b-rules-ok').onclick = () => (S.rulesBack === 'pause' ? show('pause') : show('home'));
/** Qué carta mata a cuál, de la más fuerte a la más débil. */
const RANK = [
  ['1e', { es: 'Ancho de espadas', en: 'Ace of swords' }],
  ['1b', { es: 'Ancho de bastos', en: 'Ace of clubs' }],
  ['7e', { es: '7 de espadas', en: '7 of swords' }],
  ['7o', { es: '7 de oros', en: '7 of coins' }],
  ['3e', { es: 'Los 3', en: 'All 3s' }],
  ['2e', { es: 'Los 2', en: 'All 2s' }],
  ['1o', { es: 'Anchos de oros y copas', en: 'Aces of coins and cups' }],
  ['12e', { es: 'Los reyes (12)', en: 'Kings (12)' }],
  ['11e', { es: 'Los caballos (11)', en: 'Knights (11)' }],
  ['10e', { es: 'Las sotas (10)', en: 'Jacks (10)' }],
  ['7c', { es: '7 de copas y bastos', en: '7 of cups and clubs' }],
  ['6e', { es: 'Los 6', en: 'All 6s' }],
  ['5e', { es: 'Los 5', en: 'All 5s' }],
  ['4e', { es: 'Los 4', en: 'All 4s' }],
];
function renderRules() {
  const rank = RANK.map(([c, l], i) => `<span><b>${i + 1}</b><img alt="" src="${cardURL(c)}"><i>${esc(G.t(l))}</i></span>`).join('');
  $('rules-body').innerHTML = G.t(RULES).replace('{rank}', rank);
}

// pausa (en línea no se pausa la mesa: es solo el menú)
function pause() {
  if (!S.mode || $$('.screen.on').length) return;
  if (S.mode !== 'online') timers.pause();
  show('pause');
}
function resume() {
  show(null);
  timers.resume();
}
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom(ID, {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'g') {
        if (S.mode !== 'online') {
          resetGame('online');
          setPlaying(true);
        }
        if ($$('.screen.on').some((s) => ['s-lobby', 's-online', 's-over'].includes(s.id))) show(null);
        onView(m.s);
      } else if (m.t === 'error') {
        const txt = m.code === 'need_players' ? t('needPlayers') : m.code === 'too_many' ? t('tooMany') : netText(m.code);
        $('on-status').textContent = txt;
        $('lobby-status').textContent = txt;
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = null;
        S.v = null;
        setPlaying(false);
        show('online');
      }
    },
  });
  return online;
}
$('b-online').onclick = () => {
  $('on-name').value ||= defaultName();
  $('on-status').textContent = '';
  show('online');
};
$('on-back').onclick = () => {
  if (online) {
    online.leave();
    online = null;
  }
  show('home');
};
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
$('lobby-start').onclick = () => online?.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online?.leave();
  online = null;
  S.mode = null;
  show('online');
};
$('lobby-code').onclick = async () => {
  if (!online?.room) return;
  const r = await shareRoom(ID, online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};
for (const seg of $$('#lobby-host .seg'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !online?.isHost) return;
    const st = { ...(online.room.settings || {}) };
    st[seg.dataset.k] = Number(b.dataset.v);
    online.send({ t: 'settings', settings: st });
  };
function applyRoom(room) {
  if (room.state !== 'lobby') return;
  if (S.mode === 'online') {
    S.mode = null;
    S.v = null;
    setPlaying(false);
  }
  $('lobby-code').textContent = room.code;
  const st = room.settings || {};
  const n = st.n || 2;
  const people = room.players.filter((p) => p.connected);
  const seats = seatOrder(people.length, n, st.pair);
  const tag = (seat) => (n === 4 ? `<span class="tm t${seat % 2}">${t(seat % 2 ? 'teamB' : 'teamA')}</span>` : '');
  let html = room.players
    .map((p) => {
      const k = people.indexOf(p);
      const seat = k >= 0 && k < seats.length ? seats[k] : -1;
      return `<li><i style="background:${esc(p.color)}"></i><span>${esc(p.name)}</span>${seat >= 0 ? tag(seat) : ''}<small>${[p.id === online.myId ? t('youLower') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`;
    })
    .join('');
  const used = new Set(seats);
  const free = [0, 1, 2, 3].slice(0, n).filter((s) => !used.has(s));
  html += free.map((s, i) => `<li><i style="background:#cfc3ad"></i><span>${BOT_NAMES[i]}</span>${tag(s)}<small>${t('cpu')}</small></li>`).join('');
  $('lobby-players').innerHTML = html;
  for (const seg of $$('#lobby-host .seg')) {
    const k = seg.dataset.k;
    $$('button', seg).forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.v) === Number(st[k]));
      b.disabled = !online.isHost;
    });
  }
  $('lobby-pair').hidden = n !== 4;
  $('lobby-start').hidden = !online.isHost;
  const err = people.length < 2 ? t('needPlayers') : people.length > n ? t('tooMany') : '';
  $('lobby-status').textContent = online.isHost ? err : t('waitingHost');
  $('lobby-status').style.color = online.isHost ? '' : 'var(--ink2)';
  show('lobby');
}

// ---------------------------------------------------------------- teclado y mando
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (document.querySelector('#s-pause.on')) {
    if (k === 'escape' || k === 'p') resume();
    return;
  }
  const v = S.v;
  if (!v || $$('.screen.on').length) return;
  const C = v.can;
  if (/^[1-3]$/.test(k) && C.play) {
    const c = v.hand.mine[+k - 1];
    if (c) playCard(c);
  } else if (k === 't' && C.truco) send({ t: 'truco' });
  else if (k === 'e' && C.envido.includes('envido')) send({ t: 'envido', kind: 'envido' });
  else if (k === 'r' && C.envido.includes('real')) send({ t: 'envido', kind: 'real' });
  else if (k === 'f' && C.envido.includes('falta')) send({ t: 'envido', kind: 'falta' });
  else if ((k === 'q' || k === 's' || k === 'y') && C.quiero) send({ t: 'quiero' });
  else if (k === 'n' && C.quiero) send({ t: 'noquiero' });
  else if (k === 'arrowleft' || k === 'arrowright') {
    if (!C.play) return;
    const m = v.hand.mine.length;
    S.sel = S.sel < 0 ? 0 : (S.sel + (k === 'arrowleft' ? m - 1 : 1)) % m;
    renderHand(v, false);
  } else if ((k === 'enter' || k === ' ') && C.play && S.sel >= 0) {
    e.preventDefault();
    const c = v.hand.mine[S.sel];
    S.sel = -1;
    if (c) playCard(c);
  } else if (k === 'escape' || k === 'p') pause();
});
const padPrev = [];
function pollPad() {
  const gp = navigator.getGamepads?.()?.find((g) => g && g.connected);
  if (!gp) return;
  const b = (i) => !!gp.buttons[i]?.pressed;
  const pressed = (i) => b(i) && !padPrev[i];
  const v = S.v;
  const live = v && !$$('.screen.on').length;
  if (live) {
    const C = v.can;
    const m = v.hand.mine.length;
    if ((pressed(14) || pressed(15)) && C.play && m) {
      S.sel = S.sel < 0 ? 0 : (S.sel + (pressed(14) ? m - 1 : 1)) % m;
      renderHand(v, false);
    }
    if (pressed(0)) {
      if (C.quiero) send({ t: 'quiero' });
      else if (C.play && S.sel >= 0 && v.hand.mine[S.sel]) {
        const c = v.hand.mine[S.sel];
        S.sel = -1;
        playCard(c);
      }
    }
    if (pressed(1) && C.quiero) send({ t: 'noquiero' });
    if (pressed(2) && C.truco) send({ t: 'truco' });
    if (pressed(3) && C.envido.length) send({ t: 'envido', kind: C.envido[0] });
    if (pressed(9)) pause();
  } else if (document.querySelector('#s-pause.on') && pressed(9)) resume();
  gp.buttons.forEach((x, i) => (padPrev[i] = x.pressed));
}

// ---------------------------------------------------------------- bucle
function loop() {
  pollPad();
  const v = S.v;
  const showClock = S.mode === 'online' && v && v.phase === 'play' && v.turnMs && v.hand?.actor === v.me;
  $('clock').hidden = !showClock;
  if (showClock) {
    const at = v._at || (v._at = performance.now());
    const left = Math.max(0, (v.left || 0) - (performance.now() - at));
    $('clock-t').textContent = `⏱ ${Math.ceil(left / 1000)}`;
    $('clock').classList.toggle('low', left < 8000);
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- tamaño, pausa automática y arranque
new ResizeObserver(() => {
  measure();
  if (S.v) render(S.v, false);
}).observe(tableEl);
addEventListener('blur', () => S.mode && S.mode !== 'online' && pause());
document.addEventListener('visibilitychange', () => document.hidden && S.mode && S.mode !== 'online' && pause());
G.onPause?.(() => timers.pause());
G.onResume?.(() => {
  if (!$$('.screen.on').length) timers.resume();
});

G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  renderRules();
  refreshHome();
  nHelp();
  if (S.v) render(S.v, false);
  if (online?.room && document.querySelector('#s-lobby.on')) applyRoom(online.room);
}, true);

measure();
requestAnimationFrame(loop);
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
else {
  online = null;
  show('home');
}
G.gameplay(false);

if (DEBUG)
  window.__truco = {
    S,
    get table() {
      return table;
    },
    get online() {
      return online;
    },
    startCpu,
    startDaily,
    toMenu,
    send,
    playCard,
    timers,
    OPTS,
    /** Una partida contra la compu con las cartas de cada mano ya elegidas (para armar escenas): deck = lista de 40 cartas. */
    startDeck(deck, n = 2, opts = {}) {
      begin('cpu', cpuSeats(n, OPTS.level), { target: 30, flor: false, first: 0, ...opts }, { dealFn: () => deck });
    },
    /** La compu juega por mí (como si estuviera ausente) hasta el final. */
    autoplay() {
      if (!table) return;
      table.seats.forEach((s, i) => !s.bot && table.setAway(i, true));
    },
  };
G.ready();
