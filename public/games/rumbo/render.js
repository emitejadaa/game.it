/* Rumbo — el globo en canvas 2D.
 * Se redibuja solo cuando algo cambia (arrastre, inercia, animación de cámara, zoom, tema). Los contornos ya vienen
 * densificados (geo.js), así que el dibujo no crea objetos: solo rota vectores y arma el trazo.
 * Cara oculta: los vértices que quedan detrás se pegan al borde del disco y, cuando un anillo sale y vuelve a entrar,
 * el tramo oculto se reemplaza por un arco sobre ese borde. Así Rusia o Canadá nunca cruzan el disco con una cuerda.
 */
import { viewBasis, lonDelta, ease } from './geo.js';

const DEG = 180 / Math.PI;
const TAU = Math.PI * 2;
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 2.2;
const START = { lon: -35, lat: 12 };

/** Convierte '#rgb', '#rrggbb' o 'rgb(a)(…)' en [r, g, b]; si no lo entiende devuelve `fallback`. */
export function parseColor(s, fallback = [255, 255, 255]) {
  s = String(s || '').trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(([^)]+)\)/i.exec(s);
  if (m) {
    const p = m[1].split(/[ ,/]+/).map(Number);
    if (p.length >= 3 && p.slice(0, 3).every((v) => !Number.isNaN(v))) return p.slice(0, 3);
  }
  return fallback;
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * @param {object} o
 *   shapes   lista de formas de geo.js (todos los países)
 *   labels   { in, out, center, aria }  textos del idioma
 *   onCenter se llama al tocar el botón de centrar (el juego decide a qué país ir)
 */
