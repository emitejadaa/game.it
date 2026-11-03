/**
 * Pantallas en HTML sobre el canvas: título, vestidor (crear tu personaje), historia, inicio y fin
 * del día, decoración del local, pausa y ayuda.
 */
import { C, TXT, DIFICULTADES, PIELES, PELOS, ROPA, OJOS as OJOS_COL, ORDEN_PIELES, LOGROS, DECO, DECO_INICIAL, SLOTS, MEJORAS, COLORES_LOCAL, byId } from './data.js';
import { persona, retrato, dona, donaIdeal, altoPersona, completarLook, lookJugador } from './art.js';

import { icono } from './ticket.js';
import { salon, mesas, rincon, mostrador, cocina, LUGARES, decoDe } from './local.js';
import { dibujarMejora } from './mejoras.js';
import { tomas, dibujarPelicula, inicioDeToma, PW, PH } from './pelicula.js';
import { guardar, lookAlAzar } from './guardado.js';
import { bonusDeco } from './dia.js';
import { moneda } from './dibujo.js';

const root = document.getElementById('ui');
let ultimo = null; // para volver a dibujar si cambia el idioma
let anim = 0;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function mostrar(html, clase = '') {
  cancelAnimationFrame(anim);
  root.innerHTML = `<div class="pantalla ${clase}">${html}</div>`;
  root.hidden = false;
  return root.firstElementChild;
}

export function cerrar() {
  cancelAnimationFrame(anim);
  root.hidden = true;
  root.innerHTML = '';
  ultimo = null;
}

export function idioma(J) {
  if (ultimo) ultimo();
}

/** Un canvas dentro del HTML, nítido en pantallas de alta densidad. */
function lienzo(el, w, h, dibujar) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  el.width = Math.round(w * dpr);
  el.height = Math.round(h * dpr);
  el.style.aspectRatio = `${w} / ${h}`;
  const ctx = el.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  dibujar(ctx);
  return ctx;
}

function retratoEn(el, look, animo = 'feliz', fondo = C.crema) {
  lienzo(el, 64, 64, (ctx) => retrato(ctx, look, 32, 32, 29, { animo, fondo }));
}

const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));

// ---------------------------------------------------------------- título

/** Prender o apagar la música (queda guardado en este navegador). */
function alternarMusica(J) {
  J.musica = !J.musica;
  try {
    localStorage.setItem('gameit:julays-donas:musica', J.musica ? 'si' : 'no');
  } catch {}
  J.snd('click');
}

/** La dificultad elegida: la de la partida guardada, o la última que elegiste para una nueva. */
export function dificultadElegida(J, hayPartida) {
  if (hayPartida && J.save?.dificultad) return J.save.dificultad;
  try {
    return localStorage.getItem('gameit:julays-donas:dificultad') || 'medio';
  } catch {
    return 'medio';
  }
}

export function titulo(J, o) {
  ultimo = () => titulo(J, o);
  const dif = dificultadElegida(J, o.hayPartida);
  const el = mostrar(
    `<div class="tarjeta titulo">
      <div class="marca">
        <canvas class="logo-dona"></canvas>
        <h1>Julay’s Donas</h1>
        <p class="bajada">${J.tr({ es: 'Tomá pedidos, armá la masa, freí y decorá. El último cliente del día es el más exigente.', en: 'Take orders, shape the dough, fry and decorate. The last customer of the day is the toughest.' })}</p>
      </div>
      <div class="menu">
      <div class="botones">
        ${o.hayPartida ? `<button class="b primario" data-a="seguir">${J.tr(TXT.seguir)} · ${J.tr(TXT.dia, { d: J.save.dia })}</button>` : ''}
        ${o.hayPartida ? `<button class="b" data-a="vestidor">${J.tr(TXT.vestidor)}</button>` : ''}
        <button class="b ${o.hayPartida ? '' : 'primario'}" data-a="nueva">${J.tr(TXT.nueva)}</button>
        <button class="b" data-a="ayuda">${J.tr(TXT.comoSeJuega)}</button>
      </div>
      <div class="dificultad">
        <span>${J.tr(TXT.dificultad)}</span>
        <div class="tabs">${Object.entries(DIFICULTADES).map(([id, d]) => `<button class="chip${id === dif ? ' on' : ''}" data-dif="${id}">${J.tr(d.name)}</button>`).join('')}</div>
        <small>${J.tr(DIFICULTADES[dif].desc)}</small>
      </div>
      <button class="chip" data-a="musica">🎵 ${J.tr(TXT.musica)}: ${J.tr(J.musica ? TXT.si2 : TXT.no2)}</button>
      </div>
    </div>`,
    'con-fondo',
  );
  on('[data-a="musica"]', 'click', () => {
    alternarMusica(J);
    titulo(J, o);
  });
  on('[data-dif]', 'click', (e) => {
    const id = e.currentTarget.dataset.dif;
    try {
      localStorage.setItem('gameit:julays-donas:dificultad', id);
    } catch {}
    // si hay partida guardada, se cambia también en ella (se nota desde el próximo día)
    if (o.hayPartida && J.save) {
      J.save.dificultad = id;
      guardar(J.save);
    }
    J.snd('click');
    titulo(J, o);
  });
  const logo = el.querySelector('.logo-dona');
  let t = 0;
  const giro = () => {
    t += 0.016;
    lienzo(logo, 150, 150, (ctx) => {
      ctx.translate(75, 75);
      ctx.rotate(J.reducido ? 0 : Math.sin(t) * 0.12);
      dona(ctx, donaIdeal({ masa: 'chocolate', forma: 'anillo', relleno: null, bano: 'frutilla', hilos: 'blanco', toppings: ['granas'], pieza: null }), 0, 0, 62);
    });
    anim = requestAnimationFrame(giro);
  };
  giro();
  on('[data-a="seguir"]', 'click', () => o.onSeguir());
  on('[data-a="nueva"]', 'click', () => o.onNueva());
  on('[data-a="vestidor"]', 'click', () => creador(J, { volver: true, onListo: () => titulo(J, o) }));
  on('[data-a="ayuda"]', 'click', () => ayuda(J, () => titulo(J, o)));
}

