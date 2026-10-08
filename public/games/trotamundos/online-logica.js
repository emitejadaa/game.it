/* Trotamundos — lógica pura del cliente online (sin DOM ni imports absolutos: se prueba en Node con
 * tools/tests/trotamundos/online.test.mjs). online.js la usa para todo lo que se puede decidir sin pantalla:
 * reloj con el desfase del servidor, quién confirmó, botón "¿No carga?", tabla de la revelación, podio, salas.
 *
 * Contrato de datos: server/games/trotamundos.js (room.tm, room.players, room.settings, lista de salas públicas).
 */
import { REGIONS } from './shared/geo.js';

// ---------------------------------------------------------------- constantes (iguales a las del servidor)
export const NOIMG_VENTANA_MS = 25e3; // margen desde tm.t0 para pedir otra ubicación (lo decide el servidor)
export const AUTO_ENVIO_MS = 900; // con tiempo por ronda, el pin que haya se manda cuando faltan menos de esto
export const AVISO_RELOJ_MS = 30e3; // sin límite de tiempo, el reloj aparece cuando faltan menos de esto (tope de seguridad)
export const RONDAS_ONLINE = [3, 5, 10];
export const TIEMPOS_ONLINE = [0, 30, 60, 90, 120, 180];
export const MODOS_ONLINE = ['famosos', 'random']; // ids del servidor
export const AJUSTES_DEF = { mode: 'random', scope: 'mundo', rounds: 5, time: 90, frozen: 0, rush: 0, public: false };
export const MAX_JUGADORES = 10;
export const LARGO_NOMBRE = 16;
export const LARGO_CODIGO = 5;

/** Ámbitos que se ofrecen como fichas (además se puede buscar cualquier país). */
export const AMBITOS_ONLINE = ['mundo', 'latam', 'AR', ...REGIONS];

// ---------------------------------------------------------------- entrada
/** Código de sala: solo A-Z y 0-9, en mayúsculas, hasta 5. */
export const normalizarCodigo = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LARGO_CODIGO);

/** Nombre como lo deja el servidor (sin <, > ni caracteres de control, hasta 16); si queda vacío, el nombre por defecto. */
export function normalizarNombre(s, def = '') {
  const n = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, LARGO_NOMBRE);
  return n || def;
}

// ---------------------------------------------------------------- reloj
/** Desfase entre el reloj del servidor y el local: servidor = local + desfase. */
export const desfase = (nowServidor, nowLocal) => nowServidor - nowLocal;

/** Milisegundos que faltan para `t1` (hora del servidor) a la hora del servidor `ahora`. Nunca negativo. */
export const restanteMs = (t1, ahora) => Math.max(0, (Number(t1) || 0) - ahora);

/** Segundos enteros para mostrar (redondea para arriba: 0,2 s se ve como 1). */
export const segundos = (ms) => Math.ceil(Math.max(0, ms) / 1000);

