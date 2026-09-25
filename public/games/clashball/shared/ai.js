/**
 * Clashball — bots. Juegan con los mismos controles que una persona (8 direcciones + patear, y hay
 * que soltar la patada para volver a patear), así que respetan la física y la mecánica del juego.
 *
 * Roles por tick: el más cercano a la pelota la busca (y la lleva o patea hacia el arco rival),
 * el más atrasado cuida el arco y el resto se abre para recibir. Para no hacer goles en contra
 * rodean la pelota en vez de atravesarla y nunca patean hacia su propio arco. La dificultad cambia
 * el tiempo de reacción, la puntería, cuánto anticipan, la velocidad efectiva y los errores.
 */
import { KEY, DIR } from './match.js';

export const LEVELS = {
  easy: { react: 14, aim: 0.3, predict: 5, miss: 0.3, pace: 0.72, smart: false },
  normal: { react: 6, aim: 0.12, predict: 14, miss: 0.08, pace: 0.9, smart: false },
  hard: { react: 2, aim: 0.04, predict: 28, miss: 0, pace: 1, smart: true },
};

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function brain(level = 'normal', seed = 1) {
  return { L: LEVELS[level] || LEVELS.normal, rand: rng(seed * 2654435761), t: seed % 7, fb: null, prev: 0, side: 1, aimY: 0, aimErr: 0, miss: false };
}

const len = (x, y) => Math.sqrt(x * x + y * y) || 1e-9;

/** Posición futura de la pelota en k ticks (misma amortiguación que la física). */
function future(b, k) {
  const f = (1 - Math.pow(b.damping, k)) / (1 - b.damping);
  return { x: b.x + b.vx * f, y: b.y + b.vy * f };
}

/**
 * Si el camino hasta (tx,ty) pasa por la pelota, devuelve un punto para rodearla por el lado en
 * el que ya estoy; si no, el mismo destino.
 */
