/* Serpentina — game.it
 * Estilo .io: guiá tu serpiente, comé orbes para crecer, acelerá gastando largo y hacé que las
 * demás choquen contra tu cuerpo. Sin conexión contra bots o en arenas online. El mismo mundo
 * corre en el servidor y en el navegador; el cliente reconstruye los cuerpos a partir de la cabeza.
 */
import { World, TPS, DT, CFG, PALETTE, grow, viewSpan, bodyR } from './shared/world.js';
import { brain, think, BOT_NAMES } from './shared/bots.js';
import { Viewer } from './shared/sync.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { Renderer, drawMini } from './render.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const TICK_MS = 1000 / TPS;

const TXT = {
  title: { es: 'Serpentina', en: 'Serpentine' },
  tagline: { es: 'crecé, acelerá y encerralos', en: 'grow, boost and trap them' },
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
  top: { es: 'Las más largas', en: 'Leaderboard' },
  length: { es: 'Largo', en: 'Length' },
  paused: { es: 'Pausa', en: 'Paused' },
  menuOnline: { es: 'La arena sigue', en: 'The arena keeps going' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  copyLink: { es: 'Copiar link de la sala', en: 'Copy room link' },
  menu: { es: 'Menú', en: 'Menu' },
  again: { es: 'Jugar de nuevo', en: 'Play again' },
  over: { es: 'Fin de la partida', en: 'Game over' },
  crashedInto: { es: 'Chocaste con {n}', en: 'You crashed into {n}' },
  crashedWall: { es: 'Chocaste con el borde', en: 'You hit the edge' },
  revive: { es: '▶ Revivir con {m} de largo', en: '▶ Revive with {m} length' },
  statLen: { es: 'largo final', en: 'final length' },
  statMax: { es: 'largo máximo', en: 'top length' },
  statTime: { es: 'tiempo vivo', en: 'time alive' },
  statKills: { es: 'serpientes eliminadas', en: 'snakes taken down' },
  youGot: { es: '¡{n} chocó contra vos!', en: '{n} crashed into you!' },
  keysDesk: { es: '<kbd>Mouse</kbd> girar · <kbd>Clic</kbd> o <kbd>Espacio</kbd> turbo', en: '<kbd>Mouse</kbd> steer · <kbd>Click</kbd> or <kbd>Space</kbd> boost' },
  keysTouch: { es: 'Arrastrá para girar · mantené ⚡ para el turbo', en: 'Drag to steer · hold ⚡ to boost' },
  hintDesk: { es: 'Mantené el clic para acelerar (cuesta largo)', en: 'Hold click to boost (costs length)' },
  hintTouch: { es: 'Mantené ⚡ para acelerar (cuesta largo)', en: 'Hold ⚡ to boost (costs length)' },
  searching: { es: 'Buscando una arena…', en: 'Finding an arena…' },
  roomChip: { es: 'Sala {c} · copiar link', en: 'Room {c} · copy link' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
};
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k }) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};

const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem('gameit:serpentina:' + k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('gameit:serpentina:' + k, JSON.stringify(v));
    } catch {}
  },
};
const profile = store.get('profile', { name: '', color: Math.floor(Math.random() * PALETTE.length) });

// ---------------------------------------------------------------- estado
const S = {
  screen: 'home',
  mode: 'demo',
  session: null,
  me: 0,
  alive: false,
  focus: 0,
  R: CFG.radius,
  players: new Map(),
  lb: [],
  queue: [],
  lastK: 0,
  base: null,
  jitter: 0,
  snakes: new Map(),
  corpses: [],
  foods: new Map(),
  chunks: new Map(),
  sucked: [],
  cam: { x: 0, y: 0, s: 0.6 },
  zoom: 1,
  paused: false,
  mouse: { x: innerWidth / 2, y: innerHeight / 2 },
  stick: null,
  boost: false,
  mouseBoost: false,
  myLen: 0,
  spawnAt: 0,
  wantSpawn: false,
};
const renderer = new Renderer($('cv'));

