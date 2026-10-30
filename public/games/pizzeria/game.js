/* Pizzería — game.it
 * Atender una pizzería del barrio: tomar el pedido en el mostrador, armar la pizza (salsa y queso a mano, cada
 * ingrediente en su zona y en la cantidad de la comanda), hornearla en el horno de barro hasta su punto y cortarla
 * en porciones parejas. Cada cliente tiene su favorita; las propinas compran mejoras y los rangos abren ingredientes.
 * El local (clientes, comandas, día, entrega y tienda) es el armazón compartido de /shared/cocina/.
 */
import { run, A } from '/shared/cocina/shell.js';
import { TAU, clamp, rng } from '/shared/cocina/core.js';
import * as R from './shared/rules.js';
import * as P from './art.js';

const G = window.GameIt;
const { INK } = A;

const TXT = {
  pickTicket: { es: 'Tocá una comanda de arriba para elegir qué pizza armar.', en: 'Tap a ticket up top to choose which pizza to make.' },
  waitOrder: { es: 'Esperá a que alguien pida.', en: 'Wait for someone to order.' },
  hDough: { es: 'Tocá la masa para estirarla.', en: 'Tap the dough to stretch it.' },
  hSauce: { es: 'Agarrá la salsa: tocá la olla.', en: 'Grab the sauce: tap the pot.' },
  hSauce2: { es: 'Pasá el dedo por la masa hasta cubrirla de salsa (sin pintar el borde).', en: 'Swipe over the dough until it is covered in sauce (not the crust).' },
  hCheese: { es: 'Ahora el queso: tocá el bol.', en: 'Now the cheese: tap the bowl.' },
  hCheese2: { es: 'Esparcí el queso sobre toda la salsa.', en: 'Spread cheese over all the sauce.' },
  hTop: { es: 'Mirá la comanda: van {n} de {name} {where}. Tocá su batea.', en: 'Check the ticket: {n} {name} {where}. Tap its bin.' },
  hTop2: { es: 'Tocá la pizza para poner {name} {where} (van {n}, repartidos).', en: 'Tap the pizza to place {name} {where} ({n}, spread out).' },
  hSend: { es: '¡Lista! Mandala al horno.', en: 'Done! Send it to the oven.' },
  hTray: { es: 'Tocá la pizza para meterla al horno.', en: 'Tap the pizza to put it in the oven.' },
  hBake: { es: 'Cuando la aguja llegue a la marca roja, tocá la pizza para sacarla.', en: 'When the needle reaches the red mark, tap the pizza to take it out.' },
  hFull: { es: 'No hay lugar en el horno: esperá a que salga una.', en: 'The oven is full: wait for one to come out.' },
  hCut: { es: 'Deslizá de lado a lado pasando por el centro: {k} cortes para {n} porciones.', en: 'Swipe across through the center: {k} cuts for {n} slices.' },
  hServe: { es: '¡Cortada! Tocá «Entregar».', en: 'Sliced! Tap "Serve".' },
  toOven: { es: 'Al horno', en: 'To oven' },
  serveB: { es: 'Entregar', en: 'Serve' },
  hasPizza: { es: 'Esa comanda ya tiene su pizza en marcha.', en: 'That ticket already has its pizza going.' },
  emptyOven: { es: 'Las pizzas que mandes al horno esperan acá.', en: 'Pizzas you send to the oven wait here.' },
  emptyCut: { es: 'Las pizzas que saques del horno llegan a la tabla.', en: 'Pizzas you take out of the oven land on the board.' },
  baking: { es: 'horneando', en: 'baking' },
  burnt: { es: '¡Se quema!', en: 'Burning!' },
  oven: { es: 'Horno', en: 'Oven' },
  slicesL: { es: 'Porciones', en: 'Slices' },
  all: { es: 'en toda la pizza', en: 'all over' },
  L: { es: 'en la mitad izquierda', en: 'on the left half' },
  R: { es: 'en la mitad derecha', en: 'on the right half' },
  TL: { es: 'en el cuarto de arriba a la izquierda', en: 'on the top-left quarter' },
  TR: { es: 'en el cuarto de arriba a la derecha', en: 'on the top-right quarter' },
  BL: { es: 'en el cuarto de abajo a la izquierda', en: 'on the bottom-left quarter' },
  BR: { es: 'en el cuarto de abajo a la derecha', en: 'on the bottom-right quarter' },
  sauce: { es: 'Salsa', en: 'Sauce' },
  cheese: { es: 'Queso', en: 'Cheese' },
  trash: { es: 'Tirar', en: 'Toss' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]);
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const inCircle = (p, cx, cy, r) => (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;
const inRect = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

// ---------------------------------------------------------------- Armado
const build = {
  id: 'build',
  label: { es: 'Armado', en: 'Build' },
  icon: P.buildIcon,
  init() {
    this.pz = null;
    this.tool = null;
    this.hold = null;
    this.stretch = 0;
    this.lastPaint = null;
    this.lastPiece = null;
    this.spreadT = 0;
  },
  layout(ctx, a) {
    const L = {};
    const tools = ['sauce', 'cheese'];
    const tops = R.toppingsAt(ctx.rank).map((t) => t.id);
    if (!a.portrait) {
      L.ts = 0.8;
      L.tx = a.x + a.w - 220 * L.ts - 22;
      L.ty = a.y + 14;
      L.R = Math.min(a.h * 0.42, 212);
      const bw = 104, bh = 96, gap = 10;
      const rows = Math.floor((a.h - 20) / (bh + gap));
      L.cx = a.x + clamp(a.w * 0.42, 2 * bw + gap + 40 + L.R, L.tx - 2 * bw - gap - 40 - L.R);
      L.cy = a.y + a.h * 0.53;
      const leftEnd = L.cx - L.R - 26;
      const rightStart = L.cx + L.R + 26;
      const cols = [leftEnd - bw, rightStart, rightStart + bw + gap, leftEnd - 2 * bw - gap];
      const y0 = a.y + (a.h - rows * (bh + gap) + gap) / 2;
      const slots = [];
      // salsa y queso a la izquierda (pegados a la pizza); ingredientes a la derecha y después a la izquierda
      for (const c of [1, 2]) for (let r = 0; r < rows; r++) slots.push({ x: cols[c], y: y0 + r * (bh + gap), w: bw, h: bh });
      for (let r = 2; r < rows; r++) slots.push({ x: cols[0], y: y0 + r * (bh + gap), w: bw, h: bh });
      for (let r = 0; r < rows; r++) slots.push({ x: cols[3], y: y0 + r * (bh + gap), w: bw, h: bh });
      L.bins = [
        { id: 'sauce', x: cols[0], y: y0, w: bw, h: bh },
        { id: 'cheese', x: cols[0], y: y0 + bh + gap, w: bw, h: bh },
        ...tops.map((id, i) => ({ id, ...slots[i] })),
      ];
      L.send = { x: L.tx, y: a.y + a.h - 84, w: 220 * L.ts, h: 70 };
      L.trash = { x: L.tx - 92, y: a.y + a.h - 84, w: 76, h: 70 };
    } else {
      L.ts = 0.6;
      L.tx = a.x + a.w - 220 * L.ts - 14;
      L.ty = a.y + 12;
      const cols = 4, gap = 12;
      const bw = (a.w - gap * (cols + 1)) / cols, bh = 94;
      const items = [...tools, ...tops, 'trash', 'send'];
      const rows = Math.ceil(items.length / cols);
      const gy = a.y + a.h - rows * (bh + gap) - 4;
      L.bins = [];
      items.forEach((id, i) => {
        const b = { id, x: a.x + gap + (i % cols) * (bw + gap), y: gy + Math.floor(i / cols) * (bh + gap), w: bw, h: bh };
        if (id === 'trash') L.trash = b;
        else if (id === 'send') L.send = b;
        else L.bins.push(b);
      });
      L.R = clamp(Math.min((gy - a.y) / 2 - 18, (a.w - 220 * L.ts - 40) / 2), 120, 250);
      L.cx = a.x + Math.max(L.R + 16, (L.tx - a.x) / 2);
      L.cy = a.y + (gy - a.y) / 2 + 6;
    }
    this.L = L;
  },
  tick(ctx, dt) {
    if (this.stretch < 1) this.stretch = Math.min(1, this.stretch + dt * 3);
    this.spreadT -= dt;
  },
  enter() {},
  norm(p) {
    const L = this.L;
    return { x: (p.x - L.cx) / L.R, y: (p.y - L.cy) / L.R };
  },
  draw(ctx, g) {
    const a = ctx.area, L = this.L;
    P.kitchen(g, a, ctx.now);
    P.steel(g, a.x - 10, L.cy - L.R * 0.55, a.w + 20, a.y + a.h - (L.cy - L.R * 0.55) + 10);
    // tabla de madera de abajo de la pizza
    A.circle(g, L.cx, L.cy, L.R * 1.08);
    A.fillStroke(g, '#c98b4f', 4);
    const order = this.pz ? this.pz.order : ctx.active;
    // bateas
    for (const b of L.bins) {
      const act = this.tool === b.id;
      if (b.id === 'sauce') {
        this.binBack(g, b, act);
        P.sauceBin(g, b.x + b.w / 2, b.y + b.h * 0.52, b.w * 0.34, act);
        A.text(g, t('sauce'), b.x + b.w / 2, b.y + b.h - 12, 15, { color: INK, stroke: null, weight: 600 });
      } else if (b.id === 'cheese') {
        this.binBack(g, b, act);
        P.cheeseBin(g, b.x + b.w / 2, b.y + b.h * 0.52, b.w * 0.34, act);
        A.text(g, t('cheese'), b.x + b.w / 2, b.y + b.h - 12, 15, { color: INK, stroke: null, weight: 600 });
      } else P.bin(g, b.id, b.x, b.y, b.w, b.h, act, G.t(R.byId[b.id].name));
      // qué pide la comanda: un puntito en las bateas que hacen falta
      if (order && b.id !== 'sauce' && b.id !== 'cheese' && order.data.toppings.some((w) => w.t === b.id)) {
        A.circle(g, b.x + b.w - 10, b.y + 10, 9);
        A.fillStroke(g, '#5cbf4f', 2.5);
      }
    }
    // la pizza o la masa
    if (this.pz) {
      const k = this.stretch;
      const e = k < 1 ? 1 - Math.pow(1 - k, 3) * (1 + Math.sin(k * 9) * 0.1) : 1;
      P.pizza(g, this.pz, L.cx, L.cy, L.R * (0.55 + 0.45 * e));
      // guía de zonas mientras se ponen ingredientes
      if (this.tool && this.tool !== 'sauce' && this.tool !== 'cheese') this.zoneGuide(g, order);
    } else this.dough(g, ctx);
    // comanda
    if (order) ctx.ticket(order, L.tx, L.ty, L.ts, { active: true });
    // botones
    const canSend = !!this.pz;
    ctx.btn('send', L.send.x, L.send.y, L.send.w, L.send.h, t('toOven'), { fill: '#ffd23f', size: 24, on: canSend, icon: (g, x, y, s) => P.ovenIcon(g, x, y, s * 0.9) }, () => this.sendIt(ctx));
    ctx.btn('trash', L.trash.x, L.trash.y, L.trash.w, L.trash.h, '', { fill: '#ffb4a8', on: !!this.pz }, () => this.trashIt(ctx));
    trashIcon(g, L.trash.x + L.trash.w / 2, L.trash.y + L.trash.h / 2 - (a.portrait ? 8 : 0), Math.min(L.trash.w, L.trash.h) * 0.26);
    if (a.portrait) A.text(g, t('trash'), L.trash.x + L.trash.w / 2, L.trash.y + L.trash.h - 14, 15, { color: INK, stroke: null });
    // lo que se lleva en la mano
    const pt = ctx.pointer;
    if (this.tool && pt.x >= 0 && (pt.down || !G.prefs.touch)) {
      if (this.tool === 'sauce') P.ladle(g, pt.x + 10, pt.y - 10, 34);
      else if (this.tool === 'cheese') {
        A.circle(g, pt.x, pt.y, 26);
        A.fillStroke(g, 'rgba(255,240,180,.85)', 3);
      } else if (this.hold || !G.prefs.touch) {
        g.globalAlpha = 0.85;
        P.topping(g, this.tool, pt.x, pt.y, L.R * 0.16, 0.3, 3);
        g.globalAlpha = 1;
      }
    }
  },
  binBack(g, b, act) {
    A.rr(g, b.x, b.y + 6, b.w, b.h, 14);
    g.fillStyle = INK;
    g.fill();
    A.rr(g, b.x, b.y, b.w, b.h, 14);
    A.fillStroke(g, act ? '#ffe27a' : '#dfe3e8', 3);
  },
  dough(g, ctx) {
    const L = this.L;
    const o = ctx.active;
    const ok = o && !o.product;
    const bob = G.prefs.reducedMotion ? 0 : Math.sin(ctx.now * 3) * 4;
    A.ellipse(g, L.cx, L.cy + 10 - bob * 0.3, L.R * 0.42, L.R * 0.34);
    A.fillStroke(g, '#f6dca6', 4);
    A.ellipse(g, L.cx - L.R * 0.12, L.cy - L.R * 0.06 - bob * 0.3, L.R * 0.16, L.R * 0.08, -0.3);
    g.fillStyle = 'rgba(255,255,255,.4)';
    g.fill();
    const msg = !ctx.orders.length ? t('waitOrder') : ok ? t('hDough') : o?.product ? t('hasPizza') : t('pickTicket');
    if (!ctx.tutorial || !ok) A.text(g, msg, L.cx, L.cy + L.R * 0.62, 22, { color: '#fff', max: L.R * 2.2 });
  },
  zoneGuide(g, order) {
    const L = this.L;
    const w = order?.data.toppings.find((x) => x.t === this.tool);
    if (!w || w.reg === 'all') return;
    g.save();
    g.setLineDash([10, 10]);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.beginPath();
    g.moveTo(L.cx, L.cy - L.R);
    g.lineTo(L.cx, L.cy + L.R);
    if (w.reg.length === 2) {
      g.moveTo(L.cx - L.R, L.cy);
      g.lineTo(L.cx + L.R, L.cy);
    }
    g.stroke();
    g.restore();
  },
  binAt(p) {
    return this.L.bins.find((b) => inRect(p, b));
  },
  down(ctx, p) {
    const b = this.binAt(p);
    if (b) {
      ctx.sfx.pick();
      this.tool = this.tool === b.id && b.id !== 'sauce' && b.id !== 'cheese' ? null : b.id;
      this.hold = { from: 'bin', id: b.id };
      return;
    }
    const L = this.L;
    if (!this.pz) {
      if (inCircle(p, L.cx, L.cy, L.R * 0.6)) this.newPizza(ctx);
      return;
    }
    if (!inCircle(p, L.cx, L.cy, L.R * 1.06)) return;
    this.hold = { from: 'pizza' };
    this.apply(ctx, p, true);
  },
  move(ctx, p) {
    if (!this.hold || !this.pz) return;
    const L = this.L;
    if (this.hold.from === 'bin' && (this.tool === 'sauce' || this.tool === 'cheese') && inCircle(p, L.cx, L.cy, L.R * 1.1)) {
      this.hold.from = 'pizza';
      this.lastPaint = null;
    }
    if (this.hold.from === 'pizza') this.apply(ctx, p, false);
  },
  up(ctx, p) {
    const h = this.hold;
    this.hold = null;
    this.lastPaint = null;
    this.lastPiece = null;
    if (!h || !this.pz) return;
    // arrastrar desde la batea y soltar sobre la pizza pone una
    if (h.from === 'bin' && this.tool && this.tool !== 'sauce' && this.tool !== 'cheese' && inCircle(p, this.L.cx, this.L.cy, this.L.R * 1.02)) this.place(ctx, this.norm(p));
  },
  apply(ctx, p, first) {
    const q = this.norm(p);
    const pz = this.pz;
    if (this.tool === 'sauce' || this.tool === 'cheese') {
      const key = this.tool;
      const r = (key === 'sauce' ? 0.17 : 0.18) * (1 + ctx.up('cucharon') * 0.35);
      const from = this.lastPaint || q;
      pz[key].line(from.x, from.y, q.x, q.y, r);
      const d = Math.hypot(q.x - from.x, q.y - from.y);
      const steps = Math.max(1, Math.ceil(d / (r * 0.5)));
      for (let k = 1; k <= steps; k++) P.paintBlob(pz, key, from.x + ((q.x - from.x) * k) / steps, from.y + ((q.y - from.y) * k) / steps, r, (pz[key].strokes = (pz[key].strokes || 0) + 1));
      this.lastPaint = q;
      if (this.spreadT <= 0) {
        ctx.sfx.spread();
        this.spreadT = 0.09;
      }
      return;
    }
    if (!this.tool) return;
    if (first || !this.lastPiece || Math.hypot(q.x - this.lastPiece.x, q.y - this.lastPiece.y) > 0.3) this.place(ctx, q);
  },
  place(ctx, q) {
    if (Math.hypot(q.x, q.y) > 1.02) return;
    const r = rng((this.pz.pieces.length + 1) * 7919);
    this.pz.pieces.push({ t: this.tool, x: q.x, y: q.y, a: r() * TAU, k: 0.9 + r() * 0.2 });
    this.lastPiece = q;
    ctx.sfx.plop();
  },
  newPizza(ctx) {
    const o = ctx.active;
    if (!o || o.product) {
      ctx.sfx.error();
      return;
    }
    this.pz = ctx.start(R.newPizza());
    this.stretch = 0;
    this.tool = 'sauce';
    ctx.sfx.squish();
  },
  sendIt(ctx) {
    if (!this.pz) return;
    ctx.send(this.pz, 'bake');
    this.pz = null;
    this.tool = null;
    const next = ctx.orders.find((o) => !o.product);
    if (next) ctx.select(next);
  },
  trashIt(ctx) {
    if (!this.pz) return;
    ctx.trash(this.pz);
    this.pz = null;
  },
  accept() {},
  badge(ctx) {
    const n = ctx.orders.filter((o) => !o.product).length;
    return n ? { n } : null;
  },
  hint(ctx) {
    const L = this.L;
    const bin = (id) => {
      const b = L.bins.find((x) => x.id === id);
      return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : {};
    };
    if (!this.pz) {
      if (!ctx.orders.length) return null;
      const o = ctx.active;
      if (!o || o.product) {
        const free = ctx.orders.find((x) => !x.product);
        return free ? { text: t('pickTicket'), x: 60, y: 60 } : null;
      }
      return { text: t('hDough'), x: L.cx, y: L.cy };
    }
    const pz = this.pz, order = pz.order.data;
    if (R.sauceScore(pz).cov < 0.8) return this.tool === 'sauce' ? { text: t('hSauce2'), x: L.cx, y: L.cy - L.R * 0.3 } : { text: t('hSauce'), ...bin('sauce') };
    if (R.cheeseScore(pz).cov < 0.78) return this.tool === 'cheese' ? { text: t('hCheese2'), x: L.cx, y: L.cy - L.R * 0.3 } : { text: t('hCheese'), ...bin('cheese') };
    const det = R.toppingDetail(order, pz.pieces);
    const miss = det.rows.find((r) => r.have < r.n);
    if (miss) {
      const v = { n: miss.n, name: G.t(R.byId[miss.t].name).toLowerCase(), where: t(miss.reg) };
      return this.tool === miss.t ? { text: t('hTop2', v), x: L.cx, y: L.cy } : { text: t('hTop', v), ...bin(miss.t) };
    }
    return { text: t('hSend'), x: L.send.x + L.send.w / 2, y: L.send.y };
  },
};

function trashIcon(g, x, y, s) {
  A.rr(g, x - s * 0.8, y - s * 0.6, s * 1.6, s * 1.6, s * 0.2);
  A.fillStroke(g, '#8a929e', Math.max(2, s * 0.12));
  A.rr(g, x - s, y - s * 0.95, s * 2, s * 0.35, s * 0.12);
  A.fillStroke(g, '#aab2bc', Math.max(2, s * 0.12));
  g.lineWidth = Math.max(1.5, s * 0.1);
  g.strokeStyle = INK;
  for (const dx of [-0.35, 0, 0.35]) {
    g.beginPath();
    g.moveTo(x + dx * s, y - s * 0.35);
    g.lineTo(x + dx * s, y + s * 0.8);
    g.stroke();
  }
}

// ---------------------------------------------------------------- Horno
const bake = {
  id: 'bake',
  label: { es: 'Horno', en: 'Oven' },
  icon: P.ovenIcon,
  init() {
    this.tray = [];
    this.slots = [null, null, null, null];
    this.focus = null;
    this.drag = null;
  },
  n(ctx) {
    return 2 + ctx.up('horno2');
  },
  layout(ctx, a) {
    const L = {};
    if (!a.portrait) {
      L.trayX = a.x + 30;
      L.trayW = 190;
      L.ts = 0.74;
      L.tx = a.x + a.w - 220 * L.ts - 24;
      L.ty = a.y + 16;
      L.ox = L.trayX + L.trayW + 30;
      L.ow = L.tx - 30 - L.ox;
      L.oy = a.y + 40;
      L.oh = a.h - 70;
      L.trayR = 58;
      L.trayPos = (i) => ({ x: L.trayX + L.trayW / 2, y: a.y + 78 + i * 128 });
      L.trayMax = Math.max(1, Math.floor((a.h - 20) / 128));
    } else {
      L.ts = 0.56;
      L.tx = a.x + a.w - 220 * L.ts - 14;
      L.ty = a.y + 12;
      L.ox = a.x + 20;
      L.ow = a.w - 40;
      L.oy = a.y + 220;
      L.oh = Math.min(520, a.h - 240 - 160);
      L.trayR = 56;
      L.trayMax = 4;
      const ty = L.oy + L.oh + 90;
      L.trayPos = (i) => ({ x: a.x + 90 + i * 135, y: Math.min(a.y + a.h - 70, ty) });
    }
    this.L = L;
  },
  mouths(ctx) {
    const L = this.L;
    return P.ovenMouths(L.ox, L.oy, L.ow, L.oh, this.n(ctx));
  },
  accept(ctx, pz) {
    this.tray.push(pz);
  },
  tick(ctx, dt) {
    let any = false;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      any = true;
      const before = s.pz.bake;
      s.pz.bake += dt / R.BAKE_SECS;
      const target = s.pz.order.data.bake;
      if (before < target && s.pz.bake >= target) {
        if (ctx.up('timbre')) ctx.sfx.ding();
        s.ready = true;
      }
      if (before < R.BAKE_MAX && s.pz.bake >= R.BAKE_MAX) ctx.sfx.alarm();
    }
    ctx.loop('oven', any && ctx.station === 'bake', 1, 'hum');
  },
  leave(ctx) {
    ctx.loop('oven', false);
  },
  draw(ctx, g) {
    const a = ctx.area, L = this.L;
    P.kitchen(g, a, ctx.now);
    g.fillStyle = '#8a5a3a';
    g.fillRect(a.x, a.y + a.h - 40, a.w, 40);
    const mouths = P.oven(g, L.ox, L.oy, L.ow, L.oh, this.n(ctx), ctx.now);
    mouths.forEach((m, i) => {
      const s = this.slots[i];
      const R0 = Math.min(m.w * 0.36, m.h * 0.42);
      // reloj arriba de cada boca
      const dy = m.y - Math.min(52, L.oh * 0.18) - 6;
      if (s) {
        // la pala y la pizza adentro
        A.rr(g, m.cx - 8, m.cy + R0 * 0.6, 16, m.h * 0.55, 6);
        A.fillStroke(g, '#b07a48', 3);
        P.pizza(g, s.pz, m.cx, m.cy, R0, { shadow: false });
        if (s.pz.bake > R.BAKE_MAX && !G.prefs.reducedMotion) {
          for (let k = 0; k < 3; k++) {
            const q = (ctx.now * 0.8 + k / 3) % 1;
            A.circle(g, m.cx + Math.sin(q * 7 + k) * 14, m.cy - R0 * 0.3 - q * 70, 12 + q * 16);
            g.fillStyle = `rgba(60,55,55,${0.45 * (1 - q)})`;
            g.fill();
          }
        }
        P.dial(g, m.cx, dy, Math.min(40, L.oh * 0.15), s.pz.bake, s.pz.order.data.bake);
        A.text(g, `#${s.pz.order.id}`, m.cx + Math.min(40, L.oh * 0.15) + 24, dy, 20, { color: '#fff' });
        ctx.hit(`slot${i}`, m.x, m.y, m.w, m.h, () => this.takeOut(ctx, i));
      } else {
        A.circle(g, m.cx, dy, Math.min(40, L.oh * 0.15));
        A.fillStroke(g, 'rgba(255,253,244,.5)', 3);
      }
    });
    // bandeja de espera
    const tray = this.tray.slice(0, L.trayMax);
    if (!this.tray.length) A.para(g, t('emptyOven'), a.portrait ? a.x + a.w / 2 : L.trayX + L.trayW / 2, a.portrait ? L.trayPos(0).y : a.y + a.h / 2, a.portrait ? a.w - 60 : L.trayW, 19, { color: '#7a5a46' });
    tray.forEach((pz, i) => {
      if (this.drag?.pz === pz) return;
      const q = L.trayPos(i);
      A.circle(g, q.x, q.y, L.trayR * 1.1);
      A.fillStroke(g, '#dfe3e8', 3);
      P.pizza(g, pz, q.x, q.y, L.trayR);
      A.text(g, `#${pz.order.id}`, q.x + L.trayR * 0.8, q.y - L.trayR * 0.85, 20, { color: '#fff' });
    });
    if (this.drag) {
      const p = ctx.pointer;
      P.pizza(g, this.drag.pz, p.x, p.y, L.trayR * 1.1);
    }
    const focus = this.focus && (this.tray.includes(this.focus) || this.slots.some((s) => s?.pz === this.focus)) ? this.focus : this.tray[0] || this.slots.find(Boolean)?.pz;
    if (focus) ctx.ticket(focus.order, L.tx, L.ty, L.ts, { active: true });
  },
  trayAt(p) {
    const L = this.L;
    const n = Math.min(this.tray.length, L.trayMax);
    for (let i = 0; i < n; i++) {
      const q = L.trayPos(i);
      if (inCircle(p, q.x, q.y, L.trayR * 1.15)) return i;
    }
    return -1;
  },
  down(ctx, p) {
    const i = this.trayAt(p);
    if (i >= 0) {
      this.drag = { pz: this.tray[i], x0: p.x, y0: p.y, moved: false };
      this.focus = this.tray[i];
      ctx.sfx.pick();
    }
  },
  move(ctx, p) {
    if (this.drag && Math.hypot(p.x - this.drag.x0, p.y - this.drag.y0) > 12) this.drag.moved = true;
  },
  up(ctx, p) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const mouths = this.mouths(ctx);
    let slot = -1;
    if (d.moved) slot = mouths.findIndex((m, i) => inRect(p, m) && !this.slots[i]);
    if (slot < 0 && (!d.moved || mouths.some((m) => inRect(p, m)))) slot = mouths.findIndex((_, i) => !this.slots[i]);
    if (slot < 0) {
      if (!d.moved || mouths.some((m) => inRect(p, m))) {
        ctx.sfx.error();
        ctx.pop(t('hFull'), this.L.ox + this.L.ow / 2, this.L.oy + 20, '#fff', 22);
      }
      return;
    }
    this.tray.splice(this.tray.indexOf(d.pz), 1);
    this.slots[slot] = { pz: d.pz, ready: false };
    d.pz.order.where = 'bake';
    ctx.sfx.drop();
  },
  takeOut(ctx, i) {
    const s = this.slots[i];
    if (!s) return;
    this.slots[i] = null;
    s.pz.baked = true;
    this.focus = null;
    ctx.send(s.pz, 'cut');
  },
  badge(ctx) {
    const baking = this.slots.filter(Boolean);
    const ready = baking.some((s) => s.pz.bake >= s.pz.order.data.bake - 0.1);
    const n = this.tray.length + baking.length;
    if (!n) return null;
    return { n, alert: ctx.up('timbre') ? ready : baking.some((s) => s.pz.bake > R.BAKE_MAX) };
  },
  hint(ctx) {
    const L = this.L;
    const mouths = this.mouths(ctx);
    const baking = this.slots.findIndex((s) => s);
    if (this.tray.length) {
      if (this.slots.slice(0, this.n(ctx)).every(Boolean)) return { text: t('hFull'), x: L.ox + L.ow / 2, y: L.oy + 10 };
      const q = L.trayPos(0);
      return { text: t('hTray'), x: q.x, y: q.y - L.trayR };
    }
    if (baking >= 0) {
      const m = mouths[baking];
      return { text: t('hBake'), x: m.cx, y: m.y - 30 };
    }
    return null;
  },
};

