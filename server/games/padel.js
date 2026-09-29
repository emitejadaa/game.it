/**
 * La Cabra · Pádel online: el partido corre acá (public/games/padel/shared/engine.js, el mismo motor
 * que usa el navegador contra la compu) a 120 pasos por segundo.
 *
 * - En la sala cada persona elige equipo (A o B, hasta dos por equipo); los lugares vacíos los juega la
 *   compu: la pareja de una persona juega como pareja y un equipo sin personas juega como rival.
 * - Cada cliente manda su joystick y los botones ({ t: 'i', ax, ay, a }); 30 veces por segundo se manda
 *   el estado ({ t: 's' }) con los eventos del momento (sonidos, efectos y carteles) para que todos
 *   vean y escuchen lo mismo.
 * - Si alguien se corta, su jugador lo maneja la compu hasta que vuelve.
 *
 * Mensajes: i { ax, ay, a } · prefs { asistencia, golpeAuto, camiseta, pala, zurdo, posicion } ·
 * team { equipo } (en la sala) · again (anfitrión, otro partido con los mismos equipos).
 */
import { performance } from 'node:perf_hooks';
import { crearPartido, paramsHumano, paramsPareja, paramsRival, ARQUETIPOS, PASO } from '../../public/games/padel/shared/engine.js';

const TICK_MS = 1000 / 60;
const SNAP_EVERY = 2;
const ESCENAS = ['pabellon', 'exterior', 'club'];
const BOTS = ['Ríos', 'Paz', 'Luna', 'Sosa', 'Vega', 'Rey', 'Castro', 'Molina', 'Ortiz', 'Soler', 'Varela', 'Bravo'];
const TIROS = ['saque', 'drive', 'plano', 'volea', 'globo', 'remate', 'vibora', 'bandeja', 'dejada', 'chiquita'];
const COLORES = /^#[0-9a-fA-F]{6}$/;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const r2 = (v) => Math.round(v * 100) / 100;

function lobby(room) {
  return (room.pl ||= { equipos: new Map(), prefs: new Map() });
}
function equipoDe(room, pid) {
  const lb = lobby(room);
  if (!lb.equipos.has(pid)) {
    const n = [0, 0];
    for (const [id, e] of lb.equipos) if (room.players.has(id)) n[e]++;
    lb.equipos.set(pid, n[0] <= n[1] ? 0 : 1);
  }
  return lb.equipos.get(pid);
}

