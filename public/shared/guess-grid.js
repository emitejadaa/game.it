/**
 * Motor de los juegos de adivinar en grilla, con un desafío por día: Quinteto, Cuarteto, Dígitos, Ecuación y Cálculo.
 * Cada juego aporta sus reglas con `createGuessGame(cfg)`; el motor se ocupa de la pantalla (casillas que giran,
 * teclado en pantalla y físico), de guardar el día, las estadísticas, la racha, el resultado y compartir.
 *
 * cfg:
 *   id, epoch            id del juego (igual que la carpeta) y día del lanzamiento "AAAA-MM-DD" (desafío n.º 1)
 *   cols, rows           largo de cada intento y cantidad de intentos
 *   boards               tableros a la vez (1; Cuarteto usa 4)
 *   keyRows              filas del teclado en pantalla (o función de idioma que las devuelve): tokens de una letra, 'ENTER' y 'DEL'
 *   label(token)         cómo se dibuja un token (por defecto, en mayúsculas)
 *   fromEvent(e)         token que corresponde a una tecla física (o null)
 *   load(lang)           carga los datos del idioma (listas de palabras, etc.) → ctx
 *   secrets(ctx, lang, { mode, dayNo, date, rnd })   → un arreglo de tokens por tablero
 *   validate(tokens, ctx, lang)   → null si vale, o la clave del mensaje de error (en t[lang].msg)
 *   score(guess, secret, ctx)     → estados por casilla: 'g' (acierto), 'y' (está en otro lugar), 'x' (no está)
 *   isWin(guess, secret, states)  (por defecto, todas 'g')
 *   extra(guess, secret, ctx)     → texto de ayuda al costado de la fila (Dígitos: ▲ ▼)
 *   answerText(secret, ctx, lang) → cómo mostrar la respuesta (con tilde, con "=")
 *   banner(ctx, lang)    → texto fijo arriba de los tableros (Cálculo: el resultado que hay que lograr)
 *   t.es / t.en          { name, msg: {...}, win: {n: titular}, lose, help(): Node, tokenName }
 */
import * as D from '/shared/daily.js';
import { h, svg, ICONS, toast, modal, ui, statsBody, resultBody, contrastRow, applyContrast, iconButton, wait } from '/shared/daily-ui.js';

const STATE_WORD = { es: { g: 'correcta', y: 'en otro lugar', x: 'no está' }, en: { g: 'correct', y: 'elsewhere', x: 'not in the answer' } };
const GLYPH = { g: '🟩', y: '🟨', x: '⬛' };
const GLYPH_HC = { g: '🟧', y: '🟦', x: '⬛' };
const KEYCAP = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const RANK = { g: 3, y: 2, x: 1 };

/** Puntúa un intento: primero los aciertos exactos y después los que están en otro lugar, según lo que sobra (letras repetidas). */
export function scoreGuess(guess, secret) {
  const n = guess.length;
  const out = Array(n).fill('x');
  const left = {};
  for (let i = 0; i < n; i++) {
    if (guess[i] === secret[i]) out[i] = 'g';
    else left[secret[i]] = (left[secret[i]] || 0) + 1;
  }
  for (let i = 0; i < n; i++) {
    if (out[i] === 'g') continue;
    if (left[guess[i]] > 0) {
      out[i] = 'y';
      left[guess[i]]--;
    }
  }
  return out;
}

