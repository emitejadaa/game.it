/**
 * Evolución — interfaz: organismo central, tienda, árbol, mutaciones doradas, sonido y fondo animado.
 * Toda la lógica de números vive en engine.js.
 */
import * as E from './engine.js';
import { PALETTE, ICONS, HEROES } from './art.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'gameit:evolution';
const fine = matchMedia('(pointer: fine)').matches;
const mqMobile = matchMedia('(max-width: 900px)');

// ================= textos =================
const TXT = {
  era: { es: 'Era', en: 'Era' },
  evolve: { es: 'Evolucionar', en: 'Evolve' },
  evolveTo: { es: 'Evolucionar a', en: 'Evolve into' },
  pickOne: { es: 'Elegí el rumbo de tu especie. Define cómo vas a crecer en esta vida.', en: 'Choose your species’ path. It shapes how you grow this life.' },
  pickTwo: { es: 'Híbridos: elegí dos rumbos.', en: 'Hybrids: choose two paths.' },
  perSec: { es: 'por segundo', en: 'per second' },
  perClick: { es: 'por clic', en: 'per click' },
  tabGens: { es: 'Criaturas', en: 'Creatures' },
  tabUps: { es: 'Mejoras', en: 'Upgrades' },
  tabTree: { es: 'Mutaciones', en: 'Mutations' },
  tabAch: { es: 'Logros', en: 'Awards' },
  tabMore: { es: 'Datos', en: 'Stats' },
  tabLine: { es: 'Linaje', en: 'Lineage' },
  noUps: { es: 'Comprá criaturas para descubrir mejoras.', en: 'Buy creatures to discover upgrades.' },
  buyAll: { es: 'Comprar todo lo posible', en: 'Buy everything affordable' },
  treeHint: { es: 'El ADN ancestral se gana con cada extinción. Las mutaciones son para siempre.', en: 'Ancestral DNA is earned on every extinction. Mutations are forever.' },
  dna: { es: 'ADN ancestral', en: 'Ancestral DNA' },
  dnaBonus: { es: '+{n}% de producción mientras no lo gastes', en: '+{n}% production while unspent' },
  extinct: { es: 'Extinción', en: 'Extinction' },
  extGain: { es: '+{n} ADN', en: '+{n} DNA' },
  extLocked: { es: 'Llegá a Tierra firme', en: 'Reach Dry land' },
  extLow: { es: 'Producí un poco más', en: 'Produce a bit more' },
  extinctTitle: { es: '¿Provocar una extinción?', en: 'Trigger an extinction?' },
  extText: {
    es: 'Un meteorito borra esta vida: energía, criaturas, mejoras, era y rumbos. Conservás el ADN ancestral, las mutaciones del árbol y los logros.\n\nGanás {n} de ADN ancestral.',
    en: 'A meteor wipes this life: energy, creatures, upgrades, era and paths. You keep ancestral DNA, tree mutations and awards.\n\nYou gain {n} ancestral DNA.',
  },
  extinctGo: { es: 'Que caiga el meteorito', en: 'Bring the meteor' },
  confirm: { es: 'Evolucionar', en: 'Evolve' },
  cancel: { es: 'Todavía no', en: 'Not yet' },
  saveTitle: { es: 'Tu partida', en: 'Your game' },
  saveNote: {
    es: 'La partida sigue mientras no cierres esta pestaña (aunque vuelvas al menú). Para continuar otro día, copiá tu código de evolución y pegalo al volver.',
    en: 'Your game lasts while this tab stays open (even if you go back to the menu). To continue another day, copy your evolution code and paste it later.',
  },
  export: { es: 'Copiar código', en: 'Copy code' },
  import: { es: 'Pegar código', en: 'Paste code' },
  importGo: { es: 'Cargar este código', en: 'Load this code' },
  copied: { es: 'Código copiado', en: 'Code copied' },
  badCode: { es: 'Ese código no es válido', en: 'That code is not valid' },
  loaded: { es: 'Partida cargada', en: 'Game loaded' },
  wipe: { es: 'Empezar de cero', en: 'Start over' },
  wipeSure: { es: '¿Seguro? Se pierde todo. Tocá otra vez', en: 'Sure? Everything is lost. Tap again' },
  owned: { es: 'Tenés', en: 'Owned' },
  each: { es: 'Cada una produce {n}/s', en: 'Each makes {n}/s' },
  share: { es: 'En total: {n}/s ({p}% del total)', en: 'Total: {n}/s ({p}% of all)' },
  locked: { es: 'Se desbloquea en {e}', en: 'Unlocks in {e}' },
  hint: { es: 'Tocá el organismo para generar energía', en: 'Tap the organism to make energy' },
  newEra: { es: 'Nueva era', en: 'New era' },
  ach: { es: 'Logro', en: 'Award' },
  achHead: { es: '{a} de {b} logros · cada uno da +1% de producción', en: '{a} of {b} awards · each gives +1% production' },
  frenzy: { es: 'Mutación dorada: producción ×{m} durante {d} s', en: 'Golden mutation: production ×{m} for {d} s' },
  lucky: { es: 'Mutación dorada: +{n} de energía', en: 'Golden mutation: +{n} energy' },
  clickfrenzy: { es: 'Mutación dorada: clics ×{m} durante {d} s', en: 'Golden mutation: clicks ×{m} for {d} s' },
  bFrenzy: { es: 'Producción ×{m}', en: 'Production ×{m}' },
  bClick: { es: 'Clics ×{m}', en: 'Clicks ×{m}' },
  ability: { es: 'Conquista · +{m} min de producción', en: 'Conquest · +{m} min of production' },
  abilityWait: { es: 'Conquista · {t}', en: 'Conquest · {t}' },
  conquered: { es: 'Conquista: +{n}', en: 'Conquest: +{n}' },
  away: { es: 'Mientras no estabas: +{n} de energía', en: 'While you were away: +{n} energy' },
  node: { es: '{n} ADN', en: '{n} DNA' },
  treeAdn: { es: '{n} ADN disponible', en: '{n} DNA available' },
  branches: { es: ['Vitalidad', 'Instinto', 'Adaptación'], en: ['Vitality', 'Instinct', 'Adaptation'] },
  mClick: { es: 'Por clic', en: 'Per click' },
  mGens: { es: 'Criaturas', en: 'Creatures' },
  mMult: { es: 'Multiplicador', en: 'Multiplier' },
  mTime: { es: 'Esta vida', en: 'This life' },
  st: {
    es: ['Energía en esta vida', 'Energía de todos los tiempos', 'Clics', 'Críticos', 'Mutaciones doradas', 'Extinciones', 'Mejor era', 'ADN ganado en total', 'Mejoras compradas', 'Duración de esta vida'],
    en: ['Energy this life', 'All-time energy', 'Clicks', 'Criticals', 'Golden mutations', 'Extinctions', 'Best era', 'Total DNA earned', 'Upgrades bought', 'Length of this life'],
  },
};
const T = (k, vars) => {
  let s = G.t(TXT[k]) ?? k;
  if (vars) for (const v in vars) s = s.replaceAll(`{${v}}`, vars[v]);
  return s;
};
const N = (o) => G.t(o);
const fmt = E.fmtNum;
const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m}:${String(ss).padStart(2, '0')}`;
};
const setText = (el, v) => {
  if (el.textContent !== v) el.textContent = v;
};
const setHTML = (el, v) => {
  if (el._html !== v) el.innerHTML = el._html = v;
};

// íconos de trazo para rumbos y tipos de mejora (viewBox 24)
const GLYPH = {
  pred: 'M4 5l3.5 10L10 7l2 10 2-10 2.5 8L20 5',
  symb: 'M9 12a5 5 0 1 0 0.01 0M15 12a5 5 0 1 0 0.01 0',
  mut: 'M7 3c10 5 0 13 10 18M17 3C7 8 17 16 7 21M8.5 7h7M8.5 17h7M10 12h4',
  herd: 'M6 10a2.5 2.5 0 1 0 .01 0M12 7a2.5 2.5 0 1 0 .01 0M18 10a2.5 2.5 0 1 0 .01 0M3 19c1-4 5-4 6 0M9 16c1-4 5-4 6 0M15 19c1-4 5-4 6 0',
  slow: 'M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9s10 3 10 9',
  brain: 'M12 12a3 3 0 1 0 .01 0M12 9V3M14.5 13.5l5 3M9.5 13.5l-5 3M12 15v6M4 8l5 2.5M20 8l-5 2.5',
  war: 'M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
  trade: 'M12 3v18M5 7h14M5 7l-3 7h6zM19 7l-3 7h6zM8 21h8',
  sci: 'M9 3h6M10 3v6l-5 10a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7.5 15h9',
  expand: 'M12 3v6M12 15v6M3 12h6M15 12h6M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  machine: 'M12 8.5a3.5 3.5 0 1 0 .01 0M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  harmony: 'M3 12c3-6 6-6 9 0s6 6 9 0M3 17c3-6 6-6 9 0s6 6 9 0M3 7c3-6 6-6 9 0s6 6 9 0',
  trans: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 .01 0',
  entropy: 'M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M5 6h.01M19 5h.01M4 17h.01M18 18h.01M9 20h.01M20 12h.01M8 9c3-3 8-2 9 2s-2 7-6 6-4-5-1-6',
  sing: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 12m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  click: 'M9 11V5a2 2 0 0 1 4 0v5M13 10V8a2 2 0 0 1 4 0v3M17 11a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-2a7 7 0 0 1-6-4l-2.5-4.5a1.8 1.8 0 0 1 3-2L9 15',
  global: 'M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M19 5l-2.8 2.8M7.8 16.2L5 19M12 8a4 4 0 1 0 .01 0',
};
const glyph = (k, color = 'currentColor', w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPH[k]}"/></svg>`;
const PATH_BY_ID = Object.fromEntries(E.PATHS.flat().map((p) => [p.id, p]));
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const ACH_SYM = { e: '✦', k: '☝', era: '◉', p: '☄', m: '✺', c: '❖', s: '➚', all: '✧', tre: '❦' };
const SPORE_SVG = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#fde047" opacity=".22"/><circle cx="32" cy="32" r="20" fill="#fde047" opacity=".25"/><path d="M23 10c20 12 -2 32 18 44M41 10c-20 12 2 32 -18 44" stroke="#fde047" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M26 19h12M25 32h14M26 45h12" stroke="#fffbe0" stroke-width="3" stroke-linecap="round"/></svg>`;

