# game.it

Portal de juegos web minimalista, estilo Friv/Poki, pensado para que todo se sienta **fluido**: estética neón lineal (claro/oscuro), movimiento suave y juegos livianos con gráficos simples.

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # sitio estático en dist/ (se puede subir a Vercel, Netlify, GitHub Pages…)
npm run preview  # prueba el build
```

**Publicado en Render** (cada push a `main` se despliega solo):
- Web: https://game-it-63r9.onrender.com (sitio estático: `npm ci && npm run build` → `dist/`)
- Servidor online (salas del minigolf): https://gameit-server-fy2t.onrender.com — `node server/index.js`.
  Variables: `ALLOWED_ORIGINS` (orígenes permitidos, separados por coma), `TRUST_PROXY=1`; límites ajustables en `server/index.js` (`CFG`).
- En desarrollo: `npm run server` levanta el servidor local en `ws://localhost:8787`, que el minigolf usa automáticamente.

## Cómo está armado

```
index.html              menú (una sola pantalla) + pantalla de carga
src/
  main.js               arranque, navegación (#play/<id>), atajos de teclado
  core/prefs.js         preferencias globales (localStorage) → CSS y juegos
  core/recent.js        historial local: "Jugados recientemente" y "Para vos"
  core/registry.js      lista de juegos (leída de public/games/*/game.json)
  core/i18n.js          textos ES/EN
  ui/loader.js          pantalla de carga general (menú y juegos)
  ui/search.js          panel de búsqueda que baja desde arriba, con categorías
  ui/prefs-panel.js     popup de preferencias (esquina superior derecha)
  ui/player.js          reproductor: iframe aislado + puente con el SDK
  styles/               tokens (colores, curvas de animación), menú, paneles
public/
  sdk/gameit.js         SDK que usa cada juego
  sw.js                 service worker (caché para cargas instantáneas)
  games/<id>/           cada juego, en cualquier tecnología
```

- **Sin cuentas.** Preferencias e historial se guardan en `localStorage`. Los juegos no guardan progreso.
- **Caché.** En producción un service worker guarda el portal y los juegos ya jugados.
- **Aislamiento.** Cada juego corre en su propio `iframe`: puede ser canvas, WebGL, Phaser, Three.js, Unity, Godot, React… Al salir, el iframe se destruye y se libera memoria, audio y GPU.

## Reglas comunes para todos los juegos

1. **Plataformas.** Cada juego declara en `platforms` si es para computadora, celular o ambos; solo aparece donde se puede jugar. Si es para celular, tiene que funcionar en vertical y horizontal.
2. **Fluidez primero.** 60 fps estables antes que detalle gráfico. Estilo simple y minimalista, bien animado.
3. **Preferencias globales.** El juego respeta tema, color de acento, volumen, "reducir movimiento", brillo neón, teclado (flechas/WASD) e idioma que llegan por el SDK.
4. **Salir.** El portal siempre muestra el botón "Menú". Si el juego tiene su propio menú de pausa, su botón de salir llama a `GameIt.exit()`.
5. **Carga.** El juego llama a `GameIt.ready()` cuando puede mostrarse; mientras tanto se ve la pantalla de carga general.

## Integrar un juego

1. Crear `public/games/<id>/` con el juego ya compilado (su `index.html` y archivos).
2. Agregar `public/games/<id>/game.json`:

```json
{
  "id": "mi-juego",
  "title": "Mi Juego",
  "description": { "es": "Descripción corta.", "en": "Short description." },
  "categories": ["aventura", "historia"],
  "tags": ["pixel", "plataformas"],
  "thumbnail": "thumb.svg",
  "entry": "index.html",
  "tech": "phaser",
  "platforms": ["desktop", "mobile"],
  "sdk": true,
  "orientation": "any",
  "input": ["keyboard", "touch"],
  "features": { "online": false, "multiplayer": false, "story": true },
  "order": 10
}
```

| Campo | Uso |
| --- | --- |
| `id` | Igual al nombre de la carpeta. Define la URL `#play/<id>`. |
| `title`, `description` | Texto o `{ "es": …, "en": … }`. |
| `categories` | `arcade`, `aventura`, `accion`, `puzzle`, `deporte`, `carreras`, `estrategia`, `historia`, `online`, `multijugador`, `clasicos`, `casual`. |
| `tags` | Palabras extra para la búsqueda y las recomendaciones. |
| `platforms` | **Obligatorio.** Dónde se puede jugar: `["desktop"]` (computadora/web), `["mobile"]` (celular y tablet) o ambos. El menú, la búsqueda y los recientes muestran solo los juegos jugables en el dispositivo actual. |
| `thumbnail` | Imagen 16:10 (SVG, WebP o PNG). |
| `entry` | Archivo de entrada. También puede ser una URL absoluta (juego alojado en otro servidor). |
| `sdk` | `true` si el juego usa el SDK. Con `false` la carga termina con el evento `load` del iframe. |
| `features` | Capacidades propias del juego (online, multijugador, historia…). Libre para extender. |
| `order` | Orden en el menú (menor = primero). `"hidden": true` lo oculta. |

3. En el `index.html` del juego, sumar el SDK y avisar cuando está listo:

```html
<script src="/sdk/gameit.js"></script>
<script>
  GameIt.onPrefs((p) => {
    // p.theme: 'dark' | 'light'      p.colors: { bg, fg, accent, cyan, magenta, … }
    // p.volume: { master, sfx, music, muted }
    // p.reducedMotion, p.glow, p.showFps, p.keys, p.touch, p.lang
    // p.platform: 'desktop' | 'mobile'
  }, true);
  GameIt.onPause(() => {/* portal abrió preferencias o se ocultó la pestaña */});
  GameIt.onResume(() => {});
  GameIt.progress(0.5); // opcional
  GameIt.ready();
</script>
```

El SDK además:
- expone los colores como variables CSS (`--gi-bg`, `--gi-fg`, `--gi-accent`, `--gi-cyan`…) y `data-gi-theme` en `<html>`;
- dibuja el contador de FPS si el usuario lo activó;
- traduce teclas con `GameIt.dir(event)` → `'up' | 'down' | 'left' | 'right'` según flechas/WASD;
- elige textos con `GameIt.t({ es, en })`;
- funciona también con el juego abierto suelto (`/games/<id>/`): lee las preferencias guardadas y `exit()` vuelve a `/`.

**Juegos con build propio** (React, Phaser con npm, Unity, Godot): compilar con base relativa (`./`) o con base `/games/<id>/` y copiar la salida a `public/games/<id>/`.
**Juegos online:** el cliente vive acá; el servidor (WebSocket, API) puede estar en otro dominio. Se declara en `features` y el juego maneja su conexión.

El registro se genera solo: al agregar la carpeta con `game.json`, el juego aparece en el menú, la búsqueda y las categorías.
