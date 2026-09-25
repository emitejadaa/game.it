/**
 * Revisa que cada juego de public/games/ se pueda integrar al portal (corre en cada pull request).
 *
 *   npm run check            revisa todos los juegos
 *   npm run check -- mi-id   revisa solo esos
 *
 * Errores (hacen fallar la revisión): game.json inválido, id distinto de la carpeta, falta la
 * entrada o la miniatura, categorías o plataformas que no existen, rutas absolutas que se rompen
 * dentro del portal, módulo online que no carga.
 * Avisos (no la hacen fallar): textos sin inglés, carpeta muy pesada, juego online sin servidor.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
const GAMES = join(ROOT, 'public/games');
const SERVER = join(ROOT, 'server/games');
const only = process.argv.slice(2);

// categorías válidas: las mismas que usa el portal (src/core/registry.js)
const reg = readFileSync(join(ROOT, 'src/core/registry.js'), 'utf8');
const CATEGORIES = [...reg.match(/export const CATEGORIES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const PLATFORMS = ['desktop', 'mobile', 'web'];
const WARN_MB = 15;
const MAX_MB = 60;

let errors = 0;
let warnings = 0;
const err = (id, m) => {
  errors++;
  console.log(`  ✗ ${id}: ${m}`);
};
const warn = (id, m) => {
  warnings++;
  console.log(`  ! ${id}: ${m}`);
};

function size(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? size(p) : statSync(p).size;
  }
  return n;
}

function files(dir, exts, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, exts, out);
    else if (exts.includes(extname(e.name))) out.push(p);
  }
  return out;
}

const bilingual = (v) => typeof v === 'object' && v && typeof v.es === 'string' && v.es && typeof v.en === 'string' && v.en;

const dirs = readdirSync(GAMES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((id) => !only.length || only.includes(id));

console.log(`Revisando ${dirs.length} juego(s)…`);
const ids = new Set();
for (const dir of dirs) {
  const base = join(GAMES, dir);
  const mf = join(base, 'game.json');
  if (!existsSync(mf)) {
    err(dir, 'falta game.json');
    continue;
  }
  let g;
  try {
    g = JSON.parse(readFileSync(mf, 'utf8'));
  } catch (e) {
    err(dir, `game.json no es JSON válido (${e.message})`);
    continue;
  }
  const id = g.id || dir;
  if (g.id !== dir) err(dir, `"id" tiene que ser igual al nombre de la carpeta ("${dir}")`);
  if (!/^[a-z0-9-]+$/.test(dir)) err(dir, 'la carpeta (y el id) va en minúsculas, sin espacios ni acentos: letras, números y guiones');
  if (ids.has(id)) err(dir, `id repetido: ${id}`);
  ids.add(id);
  if (!g.title) err(id, 'falta "title"');
  if (!g.description) err(id, 'falta "description"');
  else if (!bilingual(g.description)) warn(id, '"description" debería ser { "es": …, "en": … }');
  if (!Array.isArray(g.platforms) || !g.platforms.length) err(id, 'falta "platforms": ["desktop"], ["mobile"] o los dos');
  else for (const p of g.platforms) if (!PLATFORMS.includes(p)) err(id, `plataforma desconocida "${p}" (usar desktop o mobile)`);
  if (!Array.isArray(g.categories) || !g.categories.length) err(id, `falta "categories" (alguna de: ${CATEGORIES.join(', ')})`);
  else for (const c of g.categories) if (!CATEGORIES.includes(c)) err(id, `categoría desconocida "${c}" (válidas: ${CATEGORIES.join(', ')})`);
  const entry = g.entry || 'index.html';
  const external = /^https?:\/\//.test(entry);
  if (!external && !existsSync(join(base, entry))) err(id, `no existe el archivo de entrada "${entry}"`);
  if (!g.thumbnail) warn(id, 'sin "thumbnail": en el menú se ve una tarjeta vacía');
  else if (!/^https?:\/\//.test(g.thumbnail) && !existsSync(join(base, g.thumbnail))) err(id, `no existe la miniatura "${g.thumbnail}"`);
  if (g.hidden) console.log(`  · ${id}: oculto ("hidden": true)`);

  if (!external && existsSync(join(base, entry))) {
    const html = readFileSync(join(base, entry), 'utf8');
    if (g.sdk !== false && !html.includes('/sdk/gameit.js')) err(id, 'usa el SDK ("sdk" no es false) pero el HTML no carga /sdk/gameit.js');
    if (!/name=["']viewport["']/.test(html)) warn(id, 'falta <meta name="viewport"> (en celular se ve chiquito)');
  }
  // rutas absolutas: dentro del portal el juego vive en /games/<id>/, así que "/algo" apunta al portal
  for (const f of files(base, ['.html', '.js', '.css', '.mjs'])) {
    const txt = readFileSync(f, 'utf8');
    const rel = f.slice(base.length + 1);
    const bad = new Set();
    for (const m of txt.matchAll(/(?:src|href)\s*=\s*["'](\/[^"'/][^"']*)["']|url\(\s*["']?(\/[^"')/][^"')]*)["']?\s*\)|(?:import|from)\s*\(?\s*["'](\/[^"'/][^"']*)["']/g)) {
      const p = m[1] || m[2] || m[3];
      if (!/^\/(sdk|shared|vendor|games)\//.test(p)) bad.add(p);
    }
    for (const p of bad) err(id, `${rel}: ruta absoluta "${p}" (usar una relativa: "./${p.slice(1)}")`);
  }
  // juegos online: el nombre que usan con OnlineRoom tiene que tener su módulo en server/games/
  const rooms = new Set();
  for (const f of files(base, ['.js', '.mjs', '.html'])) for (const m of readFileSync(f, 'utf8').matchAll(/new OnlineRoom\(\s*['"]([\w-]+)['"]/g)) rooms.add(m[1]);
  for (const r of rooms) if (!existsSync(join(SERVER, `${r}.js`))) err(id, `usa OnlineRoom('${r}') pero no existe server/games/${r}.js`);
  const mb = size(base) / 1048576;
  if (mb > MAX_MB) err(id, `pesa ${mb.toFixed(1)} MB (máximo ${MAX_MB})`);
  else if (mb > WARN_MB) warn(id, `pesa ${mb.toFixed(1)} MB: tarda en cargar en celular (ideal menos de ${WARN_MB})`);
  if (g.features?.online && !rooms.size && !existsSync(join(SERVER, `${id}.js`))) warn(id, `dice "online" pero no se encontró su módulo en server/games/`);
}

// módulos del servidor online: tienen que cargar y exportar al menos start()
const mods = existsSync(SERVER) ? readdirSync(SERVER).filter((f) => f.endsWith('.js') && !f.startsWith('_') && (!only.length || only.includes(f.slice(0, -3)))) : [];
for (const f of mods) {
  try {
    const m = (await import(pathToFileURL(join(SERVER, f)).href)).default;
    if (!m || typeof m.start !== 'function') err(`server/${f}`, 'el módulo tiene que exportar por defecto un objeto con start(room, api)');
  } catch (e) {
    err(`server/${f}`, `no carga: ${e.message}`);
  }
}
const index = readFileSync(join(ROOT, 'server/index.js'), 'utf8');
for (const f of mods) if (!index.includes(`./games/${f}`)) warn(`server/${f}`, 'no está registrado en server/index.js');

console.log(errors ? `\n${errors} error(es), ${warnings} aviso(s).` : `\nTodo bien (${warnings} aviso(s)).`);
process.exit(errors ? 1 : 0);