// ---------------------------------------------------------------- sesión local
class LocalSession {
  constructor(demo) {
    this.w = new World((Math.random() * 2 ** 31) >>> 0);
    this.demo = demo;
    this.brains = new Map();
    this.bots = [];
    this.me = null;
    this.viewer = null;
    this.acc = 0;
    const offset = Math.floor(Math.random() * BOT_NAMES.length);
    for (let i = 0; i < 15; i++) {
      const p = this.w.addPlayer({ name: BOT_NAMES[(offset + i) % BOT_NAMES.length], color: (offset + i) % PALETTE.length, bot: true });
      this.brains.set(p.num, brain(1 + (i % 3), this.w.rnd));
      this.bots.push(p.num);
      this.w.spawn(p.num);
    }
    for (let i = 0; i < TPS * 5; i++) this.tick(false);
    resetNet();
    S.R = this.w.R;
    this.table();
  }
  table() {
    onMsg({ t: 'pl', p: [...this.w.players.values()].map((p) => [p.num, p.name, p.color, p.bot ? 1 : 0]) });
  }
  send(msg) {
    const w = this.w;
    if (msg.t === 'spawn') {
      if (!this.me) {
        this.me = w.addPlayer({ name: msg.name, color: msg.color });
        this.viewer = new Viewer(w, this.me.num);
        this.demoViewer = null;
        resetNet(); // lo que veía la cámara de demo se vuelve a mandar desde la vista propia
      }
      this.me.name = msg.name;
      this.me.color = msg.color;
      w.spawn(this.me.num, msg.mass || CFG.startMass);
      this.table();
      onMsg({ t: 'me', num: this.me.num, alive: true, R: w.R });
    } else if (msg.t === 'i' && this.me) w.setInput(this.me.num, msg.x, msg.y, msg.b === 1);
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
        if (w.tick - p.deadAt > 2.5 * TPS) w.spawn(num);
      } else think(w, p, this.brains.get(num));
    }
    w.step();
    const deaths = w.deaths.splice(0);
    if (!emit) {
      w.events.clear();
      return;
    }
    const dead = new Set(deaths.map((d) => d.id));
    for (const x of deaths) {
      if (this.me && x.num === this.me.num) onMsg({ t: 'dead', by: x.by, stats: x.stats });
      if (this.me && x.by === this.me.num) onMsg({ t: 'ko', n: x.num });
    }
    let viewer = this.viewer;
    if (!viewer || (this.demo && !this.me?.alive)) {
      // demo: la cámara sigue a la más larga
      const lead = w.leaderboard(1)[0];
      const num = lead ? lead[0] : this.bots[0];
      if (!this.demoViewer || this.demoViewer.num !== num) {
        this.demoViewer = new Viewer(w, num);
        resetNet();
      }
      viewer = this.demoViewer;
      S.focus = num;
    }
    onMsg(viewer.build(dead));
    w.events.clear();
    if (w.tick % TPS === 0) onMsg({ t: 'lb', l: w.leaderboard() });
  }
}

// ---------------------------------------------------------------- online
let net = null;
let pendingCreate = null;
let quickWanted = false;
let startSent = false;

