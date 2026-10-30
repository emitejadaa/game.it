# game.it

Portal de juegos web minimalista, estilo Friv/Poki, pensado para que todo se sienta **fluido**: estética neón lineal (claro/oscuro), movimiento suave y juegos livianos con gráficos simples.

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # sitio estático en dist/ (se puede subir a Vercel, Netlify, GitHub Pages…)
npm run preview  # prueba el build
npm run check    # revisa los juegos (game.json, rutas, módulos online)
npm test         # pruebas: núcleo de salas del servidor, juegos diarios, reglas compartidas (necesita `npm ci` también en server/)
```

## ¿Querés sumar tu juego?

No hace falta permiso de escritura: hacés un fork, agregás tu juego y abrís un pull request. **Todo el proceso está en
[CONTRIBUTING.md](CONTRIBUTING.md).** Lo que tiene que cumplir el juego, en corto:

1. Corre en el navegador (HTML/JS, canvas, WebGL, Phaser, three.js, export web de Godot/Unity…), sin instalar nada.
2. Vive en `public/games/<id>/` con `index.html`, `game.json` y una miniatura 16:10, y usa **rutas relativas**.
3. Usa el SDK (`/sdk/gameit.js`): `GameIt.ready()`, `GameIt.gameplay(true/false)` y pausa con `onPause`/`onResume`.
4. Textos en español e inglés.
5. Funciona en celular (desde 360 px) y en computadora, sin scroll y dejando libres los 56 px de arriba.
6. Va fluido (60 fps) y es liviano (idealmente menos de 15 MB).
7. Respeta volumen, "reducir movimiento" y teclado (flechas/WASD) del portal; el sonido arranca con el primer toque.
8. Código, dibujos y sonidos propios o con licencia libre; nada de marcas ni personajes de otros.
9. Sin cuentas, anuncios propios ni trackers; lo que guarde, con el prefijo `gameit:<id>:`.
10. Online opcional, con el servidor del portal (`server/games/<id>.js`).

Hay una plantilla lista en [`templates/juego-base/`](templates/juego-base/) y `npm run check -- <id>` dice qué falta.

## Publicación

**Publicado en Render** (cada push a `main` se despliega solo):
- Web: https://game-it-63r9.onrender.com (sitio estático: `npm ci && npm run build` → `dist/`)
- Servidor online (salas de Minigolf, Tateti, 4 en línea, Drift, Sky Hop, Clashball, Ajedrez, Ameba, Serpentina, Billar, Chispa, Mecha Corta, Garabato, Teléfono Loco, La Cabra · Pádel, Batalla Naval, Voleyball, Trotamundos, Espiral, Cruce, Micelio, Bolos y Vuelo): https://gameit-server-fy2t.onrender.com — `node server/index.js`.
  Variables: `ALLOWED_ORIGINS` (orígenes permitidos, separados por coma). La IP de cada cliente (para los límites por IP) se detecta sola cuando hay un proxy delante (solo se confía en los encabezados si quien se conecta por TCP es una dirección interna); se puede fijar con `CLIENT_IP_HEADER` (p. ej. `cf-connecting-ip`) o `TRUST_PROXY_HOPS` (cuántos proxies agregan una entrada a `X-Forwarded-For`, contando desde la derecha). `MAX_RT_ROOMS` (4 por defecto) es el tope de salas en tiempo real a la vez (Ameba, Serpentina, Clashball, Pádel y las arenas nuevas): el servidor gratis de Render tiene 0,1 CPU; al llegar al tope, crear otra devuelve `server_full_rt`. `/health` informa `rt: { rooms, max, avgTickMs }`. Límites ajustables en `server/index.js` (`CFG`).
- En desarrollo: `npm run server` levanta el servidor local en `ws://localhost:8787`, que los juegos online usan automáticamente.

## Anuncios (Google AdSense)

**Dónde aparecen** (todo se configura en `src/ads.config.js`; `enabled: false` apaga todo):

| Lugar | Formato | Cuándo | Requiere |
| --- | --- | --- | --- |
| Menú del portal | Banner al final, separado de las tarjetas | Siempre | Bloque `slots.menuBottom` |
| Dentro de los juegos | Banner en una franja abajo: **el juego se achica**, nunca queda tapado | Solo en menús, pausas y fin de partida; se quita al volver a jugar; con 1,2 s de demora; como mucho uno nuevo por minuto | Bloque `slots.gameBreak` |
| Dentro de los juegos | Con recompensa ("Continuar · ver anuncio", "Producción ×2") | Solo si el jugador lo elige | H5 Games Ads |
| Dentro de los juegos | Pantalla completa entre partidas | **Apagado** (`games.interstitials: false`) | H5 Games Ads |

Todos llevan la etiqueta "Publicidad" y los banners se pueden ocultar (24 h). Nunca aparecen en la pantalla de carga,
mientras se juega ni durante un partido online en curso. Stack no muestra banners (se toca en cualquier parte de la
pantalla y habría clics sin querer). Con `?ads=preview` se ven todos los espacios simulados, sin pedir anuncios.

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
  ui/report.js          popup "Reportar un problema" (correo → código → dónde → tipo → detalle → gracias)
  ui/report-flow.js     la lógica pura de esos pasos (se prueba sin DOM)
  core/report-api.js    envío del reporte: hoy un simulacro (cualquier código vale); el contrato HTTP está en el encabezado
  ui/player.js          reproductor: iframe aislado + puente con el SDK; pausa por razones (hold/release)
  styles/               tokens (colores, curvas de animación), menú, paneles
public/
  sdk/gameit.js         SDK que usa cada juego
  sw.js                 service worker (caché para cargas instantáneas)
  games/<id>/           cada juego, en cualquier tecnología
