/* Fuego y Agua — game.it
 * Plataformas de a dos en un templo: Llama (fuego) y Gota (agua) tienen que llegar cada uno a su puerta. La lava
 * apaga a Gota, el agua apaga a Llama y el barro verde, a los dos. Botones que hay que mantener apretados, palancas,
 * plataformas, cajas, gemas de cada color y una nota (A, B o C) por tiempo y gemas. En la computadora Llama va con
 * las flechas y Gota con W A D (los dos a la vez, como en el original); en el celular se juega de a uno cambiando de
 * personaje o de a dos en la misma pantalla.
 * Simulación en shared/sim.js, niveles en shared/levels.js, piloto (pruebas y demo) en shared/pilot.js.
 */
import { load, step, DT, grade, gemsGot } from './shared/sim.js';
import { LEVELS } from './shared/levels.js';
import { SOLUTIONS } from './shared/solutions.js';
import { pilot } from './shared/pilot.js';
import * as Rn from './render.js';
import { tone, noise, notes } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'fuegoyagua';
const TOP = 56;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

const TXT = {
  fire: { es: 'Fuego', en: 'Fire' },
  and: { es: 'y', en: '&' },
  water: { es: 'Agua', en: 'Water' },
  tagline: { es: 'Llama y Gota, cada uno a su puerta: el fuego no toca el agua ni el agua el fuego', en: 'Flame and Drop, each to their own door: fire avoids water and water avoids fire' },
  play: { es: 'Jugar', en: 'Play' },
  playSub: { es: 'sigue: {n}', en: 'next: {n}' },
  levels: { es: 'Niveles', en: 'Levels' },
  mode1: { es: '1 jugador', en: '1 player' },
  mode2: { es: '2 jugadores', en: '2 players' },
  how: { es: 'Cómo se juega', en: 'How to play' },
  back: { es: '← volver', en: '← back' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  restart: { es: 'Reiniciar', en: 'Restart' },
  won: { es: '¡Templo superado!', en: 'Temple cleared!' },
  next: { es: 'Siguiente', en: 'Next' },
  again: { es: 'Otra vez', en: 'Again' },
  retry: { es: 'Reintentar', en: 'Retry' },
  time: { es: 'Tiempo', en: 'Time' },
  par: { es: 'para la A: {t}', en: 'for an A: {t}' },
  gemsL: { es: 'Gemas', en: 'Gems' },
  best: { es: 'Tu mejor', en: 'Your best' },
  lvN: { es: 'Nivel {n}', en: 'Level {n}' },
  allDone: { es: '¡Terminaste todos los templos!', en: 'You cleared every temple!' },
  deadF: { es: '¡Llama se apagó!', en: 'Flame went out!' },
  deadW: { es: '¡Gota se evaporó!', en: 'Drop evaporated!' },
  deadGoo: { es: 'El barro verde apaga a los dos.', en: 'Green mud puts out both of them.' },
  deadWater: { es: 'El fuego no puede tocar el agua.', en: 'Fire can’t touch water.' },
  deadLava: { es: 'El agua no puede tocar la lava.', en: 'Water can’t touch lava.' },
  h1: { es: 'Llama (fuego) se mueve con ← → y salta con ↑. Gota (agua) con A D y salta con W. Se juegan a la vez.', en: 'Flame (fire) moves with ← → and jumps with ↑. Drop (water) uses A D and jumps with W. Both play at once.' },
  h1t: { es: 'Con «1 jugador» manejás a uno por vez y cambiás con el botón de la cara. Con «2 jugadores» cada uno usa su lado de la pantalla.', en: 'With "1 player" you control one at a time and switch with the face button. With "2 players" each uses their side of the screen.' },
  h2: { es: 'Llama camina sobre la lava y Gota sobre el agua; el barro verde apaga a los dos.', en: 'Flame walks on lava and Drop on water; green mud puts out both.' },
  h3: { es: 'Los botones mueven plataformas mientras alguien (o una caja) está arriba. Las palancas se empujan caminando contra ellas.', en: 'Buttons move platforms while someone (or a box) stands on them. Levers are pushed by walking into them.' },
  h4: { es: 'Juntá las gemas de tu color y llegá cada uno a su puerta: rápido y con todas es una A.', en: 'Collect gems of your color and get each to their door: fast and with all of them is an A.' },
  h5: { es: 'R reinicia el nivel; Esc pausa.', en: 'R restarts the level; Esc pauses.' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- guardado
const load_ = (k, d) => {
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
const best = load_('best', {});
let mode = load_('mode', G.prefs.touch ? 'one' : 'keys');
const opened = (i) => i === 0 || !!best[LEVELS[i - 1].id];
const nextLevel = () => {
  const i = LEVELS.findIndex((l) => !best[l.id]);
  return i < 0 ? 0 : i;
};

// ---------------------------------------------------------------- estado
const cv = $('c');
const g = cv.getContext('2d');
let Wd = 0, Hd = 0, dpr = 1;
const S = { screen: 'home', lvI: 0, W: null, demo: null, pilot: null, acc: 0, active: 'F', paused: false, endT: 0, ts: 24, cam: { x: 0, y: 0 }, layer: null, layerTs: 0, parts: [] };

function resize() {
  Wd = innerWidth;
  Hd = innerHeight;
  dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(Wd * dpr);
  cv.height = Math.round(Hd * dpr);
  S.layer = null;
}
addEventListener('resize', resize);
resize();

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === `s-${id}`);
  const playing = !id;
  $('hud').hidden = S.screen !== 'play';
  $('pad').hidden = !(S.screen === 'play' && playing && mode !== 'keys' && G.prefs.touch);
  G.gameplay(S.screen === 'play' && playing);
}

function translate() {
  document.documentElement.lang = G.prefs.lang;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  const n = nextLevel();
  $('b-play-sub').textContent = t('playSub', { n: G.t(LEVELS[n].name) });
  $('touch-mode').hidden = !G.prefs.touch;
  for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('sel', b.dataset.mode === mode);
  const pad = $('pad');
  pad.classList.toggle('one', mode === 'one');
  pad.classList.toggle('two', mode === 'two');
  const how = $('how');
  how.innerHTML = '';
  for (const k of ['h1', ...(G.prefs.touch ? ['h1t'] : []), 'h2', 'h3', 'h4', 'h5']) {
    const li = document.createElement('li');
    li.textContent = t(k);
    how.appendChild(li);
  }
}

function levelsScreen() {
  const grid = $('lv-grid');
  grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'lv' + (opened(i) ? '' : ' locked');
    const bs = best[lv.id];
    b.innerHTML = '<span class="n"></span><b></b><small></small><span class="gr"></span>';
    b.querySelector('.n').textContent = t('lvN', { n: i + 1 });
    b.querySelector('b').textContent = G.t(lv.name);
    b.querySelector('small').textContent = bs ? `${fmtT(bs.time)} · ${bs.gems}/${bs.of}` : '';
    b.querySelector('.gr').textContent = bs ? bs.grade : '';
    b.disabled = !opened(i);
    b.onclick = () => start(i);
    grid.appendChild(b);
  });
  S.screen = 'levels';
  show('levels');
}

