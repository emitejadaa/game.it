/* Mecha Corta — game.it
 * Juego de palabras con una bomba que pasa de mano en mano: escribí una palabra que contenga la
 * sílaba antes de que explote. Contra la compu, en práctica (solo) u online con código de sala.
 * La partida (shared/game.js) es la misma en el navegador y en el servidor.
 */
import { Dict, decode, norm } from './shared/dict.js';
import { Bomb } from './shared/game.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const TXT = {
  t1: { es: 'MECHA', en: 'SHORT' },
  t2: { es: 'CORTA', en: 'FUSE' },
  tagline: { es: 'Escribí una palabra con la sílaba antes de que explote la bomba', en: 'Type a word with the syllable before the bomb goes off' },
  vsCpu: { es: 'CONTRA LA COMPU', en: 'VS CPU' },
  solo: { es: 'PRÁCTICA', en: 'PRACTICE' },
  online: { es: 'ONLINE', en: 'ONLINE' },
  howTo: { es: 'Cómo se juega', en: 'How to play' },
  rivals: { es: 'Rivales', en: 'Opponents' },
  level: { es: 'Dificultad de la compu', en: 'CPU skill' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Normal', en: 'Normal' },
  lv3: { es: 'Difícil', en: 'Hard' },
  lang: { es: 'Idioma de las palabras', en: 'Word language' },
  diff: { es: 'Sílabas', en: 'Syllables' },
  d1: { es: 'Comunes', en: 'Common' },
  d2: { es: 'Normales', en: 'Normal' },
  d3: { es: 'Raras', en: 'Rare' },
  lives: { es: 'Vidas', en: 'Lives' },
  fuse: { es: 'Mecha', en: 'Fuse' },
  f1: { es: 'Corta', en: 'Short' },
  f2: { es: 'Normal', en: 'Normal' },
  f3: { es: 'Larga', en: 'Long' },
  play: { es: 'JUGAR', en: 'PLAY' },
  back: { es: '← volver', en: '← back' },
  soloNote: { es: 'Sumá todas las palabras que puedas antes de quedarte sin vidas.', en: 'Score as many words as you can before running out of lives.' },
  soloBest: { es: 'Récord de la sesión: {n} palabras', en: 'Session record: {n} words' },
  cpuNote: { es: 'Usá todas las letras del abecedario (menos las raras) para ganar una vida.', en: 'Use every letter of the alphabet (except the rare ones) to earn a life.' },
  loadingDict: { es: 'Cargando diccionario…', en: 'Loading dictionary…' },
  dictErr: { es: 'No se pudo cargar el diccionario. Probá de nuevo.', en: "Couldn't load the dictionary. Try again." },
  placeMine: { es: 'Escribí una palabra con «{p}»', en: 'Type a word with “{p}”' },
  placeWait: { es: 'Esperá tu turno…', en: 'Wait for your turn…' },
  yourTurn: { es: '¡Te toca! Una palabra con «{p}»', en: 'Your turn! A word with “{p}”' },
  turnOf: { es: 'Turno de {n}', en: "{n}'s turn" },
  whyPrompt: { es: 'Tiene que tener «{p}»', en: 'It must contain “{p}”' },
  whyUsed: { es: '«{w}» ya se usó', en: '“{w}” was already used' },
  whyNope: { es: '«{w}» no está en el diccionario', en: '“{w}” is not in the dictionary' },
  whyShort: { es: 'Muy corta', en: 'Too short' },
  youOut: { es: 'Quedaste afuera: mirá cómo termina', en: "You're out: watch how it ends" },
  bonus: { es: '¡VIDA EXTRA!', en: 'EXTRA LIFE!' },
  boom: { es: '¡BUM!', en: 'BOOM!' },
  used: { es: '{n} palabras usadas', en: '{n} words used' },
  win: { es: '¡GANASTE!', en: 'YOU WIN!' },
  winner: { es: '¡Ganó {n}!', en: '{n} wins!' },
  soloOver: { es: '{n} palabras', en: '{n} words' },
  soloRec: { es: '¡Récord de la sesión!', en: 'Session record!' },
  lastOne: { es: 'Última palabra: {w}', en: 'Last word: {w}' },
  words: { es: '{n} palabras', en: '{n} words' },
  again: { es: 'JUGAR OTRA', en: 'PLAY AGAIN' },
  waitAgain: { es: 'El anfitrión puede empezar otra', en: 'The host can start another one' },
  menu: { es: 'menú', en: 'menu' },
  paused: { es: 'PAUSA', en: 'PAUSED' },
  resume: { es: 'SEGUIR', en: 'RESUME' },
  quit: { es: 'salir al menú', en: 'quit to menu' },
  you: { es: 'Vos', en: 'You' },
  host: { es: 'anfitrión', en: 'host' },
  cpu: { es: 'compu', en: 'CPU' },
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
  lobbyInfo: { es: '{n} jugadores · {l}', en: '{n} players · {l}' },
  revive: { es: '▶ VOLVER CON 1 VIDA', en: '▶ COME BACK WITH 1 LIFE' },
  rules: {
    es: [
      'La bomba pasa de mano en mano. Cuando la tenés, aparece una <b>sílaba</b>: escribí una palabra que la contenga y apretá Enter.',
      'La palabra tiene que existir y <b>no puede repetirse</b> en la partida. Las tildes no importan.',
      'Si acertás, la bomba pasa al siguiente con otra sílaba. La mecha dura un <b>tiempo al azar</b> que nadie ve: si explota en tu mano, perdés una vida.',
      'Todos ven lo que escribe el que tiene la bomba, letra por letra.',
      'Si usás <b>todas las letras</b> de la tira de abajo (a lo largo de varias palabras), ganás una vida (hasta 3).',
      'Gana el último que queda con vidas.',
    ],
    en: [
      'The bomb goes around. When you hold it you get a <b>syllable</b>: type a word that contains it and press Enter.',
      'The word must exist and <b>cannot be repeated</b> during the game.',
      'If it is valid, the bomb goes to the next player with a new syllable. The fuse lasts a <b>random time</b> nobody can see: if it blows up in your hands, you lose a life.',
      'Everyone sees what the bomb holder types, letter by letter.',
      'Use <b>every letter</b> in the strip at the bottom (across several words) to earn a life (up to 3).',
      'The last player with lives left wins.',
    ],
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v && typeof s === 'string') for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const BOT_NAMES = ['Luna', 'Toto', 'Mora', 'Pipo', 'Kiara', 'Bruno', 'Nina', 'Tomi'];
const BOT_COLORS = ['#ff3fb4', '#3dd68c', '#ffd23f', '#b388ff', '#22d3ff', '#ff7a45', '#a3ff3c'];

// ================================================================ temporizadores pausables
class Timers {
  constructor() {
    this.m = new Map();
    this.paused = false;
  }
  set(name, ms, fn) {
    this.clear(name);
    const tm = { fn, left: ms, due: 0, h: 0 };
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
// reloj del juego local: se detiene en pausa (la mecha no avanza)
let clockBase = performance.now();
let clockPausedAt = 0;
const clock = () => (clockPausedAt || performance.now()) - clockBase;
function pauseGame() {
  if (clockPausedAt) return;
  clockPausedAt = performance.now();
  timers.pause();
}
function resumeGame() {
  if (!clockPausedAt) return;
  clockBase += performance.now() - clockPausedAt;
  clockPausedAt = 0;
  timers.resume();
}

// ================================================================ estado
const S = {
  mode: null, // cpu | solo | online
  opts: { bots: 3, level: 2, lang: 'es', diff: 2, lives: 2, fuse: 'normal' },
  v: null,
  me: 0,
  els: [],
  angle: 0,
  soloBest: 0,
  revived: false,
  overSeq: -1,
  hmax: [],
};
let game = null;
let online = null;
const dicts = {};
let promptsJson = null;

async function loadDict(lang) {
  if (dicts[lang]) return dicts[lang];
  $('loading').hidden = false;
  try {
    if (!promptsJson) promptsJson = await (await fetch('./dict/prompts.json')).json();
    const res = await fetch(`./dict/${lang}.txt`);
    if (!res.ok) throw new Error(res.status);
    dicts[lang] = new Dict(lang, decode(await res.text()), promptsJson[lang]);
    return dicts[lang];
  } finally {
    $('loading').hidden = true;
  }
}

// ================================================================ partida local
async function startLocal(solo) {
  const o = S.opts;
  let dict;
  try {
    dict = await loadDict(o.lang);
  } catch {
    $('setup-note').textContent = t('dictErr');
    return;
  }
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const players = [{ id: 'me', name: t('you'), color: '#ff7a2f', bot: 0 }];
  if (!solo) for (let i = 0; i < o.bots; i++) players.push({ id: `b${i}`, name: names[i], color: BOT_COLORS[i], bot: o.level });
  timers.clearAll();
  clockBase = performance.now();
  clockPausedAt = 0;
  timers.paused = false;
  const io = {
    now: clock,
    emit: (v) => onView(v),
    event: (e) => onEvent(e),
    timer: (k, ms, fn) => timers.set(k, ms, fn),
    clear: (k) => timers.clear(k),
    over: () => {},
  };
  game = new Bomb({ players, opts: { lives: o.lives, diff: o.diff, fuse: o.fuse }, dict, io, rng: Math.random });
  S.mode = solo ? 'solo' : 'cpu';
  S.me = 0;
  S.revived = false;
  S.v = null;
  show(null);
  game.start();
  focusWord();
}

function act(msg) {
  if (S.mode === 'online') return online?.send(msg);
  if (!game) return;
  if (msg.t === 'type') game.type(S.me, msg.w);
  else if (msg.t === 'word') game.submit(S.me, msg.w);
}

// ================================================================ vista
function onView(v) {
  const prev = S.v;
  S.v = v;
  if (S.mode === 'online') S.me = v.players.findIndex((p) => p.id === online?.myId);
  if (!prev || prev.gid !== v.gid || prev.players.length !== v.players.length) {
    S.hmax = [];
    buildRing(v);
  }
  const newTurn = !prev || prev.turn !== v.turn || prev.seq !== v.seq;
  render(v, prev);
  if (newTurn && v.phase === 'play') {
    // la sílaba nueva aparece con un saltito
    if (!prev || prev.prompt !== v.prompt) {
      const pe = $('prompt');
      pe.classList.remove('pop');
      void pe.offsetWidth;
      pe.classList.add('pop');
    }
    if (v.turn === S.me && (!prev || prev.turn !== S.me || prev.seq !== v.seq)) {
      $('word').value = '';
      focusWord();
      if (!prev || prev.turn !== S.me) sfx('turn');
    }
  }
  if (v.phase === 'play' && $('s-over').classList.contains('on')) {
    show(null);
    focusWord();
  }
  if (v.phase === 'over' && S.overSeq !== v.seq) {
    S.overSeq = v.seq;
    setTimeout(() => S.v === v && showOver(v), 1400);
  }
  syncGameplay();
}

function layoutRing(v) {
  const st = $('stage').getBoundingClientRect();
  const n = v.players.length;
  const W = st.width;
  const H = st.height;
  const short = innerHeight < 520;
  const bs = Math.min(Math.max(short ? 84 : 110, Math.min(W * 0.24, H * 0.3)), 190);
  const small = W < 640;
  const rx = Math.max(bs * 0.9, Math.min(W * 0.42, W / 2 - (small ? 50 : 76)));
  // arriba no se tapa con la barra del portal; abajo quedan el nombre, las vidas y lo que se escribe
  const ry = Math.max(bs * 0.66, H / 2 - (short ? 54 : small ? 80 : 92));
  const pos = [];
  for (let k = 0; k < n; k++) {
    // yo abajo; los demás en orden de juego, en sentido horario
    const j = (k - S.me + n) % n;
    const a = Math.PI / 2 + (j / n) * Math.PI * 2;
    pos[k] = { x: W / 2 + Math.cos(a) * rx, y: H / 2 + Math.sin(a) * ry, a };
  }
  if (n === 1) pos[0] = { x: W / 2, y: H / 2 + ry, a: Math.PI / 2 };
  $('center').style.setProperty('--as', `${bs * 1.9}px`);
  $('bomb').style.setProperty('--bs', `${bs}px`);
  $('info').style.setProperty('--bs', `${bs}px`);
  return pos;
}

function buildRing(v) {
  const ring = $('ring');
  ring.innerHTML = '';
  S.els = v.players.map((p, k) => {
    const el = document.createElement('div');
    el.className = 'pl';
    el.innerHTML = `<div class="av"><span></span><i class="bot" hidden>🤖</i></div><div class="nm"></div><div class="hearts"></div><div class="tw"></div>`;
    ring.append(el);
    el.dataset.k = k;
    return el;
  });
  placeRing(v);
}
function placeRing(v) {
  const pos = layoutRing(v);
  S.pos = pos;
  S.els.forEach((el, k) => {
    el.style.left = `${pos[k].x}px`;
    el.style.top = `${pos[k].y}px`;
  });
}

function hearts(n, max) {
  let h = '';
  for (let i = 0; i < max; i++) h += `<i class="${i < n ? '' : 'lost'}">❤️</i>`;
  return h;
}

function render(v, prev) {
  const me = v.players[S.me];
  v.players.forEach((p, k) => {
    const el = S.els[k];
    if (!el) return;
    el.classList.toggle('turn', v.phase === 'play' && v.turn === k);
    el.classList.toggle('dead', !p.alive);
    el.classList.toggle('away', !!p.away);
    const av = el.querySelector('.av');
    av.style.setProperty('--pc', p.color || '#ff7a2f');
    av.querySelector('span').textContent = (p.name || '?').trim().charAt(0).toUpperCase();
    av.querySelector('.bot').hidden = !p.bot;
    el.querySelector('.nm').innerHTML = `${esc(k === S.me ? t('you') : p.name)}<small>${p.words}</small><span class="hh">${'❤️'.repeat(p.lives)}</span>`;
    const hs = el.querySelector('.hearts');
    const had = prev?.players[k]?.lives;
    S.hmax[k] = Math.max(S.hmax[k] || 0, p.lives);
    hs.innerHTML = hearts(p.lives, S.hmax[k]);
    if (had !== undefined && p.lives > had) hs.children[p.lives - 1]?.classList.add('pop');
    if (had !== undefined && p.lives < had) hs.children[p.lives]?.classList.add('break');
    // lo que escribe el que tiene la bomba
    const tw = el.querySelector('.tw');
    if (v.phase === 'play' && v.turn === k && !tw.classList.contains('ok') && !tw.classList.contains('bad')) setTyped(k, k === S.me ? $('word').value : v.typing);
    else if (v.turn !== k && !tw.classList.contains('ok')) tw.textContent = '';
  });
  // bomba, flecha y sílaba
  $('prompt').textContent = v.phase === 'play' ? v.prompt : '';
  $('bomb').classList.toggle('off', v.phase !== 'play');
  $('bomb').classList.toggle('tick', v.phase === 'play');
  if (v.phase === 'play' && S.pos?.[v.turn]) {
    const target = (S.pos[v.turn].a * 180) / Math.PI + 90;
    let d = target - (S.angle % 360);
    d = ((d % 360) + 540) % 360 - 180;
    S.angle += d;
    $('arrow').style.setProperty('--ang', `${S.angle}deg`);
  }
  $('arrow').style.opacity = v.phase === 'play' && v.players.length > 1 ? '' : '0';
  $('info').textContent = v.used ? t('used', { n: v.used }) : '';
  // mis letras
  const let_ = $('letters');
  const mine = new Set(me?.letters || '');
  if (let_.dataset.alpha !== v.alpha) {
    let_.dataset.alpha = v.alpha;
    let_.innerHTML = [...v.alpha].map((c) => `<i data-c="${c}">${c}</i>`).join('');
  }
  for (const el of let_.children) {
    const on = mine.has(el.dataset.c);
    if (on && !el.classList.contains('on')) {
      el.classList.add('on', 'new');
      setTimeout(() => el.classList.remove('new'), 500);
    } else if (!on) el.classList.remove('on');
  }
  // entrada y estado
  const myTurn = v.phase === 'play' && v.turn === S.me && me?.alive;
  const w = $('word');
  w.classList.toggle('mine', !!myTurn);
  w.placeholder = myTurn ? t('placeMine', { p: v.prompt.toUpperCase() }) : t('placeWait');
  const stEl = $('status');
  if (!stEl.dataset.lock) {
    if (v.phase !== 'play') setStatus('');
    else if (me && !me.alive) setStatus(t('youOut'));
    else if (myTurn) setStatus(t('yourTurn', { p: v.prompt.toUpperCase() }), 'me');
    else setStatus(t('turnOf', { n: v.players[v.turn]?.name || '' }));
  }
  offerRevive(v);
}

function setStatus(txt, cls = '') {
  const el = $('status');
  el.textContent = txt;
  el.className = `status ${cls}`;
}
/** Muestra un mensaje un momento (tapa el estado normal). */
function flashStatus(txt, cls, ms = 1800) {
  const el = $('status');
  el.dataset.lock = '1';
  setStatus(txt, cls);
  clearTimeout(flashStatus.h);
  flashStatus.h = setTimeout(() => {
    delete el.dataset.lock;
    if (S.v) render(S.v, S.v);
  }, ms);
}

function setTyped(k, text) {
  const el = S.els[k]?.querySelector('.tw');
  if (!el || !S.v) return;
  const w = norm(text, S.v.lang);
  const p = S.v.prompt;
  const i = p ? w.indexOf(p) : -1;
  el.innerHTML = i >= 0 ? `${esc(w.slice(0, i))}<b>${esc(p)}</b>${esc(w.slice(i + p.length))}` : esc(w);
}

function onEvent(e) {
  const v = S.v;
  if (e.t === 'tp') {
    if (e.p !== S.me) setTyped(e.p, e.w);
    if (e.p !== S.me && e.w) sfx('key');
    return;
  }
  const el = S.els[e.p]?.querySelector('.tw');
  if (e.t === 'ok') {
    if (el) {
      el.innerHTML = markWord(e.w, e.prompt);
      el.className = 'tw ok';
      setTimeout(() => {
        el.className = 'tw';
        if (S.v?.turn !== e.p) el.textContent = '';
      }, 1100);
    }
    if (e.p === S.me) $('word').value = '';
    floatText(e.p, e.bonus ? t('bonus') : '+1');
    sfx(e.bonus ? 'bonus' : 'ok');
    if (e.bonus && e.p === S.me) flashStatus(t('bonus'), 'ok');
  } else if (e.t === 'bad') {
    if (el) {
      el.textContent = e.w;
      el.className = 'tw bad';
      setTimeout(() => (el.className = 'tw'), 450);
    }
    if (e.p === S.me) {
      const w = $('word');
      w.classList.remove('bad');
      void w.offsetWidth;
      w.classList.add('bad');
      clearTimeout(w._bad);
      w._bad = setTimeout(() => w.classList.remove('bad'), 700);
      const up = (s) => s.toUpperCase();
      const msg = { prompt: t('whyPrompt', { p: up(v?.prompt || '') }), used: t('whyUsed', { w: up(e.w) }), nope: t('whyNope', { w: up(e.w) }), short: t('whyShort') }[e.why];
      if (msg) flashStatus(msg, 'bad');
    }
    sfx('bad');
  } else if (e.t === 'boom') {
    explode(e.p);
    if (el) el.textContent = '';
  }
}

function markWord(w, p) {
  const i = w.indexOf(p);
  return i >= 0 ? `${esc(w.slice(0, i))}<b>${esc(p)}</b>${esc(w.slice(i + p.length))}` : esc(w);
}

function floatText(k, txt) {
  const pos = S.pos?.[k];
  if (!pos) return;
  const d = document.createElement('div');
  d.className = 'plus';
  d.textContent = txt;
  d.style.left = `${pos.x}px`;
  d.style.top = `${pos.y - 40}px`;
  $('fx').append(d);
  setTimeout(() => d.remove(), 1200);
}

function explode(k) {
  const fx = $('fx');
  const st = $('stage');
  const cx = st.clientWidth / 2;
  const cy = st.clientHeight / 2;
  const f = document.createElement('div');
  f.className = 'flash';
  f.style.left = `${cx}px`;
  f.style.top = `${cy}px`;
  fx.append(f);
  const txt = document.createElement('div');
  txt.className = 'boomtxt';
  txt.textContent = t('boom');
  txt.style.left = `${cx}px`;
  txt.style.top = `${cy}px`;
  fx.append(txt);
  if (!G.prefs.reducedMotion) {
    const pos = S.pos?.[k] || { x: cx, y: cy };
    for (let i = 0; i < 26; i++) {
      const b = document.createElement('i');
      b.className = 'bit';
      const a = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 220;
      b.style.left = `${pos.x}px`;
      b.style.top = `${pos.y}px`;
      b.style.setProperty('--dx', `${Math.cos(a) * r}px`);
      b.style.setProperty('--dy', `${Math.sin(a) * r}px`);
      b.style.setProperty('--c', ['#ffd23f', '#ff7a2f', '#ff3b5c', '#fff'][i % 4]);
      fx.append(b);
      setTimeout(() => b.remove(), 950);
    }
    st.classList.remove('shake');
    void st.offsetWidth;
    st.classList.add('shake');
  }
  setTimeout(() => {
    f.remove();
    txt.remove();
  }, 1000);
  sfx('boom');
}

// ================================================================ entrada
let typeTimer = 0;
let lastTypeSent = 0;
function sendTyping() {
  clearTimeout(typeTimer);
  const now = performance.now();
  const go = () => {
    lastTypeSent = performance.now();
    act({ t: 'type', w: $('word').value.slice(0, 30) });
  };
  if (now - lastTypeSent > 70) go();
  else typeTimer = setTimeout(go, 70);
}
$('word').addEventListener('input', () => {
  const v = S.v;
  if (!v || v.phase !== 'play' || v.turn !== S.me) return;
  setTyped(S.me, $('word').value);
  sendTyping();
});
$('word').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitWord();
  }
});
$('send').onclick = () => {
  submitWord();
  focusWord();
};
function submitWord() {
  const v = S.v;
  const w = $('word').value.trim();
  if (!v || v.phase !== 'play' || v.turn !== S.me || !w) return;
  unlock();
  clearTimeout(typeTimer);
  act({ t: 'word', w });
}
function focusWord() {
  if ($$('.screen.on').length) return;
  const w = $('word');
  if (document.activeElement !== w) w.focus({ preventScroll: true });
}
// en el celular el teclado achica la pantalla: el juego se acomoda al espacio que queda
const vv = window.visualViewport;
function fitViewport() {
  const h = vv ? vv.height : innerHeight;
  document.documentElement.style.setProperty('--vh', `${h}px`);
  if (vv && vv.offsetTop) window.scrollTo(0, 0);
  if (S.v) placeRing(S.v);
}
vv?.addEventListener('resize', fitViewport);
// si cambia el alto del escenario (teclado, tira de letras), se reacomoda la ronda
new ResizeObserver(() => S.v && placeRing(S.v)).observe($('stage'));
addEventListener('resize', fitViewport);

