/**
 * Billar — física determinista (cliente, CPU y servidor usan este mismo archivo).
 *
 * Mesa de 200 × 100 cm, bolas de radio 2,9 cm. Cada bola tiene velocidad (vx, vy) y giro
 * (wx, wy, wz): mientras el punto de contacto con el paño resbala, la fricción lo lleva a rodar
 * (así funcionan el efecto de retroceso, el de seguimiento y el tiro "planchado"); rodando, frena
 * de a poco. El efecto lateral (wz) cambia el rebote en las bandas.
 *
 * Paso fijo de 1/600 s y solo + − × ÷ √: el mismo tiro da exactamente el mismo resultado en el
 * servidor y en cualquier navegador.
 */
export const L = 200;
export const W = 100;
export const R = 2.9;
export const DT = 1 / 600;
export const MAX_SPEED = 720;
export const HEAD_X = L / 4; // línea de salida (zona de saque)
export const FOOT = [L * 0.73, W / 2];

const G = 981;
const MU_SLIDE = 0.2;
const MU_ROLL = 0.0115;
const SPIN_DECEL = 11;
const E_BALL = 0.95;
const E_RAIL = 0.76;

// troneras: [x, y, radio de captura]
export const POCKETS = [
  [-2.3, -2.3, 5],
  [L / 2, -4.2, 4.7],
  [L + 2.3, -2.3, 5],
  [-2.3, W + 2.3, 5],
  [L / 2, W + 4.2, 4.7],
  [L + 2.3, W + 2.3, 5],
];
/** Punto al que conviene apuntar para cada tronera (un poco adentro de la boca). */
export const POCKET_AIM = [
  [1.2, 1.2],
  [L / 2, 0.2],
  [L - 1.2, 1.2],
  [1.2, W - 1.2],
  [L / 2, W - 0.2],
  [L - 1.2, W - 1.2],
];

// bandas: segmentos [x1, y1, x2, y2] (los extremos redondeados son las puntas de las troneras)
const C = 6.2; // boca de las esquinas
const S = 5.4; // media boca de los laterales
const J = 4.6; // largo de las mandíbulas
export const CUSHIONS = [
  [C, 0, L / 2 - S, 0],
  [L / 2 + S, 0, L - C, 0],
  [C, W, L / 2 - S, W],
  [L / 2 + S, W, L - C, W],
  [0, C, 0, W - C],
  [L, C, L, W - C],
  // mandíbulas de las esquinas
  [C, 0, C - J, -J],
  [0, C, -J, C - J],
  [L - C, 0, L - C + J, -J],
  [L, C, L + J, C - J],
  [C, W, C - J, W + J],
  [0, W - C, -J, W - C + J],
  [L - C, W, L - C + J, W + J],
  [L, W - C, L + J, W - C + J],
  // mandíbulas de los laterales
  [L / 2 - S, 0, L / 2 - S - 1.1, -J],
  [L / 2 + S, 0, L / 2 + S + 1.1, -J],
  [L / 2 - S, W, L / 2 - S - 1.1, W + J],
  [L / 2 + S, W, L / 2 + S + 1.1, W + J],
];

export function makeBall(n, x, y) {
  return { n, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true, rest: true };
}

export function cloneBalls(balls) {
  return balls.map((b) => ({ ...b }));
}

/**
 * Golpe de taco a la blanca. dir: vector unitario; speed en cm/s; spinX (efecto lateral) y
 * spinY (arriba +, abajo −) entre −1 y 1. Devuelve el estado inicial exacto a aplicar.
 */
export function strike(dirX, dirY, speed, spinX, spinY) {
  const off = 0.5 * R;
  const k = (5 * speed) / (2 * R * R);
  const roll = k * spinY * off;
  return { vx: dirX * speed, vy: dirY * speed, wx: -dirY * roll, wy: dirX * roll, wz: -k * spinX * off };
}

/** ¿El golpe recibido es posible? (para validar lo que manda un cliente) */
export function validStrike(s) {
  for (const k of ['vx', 'vy', 'wx', 'wy', 'wz']) if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) return false;
  const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  if (v > MAX_SPEED * 1.001 || v < 1) return false;
  const lim = ((5 * v) / (2 * R * R)) * 0.5 * R * 1.01;
  return Math.sqrt(s.wx * s.wx + s.wy * s.wy) <= lim && Math.abs(s.wz) <= lim;
}

export function newEvents() {
  return { first: null, railAfter: 0, rails: 0, pocketed: [], cueRails: 0, time: 0, hits: 0, impact: 0, railV: 0 };
}

