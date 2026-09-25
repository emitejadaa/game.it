/*!
 * game.it SDK — puente entre cada juego y el portal.
 *
 * Uso mínimo dentro del index.html de un juego:
 *   <script src="/sdk/gameit.js"></script>
 *   GameIt.onPrefs((p) => aplicarTema(p.colors), true);
 *   GameIt.progress(0.5);   // opcional, alimenta la línea de la pantalla de carga
 *   GameIt.ready();         // obligatorio: oculta la pantalla de carga del portal
 *   GameIt.exit();          // vuelve al menú principal
 *
 * Anuncios (los decide el portal; si no hay anuncios todo sigue funcionando igual):
 *   GameIt.gameplay(true);  // empieza el juego activo: el portal saca cualquier anuncio
 *   GameIt.gameplay(false); // menú, pausa o fin de partida: el portal puede mostrar un banner
 *                           // en una franja propia (el juego se achica; nada queda tapado)
 *   await GameIt.commercialBreak('revancha'); // pausa natural antes de seguir (solo si está habilitado)
 *   if (await GameIt.rewardAvailable('continuar')) mostrarBoton();   // recompensa opcional…
 *   if (await GameIt.showReward()) darRecompensa();                  // …solo si el jugador la pide
 *
 * Funciona igual si el juego se abre suelto (fuera del portal): lee las preferencias
 * guardadas en este dispositivo y exit() navega a "/".
 * Los errores de JavaScript del juego se avisan solos al portal (como mucho 20 por partida):
 * si el jugador reporta un problema, se adjuntan a los datos técnicos.
 * Documentación completa: README.md → "Integrar un juego".
 */