// ---------------------------------------------------------------- partida
function start(i) {
  S.lvI = i;
  S.W = load(LEVELS[i]);
  S.acc = 0;
  S.paused = false;
  S.endT = 0;
  S.parts = [];
  S.layer = null;
  S.active = 'F';
  S.screen = 'play';
  $('h-name').textContent = G.t(LEVELS[i].name);
  show(null);
  drawSwap();
  hud();
  snapCam();
}
function restart() {
  if (S.screen === 'play') start(S.lvI);
}
function pause() {
  if (S.screen !== 'play' || S.W.won || S.W.dead) return;
  S.paused = true;
  show('pause');
}
function resume() {
  S.paused = false;
  show(null);
  last = performance.now();
}
function win() {
  const lv = LEVELS[S.lvI];
  const W = S.W;
  const gr = grade(W, lv.par);
  const rec = { grade: gr, time: W.time, gems: gemsGot(W), of: W.gems.length };
  const old = best[lv.id];
  const rank = (x) => ({ A: 3, B: 2, C: 1 })[x] || 0;
  if (!old || rank(gr) > rank(old.grade) || (rank(gr) === rank(old.grade) && W.time < old.time)) best[lv.id] = rec;
  save('best', best);
  $('w-kicker').textContent = `${t('lvN', { n: S.lvI + 1 })} · ${G.t(lv.name)}`;
  $('w-grade').textContent = gr;
  const st = $('w-stats');
  st.innerHTML = '';
  const row = (a, b) => {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><b></b>';
    li.firstChild.textContent = a;
    li.lastChild.textContent = b;
    st.appendChild(li);
  };
  row(t('time'), `${fmtT(W.time)} (${t('par', { t: fmtT(lv.par) })})`);
  row(t('gemsL'), `${rec.gems} / ${rec.of}`);
  if (old) row(t('best'), `${old.grade} · ${fmtT(old.time)}`);
  $('w-next').hidden = S.lvI >= LEVELS.length - 1;
  S.screen = 'end';
  show('win');
  notes([523, 659, 784, 1047, 1319], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.14 });
}
function fail() {
  const d = S.W.dead;
  $('f-title').textContent = d.k === 'F' ? t('deadF') : t('deadW');
  $('f-sub').textContent = d.t === 6 ? t('deadGoo') : d.k === 'F' ? t('deadWater') : t('deadLava');
  S.screen = 'end';
  show('fail');
}

