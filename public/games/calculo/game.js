/* Cálculo — game.it
 * Hay un resultado objetivo y una cuenta oculta de 6 caracteres que lo da. Adiviná la cuenta en 6 intentos:
 * cada intento tiene que dar el resultado. Verde: el carácter está en su lugar; amarillo: está en otro lugar;
 * gris: no está. Se gana con la cuenta oculta o con una igual salvo el orden de lo que se suma o multiplica.
 */
import { createGuessGame, scoreGuess } from '/shared/guess-grid.js';
import { h } from '/shared/daily-ui.js';
import { evaluate, canon, fracEq, randomCalc } from '/shared/math-expr.js';
import { mathLabel, mathFromEvent, mathKeyRows } from '/shared/math-ui.js';

const example = (word, marks) => h('div', { class: 'dg-example' }, [...word].map((l, i) => h('div', { class: 'dg-tile', dataset: marks[i] ? { s: marks[i] } : {} }, mathLabel(l))));
const same = (g, s) => canon(g.join('')) === canon(s.join(''));

createGuessGame({
  id: 'calculo',
  epoch: '2026-10-06',
  cols: 6,
  rows: 6,
  keyRows: mathKeyRows(false),
  label: mathLabel,
  fromEvent: (e) => mathFromEvent(e, false),
  load: async () => ({}),
  secrets(ctx, _l, { rnd }) {
    ctx.puzzle = randomCalc(rnd);
    return [[...ctx.puzzle.calc]];
  },
  banner: (ctx, l) => `${l === 'es' ? 'Resultado' : 'Result'}: ${ctx.puzzle.target}`,
  validate(tokens, ctx) {
    const v = evaluate(tokens.join(''));
    if (!v) return 'syntax';
    return fracEq(v, { n: ctx.puzzle.target, d: 1 }) ? null : 'notTarget';
  },
  score: (guess, secret) => (same(guess, secret) ? guess.map(() => 'g') : scoreGuess(guess, secret)),
  isWin: (guess, secret) => same(guess, secret),
  answerText: (secret, ctx) => `${secret.map(mathLabel).join('')} = ${ctx.puzzle.target}`,
  t: {
    es: {
      name: 'Cálculo',
      msg: { short: 'Faltan caracteres', syntax: 'No es una cuenta válida', notTarget: (ctx) => `La cuenta tiene que dar ${ctx.puzzle.target}` },
      win: { 1: '¡Increíble!', 2: '¡Genial!', 3: '¡Muy bien!', 4: '¡Bien!', 5: '¡Bien ahí!', 6: '¡Uf, justo!', default: '¡Bien!' },
      lose: '¡Casi!',
      help: () =>
        h(
          'div',
          null,
          h('p', null, 'Arriba ves un resultado. Hay una cuenta oculta de 6 caracteres que lo da: adiviná cuál es en 6 intentos.'),
          h('p', { class: 'dg-mute' }, 'Cada intento tiene que ser una cuenta válida que dé ese resultado. Se usan los números 0-9 y + − × ÷, respetando el orden de las operaciones.'),
          example('12+3*5', ['g', 'g']),
          h('p', null, 'El 1 y el 2 están en la cuenta y en su lugar.'),
          example('25+3*4', [null, null, null, 'y']),
          h('p', null, 'El 3 está en la cuenta, pero en otro lugar.'),
          example('9*3+0', [null, null, null, null, 'x']),
          h('p', null, 'El 0 no está en la cuenta.'),
          h('p', null, 'Si tu cuenta es igual a la oculta salvo el orden de lo que se suma o se multiplica (4*3+2 y 2+3*4), también ganás.'),
        ),
    },
    en: {
      name: 'Cálculo',
      msg: { short: 'Not enough characters', syntax: 'Not a valid calculation', notTarget: (ctx) => `The calculation must equal ${ctx.puzzle.target}` },
      win: { 1: 'Incredible!', 2: 'Great!', 3: 'Very good!', 4: 'Nice!', 5: 'Well done!', 6: 'Phew, just in time!', default: 'Nice!' },
      lose: 'So close!',
      help: () =>
        h(
          'div',
          null,
          h('p', null, 'You see a result at the top. A hidden 6-character calculation gives it: find it in 6 tries.'),
          h('p', { class: 'dg-mute' }, 'Every guess must be a valid calculation that equals that result. Digits 0-9 and + − × ÷ are used, with the usual order of operations.'),
          example('12+3*5', ['g', 'g']),
          h('p', null, '1 and 2 are in the calculation and in the right spot.'),
          example('25+3*4', [null, null, null, 'y']),
          h('p', null, '3 is in the calculation, but somewhere else.'),
          example('9*3+0', [null, null, null, null, 'x']),
          h('p', null, '0 is not in the calculation.'),
          h('p', null, 'If your calculation matches the hidden one apart from the order of what is added or multiplied (4*3+2 and 2+3*4), you win too.'),
        ),
    },
  },
});
