/**
 * Dibujo con canvas (sin imágenes): donas en todos sus estados, personas personalizables e íconos.
 * Todo se dibuja con colores lisos y un contorno marrón, como un dibujo animado.
 */
import { C, MASAS, BANOS, HILOS, TOPPINGS, PIEZAS, RELLENOS, byId } from './data.js';
import { GEOM } from './geom.js';

import { TAU, mix, tono, alfa, azar } from './color.js';
export { TAU, mix, tono, alfa, azar };

// ------------------------------------------------------------------ formas de dona

/** Arma el camino de la forma (para rellenar o recortar). k achica la forma hacia adentro. */
export function caminoForma(ctx, forma, x, y, r, k = 1) {
  const g = GEOM[forma];
  ctx.beginPath();
  if (forma === 'baston') {
    const h = g.h * r * k;
    const l = (g.w - g.h) * r;
    ctx.moveTo(x - l, y - h);
    ctx.lineTo(x + l, y - h);
    ctx.arc(x + l, y, h, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x - l, y + h);
    ctx.arc(x - l, y, h, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.closePath();
    return;
  }
  ctx.arc(x, y, g.w * r * k, 0, TAU);
  if (g.hueco) {
    const ri = g.hueco * r * (2 - k);
    ctx.moveTo(x + ri, y);
    ctx.arc(x, y, ri, 0, TAU, true);
  }
}

/** Color de la masa según cuánto se frió (0 crudo, 1 dorado, 1.3 tostado, 1.7 quemado). */
export function colorMasa(masaId, c) {
  const m = byId(MASAS, masaId) || MASAS[0];
  if (c <= 1) return mix(m.crudo, m.dorado, Math.max(0, c));
  if (c <= 1.3) return mix(m.dorado, m.tostado, (c - 1) / 0.3);
  return mix(m.tostado, m.quemado, Math.min(1, (c - 1.3) / 0.4));
}

/** Puntos del borde de un baño (en unidades de r), con ondas y gotas que caen. */
function bordeBano(forma, cob, semilla) {
  const g = GEOM[forma];
  const R = azar(semilla);
  const gotas = [];
  const nG = 5 + Math.floor(R() * 3);
  for (let i = 0; i < nG; i++) gotas.push({ t: R(), largo: 0.05 + R() * 0.07 });
  const fase = R() * TAU;
  const lleno = Math.min(1, cob);
  const extra = Math.max(0, cob - 1);
  const pts = [];
  const N = 90;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    let px;
    let py;
    let nx;
    let ny;
    if (forma === 'baston') {
      // perímetro de la cápsula, recorrido con t
      const l = g.w - g.h;
      const hh = g.h * (0.35 + 0.57 * Math.pow(lleno, 0.7));
      const per = 4 * l + TAU * hh;
      let s = t * per;
      if (s < 2 * l) {
        px = -l + s;
        py = -hh;
        nx = 0;
        ny = -1;
      } else if ((s -= 2 * l) < Math.PI * hh) {
        const a = -Math.PI / 2 + s / hh;
        px = l + Math.cos(a) * hh;
        py = Math.sin(a) * hh;
        nx = Math.cos(a);
        ny = Math.sin(a);
      } else if ((s -= Math.PI * hh) < 2 * l) {
        px = l - s;
        py = hh;
        nx = 0;
        ny = 1;
      } else {
        s -= 2 * l;
        const a = Math.PI / 2 + s / hh;
        px = -l + Math.cos(a) * hh;
        py = Math.sin(a) * hh;
        nx = Math.cos(a);
        ny = Math.sin(a);
      }
    } else {
      const a = t * TAU;
      const ri = g.hueco ? g.hueco + 0.05 : 0;
      const ro = ri + (g.w * 0.93 - ri) * Math.pow(lleno, g.hueco ? 0.8 : 0.6);
      px = Math.cos(a) * ro;
      py = Math.sin(a) * ro;
      nx = Math.cos(a);
      ny = Math.sin(a);
    }
    let d = 0.022 * Math.sin(t * TAU * 9 + fase) * lleno;
    if (lleno > 0.85)
      for (const gt of gotas) {
        const dt = Math.min(Math.abs(t - gt.t), 1 - Math.abs(t - gt.t));
        d += (gt.largo + extra * 0.12) * Math.exp(-((dt * 26) ** 2)) * (lleno - 0.85) * 6.6;
      }
    pts.push([px + nx * d, py + ny * d]);
  }
  return pts;
}

