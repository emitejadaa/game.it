/**
 * El local: paredes, piso, mesas, mostrador y cada decoración que se puede comprar o ganar, con los
 * colores que elijas. También los fondos de las estaciones de la cocina. Lienzo lógico de 1280 × 720.
 *
 * Lo que no se mueve (pared, piso, alfombra, fondos de la cocina) se dibuja una vez con sus texturas
 * en un lienzo aparte y después se copia: así el juego anda fluido aunque haya mucho detalle.
 */
import { C, EXIGENTES, JULAY, COLORES_LOCAL } from './data.js';
import { TAU, tono, alfa, azar, mix } from './color.js';
import { dona, donaIdeal } from './art.js';
import { retrato } from './personas.js';

export const W = 1280;
export const H = 720;
export const PISO = 470;

/** Dónde se para cada uno en el mostrador (los pies). */
export const LUGARES = {
  // en el umbral de la puerta (al fondo): de ahí entran y por ahí se van
  puerta: { x: 58, y: 506 },
  caja: { x: 712, y: 636 },
  // donde se para a buscar su pedido (al lado de la caja)
  retiro: { x: 814, y: 640 },
  fila: [
    { x: 604, y: 640 },
    { x: 496, y: 643 },
    { x: 388, y: 646 },
  ],
  // sentados a las mesas (los pies quedan atrás de la mesa)
  asientos: [
    { x: 150, y: 548, mesa: 0 },
    { x: 262, y: 548, mesa: 0 },
    { x: 392, y: 548, mesa: 1 },
    { x: 504, y: 548, mesa: 1 },
    { x: 610, y: 538, mesa: -1 },
    { x: 330, y: 536, mesa: -1 },
  ],
  empleado: { x: 1040, y: 528 },
  mesas: [206, 448],
};

/** Idioma de los carteles dibujados (lo pone el juego según las preferencias del portal). */
let idioma = 'es';
export function ponerIdioma(l) {
  idioma = l === 'en' ? 'en' : 'es';
}
export const T = (es, en) => (idioma === 'en' ? en : es);

/** La decoración de una partida, con sus colores. */
export const decoDe = (save) => ({ ...save.deco, colores: save.colores || {} });

/** El color elegido para una parte del local (o el de fábrica). */
export function colorLocal(deco, id) {
  return deco?.colores?.[id] || COLORES_LOCAL.find((c) => c.id === id).base;
}

const lin = (ctx, w = 3, c = C.tinta) => {
  ctx.lineWidth = w;
  ctx.strokeStyle = c;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
};

// ------------------------------------------------------------------ texturas y capas guardadas

/** Grano suave (puntitos claros y oscuros) para que las superficies no se vean de plástico. */
let granoCanvas = null;
function grano() {
  if (granoCanvas) return granoCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d');
  const R = azar(77);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(42,29,21,.07)' : 'rgba(255,250,242,.08)';
    const s = 0.8 + R() * 1.6;
    g.fillRect(R() * 192, R() * 192, s, s);
  }
  granoCanvas = c;
  return c;
}

function conGrano(ctx, x, y, w, h, fuerza = 1) {
  ctx.save();
  ctx.globalAlpha = fuerza;
  ctx.fillStyle = ctx.createPattern(grano(), 'repeat');
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** Vetas de madera en un rectángulo (horizontales o verticales). */
function vetas(ctx, x, y, w, h, color, semilla = 1, vertical = false) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = alfa(tono(color, -0.35), 0.28);
  ctx.lineWidth = 1.4;
  const R = azar(semilla);
  const largo = vertical ? h : w;
  const ancho = vertical ? w : h;
  for (let k = 4; k < ancho; k += 7 + R() * 6) {
    ctx.beginPath();
    for (let s = 0; s <= largo; s += 24) {
      const off = Math.sin(s / (40 + R() * 30) + k) * 2.2;
      const px = vertical ? x + k + off : x + s;
      const py = vertical ? y + s : y + k + off;
      s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    if (R() < 0.25) {
      // un nudito
      const nx = vertical ? x + k : x + R() * w;
      const ny = vertical ? y + R() * h : y + k;
      ctx.beginPath();
      ctx.ellipse(nx, ny, vertical ? 2.5 : 6, vertical ? 6 : 2.5, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Capas guardadas: se dibujan una vez por clave y por escala, y después solo se copian. */
const capas = new Map();
function capaRect(ctx, clave, x, y, w, h, dibujar) {
  const m = ctx.getTransform();
  const k = Math.max(0.2, Math.hypot(m.a, m.b));
  const id = clave + '@' + k.toFixed(3);
  let c = capas.get(id);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * k));
    c.height = Math.max(1, Math.ceil(h * k));
    const g = c.getContext('2d');
    g.scale(k, k);
    g.translate(-x, -y);
    dibujar(g);
    capas.set(id, c);
    if (capas.size > 40) capas.delete(capas.keys().next().value);
  }
  ctx.drawImage(c, x, y, w, h);
}
const capa = (ctx, clave, dibujar) => capaRect(ctx, clave, 0, 0, W, H, dibujar);

// ------------------------------------------------------------------ paredes y piso

function pared(ctx, id, base, y0 = 0, y1 = PISO) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y0, W, y1 - y0);
  ctx.clip();
  const osc = tono(base, -0.12);
  ctx.fillStyle = base;
  ctx.fillRect(0, y0, W, y1 - y0);
  if (id === 'pared-rayas') {
    ctx.fillStyle = mix(base, C.terracota, 0.28);
    for (let x = 0; x < W; x += 64) ctx.fillRect(x, y0, 32, y1 - y0);
    ctx.fillStyle = alfa(C.tinta, 0.06);
    for (let x = 0; x < W; x += 64) ctx.fillRect(x + 30, y0, 2, y1 - y0);
  } else if (id === 'pared-lunares') {
    ctx.fillStyle = mix(base, C.madera, 0.35);
    for (let y = y0 + 20, f = 0; y < y1; y += 44, f++)
      for (let x = (f % 2) * 28 + 14; x < W; x += 56) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, TAU);
        ctx.fill();
      }
  } else if (id === 'pared-azulejos') {
    const R = azar(3);
    for (let y = y0, f = 0; y < y1; y += 48, f++)
      for (let x = 0; x < W; x += 48) {
        ctx.fillStyle = tono(base, (R() - 0.5) * 0.06);
        ctx.fillRect(x + 1, y + 1, 46, 46);
      }
    ctx.strokeStyle = osc;
    ctx.lineWidth = 2;
    for (let y = y0; y < y1; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let x = 0; x < W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    ctx.fillStyle = alfa(C.petroleo, 0.42);
    for (let y = y0 + 24, f = 0; y < y1; y += 48, f++)
      for (let x = 24 + (f % 2) * 48; x < W; x += 96) {
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 8, y);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x - 8, y);
        ctx.closePath();
        ctx.fill();
      }
  } else if (id === 'pared-ladrillo') {
    const R = azar(5);
    for (let y = y0, f = 0; y < y1; y += 30, f++)
      for (let x = (f % 2) * -32; x < W; x += 64) {
        ctx.fillStyle = mix('#c99274', tono('#c99274', -0.2), R() * 0.6);
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, 58, 24, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,250,242,.12)';
        ctx.fillRect(x + 5, y + 5, 54, 4);
      }
  } else if (id === 'pared-madera') {
    const col = mix(base, C.madera3, 0.75);
    for (let x = 0, i = 0; x < W; x += 58, i++) {
      ctx.fillStyle = tono(col, ((i * 37) % 7) / 100 - 0.03);
      ctx.fillRect(x, y0, 58, y1 - y0);
      vetas(ctx, x, y0, 58, y1 - y0, col, i + 1, true);
      ctx.fillStyle = alfa(C.tinta, 0.18);
      ctx.fillRect(x + 56, y0, 2, y1 - y0);
    }
  } else if (id === 'pared-flores') {
    ctx.fillStyle = osc;
    for (let x = 0; x < W; x += 80) ctx.fillRect(x + 39, y0, 2, y1 - y0);
    const cols = [C.rosa, C.mostaza, C.terracota];
    for (let y = y0 + 26, f = 0; y < y1; y += 52, f++)
      for (let x = (f % 2) * 40 + 20; x < W; x += 80) {
        ctx.fillStyle = alfa(C.oliva, 0.5);
        ctx.beginPath();
        ctx.ellipse(x - 9, y + 8, 7, 3, -0.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = alfa(cols[(f + x) % 3], 0.7);
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.arc(x + Math.cos((k / 5) * TAU) * 5, y + Math.sin((k / 5) * TAU) * 5, 4, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = alfa(C.mostaza2, 0.9);
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, TAU);
        ctx.fill();
      }
  }
  conGrano(ctx, 0, y0, W, y1 - y0, 0.9);
  // luz cálida desde arriba: el techo un poco más oscuro
  const gr = ctx.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, 'rgba(59,42,32,.14)');
  gr.addColorStop(0.35, 'rgba(59,42,32,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, y0, W, y1 - y0);
  ctx.restore();
}

