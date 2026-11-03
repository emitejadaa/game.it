/**
 * Personas: tu personaje y los clientes. Dibujo de frente con contorno marrón y colores lisos, con una
 * sombra suave del lado derecho de cada parte (ropa, piel, pelo) para que tengan volumen. Caminan
 * levantando los pies y moviendo los brazos, respiran, parpadean y mueven un poco la cabeza.
 */
import { C, PIELES, PELOS, OJOS } from './data.js';
import { TAU, tono, alfa } from './color.js';

export const CUERPOS = {
  adulto: { piernas: 78, torso: 96, ancho: 70, cabeza: 40 },
  alto: { piernas: 94, torso: 104, ancho: 68, cabeza: 39 },
  robusto: { piernas: 72, torso: 98, ancho: 92, cabeza: 42 },
  nene: { piernas: 50, torso: 68, ancho: 56, cabeza: 40 },
};

/** Prendas de arriba con manga larga (las demás tienen manga corta, salvo la musculosa). */
const MANGA_LARGA = new Set(['camisa', 'buzo', 'saco', 'guardapolvo', 'chaqueta', 'heroe', 'bombero', 'chal', 'polera']);
const SIN_MANGA = new Set(['musculosa']);

/** Cómo empieza tu personaje (y lo que se completa en partidas viejas). */
export const LOOK_BASE = {
  genero: 'mujer',
  body: 'adulto',
  skin: 2,
  eyes: 'punto',
  eyeColor: 'marron',
  hair: 'corto',
  hairColor: 'castano',
  beard: null,
  glasses: null,
  freckles: false,
  earrings: false,
  style: 'remera',
  shirt: '#d4a017',
  estampa: 'liso',
  shirt2: '#f4ead8',
  abajo: 'pantalon',
  pants: '#3b2a20',
  calzado: 'zapatillas',
  shoes: '#c8553d',
  delantal: 'pechera',
  apron: '#f4ead8',
  apronEstampa: 'liso',
  apron2: '#c8553d',
  hat: null,
  hatColor: '#c8553d',
  cuello: null,
  cuelloColor: '#c8553d',
};

/** Completa lo que le falta a un personaje guardado con una versión anterior del juego. */
export function completarLook(l = {}) {
  const o = { ...LOOK_BASE, ...l };
  if (!l.genero) o.genero = l.beard ? 'hombre' : 'mujer';
  if (!l.delantal) o.delantal = l.apron === null ? 'ninguno' : 'pechera';
  if (!o.apron) o.apron = LOOK_BASE.apron;
  return o;
}

/** Tu personaje tal como se dibuja: completo y con tu nombre en la plaquita. */
export const lookJugador = (save) => ({ ...completarLook(save.look), placa: save.nombre || '' });

/** Alto total aproximado de una persona (de los pies a la coronilla), a escala 1. */
export function altoPersona(look) {
  const b = CUERPOS[look.body] || CUERPOS.adulto;
  return b.piernas + b.torso + 8 + b.cabeza * 2;
}

const SOMBRA = 'rgba(42,29,21,';

/**
 * Persona de frente con los pies en (x, y) y escala s.
 * o.animo: 'feliz' | 'normal' | 'molesto' | 'enojado' | 'encantado' | 'sorpresa'
 * o.t: tiempo (para parpadear y respirar). o.camina: fase de caminata (segundos caminando).
 * o.dir: hacia dónde camina (-1 izquierda, 1 derecha). o.pose: 'saluda' | 'anota' | 'valija' | 'llaves' | 'brazos'
 * o.quieto: sin respirar ni mover la cabeza (retratos).
 */
