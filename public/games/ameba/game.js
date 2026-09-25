/* Ameba — game.it
 * Estilo .io: comé, crecé, dividite para cazar y cuidate de los más grandes. Sin conexión contra
 * bots o en arenas online (juego rápido o sala privada con código). El mismo mundo corre en el
 * servidor y en el navegador; el cliente interpola los estados para que todo se vea fluido.
 */
import { World, TPS, DT, CFG, PALETTE, FOOD_COLORS, viewSpan } from './shared/world.js';
import { brain, think, BOT_NAMES } from './shared/bots.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { Renderer, drawMini } from './render.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const TICK_MS = 1000 / TPS;

const TXT = {
  title: { es: 'Ameba', en: 'Amoeba' },
  tagline: { es: 'comé, crecé y no te dejes comer', en: 'eat, grow and don’t get eaten' },
  playOnline: { es: 'Jugar online', en: 'Play online' },
  playOnlineSub: { es: 'arena rápida con gente y bots', en: 'quick arena with people and bots' },
  solo: { es: 'Sin conexión', en: 'Offline' },
  soloSub: { es: 'contra bots', en: 'versus bots' },
  private: { es: 'Sala privada', en: 'Private room' },
  privateSub: { es: 'con código', en: 'with a code' },
  privateInfo: { es: 'Creá una arena para jugar con tus amigos (con bots de relleno).', en: 'Create an arena to play with friends (filled with bots).' },
  createRoom: { es: 'Crear sala', en: 'Create room' },
  join: { es: 'Unirse', en: 'Join' },
  back: { es: '← volver', en: '← back' },
  top: { es: 'Los más grandes', en: 'Leaderboard' },
  mass: { es: 'Masa', en: 'Mass' },
  paused: { es: 'Pausa', en: 'Paused' },
  menuOnline: { es: 'La arena sigue', en: 'The arena keeps going' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  again: { es: 'Jugar de nuevo', en: 'Play again' },
  eaten: { es: 'Fin de la partida', en: 'Game over' },
  eatenBy: { es: 'Te comió {n}', en: '{n} ate you' },
  died: { es: 'Te comieron', en: 'You got eaten' },
  revive: { es: '▶ Revivir con {m} de masa', en: '▶ Revive with {m} mass' },
  statMax: { es: 'masa máxima', en: 'top mass' },
  statTime: { es: 'tiempo vivo', en: 'time alive' },
  statFood: { es: 'comida', en: 'food eaten' },
  statCells: { es: 'células comidas', en: 'cells eaten' },
  youAte: { es: '¡Te comiste a {n}!', en: 'You ate {n}!' },
  keysDesk: { es: '<kbd>Mouse</kbd> moverte · <kbd>Espacio</kbd> dividirte · <kbd>W</kbd> expulsar masa', en: '<kbd>Mouse</kbd> move · <kbd>Space</kbd> split · <kbd>W</kbd> eject mass' },
  keysTouch: { es: 'Arrastrá para moverte · botones para dividirte y expulsar', en: 'Drag to move · buttons to split and eject' },
  hintDesk: { es: 'Espacio para dividirte y atrapar a los más chicos', en: 'Press Space to split and catch smaller cells' },
  hintTouch: { es: 'Tocá ◎◎ para dividirte y atrapar a los más chicos', en: 'Tap ◎◎ to split and catch smaller cells' },
  searching: { es: 'Buscando una arena…', en: 'Finding an arena…' },
  roomChip: { es: 'Sala {c} · copiar link', en: 'Room {c} · copy link' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  room: { es: 'Sala {c}', en: 'Room {c}' },
};
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k }) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};

// ---------------------------------------------------------------- perfil
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem('gameit:ameba:' + k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('gameit:ameba:' + k, JSON.stringify(v));
    } catch {}
  },
};
const profile = store.get('profile', { name: '', color: Math.floor(Math.random() * PALETTE.length) });

