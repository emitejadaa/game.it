/* Rumbo — game.it
 * Un país escondido en el globo. Probá países sin límite: cada uno se pinta con un color que dice qué tan cerca
 * está su frontera de la del país del día (de limítrofe a más de 4000 km). Girá el globo y deducí dónde está.
 * Contornos: Natural Earth (dominio público), simplificados (ver world.json). Países: public/shared/countries/.
 */
import { createDailyApp } from '/shared/daily-shell.js';
import { h, ui } from '/shared/daily-ui.js';
import * as D from '/shared/daily.js';
import { loadCountries, dailyPick, nameOf } from '/shared/countries/countries.js';
import { countryInput } from '/shared/country-input.js';
import { makeShape, borderDistanceKm, heatRgb, heatColor, inkFor, heatBucket, attemptsBucket, SQUARES, PALETTES, HEAT_MAX } from './geo.js';
import { createGlobe } from './render.js';

const GIVE_UP_AFTER = 3;
const SHARE_SQUARES = 10;
const LABELS = ['<=5', '6-10', '11-15', '16-20', '21-30', '31+'];

const T = {
  es: {
    name: 'Rumbo',
    placeholder: 'Escribí un país…',
    send: 'Enviar',
    unknown: 'Ese país no está en la lista',
    dup: 'Ya probaste ese país',
    start: 'Probá un país para empezar',
    tries: (n) => (n === 1 ? '1 intento' : `${n} intentos`),
    giveUp: 'Me rindo',
    sure: '¿Seguro? Tocá de nuevo',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    center: 'Centrar',
    aria: 'Globo terráqueo. Arrastrá para girarlo; con el teclado, las flechas lo giran y + y − acercan o alejan.',
    near: 'más cerca',
    far: 'más lejos',
    km: (n) => `${n.toLocaleString('es-AR')} km`,
    touch: 'limítrofe',
    far4: (n) => `${n.toLocaleString('es-AR')}+ km`,
    win: '¡Lo encontraste!',
    winSub: (n) => (n === 1 ? 'A la primera' : `En ${n} intentos`),
    lose: 'Te rendiste',
    was: 'Era:',
    shareWin: (n) => `${n} intentos`,
    shareLose: (n) => `me rendí tras ${n}`,
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'Hay un país escondido en el globo. Probá todos los países que quieras: cada uno se pinta con un color según qué tan cerca está su frontera de la del país escondido.'),
        h('p', null, 'Rojo es limítrofe (0 km). Después viene naranja, amarillo, verde y, a más de 4000 km, azul. Al lado del nombre siempre ves los kilómetros.'),
        h('p', null, 'Girá el globo con el dedo o el mouse, acercalo con + y −, y deducí dónde está. Tocá un país de la lista para volver a mirarlo.'),
        h('p', { class: 'dg-mute' }, 'Desde el tercer intento podés rendirte, pero cuenta como derrota. Un país nuevo todos los días.'),
      ),
  },
  en: {
    name: 'Rumbo',
    placeholder: 'Type a country…',
    send: 'Send',
    unknown: 'That country is not in the list',
    dup: 'You already tried that one',
    start: 'Try a country to get started',
    tries: (n) => (n === 1 ? '1 guess' : `${n} guesses`),
    giveUp: 'Give up',
    sure: 'Sure? Tap again',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    center: 'Center',
    aria: 'Globe. Drag to rotate it; with a keyboard, the arrow keys rotate it and + and − zoom in or out.',
    near: 'closer',
    far: 'farther',
    km: (n) => `${n.toLocaleString('en-US')} km`,
    touch: 'bordering',
    far4: (n) => `${n.toLocaleString('en-US')}+ km`,
    win: 'You found it!',
    winSub: (n) => (n === 1 ? 'First try' : `In ${n} guesses`),
    lose: 'You gave up',
    was: 'It was:',
    shareWin: (n) => `${n} guesses`,
    shareLose: (n) => `gave up after ${n}`,
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'A country is hidden on the globe. Guess as many countries as you like: each one is painted with a colour showing how close its border is to the hidden country’s border.'),
        h('p', null, 'Red means bordering (0 km). Then orange, yellow, green and, beyond 4000 km, blue. The distance in km is always shown next to the name.'),
        h('p', null, 'Spin the globe with your finger or mouse, zoom with + and −, and work out where it is. Tap a country in the list to look at it again.'),
        h('p', { class: 'dg-mute' }, 'After your third guess you can give up, but it counts as a loss. A new country every day.'),
      ),
  },
};

