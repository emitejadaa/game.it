/** Garabato: el servidor limita los rellenos del que dibuja (un relleno repinta la hoja entera en cada visor). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, connect, wait } from './helpers.mjs';

let srv;
before(async () => {
  srv = await startServer({});
});
after(() => srv?.stop());

test('Garabato: rellenos seguidos se descartan (máximo uno cada 250 ms) y el resto del dibujo pasa', async () => {
  const a = await connect(srv.port, '10.7.0.1');
  const b = await connect(srv.port, '10.7.0.2');
  a.send({ t: 'create', game: 'garabato', name: 'Ana' });
  await wait(150);
  b.send({ t: 'join', game: 'garabato', code: a.last('joined').code, name: 'Beto' });
  await wait(150);
  a.send({ t: 'start' });
  await wait(400);
  const [drawer, guesser] = a.last('choices') ? [a, b] : [b, a];
  assert.ok(drawer.last('choices'), 'alguien recibe las palabras para elegir');
  drawer.send({ t: 'pick', i: 0 });
  await wait(300);
  const fill = (x) => drawer.send({ t: 'op', o: { k: 'f', x, y: 100, c: 1 } });
  fill(10);
  fill(20);
  fill(30); // tres rellenos en pocos milisegundos
  drawer.send({ t: 'op', o: { k: 's', c: 2, w: 1, p: [10, 10, 20, 20] } }); // un trazo en el medio sigue pasando
  await wait(350);
  fill(40); // pasado el intervalo, entra
  await wait(250);
  const ops = guesser.all('op').map((m) => m.o);
  assert.deepEqual(ops.filter((o) => o.k === 'f').map((o) => o.x), [10, 40]);
  assert.equal(ops.filter((o) => o.k === 's').length, 1);
  a.ws.close();
  b.ws.close();
});

test('el servidor no registra errores no controlados', () => {
  assert.doesNotMatch(srv.logs(), /\bfatal\b|TypeError|ReferenceError/);
});
