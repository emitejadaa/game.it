/* Vínculos — game.it
 * 16 palabras, 4 grupos ocultos de 4 palabras que comparten algo. Elegí 4 y tocá "Enviar": si son un grupo, se descubre su tema;
 * si no, perdés una vida (4 errores). Un desafío nuevo por día (igual para todos). Lógica pura en logic.js, datos en data/.
 */
import { createDailyApp } from '/shared/daily-shell.js';
import { h, ui, wait } from '/shared/daily-ui.js';
import * as D from '/shared/daily.js';
import * as L from './logic.js';

const T = {
  es: {
    name: 'Vínculos',
    lives: 'Errores',
    livesLeft: (n) => (n === 1 ? 'Te queda 1 error' : `Te quedan ${n} errores`),
    grid: 'Palabras',
    submit: 'Enviar',
    result: 'Ver resultado',
    shuffle: 'Mezclar',
    clear: 'Deseleccionar',
    oneAway: '¡A una!',
    dup: 'Ya probaste esa combinación',
    level: 'Nivel',
    levels: ['Más fácil', 'Fácil', 'Difícil', 'Más difícil'],
    win: ['¡Perfecto!', '¡Muy bien!', '¡Bien ahí!', '¡Uf, justo!'],
    lose: '¡Casi!',
    was: 'Los grupos eran:',
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'Hay 16 palabras. Encontrá los 4 grupos de 4 palabras que tienen algo en común.'),
        h('p', null, 'Elegí 4 palabras y tocá Enviar. Si son un grupo, se descubre con su tema. Si no, perdés una vida: tenés 4 errores. Si tres de las cuatro eran de un mismo grupo, te avisamos con un "¡A una!".'),
        h('p', null, 'Cada color marca una dificultad, de más fácil a más difícil. Ojo: hay palabras que parecen de un grupo y son de otro.'),
        legend(T.es),
        h('p', { class: 'dg-mute' }, 'Con el teclado: flechas para moverte, espacio o Enter para elegir.'),
      ),
  },
  en: {
    name: 'Vínculos',
    lives: 'Mistakes',
    livesLeft: (n) => (n === 1 ? '1 mistake left' : `${n} mistakes left`),
    grid: 'Words',
    submit: 'Submit',
    result: 'See result',
    shuffle: 'Shuffle',
    clear: 'Deselect all',
    oneAway: 'One away!',
    dup: 'You already tried that combination',
    level: 'Level',
    levels: ['Easiest', 'Easy', 'Hard', 'Hardest'],
    win: ['Perfect!', 'Very good!', 'Well done!', 'Phew, just in time!'],
    lose: 'So close!',
    was: 'The groups were:',
    help: () =>
      h(
        'div',
        null,
        h('p', null, 'There are 16 words. Find the 4 groups of 4 words that have something in common.'),
        h('p', null, 'Pick 4 words and press Submit. If they form a group, its theme is revealed. If not, you lose a life: you have 4 mistakes. If three of the four belonged to the same group, you get a "One away!".'),
        h('p', null, 'Each colour marks a difficulty, from easiest to hardest. Careful: some words look like they belong to one group but fit another.'),
        legend(T.en),
        h('p', { class: 'dg-mute' }, 'With a keyboard: arrow keys to move, space or Enter to pick.'),
      ),
  },
};

// Marca de nivel (no depender solo del color): círculo, rombo, triángulo, cuadrado.
const NS = 'http://www.w3.org/2000/svg';
const MARKS = { 1: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z', 2: 'M12 3l9 9-9 9-9-9z', 3: 'M12 4l9.5 16h-19z', 4: 'M5 5h14v14H5z' };
function mark(n) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'vn-mark');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', MARKS[n]);
  s.append(p);
  return s;
}
const legend = (t) => h('div', { class: 'vn-legend' }, [1, 2, 3, 4].map((n) => h('span', { class: `vn-chip l${n}` }, mark(n), t.levels[n - 1])));

const reduced = () => document.documentElement.dataset.giMotion === 'reduced' || window.GameIt?.prefs?.reducedMotion;

