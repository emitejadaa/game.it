// Pruebas de public/games/trotamundos/shared/geo.js  ·  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_D, MAX_SCORE, REGIONS, HINT_FRACTIONS,
  validCoord, distanceKm, destinationPoint, bearingDeg, scoreFor, inScope, scopeScale,
  hashSeed, rngFrom, pickLocations, headingFor, dailyKey, dailyRounds, hintCircle, circleRing, embedUrl,
} from '../../../public/games/trotamundos/shared/geo.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} no está a ${tol} de ${b}`);

test('distanceKm: distancias conocidas', () => {
  assert.equal(distanceKm(10, 20, 10, 20), 0);
  near(distanceKm(-34.6037, -58.3816, 40.4168, -3.7038), 10050, 60, 'Buenos Aires–Madrid');
  near(distanceKm(-34.6037, -58.3816, -34.6083, -58.3712), 1.1, 0.25, 'Obelisco–Plaza de Mayo');
  near(distanceKm(0, 0, 0, 180), 20015, 5, 'antípodas sobre el ecuador');
  near(distanceKm(90, 0, -90, 0), 20015, 5, 'de polo a polo');
  near(distanceKm(0, 179.9, 0, -179.9), 22.2, 0.5, 'cruzando el antimeridiano');
});

test('scoreFor: 5000 al acertar, cae con la distancia y depende de la escala', () => {
  assert.equal(scoreFor(0), MAX_SCORE);
  assert.equal(scoreFor(0.1), MAX_SCORE);
  assert.equal(scoreFor(1000), Math.round(5000 * Math.exp((-10 * 1000) / WORLD_D)));
  assert.equal(scoreFor(WORLD_D), 0);
  assert.equal(scoreFor(20000), 0);
  let prev = Infinity;
  for (let km = 0; km <= 15000; km += 250) {
    const s = scoreFor(km);
    assert.ok(s <= prev, 'no creciente');
    assert.ok(Number.isInteger(s) && s >= 0 && s <= MAX_SCORE);
    prev = s;
  }
  assert.ok(scoreFor(300, 3900) < scoreFor(300, WORLD_D), 'el mismo error pesa más en un mapa más chico');
  assert.equal(scoreFor(NaN), 0);
  assert.equal(scoreFor(-5), 0);
  assert.equal(scoreFor(10, 0), 0);
  assert.equal(scoreFor(10, -3), 0);
});

test('validCoord', () => {
  assert.ok(validCoord(0, 0) && validCoord(-90, 180) && validCoord(90, -180));
  assert.ok(!validCoord(91, 0) && !validCoord(0, 181) && !validCoord(NaN, 0) && !validCoord(0, Infinity));
  assert.ok(!validCoord('1', 2) && !validCoord(null, 2) && !validCoord(undefined, undefined));
});

test('destinationPoint y bearingDeg son coherentes con distanceKm', () => {
  const rng = rngFrom('dest');
  for (let i = 0; i < 300; i++) {
    const lat = -80 + rng() * 160;
    const lng = -180 + rng() * 360;
    const b = rng() * 360;
    const km = 1 + rng() * 5000;
    const p = destinationPoint(lat, lng, b, km);
    assert.ok(validCoord(p.lat, p.lng), `coordenada válida ${p.lat},${p.lng}`);
    near(distanceKm(lat, lng, p.lat, p.lng), km, 0.01 + km * 1e-6, 'distancia');
    if (km > 5) near(((bearingDeg(lat, lng, p.lat, p.lng) - b + 540) % 360) - 180, 0, 0.2, 'rumbo');
  }
  const north = destinationPoint(0, 0, 0, 111.195);
  near(north.lat, 1, 0.001);
  near(north.lng, 0, 1e-9);
});

