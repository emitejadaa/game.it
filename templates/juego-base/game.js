/* Plantilla de juego para game.it — "Atrapá estrellas".
 *
 * Un juego chico pero completo que muestra todo lo que el portal espera:
 *  - GameIt.ready() cuando se puede mostrar, GameIt.gameplay(true/false) al jugar / en menús,
 *  - pausa cuando el portal lo pide (onPause/onResume) o se oculta la pestaña,
 *  - idioma (GameIt.t), volumen, "reducir movimiento" y teclado flechas/WASD (GameIt.dir),
 *  - mouse, teclado y toque; canvas nítido en cualquier pantalla,
 *  - pausa para anuncio antes de la revancha (GameIt.commercialBreak),
 *  - récord guardado en localStorage con el prefijo del juego.
 * Reemplazá la lógica por la de tu juego y mantené esos puntos.
 */
const G = window.GameIt;
const ID = 'mi-juego'; // igual que la carpeta y el "id" de game.json
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- textos (español e inglés)
const TXT = {
  title: { es: 'Atrapá estrellas', en: 'Catch the stars' },
  help: { es: 'Mové la canasta con ← → , A D, el mouse o el dedo. ¡Cuidado con las bombas!', en: 'Move the basket with ← →, A D, the mouse or your finger. Watch out for bombs!' },
  play: { es: 'JUGAR', en: 'PLAY' },
  again: { es: 'OTRA VEZ', en: 'AGAIN' },
  best: { es: 'Récord: {n}', en: 'Best: {n}' },
};
const t = (k, n) => G.t(TXT[k]).replace('{n}', n);

// ---------------------------------------------------------------- guardado (siempre con try/catch)
const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`)) ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};

// ---------------------------------------------------------------- canvas nítido y adaptable
const cv = $('cv');
const g = cv.getContext('2d');
let W = 0;
let H = 0;
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- estado
const S = { on: false, paused: false, score: 0, lives: 3, x: 0.5, items: [], spawn: 0, best: load('best', 0) };
const keys = new Set();

function start() {
  Object.assign(S, { on: true, score: 0, lives: 3, x: 0.5, items: [], spawn: 0 });
  $('menu').classList.remove('on');
  G.gameplay(true); // jugando: el portal no muestra anuncios
  hud();
}
function gameOver() {
  S.on = false;
  if (S.score > S.best) save('best', (S.best = S.score));
  menu(true);
  G.gameplay(false); // fin de partida: el portal puede mostrar un banner aparte
  beep(220, 0.3);
}
function menu(again) {
  $('t-title').textContent = t('title');
  $('t-help').textContent = t('help');
  $('best').textContent = S.best ? t('best', S.best) : '';
  $('play').textContent = again ? t('again') : t('play');
  $('menu').classList.add('on');
}
$('play').onclick = async () => {
  if (S.score > 0) await G.commercialBreak('revancha'); // pausa natural para un anuncio (si hay)
  start();
};

// ---------------------------------------------------------------- controles
addEventListener('keydown', (e) => {
  keys.add(G.dir(e)); // 'left' | 'right' | 'up' | 'down' según flechas/WASD elegido en el portal
  if ((e.code === 'Enter' || e.code === 'Space') && !S.on) $('play').click();
});
addEventListener('keyup', (e) => keys.delete(G.dir(e)));
addEventListener('pointermove', (e) => S.on && (S.x = e.clientX / W));
addEventListener('pointerdown', (e) => S.on && (S.x = e.clientX / W));

// ---------------------------------------------------------------- pausa (preferencias abiertas o pestaña oculta)
G.onPause(() => (S.paused = true));
G.onResume(() => {
  S.paused = false;
  last = performance.now();
});

// ---------------------------------------------------------------- sonido (se crea con el primer toque)
let ac = null;
function beep(freq, dur) {
  const v = G.prefs.volume;
  const vol = v.muted ? 0 : v.master * v.sfx;
  if (!vol) return;
  try {
    ac ||= new AudioContext();
    const o = ac.createOscillator();
    const gn = ac.createGain();
    o.frequency.value = freq;
    gn.gain.setValueAtTime(0.15 * vol, ac.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(gn).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  } catch {}
}

// ---------------------------------------------------------------- bucle (paso de tiempo real, no por cuadro)
function hud() {
  $('score').textContent = S.score;
  $('lives').textContent = '♥'.repeat(S.lives);
}
function update(dt) {
  const dir = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  S.x = Math.min(0.97, Math.max(0.03, S.x + dir * dt * 0.9));
  S.spawn -= dt;
  if (S.spawn <= 0) {
    S.spawn = Math.max(0.25, 0.9 - S.score * 0.01);
    S.items.push({ x: 0.05 + Math.random() * 0.9, y: -0.05, v: 0.25 + Math.random() * 0.2 + S.score * 0.004, bomb: Math.random() < 0.22 });
  }
  const bx = S.x * W;
  const by = H - 70;
  for (const it of S.items) {
    it.y += it.v * dt;
    const x = it.x * W;
    const y = it.y * H;
    if (!it.done && y > by - 16 && y < by + 16 && Math.abs(x - bx) < 50) {
      it.done = true;
      if (it.bomb) {
        S.lives--;
        beep(120, 0.25);
      } else {
        S.score++;
        beep(660 + S.score * 5, 0.08);
      }
      hud();
    }
  }
  S.items = S.items.filter((it) => !it.done && it.y < 1.1);
  if (S.lives <= 0) gameOver();
}
function draw(now) {
  g.fillStyle = getComputedStyle(document.body).backgroundColor;
  g.fillRect(0, 0, W, H);
  const still = G.prefs.reducedMotion; // sin brillos que titilan si el jugador pidió menos movimiento
  for (const it of S.items) {
    const x = it.x * W;
    const y = it.y * H;
    g.font = '28px system-ui';
    g.textAlign = 'center';
    g.globalAlpha = it.bomb || still ? 1 : 0.8 + 0.2 * Math.sin(now / 120 + x);
    g.fillText(it.bomb ? '💣' : '⭐', x, y);
  }
  g.globalAlpha = 1;
  g.fillStyle = getComputedStyle(document.body).getPropertyValue('--gi-accent') || '#ffd23f';
  g.beginPath();
  g.roundRect(S.x * W - 45, H - 80, 90, 22, 10);
  g.fill();
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.on && !S.paused && !G.paused) update(dt);
  draw(now);
}

// ---------------------------------------------------------------- arranque
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  if (!S.on) menu(S.score > 0);
}, true);
hud();
requestAnimationFrame(frame);
G.gameplay(false);
G.ready(); // listo: el portal saca su pantalla de carga
