# Trotamundos · Globetrotter — diseño

Juego de geografía para game.it: te dejan en un lugar del mundo (vista 360° de calle), te movés por ahí y marcás en un
mapa dónde creés que estás. Cuanto más cerca, más puntos. Un jugador (4 modos) y online de 2 a 10.
Carpeta del juego: `public/games/trotamundos/` · servidor: `server/games/trotamundos.js`.

**Gratis y sin cuentas.** No usa claves de nadie ni servicios pagos: el visor es el embed de Google "Compartir → Insertar"
(sin clave) y el mapa de marcar es OpenFreeMap con MapLibre. Opcionalmente se puede poner una clave propia de la
Maps Embed API en `config.js` (ver "Clave opcional").

## 1. Cómo funciona el visor (verificado en un Chromium real, oct. 2026)

- **URL sin clave:** `https://www.google.com/maps/embed?pb=!6m6!1m5!2m2!1d<lat>!2d<lng>!3f<rumbo>!4f<inclinación>!5f0.78`
  dentro de un `<iframe>`. Abierta suelta dice "must be used in an iframe". Resuelve la panorámica **más cercana** a lat/lng.
  `embedUrl()` de `shared/geo.js` la arma. El idioma de los textos de Google sale del navegador (el parámetro `hl` se ignora).
- **Rumbo** (`!3f`, 0 = norte, horario) y inclinación (`!4f`) se respetan. Caminar con el mouse, el dedo y las flechas del
  teclado anda (se probó: ↑ avanza). Hay zoom, brújula y flechas de calle propias de Google.
- **Tarjeta que delata el lugar:** arriba a la izquierda el visor muestra una tarjeta con el nombre o la dirección ("Obelisco",
  "Ver en Google Maps"), de unos 150×56 px (hasta ~80 px si el nombre es largo). Se tapa corriendo el iframe hacia arriba
  y haciéndolo más alto, con el contenedor en `overflow: hidden`:
  `position:absolute; top:-120px; height:calc(100% + 120px); width:100%` → la tarjeta queda fuera de la vista y el borde de
  abajo del iframe queda alineado con el del contenedor. Probado en escritorio (900×560) y celular (390×780).
- **Atribución de Google: no se tapa nunca.** Abajo están el logo "Google" y la barra "Combinaciones de teclas · © autor ·
  Condiciones · Informar un problema" (28 px de alto). Nada nuestro se dibuja sobre los 28 px de abajo del visor. Es
  requisito de los términos de Google y se prueba (ver pruebas).
- **Sin imágenes:** si no hay panorámica cerca, el iframe muestra una pantalla negra con "No hay imágenes disponibles de
  Street View." Desde afuera (iframe de otro origen) **no se puede detectar** → botón "¿No carga? Probá otra ubicación".
- **La panorámica más cercana puede ser de un usuario** (autor distinto de "Google") o de un interior (se vio una estación de
  Tokio). Por eso los datos se validan (sección 3).
- **Hacer trampa:** la URL del iframe lleva las coordenadas, así que quien abra las herramientas del navegador las ve. No hay
  forma de evitarlo con este visor. Sin récords ni rankings, alcanza (en online, es entre amigos).
- **Clave opcional:** con `EMBED_KEY` en `config.js` se usa `embed/v1/streetview` (Maps Embed API oficial: gratis y sin
  límite, pero pide una clave de Google Cloud). Es la vía más estable si Google cambiara el embed sin clave. Misma tarjeta, mismo truco.

Lo que **no** se hace (decisiones): no se usa ninguna clave ajena ni tiles de Google para el mapa; no se llama a endpoints no
documentados de Google (ni desde el juego ni para generar datos); no se copia código de otros proyectos de este género
(varios tienen licencia no comercial y este portal tiene anuncios); no se esquiva ningún bloqueo de Google.

## 2. Reglas del juego

- **Partida:** 5 rondas (online 3, 5 o 10). Por ronda: mirás, te movés, marcás un pin en el mapa y confirmás ("Adivinar" o
  Espacio). Se revela el lugar real con una línea, la distancia y los puntos. Al final, total sobre 25.000 y mapa con todas las rondas.
