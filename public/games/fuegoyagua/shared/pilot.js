/**
 * Fuego y Agua — piloto automático: ejecuta un guion por personaje (correr hasta un punto, saltar en un lugar,
 * esperar a que se mueva algo, avisarle al otro…) y devuelve las teclas de cada paso. Lo usan las pruebas (cada
 * nivel tiene su solución y se comprueba que gana con todas las gemas) y la demo de la pantalla de inicio.
 *
 * Comandos: ['go', x] · ['jump', x] · ['jumpAt', xGatillo, x] · ['wait', s] · ['until', (W) => bool]
 *           (el x de un salto puede ser una función del mundo, para caer sobre una plataforma que se mueve)
 *           ['signal', nombre] · ['await', nombre] · ['hold', 'l'|'r', s]
 */
import { DT, P } from './sim.js';

export function pilot(script) {
  const state = { F: { i: 0, t: 0, air: false, jumped: false }, W: { i: 0, t: 0, air: false, jumped: false } };
  const flags = new Set();
  const brake = (v) => (v * v) / (2 * P.accG);
  function drive(W, k) {
    const s = state[k];
    const list = script[k] || [];
    const c = W.chars[k];
    const inp = { l: false, r: false, u: false };
    for (let guard = 0; guard < 4; guard++) {
      const cmd = list[s.i];
      if (!cmd) return inp;
      const [op, a, b] = cmd;
      const steer = (x, tol = 0.08) => {
        const dx = x - c.x;
        if (Math.abs(dx) > brake(Math.abs(c.vx)) + tol || (Math.sign(c.vx) !== Math.sign(dx) && Math.abs(dx) > tol)) {
          if (dx > 0) inp.r = true;
          else inp.l = true;
        }
        return dx;
      };
      const next = () => {
        s.i++;
        s.t = 0;
        s.air = false;
        s.jumped = false;
      };
      if (op === 'go') {
        const dx = steer(a);
        if (Math.abs(dx) < 0.16 && Math.abs(c.vx) < 0.6 && c.ground) {
          next();
          continue;
        }
        return inp;
      }
      if (op === 'jump' || op === 'jumpAt') {
        const tg = op === 'jump' ? a : b;
        const target = typeof tg === 'function' ? tg(W) : tg;
        if (!s.jumped) {
          const trig = op === 'jump' ? c.x : a;
          const dir = Math.sign(target - c.x);
          const passed = op === 'jump' || (dir > 0 ? c.x >= trig : c.x <= trig);
          if (passed && c.ground) {
            inp.u = true;
            s.jumped = true;
            s.from = W.steps;
          }
          if (dir > 0) inp.r = true;
          else if (dir < 0) inp.l = true;
          return inp;
        }
        if (!c.ground) s.air = true;
        steer(target, 0.05);
        if (s.air && c.ground) {
          next();
          continue;
        }
        if (!s.air && W.steps - s.from > 30) {
          // no despegó (techo o lo empujaron): se reintenta
          s.jumped = false;
        }
        return inp;
      }
      if (op === 'hold') {
        s.t += DT;
        inp[a] = true;
        if (s.t >= b) {
          next();
          continue;
        }
        return inp;
      }
      if (op === 'wait') {
        s.t += DT;
        if (s.t >= a) {
          next();
          continue;
        }
        return inp;
      }
      if (op === 'until') {
        if (a(W)) {
          next();
          continue;
        }
        if (b != null) steer(b);
        return inp;
      }
      if (op === 'signal') {
        flags.add(a);
        next();
        continue;
      }
      if (op === 'await') {
        if (flags.has(a)) {
          next();
          continue;
        }
        if (b != null) steer(b);
        return inp;
      }
      throw new Error(`comando desconocido: ${op}`);
    }
    return inp;
  }
  return {
    input: (W) => ({ F: drive(W, 'F'), W: drive(W, 'W') }),
    done: () => state.F.i >= (script.F || []).length && state.W.i >= (script.W || []).length,
    where: () => ({ F: state.F.i, W: state.W.i }),
  };
}
