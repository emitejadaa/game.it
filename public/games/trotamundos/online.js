/* Trotamundos — cliente online (de 2 a 10 jugadores). Reglas y contrato: docs/trotamundos.md §5 y el comentario del
 * principio de server/games/trotamundos.js. Lo carga game.js con import() y le pasa `ctx` (ver el comentario de game.js).
 *
 * Pantallas (secciones #p-online… dentro de #app, con estilos en online.css):
 *   online        entrada: nombre, partida rápida, sala privada, código y salas públicas
 *   online-lobby  código, link, jugadores, ajustes (anfitrión) y EMPEZAR
 *   online-ronda  visor + minimapa + quién confirmó (el reloj es del servidor: tm.t1 con el desfase de room.now)
 *   online-rev    revelación: lugar real, pin de cada uno con su color, tabla y cuenta regresiva
 *   online-fin    podio, ranking, mapa de las rondas, revancha
 *
 * Todo lo que viene de afuera (nombres, códigos) se muestra con textContent. Lo que se puede decidir sin pantalla está en
 * online-logica.js (probado en Node); los textos, en online-textos.js. Nada se dibuja sobre los 28 px de abajo del visor.
 */
import { OnlineRoom, netText, defaultName, saveName, share, shareLink, roomFromUrl } from '/shared/online.js';
import * as L from './online-logica.js';
import { TEXTOS_ONLINE } from './online-textos.js';

const JUEGO = 'trotamundos';
const REFRESCO_SALAS_MS = 6000;
const ESPERA_LISTA_MS = 12000;
const DESBLOQUEO_MS = 5000; // si el servidor no registró mi pin en este tiempo, se vuelve a poder marcar

/** @type {any} ctx de game.js */
let c = null;
/** Estado del cliente online (se reinicia cada vez que se abre). */
let O = null;

const t = (k, v) => c.t(k, v);
const el = (...a) => c.el(...a);
const colorSeguro = (v, def = '#9a9aae') => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : def);
const ahora = () => O.online.serverNow();
const yo = () => O.online?.myId || null;

function estadoNuevo() {
  return {
    online: null,
    room: null,
    pantalla: '',
    red: '',
    err: '',
    salas: null,
    quiere: null, // 'rapida' mientras se espera la lista de salas
    buscando: false,
    reanudando: false,
    pendientePublica: false,
    invitacion: '',
    datos: null,
    tx: [], // funciones que repintan textos fijos al cambiar de idioma
    R: {}, // referencias al DOM
    secciones: [],
    reds: [],
    visor: null,
    mapa: null,
    mapaEl: null,
    // ronda
    clave: '',
    confirmado: false,
    enviadoEn: 0,
    mine: null,
    mapaFijo: false,
    mapaHover: false,
    ultSeg: null,
    // revelación y final
    revClave: '',
    finMapa: false,
    finRonda: 0,
    // memo de bloques del lobby
    firmaJug: '',
    firmaAj: '',
    busquedaPais: '',
    timer: 0,
    timerSalas: 0,
    timerLista: 0,
    offPrefs: null,
    ro: null,
  };
}

// ================================================================ entrada desde game.js
export async function abrirOnline(ctx) {
  c = ctx;
  if (O?.online) return mostrarSegunEstado(); // ya estaba abierto
  c.agregarTextos(TEXTOS_ONLINE);
  O = estadoNuevo();
  await cargarCss();
  construirDom();
  O.online = new OnlineRoom(JUEGO, { onRoom: alRoom, onMessage: alMensaje, onStatus: alEstadoRed, onJoined: () => {} });
  c.alTeclado = alTeclado;
  O.offPrefs = c.G.onPrefs(alCambiarPrefs);
  O.timer = setInterval(tick, 250);
  c.cargarDatos().then((d) => ((O.datos = d), O.pantalla === 'lobby' && O.room && pintarLobby(O.room))).catch(() => {});
  empezar();
}

function cargarCss() {
  const id = 'tm-online-css';
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const l = document.createElement('link');
    l.id = id;
    l.rel = 'stylesheet';
    l.href = new URL('./online.css', import.meta.url).href;
    l.addEventListener('load', resolve, { once: true });
    l.addEventListener('error', resolve, { once: true });
    document.head.append(l);
    setTimeout(resolve, 1500); // no se espera de más
  });
}

/** Qué hacer al abrir: volver a una sala guardada (recarga de la pestaña), entrar por el link ?room= o mostrar la entrada. */
function empezar() {
  const code = roomFromUrl();
  const ses = O.online.session;
  O.nombreEnPestana = nombreGuardado();
  quitarRoomDeLaUrl();
  if (ses?.code && (!code || code === ses.code)) {
    O.reanudando = true;
    mostrarEntrada();
    O.online.resume();
    return;
  }
  if (code) {
    O.invitacion = code;
    mostrarEntrada();
    // con un nombre ya elegido en esta pestaña se entra directo; si no, se pide el nombre
    if (O.nombreEnPestana) unirse(code);
    else pedirSalas();
    return;
  }
  mostrarEntrada();
  pedirSalas();
}

function nombreGuardado() {
  try {
    return sessionStorage.getItem('gameit:name') || '';
  } catch {
    return '';
  }
}

function quitarRoomDeLaUrl() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('room')) return;
    u.searchParams.delete('room');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch {}
}

/** Sale del online: deja la sala, libera visor y mapa, saca las pantallas y vuelve al menú del juego. */
function cerrar() {
  if (!O) return;
  const o = O;
  O = null;
  clearInterval(o.timer);
  clearInterval(o.timerSalas);
  clearTimeout(o.timerLista);
  o.offPrefs?.();
  o.ro?.disconnect();
  try {
    o.online?.leave();
  } catch {}
  try {
    o.visor?.destruir();
  } catch {}
  try {
    o.mapa?.destruir();
  } catch {}
  for (const s of o.secciones) s.remove();
  c.alTeclado = null;
  document.documentElement.style.setProperty('--barra-h', '0px');
  c.volverAlMenu();
}

// ================================================================ utilidades de pantalla
/** Texto fijo que cambia con el idioma. */
function tx(nodo, clave, atributo = 'text') {
  const f = () => (atributo === 'text' ? (nodo.textContent = t(clave)) : nodo.setAttribute(atributo, t(clave)));
  O.tx.push(f);
  f();
  return nodo;
}

