import { pick, t } from '../core/i18n.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function cardHtml(g, i, enter) {
  const title = esc(pick(g.title));
  const media = g.thumbnail
    ? `<img src="${esc(g.thumbnail)}" alt="" loading="lazy" decoding="async" draggable="false">`
    : `<div class="ph">${esc(title.slice(0, 2))}</div>`;
  return `<a class="card${enter}" href="#play/${esc(g.id)}" data-id="${esc(g.id)}" style="--i:${i}" aria-label="${title}">
    ${media}<div class="name"><span>${title}</span></div></a>`;
}

const soonHtml = (i, enter) => `<div class="card soon${enter}" style="--i:${i}" aria-hidden="true"><b>${t('menu.soon')}</b></div>`;

/**
 * Pinta una grilla de tarjetas. `fill` agrega espacios "pronto" hasta completar la fila
 * (se ve la estructura aunque todavía haya pocos juegos).
 */
export function render(grid, games, { fill = false, offset = 0, animate = true } = {}) {
  const enter = animate ? ' enter' : '';
  let html = games.map((g, i) => cardHtml(g, i + offset, enter)).join('');
  if (fill) {
    const cols = columns(grid);
    const min = Math.max(cols, 4);
    const pad = games.length < min ? min - games.length : (cols - (games.length % cols)) % cols;
    for (let k = 0; k < pad; k++) html += soonHtml(games.length + k + offset, enter);
  }
  grid.innerHTML = html;
  bind(grid);
  requestAnimationFrame(() => fitNames(grid));
}

const bound = new WeakSet();
function bind(grid) {
  if (bound.has(grid)) return;
  bound.add(grid);
  // Al terminar la entrada se quita la animación para que el hover use transiciones libres.
  grid.addEventListener('animationend', (e) => {
    if (e.animationName === 'card-in') e.target.classList.remove('enter');
  });
}

function columns(grid) {
  const tpl = getComputedStyle(grid).gridTemplateColumns;
  return Math.max(1, tpl.split(' ').filter(Boolean).length);
}

/** Si el nombre no entra en la tarjeta, activa el desplazamiento (marquee) con la distancia justa. */
export function fitNames(root = document) {
  root.querySelectorAll('.card .name').forEach((n) => {
    const span = n.firstElementChild;
    const pad = parseFloat(getComputedStyle(n).paddingLeft) * 2;
    const dist = span.scrollWidth - (n.clientWidth - pad);
    if (dist > 1) {
      n.classList.add('scroll');
      n.style.setProperty('--dist', `${Math.ceil(dist)}px`);
      n.style.setProperty('--dur', `${Math.max(2.2, dist / 28).toFixed(2)}s`);
    } else {
      n.classList.remove('scroll');
    }
  });
}

/** Reflejo de luz que sigue al cursor dentro de cada tarjeta (delegado, un solo listener). */
export function enableSpotlight(root) {
  let raf = 0;
  let last;
  root.addEventListener('pointermove', (e) => {
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const card = last.target.closest?.('.card:not(.soon)');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--px', `${last.clientX - r.left}px`);
      card.style.setProperty('--py', `${last.clientY - r.top}px`);
    });
  });
}