// ------------------------------------------------------------------ toppings y piezas

/** Dibuja una partícula de topping (en píxeles, ya ubicada). */
function particula(ctx, tipo, color, s, a) {
  ctx.fillStyle = color;
  if (tipo === 'grana') {
    ctx.rotate(a);
    ctx.beginPath();
    ctx.roundRect(-s * 0.9, -s * 0.28, s * 1.8, s * 0.56, s * 0.28);
    ctx.fill();
  } else if (tipo === 'hebra') {
    ctx.rotate(a);
    ctx.fillRect(-s * 0.8, -s * 0.13, s * 1.6, s * 0.26);
  } else if (tipo === 'trozo') {
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.35);
    ctx.lineTo(s * 0.45, -s * 0.45);
    ctx.lineTo(s * 0.55, s * 0.3);
    ctx.lineTo(-s * 0.3, s * 0.5);
    ctx.closePath();
    ctx.fill();
  } else if (tipo === 'gota') {
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.6);
    ctx.quadraticCurveTo(s * 0.55, s * 0.2, 0, s * 0.45);
    ctx.quadraticCurveTo(-s * 0.55, s * 0.2, 0, -s * 0.6);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.22, 0, TAU);
    ctx.fill();
  }
}

/** Una pieza (frutilla, merenguito, confite, cereza) centrada en 0,0 con tamaño s. */
export function pieza(ctx, id, s, a = 0, k = 0) {
  ctx.save();
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.strokeStyle = C.tinta;
  if (id === 'frutilla') {
    ctx.rotate(a);
    ctx.fillStyle = '#c8443c';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.62);
    ctx.bezierCurveTo(-s * 0.75, s * 0.1, -s * 0.55, -s * 0.5, 0, -s * 0.36);
    ctx.bezierCurveTo(s * 0.55, -s * 0.5, s * 0.75, s * 0.1, 0, s * 0.62);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2d68a';
    for (const [x, y] of [[-0.2, -0.05], [0.18, -0.08], [0, 0.18], [-0.12, 0.32], [0.14, 0.3]]) {
      ctx.beginPath();
      ctx.ellipse(x * s, y * s, s * 0.04, s * 0.06, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#6a994e';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const b = -Math.PI / 2 + (i - 2) * 0.55;
      ctx.ellipse(Math.cos(b) * s * 0.12, -s * 0.38 + Math.sin(b) * s * 0.12, s * 0.16, s * 0.07, b, 0, TAU);
    }
    ctx.fill();
  } else if (id === 'merengue') {
    ctx.fillStyle = '#fbf3e6';
    for (const [y, r] of [[0.2, 0.46], [-0.08, 0.34], [-0.32, 0.2]]) {
      ctx.beginPath();
      ctx.arc(0, y * s, r * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.lineTo(s * 0.06, -s * 0.62);
    ctx.stroke();
  } else if (id === 'confite') {
    const cols = ['#c8553d', '#d4a017', '#6a994e', '#2f6690', '#c47a8a', '#7b4b94'];
    ctx.fillStyle = cols[k % cols.length];
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.42, s * 0.34, a, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,250,242,.55)';
    ctx.beginPath();
    ctx.ellipse(-s * 0.12, -s * 0.1, s * 0.12, s * 0.07, -0.5, 0, TAU);
    ctx.fill();
  } else {
    // cereza
    ctx.strokeStyle = '#5b7a3a';
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.15);
    ctx.quadraticCurveTo(s * 0.1, -s * 0.55, s * 0.32, -s * 0.66);
    ctx.stroke();
    ctx.strokeStyle = C.tinta;
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.fillStyle = '#a8232f';
    ctx.beginPath();
    ctx.arc(0, s * 0.1, s * 0.36, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,250,242,.5)';
    ctx.beginPath();
    ctx.arc(-s * 0.12, -s * 0.02, s * 0.09, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ dona ideal (para tickets)

const ideales = new Map();

/** Una dona "como la pide el ticket", con toppings y piezas generados, para mostrarla dibujada. */
export function donaIdeal(spec) {
  const key = JSON.stringify(spec);
  if (ideales.has(key)) return ideales.get(key);
  const R = azar(key.length * 31 + key.charCodeAt(5) + key.charCodeAt(key.length - 3));
  const d = { id: Math.floor(R() * 1e6), masa: spec.masa, forma: spec.forma, coc: [1, 1], relleno: spec.relleno ? { id: spec.relleno, cant: 1 } : null, bano: spec.bano ? { id: spec.bano, cob: 1 } : null, lineas: [], parts: [], piezas: [] };
  const g = GEOM[spec.forma];
  if (spec.hilos) {
    // zigzag de punta a punta
    const pts = [];
    const n = spec.forma === 'baston' ? 9 : 7;
    for (let i = 0; i <= n; i++) {
      const x = -g.w * 0.85 + ((g.w * 1.7) / n) * i;
      pts.push(x, (i % 2 ? 1 : -1) * g.h * 0.75);
    }
    d.lineas.push({ id: spec.hilos, pts });
  }
  for (const t of spec.toppings) {
    const tp = byId(TOPPINGS, t);
    const n = t === 'azucar' ? 260 : 70;
    for (let i = 0; i < n; i++) {
      const x = (R() * 2 - 1) * g.w;
      const y = (R() * 2 - 1) * g.h;
      d.parts.push({ id: t, x, y, a: R() * TAU, k: Math.floor(R() * tp.colores.length), s: 0.8 + R() * 0.4 });
    }
  }
  if (spec.pieza) {
    const n = spec.pieza.n;
    for (let i = 0; i < n; i++) {
      if (spec.forma === 'baston') d.piezas.push({ id: spec.pieza.id, x: -g.w * 0.7 + ((g.w * 1.4) / Math.max(1, n - 1)) * i, y: 0, a: 0, k: i });
      else {
        const a = (i / n) * TAU - Math.PI / 2;
        const rr = g.hueco ? (g.w + g.hueco) / 2 : 0.55;
        d.piezas.push({ id: spec.pieza.id, x: Math.cos(a) * rr, y: Math.sin(a) * rr, a: a + Math.PI / 2, k: i });
      }
    }
  }
  ideales.set(key, d);
  return d;
}

// ------------------------------------------------------------------ dona

/**
 * Dibuja una dona vista desde arriba en (x, y) con radio r (píxeles).
 * o.lado: qué lado se ve (al freír); si no, se ve el lado que se frió primero.
 * o.lod: 'baja' para íconos chiquitos (menos detalle). o.sombra: sombra abajo.
 */
/**
 * Las donas se guardan dibujadas: solo se vuelven a dibujar cuando cambian (se fríen, se rellenan,
 * se bañan o se les agrega algo). Una dona con muchos toppings es cara de dibujar.
 */
const donasGuardadas = new WeakMap();
const versionDona = (d) =>
  `${d.masa}|${d.forma}|${d.coc ? d.coc[0].toFixed(2) + ',' + d.coc[1].toFixed(2) : ''}|${d.relleno ? d.relleno.id + d.relleno.cant.toFixed(2) : ''}|${d.bano ? d.bano.id + d.bano.cob.toFixed(2) : ''}|${(d.lineas || []).reduce((a, l) => a + l.pts.length, 0)}|${(d.parts || []).length}|${(d.piezas || []).length}`;

export function dona(ctx, d, x, y, r, o = {}) {
  const m = ctx.getTransform();
  const k = Math.max(0.5, Math.hypot(m.a, m.b));
  const clave = `${r}|${o.lado}|${o.sombra}|${o.lod}|${k.toFixed(2)}|${versionDona(d)}`;
  let porDona = donasGuardadas.get(d);
  if (!porDona) donasGuardadas.set(d, (porDona = new Map()));
  let c = porDona.get(clave);
  const w = r * 3.6;
  const h = r * 3.2;
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * k));
    c.height = Math.max(1, Math.ceil(h * k));
    const g = c.getContext('2d');
    g.scale(k, k);
    donaViva(g, d, w / 2, h / 2, r, o);
    porDona.set(clave, c);
    if (porDona.size > 6) porDona.delete(porDona.keys().next().value);
  }
  ctx.drawImage(c, x - w / 2, y - h / 2, w, h);
}

