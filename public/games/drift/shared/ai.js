/**
 * Drift Neon — pilotos de la compu. Usan la misma física que el jugador.
 *
 * - Línea de carrera: se pegan al interior de las curvas (desplazamiento suavizado).
 * - Velocidad objetivo por punto según la curvatura, con frenado anticipado (pasada hacia atrás).
 * - Manejo: persiguen un punto adelante sobre la línea, frenan antes de las curvas, tiran del
 *   freno de mano en las horquillas y usan nitro en las rectas.
 * - Tres niveles: velocidad en curva, reflejos, errores y cuánto aprovechan el nitro.
 */
import { TUNE } from './car.js';

const cache = new Map();

/** Línea de carrera y velocidades objetivo de una pista (se calcula una vez). */
export function racingLine(T) {
  if (cache.has(T.id)) return cache.get(T.id);
  const N = T.N;
  const maxOff = T.width / 2 - 34;
  const inside = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = T.curv[i];
    inside[i] = Math.sign(k) * Math.min(maxOff, Math.abs(k) * 26000); // derecha positiva = interior si dobla a la derecha
  }
  // suavizado: entrada y salida abiertas, vértice al interior
  const off = new Float32Array(N);
  const W = 22;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -W; k <= W; k++) s += inside[(i + k + N) % N];
    off[i] = Math.max(-maxOff, Math.min(maxOff, (s / (2 * W + 1)) * 1.35));
  }
  const lx = new Float32Array(N);
  const ly = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lx[i] = T.xs[i] - T.ty[i] * off[i];
    ly[i] = T.ys[i] + T.tx[i] * off[i];
  }
  // curvatura de la línea y velocidad máxima en cada punto
  const vmax = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 4 + N) % N;
    const b = (i + 4) % N;
    const h1 = Math.atan2(ly[i] - ly[a], lx[i] - lx[a]);
    const h2 = Math.atan2(ly[b] - ly[i], lx[b] - lx[i]);
    let d = h2 - h1;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const len = Math.hypot(lx[b] - lx[a], ly[b] - ly[a]) / 2 || 56;
    const k = Math.abs(d) / len;
    vmax[i] = Math.min(TUNE.vmax, (TUNE.turn * 0.93) / Math.max(k, 1e-5));
  }
  // frenado anticipado (dos vueltas hacia atrás para cerrar el circuito)
  const decel = 950;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = N - 1; i >= 0; i--) {
      const j = (i + 1) % N;
      const ds = T.dist[i + 1] - T.dist[i];
      const lim = Math.sqrt(vmax[j] * vmax[j] + 2 * decel * ds);
      if (lim < vmax[i]) vmax[i] = lim;
    }
  }
  const out = { off, lx, ly, vmax };
  cache.set(T.id, out);
  return out;
}

const LEVELS = [null, { pace: 0.68, top: 0.78, look: 1.1, noise: 0.18, hand: 0.25, nitro: 0.25 }, { pace: 0.8, top: 0.86, look: 1, noise: 0.08, hand: 0.6, nitro: 0.6 }, { pace: 1.0, top: 1, look: 0.92, noise: 0.025, hand: 0.9, nitro: 0.95 }];

export function makeDriver(level, rnd, personality = rnd()) {
  const L = LEVELS[level] || LEVELS[2];
  return { L, rnd, lane: (personality - 0.5) * 30, aggro: 0.9 + personality * 0.2, stuck: 0, reverse: 0, hand: 0, wobble: 0, wobbleT: 0 };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Decide los controles del auto `c` (que tiene idx: índice en la pista). */
export function drive(dr, c, T, dt, others = []) {
  const RL = racingLine(T);
  const N = T.N;
  const L = dr.L;
  const i = c.idx < 0 ? 0 : c.idx;
  const speed = c.speed;
  // punto a perseguir sobre la línea (más lejos cuanto más rápido)
  const ahead = (60 + speed * 0.32) * L.look;
  let j = i;
  let acc = 0;
  while (acc < ahead) {
    const n = (j + 1) % N;
    acc += T.dist[j + 1] - T.dist[j];
    j = n;
  }
  const lane = dr.lane * (1 - Math.min(1, Math.abs(RL.off[j]) / (T.width * 0.3)));
  let tx = RL.lx[j] - T.ty[j] * lane;
  let ty = RL.ly[j] + T.tx[j] * lane;
  // esquivar al que va adelante cerca
  for (const o of others) {
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > 150 || d < 1) continue;
    const fwd = (dx * Math.cos(c.h) + dy * Math.sin(c.h)) / d;
    if (fwd < 0.5) continue;
    const side = -dx * Math.sin(c.h) + dy * Math.cos(c.h) > 0 ? -1 : 1;
    tx += -Math.sin(c.h) * side * 55;
    ty += Math.cos(c.h) * side * 55;
  }
  const want = Math.atan2(ty - c.y, tx - c.x);
  // la trompa apunta a donde va la velocidad + corrección del derrape
  let err = wrap(want - c.h);
  // pequeños errores humanos
  dr.wobbleT -= dt;
  if (dr.wobbleT <= 0) {
    dr.wobbleT = 0.4 + dr.rnd() * 0.8;
    dr.wobble = (dr.rnd() - 0.5) * L.noise;
  }
  err += dr.wobble;
  let steer = Math.max(-1, Math.min(1, err * 2.6 + c.slip * 0.8));

  // velocidad objetivo: lo más lento que viene en la próxima distancia de frenado
  let target = Infinity;
  let k = i;
  let dist = 0;
  const horizon = 80 + speed * 0.55;
  let sharp = 0;
  while (dist < horizon) {
    target = Math.min(target, RL.vmax[k] * L.pace * dr.aggro);
    sharp = Math.max(sharp, Math.abs(T.curv[k]));
    dist += T.dist[k + 1] - T.dist[k];
    k = (k + 1) % N;
  }
  target = Math.min(target, TUNE.vmax * L.top * dr.aggro);
  let gas = 1;
  let brake = 0;
  if (speed > target + 25) {
    gas = 0;
    brake = Math.min(1, (speed - target) / 160);
  } else if (speed > target - 20) gas = 0.55;
  // freno de mano en horquillas
  let hand = false;
  if (dr.hand > 0) {
    dr.hand -= dt;
    hand = true;
    brake = 0;
    gas = 0.3;
  } else if (sharp > 1 / 210 && speed > 300 && Math.abs(err) > 0.25 && dr.rnd() < L.hand * dt * 12) {
    dr.hand = 0.22;
  }
  // nitro en rectas largas
  let boost = false;
  if (c.nitro > 0.35 && speed > 400 && sharp < 1 / 1200 && dist > 500 && L.nitro > dr.rnd() * 1.2) boost = true;
  if (boost) gas = 1;

  // atascado contra una pared: marcha atrás un momento
  if (speed < 40 && gas > 0) dr.stuck += dt;
  else dr.stuck = Math.max(0, dr.stuck - dt * 2);
  if (dr.stuck > 1.2) {
    dr.reverse = 0.9;
    dr.stuck = 0;
  }
  if (dr.reverse > 0) {
    dr.reverse -= dt;
    return { gas: 0, brake: 1, steer: -steer, hand: false, boost: false };
  }
  return { gas, brake, steer, hand, boost };
}
