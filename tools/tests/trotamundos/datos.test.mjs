// Pruebas de los datos de Trotamundos y de la lógica pura de tools/trotamundos-datos.mjs  ·  npm run test:trotamundos
// Sin red ni navegador: valida los archivos finales de public/games/trotamundos/datos/ y las funciones de la herramienta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ccDe, puntoEnAnillo, puntoEnPoligono, poligonosDe, crearPais, puntoEnPais, paisDe, diagonalKm, escalaPais, escalaAmbito,
  minKmPais, densificar, respetaDistancia, espaciar, lugarMasCercano, generarCandidatos, generarCandidatosCalles, esAtribucionOficial, panoDeEnlace,
  leerVisor, coincideNombre, motivoFamoso, claveDe, aceptarMundo, rumboHaciaSitio, construirPaises, serializarPaises, DATOS, CACHE, MAX_BYTES, VERSION_DATOS,
  MAX_CARGAS, RITMO_MAX_POR_MIN, FALLAS_BLANDAS_MAX, MAX_SITIO_KM, crearLimitador, crearFreno, teselaDe, lngLatDeTesela, decodificarMVT, lineasDeGeom,
  callesDeTesela, puntoEnCalle, sondasFamoso, elegirSonda, asignarIds, decidirVersion,
} from '../../trotamundos-datos.mjs';
import { FAMOSOS, PAISES_CORE, PAISES_PRUEBA, LATAM } from '../../trotamundos-semillas.mjs';
import { distanceKm, validCoord, WORLD_D, REGIONS, rngFrom, inScope, scopeScale } from '../../../public/games/trotamundos/shared/geo.js';