createDailyApp({
  id: 'vinculos',
  epoch: '2026-10-06',
  rows: 4,
  labels: ['0', '1', '2', '3'],
  t: T,
  async load(lang) {
    const r = await fetch(`./data/puzzles-${lang}.json`);
    if (!r.ok) throw new Error(`puzzles-${lang}: ${r.status}`);
    const puzzles = await r.json();
    if (!Array.isArray(puzzles) || !puzzles.length) throw new Error('sin desafíos');
    return { puzzles };
  },
  build(shell, { ctx, lang, mode, dayNo, rnd, saved }) {
    const t = T[lang];
    const pz = mode === 'daily' ? L.pickPuzzle(ctx.puzzles, dayNo) : ctx.puzzles[Math.floor(Math.random() * ctx.puzzles.length)];
    const picks = mode === 'daily' && saved && L.validPicks(pz, saved.picks) ? saved.picks.map((p) => [...p]) : [];
    let order = mode === 'daily' && saved && L.validOrder(pz, saved.order) ? [...saved.order] : L.initialOrder(pz, rnd);
    let st = L.derive(pz, picks);
    // grupos con banda a la vista (los encontrados, y al perder también los que revelamos)
    const shown = [...st.found];
    const sel = []; // palabras elegidas, en el orden en que se eligieron
    let busy = false;
    let focusWord = null;
    let ended = false; // terminó y ya se mostró todo: en vez de los botones queda "Ver resultado"

    // ---------------------------------------------------------------- piezas
    const dots = Array.from({ length: L.MISTAKES }, () => h('span', { class: 'vn-dot' }));
    const lives = h('div', { class: 'vn-lives', role: 'img' }, h('span', null, t.lives), h('span', { class: 'vn-dots' }, dots));
    const bands = h('div', { class: 'vn-bands' });
    const grid = h('div', { class: 'vn-grid', role: 'group', 'aria-label': t.grid });
    const bShuffle = h('button', { class: 'vn-btn', type: 'button', onclick: shuffleTiles }, t.shuffle);
    const bClear = h('button', { class: 'vn-btn', type: 'button', onclick: clearSel }, t.clear);
    const bSubmit = h('button', { class: 'vn-btn main', type: 'button', onclick: submit }, t.submit);
    const bResult = h('button', { class: 'vn-btn main', type: 'button', hidden: true, onclick: () => shell.showResult() }, t.result);
    const root = h('div', { class: 'vn' }, lives, bands, grid, h('div', { class: 'vn-actions' }, bShuffle, bClear, bSubmit, bResult));
    shell.main.append(root);
    const alive = () => root.isConnected;

    const tiles = new Map();
    for (const w of L.allWords(pz)) {
      const tile = h('button', { class: 'vn-tile', type: 'button', 'aria-pressed': 'false', tabindex: '-1', style: `--fs:${L.fontSize(w)}`, onclick: () => toggle(w), onfocus: () => ((focusWord = w), roving()) }, w);
      tiles.set(w, tile);
    }

    const gone = () => new Set(shown.flatMap((g) => pz.grupos[g].palabras));
    const left = () => L.remaining(order, gone());

    function paintLives(lostNow = false) {
      const n = L.MISTAKES - st.mistakes;
      dots.forEach((d, i) => {
        const off = i >= n;
        d.classList.toggle('off', off);
        d.classList.toggle('pop', lostNow && i === n);
      });
      lives.setAttribute('aria-label', `${t.lives}: ${t.livesLeft(n)}`);
    }
    function paintSel() {
      for (const [w, el] of tiles) {
        const on = sel.includes(w);
        el.classList.toggle('sel', on);
        el.setAttribute('aria-pressed', String(on));
      }
      bSubmit.disabled = busy || st.over || sel.length !== 4;
      bClear.disabled = busy || st.over || !sel.length;
      bShuffle.disabled = busy || st.over;
      for (const b of [bShuffle, bClear, bSubmit]) b.hidden = ended;
      bResult.hidden = !ended;
    }
    // un solo tab-stop para toda la grilla (foco "móvil")
    function roving() {
      const list = left();
      const cur = list.includes(focusWord) ? focusWord : list[0];
      for (const w of list) tiles.get(w).tabIndex = w === cur ? 0 : -1;
    }
    function addBand(g, { animate = false, missed = false } = {}) {
      const grp = pz.grupos[g];
      bands.append(
        h(
          'div',
          { class: `vn-band l${grp.nivel}${missed ? ' missed' : ''}${animate ? ' in' : ''}` },
          h('div', { class: 'vn-bhead' }, mark(grp.nivel), h('span', null, grp.tema), h('span', { class: 'dg-sr' }, `${t.level} ${grp.nivel}`)),
          h('div', { class: 'vn-bwords' }, grp.palabras.join(', ')),
        ),
      );
    }

    // Reubica las fichas que quedan; con `flip` se deslizan desde donde estaban (FLIP: medir antes y después).
    function layout(flip) {
      const first = new Map();
      if (flip && !reduced()) for (const [w, el] of tiles) if (el.parentNode === grid) first.set(w, el.getBoundingClientRect());
      const list = left();
      grid.replaceChildren(...list.map((w) => tiles.get(w)));
      for (const [w, el] of tiles) if (!list.includes(w)) el.classList.remove('hit', 'sel', 'shake');
      roving();
      if (!first.size) return;
      const moved = [];
      for (const w of list) {
        const a = first.get(w);
        if (!a) continue;
        const b = tiles.get(w).getBoundingClientRect();
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (Math.abs(dx) + Math.abs(dy) < 1) continue;
        const el = tiles.get(w);
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px,${dy}px)`;
        moved.push(el);
      }
      if (!moved.length) return;
      void grid.offsetWidth; // fuerza el cálculo de estilos para que arranque la transición
      for (const el of moved) {
        el.style.transition = 'transform 460ms var(--dg-ease)';
        el.style.transform = '';
      }
      setTimeout(() => moved.forEach((el) => (el.style.transition = '')), 520);
    }

    // ---------------------------------------------------------------- acciones
    function toggle(w) {
      if (busy || st.over) return;
      const i = sel.indexOf(w);
      if (i >= 0) sel.splice(i, 1);
      else if (sel.length < 4) sel.push(w);
      else return;
      paintSel();
    }
    function clearSel() {
      if (busy || st.over) return;
      sel.length = 0;
      paintSel();
    }
    function shuffleTiles() {
      if (busy || st.over) return;
      order = L.reshuffle(pz, order, gone(), Math.random);
      layout(true);
      save();
    }
    const save = () => shell.save({ picks, order }, st.over);

    function result() {
      const themes = [...pz.grupos].sort((a, b) => a.nivel - b.nivel).map((g) => g.tema);
      const share = L.shareText({ pz, picks, mistakes: st.mistakes, dayNo, name: t.name, lang, link: D.shareLink('vinculos') });
      return st.won
        ? { won: true, score: st.mistakes + 1, title: t.win[Math.min(st.mistakes, 3)], sub: null, answers: themes, shareText: share }
        : { won: false, score: undefined, title: t.lose, sub: t.was, answers: themes, shareText: share };
    }

    async function submit() {
      if (busy || st.over || sel.length !== 4) return;
      const words = [...sel];
      if (st.tried.has(L.comboKey(words))) return shell.toast(t.dup);
      busy = true;
      const r = L.checkSelection(pz, words);
      picks.push(words);
      st = L.derive(pz, picks);
      paintSel();
      if (r.ok) {
        words.forEach((w) => tiles.get(w).classList.add('hit'));
        await wait(440);
        if (!alive()) return;
        sel.length = 0;
        shown.push(r.group);
        addBand(r.group, { animate: true });
        layout(true);
        paintSel();
        save();
        if (st.won) {
          ended = true;
          paintSel();
          return shell.finish({ ...result(), delay: 1100 });
        }
      } else {
        words.forEach((w) => tiles.get(w).classList.add('shake'));
        paintLives(true);
        if (r.oneAway) shell.toast(t.oneAway);
        save();
        await wait(520);
        if (!alive()) return;
        words.forEach((w) => tiles.get(w).classList.remove('shake'));
        if (st.lost) return lose();
      }
      busy = false;
      paintSel();
      grid.querySelector('.vn-tile[tabindex="0"]')?.focus({ preventScroll: true });
    }

    // Sin vidas: se revelan los grupos que faltan, de a uno, del más fácil al más difícil.
    async function lose() {
      sel.length = 0;
      paintSel();
      const rest = L.missing(pz, st.found);
      shell.finish({ ...result(), delay: 900 + rest.length * 850 });
      await wait(600);
      for (const g of rest) {
        if (!alive()) return;
        shown.push(g);
        addBand(g, { animate: true, missed: true });
        layout(true);
        await wait(850);
      }
      ended = true;
      paintSel();
    }

    // ---------------------------------------------------------------- teclado: flechas para moverse por la grilla
    grid.addEventListener('keydown', (e) => {
      const tile = e.target.closest?.('.vn-tile');
      if (!tile) return;
      const list = left();
      const i = list.indexOf([...tiles].find(([, el]) => el === tile)?.[0]);
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
      let j = i;
      if (step) j = i + step;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = list.length - 1;
      else return;
      e.preventDefault();
      if (j >= 0 && j < list.length) tiles.get(list[j]).focus();
    });

    // ---------------------------------------------------------------- arranque
    if (st.over) {
      // día ya terminado: se ven todas las bandas, primero las que encontraste y después las reveladas
      for (const g of st.found) addBand(g);
      if (st.lost) for (const g of L.missing(pz, st.found)) (shown.push(g), addBand(g, { missed: true }));
    } else for (const g of shown) addBand(g);
    layout(false);
    paintLives();
    paintSel();
    if (st.over) {
      ended = true;
      paintSel();
      shell.restoreResult(result());
    }
  },
});