// ---------------------------------------------------------------- entrada
const keys = new Set();
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyR' && (S.screen === 'play' || S.screen === 'end') && !e.repeat) {
    if (S.screen === 'end' && !S.W?.dead && !$('s-fail').classList.contains('on') && !$('s-win').classList.contains('on')) return;
    S.screen = 'play';
    restart();
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.paused) resume();
    else pause();
  }
  if ((e.code === 'Enter' || e.code === 'Space') && S.screen !== 'play') {
    const b = document.querySelector('.screen.on .btn.gold:not([hidden])');
    if (b) {
      e.preventDefault();
      b.click();
    }
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// botones táctiles: cada lado con sus teclas
const touch = { left: { l: false, r: false, u: false }, right: { l: false, r: false, u: false } };
for (const [side, el] of [['left', $('pl')], ['right', $('pr')]]) {
  for (const k of el.querySelectorAll('[data-k]')) {
    const set = (v) => (e) => {
      e.preventDefault();
      touch[side][k.dataset.k] = v;
      k.classList.toggle('on', v);
    };
    k.addEventListener('pointerdown', set(true));
    k.addEventListener('pointerup', set(false));
    k.addEventListener('pointercancel', set(false));
    k.addEventListener('pointerleave', set(false));
  }
}
$('b-swap').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  swap();
});
function swap() {
  S.active = S.active === 'F' ? 'W' : 'F';
  drawSwap();
  tone(520, 780, 0.08, { type: 'triangle', vol: 0.1 });
}
function drawSwap() {
  const c = $('swap-c');
  const sg = c.getContext('2d');
  sg.clearRect(0, 0, 64, 64);
  const other = S.active === 'F' ? 'W' : 'F';
  Rn.hero(sg, { k: other, x: 1, y: 1.55, vx: 0, ground: true, walk: 0, face: 1 }, 32, 0, { still: true });
}

