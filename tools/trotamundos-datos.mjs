#!/usr/bin/env node
/* Trotamundos — genera los datos del juego (public/games/trotamundos/datos/*).
 * Mirá `node tools/trotamundos-datos.mjs --help`. Las funciones puras se exportan para probarlas sin red
 * (tools/tests/trotamundos/datos.test.mjs); el resto es la línea de comandos. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { distanceKm, bearingDeg, embedUrl, rngFrom, WORLD_D } from '../public/games/trotamundos/shared/geo.js';
import { PAISES_CORE, PAISES_PRUEBA, CANDIDATOS_PRUEBA, PROMOCION, LATAM, RECORTES, CONTINENTE_FORZADO, FAMOSOS } from './trotamundos-semillas.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATOS = join(ROOT, 'public/games/trotamundos/datos');
export const CACHE = join(ROOT, 'tools/.cache/trotamundos');
const NE_DIR = join(CACHE, 'ne');
const F = {
  candidatos: join(CACHE, 'candidatos.json'),
  validacion: join(CACHE, 'validacion.jsonl'),
  previas: join(CACHE, 'cargas-previas.txt'),
  descartes: join(CACHE, 'descartes.json'),
  bloqueo: join(CACHE, 'BLOQUEO.txt'),
  parar: join(CACHE, 'PARAR'),
  shots: join(CACHE, 'shots'),
  hojas: join(CACHE, 'hojas'),
};

export const VERSION_DATOS = 1;
export const MAX_CARGAS = 3000; // tope de cargas del visor en total (lo cacheado no cuenta)
export const CONCURRENCIA = 3;
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
  return `{\n  "v": ${obj.v},\n  "generado": ${JSON.stringify(obj.generado)},\n  "metodo": ${JSON.stringify(obj.metodo)},\n  "paises": {\n${pais}\n  },\n  "regiones": {\n${reg}\n  }\n}\n`;
}

export const METODO =
  'Natural Earth 1:10m (dominio público). d de cada país = diagonal (km) del rectángulo que contiene sus polígonos sin islas lejanas ' +
  '(se parte del polígono más grande y se suman los de al menos 1 % de su área cuyo centro queda a menos de max(600 km, su diagonal); ' +
  'Estados Unidos = zona continental y Rusia = zona europea, hasta 60° E; mínimo 250). d de latam y de cada continente = diagonal del ' +
  'rectángulo que contiene los lugares de mundo.json de ese ámbito sin valores extremos (se descartan el 2 % menor y el 2 % mayor de ' +
  'latitudes y de longitudes por separado); mundo = 14916,862 (shared/geo.js). n = lugares de mundo.json, f = famosos. latam = 1: de México a ' +
  'Argentina y Chile, más Cuba, Haití y República Dominicana, con Brasil. cont: AF, AS, EU, NA (incluye Centroamérica y el Caribe), SA, OC.';

/**
 * Arma el contenido final de los tres JSON. Entradas ya filtradas:
 *  famosos: [{ id, lat, lng, cc, n, h? }], mundo: [{ id, lat, lng, cc, h?, p? }],
 *  geo: Map cc → { cont, d }, generado: 'AAAA-MM-DD'.
 */