- **Puntaje:** `scoreFor(km, escala)` = `round(5000 · e^(−10·km/escala))`. La escala (km) depende del mapa elegido
  (`scopeScale`): mundo 14.916,862; región o país, su `d` de `datos/paises.json` (piso 250 km). El mismo error pesa más en un país.
- **Modos (un jugador):**
  - *Sitios famosos*: `datos/famosos.json`, ámbito Mundo o Argentina/Latinoamérica.
  - *Lugares al azar*: `datos/mundo.json`, ámbito Mundo (países distintos en cada partida).
  - *Por país o región*: ámbito = Argentina · Latinoamérica · un continente (africa, asia, europa, norteamerica, sudamerica, oceania) · cualquier país con
    suficientes lugares (buscador). Se juega sobre `mundo.json` filtrado con `inScope`.
  - *Desafío diario*: `dailyRounds(famosos, mundo, dailyKey(), v)` → 5 ubicaciones iguales para todos ese día (cambia a las 0 h
    de Argentina), 2 minutos por ronda, se puede caminar. Se puede repetir (sin récords). "Copiar resultado" arma un texto para pegar.
- **Reglas extra:** tiempo por ronda (sin límite, 30, 60, 90, 120, 180 s; al llegar a 0 se envía el pin que haya, o 0 puntos) y
  *Congelado* (sin mover, girar ni zoom: el iframe va con `inert` y un velo encima). Las pistas siguen disponibles con *Congelado*.
- **Pistas (solo un jugador):** hasta 3 por ronda (`hintCircle`): un círculo en el mapa que contiene el lugar sin estar centrado
  en él, cada uno más chico y adentro del anterior (en el mundo ≈ 2.980, 970 y 300 km de radio). No restan puntos. La **primera
  pista de cada partida es gratis**; las siguientes piden ver un anuncio con `GameIt.rewardAvailable('pista')` +
  `GameIt.showReward()`; si no hay anuncios disponibles, son gratis (mismo patrón que `public/games/chess/game.js`).
- **Volver al inicio:** recargar el iframe con la misma URL. **¿No carga?:** cambia la ubicación sin penalización y la recuerda como mala
  (`localStorage` `gameit:trotamundos:bad`, con límite de tamaño).
- Sin récords ni cuentas. Se guarda en `localStorage` (prefijo `gameit:trotamundos:`, siempre en `try/catch`) solo las últimas
  opciones elegidas y las ubicaciones malas.

## 3. Datos

`public/games/trotamundos/datos/` (JSON, se cargan por `fetch` relativo; el servidor online lee los mismos archivos del disco):

- `famosos.json`: `[{ "id": "f-001", "lat": -34.6037, "lng": -58.3816, "cc": "AR", "n": { "es": "Obelisco", "en": "Obelisk of Buenos Aires" }, "h": 90 }]`
  (`h` = rumbo inicial, opcional). Unos 150 del mundo y unos 70 de Argentina y Latinoamérica.
- `mundo.json`: `[{ "id": "m-0001", "lat": …, "lng": …, "cc": "FR", "h": 120, "p": "Lyon" }]` (`h` y `p` = lugar poblado cercano, opcionales).
  Todos los países con cobertura, con más densidad en Argentina y Latinoamérica.
- `paises.json`: `{ "v": 1, "generado": "AAAA-MM-DD", "metodo": "…", "paises": { "AR": { "cont": "sudamerica", "latam": 1, "d": 3900, "n": 190, "f": 12 } }, "regiones": { "mundo": {…}, "latam": { "d": 9000 }, "europa": { "d": 5200 } } }`
  (`d` = escala en km, `n` = cuántos lugares tiene `mundo.json`, `f` = cuántos famosos). `v` es la versión del conjunto
  (entra en la semilla del diario).
- `CREDITOS.txt`: fuentes y licencias (Natural Earth, dominio público; OpenStreetMap vía OpenFreeMap; coordenadas de sitios famosos).

