/* Trotamundos — visor de Street View (iframe del embed de Google) con el truco de la tarjeta.
 *
 * API pública (la usan game.js y el cliente online):
 *   const visor = new Visor(host, { key, lang, titulo, textoCargando })
 *       host: elemento con position (relative/absolute/fixed) y tamaño; el visor lo llena. `key` por defecto es EMBED_KEY de config.js.
 *   visor.mostrar({ lat, lng, heading, frozen, lang })   carga la panorámica más cercana a ese punto (un iframe nuevo cada vez)
 *   visor.reiniciar()                                    "volver al inicio": recarga el iframe con la misma URL
 *   visor.congelar(bool)                                 iframe `inert` + velo encima: no se puede mover, girar ni hacer zoom
 *   visor.ocultar()                                      saca el iframe (así la ubicación no queda a la vista entre rondas)
 *   visor.destruir()                                     ocultar() + quitar todo del DOM
 *   visor.on('carga', fn) → función para desuscribir     fn({ url, reinicio }) cuando el iframe terminó de cargar
 *   visor.url, visor.iframe, visor.cargado, visor.visible, visor.congelado   (solo lectura)
 *
 * El truco de la tarjeta: el visor de Google muestra arriba a la izquierda una tarjeta con el nombre del lugar (de ~150×56
 * hasta ~80 px de alto). El contenedor tiene overflow hidden y el iframe va corrido hacia arriba MARGEN_TARJETA px y más alto
 * (calc(100% + 120px)): la tarjeta queda fuera de la vista y el borde de abajo del iframe coincide con el del contenedor.
 * Abajo del visor Google dibuja su logo y la barra "Condiciones / Informar un problema" (BANDA_ABAJO px): es atribución
 * obligatoria, así que NADA nuestro se dibuja ahí (el velo del congelado también termina BANDA_ABAJO px antes del borde).
 */
import { embedUrl } from './shared/geo.js';
import { EMBED_KEY } from './config.js';

export const MARGEN_TARJETA = 120; // px que se corre el iframe hacia arriba (la tarjeta mide ≤ ~80)
export const BANDA_ABAJO = 28; // px de atribución de Google que no se tocan

const css = (el, estilos) => Object.assign(el.style, estilos);

export class Visor {
  constructor(host, { key = EMBED_KEY, lang = 'es', titulo = 'Street View', textoCargando = '' } = {}) {
    this.host = host;
    this.key = key;
    this.lang = lang;
    this.titulo = titulo;
    this._ultimo = null;
    this._iframe = null;
    this._cargado = false;
    this._congelado = false;
    this._subs = new Set();

    // Contenedor: recorta lo que sobra del iframe (la tarjeta de arriba).
    const raiz = document.createElement('div');
    raiz.className = 'tm-visor';
    css(raiz, { position: 'absolute', inset: '0', overflow: 'hidden', background: '#0b0d12' });
    raiz.hidden = true;

    // Espera mientras carga (queda detrás del iframe y lejos de la banda de abajo).
    const espera = document.createElement('div');
    espera.className = 'tm-visor__espera';
    css(espera, { position: 'absolute', left: '0', right: '0', top: '0', bottom: `${BANDA_ABAJO}px`, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: '12px', color: '#9aa3b5', font: '600 14px system-ui, sans-serif', textAlign: 'center', pointerEvents: 'none' });
    const rueda = document.createElement('span');
    rueda.className = 'tm-visor__rueda';
    const msg = document.createElement('span');
    msg.textContent = textoCargando;
    espera.append(rueda, msg);

    // Velo del modo Congelado: impide tocar el visor, pero termina antes de la atribución de Google.
    const velo = document.createElement('div');
    velo.className = 'tm-visor__velo';
    css(velo, { position: 'absolute', left: '0', right: '0', top: '0', bottom: `${BANDA_ABAJO}px`, zIndex: '2', display: 'none', touchAction: 'none', cursor: 'not-allowed' });
    velo.addEventListener('pointerdown', (e) => e.preventDefault());
    velo.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    raiz.append(espera, velo);
    host.append(raiz);
    this.raiz = raiz;
    this._espera = espera;
    this._msg = msg;
    this._velo = velo;
  }

  get iframe() {
    return this._iframe;
  }

  get url() {
    return this._iframe?.src || '';
  }

  get cargado() {
    return this._cargado;
  }

  get visible() {
    return !this.raiz.hidden;
  }

  get congelado() {
    return this._congelado;
  }

  /** Suscribe a un evento ('carga'). Devuelve la función para desuscribir. */
  on(evento, fn) {
    const sub = { evento, fn };
    this._subs.add(sub);
    return () => this._subs.delete(sub);
  }

  _emitir(evento, datos) {
    for (const s of [...this._subs]) if (s.evento === evento) s.fn(datos);
  }

  /** Carga la panorámica más cercana a (lat, lng). `frozen` = Congelado. */
  mostrar({ lat, lng, heading = 0, frozen = false, lang }) {
    this._ultimo = { lat, lng, heading };
    if (lang) this.lang = lang;
    this._congelado = !!frozen;
    this._montar(false);
  }

  /** "Volver al inicio": vuelve a cargar la misma URL (la vista, el rumbo y el zoom de arranque). */
  reiniciar() {
    if (this._ultimo) this._montar(true);
  }

  _montar(reinicio) {
    this._quitarIframe();
    const url = embedUrl({ ...this._ultimo, lang: this.lang, key: this.key });
    const f = document.createElement('iframe');
    f.className = 'tm-visor__iframe';
    f.title = this.titulo;
    f.setAttribute('allow', 'accelerometer; gyroscope');
    css(f, { position: 'absolute', left: '0', top: `-${MARGEN_TARJETA}px`, width: '100%', height: `calc(100% + ${MARGEN_TARJETA}px)`, border: '0', display: 'block', background: '#0b0d12' });
    f.addEventListener(
      'load',
      () => {
        if (this._iframe !== f) return;
        this._cargado = true;
        this.raiz.dataset.estado = 'listo';
        this._emitir('carga', { url, reinicio });
      },
      { once: true },
    );
    this._cargado = false;
    this._iframe = f;
    this.raiz.dataset.estado = 'cargando';
    this.raiz.hidden = false;
    this._aplicarCongelado();
    f.src = url;
    this.raiz.insertBefore(f, this._velo);
  }

  /** Congela o descongela (iframe `inert` + velo). Sirve también con el visor ya cargado. */
  congelar(si) {
    this._congelado = !!si;
    this._aplicarCongelado();
  }

  _aplicarCongelado() {
    const si = this._congelado;
    this._velo.style.display = si ? 'block' : 'none';
    this.raiz.dataset.congelado = si ? '1' : '0';
    const f = this._iframe;
    if (!f) return;
    f.inert = si;
    if (si) {
      f.setAttribute('inert', '');
      f.tabIndex = -1;
    } else {
      f.removeAttribute('inert');
      f.removeAttribute('tabindex');
    }
  }

  _quitarIframe() {
    const f = this._iframe;
    this._iframe = null;
    this._cargado = false;
    if (f) {
      f.src = 'about:blank'; // corta la carga y libera la memoria de la panorámica
      f.remove();
    }
  }

  ocultar() {
    this._quitarIframe();
    this.raiz.hidden = true;
    this.raiz.dataset.estado = 'oculto';
  }

  destruir() {
    this.ocultar();
    this._subs.clear();
    this.raiz.remove();
  }
}
