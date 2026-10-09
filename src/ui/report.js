/**
 * "Reportar un problema": popup propio (no el panel de preferencias) con un paso por pantalla:
 * correo → código → dónde → tipo → detalle → gracias. La lógica de pasos vive en report-flow.js (pura);
 * acá está el DOM, las transiciones (Web Animations API), el foco y las llamadas a report-api.js.
 *
 * El estado se guarda en memoria: cerrar a mitad de camino y volver a abrir retoma el mismo paso,
 * y después de "Gracias" arranca de cero.
 */
import * as api from '../core/report-api.js';
import { available } from '../core/registry.js';
import { t, pick, getLang } from '../core/i18n.js';
import * as device from '../core/device.js';
import * as F from './report-flow.js';

const EMAIL_KEY = 'gameit:report:email';
const EASE = 'cubic-bezier(.22,1,.36,1)';
const DONE_MS = 3300; // lo que tarda "Gracias" en cerrarse solo (la línea empieza a vaciarse a los 700 ms)

const readEmail = () => {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch {
    return '';
  }
};
const saveEmail = (v) => {
  try {
    localStorage.setItem(EMAIL_KEY, v);
  } catch {}
};

let state = F.create({ email: readEmail() });
let hooks = { onToggle: () => {} };
let root = null; // .report
let card = null;
let viewport = null;
let rail = null;
let backBtn = null;
let live = null;
let appEl = null;
let opened = false;
let busy = false;
let reqId = 0; // token de pedido: una respuesta que llega con el popup cerrado (o vieja) se ignora
let returnTo = null;
let ticker = 0;
let moving = null; // transición de paso en curso
let downOnBg = false;
let closingTimer = 0; // capa invisible que sigue tapando un instante tras cerrar (ver close)
let wipeTimer = 0; // vacía los pasos montados una vez cerrado el popup
const timers = new Set();
const ui = { items: [], active: 0 }; // estado visual de la lista de lugares

export const isOpen = () => opened;

// ---------- utilidades ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const reduced = () => document.documentElement.dataset.motion === 'reduced';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}
function clearTimers() {
  timers.forEach(clearTimeout);
  timers.clear();
}