```

- **Sin cuentas.** Preferencias e historial se guardan en `localStorage`. Los juegos no guardan progreso.
- **Caché.** En producción un service worker guarda el portal y los juegos ya jugados. Su versión sale de un hash del build (`vite.config.js`), así que cada deploy renueva el caché solo.
- **Aislamiento.** Cada juego corre en su propio `iframe`: puede ser canvas, WebGL, Phaser, Three.js, Unity, Godot, React… Al salir, el iframe se destruye y se libera memoria, audio y GPU.

## Reglas comunes para todos los juegos

1. **Plataformas.** Cada juego declara en `platforms` si es para computadora, celular o ambos; solo aparece donde se puede jugar. Si es para celular, tiene que funcionar en vertical y horizontal.
2. **Fluidez primero.** 60 fps estables antes que detalle gráfico. Estilo simple y minimalista, bien animado.
3. **Preferencias globales.** El juego respeta tema, color de acento, volumen, "reducir movimiento", brillo neón, teclado (flechas/WASD) e idioma que llegan por el SDK.
4. **Salir.** El portal siempre muestra el botón "Menú". Si el juego tiene su propio menú de pausa, su botón de salir llama a `GameIt.exit()`.
5. **Carga.** El juego llama a `GameIt.ready()` cuando puede mostrarse; mientras tanto se ve la pantalla de carga general.

## Integrar un juego

> **¿Querés sumar un juego al portal?** Seguí [CONTRIBUTING.md](CONTRIBUTING.md) (requisitos, plantilla, fork y pull
> request). Lo que sigue es la referencia técnica.

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
| `categories` | `arcade`, `aventura`, `accion`, `puzzle`, `deporte`, `carreras`, `estrategia`, `cartas`, `palabras`, `idle`, `historia`, `online`, `multijugador`, `clasicos`, `casual`. |
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

**Anuncios desde el juego** (opcional; si no hay anuncios, todo resuelve enseguida y el juego sigue igual):

```js
GameIt.gameplay(true);   // empieza el juego activo: el portal saca cualquier anuncio
GameIt.gameplay(false);  // menú, pausa o fin de partida: el portal puede mostrar un banner en una franja aparte
await GameIt.commercialBreak('revancha');          // pausa natural antes de seguir (pantalla completa, si está activada)
if (await GameIt.rewardAvailable('continuar')) {   // ofrecer una recompensa solo si hay anuncio disponible…
  if (await GameIt.showReward()) darRecompensa();  // …y darla solo si el jugador lo vio completo
}
```
No llamar a `gameplay(false)` en pantallas donde se toca en cualquier lado (habría clics sin querer en el anuncio).

El SDK además:
- expone los colores como variables CSS (`--gi-bg`, `--gi-fg`, `--gi-accent`, `--gi-cyan`…) y `data-gi-theme` en `<html>`;
- dibuja el contador de FPS si el usuario lo activó;
- traduce teclas con `GameIt.dir(event)` → `'up' | 'down' | 'left' | 'right'` según flechas/WASD;
- elige textos con `GameIt.t({ es, en })`;
- funciona también con el juego abierto suelto (`/games/<id>/`): lee las preferencias guardadas y `exit()` vuelve a `/`.

**Juegos con build propio** (React, Phaser con npm, Unity, Godot): compilar con base relativa (`./`) o con base `/games/<id>/` y copiar la salida a `public/games/<id>/`.
**Juegos online:** el cliente vive acá; el servidor (WebSocket, API) puede estar en otro dominio. Se declara en `features` y el juego maneja su conexión.
El servidor de `server/` tiene un núcleo de salas y un módulo por juego en `server/games/`. Además de `start`/`message`, un módulo
puede declarar `lateJoin` (entrar con la partida en curso), `onJoin`, `removed`, `command` (mensajes en cualquier estado),
`canStart` y `listable` + `listInfo` (lista de salas públicas, mensaje `{ t: 'list', game }`).

### Clashball (tiempo real)

Fútbol 2D con las físicas de HaxBall (`public/games/clashball/shared/`, el mismo código en cliente y servidor):
paso fijo de 60 ticks/s, jugador radio 15 / aceleración 0,1 (0,07 con la patada armada) / amortiguación 0,96,
pelota radio 10 / amortiguación 0,99, patada de fuerza 5 a menos de 4 px, saque con barrera en el círculo, gol de oro.
Online: el servidor simula y manda el estado 30 veces por segundo; cada cliente manda sus teclas solo cuando cambian,
predice su jugador y corrige con las confirmaciones del servidor (se nota como si jugara en local).

### Voleyball (tiempo real)

Vóley de costado como los servidores de vóley de HaxBall, armado sobre Clashball: los jugadores son discos que flotan y se
mueven con la misma física de HaxBall (`shared/physics.js`, 60 ticks/s) y no pueden pasar al otro lado de la red (abajo
la red, arriba una barrera invisible). La pelota cae con gravedad, atraviesa a los jugadores y solo se le pega con la
patada (Espacio/X): sale desde el centro del jugador hacia la pelota, así que desde abajo sube y desde arriba es un
remate. Rebota en las paredes de los costados y en la red; arriba no hay techo (si sale del mapa, una flecha en el borde
la sigue). Reglas en `public/games/voleyball/shared/match.js` (las mismas en el navegador y en el servidor): es punto
cuando la pelota toca el piso, punto por jugada, saca el equipo que hizo el punto (si recupera el saque, rota quién saca),
3 toques por equipo (el saque cuenta como el primero y el bloqueo no cuenta), ganar por 2 opcional y tiempo con punto de
oro. Modos Clásico, Playa (pelota que flota) y Turbo; canchas Chica, Clásica y Grande. Los bots (`shared/ai.js`) simulan
la trayectoria con la misma física, eligen quién va y buscan dónde pararse respecto de la pelota para que el golpe salga
como quieren (recepción alta hacia la red, armado y remate desde arriba, bloqueo en la red y defensa abajo; 3 niveles).
Si un equipo queda vacío (práctica), saca una máquina. Online igual que Clashball (`server/games/voleyball.js`): el
servidor simula, manda el estado 30 veces por segundo con los golpes, piques y puntos como eventos y el cliente predice
su jugador; salas públicas, bots, espectadores y chat con el relato de cada punto (remate, bombazo, ace, bloqueo, punto de
17 toques…).

### Ajedrez

Reglas completas en `public/games/chess/shared/rules.js` (enroque, al paso, coronación, jaque mate, ahogado, material
insuficiente, 50 jugadas y triple repetición; verificado con perft). La compu (`shared/engine.js`, alfa-beta con
tabla de transposición y búsqueda de quietud) corre en un worker (`ai.js`) con 5 niveles. Online, el servidor valida
cada jugada con el mismo archivo y lleva el reloj con incremento; la primera jugada de cada lado tiene 30 s o la
partida se anula. Pista con anuncio opcional (la primera de cada partida es gratis; sin anuncios, todas son gratis).

### Ameba (arena .io)

El mundo (`public/games/ameba/shared/world.js`: comida, división, expulsión de masa, esporas, unión de células)
y los bots (`shared/bots.js`) corren igual en el servidor y sin conexión, a 25 pasos/s con grilla espacial.
Online, cada jugador recibe solo lo que tiene cerca más la comida que reapareció; el cliente interpola los
estados con un retraso que se ajusta al jitter. Juego rápido (se une a la arena pública con más gente o crea una)
o sala privada con código; los bots completan hasta 18. Revivir con anuncio solo sin conexión.

### Serpentina (arena .io)

Mismo esquema que Ameba (`public/games/serpentina/shared/`): el mundo corre igual en el servidor y sin conexión.
El cuerpo de cada serpiente es el rastro de la cabeza muestreado a distancia fija (`grow`), con posiciones y masa
redondeadas a un decimal: `shared/sync.js` manda el cuerpo entero la primera vez que una serpiente entra en vista y
después solo la cabeza, y el cliente reconstruye exactamente el mismo cuerpo. La comida se sincroniza por
casilleros (carga completa al entrar en vista, después solo altas y bajas).

### Billar (bola 8)

Física propia en `public/games/billar/shared/physics.js`: paso fijo de 1/600 s con deslizamiento y rodadura
(efecto arriba, abajo y lateral), choques elásticos, bandas con mandíbulas y troneras. Solo usa + − × ÷ √, así que es
determinista: online el cliente manda el golpe exacto (velocidad y giro iniciales), el servidor lo valida, lo simula
y aplica las reglas (`shared/rules.js`), y los dos navegadores animan el mismo tiro y terminan igual. La mesa se
dibuja con three.js desde arriba y solo se vuelve a renderizar cuando algo cambia. La compu (`shared/ai.js`, en un
worker) prueba tiros simulándolos y juega de seguridad si no hay nada claro.

### Garabato (dibujar y adivinar)

Online de 2 a 10: por turnos uno elige entre tres palabras y la dibuja; los demás escriben en el chat. Acertar da más
puntos cuanto antes (con un plus al primero) y el que dibuja suma una parte de lo que ganan los demás. Con el tiempo se
revelan letras; si una respuesta está a una letra, solo esa persona ve "¡casi!", y los que ya adivinaron charlan entre
ellos sin arruinar la palabra. El servidor (`server/games/garabato.js`) lleva turnos, tiempos y puntos y reenvía el
dibujo como operaciones chicas (trazos, relleno, deshacer, borrar); quien entra tarde o se reconecta recibe el dibujo
en curso. Hoja fija de 1000×750 para que el relleno con balde dé igual en todos los navegadores. Salas públicas
(aparecen en la lista y en "Partida rápida") o privadas, con palabras propias. Listas de palabras propias en
`public/games/garabato/shared/words.js` (español e inglés).

### Teléfono Loco (teléfono descompuesto con dibujos)

Online de 2 a 10: cada uno escribe una frase (o se arranca con frases al azar), las cadenas rotan y al que le llega una
frase la dibuja y al que le llega un dibujo lo describe, sin ver lo anterior; cada cadena pasa una sola vez por cada
jugador (rotación fija, `server/games/telefono.js`). Lo que se escribe y se dibuja llega al servidor mientras se hace,
así nada se pierde si se acaba el tiempo o se corta la conexión; si alguien no responde, el siguiente recibe lo último
útil de la cadena (o una frase al azar). Al final se muestran los álbumes paso a paso para todos a la vez (avanza el
anfitrión o solos), con los dibujos repitiéndose trazo a trazo, reacciones y la opción de guardar cada álbum como una
imagen. Opciones: tiempos de dibujo y de escritura, largo de las cadenas, idioma de las frases y sala pública o
privada. Frases en `public/games/telefono/shared/prompts.js`; la hoja y el balde en `paper.js`.

### La Cabra · Pádel

Adaptación del partido de [LA CABRA · Pádel](https://github.com/LucasPar08/la-cabra-padel) de LucasPar08: solo el partido
(sin carrera ni modo historia), con los tres escenarios (pabellón, exterior y club), la cámara de tele o desde arriba y
las opciones de dificultad, estilo de los rivales, juegos por set (3, 4 o 6), 1 set o al mejor de 3, lado (revés o
drive), asistencia, golpe automático, mano, tamaño de los botones y colores. El motor (`public/games/padel/shared/engine.js`:
paso fijo de 1/120 s, cristal y malla, salidas por 3 y por 4, punto de oro, tie-break, la IA de pareja y rivales) es el
mismo en el navegador y en el servidor. Contra la compu, vos y tu pareja contra dos rivales. Online de 2 a 4
(`server/games/padel.js`): se arman los equipos en la sala, los lugares vacíos los juega la compu, el servidor simula a
60 ticks/s y manda el estado 30 veces por segundo con los golpes y botes como eventos; el cliente dibuja con 70 ms de
retraso e interpola. Si alguien se va o se corta, un bot sigue en su lugar hasta que vuelve. Nombres de jugadores y
equipos inventados.

### Batalla Naval

Contra la compu u online 1 contra 1. Reglas en `public/games/naval/shared/rules.js` (las mismas en el navegador y en
el servidor): mares de 8×8, 10×10 o 12×12 con flotas de 4, 5 o 7 barcos, barcos que se tocan o no (si no, al hundir
uno se marca el agua de alrededor), tiro extra al acertar, modo salva (tantos disparos como barcos a flote) y armas
especiales de un solo uso: sonar (muestra los barcos de un 3×3), bomba (5 casillas en cruz) y torpedo (recorre una
fila o columna y explota en el primer barco). La compu (`shared/ia.js`) tiene tres niveles: al azar con algo de
seguimiento, caza en damero siguiendo la línea de los tocados, y mapa de probabilidad de todas las posiciones
posibles de los barcos que quedan, usando las armas cuando convienen. Online (`server/games/naval.js`) la flota de
cada uno nunca sale del servidor hasta el final; cada turno tiene tiempo (20, 30 o 60 s; si se acaba, tiro al azar),
se alterna quién empieza y se puede reaccionar con emojis. Todo se dibuja en canvas (barcos vistos desde arriba,
fuego, humo, piques, sonar y torpedos) y en celulares vertical el mar que recibe el disparo se agranda.

### Mecha Corta (palabras)

Juego de palabras con bomba: el que la tiene ve una sílaba y escribe una palabra que la contenga (existente y sin
repetir) antes de que explote; la mecha dura un tiempo al azar que nadie ve y explotar cuesta una vida. Usar todas las
letras del abecedario (menos las raras) da una vida extra y todos ven lo que escribe el de turno, letra por letra.
Idiomas español e inglés con diccionarios de `an-array-of-spanish-words` y `an-array-of-english-words` (MIT, ver
`public/games/mecha/dict/LICENSE.txt`), guardados ordenados y con codificación de prefijo (≈2,4 MB y 1,2 MB sin
comprimir) y buscados con búsqueda binaria; se regeneran con `node tools/mecha-dict.mjs`. La partida
(`shared/game.js`) corre igual en el navegador (compu o práctica) y en el servidor (online hasta 12, con compu opcional),
que valida las palabras y no revela cuánto le queda a la mecha.

### Chispa (cartas)

Juego de cartas de colores con nombre, diseño y cartas propias (4 colores de neón con una forma cada uno para quien no
distingue colores). Las reglas están en `public/games/chispa/shared/rules.js` y la mesa (rondas, puntos, turnos de la
compu, tiempo por turno y lo que ve cada jugador) en `shared/table.js`: el mismo código corre en el navegador contra la
compu y en el servidor online, que baraja, valida cada jugada y a cada jugador le manda solo su mano. Se avisa
"¡Última!" con una carta; si otro te agarra antes de que juegue el siguiente, robás 2. Opcional: acumular +2/+4.
Online de 2 a 6 (el anfitrión puede sumar compu); si alguien se desconecta juega solo hasta que vuelve.

### Arenas en tiempo real (base común) y Estela

Las arenas FFA con bots comparten una base para que cada juego nuevo sean unas ~100 líneas en el servidor:

- `server/games/_arena.js`: `arenaGame({ World, tps, viewer, brain, think, command, settings, … })` devuelve el módulo completo para
  `server/index.js` (el contrato está documentado en el encabezado del archivo). Pone el bucle de paso fijo con recuperación de atraso
  y protegido con try/catch, el arranque automático al crear la sala (así "Partida rápida" no cae en un lobby que nadie empezó),
  los bots que completan la arena, un gobernador de CPU (saca bots si el costo por paso pasa del 25 % del intervalo), un snapshot por
  jugador con backpressure (se saltea si el socket tiene más de 64 KB sin enviar), ranking a 1 Hz, y el mensaje `reset` al entrar o reconectar.
  Los jugadores desconectados siguen en el mundo manejados por un bot hasta que vence la gracia. Un juego declara `realtime: true`
  para contar en `MAX_RT_ROOMS`.
- `public/shared/net/`: kit de red del cliente. `clock.js` (RTT y reloj del servidor con la muestra de menor RTT), `interp.js` (buffer de
  snapshots con retardo adaptativo según el jitter), `predict.js` (entradas con número de secuencia y reconciliación suave),
  `input.js` y `status.js` (chip con el ping y "Reconectando…"). Todo es lógica pura testeable en Node.
- `public/shared/arena-lobby.js` + `arena.css`: el menú común (nombre y color, Partida rápida, Sala privada con código y link, Sin conexión
  contra bots, lista de salas en vivo). Su encabezado documenta cómo usarlo.
- `tools/netsim/delay-proxy.mjs` pone latencia, jitter y paradas entre el navegador y el servidor para probar con ~160 ms de RTT
  (`?server=ws://localhost:<puerto del proxy>` en el link del juego, solo en localhost); `tools/load-bots.mjs` simula N jugadores y mide
  ms por paso del servidor y KB/s por cliente.

