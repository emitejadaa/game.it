/**
 * Trotamundos online: el servidor elige las ubicaciones, lleva los relojes y el puntaje; los clientes
 * muestran la vista de calle y el mapa de marcar. De 2 a 10 jugadores, se puede entrar con la partida
 * empezada y la sala puede ser pública. Reglas y diseño: docs/trotamundos.md (sección 5).
 *
 * ============================== CONTRATO PARA EL CLIENTE ==============================
 *
 * AJUSTES (room.settings, los elige el anfitrión en el lobby con { t: 'settings', settings: {…} } o al
 * mandar { t: 'start', settings: {…} }; el servidor valida y corrige cada uno):
 *   mode   'random' (lugares al azar, datos/mundo.json) | 'famosos' (datos/famosos.json)
 *   scope  'mundo' | 'latam' | continente ('AF','AS','EU','NA','SA','OC') | código de país (ISO-2, 'AR')
 *          Un ámbito que no tiene al menos `rounds` lugares disponibles cae a 'mundo'.
 *   rounds 3 | 5 | 10      (si hay menos lugares que rondas en todo el mundo, se juegan menos: tm.rounds)
 *   time   0 | 30 | 60 | 90 | 120 | 180   segundos para mirar y marcar (0 = sin límite)
 *   frozen 0 | 1           "congelado": sin mover, girar ni zoom (lo aplica el cliente)
 *   rush   0 | 1           al confirmar el primero, a los demás les quedan 15 s
 *   public boolean         aparece en la lista de salas públicas
 * Valores inválidos se ignoran (queda el valor anterior). Defaults: random, mundo, 5, 90, 0, 0, false.
 * Errores de 'start' que puede devolver el servidor: need_players (menos de 2 conectados) y no_data
 * (el servidor no tiene ninguna ubicación cargada).
 *
 * VISTA (cada mensaje { t: 'room', room } trae room.tm; room.now es la hora del servidor al armarlo):
 *   room.tm es null en el lobby. Durante la partida (y al terminar):
 *   {
 *     phase:   'look' | 'reveal' | 'end',
 *     round:   número de ronda (1..rounds),      rounds: total de rondas de esta partida,
 *     mode, scope,                               ajustes efectivos de la partida
 *     scale:   escala en km del puntaje (scopeScale), time, frozen, rush: ajustes de la partida,
 *     loc:     { lat, lng, h } ubicación de la ronda (h = rumbo inicial 0..360) o null en 'end',
 *              (en 'look' no trae nombre, país ni nada que delate el lugar),
 *     t0, t1:  hora de inicio y de fin de la fase en tiempo del SERVIDOR (ms). El cliente usa
 *              offset = room.now - Date.now() para mostrar el reloj: restante = t1 - (Date.now() + offset).
 *              En 'look' con time = 0, t1 es solo un tope de seguridad (6 min): no hace falta mostrar reloj.
 *              En 'reveal', t1 es cuando pasa solo a la ronda siguiente. Con rush, t1 se acorta al
 *              confirmar el primero (el cliente tiene que volver a leerlo en cada 'room'). En 'end' valen 0.
 *     playing: [id…] los que juegan esta ronda (los que entraron durante la ronda miran y juegan desde la siguiente),
 *     done:    [id…] los que ya confirmaron en 'look' (sin sus coordenadas: los pines ajenos se ven en 'reveal'),
 *     noimg:   [id…] los que pidieron cambiar la ubicación en esta ronda,
 *     swapsLeft: cuántos cambios de ubicación quedan en esta ronda (máx. 2; 0 si ya no hay lugares de repuesto),
 *     swaps:   cuántas veces se cambió la ubicación en esta ronda,
 *     scores:  { id: puntaje acumulado } (en 'reveal', ya incluye esta ronda),
 *     reveal:  null salvo en 'reveal': {
 *                place: { id, lat, lng, cc, n: { es, en } | null, p: string | null },  // lugar real (n: famosos, p: poblado cercano)
 *                results: [{ id, lat, lng, km, pts }]  // uno por cada jugador de la ronda, ordenado por puntos;
 *                                                      // sin pin: lat, lng y km en null y pts 0
 *              },
 *     ranking: null salvo en 'end': [{ id, name, color, pts }] de mayor a menor,
 *     history: null salvo en 'end': [{ round, place (como arriba), results (como arriba) }] una por ronda jugada,
 *   }
 *   Los ids son los de room.players. Un jugador desconectado sigue en room.players (connected: false).
 *
 * MENSAJES DEL CLIENTE (todos inválidos devuelven falta al núcleo; ninguno tira error):
 *   { t: 'guess', lat, lng }  confirma el pin: una sola vez por ronda, solo en 'look', solo si estás en tm.playing,
 *                             lat/lng números dentro de rango. Si todos los conectados confirmaron, la ronda termina antes.
 *   { t: 'noimg' }            "no carga la imagen": si más de la mitad de los jugadores conectados de la ronda lo piden
 *                             en los primeros 25 s, se cambia la ubicación y se reinicia el reloj (hasta 2 veces por ronda).
 *                             Cada jugador cuenta una vez. Fuera de ese margen se ignora (no es falta).
 *   { t: 'next' }             solo el anfitrión y solo en 'reveal': pasa ya a la ronda siguiente (o al final).
 *
 * MENSAJES DEL SERVIDOR (además de 'room', 'joined', 'end', etc. del núcleo):
 *   { t: 'swap', round, n }              se cambió la ubicación de la ronda (n = cantidad de cambios): el cliente descarta
 *                                        su pin y recarga el visor con room.tm.loc (que llega en el 'room' siguiente).
 *   { t: 'mine', round, lat, lng }       al volver con el token en 'look': tu pin ya confirmado de la ronda en curso.
 *   { t: 'end', ranking, history, rounds, mode, scope }   fin de la partida (igual que tm en 'end').
 *
 * FLUJO: look → (todos los conectados confirmaron, o se acabó el tiempo) → reveal (pase automático a los ~12 s, o
 * antes si el anfitrión manda 'next') → look de la ronda siguiente … → después de la última revelación, 'end' y la sala
 * queda en estado 'finished' (el anfitrión puede mandar 'rematch': la sala vuelve limpia al lobby).
 * Si alguien se desconecta sigue en la sala (sus rondas sin confirmar valen 0) hasta el límite del núcleo; si al irse
 * quedan menos de 2 conectados, la partida termina con el podio.
 */
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { REGIONS, validCoord, distanceKm, scoreFor, inScope, scopeScale, pickLocations, headingFor } from '../../public/games/trotamundos/shared/geo.js';