/** Un paso de simulación. Devuelve true si algo se sigue moviendo. */
export function step(balls, ev) {
  const dt = DT;
  let moving = false;
  // 1) fricción e integración
  for (const b of balls) {
    if (!b.on || b.rest) continue;
    const ux = b.vx - R * b.wy;
    const uy = b.vy + R * b.wx;
    const us = Math.sqrt(ux * ux + uy * uy);
    if (us > 0.4) {
      const dv = MU_SLIDE * G * dt;
      const fx = ux / us;
      const fy = uy / us;
      if (us <= 3.5 * dv) {
        b.vx -= (fx * us) / 3.5;
        b.vy -= (fy * us) / 3.5;
        b.wx = -b.vy / R;
        b.wy = b.vx / R;
      } else {
        b.vx -= fx * dv;
        b.vy -= fy * dv;
        const dw = ((2.5 * MU_SLIDE * G) / R) * dt;
        b.wy += fx * dw;
        b.wx -= fy * dw;
      }
    } else {
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const dec = MU_ROLL * G * dt;
      if (sp <= dec) {
        b.vx = 0;
        b.vy = 0;
      } else {
        b.vx -= (b.vx / sp) * dec;
        b.vy -= (b.vy / sp) * dec;
      }
      b.wx = -b.vy / R;
      b.wy = b.vx / R;
    }
    if (b.wz !== 0) {
      const d = SPIN_DECEL * dt;
      b.wz = b.wz > d ? b.wz - d : b.wz < -d ? b.wz + d : 0;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.vx === 0 && b.vy === 0 && b.wz === 0 && b.wx === 0 && b.wy === 0) {
      b.wx = 0;
      b.wy = 0;
      b.rest = true;
    } else moving = true;
  }
  // 2) choques entre bolas
  const n = balls.length;
  const D2 = 4 * R * R;
  for (let i = 0; i < n; i++) {
    const a = balls[i];
    if (!a.on) continue;
    for (let j = i + 1; j < n; j++) {
      const b = balls[j];
      if (!b.on || (a.rest && b.rest)) continue;
      const dx = b.x - a.x;
      if (dx > 2 * R || dx < -2 * R) continue;
      const dy = b.y - a.y;
      if (dy > 2 * R || dy < -2 * R) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= D2 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vrel > 0) {
        const jn = ((1 + E_BALL) / 2) * vrel;
        a.vx -= jn * nx;
        a.vy -= jn * ny;
        b.vx += jn * nx;
        b.vy += jn * ny;
        a.rest = false;
        b.rest = false;
        moving = true;
        if (ev) {
          if (ev.first === null && (a.n === 0 || b.n === 0)) ev.first = a.n === 0 ? b.n : a.n;
          ev.hits++;
          if (vrel > ev.impact) ev.impact = vrel;
        }
      }
      const push = (2 * R - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
  // 3) bandas y troneras
  for (const b of balls) {
    if (!b.on || b.rest) continue;
    // solo cerca de los bordes hace falta revisar bandas
    if (b.x < C + R || b.x > L - C - R || b.y < C + R || b.y > W - C - R || Math.abs(b.x - L / 2) < S + R) {
      for (const s of CUSHIONS) cushion(b, s, ev);
    }
    for (let p = 0; p < POCKETS.length; p++) {
      const [px, py, pr] = POCKETS[p];
      const dx = b.x - px;
      const dy = b.y - py;
      if (dx * dx + dy * dy < pr * pr) {
        pocket(b, p, ev);
        break;
      }
    }
    // red de seguridad: si se escapó de la mesa, cae en la tronera más cercana
    if (b.on && (b.x < -7 || b.x > L + 7 || b.y < -7 || b.y > W + 7)) {
      let best = 0;
      let bd = Infinity;
      POCKETS.forEach(([px, py], p) => {
        const d = (b.x - px) ** 2 + (b.y - py) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      });
      pocket(b, best, ev);
    }
  }
  if (ev) ev.time += dt;
  return moving;
}

function cushion(b, s, ev) {
  const [x1, y1, x2, y2] = s;
  const ex = x2 - x1;
  const ey = y2 - y1;
  const len2 = ex * ex + ey * ey;
  let t = ((b.x - x1) * ex + (b.y - y1) * ey) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + ex * t;
  const cy = y1 + ey * t;
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= R * R || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const tx = -ny;
    const ty = nx;
    let vt = b.vx * tx + b.vy * ty;
    // el efecto lateral abre o cierra el ángulo de salida
    vt = vt * 0.94 + b.wz * R * 0.32;
    b.wz *= 0.45;
    const vn2 = -E_RAIL * vn;
    b.vx = vn2 * nx + vt * tx;
    b.vy = vn2 * ny + vt * ty;
    b.wx *= 0.65;
    b.wy *= 0.65;
    if (ev) {
      ev.rails++;
      if (-vn > ev.railV) ev.railV = -vn;
      if (ev.first !== null) ev.railAfter++;
      if (b.n === 0) ev.cueRails++;
    }
  }
  b.x = cx + nx * R;
  b.y = cy + ny * R;
}

function pocket(b, p, ev) {
  b.on = false;
  b.rest = true;
  b.vx = b.vy = b.wx = b.wy = b.wz = 0;
  b.pocket = p;
  if (ev) ev.pocketed.push([b.n, p, Math.round(ev.time * 1000)]);
}

/** Simula hasta que todo se detiene (máximo ~30 s de juego). */
export function simulate(balls, ev = newEvents(), maxSteps = 18000) {
  for (let i = 0; i < maxSteps; i++) if (!step(balls, ev)) break;
  for (const b of balls) {
    b.vx = b.vy = b.wx = b.wy = b.wz = 0;
    b.rest = true;
  }
  return ev;
}

/** Armado del triángulo: la 8 al centro, una lisa y una rayada en las esquinas de atrás. */
export function rack(rnd = Math.random) {
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  shuffle(solids);
  shuffle(stripes);
  const cornerSolidLeft = rnd() < 0.5;
  const back = cornerSolidLeft ? [solids.pop(), stripes.pop()] : [stripes.pop(), solids.pop()];
  const rest = shuffle([...solids, ...stripes]);
  const balls = [makeBall(0, HEAD_X - 6, W / 2)];
  const gap = 2 * R + 0.02;
  const rowDx = gap * Math.sqrt(3) * 0.5;
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      let n;
      if (row === 2 && k === 1) n = 8;
      else if (row === 4 && k === 0) n = back[0];
      else if (row === 4 && k === 4) n = back[1];
      else n = rest.pop();
      balls.push(makeBall(n, FOOT[0] + row * rowDx, FOOT[1] + (k - row / 2) * gap));
    }
  }
  balls.sort((a, b) => a.n - b.n);
  return balls;
}