// ---------------------------------------------------------------- vestidor

const ESTAMPAS = [
  ['liso', { es: 'Liso', en: 'Plain' }],
  ['rayas', { es: 'Rayas', en: 'Stripes' }],
  ['lunares', { es: 'Lunares', en: 'Dots' }],
  ['cuadros', { es: 'Cuadros', en: 'Plaid' }],
  ['flores', { es: 'Flores', en: 'Flowers' }],
  ['corazones', { es: 'Corazones', en: 'Hearts' }],
];
const op = (es, en) => ({ es, en: en || es });
const ESTILOS = [
  ['corto', op('Corto', 'Short')],
  ['raya', op('Con raya', 'Side part')],
  ['flequillo', op('Flequillo', 'Bangs')],
  ['jopo', op('Jopo', 'Quiff')],
  ['rulos', op('Rulos', 'Curls')],
  ['melena', op('Melena', 'Bob')],
  ['largo', op('Largo', 'Long')],
  ['ondas', op('Ondas', 'Waves')],
  ['colita', op('Colita', 'Ponytail')],
  ['coletas', op('Coletas', 'Pigtails')],
  ['rodete', op('Rodete', 'Bun')],
  ['trenzas', op('Trenzas', 'Braids')],
  ['afro', op('Afro')],
  ['mohicano', op('Mohicano', 'Mohawk')],
  ['rapado', op('Rapado', 'Buzz cut')],
  ['pelado', op('Pelado', 'Bald')],
];
/** Cada pestaña del vestidor: filas de chips (opciones), colores o interruptores. */
const VESTIDOR = {
  cuerpo: [
    { t: TXT.soy, campo: 'genero', chips: [['mujer', op('Mujer', 'Woman')], ['hombre', op('Hombre', 'Man')]] },
    { t: TXT.contextura, campo: 'body', chips: [['adulto', op('Mediana', 'Medium')], ['alto', op('Alta', 'Tall')], ['robusto', op('Robusta', 'Sturdy')]] },
    { t: TXT.piel, campo: 'skin', pieles: true },
  ],
  cara: [
    { t: TXT.formaOjos, campo: 'eyes', chips: [['punto', op('Puntitos', 'Dots')], ['grande', op('Grandes', 'Big')], ['pestanas', op('Pestañas', 'Lashes')], ['almendra', op('Almendrados', 'Almond')], ['feliz', op('Sonrientes', 'Smiling')]] },
    { t: TXT.colorOjos, campo: 'eyeColor', mapa: OJOS_COL },
    { t: TXT.barba, campo: 'beard', chips: [[null, TXT.ninguno], ['bigote', op('Bigote', 'Mustache')], ['barba', op('Barba', 'Beard')], ['candado', op('Candado', 'Goatee')]] },
    { t: TXT.detalles, toggles: [['freckles', op('Pecas', 'Freckles')], ['earrings', op('Aros', 'Earrings')]] },
    { t: TXT.anteojos, campo: 'glasses', chips: [[null, TXT.ninguno], ['redondos', op('Redondos', 'Round')], ['cuadrados', op('Cuadrados', 'Square')], ['gato', op('Ojo de gato', 'Cat-eye')], ['sol', op('De sol', 'Sunglasses')]] },
  ],
  pelo: [
    { t: TXT.peinado, campo: 'hair', chips: ESTILOS },
    { t: TXT.colorPelo, campo: 'hairColor', mapa: PELOS },
  ],
  arriba: [
    { t: TXT.prenda, campo: 'style', chips: [['remera', op('Remera', 'T-shirt')], ['camisa', op('Camisa', 'Shirt')], ['chomba', op('Chomba', 'Polo')], ['polera', op('Polera', 'Turtleneck')], ['buzo', op('Buzo', 'Hoodie')], ['musculosa', op('Musculosa', 'Tank top')]] },
    { t: TXT.color, campo: 'shirt', colores: true },
    { t: TXT.estampado, campo: 'estampa', chips: ESTAMPAS },
    { t: TXT.colorEstampado, campo: 'shirt2', colores: true, si: (L) => L.estampa && L.estampa !== 'liso' },
  ],
  abajo: [
    { t: TXT.prenda, campo: 'abajo', chips: [['pantalon', op('Pantalón', 'Pants')], ['jean', op('Jean', 'Jeans')], ['short', op('Short', 'Shorts')], ['pollera', op('Pollera', 'Skirt')]] },
    { t: TXT.color, campo: 'pants', colores: true },
    { t: TXT.calzado, campo: 'calzado', chips: [['zapatillas', op('Zapatillas', 'Sneakers')], ['botas', op('Botas', 'Boots')], ['zapatos', op('Zapatos', 'Shoes')]] },
    { t: TXT.colorCalzado, campo: 'shoes', colores: true },
  ],
  delantal: [
    { t: TXT.estilo, campo: 'delantal', chips: [['pechera', op('Con pechera', 'Bib apron')], ['cintura', op('De cintura', 'Waist apron')], ['ninguno', op('Sin delantal', 'No apron')]] },
    { t: TXT.color, campo: 'apron', colores: true, si: (L) => L.delantal !== 'ninguno' },
    { t: TXT.estampado, campo: 'apronEstampa', chips: ESTAMPAS, si: (L) => L.delantal !== 'ninguno' },
    { t: TXT.colorEstampado, campo: 'apron2', colores: true, si: (L) => L.delantal !== 'ninguno' && L.apronEstampa && L.apronEstampa !== 'liso' },
  ],
  extras: [
    { t: TXT.sombrero, campo: 'hat', chips: [[null, TXT.ninguno], ['panuelo', op('Pañuelo', 'Bandana')], ['gorra', op('Gorra', 'Cap')], ['gorro', op('Gorro de lana', 'Beanie')], ['chef', op('De chef', 'Chef hat')], ['boina', op('Boina', 'Beret')], ['sombrero', op('Sombrero', 'Hat')], ['vincha', op('Vincha', 'Headband')], ['mono', op('Moño', 'Bow')]] },
    { t: TXT.colorGorro, campo: 'hatColor', colores: true, si: (L) => L.hat && L.hat !== 'chef' },
    { t: TXT.cuello, campo: 'cuello', chips: [[null, TXT.ninguno], ['panuelo', op('Pañuelo', 'Neckerchief')], ['mono', op('Moñito', 'Bow tie')], ['collar', op('Collar', 'Necklace')], ['bufanda', op('Bufanda', 'Scarf')]] },
    { t: TXT.colorCuello, campo: 'cuelloColor', colores: true, si: (L) => !!L.cuello },
  ],
};
const PESTANAS = Object.keys(VESTIDOR);
let pestana = 'cuerpo';

