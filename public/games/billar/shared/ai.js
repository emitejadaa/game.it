/**
 * Billar — la computadora: busca tiros posibles (bola fantasma hacia cada tronera con el camino
 * libre), los simula con la física real variando fuerza y efecto, y elige el que emboca y deja
 * mejor la blanca. Si no hay tiro, juega de seguridad. El error de puntería depende del nivel.
 */
import { R, L, W, POCKET_AIM, HEAD_X, MAX_SPEED, cloneBalls, simulate, strike, canPlace } from './physics.js';
import { judge, legalTargets } from './rules.js';

export const LEVELS = [null, { noise: 0.05, cands: 3, spins: [0] }, { noise: 0.021, cands: 5, spins: [0, -0.45] }, { noise: 0.008, cands: 7, spins: [0, -0.45, 0.4] }];

/** ¿Hay alguna bola (salvo las ignoradas) en el camino de (x1,y1) a (x2,y2)? */
function clear(balls, x1, y1, x2, y2, ignore) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const lim = (2 * R - 0.1) ** 2;
  for (const b of balls) {
    if (!b.on || ignore.includes(b.n)) continue;
    let t = ((b.x - x1) * dx + (b.y - y1) * dy) / len2;
    if (t <= 0 || t >= 1) continue;
    const cx = x1 + dx * t - b.x;
    const cy = y1 + dy * t - b.y;
    if (cx * cx + cy * cy < lim) return false;
  }
  return true;
}

/** Tiros directos posibles, del más fácil al más difícil. */
export function candidates(balls, state) {
  const cue = balls[0];
  const out = [];
  for (const n of legalTargets(state, state.turn)) {
    const t = balls.find((b) => b.n === n);
    if (!t?.on) continue;
    POCKET_AIM.forEach(([ax, ay], pocket) => {
      let ux = ax - t.x;
      let uy = ay - t.y;
      const d2 = Math.hypot(ux, uy);
      ux /= d2;
      uy /= d2;
      // a las troneras del medio no se entra de costado
      if ((pocket === 1 || pocket === 4) && Math.abs(uy) < 0.42) return;
      const gx = t.x - ux * 2 * R;
      const gy = t.y - uy * 2 * R;
      let cx = gx - cue.x;
      let cy = gy - cue.y;
      const cd = Math.hypot(cx, cy);
      if (cd < 0.5) return;
      cx /= cd;
      cy /= cd;
      const cut = cx * ux + cy * uy;
      if (cut < 0.22) return;
      if (!clear(balls, cue.x, cue.y, gx, gy, [0, n])) return;
      if (!clear(balls, t.x, t.y, ax, ay, [n])) return;
      out.push({ n, pocket, dir: [cx, cy], cut, cd, d2, diff: cd / 110 + d2 / 90 + (1 - cut) * 3.2 });
    });
  }
  return out.sort((a, b) => a.diff - b.diff);
}

function gauss(rnd) {
  return (rnd() + rnd() + rnd() - 1.5) * 1.15;
}

/** Dónde dejar la blanca con bola en mano. */
function placeCue(balls, state, rnd) {
  const kitchen = state.kitchen;
  if (state.brk) {
    for (let k = 0; k < 20; k++) {
      const x = HEAD_X - 4 - rnd() * 8;
      const y = W / 2 + (rnd() - 0.5) * 24;
      if (canPlace(balls, x, y, true)) return [x, y];
    }
  }
  let best = null;
  for (const n of legalTargets(state, state.turn)) {
    const t = balls.find((b) => b.n === n);
    if (!t?.on) continue;
    POCKET_AIM.forEach(([ax, ay]) => {
      let ux = ax - t.x;
      let uy = ay - t.y;
      const d = Math.hypot(ux, uy);
      ux /= d;
      uy /= d;
      if (!clear(balls, t.x, t.y, ax, ay, [n, 0])) return;
      for (const back of [22, 34, 48]) {
        const x = t.x - ux * (2 * R + back);
        const y = t.y - uy * (2 * R + back);
        if (!canPlace(balls, x, y, kitchen)) continue;
        if (!clear(balls, x, y, t.x - ux * 2 * R, t.y - uy * 2 * R, [0, n])) continue;
        const score = d / 90 + back / 200;
        if (!best || score < best.score) best = { score, x, y };
      }
    });
  }
  if (best) return [best.x, best.y];
  for (let k = 0; k < 200; k++) {
    const x = R + rnd() * (kitchen ? HEAD_X - R : L - 2 * R);
    const y = R + rnd() * (W - 2 * R);
    if (canPlace(balls, x, y, kitchen)) return [x, y];
  }
  return [HEAD_X - 5, W / 2];
}