export function createGlobe({ shapes, labels, onCenter }) {
  const doc = document.documentElement;
  const canvas = document.createElement('canvas');
  canvas.className = 'rb-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', labels.aria);
  const ctx = canvas.getContext('2d', { alpha: true });
  const mkBtn = (txt, label, cls, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `rb-ctl ${cls}`;
    b.textContent = txt;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', fn);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    return b;
  };
  const el = document.createElement('div');
  el.className = 'rb-globe';

  // ---- estado de la cámara
  const S = { lon: START.lon, lat: START.lat, zoom: 1, zoomTo: 1, size: 300, dpr: 1, R: 140, cx: 150, cy: 150 };
  const B = new Float64Array(9);
  let tween = null; // { lon, lat, dLon, dLat, t0, dur }
  let vLon = 0; // inercia en grados por ms
  let vLat = 0;
  let raf = 0;
  let last = 0;
  let dirty = true;
  let dragging = false;
  let destroyed = false;

  // ---- lo que se pinta
  let guessed = []; // { c, fill, label }
  let solved = null;
  let focus = null;
  const byCode = new Map(shapes.map((s) => [s.c, s]));
  const caps = shapes.map((s) => s.caps);
  const dotsOnly = shapes.filter((s) => !s.hasPoly);

  // ---- colores del tema (se leen una vez por cambio, no por cuadro)
  const K = {};
  let gradKey = '';
  let gOcean = null;
  let gShade = null;
  function refreshTheme() {
    const cs = getComputedStyle(doc);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const light = doc.dataset.giTheme === 'light';
    const fg = parseColor(v('--gi-fg', '#eaeaf0'), [234, 234, 240]);
    const bg = parseColor(v('--gi-bg', '#07070a'), [7, 7, 10]);
    const sf = parseColor(v('--gi-surface', '#0d0d13'), [13, 13, 19]);
    const ac = parseColor(v('--gi-accent', '#00f0ff'), [0, 240, 255]);
    K.light = light;
    K.glow = doc.dataset.giGlow === 'on';
    K.fg = rgba(fg, 1);
    K.bg = rgba(bg, 1);
    K.bgSoft = rgba(bg, 0.78);
    K.ocean0 = rgba(sf, 1);
    K.oceanTint = rgba(ac, light ? 0.24 : 0.14);
    K.accent = rgba(ac, 1);
    K.accentSoft = rgba(ac, 0.9);
    K.rim = rgba(ac, light ? 0.85 : 0.9);
    K.rimGlow1 = rgba(ac, 0.14);
    K.rimGlow2 = rgba(ac, 0.28);
    K.grat = rgba(fg, light ? 0.1 : 0.09);
    K.landFill = rgba(fg, light ? 0.13 : 0.12);
    K.landLine = rgba(fg, light ? 0.3 : 0.26);
    K.dot = rgba(fg, light ? 0.3 : 0.32);
    K.outline = rgba(fg, 0.95);
    K.shade = rgba(light ? fg : bg, light ? 0.18 : 0.5);
    gradKey = '';
    request();
  }

  function buildGradients() {
    const key = `${S.R}|${S.cx}|${S.cy}|${K.ocean0}`;
    if (key === gradKey) return;
    gradKey = key;
    gOcean = ctx.createRadialGradient(S.cx - S.R * 0.35, S.cy - S.R * 0.4, S.R * 0.05, S.cx, S.cy, S.R);
    gOcean.addColorStop(0, K.oceanTint);
    gOcean.addColorStop(1, 'rgba(0,0,0,0)');
    gShade = ctx.createRadialGradient(S.cx, S.cy, S.R * 0.62, S.cx, S.cy, S.R);
    gShade.addColorStop(0, 'rgba(0,0,0,0)');
    gShade.addColorStop(1, K.shade);
  }

  // ---- tamaño
  function resize() {
    const w = Math.max(1, Math.round(el.clientWidth));
    const h = Math.max(1, Math.round(el.clientHeight));
    const size = Math.min(w, h) || w;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (size === S.size && dpr === S.dpr && canvas.width === Math.round(size * dpr)) return;
    S.size = size;
    S.dpr = dpr;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    request();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(el);
  const mo = new MutationObserver(refreshTheme);
  mo.observe(doc, { attributes: true, attributeFilter: ['data-gi-theme', 'data-gi-glow', 'data-hc', 'style'] });

  // ---- trazo de un anillo (devuelve false si queda toda en la cara oculta)
  function traceRing(v, R, cx, cy) {
    const n = v.length / 3;
    const b6 = B[6];
    const b7 = B[7];
    const b8 = B[8];
    let s = -1;
    for (let i = 0; i < n; i++) {
      if (b6 * v[3 * i] + b7 * v[3 * i + 1] + b8 * v[3 * i + 2] > 0) {
        s = i;
        break;
      }
    }
    if (s < 0) return false;
    const b0 = B[0];
    const b1 = B[1];
    const b2 = B[2];
    const b3 = B[3];
    const b4 = B[4];
    const b5 = B[5];
    let hidden = false;
    let a0 = 0;
    let sweep = 0;
    let prev = 0;
    for (let k = 0; k <= n; k++) {
      const i = (s + k) % n;
      const x = v[3 * i];
      const y = v[3 * i + 1];
      const z = v[3 * i + 2];
      const X = b0 * x + b1 * y + b2 * z;
      const Y = b3 * x + b4 * y + b5 * z;
      const Z = b6 * x + b7 * y + b8 * z;
      if (Z > 0) {
        if (hidden) {
          if (sweep !== 0) ctx.arc(cx, cy, R, a0, a0 + sweep, sweep < 0);
          hidden = false;
        }
        if (k === 0) ctx.moveTo(cx + X * R, cy - Y * R);
        else ctx.lineTo(cx + X * R, cy - Y * R);
      } else {
        const l = Math.hypot(X, Y);
        if (l < 1e-9) continue; // justo en el polo de atrás: sin dirección
        const a = Math.atan2(-Y, X);
        if (!hidden) {
          hidden = true;
          a0 = a;
          sweep = 0;
          ctx.lineTo(cx + (X / l) * R, cy - (Y / l) * R);
        } else {
          let d = a - prev;
          if (d > Math.PI) d -= TAU;
          else if (d < -Math.PI) d += TAU;
          sweep += d;
        }
        prev = a;
      }
    }
    ctx.closePath();
    return true;
  }
  /** Agrega al trazo actual todos los anillos visibles de la forma. */
  function traceShape(sh, i) {
    const R = S.R;
    const cs = caps[i];
    for (let r = 0; r < sh.rings.length; r++) {
      const c = cs[r];
      if (c.r < Math.PI / 2 && B[6] * c.x + B[7] * c.y + B[8] * c.z < -c.sr) continue;
      traceRing(sh.rings[r], R, S.cx, S.cy);
    }
  }
  const shapeIndex = new Map(shapes.map((s, i) => [s.c, i]));

  // ---- graticula: meridianos y paralelos cada 30°, precalculados como vectores
  const grat = [];
  for (let lo = -180; lo < 180; lo += 30) {
    const a = [];
    for (let la = -90; la <= 90; la += 3) a.push(Math.cos(la / DEG) * Math.cos(lo / DEG), Math.cos(la / DEG) * Math.sin(lo / DEG), Math.sin(la / DEG));
    grat.push(Float64Array.from(a));
  }
  for (let la = -60; la <= 60; la += 30) {
    const a = [];
    for (let lo = -180; lo <= 180; lo += 3) a.push(Math.cos(la / DEG) * Math.cos(lo / DEG), Math.cos(la / DEG) * Math.sin(lo / DEG), Math.sin(la / DEG));
    grat.push(Float64Array.from(a));
  }
  function traceGrat() {
    const { R, cx, cy } = S;
    for (const v of grat) {
      let pen = false;
      for (let i = 0; i < v.length; i += 3) {
        const Z = B[6] * v[i] + B[7] * v[i + 1] + B[8] * v[i + 2];
        if (Z <= 0) {
          pen = false;
          continue;
        }
        const X = B[0] * v[i] + B[1] * v[i + 1] + B[2] * v[i + 2];
        const Y = B[3] * v[i] + B[4] * v[i + 1] + B[5] * v[i + 2];
        if (pen) ctx.lineTo(cx + X * R, cy - Y * R);
        else {
          ctx.moveTo(cx + X * R, cy - Y * R);
          pen = true;
        }
      }
    }
  }

  /** Punto del centro de un país en pantalla; devuelve false si está en la cara oculta. */
  const pt = { x: 0, y: 0, z: 0 };
  function centerOf(sh) {
    const v = sh.cv;
    pt.z = B[6] * v[0] + B[7] * v[1] + B[8] * v[2];
    pt.x = S.cx + (B[0] * v[0] + B[1] * v[1] + B[2] * v[2]) * S.R;
    pt.y = S.cy - (B[3] * v[0] + B[4] * v[1] + B[5] * v[2]) * S.R;
    return pt.z > 0;
  }
  const sizeCache = new Map(shapes.map((s) => [s.c, s.caps.length ? Math.max(...s.caps.map((c) => c.r)) : 0]));

  // ---- dibujo
  function draw() {
    const { R, cx, cy, size, dpr } = S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    viewBasis(S.lon, S.lat, B);
    buildGradients();

    // océano
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = K.ocean0;
    ctx.fill();
    ctx.fillStyle = gOcean;
    ctx.fill();

    // graticula
    ctx.beginPath();
    traceGrat();
    ctx.lineWidth = 1;
    ctx.strokeStyle = K.grat;
    ctx.stroke();

    // tierra tenue (todos los países: sirven para orientarse)
    ctx.beginPath();
    for (let i = 0; i < shapes.length; i++) traceShape(shapes[i], i);
    ctx.fillStyle = K.landFill;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = K.landLine;
    ctx.stroke();
    // islas sin contorno: un punto
    ctx.fillStyle = K.dot;
    for (let i = 0; i < dotsOnly.length; i++) {
      if (centerOf(dotsOnly[i])) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.8, 0, TAU);
        ctx.fill();
      }
    }

    // países adivinados
    for (let g = 0; g < guessed.length; g++) {
      const it = guessed[g];
      if (it.c === solved) continue;
      paintCountry(it.c, it.fill, 0.94, false);
    }
    if (solved) paintCountry(solved, K.accent, 1, true);

    // sombreado del borde (da volumen de esfera) y aro de neón
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = gShade;
    ctx.fill();
    if (K.glow) {
      ctx.lineWidth = 9;
      ctx.strokeStyle = K.rimGlow1;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = K.rimGlow2;
      ctx.stroke();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = K.rim;
    ctx.stroke();

    // nombres de los países adivinados que se ven de frente
    ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (let g = 0; g < guessed.length; g++) {
      const it = guessed[g];
      const sh = byCode.get(it.c);
      if (!sh || !centerOf(sh) || pt.z < 0.25) continue;
      const big = sizeCache.get(it.c) * R > 16;
      if (!big && it.c !== focus) continue;
      ctx.strokeStyle = K.bgSoft;
      ctx.strokeText(it.label, pt.x, pt.y);
      ctx.fillStyle = K.fg;
      ctx.fillText(it.label, pt.x, pt.y);
    }
  }

  function paintCountry(code, fill, alpha, glow) {
    const i = shapeIndex.get(code);
    if (i === undefined) return;
    const sh = shapes[i];
    ctx.globalAlpha = alpha;
    // el país enfocado lleva un halo blanco por fuera (se traza antes del relleno para no tapar su color)
    const halo = code === focus;
    if (sh.hasPoly) {
      ctx.beginPath();
      traceShape(sh, i);
      if (halo) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = K.outline;
        ctx.stroke();
      }
      if (glow && K.glow) {
        ctx.shadowColor = fill;
        ctx.shadowBlur = 18;
      }
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = K.bgSoft;
      ctx.stroke();
    }
    // países chicos (o sin contorno): un punto con aro para que se vean (más grande si es el país revelado)
    if ((!sh.hasPoly || sizeCache.get(code) * S.R < 5) && centerOf(sh)) {
      const r = glow ? 9 : 5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, halo ? r + 2 : r, 0, TAU);
      if (halo) {
        ctx.fillStyle = K.outline;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, TAU);
      }
      if (glow && K.glow) {
        ctx.shadowColor = fill;
        ctx.shadowBlur = 16;
      }
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = K.bgSoft;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- ciclo de animación: solo corre mientras algo se mueve
  function request() {
    dirty = true;
    if (!raf && !destroyed) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  const reduced = () => window.GameIt?.prefs?.reducedMotion || doc.dataset.giMotion === 'reduced';
  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    let moving = false;
    if (tween) {
      const t = Math.min(1, (now - tween.t0) / tween.dur);
      const e = ease(t);
      S.lon = tween.lon + tween.dLon * e;
      S.lat = tween.lat + tween.dLat * e;
      if (t >= 1) tween = null;
      else moving = true;
    }
    if (!dragging && (vLon || vLat)) {
      S.lon += vLon * dt;
      S.lat += vLat * dt;
      const f = Math.exp(-dt / 260);
      vLon *= f;
      vLat *= f;
      if (Math.abs(vLon) + Math.abs(vLat) < 0.004) vLon = vLat = 0;
      else moving = true;
    }
    if (Math.abs(S.zoomTo - S.zoom) > 0.002) {
      S.zoom += (S.zoomTo - S.zoom) * (1 - Math.exp(-dt / 80));
      if (Math.abs(S.zoomTo - S.zoom) <= 0.002) S.zoom = S.zoomTo;
      moving = true;
    }
    S.lat = Math.max(-85, Math.min(85, S.lat));
    S.lon = ((((S.lon + 180) % 360) + 360) % 360) - 180;
    S.R = (S.size / 2) * 0.93 * S.zoom;
    S.cx = S.cy = S.size / 2;
    if (dirty || moving) {
      dirty = false;
      draw();
    }
    if (moving) raf = requestAnimationFrame(frame);
  }

  // ---- control
  function focusOn(code, animate = true) {
    const sh = byCode.get(code);
    if (!sh) return;
    const [lon, lat] = sh.center;
    flyTo(lon, lat, animate);
  }
  function flyTo(lon, lat, animate = true) {
    vLon = vLat = 0;
    const dLon = lonDelta(S.lon, lon);
    const dLat = Math.max(-85, Math.min(85, lat)) - S.lat;
    if (!animate || reduced()) {
      tween = null;
      S.lon += dLon;
      S.lat += dLat;
      request();
      return;
    }
    const ang = Math.hypot(dLon, dLat);
    tween = { lon: S.lon, lat: S.lat, dLon, dLat, t0: performance.now(), dur: Math.max(380, Math.min(1000, 260 + ang * 7)) };
    request();
  }
  function zoomBy(f) {
    S.zoomTo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, S.zoomTo * f));
    if (reduced()) S.zoom = S.zoomTo;
    request();
  }
  function reset() {
    S.zoomTo = 1;
    if (reduced()) S.zoom = 1;
    flyTo(START.lon, START.lat);
  }

  // ---- arrastre con inercia
  let pid = null;
  let lx = 0;
  let ly = 0;
  let lt = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (pid !== null || e.button > 0) return;
    pid = e.pointerId;
    dragging = true;
    tween = null;
    vLon = vLat = 0;
    lx = e.clientX;
    ly = e.clientY;
    lt = performance.now();
    canvas.setPointerCapture(pid);
    el.classList.add('grab');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const now = performance.now();
    const k = DEG / S.R;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    S.lon -= dx * k;
    S.lat += dy * k;
    const dt = Math.max(1, now - lt);
    lt = now;
    // velocidad suavizada (grados por ms) para la inercia al soltar
    vLon = vLon * 0.5 + ((-dx * k) / dt) * 0.5;
    vLat = vLat * 0.5 + ((dy * k) / dt) * 0.5;
    S.lat = Math.max(-85, Math.min(85, S.lat));
    request();
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    dragging = false;
    el.classList.remove('grab');
    if (performance.now() - lt > 90 || reduced()) vLon = vLat = 0; // quedó quieto antes de soltar
    request();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const step = 12 / S.zoomTo;
    const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (m) {
      e.preventDefault();
      tween = null;
      S.lon += m[0];
      S.lat = Math.max(-85, Math.min(85, S.lat + m[1]));
      request();
    } else if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-' || e.key === '_') zoomBy(0.8);
  });

  const ctl = document.createElement('div');
  ctl.className = 'rb-ctls';
  ctl.append(mkBtn('+', labels.in, 'rb-in', () => zoomBy(1.25)), mkBtn('−', labels.out, 'rb-out', () => zoomBy(0.8)), mkBtn('◎', labels.center, 'rb-center', () => onCenter?.()));
  el.append(canvas, ctl);

  refreshTheme();
  resize();
  request();

  return {
    el,
    canvas,
    focusOn,
    flyTo,
    zoomBy,
    reset,
    refreshTheme,
    /** guessed: [{ c, fill, label }], solved: código revelado (o null), focus: código resaltado (o null) */
    set({ guesses, solved: s, focus: f }) {
      if (guesses) guessed = guesses;
      if (s !== undefined) solved = s;
      if (f !== undefined) focus = f;
      request();
    },
    /** Estado de la cámara (para pruebas y capturas). */
    get view() {
      return { lon: S.lon, lat: S.lat, zoom: S.zoomTo, R: S.R, size: S.size };
    },
    setView(lon, lat, zoom) {
      tween = null;
      vLon = vLat = 0;
      S.lon = lon;
      S.lat = lat;
      if (zoom) S.zoom = S.zoomTo = zoom;
      request();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo.disconnect();
    },
  };
}
