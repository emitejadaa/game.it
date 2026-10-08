/* Trotamundos — mapa de marcar, pistas y resultados (MapLibre GL JS + estilo vectorial de OpenFreeMap).
 *
 * API pública (la usan game.js y el cliente online). Requiere /vendor/maplibre-gl.js (window.maplibregl) y su .css.
 *   const mapa = new Mapa(host, { tema, reducido, textos, estilo })
 *       host: elemento con tamaño; el mapa lo llena y se redimensiona solo (ResizeObserver).
 *       tema: 'dark' | 'light'.  reducido: () => bool (¿"reducir movimiento"?, sin animaciones si da true).
 *       textos: { error, reintentar, etiqueta, centro } para los mensajes (por defecto en español).
 *   mapa.listo                       Promise<boolean>: true si el mapa cargó (false: se mostró el aviso con "Reintentar").
 *   mapa.on(evento, fn) → off        eventos: 'pin' ({ lat, lng } | null), 'error' (motivo), 'listo'.
 *   mapa.permitirPin(bool)           activa que un clic o toque ponga el pin (se puede arrastrar y volver a tocar antes de confirmar).
 *   mapa.pin                         { lat, lng } o null.   mapa.ponerPin(lat, lng) · mapa.ponerPinEnCentro() · mapa.limpiarPin()
 *   mapa.mostrarPista({ lat, lng, radiusKm }, { nivel, ajustar })   dibuja el círculo (circleRing) y por defecto encuadra; mapa.limpiarPistas()
 *   mapa.revelar({ real, adivinanzas: [{ lat, lng, color, etiqueta }], etiquetaReal, padding, animar })
 *       muestra el lugar real, los pines de cada uno y una línea de cada pin al lugar real; encuadra con animación corta.
 *   mapa.resumen([{ real: { lat, lng }, guess: { lat, lng } | null }], { padding })   todas las rondas con números.
 *   mapa.limpiarRevelacion() · mapa.encuadrar(limites | null, { animar }) (null = el mundo) · mapa.vistaMundo(animar)
 *   mapa.redimensionar() · mapa.cambiarTema('dark' | 'light') · mapa.mostrarAtribucion(bool) · mapa.proyectar(lat, lng) → { x, y } en px del mapa
 *   mapa.reintentar() · mapa.destruir()
 *   mapa.map                          la instancia de maplibregl.Map (para casos especiales; null si no cargó).
 * Atribución de OpenFreeMap / OpenMapTiles / OpenStreetMap: control compacto de MapLibre, siempre dentro del mapa.
 */
import { circleRing, distanceKm, bearingDeg, destinationPoint } from './shared/geo.js';
import { ESTILO_MAPA } from './config.js';

const VERDE = '#12b76a'; // lugar real
const MAGENTA = '#ff2bd6'; // pin por defecto
const AMBAR = '#ffb800'; // pistas
const MUNDO = [
  [-175, -56],
  [178, 78],
];

// ---------------------------------------------------------------- geografía de dibujo (puro, se prueba en Node)
/** Longitud `lng` llevada al equivalente más cercano a `ref` (continua, sin saltos de 360°). */
export function desenvolver(lng, ref) {
  return ref + ((((lng - ref + 540) % 360) + 360) % 360) - 180;
}

/** Arco de círculo máximo de A a B como [[lng, lat]…], con longitudes continuas (sirve para cruzar el antimeridiano). */
export function arco(lat1, lng1, lat2, lng2, pasos = 48) {
  const km = distanceKm(lat1, lng1, lat2, lng2);
  const fin = [desenvolver(lng2, lng1), lat2];
  if (km < 0.05) return [[lng1, lat1], fin];
  const b = bearingDeg(lat1, lng1, lat2, lng2);
  const out = [[lng1, lat1]];
  let prev = lng1;
  for (let i = 1; i < pasos; i++) {
    const p = destinationPoint(lat1, lng1, b, (km * i) / pasos);
    prev = desenvolver(p.lng, prev);
    out.push([prev, p.lat]);
  }
  out.push([desenvolver(lng2, prev), lat2]);
  return out;
}

