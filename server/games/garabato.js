/**
 * Garabato online: uno dibuja y los demás adivinan escribiendo en el chat.
 *
 * Por turno: el que dibuja elige entre 3 palabras (15 s), dibuja durante el tiempo de la sala y
 * los demás escriben. Acertar da más puntos cuanto antes (y un plus al primero); el que dibuja
 * suma una parte de lo que ganan los que adivinan. Con el tiempo se revelan letras de pista.
 * Se juegan N rondas: en cada una dibujan todos una vez. Se puede entrar con la partida empezada
 * (se recibe el dibujo en curso) y la sala puede ser pública (aparece en la lista).
 *
 * Mensajes: pick { i } · op { o } (trazo, relleno) · undo · clear · guess { m } (chat).
 * El dibujo viaja como operaciones: { k: 's', c, w, p } empieza un trazo (p = x,y,x,y… en
 * 0..1000 × 0..750), { k: '+', p } lo sigue, { k: 'f', x, y, c } es un relleno.
 */
import { randomInt } from 'node:crypto';
import { WORDS, clean, distance, mask } from '../../public/games/garabato/shared/words.js';

const CHOOSE_MS = 15e3;
const REVEAL_MS = 6500;
const MAX_OPS = 4000;
const MAX_POINTS = 80000;
const CHAT_MS = 350;
const COLORS = 18;
const SIZES = 4;
const rnd = (n) => randomInt(0, n);

const cleanChat = (s) =>
  String(s || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 80);

function parseCustom(s) {
  return [
    ...new Set(
      String(s || '')
        .slice(0, 1500)
        .split(/[,\n]/)
        .map((w) => w.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30))
        .filter((w) => clean(w).length >= 2),
    ),
  ];
}

function pool(room) {
  const st = room.settings;
  const custom = parseCustom(st.custom);
  if (st.onlyCustom && custom.length >= 6) return custom;
  return [...WORDS[st.lang], ...custom];
}

const connected = (api) => api.players().filter((p) => p.connected);

