/* Tibio — game.it
 * Hay una palabra secreta. Escribí cualquier palabra y te decimos en qué puesto está por significado (no por letras):
 * el puesto 1 es la palabra secreta, cuanto más bajo el número, más cerca. Adivinala con el menor número de intentos.
 * Vectores de palabras: fastText (CC BY-SA 3.0), reducidos con tools/daily/tibio-build.py. Ver data/LICENSE.txt.
 */
import { createDailyApp } from '/shared/daily-shell.js';
import { h } from '/shared/daily-ui.js';
import * as D from '/shared/daily.js';
import { norm } from '/shared/words5/norm.js';
import { prepare, rankAll, tier, bar, squares, bucket, hintRank, MAX_HINTS } from './rank.js';

const LABELS = ['≤10', '11-25', '26-50', '51-100', '101-200', '201+'];
const T = {
  es: {
    name: 'Tibio',
    placeholder: 'Escribí una palabra…',
    send: 'Probar',
    unknown: 'No conozco esa palabra',
    dup: 'Ya probaste esa palabra',
    hint: 'Pista',
    giveUp: 'Me rindo',
    sure: '¿Seguro?',
    noHints: 'Ya usaste las 3 pistas',
    tooClose: 'Estás tan cerca que no hace falta una pista',
    hinted: (w, r) => `Pista: «${w}» está en el puesto ${r}`,
    tries: (n) => (n === 1 ? '1 intento' : `${n} intentos`),
    best: 'Mejor',
    none: 'todavía nada',
    of: (r, n) => `puesto ${r.toLocaleString('es-AR')} de ${n.toLocaleString('es-AR')}`,
    empty: 'Probá la primera palabra: cualquiera sirve para empezar.',
    win: (n) => (n <= 10 ? '¡Increíble!' : n <= 25 ? '¡Genial!' : n <= 50 ? '¡Muy bien!' : n <= 100 ? '¡Bien!' : '¡Al fin!'),
    winSub: (n, hints) => `La encontraste en ${n === 1 ? '1 intento' : `${n} intentos`}${hints ? ` (${hints === 1 ? '1 pista' : `${hints} pistas`})` : ''}.`,
    lose: 'Te rendiste',
    was: 'La palabra era:',
    shareWin: (n, hints) => `${n === 1 ? '1 intento' : `${n} intentos`}${hints ? ` · ${hints} ${hints === 1 ? 'pista' : 'pistas'}` : ''}`,
    shareLose: 'me rendí',
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'Hay una palabra secreta. Escribí cualquier palabra y te diremos en qué puesto está respecto de la secreta, ordenadas por cercanía de significado.'),
        h('p', null, 'El puesto 1 es la palabra secreta: cuanto más bajo el número, más cerca estás. No importan las letras sino el sentido: «perro» está más cerca de «gato» que de «perno».'),
        h('p', null, 'Verde: entre las 300 más cercanas. Amarillo: hasta el puesto 1.500. Rojo: más lejos.'),
        h('p', null, `Tenés ${MAX_HINTS} pistas: cada una revela una palabra más o menos a la mitad de tu mejor puesto, y cuenta como un intento. Con «Me rindo» ves la respuesta.`),
        h('p', { class: 'dg-mute' }, 'Vectores de palabras: fastText, Facebook AI Research (CC BY-SA 3.0), reducidos para este juego. Licencia en data/LICENSE.txt.'),
      ),
  },
  en: {
    name: 'Tibio',
    placeholder: 'Type a word…',
    send: 'Guess',
    unknown: 'I do not know that word',
    dup: 'You already tried that word',
    hint: 'Hint',
    giveUp: 'Give up',
    sure: 'Sure?',
    noHints: 'You used all 3 hints',
    tooClose: "You're so close you don't need a hint",
    hinted: (w, r) => `Hint: "${w}" is at rank ${r}`,
    tries: (n) => (n === 1 ? '1 guess' : `${n} guesses`),
    best: 'Best',
    none: 'nothing yet',
    of: (r, n) => `rank ${r.toLocaleString('en-US')} of ${n.toLocaleString('en-US')}`,
    empty: 'Try your first word: anything goes to start.',
    win: (n) => (n <= 10 ? 'Incredible!' : n <= 25 ? 'Great!' : n <= 50 ? 'Very good!' : n <= 100 ? 'Nice!' : 'Finally!'),
    winSub: (n, hints) => `You found it in ${n === 1 ? '1 guess' : `${n} guesses`}${hints ? ` (${hints === 1 ? '1 hint' : `${hints} hints`})` : ''}.`,
    lose: 'You gave up',
    was: 'The word was:',
    shareWin: (n, hints) => `${n === 1 ? '1 guess' : `${n} guesses`}${hints ? ` · ${hints} ${hints === 1 ? 'hint' : 'hints'}` : ''}`,
    shareLose: 'I gave up',
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'There is a secret word. Type any word and we tell you its rank compared to the secret one, sorted by closeness in meaning.'),
        h('p', null, 'Rank 1 is the secret word itself: the lower the number, the closer you are. It is about meaning, not letters: "dog" is closer to "cat" than to "dot".'),
        h('p', null, 'Green: among the 300 closest. Yellow: up to rank 1,500. Red: further away.'),
        h('p', null, `You get ${MAX_HINTS} hints: each one reveals a word about halfway to your best rank, and counts as a guess. "Give up" shows the answer.`),
        h('p', { class: 'dg-mute' }, 'Word vectors: fastText, Facebook AI Research (CC BY-SA 3.0), reduced for this game. License in data/LICENSE.txt.'),
      ),
  },
};

