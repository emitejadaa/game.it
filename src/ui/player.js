/**
 * Reproductor: carga cada juego en un iframe aislado (cualquier tecnología: canvas, WebGL,
 * Phaser, Unity, Godot, React…), le pasa las preferencias globales vía SDK y controla
 * la pantalla de carga y el botón de salir.
 */
import * as loader from './loader.js';
import * as prefs from '../core/prefs.js';
import { pick, t } from '../core/i18n.js';
import * as gameAds from './game-ads.js';

const player = document.getElementById('player');
const stage = document.getElementById('player-stage');
const bar = player.querySelector('.player-bar');

const READY_TIMEOUT = 20000;
const IDLE_AFTER = 2600;

let frame = null;
let current = null;
let origin = '';
let idleTimer = 0;
let pendingReady = null;
let creep = 0;
let hooks = { onExit: () => {} };

export const isActive = () => !!current;
export const game = () => current;

function send(type, data = {}) {
  frame?.contentWindow?.postMessage({ gameit: 1, type, ...data }, origin);
}

// Razones por las que el juego está en pausa ('prefs', 'hidden', 'ad', 'report'…). Cada una avisa por su cuenta:
// el juego se pausa al entrar la primera y se reanuda recién cuando se soltó la última, así nadie
// reanuda un juego que otra cosa sigue necesitando quieto (p. ej. al volver a la pestaña con un panel abierto).
const holds = new Set();

export function hold(reason) {
  const was = holds.size;
  holds.add(reason);
  if (!was) send('pause');
}

export function release(reason) {
  if (holds.delete(reason) && !holds.size) send('resume');
}

export const isHeld = () => holds.size > 0;
/** Pausa/reanuda "a mano" (razón 'manual'): para quien no necesita su propia razón. */
export const pause = () => hold('manual');
export const resume = () => release('manual');

function markActive() {
  player.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => player.classList.add('idle'), IDLE_AFTER);
}

function onMessage(e) {
  if (!frame || e.source !== frame.contentWindow) return;
  if (origin !== '*' && e.origin !== origin) return;
  const d = e.data;
  if (!d || d.gameit !== 1) return;
  switch (d.type) {
    case 'hello':
      send('init', { prefs: prefs.resolved(), game: { id: current.id }, ads: 1 });
      if (holds.size) send('pause'); // el pedido de pausa llegó antes de que el juego escuchara
      break;
    case 'progress':
      creep = Math.max(creep, Math.min(0.98, +d.value || 0));
      loader.progress(creep);
      break;
    case 'ready':
      pendingReady?.(true);
      break;
    case 'error':
      pendingReady?.(false, d.message);
      break;
    case 'activity':
      markActive();
      break;
    case 'exit':
      hooks.onExit();
      break;
    case 'ad':
      gameAds.message(d);
      break;
  }
}

export function init(h) {
  hooks = { ...hooks, ...h };
  addEventListener('message', onMessage);
  document.getElementById('btn-exit').addEventListener('click', () => hooks.onExit());
  bar.addEventListener('pointermove', markActive);
  prefs.subscribe((_, r) => send('prefs', { prefs: r }));
  document.addEventListener('visibilitychange', () => (document.hidden ? hold('hidden') : release('hidden')));
}

/** Abre un juego. Resuelve cuando ya se ve (la pantalla de carga se retiró). */
export async function launch(g, query = '') {
  if (current) teardown();
  current = g;
  creep = 0;
  await loader.show(t('loader.game', { name: pick(g.title) }));

  origin = new URL(g.entry, location.href).origin;
  gameAds.attach(send, (on) => (on ? hold('ad') : release('ad')));
  frame = document.createElement('iframe');
  frame.title = pick(g.title);
  frame.allow = 'autoplay; fullscreen; gamepad; clipboard-write; screen-wake-lock';
  frame.setAttribute('allowfullscreen', '');

  const result = new Promise((resolve) => {
    let done = false;
    const finish = (ok, msg) => {
      if (done) return;
      done = true;
      clearInterval(tick);
      clearTimeout(timeout);
      pendingReady = null;
      resolve({ ok, msg });
    };
    pendingReady = finish;
    // progreso "estimado" mientras el juego no informa el suyo
    const tick = setInterval(() => {
      creep += (0.85 - creep) * 0.06;
      loader.progress(creep);
    }, 120);
    const timeout = setTimeout(() => finish(true), READY_TIMEOUT);
    frame.addEventListener('load', () => !g.sdk && finish(true), { once: true });
    frame.addEventListener('error', () => finish(false), { once: true });
  });

  frame.src = g.entry + query.replace(/[^\w?=&%-]/g, '');
  stage.appendChild(frame);
  player.classList.add('active');
  player.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const { ok, msg } = await result;
  if (current !== g) return; // salió mientras cargaba
  if (!ok) {
    loader.setNote(msg || t('player.error'), true);
    await new Promise((r) => setTimeout(r, 1600));
    return hooks.onExit();
  }
  await loader.hide();
  markActive();
  frame?.focus();
}

function teardown() {
  holds.clear();
  gameAds.detach();
  pendingReady?.(false);
  frame?.remove(); // libera memoria, audio y WebGL del juego anterior
  frame = null;
  current = null;
  clearTimeout(idleTimer);
  player.classList.remove('active', 'idle');
  player.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/** Cierra el juego pasando por la pantalla de carga. */
export async function close(onReveal) {
  if (!current) return;
  send('leave'); // el juego avisa al servidor que se va (si no, el anfitrión queda de "fantasma" hasta que vence la gracia de reconexión)
  await new Promise((r) => setTimeout(r, 80));
  await loader.show('');
  teardown();
  await loader.hide(420, onReveal);
}