function start(room, api) {
  const ids = connected(api).map((p) => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  room.data = {
    order: ids,
    round: 1,
    idx: -1,
    turn: 0,
    phase: 'choose',
    drawer: null,
    choices: [],
    word: '',
    shown: new Set(),
    deadline: 0,
    total: 0,
    guessed: new Map(),
    drawerGain: 0,
    scores: Object.fromEntries(ids.map((id) => [id, 0])),
    ops: [],
    points: 0,
    used: new Set(),
    results: null,
    podium: null,
    lastChat: new Map(),
  };
  nextTurn(room, api);
}

function nextTurn(room, api) {
  const d = room.data;
  const st = room.settings;
  for (const k of ['phase', 'hint1', 'hint2', 'hint3']) api.clearTimer(k);
  // siguiente que dibuja (los que se fueron o no están conectados se saltean)
  for (let guard = 0; guard < 50; guard++) {
    d.idx++;
    if (d.idx >= d.order.length) {
      d.round++;
      d.idx = 0;
      // los que entraron tarde se suman al final
      for (const p of connected(api)) if (!d.order.includes(p.id)) d.order.push(p.id);
      d.order = d.order.filter((id) => room.players.has(id));
    }
    if (d.round > st.rounds) return endGame(room, api);
    const p = room.players.get(d.order[d.idx]);
    if (p?.connected) break;
  }
  d.turn++;
  d.drawer = d.order[d.idx];
  const words = pool(room).filter((w) => !d.used.has(clean(w)));
  const from = words.length >= 3 ? words : pool(room);
  const choices = new Set();
  while (choices.size < 3 && choices.size < from.length) choices.add(from[rnd(from.length)]);
  d.choices = [...choices];
  d.phase = 'choose';
  d.word = '';
  d.shown = new Set();
  d.ops = [];
  d.points = 0;
  d.guessed = new Map();
  d.drawerGain = 0;
  d.results = null;
  d.total = CHOOSE_MS;
  d.deadline = Date.now() + CHOOSE_MS;
  api.send(d.drawer, { t: 'choices', w: d.choices, turn: d.turn });
  api.setTimer('phase', CHOOSE_MS, () => choose(room, api, rnd(d.choices.length)));
  api.sync();
}

function choose(room, api, i) {
  const d = room.data;
  if (d.phase !== 'choose' || !d.choices[i]) return;
  const st = room.settings;
  d.word = d.choices[i];
  d.used.add(clean(d.word));
  d.phase = 'draw';
  d.total = st.time * 1000;
  d.deadline = Date.now() + d.total;
  api.send(d.drawer, { t: 'word', w: d.word, turn: d.turn });
  api.setTimer('phase', d.total, () => endTurn(room, api, 'time'));
  if (st.hints) {
    const letters = [...d.word].filter((c) => c !== ' ').length;
    const at = letters >= 7 ? [0.45, 0.68, 0.85] : letters >= 4 ? [0.5, 0.75] : [0.6];
    at.forEach((f, k) => api.setTimer(`hint${k + 1}`, d.total * f, () => hint(room, api)));
  }
  api.sync();
}

function hint(room, api) {
  const d = room.data;
  if (d.phase !== 'draw') return;
  const hidden = [...d.word].map((c, i) => (c !== ' ' && !d.shown.has(i) ? i : -1)).filter((i) => i >= 0);
  if (hidden.length <= 1) return;
  d.shown.add(hidden[rnd(hidden.length)]);
  api.sync();
}

function guessers(room) {
  const d = room.data;
  return [...room.players.values()].filter((p) => p.connected && p.id !== d.drawer);
}

function endTurn(room, api, why) {
  const d = room.data;
  if (d.phase !== 'draw' && d.phase !== 'choose') return;
  for (const k of ['phase', 'hint1', 'hint2', 'hint3']) api.clearTimer(k);
  if (d.scores[d.drawer] !== undefined) d.scores[d.drawer] += d.drawerGain;
  d.results = { word: d.word || d.choices[0] || '', drawer: d.drawer, why, drawerGain: d.drawerGain, gains: Object.fromEntries(d.guessed) };
  d.phase = 'reveal';
  d.total = REVEAL_MS;
  d.deadline = Date.now() + REVEAL_MS;
  api.setTimer('phase', REVEAL_MS, () => nextTurn(room, api));
  api.sync();
}

function endGame(room, api) {
  const d = room.data;
  for (const k of ['phase', 'hint1', 'hint2', 'hint3']) api.clearTimer(k);
  d.phase = 'end';
  d.podium = Object.entries(d.scores)
    .map(([id, pts]) => ({ id, name: room.players.get(id)?.name || '?', color: room.players.get(id)?.color, pts }))
    .sort((a, b) => b.pts - a.pts);
  d.deadline = 0;
  api.end({ podium: d.podium });
}

function chat(room, api, p, text) {
  const d = room.data;
  const now = Date.now();
  if (d && now - (d.lastChat.get(p.id) || 0) < CHAT_MS) return;
  d?.lastChat.set(p.id, now);
  const m = cleanChat(text);
  if (!m) return;
  if (room.state !== 'playing' || !d || d.phase !== 'draw') {
    // fuera del dibujo es chat normal (el que dibuja no puede decir la palabra mientras elige)
    if (d && d.phase === 'choose' && p.id === d.drawer && d.choices.some((w) => clean(m).includes(clean(w)))) return;
    api.broadcast({ t: 'chat', p: p.id, m });
    return;
  }
  if (p.id === d.drawer) return; // el que dibuja no escribe
  const w = clean(d.word);
  const c = clean(m);
  if (d.guessed.has(p.id)) {
    // los que ya adivinaron hablan entre ellos (y con el que dibuja)
    if (c.includes(w)) return;
    for (const q of room.players.values()) if (q.id === d.drawer || d.guessed.has(q.id)) api.send(q.id, { t: 'chat', p: p.id, m, g: 1 });
    return;
  }
  if (c === w) {
    const left = Math.max(0, d.deadline - now) / d.total;
    const first = d.guessed.size === 0;
    const gain = Math.round(100 + 400 * left) + (first ? 50 : 0);
    d.guessed.set(p.id, gain);
    d.scores[p.id] = (d.scores[p.id] || 0) + gain;
    d.drawerGain += Math.round(gain * 0.35);
    api.broadcast({ t: 'chat', p: p.id, ok: 1, gain });
    api.send(p.id, { t: 'word', w: d.word, turn: d.turn });
    api.touch();
    if (guessers(room).every((q) => d.guessed.has(q.id))) endTurn(room, api, 'all');
    else api.sync();
    return;
  }
  if (w.length >= 4 && distance(c, w) === 1) api.send(p.id, { t: 'close', m });
  // una palabra que contiene la respuesta no se muestra (no se la regala a los demás)
  if (c.includes(w)) return;
  api.broadcast({ t: 'chat', p: p.id, m });
}

function validPts(p, max) {
  if (!Array.isArray(p) || p.length < 2 || p.length > max || p.length % 2) return null;
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (!Number.isInteger(v) || v < -20 || v > (i % 2 ? 770 : 1020)) return null;
  }
  return p;
}

