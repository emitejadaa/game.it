/* Trotamundos — cliente online.
 *
 * STUB por ahora: avisa que el modo online llega pronto y vuelve al menú. Otro desarrollo lo reemplaza.
 * game.js lo carga con import() dinámico y le pasa `ctx` (textos, helpers de pantallas, fábricas de Visor y Mapa…):
 * ver el comentario del principio de game.js para la lista completa.
 */
export async function abrirOnline(ctx) {
  await ctx.mensaje(ctx.t('onlineTitulo'), ctx.t('onlineProximamente'));
  ctx.volverAlMenu();
}
