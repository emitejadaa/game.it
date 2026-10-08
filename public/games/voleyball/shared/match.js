/**
 * Voleyball — un partido. Mismo código en el servidor (autoritativo), en el cliente online
 * (predicción) y en los modos sin conexión.
 *
 * Vista de costado como los mapas de vóley de HaxBall (ver courts.js): los jugadores flotan y se
 * mueven con la física de Clashball, no pueden pasar al otro lado de la red y la pelota cae con
 * gravedad, los atraviesa y rebota en las paredes de los costados y en la red. Arriba no hay techo:
 * si se la manda muy alto sale del mapa y vuelve a caer.
 *
 * El golpe es la patada de HaxBall: al apretar queda armado y, apenas la pelota está al alcance, sale
 * desde el centro del jugador hacia la pelota (por debajo la levanta, desde arriba la remata). Conserva
 * parte de la velocidad que traía y suma un poco si el jugador va hacia ella. Hay que soltar para
 * volver a pegar.
 *
 * Reglas:
 *  - estado 0 saque: la pelota espera quieta en el fondo de la cancha del que saca y sale cuando él le
 *    pega. Si tarda más de 7 s saca solo. Si un equipo no tiene jugadores (práctica), saca siempre una
 *    máquina desde ese lado.
 *  - estado 1 en juego: el punto se define solo en el piso: si la pelota lo toca, punto para el equipo
 *    del otro lado. Cada equipo tiene hasta 3 toques (el saque cuenta como el primero y el bloqueo no
 *    cuenta); el 4.º es falta.
 *  - estado 2 punto: festejo y saca el equipo que hizo el punto; si recupera el saque, rota quién saca.
 *  - estado 3 final.
 */
import { step as stepPlayers, disc, F } from './physics.js';
import { buildCourt } from './courts.js';

export const TEAM = { SPEC: 0, RED: 1, BLUE: 2 };
export const KEY = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, HIT: 16 };
export const TPS = 60;
/** Lado de la cancha de cada equipo: el rojo juega a la izquierda (x < 0). */
export const SIDE = [0, -1, 1];
const TEAM_FLAG = [0, F.red, F.blue];
const PLAYER_MASK = F.red | F.blue | F.wall;
const DIAG = 1 / Math.SQRT2;
const POINT_TICKS = 150;
const END_TICKS = 300;
const SERVE_MIN = 20; // ticks después de acomodarse antes de poder sacar
const SERVE_WAIT = 7 * TPS; // si el que saca no saca en 7 s, saca solo
const AUTO_SERVE = 75; // equipo vacío: la máquina saca después de esta espera
const KICK_MIN = 6; // ticks mínimos entre dos golpes del mismo jugador
const BLOCK_X = 26; // un golpe a esta distancia de la red, de vuelta al rival, es un bloqueo

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Posiciones base de un equipo de n jugadores: [distancia a la red / cw, altura]. */
const FORM = {
  1: [[0.5, 80]],
  2: [
    [0.3, 130],
    [0.68, 60],
  ],
  3: [
    [0.18, 140],
    [0.48, 70],
    [0.8, 55],
  ],
  4: [
    [0.16, 150],
    [0.4, 80],
    [0.66, 50],
    [0.84, 110],
  ],
  5: [
    [0.14, 160],
    [0.34, 90],
    [0.54, 45],
    [0.72, 120],
    [0.88, 60],
  ],
  6: [
    [0.14, 165],
    [0.3, 95],
    [0.46, 40],
    [0.62, 130],
    [0.76, 70],
    [0.9, 150],
  ],
};

/** Posición base del i-ésimo de n jugadores de un equipo. */
export function formation(st, team, i, n) {
  const f = FORM[clamp(n, 1, 6)];
  const [fx, h] = f[i % f.length];
  const extra = Math.floor(i / f.length); // más de 6: se corren un poco
  return [SIDE[team] * st.cw * Math.min(0.9, fx + extra * 0.07), -Math.min(st.height - 40, h + extra * 35)];
}