export function creador(J, o, tab = pestana) {
  // cada opción vuelve a dibujar la pantalla: que la lista no salte arriba
  const antes = tab === pestana ? root.querySelector('.vestidor .cuerpo')?.scrollTop || 0 : 0;
  pestana = tab;
  ultimo = () => creador(J, o, tab);
  J.save.look = completarLook(J.save.look);
  const L = J.save.look;
  const fila = (titulo, html) => `<div class="fila"><span>${titulo}</span><div class="opciones">${html}</div></div>`;
  const chip = (campo, v, n) => `<button class="chip${(L[campo] ?? null) === v ? ' on' : ''}" data-campo="${campo}" data-v="${v ?? ''}">${esc(J.tr(n))}</button>`;
  const color = (campo, c, v = c, extra = '') => `<button class="color${L[campo] === v ? ' on' : ''}" style="--c:${c}" data-campo="${campo}" data-v="${v}"${extra} aria-label="${v}"></button>`;
  const filas = VESTIDOR[tab]
    .filter((f) => !f.si || f.si(L))
    .map((f) => {
      let html = '';
      if (f.chips) html = f.chips.map(([v, n]) => chip(f.campo, v, n)).join('');
      else if (f.pieles) html = ORDEN_PIELES.map((i) => color('skin', PIELES[i], i, ' data-num="1"')).join('');
      else if (f.mapa) html = Object.entries(f.mapa).map(([k, c]) => color(f.campo, c, k)).join('');
      else if (f.colores) html = ROPA.map((c) => color(f.campo, c)).join('');
      else if (f.toggles) html = f.toggles.map(([k, n]) => `<button class="chip${L[k] ? ' on' : ''}" data-toggle="${k}">${esc(J.tr(n))}</button>`).join('');
      return fila(J.tr(f.t), html);
    });
  const el = mostrar(
    `<div class="tarjeta vestidor">
      <div class="vista">
        <canvas class="persona"></canvas>
        <label class="nombre"><span>${J.tr(TXT.tuNombre)}</span><input maxlength="14" value="${esc(J.save.nombre || '')}" placeholder="${J.lang === 'es' ? 'Ej: Juli' : 'E.g. Jules'}"></label>
      </div>
      <div class="ajustes">
        <h2>${J.tr(o.volver ? TXT.vestidor : TXT.quienSos)}</h2>
        <div class="tabs">${PESTANAS.map((id) => `<button class="chip${id === tab ? ' on' : ''}" data-tab="${id}">${esc(J.tr(TXT.pestanasVestidor[id]))}</button>`).join('')}</div>
        <div class="cuerpo">${filas.join('')}${tab === 'delantal' ? `<p class="nota">${J.tr(TXT.plaquita)}</p>` : ''}</div>
        <div class="botones">
          <button class="b" data-a="azar">🎲 ${J.tr(TXT.azar)}</button>
          <button class="b primario" data-a="listo">${J.tr(TXT.listo)}</button>
        </div>
      </div>
    </div>`,
  );
  el.querySelector('.cuerpo').scrollTop = antes;
  const cv = el.querySelector('.persona');
  let t = 0;
  const loop = () => {
    t += 0.016;
    lienzo(cv, 300, 380, (ctx) => {
      ctx.fillStyle = '#efe2cb';
      ctx.beginPath();
      ctx.ellipse(150, 358, 110, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      const look = lookJugador(J.save);
      // lo más grande posible (con lugar arriba para el gorro de chef)
      const s = Math.min(1.3, 340 / (altoPersona(look) + (look.hat === 'chef' ? 50 : look.hat || look.hair === 'mohicano' || look.hair === 'rodete' ? 26 : 12)));
      persona(ctx, look, 150, 362, s, { t, animo: Math.sin(t * 0.7) > 0.6 ? 'encantado' : 'feliz', pose: Math.sin(t * 0.5) > 0.85 ? 'saluda' : undefined });
    });
    anim = requestAnimationFrame(loop);
  };
  loop();
  const input = el.querySelector('input');
  input.addEventListener('input', () => (J.save.nombre = input.value.trim()));
  on('[data-tab]', 'click', (e) => {
    J.snd('click');
    creador(J, o, e.currentTarget.dataset.tab);
  });
  on('[data-campo]', 'click', (e) => {
    const b = e.currentTarget;
    const v = b.dataset.v === '' ? null : b.dataset.num ? Number(b.dataset.v) : b.dataset.v;
    J.save.look = { ...J.save.look, [b.dataset.campo]: v };
    J.snd('click');
    creador(J, o);
  });
  on('[data-toggle]', 'click', (e) => {
    const k = e.currentTarget.dataset.toggle;
    J.save.look = { ...J.save.look, [k]: !J.save.look[k] };
    J.snd('click');
    creador(J, o);
  });
  on('[data-a="azar"]', 'click', () => {
    J.save.look = lookAlAzar();
    J.snd('click');
    creador(J, o);
  });
  on('[data-a="listo"]', 'click', () => {
    if (!J.save.nombre) J.save.nombre = J.lang === 'es' ? 'Juli' : 'Jules';
    guardar(J.save);
    J.snd('listo');
    o.onListo();
  });
}

// ---------------------------------------------------------------- la película de la historia

/** La historia animada ('inicio' o 'final'). Tocá para pasar a la siguiente toma; «Saltar» la termina. */
export function pelicula(J, cual, o) {
  ultimo = null;
  const s = J.save;
  const deco = decoDe(s);
  const info = {
    yo: lookJugador(s),
    tr: (x) => J.tr(x).replaceAll('{n}', s.nombre || 'Juli'),
    lang: J.lang,
    toldo: s.colores?.toldo,
    colorCartel: s.colores?.cartel,
    pared: s.colores?.pared,
    deco,
    monedas: s.monedas,
  };
  const lista = tomas(cual, info);
  const el = mostrar(
    `<div class="pelicula">
      <canvas></canvas>
      <div class="controles">
        <span class="puntos">${lista.map(() => '<i></i>').join('')}</span>
        <button class="b chico" data-a="saltar">${J.tr(TXT.saltar)} ⏭</button>
      </div>
    </div>`,
    'cine',
  );
  const cv = el.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const puntos = [...el.querySelectorAll('.puntos i')];
  let tiempo = 0;
  let previo = performance.now();
  let terminado = false;
  const fin = () => {
    if (terminado) return;
    terminado = true;
    cerrar();
    o.onFin();
  };
  const loop = (ahora) => {
    const dt = Math.min(0.05, (ahora - previo) / 1000);
    previo = ahora;
    const antes = tiempo;
    tiempo += dt;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.max(2, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    ctx.setTransform(w / PW, 0, 0, h / PH, 0, 0);
    const res = dibujarPelicula(ctx, lista, tiempo, ahora / 1000);
    // sonidos en su momento
    const t0 = inicioDeToma(lista, res.i);
    for (const [ts, nombre] of lista[res.i].sonidos || []) if (antes < t0 + ts && tiempo >= t0 + ts) J.snd(nombre);
    puntos.forEach((p, i) => p.classList.toggle('on', i === res.i));
    if (res.fin) return fin();
    anim = requestAnimationFrame(loop);
  };
  anim = requestAnimationFrame(loop);
  cv.addEventListener('click', () => {
    let t0 = 0;
    for (let i = 0; i < lista.length; i++) {
      t0 += lista[i].dur;
      if (tiempo < t0) {
        if (i === lista.length - 1) return fin();
        tiempo = t0;
        return;
      }
    }
  });
  on('[data-a="saltar"]', 'click', fin);
}

// ---------------------------------------------------------------- inicio del día

export function inicioDia(J, info, o) {
  ultimo = () => inicioDia(J, info, o);
  const n = info.n;
  const nuevos = info.nuevos
    .map((c) => `<div class="cliente"><canvas data-look="${c.id}"></canvas><div><b>${esc(c.name)}</b><small>“${esc(J.tr(c.line))}”</small></div></div>`)
    .join('');
  const ingr = info.ingredientes.map(({ cat, it }, k) => `<div class="ingrediente"><canvas data-ingr="${k}"></canvas><span>${esc(J.tr(it.name))}</span></div>`).join('');
  const ex = info.exigente;
  const el = mostrar(
    `<div class="tarjeta dia">
      <h1>${J.tr(TXT.dia, { d: n })}</h1>
      <div class="cuerpo dos">
        <div class="col">
          ${n === 1 ? `<p class="bajada">${J.lang === 'es' ? '¡Tu primer día! Te vamos a ir dando consejos.' : 'Your first day! We’ll give you tips along the way.'}</p>` : ''}
          ${info.postal ? `<div class="postal"><small>${J.tr(TXT.postal)} · ${esc(J.tr(info.postal.lugar))}</small><p>${esc(J.tr(info.postal))}</p><i>— Julay</i></div>` : ''}
          <h3>${J.tr(TXT.ultimoDelDia)}</h3>
          <div class="cliente exigente"><canvas data-look="ex"></canvas><div><b>★ ${esc(ex.name)}</b><small>“${esc(J.tr(ex.line))}”</small></div></div>
        </div>
        <div class="col">
          ${nuevos ? `<h3>${J.tr(TXT.nuevosHoy)}</h3><div class="clientes">${nuevos}</div>` : ''}
          ${ingr ? `<h3>${J.tr(TXT.nuevosIngredientes)}</h3><div class="ingredientes">${ingr}</div>` : ''}
        </div>
      </div>
      <div class="botones"><button class="b primario" data-a="abrir">${J.tr(TXT.abrir)}</button></div>
    </div>`,
    'con-fondo',
  );
  el.querySelectorAll('[data-look]').forEach((cv) => {
    const def = cv.dataset.look === 'ex' ? ex : info.nuevos.find((c) => c.id === cv.dataset.look);
    retratoEn(cv, def.look, 'feliz');
  });
  el.querySelectorAll('[data-ingr]').forEach((cv) => {
    const { cat, it } = info.ingredientes[+cv.dataset.ingr];
    lienzo(cv, 56, 56, (ctx) => {
      if (cat === 'forma') dona(ctx, { id: 2, masa: 'vainilla', forma: it.id, coc: [1, 1] }, 28, 28, it.id === 'baston' ? 16 : 22, { sombra: false });
      else if (cat === 'masa') dona(ctx, { id: 2, masa: it.id, forma: 'anillo', coc: [1, 1] }, 28, 28, 22, { sombra: false });
      else icono(ctx, cat, it.id, 28, 30, 44);
    });
  });
  on('[data-a="abrir"]', 'click', () => {
    J.snd('listo');
    cerrar();
    o.onAbrir();
  });
}

// ---------------------------------------------------------------- fin del día

export function finDia(J, info, o) {
  ultimo = () => finDia(J, info, o);
  const filas = info.resultados
    .map((r, k) => `<div class="resultado"><canvas data-r="${k}"></canvas><span>${esc(r.actor.def.name)}${r.ticket.exigente ? ' ★' : ''}</span><b>${r.total}</b><em>+${r.propina}</em></div>`)
    .join('');
  const logros = info.logros.map((l) => `<div class="logro"><b>${J.tr(TXT.logroNuevo)} ${esc(J.tr(l.L.name))}</b><small>${esc(J.tr(l.L.desc))}${l.premio ? ' · ' + esc(l.premio) : ''}</small></div>`).join('');
  const el = mostrar(
    `<div class="tarjeta fin">
      <h1>${J.tr(TXT.finDia, { d: info.n })}</h1>
      <div class="cuerpo dos">
        <div class="col">
          <div class="resumen">
            <div><small>${J.tr(TXT.atendidos)}</small><b>${info.resultados.length}</b></div>
            <div><small>${J.tr(TXT.promedio)}</small><b>${info.promedio}</b></div>
            <div><small>${J.tr(TXT.ganaste)}</small><b><canvas class="moneda"></canvas>${info.ganado}</b></div>
          </div>
          ${J.save.final && info.n >= 21 ? `<p class="bajada">${J.tr(TXT.modoLibre)}</p>` : ''}
          ${logros ? `<div class="logros">${logros}</div>` : ''}
        </div>
        <div class="resultados">${filas}</div>
      </div>
      <div class="botones">
        <button class="b" data-a="decorar">${J.tr(TXT.decorar)}</button>
        <button class="b" data-a="vestidor">${J.tr(TXT.vestidor)}</button>
        <button class="b primario" data-a="sig">${J.tr(TXT.siguienteDia, { d: J.save.dia })}</button>
      </div>
    </div>`,
    'con-fondo',
  );
  el.querySelectorAll('[data-r]').forEach((cv) => {
    const r = info.resultados[+cv.dataset.r];
    retratoEn(cv, r.actor.def.look, r.total >= 90 ? 'encantado' : r.total >= 70 ? 'feliz' : r.total >= 45 ? 'normal' : 'molesto');
  });
  el.querySelectorAll('canvas.moneda').forEach((cv) => lienzo(cv, 26, 26, (ctx) => moneda(ctx, 13, 13, 11)));
  on('[data-a="decorar"]', 'click', () => o.onDecorar());
  on('[data-a="vestidor"]', 'click', () => o.onVestidor());
  on('[data-a="sig"]', 'click', () => {
    cerrar();
    o.onSiguiente();
  });
}

// ---------------------------------------------------------------- decorar el local

/**
 * Mejorar el local: la cocina (herramientas que cambian el juego), los colores (gratis) y la
 * decoración de cada lugar. prueba: lo que se está mirando antes de comprar.
 */
export function tienda(J, o, slot = 'cocina', prueba = null) {
  const lista = root.querySelector('.tienda .items');
  const antes = lista && lista.dataset.slot === slot ? lista.scrollTop : 0;
  ultimo = () => tienda(J, o, slot, prueba);
  const s = J.save;
  s.mejoras = s.mejoras || {};
  s.colores = s.colores || {};
  const pestanas = [
    { id: 'cocina', name: TXT.cocinaTab },
    { id: 'colores', name: TXT.coloresTab },
    ...SLOTS,
  ];
  const tabs = pestanas.map((sl) => `<button class="chip${sl.id === slot ? ' on' : ''}${sl.id === 'cocina' ? ' cocina' : ''}" data-slot="${sl.id}">${sl.id === 'cocina' ? '🔧 ' : sl.id === 'colores' ? '🎨 ' : ''}${esc(J.tr(sl.name))}</button>`).join('');
  const boton = (precio, attr) => `<button class="b chico ${s.monedas >= precio ? 'primario' : ''}" ${attr} ${s.monedas >= precio ? '' : 'disabled'}>${J.tr(TXT.comprar)} · ${precio}</button>`;
  let items;
  if (slot === 'cocina') {
    prueba = prueba || MEJORAS.find((m) => !s.mejoras[m.id])?.id || MEJORAS[0].id;
    items = MEJORAS.map((m) => {
      const accion = s.mejoras[m.id] ? `<button class="b chico" disabled>✓ ${J.tr(TXT.comprada)}</button>` : boton(m.precio, `data-mejora="${m.id}"`);
      const det = prueba === m.id ? `${J.tr(TXT.estaciones[m.est])} · ${J.tr(m.desc)}` : J.tr(TXT.estaciones[m.est]);
      return `<div class="item${prueba === m.id ? ' prueba' : ''}" data-probar="${m.id}"><div><b>${esc(J.tr(m.name))}</b><small>${esc(det)}</small></div>${accion}</div>`;
    }).join('');
  } else if (slot === 'colores') {
    items =
      `<p class="nota">${J.tr(TXT.coloresGratis)}</p>` +
      COLORES_LOCAL.map((c) => {
        const actual = s.colores[c.id] || c.base;
        const chips = c.paleta.map((col) => `<button class="color${actual === col ? ' on' : ''}" style="--c:${col}" data-pintar="${c.id}" data-v="${col}" aria-label="${col}"></button>`).join('');
        return `<div class="fila"><span>${esc(J.tr(c.name))}</span><div class="opciones">${chips}</div></div>`;
      }).join('');
  } else {
    items = DECO.filter((d) => d.slot === slot)
      .map((d) => {
        const tengo = s.compradas.includes(d.id);
        const puesto = s.deco[slot] === d.id;
        let accion;
        if (puesto) accion = `<button class="b chico" data-sacar="${d.id}">${J.tr(TXT.usando)} ✓</button>`;
        else if (tengo) accion = `<button class="b chico primario" data-usar="${d.id}">${J.tr(TXT.usar)}</button>`;
        else if (d.logro) accion = `<button class="b chico" disabled>🔒 ${esc(J.tr(LOGROS.find((l) => l.id === d.logro).name))}</button>`;
        else accion = boton(d.precio, `data-comprar="${d.id}"`);
        const extras = [d.bonus ? J.tr(TXT.paciencia, { x: d.bonus }) : '', d.propinas ? J.tr(TXT.propinasMas, { x: Math.round(d.propinas * 100) }) : ''].filter(Boolean).join(' · ');
        return `<div class="item${prueba === d.id ? ' prueba' : ''}" data-probar="${d.id}"><div><b>${esc(J.tr(d.name))}</b><small>${extras || '&nbsp;'}</small></div>${accion}</div>`;
      })
      .join('');
  }
  const bonus = bonusDeco(s);
  const mejora = slot === 'cocina' ? MEJORAS.find((m) => m.id === prueba) : null;
  const pie = mejora ? `<b>${esc(J.tr(mejora.name))}</b> · ${esc(J.tr(TXT.mejoraCocina))}` : J.tr(TXT.pacienciaTotal, { x: bonus.paciencia }) + (bonus.propinas ? ' · ' + J.tr(TXT.propinasMas, { x: Math.round(bonus.propinas * 100) }) : '');
  const el = mostrar(
    `<div class="tarjeta tienda">
      <div class="cabeza">
        <h2>${J.tr(TXT.decorar)}</h2>
        <span class="plata"><canvas class="moneda"></canvas>${s.monedas}</span>
        <button class="b chico primario" data-a="volver">${J.tr(TXT.listo)}</button>
      </div>
      <div class="tabs">${tabs}</div>
      <div class="cuerpo">
        <div class="izq">
          <canvas class="salon"></canvas>
          <p class="bajada">${pie}</p>
        </div>
        <div class="der"><div class="items" data-slot="${slot}">${items}</div></div>
      </div>
    </div>`,
    'con-fondo',
  );
  el.querySelector('.items').scrollTop = antes;
  const deco = { ...decoDe(s), ...(prueba && slot !== 'cocina' && slot !== 'colores' ? { [slot]: prueba } : {}) };
  const cv = el.querySelector('.salon');
  let t = 0;
  const loop = () => {
    t += 0.016;
    lienzo(cv, 640, 300, (ctx) => {
      if (mejora) {
        // la herramienta sobre la cocina
        ctx.save();
        ctx.scale(0.5, 0.5);
        ctx.translate(0, -100);
        cocina(ctx, mejora.est === 'fritura' ? 'fritura' : mejora.est === 'decorado' ? 'decorado' : 'masa');
        ctx.restore();
        dibujarMejora(ctx, mejora.id, 320, 150, 1.25, t);
      } else {
        ctx.scale(0.5, 0.5);
        ctx.translate(0, -110);
        salon(ctx, deco, t, { turnos: s.mejoras.turnos ? 7 : 0 });
        mesas(ctx, deco);
        rincon(ctx, deco.rincon, t);
        persona(ctx, lookJugador(s), LUGARES.empleado.x, LUGARES.empleado.y, 1, { t });
        mostrador(ctx, deco, t, { monedas: s.monedas });
      }
    });
    anim = requestAnimationFrame(loop);
  };
  loop();
  el.querySelectorAll('canvas.moneda').forEach((c) => lienzo(c, 26, 26, (ctx) => moneda(ctx, 13, 13, 11)));
  on('[data-slot]', 'click', (e) => tienda(J, o, e.currentTarget.dataset.slot));
  on('[data-probar]', 'click', (e) => {
    if (e.target.closest('button')) return;
    tienda(J, o, slot, e.currentTarget.dataset.probar);
  });
  on('[data-usar]', 'click', (e) => {
    s.deco[slot] = e.currentTarget.dataset.usar;
    guardar(s);
    J.snd('click');
    tienda(J, o, slot);
  });
  on('[data-sacar]', 'click', () => {
    // sacar lo puesto (salvo lo que viene con el local)
    if (DECO_INICIAL[slot]) return;
    delete s.deco[slot];
    guardar(s);
    J.snd('click');
    tienda(J, o, slot);
  });
  on('[data-comprar]', 'click', (e) => {
    const d = byId(DECO, e.currentTarget.dataset.comprar);
    if (s.monedas < d.precio) return;
    s.monedas -= d.precio;
    s.compradas.push(d.id);
    s.deco[slot] = d.id;
    guardar(s);
    J.snd('comprar');
    tienda(J, o, slot);
  });
  on('[data-mejora]', 'click', (e) => {
    const m = MEJORAS.find((x) => x.id === e.currentTarget.dataset.mejora);
    if (s.monedas < m.precio || s.mejoras[m.id]) return;
    s.monedas -= m.precio;
    s.mejoras[m.id] = 1;
    guardar(s);
    J.snd('comprar');
    tienda(J, o, slot, m.id);
  });
  on('[data-pintar]', 'click', (e) => {
    s.colores[e.currentTarget.dataset.pintar] = e.currentTarget.dataset.v;
    guardar(s);
    J.snd('click');
    tienda(J, o, slot);
  });
  on('[data-a="volver"]', 'click', () => o.onVolver());
}

// ---------------------------------------------------------------- pausa, ayuda, confirmar

export function pausa(J, o) {
  ultimo = () => pausa(J, o);
  mostrar(
    `<div class="tarjeta chica">
      <h2>${J.tr(TXT.pausa)}</h2>
      <div class="botones columna">
        <button class="b primario" data-a="seguir">${J.tr(TXT.seguir)}</button>
        <button class="b" data-a="musica">🎵 ${J.tr(TXT.musica)}: ${J.tr(J.musica ? TXT.si2 : TXT.no2)}</button>
        <button class="b" data-a="ayuda">${J.tr(TXT.comoSeJuega)}</button>
        <button class="b" data-a="salir">${J.tr(TXT.salir)}</button>
        <button class="b" data-a="salirJuego">${J.tr(TXT.salirJuego)}</button>
      </div>
    </div>`,
    'oscuro',
  );
  on('[data-a="musica"]', 'click', () => {
    alternarMusica(J);
    pausa(J, o);
  });
  on('[data-a="seguir"]', 'click', () => o.onSeguir());
  on('[data-a="ayuda"]', 'click', () => ayuda(J, () => pausa(J, o)));
  on('[data-a="salir"]', 'click', () => confirmar(J, J.tr(TXT.confirmarSalir), o.onSalir, () => pausa(J, o)));
  on('[data-a="salirJuego"]', 'click', () => confirmar(J, J.tr(TXT.confirmarSalir), o.onSalirJuego, () => pausa(J, o)));
}

export function confirmar(J, texto, onSi, onNo) {
  ultimo = () => confirmar(J, texto, onSi, onNo);
  mostrar(
    `<div class="tarjeta chica">
      <p class="bajada">${esc(texto)}</p>
      <div class="botones">
        <button class="b" data-a="no">${J.tr(TXT.no)}</button>
        <button class="b primario" data-a="si">${J.tr(TXT.si)}</button>
      </div>
    </div>`,
    'oscuro',
  );
  on('[data-a="si"]', 'click', onSi);
  on('[data-a="no"]', 'click', onNo);
}

const PASOS = [
  {
    t: { es: '1 · Mostrador', en: '1 · Counter' },
    d: { es: 'Cuando un cliente llega a la caja, tocá «Tomar pedido». El pedido queda colgado en un ticket arriba de todo.', en: 'When a customer reaches the register, tap “Take order”. The order hangs on a ticket at the top.' },
  },
  {
    t: { es: '2 · Masa', en: '2 · Dough' },
    d: { es: 'Elegí la masa, estirala arrastrando el palote de un lado al otro y cortá con el cortador de la forma que pide el ticket.', en: 'Pick the dough, roll it out by dragging the pin back and forth, and cut with the cutter shaped like the ticket.' },
  },
  {
    t: { es: '3 · Fritura', en: '3 · Fryer' },
    d: { es: 'Tocá las donas crudas para meterlas al aceite. Cuando la aguja entra en la zona verde, tocalas para darlas vuelta; cuando el otro lado está dorado, tocalas para sacarlas. Se siguen cocinando aunque estés en otra estación.', en: 'Tap raw donuts to drop them in the oil. When the needle hits the green zone, tap to flip; when the other side is golden, tap to take them out. They keep cooking while you’re at other stations.' },
  },
  {
    t: { es: '4 · Decorado', en: '4 · Decorate' },
    d: { es: 'Relleno y baño: mantené apretado y soltá en la raya. Hilos: arrastrá en zigzag. Toppings: pasá por toda la dona. Piezas: tocá para poner cada una, bien repartidas. Después, «Entregar».', en: 'Filling and icing: hold and let go at the line. Drizzle: drag in zigzags. Toppings: sweep over the whole donut. Pieces: tap to place each one, evenly spaced. Then “Serve”.' },
  },
  {
    t: { es: 'Puntaje y bonus', en: 'Score and bonuses' },
    d: { es: 'Cada cliente pone nota a la espera, la masa, la fritura y el decorado. Con las propinas y los logros mejorás el local: herramientas de cocina (como una segunda mesa de masa o una freidora más grande) y decoración, que hace que los clientes esperen más tranquilos.', en: 'Each customer grades the wait, dough, frying and decorating. Tips and achievements upgrade the shop: kitchen tools (like a second dough table or a bigger fryer) and decorations, which make customers wait more patiently.' },
  },
  {
    t: { es: 'El último del día', en: 'Last of the day' },
    d: { es: 'El último cliente siempre es el más exigente: deja más propina, pero mira todo con lupa. Cada 7 días viene Julay a probar.', en: 'The last customer is always the toughest: bigger tip, but they inspect everything. Every 7 days Julay comes to taste.' },
  },
];

export function ayuda(J, volver) {
  ultimo = () => ayuda(J, volver);
  mostrar(
    `<div class="tarjeta ayuda">
      <h2>${J.tr(TXT.comoSeJuega)}</h2>
      <div class="cuerpo">
        <div class="pasos">${PASOS.map((p) => `<div class="paso"><b>${J.tr(p.t)}</b><p>${J.tr(p.d)}</p></div>`).join('')}</div>
        ${matchMedia('(pointer: fine)').matches ? `<p class="teclas">${J.lang === 'es' ? 'Teclas: 1 a 4 cambian de estación · Esc pausa' : 'Keys: 1 to 4 switch stations · Esc pauses'}</p>` : ''}
      </div>
      <div class="botones"><button class="b primario" data-a="volver">${J.tr(TXT.volver)}</button></div>
    </div>`,
    'oscuro',
  );
  on('[data-a="volver"]', 'click', volver);
}
