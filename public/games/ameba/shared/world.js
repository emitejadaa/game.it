/**
 * Ameba — simulación del mundo (la usan el servidor online y el modo sin conexión).
 *
 * Células que comen puntos de comida y a células más chicas (25 % menos de masa), se dividen,
 * expulsan masa y se vuelven a unir después de un tiempo. Las esporas (virus) revientan a las
 * células grandes y se multiplican si se las alimenta.
 *
 * Todo corre a paso fijo (TPS). Las entidades se buscan con una grilla espacial.
 */
export const TPS = 25;
export const DT = 1 / TPS;

export const CFG = {
  size: 5000,
  food: 1100,
  startMass: 12,
  maxCells: 16,
  minSplit: 36,
  minEject: 36,
  ejectCost: 16,
  ejectMass: 13,
  virusMass: 100,
  virusMin: 16,
  virusMax: 26,
  virusFeeds: 7,
  eatRatio: 1.25,
  mergeBase: 12,
  mergeFactor: 0.016,
  decay: 0.0024,
  decayMin: 160,
  maxCellMass: 22500,
};

export const PALETTE = ['#00f0ff', '#ff2bd6', '#b6ff00', '#ffb800', '#9d6bff', '#ff3b5c', '#3dffa8', '#ff7a2f', '#4d8bff', '#ffe23d', '#ff66a3', '#7dfff2'];
export const FOOD_COLORS = ['#00f0ff', '#ff2bd6', '#b6ff00', '#ffb800', '#9d6bff', '#ff3b5c', '#3dffa8', '#ffe23d'];

export const radius = (m) => Math.sqrt(m) * 7;
export const speedOf = (r) => 850 * Math.pow(r, -0.4);
/** Lado del área visible según la masa total (el cliente usa lo mismo para el zoom). */
export const viewSpan = (mass) => 850 + 60 * Math.sqrt(Math.max(1, mass));

