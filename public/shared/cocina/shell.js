/**
 * Cocina — el armazón de los juegos de atender un local (pizzería, heladería, hamburguesería…). Cada juego le pasa su
 * definición con `run(def)` y el armazón pone todo lo común: el lienzo que se adapta (horizontal o vertical), el salón
 * con los clientes que entran, hacen fila, piden y esperan sentados; las comandas colgadas arriba; las pestañas de las
 * estaciones; el reloj del día; la entrega con el puntaje de cada estación, la propina y la reacción del cliente; el
 * resumen del día, los rangos, la tienda de mejoras, la libreta de clientes, la pausa y el guardado.
 *
 * def = {
 *   id, title: {es,en}, theme: {...colores del local y del salón}, txt: {...textos propios},
 *   stations: [estación…]          // sin la de pedidos: esa la pone el armazón
 *   makeOrder(r, ctx, person, old)  // pedido favorito de un cliente (r = azar con semilla)
 *   drawTicket(g, order, w, h)      // el cuerpo de la comanda (el armazón dibuja papel, nombre y número)
 *   drawProduct(g, product, x, y, s)// el producto terminado (para la entrega)
 *   grade(order, product, ctx)      // [{ label:{es,en}, score }] una por estación
 *   expected(order, ctx)            // segundos razonables para tenerlo listo (para la espera)
 *   unlocks: [{ rank, id, name:{es,en}, icon(g,x,y,s) }]   // lo que se abre en cada rango
 *   upgrades: [{ id, name, desc, cost, max, icon }]        // mejoras propias (se suman a las comunes)
 *   help: [{es,en}…]                // pasos de "Cómo se juega"
 *   base(order)                     // propina base de un pedido (según lo complicado)
 * }
 *
 * Estación = { id, label:{es,en}, icon(g,x,y,s), init(ctx), layout(ctx, area), tick(ctx, dt), draw(ctx, g),
 *              down/move/up(ctx, p), accept(ctx, product), badge(ctx) → {n, alert}, hint(ctx) → {text,x,y} }
 */
import { rng, hash, clamp, lerp, TAU, roster, rankOf, planDay, waitScore, total, tipFor, mood, money, clock, newSave, fixSave, record, buy, upCost } from './core.js';
import * as A from './art.js';
import { sfx, loop, quiet } from './sound.js';

const G = window.GameIt;
const TOP = 56;
const $ = (id) => document.getElementById(id);
export const PEOPLE = roster();