// ================================================================ fin de partida
function showOver(v) {
  const solo = v.players.length === 1;
  const me = v.players[S.me];
  $('ov-sub').textContent = v.last ? t('lastOne', { w: v.last.w.toUpperCase() }) : '';
  if (solo) {
    const n = me.words;
    const rec = n > S.soloBest;
    if (rec) S.soloBest = n;
    $('ov-title').textContent = rec && n > 0 ? t('soloRec') : t('soloOver', { n });
    $('ov-sub').textContent = `${t('soloOver', { n })} · ${t('soloBest', { n: S.soloBest })}`;
  } else $('ov-title').textContent = v.winner === S.me ? t('win') : v.winner >= 0 ? t('winner', { n: v.players[v.winner].name }) : t('boom');
  const order = v.players.map((p, k) => ({ ...p, k })).sort((a, b) => (b.k === v.winner) - (a.k === v.winner) || b.words - a.words);
  $('ov-list').innerHTML = order
    .map((p, i) => `<li class="${p.k === v.winner ? 'win' : ''}"><b>${i + 1}</b><span><i style="background:${p.color}"></i>${esc(p.k === S.me ? t('you') : p.name)}</span><small>${t('words', { n: p.words })}</small></li>`)
    .join('');
  $('ov-again').hidden = S.mode === 'online' && !online?.isHost;
  $('ov-status').textContent = S.mode === 'online' && !online?.isHost ? t('waitAgain') : '';
  sfx(v.winner === S.me || (solo && me.words > 0) ? 'win' : 'lose');
  show('over');
}
$('ov-again').onclick = async () => {
  unlock();
  if (S.mode === 'online') return online?.send({ t: 'again' });
  await G.commercialBreak('revancha');
  startLocal(S.mode === 'solo');
};
$('ov-menu').onclick = () => toMenu();

