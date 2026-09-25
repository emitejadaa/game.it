/** Clashball — sonidos sintetizados con Web Audio (sin archivos). Respeta el volumen del portal. */
const G = window.GameIt;
let ac = null;
let noiseBuf = null;
let master = null;

export function unlock() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.connect(ac.destination);
  const len = ac.sampleRate;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export const suspend = () => ac?.suspend();
export const resume = () => ac?.resume();

const vol = () => (G?.prefs?.volume?.sfx ?? 0.8);

function tone(f0, f1, dur, type, v, at = 0) {
  if (!ac || !vol()) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v * vol(), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur, v, freq, q = 1, type = 'bandpass', at = 0, attack = 0.005) {
  if (!ac || !vol()) return;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  const t = ac.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v * vol(), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

function whistle(at, dur) {
  if (!ac || !vol()) return;
  const o = ac.createOscillator();
  const lfo = ac.createOscillator();
  const lg = ac.createGain();
  const g = ac.createGain();
  const t = ac.currentTime + at;
  o.type = 'sine';
  o.frequency.value = 2650;
  lfo.frequency.value = 38;
  lg.gain.value = 70;
  lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09 * vol(), t + 0.02);
  g.gain.setValueAtTime(0.09 * vol(), t + dur - 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}

export function play(k, v = 1) {
  switch (k) {
    case 'kick':
      tone(160, 55, 0.12, 'sine', 0.5);
      noise(0.05, 0.25, 1800, 0.8);
      break;
    case 'touch':
      tone(120, 70, 0.06, 'sine', Math.min(0.22, 0.05 + v * 0.05));
      break;
    case 'wall':
      noise(0.05, Math.min(0.14, 0.03 + v * 0.02), 900, 1.2);
      break;
    case 'post':
      [880, 1320, 1760].forEach((f, i) => tone(f, f * 0.98, 0.35 - i * 0.08, 'triangle', 0.12 / (i + 1)));
      break;
    case 'whistle':
      whistle(0, 0.32);
      break;
    case 'end':
      whistle(0, 0.25);
      whistle(0.35, 0.25);
      whistle(0.7, 0.7);
      break;
    case 'goal':
      noise(2.4, 0.22, 700, 0.4, 'lowpass', 0, 0.25);
      noise(1.6, 0.12, 2400, 0.6, 'bandpass', 0.1, 0.2);
      [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'square', 0.05, 0.05 + i * 0.09));
      break;
    case 'ui':
      tone(900, 620, 0.05, 'triangle', 0.08);
      break;
    case 'chat':
      tone(1200, 1500, 0.06, 'sine', 0.05);
      break;
  }
}