// ---------------------------------------------------------------- tiempos
// Los tiempos de ajuste solo se leen del entorno en pruebas (NODE_ENV=test); en producción son constantes.
const TESTING = process.env.NODE_ENV === 'test';
const tune = (name, d) => (TESTING && Number(process.env[name]) > 0 ? Number(process.env[name]) : d);
const REVEAL_MS = tune('TM_REVEAL_MS', 12e3); // revelación antes de pasar sola a la ronda siguiente
const LOOK_CAP_MS = tune('TM_LOOK_CAP_MS', 6 * 60e3); // tope de 'look' cuando no hay límite de tiempo
const RUSH_MS = tune('TM_RUSH_MS', 15e3); // lo que les queda a los demás cuando alguien confirma con rush
const NOIMG_WINDOW_MS = tune('TM_NOIMG_WINDOW_MS', 25e3); // margen para pedir otra ubicación
const TIME_FACTOR = tune('TM_TIME_FACTOR', 1); // multiplica el tiempo por ronda del ajuste (solo pruebas)
const MAX_SWAPS = 2;

const ROUNDS = [3, 5, 10];
const TIMES = [0, 30, 60, 90, 120, 180];

// ---------------------------------------------------------------- datos (se leen una sola vez)
const DATA_DIR = new URL('../../public/games/trotamundos/datos/', import.meta.url);

function readJson(name) {
  try {
    return JSON.parse(readFileSync(new URL(name, DATA_DIR), 'utf8'));
  } catch (e) {
    console.warn(`trotamundos: no se pudo leer datos/${name} (${e?.code || e?.message || e})`);
    return null;
  }
}

const str = (v, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

/** Deja solo las ubicaciones bien formadas (y sin ids repetidos). */
function cleanList(raw, famous) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set();
  const out = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object' || !validCoord(l.lat, l.lng)) continue;
    const id = str(l.id, 32);
    const cc = str(l.cc, 4).toUpperCase();
    if (!id || !cc || ids.has(id)) continue;
    ids.add(id);
    const loc = { id, lat: l.lat, lng: l.lng, cc };
    if (Number.isFinite(l.h)) loc.h = l.h;
    if (famous) {
      const es = str(l.n?.es);
      const en = str(l.n?.en) || es;
      if (!es && !en) continue; // un famoso sin nombre no se puede revelar
      loc.n = { es: es || en, en };
    } else if (str(l.p)) loc.p = str(l.p);
    out.push(loc);
  }
  return out;
}