const NS_SVG = 'http://www.w3.org/2000/svg';
/** Ícono de 24×24 armado con el DOM (sin HTML dinámico): trazos `d` y círculos [cx, cy, r]. */
function icono(trazos, circulos = []) {
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of trazos) {
    const p = document.createElementNS(NS_SVG, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  for (const [cx, cy, r] of circulos) {
    const e = document.createElementNS(NS_SVG, 'circle');
    e.setAttribute('cx', cx);
    e.setAttribute('cy', cy);
    e.setAttribute('r', r);
    svg.append(e);
  }
  return svg;
}

function chip({ texto, activo, desactivado, sub, onclick, titulo }) {
  return el('button', { type: 'button', class: 'chip-op', 'aria-pressed': activo ? 'true' : 'false', disabled: desactivado, title: titulo, onclick }, el('span', { text: texto }), sub ? el('small', { text: sub }) : null);
}

function interruptor({ titulo, sub, activo, desactivado, onclick }) {
  return el(
    'button',
    { type: 'button', class: 'interruptor', role: 'switch', 'aria-checked': activo ? 'true' : 'false', disabled: desactivado, onclick },
    el('span', { class: 'int-t' }, el('b', { text: titulo }), el('small', { text: sub })),
    el('span', { class: 'int-p', 'aria-hidden': 'true' }),
  );
}

/** Aviso de red (no bloquea): conectando, despertando el servidor, reconectando o sin conexión con "Reintentar". */
function crearRed(clase = '') {
  const txt = el('span');
  const reintentar = el('button', { type: 'button', class: 'on-red-b', hidden: true, onclick: () => reintentarRed() });
  tx(reintentar, 'on_reintentarRed');
  const nodo = el('p', { class: `on-red ${clase}`.trim(), role: 'status', hidden: true }, txt, reintentar);
  O.reds.push({ nodo, txt, reintentar });
  return nodo;
}

function pintarRed() {
  const st = O.red;
  const texto = st && st !== 'open' ? netText(st) : '';
  for (const r of O.reds) {
    r.nodo.hidden = !texto;
    r.txt.textContent = texto;
    r.reintentar.hidden = st !== 'netError' && st !== 'rate';
  }
}

function reintentarRed() {
  if (!O) return;
  O.online.retry = 0;
  O.online.connect();
}

function alEstadoRed(st) {
  if (!O) return;
  O.red = st;
  pintarRed();
}

function irA(id, { juego = false } = {}) {
  O.pantalla = id;
  const pant = id === 'entrada' ? 'online' : `online-${id}`;
  c.pantalla(pant, { juego });
}

const nombreAmbito = (a) => (a === 'mundo' ? t('a_mundo') : a === 'latam' ? t('a_latam') : /^[a-z]{4,}$/.test(a) ? t(`c_${a}`) : c.nombrePais(a));
const nombreModo = (m) => t(m === 'famosos' ? 'm_famosos' : 'm_azar');
const textoTiempo = (s) => (s ? `${s} s` : t('sinLimite'));
const lang = () => c.lang();

// ================================================================ DOM
function construirDom() {
  const secciones = [crearEntrada(), crearLobby(), crearRonda(), crearRev(), crearFin()];
  c.$('app').append(...secciones);
  O.secciones = secciones;
}

// ---------------------------------------------------------------- entrada
function crearEntrada() {
  const R = O.R;
  R.invitacion = el('p', { class: 'on-invitacion', hidden: true });
  R.nombre = el('input', { id: 'on-nombre', type: 'text', maxlength: L.LARGO_NOMBRE, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go' });
  R.nombre.value = defaultName();
  R.bRapida = el('button', { type: 'button', class: 'on-grande primario', onclick: partidaRapida }, el('b'), el('small'));
  R.bCrear = el('button', { type: 'button', class: 'on-grande', onclick: crearPrivada }, el('b'), el('small'));
  const tx2 = (b, k1, k2) => {
    tx(b.children[0], k1);
    tx(b.children[1], k2);
  };
  tx2(R.bRapida, 'on_rapida', 'on_rapida_s');
  tx2(R.bCrear, 'on_crear', 'on_crear_s');
  R.codigo = el('input', { id: 'on-cod', type: 'text', maxlength: L.LARGO_CODIGO, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text', placeholder: 'ABCDE' });
  R.codigo.addEventListener('input', () => (R.codigo.value = L.normalizarCodigo(R.codigo.value)));
  R.bUnirse = tx(el('button', { type: 'submit', class: 'btn' }), 'on_unirse');
  R.salas = el('ul', { class: 'on-salas' });
  R.bActualizar = tx(el('button', { type: 'button', class: 'on-mini', onclick: () => pedirSalas(true) }), 'on_actualizar');
  R.err = el('p', { class: 'nota error', role: 'alert', hidden: true });
  R.buscando = el('p', { class: 'nota', role: 'status', hidden: true });
  const form = el(
    'form',
    { class: 'on-unir', onsubmit: (e) => (e.preventDefault(), unirseDesdeCampo()) },
    tx(el('label', { class: 'lbl', for: 'on-cod' }), 'on_codigo'),
    el('div', { class: 'on-fila' }, R.codigo, R.bUnirse),
  );
  const sec = el(
    'section',
    { class: 'pantalla', id: 'p-online', 'aria-labelledby': 'on-h' },
    el(
      'div',
      { class: 'centro' },
      el('header', { class: 'cab chica' }, tx(el('h2', { id: 'on-h', tabindex: '-1' }), 'on_titulo'), tx(el('p', { class: 'lema' }), 'on_sub')),
      R.invitacion,
      el(
        'div',
        { class: 'panel on-panel' },
        el('div', { class: 'grupo' }, tx(el('label', { class: 'lbl', for: 'on-nombre' }), 'on_nombre'), R.nombre),
        el('div', { class: 'on-grandes' }, R.bRapida, R.bCrear),
        form,
        R.buscando,
        R.err,
        crearRed(),
      ),
      el(
        'div',
        { class: 'panel on-panel' },
        el('div', { class: 'on-salas-cab' }, tx(el('span', { class: 'lbl' }), 'on_publicas'), R.bActualizar),
        R.salas,
      ),
      el('div', { class: 'acciones' }, tx(el('button', { type: 'button', class: 'btn', onclick: cerrar }), 'volver')),
    ),
  );
  return sec;
}

function miNombre() {
  const n = L.normalizarNombre(O.R.nombre.value, defaultName());
  O.R.nombre.value = n;
  saveName(n);
  return n;
}

function mostrarEntrada() {
  if (O.pantalla !== 'entrada') irA('entrada');
  pintarEntrada();
  pintarSalas();
}

function pintarEntrada() {
  const R = O.R;
  const ocupado = O.buscando || O.reanudando;
  R.invitacion.hidden = !O.invitacion;
  if (O.invitacion) {
    R.invitacion.textContent = t('on_invitado', { code: O.invitacion });
    if (!R.codigo.value) R.codigo.value = O.invitacion;
  }
  R.err.hidden = !O.err;
  R.err.textContent = O.err;
  R.buscando.hidden = !ocupado;
  R.buscando.textContent = O.reanudando ? t('on_volviendo') : t('on_buscando');
  for (const b of [R.bRapida, R.bCrear, R.bUnirse]) b.disabled = ocupado;
  R.bUnirse.textContent = O.invitacion && R.codigo.value === O.invitacion ? t('on_entrarSala') : t('on_unirse');
}

function pintarSalas() {
  const R = O.R;
  R.salas.replaceChildren();
  const lista = L.ordenarSalas(O.salas || []);
  if (!lista.length) {
    R.salas.append(el('li', { class: 'on-vacio', text: t('on_sinSalas') }));
    return;
  }
  for (const s of lista) {
    const estado = s.state === 'lobby' ? t('on_esperando') : t('on_enJuego', { r: s.round || 1, n: s.rounds || '?' });
    R.salas.append(
      el(
        'li',
        { class: 'on-sala' },
        el(
          'div',
          { class: 'on-sala-i' },
          el('b', { text: String(s.name || '—') }),
          el('small', { text: [nombreModo(s.mode), nombreAmbito(s.scope || 'mundo'), t('on_rondasN', { n: s.rounds }), textoTiempo(s.time)].join(' · ') }),
        ),
        el('span', { class: 'on-sala-n', text: `${s.n}/${s.max} · ${estado}` }),
        el('button', { type: 'button', class: 'btn', text: t('on_entrar'), onclick: () => unirse(s.code) }),
      ),
    );
  }
}

function pedirSalas(manual = false) {
  if (!O) return;
  if (manual) O.err = '';
  O.online.send({ t: 'list', game: JUEGO });
  clearInterval(O.timerSalas);
  O.timerSalas = setInterval(() => {
    if (O && O.pantalla === 'entrada' && !O.room && !document.hidden) O.online.send({ t: 'list', game: JUEGO });
  }, REFRESCO_SALAS_MS);
}

function partidaRapida() {
  O.err = '';
  const nombre = miNombre();
  O.quiere = { tipo: 'rapida', nombre };
  O.buscando = true;
  pintarEntrada();
  O.online.send({ t: 'list', game: JUEGO });
  clearTimeout(O.timerLista);
  O.timerLista = setTimeout(() => {
    if (!O?.quiere) return;
    O.quiere = null;
    O.buscando = false;
    O.err = netText('netError');
    pintarEntrada();
  }, ESPERA_LISTA_MS);
}

function crearPrivada() {
  O.err = '';
  O.buscando = true;
  pintarEntrada();
  O.online.create(miNombre());
}

function unirseDesdeCampo() {
  const code = L.normalizarCodigo(O.R.codigo.value);
  if (code.length !== L.LARGO_CODIGO) {
    O.err = t('on_codigoCorto');
    return pintarEntrada();
  }
  unirse(code);
}

function unirse(code) {
  O.err = '';
  O.buscando = true;
  if (O.pantalla !== 'entrada') mostrarEntrada();
  pintarEntrada();
  O.online.join(code, miNombre());
}

// ---------------------------------------------------------------- lobby
function crearLobby() {
  const R = O.R;
  R.lCodigo = el('button', { type: 'button', class: 'on-codigo', onclick: copiarCodigo });
  tx(R.lCodigo, 'on_copiarCodigo', 'title');
  tx(R.lCodigo, 'on_copiarCodigo', 'aria-label');
  R.lLink = el('button', { type: 'button', class: 'btn', onclick: compartir });
  R.lJugTit = el('span', { class: 'lbl' });
  R.lJug = el('ul', { class: 'on-jugadores' });
  R.lAjustes = el('div', { class: 'on-ajustes' });
  R.lEstado = el('p', { class: 'nota', role: 'status' });
  R.lEmpezar = tx(el('button', { type: 'button', class: 'btn primario', onclick: empezarPartida }), 'on_empezar');
  R.lSalir = tx(el('button', { type: 'button', class: 'btn', onclick: pedirSalida }), 'on_salirSala');
  return el(
    'section',
    { class: 'pantalla', id: 'p-online-lobby', 'aria-labelledby': 'on-lh' },
    el(
      'div',
      { class: 'centro' },
      el(
        'div',
        { class: 'on-lobby' },
        el(
          'div',
          { class: 'panel on-panel on-lobby-sala' },
          tx(el('h2', { id: 'on-lh', tabindex: '-1', class: 'on-sala-t' }), 'on_sala'),
          el('div', { class: 'on-codigo-caja' }, tx(el('span', { class: 'lbl' }), 'on_codigoSala'), R.lCodigo),
          R.lLink,
          R.lJugTit,
          R.lJug,
        ),
        el('div', { class: 'panel on-panel on-lobby-aj' }, tx(el('span', { class: 'lbl' }), 'on_ajustes'), R.lAjustes),
      ),
      crearRed(),
      R.lEstado,
      el('div', { class: 'acciones on-lobby-acc' }, R.lSalir, R.lEmpezar),
    ),
  );
}

function mostrarLobby(room) {
  if (O.pantalla !== 'lobby') {
    O.firmaJug = O.firmaAj = '';
    irA('lobby');
  }
  pintarLobby(room);
}

function pintarLobby(room) {
  const R = O.R;
  const soyAnfi = room.host === yo();
  const touch = c.esTactil() && !!navigator.share;
  R.lCodigo.textContent = room.code;
  R.lLink.textContent = t(touch ? 'on_compartir' : 'on_copiarLink');
  R.lJugTit.textContent = t('on_jugadores', { n: room.players.length, max: L.MAX_JUGADORES });

  const fJ = JSON.stringify([room.players.map((p) => [p.id, p.name, p.color, p.connected]), room.host, yo(), lang()]);
  if (fJ !== O.firmaJug) {
    O.firmaJug = fJ;
    R.lJug.replaceChildren(
      ...room.players.map((p) => {
        const etq = [p.id === yo() ? t('on_vos') : '', p.id === room.host ? t('on_anfitrion') : '', p.connected ? '' : t('on_sinConexion')].filter(Boolean).join(' · ');
        return el(
          'li',
          { class: 'on-jug', dataset: { conectado: p.connected ? '1' : '0', host: p.id === room.host ? '1' : '0' } },
          el('i', { class: 'on-pt', style: `background:${colorSeguro(p.color)}` }),
          el('span', { class: 'on-nom', text: p.name }),
          el('small', { class: 'on-et', text: etq }),
          soyAnfi && p.id !== yo() ? el('button', { type: 'button', class: 'on-mini', text: t('on_expulsar'), 'aria-label': t('on_expulsarA', { n: p.name }), onclick: () => O.online.send({ t: 'kick', id: p.id }) }) : null,
        );
      }),
    );
  }

  const fA = JSON.stringify([room.settings, soyAnfi, lang(), O.datos ? 1 : 0, O.busquedaPais]);
  if (fA !== O.firmaAj) {
    O.firmaAj = fA;
    const buscando = document.activeElement?.id === 'on-pais-q';
    const antes = buscando ? document.activeElement.selectionStart : 0;
    R.lAjustes.replaceChildren(...(soyAnfi ? ajustesAnfitrion(room.settings) : ajustesInvitado(room.settings)));
    if (buscando) {
      const q = R.lAjustes.querySelector('#on-pais-q');
      q?.focus();
      q?.setSelectionRange(antes, antes);
    }
  }

  const conectados = room.players.filter((p) => p.connected).length;
  R.lEmpezar.hidden = !soyAnfi;
  R.lEmpezar.disabled = conectados < 2;
  R.lEstado.textContent = conectados < 2 ? t('on_faltan') : soyAnfi ? '' : t('on_esperaAnfi');
  R.lEstado.classList.toggle('error', conectados < 2 && soyAnfi);
}

function cambiar(clave, valor) {
  const room = O.room;
  if (!room || room.host !== yo()) return;
  O.online.send({ t: 'settings', settings: L.cambiarAjuste(room.settings, clave, valor) });
  c.sfx.tone(520, 700, 0.05, { type: 'triangle', vol: 0.1 });
}

function grupo(titulo, ...hijos) {
  const id = `on-g-${Math.random().toString(36).slice(2, 7)}`;
  return el('div', { class: 'grupo' }, el('span', { class: 'lbl', id, text: titulo }), ...hijos.map((h) => (h.classList?.contains('chips') ? (h.setAttribute('aria-labelledby', id), h) : h)));
}

function ajustesAnfitrion(st) {
  const D = c.D;
  const clave = st.mode === 'famosos' ? 'famosos' : 'pais';
  const cuenta = (a) => (O.datos ? D.ambitoDisponible(O.datos, clave, a) : null);
  const modos = el('div', { class: 'chips', role: 'group' }, ...L.MODOS_ONLINE.map((m) => chip({ texto: nombreModo(m), activo: st.mode === m, onclick: () => cambiar('mode', m) })));
  const ambitos = el(
    'div',
    { class: 'chips', role: 'group' },
    ...L.ambitosVisibles(st.scope).map((a) => {
      const n = cuenta(a);
      const poco = n != null && n < st.rounds;
      return chip({ texto: nombreAmbito(a), activo: st.scope === a, desactivado: poco && st.scope !== a, sub: n == null ? '' : poco ? t('on_pocosLugares') : t('on_nLugares', { n: c.fmt(n) }), onclick: () => cambiar('scope', a) });
    }),
  );
  const buscador = el('div', { class: 'buscar' });
  if (O.datos) {
    const q = el('input', { id: 'on-pais-q', type: 'search', autocomplete: 'off', spellcheck: 'false', maxlength: '40', 'aria-label': t('otroPais'), placeholder: t('otroPais') });
    q.value = O.busquedaPais;
    q.addEventListener('input', () => {
      O.busquedaPais = q.value;
      pintarBuscadorPais(buscador, st);
    });
    buscador.append(q, el('div', { class: 'paises', role: 'listbox', hidden: true }));
    pintarBuscadorPais(buscador, st);
  }
  const rondas = el('div', { class: 'chips', role: 'group' }, ...L.RONDAS_ONLINE.map((n) => chip({ texto: String(n), activo: st.rounds === n, onclick: () => cambiar('rounds', n) })));
  const tiempos = el('div', { class: 'chips', role: 'group' }, ...L.TIEMPOS_ONLINE.map((s) => chip({ texto: textoTiempo(s), activo: st.time === s, onclick: () => cambiar('time', s) })));
  return [
    grupo(t('on_modo'), modos),
    grupo(t('donde'), ambitos, buscador),
    grupo(t('on_rondas'), rondas),
    grupo(t('tiempo'), tiempos),
    el(
      'div',
      { class: 'on-switches' },
      interruptor({ titulo: t('congelado'), sub: t('congelado_s'), activo: !!st.frozen, onclick: () => cambiar('frozen', !st.frozen) }),
      interruptor({ titulo: t('on_apurar'), sub: t('on_apurar_s'), activo: !!st.rush, onclick: () => cambiar('rush', !st.rush) }),
      interruptor({ titulo: t('on_publica'), sub: t('on_publica_s'), activo: !!st.public, onclick: () => cambiar('public', !st.public) }),
    ),
  ];
}

function pintarBuscadorPais(buscador, st) {
  const lista = buscador.querySelector('.paises');
  const q = O.busquedaPais.trim().toLowerCase();
  lista.replaceChildren();
  if (!q) return void (lista.hidden = true);
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const base = st.mode === 'famosos' ? O.datos.famosos : O.datos.mundo;
  const hallados = c.D.paisesDisponibles(base, O.datos.meta, { min: st.rounds })
    .map((p) => ({ ...p, nombre: c.nombrePais(p.cc) }))
    .filter((p) => norm(p.nombre).includes(norm(q)) || p.cc.toLowerCase() === q);
  lista.hidden = false;
  if (!hallados.length) return void lista.append(el('p', { class: 'nota', text: t('sinPaises') }));
  for (const p of hallados.slice(0, 8)) {
    lista.append(
      el(
        'button',
        {
          type: 'button',
          role: 'option',
          class: 'pais-op',
          onclick: () => {
            O.busquedaPais = '';
            cambiar('scope', p.cc);
          },
        },
        el('span', { text: p.nombre }),
        el('small', { text: t('on_nLugares', { n: c.fmt(p.n) }) }),
      ),
    );
  }
}

function ajustesInvitado(st) {
  const pill = (txt) => el('li', { class: 'on-pill', text: txt });
  return [
    el('p', { class: 'nota', text: t('on_soloAnfi') }),
    el(
      'ul',
      { class: 'on-pills' },
      pill(nombreModo(st.mode)),
      pill(nombreAmbito(st.scope)),
      pill(t('on_rondasN', { n: st.rounds })),
      pill(textoTiempo(st.time)),
      st.frozen ? pill(t('congelado')) : null,
      st.rush ? pill(t('on_apurar')) : null,
      pill(t(st.public ? 'on_publicaV' : 'on_privadaV')),
    ),
  ];
}

function empezarPartida() {
  if (O.room?.host !== yo()) return;
  c.sfx.notes([660, 880], { step: 0.08, dur: 0.14, vol: 0.12 });
  O.online.send({ t: 'start' });
}

async function compartir() {
  const code = O.room?.code;
  if (!code) return;
  const r = await share(JUEGO, code);
  if (!O) return;
  if (r === 'copied') c.toast(t('on_linkCopiado'));
  else if (r === 'shared') c.toast(t('on_linkCompartido'));
  else c.toast(t('on_linkNo', { url: shareLink(JUEGO, code) }), 8000);
}

async function copiarCodigo() {
  const code = O.room?.code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    c.toast(t('copiado'));
  } catch {
    c.toast(code);
  }
}

// ---------------------------------------------------------------- ronda
function crearRonda() {
  const R = O.R;
  R.hudRonda = el('span', { class: 'chip' });
  R.hudReloj = el('span', { class: 'chip', hidden: true });
  R.hudPuntos = el('span', { class: 'chip' });
  R.hudCong = tx(el('span', { class: 'chip frio', hidden: true }), 'congelado');
  R.hudApurar = el('span', { class: 'chip frio', hidden: true, text: '' });
  R.bNoCarga = el(
    'button',
    { type: 'button', class: 'herr-b', hidden: true, onclick: pedirOtraUbicacion },
    icono(['M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 .900-1 1.700M12 17h.01'], [[12, 12, 9]]),
    el('span'),
    el('b', { class: 'on-n' }),
  );
  R.bSalirR = el('button', { type: 'button', class: 'herr-b', onclick: pedirSalida }, icono(['M9 4H5v16h4M16 8l4 4-4 4M20 12H9']), el('span'));
  tx(R.bSalirR.querySelector('span'), 'b_salir');
  tx(R.bSalirR, 'b_salir_t', 'title');
  tx(R.bSalirR, 'b_salir', 'aria-label');
  R.barra = el('div', { class: 'barra', id: 'on-barra' }, el('div', { class: 'hud' }, R.hudRonda, R.hudReloj, R.hudPuntos, R.hudCong, R.hudApurar, crearRed('on-red-chip')), el('div', { class: 'herr' }, R.bNoCarga, R.bSalirR));
  R.quien = el('ul', { class: 'on-quien', 'aria-label': '' });
  tx(R.quien, 'on_quienJuega', 'aria-label');

  // minimapa (mismas clases que el de un jugador: viven en style.css)
  R.dockToggle = el('button', { type: 'button', class: 'dock-b', onclick: () => abrirMapa(!O.mapaFijo) });
  R.dockAbrir = el('button', { type: 'button', class: 'dock-abrir', onclick: () => abrirMapa(true) }, el('span', { class: 'dock-abrir-i', 'aria-hidden': 'true', text: '⤢' }));
  tx(R.dockAbrir, 'mapa_abrir', 'aria-label');
  R.dockCentro = el('button', { type: 'button', class: 'dock-centro', onclick: () => (O.mapa?.ponerPinEnCentro(), c.sfx.tone(700, 520, 0.05, { vol: 0.1 })) }, icono(['M12 3v5M12 16v5M3 12h5M16 12h5'], [[12, 12, 2]]));
  tx(R.dockCentro, 'mapa_centro', 'aria-label');
  tx(R.dockCentro, 'mapa_centro', 'title');
  R.slotMapa = el('div', { class: 'dock-mapa' }, R.dockAbrir, R.dockCentro);
  R.adivinar = el('button', { type: 'button', class: 'adivinar', onclick: () => adivinar() });
  R.dock = el('div', { class: 'dock', id: 'on-dock', dataset: { estado: 'mini', fijo: '0', pin: '0' } }, el('div', { class: 'dock-cab' }, tx(el('span', { class: 'dock-t' }), 'mapa'), R.dockToggle), R.slotMapa, R.adivinar);
  R.dock.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(O.hoverT);
    O.mapaHover = true;
    pintarDock();
  });
  R.dock.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    const soltar = () => {
      clearTimeout(O.hoverT);
      O.hoverT = setTimeout(() => {
        if (!O || R.dock.matches(':hover')) return;
        O.mapaHover = false;
        pintarDock();
      }, 450);
    };
    if (e.buttons) addEventListener('pointerup', soltar, { once: true });
    else soltar();
  });

  R.visorHost = el('div', { class: 'visor-host' });
  R.aviso = el('div', { class: 'on-banner', hidden: true, role: 'status' }, el('b'), el('span'));
  R.sec = el('section', { class: 'pantalla ronda', id: 'p-online-ronda', tabindex: '-1' }, R.barra, R.quien, R.dock, R.visorHost, R.aviso);
  tx(R.sec, 'r_aria', 'aria-label');
  // con el mouse o el dedo el botón suelta el foco: así Espacio/Enter vuelven a significar "adivinar"
  R.sec.addEventListener('click', (e) => {
    const b = e.target.closest?.('button');
    if (b && e.detail > 0 && b !== R.adivinar) {
      b.blur();
      R.sec.focus({ preventScroll: true });
    }
  });
  // la barra de arriba puede ocupar una o dos filas: el toast y el panel del mapa se ubican debajo
  O.ro = new ResizeObserver(() => {
    if (O.pantalla === 'ronda') document.documentElement.style.setProperty('--barra-h', `${R.barra.offsetHeight}px`);
  });
  O.ro.observe(R.barra);
  return R.sec;
}