// ================= estado y guardado =================
let s = null;
function load() {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      s = E.deserialize(o.d);
      return (Date.now() - o.at) / 1000;
    }
  } catch (e) {
    /* partida corrupta: empezar de cero */
  }
  s = E.newRun(E.newMeta());
  return 0;
}
function save() {
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ at: Date.now(), d: E.serialize(s) }));
  } catch (e) {
    /* sin almacenamiento: la partida vive sólo en memoria */
  }
}
const encode = () => 'EVO1.' + btoa(unescape(encodeURIComponent(E.serialize(s))));
function decode(code) {
  const c = code.trim().replace(/^EVO1\./, '');
  return E.deserialize(decodeURIComponent(escape(atob(c))));
}

/** Tiempo sin la pestaña visible: el primer minuto completo, el resto al 50% (máx. 4 h). */
function catchUp(sec, announce) {
  if (sec <= 0) return;
  const full = Math.min(sec, 60);
  E.tick(s, full);
  const rest = Math.min(sec - full, 4 * 3600);
  if (rest > 0) {
    s.time += rest;
    E.tick(s, 0);
    const v = s.eps * rest * 0.5;
    E.gain(s, v);
    if (announce && v > 0) toast(T('away', { n: fmt(v) }), 'gold');
  }
}

// ================= sonido =================
let ac = null;
let sfxBus = null;
let musicBus = null;
let pad = null;
function audio() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  sfxBus = ac.createGain();
  musicBus = ac.createGain();
  sfxBus.connect(ac.destination);
  musicBus.connect(ac.destination);
  applyVolume();
  startPad();
}
function applyVolume() {
  if (!ac) return;
  sfxBus.gain.value = G.prefs.volume.sfx * 0.55;
  musicBus.gain.setTargetAtTime(G.prefs.volume.music * 0.5, ac.currentTime, 0.3);
}
function tone(f0, f1, dur, type = 'sine', vol = 0.2, at = 0, attack = 0.005) {
  if (!ac || !G.prefs.volume.sfx) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  const t0 = ac.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function noise(dur, vol, freq) {
  if (!ac || !G.prefs.volume.sfx) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(sfxBus);
  src.start();
}
const CLICK_BASE = [520, 430, 330, 392, 600, 700];
const PAD_ROOT = [110, 98, 87.3, 123.5, 82.4, 73.4];
let lastClickSnd = 0;
function sound(k) {
  if (!ac) return;
  const e = s.era;
  switch (k) {
    case 'click': {
      const n = performance.now();
      if (n - lastClickSnd < 35) return;
      lastClickSnd = n;
      const f = CLICK_BASE[e] * (1 + Math.random() * 0.25);
      tone(f, f * 0.55, 0.09, e === 4 ? 'triangle' : 'sine', 0.2);
      break;
    }
    case 'crit':
      tone(220, 60, 0.25, 'square', 0.12);
      tone(900, 1900, 0.18, 'sine', 0.16, 0.03);
      break;
    case 'buy':
      tone(520, 780, 0.08, 'triangle', 0.14);
      tone(780, 1040, 0.1, 'triangle', 0.12, 0.06);
      break;
    case 'upgrade':
      [0, 4, 7, 12].forEach((st, i) => tone(523 * 2 ** (st / 12), 523 * 2 ** (st / 12), 0.22, 'triangle', 0.12, i * 0.06));
      break;
    case 'deny':
      tone(180, 140, 0.12, 'square', 0.06);
      break;
    case 'evolve':
      [0, 4, 7, 11, 14].forEach((st, i) => tone(262 * 2 ** (st / 12), 262 * 2 ** (st / 12) * 1.01, 2.2, 'sine', 0.12, i * 0.12, 0.35));
      tone(80, 40, 1.4, 'sine', 0.3);
      break;
    case 'spore':
      [0, 0.12, 0.24].forEach((t, i) => tone(1400 + i * 300, 1900 + i * 300, 0.18, 'sine', 0.06, t));
      break;
    case 'catch':
      [0, 3, 7, 10, 12, 15, 19].forEach((st, i) => tone(660 * 2 ** (st / 12), 660 * 2 ** (st / 12), 0.25, 'sine', 0.12, i * 0.045));
      break;
    case 'ach':
      tone(1320, 1320, 0.9, 'sine', 0.12);
      tone(1980, 1980, 0.7, 'sine', 0.07, 0.02);
      break;
    case 'node':
      tone(392, 784, 0.5, 'triangle', 0.14);
      tone(588, 1176, 0.5, 'sine', 0.1, 0.1);
      break;
    case 'war':
      noise(0.5, 0.35, 900);
      tone(160, 50, 0.6, 'sawtooth', 0.12);
      tone(523, 1046, 0.4, 'square', 0.06, 0.2);
      break;
    case 'meteor':
      noise(2.2, 0.6, 500);
      tone(140, 25, 2.2, 'sawtooth', 0.18);
      break;
  }
}
/** Pad ambiental suave: acorde abierto que cambia de raíz con cada era. */
function startPad() {
  if (!ac || pad) return;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 700;
  f.Q.value = 0.7;
  const lfo = ac.createOscillator();
  const lfoG = ac.createGain();
  lfo.frequency.value = 0.07;
  lfoG.gain.value = 350;
  lfo.connect(lfoG).connect(f.frequency);
  const g = ac.createGain();
  g.gain.value = 0.0001;
  g.gain.setTargetAtTime(0.09, ac.currentTime, 2);
  f.connect(g).connect(musicBus);
  const ratios = [1, 1.5, 2, 2.52, 3];
  const oscs = ratios.map((r, i) => {
    const o = ac.createOscillator();
    o.type = i % 2 ? 'triangle' : 'sine';
    o.detune.value = (i - 2) * 4;
    const og = ac.createGain();
    og.gain.value = 0.22 / (1 + i * 0.4);
    o.connect(og).connect(f);
    o.start();
    return { o, r };
  });
  lfo.start();
  pad = { oscs };
  retunePad();
}
function retunePad() {
  if (!pad) return;
  const root = PAD_ROOT[s.era] || 110;
  for (const { o, r } of pad.oscs) o.frequency.setTargetAtTime(root * r, ac.currentTime, 1.2);
}

// ================= toasts, tooltip, flash =================
function toast(html, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = html;
  const box = $('toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 3700);
}
const tipEl = $('tip');
let tipFor = null;
function showTip(target, x, y) {
  const html = target._tip?.();
  if (!html) return hideTip();
  tipFor = target;
  tipEl.innerHTML = html;
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  const left = x - w - 16 < 8 ? x + 18 : x - w - 16;
  tipEl.style.left = `${Math.min(innerWidth - w - 8, left)}px`;
  tipEl.style.top = `${Math.min(innerHeight - h - 8, Math.max(8, y - h / 2))}px`;
  tipEl.classList.add('on');
}
function hideTip() {
  tipFor = null;
  tipEl.classList.remove('on');
}
if (fine) {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t) showTip(t, e.clientX, e.clientY);
    else if (tipFor) hideTip();
  });
}
function flash(small, big, cls = '') {
  const el = $('flash');
  el.className = `flash ${cls}`;
  el.querySelector('small').textContent = small;
  el.querySelector('b').textContent = big;
  void el.offsetWidth;
  el.classList.add('show');
}