const TXT = {
  play: { es: 'Abrir el local', en: 'Open the shop' },
  cont: { es: 'Día {n} · Rango {r}', en: 'Day {n} · Rank {r}' },
  album: { es: 'Clientes', en: 'Customers' },
  help: { es: 'Cómo se juega', en: 'How to play' },
  reset: { es: 'Empezar de cero', en: 'Start over' },
  resetQ: { es: '¿Borrar todo el progreso y empezar de cero?', en: 'Erase all progress and start over?' },
  yes: { es: 'Sí, borrar', en: 'Yes, erase' },
  no: { es: 'No', en: 'No' },
  dayN: { es: 'Día {n}', en: 'Day {n}' },
  rankN: { es: 'Rango {r}', en: 'Rank {r}' },
  open: { es: '¡Abrir!', en: 'Open!' },
  shop: { es: 'Tienda', en: 'Shop' },
  today: { es: 'Hoy vienen {n} clientes', en: '{n} customers today' },
  take: { es: 'Tomar pedido', en: 'Take order' },
  orders: { es: 'Pedidos', en: 'Orders' },
  wait: { es: 'Espera', en: 'Waiting' },
  totalL: { es: 'Total', en: 'Total' },
  tip: { es: 'Propina', en: 'Tip' },
  perfect: { es: '¡Perfecto!', en: 'Perfect!' },
  love: { es: '¡Riquísimo!', en: 'Delicious!' },
  happy: { es: '¡Muy rico!', en: 'Very good!' },
  ok: { es: 'Está bien…', en: "It's okay…" },
  sad: { es: 'Mmm… no era así', en: "Hmm… that's not it" },
  next: { es: 'Seguir', en: 'Continue' },
  endDay: { es: 'Fin del día {n}', en: 'End of day {n}' },
  served: { es: 'Clientes atendidos', en: 'Customers served' },
  avg: { es: 'Puntaje promedio', en: 'Average score' },
  tips: { es: 'Propinas', en: 'Tips' },
  best: { es: 'Mejor pedido', en: 'Best order' },
  nextDay: { es: 'Siguiente día', en: 'Next day' },
  rankUp: { es: '¡Subiste a rango {r}!', en: 'You reached rank {r}!' },
  newStuff: { es: 'Ahora hay:', en: 'New:' },
  newPeople: { es: 'Clientes nuevos en camino', en: 'New customers on the way' },
  great: { es: '¡Bien!', en: 'Great!' },
  money: { es: 'Plata', en: 'Money' },
  buyB: { es: 'Comprar', en: 'Buy' },
  maxed: { es: 'Listo', en: 'Owned' },
  done: { es: 'Listo', en: 'Done' },
  lvl: { es: 'Nivel {a} de {b}', en: 'Level {a} of {b}' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al inicio', en: 'Back to title' },
  quitWarn: { es: 'Lo de hoy no se guarda: el día vuelve a empezar.', en: "Today won't be saved: the day starts over." },
  metN: { es: '{n} de {m} conocidos', en: '{n} of {m} met' },
  visits: { es: '{v} visitas · mejor {b}%', en: '{v} visits · best {b}%' },
  notYet: { es: 'Todavía no vino', en: 'Not met yet' },
  back: { es: '← volver', en: '← back' },
  hiAt: { es: '¡Llegó {name}! Tocá «Tomar pedido».', en: '{name} is here! Tap "Take order".' },
  goTo: { es: 'La comanda quedó colgada arriba. Ahora andá a {st}.', en: 'The ticket is hanging up top. Now go to {st}.' },
  waitMore: { es: 'Mientras se prepara, podés atender a otro cliente.', en: 'While it cooks, you can serve another customer.' },
  newRec: { es: '¡Récord del día!', en: 'Best day yet!' },
  tutorialOn: { es: 'El primer día te vamos guiando.', en: "On the first day we'll guide you." },
  upChairs: { es: 'Sillas cómodas', en: 'Comfy chairs' },
  upChairsD: { es: 'Los clientes esperan más tranquilos.', en: 'Customers wait more patiently.' },
  upJar: { es: 'Frasco de propinas', en: 'Tip jar' },
  upJarD: { es: 'Las propinas rinden un 15 % más.', en: 'Tips are worth 15% more.' },
  upSign: { es: 'Cartel en la vereda', en: 'Sidewalk sign' },
  upSignD: { es: 'Viene un cliente más por día.', en: 'One more customer per day.' },
  sky: { es: 'Mejor día: {m}', en: 'Best day: {m}' },
};

// ---------------------------------------------------------------- estado general
let D = null; // definición del juego
let save = null;
let cv, g;
let W = 0, H = 0, dpr = 1;
let VW = 1280, VH = 720, SC = 1, OX = 0, OY = TOP, portrait = false;
let AREA = { x: 0, y: 112, w: 1280, h: 512 };
let RAIL = { x: 0, y: 0, w: 1000, h: 112 };
let TABS = { x: 0, y: 624, w: 1280, h: 96 };
let screen = 'title'; // title | day | serve | over
let paused = false; // pausa propia (menú de pausa)
let portalPaused = false;
let day = null;
let serving = null;
let now = 0; // reloj real para animaciones
const fx = [];
const ptr = { x: -1, y: -1, down: false, id: null, btn: null, target: null };
let btns = []; // botones del cuadro actual (modo inmediato)
let lastBtns = [];
let titleCrowd = null;

const t = (k, v) => {
  let s = G.t(TXT[k] || D.txt?.[k] || { es: k, en: k });
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const tt = (o) => (typeof o === 'string' ? o : G.t(o));
const lang = () => G.prefs.lang;
const fmt = (v) => money(v, lang());

// ---------------------------------------------------------------- guardado
const KEY = () => `gameit:${D.id}:save`;
function load() {
  try {
    save = fixSave(JSON.parse(localStorage.getItem(KEY())));
  } catch {
    save = newSave();
  }
}
function store() {
  try {
    localStorage.setItem(KEY(), JSON.stringify(save));
  } catch {}
}
const rankNow = () => rankOf(save.xp).rank;

// ---------------------------------------------------------------- mejoras
const COMMON_UPS = [
  { id: 'sillas', name: 'upChairs', desc: 'upChairsD', cost: [25, 70], max: 2, icon: (g, x, y, s) => A.chair(g, D.theme, x, y + s * 1.1, s / 60) },
  { id: 'frasco', name: 'upJar', desc: 'upJarD', cost: [30, 80, 160], max: 3, icon: (g, x, y, s) => jar(g, x, y + s * 0.2, s * 0.9, 0.6) },
  { id: 'cartel', name: 'upSign', desc: 'upSignD', cost: [90, 220], max: 2, icon: (g, x, y, s) => signIcon(g, x, y, s) },
];
const allUps = () => [...(D.upgrades || []), ...COMMON_UPS];
const up = (id) => save?.upgrades?.[id] || 0;

// ---------------------------------------------------------------- contexto para las estaciones
const ctx = {
  get T() {
    return day ? day.T : 0;
  },
  get now() {
    return now;
  },
  get portrait() {
    return portrait;
  },
  get area() {
    return AREA;
  },
  get vw() {
    return VW;
  },
  get vh() {
    return VH;
  },
  get day() {
    return day;
  },
  get rank() {
    return rankNow();
  },
  get save() {
    return save;
  },
  get orders() {
    return day ? day.orders : [];
  },
  get active() {
    return day?.active || null;
  },
  get tutorial() {
    return !!day?.tutorial;
  },
  get station() {
    return day?.station;
  },
  get pointer() {
    return ptr;
  },
  people: PEOPLE,
  t,
  tt,
  up,
  sfx,
  loop,
  fmt,
  select(o) {
    if (day) day.active = o;
  },
  /** Arranca un producto para una comanda (la que esté elegida si no se pasa otra). */
  start(product, order = day.active) {
    product.order = order;
    product.id = product.id || `${order.id}-${(order.tries = (order.tries || 0) + 1)}`;
    order.product = product;
    order.where = day.station;
    return product;
  },
  /** Manda un producto a otra estación. */
  send(product, to) {
    const st = D.stations.find((s) => s.id === to);
    if (!st) return;
    product.order.where = to;
    st.accept(ctx, product);
    sfx.whoosh();
    pop(`→ ${tt(st.label)}`, AREA.x + AREA.w / 2, AREA.y + 40, '#fff');
  },
  /** Tira un producto a la basura (la comanda queda sin producto). */
  trash(product) {
    if (product?.order) {
      product.order.product = null;
      product.order.where = null;
    }
    sfx.squish();
  },
  /** Producto terminado: se entrega y se puntúa. */
  finish(product) {
    serve(product);
  },
  go(id) {
    goStation(id);
  },
  /** Botón del cuadro actual (se dibuja y se registra para el toque). */
  btn(id, x, y, w, h, label, opts = {}, onClick = null) {
    const hover = !G.prefs.touch && ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h;
    const press = ptr.down && ptr.btn === id;
    A.button(g, x, y, w, h, label, { ...opts, hover, press, on: opts.on !== false });
    btns.push({ id, x, y, w, h, on: opts.on !== false, onClick });
  },
  /** Zona tocable sin dibujo. */
  hit(id, x, y, w, h, onClick) {
    btns.push({ id, x, y, w, h, on: true, onClick });
  },
  /** Dibuja la comanda de un pedido con la esquina en (x, y) y escala s (220 × 330 a escala 1). */
  ticket(order, x, y, s = 1, opts = {}) {
    drawTicket(g, order, x, y, s, opts);
  },
  pop,
  coins(n, x, y) {
    for (let i = 0; i < n; i++) fx.push({ k: 'coin', x, y, vx: (Math.random() - 0.5) * 300, vy: -200 - Math.random() * 200, life: 0.9, t: 0 });
  },
  shake(v = 6) {
    if (!G.prefs.reducedMotion) day && (day.shake = v);
  },
};

function pop(s, x, y, color = '#fff', size = 30) {
  fx.push({ k: 'text', s, x, y, color, size, t: 0, life: 1.3 });
}

// ---------------------------------------------------------------- DOM
const HTML = () => `
<canvas id="c"></canvas>
<div class="ck-ui">
  <section class="ck-scr on" id="s-title">
    <div class="ck-card ck-home">
      <div class="ck-logo" id="ck-logo"></div>
      <p class="ck-sub" id="ck-tag"></p>
      <button class="ck-btn main" id="b-play"><span data-t="play"></span><small id="b-play-sub"></small></button>
      <div class="ck-row">
        <button class="ck-btn" id="b-album"><span data-t="album"></span></button>
        <button class="ck-btn" id="b-help"><span data-t="help"></span></button>
      </div>
      <button class="ck-link" id="b-reset" data-t="reset"></button>
    </div>
  </section>
  <section class="ck-scr dim" id="s-day">
    <div class="ck-card">
      <p class="ck-kicker" id="d-rank"></p>
      <h2 id="d-title"></h2>
      <p class="ck-sub" id="d-sub"></p>
      <div class="ck-bar"><i id="d-bar"></i></div>
      <p class="ck-money" id="d-money"></p>
      <button class="ck-btn main" id="d-open"><span data-t="open"></span></button>
      <button class="ck-btn" id="d-shop"><span data-t="shop"></span></button>
      <button class="ck-link" id="d-back" data-t="back"></button>
    </div>
  </section>
  <section class="ck-scr dim" id="s-sum">
    <div class="ck-card">
      <p class="ck-kicker" id="m-rank"></p>
      <h2 id="m-title"></h2>
      <ul class="ck-stats" id="m-stats"></ul>
      <div class="ck-bar big"><i id="m-bar"></i><b id="m-xp"></b></div>
      <button class="ck-btn main" id="m-next"><span data-t="nextDay"></span></button>
      <button class="ck-btn" id="m-shop"><span data-t="shop"></span></button>
    </div>
  </section>
  <section class="ck-scr dim" id="s-rank">
    <div class="ck-card">
      <div class="ck-badge" id="r-num"></div>
      <h2 id="r-title"></h2>
      <p class="ck-sub" data-t="newStuff" id="r-new-l"></p>
      <div class="ck-unlocks" id="r-list"></div>
      <p class="ck-sub" id="r-people"></p>
      <button class="ck-btn main" id="r-ok"><span data-t="great"></span></button>
    </div>
  </section>
  <section class="ck-scr dim" id="s-shop">
    <div class="ck-card wide">
      <h2 data-t="shop"></h2>
      <p class="ck-money" id="sh-money"></p>
      <div class="ck-shop" id="sh-list"></div>
      <button class="ck-btn main" id="sh-done"><span data-t="done"></span></button>
    </div>
  </section>
  <section class="ck-scr" id="s-album">
    <div class="ck-card wide">
      <h2 data-t="album"></h2>
      <p class="ck-sub" id="al-n"></p>
      <div class="ck-album" id="al-list"></div>
      <button class="ck-link" id="al-back" data-t="back"></button>
    </div>
  </section>
  <section class="ck-scr dim" id="s-help">
    <div class="ck-card wide">
      <h2 data-t="help"></h2>
      <ol class="ck-help" id="hp-list"></ol>
      <button class="ck-btn main" id="hp-ok"><span data-t="great"></span></button>
    </div>
  </section>
  <section class="ck-scr dim" id="s-pause">
    <div class="ck-card">
      <h2 data-t="paused"></h2>
      <button class="ck-btn main" id="p-resume"><span data-t="resume"></span></button>
      <button class="ck-btn" id="p-help"><span data-t="help"></span></button>
      <button class="ck-link" id="p-quit" data-t="quit"></button>
      <p class="ck-note" data-t="quitWarn"></p>
    </div>
  </section>
  <section class="ck-scr dim" id="s-confirm">
    <div class="ck-card">
      <h2 data-t="resetQ"></h2>
      <div class="ck-row">
        <button class="ck-btn danger" id="c-yes"><span data-t="yes"></span></button>
        <button class="ck-btn" id="c-no"><span data-t="no"></span></button>
      </div>
    </div>
  </section>
</div>`;

let overlay = 'title';
let helpReturn = 'title';
function show(id) {
  overlay = id;
  document.querySelectorAll('.ck-scr').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  const menu = !!id && id !== 'none';
  G.gameplay(!menu && screen !== 'title');
}
function translate() {
  document.documentElement.lang = lang();
  document.querySelectorAll('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  const logo = $('ck-logo');
  logo.replaceChildren(...tt(D.title).split(' ').map((w) => Object.assign(document.createElement('span'), { textContent: w })));
  $('ck-tag').textContent = tt(D.tagline);
  document.title = `${tt(D.title)} · game.it`;
  $('b-play-sub').textContent = t('cont', { n: save.day, r: rankNow() });
}

function bindDom() {
  $('b-play').onclick = () => dayCard();
  $('b-album').onclick = () => album();
  $('b-help').onclick = () => {
    helpReturn = 'title';
    help();
  };
  $('b-reset').onclick = () => show('confirm');
  $('c-no').onclick = () => show('title');
  $('c-yes').onclick = () => {
    save = newSave();
    store();
    translate();
    show('title');
  };
  $('d-open').onclick = () => startDay();
  $('d-shop').onclick = () => shop('day');
  $('d-back').onclick = () => toTitle();
  $('m-next').onclick = () => dayCard();
  $('m-shop').onclick = () => shop('sum');
  $('r-ok').onclick = () => afterRank();
  $('sh-done').onclick = () => (shopReturn === 'sum' ? show('sum') : dayCard());
  $('al-back').onclick = () => show('title');
  $('hp-ok').onclick = () => show(helpReturn);
  $('p-resume').onclick = () => resumeGame();
  $('p-help').onclick = () => {
    helpReturn = 'pause';
    help();
  };
  $('p-quit').onclick = () => {
    quiet();
    toTitle();
  };
  for (const b of document.querySelectorAll('.ck-ui button')) b.addEventListener('click', () => sfx.tap());
}

function toTitle() {
  screen = 'title';
  day = null;
  serving = null;
  paused = false;
  translate();
  show('title');
}

function dayCard() {
  screen = 'title';
  const rk = rankOf(save.xp);
  $('d-rank').textContent = t('rankN', { r: rk.rank });
  $('d-title').textContent = t('dayN', { n: save.day });
  const people = planFor(save.day);
  $('d-sub').textContent = t('today', { n: people.length }) + (save.day === 1 ? ` ${t('tutorialOn')}` : '');
  $('d-bar').style.width = `${Math.round(rk.k * 100)}%`;
  $('d-money').textContent = `${t('money')}: ${fmt(save.money)}`;
  show('day');
}

function planFor(n) {
  return planDay({ day: n, rank: rankNow(), people: PEOPLE, lastVisit: save.last, extra: up('cartel'), gap: D.gap || 1, seed: hash(D.id) });
}

let shopReturn = 'day';
function shop(from) {
  shopReturn = from;
  renderShop();
  show('shop');
}
function renderShop() {
  $('sh-money').textContent = `${t('money')}: ${fmt(save.money)}`;
  const list = $('sh-list');
  list.innerHTML = '';
  for (const u of allUps()) {
    const lv = up(u.id);
    const max = u.max || 1;
    const cost = upCost(u, lv);
    const el = document.createElement('div');
    el.className = 'ck-item' + (lv >= max ? ' owned' : '');
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const cg = c.getContext('2d');
    cg.translate(48, 48);
    try {
      u.icon?.(cg, 0, 0, 30);
    } catch {}
    el.appendChild(c);
    const info = document.createElement('div');
    info.className = 'ck-info';
    info.innerHTML = `<b></b><small></small><i></i>`;
    info.querySelector('b').textContent = tt(TXT[u.name] || u.name);
    info.querySelector('small').textContent = tt(TXT[u.desc] || u.desc);
    info.querySelector('i').textContent = max > 1 ? t('lvl', { a: lv, b: max }) : '';
    el.appendChild(info);
    const b = document.createElement('button');
    b.className = 'ck-btn small' + (lv < max && save.money >= cost ? ' main' : '');
    b.textContent = lv >= max ? t('maxed') : `${t('buyB')} ${fmt(cost)}`;
    b.disabled = lv >= max || save.money < cost;
    b.onclick = () => {
      if (buy(save, u)) {
        sfx.cash();
        store();
        renderShop();
      }
    };
    el.appendChild(b);
    list.appendChild(el);
  }
}

function album() {
  const list = $('al-list');
  list.innerHTML = '';
  let met = 0;
  for (const p of PEOPLE) {
    const v = save.visits[p.i] || 0;
    if (v) met++;
    const el = document.createElement('div');
    el.className = 'ck-person' + (v ? '' : ' unknown');
    const c = document.createElement('canvas');
    c.width = c.height = 120;
    const cg = c.getContext('2d');
    if (v) A.head(cg, p, 60, 62, 46, { mood: (save.best[p.i] || 0) >= 90 ? 'love' : 'happy', t: 1 });
    else {
      A.circle(cg, 60, 58, 40);
      cg.fillStyle = 'rgba(0,0,0,.18)';
      cg.fill();
      A.text(cg, '?', 60, 60, 46, { color: 'rgba(255,255,255,.7)', stroke: null });
    }
    el.appendChild(c);
    const n = document.createElement('b');
    n.textContent = v ? p.name : '???';
    el.appendChild(n);
    const s = document.createElement('small');
    s.textContent = v ? t('visits', { v, b: save.best[p.i] || 0 }) : p.unlock > rankNow() ? t('rankN', { r: p.unlock }) : t('notYet');
    el.appendChild(s);
    list.appendChild(el);
  }
  $('al-n').textContent = t('metN', { n: met, m: PEOPLE.length });
  show('album');
}

function help() {
  const list = $('hp-list');
  list.innerHTML = '';
  for (const step of D.help || []) {
    const li = document.createElement('li');
    li.textContent = tt(step);
    list.appendChild(li);
  }
  show('help');
}

// ---------------------------------------------------------------- tamaño
function resize() {
  W = innerWidth;
  H = innerHeight;
  dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const aw = W, ah = Math.max(200, H - TOP);
  portrait = ah > aw * 1.1;
  if (portrait) {
    VW = 720;
    VH = clamp((720 * ah) / aw, 1000, 1520);
  } else {
    VH = 720;
    VW = clamp((720 * aw) / ah, 1100, 1600);
  }
  SC = Math.min(aw / VW, ah / VH);
  OX = (aw - VW * SC) / 2;
  OY = TOP + (ah - VH * SC) / 2;
  if (portrait) {
    RAIL = { x: 0, y: 0, w: VW, h: 150 };
    TABS = { x: 0, y: VH - 112, w: VW, h: 112 };
  } else {
    RAIL = { x: 0, y: 0, w: VW, h: 116 };
    TABS = { x: 0, y: VH - 96, w: VW, h: 96 };
  }
  AREA = { x: 0, y: RAIL.h, w: VW, h: TABS.y - RAIL.h, portrait };
  for (const st of stations()) st.layout?.(ctx, AREA);
}
const stations = () => [ORDER, ...D.stations];

// ---------------------------------------------------------------- el día
function startDay() {
  const plan = planFor(save.day);
  day = {
    n: save.day,
    T: 0,
    plan,
    next: 0,
    customers: [],
    orders: [],
    seq: 1,
    served: [],
    station: 'order',
    active: null,
    tutorial: save.day === 1,
    rank0: rankNow(),
    xp0: save.xp,
    money0: save.money,
    shake: 0,
    hintDone: {},
    alarms: {},
  };
  for (const st of stations()) {
    st.init?.(ctx);
    st.layout?.(ctx, AREA);
  }
  screen = 'day';
  paused = false;
  show('none');
  sfx.bell();
}

function arrive(entry) {
  const p = PEOPLE[entry.p];
  // la espera cuenta desde que entra por la puerta
  const c = { p, x: 0, y: 0, s: 1, state: 'enter', walk: 0, joined: day.T, order: null, seat: -1, slot: null, served: false, bornT: day.T };
  const sp = spots();
  c.x = sp.door.x;
  c.y = sp.door.y;
  c.s = sp.door.s;
  day.customers.push(c);
  sfx.door();
}

/** Toma el pedido del que está en el mostrador. */
function takeOrder(c) {
  const p = c.p;
  const r = rng(hash(`${D.id}:${p.seed}:${save.visits[p.i] || 0}`));
  let fav = save.fav[p.i];
  // los que vuelven piden su favorito; si se abrieron cosas nuevas, a veces se animan a cambiar
  if (!fav || (fav.rank || 0) < rankNow() && r() < 0.35) {
    fav = D.makeOrder(r, ctx, p, fav);
    fav.rank = rankNow();
    save.fav[p.i] = fav;
  }
  const order = { id: day.seq++, p: p.i, person: p, data: JSON.parse(JSON.stringify(fav)), joined: c.joined, taken: day.T, product: null, where: null, customer: c };
  c.order = order;
  c.state = 'ordering';
  c.talkT = 0;
  day.orders.push(order);
  if (!day.active || day.active.product) day.active = order;
  sfx.paper();
}

function serve(product) {
  const order = product.order;
  const waited = day.T - order.joined;
  const target = (D.expected?.(order, ctx) || 60) + 8;
  const patience = 1 + up('sillas') * 0.3;
  const parts = [{ label: TXT.wait, score: Math.round(waitScore(waited, target, patience)) }, ...D.grade(order, product, ctx).map((p) => ({ ...p, score: Math.round(clamp(p.score, 0, 100)) }))];
  const score = total(parts);
  const tip = tipFor(score, D.base?.(order) || 3, 1 + up('frasco') * 0.15);
  serving = { order, product, parts, score, tip, t: 0, mood: mood(score), shown: 0, done: false };
  screen = 'serve';
  quiet();
  sfx.bell();
}

function endServe() {
  const s = serving;
  const o = s.order;
  record(save, o.p, s.score, s.tip);
  day.served.push({ p: o.p, score: s.score, tip: s.tip });
  day.orders = day.orders.filter((x) => x !== o);
  if (day.active === o) day.active = day.orders.find((x) => !x.product) || day.orders[0] || null;
  const c = o.customer;
  c.state = 'leave';
  c.served = true;
  c.face = s.mood;
  c.leaveT = day.T;
  serving = null;
  screen = 'day';
  if (day.served.length >= day.plan.length) setTimeout(() => endDay(), 900);
}

function endDay() {
  if (!day || screen !== 'day') return;
  quiet();
  const served = day.served;
  const avg = Math.round(served.reduce((a, b) => a + b.score, 0) / Math.max(1, served.length));
  const tips = served.reduce((a, b) => a + b.tip, 0);
  const best = served.reduce((a, b) => (b.score > (a?.score ?? -1) ? b : a), null);
  const rk0 = day.rank0;
  save.day++;
  store();
  const rk = rankOf(save.xp);
  $('m-rank').textContent = t('rankN', { r: rk.rank });
  $('m-title').textContent = t('endDay', { n: day.n });
  const stats = $('m-stats');
  stats.innerHTML = '';
  const row = (a, b) => {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><b></b>';
    li.firstChild.textContent = a;
    li.lastChild.textContent = b;
    stats.appendChild(li);
  };
  row(t('served'), String(served.length));
  row(t('avg'), `${avg}%`);
  row(t('tips'), fmt(tips));
  if (best) row(t('best'), `${PEOPLE[best.p].name} · ${best.score}%`);
  row(t('money'), fmt(save.money));
  $('m-bar').style.width = `${Math.round(rk.k * 100)}%`;
  $('m-xp').textContent = `${rk.into} / ${rk.need}`;
  screen = 'over';
  rankedFrom = rk0;
  show('sum');
  if (rk.rank > rk0) setTimeout(() => rankUp(rk0, rk.rank), 700);
  else sfx.ok();
}

let rankedFrom = 1;
function rankUp(a, b) {
  sfx.rank();
  $('r-num').textContent = b;
  $('r-title').textContent = t('rankUp', { r: b });
  const list = $('r-list');
  list.innerHTML = '';
  const news = (D.unlocks || []).filter((u) => u.rank > a && u.rank <= b);
  $('r-new-l').hidden = !news.length;
  for (const u of news) {
    const el = document.createElement('div');
    el.className = 'ck-unlock';
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const cg = c.getContext('2d');
    cg.translate(48, 48);
    try {
      u.icon?.(cg, 0, 0, 30);
    } catch {}
    el.appendChild(c);
    const n = document.createElement('b');
    n.textContent = tt(u.name);
    el.appendChild(n);
    list.appendChild(el);
  }
  const ppl = PEOPLE.filter((p) => p.unlock > a && p.unlock <= b).length;
  $('r-people').textContent = ppl ? `${t('newPeople')} (${ppl})` : '';
  show('rank');
}
function afterRank() {
  show('sum');
}

function pauseGame() {
  if (screen !== 'day' && screen !== 'serve') return;
  paused = true;
  quiet();
  show('pause');
}
function resumeGame() {
  paused = false;
  show('none');
}

function goStation(id) {
  if (!day || day.station === id) return;
  const from = stations().find((s) => s.id === day.station);
  from?.leave?.(ctx);
  day.station = id;
  stations().find((s) => s.id === id)?.enter?.(ctx);
  sfx.tap();
}

// ---------------------------------------------------------------- la estación de pedidos (el salón)
function spots() {
  const a = AREA;
  const floor = a.y + a.h * (portrait ? 0.5 : 0.64);
  if (!portrait) {
    const frontX = a.x + a.w * 0.5;
    const feet = a.y + a.h * 0.93;
    const seats = Math.max(3, Math.floor((a.w * 0.34) / 112));
    return {
      floor,
      counterY: a.y + a.h * 0.78,
      front: { x: frontX, y: feet, s: 1 },
      line: (k) => ({ x: frontX + 150 + k * 92, y: feet - 40 - k * 10, s: 0.9 - k * 0.05 }),
      seats,
      seat: (k) => ({ x: a.x + 80 + (k % seats) * 112 + (k >= seats ? 56 : 0), y: floor + 52 + (k >= seats ? 34 : 0), s: 0.72 }),
      door: { x: a.x + a.w - 90, y: floor + 44, s: 0.72 },
    };
  }
  const frontX = a.x + a.w * 0.42;
  const feet = a.y + a.h * 0.9;
  return {
    floor,
    counterY: a.y + a.h * 0.8,
    front: { x: frontX, y: feet, s: 1.05 },
    line: (k) => ({ x: Math.min(a.x + a.w - 60, frontX + 150 + k * 62), y: feet - 70 - k * 28, s: 0.86 - k * 0.06 }),
    seats: 4,
    seat: (k) => ({ x: a.x + 70 + (k % 4) * 150 + (k >= 4 ? 75 : 0), y: floor + 30 + (k >= 4 ? 30 : 0), s: 0.62 }),
    door: { x: a.x + a.w - 70, y: floor + 30, s: 0.62 },
  };
}

const ORDER = {
  id: 'order',
  get label() {
    return TXT.orders;
  },
  icon: (g, x, y, s) => bellIcon(g, x, y, s),
  init() {},
  layout() {},
  tick(ctx, dt) {
    const sp = spots();
    const cs = day.customers;
    // quién va a la fila: los que entraron y todavía no pidieron
    const line = cs.filter((c) => c.state === 'line' || c.state === 'enter' || c.state === 'ordering');
    line.sort((a, b) => a.bornT - b.bornT);
    day.frontC = line[0] || null;
    line.forEach((c, k) => {
      c.slot = k === 0 ? sp.front : sp.line(k - 1);
    });
    // sentados esperando su pedido
    const waiting = cs.filter((c) => c.state === 'waiting' || c.state === 'toSeat');
    const used = new Set(waiting.map((c) => c.seat).filter((s) => s >= 0));
    for (const c of waiting) {
      if (c.seat < 0) {
        let k = 0;
        while (used.has(k)) k++;
        c.seat = k;
        used.add(k);
      }
      c.slot = sp.seat(c.seat);
    }
    for (const c of cs) {
      if (c.state === 'leave') c.slot = sp.door;
      const tgt = c.slot;
      if (!tgt) continue;
      const dx = tgt.x - c.x, dy = tgt.y - c.y;
      const d = Math.hypot(dx, dy);
      const sp2 = 260 * dt;
      if (d > 2) {
        c.x += (dx / d) * Math.min(d, sp2);
        c.y += (dy / d) * Math.min(d, sp2 * 0.6);
        c.s = lerp(c.s, tgt.s, 1 - Math.exp(-dt * 6));
        c.walk += dt * 6;
        c.moving = true;
      } else {
        c.x = tgt.x;
        c.y = tgt.y;
        c.s = lerp(c.s, tgt.s, 1 - Math.exp(-dt * 6));
        c.moving = false;
        if (c.state === 'enter') c.state = 'line';
        if (c.state === 'toSeat') c.state = 'waiting';
        if (c.state === 'leave') c.state = 'gone';
      }
      if (c.state === 'ordering') {
        c.talkT += dt;
        if (c.talkT > 2.1) {
          c.state = 'toSeat';
          c.order.flying = true;
          fx.push({ k: 'ticket', order: c.order, x: c.x + 110, y: c.y - c.s * 270 - 200, t: 0, life: 0.6 });
        }
      }
      // humor mientras espera
      if (!c.served) {
        const since = c.joined != null ? day.T - c.joined : 0;
        const target = (c.order ? D.expected?.(c.order, ctx) || 60 : 20) + 8;
        const ws = waitScore(since, target, 1 + up('sillas') * 0.3);
        c.face = ws > 85 ? 'happy' : ws > 55 ? 'ok' : ws > 25 ? 'wait' : 'angry';
      }
    }
    day.customers = cs.filter((c) => c.state !== 'gone');
  },
  /** El que está parado en el mostrador (ya llegó y todavía no pidió o está pidiendo). */
  front() {
    const c = day?.frontC;
    return c && (c.state === 'line' || c.state === 'ordering') && !c.moving ? c : null;
  },
  draw(ctx, g) {
    const a = AREA;
    const sp = spots();
    A.salon(g, D.theme, a.x, a.y, a.w, a.h, now, portrait);
    // sillas del fondo
    const nSeats = Math.max(sp.seats, ...day.customers.map((c) => c.seat + 1));
    for (let k = 0; k < nSeats; k++) {
      const s = sp.seat(k);
      A.chair(g, D.theme, s.x, s.y, s.s);
    }
    if (!portrait) A.plant(g, a.x + a.w * 0.42, sp.floor + 46, 0.75, now);
    const order = [...day.customers].sort((p, q) => p.y - q.y);
    for (const c of order) drawCustomer(g, c);
    // mostrador
    const cy = sp.counterY;
    A.counter(g, D.theme, a.x + (portrait ? 10 : a.w * 0.3), cy, a.w * (portrait ? 1 : 0.7) - (portrait ? 20 : 0), a.y + a.h - cy + 4);
    // caja registradora, timbre y frasco
    const rx = portrait ? a.x + a.w - 120 : a.x + a.w - 170;
    register(g, rx, cy + 6, 1);
    jar(g, rx - 120, cy + 4, 46, Math.min(1, save.money / 200));
    // tomar pedido
    const f = ORDER.front();
    const bw = portrait ? 300 : 280;
    const bx = sp.front.x - bw / 2;
    const by = cy + (portrait ? 40 : 30);
    if (f && f.state === 'line') {
      const pulse = G.prefs.reducedMotion ? 0 : Math.sin(now * 5) * 3;
      ctx.btn('take', bx, by - pulse, bw, 72, t('take'), { fill: D.theme.accent, size: 30, icon: (g, x, y, s) => A.paper(g, x - s * 0.6, y - s * 0.8, s * 1.2, s * 1.6, { lw: 2.5 }) }, () => {
        takeOrder(f);
      });
    }
    // lo que dice el que está pidiendo
    const talker = day.customers.find((c) => c.state === 'ordering');
    if (talker) {
      const k = clamp(talker.talkT / 0.35, 0, 1);
      const s = 0.62 * k * (portrait ? 0.9 : 1);
      const tx = talker.x + (portrait ? 70 : 110);
      const ty = talker.y - talker.s * 270 - 330 * s * 0.6;
      bubble(g, tx - 20, ty - 20, 220 * s + 40, 330 * s + 40, talker.x + 30, talker.y - talker.s * 230);
      drawTicket(g, talker.order, tx, ty, s, { reveal: clamp((talker.talkT - 0.3) / 1.4, 0, 1) });
    }
  },
  down() {},
  move() {},
  up() {},
  badge() {
    const f = ORDER.front();
    const n = day.customers.filter((c) => c.state === 'line' || c.state === 'enter').length;
    return n ? { n, alert: !!(f && f.state === 'line') } : null;
  },
  hint() {
    const f = ORDER.front();
    if (f && f.state === 'line') {
      const sp = spots();
      const bw = portrait ? 300 : 280;
      return { text: t('hiAt', { name: f.p.name }), x: sp.front.x + bw / 2 + 6, y: sp.counterY + (portrait ? 40 : 30) + 36, side: 'right' };
    }
    if (day.orders.some((o) => !o.product)) {
      const st = D.stations[0];
      return { text: t('goTo', { st: tt(st.label) }), tab: 1 };
    }
    return null;
  },
};

function drawCustomer(g, c) {
  const st = { mood: c.state === 'ordering' ? 'happy' : c.face || 'ok', t: now, talk: c.state === 'ordering' && c.talkT < 1.9, walk: c.moving ? c.walk : null, arms: c.state === 'ordering' ? 'wave' : c.served ? (c.face === 'love' ? 'cheer' : 'down') : 'down', sit: c.state === 'waiting' };
  if (c.state === 'waiting') {
    // sentado: se dibuja más bajo para que la silla lo tape
    A.person(g, c.p, c.x, c.y + 6 * c.s, c.s, { ...st, walk: null });
  } else A.person(g, c.p, c.x, c.y, c.s, st);
  // número de comanda sobre la cabeza de los que esperan
  if (c.order && (c.state === 'waiting' || c.state === 'toSeat')) {
    const hx = c.x, hy = c.y - c.s * 268;
    A.rr(g, hx - 24, hy - 18, 48, 30, 10);
    A.fillStroke(g, '#fffdf4', 2.5);
    A.text(g, `#${c.order.id}`, hx, hy - 3, 20, { color: A.INK, stroke: null });
  }
}

function bubble(g, x, y, w, h, px, py) {
  A.rr(g, x, y, w, h, 22);
  A.fillStroke(g, '#ffffff', 3.5);
  g.beginPath();
  g.moveTo(x + 24, y + h - 3);
  g.lineTo(px, py);
  g.lineTo(x + 70, y + h - 3);
  g.fillStyle = '#fff';
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = A.INK;
  g.beginPath();
  g.moveTo(x + 24, y + h);
  g.lineTo(px, py);
  g.lineTo(x + 70, y + h);
  g.stroke();
}

// ---------------------------------------------------------------- comandas
const TW = 220, TH = 330;
function drawTicket(g, order, x, y, s = 1, opts = {}) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  if (opts.lift) {
    g.translate(0, -opts.lift);
  }
  g.save();
  g.translate(4, 6);
  A.paper(g, 0, 0, TW, TH, { color: 'rgba(0,0,0,.18)', lw: 0 });
  g.restore();
  A.paper(g, 0, 0, TW, TH, { color: opts.color || '#fffdf4', lw: opts.active ? 5 : 3 });
  if (opts.active) {
    g.lineWidth = 3;
    g.strokeStyle = D.theme.accent;
    A.rr(g, 6, 6, TW - 12, TH - 18, 8);
    g.stroke();
  }
  // encabezado: cabeza, nombre y número
  A.head(g, order.person, 34, 34, 24, { mood: 'happy', t: 1 });
  A.text(g, order.person.name, 128, 26, 24, { color: A.INK, stroke: null, max: 120 });
  A.text(g, `#${order.id}`, 128, 50, 18, { color: '#9a7a66', stroke: null });
  g.fillStyle = '#e8dccb';
  g.fillRect(12, 66, TW - 24, 3);
  const reveal = opts.reveal ?? 1;
  if (reveal > 0) {
    g.save();
    g.beginPath();
    g.rect(0, 70, TW, (TH - 70) * reveal);
    g.clip();
    g.translate(0, 72);
    D.drawTicket(g, order, TW, TH - 82);
    g.restore();
  }
  g.restore();
}

function drawRail(g) {
  const r = RAIL;
  // barra de metal
  g.fillStyle = D.theme.railBg || 'rgba(0,0,0,.18)';
  g.fillRect(r.x, r.y, r.w, r.h);
  const ry = r.y + 16;
  const rightW = portrait ? 230 : 300;
  A.rr(g, r.x + 10, ry - 6, r.w - rightW - 20, 12, 6);
  A.fillStroke(g, '#c9ced6', 3);
  // comandas (chiquitas)
  const os = day.orders.filter((o) => o.customer.state !== 'ordering' && !o.flying);
  const s = portrait ? 0.36 : 0.32;
  const tw = TW * s;
  const room = r.w - rightW - 40;
  const step = Math.min(tw + 10, os.length > 1 ? (room - tw) / (os.length - 1) : tw);
  os.forEach((o, i) => {
    const x = r.x + 20 + i * step;
    const act = o === day.active;
    const lift = act ? -8 : 0;
    drawMiniTicket(g, o, x, ry + 4 - lift, s, act);
    btns.push({ id: `tk${o.id}`, x, y: ry, w: Math.min(step, tw), h: TH * s, on: true, onClick: () => ctx.select(o) });
    // broche
    A.rr(g, x + tw / 2 - 10, ry - 4 - lift, 20, 14, 4);
    A.fillStroke(g, '#8a929e', 2.5);
  });
  // reloj, día y plata
  const px = r.x + r.w - rightW;
  A.rr(g, px, r.y + 8, rightW - 10, r.h - 16, 16);
  A.fillStroke(g, '#fffdf4', 3);
  const clk = clock(day.T * (D.clockRate || 1));
  const rowA = r.y + 36, rowB = r.y + (portrait ? 76 : 80), rowC = r.y + 112;
  A.text(g, clk, px + 18, rowA, 30, { color: A.INK, stroke: null, align: 'left' });
  A.text(g, t('dayN', { n: day.n }), px + 112, rowA + 2, 19, { color: '#9a7a66', stroke: null, align: 'left', max: rightW - 200 });
  A.coin(g, px + 30, rowB, 13);
  A.text(g, fmt(save.money), px + 52, rowB, 23, { color: A.INK, stroke: null, align: 'left', max: rightW - 130 });
  if (portrait) {
    const served = day.served.length, tot = day.plan.length;
    A.text(g, `${served}/${tot}`, px + 18, rowC, 18, { color: '#9a7a66', stroke: null, align: 'left' });
  }
  // pausa
  const bx = r.x + r.w - 64, by = r.y + 20;
  ctx.btn('pause', bx, by, 48, 48, '', { fill: '#ffe9b8', r: 14 }, () => pauseGame());
  g.fillStyle = A.INK;
  const pd = ptr.down && ptr.btn === 'pause' ? 4 : 0;
  g.fillRect(bx + 16, by + 13 + pd, 6, 22);
  g.fillRect(bx + 27, by + 13 + pd, 6, 22);
}

function drawMiniTicket(g, o, x, y, s, act) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  A.paper(g, 0, 0, TW, TH, { color: act ? '#fff6d8' : '#fffdf4', lw: act ? 7 : 4 });
  A.head(g, o.person, TW / 2, 86, 62, { mood: o.customer.face || 'ok', t: now });
  A.text(g, `#${o.id}`, TW / 2, 196, 48, { color: A.INK, stroke: null });
  A.text(g, o.person.name, TW / 2, 248, 40, { color: '#7a5a46', stroke: null, max: TW - 20 });
  // dónde está el producto
  if (o.product && o.where) {
    const st = D.stations.find((s) => s.id === o.where);
    if (st) {
      A.circle(g, TW - 34, 34, 30);
      A.fillStroke(g, D.theme.accent, 4);
      st.icon(g, TW - 34, 34, 18);
    }
  }
  g.restore();
}

function drawTabs(g) {
  const r = TABS;
  g.fillStyle = D.theme.tabsBg || 'rgba(0,0,0,.22)';
  g.fillRect(r.x, r.y, r.w, r.h);
  const list = stations();
  const n = list.length;
  const gap = 12;
  const bw = Math.min(portrait ? 168 : 240, (r.w - gap * (n + 1)) / n);
  const bh = r.h - (portrait ? 34 : 26);
  const x0 = r.x + (r.w - (bw * n + gap * (n - 1))) / 2;
  list.forEach((st, i) => {
    const x = x0 + i * (bw + gap);
    const y = r.y + (portrait ? 12 : 10);
    const cur = day.station === st.id;
    ctx.btn(`tab-${st.id}`, x, y, bw, bh, portrait ? '' : tt(st.label), { fill: cur ? D.theme.accent : '#fff3dc', size: 24, r: 16, icon: portrait ? null : (g, ix, iy, s) => st.icon(g, ix, iy, s * 0.95) }, () => goStation(st.id));
    if (portrait) {
      st.icon(g, x + bw / 2, y + bh * 0.42, bh * 0.26);
      A.text(g, tt(st.label), x + bw / 2, y + bh * 0.82, 17, { color: A.INK, stroke: null, max: bw - 10 });
    }
    const b = st.badge?.(ctx);
    if (b && (b.n || b.alert)) {
      const blink = b.alert && !G.prefs.reducedMotion ? 0.75 + 0.25 * Math.sin(now * 10) : 1;
      g.save();
      g.globalAlpha = blink;
      A.circle(g, x + bw - 6, y + 4, 17);
      A.fillStroke(g, b.alert ? '#ff4f5e' : '#ffffff', 3);
      A.text(g, b.alert && !b.n ? '!' : String(b.n), x + bw - 6, y + 5, 20, { color: b.alert ? '#fff' : A.INK, stroke: null });
      g.restore();
    }
  });
}

function drawHint(g) {
  if (!day.tutorial || serving) return;
  const st = stations().find((s) => s.id === day.station);
  let h = st?.hint?.(ctx);
  if (!h && day.station !== 'order') {
    const f = ORDER.front();
    if (f && f.state === 'line') h = { text: t('hiAt', { name: f.p.name }), tab: 0 };
  }
  if (!h) return;
  const list = stations();
  let ax = h.x, ay = h.y;
  if (h.tab != null) {
    const n = list.length;
    const gap = 12;
    const bw = Math.min(portrait ? 168 : 240, (TABS.w - gap * (n + 1)) / n);
    const x0 = TABS.x + (TABS.w - (bw * n + gap * (n - 1))) / 2;
    ax = x0 + h.tab * (bw + gap) + bw / 2;
    ay = TABS.y + 8;
  }
  g.font = `600 22px ${A.FONT}`;
  const maxW = Math.min(AREA.w - 60, 560);
  const lines = wrap(g, h.text, maxW - 40);
  const bh = 26 * lines.length + 30;
  const bw = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width)) + 44);
  let bx = clamp((ax ?? AREA.x + AREA.w / 2) - bw / 2, AREA.x + 16, AREA.x + AREA.w - bw - 16);
  let by = h.top ? AREA.y + 14 : ay != null && ay < AREA.y + AREA.h * 0.45 ? ay + 40 : (ay ?? AREA.y + AREA.h) - bh - 60;
  // al costado del objetivo (para no tapar lo que hay arriba)
  const side = h.side && ax != null ? (h.side === 'right' && ax + 60 + bw < AREA.x + AREA.w ? 1 : -1) : 0;
  if (side) {
    bx = side > 0 ? ax + 60 : ax - 60 - bw;
    by = ay - bh / 2;
  }
  by = clamp(by, AREA.y + 8, AREA.y + AREA.h - bh - 8);
  const bob = G.prefs.reducedMotion ? 0 : Math.sin(now * 3) * 4;
  A.rr(g, bx, by + bob, bw, bh, 18);
  A.fillStroke(g, '#2b1d16', 0);
  g.globalAlpha = 0.92;
  g.fill();
  g.globalAlpha = 1;
  lines.forEach((l, i) => A.text(g, l, bx + bw / 2, by + bob + 28 + i * 26, 22, { color: '#fff', stroke: null, weight: 600 }));
  if (side) {
    const fx = side > 0 ? bx : bx + bw, tipX = ax + side * 10;
    const yy = by + bob + bh / 2;
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(fx, yy);
    g.lineTo(tipX, ay);
    g.moveTo(tipX + side * 14, ay - 12);
    g.lineTo(tipX, ay);
    g.lineTo(tipX + side * 14, ay + 12);
    g.stroke();
  } else if (ax != null && ay != null) {
    // flecha
    const fromY = by + bob + (ay > by ? bh : 0);
    const dir = ay > by ? 1 : -1;
    const tipY = ay - dir * 14 + bob * dir;
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(clamp(ax, bx + 20, bx + bw - 20), fromY);
    g.lineTo(ax, tipY);
    g.stroke();
    g.beginPath();
    g.moveTo(ax - 12, tipY - dir * 14);
    g.lineTo(ax, tipY);
    g.lineTo(ax + 12, tipY - dir * 14);
    g.stroke();
  }
}

