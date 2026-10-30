/**
 * La historia como una película corta, dibujada en vivo: cámara que se mueve, personajes que
 * caminan, la puerta y el cartel del local, las llaves que vuelan, el colectivo que se lleva a
 * Julay… Con diálogos en globos y subtítulos que se escriben letra por letra.
 * Hay dos: 'inicio' (cuando empezás) y 'final' (cuando vuelve Julay).
 */
import { C, JULAY, HISTORIA, FINAL, PELI } from './data.js';
import { TAU, tono, azar } from './color.js';
import { persona, altoPersona } from './personas.js';
import { dona, donaIdeal } from './art.js';
import { cartel, salon, mostrador, mesas, LUGARES, T } from './local.js';
import { F, parrafo, burbuja } from './dibujo.js';

export const PW = 1280;
export const PH = 720;
const SUELO = 600; // los pies, en la vereda
const ESCALA = 1.12;

const clamp = (v) => Math.max(0, Math.min(1, v));
const suave = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const entre = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const DONA_ROSA = { masa: 'vainilla', forma: 'anillo', relleno: null, bano: 'frutilla', hilos: null, toppings: ['granas'], pieza: null };

// ------------------------------------------------------------------ el barrio

function cielo(ctx, cam, t) {
  const g = ctx.createLinearGradient(0, 0, 0, 560);
  g.addColorStop(0, '#b7cfd9');
  g.addColorStop(1, '#e6ece2');
  ctx.fillStyle = g;
  ctx.fillRect(cam - 50, -200, PW + 400, 800);
  ctx.fillStyle = '#f6ecd6';
  ctx.beginPath();
  ctx.arc(cam * 0.92 + 1020, 120, 46, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(251,245,234,.92)';
  for (let i = 0; i < 6; i++) {
    const x = cam * 0.85 + ((i * 520 + t * (8 + i * 2)) % 2800) - 300;
    const y = 70 + (i % 3) * 46;
    const s = 1.2 + (i % 2) * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x + 22 * s, y - 14 * s, 22 * s, Math.PI, 0);
    ctx.arc(x + 50 * s, y - 4 * s, 17 * s, Math.PI * 1.2, Math.PI * 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

/** Casas del barrio: una fila lejana (más lenta) y otra cercana. */
function casas(ctx, cam, lejos) {
  const par = lejos ? 0.55 : 1;
  const R = azar(lejos ? 31 : 47);
  const cols = ['#c99274', '#d4a017', '#9aa88a', '#c47a8a', '#b88a5e', '#8fb46e', '#d6c7b0', '#a39d95'];
  ctx.save();
  ctx.translate(cam * (1 - par), 0);
  let x = -200;
  while (x < 3600) {
    const w = 150 + R() * 120;
    const h = lejos ? 200 + R() * 140 : 230 + R() * 120;
    // el local va solo en la fila cercana: ahí se deja el hueco
    if (!lejos && x + w > 1240 && x < 1860) {
      x = 1860;
      continue;
    }
    const col = cols[Math.floor(R() * cols.length)];
    const base = 560;
    ctx.fillStyle = lejos ? tono(col, 0.35) : col;
    ctx.fillRect(x, base - h, w, h);
    ctx.fillStyle = 'rgba(42,29,21,.12)';
    ctx.fillRect(x + w - 16, base - h, 16, h);
    if (!lejos) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.tinta;
      ctx.strokeRect(x, base - h, w, h);
      ctx.fillStyle = tono(col, -0.2);
      ctx.fillRect(x - 6, base - h - 12, w + 12, 14);
      ctx.strokeRect(x - 6, base - h - 12, w + 12, 14);
    }
    ctx.fillStyle = lejos ? 'rgba(251,245,234,.5)' : 'rgba(251,245,234,.8)';
    for (let i = 0; i < Math.floor((w - 20) / 44); i++)
      for (let j = 0; j < Math.floor((h - 70) / 62); j++) {
        ctx.fillRect(x + 20 + i * 44, base - h + 24 + j * 62, 24, 32);
        if (!lejos) {
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 20 + i * 44, base - h + 24 + j * 62, 24, 32);
        }
      }
    x += w + (lejos ? 6 : 14);
  }
  ctx.restore();
}

function vereda(ctx, cam) {
  ctx.fillStyle = '#d6cbbb';
  ctx.fillRect(cam - 50, 560, PW + 400, 80);
  ctx.strokeStyle = '#bdb1a0';
  ctx.lineWidth = 2;
  for (let x = Math.floor((cam - 100) / 90) * 90; x < cam + PW + 200; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 560);
    ctx.lineTo(x - 30, 640);
    ctx.stroke();
  }
  ctx.fillStyle = '#b9ac98';
  ctx.fillRect(cam - 50, 636, PW + 400, 12);
  ctx.fillStyle = '#7d7770';
  ctx.fillRect(cam - 50, 648, PW + 400, 300);
  ctx.fillStyle = '#e9e1cf';
  for (let x = Math.floor((cam - 100) / 160) * 160; x < cam + PW + 200; x += 160) ctx.fillRect(x, 690, 80, 8);
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cam - 50, 560);
  ctx.lineTo(cam + PW + 400, 560);
  ctx.stroke();
}