/**
 * Avanza la pelota un tick con el mismo orden que HaxBall (posición con la velocidad anterior y
 * después velocidad = amortiguación · (velocidad + gravedad)) y la hace rebotar en la red (un palo
 * vertical de (0, −netH) a (0, 0) con la punta redonda), el piso y las paredes de los costados.
 * Arriba no hay techo: es cielo abierto. Devuelve 1 si tocó la red, 2 si tocó el piso y 4 si rebotó
 * en una pared (se pueden sumar); la velocidad del impacto queda en b.imp.
 */
export function stepBall(b, st) {
  const B = st.ball;
  const r = b.r;
  const px = b.x;
  const py = b.y;
  b.x += b.vx;
  b.y += b.vy;
  b.vx *= B.damping;
  b.vy = B.damping * (b.vy + B.gravity);
  let hit = 0;
  b.imp = 0;
  const top = -st.netH;
  // ---- red: la cara (también si la cruzó entera en un tick) y la punta
  if ((px < 0) !== (b.x < 0) && px !== 0) {
    const t = px / (px - b.x);
    const yc = py + (b.y - py) * t;
    if (yc > top) {
      b.imp = Math.abs(b.vx);
      b.x = px < 0 ? -r : r;
      b.vx = -b.vx * B.bCoef;
      hit |= 1;
    }
  } else if (Math.abs(b.x) < r && b.y > top) {
    const s = b.x !== 0 ? Math.sign(b.x) : px < 0 ? -1 : 1;
    b.x = s * r;
    if (b.vx * s < 0) {
      b.imp = Math.abs(b.vx);
      b.vx = -b.vx * B.bCoef;
      hit |= 1;
    }
  }
  if (b.y <= top) {
    const dx = b.x;
    const dy = b.y - top;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      let d = Math.sqrt(d2);
      let nx = d > 0 ? dx / d : 0;
      let ny = d > 0 ? dy / d : -1;
      if (Math.abs(dx) < 0.05) {
        // justo arriba de la punta: que no quede haciendo equilibrio
        nx = px < 0 ? -0.08 : 0.08;
        ny = -1;
        d = Math.min(d, r);
      }
      b.x += nx * (r - d);
      b.y += ny * (r - d);
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.imp = Math.max(b.imp, -vn);
        const k = vn * (1 + B.bCoef);
        b.vx -= nx * k;
        b.vy -= ny * k;
        hit |= 1;
      }
    }
  }
  // ---- piso y paredes (arriba no hay techo)
  if (b.y > -r) {
    b.y = -r;
    if (b.vy > 0) {
      b.imp = Math.max(b.imp, b.vy);
      b.vy = -b.vy * B.floorBCoef;
      b.vx *= 0.8;
      hit |= 2;
    }
  }
  const W = st.cw - r;
  if (b.x < -W || b.x > W) {
    const s = Math.sign(b.x);
    b.x = s * W;
    if (b.vx * s > 0) {
      b.imp = Math.max(b.imp, Math.abs(b.vx));
      b.vx = -b.vx * B.bCoef;
      hit |= 4;
    }
  }
  return hit;
}

/** Velocidad de la pelota después de un golpe en la dirección (nx, ny). */
export function kickVelocity(st, bvx, bvy, nx, ny, pvx = 0, pvy = 0, serve = false) {
  const K = st.kick;
  const run = Math.max(0, pvx * nx + pvy * ny) * K.run;
  const j = K.strength * (serve ? K.serve : 1) + run;
  const c = serve ? 0 : K.carry;
  let vx = bvx * c + nx * j;
  let vy = bvy * c + ny * j;
  const v = Math.sqrt(vx * vx + vy * vy);
  if (v > K.max) {
    vx *= K.max / v;
    vy *= K.max / v;
  }
  return [vx, vy];
}

export function ballCopy(b) {
  return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, imp: 0 };
}

/**
 * Dirección del saque (desde la pelota quieta en su lugar) para que pique a `depth` (fracción de cw)
 * en la cancha rival, pasando la red con margen. Se busca simulando y queda guardada en la cancha.
 */
