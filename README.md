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
- Servidor online (salas de Minigolf, Tateti, 4 en línea, Drift, Sky Hop, Clashball, Ajedrez, Ameba, Serpentina, Billar, Chispa y Mecha Corta): https://gameit-server-fy2t.onrender.com — `node server/index.js`.
  Variables: `ALLOWED_ORIGINS` (orígenes permitidos, separados por coma), `TRUST_PROXY=1`; límites ajustables en `server/index.js` (`CFG`).
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

### Paso a paso para que funcionen

1. **Dominio propio.** AdSense no aprueba subdominios de hosting (`*.onrender.com`, `*.vercel.app`…). Comprar un
   dominio y en Render → sitio estático → *Settings* → *Custom Domains* agregarlo y crear en el DNS el registro que
   indica Render. Después, en el servicio del servidor online, sumar el dominio nuevo a `ALLOWED_ORIGINS`
   (por ejemplo `https://tudominio.com,https://www.tudominio.com`), o los juegos online no van a conectar.
2. **Agregar el sitio en AdSense** (*Sitios* → *Agregar sitio*, con el dominio sin `www`). El script del `<head>`,
   la etiqueta `google-adsense-account` y `public/ads.txt` ya están publicados: elegir cualquiera de los tres métodos
   y tocar *Verificar*. Pedir la revisión; puede tardar de días a un par de semanas.
3. **Mientras tanto**: completar *Pagos* (datos fiscales y de pago; al llegar a US$10 Google envía un PIN por correo
   postal para verificar la dirección).
4. **Privacidad y mensajes** → crear el mensaje de consentimiento para Europa/Reino Unido/Suiza (obligatorio para
   mostrar anuncios allí) y, si querés, el de regulaciones de EE. UU.
5. **Apagar los anuncios automáticos**: *Anuncios* → *Por sitio* → editar el sitio → desactivar *Anuncios automáticos*
   (los superpuestos —anclados y viñetas— taparían los juegos). Los espacios ya están ubicados a mano.
6. **Crear los dos bloques** en *Anuncios* → *Por bloque de anuncios* → *Anuncios de display* (tipo adaptable):
   "game.it menú" y "game.it juegos". Copiar el número de `data-ad-slot` de cada uno en `src/ads.config.js`
   (`slots.menuBottom` y `slots.gameBreak`) y hacer push.
7. **Recompensas y pantalla completa (opcional)**: con la cuenta ya aprobada, pedir acceso a **AdSense H5 Games Ads**
   (formulario en https://adsense.google.com/start/h5-beta/). Mientras no esté aprobado, las ofertas con recompensa
   simplemente no aparecen. Para probarlas, agregar temporalmente `data-adbreak-test="on"` al script de AdSense en
   `index.html` (sacarlo al terminar). Para activar los de pantalla completa: `games.interstitials: true`.
8. **Controlar**: en *Sitios* el estado del sitio y de `ads.txt` tiene que decir "Preparado"/"Autorizado"; en
   *Informes* aparecen las impresiones al día siguiente. Nunca hacer clic en tus propios anuncios.

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

### Drift Neon

Física arcade propia en `public/games/drift/shared/car.js` (paso fijo de 1/120 s): el volante define una velocidad de
giro que el auto alcanza con inercia y el agarre gira la velocidad hacia la trompa sin crear energía. Para derrapar se
tira del freno de mano doblando (o se frena/acelera fuerte en plena curva); el acelerador sostiene el derrape, el
contravolante lo cierra y pasado cierto ángulo es trompo. Nueve pistas largas (`tracks.js`): tres con puntos de control
y seis trazadas con rectas y curvas de radio exacto (`shared/turtle.js`, que cierra el circuito solo), todas validadas
para que ningún tramo se pise con otro. La compu (`shared/ai.js`) usa la misma física: sigue una línea de carrera
calculada, frena antes de las curvas, usa freno de mano en las horquillas y nitro en las rectas (tres niveles).
Modos: carrera contra hasta 5 autos de la compu, contrarreloj contra el fantasma de tu mejor recorrido de la sesión
(con parciales), desafío de drift, 2 jugadores en pantalla dividida y online de hasta 6 (el servidor valida los
tiempos con el largo de cada pista). El fondo se dibuja en mosaicos cacheados, así solo se redibuja lo que se mueve.

El registro se genera solo: al agregar la carpeta con `game.json`, el juego aparece en el menú, la búsqueda y las categorías.
