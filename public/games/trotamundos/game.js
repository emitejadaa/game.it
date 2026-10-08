/* Trotamundos — flujo del juego de un jugador (menú → opciones → ronda → resultado → resumen) y puente con el cliente online.
 *
 * Qué le entrega este archivo al cliente online (online.js recibe `ctx` en abrirOnline(ctx), y también se exporta como `ctx`):
 *   ctx.G                      el SDK del portal (window.GameIt)
 *   ctx.t(clave, vars)         texto en el idioma actual (es/en); ctx.agregarTextos({ clave: { es, en } }) suma los propios
 *   ctx.lang()                 'es' | 'en'
 *   ctx.el(tag, props, …hijos) crea elementos sin innerHTML (props: class, text, dataset, onclick…, el resto son atributos)
 *   ctx.$(id)                  document.getElementById
 *   ctx.pantalla(id, { juego }) muestra la sección #p-<id> (cualquier <section class="pantalla" id="p-…"> dentro de #app);
 *                              juego: true avisa GameIt.gameplay(true) (solo mientras se juega; en menús y resultados, false)
 *   ctx.volverAlMenu()         vuelve al menú de Trotamundos
 *   ctx.toast(texto) · ctx.dialogo({ titulo, texto, botones: [{ texto, primario, valor }] }) → Promise del valor · ctx.mensaje(titulo, texto) → Promise
 *   ctx.crearVisor(host, opts) · ctx.crearMapa(host, opts)   Visor y Mapa ya con idioma, tema y "reducir movimiento" del portal
 *   ctx.cargarDatos()          Promise de { famosos, mundo, meta } (con reintentos; lanza ErrorDatos)
 *   ctx.D (datos.js), ctx.geo (shared/geo.js), ctx.sfx (/shared/sfx.js)
 *   ctx.fmt(n) · ctx.fmtDist(km) · ctx.fmtReloj(seg) · ctx.nombrePais(cc) · ctx.nombreLugar(loc) · ctx.esTactil()
 *   ctx.RONDAS, ctx.BANDA_ABAJO (28 px de atribución de Google: no dibujar nada ahí), ctx.COLORES
 *   ctx.leer(clave, def) · ctx.guardar(clave, valor)   localStorage con el prefijo gameit:trotamundos:
 *   ctx.alTeclado = (evento) => bool    (opcional) atajos propios mientras la pantalla activa empieza con 'online'
 * Atajos y detalles de UX: ver docs/trotamundos.md sección 4 y las notas de la entrega.
 */
import { distanceKm, scoreFor, scopeScale, hintCircle, WORLD_D, MAX_SCORE, REGIONS, dailyKey } from './shared/geo.js';
import * as geo from './shared/geo.js';
import * as sfx from '/shared/sfx.js';
import { Visor, BANDA_ABAJO } from './visor.js';
import { Mapa } from './mapa.js';
import * as D from './datos.js';
import { TEXTOS, traducir } from './textos.js';
import { TOPE_CARGA_S } from './config.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const MAX_PISTAS = 3;
const COLORES = { real: '#12b76a', pin: '#ff2bd6' };

const lang = () => (G.prefs.lang === 'en' ? 'en' : 'es');
const t = (k, v) => traducir(lang(), k, v);
const agregarTextos = (o) => Object.assign(TEXTOS, o);
const esTactil = () => !!G.prefs.touch || matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- utilidades de DOM y formato
function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...hijos.flat().filter((x) => x != null && x !== false));
  return e;
}