export function wrap(g, s, maxW) {
  const words = s.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- entrega
function drawServe(g, dt) {
  const s = serving;
  s.t += dt;
  g.fillStyle = 'rgba(25,15,10,.62)';
  g.fillRect(0, 0, VW, VH);
  const cw = portrait ? VW - 40 : Math.min(VW - 80, 1060);
  const ch = portrait ? VH - 80 : VH - 70;
  const cx = (VW - cw) / 2, cy = (VH - ch) / 2;
  const k = G.prefs.reducedMotion ? 1 : clamp(s.t / 0.3, 0, 1);
  g.save();
  g.translate(VW / 2, VH / 2);
  g.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k);
  g.translate(-VW / 2, -VH / 2);
  g.globalAlpha = k;
  A.rr(g, cx, cy, cw, ch, 28);
  A.fillStroke(g, D.theme.card || '#fff6e6', 4);
  // cliente y producto
  const order = s.order;
  const showMood = s.t > 0.9 + s.parts.length * 0.45 ? s.mood : 'ok';
  let px, py, ps, prodX, prodY, prodS, tx, ty, ts;
  if (portrait) {
    px = cx + cw * 0.3;
    py = cy + ch * 0.42;
    ps = 1.0;
    prodX = cx + cw * 0.72;
    prodY = cy + ch * 0.3;
    prodS = 150;
    tx = cx + 30;
    ty = cy + ch * 0.47;
    ts = 1;
  } else {
    px = cx + cw * 0.15;
    py = cy + ch - 34;
    ps = 1.3;
    prodX = cx + cw * 0.36;
    prodY = cy + ch * 0.64;
    prodS = Math.min(108, cw * 0.1);
    tx = cx + cw * 0.52;
    ty = cy + 40;
    ts = 1;
  }
  const arms = showMood === 'love' ? 'cheer' : showMood === 'happy' ? 'wave' : 'down';
  A.person(g, order.person, px, py, ps, { mood: showMood, t: now, arms, talk: false });
  // el producto sobre una bandeja
  A.ellipse(g, prodX, prodY + prodS * 1.08, prodS * 1.35, prodS * 0.3);
  A.fillStroke(g, D.theme.counterTop, 3.5);
  D.drawProduct(g, s.product, prodX, prodY, prodS);
  // reacción
  if (showMood !== 'ok' || s.t > 0.9 + s.parts.length * 0.45) {
    const say = s.score >= 100 ? t('perfect') : t(s.mood);
    const bx = portrait ? cx + 24 : px - 150, by = portrait ? cy + 24 : cy + 26;
    A.rr(g, bx, by, 300, 64, 22);
    A.fillStroke(g, '#ffffff', 3.5);
    A.text(g, say, bx + 150, by + 33, 28, { color: A.INK, stroke: null, max: 280 });
    if (s.mood === 'love') for (let i = 0; i < 3; i++) A.heart(g, bx + 30 + i * 120 + Math.sin(now * 3 + i) * 6, by - 8 + Math.cos(now * 4 + i) * 4, 12);
  }
  // planilla de puntajes
  const rowsW = portrait ? cw - 60 : cw * 0.45;
  const rowH = portrait ? 62 : 58;
  A.rr(g, tx, ty, rowsW, rowH * (s.parts.length + 1) + 150, 18);
  A.fillStroke(g, '#fffdf4', 3);
  A.text(g, `${order.person.name} · #${order.id}`, tx + rowsW / 2, ty + 30, 28, { color: A.INK, stroke: null, max: rowsW - 30 });
  s.parts.forEach((p, i) => {
    const appear = clamp((s.t - 0.4 - i * 0.45) / 0.45, 0, 1);
    if (appear <= 0) return;
    if (appear > 0 && !p.dinged) {
      p.dinged = true;
      sfx.coin(i);
    }
    const y = ty + 66 + i * rowH;
    A.text(g, tt(p.label), tx + 20, y + rowH / 2, 24, { color: A.INK, stroke: null, align: 'left', max: rowsW * 0.36 });
    const bx = tx + rowsW * 0.4, bw = rowsW * 0.42;
    A.rr(g, bx, y + 14, bw, rowH - 28, 10);
    A.fillStroke(g, '#ece2d2', 2.5);
    const v = p.score * appear;
    if (v > 0) {
      A.rr(g, bx, y + 14, Math.max(16, (bw * v) / 100), rowH - 28, 10);
      A.fillStroke(g, scoreColor(p.score), 2.5);
    }
    A.text(g, `${Math.round(v)}%`, tx + rowsW - 18, y + rowH / 2, 24, { color: A.INK, stroke: null, align: 'right' });
  });
  const tA = clamp((s.t - 0.6 - s.parts.length * 0.45) / 0.5, 0, 1);
  if (tA > 0) {
    const y = ty + 66 + s.parts.length * rowH + 10;
    A.text(g, t('totalL'), tx + 20, y + 30, 30, { color: A.INK, stroke: null, align: 'left' });
    A.text(g, `${Math.round(s.score * tA)}%`, tx + rowsW - 18, y + 30, 44, { color: scoreColor(s.score), stroke: A.INK, lw: 6, align: 'right' });
    A.coin(g, tx + 36, y + 92, 18);
    A.text(g, `${t('tip')}: ${fmt(s.tip * tA)}`, tx + 64, y + 92, 28, { color: A.INK, stroke: null, align: 'left' });
    if (tA >= 1 && !s.cashed) {
      s.cashed = true;
      if (s.score >= 90) sfx.yay();
      else if (s.score >= 60) sfx.ok();
      else sfx.meh();
      if (s.tip > 0) setTimeout(() => sfx.cash(), 250);
      if (s.score >= 100 && !G.prefs.reducedMotion) for (let i = 0; i < 40; i++) fx.push({ k: 'conf', x: VW / 2, y: VH * 0.4, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 500, c: ['#ff4f5e', '#ffd23f', '#3d7fe0', '#5cbf4f', '#e45d9b'][i % 5], t: 0, life: 1.8 });
    }
  }
  g.restore();
  if (s.t > 0.9 + s.parts.length * 0.45) {
    const bw = 260, bh = 70;
    const bx = portrait ? cx + cw / 2 - bw / 2 : tx + rowsW - bw, by = cy + ch - bh - 26;
    ctx.btn('serve-next', bx, by, bw, bh, t('next'), { fill: D.theme.accent, size: 30 }, () => endServe());
  }
}

