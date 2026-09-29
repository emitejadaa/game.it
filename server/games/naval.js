/**
 * Batalla Naval online (1 contra 1). La partida (public/games/naval/shared/rules.js) corre en el servidor:
 * cada jugador le manda su flota, pero la del otro nunca sale del servidor hasta que termina (solo se
 * publican las marcas de los mares y los barcos ya hundidos). Turnos con tiempo: si se acaba, se juega
 * un tiro al azar por el que no disparó (y si todavía estaba ubicando, su flota queda al azar).
 *
 * Mensajes: flota { barcos } · a { k, x, y, v, celdas } · rendirse · again (anfitrión, otra partida) ·
 * react { e }. El servidor manda: flota { id, barcos } (solo a su dueño), r { id, …resultado }, end y react.
 */
import { crearPartida, normalizar, alAzar, DEFAULTS, MARES } from '../../public/games/naval/shared/rules.js';

const COLOCAR_MS = 90e3;
const ANIM_MS = 1600; // lo que tarda el cliente en mostrar un tiro: se suma al tiempo del turno
const AUSENTE_MS = 8e3; // turno de alguien desconectado
const TIEMPOS = [20, 30, 60];
let partidas = 0;

const idx = (room, pid) => room.data?.orden.indexOf(pid) ?? -1;
const entero = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : null);

function start(room, api) {
  const ids = api
    .players()
    .filter((p) => p.connected)
    .slice(0, 2)
    .map((p) => p.id);
  const prev = room.data;
  const d = {
    id: ++partidas,
    orden: ids,
    p: crearPartida(room.settings),
    fin: 0,
    res: null,
    react: new Map(),
  };
  // la primera partida arranca uno al azar; después, alternan
  const antes = prev ? ids.indexOf(prev.orden[prev.primero]) : -1;
  d.primero = antes >= 0 ? 1 - antes : Math.floor(Math.random() * 2);
  room.data = d;
  plazo(room, api, COLOCAR_MS, () => {
    for (const i of [0, 1]) if (!d.p.listo(i)) colocar(room, api, i, alAzar(d.p.o));
  });
}

function plazo(room, api, ms, fn) {
  const d = room.data;
  d.fin = Date.now() + ms;
  api.setTimer('turno', ms, () => {
    if (room.data !== d) return;
    fn();
    api.touch();
  });
}

function colocar(room, api, i, barcos) {
  const d = room.data;
  if (!d.p.colocar(i, barcos)) return false;
  api.send(d.orden[i], { t: 'flota', id: d.id, barcos: d.p.flotaDe(i) });
  if (d.p.listo(0) && d.p.listo(1)) {
    d.p.empezar(d.primero);
    turno(room, api, true);
  }
  api.sync();
  return true;
}

/** Arranca el reloj del que tiene el turno. */
function turno(room, api, primero) {
  const d = room.data;
  const pid = d.orden[d.p.P.turno];
  const ms = (api.connected(pid) ? room.settings.tiempo * 1000 : AUSENTE_MS) + (primero ? 2500 : ANIM_MS);
  plazo(room, api, ms, () => {
    if (d.p.P.fase !== 'batalla') return;
    jugar(room, api, d.p.P.turno, d.p.jugadaAlAzar(), true);
  });
}

function jugar(room, api, i, a, alAzarPorTiempo = false) {
  const d = room.data;
  const r = d.p.accion(i, a);
  if (!r) return false;
  api.touch();
  api.broadcast({ t: 'r', id: d.id, ...r, ...(alAzarPorTiempo ? { tiempo: 1 } : {}) });
  if (d.p.P.fase === 'fin') terminar(room, api, d.p.P.ganador);
  else {
    turno(room, api, false);
    api.sync();
  }
  return true;
}

function terminar(room, api, ganador, motivo) {
  const d = room.data;
  api.clearTimer('turno');
  d.fin = 0;
  const v = d.p.vista();
  d.res = {
    ganador: d.orden[ganador],
    motivo,
    flotas: [d.p.flotaDe(0), d.p.flotaDe(1)],
    stats: v.J.map((j) => j.stats),
  };
  api.end(d.res);
}

