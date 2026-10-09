/**
 * Estela — simulación (la usan el servidor online y el modo sin conexión; todo entero y determinista).
 *
 * Motos que avanzan una celda por paso y dejan una estela sólida. Chocar con una pared o con una
 * estela (propia o ajena) las destruye; dos cabezas en la misma celda mueren las dos. La estela tiene
 * un largo máximo que crece con los KO (la cola se va borrando). El turbo avanza 1,5 celdas por paso
 * y gasta energía, que se recarga rozando paredes y estelas.
 *
 * Mismo código en el cliente: las funciones puras de abajo (turnBike, applyInputs, bikeMoves, stepOwn)
 * son las que usa la predicción de la moto propia.
 *
 * Direcciones: 0 arriba, 1 derecha, 2 abajo, 3 izquierda.
 * Estela de una moto = poligonal `verts` (esquinas donde dobló, en celdas) + la cabeza (x, y); los
 * últimos `len` pasos son los sólidos. `D` cuenta las celdas recorridas en toda la vida.
 */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export const CFG = {
  size: 160,
  tps: 20,
  view: 72, // mitad del cuadro de interés (celdas) alrededor de la moto propia
  viewKeep: 88, // una moto ya vista se sigue mandando hasta esta distancia (histéresis)
  capStart: 60, // largo máximo de la estela al nacer
  capPerKo: 20,
  capMax: 400,
  energyMax: 80,
  turboCost: 2, // energía por paso con turbo (2 s de turbo con la barra llena a 20 pasos/s)
  turboMin: 10, // energía mínima para arrancar el turbo
  graze: 5, // energía por paso rozando (a 1 celda de una pared o estela)
  regenEvery: 4, // y +1 cada tantos pasos aunque no roce
  shieldSec: 1.5,
  respawnSec: 2.5,
  koPoints: 10,
  inboxMax: 8,
  kPast: 12, // una entrada puede venir fechada hasta 12 pasos atrás o adelante
  kAhead: 12,
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

// ---------------------------------------------------------------- funciones puras de una moto
export const capFor = (kos) => Math.min(CFG.capMax, CFG.capStart + CFG.capPerKo * kos);

/** Dobla la moto si el giro es legal (no se puede dar la vuelta en U). Deja una esquina en la estela. */
export function turnBike(b, d) {
  if (!(d >= 0 && d <= 3) || d === b.dir || d === ((b.dir + 2) & 3)) return false;
  b.verts.push(b.x, b.y);
  b.dir = d;
  return true;
}

/**
 * Aplica las entradas pendientes ({ s: seq, k: paso, d: dirección o -1, b: turbo }) que ya les toca
 * (k <= tick), en orden y sin repetir (s <= b.seq). Como máximo un giro por paso: las que siguen esperan.
 */
export function applyInputs(b, list, tick) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.s <= b.seq) continue;
    if (e.k > tick) break;
    b.seq = e.s;
    b.turboWant = e.b ? 1 : 0;
    if (e.d >= 0 && turnBike(b, e.d)) return;
  }
}

/** Cuántas celdas avanza este paso (1, o 2 cada dos pasos con turbo) y gasta la energía del turbo. */
export function bikeMoves(b) {
  if (!b.turboWant) b.lock = 0;
  let on = 0;
  if (b.turboWant && !b.lock) {
    if (b.energy >= (b.turbo ? CFG.turboCost : CFG.turboMin)) on = 1;
    else if (b.turbo) b.lock = 1; // se quedó sin energía a mitad del turbo: no vuelve hasta soltar la tecla
  }
  b.turbo = on;
  let moves = 1;
  if (on) {
    b.energy -= CFG.turboCost;
    if (b.energy <= 0) {
      b.energy = 0;
      b.lock = 1; // sin energía: no vuelve el turbo hasta soltar la tecla
    }
    if (++b.frac >= 2) {
      b.frac = 0;
      moves = 2;
    }
  } else b.frac = 0;
  return moves;
}

/** Un paso de la moto propia sin colisiones (predicción del cliente): entradas, turbo y avance. */
export function stepOwn(b, list, tick, size) {
  applyInputs(b, list, tick);
  const mv = bikeMoves(b);
  for (let i = 0; i < mv; i++) {
    const nx = b.x + DX[b.dir];
    const ny = b.y + DY[b.dir];
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) break; // el servidor la destruye: acá se queda en el borde
    b.x = nx;
    b.y = ny;
    b.D++;
    if (b.len < b.cap) b.len++;
  }
  if (b.shield > 0) b.shield--;
  // recarga lenta (sin saber si roza algo: eso lo corrige el servidor con la energía real)
  if (tick % CFG.regenEvery === 0) b.energy = Math.min(CFG.energyMax, b.energy + 1);
}