const FAMOSOS = cleanList(readJson('famosos.json'), true);
const MUNDO = cleanList(readJson('mundo.json'), false);
const metaRaw = readJson('paises.json');
const PAISES = metaRaw && typeof metaRaw === 'object' ? metaRaw : null;

/** Lugares disponibles para un modo y un ámbito (si falta el archivo del modo, se usa el otro). */
function poolFor(mode, scope) {
  const base = mode === 'famosos' ? (FAMOSOS.length ? FAMOSOS : MUNDO) : MUNDO.length ? MUNDO : FAMOSOS;
  return base.filter((l) => inScope(l, scope, PAISES));
}

// ---------------------------------------------------------------- utilidades
const rnd = () => randomInt(0, 2 ** 31) / 2 ** 31;
const connected = (api) => api.players().filter((p) => p.connected);

/** Número de un valor que llegó por JSON (sin convertir null, '' ni booleanos raros). */
function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}
const flag = (v, d) => (v === true || v === 1 || v === '1' ? 1 : v === false || v === 0 || v === '0' ? 0 : d);

/** 'mundo' | 'latam' | continente | país (en mayúsculas); null si no tiene forma de ámbito. */
function normScope(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^(mundo|latam)$/i.test(s)) return s.toLowerCase();
  const up = s.toUpperCase();
  return /^[A-Z]{2}$/.test(up) ? up : null;
}

const placeOf = (loc) => ({ id: loc.id, lat: loc.lat, lng: loc.lng, cc: loc.cc, n: loc.n || null, p: loc.p || null });

// ---------------------------------------------------------------- partida
function start(room, api) {
  const st = room.settings;
  const pool = poolFor(st.mode, st.scope);
  const n = Math.min(st.rounds, pool.length);
  // las primeras n son las rondas (de países distintos mientras se pueda); el resto, repuestos para 'noimg'
  const picks = pickLocations(pool, Math.min(pool.length, n * 3), rnd);
  const ids = connected(api).map((p) => p.id);
  room.data = {
    n,
    round: 0,
    phase: 'look',
    scale: scopeScale(st.scope, PAISES),
    mode: st.mode,
    scope: st.scope,
    picks: picks.slice(0, n),
    spares: picks.slice(n),
    loc: null,
    t0: 0,
    t1: 0,
    swaps: 0,
    eligible: new Set(),
    guesses: new Map(),
    noimg: new Set(),
    rushed: false,
    reveal: null,
    history: [],
    ranking: null,
    scores: Object.fromEntries(ids.map((id) => [id, 0])),
  };
  nextRound(room, api);
}

function nextRound(room, api) {
  const d = room.data;
  if (d.round >= d.n) return finishGame(room, api);
  d.round++;
  const base = d.picks[d.round - 1];
  d.loc = { ...base, h: headingFor(base, rnd) };
  d.phase = 'look';
  d.reveal = null;
  d.swaps = 0;
  // juegan los que están en la sala ahora (también los desconectados: si no confirman, valen 0)
  d.eligible = new Set(room.players.keys());
  for (const id of d.eligible) if (d.scores[id] === undefined) d.scores[id] = 0;
  startClock(room, api);
  api.touch();
  api.sync();
}

/** Arranca (o reinicia) el reloj de 'look' desde ahora. */
function startClock(room, api) {
  const d = room.data;
  const limit = room.settings.time ? room.settings.time * 1000 * TIME_FACTOR : LOOK_CAP_MS;
  d.t0 = Date.now();
  d.t1 = d.t0 + limit;
  d.guesses = new Map();
  d.noimg = new Set();
  d.rushed = false;
  api.setTimer('phase', limit, () => endLook(room, api));
}

/** Los jugadores de la ronda que siguen conectados. */
const presentPlayers = (room, api) => connected(api).filter((p) => room.data.eligible.has(p.id));

function allConfirmed(room, api) {
  const present = presentPlayers(room, api);
  return present.length > 0 && present.every((p) => room.data.guesses.has(p.id));
}