// ---------------------------------------------------------------- estado
const S = {
  screen: 'home',
  mode: 'demo', // demo | solo | online
  session: null,
  me: 0,
  alive: false,
  focus: 0,
  players: new Map(),
  lb: [],
  snaps: [],
  base: null,
  jitter: 0,
  eaten: new Map(),
  food: { n: 0, x: new Float32Array(CFG.food), y: new Float32Array(CFG.food), born: new Float64Array(CFG.food) },
  ghosts: [],
  cells: [],
  cam: { x: CFG.size / 2, y: CFG.size / 2, s: 0.5 },
  size: CFG.size,
  zoom: 1,
  paused: false,
  mouse: { x: innerWidth / 2, y: innerHeight / 2 },
  stick: null,
  eject: false,
  myMass: 0,
  myCount: 0,
  spawnAt: 0,
  lastStats: null,
  wantSpawn: false,
};
const renderer = new Renderer($('cv'));

// ---------------------------------------------------------------- sesión local (bots)
class LocalSession {
  constructor(demo) {
    this.w = new World((Math.random() * 2 ** 31) >>> 0);
    this.demo = demo;
    this.brains = new Map();
    this.bots = [];
    this.me = null;
    this.acc = 0;
    const offset = Math.floor(Math.random() * BOT_NAMES.length);
    for (let i = 0; i < 20; i++) {
      const p = this.w.addPlayer({ name: BOT_NAMES[(offset + i) % BOT_NAMES.length], color: (offset + i) % PALETTE.length, bot: true });
      this.brains.set(p.num, brain(1 + (i % 3), this.w.rnd));
      this.bots.push(p.num);
      this.w.spawn(p.num);
    }
    // el mundo ya arranca "vivo"
    for (let i = 0; i < TPS * 4; i++) this.tick(false);
    resetNet();
    onMsg({ t: 'f0', f: this.w.foodList(), size: this.w.size });
    this.table();
  }
  table() {
    onMsg({ t: 'pl', p: [...this.w.players.values()].map((p) => [p.num, p.name, p.color, p.bot ? 1 : 0]) });
  }
  send(msg) {
    const w = this.w;
    if (msg.t === 'spawn') {
      if (!this.me) this.me = w.addPlayer({ name: msg.name, color: msg.color });
      this.me.name = msg.name;
      this.me.color = msg.color;
      w.spawn(this.me.num, msg.mass || CFG.startMass);
      this.table();
      onMsg({ t: 'me', num: this.me.num, alive: true });
    } else if (msg.t === 'i' && this.me) w.setInput(this.me.num, msg.x, msg.y, msg.w === 1);
    else if (msg.t === 'sp' && this.me) w.split(this.me.num);
  }
  update(dt) {
    if (S.paused) return;
    this.acc = Math.min(this.acc + dt / 1000, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.tick(true);
    }
  }
  tick(emit) {
    const w = this.w;
    for (const num of this.bots) {
      const p = w.players.get(num);
      if (!p.alive) {
        if (w.tick - p.deadAt > 3 * TPS) w.spawn(num);
      } else think(w, p, this.brains.get(num));
    }
    w.step();
    const deaths = w.deaths.splice(0);
    const f = w.foodEvents.splice(0);
    const e = w.eatEvents.splice(0);
    if (!emit) return;
    for (const x of deaths) {
      if (this.me && x.num === this.me.num) onMsg({ t: 'dead', by: x.by, stats: x.stats });
      if (this.me && x.by === this.me.num) onMsg({ t: 'ko', n: x.num });
    }
    let viewer = this.me;
    if (!viewer || (this.demo && !viewer.alive)) {
      // demo: la cámara sigue al más grande
      const lead = w.leaderboard(1)[0];
      viewer = lead ? w.players.get(lead[0]) : w.players.values().next().value;
    }
    onMsg({ t: 's', k: w.tick, c: w.view(viewer), f, e, fo: viewer.num });
    if (w.tick % TPS === 0) onMsg({ t: 'lb', l: w.leaderboard() });
  }
}

