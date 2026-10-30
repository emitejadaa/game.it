/* Hamburguesería — game.it
 * Atender una hamburguesería: tomar el pedido, cocinar los medallones en la parrilla dándolos vuelta en el momento
 * justo (jugosa, a punto o bien cocida, los dos lados) y armar la hamburguesa soltando cada cosa en el orden de la
 * comanda y bien centrada. El local (clientes, comandas, entrega y tienda) es el armazón de /shared/cocina/.
 */
import { run, A } from '/shared/cocina/shell.js';
import { clamp } from '/shared/cocina/core.js';
import * as R from './shared/rules.js';
import * as B from './art.js';

const G = window.GameIt;
const { INK } = A;

const TXT = {
  pickTicket: { es: 'Tocá una comanda de arriba para elegir qué hamburguesa armar.', en: 'Tap a ticket up top to choose which burger to build.' },
  waitOrder: { es: 'Esperá a que alguien pida.', en: 'Wait for someone to order.' },
  hasBurger: { es: 'Esa comanda ya tiene su hamburguesa en marcha.', en: 'That ticket already has its burger going.' },
  hRaw: { es: 'Tocá la carne cruda para ponerla en la parrilla.', en: 'Tap the raw patties to put one on the grill.' },
  hFlip: { es: 'Ese lado ya está: tocá la carne para darla vuelta.', en: 'That side is done: tap the patty to flip it.' },
  hOff: { es: '¡Lista! Arrastrala a la bandeja.', en: 'Done! Drag it to the tray.' },
  hWait: { es: 'Esperá a que la barra llegue a la marca verde.', en: 'Wait for the bar to reach the green mark.' },
  hBun: { es: 'Tocá el pan de abajo para empezar.', en: 'Tap the bottom bun to start.' },
  hItem: { es: 'Arrastrá {name} arriba de la hamburguesa, bien al centro.', en: 'Drag {name} over the burger, right in the middle.' },
  hNeedMeat: { es: 'Falta carne cocida: andá a la Parrilla.', en: 'You need cooked patties: go to the Grill.' },
  hTop: { es: 'Terminá con el pan de arriba.', en: 'Finish with the top bun.' },
  hServe: { es: '¡Armada! Tocá «Entregar».', en: 'Built! Tap "Serve".' },
  raw: { es: 'Carne cruda', en: 'Raw patties' },
  tray: { es: 'Bandeja', en: 'Tray' },
  trayHint: { es: 'Arrastrá acá las que estén listas', en: 'Drag the done ones here' },
  full: { es: 'No hay lugar en la parrilla.', en: 'No room on the grill.' },
  serveB: { es: 'Entregar', en: 'Serve' },
  trash: { es: 'Tirar', en: 'Toss' },
  burnt: { es: '¡Se quema!', en: 'Burning!' },
  meat: { es: 'Carne', en: 'Patty' },
  noMeat: { es: 'Sin carne cocida', en: 'No cooked patties' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]);
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const name = (id) => G.t(R.byId[id].name);
const inRect = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Medallones cocidos que esperan para armar (los comparten la parrilla y el armado). */
let pool = [];