**Estela**: motos de luz en una grilla (160×160 por defecto, 20 pasos/s). Avanzás una celda por paso dejando una estela de largo máximo que
crece con el puntaje; chocar con una estela o una pared te hace explotar (el derribo suma al dueño de la estela; chocarte solo no da puntos a nadie), y dos
cabezas en la misma celda mueren las dos. El turbo gasta energía que se recarga rozando paredes y estelas. Se reaparece con escudo.
El mundo (`shared/world.js`) es determinista y corre igual en el servidor y sin conexión; la moto propia se predice y se reconcilia con
el servidor (responde en un cuadro aun con 250 ms de RTT) y las demás se interpolan. Cada cliente recibe solo lo cercano (interés de ±72 celdas).
Medido con 10 jugadores en la máquina de desarrollo: ~0,6 ms por paso del servidor y ~3,5 KB/s por cliente.

### Sumo y Rey de la Colina (arenas de discos)

Comparten la física de `public/shared/arena-physics.js` (discos con masa, amortiguación y choques elásticos, paso fijo de 1/30 s,
determinista y sin ganancia de energía). Los dos corren a 30 pasos/s con snapshots a 15 Hz; el disco propio se predice y se reconcilia
(mezcla de 150 ms, salto sobre 40 px) y los demás se interpolan con el retardo adaptativo del kit de red. Hasta 10 personas más bots.

- **Sumo** (`public/games/sumo/`): discos de radio 18 que se empujan sobre una plataforma que se achica del 100 % al 35 % en 75 s (después hay
  muerte súbita, así ninguna ronda queda trabada). Quien sale de la plataforma mira; el último en pie gana la ronda (+3) y cada caída suma +1 a
  quien te tocó en los 2 s previos. Rondas continuas, Empujón con recarga de 1,2 s. Medido con 10 jugadores: 0,44 ms por paso y 9 KB/s por cliente.
- **Rey de la Colina** (`public/games/rey/`): arena cuadrada con paredes que rebotan y 3 pozos; la colina (radio 70) se muda cada 25 s y avisa 3 s
  antes. Sumás 1 punto por segundo si estás solo adentro (disputada no suma nadie); Empujón y Onda (6 s de recarga, radio 120). Caer a un pozo = reaparecer
  a los 2 s. Gana quien llega a 100 o lidera a los 3 minutos. 0,6 ms por paso con 10 jugadores.

En el celular, joystick flotante a la izquierda y botones a la derecha (Empujón; y Onda en Rey). Los bots tienen tres niveles y predicen su posición
con la velocidad para frenar antes del borde o de un pozo.

### Territorio (captura de territorio)

Salís de tu territorio dejando un rastro y, si volvés, te quedás con lo que encerraste (relleno desde el borde dentro de la caja del territorio más
el rastro; un lazo de 100x100 cuesta ~3,5 ms). Si alguien pisa tu rastro (o vos el tuyo) perdés el territorio y el otro suma un derribo; de frente
mueren los dos; adentro de lo tuyo estás a salvo. Grilla de 120x120 a 10 pasos/s, hasta 10 personas más bots. El territorio viaja por deltas RLE por fila
dentro del área de interés; la cabeza y la captura propias se predicen con el mismo algoritmo y se reconcilian con el servidor. El cliente dibuja el
territorio en una capa cacheada actualizada por deltas. Controles: flechas/WASD, deslizar o cruceta opcional. 1,3 ms por paso y ~2 KB/s por cliente.

### Caída Libre (bloques que caen, último en pie)

Hasta 16 personas más bots, cada una con su tablero de 10x20 y piezas de una bolsa de 7 compartida por toda la ronda. Limpiar líneas manda basura (2 = 1,
3 = 2, 4 = 4, más racha) con un hueco por ataque, que se cancela con tus líneas y entra 1 s después; "la marea" evita que una ronda se eternice. Se elige a
quién atacar (azar, quien te ataca, el más débil, el líder). **Autoridad distinta a las demás arenas:** no hay física por paso en el servidor; el cliente
simula su tablero (respuesta inmediata) y manda cada fijado `lk`, el servidor lo reaplica con `shared/rules.js` (pieza de la bolsa, posición legal, apoyada
y alcanzable), calcula líneas, basura y derribos y contesta `ak`; si algo no valida manda `bd` con el tablero real y a las 4 faltas en un minuto saca al
jugador. Los rivales llegan como resúmenes a 2 Hz. Módulo propio sobre la API de salas (no `arenaGame`) y no cuenta en `MAX_RT_ROOMS`. Sin conexión:
Maratón y Contra la compu. En el celular: tocar gira, arrastrar mueve por columnas, deslizar abajo = caída suave o dura. ~1,7 KB/s por cliente con 16.

Pruebas con `npm test`; para medir cada arena: `node tools/load-bots.mjs --game sumo|rey|territorio|caida|estela --clients 10`.

### Drift Neon

Física arcade propia en `public/games/drift/shared/car.js` (paso fijo de 1/120 s): el volante define una velocidad de
giro que el auto alcanza con inercia y el agarre gira la velocidad hacia la trompa sin crear energía. Para derrapar se
tira del freno de mano doblando (o se frena/acelera fuerte en plena curva); el acelerador sostiene el derrape, el
contravolante lo cierra y pasado cierto ángulo es trompo. Quince pistas largas (`tracks.js`, de 1,5 a 2,1 km
cada una) con tema propio (ciudad, autopista, desierto, puerto, costa, montaña, nieve, estadio, aeródromo, cañón,
bosque con río, volcán, base lunar y bahía con lluvia): unas con puntos de control y otras trazadas con rectas y
curvas de radio exacto (`shared/turtle.js`, que cierra el circuito solo), todas validadas para que ningún tramo se
pise con otro. Todas tienen grava en las curvas cerradas, flechas y carteles de frenada. La compu (`shared/ai.js`) usa la misma física: sigue una línea de carrera
calculada, frena antes de las curvas, usa freno de mano en las horquillas y nitro en las rectas (tres niveles).
Modos: carrera contra hasta 5 autos de la compu, contrarreloj contra el fantasma de tu mejor recorrido de la sesión
(con parciales), desafío de drift, 2 jugadores en pantalla dividida y online de hasta 6 (el servidor valida los
tiempos con el largo de cada pista). El selector muestra el mapa grande con sus datos (largo, curvas, recta más
larga, dificultad, superficie y récord). El fondo se dibuja en mosaicos cacheados, así solo se redibuja lo que se
mueve.

### Trotamundos (geografía en 360°)

Te dejan en un lugar del mundo con vista de calle: mirás, caminás y marcás en un mapa dónde creés que estás; cuanto más
cerca, más puntos (`5000 · e^(−10·km/escala)`, con la escala del mapa elegido: mundo, región o país). Modos: sitios famosos,
lugares al azar, por país o región y desafío diario (las mismas 5 ubicaciones para todos, cambia a las 0 h de Argentina);
tiempo por ronda opcional, "Congelado" (sin mover, girar ni zoom) y pistas con anuncio opcional (círculos que se achican).
Online de 2 a 10 (`server/games/trotamundos.js`): salas públicas o privadas, partida rápida, "apurar", entrada tardía y
reconexión; el servidor lleva los relojes y el puntaje. Diseño completo y decisiones en [`docs/trotamundos.md`](docs/trotamundos.md).

- **Sin cuentas ni claves.** El visor es el embed de "Compartir → Insertar" de Google dentro de un iframe
  (`google.com/maps/embed?pb=…`, con latitud, longitud y rumbo), con la tarjeta que delata el lugar fuera de la vista y la
  atribución de Google siempre visible. Si algún día Google cambiara ese embed, `public/games/trotamundos/config.js`
  acepta una clave propia de la Maps Embed API (`EMBED_KEY`), que es gratis y sin límite. El mapa de marcar es MapLibre con
  los mapas gratuitos de OpenFreeMap (datos de OpenStreetMap).
- **Datos** (`public/games/trotamundos/datos/`): sitios famosos y lugares al azar validados cargando el embed en un
  navegador (que haya imagen y sea oficial de Google), con límites de países de Natural Earth (dominio público). Se generan
  con `node tools/trotamundos-datos.mjs` (ver `--help`: baja las fuentes, arma candidatos, valida con pocas cargas y frena
  si Google responde con un bloqueo). Para sumar lugares o famosos se agrega a la lista, se valida y se vuelve a armar.
- **Pruebas:** `npm run test:trotamundos` corre las pruebas de la lógica compartida, los datos, el servidor (con clientes `ws`
  reales) y el cliente online (hace falta `npm ci --prefix server` una vez; tarda unos 40 s y va aparte de `npm test`).

### Espiral (torre que gira)

La pelota rebota siempre en el mismo lugar y lo que gira es la torre (arrastrar, ← →/A D o mando): por los huecos cae, el
peligro (franjas) la hace perder y al pasar 3 anillos seguidos sin tocar se prende fuego y rompe el próximo, aunque sea
peligro. Pasar anillos suma con combo creciente (× el nivel). La lógica es pura y está en `public/games/espiral/shared/tower.js`
(misma en el navegador, el servidor y las pruebas): torres con semilla, dificultad por nivel (huecos más chicos, más peligro,
anillos que giran solos desde el nivel 4 y peligros que titilan desde el 7) y reglas de justicia probadas con muchas semillas
(siempre hay hueco y piso, se arranca sobre piso y nunca hay peligro justo debajo de un hueco quieto). La vista
(`scene.js`, three.js) arma cada anillo como un barrido con bisel en una sola malla, deja manchas de pintura, rompe los
anillos en pedazos y cambia de paleta por sección. Modos: **Niveles** (el nivel alcanzado y el récord quedan en
`gameit:espiral:*`; revivir con anuncio opcional), **Torre del día** (la misma para todos ese día, contra reloj: perder te
devuelve al comienzo de la sección) y **Carrera online** de hasta 8 (`server/games/espiral.js` sobre `_race.js`: salas
públicas para "Partida rápida" o privadas con código; cada uno manda su avance y se ven como fantasmas; el servidor rechaza
tiempos menores que caer toda la torre a la velocidad máxima y ordena a los que no llegaron por cuánto bajaron).

### Cruce (cruzar sin que te agarren)

Saltás de a una casilla (flechas/WASD, tocar = adelante, deslizar = costados, mando) por un camino infinito de pasto,
calles, vías y ríos (troncos que te llevan y camalotes quietos). El mundo (`public/games/cruce/shared/world.js`) se genera
con semilla y **todo lo que se mueve es una función del tiempo** desde la largada (autos, camiones y troncos dan la vuelta
a un circuito de 30 casillas; cada vía tiene su período con aviso de 1,7 s), así que con la misma semilla y el mismo
instante todos ven el mismo tráfico. Un "camino libre" que solo se corre en el pasto garantiza que siempre se puede pasar
(probado con BFS sobre muchas semillas) y el reparto en el circuito nunca deja dos autos o troncos pisándose. El saltador
(`Hopper`, misma lógica en las pruebas) guarda una orden en el aire, frena con árboles y muere atropellado, en el agua, si
el tronco lo saca de la zona o si se queda atrás (en solo la cámara avanza sola y baja el águila). La vista (`view.js`,
three.js con cámara ortográfica en diagonal) arma cada fila en una sola malla de cajas con colores por vértice y pone lo que
se mueve cada cuadro. Modos: **infinito** (récord, monedas y 6 personajes que se desbloquean con monedas, en
`gameit:cruce:*`; revivir con anuncio opcional), **Camino del día** (mismo mundo para todos ese día) y **Carrera online**
de hasta 8 (`server/games/cruce.js` sobre `_race.js`, con el flujo compartido de `public/shared/race-lobby.js`): meta a
60, 100 o 150 filas, puntos de control cada 25, fantasmas con nombre y tiempos imposibles rechazados.