// ---------------------------------------------------------------- Corte
const cut = {
  id: 'cut',
  label: { es: 'Corte', en: 'Cut' },
  icon: P.cutIcon,
  init() {
    this.queue = [];
    this.pz = null;
    this.drag = null;
    this.anim = null;
  },
  layout(ctx, a) {
    const L = {};
    if (!a.portrait) {
      L.ts = 0.78;
      L.tx = a.x + a.w - 220 * L.ts - 24;
      L.ty = a.y + 14;
      L.R = Math.min(a.h * 0.4, 205);
      L.cx = a.x + clamp(a.w * 0.47, 260 + L.R * 1.2, L.tx - 40 - L.R * 1.2);
      L.cy = a.y + a.h * 0.5;
      L.qR = 50;
      L.qPos = (i) => ({ x: a.x + 100, y: a.y + 78 + i * 116 });
      L.qMax = Math.max(1, Math.floor((a.h - 30) / 116));
      L.send = { x: L.tx, y: a.y + a.h - 84, w: 220 * L.ts, h: 70 };
    } else {
      L.ts = 0.56;
      L.tx = a.x + a.w - 220 * L.ts - 14;
      L.ty = a.y + 12;
      L.R = clamp(Math.min(a.w * 0.4, (a.h - 420) / 2), 150, 270);
      L.cx = a.x + a.w / 2;
      L.cy = a.y + 200 + L.R * 1.12;
      L.qR = 44;
      L.qMax = 3;
      L.qPos = (i) => ({ x: a.x + 70 + i * 110, y: a.y + 80 });
      L.send = { x: a.x + a.w / 2 - 150, y: a.y + a.h - 92, w: 300, h: 76 };
    }
    this.L = L;
  },
  accept(ctx, pz) {
    if (!this.pz) this.pz = pz;
    else this.queue.push(pz);
  },
  tick(ctx, dt) {
    if (this.anim) {
      this.anim.t += dt * 2.6;
      if (this.anim.t >= 1) this.anim = null;
    }
  },
  draw(ctx, g) {
    const a = ctx.area, L = this.L;
    P.kitchen(g, a, ctx.now);
    P.steel(g, a.x - 10, L.cy - L.R * 0.7, a.w + 20, a.y + a.h - (L.cy - L.R * 0.7) + 10);
    P.board(g, L.cx, L.cy, L.R);
    if (this.pz) {
      P.pizza(g, this.pz, L.cx, L.cy, L.R);
      const want = this.pz.order.data.slices;
      if (ctx.up('guia')) {
        g.save();
        g.setLineDash([12, 12]);
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(255,255,255,.8)';
        for (let i = 0; i < want / 2; i++) {
          const ang = -Math.PI / 2 + (i * Math.PI) / (want / 2);
          g.beginPath();
          g.moveTo(L.cx + Math.cos(ang) * L.R * 1.05, L.cy + Math.sin(ang) * L.R * 1.05);
          g.lineTo(L.cx - Math.cos(ang) * L.R * 1.05, L.cy - Math.sin(ang) * L.R * 1.05);
          g.stroke();
        }
        g.restore();
      }
      // corte en curso
      if (this.drag) {
        const d = this.drag;
        g.save();
        g.setLineDash([6, 10]);
        g.lineWidth = 5;
        g.strokeStyle = '#fff';
        g.beginPath();
        g.moveTo(d.x0, d.y0);
        g.lineTo(d.x1, d.y1);
        g.stroke();
        g.restore();
        P.cutter(g, d.x1, d.y1, 34, Math.atan2(d.y1 - d.y0, d.x1 - d.x0) - Math.PI / 2, ctx.now * 12);
      }
      if (this.anim) {
        const c = this.anim.c;
        const [ax, ay, bx, by] = P.chord(c);
        const k = this.anim.t;
        P.cutter(g, L.cx + (ax + (bx - ax) * k) * L.R, L.cy + (ay + (by - ay) * k) * L.R, 36, Math.atan2(by - ay, bx - ax) - Math.PI / 2, k * 20);
      }
      A.text(g, `${t('slicesL')}: ${this.pz.order.data.slices}`, L.cx, L.cy - L.R - 22, 22, { color: '#fff' });
      ctx.ticket(this.pz.order, L.tx, L.ty, L.ts, { active: true });
    } else A.para(g, t('emptyCut'), L.cx, L.cy, L.R * 1.7, 22, { color: '#fff', stroke: INK, lw: 5 });
    // cola
    this.queue.slice(0, L.qMax).forEach((pz, i) => {
      const q = L.qPos(i);
      A.circle(g, q.x, q.y, L.qR * 1.12);
      A.fillStroke(g, '#dfe3e8', 3);
      P.pizza(g, pz, q.x, q.y, L.qR);
      A.text(g, `#${pz.order.id}`, q.x + L.qR * 0.8, q.y - L.qR * 0.85, 18, { color: '#fff' });
      ctx.hit(`q${i}`, q.x - L.qR, q.y - L.qR, L.qR * 2, L.qR * 2, () => this.swap(ctx, i));
    });
    ctx.btn('serve', L.send.x, L.send.y, L.send.w, L.send.h, t('serveB'), { fill: '#7ddc6b', size: 26, on: !!this.pz, icon: (g, x, y, s) => P.box(g, x, y + s * 0.2, s * 0.9, 0.4) }, () => this.serve(ctx));
  },
  swap(ctx, i) {
    const pz = this.queue[i];
    this.queue.splice(i, 1);
    if (this.pz) this.queue.unshift(this.pz);
    this.pz = pz;
    ctx.sfx.drop();
  },
  serve(ctx) {
    if (!this.pz) return;
    const pz = this.pz;
    this.pz = this.queue.shift() || null;
    this.drag = null;
    ctx.finish(pz);
  },
  down(ctx, p) {
    if (!this.pz || this.anim) return;
    this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  },
  move(ctx, p) {
    if (!this.drag) return;
    this.drag.x1 = p.x;
    this.drag.y1 = p.y;
  },
  up(ctx, p) {
    const d = this.drag;
    this.drag = null;
    if (!d || !this.pz) return;
    const L = this.L;
    const len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
    if (len < L.R * 1.1) return;
    const c = { x1: (d.x0 - L.cx) / L.R, y1: (d.y0 - L.cy) / L.R, x2: (d.x1 - L.cx) / L.R, y2: (d.y1 - L.cy) / L.R };
    // el gesto tiene que pasar por arriba de la pizza (el punto del segmento más cercano al centro, adentro)
    const dx = c.x2 - c.x1, dy = c.y2 - c.y1;
    const k = clamp(-(c.x1 * dx + c.y1 * dy) / (dx * dx + dy * dy), 0, 1);
    const dist = Math.hypot(c.x1 + dx * k, c.y1 + dy * k);
    if (dist > 0.95 || this.pz.cuts.length >= 8) return;
    this.pz.cuts.push(c);
    this.anim = { c, t: 0 };
    ctx.sfx.cut();
  },
  badge() {
    const n = (this.pz ? 1 : 0) + this.queue.length;
    return n ? { n } : null;
  },
  hint(ctx) {
    if (!this.pz) return null;
    const L = this.L;
    const want = this.pz.order.data.slices;
    if (this.pz.cuts.length < want / 2) return { text: t('hCut', { k: want / 2, n: want }), x: L.cx, y: L.cy - L.R * 0.2 };
    return { text: t('hServe'), x: L.send.x + L.send.w / 2, y: L.send.y };
  },
};

