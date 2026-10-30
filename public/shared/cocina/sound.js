/**
 * Cocina — sonidos: efectos cortos sobre /shared/sfx.js y ruidos continuos (horno, parrilla, licuadora) que se
 * prenden y apagan con una rampa suave. Todo respeta el volumen de efectos del portal.
 */
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const vol = () => (G?.prefs?.volume?.sfx ?? 0.8);

export const sfx = {
  tap: () => tone(720, 900, 0.05, { type: 'triangle', vol: 0.07 }),
  pick: () => tone(520, 780, 0.08, { type: 'sine', vol: 0.12 }),
  drop: () => noise(0.06, { freq: 700, q: 1.2, vol: 0.2 }),
  plop: () => tone(300, 140, 0.09, { type: 'sine', vol: 0.18 }),
  squish: () => noise(0.12, { freq: 500, q: 2, vol: 0.18, sweep: 220 }),
  spread: () => noise(0.05, { freq: 1700, q: 0.8, vol: 0.05 }),
  shake: () => noise(0.04, { freq: 5200, q: 3, vol: 0.06 }),
  bell: () => notes([1568, 2093], { step: 0.07, dur: 0.5, type: 'sine', vol: 0.12 }),
  door: () => notes([1320, 990], { step: 0.11, dur: 0.35, type: 'sine', vol: 0.1 }),
  paper: () => noise(0.22, { freq: 3200, q: 0.6, vol: 0.12, sweep: 1500 }),
  whoosh: () => noise(0.18, { freq: 600, q: 0.7, vol: 0.12, sweep: 2400 }),
  ding: () => notes([1760, 2637], { step: 0.05, dur: 0.6, type: 'sine', vol: 0.12 }),
  alarm: () => notes([1175, 1175, 1175], { step: 0.14, dur: 0.1, type: 'square', vol: 0.05 }),
  cut: () => noise(0.14, { freq: 2600, q: 4, vol: 0.12, sweep: 900 }),
  cash: () => {
    noise(0.05, { freq: 4000, q: 2, vol: 0.12 });
    notes([1568, 2093, 2637], { step: 0.06, dur: 0.25, type: 'triangle', vol: 0.1 });
  },
  coin: (k = 0) => tone(1500 + k * 120, 2400 + k * 120, 0.08, { type: 'triangle', vol: 0.07 }),
  yay: () => notes([523, 659, 784, 1047], { step: 0.09, dur: 0.25, type: 'triangle', vol: 0.12 }),
  ok: () => notes([523, 659], { step: 0.1, dur: 0.22, type: 'triangle', vol: 0.1 }),
  meh: () => notes([392, 330], { step: 0.16, dur: 0.3, type: 'triangle', vol: 0.1 }),
  sad: () => notes([392, 311, 262], { step: 0.17, dur: 0.35, type: 'sawtooth', vol: 0.05 }),
  rank: () => notes([523, 659, 784, 1047, 1319, 1568], { step: 0.08, dur: 0.3, type: 'triangle', vol: 0.12 }),
  error: () => tone(220, 160, 0.16, { type: 'square', vol: 0.05 }),
  pour: () => noise(0.25, { freq: 900, q: 1.5, vol: 0.08, sweep: 500 }),
};

// ---------------------------------------------------------------- ruidos continuos
const loops = {};
let buf = null;

function ensure(ac) {
  if (buf) return buf;
  const len = ac.sampleRate * 2;
  buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) {
    b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); // ruido marrón suave mezclado con blanco
    d[i] = b * 4 + (Math.random() * 2 - 1) * 0.35;
  }
  return buf;
}

/**
 * Prende o apaga un ruido continuo. `level` (0..1) permite variarlo en vivo (p. ej. la licuadora más fuerte).
 * kind: 'sizzle' (chisporroteo), 'hum' (horno), 'whirr' (licuadora), 'pour' (chorro).
 */
export function loop(name, on, level = 1, kind = 'hum') {
  const ac = on ? unlock() : null;
  let L = loops[name];
  if (!L && (!on || !ac)) return;
  if (!L) {
    const src = ac.createBufferSource();
    src.buffer = ensure(ac);
    src.loop = true;
    const f = ac.createBiquadFilter();
    const P = {
      sizzle: { type: 'highpass', f: 2600, q: 0.6, v: 0.05 },
      hum: { type: 'lowpass', f: 260, q: 1.2, v: 0.18 },
      whirr: { type: 'bandpass', f: 520, q: 1.4, v: 0.16 },
      pour: { type: 'bandpass', f: 1100, q: 1.1, v: 0.12 },
    }[kind];
    f.type = P.type;
    f.frequency.value = P.f;
    f.Q.value = P.q;
    const gn = ac.createGain();
    gn.gain.value = 0;
    src.connect(f).connect(gn).connect(ac.destination);
    src.start();
    L = loops[name] = { src, f, gn, base: P.v, freq: P.f, ac };
  }
  const t = L.ac.currentTime;
  const target = on ? L.base * vol() * level : 0;
  L.gn.gain.cancelScheduledValues(t);
  L.gn.gain.setTargetAtTime(target, t, on ? 0.05 : 0.08);
  if (on && level) L.f.frequency.setTargetAtTime(L.freq * (0.8 + level * 0.4), t, 0.1);
}

/** Apaga todos los ruidos continuos (fin del día, pausa larga). */
export function quiet() {
  for (const k in loops) loop(k, false);
}