function endLook(room, api) {
  const d = room.data;
  if (!d || d.phase !== 'look') return;
  api.clearTimer('phase');
  const results = [];
  for (const id of d.eligible) {
    if (!room.players.has(id)) continue;
    const g = d.guesses.get(id);
    if (g) {
      const km = distanceKm(d.loc.lat, d.loc.lng, g.lat, g.lng);
      const pts = scoreFor(km, d.scale);
      d.scores[id] = (d.scores[id] || 0) + pts;
      results.push({ id, lat: g.lat, lng: g.lng, km, pts });
    } else results.push({ id, lat: null, lng: null, km: null, pts: 0 });
  }
  results.sort((a, b) => b.pts - a.pts);
  d.reveal = { place: placeOf(d.loc), results };
  d.history.push({ round: d.round, place: d.reveal.place, results });
  d.phase = 'reveal';
  d.t0 = Date.now();
  d.t1 = d.t0 + REVEAL_MS;
  api.setTimer('phase', REVEAL_MS, () => nextRound(room, api));
  api.touch();
  api.sync();
}

function finishGame(room, api) {
  const d = room.data;
  api.clearTimer('phase');
  d.phase = 'end';
  d.loc = null;
  d.reveal = null;
  d.t0 = d.t1 = 0;
  d.ranking = Object.entries(d.scores)
    .map(([id, pts]) => ({ id, name: room.players.get(id)?.name || '?', color: room.players.get(id)?.color || null, pts }))
    .sort((a, b) => b.pts - a.pts);
  api.end({ ranking: d.ranking, history: d.history, rounds: d.n, mode: d.mode, scope: d.scope });
}

/** Si más de la mitad de los jugadores conectados pidió otra ubicación a tiempo, la cambia y reinicia el reloj. */
function maybeSwap(room, api) {
  const d = room.data;
  if (!d || d.phase !== 'look' || d.swaps >= MAX_SWAPS || !d.spares.length) return;
  if (Date.now() - d.t0 > NOIMG_WINDOW_MS) return;
  const present = presentPlayers(room, api);
  const asked = present.filter((p) => d.noimg.has(p.id)).length;
  if (!present.length || asked * 2 <= present.length) return;
  // se prefiere un país que todavía no salió en la partida
  const used = new Set(d.picks.map((l) => l.cc));
  let i = d.spares.findIndex((l) => !used.has(l.cc));
  if (i < 0) i = 0;
  const [loc] = d.spares.splice(i, 1);
  d.picks[d.round - 1] = loc;
  d.loc = { ...loc, h: headingFor(loc, rnd) };
  d.swaps++;
  startClock(room, api);
  api.broadcast({ t: 'swap', round: d.round, n: d.swaps });
  api.touch();
  api.sync();
}

function guess(room, api, p, msg) {
  const d = room.data;
  if (!d || d.phase !== 'look' || !d.eligible.has(p.id) || d.guesses.has(p.id)) return false;
  const { lat, lng } = msg;
  if (!validCoord(lat, lng)) return false;
  d.guesses.set(p.id, { lat, lng });
  api.touch();
  if (allConfirmed(room, api)) {
    endLook(room, api);
    return true;
  }
  if (room.settings.rush && !d.rushed) {
    d.rushed = true;
    const at = Date.now() + RUSH_MS;
    if (at < d.t1) {
      d.t1 = at;
      api.setTimer('phase', RUSH_MS, () => endLook(room, api));
    }
  }
  api.sync();
  return true;
}

function noimg(room, api, p) {
  const d = room.data;
  if (!d || d.phase !== 'look' || !d.eligible.has(p.id)) return false;
  if (d.swaps >= MAX_SWAPS || !d.spares.length || Date.now() - d.t0 > NOIMG_WINDOW_MS || d.noimg.has(p.id)) return true; // se ignora
  d.noimg.add(p.id);
  api.touch();
  const before = d.swaps;
  maybeSwap(room, api);
  if (d.swaps === before) api.sync(); // se ve cuántos lo pidieron
  return true;
}

function next(room, api, p) {
  const d = room.data;
  if (!d || d.phase !== 'reveal' || room.host !== p.id) return false;
  api.clearTimer('phase');
  nextRound(room, api);
  return true;
}