### Micelio (fusionar hongos en un frasco)

Se apunta (mouse, arrastrar, ← → o mando) y se suelta un hongo; dos iguales que se tocan se funden en la especie
siguiente (11, del Botoncito al Ancestral; dos Ancestrales desaparecen con 100 puntos) y si la pila asoma por encima de
la línea durante 2,2 s se termina. La física (`public/games/micelio/shared/physics.js`) es propia: círculos con impulsos
secuenciales (rebote chico y fricción que los hace rodar), 4 subpasos y 7 iteraciones por cuadro, corrección de posición
y fusiones donde el hongo nuevo crece y empuja a los vecinos; está probada apilando 50 hongos sin que se atraviesen. Cada
especie se dibuja por código (`species.js`: sombrero con su patrón, tallo con cara que cambia al caer o al dormirse) en un
sprite cacheado por escala. Las especies descubiertas y el récord quedan en `gameit:micelio:*`. Modos: **clásico**,
**Hongos del día** (la misma secuencia para todos ese día) y **Duelo online** de hasta 8 (`server/games/micelio.js` sobre
`_race.js`, que ahora acepta tope de tiempo por sala y mensajes propios): misma secuencia para todos, 2, 3 o 5 minutos,
gana el mayor puntaje y, con esporas activadas, crear un hongo grande le tira hongos chiquitos a un rival al azar (el
servidor limita la frecuencia y rechaza puntajes imposibles para el tiempo jugado).

### Bolos (bowling de 10 pinos)

Se arrastra la bola para ubicarla y se desliza hacia arriba para tirar: el ángulo del gesto apunta, la velocidad al soltar
es la fuerza y la curva del final suma efecto (también hay botones de efecto y, con teclado o mando, ← → mover, A D apuntar,
Q E efecto y Espacio sostenido para la fuerza). La física (`public/games/bolos/shared/lane.js`) es 2D vista desde arriba y
determinista (solo + − × ÷ √): la bola resbala hasta los 9 m y después engancha según el efecto (hasta ~45 cm), los pinos
tienen masa real contra la bola, se chocan entre sí, rebotan en las paredes y se van al foso o a la canaleta; entrando al
bolsillo hay plenos seguido y de frente al 1 quedan splits, como en una bolera. Las reglas (`shared/rules.js`) son las del
bowling, en 5 cuadros (máximo 150) o 10 (máximo 300). La compu (`shared/cpu.js`) prueba tiros simulándolos y les suma un
error según el nivel (en 10 cuadros promedia ~135, ~167 y ~209). La bolera (`scene.js`, three.js) tiene carriles de madera
con flechas, reflejos en el carril, pinos torneados que vuelan y caen, la barredora y los carriles vecinos. Modos: contra la
compu (1 a 3), local (2 a 4), práctica y **online por carriles paralelos** de hasta 6 (`server/games/bolos.js`): cada uno tira
en su carril cuando quiere, el servidor simula el tiro con la misma física y decide los pinos, y los demás lo ven en el carril
de al lado; si alguien no tira en 45 s o se va, tira la máquina por él.

### Brasas (sobrevivir la noche)

Una brasita en un bosque oscuro que tiene que aguantar hasta el amanecer (noche corta de 5 minutos o larga de 10). Solo se
mueve (teclado, mando, joystick táctil que aparece donde se apoya el dedo, o el mouse apretado): las armas atacan solas. Hay
7 armas de 6 niveles (chispas, órbita, látigo, rayo, brasero, calor y estrellas fugaces) y 7 objetos de 5 niveles; en cada
nivel se elige 1 de 3 cartas (con dos cambios por noche). Las élites doradas dejan cofres, y un arma al máximo con su objeto
evoluciona al abrir uno (7 evoluciones para descubrir). Las oleadas (`public/games/brasas/shared/data.js`) traen sombras,
murciélagos, lobos, ojos que disparan, gólems, fantasmas que atraviesan y babosas que se dividen, con rondas de murciélagos,
manadas, muros de sombras y el Señor de la Bruma al 90 % de la noche. La simulación (`shared/sim.js`) es pura y determinista
con una grilla espacial para cientos de enemigos. El dibujo (`render.js`, `art.js`) es canvas 2D: un velo de noche con
agujeros de luz alrededor del fuego, ojitos que brillan en la oscuridad y un amanecer que quema todo. El oro que se junta
compra mejoras permanentes (fuerza, vida, paso, atracción, codicia y una segunda llama), y al final hay un desglose del daño
de cada arma.

### Vuelo (salto de esquí)

Salto de esquí en 3D (three.js). Se mantiene apretado para largar y bajar agachado (corrigiendo el equilibrio de costado),
se suelta justo en el borde de la mesa —una barra marca el momento: perfecto, bueno, temprano o tarde— y en el aire las
ráfagas mueven el cuerpo: hay que mantener el punto en el centro del círculo; cerca del piso se vuelve a apretar para el
telemark, cuando se cierra el anillo. La física (`public/games/vuelo/shared/hill.js`) es pura y determinista: rampa,
sustentación y resistencia del estilo en V, viento de frente que sostiene y de cola que hunde, y un perfil de caída armado
debajo del vuelo de un salto de referencia, así que los saltos buenos pasan el K y aterrizan suave. Hay tres trampolines
(normal K95, grande K120 y de vuelo K200, cada uno a otra hora del día). Los puntos son como en la realidad: distancia
desde el K más estilo de 5 jueces (se descartan la nota más alta y la más baja). Modos: Copa (3 trampolines × 2 rondas
contra 7 saltadores de la compu que saltan con la misma física), salto libre con el récord propio marcado en la nieve,
Viento del día (3 saltos con el mismo viento para todos) y **competencia online** de hasta 8 (`server/games/vuelo.js`):
mismos vientos por ronda, cada uno salta cuando quiere y ve a los demás como fantasmas; el servidor valida distancias y
estilos y suma los puntos.

### Solcito (gatos y cajas)

Rompecabezas de empujar cajas (sokoban) con gatos que quieren echarse la siesta al sol: hay que llevar cada caja de cartón
a un rayito de sol. Se empuja, nunca se tira; deshacer sin límite y reiniciar. Cinco cuartos con mecánicas nuevas: la
cocina (empujar), el patio helado (cajas y gatos se resbalan hasta chocar o llegar a piso firme), el cuarto de juegos
(túneles de tela: lo que entra por una boca sale por la otra, siguiendo derecho), la mudanza (dos gatos y cajas grandes
de 2×2 que solo se mueven si los dos empujan del mismo lado) y los desafíos. Las reglas (`public/games/solcito/shared/rules.js`)
traen un resolvedor a lo ancho que calculó el mínimo de movidas de cada uno de los 23 niveles (`shared/levels.js`); las
pruebas lo verifican. Estrellas según las movidas, cuartos que se abren de a poco y gatos dibujados con código
(`art.js`) que caminan, se resbalan, se meten en los túneles, se ponen contentos y al final se duermen en las cajas.

### Nébula (pinball)

Pinball espacial de una mesa, con física propia (`public/games/nebula/shared/physics.js`): pelotas con gravedad y
~1200 subpasos por segundo para que nada se atraviese, flippers que le pasan a la pelota la velocidad de su superficie,
hongos y gomas que patean, blancos fijos y de caída, una órbita con molinete, la rampa del cometa (la pelota viaja sola
por arriba y baja al carril izquierdo), el agujero negro que atrapa y escupe, y la compuerta del lanzador. Las reglas
(`shared/rules.js`) son las de una máquina de verdad: letras N-É-B-U-L-A que prenden el agujero negro, tres misiones en
orden (lluvia de cometas con multibola y jackpots en la rampa, hipervelocidad de puntos triples y carrera estelar
siguiendo las flechas), combos de rampa y órbita, carriles de arriba que suben el bonus (los flippers corren las luces),
tiro preciso, pelota salvada, bola extra, SUPERNOVA, bonus de fin de pelota y TILT si se sacude de más. El visor de
puntos (`dmd.js`) es un DMD de 128 × 32 con letras de mapa de bits, destellos, zoom y estrellas; la mesa se dibuja en
`render.js` (nebulosas, el horizonte de un planeta, luces que se prenden, el agujero negro girando, rampa de vidrio y
pelotas cromadas). Teclado, mouse, pantalla táctil (mitades para los flippers, botones de lanzar y sacudir) y joystick.
Récords locales con las mejores cinco partidas; cuando no se juega, la máquina juega sola.

### Fortín (defensa de torres)

Defensa de torres en un claro del bosque: los bichos salen de sus cuevas y marchan por el sendero hasta el tocón donde
viven los hongos. Se plantan hongos en el pasto: Champi (esporas), Bejín (bombas de esporas en parábola, no alcanza a lo
que vuela), Escarcha (pulsos de frío que frenan), Amanita (dardos de veneno que ignoran la coraza), Fosforito (rayos que
saltan) y Colmenilla (tiro largo al más duro); cada uno con tres niveles y dos especialidades a elegir (ráfaga o
perforante, gran nube o racimo, congelar o ventisca, plaga o debilitar, tormenta o sobrecarga, certero o cazador). Nueve
clases de bichos (hormigas, escarabajos con coraza, caracoles que se esconden, polillas y avispas que vuelan, orugas que se parten,
grillos que saltan, cucarachas que se curan) y tres jefes (escarabajo rinoceronte, reina avispa que suelta avispas y un
ciempiés gigante que suelta pedazos). Lluvia y raíces como poderes, oleadas que se adelantan a cambio de semillas, cinco
mapas con estrellas que se abren de a uno (uno con arroyo y puentes, dos con caminos dobles) y un modo infinito. La
simulación (`public/games/fortin/shared/sim.js`) es pura y las oleadas salen de un generador determinista por mapa
(`shared/data.js`), equilibrado con un bot que juega solo; las pruebas juegan partidas enteras. Todo se dibuja con código
(`art.js`): hongos con ojitos que miran al bicho que apuntan, bichos con patas que caminan y alas que aletean. En
celulares parados el mapa se gira para que entre grande; se juega con mouse, pantalla táctil, teclado o joystick.

### Paciencia (solitarios)

Los tres solitarios clásicos sobre un paño verde: Klondike (robando de a 1 o de a 3, con los puntos del clásico y el
bonus por tiempo), Spider de 1, 2 o 4 palos (dos mazos; las escaleras completas del rey al as salen solas) y FreeCell con
los repartos numerados de Microsoft (la partida n.º 1 es la de siempre). Las reglas (`public/games/paciencia/shared/rules.js`)
son puras: repartir con semilla, movidas válidas (alternar colores, reyes a columnas vacías, escaleras del mismo palo en
Spider y la capacidad de FreeCell según celdas y columnas libres), robar, subir solas a las bases las cartas que ya no
hacen falta, terminar solo y pistas. `shared/solver.js` trae un resolvedor de Klondike sabiendo todo (búsqueda en
profundidad con poda y estados vistos) que elige el **reparto del día** (siempre ganable, cambia a las 00:00 de
Argentina, con racha y para compartir) y la opción "solo repartos que se pueden ganar", y uno de FreeCell por mejor
primero que las pruebas usan para comprobar los repartos. Las cartas son del DOM y se mueven con transiciones: índices,
pips en su lugar, figuras dibujadas en SVG, frente simplificado en cartas chicas, cuatro dorsos y la cascada clásica
al ganar. Arrastrar o tocar (la carta va sola al mejor lugar), deshacer sin límite, estadísticas por juego, partidas que
se retoman y controles de teclado y joystick.

