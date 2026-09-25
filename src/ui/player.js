/**
 * Reproductor: carga cada juego en un iframe aislado (cualquier tecnología: canvas, WebGL,
 * Phaser, Unity, Godot, React…), le pasa las preferencias globales vía SDK y controla
 * la pantalla de carga y el botón de salir.
 */
import * as loader from './loader.js';
import * as prefs from '../core/prefs.js';
import { pick, t } from '../core/i18n.js';
import * as gameAds from './game-ads.js';
import * as diagnostics from '../core/diagnostics.js';

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
let hooks = { onExit: () => {}, canResume: () => true };

export const isActive = () => !!current;
export const game = () => current;

function send(type, data = {}) {
  frame?.contentWindow?.postMessage({ gameit: 1, type, ...data }, origin);
}

export const pause = () => send('pause');
export const resume = () => send('resume');

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
    case 'log':
      diagnostics.record(current.id, d); // errores del juego, para adjuntar a un reporte
      break;
  }
}

export function init(h) {
  hooks = { ...hooks, ...h };
  addEventListener('message', onMessage);
  document.getElementById('btn-exit').addEventListener('click', () => hooks.onExit());
  bar.addEventListener('pointermove', markActive);
  prefs.subscribe((_, r) => send('prefs', { prefs: r }));
  document.addEventListener('visibilitychange', () => current && (document.hidden ? pause() : hooks.canResume() && resume()));
}

/** Abre un juego. Resuelve cuando ya se ve (la pantalla de carga se retiró). */
export async function launch(g, query = '') {
  if (current) teardown();
  current = g;
  creep = 0;
  await loader.show(t('loader.game', { name: pick(g.title) }));

  origin = new URL(g.entry, location.href).origin;
  gameAds.attach(send, (on) => (on ? pause() : resume()));
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
  await loader.show('');
  teardown();
  await loader.hide(420, onReveal);
}
