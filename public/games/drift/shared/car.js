/**
 * Drift Neon — física del auto (arcade con inercia).
 *
 * - El volante no gira el auto de golpe: define una velocidad de giro objetivo y el auto llega a
 *   ella con inercia (se siente el peso).
 * - El agarre lleva la velocidad hacia donde apunta la trompa. Con buen agarre el auto dobla
 *   "sobre rieles"; en derrape el agarre trasero cae y la cola se abre.
 * - Entrar en derrape: freno de mano doblando, o frenar/acelerar fuerte en plena curva.
 * - Sostenerlo: acelerador (mantiene la cola suelta) + volante para dosificar el ángulo;
 *   contravolante lo cierra. Soltar el acelerador devuelve el agarre y el auto se endereza.
 * - Pasado cierto ángulo el auto hace trompo.
 *
 * Unidades: 10 unidades ≈ 1 m; velocidades en unidades/s (× 0,36 ≈ km/h).
 */
export const TUNE = {
  engine: 470,
  vmax: 860,
  boostV: 1120,
  boostF: 1.55,
  brake: 1250,
  reverse: 260,
  drag: 0.00018,
  roll: 30,
  turn: 3.0, // rad/s de giro a velocidad media con volante a fondo
  gripN: 34, // qué tan rápido la velocidad sigue a la trompa (agarre normal)
  gripD: 3.2, // en derrape, con acelerador
  gripH: 1.1, // con freno de mano
  scrub: 0.36, // pérdida de velocidad por ir de costado
  driftTurn: 1.55, // en derrape el auto rota más
  spinAngle: 1.45, // ángulo (rad) a partir del cual es trompo
};

export const kmh = (v) => Math.round(Math.abs(v) * 0.36);

