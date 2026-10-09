/**
 * Campo para escribir un país con autocompletado (lista que se abre hacia arriba para que el teclado del celular no la tape).
 * Flechas ↑ ↓ y Enter, o tocar una sugerencia. Si el texto coincide exactamente con un país (o hay una sola sugerencia) se acepta.
 */
import { h } from '/shared/daily-ui.js';
import { findCountry, suggest, nameOf } from '/shared/countries/countries.js';

export function countryInput({ ctx, lang, placeholder, button, onSubmit, onUnknown }) {
  let items = [];
  let sel = -1;
  const input = h('input', { type: 'text', class: 'dg-ac-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'send', placeholder, 'aria-label': placeholder, role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list' });
  const list = h('div', { class: 'dg-ac-list', role: 'listbox', hidden: true });
  const send = h('button', { class: 'dg-btn', type: 'button' }, button);
  const el = h('div', { class: 'dg-ac' }, list, input, send);

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    sel = -1;
  };
  function render() {
    items = suggest(ctx, input.value, lang);
    list.replaceChildren(
      ...items.map((c, i) => {
        const b = h('button', { class: 'dg-ac-item', type: 'button', role: 'option', 'aria-selected': String(i === sel) }, nameOf(c, lang));
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault(); // que el campo no pierda el foco
          choose(c);
        });
        return b;
      }),
    );
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!list.hidden));
  }
  function choose(c) {
    input.value = '';
    close();
    onSubmit(c);
  }
  function submit() {
    const c = (sel >= 0 && items[sel]) || findCountry(ctx, input.value) || (items.length === 1 ? items[0] : null);
    if (c) return choose(c);
    if (input.value.trim()) onUnknown?.(input.value);
  }
  input.addEventListener('input', () => {
    sel = -1;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!items.length) return;
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      [...list.children].forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  send.addEventListener('click', submit);
  return {
    el,
    focus: () => input.focus({ preventScroll: true }),
    setDisabled(v) {
      input.disabled = v;
      send.disabled = v;
      el.classList.toggle('off', v);
      if (v) close();
    },
  };
}