function cell(g, b, active) {
  A.rr(g, b.x, b.y + 5, b.w, b.h, 14);
  g.fillStyle = INK;
  g.fill();
  A.rr(g, b.x, b.y, b.w, b.h, 14);
  A.fillStroke(g, active ? '#ffe27a' : '#fff6e6', 3);
}
function grid(ids, x, y, w, cols, ch, gap = 10) {
  const cw = (w - gap * (cols - 1)) / cols;
  return ids.map((id, i) => ({ id, x: x + (i % cols) * (cw + gap), y: y + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
}
function diner(g, a) {
  g.fillStyle = '#fdf1dc';
  g.fillRect(a.x, a.y, a.w, a.h);
  g.fillStyle = '#f5e0bd';
  for (let y = a.y; y < a.y + a.h; y += 44) for (let x = a.x + (((y - a.y) / 44) % 2) * 22; x < a.x + a.w; x += 44) g.fillRect(x + 2, y + 2, 40, 40);
}
function steel(g, x, y, w, h) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#d9dee4');
  gr.addColorStop(1, '#aeb6c0');
  A.rr(g, x, y, w, h, 12);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = INK;
  g.stroke();
}

// ---------------------------------------------------------------- Parrilla
const grill = {
  id: 'grill',
  label: { es: 'Parrilla', en: 'Grill' },
  icon: B.grillIcon,
  init() {
    this.spots = new Array(9).fill(null);
    this.drag = null;
    pool = [];
  },
  n(ctx) {
    return 6 + ctx.up('parrilla') * 3;
  },
  layout(ctx, a) {
    const L = {};
    const rows = this.n(ctx) / 3;
    if (!a.portrait) {
      L.raw = { x: a.x + 20, y: a.y + 30, w: 170, h: a.h - 60 };
      L.tray = { x: a.x + a.w - 250, y: a.y + 30, w: 230, h: a.h - 60 };
      L.gx = L.raw.x + L.raw.w + 40;
      L.gw = L.tray.x - 40 - L.gx;
      L.gy = a.y + 40;
      L.gh = a.h - 80;
    } else {
      L.gx = a.x + 30;
      L.gw = a.w - 60;
      L.gy = a.y + 30;
      L.gh = Math.min(a.h * 0.55, 140 * rows + 40);
      const by = L.gy + L.gh + 40;
      L.raw = { x: a.x + 20, y: by, w: (a.w - 60) / 2, h: a.y + a.h - by - 20 };
      L.tray = { x: a.x + 40 + (a.w - 60) / 2, y: by, w: (a.w - 60) / 2, h: a.y + a.h - by - 20 };
    }
    const cw = L.gw / 3, chh = L.gh / rows;
    L.r = Math.min(cw, chh) * 0.32;
    L.spot = (i) => ({ x: L.gx + cw * ((i % 3) + 0.42), y: L.gy + chh * (Math.floor(i / 3) + 0.5) });
    this.L = L;
  },
  tick(ctx, dt) {
    let any = false;
    for (const p of this.spots) {
      if (!p) continue;
      any = true;
      const s = p.down;
      const before = p[s];
      p[s] += dt / R.COOK_SECS;
      if (p.flipT > 0) p.flipT = Math.max(0, p.flipT - dt * 3.5);
      if (ctx.up('timbre') && this.target(ctx) != null && before < this.target(ctx) && p[s] >= this.target(ctx)) ctx.sfx.ding();
      if (before < R.BURN && p[s] >= R.BURN) ctx.sfx.alarm();
    }
    ctx.loop('sizzle', any && ctx.station === 'grill', 1, 'sizzle');
  },
  leave(ctx) {
    ctx.loop('sizzle', false);
  },
  /** El punto de la comanda elegida (para las marcas de los medidores). */
  target(ctx) {
    const o = ctx.active || ctx.orders.find((x) => !x.product) || ctx.orders[0];
    return o ? R.byId[o.data.cook].v : null;
  },
  draw(ctx, g) {
    const a = ctx.area, L = this.L;
    diner(g, a);
    steel(g, a.x - 10, L.gy - 26, a.w + 20, a.y + a.h - L.gy + 36);
    B.grillTop(g, L.gx, L.gy, L.gw, L.gh, ctx.now);
    // carne cruda
    cell(g, L.raw, false);
    A.text(g, t('raw'), L.raw.x + L.raw.w / 2, L.raw.y + 22, 18, { color: INK, stroke: null, max: L.raw.w - 10 });
    const rawN = a.portrait ? 3 : 5;
    for (let i = 0; i < rawN; i++) {
      const px = L.raw.x + L.raw.w / 2 + (a.portrait ? (i - 1) * L.r * 1.2 : 0), py = L.raw.y + (a.portrait ? L.raw.h * 0.58 : 70 + i * 22);
      B.pattyTop(g, { a: 0, b: 0, down: 'a' }, px, py, L.r * 0.8, 0.5);
    }
    // bandeja
    cell(g, L.tray, false);
    A.text(g, t('tray'), L.tray.x + L.tray.w / 2, L.tray.y + 22, 18, { color: INK, stroke: null });
    if (!pool.length) A.para(g, t('trayHint'), L.tray.x + L.tray.w / 2, L.tray.y + L.tray.h / 2, L.tray.w - 30, 17, { color: '#9a7a66' });
    pool.slice(0, 8).forEach((p, i) => {
      const px = L.tray.x + L.tray.w / 2 + ((i % 2) - 0.5) * L.r * 2.1, py = L.tray.y + 80 + Math.floor(i / 2) * L.r * 1.25;
      if (py < L.tray.y + L.tray.h - 20) B.pattyTop(g, p, px, py, L.r * 0.85, 0.55);
    });
    const tgt = this.target(ctx);
    for (let i = 0; i < this.n(ctx); i++) {
      const q = L.spot(i);
      const p = this.spots[i];
      if (!p || this.drag?.i === i) continue;
      const k = p.flipT ? Math.abs(Math.cos(p.flipT * Math.PI)) : 1;
      B.pattyTop(g, p, q.x, q.y, L.r, Math.max(0.08, k));
      B.pattyMeter(g, p, q.x + L.r + 12, q.y - L.r * 0.9, L.r * 1.8, tgt ?? 0.75);
      if (Math.max(p.a, p.b) > R.BURN && !G.prefs.reducedMotion) {
        for (let k2 = 0; k2 < 2; k2++) {
          const ph = (ctx.now * 0.9 + k2 / 2) % 1;
          A.circle(g, q.x + Math.sin(ph * 6 + k2) * 10, q.y - ph * 70, 10 + ph * 12);
          g.fillStyle = `rgba(70,65,65,${0.45 * (1 - ph)})`;
          g.fill();
        }
      }
    }
    if (this.drag) {
      const p = this.spots[this.drag.i];
      if (p) B.pattyTop(g, p, ctx.pointer.x, ctx.pointer.y, L.r * 1.05);
    }
  },
  spotAt(ctx, p) {
    const L = this.L;
    for (let i = 0; i < this.n(ctx); i++) {
      if (!this.spots[i]) continue;
      const q = L.spot(i);
      if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= (L.r * 1.15) ** 2) return i;
    }
    return -1;
  },
  down(ctx, p) {
    const L = this.L;
    if (inRect(p, L.raw)) {
      const i = this.spots.findIndex((s, k) => k < this.n(ctx) && !s);
      if (i < 0) {
        ctx.sfx.error();
        ctx.pop(t('full'), L.gx + L.gw / 2, L.gy + 20, '#fff', 22);
        return;
      }
      this.spots[i] = { ...R.newPatty(), flipT: 0 };
      ctx.sfx.squish();
      return;
    }
    const i = this.spotAt(ctx, p);
    if (i >= 0) this.drag = { i, x0: p.x, y0: p.y, moved: false };
  },
  move(ctx, p) {
    if (this.drag && Math.hypot(p.x - this.drag.x0, p.y - this.drag.y0) > 14) this.drag.moved = true;
  },
  up(ctx, p) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const pt = this.spots[d.i];
    if (!pt) return;
    if (!d.moved) {
      pt.down = pt.down === 'a' ? 'b' : 'a';
      pt.flipT = 1;
      ctx.sfx.squish();
      return;
    }
    if (inRect(p, this.L.tray) || (!ctx.portrait && p.x > this.L.tray.x - 30)) {
      this.spots[d.i] = null;
      pool.push({ a: pt.a, b: pt.b, down: pt.down });
      ctx.sfx.drop();
    }
  },
  accept() {},
  badge(ctx) {
    const on = this.spots.filter(Boolean);
    if (!on.length) return null;
    const tgt = this.target(ctx) ?? 0.75;
    const ready = on.some((p) => p[p.down] >= tgt - 0.03);
    return { n: on.length, alert: ctx.up('timbre') ? ready : on.some((p) => Math.max(p.a, p.b) > R.BURN) };
  },
  hint(ctx) {
    const L = this.L;
    const tgt = this.target(ctx);
    if (tgt == null) return null;
    const need = ctx.orders.filter((o) => !o.product || !o.product.done).reduce((s, o) => s + o.data.stack.filter((x) => x === 'carne').length, 0);
    const used = ctx.orders.reduce((s, o) => s + (o.product ? o.product.items.filter((x) => x.id === 'carne').length : 0), 0);
    const have = pool.length + this.spots.filter(Boolean).length + used;
    for (let i = 0; i < this.n(ctx); i++) {
      const p = this.spots[i];
      if (!p) continue;
      const q = L.spot(i);
      const other = p.down === 'a' ? 'b' : 'a';
      if (p[p.down] >= tgt - 0.04 && p[other] < tgt - 0.04) return { text: t('hFlip'), x: q.x, y: q.y - L.r };
      if (p.a >= tgt - 0.04 && p.b >= tgt - 0.04) return { text: t('hOff'), x: q.x, y: q.y - L.r };
    }
    if (have < need) return { text: t('hRaw'), x: L.raw.x + L.raw.w / 2, y: L.raw.y + 60 };
    if (this.spots.some(Boolean)) {
      const i = this.spots.findIndex(Boolean);
      const q = L.spot(i);
      return { text: t('hWait'), x: q.x + L.r + 20, y: q.y - L.r };
    }
    return null;
  },
};

