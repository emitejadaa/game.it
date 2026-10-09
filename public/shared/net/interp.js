/**
 * SnapshotBuffer: interpolación de entidades remotas (puro: sin DOM).
 *
 *   const buf = new SnapshotBuffer({ delay: 80, angles: ['a'], extrapolate: ['x', 'y'] });
 *   buf.push(k * tickMs, [{ id: 3, x: 10, y: 4, a: 1.2, name: 'Ana' }, …], performance.now());   // al llegar cada snapshot
 *   const s = buf.sample(performance.now());        // en cada cuadro → { entities, time, extrapolated, delay } | null
 *
 * - `time` es la hora del servidor del snapshot (ms; sirve paso × ms por paso). La hora de render es la última
 *   hora llegada "sin demora" menos un retardo adaptativo: clamp(delay + 2 × jitter, 60, 250) ms. El jitter y
 *   el desfase salen de un ArrivalClock (clock.js) que se puede compartir (`opts.clock`).
 * - Se interpolan por id los campos numéricos (los de `angles` por el camino corto, en radianes); lo demás
 *   (nombres, arreglos…) se toma del snapshot más nuevo del par.
 * - Si el tiempo de render pasa del último snapshot, se extrapola hasta `maxExtrap` ms con la velocidad de
 *   los campos de `extrapolate` (el resto queda quieto).
 * - Un hueco enorme (> `gapReset` ms) o un servidor que reinició (el tiempo vuelve atrás) vacía el buffer.
 */
import { ArrivalClock, clamp } from './clock.js';

const TAU = Math.PI * 2;
const lerpAngle = (a, b, k) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * k;
};

export class SnapshotBuffer {
  constructor({ delay = 80, minDelay = 60, maxDelay = 250, maxExtrap = 100, maxSnaps = 40, gapReset = 1500, angles = [], extrapolate = [], clock } = {}) {
    Object.assign(this, { baseDelay: delay, minDelay, maxDelay, maxExtrap, maxSnaps, gapReset });
    this.angles = new Set(angles);
    this.extrapolate = extrapolate;
    this.clock = clock || new ArrivalClock();
    this.snaps = [];
  }

  get delay() {
    return clamp(this.baseDelay + 2 * this.clock.jitter, this.minDelay, this.maxDelay);
  }

  clear() {
    this.snaps.length = 0;
    this.clock.reset();
  }

  /** @returns false si el snapshot se ignoró (repetido o viejo) */
  push(time, entities, now) {
    const last = this.snaps[this.snaps.length - 1];
    if (last) {
      if (time <= last.t) {
        if (last.t - time < this.gapReset) return false;
        this.clear(); // el servidor reinició
      } else if (time - last.t > this.gapReset) this.clear();
    }
    const ents = new Map();
    for (const e of entities) ents.set(e.id, e);
    this.snaps.push({ t: time, ents });
    this.clock.observe(time, now);
    if (this.snaps.length > this.maxSnaps) this.snaps.splice(0, this.snaps.length - this.maxSnaps);
    return true;
  }

  /** Estado interpolado de todas las entidades a la hora local `now`. */
  sample(now) {
    const snaps = this.snaps;
    if (!snaps.length) return null;
    const delay = this.delay;
    const rt = this.clock.serverTimeAt(now) - delay;
    const newest = snaps[snaps.length - 1];
    if (rt >= newest.t) return this.extrap(snaps, rt, delay);
    let i = 0;
    while (i < snaps.length - 2 && snaps[i + 1].t <= rt) i++;
    if (i > 1) snaps.splice(0, i - 1); // se conserva uno antes del par por si el reloj retrocede un poco
    const hasPrev = i > 1 ? 1 : i;
    const a = snaps[hasPrev];
    const b = snaps[hasPrev + 1];
    if (rt <= a.t) return { entities: [...a.ents.values()], time: a.t, extrapolated: false, delay };
    const k = (rt - a.t) / (b.t - a.t);
    const out = [];
    for (const eb of b.ents.values()) {
      const ea = a.ents.get(eb.id);
      if (!ea) {
        out.push(eb);
        continue;
      }
      const e = { ...eb };
      for (const key in eb) {
        const vb = eb[key];
        if (typeof vb !== 'number' || key === 'id') continue;
        const va = ea[key];
        if (typeof va !== 'number') continue;
        e[key] = this.angles.has(key) ? lerpAngle(va, vb, k) : va + (vb - va) * k;
      }
      out.push(e);
    }
    return { entities: out, time: rt, extrapolated: false, delay };
  }

  extrap(snaps, rt, delay) {
    const b = snaps[snaps.length - 1];
    const a = snaps.length > 1 ? snaps[snaps.length - 2] : null;
    const dt = Math.min(rt - b.t, this.maxExtrap);
    const out = [];
    for (const eb of b.ents.values()) {
      const ea = a && b.t > a.t ? a.ents.get(eb.id) : null;
      if (!ea || dt <= 0 || !this.extrapolate.length) {
        out.push(eb);
        continue;
      }
      const e = { ...eb };
      for (const key of this.extrapolate) {
        if (typeof eb[key] !== 'number' || typeof ea[key] !== 'number') continue;
        e[key] = eb[key] + ((eb[key] - ea[key]) / (b.t - a.t)) * dt;
      }
      out.push(e);
    }
    return { entities: out, time: b.t + dt, extrapolated: rt > b.t, delay };
  }
}