/** 0:00 */
export function formatoReloj(seg) {
  const s = Math.max(0, Math.ceil(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * ¿Se muestra el reloj de la ronda? Con tiempo por ronda, siempre. Sin límite, solo si alguien confirmó con "apurar"
 * (t1 se acortó) o si falta poco para el tope de seguridad del servidor.
 */
export function relojVisible(tm, ahora) {
  if (!tm || tm.phase !== 'look') return false;
  if (tm.time > 0) return true;
  if (tm.rush && tm.done?.length) return true;
  return restanteMs(tm.t1, ahora) <= AVISO_RELOJ_MS;
}

/** Identifica la ubicación cargada en el visor: cambia con cada ronda y con cada "otra ubicación". */
export const claveRonda = (tm) => (tm ? `${tm.round}.${tm.swaps || 0}` : '');

/** ¿Hay que mandar ya el pin que está puesto porque se acaba el tiempo? */
export function debeAutoEnviar(tm, yo, ahora, { tengoPin, confirmado }) {
  if (!tm || tm.phase !== 'look' || !tengoPin || confirmado) return false;
  if (!tm.playing?.includes(yo) || tm.done?.includes(yo)) return false;
  return tm.t1 - ahora <= AUTO_ENVIO_MS;
}

// ---------------------------------------------------------------- jugadores y ronda
export const juegaEnRonda = (tm, id) => !!tm && Array.isArray(tm.playing) && tm.playing.includes(id);
export const jugadorPor = (players, id) => (players || []).find((p) => p.id === id) || null;

/** Mitad más uno: cuántos hacen falta para que la mayoría pida otra ubicación. */
export const mayoria = (n) => Math.floor(n / 2) + 1;

/** Los que juegan la ronda, con su nombre y color, en el orden de la sala, y si ya confirmaron. */
export function quienConfirmo(tm, players) {
  if (!tm) return [];
  const hechos = new Set(tm.done || []);
  const juegan = new Set(tm.playing || []);
  return (players || [])
    .filter((p) => juegan.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected !== false, listo: hechos.has(p.id) }));
}

/** Estado del botón "¿No carga?": visible solo mientras se puede pedir (ronda en 'look', quedan cambios, ventana de 25 s). */
export function estadoNoImg(tm, yo, ahora, players) {
  const nada = { visible: false, yaPedi: false, pedidos: 0, necesarios: 0 };
  if (!tm || tm.phase !== 'look' || !juegaEnRonda(tm, yo)) return nada;
  if (!(tm.swapsLeft > 0) || ahora - tm.t0 > NOIMG_VENTANA_MS) return nada;
  const presentes = tm.playing.filter((id) => jugadorPor(players, id)?.connected).length;
  return { visible: true, yaPedi: (tm.noimg || []).includes(yo), pedidos: (tm.noimg || []).length, necesarios: mayoria(Math.max(1, presentes)) };
}

// ---------------------------------------------------------------- puestos, tabla y podio
/** Puestos con empates (1, 1, 3…) para una lista ya ordenada de mayor a menor por `clave`. */
export function puestos(lista, clave = 'pts') {
  let puesto = 0;
  return lista.map((x, i) => {
    if (i === 0 || x[clave] !== lista[i - 1][clave]) puesto = i + 1;
    return puesto;
  });
}

/**
 * Filas de la tabla de la revelación (una por jugador de la ronda), ordenadas como las manda el servidor (por puntos de la ronda).
 * { id, name, color, km, pts, total, puesto, sinPin, yo, connected, ptsRonda... }
 */
export function tablaRevelacion(tm, players, yo) {
  const res = tm?.reveal?.results;
  if (!res) return [];
  const orden = [...res].sort((a, b) => b.pts - a.pts);
  const ps = puestos(orden, 'pts');
  return orden.map((r, i) => {
    const p = jugadorPor(players, r.id);
    return {
      id: r.id,
      name: p?.name ?? '?',
      color: p?.color ?? null,
      km: r.km,
      pts: r.pts,
      total: tm.scores?.[r.id] ?? 0,
      puesto: ps[i],
      sinPin: r.lat == null || r.lng == null,
      yo: r.id === yo,
      connected: p ? p.connected !== false : false,
    };
  });
}

/** Ranking final con puestos (empates comparten puesto) y marca del jugador local. */
export function rankingFinal(ranking, yo) {
  const orden = [...(ranking || [])].sort((a, b) => b.pts - a.pts);
  const ps = puestos(orden, 'pts');
  return orden.map((r, i) => ({ ...r, puesto: ps[i], yo: r.id === yo }));
}

/** Los que ganaron (puede haber empate en el primer puesto). */
export const ganadores = (ranking) => rankingFinal(ranking, null).filter((r) => r.puesto === 1);

/**
 * Podio: hasta 3 lugares, en el orden en que se dibujan (2.º, 1.º, 3.º) para que el primero quede en el medio.
 * Con empates, un jugador cuenta con su puesto de empate (dos primeros: los dos en el escalón más alto).
 */
export function podio(ranking, yo = null) {
  const r = rankingFinal(ranking, yo);
  const top = r.filter((x) => x.puesto <= 3).slice(0, 3);
  const por = (n) => top.filter((x) => x.puesto === n);
  // orden visual: 2.º a la izquierda, 1.º en el medio, 3.º a la derecha (los empatados quedan juntos)
  return [...por(2), ...por(1), ...por(3)];
}

// ---------------------------------------------------------------- mapa (datos para Mapa.revelar y Mapa.resumen)
/** Pines de la revelación con el color de cada jugador (los que no marcaron no tienen pin). */
export function pinsRevelacion(results, players, yo = null, etiquetaYo = '') {
  return (results || [])
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => {
      const p = jugadorPor(players, r.id);
      const nombre = p?.name ?? '?';
      return { lat: r.lat, lng: r.lng, color: p?.color || '#ff2bd6', etiqueta: r.id === yo && etiquetaYo ? `${nombre} (${etiquetaYo})` : nombre };
    });
}

/** Rondas para Mapa.resumen: el lugar real y el pin del jugador local de cada ronda. */
export function rondasParaMapa(history, yo) {
  return (history || []).map((h) => {
    const r = (h.results || []).find((x) => x.id === yo);
    return { real: h.place, guess: r && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null };
  });
}

/** Nombre corto del lugar (famoso: en el idioma; al azar: población y, si no hay, el país). */
export function nombreCortoLugar(place, lang, nombrePais) {
  if (!place) return '';
  if (place.n) return place.n[lang] || place.n.es || place.n.en || '';
  return place.p || (nombrePais ? nombrePais(place.cc) : place.cc || '');
}

// ---------------------------------------------------------------- salas públicas
/** Salas a las que se puede entrar, primero las que esperan en el lobby y con más gente. */
export function ordenarSalas(salas) {
  const abiertas = (Array.isArray(salas) ? salas : []).filter((s) => s && typeof s.code === 'string' && s.n < s.max);
  return abiertas.sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || b.n - a.n || a.code.localeCompare(b.code));
}

/** Partida rápida: la sala pública con más gente que todavía no empezó (null si no hay ninguna). */
export function elegirSalaRapida(salas) {
  return ordenarSalas(salas).find((s) => s.state === 'lobby') || null;
}

// ---------------------------------------------------------------- ajustes del lobby
/** Ajustes nuevos al cambiar uno (el servidor valida y corrige: esto solo arma el mensaje). */
export function cambiarAjuste(actual, clave, valor) {
  const base = { ...AJUSTES_DEF, ...(actual || {}) };
  if (clave === 'frozen' || clave === 'rush') valor = valor ? 1 : 0;
  else if (clave === 'public') valor = !!valor;
  else if (clave === 'rounds' || clave === 'time') valor = Number(valor);
  return { ...base, [clave]: valor };
}

/** Ámbitos para mostrar en fichas: los base y, si el elegido es un país fuera de la lista, también ese. */
export function ambitosVisibles(elegido) {
  return AMBITOS_ONLINE.includes(elegido) || !elegido ? [...AMBITOS_ONLINE] : [...AMBITOS_ONLINE, elegido];
}

// ---------------------------------------------------------------- errores
/** Código de error del servidor → clave de texto propia (si no hay, se usa netText del portal). */
export const ERRORES_PROPIOS = { no_data: 'on_noData', bad_game: 'on_errorGen' };
