/**
 * Física del minigolf. Determinista a paso fijo y sin dependencias: la usa el cliente
 * (práctica y local) y el servidor (online, autoritativo).
 *
 * simulate() devuelve la trayectoria muestreada a 30 Hz; el cliente solo la reproduce,
 * así todos los jugadores ven exactamente lo mismo.
 */
export const BALL_R = 8;
export const CUP_R = 13;
export const MAX_SPEED = 960;
export const SAMPLE_HZ = 30;
const DT = 1 / 240;
const STEPS_PER_SAMPLE = 240 / SAMPLE_HZ;
const MAX_TIME = 14;
const SURFACE = {
  grass: { a: 110, k: 0.85 },
  sand: { a: 560, k: 2.8 },
  ice: { a: 22, k: 0.12 },
};

// ---------- geometría ----------
function polySegments(poly, out) {
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    out.push([x1, y1, x2, y2]);
  }
  return out;
}

export function staticSegments(hole) {
  const segs = [];
  polySegments(hole.outline, segs);
  for (const b of hole.blocks) polySegments(b, segs);
  return segs;
}

const inRect = (x, y, [rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
const inCircle = (x, y, [cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
export const inZone = (x, y, z) => (z.rect ? inRect(x, y, z.rect) : inCircle(x, y, z.circle));

/** Estado de un obstáculo móvil en el tiempo t: esquinas del rectángulo y función de velocidad. */
export function moverState(m, t) {
  if (m.kind === 'bar') {
    const a = m.phase + m.speed * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const hl = m.len / 2;
    const hw = m.w / 2;
    const [px, py] = m.pivot;
    const pts = [
      [-hl, -hw],
      [hl, -hw],
      [hl, hw],
      [-hl, hw],
    ].map(([x, y]) => [px + x * c - y * s, py + x * s + y * c]);
    return { pts, angle: a, cx: px, cy: py, vel: (x, y) => [-(y - py) * m.speed, (x - px) * m.speed] };
  }
  // slider: centro entre from y to con vaivén suave
  const w = (2 * Math.PI) / m.period;
  const ph = t * w + m.phase * 2 * Math.PI;
  const k = (1 - Math.cos(ph)) / 2;
  const dk = (Math.sin(ph) * w) / 2;
  const [fx, fy] = m.from;
  const [tx, ty] = m.to;
  const cx = fx + (tx - fx) * k;
  const cy = fy + (ty - fy) * k;
  const hw = m.size[0] / 2;
  const hh = m.size[1] / 2;
  const vx = (tx - fx) * dk;
  const vy = (ty - fy) * dk;
  return {
    pts: [
      [cx - hw, cy - hh],
      [cx + hw, cy - hh],
      [cx + hw, cy + hh],
      [cx - hw, cy + hh],
    ],
    angle: 0,
    cx,
    cy,
    vel: () => [vx, vy],
  };
}

// ---------- colisiones ----------
function collideSegment(b, x1, y1, x2, y2, e, vel) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let u = ((b.x - x1) * dx + (b.y - y1) * dy) / len2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const px = x1 + dx * u;
  const py = y1 + dy * u;
  let nx = b.x - px;
  let ny = b.y - py;
  const d = Math.hypot(nx, ny);
  if (d >= BALL_R) return 0;
  if (d < 1e-6) {
    nx = -dy;
    ny = dx;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
  } else {
    nx /= d;
    ny /= d;
  }
  b.x = px + nx * BALL_R;
  b.y = py + ny * BALL_R;
  const [ox, oy] = vel ? vel(px, py) : [0, 0];
  let rvx = b.vx - ox;
  let rvy = b.vy - oy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  rvx -= (1 + e) * vn * nx;
  rvy -= (1 + e) * vn * ny;
  b.vx = rvx + ox;
  b.vy = rvy + oy;
  return -vn;
}

function collideCircle(b, cx, cy, r) {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d = Math.hypot(dx, dy);
  const min = r + BALL_R;
  if (d >= min || d < 1e-6) return 0;
  const nx = dx / d;
  const ny = dy / d;
  b.x = cx + nx * min;
  b.y = cy + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  // los bumpers devuelven más energía de la que reciben
  const out = Math.max(-vn * 1.15, 260);
  b.vx += (-vn + out) * nx;
  b.vy += (-vn + out) * ny;
  return out;
}

// ---------- simulación ----------
/**
 * @param hole   definición del hoyo
 * @param start  {x, y} posición de la pelota
 * @param angle  dirección del golpe (radianes)
 * @param power  0..1
 * @param t0     tiempo del hoyo (s) en el que se golpea: define dónde están los obstáculos móviles
 */
export function simulate(hole, start, angle, power, t0 = 0) {
  const segs = staticSegments(hole);
  const p = Math.max(0.03, Math.min(1, power));
  const b = { x: start.x, y: start.y, vx: Math.cos(angle) * MAX_SPEED * p, vy: Math.sin(angle) * MAX_SPEED * p };
  const path = [round(b.x), round(b.y)];
  const events = [];
  const [cupX, cupY] = hole.cup;
  let t = t0;
  let step = 0;
  let still = 0;
  let portalCool = 0;
  let lastSurface = 'grass';
  let lastBoost = -1;
  let result = null;

  const ev = (type, extra) => {
    const e = { i: path.length / 2, type };
    if (extra) Object.assign(e, extra);
    events.push(e);
  };

  for (; step < MAX_TIME / DT; step++) {
    t += DT;
    // superficies y fuerzas
    let surface = 'grass';
    let fx = 0;
    let fy = 0;
    for (let zi = 0; zi < hole.zones.length; zi++) {
      const z = hole.zones[zi];
      if (!inZone(b.x, b.y, z)) continue;
      if (z.type === 'sand' || z.type === 'ice') surface = z.type;
      else if (z.type === 'slope') {
        fx += z.force[0];
        fy += z.force[1];
      } else if (z.type === 'boost' && lastBoost !== zi) {
        lastBoost = zi;
        const sp = Math.max(z.speed, Math.hypot(b.vx, b.vy));
        b.vx = z.dir[0] * sp;
        b.vy = z.dir[1] * sp;
        ev('boost');
      } else if (z.type === 'water') {
        ev('water', { x: round(b.x), y: round(b.y) });
        result = { x: start.x, y: start.y, water: true };
      }
    }
    if (result) break;
    if (!hole.zones.some((z, zi) => zi === lastBoost && inZone(b.x, b.y, z))) lastBoost = -1;
    if (surface !== lastSurface) {
      if (surface === 'sand') ev('sand');
      lastSurface = surface;
    }

    // fricción (desaceleración constante + proporcional)
    const f = SURFACE[surface];
    let speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const dec = (f.a + f.k * speed) * DT;
      const ns = Math.max(0, speed - dec);
      b.vx *= ns / speed;
      b.vy *= ns / speed;
    }
    b.vx += fx * DT;
    b.vy += fy * DT;

    // hoyo: atracción del borde y captura
    const cdx = cupX - b.x;
    const cdy = cupY - b.y;
    const cd = Math.hypot(cdx, cdy);
    speed = Math.hypot(b.vx, b.vy);
    if (cd < CUP_R + 8 && speed < 220) {
      b.vx += (cdx / cd) * 520 * DT;
      b.vy += (cdy / cd) * 520 * DT;
    }
    if (cd < CUP_R - 2 && speed < 430) {
      ev('hole');
      result = { x: cupX, y: cupY, holed: true };
      path.push(round(cupX), round(cupY));
      break;
    }

    b.x += b.vx * DT;
    b.y += b.vy * DT;

    // colisiones
    let hit = 0;
    for (const s of segs) hit = Math.max(hit, collideSegment(b, s[0], s[1], s[2], s[3], 0.72));
    if (hit > 40) ev('wall', { v: Math.round(hit) });
    for (let mi = 0; mi < hole.movers.length; mi++) {
      const st = moverState(hole.movers[mi], t);
      let mh = 0;
      for (let k = 0; k < 4; k++) {
        const [ax, ay] = st.pts[k];
        const [bx, by] = st.pts[(k + 1) % 4];
        mh = Math.max(mh, collideSegment(b, ax, ay, bx, by, 0.8, st.vel));
      }
      if (mh > 30) ev('mover', { m: mi, v: Math.round(mh) });
    }
    for (let bi = 0; bi < hole.bumpers.length; bi++) {
      const [cx, cy, r] = hole.bumpers[bi];
      if (collideCircle(b, cx, cy, r)) ev('bumper', { b: bi });
    }
    // seguridad: si algo lo empujó afuera, lo devuelve al inicio del tiro
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      result = { x: start.x, y: start.y };
      break;
    }

    // portales
    if (portalCool > 0) portalCool -= DT;
    else
      for (const [ax, ay, bx, by] of hole.portals) {
        for (const [ix, iy, ox, oy] of [
          [ax, ay, bx, by],
          [bx, by, ax, ay],
        ]) {
          if ((b.x - ix) ** 2 + (b.y - iy) ** 2 < 16 * 16) {
            const sp = Math.hypot(b.vx, b.vy) || 1;
            b.x = ox + (b.vx / sp) * 24;
            b.y = oy + (b.vy / sp) * 24;
            portalCool = 0.4;
            ev('portal');
          }
        }
      }

    speed = Math.hypot(b.vx, b.vy);
    still = speed < 6 ? still + DT : 0;
    if ((step + 1) % STEPS_PER_SAMPLE === 0) path.push(round(b.x), round(b.y));
    if (still > 0.25 || (speed < 3 && fx === 0 && fy === 0)) break;
  }
  if (!result) result = { x: round(b.x), y: round(b.y) };
  if (path[path.length - 2] !== round(result.x) || path[path.length - 1] !== round(result.y)) path.push(round(b.x), round(b.y));
  return { path, events, x: result.x, y: result.y, holed: !!result.holed, water: !!result.water, t0 };
}

const round = (v) => Math.round(v * 10) / 10;

export const shotDuration = (res) => (res.path.length / 2 / SAMPLE_HZ) * 1000;
