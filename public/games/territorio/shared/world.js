/**
 * Territorio — simulación (la usan el servidor online y el modo sin conexión; todo entero y determinista).
 *
 * Grilla de 120×120. Cada jugador nace con un territorio de 5×5. Una celda por paso (10 pasos/s), sin vuelta
 * en U. Mientras estás adentro de tu territorio no pasa nada; al salir dejás estela. Si volvés a tu territorio
 * se captura lo encerrado: se rellena desde afuera del rectángulo envolvente (territorio + estela, ampliado en 1)
 * y lo que el relleno no alcanza es tuyo (la estela también).
 *
 * Muertes (el territorio del que muere queda neutral):
 *  - alguien pisa tu estela: muerís y el KO es de quien la cruzó (aunque tu cabeza esté lejos);
 *  - pisás tu propia estela, o te vas del mapa estando afuera (adentro de tu territorio la pared solo te frena);
 *  - cabeza contra cabeza afuera de los territorios: mueren los dos; si la celda es de uno de los dos, ese gana;
 *  - te sacan todo el territorio (el KO es de quien lo capturó).
 *
 * Mismo código en el cliente: `turnTo`, `applyInputs`, `enclosed` y `trailCells` son las funciones que usa la
 * predicción de la cabeza y de la captura propias.
 *
 * Direcciones: 0 arriba, 1 derecha, 2 abajo, 3 izquierda. La estela de un jugador es la poligonal `verts`
 * (la celda propia de la que salió + cada esquina donde dobló, en celdas) más la cabeza; `p.trail` son las celdas.
 */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export const CFG = {
  size: 120,
  tps: 10,
  start: 5, // lado del territorio inicial
  respawnSec: 3,
  view: 40, // mitad del cuadro de interés (celdas) alrededor de la cabeza propia
  viewKeep: 48, // un jugador ya visto se sigue mandando hasta esta distancia (histéresis)
  chunk: 8, // la ventana de territorio se alinea a bloques de 8×8
  mini: 3, // celdas por celda del minimapa que manda el servidor
  inboxMax: 8,
  kPast: 6, // una entrada puede venir fechada hasta 6 pasos atrás o adelante
  kAhead: 6,
};

export const PALETTE = ['#00f0ff', '#ff2bd6', '#b6ff00', '#ffb800', '#9d6bff', '#ff3b5c', '#3dffa8', '#ff7a2f', '#4d8bff', '#ffe23d', '#ff66a3', '#7dfff2'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- funciones puras (también las usa el cliente)
/** ¿Se puede doblar de `cur` a `d`? (ni vuelta en U ni "doblar" hacia donde ya va) */
export const legalTurn = (cur, d) => Number.isInteger(d) && d >= 0 && d <= 3 && d !== cur && d !== ((cur + 2) & 3);

/** Dobla si el giro es legal. Afuera del territorio deja una esquina en la estela. */
export function turnTo(p, d) {
  if (!legalTurn(p.dir, d)) return false;
  if (p.out) p.verts.push(p.x, p.y);
  p.dir = d;
  return true;
}

/**
 * Aplica las entradas pendientes ({ s: seq, k: paso, d: dirección }) que ya les toca (k <= tick), en orden y
 * sin repetir (s <= p.seq). Como máximo un giro por paso: las que siguen esperan al paso siguiente.
 */
export function applyInputs(p, list, tick) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.s <= p.seq) continue;
    if (e.k > tick) break;
    p.seq = e.s;
    if (e.d >= 0 && turnTo(p, e.d)) return;
  }
}

/**
 * Celdas de una estela: recorre la poligonal verts[0..1] → … → (ex, ey) sin contar la celda de salida (que es
 * territorio) y contando la última. Se escribe en `out` como índices y se devuelve.
 */