(function () {
  'use strict';
  if (window.GameIt) return;

  var script = document.currentScript;
  var embedded = window.parent !== window;
  var parentOrigin = '*';
  var subs = { prefs: [], pause: [], resume: [] };
  var paused = false;
  var readySent = false;
  var fpsEl = null;
  var playing = null;
  var adsHost = false; // el portal avisa en 'init' si maneja anuncios
  var reqs = {};
  var reqId = 0;

  var DEFAULTS = {
    theme: 'dark',
    accent: 'cyan',
    colors: {
      bg: '#07070a', surface: '#0d0d13', fg: '#eaeaf0', mute: '#6f6f80', line: 'rgba(255,255,255,.15)', accent: '#00f0ff',
      cyan: '#00f0ff', magenta: '#ff2bd6', lime: '#b6ff00', amber: '#ffb800', violet: '#9d6bff', red: '#ff3b5c',
    },
    volume: { master: 0.8, sfx: 0.8, music: 0.48, muted: false },
    reducedMotion: false,
    glow: true,
    showFps: false,
    keys: 'both',
    touch: matchMedia('(pointer: coarse)').matches,
    lang: (navigator.language || 'es').toLowerCase().indexOf('es') === 0 ? 'es' : 'en',
  };

  function readLocal() {
    try {
      var r = JSON.parse(localStorage.getItem('gameit:prefs:resolved'));
      if (r && r.colors) return r;
    } catch (e) {}
    return DEFAULTS;
  }

  var prefs = readLocal();

  function post(type, data) {
    if (!embedded) return;
    var msg = { gameit: 1, type: type };
    if (data) for (var k in data) msg[k] = data[k];
    window.parent.postMessage(msg, parentOrigin);
  }

  function applyTheme() {
    if (script && script.hasAttribute('data-no-theme')) return;
    var root = document.documentElement;
    var c = prefs.colors;
    for (var k in c) root.style.setProperty('--gi-' + k, c[k]);
    root.dataset.giTheme = prefs.theme;
    root.dataset.giGlow = prefs.glow ? 'on' : 'off';
    root.dataset.giMotion = prefs.reducedMotion ? 'reduced' : 'full';
    root.style.colorScheme = prefs.theme;
    root.style.background = c.bg;
  }

  function setPrefs(p) {
    if (!p || !p.colors) return;
    prefs = p;
    applyTheme();
    updateFps();
    subs.prefs.forEach(function (fn) { fn(prefs); });
  }

  // ---------- contador de FPS (preferencia global "Mostrar FPS") ----------
  var frames = 0, lastT = 0, rafId = 0;
  function fpsLoop(t) {
    frames++;
    if (!lastT) lastT = t;
    if (t - lastT >= 500) {
      if (fpsEl) fpsEl.textContent = Math.round((frames * 1000) / (t - lastT)) + ' fps';
      frames = 0;
      lastT = t;
    }
    rafId = requestAnimationFrame(fpsLoop);
  }
  function updateFps() {
    if (prefs.showFps && !fpsEl && document.body) {
      fpsEl = document.createElement('div');
      fpsEl.setAttribute('aria-hidden', 'true');
      fpsEl.style.cssText =
        'position:fixed;left:10px;bottom:10px;z-index:2147483647;pointer-events:none;' +
        'font:500 11px/1 "JetBrains Mono",ui-monospace,monospace;padding:5px 7px;border-radius:6px;' +
        'background:rgba(0,0,0,.55);color:#b6ff00;letter-spacing:.04em';
      fpsEl.textContent = '-- fps';
      document.body.appendChild(fpsEl);
      lastT = 0;
      frames = 0;
      rafId = requestAnimationFrame(fpsLoop);
    } else if (!prefs.showFps && fpsEl) {
      cancelAnimationFrame(rafId);
      fpsEl.remove();
      fpsEl = null;
    }
  }

  // ---------- mensajes del portal ----------
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.gameit !== 1 || e.source !== window.parent) return;
    parentOrigin = e.origin;
    if (d.type === 'init') adsHost = !!d.ads;
    if (d.type === 'init' || d.type === 'prefs') setPrefs(d.prefs);
    else if (d.type === 'ad-result' && reqs[d.id]) {
      reqs[d.id](d.value);
      delete reqs[d.id];
    }
    else if (d.type === 'pause') setPaused(true);
    else if (d.type === 'resume') setPaused(false);
  });

  function setPaused(v) {
    if (paused === v) return;
    paused = v;
    (v ? subs.pause : subs.resume).forEach(function (fn) { fn(); });
  }

  // otra pestaña/ventana cambió las preferencias (modo suelto)
  window.addEventListener('storage', function (e) {
    if (e.key === 'gameit:prefs:resolved' && !embedded) setPrefs(readLocal());
  });

  // ---------- errores del juego: el portal los adjunta a "Reportar un problema" si el jugador quiere ----------
  var logged = 0;
  function logError(message, source, line, col, stack) {
    if (!embedded || logged >= 20) return;
    logged++;
    post('log', {
      level: 'error',
      message: String(message || '').slice(0, 300),
      source: String(source || '').slice(0, 300),
      line: +line || 0,
      col: +col || 0,
      stack: String(stack || '').slice(0, 1200),
    });
  }
  window.addEventListener('error', function (e) {
    var el = e.target;
    // con captura también llegan los archivos que no cargaron (imágenes, audio, scripts)
    if (el && el !== window && el.tagName) return logError('failed to load ' + el.tagName.toLowerCase(), el.src || el.href, 0, 0, '');
    logError(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    logError('unhandled rejection: ' + ((r && r.message) || r), '', 0, 0, r && r.stack);
  });

  // ---------- actividad (para atenuar la barra del portal cuando no se usa) ----------
  var lastAct = 0;
  function activity() {
    var n = Date.now();
    if (n - lastAct > 400) {
      lastAct = n;
      post('activity');
    }
  }
  ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, activity, { passive: true, capture: true });
  });

  /** Pedido al portal con respuesta (false si no hay portal o no contesta a tiempo). */
  function request(op, data, timeout) {
    return new Promise(function (resolve) {
      if (!embedded || !adsHost) return resolve(false);
      var id = ++reqId;
      reqs[id] = resolve;
      var msg = { op: op, id: id };
      if (data) for (var k in data) msg[k] = data[k];
      post('ad', msg);
      setTimeout(function () {
        if (reqs[id]) {
          reqs[id](false);
          delete reqs[id];
        }
      }, timeout);
    });
  }

  var DIRS = {
    arrows: { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' },
    wasd: { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' },
  };

  var api = {
    version: '1.0.0',
    embedded: embedded,
    /** Preferencias resueltas (tema, colores, volumen, movimiento, controles, idioma). */
    get prefs() { return prefs; },
    get paused() { return paused; },
    /** Suscribe a cambios de preferencias. Con `now = true` se llama también al instante. */
    onPrefs: function (fn, now) {
      subs.prefs.push(fn);
      if (now) fn(prefs);
      return function () { subs.prefs.splice(subs.prefs.indexOf(fn), 1); };
    },
    onPause: function (fn) { subs.pause.push(fn); },
    onResume: function (fn) { subs.resume.push(fn); },
    /** Progreso de carga 0..1 (opcional). */
    progress: function (p) { post('progress', { value: +p || 0 }); },
    /** El juego está listo: el portal retira la pantalla de carga. */
    ready: function () {
      if (readySent) return;
      readySent = true;
      post('ready');
    },
    /** Vuelve al menú principal. */
    exit: function () {
      if (embedded) post('exit');
      else location.href = '/';
    },
    /** Informa un error fatal de carga; el portal lo muestra y vuelve al menú. */
    error: function (message) { post('error', { message: String(message || '') }); },
    /**
     * Traduce un KeyboardEvent a 'up' | 'down' | 'left' | 'right' | null respetando la
     * preferencia de teclado (flechas, WASD o ambos).
     */
    dir: function (e) {
      var k = prefs.keys;
      return (k !== 'wasd' && DIRS.arrows[e.key]) || (k !== 'arrows' && DIRS.wasd[e.code]) || null;
    },
    /**
     * Avisa si se está jugando (true) o si el juego está en un menú, pausa o fin de partida
     * (false). Con false el portal puede mostrar un banner en una franja aparte, nunca encima.
     */
    gameplay: function (on) {
      on = !!on;
      if (playing === on) return;
      playing = on;
      post('ad', { op: 'gameplay', on: on });
    },
    gameplayStart: function () { api.gameplay(true); },
    gameplayStop: function () { api.gameplay(false); },
    /** Pausa natural (antes de una revancha o del siguiente nivel). Resuelve cuando se puede seguir. */
    commercialBreak: function (name) { return request('break', { name: String(name || 'next') }, 100000); },
    /** ¿Hay un anuncio con recompensa disponible? Mostrar la oferta solo si resuelve true. */
    rewardAvailable: function (name) { return request('reward?', { name: String(name || 'reward') }, 5000); },
    /** El jugador eligió ver el anuncio: resuelve true si lo vio y corresponde la recompensa. */
    showReward: function () { return request('reward!', null, 150000); },
    /** Elige entre textos { es, en } según el idioma de las preferencias. */
    t: function (obj) { return obj[prefs.lang] || obj.es || obj.en; },
  };

  window.GameIt = api;
  applyTheme();
  if (document.body) updateFps();
  else document.addEventListener('DOMContentLoaded', updateFps);
  post('hello', { version: api.version });
})();