// Datos por idioma: se bajan una sola vez aunque se cambie de idioma o se juegue en práctica.
const cache = new Map();
async function loadLang(lang) {
  if (!cache.has(lang)) {
    const get = (f, kind) => fetch(`./data/${f}-${lang}.${kind}`).then((r) => (r.ok ? (kind === 'bin' ? r.arrayBuffer() : kind === 'txt' ? r.text() : r.json()) : Promise.reject(new Error(f))));
    const p = Promise.all([get('meta', 'json'), get('vectors', 'bin'), get('words', 'txt'), get('secrets', 'json')]).then(([meta, buf, txt, secrets]) => {
      const words = txt.split('\n');
      if (words[words.length - 1] === '') words.pop();
      const index = new Map();
      words.forEach((w, i) => index.set(norm(w, lang), i));
      return { lang, words, index, secrets, n: meta.n, m: prepare(buf, meta.n, meta.dims) };
    });
    p.catch(() => cache.delete(lang));
    cache.set(lang, p);
  }
  return cache.get(lang);
}

createDailyApp({
  id: 'tibio',
  epoch: '2026-10-06',
  rows: LABELS.length,
  labels: LABELS,
  t: T,
  load: loadLang,
  build(shell, { ctx, lang, mode, dayNo, rnd, saved }) {
    const t = T[lang];
    const fmt = (r) => r.toLocaleString(lang === 'en' ? 'en-US' : 'es-AR');
    const secretKey = mode === 'daily' ? ctx.secrets[(dayNo - 1) % ctx.secrets.length] : ctx.secrets[Math.floor(rnd() * ctx.secrets.length)];
    const secret = ctx.index.get(secretKey);
    const { rankOf, order } = rankAll(ctx.m, secret);
    const rankToIdx = (r) => order[r - 1];

    // intentos: { i: índice de la palabra, r: puesto, hint }
    const guesses = [];
    const seen = new Set();
    const addGuess = (i, hint) => {
      seen.add(i);
      const g = { i, r: rankOf[i], hint: !!hint };
      guesses.push(g);
      return g;
    };
    for (const [w, hint] of saved?.g || []) {
      const i = ctx.index.get(w);
      if (i !== undefined && !seen.has(i)) addGuess(i, hint);
    }
    let over = !!saved?.done;
    let gaveUp = !!saved?.gaveUp;
    let sure = 0;

    // ------------------------------------------------ pantalla
    const status = h('div', { class: 'tb-status' });
    const last = h('div', { class: 'tb-last', hidden: true });
    const list = h('div', { class: 'tb-list' });
    const input = h('input', { type: 'text', class: 'dg-ac-input', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', placeholder: t.placeholder, 'aria-label': t.placeholder });
    const send = h('button', { class: 'dg-btn', type: 'button' }, t.send);
    const hintBtn = h('button', { class: 'dg-btn ghost tb-small', type: 'button' });
    const giveBtn = h('button', { class: 'dg-btn ghost tb-small', type: 'button' }, t.giveUp);
    const controls = h('div', { class: 'tb-controls' }, h('div', { class: 'tb-entry' }, input, send), h('div', { class: 'tb-actions' }, hintBtn, giveBtn));

    const hintsUsed = () => guesses.filter((g) => g.hint).length;
    const best = () => guesses.reduce((b, g) => Math.min(b, g.r), Infinity);

    function row(g, extra = '') {
      const word = ctx.words[g.i];
      const rk = h('b', null, fmt(g.r));
      const fill = h('i', { style: `width:${(bar(g.r, ctx.n) * 100).toFixed(1)}%` });
      return h('div', { class: `tb-row tb-${tier(g.r)}${g.r === 1 ? ' win' : ''}${g.hint ? ' hint' : ''}${extra}` }, h('div', { class: 'tb-fill' }, fill), h('span', { class: 'tb-word' }, word, g.hint ? h('small', null, ' ✦') : null), rk);
    }
    function paint(newG) {
      status.replaceChildren(h('span', null, t.tries(guesses.length)), h('span', { class: 'tb-best' }, `${t.best}: `, h('b', null, guesses.length ? `#${fmt(best())}` : '—')));
      const sorted = [...guesses].sort((a, b) => a.r - b.r);
      const shown = over && gaveUp ? [{ i: secret, r: 1, hint: false }, ...sorted] : sorted;
      list.replaceChildren(...shown.map((g) => row(g, g === newG ? ' new' : '')));
      const l = newG || guesses[guesses.length - 1];
      last.hidden = !l;
      if (l) {
        last.className = `tb-last tb-${tier(l.r)}${l.r === 1 ? ' win' : ''}`;
        last.replaceChildren(h('div', { class: 'tb-lw' }, ctx.words[l.i]), h('div', { class: 'tb-lr' }, t.of(l.r, ctx.n)), h('div', { class: 'tb-fill' }, h('i', { style: `width:${(bar(l.r, ctx.n) * 100).toFixed(1)}%` })));
      }
      if (!guesses.length && !over) list.replaceChildren(h('p', { class: 'dg-mute tb-empty' }, t.empty));
      const left = MAX_HINTS - hintsUsed();
      hintBtn.textContent = `${t.hint} · ${left}`;
      hintBtn.disabled = over || left <= 0;
      giveBtn.disabled = over;
      giveBtn.textContent = sure ? t.sure : t.giveUp;
      giveBtn.classList.toggle('arm', !!sure);
    }
    const scrollTop = () => shell.main.scrollTo({ top: 0, behavior: window.GameIt?.prefs?.reducedMotion ? 'auto' : 'smooth' });
    const save = () => shell.save({ g: guesses.map((g) => [norm(ctx.words[g.i], lang), g.hint ? 1 : 0]), done: over, gaveUp }, over);

    function result() {
      const won = guesses.some((g) => g.i === secret);
      const n = guesses.length;
      const hints = hintsUsed();
      const ranks = guesses.map((g) => g.r);
      const tag = won ? t.shareWin(n, hints) : t.shareLose;
      const row8 = squares(ranks);
      return {
        won,
        score: won ? bucket(n) : undefined,
        title: won ? t.win(n) : t.lose,
        sub: won ? t.winSub(n, hints) : t.was,
        answers: [ctx.words[secret]],
        shareText: `game.it · ${t.name} #${shell.dayNo} · ${tag}${row8 ? `\n\n${row8}` : ''}\n${D.shareLink('tibio')}`,
      };
    }
    function end(newG) {
      over = true;
      input.disabled = send.disabled = true;
      controls.classList.add('off');
      sure = 0;
      paint(newG);
      save();
    }

    function guessIdx(i, hint) {
      const g = addGuess(i, hint);
      if (g.r === 1) {
        end(g);
        shell.finish({ ...result(), delay: 1100 });
      } else {
        paint(g);
        save();
      }
      scrollTop();
    }
    function submit() {
      if (over) return;
      const w = norm(input.value.trim(), lang);
      if (!w) return;
      const i = ctx.index.get(w);
      if (i === undefined) return shell.toast(t.unknown);
      if (seen.has(i)) {
        input.select();
        return shell.toast(t.dup);
      }
      input.value = '';
      sure = 0;
      guessIdx(i, false);
      input.focus({ preventScroll: true });
    }
    hintBtn.onclick = () => {
      if (over) return;
      if (hintsUsed() >= MAX_HINTS) return shell.toast(t.noHints);
      const r = hintRank(best(), new Set(guesses.map((g) => g.r)), ctx.n);
      if (!r) return shell.toast(t.tooClose);
      const i = rankToIdx(r);
      sure = 0;
      shell.toast(t.hinted(ctx.words[i], fmt(r)), 2600);
      guessIdx(i, true);
    };
    giveBtn.onclick = () => {
      if (over) return;
      if (!sure) {
        sure = 1;
        paint();
        setTimeout(() => {
          if (sure && !over) {
            sure = 0;
            paint();
          }
        }, 3000);
        return;
      }
      gaveUp = true;
      end();
      shell.finish({ ...result(), delay: 500 });
    };
    send.onclick = submit;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    shell.main.append(status, last, list, controls);
    paint();
    if (over) {
      input.disabled = send.disabled = true;
      controls.classList.add('off');
      shell.restoreResult(result());
    } else input.focus({ preventScroll: true });
  },
});