export function trailCells(verts, ex, ey, n, out = []) {
  out.length = 0;
  if (verts.length < 2) return out;
  let cx = verts[0];
  let cy = verts[1];
  const go = (tx, ty) => {
    const sx = Math.sign(tx - cx);
    const sy = Math.sign(ty - cy);
    while (cx !== tx || cy !== ty) {
      cx += sx;
      cy += sy;
      out.push(cy * n + cx);
    }
  };
  for (let i = 2; i < verts.length; i += 2) go(verts[i], verts[i + 1]);
  go(ex, ey);
  return out;
}

let scr = { mark: new Uint8Array(0), stack: new Int32Array(0) };

/**
 * Celdas encerradas por el territorio de `num` (la estela ya tiene que estar convertida en territorio):
 * rellena desde afuera de `bb` = [x0, y0, x1, y1] (rectángulo envolvente del territorio, ampliado en 1) y lo que
 * queda sin alcanzar y no es de `num` está encerrado. Se escribe en `out` (índices) y se devuelve.
 * Costo O(área del rectángulo): a lo sumo ~14 400 celdas en el mapa de 120×120.
 */
export function enclosed(owner, n, num, bb, out = []) {
  out.length = 0;
  const x0 = bb[0] - 1;
  const y0 = bb[1] - 1;
  const W = bb[2] - bb[0] + 3;
  const H = bb[3] - bb[1] + 3;
  const size = W * H;
  if (scr.mark.length < size) scr = { mark: new Uint8Array(size), stack: new Int32Array(size) };
  const { mark, stack } = scr;
  mark.fill(0, 0, size);
  // 1 = territorio de `num` (barrera); la corona de afuera (índices fuera del mapa) queda libre
  for (let ly = 1; ly < H - 1; ly++) {
    const gy = y0 + ly;
    if (gy < 0 || gy >= n) continue;
    const row = gy * n;
    for (let lx = 1; lx < W - 1; lx++) {
      const gx = x0 + lx;
      if (gx >= 0 && gx < n && owner[row + gx] === num) mark[ly * W + lx] = 1;
    }
  }
  // 2 = alcanzable desde afuera (relleno de 4 vecinos, con pila)
  let sp = 0;
  mark[0] = 2;
  stack[sp++] = 0;
  while (sp > 0) {
    const c = stack[--sp];
    const lx = c % W;
    const ly = (c - lx) / W;
    if (ly > 0 && mark[c - W] === 0) (mark[c - W] = 2), (stack[sp++] = c - W);
    if (lx < W - 1 && mark[c + 1] === 0) (mark[c + 1] = 2), (stack[sp++] = c + 1);
    if (ly < H - 1 && mark[c + W] === 0) (mark[c + W] = 2), (stack[sp++] = c + W);
    if (lx > 0 && mark[c - 1] === 0) (mark[c - 1] = 2), (stack[sp++] = c - 1);
  }
  for (let ly = 1; ly < H - 1; ly++) {
    for (let lx = 1; lx < W - 1; lx++) {
      if (mark[ly * W + lx] === 0) out.push((y0 + ly) * n + x0 + lx);
    }
  }
  return out;
}

// ---------------------------------------------------------------- el mundo
export class World {
  constructor(seed = 1, opts = {}) {
    this.size = Math.max(40, Math.min(400, opts.size | 0 || CFG.size));
    this.tps = Math.max(5, Math.min(60, opts.tps | 0 || CFG.tps));
    this.rnd = mulberry32(seed);
    this.tick = 0;
    const n = this.size;
    this.owner = new Uint16Array(n * n); // dueño del territorio de cada celda (0 = neutral)
    this.trailAt = new Uint16Array(n * n); // dueño de la estela que pasa por la celda (0 = ninguna)
    this.ver = new Uint32Array(n * n); // paso en que cambió el dueño de cada celda (para mandar solo diferencias)
    this.rowVer = new Uint32Array(n); // lo mismo por fila: el servidor mira solo las filas que cambiaron
    this.players = new Map();
    this.nextNum = 1;
    this.deaths = []; // lo vacía quien maneja el mundo después de cada paso
    this.respawnTicks = Math.round(CFG.respawnSec * this.tps);
    this._stepping = false;
    this._alive = [];
    this._dying = new Map();
    this._why = new Map(); // motivo de cada muerte del paso
    this._closers = [];
    this._victims = new Set();
    this._enc = [];
    this._mm = null;
    this._mmTick = -1;
  }

