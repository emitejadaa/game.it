/* La Cabra · Pádel — game.it
 *
 * El partido de pádel de "LA CABRA · Pádel" (github.com/LucasPar08/la-cabra-padel), solo el modo de
 * juego: contra la compu o en línea (de 2 a 4 personas; los lugares vacíos los juegan bots). Sin
 * carrera ni torneos. El motor está en shared/engine.js (lo usan este archivo y el servidor) y el
 * dibujo en render.js.
 */
import { crearPartido, paramsHumano, paramsPareja, paramsRival, ARQUETIPOS, PASO, W, L, NOM_PUNTO, ladoDe } from './shared/engine.js';
import { ajustar, dibujar, dibujarVacia, Efectos } from './render.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { unlock } from '/shared/sfx.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ================================================================ textos
const TXT = {
  tagline: { es: 'Pádel 2 contra 2 en la pista: cristal, malla, bandeja, víbora y remate por 3.', en: '2 vs 2 padel on court: glass, fence, bandeja, víbora and smashes out of the court.' },
  vsCpu: { es: 'PARTIDO CONTRA LA COMPU', en: 'MATCH VS CPU' },
  vsCpuSub: { es: 'Vos y tu pareja contra dos rivales', en: 'You and your partner vs two rivals' },
  online: { es: 'JUGAR ONLINE', en: 'PLAY ONLINE' },
  onlineSub: { es: 'De 2 a 4 personas; los lugares libres los juega la compu', en: '2 to 4 people; bots fill the empty spots' },
  ajustes: { es: 'Ajustes', en: 'Settings' },
  como: { es: 'Cómo se juega', en: 'How to play' },
  escenario: { es: 'Escenario', en: 'Venue' },
  pabellon: { es: 'Pabellón', en: 'Arena' },
  exterior: { es: 'Exterior', en: 'Outdoor' },
  club: { es: 'Club', en: 'Club' },
  azar: { es: 'Al azar', en: 'Random' },
  dificultad: { es: 'Dificultad', en: 'Difficulty' },
  nivelBots: { es: 'Nivel de los bots', en: 'Bot level' },
  facil: { es: 'Fácil', en: 'Easy' },
  normal: { es: 'Normal', en: 'Normal' },
  dificil: { es: 'Difícil', en: 'Hard' },
  rivales: { es: 'Rivales', en: 'Rivals' },
  juegos: { es: 'Juegos por set', en: 'Games per set' },
  sets: { es: 'Sets', en: 'Sets' },
  set1: { es: '1 set', en: '1 set' },
  set3: { es: 'Al mejor de 3', en: 'Best of 3' },
  posicion: { es: 'Tu lado', en: 'Your side' },
  reves: { es: 'Revés (izq.)', en: 'Backhand (left)' },
  drive: { es: 'Drive (der.)', en: 'Forehand (right)' },
  jugar: { es: 'JUGAR', en: 'PLAY' },
  volver: { es: '← volver', en: '← back' },
  camara: { es: 'Cámara', en: 'Camera' },
  camTv: { es: 'Como en la tele', en: 'TV view' },
  camArriba: { es: 'Desde arriba', en: 'Top-down' },
  asistencia: { es: 'Asistencia', en: 'Assist' },
  golpeAuto: { es: 'Golpe automático', en: 'Auto hit' },
  botones: { es: 'Tamaño de los botones', en: 'Button size' },
  mano: { es: 'Mano', en: 'Hand' },
  diestro: { es: 'Diestro', en: 'Right' },
  zurdo: { es: 'Zurdo', en: 'Left' },
  joyLado: { es: 'Joystick (celular)', en: 'Joystick (mobile)' },
  izquierda: { es: 'Izquierda', en: 'Left' },
  derecha: { es: 'Derecha', en: 'Right' },
  camiseta: { es: 'Tu camiseta', en: 'Your shirt' },
  pala: { es: 'Tu pala', en: 'Your racket' },
  si: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  listo: { es: 'LISTO', en: 'DONE' },
  ajustesNota: { es: 'Con la asistencia, tu jugador se acomoda solo y brilla el botón que conviene.', en: 'With assist on, your player moves into position and the best button glows.' },
  crear: { es: 'CREAR SALA', en: 'CREATE ROOM' },
  unirse: { es: 'UNIRSE', en: 'JOIN' },
  compartiCodigo: { es: 'Compartí este código', en: 'Share this code' },
  copiarLink: { es: 'COPIAR LINK', en: 'COPY LINK' },
  copiado: { es: '¡Link copiado!', en: 'Link copied!' },
  botsNota: { es: 'Tocá un equipo para pasarte. Los lugares vacíos los juega la compu.', en: 'Tap a team to switch. Bots take the empty spots.' },
  equipoA: { es: 'EQUIPO A', en: 'TEAM A' },
  equipoB: { es: 'EQUIPO B', en: 'TEAM B' },
  pasarme: { es: '+ pasarme acá', en: '+ move here' },
  bot: { es: 'compu', en: 'bot' },
  vos: { es: 'vos', en: 'you' },
  anfitrion: { es: 'anfitrión', en: 'host' },
  empezar: { es: 'EMPEZAR', en: 'START' },
  esperandoAnfitrion: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  faltaGente: { es: 'Hacen falta al menos 2 personas: pasales el código', en: 'You need at least 2 people: share the code' },
  salirSala: { es: '← salir de la sala', en: '← leave room' },
  sigueEnLinea: { es: 'El partido sigue mientras tanto', en: 'The match keeps going meanwhile' },
  pausa: { es: 'PAUSA', en: 'PAUSED' },
  seguir: { es: 'SEGUIR JUGANDO', en: 'RESUME' },
  reiniciar: { es: 'EMPEZAR DE NUEVO', en: 'RESTART' },
  menu: { es: 'menú', en: 'menu' },
  revancha: { es: 'REVANCHA', en: 'REMATCH' },
  otraPartida: { es: 'OTRO PARTIDO', en: 'PLAY AGAIN' },
  volverSala: { es: 'VOLVER A LA SALA', en: 'BACK TO ROOM' },
  cambiar: { es: 'cambiar opciones', en: 'change options' },
  ganaron: { es: '¡GANARON!', en: 'YOU WON!' },
  perdieron: { es: 'PERDIERON', en: 'YOU LOST' },
  esperaOtra: { es: 'El anfitrión puede empezar otro partido', en: 'The host can start another match' },
  puntos: { es: 'puntos', en: 'points' },
  rallyMax: { es: 'rally más largo', en: 'longest rally' },
  perfectos: { es: 'golpes perfectos', en: 'perfect shots' },
  por3: { es: 'por 3 / por 4', en: 'out-of-court winners' },
  oros: { es: 'puntos de oro', en: 'golden points' },
  golpes: { es: 'tus golpes', en: 'your shots' },
  tu: { es: 'VOS', en: 'YOU' },
  golpe: { es: 'GOLPE', en: 'HIT' },
  remate: { es: 'REMATE', en: 'SMASH' },
  globo: { es: 'GLOBO', en: 'LOB' },
  dejada: { es: 'DEJADA', en: 'DROP' },
  ustedes: { es: 'USTEDES', en: 'YOUR TEAM' },
  ellos: { es: 'ELLOS', en: 'THEM' },
  saque: { es: 'Te toca sacar: tocá GOLPE', en: 'Your serve: press HIT' },
  saque2: { es: 'Segundo saque: tocá GOLPE', en: 'Second serve: press HIT' },
  aJugar: { es: '¡A JUGAR!', en: 'PLAY!' },
  juegan: { es: 'juegan a {x}', en: 'they play {x}' },
  formato: { es: '{s} a {j} juegos', en: '{s} to {j} games' },
  unSet: { es: '1 set', en: '1 set' },
  tresSets: { es: 'al mejor de 3 sets', en: 'best of 3 sets' },
  set: { es: 'SET {n}', en: 'SET {n}' },
  tieBreak: { es: 'TIE-BREAK', en: 'TIE-BREAK' },
  oro: { es: 'PUNTO DE ORO', en: 'GOLDEN POINT' },
  segundoSaque: { es: '2º SAQUE', en: '2ND SERVE' },
  falta: { es: 'FALTA', en: 'FAULT' },
  segundo: { es: 'segundo saque', en: 'second serve' },
  let: { es: 'LET', en: 'LET' },
  letSub: { es: 'Tocó la red y entró: se repite el saque', en: 'Clipped the net and went in: serve again' },
  salida: { es: '¡SALIDA DE PISTA!', en: 'OUT OF THE COURT!' },
  salidaYo: { es: '¡Corré afuera y tocá GOLPE para devolverla!', en: 'Run outside and press HIT to return it!' },
  salidaPareja: { es: 'Tu pareja sale a buscarla', en: 'Your partner runs out for it' },
  salidaEllos: { es: 'Salen a buscarla', en: 'They run out for it' },
  juegoPara: { es: 'JUEGO PARA {e} · {a}-{b}', en: 'GAME TO {e} · {a}-{b}' },
  setPara: { es: 'SET PARA {e} · {a}-{b} · SETS {c}-{d}', en: 'SET TO {e} · {a}-{b} · SETS {c}-{d}' },
  partidoYo: { es: '¡PARTIDO PARA USTEDES!', en: 'MATCH TO YOUR TEAM!' },
  partidoEl: { es: 'SE ACABÓ', en: "IT'S OVER" },
  tbSub: { es: 'TIE-BREAK · {a}-{b}', en: 'TIE-BREAK · {a}-{b}' },
  tbEmpieza: { es: '{n}-{n} · ¡TIE-BREAK A 7!', en: '{n}-{n} · TIE-BREAK TO 7!' },
  teclas: { es: 'Mover {m} · Golpe {g} · Remate {r} · Globo {l} · Dejada {d} · Pausa {p}', en: 'Move {m} · Hit {g} · Smash {r} · Lob {l} · Drop {d} · Pause {p}' },
  consejos: {
    es: ['Movete y tocá GOLPE justo antes de que la bola llegue a tu anillo', 'Bola alta cerca de la red: REMATE. Si sale perfecto, ¡por 3 o por 4!', 'Si los dos rivales están en la red: GLOBO por encima', 'Cuidado con la malla del lateral: frena la bola y la desvía', 'Si están atrás y vos en la red: DEJADA', 'Bandeja y víbora van cortadas: botan bajo y mueren en el cristal'],
    en: ['Move and press HIT right before the ball reaches your ring', 'High ball near the net: SMASH. A perfect one flies out of the court!', 'If both rivals are at the net: LOB over them', 'Watch the side fence: it slows the ball and deflects it', 'If they are back and you are at the net: DROP shot', 'Bandeja and víbora carry slice: they bounce low and die on the glass'],
  },
  guia: {
    es: [
      '<b>Moverte:</b> flechas o WASD (en el celular, el joystick). <b>Apuntar:</b> mientras pegás, izquierda/derecha elige el lado y adelante/atrás la profundidad.',
      '<b>GOLPE</b>: sale drive, volea o bandeja según la bola. <b>REMATE</b>: con la bola alta; si es perfecto, se va por 3 (por el lateral) o por 4 (por el fondo). <b>GLOBO</b>: por encima de los que están en la red. <b>DEJADA</b>: corta, pegada a la red.',
      'Tocá el botón <b>justo antes</b> de que la bola llegue al anillo de tu jugador: cuanto mejor el momento, mejor sale.',
      'Reglas del pádel: la bola tiene que botar antes de tocar la pared, un solo bote por lado y se puede jugar después del cristal. La malla frena y desvía la bola.',
      'Si la bola se va por la puerta del lateral, podés <b>salir a buscarla</b> y devolverla desde afuera.',
      'Punto de oro en 40-40 y tie-break a 7 si llegan iguales al final del set.',
    ],
    en: [
      '<b>Move:</b> arrows or WASD (joystick on mobile). <b>Aim:</b> while hitting, left/right picks the side and forward/back the depth.',
      '<b>HIT</b>: drive, volley or bandeja depending on the ball. <b>SMASH</b>: with a high ball; a perfect one flies out of the court. <b>LOB</b>: over players at the net. <b>DROP</b>: short, right over the net.',
      'Press the button <b>right before</b> the ball reaches your player\'s ring: the better the timing, the better the shot.',
      'Padel rules: the ball must bounce before hitting the wall, one bounce per side, and you can play it off the glass. The fence slows and deflects the ball.',
      'If the ball goes out through the side door, you can <b>run out</b> and return it from outside.',
      'Golden point at 40-40 and a tie-break to 7 at the end of an even set.',
    ],
  },
};
const MOTIVOS = {
  red: { es: 'A la red', en: 'Into the net' },
  noPasa: { es: 'No pasa la red', en: "Doesn't clear the net" },
  fuera: { es: 'Fuera', en: 'Out' },
  paredDirecta: { es: 'Pared directa', en: 'Straight into the wall' },
  paredSuCampo: { es: 'Pared en su campo', en: 'Own wall' },
  rejaDirecta: { es: 'Reja directa', en: 'Straight into the fence' },
  saqueReja: { es: 'Saque a la reja', en: 'Serve into the fence' },
  faltaSaque: { es: 'Fuera del cuadro', en: 'Out of the box' },
  dobleFalta: { es: 'Doble falta', en: 'Double fault' },
  noDevuelven: { es: 'No la devuelven', en: 'Not returned' },
  ace: { es: '¡Ace!', en: 'Ace!' },
  dejada: { es: '¡Dejada!', en: 'Drop shot!' },
  vibora: { es: '¡Víbora ganadora!', en: 'Winning víbora!' },
  remate: { es: '¡Remate ganador!', en: 'Winning smash!' },
  dobleBote: { es: 'Doble bote', en: 'Double bounce' },
  por3: { es: '¡Por 3!', en: 'Out by the side!' },
  por4: { es: '¡Por 4!', en: 'Out over the back!' },
  bolaMuerta: { es: 'Bola muerta', en: 'Dead ball' },
};
const GOLPES = {
  remate: { es: 'REMATE', en: 'SMASH' },
  vibora: { es: 'VÍBORA', en: 'VÍBORA' },
  bandeja: { es: 'BANDEJA', en: 'BANDEJA' },
  globo: { es: 'GLOBO', en: 'LOB' },
  dejada: { es: 'DEJADA', en: 'DROP' },
  chiquita: { es: 'CHIQUITA', en: 'SOFT SHOT' },
  plano: { es: 'PLANO', en: 'FLAT' },
  volea: { es: 'VOLEA', en: 'VOLLEY' },
  drive: { es: 'DRIVE', en: 'DRIVE' },
};
const t = (k, v) => {
  let s = TXT[k] ? G.t(TXT[k]) : k;
  if (v && typeof s === 'string') for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ================================================================ ajustes (guardados en el dispositivo)
const COLORES_CAMISETA = ['#DCF54A', '#22D3A5', '#7FD3F7', '#F5C542', '#FF8A7A', '#C792EA', '#F4F6F8', '#FF5EA8'];
const COLORES_PALA = ['#0F1C22', '#E4572E', '#2E86DE', '#F5C542', '#F4F6F8', '#9B5DE5'];
const load = (k, d) => {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(`gameit:padel:${k}`) || '{}') };
  } catch {
    return { ...d };
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(`gameit:padel:${k}`, JSON.stringify(v));
  } catch {}
};
const AJ = load('ajustes', { vista: 'tv', asistencia: 1, golpeAuto: 0, tamBotones: 1, zurdo: 0, joyDer: 0, camiseta: '#DCF54A', pala: '#0F1C22' });
const OP = load('opciones', { escena: 'azar', dif: 'normal', arq: 'azar', juegos: 3, sets: 1, posicion: 'reves' });