function asegurarVisor() {
  if (!O.visor) O.visor = c.crearVisor(O.R.visorHost);
}

function asegurarMapa() {
  if (!O.mapa) {
    O.mapaEl = el('div', { class: 'mapa-ancla' });
    O.mapa = c.crearMapa(O.mapaEl);
    O.mapa.on('pin', () => pintarDock());
  }
}

function colocarMapa(slot) {
  asegurarMapa();
  if (O.mapaEl.parentElement !== slot) slot.append(O.mapaEl);
  requestAnimationFrame(() => O.mapa?.redimensionar());
}

function mostrarRonda(room) {
  const tm = room.tm;
  const juega = L.juegaEnRonda(tm, yo());
  if (O.pantalla !== 'ronda') {
    O.clave = '';
    O.ultSeg = null;
    irA('ronda', { juego: juega });
    document.documentElement.style.setProperty('--barra-h', `${O.R.barra.offsetHeight}px`);
  }
  c.G.gameplay(juega);
  asegurarVisor();
  if (L.claveRonda(tm) !== O.clave) cargarUbicacion(tm, juega);
  if (O.mine && O.mine.round === tm.round) aplicarMine();
  pintarRonda(room);
}

function cargarUbicacion(tm, juega) {
  const R = O.R;
  O.clave = L.claveRonda(tm);
  O.confirmado = tm.done.includes(yo());
  O.mapaFijo = false;
  O.mapaHover = false;
  O.ultSeg = null;
  O.visor.lang = lang();
  O.visor.titulo = t('visorTitulo');
  O.visor.mostrar({ lat: tm.loc.lat, lng: tm.loc.lng, heading: tm.loc.h, frozen: !!tm.frozen, lang: lang() });
  if (!juega) return; // quien entró tarde mira la ronda: sin mapa para marcar
  colocarMapa(R.slotMapa);
  const m = O.mapa;
  m.limpiarRevelacion();
  m.limpiarPistas();
  m.limpiarPin();
  m.permitirPin(juega && !O.confirmado);
  m.mostrarAtribucion(false);
  m.encuadrar(null);
  if (tm.scope !== 'mundo') {
    const clave = O.clave;
    c.cargarDatos()
      .then((d) => {
        if (O && O.clave === clave && !m.pin) m.encuadrar(c.D.limitesAmbito([...d.mundo, ...d.famosos], tm.scope, d.meta));
      })
      .catch(() => {});
  }
}

