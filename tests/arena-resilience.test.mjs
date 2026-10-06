/** Ameba y Serpentina: un error dentro del bucle no congela la arena; si se repite, la sala se cierra. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const id of ['ameba', 'serpentina']) {
  test(`${id}: el bucle se reprograma tras un error y cierra la sala al 5.º fallo seguido`, async () => {
    const mod = (await import(new URL(`../server/games/${id}.js`, import.meta.url).href)).default;
    const timers = new Map();
    const closed = [];
    const api = {
      broadcast() {},
      send() {},
      touch() {},
      sync() {},
      players: () => [],
      setTimer: (name, ms, fn) => timers.set(name, fn),
      clearTimer: (name) => timers.delete(name),
      close: (reason) => closed.push(reason),
    };
    const room = { code: 'TEST1', players: new Map(), settings: { ...mod.defaults }, state: 'playing', data: null };
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      mod.start(room, api);
      assert.ok(timers.get('loop'), 'arranca el bucle');
      room.data.w.step = () => {
        throw new Error('boom');
      };
      let runs = 0;
      while (timers.get('loop') && runs < 10) {
        const fn = timers.get('loop');
        timers.delete('loop');
        room.data.t0 -= 1000; // fuerza que haya ticks pendientes
        fn();
        runs++;
        if (!closed.length) assert.ok(timers.get('loop'), `tras el fallo ${runs} el bucle sigue programado`);
      }
      assert.equal(runs, 5);
      assert.deepEqual(closed, ['error']);
      assert.equal(timers.get('loop'), undefined, 'ya no se reprograma');
      assert.equal(errors.length, 5);
    } finally {
      console.error = orig;
    }
  });
}
