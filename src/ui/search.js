import { CATEGORIES, available, search } from '../core/registry.js';
import { t } from '../core/i18n.js';
import { render } from './cards.js';

const panel = document.getElementById('search');
const input = document.getElementById('search-input');
const chips = document.getElementById('chips');
const grid = document.getElementById('grid-search');
const empty = document.getElementById('search-empty');
const scrim = document.getElementById('scrim');
const btn = document.getElementById('btn-search');

let category = 'all';
let debounce = 0;
let onOpenChange = () => {};

export const isOpen = () => panel.classList.contains('open');

export function init({ onToggle } = {}) {
  onOpenChange = onToggle || onOpenChange;
  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  document.getElementById('search-close').addEventListener('click', close);
  scrim.addEventListener('click', close);
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(update, 90);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = grid.querySelector('.card:not(.soon)');
      if (first) first.click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      grid.querySelector('.card:not(.soon)')?.focus();
    }
  });
  chips.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    category = c.dataset.cat;
    chips.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-selected', x === c));
    update();
  });
  // navegación con flechas dentro de los resultados
  grid.addEventListener('keydown', (e) => {
    const cards = [...grid.querySelectorAll('.card:not(.soon)')];
    const i = cards.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step) {
      e.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, i + step))].focus();
    } else if (e.key === 'ArrowUp' && i === 0) {
      e.preventDefault();
      input.focus();
    }
  });
  renderChips();
}

export function renderChips() {
  const games = available();
  const count = (c) => (c === 'all' ? games.length : games.filter((g) => g.categories.includes(c)).length);
  chips.innerHTML = ['all', ...CATEGORIES]
    .map((c, i) => {
      const n = count(c);
      return `<button class="chip${n ? '' : ' none'}" role="tab" data-cat="${c}" aria-selected="${c === category}" style="--i:${i}">${t(`cat.${c}`)}<small>${n}</small></button>`;
    })
    .join('');
}

function update() {
  const results = search(input.value, category, (c) => t(`cat.${c}`));
  render(grid, results);
  empty.hidden = results.length > 0;
  if (!results.length) {
    empty.textContent =
      category !== 'all' && !input.value.trim()
        ? t('search.emptyCat', { cat: t(`cat.${category}`) })
        : t('search.empty');
  }
}

export function open() {
  if (isOpen()) return;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  btn.setAttribute('aria-expanded', 'true');
  scrim.classList.add('on');
  renderChips();
  update();
  onOpenChange(true);
  // el foco espera a que el panel empiece a bajar para no cortar la animación
  setTimeout(() => input.focus({ preventScroll: true }), 60);
}

export function close() {
  if (!isOpen()) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-expanded', 'false');
  scrim.classList.remove('on');
  onOpenChange(false);
  if (panel.contains(document.activeElement)) btn.focus({ preventScroll: true });
}
