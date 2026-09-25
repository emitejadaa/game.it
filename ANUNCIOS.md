# Anuncios en game.it: paso a paso

Guía para dejar funcionando Google AdSense en el portal y en los juegos.
El código ya está integrado: solo falta la configuración en AdSense, en Render y pegar dos números en `src/ads.config.js`.

- ID de editor: `ca-pub-6804681798545706`
- Configuración: `src/ads.config.js`
- Vista previa sin anuncios reales: abrir la web con `?ads=preview` (por ejemplo `https://tudominio.com/?ads=preview`)

---

## 1. Qué hay y dónde aparece

| Lugar | Formato | Cuándo se muestra | Qué necesita |
| --- | --- | --- | --- |
| Menú del portal | Banner al final, a más de 150 px de las tarjetas | Siempre que se ve el menú | Bloque `slots.menuBottom` |
| Dentro de los juegos | Banner en una columna al costado, a 150 px del juego (el juego se achica y nada queda tapado). Solo en computadora | Solo en menús, pausas y fin de partida | Bloque `slots.gameBreak` |
| Dentro de los juegos | Con recompensa: "Continuar · ver anuncio" (Sky Hop, Pac-Man), "Producción ×2" (Evolución) | Solo si el jugador lo elige | Aprobación de H5 Games Ads |
| Dentro de los juegos | Pantalla completa antes de una revancha | **Apagado** | Aprobación de H5 Games Ads + `games.interstitials: true` |

Reglas que ya cumple el código:

- Todos los banners llevan la etiqueta "Publicidad" y se pueden ocultar (quedan ocultos 24 h).
- Nunca hay anuncios en la pantalla de carga, mientras se juega ni durante un partido online en curso.
- El banner de los juegos aparece 1,2 s después de pausar, como mucho uno nuevo por minuto, y se destruye al volver a jugar.
- Cada anuncio se pide una sola vez (no se refresca solo) y el espacio se cierra si Google no tiene anuncio o hay un bloqueador.
- Los banners quedan a 150 px o más del juego y de las tarjetas para jugar: es lo que [AdSense recomienda para páginas
  con juegos](https://support.google.com/adsense/answer/2768340), para evitar clics sin querer (que bajan lo que paga
  cada clic y pueden poner en riesgo la cuenta).
- En celulares y tablets no hay banners dentro de los juegos: con el dedo es fácil tocarlos sin querer. Ahí se gana con
  los formatos para juegos (con recompensa y entre partidas), que necesitan H5 Games Ads.
- El banner de los juegos elige 300×250 (o 160×600 en pantallas altas) solo si al juego le quedan al menos ~780 px de
  ancho; si no hay lugar, no aparece.

---

## 2. Dominio propio (obligatorio)

AdSense no aprueba subdominios de plataformas de hosting como `game-it-63r9.onrender.com`, `*.vercel.app` o `*.netlify.app`.

1. Comprá un dominio (Cloudflare, Namecheap, NIC Argentina para `.com.ar`, etc.).
2. En **Render** → el sitio estático de la web → **Settings** → **Custom Domains** → **Add Custom Domain**.
   Agregá `tudominio.com` y `www.tudominio.com`.
3. En el panel DNS de donde compraste el dominio, creá los registros que te muestra Render
   (un `CNAME` para `www` y un `ALIAS`/`ANAME` o `A` para el dominio principal). Render activa HTTPS solo.
4. **Importante para los juegos online:** en Render → el servicio del **servidor** (`gameit-server`) → **Environment**,
   editá `ALLOWED_ORIGINS` y agregá el dominio nuevo, separado por comas:

   ```
   https://tudominio.com,https://www.tudominio.com,https://game-it-63r9.onrender.com
   ```

   Si no, Clashball, Minigolf, Drift, Tateti, 4 en línea y Sky Hop no van a poder conectarse desde el dominio nuevo.
5. Abrí `https://tudominio.com/ads.txt`: tiene que mostrar
   `google.com, pub-6804681798545706, DIRECT, f08c47fec0942fa0`.