/** Valida y limpia la jugada que manda el cliente (la partida vuelve a validar las reglas). */
function jugada(msg, N) {
  const k = msg.k;
  if (k === 'salva') {
    if (!Array.isArray(msg.celdas) || msg.celdas.length > 12) return null;
    const celdas = [];
    for (const c of msg.celdas) {
      if (!Array.isArray(c)) return null;
      const x = entero(c[0], N);
      const y = entero(c[1], N);
      if (x === null || y === null) return null;
      celdas.push([x, y]);
    }
    return { k, celdas };
  }
  if (!['tiro', 'sonar', 'bomba', 'torpedo'].includes(k)) return null;
  const x = entero(msg.x, N);
  const y = entero(msg.y, N);
  if (x === null || y === null) return null;
  return { k, x, y, v: msg.v ? 1 : 0 };
}

export default {
  minPlayers: 2,
  maxPlayers: 2,
  defaults: { ...DEFAULTS, tiempo: 30 },

  settings(cur, s) {
    const o = normalizar({ ...cur, ...s });
    return { ...o, tiempo: TIEMPOS.includes(Number(s.tiempo)) ? Number(s.tiempo) : cur.tiempo };
  },

  view(room) {
    const d = room.data;
    if (!d) return { naval: null };
    return {
      naval: {
        id: d.id,
        orden: d.orden,
        vista: d.p.vista(),
        restante: d.fin ? Math.max(0, d.fin - Date.now()) : 0,
        res: room.state === 'finished' ? d.res : null,
      },
    };
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    const i = idx(room, p.id);
    if (!d || i < 0) return false;
    if (msg.t === 'flota') {
      if (d.p.P.fase !== 'colocar' || d.p.listo(i)) return true;
      const barcos = Array.isArray(msg.barcos) ? msg.barcos.slice(0, 8).map((b) => ({ x: b?.x, y: b?.y, v: b?.v ? 1 : 0 })) : null;
      if (!barcos || !colocar(room, api, i, barcos)) api.send(p.id, { t: 'error', code: 'bad_fleet' });
      return true;
    }
    if (msg.t === 'a') {
      if (d.p.P.fase !== 'batalla' || d.p.P.turno !== i) return api.send(p.id, { t: 'error', code: 'not_your_turn' });
      const a = jugada(msg, MARES[d.p.o.mar]);
      if (!a || !jugar(room, api, i, a)) api.send(p.id, { t: 'error', code: 'bad_move' });
      return true;
    }
    if (msg.t === 'rendirse') {
      if (d.p.rendirse(i)) terminar(room, api, 1 - i, 'rendido');
      return true;
    }
    return false;
  },

  command(room, api, p, msg) {
    if (msg.t === 'again') {
      if (room.state !== 'finished' || room.host !== p.id) return true;
      if (api.players().filter((x) => x.connected).length < 2) return true;
      room.state = 'playing';
      start(room, api);
      api.sync();
      return true;
    }
    if (msg.t === 'react') {
      const d = room.data;
      const e = entero(msg.e, 6);
      if (!d || e === null || idx(room, p.id) < 0) return true;
      const ahora = Date.now();
      if (ahora - (d.react.get(p.id) || 0) < 900) return true;
      d.react.set(p.id, ahora);
      api.broadcast({ t: 'react', pid: p.id, e });
      return true;
    }
    return undefined;
  },

  onReconnect(room, api, pid) {
    const d = room.data;
    const i = idx(room, pid);
    if (!d || i < 0) return;
    const barcos = d.p.flotaDe(i);
    if (barcos) api.send(pid, { t: 'flota', id: d.id, barcos });
    // si era su turno mientras no estaba, el reloj vuelve a ser el normal
    if (room.state === 'playing' && d.p.P.fase === 'batalla' && d.p.P.turno === i) turno(room, api, false);
  },

  onDisconnect(room, api, pid) {
    const d = room.data;
    const i = idx(room, pid);
    if (!d || i < 0 || room.state !== 'playing') return;
    if (d.p.P.fase === 'batalla' && d.p.P.turno === i && d.fin - Date.now() > AUSENTE_MS) turno(room, api, false);
  },

  leave(room, api, id) {
    const d = room.data;
    const i = idx(room, id);
    if (!d || i < 0 || d.p.P.fase === 'fin') return;
    d.p.rendirse(i);
    terminar(room, api, 1 - i, 'abandono');
  },
};
