#!/usr/bin/env node
/* Trotamundos — genera los datos del juego (public/games/trotamundos/datos/*).
 * Mirá `node tools/trotamundos-datos.mjs --help`. Las funciones puras se exportan para probarlas sin red
 * (tools/tests/trotamundos/datos.test.mjs); el resto es la línea de comandos. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync, statSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { distanceKm, bearingDeg, embedUrl, rngFrom, WORLD_D } from '../public/games/trotamundos/shared/geo.js';
import { PAISES_CORE, PAISES_PRUEBA, CANDIDATOS_PRUEBA, PROMOCION, LATAM, RECORTES, CONTINENTE_FORZADO, FAMOSOS } from './trotamundos-semillas.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATOS = join(ROOT, 'public/games/trotamundos/datos');
export const CACHE = process.env.TROTAMUNDOS_CACHE || join(ROOT, 'tools/.cache/trotamundos'); // TROTAMUNDOS_CACHE: otra carpeta de trabajo (para pruebas)
const NE_DIR = join(CACHE, 'ne');
const F = {
  candidatos: join(CACHE, 'candidatos.json'),
  validacion: join(CACHE, 'validacion.jsonl'),
  previas: join(CACHE, 'cargas-previas.txt'),
  descartes: join(CACHE, 'descartes.json'),
  bloqueo: join(CACHE, 'BLOQUEO.txt'),
  freno: join(CACHE, 'FRENO.txt'),
  revisados: join(CACHE, 'revisados.json'),
  teselas: join(CACHE, 'teselas'),
  parar: join(CACHE, 'PARAR'),
  shots: join(CACHE, 'shots'),
  hojas: join(CACHE, 'hojas'),
};

export const VERSION_DATOS = 2; // versión mínima de paises.json (la de la ampliación de oct. 2026); 'armar' la sube sola si cambia el contenido
export const MAX_CARGAS = 5000; // tope de cargas del visor en total (lo cacheado no cuenta); se subió de 3.000 a 5.000 por decisión expresa de quien dirige el proyecto
export const CONCURRENCIA = 3;
export const RITMO_MAX_POR_MIN = 30; // tope de cargas empezadas por minuto, sumando todos los trabajadores
export const FALLAS_BLANDAS_MAX = 8; // fallas blandas seguidas (tiempo agotado o error de red sin llegar a ver la página) que frenan todo
export const MAX_SITIO_KM = 0.25; // un famoso vale si su foto oficial queda a menos de 250 m del sitio
export const MAX_BYTES = 400 * 1024; // todo datos/ pesa menos de 400 KB
const CONTINENTES = ['africa', 'asia', 'europa', 'norteamerica', 'sudamerica', 'oceania'];
const CONT_NE = { Africa: 'africa', Asia: 'asia', Europe: 'europa', 'North America': 'norteamerica', 'South America': 'sudamerica', Oceania: 'oceania' };

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const NE_ARCHIVOS = {
  paises: 'ne_10m_admin_0_countries.geojson',
  rutas: 'ne_10m_roads.geojson',
  lugares: 'ne_10m_populated_places.geojson',
};
// Pueblos de GeoNames (CC BY 4.0) a través de github.com/lutangar/cities.json. Las rutas de Natural Earth (1:10m) están
// generalizadas y casi nunca caen a menos de ~50 m de la calle real (el visor busca la panorámica en un radio chico):
// sirven en Europa y Norteamérica, pero en el resto hay que apoyarse en pueblos y ciudades.
const PUEBLOS = { archivo: 'pueblos-geonames.json', url: 'https://raw.githubusercontent.com/lutangar/cities.json/master/cities.json' };

// ================================================================ geometría (pura)

/** Código ISO-2 de un país de Natural Earth. ISO_A2 vale "-99" en Francia, Noruega y otros: se usa ISO_A2_EH. */
export function ccDe(props = {}) {
  const ok = (v) => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
  if (ok(props.ISO_A2_EH)) return props.ISO_A2_EH;
  if (ok(props.ISO_A2)) return props.ISO_A2;
  return { KOS: 'XK' }[props.ADM0_A3] || null;
}

/** ¿El punto está dentro del anillo? (rayos; anillo = [[lng, lat], …]) */
export function puntoEnAnillo(lng, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Polígono = [anilloExterior, ...agujeros]. */
export function puntoEnPoligono(lng, lat, poligono) {
  if (!poligono.length || !puntoEnAnillo(lng, lat, poligono[0])) return false;
  for (let i = 1; i < poligono.length; i++) if (puntoEnAnillo(lng, lat, poligono[i])) return false;
  return true;
}

/** Polígonos de una geometría GeoJSON (Polygon o MultiPolygon). */
export function poligonosDe(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

export function bboxAnillo(anillo) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of anillo) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Área aproximada (km²) de un polígono (anillo exterior), con la proyección equirrectangular local. */
export function areaKm2(poligono) {
  const a = poligono[0];
  if (!a || a.length < 4) return 0;
  const lat0 = (a.reduce((s, p) => s + p[1], 0) / a.length) * (Math.PI / 180);
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.57;
  let s = 0;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) s += (a[j][0] * kx) * (a[i][1] * ky) - (a[i][0] * kx) * (a[j][1] * ky);
  return Math.abs(s) / 2;
}

/** País geográfico: { cc, nombre, cont, polys: [{ p, bb, area }], bb }. */
export function crearPais(cc, nombre, cont, poligonos) {
  const polys = poligonos.map((p) => ({ p, bb: bboxAnillo(p[0]), area: areaKm2(p) }));
  const bb = polys.length ? bboxAnillo(polys.flatMap((q) => [[q.bb[0], q.bb[1]], [q.bb[2], q.bb[3]]])) : [0, 0, 0, 0];
  return { cc, nombre, cont, polys, bb };
}

const dentroBB = (lng, lat, bb) => lng >= bb[0] && lng <= bb[2] && lat >= bb[1] && lat <= bb[3];

/** ¿El punto está dentro del país? `recorte` = [lngMin, latMin, lngMax, latMax] opcional. */
export function puntoEnPais(lng, lat, pais, recorte) {
  if (recorte && !dentroBB(lng, lat, recorte)) return false;
  if (!dentroBB(lng, lat, pais.bb)) return false;
  for (const q of pais.polys) if (dentroBB(lng, lat, q.bb) && puntoEnPoligono(lng, lat, q.p)) return true;
  return false;
}

/** Código del país que contiene al punto (o null). */
export function paisDe(lng, lat, paises) {
  for (const p of paises.values ? paises.values() : paises) if (puntoEnPais(lng, lat, p)) return p.cc;
  return null;
}

/** Diagonal (km) del rectángulo [lngMin, latMin, lngMax, latMax]. */
export function diagonalKm(bb) {
  return distanceKm(bb[1], bb[0], bb[3], bb[2]);
}

/**
 * Escala "d" de un país: diagonal del rectángulo que lo contiene sin las islas lejanas.
 * Se parte del polígono más grande y se suman los que tienen al menos 1 % de su área y su centro a menos de
 * max(600 km, la diagonal del más grande). Con `recorte`, solo cuenta esa zona. Mínimo 250 km.
 */
export function escalaPais(pais, recorte) {
  let polys = pais.polys;
  if (recorte) polys = polys.filter((q) => q.bb[0] <= recorte[2] && q.bb[2] >= recorte[0] && q.bb[1] <= recorte[3] && q.bb[3] >= recorte[1]);
  if (!polys.length) return 250;
  const mayor = polys.reduce((a, b) => (b.area > a.area ? b : a));
  const centro = (q) => [(q.bb[0] + q.bb[2]) / 2, (q.bb[1] + q.bb[3]) / 2];
  const cm = centro(mayor);
  const lim = Math.max(600, diagonalKm(mayor.bb));
  const usados = polys.filter((q) => q === mayor || (q.area >= mayor.area * 0.01 && distanceKm(cm[1], cm[0], centro(q)[1], centro(q)[0]) <= lim));
  let bb = bboxAnillo(usados.flatMap((q) => [[q.bb[0], q.bb[1]], [q.bb[2], q.bb[3]]]));
  if (recorte) bb = [Math.max(bb[0], recorte[0]), Math.max(bb[1], recorte[1]), Math.min(bb[2], recorte[2]), Math.min(bb[3], recorte[3])];
  return Math.max(250, Math.round(diagonalKm(bb)));
}

/** Escala de un ámbito (latam, continente) a partir de sus puntos, sin valores extremos (percentiles `recorte`..1-`recorte`). */
export function escalaAmbito(puntos, recorte = 0.02) {
  if (!puntos.length) return 250;
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];
  const lats = puntos.map((p) => p.lat).sort((a, b) => a - b);
  const lngs = puntos.map((p) => p.lng).sort((a, b) => a - b);
  const bb = [q(lngs, recorte), q(lats, recorte), q(lngs, 1 - recorte), q(lats, 1 - recorte)];
  return Math.max(250, Math.round(diagonalKm(bb)));
}

/** Países chicos (rectángulo de menos de 120.000 km²): 5 km entre lugares; el resto, 15 km. */
export function minKmPais(bb) {
  const lat = (bb[1] + bb[3]) / 2;
  const area = (bb[3] - bb[1]) * 110.57 * (bb[2] - bb[0]) * 111.32 * Math.cos((lat * Math.PI) / 180);
  return area < 120000 ? 5 : 15;
}

/** Puntos a lo largo de una línea cada `pasoKm` (con el rumbo del tramo). coords = [[lng, lat], …]. */
export function densificar(coords, pasoKm = 8) {
  const out = [];
  let falta = pasoKm / 2; // el primero, a mitad de paso
  for (let i = 0; i + 1 < coords.length; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const seg = distanceKm(y1, x1, y2, x2);
    if (seg === 0) continue;
    const h = bearingDeg(y1, x1, y2, x2);
    let pos = falta;
    while (pos <= seg) {
      const t = pos / seg;
      out.push({ lat: y1 + (y2 - y1) * t, lng: x1 + (x2 - x1) * t, h });
      pos += pasoKm;
    }
    falta = pos - seg;
  }
  return out;
}

/** ¿El punto queda a `minKm` o más de todos los de la lista? */
export function respetaDistancia(lat, lng, lista, minKm) {
  for (const q of lista) if (distanceKm(lat, lng, q.lat, q.lng) < minKm) return false;
  return true;
}

/** Recorre la lista en orden y se queda con los que están a `minKm` o más de los ya elegidos. */
export function espaciar(lista, minKm) {
  const out = [];
  for (const p of lista) if (respetaDistancia(p.lat, p.lng, out, minKm)) out.push(p);
  return out;
}

/** Lugar poblado más cercano a menos de `maxKm`: devuelve el nombre o null. lugares = [{ lat, lng, n }]. */
export function lugarMasCercano(lat, lng, lugares, maxKm = 100) {
  let mejor = null;
  let md = maxKm;
  for (const l of lugares) {
    if (Math.abs(l.lat - lat) > maxKm / 100) continue; // 1° de latitud ≈ 111 km
    const d = distanceKm(lat, lng, l.lat, l.lng);
    if (d < md) {
      md = d;
      mejor = l.n;
    }
  }
  return mejor;
}

const mezclar = (arr, rng) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const r5 = (v) => Math.round(v * 1e5) / 1e5;

/**
 * Candidatos de un país, en dos listas:
 *  r: puntos sobre rutas (rutas de Natural Earth), al azar y a `minKm` o más entre sí → [lat, lng, rumbo];
 *  c: ciudades y pueblos (primero los lugares poblados de Natural Earth, después pueblos de GeoNames), al azar y a 1 km o más
 *     entre sí → [lat, lng, 'c' | 'g'].
 * `pueblos` = [{ lat, lng, tipo }] ya ordenados por prioridad (los de cada tipo se mezclan acá).
 */
export function generarCandidatos({ pais, rutas, pueblos, cantRutas, cantPueblos, minKm, rng, recorte }) {
  const r = [];
  for (const p of mezclar(rutas, rng)) {
    if (r.length >= cantRutas) break;
    if (!respetaDistancia(p.lat, p.lng, r, minKm)) continue;
    if (!puntoEnPais(p.lng, p.lat, pais, recorte)) continue;
    const h = Number.isFinite(p.h) ? Math.round((p.h + (rng() < 0.5 ? 0 : 180)) % 360) : null;
    r.push({ lat: r5(p.lat), lng: r5(p.lng), h });
  }
  const c = [];
  const orden = [...mezclar(pueblos.filter((p) => p.tipo === 'c'), rng), ...mezclar(pueblos.filter((p) => p.tipo !== 'c'), rng)];
  for (const p of orden) {
    if (c.length >= cantPueblos) break;
    if (recorte && !dentroBB(p.lng, p.lat, recorte)) continue;
    if (!respetaDistancia(p.lat, p.lng, c, 1)) continue;
    c.push({ lat: r5(p.lat), lng: r5(p.lng), tipo: p.tipo });
  }
  return { r: r.map((p) => [p.lat, p.lng, p.h]), c: c.map((p) => [p.lat, p.lng, p.tipo]) };
}

/**
 * Candidatos "sobre calles": pueblos y ciudades (los 8 más poblados de Natural Earth primero, el resto al azar) a `minKm` o más entre sí.
 * Al validar, cada uno se pega a la calle más cercana (ver puntoEnCalle) y se prueba desde ahí. → [[lat, lng, 's'], …]
 */
