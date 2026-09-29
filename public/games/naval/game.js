/* Batalla Naval — game.it
 * Contra la compu (tres niveles) u online 1 contra 1. Las reglas (shared/rules.js) son las mismas en el
 * navegador y en el servidor; acá se ubica la flota, se apunta y se animan los resultados en orden:
 * cada jugada llega como un resultado (celdas que cambiaron, barcos hundidos) y se muestra recién cuando
 * el disparo cae, así lo que se ve nunca se adelanta a la animación.
 */
import { MARES, FLOTAS, BARCOS, DEFAULTS, normalizar, largo, celdasDe, cabe, alAzar, crearPartida } from './shared/rules.js';
import { elegir } from './shared/ia.js';
import { iniciar, redimensionar, movimientoReducido, disponer, celdaEn, dibujar, FX, tamano } from './render.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ================================================================ textos
const TXT = {
  titulo1: { es: 'BATALLA', en: 'SEA' },
  titulo2: { es: 'NAVAL', en: 'BATTLE' },
  tagline: { es: 'Escondé tu flota y cazá la del rival. Con sonar, bombas y torpedos.', en: 'Hide your fleet and hunt theirs. With sonar, bombs and torpedoes.' },
  vsCpu: { es: 'CONTRA LA COMPU', en: 'VS CPU' },
  vsCpuSub: { es: 'Tres niveles · mares de 8×8 a 12×12', en: 'Three levels · 8×8 to 12×12 seas' },
  online: { es: 'ONLINE 1 VS 1', en: 'ONLINE 1 VS 1' },
  onlineSub: { es: 'Creá una sala y pasale el código a tu rival', en: 'Create a room and send the code to your rival' },
  como: { es: 'Cómo se juega', en: 'How to play' },
  dificultad: { es: 'Dificultad', en: 'Difficulty' },
  facil: { es: 'Fácil', en: 'Easy' },
  normal: { es: 'Normal', en: 'Normal' },
  dificil: { es: 'Difícil', en: 'Hard' },
  mar: { es: 'Mar', en: 'Sea' },
  modo: { es: 'Modo', en: 'Mode' },
  clasico: { es: 'Clásico', en: 'Classic' },
  salva: { es: 'Salva', en: 'Salvo' },
  extra: { es: 'Tiro extra al acertar', en: 'Extra shot on a hit' },
  armasEsp: { es: 'Armas especiales', en: 'Special weapons' },
  pegados: { es: 'Barcos', en: 'Ships' },
  noTocan: { es: 'No se tocan', en: "Can't touch" },
  siTocan: { es: 'Se pueden tocar', en: 'May touch' },
  tiempo: { es: 'Tiempo por turno', en: 'Time per turn' },
  si: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  jugar: { es: '¡A LAS ARMAS!', en: 'TO BATTLE!' },
  volver: { es: '← volver', en: '← back' },
  notaFlota: { es: '{n} barcos: {lista}.', en: '{n} ships: {lista}.' },
  notaSalva: { es: 'Salva: cada turno disparás tantas veces como barcos te quedan.', en: 'Salvo: each turn you fire once per ship you have left.' },
  notaArmas: { es: 'Sonar, bomba y torpedo: una vez cada uno por partida.', en: 'Sonar, bomb and torpedo: once each per game.' },
  azar: { es: 'Al azar', en: 'Shuffle' },
  girar: { es: 'Girar', en: 'Rotate' },
  listo: { es: '¡LISTO!', en: 'READY!' },
  canon: { es: 'CAÑÓN', en: 'CANNON' },
  sonar: { es: 'SONAR', en: 'SONAR' },
  bomba: { es: 'BOMBA', en: 'BOMB' },
  torpedo: { es: 'TORPEDO', en: 'TORPEDO' },
  fuego: { es: '¡FUEGO!', en: 'FIRE!' },
  ubica: { es: 'UBICÁ TU FLOTA', en: 'DEPLOY YOUR FLEET' },
  esperando: { es: 'ESPERANDO A {n}…', en: 'WAITING FOR {n}…' },
  tuTurno: { es: 'TU TURNO', en: 'YOUR TURN' },
  otroTiro: { es: '¡OTRO TIRO!', en: 'SHOOT AGAIN!' },
  elegiN: { es: '🎯 {k}/{n}', en: '🎯 {k}/{n}' },
  turnoDe: { es: 'TURNO DE {n}', en: "{n}'S TURN" },
  turnoCompu: { es: 'DISPARA LA COMPU', en: 'CPU IS FIRING' },
  pistaColocar: { es: 'Arrastrá los barcos para moverlos; tocá uno para girarlo.', en: 'Drag ships to move them; tap one to rotate it.' },
  pistaColocarT: { es: 'Arrastrá para mover y hacé clic para girar · Tab elige, flechas mueven, R gira, Enter listo', en: 'Drag to move, click to rotate · Tab picks, arrows move, R rotates, Enter ready' },
  pistaTactil: { es: 'Tocá una casilla para apuntar y otra vez para disparar.', en: 'Tap a square to aim, tap it again to fire.' },
  pistaTeclas: { es: 'Clic para disparar · flechas mueven la mira, Espacio dispara · 1-4 armas', en: 'Click to fire · arrows move the sight, Space fires · 1-4 weapons' },
  pistaSonar: { es: 'Sonar: muestra los barcos de un cuadrado de 3×3.', en: 'Sonar: reveals the ships in a 3×3 square.' },
  pistaBomba: { es: 'Bomba: golpea 5 casillas en cruz.', en: 'Bomb: hits 5 squares in a cross.' },
  pistaTorpedo: { es: 'Torpedo {r}: explota en el primer barco. Tocalo otra vez para girarlo.', en: 'Torpedo {r}: blows up on the first ship. Tap it again to turn it.' },
  porFila: { es: '→ por la fila', en: '→ along the row' },
  porColumna: { es: '↓ por la columna', en: '↓ down the column' },
  pistaSalva: { es: 'Marcá {n} casillas y tocá ¡FUEGO!', en: 'Mark {n} squares and press FIRE!' },
  agua: { es: 'AGUA', en: 'MISS' },
  tocado: { es: '¡TOCADO!', en: 'HIT!' },
  contacto: { es: 'CONTACTO', en: 'CONTACT' },
  nada: { es: 'NADA', en: 'NOTHING' },
  hundido: { es: '¡HUNDIDO!', en: 'SUNK!' },
  hundisteSub: { es: '{b} enemigo', en: 'Enemy {b}' },
  teHundieron: { es: '¡TE HUNDIERON!', en: 'YOU LOST ONE!' },
  teHundieronSub: { es: 'Tu {b}', en: 'Your {b}' },
  aLaBatalla: { es: '¡A LA BATALLA!', en: 'BATTLE STATIONS!' },
  empezasVos: { es: 'Empezás vos', en: 'You fire first' },
  empieza: { es: 'Empieza {n}', en: '{n} fires first' },
  laCompu: { es: 'la compu', en: 'the CPU' },
  compu: { es: 'LA COMPU', en: 'CPU' },
  tuFlota: { es: 'Tu flota', en: 'Your fleet' },
  flotaDe: { es: 'Flota de {n}', en: "{n}'s fleet" },
  flotaEnemiga: { es: 'Flota enemiga', en: 'Enemy fleet' },
  victoria: { es: '¡VICTORIA!', en: 'VICTORY!' },
  derrota: { es: 'DERROTA', en: 'DEFEAT' },
  finGana: { es: 'Hundiste toda la flota enemiga en {n} disparos.', en: 'You sank the whole enemy fleet in {n} shots.' },
  finPierde: { es: '{n} hundió tu flota.', en: '{n} sank your fleet.' },
  finAbandono: { es: '{n} abandonó la partida.', en: '{n} left the game.' },
  finRendido: { es: 'Te rendiste.', en: 'You surrendered.' },
  finRindio: { es: '{n} se rindió.', en: '{n} surrendered.' },
  disparos: { es: 'Disparos', en: 'Shots' },
  aciertos: { es: 'Aciertos', en: 'Hits' },
  precision: { es: 'Puntería', en: 'Accuracy' },
  rachaMax: { es: 'Mejor racha', en: 'Best streak' },
  hundidos: { es: 'Barcos hundidos', en: 'Ships sunk' },
  vos: { es: 'vos', en: 'you' },
  revancha: { es: 'REVANCHA', en: 'REMATCH' },
  otraPartida: { es: 'OTRA PARTIDA', en: 'PLAY AGAIN' },
  volverSala: { es: 'VOLVER A LA SALA', en: 'BACK TO ROOM' },
  cambiar: { es: 'cambiar opciones', en: 'change options' },
  menu: { es: 'menú', en: 'menu' },
  verTableros: { es: 'ver tableros', en: 'see boards' },
  verResultado: { es: 'VER RESULTADO', en: 'SEE RESULT' },
  esperaOtra: { es: 'El anfitrión puede empezar otra partida', en: 'The host can start another game' },
  pausa: { es: 'PAUSA', en: 'PAUSED' },
  menuOnline: { es: 'MENÚ', en: 'MENU' },
  sigueOnline: { es: 'La partida sigue mientras tanto', en: 'The game keeps going meanwhile' },
  seguir: { es: 'SEGUIR', en: 'RESUME' },
  rendirse: { es: 'RENDIRSE', en: 'SURRENDER' },
  crear: { es: 'CREAR SALA', en: 'CREATE ROOM' },
  unirse: { es: 'UNIRSE', en: 'JOIN' },
  compartiCodigo: { es: 'Compartí este código', en: 'Share this code' },
  copiarLink: { es: 'COPIAR LINK', en: 'COPY LINK' },
  copiado: { es: '¡Link copiado!', en: 'Link copied!' },
  empezar: { es: 'EMPEZAR', en: 'START' },
  esperandoAnfitrion: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  faltaRival: { es: 'Falta tu rival: pasale el código', en: 'Your rival is missing: send them the code' },
  esperandoRival: { es: 'esperando rival…', en: 'waiting for a rival…' },
  salirSala: { es: '← salir de la sala', en: '← leave room' },
  anfitrion: { es: 'anfitrión', en: 'host' },
  guia: {
    es: [
      '<b>Ubicá tu flota</b>: arrastrá los barcos y tocalos para girarlos (o usá "Al azar"). Si elegiste que no se toquen, entre dos barcos tiene que quedar al menos una casilla de agua, también en diagonal.',
      '<b>Disparos</b>: por turnos, disparás a una casilla del mar enemigo. <b>Agua</b> es un tiro errado; <b>tocado</b>, que diste en un barco; <b>hundido</b>, que le diste en todas sus casillas.',
      '<b>Tiro extra</b>: con esta regla, si acertás volvés a disparar.',
      '<b>Armas especiales</b> (una vez cada una): el <b>sonar</b> muestra los barcos de un cuadrado de 3×3 sin dañarlos, la <b>bomba</b> golpea 5 casillas en cruz y el <b>torpedo</b> sale del borde por una fila o columna y explota en el primer barco que encuentra (el agua que atraviesa queda a la vista). Usar un arma termina el turno.',
      '<b>Salva</b>: en este modo cada turno disparás tantas veces como barcos te quedan a flote.',
      'Gana quien hunde primero toda la flota del otro.',
    ],
    en: [
      '<b>Deploy your fleet</b>: drag ships and tap them to rotate (or use "Shuffle"). If ships can’t touch, there must be at least one square of water between two ships, diagonals included.',
      '<b>Firing</b>: take turns firing at a square of the enemy sea. <b>Miss</b> is water; <b>hit</b> means you struck a ship; <b>sunk</b> means you hit every one of its squares.',
      '<b>Extra shot</b>: with this rule, a hit lets you fire again.',
      '<b>Special weapons</b> (once each): the <b>sonar</b> reveals the ships inside a 3×3 square without damaging them, the <b>bomb</b> hits 5 squares in a cross and the <b>torpedo</b> runs from the edge along a row or column and blows up on the first ship it meets (the water it crosses is revealed). Using a weapon ends your turn.',
      '<b>Salvo</b>: in this mode you fire once per ship you still have afloat each turn.',
      'The first to sink the whole enemy fleet wins.',
    ],
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k, en: k });
  if (v) for (const [a, b] of Object.entries(v)) s = s.replaceAll(`{${a}}`, b);
  return s;
};
const nomBarco = (id) => G.t(BARCOS[id].nom);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ================================================================ opciones guardadas
const load = (k, d) => {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(`gameit:naval:${k}`) || '{}') };
  } catch {
    return { ...d };
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(`gameit:naval:${k}`, JSON.stringify(v));
  } catch {}
};
const OP = load('opciones', { dif: 'normal', ...DEFAULTS });