// premio opcional: volver con una vida (contra la compu, una vez por partida)
let rewardAsked = false;
function offerRevive(v) {
  const b = $('b-revive');
  const me = v.players[S.me];
  const can = S.mode === 'cpu' && v.phase === 'play' && me && !me.alive && !S.revived && v.players.filter((p) => p.alive).length >= 2;
  if (!can) {
    b.hidden = true;
    rewardAsked = false;
    return;
  }
  if (rewardAsked) return;
  rewardAsked = true;
  G.rewardAvailable('revivir').then((ok) => {
    if (ok && S.v?.phase === 'play' && !S.v.players[S.me].alive) {
      b.textContent = t('revive');
      b.hidden = false;
    }
  });
}
$('b-revive').onclick = async () => {
  $('b-revive').hidden = true;
  pauseGame();
  const ok = await G.showReward();
  resumeGame();
  if (ok && game?.revive(S.me)) S.revived = true;
};

// ================================================================ menús
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  $('b-menu').hidden = !S.mode;
  if (S.mode === 'cpu' || S.mode === 'solo') {
    if (id === 'menu') pauseGame();
    else if (!id) resumeGame();
  }
  syncGameplay();
}
function syncGameplay() {
  G.gameplay(!!S.mode && S.v?.phase === 'play' && !$$('.screen.on').length);
}
function toMenu() {
  if (S.mode === 'online') online?.leave();
  timers.clearAll();
  game = null;
  S.mode = null;
  S.v = null;
  $('ring').innerHTML = '';
  $('b-revive').hidden = true;
  show('home');
}
$('b-menu').onclick = () => show('menu');
$('m-resume').onclick = () => {
  show(null);
  focusWord();
};
$('m-quit').onclick = () => toMenu();

