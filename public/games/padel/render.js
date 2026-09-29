/**
 * La Cabra · Pádel — la pista dibujada (canvas 2D), adaptada del juego original.
 *
 * Cámara "como en la tele" (detrás y por encima de tu fondo, con perspectiva) o desde arriba; tres
 * escenarios (pabellón, exterior y club) con público que festeja; jugadores de cuerpo entero con un
 * gesto para cada golpe; cristal, malla, red y la bola con su sombra y su estela.
 *
 * Todo se dibuja "desde tu lado": si jugás arriba (en línea), la pista se da vuelta para que tu
 * pareja y vos queden siempre abajo. Por eso el dibujo recibe una vista ya convertida.
 */
import { W, L, RED_Y, RED_ALT, PARED, LINEA_SAQUE, ALT_FONDO, REJA_Y0, REJA_Y1, NOM_PUNTO } from './shared/engine.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let CV = null;
let CX = null;
let DPR = 1;
let VW = 0;
let VH = 0;
let VISTA = 'tv';
let CAM = null;
let FONDO = null;
let ESC = 20;
let OX = 0;
let OY = 0;
let ESCENA = { tipo: 'pabellon', gente: 0.8, ciudad: '' };
let DECOR = { publico: [] };
const CESPED = { pabellon: '#2A64B8', exterior: '#2E8A5E', club: '#2B7896' };
let VIS = { t: 0, fiesta: 0, estado: 'saque', bola: { x: 5, y: 15, z: 0.5 } };
const ANG_TV = (52 * Math.PI) / 180;
const ANG_TV_MIN = (40 * Math.PI) / 180;
const DIST_TV = 27;

function proyTV(x, y, z) {
  const dy = CAM.yc - y;
  const dz = CAM.hc - z;
  const d = Math.max(0.5, dy * CAM.cos + dz * CAM.sin);
  const u = dy * CAM.sin - dz * CAM.cos;
  const s = CAM.F / d;
  return [CAM.cx + (x - W / 2) * s, CAM.cy - u * s, s];
}
function proy(x, y, z) {
  z = z || 0;
  return VISTA === 'tv' ? proyTV(x, y, z) : [OX + x * ESC, OY + y * ESC - z * ESC * 0.55, ESC];
}

/**
 * Prepara el lienzo. opts: { vista: 'tv'|'arriba', arriba (px libres arriba), abajo (px libres abajo), escena }
 */