function donaViva(ctx, d, x, y, r, o = {}) {
  const forma = d.forma;
  const g = GEOM[forma];
  const lado = o.lado ?? 0;
  const c = d.coc ? d.coc[lado] : 1;
  const baja = o.lod === 'baja' || r < 26;
  const hincha = d.relleno ? 1 + 0.05 * Math.min(1.3, d.relleno.cant) : 1;
  const rr = r * hincha;
  ctx.save();
  // sombra
  if (o.sombra !== false) {
    ctx.fillStyle = 'rgba(59,42,32,.18)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.05, y + rr * g.h * 0.32 + r * 0.1, rr * g.w * 0.98, rr * g.h * 0.85, 0, 0, TAU);
    ctx.fill();
  }
  // masa
  const base = colorMasa(d.masa, c);
  caminoForma(ctx, forma, x, y, rr);
  ctx.fillStyle = base;
  ctx.fill('evenodd');
  // volumen: más clara en el lomo y más oscura hacia los bordes (como una rosquilla de verdad)
  ctx.save();
  caminoForma(ctx, forma, x, y, rr);
  ctx.clip('evenodd');
  let vol;
  if (forma === 'baston') {
    vol = ctx.createLinearGradient(0, y - rr * g.h, 0, y + rr * g.h);
    vol.addColorStop(0, alfa(tono(base, -0.3), 0.55));
    vol.addColorStop(0.42, alfa(tono(base, 0.14), 0.4));
    vol.addColorStop(1, alfa(tono(base, -0.35), 0.6));
  } else if (g.hueco) {
    vol = ctx.createRadialGradient(x - rr * 0.06, y - rr * 0.08, rr * g.hueco * 0.9, x, y, rr * g.w);
    vol.addColorStop(0, alfa(tono(base, -0.35), 0.6));
    vol.addColorStop(0.45, alfa(tono(base, 0.14), 0.35));
    vol.addColorStop(1, alfa(tono(base, -0.32), 0.55));
  } else {
    vol = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.32, rr * 0.05, x, y, rr * g.w);
    vol.addColorStop(0, alfa(tono(base, 0.16), 0.4));
    vol.addColorStop(0.6, alfa(base, 0));
    vol.addColorStop(1, alfa(tono(base, -0.35), 0.55));
  }
  ctx.fillStyle = vol;
  ctx.fillRect(x - rr * 2, y - rr * 2, rr * 4, rr * 4);
  if (c >= 0.75 && c < 1.42) {
    // la franja clara del medio, que queda al freírla de los dos lados
    ctx.lineWidth = rr * 0.06;
    ctx.strokeStyle = alfa(tono(base, 0.35), 0.4);
    caminoForma(ctx, forma, x, y, rr, 0.92);
    ctx.stroke();
  }
  ctx.lineWidth = rr * 0.16;
  ctx.strokeStyle = alfa(tono(base, -0.35), 0.35);
  caminoForma(ctx, forma, x, y, rr);
  ctx.stroke();
  if (d.coc && d.coc[1 - lado] !== undefined && o.lado === undefined) {
    // el borde deja ver el otro lado
    ctx.lineWidth = rr * 0.07;
    ctx.strokeStyle = alfa(colorMasa(d.masa, d.coc[1]), 0.85);
    caminoForma(ctx, forma, x, y, rr);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,250,242,.22)';
  ctx.beginPath();
  ctx.ellipse(x - rr * g.w * 0.35, y - rr * g.h * 0.42, rr * g.w * 0.32, rr * g.h * 0.16, -0.5, 0, TAU);
  ctx.fill();
  if (!baja && c < 0.7) {
    // poros de la masa cruda
    const R = azar((d.id || 7) + 3);
    ctx.fillStyle = alfa(tono(base, 0.4), 0.5);
    for (let i = 0; i < 26; i++) {
      const px = (R() * 2 - 1) * g.w;
      const py = (R() * 2 - 1) * g.h;
      ctx.beginPath();
      ctx.arc(x + px * rr, y + py * rr, rr * 0.022, 0, TAU);
      ctx.fill();
    }
  }
  if (!baja && c >= 0.7) {
    // poritos de la masa frita
    const R = azar((d.id || 7) + 5);
    ctx.fillStyle = alfa(tono(base, -0.4), 0.28);
    for (let i = 0; i < 40; i++) {
      const px = (R() * 2 - 1) * g.w;
      const py = (R() * 2 - 1) * g.h;
      ctx.beginPath();
      ctx.ellipse(x + px * rr, y + py * rr, rr * 0.018, rr * 0.012, R() * 3, 0, TAU);
      ctx.fill();
    }
  }
  if (c > 1.42) {
    // manchas de quemado
    const R = azar((d.id || 7) + 11);
    ctx.fillStyle = alfa('#1c110b', Math.min(0.55, (c - 1.42) * 1.5));
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(x + (R() * 2 - 1) * g.w * rr * 0.8, y + (R() * 2 - 1) * g.h * rr * 0.8, rr * 0.1, rr * 0.06, R() * 3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  // relleno: el agujerito por donde entró la manga (y si te pasaste, se sale)
  if (d.relleno && forma !== 'anillo') {
    const rel = byId(RELLENOS, d.relleno.id);
    const hx = x + rr * g.w * 0.72;
    const hy = y - rr * g.h * 0.5;
    if (d.relleno.cant > 1.1) {
      ctx.fillStyle = rel.color;
      ctx.beginPath();
      ctx.ellipse(hx + rr * 0.1, hy - rr * 0.04, rr * (0.08 + 0.12 * Math.min(1, d.relleno.cant - 1.1)), rr * 0.07, -0.4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = tono(rel.color, -0.3);
    ctx.beginPath();
    ctx.ellipse(hx, hy, rr * 0.05, rr * 0.035, -0.4, 0, TAU);
    ctx.fill();
  }

  // baño
  if (d.bano && d.bano.cob > 0.02) {
    const b = byId(BANOS, d.bano.id);
    const pts = bordeBano(forma, d.bano.cob, (d.id || 1) * 7 + 1);
    const caminoBano = (dx = 0, dy = 0) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + dx + px * rr, y + dy + py * rr) : ctx.moveTo(x + dx + px * rr, y + dy + py * rr)));
      ctx.closePath();
      if (g.hueco) {
        const ri = (g.hueco + 0.04) * rr;
        ctx.moveTo(x + dx + ri, y + dy);
        ctx.arc(x + dx, y + dy, ri, 0, TAU, true);
      }
    };
    ctx.save();
    // el espesor del baño: un borde más oscuro un poquito más abajo
    caminoBano(0, rr * 0.035);
    ctx.fillStyle = tono(b.color, -0.22);
    ctx.fill('evenodd');
    caminoBano();
    ctx.fillStyle = b.color;
    ctx.fill('evenodd');
    if (!baja) {
      // el baño se ve más grueso en el lomo
      ctx.save();
      ctx.clip('evenodd');
      caminoBano(-rr * 0.02, -rr * 0.025);
      ctx.lineWidth = rr * 0.09;
      ctx.strokeStyle = alfa(tono(b.color, 0.25), 0.35);
      ctx.stroke();
      ctx.restore();
    }
    caminoBano();
    ctx.lineWidth = Math.max(1, rr * 0.025);
    ctx.strokeStyle = alfa(tono(b.color, -0.45), 0.6);
    ctx.stroke();
    // brillo del baño
    ctx.fillStyle = alfa(b.brillo, 0.75);
    ctx.beginPath();
    if (forma === 'baston') ctx.ellipse(x - rr * 0.5, y - rr * g.h * 0.45, rr * 0.45, rr * 0.07, -0.08, 0, TAU);
    else ctx.ellipse(x - rr * 0.38, y - rr * 0.42, rr * 0.22, rr * 0.07, -0.75, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // hilos y toppings: recortados a la dona
  if ((d.lineas && d.lineas.length) || (d.parts && d.parts.length)) {
    ctx.save();
    caminoForma(ctx, forma, x, y, rr);
    ctx.clip('evenodd');
    for (const ln of d.lineas || []) {
      const h = byId(HILOS, ln.id);
      if (!h || ln.pts.length < 4) continue;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const gk = ln.w || 1;
      ctx.lineWidth = rr * 0.075 * gk;
      ctx.strokeStyle = alfa(tono(h.color, -0.35), 0.5);
      ctx.beginPath();
      for (let i = 0; i < ln.pts.length; i += 2) {
        const px = x + ln.pts[i] * rr;
        const py = y + ln.pts[i + 1] * rr + rr * 0.012;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = rr * 0.058 * gk;
      ctx.strokeStyle = h.color;
      ctx.stroke();
    }
    const paso = baja ? 3 : 1;
    for (let i = 0; i < (d.parts || []).length; i += paso) {
      const p = d.parts[i];
      const tp = byId(TOPPINGS, p.id);
      if (!tp) continue;
      ctx.save();
      ctx.translate(x + p.x * rr, y + p.y * rr);
      particula(ctx, tp.forma, tp.colores[p.k % tp.colores.length], rr * 0.055 * (p.s || 1) * (baja ? 1.4 : 1), p.a);
      ctx.restore();
    }
    ctx.restore();
  }

  // contorno
  ctx.lineWidth = Math.max(1.2, r * 0.04);
  ctx.strokeStyle = C.tinta;
  caminoForma(ctx, forma, x, y, rr);
  ctx.stroke();

  // piezas, arriba de todo
  for (const p of d.piezas || []) {
    ctx.save();
    ctx.translate(x + p.x * rr, y + p.y * rr);
    pieza(ctx, p.id, rr * 0.2, p.a || 0, p.k || 0);
    ctx.restore();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ íconos chiquitos

/** Bolsita de manga (relleno). */
export function iconoManga(ctx, color, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = '#f6f0e6';
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, -s * 0.5);
  ctx.lineTo(s * 0.45, -s * 0.5);
  ctx.lineTo(s * 0.08, s * 0.38);
  ctx.lineTo(-s * 0.08, s * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-s * 0.33, -s * 0.2);
  ctx.lineTo(s * 0.33, -s * 0.2);
  ctx.lineTo(s * 0.08, s * 0.36);
  ctx.lineTo(-s * 0.08, s * 0.36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.acero;
  ctx.fillRect(-s * 0.07, s * 0.36, s * 0.14, s * 0.16);
  ctx.strokeRect(-s * 0.07, s * 0.36, s * 0.14, s * 0.16);
  ctx.restore();
}

/** Bowl con baño. */
export function iconoBowl(ctx, color, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.12, s * 0.5, s * 0.16, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ece4d6';
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.12);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.45, 0, s * 0.45);
  ctx.quadraticCurveTo(s * 0.5, s * 0.45, s * 0.55, -s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.12, s * 0.55, s * 0.18, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.1, s * 0.46, s * 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Pomo de hilos. */
export function iconoPomo(ctx, color, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.35);
  ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-s * 0.22, -s * 0.38, s * 0.44, s * 0.7, s * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f6f0e6';
  ctx.beginPath();
  ctx.moveTo(-s * 0.13, -s * 0.38);
  ctx.lineTo(s * 0.13, -s * 0.38);
  ctx.lineTo(0, -s * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,250,242,.6)';
  ctx.fillRect(-s * 0.12, -s * 0.2, s * 0.24, s * 0.12);
  ctx.restore();
}

/** Salero / frasco de toppings. */
export function iconoSalero(ctx, tp, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = 'rgba(246,240,230,.92)';
  ctx.beginPath();
  ctx.roundRect(-s * 0.3, -s * 0.28, s * 0.6, s * 0.72, s * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.acero;
  ctx.beginPath();
  ctx.roundRect(-s * 0.32, -s * 0.48, s * 0.64, s * 0.22, s * 0.08);
  ctx.fill();
  ctx.stroke();
  const R = azar(tp.id.length * 13);
  for (let i = 0; i < 14; i++) {
    ctx.save();
    ctx.translate((R() - 0.5) * s * 0.44, -s * 0.05 + R() * s * 0.42);
    particula(ctx, tp.forma, tp.colores[i % tp.colores.length], s * 0.1, R() * TAU);
    ctx.restore();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ personas (en personas.js)

export { persona, altoPersona, retrato, completarLook, lookJugador } from './personas.js';
