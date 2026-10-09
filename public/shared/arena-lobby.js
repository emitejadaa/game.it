/**
 * Menú compartido de las arenas online (Estela y los que vienen): nombre y color, "Partida rápida", "Sala privada",
 * "Sin conexión" y la lista de salas en vivo. Se ocupa de TODO lo de red del menú (conectar, listar, entrar, crear,
 * errores amigables, ping y chip de conexión); la arena en sí (mensajes `reset`, `s`, `me`…) la maneja el juego.
 *
 *   import { ArenaLobby } from '/shared/arena-lobby.js';       // y <link rel="stylesheet" href="/shared/arena.css">
 *   const lobby = new ArenaLobby({
 *     game: 'estela',                                  // id del juego: sala online y localStorage gameit:<id>:name / :color
 *     mount: document.getElementById('lobby'),         // el menú se arma adentro (se vacía)
 *     title: { es: 'Estela', en: 'Trail' },            // puede ser un string
 *     tagline: { es: '…', en: '…' },
 *     palette: ['#00f0ff', '#ff2bd6', …],              // colores elegibles (el color es el índice)
 *     logo: svgElement,                                // opcional, se clona arriba del título
 *     keys: { es: 'Flechas o WASD…', en: '…' },        // opcional: ayuda de controles (`touchKeys` para celular); puede ser una función que devuelve el texto
 *     settings: [{ key: 'speed', label: {es,en}, options: [{ value: 'normal', label: {es,en} }, …] }],  // sala privada
 *     offline: { levels: [{ id: 'easy', label: {es,en}, hint: {es,en} }, …] },   // null = sin modo offline
 *     onJoin: ({ code, id, private, rejoined }) => …,  // ya estás dentro de una arena (el menú se oculta solo)
 *     onMessage: (msg) => …,                           // todo lo que manda la arena (menos list/error/closed, que maneja el menú)
 *     onRoom: (room) => …,                             // cambios de la sala (código, ajustes…)
 *     onOffline: ({ name, color, level }) => …,        // eligió jugar sin conexión (el menú se oculta solo)
 *     onLeave: ({ reason, text }) => …,                // la sala se cerró o te sacaron (el menú vuelve solo)
 *     onNotice: (text) => …,                           // avisos cuando el menú está oculto (para un toast)
 *     onStatus: (st) => …,                             // 'connecting' | 'open' | 'reconnecting' | 'netError'…
 *   });
 *   lobby.show() / lobby.hide() / lobby.visible
 *   lobby.profile            → { name, color } (nombre ya saneado; vacío = usar defaultName())
 *   lobby.net                → el OnlineRoom (net.raw(msg) manda mensajes de la arena; net.ws.readyState === 1 si hay conexión)
 *   lobby.clock              → Clock del kit de red (lobby.rtt = ping en ms; los pings los manda el menú solo)
 *   lobby.attachChip(parent) → StatusChip (ping + "Reconectando…") ya conectado al estado de la red
 *   lobby.roomChip(parent)   → botón "Sala ABCDE · copiar link" (solo se ve en salas privadas)
 *   lobby.shareRoom()        → copia / comparte el link de la sala
 *   lobby.leave()            → sale de la arena (cierra el socket); después se llama a lobby.show()
 *   lobby.quick()            → "Partida rápida" sin tocar el menú (por ejemplo al terminar una sala por tiempo)
 *
 * El modo offline lo corre el juego (el mismo `world.js` en el navegador): el menú solo avisa con onOffline.
 * Accesible: todo con teclado (Tab, flechas en los colores, Enter en el nombre = partida rápida, Escape = volver),
 * textos con textContent (los nombres de las salas son de otras personas), es/en según GameIt.prefs.lang.
 * Las partes puras (sanitizeName, cleanCode, pickQuickRoom, roomRow, createSettings, connState) se exportan para las pruebas.
 */
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from './online.js';
import { Clock, Pinger } from './net/clock.js';
import { StatusChip } from './net/status.js';