/** Restaura el pin que ya confirmé (mensaje 'mine' al volver con el token). */
function aplicarMine() {
  const mine = O.mine;
  const tm = O.room?.tm;
  if (!mine || !tm || tm.phase !== 'look' || mine.round !== tm.round || !O.mapa) return;
  O.mine = null;
  O.confirmado = true;
  const m = O.mapa;
  m.listo.then(() => {
    if (!O || !O.mapa || O.mapa !== m) return;
    m.ponerPin(mine.lat, mine.lng);
    m.permitirPin(false);
    pintarDock();
  });
  pintarDock();
}

function pintarRonda(room) {
  const R = O.R;
  const tm = room.tm;
  const juega = L.juegaEnRonda(tm, yo());
  R.hudRonda.textContent = t('ronda', { n: tm.round, total: tm.rounds });
  R.hudPuntos.textContent = `★ ${c.fmt(tm.scores?.[yo()] || 0)}`;
  R.hudCong.hidden = !tm.frozen;
  R.hudApurar.hidden = !tm.rush;
  R.hudApurar.textContent = `⚡ ${t('on_apurarChip')}`;
  pintarReloj(tm, ahora());
  pintarQuien(room);
  pintarNoCarga(room, ahora());
  R.dock.hidden = !juega;
  R.aviso.hidden = juega;
  if (!juega) {
    R.aviso.children[0].textContent = t('on_entrasProxima');
    R.aviso.children[1].textContent = t('on_entrasProxima_s');
  }
  pintarDock();
}

