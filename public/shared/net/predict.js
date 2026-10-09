/**
 * Predictor: predicción de la entidad propia con reconciliación (puro: sin DOM).
 *
 * La entidad propia se simula en el cliente con el MISMO paso determinista que el servidor (compartido en el
 * juego), así que responde a la entrada sin esperar el viaje de ida y vuelta. Cada entrada lleva un `seq` y el
 * paso del servidor en el que se aplicó; el servidor confirma con el último `seq` aplicado (`ack`) junto con el
 * estado autoritativo de un paso `authTick`. Al llegar:
 *   0. el estado guarda en `seq` la última entrada aplicada (el kit lo fija en `ack` al partir del estado del servidor),
 *   1. se parte del estado del servidor,
 *   2. se vuelven a aplicar las entradas con seq > ack hasta el paso actual del cliente,
 *   3. la diferencia con lo que se estaba mostrando se guarda como error visual y se disuelve en `smoothMs`;
 *      si pasa de `snapDist` se salta directo.
 *
 *   const pr = new Predictor({ step, clone, pos, smoothMs: 120, snapDist: 6 });
 *   //  step(state, history, tick)  avanza UN paso (muta state) con las entradas de `history` que tengan seq > state.seq
 *   //  clone(state)                copia profunda del estado
 *   //  pos(state, out)             escribe { x, y } en out (para medir el error visual)
 *   pr.reset(state, tick)           // estado inicial autoritativo (nacer, reconectar)
 *   const ev = pr.record({ d: 1, b: 0 }, pr.tick + lead)   // entrada nueva → { s: seq, k: paso, d, b } (para mandar)
 *   pr.advanceTo(tick)              // simula hasta ese paso (se llama cuando avanza el reloj)
 *   pr.reconcile(authState, authTick, ack)
 *   pr.state / pr.peek()            // estado actual / estado del paso siguiente (anticipado, para dibujar entre pasos)
 *   pr.errorAt(now)                 // { x, y } a sumar a lo dibujado (se disuelve solo)
 */
export class Predictor {
  constructor({ step, clone, pos, smoothMs = 120, snapDist = 6, maxHistory = 48, maxSteps = 40 }) {
    Object.assign(this, { stepFn: step, cloneFn: clone, posFn: pos, smoothMs, snapDist, maxHistory, maxSteps });
    this.seq = 0;
    this.history = [];
    this.state = null;
    this.tick = 0;
    this.err = { x: 0, y: 0, at: 0 };
    this._peek = null;
    this._peekKey = '';
    this._ver = 0;
    this._a = { x: 0, y: 0 };
    this._b = { x: 0, y: 0 };
  }

  reset(state, tick) {
    this.state = state;
    this.tick = tick;
    this.history.length = 0;
    this.err.x = this.err.y = 0;
    this._ver++;
  }

  /** Registra una entrada nueva; los pasos de entradas consecutivas no retroceden. */
  record(fields, tick) {
    const last = this.history[this.history.length - 1];
    const ev = { ...fields, s: ++this.seq, k: Math.max(tick, last ? last.k : 0) };
    this.history.push(ev);
    if (this.history.length > this.maxHistory) this.history.shift();
    this._ver++;
    return ev;
  }

  advanceTo(tick) {
    if (!this.state) return 0;
    if (tick - this.tick > this.maxSteps) this.tick = tick - this.maxSteps; // una pausa larga: no simular de más
    let n = 0;
    while (this.tick < tick) {
      this.tick++;
      this.stepFn(this.state, this.history, this.tick);
      n++;
    }
    if (n) this._ver++;
    return n;
  }

  /** Estado un paso adelante (sin tocar el real): lo que se dibuja entre este paso y el que viene. */
  peek() {
    const key = `${this.tick}:${this._ver}`;
    if (this._peekKey !== key) {
      this._peek = this.cloneFn(this.state);
      this.stepFn(this._peek, this.history, this.tick + 1);
      this._peekKey = key;
    }
    return this._peek;
  }

  /** @returns { err: distancia del error corregido, snapped: boolean } */
  reconcile(auth, authTick, ack, now = 0) {
    if (!this.state) {
      this.reset(auth, authTick);
      return { err: 0, snapped: true };
    }
    while (this.history.length && this.history[0].s <= ack) this.history.shift();
    const cur = this.state;
    const next = auth; // el servidor entrega un objeto nuevo en cada snapshot
    next.seq = ack;
    let t = authTick;
    if (authTick > this.tick) {
      // el cliente iba atrasado respecto del servidor: se adopta su estado y su paso
      this.state = next;
      this.tick = authTick;
      this._ver++;
      this.err.x = this.err.y = 0;
      return { err: 0, snapped: true };
    }
    while (t < this.tick) {
      t++;
      this.stepFn(next, this.history, t);
    }
    this.posFn(cur, this._a);
    this.posFn(next, this._b);
    const off = this.errorAt(now);
    const ex = this._a.x - this._b.x + off.x;
    const ey = this._a.y - this._b.y + off.y;
    const dist = Math.hypot(this._a.x - this._b.x, this._a.y - this._b.y);
    this.state = next;
    this._ver++;
    if (Math.hypot(ex, ey) > this.snapDist) {
      this.err.x = this.err.y = 0;
      return { err: dist, snapped: true };
    }
    this.err.x = ex;
    this.err.y = ey;
    this.err.at = now;
    return { err: dist, snapped: false };
  }

  /** Error visual pendiente (se achica en línea recta hasta cero en `smoothMs`). */
  errorAt(now) {
    const k = this.smoothMs > 0 ? Math.max(0, 1 - (now - this.err.at) / this.smoothMs) : 0;
    return { x: this.err.x * k, y: this.err.y * k };
  }
}