export function generarCandidatosCalles({ pueblos, cant, minKm, rng, recorte }) {
  const dentro = (p) => !recorte || dentroBB(p.lng, p.lat, recorte);
  const grandes = pueblos.filter((p) => p.pop > 0 && dentro(p)).sort((a, b) => b.pop - a.pop || a.lat - b.lat).slice(0, 8);
  const resto = mezclar(pueblos.filter((p) => !grandes.includes(p) && dentro(p)), rng);
  const out = [];
  for (const p of [...grandes, ...resto]) {
    if (out.length >= cant) break;
    if (respetaDistancia(p.lat, p.lng, out, minKm)) out.push({ lat: r5(p.lat), lng: r5(p.lng) });
  }
  return out.map((p) => [p.lat, p.lng, 's']);
}

// ================================================================ lectura del visor (pura)

const RE_SIN_IMAGEN = /No Street View available|No hay im[aá]genes disponibles|Street View (is )?not available/i;
const RE_BLOQUEO = /unusual traffic|tr[aá]fico inusual|captcha|not a robot|no soy un robot|\/sorry\//i;

/** Atribución "© <año> Google" (foto oficial) y no el nombre de una persona. */
export function esAtribucionOficial(attr) {
  return /^©\s*(\d{4}\s+)?Google(\s+LLC)?$/i.test(String(attr || '').trim());
}

/** Posición e id de la panorámica a partir del enlace "Ver en Google Maps" del visor. */
export function panoDeEnlace(href) {
  const m = /\/maps\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/.exec(href || '');
  if (!m) return null;
  const pid = /!1s([A-Za-z0-9_-]+)/.exec(href)?.[1] || null;
  return { lat: Number(m[1]), lng: Number(m[2]), pid };
}

/**
 * Interpreta lo que muestra el visor. `texto` = document.body.innerText del iframe; `enlaces` = href de sus <a>.
 * estado: 'bloqueo' | 'sin-imagen' | 'ok' | 'esperando'.
 */
export function leerVisor(texto, enlaces = []) {
  const t = String(texto || '');
  if (RE_BLOQUEO.test(t)) return { estado: 'bloqueo' };
  if (RE_SIN_IMAGEN.test(t)) return { estado: 'sin-imagen' };
  const lineas = t.split('\n').map((s) => s.trim()).filter(Boolean);
  const attr = lineas.find((l) => l.startsWith('©')) || null;
  const pano = enlaces.map(panoDeEnlace).find((x) => x && x.pid) || enlaces.map(panoDeEnlace).find(Boolean) || null;
  if (!attr || !pano) return { estado: 'esperando' };
  const i = lineas.findIndex((l) => /^(View on Google Maps|Ver en Google Maps)$/i.test(l));
  const card = (i > 0 ? lineas.slice(0, i) : []).join(' | ');
  return { estado: 'ok', attr, oficial: esAtribucionOficial(attr), card, pano };
}

const GENERICAS = new Set(['plaza', 'torre', 'tower', 'parque', 'park', 'cerro', 'monte', 'mount', 'puente', 'bridge', 'catedral', 'cathedral', 'palacio', 'palace', 'museo', 'museum', 'templo', 'temple', 'cataratas', 'falls', 'glaciar', 'glacier', 'centro', 'center', 'ciudad', 'city', 'casa', 'house', 'gran', 'grand', 'santo', 'santa', 'beach', 'playa', 'lago', 'lake', 'estadio', 'stadium', 'valle', 'valley', 'side', 'lado', 'view', 'ruinas', 'castillo', 'castle', 'basilica', 'iglesia', 'church', 'teatro', 'theatre', 'theater', 'norte', 'sur', 'este', 'oeste']);
const sinTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿La tarjeta del visor nombra el sitio esperado? (alguna palabra de 4+ letras no genérica de los nombres es/en) */
export function coincideNombre(card, nombres) {
  const palabras = new Set(sinTildes(card).split(/[^a-z0-9]+/).filter(Boolean));
  if (!palabras.size) return false;
  for (const n of nombres) {
    for (const w of sinTildes(n).split(/[^a-z0-9]+/)) {
      if (w.length >= 4 && !GENERICAS.has(w) && palabras.has(w)) return true;
    }
  }
  return false;
}

// ================================================================ ritmo y frenos (puros)

/**
 * Limitador de ritmo: como mucho `max` cargas empezadas en cualquier ventana de `ventanaMs`.
 * espera() = ms que falta esperar antes de empezar otra (0 = ya se puede); marcar() anota una carga empezada.
 */
export function crearLimitador(max = RITMO_MAX_POR_MIN, ventanaMs = 60000, reloj = Date.now) {
  const t = [];
  return {
    espera() {
      const ahora = reloj();
      while (t.length && ahora - t[0] >= ventanaMs) t.shift();
      return t.length < max ? 0 : t[0] + ventanaMs - ahora;
    },
    marcar() {
      t.push(reloj());
    },
  };
}

/** Cuenta fallas blandas seguidas (tiempo agotado o error de red sin ver la página): falla() devuelve true al llegar al tope; ok() la reinicia. */
export function crearFreno(max = FALLAS_BLANDAS_MAX) {
  let seguidas = 0;
  return {
    falla() {
      seguidas++;
      return seguidas >= max;
    },
    ok() {
      seguidas = 0;
    },
    get seguidas() {
      return seguidas;
    },
  };
}

// ================================================================ calles (teselas vectoriales de OpenFreeMap, datos de OpenStreetMap)

const RAD = Math.PI / 180;

/** Tesela (x, y) del zoom z que contiene el punto (proyección web estándar). */
export function teselaDe(lat, lng, z = 14) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(lat * RAD) + 1 / Math.cos(lat * RAD)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** [lng, lat] de un punto (px, py) de una tesela con `extent` unidades de lado. */
export function lngLatDeTesela(z, x, y, px, py, extent = 4096) {
  const n = 2 ** z;
  const lng = ((x + px / extent) / n) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / extent)) / n))) / RAD;
  return [lng, lat];
}

function varint(b, p) {
  let r = 0;
  let s = 0;
  let x;
  do {
    x = b[p.i++];
    r += (x & 0x7f) * 2 ** s;
    s += 7;
  } while (x & 0x80);
  return r;
}

/** Campos de un mensaje protobuf entre ini y fin: [[número, valor | [desde, hasta]], …]. */
function camposPb(b, ini, fin) {
  const p = { i: ini };
  const out = [];
  while (p.i < fin) {
    const k = varint(b, p);
    const f = k >> 3;
    const t = k & 7;
    if (t === 0) out.push([f, varint(b, p)]);
    else if (t === 2) {
      const n = varint(b, p);
      out.push([f, [p.i, p.i + n]]);
      p.i += n;
    } else if (t === 1) p.i += 8;
    else if (t === 5) p.i += 4;
    else throw new Error(`tipo de campo protobuf ${t}`);
  }
  return out;
}

/** Decodifica una tesela vectorial (MVT) ya descomprimida; con `soloCapa`, solo esa capa. → { capa: { extent, features: [{ tipo, props, geom }] } } */
export function decodificarMVT(b, soloCapa) {
  const capas = {};
  for (const [f, v] of camposPb(b, 0, b.length)) {
    if (f !== 3) continue;
    const cs = camposPb(b, v[0], v[1]);
    const nombre = b.toString('utf8', ...cs.find((c) => c[0] === 1)[1]);
    if (soloCapa && nombre !== soloCapa) continue;
    const keys = [];
    const vals = [];
    const crudos = [];
    let extent = 4096;
    for (const [g, w] of cs) {
      if (g === 3) keys.push(b.toString('utf8', w[0], w[1]));
      else if (g === 4) {
        const vv = camposPb(b, w[0], w[1])[0];
        vals.push(vv[0] === 1 ? b.toString('utf8', ...vv[1]) : vv[0] === 2 ? b.readFloatLE(vv[1][0]) : vv[0] === 3 ? b.readDoubleLE(vv[1][0]) : vv[1]);
      } else if (g === 5) extent = w;
      else if (g === 2) crudos.push(w);
    }
    capas[nombre] = {
      extent,
      features: crudos.map((w) => {
        let tipo = 0;
        const tags = [];
        let geom = [];
        for (const [h, u] of camposPb(b, w[0], w[1])) {
          if (h === 3) tipo = u;
          else if (h === 2) {
            const q = { i: u[0] };
            while (q.i < u[1]) tags.push(varint(b, q));
          } else if (h === 4) {
            const q = { i: u[0] };
            while (q.i < u[1]) geom.push(varint(b, q));
          }
        }
        const props = {};
        for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
        return { tipo, props, geom };
      }),
    };
  }
  return capas;
}

/** Líneas de una geometría MVT (comandos MoveTo/LineTo/ClosePath) en unidades de la tesela: [[[px, py], …], …] */
export function lineasDeGeom(geom) {
  const out = [];
  let cur = null;
  let x = 0;
  let y = 0;
  const z = (n) => (n >> 1) ^ -(n & 1); // zigzag
  for (let i = 0; i < geom.length; ) {
    const cmd = geom[i] & 7;
    const cnt = geom[i] >> 3;
    i++;
    if (cmd === 7) continue;
    for (let k = 0; k < cnt; k++) {
      x += z(geom[i++]);
      y += z(geom[i++]);
      if (cmd === 1) {
        cur = [[x, y]];
        out.push(cur);
      } else if (cur) cur.push([x, y]);
    }
  }
  return out;
}

/** Penalización (m equivalentes) por tipo de calle al elegir a cuál pegarse: las grandes tienen cobertura casi siempre; las de servicio, casi nunca. */
export const PENALIZACION_CALLE = { motorway: 150, trunk: 20, primary: 0, secondary: 0, tertiary: 15, minor: 40, pedestrian: 120, service: 250 };
const SERVICIOS_FUERA = new Set(['parking_aisle', 'driveway', 'drive-through']);

/** Calles transitables de una tesela (capa "transportation" de OpenMapTiles): [{ c: clase, p: [[lng, lat], …] }], sin túneles, rieles, sendas ni accesos de estacionamiento. */
export function callesDeTesela(buf, z, x, y) {
  const capa = decodificarMVT(buf, 'transportation').transportation;
  if (!capa) return [];
  const out = [];
  for (const f of capa.features) {
    if (f.tipo !== 2) continue;
    const { class: c0, subclass, brunnel } = f.props;
    if (brunnel === 'tunnel') continue;
    let c = c0;
    if (c === 'path') c = subclass === 'pedestrian' ? 'pedestrian' : null;
    if (c === 'service' && SERVICIOS_FUERA.has(subclass)) c = null;
    if (!c || PENALIZACION_CALLE[c] === undefined) continue;
    for (const l of lineasDeGeom(f.geom)) {
      if (l.length < 2) continue;
      out.push({ c, p: l.map(([px, py]) => lngLatDeTesela(z, x, y, px, py, capa.extent).map((v) => Math.round(v * 1e6) / 1e6)) });
    }
  }
  return out;
}

/** Metros por grado en (lat): [mLng, mLat]. */
const metrosPorGrado = (lat) => [111320 * Math.cos(lat * RAD), 110574];

/** Punto más cercano sobre un segmento (planar local): { t, dM } con t en [0, 1]. */
function sobreSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return { t, dM: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
}

/**
 * Punto sobre una calle cerca de (lat, lng): para cada calle se toma su punto más cercano y se elige entre las 3 mejores
 * (distancia + penalización de la clase; con `rng`, al azar entre ellas). → { lat, lng, h, distM, c } o null si no hay calles a `radioM`.
 */
export function puntoEnCalle(lat, lng, calles, { radioM = 350, rng = null, peso = 1 } = {}) {
  const [kx, ky] = metrosPorGrado(lat);
  const mejores = [];
  for (const l of calles) {
    let mejor = null;
    for (let i = 0; i + 1 < l.p.length; i++) {
      const [x1, y1] = l.p[i];
      const [x2, y2] = l.p[i + 1];
      const r = sobreSegmento(0, 0, (x1 - lng) * kx, (y1 - lat) * ky, (x2 - lng) * kx, (y2 - lat) * ky);
      if (r.dM > radioM || (mejor && r.dM >= mejor.distM)) continue;
      mejor = { lat: y1 + (y2 - y1) * r.t, lng: x1 + (x2 - x1) * r.t, h: Math.round(bearingDeg(y1, x1, y2, x2)) % 360, distM: r.dM, c: l.c };
    }
    if (mejor) mejores.push({ ...mejor, score: mejor.distM + PENALIZACION_CALLE[l.c] * peso });
  }
  if (!mejores.length) return null;
  mejores.sort((a, b) => a.score - b.score);
  const e = mejores[rng ? Math.min(mejores.length - 1, Math.floor(rng() * 3)) : 0];
  return { lat: r5(e.lat), lng: r5(e.lng), h: e.h, distM: Math.round(e.distM), c: e.c };
}

/**
 * Puntos desde donde probar la panorámica oficial de un sitio famoso, en orden: primero el punto de calle más cercano (o el sitio mismo
 * si no hay calles), después puntos de calle de 45 a 210 m del sitio en direcciones distintas. No repite zonas ya probadas (a menos de
 * 40 m de un punto de `probados`). → [{ lat, lng, dist (m), c }] con hasta `n` puntos.
 */