function pintarReloj(tm, ahoraMs) {
  const R = O.R;
  const visible = L.relojVisible(tm, ahoraMs);
  R.hudReloj.hidden = !visible;
  if (!visible) return;
  const seg = L.segundos(L.restanteMs(tm.t1, ahoraMs));
  const txt = `⏱ ${L.formatoReloj(seg)}`;
  if (R.hudReloj.textContent !== txt) {
    R.hudReloj.textContent = txt;
    R.hudReloj.setAttribute('aria-label', t('on_relojAria', { t: L.formatoReloj(seg) }));
  }
  R.hudReloj.classList.toggle('urge', seg <= 10);
  if (O.ultSeg !== seg) {
    if (O.ultSeg != null && seg <= 5 && seg > 0 && L.juegaEnRonda(tm, yo())) c.sfx.tone(880, 880, 0.05, { type: 'square', vol: 0.06 });
    O.ultSeg = seg;
  }
}

function pintarQuien(room) {
  const R = O.R;
  const lista = L.quienConfirmo(room.tm, room.players);
  const firma = JSON.stringify([lista.map((p) => [p.id, p.name, p.color, p.connected, p.listo]), yo(), lang()]);
  if (firma === O.firmaQuien) return;
  O.firmaQuien = firma;
  R.quien.replaceChildren(
    ...lista.map((p) =>
      el(
        'li',
        { class: 'chip on-q', dataset: { listo: p.listo ? '1' : '0', conectado: p.connected ? '1' : '0', yo: p.id === yo() ? '1' : '0' }, style: `--pc:${colorSeguro(p.color)}`, title: p.name, 'aria-label': `${t(p.listo ? 'on_confirmo' : 'on_noConfirmo', { n: p.name })}${p.id === yo() ? ` (${t('on_vos')})` : ''}` },
        el('i', { class: 'on-pt' }),
        el('span', { class: 'on-qn', text: p.name }),
        el('b', { class: 'on-ok', text: p.listo ? '✓' : '', 'aria-hidden': 'true' }),
      ),
    ),
  );
}