const ICONS = {
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4 7.5l8 6 8-6" />',
  home: '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />',
  bug: '<path d="M9 8a3 3 0 016 0M8 9h8v6a4 4 0 01-8 0zM12 9v10M3 11h5M16 11h5M4 6l4 3M20 6l-4 3M4 19l4-3M20 19l-4-3" />',
  lag: '<path d="M7 4h10M7 20h10M8 4v3l4 5 4-5V4M8 20v-3l4-5 4 5v3" />',
  mejora: '<path d="M4 17l5-5 4 4 7-8M15 8h5v5" />',
  idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />',
  otro: '<path stroke-width="3" d="M6 12h.01M12 12h.01M18 12h.01" />',
  lens: '<circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />',
  back: '<path d="M15 5l-7 7 7 7" />',
  x: '<path d="M6 6l12 12M18 6L6 18" />',
  tick: '<path d="M5 12.5l5 5 9-10" />',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />',
  pin: '<path d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z" /><circle cx="12" cy="11" r="2" />',
  tag: '<path d="M4 12.5V5a1 1 0 011-1h7.5l7.5 7.5-8.5 8.5z" /><circle cx="8.5" cy="8.5" r="1" />',
};
const svg = (name, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${ICONS[name]}</svg>`;

const labelOf = (it) => (it.home ? t('report.where.home') : String(pick(it.game.title)));
const selId = () => state.where ?? state.preset;
const typeIcon = { bug: 'bug', lag: 'lag', mejora: 'mejora', idea: 'idea', otro: 'otro' };

// ---------- plantillas de cada paso ----------
const TPL = {
  email: () => `
    <h2 class="rq" id="report-title">${t('report.email.title')}</h2>
    <div class="rfield">${svg('mail')}<input class="rinput" type="email" name="email" inputmode="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" maxlength="254" placeholder="${esc(t('report.email.ph'))}" aria-label="${esc(t('report.email.title'))}" aria-describedby="report-msg" value="${esc(state.email)}"></div>
    <p class="rmsg" id="report-msg" data-msg></p>
    <button type="button" class="rbtn primary" data-act="send-code"><span class="rlbl">${t('report.email.send')}</span><i class="rspin"></i></button>`,

  code: () => {
    const sent = esc(t('report.code.sent', { email: '' })).replace('', `<b>${esc(state.sentTo)}</b>`);
    const cells = Array.from(
      { length: F.CODE_LEN },
      (_, i) =>
        `<input class="rcell${state.code[i] ? ' full' : ''}" type="text" inputmode="numeric" pattern="\\d*" autocomplete="${i ? 'off' : 'one-time-code'}" autocorrect="off" spellcheck="false" data-i="${i}" value="${state.code[i] || ''}" aria-label="${esc(t('report.code.digit', { n: i + 1 }))}" style="--i:${i}">`,
    ).join('');
    return `
    <h2 class="rq" id="report-title">${t('report.code.title')}</h2>
    <p class="rsent">${sent}</p>
    <div class="rcode" role="group" aria-label="${esc(t('report.code.title'))}">${cells}</div>
    <p class="rmsg" data-msg></p>
    <div class="ractions">
      <button type="button" class="text-btn" data-act="resend">${resendLabel()}</button>
      <button type="button" class="text-btn" data-act="change-email">${t('report.code.change')}</button>
    </div>`;
  },

  where: () => `
    <h2 class="rq" id="report-title">${t('report.where.title')}</h2>
    <div class="rfield small">${svg('lens')}<input class="rinput" type="search" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" role="combobox" aria-expanded="true" aria-controls="report-list" aria-autocomplete="list" placeholder="${esc(t('report.where.search'))}" aria-label="${esc(t('report.where.search'))}" value="${esc(state.query)}"></div>
    <div class="rlist" id="report-list" role="listbox" aria-label="${esc(t('report.where.title'))}"></div>
    <button type="button" class="rbtn primary" data-act="where-next"${selId() ? '' : ' disabled'}><span class="rlbl">${t('report.where.next')}</span></button>`,

  type: () => `
    <h2 class="rq" id="report-title">${t('report.type.title')}</h2>
    <div class="rtypes" role="radiogroup" aria-label="${esc(t('report.type.title'))}">${F.TYPES.map(
      (k, i) =>
        `<button type="button" class="rtype${state.type === k ? ' sel' : ''}" role="radio" aria-checked="${state.type === k}" data-act="pick-type" data-type="${k}" style="--i:${i}">${svg(typeIcon[k])}<b>${t(`report.type.${k}`)}</b><small>${t(`report.type.${k}Sub`)}</small></button>`,
    ).join('')}</div>`,

  text: () => {
    const where = F.placesList(available(), null).find((x) => x.id === state.where) || { id: F.HOME, home: true };
    const n = state.text.length;
    return `
    <h2 class="rq" id="report-title">${t('report.text.title')}</h2>
    <div class="rchips">
      <button type="button" class="rchip" data-act="goto" data-step="where">${svg(where.home ? 'home' : 'pin')}<span>${esc(labelOf(where))}</span></button>
      <button type="button" class="rchip" data-act="goto" data-step="type">${svg(typeIcon[state.type] || 'tag')}<span>${esc(t(`report.type.${state.type || 'otro'}`))}</span></button>
    </div>
    <textarea class="rtext" rows="5" maxlength="${F.MAX_TEXT}" enterkeyhint="enter" placeholder="${esc(t(`report.text.ph.${state.type || 'otro'}`))}" aria-label="${esc(t('report.text.title'))}" aria-describedby="report-count">${esc(state.text)}</textarea>
    <div class="rcount" id="report-count"><span class="rhint" data-hint>${t('report.text.short')}</span><span><span data-n>${n}</span>/${F.MAX_TEXT}</span></div>
    <div class="rmeta"><span>${t('report.text.meta')}<small class="hint">${esc(F.deviceLabel(navigator.userAgent, getLang()))}</small></span><button type="button" class="toggle" role="switch" data-act="meta" aria-checked="${state.meta}" aria-label="${esc(t('report.text.meta'))}"></button></div>
    <p class="rmsg" data-msg></p>
    <button type="button" class="rbtn primary" data-act="send" disabled><span class="rlbl">${t('report.send')}</span>${svg('send')}<i class="rspin"></i></button>`;
  },

  done: (still) => `
    <div class="rdone${still ? ' still' : ''}">
      <svg class="rcheck" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" /><path d="M20 33l8 8 16-17" /></svg>
      <h2 class="rq" id="report-title">${t('report.done.title')}</h2>
      <p class="rsub">${t('report.done.sub')}</p>
      <div class="rline"><i></i></div>
      <button type="button" class="rbtn" data-act="close"><span class="rlbl">${t('common.close')}</span></button>
    </div>`,
};

/** Después de montar: lo que depende del DOM ya presente (lista, contador, botón de enviar…). */
const POST = {
  where(el) {
    paintList(el, { scroll: true });
  },
  text(el) {
    paintText(el);
  },
  done() {
    later(close, DONE_MS);
  },
};

function resendLabel() {
  const s = F.resendLeft(state, Date.now());
  return s ? t('report.code.wait', { s }) : t('report.code.resend');
}

// ---------- DOM base ----------
function ensureDom() {
  if (root) return;
  appEl = document.getElementById('app');
  root = document.createElement('div');
  root.className = 'report';
  root.id = 'report';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="report-scrim"></div>
    <section class="report-card" role="dialog" aria-modal="true" aria-labelledby="report-title" tabindex="-1">
      <header class="report-head">
        <button type="button" class="report-back icon-btn small off" data-act="back" tabindex="-1">${svg('back')}</button>
        <div class="report-rail" role="progressbar" aria-valuemin="1" aria-valuemax="5" aria-valuenow="1">${'<i><b></b></i>'.repeat(5)}</div>
        <button type="button" class="report-x icon-btn small" data-act="close">${svg('x')}</button>
      </header>
      <div class="report-viewport"></div>
      <p class="report-live" aria-live="polite"></p>
    </section>`;
  document.body.append(root);
  card = root.querySelector('.report-card');
  viewport = root.querySelector('.report-viewport');
  rail = root.querySelector('.report-rail');
  backBtn = root.querySelector('.report-back');
  live = root.querySelector('.report-live');
  labels();
  bindEvents();
}