function start(room, api) {
  const st = room.settings;
  const lb = lobby(room);
  const gente = api.players().filter((p) => p.connected);
  // hasta dos por equipo; si sobra alguien, al otro equipo
  const eq = [[], []];
  for (const p of gente) {
    let e = equipoDe(room, p.id);
    if (eq[e].length >= 2) e = 1 - e;
    if (eq[e].length >= 2) continue;
    eq[e].push(p);
    lb.equipos.set(p.id, e);
  }
  const slots = [null, null, null, null];
  for (const e of [0, 1]) {
    const base = e * 2;
    const lista = eq[e];
    // cada uno en su lado preferido; si los dos quieren el mismo, el segundo va al otro
    const quiere = (p) => (lb.prefs.get(p.id)?.posicion === 'drive' ? 1 : 0);
    const orden = lista.slice().sort((a, b) => quiere(a) - quiere(b));
    for (const p of orden) {
      let k = quiere(p);
      if (slots[base + k]) k = 1 - k;
      slots[base + k] = p;
    }
  }
  const escena = st.escena === 'azar' || !ESCENAS.includes(st.escena) ? pick(ESCENAS) : st.escena;
  const arq = [pick(ARQUETIPOS), pick(ARQUETIPOS)];
  const usados = new Set();
  const botNombre = () => {
    let n = pick(BOTS);
    while (usados.has(n)) n = pick(BOTS);
    usados.add(n);
    return n;
  };
  const jugadores = slots.map((p, i) => {
    const e = i < 2 ? 0 : 1;
    const carril = i % 2 ? 'der' : 'izq';
    if (p) {
      const pr = lb.prefs.get(p.id) || {};
      return { humano: true, carril, ...paramsHumano(st.dif, pr.asistencia !== false), asistencia: pr.asistencia !== false, golpeAuto: !!pr.golpeAuto, color: pr.camiseta || p.color, colorPala: pr.pala || '#0F1C22', zurdo: !!pr.zurdo, nombre: p.name };
    }
    const conGente = !!slots[e * 2] || !!slots[e * 2 + 1];
    return { humano: false, carril, ...(conGente ? paramsPareja() : paramsRival(st.dif, arq[e])), color: e ? (i % 2 ? '#FFB29E' : '#FF8A7A') : i % 2 ? '#9BE36B' : '#7FD3F7', colorPala: '#0F1C22', nombre: botNombre() };
  });
  const nombre = (j) => String(j.nombre || '').toUpperCase().slice(0, 10);
  const equipos = [`${nombre(jugadores[0])} / ${nombre(jugadores[1])}`, `${nombre(jugadores[2])} / ${nombre(jugadores[3])}`];
  lb.partidos = (lb.partidos || 0) + 1;
  const d = {
    id: lb.partidos,
    slots: slots.map((p, i) => ({ pid: p ? p.id : null, nombre: jugadores[i].nombre, color: jugadores[i].color, pala: jugadores[i].colorPala, zurdo: !!jugadores[i].zurdo })),
    escena: { tipo: escena, gente: 0.5 + Math.random() * 0.5, ciudad: pick(['Buenos Aires', 'Córdoba', 'Rosario', 'Montevideo', 'Madrid', 'Valencia']) },
    equipos,
    ev: [],
    ticks: 0,
    t0: performance.now(),
    fin: null,
    snapN: 0,
  };
  const push = (e) => d.ev.length < 200 && d.ev.push(e);
  d.m = crearPartido(
    { juegos: st.juegos, sets: st.sets, escena: d.escena, equipos, jugadores },
    {
      sonido: (tipo, dato) => push(['so', tipo, dato]),
      efecto: (tipo, ...a) => push(['fx', tipo, ...a.map((v) => (typeof v === 'number' ? r2(v) : v))]),
      aviso: (a) => push(['av', a]),
      ayuda: (id, k) => push(['ay', id, k]),
      fin: (res) => {
        d.fin = res;
      },
    },
  );
  // los que no están conectados (entraron y se cortaron) arrancan manejados por la compu
  slots.forEach((p, i) => p && !p.connected && d.m.ponerIA(i, true));
  room.data = d;
  api.setTimer('loop', TICK_MS, () => loop(room, api));
}

function loop(room, api) {
  const d = room.data;
  if (!d || room.state !== 'playing') return;
  const now = performance.now();
  let due = Math.floor((now - d.t0) / TICK_MS) - d.ticks;
  if (due > 10) {
    // el servidor se trabó: no se intenta recuperar todo de golpe
    d.t0 += (due - 10) * TICK_MS;
    due = 10;
  }
  for (let i = 0; i < due && !d.fin; i++) {
    d.m.actualizar(PASO);
    d.m.actualizar(PASO);
    d.ticks++;
    if (d.ticks % SNAP_EVERY === 0) snapshot(room, api);
  }
  if (d.fin) {
    snapshot(room, api);
    api.end({ res: { ...d.fin, equipos: d.equipos } });
    return;
  }
  const next = d.t0 + (d.ticks + 1) * TICK_MS - performance.now();
  api.setTimer('loop', Math.max(1, next), () => loop(room, api));
}

function snapshot(room, api) {
  const d = room.data;
  const P = d.m.P;
  const b = P.bola;
  let cae = 0;
  if (P.estado === 'juego' && b.golpeo !== null) {
    const s = P.prediccion.find((q) => q.botes >= 1 && q.t > P.t - P.tGolpe);
    if (s) cae = [r2(s.x), r2(s.y)];
  }
  const h = {};
  P.jug.forEach((j) => {
    if (!j.humano) return;
    h[j.id] = { al: d.m.alcanzable(j) ? 1 : 0, sg: j.sug || 0, ap: j.apunte ? [j.apunte.tx == null ? null : r2(j.apunte.tx), j.apunte.prof] : 0 };
  });
  d.snapN++;
  const msg = {
    t: 's',
    tt: r2(P.t),
    e: P.estado,
    b: [r2(b.x), r2(b.y), r2(b.z), b.porTres ? 1 : 0],
    c: cae,
    j: P.jug.map((j) => [r2(j.x), r2(j.y), r2(j.vx), r2(j.vy), r2(j.anim), r2(j.swing), TIROS.indexOf(j.ultimoTiro)]),
    h,
    f: r2(P.fiesta),
    g: P.ultimoGanador,
    m: { p: P.puntos, j: P.juegos, sg: P.setsG, ms: P.marcadorSets, tb: P.tb ? 1 : 0, sa: P.sacaAhora, sn: P.saqueN, sgn: P.setsGanar, ...(d.snapN % 15 === 1 ? { eq: d.equipos } : {}) },
    ev: d.ev,
  };
  d.ev = [];
  api.broadcast(msg);
}

