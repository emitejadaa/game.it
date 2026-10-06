/**
 * Datos de los juegos de geografía (Banderín, Silueta, Rumbo) a partir de Natural Earth (dominio público) y de
 * las banderas del paquete `flag-icons` (MIT):
 *
 *   npm i --no-save flag-icons
 *   curl -L -o /tmp/ne50.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
 *   node tools/daily/countries.mjs /tmp/ne50.geojson
 *
 * Escribe:
 *   public/shared/countries/countries.json   lista: código, nombres es/en, alias, centro [lon, lat], si puede ser respuesta, área en km²
 *   public/games/silueta/shapes.json         silueta de cada país como camino SVG en una caja de 100×100
 *   public/games/rumbo/world.json            polígonos simplificados (grados × 10) para dibujar el globo y medir distancias
 *   public/games/banderin/flags/<xx>.svg     bandera de cada posible respuesta
 *
 * Las respuestas son los 193 miembros de la ONU. Además se aceptan como intento (nunca como respuesta) Taiwán,
 * Ciudad del Vaticano, Palestina, Kosovo, Groenlandia, Puerto Rico, Hong Kong y Sáhara Occidental.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) {
  console.error('Uso: node tools/daily/countries.mjs <ne_50m_admin_0_countries.geojson>');
  process.exit(1);
}
const ROOT = new URL('../../', import.meta.url).pathname;
const require = createRequire(import.meta.url);
const geo = JSON.parse(readFileSync(SRC, 'utf8'));

// ---------------------------------------------------------------- qué países
const NOT_UN = new Set(['AW', 'AX', 'CW', 'GG', 'GL', 'HK', 'IM', 'JE', 'MO', 'SX', 'TW', 'VA']);
const EXTRA_UN = new Set(['KZ', 'IL', 'CU']); // Natural Earth los marca con otro tipo
const GUESS_ONLY = new Set(['TW', 'VA', 'PS', 'XK', 'GL', 'PR', 'HK', 'EH']);

// nombres más usados en el Río de la Plata / en inglés + alias para el autocompletado (todo en minúsculas, sin tildes)
const NAMES = {
  MM: { es: 'Myanmar', en: 'Myanmar', alt: ['birmania', 'burma'] },
  SZ: { es: 'Esuatini', en: 'Eswatini', alt: ['suazilandia', 'swaziland'] },
  CZ: { es: 'Chequia', en: 'Czechia', alt: ['republica checa', 'czech republic'] },
  BY: { es: 'Bielorrusia', en: 'Belarus', alt: ['belarus'] },
  CI: { es: 'Costa de Marfil', en: 'Ivory Coast', alt: ["cote d'ivoire", 'costa marfil'] },
  CD: { es: 'RD del Congo', en: 'DR Congo', alt: ['republica democratica del congo', 'congo kinshasa', 'rd congo', 'rdc', 'democratic republic of the congo'] },
  CG: { es: 'Congo', en: 'Congo', alt: ['republica del congo', 'congo brazzaville', 'republic of the congo'] },
  MK: { es: 'Macedonia del Norte', en: 'North Macedonia', alt: ['macedonia'] },
  TL: { es: 'Timor Oriental', en: 'East Timor', alt: ['timor-leste', 'timor leste'] },
  FM: { es: 'Micronesia', en: 'Micronesia', alt: ['estados federados de micronesia'] },
  US: { es: 'Estados Unidos', en: 'United States', alt: ['eeuu', 'ee uu', 'ee.uu.', 'usa', 'us', 'united states of america', 'america'] },
  GB: { es: 'Reino Unido', en: 'United Kingdom', alt: ['uk', 'inglaterra', 'gran bretana', 'great britain', 'england', 'britain'] },
  AE: { es: 'Emiratos Árabes Unidos', en: 'United Arab Emirates', alt: ['emiratos', 'uae', 'eau'] },
  KR: { es: 'Corea del Sur', en: 'South Korea', alt: ['korea del sur', 'republic of korea'] },
  KP: { es: 'Corea del Norte', en: 'North Korea', alt: ['korea del norte'] },
  RU: { es: 'Rusia', en: 'Russia', alt: ['federacion rusa', 'russian federation'] },
  SY: { es: 'Siria', en: 'Syria', alt: [] },
  IR: { es: 'Irán', en: 'Iran', alt: ['persia'] },
  LA: { es: 'Laos', en: 'Laos', alt: [] },
  VN: { es: 'Vietnam', en: 'Vietnam', alt: ['viet nam'] },
  BN: { es: 'Brunéi', en: 'Brunei', alt: ['brunei darussalam'] },
  CV: { es: 'Cabo Verde', en: 'Cape Verde', alt: ['cape verde'] },
  PS: { es: 'Palestina', en: 'Palestine', alt: [] },
  TW: { es: 'Taiwán', en: 'Taiwan', alt: ['republica de china'] },
  VA: { es: 'Ciudad del Vaticano', en: 'Vatican City', alt: ['vaticano', 'santa sede', 'vatican'] },
  NL: { es: 'Países Bajos', en: 'Netherlands', alt: ['holanda', 'the netherlands'] },
  TR: { es: 'Turquía', en: 'Turkey', alt: ['turkiye'] },
  ST: { es: 'Santo Tomé y Príncipe', en: 'Sao Tome and Principe', alt: ['sao tome y principe'] },
  KN: { es: 'San Cristóbal y Nieves', en: 'Saint Kitts and Nevis', alt: ['st kitts and nevis'] },
  VC: { es: 'San Vicente y las Granadinas', en: 'Saint Vincent and the Grenadines', alt: ['san vicente'] },
  LC: { es: 'Santa Lucía', en: 'Saint Lucia', alt: [] },
  BA: { es: 'Bosnia y Herzegovina', en: 'Bosnia and Herzegovina', alt: ['bosnia'] },
  TT: { es: 'Trinidad y Tobago', en: 'Trinidad and Tobago', alt: [] },
  PG: { es: 'Papúa Nueva Guinea', en: 'Papua New Guinea', alt: ['papua'] },
  GN: { es: 'Guinea', en: 'Guinea', alt: ['guinea conakry'] },
  GW: { es: 'Guinea-Bisáu', en: 'Guinea-Bissau', alt: ['guinea bissau', 'guinea bisau'] },
  GQ: { es: 'Guinea Ecuatorial', en: 'Equatorial Guinea', alt: [] },
  SS: { es: 'Sudán del Sur', en: 'South Sudan', alt: [] },
  ZA: { es: 'Sudáfrica', en: 'South Africa', alt: ['sud africa'] },
  NZ: { es: 'Nueva Zelanda', en: 'New Zealand', alt: ['nueva zelandia'] },
  DO: { es: 'República Dominicana', en: 'Dominican Republic', alt: ['rep dominicana'] },
  CF: { es: 'República Centroafricana', en: 'Central African Republic', alt: ['centroafrica'] },
  SA: { es: 'Arabia Saudita', en: 'Saudi Arabia', alt: ['arabia saudi'] },
  BD: { es: 'Bangladés', en: 'Bangladesh', alt: ['bangladesh'] },
  SC: { es: 'Seychelles', en: 'Seychelles', alt: [] },
  MV: { es: 'Maldivas', en: 'Maldives', alt: [] },
};

// ---------------------------------------------------------------- utilidades
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' .\-ñ]/g, '').trim();
const outerRings = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);
const ringArea = (r) => {
  // área plana (grados²) corregida por la latitud media: alcanza para comparar piezas de un mismo país
  let a = 0;
  let lat = 0;
  for (let i = 0; i < r.length - 1; i++) {
    a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    lat += r[i][1];
  }
  return Math.abs(a / 2) * Math.cos((lat / Math.max(1, r.length - 1) * Math.PI) / 180);
};
const ringCenter = (r) => {
  let x = 0;
  let y = 0;
  for (const p of r) {
    x += p[0];
    y += p[1];
  }
  return [x / r.length, y / r.length];
};
const hav = (a, b) => {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Douglas-Peucker sobre una polilínea [[x, y], …]. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let idx = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let d2;
      if (!len2) d2 = (pts[i][0] - ax) ** 2 + (pts[i][1] - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2));
        d2 = (pts[i][0] - (ax + t * dx)) ** 2 + (pts[i][1] - (ay + t * dy)) ** 2;
      }
      if (d2 > max) {
        max = d2;
        idx = i;
      }
    }
    if (max > t2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------- selección
const feats = geo.features.filter((f) => {
  const p = f.properties;
  const code = p.ISO_A2_EH;
  if (!/^[A-Z]{2}$/.test(code)) return false;
  if (GUESS_ONLY.has(code)) return true;
  if (EXTRA_UN.has(code)) return true;
  return ['Sovereign country', 'Country'].includes(p.TYPE) && !NOT_UN.has(code);
});
const byCode = new Map();
for (const f of feats) if (!byCode.has(f.properties.ISO_A2_EH) || ringArea(outerRings(f.geometry)[0] || [[0, 0]]) > 0) byCode.set(f.properties.ISO_A2_EH, f);

const countries = [];
const shapes = {};
const world = [];
mkdirSync(join(ROOT, 'public/shared/countries'), { recursive: true });
mkdirSync(join(ROOT, 'public/games/silueta'), { recursive: true });
mkdirSync(join(ROOT, 'public/games/rumbo'), { recursive: true });
mkdirSync(join(ROOT, 'public/games/banderin/flags'), { recursive: true });
let flagsDir = null;
try {
  flagsDir = join(dirname(require.resolve('flag-icons/package.json')), 'flags/4x3');
} catch {}

for (const [code, f] of [...byCode].sort((a, b) => a[0].localeCompare(b[0]))) {
  const p = f.properties;
  const o = NAMES[code] || {};
  const es = o.es || p.NAME_ES || p.NAME;
  const en = o.en || p.NAME_EN || p.NAME;
  const rings = outerRings(f.geometry).map((r) => ({ r, area: ringArea(r) })).sort((a, b) => b.area - a.area);
  const main = rings[0];
  const c0 = ringCenter(main.r);
  const center = [Number(p.LABEL_X ?? c0[0]), Number(p.LABEL_Y ?? c0[1])];
  const answer = !GUESS_ONLY.has(code);
  const alt = [...new Set([...(o.alt || []), norm(es), norm(en), p.NAME_LONG ? norm(p.NAME_LONG) : ''].filter(Boolean))];
  const km2 = Math.round(rings.reduce((t, x) => t + x.area, 0) * 111.32 * 111.32);
  countries.push({ c: code, es, en, alt, ll: [Math.round(center[0] * 100) / 100, Math.round(center[1] * 100) / 100], a: answer ? 1 : 0, km2 });

  // piezas que se muestran: la principal y las que pesan algo y están cerca (se descartan territorios lejanos y islotes)
  const total = rings.reduce((s, x) => s + x.area, 0);
  const near = rings.filter((x) => x === main || (x.area >= total * 0.004 && hav(ringCenter(x.r), c0) < 3800));
  const unwrap = (r) => {
    // pega al país las piezas que cruzan la línea de cambio de fecha (Rusia, Fiyi, EE. UU.)
    let lon0 = c0[0];
    return r.map(([x, y]) => {
      while (x - lon0 > 180) x -= 360;
      while (x - lon0 < -180) x += 360;
      return [x, y];
    });
  };
  const pieces = near.map((x) => unwrap(x.r));
  if (answer) {
    // silueta: proyección equirrectangular centrada en el país, a una caja de 100 con el mismo aspecto
    const lat0 = center[1];
    const k = Math.cos((lat0 * Math.PI) / 180);
    const pr = pieces.map((r) => r.map(([x, y]) => [(x - c0[0]) * k, -(y - c0[1])]));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of pr) for (const [x, y] of r) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const s = 100 / Math.max(maxX - minX, maxY - minY, 1e-6);
    const w = (maxX - minX) * s;
    const hgt = (maxY - minY) * s;
    const d = pr
      .map((r) => simplify(r.map(([x, y]) => [(x - minX) * s, (y - minY) * s]), 0.35))
      .filter((r) => r.length >= 3)
      .map((r) => `M${r.map(([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join('L')}Z`)
      .join('');
    shapes[code] = { d, w: Math.round(w * 10) / 10, h: Math.round(hgt * 10) / 10 };
    if (flagsDir && existsSync(join(flagsDir, `${code.toLowerCase()}.svg`))) copyFileSync(join(flagsDir, `${code.toLowerCase()}.svg`), join(ROOT, `public/games/banderin/flags/${code.toLowerCase()}.svg`));
    else console.warn(`  ! sin bandera para ${code}`);
  }
  // globo: todas las piezas con peso, en grados × 10 (enteros)
  const polys = rings
    .filter((x) => x === main || x.area >= 0.02)
    .map((x) => simplify(x.r, 0.22).map(([lon, lat]) => [Math.round(lon * 10), Math.round(lat * 10)]))
    .filter((r) => r.length >= 4)
    .map((r) => r.flat());
  world.push({ c: code, p: polys });
}

writeFileSync(join(ROOT, 'public/shared/countries/countries.json'), JSON.stringify(countries) + '\n');
writeFileSync(join(ROOT, 'public/games/silueta/shapes.json'), JSON.stringify(shapes) + '\n');
writeFileSync(join(ROOT, 'public/games/rumbo/world.json'), JSON.stringify(world) + '\n');
const answers = countries.filter((c) => c.a).length;
console.log(`${countries.length} países (${answers} respuestas), ${Object.keys(shapes).length} siluetas`);
