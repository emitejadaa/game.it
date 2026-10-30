/**
 * Julay's Donas — game.it
 * Un local de donas: tomás el pedido, armás la masa, freís, decorás y
 * entregás. Cada día llegan clientes nuevos y el último es el más exigente. Con las propinas y los
 * bonus decorás el local, y el personaje se personaliza.
 *
 * Este archivo arma todo: el canvas (1280 × 720 lógicos), la entrada, el riel de tickets, las
 * pestañas de las estaciones, la tarjeta de puntaje, el pasaje entre pantallas y el SDK del portal.
 */
import { C, TXT, AYUDA, REACCIONES, LOGROS, DECO, CLIENTES, MASAS, FORMAS, RELLENOS, BANOS, HILOS, TOPPINGS, PIEZAS, POSTALES, exigenteDelDia, byId } from './data.js';
import { Dia } from './dia.js';
import { W, H, ponerIdioma } from './local.js';
import { retrato } from './art.js';
import { ticketMini } from './ticket.js';
import { boton, burbuja, dentroRect, F, panel, barra, moneda, estrellas, parrafo } from './dibujo.js';
import * as mostrador from './mostrador.js';
import * as masa from './masa.js';
import * as fritura from './fritura.js';
import * as decorado from './decorado.js';
import { snd, chisporroteo, musicaFondo } from './sonido.js';
import { cargar, guardar, borrar, partidaNueva, lookAlAzar } from './guardado.js';
import * as ui from './ui.js';

const G = window.GameIt;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const ESTACIONES = { mostrador, masa, fritura, decorado };
const ORDEN = ['mostrador', 'masa', 'fritura', 'decorado'];

// ---------------------------------------------------------------- estado general

const J = {
  modo: 'menu', // menu | jugando
  pausado: false,
  save: cargar(),
  dia: null,
  estacion: 'mostrador',
  sel: { masa: null, fritura: null, decorado: null },
  masa: masa.estado(),
  fritura: fritura.estado(),
  decorado: decorado.estado(),
  mostrador: mostrador.estado(),
  entrega: null,
  toasts: [],
  campana: 0,
  escala: 1,
  lang: G?.prefs?.lang === 'en' ? 'en' : 'es',
  tr(t, vars) {
    let s = typeof t === 'string' ? t : t?.[this.lang] ?? t?.es ?? '';
    if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
    return s;
  },
  snd,
  toast(texto) {
    J.toasts = J.toasts.filter((x) => x.texto !== texto);
    J.toasts.push({ texto, t: 0 });
  },
  irA(est) {
    if (!ESTACIONES[est] || J.entrega) return;
    if (J.estacion !== est) {
      snd('click');
      // con "reducir movimiento" se cambia de golpe, sin el fundido
      if (!J.reducido) fundido(ORDEN.indexOf(est) > ORDEN.indexOf(J.estacion) ? 1 : -1);
    }
    J.estacion = est;
  },
  servir(tk) {
    const res = J.dia.entregar(tk);
    if (!res) return;
    J.entrega = { res, fase: 'camina', t: 0, sonidos: 0 };
    J.estacion = 'mostrador';
    snd('caja');
  },
};
window.__donas = J; // para las pruebas
J.reducido = !!G?.prefs?.reducedMotion;
ponerIdioma(J.lang);
// la música se puede apagar desde la pausa (queda guardado en este navegador)
try {
  J.musica = localStorage.getItem('gameit:julays-donas:musica') !== 'no';
} catch {
  J.musica = true;
}

// ---------------------------------------------------------------- canvas y escala

