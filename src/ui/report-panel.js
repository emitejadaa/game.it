/**
 * Panel "Reportar un problema": correo → código de verificación → reporte → listo.
 *
 * Sin cuentas: el servidor manda un código al correo y, al verificarlo, entrega un token que
 * queda guardado en este dispositivo unos días (así no hay que verificar cada vez). El borrador
 * vive en la sesión de la pestaña: cerrar el panel o ir a buscar el código al correo no pierde
 * lo escrito. Con `endpoint` vacío en report.config.js funciona en modo demo (core/report-api.js).
 */
import cfg from '../report.config.js';
import * as api from '../core/report-api.js';
import * as diagnostics from '../core/diagnostics.js';
import * as prefs from '../core/prefs.js';
import { ALL_GAMES } from '../core/registry.js';
import { getLang, pick, t } from '../core/i18n.js';

const panel = document.getElementById('report');
const triggers = [document.getElementById('btn-report'), document.getElementById('btn-player-report')];

const SESSION_KEY = 'gameit:report:session'; // localStorage: { email, token, exp }
const PENDING_KEY = 'gameit:report:pending'; // sessionStorage: código pedido y todavía sin verificar
const DRAFT_KEY = 'gameit:report:draft'; // sessionStorage: lo que se está escribiendo

const EMPTY = { game: '', kind: 'bug', freq: 'always', text: '', tech: true, notify: false, startedAt: 0 };

const S = { step: 'email', email: '', resendAt: 0, codeExp: 0, demoCode: '', busy: false, captcha: '', left: null, sentId: '', sentNotify: false, techOpen: false };
let session = null;
let draft = { ...EMPTY };
let hooks = { onToggle: () => {}, isInGame: () => false, gameId: () => null };
let opener = null;
let tick = 0;
let widget = null; // Turnstile

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fine = () => matchMedia('(pointer: fine)').matches;
const $ = (sel) => panel.querySelector(sel);

