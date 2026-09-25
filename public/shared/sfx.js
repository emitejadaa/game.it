/**
 * Sonidos sintetizados con Web Audio, compartidos por los juegos (sin archivos de audio).
 * Respetan el volumen de efectos del portal y se silencian cuando el portal pausa el juego.
 *
 *   import { tone, noise } from '/shared/sfx.js';
 *   tone(440, 880, 0.12, { type: 'triangle', vol: 0.2 });
 *   noise(0.05, { freq: 1800, q: 2, vol: 0.3 });
 */
const G = window.GameIt;
let ac = null;
let out = null;
let noiseBuf = null;

export function unlock() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  out = ac.createGain();
  out.connect(ac.destination);
  const len = ac.sampleRate;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

// el navegador solo deja arrancar el audio después de un gesto del usuario
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { passive: true, capture: true });
G?.onPause?.(() => ac?.suspend().catch(() => {}));
G?.onResume?.(() => ac?.resume().catch(() => {}));

export const vol = () => G?.prefs?.volume?.sfx ?? 0.8;
export const now = () => (ac ? ac.currentTime : 0);
export const ready = () => !!ac && ac.state === 'running' && vol() > 0;

/** Oscilador con barrido de frecuencia y envolvente corta. */
export function tone(f0, f1, dur, { type = 'sine', vol: v = 0.2, at = 0, attack = 0.006 } = {}) {
  if (!ready()) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * vol()), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** Ruido filtrado (golpes, clics, soplidos). */
export function noise(dur, { freq = 1200, q = 1, type = 'bandpass', vol: v = 0.2, at = 0, sweep = 0 } = {}) {
  if (!ready()) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  const t = ac.currentTime + at;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, v * vol()), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.03);
}

/** Varias notas seguidas (arpegios de victoria, etc.). */
export function notes(freqs, { step = 0.09, dur = 0.2, type = 'triangle', vol: v = 0.14 } = {}) {
  freqs.forEach((f, i) => tone(f, f, dur, { type, vol: v, at: i * step }));
}
