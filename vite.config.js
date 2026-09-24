import { defineConfig } from 'vite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
        if (manifest.id && manifest.id !== d.name) {
          throw new Error(`[games] public/games/${d.name}/game.json tiene id "${manifest.id}"; debe coincidir con la carpeta.`);
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

export default defineConfig({
  plugins: [gamesRegistry()],
  build: { target: 'es2022' },
});
