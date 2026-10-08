/* Trotamundos — datos: carga, filtros, elección de ubicaciones y opciones guardadas.
 *
 * API pública (la usan game.js y el cliente online):
 *   RONDAS, MIN_LUGARES, TIEMPOS, TIEMPO_DIARIO, MODOS            constantes
 *   cargarDatos({ base, intentos, espera, fetchFn })              → { famosos, mundo, meta }; lanza ErrorDatos (code: 'red' | 'formato' | 'vacio')
 *   lugaresEnAmbito(lista, ambito, meta, excluir?)                → ubicaciones del ámbito (sin las de `excluir`, un Set de ids)
 *   paisesDisponibles(mundo, meta, { min, excluir })              → [{ cc, n }] con al menos `min` lugares, de más a menos
 *   ambitoDisponible(datos, modo, ambito, excluir?)               → cantidad de lugares con los que se juega ese modo y ámbito
 *   limitesAmbito(lista, ambito, meta)                            → [[oeste, sur], [este, norte]] o null (mundo o ámbito que cruza el antimeridiano)
 *   new Sorteo({ lista, ambito, meta, malas, rng })               → .siguiente() ubicación nueva { …loc, h } (o null), .restantes, .descartar(id)
 *   partidaDiaria(datos, clave?)                                  → las 5 ubicaciones del desafío diario (iguales para todos ese día)
 *   leerOpciones() / guardarOpciones(o)                           → últimas opciones elegidas (localStorage gameit:trotamundos:opts)
 *   leerMalas() / marcarMala(id)                                  → ubicaciones marcadas como "no carga" (gameit:trotamundos:bad, con tope)
 *
 * Sin DOM: se puede importar desde Node (los tests de tools/tests/trotamundos/cliente.test.mjs lo hacen).
 */
import { inScope, pickLocations, headingFor, dailyRounds, dailyKey, validCoord, ROUNDS_DAILY } from './shared/geo.js';

export const RONDAS = 5;
export const MIN_LUGARES = RONDAS; // con menos lugares que rondas, un ámbito no se puede jugar sin repetir
export const TIEMPOS = [0, 30, 60, 90, 120, 180]; // segundos por ronda (0 = sin límite)
export const TIEMPO_DIARIO = 120;
export const MODOS = ['famosos', 'azar', 'pais', 'diario'];
export const MAX_MALAS = 300;

const PREFIJO = 'gameit:trotamundos:';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Error de carga de datos: `code` dice qué pasó y `archivo` cuál fue. */
export class ErrorDatos extends Error {
  constructor(code, archivo, causa) {
    super(`${code}: ${archivo}${causa ? ` (${causa.message || causa})` : ''}`);
    this.name = 'ErrorDatos';
    this.code = code;
    this.archivo = archivo;
  }
}

// ---------------------------------------------------------------- carga
async function pedirJson(url, { intentos, espera, fetchFn }) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetchFn(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      ultimo = e;
      if (i < intentos - 1) await pausa(espera * (i + 1));
    }
  }
  throw new ErrorDatos('red', url, ultimo);
}

const texto = (v) => typeof v === 'string' && v.length > 0;

function limpiarFamosos(arr) {
  if (!Array.isArray(arr)) throw new ErrorDatos('formato', 'famosos.json');
  return arr
    .filter((l) => l && texto(l.id) && validCoord(l.lat, l.lng) && texto(l.cc) && l.n && (texto(l.n.es) || texto(l.n.en)))
    .map((l) => ({ ...l, n: { es: l.n.es || l.n.en, en: l.n.en || l.n.es } }));
}

function limpiarMundo(arr) {
  if (!Array.isArray(arr)) throw new ErrorDatos('formato', 'mundo.json');
  return arr.filter((l) => l && texto(l.id) && validCoord(l.lat, l.lng) && texto(l.cc));
}

/**
 * Carga los tres archivos de datos/ (rutas relativas al juego) con reintentos.
 * Si falta algo esencial lanza ErrorDatos para que la pantalla muestre un mensaje claro con "Reintentar".
 */
export async function cargarDatos({ base = './datos/', intentos = 3, espera = 600, fetchFn = (u) => fetch(u) } = {}) {
  const o = { intentos, espera, fetchFn };
  const [f, m, p] = await Promise.all([pedirJson(`${base}famosos.json`, o), pedirJson(`${base}mundo.json`, o), pedirJson(`${base}paises.json`, o)]);
  const famosos = limpiarFamosos(f);
  const mundo = limpiarMundo(m);
  if (mundo.length < MIN_LUGARES) throw new ErrorDatos('vacio', 'mundo.json');
  const meta = p && typeof p === 'object' && p.paises && typeof p.paises === 'object' ? p : null;
  if (!meta) throw new ErrorDatos('formato', 'paises.json');
  return { famosos, mundo, meta };
}

// ---------------------------------------------------------------- ámbitos
export const lugaresEnAmbito = (lista, ambito, meta, excluir) => lista.filter((l) => inScope(l, ambito, meta) && !excluir?.has(l.id));