### Bollito (tirar bollitos al cesto)

Embocar bollitos de papel en el cesto de una oficina en 3D (three.js). Se desliza el dedo o se arrastra el mouse hacia el
cesto: el ángulo del gesto es la puntería y el largo, la fuerza (con teclado, ← → apuntan y Espacio sostenido carga la
fuerza; también con mando). Un ventilador de escritorio sopla distinto en cada tiro y el cesto cambia de lugar: en el
piso, sobre la mesita, arriba del archivero, junto a la impresora o escondido detrás del monitor del compañero (se ve su
silueta a través de los muebles). La física (`public/games/bollito/shared/physics.js`) es pura y determinista (paso fijo
de 1/480 s, solo + − × ÷ √): gravedad, arrastre del aire relativo al viento, el aro del cesto como un toro (el bollito
puede rebotar en el borde o entrar bailando), las paredes del cesto por dentro y por fuera, el piso, los muebles y las
paredes. Si entra sin tocar el aro es **¡Limpio!** y vale la mitad más; los aciertos seguidos multiplican. Modos: Clásico
(sin fin, 3 fallos y afuera, la distancia y el viento crecen), Diario (10 tiros con los mismos lugares y vientos para
todos, para compartir) y **online de 2 a 8** (`server/games/bollito.js`): misma serie para todos, cada uno a su ritmo
con los puntajes de los demás en vivo; al terminar se mandan los 10 tiros y el servidor los vuelve a simular con la
misma física para decidir qué entró. La oficina (`scene.js`) tiene ventanales al atardecer, persianas que dibujan rayas
de sol, un compañero que festeja o se lamenta, papel picado en los tiros limpios y cámara lenta cuando ya se sabe que
entra.

### Prisma (rompecabezas de luz)

Rompecabezas de luz en una sala oscura de museo: rayos de colores salen de los emisores y hay que girar y acomodar
piezas de vidrio para que cada cristal reciba justo su color, todos a la vez. Hay espejos de dos caras, divisores (medio
espejo: dejan pasar y además reflejan), prismas (la luz blanca entra por la base de bronce y sale roja a la izquierda,
verde derecho y azul a la derecha), filtros, portales y paredes; las piezas pueden estar atornilladas, girar con un toque
(clic derecho o mantener apretado: al revés) o esperar en una bandeja para arrastrarlas al tablero. La luz se suma: rojo
y verde dan amarillo, rojo y azul magenta, verde y azul cian y los tres, blanco. La óptica
(`public/games/prisma/shared/optics.js`) es pura: traza todos los rayos a la vez marcando qué colores ya pasaron por
cada casilla y dirección (así terminan las vueltas en círculo y los cruces). `shared/solver.js` es un resolvedor exacto
por ramificación y poda —solo prueba cambios en casillas iluminadas— que calcula el mínimo de jugadas de cada nivel, da
las pistas (la pieza que hay que tocar y dónde va, en dorado) y en las pruebas demuestra que ningún nivel se resuelve
en menos que su mínimo. Son 40 niveles en cinco capítulos que presentan una idea por vez (Espejos, Divisores, Prismas
y filtros, Mezclas, Portales y desafíos), con un ejemplo animado de cada pieza nueva, tres estrellas según las jugadas
y capítulos que se abren de a uno; los primeros de cada capítulo están hechos a mano y el resto salió del generador y se
eligió con reglas por capítulo. La **Luz del día** (`shared/generator.js`) se arma con la semilla de la fecha: hace
crecer una red de rayos, pone cristales donde terminan, desarma las piezas y el resolvedor garantiza que tiene solución
(más difícil de lunes a domingo); se comparte con los colores de sus cristales. Se juega con mouse, pantalla táctil,
teclado (cursor, Espacio levanta y suelta, Q/E giran) o joystick.

### Abismo (lluvia de balas bajo el mar)

Danmaku vertical: un submarino chiquito que brilla baja por tres etapas —el Arrecife con la luz del sol, el Bosque de
algas y La fosa, iluminada solo por bichos bioluminiscentes— esquivando medusas, peces globo que se inflan y revientan en
anillos, anguilas, minas, mantas y señuelos de rape, hasta un jefe por etapa (Pulpo gigante, Rape abisal y Leviatán) con
fases con nombre que se ganan por daño o se pierden por tiempo. Dispara solo; el modo preciso (Shift, un segundo dedo o
un botón del mando) frena el submarino, cierra el disparo y muestra el punto débil, que es lo único que se puede golpear;
el sonar (X, doble toque o el botón) borra las balas y las vuelve perlitas. Puntos por roces, perlas y una cadena que
multiplica; potencia de 1 a 4, vidas extra por puntos, continuar después de perder, tres dificultades, práctica de las
etapas alcanzadas y récords por dificultad. En el celular se mueve arrastrando en cualquier lado (el dedo nunca tapa el
submarino). La simulación (`public/games/abismo/shared/sim.js`) es determinista a 60 pasos por segundo con semilla,
grupos reciclados para mil balas y guiones de etapa como datos (`shared/stages.js`, `shared/bosses.js`,
`shared/patterns.js`: anillos, espirales, abanicos apuntados, olas, flores); un piloto automático (`shared/bot.js`)
juega las pruebas. El dibujo (`render.js`, `art.js`) es canvas 2D con sprites pre-dibujados, nieve marina con
paralaje, rayos de luz cerca de la superficie y brillos aditivos.

### Generala (dados)

El juego de dados de toda la vida en una mesa de paño en 3D (three.js) con cubilete de cuero: cinco dados, hasta tres
tiradas por turno guardando los que se quiera (se tocan y van a la fila de adelante) y una planilla escrita a mano con
los once casilleros: del 1 al 6, escalera (también 3-4-5-6-1), full, póker, generala y doble; servidas en la primera
tirada valen 5 más y la generala servida gana en el acto (se puede desactivar). La planilla muestra cuánto daría cada
casillero libre y resalta los dados que cuentan; anotar (o tachar) se confirma con un segundo toque. Las reglas
(`public/games/generala/shared/rules.js`) son puras; la compu (`shared/bot.js`) calcula sobre las 252 manos posibles qué
dados guardar para lo que se espera sacar con las tiradas que quedan y en qué casillero anotar según lo que promete
cada uno si se lo deja libre (fácil mira una tirada y se equivoca, difícil mira las dos; promedian ~150 y ~160 puntos).
La mesa (`shared/table.js`: turnos, tiempo, ausentes, lo que ve cada uno) corre igual en el navegador y en el servidor.
Modos: contra la compu (1 a 3 rivales, tres niveles), en la misma pantalla de 2 a 6, **online de 2 a 6**
(`server/games/generala.js`: el servidor tira los dados y valida cada jugada, el anfitrión puede sumar compus y si alguien
se va lo reemplaza la compu) y la **generala del día**: cada dado de cada tirada sale de la fecha, así todos ven los
mismos dados en el mismo lugar aunque guarden otros, y se comparte la planilla en cuadraditos.

### Truco (cartas españolas)

El truco argentino con el mazo español de 40 cartas dibujado en SVG (`public/shared/spanish-deck.js`, compartido con los demás juegos de naipes: oros, copas, espadas
y bastos con las pintas del marco, los anchos grandes y la sota, el caballo y el rey vestidos por palo) sobre una mesa de
paño, con los porotos anotados con fósforos. Está todo: tres bazas con parda, truco, retruco y vale cuatro (solo sube el
que quiso el último canto), envido, real envido y falta envido que se encadenan (y "el envido está primero" cuando te
cantan truco antes de tirar), mazo, flor opcional (se canta sola, anula el envido y se cobra al terminar la primera baza)
y partidas a 15 o a 30. Las reglas (`shared/rules.js`) son puras; la mesa (`shared/table.js`: turnos, cantos, puntos,
tiempo por jugada, ausentes) corre igual en el navegador y en el servidor y a cada jugador le manda solo sus cartas. La
compu (`shared/bot.js`) decide con lo mismo que ve una persona: reparte muchas veces las cartas que no vio (respetando lo
que se dijo en el envido y quién cantó flor), juega cada mano hasta el final para estimar la chance de ganarla, le da peso
a los cantos del rival (y se da cuenta si canta todo el tiempo) y miente de vez en cuando; tres niveles. Modos: contra la
compu mano a mano o en parejas (con un compañero de la compu), **online 1 vs 1 o 2 vs 2** (`server/games/truco.js`: el
servidor mezcla y reparte, el anfitrión elige parejas mezcladas o juntas, puntos, flor y nivel de la compu que completa
los lugares, y si alguien se desconecta juega la compu por él) y el **truco del día**, una partida a 15 contra Don Mate con
las mismas cartas para todos en cada mano.

### Escoba de 15 (baraja española)

El clásico de la baraja española con las 40 cartas de `public/shared/spanish-deck.js` sobre un paño verde azulado: tirás una
carta y te llevás las de la mesa que con la tuya suman 15 (la sota vale 8, el caballo 9 y el rey 10), si se puede levantar
hay que levantar y dejar la mesa limpia es una escoba. Al terminar cada ronda se cuentan escobas, más cartas, más oros, más
sietes y el siete de oros, a 21 o a 11. Se juega tocando: elegís una carta de la mano, las cartas de la mesa que forman
alguna suma de 15 se iluminan, tocás las que querés (la cuenta aparece al lado: "7 + 5 + 3 = 15 ✓") y confirmás; si hay una
sola forma ya queda elegida. Las reglas (`shared/rules.js`) son puras (`captures` encuentra todas las formas de levantar);
la mesa (`shared/table.js`: reparto, turnos, escobas, puntos por ronda, tiempo por jugada, ausentes) corre igual en el
navegador y en el servidor y a cada jugador le manda solo sus cartas. La compu (`shared/bot.js`) puntúa cada jugada posible
por lo que se lleva (cartas, oros, sietes, el velo, una escoba) menos lo que le deja servido al rival: la ganancia esperada
de su mejor respuesta con las cartas que todavía pueden tener; el nivel difícil cuenta lo que ya se levantó (le gana al
fácil 97 de 100 y al normal 70 de 100) y la "Pista" usa esa misma cabeza. Modos: contra la compu de a 2, 3 o en parejas de a
4, **online de 2 a 4** (`server/games/escoba.js`: el servidor reparte, entre rondas sigue en cuanto todos tocan "Siguiente" y si
alguien se desconecta juega la compu por él) y la **escoba del día**, una ronda contra Don Mate con las mismas cartas para todos.

### Sudoku

