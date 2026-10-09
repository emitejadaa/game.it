/** Reporte de problemas: máquina de estados (src/ui/report-flow.js) y stub de la API (src/core/report-api.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/ui/report-flow.js';
import { parseFail, ReportError } from '../src/core/report-api.js';

const NOW = 1_700_000_000_000;
const run = (st, ...actions) => actions.reduce((s, a) => F.reduce(s, a), st);

/** Lleva el flujo hasta el paso pedido con datos válidos. */
function upTo(step, { gameId } = {}) {
  let s = F.reduce(F.create(), { type: 'open', gameId });
  if (step === 'email') return s;
  s = run(s, { type: 'email', value: 'ana@correo.com' }, { type: 'codeRequested', email: 'ana@correo.com', resendIn: 30, now: NOW });
  if (step === 'code') return s;
  s = run(s, { type: 'code', value: '123456' }, { type: 'verified', token: 'tk', expiresIn: 1800, now: NOW });
  if (step === 'where') return s;
  s = run(s, { type: 'pickWhere', id: 'quinteto' }, { type: 'next' });
  if (step === 'type') return s;
  s = run(s, { type: 'pickType', value: 'bug' }, { type: 'next' });
  if (step === 'text') return s;
  return run(s, { type: 'text', value: 'Se rompe al terminar la partida' }, { type: 'sent', id: 'r1' });
}

test('recorrido completo: email → code → where → type → text → done', () => {
  const seen = ['email', 'code', 'where', 'type', 'text', 'done'].map((s) => upTo(s).step);
  assert.deepEqual(seen, F.STEPS);
});

test('el riel de progreso: 5 segmentos y "gracias" lo deja completo', () => {
  assert.deepEqual(F.STEPS.map(F.railIndex), [1, 2, 3, 4, 5, 5]);
});

test('validación del correo', () => {
  for (const ok of ['a@b.co', 'ana.perez+juegos@mail.example.com', '  ana@correo.com  ']) assert.ok(F.validEmail(ok), ok);
  for (const bad of ['', 'ana', 'ana@', '@correo.com', 'ana@correo', 'ana@correo.c', 'a b@correo.com', 'ana@@correo.com', 'ana@correo..com', `${'a'.repeat(250)}@b.co`])
    assert.ok(!F.validEmail(bad), bad);
});

test('un correo inválido no avanza del paso 1', () => {
  const s = run(F.create(), { type: 'email', value: 'nada' }, { type: 'codeRequested', email: 'nada', now: NOW });
  assert.equal(s.step, 'email');
  assert.equal(F.canAdvance(s), false);
});

test('el código se limpia: solo dígitos, máximo 6', () => {
  assert.equal(F.cleanCode('123 456'), '123456');
  assert.equal(F.cleanCode('12-34-56-78'), '123456');
  assert.equal(F.cleanCode('abc'), '');
  assert.ok(F.codeComplete('123456'));
  assert.ok(!F.codeComplete('12345'));
});

test('verificar exige los 6 dígitos y cualquier código sirve', () => {
  const s = upTo('code');
  assert.equal(F.reduce(s, { type: 'verified', now: NOW }).step, 'code'); // sin dígitos no pasa
  assert.equal(run(s, { type: 'code', value: '12345' }, { type: 'verified', now: NOW }).step, 'code');
  for (const c of ['000000', '999999', '123456']) {
    const v = run(s, { type: 'code', value: c }, { type: 'verified', token: 't', now: NOW });
    assert.equal(v.step, 'where');
    assert.ok(F.tokenValid(v, NOW + 1000));
  }
});

test('el token vence a los 30 minutos', () => {
  const s = upTo('where');
  assert.ok(F.tokenValid(s, NOW + 1799_000));
  assert.ok(!F.tokenValid(s, NOW + 1800_000));
  assert.ok(!F.tokenValid({ ...s, token: null }, NOW));
});

