/**
 * Anuncios dentro de los juegos, manejados desde el portal (los juegos solo avisan en qué momento
 * están, vía el SDK). De menos a más invasivo:
 *
 *  1. Banner en pausas, menús y fin de partida, solo en computadora: va en una columna al costado,
 *     a 150 px del juego (lo que recomienda AdSense para páginas con juegos) y el juego se achica a
 *     lo ancho, así nunca tapa nada. Aparece con demora (las pausas cortas no cambian nada), como
 *     mucho uno nuevo por minuto, se puede ocultar y se quita al volver a jugar. En celulares y
 *     tablets no hay banners dentro de los juegos: con el dedo es fácil tocarlos sin querer.
 *  2. Con recompensa (H5 Games Ads): solo si el jugador elige verlo a cambio de algo.
 *  3. Pantalla completa entre partidas (H5 Games Ads): apagado por defecto.
 *
 * Con ?ads=preview se simulan los tres sin pedir anuncios a Google.
 */
import cfg from '../ads.config.js';
import * as prefs from '../core/prefs.js';
import { t } from '../core/i18n.js';
import { platform } from '../core/device.js';

const G = { banners: true, bannerGapSec: 60, bannerDelayMs: 1200, rewarded: true, interstitials: false, interstitialGapSec: 240, firstInterstitialSec: 180, ...(cfg.games || {}) };
const preview = new URLSearchParams(location.search).get('ads') === 'preview';
const HIDE_KEY = 'gameit:ads:hidden:games';

const player = document.getElementById('player');
const strip = document.getElementById('game-ad');
const body = strip.querySelector('.ga-body');

let send = () => {};
let pauseGame = () => {};
let active = false;
let inBreak = false;
let showTimer = 0;
let shown = null; // tamaño del banner a la vista
let lastBannerAt = -Infinity;
let lastInterstitialAt = -Infinity;
const pageStart = performance.now();
let heldReward = null;
let busy = false; // hay un anuncio de pantalla completa en curso

/** adBreak() y adConfig() de la Ad Placement API: los dos se encolan en adsbygoogle. */
const h5 = (o) => (window.adsbygoogle = window.adsbygoogle || []).push(o);
const h5Enabled = () => cfg.enabled && !!cfg.client && (G.rewarded || G.interstitials);

const dismissed = () => {
  try {
    const at = Number(localStorage.getItem(HIDE_KEY));
    return at > 0 && Date.now() - at < cfg.dismissHours * 3600e3;
  } catch {
    return false;
  }
};

// ------------------------------------------------------------------ banner en pausas (solo computadora)
const GAP = 150; // px vacíos entre el juego y el anuncio
const EDGE = 20; // margen del lado de afuera

/** Tamaño del banner al costado, o null si no hay lugar sin dejar el juego apretado. */
function railSize() {
  if (platform() !== 'desktop') return null;
  const room = (w) => innerWidth - (GAP + w + EDGE); // ancho que le queda al juego
  if (room(300) >= 780 && innerHeight >= 400) return [300, 250];
  if (room(160) >= 760 && innerHeight >= 780) return [160, 600];
  return null;
}

const bannerAllowed = () =>
  cfg.enabled && G.banners !== false && (preview || (cfg.client && cfg.slots?.gameBreak)) && !dismissed() && performance.now() - lastBannerAt >= G.bannerGapSec * 1000 && !!railSize();

/** Abre la columna (el juego se achica) justo antes de pedir el anuncio: el anuncio carga en un lugar ya reservado. */
function reserve([w, h]) {
  strip.hidden = false;
  strip.classList.remove('on');
  body.innerHTML = '';
  body.style.width = `${w}px`;
  body.style.height = `${h}px`;
  player.style.setProperty('--ga-w', `${GAP + w + EDGE}px`);
  player.classList.add('ad-space');
}

function fill() {
  const size = railSize();
  if (!inBreak || !active || busy || !size) return;
  reserve(size);
  shown = size;
  lastBannerAt = performance.now();
  const [w, h] = size;
  if (preview) {
    body.innerHTML = `<div class="ad-preview" style="width:${w}px;height:${h}px"><span>${w}×${h}</span></div>`;
  } else {
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.cssText = `display:inline-block;width:${w}px;height:${h}px`;
    ins.dataset.adClient = cfg.client;
    ins.dataset.adSlot = cfg.slots.gameBreak;
    body.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }
  strip.classList.add('on');
}

function hideBanner() {
  clearTimeout(showTimer);
  showTimer = 0;
  shown = null;
  body.innerHTML = ''; // el anuncio se destruye: nunca queda oculto detrás del juego
  strip.classList.remove('on');
  strip.hidden = true;
  player.classList.remove('ad-space');
}

function gameplay(on) {
  inBreak = !on;
  if (on) return hideBanner();
  if (busy || showTimer || !strip.hidden || !bannerAllowed()) return;
  showTimer = setTimeout(() => {
    showTimer = 0;
    fill();
  }, G.bannerDelayMs);
}

// si la ventana se achica y el banner ya no entra (o cambia el tamaño que corresponde), se quita
addEventListener('resize', () => {
  if (!shown) return;
  const size = railSize();
  if (!size || size[0] !== shown[0]) hideBanner();
});