  // ------------------------------------------------ jugadores
  addPlayer({ id = null, name = '', color = 0, bot = false } = {}) {
    const num = this.nextNum++;
    const p = {
      num,
      id,
      name,
      color,
      bot,
      alive: false,
      x: 0,
      y: 0,
      dir: 0,
      out: false, // ¿está afuera de su territorio? (si sí, tiene estela)
      verts: [],
      trail: [],
      tid: 0, // número de estela: cambia cada vez que sale a una nueva
      moves: 0,
      area: 0,
      bb: [0, 0, 0, 0], // rectángulo envolvente del territorio (puede quedar de más)
      peak: 0,
      gained: 0,
      kos: 0,
      koTotal: 0,
      life: 0,
      seq: 0, // última entrada aplicada
      inSeq: 0, // última entrada aceptada en la cola
      lastK: 0,
      inbox: [],
      deadAt: -1e9,
      lastX: this.size >> 1,
      lastY: this.size >> 1,
      nx: 0,
      ny: 0,
      tidx: -1,
      moving: false,
    };
    this.players.set(num, p);
    return p;
  }

  removePlayer(num) {
    const p = this.players.get(num);
    if (!p) return;
    if (p.alive) this._leave(p);
    this.players.delete(num);
  }

  canSpawn(num) {
    const p = this.players.get(num);
    return !!p && !p.alive && this.tick - p.deadAt >= this.respawnTicks;
  }

  /** Pasos que faltan para poder reaparecer (0 = ya). */
  waitTicks(num) {
    const p = this.players.get(num);
    return p ? Math.max(0, this.respawnTicks - (this.tick - p.deadAt)) : 0;
  }

  /** Versión con la que se marca un cambio: la del paso en curso, o la del que viene si ocurre entre pasos. */
  _v() {
    return this._stepping ? this.tick : this.tick + 1;
  }

  /** La celda pasa a ser territorio de `p` (o neutral si p es null). Lleva las cuentas de área. */
  _give(p, c) {
    const prev = this.owner[c];
    const num = p ? p.num : 0;
    if (prev === num) return;
    this.owner[c] = num;
    const v = this._v();
    this.ver[c] = v;
    const n = this.size;
    const y = (c / n) | 0;
    this.rowVer[y] = v;
    if (prev) {
      const q = this.players.get(prev);
      if (q) {
        q.area--;
        this._victims.add(q);
      }
    }
    if (p) {
      p.area++;
      const x = c - y * n;
      const bb = p.bb;
      if (x < bb[0]) bb[0] = x;
      if (x > bb[2]) bb[2] = x;
      if (y < bb[1]) bb[1] = y;
      if (y > bb[3]) bb[3] = y;
    }
  }