const locale = () => (lang() === 'en' ? 'en-US' : 'es-AR');
const fmt = (n) => new Intl.NumberFormat(locale()).format(Math.round(n));
function fmtDist(km) {
  if (km < 1) return `${fmt(km * 1000)} m`;
  if (km < 10) return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(km)} km`;
  return `${fmt(km)} km`;
}
const fmtReloj = (s) => `${Math.floor(Math.max(0, Math.ceil(s)) / 60)}:${String(Math.max(0, Math.ceil(s)) % 60).padStart(2, '0')}`;

function nombrePais(cc) {
  try {
    return new Intl.DisplayNames([lang()], { type: 'region' }).of(String(cc).toUpperCase()) || cc;
  } catch {
    return cc;
  }
}
const nombreCorto = (loc) => (loc.n ? loc.n[lang()] || loc.n.es : loc.p || nombrePais(loc.cc));
function nombreLugar(loc) {
  const pais = nombrePais(loc.cc);
  if (loc.n) {
    const n = loc.n[lang()] || loc.n.es;
    return n.includes(pais) ? n : `${n}, ${pais}`;
  }
  return loc.p ? `${loc.p}, ${pais}` : pais;
}

// ---------------------------------------------------------------- estado
const S = {
  pantalla: 'menu',
  opc: D.leerOpciones(),
  datos: null,
  malas: D.leerMalas(),
  // partida
  modo: 'famosos',
  ambito: 'mundo',
  escala: WORLD_D,
  tiempo: 0,
  congelado: false,
  limites: null,
  sorteo: null,
  diarias: null,
  semilla: '',
  idPartida: 0,
  r: 0,
  loc: null,
  res: [],
  total: 0,
  pistasPartida: 0,
  pistasRonda: 0,
  rewardOk: false,
  pidiendoPista: false,
  // ronda
  tok: 0,
  enRonda: false,
  relojOn: false,
  restante: null,
  pausado: false,
  dialogo: false,
  mapaFijo: false,
  mapaHover: false,
  copiado: false,
};

// ---------------------------------------------------------------- textos estáticos
function aplicarTextos() {
  document.documentElement.lang = lang();
  document.title = `${t('titulo')} · game.it`;
  for (const e of document.querySelectorAll('[data-t]')) e.textContent = t(e.dataset.t);
  for (const e of document.querySelectorAll('[data-t-aria]')) e.setAttribute('aria-label', t(e.dataset.tAria));
  for (const e of document.querySelectorAll('[data-t-title]')) e.title = t(e.dataset.tTitle);
  $('diario-sub').textContent = dailyKey();
}

// ---------------------------------------------------------------- pantallas, aviso y diálogo
function pantalla(id, { juego = id === 'ronda' } = {}) {
  S.pantalla = id;
  for (const s of document.querySelectorAll('.pantalla')) s.classList.toggle('on', s.id === `p-${id}`);
  document.documentElement.dataset.pantalla = id;
  G.gameplay(!!juego);
  const sec = $(`p-${id}`);
  const foco = sec?.querySelector('[data-foco]') || sec?.querySelector('h1, h2') || sec;
  if (foco) {
    if (!foco.hasAttribute('tabindex')) foco.setAttribute('tabindex', '-1');
    foco.focus({ preventScroll: true });
  }
  if (id !== 'ronda') $('pausa').hidden = true;
  else $('pausa').hidden = !S.pausado;
}

let toastT = 0;
function toast(msg, ms = 3200) {
  const e = $('toast');
  e.textContent = msg;
  e.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (e.hidden = true), ms);
}

let dlgResolver = null;
/** Diálogo modal: devuelve el `valor` del botón que se tocó (o `cancelar` con Esc). */
function dialogo({ titulo, texto, botones, cancelar = null }) {
  cerrarDialogo(cancelar);
  S.dialogo = true;
  $('dlg-t').textContent = titulo;
  $('dlg-d').textContent = texto || '';
  const cont = $('dlg-bot');
  cont.replaceChildren();
  let primero = null;
  for (const b of botones) {
    const btn = el('button', { type: 'button', class: `btn${b.primario ? ' primario' : ''}`, text: b.texto, onclick: () => cerrarDialogo(b.valor) });
    cont.append(btn);
    if (b.primario || !primero) primero = btn;
  }
  $('dialogo').hidden = false;
  S._cancelar = cancelar;
  primero?.focus();
  return new Promise((r) => (dlgResolver = r));
}
function cerrarDialogo(valor) {
  if (!dlgResolver && $('dialogo').hidden) return;
  $('dialogo').hidden = true;
  S.dialogo = false;
  const r = dlgResolver;
  dlgResolver = null;
  r?.(valor);
}
const mensaje = (titulo, texto) => dialogo({ titulo, texto, botones: [{ texto: t('entendido'), primario: true, valor: true }] });

// ---------------------------------------------------------------- datos
let pidiendoDatos = null;
function cargarDatosJuego() {
  if (S.datos) return Promise.resolve(S.datos);
  pidiendoDatos ||= D.cargarDatos()
    .then((d) => {
      S.datos = d;
      $('datos-aviso').hidden = true;
      if (S.pantalla === 'opciones') pintarOpciones();
      return d;
    })
    .catch((e) => {
      pidiendoDatos = null;
      $('datos-msg').textContent = e?.code === 'red' ? t('datosRed') : t('datosFaltan', { archivo: e?.archivo || '' });
      $('datos-aviso').hidden = false;
      throw e;
    });
  return pidiendoDatos;
}
const asegurarDatos = () => cargarDatosJuego().catch(() => null);

// ---------------------------------------------------------------- visor y mapa (se crean una vez)
const visor = new Visor($('visor-host'), { lang: lang(), titulo: t('visorTitulo'), textoCargando: t('cargandoVista') });
const mapaEl = el('div', { class: 'mapa-ancla' });
let mapa = null;
function crearMapa(host, opts = {}) {
  return new Mapa(host, { tema: G.prefs.theme, reducido: () => G.prefs.reducedMotion, textos: textosMapa(), ...opts });
}
const textosMapa = () => ({ error: t('mapaError'), reintentar: t('reintentar'), etiqueta: t('mapaEtiqueta'), centro: t('mapa_centro') });
const crearVisor = (host, opts = {}) => new Visor(host, { lang: lang(), titulo: t('visorTitulo'), textoCargando: t('cargandoVista'), ...opts });

function colocarMapa(slot) {
  if (!mapa) {
    mapa = crearMapa(mapaEl);
    mapa.on('pin', () => pintarDock());
  }
  if (mapaEl.parentElement !== slot) slot.append(mapaEl);
  requestAnimationFrame(() => mapa.redimensionar());
}

// ---------------------------------------------------------------- menú
function irMenu() {
  detenerRonda();
  pantalla('menu');
  pintarMenu();
}
function pintarMenu() {
  $('diario-sub').textContent = dailyKey();
}

for (const b of document.querySelectorAll('.modo')) {
  b.addEventListener('click', () => {
    sfx.tone(520, 700, 0.06, { type: 'triangle', vol: 0.12 });
    const m = b.dataset.modo;
    if (m === 'online') return abrirOnline();
    abrirOpciones(m);
  });
}
$('datos-reintentar').addEventListener('click', () => {
  pidiendoDatos = null;
  cargarDatosJuego().catch(() => {});
});

async function abrirOnline() {
  try {
    const m = await import('./online.js');
    await m.abrirOnline(ctx);
  } catch (e) {
    console.error('[trotamundos] online', e);
    await mensaje(t('onlineTitulo'), t('onlineError'));
    irMenu();
  }
}

// ---------------------------------------------------------------- opciones del modo
function ambitoActual() {
  return S.opc.modo === 'famosos' ? S.opc.ambitoFamosos : S.opc.ambitoPais;
}
function nombreAmbito(a) {
  if (a === 'mundo') return t('a_mundo');
  if (a === 'latam') return t('a_latam');
  if (REGIONS.includes(a)) return t(`c_${a}`);
  return nombrePais(a);
}

function chip({ texto, activo, desactivado, sub, onclick, titulo }) {
  return el('button', { type: 'button', class: 'chip-op', role: 'radio', 'aria-checked': activo ? 'true' : 'false', disabled: desactivado, title: titulo, onclick }, el('span', { text: texto }), sub ? el('small', { text: sub }) : null);
}

function abrirOpciones(modo) {
  S.opc = { ...D.leerOpciones(), modo };
  pantalla('opciones');
  pintarOpciones();
  cargarDatosJuego().catch(() => {});
}

function pintarOpciones() {
  const { modo } = S.opc;
  const datos = S.datos;
  $('op-titulo').textContent = t(`m_${modo}`);
  $('op-sub').textContent = t(`op_${modo}`);
  const esDiario = modo === 'diario';
  $('g-ambito').hidden = !(modo === 'famosos' || modo === 'pais');
  $('g-azar').hidden = modo !== 'azar';
  $('g-tiempo').hidden = esDiario;
  $('g-congelado').hidden = esDiario;
  $('g-diario').hidden = !esDiario;
  $('buscar').hidden = modo !== 'pais';
  if (esDiario) $('diario-info').textContent = t('diarioInfo', { fecha: dailyKey(), min: D.TIEMPO_DIARIO / 60 });

  // ámbito
  const cont = $('ambitos');
  cont.replaceChildren();
  if (modo === 'famosos' || modo === 'pais') {
    const sel = ambitoActual();
    const lista = modo === 'famosos' ? ['mundo', 'AR', 'latam'] : ['AR', 'latam', ...REGIONS];
    const extra = modo === 'pais' && !lista.includes(sel) ? [sel] : [];
    for (const a of [...lista, ...extra]) {
      const n = datos ? D.ambitoDisponible(datos, modo, a, S.malas) : null;
      const poco = n != null && n < D.MIN_LUGARES;
      cont.append(
        chip({
          texto: nombreAmbito(a),
          activo: sel === a,
          desactivado: poco,
          sub: n == null ? '' : poco ? t('faltanLugares') : t('nLugares', { n: fmt(n) }),
          onclick: () => {
            if (modo === 'famosos') S.opc.ambitoFamosos = a;
            else S.opc.ambitoPais = a;
            pintarOpciones();
          },
        }),
      );
    }
  }
  if (modo === 'pais') pintarBuscador();

  // tiempo
  const tc = $('tiempos');
  tc.replaceChildren();
  for (const s of D.TIEMPOS) {
    tc.append(
      chip({
        texto: s ? `${s} s` : t('sinLimite'),
        activo: S.opc.tiempo === s,
        onclick: () => {
          S.opc.tiempo = s;
          pintarOpciones();
        },
      }),
    );
  }
  $('congelado').setAttribute('aria-checked', S.opc.congelado ? 'true' : 'false');

  const lista = datos && (modo === 'famosos' ? datos.famosos : datos.mundo);
  const n = datos ? D.ambitoDisponible(datos, modo === 'diario' ? 'azar' : modo, modo === 'famosos' || modo === 'pais' ? ambitoActual() : 'mundo', S.malas) : 0;
  $('op-jugar').disabled = !datos || (!esDiario && n < D.MIN_LUGARES) || (modo === 'famosos' && !lista?.length);
  const err = $('op-error');
  err.hidden = !datos || esDiario || n >= D.MIN_LUGARES;
  err.textContent = t('faltanLugaresMsg');
}

function pintarBuscador() {
  const q = $('pais-q').value.trim().toLowerCase();
  const cont = $('paises');
  cont.replaceChildren();
  if (!S.datos || !q) {
    cont.hidden = true;
    return;
  }
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nq = norm(q);
  const todos = D.paisesDisponibles(S.datos.mundo, S.datos.meta, { excluir: S.malas });
  const hallados = todos.map((p) => ({ ...p, nombre: nombrePais(p.cc) })).filter((p) => norm(p.nombre).includes(nq) || p.cc.toLowerCase() === nq);
  cont.hidden = false;
  if (!hallados.length) {
    cont.append(el('p', { class: 'nota', text: t('sinPaises') }));
    return;
  }
  for (const p of hallados.slice(0, 12)) {
    cont.append(
      el('button', {
        type: 'button',
        role: 'option',
        class: 'pais-op',
        onclick: () => {
          S.opc.ambitoPais = p.cc;
          $('pais-q').value = '';
          pintarOpciones();
        },
      }, el('span', { text: p.nombre }), el('small', { text: t('nLugares', { n: fmt(p.n) }) })),
    );
  }
}
$('pais-q').addEventListener('input', pintarBuscador);
$('congelado').addEventListener('click', () => {
  S.opc.congelado = !S.opc.congelado;
  pintarOpciones();
});
$('op-volver').addEventListener('click', irMenu);
$('op-jugar').addEventListener('click', () => nuevaPartida());

// ---------------------------------------------------------------- partida
/** Arma y empieza una partida con S.opc (o con la configuración de la partida anterior si `repetir`). */
async function nuevaPartida({ repetir = false } = {}) {
  const datos = await asegurarDatos();
  if (!datos) return;
  if (!repetir) D.guardarOpciones(S.opc);
  const o = S.opc;
  S.malas = D.leerMalas();
  S.modo = o.modo;
  S.idPartida++;
  S.semilla = `${Date.now().toString(36)}${S.idPartida}`;
  S.r = 0;
  S.res = [];
  S.total = 0;
  S.pistasPartida = 0;
  S.pistasRonda = 0;
  S.diarias = null;
  const meta = datos.meta;
  if (o.modo === 'diario') {
    S.diarias = D.partidaDiaria(datos);
    S.ambito = 'mundo';
    S.tiempo = D.TIEMPO_DIARIO;
    S.congelado = false;
    const usados = new Set(S.diarias.map((l) => l.id));
    S.sorteo = new D.Sorteo({ lista: datos.mundo.filter((l) => !usados.has(l.id)), ambito: 'mundo', meta, malas: S.malas });
    S.limites = null;
  } else {
    S.ambito = o.modo === 'azar' ? 'mundo' : o.modo === 'famosos' ? o.ambitoFamosos : o.ambitoPais;
    S.tiempo = o.tiempo;
    S.congelado = o.congelado;
    const lista = o.modo === 'famosos' ? datos.famosos : datos.mundo;
    S.sorteo = new D.Sorteo({ lista, ambito: S.ambito, meta, malas: S.malas });
    if (S.sorteo.restantes < D.MIN_LUGARES) {
      pintarOpciones();
      toast(t('faltanLugaresMsg'));
      return;
    }
    S.limites = D.limitesAmbito([...datos.mundo, ...datos.famosos], S.ambito, meta);
  }
  S.escala = scopeScale(S.ambito, meta);
  refrescarRecompensa();
  iniciarRonda();
}

function iniciarRonda() {
  const loc = S.diarias ? S.diarias[S.r] : S.sorteo.siguiente();
  if (!loc) {
    toast(t('faltanLugaresMsg'));
    return irMenu();
  }
  S.loc = loc;
  S.pistasRonda = 0;
  S.enRonda = true;
  S.relojOn = false;
  S.restante = S.tiempo || null;
  S.mapaFijo = false;
  S.mapaHover = false;
  const tok = ++S.tok;
  pantalla('ronda');
  colocarMapa($('slot-ronda'));
  mapa.limpiarRevelacion();
  mapa.limpiarPistas();
  mapa.limpiarPin();
  mapa.permitirPin(true);
  mapa.mostrarAtribucion(false);
  mapa.encuadrar(S.limites);
  visor.mostrar({ lat: loc.lat, lng: loc.lng, heading: loc.h, frozen: S.congelado, lang: lang() });
  setTimeout(() => iniciarReloj(tok), TOPE_CARGA_S * 1000);
  pintarRonda();
  $('p-ronda').focus({ preventScroll: true });
}

function iniciarReloj(tok) {
  if (tok !== S.tok || !S.enRonda || S.relojOn) return;
  S.relojOn = true;
  pintarReloj();
}
visor.on('carga', () => iniciarReloj(S.tok));

function detenerRonda() {
  S.enRonda = false;
  S.relojOn = false;
  S.tok++;
  visor.ocultar();
  cerrarDialogo(null);
}

// reloj: un solo temporizador; solo corre con la ronda en curso, el visor cargado y sin pausas
let ultimoTick = performance.now();
setInterval(() => {
  const ahora = performance.now();
  const dt = Math.min(1, (ahora - ultimoTick) / 1000);
  ultimoTick = ahora;
  if (!S.enRonda || !S.relojOn || S.pausado || S.dialogo || document.hidden || S.restante == null) return;
  const antes = Math.ceil(S.restante);
  S.restante -= dt;
  if (S.restante <= 0) {
    S.restante = 0;
    pintarReloj();
    return finalizar(true);
  }
  if (Math.ceil(S.restante) !== antes && S.restante <= 5) sfx.tone(880, 880, 0.05, { type: 'square', vol: 0.06 });
  pintarReloj();
}, 200);

function pintarReloj() {
  const c = $('hud-reloj');
  c.hidden = S.restante == null;
  if (S.restante == null) return;
  c.textContent = `⏱ ${fmtReloj(S.restante)}`;
  c.classList.toggle('urge', S.restante <= 10);
  c.setAttribute('aria-label', t('quedan', { t: fmtReloj(S.restante) }));
}

function pintarRonda() {
  $('hud-ronda').textContent = t('ronda', { n: S.r + 1, total: D.RONDAS });
  $('hud-puntos').textContent = `★ ${fmt(S.total)}`;
  $('hud-congelado').hidden = !S.congelado;
  pintarReloj();
  pintarTools();
  pintarDock();
}

function pintarTools() {
  const b = $('b-pista');
  const sinMas = S.pistasRonda >= MAX_PISTAS;
  const conAnuncio = S.pistasPartida >= 1 && S.rewardOk && !sinMas;
  $('b-pista-t').textContent = sinMas ? t('b_pista_fin') : t('b_pista_n', { n: Math.min(S.pistasRonda + 1, MAX_PISTAS) });
  $('b-pista-ad').hidden = !conAnuncio;
  b.disabled = sinMas || S.pidiendoPista || !S.enRonda;
  b.setAttribute('aria-label', conAnuncio ? t('b_pista_ad') : t('b_pista'));
}

// ---------------------------------------------------------------- minimapa / panel
function abrirMapa(si = true) {
  S.mapaFijo = si;
  if (!si) S.mapaHover = false;
  pintarDock();
}

function pintarDock() {
  const dock = $('dock');
  const pin = mapa?.pin || null;
  const grande = S.mapaFijo || S.mapaHover;
  dock.dataset.estado = grande ? 'grande' : 'mini';
  dock.dataset.fijo = S.mapaFijo ? '1' : '0';
  dock.dataset.pin = pin ? '1' : '0';
  const tg = $('mapa-toggle');
  tg.textContent = S.mapaFijo ? t('mapa_cerrar') : t('mapa_fijar');
  tg.setAttribute('aria-pressed', S.mapaFijo ? 'true' : 'false');
  const ad = $('adivinar');
  ad.textContent = pin ? t('adivinar') : t('marcaElMapa');
  ad.disabled = !pin || !S.enRonda;
  $('mapa-abrir').hidden = grande;
}

$('mapa-abrir').addEventListener('click', () => abrirMapa(true));
$('mapa-toggle').addEventListener('click', () => abrirMapa(!S.mapaFijo));
$('mapa-centro').addEventListener('click', () => {
  mapa?.ponerPinEnCentro();
  sfx.tone(700, 520, 0.05, { vol: 0.1 });
});
$('adivinar').addEventListener('click', adivinar);

// con mouse, el minimapa crece al pasar por encima (en táctil se abre con un toque)
const dock = $('dock');
let hoverT = 0;
dock.addEventListener('pointerenter', (e) => {
  if (e.pointerType !== 'mouse') return;
  clearTimeout(hoverT);
  S.mapaHover = true;
  pintarDock();
});
dock.addEventListener('pointerleave', (e) => {
  if (e.pointerType !== 'mouse') return;
  const soltar = () => {
    clearTimeout(hoverT);
    hoverT = setTimeout(() => {
      if (dock.matches(':hover')) return;
      S.mapaHover = false;
      pintarDock();
    }, 450);
  };
  if (e.buttons) addEventListener('pointerup', soltar, { once: true });
  else soltar();
});

// ---------------------------------------------------------------- acciones de la ronda
function adivinar() {
  if (!S.enRonda || S.dialogo) return;
  if (!mapa.pin) {
    abrirMapa(true);
    return toast(t('marcaPrimero'));
  }
  finalizar(false);
}

function reiniciarVista() {
  if (!S.enRonda || S.dialogo) return;
  visor.reiniciar();
  toast(t('vistaReiniciada'), 1800);
}

function otraUbicacion() {
  if (!S.enRonda || S.dialogo) return;
  D.marcarMala(S.loc.id);
  S.malas.add(S.loc.id);
  S.sorteo.descartar(S.loc.id);
  const nueva = S.sorteo.siguiente();
  if (!nueva) return toast(t('sinMasLugares'));
  if (S.diarias) S.diarias[S.r] = nueva;
  S.loc = nueva;
  S.pistasRonda = 0;
  S.relojOn = false;
  S.restante = S.tiempo || null;
  const tok = ++S.tok;
  mapa.limpiarPistas();
  visor.mostrar({ lat: nueva.lat, lng: nueva.lng, heading: nueva.h, frozen: S.congelado, lang: lang() });
  setTimeout(() => iniciarReloj(tok), TOPE_CARGA_S * 1000);
  pintarRonda();
  toast(t('otraUbicacion'));
}

function refrescarRecompensa() {
  const id = S.idPartida;
  Promise.resolve(G.rewardAvailable('pista')).then((ok) => {
    if (id !== S.idPartida) return;
    S.rewardOk = !!ok;
    pintarTools();
  });
}

async function pedirPista() {
  if (!S.enRonda || S.dialogo || S.pidiendoPista) return;
  if (S.pistasRonda >= MAX_PISTAS) return toast(t('sinPistas'));
  const tok = S.tok;
  if (S.pistasPartida >= 1 && S.rewardOk) {
    // desde la segunda pista de la partida se pide ver un anuncio (si hay uno disponible)
    S.pidiendoPista = true;
    pintarTools();
    const visto = await G.showReward();
    S.pidiendoPista = false;
    refrescarRecompensa();
    if (tok !== S.tok || !S.enRonda) return;
    if (!visto) {
      pintarTools();
      return toast(t('pistaSinAnuncio'));
    }
  }
  S.pistasPartida++;
  S.pistasRonda++;
  const c = hintCircle(S.loc, S.pistasRonda, S.escala, S.semilla);
  abrirMapa(true);
  mapa.mostrarPista(c, { nivel: S.pistasRonda, ajustar: true });
  sfx.notes([660, 990], { step: 0.08, dur: 0.14, vol: 0.12 });
  toast(t('pistaDada', { n: S.pistasRonda, km: fmt(c.radiusKm) }), 4200);
  pintarTools();
  refrescarRecompensa();
}

async function pedirSalida() {
  if (S.dialogo) return;
  const si = await dialogo({
    titulo: t('salirTitulo'),
    texto: t('salirTexto'),
    cancelar: false,
    botones: [
      { texto: t('seguir'), primario: true, valor: false },
      { texto: t('salirMenu'), valor: true },
    ],
  });
  if (si) irMenu();
}

$('b-reiniciar').addEventListener('click', reiniciarVista);
$('b-pista').addEventListener('click', pedirPista);
$('b-nocarga').addEventListener('click', otraUbicacion);
$('b-salir').addEventListener('click', pedirSalida);

// ---------------------------------------------------------------- resultado de la ronda
function finalizar(agotado) {
  if (!S.enRonda) return;
  S.enRonda = false;
  S.relojOn = false;
  const pin = mapa.pin;
  const km = pin ? distanceKm(S.loc.lat, S.loc.lng, pin.lat, pin.lng) : null;
  const puntos = pin ? scoreFor(km, S.escala) : 0;
  S.res.push({ loc: S.loc, guess: pin, km, puntos, agotado });
  S.total += puntos;
  visor.ocultar();
  mapa.permitirPin(false);
  cerrarDialogo(null);
  pantalla('resultado');
  colocarMapa($('slot-res'));
  pintarResultado();
  if (agotado) sfx.tone(300, 150, 0.4, { type: 'sawtooth', vol: 0.12 });
  else if (puntos >= 4000) sfx.notes([660, 880, 1320], { step: 0.09, dur: 0.22, vol: 0.14 });
  else if (puntos >= 1500) sfx.notes([523, 659], { step: 0.1, dur: 0.2, vol: 0.12 });
  else sfx.tone(260, 180, 0.3, { type: 'triangle', vol: 0.12 });
  // el mapa se acomoda al nuevo lugar antes de encuadrar
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      mapa.redimensionar();
      mapa.limpiarPistas();
      mapa.revelar({
        real: S.loc,
        adivinanzas: pin ? [{ lat: pin.lat, lng: pin.lng, color: COLORES.pin, etiqueta: t('vos') }] : [],
        etiquetaReal: nombreCorto(S.loc),
        animar: true,
      });
      mapa.mostrarAtribucion(true);
    }),
  );
}

let contarT = 0;
function pintarResultado() {
  const r = S.res[S.res.length - 1];
  if (!r) return;
  const ultima = S.res.length >= D.RONDAS;
  $('res-ronda').textContent = t('ronda', { n: S.res.length, total: D.RONDAS });
  $('res-titulo').textContent = r.guess ? t('estuviste', { d: fmtDist(r.km) }) : r.agotado ? t('seAcabo') : t('sinPin');
  $('res-lugar').textContent = t('elLugar', { lugar: nombreLugar(r.loc) });
  $('res-total').textContent = t('totalParcial', { n: fmt(S.total), max: fmt(D.RONDAS * MAX_SCORE) });
  $('res-sig').textContent = ultima ? t('verResumen') : t('siguiente');
  $('res-sig').setAttribute('aria-keyshortcuts', 'N Enter');
  $('res-barra').style.width = `${(r.puntos / MAX_SCORE) * 100}%`;
  const out = $('res-pts');
  clearInterval(contarT);
  if (G.prefs.reducedMotion || !r.puntos) out.textContent = `+${fmt(r.puntos)}`;
  else {
    const t0 = performance.now();
    contarT = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 700);
      out.textContent = `+${fmt(r.puntos * (1 - (1 - k) ** 3))}`;
      if (k >= 1) clearInterval(contarT);
    }, 30);
  }
}

function siguiente() {
  if (S.pantalla !== 'resultado') return;
  if (S.res.length >= D.RONDAS) return resumen();
  S.r++;
  iniciarRonda();
}
$('res-sig').addEventListener('click', siguiente);

// ---------------------------------------------------------------- resumen final
function resumen() {
  pantalla('resumen');
  colocarMapa($('slot-fin'));
  pintarResumen();
  sfx.notes([523, 659, 784, 1047], { step: 0.1, dur: 0.25, vol: 0.14 });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      mapa.redimensionar();
      mapa.limpiarPistas();
      mapa.resumen(S.res.map((r) => ({ real: r.loc, guess: r.guess })));
      mapa.mostrarAtribucion(true);
    }),
  );
}

function frase(total) {
  const p = total / (D.RONDAS * MAX_SCORE);
  return t(p >= 0.9 ? 'f5' : p >= 0.7 ? 'f4' : p >= 0.45 ? 'f3' : p >= 0.2 ? 'f2' : 'f1');
}

function pintarResumen() {
  $('fin-modo').textContent = S.modo === 'diario' ? t('finDiario', { fecha: dailyKey() }) : `${t(`m_${S.modo}`)}${S.modo === 'azar' ? '' : ` · ${nombreAmbito(S.ambito)}`}`;
  $('fin-titulo').textContent = t('finTitulo');
  $('fin-puntos').textContent = fmt(S.total);
  $('fin-max').textContent = ` / ${fmt(D.RONDAS * MAX_SCORE)}`;
  $('fin-frase').textContent = frase(S.total);
  const ol = $('fin-lista');
  ol.replaceChildren();
  S.res.forEach((r, i) => {
    ol.append(
      el(
        'li',
        {},
        el('span', { class: 'n', text: String(i + 1) }),
        el('span', { class: 'l', text: nombreCorto(r.loc) }),
        el('span', { class: 'd', text: r.guess ? fmtDist(r.km) : '—' }),
        el('b', { class: 'p', text: fmt(r.puntos) }),
      ),
    );
  });
  $('fin-otra').textContent = t('otraVez');
  $('fin-copiar').hidden = S.modo !== 'diario';
  $('fin-copiar').textContent = S.copiado ? t('copiado') : t('copiar');
}

function textoParaCopiar() {
  const e = S.res.map((r) => (r.puntos >= 4500 ? '🟩' : r.puntos >= 3000 ? '🟨' : r.puntos >= 1500 ? '🟧' : '🟥')).join('');
  return `${t('compartirTitulo', { fecha: dailyKey() })}\n${fmt(S.total)} / ${fmt(D.RONDAS * MAX_SCORE)}\n${e}\n${location.origin}/#play/trotamundos`;
}