export function sondasFamoso(sitio, calles, { n = 6, probados = [] } = {}) {
  const [kx, ky] = metrosPorGrado(sitio.lat);
  const cands = [];
  for (const l of calles) {
    for (let i = 0; i + 1 < l.p.length; i++) {
      const [x1, y1] = l.p[i];
      const [x2, y2] = l.p[i + 1];
      const seg = Math.hypot((x2 - x1) * kx, (y2 - y1) * ky);
      const pasos = Math.max(1, Math.ceil(seg / 12));
      for (let k = 0; k <= pasos; k++) {
        const lng = x1 + ((x2 - x1) * k) / pasos;
        const lat = y1 + ((y2 - y1) * k) / pasos;
        const ex = (lng - sitio.lng) * kx;
        const ey = (lat - sitio.lat) * ky;
        const dist = Math.hypot(ex, ey);
        if (dist > 230) continue;
        cands.push({ lat: r5(lat), lng: r5(lng), dist, ang: (Math.atan2(ex, ey) / RAD + 360) % 360, c: l.c, pen: PENALIZACION_CALLE[l.c] });
      }
    }
  }
  const lejos = (p, lista, m) => lista.every((q) => Math.hypot((p.lng - q.lng) * kx, (p.lat - q.lat) * ky) >= m);
  const conAng = (q) => {
    const ex = (q.lng - sitio.lng) * kx;
    const ey = (q.lat - sitio.lat) * ky;
    return { lat: q.lat, lng: q.lng, dist: Math.hypot(ex, ey), ang: (Math.atan2(ex, ey) / RAD + 360) % 360 };
  };
  const previos = probados.map(conAng);
  const elegidos = [];
  const ocupados = () => [...previos, ...elegidos];
  const difAng = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  if (!probados.length) {
    const primero = cands.filter((p) => lejos(p, ocupados(), 0.01)).sort((a, b) => a.dist + a.pen / 4 - (b.dist + b.pen / 4))[0];
    elegidos.push(primero || { lat: sitio.lat, lng: sitio.lng, dist: 0, ang: null, c: 'sitio', pen: 0 });
  }
  while (elegidos.length < n) {
    const angs = ocupados().filter((p) => p.dist > 15).map((p) => p.ang);
    let mejor = null;
    let mv = -Infinity;
    for (const p of cands) {
      if (p.dist < 45 || p.dist > 210 || !lejos(p, ocupados(), 40)) continue;
      const sep = angs.length ? Math.min(...angs.map((a) => difAng(a, p.ang)), 90) / 90 : 1;
      const v = sep * 2 - (p.dist + p.pen / 4) / 250;
      if (v > mv) {
        mv = v;
        mejor = p;
      }
    }
    if (!mejor) break;
    elegidos.push(mejor);
  }
  return elegidos.map((p) => ({ lat: p.lat, lng: p.lng, dist: Math.round(p.dist), c: p.c }));
}

// ================================================================ aceptación (pura)

export const claveDe = (tipo, lat, lng) => `${tipo}:${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;

/**
 * Registros válidos de un país → lugares aceptados: mismo país (según el polígono) que el candidato, sin panorámicas repetidas,
 * a `minKm` o más entre sí y sin descartes manuales. `recs` va en el orden de los candidatos.
 * Devuelve { aceptados, rechazados: { motivo: n } }.
 */
export function aceptarMundo(recs, { cc, minKm, ccDePano, descartes = new Set() }) {
  const aceptados = [];
  const rechazados = {};
  const vistos = new Set();
  const no = (m) => (rechazados[m] = (rechazados[m] || 0) + 1);
  for (const r of recs) {
    if (r.estado !== 'ok' || !r.oficial) continue;
    if (descartes.has(r.k)) {
      no('descarte-manual');
      continue;
    }
    if (ccDePano && ccDePano(r.pano.lng, r.pano.lat) !== cc) {
      no('pais-distinto');
      continue;
    }
    if (r.pano.pid && vistos.has(r.pano.pid)) {
      no('repetido');
      continue;
    }
    if (!respetaDistancia(r.pano.lat, r.pano.lng, aceptados.map((a) => a.pano), minKm)) {
      no('muy-cerca');
      continue;
    }
    if (r.pano.pid) vistos.add(r.pano.pid);
    aceptados.push(r);
  }
  return { aceptados, rechazados };
}

/** Rumbo hacia el sitio desde la panorámica; null si están a menos de 20 m (no hay "hacia dónde"). */
export function rumboHaciaSitio(pano, sitio) {
  if (distanceKm(pano.lat, pano.lng, sitio.lat, sitio.lng) < 0.02) return null;
  return Math.round(bearingDeg(pano.lat, pano.lng, sitio.lat, sitio.lng)) % 360;
}

// ================================================================ armado de los archivos (puro)

const lineasJson = (arr) => '[\n' + arr.map((o) => '  ' + JSON.stringify(o)).join(',\n') + '\n]\n';

/** paises.json: un país por línea. */
export function serializarPaises(obj) {
  const pais = Object.entries(obj.paises).map(([cc, p]) => `    ${JSON.stringify(cc)}: ${JSON.stringify(p)}`).join(',\n');
  const reg = Object.entries(obj.regiones).map(([k, p]) => `    ${JSON.stringify(k)}: ${JSON.stringify(p)}`).join(',\n');
  const ids = obj.ids ? `  "ids": ${JSON.stringify(obj.ids)},\n` : '';
  return `{\n  "v": ${obj.v},\n  "generado": ${JSON.stringify(obj.generado)},\n  "metodo": ${JSON.stringify(obj.metodo)},\n${ids}  "paises": {\n${pais}\n  },\n  "regiones": {\n${reg}\n  }\n}\n`;
}

export const METODO =
  'Natural Earth 1:10m (dominio público). d de cada país = diagonal (km) del rectángulo que contiene sus polígonos sin islas lejanas ' +
  '(se parte del polígono más grande y se suman los de al menos 1 % de su área cuyo centro queda a menos de max(600 km, su diagonal); ' +
  'Estados Unidos = zona continental y Rusia = zona europea, hasta 60° E; mínimo 250). d de latam y de cada continente = diagonal del ' +
  'rectángulo que contiene los lugares de mundo.json de ese ámbito sin valores extremos (se descartan el 2 % menor y el 2 % mayor de ' +
  'latitudes y de longitudes por separado); mundo = 14916,862 (shared/geo.js). n = lugares de mundo.json, f = famosos. latam = 1: de México a ' +
  'Argentina y Chile, más Cuba, Haití y República Dominicana, con Brasil. cont: AF, AS, EU, NA (incluye Centroamérica y el Caribe), SA, OC. ' +
  'k = distancia mínima en km entre dos lugares del mismo país (5 si el rectángulo del país tiene menos de 120.000 km², si no 15). ' +
  'ids = el id más alto que se usó alguna vez de cada prefijo (f, m): un lugar nuevo nunca reutiliza el id de uno que se sacó.';

/**
 * Arma el contenido final de los tres JSON. Entradas ya filtradas:
 *  famosos: [{ id, lat, lng, cc, n, h? }], mundo: [{ id, lat, lng, cc, h?, p? }],
 *  geo: Map cc → { cont, d }, generado: 'AAAA-MM-DD'.
 */
export function construirPaises({ famosos, mundo, geo, generado, v = VERSION_DATOS, ids }) {
  const n = {};
  const f = {};
  for (const m of mundo) n[m.cc] = (n[m.cc] || 0) + 1;
  for (const x of famosos) f[x.cc] = (f[x.cc] || 0) + 1;
  const ccs = [...new Set([...Object.keys(n), ...Object.keys(f)])].sort();
  const paises = {};
  for (const cc of ccs) {
    const g = geo.get(cc);
    if (!g) throw new Error(`Falta el país ${cc} en Natural Earth`);
    const e = { cont: g.cont };
    if (LATAM.includes(cc)) e.latam = 1;
    e.d = g.d;
    if (g.k) e.k = g.k;
    e.n = n[cc] || 0;
    e.f = f[cc] || 0;
    paises[cc] = e;
  }
  const puntos = [...mundo, ...famosos];
  const regiones = { mundo: { d: WORLD_D } };
  regiones.latam = { d: escalaAmbito(puntos.filter((p) => paises[p.cc]?.latam)) };
  for (const c of CONTINENTES) {
    const ps = puntos.filter((p) => paises[p.cc]?.cont === c);
    if (ps.length) regiones[c] = { d: escalaAmbito(ps) };
  }
  const out = { v, generado, metodo: METODO };
  if (ids) out.ids = ids;
  return Object.assign(out, { paises, regiones });
}

// ================================================================ utilidades de archivos

const ahora = () => new Date().toISOString();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const azar = (a, b) => a + Math.random() * (b - a);

function leerJsonl(archivo) {
  if (!existsSync(archivo)) return [];
  return readFileSync(archivo, 'utf8').split('\n').filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
}
const leerJson = (archivo, def) => (existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : def);
const asegurar = (d) => mkdirSync(d, { recursive: true });
/** Escribe de forma atómica (archivo temporal + renombrar). */
function escribirAtomico(archivo, texto) {
  asegurar(dirname(archivo));
  const tmp = `${archivo}.tmp-${process.pid}`;
  writeFileSync(tmp, texto);
  renameSync(tmp, archivo);
}

/** Cargas del visor gastadas: las de validacion.jsonl más las pruebas previas anotadas a mano en cargas-previas.txt. */
export function cargasUsadas() {
  const previas = existsSync(F.previas) ? Number(readFileSync(F.previas, 'utf8').trim()) || 0 : 0;
  return previas + leerJsonl(F.validacion).reduce((s, r) => s + (r.cargas ?? 1), 0);
}

// ================================================================ calles: descarga de teselas (con caché)

const ZOOM_CALLES = 14;
let plantillaTeselas = null;
let colaTeselas = Promise.resolve();
export const estadoTeselas = { bajadas: 0, enCache: 0, fallidas: 0 };

/** Plantilla de URL de las teselas vectoriales de OpenFreeMap (gratis y sin clave; datos de OpenStreetMap). */
async function plantilla() {
  if (plantillaTeselas) return plantillaTeselas;
  const arch = join(F.teselas, 'planet.json');
  if (existsSync(arch)) plantillaTeselas = leerJson(arch).tiles[0];
  else {
    const res = await fetch('https://tiles.openfreemap.org/planet');
    if (!res.ok) throw new Error(`tilejson: HTTP ${res.status}`);
    const j = await res.json();
    escribirAtomico(arch, JSON.stringify(j));
    plantillaTeselas = j.tiles[0];
  }
  return plantillaTeselas;
}

/** Calles de una tesela (z 14): del caché, o bajándola de a una (con una pausa corta, para no cargar el servicio). */
async function callesDeTeselaRed(x, y) {
  const arch = join(F.teselas, `${ZOOM_CALLES}`, `${x}_${y}.json`);
  if (existsSync(arch)) {
    estadoTeselas.enCache++;
    return leerJson(arch);
  }
  const trabajo = colaTeselas.then(async () => {
    const url = (await plantilla()).replace('{z}', ZOOM_CALLES).replace('{x}', x).replace('{y}', y);
    for (let intento = 0; intento < 3; intento++) {
      try {
        const res = await fetch(url);
        if (res.status === 404 || res.status === 204) return [];
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const lineas = callesDeTesela(Buffer.from(await res.arrayBuffer()), ZOOM_CALLES, x, y);
        estadoTeselas.bajadas++;
        await dormir(120);
        return lineas;
      } catch (e) {
        if (intento === 2) throw e;
        await dormir(800 * (intento + 1));
      }
    }
    return [];
  });
  colaTeselas = trabajo.catch(() => {});
  const lineas = await trabajo.catch((e) => {
    estadoTeselas.fallidas++;
    throw e;
  });
  escribirAtomico(arch, JSON.stringify(lineas));
  return lineas;
}

/** Calles (de OpenStreetMap vía OpenFreeMap) a `radioM` metros o menos de un punto. */
export async function callesCerca(lat, lng, radioM = 300) {
  const dLat = radioM / 110574;
  const dLng = radioM / (111320 * Math.cos(lat * RAD));
  const a = teselaDe(lat + dLat, lng - dLng, ZOOM_CALLES);
  const b = teselaDe(lat - dLat, lng + dLng, ZOOM_CALLES);
  const out = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push(...(await callesDeTeselaRed(x, y)));
  return out;
}

// ================================================================ paso: bajar

async function bajar(o) {
  asegurar(NE_DIR);
  for (const [k, nombre] of Object.entries(NE_ARCHIVOS)) {
    const destino = join(NE_DIR, nombre);
    if (existsSync(destino) && !o.forzar) {
      console.log(`ya está: ${nombre} (${(statSync(destino).size / 1e6).toFixed(1)} MB)`);
      continue;
    }
    process.stdout.write(`bajando ${nombre} … `);
    const res = await fetch(NE_BASE + nombre);
    if (!res.ok) throw new Error(`${nombre}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const j = JSON.parse(buf.toString('utf8'));
    if (!Array.isArray(j.features) || !j.features.length) throw new Error(`${nombre}: no es un GeoJSON de colección`);
    escribirAtomico(destino, buf);
    console.log(`${(buf.length / 1e6).toFixed(1)} MB, ${j.features.length} elementos`);
  }
  const dp = join(NE_DIR, PUEBLOS.archivo);
  if (existsSync(dp) && !o.forzar) return console.log(`ya está: ${PUEBLOS.archivo} (${(statSync(dp).size / 1e6).toFixed(1)} MB)`);
  process.stdout.write(`bajando ${PUEBLOS.archivo} (GeoNames, CC BY 4.0) … `);
  const res = await fetch(PUEBLOS.url);
  if (!res.ok) throw new Error(`${PUEBLOS.archivo}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const j = JSON.parse(buf.toString('utf8'));
  if (!Array.isArray(j) || !j[0]?.country) throw new Error(`${PUEBLOS.archivo}: formato inesperado`);
  escribirAtomico(dp, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB, ${j.length} pueblos`);
}