const scoreColor = (v) => (v >= 90 ? '#5cbf4f' : v >= 70 ? '#b6d334' : v >= 50 ? '#ffbe2e' : '#ff6b4a');

// ---------------------------------------------------------------- iconos comunes
export function bellIcon(g, x, y, s) {
  g.beginPath();
  g.moveTo(x - s, y + s * 0.55);
  g.quadraticCurveTo(x - s, y - s * 0.8, x, y - s * 0.8);
  g.quadraticCurveTo(x + s, y - s * 0.8, x + s, y + s * 0.55);
  g.closePath();
  A.fillStroke(g, '#ffd23f', Math.max(2, s * 0.14));
  A.rr(g, x - s * 1.25, y + s * 0.5, s * 2.5, s * 0.36, s * 0.15);
  A.fillStroke(g, '#c9ced6', Math.max(2, s * 0.14));
  A.circle(g, x, y - s * 0.95, s * 0.18);
  A.fillStroke(g, '#ffd23f', Math.max(1.5, s * 0.1));
}
function signIcon(g, x, y, s) {
  g.beginPath();
  g.moveTo(x - s, y + s);
  g.lineTo(x - s * 0.5, y - s);
  g.lineTo(x + s * 0.5, y - s);
  g.lineTo(x + s, y + s);
  g.lineWidth = s * 0.16;
  g.strokeStyle = A.INK;
  g.stroke();
  A.rr(g, x - s * 0.8, y - s * 0.75, s * 1.6, s * 1.05, s * 0.15);
  A.fillStroke(g, D.theme.accent, s * 0.12);
  A.text(g, '!', x, y - s * 0.2, s * 0.9, { color: A.INK, stroke: null });
}
function jar(g, x, y, s, fill = 0.5) {
  A.rr(g, x - s * 0.62, y - s * 1.0, s * 1.24, s * 1.3, s * 0.25);
  g.fillStyle = 'rgba(200,235,255,.5)';
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = '#ffcf33';
  g.fillRect(x - s, y + s * 0.3 - s * 1.2 * fill, s * 2, s * 1.2 * fill);
  g.restore();
  A.rr(g, x - s * 0.62, y - s * 1.0, s * 1.24, s * 1.3, s * 0.25);
  g.lineWidth = Math.max(2, s * 0.08);
  g.strokeStyle = A.INK;
  g.stroke();
  A.rr(g, x - s * 0.5, y - s * 1.12, s, s * 0.2, s * 0.08);
  A.fillStroke(g, '#c9ced6', Math.max(2, s * 0.07));
  A.text(g, '$', x, y - s * 0.35, s * 0.6, { color: '#d79a12', stroke: null });
}
function register(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  A.rr(g, -70, -70, 140, 70, 12);
  A.fillStroke(g, '#5b6b7d', 3.5);
  A.rr(g, -52, -110, 104, 46, 10);
  A.fillStroke(g, '#3f4b58', 3.5);
  A.rr(g, -42, -102, 84, 28, 6);
  A.fillStroke(g, '#9fe39b', 2.5);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    A.rr(g, -52 + i * 36, -56 + j * 24, 28, 16, 4);
    A.fillStroke(g, '#e8edf2', 2);
  }
  g.restore();
}