async function copiarResultado() {
  const txt = textoParaCopiar();
  let ok = false;
  try {
    await navigator.clipboard.writeText(txt);
    ok = true;
  } catch {
    try {
      const ta = el('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0' });
      ta.value = txt;
      document.body.append(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch {}
  }
  S.copiado = ok;
  $('fin-copiar').textContent = ok ? t('copiado') : t('copiar');
  toast(ok ? t('copiado') : t('noCopiado'));
  if (ok) setTimeout(() => ((S.copiado = false), S.pantalla === 'resumen' && pintarResumen()), 2500);
}

async function otraVez() {
  if (S.pantalla !== 'resumen') return;
  await G.commercialBreak('otra-partida'); // pausa natural para un anuncio (si hay)
  nuevaPartida({ repetir: true });
}
$('fin-otra').addEventListener('click', otraVez);
$('fin-menu').addEventListener('click', irMenu);
$('fin-copiar').addEventListener('click', copiarResultado);

// ---------------------------------------------------------------- teclado
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (S.dialogo) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrarDialogo(S._cancelar ?? null);
    } else if (e.key === 'Tab') {
      const bs = [...$('dlg-bot').querySelectorAll('button')];
      if (!bs.length) return;
      const i = bs.indexOf(document.activeElement);
      e.preventDefault();
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
    }
    return;
  }
  if (S.pantalla.startsWith('online') && ctx.alTeclado?.(e)) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const enBoton = tag === 'BUTTON' || tag === 'A' || e.target?.getAttribute?.('role') === 'radio';
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const activar = (e.code === 'Space' || e.key === 'Enter') && !enBoton;
  switch (S.pantalla) {
    case 'menu':
      break;
    case 'opciones':
      if (e.key === 'Escape') irMenu();
      break;
    case 'ronda':
      if (e.key === 'Escape') {
        if (S.mapaFijo) abrirMapa(false);
        else pedirSalida();
      } else if (activar) {
        e.preventDefault();
        adivinar();
      } else if (k === 'm') abrirMapa(!S.mapaFijo);
      else if (k === 'r') reiniciarVista();
      else if (k === 'h') pedirPista();
      else return;
      e.preventDefault();
      break;
    case 'resultado':
      if (activar || k === 'n') {
        e.preventDefault();
        siguiente();
      } else if (e.key === 'Escape') pedirSalida();
      break;
    case 'resumen':
      if (k === 'n') otraVez();
      else if (e.key === 'Escape') irMenu();
      break;
  }
});

