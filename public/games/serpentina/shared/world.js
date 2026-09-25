/**
 * Serpentina — simulación (servidor online y modo sin conexión).
 *
 * Serpientes que avanzan siempre, giran hacia donde apunta el jugador (más lento cuanto más
 * grandes), aceleran gastando largo, crecen comiendo orbes y mueren si su cabeza toca el cuerpo
 * de otra o el borde. Al morir se deshacen en orbes grandes.
 *
 * El cuerpo es el rastro de la cabeza muestreado cada `spacing` unidades; así el cliente lo puede
 * reconstruir recibiendo solo la cabeza en cada paso.
 */
export const TPS = 25;
export const DT = 1 / TPS;

export const CFG = {
  radius: 3200,
  foodTarget: 3000,
  chunk: 400,
  startMass: 10,
  speed: 230,
  boost: 480,
  minBoost: 12,
  eatReach: 14,
};

export const PALETTE = ['#00f0ff', '#ff2bd6', '#b6ff00', '#ffb800', '#9d6bff', '#ff3b5c', '#3dffa8', '#ff7a2f', '#4d8bff', '#ffe23d', '#ff66a3', '#7dfff2'];

export const bodyR = (m) => 8 + 1.6 * Math.pow(m, 0.45);
export const segments = (m) => Math.floor(8 + 3 * Math.pow(m, 0.6));
export const spacing = (m) => bodyR(m) * 0.55;
export const turnRate = (m) => 4.8 * (1 + 120 / (m + 120)) * 0.5;
export const viewSpan = (m) => 1100 + 32 * Math.sqrt(Math.max(1, m));
export const foodR = (v) => 3.5 + Math.sqrt(v) * 2.6;

/**
 * Agrega al rastro los puntos que dejó la cabeza al llegar a (x, y) y recorta la cola.
 * Devuelve cuántos puntos se sacaron de la cola (para que las rayas del dibujo no se deslicen).
 */