const GRID = 256;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(seed = Date.now()) {
    this.rnd = mulberry(seed);
    this.size = CFG.size;
    this.cols = Math.ceil(this.size / GRID);
    this.tick = 0;
    this.nextId = 1;
    this.players = new Map(); // num → jugador
    this.nextNum = 1;
    this.ents = []; // células, virus y masa expulsada
    this.buckets = Array.from({ length: this.cols * this.cols }, () => []);
    // comida: posiciones por casillero de la grilla
    this.foodX = new Float32Array(CFG.food);
    this.foodY = new Float32Array(CFG.food);
    this.foodB = Array.from({ length: this.cols * this.cols }, () => []);
    this.foodEvents = []; // [slot, x, y, …] reaparecidas en este paso
    this.eatEvents = []; // [comidoId, comedorId, …]
    this.deaths = []; // { num, by }
    for (let i = 0; i < CFG.food; i++) this.placeFood(i, true);
    for (let i = 0; i < CFG.virusMin; i++) this.spawnVirus();
  }

  // ------------------------------------------------------------ utilidades
  bucketOf(x, y) {
    const gx = Math.min(this.cols - 1, Math.max(0, (x / GRID) | 0));
    const gy = Math.min(this.cols - 1, Math.max(0, (y / GRID) | 0));
    return gx + gy * this.cols;
  }

  /** Recorre los casilleros que tocan el rectángulo. */
  range(x0, y0, x1, y1, fn) {
    const c = this.cols;
    const gx0 = Math.max(0, (x0 / GRID) | 0);
    const gy0 = Math.max(0, (y0 / GRID) | 0);
    const gx1 = Math.min(c - 1, (x1 / GRID) | 0);
    const gy1 = Math.min(c - 1, (y1 / GRID) | 0);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) fn(gx + gy * c);
  }

  freeSpot(minDist = 120) {
    for (let tries = 0; tries < 30; tries++) {
      const x = 100 + this.rnd() * (this.size - 200);
      const y = 100 + this.rnd() * (this.size - 200);
      let ok = true;
      for (const e of this.ents) {
        if (e.kind === 2) continue;
        const d = e.r + minDist;
        if ((e.x - x) ** 2 + (e.y - y) ** 2 < d * d) {
          ok = false;
          break;
        }
      }
      if (ok) return [x, y];
    }
    return [100 + this.rnd() * (this.size - 200), 100 + this.rnd() * (this.size - 200)];
  }

  placeFood(i, initial = false) {
    if (!initial) {
      const b = this.foodB[this.bucketOf(this.foodX[i], this.foodY[i])];
      const k = b.indexOf(i);
      if (k >= 0) {
        b[k] = b[b.length - 1];
        b.pop();
      }
    }
    const x = 20 + this.rnd() * (this.size - 40);
    const y = 20 + this.rnd() * (this.size - 40);
    this.foodX[i] = x;
    this.foodY[i] = y;
    this.foodB[this.bucketOf(x, y)].push(i);
    if (!initial) this.foodEvents.push(i, Math.round(x), Math.round(y));
  }

  newEnt(kind, x, y, m, owner) {
    const e = { id: this.nextId, kind, x, y, m, r: radius(m), vx: 0, vy: 0, owner, mergeAt: 0, born: this.tick, dead: false, feeds: 0, color: 0 };
    this.nextId = (this.nextId % 1048575) + 1;
    this.ents.push(e);
    return e;
  }

  spawnVirus(x, y, vx = 0, vy = 0) {
    if (x === undefined) [x, y] = this.freeSpot(160);
    const v = this.newEnt(1, x, y, CFG.virusMass, -1);
    v.vx = vx;
    v.vy = vy;
    return v;
  }

  // ------------------------------------------------------------ jugadores
  addPlayer({ id = null, name = '', color = 0, bot = null } = {}) {
    const p = { num: this.nextNum++, id, name, color, bot, cells: [], alive: false, tx: 0, ty: 0, eject: false, splits: 0, lastEject: 0, stats: null, lastX: this.size / 2, lastY: this.size / 2, lastMass: CFG.startMass, deadAt: 0 };
    this.players.set(p.num, p);
    return p;
  }

  removePlayer(num) {
    const p = this.players.get(num);
    if (!p) return;
    for (const c of p.cells) c.dead = true;
    p.cells = [];
    this.players.delete(num);
  }

  spawn(num, mass = CFG.startMass) {
    const p = this.players.get(num);
    if (!p) return;
    for (const c of p.cells) c.dead = true;
    const [x, y] = this.freeSpot(260);
    const c = this.newEnt(0, x, y, mass, num);
    p.cells = [c];
    p.alive = true;
    p.tx = x;
    p.ty = y;
    p.stats = { born: this.tick, maxMass: mass, eaten: 0, food: 0, kills: 0 };
  }

  setInput(num, tx, ty, eject) {
    const p = this.players.get(num);
    if (!p) return;
    p.tx = Math.max(-500, Math.min(this.size + 500, tx));
    p.ty = Math.max(-500, Math.min(this.size + 500, ty));
    p.eject = !!eject;
  }

  split(num) {
    const p = this.players.get(num);
    if (p && p.alive && p.splits < 4) p.splits++;
  }

  mass(p) {
    let m = 0;
    for (const c of p.cells) m += c.m;
    return m;
  }

  centroid(p) {
    let x = 0;
    let y = 0;
    let m = 0;
    for (const c of p.cells) {
      x += c.x * c.m;
      y += c.y * c.m;
      m += c.m;
    }
    return m ? [x / m, y / m] : [p.lastX, p.lastY];
  }

  // ------------------------------------------------------------ acciones
  doSplit(p) {
    const cells = p.cells.slice().sort((a, b) => b.m - a.m);
    for (const c of cells) {
      if (p.cells.length >= CFG.maxCells) break;
      if (c.m < CFG.minSplit) continue;
      const half = c.m / 2;
      c.m = half;
      c.r = radius(half);
      let dx = p.tx - c.x;
      let dy = p.ty - c.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const n = this.newEnt(0, c.x + dx * c.r * 0.2, c.y + dy * c.r * 0.2, half, p.num);
      const boost = 1100 + n.r * 2;
      n.vx = dx * boost;
      n.vy = dy * boost;
      const wait = (CFG.mergeBase + CFG.mergeFactor * half) * TPS;
      c.mergeAt = this.tick + wait;
      n.mergeAt = this.tick + wait;
      p.cells.push(n);
    }
  }

  doEject(p) {
    for (const c of p.cells) {
      if (c.m < CFG.minEject) continue;
      let dx = p.tx - c.x;
      let dy = p.ty - c.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      // pequeña dispersión, como un chorro
      const a = (this.rnd() - 0.5) * 0.3;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const ex = dx * cs - dy * sn;
      const ey = dx * sn + dy * cs;
      c.m -= CFG.ejectCost;
      c.r = radius(c.m);
      const e = this.newEnt(2, c.x + ex * (c.r + 14), c.y + ey * (c.r + 14), CFG.ejectMass, -2);
      e.color = p.color;
      e.from = p.num;
      e.vx = ex * 1250;
      e.vy = ey * 1250;
    }
  }

  explode(c, p) {
    const free = CFG.maxCells - p.cells.length;
    if (free <= 0) return;
    const give = c.m / 2;
    const n = Math.min(free, Math.floor(give / 12), 15);
    if (n < 1) return;
    const piece = give / n;
    c.m -= give;
    c.r = radius(c.m);
    const wait = (CFG.mergeBase + CFG.mergeFactor * c.m) * TPS;
    c.mergeAt = this.tick + wait;
    const a0 = this.rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const e = this.newEnt(0, c.x, c.y, piece, p.num);
      const boost = 700 + this.rnd() * 300;
      e.vx = Math.cos(a) * boost;
      e.vy = Math.sin(a) * boost;
      e.mergeAt = this.tick + wait;
      p.cells.push(e);
    }
  }

  // ------------------------------------------------------------ paso
  step() {
    this.tick++;
    const size = this.size;
    const damp = Math.exp(-5.2 * DT);

    // acciones de los jugadores
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      while (p.splits > 0) {
        p.splits--;
        this.doSplit(p);
      }
      if (p.eject && this.tick - p.lastEject >= 3) {
        p.lastEject = this.tick;
        this.doEject(p);
      }
    }

    // movimiento
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.kind === 0) {
        const p = this.players.get(e.owner);
        if (p) {
          const dx = p.tx - e.x;
          const dy = p.ty - e.y;
          const d = Math.hypot(dx, dy);
          if (d > 1) {
            const v = speedOf(e.r) * Math.min(1, d / (e.r * 0.5 + 40));
            e.x += (dx / d) * v * DT;
            e.y += (dy / d) * v * DT;
          }
        }
        // decaimiento de las células grandes
        if (e.m > CFG.decayMin) {
          e.m -= e.m * CFG.decay * DT;
          e.r = radius(e.m);
        }
      }
      if (e.vx || e.vy) {
        e.x += e.vx * DT;
        e.y += e.vy * DT;
        e.vx *= damp;
        e.vy *= damp;
        if (Math.abs(e.vx) + Math.abs(e.vy) < 4) e.vx = e.vy = 0;
      }
      const pad = e.kind === 0 ? e.r * 0.5 : e.r;
      if (e.x < pad) {
        e.x = pad;
        if (e.kind !== 0) e.vx = Math.abs(e.vx);
      } else if (e.x > size - pad) {
        e.x = size - pad;
        if (e.kind !== 0) e.vx = -Math.abs(e.vx);
      }
      if (e.y < pad) {
        e.y = pad;
        if (e.kind !== 0) e.vy = Math.abs(e.vy);
      } else if (e.y > size - pad) {
        e.y = size - pad;
        if (e.kind !== 0) e.vy = -Math.abs(e.vy);
      }
    }

    // grilla
    for (const b of this.buckets) b.length = 0;
    for (const e of this.ents) if (!e.dead) this.buckets[this.bucketOf(e.x, e.y)].push(e);

    // células propias: se empujan hasta que pueden unirse, y se unen
    for (const p of this.players.values()) {
      const cs = p.cells;
      if (cs.length < 2) continue;
      for (let i = 0; i < cs.length; i++) {
        const a = cs[i];
        if (a.dead) continue;
        for (let j = i + 1; j < cs.length; j++) {
          const b = cs[j];
          if (b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const sum = a.r + b.r;
          if (d >= sum) continue;
          const canMerge = this.tick >= a.mergeAt && this.tick >= b.mergeAt;
          if (canMerge) {
            if (d < Math.max(a.r, b.r) * 0.72) {
              const [big, small] = a.m >= b.m ? [a, b] : [b, a];
              big.m += small.m;
              big.r = radius(big.m);
              small.dead = true;
              this.eatEvents.push(small.id, big.id);
            }
            continue;
          }
          // separación suave (las recién divididas vuelan libres un instante)
          if (Math.abs(a.vx) + Math.abs(a.vy) + Math.abs(b.vx) + Math.abs(b.vy) > 420) continue;
          const push = (sum - d) * 0.45;
          const wa = b.m / (a.m + b.m);
          const wb = 1 - wa;
          a.x -= (dx / d) * push * wa;
          a.y -= (dy / d) * push * wa;
          b.x += (dx / d) * push * wb;
          b.y += (dy / d) * push * wb;
        }
      }
    }

    // comer comida, masa expulsada, virus y otras células
    const eaters = this.ents.filter((e) => e.kind === 0 && !e.dead).sort((a, b) => b.m - a.m);
    for (const a of eaters) {
      if (a.dead) continue;
      const p = this.players.get(a.owner);
      if (!p) continue;
      const r = a.r;
      // comida
      this.range(a.x - r, a.y - r, a.x + r, a.y + r, (bi) => {
        const list = this.foodB[bi];
        for (let k = list.length - 1; k >= 0; k--) {
          const i = list[k];
          const dx = this.foodX[i] - a.x;
          const dy = this.foodY[i] - a.y;
          if (dx * dx + dy * dy < r * r) {
            a.m += 1;
            p.stats.food++;
            this.placeFood(i);
          }
        }
      });
      a.r = radius(a.m);
      // entidades
      this.range(a.x - r, a.y - r, a.x + r, a.y + r, (bi) => {
        for (const b of this.buckets[bi]) {
          if (b === a || b.dead || a.dead) continue;
          if (b.kind === 0 && b.owner === a.owner) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (b.kind === 2) {
            // masa expulsada: la propia recién lanzada no se come de vuelta
            if (b.from === a.owner && this.tick - b.born < 8) continue;
            if (a.m < CFG.ejectMass * CFG.eatRatio) continue;
            if (d2 < (a.r - b.r * 0.3) ** 2) {
              a.m += b.m;
              b.dead = true;
              this.eatEvents.push(b.id, a.id);
            }
            continue;
          }
          if (a.m < b.m * CFG.eatRatio) continue;
          const reach = a.r - b.r * 0.4;
          if (reach <= 0 || d2 > reach * reach) continue;
          a.m += b.m;
          b.dead = true;
          this.eatEvents.push(b.id, a.id);
          if (b.kind === 1) {
            a.r = radius(a.m);
            this.explode(a, p);
          } else {
            p.stats.eaten++;
            const victim = this.players.get(b.owner);
            if (victim) {
              victim.cells = victim.cells.filter((c) => !c.dead);
              if (!victim.cells.length) {
                p.stats.kills++;
                victim.lastBy = p.num;
              }
            }
          }
        }
      });
      if (a.m > CFG.maxCellMass) a.m = CFG.maxCellMass;
      a.r = radius(a.m);
    }

    // virus: se alimentan con masa expulsada y se multiplican
    for (const v of this.ents) {
      if (v.dead || v.kind !== 1) continue;
      this.range(v.x - v.r, v.y - v.r, v.x + v.r, v.y + v.r, (bi) => {
        for (const b of this.buckets[bi]) {
          if (b.dead || b.kind !== 2) continue;
          const d2 = (b.x - v.x) ** 2 + (b.y - v.y) ** 2;
          if (d2 > v.r * v.r) continue;
          b.dead = true;
          this.eatEvents.push(b.id, v.id);
          v.feeds++;
          v.m += CFG.ejectMass * 0.6;
          v.r = radius(v.m);
          if (v.feeds >= CFG.virusFeeds) {
            v.feeds = 0;
            v.m = CFG.virusMass;
            v.r = radius(v.m);
            const s = Math.hypot(b.vx, b.vy) || 1;
            const count = this.ents.reduce((n, e) => n + (e.kind === 1 && !e.dead ? 1 : 0), 0);
            if (count < CFG.virusMax) this.spawnVirus(v.x, v.y, (b.vx / s) * 1000, (b.vy / s) * 1000);
          }
        }
      });
    }

    // limpieza y muertes
    let viruses = 0;
    this.ents = this.ents.filter((e) => {
      if (e.dead) return false;
      if (e.kind === 1) viruses++;
      return true;
    });
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.cells = p.cells.filter((c) => !c.dead);
      if (!p.cells.length) {
        p.alive = false;
        p.deadAt = this.tick;
        this.deaths.push({ num: p.num, by: p.lastBy || 0, stats: { ...p.stats, time: (this.tick - p.stats.born) / TPS } });
        p.lastBy = 0;
        continue;
      }
      const m = this.mass(p);
      p.lastMass = m;
      if (m > p.stats.maxMass) p.stats.maxMass = m;
      [p.lastX, p.lastY] = this.centroid(p);
    }
    if (viruses < CFG.virusMin && this.tick % 50 === 0) this.spawnVirus();
  }

  /** Clasificación (masa total) de los vivos. */
  leaderboard(n = 10) {
    const list = [];
    for (const p of this.players.values()) if (p.alive) list.push([p.num, Math.round(this.mass(p))]);
    list.sort((a, b) => b[1] - a[1]);
    return list.slice(0, n);
  }

  /** Entidades visibles para un jugador, en formato plano [id, x, y, r, código, …]. */
  view(p, out = []) {
    const [cx, cy] = p.alive ? this.centroid(p) : [p.lastX, p.lastY];
    const half = viewSpan(p.alive ? this.mass(p) : p.lastMass) * 0.62 + 200;
    this.range(cx - half, cy - half, cx + half, cy + half, (bi) => {
      for (const e of this.buckets[bi]) {
        if (e.dead) continue;
        const code = e.kind === 0 ? e.owner : e.kind === 1 ? -1 : -2 - e.color;
        out.push(e.id, Math.round(e.x), Math.round(e.y), Math.round(e.r), code);
      }
    });
    return out;
  }

  foodList() {
    const out = new Array(CFG.food * 2);
    for (let i = 0; i < CFG.food; i++) {
      out[i * 2] = Math.round(this.foodX[i]);
      out[i * 2 + 1] = Math.round(this.foodY[i]);
    }
    return out;
  }
}
