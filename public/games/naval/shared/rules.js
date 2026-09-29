/**
 * Batalla Naval — reglas compartidas por el navegador (contra la compu) y el servidor (online).
 *
 * Cada jugador tiene un mar de N×N con su flota. Las marcas de cada mar las ven los dos:
 *   '.' sin tocar · 'a' agua (tiro errado) · 't' tocado · 'x' agua sabida sin tirar (alrededor de un hundido,
 *   el paso de un torpedo o el sonar) · 'c' contacto del sonar (hay barco, todavía sin tocar).
 * Lo que nadie ve del otro son sus barcos a flote: eso queda en la partida (y en el servidor).
 *
 * Barco colocado: { x, y, v } (v = 1 vertical), en el orden de FLOTAS[mar].
 */

export const MARES = { chico: 8, clasico: 10, grande: 12 };

export const BARCOS = {
  porta: { n: 5, nom: { es: 'Portaaviones', en: 'Carrier' } },
  acor: { n: 4, nom: { es: 'Acorazado', en: 'Battleship' } },
  frag: { n: 4, nom: { es: 'Fragata', en: 'Frigate' } },
  cruc: { n: 3, nom: { es: 'Crucero', en: 'Cruiser' } },
  sub: { n: 3, nom: { es: 'Submarino', en: 'Submarine' } },
  dest: { n: 2, nom: { es: 'Destructor', en: 'Destroyer' } },
  lancha: { n: 2, nom: { es: 'Lancha', en: 'Patrol boat' } },
};

export const FLOTAS = {
  chico: ['acor', 'cruc', 'sub', 'dest'],
  clasico: ['porta', 'acor', 'cruc', 'sub', 'dest'],
  grande: ['porta', 'acor', 'frag', 'cruc', 'sub', 'dest', 'lancha'],
};

export const ARMAS = ['sonar', 'bomba', 'torpedo'];

/** mar: chico/clasico/grande · modo: clasico/salva · extra: tiro extra al acertar · armas: sonar, bomba y
 *  torpedo (una vez cada una, solo en modo clásico) · tocar: los barcos se pueden tocar. */
export const DEFAULTS = { mar: 'clasico', modo: 'clasico', extra: 1, armas: 1, tocar: 0 };

export function normalizar(o = {}) {
  const b = (v, d) => (v === 0 || v === 1 || v === true || v === false ? Number(v) : d);
  return {
    mar: Object.hasOwn(MARES, o.mar) ? o.mar : DEFAULTS.mar,
    modo: o.modo === 'salva' ? 'salva' : 'clasico',
    extra: b(o.extra, DEFAULTS.extra),
    armas: b(o.armas, DEFAULTS.armas),
    tocar: b(o.tocar, DEFAULTS.tocar),
  };
}

export const largo = (id) => BARCOS[id].n;

/** Índices de las celdas de un barco (o null si se sale del mar). */
export function celdasDe(b, len, N) {
  const out = [];
  for (let k = 0; k < len; k++) {
    const x = b.x + (b.v ? 0 : k);
    const y = b.y + (b.v ? k : 0);
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
    out.push(y * N + x);
  }
  return out;
}

/** Vecinos (8 direcciones) de una celda. */
export function vecinos8(i, N) {
  const x = i % N;
  const y = (i / N) | 0;
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const a = x + dx;
      const c = y + dy;
      if (a >= 0 && c >= 0 && a < N && c < N) out.push(c * N + a);
    }
  return out;
}

