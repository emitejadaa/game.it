// Pruebas de la lógica pura del cliente de Trotamundos (datos.js, mapa.js, textos.js, visor.js)  ·  npm test
// Sin navegador: lo que toca el DOM (visor, mapa dibujado, pantallas) se prueba en un Chromium aparte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../../../public/games/trotamundos/datos.js';
import { desenvolver, arco, anillo, parsearColor, colorOscuro, colorClaro, adaptarEstilo, camaraPara } from '../../../public/games/trotamundos/mapa.js';
import { TEXTOS, traducir } from '../../../public/games/trotamundos/textos.js';
import { distanceKm, dailyKey } from '../../../public/games/trotamundos/shared/geo.js';

const DIR = new URL('../../../public/games/trotamundos/', import.meta.url);
const json = (n) => JSON.parse(readFileSync(new URL(`datos/${n}`, DIR), 'utf8'));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} no está a ${tol} de ${b}`);

// localStorage de mentira (en Node no existe); los tests lo reemplazan cuando hace falta
function conAlmacen(fn, { falla = false } = {}) {
  const viejo = globalThis.localStorage;
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => { if (falla) throw new Error('bloqueado'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (falla) throw new Error('bloqueado'); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
  };
  try {
    return fn(m);
  } finally {
    if (viejo === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = viejo;
  }
}

// datos de prueba: 6 países, de 6 lugares cada uno
const CC = { AR: ['SA', 1], BR: ['SA', 1], FR: ['EU', 0], ES: ['EU', 0], JP: ['AS', 0], AU: ['OC', 0] };
const mundo = [];
for (const cc of Object.keys(CC)) for (let i = 0; i < 6; i++) mundo.push({ id: `${cc}-${i}`, lat: (i - 3) * 2, lng: (cc.charCodeAt(0) - 70) * 3 + i, cc, ...(i % 2 ? { h: 45 } : {}) });
const famosos = [
  { id: 'f1', lat: -34.6, lng: -58.4, cc: 'AR', n: { es: 'Obelisco', en: 'Obelisk' } },
  { id: 'f2', lat: 48.85, lng: 2.29, cc: 'FR', n: { es: 'Torre Eiffel', en: 'Eiffel Tower' } },
];
const meta = { v: 3, paises: Object.fromEntries(Object.entries(CC).map(([cc, [cont, latam]]) => [cc, { cont, latam, d: 3000, n: 6, f: 0 }])), regiones: { mundo: { d: 14916 } } };
const datos = { famosos, mundo, meta };

// ------------------------------------------------------------------ datos.js: carga
const respuesta = (cuerpo, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });
const servidor = (mapa) => async (url) => {
  const n = url.split('/').pop();
  const v = mapa[n];
  if (v instanceof Error) throw v;
  if (typeof v === 'number') return respuesta(null, v);
  return respuesta(v);
};

test('cargarDatos: lee los tres archivos y limpia lo inválido', async () => {
  const sucio = [...mundo, { id: 'x', lat: 999, lng: 0, cc: 'AR' }, { lat: 1, lng: 1, cc: 'AR' }, null];
  const d = await D.cargarDatos({ fetchFn: servidor({ 'famosos.json': [...famosos, { id: 'f9', lat: 1, lng: 1, cc: 'AR' }], 'mundo.json': sucio, 'paises.json': meta }), espera: 1 });
  assert.equal(d.mundo.length, mundo.length, 'sin coordenadas inválidas ni ubicaciones sin id');
  assert.equal(d.famosos.length, 2, 'un famoso sin nombre no sirve');
  assert.deepEqual(d.famosos[0].n, { es: 'Obelisco', en: 'Obelisk' });
  assert.equal(d.meta.v, 3);
});

test('cargarDatos: completa el idioma que falta en el nombre de un famoso', async () => {
  const d = await D.cargarDatos({ fetchFn: servidor({ 'famosos.json': [{ id: 'f', lat: 1, lng: 1, cc: 'AR', n: { es: 'Solo es' } }], 'mundo.json': mundo, 'paises.json': meta }), espera: 1 });
  assert.deepEqual(d.famosos[0].n, { es: 'Solo es', en: 'Solo es' });
});

test('cargarDatos: reintenta si la red falla y avisa con code "red"', async () => {
  let llamadas = 0;
  const intermitente = async (url) => {
    llamadas++;
    if (llamadas <= 2) throw new TypeError('Failed to fetch');
    return servidor({ 'famosos.json': famosos, 'mundo.json': mundo, 'paises.json': meta })(url);
  };
  const d = await D.cargarDatos({ fetchFn: intermitente, espera: 1, intentos: 3 });
  assert.ok(d.mundo.length > 0, 'a la tercera pasa');
  await assert.rejects(D.cargarDatos({ fetchFn: async () => { throw new TypeError('x'); }, espera: 1, intentos: 2 }), (e) => e instanceof D.ErrorDatos && e.code === 'red' && /\.json$/.test(e.archivo));
  await assert.rejects(D.cargarDatos({ fetchFn: servidor({ 'famosos.json': 500, 'mundo.json': mundo, 'paises.json': meta }), espera: 1, intentos: 2 }), (e) => e.code === 'red' && e.archivo === 'famosos.json');
});

test('cargarDatos: un archivo que no existe (404) falla enseguida, sin reintentos, con code "falta"', async () => {
  let llamadas = 0;
  const f = async (url) => { llamadas++; return servidor({ 'famosos.json': famosos, 'mundo.json': 404, 'paises.json': meta })(url); };
  await assert.rejects(D.cargarDatos({ fetchFn: f, espera: 1, intentos: 5 }), (e) => e.code === 'falta' && e.archivo === 'mundo.json');
  assert.ok(llamadas <= 3, `no reintenta un 404 (${llamadas} llamadas)`);
});

test('cargarDatos: formato roto o muy pocos lugares', async () => {
  const ok = { 'famosos.json': famosos, 'mundo.json': mundo, 'paises.json': meta };
  await assert.rejects(D.cargarDatos({ fetchFn: servidor({ ...ok, 'famosos.json': { no: 'es lista' } }), espera: 1 }), (e) => e.code === 'formato' && e.archivo === 'famosos.json');
  await assert.rejects(D.cargarDatos({ fetchFn: servidor({ ...ok, 'mundo.json': mundo.slice(0, 2) }), espera: 1 }), (e) => e.code === 'vacio');
  await assert.rejects(D.cargarDatos({ fetchFn: servidor({ ...ok, 'paises.json': [] }), espera: 1 }), (e) => e.code === 'formato' && e.archivo === 'paises.json');
});

test('cargarDatos: los archivos reales del juego cargan y son coherentes', async () => {
  const d = await D.cargarDatos({ fetchFn: async (u) => respuesta(json(u.split('/').pop())), espera: 1 });
  assert.ok(d.mundo.length >= D.MIN_LUGARES && d.famosos.length > 0);
  for (const l of [...d.famosos, ...d.mundo]) assert.ok(d.meta.paises[l.cc], `${l.id}: ${l.cc} no está en paises.json`);
});

// ------------------------------------------------------------------ datos.js: ámbitos
test('lugaresEnAmbito y ambitoDisponible filtran con inScope y excluyen malas', () => {
  assert.equal(D.lugaresEnAmbito(mundo, 'mundo', meta).length, 36);
  assert.equal(D.lugaresEnAmbito(mundo, 'AR', meta).length, 6);
  assert.equal(D.lugaresEnAmbito(mundo, 'latam', meta).length, 12);
  assert.equal(D.lugaresEnAmbito(mundo, 'EU', meta).length, 12);
  assert.equal(D.lugaresEnAmbito(mundo, 'AS', meta).length, 6);
  assert.equal(D.lugaresEnAmbito(mundo, 'AR', meta, new Set(['AR-0', 'AR-1'])).length, 4);
  assert.equal(D.ambitoDisponible(datos, 'famosos', 'AR'), 1);
  assert.equal(D.ambitoDisponible(datos, 'famosos', 'mundo'), 2);
  assert.equal(D.ambitoDisponible(datos, 'azar', 'AR'), 36, 'el modo azar siempre juega sobre el mundo');
  assert.equal(D.ambitoDisponible(datos, 'pais', 'FR'), 6);
});

test('paisesDisponibles: solo países con suficientes lugares, de más a menos', () => {
  const p = D.paisesDisponibles(mundo, meta);
  assert.equal(p.length, 6);
  assert.deepEqual(p[0], { cc: 'AR', n: 6 });
  const poco = D.paisesDisponibles(mundo, meta, { excluir: new Set(['AR-0', 'AR-1', 'AR-2']) });
  assert.ok(!poco.some((x) => x.cc === 'AR'), 'AR bajó de 5 lugares');
  assert.equal(D.paisesDisponibles(mundo, meta, { min: 7 }).length, 0);
  assert.ok(!D.paisesDisponibles([...mundo, { id: 'z', lat: 0, lng: 0, cc: 'ZZ' }], meta, { min: 1 }).some((x) => x.cc === 'ZZ'), 'un país que no está en paises.json no se ofrece');
});

test('limitesAmbito: caja del ámbito; null para el mundo y para lo que cruza el antimeridiano', () => {
  assert.equal(D.limitesAmbito(mundo, 'mundo', meta), null);
  const [[w, s], [e, n]] = D.limitesAmbito(mundo, 'AR', meta);
  assert.ok(w < e && s < n);
  for (const l of mundo.filter((x) => x.cc === 'AR')) assert.ok(l.lng >= w && l.lng <= e && l.lat >= s && l.lat <= n);
  assert.equal(D.limitesAmbito(mundo, 'ZZ', meta), null, 'ámbito sin lugares');
  const raro = [{ id: 'a', lat: 0, lng: -170, cc: 'AR' }, { id: 'b', lat: 0, lng: 170, cc: 'AR' }];
  assert.equal(D.limitesAmbito(raro, 'AR', meta), null, 'cruza el antimeridiano');
});

// ------------------------------------------------------------------ datos.js: sorteo
test('Sorteo: no repite en la partida, varía el país y respeta el ámbito', () => {
  for (let k = 0; k < 40; k++) {
    const s = new D.Sorteo({ lista: mundo, ambito: 'mundo', meta });
    const salio = [];
    for (let i = 0; i < D.RONDAS; i++) salio.push(s.siguiente());
    assert.equal(new Set(salio.map((l) => l.id)).size, D.RONDAS, 'sin repetir ubicaciones');
    assert.equal(new Set(salio.map((l) => l.cc)).size, D.RONDAS, 'con 6 países, 5 rondas son 5 países distintos');
    for (const l of salio) assert.ok(Number.isFinite(l.h) && l.h >= 0 && l.h < 360, 'trae rumbo (headingFor)');
  }
  const ar = new D.Sorteo({ lista: mundo, ambito: 'AR', meta });
  const vistos = new Set();
  for (let i = 0; i < 6; i++) { const l = ar.siguiente(); assert.equal(l.cc, 'AR'); vistos.add(l.id); }
  assert.equal(vistos.size, 6);
  assert.equal(ar.siguiente(), null, 'se acabaron los lugares');
  assert.equal(ar.restantes, 0);
});

test('Sorteo: usa el rumbo de la ubicación si lo trae y no sortea las malas', () => {
  const malas = new Set(mundo.filter((l) => l.cc === 'AR' && l.id !== 'AR-1').map((l) => l.id));
  const s = new D.Sorteo({ lista: mundo, ambito: 'AR', meta, malas });
  assert.equal(s.restantes, 1);
  const l = s.siguiente();
  assert.equal(l.id, 'AR-1');
  assert.equal(l.h, 45, 'AR-1 trae h=45');
});

test('Sorteo.descartar saca una ubicación para siempre (el "¿No carga?")', () => {
  const s = new D.Sorteo({ lista: mundo, ambito: 'FR', meta, rng: () => 0 });
  const a = s.siguiente();
  s.descartar(a.id);
  const b = s.siguiente();
  assert.notEqual(a.id, b.id);
  assert.equal(s.restantes, 4);
});

test('Sorteo: con la misma semilla de azar da lo mismo', () => {
  const mk = () => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
  const run = () => { const s = new D.Sorteo({ lista: mundo, ambito: 'mundo', meta, rng: mk() }); return [1, 2, 3, 4, 5].map(() => s.siguiente().id); };
  assert.deepEqual(run(), run());
});

test('partidaDiaria: 5 ubicaciones iguales para todos ese día, cambian con la fecha y con la versión de datos', () => {
  const a = D.partidaDiaria(datos, '2026-10-07');
  const b = D.partidaDiaria(datos, '2026-10-07');
  assert.deepEqual(a, b);
  assert.equal(a.length, 5);
  assert.equal(new Set(a.map((l) => l.id)).size, 5);
  assert.equal(new Set(a.map((l) => l.cc)).size, 5, 'países distintos');
  assert.ok(a.every((l) => Number.isFinite(l.h)), 'con rumbo fijo (igual para todos)');
  assert.notDeepEqual(a.map((l) => l.id), D.partidaDiaria(datos, '2026-10-08').map((l) => l.id));
  const otraVersion = D.partidaDiaria({ ...datos, meta: { ...meta, v: 4 } }, '2026-10-07');
  assert.notDeepEqual(a.map((l) => l.id), otraVersion.map((l) => l.id));
  assert.match(dailyKey(new Date('2026-10-07T12:00:00Z')), /^2026-10-07$/);
  assert.equal(dailyKey(new Date('2026-10-07T02:00:00Z')), '2026-10-06', 'a las 2 UTC todavía es el día anterior en Argentina');
});

test('partidaDiaria avisa si faltan lugares', () => {
  assert.throws(() => D.partidaDiaria({ famosos: [], mundo: mundo.slice(0, 3), meta }, '2026-10-07'), (e) => e.code === 'vacio');
});

// ------------------------------------------------------------------ datos.js: guardado
test('opciones guardadas: valores válidos, descarta lo roto y no falla si localStorage no anda', () => {
  conAlmacen((m) => {
    assert.deepEqual(D.leerOpciones(), D.OPCIONES_DEF);
    D.guardarOpciones({ modo: 'pais', ambitoFamosos: 'AR', ambitoPais: 'FR', tiempo: 60, congelado: true });
    assert.ok(m.has('gameit:trotamundos:opts'), 'usa el prefijo gameit:trotamundos:');
    assert.deepEqual(D.leerOpciones(), { modo: 'pais', ambitoFamosos: 'AR', ambitoPais: 'FR', tiempo: 60, congelado: true });
    m.set('gameit:trotamundos:opts', JSON.stringify({ modo: 'hackeo', ambitoFamosos: '<img src=x>', ambitoPais: 'mundo', tiempo: 7, congelado: 'si' }));
    assert.deepEqual(D.leerOpciones(), D.OPCIONES_DEF, 'todo inválido vuelve a los valores por defecto');
    m.set('gameit:trotamundos:opts', '{no es json');
    assert.deepEqual(D.leerOpciones(), D.OPCIONES_DEF);
  });
  conAlmacen(() => {
    assert.deepEqual(D.leerOpciones(), D.OPCIONES_DEF);
    D.guardarOpciones({ modo: 'azar' }); // no tira
    D.marcarMala('x');
    assert.equal(D.leerMalas().size, 0);
  }, { falla: true });
  const sin = globalThis.localStorage;
  delete globalThis.localStorage; // como en una ventana privada o sin permiso
  assert.deepEqual(D.leerOpciones(), D.OPCIONES_DEF);
  assert.doesNotThrow(() => D.marcarMala('y'));
  if (sin !== undefined) globalThis.localStorage = sin;
});

test('marcarMala: recuerda las ubicaciones, sin duplicar y con tope', () => {
  conAlmacen((m) => {
    D.marcarMala('a');
    D.marcarMala('b');
    D.marcarMala('a');
    assert.deepEqual([...D.leerMalas()], ['b', 'a']);
    for (let i = 0; i < D.MAX_MALAS + 50; i++) D.marcarMala(`m-${i}`);
    const malas = D.leerMalas();
    assert.equal(malas.size, D.MAX_MALAS);
    assert.ok(malas.has(`m-${D.MAX_MALAS + 49}`) && !malas.has('a'), 'quedan las últimas');
    m.set('gameit:trotamundos:bad', JSON.stringify([1, null, 'ok']));
    assert.deepEqual([...D.leerMalas()], ['ok'], 'solo textos');
  });
});

// ------------------------------------------------------------------ mapa.js: dibujo
test('desenvolver: longitud continua cerca de la de referencia', () => {
  assert.equal(desenvolver(10, 0), 10);
  assert.equal(desenvolver(-179, 179), 181);
  assert.equal(desenvolver(179, -179), -181);
  assert.equal(desenvolver(350, 0), -10);
  near(desenvolver(190, 170), 190, 1e-9);
});

test('arco: de un punto a otro, continuo, sin saltos de 360° y con los extremos exactos', () => {
  const a = arco(-34.6, -58.4, 40.4, -3.7);
  assert.deepEqual(a[0], [-58.4, -34.6]);
  near(a.at(-1)[0], -3.7, 1e-9);
  near(a.at(-1)[1], 40.4, 1e-9);
  for (let i = 1; i < a.length; i++) assert.ok(Math.abs(a[i][0] - a[i - 1][0]) < 60, 'sin saltos');
  const cruza = arco(-33.9, 151.2, 21.3, -157.8); // Sídney → Honolulu por el antimeridiano
  for (let i = 1; i < cruza.length; i++) assert.ok(Math.abs(cruza[i][0] - cruza[i - 1][0]) < 60, 'cruza el antimeridiano sin saltar');
  assert.ok(cruza.at(-1)[0] > 180, 'la longitud final sigue de largo (202.2)');
  assert.equal(arco(10, 10, 10, 10).length, 2, 'mismo punto: un segmento');
  // el arco es la ruta más corta: su largo coincide con la distancia
  let km = 0;
  for (let i = 1; i < a.length; i++) km += distanceKm(a[i - 1][1], a[i - 1][0], a[i][1], a[i][0]);
  near(km, distanceKm(-34.6, -58.4, 40.4, -3.7), 5);
});

test('anillo: círculo geodésico cerrado, a la distancia pedida y continuo en el antimeridiano', () => {
  const r = anillo(10, 179, 500);
  assert.deepEqual(r[0], r.at(-1));
  for (const [x, y] of r) near(distanceKm(10, 179, y, x), 500, 2);
  for (let i = 1; i < r.length; i++) assert.ok(Math.abs(r[i][0] - r[i - 1][0]) < 20, 'no se parte');
  assert.ok(Math.max(...r.map((p) => p[0])) > 180, 'pasa de 180 en vez de saltar a -180');
});

test('camaraPara: el zoom entra todos los puntos, aun con más de una vuelta de longitud', () => {
  const caja = { ancho: 800, alto: 500, relleno: { top: 40, bottom: 40, left: 40, right: 40 } };
  const c = camaraPara([[0, 0], [0, 0]], caja);
  assert.equal(c.zoom, 12, 'un solo punto: zoom máximo');
  assert.deepEqual(c.center, [0, 0]);
  const z1 = camaraPara([[-10, -10], [10, 10]], caja).zoom;
  const z2 = camaraPara([[-20, -20], [20, 20]], caja).zoom;
  assert.ok(z1 > z2, 'más dispersión, menos zoom');
  near(z1 - z2, 1, 0.05, 'al duplicar la caja baja un nivel');
  const mundo = camaraPara([[-179, -60], [179, 70]], caja);
  assert.ok(mundo.zoom >= -1 && mundo.zoom <= 1, `mundo entero (${mundo.zoom})`);
  assert.ok((358 / 360) * 512 * 2 ** mundo.zoom <= 720 + 1, 'entra a lo ancho');
  const dosVueltas = camaraPara([[-200, 0], [200, 10]], { ...caja, ancho: 300 });
  assert.equal(dosVueltas.zoom, -1, 'tope mínimo');
  // relleno asimétrico: el centro se corre
  const r = camaraPara([[0, 0], [10, 10]], { ...caja, relleno: { top: 100, bottom: 0, left: 0, right: 0 } });
  assert.deepEqual(r.offset, [0, 50]);
  // la caja ocupa el área libre: con el zoom elegido entra justo en el ancho
  const ancho = 800 - 80;
  const px = (10 - -10) / 360 * 512 * 2 ** camaraPara([[-10, 0], [10, 0]], caja).zoom;
  near(px, ancho, 1, 'ocupa el ancho disponible');
});

test('colores del mapa: parsear, oscurecer y adaptar el estilo', () => {
  assert.deepEqual(parsearColor('#fff')?.l, 1);
  near(parsearColor('rgb(255, 0, 0)').h, 0, 0.01);
  near(parsearColor('hsl(120, 50%, 40%)').s, 0.5, 1e-9);
  near(parsearColor('rgba(0,0,0,0.5)').a, 0.5, 1e-9);
  assert.equal(parsearColor('blue'), null);
  assert.equal(parsearColor(5), null);
  const fondo = colorOscuro('rgb(239, 239, 239)', 'background-color', { id: 'background' });
  const mar = colorOscuro('rgb(194, 200, 202)', 'fill-color', { id: 'water' });
  assert.ok(parsearColor(mar).l < parsearColor(fondo).l, 'el mar queda más oscuro que la tierra');
  assert.ok(parsearColor(fondo).l < 0.3, 'fondo oscuro');
  const texto = colorOscuro('hsl(0, 0%, 20%)', 'text-color', { id: 'label' });
  assert.ok(parsearColor(texto).l > 0.6, 'los textos se aclaran');
  assert.equal(colorClaro('rgb(1,2,3)', 'fill-color', { id: 'park' }), 'rgb(1,2,3)');
  const base = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': 'rgb(239, 239, 239)' } }, { id: 'water', type: 'fill', paint: { 'fill-color': 'rgb(194, 200, 202)', 'fill-opacity': 0.5 } }, { id: 'sin-paint', type: 'symbol' }] };
  const og = JSON.stringify(base);
  const osc = adaptarEstilo(base, 'dark');
  assert.equal(JSON.stringify(base), og, 'no modifica el estilo original');
  assert.notEqual(osc.layers[0].paint['background-color'], base.layers[0].paint['background-color']);
  assert.equal(osc.layers[1].paint['fill-opacity'], 0.5, 'no toca lo que no es color');
  assert.equal(adaptarEstilo(base, 'light').layers[0].paint['background-color'], 'rgb(239, 239, 239)');
});

test('colorOscuro sobre el estilo real de OpenFreeMap (si hay una copia a mano) deja colores válidos', () => {
  let est;
  try {
    est = JSON.parse(readFileSync(process.env.TM_ESTILO || '/nonexistent', 'utf8'));
  } catch {
    return; // sin copia local del estilo: se prueba en el navegador
  }
  const osc = adaptarEstilo(est, 'dark');
  for (const capa of osc.layers) for (const [k, v] of Object.entries(capa.paint || {})) if (/-color$/.test(k) && typeof v === 'string') assert.ok(parsearColor(v), `${capa.id}.${k}: ${v}`);
});

// ------------------------------------------------------------------ textos
test('textos: todo en español e inglés, con las mismas variables, y traducir()', () => {
  for (const [k, v] of Object.entries(TEXTOS)) {
    assert.ok(typeof v.es === 'string' && v.es.length, `${k}: falta es`);
    assert.ok(typeof v.en === 'string' && v.en.length, `${k}: falta en`);
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(vars(v.es), vars(v.en), `${k}: las variables de es y en no coinciden`);
    assert.ok(!/<[a-z]/i.test(v.es + v.en), `${k}: sin HTML en los textos`);
    for (const marca of ['geoguessr', 'worldguessr']) assert.ok(!(v.es + v.en).toLowerCase().includes(marca), `${k}: nombre de otro juego`);
  }
  assert.equal(traducir('es', 'ronda', { n: 2, total: 5 }), 'Ronda 2/5');
  assert.equal(traducir('en', 'ronda', { n: 2, total: 5 }), 'Round 2/5');
  assert.equal(traducir('en', 'noExiste'), 'noExiste', 'si falta la clave se ve la clave');
  assert.equal(traducir('es', 'nLugares', {}), '{n} lugares', 'una variable que no llegó queda a la vista');
  assert.equal(traducir('fr', 'jugar'), 'Jugar', 'idioma desconocido: español');
});

test('textos: cada data-t / data-t-aria / data-t-title del HTML y cada clave usada en game.js existe', () => {
  const html = readFileSync(new URL('index.html', DIR), 'utf8');
  const claves = new Set([...html.matchAll(/data-t(?:-aria|-title)?="(\w+)"/g)].map((m) => m[1]));
  const js = readFileSync(new URL('game.js', DIR), 'utf8');
  for (const m of js.matchAll(/\bt\('(\w+)'/g)) claves.add(m[1]);
  for (const m of js.matchAll(/\bt\(`(\w+)_\$\{/g)) for (const k of Object.keys(TEXTOS)) if (k.startsWith(`${m[1]}_`)) claves.add(k);
  for (const k of claves) assert.ok(TEXTOS[k], `falta el texto "${k}"`);
  for (const modo of D.MODOS) assert.ok(TEXTOS[`m_${modo}`] && TEXTOS[`op_${modo}`], `modo ${modo}: nombre y descripción`);
  for (const c of ['AF', 'AS', 'EU', 'NA', 'SA', 'OC']) assert.ok(TEXTOS[`c_${c}`], `continente ${c}`);
});