**Cómo se generan** (`tools/trotamundos-datos.mjs`): puntos candidatos sobre rutas y cerca de ciudades de países con cobertura
(Natural Earth: países, rutas y lugares poblados, todo dominio público) → se validan **cargando el embed en un Chromium**
(Playwright) como lo haría una persona: tiene que haber imagen y la foto tiene que ser oficial (© Google). Poco volumen
(≤ 3.000 cargas en total, concurrencia ≤ 3, sin cargar las imágenes), con caché para poder retomar, y si Google responde con un
bloqueo o un desafío, **se frena** (no se esquiva). Los sitios famosos se revisan además mirando que la tarjeta diga el nombre
esperado y mirando capturas. Ampliar el conjunto con más lugares validados es una tarea de mantenimiento aparte.

## 4. Cliente (`public/games/trotamundos/`)

Archivos: `index.html`, `game.json`, `style.css`, `thumb.svg`, `game.js` (arranque y flujo), `visor.js` (iframe + truco de la
tarjeta + congelado + volver al inicio), `mapa.js` (MapLibre: mapa de marcar, pistas y mapas de resultados), `datos.js`
(carga, filtros y elección de lugares), `textos.js` (ES/EN), `config.js` (`export const EMBED_KEY = ''`), `online.js` (cliente online),
`shared/geo.js` (listo). Sin build: módulos ES nativos; rutas relativas (el portal lo sirve desde `/games/trotamundos/`; las
únicas rutas absolutas permitidas son `/sdk/`, `/shared/`, `/vendor/` y `/games/`).

- **Mapa:** MapLibre GL JS (BSD-3) copiado a `public/vendor/maplibre-gl.js` y `.css` (con su licencia) + estilo vectorial de OpenFreeMap
  (`https://tiles.openfreemap.org/styles/positron`, gratis y sin clave), con colores adaptados al tema claro/oscuro del portal
  (`data-gi-theme`). Mostrar la atribución de OpenFreeMap/OSM de forma compacta. Si el mapa no carga, mensaje claro y reintento.
- **Pantallas:** menú (4 modos + Online) → opciones del modo → ronda → resultado de la ronda → resumen final. Pausa del portal
  (`onPause`/`onResume`) detiene el reloj. `GameIt.ready()` cuando el menú se puede ver; `GameIt.gameplay(true)` solo mientras se
  juega una ronda y `false` en menús y resultados (ahí el portal puede mostrar un banner y achicar el juego: layout fluido,
  sin alturas fijas; `ResizeObserver` + `map.resize()`).
- **Ronda:** el visor ocupa todo; HUD (ronda, puntos, reloj) debajo de los 56 px del portal; **minimapa** abajo a la izquierda, a
  28 px del borde de abajo (nunca sobre la atribución de Google): chico por defecto, crece al pasar el mouse o tocarlo, con botón
  de fijar; botón "Adivinar" (Espacio/Enter) cuando hay pin; "Pista", "Volver al inicio" y "¿No carga?". En celular el mapa se
  abre como panel grande (sin tapar los 28 px de abajo) y se cierra para volver a mirar. El reloj arranca cuando el iframe cargó
  (con tope de 8 s).
- **Teclado:** Espacio/Enter adivinar, M mapa, R volver al inicio, N o Enter siguiente, Esc cierra paneles. Foco visible, `aria-label`,
  `prefers-reduced-motion`/`GameIt.prefs.reducedMotion` respetados (sin animaciones largas), volumen del portal en los sonidos
  (`/shared/sfx.js`, que arrancan con el primer toque).
- **Estilo:** línea neón del portal, variables `--gi-bg`, `--gi-fg`, `--gi-accent`, `--gi-cyan`, `--gi-magenta`; claro y oscuro;
  voseo rioplatense en los textos (en español) y todo en inglés también. Sin marcas ni nombres de otros juegos.
- Todo lo que viene de afuera (nombres de jugadores, códigos) se muestra con `textContent`, nunca como HTML.

## 5. Online (`server/games/trotamundos.js`, cliente `online.js`)