/** 42 → "42 s", 600 → "10 min", 7200 → "2 h". */
const fmt = (s) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.ceil(s / 60)} min` : `${Math.ceil(s / 3600)} h`);

// ------------------------------------------------------------------ estado guardado
function load(store, key) {
  try {
    return JSON.parse(store.getItem(key));
  } catch {
    return null;
  }
}
function store(storage, key, value) {
  try {
    value == null ? storage.removeItem(key) : storage.setItem(key, JSON.stringify(value));
  } catch {}
}

function readSession() {
  const s = load(localStorage, SESSION_KEY);
  return s && s.token && s.exp > Date.now() ? s : null;
}
function writeSession(s) {
  session = s;
  store(localStorage, SESSION_KEY, s);
}

const saveDraft = () => store(sessionStorage, DRAFT_KEY, draft);
const savePending = () =>
  store(sessionStorage, PENDING_KEY, { email: S.email, resendAt: S.resendAt, codeExp: S.codeExp, demoCode: S.demoCode });
function clearPending() {
  S.codeExp = 0;
  S.demoCode = '';
  store(sessionStorage, PENDING_KEY, null);
}

function restore() {
  session = readSession();
  const d = load(sessionStorage, DRAFT_KEY);
  if (d && typeof d === 'object') draft = { ...EMPTY, ...d };
  const p = load(sessionStorage, PENDING_KEY);
  if (p && p.codeExp > Date.now()) Object.assign(S, p, { step: 'code' });
}

/** Paso con el que abre el panel: con sesión va directo al reporte. */
function entryStep() {
  session = readSession();
  if (session) return 'form';
  if (S.step === 'code' && S.codeExp > Date.now()) return 'code';
  return 'email';
}

// ------------------------------------------------------------------ plantillas
const HONEYPOT = '<label class="r-hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>';
const CAPTCHA = () => (cfg.turnstileSiteKey ? '<div class="r-captcha" id="r-captcha"></div>' : '');

function seg(key, options) {
  const v = draft[key];
  const idx = Math.max(0, options.findIndex((o) => o[0] === v));
  return `<div class="seg" role="radiogroup" aria-labelledby="r-${key}-l" data-key="${key}" style="--n:${options.length};--idx:${idx}">${options
    .map(([val, label]) => `<button type="button" role="radio" data-val="${val}" aria-checked="${val === v}">${label}</button>`)
    .join('')}</div>`;
}

const toggle = (key, label) =>
  `<button class="toggle" type="button" role="switch" data-key="${key}" aria-checked="${draft[key]}" aria-label="${esc(label)}"></button>`;

function gameOptions() {
  const cur = draft.game || 'portal';
  const opt = (v, label) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const games = [...ALL_GAMES].sort((a, b) => String(pick(a.title)).localeCompare(String(pick(b.title))));
  return (
    opt('portal', t('report.game.portal')) +
    `<optgroup label="${esc(t('menu.all'))}">${games.map((g) => opt(g.id, pick(g.title))).join('')}</optgroup>` +
    opt('other', t('report.game.other'))
  );
}

const gameIdFor = (v) => (!v || v === 'portal' || v === 'other' ? null : v);

function techHtml() {
  const s = diagnostics.snapshot(gameIdFor(draft.game));
  const rows = [
    ['version', s.build ? `${s.build.commit || '-'} · ${s.build.date}` : '-'],
    ['platform', s.platform],
    ['browser', s.userAgent],
    ['screen', `${s.screen} · ${s.viewport}`],
    ['language', `${s.language} · ${s.timezone || '-'}`],
    ['device', `${s.cores ?? '?'} cores · ${s.memoryGb ?? '?'} GB · touch ${s.touchPoints}`],
    ['network', s.network ? `${s.network.type ?? '?'} · ${s.network.rttMs ?? '?'} ms` : s.online ? 'online' : 'offline'],
    ['prefs', Object.entries(s.prefs).map(([k, v]) => `${k}=${v}`).join(' ')],
    ['errors', s.errors.length ? s.errors.map((e) => `${e.src}: ${e.message}${e.count > 1 ? ` ×${e.count}` : ''}`).join('\n') : '0'],
  ];
  return `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

