/**
 * Batalla Naval — la compu. Solo mira lo que vería una persona: las marcas del mar rival, los barcos ya
 * hundidos y las reglas. Tres niveles:
 *   facil   tiros al azar y, a veces, sigue un tocado;
 *   normal  caza en damero y, al tocar, sigue la línea hasta hundir;
 *   dificil mapa de probabilidad (todas las posiciones posibles de los barcos que quedan, con mucho más peso
 *           a las que pasan por tocados) y usa las armas especiales cuando convienen.
 */
import { FLOTAS, MARES, largo, normalizar, celdasDe } from './rules.js';

const libre = (m) => m === '.' || m === 'c';

/** Tocados que todavía no son de un barco hundido (y los contactos del sonar). */
function abiertos(N, marcas, hundidos) {
  const hund = new Set();
  for (const b of hundidos) for (const i of celdasDe(b, b.len, N)) hund.add(i);
  const out = [];
  for (let i = 0; i < N * N; i++) if ((marcas[i] === 't' && !hund.has(i)) || marcas[i] === 'c') out.push(i);
  return { abiertos: out, hund };
}

/** Largo de los barcos que quedan a flote (se sabe por los hundidos). */
function quedan(o, hundidos) {
  const q = FLOTAS[o.mar].map(largo);
  for (const b of hundidos) {
    const k = q.indexOf(b.len);
    if (k >= 0) q.splice(k, 1);
  }
  return q;
}

/** Cuántas posiciones posibles de los barcos que quedan pasan por cada celda. */
export function densidad(o, marcas, hundidos) {
  const N = MARES[o.mar];
  const { hund } = abiertos(N, marcas, hundidos);
  const d = new Float64Array(N * N);
  for (const len of quedan(o, hundidos))
    for (let v = 0; v < 2; v++)
      for (let y = 0; y < (v ? N - len + 1 : N); y++)
        for (let x = 0; x < (v ? N : N - len + 1); x++) {
          let peso = 1;
          let ok = true;
          for (let k = 0; k < len; k++) {
            const i = (y + (v ? k : 0)) * N + x + (v ? 0 : k);
            const m = marcas[i];
            if (m === 'a' || m === 'x' || hund.has(i)) {
              ok = false;
              break;
            }
            if (m === 't' || m === 'c') peso *= 40;
          }
          if (!ok) continue;
          for (let k = 0; k < len; k++) {
            const i = (y + (v ? k : 0)) * N + x + (v ? 0 : k);
            if (libre(marcas[i])) d[i] += peso;
          }
        }
  return d;
}

function mejor(d, marcas, rng, filtro) {
  let top = -1;
  let cand = [];
  for (let i = 0; i < d.length; i++) {
    if (!libre(marcas[i]) || (filtro && !filtro(i))) continue;
    if (d[i] > top + 1e-9) {
      top = d[i];
      cand = [i];
    } else if (Math.abs(d[i] - top) <= 1e-9) cand.push(i);
  }
  return cand.length ? cand[Math.floor(rng() * cand.length)] : -1;
}

/** Nivel normal: sigue la línea de los tocados o prueba los vecinos. */
function seguirLinea(N, marcas, abiertosL, rng) {
  const set = new Set(abiertosL);
  const cand = [];
  for (const i of abiertosL) {
    const x = i % N;
    const y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const tieneVecino = (x + dx < N && set.has(i + dx + dy * N)) || (x - dx >= 0 && y - dy >= 0 && set.has(i - dx - dy * N));
      if (!tieneVecino) continue;
      // extremos de la línea en esa dirección
      for (const s of [1, -1]) {
        let a = x;
        let b = y;
        while (a >= 0 && b >= 0 && a < N && b < N && set.has(b * N + a)) {
          a += dx * s;
          b += dy * s;
        }
        if (a >= 0 && b >= 0 && a < N && b < N && libre(marcas[b * N + a])) cand.push(b * N + a);
      }
    }
  }
  if (cand.length) return cand[Math.floor(rng() * cand.length)];
  const vec = [];
  for (const i of abiertosL) {
    const x = i % N;
    const y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx;
      const b = y + dy;
      if (a >= 0 && b >= 0 && a < N && b < N && libre(marcas[b * N + a])) vec.push(b * N + a);
    }
  }
  return vec.length ? vec[Math.floor(rng() * vec.length)] : -1;
}

/** Centro de 3×3 (o fila/columna) que más probabilidad junta. */
function mejorZona(N, d, marcas, radio) {
  let top = -1;
  let best = null;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = -radio; dy <= radio; dy++)
        for (let dx = -radio; dx <= radio; dx++) {
          const a = x + dx;
          const b = y + dy;
          if (a >= 0 && b >= 0 && a < N && b < N && marcas[b * N + a] === '.') s += d[b * N + a];
        }
      if (s > top) {
        top = s;
        best = { x, y };
      }
    }
  return best;
}
function mejorLinea(N, d, marcas) {
  let top = -1;
  let best = null;
  for (let v = 0; v < 2; v++)
    for (let k = 0; k < N; k++) {
      // probabilidad de que el torpedo encuentre algo: suma de la densidad normalizada (tope 1)
      let s = 0;
      for (let q = 0; q < N; q++) {
        const i = v ? q * N + k : k * N + q;
        if (marcas[i] === '.') s += d[i];
      }
      if (s > top) {
        top = s;
        best = { x: v ? k : 0, y: v ? 0 : k, v };
      }
    }
  return best;
}