// ================= era / tema =================
let shownEra = -1;
function applyEra(animate) {
  const era = E.ERAS[s.era];
  const p = PALETTE[era.id];
  const root = document.documentElement.style;
  for (const k of ['a', 'b', 'c', 'bg1', 'bg2', 'glow']) root.setProperty(`--${k}`, p[k]);
  const hero = $('hero');
  hero.innerHTML = HEROES[s.era];
  if (animate) {
    hero.classList.remove('enter');
    void hero.offsetWidth;
    hero.classList.add('enter');
  }
  shownEra = s.era;
  retunePad();
  seedParticles();
  buildGens();
  buildUps(true);
  renderPaths();
}

// ================= organismo =================
const hero = $('hero');
const floaters = $('floaters');
const center = $('center');
function doClick(x, y) {
  audio();
  const r = E.click(s);
  sound(r.crit ? 'crit' : 'click');
  hero.classList.remove('hit');
  void hero.offsetWidth;
  hero.classList.add('hit');
  const cr = center.getBoundingClientRect();
  const lx = x - cr.left;
  const ly = y - cr.top;
  const f = document.createElement('div');
  f.className = `fl${r.crit ? ' crit' : ''}`;
  f.textContent = `+${fmt(r.value)}`;
  f.style.left = `${lx + (Math.random() * 30 - 15)}px`;
  f.style.top = `${ly - 20}px`;
  floaters.appendChild(f);
  f.addEventListener('animationend', () => f.remove());
  if (floaters.childElementCount < 28 && !G.prefs.reducedMotion) {
    const n = r.crit ? 12 : 5;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i');
      d.className = 'dot';
      const a = Math.random() * Math.PI * 2;
      const dist = (r.crit ? 70 : 36) + Math.random() * 30;
      d.style.cssText = `left:${lx - 4}px;top:${ly - 4}px;--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist}px;${r.crit ? 'background:#ff6b6b' : ''}`;
      floaters.appendChild(d);
      d.addEventListener('animationend', () => d.remove());
    }
  }
  while (floaters.childElementCount > 60) floaters.firstChild.remove();
  if (r.crit && !G.prefs.reducedMotion) shake();
  dirty = true;
}
hero.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  doClick(e.clientX, e.clientY);
});
hero.addEventListener('contextmenu', (e) => e.preventDefault());
// que el foco no quede en un botón (la barra espaciadora es para el organismo)
addEventListener('pointerup', (e) => e.pointerType !== 'touch' && e.target.closest?.('button') && document.activeElement?.blur?.());
hero.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return closeModals();
  if (document.querySelector('.modal.on') || e.target.tagName === 'TEXTAREA') return;
  if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) {
    e.preventDefault();
    const r = hero.getBoundingClientRect();
    doClick(r.left + r.width * (0.3 + Math.random() * 0.4), r.top + r.height * (0.3 + Math.random() * 0.4));
  }
});
function shake() {
  document.body.classList.remove('shake');
  void document.body.offsetWidth;
  document.body.classList.add('shake');
}

