import { defineConfig } from 'vite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const GAMES_DIR = resolve(import.meta.dirname, 'public/games');
const VIRTUAL_ID = 'virtual:games';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/**
 * Escanea public/games/<id>/game.json y expone la lista como `virtual:games`.
 * Agregar un juego = soltar una carpeta con su game.json; no hay que tocar el portal.
 */
function gamesRegistry() {
  const read = () => {
    if (!existsSync(GAMES_DIR)) return [];
    return readdirSync(GAMES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(GAMES_DIR, d.name, 'game.json')))
      .map((d) => {
        const manifest = JSON.parse(readFileSync(join(GAMES_DIR, d.name, 'game.json'), 'utf8'));
        const where = `public/games/${d.name}/game.json`;
        if (manifest.id && manifest.id !== d.name) {
          throw new Error(`[games] ${where} tiene id "${manifest.id}"; debe coincidir con la carpeta.`);
        }
        // cada juego declara dónde se puede jugar: "desktop" (o "web"), "mobile" o ambos
        const valid = ['desktop', 'web', 'mobile'];
        if (!Array.isArray(manifest.platforms) || !manifest.platforms.length || manifest.platforms.some((p) => !valid.includes(p))) {
          throw new Error(`[games] ${where}: "platforms" es obligatorio, p. ej. ["desktop", "mobile"].`);
        }
        return { ...manifest, id: d.name };
      })
      .filter((g) => !g.hidden);
  };

  return {
    name: 'gameit-registry',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load: (id) => (id === RESOLVED_ID ? `export default ${JSON.stringify(read())};` : null),
    configureServer(server) {
      server.watcher.add(GAMES_DIR);
      const onChange = (file) => {
        if (!file.endsWith('game.json')) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

/** Versión publicada (commit + fecha): viaja con cada reporte de problema para saber qué build lo tuvo. */
function buildId() {
  let commit = process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || '';
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {}
  }
  return { commit: commit.slice(0, 7), date: new Date().toISOString().slice(0, 10) };
}

export default defineConfig({
  plugins: [gamesRegistry()],
  define: { __BUILD__: JSON.stringify(buildId()) },
  build: { target: 'es2022' },
});
