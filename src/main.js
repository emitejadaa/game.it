import './styles/base.css';
import './styles/menu.css';
import './styles/panels.css';

import * as prefs from './core/prefs.js';
import { setLang, t, translateDom } from './core/i18n.js';
import { available, byId, playable, dailyGames } from './core/registry.js';
import * as daily from './core/daily.js';
import * as device from './core/device.js';
import { track, recent, recommend } from './core/recent.js';
import * as loader from './ui/loader.js';
import { render, fitNames, enableSpotlight } from './ui/cards.js';
import * as search from './ui/search.js';
import * as prefsPanel from './ui/prefs-panel.js';
import * as player from './ui/player.js';
import * as ads from './ui/ads.js';
import * as gameAds from './ui/game-ads.js';

const app = document.getElementById('app');
const $ = (id) => document.getElementById(id);

// ---------- Menú ----------
/** Insignia de la tarjeta de un juego diario: "Nuevo" si hoy no se jugó, "✓ racha N" si ya está hecho. */
function dailyBadge(g) {
  const st = daily.status(g.id);
  if (!st?.done) return { text: t('menu.dailyNew'), cls: 'new' };
  return { text: `✓${st.won && st.streak > 1 ? ` ${t('menu.dailyStreak', { n: st.streak })}` : ''}`, cls: 'done' };
}

function renderMenu({ animate = true } = {}) {
  const dg = dailyGames();
  $('shelf-daily').hidden = !dg.length;
  if (dg.length) render($('grid-daily'), dg, { animate, badge: dailyBadge });
  const rec = recent(6);
  const forYou = recommend(6);
  $('shelf-recent').hidden = !rec.length;
  $('shelf-for-you').hidden = !forYou.length;
  if (rec.length) render($('grid-recent'), rec, { animate, offset: dg.length });
  if (forYou.length) render($('grid-for-you'), forYou, { animate, offset: dg.length + rec.length });
  const games = available();
  render($('grid-all'), games, { fill: true, animate, offset: dg.length + rec.length + forYou.length });
  $('count-all').textContent = games.length === 1 ? t('menu.game') : t('menu.games', { n: games.length });
  const empty = $('all-empty');
  empty.hidden = games.length > 0;
  empty.textContent = t(device.platform() === 'mobile' ? 'menu.noneMobile' : 'menu.noneDesktop');
}

function applyLang() {
  setLang(prefs.get().lang);
  translateDom();
  prefsPanel.rerender();
  search.renderChips();
  renderMenu({ animate: false });
}

// ---------- Navegación (#play/<id>) ----------
let enteredFromMenu = false;

/** Vuelve al menú mostrando un aviso en la pantalla de carga (enlace a un juego que no existe o que no corre acá). */
async function menuWithNote(text, ms) {
  history.replaceState(null, '', location.pathname + location.search);
  enteredFromMenu = false;
  if (player.isActive()) await player.close();
  await loader.show('');
  loader.setNote(text, true);
  await new Promise((r) => setTimeout(r, ms));
  renderMenu({ animate: false });
  await loader.hide(0);
  ads.show();
}

