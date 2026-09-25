/**
 * Clashball — física 2D compartida por el cliente y el servidor.
 *
 * Es una reproducción fiel del motor de HaxBall: mismo paso fijo de 60 ticks por segundo, mismas
 * unidades (píxeles por tick), mismo orden de integración (posición con la velocidad anterior y
 * después velocidad = amortiguación · (velocidad + gravedad)) y mismas respuestas de colisión
 * disco-disco, disco-plano, disco-segmento (recto o curvo) y disco-vértice, con coeficientes de
 * rebote multiplicados y reparto del empuje según la inversa de la masa.
 */

/** Banderas de colisión (cGroup / cMask), con los mismos valores que HaxBall. */
export const F = { ball: 1, red: 2, blue: 4, redKO: 8, blueKO: 16, wall: 32, kick: 64, score: 128, all: 63 };

export const disc = (o = {}) => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  gx: 0,
  gy: 0,
  r: 10,
  invMass: 1,
  damping: 0.99,
  bCoef: 0.5,
  cMask: F.all,
  cGroup: F.all,
  ...o,
});

export const vertex = (x, y, o = {}) => ({ x, y, bCoef: 1, cMask: F.all, cGroup: F.wall, ...o });

export function plane(nx, ny, dist, o = {}) {
  const l = Math.hypot(nx, ny);
  return { nx: nx / l, ny: ny / l, dist, bCoef: 1, cMask: F.all, cGroup: F.wall, ...o };
}

/** Segmento entre dos vértices. `curve` en grados (arco); negativo invierte el sentido. */
export function segment(v0, v1, o = {}) {
  const s = { v0, v1, bCoef: 1, cMask: F.all, cGroup: F.wall, bias: 0, vis: true, color: null, curveF: Infinity, ...o };
  if (o.curve) setCurve(s, o.curve);
  computeSegment(s);
  return s;
}

function setCurve(s, deg) {
  let a = (deg * Math.PI) / 180;
  if (a < 0) {
    a = -a;
    const t = s.v0;
    s.v0 = s.v1;
    s.v1 = t;
    s.bias = -s.bias;
  }
  // entre 10° y 340°: arco; fuera de ese rango se trata como recto
  if (a > 0.17435839227423353 && a < 5.934119456780721) s.curveF = 1 / Math.tan(a / 2);
}

function computeSegment(s) {
  const Q = s.curveF;
  const { v0, v1 } = s;
  if (Number.isFinite(Q)) {
    let j = 0.5 * (v1.x - v0.x);
    let t = 0.5 * (v1.y - v0.y);
    const cx = v0.x + j - t * Q;
    const cy = v0.y + t + j * Q;
    j = v0.x - cx;
    t = v0.y - cy;
    s.arcR = Math.sqrt(j * j + t * t);
    s.n0x = cy - v0.y;
    s.n0y = v0.x - cx;
    s.n1x = v1.y - cy;
    s.n1y = cx - v1.x;
    if (Q <= 0) {
      s.n0x = -s.n0x;
      s.n0y = -s.n0y;
      s.n1x = -s.n1x;
      s.n1y = -s.n1y;
    }
    s.cx = cx;
    s.cy = cy;
  } else {
    const j = v0.x - v1.x;
    const t = v0.y - v1.y;
    const l = Math.sqrt(t * t + j * j);
    s.nx = -t / l;
    s.ny = j / l;
  }
}

/**
 * Avanza un tick. `hits` (opcional) recibe los rebotes con [índiceA, índiceB | -1, velocidad]
 * para sonidos, efectos y para saber quién tocó la pelota.
 */