export function makeCar(o = {}) {
  return { x: 0, y: 0, h: 0, vx: 0, vy: 0, w: 0, steer: 0, speed: 0, u: 0, slip: 0, drift: 0, spin: 0, boosting: false, drifting: false, nitro: 0.35, ...o };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Un paso de física.
 * inp: { gas 0..1, brake 0..1, steer −1..1, hand bool, boost bool }
 * grip: multiplicador de agarre de la superficie (nieve < 1, banquina < 1).
 */
export function stepCar(c, inp, dt, grip = 1, T = TUNE) {
  const speed0 = Math.hypot(c.vx, c.vy);
  const slip0 = c.slip;

  // volante suavizado (más rápido al volver al centro)
  const st = clamp(inp.steer || 0, -1, 1);
  const rate = (Math.abs(st) < Math.abs(c.steer) ? 9 : 6) * dt;
  c.steer += clamp(st - c.steer, -rate, rate);

  // ---- estado de derrape
  const turning = Math.abs(c.steer) > 0.25;
  if (inp.hand && speed0 > 200 && turning) c.drift = 1;
  // frenada o acelerón fuerte en plena curva: la cola se suelta
  if (!c.drift && speed0 > 420 && Math.abs(c.steer) > 0.85 && (inp.brake > 0.5 || (inp.gas > 0.9 && speed0 < 560)) && Math.abs(c.w) > 1.6) c.drift = 0.8;
  if (c.drift > 0) {
    const holding = inp.hand || inp.gas > 0.35;
    if (!holding) c.drift -= dt * 2.6; // soltar el acelerador devuelve el agarre
    if (Math.abs(slip0) < 0.08 && !inp.hand && c.driftAge > 0.35) c.drift -= dt * 3.5; // ya está derecho
    if (speed0 < 140) c.drift -= dt * 3;
    c.drift = clamp(c.drift, 0, 1);
    c.driftAge = (c.driftAge || 0) + dt;
  } else c.driftAge = 0;
  const D = c.drift;

  // ---- giro (velocidad angular con inercia)
  const fx0 = Math.cos(c.h);
  const fy0 = Math.sin(c.h);
  const u0 = c.vx * fx0 + c.vy * fy0;
  const sp = Math.abs(u0);
  const sf = clamp(sp / 230, 0, 1) * (1 - clamp((sp - 650) / 1400, 0, 0.3));
  const dir = u0 < -5 ? -1 : 1;
  let wTarget = c.steer * T.turn * sf * dir * (1 + D * (T.driftTurn - 1));
  // en derrape la cola tiende a seguir abriéndose (hay que dosificar con el volante)
  wTarget += D * -slip0 * 0.45 * clamp(speed0 / 500, 0, 1);
  const resp = D > 0 ? 5 : 9;
  c.w += (wTarget - c.w) * Math.min(1, dt * resp);
  c.w = clamp(c.w, -4, 4);
  c.h += c.w * dt;

  // velocidad (que está en el mundo) vista desde la nueva orientación
  const fx = Math.cos(c.h);
  const fy = Math.sin(c.h);
  let u = c.vx * fx + c.vy * fy;
  let lat = -c.vx * fy + c.vy * fx;
  const speed = Math.hypot(u, lat);
  const slip = speed > 30 ? Math.atan2(lat, Math.abs(u)) : 0;

  // ---- fuerzas a lo largo de la trompa
  c.boosting = !!inp.boost && c.nitro > 0.01 && inp.gas > 0.1;
  const vmax = c.boosting ? T.boostV : T.vmax;
  let acc = 0;
  if (inp.gas > 0) {
    if (u >= -20) acc += inp.gas * T.engine * (c.boosting ? T.boostF : 1) * (1 + D * 0.35 * Math.cos(slip)) * Math.max(0, 1 - (Math.max(0, u) / vmax) ** 2) * (grip < 1 ? 0.85 + grip * 0.15 : 1);
    else acc += inp.gas * T.brake;
  }
  if (inp.brake > 0) {
    if (u > 25) acc -= inp.brake * T.brake;
    else if (u > -T.reverse) acc -= inp.brake * T.engine * 0.6;
  }
  if (inp.hand) acc -= Math.sign(u) * Math.min(Math.abs(u) * 4, 260);
  acc -= Math.sign(u) * Math.min(Math.abs(u) * 6, T.roll + T.drag * u * u);
  u += acc * dt;
  if (Math.abs(u) < 2 && !inp.gas && !inp.brake) u = 0;

  // ---- agarre: la dirección de la velocidad gira hacia la trompa (sin crear ni quitar energía;
  // lo que se pierde es el roce de ir de costado)
  let g = T.gripN * grip;
  if (D > 0) g = (T.gripN + (T.gripD - T.gripN) * D) * (0.7 + 0.3 * grip);
  if (inp.hand) g = Math.min(g, T.gripH);
  const mag = Math.hypot(u, lat);
  if (mag > 1) {
    const back = u < -5;
    let sl = Math.atan2(lat, back ? -u : u);
    sl *= Math.exp(-g * dt);
    const ss = Math.abs(Math.sin(sl));
    const loss = 1 - ss * T.scrub * dt * (D > 0 ? 0.35 + 1.5 * ss * ss : 1.4);
    const m2 = mag * loss;
    u = (back ? -1 : 1) * m2 * Math.cos(sl);
    lat = m2 * Math.sin(sl);
  }

  // ---- trompo
  if (Math.abs(slip) > T.spinAngle && speed > 150) c.spin = Math.max(c.spin, 0.9);
  if (c.spin > 0) {
    c.spin -= dt;
    u *= 1 - dt * 1.8;
    lat *= 1 - dt * 1.8;
    c.drift = 0;
  }

  c.vx = u * fx - lat * fy;
  c.vy = u * fy + lat * fx;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.u = u;
  c.speed = Math.hypot(u, lat);
  c.slip = c.speed > 30 ? Math.atan2(lat, Math.abs(u)) : 0;
  c.drifting = c.speed > 220 && Math.abs(c.slip) > 0.2 && c.spin <= 0;
  if (c.boosting) c.nitro = Math.max(0, c.nitro - dt * 0.4);
  return c;
}

/** Choque contra una pared con normal (nx, ny) que apunta hacia adentro de la pista. */
export function hitWall(c, nx, ny) {
  const vn = c.vx * nx + c.vy * ny;
  if (vn >= 0) return 0;
  const imp = -vn;
  // se pierde la componente contra la pared (con un rebote si el golpe es fuerte) y algo de la
  // tangencial según la fuerza del golpe: rozar la barrera frena poco, chocarla de frente mucho
  const tx = -ny;
  const ty = nx;
  const vt = c.vx * tx + c.vy * ty;
  const keepT = 1 - Math.min(0.3, imp / 1500);
  const bounce = imp > 60 ? 0.25 : 0;
  c.vx = tx * vt * keepT + nx * imp * bounce;
  c.vy = ty * vt * keepT + ny * imp * bounce;
  // la trompa se acomoda un poco hacia la pared (no queda trabada de frente)
  const along = Math.atan2(ty * Math.sign(vt || 1), tx * Math.sign(vt || 1));
  c.h += wrap(along - c.h) * Math.min(0.35, imp / 1200);
  if (imp > 120) c.w *= 0.5;
  if (imp > 260) c.drift = 0;
  return imp;
}