function ensureNet() {
  if (net) return net;
  net = new OnlineRoom('serpentina', {
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
        if (m.code === 'not_found' || m.code === 'room_full') startDemo();
        return;
      }
      if (m.t === 'closed' || m.t === 'kicked') {
        if (S.mode === 'online' && m.reason === 'max_life') {
          toast(netText('closed_max_life'));
          quickPlay();
          return;
        }
        $('home-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
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

function enterOnline() {
  S.mode = 'online';
  S.session = new NetSession();
  S.wantSpawn = true;
  S.me = 0;
  S.alive = false;
  resetNet();
}

function quickPlay() {
  enterOnline();
  $('home-status').textContent = t('searching');
  quickWanted = true;
  ensureNet().send({ t: 'list', game: 'serpentina' });
}

// ---------------------------------------------------------------- mensajes
function resetNet() {
  S.queue = [];
  S.base = null;
  S.jitter = 0;
  S.lastK = 0;
  S.snakes.clear();
  S.corpses = [];
  S.foods.clear();
  S.chunks.clear();
  S.sucked = [];
}

function onMsg(m) {
  switch (m.t) {
    case 'pl':
      S.players = new Map(m.p.map(([num, name, color, bot]) => [num, { name, color, bot }]));
      renderLb();
      return;
    case 'me':
      S.me = m.num;
      if (m.R) S.R = m.R;
      if (m.alive) {
        S.alive = true;
        S.spawnAt = performance.now();
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
      if (p) feed(t('youGot', { n: p.name || '?' }));
      sfx.kill();
      return;
    }
  }
}

function pushSnap(m) {
  const now = performance.now();
  const last = S.queue[S.queue.length - 1];
  if (last && m.k <= last.k) {
    if (last.k - m.k > TPS * 2) resetNet();
    else return;
  }
  // cabezas del paso, listas para interpolar
  const heads = new Map();
  const n = m.n || [];
  for (let i = 0; i < n.length; i += 6) heads.set(n[i], [n[i + 1] / 10, n[i + 2] / 10]);
  m.heads = heads;
  S.queue.push(m);
  const est = now - m.k * TICK_MS;
  if (S.base === null || est - S.base > 300) S.base = est;
  else {
    S.jitter = S.jitter * 0.95 + Math.abs(est - S.base) * 0.05;
    if (est < S.base) S.base = est;
    else S.base += 0.02;
  }
  // si se acumula demasiado (pestaña oculta), se aplica todo de una
  if (S.queue.length > 90) {
    while (S.queue.length > 3) apply(S.queue.shift(), now);
    S.base = null;
  }
}

function apply(m, now) {
  S.lastK = m.k;
  // comida
  if (m.fd) for (const ch of m.fd) dropChunk(ch);
  if (m.fa) {
    for (let i = 0; i < m.fa.length; i += 2) {
      const ch = m.fa[i];
      dropChunk(ch);
      const set = new Set();
      const list = m.fa[i + 1];
      for (let j = 0; j < list.length; j += 5) {
        const f = { id: list[j], x: list[j + 1], y: list[j + 2], v: list[j + 3] / 10, c: list[j + 4], born: -1e9, ch };
        S.foods.set(f.id, f);
        set.add(f.id);
      }
      S.chunks.set(ch, set);
    }
  }
  if (m.fe) {
    for (let j = 0; j < m.fe.length; j += 5) {
      const f = { id: m.fe[j], x: m.fe[j + 1], y: m.fe[j + 2], v: m.fe[j + 3] / 10, c: m.fe[j + 4], born: now };
      f.ch = chunkOf(f.x, f.y);
      const set = S.chunks.get(f.ch);
      if (!set) continue;
      set.add(f.id);
      S.foods.set(f.id, f);
    }
  }
  if (m.fr) {
    for (let j = 0; j < m.fr.length; j += 2) {
      const f = S.foods.get(m.fr[j]);
      if (!f) continue;
      S.foods.delete(f.id);
      S.chunks.get(f.ch)?.delete(f.id);
      const by = m.fr[j + 1];
      if (by && S.snakes.has(by) && S.sucked.length < 150) S.sucked.push({ x: f.x, y: f.y, v: f.v, c: f.c, by, t: now });
    }
  }
  // serpientes nuevas en vista (cuerpo entero)
  if (m.b) {
    for (const b of m.b) {
      const [id, num, color, m10, flags, x10, y10, a100, pts] = b;
      S.snakes.set(id, { id, num, color, m: m10 / 10, boost: !!(flags & 1), x: x10 / 10, y: y10 / 10, hx: x10 / 10, hy: y10 / 10, a: a100 / 100, pts: pts.map((v) => v / 10), trimmed: 0 });
    }
  }
  // cabezas: el cuerpo crece con el mismo algoritmo del servidor
  if (m.n) {
    const n = m.n;
    for (let i = 0; i < n.length; i += 6) {
      const s = S.snakes.get(n[i]);
      if (!s) continue;
      s.x = n[i + 1] / 10;
      s.y = n[i + 2] / 10;
      s.m = n[i + 3] / 10;
      s.boost = !!(n[i + 4] & 1);
      s.a = n[i + 5] / 100;
      s.trimmed += grow(s.pts, s.x, s.y, s.m);
    }
  }
  if (m.g) {
    for (const id of m.g) {
      const s = S.snakes.get(id);
      S.snakes.delete(id);
      if (s && m.dd?.includes(id)) {
        s.diedAt = now;
        S.corpses.push(s);
        if (s.num === S.me) sfx.crash();
      }
    }
  }
}

function dropChunk(ch) {
  const set = S.chunks.get(ch);
  if (!set) return;
  for (const id of set) S.foods.delete(id);
  S.chunks.delete(ch);
}

function chunkOf(x, y) {
  const cols = Math.ceil((S.R * 2) / CFG.chunk);
  const gx = Math.min(cols - 1, Math.max(0, Math.floor((x + S.R) / CFG.chunk)));
  const gy = Math.min(cols - 1, Math.max(0, Math.floor((y + S.R) / CFG.chunk)));
  return gx + gy * cols;
}

/** Aplica los pasos que ya tocan y ubica las cabezas entre este paso y el siguiente. */
function advance(now) {
  if (S.base === null) return;
  const delay = S.mode === 'online' ? Math.min(6, Math.max(2, 1.2 + (S.jitter / TICK_MS) * 1.6)) : 1;
  const rt = (now - S.base) / TICK_MS - delay;
  while (S.queue.length && S.queue[0].k <= rt) apply(S.queue.shift(), now);
  const next = S.queue[0];
  const k = next ? Math.min(1, Math.max(0, (rt - S.lastK) / (next.k - S.lastK))) : 0;
  for (const s of S.snakes.values()) {
    const h = next?.heads.get(s.id);
    if (h) {
      s.hx = s.x + (h[0] - s.x) * k;
      s.hy = s.y + (h[1] - s.y) * k;
    } else {
      s.hx = s.x;
      s.hy = s.y;
    }
  }
}

// ---------------------------------------------------------------- bucle
let lastT = performance.now();
let lastSend = 0;
let lastHud = 0;
let lastMini = 0;
let lastBlip = 0;
let lastBoostSfx = 0;
let prevLen = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - lastT);
  lastT = now;
  S.session?.update(dt);
  advance(now);
  if (S.corpses.length) S.corpses = S.corpses.filter((c) => now - c.diedAt < 600);
  if (S.sucked.length) S.sucked = S.sucked.filter((e) => now - e.t < 170);
  const focusNum = S.alive ? S.me : S.mode === 'demo' ? S.focus : -99;
  let mine = null;
  for (const s of S.snakes.values()) if (s.num === focusNum) mine = s;
  if (mine) {
    const follow = 1 - Math.exp(-dt / (S.mode === 'demo' ? 200 : 40));
    S.cam.x += (mine.hx - S.cam.x) * follow;
    S.cam.y += (mine.hy - S.cam.y) * follow;
    const screen = Math.max(700, Math.sqrt(renderer.w * renderer.h));
    const target = (screen / viewSpan(mine.m)) * S.zoom * (S.mode === 'demo' ? 0.85 : 1);
    S.cam.s += (target - S.cam.s) * (1 - Math.exp(-dt / 500));
  }
  if (S.alive && mine) {
    const len = Math.round(mine.m * 10);
    if (len > prevLen + 4 && now - lastBlip > 60) {
      lastBlip = now;
      sfx.eat(len);
    }
    prevLen = len;
    S.myLen = len;
    // mirar hacia donde apunta el jugador
    const d = aimDir();
    mine.look = d ? Math.atan2(d[1], d[0]) : undefined;
    if (S.boost && mine.boost && now - lastBoostSfx > 150) {
      lastBoostSfx = now;
      sfx.boost();
    }
    sendInput(now);
  }
  renderer.draw({ cam: S.cam, R: S.R, snakes: S.snakes, corpses: S.corpses, foods: S.foods.values(), sucked: S.sucked, players: S.players, me: S.alive ? S.me : -99, t: now });
  if (S.mode !== 'demo' && now - lastHud > 120) {
    lastHud = now;
    $('len').textContent = S.alive ? S.myLen : 0;
  }
  if (S.mode !== 'demo' && now - lastMini > 250 && !document.body.classList.contains('touch')) {
    lastMini = now;
    drawMini($('mini'), { R: S.R, me: mine && S.alive ? { x: mine.hx, y: mine.hy } : null, lb: S.lb, meNum: S.me, dark: renderer.dark, accent: renderer.accent });
  }
}

function aimDir() {
  if (S.stick) {
    const { dx, dy } = S.stick;
    if (Math.hypot(dx, dy) < 6) return null;
    return [dx, dy];
  }
  if (document.body.classList.contains('touch')) return null;
  const dx = S.mouse.x - renderer.w / 2;
  const dy = S.mouse.y - renderer.h / 2;
  if (Math.hypot(dx, dy) < 4) return null;
  return [dx, dy];
}

function sendInput(now) {
  const every = S.mode === 'online' ? 66 : 0;
  if (now - lastSend < every) return;
  lastSend = now;
  const d = S.screen === null ? aimDir() : null;
  const boost = S.screen === null && (S.boost || S.mouseBoost);
  const len = d ? Math.hypot(d[0], d[1]) : 1;
  S.session?.send({ t: 'i', x: d ? Math.round((d[0] / len) * 1000) : 0, y: d ? Math.round((d[1] / len) * 1000) : 0, b: boost ? 1 : 0 });
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
  if (!S.alive || S.screen !== null) return;
  if (e.pointerType === 'mouse') {
    if (e.button === 0) S.mouseBoost = true;
    return;
  }
  S.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
  const st = $('stick');
  st.hidden = false;
  st.style.left = `${e.clientX}px`;
  st.style.top = `${e.clientY}px`;
  $('knob').style.transform = '';
  cv.setPointerCapture(e.pointerId);
});
addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse') S.mouseBoost = false;
});
cv.addEventListener('pointermove', (e) => {
  if (!S.stick || e.pointerId !== S.stick.id) return;
  let dx = e.clientX - S.stick.x0;
  let dy = e.clientY - S.stick.y0;
  const d = Math.hypot(dx, dy);
  if (d > 56) {
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
  // se suelta el dedo: la serpiente sigue en la última dirección
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
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (S.alive && S.screen === null) S.boost = true;
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.screen === null && S.mode !== 'demo') openPause();
    else if (S.screen === 'pause') closePause();
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') S.boost = false;
});
addEventListener('blur', () => {
  S.boost = false;
  S.mouseBoost = false;
});
const boostBtn = $('t-boost');
boostBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (!S.alive) return;
  S.boost = true;
  boostBtn.classList.add('on');
  boostBtn.setPointerCapture(e.pointerId);
});
const boostOff = () => {
  S.boost = false;
  boostBtn.classList.remove('on');
};
boostBtn.addEventListener('pointerup', boostOff);
boostBtn.addEventListener('pointercancel', boostOff);