// ---------------------------------------------------------------- partes puras
/** Nombre apto para mostrar: sin controles ni < >, sin espacios de más y acotado. */
export function sanitizeName(raw, max = 16) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Código de sala: 5 letras o números en mayúsculas. */
export const cleanCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

/** La sala de la lista a la que entra "Partida rápida": la más poblada que está en juego y tiene lugar (o null). */
export function pickQuickRoom(rooms) {
  let best = null;
  for (const r of rooms || []) {
    if (!r || r.state !== 'playing' || !(r.n < r.max)) continue;
    if (!best || r.n > best.n) best = r;
  }
  return best ? best.code : null;
}

/** Cómo se muestra una sala en la lista (todo texto plano). */
export function roomRow(r, lang = 'es') {
  const es = lang !== 'en';
  const bots = r.bots | 0;
  const people = es ? `${r.n}/${r.max} jugadores` : `${r.n}/${r.max} players`;
  const meta = bots > 0 ? `${people} · ${bots} bots` : people;
  const playing = r.state === 'playing';
  return {
    code: r.code,
    title: String(r.name || (es ? 'Sala' : 'Room')).slice(0, 28),
    meta,
    state: playing ? (es ? 'en juego' : 'playing') : es ? 'esperando' : 'waiting',
    joinable: r.n < r.max,
  };
}

/** Ajustes para crear una sala: lo elegido (solo claves del esquema y valores del esquema) más `public`/`bots`. */
export function createSettings(schema, chosen = {}, { isPublic, bots = true } = {}) {
  const out = { public: !!isPublic, bots: !!bots };
  for (const s of schema || []) {
    const v = chosen[s.key];
    if (s.options.some((o) => o.value === v)) out[s.key] = v;
  }
  return out;
}

/** Estado de OnlineRoom → estado del chip (undefined = no cambia). */
export const connState = (st) => ({ open: 'ok', connecting: 'connecting', wakeup: 'connecting', reconnecting: 'reconnecting', netError: 'lost' })[st];

const TXT = {
  es: {
    name: 'Tu nombre',
    color: 'Tu color',
    quick: 'Partida rápida',
    quickSub: 'una arena con gente y bots',
    priv: 'Sala privada',
    privSub: 'con código para tus amigos',
    offline: 'Sin conexión',
    offlineSub: 'contra bots en tu equipo',
    rooms: 'Salas en vivo',
    noRooms: 'Todavía no hay salas abiertas. ¡Abrí la primera con Partida rápida!',
    join: 'Unirse',
    create: 'Crear sala',
    code: 'Código de sala',
    haveCode: 'Tengo un código',
    joinRoom: 'Unirse a la sala {c}',
    joinRoomSub: 'te invitaron con un link',
    withBots: 'Con bots de relleno',
    back: 'Volver',
    level: 'Elegí el nivel',
    searching: 'Buscando una arena…',
    joining: 'Entrando…',
    creating: 'Creando la sala…',
    copied: '¡Link copiado!',
    shared: '¡Link compartido!',
    codeIs: 'Código de la sala: {c}',
    chip: 'Sala {c} · copiar link',
    refreshed: 'actualizado',
    colorN: 'Color {n}',
    wake: 'Si el servidor estaba dormido puede tardar unos segundos.',
    timeout: 'El servidor no responde. Probá de nuevo o jugá sin conexión.',
  },
  en: {
    name: 'Your name',
    color: 'Your color',
    quick: 'Quick game',
    quickSub: 'an arena with people and bots',
    priv: 'Private room',
    privSub: 'with a code for your friends',
    offline: 'Offline',
    offlineSub: 'versus bots on your device',
    rooms: 'Live rooms',
    noRooms: 'No open rooms yet. Open the first one with Quick game!',
    join: 'Join',
    create: 'Create room',
    code: 'Room code',
    haveCode: 'I have a code',
    joinRoom: 'Join room {c}',
    joinRoomSub: 'you were invited with a link',
    withBots: 'Fill with bots',
    back: 'Back',
    level: 'Pick a level',
    searching: 'Finding an arena…',
    joining: 'Joining…',
    creating: 'Creating the room…',
    copied: 'Link copied!',
    shared: 'Link shared!',
    codeIs: 'Room code: {c}',
    chip: 'Room {c} · copy link',
    refreshed: 'updated',
    colorN: 'Color {n}',
    wake: 'If the server was asleep it can take a few seconds.',
    timeout: 'The server is not answering. Try again or play offline.',
  },
};