test('reenvío: cuenta regresiva de 30 s', () => {
  const s = upTo('code');
  assert.equal(F.resendLeft(s, NOW), 30);
  assert.equal(F.resendLeft(s, NOW + 1), 30); // redondea hacia arriba
  assert.equal(F.resendLeft(s, NOW + 29_001), 1);
  assert.equal(F.resendLeft(s, NOW + 30_000), 0);
  assert.ok(!F.canResend(s, NOW + 5000));
  assert.ok(F.canResend(s, NOW + 30_000));
  const again = F.reduce({ ...s, code: '12' }, { type: 'codeRequested', email: s.sentTo, resendIn: 30, now: NOW + 31_000 });
  assert.equal(again.code, '12', 'reenviar conserva las casillas');
  assert.equal(F.resendLeft(again, NOW + 31_000), 30);
  assert.equal(F.resendLeft(F.reduce(again, { type: 'cooldown', secs: 90, now: NOW + 32_000 }), NOW + 32_000), 90);
});

test('"Cambiar correo" vuelve al paso 1 conservando el correo y borrando código y token', () => {
  const s = run(upTo('code'), { type: 'code', value: '12' }, { type: 'changeEmail' });
  assert.equal(s.step, 'email');
  assert.equal(s.email, 'ana@correo.com');
  assert.equal(s.code, '');
  assert.equal(s.token, null);
});

test('"Dónde": no hay botón de volver y se avanza solo con una elección', () => {
  const s = upTo('where');
  assert.ok(!F.canGoBack('where'));
  assert.equal(F.reduce(s, { type: 'back' }).step, 'where');
  assert.equal(F.reduce({ ...s, where: null }, { type: 'next' }).step, 'where');
  assert.equal(run(s, { type: 'pickWhere', id: F.HOME }, { type: 'next' }).step, 'type');
});

test('el tipo solo acepta los 5 valores y se avanza con uno elegido', () => {
  const s = upTo('type');
  assert.deepEqual(F.TYPES, ['bug', 'lag', 'mejora', 'idea', 'otro']);
  assert.equal(F.reduce(s, { type: 'pickType', value: 'spam' }).type, null);
  assert.equal(F.reduce(s, { type: 'next' }).step, 'type');
  assert.equal(run(s, { type: 'pickType', value: 'idea' }, { type: 'next' }).step, 'text');
});

test('el detalle exige 10 caracteres (sin contar espacios de los bordes) y hasta 1500', () => {
  const s = upTo('text');
  const set = (v) => F.reduce(s, { type: 'text', value: v });
  assert.ok(!F.canAdvance(set('')));
  assert.ok(!F.canAdvance(set('corto')));
  assert.ok(!F.canAdvance(set('   corto   ')));
  assert.ok(F.canAdvance(set('1234567890')));
  assert.equal(set('x'.repeat(2000)).text.length, F.MAX_TEXT);
  assert.ok(F.canAdvance(set('x'.repeat(F.MAX_TEXT))));
});

test('volver paso a paso conserva lo cargado', () => {
  let s = run(upTo('text'), { type: 'text', value: 'Se rompe al terminar' });
  s = F.reduce(s, { type: 'back' });
  assert.equal(s.step, 'type');
  assert.equal(s.type, 'bug');
  s = F.reduce(s, { type: 'back' });
  assert.equal(s.step, 'where');
  assert.equal(s.where, 'quinteto');
  s = run(s, { type: 'next' }, { type: 'next' });
  assert.equal(s.step, 'text');
  assert.equal(s.text, 'Se rompe al terminar');
});

test('las etiquetas del detalle llevan de vuelta a "dónde" o "tipo", y a ningún otro paso', () => {
  const s = upTo('text');
  assert.equal(F.reduce(s, { type: 'goto', step: 'where' }).step, 'where');
  assert.equal(F.reduce(s, { type: 'goto', step: 'type' }).step, 'type');
  assert.equal(F.reduce(s, { type: 'goto', step: 'email' }).step, 'text');
  assert.equal(F.reduce(upTo('type'), { type: 'goto', step: 'where' }).step, 'type');
});

test('las acciones fuera de lugar no hacen nada (clic tardío o duplicado)', () => {
  const s = upTo('email');
  for (const a of [{ type: 'pickType', value: 'bug' }, { type: 'sent' }, { type: 'verified', now: NOW }, { type: 'next' }, { type: 'text', value: 'hola hola hola' }])
    assert.equal(F.reduce(s, a), s);
});

test('cerrar a mitad de camino conserva el estado: al reabrir se retoma el mismo paso', () => {
  const mid = run(upTo('type'), { type: 'pickType', value: 'lag' });
  // cerrar no es una acción del flujo: el estado queda como está; reabrir solo vuelve a abrir
  const again = F.reduce(mid, { type: 'open' });
  assert.equal(again.step, 'type');
  assert.equal(again.type, 'lag');
  assert.equal(again.where, 'quinteto');
  assert.equal(again.token, 'tk');
  const mid2 = run(upTo('text'), { type: 'text', value: 'borrador sin enviar' });
  assert.equal(F.reduce(mid2, { type: 'open' }).text, 'borrador sin enviar');
});