---

## 3. Agregar el sitio en AdSense

1. Entrá a https://adsense.google.com con la cuenta del ID `ca-pub-6804681798545706`.
2. **Sitios** → **Agregar sitio** → escribí `tudominio.com` (sin `https://` ni `www`).
3. Para verificar que es tuyo, cualquiera de los tres métodos ya está publicado en la web:
   - **Fragmento de código de AdSense**: ya está en el `<head>` de `index.html`.
   - **Fragmento de ads.txt**: ya está en `public/ads.txt`.
   - **Metaetiqueta**: ya está (`<meta name="google-adsense-account" …>`).
   Elegí uno y tocá **Verificar**.
4. Tocá **Solicitar revisión**. Google revisa el sitio: puede tardar desde unos días hasta un par de semanas.
   Mientras tanto la web tiene que estar online y con los juegos funcionando.

---

## 4. Pagos

En **Pagos** → **Administrar la configuración**:

1. Completá la información fiscal y los datos de la forma de pago.
2. Cuando las ganancias lleguen a US$10, Google manda un **PIN por correo postal** a tu dirección.
   Hay que ingresarlo en AdSense para seguir cobrando.
3. El pago se hace cuando se supera el umbral (US$100 o su equivalente en tu moneda).

---

## 5. Consentimiento y política de privacidad

**Política de privacidad (obligatoria para AdSense):** ya está publicada en `public/privacidad.html` (se abre en
`https://tudominio.com/privacidad.html` y está enlazada desde el pie del menú). Incluye lo que AdSense pide explicar
sobre las cookies de publicidad de Google. Antes de pedir la revisión:

- Leela y ajustala si hace falta (no reemplaza el consejo de un abogado).
- Agregá un correo de contacto del dominio (por ejemplo `contacto@tudominio.com`) donde dice "Contacto".

**Mensaje de consentimiento:**

En **Privacidad y mensajes**:

1. **RGPD (Europa, Reino Unido y Suiza)** → **Crear mensaje** → elegí el sitio, el idioma y publicalo.
   Sin este mensaje, no se muestran anuncios a visitantes de esos países.
2. Opcional: **Regulaciones de estados de EE. UU.** → crear el mensaje.

No hace falta tocar el código: el script de AdSense muestra estos mensajes solo.

---

## 6. Apagar los anuncios automáticos

**Anuncios** → **Por sitio** → lápiz de tu sitio:

1. Desactivá **Anuncios automáticos** (sobre todo los formatos superpuestos: **anclados** y **viñetas**, que taparían los juegos).
2. **Aplicar al sitio**.

Los espacios ya están ubicados a mano en lugares que no molestan; los automáticos pondrían anuncios donde no corresponde.

---

## 7. Crear los dos bloques de anuncios

Cuando el sitio esté **aprobado**:

1. **Anuncios** → **Por bloque de anuncios** → **Anuncios de display**.
2. Primer bloque: nombre `game.it menú`, tipo **Adaptable** → **Crear**.
3. En el código que muestra, copiá solo el número de `data-ad-slot="…"` (por ejemplo `1234567890`).
4. Repetí con un segundo bloque: `game.it juegos`.
5. Pegá los números en `src/ads.config.js`:

   ```js
   slots: {
     menuBottom: '1234567890', // bloque "game.it menú"
     gameBreak: '0987654321',  // bloque "game.it juegos"
   },
   ```

6. Hacé commit y push a `main`. Render publica solo en unos minutos.

Los primeros anuncios pueden tardar hasta una hora en aparecer; mientras tanto los espacios se cierran solos.

---

## 8. Recompensas y pantalla completa (opcional)

Estos formatos usan **AdSense H5 Games Ads**, un programa aparte que hay que pedir con la cuenta ya aprobada.