// ---------------------------------------------------------------- entrada
function toStage(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left - OX) / SC, y: (e.clientY - r.top - OY) / SC };
}
function hitBtn(p) {
  for (let i = lastBtns.length - 1; i >= 0; i--) {
    const b = lastBtns[i];
    if (b.on && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
  }
  return null;
}
function curStation() {
  return stations().find((s) => s.id === day?.station);
}
function bindInput() {
  cv.addEventListener('pointerdown', (e) => {
    if (overlay !== 'none' || !day) return;
    cv.setPointerCapture?.(e.pointerId);
    const p = toStage(e);
    Object.assign(ptr, p, { down: true, id: e.pointerId });
    const b = hitBtn(p);
    ptr.btn = b ? b.id : null;
    if (b) return;
    if (screen === 'day' && !paused) curStation()?.down?.(ctx, p);
  });
  cv.addEventListener('pointermove', (e) => {
    const p = toStage(e);
    ptr.x = p.x;
    ptr.y = p.y;
    if (overlay !== 'none' || !day) return;
    if (ptr.down && ptr.id !== e.pointerId) return;
    if (ptr.down && ptr.btn) return;
    if (screen === 'day' && !paused) curStation()?.move?.(ctx, p);
  });
  const end = (e) => {
    if (!ptr.down || ptr.id !== e.pointerId) return;
    const p = toStage(e);
    ptr.down = false;
    const id = ptr.btn;
    ptr.btn = null;
    if (id) {
      const b = hitBtn(p);
      if (b && b.id === id) {
        sfx.tap();
        b.onClick?.();
      }
      return;
    }
    if (overlay !== 'none' || !day) return;
    if (screen === 'day' && !paused) curStation()?.up?.(ctx, p);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (overlay === 'pause') resumeGame();
      else if (screen === 'day') pauseGame();
      return;
    }
    if (!day || overlay !== 'none') {
      if ((e.code === 'Enter' || e.code === 'Space') && overlay !== 'none') {
        const main = document.querySelector('.ck-scr.on .ck-btn.main');
        if (main && !main.disabled) {
          e.preventDefault();
          main.click();
        }
      }
      return;
    }
    if (screen === 'serve') {
      if ((e.code === 'Enter' || e.code === 'Space') && serving.t > 0.9 + serving.parts.length * 0.45) endServe();
      return;
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= stations().length) {
      goStation(stations()[n - 1].id);
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      const list = stations();
      const i = list.findIndex((s) => s.id === day.station);
      goStation(list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length].id);
      return;
    }
    if (day.station === 'order' && (e.code === 'Space' || e.code === 'Enter')) {
      const f = ORDER.front();
      if (f && f.state === 'line') takeOrder(f);
      return;
    }
    curStation()?.key?.(ctx, e);
  });
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(tNow) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (tNow - last) / 1000);
  last = tNow;
  now += dt;
  const running = screen === 'day' && !paused && !portalPaused && overlay === 'none';
  if (running) simulate(dt);
  render(dt, running ? dt : 0, screen === 'serve' && !portalPaused && !paused ? dt : 0);
}

