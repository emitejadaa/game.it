/**
 * Drift Neon — trazador de pistas: una pista se describe como una lista de tramos
 * (recta, curva a la izquierda o a la derecha con su radio) y se cierra sola repartiendo la
 * diferencia entre las rectas. Devuelve la línea central muestreada cada `step` unidades.
 *
 *   ['S', largo]            recta
 *   ['R', grados, radio]    curva a la derecha (sentido horario en pantalla)
 *   ['L', grados, radio]    curva a la izquierda
 */
function walk(prog, step) {
  let x = 0;
  let y = 0;
  let h = 0;
  const pts = [[x, y]];
  for (const op of prog) {
    if (op[0] === 'S') {
      const n = Math.max(1, Math.round(op[1] / step));
      for (let i = 1; i <= n; i++) pts.push([x + Math.cos(h) * (op[1] * i) / n, y + Math.sin(h) * (op[1] * i) / n]);
      x += Math.cos(h) * op[1];
      y += Math.sin(h) * op[1];
    } else {
      const sgn = op[0] === 'R' ? 1 : -1;
      const ang = (op[1] * Math.PI) / 180;
      const r = op[2];
      // centro del arco a la derecha (+90°) o a la izquierda (−90°)
      const cx = x + Math.cos(h + (sgn * Math.PI) / 2) * r;
      const cy = y + Math.sin(h + (sgn * Math.PI) / 2) * r;
      const a0 = Math.atan2(y - cy, x - cx);
      const n = Math.max(2, Math.round((ang * r) / step));
      for (let i = 1; i <= n; i++) {
        const a = a0 + (sgn * ang * i) / n;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      const a = a0 + sgn * ang;
      x = cx + Math.cos(a) * r;
      y = cy + Math.sin(a) * r;
      h += sgn * ang;
    }
  }
  return { pts, x, y, h };
}

/**
 * Recorre el programa y cierra el circuito: estira o acorta las rectas marcadas 'a' y 'b'
 * (conviene una horizontal y una vertical) para volver a la largada, y si queda un resto lo une
 * con una curva suave.
 */
export function trace(prog, step = 14) {
  // se reparte la corrección entre todas las rectas (mínimos cuadrados, sin bajar de 60)
  const fixed = prog.map((op) => (op[0] === 'S' ? ['S', op[1]] : op.slice()));
  const dirs = [];
  let h = 0;
  fixed.forEach((op, i) => {
    if (op[0] === 'S') dirs.push([i, Math.cos(h), Math.sin(h)]);
    else h += ((op[0] === 'R' ? 1 : -1) * op[1] * Math.PI) / 180;
  });
  let free = dirs.slice();
  for (let it = 0; it < 8 && free.length >= 2; it++) {
    const e = walk(fixed, step);
    if (Math.hypot(e.x, e.y) < 1) break;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const [, dx, dy] of free) {
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }
    const det = sxx * syy - sxy * sxy;
    if (Math.abs(det) < 1e-6) break;
    const mx = -e.x;
    const my = -e.y;
    const lx = (syy * mx - sxy * my) / det;
    const ly = (sxx * my - sxy * mx) / det;
    const clamped = [];
    for (const d of free) {
      const [i, dx, dy] = d;
      const nl = fixed[i][1] + dx * lx + dy * ly;
      if (nl < 60) {
        fixed[i][1] = 60;
        clamped.push(d);
      } else fixed[i][1] = nl;
    }
    if (!clamped.length) break;
    free = free.filter((d) => !clamped.includes(d));
  }
  const w = walk(fixed, step);
  const pts = w.pts;
  const ex = w.x;
  const ey = w.y;
  const dist = Math.hypot(ex, ey);
  if (dist > step) {
    const k = dist * 0.42;
    const p1 = [ex + Math.cos(w.h) * k, ey + Math.sin(w.h) * k];
    const p2 = [-k, 0];
    const bez = (t) => {
      const m = 1 - t;
      return [m * m * m * ex + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0], m * m * m * ey + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1]];
    };
    const fine = [];
    for (let i = 0; i <= 400; i++) fine.push(bez(i / 400));
    let acc = 0;
    let next = step;
    for (let i = 1; i < fine.length; i++) {
      acc += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
      if (acc >= next) {
        pts.push(fine[i]);
        next += step;
      }
    }
  }
  // puntos repetidos o pegados a la largada
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > step * 0.3) out.push(p);
  }
  while (out.length > 2 && Math.hypot(out[out.length - 1][0], out[out.length - 1][1]) < step * 0.6) out.pop();
  return out;
}

/** Dónde termina el programa sin cerrar (para diseñar). */
export function endOf(prog, step = 14) {
  const w = walk(prog.map((op) => (op[0] === 'S' ? ['S', op[1]] : op)), step);
  return { x: Math.round(w.x), y: Math.round(w.y), deg: Math.round((w.h * 180) / Math.PI) };
}