const leer = (n) => JSON.parse(readFileSync(join(DATOS, n), 'utf8'));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} no está a ${tol} de ${b}`);

// ------------------------------------------------------------------ lógica pura
const cuadrado = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];

test('puntoEnAnillo / puntoEnPoligono: dentro, fuera, agujeros y bordes de lat/lng negativos', () => {
  const anillo = cuadrado(-60, -40, -50, -30)[0];
  assert.equal(puntoEnAnillo(-55, -35, anillo), true);
  assert.equal(puntoEnAnillo(-45, -35, anillo), false);
  assert.equal(puntoEnAnillo(-55, -25, anillo), false);
  const conAgujero = [cuadrado(0, 0, 10, 10)[0], cuadrado(4, 4, 6, 6)[0]];
  assert.equal(puntoEnPoligono(2, 2, conAgujero), true);
  assert.equal(puntoEnPoligono(5, 5, conAgujero), false, 'adentro del agujero');
  assert.equal(puntoEnPoligono(11, 5, conAgujero), false);
  // forma cóncava en "U": el hueco no cuenta
  const u = [[[0, 0], [9, 0], [9, 9], [6, 9], [6, 3], [3, 3], [3, 9], [0, 9], [0, 0]]];
  assert.equal(puntoEnPoligono(1, 8, u), true);
  assert.equal(puntoEnPoligono(4.5, 8, u), false);
  assert.equal(puntoEnPoligono(4.5, 1, u), true);
});

test('poligonosDe y puntoEnPais: Polygon, MultiPolygon y recorte', () => {
  assert.equal(poligonosDe({ type: 'Polygon', coordinates: cuadrado(0, 0, 1, 1) }).length, 1);
  assert.equal(poligonosDe({ type: 'MultiPolygon', coordinates: [cuadrado(0, 0, 1, 1), cuadrado(5, 5, 6, 6)] }).length, 2);
  assert.deepEqual(poligonosDe({ type: 'Point', coordinates: [0, 0] }), []);
  const p = crearPais('XX', 'Equis', 'sudamerica', [cuadrado(0, 0, 10, 10), cuadrado(20, 0, 22, 2)]);
  assert.equal(puntoEnPais(5, 5, p), true);
  assert.equal(puntoEnPais(21, 1, p), true);
  assert.equal(puntoEnPais(15, 5, p), false, 'entre los dos polígonos');
  assert.equal(puntoEnPais(5, 5, p, [6, 0, 30, 10]), false, 'fuera del recorte');
  assert.equal(puntoEnPais(8, 5, p, [6, 0, 30, 10]), true);
  const q = crearPais('YY', 'Y', 'europa', [cuadrado(10, 10, 12, 12)]);
  assert.equal(paisDe(5, 5, [p, q]), 'XX');
  assert.equal(paisDe(11, 11, new Map([['XX', p], ['YY', q]])), 'YY');
  assert.equal(paisDe(50, 50, [p, q]), null);
});

test('ccDe: ISO_A2 vale "-99" en Francia y Noruega, se usa ISO_A2_EH', () => {
  assert.equal(ccDe({ ISO_A2: '-99', ISO_A2_EH: 'FR', ADM0_A3: 'FRA' }), 'FR');
  assert.equal(ccDe({ ISO_A2: '-99', ISO_A2_EH: 'NO', ADM0_A3: 'NOR' }), 'NO');
  assert.equal(ccDe({ ISO_A2: 'AR', ISO_A2_EH: 'AR' }), 'AR');
  assert.equal(ccDe({ ISO_A2: '-99', ISO_A2_EH: '-99', ADM0_A3: 'KOS' }), 'XK');
  assert.equal(ccDe({ ISO_A2: '-99', ISO_A2_EH: '-99', ADM0_A3: 'SOL' }), null);
});

test('escalaPais: rectángulo sin islas lejanas y mínimo de 250 km', () => {
  const principal = cuadrado(-70, -40, -60, -30); // ~1.350 km de diagonal
  const isla = cuadrado(-110, -30, -109, -29); // a miles de km
  const vecina = cuadrado(-59.5, -42, -57.5, -40); // cerca y de buen tamaño relativo
  const p = crearPais('XX', 'X', 'sudamerica', [principal, isla, vecina]);
  const sola = crearPais('XX', 'X', 'sudamerica', [principal]);
  assert.equal(escalaPais(p), escalaPais(crearPais('XX', 'X', 'sudamerica', [principal, vecina])), 'la isla lejana no cuenta');
  assert.ok(escalaPais(p) > escalaPais(sola), 'la vecina sí');
  near(escalaPais(sola), diagonalKm([-70, -40, -60, -30]), 1, 'diagonal');
  assert.equal(escalaPais(crearPais('MC', 'M', 'europa', [cuadrado(7.4, 43.7, 7.45, 43.75)])), 250, 'mínimo 250');
  // con recorte, solo cuenta esa zona
  const grande = crearPais('US', 'U', 'norteamerica', [cuadrado(-120, 25, -70, 49), cuadrado(-160, 55, -140, 70)]);
  assert.ok(escalaPais(grande, [-125, 24, -66.5, 49.6]) < escalaPais(grande));
});

test('escalaAmbito: ignora valores extremos y respeta el mínimo', () => {
  const rng = rngFrom('ambito');
  const pts = Array.from({ length: 1000 }, () => ({ lat: -30 + rng() * 10, lng: -60 + rng() * 10 }));
  const base = escalaAmbito(pts);
  near(escalaAmbito([...pts, { lat: 60, lng: 100 }]), base, base * 0.01, 'un punto extremo casi no mueve la escala');
  assert.ok(escalaAmbito(pts, 0) > base, 'sin recorte el rectángulo es mayor o igual');
  assert.equal(escalaAmbito([{ lat: 0, lng: 0 }]), 250);
  assert.equal(escalaAmbito([]), 250);
});

test('minKmPais: 5 km en países chicos y 15 km en el resto', () => {
  assert.equal(minKmPais([6.0, 49.4, 6.5, 50.2]), 5, 'Luxemburgo');
  assert.equal(minKmPais([-73.6, -55.1, -53.6, -21.8]), 15, 'Argentina');
  assert.equal(minKmPais([-58.4, -35, -53.2, -30.1]), 15, 'Uruguay');
});

test('densificar: puntos cada ~paso km con rumbo, también en tramos cortos', () => {
  const linea = [[0, 0], [1, 0]]; // ~111 km sobre el ecuador, rumbo este
  const pts = densificar(linea, 10);
  assert.ok(pts.length >= 10 && pts.length <= 12, `cantidad ${pts.length}`);
  near(pts[0].h, 90, 0.01, 'rumbo');
  near(distanceKm(pts[0].lat, pts[0].lng, pts[1].lat, pts[1].lng), 10, 0.3, 'paso');
  const corto = densificar([[0, 0], [0.01, 0]], 10); // 1,1 km
  assert.equal(corto.length, 0, 'un tramo más corto que medio paso no aporta puntos');
  const mixto = densificar([[0, 0], [0.04, 0], [0.04, 0.04], [0.08, 0.04]], 3);
  assert.ok(mixto.length >= 4, 'sigue el paso a través de los vértices');
});

test('respetaDistancia y espaciar: distancias mínimas entre lugares', () => {
  const a = { lat: -34.6, lng: -58.4 };
  const b = { lat: -34.6, lng: -58.2 }; // ~18 km
  const c = { lat: -34.6, lng: -58.3 }; // ~9 km de a y de b
  assert.equal(respetaDistancia(c.lat, c.lng, [a], 15), false);
  assert.equal(respetaDistancia(b.lat, b.lng, [a], 15), true);
  assert.equal(respetaDistancia(c.lat, c.lng, [], 15), true);
  assert.deepEqual(espaciar([a, c, b], 15), [a, b], 'conserva el orden y descarta el que queda cerca');
  assert.deepEqual(espaciar([a, c, b], 5), [a, c, b]);
});

test('lugarMasCercano: el más cercano a menos de 100 km, o nada', () => {
  const lugares = [{ lat: 0, lng: 0, n: 'Cero' }, { lat: 0.5, lng: 0, n: 'Medio' }, { lat: 5, lng: 5, n: 'Lejos' }];
  assert.equal(lugarMasCercano(0.4, 0, lugares), 'Medio');
  assert.equal(lugarMasCercano(0.1, 0, lugares), 'Cero');
  assert.equal(lugarMasCercano(2.5, 2.5, lugares), null, 'a más de 100 km');
  assert.equal(lugarMasCercano(0, 0, []), null);
});

test('generarCandidatos: espaciados, dentro del país y reproducibles', () => {
  const pais = crearPais('XX', 'X', 'sudamerica', [cuadrado(0, 0, 4, 4)]);
  const rutas = [];
  for (let x = -1; x <= 5; x += 0.05) rutas.push({ lat: 2, lng: x, h: 90 });
  const pueblos = [{ lat: 1, lng: 1, tipo: 'c' }, { lat: 3, lng: 3, tipo: 'c' }, { lat: 3.0005, lng: 3.0005, tipo: 'g' }, { lat: 1, lng: 3, tipo: 'g' }, { lat: 9, lng: 9, tipo: 'g' }];
  const hacer = () => generarCandidatos({ pais, rutas, pueblos, cantRutas: 6, cantPueblos: 10, minKm: 15, rng: rngFrom('t'), recorte: [0, 0, 4, 4] });
  const a = hacer();
  assert.deepEqual(a, hacer(), 'misma semilla, mismo resultado');
  assert.equal(a.r.length, 6);
  for (const [lat, lng, h] of a.r) {
    assert.ok(puntoEnPais(lng, lat, pais), 'dentro del país');
    assert.ok(h === 90 || h === 270, 'rumbo de la ruta, en un sentido o en el otro');
  }
  assert.equal(espaciar(a.r.map(([lat, lng]) => ({ lat, lng })), 15).length, a.r.length, 'rutas a 15 km o más');
  assert.equal(a.c.length, 3, 'pueblos: el de (3.0005, 3.0005) queda a menos de 1 km del otro y el de (9, 9) fuera del recorte');
  assert.deepEqual(a.c.map((x) => x[2]).slice(0, 2).sort(), ['c', 'c'], 'primero los de Natural Earth');
});

test('visor: atribución oficial, enlace de la panorámica y estados', () => {
  assert.equal(esAtribucionOficial('© 2026 Google'), true);
  assert.equal(esAtribucionOficial('© 2012 Google'), true);
  assert.equal(esAtribucionOficial('© Martín Rodriguez'), false);
  assert.equal(esAtribucionOficial('© 2024 Googler Fernández'), false);
  assert.equal(esAtribucionOficial(null), false);
  const href = 'https://www.google.com/maps/@-31.4001917,-64.1995963,0a,73.7y,90t/data=!3m4!1e1!3m2!1sAonxaEM_uGBcg7C-O1jUcA!2e0?source=apiv3';
  assert.deepEqual(panoDeEnlace(href), { lat: -31.4001917, lng: -64.1995963, pid: 'AonxaEM_uGBcg7C-O1jUcA' });
  assert.equal(panoDeEnlace('https://example.com/'), null);
  const texto = '951 Chubut\nCórdoba, Córdoba Province\nView on Google Maps\nRotate the view\nKeyboard shortcuts\n© 2026 Google\nTerms\nReport a problem';
  const ok = leerVisor(texto, ['https://www.google.com/maps/embed?pb=x#', href]);
  assert.equal(ok.estado, 'ok');
  assert.equal(ok.oficial, true);
  assert.equal(ok.card, '951 Chubut | Córdoba, Córdoba Province');
  assert.equal(ok.pano.pid, 'AonxaEM_uGBcg7C-O1jUcA');
  const usuario = leerVisor('Obelisk\nView on Google Maps\n© Martín Rodriguez\nTerms', [href]);
  assert.equal(usuario.estado, 'ok');
  assert.equal(usuario.oficial, false);
  assert.equal(leerVisor('No Street View available.', []).estado, 'sin-imagen');
  assert.equal(leerVisor('No hay imágenes disponibles de Street View.', []).estado, 'sin-imagen');
  assert.equal(leerVisor('Our systems have detected unusual traffic from your computer network', []).estado, 'bloqueo');
  assert.equal(leerVisor('Please complete the CAPTCHA', []).estado, 'bloqueo');
  assert.equal(leerVisor('', []).estado, 'esperando');
  assert.equal(leerVisor('© 2026 Google', []).estado, 'esperando', 'sin enlace todavía no está listo');
});

test('coincideNombre: palabras propias del sitio, no genéricas', () => {
  assert.equal(coincideNombre('Obelisk', ['Obelisco', 'Obelisk of Buenos Aires']), true);
  assert.equal(coincideNombre('Foz do Iguaçu - Cataratas', ['Cataratas do Iguaçu', 'Iguaçu Falls']), true);
  assert.equal(coincideNombre('Plaza Mayor', ['Plaza de Mayo', 'Plaza de Mayo']), false, '"plaza" es genérica');
  assert.equal(coincideNombre('', ['Obelisco']), false);
  assert.equal(coincideNombre('Théâtre Colón', ['Teatro Colón', 'Teatro Colón']), true, 'sin tildes');
});

test('aceptarMundo: oficiales, mismo país, sin repetidos y a distancia mínima', () => {
  const mk = (lat, lng, pid, extra = {}) => ({ k: claveDe('m', lat, lng), estado: 'ok', oficial: true, pano: { lat, lng, pid }, ...extra });
  const recs = [
    mk(-34.6, -58.4, 'a'),
    mk(-34.6, -58.35, 'b'), // a ~5 km del primero
    mk(-34.6, -58.2, 'c'), // ok
    mk(-34.6, -58.2, 'c', { k: 'otro' }), // misma panorámica
    mk(-34.6, -58.0, 'd', { oficial: false }), // de usuario
    { k: 'x', estado: 'sin-imagen', oficial: false, pano: null },
    mk(-34.6, -57.8, 'e'),
    mk(-34.6, -57.4, 'f'),
  ];
  const ccDePano = (lng) => (lng > -57.5 ? 'UY' : 'AR');
  const r = aceptarMundo(recs, { cc: 'AR', minKm: 15, ccDePano, descartes: new Set([claveDe('m', -34.6, -57.8)]) });
  assert.deepEqual(r.aceptados.map((x) => x.pano.pid), ['a', 'c']);
  assert.deepEqual(r.rechazados, { 'muy-cerca': 1, repetido: 1, 'descarte-manual': 1, 'pais-distinto': 1 });
  assert.equal(aceptarMundo(recs, { cc: 'AR', minKm: 1, ccDePano: () => 'AR' }).aceptados.length, 5);
});

test('rumboHaciaSitio: hacia el sitio, o nada si está a menos de 20 m', () => {
  assert.equal(rumboHaciaSitio({ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 }), 0);
  assert.equal(rumboHaciaSitio({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }), 90);
  assert.equal(rumboHaciaSitio({ lat: 0, lng: 0 }, { lat: -0.01, lng: 0 }), 180);
  assert.equal(rumboHaciaSitio({ lat: 0, lng: 0 }, { lat: 0, lng: -0.01 }), 270);
  assert.equal(rumboHaciaSitio({ lat: 0, lng: 0 }, { lat: 0.00005, lng: 0 }), null);
});

test('construirPaises y serializarPaises: n, f, latam, cont y regiones', () => {
  const geo = new Map([['AR', { cont: 'sudamerica', d: 4100 }], ['FR', { cont: 'europa', d: 1100 }], ['US', { cont: 'norteamerica', d: 4600 }]]);
  const mundo = [{ id: 'm-0001', lat: -34, lng: -58, cc: 'AR' }, { id: 'm-0002', lat: -40, lng: -65, cc: 'AR' }, { id: 'm-0003', lat: 48, lng: 2, cc: 'FR' }];
  const famosos = [{ id: 'f-001', lat: -34.6, lng: -58.4, cc: 'AR', n: { es: 'Obelisco', en: 'Obelisk' } }, { id: 'f-002', lat: 40.7, lng: -74, cc: 'US', n: { es: 'x', en: 'x' } }];
  const m = construirPaises({ famosos, mundo, geo, generado: '2026-10-07' });
  assert.deepEqual(m.paises.AR, { cont: 'sudamerica', latam: 1, d: 4100, n: 2, f: 1 });
  assert.deepEqual(m.paises.FR, { cont: 'europa', d: 1100, n: 1, f: 0 });
  assert.deepEqual(m.paises.US, { cont: 'norteamerica', d: 4600, n: 0, f: 1 });
  assert.equal(m.v, VERSION_DATOS);
  assert.equal(m.regiones.mundo.d, WORLD_D);
  assert.ok(m.regiones.latam.d >= 250 && m.regiones.sudamerica.d >= 250 && m.regiones.europa.d >= 250);
  assert.equal(m.regiones.africa, undefined, 'sin puntos no hay región');
  const otra = JSON.parse(serializarPaises(m));
  assert.deepEqual(otra, JSON.parse(JSON.stringify(m)), 'el texto se lee igual');
  assert.throws(() => construirPaises({ famosos: [{ id: 'f-9', lat: 0, lng: 0, cc: 'ZZ' }], mundo: [], geo, generado: 'x' }), /ZZ/);
});

test('presupuesto y frenos: tope de 5.000 cargas, 30 por minuto y 8 fallas blandas seguidas', () => {
  assert.equal(MAX_CARGAS, 5000);
  assert.equal(RITMO_MAX_POR_MIN, 30);
  assert.equal(FALLAS_BLANDAS_MAX, 8);
  assert.equal(MAX_SITIO_KM, 0.25);
});

test('crearLimitador: nunca más de N cargas empezadas en una ventana, y se libera al pasar el tiempo', () => {
  let t = 1000;
  const lim = crearLimitador(30, 60000, () => t);
  for (let i = 0; i < 30; i++) {
    assert.equal(lim.espera(), 0, `la carga ${i + 1} entra`);
    lim.marcar();
    t += 100; // 30 cargas en 3 s: un pico de 600 por minuto
  }
  const falta = lim.espera();
  assert.ok(falta > 56000 && falta <= 60000, `la 31.ª tiene que esperar casi un minuto (${falta} ms)`);
  t += falta;
  assert.equal(lim.espera(), 0, 'pasó el minuto de la primera');
  lim.marcar();
  // simulación: 3 trabajadores que cargan lo más rápido que pueden durante 10 minutos; en cualquier ventana de 60 s hay 30 o menos
  t = 0;
  const lim2 = crearLimitador(30, 60000, () => t);
  const inicios = [];
  while (t < 600000) {
    const w = lim2.espera();
    if (w > 0) t += w;
    else {
      lim2.marcar();
      inicios.push(t);
      t += 700; // cada carga tarda 0,7 s en llegar a la siguiente
    }
  }
  for (let i = 0; i + 30 < inicios.length; i++) assert.ok(inicios[i + 30] - inicios[i] >= 60000, `ventana ${i}: 31 cargas en menos de un minuto`);
  assert.ok(inicios.length >= 280 && inicios.length <= 310, `unas 300 cargas en 10 minutos (${inicios.length})`);
});

test('crearFreno: frena a las 8 fallas blandas seguidas y una buena lectura reinicia la cuenta', () => {
  const f = crearFreno(FALLAS_BLANDAS_MAX);
  for (let i = 0; i < 7; i++) assert.equal(f.falla(), false);
  assert.equal(f.seguidas, 7);
  f.ok();
  assert.equal(f.seguidas, 0);
  for (let i = 0; i < 7; i++) assert.equal(f.falla(), false);
  assert.equal(f.falla(), true, 'la 8.ª seguida frena');
});

// ------------------------------------------------------------------ calles (teselas vectoriales)
/** Arma a mano una tesela MVT mínima con una capa "transportation" y las líneas dadas (para probar el lector sin red). */
function teselaDePrueba(lineas, extent = 4096) {
  const varint = (n) => {
    const out = [];
    n = Math.floor(n);
    while (n > 127) {
      out.push((n % 128) | 128);
      n = Math.floor(n / 128);
    }
    out.push(n);
    return out;
  };
  const campo = (f, t, bytes) => [...varint(f * 8 + t), ...bytes];
  const len = (f, bytes) => campo(f, 2, [...varint(bytes.length), ...bytes]);
  const str = (f, txt) => len(f, [...Buffer.from(txt)]);
  const zz = (n) => (n << 1) ^ (n >> 31);
  const claves = ['class', 'subclass', 'brunnel'];
  const valores = [];
  const vi = (v) => {
    if (!valores.includes(v)) valores.push(v);
    return valores.indexOf(v);
  };
  const feats = lineas.map((l) => {
    const geom = [(1 << 3) | 1, zz(l.pts[0][0]), zz(l.pts[0][1]), ((l.pts.length - 1) << 3) | 2];
    for (let i = 1; i < l.pts.length; i++) geom.push(zz(l.pts[i][0] - l.pts[i - 1][0]), zz(l.pts[i][1] - l.pts[i - 1][1]));
    const tags = [];
    [l.c, l.s, l.b].forEach((v, k) => {
      if (v) tags.push(k, vi(v));
    });
    return len(2, [...len(2, tags.flatMap((x) => varint(x))), ...campo(3, 0, varint(l.tipo ?? 2)), ...len(4, geom.flatMap((x) => varint(x)))]);
  });
  const cuerpo = [...str(1, 'transportation'), ...feats.flat(), ...claves.flatMap((k) => str(3, k)), ...valores.flatMap((v) => len(4, str(1, v))), ...campo(5, 0, varint(extent)), ...campo(15, 0, [2])];
  return Buffer.from(len(3, cuerpo));
}

test('teselaDe y lngLatDeTesela: ida y vuelta en el zoom 14', () => {
  const { x, y } = teselaDe(-26.2041, 28.0473, 14);
  assert.deepEqual([x, y], [9468, 9428]);
  const [lng0, lat0] = lngLatDeTesela(14, x, y, 0, 0);
  const [lng1, lat1] = lngLatDeTesela(14, x, y, 4096, 4096);
  assert.ok(lng0 <= 28.0473 && 28.0473 <= lng1 && lat1 <= -26.2041 && -26.2041 <= lat0, 'la tesela contiene el punto');
  near(distanceKm(lat0, lng0, lat1, lng1), 3.4, 0.4, 'diagonal de una tesela z14 a 26° S');
  assert.deepEqual(Object.values(teselaDe(0, 0, 1)), [1, 1]);
});

test('decodificarMVT / callesDeTesela: lee líneas, filtra túneles, senderos y accesos, y baja a lng/lat', () => {
  const buf = teselaDePrueba([
    { c: 'primary', pts: [[0, 2048], [4096, 2048]] },
    { c: 'minor', pts: [[100, 100], [200, 300], [400, 300]] },
    { c: 'primary', b: 'tunnel', pts: [[0, 0], [10, 10]] },
    { c: 'path', s: 'footway', pts: [[0, 0], [10, 10]] },
    { c: 'path', s: 'pedestrian', pts: [[500, 500], [900, 500]] },
    { c: 'service', s: 'driveway', pts: [[0, 0], [10, 10]] },
    { c: 'rail', pts: [[0, 0], [10, 10]] },
    { c: 'service', s: 'alley', pts: [[1000, 1000], [1200, 1000]] },
    { c: 'primary', tipo: 3, pts: [[0, 0], [10, 10]] },
  ]);
  const capas = decodificarMVT(buf);
  assert.equal(capas.transportation.extent, 4096);
  assert.equal(capas.transportation.features.length, 9);
  assert.deepEqual(capas.transportation.features[0].props, { class: 'primary' });
  assert.deepEqual(lineasDeGeom(capas.transportation.features[1].geom), [[[100, 100], [200, 300], [400, 300]]]);
  const calles = callesDeTesela(buf, 14, 9468, 9428);
  assert.deepEqual(calles.map((c) => c.c), ['primary', 'minor', 'pedestrian', 'service'], 'sin túnel, sendero, acceso, riel ni polígono');
  const [lng0, lat0] = lngLatDeTesela(14, 9468, 9428, 0, 2048);
  near(calles[0].p[0][0], lng0, 1e-6, 'lng');
  near(calles[0].p[0][1], lat0, 1e-6, 'lat');
  assert.equal(calles[0].p.length, 2);
  assert.equal(decodificarMVT(buf, 'otra').transportation, undefined);
});

test('puntoEnCalle: se pega a la calle más cercana, prefiere las grandes y no inventa nada lejos', () => {
  const calles = [
    { c: 'primary', p: [[-58.4, -34.6], [-58.3, -34.6]] }, // este-oeste a lat -34.6
    { c: 'service', p: [[-58.35, -34.6004], [-58.35, -34.61]] }, // calle de servicio casi pegada
  ];
  const a = puntoEnCalle(-34.6003, -58.36, calles, { radioM: 200 });
  assert.equal(a.c, 'primary');
  near(a.lat, -34.6, 1e-6, 'lat sobre la primaria');
  near(a.lng, -58.36, 1e-6, 'lng');
  assert.ok(a.distM >= 30 && a.distM <= 40, `a ${a.distM} m`);
  assert.ok(a.h === 90 || a.h === 270 || a.h === 89 || a.h === 91 || Math.abs(a.h - 90) < 2, `rumbo ${a.h}`);
  assert.equal(puntoEnCalle(-34.7, -58.36, calles, { radioM: 200 }), null, 'a más de 200 m de todo');
  assert.equal(puntoEnCalle(-34.6, -58.36, [], { radioM: 200 }), null);
  const mismo = () => puntoEnCalle(-34.6003, -58.35, calles, { radioM: 300, rng: rngFrom('x') });
  assert.deepEqual(mismo(), mismo(), 'con la misma semilla, el mismo punto');
});

test('sondasFamoso: primero la calle más cercana, después puntos de 45 a 210 m en direcciones distintas, sin repetir zonas', () => {
  const sitio = { lat: -34.6037, lng: -58.3816 };
  const k = 111320 * Math.cos((sitio.lat * Math.PI) / 180);
  const m = (dx, dy) => [sitio.lng + dx / k, sitio.lat + dy / 110574];
  const calles = [
    { c: 'primary', p: [m(-250, 30), m(250, 30)] }, // calle E-O a 30 m al norte
    { c: 'secondary', p: [m(120, -250), m(120, 250)] }, // calle N-S a 120 m al este
    { c: 'minor', p: [m(-90, -250), m(-90, 250)] }, // calle N-S a 90 m al oeste
    { c: 'minor', p: [m(-250, -150), m(250, -150)] }, // calle E-O a 150 m al sur
  ];
  const l = sondasFamoso(sitio, calles, { n: 6 });
  assert.ok(l.length >= 4 && l.length <= 6);
  assert.ok(l[0].dist <= 35, `la primera es la calle más cercana (${l[0].dist} m)`);
  for (const p of l.slice(1)) assert.ok(p.dist >= 45 && p.dist <= 210, `sonda a ${p.dist} m`);
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) assert.ok(distanceKm(l[i].lat, l[i].lng, l[j].lat, l[j].lng) >= 0.04, 'a 40 m o más entre sí');
  // con un punto ya probado (la primera tanda probó el sitio mismo), no se vuelve a esa zona
  const sig = sondasFamoso(sitio, calles, { n: 3, probados: [{ lat: sitio.lat, lng: sitio.lng }] });
  assert.ok(sig.every((p) => p.dist >= 45), 'nada a menos de 45 m del sitio ya probado');
  // sin calles cerca, se prueba el sitio mismo
  assert.deepEqual(sondasFamoso(sitio, [], { n: 3 }), [{ lat: sitio.lat, lng: sitio.lng, dist: 0, c: 'sitio' }]);
});

test('generarCandidatosCalles: los más poblados primero, espaciados y reproducibles', () => {
  const pueblos = [];
  for (let i = 0; i < 60; i++) pueblos.push({ lat: -30 + (i % 10) * 0.2, lng: -60 + Math.floor(i / 10) * 0.2, tipo: i < 4 ? 'c' : 'g', pop: i < 4 ? (i + 1) * 1000 : 0 });
  const hacer = () => generarCandidatosCalles({ pueblos, cant: 20, minKm: 5, rng: rngFrom('c'), recorte: null });
  const a = hacer();
  assert.deepEqual(a, hacer());
  assert.ok(a.length > 0 && a.length <= 20);
  assert.ok(a.every((x) => x[2] === 's'));
  assert.equal(espaciar(a.map(([lat, lng]) => ({ lat, lng })), 5).length, a.length, 'a 5 km o más');
  const [lat, lng] = a[0];
  assert.equal(`${lat},${lng}`, `${pueblos[3].lat},${pueblos[3].lng}`, 'primero el más poblado');
  const sin = generarCandidatosCalles({ pueblos, cant: 50, minKm: 5, rng: rngFrom('c'), recorte: [-60, -30, -59.9, -29.9] });
  assert.ok(sin.every(([la, ln]) => ln >= -60 && ln <= -59.9 && la >= -30 && la <= -29.9), 'solo dentro del recorte');
});

test('elegirSonda: foto oficial a menos de 250 m y no descartada; con revisión exige la aprobación a ojo', () => {
  const r = (pid, extra = {}) => ({ t: 'fp', estado: 'ok', oficial: true, distSitio: 0.1, pano: { pid }, ...extra });
  const sondas = [r('a', { oficial: false }), r('b', { distSitio: 0.3 }), r('c'), r('d')];
  assert.equal(elegirSonda(sondas)?.pano.pid, 'c');
  assert.equal(elegirSonda(sondas, {}, { no: { c: 'interior' } })?.pano.pid, 'd');
  assert.equal(elegirSonda(sondas, {}, { ok: ['d'], no: { c: 'interior' } }, { exigirRevision: true })?.pano.pid, 'd');
  assert.equal(elegirSonda(sondas, {}, {}, { exigirRevision: true }), null, 'sin revisión no entra');
  assert.equal(elegirSonda(sondas, { max: 0.5 })?.pano.pid, 'b');
  assert.equal(elegirSonda([]), null);
});

test('asignarIds: conserva los ids de lo que sigue y nunca reutiliza el de uno que se sacó', () => {
  const previo = new Map([['1,1', 'm-0001'], ['2,2', 'm-0002'], ['3,3', 'm-0003']]);
  // se saca el m-0003 (el más alto) y entran dos lugares nuevos: no pueden heredar m-0003
  const r = asignarIds([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 9, lng: 9 }, { lat: 8, lng: 8 }], previo, 3);
  assert.deepEqual(r.ids, ['m-0001', 'm-0002', 'm-0004', 'm-0005']);
  assert.equal(r.max, 5);
  // sin historial, igual sigue desde el más alto de los que se conservan
  assert.deepEqual(asignarIds([{ lat: 2, lng: 2 }, { lat: 7, lng: 7 }], previo, 0).ids, ['m-0002', 'm-0003']);
  // un id no se asigna dos veces aunque dos lugares caigan en la misma posición
  assert.deepEqual(asignarIds([{ lat: 1, lng: 1 }, { lat: 1, lng: 1 }], previo, 3).ids, ['m-0001', 'm-0004']);
});

test('decidirVersion: sube solo si cambió el contenido; si no, queda la versión y la fecha de antes', () => {
  const fam = [{ id: 'f-001', lat: 1, lng: 2, cc: 'AR', n: { es: 'a', en: 'a' } }];
  const mun = [{ id: 'm-0001', lat: 3, lng: 4, cc: 'AR' }];
  const meta = (extra = {}) => ({ v: 9, generado: '2026-11-01', paises: { AR: { n: 1, f: 1 } }, regiones: { mundo: { d: 1 } }, ...extra });
  const prevMeta = { v: 2, generado: '2026-10-09', paises: { AR: { n: 1, f: 1 } }, regiones: { mundo: { d: 1 } } };
  const sin = decidirVersion({ prevMeta, prevFam: fam, prevMundo: mun, famosos: fam, mundo: mun, meta: meta() });
  assert.deepEqual(sin, { v: 2, generado: '2026-10-09', igual: true });
  const con = decidirVersion({ prevMeta, prevFam: fam, prevMundo: mun, famosos: fam, mundo: [...mun, { id: 'm-0002', lat: 5, lng: 6, cc: 'AR' }], meta: meta() });
  assert.deepEqual(con, { v: 3, generado: '2026-11-01', igual: false });
  const metodo = decidirVersion({ prevMeta, prevFam: fam, prevMundo: mun, famosos: fam, mundo: mun, meta: meta({ metodo: 'otro texto', ids: { f: 5, m: 5 } }) });
  assert.equal(metodo.igual, true, 'el texto del método o los ids no cuentan como cambio');
  assert.equal(decidirVersion({ prevMeta: null, prevFam: [], prevMundo: [], famosos: fam, mundo: mun, meta: meta() }).v, VERSION_DATOS, 'primera vez: la versión mínima');
  assert.equal(decidirVersion({ prevMeta: { ...prevMeta, v: 1 }, prevFam: fam, prevMundo: mun, famosos: fam, mundo: [], meta: meta() }).v, VERSION_DATOS, 'de la v 1 a la v 2');
  assert.equal(decidirVersion({ prevMeta, prevFam: fam, prevMundo: mun, famosos: [], mundo: mun, meta: meta(), forzar: '7' }).v, 7);
});

test('semillas: sin países repetidos, latam coherente y famosos bien armados', () => {
  const ccs = [...PAISES_CORE.map((p) => p[0]), ...PAISES_PRUEBA];
  assert.equal(new Set(ccs).size, ccs.length, 'países repetidos en la lista');
  for (const [cc, cuota] of PAISES_CORE) assert.ok(/^[A-Z]{2}$/.test(cc) && cuota > 0);
  for (const cc of LATAM) assert.ok(/^[A-Z]{2}$/.test(cc));
  const nombres = new Set();
  for (const [cc, es, en, lat, lng] of FAMOSOS) {
    assert.match(cc, /^[A-Z]{2}$/);
    assert.ok(es && en, `nombres de ${cc} ${es}`);
    assert.ok(validCoord(lat, lng), `coordenadas de ${en}`);
    assert.ok(!nombres.has(en), `repetido: ${en}`);
    nombres.add(en);
  }
});

// ------------------------------------------------------------------ archivos finales
const hayDatos = existsSync(join(DATOS, 'paises.json')) && readdirSync(DATOS).length > 0;

test('datos/: existen los cuatro archivos y todo pesa menos de 400 KB', { skip: !hayDatos }, () => {
  const nombres = readdirSync(DATOS);
  for (const n of ['famosos.json', 'mundo.json', 'paises.json', 'CREDITOS.txt']) assert.ok(nombres.includes(n), `falta ${n}`);
  const total = nombres.reduce((s, n) => s + statSync(join(DATOS, n)).size, 0);
  assert.ok(total < MAX_BYTES, `datos/ pesa ${total} bytes`);
  const cred = readFileSync(join(DATOS, 'CREDITOS.txt'), 'utf8');
  assert.match(cred, /Natural Earth/);
  assert.match(cred, /OpenStreetMap|OpenFreeMap/);
  assert.doesNotMatch(cred + JSON.stringify(leer('paises.json').metodo), new RegExp(['geo' + 'guessr', 'world' + 'guessr'].join('|'), 'i'), 'sin marcas de otros juegos');
});

test('paises.json: versión, fecha, método, países y regiones', { skip: !hayDatos }, () => {
  const p = leer('paises.json');
  assert.ok(Number.isInteger(p.v) && p.v >= VERSION_DATOS, `v ${p.v} (mínimo ${VERSION_DATOS})`);
  assert.match(p.generado, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(typeof p.metodo === 'string' && p.metodo.length > 50);
  for (const [cc, e] of Object.entries(p.paises)) {
    assert.match(cc, /^[A-Z]{2}$/);
    assert.ok(REGIONS.includes(e.cont), `${cc}: cont ${e.cont}`);
    assert.ok(e.latam === undefined || e.latam === 1, `${cc}: latam`);
    assert.ok(Number.isFinite(e.d) && e.d >= 250 && e.d <= WORLD_D, `${cc}: d ${e.d}`);
    assert.ok(Number.isInteger(e.n) && e.n >= 0 && Number.isInteger(e.f) && e.f >= 0, `${cc}: n/f`);
    assert.ok(e.n + e.f > 0, `${cc}: sin datos`);
  }
  for (const [cc, e] of Object.entries(p.paises)) assert.ok(e.k === 5 || e.k === 15, `${cc}: k (distancia mínima entre lugares) ${e.k}`);
  for (const cc of ['AR', 'BR', 'US', 'CA', 'AU', 'RU', 'IN', 'ID', 'FR', 'ZA', 'JP']) assert.equal(p.paises[cc]?.k, 15, `${cc} es un país grande: 15 km`);
  for (const cc of ['LU', 'SG', 'MT']) if (p.paises[cc]) assert.equal(p.paises[cc].k, 5, `${cc} es un país chico: 5 km`);
  assert.ok(p.ids && Number.isInteger(p.ids.m) && Number.isInteger(p.ids.f), 'ids: el id más alto que se usó de cada prefijo');
  assert.equal(p.regiones.mundo.d, WORLD_D);
  assert.ok(p.regiones.latam.d >= 250 && p.regiones.latam.d <= WORLD_D);
  for (const c of REGIONS) if (p.regiones[c]) assert.ok(p.regiones[c].d >= 250 && p.regiones[c].d <= WORLD_D, c);
  for (const cc of LATAM) if (p.paises[cc]) assert.equal(p.paises[cc].latam, 1, `${cc} es de Latinoamérica`);
  for (const [cc, e] of Object.entries(p.paises)) if (!LATAM.includes(cc)) assert.equal(e.latam, undefined, `${cc} no es de Latinoamérica`);
  // el ámbito y la escala que usa el juego andan con estos datos
  assert.equal(inScope({ cc: 'AR' }, 'latam', p), true);
  assert.equal(inScope({ cc: 'FR' }, 'latam', p), false);
  assert.equal(inScope({ cc: 'FR' }, 'europa', p), true);
  assert.ok(scopeScale('AR', p) >= 250 && scopeScale('latam', p) >= 250);
});

test('famosos.json: esquema, ids únicos, países conocidos, nombres es/en y coherencia con paises.json', { skip: !hayDatos }, () => {
  const f = leer('famosos.json');
  const p = leer('paises.json');
  assert.ok(Array.isArray(f) && f.length > 0);
  const ids = new Set();
  const cuenta = {};
  for (const x of f) {
    assert.match(x.id, /^f-\d{3,}$/);
    assert.ok(!ids.has(x.id), `id repetido ${x.id}`);
    ids.add(x.id);
    assert.ok(validCoord(x.lat, x.lng), `${x.id}: coordenadas`);
    assert.ok(p.paises[x.cc], `${x.id}: país ${x.cc} no está en paises.json`);
    assert.ok(typeof x.n?.es === 'string' && x.n.es.trim() && typeof x.n?.en === 'string' && x.n.en.trim(), `${x.id}: nombres es/en`);
    assert.ok(x.h === undefined || (Number.isInteger(x.h) && x.h >= 0 && x.h < 360), `${x.id}: rumbo`);
    cuenta[x.cc] = (cuenta[x.cc] || 0) + 1;
  }
  for (const [cc, e] of Object.entries(p.paises)) assert.equal(e.f, cuenta[cc] || 0, `${cc}: f de paises.json (${e.f}) ≠ famosos (${cuenta[cc] || 0})`);
  const latam = f.filter((x) => p.paises[x.cc].latam).length;
  const region = (c) => f.filter((x) => p.paises[x.cc].cont === c).length;
  // solo entran famosos con foto oficial (© Google) a menos de 250 m del sitio, revisados a ojo (ver --help)
  assert.ok(f.length >= 130, `famosos: ${f.length} (mínimo 130)`);
  assert.ok(latam >= 55, `famosos de Argentina y Latinoamérica: ${latam} (mínimo 55)`);
  assert.ok((cuenta.AR || 0) >= 20, `famosos de Argentina: ${cuenta.AR || 0} (mínimo 20)`);
  const minimos = { europa: 25, asia: 20, norteamerica: 20, africa: 12, oceania: 8 };
  for (const [c, n] of Object.entries(minimos)) assert.ok(region(c) >= n, `famosos de ${c}: ${region(c)} (mínimo ${n})`);
  assert.ok(f.length - region('sudamerica') >= f.length * 0.6, `fuera de Sudamérica: ${f.length - region('sudamerica')} de ${f.length} (al menos el 60 %)`);
  const conts = new Set(f.map((x) => p.paises[x.cc].cont));
  for (const c of REGIONS) assert.ok(conts.has(c), `ningún famoso en ${c}`);
  for (const x of f) assert.ok(x.dm === undefined || (Number.isInteger(x.dm) && x.dm >= 30 && x.dm <= MAX_SITIO_KM * 1000), `${x.id}: desplazamiento (dm) ${x.dm}`);
  // dos famosos no pueden ser el mismo lugar ni quedar a menos de 60 m
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) assert.ok(f[i].lat !== f[j].lat || f[i].lng !== f[j].lng, `${f[i].id} y ${f[j].id} en el mismo punto`);
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) assert.ok(distanceKm(f[i].lat, f[i].lng, f[j].lat, f[j].lng) >= 0.06, `${f[i].id} y ${f[j].id} a menos de 60 m`);
  // los ids de la lista de semillas siguen el orden (f-001 es la primera fila) y paises.json guarda el más alto que se usó
  assert.ok(p.ids.f >= FAMOSOS.length, `ids.f ${p.ids.f} < ${FAMOSOS.length} sitios en la lista`);
  assert.ok(f.every((x) => Number(x.id.slice(2)) <= p.ids.f));
});

test('mundo.json: esquema, ids únicos, países conocidos, distancias mínimas y metas', { skip: !hayDatos }, () => {
  const m = leer('mundo.json');
  const p = leer('paises.json');
  assert.ok(Array.isArray(m) && m.length > 0);
  const ids = new Set();
  const por = {};
  for (const x of m) {
    assert.match(x.id, /^m-\d{4,}$/);
    assert.ok(!ids.has(x.id), `id repetido ${x.id}`);
    ids.add(x.id);
    assert.ok(validCoord(x.lat, x.lng), `${x.id}: coordenadas`);
    assert.ok(p.paises[x.cc], `${x.id}: país ${x.cc} no está en paises.json`);
    assert.ok(x.h === undefined || (Number.isInteger(x.h) && x.h >= 0 && x.h < 360), `${x.id}: rumbo`);
    assert.ok(x.p === undefined || (typeof x.p === 'string' && x.p.length > 0), `${x.id}: p`);
    (por[x.cc] ||= []).push(x);
  }
  for (const [cc, e] of Object.entries(p.paises)) assert.equal(e.n, (por[cc] || []).length, `${cc}: n de paises.json ≠ lugares de mundo.json`);
  // mínimo de distancia entre dos lugares del mismo país: 15 km en los grandes y 5 km en los chicos (el "k" de paises.json, que se prueba acá)
  for (const [cc, lista] of Object.entries(por)) {
    const k = p.paises[cc].k;
    let min = Infinity;
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) min = Math.min(min, distanceKm(lista[i].lat, lista[i].lng, lista[j].lat, lista[j].lng));
    assert.ok(min >= k, `${cc}: dos lugares a ${min.toFixed(1)} km (mínimo ${k})`);
  }
  const grandes = Object.entries(por).filter(([cc]) => p.paises[cc].k === 15);
  assert.ok(grandes.length >= 55 && grandes.every(([, l]) => l.length >= 1), `países grandes (15 km): ${grandes.length}`);
  assert.ok(grandes.some(([, l]) => l.length >= 100), 'al menos un país grande con mucha densidad, donde la regla de 15 km se nota');
  const n = (cc) => (por[cc] || []).length;
  const region = (c) => m.filter((x) => p.paises[x.cc].cont === c).length;
  const paises = Object.keys(por).length;
  // metas de la ampliación de oct. 2026 (ver docs/trotamundos.md, "7. Estado"); piso duro: lo que se logró con las 5.000 cargas del visor
  if (m.length < 1800) console.warn(`aviso: mundo.json tiene ${m.length} lugares (la meta es 1800; ampliar con "validar")`);
  assert.ok(m.length >= 1700, `lugares: ${m.length} (mínimo 1700)`);
  assert.ok(paises >= 70, `países con lugares: ${paises} (mínimo 70)`);
  assert.ok(n('AR') >= 220, `Argentina: ${n('AR')} (mínimo 220)`);
  for (const cc of ['BR', 'MX', 'CL', 'CO', 'PE', 'UY']) assert.ok(n(cc) >= 60, `${cc}: ${n(cc)} (mínimo 60)`);
  for (const cc of ['US', 'CA', 'AU', 'ZA', 'JP', 'RU', 'IN', 'ID', 'TR']) assert.ok(n(cc) >= 30, `${cc}: ${n(cc)} (mínimo 30)`);
  assert.ok(region('africa') >= 120, `África: ${region('africa')} (mínimo 120)`);
  assert.ok(region('oceania') >= 80, `Oceanía: ${region('oceania')} (mínimo 80)`);
  const resto = Object.entries(por).filter(([cc]) => !['AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY'].includes(cc));
  const media = resto.reduce((s, [, l]) => s + l.length, 0) / resto.length;
  assert.ok(media >= 8, `promedio en el resto de los países: ${media.toFixed(1)} (mínimo 8)`);
});

test('motivoFamoso: solo entra un famoso validado, con imagen oficial (© Google) y cerca del sitio', () => {
  const ok = { estado: 'ok', oficial: true, dist: 0.01, distSitio: 0.02 };
  assert.equal(motivoFamoso(ok), null);
  assert.match(motivoFamoso(undefined), /sin validar/);
  assert.equal(motivoFamoso({ estado: 'sin-imagen' }), 'sin-imagen');
  assert.match(motivoFamoso({ ...ok, oficial: false, attr: '© Pikachu' }), /usuario/);
  assert.match(motivoFamoso({ ...ok, distSitio: 3 }), /3 km/);
  assert.equal(motivoFamoso({ ...ok, distSitio: 3 }, { max: 5 }), null);
});

test('famosos.json: cada uno tiene una lectura oficial a menos de 250 m del sitio en la validación (si está el caché de la herramienta)', { skip: !hayDatos || !existsSync(join(CACHE, 'validacion.jsonl')) }, () => {
  const lecturas = new Map();
  for (const l of readFileSync(join(CACHE, 'validacion.jsonl'), 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const r = JSON.parse(l);
    if (r.t === 'f' || r.t === 'fp') lecturas.set(r.id, [...(lecturas.get(r.id) || []), r]);
  }
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  for (const x of leer('famosos.json')) {
    const r = (lecturas.get(x.id) || []).find((q) => q.pano && r5(q.pano.lat) === x.lat && r5(q.pano.lng) === x.lng);
    assert.ok(r, `${x.id} (${x.n.en}): no hay una lectura del visor con esa panorámica`);
    assert.equal(r.oficial, true, `${x.id} (${x.n.en}): la panorámica no es oficial`);
    assert.equal(motivoFamoso(r), null, `${x.id} (${x.n.en}): ${motivoFamoso(r)}`);
    if (x.dm !== undefined) assert.equal(x.dm, Math.round((r.distSitio ?? r.dist) * 1000), `${x.id}: dm no coincide con la distancia medida`);
  }
});