function simulate(dt) {
  day.T += dt;
  // llegadas
  while (day.next < day.plan.length && day.plan[day.next].at <= day.T) arrive(day.plan[day.next++]);
  for (const st of stations()) st.tick?.(ctx, dt);
}

function render(real, dt, serveDt) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = D.theme.bg;
  g.fillRect(0, 0, W, H);
  btns = [];
  const sh = day?.shake ? (Math.random() - 0.5) * day.shake : 0;
  if (day) day.shake = Math.max(0, day.shake - dt * 30);
  g.setTransform(dpr * SC, 0, 0, dpr * SC, dpr * (OX + sh), dpr * OY);
  if (screen === 'title' || !day) {
    drawTitleScene(g, real);
  } else {
    g.save();
    g.beginPath();
    g.rect(0, AREA.y, VW, AREA.h);
    g.clip();
    curStation().draw(ctx, g);
    g.restore();
    drawRail(g);
    drawTabs(g);
    drawHint(g);
    drawFx(g, dt || serveDt);
    if (screen === 'serve' && serving) {
      btns = []; // durante la entrega solo vale su botón
      drawServe(g, serveDt);
    }
  }
  lastBtns = btns;
}

function drawFx(g, dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    if (f.t >= f.life) {
      if (f.k === 'ticket') f.order.flying = false;
      fx.splice(i, 1);
      continue;
    }
    const k = f.t / f.life;
    if (f.k === 'text') {
      g.globalAlpha = 1 - k * k;
      A.text(g, f.s, f.x, f.y - k * 50, f.size, { color: f.color });
      g.globalAlpha = 1;
    } else if (f.k === 'coin' || f.k === 'conf') {
      f.vy += 900 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      g.globalAlpha = 1 - k;
      if (f.k === 'coin') A.coin(g, f.x, f.y, 12);
      else {
        g.fillStyle = f.c;
        g.save();
        g.translate(f.x, f.y);
        g.rotate(f.t * 8 + i);
        g.fillRect(-6, -3, 12, 6);
        g.restore();
      }
      g.globalAlpha = 1;
    } else if (f.k === 'ticket') {
      // la comanda vuela al riel
      const tx = RAIL.x + 20 + Math.max(0, day.orders.indexOf(f.order)) * 80, ty = RAIL.y + 20;
      const x = lerp(f.x, tx, k), y = lerp(f.y, ty, k) - Math.sin(k * Math.PI) * 60;
      drawTicket(g, f.order, x, y, lerp(0.6, 0.32, k));
    }
  }
}

