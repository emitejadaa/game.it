/* Banderín — game.it
 * La bandera del día aparece tapada por bloques. Adiviná el país en 6 intentos: con cada error se destapan más bloques.
 * Banderas: flag-icons (MIT). Países: public/shared/countries/.
 */
import { createDailyApp } from '/shared/daily-shell.js';
import { h, ui } from '/shared/daily-ui.js';
import * as D from '/shared/daily.js';
import { loadCountries, dailyPick, nameOf } from '/shared/countries/countries.js';
import { countryInput } from '/shared/country-input.js';

const TRIES = 6;
const BLOCKS = 12;
const T = {
  es: {
    name: 'Banderín',
    placeholder: 'Escribí un país…',
    send: 'Enviar',
    unknown: 'Ese país no está en la lista',
    dup: 'Ya probaste ese país',
    left: (n) => (n === 1 ? 'Último intento' : `${n} intentos`),
    win: { 1: '¡Increíble!', 2: '¡Genial!', 3: '¡Muy bien!', 4: '¡Bien!', 5: '¡Bien ahí!', 6: '¡Uf, justo!' },
    lose: '¡Casi!',
    was: 'Era:',
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'La bandera de un país está tapada por bloques. Adiviná cuál es en 6 intentos.'),
        h('p', null, 'Empezás viendo solo dos bloques. Cada vez que te equivocás se destapan dos más, hasta ver la bandera entera en el último intento.'),
        h('p', { class: 'dg-mute' }, 'Escribí el nombre del país (en español o en inglés) y elegilo de la lista.'),
      ),
  },
  en: {
    name: 'Banderín',
    placeholder: 'Type a country…',
    send: 'Send',
    unknown: 'That country is not in the list',
    dup: 'You already tried that one',
    left: (n) => (n === 1 ? 'Last guess' : `${n} guesses`),
    win: { 1: 'Incredible!', 2: 'Great!', 3: 'Very good!', 4: 'Nice!', 5: 'Well done!', 6: 'Phew, just in time!' },
    lose: 'So close!',
    was: 'It was:',
    help: () =>
      h(
        'div',
        null,
        h('p', null, "A country's flag is hidden behind blocks. Guess which one it is in 6 tries."),
        h('p', null, 'You start with just two blocks showing. Every wrong guess uncovers two more, until you see the whole flag on the last guess.'),
        h('p', { class: 'dg-mute' }, 'Type the name of the country (in Spanish or English) and pick it from the list.'),
      ),
  },
};

createDailyApp({
  id: 'banderin',
  epoch: '2026-10-06',
  rows: TRIES,
  t: T,
  load: async () => ({ c: await loadCountries() }),
  build(shell, { ctx, lang, mode, dayNo, rnd, saved }) {
    const t = T[lang];
    const c = ctx.c;
    const answer = mode === 'daily' ? dailyPick(c.answers, dayNo, 'banderin') : c.answers[Math.floor(rnd() * c.answers.length)];
    const order = D.shuffle(D.rng(`banderin-bloques:${answer.c}`), [...Array(BLOCKS).keys()]);
    const guesses = [...(saved?.guesses || [])];
    let over = false;

    const blocks = Array.from({ length: BLOCKS }, (_, i) => h('div', { class: 'bd-block' }, '?'));
    const flag = h('div', { class: 'bd-flag' }, h('img', { src: `./flags/${answer.c.toLowerCase()}.svg`, alt: '', draggable: 'false' }), h('div', { class: 'bd-cover' }, blocks));
    const count = h('div', { class: 'bd-count' });
    const list = h('div', { class: 'dg-guesses' });
    const wrong = () => guesses.filter((g) => g !== answer.c).length;

    function paintBlocks(all) {
      const shown = all ? BLOCKS : Math.min(BLOCKS, 2 + 2 * wrong());
      order.forEach((b, rank) => blocks[b].classList.toggle('open', rank < shown));
    }
    function paintList(newIndex = -1) {
      list.replaceChildren(
        ...Array.from({ length: TRIES }, (_, i) => {
          const code = guesses[i];
          if (!code) return h('div', { class: 'dg-guess' }, h('span', null, ' '), h('small', null, ''));
          const ok = code === answer.c;
          return h('div', { class: `dg-guess ${ok ? 'right' : 'wrong'}${i === newIndex ? ' new' : ''}` }, h('span', null, nameOf(c.byCode.get(code), lang)), h('small', null, ok ? '✓' : '✗'));
        }),
      );
      count.textContent = over ? '' : t.left(TRIES - guesses.length);
    }
    function shareText() {
      const row = Array.from({ length: TRIES }, (_, i) => (guesses[i] === undefined ? '⬜' : guesses[i] === answer.c ? '🟩' : '🟥')).join('');
      return `game.it · ${t.name} #${dayNo} ${guesses.includes(answer.c) ? guesses.length : 'X'}/${TRIES}\n\n${row}\n${D.shareLink('banderin')}`;
    }
    function result() {
      const won = guesses.includes(answer.c);
      return { won, score: guesses.length, title: won ? t.win[guesses.length] || '¡Bien!' : t.lose, sub: won ? null : t.was, answers: won ? [nameOf(answer, lang)] : [nameOf(answer, lang)], shareText: shareText() };
    }

    const input = countryInput({
      ctx: c,
      lang,
      placeholder: t.placeholder,
      button: t.send,
      onUnknown: () => shell.toast(t.unknown),
      onSubmit(country) {
        if (over) return;
        if (guesses.includes(country.c)) return shell.toast(t.dup);
        guesses.push(country.c);
        const won = country.c === answer.c;
        over = won || guesses.length >= TRIES;
        paintBlocks(over);
        paintList(guesses.length - 1);
        shell.save({ guesses }, over);
        if (over) {
          input.setDisabled(true);
          shell.finish({ ...result(), delay: 1100 });
        } else input.focus();
      },
    });

    shell.main.append(flag, count, list, input.el);
    over = guesses.includes(answer.c) || guesses.length >= TRIES;
    paintBlocks(over);
    paintList();
    if (over) {
      input.setDisabled(true);
      shell.restoreResult(result());
    } else input.focus();
  },
});
