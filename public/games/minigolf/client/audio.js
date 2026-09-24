/** Sonidos sintetizados (sin archivos): golpes, rebotes, agua, hoyo y celebraciones. */
const G = window.GameIt;
let ctx = null;
let sfx = null;
let music = null;

export function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  sfx = ctx.createGain();
  music = ctx.createGain();
  sfx.connect(ctx.destination);
  music.connect(ctx.destination);
  volumes();
}

export function volumes() {
  if (!ctx) return;
  sfx.gain.value = G.prefs.volume.sfx * 0.6;
  music.gain.value = G.prefs.volume.music * 0.5;
}

export const pause = (v) => ctx && (v ? ctx.suspend() : ctx.resume());

function tone(f0, f1, dur, { type = 'sine', vol = 0.3, at = 0, bus } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || sfx);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, { vol = 0.3, at = 0, freq = 1200, q = 0.8 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(sfx);
  src.start(t);
}

const notes = (list, { type = 'triangle', vol = 0.18, step = 0.11, bus } = {}) =>
  list.forEach((f, i) => f && tone(f, f * 1.001, step * 1.6, { type, vol, at: i * step, bus: bus || music }));

export const S = {
  putt: (p) => {
    tone(900, 500, 0.06, { type: 'square', vol: 0.12 + p * 0.15 });
    noise(0.05, { vol: 0.25, freq: 2500 });
  },
  wall: (v) => tone(180, 90, 0.09, { type: 'triangle', vol: Math.min(0.35, v / 1500) }),
  bumper: () => {
    tone(300, 900, 0.12, { type: 'square', vol: 0.12 });
    tone(600, 1200, 0.1, { vol: 0.15, at: 0.03 });
  },
  mover: () => tone(220, 120, 0.1, { type: 'square', vol: 0.12 }),
  water: () => {
    noise(0.5, { vol: 0.5, freq: 700, q: 0.6 });
    tone(500, 120, 0.35, { vol: 0.12 });
  },
  sand: () => noise(0.25, { vol: 0.25, freq: 3000, q: 0.4 }),
  portal: () => tone(300, 1600, 0.3, { type: 'sine', vol: 0.2 }),
  boost: () => tone(200, 1200, 0.25, { type: 'sawtooth', vol: 0.1 }),
  cup: () => {
    [0, 0.07, 0.13].forEach((at) => tone(1500, 1400, 0.05, { type: 'square', vol: 0.08, at }));
    tone(660, 660, 0.2, { type: 'triangle', vol: 0.2, at: 0.2 });
    tone(990, 990, 0.3, { type: 'triangle', vol: 0.2, at: 0.3 });
  },
  good: () => notes([523, 659, 784, 1047]),
  great: () => notes([523, 659, 784, 1047, 784, 1047, 1319], { step: 0.09 }),
  meh: () => notes([392, 392], { step: 0.14 }),
  bad: () => notes([392, 370, 349, 262], { type: 'sawtooth', vol: 0.08, step: 0.18 }),
  win: () => notes([523, 523, 523, 698, 880, 784, 698, 880, 1047], { step: 0.12 }),
  lose: () => notes([392, 330, 262, 196], { type: 'sawtooth', vol: 0.08, step: 0.24 }),
  click: () => tone(700, 500, 0.04, { type: 'square', vol: 0.06 }),
  tick: () => tone(1200, 1200, 0.03, { type: 'square', vol: 0.04 }),
};