/**
 * Elige la jugada de `yo` con la vista pública de la partida.
 * @returns {{k:string, x?:number, y?:number, v?:number, celdas?:number[][]}}
 */
export function elegir(vista, yo, dif, opts, rng = Math.random) {
  const o = normalizar(opts);
  const N = MARES[o.mar];
  const riv = vista.J[1 - yo];
  const marcas = riv.marcas;
  const { abiertos: ab } = abiertos(N, marcas, riv.hundidos);
  const armas = vista.J[yo].armas;
  const st = vista.J[yo].stats;
  const d = densidad(o, marcas, riv.hundidos);
  const xy = (i) => ({ x: i % N, y: (i / N) | 0 });
  const libres = [];
  for (let i = 0; i < N * N; i++) if (libre(marcas[i])) libres.push(i);
  const azar = () => libres[Math.floor(rng() * libres.length)];

  if (o.modo === 'salva') {
    const n = Math.min(vista.tiros, libres.length);
    const ruido = dif === 'facil' ? 6 : dif === 'normal' ? 0.6 : 0.02;
    const puntaje = new Map(libres.map((i) => [i, d[i] * (1 + rng() * ruido)]));
    const orden = [...libres].sort((a, b) => puntaje.get(b) - puntaje.get(a));
    // la compu fácil tira dos tercios de la salva al azar
    if (dif === 'facil') for (let k = Math.ceil(n / 3); k < n; k++) {
      const j = k + Math.floor(rng() * (orden.length - k));
      [orden[k], orden[j]] = [orden[j], orden[k]];
    }
    return { k: 'salva', celdas: orden.slice(0, n).map((i) => [i % N, (i / N) | 0]) };
  }

  // ---------------- armas especiales
  const hayArmas = armas.sonar || armas.bomba || armas.torpedo;
  if (hayArmas) {
    const chance = dif === 'facil' ? 0.08 : dif === 'normal' ? 0.3 : 1;
    const aislado = ab.length === 1 && marcas[ab[0]] === 't';
    if (armas.bomba && aislado && rng() < chance) {
      const c = xy(ab[0]);
      const libresCerca = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => c.x + dx >= 0 && c.y + dy >= 0 && c.x + dx < N && c.y + dy < N && libre(marcas[(c.y + dy) * N + c.x + dx])).length;
      if (libresCerca >= 3) return { k: 'bomba', ...c };
    }
    if (!ab.length) {
      if (armas.sonar && st.disparos >= (dif === 'dificil' ? 5 : 9) && rng() < chance) {
        const z = dif === 'facil' ? xy(azar()) : mejorZona(N, d, marcas, 1);
        if (z) return { k: 'sonar', ...z };
      }
      if (armas.torpedo && st.disparos >= (dif === 'dificil' ? 10 : 14) && rng() < chance) {
        const l = dif === 'facil' ? { x: Math.floor(rng() * N), y: Math.floor(rng() * N), v: rng() < 0.5 ? 1 : 0 } : mejorLinea(N, d, marcas);
        if (l) return { k: 'torpedo', ...l };
      }
      if (armas.bomba && dif === 'facil' && rng() < 0.05) return { k: 'bomba', ...xy(azar()) };
    }
  }

  // ---------------- tiro común
  let i = -1;
  const contactos = ab.filter((c) => marcas[c] === 'c');
  if (dif === 'facil') {
    if (ab.length && rng() < 0.55) i = seguirLinea(N, marcas, ab, rng);
    if (i < 0) i = azar();
  } else if (dif === 'normal') {
    if (contactos.length) i = contactos[Math.floor(rng() * contactos.length)];
    else if (ab.length) i = seguirLinea(N, marcas, ab, rng);
    if (i < 0) {
      const minLen = Math.min(...quedan(o, riv.hundidos));
      const par = (c) => ((c % N) + ((c / N) | 0)) % minLen === 0;
      const pares = libres.filter(par);
      const pool = pares.length ? pares : libres;
      i = pool[Math.floor(rng() * pool.length)];
    }
  } else {
    if (contactos.length) i = mejor(d, marcas, rng, (c) => marcas[c] === 'c');
    else if (ab.length) i = mejor(d, marcas, rng);
    else {
      // cazando: la mejor celda del damero (con el barco más chico que queda)
      const minLen = Math.min(...quedan(o, riv.hundidos));
      i = mejor(d, marcas, rng, (c) => ((c % N) + ((c / N) | 0)) % minLen === 0);
      if (i < 0) i = mejor(d, marcas, rng);
    }
  }
  if (i < 0) i = azar();
  return { k: 'tiro', ...xy(i) };
}