// mismo reloj que usa OnlineRoom en sus propios pings (Date.now): los pong de los dos sirven para medir
const wallNow = () => Date.now();

// ---------------------------------------------------------------- DOM mínimo (todo con textContent)
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) el.append(c);
  return el;
}

export class ArenaLobby {
  constructor(cfg) {
    this.cfg = { maxName: 16, settings: [], offline: null, ...cfg };
    this.game = cfg.game;
    this.view = 'home'; // home | private | offline
    this.visible = false;
    this.busy = false;
    this.inRoom = false;
    this.rooms = [];
    this.chips = [];
    this.roomChips = [];
    this.quickWanted = false;
    this.retries = 0;
    this.privCode = '';
    this.profile = this.load();
    this.chosen = this.loadChosen();

    this.clock = new Clock();
    this.net = new OnlineRoom(this.game, {
      onStatus: (st) => this.onStatus(st),
      onRoom: (room) => this.onRoom(room),
      onMessage: (m) => this.onMessage(m),
      onJoined: (m) => this.onJoined(m),
      onPong: (m) => this.pinger.pong(m),
    });
    // los pings salen solos mientras haya conexión (ráfaga al abrir y después cada pocos segundos)
    this.pinger = new Pinger({ send: (m) => this.net.ws?.readyState === 1 && this.net.raw(m), clock: this.clock, now: wallNow });

    this.root = cfg.mount;
    this.root.textContent = '';
    this.root.classList.add('ar-lobby');
    this.root.hidden = true;
    this.invited = roomFromUrl(); // vino con un link ?room=ABCDE: se ofrece entrar a esa sala (con su nombre y color a mano)
    this.privCode = this.invited;
    this.build();
    window.GameIt?.onPrefs?.(() => this.relabel());
    this.pollTimer = setInterval(() => this.poll(), 5000);
    this.chipTimer = setInterval(() => this.tickChips(), 1000);
  }

  // ------------------------------------------------ utilidades
  get lang() {
    return window.GameIt?.prefs?.lang === 'en' ? 'en' : 'es';
  }
  t(k, v) {
    let s = TXT[this.lang][k] ?? k;
    if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
    return s;
  }
  tr(o) {
    if (typeof o === 'function') o = o();
    return typeof o === 'string' ? o : o?.[this.lang] ?? o?.es ?? '';
  }
  get rtt() {
    return this.clock.rtt;
  }
  get connected() {
    return this.net.ws?.readyState === 1;
  }

  load() {
    const max = this.cfg.maxName;
    let name = '';
    let color = Math.floor(Math.random() * this.cfg.palette.length);
    try {
      name = sanitizeName(localStorage.getItem(`gameit:${this.game}:name`) || '', max);
      const c = Number(localStorage.getItem(`gameit:${this.game}:color`));
      if (Number.isInteger(c) && c >= 0 && c < this.cfg.palette.length && localStorage.getItem(`gameit:${this.game}:color`) !== null) color = c;
    } catch {}
    return { name, color };
  }
  save() {
    try {
      localStorage.setItem(`gameit:${this.game}:name`, this.profile.name);
      localStorage.setItem(`gameit:${this.game}:color`, String(this.profile.color));
    } catch {}
  }
  loadChosen() {
    const out = {};
    for (const s of this.cfg.settings) out[s.key] = s.options[0].value;
    try {
      const saved = JSON.parse(localStorage.getItem(`gameit:${this.game}:room`));
      if (saved && typeof saved === 'object') for (const s of this.cfg.settings) if (s.options.some((o) => o.value === saved[s.key])) out[s.key] = saved[s.key];
      this.bots = saved?.bots !== false;
    } catch {
      this.bots = true;
    }
    return out;
  }
  saveChosen() {
    try {
      localStorage.setItem(`gameit:${this.game}:room`, JSON.stringify({ ...this.chosen, bots: this.bots }));
    } catch {}
  }
  /** Lee el campo de nombre, lo sanea y guarda el perfil. */
  commit() {
    this.profile.name = sanitizeName(this.nameInput.value, this.cfg.maxName);
    this.save();
    return this.profile.name || defaultName();
  }