export function createGuessGame(cfg) {
  const G = window.GameIt;
  const MB = cfg.boards || 1;
  const label = cfg.label || ((t) => String(t).toUpperCase());
  const S = { lang: null, ctx: null, mode: 'daily', date: D.today(), dayNo: 1, secrets: [], guesses: [], scores: [], solved: [], current: [], over: false, won: false, locked: false, token: 0 };
  let tiles = [];
  let rowEls = [];
  let boardEls = [];
  let dialog = null;
  const T = () => cfg.t[S.lang] || cfg.t.es;

  // ---------------------------------------------------------------- estructura
  const title = h('div', { class: 'dg-title' });
  const tools = h('div', { class: 'dg-tools' });
  const boardsEl = h('div', { class: 'dg-boards' });
  const banner = h('div', { class: 'dg-banner' });
  const main = h('main', { class: 'dg-main' }, boardsEl);
  const kb = h('div', { class: 'dg-kb', role: 'group' });
  const live = h('div', { class: 'dg-sr', 'aria-live': 'polite' });
  const app = h('div', { class: 'dg-app' }, h('header', { class: 'dg-head' }, title, tools), banner, main, kb, live);
  document.body.append(app);
  applyContrast();

  // ---------------------------------------------------------------- tamaños
  function fit() {
    const r = main.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const bc = MB > 1 ? 2 : 1;
    const br = Math.ceil(MB / bc);
    const gap = 5;
    const bgap = gap * 3;
    const extra = cfg.extra ? 0.62 : 0;
    const bw = (r.width - 6 - (bc - 1) * bgap) / bc;
    const bh = (r.height - 6 - (br - 1) * bgap) / br;
    const maxTile = MB > 1 ? 40 : 64;
    let tw = (bw - (cfg.cols - 1 + (cfg.extra ? 1 : 0)) * gap) / (cfg.cols + extra);
    let th = (bh - (cfg.rows - 1) * gap) / cfg.rows;
    tw = Math.max(14, Math.floor(Math.min(tw, maxTile * 1.15)));
    th = Math.max(14, Math.floor(Math.min(th, maxTile)));
    if (MB === 1) tw = th = Math.min(tw, th);
    else th = Math.min(th, Math.round(tw * 1.3));
    boardsEl.style.setProperty('--tw', `${tw}px`);
    boardsEl.style.setProperty('--th', `${th}px`);
    boardsEl.style.setProperty('--gap', `${gap}px`);
  }
  new ResizeObserver(fit).observe(main);
  addEventListener('resize', fit);

  // ---------------------------------------------------------------- tableros
  function buildBoards() {
    boardsEl.replaceChildren();
    boardsEl.style.setProperty('--bc', MB > 1 ? 2 : 1);
    boardsEl.style.setProperty('--cols', cfg.cols);
    tiles = [];
    rowEls = [];
    boardEls = [];
    for (let b = 0; b < MB; b++) {
      const board = h('div', { class: 'dg-board', role: 'grid', 'aria-label': MB > 1 ? `${b + 1}/${MB}` : T().name });
      tiles.push([]);
      rowEls.push([]);
      for (let r = 0; r < cfg.rows; r++) {
        const row = h('div', { class: `dg-row${cfg.extra ? ' has-extra' : ''}`, role: 'row', style: `--cols:${cfg.cols}` });
        tiles[b].push([]);
        for (let c = 0; c < cfg.cols; c++) {
          const t = h('div', { class: 'dg-tile', role: 'gridcell' });
          tiles[b][r].push(t);
          row.append(t);
        }
        if (cfg.extra) row.append(h('span', { class: 'dg-extra', 'aria-hidden': 'true' }));
        rowEls[b].push(row);
        board.append(row);
      }
      boardEls.push(board);
      boardsEl.append(board);
    }
    fit();
  }

  const stateLabel = (s) => STATE_WORD[S.lang][s];
  function paintRow(b, r, reveal) {
    const g = [...S.guesses[r]];
    const st = S.scores[b][r];
    g.forEach((tok, c) => {
      const t = tiles[b][r][c];
      t.textContent = label(tok);
      t.className = `dg-tile${reveal ? ' rev' : ''}`;
      t.dataset.s = st[c];
      t.style.setProperty('--i', c);
      t.setAttribute('aria-label', `${label(tok)}: ${stateLabel(st[c])}`);
    });
    if (cfg.extra) rowEls[b][r].lastChild.textContent = cfg.extra(g, S.secrets[b], S.ctx, S.lang) || '';
  }
  const active = (b) => !S.over && S.solved[b] < 0;
  function paintTyped() {
    const r = S.guesses.length;
    if (r >= cfg.rows) return;
    for (let b = 0; b < MB; b++) {
      if (!active(b)) continue;
      for (let c = 0; c < cfg.cols; c++) {
        const t = tiles[b][r][c];
        const tok = S.current[c];
        t.textContent = tok === undefined ? '' : label(tok);
        t.classList.toggle('f', tok !== undefined); // al agregarse, la casilla hace un "pop"
      }
    }
  }

  // ---------------------------------------------------------------- teclado
  function buildKeyboard() {
    kb.replaceChildren();
    for (const row of typeof cfg.keyRows === 'function' ? cfg.keyRows(S.lang) : cfg.keyRows) {
      const r = h('div', { class: 'dg-krow' });
      for (const k of row) {
        const special = k === 'ENTER' || k === 'DEL';
        const key = h('button', { class: `dg-key${special ? ' wide' : ''}${MB > 1 && !special ? ' quad' : ''}`, type: 'button', dataset: { k }, 'aria-label': k === 'ENTER' ? 'Enter' : k === 'DEL' ? (S.lang === 'es' ? 'Borrar' : 'Delete') : label(k), onclick: () => press(k) });
        key.append(k === 'ENTER' ? svg(ICONS.enter) : k === 'DEL' ? svg(ICONS.del) : label(k));
        r.append(key);
      }
      kb.append(r);
    }
    paintKeys();
  }
  function paintKeys() {
    const best = (b, tok) => {
      let top = null;
      for (let r = 0; r < S.guesses.length; r++) {
        if (!S.scores[b][r]) continue;
        const g = [...S.guesses[r]];
        for (let c = 0; c < g.length; c++) if (g[c] === tok && (!top || RANK[S.scores[b][r][c]] > RANK[top])) top = S.scores[b][r][c];
      }
      return top;
    };
    const colors = { g: 'var(--dg-ok)', y: 'var(--dg-near)', x: 'var(--dg-off)' };
    for (const key of kb.querySelectorAll('.dg-key')) {
      const k = key.dataset.k;
      if (k === 'ENTER' || k === 'DEL') continue;
      if (MB === 1) {
        const s = best(0, k);
        if (s) key.dataset.s = s;
        else delete key.dataset.s;
      } else {
        for (let b = 0; b < MB; b++) {
          const s = best(b, k);
          key.style.setProperty(`--k${b + 1}`, s ? colors[s] : 'transparent');
        }
      }
    }
  }

  // ---------------------------------------------------------------- entrada
  function press(k) {
    if (k === 'ENTER') return submit();
    if (k === 'DEL') return del();
    add(k);
  }
  function add(tok) {
    if (S.over || S.locked || S.current.length >= cfg.cols) return;
    S.current.push(tok);
    paintTyped();
  }
  function del() {
    if (S.over || S.locked || !S.current.length) return;
    S.current.pop();
    paintTyped();
  }
  function shake() {
    const r = S.guesses.length;
    for (let b = 0; b < MB; b++) {
      if (!active(b)) continue;
      const el = rowEls[b][r];
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }
  addEventListener('keydown', (e) => {
    if (dialog || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      return submit();
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      return del();
    }
    const tok = cfg.fromEvent?.(e);
    if (tok) {
      e.preventDefault();
      add(tok);
    }
  });

  // ---------------------------------------------------------------- jugar
  async function submit() {
    if (S.over || S.locked || !S.ctx) return;
    if (S.current.length < cfg.cols) {
      shake();
      return toast(T().msg.short);
    }
    const bad = cfg.validate([...S.current], S.ctx, S.lang);
    if (bad) {
      shake();
      const m = T().msg[bad];
      return toast(typeof m === 'function' ? m(S.ctx) : m || bad);
    }
    S.locked = true;
    const r = S.guesses.length;
    const g = S.current.join('');
    S.guesses.push(g);
    S.current = [];
    const tokens = [...g];
    for (let b = 0; b < MB; b++) {
      if (S.solved[b] >= 0) continue;
      const st = cfg.score(tokens, S.secrets[b], S.ctx);
      S.scores[b][r] = st;
      if ((cfg.isWin || ((_g, _s, s) => s.every((x) => x === 'g')))(tokens, S.secrets[b], st)) S.solved[b] = r;
      paintRow(b, r, true);
    }
    const first = S.scores.find((sc) => sc[r]);
    live.textContent = `${r + 1}: ${tokens.map((tok, i) => `${label(tok)} ${stateLabel(first[r][i])}`).join(', ')}`;
    await wait(cfg.cols * 260 + 420);
    paintKeys();
    for (let b = 0; b < MB; b++) if (S.solved[b] === r) rowEls[b][r].classList.add('win');
    S.locked = false;
    const allSolved = S.solved.every((x) => x >= 0);
    if (allSolved || S.guesses.length >= cfg.rows) {
      S.over = true;
      S.won = allSolved;
      await wait(allSolved ? 900 : 350);
      finish();
    } else {
      save();
      paintTyped();
    }
  }

  function save() {
    if (S.mode !== 'daily') return;
    D.saveDay(cfg.id, S.lang, { guesses: S.guesses, over: S.over, won: S.won }, S.date);
    D.markPortal(cfg.id, { date: S.date, done: S.over, won: S.won, streak: D.liveStreak(D.loadStats(cfg.id, S.lang), S.date) });
  }

  function finish() {
    G.gameplay(false);
    if (S.mode === 'daily') {
      D.record(cfg.id, S.lang, { date: S.date, won: S.won, score: S.won ? S.guesses.length : undefined });
      save();
    }
    showResult();
  }

  // ---------------------------------------------------------------- compartir y resultado
  function shareText() {
    const hc = document.documentElement.dataset.hc === '1';
    const gl = hc ? GLYPH_HC : GLYPH;
    const head = `game.it · ${T().name} #${S.dayNo} ${S.won ? S.guesses.length : 'X'}/${cfg.rows}`;
    let body;
    if (MB === 1) body = S.guesses.map((_, r) => S.scores[0][r].map((s) => gl[s]).join('')).join('\n');
    else {
      const cells = S.solved.map((x) => (x >= 0 ? [...String(x + 1)].map((d) => KEYCAP[+d]).join('') : '🟥'));
      body = Array.from({ length: Math.ceil(MB / 2) }, (_, i) => cells.slice(i * 2, i * 2 + 2).join(' ')).join('\n');
    }
    return `${head}\n\n${body}\n${D.shareLink(cfg.id)}`;
  }

  function showResult() {
    const t = T();
    const practice = S.mode === 'practice';
    const solvedN = S.solved.filter((x) => x >= 0).length;
    const answers = S.secrets.map((s) => cfg.answerText?.(s, S.ctx, S.lang) ?? s.map(label).join(''));
    let ttl;
    let sub;
    if (S.won) {
      ttl = t.win[S.guesses.length] || t.win.default;
      sub = S.lang === 'es' ? `Lo resolviste en ${S.guesses.length} ${S.guesses.length === 1 ? 'intento' : 'intentos'}` : `Solved in ${S.guesses.length} ${S.guesses.length === 1 ? 'guess' : 'guesses'}`;
      if (MB > 1) sub = S.lang === 'es' ? `Resolviste los ${MB} en ${S.guesses.length} intentos` : `All ${MB} solved in ${S.guesses.length} guesses`;
    } else {
      ttl = t.lose;
      sub = MB > 1 ? (S.lang === 'es' ? `Resolviste ${solvedN} de ${MB}. Las respuestas:` : `You solved ${solvedN} of ${MB}. The answers:`) : S.lang === 'es' ? 'La respuesta era:' : 'The answer was:';
    }
    const body = resultBody({
      id: cfg.id,
      ok: S.won,
      title: ttl,
      sub,
      answers: S.won && MB === 1 ? null : answers,
      shareText: practice ? null : shareText(),
      practice,
      rows: cfg.rows,
      mine: S.won ? S.guesses.length : undefined,
      onPractice: () => {
        dialog?.close(true);
        startPractice();
      },
      onDaily: () => {
        dialog?.close(true);
        start('daily', S.lang);
      },
    });
    openDialog({ title: practice ? ui('practiceMode') : `${t.name} #${S.dayNo}`, body });
  }

  function openDialog({ title: ttl, body }) {
    dialog = modal({
      title: ttl,
      body,
      onClose: () => {
        body.stop?.();
        dialog = null;
      },
    });
  }

  // ---------------------------------------------------------------- ayuda y estadísticas
  function showHelp() {
    openDialog({ title: ui('help'), body: h('div', null, T().help(), h('p', { class: 'dg-mute' }, ui('dailyHint')), contrastRow()) });
  }
  function showStats() {
    if (S.over) return showResult(); // terminado: el resultado ya incluye las estadísticas, el compartir y la cuenta regresiva
    openDialog({ title: ui('stats'), body: statsBody({ id: cfg.id, rows: cfg.rows }) });
  }

  // ---------------------------------------------------------------- inicio
  function header() {
    title.replaceChildren(...[h('span', null, T().name), h('small', null, `#${S.dayNo}`), S.mode === 'practice' ? h('span', { class: 'dg-mode' }, ui('practiceMode')) : null].filter(Boolean));
    document.title = `${T().name} · game.it`;
    tools.replaceChildren(iconButton(ICONS.help, ui('help'), showHelp), iconButton(ICONS.stats, ui('stats'), showStats));
  }

  function reset(mode) {
    S.mode = mode;
    S.date = D.today();
    S.dayNo = D.dayNumber(cfg.epoch, S.date);
    S.guesses = [];
    S.scores = Array.from({ length: MB }, () => []);
    S.solved = Array(MB).fill(-1);
    S.current = [];
    S.over = false;
    S.won = false;
    S.locked = false;
  }

  function buildSecrets() {
    const rnd = S.mode === 'daily' ? D.rng(`${cfg.id}:${S.lang}:${S.date}`) : Math.random;
    S.secrets = cfg.secrets(S.ctx, S.lang, { mode: S.mode, dayNo: S.dayNo, date: S.date, rnd });
  }

  function restore() {
    const saved = S.mode === 'daily' ? D.loadDay(cfg.id, S.lang, S.date) : null;
    if (!saved?.guesses?.length) return;
    const isWin = cfg.isWin || ((_g, _s, s) => s.every((x) => x === 'g'));
    for (const g of saved.guesses) {
      const r = S.guesses.length;
      S.guesses.push(g);
      for (let b = 0; b < MB; b++) {
        if (S.solved[b] >= 0) continue;
        const st = cfg.score([...g], S.secrets[b], S.ctx);
        S.scores[b][r] = st;
        if (isWin([...g], S.secrets[b], st)) S.solved[b] = r;
      }
    }
    S.over = !!saved.over;
    S.won = !!saved.won;
  }

  function paintAll() {
    for (let b = 0; b < MB; b++) for (let r = 0; r < S.guesses.length; r++) if (S.scores[b][r]) paintRow(b, r, false);
    paintKeys();
    paintTyped();
  }

  async function start(mode, lang) {
    const token = ++S.token;
    S.lang = lang;
    reset(mode);
    header();
    boardsEl.replaceChildren(h('p', { class: 'dg-mute' }, ui('loading')));
    try {
      S.ctx = await cfg.load(lang);
    } catch (e) {
      if (token !== S.token) return;
      boardsEl.replaceChildren(h('div', { class: 'dg-actions' }, h('p', { class: 'dg-mute' }, ui('error')), h('button', { class: 'dg-btn', type: 'button', onclick: () => start(mode, lang) }, ui('retry'))));
      G.ready();
      return;
    }
    if (token !== S.token) return;
    buildSecrets();
    banner.textContent = cfg.banner?.(S.ctx, S.lang) || '';
    banner.hidden = !banner.textContent;
    restore();
    buildBoards();
    buildKeyboard();
    paintAll();
    G.gameplay(!S.over);
    G.ready();
    if (S.over) setTimeout(() => !dialog && token === S.token && showResult(), 450);
  }
  const startPractice = () => start('practice', S.lang);

  // ---------------------------------------------------------------- portal
  G.onPrefs((p) => {
    const lang = p.lang === 'en' ? 'en' : 'es';
    if (lang !== S.lang) {
      dialog?.close(true);
      start('daily', lang);
    }
  }, true);
  D.onNewDay(() => {
    if (S.mode !== 'daily') return;
    dialog?.close(true);
    toast(ui('newDay'), 3000);
    start('daily', S.lang);
  });
}
