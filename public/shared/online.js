/**
 * Cliente de salas online compartido por los juegos de game.it.
 *
 *   const room = new OnlineRoom('tictactoe', { onRoom, onMessage, onStatus });
 *   room.create(name) | room.join(code, name) | room.send({ t: 'move', move })
 *
 * - Reintenta con espera creciente y vuelve a entrar a la sala con un token guardado solo en
 *   esta pestaña (sessionStorage).
 * - Sincroniza el reloj con el servidor (serverNow()) para arrancar carreras a la vez.
 */
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const override = local ? new URLSearchParams(location.search).get('server') : null;
export const SERVER_URL = override || (local ? `ws://${location.hostname}:8787` : 'wss://gameit-server-fy2t.onrender.com');

const TXT = {
  es: {
    connecting: 'Conectando…',
    reconnecting: 'Reconectando…',
    netError: 'No se pudo conectar al servidor. Probá más tarde.',
    rate: 'Demasiados mensajes: esperá un momento.',
    not_found: 'No existe una sala con ese código.',
    room_full: 'La sala está llena.',
    in_progress: 'La partida ya empezó.',
    server_full: 'El servidor está lleno, probá en un rato.',
    too_many_rooms: 'Creaste demasiadas salas. Esperá unos minutos.',
    too_many_joins: 'Demasiados intentos. Esperá un minuto.',
    not_host: 'Solo el anfitrión puede hacer eso.',
    need_players: 'Faltan jugadores para empezar.',
    not_your_turn: 'No es tu turno.',
    closed_idle: 'La sala se cerró por inactividad.',
    closed_max_life: 'La sala alcanzó su tiempo máximo.',
    closed_empty: 'La sala se cerró.',
    kicked: 'El anfitrión te sacó de la sala.',
    opponent_left: 'Tu rival se fue de la sala.',
    bad_place: 'La blanca no puede ir ahí.',
    need_call: 'Elegí la tronera para la 8.',
    wakeup: 'Despertando el servidor (puede tardar unos segundos)…',
  },
  en: {
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    netError: 'Could not reach the server. Try again later.',
    rate: 'Too many messages: wait a moment.',
    not_found: 'No room with that code.',
    room_full: 'The room is full.',
    in_progress: 'The match already started.',
    server_full: 'Server is full, try again soon.',
    too_many_rooms: 'Too many rooms created. Wait a few minutes.',
    too_many_joins: 'Too many attempts. Wait a minute.',
    not_host: 'Only the host can do that.',
    need_players: 'Not enough players to start.',
    not_your_turn: 'Not your turn.',
    closed_idle: 'Room closed due to inactivity.',
    closed_max_life: 'Room reached its maximum time.',
    closed_empty: 'The room was closed.',
    kicked: 'The host removed you from the room.',
    opponent_left: 'Your opponent left the room.',
    bad_place: 'The cue ball can’t go there.',
    need_call: 'Choose a pocket for the 8.',
    wakeup: 'Waking the server up (may take a few seconds)…',
  },
};
export const netText = (k) => {
  const lang = window.GameIt?.prefs?.lang || 'es';
  return TXT[lang]?.[k] ?? TXT.es[k] ?? k;
};

export function defaultName() {
  try {
    const s = sessionStorage.getItem('gameit:name');
    if (s) return s;
  } catch {}
  const es = (window.GameIt?.prefs?.lang || 'es') === 'es';
  return (es ? 'Jugador ' : 'Player ') + (10 + Math.floor(Math.random() * 89));
}
export function saveName(n) {
  try {
    sessionStorage.setItem('gameit:name', n);
  } catch {}
}

/** Link para compartir: abre el portal directo en el juego con la sala. */
export const shareLink = (game, code) => `${location.origin}/#play/${game}?room=${code}`;
export const roomFromUrl = () => (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

export async function share(game, code) {
  const url = shareLink(game, code);
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'game.it', text: code, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export class OnlineRoom {
  constructor(game, { onRoom, onMessage, onStatus, onJoined } = {}) {
    this.game = game;
    this.onRoom = onRoom || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onJoined = onJoined || (() => {});
    this.ws = null;
    this.queue = [];
    this.retry = 0;
    this.wanted = false;
    this.offset = 0; // serverNow - Date.now()
    this.myId = null;
    this.room = null;
    this.key = `gameit:session:${game}`;
  }

  get session() {
    try {
      return JSON.parse(sessionStorage.getItem(this.key));
    } catch {
      return null;
    }
  }
  set session(v) {
    try {
      v ? sessionStorage.setItem(this.key, JSON.stringify(v)) : sessionStorage.removeItem(this.key);
    } catch {}
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  connect() {
    this.wanted = true;
    if (this.ws && this.ws.readyState <= 1) return;
    this.onStatus('connecting');
    const slow = setTimeout(() => this.ws?.readyState === 0 && this.onStatus('wakeup'), 2500);
    let ws;
    try {
      ws = new WebSocket(SERVER_URL);
    } catch {
      return this.onStatus('netError');
    }
    this.ws = ws;
    const sentAt = Date.now();
    ws.onopen = () => {
      clearTimeout(slow);
      this.retry = 0;
      this.onStatus('open');
      const s = this.session;
      if (s?.code && s?.token) this.raw({ t: 'join', game: this.game, code: s.code, token: s.token, name: s.name });
      this.queue.splice(0).forEach((m) => this.raw(m));
      clearInterval(this.ping);
      this.ping = setInterval(() => this.raw({ t: 'ping', c: Date.now() }), 10000);
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handle(msg, sentAt);
    };
    ws.onclose = (e) => {
      clearTimeout(slow);
      clearInterval(this.ping);
      this.ws = null;
      if (!this.wanted) return;
      if (e.code === 4008) this.onStatus('rate');
      const wait = Math.min(8000, 600 * 2 ** this.retry++);
      this.onStatus(this.retry > 7 ? 'netError' : 'reconnecting');
      if (this.retry <= 9) this.timer = setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => {};
  }

  handle(msg, sentAt) {
    if (msg.t === 'hello') {
      // estimación simple del desfase de reloj (media latencia)
      this.offset = msg.now - (sentAt + Date.now()) / 2;
      return;
    }
    if (msg.t === 'pong') return;
    if (msg.t === 'joined') {
      this.myId = msg.id;
      this.session = { code: msg.code, token: msg.token, name: this.name };
      this.onJoined(msg);
      return;
    }
    if (msg.t === 'room') {
      this.room = msg.room;
      if (msg.room.now) this.offset = this.offset * 0.8 + (msg.room.now - Date.now()) * 0.2;
      this.onRoom(msg.room);
      return;
    }
    if (msg.t === 'error' && (msg.code === 'not_found' || msg.code === 'in_progress')) this.session = null;
    if (msg.t === 'closed' || msg.t === 'kicked') {
      this.session = null;
      this.room = null;
    }
    this.onMessage(msg);
  }

  raw(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== 'state') this.queue.push(msg);
  }

  send(msg) {
    this.connect();
    this.raw(msg);
  }

  create(name) {
    this.name = name;
    saveName(name);
    this.session = null;
    this.send({ t: 'create', game: this.game, name });
  }

  join(code, name) {
    this.name = name;
    saveName(name);
    this.session = null;
    this.send({ t: 'join', game: this.game, code, name });
  }

  /** Reconecta a una partida en curso si la pestaña se recargó. */
  resume() {
    if (this.session?.code) {
      this.name = this.session.name;
      this.connect();
      return true;
    }
    return false;
  }

  leave() {
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
    this.room = null;
    this.myId = null;
  }

  get isHost() {
    return this.room?.host === this.myId;
  }
}