export function persona(ctx, look, x, y, s, o = {}) {
  const b = CUERPOS[look.body] || CUERPOS.adulto;
  const t = o.t || 0;
  const seed = (look.skin || 0) * 7 + (look.hair || '').length * 3 + (look.shirt || '###').charCodeAt(2);
  const camina = o.camina !== undefined;
  const ph = camina ? o.camina * 9 : 0;
  const resp = o.quieto ? 0 : Math.sin(t * 2.2 + seed) * 1.2;
  const salto = camina ? Math.abs(Math.sin(ph)) * 3.2 : 0;
  const piel = PIELES[look.skin || 0] || PIELES[0];
  const pelo = PELOS[look.hairColor] || PELOS.castano;
  const g = look.genero;
  const lw = 3;
  ctx.save();
  ctx.translate(x, y - salto * s);
  ctx.scale(s, s);
  // al caminar se inclina un poquito para donde va
  if (camina && o.dir) ctx.rotate(o.dir * 0.035);
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.tinta;
  const cadera = -b.piernas;
  const hombro = cadera - b.torso + resp;
  const cuello = hombro - 6;
  const R = b.cabeza;
  const cy = cuello - R * 0.92;
  const w = b.ancho;
  // silueta: hombros, cintura y cadera
  const ws = g === 'mujer' ? w * 0.88 : g === 'hombre' ? w * 1.04 : w;
  const ww = g === 'mujer' ? w * 0.74 : g === 'hombre' ? w * 0.94 : w;
  const wh = g === 'mujer' ? w * 0.92 : g === 'hombre' ? w * 0.94 : w;

  /** Rellena una forma, le pone la sombra del lado derecho y el contorno. */
  const forma = (camino, color, sombra = 0.13, d = 7) => {
    ctx.beginPath();
    camino(0);
    ctx.fillStyle = color;
    ctx.fill();
    if (sombra) {
      ctx.save();
      ctx.beginPath();
      camino(0);
      ctx.clip();
      ctx.beginPath();
      ctx.rect(-600, -900, 1200, 1100);
      camino(-d);
      ctx.fillStyle = SOMBRA + sombra + ')';
      ctx.fill('evenodd');
      ctx.restore();
    }
    ctx.beginPath();
    camino(0);
    ctx.stroke();
  };
  /** Estampado (rayas, lunares, cuadros, flores) recortado a una forma. */
  const estampar = (camino, tipo, color) => {
    if (!tipo || tipo === 'liso') return;
    ctx.save();
    ctx.beginPath();
    camino(0);
    ctx.clip();
    dibujarEstampa(ctx, tipo, color, -150, -420, 300, 460);
    ctx.restore();
  };

  // capa (atrás de todo)
  if (look.cape) {
    forma(() => {
      ctx.moveTo(-w * 0.5, hombro + 4);
      ctx.quadraticCurveTo(-w * 0.95, cadera, -w * 0.8, -12);
      ctx.lineTo(w * 0.8, -12);
      ctx.quadraticCurveTo(w * 0.95, cadera, w * 0.5, hombro + 4);
      ctx.closePath();
    }, look.cape, 0.1);
  }
  // capucha del buzo (atrás de la cabeza)
  if (look.style === 'buzo' && !look.headband) {
    forma((dx) => ctx.ellipse(dx, cuello + 4, R * 0.95, R * 0.42, 0, 0, TAU), tono(look.shirt, -0.12), 0.12);
  }
  // pelo de atrás
  peloAtras(ctx, look.hair, pelo, cy, R, t, camina);

  // ------------------------------------------------ piernas y calzado
  const vestido = look.style === 'vestido';
  const abajo = vestido ? 'vestido' : look.abajo || 'pantalon';
  const colPant = look.pants || '#4b3d33';
  const piernaLarga = b.piernas - 6;
  for (const sx of [-1, 1]) {
    const lx = sx * wh * 0.2;
    // al caminar, una pierna se levanta mientras la otra apoya
    const lev = camina ? Math.max(0, Math.sin(ph) * sx) * 7 : 0;
    const ang = camina ? Math.sin(ph) * 0.13 * (o.dir || 1) * -sx * 0.5 : 0;
    ctx.save();
    ctx.translate(lx, cadera);
    ctx.rotate(ang);
    const L = piernaLarga - lev;
    const pierna = (dx) => ctx.roundRect(dx - 11, -4, 22, L, 9);
    if (abajo === 'short' || abajo === 'pollera' || abajo === 'vestido') {
      forma(pierna, piel, 0.1, 5);
      if (abajo === 'short') {
        forma((dx) => ctx.roundRect(dx - 12, -6, 24, L * 0.46, [6, 6, 4, 4]), colPant, 0.12, 5);
      }
    } else {
      forma(pierna, colPant, 0.13, 6);
      if (abajo === 'jean') {
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = tono(colPant, -0.35);
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(-sx * 3, 4);
        ctx.lineTo(-sx * 3, L - 10);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = tono(colPant, 0.18);
        ctx.fillRect(-10, L - 14, 20, 5);
        ctx.restore();
      }
    }
    zapato(ctx, look.calzado, look.shoes || C.tinta2, sx, L - 3, forma);
    ctx.restore();
  }
  // pollera y vestido (sobre las piernas)
  const falda = (largo) => (dx) => {
    ctx.moveTo(dx - wh * 0.44, cadera - 8);
    ctx.lineTo(dx + wh * 0.44, cadera - 8);
    ctx.quadraticCurveTo(dx + wh * 0.66, cadera + largo * 0.6, dx + wh * 0.7, cadera + largo);
    ctx.quadraticCurveTo(dx, cadera + largo + 8, dx - wh * 0.7, cadera + largo);
    ctx.quadraticCurveTo(dx - wh * 0.66, cadera + largo * 0.6, dx - wh * 0.44, cadera - 8);
    ctx.closePath();
  };
  if (abajo === 'pollera') {
    const f = falda(b.piernas * 0.46);
    forma(f, colPant, 0.12);
    estampar(f, look.estampaAbajo, look.shirt2);
  }

  // ------------------------------------------------ brazos (atrás del torso, salvo las poses)
  const larga = MANGA_LARGA.has(look.style);
  const sinManga = SIN_MANGA.has(look.style);
  const colManga = look.style === 'guardapolvo' ? '#f6f0e6' : look.shirt;
  const L = b.torso * 0.88;
  const brazo = (sx, ang) => {
    ctx.save();
    ctx.translate(sx * (ws * 0.5 + 1), hombro + 10);
    ctx.rotate(ang);
    const bz = (dx) => ctx.roundRect(dx - 9, -6, 18, L, 9);
    if (larga) {
      forma(bz, colManga, 0.14, 5);
      estampar(bz, look.estampa, look.shirt2);
      ctx.beginPath();
      ctx.roundRect(-10, L - 14, 20, 8, 3);
      ctx.fillStyle = tono(colManga, -0.12);
      ctx.fill();
      ctx.stroke();
    } else {
      forma(bz, piel, 0.12, 5);
      if (!sinManga) {
        const mg = (dx) => ctx.roundRect(dx - 10, -8, 20, L * 0.36, 9);
        forma(mg, colManga, 0.14, 5);
        estampar(mg, look.estampa, look.shirt2);
      }
    }
    // mano
    forma((dx) => ctx.arc(dx, L, 9.5, 0, TAU), piel, 0.12, 4);
    ctx.restore();
  };
  const pose = o.pose;
  const balanceo = camina ? Math.sin(ph) * 0.22 : Math.sin(t * 1.3 + seed) * 0.02;
  if (pose === 'brazos') {
    brazo(-1, 0.55);
    brazo(1, -0.55);
  } else {
    brazo(-1, pose === 'valija' ? 0.05 : 0.12 + balanceo);
    if (pose !== 'saluda' && pose !== 'anota' && pose !== 'llaves') brazo(1, -0.12 + balanceo);
  }

  // ------------------------------------------------ cuello (atrás del torso: solo asoma entre la cara y la ropa)
  forma((dx) => ctx.roundRect(dx - 10, cuello - 6, 20, 18, 5), piel, 0.1, 4);

  // ------------------------------------------------ torso
  const yw = hombro + (cadera - hombro) * 0.6;
  const abajoTorso = cadera + 6;
  const torso = (dx) => {
    ctx.moveTo(dx - ws / 2 + 14, hombro);
    ctx.lineTo(dx + ws / 2 - 14, hombro);
    ctx.quadraticCurveTo(dx + ws / 2, hombro, dx + ws / 2, hombro + 16);
    ctx.quadraticCurveTo(dx + ww / 2, yw, dx + wh / 2, abajoTorso - 9);
    ctx.quadraticCurveTo(dx + wh / 2, abajoTorso, dx + wh / 2 - 9, abajoTorso);
    ctx.lineTo(dx - wh / 2 + 9, abajoTorso);
    ctx.quadraticCurveTo(dx - wh / 2, abajoTorso, dx - wh / 2, abajoTorso - 9);
    ctx.quadraticCurveTo(dx - ww / 2, yw, dx - ws / 2, hombro + 16);
    ctx.quadraticCurveTo(dx - ws / 2, hombro, dx - ws / 2 + 14, hombro);
    ctx.closePath();
  };
  const colTorso = look.style === 'guardapolvo' ? '#f6f0e6' : look.shirt;
  forma(torso, colTorso, 0.13, 9);
  estampar(torso, look.estampa, look.shirt2);
  if (look.style === 'musculosa') {
    // hombros al aire
    ctx.save();
    ctx.beginPath();
    torso(0);
    ctx.clip();
    ctx.fillStyle = piel;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * ws * 0.5, hombro + 2, ws * 0.2, 20, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  ropa(ctx, look, w, ws, hombro, cadera, b, piel);
  if (vestido) {
    const f = falda(b.piernas * 0.5);
    forma(f, look.shirt, 0.12);
    estampar(f, look.estampa, look.shirt2);
  }
  if (look.style === 'guardapolvo') {
    forma((dx) => ctx.roundRect(dx - wh * 0.52, cadera - 10, wh * 1.04, b.piernas * 0.42, [4, 4, 10, 10]), '#f6f0e6', 0.1);
  }

  // ------------------------------------------------ delantal y plaquita con el nombre
  const tipoDelantal = look.apron ? look.delantal || 'pechera' : 'ninguno';
  let placaEn = null;
  if (tipoDelantal === 'pechera') {
    const pechera = (dx) => {
      ctx.moveTo(dx - ws * 0.34, hombro + 14);
      ctx.lineTo(dx + ws * 0.34, hombro + 14);
      ctx.lineTo(dx + ws * 0.36, hombro + 40);
      ctx.lineTo(dx + wh * 0.46, cadera + 28);
      ctx.quadraticCurveTo(dx, cadera + 33, dx - wh * 0.46, cadera + 28);
      ctx.lineTo(dx - ws * 0.36, hombro + 40);
      ctx.closePath();
    };
    // tiras del cuello
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = tono(look.apron, -0.2);
    ctx.beginPath();
    ctx.moveTo(-ws * 0.28, hombro + 15);
    ctx.lineTo(-9, cuello + 4);
    ctx.moveTo(ws * 0.28, hombro + 15);
    ctx.lineTo(9, cuello + 4);
    ctx.stroke();
    ctx.restore();
    forma(pechera, look.apron, 0.12, 8);
    estampar(pechera, look.apronEstampa, look.apron2);
    // bolsillo
    forma((dx) => ctx.roundRect(dx - ws * 0.2, cadera - 20, ws * 0.4, 22, 5), tono(look.apron, -0.1), 0.1, 4);
    placaEn = { x: 0, y: hombro + 31 };
  } else if (tipoDelantal === 'cintura') {
    const cint = (dx) => ctx.roundRect(dx - wh * 0.5, cadera - 22, wh, b.piernas * 0.5, [4, 4, 12, 12]);
    forma(cint, look.apron, 0.12, 8);
    estampar(cint, look.apronEstampa, look.apron2);
    ctx.beginPath();
    ctx.roundRect(-wh * 0.54, cadera - 26, wh * 1.08, 9, 4);
    ctx.fillStyle = tono(look.apron, -0.2);
    ctx.fill();
    ctx.stroke();
    placaEn = { x: ws * 0.2, y: hombro + 26 };
  } else if (look.placa) placaEn = { x: ws * 0.2, y: hombro + 26 };
  if (look.placa && placaEn) placa(ctx, look.placa, placaEn.x, placaEn.y);

  // ------------------------------------------------ brazos de las poses
  if (pose === 'saluda') brazo(1, -2.5 + Math.sin(t * 9) * 0.25);
  if (pose === 'llaves') {
    brazo(1, -1.2);
    ctx.save();
    ctx.translate(ws * 0.5 + 1 + Math.cos(-1.2 + Math.PI / 2) * L, hombro + 10 + Math.sin(-1.2 + Math.PI / 2) * L);
    ctx.strokeStyle = C.mostaza;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(10, 6, 7, 0, TAU);
    ctx.moveTo(16, 10);
    ctx.lineTo(30, 18);
    ctx.stroke();
    ctx.restore();
  }
  if (pose === 'anota') {
    ctx.save();
    ctx.translate(ws * 0.12, hombro + b.torso * 0.46);
    ctx.rotate(-0.12);
    ctx.beginPath();
    ctx.roundRect(-18, -24, 36, 44, 4);
    ctx.fillStyle = '#fbf5ea';
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-11, -14 + i * 9);
      ctx.lineTo(8 - (i % 2) * 6, -14 + i * 9);
      ctx.stroke();
    }
    ctx.lineWidth = lw;
    forma((dx) => ctx.arc(dx + 14, 14, 9.5, 0, TAU), piel, 0.12, 4);
    ctx.restore();
  }

  // ------------------------------------------------ cuello, bufanda y collares
  if (look.style === 'polera') {
    forma((dx) => ctx.roundRect(dx - 13, cuello - 4, 26, 15, 6), tono(look.shirt, -0.06), 0.12, 4);
  }
  const cu = look.cuello;
  const colCu = look.cuelloColor || C.terracota;
  if (look.scarf || cu === 'bufanda') {
    const col = look.scarf || colCu;
    forma((dx) => ctx.roundRect(dx - ws * 0.34, cuello + 2, ws * 0.68, 16, 8), col, 0.12);
    forma((dx) => ctx.roundRect(dx + ws * 0.08, cuello + 10, 15, 42, 6), col, 0.12, 4);
  }
  if (cu === 'panuelo') {
    forma((dx) => {
      ctx.moveTo(dx - 17, cuello + 4);
      ctx.lineTo(dx + 17, cuello + 4);
      ctx.lineTo(dx, cuello + 28);
      ctx.closePath();
    }, colCu, 0.1, 4);
    ctx.beginPath();
    ctx.arc(0, cuello + 7, 4, 0, TAU);
    ctx.fillStyle = tono(colCu, -0.15);
    ctx.fill();
    ctx.stroke();
  }
  if (look.necklace || cu === 'collar') {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.fillStyle = cu === 'collar' ? colCu : '#fbf5ea';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(i * 5.5, cuello + 12 + Math.abs(i) * -1.2 + 3, 3, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  if (look.bow || cu === 'mono') {
    forma(() => {
      ctx.moveTo(0, cuello + 9);
      ctx.lineTo(-12, cuello + 2);
      ctx.lineTo(-12, cuello + 16);
      ctx.closePath();
      ctx.moveTo(0, cuello + 9);
      ctx.lineTo(12, cuello + 2);
      ctx.lineTo(12, cuello + 16);
      ctx.closePath();
    }, look.bow || colCu, 0);
    ctx.beginPath();
    ctx.arc(0, cuello + 9, 3.5, 0, TAU);
    ctx.fillStyle = tono(look.bow || colCu, -0.2);
    ctx.fill();
    ctx.stroke();
  }

  // ------------------------------------------------ cabeza (con un leve movimiento)
  ctx.save();
  const giro = o.quieto ? 0 : Math.sin(t * 0.8 + seed) * 0.035 + (camina ? Math.sin(ph) * 0.03 : 0);
  ctx.translate(0, cuello);
  ctx.rotate(giro);
  ctx.translate(0, -cuello);
  for (const sx of [-1, 1]) {
    forma((dx) => ctx.arc(dx + sx * R * 0.96, cy + R * 0.08, R * 0.2, 0, TAU), piel, sx > 0 ? 0.14 : 0, 4);
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (sx > 0) ctx.arc(R * 0.98, cy + R * 0.08, R * 0.09, -1.0, 1.0);
    else ctx.arc(-R * 0.98, cy + R * 0.08, R * 0.09, Math.PI - 1.0, Math.PI + 1.0);
    ctx.stroke();
    ctx.restore();
    if (look.earrings) {
      ctx.beginPath();
      ctx.arc(sx * R * 0.98, cy + R * 0.38, 3.5, 0, TAU);
      ctx.fillStyle = C.mostaza;
      ctx.fill();
      ctx.stroke();
    }
  }
  forma((dx) => ctx.ellipse(dx, cy, R, R * 1.04, 0, 0, TAU), piel, 0.11, R * 0.22);
  cara(ctx, look, o.animo || 'feliz', cy, R, t, seed, pelo);
  peloAdelante(ctx, look.hair, pelo, cy, R, forma);
  sombrero(ctx, look, cy, R, t, forma);
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------ partes

function dibujarEstampa(ctx, tipo, color, x, y, w, h) {
  ctx.fillStyle = color;
  if (tipo === 'rayas') {
    for (let yy = y; yy < y + h; yy += 14) ctx.fillRect(x, yy, w, 6);
  } else if (tipo === 'lunares') {
    for (let yy = y, f = 0; yy < y + h; yy += 14, f++)
      for (let xx = x + (f % 2) * 7; xx < x + w; xx += 14) {
        ctx.beginPath();
        ctx.arc(xx, yy, 3.2, 0, TAU);
        ctx.fill();
      }
  } else if (tipo === 'cuadros') {
    ctx.globalAlpha = 0.45;
    for (let xx = x; xx < x + w; xx += 18) ctx.fillRect(xx, y, 7, h);
    for (let yy = y; yy < y + h; yy += 18) ctx.fillRect(x, yy, w, 7);
    ctx.globalAlpha = 1;
  } else if (tipo === 'flores') {
    for (let yy = y, f = 0; yy < y + h; yy += 22, f++)
      for (let xx = x + (f % 2) * 11; xx < x + w; xx += 22) {
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.arc(xx + Math.cos((k / 5) * TAU) * 3.4, yy + Math.sin((k / 5) * TAU) * 3.4, 2.6, 0, TAU);
          ctx.fill();
        }
      }
  } else if (tipo === 'corazones') {
    for (let yy = y, f = 0; yy < y + h; yy += 20, f++)
      for (let xx = x + (f % 2) * 10; xx < x + w; xx += 20) {
        ctx.beginPath();
        ctx.moveTo(xx, yy + 3);
        ctx.bezierCurveTo(xx - 6, yy - 2, xx - 3, yy - 6, xx, yy - 2.5);
        ctx.bezierCurveTo(xx + 3, yy - 6, xx + 6, yy - 2, xx, yy + 3);
        ctx.fill();
      }
  }
}

function zapato(ctx, tipo, color, sx, y, forma) {
  if (tipo === 'botas') {
    forma((dx) => {
      ctx.moveTo(dx - 12, y - 22);
      ctx.lineTo(dx + 12, y - 22);
      ctx.lineTo(dx + 12, y - 4);
      ctx.quadraticCurveTo(dx + 12 + sx * 8, y - 4, dx + 13 + sx * 8, y + 3);
      ctx.lineTo(dx - 13 + sx * 3, y + 3);
      ctx.closePath();
    }, color, 0.14, 5);
    ctx.fillStyle = tono(color, -0.3);
    ctx.fillRect(-13 + sx * 3, y + 1, 26 + sx * 5, 4);
  } else if (tipo === 'zapatos') {
    forma((dx) => ctx.ellipse(dx + sx * 4, y - 3, 15, 7.5, 0, 0, TAU), color, 0.12, 4);
    ctx.fillStyle = tono(color, -0.3);
    ctx.fillRect(-12 + sx * 4, y + 2, 24, 3);
  } else {
    // zapatillas: suela blanca y cordones
    forma((dx) => ctx.ellipse(dx + sx * 3, y - 4, 16, 8.5, 0, Math.PI, TAU), color, 0.12, 4);
    ctx.beginPath();
    ctx.roundRect(-16 + sx * 3, y - 5, 32, 7, 3);
    ctx.fillStyle = '#f6f0e6';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f6f0e6';
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * 3 + k * 4, y - 9, 1.6, 0, TAU);
      ctx.fill();
    }
  }
}