/** Mapa de ocupación (-1 o índice del barco) o null si la flota no es válida. */
export function ocupacion(lista, opts) {
  const o = normalizar(opts);
  const N = MARES[o.mar];
  const flota = FLOTAS[o.mar];
  if (!Array.isArray(lista) || lista.length !== flota.length) return null;
  const oc = new Int8Array(N * N).fill(-1);
  for (let k = 0; k < flota.length; k++) {
    const b = lista[k];
    if (!b || !Number.isInteger(b.x) || !Number.isInteger(b.y) || (b.v !== 0 && b.v !== 1)) return null;
    const cs = celdasDe(b, largo(flota[k]), N);
    if (!cs) return null;
    for (const i of cs) if (oc[i] >= 0) return null;
    if (!o.tocar) for (const i of cs) for (const j of vecinos8(i, N)) if (oc[j] >= 0 && oc[j] !== k) return null;
    for (const i of cs) oc[i] = k;
  }
  return oc;
}

export const validar = (lista, opts) => !!ocupacion(lista, opts);

/** Si un barco puede ir en (x, y, v) con los demás barcos de la lista (ignora el de índice `yo`). */
export function cabe(lista, yo, b, opts) {
  const o = normalizar(opts);
  const N = MARES[o.mar];
  const flota = FLOTAS[o.mar];
  const cs = celdasDe(b, largo(flota[yo]), N);
  if (!cs) return false;
  const propias = new Set(cs);
  for (let k = 0; k < lista.length; k++) {
    if (k === yo || !lista[k]) continue;
    const otras = celdasDe(lista[k], largo(flota[k]), N);
    for (const i of otras) {
      if (propias.has(i)) return false;
      if (!o.tocar) for (const j of vecinos8(i, N)) if (propias.has(j)) return false;
    }
  }
  return true;
}

/** Flota al azar válida. Con `rng` propio se puede repetir (servidor y pruebas). */
export function alAzar(opts, rng = Math.random) {
  const o = normalizar(opts);
  const N = MARES[o.mar];
  const flota = FLOTAS[o.mar];
  for (let intento = 0; intento < 400; intento++) {
    const lista = [];
    let ok = true;
    // de mayor a menor: los grandes primero
    const orden = flota.map((id, k) => k).sort((a, b) => largo(flota[b]) - largo(flota[a]));
    for (const k of orden) {
      let puesto = false;
      for (let t = 0; t < 200 && !puesto; t++) {
        const v = rng() < 0.5 ? 1 : 0;
        const len = largo(flota[k]);
        const b = { x: Math.floor(rng() * (v ? N : N - len + 1)), y: Math.floor(rng() * (v ? N - len + 1 : N)), v };
        if (cabe(lista, k, b, o)) {
          lista[k] = b;
          puesto = true;
        }
      }
      if (!puesto) {
        ok = false;
        break;
      }
    }
    if (ok) return lista;
  }
  throw new Error('no entra la flota');
}

/**
 * Una partida entre los jugadores 0 y 1. `accion` devuelve lo que pasó (para animarlo) o null si no vale.
 *   { k: 'tiro', x, y } · { k: 'salva', celdas: [[x, y], …] } · { k: 'sonar' | 'bomba', x, y } · { k: 'torpedo', x, y, v }
 * El torpedo sale del borde izquierdo por la fila y (v = 0) o del borde de arriba por la columna x (v = 1),
 * atraviesa el agua (que queda sabida) y explota en el primer barco sin tocar.
 */
