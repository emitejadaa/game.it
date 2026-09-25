/**
 * Teléfono Loco online: el teléfono descompuesto con dibujos.
 *
 * Cada jugador arranca una cadena escribiendo una frase (o la partida empieza con frases al
 * azar). En cada paso las cadenas rotan: al que le llega una frase la dibuja y al que le llega un
 * dibujo lo describe, sin ver nada de lo anterior. Cada cadena pasa una sola vez por cada
 * jugador. Al final se muestran los álbumes paso a paso y todos ven lo mismo (avanza el
 * anfitrión, o solo si se eligió "automático").
 *
 * Lo que cada uno escribe o dibuja llega al servidor mientras lo hace: si se acaba el tiempo o se
 * corta la conexión no se pierde. Si alguien no responde, al siguiente le llega lo último que
 * haya en la cadena del tipo que necesita (o una frase al azar).
 *
 * Mensajes: text { v } · op { o } · undo · clear · done { on, v } · next (anfitrión, en la
 * revelación) · react { e } · albums (pedir todos los álbumes al terminar) · again (anfitrión).
 * Los dibujos viajan como en Garabato: { k: 's', c, w, p } empieza un trazo (p = x,y,… en
 * 0..1000 × 0..750), { k: '+', p } lo sigue, { k: 'f', x, y, c } es un relleno.
 */
import { randomInt } from 'node:crypto';
import { PROMPTS } from '../../public/games/telefono/shared/prompts.js';

const MAX_OPS = 3000;
const MAX_POINTS = 60000;
const MAX_TEXT = 90;
const COLORS = 18;
const SIZES = 4;
const GRACE = 1500; // margen para los últimos trazos que vienen en camino
const ALL_DONE_MS = 700;
const MANUAL_MS = 60e3; // en la revelación manual, si nadie avanza en un minuto sigue sola
const REACTS = ['😂', '❤️', '🔥', '😮', '👏'];
const REACT_MS = 350;
const rnd = (n) => randomInt(0, n);

const cleanText = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TEXT);

const connected = (api) => api.players().filter((p) => p.connected);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPrompt(room, used) {
  const list = PROMPTS[room.settings.lang] || PROMPTS.es;
  for (let k = 0; k < 30; k++) {
    const p = list[rnd(list.length)];
    if (!used.has(p)) {
      used.add(p);
      return p;
    }
  }
  return list[rnd(list.length)];
}

function start(room, api) {
  const prev = room.data?.game || 0;
  const ids = shuffle(connected(api).map((p) => p.id));
  const st = room.settings;
  const n = ids.length;
  const offset = st.start === 'random' ? 1 : 0;
  const steps = st.chain ? Math.min(n, st.chain) : n;
  const d = {
    game: prev + 1,
    order: ids,
    names: Object.fromEntries(ids.map((id) => [id, room.players.get(id).name])),
    colors: Object.fromEntries(ids.map((id) => [id, room.players.get(id).color])),
    n,
    offset,
    len: steps + offset,
    step: -1,
    phase: '',
    kind: '',
    chains: ids.map(() => []),
    work: new Map(),
    used: new Set(),
    deadline: 0,
    total: 0,
    album: 0,
    entry: 0,
    lastReact: new Map(),
  };
  if (offset) for (let c = 0; c < n; c++) d.chains[c].push({ by: null, k: 'text', v: randomPrompt(room, d.used), auto: 1 });
  room.data = d;
  nextStep(room, api);
}

/** Qué cadena le toca al jugador i en el paso actual (la cadena c pasa por el jugador c + paso). */
const chainOf = (d, i) => (((i - d.step + d.offset) % d.n) + d.n) % d.n;

/** Lo que recibe para responder: la última frase (para dibujar) o el último dibujo (para describir). */
function inputFor(room, d, c) {
  if (d.step === 0) return null;
  const want = d.kind === 'draw' ? 'text' : 'draw';
  const ch = d.chains[c];
  for (let k = ch.length - 1; k >= 0; k--) if (ch[k].k === want && !ch[k].empty) return { k: want, v: ch[k].v };
  // no hay nada: para dibujar, una frase al azar; para describir, escribe lo que quiera
  return want === 'text' ? { k: 'text', v: randomPrompt(room, d.used), auto: 1 } : null;
}

function nextStep(room, api) {
  const d = room.data;
  api.clearTimer('phase');
  if (d.step >= 0) collect(d, room);
  d.step = d.step < 0 ? d.offset : d.step + 1;
  if (d.step >= d.len) return startReveal(room, api);
  d.kind = d.step % 2 === 0 ? 'text' : 'draw';
  d.phase = d.step === 0 ? 'write' : d.kind === 'draw' ? 'draw' : 'guess';
  d.work = new Map();
  const ms = (d.kind === 'draw' ? room.settings.drawTime : room.settings.writeTime) * 1000;
  d.total = ms;
  d.deadline = Date.now() + ms;
  d.order.forEach((pid, i) => {
    const c = chainOf(d, i);
    d.work.set(pid, { chain: c, input: inputFor(room, d, c), text: '', ops: [], points: 0, done: false });
    sendTask(api, d, pid);
  });
  api.setTimer('phase', ms + GRACE, () => nextStep(room, api));
  api.sync();
}

