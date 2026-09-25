# Plantilla de juego

Un juego mínimo pero completo ("Atrapá estrellas") con todo lo que el portal necesita. Para empezar el tuyo:

```bash
cp -r templates/juego-base public/games/<tu-id>
```

Después, en `public/games/<tu-id>/`:

1. `game.json`: cambiá `"id"` (igual que la carpeta), título, descripción, categorías, `platforms` y `input`.
2. `game.js`: cambiá `const ID = 'mi-juego'` por tu id y reemplazá la lógica del juego.
3. `thumb.svg`: la miniatura del menú (proporción 16:10, por ejemplo 320×200).
4. Probalo con `npm run dev` en `http://localhost:5173/#play/<tu-id>` y revisalo con `npm run check -- <tu-id>`.

La guía completa está en [`docs/INTEGRAR-UN-JUEGO.md`](../../docs/INTEGRAR-UN-JUEGO.md).