function detour(d, tx, ty, b, clear) {
  const dx = tx - d.x;
  const dy = ty - d.y;
  const L = len(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const bx = b.x - d.x;
  const by = b.y - d.y;
  const along = bx * ux + by * uy;
  if (along <= 0 || along >= L) return [tx, ty]; // la pelota está atrás mío o en el destino
  const perp = bx * -uy + by * ux; // distancia lateral de la pelota a mi camino
  if (Math.abs(perp) >= clear) return [tx, ty];
  const s = perp > 0 ? -1 : 1; // paso por el lado contrario a la pelota
  return [b.x + -uy * s * clear * 1.15 - ux * clear * 0.2, b.y + ux * s * clear * 1.15 - uy * clear * 0.2];
}

/**
 * En las pistas donde la red frena a los jugadores (hockey), si el camino cruza un arco se rodea
 * por el poste del lado del destino.
 */
function aroundNets(st, d, tx, ty, pr) {
  if (st.bg.type !== 'hockey') return [tx, ty];
  const gy = st.bg.goalY;
  for (const g of st.goals) {
    const out = g.team === 2 ? 1 : -1; // hacia dónde está la red
    const x0 = Math.min(g.x0, g.x0 + out * 32) - pr - 4;
    const x1 = Math.max(g.x0, g.x0 + out * 32) + pr + 4;
    const y0 = -gy - pr - 4;
    const y1 = gy + pr + 4;
    let hit = false;
    for (let i = 0; i <= 12 && !hit; i++) {
      const x = d.x + ((tx - d.x) * i) / 12;
      const y = d.y + ((ty - d.y) * i) / 12;
      hit = x > x0 && x < x1 && y > y0 && y < y1;
    }
    if (!hit) continue;
    const sy = Math.sign(ty || d.y || 1);
    const cy = sy * (gy + pr + 18);
    const front = g.x0 - out * (pr + 16);
    const back = g.x0 + out * (32 + pr + 16);
    const fieldSide = (d.x - g.x0) * out < 0;
    const inMouth = fieldSide && Math.abs(d.y) < gy && (d.x - g.x0) * out > -(pr + 10);
    if (inMouth) return [front, d.y]; // primero salgo del arco
    const near = (x, y) => Math.hypot(d.x - x, d.y - y) < 18;
    if (fieldSide) return near(front, cy) ? [back, cy] : [front, cy];
    return near(back, cy) ? [front, cy] : [back, cy];
  }
  return [tx, ty];
}

/** Teclas para llegar a (tx,ty) frenando a tiempo según la física del modo. */
function steer(d, tx, ty, pp, B) {
  const dx = tx - d.x;
  const dy = ty - d.y;
  const dist = len(dx, dy);
  const vmax = (pp.acceleration * pp.damping) / (1 - pp.damping);
  const want = dist < 4 ? 0 : Math.min(vmax, Math.sqrt(1.5 * pp.acceleration * dist) + pp.acceleration);
  const dvx = (dx / dist) * want - d.vx;
  const dvy = (dy / dist) * want - d.vy;
  const dead = pp.acceleration * 0.9;
  let bits = 0;
  if (dvx > dead) bits |= KEY.RIGHT;
  else if (dvx < -dead) bits |= KEY.LEFT;
  if (dvy > dead) bits |= KEY.DOWN;
  else if (dvy < -dead) bits |= KEY.UP;
  // ritmo: los bots fáciles no mantienen las teclas todo el tiempo (van más lentos)
  if (B.L.pace < 1 && B.rand() > B.L.pace) bits = 0;
  return bits;
}

/** Decide las teclas del bot `p` para este tick. */
export function think(m, p, B) {
  const d = p.d;
  if (!d) return 0;
  const L = B.L;
  const st = m.st;
  const pp = st.player;
  const bg = st.bg;
  const gy = bg.goalY;
  const pr = d.r;
  const own = st.goals.find((g) => g.team === p.team);
  const opp = st.goals.find((g) => g.team !== p.team);
  const dir = DIR[p.team]; // lado de mi arco (rojo = -1)
  if (m.state >= 2) return (B.prev = 0);

  // pelota objetivo: la más peligrosa (cerca de mi arco) o la más cercana
  let ball = m.balls[0].d;
  if (m.balls.length > 1) {
    let best = Infinity;
    for (const { d: b } of m.balls) {
      const score = len(b.x - d.x, b.y - d.y) + Math.abs(b.x - own.x0) * 0.35;
      if (score < best) {
        best = score;
        ball = b;
      }
    }
  }
  const br = ball.r;
  const contact = pr + br;

  // saque: si no saca mi equipo, espero
  if (m.state === 0 && m.koTeam !== p.team) return (B.prev = 0);

  // roles (una persona de mi equipo también cuenta como "la que va")
  const mates = m.players.filter((q) => q.d && q.team === p.team);
  const distTo = (q) => len(ball.x - q.d.x, ball.y - q.d.y);
  const myDist = distTo(p);
  let chaser = true;
  for (const q of mates) if (q !== p && distTo(q) * (q.bot ? 1 : 1.12) < myDist) chaser = false;
  if (myDist < contact + 16) chaser = true;
  const rear = mates.length > 1 && mates.every((q) => q === p || (q.d.x - d.x) * dir < 0);

  if (--B.t <= 0 || !B.fb) {
    B.t = L.react + Math.floor(B.rand() * L.react * 0.5);
    B.aimErr = (B.rand() * 2 - 1) * L.aim;
    B.miss = B.rand() < L.miss;
    B.fb = future(ball, Math.min(L.predict, myDist / 2.4));
    B.role = chaser ? 'chase' : rear ? 'keep' : 'support';
    // puntería: al palo más lejano del rival más cercano a su arco (difícil) o al azar
    if (L.smart) {
      let keeper = null;
      let kd = Infinity;
      for (const q of m.players)
        if (q.d && q.team !== p.team) {
          const k = Math.abs(q.d.x - opp.x0);
          if (k < kd) {
            kd = k;
            keeper = q;
          }
        }
      B.aimY = keeper && kd < bg.w * 0.4 ? (keeper.d.y > 0 ? -1 : 1) * (gy - 16) : (B.rand() * 2 - 1) * (gy - 20);
    } else B.aimY = (B.rand() * 2 - 1) * (gy - 18);
  }
  const fb = B.fb;
  const ownGx = own.x0;
  const oppGx = opp.x0;
  const behindOpp = (fb.x - oppGx) * -dir > -2; // pelota detrás de la línea del arco rival (hockey)
  const behindOwn = (fb.x - ownGx) * dir > -2;

  let tx;
  let ty;
  let want = false;
  let touchOk = false; // ¿puedo tocar la pelota en el camino?
  if (B.role === 'chase' || (chaser && myDist < 70)) {
    // hacia dónde quiero mandarla
    let ax = oppGx;
    let ay = B.aimY;
    if (behindOpp) {
      ax = oppGx + dir * 70; // la saco al frente del arco
      ay = 0;
    } else if (behindOwn) {
      ax = ownGx - dir * 90;
      ay = Math.sign(fb.y || 1) * bg.h * 0.7;
    }
    const a0 = Math.atan2(ay - fb.y, ax - fb.x) + B.aimErr;
    const sx = Math.cos(a0);
    const sy = Math.sin(a0);
    const toBx = fb.x - d.x;
    const toBy = fb.y - d.y;
    const tl = len(toBx, toBy);
    const align = (toBx * sx + toBy * sy) / tl;
    // la pelota está entre mi arco y yo, en mi mitad o viniendo hacia mi arco: vuelvo a cubrir
    const goalSide = (d.x - fb.x) * dir > -4;
    const danger = fb.x * dir > -bg.w * 0.15 || ball.vx * dir > 0.8;
    const nearLine = Math.abs(fb.x - ownGx) < contact + 26 && Math.abs(fb.y) < gy + 34;
    if (!goalSide && nearLine && !behindOwn) {
      // pegada a mi línea y no llego a cubrir: me pongo al costado para desviarla afuera, nunca adentro
      B.branch = 'shadow';
      tx = fb.x;
      ty = fb.y + (d.y >= fb.y ? 1 : -1) * (contact + 6);
      want = tl < contact + 8;
    } else if (!goalSide && danger && !behindOwn && tl > contact + 4) {
      B.branch = 'recover';
      tx = ownGx - dir * 30;
      ty = Math.max(-gy, Math.min(gy, fb.y + (d.y > fb.y ? 1 : -1) * (contact + 12)));
    } else if (align > 0.8 && tl < contact + 30) {
      B.branch = 'push';
      // en posición: empujo a través de la pelota y pateo
      tx = fb.x + sx * 24;
      ty = fb.y + sy * 24;
      touchOk = true;
      want = !B.miss && tl < contact + 10;
    } else if (align > 0.25) {
      B.branch = 'behind';
      tx = fb.x - sx * (contact + 3);
      ty = fb.y - sy * (contact + 3);
    } else {
      // del lado equivocado: voy a un punto detrás de la pelota, rodeándola
      B.branch = 'around';
      const side = Math.sign(-sy * (d.x - fb.x) + sx * (d.y - fb.y)) || B.side;
      B.side = side;
      const R = contact + 20;
      tx = fb.x - sx * R * 0.7 - sy * side * R;
      ty = fb.y - sy * R * 0.7 + sx * side * R;
      // despeje de emergencia cerca de mi arco si la pelota va hacia afuera
      if (Math.abs(fb.x - ownGx) < bg.w * 0.3 && tl < contact + 8) want = true;
    }
  } else if (B.role === 'keep') {
    const gx = ownGx - dir * 24;
    const vx = fb.x - gx;
    const vy = fb.y;
    const l = len(vx, vy);
    const reach = Math.min(l * 0.35, 70);
    tx = gx + (vx / l) * reach;
    ty = Math.max(-gy - 6, Math.min(gy + 6, (vy / l) * reach));
    want = len(ball.x - d.x, ball.y - d.y) < contact + 10;
    touchOk = (ball.x - d.x) * dir < 0; // solo si estoy entre la pelota y mi arco
  } else {
    // apoyo: me abro del lado contrario a la pelota, un poco adelante
    tx = fb.x + (oppGx - fb.x) * 0.35;
    ty = -Math.sign(fb.y || 1) * bg.h * 0.45;
    for (const q of mates)
      if (q !== p && len(q.d.x - tx, q.d.y - ty) < 70) {
        ty = -ty * 0.5;
        tx -= (oppGx - fb.x) * 0.25;
      }
  }

  // no atravesar la pelota cuando no la quiero tocar
  if (!touchOk) [tx, ty] = detour(d, tx, ty, ball, contact + 10);
  [tx, ty] = aroundNets(st, d, tx, ty, pr);
  tx = Math.max(-st.width + pr, Math.min(st.width - pr, tx));
  ty = Math.max(-st.height + pr, Math.min(st.height - pr, ty));

  // atasco (dos jugadores empujando la pelota en sentidos opuestos, o empujándose entre sí)
  // (o contra otro jugador): si aprieto teclas y no me muevo, me corro un poco
  const sp = Math.hypot(d.vx, d.vy);
  const blocked = B.prev & 15 && sp < 0.3;
  B.stall = blocked ? (B.stall || 0) + 1 : Math.max(0, (B.stall || 0) - 2);
  if (B.stall > 50) {
    B.unstick = 25;
    B.stall = 0;
    B.uside = B.rand() < 0.5 ? -1 : 1;
  }
  if (B.unstick > 0) {
    B.unstick--;
    const ux = (ball.x - d.x) / len(ball.x - d.x, ball.y - d.y);
    const uy = (ball.y - d.y) / len(ball.x - d.x, ball.y - d.y);
    tx = d.x - uy * B.uside * 40 - ux * 10;
    ty = d.y + ux * B.uside * 40 - uy * 10;
    want = true;
  }

  // nunca patear hacia mi arco (ni hacia atrás en mi mitad)
  if (want) {
    const kx = ball.x - d.x;
    const ky = ball.y - d.y;
    const gdx = ownGx - ball.x;
    const gdy = -ball.y;
    const gd = len(gdx, gdy);
    let diff = Math.abs(Math.atan2(ky, kx) - Math.atan2(gdy, gdx));
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const cone = Math.atan2(gy + 20, gd) + 0.15; // lo que ocupa mi arco visto desde la pelota
    const ownHalf = ball.x * dir > 0;
    if (diff < cone || (ownHalf && kx * dir > 0 && Math.abs(ky) < Math.abs(kx) * 2.5)) want = false;
  }

  let bits = steer(d, tx, ty, pp, B);
  // patada: se arma al apretar; si ya pateó (se desarmó), suelta un tick para poder volver a patear
  if (want && (!(B.prev & KEY.KICK) || p.kicking)) bits |= KEY.KICK;
  B.prev = bits;
  return bits;
}