// ---------------------------------------------------------------- portal: pausa, preferencias, tamaño
G.onPause(() => {
  S.pausado = true;
  if (S.pantalla === 'ronda') $('pausa').hidden = false;
});
G.onResume(() => {
  S.pausado = false;
  ultimoTick = performance.now();
  $('pausa').hidden = true;
});

G.onPrefs(() => {
  aplicarTextos();
  visor.lang = lang();
  visor.titulo = t('visorTitulo');
  if (mapa) {
    mapa.cambiarTema(G.prefs.theme);
    mapa.ponerTextos(textosMapa());
  }
  if (S.pantalla === 'opciones') pintarOpciones();
  else if (S.pantalla === 'ronda') pintarRonda();
  else if (S.pantalla === 'resultado') pintarResultado();
  else if (S.pantalla === 'resumen') pintarResumen();
}, true);

// la barra de arriba (HUD + herramientas) puede ocupar una o dos filas: el panel del mapa se ubica debajo
new ResizeObserver(() => document.documentElement.style.setProperty('--barra-h', `${$('barra').offsetHeight}px`)).observe($('barra'));

// ---------------------------------------------------------------- lo que recibe el cliente online
export const ctx = {
  G,
  t,
  agregarTextos,
  lang,
  el,
  $,
  pantalla,
  volverAlMenu: irMenu,
  toast,
  dialogo,
  mensaje,
  crearVisor,
  crearMapa,
  cargarDatos: cargarDatosJuego,
  D,
  geo,
  sfx,
  fmt,
  fmtDist,
  fmtReloj,
  nombrePais,
  nombreLugar,
  esTactil,
  RONDAS: D.RONDAS,
  BANDA_ABAJO,
  COLORES,
  leer: D.leer,
  guardar: D.guardar,
  alTeclado: null,
  // solo para pruebas desde la consola/Playwright
  _estado: S,
  _visor: visor,
  _mapa: () => mapa,
};

// ---------------------------------------------------------------- arranque
aplicarTextos();
pintarMenu();
cargarDatosJuego().catch(() => {});
G.gameplay(false);
G.ready(); // el menú ya se puede ver: el portal retira su pantalla de carga