function piso(ctx, id, y0 = PISO, y1 = H) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y0, W, y1 - y0);
  ctx.clip();
  const R = azar(11);
  if (id === 'piso-madera') {
    ctx.fillStyle = '#b88a5e';
    ctx.fillRect(0, y0, W, y1 - y0);
    for (let y = y0, f = 0; y < y1; y += 26, f++)
      for (let x = (f % 3) * -70; x < W; x += 210) {
        const col = tono('#b88a5e', (R() - 0.5) * 0.12);
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 210, 26);
        vetas(ctx, x, y, 210, 26, col, f * 13 + x);
        ctx.fillStyle = alfa('#7a5034', 0.5);
        ctx.fillRect(x, y, 2, 26);
        ctx.fillRect(x, y + 24, 210, 2);
      }
  } else if (id === 'piso-calcareo') {
    ctx.fillStyle = '#ecdfc8';
    ctx.fillRect(0, y0, W, y1 - y0);
    for (let y = y0, f = 0; y < y1; y += 46, f++)
      for (let x = 0; x < W; x += 64) {
        ctx.fillStyle = tono('#ecdfc8', (R() - 0.5) * 0.05);
        ctx.fillRect(x, y, 64, 46);
        ctx.strokeStyle = '#d5c4a8';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, 64, 46);
        ctx.fillStyle = alfa(C.terracota, 0.55);
        ctx.beginPath();
        ctx.ellipse(x + 32, y + 23, 14, 9, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = alfa(C.oliva, 0.6);
        for (const [dx, dy] of [[0, 0], [64, 0], [0, 46], [64, 46]]) {
          ctx.beginPath();
          ctx.ellipse(x + dx, y + dy, 9, 6, 0, 0, TAU);
          ctx.fill();
        }
      }
  } else if (id === 'piso-ajedrez') {
    for (let y = y0, f = 0; y < y1; y += 52, f++)
      for (let x = 0, c = 0; x < W; x += 72, c++) {
        ctx.fillStyle = tono((f + c) % 2 ? '#e9dcc4' : '#6f5848', (R() - 0.5) * 0.06);
        ctx.fillRect(x, y, 72, 52);
      }
  } else if (id === 'piso-hexagonos') {
    ctx.fillStyle = '#d9cbb4';
    ctx.fillRect(0, y0, W, y1 - y0);
    const r = 20;
    const hw = r * Math.sqrt(3);
    for (let y = y0, f = 0; y < y1 + r; y += r * 1.5, f++)
      for (let x = (f % 2) * (hw / 2); x < W + hw; x += hw) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * TAU) / 6;
          k ? ctx.lineTo(x + Math.cos(a) * (r - 1.5), y + Math.sin(a) * (r - 1.5) * 0.8) : ctx.moveTo(x + Math.cos(a) * (r - 1.5), y + Math.sin(a) * (r - 1.5) * 0.8);
        }
        ctx.closePath();
        const v = R();
        ctx.fillStyle = v < 0.12 ? '#c9a184' : v < 0.2 ? '#9fae90' : tono('#f0e6d4', (R() - 0.5) * 0.05);
        ctx.fill();
      }
  } else {
    // damero
    ctx.fillStyle = '#e6d6bb';
    ctx.fillRect(0, y0, W, y1 - y0);
    for (let y = y0, f = 0; y < y1; y += 32, f++)
      for (let x = (f % 2) * 56; x < W; x += 112) {
        ctx.fillStyle = tono('#c4a184', (R() - 0.5) * 0.08);
        ctx.fillRect(x, y, 56, 32);
        ctx.fillStyle = tono('#e6d6bb', (R() - 0.5) * 0.05);
        ctx.fillRect(x + 56, y, 56, 32);
      }
    ctx.fillStyle = 'rgba(59,42,32,.08)';
    for (let y = y0; y < y1; y += 32) ctx.fillRect(0, y, W, 1.5);
  }
  conGrano(ctx, 0, y0, W, y1 - y0, 0.8);
  // sombra del zócalo y un poco más de luz cerca de la vidriera
  const gr = ctx.createLinearGradient(0, y0, 0, y0 + 90);
  gr.addColorStop(0, 'rgba(59,42,32,.22)');
  gr.addColorStop(1, 'rgba(59,42,32,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, y0, W, 90);
  ctx.restore();
}

function alfombra(ctx, id) {
  if (!id) return;
  const x = 330;
  const y = 602;
  ctx.save();
  lin(ctx, 3);
  if (id === 'alfombra-redonda') {
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = [C.terracota, C.mostaza, C.oliva, C.rosa, C.crema][k];
      ctx.beginPath();
      ctx.ellipse(x, y, 230 - k * 40, 62 - k * 11, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = k ? 1.5 : 3;
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = alfa(C.tinta, 0.25);
    for (let a = 0; a < TAU; a += 0.12) {
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 200, y + Math.sin(a) * 52);
      ctx.lineTo(x + Math.cos(a) * 226, y + Math.sin(a) * 60);
      ctx.stroke();
    }
  } else {
    const rayas = id === 'alfombra-rayas';
    ctx.fillStyle = rayas ? C.crema : C.terracota2;
    ctx.beginPath();
    ctx.roundRect(x - 250, y - 46, 500, 92, 8);
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (rayas) {
      const cols = [C.petroleo, C.mostaza, C.terracota];
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = cols[i % 3];
        ctx.fillRect(x - 250 + 14 + i * 40, y - 46, 14, 92);
      }
    } else {
      ctx.strokeStyle = alfa(C.mostaza2, 0.8);
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 236, y - 34, 472, 68);
      ctx.fillStyle = alfa(C.mostaza2, 0.75);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 80, y - 16);
        ctx.lineTo(x + i * 80 + 16, y);
        ctx.lineTo(x + i * 80, y + 16);
        ctx.lineTo(x + i * 80 - 16, y);
        ctx.closePath();
        ctx.fill();
      }
    }
    conGrano(ctx, x - 250, y - 46, 500, 92, 1);
    ctx.restore();
    lin(ctx, 3);
    ctx.stroke();
    // flecos
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 50; i++) {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + sx * 250, y - 42 + i * 1.68);
        ctx.lineTo(x + sx * 260, y - 42 + i * 1.68);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Pared, zócalo, piso y alfombra (lo que no se mueve), con texturas. Va guardado en una capa. */
function fondoSalon(ctx, deco) {
  const base = colorLocal(deco, 'pared');
  const clave = ['salon', deco.pared, deco.piso, deco.alfombra, base].join('|');
  capa(ctx, clave, (g) => {
    pared(g, deco.pared, base);
    // zócalo de madera con paneles
    g.fillStyle = C.madera3;
    g.fillRect(0, PISO - 54, W, 54);
    vetas(g, 0, PISO - 54, W, 54, C.madera3, 21);
    for (let x = 20; x < W; x += 90) {
      g.fillStyle = tono(C.madera3, -0.12);
      g.beginPath();
      g.roundRect(x, PISO - 46, 60, 38, 4);
      g.fill();
      g.strokeStyle = alfa(C.tinta, 0.35);
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = 'rgba(255,250,242,.12)';
      g.fillRect(x + 3, PISO - 44, 54, 3);
    }
    lin(g, 3);
    g.fillStyle = C.madera;
    g.fillRect(0, PISO - 60, W, 8);
    g.beginPath();
    g.moveTo(0, PISO - 60);
    g.lineTo(W, PISO - 60);
    g.moveTo(0, PISO - 52);
    g.lineTo(W, PISO - 52);
    g.stroke();
    piso(g, deco.piso);
    lin(g, 3);
    g.beginPath();
    g.moveTo(0, PISO);
    g.lineTo(W, PISO);
    g.stroke();
    alfombra(g, deco.alfombra);
  });
}

// ------------------------------------------------------------------ fondo del salón

/**
 * Pared, ventana, puerta, cartel, cuadros y piso. t = tiempo (para lo que se mueve).
 * o.campana: cuánto suena la campanita (0..1). o.puerta: cuánto está abierta (0..1).
 */
export function salon(ctx, deco, t, o = {}) {
  fondoSalon(ctx, deco);
  ventana(ctx, deco, 110, 172, 220, 160, t);
  puerta(ctx, 10, 214, 96, PISO - 214, o.campana, o.puerta || 0, colorLocal(deco, 'puerta'), t);
  cartel(ctx, 1040, 168, o.cartel, colorLocal(deco, 'cartel'));
  estanteria(ctx, 860, 214, 380, 190);
  techo(ctx, deco.techo, t);
  cuadro(ctx, deco.cuadro, 405, 240, t);
  estante(ctx, deco.estante, 572, 230, t);
  if (o.turnos) turnos(ctx, 790, 222, o.turnos);
}