const BODY = {
  email: () => `
    <form class="r-form" data-form="code" novalidate>
      <p class="r-lead">${t('report.lead')}</p>
      <label class="r-field"><span>${t('report.email')}</span>
        <input id="r-email" type="email" name="email" autocomplete="email" inputmode="email" spellcheck="false" maxlength="254" placeholder="${esc(t('report.emailPh'))}" value="${esc(S.email)}"></label>
      ${HONEYPOT}${CAPTCHA()}
      <p class="r-error" role="alert"></p>
      <button class="r-btn" type="submit">${t('report.sendCode')}</button>
      <p class="r-fine">${t('report.privacy')}</p>
    </form>`,

  code: () => `
    <form class="r-form" data-form="verify" novalidate>
      <p class="r-lead">${t('report.codeSent', { n: cfg.codeLength })} <b class="r-mail">${esc(S.email)}</b>
        <button class="r-link" type="button" data-act="change">${t('report.change')}</button></p>
      ${S.demoCode ? `<p class="r-demo"><i></i><span>${t('report.demo')} <button type="button" data-act="fill">${S.demoCode}</button></span></p>` : ''}
      <label class="r-field"><span>${t('report.code')}</span>
        <input id="r-code" class="r-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="${cfg.codeLength}" placeholder="${'·'.repeat(cfg.codeLength)}"></label>
      ${CAPTCHA()}
      <p class="r-error" role="alert"></p>
      <button class="r-btn" type="submit">${t('report.verify')}</button>
      <p class="r-fine"><button class="r-link" type="button" data-act="resend">${t('report.resend')}</button> · ${t('report.spam')}</p>
    </form>`,

  form: () => {
    const k = draft.kind;
    return `
    <form class="r-form" data-form="report" novalidate>
      <p class="r-who"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg><b class="r-mail">${esc(session.email)}</b>
        <button class="r-link" type="button" data-act="logout">${t('report.otherEmail')}</button></p>
      <label class="r-field"><span>${t('report.game')}</span>
        <span class="r-select"><select id="r-game" name="game">${gameOptions()}</select></span></label>
      <div class="r-field"><span id="r-kind-l">${t('report.kind')}</span>${seg('kind', [
        ['bug', t('report.kind.bug')],
        ['idea', t('report.kind.idea')],
        ['other', t('report.kind.other')],
      ])}</div>
      <label class="r-field"><span class="r-text-l">${t(`report.text.${k}`)}</span>
        <textarea id="r-text" name="text" rows="5" maxlength="${cfg.maxChars}" placeholder="${esc(t(`report.ph.${k}`))}">${esc(draft.text)}</textarea>
        <small class="r-count" aria-hidden="true"></small></label>
      <div class="r-field r-freq"${k === 'bug' ? '' : ' hidden'}><span id="r-freq-l">${t('report.freq')}</span>${seg('freq', [
        ['always', t('report.freq.always')],
        ['sometimes', t('report.freq.sometimes')],
        ['once', t('report.freq.once')],
      ])}</div>
      <div class="prow"><span>${t('report.tech')}<small class="hint">${t('report.techHint')}
        <button class="r-link" type="button" data-act="tech" aria-expanded="${S.techOpen}">${t(S.techOpen ? 'report.techHide' : 'report.techShow')}</button></small></span>${toggle('tech', t('report.tech'))}</div>
      <div class="r-tech${draft.tech ? '' : ' off'}"${S.techOpen ? '' : ' hidden'}>${S.techOpen ? techHtml() : ''}</div>
      <div class="prow"><span>${t('report.notify')}</span>${toggle('notify', t('report.notify'))}</div>
      ${HONEYPOT}
      <p class="r-error" role="alert"></p>
      <button class="r-btn" type="submit">${t('report.send')}</button>
      <p class="r-fine r-left"></p>
    </form>`;
  },

  done: () => `
    <div class="r-done">
      <svg class="r-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
      <h3>${t('report.thanks')}</h3>
      <p>${t('report.received')} <b class="r-id">${esc(S.sentId)}</b>.</p>
      <p class="r-fine">${t('report.next')}${S.sentNotify ? ` ${t('report.willNotify')}` : ''}</p>
      ${api.demo ? `<p class="r-demo"><i></i><span>${t('report.demoNote')}</span></p>` : ''}
      <div class="r-actions">
        <button class="r-btn ghost" type="button" data-act="another">${t('report.another')}</button>
        <button class="r-btn" type="button" data-act="close">${t('common.close')}</button>
      </div>
    </div>`,
};

// ------------------------------------------------------------------ pintado
function render() {
  dropCaptcha();
  stopTick();
  if (S.step === 'form' && !session) S.step = 'email';
  const steps = ['email', 'code', 'form'];
  const idx = S.step === 'done' ? steps.length : steps.indexOf(S.step);
  panel.innerHTML = `
    <div class="report-head">
      <h2 id="report-title">${t('report.title')}</h2>
      <button class="r-x" type="button" data-act="close" aria-label="${esc(t('common.close'))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
    <ol class="r-steps" aria-hidden="true">${steps
      .map((s, i) => `<li class="${i < idx ? 'past' : i === idx ? 'now' : ''}">${t(`report.step.${s}`)}</li>`)
      .join('')}</ol>
    <div class="r-body" data-step="${S.step}">${BODY[S.step]()}</div>`;

  if (S.step === 'code') startTick();
  if (S.step === 'form') {
    count();
    showLeft();
  }
  if ($('#r-captcha')) mountCaptcha();
  syncButtons();
}