export function step(world, hits) {
  const D = world.discs;
  const n = D.length;
  for (let i = 0; i < n; i++) {
    const d = D[i];
    d.x += d.vx;
    d.y += d.vy;
    d.vx = d.damping * (d.vx + d.gx);
    d.vy = d.damping * (d.vy + d.gy);
  }
  const { planes, segments, vertices } = world;
  for (let i = 0; i < n; i++) {
    const a = D[i];
    const aMask = a.cMask;
    const aGroup = a.cGroup;
    for (let j = i + 1; j < n; j++) {
      const c = D[j];
      if (!(c.cMask & aGroup) || !(c.cGroup & aMask)) continue;
      let dx = a.x - c.x;
      let dy = a.y - c.y;
      const d2 = dx * dx + dy * dy;
      const R = c.r + a.r;
      if (d2 <= 0 || d2 > R * R) continue;
      const sum = a.invMass + c.invMass;
      if (sum === 0) continue;
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      let f = a.invMass / sum;
      let o = R - d;
      const m = o * f;
      a.x += dx * m;
      a.y += dy * m;
      o -= m;
      c.x -= dx * o;
      c.y -= dy * o;
      let rv = dx * (a.vx - c.vx) + dy * (a.vy - c.vy);
      if (rv < 0) {
        const speed = -rv;
        rv *= a.bCoef * c.bCoef + 1;
        f *= rv;
        a.vx -= dx * f;
        a.vy -= dy * f;
        f = rv - f;
        c.vx += dx * f;
        c.vy += dy * f;
        if (hits) hits.push([i, j, speed]);
      }
    }
    if (a.invMass === 0) continue;
    const r = a.r;
    // planos
    for (let k = 0; k < planes.length; k++) {
      const p = planes[k];
      if (!(p.cMask & aGroup) || !(p.cGroup & aMask)) continue;
      let l = p.dist - (p.nx * a.x + p.ny * a.y) + r;
      if (l <= 0) continue;
      a.x += p.nx * l;
      a.y += p.ny * l;
      l = a.vx * p.nx + a.vy * p.ny;
      if (l < 0) {
        if (hits) hits.push([i, -1, -l]);
        l *= a.bCoef * p.bCoef + 1;
        a.vx -= l * p.nx;
        a.vy -= l * p.ny;
      }
    }
    // segmentos
    for (let k = 0; k < segments.length; k++) {
      const s = segments[k];
      if (!(s.cMask & aGroup) || !(s.cGroup & aMask)) continue;
      let nx;
      let ny;
      let dist;
      if (Number.isFinite(s.curveF)) {
        const vx = a.x - s.cx;
        const vy = a.y - s.cy;
        const inside = s.n0x * vx + s.n0y * vy > 0 && s.n1x * vx + s.n1y * vy > 0;
        if (inside === s.curveF <= 0) continue;
        const len = Math.sqrt(vx * vx + vy * vy);
        if (len === 0) continue;
        dist = len - s.arcR;
        nx = vx / len;
        ny = vy / len;
      } else {
        const { v0, v1 } = s;
        const ex = v1.x - v0.x;
        const ey = v1.y - v0.y;
        const px = a.x - v1.x;
        const py = a.y - v1.y;
        if ((a.x - v0.x) * ex + (a.y - v0.y) * ey <= 0 || px * ex + py * ey >= 0) continue;
        nx = s.nx;
        ny = s.ny;
        dist = nx * px + ny * py;
      }
      let bias = s.bias;
      if (bias === 0) {
        if (dist < 0) {
          dist = -dist;
          nx = -nx;
          ny = -ny;
        }
      } else {
        if (bias < 0) {
          bias = -bias;
          dist = -dist;
          nx = -nx;
          ny = -ny;
        }
        if (dist < -bias) continue;
      }
      if (dist >= r) continue;
      const pen = r - dist;
      a.x += nx * pen;
      a.y += ny * pen;
      let vn = nx * a.vx + ny * a.vy;
      if (vn < 0) {
        if (hits) hits.push([i, -1, -vn]);
        vn *= a.bCoef * s.bCoef + 1;
        a.vx -= nx * vn;
        a.vy -= ny * vn;
      }
    }
    // vértices
    const r2 = r * r;
    for (let k = 0; k < vertices.length; k++) {
      const v = vertices[k];
      if (!(v.cMask & aGroup) || !(v.cGroup & aMask)) continue;
      let dx = a.x - v.x;
      let dy = a.y - v.y;
      const t2 = dx * dx + dy * dy;
      if (t2 <= 0 || t2 > r2) continue;
      const t = Math.sqrt(t2);
      dx /= t;
      dy /= t;
      const pen = r - t;
      a.x += dx * pen;
      a.y += dy * pen;
      let vn = dx * a.vx + dy * a.vy;
      if (vn < 0) {
        if (hits) hits.push([i, -1, -vn]);
        vn *= a.bCoef * v.bCoef + 1;
        a.vx -= dx * vn;
        a.vy -= dy * vn;
      }
    }
  }
}

/** ¿El tramo (x0,y0)→(x1,y1) cruza la línea de gol? (misma prueba de intersección que HaxBall) */
export function crosses(goal, x0, y0, x1, y1) {
  const { x0: lx, y0: ly, x1: tx, y1: ty } = goal;
  let m = x1 - x0;
  let D = y1 - y0;
  if (0 < D * (lx - x0) - m * (ly - y0) === 0 < D * (tx - x0) - m * (ty - y0)) return false;
  m = tx - lx;
  D = ty - ly;
  return 0 < D * (x0 - lx) - m * (y0 - ly) !== 0 < D * (x1 - lx) - m * (y1 - ly);
}