// ================================================================ estado
const S = {
  modo: null, // 'local' | 'online'
  fase: null, // 'colocar' | 'batalla' | 'fin'
  o: normalizar(OP),
  N: 10,
  flota: [],
  yo: 0,
  mia: null, // mi flota [{x,y,v}]
  listo: false,
  v: null, // la vista que se está mostrando (se actualiza al terminar las animaciones)
  vSrv: null, // la última vista real (del servidor o de la partida local)
  disp: null, // marcas que se ven [[...], [...]]
  hund: [[], []],
  turno: 0,
  tiros: 1,
  sigue: false,
  cola: [],
  animando: false,
  arma: 'tiro',
  torpV: 0,
  apunte: null,
  salva: [],
  foco: 0,
  sel: -1,
  arrastre: null,
  p: null,
  dif: 'normal',
  partidas: 0,
  revelado: null,
  fin: null,
  finEncolado: false,
  pausa: false,
  nombres: ['', ''],
  enviado: false,
  deadline: 0,
  partidaId: 0,
  miaSrv: null,
  ins: { top: 100, bottom: 90, right: 0 },
  R: null,
  tactil: false,
};
let online = null;

// ================================================================ sonido
function sfx(k) {
  try {
    if (k === 'fuego') {
      noise(0.3, { freq: 420, type: 'lowpass', vol: 0.5, sweep: 90 });
      tone(150, 45, 0.3, { type: 'sine', vol: 0.35 });
    } else if (k === 'silbido') tone(1500, 650, 0.5, { type: 'sine', vol: 0.035 });
    else if (k === 'agua') {
      noise(0.5, { freq: 1500, q: 0.8, vol: 0.3, sweep: 260 });
      tone(900, 1700, 0.06, { vol: 0.05, at: 0.05 });
      tone(1200, 2100, 0.05, { vol: 0.04, at: 0.13 });
    } else if (k === 'boom') {
      noise(0.75, { freq: 800, type: 'lowpass', vol: 0.6, sweep: 60 });
      tone(110, 35, 0.6, { type: 'triangle', vol: 0.35 });
    } else if (k === 'hundido') {
      noise(1.2, { freq: 520, type: 'lowpass', vol: 0.55, sweep: 40 });
      tone(80, 30, 1, { type: 'sine', vol: 0.4 });
      tone(233, 116, 1.1, { type: 'sawtooth', vol: 0.05, at: 0.3 });
    } else if (k === 'sonar') {
      tone(1250, 1230, 0.8, { vol: 0.13 });
      tone(1250, 1230, 0.6, { vol: 0.05, at: 0.45 });
    } else if (k === 'contacto') notes([1480, 1975], { step: 0.09, dur: 0.1, vol: 0.07, type: 'square' });
    else if (k === 'torpedo') {
      noise(1.1, { freq: 500, q: 1.5, vol: 0.18, sweep: 1800 });
      tone(220, 180, 1, { type: 'sawtooth', vol: 0.02 });
    } else if (k === 'colocar') tone(240, 150, 0.09, { type: 'square', vol: 0.05 });
    else if (k === 'girar') tone(500, 700, 0.07, { type: 'triangle', vol: 0.07 });
    else if (k === 'no') tone(180, 140, 0.1, { type: 'square', vol: 0.05 });
    else if (k === 'ui') tone(900, 620, 0.05, { type: 'square', vol: 0.04 });
    else if (k === 'apuntar') tone(1400, 1400, 0.03, { type: 'square', vol: 0.025 });
    else if (k === 'turno') notes([660, 990], { step: 0.07, dur: 0.12, vol: 0.08 });
    else if (k === 'batalla') notes([392, 523, 659, 784], { step: 0.1, dur: 0.2, type: 'square', vol: 0.06 });
    else if (k === 'gana') notes([523, 659, 784, 1047, 1319], { step: 0.1, dur: 0.24, type: 'square', vol: 0.07 });
    else if (k === 'pierde') notes([392, 330, 262, 196], { step: 0.16, dur: 0.3, type: 'sawtooth', vol: 0.05 });
  } catch {
    /* sin sonido */
  }
}