// ================= criaturas =================
let amount = 1;
const genEls = {};
function buildGens() {
  const box = $('gens');
  box.innerHTML = '';
  for (const k in genEls) delete genEls[k];
  let lastEra = -1;
  // la era actual arriba (con un adelanto de la siguiente), las anteriores debajo
  const order = [];
  const teaser = E.GENS.find((x) => x.era === s.era + 1);
  if (teaser) order.push(teaser);
  for (let e = s.era; e >= 0; e--) order.push(...E.GENS.filter((x) => x.era === e));
  for (const gg of order) {
    const locked = gg.era > s.era;
    if (gg.era !== lastEra && s.era > 0 && !locked) {
      const sep = document.createElement('div');
      sep.className = 'era-sep';
      sep.textContent = N(E.ERAS[gg.era].name);
      box.appendChild(sep);
    }
    lastEra = gg.era;
    const b = document.createElement('button');
    b.className = `gen${locked ? ' locked' : ''}`;
    b.innerHTML = `<div class="ic">${ICONS[gg.id]}</div><div><b>${locked ? '???' : N(gg.name)}</b><small class="cost"></small><small class="sub"></small></div><div class="own"></div>`;
    b.dataset.tip = '';
    b._tip = () => genTip(gg, locked);
    if (!locked) b.addEventListener('click', () => buyGenUI(gg.id, b));
    box.appendChild(b);
    genEls[gg.id] = { b, cost: b.querySelector('.cost'), sub: b.querySelector('.sub'), own: b.querySelector('.own'), locked };
  }
  refreshGens();
}
function genAmount(id) {
  if (amount === 'max') return Math.max(1, E.maxAffordable(s, id));
  return amount;
}
function genProd(gg) {
  const each = E.unitEps(s, gg.id);
  return { each, total: each * (s.gens[gg.id] || 0) };
}
function genTip(gg, locked) {
  if (locked) return `<b>???</b>${T('locked', { e: N(E.ERAS[gg.era].name) })}`;
  const { each, total } = genProd(gg);
  const pct = s.eps ? Math.round((total / s.eps) * 100) : 0;
  return `<b>${N(gg.name)}</b><i>${N(gg.desc)}</i><br>${T('each', { n: fmt(each) })}<br>${T('share', { n: fmt(total), p: pct })}`;
}
function refreshGens() {
  const gm = E.globalMult(s);
  for (const gg of E.GENS) {
    const el = genEls[gg.id];
    if (!el) continue;
    if (el.locked) {
      setText(el.cost, T('locked', { e: N(E.ERAS[gg.era].name) }));
      continue;
    }
    const n = genAmount(gg.id);
    const c = E.genCost(s, gg.id, n);
    const can = c <= s.energy && (amount !== 'max' || E.maxAffordable(s, gg.id) > 0);
    el.b.classList.toggle('can', can);
    setText(el.cost, `${fmt(c)}${n > 1 ? `  ·  ×${n}` : ''}`);
    setText(el.own, String(s.gens[gg.id] || 0));
    setText(el.sub, `+${fmt(E.unitEps(s, gg.id, gm))}/s`);
  }
}
function buyGenUI(id, btn) {
  audio();
  const n = genAmount(id);
  if (!E.buyGen(s, id, n)) return sound('deny');
  sound('buy');
  btn.classList.remove('bought');
  void btn.offsetWidth;
  btn.classList.add('bought');
  flyToHero(btn.querySelector('.ic'), ICONS[id]);
  dirty = true;
}
$('amounts').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  amount = b.dataset.n === 'max' ? 'max' : +b.dataset.n;
  for (const x of $('amounts').children) x.classList.toggle('on', x === b);
  refreshGens();
});
/** Un ícono vuela desde la tienda hasta el organismo. */
function flyToHero(fromEl, svg) {
  if (G.prefs.reducedMotion || !fromEl || !fromEl.offsetParent) return;
  const a = fromEl.getBoundingClientRect();
  const h = hero.getBoundingClientRect();
  if (!h.width) return;
  const el = document.createElement('div');
  el.innerHTML = svg;
  el.style.cssText = `position:fixed;z-index:25;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;pointer-events:none`;
  document.body.appendChild(el);
  const dx = h.left + h.width / 2 - a.left - a.width / 2;
  const dy = h.top + h.height / 2 - a.top - a.height / 2;
  el.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 60}px) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0 },
    ],
    { duration: 650, easing: 'cubic-bezier(.5,0,.5,1)' },
  ).onfinish = () => el.remove();
}

// ================= mejoras =================
let upsKey = '';
const upEls = [];
function upIcon(u) {
  if (u.kind === 'gen') return ICONS[u.gen];
  if (u.kind === 'click') return glyph('click', 'var(--b)');
  if (u.kind === 'global') return glyph('global', 'var(--glow)');
  return glyph(u.path, '#f0abfc');
}
function buildUps(force) {
  const list = E.availableUpgrades(s).slice(0, 48);
  const key = list.map((u) => u.id).join(',') + G.prefs.lang;
  if (!force && key === upsKey) return;
  upsKey = key;
  const box = $('ups');
  box.innerHTML = '';
  upEls.length = 0;
  list.forEach((u, i) => {
    const b = document.createElement('button');
    b.className = `up kind-${u.kind}`;
    b.style.animationDelay = `${Math.min(i, 12) * 25}ms`;
    const tier = u.kind === 'gen' ? `<span class="tier">${ROMAN[+u.id.slice(-1)]}</span>` : '';
    b.innerHTML = `${tier}<div class="ic">${upIcon(u)}</div><b>${N(u.name)}</b><small>${N(u.desc)}</small><span class="cost">${fmt(E.upgradeCost(s, u))}</span>`;
    b.addEventListener('click', () => {
      audio();
      if (!E.buyUpgrade(s, u.id)) return sound('deny');
      sound('upgrade');
      b.style.transition = 'transform .3s, opacity .3s';
      b.style.transform = 'scale(.6)';
      b.style.opacity = '0';
      setTimeout(() => buildUps(true), 180);
      dirty = true;
    });
    box.appendChild(b);
    upEls.push({ b, u });
  });
  $('ups-empty').hidden = list.length > 0;
  $('buy-all').hidden = list.length < 2;
}
function refreshUps() {
  buildUps(false);
  let n = 0;
  for (const { b, u } of upEls) {
    const can = E.upgradeCost(s, u) <= s.energy;
    b.classList.toggle('can', can);
    if (can) n++;
  }
  badge('ups', n);
}
function buyAll() {
  audio();
  let bought = 0;
  for (;;) {
    const u = E.availableUpgrades(s).find((x) => E.upgradeCost(s, x) <= s.energy);
    if (!u || !E.buyUpgrade(s, u.id)) break;
    bought++;
  }
  if (!bought) return sound('deny');
  sound('upgrade');
  buildUps(true);
  dirty = true;
}

