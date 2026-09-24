/**
 * Conexión con el servidor de salas. Reintenta con espera creciente y, si se corta en plena
 * partida, vuelve a entrar a la misma sala con el token (guardado solo en esta pestaña).
 */
import { SERVER_URL } from '../config.js';

const SESSION = 'minigolf:session';

export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.queue = [];
    this.retry = 0;
    this.wanted = false;
    this.timer = 0;
  }

  get session() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION));
    } catch {
      return null;
    }
  }

  set session(v) {
    try {
      v ? sessionStorage.setItem(SESSION, JSON.stringify(v)) : sessionStorage.removeItem(SESSION);
    } catch {}
  }

  connect() {
    this.wanted = true;
    if (this.ws && this.ws.readyState <= 1) return;
    this.onStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(SERVER_URL);
    } catch {
      return this.onStatus('error');
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus('open');
      const s = this.session;
      if (s?.code && s?.token) this.raw({ t: 'join', code: s.code, token: s.token, name: s.name });
      this.queue.splice(0).forEach((m) => this.raw(m));
      clearInterval(this.ping);
      this.ping = setInterval(() => this.raw({ t: 'ping' }), 15000);
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = (e) => {
      clearInterval(this.ping);
      this.ws = null;
      if (!this.wanted) return;
      if (e.code === 4008) this.onStatus('rate');
      const wait = Math.min(8000, 600 * 2 ** this.retry++);
      this.onStatus(this.retry > 6 ? 'error' : 'reconnecting');
      if (this.retry <= 8) this.timer = setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => {};
  }

  raw(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  send(msg) {
    this.connect();
    this.raw(msg);
  }

  close() {
    this.wanted = false;
    clearTimeout(this.timer);
    clearInterval(this.ping);
    this.session = null;
    this.queue = [];
    if (this.ws) {
      try {
        this.raw({ t: 'leave' });
        this.ws.close();
      } catch {}
    }
    this.ws = null;
  }
}
