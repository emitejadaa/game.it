/**
 * Sonidos sintetizados (sin archivos): usa /shared/sfx.js del portal, que respeta el volumen de
 * efectos y se calla cuando el portal pausa el juego. El chisporroteo de la freidora es un ruido
 * continuo que sube según cuántas donas hay en el aceite.
 */
import { tone, noise, notes, unlock, vol } from '/shared/sfx.js';

const SONIDOS = {
  click: () => tone(660, 520, 0.05, { type: 'triangle', vol: 0.12 }),
  no: () => tone(220, 160, 0.14, { type: 'square', vol: 0.06 }),
  llega: () => {
    tone(1568, 1568, 0.5, { type: 'triangle', vol: 0.1 });
    tone(2093, 2093, 0.45, { type: 'triangle', vol: 0.07, at: 0.12 });
  },
  exigente: () => notes([392, 466, 554], { step: 0.12, dur: 0.24, type: 'triangle', vol: 0.12 }),
  pedido: () => notes([660, 880], { step: 0.07, dur: 0.12, vol: 0.12 }),
  ticket: () => {
    for (let i = 0; i < 4; i++) noise(0.03, { freq: 3200, q: 2, vol: 0.12, at: i * 0.05 });
  },
  masa: () => noise(0.18, { freq: 300, q: 0.8, vol: 0.25, type: 'lowpass' }),
  estirar: () => noise(0.16, { freq: 500, q: 0.7, vol: 0.14, sweep: 260 }),
  cortar: () => {
    tone(420, 180, 0.08, { type: 'triangle', vol: 0.16 });
    noise(0.04, { freq: 2600, q: 3, vol: 0.12 });
  },
  listo: () => notes([784, 988, 1175], { step: 0.06, dur: 0.12, vol: 0.1 }),
  aFreir: () => notes([523, 659], { step: 0.08, dur: 0.14, vol: 0.1 }),
  aceite: () => noise(0.5, { freq: 2400, q: 0.6, vol: 0.22, sweep: 900 }),
  vuelta: () => tone(380, 640, 0.09, { type: 'sine', vol: 0.18 }),
  sacar: () => tone(520, 320, 0.1, { type: 'triangle', vol: 0.14 }),
  punto: () => tone(1046, 1046, 0.18, { type: 'sine', vol: 0.12 }),
  quema: () => tone(150, 120, 0.3, { type: 'sawtooth', vol: 0.06 }),
  tirar: () => noise(0.22, { freq: 600, q: 1, vol: 0.2, sweep: 200 }),
  relleno: () => noise(0.12, { freq: 900, q: 4, vol: 0.12, sweep: 500 }),
  bano: () => tone(260, 170, 0.14, { type: 'sine', vol: 0.12 }),
  hilos: () => noise(0.08, { freq: 4200, q: 3, vol: 0.06 }),
  topping: () => noise(0.025, { freq: 6000, q: 5, vol: 0.05 }),
  pieza: () => tone(880, 1320, 0.06, { type: 'sine', vol: 0.12 }),
  caja: () => {
    noise(0.05, { freq: 5000, q: 4, vol: 0.12 });
    notes([1568, 2093], { step: 0.08, dur: 0.18, type: 'triangle', vol: 0.1 });
  },
  feliz: () => notes([523, 659, 784, 1046], { step: 0.08, dur: 0.18, vol: 0.12 }),
  bien: () => notes([523, 659, 784], { step: 0.09, dur: 0.18, vol: 0.1 }),
  mal: () => notes([392, 330, 262], { step: 0.12, dur: 0.22, vol: 0.1 }),
  barra: () => tone(500, 900, 0.12, { type: 'triangle', vol: 0.07 }),
  logro: () => notes([659, 784, 988, 1319], { step: 0.1, dur: 0.25, vol: 0.12 }),
  dia: () => notes([523, 659, 784, 659, 784, 1046], { step: 0.11, dur: 0.22, vol: 0.12 }),
  comprar: () => notes([988, 1319], { step: 0.07, dur: 0.16, type: 'triangle', vol: 0.12 }),
};

export function snd(nombre) {
  try {
    SONIDOS[nombre]?.();
  } catch {}
}

// ---------------------------------------------------------------- chisporroteo de la freidora

let fuente = null;
let ganancia = null;