export function ajustar(canvas, opts) {
  CV = canvas;
  CX = CV.getContext('2d');
  DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = innerWidth;
  VH = innerHeight;
  CV.width = Math.round(VW * DPR);
  CV.height = Math.round(VH * DPR);
  ESCENA = opts.escena || ESCENA;
  const arriba = opts.arriba ?? 64;
  const abajo = opts.abajo ?? 44;
  const Ha = VH - arriba - abajo;
  VISTA = opts.vista === 'arriba' ? 'arriba' : 'tv';
  if (VISTA === 'tv') {
    /* la cámara baja en pantallas anchas: así la pista llena el ancho y no queda todo pared */
    const caja = (ang) => {
      CAM = { cos: Math.cos(ang), sin: Math.sin(ang), yc: 10.6 + DIST_TV * Math.cos(ang), hc: DIST_TV * Math.sin(ang), F: 1, cx: 0, cy: 0 };
      const pts = [
        [-0.5, 0, ALT_FONDO + 1],
        [W + 0.5, 0, ALT_FONDO + 1],
        [-0.3, L, 0],
        [W + 0.3, L, 0],
        [-0.3, L, PARED],
        [W + 0.3, L, PARED],
      ].map((p) => proyTV(p[0], p[1], p[2]));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    let mejor = null;
    for (let g = ANG_TV; g >= ANG_TV_MIN - 1e-6; g -= Math.PI / 180) {
      const b = caja(g);
      const F = Math.min((VW - 12) / (b.x1 - b.x0), Ha / (b.y1 - b.y0));
      if (!mejor || F > mejor.F + 1e-4) mejor = { g, F };
    }
    const b = caja(mejor.g);
    CAM.F = mejor.F;
    CAM.cx = (VW - (b.x0 + b.x1) * CAM.F) / 2;
    CAM.cy = arriba + (Ha - (b.y0 + b.y1) * CAM.F) / 2;
  } else {
    const m = 0.7;
    ESC = Math.min((VW - 20) / (W + m * 2), Ha / (L + m * 2));
    OX = (VW - W * ESC) / 2;
    OY = arriba + (Ha - L * ESC) / 2;
  }
  FONDO = null; // el decorado se vuelve a pintar con el tamaño nuevo
}

function poli(c, pts) {
  c.beginPath();
  pts.forEach((p, i) => {
    const q = proy(p[0], p[1], p[2]);
    if (i) c.lineTo(q[0], q[1]);
    else c.moveTo(q[0], q[1]);
  });
  c.closePath();
}
function lineaP(c, a, b) {
  const p = proy(a[0], a[1], a[2]);
  const q = proy(b[0], b[1], b[2]);
  c.beginPath();
  c.moveTo(p[0], p[1]);
  c.lineTo(q[0], q[1]);
  c.stroke();
}
function anilloSuelo(c, x, y, r, color, ancho) {
  c.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const q = proy(x + Math.cos(a) * r, y + Math.sin(a) * r, 0);
    if (i) c.lineTo(q[0], q[1]);
    else c.moveTo(q[0], q[1]);
  }
  c.strokeStyle = color;
  c.lineWidth = ancho;
  c.stroke();
}
function rrect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function hexRGB(h) {
  const m = String(h).replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function aclarar(h, k) {
  const [r, g, b] = hexRGB(h);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
}
function oscurecer(h, k) {
  const [r, g, b] = hexRGB(h);
  return `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})`;
}

/* ── El decorado: pabellón, césped, líneas, cristales y malla. Se pinta una vez y se reutiliza ── */
function dibujarPared(c, a, b, z0, z1, tipo) {
  poli(c, [
    [a[0], a[1], z0],
    [b[0], b[1], z0],
    [b[0], b[1], z1],
    [a[0], a[1], z1],
  ]);
  if (tipo === 'cristal') {
    c.fillStyle = 'rgba(160,215,255,.09)';
    c.fill();
    c.strokeStyle = 'rgba(200,235,255,.5)';
    c.lineWidth = 1.2;
    c.stroke();
    /* reflejos de los focos en el cristal */
    const qs = [proy(a[0], a[1], z0), proy(b[0], b[1], z0), proy(b[0], b[1], z1), proy(a[0], a[1], z1)];
    const xs = qs.map((q) => q[0]);
    const ys = qs.map((q) => q[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(255,255,255,.08)';
    c.lineWidth = Math.max(3, (x1 - x0) * 0.06);
    for (const f of [0.2, 0.58]) {
      c.beginPath();
      c.moveTo(x0 + (x1 - x0) * f, y1);
      c.lineTo(x0 + (x1 - x0) * (f + 0.22), y0);
      c.stroke();
    }
    c.restore();
    return;
  }
  c.fillStyle = 'rgba(10,18,26,.30)';
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(205,215,225,.22)';
  c.lineWidth = 1;
  const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const alto = z1 - z0;
  const en = (u) => [a[0] + ((b[0] - a[0]) * u) / largo, a[1] + ((b[1] - a[1]) * u) / largo];
  for (let u = -alto; u <= largo + alto; u += 0.32) {
    const p = en(u);
    const q = en(u + alto);
    lineaP(c, [p[0], p[1], z0], [q[0], q[1], z1]);
    lineaP(c, [q[0], q[1], z0], [p[0], p[1], z1]);
  }
  c.restore();
  poli(c, [
    [a[0], a[1], z0],
    [b[0], b[1], z0],
    [b[0], b[1], z1],
    [a[0], a[1], z1],
  ]);
  c.strokeStyle = 'rgba(140,150,160,.85)';
  c.lineWidth = 1.6;
  c.stroke();
}
function pintarFondo() {
  FONDO = document.createElement('canvas');
  FONDO.width = CV.width;
  FONDO.height = CV.height;
  const c = FONDO.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  dibujarDecorado(c);
}
function dibujarDecorado(c){
  const w = VW, h = VH, tv = VISTA === 'tv', es = ESCENA, tipo = es.tipo;
  DECOR = { publico:[] };
  if(tipo === 'exterior') cieloExterior(c, w, h, tv);
  else if(tipo === 'club') fondoClub(c, w, h, tv, es.ciudad);
  else fondoPabellon(c, w, h);
  if(tv){
    gradas(c, es);
    if(tipo !== 'club'){
      poli(c, [[-.5,-.05,ALT_FONDO+.12],[W+.5,-.05,ALT_FONDO+.12],[W+.5,-.05,ALT_FONDO+.9],[-.5,-.05,ALT_FONDO+.9]]);
      c.fillStyle = '#0D2C52'; c.fill(); c.strokeStyle = 'rgba(127,211,247,.5)'; c.lineWidth = 1; c.stroke();
      const q = proy(W/2, -.05, ALT_FONDO + .5);
      c.fillStyle = '#DCF54A'; c.font = `900 ${Math.max(9, q[2]*.44)}px Inter, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('LA CABRA · PÁDEL TOUR', q[0], q[1]); c.textBaseline = 'alphabetic';
    }
  }
  /* el suelo de alrededor y el césped, con sus franjas */
  poli(c, [[-1.3,-.4,0],[W+1.3,-.4,0],[W+1.3,L+1.2,0],[-1.3,L+1.2,0]]); c.fillStyle = tipo === 'exterior' ? '#8A949A' : tipo === 'club' ? '#23262F' : '#10335E'; c.fill();
  poli(c, [[0,0,0],[W,0,0],[W,L,0],[0,L,0]]); c.fillStyle = CESPED[tipo]; c.fill();
  for(let k = 0; k < L; k += 2){ poli(c, [[0,k,0],[W,k,0],[W,k+1,0],[0,k+1,0]]); c.fillStyle = 'rgba(255,255,255,.035)'; c.fill(); }
  c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = Math.max(1.4, proy(W/2, RED_Y, 0)[2]*.055);
  lineaP(c, [0, RED_Y - LINEA_SAQUE, 0], [W, RED_Y - LINEA_SAQUE, 0]); lineaP(c, [0, RED_Y + LINEA_SAQUE, 0], [W, RED_Y + LINEA_SAQUE, 0]);
  lineaP(c, [W/2, RED_Y - LINEA_SAQUE, 0], [W/2, RED_Y + LINEA_SAQUE, 0]);
  lucesPista(c, tipo);
  if(!tv){
    const m = .7;
    c.fillStyle = 'rgba(127,211,247,.10)';
    c.fillRect(OX - m*ESC, OY - m*ESC, (W + m*2)*ESC, m*ESC); c.fillRect(OX - m*ESC, OY + L*ESC, (W + m*2)*ESC, m*ESC);
    c.fillRect(OX - m*ESC, OY, m*ESC, L*ESC); c.fillRect(OX + W*ESC, OY, m*ESC, L*ESC);
    c.fillStyle = 'rgba(200,210,220,.18)';
    for(const x0 of [OX - m*ESC, OX + W*ESC]) for(let y = REJA_Y0; y < REJA_Y1; y += .5) c.fillRect(x0, OY + y*ESC, m*ESC, .2*ESC);
    c.strokeStyle = 'rgba(170,225,255,.6)'; c.lineWidth = Math.max(2.5, ESC*.12); c.strokeRect(OX, OY, W*ESC, L*ESC);
    return;
  }
  dibujarPared(c, [0,0], [W,0], 0, PARED, 'cristal'); dibujarPared(c, [0,0], [W,0], PARED, ALT_FONDO, 'reja');
  for(const x of [0, W]){
    dibujarPared(c, [x,0], [x,REJA_Y0], 0, PARED, 'cristal');
    dibujarPared(c, [x,REJA_Y0], [x,REJA_Y1], 0, PARED, 'reja');
    dibujarPared(c, [x,REJA_Y1], [x,L], 0, PARED, 'cristal');
  }
  /* el foco en la pista: los bordes se van a negro (se nota en pantallas anchas) */
  const vg = c.createRadialGradient(w/2, h*.46, Math.min(w, h)*.34, w/2, h*.46, Math.max(w, h)*.6);
  vg.addColorStop(0, 'rgba(3,9,13,0)'); vg.addColorStop(1, 'rgba(3,9,13,.62)');
  c.fillStyle = vg; c.fillRect(0, 0, w, h);
  /* debajo de la pista, más oscuro para que los botones se lean bien */
  const yC = proy(W/2, L + 1.2, 0)[1], gv = c.createLinearGradient(0, yC, 0, h);
  gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,.5)'); c.fillStyle = gv; c.fillRect(0, yC, w, h - yC);
}
/* los focos iluminan el césped (en exterior, el sol) */
function lucesPista(c, tipo){
  c.save();
  poli(c, [[0,0,0],[W,0,0],[W,L,0],[0,L,0]]); c.clip();
  c.globalCompositeOperation = 'lighter';
  if(tipo === 'exterior'){
    const a = proy(W, 0, 0), b = proy(0, L, 0), g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
    g.addColorStop(0, 'rgba(255,240,200,.18)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  } else {
    for(const [x, y] of [[1.6,3.2],[W-1.6,3.2],[1.6,L-3.2],[W-1.6,L-3.2],[W/2,RED_Y]]){
      const q = proy(x, y, 0), r = q[2]*(tipo === 'club' ? 3.3 : 4.4), g = c.createRadialGradient(q[0], q[1], 0, q[0], q[1], r);
      g.addColorStop(0, `rgba(255,255,240,${tipo === 'club' ? .09 : .13})`); g.addColorStop(1, 'rgba(255,255,240,0)');
      c.fillStyle = g; c.fillRect(q[0] - r, q[1] - r, r*2, r*2);
    }
  }
  c.restore();
}
function fondoPabellon(c, w, h){
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0B1A2C'); g.addColorStop(.6, '#07121D'); g.addColorStop(1, '#03080D');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for(let i = 0; i < 7; i++){
    const x = w*(.08 + i*.14), y = 14 + (i % 2)*6, gg = c.createRadialGradient(x, y, 1, x, y, 36);
    gg.addColorStop(0, 'rgba(255,255,245,.95)'); gg.addColorStop(.14, 'rgba(255,255,245,.35)'); gg.addColorStop(1, 'rgba(255,255,245,0)');
    c.fillStyle = gg; c.fillRect(x - 36, y - 36, 72, 72);
  }
  const f = c.createRadialGradient(w/2, h*.25, 10, w/2, h*.25, w*.95); f.addColorStop(0, 'rgba(255,255,255,.08)'); f.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = f; c.fillRect(0, 0, w, h);
}
function cieloExterior(c, w, h, tv){
  const g = c.createLinearGradient(0, 0, 0, h*.55); g.addColorStop(0, '#3C8BD9'); g.addColorStop(1, '#BFE3FA');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const sx = w*.84, sy = h*.07, sg = c.createRadialGradient(sx, sy, 4, sx, sy, w*.32);
  sg.addColorStop(0, 'rgba(255,250,215,1)'); sg.addColorStop(.1, 'rgba(255,240,180,.85)'); sg.addColorStop(1, 'rgba(255,240,180,0)');
  c.fillStyle = sg; c.fillRect(0, 0, w, h*.6);
  c.fillStyle = 'rgba(255,255,255,.78)';
  for(let i = 0; i < 5; i++){ const x = Math.random()*w, y = h*(.03 + Math.random()*.1), r = 9 + Math.random()*14; for(let k = 0; k < 4; k++){ c.beginPath(); c.arc(x + k*r*.8, y + (k % 2)*r*.2, r*(1 - k*.12), 0, Math.PI*2); c.fill(); } }
  const yh = tv ? proy(W/2, -7, 0)[1] : h*.08;
  /* lomas al fondo */
  c.fillStyle = 'rgba(116,146,176,.45)';
  c.beginPath(); c.moveTo(0, yh + 2);
  for(let x = 0; x <= w; x += w/7) c.lineTo(x, yh - 8 - Math.abs(Math.sin(x/w*3.4))*20);
  c.lineTo(w, yh + 2); c.closePath(); c.fill();
  c.fillStyle = '#6FA36B'; c.fillRect(0, yh, w, h - yh);
  /* el césped, cortado a bandas */
  let yb = yh, paso = 5;
  for(let k = 0; yb < h; k++){ if(k % 2){ c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(0, yb, w, paso); } yb += paso; paso *= 1.2; }
  c.fillStyle = '#2F6B3F';
  for(let x = -10; x < w + 20; x += 13 + Math.random()*10){ const r = 11 + Math.random()*14; c.beginPath(); c.arc(x, yh - r*.45, r, 0, Math.PI*2); c.fill(); }
  /* árboles a los lados: enmarcan la pista en pantallas anchas */
  if(w > 860) for(const [fx, alto] of [[.04, 150], [.135, 104], [.87, 116], [.96, 160]]) arbolFondo(c, w*fx, yh + alto*.16, alto);
}
function arbolFondo(c, x, y, alto){
  c.fillStyle = '#33241A'; c.fillRect(x - alto*.035, y - alto*.34, alto*.07, alto*.36);
  c.fillStyle = '#2C5E38';
  for(const [dx, dy, r] of [[0,-.62,.29],[-.2,-.46,.23],[.2,-.46,.23],[0,-.34,.25]]){ c.beginPath(); c.arc(x + dx*alto, y + dy*alto, r*alto, 0, Math.PI*2); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.07)';
  for(const [dx, dy, r] of [[-.1,-.68,.16],[.12,-.5,.12]]){ c.beginPath(); c.arc(x + dx*alto, y + dy*alto, r*alto, 0, Math.PI*2); c.fill(); }
}
function fondoClub(c, w, h, tv, ciudad){
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2A2233'); g.addColorStop(1, '#141019');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  if(!tv) return;
  const y0 = proy(W/2, -2.5, 6.6)[1], y1 = proy(W/2, -.3, 0)[1];
  for(let y = y0, f = 0; y < y1; y += 9, f++) for(let x = (f % 2)*-10; x < w; x += 20){ c.fillStyle = Math.random() < .5 ? '#4A2F2A' : '#5A3A31'; c.fillRect(x + 1, y + 1, 18, 7); }
  const gp = c.createLinearGradient(0, y0, 0, y1); gp.addColorStop(0, 'rgba(6,10,16,.55)'); gp.addColorStop(1, 'rgba(6,10,16,0)');
  c.fillStyle = gp; c.fillRect(0, y0, w, y1 - y0);
  for(const fx of [.22, .78]){
    const x = w*fx, y = y0 + 5, gg = c.createRadialGradient(x, y, 2, x, y, 90);
    gg.addColorStop(0, 'rgba(235,245,255,.3)'); gg.addColorStop(1, 'rgba(235,245,255,0)');
    c.fillStyle = gg; c.fillRect(x - 90, y - 90, 180, 180);
    c.fillStyle = 'rgba(240,248,255,.95)'; c.fillRect(x - 32, y, 64, 4);
  }
  /* carteles en la pared: en pantallas anchas los lados no quedan vacíos */
  if(w > 860){
    const bw = Math.min(170, w*.12), bh = Math.max(46, (y1 - y0)*.52), yb = y0 + (y1 - y0)*.2;
    for(const bx of [w*.11, w*.89]){
      c.fillStyle = 'rgba(10,17,24,.88)'; c.fillRect(bx - bw/2, yb, bw, bh);
      c.fillStyle = '#DCF54A'; c.fillRect(bx - bw/2, yb, bw, Math.max(3, bh*.13));
      c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(bx - bw*.4, yb + bh*.34, bw*.8, Math.max(2, bh*.08));
      c.fillStyle = 'rgba(255,255,255,.11)'; c.fillRect(bx - bw*.4, yb + bh*.56, bw*.5, Math.max(2, bh*.07));
      c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1; c.strokeRect(bx - bw/2, yb, bw, bh);
    }
  }
  poli(c, [[1.2,-.05,ALT_FONDO+.15],[W-1.2,-.05,ALT_FONDO+.15],[W-1.2,-.05,ALT_FONDO+.9],[1.2,-.05,ALT_FONDO+.9]]);
  c.fillStyle = '#F4F0E6'; c.fill();
  const q = proy(W/2, -.05, ALT_FONDO + .52);
  c.fillStyle = '#1B3A5C'; c.font = `900 ${Math.max(8, q[2]*.36)}px Inter, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(('CLUB DE PÁDEL ' + (ciudad || '')).toUpperCase(), q[0], q[1]); c.textBaseline = 'alphabetic';
}
/* ── La grada: un tendido con escalones, pasillos, barandilla y gente distinta en
   cada asiento. En el club, una terraza asomada a la pista ── */
const CAMISETAS_PUBLICO = ['#E4572E','#2E86DE','#F5C542','#F4F6F8','#22D3A5','#C792EA','#FF8A7A','#1B2733','#DCF54A','#7FD3F7','#B5651D','#E8E1D3'];
const PIELES = ['#F1D2B3','#E6BF9A','#C99A74','#A9763F','#8D5A3B','#6B4227'];
const PELOS = ['#2B1B12','#151013','#4A3423','#6B4A2A','#8C6A4A','#D8C48A','#9A9A9A'];
const BANDERAS = [['#74ACDF','#FFFFFF','#74ACDF'],['#AA151B','#F1BF00','#AA151B'],['#009246','#FFFFFF','#CE2B37'],['#0055A4','#FFFFFF','#EF4135'],
                  ['#006847','#FFFFFF','#CE1126'],['#FFFFFF','#0038A8','#FFFFFF'],['#009C3B','#FFDF00','#009C3B'],['#D52B1E','#FFFFFF','#D52B1E']];
function crearPersona(x, y, tam, a){
  return { x, y, tam, a, col: pick(CAMISETAS_PUBLICO), piel: pick(PIELES), pelo: pick(PELOS), gorra: Math.random() < .22, f: Math.random()*6.3 };
}
/* una persona: hombros, cuello, cabeza y pelo (o gorra). Con los brazos arriba si festeja */
function personaGrada(c, p, salto, brazos){
  const t = p.tam, y = p.y - salto;
  if(p.tope != null){ c.save(); c.beginPath(); c.rect(0, 0, VW, p.tope); c.clip(); }
  if(p.a != null && p.a < 1) c.globalAlpha = p.a;
  if(brazos){
    c.strokeStyle = p.piel; c.lineWidth = Math.max(1, t*.3); c.lineCap = 'round';
    c.beginPath(); c.moveTo(p.x - t*.68, y - t*.85); c.lineTo(p.x - t*1.1, y - t*2.15);
    c.moveTo(p.x + t*.68, y - t*.85); c.lineTo(p.x + t*1.1, y - t*2.15); c.stroke();
  }
  c.fillStyle = p.col;
  c.beginPath();
  c.moveTo(p.x - t, y + t*.12);
  c.quadraticCurveTo(p.x - t*.96, y - t*.9, p.x - t*.36, y - t*1.1);
  c.lineTo(p.x + t*.36, y - t*1.1);
  c.quadraticCurveTo(p.x + t*.96, y - t*.9, p.x + t, y + t*.12);
  c.closePath(); c.fill();
  c.fillStyle = p.piel;
  c.fillRect(p.x - t*.18, y - t*1.3, t*.36, t*.3);
  c.beginPath(); c.arc(p.x, y - t*1.6, t*.5, 0, Math.PI*2); c.fill();
  c.fillStyle = p.pelo;
  c.beginPath();
  if(p.gorra){ c.arc(p.x, y - t*1.66, t*.52, Math.PI, Math.PI*2); c.fill(); c.fillRect(p.x - t*.1, y - t*1.76, t*.86, Math.max(1, t*.13)); }
  else { c.arc(p.x, y - t*1.68, t*.5, Math.PI*.9, Math.PI*2.1); c.fill(); }
  c.globalAlpha = 1;
  if(p.tope != null) c.restore();
}
function bandera(c, x, y, ancho){
  const b = pick(BANDERAS), alto = ancho*.6, horiz = Math.random() < .5;
  c.strokeStyle = 'rgba(214,230,240,.8)'; c.lineWidth = Math.max(1, ancho*.07);
  c.beginPath(); c.moveTo(x, y + alto*2); c.lineTo(x, y); c.stroke();
  b.forEach((col, i) => { c.fillStyle = col; if(horiz) c.fillRect(x, y + i*alto/3, ancho, alto/3 + .5); else c.fillRect(x + i*ancho/3, y, ancho/3 + .5, alto); });
}
function gradas(c, es){
  const w = VW, sF = proy(W/2, -3, 0)[2];
  const yBase = proy(W/2, -.3, ALT_FONDO + 1)[1], yTop = Math.max(-16, proy(W/2, -4.5, 8.6)[1]);
  if(yBase - yTop < 14) return;
  const px0 = proy(0, 0, 0)[0], px1 = proy(W, 0, 0)[0], ancho = px1 - px0;
  const tam = Math.max(2.8, Math.min(7.6, sF*.33));
  if(es.tipo === 'club') return terrazaClub(c, es, Math.max(0, px0 - ancho*.24), Math.min(w, px1 + ancho*.24), yBase, tam);
  const gx0 = es.tipo === 'pabellon' ? 0 : Math.max(0, px0 - ancho*.36);
  const gx1 = es.tipo === 'pabellon' ? w : Math.min(w, px1 + ancho*.36);
  tendido(c, es, gx0, gx1, yBase, yTop, tam);
}
function tendido(c, es, gx0, gx1, yBase, yTop, tam){
  const gw = gx1 - gx0, exterior = es.tipo === 'exterior';
  /* los escalones, de la primera fila hacia arriba */
  const filas = []; let y = yBase - tam*1.6, t = tam, paso = t*2.5;
  for(let f = 0; f < (exterior ? 4 : 40) && y - paso > yTop; f++){ filas.push({ y, t }); y -= paso; t *= .94; paso = t*2.5; }
  if(!filas.length) return;
  const yArriba = y;
  const gF = c.createLinearGradient(0, yArriba, 0, yBase);
  if(exterior){ gF.addColorStop(0, '#5F6870'); gF.addColorStop(1, '#8A949C'); }
  else { gF.addColorStop(0, '#07111B'); gF.addColorStop(1, '#122438'); }
  c.fillStyle = gF; c.fillRect(gx0, yArriba, gw, yBase - yArriba);
  const pasillos = [], nPas = Math.max(0, Math.round(gw/240));
  for(let k = 1; k <= nPas; k++) pasillos.push(gx0 + gw*k/(nPas + 1));
  /* de atrás hacia adelante: escalón, gente y el borde del escalón por delante */
  for(let f = filas.length - 1; f >= 0; f--){
    const fila = filas[f], prof = f/Math.max(1, filas.length - 1), tt = fila.t, alpha = 1 - prof*.34;
    c.fillStyle = exterior ? `rgba(24,30,34,${(.08 + prof*.2).toFixed(3)})` : `rgba(4,10,18,${(.14 + prof*.32).toFixed(3)})`;
    c.fillRect(gx0, fila.y - tt*2.2, gw, tt*2.2);
    const paso2 = tt*2.35;
    for(let x = gx0 + paso2*(.5 + (f % 2)*.35); x < gx1 - tt*.6; x += paso2){
      if(pasillos.some(px => Math.abs(x - px) < tt*1.7)) continue;               // el pasillo, libre
      if(Math.random() > es.gente*(1 - prof*.12)) continue;                      // asientos vacíos
      const p = crearPersona(x + rnd(-.25, .25)*tt, fila.y + tt*.3 + rnd(-.1, .1)*tt, tt*rnd(.9, 1.1), alpha);
      if(f <= 1 && DECOR.publico.length < 60 && Math.random() < .45) DECOR.publico.push(p); else personaGrada(c, p, 0, false);
      if(Math.random() < .03*es.gente) bandera(c, x + tt, fila.y - tt*3.6, tt*2.3);
    }
    c.fillStyle = exterior ? 'rgba(238,246,250,.45)' : 'rgba(150,190,220,.26)';
    c.fillRect(gx0, fila.y + tt*.1, gw, Math.max(1, tt*.2));
    c.fillStyle = 'rgba(0,0,0,.42)';
    c.fillRect(gx0, fila.y + tt*.3, gw, Math.max(1, tt*.42));
  }
  c.fillStyle = exterior ? 'rgba(32,38,42,.4)' : 'rgba(6,14,22,.55)';
  for(const px of pasillos) c.fillRect(px - tam*.85, yArriba, tam*1.7, yBase - yArriba);
  /* la valla de delante y la estructura */
  const yv = yBase - tam*1.6;
  if(exterior){
    c.fillStyle = '#98A2AA'; c.fillRect(gx0, yv, gw, tam*1.45);
    c.fillStyle = 'rgba(255,255,255,.32)'; c.fillRect(gx0, yv, gw, Math.max(1, tam*.2));
    c.fillStyle = 'rgba(12,18,22,.5)'; c.fillRect(gx0, yv + tam*1.45, gw, Math.max(1, tam*.5));
    c.fillStyle = '#4C555C';
    for(let x = gx0 + tam*2.5; x < gx1 - tam; x += tam*7) c.fillRect(x, yv + tam*1.8, Math.max(1.5, tam*.32), tam*2.6);
    c.fillStyle = 'rgba(0,0,0,.16)'; c.fillRect(gx0, yv + tam*4.2, gw, tam*.8);
    c.fillStyle = '#5F6870'; c.fillRect(gx0 - tam*.55, yArriba, tam*.6, yBase - yArriba); c.fillRect(gx1 - tam*.05, yArriba, tam*.6, yBase - yArriba);
  } else {
    c.fillStyle = '#0A1826'; c.fillRect(gx0, yv, gw, tam*1.45);
    c.fillStyle = 'rgba(127,211,247,.28)'; c.fillRect(gx0, yv + tam*.5, gw, Math.max(1, tam*.24));
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(gx0, yv + tam*1.45, gw, Math.max(1, tam*.45));
  }
}
function terrazaClub(c, es, gx0, gx1, yBase, tam){
  const gw = gx1 - gx0, t = tam*1.12, yPar = yBase - t*1.7, alto = t*4.6, yTecho = yPar - alto;
  /* el hueco del balcón, con la luz cálida del club */
  const g = c.createLinearGradient(0, yTecho, 0, yPar);
  g.addColorStop(0, 'rgba(9,12,16,.92)'); g.addColorStop(.5, 'rgba(30,24,20,.6)'); g.addColorStop(1, 'rgba(48,38,30,.3)');
  c.fillStyle = g; c.fillRect(gx0, yTecho, gw, alto);
  c.fillStyle = 'rgba(255,226,170,.55)'; c.fillRect(gx0 + t, yTecho + t*.25, gw - t*2, Math.max(1, t*.16));
  const luz = c.createLinearGradient(0, yTecho, 0, yPar);
  luz.addColorStop(0, 'rgba(255,212,150,.24)'); luz.addColorStop(1, 'rgba(255,212,150,0)');
  c.fillStyle = luz; c.fillRect(gx0, yTecho, gw, alto);
  /* la gente asomada */
  let x = gx0 + t*2.2;
  while(x < gx1 - t*2.2){
    if(Math.random() < .75){
      const n = 1 + Math.floor(Math.random()*3);
      for(let k = 0; k < n; k++){
        const p = crearPersona(x + k*t*1.75, yPar + t*.55, t*rnd(.92, 1.08), 1);
        if(DECOR.publico.length < 22 && Math.random() < .5) DECOR.publico.push(p); else personaGrada(c, p, 0, false);
      }
      if(Math.random() < .3) bandera(c, x - t*.9, yPar - t*2.6, t*2);
      x += n*t*1.75 + t*rnd(1.4, 3.6);
    } else x += t*rnd(1.8, 4);
  }
  /* la baranda de cristal, con pasamanos */
  c.fillStyle = 'rgba(150,205,240,.13)'; c.fillRect(gx0, yPar, gw, t*1.7);
  c.strokeStyle = 'rgba(200,230,245,.3)'; c.lineWidth = 1;
  for(let px = gx0 + t*2.6; px < gx1 - t; px += t*2.6){ c.beginPath(); c.moveTo(px, yPar); c.lineTo(px, yPar + t*1.7); c.stroke(); }
  c.fillStyle = '#8A96A0'; c.fillRect(gx0, yPar, gw, Math.max(1.5, t*.22));
  c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(gx0, yPar, gw, Math.max(1, t*.09));
  c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(gx0, yPar + t*1.7, gw, Math.max(1, t*.5));
  /* los extremos del balcón y un par de plantas */
  c.fillStyle = '#0D1520';
  c.fillRect(gx0 - t*.5, yTecho, t*1, alto + t*1.7);
  c.fillRect(gx1 - t*.5, yTecho, t*1, alto + t*1.7);
  for(const px of [gx0 + t*1.4, gx1 - t*1.4]) planta(c, px, yPar + t*.2, t*2.6);
}
function planta(c, x, y, alto){
  c.fillStyle = '#2B313A'; c.fillRect(x - alto*.17, y - alto*.34, alto*.34, alto*.34);
  c.fillStyle = '#27633C';
  for(const [dx, dy, r] of [[0,-.6,.23],[-.17,-.45,.18],[.17,-.45,.18]]){ c.beginPath(); c.arc(x + dx*alto, y + dy*alto, r*alto, 0, Math.PI*2); c.fill(); }
}
function publicoAnimado(c){
  if(VISTA !== 'tv' || !DECOR.publico.length) return;
  const fiesta = Math.min(1, Math.max(0, VIS.fiesta || 0));
  for(const p of DECOR.publico){
    const salta = fiesta > 0 && p.f % 1 < .78;
    personaGrada(c, p, salta ? Math.abs(Math.sin(VIS.t*9 + p.f))*p.tam*1.1*fiesta : 0, salta);
    if(salta && Math.random() < .004*fiesta){ c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(p.x, p.y - p.tam*2.3, p.tam*1.1, 0, Math.PI*2); c.fill(); }
  }
}
/* ── Los jugadores, de cuerpo entero ──
   Piernas con rodilla, los dos brazos, un gesto para cada golpe (bandeja y remate por arriba, con salto en el
   remate; drive de costado; globo de abajo arriba; saque por debajo) y el puño arriba al ganar el punto */
function sombrasFigura(c, pie, s, salto){
  const tv = VISTA === 'tv', tipo = ESCENA.tipo, k = 1 - Math.min(.55, salto);
  if(tipo === 'exterior'){
    c.fillStyle = `rgba(0,0,0,${.3*k})`; c.beginPath(); c.ellipse(pie[0] - s*.5, pie[1] + s*.04, s*.95, s*.19, -.22, 0, Math.PI*2); c.fill();
  } else for(const [ox, oy] of [[-.3, .05], [.3, .05], [0, .12]]){
    c.fillStyle = `rgba(0,0,0,${.12*k})`; c.beginPath(); c.ellipse(pie[0] + ox*s, pie[1] + oy*s, s*.42, s*.42*(tv ? .38 : .55), 0, 0, Math.PI*2); c.fill();
  }
  c.fillStyle = `rgba(0,0,0,${.3*k})`; c.beginPath(); c.ellipse(pie[0], pie[1], s*.26, s*.26*(tv ? .38 : .55), 0, 0, Math.PI*2); c.fill();
}
function dibujarFigura(c, j){
  const tv = VISTA === 'tv', pie = proy(j.x, j.y, 0), s = pie[2], t = VIS.t;
  const golpe = j.anim > 0 ? 1 - j.anim/.22 : 0, tipo = j.ultimoTiro || 'drive';
  const porArriba = tipo === 'remate' || tipo === 'vibora' || tipo === 'bandeja';
  const festeja = VIS.estado === 'punto' && VIS.ganador === j.equipo;
  const salto = (golpe > 0 && tipo === 'remate' ? Math.sin(golpe*Math.PI)*.38 : 0) + (festeja ? Math.abs(Math.sin(t*9 + j.id))*.16 : 0);
  sombrasFigura(c, pie, s, salto);
  if(j.yo && j.alcanza){
    const dulce = VIS.bola.z > .45 && VIS.bola.z < 1.5;
    anilloSuelo(c, j.x, j.y, j.alcance*(dulce ? 1 + .04*Math.sin(t*30) : 1), dulce ? '#F5C542' : 'rgba(220,245,74,.9)', dulce ? 4 : 2.5);
  }
  const alt = z => proy(j.x, j.y, z + salto);
  const cadera = alt(.92), hombro = alt(1.4), cabeza = alt(1.67), ancho = s*.44;
  const corre = Math.hypot(j.vx, j.vy) > .4, f = corre ? Math.sin(t*15 + j.id) : 0;
  const piel = '#E6BF9A', pielOsc = '#C99A74';
  c.lineCap = 'round'; c.lineJoin = 'round';
  const pierna = (lado, fase) => {
    const pp = proy(j.x + lado*.13 + fase*.1, j.y - fase*.18, Math.max(0, salto - .05) + (corre ? Math.max(0, -fase)*.08 : 0));
    const hx = cadera[0] + lado*s*.09, hy = cadera[1], kx = (hx + pp[0])/2 + lado*s*.03, ky = (hy + pp[1])/2 - (salto > .05 ? s*.1 : s*.02);
    c.strokeStyle = pielOsc; c.lineWidth = Math.max(2, s*.12);
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(kx, ky); c.lineTo(pp[0], pp[1] - s*.05); c.stroke();
    c.strokeStyle = '#F4F6F8'; c.lineWidth = Math.max(1.5, s*.1); c.beginPath(); c.moveTo(pp[0], pp[1] - s*.14); c.lineTo(pp[0], pp[1] - s*.05); c.stroke();
    c.fillStyle = j.zapas || '#F4F6F8'; c.beginPath(); c.ellipse(pp[0] + lado*s*.02, pp[1] - s*.02, Math.max(2, s*.1), Math.max(1.5, s*.055), 0, 0, Math.PI*2); c.fill();
    if(j.zapas && j.zapas !== '#F4F6F8'){ c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; c.stroke(); }
    c.fillStyle = j.color; c.fillRect(pp[0] - s*.07, pp[1] - s*.035, s*.14, Math.max(1, s*.018));
  };
  pierna(-1, f); pierna(1, -f);
  c.fillStyle = '#1B2733'; rrect(c, cadera[0] - ancho*.46, cadera[1] - s*.15, ancho*.92, s*.27, s*.06); c.fill();
  const gT = c.createLinearGradient(hombro[0] - ancho/2, hombro[1], hombro[0] + ancho/2, cadera[1]);
  gT.addColorStop(0, aclarar(j.color, .28)); gT.addColorStop(.55, j.color); gT.addColorStop(1, oscurecer(j.color, .3));
  c.fillStyle = gT; rrect(c, hombro[0] - ancho/2, hombro[1] - s*.05, ancho, cadera[1] - hombro[1] + s*.03, s*.12); c.fill();
  /* el diseño de la camiseta: rayas, franja o la bandera de tu país */
  const tX = hombro[0] - ancho/2, tY = hombro[1] - s*.05, tW = ancho, tH = cadera[1] - hombro[1] + s*.03;
  if(j.diseno && j.diseno !== 'lisa'){
    c.save(); rrect(c, tX, tY, tW, tH, s*.12); c.clip();
    if(j.diseno === 'bandera' && j.banda){ j.banda.forEach((col, i) => { c.fillStyle = col; c.fillRect(tX, tY + i*tH/3, tW, tH/3 + 1); }); c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(tX + tW*.58, tY, tW*.42, tH); }
    else if(j.diseno === 'rayas'){ c.fillStyle = 'rgba(0,0,0,.24)'; for(let k = 0; k < 3; k++) c.fillRect(tX + tW*(.1 + k*.32), tY, tW*.13, tH); }
    else if(j.diseno === 'franja'){ c.fillStyle = 'rgba(255,255,255,.78)'; c.beginPath(); c.moveTo(tX, tY + tH*.14); c.lineTo(tX + tW*.8, tY + tH); c.lineTo(tX + tW, tY + tH); c.lineTo(tX + tW, tY + tH*.82); c.lineTo(tX + tW*.22, tY); c.lineTo(tX, tY); c.closePath(); c.fill(); }
    c.restore();
  }
  if(j.diseno !== 'bandera'){ c.fillStyle = oscurecer(j.color, .38); c.fillRect(hombro[0] - ancho*.07, hombro[1] - s*.01, ancho*.14, (cadera[1] - hombro[1])*.88); }
  /* los brazos: el de la pala hace el gesto del golpe; el otro acompaña o festeja */
  const lado = (j.lado === 0 ? 1 : -1)*(j.zurdo ? -1 : 1);
  let angP = -.35;
  if(festeja) angP = -1.25;
  else if(golpe > 0) angP = porArriba ? -2.5 + golpe*3.1 : tipo === 'globo' ? 1.3 - golpe*3.2 : tipo === 'saque' ? 1.5 - golpe*2.1 : .95 - golpe*2.6;
  else if(j.swing > 0) angP = VIS.bola && VIS.bola.z > 1.6 ? -2.4 : .95;
  let angO = 1.25 + f*.6;
  if(festeja) angO = -1.75 + Math.sin(t*14)*.15;
  else if(golpe > 0 && porArriba) angO = -1.9;
  const brazo = (sx, sy, ang, sgn, largo, conPala) => {
    const codo = [sx + sgn*Math.cos(ang - .3)*largo*.5, sy + Math.sin(ang - .3)*largo*.5];
    const mano = [codo[0] + sgn*Math.cos(ang)*largo*.5, codo[1] + Math.sin(ang)*largo*.5];
    c.strokeStyle = piel; c.lineWidth = Math.max(2, s*.09);
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(codo[0], codo[1]); c.lineTo(mano[0], mano[1]); c.stroke();
    if(conPala){
      const px = mano[0] + sgn*Math.cos(ang)*s*.18, py = mano[1] + Math.sin(ang)*s*.18;
      c.strokeStyle = '#0F1C22'; c.lineWidth = Math.max(2, s*.06); c.beginPath(); c.moveTo(mano[0], mano[1]); c.lineTo(px, py); c.stroke();
      const cx = px + sgn*Math.cos(ang)*s*.13, cy = py + Math.sin(ang)*s*.13, rp = Math.max(3, s*.16);
      const gp = c.createRadialGradient(cx - rp*.3, cy - rp*.3, 1, cx, cy, rp*1.2);
      gp.addColorStop(0, aclarar(j.colorPala || '#0F1C22', .4)); gp.addColorStop(1, j.colorPala || '#0F1C22');
      c.fillStyle = gp; c.beginPath(); c.ellipse(cx, cy, rp, Math.max(2.5, s*.13), sgn*ang, 0, Math.PI*2); c.fill();
      c.strokeStyle = j.color; c.lineWidth = 1.5; c.stroke();
      const ry2 = Math.max(2.5, s*.13);
      if(j.palaDiseno === 'rayo'){ c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = Math.max(1, s*.03); c.beginPath(); c.moveTo(cx - rp*.3, cy - ry2*.75); c.lineTo(cx + rp*.25, cy - ry2*.05); c.lineTo(cx - rp*.15, cy + ry2*.05); c.lineTo(cx + rp*.3, cy + ry2*.75); c.stroke(); }
      else if(j.palaDiseno === 'aro'){ c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = Math.max(1, s*.025); c.beginPath(); c.ellipse(cx, cy, rp*.6, ry2*.6, sgn*ang, 0, Math.PI*2); c.stroke(); }
      else if(j.palaDiseno === 'degradado'){ const g2 = c.createLinearGradient(cx - rp, cy - ry2, cx + rp, cy + ry2); g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, 'rgba(255,255,255,.6)'); c.fillStyle = g2; c.beginPath(); c.ellipse(cx, cy, rp, ry2, sgn*ang, 0, Math.PI*2); c.fill(); }
    } else if(festeja){ c.fillStyle = piel; c.beginPath(); c.arc(mano[0], mano[1], Math.max(1.5, s*.05), 0, Math.PI*2); c.fill(); }
  };
  const sh = hombro[1] + s*.02;
  brazo(hombro[0] - lado*ancho*.46, sh, angO, -lado, s*.45, false);
  brazo(hombro[0] + lado*ancho*.46, sh, angP, lado, s*.5, true);
  const rc = Math.max(3, s*.13), gC = c.createRadialGradient(cabeza[0] - rc*.3, cabeza[1] - rc*.3, rc*.2, cabeza[0], cabeza[1], rc);
  gC.addColorStop(0, aclarar(piel, .15)); gC.addColorStop(1, pielOsc);
  c.fillStyle = gC; c.beginPath(); c.arc(cabeza[0], cabeza[1], rc, 0, Math.PI*2); c.fill();
  if(j.lado === 0 && tv){ c.fillStyle = '#2B1B12'; c.beginPath(); c.arc(cabeza[0], cabeza[1] - rc*.05, rc*.98, Math.PI*.95, Math.PI*2.05); c.fill(); }   // de espaldas: el pelo
  else { c.fillStyle = '#1B1B1B'; c.beginPath(); c.arc(cabeza[0] - rc*.35, cabeza[1] + rc*.05, Math.max(.8, rc*.12), 0, Math.PI*2); c.arc(cabeza[0] + rc*.35, cabeza[1] + rc*.05, Math.max(.8, rc*.12), 0, Math.PI*2); c.fill(); }
  c.fillStyle = oscurecer(j.color, .2); c.beginPath(); c.arc(cabeza[0], cabeza[1] - rc*.2, rc*1.03, Math.PI*1.02, Math.PI*1.98); c.fill();
  if(j.etiqueta){ c.fillStyle = j.yo ? '#DCF54A' : '#F4F6F8'; c.font = `900 ${Math.max(11, s*.4)}px Inter, system-ui, sans-serif`; c.textAlign = 'center'; c.fillText(j.etiqueta, cabeza[0], cabeza[1] - rc - 5); }
}

function dibujarRed(c) {
  poli(c, [
    [-0.1, RED_Y, 0],
    [W + 0.1, RED_Y, 0],
    [W + 0.1, RED_Y, RED_ALT],
    [-0.1, RED_Y, RED_ALT],
  ]);
  c.fillStyle = 'rgba(8,14,20,.42)';
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.13)';
  c.lineWidth = 1;
  for (let x = 0.3; x < W; x += 0.3) lineaP(c, [x, RED_Y, 0], [x, RED_Y, RED_ALT]);
  for (let z = 0.18; z < RED_ALT; z += 0.18) lineaP(c, [0, RED_Y, z], [W, RED_Y, z]);
  const s = proy(W / 2, RED_Y, RED_ALT)[2];
  c.strokeStyle = '#F2F6F8';
  c.lineWidth = Math.max(2, s * 0.07);
  lineaP(c, [0, RED_Y, RED_ALT], [W, RED_Y, RED_ALT]);
  c.strokeStyle = '#27343A';
  c.lineWidth = Math.max(3, s * 0.11);
  lineaP(c, [-0.12, RED_Y, 0], [-0.12, RED_Y, RED_ALT + 0.06]);
  lineaP(c, [W + 0.12, RED_Y, 0], [W + 0.12, RED_Y, RED_ALT + 0.06]);
}
function dibujarCristalCercano(c) {
  if (VISTA !== 'tv') return;
  poli(c, [
    [0, L, 0],
    [W, L, 0],
    [W, L, PARED],
    [0, L, PARED],
  ]);
  c.fillStyle = 'rgba(160,215,255,.045)';
  c.fill();
  c.strokeStyle = 'rgba(200,235,255,.42)';
  c.lineWidth = 2;
  c.stroke();
}
const RASTRO = [];
function dibujarBola(c, b) {
  if (b.cae) anilloSuelo(c, b.cae.x, b.cae.y, 0.42, 'rgba(220,245,74,.5)', 2);
  const sb = proy(b.x, b.y, 0);
  c.fillStyle = `rgba(0,0,0,${clamp(0.4 - b.z * 0.08, 0.08, 0.4)})`;
  c.beginPath();
  c.ellipse(sb[0], sb[1], Math.max(3, sb[2] * 0.14), Math.max(2, sb[2] * 0.14 * (VISTA === 'tv' ? 0.45 : 0.6)), 0, 0, Math.PI * 2);
  c.fill();
  RASTRO.forEach((p, i) => {
    const q = proy(p.x, p.y, p.z);
    c.fillStyle = `rgba(220,245,74,${(i / RASTRO.length) * 0.28})`;
    c.beginPath();
    c.arc(q[0], q[1], Math.max(2, q[2] * 0.09), 0, Math.PI * 2);
    c.fill();
  });
  const q = proy(b.x, b.y, b.z);
  const r = Math.max(4, q[2] * 0.15);
  const gr = c.createRadialGradient(q[0] - r * 0.35, q[1] - r * 0.35, r * 0.1, q[0], q[1], r);
  gr.addColorStop(0, '#FBFFD0');
  gr.addColorStop(0.55, b.porTres ? '#FFE27A' : '#DCF54A');
  gr.addColorStop(1, b.porTres ? '#C9A12E' : '#8FA82A');
  c.fillStyle = gr;
  c.beginPath();
  c.arc(q[0], q[1], r, 0, Math.PI * 2);
  c.fill();
}
function dibujarApunte(c, a, yo) {
  const tx = a.tx != null ? a.tx : yo.x < W / 2 ? 7.2 : 2.8;
  const ty = RED_Y - (a.prof > 0 ? 8.4 : a.prof < 0 ? 2.8 : 6);
  anilloSuelo(c, tx, ty, 0.55, 'rgba(244,246,248,.75)', 2);
  anilloSuelo(c, tx, ty, 0.16, 'rgba(244,246,248,.95)', 2);
}
/* el videomarcador: la pantalla del fondo alterna el logo y el resultado */
function ledMarcador(c) {
  if (VISTA !== 'tv' || ESCENA.tipo === 'club' || !VIS.marcador || Math.floor(VIS.t / 4) % 2 === 0) return;
  const a = proy(-0.5, -0.05, ALT_FONDO + 0.12);
  const b = proy(W + 0.5, -0.05, ALT_FONDO + 0.9);
  const q = proy(W / 2, -0.05, ALT_FONDO + 0.5);
  c.fillStyle = '#081B33';
  c.fillRect(a[0] + 1, b[1] + 1, b[0] - a[0] - 2, a[1] - b[1] - 2);
  const M = VIS.marcador;
  const pts = M.tb ? M.puntos.join('-') : `${NOM_PUNTO[Math.min(M.puntos[0], 3)]}-${NOM_PUNTO[Math.min(M.puntos[1], 3)]}`;
  const txt = `${M.equipos[0]}   ${M.juegos[0]}-${M.juegos[1]}   ${pts}   ${M.equipos[1]}`;
  let tam = Math.max(8, q[2] * 0.4);
  c.font = `900 ${tam}px Inter, system-ui, sans-serif`;
  while (tam > 6 && c.measureText(txt).width > (b[0] - a[0]) * 0.94) {
    tam -= 0.5;
    c.font = `900 ${tam}px Inter, system-ui, sans-serif`;
  }
  c.fillStyle = '#FFE27A';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(txt, q[0], q[1]);
  c.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------- efectos (en coordenadas de la vista)
export const Efectos = {
  particulas: [],
  shake: 0,
  reset() {
    this.particulas = [];
    this.shake = 0;
    RASTRO.length = 0;
  },
  golpe(x, y, z, tipo, cal) {
    const fuerte = tipo === 'remate' || tipo === 'vibora' || tipo === 'plano';
    const n = fuerte ? 16 : 6;
    for (let i = 0; i < n; i++) this.particulas.push({ x, y, z, vx: rnd(-2.5, 2.5), vy: rnd(-2.5, 2.5), vida: 0.35, max: 0.35, color: fuerte ? '#F5C542' : '#DCF54A' });
    this.particulas.push({ x, y, z, pared: true, anillo: true, vida: 0.25, max: 0.25, r0: 0.15, r1: fuerte ? 1.1 : 0.6, color: fuerte ? '#F5C542' : 'rgba(255,255,255,.7)' });
    if (fuerte) this.sacudir(6);
    void cal;
  },
  bote(x, y) {
    this.particulas.push({ x, y, anillo: true, vida: 0.3, max: 0.3, r0: 0.1, r1: 0.6, color: 'rgba(255,255,255,.55)' });
  },
  cristal(x, y, z) {
    this.particulas.push({ x, y, z: z == null ? 1 : z, pared: true, anillo: true, vida: 0.4, max: 0.4, r0: 0.15, r1: 0.8, color: '#7FD3F7' });
    this.sacudir(2);
  },
  reja(x, y, z) {
    this.particulas.push({ x, y, z: z == null ? 1 : z, pared: true, anillo: true, vida: 0.35, max: 0.35, r0: 0.1, r1: 0.55, color: '#C9D3DC' });
    this.sacudir(1);
  },
  sacudir(m) {
    this.shake = Math.max(this.shake, m);
  },
  confeti(abajo) {
    for (let i = 0; i < 40; i++) this.particulas.push({ x: rnd(1, 9), y: abajo ? rnd(11, 19) : rnd(1, 9), z: rnd(0.8, 2.2), vx: rnd(-1.5, 1.5), vy: rnd(-3, -0.5), vida: rnd(0.7, 1.2), max: 1.2, color: pick(['#DCF54A', '#22D3A5', '#F5C542', '#7FD3F7']) });
  },
  texto(x, y, t, color) {
    this.particulas.push({ x, y, texto: t, vida: 0.85, max: 0.85, color });
  },
  actualizar(dt) {
    for (const p of this.particulas) {
      p.vida -= dt;
      if (!p.anillo && !p.texto) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    this.particulas = this.particulas.filter((p) => p.vida > 0);
    this.shake *= Math.pow(0.02, dt);
  },
};

/**
 * Dibuja un cuadro. vista: { t, estado, fiesta, ganador (equipo de la vista), bola: { x, y, z, porTres, cae },
 * jug: [{ x, y, vx, vy, lado (0 = el de abajo), equipo, anim, swing, ultimoTiro, color, colorPala, zurdo, … }],
 * apunte, yo, marcador }
 */
export function dibujar(vista) {
  if (!CX) return;
  VIS = vista;
  const c = CX;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!FONDO) pintarFondo();
  c.drawImage(FONDO, 0, 0, VW, VH);
  publicoAnimado(c);
  ledMarcador(c);
  if (vista.apunte && vista.yo && vista.estado === 'juego') dibujarApunte(c, vista.apunte, vista.yo);
  const b = vista.bola;
  if (vista.estado === 'juego' || vista.estado === 'saque') {
    RASTRO.push({ x: b.x, y: b.y, z: b.z });
    if (RASTRO.length > 9) RASTRO.shift();
  } else RASTRO.length = 0;
  c.save();
  const s = Efectos.shake;
  if (s > 0.3) c.translate(rnd(-s, s) * 0.7, rnd(-s, s) * 0.7);
  /* de lejos a cerca: lo que está detrás de la red, la red y lo de delante */
  const cosas = vista.jug
    .map((j) => ({ y: j.y, pinta: () => dibujarFigura(c, j) }))
    .concat([{ y: b.y + 0.01, pinta: () => dibujarBola(c, b) }])
    .sort((p, q) => p.y - q.y);
  for (const o of cosas) if (o.y < RED_Y) o.pinta();
  dibujarRed(c);
  for (const o of cosas) if (o.y >= RED_Y) o.pinta();
  dibujarCristalCercano(c);
  for (const p of Efectos.particulas) {
    const a = p.vida / p.max;
    c.globalAlpha = a;
    if (p.texto) {
      const q = proy(p.x, p.y, 2.2);
      c.fillStyle = p.color;
      c.font = `900 ${Math.max(13, q[2] * 0.55)}px Inter, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.fillText(p.texto, q[0], q[1] - (1 - a) * 24);
      continue;
    }
    if (p.anillo) {
      if (p.pared) {
        const q = proy(p.x, p.y, p.z);
        c.strokeStyle = p.color;
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(q[0], q[1], (p.r0 + (p.r1 - p.r0) * (1 - a)) * q[2], 0, Math.PI * 2);
        c.stroke();
      } else anilloSuelo(c, p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - a), p.color, 2.5);
    } else {
      const q = proy(p.x, p.y, p.z != null ? p.z : 0.6);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(q[0], q[1], Math.max(1.5, q[2] * 0.07), 0, Math.PI * 2);
      c.fill();
    }
  }
  c.globalAlpha = 1;
  c.restore();
}
/** Solo la pista vacía (para el menú). */
export function dibujarVacia(t) {
  dibujar({ t, estado: 'menu', fiesta: 0.3 + 0.3 * Math.sin(t / 3), bola: { x: -50, y: -50, z: 0 }, jug: [] });
}
