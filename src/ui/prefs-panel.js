import * as prefs from '../core/prefs.js';
import { t } from '../core/i18n.js';

const panel = document.getElementById('prefs');
const triggers = [document.getElementById('btn-prefs'), document.getElementById('btn-player-prefs')];

let onOpenChange = () => {};
let inGame = () => false;
export const isOpen = () => panel.classList.contains('open');

const seg = (key, options) => {
  const v = prefs.get()[key];
  const idx = Math.max(0, options.findIndex((o) => o[0] === v));
  return `<div class="seg" role="radiogroup" data-key="${key}" style="--n:${options.length};--idx:${idx}">${options
    .map(([val, label]) => `<button role="radio" data-val="${val}" aria-checked="${val === v}">${label}</button>`)
    .join('')}</div>`;
};

const toggle = (key) =>
  `<button class="toggle" role="switch" data-key="${key}" aria-checked="${prefs.get()[key]}" aria-label="${key}"></button>`;

const range = (key) => {
  const v = Math.round(prefs.get()[key] * 100);
  return `<div class="range"><input type="range" min="0" max="100" step="1" value="${v}" data-key="${key}" style="--v:${v}%" aria-label="${t(`prefs.${key}`)}"><output>${v}</output></div>`;
};

function html() {
  const p = prefs.get();
  let i = 0;
  const group = (title, rows) => `<div class="pgroup" style="--i:${i++}"><h3>${title}</h3>${rows}</div>`;
  return `
  <div class="prefs-head"><h2>${t('prefs.title')}</h2><small id="prefs-saved"><i></i>${t('prefs.saved')}</small></div>
  ${group(
    t('prefs.appearance'),
    `<div class="prow"><span>${t('prefs.theme')}</span>${seg('theme', [
      ['system', t('prefs.theme.system')],
      ['dark', t('prefs.theme.dark')],
      ['light', t('prefs.theme.light')],
    ])}</div>
    <div class="prow"><span>${t('prefs.accent')}</span><div class="swatches" role="radiogroup">${prefs.ACCENTS.map(
      (a) =>
        `<button class="swatch" role="radio" data-accent="${a}" aria-label="${a}" aria-checked="${a === p.accent}" style="--c:var(--c-${a})"></button>`,
    ).join('')}</div></div>`,
  )}
  ${group(
    t('prefs.sound'),
    `<div class="prow"><span>${t('prefs.muted')}</span>${toggle('muted')}</div>
    <div class="prow"><span>${t('prefs.volume')}</span>${range('volume')}</div>
    <div class="prow"><span>${t('prefs.sfx')}</span>${range('sfx')}</div>
    <div class="prow"><span>${t('prefs.music')}</span>${range('music')}</div>`,
  )}
  ${group(
    t('prefs.performance'),
    `<div class="prow"><span>${t('prefs.motion')}</span>${seg('reducedMotion', [
      ['system', t('prefs.motion.system')],
      ['on', t('prefs.motion.on')],
      ['off', t('prefs.motion.off')],
    ])}</div>
    <div class="prow"><span>${t('prefs.glow')}<small class="hint">${t('prefs.glowHint')}</small></span>${toggle('glow')}</div>
    <div class="prow"><span>${t('prefs.fps')}</span>${toggle('showFps')}</div>`,
  )}
  ${group(
    t('prefs.controls'),
    `<div class="prow"><span>${t('prefs.keys')}</span>${seg('keys', [
      ['both', t('prefs.keys.both')],
      ['arrows', t('prefs.keys.arrows')],
      ['wasd', t('prefs.keys.wasd')],
    ])}</div>
    <div class="prow"><span>${t('prefs.touch')}</span>${seg('touch', [
      ['auto', t('prefs.touch.auto')],
      ['on', t('prefs.touch.on')],
      ['off', t('prefs.touch.off')],
    ])}</div>
    <div class="prow"><span>${t('prefs.lang')}</span>${seg('lang', [
      ['es', 'ES'],
      ['en', 'EN'],
    ])}</div>`,
  )}
  <div class="prefs-foot"><button class="text-btn" data-action="reset">↺ ${t('prefs.reset')}</button></div>`;
}

export function rerender() {
  const scroll = panel.scrollTop;
  panel.innerHTML = html();
  panel.scrollTop = scroll;
}

function flashSaved() {
  const s = panel.querySelector('#prefs-saved');
  if (!s) return;
  s.classList.remove('flash');
  void s.offsetWidth;
  s.classList.add('flash');
}

/** Actualiza solo los controles (sin volver a pintar el panel, así las transiciones se ven). */
function sync() {
  const p = prefs.get();
  panel.querySelectorAll('.seg').forEach((s) => {
    const btns = [...s.children];
    const idx = btns.findIndex((b) => b.dataset.val === String(p[s.dataset.key]));
    s.style.setProperty('--idx', Math.max(0, idx));
    btns.forEach((b, i) => b.setAttribute('aria-checked', i === idx));
  });
  panel.querySelectorAll('.toggle').forEach((b) => b.setAttribute('aria-checked', p[b.dataset.key]));
  panel.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-checked', b.dataset.accent === p.accent));
  panel.querySelectorAll('.range input').forEach((r) => {
    const v = Math.round(p[r.dataset.key] * 100);
    if (+r.value !== v) r.value = v;
    r.style.setProperty('--v', `${v}%`);
    r.nextElementSibling.value = v;
    r.disabled = p.muted;
  });
}

export function init({ onToggle, onLangChange, isInGame } = {}) {
  onOpenChange = onToggle || onOpenChange;
  inGame = isInGame || inGame;
  rerender();
  sync();

  triggers.forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen() ? close() : open();
    }),
  );

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.action === 'reset') {
      const lang = prefs.get().lang;
      prefs.reset();
      if (prefs.get().lang !== lang) onLangChange?.();
      sync();
    } else if (b.classList.contains('toggle')) {
      prefs.set({ [b.dataset.key]: !prefs.get()[b.dataset.key] });
    } else if (b.classList.contains('swatch')) {
      prefs.set({ accent: b.dataset.accent });
    } else if (b.parentElement.classList.contains('seg')) {
      const key = b.parentElement.dataset.key;
      prefs.set({ [key]: b.dataset.val });
      if (key === 'lang') {
        sync();
        return void setTimeout(() => onLangChange?.(), 280); // deja terminar el deslizamiento
      }
    } else return;
    sync();
    flashSaved();
  });

  panel.addEventListener('input', (e) => {
    const r = e.target;
    if (!r.matches('.range input')) return;
    prefs.set({ [r.dataset.key]: r.value / 100 });
    sync();
  });
  panel.addEventListener('change', flashSaved);

  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !panel.contains(e.target) && !triggers.some((b) => b.contains(e.target))) close();
  });
}

export function open() {
  panel.classList.toggle('in-game', inGame());
  sync();
  panel.classList.remove('open');
  void panel.offsetWidth; // reinicia la animación escalonada de los grupos
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  triggers.forEach((b) => b.setAttribute('aria-expanded', 'true'));
  onOpenChange(true);
}

export function close() {
  if (!isOpen()) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  triggers.forEach((b) => b.setAttribute('aria-expanded', 'false'));
  onOpenChange(false);
}