async function route() {
  const m = location.hash.match(/^#play\/([\w-]+)(\?[^#]*)?/);
  const g = m && byId(m[1].toLowerCase());
  if (location.hash.startsWith('#play/') && !g) {
    // enlace viejo, con un error de tipeo, sin id ("#play/") o a un juego oculto
    await menuWithNote(t('menu.notFound'), 1800);
  } else if (g && !playable(g)) {
    // enlace directo a un juego que no corre en este dispositivo
    await menuWithNote(t(g.platforms.includes('mobile') ? 'menu.onlyMobile' : 'menu.onlyDesktop'), 2200);
  } else if (g) {
    if (m[1] !== g.id) history.replaceState(null, '', `${location.pathname}${location.search}#play/${g.id}${m[2] || ''}`); // alias o mayúsculas → id actual
    if (player.game()?.id === g.id) return;
    search.close();
    prefsPanel.close();
    track(g.id);
    await player.launch(g, m[2] || '');
  } else if (player.isActive()) {
    prefsPanel.close();
    await player.close(() => renderMenu());
    ads.show();
  }
}

function exitGame() {
  if (enteredFromMenu) {
    enteredFromMenu = false;
    history.back();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}

addEventListener('hashchange', (e) => {
  if (/#play\//.test(location.hash) && !/#play\//.test(e.oldURL)) enteredFromMenu = true;
  route();
});

// un juego diario (iframe del mismo origen) deja su resumen en localStorage: las insignias del menú se actualizan solas
addEventListener('storage', (e) => {
  if (e.key?.startsWith('gameit:daily:') && !player.isActive()) renderMenu({ animate: false });
});
document.addEventListener('visibilitychange', () => !document.hidden && !player.isActive() && renderMenu({ animate: false }));

document.addEventListener('click', (e) => {
  const card = e.target.closest?.('.card[data-id]');
  if (!card) return;
  card.classList.add('launching');
  setTimeout(() => card.classList.remove('launching'), 600);
});

// ---------- Teclado ----------
document.addEventListener('keydown', (e) => {
  if (player.isActive()) {
    if (e.key === 'Escape' && prefsPanel.isOpen()) prefsPanel.close();
    return;
  }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    prefsPanel.close();
    search.open();
  } else if (e.key === 'Escape') {
    if (prefsPanel.isOpen()) prefsPanel.close();
    else search.close();
  }
});

// ---------- Fondo que reacciona al cursor ----------
function enableBackground() {
  if (matchMedia('(pointer: coarse)').matches) return;
  const grid = document.querySelector('.bg-grid');
  let raf = 0;
  let x = 0;
  let y = 0;
  addEventListener(
    'pointermove',
    (e) => {
      x = e.clientX;
      y = e.clientY;
      if (raf || player.isActive()) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        grid.style.setProperty('--mx', `${x}px`);
        grid.style.setProperty('--my', `${y}px`);
      });
    },
    { passive: true },
  );
}

// ---------- Arranque ----------
function preload(onStep) {
  const fontTimeout = new Promise((r) => setTimeout(r, 1800));
  const tasks = [
    Promise.race([document.fonts.ready, fontTimeout]),
    ...available()
      .slice(0, 12)
      .filter((g) => g.thumbnail)
      .map(
        (g) =>
          new Promise((r) => {
            const img = new Image();
            img.onload = img.onerror = r;
            img.src = g.thumbnail;
            setTimeout(r, 4000);
          }),
      ),
  ];
  let done = 0;
  tasks.forEach((p) => p.then(() => onStep(++done / tasks.length)));
  return Promise.all(tasks);
}

async function start() {
  prefs.init();
  setLang(prefs.get().lang);
  translateDom();
  await loader.show(t('loader.loading'));

  await preload((p) => loader.progress(p * 0.9));

  search.init({
    onToggle: (open) => open && prefsPanel.close(),
  });
  prefsPanel.init({
    onToggle: (open) => {
      if (open) search.close();
      if (player.isActive()) open ? player.pause() : player.resume();
    },
    onLangChange: applyLang,
    isInGame: player.isActive,
  });
  player.init({ onExit: exitGame });
  ads.init();
  gameAds.init();
  enableSpotlight(document.body);
  device.onChange(() => {
    renderMenu({ animate: false });
    search.renderChips();
  });
  enableBackground();

  // Al tocar el iframe de un juego la ventana pierde el foco: se cierra el popup.
  addEventListener('blur', () => player.isActive() && prefsPanel.close());

  let lastW = innerWidth;
  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (innerWidth !== lastW) renderMenu({ animate: false });
      else fitNames();
      lastW = innerWidth;
    }, 150);
  });

  app.hidden = false;
  if (/^#play\//.test(location.hash)) {
    renderMenu({ animate: false });
    app.classList.add('ready');
    await route();
    if (loader.isVisible() && !player.isActive()) await loader.hide(0); // ninguna rama de route() retiró el loader: nunca queda tapando el menú
  } else {
    await loader.hide(900, () => {
      renderMenu();
      app.classList.add('ready');
    });
    ads.show();
  }

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/** Arranque con red de seguridad: si algo falla, el loader se retira y se ve al menos el menú. */
async function boot() {
  try {
    await start();
  } catch (e) {
    console.error('[game.it] error al arrancar', e);
    app.hidden = false;
    app.classList.add('ready');
    try {
      renderMenu({ animate: false });
    } catch {}
    if (!player.isActive()) await loader.hide(0);
  }
}

boot();