test('después de "Gracias" se reinicia desde el paso 1 (con el correo recordado)', () => {
  const done = upTo('done');
  assert.equal(done.step, 'done');
  const fresh = F.reduce(done, { type: 'open' });
  assert.equal(fresh.step, 'email');
  assert.equal(fresh.email, 'ana@correo.com');
  assert.equal(fresh.where, null);
  assert.equal(fresh.type, null);
  assert.equal(fresh.text, '');
  assert.equal(fresh.token, null);
});

test('abrir desde un juego preselecciona ese juego; desde el menú, no', () => {
  assert.equal(F.reduce(F.create(), { type: 'open', gameId: 'ameba' }).preset, 'ameba');
  assert.equal(F.reduce(F.create(), { type: 'open', gameId: 'ameba' }).fromGame, true);
  assert.equal(F.reduce(F.create(), { type: 'open' }).preset, null);
  // si ya se eligió un lugar, una nueva apertura no lo pisa
  const picked = run(upTo('where', { gameId: 'quinteto' }), { type: 'pickWhere', id: F.HOME });
  assert.equal(F.reduce(picked, { type: 'open', gameId: 'ameba' }).preset, 'quinteto');
  // pero sin elegir todavía, la preselección sigue al juego actual
  assert.equal(F.reduce(upTo('where', { gameId: 'x' }), { type: 'open', gameId: 'y' }).preset, 'y');
});

test('lista de lugares: Inicio primero, el juego actual segundo (marcado) y sin repetirse', () => {
  const games = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(F.placesList(games).map((x) => x.id), ['home', 'a', 'b', 'c']);
  const l = F.placesList(games, 'b');
  assert.deepEqual(l.map((x) => x.id), ['home', 'b', 'a', 'c']);
  assert.ok(l[1].current && !l[2].current && l[0].home);
  assert.deepEqual(F.placesList(games, 'no-existe').map((x) => x.id), ['home', 'a', 'b', 'c']);
});

test('filtro de lugares: por palabras y sin acentos', () => {
  const items = F.placesList([{ id: 'dig', t: 'Dígitos' }, { id: 'ban', t: 'Banderín' }, { id: 'gl', t: 'Glotón Neón' }]);
  const label = (it) => (it.home ? 'Inicio (menú)' : it.game.t);
  assert.deepEqual(F.filterPlaces(items, 'digitos', label).map((x) => x.id), ['dig']);
  assert.deepEqual(F.filterPlaces(items, 'neon glo', label).map((x) => x.id), ['gl']);
  assert.deepEqual(F.filterPlaces(items, 'menu', label).map((x) => x.id), ['home']);
  assert.equal(F.filterPlaces(items, '', label), items);
  assert.equal(F.filterPlaces(items, 'zzz', label).length, 0);
});

test('códigos de error: mensaje, sacudida, vaciado de casillas y salto de paso', () => {
  assert.deepEqual(F.errorFx('invalid_code'), { key: 'report.code.bad', shake: true, clearCode: true });
  assert.equal(F.errorFx('invalid_email').key, 'report.email.bad');
  assert.equal(F.errorFx('code_expired').key, 'report.code.expired');
  assert.ok(F.errorFx('code_expired').clearCode);
  assert.equal(F.errorFx('too_many_attempts').key, 'report.code.many');
  assert.equal(F.errorFx('rate_limited').key, 'report.rate');
  assert.equal(F.errorFx('offline').key, 'report.offline');
  assert.equal(F.errorFx('too_long').key, 'report.text.long');
  assert.deepEqual(F.errorFx('token_expired'), { key: 'report.session', to: 'email' });
  assert.equal(F.errorFx('algo_raro').key, 'report.fail');
  assert.equal(F.errorFx(undefined).key, 'report.fail');
});

test('token vencido al enviar: vuelve al paso 1 con el correo cargado y sin token', () => {
  const s = F.reduce(upTo('text'), { type: 'tokenExpired' });
  assert.equal(s.step, 'email');
  assert.equal(s.email, 'ana@correo.com');
  assert.equal(s.token, null);
});