/**
 * Elige el tiro. Devuelve { cue: [x, y] | null, dir: [dx, dy], speed, spinX, spinY, call }.
 */
export function plan(balls, state, level = 2, rnd = Math.random) {
  const L_ = LEVELS[level] || LEVELS[2];
  const p = state.turn;
  const work = cloneBalls(balls);
  let cuePos = null;
  if (state.inHand) {
    cuePos = placeCue(work, state, rnd);
    work[0].x = cuePos[0];
    work[0].y = cuePos[1];
    work[0].on = true;
  }
  const finish = (dir, speed, spinY, call) => {
    // error humano según el nivel
    const a = Math.atan2(dir[1], dir[0]) + gauss(rnd) * L_.noise;
    const sp = Math.max(60, Math.min(MAX_SPEED, speed * (1 + gauss(rnd) * L_.noise * 2)));
    return { cue: cuePos, dir: [Math.cos(a), Math.sin(a)], speed: sp, spinX: 0, spinY, call };
  };
  if (state.brk) {
    const apex = work.filter((b) => b.on && b.n !== 0).reduce((a, b) => (b.x < a.x ? b : a));
    let dx = apex.x - work[0].x;
    let dy = apex.y - work[0].y + (rnd() - 0.5) * 1.2;
    const d = Math.hypot(dx, dy);
    return finish([dx / d, dy / d], MAX_SPEED * (0.88 + rnd() * 0.1), 0.15, null);
  }
  const trial = (dir, speed, spinY, call) => {
    const sim = cloneBalls(work);
    Object.assign(sim[0], strike(dir[0], dir[1], speed, 0, spinY));
    sim[0].rest = false;
    const ev = simulate(sim);
    return judge({ ...state, balls: work, inHand: false }, sim, ev, call);
  };
  let best = null;
  for (const c of candidates(work, state).slice(0, L_.cands)) {
    const base = 80 + (c.cd + c.d2 / Math.max(0.35, c.cut)) * 0.95;
    for (const k of [0.8, 1.15, 1.6]) {
      const speed = Math.max(70, Math.min(MAX_SPEED * 0.9, base * k));
      for (const spinY of L_.spins) {
        const call = c.n === 8 ? c.pocket : null;
        const { state: ns, summary } = trial(c.dir, speed, spinY, call);
        let score;
        if (ns.winner === p) score = 1000;
        else if (ns.winner !== null) score = -1000;
        else if (summary.foul) score = -200;
        else if (summary.continues) {
          const next = candidates(ns.balls, ns)[0];
          score = 100 + (next ? 60 / (1 + next.diff) : 0) - c.diff * 4;
        } else score = -c.diff;
        if (!best || score > best.score) best = { score, dir: c.dir, speed, spinY, call };
      }
    }
    if (best && best.score >= 1000) break;
  }
  if (best && best.score > 50) return finish(best.dir, best.speed, best.spinY, best.call);

  // seguridad: pegarle a una propia sin cometer falta
  let safe = null;
  for (const n of legalTargets(state, p)) {
    const t = work.find((b) => b.n === n);
    if (!t?.on) continue;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
      let dx = t.x + (-(t.y - work[0].y) / 40) * off * R - work[0].x;
      let dy = t.y + ((t.x - work[0].x) / 40) * off * R - work[0].y;
      const d = Math.hypot(dx, dy);
      if (!clear(work, work[0].x, work[0].y, t.x, t.y, [0, n])) continue;
      for (const speed of [110, 180, 260]) {
        const { state: ns, summary } = trial([dx / d, dy / d], speed, 0, null);
        if (ns.winner !== null && ns.winner !== p) continue;
        let score = summary.foul ? -200 : summary.continues ? 120 : 20;
        if (!summary.foul && !summary.continues) {
          const opp = candidates(ns.balls, { ...ns, turn: 1 - p })[0];
          score += opp ? opp.diff * 8 : 40;
        }
        if (!safe || score > safe.score) safe = { score, dir: [dx / d, dy / d], speed };
      }
    }
    if (safe && safe.score > 60) break;
  }
  if (best && (!safe || best.score >= safe.score)) return finish(best.dir, best.speed, best.spinY, best.call);
  if (safe) return finish(safe.dir, safe.speed, 0, null);
  // último recurso: directo a la primera bola legal
  const n = legalTargets(state, p)[0];
  const t = work.find((b) => b.n === n) || work[1];
  const dx = t.x - work[0].x;
  const dy = t.y - work[0].y;
  const d = Math.hypot(dx, dy) || 1;
  return finish([dx / d, dy / d], 220, 0, n === 8 ? 0 : null);
}
