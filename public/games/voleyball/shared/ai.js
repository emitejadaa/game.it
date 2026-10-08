/**
 * Voleyball — bots. Juegan con los mismos controles que una persona (8 direcciones + pegar, y hay que
 * soltar para volver a pegar), así que respetan la física y las reglas.
 *
 * Cada tick se simula la pelota hacia adelante con la misma física (red y paredes incluidas).
 * Si va a caer del lado propio, el equipo elige quién va (el que llega antes, mejor si no es el que
 * la tocó recién) y ese jugador busca, a lo largo de la trayectoria, dónde pararse y desde qué lado
 * pegarle: prueba direcciones de golpe, simula hacia dónde saldría la pelota y se queda con la mejor
 * según el toque: recibir hacia la red, armar alta para el remate o atacar al hueco (rematando desde
 * arriba cuando puede). Cuando la pelota llega, elige el instante del golpe comparando "pego ahora"
 * con "pego en un momento". Los demás se acomodan: uno arriba cerca de la red para rematar, el resto
 * en defensa, y cuando ataca el rival uno sube a bloquear.
 *
 * La dificultad cambia el tiempo de reacción, la velocidad, el error de puntería, cuánto se arriesga
 * a atacar antes del tercer toque, qué tan bien busca el hueco y si bloquea.
 */
import { KEY, SIDE, stepBall, ballCopy, kickVelocity, formation } from './match.js';

export const LEVELS = {
  easy: { react: 18, aim: 0.16, pace: 0.78, attack: 30, smart: 0.25, spike: 0.25, block: 0, miss: 0.12, serve: [0.5, 0.35, 0.15], wait: 75 },
  normal: { react: 9, aim: 0.07, pace: 0.92, attack: 18, smart: 0.7, spike: 0.6, block: 0.15, miss: 0.035, serve: [0.3, 0.4, 0.3], wait: 50 },
  hard: { react: 4, aim: 0.025, pace: 1, attack: 10, smart: 1, spike: 0.9, block: 0.25, miss: 0.006, serve: [0.2, 0.35, 0.45], wait: 35 },
};