function go(step) {
  S.step = step;
  render();
  focusStep();
}

function focusStep() {
  if (!isOpen()) return;
  const target = fine()
    ? { email: '#r-email', code: '#r-code', form: '#r-text', done: '.r-actions [data-act=close]' }[S.step]
    : null;
  (target ? $(target) : panel)?.focus({ preventScroll: true });
}

function count() {
  const el = $('.r-count');
  if (!el) return;
  const n = draft.text.trim().length;
  el.textContent = `${draft.text.length} / ${cfg.maxChars}`;
  el.classList.toggle('ok', n >= cfg.minChars);
}

function showLeft() {
  const el = $('.r-left');
  if (!el) return;
  if (api.demo && S.left == null) el.textContent = t('report.demoNote');
  else if (S.left == null) el.textContent = '';
  else if (S.left <= 0) el.textContent = t('report.err.quota');
  else el.textContent = t(S.left === 1 ? 'report.left1' : 'report.left', { n: S.left });
}

function syncButtons() {
  const submit = $('.r-form [type=submit]');
  const waiting = !!cfg.turnstileSiteKey && !S.captcha && !!$('#r-captcha');
  if (submit) {
    submit.disabled = S.busy || (S.step === 'email' && waiting) || (S.step === 'form' && S.left !== null && S.left <= 0);
    submit.classList.toggle('loading', S.busy);
    if (S.step === 'email') submit.textContent = t(waiting ? 'report.captcha' : 'report.sendCode');
  }
  panel.setAttribute('aria-busy', String(S.busy));
  updateResend();
}

function setBusy(on) {
  S.busy = on;
  syncButtons();
}

function showError(code, extra = {}) {
  const el = $('.r-error');
  if (!el) return;
  let key = `report.err.${code}`;
  const vars = { n: '', t: fmt(Math.max(1, extra.retryIn || 60)) };
  if (code === 'bad_code') {
    vars.n = extra.attemptsLeft;
    if (extra.attemptsLeft === 1) key += '1';
  }
  if (code === 'too_short') vars.n = cfg.minChars;
  if (code === 'too_long') vars.n = cfg.maxChars;
  if (code === 'code_format') vars.n = cfg.codeLength;
  const text = t(key, vars);
  el.textContent = text === key ? t('report.err.server') : text;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

const clearError = () => {
  const el = $('.r-error');
  if (el) el.textContent = '';
};

// ------------------------------------------------------------------ reenvío del código
function updateResend() {
  const b = $('[data-act=resend]');
  if (!b) return;
  const s = Math.ceil((S.resendAt - Date.now()) / 1000);
  b.disabled = s > 0 || S.busy || (!!cfg.turnstileSiteKey && !S.captcha);
  b.textContent = s > 0 ? t('report.resendIn', { t: fmt(s) }) : t('report.resend');
}
function startTick() {
  tick = setInterval(updateResend, 1000);
}
function stopTick() {
  clearInterval(tick);
  tick = 0;
}

// ------------------------------------------------------------------ captcha (Cloudflare Turnstile, opcional)
let turnstile;
function loadTurnstile() {
  turnstile ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
    s.onerror = () => {
      turnstile = null; // se puede reintentar al volver a abrir
      reject();
    };
    document.head.appendChild(s);
  });
  return turnstile;
}

async function mountCaptcha() {
  S.captcha = '';
  let ts;
  try {
    ts = await loadTurnstile();
  } catch {
    return showError('captcha');
  }
  const el = $('#r-captcha');
  if (!el || widget !== null) return;
  const set = (tok) => {
    S.captcha = tok;
    syncButtons();
  };
  widget = ts.render(el, {
    sitekey: cfg.turnstileSiteKey,
    theme: prefs.isDark() ? 'dark' : 'light',
    language: getLang(),
    size: 'flexible',
    appearance: 'interaction-only',
    callback: set,
    'expired-callback': () => set(''),
    'error-callback': () => set(''),
  });
}