function drawTitleScene(g, dt) {
  // el salón con algunos vecinos que pasan
  const a = { x: 0, y: 0, w: VW, h: VH };
  A.salon(g, D.theme, 0, 0, VW, VH, now, portrait);
  if (!titleCrowd) {
    const r = rng(7);
    titleCrowd = Array.from({ length: portrait ? 3 : 5 }, (_, i) => ({ p: PEOPLE[(i * 7 + 3) % PEOPLE.length], x: r() * VW, dir: r() < 0.5 ? -1 : 1, v: 40 + r() * 50, walk: r() * 6, wait: 0 }));
  }
  const floor = VH * (portrait ? 0.5 : 0.64);
  for (const c of titleCrowd) {
    c.x += c.dir * c.v * dt;
    c.walk += dt * 5;
    if (c.x < -100) c.dir = 1;
    if (c.x > VW + 100) c.dir = -1;
    A.person(g, c.p, c.x, floor + 120 + (c.p.i % 3) * 30, 0.9, { mood: 'happy', t: now, walk: c.walk });
  }
  A.counter(g, D.theme, 20, VH * 0.82, VW - 40, VH * 0.2);
  titleDemo ||= D.demoProduct?.();
  if (titleDemo) D.drawProduct(g, titleDemo, VW / 2, VH * 0.8, portrait ? 150 : 130);
  void a;
}
let titleDemo = null;