test('inScope y scopeScale', () => {
  const meta = {
    paises: { AR: { cont: 'SA', latam: 1, d: 3900 }, FR: { cont: 'EU', d: 1000 }, CL: { cont: 'SA', latam: 1, d: 100 }, US: { cont: 'NA', d: 4500 } },
    regiones: { EU: { d: 5200 }, latam: { d: 9000 }, SA: { d: 99999 } },
  };
  const ar = { cc: 'AR' };
  const fr = { cc: 'FR' };
  assert.ok(inScope(ar, 'mundo', meta) && inScope(fr, undefined, meta));
  assert.ok(inScope(ar, 'latam', meta) && !inScope(fr, 'latam', meta));
  assert.ok(inScope(ar, 'SA', meta) && !inScope(ar, 'EU', meta) && inScope(fr, 'EU', meta));
  assert.ok(inScope(ar, 'AR', meta) && !inScope(fr, 'AR', meta));
  assert.ok(!inScope({ cc: 'ZZ' }, 'latam', meta) && !inScope(ar, 'EU', undefined));
  assert.equal(scopeScale('mundo', meta), WORLD_D);
  assert.equal(scopeScale(undefined, meta), WORLD_D);
  assert.equal(scopeScale('EU', meta), 5200);
  assert.equal(scopeScale('latam', meta), 9000);
  assert.equal(scopeScale('AR', meta), 3900);
  assert.equal(scopeScale('CL', meta), 250, 'piso de 250 km');
  assert.equal(scopeScale('SA', meta), WORLD_D, 'tope en el tamaño del mundo');
  assert.equal(scopeScale('XX', meta), WORLD_D, 'país sin datos');
  assert.deepEqual(REGIONS, ['AF', 'AS', 'EU', 'NA', 'SA', 'OC']);
});

test('hashSeed y rngFrom: deterministas y bien repartidos', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
  assert.ok(hashSeed('') >= 0 && hashSeed('x') <= 0xffffffff);
  const a = rngFrom('semilla');
  const b = rngFrom('semilla');
  const seqA = Array.from({ length: 50 }, a);
  const seqB = Array.from({ length: 50 }, b);
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, Array.from({ length: 50 }, rngFrom('otra')));
  const r = rngFrom(12345);
  let sum = 0;
  for (let i = 0; i < 20000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
    sum += v;
  }
  near(sum / 20000, 0.5, 0.01, 'media');
});

test('pickLocations: sin repetir ids, repartido por país y respetando exclude', () => {
  const list = [];
  const ccs = ['AR', 'BR', 'FR', 'JP', 'US', 'AU', 'ZA', 'CA'];
  for (let i = 0; i < 80; i++) list.push({ id: `m-${i}`, cc: ccs[i % ccs.length], lat: 0, lng: 0 });
  for (let t = 0; t < 40; t++) {
    const got = pickLocations(list, 5, rngFrom(`t${t}`));
    assert.equal(got.length, 5);
    assert.equal(new Set(got.map((l) => l.id)).size, 5);
    assert.equal(new Set(got.map((l) => l.cc)).size, 5, 'países distintos');
  }
  const ex = new Set(list.slice(0, 70).map((l) => l.id));
  const got = pickLocations(list, 5, rngFrom('ex'), { exclude: ex });
  assert.ok(got.every((l) => !ex.has(l.id)));
  const few = pickLocations(list.slice(0, 3), 5, rngFrom('few'));
  assert.equal(few.length, 3);
  const mono = list.filter((l) => l.cc === 'AR');
  const same = pickLocations(mono, 5, rngFrom('mono'));
  assert.equal(same.length, 5, 'si no alcanzan los países distintos, completa igual');
  assert.deepEqual(pickLocations(list, 5, rngFrom('x')).map((l) => l.id), pickLocations(list, 5, rngFrom('x')).map((l) => l.id));
  assert.equal(list.length, 80, 'no modifica la lista original');
  const free = pickLocations(mono, 4, rngFrom('free'), { spread: false });
  assert.equal(new Set(free.map((l) => l.id)).size, 4);
});

test('headingFor', () => {
  assert.equal(headingFor({ h: 123 }), 123);
  assert.equal(headingFor({ h: 0 }), 0);
  const h = headingFor({}, rngFrom('h'));
  assert.ok(Number.isInteger(h) && h >= 0 && h < 360);
});