function op(room, api, p, o) {
  const d = room.data;
  if (d.phase !== 'draw' || p.id !== d.drawer || !o || typeof o !== 'object') return false;
  if (d.ops.length >= MAX_OPS || d.points >= MAX_POINTS) return true;
  if (o.k === 's') {
    const pts = validPts(o.p, 200);
    if (!pts || !Number.isInteger(o.c) || o.c < 0 || o.c >= COLORS || !Number.isInteger(o.w) || o.w < 0 || o.w >= SIZES) return false;
    const s = { k: 's', c: o.c, w: o.w, p: pts.slice() };
    d.ops.push(s);
    d.points += pts.length;
    api.broadcast({ t: 'op', o: s }, p.id);
    return true;
  }
  if (o.k === '+') {
    const pts = validPts(o.p, 200);
    const last = d.ops[d.ops.length - 1];
    if (!pts || !last || last.k !== 's') return false;
    last.p.push(...pts);
    d.points += pts.length;
    api.broadcast({ t: 'op', o: { k: '+', p: pts } }, p.id);
    return true;
  }
  if (o.k === 'f') {
    const { x, y, c } = o;
    if (![x, y, c].every(Number.isInteger) || x < 0 || x > 1000 || y < 0 || y > 750 || c < 0 || c >= COLORS) return false;
    const f = { k: 'f', x, y, c };
    d.ops.push(f);
    api.broadcast({ t: 'op', o: f }, p.id);
    return true;
  }
  return false;
}

/** Lo que necesita alguien que entra (o vuelve) en medio de un turno. */
function catchUp(room, api, pid) {
  const d = room.data;
  if (!d) return;
  api.send(pid, { t: 'ops', ops: d.ops, turn: d.turn });
  if (d.phase === 'choose' && pid === d.drawer) api.send(pid, { t: 'choices', w: d.choices, turn: d.turn });
  if (d.phase === 'draw' && (pid === d.drawer || d.guessed.has(pid))) api.send(pid, { t: 'word', w: d.word, turn: d.turn });
}

