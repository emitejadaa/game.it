/* Heladería — game.it
 * Atender una heladería de licuados: tomar el pedido, elegir el vaso, echar las mezclas y llenar de jarabe hasta la
 * línea, licuarlo al punto justo (grueso, normal o suave) y decorarlo con crema en espiral, salsas, granas y lo que
 * va arriba en su lugar. Mismo local que la pizzería: el armazón de /shared/cocina/ pone clientes, comandas y tienda.
 */
import { run, A, bellIcon } from '/shared/cocina/shell.js';
import { TAU, clamp, rng } from '/shared/cocina/core.js';
import * as R from './shared/rules.js';
import * as H from './art.js';

const G = window.GameIt;
const { INK } = A;

const TXT = {
  pickTicket: { es: 'Tocá una comanda de arriba para elegir qué licuado hacer.', en: 'Tap a ticket up top to choose which shake to make.' },
  waitOrder: { es: 'Esperá a que alguien pida.', en: 'Wait for someone to order.' },
  hasCup: { es: 'Esa comanda ya tiene su licuado en marcha.', en: 'That ticket already has its shake going.' },
  hSize: { es: 'Elegí el vaso: {size}.', en: 'Pick the cup: {size}.' },
  hMix: { es: 'Tocá el frasco de {name} para echarlo.', en: 'Tap the {name} jar to add it.' },
  hSyrup: { es: 'Mantené apretado el jarabe de {name} y soltá en la línea roja.', en: 'Hold the {name} syrup and let go at the red line.' },
  hSend: { es: '¡Listo! Mandalo a licuar.', en: 'Done! Send it to blend.' },
  hTray: { es: 'Tocá el vaso para ponerlo en la licuadora.', en: 'Tap the cup to put it in the blender.' },
  hBlend: { es: 'Cuando la barra llegue a la zona verde, tocá la licuadora para sacarlo.', en: 'When the bar reaches the green zone, tap the blender to take it out.' },
  hFull: { es: 'Las licuadoras están ocupadas: esperá una.', en: 'Blenders are busy: wait for one.' },
  hCream: { es: 'Tocá {name} y mantené apretado sobre el vaso, bien al centro.', en: 'Tap {name} and hold over the cup, right in the middle.' },
  hCream2: { es: 'Mantené apretado sobre el vaso hasta que la crema quede alta.', en: 'Hold over the cup until the cream is tall.' },
  hNoCream: { es: 'Este va sin crema.', en: 'This one has no cream.' },
  hDrizzle: { es: 'Tocá {name} y pasala de lado a lado por arriba.', en: 'Tap {name} and drizzle it side to side over the top.' },
  hSprinkle: { es: 'Tocá {name} y mantené apretado arriba del vaso.', en: 'Tap {name} and hold over the cup.' },
  hGarnish: { es: 'Tocá {name} y ponela {where}.', en: 'Tap {name} and place it {where}.' },
  hServe: { es: '¡Precioso! Tocá «Entregar».', en: 'Lovely! Tap "Serve".' },
  toBlend: { es: 'A licuar', en: 'To blender' },
  serveB: { es: 'Entregar', en: 'Serve' },
  trash: { es: 'Tirar', en: 'Toss' },
  emptyBlend: { es: 'Los vasos que mandes a licuar esperan acá.', en: 'Cups you send to blend wait here.' },
  emptyTop: { es: 'Los licuados que saques de la licuadora llegan acá.', en: 'Shakes you take out of the blender land here.' },
  watery: { es: '¡Aguado!', en: 'Watery!' },
  L: { es: 'a la izquierda', en: 'on the left' },
  C: { es: 'arriba en el medio', en: 'on top in the middle' },
  R: { es: 'a la derecha', en: 'on the right' },
  noCream: { es: 'Sin crema', en: 'No cream' },
  blendL: { es: 'Licuado', en: 'Blend' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]);
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const name = (id) => G.t(R.byId[id].name);
const inRect = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Ubica una lista de cosas en una grilla dentro de un rectángulo. */
function grid(ids, x, y, w, cols, ch, gap = 10) {
  const cw = (w - gap * (cols - 1)) / cols;
  return ids.map((id, i) => ({ id, x: x + (i % cols) * (cw + gap), y: y + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
}

function cell(g, b, active) {
  A.rr(g, b.x, b.y + 5, b.w, b.h, 14);
  g.fillStyle = INK;
  g.fill();
  A.rr(g, b.x, b.y, b.w, b.h, 14);
  A.fillStroke(g, active ? '#ffe27a' : '#ffffff', 3);
}

// ---------------------------------------------------------------- Armado
const build = {
  id: 'build',
  label: { es: 'Armado', en: 'Build' },
  icon: H.cupIcon,
  init() {
    this.cup = null;
    this.pouring = null;
    this.flying = [];
    this.press = {};
  },
  layout(ctx, a) {
    const L = {};
    const mixes = R.mixesAt(ctx.rank).map((m) => m.id);
    const syrups = R.syrupsAt(ctx.rank).map((m) => m.id);
    if (!a.portrait) {
      L.ts = 0.78;
      L.tx = a.x + a.w - 220 * L.ts - 22;
      L.ty = a.y + 14;
      const rows = mixes.length > 6 ? 2 : 1;
      const jh = rows > 1 ? 92 : 112;
      const jx = a.x + 200, jw = L.tx - 24 - jx;
      const per = Math.ceil(mixes.length / rows);
      L.jars = grid(mixes, jx, a.y + 10, Math.min(jw, per * 118), per, jh);
      L.sizes = grid(['S', 'M', 'L'], a.x + 18, a.y + 10, 160, 1, (a.h - 40) / 3 - 7);
      L.cupS = 1.08;
      L.cupX = a.x + 290;
      L.cupY = a.y + a.h - 26;
      const bx = L.cupX + 110, bw = L.tx - 24 - bx;
      const bc = Math.min(syrups.length, 6);
      L.bottles = grid(syrups, bx, a.y + rows * (jh + 10) + 30, Math.min(bw, bc * 96), bc, Math.min(170, a.h - rows * (jh + 10) - 130));
      L.send = { x: L.tx, y: a.y + a.h - 84, w: 220 * L.ts, h: 70 };
      L.trash = { x: L.tx - 92, y: a.y + a.h - 84, w: 76, h: 70 };
    } else {
      L.ts = 0.6;
      L.tx = a.x + a.w - 220 * L.ts - 14;
      L.ty = a.y + 12;
      const cols = 4;
      const items = [...['S', 'M', 'L'], ...mixes, ...syrups, 'trash', 'send'];
      const rows = Math.ceil(items.length / cols);
      const ch = Math.min(92, (a.h * 0.55) / rows - 8);
      const gy = a.y + a.h - rows * (ch + 8) - 4;
      const cells = grid(items, a.x + 12, gy, a.w - 24, cols, ch, 8);
      L.sizes = cells.filter((c) => ['S', 'M', 'L'].includes(c.id));
      L.jars = cells.filter((c) => mixes.includes(c.id));
      L.bottles = cells.filter((c) => syrups.includes(c.id));
      L.trash = cells.find((c) => c.id === 'trash');
      L.send = cells.find((c) => c.id === 'send');
      L.cupS = clamp((gy - a.y - 60) / 240, 0.8, 1.35);
      L.cupX = a.x + (L.tx - a.x) / 2;
      L.cupY = gy - 24;
    }
    this.L = L;
  },
  geom() {
    return H.cupGeom(this.cup?.size || 'M', this.L.cupX, this.L.cupY, this.L.cupS);
  },
  tick(ctx, dt) {
    if (this.pouring && this.cup) {
      let rate = 0.4;
      if (ctx.up('bomba') && this.cup.fill > 0.85) rate = 0.2;
      R.pour(this.cup, this.pouring, dt * rate);
      ctx.loop('pour', true, 1, 'pour');
    } else ctx.loop('pour', false);
    for (const f of this.flying) f.t += dt * 2.4;
    for (const f of this.flying.filter((f) => f.t >= 1)) {
      if (this.cup === f.cup) f.cup.mixes.push(f.id);
      ctx.sfx.plop();
    }
    this.flying = this.flying.filter((f) => f.t < 1);
  },
  leave(ctx) {
    this.pouring = null;
    ctx.loop('pour', false);
  },
  draw(ctx, g) {
    const a = ctx.area, L = this.L;
    H.parlorWall(g, a);
    H.counterTop(g, a.x - 10, L.cupY - 6, a.w + 20, a.y + a.h - L.cupY + 20);
    const order = this.cup ? this.cup.order : ctx.active;
    const want = order?.data;
    // vasos
    for (const b of L.sizes) {
      cell(g, b, this.cup?.size === b.id);
      const c = R.newCup(b.id);
      H.cup(g, c, b.x + b.w / 2, b.y + b.h - 12, Math.min(0.5, (b.h - 30) / 200), { shadow: false });
      A.text(g, G.t(R.sizeOf(b.id).name), b.x + b.w / 2, b.y + 16, 15, { color: INK, stroke: null, weight: 600, max: b.w - 8 });
      if (want?.size === b.id) dot(g, b);
    }
    for (const b of L.jars) {
      H.mixJar(g, b.id, b.x, b.y, b.w, b.h, false, name(b.id));
      if (want?.mixes.includes(b.id)) dot(g, b);
    }
    for (const b of L.bottles) {
      cell(g, b, this.pouring === b.id);
      H.syrupBottle(g, b.id, b.x + 8, b.y + 8, b.w - 16, b.h - 30, this.pouring === b.id, this.pouring === b.id ? 1 : 0);
      A.text(g, name(b.id), b.x + b.w / 2, b.y + b.h - 13, 14, { color: INK, stroke: null, weight: 600, max: b.w - 8 });
      if (want?.syrup === b.id) dot(g, b);
    }
    // el vaso de trabajo
    if (this.cup) {
      const Gm = H.cup(g, this.cup, L.cupX, L.cupY, L.cupS, { line: true, t: ctx.now });
      if (this.pouring) {
        const b = L.bottles.find((x) => x.id === this.pouring);
        if (b) {
          const sx = b.x + b.w * 0.75, sy = b.y + 22;
          const top = L.cupY - Gm.H * 0.94 * Math.min(this.cup.fill, 1);
          g.strokeStyle = R.byId[this.pouring].color;
          g.lineWidth = 9;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(sx, sy);
          g.quadraticCurveTo((sx + L.cupX) / 2, Math.min(sy, Gm.rimY) - 70, L.cupX, top);
          g.stroke();
        }
      }
    } else {
      const ok = ctx.active && !ctx.active.product;
      const msg = !ctx.orders.length ? t('waitOrder') : ok ? t('hSize', { size: G.t(R.sizeOf(ctx.active.data.size).name).toLowerCase() }) : ctx.active?.product ? t('hasCup') : t('pickTicket');
      if (!ctx.tutorial || !ok) A.para(g, msg, L.cupX, L.cupY - 150, 260, 20, { color: '#7a5a46' });
    }
    // trocitos que vuelan al vaso
    for (const f of this.flying) {
      const k = f.t;
      const x = f.x0 + (L.cupX - f.x0) * k, y = f.y0 + (L.cupY - 60 - f.y0) * k - Math.sin(k * Math.PI) * 80;
      for (let i = 0; i < 3; i++) H.bit(g, f.id, x + (i - 1) * 10, y + (i % 2) * 6, 9, i, 2);
    }
    if (order) ctx.ticket(order, L.tx, L.ty, L.ts, { active: true });
    ctx.btn('send', L.send.x, L.send.y, L.send.w, L.send.h, t('toBlend'), { fill: '#ffd23f', size: 22, on: !!this.cup && this.cup.fill > 0.05, icon: (g, x, y, s) => H.blendIcon(g, x, y, s * 0.9) }, () => this.sendIt(ctx));
    ctx.btn('trash', L.trash.x, L.trash.y, L.trash.w, L.trash.h, a.portrait ? t('trash') : '', { fill: '#ffb4a8', size: 16, on: !!this.cup }, () => this.trashIt(ctx));
    if (!a.portrait) trashIcon(g, L.trash.x + L.trash.w / 2, L.trash.y + L.trash.h / 2, 18);
  },
  down(ctx, p) {
    const L = this.L;
    const sz = L.sizes.find((b) => inRect(p, b));
    if (sz) {
      if (this.cup) {
        ctx.sfx.error();
        return;
      }
      const o = ctx.active;
      if (!o || o.product) {
        ctx.sfx.error();
        return;
      }
      this.cup = ctx.start(R.newCup(sz.id));
      ctx.sfx.drop();
      return;
    }
    const jar = L.jars.find((b) => inRect(p, b));
    if (jar) {
      if (!this.cup) return ctx.sfx.error();
      this.flying.push({ id: jar.id, cup: this.cup, x0: jar.x + jar.w / 2, y0: jar.y + jar.h / 2, t: 0 });
      ctx.sfx.shake();
      return;
    }
    const bot = L.bottles.find((b) => inRect(p, b));
    if (bot) {
      if (!this.cup) return ctx.sfx.error();
      this.pouring = bot.id;
    }
  },
  move(ctx, p) {
    if (this.pouring) {
      const b = this.L.bottles.find((x) => x.id === this.pouring);
      if (!inRect(p, b)) this.pouring = null;
    }
  },
  up() {
    this.pouring = null;
  },
  sendIt(ctx) {
    if (!this.cup) return;
    this.flying = [];
    ctx.send(this.cup, 'blend');
    this.cup = null;
    this.pouring = null;
    const next = ctx.orders.find((o) => !o.product);
    if (next) ctx.select(next);
  },
  trashIt(ctx) {
    if (!this.cup) return;
    ctx.trash(this.cup);
    this.cup = null;
    this.flying = [];
  },
  accept() {},
  badge(ctx) {
    const n = ctx.orders.filter((o) => !o.product).length;
    return n ? { n } : null;
  },
  hint(ctx) {
    const L = this.L;
    const at = (b) => (b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : {});
    if (!this.cup) {
      const o = ctx.active;
      if (!ctx.orders.length) return null;
      if (!o || o.product) return ctx.orders.some((x) => !x.product) ? { text: t('pickTicket'), x: 60, y: 60 } : null;
      return { text: t('hSize', { size: G.t(R.sizeOf(o.data.size).name).toLowerCase() }), ...at(L.sizes.find((b) => b.id === o.data.size)) };
    }
    const w = this.cup.order.data;
    const miss = w.mixes.find((m) => !this.cup.mixes.includes(m) && !this.flying.some((f) => f.id === m));
    if (miss) return { text: t('hMix', { name: name(miss).toLowerCase() }), ...at(L.jars.find((b) => b.id === miss)) };
    if (this.cup.fill < 0.95) return { text: t('hSyrup', { name: name(w.syrup).toLowerCase() }), ...at(L.bottles.find((b) => b.id === w.syrup)) };
    return { text: t('hSend'), x: L.send.x + L.send.w / 2, y: L.send.y };
  },
};

function dot(g, b) {
  A.circle(g, b.x + b.w - 10, b.y + 10, 9);
  A.fillStroke(g, '#5cbf4f', 2.5);
}
function trashIcon(g, x, y, s) {
  A.rr(g, x - s * 0.8, y - s * 0.6, s * 1.6, s * 1.6, s * 0.2);
  A.fillStroke(g, '#8a929e', 2.5);
  A.rr(g, x - s, y - s * 0.95, s * 2, s * 0.35, s * 0.12);
  A.fillStroke(g, '#aab2bc', 2.5);
}

// ---------------------------------------------------------------- Licuado
const blend = {
  id: 'blend',
  label: { es: 'Licuado', en: 'Blend' },
  icon: H.blendIcon,
  init() {
    this.tray = [];
    this.slots = [null, null, null];
    this.focus = null;
  },
  n(ctx) {
    return 2 + ctx.up('licuadora');
  },
  layout(ctx, a) {
    const L = {};
    if (!a.portrait) {
      L.ts = 0.74;
      L.tx = a.x + a.w - 220 * L.ts - 24;
      L.ty = a.y + 16;
      L.trayX = a.x + 30;
      L.trayW = 170;
      L.trayPos = (i) => ({ x: L.trayX + L.trayW / 2, y: a.y + 150 + i * 165 });
      L.trayMax = Math.max(1, Math.floor((a.h - 20) / 165));
      L.bx0 = L.trayX + L.trayW + 40;
      L.bw = L.tx - 30 - L.bx0;
      L.by = a.y + a.h - 30;
      L.bs = Math.min(1.25, (a.h - 120) / 270);
      L.trayS = 0.55;
    } else {
      L.ts = 0.56;
      L.tx = a.x + a.w - 220 * L.ts - 14;
      L.ty = a.y + 12;
      L.bx0 = a.x + 20;
      L.bw = a.w - 40;
      L.bs = Math.min(1.2, (a.h - 470) / 270);
      L.by = a.y + 230 + 270 * L.bs + 40;
      L.trayMax = 4;
      L.trayS = 0.5;
      L.trayPos = (i) => ({ x: a.x + 80 + i * 150, y: Math.min(a.y + a.h - 30, L.by + 200) });
    }
    this.L = L;
  },
  pos(ctx, i) {
    const L = this.L, n = this.n(ctx);
    const step = L.bw / n;
    return { x: L.bx0 + step * (i + 0.5), y: L.by };
  },
  accept(ctx, cup) {
    this.tray.push(cup);
  },
  tick(ctx, dt) {
    let any = false;
    for (const s of this.slots) {
      if (!s) continue;
      any = true;
      const before = s.cup.blend;
      s.cup.blend += dt / R.BLEND_SECS;
      const target = R.byId[s.cup.order.data.blend].v;
      if (before < target - 0.06 && s.cup.blend >= target - 0.06 && ctx.up('alarma')) ctx.sfx.ding();
      if (before < R.BLEND_MAX && s.cup.blend >= R.BLEND_MAX) ctx.sfx.alarm();
    }
    ctx.loop('blend', any && ctx.station === 'blend', 1, 'whirr');
  },
  leave(ctx) {
    ctx.loop('blend', false);
  },
  draw(ctx, g) {
    const a = ctx.area, L = this.L;
    H.parlorWall(g, a);
    H.counterTop(g, a.x - 10, L.by - 8, a.w + 20, a.y + a.h - L.by + 20);
    const n = this.n(ctx);
    for (let i = 0; i < n; i++) {
      const q = this.pos(ctx, i);
      const s = this.slots[i];
      if (s) {
        // el vaso adentro, girando
        g.save();
        g.translate(q.x, q.y - 70 * L.bs);
        H.cup(g, s.cup, 0, 0, L.bs * 0.82, { swirl: true, t: ctx.now, noTop: true, shadow: false });
        g.restore();
      }
      H.blender(g, q.x, q.y, L.bs, !!s, ctx.now);
      const mw = 160 * L.bs, my = q.y - 300 * L.bs;
      if (s) {
        H.blendMeter(g, q.x - mw / 2, my, mw, 24, s.cup.blend, R.byId[s.cup.order.data.blend].v);
        A.text(g, `#${s.cup.order.id}`, q.x, my - 22, 20, { color: INK, stroke: null });
        if (s.cup.blend > R.BLEND_MAX) A.text(g, t('watery'), q.x, q.y - 150 * L.bs, 24, { color: '#ff4f5e' });
        ctx.hit(`bl${i}`, q.x - 75 * L.bs, q.y - 270 * L.bs, 150 * L.bs, 270 * L.bs, () => this.takeOut(ctx, i));
      }
    }
    if (!this.tray.length) A.para(g, t('emptyBlend'), a.portrait ? a.x + a.w / 2 : L.trayX + L.trayW / 2, a.portrait ? L.trayPos(0).y - 60 : a.y + a.h / 2, a.portrait ? a.w - 60 : L.trayW, 19, { color: '#a0708a' });
    this.tray.slice(0, L.trayMax).forEach((cup, i) => {
      const q = L.trayPos(i);
      H.cup(g, cup, q.x, q.y, L.trayS, { noTop: true });
      A.text(g, `#${cup.order.id}`, q.x + 40, q.y - 110 * L.trayS * 1.6, 20, { color: INK, stroke: null });
      ctx.hit(`tr${i}`, q.x - 60, q.y - 150, 120, 160, () => this.load(ctx, i));
    });
    const focus = this.focus && (this.tray.includes(this.focus) || this.slots.some((s) => s?.cup === this.focus)) ? this.focus : this.tray[0] || this.slots.find(Boolean)?.cup;
    if (focus) ctx.ticket(focus.order, L.tx, L.ty, L.ts, { active: true });
  },
  load(ctx, i) {
    const cup = this.tray[i];
    const n = this.n(ctx);
    const slot = this.slots.findIndex((s, k) => k < n && !s);
    this.focus = cup;
    if (slot < 0) {
      ctx.sfx.error();
      ctx.pop(t('hFull'), ctx.area.x + ctx.area.w / 2, ctx.area.y + 40, '#fff', 22);
      return;
    }
    this.tray.splice(i, 1);
    this.slots[slot] = { cup };
    cup.order.where = 'blend';
    ctx.sfx.drop();
  },
  takeOut(ctx, i) {
    const s = this.slots[i];
    if (!s) return;
    this.slots[i] = null;
    s.cup.blended = true;
    this.focus = null;
    ctx.send(s.cup, 'top');
  },
  down() {},
  move() {},
  up() {},
  badge(ctx) {
    const on = this.slots.filter(Boolean);
    const n = this.tray.length + on.length;
    if (!n) return null;
    const ready = on.some((s) => s.cup.blend >= R.byId[s.cup.order.data.blend].v - 0.06);
    return { n, alert: ctx.up('alarma') ? ready : on.some((s) => s.cup.blend > R.BLEND_MAX) };
  },
  hint(ctx) {
    const L = this.L;
    if (this.tray.length) {
      const n = this.n(ctx);
      if (this.slots.slice(0, n).every(Boolean)) return { text: t('hFull'), x: this.pos(ctx, 0).x, y: L.by - 300 * L.bs };
      const q = L.trayPos(0);
      return { text: t('hTray'), x: q.x, y: q.y - 120 };
    }
    const i = this.slots.findIndex(Boolean);
    if (i >= 0) {
      const q = this.pos(ctx, i);
      return { text: t('hBlend'), x: q.x, y: q.y - 300 * L.bs - 8 };
    }
    return null;
  },
};

// ---------------------------------------------------------------- Decorado
const top = {
  id: 'top',
  label: { es: 'Decorado', en: 'Toppings' },
  icon: H.topIcon,
  init() {
    this.queue = [];
    this.cup = null;
    this.tool = null;
    this.hold = null;
    this.shakeT = 0;
  },
  layout(ctx, a) {
    const L = {};
    const creams = R.creamsAt(ctx.rank).map((x) => x.id);
    const sauces = R.drizzlesAt(ctx.rank).map((x) => x.id);
    const shakes = R.sprinklesAt(ctx.rank).map((x) => x.id);
    const garn = R.garnishAt(ctx.rank).map((x) => x.id);
    const tools = [...creams, ...sauces, ...shakes, ...garn];
    if (!a.portrait) {
      L.ts = 0.74;
      L.tx = a.x + a.w - 220 * L.ts - 24;
      L.ty = a.y + 14;
      L.cupS = Math.min(1.45, (a.h - 70) / 300);
      L.cupX = a.x + 150 + (L.tx - 340 - a.x) * 0.3;
      L.cupY = a.y + a.h - 24;
      const gx = L.cupX + 150, gw = L.tx - 30 - gx;
      const cols = Math.max(2, Math.min(5, Math.floor(gw / 96)));
      const rows = Math.ceil(tools.length / cols);
      const ch = Math.min(110, (a.h - 110) / rows - 10);
      L.tools = grid(tools, gx, a.y + 14, Math.min(gw, cols * 108), cols, ch);
      L.qPos = (i) => ({ x: a.x + 62, y: a.y + 150 + i * 150 });
      L.qMax = Math.max(1, Math.floor((a.h - 20) / 150));
      L.send = { x: L.tx, y: a.y + a.h - 84, w: 220 * L.ts, h: 70 };
    } else {
      L.ts = 0.56;
      L.tx = a.x + a.w - 220 * L.ts - 14;
      L.ty = a.y + 12;
      const cols = 4;
      const items = [...tools, 'send'];
      const rows = Math.ceil(items.length / cols);
      const ch = Math.min(96, (a.h * 0.42) / rows - 8);
      const gy = a.y + a.h - rows * (ch + 8) - 4;
      const cells = grid(items, a.x + 12, gy, a.w - 24, cols, ch, 8);
      L.tools = cells.filter((c) => c.id !== 'send');
      L.send = cells.find((c) => c.id === 'send');
      L.cupS = clamp((gy - a.y - 80) / 330, 0.9, 1.6);
      L.cupX = a.x + a.w * 0.45;
      L.cupY = gy - 20;
      L.qMax = 3;
      L.qPos = (i) => ({ x: a.x + 50, y: a.y + 150 + i * 130 });
    }
    this.L = L;
  },
  geom() {
    return H.cupGeom(this.cup.size, this.L.cupX, this.L.cupY, this.L.cupS);
  },
  accept(ctx, cup) {
    if (!this.cup) this.cup = cup;
    else this.queue.push(cup);
  },
  kind(id) {
    if (R.CREAMS.some((x) => x.id === id)) return 'cream';
    if (R.DRIZZLES.some((x) => x.id === id)) return 'drizzle';
    if (R.SPRINKLES.some((x) => x.id === id)) return 'sprinkles';
    return 'garnish';
  },
  tick(ctx, dt) {
    const h = this.hold;
    if (!h || h.from !== 'cup' || !this.cup) return;
    const k = this.kind(this.tool);
    if (k === 'cream') {
      const cup = this.cup;
      const Gm = this.geom();
      const off = clamp((ctx.pointer.x - Gm.x) / Gm.U, -0.9, 0.9);
      if (!cup.cream) cup.cream = { id: this.tool, amt: 0, off, n: 0 };
      cup.cream.amt = Math.min(1.4, cup.cream.amt + dt * 0.55);
      cup.cream.n++;
      cup.cream.off += (off - cup.cream.off) / Math.min(cup.cream.n, 30);
      ctx.loop('cream', true, 0.6, 'pour');
    }
    if (k === 'sprinkles') {
      this.shakeT -= dt;
      if (this.shakeT <= 0) {
        this.shakeT = 0.05;
        const Gm = this.geom();
        const [nx, ny] = H.screenToTop(Gm, ctx.pointer.x, ctx.pointer.y + 10);
        const lay = R.topLayer(this.cup, 'sprinkles', this.tool);
        const r = rng(((this.cup.sp?.length || 0) + 3) * 131);
        this.cup.sp ||= [];
        for (let i = 0; i < 4; i++) {
          const a = r() * TAU, d = Math.sqrt(r()) * 0.4;
          const x = nx + Math.cos(a) * d, y = ny + Math.sin(a) * d;
          if (!R.dome(x, y)) continue;
          this.cup.sp.push({ id: this.tool, x, y, a: r() * TAU, c: H.sprinkleColor(this.tool, r) });
          lay.paint(x, y, 0.09);
        }
        ctx.sfx.shake();
      }
    }
  },
  draw(ctx, g) {
    const a = ctx.area, L = this.L;
    H.parlorWall(g, a);
    H.counterTop(g, a.x - 10, L.cupY - 6, a.w + 20, a.y + a.h - L.cupY + 20);
    const want = this.cup?.order.data;
    for (const b of L.tools) {
      cell(g, b, this.tool === b.id);
      const k = this.kind(b.id);
      const cx = b.x + b.w / 2, cy = b.y + b.h - 22;
      const s = Math.min(b.w, b.h) / 110;
      if (k === 'cream') H.creamCan(g, b.id, cx, cy, s * 0.9, this.tool === b.id);
      else if (k === 'drizzle') H.sauceBottle(g, b.id, cx, cy, s * 0.9, this.tool === b.id);
      else if (k === 'sprinkles') H.shaker(g, b.id, cx, cy, s * 0.9, this.tool === b.id);
      else {
        A.ellipse(g, cx, cy - 6, b.w * 0.34, b.h * 0.14);
        A.fillStroke(g, '#ffe1ec', 2.5);
        for (let i = 0; i < 3; i++) H.bit(g, b.id, cx + (i - 1) * b.w * 0.18, cy - 18 - (i % 2) * 8, 11 * s * 1.5, 0, 2);
      }
      A.text(g, name(b.id), cx, b.y + 13, 13, { color: INK, stroke: null, weight: 600, max: b.w - 8 });
      if (want && (want.cream === b.id || want.drizzle === b.id || want.sprinkles === b.id || want.garnish.some((x) => x.id === b.id))) dot(g, b);
    }
    if (this.cup) {
      const Gm = H.cup(g, this.cup, L.cupX, L.cupY, L.cupS, { t: ctx.now });
      // marcas de dónde va lo de arriba
      if (this.kind(this.tool) === 'garnish' || ctx.up('guia')) {
        for (const pos of ['L', 'C', 'R']) {
          const sp = R.SPOTS[pos];
          const [px, py] = H.topToScreen(Gm, sp.x, sp.y);
          g.save();
          g.setLineDash([5, 6]);
          g.lineWidth = 3;
          g.strokeStyle = 'rgba(160,90,120,.55)';
          A.circle(g, px, py, 18 * L.cupS);
          g.stroke();
          g.restore();
        }
      }
      if (ctx.up('guia') && want?.cream && (!this.cup.cream || this.cup.cream.amt < 0.95)) {
        const h = Gm.U * 1.55;
        g.save();
        g.setLineDash([8, 8]);
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(160,90,120,.5)';
        g.beginPath();
        g.ellipse(Gm.x, Gm.rimY, Gm.U * 1.07, h, 0, Math.PI, TAU);
        g.stroke();
        g.restore();
      }
      // lo que se lleva en la mano
      const p = ctx.pointer;
      const k = this.kind(this.tool);
      if (this.tool && p.x >= 0 && (p.down || !G.prefs.touch)) {
        if (k === 'cream') H.creamCan(g, this.tool, p.x, p.y - 20, 0.7, true);
        else if (k === 'drizzle') H.sauceBottle(g, this.tool, p.x, p.y - 30, 0.7, true);
        else if (k === 'sprinkles') H.shaker(g, this.tool, p.x, p.y - 30, 0.7, true);
        else H.bit(g, this.tool, p.x, p.y, 15 * L.cupS, 0, 3);
      }
      ctx.ticket(this.cup.order, L.tx, L.ty, L.ts, { active: true });
    } else A.para(g, t('emptyTop'), L.cupX, L.cupY - 160, 280, 20, { color: '#a0708a' });
    this.queue.slice(0, L.qMax).forEach((cup, i) => {
      const q = L.qPos(i);
      H.cup(g, cup, q.x, q.y, 0.42, { noTop: false });
      A.text(g, `#${cup.order.id}`, q.x + 34, q.y - 100, 18, { color: INK, stroke: null });
      ctx.hit(`q${i}`, q.x - 40, q.y - 120, 80, 130, () => this.swap(ctx, i));
    });
    ctx.btn('serve', L.send.x, L.send.y, L.send.w, L.send.h, t('serveB'), { fill: '#7ddc6b', size: 24, on: !!this.cup, icon: (g, x, y, s) => H.cupIcon(g, x, y, s * 0.85) }, () => this.serve(ctx));
  },
  swap(ctx, i) {
    const c = this.queue[i];
    this.queue.splice(i, 1);
    if (this.cup) this.queue.unshift(this.cup);
    this.cup = c;
    ctx.sfx.drop();
  },
  serve(ctx) {
    if (!this.cup) return;
    const c = this.cup;
    this.cup = this.queue.shift() || null;
    this.hold = null;
    ctx.loop('cream', false);
    ctx.finish(c);
  },
  overCup(p) {
    if (!this.cup) return false;
    const Gm = this.geom();
    return p.x > Gm.x - Gm.W * 0.9 && p.x < Gm.x + Gm.W * 0.9 && p.y > Gm.rimY - Gm.U * 2.6 && p.y < Gm.rimY + Gm.H * 0.4;
  },
  down(ctx, p) {
    const b = this.L.tools.find((x) => inRect(p, x));
    if (b) {
      this.tool = b.id;
      ctx.sfx.pick();
      this.hold = { from: 'tool' };
      return;
    }
    if (!this.cup || !this.tool || !this.overCup(p)) return;
    this.hold = { from: 'cup', last: null };
    this.apply(ctx, p, true);
  },
  move(ctx, p) {
    if (!this.hold || !this.cup) return;
    if (this.hold.from === 'tool' && this.overCup(p) && this.kind(this.tool) !== 'garnish') this.hold = { from: 'cup', last: null };
    if (this.hold.from === 'cup') this.apply(ctx, p, false);
  },
  up(ctx, p) {
    const h = this.hold;
    this.hold = null;
    ctx.loop('cream', false);
    if (h?.from === 'tool' && this.kind(this.tool) === 'garnish' && this.overCup(p)) this.place(ctx, p);
  },
  apply(ctx, p, first) {
    const k = this.kind(this.tool);
    const Gm = this.geom();
    const [nx, ny] = H.screenToTop(Gm, p.x, p.y);
    if (k === 'drizzle') {
      const lay = R.topLayer(this.cup, 'drizzle', this.tool);
      this.cup.dz ||= [];
      if (first || !this.hold.stroke) {
        this.hold.stroke = { id: this.tool, pts: [] };
        this.cup.dz.push(this.hold.stroke);
      }
      const last = this.hold.stroke.pts[this.hold.stroke.pts.length - 1];
      if (!last || Math.hypot(nx - last[0], ny - last[1]) > 0.04) {
        this.hold.stroke.pts.push([nx, ny]);
        if (last) lay.line(last[0], last[1], nx, ny, 0.1);
        else lay.paint(nx, ny, 0.1);
        ctx.sfx.spread();
      }
    } else if (k === 'garnish' && first) this.place(ctx, p);
  },
  place(ctx, p) {
    const Gm = this.geom();
    const [nx, ny] = H.screenToTop(Gm, p.x, p.y);
    if (ny > 1.1 || Math.abs(nx) > 1.2) return;
    this.cup.garnish.push({ id: this.tool, x: nx, y: ny });
    ctx.sfx.plop();
  },
  badge() {
    const n = (this.cup ? 1 : 0) + this.queue.length;
    return n ? { n } : null;
  },
  hint(ctx) {
    if (!this.cup) return null;
    const L = this.L;
    const w = this.cup.order.data;
    const at = (id) => {
      const b = L.tools.find((x) => x.id === id);
      return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : {};
    };
    const Gm = this.geom();
    const c = this.cup;
    if (w.cream && (!c.cream || c.cream.amt < 0.9)) return this.tool === w.cream ? { text: t('hCream2'), x: Gm.x, y: Gm.rimY - Gm.U } : { text: t('hCream', { name: name(w.cream).toLowerCase() }), ...at(w.cream) };
    if (w.drizzle && (!c.drizzle[w.drizzle] || c.drizzle[w.drizzle].coverage(R.dome) < 0.3)) return { text: t('hDrizzle', { name: name(w.drizzle).toLowerCase() }), ...(this.tool === w.drizzle ? { x: Gm.x, y: Gm.rimY - Gm.U } : at(w.drizzle)) };
    if (w.sprinkles && (!c.sprinkles[w.sprinkles] || c.sprinkles[w.sprinkles].coverage(R.dome) < 0.35)) return { text: t('hSprinkle', { name: name(w.sprinkles).toLowerCase() }), ...(this.tool === w.sprinkles ? { x: Gm.x, y: Gm.rimY - Gm.U } : at(w.sprinkles)) };
    const left = c.garnish.slice();
    for (const gg of w.garnish) {
      const i = left.findIndex((x) => x.id === gg.id);
      if (i >= 0) {
        left.splice(i, 1);
        continue;
      }
      const sp = R.SPOTS[gg.pos];
      const [px, py] = H.topToScreen(Gm, sp.x, sp.y);
      return { text: t('hGarnish', { name: name(gg.id).toLowerCase(), where: t(gg.pos) }), ...(this.tool === gg.id ? { x: px, y: py } : at(gg.id)) };
    }
    return { text: t('hServe'), x: L.send.x + L.send.w / 2, y: L.send.y };
  },
};

// ---------------------------------------------------------------- comanda y producto
function drawTicket(g, order, w, h) {
  const o = order.data;
  const row = (i) => 18 + i * 37;
  // vaso y sabor
  H.cupIcon(g, 26, row(0), 13);
  A.text(g, G.t(R.sizeOf(o.size).name), 46, row(0), 18, { color: INK, stroke: null, align: 'left' });
  A.circle(g, 26, row(1), 11);
  A.fillStroke(g, R.byId[o.syrup].color, 2.5);
  A.text(g, name(o.syrup), 46, row(1), 16, { color: INK, stroke: null, align: 'left', max: w - 56 });
  o.mixes.forEach((m, i) => H.bit(g, m, 26 + i * 30, row(2), 11, 0, 2));
  A.text(g, o.mixes.map(name).join(' + '), 26 + o.mixes.length * 30 - 6, row(2), 13, { color: '#7a5a46', stroke: null, align: 'left', max: w - 30 - o.mixes.length * 30 });
  // punto del licuado
  H.blendMeter(g, 14, row(3) - 9, 120, 18, R.byId[o.blend].v, R.byId[o.blend].v);
  A.text(g, name(o.blend), 142, row(3), 16, { color: INK, stroke: null, align: 'left', max: w - 150 });
  // arriba
  let x = 22;
  if (o.cream) {
    H.creamCan(g, o.cream, x, row(4) + 14, 0.32, false);
    x += 30;
  } else {
    A.text(g, t('noCream'), x - 8, row(4), 13, { color: '#b08a7a', stroke: null, align: 'left' });
    x += 70;
  }
  if (o.drizzle) {
    H.sauceBottle(g, o.drizzle, x, row(4) + 14, 0.32, false);
    x += 30;
  }
  if (o.sprinkles) H.shaker(g, o.sprinkles, x, row(4) + 16, 0.32, false);
  // lo de arriba en su lugar
  const gy = row(5) + 12;
  for (const pos of ['L', 'C', 'R']) {
    const px = w / 2 + R.SPOTS[pos].x * 70, py = gy + R.SPOTS[pos].y * 26;
    A.circle(g, px, py, 15);
    A.fillStroke(g, '#fff0f5', 2);
    const it = o.garnish.find((x) => x.pos === pos);
    if (it) H.bit(g, it.id, px, py, 10, 0, 1.8);
  }
}

function drawProduct(g, cup, x, y, s) {
  if (!cup) return;
  H.cup(g, cup, x, y + s * 0.9, s / 110, { t: 0 });
}

function demoProduct() {
  const c = R.newCup('M');
  c.mixes = ['frutilla', 'chips'];
  R.pour(c, 'frut', 1);
  c.blend = 0.62;
  c.blended = true;
  c.cream = { id: 'crema', amt: 1, off: 0 };
  c.dz = [{ id: 'salsachoco', pts: [[-0.8, 0.3], [-0.4, -0.2], [0, 0.2], [0.4, -0.3], [0.8, 0.2]] }];
  const r = rng(9);
  c.sp = Array.from({ length: 40 }, () => ({ id: 'granas', x: (r() - 0.5) * 1.4, y: 0.1 - r() * 0.9, a: r() * TAU, c: H.sprinkleColor('granas', r) })).filter((p) => R.dome(p.x, p.y));
  c.garnish = [{ id: 'cereza', x: 0, y: -0.7 }];
  return c;
}

// ---------------------------------------------------------------- la definición
run({
  id: 'heladeria',
  title: { es: 'Heladería', en: 'Ice Cream Shop' },
  tagline: { es: 'Licuados helados con crema, salsas, granas y una cereza arriba', en: 'Frozen shakes with cream, sauces, sprinkles and a cherry on top' },
  css: { accent: '#ff5d9e', accent2: '#ffd23f' },
  theme: {
    bg: '#5a2a4a',
    wall: '#fff0f6',
    wall2: '#ffdbe9',
    pattern: 'stripes',
    trim: '#7fd6c0',
    floor: '#fff6f9',
    floor2: '#ff9cc2',
    floorKind: 'checker',
    counter: '#7fd6c0',
    counterTop: '#ffffff',
    frame: '#e86a9e',
    door: '#e86a9e',
    chair: '#7fd6c0',
    sign: '#ff5d9e',
    signText: 'HELADERÍA',
    signInk: '#fffdf4',
    accent: '#ffd23f',
    card: '#fff6fa',
    railBg: 'rgba(90,30,70,.32)',
    tabsBg: 'rgba(90,30,70,.42)',
    sky: '#9ad8ff',
  },
  txt: TXT,
  stations: [build, blend, top],
  makeOrder: (r, ctx) => R.makeOrder(r, ctx.rank),
  drawTicket,
  drawProduct,
  demoProduct,
  grade: (order, cup) => [
    { label: build.label, score: R.buildScore(order.data, cup) },
    { label: blend.label, score: R.blendScore(order.data, cup) },
    { label: top.label, score: R.topScore(order.data, cup) },
  ],
  expected: (order) => R.expected(order.data),
  base: (order) => R.tipBase(order.data),
  unlocks: [
    ...[...R.MIXES, ...R.GARNISH].filter((x) => x.rank > 1).map((x) => ({ rank: x.rank, id: x.id, name: x.name, icon: (g, px, py, s) => H.bit(g, x.id, px, py, s * 0.8, 0, 3) })),
    ...R.SYRUPS.filter((x) => x.rank > 1).map((x) => ({ rank: x.rank, id: x.id, name: { es: `Jarabe de ${x.name.es.toLowerCase()}`, en: `${x.name.en} syrup` }, icon: (g, px, py, s) => H.syrupBottle(g, x.id, px - s * 0.7, py - s * 1.1, s * 1.4, s * 2, false) })),
    ...R.DRIZZLES.filter((x) => x.rank > 1).map((x) => ({ rank: x.rank, id: x.id, name: x.name, icon: (g, px, py, s) => H.sauceBottle(g, x.id, px, py + s, s / 40, false) })),
    ...R.SPRINKLES.map((x) => ({ rank: x.rank, id: x.id, name: x.name, icon: (g, px, py, s) => H.shaker(g, x.id, px, py + s, s / 40, false) })),
    ...R.CREAMS.filter((x) => x.rank > 1).map((x) => ({ rank: x.rank, id: x.id, name: x.name, icon: (g, px, py, s) => H.creamCan(g, x.id, px, py + s, s / 40, false) })),
    ...R.BLENDS.filter((x) => x.rank > 1).map((x) => ({ rank: x.rank, id: x.id, name: { es: `Licuado ${x.name.es.toLowerCase()}`, en: `${x.name.en} blend` }, icon: (g, px, py, s) => H.blendIcon(g, px, py, s) })),
  ],
  upgrades: [
    { id: 'licuadora', name: { es: 'Licuadora extra', en: 'Extra blender' }, desc: { es: 'Licuá tres vasos a la vez.', en: 'Blend three cups at once.' }, cost: 60, max: 1, icon: (g, x, y, s) => H.blendIcon(g, x, y, s) },
    { id: 'alarma', name: { es: 'Timbre de licuadora', en: 'Blender bell' }, desc: { es: 'Suena (y avisa en la pestaña) cuando llega al punto.', en: 'Rings (and flags the tab) when it hits the right blend.' }, cost: 35, max: 1, icon: (g, x, y, s) => bellIcon(g, x, y, s * 0.8) },
    { id: 'bomba', name: { es: 'Bomba con freno', en: 'Slow-stop pump' }, desc: { es: 'El jarabe sale más despacio cerca de la línea.', en: 'Syrup pours slower near the line.' }, cost: 40, max: 1, icon: (g, x, y, s) => H.syrupBottle(g, 'frut', x - s * 0.7, y - s, s * 1.4, s * 2, false) },
    { id: 'guia', name: { es: 'Plantilla de decorado', en: 'Topping guide' }, desc: { es: 'Marca hasta dónde va la crema y dónde va cada cosa.', en: 'Marks how tall the cream goes and where each topping sits.' }, cost: 50, max: 1, icon: (g, x, y, s) => H.topIcon(g, x, y, s) },
  ],
  help: [
    { es: 'Tomá el pedido en el mostrador: la comanda queda arriba.', en: 'Take the order at the counter: the ticket hangs up top.' },
    { es: 'En Armado elegí el vaso, tocá las mezclas que pide y mantené apretado el jarabe hasta la línea roja.', en: 'In Build pick the cup, tap the mix-ins it asks for and hold the syrup until the red line.' },
    { es: 'En Licuado meté el vaso y sacalo cuando la barra esté en la zona verde: grueso, normal o suave.', en: 'In Blend put the cup in and take it out when the bar is in the green zone: chunky, regular or smooth.' },
    { es: 'En Decorado mantené apretada la crema bien al centro, pasá la salsa de lado a lado, sacudí las granas y poné lo de arriba en su lugar.', en: 'In Toppings hold the cream right in the middle, drizzle sauce side to side, shake sprinkles and place the toppings in their spots.' },
    { es: 'Mientras uno se licua, empezá el siguiente: la espera cuenta para la propina.', en: 'While one blends, start the next: waiting counts toward the tip.' },
    { es: 'Teclas: 1 a 4 cambian de estación, Espacio toma el pedido, Esc pausa.', en: 'Keys: 1 to 4 switch stations, Space takes the order, Esc pauses.' },
  ],
});