function labels() {
  if (!root) return;
  backBtn.setAttribute('aria-label', t('report.back'));
  root.querySelector('.report-x').setAttribute('aria-label', t('common.close'));
}

/** Riel de progreso, flecha de volver y progressbar. */
function chrome() {
  const idx = F.railIndex(state.step);
  const done = state.step === 'done';
  [...rail.children].forEach((seg, i) => {
    seg.classList.toggle('on', i < idx - 1 || done);
    seg.classList.toggle('cur', i === idx - 1 && !done);
  });
  rail.setAttribute('aria-valuenow', idx);
  rail.setAttribute('aria-valuetext', t('report.progress', { n: idx }));
  const back = F.canGoBack(state.step);
  backBtn.classList.toggle('off', !back);
  backBtn.tabIndex = back ? 0 : -1;
}

function announce(text) {
  live.textContent = '';
  later(() => (live.textContent = text), 40);
}

/** Mensaje corto debajo del control del paso (error en rojo, "ok" en acento). */
function setMsg(text, kind = 'err') {
  const m = viewport.querySelector('.report-step:not(.leaving) [data-msg]');
  if (!m) return;
  m.textContent = text || '';
  m.classList.toggle('ok', kind === 'ok');
  m.setAttribute('role', kind === 'err' && text ? 'alert' : 'status');
  if (text) announce(text);
}

function setBusy(on, btn) {
  busy = on;
  const b = btn || viewport.querySelector('.report-step:not(.leaving) .rbtn.primary');
  if (b) {
    b.classList.toggle('busy', on);
    b.disabled = on || (b.dataset.act === 'send' && !F.canAdvance(state)) || (b.dataset.act === 'where-next' && !selId());
    b.setAttribute('aria-busy', on);
    const lbl = b.querySelector('.rlbl');
    if (lbl && b.dataset.act === 'send') lbl.textContent = on ? t('report.sending') : t('report.send');
  }
  viewport.querySelector('.report-step:not(.leaving) .rcode')?.classList.toggle('busy', on);
}

function shake(el) {
  if (!el) return;
  el.classList.add('bad');
  if (reduced()) return; // sin movimiento: solo cambia el color
  el.animate(
    { transform: ['translateX(0)', 'translateX(-6px)', 'translateX(6px)', 'translateX(-4px)', 'translateX(4px)', 'translateX(0)'] },
    { duration: 360, easing: EASE },
  );
}

// ---------- cambio de paso ----------
function finishMove() {
  moving?.();
}

