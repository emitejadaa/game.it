/* Colmena — game.it
 * Siete letras en un panal (una al centro y seis alrededor): formá palabras de 4 letras o más, usando solo esas letras
 * (se pueden repetir) y siempre la del centro. Un desafío nuevo por día; cada idioma tiene el suyo.
 *
 * Decisión sobre "ganar": el día cuenta como ganado (racha) al llegar a Genial (30 % de los puntos posibles). En ese
 * momento se llama a shell.finish con won:true (se muestra el resultado y se registra el día), pero el panal SIGUE
 * jugable: lo que se encuentra después se guarda y el resultado/compartir se actualizan (el objeto `res` es el mismo
 * que tiene el caparazón, por eso se modifica en el lugar). "Terminar" muestra todas las palabras; si todavía no se
 * llegó a Genial, termina el día como perdido.
 *
 * Datos: data/words-*.txt (palabras comunes) y data/puzzles-*.json (730 panales); ver tools/daily/colmena-gen.mjs.
 */
import { createDailyApp } from '/shared/daily-shell.js';
import { h, svg, ui, isModalOpen, modal, wait } from '/shared/daily-ui.js';
import * as D from '/shared/daily.js';
import { norm, isPangram, scoreWord, answersFor, totalPoints, thresholds, rankIndex, scanDict, WIN_IDX, MIN_LEN } from './logic.js';

const MAX_LEN = 24;
const SHUFFLE_ICON = 'M4 4v5h5M20 20v-5h-5M5.6 15a7 7 0 0 0 11.8 2.2M18.4 9a7 7 0 0 0-11.8-2.2';
const CHEVRON = 'M6 9l6 6 6-6';

