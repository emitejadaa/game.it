/**
 * Relojes del kit de red (puro: sin DOM, se puede importar desde Node).
 *
 *  - Clock: RTT y desfase del reloj del servidor a partir de ping/pong. De las últimas muestras se queda con la
 *    de menor RTT (la que menos se demoró en la cola de algún lado) y la usa para el desfase.
 *      cliente → { t: 'ping', c: <hora local> }   servidor → { t: 'pong', c: <la misma>, now: <Date.now() del servidor> }
 *  - Pinger: manda 5 pings seguidos al abrir y después uno cada pocos segundos; `pong(msg)` alimenta al Clock.
 *  - ArrivalClock: relaciona la hora del servidor (p. ej. paso × ms por paso) con la hora local de llegada de
 *    sus mensajes. Guarda el mínimo de una ventana móvil (la llegada más rápida ≈ latencia mínima) y mide el
 *    jitter. Lo usan SnapshotBuffer (interp.js) y la predicción para saber "qué hora es en el servidor".
 *
 *    ArrivalClock.base = hora local − hora del servidor (mínimo reciente). Con eso:
 *      serverTimeAt(ahora)  = ahora − base            lo último que llegó "sin demora"
 *      leadTimeAt(ahora, rtt, margen) = ahora − base + rtt + margen
 *                                       hora del servidor en la que cae lo que se mande ahora si se quiere que llegue
 *                                       justo a tiempo (la moto propia se simula en esa hora, adelantada un RTT)
 */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Clock {
  constructor({ keep = 8, maxAge = 30000 } = {}) {
    this.keep = keep;
    this.maxAge = maxAge;
    this.samples = []; // { rtt, offset, at }
    this.jitter = 0; // RFC 3550: media móvil de |RTTi − RTTi−1|
    this.avgRtt = 0;
    this._last = null;
  }

  /**
   * @param sent       hora local en que salió el ping (la que va en `c`)
   * @param recv       hora local en que llegó el pong (misma base que `sent`)
   * @param serverNow  `now` del pong (Date.now() del servidor)
   */
  sample(sent, recv, serverNow) {
    const rtt = recv - sent;
    if (!(rtt >= 0) || !Number.isFinite(serverNow)) return false;
    this.samples.push({ rtt, offset: serverNow + rtt / 2 - recv, at: recv });
    while (this.samples.length > this.keep || (this.samples.length > 1 && recv - this.samples[0].at > this.maxAge)) this.samples.shift();
    this.avgRtt = this.avgRtt ? this.avgRtt * 0.8 + rtt * 0.2 : rtt;
    if (this._last !== null) this.jitter += (Math.abs(rtt - this._last) - this.jitter) / 8;
    this._last = rtt;
    return true;
  }

  get ready() {
    return this.samples.length > 0;
  }

  get best() {
    let b = null;
    for (const s of this.samples) if (!b || s.rtt < b.rtt) b = s;
    return b;
  }

  /** RTT de la mejor muestra reciente (0 si todavía no hay). */
  get rtt() {
    return this.best?.rtt ?? 0;
  }

  /** Hora del servidor − hora local, según la muestra de menor RTT. */
  get offset() {
    return this.best?.offset ?? 0;
  }

  /** Hora del servidor (Date.now() de allá) para una hora local `localNow` (la misma base de `sample`). */
  serverNow(localNow) {
    return localNow + this.offset;
  }

  reset() {
    this.samples.length = 0;
    this.jitter = 0;
    this.avgRtt = 0;
    this._last = null;
  }
}

export class Pinger {
  /**
   * @param send   (msg) => void — manda por el socket (si está cerrado, no pasa nada)
   * @param clock  Clock
   * @param opts   burst (cuántos al abrir), gap (ms entre ellos), every (ms entre pings después), now
   */
  // los timers por defecto van envueltos: en el navegador `setTimeout` no anda llamado con otro `this`
  constructor({ send, clock, burst = 5, gap = 200, every = 3000, now = () => performance.now(), timers = { set: (f, ms) => setTimeout(f, ms), clear: (id) => clearTimeout(id) } }) {
    Object.assign(this, { send, clock, burst, gap, every, now, timers });
    this.n = 0;
    this.timer = null;
  }

  start() {
    this.stop();
    this.n = 0;
    const next = () => {
      this.send({ t: 'ping', c: this.now() });
      this.n++;
      this.timer = this.timers.set(next, this.n < this.burst ? this.gap : this.every);
    };
    next();
  }

  stop() {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  /** Procesa un { t: 'pong' }. Devuelve true si servía para medir. */
  pong(msg) {
    if (!msg || typeof msg.c !== 'number') return false;
    return this.clock.sample(msg.c, this.now(), msg.now);
  }
}

export class ArrivalClock {
  constructor({ bucketMs = 1000, buckets = 8, resyncMs = 300 } = {}) {
    Object.assign(this, { bucketMs, buckets, resyncMs });
    this.reset();
  }

  reset() {
    this.mins = []; // { at: inicio del cubo, min }
    this.base = null;
    this.jitter = 0;
  }

  /** Registra la llegada de algo fechado `serverTime` (ms del servidor) a la hora local `localNow`. */
  observe(serverTime, localNow) {
    const est = localNow - serverTime;
    if (this.base !== null && est - this.base > this.resyncMs && this.jitter < this.resyncMs) {
      // un hueco grande (pestaña oculta, corte): se vuelve a sincronizar en vez de arrastrar la ventana vieja
      this.mins.length = 0;
      this.base = null;
    }
    const last = this.mins[this.mins.length - 1];
    if (last && localNow - last.at < this.bucketMs) last.min = Math.min(last.min, est);
    else this.mins.push({ at: localNow, min: est });
    while (this.mins.length > this.buckets) this.mins.shift();
    let m = Infinity;
    for (const b of this.mins) if (b.min < m) m = b.min;
    if (this.base === null) this.jitter = 0;
    else this.jitter += (Math.abs(est - this.base) - this.jitter) * 0.05;
    this.base = m;
  }

  get ready() {
    return this.base !== null;
  }

  serverTimeAt(localNow) {
    return localNow - (this.base ?? 0);
  }

  leadTimeAt(localNow, rtt, margin = 0) {
    return localNow - (this.base ?? 0) + rtt + margin;
  }
}

export { clamp };