/** Anillo de un círculo geodésico con longitudes continuas (no se parte en el antimeridiano). */
export function anillo(lat, lng, radiusKm, pasos = 64) {
  let prev = lng;
  return circleRing(lat, lng, radiusKm, pasos).map(([x, y]) => {
    prev = desenvolver(x, prev);
    return [prev, y];
  });
}

// ---------------------------------------------------------------- colores del tema (puro, se prueba en Node)
/** Interpreta rgb()/rgba()/hsl()/hsla()/#hex y devuelve { h, s, l, a } (h 0-360, s y l 0-1) o null. */
export function parsearColor(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim().toLowerCase();
  let r;
  let g;
  let b;
  let a = 1;
  let m;
  if ((m = s.match(/^#([0-9a-f]{3})$/))) {
    [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16));
  } else if ((m = s.match(/^#([0-9a-f]{6})$/))) {
    [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  } else if ((m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/))) {
    [r, g, b] = [+m[1], +m[2], +m[3]];
    if (m[4] != null) a = +m[4];
  } else if ((m = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/))) {
    return { h: +m[1], s: +m[2] / 100, l: +m[3] / 100, a: m[4] != null ? +m[4] : 1 };
  } else return null;
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let sat = 0;
  if (d) {
    sat = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: sat, l, a };
}

const hsla = (h, s, l, a = 1) => `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${+a.toFixed(3)})`;
const acotar = (x, a, b) => Math.min(b, Math.max(a, x));

/** Color de una capa del estilo claro llevado al tema oscuro (mantiene el orden de claridades: el mar queda más oscuro que la tierra). */
export function colorOscuro(color, prop, capa) {
  const c = parsearColor(color);
  if (!c) return color;
  const id = capa?.id || '';
  if (id === 'background') return hsla(228, 0.2, 0.16);
  if (id === 'water') return hsla(222, 0.42, 0.075);
  if (id === 'waterway') return hsla(218, 0.35, 0.13, c.a);
  if (id.startsWith('boundary')) return hsla(225, 0.22, 0.56, c.a);
  if (prop === 'text-halo-color') return hsla(228, 0.25, 0.09, Math.min(0.9, c.a + 0.15));
  if (prop === 'text-color') return hsla(c.h, Math.min(c.s, 0.35), acotar(1 - c.l, 0.66, 0.95), c.a);
  if (prop === 'line-color') return hsla(c.h, c.s * 0.4, acotar(0.2 + (c.l - 0.6) * 0.3, 0.2, 0.34), c.a);
  // rellenos: parques, edificios, bosques, hielo…
  return hsla(c.h, c.s * 0.5, 0.12 + (1 - c.l) * 0.9 + 0.04, c.a);
}

/** Retoques del estilo claro: mar con un toque azul y fronteras más marcadas. */
export function colorClaro(color, prop, capa) {
  const id = capa?.id || '';
  if (id === 'water') return 'rgb(184, 203, 218)';
  if (id === 'waterway') return 'rgb(184, 203, 218)';
  if (id === 'boundary_2') return 'hsl(0, 0%, 50%)';
  return color;
}

function mapear(v, fn) {
  if (typeof v === 'string') return parsearColor(v) ? fn(v) : v;
  if (Array.isArray(v)) return v.map((x) => mapear(x, fn));
  return v;
}

/** Copia del estilo (JSON de OpenFreeMap) con los colores del tema pedido. */
export function adaptarEstilo(base, tema) {
  const est = JSON.parse(JSON.stringify(base));
  const f = tema === 'dark' ? colorOscuro : colorClaro;
  for (const capa of est.layers || []) {
    if (!capa.paint) continue;
    for (const k of Object.keys(capa.paint)) if (/-color$/.test(k)) capa.paint[k] = mapear(capa.paint[k], (c) => f(c, k, capa));
  }
  return est;
}

// ---------------------------------------------------------------- encuadre (puro, se prueba en Node)
const TILE = 512; // tamaño del mundo en px con zoom 0 (MapLibre)
const mercY = (lat) => {
  const f = Math.sin((acotar(lat, -85, 85) * Math.PI) / 180);
  return 0.5 - Math.log((1 + f) / (1 - f)) / (4 * Math.PI);
};
/** Puntos de un arco para el encuadre: sin irse a los polos (las rutas largas se curvan mucho y alejarían el zoom). */
const delArco = ([x, y]) => [x, acotar(y, -72, 72)];
const mercLat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/**
 * Cámara que muestra todos los puntos [lng, lat] dentro de un mapa de `ancho` × `alto` px con ese relleno.
 * A diferencia de fitBounds, acepta longitudes continuas que pasan de una vuelta (arcos que cruzan el antimeridiano).
 * Devuelve { center: [lng, lat], zoom, offset: [dx, dy] } para map.easeTo().
 */
export function camaraPara(puntos, { ancho, alto, relleno = { top: 0, bottom: 0, left: 0, right: 0 }, maxZoom = 12, minZoom = -1 }) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of puntos) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  const libreX = Math.max(40, ancho - relleno.left - relleno.right);
  const libreY = Math.max(40, alto - relleno.top - relleno.bottom);
  const spanX = (e - w) / 360;
  const spanY = mercY(s) - mercY(n);
  const zx = spanX > 1e-9 ? Math.log2(libreX / (spanX * TILE)) : Infinity;
  const zy = spanY > 1e-9 ? Math.log2(libreY / (spanY * TILE)) : Infinity;
  const zoom = acotar(Math.min(zx, zy, maxZoom), minZoom, maxZoom);
  return {
    center: [(w + e) / 2, mercLat((mercY(s) + mercY(n)) / 2)],
    zoom,
    offset: [(relleno.left - relleno.right) / 2, (relleno.top - relleno.bottom) / 2],
  };
}