// ---------------------------------------------------------------- comanda y producto
function drawTicket(g, order, w, h) {
  const o = order.data;
  const rows = o.toppings.length;
  const rowH = Math.min(42, (h - 96) / Math.max(1, rows));
  o.toppings.forEach((tp, i) => {
    const y = 8 + rowH * i + rowH / 2;
    P.regionIcon(g, tp.reg, 28, y, Math.min(16, rowH * 0.4));
    P.topping(g, tp.t, 64, y, Math.min(13, rowH * 0.32), 0, 2);
    A.text(g, `×${tp.n}`, 86, y + 1, 22, { color: INK, stroke: null, align: 'left' });
    A.text(g, G.t(R.byId[tp.t].name), 126, y + 1, 15, { color: '#7a5a46', stroke: null, align: 'left', max: w - 134 });
  });
  const by = h - 50;
  g.fillStyle = '#e8dccb';
  g.fillRect(12, by - 40, w - 24, 2);
  P.dial(g, 52, by, 27, o.bake, o.bake);
  A.text(g, t('oven'), 52, by + 38, 14, { color: '#7a5a46', stroke: null });
  P.slicesIcon(g, 150, by, 27, o.slices);
  A.text(g, String(o.slices), 194, by, 26, { color: INK, stroke: null });
  A.text(g, t('slicesL'), 150, by + 38, 14, { color: '#7a5a46', stroke: null });
}