El sudoku de siempre sobre una hoja de cuaderno (`public/games/sudoku/`). Todo el juego depende de un motor sin DOM
(`shared/engine.js`) que se usa igual en el navegador, el servidor y las pruebas: un resolvedor con backtracking que **cuenta
soluciones** (así cada puzzle tiene exactamente una), un resolvedor "a lo humano" por técnicas (único desnudo, único oculto,
candidatos bloqueados, pares y tríos, X-Wing) y el generador, que con la misma semilla da siempre el mismo puzzle. La
**dificultad se mide por la técnica que hace falta**, no por cuántos números hay: fácil se resuelve solo con únicos (36 dados),
medio pide candidatos bloqueados, difícil pares o tríos y experto lógica más avanzada; el generador saca casilleros mientras
quede una sola solución y alcance con las técnicas del nivel, y se frena cuando hace falta una del nivel (cada puzzle sale
en menos de 300 ms). En la partida: notas (también por teclado con Shift o N), **Auto** que llena todos los candidatos,
deshacer y rehacer sin límite, números que ya se completaron atenuados, resaltado de fila, columna, caja y dígitos iguales, y
**Pista** que explica el paso ("en la caja 5 el 1 solo puede ir en esta casilla"), avisa si algo está mal puesto y, cuando hace
falta lógica avanzada, nombra la técnica. Se puede jugar con errores contados (tres y se pierde), solo mostrados o sin
avisos, y la partida se guarda sola para **Continuar**. El **sudoku del día** es el mismo para todos y sube durante la semana
(lunes y martes fácil, miércoles y jueves medio, viernes y sábado difícil, domingo experto). La **carrera online**
(`server/games/sudoku.js`, sobre la base de las carreras `_race.js`) arma el mismo puzzle en todos los navegadores con la semilla
del servidor, muestra el avance de cada uno y gana quien termina primero: el servidor guarda la solución (nunca viaja), solo acepta
la grilla exacta y acota el tiempo a lo posible.

### Damas

Damas en madera sobre una mesa pizarra (`public/games/damas/`) con **tres reglamentos**: *clásicas* (brasileñas: dama voladora,
los peones comen también para atrás y hay que comer la mayor cantidad), *españolas* (peones solo hacia adelante) e *inglesas*
(dama de un paso y se elige qué comer). Las reglas están en `shared/rules.js`, sin DOM, y las usan igual el navegador, el
worker de la compu y el servidor: la captura es obligatoria, una jugada es la cadena entera de saltos (las piezas comidas
estorban hasta el final y no se saltan dos veces), coronación al terminar o, en las clásicas, solo si se termina en el fondo,
y tablas por acuerdo, triple repetición, 20 jugadas de cada uno sin captura ni avance de peón y dama contra dama. El generador
de jugadas está verificado con perft contra los números de las damas inglesas (7, 49, 302, 1469, 7361, 36768, 179740, 845931).
La compu (`shared/engine.js`) es un alfa-beta con profundización iterativa, búsqueda de quietud sobre las capturas
obligatorias, tabla de transposición, killers e historia; piensa en un worker (`ai.js`) con 5 niveles (los bajos eligen con
ruido para equivocarse como una persona), convierte tres damas contra una y la "Pista" usa la misma búsqueda. Se juega tocando la ficha y
la casilla: si la captura tiene caminos distintos se va eligiendo salto por salto, las fichas que deben comer se marcan y las
comidas se apagan hasta cerrar la jugada. Contra la compu hay deshacer, pista, tablas (la compu acepta si no se ve ganando) y
la partida se guarda sola para **Continuar**; de a dos en la misma pantalla puede girar el tablero en cada turno; al terminar
se puede **repasar** jugada por jugada. **Online** (`server/games/damas.js`): el servidor valida cada jugada con las mismas reglas
y lleva el reloj con incremento (3+2, 5+0, 10+0, 15+10, 30+0), la primera jugada de cada lado tiene 40 s o se anula, hay oferta
y aceptación de tablas, rendición, revancha con los colores cambiados, partida rápida por salas públicas y reconexión con la
partida en curso.

### Reversi

Reversi con fichas que se dan vuelta en cadena sobre fieltro verde (`public/games/reversi/`). Las reglas (`shared/rules.js`,
sin DOM, compartidas por el navegador, el worker de la compu y el servidor) resuelven el **pase automático**: si el rival no
puede mover sigue el mismo jugador, y la partida termina cuando ninguno puede; el generador de jugadas está verificado con perft
contra los números conocidos (4, 12, 56, 244, 1396, 8200, 55092, 390216). La compu (`shared/engine.js`) es un alfa-beta con
profundización iterativa y tabla de transposición que evalúa casillas, movilidad, esquinas, frontera y bordes estables, y
tiene un **resolvedor exacto del final** (el nivel experto resuelve las últimas 15 casillas y el difícil las últimas 12; el
resolvedor está comprobado contra probar todas las partidas, también con pases); piensa en un worker (`ai.js`) con 5 niveles
cuyos bajos eligen con ruido para equivocarse como una persona. Se juega tocando una casilla: se marcan las jugadas posibles, la
ficha cae y las encerradas se dan vuelta en cadena (volteo 3D en CSS), con contadores, aviso de pase, pista, deshacer contra la
compu, partida guardada para **Continuar** y repaso jugada por jugada al terminar. **Online** (`server/games/reversi.js`): el
servidor valida cada jugada con las mismas reglas y lleva el reloj con incremento (2+0 a 15+10), la primera jugada de cada lado
tiene 40 s o se anula, hay rendición, revancha con los colores cambiados, partida rápida por salas públicas y reconexión con la
partida en curso.

### Bloques

Puzzle de piezas sobre un tablero de 8×8 (`public/games/bloques/`): se arrastran tres piezas por vez (37 formas, que no se
giran), cada fila o columna completa se limpia y los puntos suben con las líneas simultáneas, el combo (hasta ×4, se pierde tras tres
jugadas sin limpiar) y el bonus de tablero limpio. El motor (`shared/engine.js`, sin DOM y compartido con el servidor) arma las
manos de dos maneras: en el **clásico** son adaptativas, se prueba que las tres piezas se puedan colocar enteras en algún orden;
en el **diario** y la **carrera** salen solo de la semilla y el número de mano, así que son iguales para todos. Con el dedo la pieza
se levanta por encima del pulgar y se engancha a la casilla más cercana donde entra, marcando qué líneas completaría; las limpiezas
se animan con casilleros fantasma, chispas en un canvas, texto flotante, sacudida opcional y vibración. Hay **pista** (3 por
partida, en el clásico) y la partida clásica se guarda sola para **Continuar**. La **carrera online** (`server/games/bloques.js`,
sobre las carreras `_race.js`) da las mismas manos a hasta 6 jugadores por 1:30, 3:00 o 5:00; gana quien más puntos junta, no
quien termina primero. Para que nadie invente un puntaje, cada jugador entrega sus colocaciones (2 caracteres cada una) y el
servidor **rehace la partida** con el mismo motor: el puntaje que cuenta es el que sale de ahí y se rechaza lo que no cabe en el
tiempo que pasó. El **diario** guarda un solo intento por día y el resultado se comparte como
`game.it · Bloques #N · puntos`.

### Fusión (2048)

Deslizar y fusionar fichas (`public/games/fusion/`): todas las fichas corren hasta donde pueden, las iguales se fusionan y suman el
valor nuevo, y después de cada movimiento que cambia algo entra una ficha (un 2 el 90 % de las veces, un 4 el resto). El motor
(`shared/engine.js`, sin DOM y compartido con el servidor) guarda exponentes y saca las fichas nuevas de un generador con semilla
que avanza una vez por ficha: con la misma semilla y los mismos movimientos la partida es idéntica en cualquier lado. Se desliza con el dedo
o el mouse (se anima cada ficha, la fusión hace un golpe y el puntaje sube con un texto flotante), con flechas o WASD y con el mando;
un movimiento durante la animación queda en cola. El **clásico** tiene tableros de 3×3, 4×4 y 5×5 con récord por tablero, 3
deshacer por partida y la partida guardada para **Continuar**; al llegar al 2048 aparece un aviso y se puede seguir. La **carrera
online** (`server/games/fusion.js`, sobre las carreras `_race.js`) da las mismas fichas a hasta 6 jugadores por 1:30, 3:00 o 5:00 y
gana quien más puntos junta; cada jugador entrega sus movimientos (un carácter cada uno: L R U D) y el servidor **rehace la
partida** con el mismo motor: el puntaje que cuenta sale de ahí y se rechaza lo que no cabe en el tiempo que pasó. El **diario** tiene
un solo intento por día con las mismas fichas para todos y se comparte como `game.it · Fusión #N · ficha más alta`.

### Mancala (Kalah)

Mancala clásico con semillas de colores sobre un tablero de madera (`public/games/mancala/`). Las reglas (`shared/rules.js`, sin DOM,
compartidas por el navegador, el worker de la compu y el servidor) son las del Kalah: se siembra en sentido contrario a las agujas
del reloj salteando el depósito del rival, la última semilla en el propio depósito da **turno extra**, la que cae en un hoyo propio
vacío **captura** el de enfrente y, cuando a un lado no le quedan semillas, el otro se guarda las suyas. Se puede jugar con 3, 4 (el
clásico) o 6 semillas por hoyo. La compu (`shared/engine.js`) es un alfa-beta con profundización iterativa y tabla de transposición
que ordena primero los turnos extra y las capturas; piensa en un worker (`ai.js`) con 5 niveles cuyos bajos eligen con ruido, y los
niveles están comprobados entre sí (cada uno le gana al anterior). La siembra se anima semilla por semilla con una mano que reparte,
con destello en la captura y en el turno extra; al mantener o pasar el dedo por un hoyo se ve dónde caería la última semilla (verde
si es el depósito). Hay pista, deshacer contra la compu y de a dos, partida guardada para **Continuar** y repaso jugada por jugada
al terminar. **Online** (`server/games/mancala.js`): el servidor valida cada jugada con las mismas reglas y lleva el reloj con
incremento (2+0 a 15+10), la primera jugada de cada lado tiene 40 s o se anula, hay rendición, revancha con los lados cambiados,
partida rápida por salas públicas y reconexión con la partida en curso.

### Memotest (memoria)

Memotest de cartas que se dan vuelta (`public/games/memotest/`) con seis modos: **solo** (de 12 a 36 cartas; cuenta intentos y tiempo, da hasta tres estrellas según
los intentos por par y guarda el récord por tamaño), **del día** (las mismas 24 cartas para todos, un solo intento, con la partida
guardada si se recarga a mitad), **contra la compu**, **de a varios** en la misma pantalla (2 a 4) y **online** de 2 a 4. El mazo
(`shared/deck.js`, sin DOM y compartido con el servidor) son 72 caras en cuatro temas de 18 (frutas, animales, comida y cosas) más una
mezcla, y reparte con una semilla: la del día sale de la fecha (`memotest-daily-AAAA-MM-DD`). La compu (`shared/brain.js`) no ve las
cartas tapadas: solo se acuerda, con cierta chance, de las que vio dar vuelta (las suyas y las del jugador) y se olvida de algunas
cada turno; sus tres niveles (Despistado, Atento y Memorión) necesitan, en simulaciones, unos 3, 2 y 1,7 intentos por par, y las pruebas comprueban que cada nivel necesita menos que el anterior. Las cartas se dan
vuelta en 3D, las llevadas quedan con el color de quien se las llevó, y en solo no hace falta esperar a que se tapen las dos que
erraste. **Online** (`server/games/memotest.js`): el servidor guarda el reparto y a los jugadores solo les manda la cara de las cartas
que se dan vuelta (nadie puede espiar el mazo), resuelve cada par (900 ms si acierta, 1,5 s si falla, para que todos lo vean), da 25 s
por turno (con la barra de tiempo en la tarjeta del jugador; si se vence dos veces seguidas el jugador queda afuera y sigue mirando),
corta con victoria si quedan menos de dos en juego, deja la revancha al anfitrión, arma partidas rápidas por salas públicas y
reconecta con el tablero tal cual estaba.