// ------------------------------------------------------------------ reglas del repo
test('el cliente no usa innerHTML ni marcas ajenas, y localStorage va siempre con el prefijo gameit:trotamundos:', () => {
  for (const f of ['game.js', 'visor.js', 'mapa.js', 'datos.js', 'online.js', 'textos.js', 'config.js', 'index.html', 'style.css', 'game.json']) {
    const src = readFileSync(new URL(f, DIR), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), `${f}: HTML dinámico`);
    assert.ok(!/geoguessr|worldguessr/i.test(src), `${f}: nombre de otro juego`);
    for (const m of src.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*['"`]([^'"`]+)/g)) assert.ok(m[1].startsWith('gameit:trotamundos:'), `${f}: clave de localStorage sin prefijo (${m[1]})`);
  }
  const html = readFileSync(new URL('index.html', DIR), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) assert.match(m[1], /^\/(sdk|shared|vendor|games)\//, `ruta absoluta no permitida ${m[1]}`);
  const gj = JSON.parse(readFileSync(new URL('game.json', DIR), 'utf8'));
  assert.equal(gj.id, 'trotamundos');
  assert.deepEqual(gj.title, { es: 'Trotamundos', en: 'Globetrotter' });
  assert.equal(gj.features.maxPlayers, 10);
});

test('visor.js: constantes del truco de la tarjeta', async () => {
  const src = readFileSync(new URL('visor.js', DIR), 'utf8');
  assert.match(src, /MARGEN_TARJETA = 120/);
  assert.match(src, /BANDA_ABAJO = 28/);
  assert.match(src, /calc\(100% \+ \$\{MARGEN_TARJETA\}px\)/);
  assert.match(src, /overflow: 'hidden'/);
  const { MARGEN_TARJETA, BANDA_ABAJO } = await import('../../../public/games/trotamundos/visor.js');
  assert.equal(MARGEN_TARJETA, 120);
  assert.equal(BANDA_ABAJO, 28);
});
