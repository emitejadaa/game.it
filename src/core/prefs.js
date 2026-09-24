/**
 * Preferencias globales: se guardan en localStorage y aplican a toda la web y a todos los juegos.
 * Los juegos reciben la versión "resuelta" (ver resolved()) a través del SDK.
 */
const KEY = 'gameit:prefs';
const RESOLVED_KEY = 'gameit:prefs:resolved';

export const ACCENTS = ['cyan', 'magenta', 'lime', 'amber', 'violet', 'red'];

export const DEFAULTS = Object.freeze({
  theme: 'system', // system | dark | light
  accent: 'cyan',
  muted: false,
  volume: 0.8,
  sfx: 1,
  music: 0.6,
  reducedMotion: 'system', // system | on | off
  glow: true,
  showFps: false,
  keys: 'both', // both | arrows | wasd
  touch: 'auto', // auto | on | off
  lang: (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en',
});

const mqDark = matchMedia('(prefers-color-scheme: dark)');
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqCoarse = matchMedia('(pointer: coarse)');

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') {
      const merged = { ...DEFAULTS };
      for (const k in DEFAULTS) if (typeof raw[k] === typeof DEFAULTS[k]) merged[k] = raw[k];
      if (!ACCENTS.includes(merged.accent)) merged.accent = DEFAULTS.accent;
      return merged;
    }
  } catch {}
  return { ...DEFAULTS };
}

export const get = () => state;

export function set(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  emit();
}

export const reset = () => set({ ...DEFAULTS });

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function emit() {
  applyToDocument();
  const r = resolved();
  try {
    localStorage.setItem(RESOLVED_KEY, JSON.stringify(r));
  } catch {}
  subs.forEach((fn) => fn(state, r));
}

export const isDark = () => (state.theme === 'system' ? mqDark.matches : state.theme === 'dark');
export const isReduced = () => (state.reducedMotion === 'system' ? mqReduce.matches : state.reducedMotion === 'on');

export function applyToDocument() {
  const d = document.documentElement;
  d.dataset.theme = isDark() ? 'dark' : 'light';
  d.dataset.accent = state.accent;
  d.dataset.glow = state.glow ? 'on' : 'off';
  d.dataset.motion = isReduced() ? 'reduced' : 'full';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = cssVar('--bg');
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Lo que recibe cada juego: valores ya resueltos, listos para usar. */
export function resolved() {
  const theme = isDark() ? 'dark' : 'light';
  const colors = {
    bg: cssVar('--bg'),
    surface: cssVar('--surface'),
    fg: cssVar('--fg'),
    mute: cssVar('--mute'),
    line: cssVar('--line2'),
    accent: cssVar('--accent'),
  };
  for (const a of ACCENTS) colors[a] = cssVar(`--c-${a}`);
  const m = state.muted ? 0 : state.volume;
  return {
    theme,
    accent: state.accent,
    colors,
    volume: { master: m, sfx: m * state.sfx, music: m * state.music, muted: state.muted },
    reducedMotion: isReduced(),
    glow: state.glow,
    showFps: state.showFps,
    keys: state.keys,
    touch: state.touch === 'on' || (state.touch === 'auto' && mqCoarse.matches),
    lang: state.lang,
  };
}

mqDark.addEventListener('change', () => state.theme === 'system' && emit());
mqReduce.addEventListener('change', () => state.reducedMotion === 'system' && emit());

// Otra pestaña cambió las preferencias.
addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    emit();
  }
});

export const init = () => emit();