/** ¿Se puede dejar la blanca en (x, y)? (bola en mano; en el saque, solo detrás de la línea) */
export function canPlace(balls, x, y, kitchen = false) {
  if (!(x >= R && x <= L - R && y >= R && y <= W - R)) return false;
  if (kitchen && x > HEAD_X) return false;
  for (const b of balls) {
    if (!b.on || b.n === 0) continue;
    if ((b.x - x) ** 2 + (b.y - y) ** 2 < (2 * R + 0.05) ** 2) return false;
  }
  return true;
}

/**
 * Primer contacto al tirar desde (x, y) en la dirección (dx, dy): bola, banda o nada.
 * Devuelve { ball, gx, gy (bola fantasma), t (distancia) } o { rail, gx, gy, nx, ny }.
 */
export function cast(balls, x, y, dx, dy, skip = 0) {
  let best = Infinity;
  let hit = null;
  for (const b of balls) {
    if (!b.on || b.n === skip) continue;
    // |p + t d - c| = 2R
    const fx = x - b.x;
    const fy = y - b.y;
    const bq = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - 4 * R * R;
    const disc = bq * bq - c;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0.001 && t < best) {
      best = t;
      hit = b;
    }
  }
  // bandas (como rectángulo interior a distancia R)
  let rt = Infinity;
  let nx = 0;
  let ny = 0;
  if (dx > 0) {
    const t = (L - R - x) / dx;
    if (t < rt) [rt, nx, ny] = [t, -1, 0];
  } else if (dx < 0) {
    const t = (R - x) / dx;
    if (t < rt) [rt, nx, ny] = [t, 1, 0];
  }
  if (dy > 0) {
    const t = (W - R - y) / dy;
    if (t < rt) [rt, nx, ny] = [t, 0, -1];
  } else if (dy < 0) {
    const t = (R - y) / dy;
    if (t < rt) [rt, nx, ny] = [t, 0, 1];
  }
  if (hit && best <= rt) return { ball: hit, gx: x + dx * best, gy: y + dy * best, t: best };
  return { rail: true, gx: x + dx * rt, gy: y + dy * rt, t: rt, nx, ny };
}
