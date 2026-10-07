/** Tope de salas en tiempo real (MAX_RT_ROOMS), estadísticas rt en la lista y /health, eco del ping y opciones al crear. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, connect, wait } from './helpers.mjs';

let srv;
before(async () => {
  srv = await startServer({ MAX_RT_ROOMS: '2', ROOMS_PER_IP: '30', MAX_CONN_PER_IP: '40', JOINS_PER_MIN: '100' });
});
after(() => srv?.stop());

const create = async (game, name = 'Ana', settings) => {
  const c = await connect(srv.port);
  c.send({ t: 'create', game, name, ...(settings ? { settings } : {}) });
  await wait(200);
  return c;
};
/** Sale de la sala (la cierra si era el último) y corta el socket. */
const bye = async (...cs) => {
  for (const c of cs) {
    c.send({ t: 'leave' });
    c.ws.close();
  }
  await wait(150);
};
const health = () => fetch(`http://127.0.0.1:${srv.port}/health`).then((r) => r.json());

test('el tope de salas en vivo cuenta juegos que declaran realtime y los que todavía no (ameba, serpentina, clashball, padel)', async () => {
  const a = await create('ameba');
  const b = await create('estela');
  assert.ok(a.last('joined') && b.last('joined'));
  const c = await create('serpentina');
  assert.equal(c.last('joined'), undefined);
  assert.deepEqual(c.last('error'), { t: 'error', code: 'server_full_rt' });
  const d = await create('estela');
  assert.equal(d.last('error')?.code, 'server_full_rt');
  const e = await create('padel');
  assert.equal(e.last('error')?.code, 'server_full_rt');
  const f = await create('clashball');
  assert.equal(f.last('error')?.code, 'server_full_rt');
  // los demás juegos no se ven afectados
  const g = await create('tictactoe');
  assert.ok(g.last('joined'));
  // y se puede entrar a una sala que ya existe
  const h = await connect(srv.port);
  h.send({ t: 'join', game: 'estela', code: b.last('joined').code, name: 'Beto' });
  await wait(250);
  assert.ok(h.last('joined'));
  await bye(a, b, c, d, e, f, g, h);
});

test('al cerrarse una sala en vivo vuelve a haber lugar', async () => {
  const before = (await health()).rt.rooms;
  assert.equal(before, 0, 'todas las salas anteriores se cerraron');
  const a = await create('ameba');
  const b = await create('estela');
  const c = await create('estela');
  assert.equal(c.last('error')?.code, 'server_full_rt');
  a.send({ t: 'leave' });
  await wait(200);
  const d = await create('estela');
  assert.ok(d.last('joined'), 'ya hay lugar');
  await bye(a, b, c, d);
});

test('rt en /health y en la lista de salas: cantidad, tope y costo medio del paso', async () => {
  const a = await create('estela');
  await wait(600);
  const h = await health();
  assert.equal(h.rt.rooms, 1);
  assert.equal(h.rt.max, 2);
  assert.equal(typeof h.rt.avgTickMs, 'number');
  assert.ok(h.rt.avgTickMs >= 0 && h.rt.avgTickMs < 20);
  const q = await connect(srv.port);
  q.send({ t: 'list', game: 'estela' });
  q.send({ t: 'list', game: 'tictactoe' });
  await wait(200);
  const lists = q.all('list');
  assert.deepEqual(lists.map((l) => l.rt?.max), [2, 2]);
  assert.equal(lists[0].rt.rooms, 1);
  await bye(a, q);
});

test('el pong devuelve la marca del cliente (c) para medir el RTT, y sigue funcionando sin ella', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'ping', c: 12345.5 });
  c.send({ t: 'ping' });
  c.send({ t: 'ping', c: 'x'.repeat(100) });
  await wait(150);
  const pongs = c.all('pong');
  assert.equal(pongs.length, 3);
  assert.equal(pongs[0].c, 12345.5);
  assert.equal(typeof pongs[0].now, 'number');
  assert.equal(pongs[1].c, undefined);
  assert.equal(pongs[2].c, undefined, 'no se hace eco de cualquier cosa');
  c.ws.close();
});

test('create acepta opciones iniciales (settings) y las valida con el módulo del juego', async () => {
  const a = await create('estela', 'Ana', { speed: 'fast', size: 'small', public: false, bots: false, hack: 1, size2: 'x' });
  const room = a.last('room').room;
  assert.deepEqual([room.settings.speed, room.settings.size, room.settings.public, room.settings.bots], ['fast', 'small', false, false]);
  assert.equal(room.settings.hack, undefined);
  assert.equal(a.last('me').size, 120);
  assert.equal(a.last('me').tps, 26);
  const b = await create('estela', 'Beto', { speed: 'turbo', size: 7 });
  assert.equal(b.last('error')?.code ?? 'ok', 'ok', 'o entra o hay tope (2 salas)');
  await bye(a, b);
});

test('sin errores no controlados', () => {
  assert.doesNotMatch(srv.logs(), /\bfatal\b|^\S+ error /m);
});