const T = {
  es: {
    name: 'Colmena',
    ranks: ['Novato', 'Bien', 'Sólido', 'Genial', 'Experto', 'Asombroso', 'Panal completo'],
    hint: 'Tocá las letras o escribí',
    short: 'Muy corta: mínimo 4 letras',
    badLetters: 'Hay letras que no están en el panal',
    noCenter: 'Falta la letra del centro',
    dup: 'Ya la encontraste',
    unknown: 'No está en la lista',
    rare: 'Palabra rebuscada: vale pero no suma',
    looking: 'Buscando…',
    nice: '¡Bien!',
    good: '¡Muy bien!',
    great: '¡Excelente!',
    pangram: '¡Panagrama!',
    del: 'Borrar',
    mix: 'Mezclar',
    send: 'Enviar',
    found: 'Encontradas',
    pts: 'pts',
    words: (n) => (n === 1 ? 'palabra' : 'palabras'),
    goal: (r, n) => `Meta del día: ${r} · faltan ${n} pts`,
    next: (r, n) => `Próximo: ${r} · faltan ${n} pts`,
    full: '¡Encontraste todas las palabras!',
    end: 'Terminar',
    reveal: 'Ver todas las palabras',
    endTitle: '¿Terminar el día?',
    endLose: 'Vas a ver las palabras que faltaban y no podrás sumar más. Como todavía no llegaste a Genial, el día cuenta como perdido.',
    endWin: 'Vas a ver todas las palabras. Tu resultado de hoy ya está registrado.',
    yes: 'Terminar',
    no: 'Seguir jugando',
    sub: (p, n) => `${p} pts · ${n} ${n === 1 ? 'palabra' : 'palabras'}`,
    keep: 'Podés seguir jugando para subir de rango',
    missed: 'No llegaste a Genial',
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'Formá todas las palabras que puedas con las 7 letras del panal. Las palabras tienen que:'),
        h('ul', { class: 'cm-rules' }, h('li', null, 'tener 4 letras o más;'), h('li', null, 'usar solo las letras del panal (se pueden repetir);'), h('li', null, 'incluir siempre la letra del centro.')),
        h('p', null, 'Una palabra de 4 letras vale 1 punto; las más largas, un punto por letra. Un panagrama (usa las 7 letras) suma 7 puntos extra.'),
        h('p', null, 'Subí de rango: Novato, Bien, Sólido, Genial, Experto, Asombroso y Panal completo. Al llegar a Genial (30 % de los puntos posibles) el día cuenta como ganado y suma a tu racha, pero podés seguir jugando.'),
        h('p', { class: 'dg-mute' }, 'Escribí sin tildes. Valen verbos conjugados y plurales; no valen nombres propios ni palabras muy raras.'),
      ),
  },
  en: {
    name: 'Colmena',
    ranks: ['Beginner', 'Good', 'Solid', 'Great', 'Expert', 'Amazing', 'Full hive'],
    hint: 'Tap the letters or type',
    short: 'Too short: 4 letters minimum',
    badLetters: 'Some letters are not in the hive',
    noCenter: 'Missing the centre letter',
    dup: 'Already found',
    unknown: 'Not in the list',
    rare: 'Obscure word: valid but not counted',
    looking: 'Looking it up…',
    nice: 'Nice!',
    good: 'Good!',
    great: 'Excellent!',
    pangram: 'Pangram!',
    del: 'Delete',
    mix: 'Shuffle',
    send: 'Enter',
    found: 'Found',
    pts: 'pts',
    words: (n) => (n === 1 ? 'word' : 'words'),
    goal: (r, n) => `Goal for today: ${r} · ${n} pts to go`,
    next: (r, n) => `Next: ${r} · ${n} pts to go`,
    full: 'You found every word!',
    end: 'Finish',
    reveal: 'Show all words',
    endTitle: 'Finish for today?',
    endLose: "You'll see the words you missed and won't be able to score more. Since you haven't reached Great yet, today counts as a loss.",
    endWin: "You'll see every word. Today's result is already saved.",
    yes: 'Finish',
    no: 'Keep playing',
    sub: (p, n) => `${p} pts · ${n} ${n === 1 ? 'word' : 'words'}`,
    keep: 'You can keep playing to climb the ranks',
    missed: "You didn't reach Great",
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'Make as many words as you can from the 7 letters of the hive. Every word must:'),
        h('ul', { class: 'cm-rules' }, h('li', null, 'be 4 letters or longer;'), h('li', null, 'use only the hive letters (letters can repeat);'), h('li', null, 'always contain the centre letter.')),
        h('p', null, 'A 4-letter word is worth 1 point; longer words are worth one point per letter. A pangram (uses all 7 letters) adds 7 bonus points.'),
        h('p', null, 'Climb the ranks: Beginner, Good, Solid, Great, Expert, Amazing and Full hive. Reaching Great (30% of the possible points) counts the day as won and keeps your streak going, but you can keep playing.'),
        h('p', { class: 'dg-mute' }, 'Conjugated verbs and plurals count; proper names and very rare words do not.'),
      ),
  },
};

// Los rótulos del histograma son los nombres de rango; se actualizan al cambiar de idioma (la lista es la misma).
const LABELS = [...T.es.ranks];
const cache = new Map();
let cleanup = null;

async function loadLang(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const get = async (f, json) => {
    const r = await fetch(new URL(`./data/${f}`, import.meta.url));
    if (!r.ok) throw new Error(f);
    return json ? r.json() : r.text();
  };
  const [words, puzzles] = await Promise.all([get(`words-${lang}.txt`), get(`puzzles-${lang}.json`, true)]);
  const ctx = { words: words.split('\n').filter(Boolean), puzzles };
  cache.set(lang, ctx);
  return ctx;
}

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  for (const c of kids) e.append(c);
  return e;
}

// Geometría del panal: hexágonos con la punta a los costados (como un panal de verdad), 1 al centro y 6 alrededor.
const R = 38;
const GAP = 5;
const DIST = Math.sqrt(3) * R + GAP;
const HEX = Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 3) * k;
  return `${(R * Math.cos(a)).toFixed(1)},${(R * Math.sin(a)).toFixed(1)}`;
}).join(' ');
const cellPos = (i) => {
  if (i === 0) return [0, 0];
  const a = ((-90 + 60 * (i - 1)) * Math.PI) / 180;
  return [DIST * Math.cos(a), DIST * Math.sin(a)];
};