let setupSolo = false;
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    unlock();
    sfx('ui');
    const k = go.dataset.go;
    if (k === 'cpu' || k === 'solo') {
      setupSolo = k === 'solo';
      $('setup-title').textContent = t(setupSolo ? 'solo' : 'vsCpu');
      $('o-bots').hidden = $('o-level').hidden = setupSolo;
      refreshSetup();
      return show('setup');
    }
    if (k === 'online') {
      $('on-name').value ||= defaultName();
      return show('online');
    }
    if (k === 'rules') return show('rules');
  }
  if (e.target.closest('[data-back]')) {
    sfx('ui');
    show('home');
  }
});
function refreshSetup() {
  for (const seg of $$('#s-setup .seg')) {
    const k = seg.dataset.o;
    $$('button', seg).forEach((b) => b.classList.toggle('on', String(S.opts[k]) === b.dataset.v));
  }
  $('setup-note').textContent = setupSolo ? (S.soloBest ? t('soloBest', { n: S.soloBest }) : t('soloNote')) : t('cpuNote');
}
for (const seg of $$('#s-setup .seg'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = seg.dataset.o;
    S.opts[k] = k === 'lang' || k === 'fuse' ? b.dataset.v : Number(b.dataset.v);
    try {
      localStorage.setItem('mecha.opts', JSON.stringify(S.opts));
    } catch {}
    sfx('ui');
    refreshSetup();
  };
$('setup-go').onclick = () => {
  sfx('ui');
  startLocal(setupSolo);
};
// mientras se elige, el diccionario se va bajando
$('s-setup').addEventListener('pointerover', () => !dicts[S.opts.lang] && preload(S.opts.lang), { once: true });
function preload(lang) {
  if (!promptsJson) fetch('./dict/prompts.json').then((r) => r.json()).then((j) => (promptsJson ||= j)).catch(() => {});
  fetch(`./dict/${lang}.txt`).catch(() => {});
}

// ================================================================ online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('mecha', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'g') {
        if (S.mode !== 'online') {
          S.mode = 'online';
          S.v = null;
        }
        if ($('s-lobby').classList.contains('on') || $('s-online').classList.contains('on')) {
          show(null);
          focusWord();
        }
        onView(m.s);
      } else if (m.t === 'tp' || m.t === 'ok' || m.t === 'bad' || m.t === 'boom') {
        if (S.mode === 'online' && S.v) onEvent(m);
      } else if (m.t === 'error') {
        $('on-status').textContent = netText(m.code);
        $('lobby-status').textContent = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = null;
        S.v = null;
        $('ring').innerHTML = '';
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
  const r = await share('mecha', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};
for (const seg of $$('#lobby-host .seg'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !online?.isHost) return;
    const k = seg.dataset.l;
    const st = { ...(online.room.settings || {}) };
    st[k] = k === 'lang' || k === 'fuse' ? b.dataset.v : Number(b.dataset.v);
    online.send({ t: 'settings', settings: st });
    sfx('ui');
  };
function applyRoom(room) {
  if (room.state !== 'lobby') return;
  if (S.mode === 'online') {
    S.mode = null;
    S.v = null;
    $('ring').innerHTML = '';
  }
  $('lobby-code').textContent = room.code;
  const st = room.settings || {};
  const bots = Math.max(0, Math.min(st.bots ?? 0, 12 - room.players.length));
  $('lobby-players').innerHTML =
    room.players.map((p) => `<li><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('you').toLowerCase() : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`).join('') +
    Array.from({ length: bots }, (_, i) => `<li><i style="background:${BOT_COLORS[i]}"></i><span>${BOT_NAMES[i]}</span><small>${t('cpu')}</small></li>`).join('');
  for (const seg of $$('#lobby-host .seg')) {
    const k = seg.dataset.l;
    $$('button', seg).forEach((b) => {
      b.classList.toggle('on', String(st[k]) === b.dataset.v);
      b.disabled = !online.isHost;
    });
  }
  $('lobby-info').textContent = t('lobbyInfo', { n: room.players.length + bots, l: st.lang === 'en' ? 'English' : 'Español' });
  $('lobby-start').hidden = !online.isHost;
  const need = room.players.length + bots < 2;
  $('lobby-status').textContent = online.isHost ? (need ? t('needPlayers') : '') : t('waitingHost');
  $('lobby-status').style.color = online.isHost ? '' : 'var(--muted)';
  show('lobby');
}

// ================================================================ sonido
let tickT = 0;
function ticker() {
  const v = S.v;
  const playing = v && v.phase === 'play' && !$$('.screen.on').length && !clockPausedAt && !G.paused;
  if (playing && performance.now() - tickT > 520) {
    tickT = performance.now();
    tone(1400, 1300, 0.03, { type: 'square', vol: 0.025 });
  }
  requestAnimationFrame(ticker);
}
requestAnimationFrame(ticker);
function sfx(k) {
  if (k === 'ok') notes([660, 990], { step: 0.06, dur: 0.12, vol: 0.1 });
  else if (k === 'bonus') notes([523, 659, 784, 1047, 1319], { step: 0.07, dur: 0.16, type: 'square', vol: 0.07 });
  else if (k === 'bad') tone(200, 150, 0.16, { type: 'square', vol: 0.06 });
  else if (k === 'boom') {
    noise(0.9, { freq: 300, q: 0.7, type: 'lowpass', vol: 0.6, sweep: 60 });
    tone(120, 40, 0.6, { type: 'sine', vol: 0.4 });
  } else if (k === 'turn') notes([784, 1175], { step: 0.08, dur: 0.14, vol: 0.09 });
  else if (k === 'key') noise(0.025, { freq: 3000, q: 2, vol: 0.05 });
  else if (k === 'win') notes([523, 659, 784, 1047, 1319], { step: 0.09, dur: 0.22, type: 'square', vol: 0.07 });
  else if (k === 'lose') notes([392, 330, 262], { step: 0.14, dur: 0.26, type: 'sawtooth', vol: 0.05 });
  else if (k === 'ui') tone(900, 620, 0.05, { type: 'square', vol: 0.04 });
}

// ================================================================ arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('rules-body').innerHTML = G.t(TXT.rules)
    .map((l) => `<p>${l}</p>`)
    .join('');
  let saved = null;
  try {
    saved = localStorage.getItem('mecha.opts');
  } catch {}
  if (!saved) S.opts.lang = G.prefs.lang === 'en' ? 'en' : 'es';
  if ($('s-setup').classList.contains('on')) refreshSetup();
  if (online?.room && $('s-lobby').classList.contains('on')) applyRoom(online.room);
  if (S.v) render(S.v, S.v);
}
try {
  Object.assign(S.opts, JSON.parse(localStorage.getItem('mecha.opts') || '{}'));
} catch {}
G.onPrefs(applyPrefs, true);
G.onPause(() => (S.mode === 'cpu' || S.mode === 'solo') && pauseGame());
G.onResume(() => (S.mode === 'cpu' || S.mode === 'solo') && !$('s-menu').classList.contains('on') && resumeGame());
fitViewport();
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
else show('home');
G.ready();
if (/[?&]debug\b/.test(location.search))
  window.__mecha = {
    S,
    get game() {
      return game;
    },
    act,
  };