function ajustar() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const esc = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${W * esc}px`;
  canvas.style.height = `${H * esc}px`;
  canvas.width = Math.round(W * esc * dpr);
  canvas.height = Math.round(H * esc * dpr);
  J.escala = esc * dpr;
}
addEventListener('resize', ajustar);
ajustar();

function punto(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

// ---------------------------------------------------------------- HUD: riel, pestañas, botones

const TAB = (i) => ({ x: 286 + i * 178, y: 652, w: 168, h: 60 });
const BOTON_MENU = { x: 1196, y: 652, w: 68, h: 60 };
const BOTON_AYUDA = { x: 1120, y: 652, w: 68, h: 60 };
const TARJETA = { x: 300, y: 128, w: 680, h: 474 };
const SEGUIR = { x: 540, y: 528, w: 200, h: 56 };

function railTickets() {
  return J.dia.pendientes().slice(0, 9).map((tk, i) => ({ tk, x: 160 + i * 110, y: 22 }));
}

function utilAca(tk) {
  const e = J.dia.estadoTicket(tk);
  if (J.estacion === 'masa') return e === 'masa';
  if (J.estacion === 'fritura') return e === 'fritura' || tk.hechas.some((h) => h && h.etapa !== 'lista');
  if (J.estacion === 'decorado') return tk.hechas.some((h) => h && h.etapa === 'lista');
  return true;
}

function dibujarRiel() {
  ctx.save();
  ctx.fillStyle = C.acero;
  ctx.strokeStyle = C.tinta;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(148, 9, 984, 10, 5);
  ctx.fill();
  ctx.stroke();
  for (const { tk, x, y } of railTickets()) {
    const sel = J.sel[J.estacion] === tk;
    ticketMini(ctx, tk, x, y + (sel ? 8 : 0), { sel, estado: J.dia.estadoTicket(tk), apagado: !utilAca(tk) });
  }
  ctx.restore();
}

function avisos() {
  const d = J.dia;
  const pend = d.pendientes();
  return {
    mostrador: d.puedeTomar() ? '!' : '',
    masa: pend.filter((t) => d.estadoTicket(t) === 'masa').length || '',
    fritura: d.freidoraAvisa() ? '!' : d.crudas().length || '',
    decorado: pend.filter((t) => d.estadoTicket(t) === 'decorado').length || '',
  };
}

function dibujarPestanas(t) {
  ctx.save();
  ctx.fillStyle = C.tinta;
  ctx.fillRect(0, 646, W, H - 646);
  ctx.fillStyle = C.madera2;
  ctx.fillRect(0, 646, W, 4);
  const av = avisos();
  ORDEN.forEach((est, i) => {
    const r = TAB(i);
    const on = J.estacion === est;
    ctx.fillStyle = on ? C.terracota : '#4d3a2e';
    ctx.strokeStyle = on ? C.crema : '#6b5545';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.stroke();
    iconoEstacion(est, r.x + 34, r.y + r.h / 2, on);
    ctx.fillStyle = C.crema;
    ctx.font = F(700, 18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(J.tr(TXT.estaciones[est]), r.x + 60, r.y + r.h / 2 + 1, r.w - 66);
    const a = av[est];
    if (a !== '' && a !== 0) {
      const pulso = a === '!' ? 1 + Math.sin(t * 9) * 0.12 : 1;
      ctx.fillStyle = a === '!' ? C.mostaza : C.crema;
      ctx.strokeStyle = C.tinta;
      ctx.beginPath();
      ctx.arc(r.x + r.w - 8, r.y + 4, 13 * pulso, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.tinta;
      ctx.font = F(700, 15);
      ctx.textAlign = 'center';
      ctx.fillText(String(a), r.x + r.w - 8, r.y + 5);
    }
  });
  // día, clientes y monedas
  ctx.fillStyle = C.crema;
  ctx.textAlign = 'left';
  ctx.font = F(700, 20);
  ctx.fillText(J.tr(TXT.dia, { d: J.dia.n }), 20, 672);
  ctx.font = F(500, 15);
  ctx.fillStyle = '#d8c9b4';
  ctx.fillText(J.tr(TXT.clientesHoy, { a: J.dia.resultados.length, b: J.dia.total }), 20, 697);
  moneda(ctx, 196, 682, 14);
  ctx.fillStyle = C.crema;
  ctx.font = F(700, 20);
  ctx.fillText(String(J.save.monedas), 216, 683);
  // menú y ayuda
  for (const [r, s] of [[BOTON_AYUDA, '?'], [BOTON_MENU, '≡']]) {
    ctx.fillStyle = '#4d3a2e';
    ctx.strokeStyle = '#6b5545';
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.crema;
    ctx.font = F(700, 28);
    ctx.textAlign = 'center';
    ctx.fillText(s, r.x + r.w / 2, r.y + r.h / 2 + 2);
  }
  ctx.restore();
}

/** Iconitos de las pestañas. */
function iconoEstacion(est, x, y, on) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = C.crema;
  ctx.fillStyle = on ? C.crema : 'transparent';
  ctx.beginPath();
  if (est === 'mostrador') {
    ctx.moveTo(-14, 8);
    ctx.quadraticCurveTo(-14, -12, 0, -12);
    ctx.quadraticCurveTo(14, -12, 14, 8);
    ctx.closePath();
    ctx.moveTo(-18, 12);
    ctx.lineTo(18, 12);
  } else if (est === 'masa') {
    ctx.roundRect(-16, -6, 32, 12, 6);
    ctx.moveTo(-22, 0);
    ctx.lineTo(-16, 0);
    ctx.moveTo(16, 0);
    ctx.lineTo(22, 0);
  } else if (est === 'fritura') {
    ctx.roundRect(-16, -6, 32, 18, 5);
    ctx.moveTo(-16, -2);
    ctx.lineTo(-22, -6);
    ctx.moveTo(16, -2);
    ctx.lineTo(22, -6);
    ctx.moveTo(-6, -10);
    ctx.quadraticCurveTo(-2, -16, -6, -20);
    ctx.moveTo(4, -10);
    ctx.quadraticCurveTo(8, -16, 4, -20);
  } else {
    ctx.moveTo(-12, -14);
    ctx.lineTo(12, -14);
    ctx.lineTo(3, 10);
    ctx.lineTo(-3, 10);
    ctx.closePath();
    ctx.moveTo(0, 10);
    ctx.lineTo(0, 16);
  }
  if (on) ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function dibujarToasts(dt) {
  ctx.save();
  J.toasts.forEach((ts, i) => {
    ts.t += dt;
    const a = ts.t < 0.2 ? ts.t / 0.2 : ts.t > 1.8 ? Math.max(0, 1 - (ts.t - 1.8) / 0.4) : 1;
    ctx.globalAlpha = a;
    ctx.font = F(700, 20);
    const w = ctx.measureText(ts.texto).width + 40;
    const y = 196 + i * 50;
    ctx.fillStyle = C.tinta;
    ctx.beginPath();
    ctx.roundRect(W / 2 - w / 2, y - 22, w, 44, 22);
    ctx.fill();
    ctx.fillStyle = C.crema;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ts.texto, W / 2, y + 1);
  });
  J.toasts = J.toasts.filter((ts) => ts.t < 2.2);
  ctx.restore();
}

// ---------------------------------------------------------------- avisos de llegada

/**
 * Cuando llega alguien, un aviso chiquito abajo a la derecha (no tapa nada ni frena el juego).
 * En el mostrador no hace falta para los conocidos: se los ve entrar.
 */
function avisoLlegada(actor) {
  const s = J.save;
  const def = actor.def;
  s.presentados = s.presentados || [];
  const nuevo = !actor.exigente && !s.presentados.includes(def.id);
  if (nuevo) s.presentados.push(def.id);
  const tipo = def.julay ? 'julay' : actor.exigente ? 'exigente' : nuevo ? 'nuevo' : 'comun';
  if (tipo === 'comun' && J.estacion === 'mostrador') return;
  if (tipo === 'julay') snd('logro');
  J.avisos = (J.avisos || []).slice(-2);
  J.avisos.push({ def, tipo, t: 0 });
}

function dibujarAvisos(dt) {
  J.avisos = (J.avisos || []).filter((a) => a.t < 3.4);
  const ancho = 270;
  const alto = 52;
  J.avisos.forEach((a, i) => {
    a.t += dt;
    const entra = 1 - Math.pow(1 - Math.min(1, a.t / 0.3), 3);
    const sale = Math.max(0, (a.t - 3) / 0.4);
    const x = W - ancho - 12 + (1 - entra) * (ancho + 20) + sale * sale * (ancho + 20);
    const y = 582 - (J.avisos.length - 1 - i) * (alto + 8);
    const mujer = a.def.look.genero === 'mujer';
    const es = J.lang === 'es';
    const col = { nuevo: C.oliva, exigente: C.terracota, julay: C.mostaza, comun: C.tinta2 }[a.tipo];
    const linea2 = {
      nuevo: es ? (mujer ? 'Clienta nueva' : 'Cliente nuevo') : 'New customer',
      exigente: es ? '★ La más exigente del día' : '★ Toughest of the day',
      julay: es ? '★ ¡Viene a probar tus donas!' : '★ Here to taste your donuts!',
      comun: es ? 'Entró al local' : 'Just walked in',
    }[a.tipo];
    ctx.save();
    ctx.globalAlpha = 1 - sale * 0.6;
    panel(ctx, x, y, ancho, alto, { radio: 16, borde: col, grosor: 3 });
    retrato(ctx, a.def.look, x + 28, y + alto / 2, 19, { animo: 'feliz' });
    ctx.fillStyle = C.tinta;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = F(700, 17);
    ctx.fillText((es ? '🔔 Llegó ' : '🔔 ') + a.def.name + (es ? '' : ' arrived'), x + 56, y + 18, ancho - 66);
    ctx.font = F(600, 13);
    ctx.fillStyle = col;
    ctx.fillText(linea2, x + 56, y + 36, ancho - 66);
    ctx.restore();
  });
}

// ---------------------------------------------------------------- consejos (tutorial del día 1)

function consejo() {
  if (!(J.dia.n === 1 || J.ayudaSiempre) || J.entrega) return null;
  const d = J.dia;
  const est = J.estacion;
  let h = ESTACIONES[est].ayuda?.(J);
  // si en esta estación no hay nada que hacer, mandar a donde sí
  if (!h) {
    if (d.crudas().length && est !== 'fritura') h = { k: 'irFritura', x: TAB(2).x + 84, y: 650, lado: 'abajo' };
    else if (d.pendientes().some((t) => d.estadoTicket(t) === 'masa') && est !== 'masa') h = { k: 'irMasa', x: TAB(1).x + 84, y: 650, lado: 'abajo' };
    else if (d.listas().length && est !== 'decorado') h = { k: 'irDecorado', x: TAB(3).x + 84, y: 650, lado: 'abajo' };
  }
  return h;
}

function dibujarConsejo() {
  const h = consejo();
  if (!h) return;
  const texto = J.tr(AYUDA[h.k] || { es: h.k, en: h.k });
  ctx.save();
  ctx.font = F(600, 17);
  const w = Math.min(380, ctx.measureText(texto).width + 30);
  const lineas = Math.ceil((ctx.measureText(texto).width + 30) / 380);
  const alto = 26 + lineas * 22;
  let x;
  let y;
  if (h.lado === 'abajo') {
    x = h.x - w / 2;
    y = h.y - alto - 22;
  } else if (h.lado === 'arriba') {
    x = h.x - w / 2;
    y = h.y + 20;
  } else {
    x = h.x + 20;
    y = h.y - alto / 2;
  }
  x = Math.max(10, Math.min(W - w - 10, x));
  y = Math.max(130, Math.min(640 - alto, y));
  const bote = Math.sin(performance.now() / 260) * 3;
  burbuja(ctx, x, y + bote, w, alto, h.x, h.y + bote, { fondo: '#fff4d9' });
  parrafo(ctx, texto, x + 15, y + 13 + bote, w - 30, 22, { font: F(600, 17) });
  ctx.restore();
}

// ---------------------------------------------------------------- entrega y puntaje

const reaccion = (total) => {
  const r = REACCIONES.find((x) => total >= x.min);
  const l = r[J.lang];
  return l[Math.floor(Math.random() * l.length)];
};

function actualizarEntrega(dt) {
  const E = J.entrega;
  E.t += dt;
  const a = E.res.actor;
  if (E.fase === 'camina') {
    // solo camina el que viene a buscar su pedido (el resto del local espera)
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    const k = Math.min(1, (520 * dt) / Math.max(d, 0.001));
    a.x += dx * k;
    a.y += dy * k;
    a.fase += dt;
    a.camina = d > 2;
    if (d <= 2 || E.t > 2.5) {
      a.x = a.tx;
      a.y = a.ty;
      a.camina = false;
      E.fase = 'tarjeta';
      E.t = 0;
      E.frase = reaccion(E.res.total);
      a.animo = E.res.total >= 90 ? 'encantado' : E.res.total >= 70 ? 'feliz' : E.res.total >= 45 ? 'normal' : 'molesto';
    }
  } else {
    const paso = Math.floor(E.t / 0.45);
    if (paso > E.sonidos && paso <= 4) {
      E.sonidos = paso;
      snd('barra');
    }
    if (paso >= 5 && !E.final) {
      E.final = true;
      snd(E.res.total >= 85 ? 'feliz' : E.res.total >= 60 ? 'bien' : 'mal');
    }
  }
}

function dibujarTarjeta() {
  const E = J.entrega;
  if (!E || E.fase !== 'tarjeta') return;
  const r = E.res;
  const T = TARJETA;
  ctx.save();
  ctx.fillStyle = 'rgba(59,42,32,.35)';
  ctx.fillRect(0, 0, W, H);
  panel(ctx, T.x, T.y, T.w, T.h, { radio: 26 });
  retrato(ctx, r.actor.def.look, T.x + 76, T.y + 78, 48, { animo: r.actor.animo });
  ctx.fillStyle = C.tinta;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = F(700, 28);
  ctx.fillText(r.actor.def.name, T.x + 140, T.y + 56);
  ctx.font = F(600, 16);
  ctx.fillStyle = r.ticket.exigente ? C.terracota : C.tinta2;
  ctx.fillText(r.ticket.exigente ? '★ ' + J.tr(TXT.exigente) : (J.lang === 'es' ? 'Pedido #' : 'Order #') + r.ticket.n, T.x + 140, T.y + 84);
  // lo que dice
  ctx.font = F(500, 19);
  ctx.fillStyle = C.tinta;
  ctx.fillText('“' + E.frase + '”', T.x + 140, T.y + 116, T.w - 170);
  const claves = ['espera', 'masa', 'fritura', 'decorado'];
  claves.forEach((k, i) => {
    const y = T.y + 160 + i * 52;
    const v = Math.max(0, Math.min(1, (E.t - i * 0.45) / 0.4)) * r.notas[k];
    ctx.fillStyle = C.tinta;
    ctx.font = F(600, 19);
    ctx.textAlign = 'left';
    ctx.fillText(J.tr(TXT.notas[k]), T.x + 50, y + 11);
    const col = v >= 85 ? C.oliva : v >= 60 ? C.mostaza : C.terracota;
    barra(ctx, T.x + 200, y, 360, 24, v / 100, { color: col });
    ctx.font = F(700, 20);
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(v)), T.x + T.w - 50, y + 12);
  });
  const fin = Math.max(0, Math.min(1, (E.t - 1.9) / 0.5));
  if (fin > 0) {
    ctx.globalAlpha = fin;
    ctx.fillStyle = C.tinta;
    ctx.textAlign = 'left';
    ctx.font = F(700, 22);
    ctx.fillText(J.tr(TXT.total), T.x + 50, T.y + 384);
    ctx.font = F(700, 40);
    ctx.fillText(String(Math.round(r.total * fin)), T.x + 120, T.y + 384);
    estrellas(ctx, T.x + 230, T.y + 384, 17, (r.total / 20) * fin);
    moneda(ctx, T.x + 500, T.y + 384, 18);
    ctx.font = F(700, 26);
    ctx.fillStyle = C.oliva;
    ctx.fillText('+' + r.propina, T.x + 526, T.y + 386);
    ctx.globalAlpha = 1;
    boton(ctx, SEGUIR, J.tr(TXT.seguir), { tam: 22 });
  }
  ctx.restore();
}

function cerrarTarjeta() {
  const E = J.entrega;
  if (!E || E.fase !== 'tarjeta' || E.t < 1.9) return;
  const r = E.res;
  const s = J.save;
  s.monedas += r.propina;
  s.stats.atendidos++;
  s.stats.puntos += r.total;
  s.stats.mejor = Math.max(s.stats.mejor, r.total);
  if (r.total >= 90) s.stats.felices90++;
  if (!s.conocidos.includes(r.actor.def.id)) s.conocidos.push(r.actor.def.id);
  const nuevos = [];
  const logro = (id) => {
    if (!s.logros.includes(id)) {
      s.logros.push(id);
      nuevos.push(id);
    }
  };
  if (r.crudas.decorado >= 100) logro('decorado-100');
  if (r.crudas.fritura >= 100) logro('fritura-perfecta');
  if (r.actor.def.id === 'pocha' && r.total >= 90) logro('pocha');
  if (r.actor.def.id === 'julay' && r.total >= 85) logro('julay');
  if (s.stats.felices90 >= 10) logro('diez-felices');
  if (CLIENTES.every((c) => s.conocidos.includes(c.id))) logro('barrio');
  for (const id of nuevos) premiar(id);
  r.actor.animoFinal = r.actor.animo;
  J.dia.despedir(r.actor);
  J.entrega = null;
  J.estacion = 'mostrador';
  if (J.dia.terminado) setTimeout(finDelDia, 900);
}

/** Da el premio de un logro (monedas o una decoración) y lo avisa. */
function premiar(id) {
  const L = LOGROS.find((l) => l.id === id);
  const s = J.save;
  let premio = '';
  if (L.monedas) {
    s.monedas += L.monedas;
    premio = J.tr(TXT.monedasGanadas, { x: L.monedas });
  }
  const deco = DECO.find((d) => d.logro === id);
  if (deco) {
    if (!s.compradas.includes(deco.id)) s.compradas.push(deco.id);
    premio = J.tr(TXT.decoGanada, { x: J.tr(deco.name) });
  }
  (J.logrosHoy = J.logrosHoy || []).push({ L, premio });
  J.toast(`${J.tr(TXT.logroNuevo)} ${J.tr(L.name)}`);
  snd('logro');
}

// ---------------------------------------------------------------- días

function empezarDia() {
  J.dia = new Dia(J.save);
  J.sel = { masa: null, fritura: null, decorado: null };
  J.masa = masa.estado();
  J.fritura = fritura.estado();
  J.decorado = decorado.estado();
  J.estacion = 'mostrador';
  J.entrega = null;
  J.toasts = [];
  J.logrosHoy = [];
  J.modo = 'jugando';
  J.pausado = false;
  gameplay();
}

function finDelDia() {
  if (J.modo !== 'jugando' || !J.dia?.terminado) return;
  const d = J.dia;
  const s = J.save;
  const res = d.resultados;
  if (d.n === 1) premiarSiNuevo('primer-dia');
  if (res.length && res.every((r) => r.total >= 80)) premiarSiNuevo('dia-redondo');
  const julay = res.find((r) => r.actor.def.id === 'julay');
  const final = !s.final && d.n >= 21 && julay && julay.total >= 75;
  s.dia = d.n + 1;
  if (final) s.final = true;
  guardar(s);
  J.modo = 'menu';
  gameplay();
  snd('dia');
  const info = {
    n: d.n,
    resultados: res,
    ganado: res.reduce((a, r) => a + r.propina, 0),
    promedio: Math.round(res.reduce((a, r) => a + r.total, 0) / Math.max(1, res.length)),
    logros: J.logrosHoy || [],
  };
  const acciones = {
    onDecorar: () => ui.tienda(J, { onVolver: () => ui.finDia(J, info, acciones) }),
    onVestidor: () => ui.creador(J, { volver: true, onListo: () => ui.finDia(J, info, acciones) }),
    onSiguiente: () => inicioDia(),
  };
  const despues = () => ui.finDia(J, info, acciones);
  if (final) ui.pelicula(J, 'final', { onFin: despues });
  else despues();
}

function premiarSiNuevo(id) {
  if (!J.save.logros.includes(id)) {
    J.save.logros.push(id);
    premiar(id);
  }
}

/** La pantalla de presentación del día (clientes nuevos, ingredientes, postal) y después a jugar. */
function inicioDia() {
  const n = J.save.dia;
  const nuevos = CLIENTES.filter((c) => c.day === n);
  const ingredientes = [];
  for (const [cat, lista] of [['masa', MASAS], ['forma', FORMAS], ['relleno', RELLENOS], ['bano', BANOS], ['hilos', HILOS], ['topping', TOPPINGS], ['pieza', PIEZAS]])
    for (const it of lista) if (it.day === n && n > 1) ingredientes.push({ cat, it });
  const postal = POSTALES.find((p) => p.day === n);
  if (postal && !J.save.postales.includes(n)) J.save.postales.push(n);
  ui.inicioDia(J, { n, nuevos, ingredientes, postal, exigente: exigenteDelDia(n) }, { onAbrir: empezarDia });
}

// ---------------------------------------------------------------- entrada

let activo = null;

canvas.addEventListener('pointerdown', (e) => {
  if (J.modo !== 'jugando' || J.pausado) return;
  canvas.setPointerCapture(e.pointerId);
  const p = punto(e);
  activo = e.pointerId;
  if (J.entrega) {
    if (J.entrega.fase === 'tarjeta' && (dentroRect(p, SEGUIR) || J.entrega.t > 1.9)) cerrarTarjeta();
    return;
  }
  // pestañas y botones de abajo
  for (let i = 0; i < 4; i++)
    if (dentroRect(p, TAB(i))) {
      J.irA(ORDEN[i]);
      return;
    }
  if (dentroRect(p, BOTON_MENU)) return abrirPausa();
  if (dentroRect(p, BOTON_AYUDA)) {
    J.ayudaSiempre = !J.ayudaSiempre;
    J.toast(J.ayudaSiempre ? (J.lang === 'es' ? 'Consejos prendidos' : 'Tips on') : J.lang === 'es' ? 'Consejos apagados' : 'Tips off');
    return;
  }
  // riel de tickets
  for (const { tk, x, y } of railTickets())
    if (p.x >= x && p.x <= x + 96 && p.y >= y - 8 && p.y <= y + 126) {
      if (J.estacion !== 'mostrador') J.sel[J.estacion] = tk;
      snd('click');
      return;
    }
  ESTACIONES[J.estacion].down(J, p);
});
canvas.addEventListener('pointermove', (e) => {
  if (J.modo !== 'jugando' || J.pausado || J.entrega) return;
  if (activo !== null && e.pointerId !== activo) return;
  ESTACIONES[J.estacion].move(J, punto(e));
});
const soltar = (e) => {
  if (e.pointerId !== activo) return;
  activo = null;
  if (J.modo !== 'jugando' || J.entrega) return;
  ESTACIONES[J.estacion].up(J, punto(e));
};
canvas.addEventListener('pointerup', soltar);
canvas.addEventListener('pointercancel', soltar);

addEventListener('keydown', (e) => {
  if (J.modo !== 'jugando') return;
  if (e.key === 'Escape') return J.pausado ? cerrarPausa() : abrirPausa();
  if (J.pausado) return;
  if (J.entrega && (e.key === 'Enter' || e.key === ' ')) return cerrarTarjeta();
  const k = ['1', '2', '3', '4'].indexOf(e.key);
  if (k >= 0) J.irA(ORDEN[k]);
});

// ---------------------------------------------------------------- pausa

function abrirPausa() {
  if (J.modo !== 'jugando') return;
  J.pausado = true;
  gameplay();
  ui.pausa(J, {
    onSeguir: cerrarPausa,
    onSalirJuego: () => G?.exit?.(),
    onSalir: () => {
      J.pausado = false;
      J.modo = 'menu';
      gameplay();
      titulo();
    },
  });
}

function cerrarPausa() {
  ui.cerrar();
  J.pausado = false;
  gameplay();
}

function gameplay() {
  G?.gameplay?.(J.modo === 'jugando' && !J.pausado);
}

// ---------------------------------------------------------------- bucle

let ultimo = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - ultimo) / 1000) * (J.vel || 1); // vel: solo para las pruebas
  ultimo = now;
  const t = now / 1000;
  if (J.modo === 'jugando' && !J.pausado && !J.portalPausa) {
    if (J.entrega) actualizarEntrega(dt);
    else {
      J.dia.update(dt);
      for (const ev of J.dia.eventos) {
        if (['llega', 'exigente', 'ticket', 'aceite', 'vuelta', 'sacar', 'punto', 'quema', 'tirar'].includes(ev.tipo)) snd(ev.tipo);
        if (ev.tipo === 'llega') {
          J.campana = 1;
          avisoLlegada(ev.actor);
        }
        if (ev.tipo === 'punto' && J.estacion !== 'fritura') J.toast(J.lang === 'es' ? '¡Mirá la freidora!' : 'Check the fryer!');
      }
      J.dia.eventos.length = 0;
    }
    J.campana = Math.max(0, J.campana - dt);
    // la puerta se abre cuando alguien entra o sale
    const cerca = J.dia.actores.some((a) => a.estado !== 'fuera' && a.x < 160 && a.y < 590);
    J.puerta = (J.puerta || 0) + ((cerca ? 1 : 0) - (J.puerta || 0)) * Math.min(1, dt * 7);
    for (const k of ORDEN) ESTACIONES[k].update(J, dt);
  }
  chisporroteo(J.dia ? J.dia.freidora.filter(Boolean).length : 0, J.estacion === 'fritura', J.modo !== 'jugando' || J.pausado || J.portalPausa);
  musicaFondo(J.musica, J.portalPausa);
  dibujar(t, dt);
  requestAnimationFrame(frame);
}

function dibujar(t, dt) {
  ctx.setTransform(J.escala, 0, 0, J.escala, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if (!J.dia) {
    // detrás del menú: el local vacío
    J.dia = new Dia(J.save || partidaNueva('', { skin: 2, hair: 'rulos', hairColor: 'castano', body: 'adulto', shirt: C.mostaza, pants: '#3b2a20', apron: C.crema }));
    J.dia.n = J.save?.dia || 1;
  }
  if (!J.save) J.save = J.dia.save;
  ESTACIONES[J.estacion].draw(ctx, J, t);
  // al cambiar de estación, la anterior se desvanece corriéndose un poco
  if (fade.k < 1) {
    fade.k = Math.min(1, fade.k + dt / (J.vel || 1) / 0.22);
    const e = 1 - Math.pow(1 - fade.k, 2);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1 - e;
    ctx.drawImage(fade.c, -fade.dir * e * canvas.width * 0.06, 0);
    ctx.restore();
  }
  if (J.modo === 'jugando') {
    dibujarRiel();
    dibujarPestanas(t);
    dibujarConsejo();
    dibujarTarjeta();
    dibujarToasts(dt);
    dibujarAvisos(dt);
  }
}

/** El fundido entre estaciones: guarda cómo se veía la pantalla antes de cambiar. */
const fade = { c: document.createElement('canvas'), k: 1, dir: 1 };
function fundido(dir) {
  fade.c.width = canvas.width;
  fade.c.height = canvas.height;
  fade.c.getContext('2d').drawImage(canvas, 0, 0);
  fade.k = 0;
  fade.dir = dir;
}

// ---------------------------------------------------------------- menú principal y arranque

function titulo() {
  J.estacion = 'mostrador';
  J.dia = null; // de fondo, el local vacío
  J.entrega = null;
  const hay = cargar();
  if (hay) J.save = hay;
  ui.titulo(J, {
    hayPartida: !!hay,
    onSeguir: () => inicioDia(),
    onNueva: () => {
      const nueva = () => {
        // si ya había partida, el personaje se queda como estaba; si no, uno al azar
        J.save = partidaNueva('', { ...lookAlAzar(), ...hay?.look });
        J.save.dificultad = ui.dificultadElegida(J, false);
        ui.creador(J, {
          onListo: () => {
            guardar(J.save);
            ui.pelicula(J, 'inicio', { onFin: inicioDia });
          },
        });
      };
      if (hay) ui.confirmar(J, J.tr(TXT.confirmarNueva), () => (borrar(), nueva()), titulo);
      else nueva();
    },
  });
}

G?.onPrefs?.((p) => {
  J.lang = p.lang === 'en' ? 'en' : 'es';
  J.reducido = !!p.reducedMotion;
  ponerIdioma(J.lang);
  ui.idioma(J);
}, true);
G?.onPause?.(() => {
  J.portalPausa = true;
  if (J.modo === 'jugando' && !J.pausado) abrirPausa();
});
G?.onResume?.(() => {
  J.portalPausa = false;
});

const fuentes = Promise.race([document.fonts?.load?.('700 20px Fredoka') || Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);
fuentes.then(() => {
  titulo();
  requestAnimationFrame(frame);
  G?.ready?.();
});

export { J };