// ---------------------------------------------------------------- estilo (se pide una sola vez por página)
let promesaEstilo = null;
function pedirEstilo(url) {
  if (!promesaEstilo || promesaEstilo.url !== url) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    p.url = url;
    p.catch(() => {
      if (promesaEstilo === p) promesaEstilo = null; // la próxima vez se vuelve a pedir
    });
    promesaEstilo = p;
  }
  return promesaEstilo;
}

// ---------------------------------------------------------------- marcas (DOM, sin HTML de afuera)
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...hijos) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  e.append(...hijos);
  return e;
}

/** Elemento de un pin (gota) con un número o un punto adentro y una etiqueta opcional (todo con textContent). */
function elementoMarca({ color, tipo = 'guess', numero, etiqueta }) {
  const el = document.createElement('div');
  el.className = `tm-marca tm-marca--${tipo}`;
  const gota = svg(
    'svg',
    { viewBox: '0 0 28 36', width: tipo === 'real' ? '30' : '28', height: tipo === 'real' ? '39' : '36', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M14 35S3 21.5 3 13a11 11 0 1 1 22 0c0 8.500-11 22-11 22Z', fill: color, stroke: '#fff', 'stroke-width': '2', 'stroke-linejoin': 'round' }),
    svg('circle', { cx: '14', cy: '13', r: numero != null ? '7.5' : '4.5', fill: '#fff' }),
  );
  if (numero != null) {
    const t = svg('text', { x: '14', y: '16.6', 'text-anchor': 'middle', 'font-size': '10', 'font-weight': '800', fill: color, 'font-family': 'system-ui, sans-serif' });
    t.textContent = String(numero);
    gota.append(t);
  }
  el.append(gota);
  if (etiqueta) {
    const s = document.createElement('span');
    s.className = 'tm-marca__et';
    s.textContent = etiqueta;
    el.append(s);
  }
  return el;
}

const vacio = () => ({ type: 'FeatureCollection', features: [] });
const ML = () => window.maplibregl;

export class Mapa {
  constructor(host, { tema = 'dark', reducido = () => false, textos = {}, estilo = ESTILO_MAPA } = {}) {
    this.host = host;
    this.tema = tema === 'light' ? 'light' : 'dark';
    this.reducido = reducido;
    this.textos = { error: 'No se pudo cargar el mapa.', reintentar: 'Reintentar', etiqueta: 'Mapa para marcar dónde estás', centro: 'Poner el pin en el centro', ...textos };
    this.estilo = estilo;
    this.map = null;
    this._subs = new Set();
    this._permitido = false;
    this._pin = null;
    this._marcas = [];
    this._pistas = new Map(); // nivel → feature
    this._lineas = [];
    this._base = null;
    this._destruido = false;
    this._okTiles = 0;
    this._errTiles = 0;
    this._atrib = false;

    const raiz = document.createElement('div');
    raiz.className = 'tm-mapa';
    raiz.dataset.tema = this.tema;
    Object.assign(raiz.style, { position: 'absolute', inset: '0', overflow: 'hidden' });
    const lienzo = document.createElement('div');
    lienzo.className = 'tm-mapa__lienzo';
    Object.assign(lienzo.style, { position: 'absolute', inset: '0' });
    lienzo.setAttribute('aria-label', this.textos.etiqueta);
    const aviso = document.createElement('div');
    aviso.className = 'tm-mapa__aviso';
    aviso.hidden = true;
    aviso.setAttribute('role', 'alert');
    const msg = document.createElement('p');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = this.textos.reintentar;
    btn.addEventListener('click', () => this.reintentar());
    aviso.append(msg, btn);
    raiz.append(lienzo, aviso);
    host.append(raiz);
    this.raiz = raiz;
    this._lienzo = lienzo;
    this._aviso = aviso;
    this._avisoMsg = msg;
    this._avisoBtn = btn;

    this._ro = new ResizeObserver(() => {
      cancelAnimationFrame(this._rf);
      this._rf = requestAnimationFrame(() => this.map?.resize());
    });
    this._ro.observe(raiz);
    this.listo = this._crear();
  }

  on(evento, fn) {
    const s = { evento, fn };
    this._subs.add(s);
    return () => this._subs.delete(s);
  }

  _emitir(evento, datos) {
    for (const s of [...this._subs]) if (s.evento === evento) s.fn(datos);
  }

  /** Cambia los textos del aviso de error y de la etiqueta del mapa (por ejemplo al cambiar de idioma). */
  ponerTextos(textos) {
    Object.assign(this.textos, textos);
    this._avisoBtn.textContent = this.textos.reintentar;
    this._lienzo.setAttribute('aria-label', this.textos.etiqueta);
    if (!this._aviso.hidden) this._avisoMsg.textContent = this.textos.error;
  }

  // ------------------------------------------------------------ creación y errores
  async _crear() {
    this._ocultarAviso();
    if (!ML()) return this._fallar('libreria');
    try {
      this._base = await pedirEstilo(this.estilo);
    } catch {
      return this._fallar('estilo');
    }
    if (this._destruido) return false;
    const m = new (ML().Map)({
      container: this._lienzo,
      style: adaptarEstilo(this._base, this.tema),
      center: [-20, 25],
      zoom: 0,
      minZoom: -1,
      maxZoom: 17,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      doubleClickZoom: false,
      touchPitch: false,
      fadeDuration: this.reducido() ? 0 : 200,
    });
    this.map = m;
    m.touchZoomRotate.disableRotation();
    m.addControl(new (ML().AttributionControl)({ compact: true }), 'bottom-right');
    this.mostrarAtribucion(this._atrib); // el control nace abierto: lo dejamos como pidió el juego (cerrado durante la ronda)
    m.addControl(new (ML().NavigationControl)({ showCompass: false, visualizePitch: false }), 'top-right');
    m.on('click', (e) => this._clic(e));
    m.on('error', (e) => this._falloTiles(e));
    m.on('sourcedata', () => {
      // el control de atribución se arma cuando llegan los datos de las fuentes: recién ahí lo dejamos como se pidió
      if (!this._atribOk && this.raiz.querySelector('details.maplibregl-ctrl-attrib.maplibregl-compact')) {
        this._atribOk = true;
        this.mostrarAtribucion(this._atrib);
      }
    });
    m.on('data', (e) => {
      if (e.dataType === 'source' && e.tile) {
        this._okTiles++;
        if (!this._aviso.hidden && this._okTiles > 0) this._ocultarAviso();
      }
    });
    return new Promise((resolve) => {
      let hecho = false;
      m.on('style.load', () => {
        this._capas();
        if (hecho) return;
        hecho = true;
        this.vistaMundo(false);
        this._emitir('listo');
        resolve(true);
        // si a los 12 s no llegó ni un tile, avisamos (el juego no se rompe: se puede reintentar)
        setTimeout(() => {
          if (!this._destruido && this._okTiles === 0) this._mostrarAviso();
        }, 12000);
      });
    });
  }

  _fallar(motivo) {
    this._mostrarAviso();
    this._emitir('error', motivo);
    return false;
  }

  _mostrarAviso() {
    this._avisoMsg.textContent = this.textos.error;
    this._aviso.hidden = false;
  }

  _ocultarAviso() {
    this._aviso.hidden = true;
  }

  _falloTiles(e) {
    if (e?.sourceId === 'openmaptiles' || e?.tile) {
      this._errTiles++;
      if (this._okTiles === 0 && this._errTiles >= 3) this._mostrarAviso();
    }
  }

  /** Vuelve a pedir el estilo y los tiles. Si el mapa nunca cargó, lo crea de nuevo. */
  reintentar() {
    this._ocultarAviso();
    this._okTiles = 0;
    this._errTiles = 0;
    if (!this.map) {
      this.listo = this._crear();
      return this.listo;
    }
    this.map.setStyle(adaptarEstilo(this._base, this.tema)); // 'style.load' vuelve a poner nuestras capas
    return this.listo;
  }

  // ------------------------------------------------------------ capas propias (pistas y líneas)
  _capas() {
    const m = this.map;
    if (!m || m.getSource('tm-pistas')) return;
    m.addSource('tm-pistas', { type: 'geojson', data: { type: 'FeatureCollection', features: [...this._pistas.values()] } });
    m.addLayer({ id: 'tm-pistas-relleno', type: 'fill', source: 'tm-pistas', paint: { 'fill-color': AMBAR, 'fill-opacity': ['case', ['==', ['get', 'actual'], 1], 0.2, 0.07] } });
    m.addLayer({ id: 'tm-pistas-borde', type: 'line', source: 'tm-pistas', paint: { 'line-color': AMBAR, 'line-width': ['case', ['==', ['get', 'actual'], 1], 3, 1.5], 'line-opacity': 0.95 } });
    m.addSource('tm-lineas', { type: 'geojson', data: { type: 'FeatureCollection', features: this._lineas } });
    m.addLayer({
      id: 'tm-lineas',
      type: 'line',
      source: 'tm-lineas',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': ['coalesce', ['get', 'color'], MAGENTA], 'line-width': 3, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.95 },
    });
  }

  _datos(fuente, features) {
    this.map?.getSource(fuente)?.setData({ type: 'FeatureCollection', features });
  }

  // ------------------------------------------------------------ pin
  permitirPin(si) {
    this._permitido = !!si;
    this._pin?.setDraggable(this._permitido);
    this.raiz.dataset.pin = this._permitido ? '1' : '0';
  }

  get pin() {
    if (!this._pin) return null;
    const p = this._pin.getLngLat().wrap();
    return { lat: p.lat, lng: p.lng };
  }

  _clic(e) {
    if (!this._permitido) return;
    if (e.originalEvent?.target?.closest?.('.tm-marca')) return;
    const p = e.lngLat.wrap();
    this.ponerPin(p.lat, p.lng);
  }

  ponerPin(lat, lng) {
    if (!this.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!this._pin) {
      const el = elementoMarca({ color: MAGENTA, tipo: 'pin' });
      el.classList.add('tm-cae');
      this._pin = new (ML().Marker)({ element: el, anchor: 'bottom', draggable: this._permitido }).setLngLat([lng, lat]).addTo(this.map);
      this._pin.on('dragend', () => this._emitir('pin', this.pin));
    } else this._pin.setLngLat([lng, lat]);
    this._emitir('pin', this.pin);
  }

  ponerPinEnCentro() {
    if (!this.map || !this._permitido) return;
    const c = this.map.getCenter().wrap();
    this.ponerPin(c.lat, c.lng);
  }

  _quitarPin() {
    this._pin?.remove();
    this._pin = null;
  }

  limpiarPin() {
    const habia = !!this._pin;
    this._quitarPin();
    if (habia) this._emitir('pin', null);
  }

  // ------------------------------------------------------------ pistas
  mostrarPista({ lat, lng, radiusKm }, { nivel = 1, ajustar = true } = {}) {
    const ring = anillo(lat, lng, radiusKm);
    for (const f of this._pistas.values()) f.properties.actual = 0;
    this._pistas.set(nivel, { type: 'Feature', properties: { nivel, actual: 1 }, geometry: { type: 'Polygon', coordinates: [ring] } });
    this._datos('tm-pistas', [...this._pistas.values()]);
    if (ajustar) this._ajustar(ring, { maxZoom: 13, animar: true });
  }

  limpiarPistas() {
    this._pistas.clear();
    this._datos('tm-pistas', []);
  }

  // ------------------------------------------------------------ resultados
  limpiarRevelacion() {
    for (const m of this._marcas) m.remove();
    this._marcas = [];
    this._lineas = [];
    this._datos('tm-lineas', []);
  }

  _marca(lat, lng, opts) {
    const mk = new (ML().Marker)({ element: elementoMarca(opts), anchor: 'bottom' }).setLngLat([lng, lat]).addTo(this.map);
    this._marcas.push(mk);
    return mk;
  }

  _relleno() {
    const { width, height } = this.raiz.getBoundingClientRect();
    return acotar(Math.min(width, height) * 0.16, 24, 80);
  }

  _ajustar(puntos, { padding, maxZoom = 12, animar = true } = {}) {
    const m = this.map;
    if (!m || !puntos.length) return;
    const r = this._relleno();
    const relleno = padding || { top: r + 34, bottom: r, left: r, right: r };
    const { width, height } = this.raiz.getBoundingClientRect();
    const cam = camaraPara(puntos, { ancho: width, alto: height, relleno, maxZoom });
    m.easeTo({ ...cam, duration: animar && !this.reducido() ? 700 : 0 });
  }

  /** Muestra el lugar real, los pines de cada uno y una línea de cada pin al lugar real. */
  revelar({ real, adivinanzas = [], etiquetaReal, padding, animar = true } = {}) {
    if (!this.map) return;
    this._quitarPin();
    this.permitirPin(false);
    this.limpiarRevelacion();
    const puntos = [[real.lng, real.lat]];
    for (const a of adivinanzas) {
      const ruta = arco(real.lat, real.lng, a.lat, a.lng);
      const fin = ruta[ruta.length - 1];
      this._lineas.push({ type: 'Feature', properties: { color: a.color || MAGENTA }, geometry: { type: 'LineString', coordinates: ruta } });
      puntos.push(fin, ...ruta.map(delArco));
      this._marca(fin[1], fin[0], { color: a.color || MAGENTA, tipo: 'guess', etiqueta: a.etiqueta });
    }
    this._datos('tm-lineas', this._lineas);
    this._marca(real.lat, real.lng, { color: VERDE, tipo: 'real', etiqueta: etiquetaReal });
    if (adivinanzas.length) this._ajustar(puntos, { padding, maxZoom: 14, animar });
    else this.map.easeTo({ center: [real.lng, real.lat], zoom: 5, duration: animar && !this.reducido() ? 700 : 0 });
  }

  /** Todas las rondas de la partida: lugar real (verde) y pin de cada una, con su número. */
  resumen(rondas, { padding, animar = true } = {}) {
    if (!this.map) return;
    this._quitarPin();
    this.permitirPin(false);
    this.limpiarRevelacion();
    const puntos = [];
    rondas.forEach((r, i) => {
      const n = i + 1;
      puntos.push([r.real.lng, r.real.lat]);
      if (r.guess) {
        const ruta = arco(r.real.lat, r.real.lng, r.guess.lat, r.guess.lng);
        const fin = ruta[ruta.length - 1];
        this._lineas.push({ type: 'Feature', properties: { color: MAGENTA }, geometry: { type: 'LineString', coordinates: ruta } });
        puntos.push(fin, ...ruta.map(delArco));
        this._marca(fin[1], fin[0], { color: MAGENTA, tipo: 'guess', numero: n });
      }
      this._marca(r.real.lat, r.real.lng, { color: VERDE, tipo: 'real', numero: n });
    });
    this._datos('tm-lineas', this._lineas);
    // las longitudes son continuas (no se parten en el antimeridiano): si abarcan más de una vuelta, el mapa queda en el zoom mínimo
    this._ajustar(puntos, { padding, maxZoom: 12, animar });
  }

  // ------------------------------------------------------------ vista
  /** Encuadra una caja [[oeste, sur], [este, norte]]; null = el mundo entero. */
  encuadrar(limites, { animar = false } = {}) {
    if (!this.map) return;
    const r = Math.max(8, this._relleno() / 2);
    const { width, height } = this.raiz.getBoundingClientRect();
    const cam = camaraPara(limites || MUNDO, { ancho: width, alto: height, relleno: { top: r, bottom: r, left: r, right: r }, maxZoom: 9 });
    this.map.easeTo({ ...cam, duration: animar && !this.reducido() ? 600 : 0 });
  }

  vistaMundo(animar = false) {
    this.encuadrar(null, { animar });
  }

  redimensionar() {
    this.map?.resize();
  }

  proyectar(lat, lng) {
    const p = this.map?.project([lng, lat]);
    return p ? { x: p.x, y: p.y } : null;
  }

  mostrarAtribucion(si) {
    this._atrib = !!si;
    this.raiz.querySelector('.maplibregl-ctrl-attrib')?.classList.toggle('maplibregl-compact-show', !!si);
    const d = this.raiz.querySelector('details.maplibregl-ctrl-attrib');
    if (d) d.open = !!si;
  }

  // ------------------------------------------------------------ tema
  cambiarTema(tema) {
    tema = tema === 'light' ? 'light' : 'dark';
    if (tema === this.tema) return;
    this.tema = tema;
    this.raiz.dataset.tema = tema;
    const m = this.map;
    if (!m || !this._base) return;
    for (const capa of adaptarEstilo(this._base, tema).layers) {
      if (!capa.paint || !m.getLayer(capa.id)) continue;
      for (const k of Object.keys(capa.paint)) {
        if (!/-color$/.test(k)) continue;
        try {
          m.setPaintProperty(capa.id, k, capa.paint[k]);
        } catch {}
      }
    }
  }

  destruir() {
    this._destruido = true;
    cancelAnimationFrame(this._rf);
    this._ro.disconnect();
    this._subs.clear();
    for (const m of this._marcas) m.remove();
    this._pin?.remove();
    try {
      this.map?.remove();
    } catch {}
    this.map = null;
    this.raiz.remove();
  }
}