function dropCaptcha() {
  if (widget === null) return;
  try {
    window.turnstile.remove(widget);
  } catch {}
  widget = null;
  S.captcha = '';
}

/** Cada token sirve una sola vez: después de usarlo se pide otro. */
function resetCaptcha() {
  if (widget === null) return;
  S.captcha = '';
  try {
    window.turnstile.reset(widget);
  } catch {}
}

// ------------------------------------------------------------------ acciones
async function sendCode(resend = false) {
  if (S.busy || (cfg.turnstileSiteKey && !S.captcha)) return;
  const email = api.normEmail(resend ? S.email : $('#r-email')?.value);
  if (!api.EMAIL_RE.test(email)) return showError('invalid_email');
  setBusy(true);
  const res = await api.requestCode({
    email,
    lang: getLang(),
    website: $('[name=website]')?.value || '',
    ...(cfg.turnstileSiteKey ? { captcha: S.captcha } : {}),
  });
  resetCaptcha();
  setBusy(false);
  if (!res.ok) return showError(res.error, res);
  S.email = email;
  S.resendAt = Date.now() + (res.resendIn || 60) * 1000;
  S.codeExp = Date.now() + (res.expiresIn || 600) * 1000;
  S.demoCode = res.demoCode || '';
  savePending();
  go('code');
}

async function verify() {
  if (S.busy) return;
  const input = $('#r-code');
  const code = (input?.value || '').replace(/\D/g, '');
  if (code.length !== cfg.codeLength) return showError('code_format');
  setBusy(true);
  const res = await api.verifyCode({ email: S.email, code });
  setBusy(false);
  if (!res.ok) {
    if (input?.isConnected) {
      input.value = '';
      if (fine()) input.focus();
    }
    return showError(res.error, res);
  }
  writeSession({ email: S.email, token: res.token, exp: +res.expiresAt || Date.now() + cfg.sessionDays * 864e5 });
  S.left = Number.isFinite(res.left) ? res.left : null;
  clearPending();
  go('form');
}

async function submit() {
  if (S.busy || !session) return;
  const text = draft.text.trim();
  if (text.length < cfg.minChars) return showError('too_short');
  if (text.length > cfg.maxChars) return showError('too_long');
  setBusy(true);
  const res = await api.sendReport(session.token, {
    game: draft.game || 'portal',
    kind: draft.kind,
    freq: draft.kind === 'bug' ? draft.freq : null,
    text,
    notify: draft.notify,
    context: draft.tech ? diagnostics.snapshot(gameIdFor(draft.game)) : null,
    website: $('[name=website]')?.value || '',
    elapsed: Date.now() - (draft.startedAt || Date.now()),
  });
  setBusy(false);
  if (!res.ok) {
    if (res.error === 'session') {
      writeSession(null);
      go('email');
    }
    if (res.error === 'quota') {
      S.left = 0;
      syncButtons();
    }
    return showError(res.error, res);
  }
  S.left = Number.isFinite(res.left) ? res.left : null;
  S.sentId = res.id;
  S.sentNotify = draft.notify;
  draft = { ...EMPTY, game: draft.game, tech: draft.tech, notify: draft.notify };
  saveDraft();
  go('done');
}

/** Cambió el tipo de reporte: etiqueta, ejemplo y la pregunta de frecuencia (solo para errores). */
function applyKind() {
  const k = draft.kind;
  $('.r-text-l').textContent = t(`report.text.${k}`);
  $('#r-text').placeholder = t(`report.ph.${k}`);
  $('.r-freq').hidden = k !== 'bug';
}

