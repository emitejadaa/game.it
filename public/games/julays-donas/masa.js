/**
 * Estación de masa: elegís la masa, la estirás con el palote (arrastrando) y cortás las formas que
 * pide el ticket. Cuando el ticket tiene todas sus donas cortadas, van a la freidora.
 */
import { C, MASAS, FORMAS, TXT, disponibles } from './data.js';
import { TAU, dona, colorMasa, tono, alfa } from './art.js';
import { cocina } from './local.js';
import { ticketGrande, icono } from './ticket.js';
import { boton, dentroRect, F, panel } from './dibujo.js';
import { GEOM } from './geom.js';
import { tiene } from './mejoras.js';

const CX = 590;
const CY = 368;
const HOJA = { x: 310, y: 218, w: 560, h: 300 };
/** Tamaño de cada cortador (medio ancho y medio alto) en píxeles. */
const MEDIDAS = { anillo: [58, 58], bola: [56, 56], baston: [86, 36] };
const R_CORTE = { anillo: 58, bola: 58 / 0.95, baston: 86 / 1.55 };
const BOTON_TIRAR = { x: 770, y: 574, w: 210, h: 54 };
/** Con la segunda mesa: las dos tarjetas para pasar de una masa a la otra. */
const MESAS = [
  { x: 900, y: 186, w: 112, h: 112 },
  { x: 900, y: 312, w: 112, h: 112 },
];

export const estado = () => ({ hoja: null, hojas: [null, null], mesa: 0, cortador: null, palo: 186, arrastre: null, fantasma: null, vuelo: [] });

/** La masa de la mesa en uso (con dos mesas, la otra queda guardada tal cual). */
function ponerHoja(M, h) {
  M.hoja = h;
  M.hojas[M.mesa] = h;
}

const bins = (day) =>
  disponibles(MASAS, day).map((m, i) => ({ m, r: { x: 16, y: 164 + i * 122, w: 178, h: 110 } }));
const cortadores = (day) =>
  disponibles(FORMAS, day).map((f, i) => ({ f, r: { x: 300 + i * 132, y: 556, w: 120, h: 82 } }));

/** El ticket con el que se trabaja acá: el elegido, o el más viejo que necesite masa. */
export function ticketMasa(J) {
  const d = J.dia;
  let tk = J.sel.masa;
  if (!tk || tk.entregado || d.estadoTicket(tk) !== 'masa') tk = d.pendientes().find((t) => d.estadoTicket(t) === 'masa') || null;
  J.sel.masa = tk;
  return tk;
}

function tamHoja(e) {
  const w = 150 + (HOJA.w - 150) * e;
  const h = 150 + (HOJA.h - 150) * e;
  return { x: CX - w / 2, y: CY - h / 2, w, h, r: Math.max(18, 75 - 57 * e) };
}

/** ¿Entra un corte de esa forma en (x, y)? */
function corteValido(M, forma, x, y) {
  const [mw, mh] = MEDIDAS[forma];
  if (x - mw < HOJA.x + 6 || x + mw > HOJA.x + HOJA.w - 6 || y - mh < HOJA.y + 6 || y + mh > HOJA.y + HOJA.h - 6) return false;
  return !M.hoja.cortes.some((c) => {
    const [cw, ch] = MEDIDAS[c.forma];
    return Math.abs(c.x - x) < cw + mw + 4 && Math.abs(c.y - y) < ch + mh + 4;
  });
}

export function update(J, dt) {
  const M = J.masa;
  for (const v of M.vuelo) v.t += dt;
  M.vuelo = M.vuelo.filter((v) => v.t < 0.8);
  if (M.enviar && (M.enviar -= dt) <= 0) {
    M.enviar = 0;
    J.toast(J.tr(TXT.aFreir));
    J.snd('aFreir');
  }
}