function drawProduct(g, pz, x, y, s) {
  if (!pz) return;
  A.rr(g, x - s * 1.12, y - s * 1.12, s * 2.24, s * 2.24, s * 0.12);
  A.fillStroke(g, '#e9c690', 3.5);
  A.rr(g, x - s * 1.02, y - s * 1.02, s * 2.04, s * 2.04, s * 0.08);
  g.fillStyle = 'rgba(160,110,50,.18)';
  g.fill();
  P.pizza(g, pz, x, y, s * 0.95, { separate: true });
}

/** Una pizza de muestra para la pantalla de inicio. */
function demoProduct() {
  const pz = R.newPizza();
  for (let y = -0.8; y <= 0.8; y += 0.12) for (let x = -0.8; x <= 0.8; x += 0.12) {
    if (x * x + y * y < 0.8 * 0.8) {
      pz.sauce.paint(x, y, 0.12);
      P.paintBlob(pz, 'sauce', x, y, 0.14, Math.round((x + 2) * 100 + y * 1000));
      pz.cheese.paint(x, y, 0.12);
      P.paintBlob(pz, 'cheese', x, y, 0.14, Math.round((x + 3) * 100 + y * 777));
    }
  }
  const r = rng(4);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, d = i % 3 === 0 ? 0.25 : 0.58;
    pz.pieces.push({ t: i % 2 ? 'calabresa' : 'hongos', x: Math.cos(a) * d, y: Math.sin(a) * d, a: r() * TAU, k: 1 });
  }
  pz.bake = 4.2;
  pz.baked = true;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    pz.cuts.push({ x1: Math.cos(a), y1: Math.sin(a), x2: -Math.cos(a), y2: -Math.sin(a) });
  }
  return pz;
}