// ---------------------------------------------------------------- módulo
export default {
  minPlayers: 2,
  maxPlayers: 10,
  lateJoin: true,
  listable: true,
  defaults: { mode: 'random', scope: 'mundo', rounds: 5, time: 90, frozen: 0, rush: 0, public: false },

  settings(cur, s) {
    const pick = (v, ok, d) => (ok.includes(v) ? v : d);
    const rounds = pick(num(s.rounds), ROUNDS, cur.rounds);
    const mode = pick(s.mode, ['random', 'famosos'], cur.mode);
    let scope = normScope(s.scope) || cur.scope;
    // sin al menos `rounds` lugares disponibles, el ámbito cae a 'mundo'
    if (scope !== 'mundo' && poolFor(mode, scope).length < rounds) scope = 'mundo';
    return {
      mode,
      scope,
      rounds,
      time: pick(num(s.time), TIMES, cur.time),
      frozen: flag(s.frozen, cur.frozen),
      rush: flag(s.rush, cur.rush),
      public: typeof s.public === 'boolean' ? s.public : cur.public,
    };
  },

  listInfo(room) {
    const st = room.settings;
    return { name: room.players.get(room.host)?.name || 'Trotamundos', mode: st.mode, scope: st.scope, rounds: st.rounds, round: room.data?.round || 0, time: st.time };
  },

  canStart(room) {
    if (!poolFor(room.settings.mode, room.settings.scope).length) return 'no_data';
    return [...room.players.values()].filter((p) => p.connected).length >= 2 ? null : 'need_players';
  },

  view(room) {
    const d = room.data;
    if (!d) return { tm: null };
    const st = room.settings;
    return {
      tm: {
        phase: d.phase,
        round: d.round,
        rounds: d.n,
        mode: d.mode,
        scope: d.scope,
        scale: d.scale,
        time: st.time,
        frozen: st.frozen,
        rush: st.rush,
        loc: d.loc ? { lat: d.loc.lat, lng: d.loc.lng, h: d.loc.h } : null,
        t0: d.t0,
        t1: d.t1,
        playing: d.phase === 'end' ? [] : [...d.eligible],
        done: d.phase === 'look' ? [...d.guesses.keys()] : [],
        noimg: d.phase === 'look' ? [...d.noimg] : [],
        swaps: d.swaps,
        swapsLeft: d.phase === 'look' ? Math.min(MAX_SWAPS - d.swaps, d.spares.length) : 0,
        scores: d.scores,
        reveal: d.phase === 'reveal' ? d.reveal : null,
        ranking: d.phase === 'end' ? d.ranking : null,
        history: d.phase === 'end' ? d.history : null,
      },
    };
  },

  start,

  message(room, api, p, msg) {
    switch (msg.t) {
      case 'guess':
        return guess(room, api, p, msg);
      case 'noimg':
        return noimg(room, api, p);
      case 'next':
        return next(room, api, p);
      default:
        return false;
    }
  },

  /** Mis mensajes fuera de la partida (lobby o terminada) son inválidos: suman falta en vez de perderse sin aviso. */
  command(room, api, p, msg) {
    if ((msg.t === 'guess' || msg.t === 'noimg' || msg.t === 'next') && (room.state !== 'playing' || !room.data)) return false;
    return undefined;
  },

  onJoin(room, api, pid) {
    const d = room.data;
    if (!d || room.state !== 'playing') return;
    if (d.scores[pid] === undefined) d.scores[pid] = 0; // mira esta ronda y juega desde la siguiente
  },

  onReconnect(room, api, pid) {
    const d = room.data;
    if (!d || room.state !== 'playing' || d.phase !== 'look') return;
    const g = d.guesses.get(pid);
    if (g) api.send(pid, { t: 'mine', round: d.round, lat: g.lat, lng: g.lng });
  },

  onDisconnect(room, api) {
    const d = room.data;
    if (!d || room.state !== 'playing' || d.phase !== 'look') return;
    if (allConfirmed(room, api)) endLook(room, api);
    else maybeSwap(room, api);
  },

  /** Se fue de la sala (o venció su tiempo de reconexión). */
  leave(room, api, pid) {
    const d = room.data;
    if (!d) return;
    delete d.scores[pid];
    d.eligible.delete(pid);
    d.guesses.delete(pid);
    d.noimg.delete(pid);
    if (d.reveal) d.reveal.results = d.reveal.results.filter((r) => r.id !== pid);
    for (const h of d.history) h.results = h.results.filter((r) => r.id !== pid);
    if (connected(api).length < 2) return finishGame(room, api);
    if (d.phase === 'look') {
      if (allConfirmed(room, api)) endLook(room, api);
      else maybeSwap(room, api);
    }
  },
};