function pintarNoCarga(room, ahoraMs) {
  const R = O.R;
  const e = L.estadoNoImg(room.tm, yo(), ahoraMs, room.players);
  R.bNoCarga.hidden = !e.visible;
  if (!e.visible) return;
  R.bNoCarga.disabled = e.yaPedi;
  R.bNoCarga.children[1].textContent = t(e.yaPedi ? 'on_nocargaPedido' : 'b_nocarga');
  R.bNoCarga.children[2].textContent = `${e.pedidos}/${e.necesarios}`;
  const tit = t('on_nocargaTit', { a: e.pedidos, b: e.necesarios });
  R.bNoCarga.title = tit;
  R.bNoCarga.setAttribute('aria-label', `${t('b_nocarga')} ${e.pedidos}/${e.necesarios}`);
}

function pedirOtraUbicacion() {
  const room = O.room;
  if (!room || room.tm?.phase !== 'look') return;
  const e = L.estadoNoImg(room.tm, yo(), ahora(), room.players);
  if (!e.visible || e.yaPedi) return;
  O.online.send({ t: 'noimg' });
  c.toast(t('on_nocargaPedidoMsg'), 3600);
}

// ---------------------------------------------------------------- minimapa y adivinar
function abrirMapa(si = true) {
  O.mapaFijo = si;
  if (!si) O.mapaHover = false;
  pintarDock();
}

function pintarDock() {
  if (!O || !O.R.dock) return;
  const R = O.R;
  const tm = O.room?.tm;
  const pin = O.mapa?.pin || null;
  const grande = O.mapaFijo || O.mapaHover;
  R.dock.dataset.estado = grande ? 'grande' : 'mini';
  R.dock.dataset.fijo = O.mapaFijo ? '1' : '0';
  R.dock.dataset.pin = pin && !O.confirmado ? '1' : '0';
  R.dockToggle.textContent = O.mapaFijo ? t('mapa_cerrar') : t('mapa_fijar');
  R.dockToggle.setAttribute('aria-pressed', O.mapaFijo ? 'true' : 'false');
  R.dockAbrir.hidden = grande;
  R.dockCentro.hidden = O.confirmado;
  if (O.confirmado) {
    const juegan = tm ? L.quienConfirmo(tm, O.room.players).filter((p) => p.connected || p.id === yo()) : [];
    const hechos = juegan.filter((p) => p.listo || p.id === yo()).length;
    R.adivinar.textContent = t('on_espera', { a: hechos, b: Math.max(hechos, juegan.length) });
    R.adivinar.disabled = true;
  } else {
    R.adivinar.textContent = pin ? t('adivinar') : t('marcaElMapa');
    R.adivinar.disabled = !pin;
  }
}

function adivinar(auto = false) {
  const tm = O.room?.tm;
  if (!tm || tm.phase !== 'look' || O.pantalla !== 'ronda' || O.confirmado || !L.juegaEnRonda(tm, yo())) return;
  const pin = O.mapa?.pin;
  if (!pin) {
    if (auto) return;
    abrirMapa(true);
    return c.toast(t('marcaPrimero'));
  }
  O.confirmado = true;
  O.enviadoEn = Date.now();
  O.mapa.permitirPin(false);
  O.online.send({ t: 'guess', lat: pin.lat, lng: pin.lng });
  O.mapaFijo = false;
  O.mapaHover = false;
  c.sfx.tone(700, 520, 0.05, { vol: 0.1 });
  pintarDock();
}

// ---------------------------------------------------------------- revelación
function crearRev() {
  const R = O.R;
  R.slotRev = el('div', { class: 'res-mapa' });
  R.revRonda = el('p', { class: 'kicker' });
  R.revTitulo = el('h2', { tabindex: '-1' });
  R.revCuenta = el('p', { class: 'on-cuenta', role: 'timer' });
  R.revTabla = el('ol', { class: 'on-tabla', 'aria-label': '' });
  tx(R.revTabla, 'on_tablaAria', 'aria-label');
  R.revSig = el('button', { type: 'button', class: 'btn primario', onclick: siguienteRonda });
  R.revNota = el('p', { class: 'nota', hidden: true });
  R.revSalir = tx(el('button', { type: 'button', class: 'btn', onclick: pedirSalida }), 'on_salir');
  return el(
    'section',
    { class: 'pantalla', id: 'p-online-rev', 'aria-labelledby': 'on-rev-h' },
    el('div', { class: 'res' }, R.slotRev, el('div', { class: 'res-info' }, R.revRonda, R.revTitulo, R.revCuenta, R.revTabla, R.revNota, crearRed(), el('div', { class: 'acciones' }, R.revSalir, R.revSig))),
  );
}

function mostrarRev(room) {
  if (O.pantalla !== 'rev') {
    O.revClave = '';
    O.revDesde = Date.now();
    O.visor?.ocultar();
    irA('rev');
    O.R.revTitulo.id = 'on-rev-h';
    colocarMapa(O.R.slotRev);
  }
  pintarRev(room);
}

function pintarRev(room) {
  const R = O.R;
  const tm = room.tm;
  const res = tm.reveal;
  if (!res) return;
  const ultima = tm.round >= tm.rounds;
  const soyAnfi = room.host === yo();
  R.revRonda.textContent = t('ronda', { n: tm.round, total: tm.rounds });
  R.revTitulo.textContent = c.nombreLugar(res.place);
  const filas = L.tablaRevelacion(tm, room.players, yo());
  R.revTabla.replaceChildren(
    el('li', { class: 'on-fila-t on-cab-t', 'aria-hidden': 'true' }, el('span'), el('span'), el('span', { text: t('on_distancia') }), el('span', { text: t('on_ptsRonda') }), el('span', { text: t('on_total') })),
    ...filas.map((f) =>
      el(
        'li',
        { class: 'on-fila-t', dataset: { yo: f.yo ? '1' : '0', conectado: f.connected ? '1' : '0' }, style: `--pc:${colorSeguro(f.color)}` },
        el('span', { class: 'on-puesto', text: String(f.puesto) }),
        el('span', { class: 'on-nom' }, el('i', { class: 'on-pt' }), el('span', { text: f.yo ? `${f.name} (${t('on_vos')})` : f.name })),
        el('span', { class: 'on-dist', text: f.sinPin ? t('on_sinPin') : c.fmtDist(f.km) }),
        el('b', { class: 'on-pts', text: `+${c.fmt(f.pts)}` }),
        el('span', { class: 'on-tot', text: c.fmt(f.total) }),
      ),
    ),
  );
  R.revSig.textContent = t(ultima ? 'on_verPodio' : 'siguiente');
  R.revSig.setAttribute('aria-keyshortcuts', 'N Enter');
  R.revSig.hidden = !soyAnfi;
  R.revNota.hidden = soyAnfi;
  R.revNota.textContent = t('on_soloAnfiSig');
  pintarCuentaRev(tm, ahora());
  const clave = `${tm.round}.${tm.swaps}`;
  if (clave !== O.revClave) {
    O.revClave = clave;
    const mia = filas.find((f) => f.yo);
    if (mia) sonidoResultado(mia);
    const m = O.mapa;
    const datos = { real: res.place, adivinanzas: L.pinsRevelacion(res.results, room.players, yo(), t('on_vos')), etiquetaReal: L.nombreCortoLugar(res.place, lang(), c.nombrePais), animar: true };
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!O || O.mapa !== m || O.pantalla !== 'rev') return;
        m.redimensionar();
        m.limpiarPistas();
        m.revelar(datos);
        m.mostrarAtribucion(true);
      }),
    );
  }
}