1. Completá el formulario: https://adsense.google.com/start/h5-beta/ (la aprobación no está garantizada).
2. Hasta que lo aprueben, las ofertas con recompensa simplemente no aparecen en los juegos: no hay que cambiar nada.
3. **Probarlo antes de publicar:** en `index.html`, agregá `data-adbreak-test="on"` al script de AdSense:

   ```html
   <script async data-adbreak-test="on" data-ad-client="ca-pub-6804681798545706" …></script>
   ```

   Muestra anuncios de prueba. **Sacalo antes de publicar.**
4. Si querés también anuncios de pantalla completa antes de las revanchas, en `src/ads.config.js`:

   ```js
   games: { interstitials: true, interstitialGapSec: 240, firstInterstitialSec: 180 },
   ```

   Nunca salen en los primeros 3 minutos y como mucho uno cada 4 minutos. Interrumpen al jugador: por eso vienen apagados.

---

## 9. Comprobar que funciona

1. En **Sitios**: el estado del sitio tiene que decir **Preparado** y el de `ads.txt`, **Autorizado**.
2. Abrí la web en una ventana normal (sin bloqueador de anuncios): el banner del menú aparece al final.
   Abrí un juego en computadora (por ejemplo Clashball): en el menú del juego aparece la columna al costado; al empezar a
   jugar desaparece.
3. En **Informes** vas a ver impresiones y ganancias desde el día siguiente.

---

## 10. Ajustes en `src/ads.config.js`

| Opción | Qué hace | Valor actual |
| --- | --- | --- |
| `enabled` | Apaga o prende todos los anuncios | `true` |
| `slots.menuBottom` | Bloque del banner del menú (vacío = no aparece) | `''` |
| `slots.gameBreak` | Bloque del banner de los juegos (vacío = no aparece) | `''` |
| `dismissHours` | Horas que queda oculto un banner cuando se cierra | `24` |
| `games.banners` | Banner en pausas y menús de los juegos | `true` |
| `games.bannerGapSec` | Segundos mínimos entre banners nuevos en los juegos | `60` |
| `games.bannerDelayMs` | Espera antes de mostrarlo al pausar | `1200` |
| `games.rewarded` | Ofertas con recompensa (requiere H5 Games Ads) | `true` |
| `games.interstitials` | Pantalla completa antes de revanchas | `false` |

---

## 11. Si algo no funciona

| Problema | Qué revisar |
| --- | --- |
| No aparece ningún anuncio | ¿El sitio está aprobado? ¿Pegaste los `data-ad-slot`? ¿Tenés un bloqueador activo? Los anuncios nuevos pueden tardar hasta una hora. |
| AdSense dice "ads.txt no encontrado" | Abrí `https://tudominio.com/ads.txt`. Si da error, revisá que el deploy de Render haya terminado. |
| Los juegos online no conectan en el dominio nuevo | Falta agregarlo en `ALLOWED_ORIGINS` del servidor (paso 2.4). |
| Aparecen anuncios encima de los juegos | Están prendidos los anuncios automáticos: apagarlos (paso 6). |
| No aparecen las ofertas "Continuar · ver anuncio" | H5 Games Ads todavía no está aprobado, o Google no tiene un anuncio con recompensa para ese momento. |
| Querés ver dónde va cada anuncio | Abrí la web con `?ads=preview`. |

---

## 12. Reglas de AdSense para no perder la cuenta

- **Nunca hagas clic en tus propios anuncios** ni le pidas a nadie que lo haga.
- No muevas los banners cerca de los botones de los juegos ni dentro del área de juego.
- No ofrezcas premios por hacer clic en un anuncio (las recompensas son por *mirarlo*, que es lo permitido).
- Las únicas etiquetas permitidas son "Publicidad"/"Anuncios" (ya están puestas).

Fuentes:
[Políticas de ubicación de anuncios](https://support.google.com/adsense/answer/1346295) ·
[Anuncios en páginas con juegos](https://support.google.com/adsense/answer/2768340) ·
[H5 Games Ads](https://support.google.com/adsense/answer/9959170) ·
[Ad Placement API](https://developers.google.com/ad-placement/docs/example)