// ---------------------------------------------------------------- Armado
const build = {
  id: 'build',
  label: { es: 'Armado', en: 'Build' },
  icon: B.buildIcon,
  init() {
    this.b = null;
    this.falling = [];
    this.tool = null;
    this.hold = null;
  },
  layout(ctx, a) {
    const L = { top: a.y };
    const items = R.itemsAt(ctx.rank).filter((x) => x.id !== 'carne').map((x) => x.id);
    if (!a.portrait) {
      L.ts = 0.8;
      L.tx = a.x + a.w - 220 * L.ts - 22;
      L.ty = a.y + 14;
      L.W = 230;
      L.cx = a.x + clamp(a.w * 0.44, 470, L.tx - 260);
      L.by = a.y + a.h - 36;
      L.s = 1.25;
      const left = ['panabajo', 'panarriba', ...items.slice(0, Math.max(0, items.length - 8))];
      const right = items.slice(Math.max(0, items.length - 8));
      const lc = Math.ceil(left.length / 4), rc = Math.ceil(right.length / 4) || 1;
      const cw = 104, ch = Math.min(100, (a.h - 140) / 4 - 10);
      L.bins = [
        ...grid(left, L.cx - L.W / 2 - 40 - lc * (cw + 10) + 10, a.y + 130, lc * (cw + 10) - 10, lc, ch),
        ...grid(right, L.cx + L.W / 2 + 40, a.y + 14, Math.min(rc * (cw + 10) - 10, L.tx - 30 - (L.cx + L.W / 2 + 40)), rc, ch),
      ];
      L.pool = { x: a.x + 16, y: a.y + 10, w: L.cx - L.W / 2 - 50 - a.x, h: 110 };
      L.send = { x: L.tx, y: a.y + a.h - 84, w: 220 * L.ts, h: 70 };
      L.trash = { x: L.tx - 92, y: a.y + a.h - 84, w: 76, h: 70 };
    } else {
      L.ts = 0.56;
      L.tx = a.x + a.w - 220 * L.ts - 14;
      L.ty = a.y + 12;
      const cols = 4;
      const ids = ['panabajo', 'panarriba', ...items, 'trash', 'send'];
      const rows = Math.ceil(ids.length / cols);
      const ch = Math.min(88, (a.h * 0.46) / rows - 8);
      const gy = a.y + a.h - rows * (ch + 8) - 4;
      const cells = grid(ids, a.x + 12, gy, a.w - 24, cols, ch, 8);
      L.bins = cells.filter((c) => c.id !== 'trash' && c.id !== 'send');
      L.trash = cells.find((c) => c.id === 'trash');
      L.send = cells.find((c) => c.id === 'send');
      L.W = 200;
      L.s = 1.05;
      L.cx = a.x + a.w * 0.42;
      L.by = gy - 26;
      L.pool = { x: a.x + 12, y: a.y + 10, w: L.tx - a.x - 30, h: 100 };
    }
    this.L = L;
  },
  tick(ctx, dt) {
    const L = this.L;
    for (const f of this.falling) {
      f.vy += 2600 * dt;
      f.y += f.vy * dt;
    }
    const landed = [];
    for (const f of this.falling) {
      if (!this.b || f.b !== this.b) {
        landed.push(f);
        continue;
      }
      const top = B.stackTop(this.b, L.by, L.s);
      if (f.y >= top) landed.push(f);
    }
    for (const f of landed) {
      this.falling.splice(this.falling.indexOf(f), 1);
      if (f.b !== this.b) continue;
      this.b.items.push({ id: f.id, x: f.x, patty: f.patty });
      if (f.id === 'panarriba') this.b.done = true;
      ctx.sfx[R.byId[f.id].sauce ? 'squish' : 'drop']();
    }
  },
  draw(ctx, g) {
    const a = ctx.area, L = this.L;
    diner(g, a);
    steel(g, a.x - 10, L.by - 16, a.w + 20, a.y + a.h - L.by + 26);
    // plato
    A.ellipse(g, L.cx, L.by + 4, L.W * 0.75, 16);
    A.fillStroke(g, '#ffffff', 3.5);
    const order = this.b ? this.b.order : ctx.active;
    const want = order?.data;
    // bateas
    for (const b of L.bins) {
      cell(g, b, this.tool === b.id);
      const s = Math.min(b.w / 150, (b.h - 26) / 60);
      if (R.byId[b.id].sauce) B.sauceBottle(g, b.id, b.x + b.w / 2, b.y + b.h - 22, Math.min(0.7, s), this.tool === b.id);
      else B.layer(g, { id: b.id, x: 0 }, b.x + b.w / 2, b.y + b.h * 0.66, b.w * 0.66, Math.min(1, s * 1.3));
      A.text(g, name(b.id), b.x + b.w / 2, b.y + b.h - 11, 13, { color: INK, stroke: null, weight: 600, max: b.w - 8 });
      if (want && (want.stack.includes(b.id) || b.id === 'panabajo' || b.id === 'panarriba')) {
        A.circle(g, b.x + b.w - 10, b.y + 10, 8);
        A.fillStroke(g, '#5cbf4f', 2.5);
      }
    }
    // medallones listos
    A.rr(g, L.pool.x, L.pool.y, L.pool.w, L.pool.h, 16);
    A.fillStroke(g, '#3a3f47', 3);
    if (!pool.length) A.text(g, t('noMeat'), L.pool.x + L.pool.w / 2, L.pool.y + L.pool.h / 2, 17, { color: '#c9ced6', stroke: null, max: L.pool.w - 20 });
    const pr = Math.min(36, L.pool.h * 0.34);
    this.poolPos = (i) => ({ x: L.pool.x + 20 + pr + i * (pr * 2.3), y: L.pool.y + L.pool.h / 2 });
    pool.forEach((p, i) => {
      const q = this.poolPos(i);
      if (q.x + pr > L.pool.x + L.pool.w || this.hold?.patty === p) return;
      B.pattyTop(g, p, q.x, q.y, pr, 0.62);
    });
    // la hamburguesa
    if (this.b) {
      B.burger(g, this.b, L.cx, L.by, L.W, L.s);
      for (const f of this.falling) B.layer(g, f, L.cx + f.x * L.W, f.y, L.W, L.s);
    } else {
      const ok = ctx.active && !ctx.active.product;
      const msg = !ctx.orders.length ? t('waitOrder') : ok ? t('hBun') : ctx.active?.product ? t('hasBurger') : t('pickTicket');
      if (!ctx.tutorial || !ok) A.para(g, msg, L.cx, L.by - 120, L.W * 1.3, 20, { color: '#7a5a46' });
    }
    if (order) ctx.ticket(order, L.tx, L.ty, L.ts, { active: true });
    // lo que se lleva en la mano
    const p = ctx.pointer;
    if (this.hold && p.down) {
      if (this.hold.patty) B.layer(g, { id: 'carne', x: 0, patty: this.hold.patty }, p.x, p.y + 10, L.W, L.s);
      else if (this.hold.id) B.layer(g, { id: this.hold.id, x: 0 }, p.x, p.y + 10, L.W, L.s);
    } else if (this.tool && !G.prefs.touch && p.x >= 0 && this.overBurger(p)) {
      g.globalAlpha = 0.55;
      B.layer(g, { id: this.tool, x: 0 }, p.x, p.y + 10, L.W, L.s);
      g.globalAlpha = 1;
    }
    ctx.btn('serve', L.send.x, L.send.y, L.send.w, L.send.h, t('serveB'), { fill: '#7ddc6b', size: 24, on: !!this.b && this.b.items.length > 1 }, () => this.serve(ctx));
    ctx.btn('trash', L.trash.x, L.trash.y, L.trash.w, L.trash.h, t('trash'), { fill: '#ffb4a8', size: 16, on: !!this.b }, () => this.trashIt(ctx));
  },
  overBurger(p) {
    const L = this.L;
    return Math.abs(p.x - L.cx) < L.W * 0.95 && p.y < L.by - 10 && p.y > L.top;
  },
  drop(ctx, id, p, patty) {
    if (!this.b) return;
    const L = this.L;
    let x = clamp((p.x - L.cx) / L.W, -0.7, 0.7);
    if (ctx.up('espatula')) x *= 0.5;
    const top = B.stackTop(this.b, L.by, L.s);
    this.falling.push({ id, x, y: Math.min(p.y, top - 20), vy: 0, b: this.b, patty });
    ctx.sfx.whoosh();
  },
  down(ctx, p) {
    const L = this.L;
    // medallón de la bandeja
    for (let i = 0; i < pool.length; i++) {
      const q = this.poolPos?.(i);
      if (q && Math.hypot(p.x - q.x, p.y - q.y) < 40) {
        this.hold = { patty: pool[i], from: 'pool' };
        return;
      }
    }
    const b = L.bins.find((x) => inRect(p, x));
    if (b) {
      if (b.id === 'panabajo') {
        if (this.b) return ctx.sfx.error();
        const o = ctx.active;
        if (!o || o.product) return ctx.sfx.error();
        this.b = ctx.start(R.newBurger());
        ctx.sfx.drop();
        this.tool = null;
        return;
      }
      this.tool = b.id;
      this.hold = { id: b.id, from: 'bin' };
      ctx.sfx.pick();
      return;
    }
    if (this.tool && this.b && this.overBurger(p)) this.drop(ctx, this.tool, p);
  },
  move() {},
  up(ctx, p) {
    const h = this.hold;
    this.hold = null;
    if (!h || !this.b) return;
    if (!this.overBurger(p)) return;
    if (h.patty) {
      const i = pool.indexOf(h.patty);
      if (i < 0) return;
      pool.splice(i, 1);
      this.drop(ctx, 'carne', p, h.patty);
    } else if (h.id) this.drop(ctx, h.id, p);
  },
  serve(ctx) {
    if (!this.b) return;
    const b = this.b;
    // lo que todavía está cayendo, cae
    for (const f of this.falling) if (f.b === b) b.items.push({ id: f.id, x: f.x, patty: f.patty });
    this.falling = [];
    this.b = null;
    this.tool = null;
    ctx.finish(b);
    const next = ctx.orders.find((o) => !o.product);
    if (next) ctx.select(next);
  },
  trashIt(ctx) {
    if (!this.b) return;
    ctx.trash(this.b);
    this.b = null;
    this.falling = [];
  },
  accept() {},
  badge(ctx) {
    const n = ctx.orders.filter((o) => !o.product).length;
    return n || pool.length ? { n: n || pool.length } : null;
  },
  hint(ctx) {
    const L = this.L;
    const at = (id) => {
      const b = L.bins.find((x) => x.id === id);
      return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : {};
    };
    if (!this.b) {
      if (!ctx.orders.length) return null;
      const o = ctx.active;
      if (!o || o.product) return ctx.orders.some((x) => !x.product) ? { text: t('pickTicket'), x: 60, y: 60 } : null;
      return { text: t('hBun'), ...at('panabajo') };
    }
    if (this.falling.length) return null;
    const want = R.fullStack(this.b.order.data);
    const got = this.b.items.map((x) => x.id);
    const next = want[got.length];
    if (!next) return { text: t('hServe'), x: L.send.x + L.send.w / 2, y: L.send.y };
    if (next === 'carne') {
      if (!pool.length) return { text: t('hNeedMeat'), tab: 1 };
      const q = this.poolPos(0);
      return { text: t('hItem', { name: name('carne').toLowerCase() }), x: q.x, y: q.y + 30 };
    }
    if (next === 'panarriba') return { text: t('hTop'), ...at('panarriba') };
    return { text: t('hItem', { name: name(next).toLowerCase() }), ...at(next) };
  },
};