// ================================================================ lectura de Natural Earth

function cargarNE() {
  const dir = (n) => join(NE_DIR, NE_ARCHIVOS[n]);
  for (const n of Object.keys(NE_ARCHIVOS)) if (!existsSync(dir(n))) throw new Error(`Falta ${NE_ARCHIVOS[n]}: corré primero "bajar".`);
  const paises = new Map();
  const juntos = new Map();
  for (const ft of JSON.parse(readFileSync(dir('paises'), 'utf8')).features) {
    const cc = ccDe(ft.properties);
    if (!cc) continue;
    const cont = CONTINENTE_FORZADO[cc] || CONT_NE[ft.properties.CONTINENT];
    const e = juntos.get(cc) || { nombre: ft.properties.NAME, cont, polys: [] };
    e.polys.push(...poligonosDe(ft.geometry));
    juntos.set(cc, e);
  }
  for (const [cc, e] of juntos) paises.set(cc, crearPais(cc, e.nombre, e.cont, e.polys));
  const lugares = JSON.parse(readFileSync(dir('lugares'), 'utf8')).features.map((ft) => {
    const p = ft.properties;
    const cc = ccDe({ ISO_A2_EH: p.ISO_A2, ISO_A2: p.ISO_A2, ADM0_A3: p.ADM0_A3 }) || ccDe({ ADM0_A3: p.ADM0_A3 });
    return { lat: ft.geometry.coordinates[1], lng: ft.geometry.coordinates[0], n: p.NAME, cc, pop: p.POP_MAX || 0 };
  });
  const archPueblos = join(NE_DIR, PUEBLOS.archivo);
  const pueblos = existsSync(archPueblos)
    ? JSON.parse(readFileSync(archPueblos, 'utf8')).map((x) => ({ lat: Number(x.lat), lng: Number(x.lng), cc: x.country, n: x.name }))
    : [];
  return { paises, lugares, pueblos, archivoRutas: dir('rutas') };
}

// ================================================================ paso: candidatos

function listaPaises() {
  return [
    ...PAISES_CORE.map(([cc, cuota]) => ({ cc, cuota, estado: 'core' })),
    ...PAISES_PRUEBA.map((cc) => ({ cc, cuota: CANDIDATOS_PRUEBA, estado: 'prueba' })),
  ];
}

/** Zona donde se buscan candidatos de un país (su rectángulo, recortado si hay un recorte en las semillas). */
function zonaDe(pais, cc) {
  const rec = RECORTES[cc];
  return rec ? [Math.max(pais.bb[0], rec[0]), Math.max(pais.bb[1], rec[1]), Math.min(pais.bb[2], rec[2]), Math.min(pais.bb[3], rec[3])] : pais.bb;
}

function candidatos(o) {
  const semilla = String(o.semilla ?? 'trotamundos-1');
  const { paises, lugares, pueblos, archivoRutas } = cargarNE();
  if (!pueblos.length) throw new Error('Faltan los pueblos de GeoNames: corré "bajar".');
  const objetivos = listaPaises().map((e) => {
    const pais = paises.get(e.cc);
    if (!pais) throw new Error(`País sin polígono en Natural Earth: ${e.cc}`);
    return { ...e, pais, rec: RECORTES[e.cc], zona: zonaDe(pais, e.cc), rutas: [] };
  });
  // puntos sobre las rutas (sin transbordadores ni sendas) repartidos entre los países cuyo rectángulo los contiene
  console.log('leyendo rutas …');
  let nr = 0;
  for (const ft of JSON.parse(readFileSync(archivoRutas, 'utf8')).features) {
    const p = ft.properties;
    if (/Ferry|Track/i.test(p.type || '') || p.ignore === 1) continue;
    const g = ft.geometry;
    const lineas = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of lineas) {
      const bb = bboxAnillo(l);
      const ob = objetivos.filter((x) => bb[0] <= x.zona[2] && bb[2] >= x.zona[0] && bb[1] <= x.zona[3] && bb[3] >= x.zona[1]);
      if (!ob.length) continue;
      for (const pt of densificar(l, 8)) {
        nr++;
        for (const x of ob) if (dentroBB(pt.lng, pt.lat, x.zona)) x.rutas.push(pt);
      }
    }
  }
  console.log(`${nr} puntos de ruta`);
  const out = { v: 2, semilla, generado: ahora(), paises: {} };
  for (const x of objetivos) {
    const minKm = minKmPais(x.zona);
    const prueba = x.estado === 'prueba';
    const cuotaMax = prueba ? PROMOCION.cuota : x.cuota;
    const ne = lugares.filter((l) => l.cc === x.cc).map((l) => ({ lat: l.lat, lng: l.lng, tipo: 'c', pop: l.pop }));
    const gn = pueblos.filter((l) => l.cc === x.cc).map((l) => ({ lat: l.lat, lng: l.lng, tipo: 'g', pop: 0 }));
    const lista = generarCandidatos({
      pais: x.pais,
      rutas: x.rutas,
      pueblos: [...ne, ...gn],
      cantRutas: cuotaMax * 2,
      cantPueblos: Math.max(ne.length, cuotaMax * 4),
      minKm,
      rng: rngFrom(`${semilla}:${x.cc}`),
      recorte: x.rec,
    });
    const calles = generarCandidatosCalles({ pueblos: [...ne, ...gn], cant: Math.max(60, cuotaMax * 5), minKm: Math.max(2, minKm * 0.3), rng: rngFrom(`${semilla}:${x.cc}:s`), recorte: x.rec });
    // puntos de las rutas de Natural Earth (otro sorteo que `r`) que al validar se pegan a la calle real más cercana: cubren el campo entre pueblos
    const viales = generarCandidatos({ pais: x.pais, rutas: x.rutas, pueblos: [], cantRutas: Math.max(40, cuotaMax * 3), minKm: Math.max(2, minKm * 0.5), rng: rngFrom(`${semilla}:${x.cc}:v`), recorte: x.rec }).r.map(([la, ln]) => [la, ln, 'v']);
    out.paises[x.cc] = { cont: x.pais.cont, estado: x.estado, cuota: x.cuota, minKm, ...lista, s: calles, v: viales };
    console.log(`${x.cc} ${x.estado.padEnd(6)} cuota ${String(x.cuota).padStart(3)}  rutas ${String(lista.r.length).padStart(4)}  pueblos ${String(lista.c.length).padStart(4)} (NE ${ne.length}, GeoNames ${gn.length})  calles ${String(calles.length).padStart(4)}  viales ${String(viales.length).padStart(4)}`);
  }
  escribirAtomico(F.candidatos, JSON.stringify(out));
  console.log(`→ ${F.candidatos}`);
}

// ================================================================ navegador (Playwright)

async function cargarPlaywright() {
  const rutas = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const r of rutas) {
    try {
      return await import(r.startsWith('/') ? pathToFileURL(r).href : r);
    } catch {
      /* probar la siguiente */
    }
  }
  throw new Error('No encuentro Playwright. Instalalo o poné PLAYWRIGHT_PATH=/ruta/a/playwright/index.mjs');
}