export function grow(pts, x, y, m) {
  const S = spacing(m);
  let n = pts.length;
  let lx = pts[n - 2];
  let ly = pts[n - 1];
  let dx = x - lx;
  let dy = y - ly;
  let d = Math.hypot(dx, dy);
  let guard = 0;
  while (d >= S && guard++ < 40) {
    lx += (dx / d) * S;
    ly += (dy / d) * S;
    pts.push(lx, ly);
    dx = x - lx;
    dy = y - ly;
    d = Math.hypot(dx, dy);
  }
  const extra = pts.length / 2 - segments(m);
  if (extra > 0) {
    pts.splice(0, extra * 2);
    return extra;
  }
  return 0;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q = (v) => Math.round(v * 10) / 10;

const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class World {
  constructor(seed = Date.now()) {
    this.rnd = mulberry(seed);
    this.R = CFG.radius;
    this.tick = 0;
    this.nextId = 1;
    this.nextFood = 1;
    this.nextNum = 1;
    this.players = new Map();
    this.snakes = new Map(); // id → serpiente viva
    const span = this.R * 2;
    this.cols = Math.ceil(span / CFG.chunk);
    this.chunks = Array.from({ length: this.cols * this.cols }, () => new Map());
    this.foodCount = 0;
    this.events = new Map(); // chunk → { add: [], rem: [] } de este paso
    this.deaths = [];
    for (let i = 0; i < CFG.foodTarget; i++) this.spawnFood();
    this.events.clear();
  }

  // ------------------------------------------------------------ comida
  chunkOf(x, y) {
    const gx = Math.min(this.cols - 1, Math.max(0, Math.floor((x + this.R) / CFG.chunk)));
    const gy = Math.min(this.cols - 1, Math.max(0, Math.floor((y + this.R) / CFG.chunk)));
    return gx + gy * this.cols;
  }

  ev(ch) {
    let e = this.events.get(ch);
    if (!e) this.events.set(ch, (e = { add: [], rem: [] }));
    return e;
  }

  addFood(x, y, v, c) {
    const lim = this.R - 30;
    const d = Math.hypot(x, y);
    if (d > lim) {
      x *= lim / d;
      y *= lim / d;
    }
    const ch = this.chunkOf(x, y);
    const f = { id: this.nextFood, x, y, v, c, ch };
    this.nextFood = (this.nextFood % 16777215) + 1;
    this.chunks[ch].set(f.id, f);
    this.foodCount++;
    this.ev(ch).add.push(f.id, Math.round(x), Math.round(y), Math.round(v * 10), c);
    return f;
  }

  removeFood(f, by = 0) {
    if (!this.chunks[f.ch].delete(f.id)) return;
    this.foodCount--;
    this.ev(f.ch).rem.push(f.id, by);
  }

  spawnFood() {
    const a = this.rnd() * Math.PI * 2;
    const r = Math.sqrt(this.rnd()) * (this.R - 60);
    const v = this.rnd() < 0.08 ? 2 + this.rnd() * 2 : 0.6 + this.rnd() * 0.9;
    this.addFood(Math.cos(a) * r, Math.sin(a) * r, v, Math.floor(this.rnd() * PALETTE.length));
  }

  // ------------------------------------------------------------ jugadores
  addPlayer({ id = null, name = '', color = 0, bot = null } = {}) {
    const p = { num: this.nextNum++, id, name, color, bot, snake: null, alive: false, tx: 1, ty: 0, boost: false, lastX: 0, lastY: 0, lastM: CFG.startMass, deadAt: 0, stats: null };
    this.players.set(p.num, p);
    return p;
  }

  removePlayer(num) {
    const p = this.players.get(num);
    if (!p) return;
    if (p.snake) this.kill(p.snake, 0, false);
    this.players.delete(num);
  }

  spawn(num, mass = CFG.startMass) {
    const p = this.players.get(num);
    if (!p) return;
    if (p.snake) this.kill(p.snake, 0, false);
    // lugar libre, no muy cerca del borde
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rnd() * Math.PI * 2;
      const r = Math.sqrt(this.rnd()) * (this.R * 0.8);
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
      let ok = true;
      for (const s of this.snakes.values()) {
        if (x > s.bx0 - 300 && x < s.bx1 + 300 && y > s.by0 - 300 && y < s.by1 + 300) {
          ok = false;
          break;
        }
      }
      if (ok) break;
    }
    const a = Math.atan2(-y, -x) + (this.rnd() - 0.5); // mirando más o menos al centro
    const s = { id: this.nextId, num, x, y, a, m: mass, boosting: false, lost: 0, pts: [], color: p.color, dead: false, born: this.tick, bx0: x, by0: y, bx1: x, by1: y };
    this.nextId = (this.nextId % 16777215) + 1;
    const S = spacing(mass);
    const n = segments(mass);
    x = q(x);
    y = q(y);
    s.x = x;
    s.y = y;
    for (let i = n; i >= 1; i--) s.pts.push(q(x - Math.cos(a) * S * i), q(y - Math.sin(a) * S * i));
    this.snakes.set(s.id, s);
    p.snake = s;
    p.alive = true;
    p.tx = Math.cos(a);
    p.ty = Math.sin(a);
    p.stats = { born: this.tick, maxM: mass, kills: 0 };
    this.bbox(s);
  }

  /** Dirección deseada (vector) y turbo. */
  setInput(num, dx, dy, boost) {
    const p = this.players.get(num);
    if (!p) return;
    if (dx || dy) {
      p.tx = dx;
      p.ty = dy;
    }
    p.boost = !!boost;
  }

  bbox(s) {
    let x0 = s.x;
    let x1 = s.x;
    let y0 = s.y;
    let y1 = s.y;
    const pts = s.pts;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < x0) x0 = x;
      else if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      else if (y > y1) y1 = y;
    }
    const r = bodyR(s.m);
    s.bx0 = x0 - r;
    s.bx1 = x1 + r;
    s.by0 = y0 - r;
    s.by1 = y1 + r;
  }

  kill(s, by, drop = true) {
    if (s.dead) return;
    s.dead = true;
    this.snakes.delete(s.id);
    const p = this.players.get(s.num);
    if (p && p.snake === s) {
      p.snake = null;
      p.alive = false;
      p.deadAt = this.tick;
      p.lastX = s.x;
      p.lastY = s.y;
      p.lastM = s.m;
      if (drop) this.deaths.push({ num: s.num, id: s.id, by, stats: { ...p.stats, length: Math.round(s.m * 10), time: (this.tick - p.stats.born) / TPS } });
    }
    if (!drop) return;
    // el cuerpo se deshace en orbes
    const pts = s.pts;
    const count = Math.max(4, Math.min(160, Math.floor(pts.length / 2 / 1.5)));
    const each = Math.max(0.8, (s.m * 0.75) / count);
    const step = Math.max(2, Math.floor(pts.length / 2 / count)) * 2;
    const r = bodyR(s.m);
    for (let i = pts.length - 2; i >= 0; i -= step) {
      const jx = (this.rnd() - 0.5) * r;
      const jy = (this.rnd() - 0.5) * r;
      this.addFood(pts[i] + jx, pts[i + 1] + jy, each * (0.7 + this.rnd() * 0.6), this.rnd() < 0.75 ? s.color : Math.floor(this.rnd() * PALETTE.length));
    }
  }

  // ------------------------------------------------------------ paso
  step() {
    this.tick++;
    const R = this.R;
    // movimiento
    for (const s of this.snakes.values()) {
      const p = this.players.get(s.num);
      const want = Math.atan2(p.ty, p.tx);
      const diff = wrapAngle(want - s.a);
      const maxTurn = turnRate(s.m) * DT;
      s.a = wrapAngle(s.a + Math.max(-maxTurn, Math.min(maxTurn, diff)));
      s.boosting = p.boost && s.m > CFG.minBoost;
      const v = s.boosting ? CFG.boost : CFG.speed;
      // posiciones y masa con un decimal: el cliente recibe exactamente lo mismo y reconstruye
      // el mismo cuerpo
      s.x = q(s.x + Math.cos(s.a) * v * DT);
      s.y = q(s.y + Math.sin(s.a) * v * DT);
      if (s.boosting) {
        // el turbo cuesta largo y deja orbes atrás
        const loss = (2.2 + s.m * 0.006) * DT;
        s.m -= loss;
        s.lost += loss;
        if (s.lost >= 1.2) {
          this.addFood(s.pts[0] + (this.rnd() - 0.5) * 6, s.pts[1] + (this.rnd() - 0.5) * 6, s.lost * 0.75, s.color);
          s.lost = 0;
        }
      }
    }

    // comer
    for (const s of this.snakes.values()) {
      const reach = bodyR(s.m) + CFG.eatReach;
      const x0 = s.x - reach - 20;
      const x1 = s.x + reach + 20;
      const y0 = s.y - reach - 20;
      const y1 = s.y + reach + 20;
      const gx0 = Math.max(0, Math.floor((x0 + R) / CFG.chunk));
      const gx1 = Math.min(this.cols - 1, Math.floor((x1 + R) / CFG.chunk));
      const gy0 = Math.max(0, Math.floor((y0 + R) / CFG.chunk));
      const gy1 = Math.min(this.cols - 1, Math.floor((y1 + R) / CFG.chunk));
      for (let gy = gy0; gy <= gy1; gy++)
        for (let gx = gx0; gx <= gx1; gx++) {
          for (const f of this.chunks[gx + gy * this.cols].values()) {
            const rr = reach + foodR(f.v);
            if ((f.x - s.x) ** 2 + (f.y - s.y) ** 2 < rr * rr) {
              s.m += f.v;
              this.removeFood(f, s.id);
            }
          }
        }
      s.m = q(s.m);
      s.trim = grow(s.pts, s.x, s.y, s.m);
      this.bbox(s);
      const p = this.players.get(s.num);
      if (s.m > p.stats.maxM) p.stats.maxM = s.m;
    }

    // choques: cabeza contra cuerpo ajeno o contra el borde
    const list = [...this.snakes.values()];
    const dead = [];
    for (const s of list) {
      const hr = bodyR(s.m);
      if (Math.hypot(s.x, s.y) > R - hr * 0.6) {
        dead.push([s, 0]);
        continue;
      }
      for (const o of list) {
        if (o === s) continue;
        if (s.x < o.bx0 - hr || s.x > o.bx1 + hr || s.y < o.by0 - hr || s.y > o.by1 + hr) continue;
        const or = bodyR(o.m);
        const lim = (hr * 0.72 + or * 0.85) ** 2;
        const pts = o.pts;
        let hit = (o.x - s.x) ** 2 + (o.y - s.y) ** 2 < lim;
        for (let i = 0; i < pts.length && !hit; i += 2) {
          const dx = pts[i] - s.x;
          const dy = pts[i + 1] - s.y;
          if (dx * dx + dy * dy < lim) hit = true;
        }
        if (hit) {
          dead.push([s, o.num]);
          break;
        }
      }
    }
    for (const [s, by] of dead) {
      const killer = this.players.get(by);
      if (killer?.stats && killer.snake) killer.stats.kills++;
      this.kill(s, by);
    }

    // comida natural
    if (this.foodCount < CFG.foodTarget) for (let i = 0; i < 6; i++) this.spawnFood();
    for (const p of this.players.values()) {
      if (p.snake) {
        p.lastX = p.snake.x;
        p.lastY = p.snake.y;
        p.lastM = p.snake.m;
      }
    }
  }

  leaderboard(n = 10) {
    const out = [];
    for (const s of this.snakes.values()) out.push([s.num, Math.round(s.m * 10), Math.round(s.x), Math.round(s.y)]);
    out.sort((a, b) => b[1] - a[1]);
    return out.slice(0, n);
  }
}