/** Pasa lo que hizo cada uno a su cadena. */
function collect(d, room) {
  for (const [pid, w] of d.work) {
    const ch = d.chains[w.chain];
    if (d.kind === 'text') {
      let v = cleanText(w.text).trim();
      const e = { by: pid, k: 'text', v };
      if (!v && d.step === 0) {
        e.v = randomPrompt(room, d.used);
        e.auto = 1;
      } else if (!v) e.empty = 1;
      ch.push(e);
    } else ch.push({ by: pid, k: 'draw', v: w.ops, ...(w.ops.length ? {} : { empty: 1 }) });
  }
}

function sendTask(api, d, pid) {
  const w = d.work.get(pid);
  if (!w) return;
  api.send(pid, { t: 'task', game: d.game, step: d.step, kind: d.kind, phase: d.phase, input: w.input, mine: { text: w.text, ops: w.ops, done: w.done } });
}

function allDone(room, api) {
  const d = room.data;
  const live = d.order.filter((id) => api.connected(id));
  return live.length > 0 && live.every((id) => d.work.get(id)?.done);
}

/** Si ya terminaron todos los que están, se pasa enseguida; si no, se espera al reloj. */
function checkDone(room, api) {
  const d = room.data;
  if (d.phase !== 'write' && d.phase !== 'draw' && d.phase !== 'guess') return;
  if (allDone(room, api)) api.setTimer('phase', ALL_DONE_MS, () => nextStep(room, api));
  else api.setTimer('phase', Math.max(0, d.deadline - Date.now()) + GRACE, () => nextStep(room, api));
}

// ---------------------------------------------------------------- revelación
const itemOf = (d, e) => ({ ...e, name: e.by ? d.names[e.by] : null, color: e.by ? d.colors[e.by] : null });

function startReveal(room, api) {
  const d = room.data;
  d.phase = 'reveal';
  d.kind = '';
  d.work = new Map();
  d.album = 0;
  d.entry = 0;
  api.broadcast({ t: 'rev', game: d.game, album: 0, i: 0, item: itemOf(d, d.chains[0][0]) });
  schedule(room, api);
  api.sync();
}

function schedule(room, api) {
  const d = room.data;
  const e = d.chains[d.album][d.entry];
  const ms = room.settings.reveal === 'auto' ? (e.k === 'draw' ? 7000 : 4500) : MANUAL_MS;
  d.total = ms;
  d.deadline = Date.now() + ms;
  api.setTimer('phase', ms, () => advance(room, api));
}

function advance(room, api) {
  const d = room.data;
  if (d.phase !== 'reveal') return;
  d.entry++;
  if (d.entry >= d.chains[d.album].length) {
    d.album++;
    d.entry = 0;
    if (d.album >= d.n) return finish(room, api);
  }
  api.broadcast({ t: 'rev', game: d.game, album: d.album, i: d.entry, item: itemOf(d, d.chains[d.album][d.entry]) });
  schedule(room, api);
  api.sync();
}

function finish(room, api) {
  const d = room.data;
  api.clearTimer('phase');
  d.phase = 'end';
  d.album = d.n - 1;
  d.entry = d.len - 1;
  d.deadline = 0;
  api.end({ albums: d.n });
}

/** Lo ya mostrado de un álbum (para quien vuelve a conectarse). */
function sendAlbum(api, d, pid, a, upto) {
  api.send(pid, { t: 'album', game: d.game, album: a, items: d.chains[a].slice(0, upto + 1).map((e) => itemOf(d, e)) });
}

// ---------------------------------------------------------------- dibujo
function validPts(p, max) {
  if (!Array.isArray(p) || p.length < 2 || p.length > max || p.length % 2) return null;
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (!Number.isInteger(v) || v < -20 || v > (i % 2 ? 770 : 1020)) return null;
  }
  return p;
}

function op(w, o) {
  if (!o || typeof o !== 'object') return false;
  if (w.ops.length >= MAX_OPS || w.points >= MAX_POINTS) return true;
  if (o.k === 's') {
    const pts = validPts(o.p, 200);
    if (!pts || !Number.isInteger(o.c) || o.c < 0 || o.c >= COLORS || !Number.isInteger(o.w) || o.w < 0 || o.w >= SIZES) return false;
    w.ops.push({ k: 's', c: o.c, w: o.w, p: pts.slice() });
    w.points += pts.length;
    return true;
  }
  if (o.k === '+') {
    const pts = validPts(o.p, 200);
    const last = w.ops[w.ops.length - 1];
    if (!pts || !last || last.k !== 's') return false;
    last.p.push(...pts);
    w.points += pts.length;
    return true;
  }
  if (o.k === 'f') {
    const { x, y, c } = o;
    if (![x, y, c].every(Number.isInteger) || x < 0 || x > 1000 || y < 0 || y > 750 || c < 0 || c >= COLORS) return false;
    w.ops.push({ k: 'f', x, y, c });
    return true;
  }
  return false;
}