test('payload del reporte: dónde, tipo y texto; meta solo si la casilla está tildada', () => {
  const s = run(upTo('text'), { type: 'text', value: '   Se rompe al terminar la partida  ' });
  const meta = { lang: 'es', platform: 'mobile', inGame: true };
  assert.deepEqual(F.buildPayload(s, meta), { where: 'quinteto', type: 'bug', text: 'Se rompe al terminar la partida', meta });
  const off = F.reduce(s, { type: 'meta', on: false });
  assert.deepEqual(F.buildPayload(off, meta), { where: 'quinteto', type: 'bug', text: 'Se rompe al terminar la partida' });
  assert.equal('meta' in F.buildPayload(off, meta), false);
  assert.equal(F.buildPayload(run(upTo('where'), { type: 'pickWhere', id: F.HOME }), null).where, 'home');
});

test('etiqueta del dispositivo', () => {
  const ua = {
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  };
  assert.equal(F.deviceLabel(ua.android, 'es'), 'Chrome · Android · ES');
  assert.equal(F.deviceLabel(ua.ios, 'en'), 'Safari · iOS · EN');
  assert.equal(F.deviceLabel(ua.firefox, 'es'), 'Firefox · Windows · ES');
  assert.equal(F.deviceLabel(ua.edge, 'es'), 'Edge · Windows · ES');
  assert.equal(F.deviceLabel('', 'es'), 'ES');
});

test('el reducer no muta el estado anterior', () => {
  const s = upTo('code');
  const frozen = Object.freeze({ ...s });
  assert.doesNotThrow(() => F.reduce(frozen, { type: 'code', value: '1234' }));
  assert.equal(frozen.code, '');
});

test('QA: ?report=fail:<código>[:<llamada>] elige dónde falla el stub', () => {
  assert.deepEqual(parseFail('?report=fail:invalid_code'), { code: 'invalid_code', call: 'verify' });
  assert.deepEqual(parseFail('?report=fail:invalid_email'), { code: 'invalid_email', call: 'code' });
  assert.deepEqual(parseFail('?report=fail:token_expired'), { code: 'token_expired', call: 'send' });
  assert.deepEqual(parseFail('?report=fail:rate_limited'), { code: 'rate_limited', call: null }); // en todas
  assert.deepEqual(parseFail('?report=fail:rate_limited:send'), { code: 'rate_limited', call: 'send' });
  assert.deepEqual(parseFail('?x=1&report=fail:offline'), { code: 'offline', call: null });
  assert.equal(parseFail(''), null);
  assert.equal(parseFail('?report=ok'), null);
  assert.equal(parseFail('?report=fail:'), null);
  assert.equal(parseFail('?report=fail:a:b'), null);
});

test('ReportError lleva el código y los datos extra', () => {
  const e = new ReportError('rate_limited', { retryIn: 30 });
  assert.equal(e.code, 'rate_limited');
  assert.equal(e.data.retryIn, 30);
  assert.ok(e instanceof Error);
});

test('reabrir desde otro juego cambia la preselección si no se había elegido a mano', () => {
  // abrió desde Quinteto, dejó la preselección y avanzó hasta "tipo"
  let s = upTo('where', { gameId: 'quinteto' });
  s = run(s, { type: 'pickWhere', id: 'quinteto' }, { type: 'next' });
  assert.equal(s.step, 'type');
  const otro = F.reduce(s, { type: 'open', gameId: 'ameba' });
  assert.equal(otro.preset, 'ameba');
  assert.equal(otro.where, null);
  assert.equal(otro.step, 'where'); // no puede quedar en "tipo" sin lugar
  // desde el menú tampoco queda el juego anterior
  const menu = F.reduce(s, { type: 'open' });
  assert.equal(menu.preset, null);
  assert.equal(menu.step, 'where');
  // el mismo juego: retoma donde estaba
  assert.equal(F.reduce(s, { type: 'open', gameId: 'quinteto' }).step, 'type');
});

test('reabrir respeta el lugar que se eligió a mano', () => {
  let s = upTo('where', { gameId: 'quinteto' });
  s = run(s, { type: 'pickWhere', id: 'home' }, { type: 'next' });
  const r = F.reduce(s, { type: 'open', gameId: 'ameba' });
  assert.equal(r.where, 'home');
  assert.equal(r.step, 'type');
});