  // ------------------------------------------------ mostrar / ocultar
  show() {
    this.visible = true;
    this.setBusy(false);
    this.quickWanted = false;
    this.root.hidden = false;
    this.setView(this.view);
    this.status('');
    this.net.connect();
    if (this.connected) this.poll(true);
  }
  hide() {
    this.visible = false;
    this.root.hidden = true;
  }
  /** Sale de la arena y cierra el socket (el menú no vuelve solo: el juego llama a show()). */
  leave() {
    this.inRoom = false;
    this.quickWanted = false;
    this.setBusy(false);
    this.net.leave();
    this.setConn('ok');
    this.refreshRoomChips();
  }
  destroy() {
    clearInterval(this.pollTimer);
    clearInterval(this.chipTimer);
    this.pinger.stop();
    this.net.leave();
    for (const c of this.chips) c.destroy();
    this.root.textContent = '';
  }

  // ------------------------------------------------ construcción del DOM
  build() {
    const c = this.cfg;
    const panel = h('div', { class: 'ar-panel', role: 'dialog', 'aria-labelledby': 'ar-title' });
    this.panel = panel;
    if (c.logo) panel.append(c.logo.cloneNode(true));
    this.titleEl = h('h1', { class: 'ar-title', id: 'ar-title' });
    this.taglineEl = h('p', { class: 'ar-sub' });
    panel.append(this.titleEl, this.taglineEl);

    // --- vista inicial
    this.nameInput = h('input', { class: 'ar-field', id: 'ar-name', maxlength: String(c.maxName), autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'go' });
    this.nameInput.value = this.profile.name;
    this.nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), this.quick()));
    this.nameLabel = h('label', { class: 'ar-label', for: 'ar-name' });
    this.colorsEl = h('div', { class: 'ar-colors', role: 'radiogroup' });
    this.colorsLabel = h('span', { class: 'ar-label', id: 'ar-colors-label' });
    this.colorsEl.setAttribute('aria-labelledby', 'ar-colors-label');
    this.buildColors();
    this.inviteBtn = this.bigBtn('ar-invite', () => this.joinRoom(this.invited), true);
    this.inviteBtn.hidden = !this.invited;
    this.quickBtn = this.bigBtn('ar-quick', () => this.quick(), !this.invited);
    this.privBtn = this.bigBtn('ar-priv', () => this.setView('private', true));
    this.offBtn = c.offline ? this.bigBtn('ar-off', () => this.setView('offline', true)) : null;
    this.roomsTitle = h('h2', { class: 'ar-h2' });
    this.roomsList = h('ul', { class: 'ar-rooms', 'aria-live': 'off' });
    this.roomsBox = h('section', { class: 'ar-roomsbox', 'aria-labelledby': 'ar-rooms-title' }, this.roomsTitle, this.roomsList);
    this.roomsTitle.id = 'ar-rooms-title';
    this.keysEl = h('p', { class: 'ar-keys' });
    this.home = h('div', { class: 'ar-view', 'data-view': 'home' }, h('div', { class: 'ar-who' }, this.nameLabel, this.nameInput, this.colorsLabel, this.colorsEl), h('div', { class: 'ar-actions' }, this.inviteBtn, this.quickBtn, h('div', { class: 'ar-pair' }, this.privBtn, this.offBtn)), this.roomsBox, this.keysEl);

    // --- sala privada
    this.settingsEl = h('div', { class: 'ar-settings' });
    this.createBtn = h('button', { class: 'ar-btn ar-primary', type: 'button', onclick: () => this.createPrivate() });
    this.codeInput = h('input', { class: 'ar-field ar-code', id: 'ar-code', maxlength: '5', placeholder: 'ABCDE', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text' });
    this.codeInput.addEventListener('input', () => (this.codeInput.value = cleanCode(this.codeInput.value)));
    this.codeLabel = h('label', { class: 'ar-label', for: 'ar-code' });
    this.joinBtn = h('button', { class: 'ar-btn', type: 'submit' });
    this.joinForm = h('form', { class: 'ar-join', autocomplete: 'off', onsubmit: (e) => (e.preventDefault(), this.joinByCode()) }, this.codeInput, this.joinBtn);
    this.backPriv = h('button', { class: 'ar-back', type: 'button', onclick: () => this.setView('home', true) });
    this.priv = h('div', { class: 'ar-view', 'data-view': 'private', hidden: true }, this.settingsEl, this.createBtn, h('div', { class: 'ar-sep' }), this.codeLabel, this.joinForm, this.backPriv);
    this.priv.prepend((this.privTitle = h('h2', { class: 'ar-h2 ar-h2-big' })));

    // --- sin conexión
    this.levelsEl = h('div', { class: 'ar-levels' });
    this.backOff = h('button', { class: 'ar-back', type: 'button', onclick: () => this.setView('home', true) });
    this.offView = h('div', { class: 'ar-view', 'data-view': 'offline', hidden: true }, (this.offTitle = h('h2', { class: 'ar-h2 ar-h2-big' })), this.levelsEl, this.backOff);

    this.statusEl = h('p', { class: 'ar-status', role: 'status', 'aria-live': 'polite' });
    panel.append(this.home, this.priv, this.offView, this.statusEl);
    this.root.append(panel);
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.view !== 'home' && !this.busy) {
        e.preventDefault();
        this.setView('home', true);
      }
    });
    this.buildSettings();
    this.buildLevels();
    this.relabel();
  }

  bigBtn(cls, fn, primary) {
    const b = h('button', { class: `ar-btn ar-big ${primary ? 'ar-primary' : ''} ${cls}`, type: 'button', onclick: fn });
    b.append(h('span', { class: 'ar-b1' }), h('small', { class: 'ar-b2' }));
    return b;
  }

  buildColors() {
    this.colorsEl.textContent = '';
    this.cfg.palette.forEach((col, i) => {
      const b = h('button', { class: 'ar-swatch', type: 'button', role: 'radio', 'aria-checked': String(i === this.profile.color), tabindex: i === this.profile.color ? '0' : '-1', 'data-i': String(i) });
      b.style.setProperty('--c', col);
      b.addEventListener('click', () => this.pickColor(i));
      this.colorsEl.append(b);
    });
    this.colorsEl.addEventListener('keydown', (e) => {
      const n = this.cfg.palette.length;
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      this.pickColor((this.profile.color + d + n) % n, true);
    });
  }
  pickColor(i, focus) {
    this.profile.color = i;
    this.save();
    for (const b of this.colorsEl.children) {
      const on = Number(b.dataset.i) === i;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
  }

  buildSettings() {
    this.settingsEl.textContent = '';
    this.segs = [];
    for (const s of this.cfg.settings) {
      const group = h('div', { class: 'ar-seg', role: 'radiogroup', 'aria-labelledby': `ar-s-${s.key}` });
      const lab = h('span', { class: 'ar-label', id: `ar-s-${s.key}` });
      const btns = s.options.map((o) => {
        const b = h('button', { class: 'ar-opt', type: 'button', role: 'radio', 'data-v': o.value });
        b.addEventListener('click', () => {
          this.chosen[s.key] = o.value;
          this.saveChosen();
          this.paintSettings();
        });
        return b;
      });
      group.append(...btns);
      this.settingsEl.append(h('div', { class: 'ar-setting' }, lab, group));
      this.segs.push({ s, lab, btns });
    }
    // bots sí / no
    this.botsBtn = h('button', { class: 'ar-check', type: 'button', role: 'switch', onclick: () => ((this.bots = !this.bots), this.saveChosen(), this.paintSettings()) });
    this.botsBtn.append(h('i', { 'aria-hidden': 'true' }), h('span'));
    this.settingsEl.append(this.botsBtn);
  }
  paintSettings() {
    for (const { s, lab, btns } of this.segs) {
      lab.textContent = this.tr(s.label);
      s.options.forEach((o, i) => {
        btns[i].textContent = this.tr(o.label);
        btns[i].setAttribute('aria-checked', String(this.chosen[s.key] === o.value));
      });
    }
    this.botsBtn.setAttribute('aria-checked', String(this.bots));
    this.botsBtn.lastChild.textContent = this.t('withBots');
  }

  buildLevels() {
    this.levelsEl.textContent = '';
    for (const lv of this.cfg.offline?.levels || []) {
      const b = h('button', { class: 'ar-btn ar-big ar-level', type: 'button', 'data-level': lv.id, onclick: () => this.playOffline(lv.id) });
      b.append(h('span', { class: 'ar-b1' }), h('small', { class: 'ar-b2' }));
      this.levelsEl.append(b);
    }
  }

  /** Vuelve a poner todos los textos (cambio de idioma o primera vez). */
  relabel() {
    const c = this.cfg;
    document.documentElement.lang = this.lang;
    this.titleEl.textContent = this.tr(c.title);
    this.taglineEl.textContent = this.tr(c.tagline);
    this.taglineEl.hidden = !c.tagline;
    this.nameLabel.textContent = this.t('name');
    this.nameInput.placeholder = defaultName();
    this.colorsLabel.textContent = this.t('color');
    [...this.colorsEl.children].forEach((b, i) => b.setAttribute('aria-label', this.t('colorN', { n: i + 1 })));
    const set = (btn, a, b) => {
      btn.querySelector('.ar-b1').textContent = a;
      btn.querySelector('.ar-b2').textContent = b;
    };
    set(this.quickBtn, this.t('quick'), this.t('quickSub'));
    set(this.inviteBtn, this.t('joinRoom', { c: this.invited }), this.t('joinRoomSub'));
    set(this.privBtn, this.t('priv'), this.t('privSub'));
    if (this.offBtn) set(this.offBtn, this.t('offline'), this.t('offlineSub'));
    this.roomsTitle.textContent = this.t('rooms');
    const touch = !!window.GameIt?.prefs?.touch;
    const k = touch ? c.touchKeys || c.keys : c.keys;
    this.keysEl.textContent = k ? this.tr(k) : '';
    this.privTitle.textContent = this.t('priv');
    this.offTitle.textContent = this.t('level');
    this.createBtn.textContent = this.t('create');
    this.codeLabel.textContent = this.t('haveCode');
    this.joinBtn.textContent = this.t('join');
    this.backPriv.textContent = `← ${this.t('back')}`;
    this.backOff.textContent = `← ${this.t('back')}`;
    (c.offline?.levels || []).forEach((lv, i) => {
      const b = this.levelsEl.children[i];
      if (b) set(b, this.tr(lv.label), this.tr(lv.hint));
    });
    this.paintSettings();
    this.renderRooms();
  }

  // ------------------------------------------------ vistas
  /** `focus`: mueve el foco al botón principal de la vista (solo cuando cambia por una acción de la persona). */
  setView(v, focus = false) {
    this.view = v;
    for (const el of [this.home, this.priv, this.offView]) el.hidden = el.dataset.view !== v;
    if (v === 'private') this.codeInput.value = this.privCode || this.codeInput.value;
    this.status('');
    if (!this.visible || !focus) return;
    const target = v === 'home' ? (this.invited ? this.inviteBtn : this.quickBtn) : v === 'private' ? this.createBtn : this.levelsEl.firstElementChild;
    target?.focus({ preventScroll: true });
  }

  status(text) {
    this.statusEl.textContent = text || '';
  }
  /** Aviso: en el menú va en la línea de estado; si está oculto, al juego (toast). */
  notice(text) {
    if (this.visible) this.status(text);
    else this.cfg.onNotice?.(text);
  }
  setBusy(on, text) {
    this.busy = on;
    this.root.classList.toggle('ar-busy', on);
    this.panel.setAttribute('aria-busy', String(on));
    if (on) this.status(text);
    clearTimeout(this.busyT);
    if (on) {
      // si el servidor no contesta no se queda trabado el menú
      this.busyT = setTimeout(() => {
        if (!this.busy) return;
        this.quickWanted = false;
        this.setBusy(false);
        this.status(this.t('timeout'));
      }, 12000);
    }
  }

  // ------------------------------------------------ acciones
  quick() {
    if (this.busy) return;
    const name = this.commit();
    this.quickName = name;
    this.quickWanted = true;
    this.setBusy(true, this.t('searching'));
    this.net.send({ t: 'list', game: this.game });
  }
  joinRoom(code) {
    if (this.busy) return;
    const name = this.commit();
    this.pendingPrivate = false;
    this.setBusy(true, this.t('joining'));
    this.net.join(code, name);
  }
  joinByCode() {
    const code = cleanCode(this.codeInput.value);
    if (code.length !== 5) {
      this.codeInput.focus();
      return;
    }
    this.joinRoom(code);
  }
  createPrivate() {
    if (this.busy) return;
    const name = this.commit();
    this.pendingPrivate = true;
    this.setBusy(true, this.t('creating'));
    this.net.create(name, createSettings(this.cfg.settings, this.chosen, { isPublic: false, bots: this.bots }));
  }
  playOffline(level) {
    const name = this.commit();
    this.leave();
    this.hide();
    this.cfg.onOffline?.({ name, color: this.profile.color, level });
  }

  async shareRoom() {
    const code = this.net.room?.code;
    if (!code) return;
    const r = await share(this.game, code);
    this.notice(r === 'copied' ? this.t('copied') : r === 'shared' ? this.t('shared') : this.t('codeIs', { c: code }));
  }

  // ------------------------------------------------ red
  poll(force) {
    if (!this.visible || this.busy || this.view === 'offline' || !this.connected) return;
    if (!force && typeof document !== 'undefined' && document.hidden) return;
    this.net.raw({ t: 'list', game: this.game });
  }

  onStatus(st) {
    const cs = connState(st);
    if (cs) this.setConn(cs);
    if (st === 'open') {
      this.pinger.start();
      this.status('');
      if (this.visible) this.poll(true);
    } else {
      this.pinger.stop();
      if (this.visible && (st === 'connecting' || st === 'wakeup' || st === 'reconnecting' || st === 'netError' || st === 'rate')) this.status(netText(st === 'connecting' ? 'connecting' : st));
      if (st === 'netError' || st === 'rate') {
        this.quickWanted = false;
        if (this.busy) this.setBusy(false);
        if (this.visible) this.status(netText(st));
      }
    }
    this.cfg.onStatus?.(st);
  }

  onJoined(m) {
    const rejoined = this.inRoom;
    this.inRoom = true;
    this.retries = 0;
    clearTimeout(this.busyT);
    this.setBusy(false);
    this.quickWanted = false;
    const priv = !!this.pendingPrivate;
    this.hide();
    this.cfg.onJoin?.({ code: m.code, id: m.id, private: priv, rejoined });
  }

  onRoom(room) {
    this.refreshRoomChips();
    this.cfg.onRoom?.(room);
  }

  onMessage(m) {
    if (m.t === 'list') {
      this.rooms = Array.isArray(m.rooms) ? m.rooms : [];
      this.renderRooms();
      if (this.quickWanted) {
        this.quickWanted = false;
        const code = pickQuickRoom(this.rooms);
        this.pendingPrivate = false;
        this.setBusy(true, code ? this.t('joining') : this.t('creating'));
        if (code) this.net.join(code, this.quickName || defaultName());
        else this.net.create(this.quickName || defaultName(), createSettings(this.cfg.settings, this.chosen, { isPublic: true, bots: true }));
      }
      return;
    }
    if (m.t === 'error') {
      const code = String(m.code || '');
      const wasBusy = this.busy;
      this.setBusy(false);
      if (!wasBusy && this.inRoom && code !== 'closed') return; // errores sueltos dentro de la arena (por ejemplo "rate")
      // la sala se llenó justo antes de entrar: se busca otra una vez más
      if (code === 'room_full' && this.retries < 2 && this.lastWasQuick()) {
        this.retries++;
        this.quick();
        return;
      }
      this.notice(netText(code));
      return;
    }
    if (m.t === 'closed' || m.t === 'kicked') {
      this.inRoom = false;
      const reason = m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`;
      const text = netText(reason);
      this.refreshRoomChips();
      this.cfg.onLeave?.({ reason: m.t === 'kicked' ? 'kicked' : String(m.reason || ''), text });
      if (m.t === 'closed' && m.reason === 'max_life') {
        this.notice(text);
        this.quick(); // la arena cumplió su tiempo: se busca otra sola
      } else {
        this.show();
        this.status(text);
      }
      return;
    }
    this.cfg.onMessage?.(m);
  }
  lastWasQuick() {
    return !this.pendingPrivate && !!this.quickName;
  }

  // ------------------------------------------------ lista de salas
  renderRooms() {
    const ul = this.roomsList;
    ul.textContent = '';
    if (!this.rooms.length) {
      ul.append(h('li', { class: 'ar-empty', text: this.t('noRooms') }));
      return;
    }
    for (const r of this.rooms) {
      const row = roomRow(r, this.lang);
      const btn = h('button', { class: 'ar-room', type: 'button', disabled: !row.joinable, onclick: () => this.joinRoom(row.code), 'aria-label': `${this.t('join')} ${row.title}, ${row.meta}, ${row.state}` });
      btn.append(h('b', { class: 'ar-room-name', text: row.title }), h('span', { class: 'ar-room-meta', text: row.meta }), h('i', { class: `ar-room-state ${r.state === 'playing' ? 'on' : ''}`, text: row.state }));
      ul.append(h('li', {}, btn));
    }
  }

  // ------------------------------------------------ chips
  /** Chip de ping y "Reconectando…" dentro de `parent` (lo actualiza el menú). */
  attachChip(parent) {
    const chip = new StatusChip(parent, { lang: this.lang });
    chip.setState(this.conn || 'ok');
    this.chips.push(chip);
    return chip;
  }
  setConn(state) {
    this.conn = state;
    for (const c of this.chips) c.setState(state);
    document.documentElement.dataset.arConn = state;
  }
  tickChips() {
    const lang = this.lang;
    const ping = this.clock.ready && this.connected ? this.clock.rtt : 0;
    for (const c of this.chips) {
      if (c.lang !== lang) c.setLang(lang);
      c.setPing(ping);
    }
    if (this.roomChips.length) this.refreshRoomChips();
  }

  /** Botón "Sala ABCDE · copiar link": solo en salas privadas. */
  roomChip(parent) {
    const b = h('button', { class: 'ar-roomchip', type: 'button', hidden: true, onclick: () => this.shareRoom() });
    parent.append(b);
    this.roomChips.push(b);
    this.refreshRoomChips();
    return b;
  }
  refreshRoomChips() {
    const room = this.net.room;
    for (const b of this.roomChips) {
      const show = !!room && this.inRoom && room.settings?.public === false;
      b.hidden = !show;
      if (show) b.textContent = this.t('chip', { c: room.code });
    }
  }
}