// ---------------------------------------------------------------- arranque
export function run(def) {
  D = def;
  load();
  document.body.classList.add('ck');
  document.body.insertAdjacentHTML('afterbegin', HTML());
  for (const [k, v] of Object.entries(def.css || {})) document.documentElement.style.setProperty(`--ck-${k}`, v);
  cv = $('c');
  g = cv.getContext('2d');
  bindDom();
  bindInput();
  addEventListener('resize', resize);
  resize();
  G.onPrefs(() => {
    translate();
    if (overlay === 'shop') renderShop();
  }, true);
  G.onPause(() => {
    portalPaused = true;
    quiet();
  });
  G.onResume(() => {
    portalPaused = false;
    last = performance.now();
  });
  document.addEventListener('visibilitychange', () => document.hidden && quiet());
  show('title');
  requestAnimationFrame(frame);
  const ready = () => G.ready();
  if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(ready);
  else ready();
  // para pruebas automáticas y depuración
  window.__cocina = {
    ctx,
    get day() {
      return day;
    },
    get save() {
      return save;
    },
    get serving() {
      return serving;
    },
    startDay,
    endServe,
    endDay,
    goStation,
    takeOrder: () => {
      const f = ORDER.front();
      if (f && f.state === 'line') takeOrder(f);
    },
    get front() {
      return ORDER.front();
    },
    station: (id) => stations().find((s) => s.id === id),
    toScreen: (x, y) => [OX + x * SC, OY + y * SC],
  };
  return ctx;
}

export { A, TXT, TW, TH };
