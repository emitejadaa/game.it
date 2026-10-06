/* Cuarteto — game.it
 * Cuatro palabras de 5 letras a la vez en 9 intentos: cada intento se juega en los cuatro tableros.
 * Mismo motor que Quinteto (public/shared/guess-grid.js) y las mismas listas (public/shared/words5/).
 */
import { createGuessGame, scoreGuess } from '/shared/guess-grid.js';
import { h } from '/shared/daily-ui.js';
import { norm } from '/shared/words5/norm.js';
import { loadWords5, KEYS5 } from '/shared/words5/loader.js';

const lang = () => (window.GameIt?.prefs?.lang === 'en' ? 'en' : 'es');
const example = (word, marks) => h('div', { class: 'dg-example' }, [...word].map((l, i) => h('div', { class: 'dg-tile', dataset: marks[i] ? { s: marks[i] } : {} }, l)));

createGuessGame({
  id: 'cuarteto',
  epoch: '2026-10-06',
  cols: 5,
  rows: 9,
  boards: 4,
  keyRows: (l) => KEYS5[l] || KEYS5.es,
  fromEvent: (e) => {
    if (e.key.length !== 1) return null;
    const n = norm(e.key, lang());
    return n.length === 1 ? n : null;
  },
  load: loadWords5,
  secrets(ctx, l, { rnd }) {
    // cuatro palabras distintas: del día (con la semilla de la fecha) o al azar en la práctica
    const picked = new Set();
    while (picked.size < 4) picked.add(Math.floor(rnd() * ctx.answers.length));
    return [...picked].map((i) => [...norm(ctx.answers[i], l)]);
  },
  validate: (tokens, ctx) => (ctx.allowed.has(tokens.join('')) ? null : 'notInList'),
  score: (guess, secret) => scoreGuess(guess, secret),
  answerText: (secret, ctx) => ctx.display.get(secret.join('')) || secret.join(''),
  t: {
    es: {
      name: 'Cuarteto',
      msg: { short: 'Faltan letras', notInList: 'No está en la lista' },
      win: { default: '¡Genial!' },
      lose: '¡Casi!',
      help: () =>
        h(
          'div',
          null,
          h('p', null, 'Adiviná 4 palabras de 5 letras a la vez en 9 intentos. Cada intento que mandás se juega en los cuatro tableros.'),
          h('p', { class: 'dg-mute' }, 'Los colores son los de siempre, tablero por tablero:'),
          example('PERRO', ['g']),
          h('p', null, 'La P está en la palabra y en su lugar.'),
          example('CIELO', [null, null, null, 'y']),
          h('p', null, 'La L está en la palabra, pero en otro lugar.'),
          h('p', null, 'Cada tecla se divide en cuatro: así ves qué pasó con esa letra en cada tablero. Cuando resolvés uno, ese tablero se apaga.'),
        ),
    },
    en: {
      name: 'Cuarteto',
      msg: { short: 'Not enough letters', notInList: 'Not in word list' },
      win: { default: 'Great!' },
      lose: 'So close!',
      help: () =>
        h(
          'div',
          null,
          h('p', null, 'Guess 4 five-letter words at once in 9 tries. Every guess you send is played on all four boards.'),
          h('p', { class: 'dg-mute' }, 'Colours work as usual, board by board:'),
          example('HOUSE', ['g']),
          h('p', null, 'H is in the word and in the right spot.'),
          example('PLANT', [null, null, null, 'y']),
          h('p', null, 'N is in the word, but somewhere else.'),
          h('p', null, "Each key is split in four so you can see what happened with that letter on every board. When you solve one, that board switches off."),
        ),
    },
  },
});