// nombres inventados para las parejas de la compu
const NOMBRES = ['Tomás', 'Lucía', 'Martín', 'Sofía', 'Nico', 'Valen', 'Juana', 'Bruno', 'Male', 'Santi', 'Cami', 'Joaco', 'Agus', 'Delfi', 'Fede', 'Mica', 'Lauti', 'Pilar'];
const APELLIDOS = ['Ríos', 'Paz', 'Luna', 'Sosa', 'Vega', 'Rey', 'Castro', 'Molina', 'Ortiz', 'Navarro', 'Campos', 'Ferro', 'Soler', 'Varela', 'Bravo', 'Quiroga', 'Medina', 'Roldán'];
const dupla = () => {
  const a = pick(APELLIDOS);
  let b = pick(APELLIDOS);
  while (b === a) b = pick(APELLIDOS);
  return [a, b];
};

// ================================================================ estado
const S = {
  modo: null, // 'local' | 'online'
  m: null, // partido local (motor)
  cfg: null,
  acc: 0,
  pausa: false,
  miId: 0, // mi jugador (0..3)
  miEquipo: 0,
  vista: null,
  hudKey: '',
  ayudaT: 0,
  fin: null,
  nombres: [],
};
let online = null;
const cv = $('lienzo');

// ================================================================ sonido (sintetizado, sin archivos)
let actx = null;
function ctx() {
  const v = G.prefs.volume;
  if (!v || v.muted || !(v.master * v.sfx)) return null;
  actx ||= unlock();
  if (actx?.state === 'suspended') actx.resume();
  return actx;
}
const vol = () => {
  const v = G.prefs.volume;
  return v ? v.master * v.sfx : 1;
};
function tono(f, dur, tipo, v, f2) {
  const c = ctx();
  if (!c) return;
  try {
    tonoEn(c, f, dur, tipo, v, f2);
  } catch {
    /* el sonido nunca corta el juego */
  }
}
function tonoEn(c, f, dur, tipo, v, f2) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime;
  o.type = tipo || 'sine';
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime((v || 0.2) * vol(), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}
function ruido(dur, frec, v) {
  const c = ctx();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource();
  const fl = c.createBiquadFilter();
  const g = c.createGain();
  s.buffer = buf;
  fl.type = 'bandpass';
  fl.frequency.value = frec;
  fl.Q.value = 1.1;
  g.gain.value = v * vol();
  s.connect(fl).connect(g).connect(c.destination);
  s.start();
}
/* aplausos: cientos de palmadas cortas repartidas en el tiempo */
function aplausos(dur, fuerza) {
  const c = ctx();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let k = 0, palmadas = Math.floor(dur * 140 * fuerza); k < palmadas; k++) {
    const t0 = Math.floor(Math.random() * n * 0.9);
    const largo = Math.floor(c.sampleRate * (0.006 + Math.random() * 0.012));
    const amp = 0.25 + Math.random() * 0.75;
    for (let i = 0; i < largo && t0 + i < n; i++) d[t0 + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (largo * 0.28));
  }
  for (let i = 0; i < n; i++) d[i] *= Math.min(1, i / (n * 0.06)) * Math.min(1, (n - i) / (n * 0.4));
  const s = c.createBufferSource();
  const fl = c.createBiquadFilter();
  const g = c.createGain();
  s.buffer = buf;
  fl.type = 'highpass';
  fl.frequency.value = 650;
  g.gain.value = 0.22 * fuerza * vol();
  s.connect(fl).connect(g).connect(c.destination);
  s.start();
}
const Sonido = {
  golpe: (p) => {
    ruido(0.045, 1900, 0.25 + 0.35 * p);
    tono(200 + 160 * p, 0.07, 'triangle', 0.16);
  },
  bote: () => tono(110, 0.07, 'sine', 0.2, 70),
  cristal: () => {
    tono(1320, 0.11, 'sine', 0.07);
    tono(2240, 0.08, 'sine', 0.045);
  },
  red: () => tono(140, 0.13, 'square', 0.07, 85),
  reja: () => {
    ruido(0.1, 380, 0.24);
    tono(90, 0.1, 'square', 0.05);
  },
  punto: (gana) => {
    tono(gana ? 523 : 330, 0.12, 'triangle', 0.14);
    setTimeout(() => tono(gana ? 784 : 247, 0.18, 'triangle', 0.14), 115);
  },
  grada: () => aplausos(1.5, 0.8),
  ovacion: () => {
    aplausos(2.8, 1.1);
    tono(220, 0.6, 'sawtooth', 0.02, 200);
  },
  ui: () => tono(900, 0.05, 'square', 0.04, 620),
};