test('dailyKey: cambia a las 0 h de Argentina (UTC−3)', () => {
  assert.match(dailyKey(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dailyKey(new Date('2026-10-07T02:59:59Z')), '2026-10-06');
  assert.equal(dailyKey(new Date('2026-10-07T03:00:00Z')), '2026-10-07');
  assert.equal(dailyKey(new Date('2026-01-01T02:00:00Z')), '2025-12-31');
});

test('dailyRounds: 5 ubicaciones iguales para todos ese día y distintas otro día', () => {
  const ccs = ['AR', 'BR', 'FR', 'JP', 'US', 'AU', 'ZA', 'CA', 'MX', 'CL'];
  const famosos = Array.from({ length: 30 }, (_, i) => ({ id: `f-${i}`, cc: ccs[i % ccs.length], lat: i, lng: i }));
  const mundo = Array.from({ length: 300 }, (_, i) => ({ id: `m-${i}`, cc: ccs[i % ccs.length], lat: i / 10, lng: i / 10 }));
  const a = dailyRounds(famosos, mundo, '2026-10-07', 1);
  const b = dailyRounds(famosos, mundo, '2026-10-07', 1);
  assert.equal(a.length, 5);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((l) => l.id)).size, 5);
  assert.equal(new Set(a.map((l) => l.cc)).size, 5, 'cinco países distintos');
  assert.equal(a.filter((l) => l.id.startsWith('f-')).length, 1, 'un sitio famoso');
  assert.ok(a.every((l) => Number.isInteger(l.h) && l.h >= 0 && l.h < 360));
  const days = new Set();
  for (let d = 1; d <= 20; d++) days.add(dailyRounds(famosos, mundo, `2026-10-${String(d).padStart(2, '0')}`, 1).map((l) => l.id).join());
  assert.ok(days.size >= 19, 'cada día es otro desafío');
  assert.notDeepEqual(dailyRounds(famosos, mundo, '2026-10-07', 2).map((l) => l.id), a.map((l) => l.id));
});

test('hintCircle: contiene el lugar, no está centrado y cada nivel entra en el anterior', () => {
  const rng = rngFrom('hints');
  for (let i = 0; i < 400; i++) {
    const loc = { id: `m-${i}`, lat: -75 + rng() * 150, lng: -180 + rng() * 360 };
    const scale = [WORLD_D, 9000, 3900, 250][i % 4];
    let prev = null;
    for (let level = 1; level <= HINT_FRACTIONS.length; level++) {
      const c = hintCircle(loc, level, scale, `s${i}`);
      near(c.radiusKm, scale * HINT_FRACTIONS[level - 1], 1e-9);
      const d = distanceKm(loc.lat, loc.lng, c.lat, c.lng);
      assert.ok(d <= c.radiusKm * 0.5 + 1e-6, `el lugar está adentro (nivel ${level})`);
      assert.ok(d >= c.radiusKm * 0.1 - 1e-6, 'y no en el centro');
      if (prev) assert.ok(distanceKm(prev.lat, prev.lng, c.lat, c.lng) + c.radiusKm <= prev.radiusKm + 1e-6, `nivel ${level} entra en el anterior`);
      prev = c;
    }
  }
  const loc = { id: 'x', lat: 10, lng: 20 };
  assert.deepEqual(hintCircle(loc, 2, 5000, 'a'), hintCircle(loc, 2, 5000, 'a'));
  assert.notDeepEqual(hintCircle(loc, 2, 5000, 'a'), hintCircle(loc, 2, 5000, 'b'));
  assert.deepEqual(hintCircle(loc, 9, 5000, 'a'), hintCircle(loc, 3, 5000, 'a'), 'nivel alto se topa en el último');
  assert.deepEqual(hintCircle(loc, 0, 5000, 'a'), hintCircle(loc, 1, 5000, 'a'), 'nivel bajo se topa en el primero');
});

test('circleRing: anillo cerrado a radio constante', () => {
  const ring = circleRing(-34.6, -58.4, 300, 32);
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[32]);
  for (const [lng, lat] of ring) near(distanceKm(-34.6, -58.4, lat, lng), 300, 0.05);
});

test('embedUrl: sin clave usa el embed de Insertar; con clave, la Embed API oficial', () => {
  const u = embedUrl({ lat: -34.6037, lng: -58.3816, heading: 90 });
  assert.equal(u, 'https://www.google.com/maps/embed?pb=!6m6!1m5!2m2!1d-34.6037!2d-58.3816!3f90!4f0!5f0.78');
  assert.ok(embedUrl({ lat: 1, lng: 2, heading: -90 }).includes('!3f270!'));
  assert.ok(embedUrl({ lat: 1, lng: 2, heading: 450 }).includes('!3f90!'));
  assert.ok(embedUrl({ lat: 1.23456789, lng: 2, heading: 0 }).includes('!1d1.234568!'));
  assert.ok(embedUrl({ lat: 1, lng: 2, pitch: 200 }).includes('!4f90!'));
  const k = embedUrl({ lat: 48.8584, lng: 2.2945, heading: 10, pitch: 0, fov: 120, lang: 'en', key: 'AB&c=d' });
  assert.ok(k.startsWith('https://www.google.com/maps/embed/v1/streetview?key=AB%26c%3Dd&location=48.8584,2.2945&heading=10&pitch=0&fov=100&language=en'));
  assert.ok(embedUrl({ lat: 1, lng: 2, key: 'K', lang: 'fr' }).endsWith('&language=es'));
});