function refreshTech() {
  const box = $('.r-tech');
  if (!box) return;
  box.hidden = !S.techOpen;
  box.classList.toggle('off', !draft.tech);
  box.innerHTML = S.techOpen ? techHtml() : '';
  const b = $('[data-act=tech]');
  b.textContent = t(S.techOpen ? 'report.techHide' : 'report.techShow');
  b.setAttribute('aria-expanded', String(S.techOpen));
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b || !panel.contains(b)) return;
  const act = b.dataset.act;
  if (act === 'close') return close();
  if (act === 'change') {
    clearPending();
    return go('email');
  }
  if (act === 'resend') return sendCode(true);
  if (act === 'fill') {
    $('#r-code').value = S.demoCode;
    return verify();
  }
  if (act === 'logout') {
    writeSession(null);
    S.left = null;
    S.email = '';
    return go('email');
  }
  if (act === 'another') return go('form');
  if (act === 'tech') {
    S.techOpen = !S.techOpen;
    return refreshTech();
  }
  if (b.classList.contains('toggle')) {
    const key = b.dataset.key;
    draft[key] = !draft[key];
    b.setAttribute('aria-checked', String(draft[key]));
    saveDraft();
    if (key === 'tech') refreshTech();
    return;
  }
  const group = b.parentElement;
  if (group?.classList.contains('seg')) {
    const key = group.dataset.key;
    draft[key] = b.dataset.val;
    saveDraft();
    const btns = [...group.children];
    group.style.setProperty('--idx', btns.indexOf(b));
    btns.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    if (key === 'kind') applyKind();
  }
}

function onInput(e) {
  const el = e.target;
  if (el.id === 'r-text') {
    draft.text = el.value;
    if (!draft.startedAt) draft.startedAt = Date.now();
    saveDraft();
    count();
  } else if (el.id === 'r-code') {
    const v = el.value.replace(/\D/g, '').slice(0, cfg.codeLength);
    if (v !== el.value) el.value = v;
    if (v.length === cfg.codeLength) verify();
  } else if (el.id === 'r-email') {
    S.email = el.value;
  }
  clearError();
}

// ------------------------------------------------------------------ abrir / cerrar
export const isOpen = () => panel.classList.contains('open');

/** Abre el panel. Si no hay nada escrito, viene elegido el juego actual (o el último jugado). */
export function open() {
  const g = hooks.gameId();
  if (g && draft.game !== g && !draft.text.trim()) {
    draft.game = g;
    saveDraft();
  }
  S.step = entryStep();
  panel.classList.toggle('in-game', hooks.isInGame());
  render();
  panel.classList.remove('open');
  void panel.offsetWidth;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  triggers.forEach((b) => b?.setAttribute('aria-expanded', 'true'));
  hooks.onToggle(true);
  focusStep();
}

export function close() {
  if (!isOpen()) return;
  stopTick();
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  triggers.forEach((b) => b?.setAttribute('aria-expanded', 'false'));
  hooks.onToggle(false);
  if (panel.contains(document.activeElement)) opener?.focus({ preventScroll: true });
}

/** Vuelve a pintar (cambio de idioma) sin perder lo escrito. */
export function rerender() {
  if (isOpen()) render();
}

export function init(h = {}) {
  hooks = { ...hooks, ...h };
  restore();
  triggers.forEach((b) =>
    b?.addEventListener('click', (e) => {
      e.stopPropagation();
      opener = b;
      isOpen() ? close() : open();
    }),
  );
  panel.addEventListener('click', onClick);
  panel.addEventListener('input', onInput);
  panel.addEventListener('change', (e) => {
    if (e.target.id !== 'r-game') return;
    draft.game = e.target.value;
    saveDraft();
    if (S.techOpen) refreshTech();
  });
  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target.dataset.form;
    if (form === 'code') sendCode();
    else if (form === 'verify') verify();
    else if (form === 'report') submit();
  });
  // Ctrl/Cmd + Enter manda el reporte desde el texto
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'r-text') {
      e.preventDefault();
      submit();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !panel.contains(e.target) && !triggers.some((b) => b?.contains(e.target))) close();
  });
}
