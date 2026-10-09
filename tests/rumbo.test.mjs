/** public/games/rumbo/geo.js con los contornos reales de public/games/rumbo/world.json. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../public/games/rumbo/geo.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const world = read('../public/games/rumbo/world.json');
const countries = read('../public/shared/countries/countries.json');
const shapes = new Map();
before(() => {
  const by = new Map(countries.map((c) => [c.c, c]));
  for (const e of world) shapes.set(e.c, G.makeShape(e, by.get(e.c).ll));
});
const d = (a, b) => G.borderDistanceKm(shapes.get(a), shapes.get(b));
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

test('proyección: el centro de la vista cae en (0, 0) y es visible', () => {
  for (const [lon, lat] of [[0, 0], [-58, -34], [139, 35], [20, 80], [-120, -60]]) {
    const p = G.project(lon, lat, lon, lat);
    assert.ok(near(p.x, 0, 1e-12) && near(p.y, 0, 1e-12), `${lon},${lat}`);
    assert.ok(near(p.z, 1, 1e-12));
    assert.equal(p.visible, true);
  }
});

test('proyección: a 90° del centro queda justo en el borde del disco (radio 1)', () => {
  const east = G.project(90, 0, 0, 0);
  assert.ok(near(east.x, 1) && near(east.y, 0));
  const west = G.project(-90, 0, 0, 0);
  assert.ok(near(west.x, -1));
  const north = G.project(0, 90, 0, 0);
  assert.ok(near(north.y, 1) && near(north.x, 0));
  const south = G.project(0, -90, 0, 0);
  assert.ok(near(south.y, -1));
  for (const p of [east, west, north, south]) assert.ok(near(Math.hypot(p.x, p.y), 1));
});

test('proyección: el este queda a la derecha y el norte arriba; la cara de atrás no es visible', () => {
  const e = G.project(30, 0, 0, 0);
  assert.ok(e.x > 0 && e.visible);
  const n = G.project(0, 30, 0, 0);
  assert.ok(n.y > 0 && n.visible);
  const back = G.project(180, 0, 0, 0);
  assert.equal(back.visible, false);
  assert.ok(near(back.z, -1));
  assert.equal(G.project(100, 0, 0, 0).visible, false);
  assert.equal(G.project(80, 0, 0, 0).visible, true);
  // con la vista girada: el punto antípoda del centro es invisible
  assert.equal(G.project(-58 + 180, 34, -58, -34).visible, false);
});

test('proyección: girar la vista mueve el punto en sentido contrario', () => {
  const a = G.project(10, 0, 0, 0);
  const b = G.project(10, 0, 10, 0);
  assert.ok(b.x < a.x && near(b.x, 0, 1e-12));
});

test('viewBasis: filas ortonormales', () => {
  const b = G.viewBasis(-58.4, -34.6);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const dot = b[3 * i] * b[3 * j] + b[3 * i + 1] * b[3 * j + 1] + b[3 * i + 2] * b[3 * j + 2];
      assert.ok(near(dot, i === j ? 1 : 0, 1e-12));
    }
  }
});

test('densificar: ningún paso supera el máximo, también cruzando el antimeridiano', () => {
  // un cuadrado grande que cruza lon ±180 y toca latitudes altas (grados × 10)
  const ring = [1700, 600, -1700, 600, -1700, 800, 1700, 800, 1700, 600];
  for (const step of [1, 0.25]) {
    const v = G.densifyRing(ring, step);
    const n = v.length / 3;
    assert.ok(n > 4);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dot = v[3 * i] * v[3 * j] + v[3 * i + 1] * v[3 * j + 1] + v[3 * i + 2] * v[3 * j + 2];
      assert.ok(Math.acos(Math.min(1, dot)) * (180 / Math.PI) <= step + 1e-6);
      assert.ok(near(Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]), 1, 1e-9));
    }
  }
});

test('densificar: los anillos de world.json no tienen aristas largas', () => {
  for (const s of shapes.values()) {
    for (const v of s.rings) {
      const n = v.length / 3;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dot = v[3 * i] * v[3 * j] + v[3 * i + 1] * v[3 * j + 1] + v[3 * i + 2] * v[3 * j + 2];
        assert.ok(Math.acos(Math.min(1, dot)) * (180 / Math.PI) <= G.DRAW_STEP + 1e-6, s.c);
      }
    }
  }
});

test('distancia entre fronteras: limítrofes dan 0', () => {
  for (const [a, b] of [['AR', 'CL'], ['AR', 'UY'], ['AR', 'BR'], ['FR', 'DE'], ['US', 'CA'], ['RU', 'CN'], ['KR', 'KP'], ['ES', 'PT'], ['IT', 'SI']]) assert.equal(d(a, b), 0, `${a}-${b}`);
});

test('distancia entre fronteras: cercanos chicos, lejanos grandes', () => {
  assert.ok(d('AR', 'CL') < 25 && d('AR', 'UY') < 25 && d('FR', 'DE') < 25);
  assert.ok(d('AU', 'NZ') > 1000 && d('AU', 'NZ') < 2000);
  assert.ok(d('AR', 'ES') > 6500, `AR-ES ${d('AR', 'ES')}`);
  assert.ok(d('AR', 'AU') > 7500);
  assert.ok(d('AR', 'JP') > 15000, 'JP-AR');
  // Pakistán y Tayikistán no se tocan: los separa el corredor de Wakhan (unos 20 a 30 km)
  const pk = d('PK', 'TJ');
  assert.ok(pk >= 0 && pk < 60);
});

test('distancia entre fronteras: simétrica, con caché y sin signo', () => {
  for (const [a, b] of [['AR', 'ES'], ['RU', 'BR'], ['JP', 'ZA'], ['AU', 'NZ']]) {
    G.clearDistanceCache();
    const x = d(a, b);
    G.clearDistanceCache();
    const y = d(b, a);
    assert.ok(near(x, y, 1e-6), `${a}-${b}`);
    assert.equal(d(a, b), x); // con caché
    assert.ok(x >= 0);
  }
  assert.equal(d('AR', 'AR'), 0);
});

test('distancia entre fronteras: no pasa de media vuelta al mundo', () => {
  for (const [a, b] of [['AR', 'JP'], ['NZ', 'ES'], ['CL', 'CN']]) assert.ok(d(a, b) < 20038);
});

test('países sin polígonos usan su centro', () => {
  const noPoly = world.filter((e) => !e.p.length).map((e) => e.c);
  assert.ok(noPoly.length > 10);
  for (const c of noPoly) assert.equal(shapes.get(c).hasPoly, false);
  // Mónaco está en Francia: pegado
  assert.ok(d('MC', 'FR') < 100);
  // un islote lejos del país: la distancia es la del centro al borde más cercano
  const sg = d('SG', 'AR');
  assert.ok(sg > 13000 && sg < 20038);
  const dense = G.denseOf(shapes.get('MT'));
  assert.equal(dense.length, 3);
});

test('todos los países de world.json tienen polígonos o un centro, y están en la lista de países', () => {
  const codes = new Set(countries.map((c) => c.c));
  assert.equal(world.length, countries.length);
  for (const e of world) {
    assert.ok(codes.has(e.c), e.c);
    const c = countries.find((x) => x.c === e.c);
    const hasCenter = Array.isArray(c.ll) && c.ll.length === 2 && c.ll.every(Number.isFinite);
    assert.ok(e.p.length > 0 || hasCenter, e.c);
    for (const ring of e.p) {
      assert.ok(ring.length >= 6 && ring.length % 2 === 0, `${e.c} anillo`);
      for (let i = 0; i < ring.length; i += 2) {
        assert.ok(Math.abs(ring[i]) <= 1800 && Math.abs(ring[i + 1]) <= 900, `${e.c} fuera de rango`);
      }
    }
  }
});

test('escala de color: 0 km es lo más caliente, desde 4000 km no cambia más', () => {
  for (const p of Object.values(G.PALETTES)) {
    assert.deepEqual(G.heatRgb(0, p), p[0]);
    assert.deepEqual(G.heatRgb(G.HEAT_MAX, p), p[p.length - 1]);
    assert.deepEqual(G.heatRgb(9000, p), p[p.length - 1]);
    assert.deepEqual(G.heatRgb(-5, p), p[0]);
    assert.equal(p.length, 6);
  }
  assert.match(G.heatColor(1234), /^rgb\(\d+,\d+,\d+\)$/);
});

test('escala de color: cada tramo se distingue del siguiente y se ve en claro y oscuro', () => {
  const lum = (c) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const ocean = { dark: [13, 13, 19], light: [255, 255, 255] };
  for (const [name, bg] of [['dark', ocean.dark], ['light', ocean.light]]) {
    const p = G.PALETTES[name];
    for (const c of p) assert.ok(ratio(c, bg) >= 2.2, `${name} ${c} contra el océano`);
    for (let i = 1; i < p.length; i++) {
      const diff = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
      assert.ok(diff > 60, `${name} tramo ${i}`);
    }
  }
  // alto contraste: la luminosidad baja pareja de lo más cercano a lo más lejano
  const mono = (p, sign) => p.every((c, i) => i === 0 || Math.sign(lum(c) - lum(p[i - 1])) === sign);
  assert.ok(mono(G.PALETTES.hcDark, -1));
  assert.ok(mono(G.PALETTES.hcLight, -1));
});

test('tramos de calor y de intentos', () => {
  assert.deepEqual([0, 1, 500, 501, 1500, 2500, 3999, 4000, 9000].map(G.heatBucket), [0, 1, 1, 2, 2, 3, 4, 5, 5]);
  assert.deepEqual([1, 5, 6, 10, 11, 15, 16, 20, 21, 30, 31, 99].map(G.attemptsBucket), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  assert.equal(G.SQUARES.length, 6);
});

test('tinta del chip: oscura sobre claros y clara sobre oscuros', () => {
  assert.equal(G.inkFor([255, 244, 120]), '#07070a');
  assert.equal(G.inkFor([40, 40, 160]), '#ffffff');
});

test('animación de cámara: la longitud toma siempre el camino corto', () => {
  assert.equal(G.lonDelta(170, -170), 20);
  assert.equal(G.lonDelta(-170, 170), -20);
  assert.equal(G.lonDelta(10, 40), 30);
  assert.equal(G.ease(0), 0);
  assert.equal(G.ease(1), 1);
});
