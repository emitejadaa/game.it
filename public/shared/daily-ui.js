/**
 * Interfaz compartida de los juegos diarios: ventanas, avisos, estadísticas, pantalla de resultado con
 * cuenta regresiva y botón de compartir, y el modo de alto contraste. Los estilos están en daily.css.
 */
import { lang, loadStats, liveStreak, countdown, share, today } from '/shared/daily.js';

const UI = {
  es: {
    stats: 'Estadísticas',
    help: 'Cómo se juega',
    played: 'Jugadas',
    wins: '% victorias',
    streak: 'Racha',
    best: 'Mejor',
    share: 'Compartir',
    copied: '¡Copiado! Pegalo donde quieras',
    sharedOk: '¡Compartido!',
    copyFail: 'No se pudo copiar',
    next: 'Próximo desafío',
    close: 'Cerrar',
    contrast: 'Alto contraste (daltonismo)',
    practice: 'Practicar',
    practiceMode: 'Práctica',
    newDay: '¡Hay un desafío nuevo!',
    update: 'Actualizar',
    loading: 'Cargando…',
    error: 'No se pudo cargar. Revisá tu conexión.',
    retry: 'Reintentar',
    backToDaily: 'Volver al desafío de hoy',
    dailyHint: 'Un desafío nuevo todos los días a las 00:00 (hora de Argentina).',
  },
  en: {
    stats: 'Statistics',
    help: 'How to play',
    played: 'Played',
    wins: 'Win %',
    streak: 'Streak',
    best: 'Best',
    share: 'Share',
    copied: 'Copied! Paste it anywhere',
    sharedOk: 'Shared!',
    copyFail: "Couldn't copy",
    next: 'Next puzzle',
    close: 'Close',
    contrast: 'High contrast (colour blindness)',
    practice: 'Practice',
    practiceMode: 'Practice',
    newDay: 'A new puzzle is ready!',
    update: 'Refresh',
    loading: 'Loading…',
    error: "Couldn't load. Check your connection.",
    retry: 'Retry',
    backToDaily: "Back to today's puzzle",
    dailyHint: 'A new puzzle every day at 00:00 (Argentina time).',
  },
};
export const ui = (k, vars) => {
  let s = UI[lang()][k] ?? UI.es[k] ?? k;
  if (vars) for (const v in vars) s = s.replace(`{${v}}`, vars[v]);
  return s;
};

// ---------------------------------------------------------------- DOM mínimo
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

const NS = 'http://www.w3.org/2000/svg';
export function svg(d) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}
export const ICONS = {
  help: 'M9.2 9.2a2.9 2.9 0 1 1 4.2 2.6c-.9.5-1.4 1.1-1.4 2M12 17.5h.01',
  stats: 'M5 20V11M12 20V4M19 20v-6',
  close: 'M6 6l12 12M18 6L6 18',
  del: 'M21 5H9l-6 7 6 7h12zM16.5 9.5l-5 5M11.5 9.5l5 5',
  enter: 'M20 6v6a3 3 0 0 1-3 3H5m0 0l4-4m-4 4l4 4',
};

const reduced = () => document.documentElement.dataset.giMotion === 'reduced';
export const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 30) : ms));

