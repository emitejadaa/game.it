/* Quinteto — game.it
 * Adiviná la palabra de 5 letras del día en 6 intentos. El motor (casillas, teclado, estadísticas, compartir)
 * es el de public/shared/guess-grid.js; acá están las reglas y los textos. Palabras: public/shared/words5/.
 */
import { createGuessGame, scoreGuess } from '/shared/guess-grid.js';
import { h } from '/shared/daily-ui.js';
import { norm } from '/shared/words5/norm.js';
import { loadWords5, KEYS5 } from '/shared/words5/loader.js';

const ID = 'quinteto';
const EPOCH = '2026-10-06'; // día del lanzamiento: desafío n.º 1
const lang = () => (window.GameIt?.prefs?.lang === 'en' ? 'en' : 'es');

const example = (word, marks) =>
  h('div', { class: 'dg-example' }, [...word].map((l, i) => h('div', { class: 'dg-tile', dataset: marks[i] ? { s: marks[i] } : {} }, l)));

createGuessGame({
  id: ID,
  epoch: EPOCH,
  cols: 5,
  rows: 6,
  keyRows: (l) => KEYS5[l] || KEYS5.es,
  fromEvent: (e) => {
    if (e.key.length !== 1) return null;
    const n = norm(e.key, lang());
    return n.length === 1 ? n : null;
  },
  load: loadWords5,
  secrets(ctx, l, { mode, dayNo, rnd }) {
    const n = ctx.answers.length;
    const word = mode === 'daily' ? ctx.answers[(((dayNo - 1) % n) + n) % n] : ctx.answers[Math.floor(rnd() * n)];
    return [[...norm(word, l)]];
  },
  validate: (tokens, ctx) => (ctx.allowed.has(tokens.join('')) ? null : 'notInList'),
  score: (guess, secret) => scoreGuess(guess, secret),
  answerText: (secret, ctx) => ctx.display.get(secret.join('')) || secret.join(''),
  t: {
    es: {
      name: 'Quinteto',
      msg: { short: 'Faltan letras', notInList: 'No está en la lista' },
      win: { 1: '¡Increíble!', 2: '¡Genial!', 3: '¡Muy bien!', 4: '¡Bien!', 5: '¡Bien ahí!', 6: '¡Uf, justo!', default: '¡Bien!' },
      lose: '¡Casi!',
      help: () =>
        h(
          'div',
          null,
          h('p', null, 'Adiviná la palabra de 5 letras en 6 intentos. Cada intento tiene que ser una palabra válida.'),
          h('p', { class: 'dg-mute' }, 'Al enviarlo, cada casilla cambia de color:'),
          example('PERRO', ['g']),
          h('p', null, 'La P está en la palabra y en su lugar.'),
          example('CIELO', [null, null, null, 'y']),
          h('p', null, 'La L está en la palabra, pero en otro lugar.'),
          example('MESAS', [null, null, null, null, 'x']),
          h('p', null, 'La S no está en la palabra.'),
        ),
    },
    en: {
      name: 'Quinteto',
      msg: { short: 'Not enough letters', notInList: 'Not in word list' },
      win: { 1: 'Incredible!', 2: 'Great!', 3: 'Very good!', 4: 'Nice!', 5: 'Well done!', 6: 'Phew, just in time!', default: 'Nice!' },
      lose: 'So close!',
      help: () =>
        h(
          'div',
          null,
          h('p', null, 'Guess the 5-letter word in 6 tries. Every guess has to be a valid word.'),
          h('p', { class: 'dg-mute' }, 'After you send it, each tile changes colour:'),
          example('HOUSE', ['g']),
          h('p', null, 'H is in the word and in the right spot.'),
          example('PLANT', [null, null, null, 'y']),
          h('p', null, 'N is in the word, but somewhere else.'),
          example('CHAIR', [null, null, null, null, 'x']),
          h('p', null, 'R is not in the word.'),
        ),
    },
  },
});
