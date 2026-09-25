/**
 * Ameba — bots: comen, huyen de los más grandes, persiguen a los más chicos, esquivan esporas
 * cuando son grandes y a veces se dividen para cazar. Tres niveles de viveza.
 */
import { CFG } from './world.js';

export const BOT_NAMES = ['Blub', 'Mochi', 'Kiwi', 'Tofu', 'Nube', 'Rayo', 'Luna', 'Toto', 'Sopa', 'Zeta', 'Gomita', 'Coco', 'Chispa', 'Orbit', 'Dino', 'Pompón', 'Moco', 'Flan', 'Bizcocho', 'Pixel', 'Nacho', 'Mora', 'Jalea', 'Burbu', 'Quark', 'Nova', 'Yoyo', 'Momo', 'Pelusa', 'Nieve'];

export function brain(level, rnd) {
  return { level, next: 0, wander: null, aggro: 0.4 + rnd() * 0.6 };
}

function nearestFood(world, x, y, reach) {
  let best = null;
  let bd = reach * reach;
  world.range(x - reach, y - reach, x + reach, y + reach, (bi) => {
    for (const i of world.foodB[bi]) {
      const d = (world.foodX[i] - x) ** 2 + (world.foodY[i] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  });
  return best === null ? null : [world.foodX[best], world.foodY[best]];
}

export function think(world, p, b) {
  if (!p.alive || world.tick < b.next) return;
  // los más vivos deciden más seguido
  b.next = world.tick + [0, 6, 4, 3][b.level] + ((world.rnd() * 3) | 0);
  let big = p.cells[0];
  for (const c of p.cells) if (c.m > big.m) big = c;
  const [cx, cy] = world.centroid(p);
  const myM = big.m;
  const myR = big.r;
  const look = [0, 360, 480, 600][b.level] + myR * 3;
  let fx = 0;
  let fy = 0;
  let threat = false;
  let prey = null;
  let preyScore = 0;
  let virus = null;
  world.range(cx - look, cy - look, cx + look, cy + look, (bi) => {
    for (const e of world.buckets[bi]) {
      if (e.dead) continue;
      const dx = e.x - cx;
      const dy = e.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (e.kind === 0) {
        if (e.owner === p.num) continue;
        if (e.m > myM * CFG.eatRatio * 0.95) {
          // amenaza (y más lejos si puede dividirse para cazarme)
          const danger = e.r + myR + 160 + (e.m > myM * 2.6 ? 300 : 0);
          if (d < danger && (b.level > 1 || world.rnd() < 0.7)) {
            const w = (danger - d) / danger;
            fx -= (dx / d) * w;
            fy -= (dy / d) * w;
            threat = true;
          }
        } else if (myM > e.m * CFG.eatRatio * 1.05) {
          const score = (e.m / (d + 60)) * b.aggro * 1.6;
          if (score > preyScore) {
            preyScore = score;
            prey = { e, d };
          }
        }
      } else if (e.kind === 1) {
        if (myM > CFG.virusMass * CFG.eatRatio && d < myR + e.r + 80) virus = { dx, dy, d };
      } else if (e.kind === 2 && myM > 24) {
        const score = e.m / (d + 60);
        if (score > preyScore) {
          preyScore = score;
          prey = { e, d };
        }
      }
    }
  });
  let tx;
  let ty;
  if (threat) {
    const n = Math.hypot(fx, fy) || 1;
    tx = cx + (fx / n) * 700;
    ty = cy + (fy / n) * 700;
  } else if (prey && preyScore > 0.05) {
    tx = prey.e.x;
    ty = prey.e.y;
    const canSplitKill = b.level >= 2 && prey.e.kind === 0 && p.cells.length <= 2 && myM / 2 > prey.e.m * CFG.eatRatio && prey.d < 300 + myR;
    if (canSplitKill && world.rnd() < 0.3 * b.aggro) world.split(p.num);
  } else {
    const f = nearestFood(world, cx, cy, 320 + myR);
    if (f) [tx, ty] = f;
    else {
      if (!b.wander || Math.hypot(b.wander[0] - cx, b.wander[1] - cy) < 150) b.wander = [300 + world.rnd() * (world.size - 600), 300 + world.rnd() * (world.size - 600)];
      [tx, ty] = b.wander;
    }
  }
  if (virus && !threat) {
    // esquivar la espora sin frenar
    tx -= (virus.dx / virus.d) * 260;
    ty -= (virus.dy / virus.d) * 260;
  }
  // lejos de los bordes
  const m = 60 + myR;
  if (tx < m) tx = m;
  if (ty < m) ty = m;
  if (tx > world.size - m) tx = world.size - m;
  if (ty > world.size - m) ty = world.size - m;
  world.setInput(p.num, tx, ty, false);
}