// ---------------------------------------------------------------- la definición
const bellUp = (g, x, y, s) => {
  P.ovenIcon(g, x - s * 0.25, y + s * 0.2, s * 0.75);
  A.circle(g, x + s * 0.65, y - s * 0.55, s * 0.4);
  A.fillStroke(g, '#ffd23f', 2.5);
};

run({
  id: 'pizzeria',
  title: { es: 'Pizzería', en: 'Pizzeria' },
  tagline: { es: 'Masa, salsa, queso y al horno: cada vecino con su favorita', en: 'Dough, sauce, cheese and into the oven: every neighbor has a favorite' },
  css: { accent: '#e5484d', accent2: '#ffd23f' },
  theme: {
    bg: '#5e2a1f',
    wall: '#f7dfc0',
    wall2: '#e8b58c',
    pattern: 'bricks',
    trim: '#2e7d4f',
    floor: '#f3e4d0',
    floor2: '#c94a3c',
    floorKind: 'checker',
    counter: '#2e7d4f',
    counterTop: '#ece6dc',
    frame: '#7a4a2c',
    door: '#9b5a32',
    chair: '#d33f2f',
    sign: '#d33f2f',
    signText: 'PIZZERÍA',
    signInk: '#fff6e0',
    accent: '#ffd23f',
    card: '#fff6e6',
    railBg: 'rgba(60,25,15,.35)',
    tabsBg: 'rgba(60,25,15,.45)',
    sky: '#8fd3ff',
  },
  txt: TXT,
  stations: [build, bake, cut],
  makeOrder: (r, ctx) => R.makeOrder(r, ctx.rank),
  drawTicket,
  drawProduct,
  demoProduct,
  grade: (order, pz) => [
    { label: build.label, score: R.buildScore(order.data, pz) },
    { label: bake.label, score: R.bakeScore(order.data, pz) },
    { label: cut.label, score: R.cutScore(order.data, pz) },
  ],
  expected: (order) => R.expected(order.data),
  base: (order) => R.tipBase(order.data),
  unlocks: [
    ...R.TOPPINGS.filter((tp) => tp.rank > 1).map((tp) => ({ rank: tp.rank, id: tp.id, name: tp.name, icon: (g, x, y, s) => P.topping(g, tp.id, x, y, s, 0, 3) })),
    { rank: 2, id: 's6', name: { es: 'Pizzas en 6 porciones', en: 'Pizzas in 6 slices' }, icon: (g, x, y, s) => P.slicesIcon(g, x, y, s, 6) },
    { rank: 3, id: 's8', name: { es: 'Pizzas en 8 porciones', en: 'Pizzas in 8 slices' }, icon: (g, x, y, s) => P.slicesIcon(g, x, y, s, 8) },
    { rank: 2, id: 'b2', name: { es: 'Más y menos horno', en: 'Lighter and darker bakes' }, icon: (g, x, y, s) => P.dial(g, x, y, s, 5, 5) },
  ],
  upgrades: [
    { id: 'horno2', name: { es: 'Horno más grande', en: 'Bigger oven' }, desc: { es: 'Una boca más para hornear a la vez.', en: 'One more spot to bake at once.' }, cost: [45, 130], max: 2, icon: (g, x, y, s) => P.ovenIcon(g, x, y, s) },
    { id: 'timbre', name: { es: 'Timbre del horno', en: 'Oven bell' }, desc: { es: 'Suena (y avisa en la pestaña) cuando una pizza llega a su punto.', en: 'Rings (and flags the tab) when a pizza hits its bake.' }, cost: 35, max: 1, icon: bellUp },
    { id: 'guia', name: { es: 'Cortador con guía', en: 'Guided cutter' }, desc: { es: 'Marca por dónde cortar cada pizza.', en: 'Shows where to cut each pizza.' }, cost: 60, max: 1, icon: (g, x, y, s) => P.cutIcon(g, x, y, s) },
    { id: 'cucharon', name: { es: 'Cucharón grande', en: 'Big ladle' }, desc: { es: 'La salsa y el queso cubren más rápido.', en: 'Sauce and cheese spread faster.' }, cost: 30, max: 1, icon: (g, x, y, s) => P.ladle(g, x, y + s * 0.3, s * 0.9) },
  ],
  help: [
    { es: 'Cuando llega alguien al mostrador, tocá «Tomar pedido»: su comanda queda colgada arriba.', en: 'When someone reaches the counter, tap "Take order": their ticket hangs up top.' },
    { es: 'En Armado tocá la masa, pintá la salsa y el queso con el dedo y poné cada ingrediente en la zona y la cantidad de la comanda, bien repartido.', en: 'In Build tap the dough, paint sauce and cheese with your finger and place each topping in the area and amount on the ticket, spread out.' },
    { es: 'En el Horno metela y sacala cuando la aguja llegue a la marca roja: ni cruda ni quemada.', en: 'In the Oven put it in and take it out when the needle hits the red mark: not raw, not burnt.' },
    { es: 'En Corte deslizá de lado a lado pasando por el centro, con porciones parejas, y entregala.', en: 'In Cut swipe across through the center, with even slices, and serve it.' },
    { es: 'Mientras una se hornea, atendé a otro: la espera también cuenta para la propina.', en: 'While one bakes, serve someone else: waiting time counts toward the tip too.' },
    { es: 'Teclas: 1 a 4 cambian de estación, Espacio toma el pedido, Esc pausa.', en: 'Keys: 1 to 4 switch stations, Space takes the order, Esc pauses.' },
  ],
});
