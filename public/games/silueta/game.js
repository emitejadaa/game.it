/* Silueta — game.it
 * La silueta de un país en neón. Adiviná cuál es en 6 intentos: cada error muestra la distancia entre los centros de los dos países,
 * una flecha que apunta hacia la respuesta y qué tan cerca estuviste.
 * Siluetas: Natural Earth (dominio público), simplificadas en tools/daily/. Países y centros: public/shared/countries/.
 */
import { createDailyApp } from '/shared/daily-shell.js';
import { h, svg, ui } from '/shared/daily-ui.js';
import * as D from '/shared/daily.js';
import { loadCountries, dailyPick, nameOf } from '/shared/countries/countries.js';
import { countryInput } from '/shared/country-input.js';
import { TRIES, poolOf, roundKm, guessInfo, shareText, closestIndex } from './logic.js';

const T = {
  es: {
    name: 'Silueta',
    placeholder: 'Escribí un país…',
    send: 'Enviar',
    unknown: 'Ese país no está en la lista',
    dup: 'Ya probaste ese país',
    left: (n) => (n === 1 ? 'Último intento' : `${n} intentos`),
    win: { 1: '¡Increíble!', 2: '¡Genial!', 3: '¡Muy bien!', 4: '¡Bien!', 5: '¡Bien ahí!', 6: '¡Uf, justo!' },
    lose: '¡Casi!',
    was: 'Era:',
    alt: 'Silueta del país misterioso',
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'Mirá la silueta de un país y adiviná cuál es en 6 intentos.'),
        h('p', null, 'Cada error te muestra la distancia en km entre el centro de ese país y el de la respuesta, una flecha que apunta hacia donde está la respuesta y un porcentaje de cercanía. Con eso vas acorralando el país.'),
        h('p', { class: 'dg-mute' }, 'Escribí el nombre del país (en español o en inglés) y elegilo de la lista. Los países muy chicos nunca son la respuesta, pero podés probarlos igual para orientarte.'),
      ),
  },
  en: {
    name: 'Silueta',
    placeholder: 'Type a country…',
    send: 'Send',
    unknown: 'That country is not in the list',
    dup: 'You already tried that one',
    left: (n) => (n === 1 ? 'Last guess' : `${n} guesses`),
    win: { 1: 'Incredible!', 2: 'Great!', 3: 'Very good!', 4: 'Nice!', 5: 'Well done!', 6: 'Phew, just in time!' },
    lose: 'So close!',
    was: 'It was:',
    alt: 'Silhouette of the mystery country',
    help: () =>
      h(
        'div',
        null,
        h('p', null, "Look at a country's silhouette and guess which one it is in 6 tries."),
        h('p', null, "Every wrong guess shows the distance in km between that country's centre and the answer's, an arrow pointing toward where the answer is, and a closeness percentage. Use them to close in on it."),
        h('p', { class: 'dg-mute' }, 'Type the name of the country (in Spanish or English) and pick it from the list. Very small countries are never the answer, but you can still guess them to get your bearings.'),
      ),
  },
};

const NS = 'http://www.w3.org/2000/svg';
const fmt = (n, lang) => n.toLocaleString(lang === 'en' ? 'en-US' : 'es-AR');

/** Silueta en un SVG de 100×100 con la forma centrada según su ancho y alto. */
function shapeSvg(shape, label) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 100 100');
  s.setAttribute('class', 'sl-svg');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', label);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('class', 'sl-shape');
  p.setAttribute('d', shape.d);
  p.setAttribute('transform', `translate(${((100 - shape.w) / 2).toFixed(2)} ${((100 - shape.h) / 2).toFixed(2)})`);
  s.append(p);
  return s;
}

createDailyApp({
  id: 'silueta',
  epoch: '2026-10-06',
  rows: TRIES,
  t: T,
  load: async () => {
    const [c, r] = await Promise.all([loadCountries(), fetch('./shapes.json')]);
    if (!r.ok) throw new Error('shapes');
    return { c, shapes: await r.json() };
  },
  build(shell, { ctx, lang, mode, dayNo, rnd, saved }) {
    const t = T[lang];
    const c = ctx.c;
    const pool = poolOf(c.answers, ctx.shapes);
    const answer = mode === 'daily' ? dailyPick(pool, dayNo, 'silueta') : pool[Math.floor(rnd() * pool.length)];
    // solo se aceptan códigos que existan en la lista (por si el guardado viene de otra versión)
    const guesses = (saved?.guesses || []).filter((g, i, a) => c.byCode.has(g) && a.indexOf(g) === i).slice(0, TRIES);
    const infos = () => guesses.map((g) => guessInfo(c.byCode.get(g), answer));
    let over = false;

    const name = h('div', { class: 'sl-name', hidden: true });
    const card = h('div', { class: 'sl-card' }, shapeSvg(ctx.shapes[answer.c], t.alt));
    const count = h('div', { class: 'sl-count' });
    const list = h('div', { class: 'dg-guesses' });

    function arrow(deg) {
      const a = svg('M12 20V5M6.5 10.5L12 5l5.5 5.5');
      a.style.transform = `rotate(${Math.round(deg)}deg)`;
      return h('span', { class: 'sl-ar' }, a);
    }
    function paintList(newIndex = -1) {
      const all = infos();
      const best = closestIndex(all);
      list.replaceChildren(
        ...Array.from({ length: TRIES }, (_, i) => {
          const code = guesses[i];
          if (!code) return h('div', { class: 'dg-guess sl-guess empty' }, h('span', null, ' '));
          const x = all[i];
          const cls = `dg-guess sl-guess ${x.right ? 'right' : 'wrong'}${i === best ? ' best' : ''}${i === newIndex ? ' new' : ''}`;
          const label = nameOf(c.byCode.get(code), lang);
          return h(
            'div',
            { class: cls, title: label },
            h('span', { class: 'sl-n' }, label),
            h('span', { class: 'sl-km' }, x.right ? '' : `${fmt(roundKm(x.km), lang)} km`),
            x.right ? h('span', { class: 'sl-ar' }, '✓') : arrow(x.deg),
            h('span', { class: 'sl-pc' }, `${x.pct}%`),
            h('div', { class: 'sl-bar', style: `--p:${x.pct}` }),
          );
        }),
      );
      count.textContent = over ? '' : t.left(TRIES - guesses.length);
    }
    function reveal(won) {
      name.textContent = nameOf(answer, lang);
      name.classList.toggle('lost', !won);
      name.hidden = false;
      count.hidden = true;
    }
    function result() {
      const won = guesses.includes(answer.c);
      return {
        won,
        score: guesses.length,
        title: won ? t.win[guesses.length] || '¡Bien!' : t.lose,
        sub: won ? null : t.was,
        answers: [nameOf(answer, lang)],
        shareText: shareText({ name: t.name, dayNo: shell.dayNo, infos: infos(), won, link: D.shareLink('silueta') }),
      };
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
        paintList(guesses.length - 1);
        shell.save({ guesses }, over);
        if (over) {
          input.setDisabled(true);
          reveal(won);
          shell.finish({ ...result(), delay: 1100 });
        } else input.focus();
      },
    });

    shell.main.append(card, count, name, list, input.el);
    over = guesses.includes(answer.c) || guesses.length >= TRIES;
    paintList();
    if (over) {
      input.setDisabled(true);
      reveal(guesses.includes(answer.c));
      shell.restoreResult(result());
    } else input.focus();
  },
});
