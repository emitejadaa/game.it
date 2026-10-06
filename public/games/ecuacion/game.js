/* Ecuación — game.it
 * Adiviná la ecuación oculta de 8 caracteres en 6 intentos. Cada intento tiene que ser una igualdad correcta
 * (por ejemplo 12+34=46). Verde: el carácter está en su lugar; amarillo: está en otro lugar; gris: no está.
 */
import { createGuessGame, scoreGuess } from '/shared/guess-grid.js';
import { h } from '/shared/daily-ui.js';
import { checkEquation, randomEquation } from '/shared/math-expr.js';
import { mathLabel, mathFromEvent, mathKeyRows } from '/shared/math-ui.js';

const example = (word, marks) => h('div', { class: 'dg-example' }, [...word].map((l, i) => h('div', { class: 'dg-tile', dataset: marks[i] ? { s: marks[i] } : {} }, mathLabel(l))));

const helpEs = () =>
  h(
    'div',
    null,
    h('p', null, 'Adiviná la ecuación oculta de 8 caracteres en 6 intentos. Cada intento tiene que ser una igualdad correcta, con un solo "=".'),
    h('p', { class: 'dg-mute' }, 'Se usan los números 0-9 y las operaciones + − × ÷. Se respeta el orden de las operaciones y los números no empiezan con 0.'),
    example('12+34=46', ['g']),
    h('p', null, 'El 1 está en la ecuación y en su lugar.'),
    example('7*8-9=47', [null, null, null, null, 'y']),
    h('p', null, 'El 9 está en la ecuación, pero en otro lugar.'),
    example('15+20=35', [null, null, 'x']),
    h('p', null, 'El + no está en la ecuación.'),
    h('p', null, 'El resultado puede estar a cualquier lado del "=": 45=9×5 también vale.'),
  );
const helpEn = () =>
  h(
    'div',
    null,
    h('p', null, 'Guess the hidden 8-character equation in 6 tries. Every guess must be a correct equality with one "=".'),
    h('p', { class: 'dg-mute' }, 'Digits 0-9 and + − × ÷ are used. Order of operations applies and numbers do not start with 0.'),
    example('12+34=46', ['g']),
    h('p', null, '1 is in the equation and in the right spot.'),
    example('7*8-9=47', [null, null, null, null, 'y']),
    h('p', null, '9 is in the equation, but somewhere else.'),
    example('15+20=35', [null, null, 'x']),
    h('p', null, '+ is not in the equation.'),
    h('p', null, 'The result can be on either side of the "=": 45=9×5 works too.'),
  );

createGuessGame({
  id: 'ecuacion',
  epoch: '2026-10-06',
  cols: 8,
  rows: 6,
  keyRows: mathKeyRows(true),
  label: mathLabel,
  fromEvent: (e) => mathFromEvent(e, true),
  load: async () => ({}),
  secrets: (_ctx, _l, { rnd }) => [[...randomEquation(rnd)]],
  validate: (tokens) => checkEquation(tokens.join('')),
  score: (guess, secret) => scoreGuess(guess, secret),
  answerText: (secret) => secret.map(mathLabel).join(''),
  t: {
    es: {
      name: 'Ecuación',
      msg: { short: 'Faltan caracteres', oneEq: 'Tiene que haber un solo "="', syntax: 'No es una cuenta válida', notEqual: 'Los dos lados no dan lo mismo' },
      win: { 1: '¡Increíble!', 2: '¡Genial!', 3: '¡Muy bien!', 4: '¡Bien!', 5: '¡Bien ahí!', 6: '¡Uf, justo!', default: '¡Bien!' },
      lose: '¡Casi!',
      help: helpEs,
    },
    en: {
      name: 'Ecuación',
      msg: { short: 'Not enough characters', oneEq: 'There must be exactly one "="', syntax: 'Not a valid calculation', notEqual: 'Both sides must be equal' },
      win: { 1: 'Incredible!', 2: 'Great!', 3: 'Very good!', 4: 'Nice!', 5: 'Well done!', 6: 'Phew, just in time!', default: 'Nice!' },
      lose: 'So close!',
      help: helpEn,
    },
  },
});
