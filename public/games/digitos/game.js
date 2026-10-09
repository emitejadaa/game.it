/* Dígitos — game.it
 * Adiviná el número secreto de 5 dígitos en 6 intentos. Verde: el dígito está en su lugar; amarillo: está en
 * otro lugar; gris: no está. Al costado, ▲ si el secreto es mayor que tu intento y ▼ si es menor.
 */
import { createGuessGame, scoreGuess } from '/shared/guess-grid.js';
import { h } from '/shared/daily-ui.js';

const example = (word, marks) => h('div', { class: 'dg-example' }, [...word].map((l, i) => h('div', { class: 'dg-tile', dataset: marks[i] ? { s: marks[i] } : {} }, l)));

createGuessGame({
  id: 'digitos',
  epoch: '2026-10-06',
  cols: 5,
  rows: 6,
  keyRows: [[...'12345'], [...'67890'], ['ENTER', 'DEL']],
  fromEvent: (e) => (/^[0-9]$/.test(e.key) ? e.key : null),
  load: async () => ({}),
  secrets: (_ctx, _l, { rnd }) => [[...String(10000 + Math.floor(rnd() * 90000))]],
  validate: (tokens) => (tokens[0] === '0' ? 'zero' : null),
  score: (guess, secret) => scoreGuess(guess, secret),
  extra: (guess, secret) => {
    const a = Number(guess.join(''));
    const b = Number(secret.join(''));
    return a === b ? '' : b > a ? '▲' : '▼';
  },
  t: {
    es: {
      name: 'Dígitos',
      msg: { short: 'Faltan dígitos', zero: 'No puede empezar con 0' },
      win: { 1: '¡Increíble!', 2: '¡Genial!', 3: '¡Muy bien!', 4: '¡Bien!', 5: '¡Bien ahí!', 6: '¡Uf, justo!', default: '¡Bien!' },
      lose: '¡Casi!',
      help: () =>
        h(
          'div',
          null,
          h('p', null, 'Adiviná el número de 5 dígitos en 6 intentos. No empieza con 0 y los dígitos se pueden repetir.'),
          example('48215', ['g']),
          h('p', null, 'El 4 está en el número y en su lugar.'),
          example('13624', [null, null, null, 'y']),
          h('p', null, 'El 2 está en el número, pero en otro lugar.'),
          example('90077', [null, null, null, 'x', 'x']),
          h('p', null, 'El 7 no está en el número.'),
          h('p', null, 'Al costado de cada intento, ▲ quiere decir que el número secreto es mayor y ▼ que es menor.'),
        ),
    },
    en: {
      name: 'Dígitos',
      msg: { short: 'Not enough digits', zero: "Can't start with 0" },
      win: { 1: 'Incredible!', 2: 'Great!', 3: 'Very good!', 4: 'Nice!', 5: 'Well done!', 6: 'Phew, just in time!', default: 'Nice!' },
      lose: 'So close!',
      help: () =>
        h(
          'div',
          null,
          h('p', null, 'Guess the 5-digit number in 6 tries. It does not start with 0 and digits can repeat.'),
          example('48215', ['g']),
          h('p', null, '4 is in the number and in the right spot.'),
          example('13624', [null, null, null, 'y']),
          h('p', null, '2 is in the number, but somewhere else.'),
          example('90077', [null, null, null, 'x', 'x']),
          h('p', null, '7 is not in the number.'),
          h('p', null, 'Next to each guess, ▲ means the secret number is higher and ▼ that it is lower.'),
        ),
    },
  },
});