// ================= árbol de mutaciones =================
const nodeEls = {};
function buildTree() {
  const box = $('tree');
  box.innerHTML = '';
  const names = G.t(TXT.branches);
  for (let br = 0; br < 3; br++) {
    const col = document.createElement('div');
    col.className = 'branch';
    col.innerHTML = `<h5>${names[br]}</h5>`;
    for (const n of E.TREE.filter((x) => x.br === br)) {
      const b = document.createElement('button');
      b.className = 'node';
      b.innerHTML = `<b>${N(n.name)}</b><small>${N(n.desc)}</small><em></em>`;
      b.addEventListener('click', () => {
        audio();
        if (!E.buyNode(s.meta, n.id)) return sound('deny');
        sound('node');
        E.recalc(s);
        b.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        E.checkAchievements(s);
        if (n.id === 'a5' || n.id === 'a6') renderPaths();
        dirty = true;
        refreshTree();
      });
      col.appendChild(b);
      nodeEls[n.id] = { b, em: b.querySelector('em'), n };
    }
    box.appendChild(col);
  }
  refreshTree();
}
function refreshTree() {
  const m = s.meta;
  let can = 0;
  for (const id in nodeEls) {
    const { b, em, n } = nodeEls[id];
    const own = m.tree.includes(id);
    const unlocked = !n.req || m.tree.includes(n.req);
    const afford = !own && unlocked && m.adn >= n.cost;
    if (afford) can++;
    b.className = `node${own ? ' own' : afford ? ' can' : !unlocked ? ' lock' : ''}`;
    setText(em, own ? '✓' : T('node', { n: fmt(n.cost) }));
  }
  setText($('tree-adn'), T('treeAdn', { n: fmt(m.adn) }));
  badge('tree', can);
}

// ================= logros =================
function buildAch() {
  const box = $('achs');
  box.innerHTML = '';
  for (const a of E.ACHIEVEMENTS) {
    const d = document.createElement('div');
    d.className = 'ach';
    d.dataset.id = a.id;
    const cat = a.id.startsWith('era') ? 'era' : a.id.startsWith('all') ? 'all' : a.id.startsWith('tree') ? 'tre' : a.id[0];
    d.innerHTML = cat === 'h' ? `<span class="aic">${ICONS[a.id.slice(1)]}</span>` : ACH_SYM[cat] || '✧';
    d.dataset.tip = '';
    d._tip = () => `<b>${N(a.name)}</b>+1%`;
    d.title = fine ? '' : N(a.name);
    box.appendChild(d);
  }
  refreshAch();
}
function refreshAch() {
  const got = new Set(s.meta.achievements);
  for (const d of $('achs').children) d.classList.toggle('got', got.has(d.dataset.id));
  setText($('ach-head'), T('achHead', { a: got.size, b: E.ACHIEVEMENTS.length }));
}

// ================= linaje (panel izquierdo) =================
function renderPaths() {
  const box = $('paths');
  const active = E.PATHS.flat().filter((p) => E.pathActive(s, p.id));
  box.innerHTML = active
    .map((p) => `<span class="chip" data-tip data-path="${p.id}"><i>${glyph(p.id, 'var(--b)', 2.2)}</i>${N(p.name)}</span>`)
    .join('');
  for (const c of box.children) c._tip = () => `<b>${N(PATH_BY_ID[c.dataset.path].name)}</b>${N(PATH_BY_ID[c.dataset.path].desc)}`;
}
function refreshSide() {
  const era = E.ERAS[s.era];
  setText($('era-name'), N(era.name));
  const cost = E.evoCost(s);
  const btn = $('evo-btn');
  const float = $('evo-float');
  if (cost === Infinity) {
    btn.hidden = true;
    $('evo-bar').style.width = '100%';
    float.hidden = true;
  } else {
    btn.hidden = false;
    const ready = E.canEvolve(s);
    btn.classList.toggle('ready', ready);
    float.hidden = !ready;
    setText($('evo-cost'), `${fmt(Math.min(s.energy, cost))} / ${fmt(cost)}`);
    $('evo-bar').style.width = `${Math.min(100, (s.energy / cost) * 100)}%`;
  }
  // habilidad
  const war = E.pathActive(s, 'war');
  $('ability').hidden = !war;
  if (war) {
    const left = s.abilityReady - s.time;
    const ab = $('ability-btn');
    ab.disabled = left > 0;
    setText(ab, left > 0 ? T('abilityWait', { t: fmtTime(left) }) : T('ability', { m: E.hasUp(s, 'war0') ? 40 : 20 }));
  }
  // mutaciones activas
  const bh = s.buffs
    .map((b) => {
      const pct = Math.max(0, ((b.until - s.time) / b.dur) * 100);
      const label = b.type === 'frenzy' ? T('bFrenzy', { m: fmt(b.mult) }) : T('bClick', { m: fmt(b.mult) });
      return `<div class="buff">${label} · ${Math.ceil(b.until - s.time)} s<i style="width:${pct}%"></i></div>`;
    })
    .join('');
  setHTML($('buffs'), bh);
  document.body.classList.toggle('frenzy', s.buffs.some((b) => b.type === 'frenzy'));
  // mini estadísticas
  setHTML(
    $('mini-stats'),
    `<div>${T('mClick')} <b>${fmt(s.clickVal)}</b></div><div>${T('mGens')} <b>${fmt(E.totalGens(s))}</b></div><div>${T('mMult')} <b>×${fmt(E.globalMult(s))}</b></div><div>${T('mTime')} <b>${fmtTime(s.time)}</b></div>`,
  );
  // ADN
  setText($('adn'), fmt(s.meta.adn));
  setText($('adn-bonus'), T('dnaBonus', { n: fmt(s.meta.adn) }));
  const gain = E.prestigeGain(s);
  const ok = E.canPrestige(s);
  $('ext-btn').classList.toggle('ready', ok);
  setText($('ext-gain'), s.era < 2 ? T('extLocked') : ok ? T('extGain', { n: fmt(gain) }) : T('extLow'));
  // indicador en la pestaña Linaje (celular)
  badge('side', E.canEvolve(s) || (war && s.abilityReady <= s.time) ? '!' : 0);
}
$('ability-btn').addEventListener('click', () => {
  audio();
  const v = E.useAbility(s);
  if (!v) return;
  sound('war');
  shake();
  toast(T('conquered', { n: `<b>${fmt(v)}</b>` }));
  dirty = true;
});