/** Monta `el` como paso nuevo. `dir` = +1 al avanzar y −1 al volver; sin `dir` no se anima. */
function swap(el, dir) {
  finishMove();
  const old = viewport.querySelector('.report-step');
  const animate = !!dir && !!old && !reduced() && opened;
  if (!animate) {
    viewport.replaceChildren(el);
    return;
  }
  const h0 = viewport.offsetHeight;
  old.inert = true;
  old.setAttribute('aria-hidden', 'true');
  old.querySelector('#report-title')?.removeAttribute('id');
  old.classList.add('leaving');
  el.classList.add('entering');
  viewport.classList.add('moving');
  viewport.style.height = `${h0}px`;
  viewport.append(el);
  const h1 = el.offsetHeight + 6; // + el relleno vertical del viewport
  const o = (duration, delay = 0) => ({ duration, delay, easing: EASE, fill: 'both' });
  const anims = [
    old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-24 * dir}px)` }], o(220)),
    el.animate([{ opacity: 0, transform: `translateX(${24 * dir}px)` }, { opacity: 1, transform: 'none' }], o(380, 90)),
    viewport.animate([{ height: `${h0}px` }, { height: `${h1}px` }], o(380)),
  ];
  const finish = () => {
    if (moving !== finish) return;
    moving = null;
    anims.forEach((a) => a.cancel());
    old.remove();
    el.classList.remove('entering');
    viewport.classList.remove('moving');
    viewport.style.height = '';
  };
  moving = finish;
  Promise.all(anims.map((a) => a.finished)).then(finish, () => {});
}

/** Pinta el paso actual del estado. */
function go(dir, { msg, still } = {}) {
  clearTimers();
  const el = document.createElement('div');
  el.className = 'report-step';
  el.dataset.step = state.step;
  el.innerHTML = TPL[state.step](still);
  swap(el, still ? 0 : dir);
  chrome();
  POST[state.step]?.(el);
  if (msg) setMsg(msg.text, msg.kind);
  else announce(el.querySelector('#report-title')?.textContent || '');
  if (!still) later(() => focusInitial(), 70);
}

function focusInitial() {
  if (!opened) return;
  const el = viewport.querySelector('.report-step:not(.leaving)');
  if (!el) return;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let target = null;
  switch (state.step) {
    case 'email':
      target = el.querySelector('.rinput');
      break;
    case 'code': {
      const cells = [...el.querySelectorAll('.rcell')];
      target = cells.find((c) => !c.value) || cells.at(-1);
      break;
    }
    case 'where':
      target = coarse ? card : el.querySelector('.rinput'); // en el celular no se abre el teclado de entrada
      break;
    case 'type':
      target = el.querySelector('.rtype.sel') || el.querySelector('.rtype');
      break;
    case 'text':
      target = el.querySelector('.rtext');
      break;
    default:
      target = el.querySelector('[data-act="close"]');
  }
  target?.focus({ preventScroll: true });
  if (target?.matches?.('.rtext, .rinput') && target.setSelectionRange) {
    try {
      const n = target.value.length;
      target.setSelectionRange(n, n);
    } catch {}
  }
}

// ---------- paso 1: correo ----------
async function submitEmail() {
  if (busy) return;
  const input = viewport.querySelector('.report-step:not(.leaving) .rinput');
  const v = F.normalizeEmail(input?.value);
  if (!F.validEmail(v)) {
    input.setAttribute('aria-invalid', 'true');
    shake(input.closest('.rfield'));
    setMsg(t('report.email.bad'));
    input.focus({ preventScroll: true });
    return;
  }
  state = F.reduce(state, { type: 'email', value: v });
  const id = ++reqId;
  setBusy(true);
  setMsg('');
  try {
    const r = await api.requestCode(v, getLang());
    if (id !== reqId) return;
    state = F.reduce(state, { type: 'codeRequested', email: v, resendIn: r?.resendIn, now: Date.now() });
    saveEmail(v);
    setBusy(false);
    go(1);
  } catch (e) {
    if (id !== reqId) return;
    setBusy(false);
    fail(e);
  }
}

// ---------- paso 2: código ----------
const cells = () => [...viewport.querySelectorAll('.report-step:not(.leaving) .rcell')];

function paintCode({ pop = -1 } = {}) {
  cells().forEach((c, i) => {
    const d = state.code[i] || '';
    if (c.value !== d) c.value = d;
    c.classList.toggle('full', !!d);
    if (i === pop) {
      c.classList.remove('pop');
      void c.offsetWidth;
      c.classList.add('pop');
    }
  });
}

function setCode(value, focusAt, pop) {
  state = F.reduce(state, { type: 'code', value });
  paintCode({ pop });
  const cs = cells();
  const i = Math.min(focusAt ?? state.code.length, cs.length - 1);
  cs[i]?.focus({ preventScroll: true });
  const full = F.codeComplete(state.code);
  if (full) cs[i]?.setSelectionRange?.(1, 1); // completo: nada queda resaltado mientras se verifica
  viewport.querySelector('.rcode')?.classList.remove('bad');
  setMsg('');
  if (full) later(verify, 140);
}

function onCellInput(e) {
  const cs = cells();
  const i = cs.indexOf(e.target);
  let digits = e.target.value.replace(/\D/g, '');
  // escribir sobre una casilla llena deja dos caracteres: vale el que se acaba de tipear
  if (e.inputType === 'insertText' && e.data && digits.length <= 2) digits = e.data.replace(/\D/g, '') || digits;
  const head = state.code.slice(0, i);
  if (!digits) {
    // Se borró el contenido de la casilla (o tipearon una letra)
    return setCode(head + state.code.slice(i + 1), i);
  }
  const next = head + digits + state.code.slice(i + digits.length);
  setCode(next, head.length + Math.min(digits.length, F.CODE_LEN), Math.min(head.length + digits.length - 1, F.CODE_LEN - 1));
}

function onCellKey(e) {
  const cs = cells();
  const i = cs.indexOf(e.target);
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (state.code[i]) setCode(state.code.slice(0, i) + state.code.slice(i + 1), i);
    else if (i > 0) setCode(state.code.slice(0, i - 1) + state.code.slice(i), i - 1);
  } else if (e.key === 'ArrowLeft' && i > 0) {
    e.preventDefault();
    cs[i - 1].focus({ preventScroll: true });
    cs[i - 1].select();
  } else if (e.key === 'ArrowRight' && i < cs.length - 1) {
    e.preventDefault();
    cs[i + 1].focus({ preventScroll: true });
    cs[i + 1].select();
  } else if (e.key === 'Enter' && F.codeComplete(state.code)) {
    e.preventDefault();
    verify();
  }
}

function onCellPaste(e) {
  e.preventDefault();
  const digits = F.cleanCode(e.clipboardData?.getData('text'));
  if (!digits) return;
  const i = cells().indexOf(e.target);
  // un código completo reemplaza todo; uno parcial se escribe desde la casilla elegida
  setCode(digits.length === F.CODE_LEN ? digits : state.code.slice(0, i) + digits, undefined, Math.min(i + digits.length - 1, F.CODE_LEN - 1));
}

async function verify() {
  if (busy || state.step !== 'code' || !F.codeComplete(state.code)) return;
  const id = ++reqId;
  setBusy(true);
  try {
    const r = await api.verifyCode(state.sentTo, state.code);
    if (id !== reqId) return;
    cells().forEach((c) => c.classList.add('ok')); // las casillas se encienden en cadena
    announce(t('report.code.ok'));
    await sleep(reduced() ? 80 : F.CODE_LEN * 40 + 260);
    if (id !== reqId) return;
    state = F.reduce(state, { type: 'verified', token: r?.token, expiresIn: r?.expiresIn, now: Date.now() });
    setBusy(false);
    go(1);
  } catch (e) {
    if (id !== reqId) return;
    setBusy(false);
    fail(e);
  }
}

async function resend() {
  if (busy || !F.canResend(state, Date.now())) return;
  const id = ++reqId;
  busy = true;
  paintResend();
  try {
    const r = await api.requestCode(state.sentTo, getLang());
    if (id !== reqId) return;
    state = F.reduce(state, { type: 'codeRequested', email: state.sentTo, resendIn: r?.resendIn, now: Date.now() });
    busy = false;
    paintResend();
    setMsg(t('report.code.resent'), 'ok');
    later(() => setMsg(''), 2600);
  } catch (e) {
    if (id !== reqId) return;
    busy = false;
    paintResend();
    fail(e);
  }
}

function paintResend() {
  const b = viewport.querySelector('.report-step:not(.leaving) [data-act="resend"]');
  if (!b) return;
  const s = F.resendLeft(state, Date.now());
  b.textContent = resendLabel();
  b.disabled = s > 0 || busy;
}

// ---------- paso 3: dónde ----------
function paintList(el, { scroll = false } = {}) {
  const list = el.querySelector('.rlist');
  const input = el.querySelector('.rinput');
  ui.items = F.filterPlaces(F.placesList(available(), state.preset), state.query, labelOf);
  const sel = selId();
  const at = ui.items.findIndex((x) => x.id === sel);
  ui.active = Math.max(0, at);
  list.innerHTML = ui.items.length
    ? ui.items
        .map((it, i) => {
          const thumb = it.home
            ? svg('home')
            : it.game.thumbnail
              ? `<img src="${esc(it.game.thumbnail)}" width="48" height="30" alt="" loading="lazy" decoding="async" draggable="false">`
              : `<span class="ph">${esc(String(pick(it.game.title)).slice(0, 2))}</span>`;
          return `<button type="button" role="option" tabindex="-1" id="rp-${esc(it.id)}" class="rplace${it.id === sel ? ' sel' : ''}${i === ui.active ? ' act' : ''}" data-act="pick-where" data-id="${esc(it.id)}" aria-selected="${it.id === sel}"><span class="rthumb${it.home ? ' home' : ''}">${thumb}</span><span class="rname">${esc(labelOf(it))}</span>${it.current ? `<em class="rtag">${t('report.where.this')}</em>` : ''}${svg('tick', 'rtick')}</button>`;
        })
        .join('')
    : `<p class="rnone">${t('search.empty')}</p>`;
  if (!scroll) list.scrollTop = 0;
  syncActive(el, { scroll });
  input?.setAttribute('aria-activedescendant', ui.items[ui.active] ? `rp-${ui.items[ui.active].id}` : '');
}

/** Marca la fila activa (la que responde a Enter) y la deja a la vista. */
function syncActive(el, { scroll = true } = {}) {
  const list = el.querySelector('.rlist');
  const rows = [...list.querySelectorAll('.rplace')];
  rows.forEach((r, i) => r.classList.toggle('act', i === ui.active));
  const row = rows[ui.active];
  el.querySelector('.rinput')?.setAttribute('aria-activedescendant', row?.id || '');
  if (!row) return;
  const top = row.offsetTop;
  if (scroll && (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight)) {
    list.scrollTop = top - Math.max(0, (list.clientHeight - row.offsetHeight) / 2);
  }
}

function pickWhere(id) {
  clearAdvance();
  state = F.reduce(state, { type: 'pickWhere', id });
  const el = viewport.querySelector('.report-step:not(.leaving)');
  ui.active = Math.max(0, ui.items.findIndex((x) => x.id === id));
  el.querySelectorAll('.rplace').forEach((r, i) => {
    const on = r.dataset.id === id;
    r.classList.toggle('act', i === ui.active);
    r.classList.toggle('sel', on);
    r.setAttribute('aria-selected', on);
  });
  el.querySelector('[data-act="where-next"]').disabled = false;
  advanceLater(180);
}

let advanceTimer = 0;
function advanceLater(ms) {
  advanceTimer = later(() => {
    advanceTimer = 0;
    advance();
  }, ms);
}
function clearAdvance() {
  if (advanceTimer) clearTimeout(advanceTimer);
  timers.delete(advanceTimer);
  advanceTimer = 0;
}

function advance() {
  clearAdvance();
  if (state.step === 'where' && !state.where && state.preset) state = F.reduce(state, { type: 'pickWhere', id: state.preset });
  const was = state.step;
  state = F.reduce(state, { type: 'next' });
  if (state.step !== was) go(1);
}

function onWhereKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = ui.items.length;
    if (!n) return;
    ui.active = (ui.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    syncActive(e.currentTarget);
  } else if (e.key === 'Enter' && e.target.closest('.rplace') === null) {
    e.preventDefault();
    const it = ui.items[ui.active];
    if (it) pickWhere(it.id);
    else if (selId()) advance();
  }
}

// ---------- paso 4: tipo ----------
function pickType(k) {
  clearAdvance();
  state = F.reduce(state, { type: 'pickType', value: k });
  viewport.querySelectorAll('.report-step:not(.leaving) .rtype').forEach((b) => {
    const on = b.dataset.type === k;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-checked', on);
  });
  advanceLater(220);
}

function onTypeKey(e) {
  const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!k) return;
  const bs = [...e.currentTarget.querySelectorAll('.rtype')];
  const i = bs.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  bs[(i + k + bs.length) % bs.length].focus({ preventScroll: true });
}

// ---------- paso 5: detalle ----------
function paintText(el = viewport.querySelector('.report-step:not(.leaving)')) {
  if (!el) return;
  const n = state.text.length;
  el.querySelector('[data-n]').textContent = n;
  el.querySelector('.rcount').classList.toggle('near', n > F.MAX_TEXT - 100);
  el.querySelector('[data-hint]').classList.toggle('on', n > 0 && !F.textOk(state.text));
  const send = el.querySelector('[data-act="send"]');
  if (send && !busy) send.disabled = !F.canAdvance(state);
}

function collectMeta() {
  return {
    lang: getLang(),
    platform: device.platform(),
    theme: document.documentElement.dataset.theme,
    ua: navigator.userAgent,
    viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    url: location.pathname + location.hash,
    inGame: state.fromGame,
    build: typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev',
    at: new Date().toISOString(),
  };
}

async function submitReport() {
  if (busy || state.step !== 'text' || !F.canAdvance(state)) return;
  if (!F.tokenValid(state, Date.now())) return fail({ code: 'token_expired' });
  const id = ++reqId;
  setBusy(true);
  setMsg('');
  try {
    const r = await api.sendReport(F.buildPayload(state, collectMeta()), state.token);
    if (id !== reqId) return;
    state = F.reduce(state, { type: 'sent', id: r?.id });
    setBusy(false);
    go(1);
  } catch (e) {
    if (id !== reqId) return;
    setBusy(false);
    fail(e);
  }
}

// ---------- errores ----------
function fail(e) {
  const code = e?.code || 'unknown';
  const fx = F.errorFx(code);
  const text = t(fx.key);
  if (code === 'rate_limited' && e.data?.retryIn && state.step === 'code') {
    state = F.reduce(state, { type: 'cooldown', secs: e.data.retryIn, now: Date.now() });
    paintResend();
  }
  if (fx.to === 'email') {
    state = F.reduce(state, { type: 'tokenExpired' });
    return go(-1, { msg: { text } });
  }
  const step = viewport.querySelector('.report-step:not(.leaving)');
  if (fx.clearCode) {
    state = F.reduce(state, { type: 'code', value: '' });
    paintCode();
  }
  if (fx.shake) {
    const target = state.step === 'code' ? step.querySelector('.rcode') : step.querySelector('.rfield');
    shake(target);
    step.querySelector('.rinput')?.setAttribute('aria-invalid', 'true');
  }
  setMsg(text);
  if (state.step === 'code' && fx.clearCode) cells()[0]?.focus({ preventScroll: true });
}

// ---------- eventos ----------
function back() {
  clearAdvance();
  const was = state.step;
  state = F.reduce(state, { type: 'back' });
  if (state.step !== was) go(-1);
}

function focusables() {
  return [...card.querySelectorAll('button, input, textarea, [tabindex]')].filter(
    (el) =>
      !el.disabled &&
      el.tabIndex >= 0 &&
      !el.closest('[inert]') &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden',
  );
}

function bindEvents() {
  // cerrar tocando el fondo: pointerdown y pointerup tienen que ser sobre el fondo (soltar una selección de texto afuera no cierra)
  root.addEventListener('pointerdown', (e) => (downOnBg = !e.target.closest('.report-card')));
  root.addEventListener('pointerup', (e) => {
    if (downOnBg && !e.target.closest('.report-card')) close();
    downOnBg = false;
  });
  // tocar el fondo no le saca el foco a nada (ni al abrir ni en el instante posterior al cierre)
  root.addEventListener('mousedown', (e) => !e.target.closest('.report-card') && e.preventDefault());
  // el fondo no deja desplazar la página de atrás
  root.addEventListener(
    'wheel',
    (e) => {
      if (!e.target.closest('.report-viewport, .rlist')) e.preventDefault();
    },
    { passive: false },
  );

  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'close':
        return close();
      case 'back':
        return back();
      case 'send-code':
        return submitEmail();
      case 'resend':
        return resend();
      case 'change-email':
        clearTimers();
        state = F.reduce(state, { type: 'changeEmail' });
        return go(-1);
      case 'pick-where':
        return pickWhere(b.dataset.id);
      case 'where-next':
        return advance();
      case 'pick-type':
        return pickType(b.dataset.type);
      case 'goto':
        state = F.reduce(state, { type: 'goto', step: b.dataset.step });
        return go(-1);
      case 'meta':
        state = F.reduce(state, { type: 'meta', on: b.getAttribute('aria-checked') !== 'true' });
        return b.setAttribute('aria-checked', state.meta);
      case 'send':
        return submitReport();
    }
  });

  card.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('.rcell')) return onCellInput(e);
    if (el.matches('[type="email"]')) {
      state = F.reduce(state, { type: 'email', value: el.value });
      el.removeAttribute('aria-invalid');
      el.closest('.rfield').classList.remove('bad');
      setMsg('');
    } else if (el.matches('[type="search"]')) {
      state = F.reduce(state, { type: 'query', value: el.value });
      clearAdvance();
      paintList(el.closest('.report-step'));
    } else if (el.matches('.rtext')) {
      state = F.reduce(state, { type: 'text', value: el.value });
      setMsg('');
      paintText();
    }
  });

  card.addEventListener('paste', (e) => e.target.matches?.('.rcell') && onCellPaste(e));

  card.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Tab') return trap(e);
    if (el.matches('.rcell')) return onCellKey(e);
    if (e.key === 'Enter' && el.matches('[type="email"]')) {
      e.preventDefault();
      submitEmail();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && el.matches('.rtext')) {
      e.preventDefault();
      submitReport();
    } else if (state.step === 'where') {
      onWhereKey({ key: e.key, target: el, currentTarget: viewport.querySelector('.report-step:not(.leaving)'), preventDefault: () => e.preventDefault() });
    } else if (state.step === 'type') {
      onTypeKey({ key: e.key, currentTarget: viewport.querySelector('.report-step:not(.leaving)'), preventDefault: () => e.preventDefault() });
    }
  });

  // al enfocar una casilla se selecciona su dígito (así escribir lo reemplaza)
  card.addEventListener('focusin', (e) => e.target.matches?.('.rcell') && !busy && e.target.select());

  // si el foco se va (p. ej. se toca el fondo), Tab lo trae de vuelta dentro
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !card.contains(document.activeElement)) trap(e);
  });
}

/** Trampa de Tab: el foco no sale de la tarjeta. */
function trap(e) {
  const f = focusables();
  if (!f.length) {
    e.preventDefault();
    return card.focus({ preventScroll: true });
  }
  const first = f[0];
  const last = f[f.length - 1];
  const a = document.activeElement;
  if (e.shiftKey && (a === first || a === card || !card.contains(a))) {
    e.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!e.shiftKey && (a === last || !card.contains(a))) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  }
}

// ---------- teclado virtual ----------
function syncViewport() {
  if (!root) return;
  const vv = window.visualViewport;
  const h = vv ? vv.height : innerHeight;
  // --kb: lo que tapa el teclado (la hoja sube esa altura). --vvh: alto que realmente se ve.
  root.style.setProperty('--kb', `${vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0}px`);
  root.style.setProperty('--vvh', `${Math.round(h)}px`);
  root.classList.toggle('short', h < 480); // poco alto (teclado abierto o celular horizontal): se compacta
}

// ---------- API pública ----------
export function init({ onToggle } = {}) {
  hooks = { ...hooks, onToggle: onToggle || hooks.onToggle };
}

/** Abre el popup. `gameId`: juego desde el que se abrió (se preselecciona); `returnTo`: dónde vuelve el foco al cerrar. */
export function open({ gameId, returnTo: el } = {}) {
  ensureDom();
  if (opened) return;
  clearTimeout(wipeTimer);
  clearTimeout(closingTimer);
  root.classList.remove('closing');
  state = F.reduce(state, { type: 'open', gameId });
  returnTo = el || null;
  opened = true;
  busy = false;
  go(0, { still: true }); // el paso actual aparece ya armado (retoma donde se dejó)
  syncViewport();
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);
  addEventListener('resize', syncViewport);
  appEl.inert = true;
  root.classList.remove('settled');
  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
  later(() => root.classList.add('settled'), 750);
  ticker = setInterval(() => state.step === 'code' && paintResend(), 500);
  hooks.onToggle(true);
  later(() => focusInitial(), 80);
}

export function close() {
  if (!opened) return;
  opened = false;
  reqId++; // lo que todavía viaja se ignora al volver
  clearTimers();
  clearInterval(ticker);
  finishMove();
  if (busy) {
    busy = false;
    if (state.step === 'code') state = F.reduce(state, { type: 'code', value: '' }); // se cerró verificando: se vuelve a ingresar
  }
  window.visualViewport?.removeEventListener('resize', syncViewport);
  window.visualViewport?.removeEventListener('scroll', syncViewport);
  removeEventListener('resize', syncViewport);
  root.classList.remove('open', 'settled');
  // en pantallas táctiles los eventos de mouse "de compatibilidad" llegan unos ms después del toque, cuando el popup ya se
  // cerró: si no hay nada encima, caen sobre el juego (clic fantasma y foco robado). La capa sigue ahí ~400 ms sin verse.
  root.classList.add('closing');
  closingTimer = setTimeout(() => root.classList.remove('closing'), 400);
  root.setAttribute('aria-hidden', 'true');
  appEl.inert = false;
  if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  returnTo = null;
  // cuando termina la animación de salida no queda nada montado (inputs, listas, miniaturas); al reabrir se arma de nuevo
  wipeTimer = setTimeout(() => !opened && viewport.replaceChildren(), 320);
  hooks.onToggle(false);
}

/** Repinta el paso actual (cambio de idioma con el popup abierto): sin animar y conservando el estado. */
export function rerender() {
  labels();
  if (!root || !opened) return;
  finishMove();
  go(0, { still: true });
  if (state.step !== 'done') later(() => focusInitial(), 0);
}