const slotDe = (room, pid) => room.data?.slots.findIndex((s) => s.pid === pid) ?? -1;

export default {
  minPlayers: 2,
  maxPlayers: 4,
  defaults: { escena: 'azar', dif: 'normal', juegos: 3, sets: 1 },

  settings(cur, s) {
    const pick2 = (v, ok, d) => (ok.includes(v) ? v : d);
    return {
      escena: pick2(s.escena, ['azar', ...ESCENAS], cur.escena),
      dif: pick2(s.dif, ['facil', 'normal', 'dificil'], cur.dif),
      juegos: pick2(Number(s.juegos), [3, 4, 6], cur.juegos),
      sets: pick2(Number(s.sets), [1, 3], cur.sets),
    };
  },

  canStart(room) {
    return [...room.players.values()].filter((p) => p.connected).length >= 2 ? null : 'need_players';
  },

  view(room) {
    const lb = lobby(room);
    for (const p of room.players.values()) equipoDe(room, p.id);
    const d = room.data;
    return {
      padelLobby: { equipos: Object.fromEntries([...lb.equipos].filter(([id]) => room.players.has(id))) },
      padel: d ? { id: d.id, slots: d.slots, escena: d.escena, equipos: d.equipos } : null,
    };
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    if (!d || msg.t !== 'i') return msg.t === 'i';
    const i = slotDe(room, p.id);
    if (i < 0) return true;
    d.m.entrada(i, { ax: msg.ax, ay: msg.ay, accion: typeof msg.a === 'string' ? msg.a : null });
    return true;
  },

  command(room, api, p, msg) {
    const lb = lobby(room);
    if (msg.t === 'team') {
      if (room.state !== 'lobby') return true;
      const e = Number(msg.equipo);
      if (e !== 0 && e !== 1) return false;
      const n = [...lb.equipos].filter(([id, x]) => x === e && id !== p.id && room.players.has(id)).length;
      if (n >= 2) return true;
      lb.equipos.set(p.id, e);
      api.sync();
      return true;
    }
    if (msg.t === 'prefs') {
      const pr = {
        asistencia: msg.asistencia !== false,
        golpeAuto: !!msg.golpeAuto,
        camiseta: COLORES.test(msg.camiseta) ? msg.camiseta : null,
        pala: COLORES.test(msg.pala) ? msg.pala : null,
        zurdo: !!msg.zurdo,
        posicion: msg.posicion === 'drive' ? 'drive' : 'reves',
      };
      lb.prefs.set(p.id, pr);
      const i = slotDe(room, p.id);
      if (i >= 0 && room.data) Object.assign(room.data.m.P.jug[i], { asistencia: pr.asistencia, golpeAuto: pr.golpeAuto });
      return true;
    }
    if (msg.t === 'again') {
      if (room.state !== 'finished' || room.host !== p.id) return true;
      if ([...room.players.values()].filter((x) => x.connected).length < 2) return true;
      room.state = 'playing';
      start(room, api);
      api.sync();
      return true;
    }
    return undefined;
  },

  onJoin(room, api, pid) {
    equipoDe(room, pid);
  },

  onReconnect(room, api, pid) {
    const i = slotDe(room, pid);
    if (i >= 0 && room.state === 'playing') room.data.m.ponerIA(i, false);
  },

  onDisconnect(room, api, pid) {
    const i = slotDe(room, pid);
    if (i >= 0 && room.state === 'playing') room.data.m.ponerIA(i, true);
  },

  leave(room, api, pid) {
    lobby(room).equipos.delete(pid);
    const i = slotDe(room, pid);
    if (i >= 0 && room.data) {
      room.data.m.ponerIA(i, true);
      room.data.slots[i].pid = null;
    }
  },

  removed(room, api, pid) {
    lobby(room).equipos.delete(pid);
  },
};
