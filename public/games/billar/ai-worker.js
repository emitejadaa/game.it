/** Billar — la computadora piensa en un worker (simula decenas de tiros sin trabar la pantalla). */
import { plan } from './shared/ai.js';

self.onmessage = ({ data }) => {
  const { id, state, level, seed } = data;
  let s = seed % 2147483646 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  self.postMessage({ id, plan: plan(state.balls, state, level, rnd) });
};