function pads() {
  const list = (navigator.getGamepads?.() || []).filter(Boolean);
  const read = (p) => {
    if (!p) return null;
    const ax = p.axes[0] || 0;
    const b = (i) => !!p.buttons[i]?.pressed;
    return { l: ax < -0.4 || b(14), r: ax > 0.4 || b(15), u: b(0) || b(12), swap: b(3) };
  };
  return list.slice(0, 2).map(read);
}
let padSwap = false;

function gather() {
  const F = { l: keys.has('ArrowLeft'), r: keys.has('ArrowRight'), u: keys.has('ArrowUp') };
  const Wt = { l: keys.has('KeyA'), r: keys.has('KeyD'), u: keys.has('KeyW') };
  const p = pads();
  if (p.length >= 2) {
    Object.assign(F, { l: F.l || p[0].l, r: F.r || p[0].r, u: F.u || p[0].u });
    Object.assign(Wt, { l: Wt.l || p[1].l, r: Wt.r || p[1].r, u: Wt.u || p[1].u });
  } else if (p.length === 1) {
    const tgt = S.active === 'F' ? F : Wt;
    tgt.l ||= p[0].l;
    tgt.r ||= p[0].r;
    tgt.u ||= p[0].u;
    if (p[0].swap && !padSwap) swap();
    padSwap = p[0].swap;
  }
  if (mode === 'two') {
    Wt.l ||= touch.left.l;
    Wt.r ||= touch.left.r;
    Wt.u ||= touch.left.u;
    F.l ||= touch.right.l;
    F.r ||= touch.right.r;
    F.u ||= touch.right.u;
  } else {
    const tgt = S.active === 'F' ? F : Wt;
    tgt.l ||= touch.left.l;
    tgt.r ||= touch.left.r;
    tgt.u ||= touch.right.u;
  }
  // con el teclado, el último que se movió es el "activo" para la cámara
  if (F.l || F.r || F.u) S.lastMoved = 'F';
  if (Wt.l || Wt.r || Wt.u) S.lastMoved = 'W';
  return { F, W: Wt };
}

// ---------------------------------------------------------------- sonido y chispas
function sounds(W) {
  for (const e of W.events) {
    const [k, who] = e.split(':');
    if (k === 'jump') tone(who === 'F' ? 360 : 300, who === 'F' ? 720 : 600, 0.12, { type: 'triangle', vol: 0.09 });
    else if (k === 'gem') {
      notes([1175, 1568, 2093], { step: 0.05, dur: 0.18, type: 'sine', vol: 0.1 });
      const c = W.chars[who];
      burst(c.x, c.y - 0.6, who === 'F' ? '#ff6a4a' : '#5aa8ff', 14);
    } else if (k === 'press') tone(220, 180, 0.08, { type: 'square', vol: 0.05 });
    else if (k === 'release') tone(180, 220, 0.06, { type: 'square', vol: 0.03 });
    else if (k === 'lever') noise(0.08, { freq: 900, q: 3, vol: 0.18 });
    else if (k === 'door') tone(660, 990, 0.2, { type: 'sine', vol: 0.08 });
    else if (k === 'land') noise(0.05, { freq: 400, q: 1, vol: 0.12 });
    else if (k === 'box') noise(0.08, { freq: 250, q: 1, vol: 0.2 });
    else if (k === 'die') {
      noise(0.6, { freq: 2400, q: 0.5, vol: 0.25, sweep: 600 });
      const c = W.chars[who];
      burst(c.x, c.y - 0.6, '#d8d8d8', 30, 2.5);
    }
  }
}
function burst(x, y, color, n, spd = 4) {
  if (G.prefs.reducedMotion) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * spd;
    S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0.6 + Math.random() * 0.5, t: 0, color });
  }
}