// ---------------------------------------------------------------- pantallas
function show(id) {
  S.screen = id;
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  const playing = id === null && S.mode !== 'demo';
  $('hud').hidden = S.mode === 'demo';
  document.body.classList.toggle('playing', playing);
  G.gameplay(playing && S.alive);
}

function startDemo() {
  S.mode = 'demo';
  S.alive = false;
  S.me = 0;
  S.paused = false;
  S.session = new LocalSession(true);
  S.cam.s = 0.5;
}

function goHome() {
  if (S.mode === 'online' && net) net.leave();
  quickWanted = false;
  pendingCreate = null;
  startDemo();
  show('home');
}

function spawn(mass) {
  prevLen = 0;
  S.zoom = 1;
  S.boost = false;
  S.mouseBoost = false;
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
  S.boost = false;
  S.mouseBoost = false;
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
  const r = await share('serpentina', net.room.code);
  if (r === 'copied') toast(t('copied'));
};
$('pz-share').onclick = doShare;
$('room-chip').onclick = doShare;

function onDead(m) {
  S.alive = false;
  S.boost = false;
  S.mouseBoost = false;
  S.stick = null;
  $('stick').hidden = true;
  const killer = S.players.get(m.by);
  $('dead-title').textContent = m.by ? t('crashedInto', { n: killer?.name || '?' }) : t('crashedWall');
  const st = m.stats || {};
  const secs = Math.round(st.time || 0);
  $('dead-stats').innerHTML = [
    [st.length || 0, t('statLen')],
    [Math.round((st.maxM || 0) * 10), t('statMax')],
    [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, t('statTime')],
    [st.kills || 0, t('statKills')],
  ]
    .map(([v, l]) => `<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`)
    .join('');
  const rv = $('dead-revive');
  rv.hidden = true;
  const reviveMass = Math.min(400, Math.round((st.maxM || 0) * 0.5));
  if (S.mode === 'solo' && reviveMass > CFG.startMass * 3) {
    G.rewardAvailable('revivir').then((ok) => {
      if (!ok || S.screen !== 'dead') return;
      rv.textContent = t('revive', { m: reviveMass * 10 });
      rv.hidden = false;
      rv.onclick = async () => {
        rv.hidden = true;
        if (await G.showReward()) spawn(reviveMass);
      };
    });
  }
  G.gameplay(false);
  setTimeout(() => {
    if (!S.alive && S.mode !== 'demo') show('dead');
  }, 1000);
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
    .map(([num, len]) => {
      const p = S.players.get(num);
      return `<li class="${num === S.me && S.alive ? 'me' : ''}"><span>${esc(p?.name || '…')}</span><b>${len}</b></li>`;
    })
    .join('');
  const idx = list.findIndex(([num]) => num === S.me);
  if (S.alive && idx < 0 && S.mode !== 'demo') html += `<li class="me me-extra" data-r="–"><span>${esc(profile.name || defaultName())}</span><b>${S.myLen}</b></li>`;
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
  eat: (len) => tone(700 + (len % 400), 1100 + (len % 400), 0.05, { type: 'sine', vol: 0.05 }),
  boost: () => noise(0.12, { freq: 700, q: 0.7, vol: 0.05, sweep: 1600 }),
  crash: () => {
    noise(0.35, { freq: 900, q: 0.6, vol: 0.4, sweep: 120 });
    notes([330, 262, 196], { step: 0.12, dur: 0.3, vol: 0.12 });
  },
  kill: () => notes([784, 1175], { step: 0.07, dur: 0.16, vol: 0.12 }),
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
  S.boost = false;
  S.mouseBoost = false;
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
if (new URLSearchParams(location.search).has('debug')) window.__serp = { S, onMsg };
G.ready();