// ---------------------------------------------------------------- comanda y producto
function drawTicket(g, order, w, h) {
  const o = order.data;
  const b = { items: R.fullStack(o).map((id) => ({ id, x: 0, patty: id === 'carne' ? { a: R.byId[o.cook].v, b: R.byId[o.cook].v } : null })) };
  let tot = 0;
  for (const it of b.items) tot += R.byId[it.id].h * (R.byId[it.id].sauce ? 0.5 : 0.92);
  const s = Math.min(1, (h - 70) / (tot + 30));
  B.burger(g, b, w / 2, h - 58, 130, s);
  const v = R.byId[o.cook].v;
  A.rr(g, 16, h - 40, 30, 22, 6);
  A.fillStroke(g, B.meatColor(v), 2);
  A.text(g, `${t('meat')}: ${name(o.cook)}`, 54, h - 29, 16, { color: INK, stroke: null, align: 'left', max: w - 64 });
}

function drawProduct(g, b, x, y, s) {
  if (!b) return;
  B.burger(g, b, x, y + s * 0.95, s * 1.7, s / 100);
}

function demoProduct() {
  const p = { a: 0.75, b: 0.75 };
  return { items: ['panabajo', 'carne', 'queso', 'lechuga', 'tomate', 'ketchup', 'panarriba'].map((id, i) => ({ id, x: (i % 2 ? 0.02 : -0.02), patty: id === 'carne' ? p : null })), done: true };
}