export function serveAim(st, team, depth = 0.6) {
  const key = team + ':' + depth;
  const cache = (st.aimCache ||= {});
  if (cache[key]) return cache[key];
  const fwd = -SIDE[team];
  const target = fwd * st.cw * depth;
  let best = null;
  for (let deg = 10; deg <= 80; deg++) {
    const a = (deg * Math.PI) / 180;
    const nx = fwd * Math.cos(a);
    const ny = -Math.sin(a);
    const [vx, vy] = kickVelocity(st, 0, 0, nx, ny, 0, 0, true);
    const b = { x: SIDE[team] * st.serveX, y: st.serveY, vx, vy, r: st.ball.r, imp: 0 };
    let ok = true;
    let land = null;
    for (let i = 0; i < 400 && ok; i++) {
      const px = b.x;
      const h = stepBall(b, st);
      if (h & 5 || ((px < 0) !== (b.x < 0) && b.y > -st.netH - b.r - 14)) ok = false; // red o pared
      if (h & 2) {
        land = b.x;
        break;
      }
    }
    if (!ok || land === null || land * fwd <= 0) continue;
    const err = Math.abs(land - target);
    if (!best || err < best.err) best = { err, nx, ny };
  }
  cache[key] = best ? [best.nx, best.ny] : [fwd * 0.6, -0.8];
  return cache[key];
}

export class Match {
  /**
   * @param {object} o
   * @param {string} o.court      id de la cancha
   * @param {string} o.mode       classic | beach | turbo
   * @param {number} o.scoreLimit puntos para ganar (0 = sin límite)
   * @param {number} o.timeLimit  minutos (0 = sin límite)
   * @param {boolean} o.winBy2    hay que ganar por 2
   * @param {Array} o.players     [{ id, team, name, avatar, bot }]
   */
  constructor({ court = 'classic', mode = 'classic', scoreLimit = 11, timeLimit = 0, winBy2 = true, players = [] } = {}) {
    this.cfg = { court, mode, scoreLimit, timeLimit, winBy2: !!winBy2 };
    this.st = buildCourt(court, mode);
    this.world = { discs: [], planes: this.st.planes, segments: [], vertices: [] };
    this.ball = { x: 0, y: this.st.serveY, vx: 0, vy: 0, r: this.st.ball.r, imp: 0, live: false };
    this.players = [];
    this.tick = 0;
    this.state = 0;
    this.timer = 0;
    this.time = 0; // ticks jugados (corre en el saque y con la pelota en juego)
    this.score = [0, 0, 0];
    this.serveTeam = TEAM.RED;
    this.serveIdx = [0, 0, -1]; // quién saca de cada equipo (rota al recuperar el saque)
    this.server = null;
    this.serveClock = 0;
    this.touchTeam = 0; // equipo que la tocó último
    this.touches = 0; // toques de ese equipo desde que la pelota pasó a su lado
    this.rally = 0; // golpes en todo el punto (sin el saque)
    this.netHit = false; // pegó en la red desde el último golpe
    this.hist = []; // últimos golpes: { id, team, kind }
    this.lastId = null;
    this.lastKind = '';
    this.lastTick = -1; // tick del último golpe o saque
    this.winner = 0;
    this.over = false;
    this.events = [];
    this.stats = {};
    this.team = { kills: [0, 0, 0], aces: [0, 0, 0], blocks: [0, 0, 0], errors: [0, 0, 0] };
    this.best = 0; // punto más largo (golpes)
    for (const p of players) this.addPlayer(p, false);
    this.resetPositions();
  }

  // ---------------------------------------------------------------- jugadores
  player(id) {
    return this.players.find((p) => p.id === id);
  }

  stat(p) {
    return (this.stats[p.id] ||= { name: p.name, team: p.team, points: 0, kills: 0, aces: 0, blocks: 0, spikes: 0, touches: 0, errors: 0, bot: !!p.bot });
  }

  /** Agrega un jugador. Si entra con el partido en curso aparece en el fondo de su cancha. */
  addPlayer({ id, team = 0, name = '', avatar = '', bot = null }, spawn = true) {
    let p = this.player(id);
    if (!p) {
      p = { id, team: 0, name, avatar, bot, input: 0, kicking: false, cd: 0, d: null };
      this.players.push(p);
    }
    p.name = name || p.name;
    if (avatar !== undefined) p.avatar = avatar;
    this.setTeam(id, team, spawn);
    return p;
  }