const reduced = () => !!window.GameIt?.prefs?.reducedMotion || document.documentElement.dataset.giMotion === 'reduced';

createDailyApp({
  id: 'colmena',
  epoch: '2026-10-06',
  rows: 7,
  labels: LABELS,
  t: T,
  load: loadLang,
  build(shell, { ctx, lang, mode, dayNo, rnd, saved }) {
    cleanup?.();
    const t = T[lang];
    LABELS.splice(0, 7, ...t.ranks);

    // ---------------------------------------------------------------- el desafío
    const pz = ctx.puzzles;
    const [letters, center] = mode === 'daily' ? pz[(((dayNo - 1) % pz.length) + pz.length) % pz.length] : pz[Math.floor(rnd() * pz.length)];
    const outer = [...letters].filter((c) => c !== center);
    const answers = answersFor(ctx.words, letters, center);
    const answerSet = new Set(answers);
    const max = totalPoints(answers, letters);
    const marks = thresholds(max);
    const pangrams = answers.filter((w) => isPangram(w, letters));

    let order = D.shuffle(rnd, outer);
    if (saved?.ord && [...saved.ord].sort().join('') === [...outer].sort().join('')) order = [...saved.ord];
    const found = (saved?.found || []).filter((w) => answerSet.has(w));
    const got = new Set(found);
    let fin = !!saved?.fin;
    let ended = !!saved?.ended;
    let rec = saved?.rec || 0; // cubo del histograma ya registrado (1…7)
    let cur = '';
    let busy = false;
    let dead = false;
    let open = window.innerWidth >= 600;
    let rare = null;
    let lastToast = null;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!dead) fn();
      }, ms);
      timers.add(id);
    };

    const points = () => found.reduce((s, w) => s + scoreWord(w, letters), 0);
    const say = (msg) => {
      lastToast?.remove();
      lastToast = shell.toast(msg);
    };

    // ---------------------------------------------------------------- pantalla
    const rankEl = h('div', { class: 'cm-rank' });
    const ptsEl = h('div', { class: 'cm-pts' });
    const fill = h('div', { class: 'cm-fill' });
    const dots = t.ranks.map((name, i) => h('i', { class: `cm-dot${i === WIN_IDX ? ' goal' : ''}`, style: `left:${(i / 6) * 100}%`, title: name }));
    const nextEl = h('div', { class: 'cm-next' });
    const prog = h('div', { class: 'cm-prog' }, h('div', { class: 'cm-prog-top' }, rankEl, ptsEl), h('div', { class: 'cm-bar' }, h('div', { class: 'cm-track' }), fill, dots), nextEl);

    const wordEl = h('div', { class: 'cm-word', 'aria-live': 'polite' });

    const cells = [];
    const hive = el('svg', { class: 'cm-hive', viewBox: '-104 -108 208 216', role: 'group', 'aria-label': t.name });
    for (let i = 0; i < 7; i++) {
      const [x, y] = cellPos(i);
      const text = el('text', { class: 'cm-t' });
      const g = el('g', { class: `cm-cell${i === 0 ? ' ctr' : ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, role: 'button' }, el('g', { class: 'in' }, el('polygon', { class: 'cm-hex', points: HEX }), text));
      g.style.setProperty('--i', i);
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        add(i === 0 ? center : order[i - 1]);
        g.classList.add('p');
        setTimeout(() => g.classList.remove('p'), 130);
      });
      cells.push({ g, text });
      hive.append(g);
    }
    const paintLetters = () => {
      cells[0].text.textContent = center.toUpperCase();
      cells[0].g.setAttribute('aria-label', center.toUpperCase());
      order.forEach((c, k) => {
        cells[k + 1].text.textContent = c.toUpperCase();
        cells[k + 1].g.setAttribute('aria-label', c.toUpperCase());
      });
    };

    const btn = (cls, label, fn, icon) => {
      const b = h('button', { class: `dg-btn ${cls}`, type: 'button' }, icon ? svg(icon) : null, h('span', null, label));
      b.addEventListener('click', (e) => {
        fn();
        if (e.detail) b.blur(); // tras un clic de mouse, Enter tiene que seguir enviando la palabra
      });
      return b;
    };
    const bDel = btn('ghost', t.del, del, 'M21 5H9l-6 7 6 7h12zM16.5 9.5l-5 5M11.5 9.5l5 5');
    const bMix = btn('ghost', t.mix, shuffle, SHUFFLE_ICON);
    const bSend = btn('', t.send, submit);
    const btns = h('div', { class: 'cm-btns' }, bDel, bMix, bSend);

    const foundCount = h('b', null);
    const prev = h('div', { class: 'cm-prev' });
    const list = h('div', { class: 'cm-list' });
    const chevron = svg(CHEVRON);
    chevron.setAttribute('class', 'cm-chev');
    const head = h('button', { class: 'cm-found-head', type: 'button', 'aria-expanded': String(open) }, foundCount, prev, chevron);
    const foundBox = h('div', { class: 'cm-found' }, head, list);
    head.addEventListener('click', () => {
      open = !open;
      head.setAttribute('aria-expanded', String(open));
      foundBox.classList.toggle('open', open);
    });
    foundBox.classList.toggle('open', open);
    const endBtn = h('button', { class: 'cm-end', type: 'button' });
    endBtn.addEventListener('click', askEnd);

    shell.main.append(h('div', { class: 'cm-wrap' }, prog, wordEl, hive, btns, foundBox, endBtn));

    // ---------------------------------------------------------------- pintar
    function paintWord() {
      const kids = [...cur].map((ch) => h('span', { class: ch === center ? 'c' : letters.includes(ch) ? '' : 'x' }, ch));
      kids.push(cur ? h('i', { class: 'cm-caret' }) : h('span', { class: 'ph' }, t.hint));
      wordEl.replaceChildren(...kids);
      wordEl.classList.toggle('long', cur.length > 12);
    }

    let lastIdx = -1;
    function paintProgress() {
      const pts = points();
      const idx = rankIndex(pts, max);
      const span = marks[Math.min(idx + 1, 6)] - marks[idx];
      const frac = idx >= 6 ? 1 : (idx + (span > 0 ? (pts - marks[idx]) / span : 0)) / 6;
      fill.style.width = `${(frac * 100).toFixed(1)}%`;
      dots.forEach((d, i) => d.classList.toggle('on', i <= idx));
      rankEl.textContent = t.ranks[idx];
      ptsEl.textContent = `${pts} ${t.pts}`;
      if (idx < WIN_IDX) nextEl.textContent = t.goal(t.ranks[WIN_IDX], marks[WIN_IDX] - pts);
      else if (idx < 6) nextEl.textContent = t.next(t.ranks[idx + 1], marks[idx + 1] - pts);
      else nextEl.textContent = t.full;
      if (lastIdx >= 0 && idx > lastIdx && !reduced()) {
        rankEl.classList.remove('up');
        void rankEl.offsetWidth;
        rankEl.classList.add('up');
      }
      lastIdx = idx;
      return idx;
    }

    function paintFound(newWord) {
      const mk = (w, miss) => h('span', { class: `cm-w${isPangram(w, letters) ? ' pg' : ''}${miss ? ' miss' : ''}${w === newWord ? ' new' : ''}` }, w);
      foundCount.textContent = ended ? `${found.length} / ${answers.length}` : `${found.length} ${t.words(found.length)}`;
      const recent = found
        .slice(-8)
        .reverse()
        .map((w) => h('span', { class: isPangram(w, letters) ? 'pg' : '' }, w));
      prev.replaceChildren(...recent);
      const shown = ended ? answers : [...found].sort();
      list.replaceChildren(...shown.map((w) => mk(w, !got.has(w))));
    }

    function paintEnd() {
      endBtn.hidden = ended;
      endBtn.textContent = fin ? t.reveal : t.end;
    }

    function setEnded() {
      hive.classList.toggle('off', ended);
      wordEl.classList.toggle('off', ended);
      for (const b of [bDel, bMix, bSend]) b.disabled = ended;
      paintEnd();
    }

    // ---------------------------------------------------------------- resultado (el mismo objeto que usa el caparazón)
    const res = { won: false, score: 1, title: '', sub: '', answers: [], shareText: '' };
    function fillResult() {
      const pts = points();
      const idx = rankIndex(pts, max);
      res.won = idx >= WIN_IDX;
      res.score = idx + 1;
      res.title = t.ranks[idx];
      res.sub = [t.sub(pts, found.length), res.won ? (ended ? null : t.keep) : ended ? t.missed : null].filter(Boolean).join(' · ');
      res.answers = ended ? pangrams : [];
      const bar = '🟨'.repeat(idx + 1) + '⬛'.repeat(6 - idx);
      res.shareText = `game.it · ${t.name} #${dayNo} · ${t.ranks[idx]} (${pts} ${t.pts})\n\n${bar}\n${D.shareLink('colmena')}`;
      return idx;
    }

    function persist() {
      shell.save({ found, ord: order.join(''), fin, ended, rec }, fin || ended);
    }

    // Si se sigue subiendo de rango después de registrar el día, el histograma pasa a contar el rango final.
    function moveBucket(from, to) {
      if (mode !== 'daily' || !from || from === to) return;
      try {
        const key = `gameit:colmena:stats:${lang}`;
        const s = JSON.parse(localStorage.getItem(key));
        if (!s?.dist || s.last !== shell.date) return;
        s.dist[from] = Math.max(0, (s.dist[from] || 0) - 1);
        s.dist[to] = (s.dist[to] || 0) + 1;
        localStorage.setItem(key, JSON.stringify(s));
      } catch {}
    }

    // ---------------------------------------------------------------- escribir
    function add(c) {
      if (ended || dead || cur.length >= MAX_LEN) return;
      cur += c;
      wordEl.classList.remove('shake', 'flash');
      paintWord();
    }
    function del() {
      if (ended || dead) return;
      cur = cur.slice(0, -1);
      paintWord();
    }
    async function shuffle() {
      if (ended || busy) return;
      busy = true;
      hive.classList.add('shuf');
      await wait(170);
      if (dead) return;
      let next = order;
      for (let n = 0; n < 6 && next.join('') === order.join(''); n++) next = D.shuffle(Math.random, order);
      order = next;
      paintLetters();
      hive.classList.remove('shuf');
      busy = false;
      persist();
    }

    // Rechazo: la palabra se pinta en rojo, tiembla y se borra.
    function reject(msg) {
      say(msg);
      const w = cur;
      cur = '';
      wordEl.replaceChildren(...[...w].map((ch) => h('span', { class: 'x' }, ch)));
      wordEl.classList.remove('flash');
      wordEl.classList.remove('shake');
      void wordEl.offsetWidth;
      if (!reduced()) wordEl.classList.add('shake');
      later(() => !cur && paintWord(), 380);
    }

    function dictionary() {
      rare ||= fetch(`/games/mecha/dict/${lang}.txt`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error('dict'))))
        .then((txt) => new Set(scanDict(txt, letters, center)))
        .catch(() => {
          rare = null;
          return null;
        });
      return rare;
    }

    async function submit() {
      if (ended || busy || dead) return;
      const w = cur;
      if (!w) return;
      if (w.length < MIN_LEN) return reject(t.short);
      if ([...w].some((c) => !letters.includes(c))) return reject(t.badLetters);
      if (!w.includes(center)) return reject(t.noCenter);
      if (got.has(w)) return reject(t.dup);
      if (answerSet.has(w)) return accept(w);
      // fuera de la lista común: se busca en el diccionario completo (se baja una sola vez, recién ahora)
      busy = true;
      if (!rare) say(t.looking);
      const set = await dictionary();
      busy = false;
      if (dead) return;
      if (set?.has(w)) {
        say(t.rare);
        if (cur === w) {
          cur = '';
          paintWord();
        }
      } else if (cur === w) reject(t.unknown);
      else say(t.unknown);
    }

    function accept(w) {
      const before = lastIdx;
      found.push(w);
      got.add(w);
      cur = '';
      paintWord();
      const sc = scoreWord(w, letters);
      const pg = isPangram(w, letters);
      const idx = paintProgress();
      paintFound(w);
      wordEl.classList.remove('shake');
      void wordEl.offsetWidth;
      if (!reduced()) wordEl.classList.add('flash');
      let msg = pg ? t.pangram : w.length >= 7 ? t.great : w.length >= 5 ? t.good : t.nice;
      msg += ` +${sc}`;
      if (idx > before) msg += ` · ${t.ranks[idx]}`;
      say(msg);
      if (pg && !reduced()) {
        hive.classList.add('wave');
        later(() => hive.classList.remove('wave'), 1100);
      }
      // Genial: el día se registra como ganado, pero el panal sigue jugable
      if (!fin && idx >= WIN_IDX) {
        fin = true;
        fillResult();
        rec = idx + 1;
        paintEnd();
        res.delay = pg ? 1500 : 1100;
        shell.finish(res); // el caparazón guarda este mismo objeto: al seguir jugando se actualiza en el lugar
      } else if (fin) {
        const nidx = fillResult();
        if (nidx + 1 > rec) {
          moveBucket(rec, nidx + 1);
          rec = nidx + 1;
        }
      }
      if (found.length === answers.length) endGame(true);
      persist();
    }

    function endGame(auto) {
      if (ended) return;
      ended = true;
      fillResult();
      setEnded();
      paintFound();
      if (!fin) {
        // todavía no había llegado a Genial: el día termina como perdido
        fin = true;
        rec = res.score;
        res.delay = 500;
        shell.finish(res);
      } else later(() => shell.showResult(), auto ? 1300 : 300);
      persist();
    }

    function askEnd() {
      if (ended) return;
      const body = h(
        'div',
        null,
        h('p', null, fin ? t.endWin : t.endLose),
        h(
          'div',
          { class: 'dg-actions' },
          h('button', { class: 'dg-btn', type: 'button', onclick: () => (dlg.close(true), endGame(false)) }, t.yes),
          h('button', { class: 'dg-btn ghost', type: 'button', onclick: () => dlg.close() }, t.no),
        ),
      );
      const dlg = modal({ title: t.endTitle, body });
    }

    // ---------------------------------------------------------------- teclado
    function onKey(e) {
      if (ended || dead || isModalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
      const onButton = document.activeElement?.tagName === 'BUTTON';
      if (e.key === 'Enter') {
        if (onButton) return; // el botón enfocado hace su trabajo
        e.preventDefault();
        submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        del();
      } else if (e.key.length === 1) {
        const c = norm(e.key, lang);
        if (c.length === 1) {
          e.preventDefault();
          add(c);
        }
      }
    }
    document.addEventListener('keydown', onKey);
    cleanup = () => {
      dead = true;
      document.removeEventListener('keydown', onKey);
      timers.forEach(clearTimeout);
      lastToast?.remove();
    };

    // ---------------------------------------------------------------- arranque
    paintLetters();
    paintWord();
    paintProgress();
    paintFound();
    setEnded();
    fillResult();
    if (fin) shell.restoreResult(res); // día ya registrado: se muestra el resultado sin volver a contarlo
  },
});
