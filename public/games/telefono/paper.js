/**
 * Teléfono Loco — la hoja: paleta, trazos, balde y repetición animada de un dibujo.
 * Los dibujos son listas de operaciones (ver server/games/telefono.js) sobre una hoja de
 * 1000 × 750; acá se pintan sobre cualquier canvas de ese tamaño.
 */
export const W = 1000;
export const H = 750;
export const PALETTE = ['#ffffff', '#c1c1c1', '#6b6b6b', '#111111', '#ef4444', '#f97316', '#facc15', '#a3e635', '#22c55e', '#14b8a6', '#38bdf8', '#3b82f6', '#1e3a8a', '#8b5cf6', '#ec4899', '#92400e', '#fcd9b6', '#7f1d1d'];
export const SIZES = [4, 9, 18, 36];

export function blank(g) {
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
}

/** Dibuja un trazo desde el punto `from` (índice en el arreglo de coordenadas) hasta `to`. */
export function stroke(g, op, from = 0, to = op.p.length) {
  const p = op.p;
  g.strokeStyle = g.fillStyle = PALETTE[op.c] || '#111';
  g.lineWidth = SIZES[op.w] || 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (p.length <= 2) {
    if (from > 0 || to < 2) return;
    g.beginPath();
    g.arc(p[0], p[1], g.lineWidth / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  const s = Math.max(0, from - 2);
  if (to - s < 4) return;
  g.beginPath();
  g.moveTo(p[s], p[s + 1]);
  for (let i = s + 2; i < to; i += 2) g.lineTo(p[i], p[i + 1]);
  g.stroke();
}

/** Balde con tolerancia (los bordes suavizados no dejan halo). */
export function fill(g, x, y, c) {
  x = Math.round(Math.max(0, Math.min(W - 1, x)));
  y = Math.round(Math.max(0, Math.min(H - 1, y)));
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const i0 = (y * W + x) * 4;
  const r0 = d[i0];
  const g0 = d[i0 + 1];
  const b0 = d[i0 + 2];
  const hex = PALETTE[c] || '#111111';
  const r1 = parseInt(hex.slice(1, 3), 16);
  const g1 = parseInt(hex.slice(3, 5), 16);
  const b1 = parseInt(hex.slice(5, 7), 16);
  if (Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1) < 8) return;
  const tol = 90;
  const seen = new Uint8Array(W * H);
  const stack = [x, y];
  const same = (k) => Math.abs(d[k] - r0) + Math.abs(d[k + 1] - g0) + Math.abs(d[k + 2] - b0) <= tol;
  let x0 = x;
  let x1 = x;
  let y0 = y;
  let y1 = y;
  while (stack.length) {
    const py = stack.pop();
    let px = stack.pop();
    let k = py * W + px;
    while (px > 0 && !seen[k - 1] && same((k - 1) * 4)) {
      px--;
      k--;
    }
    let up = false;
    let down = false;
    if (px < x0) x0 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
    while (px < W && !seen[k] && same(k * 4)) {
      seen[k] = 1;
      const q = k * 4;
      d[q] = r1;
      d[q + 1] = g1;
      d[q + 2] = b1;
      d[q + 3] = 255;
      if (py > 0) {
        const u = k - W;
        if (!seen[u] && same(u * 4)) {
          if (!up) {
            stack.push(px, py - 1);
            up = true;
          }
        } else up = false;
      }
      if (py < H - 1) {
        const dn = k + W;
        if (!seen[dn] && same(dn * 4)) {
          if (!down) {
            stack.push(px, py + 1);
            down = true;
          }
        } else down = false;
      }
      px++;
      k++;
    }
    if (px - 1 > x1) x1 = px - 1;
  }
  // se engorda un píxel sobre los bordes suavizados (solo en la zona rellenada)
  for (let yy = Math.max(1, y0 - 1); yy <= Math.min(H - 2, y1 + 1); yy++)
    for (let xx = Math.max(1, x0 - 1); xx <= Math.min(W - 2, x1 + 1); xx++) {
      const k = yy * W + xx;
      if (seen[k]) continue;
      if (seen[k - 1] || seen[k + 1] || seen[k - W] || seen[k + W]) {
        const q = k * 4;
        const diff = Math.abs(d[q] - r0) + Math.abs(d[q + 1] - g0) + Math.abs(d[q + 2] - b0);
        if (diff < 380) {
          d[q] = (d[q] + r1) >> 1;
          d[q + 1] = (d[q + 1] + g1) >> 1;
          d[q + 2] = (d[q + 2] + b1) >> 1;
        }
      }
    }
  g.putImageData(img, 0, 0);
}

export function apply(g, op) {
  if (op.k === 's') stroke(g, op);
  else if (op.k === 'f') fill(g, op.x, op.y, op.c);
}

export function render(g, ops) {
  blank(g);
  for (const op of ops) apply(g, op);
}

/** Cantidad de "pasos" de un dibujo (puntos de los trazos y rellenos), para animarlo. */
function weight(ops) {
  let n = 0;
  for (const o of ops) n += o.k === 's' ? Math.max(1, o.p.length / 2) : 40;
  return n;
}

/**
 * Repite el dibujo trazo a trazo en `ms` milisegundos. Devuelve una función para cortarlo (y
 * dejarlo terminado).
 */
export function replay(g, ops, ms = 2200, instant = false) {
  render(g, instant ? ops : []);
  if (instant || !ops.length) return () => {};
  const total = weight(ops);
  let oi = 0;
  let pi = 0;
  let done = 0;
  let raf = 0;
  const t0 = performance.now();
  const step = (now) => {
    const want = Math.min(total, (total * (now - t0)) / ms);
    while (oi < ops.length && done < want) {
      const o = ops[oi];
      if (o.k === 'f') {
        fill(g, o.x, o.y, o.c);
        done += 40;
        oi++;
        pi = 0;
        continue;
      }
      const n = o.p.length;
      const room = Math.max(2, Math.floor((want - done) * 2) & ~1);
      const to = Math.min(n, pi + room);
      stroke(g, o, pi, to);
      done += (to - pi) / 2 || 1;
      pi = to;
      if (pi >= n) {
        oi++;
        pi = 0;
      }
    }
    if (oi < ops.length) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(raf);
    if (oi < ops.length) render(g, ops);
  };
}