  removePlayer(id) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.players.splice(i, 1);
    this.rebuild();
  }

  setTeam(id, team, spawn = true) {
    const p = this.player(id);
    if (!p) return;
    team = team === 1 || team === 2 ? team : 0;
    if (p.team === team && (team === 0 || p.d)) return;
    p.team = team;
    p.input = 0;
    p.kicking = false;
    if (!team) p.d = null;
    else {
      const pp = this.st.player;
      p.d = disc({ r: pp.radius, invMass: pp.invMass, damping: pp.damping, bCoef: pp.bCoef, cMask: PLAYER_MASK, cGroup: TEAM_FLAG[team] });
      if (spawn) {
        p.d.x = SIDE[team] * this.st.cw * 0.75;
        p.d.y = -60;
      }
      this.stat(p).team = team;
    }
    this.rebuild();
  }

  rebuild() {
    this.world.discs = this.players.filter((p) => p.d).map((p) => p.d);
  }

  members(team) {
    return this.players.filter((p) => p.d && p.team === team);
  }

  setInput(id, bits) {
    const p = this.player(id);
    if (!p) return;
    bits &= 31;
    // apretar arma el golpe (como la patada de HaxBall); hay que soltar para volver a armarlo
    if (!(p.input & KEY.HIT) && bits & KEY.HIT && p.d) p.kicking = true;
    p.input = bits;
  }

  /** ¿La pelota está al alcance del golpe de p? */
  reach(p) {
    const b = this.ball;
    const d = p.d;
    const dx = b.x - d.x;
    const dy = b.y - d.y;
    const R = d.r + b.r + this.st.kick.range;
    return dx * dx + dy * dy <= R * R;
  }

  /** Equipo del lado en el que está la pelota. */
  get sideTeam() {
    return this.ball.x < 0 ? TEAM.RED : TEAM.BLUE;
  }

  /** Toques que lleva el equipo del lado de la pelota. */
  get sideTouches() {
    return this.touchTeam === this.sideTeam ? this.touches : 0;
  }

  // ---------------------------------------------------------------- saque
  /** Elige al que saca (rota dentro del equipo). */
  pickServer() {
    // práctica (un equipo vacío): saca siempre la máquina, así se practica recibir y atacar
    for (const t of [1, 2]) if (!this.members(t).length && this.members(3 - t).length) this.serveTeam = t;
    const team = this.serveTeam;
    const list = this.members(team);
    if (!list.length) {
      this.server = null;
      return null;
    }
    if (this.serveIdx[team] < 0) this.serveIdx[team] = 0;
    const p = list[this.serveIdx[team] % list.length];
    this.server = p.id;
    return p;
  }

  /** Pone la pelota en el lugar del saque y al que saca listo para pegarle. */
  placeServe() {
    const st = this.st;
    const team = this.serveTeam;
    const b = this.ball;
    Object.assign(b, { x: SIDE[team] * st.serveX, y: st.serveY, vx: 0, vy: 0, live: false });
    const p = this.player(this.server);
    if (p?.d) {
      const [nx, ny] = serveAim(st, team);
      const R = p.d.r + b.r + 1;
      Object.assign(p.d, { x: b.x - nx * R, y: b.y - ny * R, vx: 0, vy: 0 });
    }
  }

  resetPositions() {
    this.state = 0;
    this.serveClock = 0;
    this.touchTeam = 0;
    this.touches = 0;
    this.rally = 0;
    this.netHit = false;
    this.hist = [];
    this.lastId = null;
    this.lastKind = '';
    const st = this.st;
    const sv = this.pickServer();
    for (const team of [1, 2]) {
      const list = this.members(team).filter((p) => p !== sv);
      list.forEach((p, i) => {
        const [x, y] = formation(st, team, i, list.length);
        Object.assign(p.d, { x, y, vx: 0, vy: 0 });
      });
    }
    for (const p of this.players) {
      p.kicking = false;
      p.cd = 0;
    }
    this.placeServe();
  }

  /** Saque: de un jugador (con su golpe) o automático (máquina o se le pasó el tiempo). */
  serve(p, auto = false) {
    const st = this.st;
    const team = this.serveTeam;
    const b = this.ball;
    if (p && !auto) {
      const d = p.d;
      const dx = b.x - d.x;
      const dy = b.y - d.y;
      const l = Math.sqrt(dx * dx + dy * dy);
      const [nx, ny] = l > 0.5 ? [dx / l, dy / l] : [0, -1];
      [b.vx, b.vy] = kickVelocity(st, 0, 0, nx, ny, d.vx, d.vy, true);
    } else {
      // varía la profundidad para que no sea siempre igual
      const depth = [0.6, 0.45, 0.75, 0.55, 0.68][(this.score[1] + this.score[2]) % 5];
      const [nx, ny] = serveAim(st, team, depth);
      [b.vx, b.vy] = kickVelocity(st, 0, 0, nx, ny, 0, 0, true);
    }
    if (p) {
      p.kicking = false;
      p.cd = KICK_MIN;
    }
    b.live = true;
    this.state = 1;
    this.touchTeam = team;
    this.touches = 1; // el saque es el primer toque del equipo
    this.rally = 0;
    this.netHit = false;
    const id = p ? p.id : null;
    this.hist = [{ id, team, kind: 'serve' }];
    this.lastTick = this.tick;
    this.lastId = id;
    this.lastKind = 'serve';
    if (p) this.stat(p).touches++;
    this.events.push({ t: 'serve', id, team, x: b.x, y: b.y, v: Math.hypot(b.vx, b.vy) });
  }

  // ---------------------------------------------------------------- tick
  step() {
    const ev = this.events;
    ev.length = 0;
    const pp = this.st.player;
    for (const p of this.players) {
      if (!p.d) continue;
      if (!(p.input & KEY.HIT)) p.kicking = false;
      if (p.cd > 0) p.cd--;
    }
    // golpes, con las posiciones del principio del tick como la patada de HaxBall
    if (this.state === 0) this.serveStep();
    else if (this.state === 1) this.kicks();
    for (const p of this.players) {
      const d = p.d;
      if (!d) continue;
      // movimiento: 8 direcciones, diagonal normalizada
      const bits = p.input;
      let x = (bits & KEY.RIGHT ? 1 : 0) - (bits & KEY.LEFT ? 1 : 0);
      let y = (bits & KEY.DOWN ? 1 : 0) - (bits & KEY.UP ? 1 : 0);
      if (x && y) {
        x *= DIAG;
        y *= DIAG;
      }
      const a = p.kicking ? pp.kickingAcceleration : pp.acceleration;
      d.vx += x * a;
      d.vy += y * a;
      d.damping = p.kicking ? pp.kickingDamping : pp.damping;
    }
    stepPlayers(this.world, null);

    switch (this.state) {
      case 0: {
        this.time++;
        if (this.timeUp() && this.score[1] !== this.score[2]) this.end();
        break;
      }
      case 1: {
        this.time++;
        this.play();
        if (this.state === 1 && this.timeUp() && this.score[1] !== this.score[2]) this.end();
        break;
      }
      case 2: {
        this.loose();
        if (--this.timer <= 0) {
          if (this.decided()) this.end();
          else {
            this.resetPositions();
            ev.push({ t: 'reset' });
          }
        }
        break;
      }
      case 3: {
        this.loose();
        if (--this.timer <= 0 && !this.over) {
          this.over = true;
          ev.push({ t: 'over', winner: this.winner });
        }
        break;
      }
    }
    this.tick++;
  }

  /** Saque: la pelota quieta espera al que saca. */
  serveStep() {
    this.serveClock++;
    const sp = this.player(this.server);
    if (!sp || !sp.d || sp.team !== this.serveTeam) {
      // el que sacaba se fue o cambió de equipo (o el equipo estaba vacío y llegó alguien)
      const was = this.server;
      const now = this.pickServer();
      if (now || was) {
        this.serveClock = 0;
        this.placeServe();
      }
      if (!now && this.serveClock >= AUTO_SERVE && this.players.some((q) => q.d)) this.serve(null, true);
      return;
    }
    if (this.serveClock >= SERVE_MIN && sp.kicking && sp.cd <= 0 && this.reach(sp)) this.serve(sp);
    else if (this.serveClock >= SERVE_WAIT) this.serve(sp, true);
  }

  /** Golpes con la pelota en juego: le pega el más cercano de los que la tienen al alcance. */
  kicks() {
    let best = null;
    let bestD = Infinity;
    const b = this.ball;
    for (const p of this.players) {
      if (!p.d || !p.kicking || p.cd > 0 || !this.reach(p)) continue;
      const dd = (b.x - p.d.x) ** 2 + (b.y - p.d.y) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    if (best) this.hit(best);
  }

  hit(p) {
    const st = this.st;
    const b = this.ball;
    const d = p.d;
    const dx = b.x - d.x;
    const dy = b.y - d.y;
    const l = Math.sqrt(dx * dx + dy * dy);
    const [nx, ny] = l > 0.5 ? [dx / l, dy / l] : [0, -1];
    const team = p.team;
    const fwd = -SIDE[team];
    const rival = this.touchTeam !== team && this.touchTeam !== 0;
    [b.vx, b.vy] = kickVelocity(st, b.vx, b.vy, nx, ny, d.vx, d.vy);
    p.kicking = false;
    p.cd = KICK_MIN;
    const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    let kind = 'pass';
    if (rival && Math.abs(b.x) < BLOCK_X && b.y < -st.netH && b.vx * fwd > 0.5) kind = 'block';
    else if (b.vy > 1.2 && b.vx * fwd > 1 && b.y < 8 - st.netH) kind = 'spike';
    else if (v > st.kick.strength * 1.12 && b.vx * fwd > 2.5) kind = 'bomb';
    if (kind === 'block') {
      // el bloqueo no cuenta como toque
      this.touchTeam = team;
      this.touches = 0;
    } else if (this.touchTeam === team) this.touches++;
    else {
      this.touchTeam = team;
      this.touches = 1;
    }
    this.rally++;
    this.netHit = false;
    this.hist.push({ id: p.id, team, kind });
    if (this.hist.length > 12) this.hist.shift();
    this.lastId = p.id;
    this.lastKind = kind;
    this.lastTick = this.tick;
    const s = this.stat(p);
    s.touches++;
    if (kind === 'spike') s.spikes++;
    this.events.push({ t: 'hit', id: p.id, team, kind, x: b.x, y: b.y, v, n: this.touches });
    if (this.touches > 3) this.point(3 - team, 'four');
  }

  /** Pelota en juego: vuelo, red, paredes y el piso, que define el punto. */
  play() {
    const b = this.ball;
    const px = b.x;
    const hit = stepBall(b, this.st);
    if ((px < 0) !== (b.x < 0)) this.touches = 0; // pasó al otro lado
    if (hit & 1) {
      this.netHit = true;
      if (b.imp > 0.4) this.events.push({ t: 'net', v: b.imp, x: b.x, y: b.y });
    }
    if (hit & 4 && b.imp > 0.6) this.events.push({ t: 'wall', v: b.imp, x: b.x, y: b.y });
    if (hit & 2) {
      this.events.push({ t: 'land', x: b.x, y: b.y, v: b.imp });
      this.point(b.x < 0 ? TEAM.BLUE : TEAM.RED, 'floor');
    }
  }

  /** Pelota muerta (después del punto): sigue picando y rodando, sin reglas. */
  loose() {
    const b = this.ball;
    if (!b.live) return;
    const hit = stepBall(b, this.st);
    if (hit & 2 && b.imp > 1) this.events.push({ t: 'land', x: b.x, y: b.y, v: b.imp, dead: true });
    if (hit & 1 && b.imp > 0.6) this.events.push({ t: 'net', v: b.imp, x: b.x, y: b.y });
  }

  /**
   * Punto para `win`. reason: floor (tocó el piso del lado rival) o four (4 toques). Se clasifica
   * para los carteles y el relato: ace, remate, bombazo, bloqueo, error, red…
   */
  point(win, reason) {
    const lose = 3 - win;
    const b = this.ball;
    this.state = 2;
    this.timer = POINT_TICKS;
    this.score[win]++;
    this.best = Math.max(this.best, this.rally);
    const hist = this.hist;
    const last = hist[hist.length - 1] || null;
    const byId = (id) => (id ? this.player(id) || { id, name: this.stats[id]?.name || '?', team: this.stats[id]?.team } : null);
    const who = (h) => {
      const q = h && byId(h.id);
      return q ? { id: q.id, name: q.name } : null;
    };
    // golpes del equipo que perdió al final del punto, y el último del que ganó antes de esos
    let i = hist.length - 1;
    let n = 0;
    while (i >= 0 && hist[i].team === lose) {
      n++;
      i--;
    }
    const att = i >= 0 ? hist[i] : null;
    const mine = n ? last : null;
    const credit = { serve: 'ace', spike: 'kill', bomb: 'bomb', block: 'block' };
    let kind;
    let by = null; // quién hizo el punto
    let vs = null; // quién llegó a tocarla sin poder sostenerla, o quién se equivocó
    if (reason === 'four') {
      kind = 'four';
      vs = who(last);
    } else if (mine?.kind === 'serve') {
      kind = 'serveFault';
      vs = who(mine);
    } else if (!n) {
      // la mandó el que ganó y picó del otro lado sin que nadie la toque
      by = who(att);
      kind = (att && credit[att.kind]) || 'in';
    } else if (n === 1 && att) {
      // el rival llegó a tocarla pero no la pudo sostener: punto del que la mandó
      by = who(att);
      vs = who(mine);
      kind = credit[att.kind] || 'in';
    } else {
      // la tenía y se le cayó de su lado (o la tiró a la red)
      kind = this.netHit ? 'net' : 'own';
      vs = who(mine || last);
    }
    // estadísticas
    const sb = by && this.player(by.id);
    if (sb) {
      const s = this.stat(sb);
      s.points++;
      if (kind === 'ace') s.aces++;
      if (kind === 'kill' || kind === 'bomb' || kind === 'in') s.kills++;
      if (kind === 'block') s.blocks++;
    }
    if (kind === 'ace') this.team.aces[win]++;
    if (kind === 'kill' || kind === 'bomb' || kind === 'in') this.team.kills[win]++;
    if (kind === 'block') this.team.blocks[win]++;
    const err = kind === 'own' || kind === 'net' || kind === 'four' || kind === 'serveFault';
    if (err) {
      this.team.errors[lose]++;
      const q = vs && this.player(vs.id);
      if (q) this.stat(q).errors++;
    }
    // saca el que hizo el punto; si recupera el saque, rota
    if (win !== this.serveTeam) {
      this.serveTeam = win;
      this.serveIdx[win]++;
    }
    this.events.push({ t: 'point', team: win, kind, by, vs, rally: this.rally, score: [this.score[1], this.score[2]], x: b.x, y: b.y });
  }

  timeUp() {
    return this.cfg.timeLimit > 0 && this.time >= this.cfg.timeLimit * 60 * TPS;
  }

  /** ¿Ya hay ganador? Por puntos (con diferencia de 2 si corresponde) o por tiempo. */
  decided() {
    const a = this.score[1];
    const b = this.score[2];
    const sl = this.cfg.scoreLimit;
    if (sl > 0 && Math.max(a, b) >= sl && (!this.cfg.winBy2 || Math.abs(a - b) >= 2)) return true;
    return this.timeUp() && a !== b;
  }

  /** Con el tiempo cumplido y empate: el próximo punto gana. */
  get golden() {
    return this.timeUp() && this.score[1] === this.score[2] && this.state < 3;
  }

  /** Punto de partido para algún equipo (para el marcador). */
  get matchPoint() {
    const sl = this.cfg.scoreLimit;
    if (!sl || this.state >= 3) return 0;
    for (const t of [1, 2]) {
      const me = this.score[t] + 1;
      const other = this.score[3 - t];
      if (me >= sl && (!this.cfg.winBy2 || me - other >= 2)) return t;
    }
    return 0;
  }

  end() {
    this.state = 3;
    this.timer = END_TICKS;
    this.winner = this.score[1] > this.score[2] ? 1 : 2;
    this.events.push({ t: 'end', winner: this.winner, score: [this.score[1], this.score[2]] });
  }

  /** Resumen final: marcador, punto más largo, totales por equipo y estadísticas por jugador. */
  summary() {
    const T = this.team;
    return {
      score: [this.score[1], this.score[2]],
      winner: this.winner,
      time: Math.round(this.time / TPS),
      best: this.best,
      kills: [T.kills[1], T.kills[2]],
      aces: [T.aces[1], T.aces[2]],
      blocks: [T.blocks[1], T.blocks[2]],
      errors: [T.errors[1], T.errors[2]],
      stats: Object.entries(this.stats).map(([id, s]) => ({ id, ...s })),
    };
  }

  // ---------------------------------------------------------------- red
  /** Estado completo para sincronizar clientes (sin la geometría fija). */
  snapshot() {
    const b = this.ball;
    return {
      k: this.tick,
      s: this.state,
      tm: this.timer,
      ti: this.time,
      sc: [this.score[1], this.score[2]],
      sv: [this.serveTeam, this.serveIdx[1], this.serveIdx[2], this.serveClock],
      sr: this.server,
      tt: [this.touchTeam, this.touches, this.rally, this.netHit ? 1 : 0],
      hi: this.hist.map((x) => [x.id, x.team, x.kind]),
      w: this.winner,
      b: [r3(b.x), r3(b.y), r3(b.vx), r3(b.vy), b.live ? 1 : 0],
      p: this.players.filter((p) => p.d).map((p) => [p.id, p.team, r3(p.d.x), r3(p.d.y), r3(p.d.vx), r3(p.d.vy), p.input, p.kicking ? 1 : 0, p.cd]),
    };
  }

  /** Aplica un estado del servidor. `info(id)` devuelve { name, avatar } para jugadores nuevos. */
  applySnapshot(s, info = () => ({})) {
    this.tick = s.k;
    this.state = s.s;
    this.timer = s.tm;
    this.time = s.ti;
    this.score[1] = s.sc[0];
    this.score[2] = s.sc[1];
    [this.serveTeam, this.serveIdx[1], this.serveIdx[2], this.serveClock] = s.sv;
    this.server = s.sr;
    [this.touchTeam, this.touches, this.rally] = s.tt;
    this.netHit = !!s.tt[3];
    this.hist = s.hi.map(([id, team, kind]) => ({ id, team, kind }));
    const last = this.hist[this.hist.length - 1];
    this.lastId = last ? last.id : null;
    this.lastKind = last ? last.kind : '';
    this.winner = s.w;
    const b = this.ball;
    [b.x, b.y, b.vx, b.vy] = s.b;
    b.live = !!s.b[4];
    const seen = new Set();
    let changed = false;
    const pp = this.st.player;
    for (const [id, team, x, y, vx, vy, input, kicking, cd] of s.p) {
      seen.add(id);
      let p = this.player(id);
      if (!p || p.team !== team || !p.d) {
        const inf = info(id) || {};
        p = this.addPlayer({ id, team, name: inf.name, avatar: inf.avatar }, false);
        changed = true;
      }
      Object.assign(p.d, { x, y, vx, vy, damping: kicking ? pp.kickingDamping : pp.damping });
      p.input = input;
      p.kicking = !!kicking;
      p.cd = cd;
    }
    for (const p of [...this.players])
      if (!seen.has(p.id)) {
        this.players.splice(this.players.indexOf(p), 1);
        changed = true;
      }
    // mismo orden de discos que el servidor
    const order = s.p.map((e) => e[0]);
    this.players.sort((a, b2) => order.indexOf(a.id) - order.indexOf(b2.id));
    this.rebuild();
    return changed;
  }
}