/** Cartel de turnos (mejora de la cocina): muestra el número del que está pidiendo. */
function turnos(ctx, x, y, n) {
  ctx.save();
  lin(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 60);
  ctx.lineTo(x - 26, y - 22);
  ctx.moveTo(x + 20, y - 60);
  ctx.lineTo(x + 26, y - 22);
  ctx.stroke();
  lin(ctx, 3);
  ctx.fillStyle = C.tinta;
  ctx.beginPath();
  ctx.roundRect(x - 40, y - 24, 80, 52, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.mostaza2;
  ctx.font = '700 11px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(T('TURNO', 'NOW SERVING'), x, y - 12, 72);
  ctx.font = '700 24px Fredoka, sans-serif';
  ctx.fillText(String(n % 100).padStart(2, '0'), x, y + 10);
  ctx.restore();
}

function nube(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 12 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + 14 * s, y - 10 * s, 14 * s, Math.PI, 0);
  ctx.arc(x + 32 * s, y - 4 * s, 11 * s, Math.PI * 1.2, Math.PI * 0.5);
  ctx.closePath();
  ctx.fill();
}

function ventana(ctx, deco, x, y, w, h, t) {
  const toldo = colorLocal(deco, 'toldo');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const cielo = ctx.createLinearGradient(0, y, 0, y + h);
  cielo.addColorStop(0, '#bcd3dc');
  cielo.addColorStop(1, '#dde8e6');
  ctx.fillStyle = cielo;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#f4ead8';
  ctx.beginPath();
  ctx.arc(x + w * 0.78, y + 34, 18, 0, TAU);
  ctx.fill();
  // nubes que pasan despacio
  ctx.fillStyle = 'rgba(251,245,234,.9)';
  for (let i = 0; i < 2; i++) nube(ctx, x - 60 + ((t * (6 + i * 3) + i * 140) % (w + 120)), y + 30 + i * 22, 0.8 + i * 0.2);
  // casitas del barrio
  const casas = [[0, 70, '#c99274'], [46, 52, '#d4a017'], [88, 80, '#9aa88a'], [140, 60, '#c47a8a'], [182, 74, '#b88a5e']];
  for (const [dx, hh, col] of casas) {
    ctx.fillStyle = col;
    ctx.fillRect(x + dx, y + h - hh, 44, hh);
    ctx.fillStyle = alfa(tono(col, -0.25), 0.6);
    ctx.fillRect(x + dx + 38, y + h - hh, 6, hh);
    ctx.fillStyle = alfa('#fbf5ea', 0.7);
    for (let i = 0; i < 2; i++) ctx.fillRect(x + dx + 8 + i * 18, y + h - hh + 12, 10, 12);
  }
  // un pajarito que pasa
  const px = x + ((t * 30) % (w + 60)) - 30;
  const aleteo = Math.sin(t * 10) * 3;
  lin(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(px - 6, y + 50);
  ctx.quadraticCurveTo(px - 3, y + 45 + aleteo, px, y + 50);
  ctx.quadraticCurveTo(px + 3, y + 45 + aleteo, px + 6, y + 50);
  ctx.stroke();
  // letras pintadas en el vidrio
  if (deco.ventana === 'letras') {
    ctx.fillStyle = alfa('#fbf5ea', 0.9);
    ctx.strokeStyle = alfa(toldo, 0.9);
    ctx.lineWidth = 3;
    ctx.font = '700 30px Fredoka, "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(T('DONAS', 'DONUTS'), x + w / 2, y + h / 2 - 6);
    ctx.fillText(T('DONAS', 'DONUTS'), x + w / 2, y + h / 2 - 6);
    ctx.font = '600 13px Fredoka, "Trebuchet MS", sans-serif';
    ctx.fillText(T('— recién hechas —', '— freshly made —'), x + w / 2, y + h / 2 + 20);
  }
  // reflejo del vidrio (dos franjas suaves)
  ctx.fillStyle = 'rgba(255,250,242,.16)';
  ctx.beginPath();
  ctx.moveTo(x + 30, y + h);
  ctx.lineTo(x + 80, y);
  ctx.lineTo(x + 100, y);
  ctx.lineTo(x + 50, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  lin(ctx, 8, C.madera2);
  ctx.strokeRect(x, y, w, h);
  lin(ctx, 2, C.tinta);
  ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  lin(ctx, 4, C.madera2);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.stroke();
  // cortinas
  if (deco.ventana === 'cortinas') {
    const sw = Math.sin(t * 0.8) * 2;
    for (const sx of [-1, 1]) {
      const bx = sx < 0 ? x - 6 : x + w + 6;
      ctx.fillStyle = C.rosa2;
      ctx.beginPath();
      ctx.moveTo(bx, y - 10);
      ctx.lineTo(bx - sx * 52, y - 10);
      ctx.quadraticCurveTo(bx - sx * (30 + sw), y + h * 0.45, bx - sx * 14, y + h * 0.6);
      ctx.quadraticCurveTo(bx - sx * 26, y + h * 0.8, bx - sx * 30, y + h + 10);
      ctx.lineTo(bx, y + h + 10);
      ctx.closePath();
      ctx.fill();
      lin(ctx, 3);
      ctx.stroke();
      ctx.strokeStyle = alfa(C.tinta, 0.25);
      ctx.lineWidth = 1.5;
      for (const k of [0.3, 0.6]) {
        ctx.beginPath();
        ctx.moveTo(bx - sx * 52 * k, y - 6);
        ctx.quadraticCurveTo(bx - sx * 40 * k, y + h * 0.4, bx - sx * 12, y + h * 0.58);
        ctx.stroke();
      }
      ctx.fillStyle = C.mostaza;
      ctx.beginPath();
      ctx.roundRect(bx - sx * 18 - 8, y + h * 0.56, 16, 10, 4);
      ctx.fill();
      lin(ctx, 2);
      ctx.stroke();
    }
    lin(ctx, 5, C.madera2);
    ctx.beginPath();
    ctx.moveTo(x - 64, y - 12);
    ctx.lineTo(x + w + 64, y - 12);
    ctx.stroke();
  }
  // toldito
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i % 2 ? C.crema : toldo;
    ctx.beginPath();
    const bx = x - 8 + i * ((w + 16) / 7);
    const bw = (w + 16) / 7;
    ctx.moveTo(bx, y - 16);
    ctx.lineTo(bx + bw, y - 16);
    ctx.lineTo(bx + bw, y + 6);
    ctx.quadraticCurveTo(bx + bw / 2, y + 16, bx, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(59,42,32,.15)';
  ctx.fillRect(x - 8, y - 2, w + 16, 4);
  lin(ctx, 3);
  ctx.strokeRect(x - 8, y - 16, w + 16, 22);
  // macetero con flores
  if (deco.ventana === 'macetero') {
    const my = y + h + 6;
    ctx.fillStyle = C.terracota;
    ctx.beginPath();
    ctx.moveTo(x - 6, my);
    ctx.lineTo(x + w + 6, my);
    ctx.lineTo(x + w - 4, my + 30);
    ctx.lineTo(x + 4, my + 30);
    ctx.closePath();
    ctx.fill();
    lin(ctx, 3);
    ctx.stroke();
    const cols = [C.rosa, C.mostaza, C.crema, C.terracota2, C.ciruela2];
    for (let i = 0; i < 9; i++) {
      const fx = x + 12 + i * 25;
      const fy = my - 8 - (i % 3) * 7 + Math.sin(t * 1.5 + i) * 1.2;
      ctx.fillStyle = C.oliva;
      ctx.beginPath();
      ctx.ellipse(fx - 5, fy + 8, 7, 3.5, -0.6, 0, TAU);
      ctx.ellipse(fx + 6, fy + 10, 7, 3.5, 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = cols[i % cols.length];
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(fx + Math.cos((k / 5) * TAU) * 5, fy + Math.sin((k / 5) * TAU) * 5, 4.4, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = C.mostaza2;
      ctx.beginPath();
      ctx.arc(fx, fy, 2.6, 0, TAU);
      ctx.fill();
    }
  }
}

/** La puerta: abierta deja ver la vereda; la campanita se mueve cuando entra alguien. */
function puerta(ctx, x, y, w, h, campana, abierta, color, t) {
  if (!campana && abierta < 0.005) {
    capaRect(ctx, 'puerta|' + color + '|' + idioma, x - 14, y - 12, w + 28, h + 24, (g) => puertaViva(g, x, y, w, h, 0, 0, color));
    return;
  }
  puertaViva(ctx, x, y, w, h, campana, abierta, color);
}

function puertaViva(ctx, x, y, w, h, campana, abierta, color) {
  // marco y lo que se ve afuera
  ctx.save();
  ctx.fillStyle = '#cfe0e6';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d6cbbb';
  ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
  ctx.fillStyle = '#b88a5e';
  ctx.fillRect(x + 8, y + h * 0.3, 30, h * 0.42);
  ctx.fillStyle = '#9aa88a';
  ctx.fillRect(x + 44, y + h * 0.4, 40, h * 0.32);
  ctx.restore();
  // la hoja de la puerta: se abre hacia adentro (se angosta desde la bisagra izquierda)
  const k = 1 - 0.78 * abierta;
  const pw = w * k;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + pw, y - 6 * abierta);
  ctx.lineTo(x + pw, y + h + 6 * abierta);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  vetas(ctx, x, y - 8, pw, h + 16, color, 7, true);
  ctx.fillStyle = `rgba(59,42,32,${0.1 + abierta * 0.2})`;
  ctx.fillRect(x, y - 8, pw, h + 16);
  ctx.restore();
  lin(ctx, 3);
  ctx.stroke();
  if (abierta < 0.6) {
    // vidrio, cartelito y picaporte (achicados con la perspectiva)
    ctx.fillStyle = '#cfe0e6';
    ctx.fillRect(x + 14 * k, y + 16, (w - 28) * k, h * 0.42);
    ctx.strokeRect(x + 14 * k, y + 16, (w - 28) * k, h * 0.42);
    ctx.fillStyle = 'rgba(255,250,242,.3)';
    ctx.fillRect(x + 20 * k, y + 22, 8 * k, h * 0.38);
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.arc(x + (w - 16) * k, y + h * 0.6, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.crema;
    ctx.beginPath();
    ctx.roundRect(x + 16 * k, y + h * 0.48, (w - 32) * k, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.oliva;
    ctx.font = '700 12px Fredoka, "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(T('ABIERTO', 'OPEN'), x + (w / 2) * k, y + h * 0.48 + 11, (w - 36) * k);
  }
  ctx.restore();
  lin(ctx, 4, C.madera2);
  ctx.strokeRect(x, y, w, h);
  // campanita de la puerta
  ctx.save();
  ctx.translate(x + w / 2, y - 2);
  ctx.rotate(campana ? Math.sin(campana * 30) * 0.45 * campana : 0);
  lin(ctx, 3);
  ctx.fillStyle = C.mostaza;
  ctx.beginPath();
  ctx.moveTo(-9, 18);
  ctx.quadraticCurveTo(-9, 2, 0, 2);
  ctx.quadraticCurveTo(9, 2, 9, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tono(C.mostaza, -0.3);
  ctx.beginPath();
  ctx.arc(campana ? Math.sin(campana * 30 + 1) * 3 : 0, 20, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** El cartel del local. texto: por si cambia en el final. color: el que elegiste. */
export function cartel(ctx, cx, cy, texto, color = C.terracota) {
  capaRect(ctx, `cartel|${texto || ''}|${color}|${cx}|${cy}`, cx - 196, cy - 42, 400, 92, (g) => cartelVivo(g, cx, cy, texto, color));
}

function cartelVivo(ctx, cx, cy, texto, color) {
  const w = 380;
  const h = 70;
  ctx.save();
  ctx.fillStyle = 'rgba(59,42,32,.18)';
  ctx.beginPath();
  ctx.roundRect(cx - w / 2 + 5, cy - h / 2 + 7, w, h, 16);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 16);
  ctx.fill();
  conGrano(ctx, cx - w / 2, cy - h / 2, w, h, 0.8);
  lin(ctx, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(cx - w / 2 + 8, cy - h / 2 + 8, w - 16, h - 16, 10);
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.crema;
  ctx.stroke();
  ctx.fillStyle = C.crema;
  ctx.font = '700 34px Fredoka, "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto || 'Julay’s Donas', cx + 18, cy + 2);
  dona(ctx, donaIdeal({ masa: 'vainilla', forma: 'anillo', relleno: null, bano: 'frutilla', hilos: null, toppings: ['granas'], pieza: null }), cx - w / 2 + 44, cy, 22, { sombra: false });
  ctx.restore();
}

/** Atrás del mostrador: estantes con frascos y donas (no se mueve: va guardada). */
function estanteria(ctx, x, y, w, h) {
  capaRect(ctx, 'estanteria|' + idioma, x - 4, y - 4, w + 8, h + 8, (g) => estanteriaViva(g, x, y, w, h));
}

function estanteriaViva(ctx, x, y, w, h) {
  const fondo = tono(C.madera, 0.25);
  ctx.fillStyle = fondo;
  ctx.fillRect(x, y, w, h);
  vetas(ctx, x, y, w, h, fondo, 31);
  ctx.fillStyle = 'rgba(59,42,32,.12)';
  ctx.fillRect(x, y, w, 12);
  lin(ctx, 3);
  ctx.strokeRect(x, y, w, h);
  for (let i = 1; i < 3; i++) {
    ctx.fillStyle = C.madera;
    ctx.fillRect(x, y + (h / 3) * i - 6, w, 10);
    ctx.strokeRect(x, y + (h / 3) * i - 6, w, 10);
    ctx.fillStyle = 'rgba(59,42,32,.16)';
    ctx.fillRect(x + 2, y + (h / 3) * i + 5, w - 4, 6);
  }
  // donas en los estantes
  const tipos = [
    { masa: 'vainilla', bano: 'choco' },
    { masa: 'chocolate', bano: 'blanco' },
    { masa: 'vainilla', bano: 'frutilla' },
    { masa: 'vainilla', bano: 'ddl' },
  ];
  for (let i = 0; i < 6; i++) {
    const tp = tipos[i % 4];
    dona(ctx, donaIdeal({ masa: tp.masa, forma: 'anillo', relleno: null, bano: tp.bano, hilos: null, toppings: i % 2 ? ['granas'] : [], pieza: null }), x + 36 + i * 62, y + h / 3 - 22, 20, { sombra: false });
  }
  // frascos
  const cols = [C.mostaza, C.terracota, C.oliva, C.rosa, C.petroleo2];
  lin(ctx, 3);
  for (let i = 0; i < 5; i++) {
    const fx = x + 30 + i * 74;
    const fy = y + (h * 2) / 3 - 10;
    ctx.fillStyle = 'rgba(246,240,230,.8)';
    ctx.beginPath();
    ctx.roundRect(fx - 18, fy - 44, 36, 44, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cols[i];
    ctx.fillRect(fx - 14, fy - 26, 28, 22);
    ctx.fillStyle = 'rgba(255,250,242,.35)';
    ctx.fillRect(fx - 12, fy - 40, 5, 34);
    ctx.fillStyle = C.madera2;
    ctx.fillRect(fx - 20, fy - 52, 40, 9);
    ctx.strokeRect(fx - 20, fy - 52, 40, 9);
  }
  // pizarrita del menú
  ctx.fillStyle = '#3f4a3c';
  ctx.beginPath();
  ctx.roundRect(x + 18, y + h - 54, w - 36, 46, 6);
  ctx.fill();
  ctx.stroke();
  conGrano(ctx, x + 18, y + h - 54, w - 36, 46, 1);
  ctx.fillStyle = '#f4ead8';
  ctx.font = '600 15px Fredoka, "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(T('Donas · Bolas · Bastones · Con todo', 'Donuts · Filled · Long johns · Loaded'), x + w / 2, y + h - 31, w - 50);
}

// ------------------------------------------------------------------ decoraciones

function techo(ctx, id, t) {
  if (!id) return;
  ctx.save();
  if (id === 'banderines') {
    const cols = [C.terracota, C.mostaza, C.oliva, C.petroleo, C.rosa];
    lin(ctx, 2);
    ctx.beginPath();
    ctx.moveTo(0, 130);
    ctx.quadraticCurveTo(400, 170, 800, 130);
    ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const x = 20 + i * 50;
      const tt = x / 800;
      const y = 130 + 4 * tt * (1 - tt) * 40;
      const sw = Math.sin(t * 1.6 + i) * 0.06;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sw);
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.lineTo(0, 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  } else if (id === 'lamparas') {
    for (const x of [200, 440, 680]) {
      lin(ctx, 2);
      ctx.beginPath();
      ctx.moveTo(x, 120);
      ctx.lineTo(x, 168);
      ctx.stroke();
      ctx.fillStyle = C.oliva;
      ctx.beginPath();
      ctx.moveTo(x - 30, 200);
      ctx.lineTo(x - 12, 166);
      ctx.lineTo(x + 12, 166);
      ctx.lineTo(x + 30, 200);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(42,29,21,.12)';
      ctx.beginPath();
      ctx.moveTo(x + 4, 166);
      ctx.lineTo(x + 12, 166);
      ctx.lineTo(x + 30, 200);
      ctx.lineTo(x + 14, 200);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f6e7b8';
      ctx.beginPath();
      ctx.arc(x, 202, 8, 0, Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'ventilador') {
    const x = 420;
    lin(ctx, 3);
    ctx.beginPath();
    ctx.moveTo(x, 120);
    ctx.lineTo(x, 150);
    ctx.stroke();
    ctx.fillStyle = C.madera;
    for (let i = 0; i < 4; i++) {
      const a = t * 4 + (i * TAU) / 4;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 60, 158 + Math.sin(a) * 9, 58 * Math.abs(Math.cos(a)) + 8, 7, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = C.acero;
    ctx.beginPath();
    ctx.ellipse(x, 156, 16, 9, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'luces') {
    lin(ctx, 2);
    ctx.beginPath();
    ctx.moveTo(0, 126);
    ctx.quadraticCurveTo(210, 176, 420, 130);
    ctx.quadraticCurveTo(630, 176, 840, 126);
    ctx.stroke();
    for (let i = 0; i < 20; i++) {
      const x = 22 + i * 41;
      const tramo = x < 420 ? x / 420 : (x - 420) / 420;
      const y = 128 + 4 * tramo * (1 - tramo) * 44;
      ctx.fillStyle = ['#f6e7b8', '#f2d6b8', '#f6e7b8', '#e9d9a0'][i % 4];
      ctx.beginPath();
      ctx.ellipse(x, y + 12, 6, 9, 0, 0, TAU);
      ctx.fill();
      lin(ctx, 2);
      ctx.stroke();
      ctx.fillStyle = C.acero2;
      ctx.fillRect(x - 4, y, 8, 5);
    }
  } else if (id === 'donas-colgantes') {
    const specs = [
      { masa: 'vainilla', bano: 'frutilla', toppings: ['granas'] },
      { masa: 'chocolate', bano: 'blanco', toppings: [] },
      { masa: 'vainilla', bano: 'choco', toppings: ['granas'] },
      { masa: 'vainilla', bano: 'ddl', toppings: ['coco'] },
    ];
    for (let i = 0; i < 4; i++) {
      const x = 170 + i * 170;
      const largo = 40 + (i % 2) * 26;
      const sw = Math.sin(t * 1.2 + i * 1.7) * 0.08;
      ctx.save();
      ctx.translate(x, 118);
      ctx.rotate(sw);
      lin(ctx, 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, largo);
      ctx.stroke();
      dona(ctx, donaIdeal({ forma: 'anillo', relleno: null, hilos: null, pieza: null, ...specs[i] }), 0, largo + 18, 20, { sombra: false });
      ctx.restore();
    }
  }
  ctx.restore();
}

function marco(ctx, x, y, w, h, color = C.madera2) {
  ctx.fillStyle = 'rgba(59,42,32,.18)';
  ctx.fillRect(x - w / 2 - 4, y - h / 2 - 2, w + 16, h + 18);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - 8, y - h / 2 - 8, w + 16, h + 16, 4);
  ctx.fill();
  lin(ctx, 3);
  ctx.stroke();
  ctx.fillStyle = C.papel;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}

function cuadro(ctx, id, x, y, t) {
  if (!id) return;
  ctx.save();
  if (id === 'cuadro-dona' || id === 'cuadro-oro') {
    const oro = id === 'cuadro-oro';
    marco(ctx, x, y, 92, 92, oro ? C.mostaza : C.madera2);
    ctx.fillStyle = oro ? '#f2dfa4' : '#e8d4c4';
    ctx.fillRect(x - 46, y - 46, 92, 92);
    const d = oro ? { id: 3, masa: 'vainilla', forma: 'anillo', coc: [1, 1], bano: { id: 'ddl', cob: 1 } } : donaIdeal({ masa: 'chocolate', forma: 'anillo', relleno: null, bano: 'frutilla', hilos: 'blanco', toppings: [], pieza: null });
    dona(ctx, d, x, y, 32, { sombra: false });
    if (oro) {
      ctx.fillStyle = C.mostaza;
      ctx.font = '700 16px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', x + 32, y - 30);
    }
  } else if (id === 'cuadro-barrio') {
    marco(ctx, x, y, 110, 80);
    ctx.fillStyle = '#cfe0e6';
    ctx.fillRect(x - 55, y - 40, 110, 80);
    for (const [dx, hh, col] of [[-55, 40, C.terracota], [-25, 54, C.mostaza], [5, 34, C.oliva], [30, 48, C.rosa]]) {
      ctx.fillStyle = col;
      ctx.fillRect(x + dx, y + 40 - hh, 26, hh);
    }
    lin(ctx, 3);
    ctx.strokeRect(x - 55, y - 40, 110, 80);
  } else if (id === 'reloj-dona') {
    const d = donaIdeal({ masa: 'vainilla', forma: 'anillo', relleno: null, bano: 'blanco', hilos: null, toppings: ['granas'], pieza: null });
    dona(ctx, d, x, y, 50, { sombra: false });
    const ahora = new Date();
    const hh = ((ahora.getHours() % 12) + ahora.getMinutes() / 60) / 12;
    const mm = ahora.getMinutes() / 60;
    lin(ctx, 4);
    for (const [f, L] of [[hh, 13], [mm, 17]]) {
      const a = f * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
      ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
  } else if (id === 'foto-pocha') {
    marco(ctx, x, y, 84, 100, C.mostaza);
    retrato(ctx, EXIGENTES[0].look, x, y - 6, 34, { animo: 'encantado', fondo: '#e8d4c4' });
    ctx.fillStyle = C.tinta;
    ctx.font = '600 11px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Doña Pocha', x, y + 42);
  } else if (id === 'cuadro-julay') {
    marco(ctx, x, y, 90, 108, C.madera2);
    ctx.fillStyle = '#e9d9b8';
    ctx.fillRect(x - 45, y - 54, 90, 108);
    retrato(ctx, JULAY.look, x, y - 6, 38, { animo: 'feliz', fondo: '#d9c4a0' });
    ctx.fillStyle = C.tinta;
    ctx.font = '700 12px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Julay', x, y + 44);
  } else if (id === 'espejo') {
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.arc(x, y, 54, 0, TAU);
    ctx.fill();
    lin(ctx, 3);
    ctx.stroke();
    const g = ctx.createLinearGradient(x - 40, y - 40, x + 40, y + 40);
    g.addColorStop(0, '#dfe8e8');
    g.addColorStop(1, '#bfcfd2');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 44, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,242,.65)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - 22, y + 14);
    ctx.lineTo(x + 8, y - 24);
    ctx.moveTo(x - 6, y + 24);
    ctx.lineTo(x + 18, y - 8);
    ctx.stroke();
  } else if (id === 'diploma-julay') {
    marco(ctx, x, y, 120, 84, C.mostaza);
    ctx.fillStyle = C.tinta;
    ctx.font = '700 13px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DIPLOMA', x, y - 22);
    ctx.font = '500 10px Fredoka, sans-serif';
    ctx.fillText(T('a la mejor dona', 'for the best donut'), x, y - 6);
    ctx.fillText('— Julay', x + 20, y + 10);
    ctx.fillStyle = C.terracota;
    ctx.beginPath();
    ctx.arc(x - 34, y + 24, 12, 0, TAU);
    ctx.fill();
    lin(ctx, 2);
    ctx.stroke();
  }
  ctx.restore();
}

function estante(ctx, id, x, y, t) {
  if (!id) return;
  ctx.save();
  if (id === 'pizarra') {
    ctx.fillStyle = '#3f4a3c';
    ctx.beginPath();
    ctx.roundRect(x - 60, y - 52, 120, 104, 6);
    ctx.fill();
    conGrano(ctx, x - 60, y - 52, 120, 104, 1);
    lin(ctx, 5, C.madera2);
    ctx.stroke();
    ctx.fillStyle = C.crema;
    ctx.font = '600 13px Fredoka, sans-serif';
    ctx.textAlign = 'left';
    (idioma === 'en' ? ['Donut ......... $', 'Filled ......... $$', 'Long john .. $$', 'Loaded ...... $$$'] : ['Dona ......... $', 'Bola ......... $$', 'Bastón ...... $$', 'Con todo .. $$$']).forEach((s, i) => ctx.fillText(s, x - 50, y - 26 + i * 20, 104));
  } else if (id === 'guirnalda') {
    lin(ctx, 2);
    ctx.beginPath();
    ctx.moveTo(x - 80, y - 40);
    ctx.quadraticCurveTo(x, y + 10, x + 80, y - 40);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const tt = (i + 0.5) / 5;
      const px = x - 80 + tt * 160;
      const py = y - 40 + 4 * tt * (1 - tt) * 25;
      dona(ctx, donaIdeal({ masa: 'vainilla', forma: 'anillo', relleno: null, bano: ['frutilla', 'choco', 'blanco', 'ddl', 'frutilla'][i], hilos: null, toppings: [], pieza: null }), px, py + 14, 11, { sombra: false });
    }
  } else if (id === 'estante-frascos') {
    ctx.fillStyle = C.madera;
    ctx.fillRect(x - 80, y + 16, 160, 10);
    lin(ctx, 3);
    ctx.strokeRect(x - 80, y + 16, 160, 10);
    const cols = [C.terracota, C.oliva, C.mostaza, C.ciruela];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(246,240,230,.85)';
      ctx.beginPath();
      ctx.roundRect(x - 70 + i * 38, y - 30, 30, 46, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = cols[i];
      ctx.fillRect(x - 66 + i * 38, y - 8, 22, 20);
    }
  } else if (id === 'plantas-colgantes') {
    for (const [dx, largo] of [[-50, 40], [10, 66], [64, 30]]) {
      const sw = Math.sin(t * 1.1 + dx) * 0.05;
      ctx.save();
      ctx.translate(x + dx, y - 70);
      ctx.rotate(sw);
      lin(ctx, 1.5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, largo);
      ctx.moveTo(0, 0);
      ctx.lineTo(10, largo);
      ctx.stroke();
      ctx.fillStyle = C.terracota;
      ctx.beginPath();
      ctx.moveTo(-15, largo);
      ctx.lineTo(15, largo);
      ctx.lineTo(10, largo + 22);
      ctx.lineTo(-10, largo + 22);
      ctx.closePath();
      ctx.fill();
      lin(ctx, 2.5);
      ctx.stroke();
      ctx.fillStyle = C.oliva;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.ellipse(-12 + k * 5, largo + 22 + (k % 3) * 9, 4, 7, (k - 2.5) * 0.25, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  } else if (id === 'reloj-cucu') {
    ctx.fillStyle = C.madera2;
    ctx.beginPath();
    ctx.moveTo(x - 46, y - 20);
    ctx.lineTo(x, y - 62);
    ctx.lineTo(x + 46, y - 20);
    ctx.closePath();
    ctx.fill();
    lin(ctx, 3);
    ctx.stroke();
    ctx.fillStyle = C.madera;
    ctx.beginPath();
    ctx.roundRect(x - 36, y - 24, 72, 64, 6);
    ctx.fill();
    ctx.stroke();
    vetas(ctx, x - 36, y - 24, 72, 64, C.madera, 4);
    ctx.fillStyle = C.crema;
    ctx.beginPath();
    ctx.arc(x, y + 10, 20, 0, TAU);
    ctx.fill();
    ctx.stroke();
    const ahora = new Date();
    lin(ctx, 2.5);
    for (const [f, L] of [[((ahora.getHours() % 12) + ahora.getMinutes() / 60) / 12, 10], [ahora.getMinutes() / 60, 14]]) {
      const a = f * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 10);
      ctx.lineTo(x + Math.cos(a) * L, y + 10 + Math.sin(a) * L);
      ctx.stroke();
    }
    // péndulo y piñas
    const pa = Math.sin(t * 3) * 0.3;
    ctx.save();
    ctx.translate(x, y + 40);
    ctx.rotate(pa);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 40);
    ctx.stroke();
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.arc(0, 46, 8, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // cada tanto sale el pajarito
    const fase = t % 12;
    const sale = fase < 1.4 ? Math.sin((fase / 1.4) * Math.PI) : 0;
    ctx.fillStyle = '#2b211c';
    ctx.fillRect(x - 10, y - 46, 20, 18);
    if (sale > 0) {
      ctx.save();
      ctx.translate(x, y - 38 + 0);
      ctx.scale(0.6 + sale * 0.6, 0.6 + sale * 0.6);
      ctx.fillStyle = C.mostaza2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
      lin(ctx, 2);
      ctx.stroke();
      ctx.fillStyle = C.terracota;
      ctx.beginPath();
      ctx.moveTo(7, -2);
      ctx.lineTo(14, 1);
      ctx.lineTo(7, 3);
      ctx.fill();
      ctx.restore();
    }
  } else if (id === 'mural-barrio') {
    ctx.fillStyle = '#f0d9b0';
    ctx.beginPath();
    ctx.roundRect(x - 90, y - 60, 180, 120, 10);
    ctx.fill();
    lin(ctx, 3);
    ctx.stroke();
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.arc(x + 50, y - 28, 16, 0, TAU);
    ctx.fill();
    const cols = [C.terracota, C.oliva, C.petroleo2, C.rosa, C.ciruela2];
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = cols[i];
      ctx.fillRect(x - 84 + i * 34, y + 60 - 30 - (i % 2) * 16, 30, 30 + (i % 2) * 16);
    }
    dona(ctx, donaIdeal({ masa: 'chocolate', forma: 'anillo', relleno: null, bano: 'frutilla', hilos: null, toppings: ['granas'], pieza: null }), x - 40, y - 20, 22, { sombra: false });
  }
  ctx.restore();
}

/** Mesas del salón: se dibujan delante de los clientes sentados. */
export function mesas(ctx, deco) {
  const id = typeof deco === 'string' ? deco : deco?.mesas;
  const col = typeof deco === 'string' ? C.madera : colorLocal(deco, 'mesas');
  ctx.save();
  for (const x of LUGARES.mesas) {
    // sombra en el piso
    ctx.fillStyle = 'rgba(59,42,32,.16)';
    ctx.beginPath();
    ctx.ellipse(x, 566, 96, 12, 0, 0, TAU);
    ctx.fill();
    lin(ctx, 3);
    if (id === 'mesas-cafe') {
      ctx.fillStyle = C.acero2;
      ctx.fillRect(x - 5, 492, 10, 70);
      ctx.strokeRect(x - 5, 492, 10, 70);
      ctx.beginPath();
      ctx.ellipse(x, 562, 34, 8, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = tono(col, 0.75);
      ctx.beginPath();
      ctx.ellipse(x, 492, 82, 20, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = alfa(col, 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, 492, 70, 15, 0, 0, TAU);
      ctx.stroke();
    } else if (id === 'mesas-retro') {
      ctx.fillStyle = C.acero;
      ctx.fillRect(x - 7, 500, 14, 64);
      ctx.strokeRect(x - 7, 500, 14, 64);
      ctx.fillStyle = col === C.madera ? C.terracota : col;
      ctx.beginPath();
      ctx.roundRect(x - 92, 482, 184, 22, 11);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.acero;
      ctx.fillRect(x - 92, 500, 184, 6);
      ctx.fillStyle = 'rgba(255,250,242,.25)';
      ctx.fillRect(x - 80, 486, 150, 4);
    } else if (id === 'mesas-picnic') {
      ctx.fillStyle = col;
      for (const dx of [-70, 62]) {
        ctx.fillRect(x + dx, 500, 10, 64);
        ctx.strokeRect(x + dx, 500, 10, 64);
      }
      // mantel a cuadros que cuelga
      ctx.fillStyle = C.crema;
      ctx.beginPath();
      ctx.moveTo(x - 94, 482);
      ctx.lineTo(x + 94, 482);
      ctx.lineTo(x + 98, 524);
      ctx.lineTo(x - 98, 524);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = alfa(C.terracota, 0.55);
      for (let k = -100; k < 100; k += 16) ctx.fillRect(x + k, 482, 8, 44);
      for (let k = 482; k < 526; k += 16) ctx.fillRect(x - 100, k, 200, 8);
      ctx.restore();
      ctx.stroke();
    } else if (id === 'mesas-marmol') {
      ctx.fillStyle = C.tinta2;
      ctx.beginPath();
      ctx.moveTo(x - 6, 504);
      ctx.lineTo(x + 6, 504);
      ctx.lineTo(x + 26, 562);
      ctx.lineTo(x - 26, 562);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = tono('#efe9e1', -0.12);
      ctx.beginPath();
      ctx.roundRect(x - 90, 494, 180, 14, [0, 0, 6, 6]);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#efe9e1';
      ctx.beginPath();
      ctx.roundRect(x - 90, 480, 180, 20, 6);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = alfa(C.acero2, 0.5);
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x - 90 + k * 50, 482);
        ctx.bezierCurveTo(x - 70 + k * 50, 490, x - 60 + k * 50, 496, x - 40 + k * 50, 504);
        ctx.stroke();
      }
      ctx.restore();
      lin(ctx, 3);
      ctx.stroke();
    } else {
      ctx.fillStyle = tono(col, -0.15);
      for (const dx of [-70, 62]) {
        ctx.fillRect(x + dx, 500, 10, 64);
        ctx.strokeRect(x + dx, 500, 10, 64);
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(x - 88, 484, 176, 20, 5);
      ctx.fill();
      vetas(ctx, x - 88, 484, 176, 20, col, x);
      ctx.fillStyle = 'rgba(255,250,242,.15)';
      ctx.fillRect(x - 84, 487, 168, 3);
      lin(ctx, 3);
      ctx.beginPath();
      ctx.roundRect(x - 88, 484, 176, 20, 5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Lo que va en el rincón del salón (entre las mesas y el mostrador). */
export function rincon(ctx, id, t) {
  if (!id) return;
  const x = 700;
  const y = PISO + 6;
  ctx.save();
  ctx.fillStyle = 'rgba(59,42,32,.15)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 48, 9, 0, 0, TAU);
  ctx.fill();
  lin(ctx, 3);
  if (id === 'planta-chica' || id === 'planta-grande' || id === 'planta-gigante') {
    const grande = id !== 'planta-chica';
    const s = id === 'planta-gigante' ? 1.5 : grande ? 1.2 : 0.85;
    ctx.fillStyle = C.terracota;
    ctx.beginPath();
    ctx.moveTo(x - 26 * s, y - 50 * s);
    ctx.lineTo(x + 26 * s, y - 50 * s);
    ctx.lineTo(x + 20 * s, y);
    ctx.lineTo(x - 20 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(42,29,21,.15)';
    ctx.fillRect(x + 6 * s, y - 48 * s, 14 * s, 46 * s);
    const hojas = grande ? 7 : 5;
    for (let i = 0; i < hojas; i++) {
      const a = -Math.PI / 2 + (i - (hojas - 1) / 2) * 0.42 + Math.sin(t + i) * 0.03;
      ctx.save();
      ctx.translate(x, y - 50 * s);
      ctx.rotate(a);
      ctx.fillStyle = i % 2 ? C.oliva : tono(C.oliva, -0.1);
      ctx.beginPath();
      ctx.ellipse(36 * s, 0, 36 * s, 13 * s, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = alfa(C.tinta, 0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4 * s, 0);
      ctx.lineTo(66 * s, 0);
      ctx.stroke();
      ctx.restore();
      lin(ctx, 3);
    }
    if (id === 'planta-gigante') {
      for (const [dx, dy] of [[-20, -110], [18, -118], [0, -96]]) dona(ctx, { id: 5, masa: 'chocolate', forma: 'bola', coc: [1, 1] }, x + dx, y + dy, 13, { sombra: false });
    }
  } else if (id === 'maquina-chicles') {
    ctx.fillStyle = C.terracota;
    ctx.beginPath();
    ctx.roundRect(x - 22, y - 78, 44, 78, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(207,224,230,.9)';
    ctx.beginPath();
    ctx.arc(x, y - 112, 38, 0, TAU);
    ctx.fill();
    ctx.stroke();
    const cols = [C.mostaza, C.oliva, C.rosa, C.petroleo2, C.terracota, C.crema];
    const R = azar(4);
    for (let i = 0; i < 20; i++) {
      const a = R() * TAU;
      const rr = R() * 28;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr, y - 108 + Math.abs(Math.sin(a)) * rr * 0.8, 7, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,250,242,.35)';
    ctx.beginPath();
    ctx.ellipse(x - 16, y - 128, 7, 14, 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.arc(x, y - 50, 8, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'rockola') {
    ctx.fillStyle = C.ciruela;
    ctx.beginPath();
    ctx.moveTo(x - 46, y);
    ctx.lineTo(x - 46, y - 110);
    ctx.arc(x, y - 110, 46, Math.PI, 0);
    ctx.lineTo(x + 46, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.mostaza2;
    ctx.beginPath();
    ctx.arc(x, y - 110, 30, Math.PI, 0);
    ctx.lineTo(x + 30, y - 80);
    ctx.lineTo(x - 30, y - 80);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = [C.terracota, C.oliva, C.petroleo2][i];
      ctx.fillRect(x - 30 + i * 21, y - 66, 18, 30);
      ctx.strokeRect(x - 30 + i * 21, y - 66, 18, 30);
    }
    ctx.fillStyle = C.tinta;
    ctx.font = '700 18px Fredoka, sans-serif';
    ctx.fillText('♪', x + 50 + Math.sin(t * 2) * 4, y - 140 - ((t * 20) % 30));
  } else if (id === 'perchero') {
    ctx.fillStyle = C.madera2;
    ctx.fillRect(x - 5, y - 170, 10, 170);
    ctx.strokeRect(x - 5, y - 170, 10, 170);
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 30, 7, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 160);
      ctx.lineTo(x + sx * 24, y - 176);
      ctx.stroke();
    }
    // un sombrero y una bufanda colgados
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.ellipse(x - 22, y - 172, 20, 5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x - 34, y - 192, 24, 20, [8, 8, 2, 2]);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.terracota;
    ctx.beginPath();
    ctx.roundRect(x + 16, y - 176, 14, 70, 5);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'gato') {
    // almohadón y un gato que respira y mueve la cola
    ctx.fillStyle = C.rosa;
    ctx.beginPath();
    ctx.ellipse(x, y - 8, 52, 14, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    const resp = Math.sin(t * 1.8) * 1.5;
    const cola = Math.sin(t * 1.2) * 0.4;
    ctx.save();
    ctx.translate(x + 30, y - 22);
    ctx.rotate(cola);
    ctx.fillStyle = '#b5844c';
    ctx.beginPath();
    ctx.ellipse(18, -4, 20, 6, -0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#c9995f';
    ctx.beginPath();
    ctx.ellipse(x, y - 30 - resp, 36, 20 + resp, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = alfa('#7a5034', 0.6);
    ctx.lineWidth = 2;
    for (const k of [-14, -2, 10]) {
      ctx.beginPath();
      ctx.arc(x + k, y - 44 - resp, 8, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    lin(ctx, 3);
    ctx.fillStyle = '#c9995f';
    ctx.beginPath();
    ctx.arc(x - 30, y - 34, 16, 0, TAU);
    ctx.fill();
    ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x - 30 + sx * 6, y - 48);
      ctx.lineTo(x - 30 + sx * 14, y - 58);
      ctx.lineTo(x - 30 + sx * 15, y - 42);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x - 30 + sx * 6, y - 34, 3.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    // zzz
    ctx.fillStyle = C.tinta2;
    ctx.font = '700 14px Fredoka, sans-serif';
    const z = (t * 0.6) % 1;
    ctx.globalAlpha = 1 - z;
    ctx.fillText('z', x - 46 - z * 10, y - 60 - z * 26);
    ctx.globalAlpha = 1;
  } else if (id === 'bici') {
    ctx.save();
    ctx.translate(x - 10, y);
    lin(ctx, 3);
    for (const dx of [-42, 42]) {
      ctx.beginPath();
      ctx.arc(dx, -28, 26, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(dx + Math.cos(a) * 24, -28 + Math.sin(a) * 24);
        ctx.lineTo(dx - Math.cos(a) * 24, -28 - Math.sin(a) * 24);
        ctx.stroke();
      }
      ctx.lineWidth = 3;
    }
    ctx.strokeStyle = C.petroleo;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-42, -28);
    ctx.lineTo(-8, -28);
    ctx.lineTo(16, -64);
    ctx.lineTo(-18, -64);
    ctx.lineTo(-42, -28);
    ctx.moveTo(-8, -28);
    ctx.lineTo(-22, -74);
    ctx.moveTo(16, -64);
    ctx.lineTo(42, -28);
    ctx.moveTo(16, -64);
    ctx.lineTo(14, -84);
    ctx.stroke();
    lin(ctx, 3);
    ctx.fillStyle = C.tinta2;
    ctx.beginPath();
    ctx.roundRect(-34, -80, 24, 8, 4);
    ctx.fill();
    ctx.stroke();
    // canasto con una caja de donas
    ctx.fillStyle = C.madera3;
    ctx.beginPath();
    ctx.roundRect(22, -96, 40, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.crema;
    ctx.beginPath();
    ctx.roundRect(26, -112, 32, 16, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.terracota;
    ctx.fillRect(36, -112, 12, 16);
    ctx.restore();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ mostrador

/** El mostrador (va delante de quien atiende) con lo que tenga arriba. */
export function mostrador(ctx, deco, t, o = {}) {
  const x0 = 840;
  const top = 430;
  const col = colorLocal(deco, 'mostrador');
  const toldo = colorLocal(deco, 'toldo');
  capaRect(ctx, `mostrador|${col}|${toldo}`, x0 - 20, top - 96, W - x0 + 24, H - top + 100, (g) => mueble(g, x0, top, col, toldo));
  ctx.save();
  const cx = 1180;
  ctx.fillStyle = C.tinta;
  ctx.font = '700 15px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.monedas !== undefined ? `$ ${o.monedas}` : '$', cx, top - 70);
  objetoMostrador(ctx, deco.mostrador, 920, top - 14, t);
  ctx.restore();
}

/** El mueble del mostrador con la caja registradora (sin la plata, que cambia). */
function mueble(ctx, x0, top, col, toldo) {
  ctx.save();
  lin(ctx, 3);
  // frente con paneles y vetas
  ctx.fillStyle = col;
  ctx.fillRect(x0, top, W - x0, H - top);
  vetas(ctx, x0, top, W - x0, H - top, col, 41, true);
  ctx.strokeRect(x0, top, W - x0 + 4, H - top + 4);
  for (let x = x0 + 22; x < W; x += 104) {
    ctx.fillStyle = tono(col, -0.12);
    ctx.beginPath();
    ctx.roundRect(x, top + 40, 82, 150, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,250,242,.12)';
    ctx.fillRect(x + 4, top + 44, 74, 4);
    ctx.fillStyle = 'rgba(42,29,21,.12)';
    ctx.fillRect(x + 60, top + 44, 18, 142);
  }
  // un toldo de rayas pintado al frente
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? C.crema : toldo;
    ctx.fillRect(x0 + i * 49, top + 14, 49, 18);
  }
  ctx.strokeRect(x0, top + 14, W - x0, 18);
  // tapa
  ctx.fillStyle = C.madera3;
  ctx.beginPath();
  ctx.roundRect(x0 - 16, top - 14, W - x0 + 30, 28, 8);
  ctx.fill();
  vetas(ctx, x0 - 16, top - 14, W - x0 + 30, 28, C.madera3, 43);
  ctx.fillStyle = 'rgba(255,250,242,.2)';
  ctx.fillRect(x0 - 10, top - 10, W - x0 + 18, 4);
  lin(ctx, 3);
  ctx.beginPath();
  ctx.roundRect(x0 - 16, top - 14, W - x0 + 30, 28, 8);
  ctx.stroke();
  // caja registradora
  const cx = 1180;
  ctx.fillStyle = C.oliva;
  ctx.beginPath();
  ctx.roundRect(cx - 52, top - 92, 104, 78, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(42,29,21,.12)';
  ctx.fillRect(cx + 26, top - 88, 22, 70);
  ctx.fillStyle = '#e8f0d8';
  ctx.fillRect(cx - 36, top - 82, 72, 24);
  ctx.strokeRect(cx - 36, top - 82, 72, 24);
  ctx.fillStyle = tono(C.oliva, 0.3);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      ctx.roundRect(cx - 34 + i * 24, top - 52 + j * 16, 20, 12, 3);
      ctx.fill();
      ctx.stroke();
    }
  ctx.restore();
}

function objetoMostrador(ctx, id, x, y, t) {
  if (!id) return;
  lin(ctx, 3);
  if (id === 'campanita') {
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.moveTo(x - 22, y);
    ctx.quadraticCurveTo(x - 22, y - 30, x, y - 30);
    ctx.quadraticCurveTo(x + 22, y - 30, x + 22, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,250,242,.3)';
    ctx.beginPath();
    ctx.ellipse(x - 9, y - 16, 4, 9, 0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.acero2;
    ctx.fillRect(x - 28, y - 4, 56, 6);
    ctx.strokeRect(x - 28, y - 4, 56, 6);
  } else if (id === 'florero') {
    ctx.fillStyle = C.petroleo2;
    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.quadraticCurveTo(x - 22, y - 26, x - 8, y - 40);
    ctx.lineTo(x + 8, y - 40);
    ctx.quadraticCurveTo(x + 22, y - 26, x + 14, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const [dx, dy, col] of [[-14, -66, C.rosa], [8, -74, C.mostaza], [20, -58, C.terracota]]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 40);
      ctx.lineTo(x + dx, y + dy + 6);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 9, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'frasco-propinas') {
    ctx.fillStyle = 'rgba(246,240,230,.85)';
    ctx.beginPath();
    ctx.roundRect(x - 22, y - 54, 44, 54, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.mostaza;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(x - 10 + (i % 3) * 10, y - 8 - Math.floor(i / 3) * 8, 7, 4, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = C.terracota;
    ctx.fillRect(x - 24, y - 40, 48, 14);
    ctx.fillStyle = C.crema;
    ctx.font = '700 9px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(T('PROPINAS', 'TIPS'), x, y - 33);
  } else if (id === 'vitrina') {
    ctx.fillStyle = 'rgba(207,224,230,.55)';
    ctx.beginPath();
    ctx.roundRect(x - 60, y - 70, 120, 70, 8);
    ctx.fill();
    ctx.stroke();
    const specs = [
      { masa: 'chocolate', forma: 'anillo', relleno: null, bano: 'blanco', hilos: 'choco', toppings: [], pieza: null },
      { masa: 'vainilla', forma: 'bola', relleno: 'ddl', bano: 'frutilla', hilos: null, toppings: ['granas'], pieza: null },
      { masa: 'vainilla', forma: 'anillo', relleno: null, bano: 'ddl', hilos: null, toppings: ['coco'], pieza: null },
    ];
    specs.forEach((s, i) => dona(ctx, donaIdeal(s), x - 36 + i * 36, y - 26, 15, { sombra: false }));
    ctx.fillStyle = 'rgba(255,250,242,.4)';
    ctx.fillRect(x - 50, y - 64, 12, 56);
  } else if (id === 'freidora-oro') {
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.roundRect(x - 34, y - 40, 68, 40, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.mostaza2;
    ctx.fillRect(x - 26, y - 34, 52, 10);
    ctx.fillStyle = C.tinta;
    ctx.font = '700 16px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', x, y - 8);
  } else if (id === 'cactus') {
    ctx.fillStyle = C.terracota;
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 22);
    ctx.lineTo(x + 16, y - 22);
    ctx.lineTo(x + 12, y);
    ctx.lineTo(x - 12, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.oliva;
    ctx.beginPath();
    ctx.roundRect(x - 9, y - 66, 18, 46, 9);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x + 6, y - 52, 16, 10, 5);
    ctx.roundRect(x + 14, y - 64, 10, 20, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.rosa;
    ctx.beginPath();
    ctx.arc(x, y - 68, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'pecera') {
    ctx.fillStyle = 'rgba(160,196,206,.7)';
    ctx.beginPath();
    ctx.arc(x, y - 34, 34, 0.15 * Math.PI, 2.85 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // dos pececitos que nadan
    for (let i = 0; i < 2; i++) {
      const fx = x + Math.sin(t * (0.9 + i * 0.4) + i * 2) * 18;
      const fy = y - 30 - i * 14 + Math.sin(t * 2 + i) * 3;
      const dirx = Math.cos(t * (0.9 + i * 0.4) + i * 2) >= 0 ? 1 : -1;
      ctx.fillStyle = i ? C.mostaza : C.terracota;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 9, 5.5, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx - dirx * 8, fy);
      ctx.lineTo(fx - dirx * 15, fy - 5);
      ctx.lineTo(fx - dirx * 15, fy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    lin(ctx, 3);
    ctx.fillStyle = C.oliva;
    ctx.beginPath();
    ctx.ellipse(x - 14, y - 6, 4, 12, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,242,.4)';
    ctx.beginPath();
    ctx.ellipse(x - 20, y - 48, 5, 10, 0.5, 0, TAU);
    ctx.fill();
  } else if (id === 'torre-donas') {
    ctx.fillStyle = C.acero;
    ctx.fillRect(x - 3, y - 96, 6, 96);
    ctx.strokeRect(x - 3, y - 96, 6, 96);
    const specs = [
      { masa: 'vainilla', bano: 'frutilla', toppings: ['granas'] },
      { masa: 'chocolate', bano: 'blanco', toppings: [] },
      { masa: 'vainilla', bano: 'choco', toppings: ['coco'] },
    ];
    for (let k = 0; k < 3; k++) {
      const yy = y - 10 - k * 32;
      const w = 54 - k * 12;
      ctx.fillStyle = C.crema;
      ctx.beginPath();
      ctx.ellipse(x, yy, w, 7, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      for (let i = -1; i <= 1; i += k === 2 ? 2 : 1) dona(ctx, donaIdeal({ forma: 'anillo', relleno: null, hilos: null, pieza: null, ...specs[(k + i + 3) % 3] }), x + i * (w * 0.55), yy - 10, 12 - k, { sombra: false });
    }
  }
}

// ------------------------------------------------------------------ cocina

/** Fondo de las estaciones de cocina (azulejos y mesada), guardado en una capa. */
export function cocina(ctx, tipo) {
  capa(ctx, 'cocina|' + tipo, (g) => {
    // azulejos con juntas y un poco de variación
    const R = azar(17);
    for (let y = 0; y < 160; y += 40)
      for (let x = 0; x < W; x += 40) {
        g.fillStyle = tono('#efe6d8', (R() - 0.5) * 0.05);
        g.fillRect(x, y, 40, 40);
        g.fillStyle = 'rgba(255,250,242,.35)';
        g.fillRect(x + 3, y + 3, 34, 3);
      }
    g.strokeStyle = '#d6c8b2';
    g.lineWidth = 2;
    for (let y = 0; y < 160; y += 40) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    for (let x = 0; x < W; x += 40) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 160);
      g.stroke();
    }
    conGrano(g, 0, 0, W, 160, 0.6);
    if (tipo === 'fritura') {
      // acero cepillado
      g.fillStyle = '#c9c3ba';
      g.fillRect(0, 140, W, H - 140);
      g.strokeStyle = 'rgba(255,250,242,.18)';
      g.lineWidth = 1;
      for (let y = 144; y < H; y += 3) {
        g.beginPath();
        g.moveTo(0, y + R());
        g.lineTo(W, y + R());
        g.stroke();
      }
      g.fillStyle = '#b3aca2';
      for (let x = 0; x < W; x += 160) g.fillRect(x, 140, 2, H - 140);
    } else if (tipo === 'decorado') {
      // mármol claro con vetas suaves
      g.fillStyle = '#ebe2d4';
      g.fillRect(0, 140, W, H - 140);
      g.strokeStyle = alfa('#b9a98f', 0.35);
      for (let i = 0; i < 18; i++) {
        g.lineWidth = 1 + R() * 2;
        g.beginPath();
        let x = R() * W;
        let y = 150 + R() * (H - 150);
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += 40 + R() * 60;
          y += (R() - 0.5) * 40;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    } else {
      // mesada de madera
      g.fillStyle = C.madera3;
      g.fillRect(0, 140, W, H - 140);
      for (let y = 150, i = 0; y < H; y += 38, i++) {
        g.fillStyle = tono(C.madera3, ((i * 29) % 9) / 100 - 0.04);
        g.fillRect(0, y, W, 38);
        vetas(g, 0, y, W, 38, C.madera3, i * 7 + 3);
        g.fillStyle = tono(C.madera3, -0.12);
        g.fillRect(0, y, W, 3);
      }
    }
    conGrano(g, 0, 140, W, H - 140, 0.7);
    g.fillStyle = 'rgba(59,42,32,.18)';
    g.fillRect(0, 142, W, 8);
    lin(g, 3);
    g.beginPath();
    g.moveTo(0, 140);
    g.lineTo(W, 140);
    g.stroke();
  });
}