  /** Como `_give` para muchas celdas de una (las encerradas por una captura, todas dentro del rectángulo envolvente de `p`). */
  _claim(p, cells) {
    const { owner, ver, rowVer, size: n } = this;
    const num = p.num;
    const v = this._v();
    let lastY = -1;
    let lastPrev = 0;
    let lastQ = null;
    let gained = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const prev = owner[c];
      if (prev === num) continue;
      owner[c] = num;
      ver[c] = v;
      const y = (c / n) | 0;
      if (y !== lastY) {
        rowVer[y] = v;
        lastY = y;
      }
      gained++;
      if (prev) {
        if (prev !== lastPrev) {
          lastPrev = prev;
          lastQ = this.players.get(prev) || null;
        }
        if (lastQ) {
          lastQ.area--;
          this._victims.add(lastQ);
        }
      }
    }
    p.area += gained;
  }

  /** Quita de la partida a un jugador vivo sin registrar una muerte (se fue o se borra). */
  _leave(p) {
    for (const c of p.trail) if (this.trailAt[c] === p.num) this.trailAt[c] = 0;
    p.trail = [];
    p.verts = [];
    p.out = false;
    this._neutralize(p);
    p.alive = false;
    p.inbox = [];
  }

  _neutralize(p) {
    const n = this.size;
    const bb = p.bb;
    for (let y = bb[1]; y <= bb[3]; y++) {
      for (let x = bb[0]; x <= bb[2]; x++) if (this.owner[y * n + x] === p.num) this._give(null, y * n + x);
    }
    p.area = 0;
  }

  /** Hace nacer al jugador con su 5×5 en un lugar lo más libre posible, mirando al centro. */
  spawn(num) {
    const p = this.players.get(num);
    if (!p || p.alive || !this.canSpawn(num)) return false;
    const n = this.size;
    const half = CFG.start >> 1;
    const m = half + 3; // margen contra la pared
    const owner = this.owner;
    let bx = n >> 1;
    let by = n >> 1;
    let best = 1e9;
    for (let t = 0; t < 40 && best > 0; t++) {
      const x = m + Math.floor(this.rnd() * (n - 2 * m));
      const y = m + Math.floor(this.rnd() * (n - 2 * m));
      let cost = 0;
      for (let yy = y - half - 2; yy <= y + half + 2 && cost < best; yy++) {
        for (let xx = x - half - 2; xx <= x + half + 2; xx++) {
          const c = yy * n + xx;
          if (owner[c]) cost++;
          if (this.trailAt[c]) cost += 30;
        }
      }
      if (cost < best) {
        best = cost;
        bx = x;
        by = y;
      }
    }
    const dx = (n >> 1) - bx;
    const dy = (n >> 1) - by;
    p.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    p.x = bx;
    p.y = by;
    p.out = false;
    p.verts = [];
    p.trail = [];
    p.moves = 0;
    p.kos = 0;
    p.life = 0;
    p.gained = 0;
    p.area = 0;
    p.bb = [bx, by, bx, by];
    p.inbox = []; // lo que estaba en cola de la vida anterior no vale
    p.lastK = this.tick;
    p.alive = true;
    this._victims.clear();
    for (let yy = by - half; yy <= by + half; yy++) for (let xx = bx - half; xx <= bx + half; xx++) this._give(p, yy * n + xx);
    p.peak = p.area;
    this._afterLoss(null);
    return true;
  }

  /**
   * Encola entradas de una persona: [[s, k, d, b], …] (las últimas, con redundancia; `b` no se usa acá pero el
   * formato es el del kit de red). Valida todo. Devuelve false si el mensaje está mal formado.
   */
  queueInputs(p, list) {
    if (!Array.isArray(list) || list.length > 6) return false;
    for (const e of list) {
      if (!Array.isArray(e) || e.length < 3) return false;
      const [s, k, d] = e;
      if (!Number.isInteger(s) || !Number.isInteger(k) || !Number.isInteger(d) || d < -1 || d > 3) return false;
      if (s <= p.inSeq) continue; // repetida (viene con redundancia)
      if (p.inbox.length >= CFG.inboxMax) continue;
      const kk = Math.max(p.lastK, Math.max(this.tick - CFG.kPast, Math.min(this.tick + CFG.kAhead, k)));
      p.lastK = kk;
      p.inSeq = s;
      p.inbox.push({ s, k: kk, d });
    }
    return true;
  }

  /** Entrada directa (bots): gira ya. */
  steer(p, d) {
    if (d >= 0) turnTo(p, d);
  }

  // ------------------------------------------------ puntaje
  /** Puntaje = celdas de territorio (el porcentaje del mapa es score / size²). */
  score(p) {
    return p.alive ? p.area : 0;
  }

  /** [[num, celdas, KO]] de los que están vivos, de mayor a menor territorio. */
  leaderboard(n = 10) {
    const list = [];
    for (const p of this.players.values()) if (p.alive && p.area > 0) list.push([p.num, p.area, p.koTotal]);
    list.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return n ? list.slice(0, n) : list;
  }

  // ------------------------------------------------ un paso
  step() {
    this.tick++;
    this._stepping = true;
    const n = this.size;
    const owner = this.owner;
    const trailAt = this.trailAt;
    const alive = this._alive;
    alive.length = 0;
    for (const p of this.players.values()) if (p.alive) alive.push(p);
    for (const p of alive) {
      if (p.inbox.length) {
        applyInputs(p, p.inbox, this.tick);
        while (p.inbox.length && p.inbox[0].s <= p.seq) p.inbox.shift();
      }
      const nx = p.x + DX[p.dir];
      const ny = p.y + DY[p.dir];
      p.nx = nx;
      p.ny = ny;
      p.tidx = nx < 0 || ny < 0 || nx >= n || ny >= n ? -1 : ny * n + nx;
      p.moving = p.tidx >= 0 || p.out; // en su territorio la pared solo la frena; afuera la mata
    }

    // --- quién muere en este paso (todo se decide contra el estado de antes de mover)
    const dying = this._dying;
    dying.clear();
    this._why.clear();
    for (const p of alive) {
      if (p.tidx < 0) {
        if (p.out) this._mark(dying, p, 0, 'wall');
        continue;
      }
      const o = trailAt[p.tidx];
      if (o === p.num) this._mark(dying, p, 0, 'self'); // su propia estela
      else if (o) {
        const q = this.players.get(o);
        if (q && q.alive) this._mark(dying, q, p.num, 'cut'); // pisó la estela de otro: KO para él
      }
    }
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      const ca = a.moving && a.tidx >= 0 ? a.tidx : a.y * n + a.x;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const cb = b.moving && b.tidx >= 0 ? b.tidx : b.y * n + b.x;
        if (ca === cb) {
          // misma celda: gana quien está en su territorio; si ninguno, mueren los dos
          const sa = owner[ca] === a.num;
          const sb = owner[ca] === b.num;
          if (sa && !sb) this._mark(dying, b, a.num, 'head');
          else if (sb && !sa) this._mark(dying, a, b.num, 'head');
          else if (!sa && !sb) {
            this._mark(dying, a, 0, 'head');
            this._mark(dying, b, 0, 'head');
          }
        } else if (a.moving && b.moving && a.tidx === b.y * n + b.x && b.tidx === a.y * n + a.x && a.tidx >= 0 && b.tidx >= 0) {
          // se cruzan de frente
          if (owner[a.tidx] !== a.num && owner[b.tidx] !== b.num) {
            this._mark(dying, a, 0, 'head');
            this._mark(dying, b, 0, 'head');
          }
        }
      }
    }
    for (const [p, by] of dying) {
      if (!p.alive) continue;
      const killer = by ? this.players.get(by) : null;
      const credit = killer && killer.alive && !dying.has(killer) ? killer : null;
      this._kill(p, credit, this._why.get(p));
    }

    // --- movimiento: los que siguen vivos avanzan una celda
    const closers = this._closers;
    closers.length = 0;
    for (const p of alive) {
      if (!p.alive || !p.moving || p.tidx < 0) continue;
      const ox = p.x;
      const oy = p.y;
      p.x = p.nx;
      p.y = p.ny;
      p.moves++;
      if (owner[p.tidx] === p.num) {
        if (p.out) closers.push(p);
      } else {
        if (!p.out) {
          p.out = true;
          p.verts = [ox, oy]; // la celda propia de la que salió
          p.tid++;
          p.trail = [];
        }
        p.trail.push(p.tidx);
        trailAt[p.tidx] = p.num;
      }
    }
    // --- capturas (en orden: una puede quitarle a otra la celda a la que acababa de entrar)
    for (const p of closers) {
      if (!p.alive) continue;
      const h = p.y * n + p.x;
      if (owner[h] === p.num) this._capture(p);
      else {
        p.trail.push(h);
        trailAt[h] = p.num;
      }
    }
    for (const p of alive) {
      if (!p.alive) continue;
      p.life++;
      if (p.area > p.peak) p.peak = p.area;
    }
    this._stepping = false;
  }

  _mark(dying, p, by, why) {
    if (dying.has(p)) return;
    dying.set(p, by);
    this._why.set(p, why);
  }

  /** La estela pasa a ser territorio y también lo encerrado; a los dueños anteriores se les descuenta. */
  _capture(p) {
    const n = this.size;
    const trail = p.trail;
    this._victims.clear();
    const before = p.area;
    for (const c of trail) {
      this.trailAt[c] = 0;
      this._give(p, c);
    }
    const enc = enclosed(this.owner, n, p.num, p.bb, this._enc);
    this._claim(p, enc);
    p.gained += p.area - before;
    p.trail = [];
    p.verts = [];
    p.out = false;
    this._afterLoss(p);
  }

  /** Quien se quedó sin territorio muere; el KO es de quien se lo capturó. */
  _afterLoss(killer) {
    if (!this._victims.size) return;
    const list = [...this._victims];
    this._victims.clear();
    for (const q of list) if (q.alive && q.area <= 0) this._kill(q, killer, 'lost');
  }

  /** @param why  'cut' (pisaron su estela) · 'self' · 'wall' · 'head' (de frente) · 'lost' (sin territorio) */
  _kill(p, killer, why = 'lost') {
    const time = Math.floor(p.life / this.tps);
    const stats = { time, kos: p.kos, peak: p.peak, gained: p.gained, why };
    this.deaths.push({ num: p.num, id: p.id, by: killer ? killer.num : 0, x: p.x, y: p.y, color: p.color, stats });
    p.lastX = p.x;
    p.lastY = p.y;
    this._leave(p);
    p.deadAt = this.tick;
    if (killer) {
      killer.kos++;
      killer.koTotal++;
    }
  }

  // ------------------------------------------------ minimapa
  /** El mapa en baja resolución (una celda cada `mini`): corridas [dueño, largo] en orden de filas. Se cachea por paso. */
  miniRLE() {
    if (this._mmTick === this.tick && this._mm) return this._mm;
    const n = this.size;
    const k = CFG.mini;
    const m = Math.ceil(n / k);
    const out = [];
    let cur = -1;
    let len = 0;
    for (let y = 0; y < m; y++) {
      const row = Math.min(n - 1, y * k + (k >> 1)) * n;
      for (let x = 0; x < m; x++) {
        const o = this.owner[row + Math.min(n - 1, x * k + (k >> 1))];
        if (o === cur) len++;
        else {
          if (len) out.push(cur, len);
          cur = o;
          len = 1;
        }
      }
    }
    out.push(cur, len);
    this._mm = out;
    this._mmTick = this.tick;
    return out;
  }

  /** Resumen del estado (para comparar mundos en las pruebas de determinismo). */
  digest() {
    let h = 2166136261;
    const mix = (v) => {
      h ^= v | 0;
      h = Math.imul(h, 16777619) >>> 0;
    };
    mix(this.tick);
    for (const v of this.owner) mix(v);
    for (const v of this.trailAt) mix(v);
    for (const p of this.players.values()) {
      mix(p.num);
      mix(p.alive ? 1 : 0);
      mix(p.x);
      mix(p.y);
      mix(p.dir);
      mix(p.area);
      mix(p.kos);
      mix(p.trail.length);
    }
    return h >>> 0;
  }
}