export function crearPartida(opts) {
  const o = normalizar(opts);
  const N = MARES[o.mar];
  const flota = FLOTAS[o.mar];
  const conArmas = !!o.armas && o.modo === 'clasico';
  const J = [0, 1].map(() => ({
    barcos: null,
    oc: null,
    marcas: new Array(N * N).fill('.'),
    armas: { sonar: conArmas ? 1 : 0, bomba: conArmas ? 1 : 0, torpedo: conArmas ? 1 : 0 },
    stats: { disparos: 0, aciertos: 0, racha: 0, rachaMax: 0, hundidos: 0, turnos: 0 },
  }));
  const P = { o, N, flota, fase: 'colocar', turno: 0, ganador: -1, tiros: 1, J };

  const aFlote = (j) => (j.barcos ? j.barcos.filter((b) => !b.hundido).length : flota.length);
  const tirosDe = (i) => (o.modo === 'salva' ? aFlote(J[i]) : 1);
  const disparable = (j, i) => i >= 0 && i < N * N && (j.marcas[i] === '.' || j.marcas[i] === 'c');
  const enMar = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < N && y < N;

  function colocar(i, lista) {
    if (P.fase !== 'colocar' || J[i].barcos) return false;
    const oc = ocupacion(lista, o);
    if (!oc) return false;
    J[i].oc = oc;
    J[i].barcos = lista.map((b, k) => ({ id: flota[k], len: largo(flota[k]), x: b.x, y: b.y, v: b.v, golpes: 0, hundido: false }));
    return true;
  }
  const listo = (i) => !!J[i].barcos;

  function empezar(primero) {
    if (!listo(0) || !listo(1)) return false;
    P.fase = 'batalla';
    P.turno = primero ? 1 : 0;
    P.tiros = tirosDe(P.turno);
    J[P.turno].stats.turnos++;
    return true;
  }

  /** Tira a una celda del mar `t` (el del rival de `yo`) y anota lo que cambió. */
  function tirar(yo, t, i, res) {
    const j = J[t];
    if (!disparable(j, i)) return null;
    const st = J[yo].stats;
    st.disparos++;
    const k = j.oc[i];
    if (k < 0) {
      j.marcas[i] = 'a';
      res.celdas.push({ i, r: 'a' });
      st.racha = 0;
      return 'a';
    }
    j.marcas[i] = 't';
    res.celdas.push({ i, r: 't' });
    st.aciertos++;
    st.racha++;
    st.rachaMax = Math.max(st.rachaMax, st.racha);
    const b = j.barcos[k];
    b.golpes++;
    if (b.golpes >= b.len) {
      b.hundido = true;
      st.hundidos++;
      res.hundidos.push({ id: b.id, len: b.len, x: b.x, y: b.y, v: b.v });
      if (!o.tocar)
        for (const c of celdasDe(b, b.len, N))
          for (const n of vecinos8(c, N))
            if (j.marcas[n] === '.') {
              j.marcas[n] = 'x';
              res.celdas.push({ i: n, r: 'x', auto: 1 });
            }
      return 'h';
    }
    return 't';
  }

  function accion(yo, a) {
    if (P.fase !== 'batalla' || P.turno !== yo || !a) return null;
    const t = 1 - yo;
    const tj = J[t];
    const me = J[yo];
    const res = { por: yo, k: a.k, celdas: [], hundidos: [] };
    let acerto = false;
    if (a.k === 'tiro') {
      if (o.modo !== 'clasico' || !enMar(a.x, a.y) || !disparable(tj, a.y * N + a.x)) return null;
      res.x = a.x;
      res.y = a.y;
      acerto = tirar(yo, t, a.y * N + a.x, res) !== 'a';
    } else if (a.k === 'salva') {
      if (o.modo !== 'salva' || !Array.isArray(a.celdas)) return null;
      const libres = tj.marcas.reduce((n, m) => n + (m === '.' || m === 'c' ? 1 : 0), 0);
      const cuantos = Math.min(P.tiros, libres);
      const set = new Set();
      for (const c of a.celdas) {
        if (!Array.isArray(c) || !enMar(c[0], c[1])) return null;
        const i = c[1] * N + c[0];
        if (!disparable(tj, i)) return null;
        set.add(i);
      }
      if (set.size !== cuantos || a.celdas.length !== cuantos) return null;
      res.blancos = [...set];
      for (const i of set) tirar(yo, t, i, res);
    } else if (a.k === 'bomba' || a.k === 'sonar') {
      if (!me.armas[a.k] || !enMar(a.x, a.y)) return null;
      me.armas[a.k] = 0;
      res.x = a.x;
      res.y = a.y;
      if (a.k === 'bomba') {
        res.zona = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => enMar(a.x + dx, a.y + dy)).map(([dx, dy]) => (a.y + dy) * N + a.x + dx);
        for (const i of res.zona) tirar(yo, t, i, res);
      } else {
        res.zona = [];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!enMar(a.x + dx, a.y + dy)) continue;
            const i = (a.y + dy) * N + a.x + dx;
            res.zona.push(i);
            if (tj.marcas[i] !== '.') continue;
            const r = tj.oc[i] >= 0 ? 'c' : 'x';
            tj.marcas[i] = r;
            res.celdas.push({ i, r });
          }
      }
    } else if (a.k === 'torpedo') {
      const v = a.v ? 1 : 0;
      if (!me.armas.torpedo || !enMar(a.x, a.y)) return null;
      me.armas.torpedo = 0;
      res.v = v;
      res.x = v ? a.x : 0;
      res.y = v ? 0 : a.y;
      res.fin = -1;
      me.stats.disparos++;
      for (let s = 0; s < N; s++) {
        const i = v ? s * N + a.x : a.y * N + s;
        res.fin = i;
        if (tj.oc[i] >= 0 && tj.marcas[i] !== 't') {
          me.stats.disparos--; // el tiro que explota se cuenta en tirar()
          tirar(yo, t, i, res);
          res.explota = 1;
          break;
        }
        if (tj.marcas[i] === '.') {
          tj.marcas[i] = 'x';
          res.celdas.push({ i, r: 'x', paso: 1 });
        }
      }
      if (!res.explota) me.stats.racha = 0;
    } else return null;

    if (tj.barcos.every((b) => b.hundido)) {
      P.fase = 'fin';
      P.ganador = yo;
      res.ganador = yo;
      res.turno = yo;
      return res;
    }
    // sigue el mismo si acertó un tiro común y está el tiro extra; si no, cambia
    const sigue = a.k === 'tiro' && acerto && !!o.extra;
    if (!sigue) {
      P.turno = t;
      J[t].stats.turnos++;
    }
    P.tiros = tirosDe(P.turno);
    res.sigue = sigue ? 1 : 0;
    res.turno = P.turno;
    res.tiros = P.tiros;
    return res;
  }

  /** Una jugada al azar válida para quien tiene el turno (se acabó el tiempo). */
  function jugadaAlAzar(rng = Math.random) {
    const tj = J[1 - P.turno];
    const libres = [];
    for (let i = 0; i < N * N; i++) if (disparable(tj, i)) libres.push(i);
    const cs = libres.filter((i) => tj.marcas[i] === 'c');
    const pool = cs.length ? cs : libres;
    if (o.modo === 'salva') {
      const n = Math.min(P.tiros, libres.length);
      const elegidas = [...libres].sort(() => rng() - 0.5).slice(0, n);
      return { k: 'salva', celdas: elegidas.map((i) => [i % N, (i / N) | 0]) };
    }
    const i = pool[Math.floor(rng() * pool.length)];
    return { k: 'tiro', x: i % N, y: (i / N) | 0 };
  }

  function rendirse(i) {
    if (P.fase === 'fin') return false;
    P.fase = 'fin';
    P.ganador = 1 - i;
    return true;
  }

  /** Lo que pueden ver todos (sin los barcos a flote). */
  function vista() {
    return {
      fase: P.fase,
      turno: P.turno,
      ganador: P.ganador,
      tiros: P.tiros,
      J: J.map((j) => ({
        listo: !!j.barcos,
        marcas: j.marcas.join(''),
        hundidos: j.barcos ? j.barcos.filter((b) => b.hundido).map(({ id, len, x, y, v }) => ({ id, len, x, y, v })) : [],
        aFlote: aFlote(j),
        armas: { ...j.armas },
        stats: { ...j.stats },
      })),
    };
  }

  const flotaDe = (i) => (J[i].barcos ? J[i].barcos.map(({ x, y, v }) => ({ x, y, v })) : null);

  return { P, o, N, flota, colocar, listo, empezar, accion, jugadaAlAzar, rendirse, vista, flotaDe, disparable: (i, c) => disparable(J[i], c) };
}
