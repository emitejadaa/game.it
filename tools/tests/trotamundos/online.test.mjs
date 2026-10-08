// Pruebas de la lógica pura del cliente online de Trotamundos (online-logica.js, online-textos.js)  ·  npm test
// Sin navegador ni red: las pantallas del online se prueban en un Chromium aparte. Los datos de ejemplo salen del
// módulo real del servidor (server/games/trotamundos.js) para que el contrato de tm no se desacople.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../../../public/games/trotamundos/online-logica.js';
import { TEXTOS_ONLINE } from '../../../public/games/trotamundos/online-textos.js';
import { TEXTOS } from '../../../public/games/trotamundos/textos.js';
import mod from '../../../server/games/trotamundos.js';

const DIR = new URL('../../../public/games/trotamundos/', import.meta.url);
const fuente = (f) => readFileSync(new URL(f, DIR), 'utf8');
const COLORES = ['#ff5a5f', '#3ec1ff', '#ffc93c', '#7bd389', '#c77dff'];

// ---------------------------------------------------------------- sala de ejemplo armada con el módulo real del servidor
function sala(n = 3, ajustes = {}) {
  const players = new Map();
  for (let i = 0; i < n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Jugador ${i}`, color: COLORES[i], connected: true, goneAt: 0 });
  const room = { code: 'ABCDE', game: 'trotamundos', host: 'p0', state: 'playing', settings: { ...mod.defaults, time: 60, ...ajustes }, players, data: null };
  const api = {
    players: () => [...players.values()],
    connected: (id) => !!players.get(id)?.connected,
    setTimer() {},
    clearTimer() {},
    touch() {},
    sync() {},
    broadcast() {},
    send() {},
    end() {
      room.state = 'finished';
    },
    toLobby() {},
  };
  mod.start(room, api);
  const jugadores = () => api.players().map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }));
  const tm = () => mod.view(room).tm;
  const msg = (id, m) => mod.message(room, api, players.get(id), m);
  return { room, api, jugadores, tm, msg };
}

/** Juega una ronda entera: todos confirman un pin (cada uno un poco más lejos) y pasa a la revelación. */
function jugarRonda(s) {
  const tm = s.tm();
  [...s.room.players.keys()].forEach((id, i) => s.msg(id, { t: 'guess', lat: tm.loc.lat + 0.5 + i * 3, lng: tm.loc.lng + 0.5 }));
}

// ---------------------------------------------------------------- entrada
test('normalizarCodigo: mayúsculas, solo letras y números, máximo 5', () => {
  assert.equal(L.normalizarCodigo(' ab-c1 2x9 '), 'ABC12');
  assert.equal(L.normalizarCodigo(null), '');
  assert.equal(L.normalizarCodigo('<b>x</b>'), 'BXB');
});

test('normalizarNombre: igual que el servidor (sin < > ni control, 16 como máximo) y con nombre por defecto', () => {
  assert.equal(L.normalizarNombre('  Ana <b>\n', 'X'), 'Ana b');
  assert.equal(L.normalizarNombre('   ', 'Jugador 42'), 'Jugador 42');
  assert.equal(L.normalizarNombre('a'.repeat(30)).length, 16);
});

// ---------------------------------------------------------------- reloj
test('reloj con el desfase del servidor', () => {
  const local = 1_000_000;
  const servidor = 1_000_000 + 2500; // el servidor está 2,5 s adelantado
  const off = L.desfase(servidor, local);
  assert.equal(off, 2500);
  const t1 = servidor + 90_000;
  assert.equal(L.restanteMs(t1, local + 10_000 + off), 80_000);
  assert.equal(L.restanteMs(t1, t1 + 5), 0, 'nunca negativo');
  assert.equal(L.restanteMs(undefined, 100), 0);
});

test('segundos redondea para arriba y formatoReloj arma m:ss', () => {
  assert.equal(L.segundos(0), 0);
  assert.equal(L.segundos(1), 1);
  assert.equal(L.segundos(1000), 1);
  assert.equal(L.segundos(1001), 2);
  assert.equal(L.segundos(-5), 0);
  assert.equal(L.formatoReloj(0), '0:00');
  assert.equal(L.formatoReloj(9), '0:09');
  assert.equal(L.formatoReloj(90), '1:30');
  assert.equal(L.formatoReloj(600), '10:00');
  assert.equal(L.formatoReloj(-3), '0:00');
});

test('relojVisible: con tiempo siempre; sin límite solo con apurar o cerca del tope', () => {
  const a = 1000;
  assert.equal(L.relojVisible({ phase: 'look', time: 60, t1: a + 60_000, done: [] }, a), true);
  assert.equal(L.relojVisible({ phase: 'look', time: 0, rush: 0, t1: a + 360_000, done: [] }, a), false);
  assert.equal(L.relojVisible({ phase: 'look', time: 0, rush: 1, t1: a + 360_000, done: [] }, a), false, 'apurar sin nadie confirmado: todavía no');
  assert.equal(L.relojVisible({ phase: 'look', time: 0, rush: 1, t1: a + 15_000, done: ['p1'] }, a), true, 'apurar con alguien confirmado: el servidor acortó t1');
  assert.equal(L.relojVisible({ phase: 'look', time: 0, rush: 0, t1: a + 20_000, done: [] }, a), true, 'cerca del tope de seguridad');
  assert.equal(L.relojVisible({ phase: 'reveal', time: 60, t1: a + 5000, done: [] }, a), false);
  assert.equal(L.relojVisible(null, a), false);
});

test('claveRonda cambia con la ronda y con cada cambio de ubicación', () => {
  assert.equal(L.claveRonda({ round: 2, swaps: 0 }), '2.0');
  assert.equal(L.claveRonda({ round: 2, swaps: 1 }), '2.1');
  assert.notEqual(L.claveRonda({ round: 2, swaps: 1 }), L.claveRonda({ round: 3, swaps: 1 }));
  assert.equal(L.claveRonda(null), '');
});

test('debeAutoEnviar: con pin puesto y casi sin tiempo, una sola vez', () => {
  const tm = { phase: 'look', playing: ['yo', 'otro'], done: [], t1: 10_000 };
  const base = { tengoPin: true, confirmado: false };
  assert.equal(L.debeAutoEnviar(tm, 'yo', 9_100, base), true);
  assert.equal(L.debeAutoEnviar(tm, 'yo', 9_000, base), false, 'faltan más de 0,9 s');
  assert.equal(L.debeAutoEnviar(tm, 'yo', 9_500, base), true);
  assert.equal(L.debeAutoEnviar(tm, 'yo', 5_000, base), false, 'todavía queda tiempo');
  assert.equal(L.debeAutoEnviar(tm, 'yo', 9_500, { tengoPin: false, confirmado: false }), false, 'sin pin no hay nada que mandar');
  assert.equal(L.debeAutoEnviar(tm, 'yo', 9_500, { tengoPin: true, confirmado: true }), false, 'ya lo mandé');
  assert.equal(L.debeAutoEnviar({ ...tm, done: ['yo'] }, 'yo', 9_500, base), false, 'el servidor ya me tiene');
  assert.equal(L.debeAutoEnviar(tm, 'tarde', 9_500, base), false, 'quien mira no juega');
  assert.equal(L.debeAutoEnviar({ ...tm, phase: 'reveal' }, 'yo', 9_500, base), false);
});

// ---------------------------------------------------------------- ronda con el módulo real
test('quienConfirmo: los que juegan, con su color y si ya confirmaron', () => {
  const s = sala(3);
  s.msg('p1', { t: 'guess', lat: 10, lng: 10 });
  const q = L.quienConfirmo(s.tm(), s.jugadores());
  assert.deepEqual(q.map((p) => [p.id, p.listo]), [['p0', false], ['p1', true], ['p2', false]]);
  assert.equal(q[1].color, COLORES[1]);
  assert.ok(q.every((p) => p.connected));
  // quien entra con la partida empezada no está en tm.playing: mira
  s.room.players.set('tarde', { id: 'tarde', name: 'Tarde', color: '#000', connected: true, goneAt: 0 });
  mod.onJoin(s.room, s.api, 'tarde');
  assert.equal(L.juegaEnRonda(s.tm(), 'tarde'), false);
  assert.equal(L.juegaEnRonda(s.tm(), 'p0'), true);
  assert.equal(L.quienConfirmo(s.tm(), s.jugadores()).length, 3, 'el que mira no aparece entre los que juegan');
});

test('mayoria: mitad más uno (igual que el servidor)', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 10].map(L.mayoria), [1, 2, 2, 3, 3, 6]);
});

test('estadoNoImg: visible solo en la ventana de 25 s, con cambios disponibles y si juego', () => {
  const s = sala(3);
  const tm = s.tm();
  const ps = s.jugadores();
  assert.ok(tm.swapsLeft > 0, 'el servidor tiene lugares de repuesto');
  let e = L.estadoNoImg(tm, 'p0', tm.t0 + 1000, ps);
  assert.deepEqual(e, { visible: true, yaPedi: false, pedidos: 0, necesarios: 2 });
  assert.equal(L.estadoNoImg(tm, 'p0', tm.t0 + L.NOIMG_VENTANA_MS, ps).visible, true, 'justo en el límite todavía se puede');
  assert.equal(L.estadoNoImg(tm, 'p0', tm.t0 + L.NOIMG_VENTANA_MS + 1, ps).visible, false, 'pasados los 25 s desaparece');
  assert.equal(L.estadoNoImg({ ...tm, swapsLeft: 0 }, 'p0', tm.t0 + 1000, ps).visible, false, 'sin cambios que dar');
  assert.equal(L.estadoNoImg({ ...tm, phase: 'reveal' }, 'p0', tm.t0 + 1000, ps).visible, false);
  assert.equal(L.estadoNoImg(tm, 'tarde', tm.t0 + 1000, ps).visible, false, 'quien mira no puede pedirlo');
  // un pedido: se ve cuántos van y que yo ya lo pedí
  s.msg('p1', { t: 'noimg' });
  e = L.estadoNoImg(s.tm(), 'p1', s.tm().t0 + 1000, ps);
  assert.equal(e.yaPedi, true);
  assert.equal(e.pedidos, 1);
  assert.equal(L.estadoNoImg(s.tm(), 'p0', s.tm().t0 + 1000, ps).yaPedi, false);
  // con los desconectados fuera de la cuenta, la mayoría baja
  s.room.players.get('p2').connected = false;
  assert.equal(L.estadoNoImg(s.tm(), 'p0', s.tm().t0 + 1000, s.jugadores()).necesarios, 2);
});

test('con la mayoría, el servidor cambia la ubicación y la clave de la ronda cambia', () => {
  const s = sala(3);
  const antes = s.tm();
  const k0 = L.claveRonda(antes);
  s.msg('p0', { t: 'noimg' });
  assert.equal(L.claveRonda(s.tm()), k0, 'con uno solo no alcanza');
  s.msg('p1', { t: 'noimg' });
  const despues = s.tm();
  assert.equal(despues.swaps, 1);
  assert.notEqual(L.claveRonda(despues), k0, 'el visor se recarga');
  assert.notDeepEqual(despues.loc, antes.loc);
  assert.deepEqual(despues.done, [], 'los pines se descartan');
});

// ---------------------------------------------------------------- revelación, ranking y podio
test('puestos: los empates comparten puesto', () => {
  assert.deepEqual(L.puestos([{ pts: 9 }, { pts: 9 }, { pts: 5 }, { pts: 5 }, { pts: 1 }]), [1, 1, 3, 3, 5]);
  assert.deepEqual(L.puestos([]), []);
});

test('tablaRevelacion con una ronda real: puntos, distancia, total y quién soy', () => {
  const s = sala(3);
  jugarRonda(s);
  const tm = s.tm();
  assert.equal(tm.phase, 'reveal');
  const filas = L.tablaRevelacion(tm, s.jugadores(), 'p1');
  assert.equal(filas.length, 3);
  assert.deepEqual(filas.map((f) => f.puesto), [1, 2, 3]);
  assert.ok(filas[0].pts >= filas[1].pts && filas[1].pts >= filas[2].pts);
  assert.equal(filas[0].id, 'p0', 'el más cercano va primero');
  assert.equal(filas.find((f) => f.yo).id, 'p1');
  assert.equal(filas.find((f) => f.id === 'p2').color, COLORES[2]);
  for (const f of filas) {
    assert.equal(f.total, tm.scores[f.id], 'el total es el acumulado del servidor');
    assert.equal(f.sinPin, false);
    assert.ok(f.km > 0);
  }
});

test('tablaRevelacion: quien no confirmó figura sin pin y con 0 puntos', () => {
  const s = sala(3);
  s.msg('p0', { t: 'guess', lat: 1, lng: 1 });
  s.msg('p1', { t: 'guess', lat: 2, lng: 2 });
  s.room.players.get('p2').connected = false; // se cae: al irse el último pendiente la ronda termina
  mod.onDisconnect(s.room, s.api, 'p2');
  const tm = s.tm();
  assert.equal(tm.phase, 'reveal');
  const f = L.tablaRevelacion(tm, s.jugadores(), 'p0').find((x) => x.id === 'p2');
  assert.deepEqual([f.sinPin, f.pts, f.km, f.connected], [true, 0, null, false]);
  const pins = L.pinsRevelacion(tm.reveal.results, s.jugadores(), 'p0', 'vos');
  assert.equal(pins.length, 2, 'sin pin no se dibuja');
  assert.equal(pins.find((p) => p.etiqueta === 'Jugador 0 (vos)').color, COLORES[0]);
});

test('partida completa: ranking, ganadores, podio y datos del mapa de las rondas', () => {
  const s = sala(3, { rounds: 3 });
  for (let r = 0; r < 3; r++) {
    assert.equal(s.tm().phase, 'look');
    jugarRonda(s);
    assert.equal(s.tm().phase, 'reveal');
    assert.ok(s.msg('p0', { t: 'next' }));
  }
  const tm = s.tm();
  assert.equal(tm.phase, 'end');
  assert.equal(s.room.state, 'finished');
  const rank = L.rankingFinal(tm.ranking, 'p2');
  assert.equal(rank.length, 3);
  assert.deepEqual(rank.map((r) => r.puesto), [1, 2, 3]);
  assert.equal(rank.find((r) => r.yo).id, 'p2');
  assert.equal(L.ganadores(tm.ranking).length, 1);
  assert.equal(L.ganadores(tm.ranking)[0].id, 'p0');
  assert.deepEqual(L.podio(tm.ranking).map((p) => p.puesto), [2, 1, 3], 'orden visual: 2.º, 1.º, 3.º');
  const rondas = L.rondasParaMapa(tm.history, 'p1');
  assert.equal(rondas.length, 3);
  for (const [i, r] of rondas.entries()) {
    assert.equal(r.real.id, tm.history[i].place.id);
    assert.ok(Number.isFinite(r.guess.lat) && Number.isFinite(r.guess.lng));
  }
  assert.equal(L.rondasParaMapa(tm.history, 'nadie')[0].guess, null);
});

test('podio y ranking con empates y con 2 jugadores', () => {
  const r = [
    { id: 'a', name: 'A', color: '#111', pts: 9000 },
    { id: 'b', name: 'B', color: '#222', pts: 9000 },
    { id: 'c', name: 'C', color: '#333', pts: 100 },
  ];
  assert.deepEqual(L.ganadores(r).map((g) => g.id), ['a', 'b']);
  assert.deepEqual(L.podio(r).map((p) => [p.id, p.puesto]), [['a', 1], ['b', 1], ['c', 3]]);
  assert.deepEqual(L.podio(r.slice(0, 2)).map((p) => p.puesto), [1, 1]);
  assert.deepEqual(L.podio([r[0]]).map((p) => p.id), ['a']);
  assert.deepEqual(L.podio([]), []);
  assert.deepEqual(L.ganadores([]), []);
  const muchos = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, name: `X${i}`, color: '#000', pts: 1000 - i * 10 }));
  assert.equal(L.podio(muchos).length, 3);
  assert.equal(L.rankingFinal(muchos, 'x9').length, 10);
});

test('nombreCortoLugar: famoso en el idioma, al azar con población o país', () => {
  const pais = (cc) => ({ AR: 'Argentina', FR: 'Francia' })[cc] || cc;
  assert.equal(L.nombreCortoLugar({ n: { es: 'Obelisco', en: 'Obelisk' }, cc: 'AR' }, 'en', pais), 'Obelisk');
  assert.equal(L.nombreCortoLugar({ n: { es: 'Obelisco', en: '' }, cc: 'AR' }, 'en', pais), 'Obelisco');
  assert.equal(L.nombreCortoLugar({ n: null, p: 'Lyon', cc: 'FR' }, 'es', pais), 'Lyon');
  assert.equal(L.nombreCortoLugar({ n: null, p: null, cc: 'FR' }, 'es', pais), 'Francia');
  assert.equal(L.nombreCortoLugar(null, 'es', pais), '');
});

// ---------------------------------------------------------------- salas públicas
test('ordenarSalas y elegirSalaRapida: la que espera en el lobby y tiene más gente', () => {
  const salas = [
    { code: 'AAAAA', n: 2, max: 10, state: 'playing' },
    { code: 'BBBBB', n: 3, max: 10, state: 'lobby' },
    { code: 'CCCCC', n: 10, max: 10, state: 'lobby' }, // llena
    { code: 'DDDDD', n: 5, max: 10, state: 'lobby' },
    { code: 'EEEEE', n: 4, max: 10, state: 'finished' },
  ];
  assert.deepEqual(L.ordenarSalas(salas).map((s) => s.code), ['DDDDD', 'BBBBB', 'EEEEE', 'AAAAA'], 'primero el lobby con más gente; las llenas no se ofrecen');
  assert.equal(L.elegirSalaRapida(salas).code, 'DDDDD');
  assert.equal(L.elegirSalaRapida([{ code: 'AAAAA', n: 2, max: 10, state: 'playing' }]), null, 'una sala en juego no es para la partida rápida');
  assert.equal(L.elegirSalaRapida([]), null);
  assert.equal(L.elegirSalaRapida(null), null);
  assert.deepEqual(L.ordenarSalas([null, { n: 1, max: 2 }, { code: 'ZZZZZ', n: 1, max: 2, state: 'lobby' }]).map((s) => s.code), ['ZZZZZ']);
});

// ---------------------------------------------------------------- ajustes
test('cambiarAjuste arma los ajustes completos con los tipos que pide el servidor', () => {
  const base = { ...mod.defaults };
  assert.equal(L.cambiarAjuste(base, 'rounds', '10').rounds, 10);
  assert.equal(L.cambiarAjuste(base, 'frozen', true).frozen, 1);
  assert.equal(L.cambiarAjuste(base, 'rush', false).rush, 0);
  assert.equal(L.cambiarAjuste(base, 'public', 1).public, true);
  assert.equal(L.cambiarAjuste(null, 'scope', 'AR').scope, 'AR');
  assert.deepEqual(L.cambiarAjuste(base, 'mode', 'famosos'), { ...base, mode: 'famosos' });
  // lo que arma lo acepta el servidor tal cual
  const s = mod.settings(base, L.cambiarAjuste(base, 'time', 30));
  assert.equal(s.time, 30);
});

test('las opciones del cliente son las que valida el servidor', () => {
  for (const r of L.RONDAS_ONLINE) assert.equal(mod.settings(mod.defaults, { rounds: r }).rounds, r);
  for (const tm of L.TIEMPOS_ONLINE) assert.equal(mod.settings(mod.defaults, { time: tm }).time, tm);
  for (const m of L.MODOS_ONLINE) assert.equal(mod.settings(mod.defaults, { mode: m }).mode, m);
  assert.deepEqual(L.AJUSTES_DEF, mod.defaults);
  assert.equal(L.MAX_JUGADORES, mod.maxPlayers);
});

test('ambitosVisibles agrega el país elegido si no está en la lista', () => {
  assert.deepEqual(L.ambitosVisibles('mundo'), L.AMBITOS_ONLINE);
  assert.deepEqual(L.ambitosVisibles('JP'), [...L.AMBITOS_ONLINE, 'JP']);
  assert.ok(L.AMBITOS_ONLINE.includes('AR') && L.AMBITOS_ONLINE.includes('europa'));
});

// ---------------------------------------------------------------- textos y reglas del código
test('textos online: es y en completos, mismas variables, claves con prefijo on_', () => {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [k, v] of Object.entries(TEXTOS_ONLINE)) {
    assert.ok(typeof v.es === 'string' && v.es.length, `${k}: falta es`);
    assert.ok(typeof v.en === 'string' && v.en.length, `${k}: falta en`);
    assert.equal(vars(v.es), vars(v.en), `${k}: las variables de es y en no coinciden`);
    assert.match(k, /^on_/, `${k}: las claves del online empiezan con on_`);
    assert.ok(!(k in TEXTOS), `${k} pisaría un texto del juego`);
  }
});

test('cada texto que usa online.js existe', () => {
  const src = fuente('online.js');
  const todos = { ...TEXTOS, ...TEXTOS_ONLINE };
  const usadas = new Set([...src.matchAll(/\bt\(\s*'([\w]+)'/g)].map((m) => m[1]));
  for (const m of src.matchAll(/\btx\([^;]*?,\s*'([\w]+)'/g)) usadas.add(m[1]);
  for (const m of src.matchAll(/\btx\(\w+,\s*'([\w]+)'/g)) usadas.add(m[1]);
  assert.ok(usadas.size > 40, 'se encontraron los usos');
  for (const k of usadas) assert.ok(todos[k], `falta el texto "${k}"`);
  // los que se arman con t(`c_${a}`) son los de continentes del juego
  for (const r of L.AMBITOS_ONLINE.filter((a) => /^[a-z]{4,}$/.test(a) && a !== 'mundo' && a !== 'latam')) assert.ok(todos[`c_${r}`], `falta c_${r}`);
  // y todos los on_ definidos se usan (nada de textos huérfanos)
  const codigo = src + fuente('online-logica.js');
  for (const k of Object.keys(TEXTOS_ONLINE)) assert.ok(codigo.includes(`'${k}'`), `${k} no se usa`);
});

test('online.js: nada de HTML armado con datos de afuera y sin marcas ajenas', () => {
  const archivos = ['online.js', 'online-logica.js', 'online-textos.js', 'online.css'].map(fuente);
  const src = archivos[0];
  assert.ok(!/insertAdjacentHTML|outerHTML|document\.write/.test(src));
  assert.ok(!/innerHTML/.test(src));
  const doc = readFileSync(new URL('../../../docs/trotamundos.md', import.meta.url), 'utf8');
  for (const txt of [...archivos, doc]) for (const marca of ['geo' + 'guessr', 'world' + 'guessr']) assert.ok(!txt.toLowerCase().includes(marca));
  // abrirOnline guarda el estado antes del primer await (sin doble armado) y la sala perdida vuelve a la entrada
  assert.ok(/if \(O\) return abriendo/.test(src));
  assert.ok(/code === 'not_found'[^\n]*\n?[^\n]*volverALaEntrada|volverALaEntrada\(t\('on_salaYaNo'\)\)/.test(src));
  // nada sobre la banda de Google: no hay posiciones fijas abajo del visor en la pantalla de la ronda
  // (la barra de acciones del lobby es pegajosa, pero el lobby no tiene visor)
  const sinLobby = archivos[3].split('\n').filter((l) => !l.includes('.on-lobby-acc')).join('\n');
  assert.ok(!/(?<![-\w])bottom:\s*0\b/.test(sinLobby), 'online.css no fija nada contra el borde de abajo');
});

test('online.js usa solo rutas permitidas y el contrato de mensajes del servidor', () => {
  const src = fuente('online.js');
  for (const m of src.matchAll(/from\s+'(\/[^']*)'/g)) assert.match(m[1], /^\/(sdk|shared|vendor|games)\//);
  for (const t of ['guess', 'noimg', 'next', 'rematch', 'kick', 'start', 'settings', 'list']) assert.ok(src.includes(`t: '${t}'`), `online.js no manda { t: '${t}' }`);
  for (const t of ['swap', 'mine', 'closed', 'kicked', 'list']) assert.ok(new RegExp(`case '${t}'`).test(src), `online.js no atiende '${t}'`);
});