/** n: donas en el aceite; cerca: si estás mirando la freidora (suena más fuerte). */
export function chisporroteo(n, cerca, pausado) {
  const ac = n ? unlock() : null;
  if (!ac || ac.state !== 'running') {
    if (ganancia) ganancia.gain.value = 0;
    return;
  }
  if (!fuente) {
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    // chisporroteo: ruido con chasquidos sueltos
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.004 ? 1 : 0.25);
    fuente = ac.createBufferSource();
    fuente.buffer = buf;
    fuente.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    ganancia = ac.createGain();
    ganancia.gain.value = 0;
    fuente.connect(f).connect(ganancia).connect(ac.destination);
    fuente.start();
  }
  const objetivo = pausado ? 0 : Math.min(1, n / 3) * (cerca ? 0.09 : 0.03) * vol();
  ganancia.gain.setTargetAtTime(objetivo, ac.currentTime, 0.15);
}

// ---------------------------------------------------------------- música de fondo

/*
 * Música lenta y tranquila, sintetizada: acordes suaves de piano eléctrico (Fa7M, Mim7, Rem7, Do7M),
 * un bajo y una melodía que aparece de a ratos, con un poco de eco. Usa el volumen de música del
 * portal (no el de efectos) y se puede apagar desde la pausa.
 */
const G = window.GameIt;
const ACORDES = [
  [53, 57, 60, 64],
  [52, 55, 59, 62],
  [50, 53, 57, 60],
  [48, 52, 55, 59],
];
const MELODIA = [65, 67, 69, 72, 74, 76, 77, 79];
const PULSO = 60 / 64; // 64 pulsos por minuto
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

let acMus = null;
let mus = null;

function volumenMusica() {
  const v = G?.prefs?.volume;
  if (!v) return 0.48;
  return v.muted ? 0 : v.music ?? 0.48;
}

function armar(ac) {
  const salida = ac.createGain();
  salida.gain.value = 0;
  salida.connect(ac.destination);
  const filtro = ac.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 1700;
  filtro.connect(salida);
  // eco suave
  const eco = ac.createDelay(1);
  eco.delayTime.value = PULSO * 0.75;
  const vuelta = ac.createGain();
  vuelta.gain.value = 0.28;
  const mezcla = ac.createGain();
  mezcla.gain.value = 0.22;
  filtro.connect(eco);
  eco.connect(vuelta).connect(eco);
  eco.connect(mezcla).connect(salida);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  return { salida, entrada: filtro, prox: ac.currentTime + 0.3, pulso: 0, rnd, previa: 4 };
}

function nota(ac, destino, f, t, dur, v) {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.value = f;
  const o2 = ac.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = f * 2;
  const g2 = ac.createGain();
  g2.gain.value = 0.1;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(destino);
  o.start(t);
  o2.start(t);
  o.stop(t + dur + 0.05);
  o2.stop(t + dur + 0.05);
}

function tocarPulso(ac, M, t) {
  const i = M.pulso++;
  const compas = Math.floor(i / 4);
  const tiempo = i % 4;
  const acorde = ACORDES[compas % 4];
  if (tiempo === 0) {
    acorde.forEach((n, k) => nota(ac, M.entrada, hz(n), t + k * 0.035, PULSO * 3.8, 0.05));
    nota(ac, M.entrada, hz(acorde[0] - 12), t, PULSO * 3.4, 0.08);
  } else if (tiempo === 2) {
    acorde.slice(1).forEach((n, k) => nota(ac, M.entrada, hz(n), t + k * 0.03, PULSO * 1.6, 0.025));
  }
  // la melodía: algunas notas sueltas, cerca de la anterior; cada tanto un compás en silencio
  if (compas % 8 !== 7 && M.rnd() < (tiempo === 0 ? 0.55 : 0.35)) {
    M.previa = Math.max(0, Math.min(MELODIA.length - 1, M.previa + Math.round((M.rnd() - 0.5) * 4)));
    nota(ac, M.entrada, hz(MELODIA[M.previa]), t + (M.rnd() < 0.3 ? PULSO / 2 : 0), PULSO * 1.6, 0.045);
  }
}

/** Llamar en cada cuadro: programa la música un poquito adelante. encendida: si el jugador la quiere. */
export function musicaFondo(encendida, pausadoPortal) {
  if (!acMus) acMus = unlock();
  const ac = acMus;
  if (!ac || ac.state !== 'running') return;
  if (!mus) mus = armar(ac);
  const objetivo = encendida && !pausadoPortal ? volumenMusica() * 0.55 : 0;
  mus.salida.gain.setTargetAtTime(objetivo, ac.currentTime, 0.6);
  if (!objetivo) return;
  // si el audio estuvo frenado, retomar desde ahora (sin tocar de golpe lo atrasado)
  if (mus.prox < ac.currentTime - 0.1) mus.prox = ac.currentTime + 0.1;
  while (mus.prox < ac.currentTime + 1.2) {
    tocarPulso(ac, mus, mus.prox);
    mus.prox += PULSO;
  }
}