// ---------------------------------------------------------------- la definición
const def = {
  id: 'hamburgueseria',
  title: { es: 'Hamburguesería', en: 'Burger Shop' },
  tagline: { es: 'A la parrilla, vuelta y vuelta, y todo bien apilado', en: 'Off the grill, flipped just right and stacked up tall' },
  css: { accent: '#e8682a', accent2: '#ffd23f' },
  theme: {
    bg: '#3a2a22',
    wall: '#fff1d8',
    wall2: '#f6d9a8',
    pattern: 'diamonds',
    trim: '#c93a2c',
    floor: '#2b2b33',
    floor2: '#f3efe6',
    floorKind: 'checker',
    counter: '#c93a2c',
    counterTop: '#e9eef2',
    frame: '#5a3a2a',
    door: '#3d6fb0',
    chair: '#c93a2c',
    sign: '#3d6fb0',
    signText: 'HAMBURGUESAS',
    signInk: '#fff6dc',
    accent: '#ffd23f',
    card: '#fff7ea',
    railBg: 'rgba(40,25,20,.4)',
    tabsBg: 'rgba(40,25,20,.5)',
    sky: '#9ad3ff',
  },
  txt: TXT,
  stations: [grill, build],
  makeOrder: (r, ctx) => R.makeOrder(r, ctx.rank),
  drawTicket,
  drawProduct,
  demoProduct,
  grade: (order, b) => [
    { label: grill.label, score: R.grillScore(order.data, b) },
    { label: build.label, score: R.buildScore(order.data, b) },
  ],
  expected: (order) => R.expected(order.data),
  base: (order) => R.tipBase(order.data),
  unlocks: [
    ...R.ITEMS.filter((x) => x.rank > 1).map((x) => ({ rank: x.rank, id: x.id, name: x.name, icon: (g, px, py, s) => (x.sauce ? B.sauceBottle(g, x.id, px, py + s, s / 40, false) : B.layer(g, { id: x.id, x: 0 }, px, py + s * 0.3, s * 2, s / 22)) })),
    { rank: 2, id: 'doble', name: { es: 'Hamburguesas dobles', en: 'Double burgers' }, icon: (g, x, y, s) => B.buildIcon(g, x, y, s) },
    { rank: 3, id: 'cocida', name: { es: 'Carne bien cocida', en: 'Well-done patties' }, icon: (g, x, y, s) => B.pattyTop(g, { a: 1, b: 1, down: 'a' }, x, y, s * 0.8) },
    { rank: 6, id: 'triple', name: { es: 'Hamburguesas triples', en: 'Triple burgers' }, icon: (g, x, y, s) => B.buildIcon(g, x, y, s) },
  ],
  upgrades: [
    { id: 'parrilla', name: { es: 'Parrilla grande', en: 'Bigger grill' }, desc: { es: 'Tres lugares más para cocinar carne.', en: 'Three more spots for patties.' }, cost: 60, max: 1, icon: (g, x, y, s) => B.grillIcon(g, x, y, s) },
    { id: 'timbre', name: { es: 'Termómetro con alarma', en: 'Thermometer alarm' }, desc: { es: 'Suena (y avisa en la pestaña) cuando un lado llega al punto.', en: 'Rings (and flags the tab) when a side hits the right doneness.' }, cost: 35, max: 1, icon: (g, x, y, s) => B.pattyMeter(g, { a: 0.7, b: 0.3, down: 'a' }, x - 14, y - s, s * 2, 0.75) },
    { id: 'espatula', name: { es: 'Espátula guía', en: 'Guide spatula' }, desc: { es: 'Lo que soltás cae más cerca del centro.', en: 'What you drop lands closer to the middle.' }, cost: 45, max: 1, icon: (g, x, y, s) => B.layer(g, { id: 'queso', x: 0 }, x, y, s * 2, s / 20) },
  ],
  help: [
    { es: 'Tomá el pedido en el mostrador: la comanda muestra la hamburguesa de abajo hacia arriba y el punto de la carne.', en: 'Take the order at the counter: the ticket shows the burger bottom to top and how the patty is cooked.' },
    { es: 'En la Parrilla tocá la carne cruda, dala vuelta (tocándola) cuando la barra de abajo llegue a la marca verde y, con los dos lados a punto, arrastrala a la bandeja.', en: 'On the Grill tap the raw patties, flip them (tap) when the bottom bar reaches the green mark and, with both sides done, drag them to the tray.' },
    { es: 'En Armado tocá el pan de abajo y soltá cada cosa arriba de la hamburguesa en el orden de la comanda, bien al centro. Terminá con el pan de arriba.', en: 'In Build tap the bottom bun and drop each item over the burger in ticket order, right in the middle. Finish with the top bun.' },
    { es: 'Dejá carne cocinándose mientras armás otra: la espera cuenta para la propina.', en: 'Keep patties cooking while you build another: waiting counts toward the tip.' },
    { es: 'Teclas: 1 a 3 cambian de estación, Espacio toma el pedido, Esc pausa.', en: 'Keys: 1 to 3 switch stations, Space takes the order, Esc pauses.' },
  ],
};
run(def);
