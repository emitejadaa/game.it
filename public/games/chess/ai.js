/** Ajedrez — la computadora piensa en un worker para no trabar la pantalla. */
import { Engine, LEVELS } from './shared/engine.js';
import { replay } from './shared/rules.js';

const engine = new Engine();

self.onmessage = ({ data }) => {
  const { id, moves, level, hint } = data;
  const r = replay(moves || []);
  if (!r) return self.postMessage({ id, uci: null });
  let o = hint ? { time: 900 } : { ...LEVELS[level] };
  // aperturas variadas: en las primeras jugadas elige entre las buenas con un poco de azar
  if (!hint && level >= 3 && r.pos.keys.length < 9) o = { time: Math.min(o.time, 700), depth: 4, noise: level >= 4 ? 9 : 16 };
  const res = engine.think(r.pos, o);
  self.postMessage({ id, uci: res.uci || null, score: res.score, depth: res.depth });
};
