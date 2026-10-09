/** Menú compartido de las arenas: las partes puras (saneo de nombres y códigos, "Partida rápida", filas de la lista, ajustes) y el pegamento con OnlineRoom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// el módulo es de navegador: online.js mira `window` y `location` al cargarse
globalThis.window = globalThis;
globalThis.location = { hostname: 'ejemplo.test', search: '', origin: 'https://ejemplo.test' };
const { sanitizeName, cleanCode, pickQuickRoom, roomRow, createSettings, connState } = await import('../public/shared/arena-lobby.js');
const { OnlineRoom, netText } = await import('../public/shared/online.js');

test('sanitizeName: saca controles y < >, junta espacios y acota el largo', () => {
  assert.equal(sanitizeName('  Ana   María  '), 'Ana María');
  assert.equal(sanitizeName('<img src=x onerror=alert(1)>'), 'img src=x onerro', 'sin < > y acotado a 16');
  assert.doesNotMatch(sanitizeName('<script>alert(1)</script>', 40), /[<>]/);
  assert.equal(sanitizeName('a\u0000b\u001fc\u007fd\n e'), 'abcd e');
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
  assert.equal(sanitizeName('x'.repeat(40), 28).length, 28);
  assert.equal(sanitizeName(null), '');
  assert.equal(sanitizeName(undefined), '');
  assert.equal(sanitizeName(12345), '12345');
});

test('cleanCode: 5 letras o números en mayúsculas', () => {
  assert.equal(cleanCode('ab-c d1e2f'), 'ABCD1');
  assert.equal(cleanCode('  xyz '), 'XYZ');
  assert.equal(cleanCode(null), '');
  assert.equal(cleanCode('ñandú99'), 'AND99', 'sin acentos ni eñes');
});

test('pickQuickRoom: la sala en juego más poblada que tenga lugar; si no hay, null', () => {
  const r = (code, n, state = 'playing', max = 10) => ({ code, n, max, state });
  assert.equal(pickQuickRoom([]), null);
  assert.equal(pickQuickRoom(undefined), null);
  assert.equal(pickQuickRoom([r('AAAAA', 2), r('BBBBB', 7), r('CCCCC', 5)]), 'BBBBB');
  assert.equal(pickQuickRoom([r('AAAAA', 10), r('BBBBB', 4)]), 'BBBBB', 'la llena no sirve');
  assert.equal(pickQuickRoom([r('AAAAA', 3, 'lobby'), r('BBBBB', 1)]), 'BBBBB', 'solo las que están en juego');
  assert.equal(pickQuickRoom([r('AAAAA', 10), r('BBBBB', 2, 'lobby')]), null);
  assert.equal(pickQuickRoom([r('AAAAA', 4), r('BBBBB', 4)]), 'AAAAA', 'empate: la primera de la lista');
  assert.equal(pickQuickRoom([null, { code: 'X' }, r('DDDDD', 1)]), 'DDDDD', 'ignora filas rotas');
});

test('roomRow: nombre, jugadores, bots y estado en es / en; una sala llena no se puede elegir', () => {
  const room = { code: 'ABCDE', n: 3, max: 10, bots: 7, state: 'playing', name: 'Sala de Ana' };
  assert.deepEqual(roomRow(room, 'es'), { code: 'ABCDE', title: 'Sala de Ana', meta: '3/10 jugadores · 7 bots', state: 'en juego', joinable: true });
  assert.deepEqual(roomRow({ ...room, bots: 0, state: 'lobby' }, 'en'), { code: 'ABCDE', title: 'Sala de Ana', meta: '3/10 players', state: 'waiting', joinable: true });
  assert.equal(roomRow({ ...room, n: 10 }, 'es').joinable, false);
  assert.equal(roomRow({ ...room, name: '' }, 'es').title, 'Sala');
  assert.equal(roomRow({ ...room, name: 'z'.repeat(80) }, 'es').title.length, 28);
});

test('createSettings: solo claves y valores del esquema; public y bots siempre', () => {
  const schema = [
    { key: 'speed', options: [{ value: 'normal' }, { value: 'fast' }] },
    { key: 'size', options: [{ value: 'small' }, { value: 'normal' }] },
  ];
  assert.deepEqual(createSettings(schema, { speed: 'fast', size: 'small' }, { isPublic: false, bots: true }), { public: false, bots: true, speed: 'fast', size: 'small' });
  assert.deepEqual(createSettings(schema, { speed: 'turbo', size: 'gigante', extra: 1 }, { isPublic: true, bots: false }), { public: true, bots: false }, 'valores inventados se descartan');
  assert.deepEqual(createSettings([], {}, { isPublic: true }), { public: true, bots: true });
  assert.deepEqual(createSettings(undefined, undefined, { isPublic: true }), { public: true, bots: true });
});

test('connState: estados de OnlineRoom → estado del chip', () => {
  assert.equal(connState('open'), 'ok');
  assert.equal(connState('connecting'), 'connecting');
  assert.equal(connState('wakeup'), 'connecting');
  assert.equal(connState('reconnecting'), 'reconnecting');
  assert.equal(connState('netError'), 'lost');
  assert.equal(connState('rate'), undefined, 'un aviso de ritmo no cambia el chip');
});

test('OnlineRoom: create() manda los ajustes y los pong llegan al kit de red', () => {
  const pongs = [];
  const room = new OnlineRoom('estela', { onPong: (m) => pongs.push(m) });
  const sent = [];
  room.send = (m) => sent.push(m);
  room.create('Ana', { public: true, bots: true, speed: 'fast' });
  room.create('Beto');
  assert.deepEqual(sent[0], { t: 'create', game: 'estela', name: 'Ana', settings: { public: true, bots: true, speed: 'fast' } });
  assert.deepEqual(sent[1], { t: 'create', game: 'estela', name: 'Beto' }, 'sin ajustes no se manda la clave');
  room.handle({ t: 'pong', c: 123, now: 456 });
  assert.deepEqual(pongs, [{ t: 'pong', c: 123, now: 456 }]);
  const seen = [];
  const plain = new OnlineRoom('estela', { onMessage: (m) => seen.push(m) });
  plain.handle({ t: 'pong', now: 1 });
  assert.deepEqual(seen, [], 'un pong sin escucha se descarta como siempre');
});

test('textos de error: servidor lleno de arenas en vivo, es / en', () => {
  assert.match(netText('server_full_rt'), /partidas en vivo/);
  globalThis.GameIt = { prefs: { lang: 'en' } };
  assert.match(netText('server_full_rt'), /live games/);
  delete globalThis.GameIt;
});