// ---------------------------------------------------------------- avisos
let toasts = null;
export function toast(msg, ms = 1900) {
  toasts ||= document.body.appendChild(h('div', { class: 'dg-toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: 'dg-toast' }, msg);
  toasts.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

// ---------------------------------------------------------------- ventanas
let current = null;
export const isModalOpen = () => !!current;

/** Abre una ventana (una sola a la vez). Se cierra con la X, tocando afuera o con Esc. */
export function modal({ title, body, onClose }) {
  current?.close(true);
  const prevFocus = document.activeElement;
  let closed = false;
  const x = h('button', { class: 'dg-ibtn dg-x', type: 'button', 'aria-label': ui('close'), onclick: () => api.close() }, svg(ICONS.close));
  const sheet = h('div', { class: 'dg-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '', tabindex: '-1' }, x, title ? h('h2', null, title) : null, body);
  const root = h('div', { class: 'dg-modal' }, sheet);
  root.addEventListener('pointerdown', (e) => e.target === root && api.close());
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      api.close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.body.append(root);
  sheet.focus({ preventScroll: true });
  const api = {
    el: root,
    close(instant) {
      if (closed) return;
      closed = true;
      if (current === api) current = null;
      document.removeEventListener('keydown', onKey, true);
      const done = () => {
        root.remove();
        prevFocus?.focus?.({ preventScroll: true });
        onClose?.();
      };
      if (instant || reduced()) done();
      else {
        root.classList.add('out');
        setTimeout(done, 180);
      }
    },
  };
  current = api;
  return api;
}

// ---------------------------------------------------------------- alto contraste
const HC_KEY = 'gameit:daily:hc';
export function applyContrast() {
  let on = false;
  try {
    on = localStorage.getItem(HC_KEY) === '1';
  } catch {}
  document.documentElement.dataset.hc = on ? '1' : '0';
  return on;
}
export function contrastRow() {
  let on = applyContrast();
  const t = h('button', { class: 'dg-toggle', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': ui('contrast') });
  t.onclick = () => {
    on = !on;
    try {
      localStorage.setItem(HC_KEY, on ? '1' : '0');
    } catch {}
    t.setAttribute('aria-checked', String(on));
    document.documentElement.dataset.hc = on ? '1' : '0';
  };
  return h('div', { class: 'dg-switch' }, h('span', null, ui('contrast')), t);
}

// ---------------------------------------------------------------- estadísticas
/**
 * Números (jugadas, % de victorias, racha, mejor racha) y el histograma de `rows` barras.
 * `labels` cambia el rótulo de cada barra (por defecto 1…rows); `mine` resalta la del resultado de hoy.
 */
export function statsBody({ id, rows, labels, mine }) {
  const s = loadStats(id, lang());
  const max = Math.max(1, ...Array.from({ length: rows }, (_, i) => s.dist[i + 1] || 0));
  const num = (v, k) => h('div', null, h('b', null, v), h('small', null, ui(k)));
  return h(
    'div',
    null,
    h('div', { class: 'dg-nums' }, num(s.played, 'played'), num(s.played ? Math.round((s.won / s.played) * 100) : 0, 'wins'), num(liveStreak(s, today()), 'streak'), num(s.best, 'best')),
    rows
      ? h(
          'div',
          { class: 'dg-hist' },
          Array.from({ length: rows }, (_, i) => {
            const n = s.dist[i + 1] || 0;
            return h('div', { class: 'dg-hrow' }, h('span', null, labels ? labels[i] : i + 1), h('div', { class: `dg-hbar${mine === i + 1 ? ' me' : ''}`, style: `width:${Math.max(8, (n / max) * 100)}%` }, n));
          }),
        )
      : null,
  );
}

/**
 * Pantalla de resultado: titular, respuesta(s), estadísticas, cuenta regresiva al próximo desafío y botón de compartir.
 * En modo práctica (`practice`) no hay estadísticas ni compartir: solo "Practicar" y "Volver al desafío de hoy".
 */
export function resultBody({ id, ok, title, sub, answers, shareText, practice, rows, labels, mine, onPractice, onDaily }) {
  const stop = [];
  const parts = [h('div', { class: 'dg-result' }, h('div', { class: `dg-big${ok ? ' ok' : ''}` }, title), sub ? h('p', { class: 'dg-mute' }, sub) : null, answers?.length ? h('div', { class: 'dg-answer' }, answers.map((a) => h('span', null, a))) : null)];
  const actions = h('div', { class: 'dg-actions' });
  if (!practice) {
    const clock = h('b', null, '--:--:--');
    stop.push(countdown(clock));
    parts.push(statsBody({ id, rows, labels, mine }), h('div', { class: 'dg-next' }, h('span', null, ui('next')), clock));
    if (shareText) {
      const btn = h('button', { class: 'dg-btn', type: 'button' }, ui('share'));
      btn.onclick = async () => {
        const r = await share(shareText);
        toast(r === 'copied' ? ui('copied') : r === 'shared' ? ui('sharedOk') : ui('copyFail'));
      };
      actions.append(btn);
    }
  }
  if (onPractice) actions.append(h('button', { class: `dg-btn${practice ? '' : ' ghost'}`, type: 'button', onclick: onPractice }, ui('practice')));
  if (practice && onDaily) actions.append(h('button', { class: 'dg-btn ghost', type: 'button', onclick: onDaily }, ui('backToDaily')));
  parts.push(actions);
  const body = h('div', null, parts);
  body.stop = () => stop.forEach((f) => f());
  return body;
}

/** Botón de icono de la cabecera. */
export function iconButton(icon, label, onclick) {
  return h('button', { class: 'dg-ibtn', type: 'button', 'aria-label': label, title: label, onclick }, svg(icon));
}
