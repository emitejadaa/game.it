/**
 * Caparazón común de los juegos diarios que no son de grilla (Banderín, Silueta, Rumbo, Vínculos, Colmena, Tibio):
 * cabecera con ayuda y estadísticas, ventana de resultado (con racha, cuenta regresiva y compartir), modo práctica,
 * cambio de idioma, cambio de día a medianoche y guardado. El juego solo arma su pantalla.
 *
 *   createDailyApp({
 *     id, epoch,
 *     rows, labels?          barras del histograma (intentos, errores…) y sus rótulos
 *     t: { es: { name, help(): Node }, en: { … } },
 *     load(lang) → ctx       datos del idioma (puede ser asíncrono)
 *     build(shell, env)      arma la pantalla dentro de shell.main. env = { ctx, lang, mode, date, dayNo, rnd, saved }
 *                            (`saved` es lo último que el juego guardó hoy; `rnd` es el generador del día o al azar en práctica)
 *   })
 *
 * shell: { main, lang, mode, save(state), finish({ won, score, title, sub, answers, shareText }), restoreResult(res), showResult() }
 */
import * as D from '/shared/daily.js';
import { h, ICONS, toast, modal, ui, statsBody, resultBody, contrastRow, applyContrast, iconButton } from '/shared/daily-ui.js';

export function createDailyApp(cfg) {
  const G = window.GameIt;
  const S = { lang: 'es', ctx: null, mode: 'daily', date: D.today(), dayNo: 1, over: false, result: null, token: 0 };
  let dialog = null;
  const T = () => cfg.t[S.lang] || cfg.t.es;

  const title = h('div', { class: 'dg-title' });
  const tools = h('div', { class: 'dg-tools' });
  const main = h('main', { class: 'dg-main dg-free' });
  const app = h('div', { class: 'dg-app' }, h('header', { class: 'dg-head' }, title, tools), main);
  document.body.append(app);
  applyContrast();

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

  function showResult() {
    const r = S.result;
    if (!r) return;
    const practice = S.mode === 'practice';
    const body = resultBody({
      id: cfg.id,
      ok: r.won,
      title: r.title,
      sub: r.sub,
      answers: r.answers,
      shareText: practice ? null : r.shareText,
      practice,
      rows: cfg.rows,
      labels: cfg.labels,
      mine: r.won && r.score !== undefined ? r.score : undefined,
      onPractice: () => {
        dialog?.close(true);
        start('practice', S.lang);
      },
      onDaily: () => {
        dialog?.close(true);
        start('daily', S.lang);
      },
    });
    openDialog({ title: practice ? ui('practiceMode') : `${T().name} #${S.dayNo}`, body });
  }

  function showHelp() {
    openDialog({ title: ui('help'), body: h('div', null, T().help(), h('p', { class: 'dg-mute' }, ui('dailyHint')), contrastRow()) });
  }
  function showStats() {
    if (S.over) return showResult();
    openDialog({ title: ui('stats'), body: statsBody({ id: cfg.id, rows: cfg.rows, labels: cfg.labels }) });
  }

  const shell = {
    main,
    get lang() {
      return S.lang;
    },
    get mode() {
      return S.mode;
    },
    get date() {
      return S.date;
    },
    get dayNo() {
      return S.dayNo;
    },
    get over() {
      return S.over;
    },
    /** Guarda el estado del día (solo en el desafío diario). */
    save(state, done = false) {
      if (S.mode !== 'daily') return;
      D.saveDay(cfg.id, S.lang, state, S.date);
      D.markPortal(cfg.id, { date: S.date, done, won: !!S.result?.won, streak: D.liveStreak(D.loadStats(cfg.id, S.lang), S.date) });
    },
    /** Terminó la partida: registra las estadísticas (una vez por día) y muestra el resultado. */
    finish(res) {
      S.over = true;
      S.result = res;
      G.gameplay(false);
      if (S.mode === 'daily') {
        const stats = D.record(cfg.id, S.lang, { date: S.date, won: res.won, score: res.won ? res.score : undefined });
        D.markPortal(cfg.id, { date: S.date, done: true, won: res.won, streak: D.liveStreak(stats, S.date) });
      }
      setTimeout(showResult, res.delay ?? 700);
    },
    /** Día ya terminado (al volver a abrir el juego): se muestra el resultado sin volver a registrar. */
    restoreResult(res) {
      S.over = true;
      S.result = res;
      G.gameplay(false);
      setTimeout(() => !dialog && showResult(), 450);
    },
    showResult,
    toast,
    openDialog,
  };

  async function start(mode, lang) {
    const token = ++S.token;
    S.lang = lang;
    S.mode = mode;
    S.date = D.today();
    S.dayNo = D.dayNumber(cfg.epoch, S.date);
    S.over = false;
    S.result = null;
    dialog?.close(true);
    title.replaceChildren(...[h('span', null, T().name), h('small', null, `#${S.dayNo}`), mode === 'practice' ? h('span', { class: 'dg-mode' }, ui('practiceMode')) : null].filter(Boolean));
    document.title = `${T().name} · game.it`;
    tools.replaceChildren(iconButton(ICONS.help, ui('help'), showHelp), iconButton(ICONS.stats, ui('stats'), showStats));
    main.replaceChildren(h('p', { class: 'dg-mute' }, ui('loading')));
    try {
      S.ctx = await cfg.load(lang);
    } catch (e) {
      if (token !== S.token) return;
      main.replaceChildren(h('div', { class: 'dg-actions' }, h('p', { class: 'dg-mute' }, ui('error')), h('button', { class: 'dg-btn', type: 'button', onclick: () => start(mode, lang) }, ui('retry'))));
      G.ready();
      return;
    }
    if (token !== S.token) return;
    main.replaceChildren();
    const rnd = mode === 'daily' ? D.rng(`${cfg.id}:${lang}:${S.date}`) : Math.random;
    const saved = mode === 'daily' ? D.loadDay(cfg.id, lang, S.date) : null;
    G.gameplay(true);
    cfg.build(shell, { ctx: S.ctx, lang, mode, date: S.date, dayNo: S.dayNo, rnd, saved });
    G.ready();
  }

  G.onPrefs((p) => {
    const lang = p.lang === 'en' ? 'en' : 'es';
    if (lang !== S.lang || !S.ctx) start('daily', lang);
  }, true);
  D.onNewDay(() => {
    if (S.mode !== 'daily') return;
    toast(ui('newDay'), 3000);
    start('daily', S.lang);
  });
  return shell;
}