Mismo núcleo de salas que Garabato y Ajedrez (`server/index.js`; cliente `/shared/online.js`). 2 a 10 jugadores, `lateJoin`,
`listable` (salas públicas + partida rápida), sala privada con código y link. Ajustes (los elige el anfitrión en el lobby, el
servidor los valida): `mode` (`random` | `famosos`), `scope` (`mundo`, `latam`, continente o país), `rounds` (3, 5, 10), `time`
(0, 30, 60, 90, 120, 180 s), `frozen` (0/1), `rush` (0/1: cuando alguien confirma, a los demás les quedan 15 s), `public`.
Sin pistas y sin desafío diario.

- El servidor elige las ubicaciones (sin repetir en la partida, países distintos), lleva los relojes y el puntaje; los clientes
  muestran. Cada ronda: fase *mirar* → todos confirmaron o se acabó el tiempo → fase *revelación* (lugar real, pin de cada uno,
  distancia y puntos, tabla) con pase automático a la siguiente (o el anfitrión adelanta) → al final, podio.
- Mensajes propios: `guess { lat, lng }` (una vez por ronda, el servidor valida el rango y calcula distancia y puntos con
  `shared/geo.js`), `noimg` (cuando más de la mitad de los conectados lo piden en los primeros 25 s, se cambia la ubicación y se
  reinicia el reloj, hasta 2 veces por ronda) y `next` (anfitrión). Quién ya confirmó se ve, el pin de los demás no hasta la revelación.
- Entrar con la partida empezada: se mira la ronda en curso y se juega desde la siguiente. Si alguien se desconecta, sigue en la
  sala (sus rondas sin confirmar valen 0) y vuelve con su token.
- Núcleo: respetar los límites de `server/index.js` (tamaño de mensaje, ritmo); un error en el módulo no tira abajo las otras salas.

## 6. Pruebas

- `npm test` → `node --test "tools/tests/**/*.test.mjs"` (puro y rápido): `geo.test.mjs`, datos (esquema y coherencia),
  servidor (partidas completas con clientes `ws` reales y relojes acelerados por variable de entorno **solo en pruebas**).
- `npm run check -- trotamundos` y `npm run build` tienen que pasar.
- Recorridos en Chromium con Playwright (global en este entorno: `/opt/node22/lib/node_modules/playwright`, con
  `proxy: { server: process.env.HTTPS_PROXY }` y `NODE_USE_ENV_PROXY=1`): un jugador en escritorio y en celular (390×780 táctil), el
  visor real, la tarjeta tapada, la atribución visible, el mapa, la partida completa y online con 2–3 navegadores.

## 7. Estado

Rama `juego/trotamundos`: modo de un jugador, datos y online hechos y probados (`npm test`, `npm run check`, `npm run build`, y
recorridos con Chromium y varios navegadores contra el servidor, con el visor real de Google).

- **Datos de hoy** (`datos/paises.json`, v 1, 2026-10-07): 1.057 lugares al azar en 68 países (Argentina 159; Brasil, México,
  Chile, Colombia, Perú y Uruguay entre 43 y 50; Europa 312, Asia 138, Norteamérica 124, África 42, Oceanía 32) y 51 sitios
  famosos con foto oficial de Google (35 de Argentina y Latinoamérica). Se usaron unas 2.950 de las 3.000 cargas del embed que se
  fijaron como tope para validar.
- **Límites conocidos:** África y Oceanía tienen pocos lugares (la herramienta tomaba "sin aciertos" como "sin cobertura" y
  los candidatos salían de centros de pueblos; conviene probar puntos sobre calles de las capitales); los famosos quedaron
  muy sudamericanos porque en Europa y Asia la panorámica más cercana a los monumentos suele ser de un usuario, que se descarta.
  Ampliar pide más cargas del embed: es una decisión aparte (ver `tools/trotamundos-datos.mjs --help`).
- **Otros límites:** las coordenadas viajan al navegador (se pueden ver con las herramientas del navegador), el embed sin
  clave no es una API documentada de Google, y desde afuera del iframe no se puede saber si una ubicación no tiene
  imágenes (de ahí el botón "¿No carga?"). Si el anfitrión online se desconecta, sigue siendo anfitrión hasta que vence la
  gracia del núcleo (45 s).
