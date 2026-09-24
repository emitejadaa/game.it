/**
 * Anuncios de Google AdSense.
 *
 * - `client`: ID de editor (el mismo que va en <head> de index.html y en public/ads.txt).
 * - `slots`: ID de cada bloque de anuncios ("data-ad-slot"). Se crean en AdSense →
 *   Anuncios → Por bloque de anuncios → Anuncios gráficos. Si un ID está vacío, ese espacio no aparece.
 * - `dismissHours`: cuánto tiempo queda oculto un anuncio cuando el visitante lo cierra.
 * - `enabled: false` apaga todos los anuncios del portal.
 *
 * Los anuncios solo se muestran en espacios muertos del menú (nunca dentro de un juego, en la
 * pantalla de carga ni encima del contenido). Para verlos sin AdSense: abrir la web con ?ads=preview.
 */
export default {
  enabled: true,
  client: 'ca-pub-6804681798545706',
  slots: {
    // banner horizontal al final del menú (320×100 en celular, 468×60 en tablet, 728×90 en computadora)
    menuBottom: '',
  },
  dismissHours: 24,
};