function pintarCuentaRev(tm, ahoraMs) {
  const s = L.segundos(L.restanteMs(tm.t1, ahoraMs));
  const txt = t(tm.round >= tm.rounds ? 'on_podioEn' : 'on_siguienteEn', { s });
  if (O.R.revCuenta.textContent !== txt) O.R.revCuenta.textContent = txt;
}

function sonidoResultado(f) {
  if (f.sinPin) return c.sfx.tone(300, 150, 0.4, { type: 'sawtooth', vol: 0.1 });
  if (f.pts >= 4000) c.sfx.notes([660, 880, 1320], { step: 0.09, dur: 0.22, vol: 0.14 });
  else if (f.pts >= 1500) c.sfx.notes([523, 659], { step: 0.1, dur: 0.2, vol: 0.12 });
  else c.sfx.tone(260, 180, 0.3, { type: 'triangle', vol: 0.12 });
}

function siguienteRonda() {
  const room = O.room;
  if (!room || room.host !== yo() || room.tm?.phase !== 'reveal') return;
  if (Date.now() - (O.revDesde || 0) < 500) return; // contra dobles toques
  O.online.send({ t: 'next' });
}

// ---------------------------------------------------------------- final
function crearFin() {
  const R = O.R;
  R.slotFin = el('div', { class: 'res-mapa' });
  R.finKicker = el('p', { class: 'kicker' });
  R.finTitulo = tx(el('h2', { tabindex: '-1', id: 'on-fin-h' }), 'on_finTitulo');
  R.finGanador = el('p', { class: 'on-ganador' });
  R.finPodio = el('div', { class: 'on-podio', role: 'list' });
  R.finRank = el('ol', { class: 'on-tabla on-rank' });
  R.finRondas = el('div', { class: 'chips on-rondas', role: 'group', hidden: true });
  R.finVerMapa = el('button', { type: 'button', class: 'btn', onclick: alternarMapaFin });
  R.finOtra = el('button', { type: 'button', class: 'btn primario', onclick: revancha });
  R.finNota = el('p', { class: 'nota', hidden: true });
  R.finSalir = tx(el('button', { type: 'button', class: 'btn', onclick: pedirSalida }), 'on_salir');
  R.finSec = el(
    'section',
    { class: 'pantalla', id: 'p-online-fin', 'aria-labelledby': 'on-fin-h', dataset: { mapa: '0' } },
    el('div', { class: 'res' }, R.slotFin, el('div', { class: 'res-info' }, R.finKicker, R.finTitulo, R.finGanador, R.finPodio, R.finRank, R.finRondas, R.finNota, crearRed(), el('div', { class: 'acciones' }, R.finSalir, R.finVerMapa, R.finOtra))),
  );
  return R.finSec;
}

function mostrarFin(room) {
  if (O.pantalla !== 'fin') {
    O.visor?.ocultar();
    O.finRonda = 0;
    O.finMapa = matchMedia('(min-width: 701px) and (min-aspect-ratio: 1/1)').matches;
    irA('fin');
    colocarMapa(O.R.slotFin);
    c.sfx.notes([523, 659, 784, 1047], { step: 0.1, dur: 0.25, vol: 0.14 });
    O.firmaFin = '';
  }
  pintarFin(room);
}

function pintarFin(room) {
  const R = O.R;
  const tm = room.tm;
  const ranking = L.rankingFinal(tm.ranking, yo());
  const soyAnfi = room.host === yo();
  R.finKicker.textContent = `${nombreModo(tm.mode)} · ${nombreAmbito(tm.scope)}`;
  const ganan = L.ganadores(tm.ranking);
  R.finGanador.textContent = ganan.length === 1 ? t('on_ganador', { n: ganan[0].name }) : ganan.length ? t('on_ganadores', { n: ganan.map((g) => g.name).join(', ') }) : '';
  R.finPodio.replaceChildren(
    ...L.podio(tm.ranking, yo()).map((p) =>
      el(
        'div',
        { class: 'on-esc', role: 'listitem', dataset: { puesto: String(p.puesto), yo: p.yo ? '1' : '0' }, style: `--pc:${colorSeguro(p.color)}` },
        el('span', { class: 'on-esc-n', text: p.yo ? `${p.name} (${t('on_vos')})` : p.name }),
        el('b', { class: 'on-esc-p', text: c.fmt(p.pts) }),
        el('div', { class: 'on-esc-b' }, el('span', { text: String(p.puesto) })),
      ),
    ),
  );
  R.finRank.replaceChildren(
    ...ranking.map((r) =>
      el(
        'li',
        { class: 'on-fila-t on-fila-r', dataset: { yo: r.yo ? '1' : '0' }, style: `--pc:${colorSeguro(r.color)}` },
        el('span', { class: 'on-puesto', text: String(r.puesto) }),
        el('span', { class: 'on-nom' }, el('i', { class: 'on-pt' }), el('span', { text: r.yo ? `${r.name} (${t('on_vos')})` : r.name })),
        el('b', { class: 'on-pts', text: c.fmt(r.pts) }),
      ),
    ),
  );
  R.finOtra.hidden = !soyAnfi;
  R.finOtra.textContent = t('on_otra');
  R.finNota.hidden = soyAnfi;
  R.finNota.textContent = t('on_esperaOtra');
  pintarControlesMapaFin(tm);
  const firma = JSON.stringify([O.finMapa, O.finRonda, tm.history?.length]);
  if (firma !== O.firmaFin) {
    O.firmaFin = firma;
    dibujarMapaFin(room);
  }
}

function pintarControlesMapaFin(tm) {
  const R = O.R;
  R.finSec.dataset.mapa = O.finMapa ? '1' : '0';
  R.finVerMapa.textContent = t(O.finMapa ? 'on_ocultarMapa' : 'on_verMapa');
  R.finVerMapa.setAttribute('aria-pressed', O.finMapa ? 'true' : 'false');
  R.finRondas.hidden = !O.finMapa || !tm.history?.length;
  if (R.finRondas.hidden) return;
  const botones = [chip({ texto: t('on_todas'), activo: O.finRonda === 0, titulo: t('on_verTodas'), onclick: () => elegirRondaFin(0) })];
  for (const h of tm.history) botones.push(chip({ texto: String(h.round), activo: O.finRonda === h.round, titulo: t('on_verRonda', { n: h.round }), onclick: () => elegirRondaFin(h.round) }));
  R.finRondas.replaceChildren(...botones);
}

function alternarMapaFin() {
  O.finMapa = !O.finMapa;
  if (O.room?.tm) pintarFin(O.room);
  requestAnimationFrame(() => O.mapa?.redimensionar());
}

function elegirRondaFin(n) {
  O.finRonda = n;
  if (O.room?.tm) pintarFin(O.room);
}

function dibujarMapaFin(room) {
  const tm = room.tm;
  const m = O.mapa;
  if (!O.finMapa || !m) return;
  const quienes = (tm.ranking || []).map((r) => ({ id: r.id, name: r.name, color: r.color }));
  const h = tm.history?.find((x) => x.round === O.finRonda);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!O || O.mapa !== m || O.pantalla !== 'fin') return;
      m.redimensionar();
      m.limpiarPistas();
      if (h) m.revelar({ real: h.place, adivinanzas: L.pinsRevelacion(h.results, quienes, yo(), t('on_vos')), etiquetaReal: L.nombreCortoLugar(h.place, lang(), c.nombrePais), animar: true });
      else m.resumen(L.rondasParaMapa(tm.history, yo()));
      m.mostrarAtribucion(true);
    }),
  );
}

