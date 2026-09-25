# Cómo sumar tu juego a game.it

game.it es un portal de juegos web: cada juego vive en su carpeta `public/games/<id>/` y el portal lo abre en
un iframe. Para sumar un juego no hace falta permiso de escritura en el repositorio: hacés un **fork**, subís tu
juego ahí y abrís un **pull request**. El dueño lo revisa, lo mergea y se publica solo.

---

## 1. Qué tiene que tener tu juego

Lo mínimo para que se pueda integrar sin tocar nada:

1. **Corre en el navegador** con HTML, CSS y JavaScript (canvas, WebGL, Phaser, three.js, React compilado, export
   web de Godot o Unity…). Nada que instalar ni servidores propios.
2. **Archivos estáticos con rutas relativas.** Tu juego se sirve desde `/games/<id>/`, así que usá `./img/a.png`,
   nunca `/img/a.png`. Si usás Vite, React u otro build, compilá con `base: './'` y subí lo que queda en `dist/`.
3. **Una carpeta con este contenido:**
   - `index.html` (entrada del juego),
   - `game.json` (datos para el menú, ver abajo),
   - `thumb.svg` o `thumb.png` (miniatura 16:10, por ejemplo 320×200),
   - el resto de tu código y recursos.
4. **Usa el SDK del portal** (`<script src="/sdk/gameit.js"></script>`):
   - `GameIt.ready()` cuando el juego ya se puede mostrar,
   - `GameIt.gameplay(true)` al empezar a jugar y `GameIt.gameplay(false)` en menús, pausa o fin de partida,
   - pausar el juego con `GameIt.onPause(…)` / `GameIt.onResume(…)`.
5. **Español e inglés.** Todos los textos en los dos idiomas, según `GameIt.prefs.lang` (o con `GameIt.t({ es, en })`).
6. **Se ve bien en cualquier pantalla.** Sin scroll, de 360 px de ancho (celular) a pantallas grandes. Si es para
   celular: controles táctiles y que funcione en vertical y/o horizontal. **Dejá libres los 56 px de arriba** (ahí
   está la barra del portal con "Menú" y ajustes).
7. **Fluido.** 60 fps en un celular común, que cargue rápido (idealmente menos de 15 MB en total) y que no se trabe
   con el tiempo.
8. **Respeta las preferencias del portal:** volumen (`GameIt.prefs.volume`), "reducir movimiento"
   (`GameIt.prefs.reducedMotion`), teclado flechas/WASD (`GameIt.dir(evento)`) y, si podés, el tema de colores
   (variables CSS `--gi-bg`, `--gi-fg`, `--gi-accent`).
9. **El sonido arranca después de un toque o una tecla** (los navegadores bloquean el audio antes).
10. **Todo propio o con licencia libre.** Código, dibujos, sonidos y música tuyos o con licencia CC0/MIT (incluí el
    archivo de licencia). **Nada de marcas, nombres ni personajes de otros juegos** (nada de "Mario", "UNO",
    "Pokémon"…).
11. **Nada de cuentas, anuncios propios, trackers ni cookies.** Si guardás algo (récord, opciones), usá
    `localStorage` con el prefijo `gameit:<id>:` y siempre adentro de `try { … } catch {}`.
12. **Online (opcional).** Si tu juego es multijugador online, usa el servidor del portal: el cliente con
    `/shared/online.js` y la lógica de la partida en `server/games/<id>.js` (ver "Juegos online" en el README).
    Si no sabés cómo, mandalo sin online y avisá en el pull request: se agrega en la integración.

### El `game.json`

```json
{
  "id": "mi-juego",
  "title": { "es": "Mi Juego", "en": "My Game" },
  "description": { "es": "De qué se trata, en una o dos oraciones.", "en": "What it's about, in one or two sentences." },
  "categories": ["arcade", "casual"],
  "tags": ["palabras", "extra", "para", "buscar"],
  "thumbnail": "thumb.svg",
  "entry": "index.html",
  "sdk": true,
  "platforms": ["desktop", "mobile"],
  "orientation": "any",
  "input": ["keyboard", "mouse", "touch"],
  "features": { "online": false, "multiplayer": false, "story": false },
  "order": 100
}
```

- `id`: en minúsculas, sin espacios ni acentos (letras, números y guiones), **igual al nombre de la carpeta**.
- `categories`: `arcade`, `aventura`, `accion`, `puzzle`, `deporte`, `carreras`, `estrategia`, `cartas`,
  `palabras`, `idle`, `historia`, `online`, `multijugador`, `clasicos`, `casual`.