// ================= evolución =================
let picks = [];
function openEvolve() {
  if (!E.canEvolve(s)) return sound('deny');
  audio();
  picks = [];
  const next = E.ERAS[s.era + 1];
  $('evo-title').textContent = N(next.name);
  const two = E.pathsPerEvolution(s) > 1;
  $('evo-sub').textContent = two ? T('pickTwo') : T('pickOne');
  const box = $('choices');
  box.innerHTML = '';
  for (const p of E.PATHS[s.era]) {
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<span class="em">${glyph(p.id, '#fff', 2)}</span><b>${N(p.name)}</b><p>${N(p.desc)}</p>`;
    b.addEventListener('click', () => {
      const max = E.pathsPerEvolution(s);
      if (picks.includes(p.id)) picks = picks.filter((x) => x !== p.id);
      else {
        picks.push(p.id);
        if (picks.length > max) picks.shift();
      }
      for (const c of box.children) c.classList.toggle('sel', picks.includes(c._id));
      $('evo-confirm').hidden = picks.length < max;
      tone(600 + picks.length * 200, 900 + picks.length * 200, 0.08, 'triangle', 0.1);
    });
    b._id = p.id;
    box.appendChild(b);
  }
  $('evo-confirm').hidden = true;
  $('evo-modal').classList.add('on');
}
$('evo-btn').addEventListener('click', openEvolve);
$('evo-float').addEventListener('click', openEvolve);
$('evo-cancel').addEventListener('click', closeModals);
$('evo-confirm').addEventListener('click', () => {
  if (!E.evolve(s, picks)) return;
  closeModals();
  sound('evolve');
  applyEra(true);
  flash(T('newEra'), N(E.ERAS[s.era].name));
  const chosen = picks.map((id) => N(PATH_BY_ID[id].name)).join(' + ');
  toast(`${N(E.ERAS[s.era].name)} · <b>${chosen}</b>`);
  checkAch();
  save();
  dirty = true;
});
function closeModals() {
  for (const m of document.querySelectorAll('.modal.on')) m.classList.remove('on');
}
for (const m of document.querySelectorAll('.modal')) m.addEventListener('pointerdown', (e) => e.target === m && closeModals());

// ================= extinción =================
$('ext-btn').addEventListener('click', () => {
  audio();
  if (!E.canPrestige(s)) return sound('deny');
  $('ext-text').textContent = T('extText', { n: fmt(E.prestigeGain(s)) });
  $('ext-modal').classList.add('on');
});
$('ext-cancel').addEventListener('click', closeModals);
$('ext-confirm').addEventListener('click', () => {
  const gain = E.prestigeGain(s);
  const next = E.prestige(s);
  if (!next) return;
  closeModals();
  sound('meteor');
  flash(T('extinct'), `+${fmt(gain)} ADN`, 'meteor');
  shake();
  removeSpore(false);
  s = next;
  scheduleSpore();
  setTimeout(() => {
    applyEra(true);
    checkAch();
    refreshTree();
    showTab('tree');
    save();
  }, 400);
  dirty = true;
});

// ================= mutaciones doradas =================
let spore = null;
function scheduleSpore() {
  const [a, b] = E.eventInterval(s);
  s.nextEvent = s.time + a + Math.random() * (b - a);
}
function spawnSpore() {
  const el = document.createElement('button');
  el.className = 'spore';
  el.innerHTML = SPORE_SVG;
  el.setAttribute('aria-label', 'mutación dorada');
  const x = innerWidth * (0.12 + Math.random() * 0.7);
  const y = innerHeight * (mqMobile.matches ? 0.08 + Math.random() * 0.25 : 0.15 + Math.random() * 0.6);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    catchSpore(e.clientX, e.clientY);
  });
  document.body.appendChild(el);
  spore = { el, until: s.time + 13 };
  sound('spore');
}
function removeSpore(caught) {
  if (!spore) return;
  const el = spore.el;
  spore = null;
  el.classList.add('out');
  if (caught) el.style.animationDuration = '.25s';
  setTimeout(() => el.remove(), 500);
  scheduleSpore();
}
function catchSpore() {
  if (!spore) return;
  audio();
  const r = E.catchEvent(s);
  sound('catch');
  removeSpore(true);
  if (r.type === 'lucky') toast(T('lucky', { n: `<b>${fmt(r.value)}</b>` }), 'gold');
  else toast(T(r.type, { m: `<b>${fmt(r.mult)}</b>`, d: Math.round(r.dur) }), 'gold');
  checkAch();
  dirty = true;
}

// ================= pestañas =================
const tabs = $('tabs');
function showTab(name) {
  for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === name);
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === name);
  if (name === 'more') renderStats();
}
tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) showTab(b.dataset.tab);
});
function badge(tab, n) {
  const b = tabs.querySelector(`[data-tab="${tab}"]`);
  let el = b.querySelector('.badge');
  if (!n) return el && el.remove();
  if (!el) {
    el = document.createElement('span');
    el.className = 'badge';
    b.appendChild(el);
  }
  setText(el, String(n));
}
// en celular el linaje vive dentro de una pestaña
function placeSide() {
  const from = mqMobile.matches ? $('side') : $('side-mobile');
  const to = mqMobile.matches ? $('side-mobile') : $('side');
  while (from.firstChild) to.appendChild(from.firstChild);
  if (!mqMobile.matches && tabs.querySelector('.on')?.dataset.tab === 'side') showTab('gens');
}
mqMobile.addEventListener('change', () => {
  placeSide();
  resize();
});

// ================= datos y guardado =================
function renderStats() {
  const L = G.t(TXT.st);
  const v = [
    fmt(s.total),
    fmt(s.meta.allTime),
    fmt(s.stats.clicks),
    fmt(s.stats.crits),
    fmt(s.stats.events),
    fmt(s.meta.prestiges),
    N(E.ERAS[s.meta.bestEra].name),
    fmt(s.meta.adnTotal),
    fmt(s.upgrades.length),
    fmtTime(s.time),
  ];
  $('stats').innerHTML = L.map((l, i) => `<div><span>${l}</span><b>${v[i]}</b></div>`).join('');
}
const box = $('save-box');
let importing = false;
$('export').addEventListener('click', async () => {
  const code = encode();
  box.hidden = false;
  box.value = code;
  box.select();
  importing = false;
  $('import').textContent = T('import');
  try {
    await navigator.clipboard.writeText(code);
    toast(T('copied'));
  } catch (e) {
    /* sin portapapeles: queda seleccionado en la caja */
  }
});
$('import').addEventListener('click', () => {
  if (!importing) {
    importing = true;
    box.hidden = false;
    box.value = '';
    box.placeholder = 'EVO1.…';
    box.focus();
    $('import').textContent = T('importGo');
    return;
  }
  try {
    const next = decode(box.value);
    removeSpore(false);
    s = next;
    scheduleSpore();
    applyEra(true);
    buildTree();
    buildAch();
    save();
    toast(T('loaded'));
    importing = false;
    box.hidden = true;
    $('import').textContent = T('import');
  } catch (e) {
    toast(T('badCode'));
    sound('deny');
  }
});
let wipeArmed = 0;
$('wipe').addEventListener('click', () => {
  if (Date.now() - wipeArmed > 4000) {
    wipeArmed = Date.now();
    $('wipe').textContent = T('wipeSure');
    setTimeout(() => ($('wipe').textContent = T('wipe')), 4000);
    return;
  }
  removeSpore(false);
  s = E.newRun(E.newMeta());
  scheduleSpore();
  applyEra(true);
  buildTree();
  buildAch();
  save();
  showTab('gens');
});

// ================= logros =================
function checkAch() {
  const got = E.checkAchievements(s);
  for (const a of got) {
    toast(`${T('ach')}: <b>${N(a.name)}</b> · +1%`);
    sound('ach');
  }
  if (got.length) refreshAch();
}

// ================= fondo animado =================
const cv = $('bg');
const cx = cv.getContext('2d');
let W = 0;
let H = 0;
let parts = [];
let heroBox = { x: 0, y: 0, r: 0 };
const sprites = {};
function sprite(color) {
  if (sprites[color]) return sprites[color];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#fff');
  gr.addColorStop(0.15, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return (sprites[color] = c);
}
function resize() {
  const dpr = Math.min(1.5, devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  measureHero();
  seedParticles();
}
function measureHero() {
  const r = hero.getBoundingClientRect();
  heroBox = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
}
const R = Math.random;
function newPart(init) {
  const id = E.ERAS[shownEra < 0 ? 0 : shownEra].id;
  const p = PALETTE[id];
  const x = R() * W;
  const y = init ? R() * H : H + 20;
  switch (id) {
    case 'soup':
      return { k: 'bubble', x, y, r: 2 + R() * 8, vy: -(10 + R() * 22), ph: R() * 7, a: 0.15 + R() * 0.3, c: R() < 0.5 ? p.a : p.b };
    case 'ocean':
      return { k: 'glow', x, y: R() * H, r: 3 + R() * 7, vx: 5 + R() * 10, vy: -3 + R() * 6, ph: R() * 7, a: 0.2 + R() * 0.5, c: R() < 0.6 ? p.glow : p.b, wrap: true };
    case 'land':
      return { k: 'fly', x, y: R() * H, r: 4 + R() * 6, vx: -8 + R() * 16, vy: -8 + R() * 16, ph: R() * 7, a: 0.7, c: R() < 0.7 ? '#fde68a' : p.b, wrap: true, blink: 0.8 + R() * 2 };
    case 'civ':
      return { k: 'glow', x, y, r: 2 + R() * 5, vx: -4 + R() * 8, vy: -(20 + R() * 40), ph: R() * 7, a: 0.3 + R() * 0.5, c: R() < 0.6 ? p.glow : '#fb923c' };
    case 'space':
      return { k: 'star', x, y: R() * H, r: 1 + R() * 3.5, vx: 0, vy: 2 + R() * 6, ph: R() * 7, a: 0.4 + R() * 0.6, c: R() < 0.8 ? '#e0e7ff' : p.b, wrap: true, blink: 0.5 + R() * 2 };
    default: {
      const ang = R() * Math.PI * 2;
      const rad = 30 + R() * Math.max(W, H) * 0.7;
      return { k: 'swirl', ang, rad, r: 1.5 + R() * 4, ph: R() * 7, a: 0.3 + R() * 0.6, c: R() < 0.5 ? p.a : R() < 0.5 ? p.b : '#fff', blink: 0.5 + R() * 2 };
    }
  }
}
function seedParticles() {
  if (!W) return;
  const n = G.prefs.reducedMotion ? 24 : Math.round(Math.min(120, (W * H) / 11000));
  parts = Array.from({ length: n }, () => newPart(true));
  shooting = null;
}
let shooting = null;
let bgT = 0;
const orbImgs = {};
function orbImg(id) {
  if (!orbImgs[id]) {
    const im = new Image();
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICONS[id]);
    orbImgs[id] = im;
  }
  return orbImgs[id];
}
function drawBg(dt) {
  const still = G.prefs.reducedMotion;
  if (still) dt = 0;
  bgT += dt;
  cx.clearRect(0, 0, W, H);
  const id = E.ERAS[shownEra].id;
  const pal = PALETTE[id];
  // capas especiales por era
  if (id === 'ocean') {
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = W * (0.15 + i * 0.25) + Math.sin(bgT * 0.3 + i) * 40;
      const g = cx.createLinearGradient(0, 0, 0, H * 0.9);
      g.addColorStop(0, 'rgba(125,211,252,.10)');
      g.addColorStop(1, 'rgba(125,211,252,0)');
      cx.fillStyle = g;
      cx.beginPath();
      cx.moveTo(x - 30, 0);
      cx.lineTo(x + 30, 0);
      cx.lineTo(x + 160, H * 0.9);
      cx.lineTo(x + 20, H * 0.9);
      cx.fill();
    }
    cx.restore();
  } else if (id === 'cosmos') {
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    cx.globalAlpha = 0.12;
    const sp = sprite(pal.a);
    const sp2 = sprite(pal.b);
    cx.drawImage(sp, W * 0.1 + Math.sin(bgT * 0.05) * 60, H * 0.1, W * 0.5, W * 0.5);
    cx.drawImage(sp2, W * 0.5, H * 0.4 + Math.cos(bgT * 0.04) * 60, W * 0.55, W * 0.55);
    cx.restore();
  } else if (id === 'land') {
    // colinas lejanas
    cx.fillStyle = 'rgba(0,0,0,.18)';
    cx.beginPath();
    cx.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) cx.lineTo(x, H * 0.82 + Math.sin(x * 0.006 + 1) * 40 + Math.sin(x * 0.017) * 14);
    cx.lineTo(W, H);
    cx.fill();
  } else if (id === 'civ') {
    // skyline con ventanas
    cx.fillStyle = 'rgba(0,0,0,.22)';
    let x = 0;
    let k = 0;
    while (x < W) {
      const w = 30 + ((k * 37) % 50);
      const h = 50 + ((k * 53) % 140);
      cx.fillRect(x, H - h, w, h);
      cx.fillStyle = 'rgba(252,211,77,.25)';
      for (let wy = H - h + 10; wy < H - 10; wy += 16)
        for (let wx = x + 6; wx < x + w - 6; wx += 10) if ((wx * 7 + wy * 3 + k) % 5 < 2) cx.fillRect(wx, wy, 4, 6);
      cx.fillStyle = 'rgba(0,0,0,.22)';
      x += w + 4;
      k++;
    }
  }
  cx.save();
  cx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.ph += dt;
    if (p.k === 'swirl') {
      p.ang += (dt * 18) / (p.rad + 40);
      const x = heroBox.x + Math.cos(p.ang) * p.rad;
      const y = heroBox.y + Math.sin(p.ang) * p.rad * 0.6;
      const a = p.a * (0.6 + 0.4 * Math.sin(p.ph * p.blink));
      cx.globalAlpha = a;
      const s = p.r * 4;
      cx.drawImage(sprite(p.c), x - s, y - s, s * 2, s * 2);
      continue;
    }
    p.x += (p.vx || Math.sin(p.ph * 1.3) * 8) * dt;
    p.y += p.vy * dt;
    if (p.k === 'fly') {
      p.vx += (R() - 0.5) * 30 * dt;
      p.vy += (R() - 0.5) * 30 * dt;
      p.vx = Math.max(-20, Math.min(20, p.vx));
      p.vy = Math.max(-20, Math.min(20, p.vy));
    }
    if (p.wrap) {
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20;
      if (p.y > H + 20) p.y = -20;
    } else if (p.y < -30) {
      parts[i] = newPart(false);
      continue;
    }
    if (p.k === 'bubble') {
      cx.globalAlpha = p.a;
      cx.strokeStyle = p.c;
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.arc(p.x + Math.sin(p.ph * 2) * 3, p.y, p.r, 0, Math.PI * 2);
      cx.stroke();
      cx.globalAlpha = p.a * 0.8;
      cx.fillStyle = '#fff';
      cx.beginPath();
      cx.arc(p.x + Math.sin(p.ph * 2) * 3 - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.22, 0, Math.PI * 2);
      cx.fill();
    } else {
      const bl = p.blink ? 0.35 + 0.65 * Math.max(0, Math.sin(p.ph * p.blink)) : 1;
      cx.globalAlpha = p.a * bl;
      const s = p.r * (p.k === 'star' ? 2.5 : 3);
      cx.drawImage(sprite(p.c), p.x - s, p.y - s, s * 2, s * 2);
    }
  }
  // estrella fugaz
  if (id === 'space' || id === 'cosmos') {
    if (!shooting && !still && R() < dt * 0.15) shooting = { x: R() * W, y: R() * H * 0.4, t: 0 };
    if (shooting) {
      shooting.t += dt;
      const k = shooting.t / 0.8;
      if (k > 1) shooting = null;
      else {
        const x = shooting.x + k * 400;
        const y = shooting.y + k * 180;
        const g = cx.createLinearGradient(x - 120, y - 54, x, y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, `rgba(255,255,255,${0.8 * (1 - k)})`);
        cx.globalAlpha = 1;
        cx.strokeStyle = g;
        cx.lineWidth = 2;
        cx.beginPath();
        cx.moveTo(x - 120, y - 54);
        cx.lineTo(x, y);
        cx.stroke();
      }
    }
  }
  cx.restore();
  // tus criaturas orbitan alrededor del organismo
  const owned = E.GENS.filter((gg) => (s.gens[gg.id] || 0) > 0).slice(-10);
  if (owned.length && heroBox.r) {
    const size = Math.max(20, Math.min(34, heroBox.r * 0.22));
    cx.globalAlpha = 0.9;
    owned.forEach((gg, i) => {
      const ring = i % 3;
      const rad = heroBox.r * (1.12 + ring * 0.17);
      const speed = (0.25 - ring * 0.05) * (i % 2 ? 1 : -1);
      const a = bgT * speed + (i / owned.length) * Math.PI * 2;
      const x = heroBox.x + Math.cos(a) * rad;
      const y = heroBox.y + Math.sin(a) * rad;
      const im = orbImg(gg.id);
      if (im.complete) cx.drawImage(im, x - size / 2, y - size / 2 + Math.sin(bgT * 2 + i) * 3, size, size);
    });
    cx.globalAlpha = 1;
  }
}

// ================= bucle =================
let dirty = true;
let last = performance.now();
let fastT = 0;
let slowT = 0;
let saveT = 0;
let measureT = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 2) catchUp(dt, dt > 60);
  else {
    dt = Math.max(0, dt);
    const got = E.tick(s, dt);
    if (got.length) {
      for (const a of got) {
        toast(`${T('ach')}: <b>${N(a.name)}</b> · +1%`);
        sound('ach');
      }
      refreshAch();
    }
  }
  if (!spore && s.time >= s.nextEvent) spawnSpore();
  if (spore && s.time > spore.until) removeSpore(false);

  fastT += dt;
  if (fastT > 0.08 || dirty) {
    fastT = 0;
    setText($('energy'), fmt(s.energy));
    setText($('eps'), fmt(s.eps + E.autoClickRate(s)));
    setText($('click-val'), s.stats.clicks < 8 ? T('hint') : `+${fmt(s.clickVal)} ${T('perClick')}`);
    $('click-val').classList.toggle('hint', s.stats.clicks < 8);
  }
  slowT += dt;
  if (slowT > 0.25 || dirty) {
    slowT = 0;
    refreshGens();
    refreshUps();
    refreshSide();
    refreshTree();
    dirty = false;
  }
  measureT += dt;
  if (measureT > 1) {
    measureT = 0;
    measureHero();
  }
  saveT += dt;
  if (saveT > 5) {
    saveT = 0;
    save();
  }
  drawBg(Math.min(dt, 0.05));
  requestAnimationFrame(frame);
}

// ================= arranque =================
function applyTexts() {
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T(el.dataset.t);
  document.documentElement.lang = G.prefs.lang;
  $('buy-all').textContent = T('buyAll');
}
function boot() {
  // botón "comprar todo" en la pestaña de mejoras
  const ba = document.createElement('button');
  ba.id = 'buy-all';
  ba.className = 'btn buy-all';
  ba.addEventListener('click', buyAll);
  $('ups').before(ba);

  const away = load();
  G.progress(0.4);
  if (!s.nextEvent || s.nextEvent < s.time) scheduleSpore();
  placeSide();
  applyTexts();
  applyEra(true);
  buildTree();
  buildAch();
  resize();
  if (away > 1) catchUp(away, away > 60);
  E.checkAchievements(s);
  refreshAch();
  G.onPrefs(() => {
    applyTexts();
    applyVolume();
    buildGens();
    buildUps(true);
    buildTree();
    buildAch();
    renderPaths();
    seedParticles();
    dirty = true;
  });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => document.hidden && save());
  addEventListener('pagehide', save);
  G.progress(0.8);
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
  const done = () => G.ready();
  Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]).then(done, done);
}
boot();