// ================================================================ lo que avisa el motor (local o desde el servidor)
const aVista = (x, y) => (S.miEquipo === 1 ? [W - x, L - y] : [x, y]);
function onSonido(tipo, dato) {
  try {
    if (tipo === 'golpe') Sonido.golpe(dato || 0.5);
    else if (tipo === 'punto') Sonido.punto(dato === S.miEquipo);
    else Sonido[tipo]?.();
  } catch {
    /* sin sonido */
  }
}
function onEfecto(tipo, ...a) {
  if (tipo === 'sacudir') return Efectos.sacudir(a[0]);
  if (tipo === 'confeti') return Efectos.confeti(a[0] === S.miEquipo);
  const [x, y] = aVista(a[0], a[1]);
  if (tipo === 'golpe') Efectos.golpe(x, y, a[2], a[3], a[4]);
  else if (tipo === 'bote') Efectos.bote(x, y);
  else if (tipo === 'cristal') Efectos.cristal(x, y, a[2]);
  else if (tipo === 'reja') Efectos.reja(x, y, a[2]);
  else if (tipo === 'texto') Efectos.texto(x, y, textoEfecto(a[2]), a[3]);
}
function textoEfecto(k) {
  const [a, b] = String(k).split(':');
  const es = G.prefs.lang !== 'en';
  if (a === 'perfecto') return b === 'drive' ? (es ? '¡PERFECTO!' : 'PERFECT!') : es ? `¡${G.t(GOLPES[b])} PERFECT${b === 'globo' || b === 'remate' || b === 'plano' ? 'O' : 'A'}!` : `PERFECT ${G.t(GOLPES[b])}!`;
  if (a === 'golpe') return G.t(GOLPES[b]) || b;
  if (a === 'apunte') return { medio: es ? 'AL MEDIO' : 'MIDDLE', paralelo: es ? 'PARALELO' : 'DOWN THE LINE', cruzado: es ? 'CRUZADO' : 'CROSS' }[b] || '';
  if (a === 'salidaPerfecta') return es ? '¡SALIDA PERFECTA!' : 'PERFECT OFF THE GLASS!';
  if (a === 'salidaPared') return es ? 'SALIDA DE PARED' : 'OFF THE GLASS';
  if (a === 'devueltaFuera') return es ? '¡DEVUELTA DESDE FUERA!' : 'RETURNED FROM OUTSIDE!';
  return '';
}
let avisoTimer = 0;
function mostrarAviso(tit, sub, color, dur) {
  const a = $('aviso');
  a.innerHTML = `<span style="color:${color || '#fff'}">${esc(tit)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  a.classList.add('on');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => a.classList.remove('on'), (dur || 1.2) * 1000);
}
function onAviso(a) {
  const mio = (eq) => eq === S.miEquipo;
  if (a.tipo === 'punto') {
    const yo = mio(a.ganador);
    const e = yo ? t('ustedes') : t('ellos');
    const [p0, p1] = a.juegos;
    let sub = '';
    if (a.que === 'oro') sub = t('oro');
    else if (a.que === 'juego') sub = t('juegoPara', { e, a: S.miEquipo ? p1 : p0, b: S.miEquipo ? p0 : p1 });
    else if (a.que === 'set') {
      const ms = a.marcadorSets[a.marcadorSets.length - 1] || [0, 0];
      sub = t('setPara', { e, a: S.miEquipo ? ms[1] : ms[0], b: S.miEquipo ? ms[0] : ms[1], c: a.sets[S.miEquipo], d: a.sets[1 - S.miEquipo] });
    } else if (a.que === 'partido') sub = yo ? t('partidoYo') : t('partidoEl');
    else if (a.que === 'tb') sub = t('tbSub', { a: a.puntos[S.miEquipo], b: a.puntos[1 - S.miEquipo] });
    else if (a.que === 'empiezaTb') sub = t('tbEmpieza', { n: a.juegos[0] });
    else if (a.que === 'punto') {
      const pm = a.puntos[S.miEquipo];
      const pe = a.puntos[1 - S.miEquipo];
      sub = pm >= 3 && pe >= 3 ? '40-40' : `${NOM_PUNTO[Math.min(3, pm)]}-${NOM_PUNTO[Math.min(3, pe)]}`;
    }
    mostrarAviso(G.t(MOTIVOS[a.motivo]) || a.motivo, sub, yo ? '#DCF54A' : '#FF8A7A', a.dur);
  } else if (a.tipo === 'falta') mostrarAviso(t('falta'), `${G.t(MOTIVOS[a.motivo]) || ''} · ${t('segundo')}`, '#F5C542', a.dur);
  else if (a.tipo === 'let') mostrarAviso(t('let'), t('letSub'), '#7FD3F7', a.dur);
  else if (a.tipo === 'salida') {
    const sub = a.id === S.miId && a.humano ? t('salidaYo') : mio(a.lado) ? t('salidaPareja') : t('salidaEllos');
    mostrarAviso(t('salida'), sub, '#7FD3F7', a.dur);
  }
}
function onAyuda(id, k) {
  const e = $('ayuda');
  let txt = '';
  if (k && id === S.miId) txt = `${t(k)}${G.prefs.touch ? '' : ` (${teclasTxt().g})`}`;
  else if (k && S.modo === 'local' && S.m && S.m.P.puntosJugados < 6) txt = G.t(TXT.consejos)[S.m.P.puntosJugados % 6];
  e.hidden = !txt;
  e.textContent = txt;
}

// ================================================================ partido contra la compu
function empezarLocal() {
  const escena = OP.escena === 'azar' ? pick(['pabellon', 'exterior', 'club']) : OP.escena;
  const arq = OP.arq === 'azar' ? pick(ARQUETIPOS) : ARQUETIPOS.find((a) => a.id === OP.arq) || ARQUETIPOS[0];
  const [r1, r2] = dupla();
  const pareja = pick(NOMBRES);
  const miCarril = OP.posicion === 'drive' ? 'der' : 'izq';
  const otro = miCarril === 'izq' ? 'der' : 'izq';
  const yo = { humano: true, carril: miCarril, ...paramsHumano(OP.dif, !!AJ.asistencia), color: AJ.camiseta, colorPala: AJ.pala, zurdo: !!AJ.zurdo, asistencia: !!AJ.asistencia, golpeAuto: !!AJ.golpeAuto, nombre: t('tu') };
  const compa = { humano: false, carril: otro, ...paramsPareja(), color: '#9BE36B', nombre: pareja };
  const riv = paramsRival(OP.dif, arq);
  // el jugador 0 siempre es el de la izquierda de su equipo en el arreglo del motor: acomodamos por carril
  const nuestros = miCarril === 'izq' ? [yo, compa] : [compa, yo];
  S.cfg = {
    juegos: OP.juegos,
    sets: OP.sets,
    escena: { tipo: escena, gente: 0.45 + Math.random() * 0.55, ciudad: pick(['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'Montevideo', 'Madrid', 'Valencia', 'Málaga']) },
    equipos: [`${t('tu')} / ${pareja.toUpperCase()}`, `${r1.toUpperCase()} / ${r2.toUpperCase()}`],
    jugadores: [...nuestros, { humano: false, carril: 'izq', ...riv, color: '#FF8A7A', nombre: r1 }, { humano: false, carril: 'der', ...riv, color: '#FFB29E', nombre: r2 }],
    arq,
  };
  S.modo = 'local';
  S.miId = miCarril === 'izq' ? 0 : 1;
  S.miEquipo = 0;
  S.pausa = false;
  S.acc = 0;
  S.fin = null;
  Efectos.reset();
  S.m = crearPartido(S.cfg, {
    sonido: onSonido,
    efecto: onEfecto,
    aviso: onAviso,
    ayuda: onAyuda,
    vibrar: (id, ms) => id === S.miId && navigator.vibrate?.(ms),
    fin: (r) => setTimeout(() => terminarLocal(r), 0),
  });
  entrarPista();
  mostrarAviso(t('aJugar'), `${formatoTxt(OP.sets, OP.juegos)} · ${t('juegan', { x: G.t(arq.nom) })}`, '#FF8A7A', 1.9);
}
const formatoTxt = (sets, juegos) => t('formato', { s: sets === 3 ? t('tresSets') : t('unSet'), j: juegos });
function terminarLocal(r) {
  if (S.modo !== 'local') return;
  S.fin = r;
  mostrarFin(r, S.m.P.stats);
}

// ================================================================ en la pista: vista, HUD y bucle
function entrarPista() {
  show(null);
  $('juego').hidden = false;
  $('bPausa').hidden = false;
  layout();
  applyKeys();
  G.gameplay(true);
  unlock();
}
function salirPista() {
  $('juego').hidden = true;
  $('aviso').classList.remove('on');
  $('ayuda').hidden = true;
  G.gameplay(false);
}
function layout() {
  const touch = !!G.prefs.touch;
  document.body.classList.toggle('touch', touch);
  const portrait = innerHeight > innerWidth;
  const tam = Number(AJ.tamBotones) || 1;
  const abajo = touch ? (portrait ? Math.round(232 * tam) : 16) : 44;
  const arriba = portrait ? 132 : innerHeight < 520 ? 16 : 70;
  const escena = (S.modo === 'local' ? S.cfg?.escena : S.escenaOnline) || { tipo: 'pabellon', gente: 0.8 };
  ajustar(cv, { vista: AJ.vista, arriba, abajo, escena });
  disenoControles();
}
const BASE_CONTROLES = { golpe: { r: 18, b: 12, t: 98, f: 13.5, i: 24 }, remate: { r: 22, b: 122, t: 74, f: 10.5, i: 19 }, globo: { r: 126, b: 6, t: 72, f: 10.5, i: 19 }, dejada: { r: 110, b: 94, t: 64, f: 9.5, i: 16 }, joy: { r: 18, b: 14, t: 128 } };
function disenoControles() {
  const s = Math.min((Number(AJ.tamBotones) || 1) * Math.min(1, innerWidth / 390), (innerWidth - 12) / 344);
  const zurdo = !!AJ.joyDer;
  for (const k of Object.keys(BASE_CONTROLES)) {
    const el = k === 'joy' ? $('joy') : document.querySelector(`.accion[data-accion="${k}"]`);
    const B = BASE_CONTROLES[k];
    const tt = Math.round(B.t * s);
    const st = el.style;
    st.width = st.height = `${tt}px`;
    const lado = (k === 'joy') !== zurdo ? 'left' : 'right';
    st[lado] = `calc(${Math.round(B.r * s)}px + env(safe-area-inset-${lado}))`;
    st[lado === 'left' ? 'right' : 'left'] = 'auto';
    st.bottom = `calc(max(16px, env(safe-area-inset-bottom)) + ${Math.round(B.b * s)}px)`;
    if (k !== 'joy') {
      st.fontSize = `${(B.f * s).toFixed(1)}px`;
      el.querySelector('i').style.fontSize = `${Math.round(B.i * s)}px`;
    }
  }
  const knob = $('joyKnob');
  const kt = Math.round(54 * s);
  knob.style.width = knob.style.height = `${kt}px`;
  knob.style.margin = `-${kt / 2}px 0 0 -${kt / 2}px`;
}

/** La vista del cuadro: siempre con tu equipo abajo. */
function vistaLocal() {
  const P = S.m.P;
  const flip = S.miEquipo === 1;
  const fx = (x) => (flip ? W - x : x);
  const fy = (y) => (flip ? L - y : y);
  const b = P.bola;
  const yoJ = P.jug[S.miId];
  let cae = null;
  if (yoJ && yoJ.asistencia && P.estado === 'juego' && b.golpeo !== null && b.golpeo !== S.miEquipo) {
    const s = P.prediccion.find((p) => p.botes >= 1 && p.t > P.t - P.tGolpe);
    if (s && ladoDe(s.y) === S.miEquipo) cae = { x: fx(s.x), y: fy(s.y) };
  }
  return {
    t: P.t,
    estado: P.estado,
    fiesta: P.fiesta,
    ganador: P.ultimoGanador,
    bola: { x: fx(b.x), y: fy(b.y), z: b.z, porTres: b.porTres, cae },
    jug: P.jug.map((j) => vistaJugador(j, fx, fy, flip, j.id === S.miId && S.m.alcanzable(j))),
    apunte: yoJ?.apunte ? { tx: yoJ.apunte.tx == null ? null : fx(yoJ.apunte.tx), prof: yoJ.apunte.prof } : null,
    yo: yoJ ? { x: fx(yoJ.x), y: fy(yoJ.y) } : null,
    marcador: { equipos: P.equipos, puntos: P.puntos, juegos: P.juegos, tb: P.tb },
  };
}
function vistaJugador(j, fx, fy, flip, alcanza) {
  return {
    x: fx(j.x),
    y: fy(j.y),
    vx: flip ? -j.vx : j.vx,
    vy: flip ? -j.vy : j.vy,
    lado: flip ? 1 - j.lado : j.lado,
    equipo: j.lado,
    id: j.id,
    anim: j.anim,
    swing: j.swing,
    ultimoTiro: j.ultimoTiro,
    color: j.color || '#fff',
    colorPala: j.colorPala || '#0F1C22',
    zurdo: !!j.zurdo,
    zapas: j.zapas,
    yo: j.id === S.miId,
    alcanza,
    etiqueta: j.id === S.miId ? t('tu') : S.modo === 'online' && j.humano ? String(j.nombre || '').toUpperCase().slice(0, 10) : null,
  };
}
function hud(M) {
  const me = S.miEquipo;
  const ot = 1 - me;
  const key = JSON.stringify([M.puntos, M.juegos, M.setsG, M.marcadorSets, M.tb, M.sacaAhora, M.saqueN, M.estado === 'saque', G.prefs.lang]);
  if (key === S.hudKey) return;
  S.hudKey = key;
  $('nomYo').textContent = M.equipos[me];
  $('nomEl').textContent = M.equipos[ot];
  $('setsYo').innerHTML = M.marcadorSets.map((s) => `<i class="${s[me] > s[ot] ? 'g' : ''}">${s[me]}</i>`).join('');
  $('setsEl').innerHTML = M.marcadorSets.map((s) => `<i class="${s[ot] > s[me] ? 'g' : ''}">${s[ot]}</i>`).join('');
  $('jgYo').textContent = M.juegos[me];
  $('jgEl').textContent = M.juegos[ot];
  $('ptYo').textContent = M.tb ? M.puntos[me] : NOM_PUNTO[Math.min(M.puntos[me], 3)];
  $('ptEl').textContent = M.tb ? M.puntos[ot] : NOM_PUNTO[Math.min(M.puntos[ot], 3)];
  $('sacaYo').classList.toggle('on', M.sacaAhora === me);
  $('sacaEl').classList.toggle('on', M.sacaAhora === ot);
  const oro = !M.tb && M.puntos[0] === 3 && M.puntos[1] === 3;
  const txt = [M.setsGanar === 2 ? t('set', { n: M.marcadorSets.length + 1 }) : '', M.tb ? t('tieBreak') : oro ? t('oro') : '', M.saqueN === 2 && M.estado === 'saque' ? t('segundoSaque') : ''].filter(Boolean).join(' · ');
  const r = $('rotulo');
  r.textContent = txt;
  r.style.display = txt ? 'block' : 'none';
}
function sugerir(sug) {
  if (sug === S.sug) return;
  S.sug = sug;
  for (const el of $$('.accion')) el.classList.toggle('sugerido', el.dataset.accion === sug);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.modo === 'local' && S.m) {
    const P = S.m.P;
    if (!S.pausa && !G.paused && !S.fin) {
      if (P.lento > 0) P.lento -= dt;
      S.acc += dt;
      let n = 0;
      while (S.acc >= PASO && n < 12) {
        S.m.actualizar(P.lento > 0 ? PASO * 0.35 : PASO);
        S.acc -= PASO;
        n++;
      }
      if (n === 12) S.acc = 0;
      Efectos.actualizar(P.lento > 0 ? dt * 0.35 : dt);
    }
    dibujar(vistaLocal());
    hud({ ...P, setsGanar: P.setsGanar });
    const yo = P.jug[S.miId];
    sugerir(yo?.asistencia ? yo.sug : null);
  } else if (S.modo === 'online' && S.snaps.length) {
    Efectos.actualizar(dt);
    const v = vistaOnline(now);
    if (v) {
      dibujar(v);
      hud(S.marcador);
    }
  } else dibujarVacia(now / 1000);
}

// ================================================================ controles
const Input = { ax: 0, ay: 0, teclas: new Set(), joyId: null };
function teclasTxt() {
  const flechas = G.prefs.keys === 'arrows';
  return flechas ? { m: '←↑↓→', g: 'Z', r: 'X', l: 'C', d: 'V', p: 'P' } : { m: 'WASD', g: 'J', r: 'L', l: 'K', d: 'I', p: 'P' };
}
const ACCIONES = { KeyJ: 'golpe', Space: 'golpe', KeyZ: 'golpe', KeyL: 'remate', KeyX: 'remate', KeyK: 'globo', KeyC: 'globo', KeyI: 'dejada', KeyV: 'dejada' };
function accion(a) {
  unlock();
  if (S.modo === 'local' && S.m) S.m.entrada(S.miId, { ax: Input.ax || ejeTeclas().x, ay: Input.ay || ejeTeclas().y, accion: a });
  else if (S.modo === 'online' && online) {
    enviarEntrada(a);
  }
}
function ejeTeclas() {
  let x = 0;
  let y = 0;
  const k = G.prefs.keys;
  const t2 = Input.teclas;
  const arrows = k !== 'wasd';
  const wasd = k !== 'arrows';
  if ((arrows && t2.has('ArrowRight')) || (wasd && t2.has('KeyD'))) x++;
  if ((arrows && t2.has('ArrowLeft')) || (wasd && t2.has('KeyA'))) x--;
  if ((arrows && t2.has('ArrowDown')) || (wasd && t2.has('KeyS'))) y++;
  if ((arrows && t2.has('ArrowUp')) || (wasd && t2.has('KeyW'))) y--;
  const m = Math.hypot(x, y);
  return m > 1 ? { x: x / m, y: y / m } : { x, y };
}
function applyKeys() {
  const e = Input.joyId != null ? { x: Input.ax, y: Input.ay } : ejeTeclas();
  if (S.modo === 'local' && S.m) S.m.entrada(S.miId, { ax: e.x, ay: e.y });
  else if (S.modo === 'online') enviarEntrada(null, e);
}
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || $('juego').hidden) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  Input.teclas.add(e.code);
  if (ACCIONES[e.code]) accion(ACCIONES[e.code]);
  if (e.code === 'KeyP' || e.code === 'Escape') alternarPausa();
  applyKeys();
});
addEventListener('keyup', (e) => {
  Input.teclas.delete(e.code);
  applyKeys();
});
addEventListener('blur', () => {
  Input.teclas.clear();
  applyKeys();
});
{
  const joy = $('joy');
  const knob = $('joyKnob');
  const mover = (e) => {
    const r = joy.getBoundingClientRect();
    const R = r.width / 2;
    let dx = e.clientX - (r.left + R);
    let dy = e.clientY - (r.top + R);
    const m = Math.hypot(dx, dy);
    if (m > R) {
      dx *= R / m;
      dy *= R / m;
    }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const mag = Math.hypot(dx, dy) / R;
    Input.ax = mag < 0.16 ? 0 : dx / R;
    Input.ay = mag < 0.16 ? 0 : dy / R;
    applyKeys();
  };
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlock();
    Input.joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    mover(e);
  });
  joy.addEventListener('pointermove', (e) => e.pointerId === Input.joyId && mover(e));
  const soltar = (e) => {
    if (e.pointerId !== Input.joyId) return;
    Input.joyId = null;
    Input.ax = Input.ay = 0;
    knob.style.transform = '';
    applyKeys();
  };
  joy.addEventListener('pointerup', soltar);
  joy.addEventListener('pointercancel', soltar);
  for (const b of $$('.accion')) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      accion(b.dataset.accion);
      b.classList.add('pulsado');
    });
    const fin = () => b.classList.remove('pulsado');
    b.addEventListener('pointerup', fin);
    b.addEventListener('pointercancel', fin);
    b.addEventListener('pointerleave', fin);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

// ================================================================ pausa y fin
function alternarPausa() {
  if (!S.modo || S.fin || (S.modo === 'local' && !S.m)) return;
  S.pausa = !S.pausa;
  const enLinea = S.modo === 'online';
  if (S.pausa) {
    if (enLinea) $('pausa-info').textContent = t('sigueEnLinea');
    else {
      const P = S.m.P;
      $('pausa-info').textContent = `${P.marcadorSets.map((s) => s.join('-')).concat([P.juegos.join('-')]).join(' · ')} — ${formatoTxt(S.cfg.sets, S.cfg.juegos)}`;
    }
    $('p-reiniciar').hidden = enLinea;
    $('p-salir').textContent = enLinea ? t('salirSala') : t('menu');
    $('pausa-guia').innerHTML = G.t(TXT.guia).slice(0, 3).map((l) => `<p>${l}</p>`).join('');
    Input.teclas.clear();
    applyKeys();
    show('pausa');
    if (!enLinea) G.gameplay(false);
  } else {
    show(null);
    if (!enLinea) G.gameplay(true);
  }
}
$('bPausa').onclick = () => alternarPausa();
$('p-seguir').onclick = () => alternarPausa();
$('p-reiniciar').onclick = () => {
  S.pausa = false;
  empezarLocal();
};
$('p-salir').onclick = () => (S.modo === 'online' ? salirOnline() : aMenu());
function aMenu() {
  if (S.modo === 'online') online?.leave();
  S.modo = null;
  S.m = null;
  S.pausa = false;
  salirPista();
  show('home');
}

function mostrarFin(r, st) {
  const me = S.miEquipo;
  const gane = r.ganador === me;
  $('fin-titulo').textContent = gane ? t('ganaron') : t('perdieron');
  $('fin-titulo').style.color = gane ? '#DCF54A' : '#FF8A7A';
  $('fin-sets').innerHTML = r.sets.map((s) => `<span>${s[me]}-${s[1 - me]}</span>`).join('');
  const stat = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
  $('fin-stats').innerHTML =
    stat(`${st.puntos[me]}-${st.puntos[1 - me]}`, t('puntos')) +
    stat(st.rallyMax, t('rallyMax')) +
    stat(st.perfectos[S.miId] || 0, t('perfectos')) +
    stat(`${st.porTres[me]}-${st.porTres[1 - me]}`, t('por3')) +
    stat(`${st.oros[me]}-${st.oros[1 - me]}`, t('oros')) +
    stat(st.golpes[S.miId] || 0, t('golpes'));
  const onl = S.modo === 'online';
  $('fin-otra').textContent = onl ? t('otraPartida') : t('revancha');
  $('fin-otra').hidden = onl && !online?.isHost;
  $('fin-sala').hidden = !onl || !online?.isHost;
  $('fin-cambiar').hidden = onl;
  $('fin-nota').textContent = onl && !online?.isHost ? t('esperaOtra') : '';
  G.gameplay(false);
  show('fin');
}
$('fin-otra').onclick = async () => {
  unlock();
  await G.commercialBreak('revancha');
  if (S.modo === 'online') online?.send({ t: 'again' });
  else empezarLocal();
};
$('fin-sala').onclick = () => online?.send({ t: 'rematch' });
$('fin-cambiar').onclick = () => {
  salirPista();
  S.modo = null;
  S.m = null;
  abrirSetup();
};
$('fin-menu').onclick = () => aMenu();

// ================================================================ menús
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
}
function escenasHTML() {
  return ['pabellon', 'exterior', 'club', 'azar'].map((e) => `<button data-v="${e}"><i class="esc-${e}">${e === 'azar' ? '🎲' : ''}</i>${t(e)}</button>`).join('');
}
function abrirSetup() {
  $$('[data-o="escena"]')[0].innerHTML = escenasHTML();
  $$('[data-o="arq"]')[0].innerHTML = [`<button data-v="azar">${t('azar')}</button>`, ...ARQUETIPOS.map((a) => `<button data-v="${a.id}">${esc(G.t(a.nom))}</button>`)].join('');
  refrescarSetup();
  show('setup');
}
function refrescarSetup() {
  for (const box of $$('#s-setup [data-o]')) {
    const k = box.dataset.o;
    $$('button', box).forEach((b) => b.classList.toggle('on', String(OP[k]) === b.dataset.v));
  }
  $('setup-note').textContent = G.prefs.touch ? '' : G.t({ es: 'Teclado: ', en: 'Keyboard: ' }) + t('teclas', teclasTxt());
}
$('s-setup').addEventListener('click', (e) => {
  const b = e.target.closest('[data-o] button');
  if (!b) return;
  const k = b.closest('[data-o]').dataset.o;
  OP[k] = ['juegos', 'sets'].includes(k) ? Number(b.dataset.v) : b.dataset.v;
  save('opciones', OP);
  Sonido.ui();
  refrescarSetup();
});
$('b-jugar').onclick = () => {
  unlock();
  empezarLocal();
};
function abrirAjustes() {
  for (const box of $$('[data-c]')) {
    const k = box.dataset.c;
    const lista = k === 'camiseta' ? COLORES_CAMISETA : COLORES_PALA;
    box.innerHTML = lista.map((c) => `<button data-v="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
  }
  refrescarAjustes();
  show('ajustes');
}
function refrescarAjustes() {
  for (const box of $$('[data-p]')) {
    const k = box.dataset.p;
    $$('button', box).forEach((b) => b.classList.toggle('on', String(AJ[k]) === b.dataset.v));
  }
  for (const box of $$('[data-c]')) $$('button', box).forEach((b) => b.classList.toggle('on', AJ[box.dataset.c] === b.dataset.v));
}
$('s-ajustes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-p] button, [data-c] button');
  if (!b) return;
  const box = b.closest('[data-p],[data-c]');
  const k = box.dataset.p || box.dataset.c;
  AJ[k] = box.dataset.c || k === 'vista' ? b.dataset.v : Number(b.dataset.v);
  save('ajustes', AJ);
  Sonido.ui();
  refrescarAjustes();
  enviarPrefs();
});
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  unlock();
  Sonido.ui();
  const id = go.dataset.go;
  if (id === 'setup') return abrirSetup();
  if (id === 'ajustes') return abrirAjustes();
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

