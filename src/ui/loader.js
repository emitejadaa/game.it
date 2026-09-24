/**
 * Pantalla de carga general (L1: letras que suben + línea de progreso).
 * La usan tanto el arranque del menú como la carga de cada juego.
 */
const el = document.getElementById('loader');
const word = el.querySelector('.loader-word');
const bar = el.querySelector('.loader-bar i');
const note = el.querySelector('.loader-note');

word.innerHTML = [...'game.it']
  .map((c, i) => `<span style="--i:${i}"${i >= 4 ? ' class="acc"' : ''}>${c}</span>`)
  .join('');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = () => document.documentElement.dataset.motion === 'reduced';
const INTRO = 700; // lo que tardan las letras en entrar
const OUTRO = 520;

let shownAt = 0;

export function progress(p) {
  bar.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
}

export function setNote(text, isError = false) {
  note.textContent = text || '';
  note.classList.toggle('error', isError);
}

/** Muestra el loader y resuelve cuando la pantalla ya está cubierta. */
export async function show(text = '') {
  setNote(text);
  progress(0);
  el.classList.remove('out', 'in');
  el.classList.add('show');
  void el.offsetWidth; // reinicia las transiciones
  el.classList.add('in');
  shownAt = performance.now();
  await wait(reduced() ? 0 : 240);
}

/** Termina la barra, espera a que la intro se vea completa y retira el loader. */
export async function hide(minVisible = INTRO, onReveal) {
  progress(1);
  const elapsed = performance.now() - shownAt;
  if (!reduced()) await wait(Math.max(260, minVisible - elapsed));
  el.classList.add('out');
  if (!reduced()) await wait(OUTRO * 0.55);
  el.classList.remove('show');
  onReveal?.();
  if (!reduced()) await wait(OUTRO * 0.45);
  el.classList.remove('in', 'out');
}

export const isVisible = () => el.classList.contains('show');