export function construirPaises({ famosos, mundo, geo, generado, v = VERSION_DATOS }) {
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
  return { v, generado, metodo: METODO, paises, regiones };
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

function candidatos(o) {
  const semilla = String(o.semilla ?? 'trotamundos-1');
  const { paises, lugares, pueblos, archivoRutas } = cargarNE();
  if (!pueblos.length) throw new Error('Faltan los pueblos de GeoNames: corré "bajar".');
  const objetivos = listaPaises().map((e) => {
    const pais = paises.get(e.cc);
    if (!pais) throw new Error(`País sin polígono en Natural Earth: ${e.cc}`);
    const rec = RECORTES[e.cc];
    const zona = rec ? [Math.max(pais.bb[0], rec[0]), Math.max(pais.bb[1], rec[1]), Math.min(pais.bb[2], rec[2]), Math.min(pais.bb[3], rec[3])] : pais.bb;
    return { ...e, pais, rec, zona, rutas: [] };
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
    const ne = lugares.filter((l) => l.cc === x.cc).map((l) => ({ lat: l.lat, lng: l.lng, tipo: 'c' }));
    const gn = pueblos.filter((l) => l.cc === x.cc).map((l) => ({ lat: l.lat, lng: l.lng, tipo: 'g' }));
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
    out.paises[x.cc] = { cont: x.pais.cont, estado: x.estado, cuota: x.cuota, minKm, ...lista };
    console.log(`${x.cc} ${x.estado.padEnd(6)} cuota ${String(x.cuota).padStart(3)}  rutas ${String(lista.r.length).padStart(4)}  pueblos ${String(lista.c.length).padStart(4)} (NE ${ne.length}, GeoNames ${gn.length})`);
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

/**
 * Carga el visor en una página (iframe de google.com/maps/embed dentro de un documento propio, como "Compartir → Insertar").
 * Sin `imagenes` no se descargan imágenes, fuentes ni medios (el texto del visor se lee igual).
 * Devuelve la lectura de leerVisor() más { ms }. Si Google responde con un bloqueo o un desafío, lanza Bloqueo.
 */
async function cargarVisor(ctx, { lat, lng, h = 0 }, { imagenes = false, captura = null, esperaMs = 15000 } = {}) {
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
    if (captura && lec.estado === 'ok') {
      await page.waitForTimeout(3500); // que lleguen los mosaicos de la imagen
      asegurar(dirname(captura));
      await page.screenshot({ path: captura, type: 'jpeg', quality: 72 });
    }
    return { ...lec, ms: Date.now() - t0 };
  } finally {
    await page.close().catch(() => {});
  }
}

function registrarBloqueo(e) {
  const txt = `${ahora()}\nGoogle respondió con un bloqueo o un desafío: ${e.message}\nSe frenó en el acto y no se insistió. No se esquiva ni se cambia de red.\nPara volver a empezar (más tarde, y a propósito) borrá este archivo.\n`;
  escribirAtomico(F.bloqueo, txt);
  console.error('\n*** BLOQUEO ***\n' + txt);
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
  }
}

function chequearAntes(o) {
  if (existsSync(F.bloqueo)) {
    console.error(`Hay un bloqueo anotado (${F.bloqueo}). No se sigue cargando el visor.`);
    process.exit(3);
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
      cc, estado: c.estado, cuota: c.cuota, minKm: c.minKm, r: c.r, c: c.c, usadoR: new Set(), usadoC: new Set(),
      hechos: new Set(), triedR: 0, hitR: 0, triedC: 0, hitC: 0, aceptados: 0, panos: [], vuelo: [], enCurso: 0,
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

const probadosDe = (e) => e.triedR + e.triedC;
const buenosDe = (e) => e.hitR + e.hitC;
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
  // 12 intentos sin un solo acierto: se corta para no gastar cargas. NO significa que el país no tenga cobertura oficial
  // (los candidatos pueden caer fuera del radio del visor): hay que probar puntos sobre calles de la capital antes de darlo por vacío.
  if (probadosDe(e) >= 12 && buenosDe(e) === 0) return null;
  if (!rutasSirven(e) && e.triedC >= 10 && e.hitC / e.triedC < 0.15) return null;
  if (rutasSirven(e) && probadosDe(e) >= 16 && buenosDe(e) / probadosDe(e) < 0.1) return null;
  // pueblos primero; una ruta de cada 4 para medir (o una de cada 2 si las rutas del país andan bien)
  const quieroRuta = rutasSirven(e) && e.r.length > 0 && (rutasBuenas(e) ? intentos % 2 === 1 : intentos % 4 === 3);
  const tipos = quieroRuta ? ['r', 'c'] : ['c', 'r'];
  for (const t of tipos) {
    const lista = t === 'r' ? e.r : e.c;
    const usado = t === 'r' ? e.usadoR : e.usadoC;
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
      return { tipo: t === 'r' ? 'r' : x, i, lat, lng, h: t === 'r' ? x : null };
    }
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
      const l = await cargarVisor(ctx, { lat: t.lat, lng: t.lng, h: t.h ?? 0 });
      rec = { ...base, estado: l.estado, attr: l.attr ?? null, oficial: l.oficial ?? false, card: l.card ?? null, pano: l.pano ?? null, ms: l.ms, cargas: 1, ts: ahora() };
      if (rec.pano) rec.dist = Math.round(distanceKm(t.lat, t.lng, rec.pano.lat, rec.pano.lng) * 1000) / 1000;
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

async function validarFamosos(o, max, conc) {
  const recs = leerJsonl(F.validacion);
  const hechos = new Map(recs.filter((r) => r.t === 'f').map((r) => [r.id, r]));
  const capTs = new Map(recs.filter((r) => r.t === 'fs').map((r) => [r.id, r.ts]));
  const tieneCaptura = (id, rec) => capTs.has(id) && capTs.get(id) >= rec.ts; // la captura es posterior a la última lectura
  let usadas = cargasUsadas();
  const sel = o.id ? new Set(String(o.id).split(',')) : null;
  const pendientes = FAMOSOS.map((f, i) => ({ f, i, id: idFamoso(i) })).filter((x) => !x.f[5]?.x && (!sel || sel.has(x.id)));
  // falta: nunca se cargó, cambió el punto de búsqueda (opción v), o está bien pero sin captura
  const falta = ({ f, id }) => {
    const rec = hechos.get(id);
    const [vlat, vlng] = f[5]?.v || [f[3], f[4]];
    return !rec || rec.lat !== vlat || rec.lng !== vlng || (rec.estado === 'ok' && !tieneCaptura(id, rec));
  };
  const cola = pendientes.filter((x) => o.rehacer || falta(x));
  const siguiente = () => (usadas + 2 > max ? null : cola.shift() || null);
  let n = 0;
  await pool(conc, siguiente, async (ctx, { f, i, id }) => {
    const [cc, es, en, lat, lng, op = {}] = f;
    const [vlat, vlng] = op.v || [lat, lng]; // punto desde donde se busca la panorámica (por defecto, el sitio)
    let prev = hechos.get(id);
    if (!prev || o.rehacer || prev.lat !== vlat || prev.lng !== vlng) {
      let rec;
      let conShot = null;
      try {
        // una sola carga, con imágenes y captura (para revisar a ojo); mira hacia el sitio si se busca desde otro punto
        const h0 = op.h ?? (distanceKm(vlat, vlng, lat, lng) > 0.02 ? Math.round(bearingDeg(vlat, vlng, lat, lng)) % 360 : 0);
        const arch = join(F.shots, `${id}.jpg`);
        const l = await cargarVisor(ctx, { lat: vlat, lng: vlng, h: h0 }, { imagenes: true, captura: arch });
        conShot = l.estado === 'ok' ? { t: 'fs', id, estado: 'ok', attr: l.attr, oficial: l.oficial, card: l.card, h: h0, shot: `shots/${id}.jpg`, cargas: 0 } : null;
        rec = { t: 'f', id, k: claveDe('f', vlat, vlng), cc, lat: vlat, lng: vlng, estado: l.estado, attr: l.attr ?? null, oficial: l.oficial ?? false, card: l.card ?? null, pano: l.pano ?? null, cargas: 1, ts: ahora() };
        if (l.pano) {
          rec.dist = Math.round(distanceKm(vlat, vlng, l.pano.lat, l.pano.lng) * 1000) / 1000;
          rec.distSitio = Math.round(distanceKm(lat, lng, l.pano.lat, l.pano.lng) * 1000) / 1000;
          rec.h = op.h ?? rumboHaciaSitio(l.pano, { lat, lng });
          rec.tarjetaOk = coincideNombre(l.card, [es, en]);
        }
      } catch (err) {
        if (err instanceof Bloqueo) throw err;
        rec = { t: 'f', id, k: claveDe('f', vlat, vlng), cc, lat: vlat, lng: vlng, estado: 'error', error: String(err.message).slice(0, 120), cargas: 1, ts: ahora() };
      }
      guardar(rec);
      usadas++;
      hechos.set(id, rec);
      prev = rec;
      if (conShot) {
        guardar({ ...conShot, ts: ahora() });
        capTs.set(id, ahora());
      }
    }
    if (prev.estado === 'ok' && (!tieneCaptura(id, prev) || o.rehacer)) {
      // captura con imágenes, mirando hacia el sitio, para revisarla a ojo
      const arch = join(F.shots, `${id}.jpg`);
      let l;
      try {
        l = await cargarVisor(ctx, { lat: prev.pano.lat, lng: prev.pano.lng, h: prev.h ?? 0 }, { imagenes: true, captura: arch });
      } catch (err) {
        if (err instanceof Bloqueo) throw err;
        l = { estado: 'error' };
      }
      guardar({ t: 'fs', id, estado: l.estado, attr: l.attr ?? null, oficial: l.oficial ?? false, card: l.card ?? null, h: prev.h ?? null, shot: l.estado === 'ok' ? `shots/${id}.jpg` : null, cargas: 1, ts: ahora() });
      usadas++;
    }
    n++;
    if (n % 10 === 0) console.log(`famosos ${n}/${pendientes.length}  cargas ${usadas}/${max}`);
  });
  console.log(`listo. cargas usadas: ${usadas} de ${max}.`);
}

// ================================================================ paso: auditar (muestra con imágenes para mirar a ojo)

async function auditar(o) {
  chequearAntes(o);
  const n = Number(o.n ?? 48);
  const recs = leerJsonl(F.validacion);
  const cand = leerJson(F.candidatos);
  const ya = new Set(recs.filter((r) => r.t === 'a').map((r) => r.k));
  const buenos = recs.filter((r) => r.t === 'm' && r.estado === 'ok' && r.oficial && !ya.has(r.k));
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
    const ult = new Map();
    for (const r of recs) if (r.t === 'f') ult.set(r.id, r);
    const sh = new Map();
    for (const r of recs) if (r.t === 'fs' && r.shot) sh.set(r.id, r);
    items = FAMOSOS.map((f, i) => ({ f, i, id: idFamoso(i) }))
      .filter((x) => sh.has(x.id) && (!o.id || String(o.id).split(',').includes(x.id)))
      .map((x) => {
        const r = ult.get(x.id);
        return { img: join(CACHE, sh.get(x.id).shot), t1: `${x.id} ${x.f[0]} · ${x.f[2]}`, t2: `${sh.get(x.id).attr || ''} · pano a ${r?.dist != null ? Math.round(r.dist * 1000) : '?'} m · tarjeta${r?.tarjetaOk ? ' OK' : ' ?'}: ${(sh.get(x.id).card || '').slice(0, 50)}` };
      });
  } else {
    items = recs.filter((r) => r.t === 'a' && r.shot).map((r) => ({ img: join(CACHE, r.shot), t1: `${r.cc} ${r.k}`, t2: `${r.attr || ''} · ${(r.card || '').slice(0, 60)}` }));
  }
  if (!items.length) return console.log('no hay capturas para mostrar');
  asegurar(F.hojas);
  const browser = await abrirNavegador();
  const ctx = await browser.newContext({ viewport: { width: 1760, height: 900 } });
  const page = await ctx.newPage();
  const cols = 4;
  for (let s = 0; s * por < items.length; s++) {
    const trozo = items.slice(s * por, (s + 1) * por);
    const celdas = trozo.map((it) => `<figure><img src="${pathToFileURL(it.img).href}"><figcaption><b>${it.t1.replace(/</g, '&lt;')}</b><br>${it.t2.replace(/</g, '&lt;')}</figcaption></figure>`).join('');
    const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#fff;font:13px sans-serif}main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px}figure{margin:0}img{width:100%;aspect-ratio:8/5;object-fit:cover;display:block}figcaption{padding:2px 0;line-height:1.25}</style><main>${celdas}</main>`;
    const arch = join(F.hojas, `${que}-${String(s + 1).padStart(2, '0')}.html`);
    writeFileSync(arch, html);
    await page.goto(pathToFileURL(arch).href);
    await page.waitForTimeout(600);
    const png = arch.replace(/\.html$/, '.png');
    await page.screenshot({ path: png, fullPage: true });
    console.log(png);
  }
  await browser.close();
}

// ================================================================ paso: armar

/** Por qué un famoso no entra al conjunto (null = entra): tiene que haberse validado, tener imagen oficial (© Google) y estar cerca del sitio. */
export function motivoFamoso(r, op = {}) {
  if (!r) return 'sin validar';
  if (r.estado !== 'ok') return r.estado;
  if (!r.oficial) return `panorámica de usuario (${r.attr ?? 'sin atribución'}), no © Google`;
  const d = r.distSitio ?? r.dist;
  return d > (op.max ?? 2) ? `la panorámica más cercana está a ${d} km` : null;
}

function datosFinales(o) {
  const { paises, lugares } = cargarNE();
  const cand = leerJson(F.candidatos);
  const recs = leerJsonl(F.validacion);
  const descartes = new Set(leerJson(F.descartes, []));
  const minPorPais = Number(o['min-por-pais'] ?? 5);
  const geoCc = (lng, lat) => paisDe(lng, lat, [...paises.values()].filter((p) => dentroBB(lng, lat, p.bb)));
  // --- famosos
  const ult = new Map();
  for (const r of recs) if (r.t === 'f') ult.set(r.id, r);
  const famosos = [];
  const famDescartados = [];
  FAMOSOS.forEach((f, i) => {
    const [cc, es, en, lat, lng, op = {}] = f;
    const id = idFamoso(i);
    const r = ult.get(id);
    const motivo = op.x ? `descartado a mano: ${op.x}` : motivoFamoso(r, op);
    if (motivo) return famDescartados.push({ id, cc, nombre: en, motivo });
    const e = { id, lat: r5(r.pano.lat), lng: r5(r.pano.lng), cc, n: { es, en } };
    if (r.h != null) e.h = r.h;
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
  // ids estables: los lugares que ya estaban conservan el suyo; los nuevos siguen desde el mayor
  const usados = new Set();
  let maxId = 0;
  for (const x of crudos) {
    const id = idPrevio.get(`${r5(x.r.pano.lat)},${r5(x.r.pano.lng)}`);
    if (id && !usados.has(id)) {
      x.id = id;
      usados.add(id);
      maxId = Math.max(maxId, Number(id.slice(2)));
    }
  }
  for (const x of crudos) {
    if (!x.id) x.id = `m-${String(++maxId).padStart(4, '0')}`;
    const lat = r5(x.r.pano.lat);
    const lng = r5(x.r.pano.lng);
    const e = { id: x.id, lat, lng, cc: x.cc };
    if (x.r.h != null) e.h = x.r.h;
    // solo pueblos del mismo país y a menos de 40 km; si no hay, no se pone `p`
    const p = lugarMasCercano(lat, lng, lugaresPorCc.get(x.cc) || [], 40);
    if (p) e.p = p;
    mundo.push(e);
  }
  mundo.sort((a, b) => a.id.localeCompare(b.id));
  // --- países
  const geo = new Map();
  for (const [cc, p] of paises) geo.set(cc, { cont: p.cont, d: escalaPais(p, RECORTES[cc]) });
  const generado = String(o.fecha || new Date().toISOString().slice(0, 10));
  const meta = construirPaises({ famosos, mundo, geo, generado });
  return { famosos, mundo, meta, rechazos, famDescartados, recs };
}

const CREDITOS = `Trotamundos — créditos de los datos

Estos archivos los genera tools/trotamundos-datos.mjs (ver "node tools/trotamundos-datos.mjs --help").

- Natural Earth (https://www.naturalearthdata.com/): países, rutas y lugares poblados a escala 1:10m. Dominio público.
  Se usaron para elegir puntos candidatos, calcular las escalas de cada país y nombrar el lugar poblado más cercano ("p").
- GeoNames (https://www.geonames.org/), licencia CC BY 4.0, a través de https://github.com/lutangar/cities.json: pueblos y ciudades que
  se usaron solo para elegir puntos candidatos. Las rutas de Natural Earth están generalizadas y casi nunca caen a menos de ~50 m de
  la calle real, así que en la mayoría de los países los candidatos salen de pueblos y ciudades.
- Los lugares de mundo.json se validaron cargando el visor de Street View de Google ("Compartir → Insertar") como lo haría una persona,
  aceptando solo imágenes oficiales (© Google). Las imágenes en sí no se guardan ni se redistribuyen: el juego las muestra desde el visor de Google.
  Se guardan solo coordenadas (la posición de la panorámica) y datos propios.
- famosos.json: la lista de sitios, los nombres y el rumbo son propios. Las coordenadas salen de la posición de la panorámica
  más cercana al sitio (hechos geográficos, sin derechos de autor).
- El mapa donde se marca la respuesta es OpenFreeMap (https://openfreemap.org/) con datos de OpenStreetMap (© colaboradores de OpenStreetMap, ODbL).
  No forma parte de estos archivos.
`;

function armar(o) {
  const { famosos, mundo, meta, rechazos, famDescartados } = datosFinales(o);
  const salidas = {
    'famosos.json': lineasJson(famosos),
    'mundo.json': lineasJson(mundo),
    'paises.json': serializarPaises(meta),
    'CREDITOS.txt': CREDITOS,
  };
  const bytes = Object.values(salidas).reduce((s, t) => s + Buffer.byteLength(t), 0);
  if (bytes >= MAX_BYTES) throw new Error(`datos/ pesaría ${bytes} bytes (el máximo es ${MAX_BYTES})`);
  if (o['en-seco']) {
    console.log(`(en seco) famosos ${famosos.length}, mundo ${mundo.length}, países ${Object.keys(meta.paises).length}, ${bytes} bytes`);
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
  console.log(`famosos ${famosos.length}, mundo ${mundo.length}, países ${Object.keys(meta.paises).length}, ${bytes} bytes → ${DATOS}`);
  void rechazos;
  void famDescartados;
}

// ================================================================ paso: informe

function informe(o) {
  const { famosos, mundo, meta, rechazos, famDescartados, recs } = datosFinales({ ...o });
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
  console.log(`en la lista: ${FAMOSOS.length} · aceptados: ${famosos.length} · descartados: ${famDescartados.length}`);
  const fr = recs.filter((r) => r.t === 'f');
  const ultimos = new Map(fr.map((r) => [r.id, r]));
  const ok = famosos.map((f) => ultimos.get(f.id));
  console.log(`  oficiales: ${cuenta(ok, (r) => r?.oficial)} · de usuarios: ${cuenta(ok, (r) => r && !r.oficial)} · tarjeta con el nombre esperado: ${cuenta(ok, (r) => r?.tarjetaOk)}`);
  for (const d of famDescartados) console.log(`  ✗ ${d.id} ${d.cc} ${d.nombre}: ${d.motivo}`);
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
               sobre rutas (rutas de Natural Earth) y en ciudades y pueblos (Natural Earth y GeoNames), al azar; los lugares aceptados quedan a
               15 km o más entre sí (5 km en países chicos). Al validar, van primero los pueblos y ciudades (casi siempre
               tienen panorámica sobre una calle) y una ruta de cada 4 para medir (una de cada 2 si las rutas del país andan bien; si fallan
               2 de 2, se pasa a pueblos solamente).
               Incluye unos países dudosos con 3 candidatos de prueba. --semilla TEXTO cambia el azar (otro conjunto de candidatos).
  validar      Carga cada candidato en el visor sin clave (google.com/maps/embed dentro de un iframe) en Chromium con Playwright.
               Sirve si hay imagen, la atribución dice "© <año> Google" (no el nombre de una persona) y no es un país vecino ni
               una panorámica repetida. Anota cada resultado en validacion.jsonl; se corta y se retoma sin repetir lo hecho.
               Va país por país hasta llegar a la cuota de cada uno. Opciones:
               --solo famosos    valida los sitios famosos (carga sin imágenes para leer la panorámica y otra vez con imágenes para sacar una captura)
               --pais AR,UY      solo esos países        --id f-001,f-002   solo esos famosos (con --rehacer, los vuelve a cargar)
               --max-cargas N    tope de cargas del visor en total (por defecto ${MAX_CARGAS}; cuenta también cargas-previas.txt)
               --conc N          concurrencia (máximo ${CONCURRENCIA})
               Etiqueta: máx. ${CONCURRENCIA} a la vez, espera al azar de 0,5 a 1,5 s entre cargas, sin cambiar el user agent, sin descargar imágenes
               (salvo las capturas de famosos). Si Google responde 429, "unusual traffic", "/sorry/" o un captcha, FRENA en el acto,
               escribe BLOQUEO.txt y no sigue (ni se esquiva ni se cambia de red). Para frenar a mano: crear tools/.cache/trotamundos/PARAR.
  auditar      Carga con imágenes una muestra al azar (--n 48) de lugares ya aceptados y guarda capturas para mirarlas a ojo.
  hojas        Arma hojas de contactos (PNG de 12 capturas) en tools/.cache/trotamundos/hojas/. --que famosos|auditoria, --por 12, --id f-001,...
  armar        Escribe public/games/trotamundos/datos/ (famosos.json, mundo.json, paises.json, CREDITOS.txt) todo junto al final.
               --en-seco no escribe, solo cuenta. --min-por-pais 5 (países con menos lugares quedan afuera). --fecha AAAA-MM-DD.
               Los ids se conservan entre corridas (un lugar que ya estaba mantiene su id). Descartes a mano: lista de claves ("m:lat,lng")
               en tools/.cache/trotamundos/descartes.json; para famosos, la opción { x: 'motivo' } en la lista de semillas.
  informe      Cuenta por país: candidatos probados, sin imagen, de usuarios, oficiales, aceptados y por qué se descartaron; famosos; cargas usadas.

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
  const pasos = { bajar, candidatos, validar, auditar, hojas, armar, informe };
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