// ================================================================ en línea
S.snaps = [];
S.marcador = null;
S.escenaOnline = null;
const TIROS = ['saque', 'drive', 'plano', 'volea', 'globo', 'remate', 'vibora', 'bandeja', 'dejada', 'chiquita'];
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('padel', {
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
  const r = await share('padel', online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copiado') : '';
};
function salirOnline() {
  online?.leave();
  S.modo = null;
  S.pausa = false;
  S.snaps = [];
  salirPista();
  show('online');
}
function enviarPrefs() {
  if (!online?.room) return;
  online.send({ t: 'prefs', asistencia: !!AJ.asistencia, golpeAuto: !!AJ.golpeAuto, camiseta: AJ.camiseta, pala: AJ.pala, zurdo: !!AJ.zurdo, posicion: OP.posicion });
}
let ultEnvio = 0;
let ultEje = { x: 0, y: 0 };
let pendiente = null;
function enviarEntrada(acc, e) {
  if (!online) return;
  if (e) ultEje = { x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10 };
  const now = performance.now();
  if (!acc && now - ultEnvio < 50) {
    clearTimeout(pendiente);
    pendiente = setTimeout(() => enviarEntrada(null), 55 - (now - ultEnvio));
    return;
  }
  ultEnvio = now;
  online.send({ t: 'i', ax: ultEje.x, ay: ultEje.y, ...(acc ? { a: acc } : {}) });
}
function applyRoom(room) {
  if (room.state === 'lobby') {
    if (S.modo === 'online') {
      S.modo = null;
      salirPista();
    }
    renderLobby(room);
    show('lobby');
    return;
  }
  const pd = room.padel;
  if (!pd) return;
  if (room.state === 'playing' && (S.modo !== 'online' || S.partidoId !== pd.id)) {
    // arranca el partido (o entramos de nuevo después de un corte)
    S.modo = 'online';
    S.partidoId = pd.id;
    S.pausa = false;
    S.equipos = pd.equipos;
    S.snaps = [];
    S.fin = null;
    S.miId = pd.slots.findIndex((s) => s.pid === online.myId);
    S.miEquipo = S.miId >= 2 ? 1 : 0;
    S.escenaOnline = pd.escena;
    S.slots = pd.slots;
    Efectos.reset();
    entrarPista();
    enviarPrefs();
  }
}
function renderLobby(room) {
  $('lobby-code').textContent = room.code;
  const host = online.isHost;
  const eq = room.padelLobby?.equipos || {};
  const grupos = [[], []];
  for (const p of room.players) grupos[eq[p.id] ?? 0].push(p);
  $('lobby-equipos').innerHTML = [0, 1]
    .map((k) => {
      const lista = grupos[k];
      const filas = lista.map((p) => `<div class="pl"><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('vos') : '', p.id === room.host ? t('anfitrion') : ''].filter(Boolean).join(' · ')}</small></div>`);
      for (let i = lista.length; i < 2; i++) filas.push(`<div class="pl bot"><i style="background:#556"></i><span>🤖 ${t('bot')}</span></div>`);
      const yoAca = lista.some((p) => p.id === online.myId);
      return `<div class="equipo ${k ? 'b' : 'a'}"><h3><b>${k ? t('equipoB') : t('equipoA')}</b></h3>${filas.join('')}${!yoAca && lista.length < 2 ? `<button class="unirme" data-eq="${k}">${t('pasarme')}</button>` : ''}</div>`;
    })
    .join('');
  const st = room.settings || {};
  $$('[data-l="escena"]')[0].innerHTML = escenasHTML();
  for (const box of $$('#lobby-opts [data-l]')) {
    const k = box.dataset.l;
    $$('button', box).forEach((b) => {
      b.classList.toggle('on', String(st[k]) === b.dataset.v);
      b.disabled = !host;
    });
  }
  $('lobby-start').hidden = !host;
  const pocos = room.players.filter((p) => p.connected).length < 2;
  $('lobby-status').textContent = pocos ? t('faltaGente') : host ? '' : t('esperandoAnfitrion');
}
$('lobby-equipos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-eq]');
  if (b) online.send({ t: 'team', equipo: Number(b.dataset.eq) });
});
$('lobby-opts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-l] button');
  if (!b || !online.isHost) return;
  const k = b.closest('[data-l]').dataset.l;
  const v = ['juegos', 'sets'].includes(k) ? Number(b.dataset.v) : b.dataset.v;
  online.send({ t: 'settings', settings: { ...(online.room.settings || {}), [k]: v } });
  Sonido.ui();
});
function onMessage(m) {
  if (m.t === 's') return recibirSnap(m);
  if (m.t === 'end') {
    if (S.modo !== 'online') return;
    S.fin = m.res;
    S.pausa = false;
    setTimeout(() => mostrarFin(m.res, m.res.stats), 400);
    return;
  }
  if (m.t === 'error') {
    const txt = m.code === 'need_players' ? t('faltaGente') : netText(m.code);
    $('on-status').textContent = txt;
    $('lobby-status').textContent = txt;
  } else if (m.t === 'closed' || m.t === 'kicked') {
    $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
    S.modo = null;
    salirPista();
    show('online');
  }
}
/* 30 veces por segundo llega el estado; se dibuja un poquito en el pasado para interpolar */
const RETRASO = 70;
function recibirSnap(m) {
  if (S.modo !== 'online') return;
  m.at = performance.now();
  S.snaps.push(m);
  while (S.snaps.length > 30) S.snaps.shift();
  S.marcador = { equipos: m.m.eq || S.marcador?.equipos || ['', ''], puntos: m.m.p, juegos: m.m.j, setsG: m.m.sg, marcadorSets: m.m.ms, tb: !!m.m.tb, sacaAhora: m.m.sa, saqueN: m.m.sn, estado: m.e, setsGanar: m.m.sgn };
  if (m.m.eq) S.equipos = m.m.eq;
  S.marcador.equipos = S.equipos || S.marcador.equipos;
}
function vistaOnline(now) {
  const T = now - RETRASO;
  const sn = S.snaps;
  let a = sn[0];
  let b = sn[sn.length - 1];
  for (let i = sn.length - 1; i > 0; i--)
    if (sn[i - 1].at <= T) {
      a = sn[i - 1];
      b = sn[i];
      break;
    }
  // los eventos (sonidos, efectos, carteles) salen cuando el dibujo llega a ese momento
  for (const s of sn)
    if (!s.hecho && s.at <= T) {
      s.hecho = true;
      for (const ev of s.ev || []) aplicarEvento(ev);
    }
  const k = b.at > a.at ? clamp((T - a.at) / (b.at - a.at), 0, 1) : 1;
  const lerp = (p, q) => p + (q - p) * k;
  const flip = S.miEquipo === 1;
  const fx = (x) => (flip ? W - x : x);
  const fy = (y) => (flip ? L - y : y);
  const bola = { x: fx(lerp(a.b[0], b.b[0])), y: fy(lerp(a.b[1], b.b[1])), z: lerp(a.b[2], b.b[2]), porTres: !!b.b[3], cae: null };
  const yoH = b.h?.[S.miId];
  if (b.c && AJ.asistencia && ladoDe(b.c[1]) === S.miEquipo) bola.cae = { x: fx(b.c[0]), y: fy(b.c[1]) };
  const jug = b.j.map((q, i) => {
    const p = a.j[i] || q;
    const slot = S.slots?.[i];
    const j = {
      id: i,
      x: lerp(p[0], q[0]),
      y: lerp(p[1], q[1]),
      vx: q[2],
      vy: q[3],
      lado: i < 2 ? 0 : 1,
      anim: q[4],
      swing: q[5],
      ultimoTiro: TIROS[q[6]] || null,
      humano: !!slot?.pid,
      nombre: slot?.nombre,
      color: slot?.color || (i < 2 ? '#9BE36B' : '#FF8A7A'),
      colorPala: slot?.pala || '#0F1C22',
      zurdo: !!slot?.zurdo,
    };
    return vistaJugador(j, fx, fy, flip, i === S.miId && !!yoH?.al);
  });
  sugerir(AJ.asistencia ? yoH?.sg || null : null);
  const ap = yoH?.ap;
  const yo = jug[S.miId];
  return {
    t: b.tt,
    estado: b.e,
    fiesta: b.f,
    ganador: b.g,
    bola,
    jug,
    apunte: ap ? { tx: ap[0] == null ? null : fx(ap[0]), prof: ap[1] } : null,
    yo: yo ? { x: yo.x, y: yo.y } : null,
    marcador: S.marcador,
  };
}
function aplicarEvento(ev) {
  const [tipo, ...a] = ev;
  if (tipo === 'so') onSonido(...a);
  else if (tipo === 'fx') onEfecto(...a);
  else if (tipo === 'av') onAviso(a[0]);
  else if (tipo === 'ay') onAyuda(...a);
}

// ================================================================ arranque
function applyPrefs() {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  const k = teclasTxt();
  $('teclas').innerHTML = t('teclas', Object.fromEntries(Object.entries(k).map(([a, b]) => [a, `<kbd>${b}</kbd>`])));
  document.body.classList.toggle('touch', !!G.prefs.touch);
  S.hudKey = '';
  if ($('s-setup').classList.contains('on')) abrirSetup();
  if ($('s-ajustes').classList.contains('on')) abrirAjustes();
  if (online?.room && online.room.state === 'lobby') renderLobby(online.room);
  layout();
}
G.onPrefs(applyPrefs, true);
G.onPause(() => {
  Input.teclas.clear();
  applyKeys();
  if (S.modo === 'local' && S.m && !S.pausa && !S.fin) alternarPausa();
});
addEventListener('resize', () => layout());
window.visualViewport?.addEventListener('resize', () => layout());
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
  window.__padel = {
    S,
    get online() {
      return online;
    },
  };