function catchUp(room, api, pid) {
  const d = room.data;
  if (!d) return;
  if (d.work.has(pid)) sendTask(api, d, pid);
  if (d.phase === 'reveal') sendAlbum(api, d, pid, d.album, d.entry);
}

export default {
  minPlayers: 2,
  maxPlayers: 10,
  listable: true,
  defaults: { lang: 'es', drawTime: 90, writeTime: 40, chain: 0, start: 'write', reveal: 'manual', public: false },

  settings(cur, s) {
    const pick = (v, ok, d) => (ok.includes(v) ? v : d);
    return {
      lang: pick(s.lang, ['es', 'en'], cur.lang),
      drawTime: pick(Number(s.drawTime), [45, 60, 90, 120, 180], cur.drawTime),
      writeTime: pick(Number(s.writeTime), [20, 30, 40, 60], cur.writeTime),
      chain: pick(Number(s.chain), [0, 4, 6, 8], cur.chain),
      start: pick(s.start, ['write', 'random'], cur.start),
      reveal: pick(s.reveal, ['manual', 'auto'], cur.reveal),
      public: typeof s.public === 'boolean' ? s.public : cur.public,
    };
  },

  listInfo(room) {
    return { name: room.players.get(room.host)?.name || 'Teléfono Loco', lang: room.settings.lang };
  },

  canStart(room) {
    return [...room.players.values()].filter((p) => p.connected).length >= 2 ? null : 'need_players';
  },

  view(room) {
    const d = room.data;
    if (!d) return { tl: null };
    return {
      tl: {
        game: d.game,
        phase: d.phase,
        step: d.step - d.offset + 1,
        steps: d.len - d.offset,
        kind: d.kind,
        left: d.deadline ? Math.max(0, d.deadline - Date.now()) : 0,
        total: d.total,
        done: [...d.work].filter(([, w]) => w.done).map(([id]) => id),
        order: d.order,
        names: d.names,
        colors: d.colors,
        album: d.album,
        entry: d.entry,
        albums: d.n,
        len: d.len,
        owners: d.chains.map((ch) => ch.find((e) => e.by)?.by || null),
      },
    };
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    if (!d) return true;
    const w = d.work.get(p.id);
    const working = d.phase === 'write' || d.phase === 'draw' || d.phase === 'guess';
    switch (msg.t) {
      case 'text':
        if (!working || d.kind !== 'text' || !w || w.done) return true;
        if (typeof msg.v !== 'string') return false;
        w.text = cleanText(msg.v);
        return true;
      case 'op':
        if (!working || d.kind !== 'draw' || !w || w.done) return true;
        return op(w, msg.o);
      case 'undo':
      case 'clear':
        if (!working || d.kind !== 'draw' || !w || w.done) return true;
        if (msg.t === 'undo') {
          const o = w.ops.pop();
          if (o?.k === 's') w.points -= o.p.length;
        } else {
          w.ops = [];
          w.points = 0;
        }
        return true;
      case 'done':
        if (!working || !w) return true;
        if (d.kind === 'text' && typeof msg.v === 'string') w.text = cleanText(msg.v);
        w.done = !!msg.on;
        checkDone(room, api);
        api.sync();
        return true;
      case 'next':
        if (d.phase !== 'reveal' || room.host !== p.id) return true;
        advance(room, api);
        return true;
      default:
        return false;
    }
  },

  command(room, api, p, msg) {
    const d = room.data;
    if (msg.t === 'react') {
      if (!d || (d.phase !== 'reveal' && d.phase !== 'end') || !REACTS.includes(msg.e)) return true;
      const now = Date.now();
      if (now - (d.lastReact.get(p.id) || 0) < REACT_MS) return true;
      d.lastReact.set(p.id, now);
      api.broadcast({ t: 'react', p: p.id, e: msg.e });
      return true;
    }
    if (msg.t === 'albums') {
      // al terminar, cualquiera puede volver a ver todos los álbumes
      if (!d || d.phase !== 'end') return true;
      api.send(p.id, { t: 'albums', game: d.game, albums: d.chains.map((ch) => ch.map((e) => itemOf(d, e))) });
      return true;
    }
    if (msg.t === 'again') {
      if (room.state !== 'finished' || room.host !== p.id) return true;
      if (connected(api).length < 2) return true;
      room.state = 'playing';
      start(room, api);
      return true;
    }
    return undefined;
  },

  onReconnect(room, api, pid) {
    if (room.state === 'playing') catchUp(room, api, pid);
  },

  onDisconnect(room, api) {
    if (room.state === 'playing' && room.data) checkDone(room, api);
  },

  leave(room, api) {
    const d = room.data;
    if (!d) return;
    if (connected(api).length < 2) return api.toLobby();
    checkDone(room, api);
  },
};