strip.querySelector('.ga-close').addEventListener('click', () => {
  try {
    localStorage.setItem(HIDE_KEY, String(Date.now()));
  } catch {}
  hideBanner();
});

/** Terminó un anuncio de pantalla completa: sin banner enseguida. */
function adOver() {
  busy = false;
  lastBannerAt = performance.now();
}

// ------------------------------------------------------------------ vista previa de pantalla completa
function fakeAd(kind) {
  return new Promise((resolve) => {
    busy = true;
    hideBanner();
    pauseGame(true);
    const el = document.createElement('div');
    el.className = 'fake-ad';
    const secs = kind === 'reward' ? 5 : 3;
    el.innerHTML = `<div><small>${t('ads.label')} · vista previa</small><b>${kind === 'reward' ? 'Anuncio con recompensa' : 'Anuncio entre partidas'}</b><button type="button" disabled>${secs}</button></div>`;
    player.appendChild(el);
    const btn = el.querySelector('button');
    let n = secs;
    const iv = setInterval(() => {
      n--;
      if (n > 0) btn.textContent = n;
      else {
        clearInterval(iv);
        btn.disabled = false;
        btn.textContent = kind === 'reward' ? '✓ recompensa' : '✕';
      }
    }, 1000);
    btn.onclick = () => {
      el.remove();
      adOver();
      pauseGame(false);
      resolve(true);
    };
  });
}

// ------------------------------------------------------------------ pantalla completa (apagado por defecto)
function commercialBreak(name) {
  const now = performance.now();
  if (!cfg.enabled || !G.interstitials) return Promise.resolve(false);
  if (now - pageStart < G.firstInterstitialSec * 1000 || now - lastInterstitialAt < G.interstitialGapSec * 1000) return Promise.resolve(false);
  if (preview) {
    lastInterstitialAt = now;
    return fakeAd('interstitial');
  }
  if (!h5Enabled()) return Promise.resolve(false);
  return new Promise((resolve) => {
    let started = false;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(t1);
      clearTimeout(t2);
      if (started) {
        adOver();
        pauseGame(false);
      }
      resolve(v);
    };
    // sin respuesta rápida (bloqueador, sin aprobación, sin anuncio): se sigue jugando
    const t1 = setTimeout(() => !started && finish(false), 2500);
    const t2 = setTimeout(() => finish(false), 90000);
    h5({
      type: 'next',
      name,
      beforeAd() {
        started = true;
        busy = true;
        lastInterstitialAt = performance.now();
        hideBanner();
        pauseGame(true);
      },
      adBreakDone: () => finish(started),
    });
  });
}

// ------------------------------------------------------------------ con recompensa (opcional)
function rewardAvailable(name) {
  heldReward = null;
  if (!cfg.enabled || !G.rewarded) return Promise.resolve(false);
  if (preview) {
    heldReward = { preview: true };
    return Promise.resolve(true);
  }
  if (!h5Enabled()) return Promise.resolve(false);
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => answer(false), 3000);
    const r = { show: null, done: null, viewed: false };
    h5({
      type: 'reward',
      name,
      beforeReward(showAdFn) {
        r.show = showAdFn;
        heldReward = r;
        answer(true);
      },
      beforeAd: () => {
        busy = true;
        hideBanner();
        pauseGame(true);
      },
      afterAd: () => {
        adOver();
        pauseGame(false);
      },
      adViewed: () => (r.viewed = true),
      adDismissed: () => (r.viewed = false),
      adBreakDone() {
        answer(false);
        r.done?.(r.viewed);
        if (heldReward === r) heldReward = null;
      },
    });
  });
}

function showReward() {
  const r = heldReward;
  heldReward = null;
  if (!r) return Promise.resolve(false);
  if (r.preview) return fakeAd('reward');
  return new Promise((resolve) => {
    r.done = resolve;
    try {
      r.show(); // viene de un clic del jugador dentro del juego
    } catch {
      resolve(false);
    }
  });
}

// ------------------------------------------------------------------ puente con el reproductor
/** Un juego empezó: `sendFn(type, data)` le habla al juego; `pauseFn(bool)` lo pausa/reanuda. */
export function attach(sendFn, pauseFn) {
  send = sendFn;
  pauseGame = pauseFn;
  active = true;
  inBreak = false;
  heldReward = null;
}

export function detach() {
  active = false;
  busy = false;
  inBreak = false;
  heldReward = null;
  hideBanner();
  send = () => {};
}

export async function message(d) {
  if (!active) return;
  const reply = (value) => send('ad-result', { id: d.id, value });
  switch (d.op) {
    case 'gameplay':
      return gameplay(!!d.on);
    case 'break':
      return reply(await commercialBreak(String(d.name || 'next').slice(0, 40)));
    case 'reward?':
      return reply(await rewardAvailable(String(d.name || 'reward').slice(0, 40)));
    case 'reward!':
      return reply(await showReward());
  }
}

export function init() {
  if (!h5Enabled() || preview) return;
  const sound = () => (prefs.resolved().volume.master > 0 ? 'on' : 'off');
  h5({ preloadAdBreaks: 'on', sound: sound() });
  prefs.subscribe(() => h5({ sound: sound() }));
}