/** Países con al menos `min` lugares en mundo.json, ordenados de más a menos (y por código). */
export function paisesDisponibles(mundo, meta, { min = MIN_LUGARES, excluir } = {}) {
  const n = new Map();
  for (const l of mundo) if (!excluir?.has(l.id)) n.set(l.cc, (n.get(l.cc) || 0) + 1);
  return [...n]
    .filter(([cc, c]) => c >= min && meta?.paises?.[cc])
    .map(([cc, c]) => ({ cc, n: c }))
    .sort((a, b) => b.n - a.n || a.cc.localeCompare(b.cc));
}

/** ¿Con cuántos lugares se juega ese modo y ámbito? ('famosos' usa famosos.json; 'azar' y 'pais', mundo.json). */
export function ambitoDisponible(datos, modo, ambito, excluir) {
  const lista = modo === 'famosos' ? datos.famosos : datos.mundo;
  return lugaresEnAmbito(lista, modo === 'azar' ? 'mundo' : ambito, datos.meta, excluir).length;
}

/** Caja que contiene las ubicaciones del ámbito, para el encuadre inicial del mapa. null = ver el mundo entero. */
export function limitesAmbito(lista, ambito, meta) {
  if (!ambito || ambito === 'mundo') return null;
  const ls = lugaresEnAmbito(lista, ambito, meta);
  if (!ls.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const l of ls) {
    w = Math.min(w, l.lng);
    e = Math.max(e, l.lng);
    s = Math.min(s, l.lat);
    n = Math.max(n, l.lat);
  }
  if (e - w > 270) return null; // cruza el antimeridiano o es casi todo el mundo
  return [
    [w, s],
    [e, n],
  ];
}

// ---------------------------------------------------------------- elección de ubicaciones
/**
 * Elige ubicaciones de a una, sin repetir en la partida y sin las marcadas como malas.
 * Prefiere un país que todavía no salió (se sortea el país y después el lugar, para que un país con muchos
 * lugares no se lleve todas las rondas).
 */
export class Sorteo {
  constructor({ lista, ambito = 'mundo', meta, malas, rng = Math.random }) {
    this.pool = lugaresEnAmbito(lista, ambito, meta, malas);
    this.usados = new Set();
    this.paises = new Set();
    this.rng = rng;
  }

  get restantes() {
    return this.pool.reduce((n, l) => n + (this.usados.has(l.id) ? 0 : 1), 0);
  }

  /** Saca una ubicación de la partida para siempre (la marcaron como "no carga"). */
  descartar(id) {
    this.usados.add(id);
  }

  siguiente() {
    const libres = this.pool.filter((l) => !this.usados.has(l.id));
    if (!libres.length) return null;
    const nuevos = libres.filter((l) => !this.paises.has(l.cc));
    const de = nuevos.length ? nuevos : libres;
    const ccs = [...new Set(de.map((l) => l.cc))];
    const cc = ccs[Math.floor(this.rng() * ccs.length)];
    const delPais = de.filter((l) => l.cc === cc);
    const loc = delPais[Math.floor(this.rng() * delPais.length)];
    this.usados.add(loc.id);
    this.paises.add(loc.cc);
    return { ...loc, h: headingFor(loc, this.rng) };
  }
}

/** Las 5 ubicaciones del desafío diario (las mismas para todos ese día; no se filtran las "malas" para que coincidan). */
export function partidaDiaria(datos, clave = dailyKey()) {
  const v = Number.isFinite(datos.meta?.v) ? datos.meta.v : 1;
  const locs = dailyRounds(datos.famosos, datos.mundo, clave, v);
  if (locs.length < ROUNDS_DAILY) throw new ErrorDatos('vacio', 'mundo.json');
  return locs;
}

// ---------------------------------------------------------------- guardado (siempre con try/catch)
export function leer(clave, def) {
  try {
    const v = JSON.parse(localStorage.getItem(PREFIJO + clave));
    return v ?? def;
  } catch {
    return def;
  }
}

export function guardar(clave, valor) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {}
}

export const OPCIONES_DEF = Object.freeze({ modo: 'famosos', ambitoFamosos: 'mundo', ambitoPais: 'AR', tiempo: 0, congelado: false });
const ambitoValido = (v) => typeof v === 'string' && /^[A-Za-z]{2,5}$/.test(v);

/** Últimas opciones elegidas, validadas (lo que no sirve vuelve al valor por defecto). */
export function leerOpciones() {
  const o = leer('opts', {});
  const r = { ...OPCIONES_DEF };
  if (MODOS.includes(o.modo)) r.modo = o.modo;
  if (ambitoValido(o.ambitoFamosos)) r.ambitoFamosos = o.ambitoFamosos;
  if (ambitoValido(o.ambitoPais) && o.ambitoPais !== 'mundo') r.ambitoPais = o.ambitoPais;
  if (TIEMPOS.includes(o.tiempo)) r.tiempo = o.tiempo;
  if (typeof o.congelado === 'boolean') r.congelado = o.congelado;
  return r;
}

export const guardarOpciones = (o) => guardar('opts', o);

export function leerMalas() {
  const a = leer('bad', []);
  return new Set(Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
}

/** Recuerda una ubicación como mala (se guardan las últimas MAX_MALAS). */
export function marcarMala(id) {
  const a = [...leerMalas()].filter((x) => x !== id);
  a.push(id);
  guardar('bad', a.slice(-MAX_MALAS));
}