/**
 * El frente del local (de x0 a x0 + 560). e.puerta: cuánto está abierta. e.cartel: 'ABIERTO' o
 * 'CERRADO' (e.giro: 0..1 mientras se da vuelta). e.texto: lo que dice el cartel grande.
 */
function fachada(ctx, x0, e, t) {
  const toldo = e.toldo || C.terracota;
  const w = 560;
  const top = 200;
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = e.pared || C.pared;
  ctx.fillRect(x0, top, w, 560 - top);
  ctx.strokeRect(x0, top, w, 560 - top);
  ctx.fillStyle = tono(e.pared || C.pared, -0.1);
  ctx.fillRect(x0 - 10, top - 16, w + 20, 18);
  ctx.strokeRect(x0 - 10, top - 16, w + 20, 18);
  // vidriera con donas
  ctx.fillStyle = '#cfe0e6';
  ctx.fillRect(x0 + 30, 360, 300, 170);
  ctx.strokeRect(x0 + 30, 360, 300, 170);
  ctx.fillStyle = C.madera;
  ctx.fillRect(x0 + 30, 470, 300, 14);
  ctx.strokeRect(x0 + 30, 470, 300, 14);
  [['chocolate', 'blanco'], ['vainilla', 'frutilla'], ['vainilla', 'choco'], ['chocolate', 'ddl']].forEach(([m, b], i) => dona(ctx, donaIdeal({ masa: m, forma: 'anillo', relleno: null, bano: b, hilos: null, toppings: i % 2 ? ['granas'] : [], pieza: null }), x0 + 75 + i * 70, 448, 26, { sombra: false }));
  ctx.fillStyle = 'rgba(255,250,242,.25)';
  ctx.beginPath();
  ctx.moveTo(x0 + 60, 530);
  ctx.lineTo(x0 + 120, 360);
  ctx.lineTo(x0 + 145, 360);
  ctx.lineTo(x0 + 85, 530);
  ctx.closePath();
  ctx.fill();
  // toldo de rayas
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? C.crema : toldo;
    const bx = x0 - 14 + i * ((w + 28) / 12);
    const bw = (w + 28) / 12;
    ctx.beginPath();
    ctx.moveTo(bx, 300);
    ctx.lineTo(bx + bw, 300);
    ctx.lineTo(bx + bw, 336);
    ctx.quadraticCurveTo(bx + bw / 2, 350, bx, 336);
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 3;
  ctx.strokeRect(x0 - 14, 300, w + 28, 36);
  // puerta (se abre hacia adentro)
  const dx = x0 + 380;
  const dw = 120;
  ctx.fillStyle = '#4b3a30';
  ctx.fillRect(dx, 360, dw, 200);
  const k = 1 - 0.8 * (e.puerta || 0);
  ctx.fillStyle = C.madera;
  ctx.beginPath();
  ctx.moveTo(dx, 360);
  ctx.lineTo(dx + dw * k, 360 - 8 * (e.puerta || 0));
  ctx.lineTo(dx + dw * k, 560 + 8 * (e.puerta || 0));
  ctx.lineTo(dx, 560);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if ((e.puerta || 0) < 0.5) {
    ctx.fillStyle = '#cfe0e6';
    ctx.fillRect(dx + 16 * k, 376, (dw - 32) * k, 80);
    ctx.strokeRect(dx + 16 * k, 376, (dw - 32) * k, 80);
    // cartelito colgado: se da vuelta
    const giro = e.giro || 0;
    const sx = Math.abs(Math.cos(giro * Math.PI));
    const lado = giro < 0.5 ? e.cartelAntes || e.cartel : e.cartel;
    ctx.save();
    ctx.translate(dx + (dw / 2) * k, 478);
    ctx.scale(sx * k, 1);
    ctx.fillStyle = C.crema;
    ctx.beginPath();
    ctx.roundRect(-44, -14, 88, 28, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = lado === 'CERRADO' ? C.terracota : C.oliva;
    ctx.font = F(700, 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lado === 'CERRADO' ? (e.lang === 'en' ? 'CLOSED' : 'CERRADO') : e.lang === 'en' ? 'OPEN' : 'ABIERTO', 0, 1);
    ctx.restore();
  }
  ctx.strokeRect(dx, 360, dw, 200);
  // el cartel grande arriba
  ctx.save();
  ctx.translate(x0 + w / 2, 250);
  cartel(ctx, 0, 0, e.texto, e.colorCartel || C.terracota);
  ctx.restore();
  ctx.restore();
}

function valija(ctx, x, y, col = C.petroleo, s = 1, conRueditas = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(-38, -66, 76, 62, 8);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-14, -78, 28, 14, 6);
  ctx.stroke();
  ctx.fillStyle = C.mostaza;
  ctx.fillRect(-38, -42, 76, 8);
  ctx.strokeRect(-38, -42, 76, 8);
  // calcomanías de viaje
  ctx.fillStyle = C.crema;
  ctx.beginPath();
  ctx.arc(18, -54, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = C.rosa2;
  ctx.fillRect(-28, -26, 16, 12);
  if (conRueditas) {
    ctx.fillStyle = C.tinta;
    for (const dx of [-24, 24]) {
      ctx.beginPath();
      ctx.arc(dx, -2, 5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function colectivo(ctx, x, y, t, mueve) {
  ctx.save();
  ctx.translate(x, y + (mueve ? Math.sin(t * 18) * 1.5 : 0));
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.tinta;
  ctx.fillStyle = C.mostaza;
  ctx.beginPath();
  ctx.roundRect(-210, -170, 420, 150, [26, 26, 10, 10]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.terracota;
  ctx.fillRect(-210, -70, 420, 18);
  ctx.strokeRect(-210, -70, 420, 18);
  ctx.fillStyle = '#cfe0e6';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.roundRect(-190 + i * 76, -150, 60, 56, 8);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#3f4a3c';
  ctx.beginPath();
  ctx.roundRect(-196, -186, 120, 22, 4);
  ctx.fill();
  ctx.fillStyle = C.mostaza2;
  ctx.font = F(700, 15);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(T('AEROPUERTO', 'AIRPORT'), -136, -175);
  ctx.fillStyle = C.tinta;
  for (const dx of [-130, 130]) {
    ctx.beginPath();
    ctx.arc(dx, -16, 26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.acero;
    ctx.beginPath();
    ctx.arc(dx, -16, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.tinta;
  }
  ctx.restore();
}

function nubePensamiento(ctx, x, y, k) {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = C.papel;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 3;
  for (const [dx, dy, r] of [[0, 0, 50], [42, 8, 36], [-42, 10, 34]]) {
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(8, 12, 46, 0, TAU);
  ctx.fill();
  for (const [dx, dy, r] of [[-40, 70, 10], [-56, 92, 7]]) {
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  dona(ctx, donaIdeal(DONA_ROSA), 4, 8, 30, { sombra: false });
  ctx.restore();
}

/** Globo de diálogo que se escribe solo. k: cuánto del texto se ve (0..1). */
function globo(ctx, texto, x, y, ancho, apunta, k) {
  if (k <= 0) return;
  ctx.save();
  ctx.font = F(600, 26);
  const letras = Math.ceil(texto.length * clamp(k));
  // medir con el texto entero para que el globo no cambie de tamaño
  const lineas = Math.max(1, Math.ceil((ctx.measureText(texto).width + 20) / (ancho - 44)));
  const alto = 30 + lineas * 34;
  const pop = 0.85 + 0.15 * clamp(k * 6);
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  burbuja(ctx, -ancho / 2, -alto, ancho, alto, apunta.x - x, apunta.y - y + 4);
  parrafo(ctx, texto.slice(0, letras), -ancho / 2 + 22, -alto + 15, ancho - 44, 34, { font: F(600, 26) });
  ctx.restore();
}

// ------------------------------------------------------------------ las tomas

/**
 * Cada toma: duración, subtítulo (o null), dibujo y sonidos en momentos justos.
 * El dibujo recibe (ctx, tiempo de la toma, tiempo total, info).
 */
function tomasInicio(info) {
  const yo = info.yo;
  const yoSin = { ...yo, delantal: 'ninguno', placa: '' };
  const julay = JULAY.look;
  const local = { toldo: info.toldo, colorCartel: info.colorCartel, pared: info.pared, lang: info.lang };
  const camara = (ctx, cx, z = 1, cy = 400) => {
    ctx.translate(PW / 2, cy);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
  };
  const barrio = (ctx, cam, t, e) => {
    cielo(ctx, cam, t);
    casas(ctx, cam, true);
    casas(ctx, cam, false);
    fachada(ctx, 1300, { ...local, ...e }, t);
    vereda(ctx, cam);
  };
  return [
    {
      dur: 6.2,
      sub: info.tr(HISTORIA[0]),
      dibujar(ctx, k, t) {
        const cam = lerp(0, 520, suave(k / 6));
        const px = 200 + k * 140;
        ctx.save();
        ctx.translate(-cam, 0);
        barrio(ctx, cam, t, { cartel: 'ABIERTO' });
        valija(ctx, px - 92, SUELO, C.petroleo, 1.05);
        persona(ctx, yoSin, px, SUELO, ESCALA, { t, camina: t, dir: 1, animo: 'encantado' });
        nubePensamiento(ctx, px - 30, SUELO - altoPersona(yo) * ESCALA - 90, suave(entre(k, 3, 3.5)));
        ctx.restore();
      },
    },
    {
      dur: 7.4,
      sub: info.tr(HISTORIA[1]),
      sonidos: [[0.4, 'llega'], [2.8, 'click']],
      dibujar(ctx, k, t) {
        const cam = 980;
        // Julay sale, da vuelta el cartel y camina con su valija
        const sale = entre(k, 0.6, 1.8);
        const jx = k < 2.4 ? lerp(1740, 1700, sale) : lerp(1700, 1560, suave(entre(k, 3.4, 4.8)));
        const puerta = k < 2.2 ? suave(entre(k, 0.2, 0.7)) : 1 - suave(entre(k, 2.0, 2.5));
        const giro = entre(k, 2.6, 3.2);
        // vos llegás por la izquierda
        const px = lerp(960, 1330, suave(entre(k, 3.6, 5.6)));
        ctx.save();
        ctx.translate(-cam, 0);
        barrio(ctx, cam, t, { puerta, cartelAntes: 'ABIERTO', cartel: 'CERRADO', giro });
        const camJ = (k > 0.6 && k < 1.8) || (k > 3.4 && k < 4.8);
        valija(ctx, jx + 88, SUELO, C.terracota, 1.1);
        persona(ctx, julay, jx, SUELO, ESCALA, { t, camina: camJ ? t : undefined, dir: -1, animo: 'feliz', pose: k > 2.5 && k < 3.3 ? 'saluda' : undefined });
        const camYo = k > 3.6 && k < 5.6;
        valija(ctx, px - 92, SUELO, C.petroleo, 1.05);
        persona(ctx, yoSin, px, SUELO, ESCALA, { t, camina: camYo ? t : undefined, dir: 1, animo: k > 5.4 ? 'sorpresa' : 'encantado' });
        ctx.restore();
      },
    },
    {
      dur: 8.4,
      sub: null,
      subDesde: 5.6,
      subTexto: info.tr(PELI.narr3),
      dibujar(ctx, k, t) {
        ctx.save();
        const z = lerp(1.2, 1.5, suave(k / 8.4));
        camara(ctx, 1425, z, 380);
        barrio(ctx, 1425 - PW / 2, t, { cartel: 'CERRADO' });
        valija(ctx, 1608, SUELO, C.terracota, 1.1);
        persona(ctx, julay, 1520, SUELO, ESCALA, { t, animo: k < 3.6 ? 'sorpresa' : 'feliz' });
        valija(ctx, 1238, SUELO, C.petroleo, 1.05);
        const nervios = k > 4 && k < 8;
        persona(ctx, yoSin, 1330, SUELO, ESCALA, { t, animo: nervios ? 'encantado' : 'feliz' });
        const cabeza = SUELO - altoPersona(yo) * ESCALA;
        if (nervios) {
          // gotita de nervios
          ctx.fillStyle = '#9fc6d8';
          ctx.strokeStyle = C.tinta;
          ctx.lineWidth = 2;
          const gy = cabeza + 30 + ((k * 30) % 18);
          ctx.beginPath();
          ctx.moveTo(1376, gy - 12);
          ctx.quadraticCurveTo(1386, gy, 1376, gy + 6);
          ctx.quadraticCurveTo(1366, gy, 1376, gy - 12);
          ctx.fill();
          ctx.stroke();
        }
        if (k < 3.8) globo(ctx, info.tr(PELI.julay1), 1560, cabeza - 30, 420, { x: 1530, y: cabeza + 10 }, entre(k, 0.4, 2.4));
        else globo(ctx, info.tr(PELI.yo1), 1300, cabeza - 30, 340, { x: 1320, y: cabeza + 10 }, entre(k, 4, 5));
        ctx.restore();
      },
    },
    {
      dur: 8.6,
      sub: null,
      sonidos: [[1.3, 'pedido'], [2.9, 'listo']],
      dibujar(ctx, k, t) {
        ctx.save();
        camara(ctx, 1425, 1.3, 380);
        barrio(ctx, 1425 - PW / 2, t, { cartel: 'CERRADO' });
        const cabeza = SUELO - altoPersona(yo) * ESCALA;
        valija(ctx, 1608, SUELO, C.terracota, 1.1);
        persona(ctx, julay, 1520, SUELO, ESCALA, { t, animo: 'encantado', pose: k < 1.4 ? 'llaves' : undefined });
        // las llaves vuelan de una mano a la otra
        const kv = entre(k, 1.2, 2.1);
        if (kv > 0 && kv < 1) {
          const x = lerp(1470, 1372, kv);
          const y = lerp(SUELO - 160, SUELO - 128, kv) - Math.sin(kv * Math.PI) * 120;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(kv * 8);
          ctx.strokeStyle = C.mostaza;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, TAU);
          ctx.moveTo(8, 6);
          ctx.lineTo(28, 18);
          ctx.stroke();
          ctx.restore();
        }
        // el delantal aparece en un ¡paf!
        const kd = entre(k, 2.6, 3.0);
        const conDelantal = k > 2.8;
        valija(ctx, 1238, SUELO, C.petroleo, 1.05);
        persona(ctx, conDelantal ? yo : yoSin, 1330, SUELO, ESCALA, { t, animo: k > 2.1 ? 'encantado' : 'sorpresa', pose: k > 2.0 && k < 2.6 ? 'saluda' : undefined });
        if (kd > 0 && kd < 1) {
          ctx.fillStyle = C.mostaza;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            const r = 70 + kd * 70;
            ctx.save();
            ctx.translate(1330 + Math.cos(a) * r, SUELO - 160 + Math.sin(a) * r * 0.8);
            ctx.rotate(a);
            ctx.globalAlpha = 1 - kd;
            ctx.fillRect(-8, -3, 16, 6);
            ctx.restore();
          }
        }
        globo(ctx, info.tr(PELI.julay2), 1580, cabeza - 40, 520, { x: 1530, y: cabeza + 10 }, entre(k, 3.4, 6.6));
        ctx.restore();
      },
    },
    {
      dur: 10.4,
      sub: null,
      sonidos: [[3.6, 'llega'], [7.2, 'aFreir'], [9.3, 'listo']],
      dibujar(ctx, k, t) {
        const cam = 980;
        ctx.save();
        ctx.translate(-cam, 0);
        // Julay se despide y camina hasta la parada; llega el colectivo y se la lleva
        const kj = suave(entre(k, 3.4, 5.6));
        const jx = lerp(1520, 2100, kj);
        const bx = k < 5.8 ? lerp(2700, 2160, suave(entre(k, 3.6, 5.6))) : lerp(2160, 2900, Math.pow(entre(k, 6.6, 8.2), 2));
        const giro = entre(k, 8.8, 9.4);
        const px = lerp(1330, 1690, suave(entre(k, 7.2, 8.8)));
        barrio(ctx, cam, t, { cartelAntes: 'CERRADO', cartel: 'ABIERTO', giro });
        const cabeza = SUELO - altoPersona(yo) * ESCALA;
        if (k < 6.2) {
          valija(ctx, jx + 88, SUELO, C.terracota, 1.1);
          persona(ctx, julay, jx, SUELO, ESCALA, { t, camina: kj > 0 && kj < 1 ? t : undefined, dir: 1, animo: 'encantado', pose: k < 3.2 || k > 5.6 ? 'saluda' : undefined });
        }
        colectivo(ctx, bx, 660, t, (k > 3.6 && k < 5.6) || k > 6.6);
        if (k > 5.9 && k < 8.2) {
          // Julay saluda desde la ventanilla
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(bx - 190 + 2 * 76, 510, 60, 56, 8);
          ctx.clip();
          persona(ctx, julay, bx - 160 + 2 * 76 + 20, 660, 0.5, { t, animo: 'encantado', pose: 'saluda' });
          ctx.restore();
        }
        persona(ctx, yo, px, SUELO, ESCALA, { t, camina: k > 7.2 && k < 8.8 ? t : undefined, dir: 1, animo: 'encantado', pose: k > 5.8 && k < 7.2 ? 'saluda' : undefined });
        globo(ctx, info.tr(PELI.julay3), Math.min(jx, 1900) + 40, cabeza - 40, 520, { x: Math.min(jx, 1900), y: cabeza + 10 }, k < 3.4 ? entre(k, 0.2, 2.8) : 0);
        ctx.restore();
      },
    },
    {
      dur: 4.6,
      sub: null,
      sonidos: [[0.3, 'dia']],
      dibujar(ctx, k, t) {
        ctx.save();
        const z = lerp(1.0, 1.9, suave(entre(k, 0, 2.2)));
        camara(ctx, 1580, z, 250 + 150 * (1 - suave(entre(k, 0, 2.2))));
        barrio(ctx, 1580 - PW / 2, t, { cartel: 'ABIERTO' });
        ctx.restore();
        const kt = entre(k, 1.6, 2.3);
        if (kt > 0) {
          ctx.save();
          ctx.globalAlpha = kt;
          ctx.fillStyle = 'rgba(43,33,27,.45)';
          ctx.fillRect(0, 470, PW, 120);
          ctx.fillStyle = C.crema;
          ctx.font = F(700, 52);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(info.lang === 'en' ? 'Your first day!' : '¡Tu primer día!', PW / 2, 530 + (1 - kt) * 20);
          ctx.restore();
        }
      },
    },
  ];
}

function tomasFinal(info) {
  const yo = info.yo;
  const julay = { ...JULAY.look };
  const local = { toldo: info.toldo, colorCartel: info.colorCartel, pared: info.pared, lang: info.lang };
  return [
    {
      dur: 9.5,
      sub: null,
      sonidos: [[0.5, 'llega'], [5.2, 'feliz']],
      dibujar(ctx, k, t) {
        // adentro del local: entra Julay con la valija llena de calcomanías
        ctx.save();
        salon(ctx, info.deco, t, { campana: Math.max(0, 1 - Math.abs(k - 0.8)), puerta: k < 2.4 ? suave(entre(k, 0.3, 0.8)) : 1 - suave(entre(k, 2.2, 2.8)) });
        mesas(ctx, info.deco);
        persona(ctx, yo, LUGARES.empleado.x, LUGARES.empleado.y, 1, { t, animo: 'encantado', pose: k > 1 && k < 2.5 ? 'saluda' : undefined });
        mostrador(ctx, info.deco, t, { monedas: info.monedas });
        const kj = suave(entre(k, 0.8, 3.2));
        const jx = lerp(58, 640, kj);
        const jy = lerp(506, 636, kj);
        const s = 0.8 + 0.2 * kj;
        valija(ctx, jx - 80 * s, jy, C.terracota, s);
        persona(ctx, julay, jx, jy, s, { t, camina: kj > 0 && kj < 1 ? t : undefined, dir: 1, animo: k > 4.6 ? 'encantado' : 'feliz' });
        // prueba una dona y llora de felicidad
        if (k > 3.6) {
          const dz = suave(entre(k, 3.6, 4.4));
          dona(ctx, donaIdeal({ masa: 'chocolate', forma: 'anillo', relleno: null, bano: 'ddl', hilos: 'blanco', toppings: ['granas'], pieza: { id: 'frutilla', n: 4 } }), lerp(900, 700, dz), lerp(400, 470, dz), 34);
        }
        if (k > 4.8) {
          ctx.fillStyle = '#9fc6d8';
          const cy = jy - altoPersona(julay) + 70;
          for (const dx of [-14, 14]) {
            ctx.beginPath();
            ctx.ellipse(jx + dx, cy + ((t * 40) % 24), 4, 7, 0, 0, TAU);
            ctx.fill();
          }
        }
        globo(ctx, info.tr(FINAL[0]).replace(/^—/, ''), 560, 250, 560, { x: jx, y: jy - altoPersona(julay) - 4 }, entre(k, 5, 8.2));
        ctx.restore();
      },
    },
    {
      dur: 8.5,
      sub: null,
      sonidos: [[0.3, 'logro']],
      dibujar(ctx, k, t) {
        const cam = 980;
        ctx.save();
        ctx.translate(-cam, 0);
        cielo(ctx, cam, t);
        casas(ctx, cam, true);
        casas(ctx, cam, false);
        fachada(ctx, 1300, { ...local, cartel: 'ABIERTO', texto: 'Julay’s Donas ★' }, t);
        vereda(ctx, cam);
        persona(ctx, julay, 1460, SUELO, ESCALA, { t, animo: 'encantado', pose: 'saluda' });
        persona(ctx, yo, 1680, SUELO, ESCALA, { t: t + 1, animo: 'encantado', pose: 'saluda' });
        const cabeza = SUELO - altoPersona(julay) * ESCALA;
        globo(ctx, info.tr(FINAL[1]).replace(/^—/, ''), 1560, cabeza - 40, 600, { x: 1470, y: cabeza + 10 }, entre(k, 0.6, 3.8));
        ctx.restore();
        const cols = [C.terracota, C.mostaza, C.oliva, C.petroleo, C.rosa];
        for (let i = 0; i < 70; i++) {
          const x = (i * 97 + t * 40 * (1 + (i % 3))) % PW;
          const y = ((i * 53 + k * 140 * (1 + (i % 2))) % (PH + 40)) - 20;
          ctx.fillStyle = cols[i % 5];
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 3 + i);
          ctx.fillRect(-7, -3.5, 14, 7);
          ctx.restore();
        }
      },
    },
  ];
}

export function tomas(cual, info) {
  return cual === 'final' ? tomasFinal(info) : tomasInicio(info);
}

/** Dibuja la película en el tiempo `tiempo` (segundos desde que empezó). Devuelve en qué toma va. */
export function dibujarPelicula(ctx, lista, tiempo, tReal) {
  let t0 = 0;
  let i = 0;
  while (i < lista.length - 1 && tiempo >= t0 + lista[i].dur) t0 += lista[i++].dur;
  const toma = lista[i];
  const k = Math.min(tiempo - t0, toma.dur);
  ctx.save();
  ctx.fillStyle = '#2b211b';
  ctx.fillRect(0, 0, PW, PH);
  ctx.beginPath();
  ctx.rect(0, 0, PW, PH);
  ctx.clip();
  toma.dibujar(ctx, k, tReal);
  // fundido a negro entre tomas
  const borde = Math.min(k / 0.35, (toma.dur - k) / 0.35);
  if (borde < 1) {
    ctx.fillStyle = `rgba(43,33,27,${1 - Math.max(0, borde)})`;
    ctx.fillRect(0, 0, PW, PH);
  }
  // subtítulo
  const sub = toma.sub || (toma.subTexto && k >= toma.subDesde ? toma.subTexto : null);
  if (sub) {
    const desde = toma.sub ? 0.3 : toma.subDesde;
    const letras = Math.ceil(sub.length * clamp((k - desde) / Math.max(1.5, sub.length / 34)));
    ctx.fillStyle = 'rgba(43,33,27,.72)';
    ctx.fillRect(0, PH - 116, PW, 116);
    parrafo(ctx, sub.slice(0, letras), 90, PH - 96, PW - 180, 36, { font: F(600, 28), color: C.crema });
  }
  ctx.restore();
  const total = lista.reduce((a, x) => a + x.dur, 0);
  return { i, k, t0, total, fin: tiempo >= total };
}

/** Desde qué segundo empieza cada toma (para saltar a la siguiente). */
export function inicioDeToma(lista, i) {
  return lista.slice(0, i).reduce((a, x) => a + x.dur, 0);
}