// ---------------------------------------------------------------- cámara
const minTs = () => (G.prefs.touch ? 21 : 17);
function viewSize() {
  // en vertical los botones táctiles tienen su franja; acostado van encima del templo, en las esquinas
  const padH = !$('pad').hidden && Hd > Wd ? 96 : 0;
  return { w: Wd, h: Hd - TOP - padH, padH };
}
function fitTs(W) {
  const v = viewSize();
  return Math.min(v.w / W.w, v.h / W.h);
}
function targetCam(W) {
  const v = viewSize();
  // si entra entero a buen tamaño, entero; si no, que llene un lado y se recorra el otro
  const fit = fitTs(W);
  const ts = fit >= minTs() ? fit : clamp(Math.max(v.w / W.w, v.h / W.h), minTs(), 34);
  const vw = v.w / ts, vh = v.h / ts;
  const F = W.chars.F, Wc = W.chars.W;
  let fx = (F.x + Wc.x) / 2, fy = (F.y + Wc.y) / 2 - 0.6;
  const both = Math.abs(F.x - Wc.x) < vw * 0.8 && Math.abs(F.y - Wc.y) < vh * 0.75;
  if (!both) {
    const a = mode === 'keys' ? S.lastMoved || 'F' : S.active;
    fx = W.chars[a].x;
    fy = W.chars[a].y - 0.6;
  }
  const cx = vw >= W.w ? W.w / 2 : clamp(fx, vw / 2, W.w - vw / 2);
  const cy = vh >= W.h ? W.h / 2 : clamp(fy, vh / 2, W.h - vh / 2);
  return { ts, x: cx, y: cy };
}
function snapCam() {
  const c = targetCam(S.W);
  S.cam = { x: c.x, y: c.y };
  S.ts = c.ts;
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const tt = now / 1000;
  if (S.screen === 'play' && !S.paused && !G.paused) {
    const W = S.W;
    S.acc += dt;
    const inp = gather();
    let n = 0;
    while (S.acc >= DT && n++ < 12) {
      S.acc -= DT;
      step(W, inp);
      sounds(W);
      if (W.won || W.dead) break;
    }
    if (W.won || W.dead) {
      S.endT += dt;
      if (S.endT > (W.won ? 0.9 : 1.1)) (W.won ? win : fail)();
    }
    hud();
  } else if (S.screen !== 'play') demoStep(dt);
  const W = S.screen === 'play' || S.screen === 'end' ? S.W : S.demo;
  if (W) draw(W, tt, dt);
}

function demoStep(dt) {
  if (!S.demo || S.demo.won || S.demo.dead || S.demoT > 60) {
    S.demo = load(LEVELS[0]);
    S.pilot = pilot(SOLUTIONS[LEVELS[0].id]);
    S.demoT = 0;
    S.layer = null;
    S.demoAcc = 0;
  }
  S.demoT += dt;
  S.demoAcc += dt;
  while (S.demoAcc >= DT) {
    S.demoAcc -= DT;
    step(S.demo, S.pilot.input(S.demo));
    if (S.demo.won) break;
  }
}

function hud() {
  const W = S.W;
  $('h-time').textContent = fmtT(W.time);
  const red = W.gems.filter((x) => x.k === 'F');
  const blue = W.gems.filter((x) => x.k === 'W');
  $('h-red').textContent = `${red.filter((x) => x.got).length}/${red.length}`;
  $('h-blue').textContent = `${blue.filter((x) => x.got).length}/${blue.length}`;
}

