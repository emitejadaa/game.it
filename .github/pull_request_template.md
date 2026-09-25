## Qué juego es

<!-- Nombre, id (la carpeta en public/games/) y en una o dos oraciones de qué se trata. -->

## Cómo se juega

<!-- Controles en computadora y en celular. Modos (solo, contra la compu, online…). -->

## Checklist

- [ ] Todo está en `public/games/<id>/` (y, si es online, en `server/games/<id>.js`).
- [ ] `game.json` completo: `id` igual a la carpeta, título y descripción en español e inglés, `platforms`, `categories`.
- [ ] El juego usa el SDK: `GameIt.ready()`, `GameIt.gameplay(true/false)` y pausa con `onPause`/`onResume`.
- [ ] Textos en español e inglés según `GameIt.prefs.lang`.
- [ ] Lo probé en computadora y en celular (vertical y/o horizontal según `platforms`), sin errores en la consola.
- [ ] No tapa la barra del portal (los 56 px de arriba) ni hace scroll.
- [ ] Código, imágenes y sonidos propios o con licencia libre (CC0/MIT, con el archivo de licencia). Sin marcas ni personajes ajenos.
- [ ] `npm run check -- <id>` y `npm run build` pasan.
- [ ] Dejé tildado "Allow edits by maintainers".

## Capturas

<!-- Opcional: una de computadora y una de celular. -->
