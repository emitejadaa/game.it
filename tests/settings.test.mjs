/**
 * Los `settings()` de cada juego online reciben JSON de cualquier cliente: tienen que descartar lo que no
 * conocen sin tirar errores, sin agregar claves y sin contaminar prototipos (p. ej. "constructor" o "__proto__"
 * como nombre de modo/estadio).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const DIR = new URL('../server/games/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.js') && !f.startsWith('_'));

const HOSTILE = [
  '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', '', ' ', 'x'.repeat(10000),
  NaN, Infinity, -Infinity, -1, 0, 1e308, 2 ** 53, -(2 ** 31),
  null, undefined, true, false, {}, [], [1, 2, 3], { __proto__: { polluted: 1 } }, JSON.parse('{"__proto__":{"polluted":1}}'), () => 1,
];

for (const f of files) {
  test(`settings() de ${f} ignora valores hostiles`, async () => {
    const mod = (await import(new URL(f, DIR).href)).default;
    if (typeof mod.settings !== 'function') return;
    const defaults = { ...(mod.defaults || {}) };
    const keys = Object.keys(defaults);
    const inputs = [];
    for (const k of keys) for (const v of HOSTILE) inputs.push({ [k]: v });
    for (const v of HOSTILE) inputs.push({ [String(typeof v === 'string' ? v : 'x')]: v });
    inputs.push(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'));
    inputs.push(Object.fromEntries(keys.map((k) => [k, '__proto__'])));
    inputs.push(Object.fromEntries(keys.map((k) => [k, 'constructor'])));
    for (const s of inputs) {
      let out;
      assert.doesNotThrow(() => (out = mod.settings({ ...defaults }, s)), `tiró con ${JSON.stringify(s, (_, v) => (typeof v === 'function' ? 'fn' : v))?.slice(0, 120)}`);
      assert.equal(Object.getPrototypeOf(out), Object.prototype, 'devuelve un objeto plano');
      for (const k of Object.keys(out)) assert.ok(keys.includes(k), `clave nueva "${k}"`);
      for (const k of keys) {
        const v = out[k];
        assert.equal(typeof v, typeof defaults[k], `${k}: tipo ${typeof v} en vez de ${typeof defaults[k]}`);
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k}: número no finito`);
        if (typeof v === 'string') assert.ok(v.length <= 2048, `${k}: cadena demasiado larga`);
        // las opciones con nombre (modo, estadio, idioma…) solo aceptan sus valores; los textos libres (default '') guardan lo que llegue como texto
        if (typeof v === 'string' && defaults[k] !== '') assert.ok(!['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'].includes(v), `${k}: se coló "${v}"`);
      }
      assert.equal(({}).polluted, undefined, 'Object.prototype contaminado');
    }
  });
}

test('el estado de arranque de cada módulo con settings por defecto no tira (clashball y ajedrez con claves de prototipo)', async () => {
  const { default: clashball } = await import(new URL('clashball.js', DIR).href);
  const out = clashball.settings({ ...clashball.defaults }, { mode: 'constructor', stadium: '__proto__' });
  assert.equal(out.mode, clashball.defaults.mode);
  assert.equal(out.stadium, clashball.defaults.stadium);
  const { default: chess } = await import(new URL('chess.js', DIR).href);
  assert.equal(chess.settings({ ...chess.defaults }, { tc: 'constructor' }).tc, chess.defaults.tc);
});