const SIM = 260; // ticks que se simula la pelota hacia adelante
const LOOK = 120; // hasta dónde se buscan puntos de contacto
const OUT = 200; // ticks que se simula una pelota después de un golpe
const DK = 20; // distancia del centro del jugador a la pelota con la que se planea el golpe
const DEPTHS = [0.45, 0.62, 0.8]; // saque corto, medio y profundo (fracción de la cancha rival)
const ANG = Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12);
const XS = new Float64Array(OUT + 2);
const YS = new Float64Array(OUT + 2);

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function brain(level = 'normal', seed = 1) {
  return { L: LEVELS[level] || LEVELS.normal, rand: rng(seed * 2654435761), seen: -2, wait: 0, plan: null, planAt: -99, noise: 0, hit: false, inReach: false, serve: null, tx: null, ty: null, block: false, blockKey: -1, blockErr: 0 };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ movimiento
/**
 * ¿Cuántos ticks tarde llega (x, y) en n ticks? Negativo: llega con tiempo. La física es lineal: el
 * movimiento es lo que avanza dejándose llevar (x + v·(1−dⁿ)/(1−d)) más lo que suma acelerando a
 * fondo desde quieto (a/(1−d)·(n − d(1−dⁿ)/(1−d))). `slack`: a cuánto alcanza con estar.
 */
const POW = new Map();
function powers(D) {
  let t = POW.get(D);
  if (!t) {
    t = new Float64Array(1201);
    t[0] = 1;
    for (let i = 1; i <= 1200; i++) t[i] = t[i - 1] * D;
    POW.set(D, t);
  }
  return t;
}
function lateBy(d, x, y, n, pp, pace = 1, slack = 0) {
  const D = pp.damping;
  const pw = powers(D)[Math.min(1200, Math.max(0, n | 0))];
  const f = (1 - pw) / (1 - D);
  const dx = x - (d.x + d.vx * f);
  const dy = y - (d.y + d.vy * f);
  const v = (pp.acceleration * pace) / (1 - D);
  const X = v * (n - (D * (1 - pw)) / (1 - D));
  return (Math.sqrt(dx * dx + dy * dy) - slack - X) / v;
}

/**
 * Teclas para ir a (tx, ty) y frenar ahí: velocidad deseada hacia el punto, limitada para poder frenar
 * a tiempo (frenando a fondo se para en unos 3.6·v² píxeles), y en cada eje se acelera o se frena.
 */
function steer(p, tx, ty, pace = 1, pp) {
  const d = p.d;
  const dx = tx - d.x;
  const dy = ty - d.y;
  const D = Math.sqrt(dx * dx + dy * dy);
  const vmax = (pp.acceleration * pp.damping * pace) / (1 - pp.damping);
  // ya está (o casi) y quieto: no tocar nada, así no tiembla
  if (D < 2.5 && d.vx * d.vx + d.vy * d.vy < 0.09) return 0;
  let vx = 0;
  let vy = 0;
  if (D > 0.6) {
    const sp = Math.min(vmax, Math.sqrt(D / 3.6));
    vx = (dx / D) * sp;
    vy = (dy / D) * sp;
  }
  const ex = vx - d.vx;
  const ey = vy - d.vy;
  const th = 0.08;
  let bits = 0;
  if (ex > th) bits |= KEY.RIGHT;
  else if (ex < -th) bits |= KEY.LEFT;
  if (ey > th) bits |= KEY.DOWN;
  else if (ey < -th) bits |= KEY.UP;
  return bits;
}

/** Dónde va a estar el jugador en los próximos n ticks si sigue yendo hacia (tx, ty). */
function selfPath(p, tx, ty, pace, pp, n) {
  const d = { x: p.d.x, y: p.d.y, vx: p.d.vx, vy: p.d.vy };
  const q = { d };
  const out = [];
  for (let j = 0; j < n; j++) {
    const bits = steer(q, tx, ty, pace, pp);
    let x = (bits & KEY.RIGHT ? 1 : 0) - (bits & KEY.LEFT ? 1 : 0);
    let y = (bits & KEY.DOWN ? 1 : 0) - (bits & KEY.UP ? 1 : 0);
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    d.vx += x * pp.acceleration;
    d.vy += y * pp.acceleration;
    d.x += d.vx;
    d.y += d.vy;
    d.vx *= pp.damping;
    d.vy *= pp.damping;
    out.push({ x: d.x, y: d.y, vx: d.vx, vy: d.vy });
  }
  return out;
}

/** Punto válido para un jugador de ese lado (sin cruzar la red, el piso, las paredes ni el borde de arriba). */
function legal(st, s, x, y, r) {
  const ax = x * s;
  return ax >= r + 0.5 && ax <= st.cw - r && y <= -r && y >= r - st.height;
}

function clampSpot(st, s, x, y, r) {
  const ax = clamp(x * s, r + 1, st.cw - r - 1);
  return [ax * s, clamp(y, r + 1 - st.height, -r - 1)];
}

// ------------------------------------------------------------------ análisis compartido
/** Trayectoria de la pelota desde ahora hasta que toca el piso (una vez por tick para todos). */
function analyze(m) {
  const A = m.__ai;
  if (A && A.tick === m.tick && A.state === m.state) return A;
  const N = { tick: m.tick, state: m.state, path: [], land: -1, teams: [null, null, null] };
  if (m.state === 1) {
    const c = ballCopy(m.ball);
    for (let k = 0; k < SIM; k++) {
      const h = stepBall(c, m.st);
      N.path.push({ x: c.x, y: c.y, vx: c.vx, vy: c.vy });
      if (h & 2) {
        N.land = k + 1;
        break;
      }
    }
  }
  m.__ai = N;
  return N;
}

/** Pelota dentro de i ticks (0 = ahora). */
function at(m, A, i) {
  if (i <= 0) return m.ball;
  return A.path[Math.min(i, A.path.length) - 1];
}

/** Memoria del equipo entre ticks (quién va a la pelota, para no cambiar a cada rato). */
function mem(m) {
  return (m.__aiMem ||= { chaser: [null, null, null], key: [-9, -9, -9], active: {} });
}

// ------------------------------------------------------------------ resultado de un golpe
/** Simula la pelota después de un golpe; deja el recorrido en XS/YS. */
function outcome(st, x, y, vx, vy) {
  const b = { x, y, vx, vy, r: st.ball.r, imp: 0 };
  const o = { n: 0, x0: x, y0: y, vy0: vy, cross: -1, crossY: 0, crossNet: false, net: false, wall: false, sky: false, land: -1, landX: 0, apex: 0, apexY: y };
  for (let t = 0; t < OUT; t++) {
    const px = b.x;
    const h = stepBall(b, st);
    XS[t] = b.x;
    YS[t] = b.y;
    o.n = t + 1;
    if (h & 1) o.net = true;
    if (h & 4) o.wall = true;
    if (b.y < b.r - st.height) o.sky = true; // se va arriba del mapa
    if (b.y < o.apexY) {
      o.apexY = b.y;
      o.apex = t;
    }
    if (o.cross < 0 && (px < 0) !== (b.x < 0)) {
      o.cross = t;
      o.crossY = b.y;
      o.crossNet = o.net;
    }
    if (h & 2) {
      o.land = t;
      o.landX = b.x;
      break;
    }
  }
  return o;
}

/** Ataque: que pase limpia y pique del otro lado, rápido y lejos de los rivales. */
function attackScore(o, C) {
  if (o.x0 * C.s < 0 && o.cross < 0) {
    // bloqueo: ya está del otro lado y se la devuelve sin que cruce
    o.cross = 0;
    o.crossY = o.y0;
  }
  if (o.cross < 0 || o.land < 0 || o.landX * C.s > 0 || o.crossNet) return -Infinity;
  const clear = -o.crossY - C.netTop;
  let sc = 70;
  // sin ganas de rematar: más margen sobre la red y no importa tanto que sea rápida
  const safe = C.spike ? 14 : 30;
  if (clear < safe) sc -= (safe - clear) * (C.spike ? 2.5 : 1.2);
  sc -= (o.land - o.cross) * (C.spike ? 0.22 : 0.06);
  let cover = 45;
  for (const q of C.opp)
    for (let j = o.cross; j <= o.land; j += 3) {
      const late = lateBy(q.d, XS[j], YS[j], C.t0 + j, C.pp, 1, 18);
      if (late < cover) cover = late;
    }
  sc += clamp(cover, -45, 45) * C.smart;
  if (o.wall) sc -= 5;
  return sc;
}

/**
 * Pase: que quede de este lado, suba y baje cerca de Q despacio, a tiempo para que alguien llegue a
 * ponerse abajo.
 */
function passScore(o, C) {
  if (o.cross >= 0 && o.landX * C.s < 0) return -Infinity;
  const Q = C.Q;
  let best = -Infinity;
  let free = -Infinity;
  for (let j = Math.max(8, o.apex); j < o.n; j += 2) {
    const x = XS[j];
    const y = YS[j];
    if (y > -30 || x * C.s < 0) break;
    const dq = Math.sqrt((x - Q[0]) ** 2 + (y - Q[1]) ** 2);
    const v = Math.sqrt((x - XS[j - 1]) ** 2 + (y - YS[j - 1]) ** 2);
    let late = Infinity;
    // el que la toma: abajo para el armado; arriba y atrás para el remate
    const rx = x + C.rdx;
    const ry = y + C.rdy;
    for (const q of C.mates) late = Math.min(late, lateBy(q.d, rx, ry, C.t0 + j, C.pp, 1, 6));
    if (C.solo || !C.mates.length) late = Math.min(late, lateBy({ x: C.kx, y: C.ky, vx: 0, vy: 0 }, rx, ry, j - 8, C.pp, 1, 6));
    const q = -dq * 0.3 + Math.min(-late, 15) * 0.9 - Math.max(0, v - 3.5) * 6;
    if (q > best) best = q;
    // rescate: aunque no llegue bien al lugar, si queda alta y alguien llega abajo, se puede pasar
    if (y < -60 && late < -4 && v < 4.5) free = Math.max(free, 34 - Math.abs(x) * 0.03);
  }
  if (best === -Infinity) return -Infinity;
  let sc = Math.max(60 + best, free);
  const rise = o.y0 - o.apexY;
  if (rise < 50) sc -= (50 - rise) * 0.4;
  if (o.sky) sc -= 25; // si se va arriba del mapa no se la ve y nadie puede subir a rematarla
  const room = C.st.height + o.apexY; // lugar arriba de la pelota para rematarla
  if (room < 70) sc -= (70 - room) * 0.5;
  if (o.wall) sc -= 6;
  if (o.net) sc -= 20;
  if (o.cross >= 0) sc -= 25; // cruza y vuelve: raro
  return sc;
}

/** Puntaje de un golpe según el toque: el 3.º tiene que pasar; antes, pase salvo que el ataque convenga. */
function evaluate(o, C) {
  const att = attackScore(o, C);
  if (C.k >= 3) {
    if (att > -Infinity) return att;
    // no hay ataque limpio: al menos que cruce
    if (o.cross >= 0 && o.landX * C.s < 0) return -300 - o.land;
    return -900 + Math.min(0, o.apexY) * -0.1;
  }
  const pas = passScore(o, C);
  return Math.max(pas, att - C.bias);
}

/** A dónde se levanta jugando solo (cerca de la red) y el pase para rematar (alto, pegado a la red). */
function passSpot(st, s) {
  return [s * 85, -(st.netH + 95)];
}
function setSpot(st, s) {
  return [s * 50, -Math.min(st.netH + 105, st.height - 90)];
}

/** Contexto del equipo para puntuar golpes. */
function context(m, p, k) {
  const st = m.st;
  const s = SIDE[p.team];
  const mates = m.members(p.team).filter((q) => q !== p);
  const opp = m.members(3 - p.team);
  const solo = !mates.length;
  // en equipo, cada pase va alto y cerca de la red para que otro la remate (y el que la toma se pone
  // arriba y atrás); solo, primero se la levanta a sí mismo cerca de la red y se pone abajo
  const self = solo && k <= 1;
  const Q = self ? passSpot(st, s) : setSpot(st, s);
  const rdx = self ? 0 : s * 12;
  const rdy = self ? 12 : -14;
  return { s, k, st, pp: st.player, mates, opp, solo, Q, rdx, rdy, netTop: st.netH + st.ball.r, smart: 0.5, bias: 10, spike: true, kx: 0, ky: 0, t0: 0 };
}

// ------------------------------------------------------------------ plan del equipo
/** ¿Una persona del equipo está jugando (se movió en los últimos 1.5 s)? Si no, los bots van por ella. */
function engaged(m, q) {
  const M = mem(m);
  if (q.input & 15) M.active[q.id] = m.tick;
  return m.tick - (M.active[q.id] ?? -999) < 90;
}

/**
 * Qué hace el equipo: 'receive' si la pelota va a caer de este lado (hay que jugarla), 'defend' si cae
 * del otro. Elige quién va a la pelota, la ventana de ticks en la que se la puede tocar y, si viene un
 * ataque del rival por abajo, quién se queda en la red a bloquearlo.
 */
function teamPlan(m, team, A) {
  if (A.teams[team]) return A.teams[team];
  const st = m.st;
  const s = SIDE[team];
  const nh = st.netH;
  const P = { mode: 'defend', chaser: null, blocker: null, i0: 0, i1: -1, k: 1, crossY: 0 };
  A.teams[team] = P;
  if (m.state !== 1 || !A.path.length) return P;
  const lastI = A.path.length;
  const end = at(m, A, lastI);
  if (end.x * s <= 0) return P; // cae del otro lado
  // ventana: desde que entra (o está) de este lado hasta que toca el piso
  let i0 = lastI;
  while (i0 > 0 && at(m, A, i0 - 1).x * s > 0) i0--;
  P.mode = 'receive';
  P.i0 = i0;
  P.i1 = lastI;
  P.k = (m.touchTeam === team ? m.touches : 0) + 1;
  const pp = st.player;
  const list = m.members(team);
  // viene del rival y cruza bajo: el que está en la red se queda a bloquear
  if (i0 > 0 && list.length > 1) {
    P.crossY = at(m, A, i0).y;
    if (-P.crossY < nh + 130) {
      let bd = 70;
      for (const q of list) {
        if (!q.bot || !LEVELS[q.bot]?.block) continue;
        const dd = Math.hypot(q.d.x - s * 16, q.d.y - P.crossY);
        if (Math.abs(q.d.x) < 45 && dd < bd) {
          bd = dd;
          P.blocker = q;
        }
      }
    }
  }
  // quién va: el que llega antes a algún punto de la ventana
  const M = mem(m);
  let best = null;
  let bestT = Infinity;
  const etas = new Map();
  for (const q of list) {
    if (q === P.blocker || (!q.bot && !engaged(m, q))) continue;
    // el primer contacto que sirve: para pasar, abajo de la pelota; para atacar, mejor arriba y
    // atrás de una pelota alta cerca de la red (un contacto bajo cuenta como más tarde)
    let eta = Infinity;
    const pace = q.bot ? (LEVELS[q.bot]?.pace ?? 1) : 1;
    for (let i = Math.max(1, i0); i <= Math.min(lastI, i0 + LOOK); i += 2) {
      const B = at(m, A, i);
      if (B.y > -16) break;
      const h = -B.y;
      let cx = B.x;
      let cy = B.y + 14;
      let pen = h < 50 ? 20 : 0;
      if (P.k >= 3) {
        const high = h > nh + 40 && Math.abs(B.x) < 150;
        cx = B.x + s * (high ? 12 : 14);
        cy = B.y + (high ? -14 : 10);
        pen = high ? 0 : h < nh + 20 ? 40 : 15;
      }
      [cx, cy] = clampSpot(st, s, cx, cy, pp.radius);
      if (i + pen < eta && lateBy(q.d, cx, cy, i, pp, pace, 10) <= 0) eta = i + pen;
      if (eta <= i) break;
    }
    if (eta === Infinity) {
      // no llega: el que quede más cerca de donde cae
      const B = at(m, A, lastI);
      eta = 400 + Math.hypot(B.x - q.d.x, B.y - 16 - q.d.y) / 2.5;
    }
    if (list.length > 1 && m.lastId === q.id && m.touchTeam === team && P.k > 1) eta += 22; // mejor que la toque otro
    etas.set(q.id, eta);
    if (eta < bestT) {
      bestT = eta;
      best = q;
    }
  }
  // no cambiar de jugador por poco
  const prev = M.chaser[team];
  if (prev && M.key[team] === m.lastTick && etas.has(prev) && best && prev !== best.id && etas.get(prev) <= bestT + 10) best = m.player(prev);
  M.chaser[team] = best ? best.id : null;
  M.key[team] = m.lastTick;
  P.chaser = best;
  return P;
}

/** Busca el mejor contacto (cuándo, desde dónde y hacia dónde) a lo largo de la ventana. */
function planContact(m, p, A, P, C, L) {
  const st = m.st;
  const s = C.s;
  const pp = st.player;
  const fwd = -s;
  let best = null;
  const i0 = Math.max(1, P.i0);
  const i1 = Math.min(P.i1, i0 + LOOK);
  const stepI = i1 - i0 > 60 ? 3 : 2;
  for (let i = i0; i <= i1; i += stepI) {
    const B = at(m, A, i);
    if (B.y > -13) break;
    for (const a of ANG) {
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      if (nx * fwd < -0.75) continue; // hacia la pared propia no sirve
      // el punto más cercano desde donde la pelota queda en esa dirección (a 8–24 px del centro)
      const dd = clamp(nx * (B.x - p.d.x) + ny * (B.y - p.d.y), 8, DK + 4);
      const px = B.x - nx * dd;
      const py = B.y - ny * dd;
      if (!legal(st, s, px, py, pp.radius)) continue;
      // llegar un poco tarde se puede compensar (la pelota pasa de largo y queda al alcance un rato)
      const late = lateBy(p.d, px, py, i - 1, pp, L.pace, 3);
      if (late > 3) continue;
      C.t0 = i;
      const [vx, vy] = kickVelocity(st, B.vx, B.vy, nx, ny);
      C.kx = px;
      C.ky = py;
      const sc = evaluate(outcome(st, B.x, B.y, vx, vy), C) - i * 0.04 - Math.max(0, late) * 6;
      if (!best || sc > best.sc) best = { sc, i, px, py, tick: m.tick + i };
    }
  }
  return best;
}

/** Puntaje de pegar con la pelota en (bx, by) y el jugador en (px, py), con el error de puntería. */
function kickScore(st, C, B, bx, by, bvx, bvy, px, py, pvx, pvy, t0 = 0) {
  C.t0 = t0;
  let nx = bx - px;
  let ny = by - py;
  const l = Math.sqrt(nx * nx + ny * ny);
  if (l > 0.5) {
    nx /= l;
    ny /= l;
  } else {
    nx = 0;
    ny = -1;
  }
  if (B.noise) {
    const c = Math.cos(B.noise);
    const sn = Math.sin(B.noise);
    [nx, ny] = [nx * c - ny * sn, nx * sn + ny * c];
  }
  const [vx, vy] = kickVelocity(st, bvx, bvy, nx, ny, pvx, pvy);
  C.kx = px;
  C.ky = py;
  return evaluate(outcome(st, bx, by, vx, vy), C);
}

/**
 * ¿Pego ahora? Compara pegar en este tick con pegar en los próximos (mientras la pelota siga al
 * alcance, con el jugador yendo a donde va) y con lo que espera el plan. Si es la última
 * oportunidad, pega igual.
 */
function decideKick(m, p, A, C, B, force = -Infinity) {
  const st = m.st;
  const b = m.ball;
  const d = p.d;
  const R = d.r + b.r + st.kick.range - 0.4;
  if (p.cd > 0 || (b.x - d.x) ** 2 + (b.y - d.y) ** 2 > R * R) {
    B.inReach = false;
    return false;
  }
  if (!B.inReach) {
    B.inReach = true;
    // a veces calcula mal el ángulo (más error de puntería en este toque)
    if (B.rand() < B.L.miss) B.noise = (B.rand() < 0.5 ? -1 : 1) * (0.25 + B.rand() * 0.35);
  }
  const now = kickScore(st, C, B, b.x, b.y, b.vx, b.vy, d.x, d.y, d.vx, d.vy);
  let later = -Infinity;
  const fut = selfPath(p, B.tx ?? d.x, B.ty ?? d.y, B.L.pace, st.player, 7);
  for (let j = 1; j <= 7 && j <= A.path.length; j++) {
    const S = fut[j - 1];
    const Bj = at(m, A, j);
    if (Bj.y > -11) break;
    if ((Bj.x - S.x) ** 2 + (Bj.y - S.y) ** 2 > R * R) continue;
    const sc = kickScore(st, C, B, Bj.x, Bj.y, Bj.vx, Bj.vy, S.x, S.y, S.vx, S.vy, j);
    if (sc > later) later = sc;
  }
  // si el plan es pegarle más adelante (cuando baja, por ejemplo), no gastar el toque ahora
  const pl = B.plan;
  if (pl && !pl.desperate && pl.tick - m.tick > 6 && pl.sc > -100) later = Math.max(later, pl.sc - 4);
  if (later === -Infinity) return now > force; // se va: última oportunidad
  return now >= later - 1.5 && now > force;
}

// ------------------------------------------------------------------ lugares
/** Lugar de cada uno cuando no va a la pelota. */
function spot(m, p, P, B) {
  const st = m.st;
  const team = p.team;
  const s = SIDE[team];
  const nh = st.netH;
  const list = m.members(team);
  const others = list.filter((q) => q !== P.chaser && q !== P.blocker);
  const idx = Math.max(0, others.indexOf(p));
  const n = others.length;
  if (P.mode === 'receive') {
    if (P.k <= 2 && others.length) {
      // uno espera arriba y atrás de donde va el pase, para rematar; otro abajo por si hay que
      // armar; el resto cubre
      const [qx, qy] = setSpot(st, s);
      const S = [qx + s * 30, qy - 26];
      const role = nearest(others, S);
      if (p === role) return S;
      const rest = others.filter((q) => q !== role);
      const j = rest.indexOf(p);
      if (j === 0) return [qx + s * 40, qy + 70];
      return [s * st.cw * (0.5 + (0.3 * (j + 0.5)) / Math.max(1, rest.length)), -(50 + 35 * (j % 2))];
    }
    return defenseSpot(st, s, idx, n);
  }
  // defensa: si el rival puede atacar cerca de la red, uno sube a bloquear
  const blk = blocker(m, others);
  if (p === blk && B.block) {
    // a la altura por la que suelen pasar los remates, un poco corrida hacia donde está la pelota
    const b = m.ball;
    let h = nh + 42;
    if (b.x * s < 0 && Math.abs(b.x) < 150) h = clamp(nh + 42 + (-b.y - nh - 100) * 0.25, nh + 25, nh + 75);
    return [s * 16, -h];
  }
  const rest = blk && B.block ? others.filter((q) => q !== blk) : others;
  const j = Math.max(0, rest.indexOf(p));
  // el rival está por atacar (le toca el 3.º toque o la tiene alta cerca de la red): abajo, donde
  // suelen caer los remates
  const b = m.ball;
  const oppK = (m.touchTeam === 3 - team ? m.touches : 0) + 1;
  if (oppK >= 3 || (b.x * s < 0 && Math.abs(b.x) < 130 && -b.y > nh + 30)) {
    const k = rest.length;
    const f = k <= 1 ? 0.5 : j / (k - 1);
    return [s * Math.min(st.cw - 40, 70 + f * Math.min(150, st.cw - 110) + (k <= 1 ? 30 : 0)), -(34 + 14 * (j % 2))];
  }
  return defenseSpot(st, s, j, rest.length);
}

function defenseSpot(st, s, i, n) {
  if (n <= 1) return [s * st.cw * 0.5, -75];
  const f = 0.28 + (0.56 * i) / (n - 1);
  return [s * st.cw * f, -(50 + 45 * (i % 2))];
}

/** El más cercano a un lugar (las personas, solo si están mucho más cerca). */
function nearest(list, [x, y]) {
  let best = null;
  let bd = Infinity;
  for (const q of list) {
    const dd = Math.hypot(q.d.x - x, q.d.y - y) + (q.bot ? 0 : 60);
    if (dd < bd) {
      bd = dd;
      best = q;
    }
  }
  return best;
}

/** El que bloquea: el bot más cerca de la red. */
function blocker(m, list) {
  let best = null;
  let bd = Infinity;
  for (const q of list) {
    if (!q.bot || !LEVELS[q.bot]?.block) continue;
    const dd = Math.abs(q.d.x) + Math.abs(q.d.y + m.st.netH + 48) * 0.5;
    if (dd < bd) {
      bd = dd;
      best = q;
    }
  }
  return best;
}

// ------------------------------------------------------------------ saque
function serveThink(m, p, B) {
  const st = m.st;
  const L = B.L;
  const b = m.ball;
  const s = SIDE[p.team];
  const fwd = -s;
  const key = m.score[1] + m.score[2] * 1000;
  if (!B.serve || B.serve.key !== key) {
    // elige la profundidad y busca el ángulo (con algo de error según el nivel)
    const r = B.rand();
    const w = L.serve;
    const depth = DEPTHS[r < w[0] ? 0 : r < w[0] + w[1] ? 1 : 2] + (B.rand() - 0.5) * 0.12;
    const target = fwd * st.cw * depth;
    let best = null;
    for (let deg = 12; deg <= 78; deg += 1) {
      const a = (deg * Math.PI) / 180;
      const nx = fwd * Math.cos(a);
      const ny = -Math.sin(a);
      const [vx, vy] = kickVelocity(st, 0, 0, nx, ny, 0, 0, true);
      const o = outcome(st, b.x, b.y, vx, vy);
      if (o.cross < 0 || o.crossNet || o.sky || o.land < 0 || o.landX * fwd <= 0 || -o.crossY < st.netH + 22) continue;
      const err = Math.abs(o.landX - target);
      if (!best || err < best.err) best = { err, nx, ny };
    }
    const [nx, ny] = best ? [best.nx, best.ny] : [fwd * 0.6, -0.8];
    const e = (B.rand() * 2 - 1) * L.aim * 0.6;
    const c = Math.cos(e);
    const sn = Math.sin(e);
    B.serve = { key, nx: nx * c - ny * sn, ny: nx * sn + ny * c, at: L.wait + B.rand() * 40 };
  }
  const R = p.d.r + b.r + st.kick.range - 4;
  const tx = b.x - B.serve.nx * R;
  const ty = b.y - B.serve.ny * R;
  let bits = steer(p, tx, ty, 1, st.player);
  const d = p.d;
  const settled = Math.hypot(tx - d.x, ty - d.y) < 2 && Math.hypot(d.vx, d.vy) < 0.12;
  if (m.serveClock >= B.serve.at && (settled || m.serveClock > B.serve.at + 90) && !B.hit) {
    // que no salga a la red ni afuera (salvo un error de los fáciles)
    const dx = b.x - d.x;
    const dy = b.y - d.y;
    const l = Math.hypot(dx, dy);
    const [vx, vy] = kickVelocity(st, 0, 0, dx / l, dy / l, d.vx, d.vy, true);
    const o = outcome(st, b.x, b.y, vx, vy);
    const ok = o.cross >= 0 && !o.crossNet && o.land >= 0 && o.landX * fwd > 0;
    if (ok || m.serveClock > B.serve.at + 150 || B.rand() < L.miss * 0.2) bits |= KEY.HIT;
  }
  return bits;
}

// ------------------------------------------------------------------ bot
/** Teclas del bot `p` para este tick. */
export function think(m, p, B) {
  const st = m.st;
  const L = B.L;
  const d = p.d;
  if (!d) return 0;
  const A = analyze(m);
  const s = SIDE[p.team];
  let bits = 0;
  (m.__aiBrains ||= {})[p.id] = B;
  const out = (x) => {
    if (x & KEY.HIT && B.hit) x &= ~KEY.HIT; // hay que soltar para volver a pegar
    B.hit = !!(x & KEY.HIT);
    return x;
  };
  if (m.state === 0) {
    if (m.server === p.id) return out(serveThink(m, p, B));
    // los demás a su lugar
    const list = m.members(p.team).filter((q) => q.id !== m.server);
    const [fx, fy] = formation(st, p.team, Math.max(0, list.indexOf(p)), list.length);
    return out(steer(p, fx, fy, 0.7, st.player));
  }
  if (m.state !== 1) {
    const list = m.members(p.team);
    const [fx, fy] = formation(st, p.team, Math.max(0, list.indexOf(p)), list.length);
    return out(steer(p, fx, fy, 0.5, st.player));
  }
  // tiempo de reacción: cuando cambia la trayectoria (alguien le pegó), tarda en darse cuenta
  if (m.lastTick !== B.seen) {
    B.seen = m.lastTick;
    B.wait = L.react;
    B.plan = null;
    B.noise = (B.rand() * 2 - 1) * L.aim;
    B.spike = B.rand() < L.spike;
    B.inReach = false;
  }
  if (B.wait > 0) {
    B.wait--;
    if (B.tx !== null) bits = steer(p, B.tx, B.ty, L.pace, st.player);
    return out(bits);
  }
  const P = teamPlan(m, p.team, A);
  // ¿bloquea en esta jugada del rival? (se decide una vez cada vez que el rival agarra la pelota)
  const poss = m.touchTeam === p.team ? 0 : m.touchTeam;
  if (B.blockKey !== poss) {
    B.blockKey = poss;
    if (poss) {
      B.block = B.rand() < L.block;
      B.blockErr = (B.rand() * 2 - 1) * 16 * (1 - L.smart * 0.5); // a qué altura cree que va a pasar
    }
  }
  if (P.mode === 'receive' && P.chaser === p) {
    const C = context(m, p, P.k);
    C.smart = L.smart;
    C.spike = B.spike;
    C.bias = L.attack + (P.k === 1 ? 20 : -6); // de primera solo si es un punto seguro
    if (!B.plan || m.tick - B.planAt >= (B.plan.i - (m.tick - B.planAt) < 25 ? 3 : 8)) {
      const plan = planContact(m, p, A, P, C, L);
      B.planAt = m.tick;
      if (plan) B.plan = plan;
      else if (!B.plan || B.plan.desperate || B.plan.tick - m.tick < -4) {
        // no llega a ningún lado: hacia la trayectoria, al punto que menos le cuesta
        let best = null;
        for (let i = Math.max(1, P.i0); i <= P.i1; i += 2) {
          const E = at(m, A, i);
          const late = lateBy(d, E.x, E.y + 12, i, st.player, L.pace, 10);
          if (!best || late < best.late) best = { late, i, x: E.x, y: E.y + 12 };
        }
        const [x, y] = best ? clampSpot(st, s, best.x, best.y, st.player.radius) : [d.x, d.y];
        B.plan = { px: x, py: y, i: best ? best.i : 0, tick: m.tick + (best ? best.i : 0), desperate: true };
      }
    }
    B.tx = B.plan.px;
    B.ty = B.plan.py;
    bits = steer(p, B.tx, B.ty, L.pace, st.player);
    if (P.k <= 3 && decideKick(m, p, A, C, B)) bits |= KEY.HIT; // un 4.º toque es falta: mejor ni tocarla
    return out(bits);
  }
  // se queda en la red a bloquear el ataque que viene: pega solo si sale un buen golpe de vuelta
  if (P.mode === 'receive' && P.blocker === p && B.block) {
    // se acomoda a la altura del ataque si llega; si no, se queda donde está
    const want = P.crossY - 6 + (B.blockErr || 0);
    const ty0 = Math.abs(want - d.y) < 30 ? want : d.y;
    const [tx, ty] = clampSpot(st, s, s * 16, ty0, st.player.radius);
    B.tx = tx;
    B.ty = ty;
    bits = steer(p, tx, ty, L.pace, st.player);
    const C = context(m, p, 3);
    C.smart = L.smart;
    if (decideKick(m, p, A, C, B, 15)) bits |= KEY.HIT;
    return out(bits);
  }
  // no va a la pelota: a su lugar, sin meterse en el camino del que va
  let [x, y] = spot(m, p, P, B);
  const ch = P.chaser && P.chaser !== p ? P.chaser : null;
  if (ch) {
    const cb = m.__aiBrains?.[ch.id];
    const cx = cb?.tx ?? ch.d.x;
    const cy = cb?.ty ?? ch.d.y;
    for (const [ax, ay] of [
      [cx, cy],
      [ch.d.x, ch.d.y],
    ]) {
      const dx = x - ax;
      const dy = y - ay;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < 48) {
        const k = (48 - dd) / (dd || 1);
        x += (dd ? dx : s) * k;
        y += (dd ? dy : 0) * k;
      }
    }
  }
  const [tx, ty] = clampSpot(st, s, x, y, st.player.radius);
  B.tx = tx;
  B.ty = ty;
  return out(steer(p, tx, ty, L.pace, st.player));
}