function draw(W, tt, dt) {
  const still = G.prefs.reducedMotion;
  const c = targetCam(W);
  const k = 1 - Math.exp(-dt * 6);
  S.cam.x = lerp(S.cam.x, c.x, k);
  S.cam.y = lerp(S.cam.y, c.y, k);
  S.ts = c.ts;
  const ts = S.ts;
  const v = viewSize();
  if (!S.layer || S.layerTs !== Math.round(ts * dpr) || S.layerW !== W) {
    S.layer = Rn.staticLayer(W, ts * dpr);
    S.layerTs = Math.round(ts * dpr);
    S.layerW = W;
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#1a140b';
  g.fillRect(0, 0, Wd, Hd);
  const ox = Wd / 2 - S.cam.x * ts;
  const oy = TOP + v.h / 2 - S.cam.y * ts;
  g.save();
  g.translate(Math.round(ox), Math.round(oy));
  g.drawImage(S.layer, 0, 0, W.w * ts, W.h * ts);
  for (const d of ['F', 'W']) Rn.door(g, W.doors[d], d, ts, tt);
  Rn.pools(g, W, ts, tt, still);
  for (const m of W.movers) Rn.mover(g, m, ts);
  for (const b of W.buttons) Rn.button(g, b, ts);
  for (const l of W.levers) Rn.lever(g, l, ts);
  for (const b of W.boxes) Rn.box(g, b, ts);
  for (const gm of W.gems) Rn.gem(g, gm, ts, tt, still);
  for (const kk of ['W', 'F']) {
    const ch = W.chars[kk];
    if (W.dead?.k === kk) continue;
    const fade = W.won ? clamp(1 - W.winT * 1.6, 0, 1) : null;
    Rn.hero(g, ch, ts, tt, { fade, happy: W.won, still });
    // en el modo de a uno, una flechita sobre el que se maneja
    if (S.screen === 'play' && mode === 'one' && G.prefs.touch && kk === S.active && !W.won) {
      const ax = ch.x * ts, ay = (ch.y - 1.75) * ts + (still ? 0 : Math.sin(tt * 5) * 3);
      g.beginPath();
      g.moveTo(ax - 7, ay - 8);
      g.lineTo(ax + 7, ay - 8);
      g.lineTo(ax, ay);
      g.closePath();
      g.fillStyle = kk === 'F' ? '#ffb12e' : '#8fd0ff';
      g.fill();
    }
  }
  // chispas
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i];
    p.t += dt;
    if (p.t > p.life) {
      S.parts.splice(i, 1);
      continue;
    }
    p.vy += 6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    g.globalAlpha = 1 - p.t / p.life;
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x * ts, p.y * ts, ts * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.restore();
}

// ---------------------------------------------------------------- botones de las pantallas
$('b-play').onclick = () => start(nextLevel());
$('b-levels').onclick = () => levelsScreen();
$('b-help').onclick = () => {
  S.helpFrom = 'home';
  show('help');
};
$('help-ok').onclick = () => {
  if (S.helpFrom === 'pause') show('pause');
  else show('home');
};
for (const b of document.querySelectorAll('[data-mode]')) {
  b.onclick = () => {
    mode = b.dataset.mode;
    save('mode', mode);
    translate();
  };
}
for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => toHome();
function toHome() {
  S.screen = 'home';
  translate();
  show('home');
}
$('b-pause').onclick = () => pause();
$('p-resume').onclick = () => resume();
$('p-restart').onclick = () => restart();
$('p-levels').onclick = () => levelsScreen();
$('p-help').onclick = () => {
  S.helpFrom = 'pause';
  show('help');
};
$('w-next').onclick = () => start(Math.min(LEVELS.length - 1, S.lvI + 1));
$('w-again').onclick = () => start(S.lvI);
$('w-levels').onclick = () => levelsScreen();
$('f-retry').onclick = () => start(S.lvI);
$('f-levels').onclick = () => levelsScreen();
for (const b of document.querySelectorAll('.screen button')) b.addEventListener('click', () => tone(700, 900, 0.05, { type: 'triangle', vol: 0.06 }));

G.onPause(() => {
  if (S.screen === 'play' && !S.W.won && !S.W.dead) pause();
});
G.onResume(() => (last = performance.now()));
G.onPrefs(() => {
  if (!G.prefs.touch && mode !== 'keys') mode = 'keys';
  if (G.prefs.touch && mode === 'keys') mode = 'one';
  translate();
  S.layer = null;
}, true);

// para pruebas y depuración
window.__fya = { S, start, LEVELS };
translate();
show('home');
requestAnimationFrame(frame);
G.ready();