- `platforms`: `["desktop"]` (computadora), `["mobile"]` (celular y tablet) o los dos. El juego solo aparece donde
  se puede jugar.
- `"hidden": true` lo saca del portal mientras está en desarrollo; se puede probar igual abriendo
  `/games/<id>/index.html` directamente.

---

## 2. Paso a paso (sin permiso de escritura: fork + pull request)

Necesitás una cuenta de GitHub, [Git](https://git-scm.com/) y [Node.js 20 o más nuevo](https://nodejs.org/).

1. **Hacé un fork.** Entrá a <https://github.com/emitejadaa/game.it> y tocá **Fork** (arriba a la derecha).
   Queda una copia en tu cuenta: `https://github.com/<tu-usuario>/game.it`.
2. **Clonalo e instalá:**
   ```bash
   git clone https://github.com/<tu-usuario>/game.it
   cd game.it
   npm install
   ```
3. **Creá una rama para tu juego:**
   ```bash
   git checkout -b juego/mi-juego
   ```
4. **Empezá desde la plantilla** (un juego chico que ya cumple todo lo de arriba):
   ```bash
   cp -r templates/juego-base public/games/mi-juego
   ```
   Cambiá el `id` en `game.json` y `const ID` en `game.js`, y reemplazá el juego por el tuyo. Si tu juego ya
   existe, copiá sus archivos (o su build) adentro de esa carpeta y sumale el `game.json` y el SDK.
5. **Probalo:**
   ```bash
   npm run dev
   ```
   Abrí <http://localhost:5173/#play/mi-juego>. Para probarlo como celular, usá el modo dispositivo del navegador
   (F12 → ícono de celular). Si es online, en otra terminal: `cd server && npm install && cd .. && npm run server`.
6. **Revisalo:**
   ```bash
   npm run check -- mi-juego
   npm run build
   ```
   `check` te dice exactamente qué falta o qué está mal (id, rutas, categorías, miniatura…).
7. **Subilo a tu fork:**
   ```bash
   git add public/games/mi-juego
   git commit -m "Nuevo juego: Mi Juego"
   git push -u origin juego/mi-juego
   ```
8. **Abrí el pull request.** En tu fork aparece el botón **Compare & pull request**. Destino: `emitejadaa/game.it`,
   rama `main`. Completá la lista que aparece, **dejá tildado "Allow edits by maintainers"** y tocá **Create pull
   request**.
9. **Esperá la revisión.** GitHub corre la revisión automática ("Revisar juegos"). Si pide cambios, hacelos en la
   misma rama y volvé a hacer `git push`: el pull request se actualiza solo.

Para el próximo juego o para actualizar uno, primero traé lo último del repositorio original:

```bash
git remote add upstream https://github.com/emitejadaa/game.it   # solo la primera vez
git checkout main && git pull upstream main && git push
git checkout -b juego/otro-juego
```

---

## 3. Si tu juego ya está en otro repositorio

La forma más simple sigue siendo el pull request (paso 2), copiando tus archivos a `public/games/<id>/`. Si
preferís pasar el link de tu repositorio para que se integre desde ahí, tiene que ser **público**. Si es privado,
no alcanza con agregar a alguien como colaborador: tenés que instalar la app de GitHub de Claude en tu cuenta
(<https://github.com/apps/claude>, elegir ese repositorio) o hacer un fork a la cuenta del dueño del portal.

---

## 4. Para el dueño del repositorio

- **No hace falta darles permisos.** El repositorio es público: cualquiera puede hacer fork y pull request, y solo
  vos podés mergear. No los agregues como colaboradores (en un repositorio personal eso les da permiso de
  escritura).
- La primera vez que alguien abre un pull request, GitHub puede pedirte **"Approve and run workflows"** para
  correr la revisión automática: aprobalo después de mirar que el cambio sea solo su juego.
- Para revisarlo y publicarlo, en una sesión de Claude Code con este repositorio pedí: **"revisá y mergeá el PR
  #N de game.it"**. Se revisa el código y la seguridad, se prueba en computadora y celular, se arreglan los
  detalles (por eso el "Allow edits by maintainers") y se mergea a `main`. Render publica solo.
- Opcional: en **Settings → Rules → Rulesets** podés proteger `main` contra borrado y force push sin cambiar nada
  más.