async function abrirNavegador() {
  const pw = await cargarPlaywright();
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  return pw.chromium.launch({
    proxy: proxy ? { server: proxy } : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

class Bloqueo extends Error {}
let parar = false;
let frenoMotivo = null; // si hubo 8 fallas blandas seguidas (no es un bloqueo de Google)
const limitador = crearLimitador();
const freno = crearFreno();

/** Espera el turno de una carga nueva: nunca más de RITMO_MAX_POR_MIN empezadas en un minuto, entre todos los trabajadores. */
async function turnoDeCarga() {
  for (let w = limitador.espera(); w > 0; w = limitador.espera()) await dormir(w + 20);
  limitador.marcar();
}

/** Anota una falla blanda (tiempo agotado o error de red sin ver la página); a la 8.ª seguida frena todo. */
function fallaBlanda(motivo) {
  if (!freno.falla() || parar) return;
  parar = true;
  frenoMotivo = `${FALLAS_BLANDAS_MAX} fallas blandas seguidas (tiempo agotado o error de red sin llegar a ver la página). Último: ${motivo}`;
}

/**
 * Carga el visor en una página (iframe de google.com/maps/embed dentro de un documento propio, como "Compartir → Insertar").
 * Sin `imagenes` no se descargan imágenes, fuentes ni medios (el texto del visor se lee igual).
 * Devuelve la lectura de leerVisor() más { ms }. Si Google responde con un bloqueo o un desafío, lanza Bloqueo.
 */
async function cargarVisor(ctx, { lat, lng, h = 0 }, { imagenes = false, captura = null, esperaMs = 15000 } = {}) {
  await turnoDeCarga();
  const page = await ctx.newPage();
  let bloqueo = null;
  const t0 = Date.now();
  try {
    if (!imagenes) await page.route('**/*', (r) => (['image', 'font', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    page.on('response', (r) => {
      if (r.status() === 429 || /google\.[a-z.]+\/sorry\//.test(r.url())) bloqueo = `HTTP ${r.status()} ${r.url().slice(0, 100)}`;
    });
    page.on('framenavigated', (f) => {
      if (/google\.[a-z.]+\/sorry\//.test(f.url())) bloqueo = `redirección a ${f.url().slice(0, 100)}`;
    });
    await page.setContent(`<!doctype html><body style="margin:0;background:#111"><iframe src="${embedUrl({ lat, lng, heading: h })}" style="border:0;width:100vw;height:100vh" allow="accelerometer; gyroscope"></iframe></body>`);
    let lec = { estado: 'esperando' };
    while (Date.now() - t0 < esperaMs) {
      await page.waitForTimeout(400);
      if (bloqueo) throw new Bloqueo(bloqueo);
      const fr = page.frames().find((f) => f.url().includes('/maps/embed'));
      if (!fr) continue;
      const dom = await fr.evaluate(() => ({ t: document.body.innerText, l: [...document.querySelectorAll('a')].map((a) => a.href) })).catch(() => null);
      if (!dom) continue;
      lec = leerVisor(dom.t, dom.l);
      if (lec.estado === 'bloqueo') throw new Bloqueo('el visor muestra un desafío ("unusual traffic" o captcha)');
      if (lec.estado !== 'esperando') break;
    }
    if (bloqueo) throw new Bloqueo(bloqueo);
    if (lec.estado === 'esperando') lec = { estado: 'timeout' };
    if (lec.estado === 'timeout') fallaBlanda('el visor no mostró nada en 15 s');
    else freno.ok();
    if (captura && lec.estado === 'ok') {
      await page.waitForTimeout(3500); // que lleguen los mosaicos de la imagen
      asegurar(dirname(captura));
      await page.screenshot({ path: captura, type: 'jpeg', quality: 72 });
    }
    return { ...lec, ms: Date.now() - t0 };
  } catch (e) {
    if (!(e instanceof Bloqueo)) fallaBlanda(String(e.message).slice(0, 80));
    throw e;
  } finally {
    await page.close().catch(() => {});
  }
}

function registrarBloqueo(e) {
  const txt = `${ahora()}\nGoogle respondió con un bloqueo o un desafío: ${e.message}\nSe frenó en el acto y no se insistió. No se esquiva ni se cambia de red.\nPara volver a empezar (más tarde, y a propósito) borrá este archivo.\n`;
  escribirAtomico(F.bloqueo, txt);
  console.error('\n*** BLOQUEO ***\n' + txt);
}

function registrarFreno(motivo) {
  const txt = `${ahora()}\nFreno automático: ${motivo}\nNo es un bloqueo de Google. Mirá la red (o si el visor cambió) antes de seguir; para volver a empezar, borrá este archivo.\n`;
  escribirAtomico(F.freno, txt);
  console.error('\n*** FRENO ***\n' + txt);
}

/** Pool de `n` trabajadores: cada uno pide tareas con siguiente(), las corre y espera 0,5–1,5 s entre cargas. */
async function pool(n, siguiente, ejecutar) {
  const browser = await abrirNavegador();
  let falla = null;
  try {
    await Promise.all(
      Array.from({ length: n }, async () => {
        const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, locale: 'en-US' });
        try {
          while (!parar && !falla) {
            if (existsSync(F.parar)) {
              parar = true;
              break;
            }
            const t = siguiente();
            if (!t) break;
            try {
              await ejecutar(ctx, t);
            } catch (e) {
              if (e instanceof Bloqueo) {
                falla = e;
                parar = true;
                break;
              }
              throw e;
            }
            await dormir(azar(500, 1500));
          }
        } finally {
          await ctx.close().catch(() => {});
        }
      }),
    );
  } finally {
    await browser.close().catch(() => {});
  }
  if (falla) {
    registrarBloqueo(falla);
    process.exitCode = 3;
  } else if (frenoMotivo) {
    registrarFreno(frenoMotivo);
    process.exitCode = 4;
  }
}

function chequearAntes(o) {
  if (existsSync(F.bloqueo)) {
    console.error(`Hay un bloqueo anotado (${F.bloqueo}). No se sigue cargando el visor.`);
    process.exit(3);
  }
  if (existsSync(F.freno)) {
    console.error(`Hay un freno automático anotado (${F.freno}): hubo ${FALLAS_BLANDAS_MAX} fallas blandas seguidas. Revisalo y borrá el archivo para seguir.`);
    process.exit(4);
  }
  if (existsSync(F.parar)) rmSync(F.parar);
  if (process.env.NODE_USE_ENV_PROXY !== '1' && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
    console.warn('Aviso: sin NODE_USE_ENV_PROXY=1 las descargas de Node no usan el proxy del entorno.');
  }
  process.on('SIGINT', () => {
    parar = true;
    console.log('\nfrenando…');
  });
}

const guardar = (rec) => appendFileSync(F.validacion, JSON.stringify(rec) + '\n');

// ================================================================ paso: validar (lugares al azar)

/** Estado de cada país mientras se valida: qué falta, qué ya se probó y cómo viene la tasa de aciertos de rutas y de pueblos. */
function estadoPaises(cand, recs, descartes, ccDePano) {
  const por = {};
  for (const [cc, c] of Object.entries(cand.paises)) {
    const e = {
      cc, estado: c.estado, cuota: c.cuota, minKm: c.minKm, r: c.r, c: c.c, s: c.s || [], v: c.v || [], usadoR: new Set(), usadoC: new Set(), usadoS: new Set(), usadoV: new Set(),
      hechos: new Set(), triedR: 0, hitR: 0, triedC: 0, hitC: 0, triedS: 0, hitS: 0, triedV: 0, hitV: 0, selS: 0, selV: 0, aceptados: 0, panos: [], vuelo: [], enCurso: 0,
    };
    por[cc] = e;
    const mios = recs.filter((r) => r.t === 'm' && r.cc === cc);
    for (const r of mios) anotar(e, r);
    recontar(e, mios, descartes, ccDePano);
  }
  return por;
}

/** Suma un resultado a las cuentas del país (no recalcula los aceptados). */
function anotar(e, r) {
  e.hechos.add(r.k);
  if (r.estado !== 'ok' && r.estado !== 'sin-imagen') return;
  const bien = r.estado === 'ok' && r.oficial;
  if (r.tipo === 'r') {
    e.triedR++;
    if (bien) e.hitR++;
  } else if (r.tipo === 's') {
    e.triedS++;
    if (bien) e.hitS++;
  } else if (r.tipo === 'v') {
    e.triedV++;
    if (bien) e.hitV++;
  } else {
    e.triedC++;
    if (bien) e.hitC++;
  }
}

function recontar(e, mios, descartes, ccDePano) {
  const ac = aceptarMundo(mios.filter((r) => r.estado !== 'error'), { cc: e.cc, minKm: e.minKm, ccDePano, descartes }).aceptados;
  e.aceptados = ac.length;
  e.panos = ac.map((a) => a.pano);
}

const probadosDe = (e) => e.triedR + e.triedC + e.triedS + e.triedV;
const buenosDe = (e) => e.hitR + e.hitC + e.hitS + e.hitV;
const promovido = (e) => e.estado === 'prueba' && probadosDe(e) >= PROMOCION.minProbados && buenosDe(e) >= PROMOCION.minOk;
const cuotaDe = (e) => (promovido(e) ? PROMOCION.cuota : e.cuota);
// Las rutas de Natural Earth están generalizadas: solo caen sobre la calle real en algunos países (EE. UU., Europa occidental, México…).
// Se prueban de a poco y se dejan si fallan 2 de 2 o si, después de 6, aciertan menos de 1 de cada 5.
const rutasSirven = (e) => !(e.triedR >= 2 && e.hitR === 0) && !(e.triedR >= 6 && e.hitR / e.triedR < 0.2);
const rutasBuenas = (e) => e.triedR >= 2 && e.hitR / e.triedR >= 0.4;

/** Próximo candidato de un país (pueblos primero y una ruta de cada 4 para medir), sin tocar lo que queda cerca de un lugar ya aceptado. */
function elegirCandidato(e) {
  const intentos = probadosDe(e) + e.enCurso;
  if (e.estado === 'prueba' && !promovido(e) && intentos >= CANDIDATOS_PRUEBA) return null;
  // Con calles (candidatos pegados a la calle más cercana: pueblos y ciudades 's', puntos de ruta 'v'; ver puntoEnCalle) se usan solo esas
  // listas, dos pueblos por cada punto de ruta. Cada una se corta si fallan 8 de 8 (6 de 6 las de ruta), o si después de 12 aciertan menos de 1 de cada 8.
  if (e.s.length || e.v.length) {
    const sirve = (tried, hit, minSinAcierto) => !(tried >= minSinAcierto && hit === 0) && !(tried >= 12 && hit / tried < 0.125);
    const sOk = e.s.length > 0 && sirve(e.triedS, e.hitS, 8);
    const vOk = e.v.length > 0 && sirve(e.triedV, e.hitV, 6);
    if (!sOk && !vOk) return null;
    const quieroV = vOk && (!sOk || e.selV * 2 < e.selS);
    const orden = quieroV ? ['v', 's'] : ['s', 'v'];
    for (const t of orden) {
      if ((t === 's' && !sOk) || (t === 'v' && !vOk)) continue;
      const c1 = siguienteDeLista(e, t === 's' ? e.s : e.v, t === 's' ? e.usadoS : e.usadoV, t);
      if (c1) {
        e[t === 's' ? 'selS' : 'selV']++;
        return c1;
      }
    }
    return null;
  }
  // 12 intentos sin un solo acierto: se corta para no gastar cargas. NO significa que el país no tenga cobertura oficial
  // (los candidatos pueden caer fuera del radio del visor): hay que probar puntos sobre calles de la capital antes de darlo por vacío.
  if (probadosDe(e) >= 12 && buenosDe(e) === 0) return null;
  if (!rutasSirven(e) && e.triedC >= 10 && e.hitC / e.triedC < 0.15) return null;
  if (rutasSirven(e) && probadosDe(e) >= 16 && buenosDe(e) / probadosDe(e) < 0.1) return null;
  // pueblos primero; una ruta de cada 4 para medir (o una de cada 2 si las rutas del país andan bien)
  const quieroRuta = rutasSirven(e) && e.r.length > 0 && (rutasBuenas(e) ? intentos % 2 === 1 : intentos % 4 === 3);
  const tipos = quieroRuta ? ['r', 'c'] : ['c', 'r'];
  for (const t of tipos) {
    const t1 = siguienteDeLista(e, t === 'r' ? e.r : e.c, t === 'r' ? e.usadoR : e.usadoC, t);
    if (t1) return t1;
  }
  return null;
}

/** Primer candidato sin usar de una lista que no queda cerca de un lugar aceptado ni de otro en vuelo, y que no se probó antes. */
function siguienteDeLista(e, lista, usado, t) {
  for (let i = 0; i < lista.length; i++) {
    if (usado.has(i)) continue;
    const [lat, lng, x] = lista[i];
    if (!respetaDistancia(lat, lng, e.panos, e.minKm)) {
      usado.add(i); // queda cerca de uno ya aceptado: no hace falta cargarlo
      continue;
    }
    if (!respetaDistancia(lat, lng, e.vuelo, e.minKm)) continue;
    const clave = claveDe('m', lat, lng);
    if (e.hechos.has(clave)) {
      usado.add(i);
      continue;
    }
    usado.add(i);
    return { tipo: t === 'r' ? 'r' : t === 's' || t === 'v' ? t : x, i, lat, lng, h: t === 'r' ? x : null };
  }
  return null;
}

async function validar(o) {
  chequearAntes(o);
  asegurar(CACHE);
  if (!existsSync(F.candidatos)) throw new Error('Falta candidatos.json: corré primero "candidatos".');
  const solo = o.solo || 'mundo';
  const max = Number(o['max-cargas'] ?? MAX_CARGAS);
  const conc = Math.min(CONCURRENCIA, Number(o.conc ?? CONCURRENCIA));
  if (solo === 'famosos') return validarFamosos(o, max, conc);
  const cand = leerJson(F.candidatos);
  const { paises } = cargarNE();
  const ccDePano = (lng, lat) => paisDe(lng, lat, [...paises.values()].filter((p) => dentroBB(lng, lat, p.bb)));
  const descartes = new Set(leerJson(F.descartes, []));
  const recs = leerJsonl(F.validacion);
  let usadas = cargasUsadas();
  const sel = o.pais ? new Set(String(o.pais).split(',')) : null;
  const por = estadoPaises(cand, recs, descartes, ccDePano);
  let enVuelo = 0;
  const siguiente = () => {
    if (usadas + enVuelo >= max) return null;
    const orden = Object.values(por)
      .filter((e) => (!sel || sel.has(e.cc)) && !e.agotado && e.aceptados + e.enCurso < cuotaDe(e))
      .map((e) => ({ e, ratio: (e.aceptados + e.enCurso) / cuotaDe(e) + Math.random() * 1e-3 }))
      .sort((a, b) => a.ratio - b.ratio);
    for (const { e } of orden) {
      const t = elegirCandidato(e);
      if (!t) {
        if (e.enCurso === 0) e.agotado = true; // sin más candidatos útiles
        continue;
      }
      e.enCurso++;
      e.vuelo.push(t);
      enVuelo++;
      return { e, t };
    }
    return null;
  };
  let hechas = 0;
  await pool(conc, siguiente, async (ctx, { e, t }) => {
    const base = { t: 'm', k: claveDe('m', t.lat, t.lng), cc: e.cc, i: t.i, lat: t.lat, lng: t.lng, tipo: t.tipo };
    const soltar = () => {
      e.enCurso--;
      enVuelo--;
      e.vuelo = e.vuelo.filter((x) => x !== t);
    };
    let rec;
    try {
      let busca = { lat: t.lat, lng: t.lng, h: t.h ?? 0 };
      if (t.tipo === 's' || t.tipo === 'v') {
        // se pega a la calle más cercana del pueblo (si no hay ninguna a 400 m, no se gasta una carga)
        let calles;
        try {
          calles = await callesCerca(t.lat, t.lng, 400);
        } catch (errTesela) {
          // no se pudo bajar la tesela: no se gastó ninguna carga ni se anota nada (se puede reintentar); cuenta como falla blanda
          fallaBlanda(`teselas de calles: ${String(errTesela.message).slice(0, 60)}`);
          soltar();
          return;
        }
        const sp = puntoEnCalle(t.lat, t.lng, calles, { radioM: 400, rng: t.tipo === 's' ? rngFrom(base.k) : null });
        if (!sp) {
          rec = { ...base, estado: 'sin-calle', cargas: 0, ts: ahora() };
          guardar(rec);
          recs.push(rec);
          anotar(e, rec);
          soltar();
          return;
        }
        t.h = (sp.h + (rngFrom(base.k + 'h')() < 0.5 ? 0 : 180)) % 360;
        busca = { lat: sp.lat, lng: sp.lng, h: t.h };
        base.sp = [sp.lat, sp.lng];
        base.calle = sp.c;
      }
      const l = await cargarVisor(ctx, busca);
      rec = { ...base, estado: l.estado, attr: l.attr ?? null, oficial: l.oficial ?? false, card: l.card ?? null, pano: l.pano ?? null, ms: l.ms, cargas: 1, ts: ahora() };
      if (rec.pano) rec.dist = Math.round(distanceKm(busca.lat, busca.lng, rec.pano.lat, rec.pano.lng) * 1000) / 1000;
      if (t.h != null) rec.h = t.h;
    } catch (err) {
      soltar();
      if (err instanceof Bloqueo) throw err;
      rec = { ...base, estado: 'error', error: String(err.message).slice(0, 120), cargas: 1, ts: ahora() };
      guardar(rec);
      recs.push(rec);
      usadas++;
      return;
    }
    guardar(rec);
    recs.push(rec);
    usadas++;
    soltar();
    anotar(e, rec);
    recontar(e, recs.filter((r) => r.t === 'm' && r.cc === e.cc), descartes, ccDePano);
    hechas++;
    if (hechas % 20 === 0) {
      const tot = Object.values(por);
      console.log(`[${new Date().toISOString().slice(11, 19)}] cargas ${usadas}/${max}  aceptados ${tot.reduce((s, x) => s + Math.min(x.aceptados, cuotaDe(x)), 0)}/${tot.reduce((s, x) => s + cuotaDe(x), 0)}  último ${e.cc}/${rec.tipo} ${rec.estado}${rec.estado === 'ok' && !rec.oficial ? '(no oficial)' : ''}`);
    }
  });
  console.log(`listo. cargas usadas: ${usadas} de ${max}. Corré "informe" para ver el avance.`);
}

// ================================================================ validación de famosos

const idFamoso = (i) => `f-${String(i + 1).padStart(3, '0')}`;

/** Lecturas del visor de un famoso, en el orden en que se hicieron: 'f' (la primera tanda) y 'fp' (las sondas desde calles cercanas). */
export const sondasDe = (recs, id) => recs.filter((r) => (r.t === 'f' || r.t === 'fp') && r.id === id);

/**
 * Primera lectura que sirve para un famoso: foto oficial a menos de MAX_SITIO_KM del sitio y no descartada en la revisión visual.
 * `rev` = { ok: [pid…], no: { pid: motivo } } (revisados.json). Con `exigirRevision`, además tiene que estar aprobada a ojo.
 */
export function elegirSonda(sondas, op = {}, rev = {}, { exigirRevision = false } = {}) {
  for (const r of sondas) {
    if (motivoFamoso(r, op) !== null) continue;
    const pid = r.pano?.pid;
    if (rev?.no?.[pid]) continue;
    if (exigirRevision && !rev?.ok?.includes(pid)) continue;
    return r;
  }
  return null;
}

async function validarFamosos(o, max, conc) {
  const recs = leerJsonl(F.validacion);
  const rev = leerJson(F.revisados, {});
  const sel = o.id ? new Set(String(o.id).split(',')) : null;
  const selCc = o.pais ? new Set(String(o.pais).split(',')) : null;
  const maxSondas = Number(o.sondas ?? 6);
  const sitios = FAMOSOS.map((f, i) => ({ f, i, id: idFamoso(i), op: f[5] || {} })).filter((x) => !x.op.x && (!sel || sel.has(x.id)) && (!selCc || selCc.has(x.f[0])));
  for (const st of sitios) {
    st.sondas = sondasDe(recs, st.id);
    st.caps = recs.filter((r) => r.t === 'fs' && r.id === st.id && r.shot);
    st.enCurso = false;
    st.agotado = false;
  }
  const elegida = (st) => elegirSonda(st.sondas, st.op, rev[st.id]);
  // la captura de la lectura elegida: de la primera tanda (sin pid, anterior a la lectura) o de una sonda nueva (con su pid)
  const tieneCaptura = (st, r) => st.caps.some((c) => (c.pid ? c.pid === r.pano.pid : c.ts >= r.ts));
  const quedaPorHacer = (st) => !st.enCurso && !st.agotado && ((elegida(st) && !tieneCaptura(st, elegida(st))) || (!elegida(st) && st.sondas.length < maxSondas));
  let usadas = cargasUsadas();
  const siguiente = () => {
    if (usadas + 2 > max) return null;
    const cand = sitios.filter(quedaPorHacer);
    if (!cand.length) return null;
    // primero lo que ya tiene foto oficial y falta la captura; después los que menos sondas llevan
    cand.sort((a, b) => Number(!!elegida(b)) - Number(!!elegida(a)) || a.sondas.length - b.sondas.length || a.i - b.i);
    const st = cand[0];
    st.enCurso = true;
    return st;
  };
  const capturar = async (ctx, st, r) => {
    const [, , , lat, lng] = st.f;
    const pid = r.pano.pid || 'sin-pid';
    const nombre = `shots/${st.id}-${pid.slice(0, 8)}.jpg`;
    let l;
    try {
      l = await cargarVisor(ctx, { lat: r.pano.lat, lng: r.pano.lng, h: r.h ?? 0 }, { imagenes: true, captura: join(CACHE, nombre) });
    } catch (err) {
      if (err instanceof Bloqueo) throw err;
      l = { estado: 'error' };
    }
    usadas++;
    const fs = { t: 'fs', id: st.id, pid, estado: l.estado, attr: l.attr ?? null, oficial: l.oficial ?? false, card: l.card ?? null, h: r.h ?? null, shot: l.estado === 'ok' ? nombre : null, cargas: 1, ts: ahora() };
    guardar(fs);
    st.caps.push(fs);
    if (l.estado === 'ok' && !l.oficial) {
      // al volver a cargar el punto de la foto el visor eligió otra panorámica, de un usuario (hay una pegada): el juego mostraría esa; se descarta sola
      const e = (rev[st.id] ||= { ok: [], no: {} });
      e.no[pid] = `al recargar el punto de la foto el visor muestra una foto de usuario (${l.attr})`;
      escribirAtomico(F.revisados, JSON.stringify(rev, null, 1));
    }
    void lat;
    void lng;
  };
  const sondear = async (ctx, st) => {
    const [cc, es, en, lat, lng] = st.f;
    const op = st.op;
    if (!st.calles) st.calles = await callesCerca(lat, lng, 260).catch(() => []);
    let p;
    if (!st.sondas.length && op.v) p = { lat: op.v[0], lng: op.v[1], dist: Math.round(distanceKm(op.v[0], op.v[1], lat, lng) * 1000), c: 'v' };
    else p = sondasFamoso({ lat, lng }, st.calles, { n: 1, probados: st.sondas.map((r) => ({ lat: r.lat, lng: r.lng })) })[0];
    if (!p) {
      st.agotado = true; // no quedan puntos nuevos para probar
      return;
    }
    const h0 = op.h ?? (p.dist > 20 ? Math.round(bearingDeg(p.lat, p.lng, lat, lng)) % 360 : 0);
    let rec;
    try {
      const l = await cargarVisor(ctx, { lat: p.lat, lng: p.lng, h: h0 });
      rec = { t: 'fp', id: st.id, k: claveDe('f', p.lat, p.lng), cc, lat: p.lat, lng: p.lng, desp: p.dist, calle: p.c, estado: l.estado, attr: l.attr ?? null, oficial: l.oficial ?? false, card: l.card ?? null, pano: l.pano ?? null, cargas: 1, ts: ahora() };
      if (l.pano) {
        rec.dist = Math.round(distanceKm(p.lat, p.lng, l.pano.lat, l.pano.lng) * 1000) / 1000;
        rec.distSitio = Math.round(distanceKm(lat, lng, l.pano.lat, l.pano.lng) * 1000) / 1000;
        rec.h = op.h ?? rumboHaciaSitio(l.pano, { lat, lng });
        rec.tarjetaOk = coincideNombre(l.card, [es, en]);
      }
    } catch (err) {
      if (err instanceof Bloqueo) throw err;
      rec = { t: 'fp', id: st.id, k: claveDe('f', p.lat, p.lng), cc, lat: p.lat, lng: p.lng, desp: p.dist, estado: 'error', error: String(err.message).slice(0, 120), cargas: 1, ts: ahora() };
    }
    guardar(rec);
    usadas++;
    st.sondas.push(rec);
  };
  let n = 0;
  await pool(conc, siguiente, async (ctx, st) => {
    try {
      let r = elegida(st);
      if (!r) {
        await sondear(ctx, st);
        r = elegida(st);
      }
      if (r && !tieneCaptura(st, r)) await capturar(ctx, st, r);
    } finally {
      st.enCurso = false;
    }
    n++;
    if (n % 10 === 0) console.log(`[${new Date().toISOString().slice(11, 19)}] famosos: ${n} pasos, con foto oficial ${sitios.filter((x) => elegida(x)).length}/${sitios.length}  cargas ${usadas}/${max}`);
  });
  console.log(`listo. cargas usadas: ${usadas} de ${max}. Con foto oficial a menos de ${MAX_SITIO_KM * 1000} m: ${sitios.filter((x) => elegida(x)).length} de ${sitios.length} sitios.`);
}

// ================================================================ paso: auditar (muestra con imágenes para mirar a ojo)

async function auditar(o) {
  chequearAntes(o);
  const n = Number(o.n ?? 48);
  const recs = leerJsonl(F.validacion);
  const cand = leerJson(F.candidatos);
  const ya = new Set(recs.filter((r) => r.t === 'a').map((r) => r.k));
  const buenos = recs.filter((r) => r.t === 'm' && r.estado === 'ok' && r.oficial && !ya.has(r.k) && (!o.desde || r.ts >= String(o.desde)));
  const rng = rngFrom(String(o.semilla ?? 'auditoria'));
  const orden = buenos.map((r) => [rng(), r]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const cola = orden.slice(0, n);
  const max = Number(o['max-cargas'] ?? MAX_CARGAS);
  let usadas = cargasUsadas();
  void cand;
  await pool(Math.min(CONCURRENCIA, Number(o.conc ?? CONCURRENCIA)), () => (usadas >= max ? null : cola.shift() || null), async (ctx, r) => {
    const nombre = `${r.cc}-${r.pano.pid || r.k.replace(/\D+/g, '_')}`.replace(/[^A-Za-z0-9_-]/g, '_');
    const arch = join(F.shots, 'auditoria', `${nombre}.jpg`);
    let l;
    try {
      l = await cargarVisor(ctx, { lat: r.pano.lat, lng: r.pano.lng, h: r.h ?? 0 }, { imagenes: true, captura: arch });
    } catch (err) {
      if (err instanceof Bloqueo) throw err;
      l = { estado: 'error' };
    }
    guardar({ t: 'a', k: r.k, cc: r.cc, estado: l.estado, attr: l.attr ?? null, card: l.card ?? null, shot: l.estado === 'ok' ? `shots/auditoria/${nombre}.jpg` : null, cargas: 1, ts: ahora() });
    usadas++;
  });
  console.log(`listo. cargas usadas: ${usadas} de ${max}. Corré "hojas --que auditoria".`);
}

// ================================================================ paso: hojas de contactos

async function hojas(o) {
  const que = o.que || 'famosos';
  const por = Number(o.por ?? 12);
  const recs = leerJsonl(F.validacion);
  let items = [];
  if (que === 'famosos') {
    const rev = leerJson(F.revisados, {});
    const sel = o.id ? new Set(String(o.id).split(',')) : null;
    items = [];
    FAMOSOS.forEach((f, i) => {
      const id = idFamoso(i);
      if (f[5]?.x || (sel && !sel.has(id))) return;
      const sondas = sondasDe(recs, id);
      const r = elegirSonda(sondas, f[5] || {}, rev[id]);
      if (!r) return;
      const hecha = rev[id]?.ok?.includes(r.pano?.pid);
      if (o.pendientes && hecha) return;
      const fs = recs.filter((x) => x.t === 'fs' && x.id === id && x.shot && (x.pid ? x.pid === r.pano.pid : x.ts >= r.ts)).pop();
      if (!fs) return;
      const m = Math.round((r.distSitio ?? r.dist ?? 0) * 1000);
      items.push({ img: join(CACHE, fs.shot), t1: `${id} ${f[0]} · ${f[2]}`, t2: `${fs.attr || ''} · sitio a ${m} m${r.desp != null ? `, sonda a ${r.desp} m` : ''} · tarjeta${r.tarjetaOk ? ' OK' : ' ?'}: ${(fs.card || '').slice(0, 40)}${hecha ? ' · revisado' : ''}` });
    });
  } else {
    items = recs.filter((r) => r.t === 'a' && r.shot).map((r) => ({ img: join(CACHE, r.shot), t1: `${r.cc} ${r.k}`, t2: `${r.attr || ''} · ${(r.card || '').slice(0, 60)}` }));
  }
  if (!items.length) return console.log('no hay capturas para mostrar');
  asegurar(F.hojas);
  const prefijo = `${que}${o.pendientes ? '-pend' : ''}-`;
  for (const n of readdirSync(F.hojas)) if (n.startsWith(prefijo) && /-\d+\.(html|png)$/.test(n)) rmSync(join(F.hojas, n));
  const browser = await abrirNavegador();
  const ctx = await browser.newContext({ viewport: { width: 1760, height: 900 } });
  const page = await ctx.newPage();
  const cols = 4;
  for (let s = 0; s * por < items.length; s++) {
    const trozo = items.slice(s * por, (s + 1) * por);
    const celdas = trozo.map((it) => `<figure><img src="${pathToFileURL(it.img).href}"><figcaption><b>${it.t1.replace(/</g, '&lt;')}</b><br>${it.t2.replace(/</g, '&lt;')}</figcaption></figure>`).join('');
    const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#fff;font:13px sans-serif}main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px}figure{margin:0}img{width:100%;aspect-ratio:8/5;object-fit:cover;display:block}figcaption{padding:2px 0;line-height:1.25}</style><main>${celdas}</main>`;
    const arch = join(F.hojas, `${que}${o.pendientes ? '-pend' : ''}-${String(s + 1).padStart(2, '0')}.html`);
    writeFileSync(arch, html);
    await page.goto(pathToFileURL(arch).href);
    await page.waitForTimeout(600);
    const png = arch.replace(/\.html$/, '.png');
    await page.screenshot({ path: png, fullPage: true });
    console.log(png);
  }
  await browser.close();
}

// ================================================================ paso: revisar (aprobar o descartar famosos mirando las hojas de contactos)

function revisar(o) {
  const recs = leerJsonl(F.validacion);
  const rev = leerJson(F.revisados, {});
  const idx = (id) => Number(String(id).slice(2)) - 1;
  const elegida = (id) => (FAMOSOS[idx(id)] ? elegirSonda(sondasDe(recs, id), FAMOSOS[idx(id)][5] || {}, rev[id]) : null);
  const marcar = (id, ok, motivo) => {
    const r = elegida(id);
    if (!r) return console.warn(`${id}: no hay una foto oficial pendiente para revisar`);
    const e = (rev[id] ||= { ok: [], no: {} });
    const pid = r.pano.pid;
    if (ok) {
      if (!e.ok.includes(pid)) e.ok.push(pid);
      delete e.no[pid];
    } else {
      e.no[pid] = motivo || 'descartado a ojo';
      e.ok = e.ok.filter((x) => x !== pid);
    }
  };
  const lista = (v) => (v && v !== true ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : []);
  if (o['aceptar-actuales']) {
    // los famosos que ya estaban publicados se revisaron a ojo en la tanda anterior
    for (const x of leerJson(join(DATOS, 'famosos.json'), [])) {
      const r = sondasDe(recs, x.id).find((q) => q.pano && r5(q.pano.lat) === x.lat && r5(q.pano.lng) === x.lng);
      if (!r) continue;
      const e = (rev[x.id] ||= { ok: [], no: {} });
      if (!e.ok.includes(r.pano.pid)) e.ok.push(r.pano.pid);
    }
  }
  for (const entrada of lista(o.no)) {
    const [id, ...m] = entrada.split('=');
    marcar(id, false, m.join('=') || o.motivo);
  }
  if (o.ok === 'pendientes') {
    FAMOSOS.forEach((f, i) => {
      const id = idFamoso(i);
      const r = elegida(id);
      if (r && !rev[id]?.ok?.includes(r.pano.pid)) marcar(id, true);
    });
  } else for (const id of lista(o.ok)) marcar(id, true);
  escribirAtomico(F.revisados, JSON.stringify(rev, null, 1));
  const ok = Object.values(rev).reduce((n, e) => n + e.ok.length, 0);
  const no = Object.values(rev).reduce((n, e) => n + Object.keys(e.no).length, 0);
  console.log(`revisados.json: ${ok} aprobados, ${no} descartados a ojo`);
}

// ================================================================ paso: armar

/** Por qué un famoso no entra al conjunto (null = entra): tiene que haberse validado, tener imagen oficial (© Google) y estar cerca del sitio. */
export function motivoFamoso(r, op = {}) {
  if (!r) return 'sin validar';
  if (r.estado !== 'ok') return r.estado;
  if (!r.oficial) return `panorámica de usuario (${r.attr ?? 'sin atribución'}), no © Google`;
  const d = r.distSitio ?? r.dist;
  return d > (op.max ?? MAX_SITIO_KM) ? `la panorámica más cercana está a ${d} km` : null;
}

/**
 * Ids de los lugares de mundo.json. Los que ya estaban (misma posición) conservan el suyo; los nuevos siguen desde `maxHistorico`
 * (el id más alto que se usó alguna vez, aunque ese lugar ya no esté), así nunca se reutiliza el id de uno que se sacó.
 * lugares = [{ lat, lng }] → { ids: ['m-0001', …] en el mismo orden, max: id más alto ahora }.
 */
export function asignarIds(lugares, idPrevio, maxHistorico = 0) {
  const usados = new Set();
  const ids = lugares.map((x) => {
    const id = idPrevio.get(`${x.lat},${x.lng}`);
    if (id && !usados.has(id)) {
      usados.add(id);
      return id;
    }
    return null;
  });
  let max = Math.max(maxHistorico, ...[...usados].map((id) => Number(id.slice(2))), 0);
  return { ids: ids.map((id) => id || `m-${String(++max).padStart(4, '0')}`), max };
}

/**
 * Versión y fecha de paises.json: si el contenido (famosos, mundo, países y regiones) no cambió respecto de lo que ya estaba escrito,
 * quedan la versión y la fecha de antes; si cambió, la versión sube en 1 (o es `forzar`), con un piso de VERSION_DATOS.
 */
export function decidirVersion({ prevMeta, prevFam, prevMundo, famosos, mundo, meta, forzar }) {
  const contenido = (f, m, pm) => JSON.stringify([f, m, pm?.paises, pm?.regiones]);
  const igual = !!prevMeta && contenido(prevFam, prevMundo, prevMeta) === contenido(famosos, mundo, meta);
  if (igual) return { v: prevMeta.v, generado: prevMeta.generado, igual };
  return { v: forzar ? Number(forzar) : Math.max((prevMeta?.v ?? 0) + 1, VERSION_DATOS), generado: meta.generado, igual };
}

/** Números de id de un prefijo en una lista: el mayor. */
const mayorId = (lista, pref) => lista.reduce((m, x) => (String(x.id).startsWith(pref) ? Math.max(m, Number(String(x.id).slice(pref.length))) : m), 0);

function datosFinales(o) {
  const { paises, lugares } = cargarNE();
  const cand = leerJson(F.candidatos);
  const recs = leerJsonl(F.validacion);
  const descartes = new Set(leerJson(F.descartes, []));
  const rev = leerJson(F.revisados, {});
  const minPorPais = Number(o['min-por-pais'] ?? 5);
  const geoCc = (lng, lat) => paisDe(lng, lat, [...paises.values()].filter((p) => dentroBB(lng, lat, p.bb)));
  const prevMeta = leerJson(join(DATOS, 'paises.json'), null);
  const prevFam = leerJson(join(DATOS, 'famosos.json'), []);
  // --- famosos: solo entran los que tienen foto oficial cerca del sitio Y se aprobaron a ojo (hojas de contactos + "revisar")
  const famosos = [];
  const famDescartados = [];
  const famPendientes = [];
  FAMOSOS.forEach((f, i) => {
    const [cc, es, en, lat, lng, op = {}] = f;
    const id = idFamoso(i);
    const no = (motivo) => famDescartados.push({ id, cc, nombre: en, motivo });
    if (op.x) return no(`descartado a mano: ${op.x}`);
    const sondas = sondasDe(recs, id);
    if (!sondas.length) return no('sin validar');
    const r = elegirSonda(sondas, op, rev[id], { exigirRevision: true });
    if (!r) {
      if (elegirSonda(sondas, op, rev[id])) {
        famPendientes.push(id);
        return no('pendiente de revisión visual');
      }
      const aOjo = Object.values(rev[id]?.no || {});
      return no(aOjo.length ? `revisión visual: ${aOjo.join('; ')}` : `${motivoFamoso(sondas[sondas.length - 1], op)} (${sondas.length} ${sondas.length === 1 ? 'lectura' : 'lecturas'})`);
    }
    const e = { id, lat: r5(r.pano.lat), lng: r5(r.pano.lng), cc, n: { es, en } };
    if (r.h != null) e.h = r.h;
    const dm = Math.round((r.distSitio ?? r.dist ?? 0) * 1000);
    if (dm >= 30) e.dm = dm; // desplazamiento: a cuántos metros del sitio está la foto oficial que se usa
    const cerca = famosos.find((x) => distanceKm(x.lat, x.lng, e.lat, e.lng) < 0.06);
    if (cerca) return no(`a menos de 60 m de ${cerca.id} (${cerca.n.en})`);
    famosos.push(e);
  });
  // --- mundo
  const mundo = [];
  const rechazos = {};
  const prev = leerJson(join(DATOS, 'mundo.json'), []);
  const idPrevio = new Map(prev.map((m) => [`${m.lat},${m.lng}`, m.id]));
  const ordenCc = Object.keys(cand.paises).sort();
  const crudos = [];
  const lugaresPorCc = new Map();
  for (const l of lugares) {
    const cc = geoCc(l.lng, l.lat);
    if (!lugaresPorCc.has(cc)) lugaresPorCc.set(cc, []);
    lugaresPorCc.get(cc).push(l);
  }
  for (const cc of ordenCc) {
    const c = cand.paises[cc];
    const mios = recs.filter((r) => r.t === 'm' && r.cc === cc && r.estado !== 'error');
    const { aceptados, rechazados } = aceptarMundo(mios, { cc, minKm: c.minKm, ccDePano: geoCc, descartes });
    rechazos[cc] = rechazados;
    const tope = aceptados.slice(0, Math.max(c.cuota, c.estado === 'prueba' ? PROMOCION.cuota : 0) + 3);
    if (tope.length < minPorPais) {
      rechazos[cc].excluido = `solo ${tope.length} lugares validados (mínimo ${minPorPais})`;
      continue;
    }
    for (const r of tope) crudos.push({ cc, r });
  }
  // ids estables: los lugares que ya estaban conservan el suyo; los nuevos siguen desde el máximo HISTÓRICO de cada prefijo
  // (el de paises.json "ids", los de los archivos anteriores y los de ahora), así nunca se reutiliza el id de uno que se sacó
  const posiciones = crudos.map((x) => ({ lat: r5(x.r.pano.lat), lng: r5(x.r.pano.lng) }));
  const asignados = asignarIds(posiciones, idPrevio, Math.max(prevMeta?.ids?.m ?? 0, mayorId(prev, 'm-')));
  const maxId = asignados.max;
  crudos.forEach((x, i) => {
    x.id = asignados.ids[i];
    const { lat, lng } = posiciones[i];
    const e = { id: x.id, lat, lng, cc: x.cc };
    if (x.r.h != null) e.h = x.r.h;
    // solo pueblos del mismo país y a menos de 40 km; si no hay, no se pone `p`
    const p = lugarMasCercano(lat, lng, lugaresPorCc.get(x.cc) || [], 40);
    if (p) e.p = p;
    mundo.push(e);
  });
  mundo.sort((a, b) => a.id.localeCompare(b.id));
  const ids = { f: Math.max(prevMeta?.ids?.f ?? 0, mayorId(prevFam, 'f-'), FAMOSOS.length), m: Math.max(maxId, mayorId(mundo, 'm-')) };
  // --- países
  const geo = new Map();
  for (const [cc, p] of paises) geo.set(cc, { cont: p.cont, d: escalaPais(p, RECORTES[cc]), k: minKmPais(zonaDe(p, cc)) });
  const generado = String(o.fecha || new Date().toISOString().slice(0, 10));
  const meta = construirPaises({ famosos, mundo, geo, generado, ids });
  // la versión sube solo si cambió el contenido (famosos, mundo, países o regiones); si no, quedan la versión y la fecha de antes
  const { v, generado: fecha, igual } = decidirVersion({ prevMeta, prevFam, prevMundo: prev, famosos, mundo, meta, forzar: o.version });
  meta.v = v;
  meta.generado = fecha;
  return { famosos, mundo, meta, rechazos, famDescartados, famPendientes, recs, igual };
}

const CREDITOS = `Trotamundos — créditos de los datos

Estos archivos los genera tools/trotamundos-datos.mjs (ver "node tools/trotamundos-datos.mjs --help").

- Natural Earth (https://www.naturalearthdata.com/): países, rutas y lugares poblados a escala 1:10m. Dominio público.
  Se usaron para elegir puntos candidatos, calcular las escalas de cada país y nombrar el lugar poblado más cercano ("p").
- GeoNames (https://www.geonames.org/), licencia CC BY 4.0, a través de https://github.com/lutangar/cities.json: pueblos y ciudades que
  se usaron solo para elegir puntos candidatos. Las rutas de Natural Earth están generalizadas y casi nunca caen a menos de ~50 m de
  la calle real, así que los candidatos salen de pueblos y ciudades y se pegan a la calle más cercana (ver más abajo).
- Los lugares de mundo.json se validaron cargando el visor de Street View de Google ("Compartir → Insertar") como lo haría una persona,
  aceptando solo imágenes oficiales (© Google). Las imágenes en sí no se guardan ni se redistribuyen: el juego las muestra desde el visor de Google.
  Se guardan solo coordenadas (la posición de la panorámica) y datos propios.
- Las calles desde donde se probó el visor (para pegar cada candidato a una calle real y para buscar una foto oficial cerca de los sitios
  famosos) salen de las teselas vectoriales de OpenFreeMap (https://openfreemap.org/) con datos de OpenStreetMap (© colaboradores de
  OpenStreetMap, ODbL). Solo se usaron para elegir puntos de prueba: las calles no forman parte de estos archivos.
- famosos.json: la lista de sitios, los nombres y el rumbo son propios. Las coordenadas salen de la posición de la panorámica oficial
  más cercana al sitio, a menos de 250 m (hechos geográficos, sin derechos de autor). "dm" = a cuántos metros del sitio está esa foto,
  cuando son 30 m o más (el desplazamiento).
- paises.json: "k" = distancia mínima en km entre dos lugares del mismo país; "ids" = el id más alto que se usó alguna vez de cada
  prefijo (f, m), para que un lugar nuevo nunca reutilice el id de uno que se sacó.
- El mapa donde se marca la respuesta es OpenFreeMap (https://openfreemap.org/) con datos de OpenStreetMap (© colaboradores de OpenStreetMap, ODbL).
  No forma parte de estos archivos.
`;

function armar(o) {
  const { famosos, mundo, meta, rechazos, famDescartados, famPendientes, igual } = datosFinales(o);
  const salidas = {
    'famosos.json': lineasJson(famosos),
    'mundo.json': lineasJson(mundo),
    'paises.json': serializarPaises(meta),
    'CREDITOS.txt': CREDITOS,
  };
  const bytes = Object.values(salidas).reduce((s, t) => s + Buffer.byteLength(t), 0);
  if (bytes >= MAX_BYTES) throw new Error(`datos/ pesaría ${bytes} bytes (el máximo es ${MAX_BYTES})`);
  if (o['en-seco']) {
    console.log(`(en seco) famosos ${famosos.length}, mundo ${mundo.length}, países ${Object.keys(meta.paises).length}, ${bytes} bytes · v ${meta.v}${igual ? ' (sin cambios)' : ' (cambió el contenido)'}${famPendientes.length ? ` · ${famPendientes.length} famosos pendientes de revisión: ${famPendientes.join(', ')}` : ''}`);
    return;
  }
  // todo junto al final: primero se escriben los temporales de los cuatro y después se renombran
  asegurar(DATOS);
  const tmp = Object.entries(salidas).map(([n, t]) => {
    const a = join(DATOS, n);
    const x = `${a}.tmp-${process.pid}`;
    writeFileSync(x, t);
    return [x, a];
  });
  for (const [x, a] of tmp) renameSync(x, a);
  console.log(`famosos ${famosos.length}, mundo ${mundo.length}, países ${Object.keys(meta.paises).length}, ${bytes} bytes → ${DATOS} · v ${meta.v}${igual ? ' (sin cambios)' : ' (cambió el contenido)'}${famPendientes.length ? ` · ${famPendientes.length} famosos pendientes de revisión` : ''}`);
  void rechazos;
  void famDescartados;
}

// ================================================================ paso: informe

function informe(o) {
  const { famosos, mundo, meta, rechazos, famDescartados, famPendientes, recs } = datosFinales({ ...o });
  const cand = leerJson(F.candidatos, { paises: {} });
  const m = recs.filter((r) => r.t === 'm');
  const cuenta = (arr, f) => arr.filter(f).length;
  const probados = cuenta(m, (r) => r.estado === 'ok' || r.estado === 'sin-imagen');
  const oficiales = cuenta(m, (r) => r.estado === 'ok' && r.oficial);
  console.log('== Lugares al azar (mundo.json) ==');
  console.log(`candidatos cargados: ${m.length} (con respuesta ${probados})`);
  console.log(`  sin imagen: ${cuenta(m, (r) => r.estado === 'sin-imagen')}`);
  console.log(`  con imagen de usuario (no oficial): ${cuenta(m, (r) => r.estado === 'ok' && !r.oficial)}`);
  console.log(`  con imagen oficial: ${oficiales}  (${probados ? ((100 * oficiales) / probados).toFixed(1) : 0} % de los que respondieron)`);
  console.log(`  errores o tiempo agotado: ${cuenta(m, (r) => r.estado === 'error' || r.estado === 'timeout')}`);
  console.log(`aceptados finales: ${mundo.length} (${probados ? ((100 * mundo.length) / probados).toFixed(1) : 0} % de los que respondieron)`);
  const dist = m.filter((r) => r.estado === 'ok' && r.oficial && r.dist != null).map((r) => r.dist).sort((a, b) => a - b);
  if (dist.length) console.log(`distancia candidato → panorámica (km): mediana ${dist[Math.floor(dist.length / 2)]}, p90 ${dist[Math.floor(dist.length * 0.9)]}, máx ${dist[dist.length - 1]}`);
  console.log('\npaís  cuota  probados  sin-img  usuario  oficiales  aceptados  rechazos');
  const filas = Object.keys(cand.paises).sort();
  for (const cc of filas) {
    const c = cand.paises[cc];
    const x = m.filter((r) => r.cc === cc);
    if (!x.length) continue;
    const rz = Object.entries(rechazos[cc] || {}).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(
      `${cc.padEnd(5)} ${String(c.cuota).padStart(5)} ${String(cuenta(x, (r) => r.estado === 'ok' || r.estado === 'sin-imagen')).padStart(9)} ${String(cuenta(x, (r) => r.estado === 'sin-imagen')).padStart(8)} ${String(cuenta(x, (r) => r.estado === 'ok' && !r.oficial)).padStart(8)} ${String(cuenta(x, (r) => r.estado === 'ok' && r.oficial)).padStart(10)} ${String(meta.paises[cc]?.n ?? 0).padStart(10)}  ${rz}`,
    );
  }
  const exc = Object.entries(rechazos).filter(([, v]) => v.excluido).map(([cc, v]) => `${cc} (${v.excluido})`);
  if (exc.length) console.log(`\npaíses excluidos: ${exc.join('; ')}`);
  console.log(`\npaíses con lugares: ${Object.values(meta.paises).filter((p) => p.n > 0).length}`);
  console.log('\n== Sitios famosos ==');
  console.log(`en la lista: ${FAMOSOS.length} · aceptados: ${famosos.length} · descartados: ${famDescartados.length} (pendientes de revisión visual: ${famPendientes.length})`);
  const porCont = {};
  for (const f of famosos) {
    const c = meta.paises[f.cc]?.cont || '?';
    porCont[c] = (porCont[c] || 0) + 1;
  }
  console.log(`  por continente: ${Object.entries(porCont).map(([c, n]) => `${c} ${n}`).join(', ')} · Latinoamérica ${famosos.filter((f) => meta.paises[f.cc]?.latam).length} · Argentina ${famosos.filter((f) => f.cc === 'AR').length}`);
  const sondas = recs.filter((r) => r.t === 'fp' || r.t === 'f');
  console.log(`  lecturas del visor para famosos: ${sondas.length} (oficiales ${cuenta(sondas, (r) => r.estado === 'ok' && r.oficial)}, de usuarios ${cuenta(sondas, (r) => r.estado === 'ok' && !r.oficial)}, sin imagen ${cuenta(sondas, (r) => r.estado === 'sin-imagen')})`);
  const conDm = famosos.filter((f) => f.dm);
  console.log(`  con desplazamiento (foto oficial a 30 m o más del sitio): ${conDm.length}${conDm.length ? ` · máx ${Math.max(...conDm.map((f) => f.dm))} m` : ''}`);
  if (o.detalle) for (const d of famDescartados) console.log(`  ✗ ${d.id} ${d.cc} ${d.nombre}: ${d.motivo}`);
  console.log(`\ncargas del visor usadas: ${cargasUsadas()} de ${MAX_CARGAS}`);
  console.log(`  (validacion.jsonl: ${recs.reduce((s, r) => s + (r.cargas ?? 1), 0)} + pruebas previas anotadas: ${existsSync(F.previas) ? readFileSync(F.previas, 'utf8').trim() : 0})`);
  console.log(existsSync(F.bloqueo) ? '*** HUBO UN BLOQUEO: ver BLOQUEO.txt ***' : 'sin bloqueos de Google');
}

// ================================================================ línea de comandos

const AYUDA = `Trotamundos — datos del juego (public/games/trotamundos/datos/*)

Uso: node tools/trotamundos-datos.mjs <paso> [opciones]
     (con proxy: NODE_USE_ENV_PROXY=1 node tools/trotamundos-datos.mjs <paso>)

Pasos, en orden. Todo lo que baja o calcula queda en tools/.cache/trotamundos/ (ignorado por git), y se puede retomar.

  bajar        Descarga de Natural Earth (dominio público) los países, las rutas y los lugares poblados 1:10m, y los pueblos de GeoNames
               (CC BY 4.0, github.com/lutangar/cities.json). Los pueblos hacen falta porque las rutas de Natural Earth casi nunca caen a
               menos de ~50 m de la calle real (el visor busca la panorámica en un radio chico): en Europa y Norteamérica sirven, en el resto no.
               --forzar    vuelve a bajar aunque ya estén.
  candidatos   Arma los puntos candidatos de cada país con cobertura oficial conocida (lista en tools/trotamundos-semillas.mjs):
               sobre rutas (rutas de Natural Earth), en ciudades y pueblos (Natural Earth y GeoNames) y "sobre calles": pueblos y ciudades
               que al validar se pegan a la calle más cercana (teselas vectoriales de OpenFreeMap con datos de OpenStreetMap, ODbL, gratis
               y sin clave, con caché en tools/.cache/trotamundos/teselas/). Las rutas de Natural Earth están generalizadas y casi nunca
               caen sobre la calle real: en África fallaron las 32 que se probaron (0 aciertos); las calles de OSM se miden aparte. Los lugares aceptados quedan a 15 km o
               más entre sí (5 km en países chicos). Los países con calles usan solo esa lista (se corta si fallan 8 de 8).
               Incluye unos países dudosos con 3 candidatos de prueba. --semilla TEXTO cambia el azar (otro conjunto de candidatos).
  validar      Carga cada candidato en el visor sin clave (google.com/maps/embed dentro de un iframe) en Chromium con Playwright.
               Sirve si hay imagen, la atribución dice "© <año> Google" (no el nombre de una persona) y no es un país vecino ni
               una panorámica repetida. Anota cada resultado en validacion.jsonl; se corta y se retoma sin repetir lo hecho.
               Va país por país hasta llegar a la cuota de cada uno. Opciones:
               --solo famosos    valida los sitios famosos: prueba la panorámica más cercana desde el punto de calle más cercano al sitio y, si
                                 es de un usuario o no hay, desde otros puntos de calle de 45 a 210 m en direcciones distintas (hasta --sondas 6
                                 por sitio). Sirve una foto oficial a menos de 250 m del sitio (se anota el desplazamiento). Las sondas se leen
                                 sin imágenes; solo la foto oficial elegida se carga otra vez con imágenes para sacar la captura que se revisa a ojo.
               --pais AR,UY      solo esos países (o sitios famosos de esos países)       --id f-001,f-002   solo esos famosos
               --max-cargas N    tope de cargas del visor en total (por defecto ${MAX_CARGAS}; cuenta también cargas-previas.txt)
               --conc N          concurrencia (máximo ${CONCURRENCIA})
               Etiqueta: máx. ${CONCURRENCIA} a la vez, como mucho ${RITMO_MAX_POR_MIN} cargas por minuto en total, espera al azar de 0,5 a 1,5 s entre cargas, sin
               cambiar el user agent, sin descargar imágenes (salvo las capturas de famosos). Si Google responde 429, "unusual traffic",
               "/sorry/" o un captcha, FRENA en el acto, escribe BLOQUEO.txt y no sigue (ni se esquiva ni se cambia de red). Tras
               ${FALLAS_BLANDAS_MAX} fallas blandas seguidas (tiempo agotado o error de red sin llegar a ver la página) también frena y escribe FRENO.txt.
               Para frenar a mano: crear tools/.cache/trotamundos/PARAR.
  auditar      Carga con imágenes una muestra al azar (--n 48) de lugares ya aceptados y guarda capturas para mirarlas a ojo.
               --desde AAAA-MM-DD: solo de los validados desde esa fecha (también cuenta que la foto siga siendo oficial al recargarla).
  hojas        Arma hojas de contactos (PNG de 12 capturas) en tools/.cache/trotamundos/hojas/. --que famosos|auditoria, --por 12, --id f-001,...
               --pendientes (famosos): solo los que todavía no se revisaron.
  revisar      Anota la revisión a ojo de los famosos (revisados.json): --ok f-010,f-011 | --ok pendientes, --no f-012=motivo,f-013 (con --motivo),
               --aceptar-actuales (los ya publicados). Solo entran a famosos.json los aprobados.
  armar        Escribe public/games/trotamundos/datos/ (famosos.json, mundo.json, paises.json, CREDITOS.txt) todo junto al final.
               --en-seco no escribe, solo cuenta. --min-por-pais 5 (países con menos lugares quedan afuera). --fecha AAAA-MM-DD.
               Los ids se conservan entre corridas (un lugar que ya estaba mantiene su id) y nunca se reutilizan: paises.json guarda el id
               más alto de cada prefijo ("ids"). La versión "v" de paises.json sube sola solo si cambió el contenido (--version N la fuerza).
               Descartes a mano: lista de claves ("m:lat,lng") en tools/.cache/trotamundos/descartes.json; para famosos, la opción
               { x: 'motivo' } en la lista de semillas o "revisar --no".
  informe      Cuenta por país: candidatos probados, sin imagen, de usuarios, oficiales, aceptados y por qué se descartaron; famosos
               (--detalle los lista con el motivo); cargas usadas.

Para probar la herramienta sin tocar la caché de trabajo: TROTAMUNDOS_CACHE=/otra/carpeta (con candidatos.json y un enlace "ne" a los datos de Natural Earth).

Ampliar el conjunto más adelante: sumar países o sitios en tools/trotamundos-semillas.mjs (los famosos, al final de la lista), subir una
cuota o cambiar --semilla en "candidatos", y volver a correr "validar" y "armar". Lo ya validado no se repite. Las cargas son pocas y
conviene no pasar de unos pocos miles por tanda.
`;

function argumentos(argv) {
  const [paso, ...resto] = argv;
  const o = { _: [] };
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) o[k] = v;
      else if (resto[i + 1] !== undefined && !resto[i + 1].startsWith('--')) o[k] = resto[++i];
      else o[k] = true;
    } else o._.push(a);
  }
  return { paso, o };
}

async function main() {
  const { paso, o } = argumentos(process.argv.slice(2));
  if (!paso || paso === '--help' || paso === 'help' || o.help) return console.log(AYUDA);
  const pasos = { bajar, candidatos, validar, auditar, hojas, revisar, armar, informe };
  if (!pasos[paso]) {
    console.error(`Paso desconocido: ${paso}\n`);
    console.log(AYUDA);
    process.exit(1);
  }
  await pasos[paso](o);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    console.error(e.stack || e);
    process.exit(1);
  });
}