/**
 * Cuántas esquinas del principio ya no hacen falta: la cola está a `len - 1` celdas de la cabeza.
 * Devuelve la cantidad de esquinas a tirar (el llamador las saca de `verts`).
 */
export function prunable(verts, hx, hy, len) {
  let remaining = len - 1;
  let cx = hx;
  let cy = hy;
  for (let i = verts.length / 2 - 1; i >= 0; i--) {
    const seg = Math.abs(cx - verts[i * 2]) + Math.abs(cy - verts[i * 2 + 1]);
    if (remaining <= seg) return i;
    remaining -= seg;
    cx = verts[i * 2];
    cy = verts[i * 2 + 1];
  }
  return 0;
}

/**
 * Puntos de la poligonal de la estela (esquinas) recortada a `len` celdas, terminando en (hx, hy).
 * Se escribe en `out` (se vacía antes) como x0, y0, x1, y1…
 */
export function trailPoints(verts, hx, hy, len, out) {
  out.length = 0;
  let remaining = len - 1;
  let cx = hx;
  let cy = hy;
  const rev = [hx, hy];
  for (let i = verts.length / 2 - 1; i >= 0; i--) {
    const vx = verts[i * 2];
    const vy = verts[i * 2 + 1];
    const seg = Math.abs(cx - vx) + Math.abs(cy - vy);
    if (remaining <= seg) {
      // la cola cae dentro de este tramo
      const t = seg ? remaining / seg : 0;
      rev.push(cx + (vx - cx) * t, cy + (vy - cy) * t);
      remaining = -1;
      break;
    }
    remaining -= seg;
    rev.push(vx, vy);
    cx = vx;
    cy = vy;
  }
  for (let i = rev.length - 2; i >= 0; i -= 2) out.push(rev[i], rev[i + 1]);
  return out;
}