export function draw(ctx, J, t) {
  const M = J.masa;
  const day = J.dia.n;
  cocina(ctx, 'masa');
  // bowls con masa
  for (const { m, r } of bins(day)) {
    const sel = M.hoja && M.hoja.masa === m.id;
    panel(ctx, r.x, r.y, r.w, r.h, { radio: 16, fondo: sel ? '#f6e3c8' : C.papel, borde: sel ? C.terracota : C.tinta, grosor: sel ? 4 : 3 });
    ctx.fillStyle = '#e9e2d6';
    ctx.strokeStyle = C.tinta;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(r.x + 52, r.y + 62, 40, 26, 0, 0, Math.PI);
    ctx.lineTo(r.x + 12, r.y + 62);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = m.crudo;
    ctx.beginPath();
    ctx.ellipse(r.x + 52, r.y + 54, 34, 20, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.tinta;
    ctx.font = F(600, 17);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(J.tr(m.name), r.x + 98, r.y + 56, 76);
  }
  // mesada enharinada
  ctx.fillStyle = alfa('#fbf6ee', 0.55);
  ctx.beginPath();
  ctx.ellipse(CX, CY, 330, 205, 0, 0, TAU);
  ctx.fill();
  const tk = ticketMasa(J);
  // masa
  if (M.hoja) {
    const e = M.hoja.estirado;
    const h = tamHoja(e);
    const col = colorMasa(M.hoja.masa, 0);
    ctx.fillStyle = 'rgba(59,42,32,.15)';
    ctx.beginPath();
    ctx.roundRect(h.x + 6, h.y + 10, h.w, h.h, h.r);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.strokeStyle = C.tinta;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(h.x, h.y, h.w, h.h, h.r);
    ctx.fill();
    ctx.stroke();
    if (e < 1) {
      ctx.fillStyle = alfa(tono(col, 0.4), 0.5);
      ctx.beginPath();
      ctx.ellipse(CX - h.w * 0.18, CY - h.h * 0.2, h.w * 0.18, h.h * 0.1, -0.4, 0, TAU);
      ctx.fill();
    }
    // los cortes ya hechos dejan el hueco
    for (const c of M.hoja.cortes) {
      ctx.save();
      ctx.fillStyle = C.madera3;
      ctx.strokeStyle = tono(col, -0.35);
      ctx.lineWidth = 3;
      caminoCorte(ctx, c.forma, c.x, c.y);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // fantasma del cortador
    if (M.fantasma && M.cortador && e >= 1) {
      const ok = corteValido(M, M.cortador, M.fantasma.x, M.fantasma.y);
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = ok ? C.oliva : C.terracota;
      caminoCorte(ctx, M.cortador, M.fantasma.x, M.fantasma.y);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = C.tinta2;
    ctx.font = F(600, 22);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tk ? (J.lang === 'es' ? '← Elegí la masa' : '← Pick the dough') : J.tr(TXT.nadaParaMasa), CX, CY);
  }
  // donas cortadas que vuelan a la freidora
  for (const v of M.vuelo) {
    const k = v.t / 0.8;
    dona(ctx, v.d, v.x + (1180 - v.x) * k * k, v.y + (700 - v.y) * k * k, 50 * (1 - k * 0.6), { sombra: false });
  }
  // palote
  palote(ctx, M.palo, M.arrastre?.tipo === 'palo', tiene(J.save, 'palote'));
  // cortadores
  for (const { f, r } of cortadores(day)) {
    const sel = M.cortador === f.id;
    panel(ctx, r.x, r.y, r.w, r.h, { radio: 14, fondo: sel ? '#f6e3c8' : C.papel, borde: sel ? C.terracota : C.tinta, grosor: sel ? 4 : 3 });
    ctx.save();
    ctx.strokeStyle = C.acero2;
    ctx.lineWidth = 6;
    const k = f.id === 'baston' ? 0.32 : 0.36;
    ctx.translate(r.x + r.w / 2, r.y + 30);
    ctx.scale(k, k);
    caminoCorte(ctx, f.id, 0, 0);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.tinta;
    ctx.font = F(600, 14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(J.tr(f.name), r.x + r.w / 2, r.y + r.h - 13, r.w - 8);
  }
  if (M.hoja) boton(ctx, BOTON_TIRAR, J.tr(TXT.tirarMasa), { estilo: 'secundario', tam: 18 });
  if (tiene(J.save, 'mesa2')) mesasMasa(ctx, J, M);
  // ticket
  if (tk) {
    const marcas = tk.hechas.map((h, i) => (h ? (h.masa === tk.pedido.donas[i].masa && h.forma === tk.pedido.donas[i].forma ? 'ok' : 'mal') : null));
    ticketGrande(ctx, tk, 1020, 130, 250, 504, { estacion: 'masa', lang: J.lang, marcas });
  } else vacio(ctx, J.tr(TXT.nadaParaMasa));
}

function mesasMasa(ctx, J, M) {
  MESAS.forEach((r, i) => {
    const sel = M.mesa === i;
    const h = M.hojas[i];
    panel(ctx, r.x, r.y, r.w, r.h, { radio: 14, fondo: sel ? '#f6e3c8' : C.papel, borde: sel ? C.terracota : C.tinta, grosor: sel ? 4 : 2.5 });
    ctx.fillStyle = C.tinta;
    ctx.font = F(700, 14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(J.tr(TXT.mesa, { n: i + 1 }), r.x + r.w / 2, r.y + 16);
    if (h) {
      const e = h.estirado;
      const w = 34 + 46 * e;
      const hh = 26 + 26 * e;
      ctx.fillStyle = colorMasa(h.masa, 0);
      ctx.strokeStyle = C.tinta;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(r.x + r.w / 2 - w / 2, r.y + 58 - hh / 2, w, hh, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.madera3;
      for (const c of h.cortes.slice(0, 6)) {
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2 + ((c.x - CX) / HOJA.w) * w, r.y + 58 + ((c.y - CY) / HOJA.h) * hh, 5, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = C.tinta2;
      ctx.font = F(600, 12);
      ctx.fillText(e >= 1 ? J.tr(TXT.estirada) + ' ✓' : Math.round(e * 100) + '%', r.x + r.w / 2, r.y + r.h - 14, r.w - 10);
    } else {
      ctx.fillStyle = C.tinta2;
      ctx.font = F(600, 13);
      ctx.fillText(J.tr(TXT.vacia), r.x + r.w / 2, r.y + 60);
    }
  });
}

function vacio(ctx, texto) {
  panel(ctx, 1020, 130, 250, 504, { fondo: alfa(C.papel, 0.7) });
  ctx.fillStyle = C.tinta2;
  ctx.font = F(600, 17);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 1145, 382, 220);
}

function caminoCorte(ctx, forma, x, y) {
  ctx.beginPath();
  const g = GEOM[forma];
  const r = R_CORTE[forma];
  if (forma === 'baston') {
    const h = g.h * r;
    const l = (g.w - g.h) * r;
    ctx.moveTo(x - l, y - h);
    ctx.lineTo(x + l, y - h);
    ctx.arc(x + l, y, h, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x - l, y + h);
    ctx.arc(x - l, y, h, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.closePath();
  } else {
    ctx.arc(x, y, g.w * r, 0, TAU);
    if (g.hueco) {
      ctx.moveTo(x + g.hueco * r, y);
      ctx.arc(x, y, g.hueco * r, 0, TAU, true);
    }
  }
}

function palote(ctx, y, activo, marmol) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = C.madera2;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(CX + sx * 236 - 30, y - 9, 60, 18, 9);
    ctx.fill();
    ctx.stroke();
  }
  const base = marmol ? '#eceae6' : C.madera3;
  ctx.fillStyle = activo ? tono(base, 0.15) : base;
  ctx.beginPath();
  ctx.roundRect(CX - 210, y - 20, 420, 40, 20);
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (marmol) {
    ctx.strokeStyle = alfa('#8d8780', 0.45);
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 9; k++) {
      ctx.beginPath();
      ctx.moveTo(CX - 200 + k * 48, y - 20);
      ctx.bezierCurveTo(CX - 186 + k * 48, y - 6, CX - 176 + k * 48, y + 6, CX - 160 + k * 48, y + 20);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = alfa(tono(C.madera3, -0.35), 0.3);
    ctx.lineWidth = 1.4;
    for (const k of [-8, 2, 10]) {
      ctx.beginPath();
      ctx.moveTo(CX - 210, y + k);
      ctx.quadraticCurveTo(CX, y + k + 3, CX + 210, y + k);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(42,29,21,.12)';
  ctx.fillRect(CX - 210, y + 6, 420, 14);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(CX - 210, y - 20, 420, 40, 20);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,250,242,.35)';
  ctx.fillRect(CX - 190, y - 12, 380, 6);
  ctx.restore();
}

export function down(J, p) {
  const M = J.masa;
  const day = J.dia.n;
  if (tiene(J.save, 'mesa2'))
    for (let i = 0; i < MESAS.length; i++)
      if (dentroRect(p, MESAS[i])) {
        if (M.mesa !== i) {
          M.hojas[M.mesa] = M.hoja;
          M.mesa = i;
          M.hoja = M.hojas[i];
          M.palo = 186;
          J.snd('click');
        }
        return;
      }
  for (const { m, r } of bins(day))
    if (dentroRect(p, r)) {
      ponerHoja(M, { masa: m.id, estirado: 0, cortes: [] });
      J.snd('masa');
      return;
    }
  for (const { f, r } of cortadores(day))
    if (dentroRect(p, r)) {
      M.cortador = f.id;
      J.snd('click');
      return;
    }
  if (M.hoja && dentroRect(p, BOTON_TIRAR)) {
    ponerHoja(M, null);
    J.snd('tirar');
    return;
  }
  if (!M.hoja) return;
  const h = tamHoja(M.hoja.estirado);
  const sobreMasa = p.x > h.x - 40 && p.x < h.x + h.w + 40 && p.y > Math.min(h.y, 150) - 30 && p.y < h.y + h.h + 30;
  if (M.hoja.estirado < 1) {
    // mientras no está estirada, arrastrar en cualquier parte de la mesada pasa el palote
    if (p.x > 220 && p.x < 960 && p.y > 150 && p.y < 560) {
      M.arrastre = { tipo: 'palo', x: p.x, y: p.y };
      M.palo = Math.max(150, Math.min(560, p.y));
    }
    return;
  }
  // cortar
  if (M.cortador && sobreMasa) cortar(J, p.x, p.y);
}

function cortar(J, x, y) {
  const M = J.masa;
  const tk = ticketMasa(J);
  if (!tk) {
    J.toast(J.tr(TXT.nadaParaMasa));
    return;
  }
  if (!corteValido(M, M.cortador, x, y)) {
    J.snd('no');
    return;
  }
  const d = J.dia.cortar(tk, M.hoja.masa, M.cortador);
  if (!d) return;
  M.hoja.cortes.push({ forma: M.cortador, x, y });
  J.snd('cortar');
  M.vuelo.push({ d, x, y, t: 0 });
  if (J.dia.estadoTicket(tk) !== 'masa') {
    M.enviar = 0.5;
    J.sel.fritura = tk;
  }
}

export function move(J, p) {
  const M = J.masa;
  M.fantasma = M.hoja && M.hoja.estirado >= 1 && M.cortador ? { x: p.x, y: p.y } : null;
  if (M.arrastre?.tipo === 'palo' && M.hoja) {
    const dx = Math.abs(p.x - M.arrastre.x) + Math.abs(p.y - M.arrastre.y) * 0.6;
    M.arrastre.x = p.x;
    M.arrastre.y = p.y;
    M.palo = Math.max(150, Math.min(560, p.y));
    const antes = M.hoja.estirado;
    M.hoja.estirado = Math.min(1, M.hoja.estirado + dx / (tiene(J.save, 'palote') ? 550 : 1100));
    if (Math.floor(antes * 6) !== Math.floor(M.hoja.estirado * 6)) J.snd('estirar');
    if (M.hoja.estirado >= 1 && antes < 1) {
      M.arrastre = null;
      M.palo = 186;
      J.snd('listo');
    }
  }
}

export function up(J) {
  const M = J.masa;
  M.arrastre = null;
  if (!M.hoja || M.hoja.estirado < 1) M.palo = 186;
}

/** Consejo del primer día. */
export function ayuda(J) {
  const M = J.masa;
  const tk = ticketMasa(J);
  if (!tk) return null;
  if (!M.hoja) return { k: 'elegirMasa', x: 200, y: 220, lado: 'izq' };
  if (M.hoja.estirado < 1) return { k: 'estirar', x: CX, y: 150, lado: 'arriba' };
  return { k: 'cortar', x: 420, y: 560, lado: 'abajo' };
}

export { icono };