/** La plaquita con el nombre, en el pecho. */
function placa(ctx, texto, x, y) {
  const w = 42;
  const h = 16;
  ctx.save();
  ctx.lineWidth = 1.8;
  ctx.fillStyle = '#fbf5ea';
  ctx.strokeStyle = C.tinta;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.terracota;
  ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, 3);
  ctx.fillStyle = C.tinta;
  let tam = 10;
  ctx.font = `700 ${tam}px Fredoka, "Trebuchet MS", sans-serif`;
  const ancho = ctx.measureText(texto).width;
  if (ancho > w - 6) {
    tam = Math.max(5.5, (tam * (w - 6)) / ancho);
    ctx.font = `700 ${tam}px Fredoka, "Trebuchet MS", sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 2);
  ctx.restore();
}

/** Detalles de la ropa sobre el torso (cuellos, botones, bolsillos). */
function ropa(ctx, look, w, ws, hombro, cadera, b, piel) {
  const st = look.style || 'remera';
  const osc = tono(look.shirt, -0.25);
  ctx.save();
  ctx.lineWidth = 2.5;
  if (st === 'remera' || st === 'vestido') {
    ctx.strokeStyle = tono(look.shirt, -0.35);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, hombro - 2, 11, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
  } else if (st === 'musculosa') {
    ctx.fillStyle = piel;
    ctx.beginPath();
    ctx.moveTo(-14, hombro - 1);
    ctx.quadraticCurveTo(0, hombro + 16, 14, hombro - 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = tono(look.shirt, -0.35);
    ctx.beginPath();
    ctx.moveTo(-14, hombro - 1);
    ctx.quadraticCurveTo(0, hombro + 16, 14, hombro - 1);
    ctx.stroke();
  } else if (st === 'chomba') {
    ctx.fillStyle = tono(look.shirt, 0.15);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, hombro + 4);
      ctx.lineTo(sx * 17, hombro - 2);
      ctx.lineTo(sx * 14, hombro + 13);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, hombro + 4);
    ctx.lineTo(0, hombro + 26);
    ctx.stroke();
    ctx.fillStyle = osc;
    for (const yy of [hombro + 12, hombro + 21]) {
      ctx.beginPath();
      ctx.arc(3, yy, 2.2, 0, TAU);
      ctx.fill();
    }
  } else if (st === 'camisa' || st === 'guardapolvo' || st === 'chaqueta') {
    ctx.fillStyle = tono(st === 'camisa' ? look.shirt : '#f6f0e6', 0.2);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, hombro + 2);
      ctx.lineTo(sx * 16, hombro - 2);
      ctx.lineTo(sx * 12, hombro + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = st === 'chaqueta' ? C.tinta2 : osc;
    const cols = st === 'chaqueta' ? [-10, 10] : [0];
    for (const cx of cols)
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, hombro + 24 + i * 18, 2.6, 0, TAU);
        ctx.fill();
      }
    if (look.tie) {
      ctx.beginPath();
      ctx.moveTo(-6, hombro + 8);
      ctx.lineTo(6, hombro + 8);
      ctx.lineTo(4, hombro + 52);
      ctx.lineTo(0, hombro + 60);
      ctx.lineTo(-4, hombro + 52);
      ctx.closePath();
      ctx.fillStyle = look.tie;
      ctx.fill();
      ctx.stroke();
    }
    if (look.stethoscope) {
      ctx.strokeStyle = C.tinta2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, hombro + 4);
      ctx.quadraticCurveTo(-18, hombro + 46, 0, hombro + 50);
      ctx.quadraticCurveTo(14, hombro + 46, 14, hombro + 4);
      ctx.stroke();
      ctx.fillStyle = C.acero;
      ctx.beginPath();
      ctx.arc(0, hombro + 54, 6, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (st === 'buzo') {
    ctx.beginPath();
    ctx.roundRect(-w * 0.3, cadera - 34, w * 0.6, 24, 8);
    ctx.fillStyle = osc;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, hombro + 6);
    ctx.lineTo(-6, hombro + 30);
    ctx.moveTo(6, hombro + 6);
    ctx.lineTo(6, hombro + 30);
    ctx.stroke();
  } else if (st === 'saco') {
    ctx.fillStyle = '#f4ead8';
    ctx.beginPath();
    ctx.moveTo(-14, hombro);
    ctx.lineTo(14, hombro);
    ctx.lineTo(0, hombro + 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = osc;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 14, hombro);
      ctx.lineTo(sx * 4, hombro + 44);
      ctx.lineTo(sx * 22, hombro + 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (st === 'chal') {
    ctx.fillStyle = tono(look.shirt, 0.25);
    ctx.beginPath();
    ctx.moveTo(-ws * 0.55, hombro + 8);
    ctx.quadraticCurveTo(0, hombro + 12, ws * 0.55, hombro + 8);
    ctx.lineTo(0, hombro + 64);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (st === 'bombero') {
    ctx.fillStyle = C.mostaza2;
    for (const yy of [hombro + 40, hombro + 70]) ctx.fillRect(-w * 0.5 + 4, yy, w - 8, 8);
  } else if (st === 'heroe') {
    ctx.beginPath();
    ctx.arc(0, hombro + 34, 15, 0, TAU);
    ctx.fillStyle = C.mostaza;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, hombro + 34, 5, 0, TAU);
    ctx.fillStyle = look.shirt;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.mostaza;
    ctx.fillRect(-w * 0.5 + 4, cadera - 12, w - 8, 9);
  }
  ctx.restore();
}

/** Ojos, cejas, nariz, boca, barba y anteojos. */
function cara(ctx, look, animo, cy, R, t, seed, pelo) {
  const ey = cy + R * 0.02;
  const ex = R * 0.38;
  const parpadeo = (t + seed * 0.37) % 4.2 < 0.13;
  const cerrados = animo === 'encantado' || parpadeo || look.eyes === 'feliz';
  const iris = OJOS[look.eyeColor] || OJOS[['marron', 'miel', 'negro', 'verde', 'marron', 'azul'][seed % 6]];
  ctx.save();
  ctx.lineWidth = 3;
  // mejillas
  ctx.fillStyle = 'rgba(200,85,61,.22)';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * R * 0.55, cy + R * 0.38, R * 0.17, R * 0.1, 0, 0, TAU);
    ctx.fill();
  }
  if (look.freckles) {
    ctx.fillStyle = alfa('#8d5a3b', 0.55);
    for (const sx of [-1, 1])
      for (const [dx, dy] of [[0.45, 0.24], [0.58, 0.3], [0.5, 0.36], [0.64, 0.22]]) {
        ctx.beginPath();
        ctx.arc(sx * dx * R, cy + dy * R, 1.6, 0, TAU);
        ctx.fill();
      }
  }
  // ojos
  for (const sx of [-1, 1]) {
    const x = sx * ex;
    if (cerrados) {
      ctx.beginPath();
      if (animo === 'encantado' || look.eyes === 'feliz') ctx.arc(x, ey + 3, R * 0.13, Math.PI * 1.1, Math.PI * 1.9);
      else {
        ctx.moveTo(x - R * 0.12, ey);
        ctx.lineTo(x + R * 0.12, ey);
      }
      ctx.stroke();
    } else if (look.eyes === 'grande' || look.eyes === 'pestanas' || look.eyes === 'almendra') {
      const almendra = look.eyes === 'almendra';
      ctx.fillStyle = '#fffaf2';
      ctx.beginPath();
      if (almendra) {
        ctx.moveTo(x - R * 0.19, ey);
        ctx.quadraticCurveTo(x, ey - R * 0.22, x + R * 0.19, ey - R * 0.02);
        ctx.quadraticCurveTo(x, ey + R * 0.16, x - R * 0.19, ey);
      } else ctx.ellipse(x, ey, R * 0.15, R * 0.18, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(x + sx * 1, ey + 1.5, R * 0.115, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.tinta;
      ctx.beginPath();
      ctx.arc(x + sx * 1, ey + 1.5, R * 0.055, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fffaf2';
      ctx.beginPath();
      ctx.arc(x - 2, ey - 1.5, R * 0.035, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 3;
      if (look.eyes === 'pestanas' || almendra) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const k of [0, 1]) {
          ctx.moveTo(x + sx * R * (0.08 + k * 0.06), ey - R * (0.15 - k * 0.04));
          ctx.lineTo(x + sx * R * (0.14 + k * 0.08), ey - R * (0.23 - k * 0.05));
        }
        ctx.stroke();
        ctx.lineWidth = 3;
      }
    } else {
      // puntitos: el color de ojos en un anillo alrededor de la pupila
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.ellipse(x, ey, R * 0.095, R * 0.125, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = C.tinta;
      ctx.beginPath();
      ctx.ellipse(x, ey + 0.5, R * 0.05, R * 0.07, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fffaf2';
      ctx.beginPath();
      ctx.arc(x - 1.5, ey - 3, R * 0.032, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 3;
    }
    // cejas
    const enojo = animo === 'enojado' ? 0.35 : animo === 'molesto' ? 0.15 : animo === 'sorpresa' ? -0.2 : 0;
    ctx.strokeStyle = tono(pelo, -0.3);
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    // con enojo, la punta de adentro de cada ceja baja; con sorpresa, sube
    const by = ey - R * 0.3 - (animo === 'sorpresa' ? 4 : 0);
    const e = enojo * R * 0.24;
    ctx.moveTo(x + sx * R * 0.15, by - e * 0.4 + 1);
    ctx.quadraticCurveTo(x, by - 2.5 - e * 0.2, x - sx * R * 0.14, by + e);
    ctx.stroke();
    ctx.strokeStyle = C.tinta;
    ctx.lineWidth = 3;
  }
  // nariz (con su sombrita)
  ctx.fillStyle = 'rgba(42,29,21,.12)';
  ctx.beginPath();
  ctx.ellipse(R * 0.04, cy + R * 0.24, R * 0.09, R * 0.05, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, cy + R * 0.22, R * 0.08, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  // boca
  const my = cy + R * 0.5;
  ctx.beginPath();
  if (animo === 'feliz') ctx.arc(0, my - R * 0.1, R * 0.22, 0.2 * Math.PI, 0.8 * Math.PI);
  else if (animo === 'encantado') {
    const boca = () => {
      ctx.beginPath();
      ctx.moveTo(-R * 0.26, my - R * 0.06);
      ctx.quadraticCurveTo(0, my + R * 0.34, R * 0.26, my - R * 0.06);
      ctx.closePath();
    };
    boca();
    ctx.fillStyle = '#7a3a2c';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#fffaf2';
    ctx.fillRect(-R * 0.3, my - R * 0.08, R * 0.6, R * 0.09);
    ctx.fillStyle = '#c86a5a';
    ctx.beginPath();
    ctx.ellipse(0, my + R * 0.2, R * 0.12, R * 0.08, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    boca();
  } else if (animo === 'molesto') {
    ctx.moveTo(-R * 0.16, my + 2);
    ctx.quadraticCurveTo(0, my - R * 0.06, R * 0.16, my + 2);
  } else if (animo === 'enojado') ctx.arc(0, my + R * 0.16, R * 0.2, 1.2 * Math.PI, 1.8 * Math.PI);
  else if (animo === 'sorpresa') {
    ctx.ellipse(0, my, R * 0.09, R * 0.12, 0, 0, TAU);
    ctx.fillStyle = '#7a3a2c';
    ctx.fill();
  } else {
    ctx.moveTo(-R * 0.14, my);
    ctx.quadraticCurveTo(0, my + R * 0.06, R * 0.14, my);
  }
  ctx.stroke();
  // barba y bigote
  if (look.beard === 'barba' || look.beard === 'candado') {
    ctx.beginPath();
    if (look.beard === 'barba') {
      ctx.moveTo(-R * 0.98, cy + R * 0.05);
      ctx.quadraticCurveTo(-R * 0.9, cy + R * 1.1, 0, cy + R * 1.18);
      ctx.quadraticCurveTo(R * 0.9, cy + R * 1.1, R * 0.98, cy + R * 0.05);
      ctx.quadraticCurveTo(R * 0.6, cy + R * 0.62, 0, cy + R * 0.66);
      ctx.quadraticCurveTo(-R * 0.6, cy + R * 0.62, -R * 0.98, cy + R * 0.05);
    } else {
      ctx.moveTo(-R * 0.3, cy + R * 0.66);
      ctx.quadraticCurveTo(0, cy + R * 1.08, R * 0.3, cy + R * 0.66);
      ctx.quadraticCurveTo(0, cy + R * 0.8, -R * 0.3, cy + R * 0.66);
    }
    ctx.fillStyle = pelo;
    ctx.fill();
    ctx.stroke();
  }
  if (look.beard === 'bigote' || look.beard === 'barba' || look.beard === 'candado') {
    ctx.beginPath();
    ctx.moveTo(0, cy + R * 0.33);
    ctx.quadraticCurveTo(-R * 0.3, cy + R * 0.28, -R * 0.36, cy + R * 0.46);
    ctx.quadraticCurveTo(-R * 0.16, cy + R * 0.42, 0, cy + R * 0.38);
    ctx.quadraticCurveTo(R * 0.16, cy + R * 0.42, R * 0.36, cy + R * 0.46);
    ctx.quadraticCurveTo(R * 0.3, cy + R * 0.28, 0, cy + R * 0.33);
    ctx.fillStyle = pelo;
    ctx.fill();
    ctx.stroke();
  }
  // antifaz
  if (look.mask) {
    ctx.beginPath();
    ctx.roundRect(-R * 0.72, ey - R * 0.2, R * 1.44, R * 0.38, R * 0.18);
    ctx.fillStyle = look.mask;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fffaf2';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * ex, ey, R * 0.12, R * 0.09, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.tinta;
      ctx.beginPath();
      ctx.arc(sx * ex, ey + 1, R * 0.05, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fffaf2';
    }
  }
  // anteojos
  if (look.glasses) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = look.glasses === 'gato' ? C.ciruela : C.tinta;
    ctx.fillStyle = look.glasses === 'sol' ? 'rgba(59,42,32,.78)' : 'rgba(255,250,242,.18)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      if (look.glasses === 'cuadrados') ctx.roundRect(sx * ex - R * 0.22, ey - R * 0.17, R * 0.44, R * 0.34, 4);
      else if (look.glasses === 'gato') {
        ctx.moveTo(sx * ex - R * 0.22, ey - R * 0.08);
        ctx.quadraticCurveTo(sx * ex, ey - R * 0.24, sx * ex + sx * R * 0.28, ey - R * 0.22);
        ctx.quadraticCurveTo(sx * ex + sx * R * 0.2, ey + R * 0.2, sx * ex, ey + R * 0.16);
        ctx.quadraticCurveTo(sx * ex - sx * R * 0.24, ey + R * 0.14, sx * ex - R * 0.22 * sx, ey - R * 0.08);
      } else ctx.arc(sx * ex, ey, R * 0.21, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-ex + R * 0.2, ey - 2);
    ctx.quadraticCurveTo(0, ey - 7, ex - R * 0.2, ey - 2);
    ctx.stroke();
    ctx.strokeStyle = C.tinta;
  }
  ctx.restore();
}

/** La parte del pelo que va detrás de la cabeza. */
function peloAtras(ctx, estilo, pelo, cy, R, t, camina) {
  ctx.fillStyle = pelo;
  const vaiven = Math.sin(t * 3) * 0.08 + (camina ? Math.sin(t * 9) * 0.1 : 0);
  ctx.beginPath();
  if (estilo === 'largo') {
    ctx.roundRect(-R * 1.08, cy - R * 0.7, R * 2.16, R * 2.15, [R, R, R * 0.4, R * 0.4]);
  } else if (estilo === 'ondas') {
    ctx.moveTo(-R * 1.05, cy - R * 0.4);
    ctx.quadraticCurveTo(-R * 1.1, cy - R * 1.1, 0, cy - R * 1.1);
    ctx.quadraticCurveTo(R * 1.1, cy - R * 1.1, R * 1.05, cy - R * 0.4);
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(R * (1.3 - (i % 2) * 0.28), cy + R * (i * 0.42 + 0.0), R * (1.12 - (i % 2) * 0.1), cy + R * (i * 0.42 + 0.3));
    ctx.quadraticCurveTo(R * 0.6, cy + R * 1.75, 0, cy + R * 1.6);
    ctx.quadraticCurveTo(-R * 0.6, cy + R * 1.75, -R * 1.12, cy + R * 1.56);
    for (let i = 3; i >= 0; i--) ctx.quadraticCurveTo(-R * (1.3 - (i % 2) * 0.28), cy + R * (i * 0.42 + 0.15), -R * (1.12 - (i % 2) * 0.1), cy + R * (i * 0.42 - 0.12));
    ctx.closePath();
  } else if (estilo === 'melena') {
    ctx.roundRect(-R * 1.12, cy - R * 0.75, R * 2.24, R * 1.55, [R, R, R * 0.3, R * 0.3]);
  } else if (estilo === 'afro') {
    ctx.arc(0, cy - R * 0.15, R * 1.5, 0, TAU);
  } else if (estilo === 'colita') {
    ctx.save();
    ctx.translate(R * 0.75, cy - R * 0.55);
    ctx.rotate(0.6 + vaiven);
    ctx.ellipse(R * 0.25, R * 0.55, R * 0.28, R * 0.7, 0, 0, TAU);
    ctx.restore();
  } else if (estilo === 'coletas') {
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(sx * R * 0.92, cy - R * 0.35);
      ctx.rotate(sx * (0.5 + vaiven));
      ctx.moveTo(R * 0.3, R * 0.6);
      ctx.ellipse(0, R * 0.6, R * 0.3, R * 0.62, 0, 0, TAU);
      ctx.restore();
    }
  } else if (estilo === 'trenzas') {
    for (const sx of [-1, 1])
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(sx * R * 0.95 + R * 0.17, cy + R * 0.25 + i * R * 0.28);
        ctx.arc(sx * R * 0.95, cy + R * 0.25 + i * R * 0.28, R * 0.17, 0, TAU);
      }
  } else if (estilo === 'rulos') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.05 + i * 0.112);
      const x = Math.cos(a + Math.PI) * R * 1.02;
      const y = cy + Math.sin(a + Math.PI) * R * 0.95 + R * 0.25;
      ctx.moveTo(x + R * 0.3, y);
      ctx.arc(x, y, R * 0.3, 0, TAU);
    }
  } else return;
  ctx.fill();
  ctx.stroke();
  // sombra del pelo de atrás (queda en la nuca)
  if (estilo === 'largo' || estilo === 'ondas' || estilo === 'melena') {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(42,29,21,.18)';
    ctx.fillRect(-R * 1.3, cy + R * 0.2, R * 2.6, R * 2);
    ctx.restore();
  }
  if (estilo === 'coletas') {
    ctx.fillStyle = C.terracota;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * R * 0.95, cy - R * 0.32, R * 0.12, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** La parte del pelo que va sobre la cabeza (flequillo, jopo, rodete…). */
function peloAdelante(ctx, estilo, pelo, cy, R, forma) {
  if (estilo === 'pelado') {
    ctx.fillStyle = pelo;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * R * 0.86, cy - R * 0.1, R * 0.16, R * 0.32, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,250,242,.35)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.3, cy - R * 0.72, R * 0.22, R * 0.08, -0.4, 0, TAU);
    ctx.fill();
    return;
  }
  if (estilo === 'rapado' || estilo === 'mohicano') {
    ctx.fillStyle = pelo;
    ctx.beginPath();
    ctx.arc(0, cy, R * 1.0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.quadraticCurveTo(0, cy - R * 0.62, -R * 0.94, cy - R * 0.25);
    ctx.globalAlpha = estilo === 'mohicano' ? 0.45 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    if (estilo === 'mohicano') {
      forma((dx) => {
        ctx.moveTo(dx - R * 0.2, cy - R * 0.62);
        ctx.quadraticCurveTo(dx - R * 0.26, cy - R * 1.5, dx + R * 0.05, cy - R * 1.62);
        ctx.quadraticCurveTo(dx + R * 0.3, cy - R * 1.4, dx + R * 0.2, cy - R * 0.62);
        ctx.closePath();
      }, pelo, 0.15, 5);
    }
    return;
  }
  // gorro de pelo (base de casi todos los peinados)
  const base = (dx) => {
    ctx.moveTo(dx - R * 1.04, cy + R * 0.12);
    ctx.quadraticCurveTo(dx - R * 1.12, cy - R * 1.12, dx, cy - R * 1.12);
    ctx.quadraticCurveTo(dx + R * 1.12, cy - R * 1.12, dx + R * 1.04, cy + R * 0.12);
    if (estilo === 'flequillo' || estilo === 'melena') {
      ctx.lineTo(dx + R * 0.8, cy - R * 0.25);
      if (estilo === 'melena') ctx.lineTo(dx - R * 0.82, cy - R * 0.32);
      else {
        for (let i = 0; i < 6; i++) ctx.lineTo(dx + R * (0.62 - i * 0.29), cy - R * (i % 2 ? 0.22 : 0.42));
        ctx.lineTo(dx - R * 0.82, cy - R * 0.3);
      }
    } else if (estilo === 'rulos' || estilo === 'afro') {
      for (let i = 0; i < 6; i++) {
        const x = R * (0.75 - i * 0.3);
        ctx.quadraticCurveTo(dx + x + R * 0.12, cy - R * 0.25, dx + x - R * 0.15, cy - R * 0.5);
      }
    } else if (estilo === 'raya') {
      ctx.quadraticCurveTo(dx + R * 0.9, cy - R * 0.5, dx + R * 0.45, cy - R * 0.7);
      ctx.quadraticCurveTo(dx - R * 0.3, cy - R * 0.38, dx - R * 0.88, cy - R * 0.2);
    } else {
      ctx.quadraticCurveTo(dx + R * 0.7, cy - R * 0.62, dx + R * 0.1, cy - R * 0.58);
      ctx.quadraticCurveTo(dx - R * 0.6, cy - R * 0.58, dx - R * 0.86, cy - R * 0.25);
    }
    ctx.closePath();
  };
  forma(base, pelo, 0.16, R * 0.25);
  // mechones y un reflejo suave
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = tono(pelo, -0.3);
  ctx.beginPath();
  ctx.moveTo(-R * 0.2, cy - R * 1.02);
  ctx.quadraticCurveTo(-R * 0.45, cy - R * 0.8, -R * 0.55, cy - R * 0.55);
  ctx.moveTo(R * 0.3, cy - R * 1.0);
  ctx.quadraticCurveTo(R * 0.5, cy - R * 0.85, R * 0.62, cy - R * 0.6);
  ctx.stroke();
  ctx.strokeStyle = alfa(tono(pelo, 0.45), 0.55);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-R * 0.15, cy - R * 0.45, R * 0.55, Math.PI * 1.2, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
  if (estilo === 'jopo') forma((dx) => ctx.ellipse(dx + R * 0.1, cy - R * 1.05, R * 0.62, R * 0.32, -0.15, 0, TAU), pelo, 0.15, 6);
  if (estilo === 'rodete') forma((dx) => ctx.arc(dx, cy - R * 1.2, R * 0.36, 0, TAU), pelo, 0.15, 6);
  if (estilo === 'colita') {
    ctx.beginPath();
    ctx.roundRect(R * 0.62, cy - R * 0.78, R * 0.22, R * 0.2, 4);
    ctx.fillStyle = C.terracota;
    ctx.fill();
    ctx.stroke();
  }
}

/** Gorros y cosas en la cabeza. */
function sombrero(ctx, look, cy, R, t, forma) {
  const h = look.hat;
  const col = look.hatColor || C.terracota;
  if (look.headband || h === 'vincha') {
    forma((dx) => ctx.roundRect(dx - R * 1.02, cy - R * 0.66, R * 2.04, R * 0.22, 6), look.headband || col, 0.12, 6);
  }
  if (look.flower) {
    ctx.save();
    ctx.translate(R * 0.72, cy - R * 0.72);
    ctx.fillStyle = look.flower;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(Math.cos((i / 5) * TAU) * 7, Math.sin((i / 5) * TAU) * 7, 6, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = C.mostaza;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (!h || h === 'vincha') return;
  ctx.save();
  if (h === 'gorra' || h === 'gorra-atras' || h === 'helice') {
    forma((dx) => {
      ctx.moveTo(dx - R * 1.0, cy - R * 0.32);
      ctx.quadraticCurveTo(dx - R * 1.0, cy - R * 1.22, dx, cy - R * 1.22);
      ctx.quadraticCurveTo(dx + R * 1.0, cy - R * 1.22, dx + R * 1.0, cy - R * 0.32);
      ctx.closePath();
    }, col, 0.14, 9);
    if (h === 'helice') {
      ctx.fillStyle = C.mostaza;
      ctx.beginPath();
      ctx.moveTo(0, cy - R * 1.22);
      ctx.lineTo(0, cy - R * 0.32);
      ctx.lineTo(R * 0.5, cy - R * 0.4);
      ctx.quadraticCurveTo(R * 0.4, cy - R * 1.05, 0, cy - R * 1.22);
      ctx.fill();
      ctx.stroke();
      const a = t * 12;
      ctx.fillStyle = C.terracota;
      ctx.beginPath();
      ctx.ellipse(0, cy - R * 1.32, R * 0.62 * Math.abs(Math.cos(a)), R * 0.1, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy - R * 1.22);
      ctx.lineTo(0, cy - R * 1.34);
      ctx.stroke();
    } else if (h === 'gorra') {
      ctx.beginPath();
      ctx.ellipse(0, cy - R * 0.32, R * 1.12, R * 0.2, 0, 0, Math.PI);
      ctx.fillStyle = tono(col, -0.15);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, cy - R * 1.2, 4, 0, TAU);
      ctx.fillStyle = tono(col, -0.15);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.roundRect(-R * 0.25, cy - R * 0.45, R * 0.5, R * 0.16, 4);
      ctx.fillStyle = tono(col, -0.15);
      ctx.fill();
      ctx.stroke();
    }
  } else if (h === 'gorro') {
    // gorro de lana con pompón
    forma((dx) => {
      ctx.moveTo(dx - R * 1.02, cy - R * 0.4);
      ctx.quadraticCurveTo(dx - R * 1.0, cy - R * 1.32, dx, cy - R * 1.32);
      ctx.quadraticCurveTo(dx + R * 1.0, cy - R * 1.32, dx + R * 1.02, cy - R * 0.4);
      ctx.closePath();
    }, col, 0.14, 9);
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = tono(col, -0.25);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * R * 0.24, cy - R * 0.62);
      ctx.lineTo(i * R * 0.2, cy - R * 1.2 + Math.abs(i) * 3);
      ctx.stroke();
    }
    ctx.restore();
    forma((dx) => ctx.roundRect(dx - R * 1.08, cy - R * 0.66, R * 2.16, R * 0.3, 8), tono(col, -0.12), 0.12, 8);
    forma((dx) => ctx.arc(dx, cy - R * 1.42, R * 0.22, 0, TAU), C.crema, 0.12, 4);
  } else if (h === 'mono') {
    // moño en el pelo
    ctx.save();
    ctx.translate(R * 0.55, cy - R * 0.92);
    ctx.rotate(0.3);
    forma(() => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-R * 0.45, -R * 0.42, -R * 0.42, R * 0.28);
      ctx.closePath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(R * 0.45, -R * 0.42, R * 0.42, R * 0.28);
      ctx.closePath();
    }, col, 0);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.11, 0, TAU);
    ctx.fillStyle = tono(col, -0.2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else if (h === 'chef') {
    ctx.fillStyle = '#fbf5ea';
    ctx.beginPath();
    for (const [x, y, r] of [[-0.5, -1.55, 0.42], [0, -1.75, 0.5], [0.5, -1.55, 0.42]]) {
      ctx.moveTo(x * R + r * R, cy + y * R);
      ctx.arc(x * R, cy + y * R, r * R, 0, TAU);
    }
    ctx.fill();
    ctx.stroke();
    forma((dx) => ctx.roundRect(dx - R * 0.75, cy - R * 1.25, R * 1.5, R * 0.62, 6), '#fbf5ea', 0.1, 6);
    ctx.beginPath();
    ctx.moveTo(-R * 0.75, cy - R * 0.85);
    ctx.lineTo(R * 0.75, cy - R * 0.85);
    ctx.stroke();
  } else if (h === 'boina') {
    forma((dx) => ctx.ellipse(dx - R * 0.15, cy - R * 0.92, R * 1.05, R * 0.38, -0.12, 0, TAU), col, 0.14, 8);
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, cy - R * 1.3);
    ctx.lineTo(-R * 0.05, cy - R * 1.46);
    ctx.stroke();
  } else if (h === 'sombrero') {
    forma((dx) => ctx.ellipse(dx, cy - R * 0.72, R * 1.55, R * 0.3, 0, 0, TAU), col, 0.12, 10);
    forma((dx) => ctx.roundRect(dx - R * 0.72, cy - R * 1.42, R * 1.44, R * 0.74, [R * 0.5, R * 0.5, 4, 4]), col, 0.14, 8);
    ctx.fillStyle = C.terracota;
    ctx.fillRect(-R * 0.72, cy - R * 0.92, R * 1.44, R * 0.16);
    ctx.strokeRect(-R * 0.72, cy - R * 0.92, R * 1.44, R * 0.16);
  } else if (h === 'panuelo') {
    forma((dx) => {
      ctx.moveTo(dx - R * 1.05, cy - R * 0.38);
      ctx.quadraticCurveTo(dx, cy - R * 1.45, dx + R * 1.05, cy - R * 0.38);
      ctx.quadraticCurveTo(dx, cy - R * 0.62, dx - R * 1.05, cy - R * 0.38);
    }, col, 0.12, 8);
    ctx.fillStyle = 'rgba(255,250,242,.7)';
    for (const [x, y] of [[-0.5, -0.82], [0, -1.0], [0.5, -0.82], [-0.25, -0.62], [0.25, -0.62]]) {
      ctx.beginPath();
      ctx.arc(x * R, cy + y * R, 3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Retrato (cabeza y hombros) dentro de un círculo. Va guardado: los tickets muestran muchos y
 * dibujar una persona entera en chiquito cada vez es caro.
 */
const retratos = new WeakMap();
export function retrato(ctx, look, x, y, rad, o = {}) {
  const m = ctx.getTransform();
  const k = Math.max(0.5, Math.hypot(m.a, m.b));
  const clave = `${rad}|${o.animo || 'feliz'}|${o.fondo || ''}|${o.borde || ''}|${k.toFixed(2)}`;
  let porLook = retratos.get(look);
  if (!porLook) retratos.set(look, (porLook = new Map()));
  let c = porLook.get(clave);
  if (!c) {
    const lado = rad * 2 + 6;
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(lado * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    retratoVivo(g, look, lado / 2, lado / 2, rad, o);
    porLook.set(clave, c);
    if (porLook.size > 12) porLook.delete(porLook.keys().next().value);
  }
  const lado = rad * 2 + 6;
  ctx.drawImage(c, x - lado / 2, y - lado / 2, lado, lado);
}

function retratoVivo(ctx, look, x, y, rad, o = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fillStyle = o.fondo || C.crema;
  ctx.fill();
  ctx.clip();
  const b = CUERPOS[look.body] || CUERPOS.adulto;
  // la cara ocupa más o menos la mitad del círculo y queda un poco arriba del centro
  const s = (rad * 0.52) / b.cabeza;
  const pies = y + rad * 0.08 + (b.piernas + b.torso + 6 + b.cabeza * 0.92) * s;
  persona(ctx, look, x, pies, s, { animo: o.animo || 'feliz', t: o.t || 0, quieto: true });
  ctx.restore();
  ctx.lineWidth = Math.max(1.5, rad * 0.06);
  ctx.strokeStyle = o.borde || C.tinta;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.stroke();
}