### Puntos y cajas (puntitos y rayitas)

El de los cuadernos (`public/games/puntos/`): se unen puntos vecinos con rayas, el que cierra la cuarta raya de una caja se la queda y
juega de nuevo, y gana quien termina con más cajas. Tableros de 3×3 a 6×6 sobre una hoja cuadriculada (o un pizarrón, con el tema oscuro) con
rayas de lapicera azul y roja trazadas con una curvita a mano y cajas marcadas con X y O. Las reglas (`shared/rules.js`, sin DOM,
compartidas por el navegador, el worker de la compu y el servidor) están comprobadas contra una implementación aparte por coordenadas en
cientos de partidas al azar, y deshacer vuelve a la posición exacta. La compu (`shared/engine.js`) suma habilidades por nivel: toma
cajas, evita regalar (rayas "seguras"), regala lo mínimo cuando ya no quedan, cuida la paridad de las rayas seguras y **resuelve el
final exacto** con una búsqueda negamax con tabla de transposición (hasta 23 rayas libres en el nivel experto, comprobada contra probar
todas las partidas, incluida la jugada de dejar dos cajas para quedarse el control); piensa en un worker (`ai.js`) y cada nivel le gana al
anterior en partidas con ventaja alternada. Se juega acercando el dedo a una raya (se marca) y soltando; se puede deslizar para
cambiar de raya antes de soltar. Hay pista, deshacer (contra la compu vuelve al comienzo de tu último turno), partida guardada para
**Continuar** y repaso raya por raya al terminar. **Online** (`server/games/puntos.js`): el servidor valida cada raya con las mismas
reglas y lleva el reloj con incremento (2+0 a 15+10; cerrar una caja deja el reloj corriendo para el mismo jugador), la primera
jugada de cada lado tiene 40 s o se anula, hay rendición, revancha con quien empieza alternado, partida rápida por salas públicas y
reconexión con la partida en curso.

### 5 en línea (Gomoku)

Gomoku en tableros de 9×9, 13×13 y 15×15 (`public/games/gomoku/`): las negras empiezan, se pone una piedra por turno y gana quien arma
cinco o más seguidas (juego libre); si se llena el tablero, empate. Las reglas (`shared/rules.js`, sin DOM, compartidas por el
navegador, el worker de la compu y el servidor) devuelven la fila ganadora para resaltarla. La compu (`shared/engine.js`) mira el
tablero por "ventanas" de 5 cruces (cada una vale según cuántas piedras de un solo color tiene, y se actualiza de a una piedra) y
corre un alfa-beta con profundización iterativa que solo mira jugadas cerca de las piedras, ordenadas por lo que atacan y lo que
tapan; siempre juega la victoria inmediata o tapa el cuatro del rival, y si el rival tiene dos jugadas ganadoras da la partida por
perdida. Sus cinco niveles (de jugar a ojo a profundizar hasta donde da el tiempo) están comprobados en partidas con aperturas
al azar y colores alternados (cada nivel le gana al anterior). Se juega con un clic con el mouse y, en pantallas táctiles, tocando la
cruz (aparece la piedra con un anillo) y confirmando con un segundo toque o con el botón "Colocar", para no poner piedras por
error en tableros chicos. Hay pista, deshacer, partida guardada para **Continuar** y repaso jugada por jugada. **Online**
(`server/games/gomoku.js`): el servidor valida cada jugada y lleva el reloj con incremento (2+0 a 15+10), la primera jugada de
cada lado tiene 40 s o se anula, hay rendición, revancha con los colores cambiados, partida rápida por salas públicas y
reconexión con la partida en curso.

### Dominó (doble seis)