// ---------------------------------------------------------------- el mundo
export class World {
  constructor(seed = 1, opts = {}) {
    this.size = Math.max(40, Math.min(400, opts.size | 0 || CFG.size));
    this.tps = Math.max(5, Math.min(60, opts.tps | 0 || CFG.tps));
    this.rnd = mulberry32(seed);
    this.tick = 0;
    this.grid = new Int16Array(this.size * this.size); // dueño de cada celda (0 = libre)
    this.players = new Map();
    this.nextNum = 1;
    this.deaths = []; // lo vacía quien maneja el mundo después de cada paso
    this.shieldTicks = Math.round(CFG.shieldSec * this.tps);
    this.respawnTicks = Math.round(CFG.respawnSec * this.tps);
    this._alive = [];
    this._dying = new Map();
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
      D: 0,
      verts: [],
      vbase: 0,
      cells: [],
      ci: 0,
      len: 0,
      cap: CFG.capStart,
      kos: 0,
      koTotal: 0,
      turboWant: 0,
      turbo: 0,
      lock: 0,
      energy: CFG.energyMax,
      frac: 0,
      mv: 0,
      nx: 0,
      ny: 0,
      tidx: -1,
      shield: 0,
      seq: 0, // última entrada aplicada
      inSeq: 0, // última entrada aceptada en la cola
      lastK: 0,
      inbox: [],
      life: 0,
      banked: 0,
      maxLen: 0,
      deadAt: -1e9,
      lastX: this.size >> 1,
      lastY: this.size >> 1,
    };
    this.players.set(num, p);
    return p;
  }

  removePlayer(num) {
    const p = this.players.get(num);
    if (!p) return;
    if (p.alive) this._clear(p);
    this.players.delete(num);
  }

  _clear(p) {
    const g = this.grid;
    for (let i = p.ci; i < p.cells.length; i++) if (g[p.cells[i]] === p.num) g[p.cells[i]] = 0;
    p.cells = [];
    p.ci = 0;
    p.len = 0;
    p.alive = false;
  }

  canSpawn(num) {
    const p = this.players.get(num);
    return !!p && !p.alive && this.tick - p.deadAt >= this.respawnTicks;
  }

  /** Ticks que faltan para poder reaparecer (0 = ya). */
  waitTicks(num) {
    const p = this.players.get(num);
    return p ? Math.max(0, this.respawnTicks - (this.tick - p.deadAt)) : 0;
  }

  /** Hace nacer a la moto en un lugar libre, mirando al centro y con escudo. */
  spawn(num) {
    const p = this.players.get(num);
    if (!p || p.alive || !this.canSpawn(num)) return false;
    const n = this.size;
    const m = Math.min(12, n >> 3);
    const g = this.grid;
    let bx = n >> 1;
    let by = n >> 1;
    let best = 1e9;
    for (let t = 0; t < 30 && best > 0; t++) {
      const x = m + Math.floor(this.rnd() * (n - 2 * m));
      const y = m + Math.floor(this.rnd() * (n - 2 * m));
      let occ = 0;
      for (let yy = y - 7; yy <= y + 7 && occ < best; yy++) {
        if (yy < 0 || yy >= n) continue;
        for (let xx = x - 7; xx <= x + 7; xx++) if (xx >= 0 && xx < n && g[yy * n + xx]) occ++;
      }
      if (occ < best) {
        best = occ;
        bx = x;
        by = y;
      }
    }
    const dx = (n >> 1) - bx;
    const dy = (n >> 1) - by;
    p.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    p.x = bx;
    p.y = by;
    p.verts = [bx, by];
    p.vbase = 0;
    p.D = 0;
    p.len = 1;
    p.cap = CFG.capStart;
    p.kos = 0;
    p.energy = CFG.energyMax;
    p.turbo = 0;
    p.turboWant = 0;
    p.lock = 0;
    p.frac = 0;
    p.life = 0;
    p.maxLen = 1;
    p.shield = this.shieldTicks;
    p.inbox = []; // lo que estaba en cola de la vida anterior no vale
    p.lastK = this.tick;
    p.cells = [by * n + bx];
    p.ci = 0;
    if (!g[by * n + bx]) g[by * n + bx] = num;
    p.alive = true;
    return true;
  }

  /**
   * Encola entradas de una persona: [[s, k, d, b], …] (las últimas, con redundancia). Valida todo.
   * Devuelve false si el mensaje está mal formado.
   */
  queueInputs(p, list) {
    if (!Array.isArray(list) || list.length > 6) return false;
    for (const e of list) {
      if (!Array.isArray(e) || e.length < 4) return false;
      const [s, k, d, b] = e;
      if (!Number.isInteger(s) || !Number.isInteger(k) || !Number.isInteger(d) || d < -1 || d > 3 || (b !== 0 && b !== 1)) return false;
      if (s <= p.inSeq) continue; // repetida (viene con redundancia)
      if (p.inbox.length >= CFG.inboxMax) continue;
      const kk = Math.max(p.lastK, Math.max(this.tick - CFG.kPast, Math.min(this.tick + CFG.kAhead, k)));
      p.lastK = kk;
      p.inSeq = s;
      p.inbox.push({ s, k: kk, d, b });
    }
    return true;
  }

  /** Entrada directa (bots): gira ya y fija el turbo. */
  steer(p, d, turbo) {
    if (d >= 0) turnBike(p, d);
    if (turbo !== undefined) p.turboWant = turbo ? 1 : 0;
  }

  // ------------------------------------------------ puntaje
  score(p) {
    return p.banked + (p.alive ? Math.floor(p.life / this.tps) + p.kos * CFG.koPoints + p.len : 0);
  }

  leaderboard(n = 10) {
    const list = [];
    for (const p of this.players.values()) list.push([p.num, this.score(p), p.koTotal]);
    list.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return n ? list.slice(0, n) : list;
  }

  /** ¿La celda es sólida para la moto `p` (pared, estela o ambas)? */
  blocked(x, y) {
    return x < 0 || y < 0 || x >= this.size || y >= this.size || this.grid[y * this.size + x] !== 0;
  }

  // ------------------------------------------------ un paso
  step() {
    this.tick++;
    const n = this.size;
    const g = this.grid;
    const alive = this._alive;
    alive.length = 0;
    for (const p of this.players.values()) if (p.alive) alive.push(p);
    for (const p of alive) {
      if (p.inbox.length) {
        applyInputs(p, p.inbox, this.tick);
        while (p.inbox.length && p.inbox[0].s <= p.seq) p.inbox.shift();
      }
      p.mv = bikeMoves(p);
    }
    const dying = this._dying;
    dying.clear();
    for (let round = 0; round < 2; round++) {
      const movers = [];
      for (const p of alive) if (p.alive && p.mv > round && !dying.has(p)) movers.push(p);
      if (!movers.length) break;
      const claims = new Map();
      for (const p of movers) {
        const nx = p.x + DX[p.dir];
        const ny = p.y + DY[p.dir];
        p.nx = nx;
        p.ny = ny;
        p.tidx = nx < 0 || ny < 0 || nx >= n || ny >= n ? -1 : ny * n + nx;
        if (p.tidx >= 0) {
          const c = claims.get(p.tidx);
          if (c) c.push(p);
          else claims.set(p.tidx, [p]);
        }
      }
      const fate = [];
      for (const p of movers) {
        let by = 0;
        let dead = false;
        if (p.tidx < 0) dead = true; // pared
        else {
          const o = g[p.tidx];
          if (o !== 0 && p.shield <= 0) {
            dead = true;
            by = o === p.num ? 0 : o;
          } else {
            const c = claims.get(p.tidx);
            if (c.length > 1 && p.shield <= 0) {
              dead = true; // cabeza contra cabeza: mueren las dos (menos la que tiene escudo)
              const shielded = c.find((q) => q !== p && q.shield > 0);
              by = shielded ? shielded.num : 0;
            }
          }
        }
        fate.push(dead ? by : -1);
      }
      for (let i = 0; i < movers.length; i++) {
        const p = movers[i];
        if (fate[i] >= 0) {
          dying.set(p, fate[i]);
          continue;
        }
        p.x = p.nx;
        p.y = p.ny;
        p.D++;
        p.cells.push(p.tidx);
        p.len++;
        if (!g[p.tidx]) g[p.tidx] = p.num;
      }
      // muertes de esta ronda: se borran sus estelas recién ahora (los choques se decidieron contra el estado de antes)
      for (const [p, by] of dying) {
        if (!p.alive) continue;
        const killer = by ? this.players.get(by) : null;
        const credit = killer && killer.alive && !dying.has(killer) ? killer : null;
        this._kill(p, credit);
      }
    }
    for (const p of alive) {
      if (!p.alive) continue;
      while (p.len > p.cap) {
        const c = p.cells[p.ci++];
        if (g[c] === p.num) g[c] = 0;
        p.len--;
      }
      if (p.ci > 256) {
        p.cells.splice(0, p.ci);
        p.ci = 0;
      }
      const drop = prunable(p.verts, p.x, p.y, p.len);
      if (drop > 0) {
        p.verts.splice(0, drop * 2);
        p.vbase += drop;
      }
      if (p.len > p.maxLen) p.maxLen = p.len;
      p.life++;
      if (p.shield > 0) p.shield--;
      // rozar: pared o estela pegada a un costado
      const l = (p.dir + 3) & 3;
      const r = (p.dir + 1) & 3;
      const grazing = this.blocked(p.x + DX[l], p.y + DY[l]) || this.blocked(p.x + DX[r], p.y + DY[r]);
      if (grazing) p.energy = Math.min(CFG.energyMax, p.energy + CFG.graze);
      else if (this.tick % CFG.regenEvery === 0) p.energy = Math.min(CFG.energyMax, p.energy + 1);
    }
  }

  _kill(p, killer) {
    const time = Math.floor(p.life / this.tps);
    const stats = { time, kos: p.kos, len: p.maxLen, score: time + p.kos * CFG.koPoints + p.maxLen };
    p.banked += time + p.kos * CFG.koPoints;
    p.lastX = p.x;
    p.lastY = p.y;
    this.deaths.push({ num: p.num, id: p.id, by: killer ? killer.num : 0, x: p.x, y: p.y, color: p.color, stats });
    this._clear(p);
    p.deadAt = this.tick;
    p.kos = 0;
    p.cap = CFG.capStart;
    if (killer) {
      killer.kos++;
      killer.koTotal++;
      killer.cap = capFor(killer.kos);
    }
  }

  /** Esquinas absolutas contadas desde el principio de la vida (para mandar solo las nuevas). */
  vseq(p) {
    return p.vbase + p.verts.length / 2;
  }

  /** Resumen del estado (para comparar mundos en las pruebas de determinismo). */
  digest() {
    let h = 2166136261;
    const mix = (v) => {
      h ^= v | 0;
      h = Math.imul(h, 16777619) >>> 0;
    };
    mix(this.tick);
    for (const v of this.grid) mix(v);
    for (const p of this.players.values()) {
      mix(p.num);
      mix(p.alive ? 1 : 0);
      mix(p.x);
      mix(p.y);
      mix(p.dir);
      mix(p.len);
      mix(p.energy);
      mix(p.kos);
      mix(p.banked);
    }
    return h >>> 0;
  }
}
