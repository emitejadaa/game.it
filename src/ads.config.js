/**
 * Anuncios de Google AdSense.
 *
 * - `client`: ID de editor (el mismo que va en <head> de index.html y en public/ads.txt).
 * - `slots`: ID de cada bloque de anuncios ("data-ad-slot"). Se crean en AdSense →
 *   Anuncios → Por bloque de anuncios → Anuncios gráficos. Si un ID está vacío, ese espacio no aparece.
 * - `dismissHours`: cuánto tiempo queda oculto un anuncio cuando el visitante lo cierra.
 * - `enabled: false` apaga todos los anuncios del portal y de los juegos.
 *
 * En el menú: un banner en la zona muerta del final. En los juegos (ver `games`): solo en pausas,
 * menús y fin de partida, en una franja propia (el juego se achica, nada queda tapado); nunca
 * mientras se juega. Para ver todo sin AdSense: abrir la web con ?ads=preview.
 */
export default {
  enabled: true,
  client: 'ca-pub-6804681798545706',
  slots: {
    // banner horizontal al final del menú (320×100 en celular, 468×60 en tablet, 728×90 en computadora)
    menuBottom: '',
    // banner dentro de los juegos, en la franja de abajo durante pausas y menús (320×50 / 468×60 / 728×90)
    gameBreak: '',
  },
  dismissHours: 24,
  games: {
    // banner en pausas, menús y fin de partida
    banners: true,
    bannerGapSec: 60, // como mucho un anuncio nuevo por minuto
    bannerDelayMs: 1200, // las pausas cortas no muestran nada
    // anuncios con recompensa: solo si el jugador elige verlos (requiere AdSense H5 Games Ads)
    rewarded: true,
    // pantalla completa entre partidas (requiere H5 Games Ads). Apagado: interrumpe al jugador.
    interstitials: false,
    interstitialGapSec: 240,
    firstInterstitialSec: 180,
  },
};