// ---------------------------------------------------------------- sesión online
let net = null;
let pendingCreate = null;
let quickWanted = false;
let startSent = false;

function ensureNet() {
  if (net) return net;
  net = new OnlineRoom('ameba', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt === undefined) return;
      $('home-status').textContent = txt;
      $('pv-status').textContent = txt;
      if (S.mode === 'online' && txt && S.screen === null) toast(txt);
    },
    onJoined: () => {
      startSent = false;
    },
    onRoom: (room) => {
      if (pendingCreate && room.host === net.myId) {
        net.send({ t: 'settings', settings: pendingCreate });
        pendingCreate = null;
      }
      if (room.state === 'lobby' && net.isHost && !startSent) {
        startSent = true;
        net.send({ t: 'start' });
      }
      const chip = $('room-chip');
      chip.hidden = room.settings?.public !== false;
      chip.textContent = t('roomChip', { c: room.code });
    },
    onMessage: (m) => {
      if (m.t === 'list') {
        if (!quickWanted) return;
        quickWanted = false;
        const open = m.rooms.filter((r) => r.n < r.max).sort((a, b) => b.n - a.n);
        if (open.length) net.join(open[0].code, profile.name || defaultName());
        else {
          pendingCreate = { public: true };
          net.create(profile.name || defaultName());
        }
        return;
      }
      if (m.t === 'error') {
        const txt = netText(m.code);
        $('home-status').textContent = txt;
        $('pv-status').textContent = txt;
        if (m.code === 'not_found' || m.code === 'room_full') {
          S.mode = 'demo';
          startDemo();
        }
        return;
      }
      if (m.t === 'closed' || m.t === 'kicked') {
        const reason = m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`;
        if (S.mode === 'online' && m.reason === 'max_life') {
          // la arena cumplió su tiempo: se busca otra sola
          toast(netText(reason));
          quickPlay();
          return;
        }
        $('home-status').textContent = netText(reason);
        goHome();
        return;
      }
      if (S.mode === 'online') onMsg(m);
    },
  });
  return net;
}

class NetSession {
  send(msg) {
    if (msg.t === 'i') {
      if (net.ws?.readyState === 1) net.raw(msg);
    } else net.send(msg);
  }
  update() {}
}

function quickPlay() {
  enterOnline();
  $('home-status').textContent = t('searching');
  quickWanted = true;
  ensureNet().send({ t: 'list', game: 'ameba' });
}

function enterOnline() {
  S.mode = 'online';
  S.session = new NetSession();
  S.wantSpawn = true;
  S.me = 0;
  S.alive = false;
  resetNet();
}

// ---------------------------------------------------------------- mensajes (locales u online)
function resetNet() {
  S.snaps = [];
  S.base = null;
  S.jitter = 0;
  S.eaten.clear();
  S.ghosts = [];
  S.cells = [];
}

function onMsg(m) {
  switch (m.t) {
    case 'f0': {
      const f = m.f;
      const n = Math.min(CFG.food, f.length / 2);
      S.food.n = n;
      for (let i = 0; i < n; i++) {
        S.food.x[i] = f[i * 2];
        S.food.y[i] = f[i * 2 + 1];
        S.food.born[i] = -1e9;
      }
      S.size = m.size || CFG.size;
      return;
    }
    case 'pl':
      S.players = new Map(m.p.map(([num, name, color, bot]) => [num, { name, color, bot }]));
      renderLb();
      return;
    case 'me':
      S.me = m.num;
      if (m.alive) {
        S.alive = true;
        S.spawnAt = performance.now();
        S.stats = null;
        if (S.mode !== 'demo') show(null);
      } else if (S.wantSpawn) {
        S.wantSpawn = false;
        spawn();
      }
      return;
    case 's':
      pushSnap(m);
      return;
    case 'lb':
      S.lb = m.l;
      renderLb();
      return;
    case 'dead':
      onDead(m);
      return;
    case 'ko': {
      const p = S.players.get(m.n);
      if (p) feed(t('youAte', { n: p.name || '?' }));
      sfx.gulp();
      return;
    }
  }
}

function pushSnap(m) {
  const now = performance.now();
  const cells = new Map();
  const c = m.c;
  for (let i = 0; i < c.length; i += 5) cells.set(c[i], { id: c[i], x: c[i + 1], y: c[i + 2], r: c[i + 3], o: c[i + 4] });
  const last = S.snaps[S.snaps.length - 1];
  if (last && m.k <= last.k) {
    if (last.k - m.k > TPS * 2) resetNet(); // el mundo se reinició
    else return;
  }
  S.snaps.push({ k: m.k, cells, f: m.f, e: m.e, done: false });
  if (m.fo !== undefined) S.focus = m.fo;
  const est = now - m.k * TICK_MS;
  // después de una pausa (o una pestaña oculta) se vuelve a sincronizar el reloj
  if (S.base === null || est - S.base > 300) S.base = est;
  else {
    S.jitter = S.jitter * 0.95 + Math.abs(est - S.base) * 0.05;
    if (est < S.base) S.base = est;
    else S.base += 0.02; // se corre despacito por si los relojes se desfasan
  }
  if (S.snaps.length > 60) S.snaps.splice(0, S.snaps.length - 60);
}

// ---------------------------------------------------------------- interpolación
function interpolate(now) {
  const snaps = S.snaps;
  if (!snaps.length) return [];
  const delay = S.mode === 'online' ? Math.min(6, Math.max(2, 1.2 + (S.jitter / TICK_MS) * 1.6)) : 1;
  let rt = (now - S.base) / TICK_MS - delay;
  // eventos (comida y quién comió a quién) a medida que se alcanzan
  for (const s of snaps) {
    if (s.done || s.k > rt) continue;
    s.done = true;
    applyFood(s.f, now);
    if (s.e) for (let i = 0; i < s.e.length; i += 2) S.eaten.set(s.e[i], s.e[i + 1]);
  }
  let ai = -1;
  for (let i = snaps.length - 1; i >= 0; i--) {
    if (snaps[i].k <= rt) {
      ai = i;
      break;
    }
  }
  if (ai < 0) {
    ai = 0;
    rt = snaps[0].k;
  }
  if (ai > 0) {
    snaps.splice(0, ai - 0);
    ai = 0;
  }
  const a = snaps[0];
  const b = snaps[1];
  const out = [];
  if (!b) {
    for (const c of a.cells.values()) out.push({ ...c });
    return out;
  }
  const k = Math.min(1, Math.max(0, (rt - a.k) / (b.k - a.k)));
  for (const cb of b.cells.values()) {
    const ca = a.cells.get(cb.id);
    if (ca) out.push({ id: cb.id, o: cb.o, x: ca.x + (cb.x - ca.x) * k, y: ca.y + (cb.y - ca.y) * k, r: ca.r + (cb.r - ca.r) * k });
    else if (k > 0.2) out.push({ ...cb, r: cb.r * Math.min(1, (k - 0.2) * 2 + 0.5) });
  }
  for (const ca of a.cells.values()) {
    if (b.cells.has(ca.id)) continue;
    const eater = S.eaten.get(ca.id);
    const to = eater && b.cells.get(eater);
    if (to) out.push({ id: ca.id, o: ca.o, x: ca.x + (to.x - ca.x) * k, y: ca.y + (to.y - ca.y) * k, r: ca.r * (1 - k * 0.85) });
  }
  if (S.eaten.size > 4000) S.eaten.clear();
  return out;
}

function applyFood(f, now) {
  if (!f || !f.length) return;
  const food = S.food;
  for (let i = 0; i < f.length; i += 3) {
    const slot = f[i];
    if (slot >= food.n) continue;
    const ox = food.x[slot];
    const oy = food.y[slot];
    // la comida vieja vuela hacia la célula más cercana
    let best = null;
    let bd = 1e12;
    for (const c of S.cells) {
      if (c.o < 0) continue;
      const d = (c.x - ox) ** 2 + (c.y - oy) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best && bd < (best.r + 60) ** 2 && S.ghosts.length < 120) S.ghosts.push({ x: ox, y: oy, tx: best.x, ty: best.y, t: now, c: FOOD_COLORS[slot % FOOD_COLORS.length] });
    food.x[slot] = f[i + 1];
    food.y[slot] = f[i + 2];
    food.born[slot] = now;
  }
}

// ---------------------------------------------------------------- bucle
let lastT = performance.now();
let lastSend = 0;
let lastHud = 0;
let lastMini = 0;
let lastBlip = 0;
let lastEjectSfx = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - lastT);
  lastT = now;
  S.session?.update(dt);
  const cells = interpolate(now);
  S.cells = cells;
  // mis células
  let mx = 0;
  let my = 0;
  let mm = 0;
  let count = 0;
  const focus = S.alive ? S.me : S.mode === 'demo' ? S.focus : -99;
  for (const c of cells) {
    if (c.o !== focus) continue;
    const m = (c.r / 7) ** 2;
    mx += c.x * m;
    my += c.y * m;
    mm += m;
    count++;
    if (c.o === S.me && S.alive) {
      const age = (now - S.spawnAt) / 650;
      if (age < 1) c.fresh = age;
    }
  }
  if (mm > 0) {
    const cx = mx / mm;
    const cy = my / mm;
    const follow = 1 - Math.exp(-dt / (S.mode === 'demo' ? 260 : 70));
    S.cam.x += (cx - S.cam.x) * follow;
    S.cam.y += (cy - S.cam.y) * follow;
    const screen = Math.max(700, Math.sqrt(renderer.w * renderer.h));
    const target = (screen / viewSpan(mm)) * S.zoom * (S.mode === 'demo' ? 0.8 : 1);
    S.cam.s += (target - S.cam.s) * (1 - Math.exp(-dt / 450));
  }
  if (S.alive) {
    // sonidos por crecer
    if (mm > S.myMass + 0.9 && now - lastBlip > 70) {
      lastBlip = now;
      sfx.blip(mm);
    }
    if (count >= S.myCount + 3 && S.myCount > 0) sfx.pop();
    S.myMass = mm;
    S.myCount = count;
    sendInput(now, mx / (mm || 1), my / (mm || 1));
  }
  // limpiar comida que ya terminó de volar
  if (S.ghosts.length) S.ghosts = S.ghosts.filter((g) => now - g.t < 150);
  renderer.draw({ cam: S.cam, size: S.size, cells, food: S.food, ghosts: S.ghosts, players: S.players, me: S.alive ? S.me : -99, t: now });
  if (S.mode !== 'demo' && now - lastHud > 120) {
    lastHud = now;
    $('mass').textContent = S.alive ? Math.round(mm) : 0;
  }
  if (S.mode !== 'demo' && now - lastMini > 250 && !document.body.classList.contains('touch')) {
    lastMini = now;
    drawMini($('mini'), { size: S.size, cam: S.cam, w: renderer.w, h: renderer.h, me: S.alive, leaders: [], dark: renderer.dark, accent: renderer.accent });
  }
}

function sendInput(now, cx, cy) {
  let tx;
  let ty;
  if (S.screen !== null) {
    // en el menú de pausa online la célula se queda quieta
    tx = cx;
    ty = cy;
  } else if (S.stick) {
    const { dx, dy } = S.stick;
    const mag = Math.min(1, Math.hypot(dx, dy) / 56);
    const d = Math.hypot(dx, dy) || 1;
    const reach = (mag * 600) / Math.max(0.3, S.cam.s);
    tx = cx + (dx / d) * reach;
    ty = cy + (dy / d) * reach;
  } else if (document.body.classList.contains('touch')) {
    tx = cx;
    ty = cy;
  } else {
    tx = S.cam.x + (S.mouse.x - renderer.w / 2) / S.cam.s;
    ty = S.cam.y + (S.mouse.y - renderer.h / 2) / S.cam.s;
  }
  if (S.eject && now - lastEjectSfx > 130 && S.myMass >= CFG.minEject) {
    lastEjectSfx = now;
    sfx.eject();
  }
  const every = S.mode === 'online' ? 66 : 0;
  if (now - lastSend < every) return;
  lastSend = now;
  S.session?.send({ t: 'i', x: Math.round(tx), y: Math.round(ty), w: S.eject ? 1 : 0 });
}

// ---------------------------------------------------------------- controles
const cv = $('cv');
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    S.mouse.x = e.clientX;
    S.mouse.y = e.clientY;
  }
});
cv.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || !S.alive || S.screen !== null) return;
  S.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
  const st = $('stick');
  st.hidden = false;
  st.style.left = `${e.clientX}px`;
  st.style.top = `${e.clientY}px`;
  $('knob').style.transform = '';
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (!S.stick || e.pointerId !== S.stick.id) return;
  let dx = e.clientX - S.stick.x0;
  let dy = e.clientY - S.stick.y0;
  const d = Math.hypot(dx, dy);
  if (d > 56) {
    // el joystick acompaña al dedo si se va lejos
    S.stick.x0 += (dx / d) * (d - 56);
    S.stick.y0 += (dy / d) * (d - 56);
    dx = e.clientX - S.stick.x0;
    dy = e.clientY - S.stick.y0;
    $('stick').style.left = `${S.stick.x0}px`;
    $('stick').style.top = `${S.stick.y0}px`;
  }
  S.stick.dx = dx;
  S.stick.dy = dy;
  $('knob').style.transform = `translate(${dx}px, ${dy}px)`;
});
const endStick = (e) => {
  if (!S.stick || e.pointerId !== S.stick.id) return;
  S.stick = null;
  $('stick').hidden = true;
};
cv.addEventListener('pointerup', endStick);
cv.addEventListener('pointercancel', endStick);
cv.addEventListener(
  'wheel',
  (e) => {
    if (!S.alive) return;
    S.zoom = Math.min(1.35, Math.max(0.7, S.zoom * (e.deltaY > 0 ? 0.93 : 1.07)));
  },
  { passive: true },
);

function doSplit() {
  if (!S.alive || S.screen !== null) return;
  S.session?.send({ t: 'sp' });
  if (S.myMass >= CFG.minSplit) sfx.split();
}
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) doSplit();
  } else if (e.code === 'KeyW') {
    if (S.alive && S.screen === null) S.eject = true;
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.screen === null && S.mode !== 'demo') openPause();
    else if (S.screen === 'pause') closePause();
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') S.eject = false;
});
addEventListener('blur', () => (S.eject = false));
$('t-split').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  doSplit();
});
const ejectBtn = $('t-eject');
ejectBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (!S.alive) return;
  S.eject = true;
  ejectBtn.classList.add('on');
  ejectBtn.setPointerCapture(e.pointerId);
});
const ejectOff = () => {
  S.eject = false;
  ejectBtn.classList.remove('on');
};
ejectBtn.addEventListener('pointerup', ejectOff);
ejectBtn.addEventListener('pointercancel', ejectOff);

// ---------------------------------------------------------------- pantallas
function show(id) {
  S.screen = id;
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  const playing = id === null && S.mode !== 'demo';
  $('hud').hidden = S.mode === 'demo';
  document.body.classList.toggle('playing', playing);
  G.gameplay(playing && S.alive);
  if (playing) S.mouse = { x: renderer.w / 2, y: renderer.h / 2 };
}

function startDemo() {
  S.mode = 'demo';
  S.alive = false;
  S.me = 0;
  S.paused = false;
  S.session = new LocalSession(true);
  S.cam.s = 0.4;
}

function goHome() {
  if (S.mode === 'online' && net) net.leave();
  quickWanted = false;
  pendingCreate = null;
  startDemo();
  show('home');
}

function spawn(mass) {
  S.myMass = 0;
  S.myCount = 0;
  S.zoom = 1;
  S.session.send({ t: 'spawn', name: profile.name || defaultName(), color: profile.color, ...(mass ? { mass } : {}) });
}

function saveProfile() {
  profile.name = $('name').value.trim().slice(0, 16);
  store.set('profile', profile);
}

$('go-solo').onclick = () => {
  click();
  saveProfile();
  S.mode = 'solo';
  S.session = new LocalSession(false);
  S.paused = false;
  hint();
  spawn();
};
$('go-online').onclick = () => {
  click();
  saveProfile();
  hint();
  quickPlay();
};
$('go-private').onclick = () => {
  click();
  saveProfile();
  show('private');
};
$('pv-create').onclick = () => {
  click();
  enterOnline();
  hint();
  pendingCreate = { public: false };
  ensureNet().create(profile.name || defaultName());
};
$('pv-join').onsubmit = (e) => {
  e.preventDefault();
  click();
  const code = $('pv-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return;
  enterOnline();
  hint();
  ensureNet().join(code, profile.name || defaultName());
};
$('pv-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$$('[data-go="home"]').forEach((b) => (b.onclick = () => (click(), show('home'))));

function openPause() {
  S.eject = false;
  if (S.mode === 'solo') S.paused = true;
  $('pause-sub').textContent = S.mode === 'online' ? t('menuOnline') : '';
  $('pz-share').hidden = !(S.mode === 'online' && net?.room?.settings?.public === false);
  show('pause');
}
function closePause() {
  S.paused = false;
  S.base = null;
  show(null);
}
$('btn-menu').onclick = () => (click(), openPause());
$('pz-resume').onclick = () => (click(), closePause());
$('pz-quit').onclick = () => (click(), goHome());
const doShare = async () => {
  if (!net?.room) return;
  const r = await share('ameba', net.room.code);
  if (r === 'copied') toast(t('copied'));
};
$('pz-share').onclick = doShare;
$('room-chip').onclick = doShare;

function onDead(m) {
  S.alive = false;
  S.eject = false;
  S.stick = null;
  $('stick').hidden = true;
  sfx.dead();
  const killer = S.players.get(m.by);
  S.lastStats = m.stats;
  $('dead-title').textContent = killer ? t('eatenBy', { n: killer.name || '?' }) : t('died');
  const st = m.stats || {};
  const secs = Math.round(st.time || 0);
  $('dead-stats').innerHTML = [
    [Math.round(st.maxMass || 0), t('statMax')],
    [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, t('statTime')],
    [st.food || 0, t('statFood')],
    [st.eaten || 0, t('statCells')],
  ]
    .map(([v, l]) => `<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`)
    .join('');
  const rv = $('dead-revive');
  rv.hidden = true;
  const reviveMass = Math.min(3000, Math.round((st.maxMass || 0) * 0.5));
  if (S.mode === 'solo' && reviveMass > CFG.startMass * 3) {
    G.rewardAvailable('revivir').then((ok) => {
      if (!ok || S.screen !== 'dead') return;
      rv.textContent = t('revive', { m: reviveMass });
      rv.hidden = false;
      rv.onclick = async () => {
        rv.hidden = true;
        if (await G.showReward()) spawn(reviveMass);
      };
    });
  }
  setTimeout(() => {
    if (!S.alive && S.mode !== 'demo') show('dead');
  }, 900);
  G.gameplay(false);
}
$('dead-again').onclick = async () => {
  click();
  await G.commercialBreak('otra-vida'); // pausa natural (por defecto sin anuncio)
  if (S.mode === 'solo' || S.mode === 'online') spawn();
};
$('dead-menu').onclick = () => (click(), goHome());

// ---------------------------------------------------------------- HUD
function renderLb() {
  const list = S.lb;
  let html = list
    .map(([num]) => {
      const p = S.players.get(num);
      return `<li class="${num === S.me && S.alive ? 'me' : ''}"><span>${esc(p?.name || '…')}</span></li>`;
    })
    .join('');
  const idx = list.findIndex(([num]) => num === S.me);
  if (S.alive && idx < 0 && S.mode !== 'demo') html += `<li class="me me-extra" data-r="–"><span>${esc(profile.name || defaultName())}</span></li>`;
  $('lb-list').innerHTML = html;
  $('rank').textContent = S.alive && idx >= 0 ? `#${idx + 1}` : '';
}

function hint() {
  const el = $('hint');
  el.textContent = t(document.body.classList.contains('touch') ? 'hintTouch' : 'hintDesk');
  el.classList.remove('off');
  clearTimeout(hint.t);
  hint.t = setTimeout(() => el.classList.add('off'), 6000);
}

function feed(text) {
  const li = document.createElement('li');
  li.textContent = text;
  $('feed').appendChild(li);
  setTimeout(() => li.remove(), 2700);
}

let toastT = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2400);
}