// ---------------------------------------------------------------- datos (una sola carga por visita)
let worldPromise = null;
const loadWorld = () => (worldPromise ||= fetch('./world.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('world')))));

/** Paleta vigente según el tema claro/oscuro y el modo de alto contraste de los juegos diarios. */
function palette() {
  const d = document.documentElement.dataset;
  const hc = d.hc === '1';
  const light = d.giTheme === 'light';
  return PALETTES[hc ? (light ? 'hcLight' : 'hcDark') : light ? 'light' : 'dark'];
}

let current = null; // lo que hay que soltar al reconstruir la pantalla (idioma, práctica, día nuevo)

createDailyApp({
  id: 'rumbo',
  epoch: '2026-10-06',
  rows: 6,
  labels: LABELS,
  t: T,
  async load() {
    const [c, world] = await Promise.all([loadCountries(), loadWorld()]);
    const shapes = world.filter((e) => c.byCode.has(e.c)).map((e) => makeShape(e, c.byCode.get(e.c).ll));
    return { c, shapes, shapeBy: new Map(shapes.map((s) => [s.c, s])) };
  },
  build(shell, { ctx, lang, mode, dayNo, rnd, saved }) {
    current?.();
    const t = T[lang];
    const c = ctx.c;
    const answer = mode === 'daily' ? dailyPick(c.answers, dayNo, 'rumbo') : c.answers[Math.floor(rnd() * c.answers.length)];
    const answerShape = ctx.shapeBy.get(answer.c);
    const guesses = [...(saved?.guesses || [])].filter((code) => ctx.shapeBy.has(code));
    let gaveUp = !!saved?.gaveUp;
    let over = guesses.includes(answer.c) || gaveUp;
    let focus = guesses[guesses.length - 1] || null;
    let sureTimer = 0;

    const km = (code) => borderDistanceKm(ctx.shapeBy.get(code), answerShape);
    const kmShown = (v) => Math.round(v / 10) * 10;
    const nameFor = (code) => nameOf(c.byCode.get(code), lang);
    const colorOf = (v) => {
      const rgb = heatRgb(v, palette());
      return { css: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, ink: inkFor(rgb) };
    };

    // ---- globo
    const globe = createGlobe({
      shapes: ctx.shapes,
      labels: { in: t.zoomIn, out: t.zoomOut, center: t.center, aria: t.aria },
      onCenter: () => {
        globe.zoomBy(1 / globe.view.zoom);
        if (focus) globe.focusOn(focus);
        else globe.reset();
      },
    });

    // ---- leyenda de la escala
    const legendBar = h('div', { class: 'rb-bar-scale' });
    const legend = h('div', { class: 'rb-legend' }, legendBar, h('div', { class: 'rb-legend-t' }, h('span', null, `0 km · ${t.touch}`), h('span', null, '2000'), h('span', null, t.far4(HEAT_MAX))));
    function paintLegend() {
      const p = palette();
      const stops = [0, 300, 1000, 2000, 3000, HEAT_MAX].map((v) => `${heatColor(v, p)} ${(v / HEAT_MAX) * 100}%`);
      legendBar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
    }

    // ---- estado y lista
    const count = h('span', { class: 'rb-count' });
    const giveBtn = h('button', { class: 'rb-give', type: 'button', hidden: true }, t.giveUp);
    const list = h('div', { class: 'rb-list' });

    function guessItems() {
      return guesses.map((code) => ({ c: code, fill: colorOf(km(code)).css, label: nameFor(code) }));
    }
    function paintList(newCode = null) {
      const rows = guesses.map((code, i) => ({ code, i, d: km(code) })).sort((a, b) => a.d - b.d || b.i - a.i);
      list.replaceChildren(
        ...rows.map(({ code, d }) => {
          const hit = code === answer.c;
          const col = colorOf(d);
          const dist = hit ? '✓' : d === 0 ? t.touch : t.km(kmShown(d));
          const row = h(
            'button',
            { class: `rb-row${hit ? ' hit' : ''}${code === focus ? ' sel' : ''}${code === newCode ? ' new' : ''}`, type: 'button', onclick: () => pick(code) },
            h('span', { class: 'rb-chip', style: `background:${col.css}` }),
            h('span', { class: 'rb-name' }, nameFor(code)),
            h('small', null, dist),
          );
          return row;
        }),
      );
    }
    function paintStatus() {
      count.textContent = guesses.length ? t.tries(guesses.length) : t.start;
      giveBtn.hidden = over || guesses.length < GIVE_UP_AFTER;
      if (over) clearTimeout(sureTimer);
    }
    function pick(code) {
      focus = code;
      globe.set({ focus });
      globe.focusOn(code);
      paintList();
      shell.main.scrollTo({ top: 0, behavior: document.documentElement.dataset.giMotion === 'reduced' ? 'auto' : 'smooth' });
    }
    function repaint() {
      paintLegend();
      globe.set({ guesses: guessItems() });
      paintList();
    }

    // ---- resultado
    function shareText() {
      const won = guesses.includes(answer.c);
      const sq = guesses
        .slice(0, SHARE_SQUARES)
        .map((code) => SQUARES[heatBucket(km(code))])
        .join('');
      const more = guesses.length > SHARE_SQUARES ? ` +${guesses.length - SHARE_SQUARES}` : '';
      return `game.it · ${t.name} #${dayNo} · ${won ? t.shareWin(guesses.length) : t.shareLose(guesses.length)}\n\n${sq}${more}\n${D.shareLink('rumbo')}`;
    }
    function result() {
      const won = guesses.includes(answer.c);
      return { won, score: attemptsBucket(guesses.length), title: won ? t.win : t.lose, sub: won ? t.winSub(guesses.length) : t.was, answers: [nameOf(answer, lang)], shareText: shareText() };
    }
    function reveal(animate) {
      globe.set({ solved: answer.c, focus: answer.c });
      focus = answer.c;
      globe.focusOn(answer.c, animate);
      paintList();
    }

    giveBtn.addEventListener('click', () => {
      if (over) return;
      if (!giveBtn.classList.contains('ask')) {
        giveBtn.classList.add('ask');
        giveBtn.textContent = t.sure;
        sureTimer = setTimeout(() => {
          giveBtn.classList.remove('ask');
          giveBtn.textContent = t.giveUp;
        }, 3500);
        return;
      }
      gaveUp = true;
      over = true;
      input.setDisabled(true);
      reveal(true);
      paintStatus();
      shell.save({ guesses, gaveUp }, true);
      shell.finish({ ...result(), delay: 1500 });
    });

    // ---- escribir un país
    const input = countryInput({
      ctx: c,
      lang,
      placeholder: t.placeholder,
      button: t.send,
      onUnknown: () => shell.toast(t.unknown),
      onSubmit(country) {
        if (over) return;
        if (guesses.includes(country.c)) return shell.toast(t.dup);
        if (!ctx.shapeBy.has(country.c)) return shell.toast(t.unknown);
        guesses.push(country.c);
        focus = country.c;
        const won = country.c === answer.c;
        over = won;
        globe.set({ guesses: guessItems(), focus });
        paintStatus();
        if (won) {
          reveal(true);
          input.setDisabled(true);
        } else {
          globe.focusOn(country.c);
          paintList(country.c);
        }
        shell.main.scrollTo({ top: 0, behavior: document.documentElement.dataset.giMotion === 'reduced' ? 'auto' : 'smooth' });
        shell.save({ guesses, gaveUp }, over);
        if (won) shell.finish({ ...result(), delay: 1500 });
        else input.focus();
      },
    });

    shell.main.append(globe.el, h('div', { class: 'rb-status' }, count, giveBtn), legend, list, h('div', { class: 'rb-dock' }, input.el));

    paintLegend();
    paintStatus();
    globe.set({ guesses: guessItems(), solved: over ? answer.c : null, focus: over ? answer.c : focus });
    paintList();
    if (over) {
      globe.set({ solved: answer.c, focus: answer.c });
      focus = answer.c;
      paintList();
    }
    if (guesses.length || over) globe.focusOn(over ? answer.c : focus, false);

    // cambio de tema o de alto contraste: se recalculan los colores de los países, la lista y la leyenda
    const mo = new MutationObserver(repaint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-gi-theme', 'data-hc'] });
    current = () => {
      mo.disconnect();
      globe.destroy();
      clearTimeout(sureTimer);
      current = null;
    };
    if (over) {
      input.setDisabled(true);
      shell.restoreResult(result());
    } else input.focus();
  },
});