export default {
  minPlayers: 2,
  maxPlayers: 10,
  lateJoin: true,
  listable: true,
  defaults: { lang: 'es', rounds: 3, time: 80, hints: 1, public: false, custom: '', onlyCustom: 0 },

  settings(cur, s) {
    const pick = (v, ok, d) => (ok.includes(v) ? v : d);
    return {
      lang: pick(s.lang, ['es', 'en'], cur.lang),
      rounds: pick(Number(s.rounds), [2, 3, 4, 5], cur.rounds),
      time: pick(Number(s.time), [60, 80, 100, 120], cur.time),
      hints: pick(Number(s.hints), [0, 1], cur.hints),
      public: typeof s.public === 'boolean' ? s.public : cur.public,
      custom: typeof s.custom === 'string' ? parseCustom(s.custom).join(', ') : cur.custom,
      onlyCustom: pick(Number(s.onlyCustom), [0, 1], cur.onlyCustom),
    };
  },

  listInfo(room) {
    return { name: room.players.get(room.host)?.name || 'Garabato', lang: room.settings.lang, round: room.data?.round || 0, rounds: room.settings.rounds };
  },

  canStart(room) {
    return [...room.players.values()].filter((p) => p.connected).length >= 2 ? null : 'need_players';
  },

  view(room) {
    const d = room.data;
    if (!d) return { gb: null };
    const now = Date.now();
    return {
      gb: {
        phase: d.phase,
        round: Math.min(d.round, room.settings.rounds),
        rounds: room.settings.rounds,
        turn: d.turn,
        drawer: d.drawer,
        hint: d.phase === 'draw' ? mask(d.word, d.shown) : '',
        left: d.deadline ? Math.max(0, d.deadline - now) : 0,
        total: d.total,
        scores: d.scores,
        guessed: [...d.guessed.keys()],
        results: d.phase === 'reveal' ? d.results : null,
        podium: d.phase === 'end' ? d.podium : null,
      },
    };
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    if (!d) return true;
    if (msg.t === 'op') return op(room, api, p, msg.o);
    if (msg.t === 'pick') {
      if (p.id !== d.drawer || d.phase !== 'choose') return true;
      const i = Number(msg.i);
      if (!Number.isInteger(i) || i < 0 || i > 2) return false;
      api.clearTimer('phase');
      choose(room, api, i);
      return true;
    }
    if (msg.t === 'undo' || msg.t === 'clear') {
      if (p.id !== d.drawer || d.phase !== 'draw') return true;
      if (msg.t === 'undo') d.ops.pop();
      else d.ops = [];
      api.broadcast({ t: msg.t }, p.id);
      return true;
    }
    return false;
  },

  /** El chat (y las respuestas) funciona en cualquier estado de la sala. */
  command(room, api, p, msg) {
    if (msg.t === 'guess') {
      if (typeof msg.m !== 'string') return false;
      chat(room, api, p, msg.m);
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

  onJoin(room, api, pid) {
    const d = room.data;
    if (!d || room.state !== 'playing') return;
    if (d.scores[pid] === undefined) d.scores[pid] = 0;
    if (!d.order.includes(pid)) d.order.push(pid);
    catchUp(room, api, pid);
  },

  onReconnect(room, api, pid) {
    if (room.state === 'playing') catchUp(room, api, pid);
  },

  onDisconnect(room, api, pid) {
    const d = room.data;
    if (!d || room.state !== 'playing') return;
    if (pid === d.drawer && (d.phase === 'draw' || d.phase === 'choose')) endTurn(room, api, 'left');
    else if (d.phase === 'draw' && guessers(room).length && guessers(room).every((q) => d.guessed.has(q.id))) endTurn(room, api, 'all');
  },

  leave(room, api, pid) {
    const d = room.data;
    if (!d) return;
    const i = d.order.indexOf(pid);
    if (i >= 0) {
      d.order.splice(i, 1);
      if (i <= d.idx) d.idx--;
    }
    delete d.scores[pid];
    if (connected(api).length < 2) return api.toLobby();
    if (pid === d.drawer && (d.phase === 'draw' || d.phase === 'choose')) endTurn(room, api, 'left');
    else if (d.phase === 'draw' && guessers(room).every((q) => d.guessed.has(q.id))) endTurn(room, api, 'all');
  },
};