El dominó de las 28 fichas (`public/games/domino/`) sobre un paño verde con borde de madera: las fichas son de marfil con los puntos de
colores (cada número tiene el suyo, para leer la mesa de un vistazo) y la mano queda parada en un atril. Cada uno recibe 7; se juega por
las dos puntas de la cadena, los dobles van cruzados, y si no hay con qué jugar se **roba del pozo** (de a 2 y de a 3, o se juega "sin
robar" y se pasa) o se pasa. La primera ronda abre el doble más alto con ese doble, después sale el que ganó. La ronda la gana quien se
queda sin fichas (dominó) o, si se **tranca** el juego, quien tiene menos puntos en la mano (en parejas se suman los dos compañeros), y
se lleva lo que suman las fichas rivales, hasta 50, 100 o 150. Las reglas (`shared/rules.js`) son puras; la mesa (`shared/table.js`:
reparto, robo, pasadas automáticas, tranque, puntos, tiempo por jugada, ausentes) corre igual en el navegador y en el servidor, que le
manda a cada jugador solo sus fichas. El tablero (`shared/layout.js`) acomoda la cadena en "serpiente": cada brazo corre derecho hasta
el borde y vuelve por la fila de al lado (el derecho baja y el izquierdo sube, así nunca se pisan), con el borde elegido para que las
fichas queden lo más grandes posible en la pantalla que haya y todo se desliza al achicarse. Se juega tocando una ficha (se marcan los
lugares donde entra: el número de la punta) y tocando de nuevo la ficha, el lugar o el botón; con teclado, flechas, `L`/`R` para el
lado, `Enter`, `D` para robar y `H` para la pista. La compu (`shared/bot.js`) tiene tres niveles: el fácil juega cualquier ficha, el
normal se saca de encima las pesadas y las que le cortan el juego, y el **difícil** reparte al azar las fichas que no ve entre los
demás (respetando los números que cada uno ya mostró que no tiene al pasar) y juega cada ronda hasta el final con 90 repartos para
elegir la jugada que mejor le sale en promedio (le gana al normal entre 76 y 95 de 100). Modos: contra la compu de a 2, 3 o en parejas
de a 4, **online de 2 a 4** (`server/games/domino.js`: el servidor reparte y valida, entre rondas sigue en cuanto todos tocan
"Siguiente" y si alguien se desconecta o se le acaba el tiempo dos veces juega la compu por él) y el **dominó del día**, una ronda
contra Don Mate con las mismas fichas para todos.

### Penales (tanda de penales en 3D)

Una tanda de penales (`public/games/penales/`) en three.js sobre una cancha con pasto a rayas, arco con red que se infla, carteles y tribuna
(todo dibujado con texturas de canvas, sin imágenes): cada lado patea 5 veces alternando (3 o 5 a elección contra la compu), gana el que más
goles hace, termina antes si el otro ya no alcanza y si empatan sigue la muerte súbita. Cuando **pateás** tocás el arco para poner la mira
y mantenés "Patear": la barra de fuerza sube y baja y al soltar sale el remate; más fuerza deja menos tiempo al arquero pero abre la
puntería (el círculo punteado de la mira es el error posible), así que un ángulo a todo lo que da puede irse afuera, por arriba o al palo.
Cuando **atajás** elegís a ciegas entre seis zonas (izquierda, centro y derecha, arriba y abajo) y recién después se ve el remate: el
arquero alcanza lo que está cerca de su zona y menos si el tiro viene fuerte. Las reglas (`shared/rules.js`: puntería con error normal,
alcance del arquero, palo/afuera/por arriba) y la tanda (`shared/match.js`) son puras y las usan el navegador y el servidor; la cancha
(`scene.js`) solo anima un remate ya resuelto (carrera, patada, vuelo, red, atajada o palo, festejo) y avisa cada momento para los sonidos
y carteles. La compu (`shared/cpu.js`) tiene tres niveles: el fácil patea y se tira al azar, el normal patea a los ángulos sin repetirse y
a veces se tira al lado que más usaste, y el **difícil** anota a dónde pateás y a dónde te tirás (con más peso a lo último) y elige, con
tablas de chances de gol calculadas con semilla fija, el tiro o la zona que mejor le sale contra tus costumbres (le gana al normal 65 de
100 y al fácil 87). **Online 1 contra 1** (`server/games/penales.js`): los dos mandan lo suyo a la vez y a ciegas, el servidor sortea el
error de puntería y la suerte del arquero, resuelve con las mismas reglas y manda el resultado para que los dos lo animen igual; si se
acaba el tiempo (18 s) elige por el que falta, hay revancha (patea primero el otro) y reconexión con la tanda en curso.

### Chorrito (tubos de colores)

Un clásico de ordenar líquidos (`public/games/chorrito/`) dibujado en un canvas 2D: tubos de vidrio con capas de colores (entran 4 como mucho),
tocás uno para levantarlo y otro para **trasvasar la tanda de arriba** (todas las capas seguidas del mismo color) si el destino está vacío o
tiene ese color arriba, hasta donde haya lugar; gana quien deja cada tubo vacío o lleno de un solo color. Al verter, el tubo viaja hasta la
boca del otro y se inclina justo lo que hace falta para que el líquido llegue al borde (el ángulo sale de calcular el área del interior del
tubo bajo la superficie horizontal, así el nivel queda siempre parejo y la superficie baja de verdad mientras sale el chorro). El motor
(`shared/engine.js`) es puro: reglas, generador y un **resolvedor** A* con peso (los niveles se arman con una semilla y solo se aceptan si el
resolvedor los resuelve, así que todos tienen solución; el largo de esa solución es el "par" de las estrellas y sirve de pista, que muestra
el próximo trasvase). Los niveles suben de 3 a 12 colores (uno más cada dos niveles, con dos tubos vacíos y, de a ratos desde el 25, solo
uno), con deshacer, reiniciar y un tubo extra por nivel; hay símbolos en los colores para quien no los distingue bien y el progreso guarda
las estrellas por nivel. El **chorrito del día** es el mismo para todos (10 colores, semilla `chorrito-daily-AAAA-MM-DD`), cuenta los
trasvases (estrellas contra el par), guarda la partida en curso y se comparte como los demás. **Online** (`server/games/chorrito.js`, de 1 a 6
con la base de carreras): todos reciben el mismo nivel (semilla y cantidad de colores de 6, 8, 10 o 12 las pone el servidor), van mandando
cuánto llevan ordenado (`engine.settled`: de cada color, su tanda más larga desde el fondo) y el primero que lo resuelve gana. Para dar por
terminado a alguien el servidor **rehace uno por uno los trasvases** que mandó sobre el mismo nivel y exige que lo dejen resuelto; el tiempo
lo mide el servidor (con un piso de 0,3 s por trasvase) y no se acepta nada antes de la largada. Si el último que falta pierde la conexión
(recarga la página) se lo espera 20 s (`rejoinMs` de `_race.js`, apagado por defecto) antes de cerrar la carrera.

### Gemas (tres en línea)

Un juego de combinar gemas (`public/games/gemas/`) en un canvas 2D: se intercambian dos vecinas (tocando una y otra, o deslizando) y vale
si arma una línea de tres o más del mismo color; lo que cae puede armar más líneas (cascadas, cada paso multiplica los puntos). Cuatro en
línea hacen un **rayo** (borra su fila o su columna), una L o una T una **bomba** (3 × 3) y cinco un **prisma** que, cambiado por una gema,
se lleva todas las de ese color; dos especiales cambiadas entre sí se combinan (cruz, tres filas y columnas, 5 × 5, todo un color convertido
en rayos o bombas, todo el tablero). Cada color tiene su forma (rubí hexagonal, ámbar cuadrado, citrino rombo, esmeralda octogonal, zafiro
redondo y amatista triangular), dibujada con facetas que se iluminan según hacia dónde miran. El motor (`shared/engine.js`) es puro y todo
el azar sale de una semilla: cada jugada devuelve la lista de lo que pasó (intercambio, limpiezas con sus efectos, caídas, mezcla si no
quedan jugadas) para animarlo, y una lista de jugadas en texto rehace exactamente la misma partida. La compu (`bestMove`) prueba cada
jugada sobre una copia **a ciegas** (sin espiar lo que va a caer); da las pistas (sola a los 6 s quieto, o con `H`) y calibra los niveles
(`shared/levels.js`): hay tres objetivos que se turnan (llegar a un puntaje, **juntar** gemas de dos o tres colores, **romper el hielo** de
una o dos capas con dibujos simétricos) y las metas, las jugadas y las estrellas salen de jugar cada nivel con la compu cinco veces con
otras gemas cayendo (percentiles, más exigentes a medida que se avanza; los dibujos de hielo que le cuestan demasiado se alivianan). Al
cumplir con jugadas de sobra, cada una se vuelve un rayo que explota ("lluvia de rayos"). También hay **contrarreloj** de 90 segundos con
récord, las **gemas del día** (25 jugadas con las mismas gemas para todos, la partida en curso se guarda y se rehace al volver) y un
**duelo online** de 1 a 6 (`server/games/gemas.js`, con la base de carreras): mismas gemas y mismas jugadas (20, 30 o 40) para todos, gana
el que más puntos junta; al terminar cada uno manda sus jugadas y el servidor rehace la partida para contar los puntos (rechaza jugadas
inválidas, de más o de menos, y partidas imposiblemente rápidas). Si alguien recarga la página en medio del duelo, sigue donde estaba.

## Juegos diarios

Un desafío nuevo por día, igual para todos y a la misma hora: **cambia a las 00:00 de Argentina** (UTC−3 fijo). Cada juego
guarda su día, sus estadísticas y su racha por idioma en `localStorage` (`gameit:<id>:…`) y deja un resumen en
`gameit:daily:<id>` que el menú usa para mostrar "Nuevo" o "✓ racha N" en el estante **Desafíos de hoy** (los juegos con
`"daily": { "epoch": "AAAA-MM-DD" }` en su `game.json`; `epoch` es el día del desafío n.º 1 y la categoría es `diarios`).

Todo lo común está en `public/shared/` y se usa con rutas absolutas (`/shared/…`):

| Módulo | Qué hace |
| --- | --- |
| `daily.js` | Día de Argentina, n.º de desafío, generador con semilla (`rng`), estado del día, estadísticas y racha, compartir. |
| `daily-ui.js` + `daily.css` | Ventanas, avisos, estadísticas con histograma, resultado con cuenta regresiva y compartir, alto contraste para daltonismo. |
| `guess-grid.js` | Motor de los juegos de adivinar en grilla (casillas que giran, teclado en pantalla y físico): Quinteto, Cuarteto, Dígitos, Ecuación y Cálculo solo aportan sus reglas y textos. |
| `daily-shell.js` | `createDailyApp({ id, epoch, rows, t, load, build })`: cabecera, ayuda, estadísticas, resultado, modo práctica, cambio de idioma y de día a medianoche; el juego arma su pantalla en `build`. |
| `math-expr.js` | Cuentas exactas con fracciones (sin `eval` ni decimales), validación de ecuaciones, forma canónica y generadores con semilla. |
| `countries/` + `country-input.js` | 193 países con nombres es/en y alias, centros, distancia y rumbo, y el campo con autocompletado. |
| `words5/` | Palabras de 5 letras: válidas (de los diccionarios de Mecha Corta) y respuestas curadas. |

Datos generados con herramientas de `tools/daily/` (`words5.mjs`, `countries.mjs` desde Natural Earth y `flag-icons`, y las de cada juego);
cada carpeta de datos tiene su `LEEME.txt` con las fuentes y licencias. Para sumar un diario nuevo, copiar `public/games/banderin/` (con
`createDailyApp`) o `public/games/quinteto/` (con `createGuessGame`).

### Los diarios, uno por uno

| Juego | Qué se juega | De dónde salen los datos |
| --- | --- | --- |
| Quinteto, Cuarteto | Palabra de 5 letras en 6 intentos (Cuarteto: 4 tableros a la vez, 9 intentos). | `words5/`, de los diccionarios de Mecha Corta. |
| Dígitos, Ecuación, Cálculo | Número, ecuación o cuenta secreta con pistas por casilla. | Se generan con la semilla del día (`math-expr.js`). |
| Banderín | Bandera tapada con bloques que se destapan en 6 intentos. | `flag-icons` (MIT), solo se baja la bandera del día. |
| Silueta | País por su silueta, con km, flecha y % de cercanía por intento. | Natural Earth (dominio público), `shapes.json` armado con `tools/daily/countries.mjs`. |
| Rumbo | Globo que se gira: cada país probado se pinta según qué tan cerca está su frontera de la del país del día (intentos ilimitados). | Mismo dataset, `world.json`; proyección y distancias en `geo.js`. |
| Vínculos | 16 palabras en 4 grupos ocultos, 4 errores. | `data/puzzles-<idioma>.json` (60 por idioma, escritos para el juego); `node tools/daily/vinculos-check.mjs` los valida. |
| Colmena | 7 letras en un panal: palabras de 4 o más con la letra central; rangos por % del máximo. | `tools/daily/colmena-gen.mjs` arma 730 panales por idioma con los diccionarios de Mecha; las "rebuscadas" valen sin sumar. |
| Tibio | Palabra secreta; cada intento devuelve su puesto por cercanía de significado. | Vectores fastText common-crawl (CC BY-SA 3.0, ver `tibio/data/LICENSE.txt`) reducidos con PCA a 96 dimensiones e int8 (≈3 MB por idioma); `tools/daily/tibio-build.py` los regenera. El ranking se calcula en el navegador. |
| Paciencia | Klondike robando de a 1 con un reparto que siempre se puede ganar; cuentan el tiempo y las jugadas. | Se reparte con la semilla del día y el resolvedor (`paciencia/shared/solver.js`) descarta los repartos imposibles. |
| Prisma | Rompecabezas de luz: girar y poner espejos, divisores, prismas y filtros para encender los cristales con su color; cuentan las jugadas contra el mínimo. | Lo arma `prisma/shared/generator.js` con la semilla del día y el resolvedor (`shared/solver.js`) garantiza que tiene solución y calcula el mínimo. |
| Generala | Once turnos de generala solo, con los mismos dados para todos (cada dado sale de la fecha aunque se guarden otros); cuenta el puntaje. | Los valores salen de la semilla del día (`daily.js`) en `generala/game.js`; la mesa es la misma que la de las partidas normales. |
| Truco | Una partida a 15 contra Don Mate con las mismas cartas para todos (cada mano sale de la fecha); cuenta si ganaste y por cuánto. | El mazo de cada mano y la suerte de la compu salen de la semilla del día (`daily.js`) en `truco/game.js`; la mesa es la misma que la de las partidas normales. |
| Escoba | Una ronda de escoba contra Don Mate con las mismas cartas para todos (la baraja sale de la fecha); cuenta si ganaste y por cuánto. | El mazo de la ronda y la suerte de la compu salen de la semilla del día (`daily.js`) en `escoba/game.js`; la mesa es la misma que la de las partidas normales. |
| Sudoku | Un puzzle por día, igual para todos (fácil lunes y martes, medio miércoles y jueves, difícil viernes y sábado, experto el domingo); cuenta el tiempo. | La semilla es la fecha (`sudoku:daily:AAAA-MM-DD`) y el generador de `sudoku/shared/engine.js` da siempre el mismo puzzle; el resultado y la racha se guardan con `daily.js`. |
| Bloques | Una partida de bloques con las mismas piezas para todos (cada mano sale de la fecha y no depende de cómo juegues) y un solo intento; cuenta el puntaje. | La semilla es la fecha (`bloques-daily-AAAA-MM-DD`) y `bloques/shared/engine.js` da siempre las mismas manos; el resultado y la racha se guardan con `daily.js`. |
| Fusión | Una partida de 2048 de 4×4 con las mismas fichas nuevas para todos y un solo intento; cuenta el puntaje y la ficha más alta. | La semilla es la fecha (`fusion-daily-AAAA-MM-DD`) y `fusion/shared/engine.js` saca las fichas nuevas siempre iguales; el resultado y la racha se guardan con `daily.js`. |
| Memotest | 24 cartas (12 pares de la mezcla de temas) con el mismo reparto para todos y un solo intento; cuenta los intentos (estrellas) y el tiempo. | La semilla es la fecha (`memotest-daily-AAAA-MM-DD`) y `memotest/shared/deck.js` reparte siempre igual; el resultado y la racha se guardan con `daily.js`, y la partida en curso queda guardada si se recarga. |
| Dominó | Una ronda de dominó de a dos contra Don Mate (nivel difícil) con las mismas fichas para todos (el reparto sale de la fecha); cuenta si ganaste y por cuánto. | El reparto de la ronda y la suerte de la compu salen de la semilla del día (`daily.js`) en `domino/game.js`; la mesa es la misma que la de las partidas normales. |
| Chorrito | Un nivel de 10 colores con los mismos tubos para todos; cuenta los trasvases (estrellas contra lo que encuentra el resolvedor). | La semilla es la fecha (`chorrito-daily-AAAA-MM-DD`) y `chorrito/shared/engine.js` arma siempre el mismo nivel y comprueba que tiene solución; el resultado y la racha se guardan con `daily.js`, y la partida en curso queda guardada si se recarga. |
| Gemas | 25 jugadas con las mismas gemas para todos (las que caen salen de la fecha y de las jugadas); cuenta el puntaje y las estrellas según lo que consigue la compu con ese mismo tablero. | La semilla es la fecha (`gemas-daily-AAAA-MM-DD`) y `gemas/shared/engine.js` rehace la partida guardada si se recarga; el resultado y la racha se guardan con `daily.js`. |

El texto para compartir de cada uno es `game.it · <Juego> #N …` con cuadraditos de colores y el link; en modo práctica no se
suma nada a las estadísticas. Las listas de respuestas y de puzzles se pueden ampliar sin tocar el código (los desafíos
siguen en orden y vuelven a empezar al agotarse: `vinculos-check` informa hasta qué fecha alcanzan los puzzles cargados).

El registro se genera solo: al agregar la carpeta con `game.json`, el juego aparece en el menú, la búsqueda y las categorías.