function renderColors() {
  $('colors').innerHTML = PALETTE.map((c, i) => `<button data-c="${i}" class="${profile.color === i ? 'on' : ''}" style="background:${c};color:${c}" aria-label="${c}"></button>`).join('');
}
$('colors').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  click();
  profile.color = Number(b.dataset.c);
  store.set('profile', profile);
  renderColors();
};

// ---------------------------------------------------------------- sonidos
function click() {
  tone(620, 480, 0.05, { type: 'triangle', vol: 0.07 });
}
const sfx = {
  blip: (m) => tone(900 + Math.min(600, m), 1400 + Math.min(600, m), 0.04, { type: 'sine', vol: 0.05 }),
  gulp: () => {
    tone(420, 120, 0.18, { type: 'sine', vol: 0.3 });
    noise(0.12, { freq: 500, q: 1, vol: 0.2, sweep: 200 });
  },
  split: () => noise(0.14, { freq: 900, q: 0.8, vol: 0.25, sweep: 2600 }),
  eject: () => noise(0.06, { freq: 1400, q: 1.2, vol: 0.12 }),
  pop: () => {
    noise(0.2, { freq: 2000, q: 0.6, vol: 0.35, sweep: 300 });
    tone(300, 90, 0.2, { type: 'triangle', vol: 0.2 });
  },
  dead: () => notes([392, 311, 233], { step: 0.12, dur: 0.3, vol: 0.12 }),
};

// ---------------------------------------------------------------- arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  const touch = !!G.prefs.touch;
  document.body.classList.toggle('touch', touch);
  $('touch').hidden = !touch;
  $('keys').innerHTML = G.t(TXT[touch ? 'keysTouch' : 'keysDesk']);
  $('name').placeholder = defaultName();
  renderer.theme(G.prefs);
  renderLb();
}
G.onPrefs(applyPrefs, true);
G.onPause(() => {
  S.eject = false;
  if (S.mode === 'solo' && S.screen === null) openPause();
});
addEventListener('resize', () => renderer.resize());

$('name').value = profile.name;
renderColors();
startDemo();
show('home');
requestAnimationFrame(frame);
const code = roomFromUrl();
if (code) {
  $('pv-code').value = code;
  show('private');
}
if (new URLSearchParams(location.search).has('debug')) window.__ameba = { S, onMsg };
G.ready();