// ================================================================ avisos
let avisoT = 0;
function aviso(tit, sub, color, dur = 1.6) {
  const e = $('aviso');
  e.innerHTML = `${esc(tit)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  e.style.color = color || '#fff';
  e.classList.add('on');
  clearTimeout(avisoT);
  avisoT = setTimeout(() => e.classList.remove('on'), dur * 1000);
}

// ================================================================ partida: arranque
function nuevaPartida(o) {
  S.o = normalizar(o);
  S.N = MARES[S.o.mar];
  S.flota = FLOTAS[S.o.mar];
  S.disp = [new Array(S.N * S.N).fill('.'), new Array(S.N * S.N).fill('.')];
  S.hund = [[], []];
  S.cola = [];
  S.animando = false;
  S.arma = 'tiro';
  S.torpV = 0;
  S.apunte = null;
  S.salva = [];
  S.sel = -1;
  S.arrastre = null;
  S.revelado = null;
  S.fin = null;
  S.finEncolado = false;
  S.enviado = false;
  S.sigue = false;
  S.v = null;
  S.vSrv = null;
  S.pausa = false;
  S.listo = false;
  S.turno = 0;
  S.tiros = 1;
  FX.reset();
  $('aviso').classList.remove('on');
  $('b-verFin').hidden = true;
}

function empezarLocal() {
  clearTimeout(S.cpuT);
  S.modo = 'local';
  S.dif = OP.dif;
  nuevaPartida(OP);
  S.p = crearPartida(S.o);
  S.p.colocar(1, alAzar(S.o));
  S.yo = 0;
  S.nombres = [t('vos'), t('compu')];
  S.mia = alAzar(S.o);
  S.fase = 'colocar';
  entrarPista();
}

function entrarPista() {
  show(null);
  $('juego').hidden = false;
  G.gameplay(true);
  unlock();
  hud();
}
function salirPista() {
  $('juego').hidden = true;
  $('aviso').classList.remove('on');
  S.fase = null;
  G.gameplay(false);
}

/** Terminó la colocación de los dos: arranca la batalla con la vista `v`. */
function iniciarBatalla(v) {
  S.fase = 'batalla';
  aplicarVista(v);
  S.apunte = null;
  const empiezo = v.turno === S.yo;
  aviso(t('aLaBatalla'), empiezo ? t('empezasVos') : t('empieza', { n: S.modo === 'local' ? t('laCompu') : S.nombres[1 - S.yo] }), '#ffb547', 1.8);
  sfx('batalla');
  hud();
  if (S.modo === 'local' && !empiezo) programarCPU(1600);
}

function listo() {
  if (S.fase !== 'colocar' || S.listo) return;
  sfx('ui');
  S.sel = -1;
  if (S.modo === 'local') {
    if (!S.p.colocar(0, S.mia)) return sfx('no');
    S.listo = true;
    // empieza uno y otro por partida (la primera, al azar)
    const primero = S.partidas === 0 ? (Math.random() < 0.5 ? 1 : 0) : S.partidas % 2;
    S.partidas++;
    S.p.empezar(primero);
    S.vSrv = S.p.vista();
    iniciarBatalla(S.vSrv);
  } else {
    S.listo = true;
    online.send({ t: 'flota', barcos: S.mia });
    hud();
  }
}

// ================================================================ vista y cola de animaciones
function aplicarVista(v) {
  S.v = v;
  S.disp = v.J.map((j) => j.marcas.split(''));
  S.hund = v.J.map((j) => j.hundidos.slice());
  S.turno = v.turno;
  S.tiros = v.tiros;
}

function encolar(item) {
  S.cola.push(item);
  if (!S.animando) siguiente();
}
function siguiente() {
  const it = S.cola.shift();
  if (!it) {
    S.animando = false;
    alVaciarCola();
    return;
  }
  S.animando = true;
  if (it.fin) {
    mostrarFin(it.fin);
    return siguiente();
  }
  let hecho = false;
  const terminar = () => {
    if (hecho) return;
    hecho = true;
    S.turno = it.r.turno;
    if (it.r.tiros) S.tiros = it.r.tiros;
    S.sigue = !!it.r.sigue;
    hud();
    setTimeout(siguiente, reducido() ? 120 : 380);
  };
  esperarFoco(() => {
    try {
      animar(it.r, terminar);
    } catch (e) {
      // si algo falla al animar, se muestra el resultado igual y la partida sigue
      console.error(e);
      for (const c of it.r.celdas) S.disp[1 - it.r.por][c.i] = c.r;
      S.hund[1 - it.r.por].push(...it.r.hundidos);
      terminar();
    }
  });
}
function alVaciarCola() {
  if (S.vSrv && (S.fase === 'batalla' || S.fase === 'fin') && S.vSrv.fase !== 'colocar') aplicarVista(S.vSrv);
  if (S.fase === 'batalla' && S.turno === S.yo && S.v?.turno === S.yo) {
    S.salva = S.salva.filter((i) => libre(i));
    if (S.sigue) aviso(t('otroTiro'), '', '#ffb547', 0.9);
  }
  hud();
  if (S.modo === 'local' && S.fase === 'batalla' && S.v?.turno === 1) programarCPU();
}
/** En vertical el mar que recibe el tiro se agranda: esperamos a que termine de moverse. */
function esperarFoco(cb, n = 0) {
  const obj = S.fase === 'batalla' && S.turno !== S.yo ? 1 : 0;
  if (Math.abs(S.foco - obj) < 0.04 || n > 30 || !S.R?.vertical) return cb();
  setTimeout(() => esperarFoco(cb, n + 1), 40);
}
const reducido = () => !!G.prefs?.reducedMotion;
const libre = (i) => {
  const m = S.disp[1 - S.yo][i];
  return m === '.' || m === 'c';
};

/** Anima un resultado y recién ahí muestra lo que pasó. */
function animar(r, listoCb) {
  const tb = 1 - r.por; // el mar que recibe
  const b = r.por === S.yo ? 'rival' : 'mio';
  const desde = b === 'rival' ? 'mio' : 'rival';
  const N = S.N;
  const xy = (i) => [i % N, (i / N) | 0];
  const autos = r.celdas.filter((c) => c.auto);
  const pasos = r.celdas.filter((c) => c.paso);
  const golpes = r.celdas.filter((c) => !c.auto && !c.paso);
  const marca = (c) => (S.disp[tb][c.i] = c.r);
  const mio = r.por === S.yo;
  const golpe = (c, textos) => {
    marca(c);
    const [x, y] = xy(c.i);
    if (c.r === 'a') {
      FX.piques(b, x, y);
      if (textos) FX.texto(b, x, y, t('agua'), '#d8f2ff');
      sfx('agua');
    } else if (c.r === 't') {
      FX.explosion(b, x, y, false);
      if (textos) FX.texto(b, x, y, t('tocado'), '#ffb547');
      sfx('boom');
    }
  };
  const cerrar = () => {
    if (!r.hundidos.length) {
      autos.forEach(marca);
      return listoCb();
    }
    for (const h of r.hundidos) {
      if (!S.hund[tb].some((q) => q.x === h.x && q.y === h.y && q.len === h.len)) S.hund[tb].push(h);
      const cx = h.x + (h.v ? 0 : (h.len - 1) / 2);
      const cy = h.y + (h.v ? (h.len - 1) / 2 : 0);
      FX.explosion(b, cx, cy, true);
    }
    const nom = nomBarco(r.hundidos[r.hundidos.length - 1].id);
    if (mio) aviso(t('hundido'), t('hundisteSub', { b: nom }), '#ffb547', 1.5);
    else aviso(t('teHundieron'), t('teHundieronSub', { b: nom }), '#ff8a70', 1.5);
    sfx('hundido');
    navigator.vibrate?.(mio ? 40 : 120);
    setTimeout(() => {
      autos.forEach(marca);
      listoCb();
    }, reducido() ? 250 : 800);
  };
  const vuelo = 0.62;
  if (r.k === 'tiro') {
    sfx('fuego');
    setTimeout(() => sfx('silbido'), 80);
    FX.proyectil(desde, b, r.x, r.y, vuelo, false, () => {
      golpes.forEach((c) => golpe(c, true));
      setTimeout(cerrar, reducido() ? 100 : 420);
    });
  } else if (r.k === 'salva') {
    const orden = r.blancos || golpes.map((c) => c.i);
    let llegaron = 0;
    orden.forEach((i, n) => {
      setTimeout(() => {
        sfx('fuego');
        const [x, y] = xy(i);
        FX.proyectil(desde, b, x, y, vuelo, false, () => {
          const c = golpes.find((q) => q.i === i);
          if (c) golpe(c, orden.length <= 3);
          if (++llegaron === orden.length) setTimeout(cerrar, reducido() ? 100 : 450);
        });
      }, n * (reducido() ? 60 : 150));
    });
    if (!orden.length) cerrar();
  } else if (r.k === 'bomba') {
    sfx('fuego');
    setTimeout(() => sfx('silbido'), 80);
    FX.proyectil(desde, b, r.x, r.y, vuelo + 0.15, true, () => {
      FX.explosion(b, r.x, r.y, true);
      golpes.forEach((c) => golpe(c, false));
      if (golpes.some((c) => c.r === 't')) FX.texto(b, r.x, r.y, t('tocado'), '#ffb547');
      else FX.texto(b, r.x, r.y, t('agua'), '#d8f2ff');
      setTimeout(cerrar, reducido() ? 150 : 600);
    });
  } else if (r.k === 'sonar') {
    FX.sonar(b, r.x, r.y);
    sfx('sonar');
    setTimeout(() => {
      golpes.forEach(marca);
      const cs = golpes.filter((c) => c.r === 'c');
      if (cs.length) {
        sfx('contacto');
        for (const c of cs) FX.texto(b, ...xy(c.i), t('contacto'), '#62f2a3');
      } else FX.texto(b, r.x, r.y, t('nada'), '#9fdcff');
      setTimeout(cerrar, reducido() ? 150 : 700);
    }, reducido() ? 300 : 950);
  } else if (r.k === 'torpedo') {
    const finS = r.v ? Math.floor(r.fin / N) : r.fin % N;
    const linea = r.v ? r.x : r.y;
    sfx('torpedo');
    const enS = (s) => (r.v ? s * N + linea : linea * N + s);
    FX.torpedo(
      b,
      r.v,
      linea,
      N,
      finS,
      ((finS + 1) / N) * 1.5 + 0.2,
      (s) => {
        const c = pasos.find((q) => q.i === enS(s));
        if (c) marca(c);
      },
      () => {
        const fin = enS(finS);
        const cp = pasos.find((q) => q.i === fin);
        if (cp) marca(cp);
        if (r.explota) golpes.forEach((c) => golpe(c, true));
        else {
          const [x, y] = xy(fin);
          FX.piques(b, x, y);
          FX.texto(b, x, y, t('agua'), '#d8f2ff');
          sfx('agua');
        }
        setTimeout(cerrar, reducido() ? 100 : 450);
      },
    );
  } else listoCb();
}

// ================================================================ la compu
function programarCPU(extra = 0) {
  clearTimeout(S.cpuT);
  S.cpuT = setTimeout(() => {
    if (S.modo !== 'local' || S.fase !== 'batalla') return;
    if (S.pausa || G.paused) return (S.cpuPend = true);
    if (S.animando || S.cola.length) return;
    const v = S.p.vista();
    if (v.fase !== 'batalla' || v.turno !== 1) return;
    const a = elegir(v, 1, S.dif, S.o);
    const r = S.p.accion(1, a) || S.p.accion(1, S.p.jugadaAlAzar());
    if (r) resultadoLocal(r);
  }, extra + (reducido() ? 350 : 700 + Math.random() * 550));
}
function resultadoLocal(r) {
  S.vSrv = S.p.vista();
  encolar({ r });
  if (S.p.P.fase === 'fin') encolar({ fin: finLocal(S.p.P.ganador) });
}
function finLocal(g, motivo) {
  const v = S.p.vista();
  return { gane: g === S.yo, motivo, flotaRival: S.p.flotaDe(1 - S.yo), stats: [v.J[S.yo].stats, v.J[1 - S.yo].stats] };
}

// ================================================================ disparar
function puedoDisparar() {
  return S.fase === 'batalla' && !S.animando && !S.cola.length && S.turno === S.yo && S.v?.turno === S.yo && S.v?.fase === 'batalla' && !S.enviado && !S.pausa;
}
function jugar(a) {
  if (!puedoDisparar()) return false;
  if (S.modo === 'local') {
    const r = S.p.accion(S.yo, a);
    if (!r) {
      sfx('no');
      return false;
    }
    limpiarApunte();
    resultadoLocal(r);
  } else {
    online.send({ t: 'a', ...a });
    S.enviado = true;
    limpiarApunte();
    clearTimeout(S.enviadoT);
    S.enviadoT = setTimeout(() => (S.enviado = false), 6000);
  }
  hud();
  return true;
}
function limpiarApunte() {
  S.salva = [];
  if (S.arma !== 'tiro') S.arma = 'tiro';
  if (S.tactil) S.apunte = null;
}
/** Dispara lo que está elegido en el lugar apuntado. */
function dispararAhora() {
  if (S.o.modo === 'salva') {
    const falta = Math.min(S.tiros, S.disp[1 - S.yo].filter((m) => m === '.' || m === 'c').length);
    if (S.salva.length !== falta) return sfx('no');
    return jugar({ k: 'salva', celdas: S.salva.map((i) => [i % S.N, (i / S.N) | 0]) });
  }
  const A = S.apunte;
  if (!A) return sfx('no');
  if (S.arma === 'tiro') {
    if (!libre(A.y * S.N + A.x)) return sfx('no');
    return jugar({ k: 'tiro', x: A.x, y: A.y });
  }
  if (S.arma === 'torpedo') return jugar({ k: 'torpedo', x: A.x, y: A.y, v: S.torpV });
  return jugar({ k: S.arma, x: A.x, y: A.y });
}
function tocarCelda(cel, esMouse) {
  if (!puedoDisparar()) return;
  const i = cel.y * S.N + cel.x;
  if (S.o.modo === 'salva') {
    const k = S.salva.indexOf(i);
    if (k >= 0) S.salva.splice(k, 1);
    else if (libre(i) && S.salva.length < S.tiros) S.salva.push(i);
    else return sfx('no');
    S.apunte = { x: cel.x, y: cel.y };
    sfx('apuntar');
    return hud();
  }
  if (esMouse || (S.apunte && S.apunte.x === cel.x && S.apunte.y === cel.y)) {
    S.apunte = { x: cel.x, y: cel.y };
    return dispararAhora();
  }
  S.apunte = { x: cel.x, y: cel.y };
  sfx('apuntar');
  hud();
}

// ================================================================ colocar la flota
function barcosMios() {
  return S.mia ? S.mia.map((b, k) => ({ id: S.flota[k], len: largo(S.flota[k]), x: b.x, y: b.y, v: b.v })) : null;
}
function barcoEn(x, y) {
  const i = y * S.N + x;
  return S.mia.findIndex((b, k) => celdasDe(b, largo(S.flota[k]), S.N).includes(i));
}
function ajustar(k, x, y, v) {
  const len = largo(S.flota[k]);
  return { x: clamp(x, 0, S.N - (v ? 1 : len)), y: clamp(y, 0, S.N - (v ? len : 1)), v };
}
/** Gira el barco k alrededor de la celda (gx) que se tocó; si no entra, prueba lugares cercanos. */
function girar(k, g = 0) {
  const b = S.mia[k];
  const v = 1 - b.v;
  const base = b.v ? { x: b.x - g, y: b.y + g } : { x: b.x + g, y: b.y - g };
  const pruebas = [[0, 0]];
  for (let r = 1; r <= 3; r++) for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, r], [-r, r], [r, -r]]) pruebas.push([dx, dy]);
  for (const [dx, dy] of pruebas) {
    const n = ajustar(k, base.x + dx, base.y + dy, v);
    if (cabe(S.mia, k, n, S.o)) {
      S.mia[k] = n;
      sfx('girar');
      return true;
    }
  }
  sfx('no');
  return false;
}
function mover(k, dx, dy) {
  const b = S.mia[k];
  const n = ajustar(k, b.x + dx, b.y + dy, b.v);
  if ((n.x !== b.x || n.y !== b.y) && cabe(S.mia, k, n, S.o)) {
    S.mia[k] = n;
    sfx('colocar');
  } else sfx('no');
}

// ================================================================ puntero
const cv = $('lienzo');
iniciar(cv);
let pDown = null;
cv.addEventListener('pointerdown', (e) => {
  unlock();
  S.tactil = e.pointerType !== 'mouse';
  pDown = { x: e.clientX, y: e.clientY, id: e.pointerId, tipo: e.pointerType };
  if (!S.R) return;
  if (S.fase === 'colocar' && !S.listo) {
    const cel = celdaEn(S.R.mio, e.clientX, e.clientY);
    if (!cel) return;
    const k = barcoEn(cel.x, cel.y);
    if (k < 0) return;
    const b = S.mia[k];
    S.sel = k;
    S.arrastre = { k, gx: cel.x - b.x, gy: cel.y - b.y, movido: false, ok: true, fantasma: { id: S.flota[k], len: largo(S.flota[k]), ...b } };
    cv.setPointerCapture(e.pointerId);
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!S.R) return;
  if (S.arrastre) {
    const a = S.arrastre;
    if (pDown && Math.hypot(e.clientX - pDown.x, e.clientY - pDown.y) > 7) a.movido = true;
    if (!a.movido) return;
    const t0 = S.R.mio;
    const fx = (e.clientX - t0.ox) / t0.cs;
    const fy = (e.clientY - t0.oy) / t0.cs;
    const b = S.mia[a.k];
    const n = ajustar(a.k, Math.floor(fx) - a.gx, Math.floor(fy) - a.gy, b.v);
    a.fantasma = { id: S.flota[a.k], len: largo(S.flota[a.k]), ...n };
    a.ok = cabe(S.mia, a.k, n, S.o);
    return;
  }
  if (S.fase === 'batalla' && e.pointerType === 'mouse') {
    const cel = celdaEn(S.R.rival, e.clientX, e.clientY);
    if (cel && (!S.apunte || S.apunte.x !== cel.x || S.apunte.y !== cel.y)) S.apunte = { x: cel.x, y: cel.y };
  }
});
cv.addEventListener('pointerup', (e) => {
  const a = S.arrastre;
  if (a) {
    S.arrastre = null;
    if (!a.movido) girar(a.k, S.mia[a.k].v ? a.gy : a.gx);
    else if (a.ok) {
      S.mia[a.k] = { x: a.fantasma.x, y: a.fantasma.y, v: a.fantasma.v };
      sfx('colocar');
    } else sfx('no');
    pDown = null;
    return;
  }
  if (!pDown || !S.R || Math.hypot(e.clientX - pDown.x, e.clientY - pDown.y) > 14) return;
  pDown = null;
  if (S.fase === 'batalla') {
    const cel = celdaEn(S.R.rival, e.clientX, e.clientY);
    if (cel) tocarCelda(cel, e.pointerType === 'mouse');
  }
});
cv.addEventListener('pointercancel', () => {
  S.arrastre = null;
  pDown = null;
});
cv.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !S.arrastre) S.apunte = S.apunte && S.teclado ? S.apunte : null;
});

// ================================================================ botones de la mesa
$('b-azar').onclick = () => {
  if (S.fase !== 'colocar' || S.listo) return;
  S.mia = alAzar(S.o);
  S.sel = -1;
  sfx('girar');
};
$('b-girar').onclick = () => {
  if (S.fase !== 'colocar' || S.listo) return;
  if (S.sel < 0) S.sel = 0;
  girar(S.sel);
};
$('b-listo').onclick = () => listo();
$('armas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-arma]');
  if (!b || b.disabled) return;
  elegirArma(b.dataset.arma);
});
function elegirArma(k) {
  if (!puedoDisparar()) return;
  const mias = S.v?.J[S.yo].armas || {};
  if (k !== 'tiro' && !mias[k]) return sfx('no');
  // tocar de nuevo el torpedo cambia el rumbo; otra arma elegida dos veces vuelve al cañón
  if (k === 'torpedo' && S.arma === 'torpedo') {
    S.torpV = 1 - S.torpV;
    sfx('girar');
  } else {
    S.arma = S.arma === k && k !== 'tiro' ? 'tiro' : k;
    sfx('ui');
  }
  hud();
}
$('b-fuego').onclick = () => dispararAhora();

// ================================================================ teclado
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || $('juego').hidden) return;
  if ($$('.screen.on').length && e.code !== 'Escape') return;
  if (e.code === 'Escape' || e.code === 'KeyP') return alternarPausa();
  if (S.pausa) return;
  const d = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[e.code];
  if (S.fase === 'colocar' && !S.listo) {
    if (e.code === 'Tab') {
      e.preventDefault();
      S.sel = (S.sel + (e.shiftKey ? S.flota.length - 1 : 1)) % S.flota.length;
      return sfx('ui');
    }
    if (d) {
      e.preventDefault();
      if (S.sel < 0) S.sel = 0;
      return mover(S.sel, d[0], d[1]);
    }
    if (e.code === 'KeyR') {
      if (S.sel < 0) S.sel = 0;
      return girar(S.sel);
    }
    if (e.code === 'Enter') return listo();
    return;
  }
  if (S.fase !== 'batalla') return;
  if (d) {
    e.preventDefault();
    S.teclado = true;
    const A = S.apunte || { x: (S.N / 2) | 0, y: (S.N / 2) | 0 };
    S.apunte = { x: clamp(A.x + d[0], 0, S.N - 1), y: clamp(A.y + d[1], 0, S.N - 1) };
    return;
  }
  const n = { Digit1: 'tiro', Digit2: 'sonar', Digit3: 'bomba', Digit4: 'torpedo' }[e.code];
  if (n) return elegirArma(n);
  if (e.code === 'KeyR' && S.arma === 'torpedo') return elegirArma('torpedo');
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (S.o.modo === 'salva' && e.code === 'Space' && S.apunte) return tocarCelda(S.apunte, false);
    if (!S.apunte) S.apunte = { x: (S.N / 2) | 0, y: (S.N / 2) | 0 };
    dispararAhora();
  }
});

// ================================================================ HUD
function hud() {
  const enJuego = !!S.fase;
  if (!enJuego) return;
  const col = S.fase === 'colocar';
  const bat = S.fase === 'batalla';
  const mio = bat && S.turno === S.yo;
  const libres = bat ? S.disp[1 - S.yo].filter((m) => m === '.' || m === 'c').length : 0;
  const falta = Math.min(S.tiros, libres);
  let txt = '';
  if (col) txt = S.listo ? t('esperando', { n: (S.nombres[1 - S.yo] || '').toUpperCase() }) : t('ubica');
  else if (bat) {
    if (mio) txt = S.o.modo === 'salva' ? `${t('tuTurno')} · ${t('elegiN', { k: S.salva.length, n: falta })}` : S.sigue ? t('otroTiro') : t('tuTurno');
    else txt = S.modo === 'local' ? t('turnoCompu') : t('turnoDe', { n: (S.nombres[1 - S.yo] || '').toUpperCase() });
  } else if (S.fase === 'fin' && S.fin) txt = S.fin.gane ? t('victoria') : t('derrota');
  $('turno').textContent = txt;
  $('banner').className = mio || (col && !S.listo) ? 'mio' : bat ? 'suyo' : '';
  $('barra-colocar').hidden = !(col && !S.listo);
  const conArmas = S.o.modo === 'clasico' && !!S.o.armas;
  $('barra-batalla').hidden = !bat;
  $('armas').hidden = !conArmas;
  const armas = S.v?.J[S.yo].armas || {};
  for (const b of $$('.arma')) {
    const k = b.dataset.arma;
    const usada = k !== 'tiro' && !armas[k];
    b.classList.toggle('on', S.arma === k);
    b.classList.toggle('usada', usada);
    b.disabled = !mio || usada;
  }
  $('rumbo').textContent = S.arma === 'torpedo' ? (S.torpV ? '↓' : '→') : '';
  const salva = S.o.modo === 'salva';
  $('b-fuego').hidden = !(bat && (salva || S.tactil || S.arma !== 'tiro'));
  $('b-fuego').disabled = !mio || !puedoDisparar() || (salva ? S.salva.length !== falta : !S.apunte || (S.arma === 'tiro' && !libre(S.apunte.y * S.N + S.apunte.x)));
  $('reacciones').hidden = S.modo !== 'online';
  let pista = '';
  if (col && !S.listo) pista = S.tactil || G.prefs.touch ? t('pistaColocar') : t('pistaColocarT');
  else if (mio) {
    if (salva) pista = t('pistaSalva', { n: falta });
    else if (S.arma === 'sonar') pista = t('pistaSonar');
    else if (S.arma === 'bomba') pista = t('pistaBomba');
    else if (S.arma === 'torpedo') pista = t('pistaTorpedo', { r: S.torpV ? t('porColumna') : t('porFila') });
    else if (S.v && S.v.J[S.yo].stats.disparos < 2) pista = S.tactil || G.prefs.touch ? t('pistaTactil') : t('pistaTeclas');
  }
  $('pista').textContent = pista;
  medir();
}
function medir() {
  const { W: w, H: h } = tamano();
  const ban = $('banner').getBoundingClientRect();
  const ins = { top: ban.bottom + 8, bottom: 8, right: 0 };
  for (const id of ['barra-colocar', 'barra-batalla']) {
    const el = $(id);
    if (el.hidden) continue;
    const r = [...el.children].filter((c) => !c.hidden).map((c) => c.getBoundingClientRect());
    if (!r.length) continue;
    const vertical = getComputedStyle(el).flexDirection === 'column';
    if (vertical) ins.right = Math.max(ins.right, w - Math.min(...r.map((q) => q.left)) + 8);
    else ins.bottom = Math.max(ins.bottom, h - Math.min(...r.map((q) => q.top)) + 8);
  }
  const pi = $('pista');
  if (pi.textContent) {
    pi.style.setProperty('--barra', `${ins.bottom - 8}px`);
    ins.bottom += pi.getBoundingClientRect().height + 4;
  }
  S.ins = ins;
}

// ================================================================ bucle
let last = performance.now();
let T = 0;
let relojTxt = '';
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  T += dt;
  const obj = S.fase === 'batalla' && S.turno !== S.yo ? 1 : 0;
  S.foco += (obj - S.foco) * Math.min(1, dt * (reducido() ? 30 : 6));
  if (S.fase) {
    const E = estado();
    S.R = disponer(E, S.ins, S.foco);
    dibujar(E, S.R, T, dt);
  } else dibujar(null, null, T, dt);
  // reloj (online)
  let rt = '';
  if (S.modo === 'online' && S.deadline && (S.fase === 'batalla' || (S.fase === 'colocar' && !S.listo))) rt = String(Math.max(0, Math.ceil((S.deadline - now) / 1000)));
  if (rt !== relojTxt) {
    relojTxt = rt;
    $('reloj').hidden = !rt;
    $('reloj').textContent = rt;
    $('reloj').classList.toggle('poco', !!rt && Number(rt) <= 5);
  }
  requestAnimationFrame(frame);
}
function estado() {
  const yo = S.yo;
  const el = 1 - yo;
  const flotaEstado = (lado) => S.flota.map((id) => ({ len: largo(id), hundido: S.hund[lado].some((h) => h.id === id) }));
  const rivalNom = S.modo === 'local' ? t('flotaEnemiga') : t('flotaDe', { n: S.nombres[el] || '?' });
  let apunteOk = true;
  if (S.apunte && S.arma === 'tiro' && S.o.modo === 'clasico') apunteOk = libre(S.apunte.y * S.N + S.apunte.x);
  return {
    N: S.N,
    fase: S.fase,
    turnoMio: S.turno === yo && S.fase === 'batalla',
    mio: { titulo: t('tuFlota'), barcos: barcosMios(), marcas: S.disp?.[yo] || [], hundidos: S.hund[yo], flota: flotaEstado(yo) },
    rival: { titulo: rivalNom, marcas: S.disp?.[el] || [], hundidos: S.hund[el], revelados: S.revelado, flota: flotaEstado(el) },
    apunte: S.apunte,
    apunteOk,
    arma: S.arma,
    torpV: S.torpV,
    salva: S.o.modo === 'salva' ? S.salva : null,
    arrastre: S.arrastre,
    sel: S.listo ? -1 : S.sel,
  };
}

// ================================================================ pausa y fin
function alternarPausa() {
  if (!S.fase || S.fase === 'fin') return;
  S.pausa = !S.pausa;
  const enLinea = S.modo === 'online';
  if (S.pausa) {
    $('pausa-info').textContent = enLinea ? t('sigueOnline') : '';
    $('s-pausa').querySelector('h2').textContent = enLinea ? t('menuOnline') : t('pausa');
    $('p-rendirse').hidden = S.fase !== 'batalla';
    $('p-salir').textContent = enLinea ? t('salirSala') : t('menu');
    S.arrastre = null;
    show('pausa');
    if (!enLinea) G.gameplay(false);
  } else {
    show(null);
    if (!enLinea) G.gameplay(true);
    if (S.cpuPend) {
      S.cpuPend = false;
      programarCPU();
    }
  }
}
$('bMenu').onclick = () => alternarPausa();
$('p-seguir').onclick = () => alternarPausa();
$('p-rendirse').onclick = () => {
  S.pausa = false;
  show(null);
  if (S.modo === 'online') return online.send({ t: 'rendirse' });
  clearTimeout(S.cpuT);
  S.p.rendirse(S.yo);
  S.cola = [];
  encolar({ fin: finLocal(1 - S.yo, 'rendido') });
};
$('p-salir').onclick = () => (S.modo === 'online' ? salirOnline() : aMenu());
function aMenu() {
  clearTimeout(S.cpuT);
  if (S.modo === 'online') online?.leave();
  S.modo = null;
  S.pausa = false;
  salirPista();
  show('home');
}

function mostrarFin(f) {
  S.fase = 'fin';
  S.fin = f;
  S.pausa = false;
  S.apunte = null;
  if (f.flotaRival) S.revelado = f.flotaRival.map((b, k) => ({ id: S.flota[k], len: largo(S.flota[k]), ...b }));
  sfx(f.gane ? 'gana' : 'pierde');
  G.gameplay(false);
  hud();
  pintarFin(f);
  setTimeout(() => {
    if (S.fase === 'fin' && S.fin === f) show('fin');
  }, reducido() ? 300 : 1300);
}
function pintarFin(f) {
  const rival = S.modo === 'local' ? t('laCompu') : S.nombres[1 - S.yo];
  const rivalCap = S.modo === 'local' ? t('compu') : S.nombres[1 - S.yo];
  $('fin-titulo').textContent = f.gane ? t('victoria') : t('derrota');
  $('fin-titulo').style.color = f.gane ? '#ffb547' : '#ff8a70';
  const [a, b] = f.stats;
  let sub = '';
  if (f.motivo === 'abandono') sub = t('finAbandono', { n: rival });
  else if (f.motivo === 'rendido') sub = f.gane ? t('finRindio', { n: rival }) : t('finRendido');
  else sub = f.gane ? t('finGana', { n: a.disparos }) : t('finPierde', { n: rival.charAt(0).toUpperCase() + rival.slice(1) });
  $('fin-sub').textContent = sub;
  const pct = (q) => (q.disparos ? `${Math.round((q.aciertos / q.disparos) * 100)}%` : '—');
  const filas = [
    [t('disparos'), a.disparos, b.disparos, 0],
    [t('aciertos'), a.aciertos, b.aciertos, 1],
    [t('precision'), pct(a), pct(b), 1],
    [t('rachaMax'), a.rachaMax, b.rachaMax, 1],
    [t('hundidos'), a.hundidos, b.hundidos, 1],
  ];
  const num = (v) => parseFloat(v) || 0;
  $('fin-stats').innerHTML =
    `<tr><th></th><th>${esc(t('vos'))}</th><th>${esc(rivalCap)}</th></tr>` +
    filas.map(([k, x, y, mas]) => `<tr><td>${esc(k)}</td><td class="${mas && num(x) > num(y) ? 'gana' : ''}">${x}</td><td class="${mas && num(y) > num(x) ? 'gana' : ''}">${y}</td></tr>`).join('');
  const host = S.modo === 'online' && online?.isHost;
  $('fin-otra').textContent = S.modo === 'online' ? t('otraPartida') : t('revancha');
  $('fin-otra').hidden = S.modo === 'online' && !host;
  $('fin-sala').hidden = !host;
  $('fin-cambiar').hidden = S.modo === 'online';
  $('fin-nota').textContent = S.modo === 'online' && !host ? t('esperaOtra') : '';
}
$('fin-otra').onclick = () => {
  sfx('ui');
  if (S.modo === 'online') online.send({ t: 'again' });
  else empezarLocal();
};
$('fin-sala').onclick = () => online?.send({ t: 'rematch' });
$('fin-cambiar').onclick = () => {
  salirPista();
  S.modo = null;
  abrirSetup();
};
$('fin-menu').onclick = () => aMenu();
$('fin-ver').onclick = () => {
  show(null);
  $('b-verFin').hidden = false;
};
$('b-verFin').onclick = () => {
  $('b-verFin').hidden = true;
  show('fin');
};

// ================================================================ menús
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  if (id) $('b-verFin').hidden = true;
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  unlock();
  sfx('ui');
  const id = go.dataset.go;
  if (id === 'setup') return abrirSetup();
  if (id === 'guia') {
    $('guia').innerHTML = G.t(TXT.guia).map((l) => `<p>${l}</p>`).join('');
    return show('guia');
  }
  if (id === 'online') {
    $('on-name').value ||= defaultName();
    return show('online');
  }
  show(id);
});
function notaFlota(o) {
  const ids = FLOTAS[o.mar];
  const partes = [t('notaFlota', { n: ids.length, lista: ids.map((id) => `${nomBarco(id).toLowerCase()} (${largo(id)})`).join(', ') })];
  if (o.modo === 'salva') partes.push(t('notaSalva'));
  else if (o.armas) partes.push(t('notaArmas'));
  return partes.join(' ');
}
function abrirSetup() {
  refrescarSetup();
  show('setup');
}
function refrescarSetup() {
  for (const box of $$('#s-setup [data-o]')) {
    const k = box.dataset.o;
    $$('button', box).forEach((b) => b.classList.toggle('on', String(OP[k]) === b.dataset.v));
  }
  $('setup-opts').classList.toggle('salva', OP.modo === 'salva');
  $('setup-nota').textContent = notaFlota(normalizar(OP));
}
$('s-setup').addEventListener('click', (e) => {
  const b = e.target.closest('[data-o] button');
  if (!b) return;
  const k = b.closest('[data-o]').dataset.o;
  OP[k] = ['extra', 'armas', 'tocar'].includes(k) ? Number(b.dataset.v) : b.dataset.v;
  save('opciones', OP);
  sfx('ui');
  refrescarSetup();
});
$('b-jugar').onclick = () => {
  unlock();
  S.partidas = 0;
  empezarLocal();
};

// ================================================================ online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('naval', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage,
  });
  return online;
}
$('on-create').onclick = () => {
  unlock();
  ensureOnline().create($('on-name').value.trim() || defaultName());
};
$('on-join').onclick = () => {
  unlock();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureOnline().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => online.send({ t: 'start' });
$('lobby-leave').onclick = () => salirOnline();
$('lobby-share').onclick = async () => {
  const r = await share('naval', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copiado') : '';
};
$('lobby-opts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-l] button');
  if (!b || !online?.isHost) return;
  const k = b.closest('[data-l]').dataset.l;
  const v = ['extra', 'armas', 'tocar', 'tiempo'].includes(k) ? Number(b.dataset.v) : b.dataset.v;
  online.send({ t: 'settings', settings: { ...(online.room.settings || {}), [k]: v } });
  sfx('ui');
});
function salirOnline() {
  online?.leave();
  S.modo = null;
  S.pausa = false;
  S.partidaId = 0;
  salirPista();
  show('online');
}

function applyRoom(room) {
  if (room.state === 'lobby') {
    if (S.modo === 'online') {
      S.modo = null;
      S.partidaId = 0;
      salirPista();
    }
    renderLobby(room);
    show('lobby');
    return;
  }
  const nv = room.naval;
  if (!nv) return;
  if (nv.id !== S.partidaId) iniciarOnline(room, nv);
  actualizarOnline(room, nv);
}
function iniciarOnline(room, nv) {
  S.yo = nv.orden.indexOf(online.myId);
  if (S.yo < 0) return;
  S.modo = 'online';
  S.partidaId = nv.id;
  nuevaPartida(room.settings);
  const v = nv.vista;
  S.listo = v.J[S.yo].listo;
  S.mia = S.miaSrv && S.miaSrv.id === nv.id ? S.miaSrv.barcos : alAzar(S.o);
  S.fase = 'colocar';
  if (v.fase !== 'colocar') {
    S.fase = 'batalla';
    S.vSrv = v;
    aplicarVista(v);
  }
  entrarPista();
}
function actualizarOnline(room, nv) {
  if (S.modo !== 'online' || nv.id !== S.partidaId) return;
  S.nombres = nv.orden.map((id) => room.players.find((p) => p.id === id)?.name || '?');
  S.deadline = nv.restante > 0 ? performance.now() + nv.restante : 0;
  S.vSrv = nv.vista;
  if (S.fase === 'colocar' && nv.vista.fase !== 'colocar') {
    if (!S.animando && !S.cola.length) iniciarBatalla(nv.vista);
  } else if (!S.animando && !S.cola.length && S.fase === 'batalla') aplicarVista(nv.vista);
  if (room.state === 'finished' && nv.res && !S.finEncolado) {
    S.finEncolado = true;
    encolar({ fin: finOnline(nv.res) });
  }
  hud();
}
function finOnline(m) {
  const yo = S.yo;
  return { gane: m.ganador === online.myId, motivo: m.motivo, flotaRival: m.flotas?.[1 - yo], stats: [m.stats[yo], m.stats[1 - yo]] };
}
function renderLobby(room) {
  $('lobby-code').textContent = room.code;
  const host = online.isHost;
  const ps = room.players.slice(0, 2);
  const fila = (p) =>
    p
      ? `<div class="pl"><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('vos') : '', p.id === room.host ? t('anfitrion') : ''].filter(Boolean).join(' · ')}</small></div>`
      : `<div class="pl vacio"><span>${esc(t('esperandoRival'))}</span></div>`;
  $('lobby-jugadores').innerHTML = `${fila(ps[0])}<span class="vs">VS</span>${fila(ps[1])}`;
  const st = room.settings || {};
  for (const box of $$('#lobby-opts [data-l]')) {
    const k = box.dataset.l;
    $$('button', box).forEach((b) => {
      b.classList.toggle('on', String(st[k]) === b.dataset.v);
      b.disabled = !host;
    });
  }
  $('lobby-opts').classList.toggle('salva', st.modo === 'salva');
  $('lobby-nota').textContent = notaFlota(normalizar(st));
  $('lobby-start').hidden = !host;
  const pocos = room.players.filter((p) => p.connected).length < 2;
  $('lobby-status').textContent = pocos ? t('faltaRival') : host ? '' : t('esperandoAnfitrion');
}
function onMessage(m) {
  if (m.t === 'flota') {
    S.miaSrv = { id: m.id, barcos: m.barcos };
    if (S.modo === 'online' && m.id === S.partidaId) {
      S.mia = m.barcos;
      S.listo = true;
      S.arrastre = null;
      hud();
    }
    return;
  }
  if (m.t === 'r') {
    if (S.modo !== 'online' || m.id !== S.partidaId) return;
    if (m.por === S.yo) S.enviado = false;
    encolar({ r: m });
    return;
  }
  if (m.t === 'end') {
    if (S.modo !== 'online' || S.finEncolado) return;
    S.finEncolado = true;
    encolar({ fin: finOnline(m) });
    return;
  }
  if (m.t === 'react') return burbuja(m.pid, m.e);
  if (m.t === 'error') {
    S.enviado = false;
    if (m.code === 'bad_fleet') {
      S.listo = false;
      hud();
    }
    const txt = m.code === 'need_players' ? t('faltaRival') : netText(m.code);
    $('on-status').textContent = txt;
    $('lobby-status').textContent = txt;
    return;
  }
  if (m.t === 'closed' || m.t === 'kicked') {
    $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
    S.modo = null;
    S.partidaId = 0;
    salirPista();
    show('online');
  }
}

// reacciones
const EMOJIS = ['👏', '😂', '😱', '😎', '🤔', '🔥'];
$('react-menu').innerHTML = EMOJIS.map((e, i) => `<button data-e="${i}">${e}</button>`).join('');
$('b-react').onclick = () => ($('react-menu').hidden = !$('react-menu').hidden);
$('react-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-e]');
  if (!b) return;
  $('react-menu').hidden = true;
  online?.send({ t: 'react', e: Number(b.dataset.e) });
});
function burbuja(pid, e) {
  if (!S.R || !EMOJIS[e]) return;
  const t0 = pid === online?.myId ? S.R.mio : S.R.rival;
  if (!t0) return;
  const el = document.createElement('div');
  el.className = 'burbuja';
  el.textContent = EMOJIS[e];
  el.style.left = `${t0.x + t0.s * (0.25 + Math.random() * 0.5)}px`;
  el.style.top = `${t0.y + t0.s * 0.35}px`;
  $('burbujas').append(el);
  setTimeout(() => el.remove(), 2000);
}

// ================================================================ arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  movimientoReducido(G.prefs.reducedMotion);
  S.tactil = !!G.prefs.touch;
  if ($('s-setup').classList.contains('on')) refrescarSetup();
  if ($('s-guia').classList.contains('on')) $('guia').innerHTML = G.t(TXT.guia).map((l) => `<p>${l}</p>`).join('');
  if (online?.room && online.room.state === 'lobby') renderLobby(online.room);
  if (S.fase === 'fin' && S.fin) pintarFin(S.fin);
  hud();
}
G.onPrefs(applyPrefs, true);
G.onPause(() => {
  if (S.modo === 'local' && S.fase && S.fase !== 'fin' && !S.pausa) alternarPausa();
});
addEventListener('resize', () => {
  redimensionar();
  hud();
});
requestAnimationFrame(frame);
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
G.gameplay(false);
G.ready();
if (/[?&]debug\b/.test(location.search))
  window.__naval = {
    S,
    get online() {
      return online;
    },
    jugar,
    elegir,
  };
