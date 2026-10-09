/**
 * InputSender: manda las entradas del jugador al servidor (puro: sin DOM).
 *  - Solo cuando hay una entrada nueva (un giro, el turbo…), con redundancia: van las últimas `redundancy` que el
 *    servidor todavía no confirmó. El servidor descarta las repetidas por `seq`.
 *  - Un keepalive cada `keepaliveMs` si no se mandó nada (mantiene viva la sala y avisa que seguimos acá).
 *
 *   const tx = new InputSender({ send: (m) => room.raw(m) });
 *   tx.push(ev)            // ev = { s, k, d, b } (lo que devuelve Predictor.record)
 *   tx.ack(seq)            // lo último que confirmó el servidor
 *   tx.tick(now)           // en cada cuadro (o con un setInterval): keepalive
 *   tx.resend()            // al reconectar
 * Mensaje: { t: 'i', e: [[s, k, d, b], …] }
 */
export class InputSender {
  constructor({ send, redundancy = 3, keepaliveMs = 250, now = () => performance.now() }) {
    Object.assign(this, { send, redundancy, keepaliveMs, now });
    this.recent = [];
    this.acked = 0;
    this.lastSend = 0;
  }

  push(ev) {
    this.recent.push(ev);
    while (this.recent.length > this.redundancy) this.recent.shift();
    this.flush();
  }

  ack(seq) {
    if (seq > this.acked) this.acked = seq;
  }

  flush() {
    const e = this.recent.filter((v) => v.s > this.acked).map((v) => [v.s, v.k, v.d, v.b]);
    this.lastSend = this.now();
    this.send({ t: 'i', e });
  }

  tick(now = this.now()) {
    if (now - this.lastSend >= this.keepaliveMs) this.flush();
  }

  resend() {
    this.flush();
  }
}