function revancha() {
  if (O.room?.host !== yo() || O.room.state !== 'finished') return;
  O.online.send({ t: 'rematch' });
}

// ================================================================ mensajes del servidor
function mostrarSegunEstado() {
  if (O.room) alRoom(O.room);
  else mostrarEntrada();
}

function alRoom(room) {
  if (!O) return;
  O.room = room;
  O.buscando = false;
  O.reanudando = false;
  O.quiere = null;
  clearTimeout(O.timerLista);
  O.err = '';
  const tm = room.tm;
  if (O.pendientePublica && room.host === yo() && room.state === 'lobby') {
    O.pendientePublica = false;
    if (!room.settings.public) O.online.send({ t: 'settings', settings: L.cambiarAjuste(room.settings, 'public', true) });
  }
  if (room.state === 'lobby') return mostrarLobby(room);
  if (room.state === 'playing' && tm) {
    if (tm.phase === 'look') return mostrarRonda(room);
    if (tm.phase === 'reveal') return mostrarRev(room);
  }
  if (tm && (room.state === 'finished' || tm.phase === 'end')) return mostrarFin(room);
  mostrarLobby(room);
}

function alMensaje(m) {
  if (!O) return;
  switch (m.t) {
    case 'list':
      O.salas = Array.isArray(m.rooms) ? m.rooms : [];
      if (O.quiere?.tipo === 'rapida') {
        const { nombre } = O.quiere;
        O.quiere = null;
        clearTimeout(O.timerLista);
        const sala = L.elegirSalaRapida(O.salas);
        if (sala) O.online.join(sala.code, nombre);
        else {
          O.pendientePublica = true;
          O.online.create(nombre);
        }
      }
      if (O.pantalla === 'entrada') {
        pintarSalas();
        pintarEntrada();
      }
      break;
    case 'swap':
      O.mapa?.limpiarPin();
      O.confirmado = false;
      c.toast(t('on_swap'), 3600);
      c.sfx.notes([440, 660], { step: 0.08, dur: 0.12, vol: 0.1 });
      break;
    case 'mine':
      O.mine = { round: m.round, lat: m.lat, lng: m.lng };
      if (O.pantalla === 'ronda') aplicarMine();
      break;
    case 'error':
      return alError(m.code);
    case 'closed':
      return volverALaEntrada(netText(`closed_${m.reason}`));
    case 'kicked':
      return volverALaEntrada(netText('kicked'));
    default:
      break;
  }
}

function textoError(code) {
  const propio = L.ERRORES_PROPIOS[code];
  if (propio) return t(propio);
  const n = netText(code);
  return n === code ? t('on_errorGen') : n;
}

function alError(code) {
  O.buscando = false;
  O.reanudando = false;
  O.quiere = null;
  clearTimeout(O.timerLista);
  O.pendientePublica = false;
  const txt = textoError(code);
  if (O.pantalla === 'entrada' || !O.room) {
    O.err = txt;
    if (O.pantalla !== 'entrada') irA('entrada');
    pintarEntrada();
    if (code === 'not_found' || code === 'in_progress' || code === 'room_full') O.online.send({ t: 'list', game: JUEGO });
  } else c.toast(txt, 4200);
}

/** La sala se cerró o me expulsaron: se avisa y se vuelve a la entrada (desde ahí se puede volver al menú). */
function volverALaEntrada(txt) {
  O.room = null;
  O.mine = null;
  O.confirmado = false;
  O.visor?.ocultar();
  O.err = txt;
  O.buscando = false;
  O.reanudando = false;
  O.clave = '';
  mostrarEntrada();
  pedirSalas();
}

// ================================================================ reloj y teclado
function tick() {
  if (!O || !O.room?.tm) return;
  const tm = O.room.tm;
  const a = ahora();
  if (O.pantalla === 'ronda' && tm.phase === 'look') {
    pintarReloj(tm, a);
    pintarNoCarga(O.room, a);
    if (L.debeAutoEnviar(tm, yo(), a, { tengoPin: !!O.mapa?.pin, confirmado: O.confirmado })) adivinar(true);
    // el servidor no tomó mi pin (por ejemplo, un mensaje perdido): se puede volver a marcar
    if (O.confirmado && !tm.done.includes(yo()) && Date.now() - O.enviadoEn > DESBLOQUEO_MS && O.online.ws?.readyState === 1 && L.juegaEnRonda(tm, yo())) {
      O.confirmado = false;
      O.mapa?.permitirPin(true);
      pintarDock();
    }
  } else if (O.pantalla === 'rev' && tm.phase === 'reveal') {
    pintarCuentaRev(tm, a);
  }
}

function alTeclado(e) {
  if (!O) return false;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const enBoton = tag === 'BUTTON' || tag === 'A';
  const activar = (e.code === 'Space' || e.key === 'Enter') && !enBoton;
  const manejado = () => (e.preventDefault(), true);
  switch (O.pantalla) {
    case 'entrada':
      if (e.key === 'Escape') {
        cerrar();
        return true;
      }
      return false;
    case 'ronda': {
      const juega = L.juegaEnRonda(O.room?.tm, yo());
      if (e.key === 'Escape') {
        if (O.mapaFijo) abrirMapa(false);
        else pedirSalida();
        return manejado();
      }
      if (!juega) return false;
      if (activar) {
        if (!e.repeat) adivinar();
        return manejado();
      }
      if (k === 'm') {
        if (!e.repeat) abrirMapa(!O.mapaFijo);
        return manejado();
      }
      return false;
    }
    case 'rev':
      if (e.key === 'Escape') {
        pedirSalida();
        return manejado();
      }
      if (k === 'n' || activar) {
        if (!e.repeat && O.room?.host === yo()) siguienteRonda();
        return manejado();
      }
      return false;
    case 'fin':
      if (k === 'n' && O.room?.host === yo()) {
        if (!e.repeat) revancha();
        return manejado();
      }
      return false;
    default:
      return false;
  }
}

// ================================================================ salir y cambios de preferencias
async function pedirSalida() {
  if (!O) return;
  const enPartida = O.pantalla === 'ronda' || O.pantalla === 'rev';
  if (enPartida) {
    const si = await c.dialogo({
      titulo: t('on_salirTitulo'),
      texto: t('on_salirTexto'),
      cancelar: false,
      botones: [
        { texto: t('seguir'), primario: true, valor: false },
        { texto: t('on_salirSala'), valor: true },
      ],
    });
    if (!si || !O) return;
  }
  cerrar();
}

function alCambiarPrefs() {
  if (!O) return;
  for (const f of O.tx) f();
  O.firmaJug = O.firmaAj = O.firmaQuien = O.firmaFin = '';
  if (O.visor) O.visor.lang = lang();
  if (O.mapa) {
    O.mapa.cambiarTema(c.G.prefs.theme);
    O.mapa.cambiarIdioma(lang());
    O.mapa.ponerTextos({ error: t('mapaError'), reintentar: t('reintentar'), etiqueta: t('mapaEtiqueta'), centro: t('mapa_centro') });
  }
  pintarEntrada();
  pintarSalas();
  if (O.room) {
    if (O.pantalla === 'lobby') pintarLobby(O.room);
    else if (O.pantalla === 'ronda') pintarRonda(O.room);
    else if (O.pantalla === 'rev') pintarRev(O.room);
    else if (O.pantalla === 'fin') pintarFin(O.room);
  }
  pintarRed();
}

// ================================================================ solo para pruebas desde la consola/Playwright
export const _debug = {
  get estado() {
    return O;
  },
};
