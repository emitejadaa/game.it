/**
 * La Cabra · Pádel — el partido en la pista (compartido por el navegador y el servidor).
 *
 * Adaptado del motor de "LA CABRA · Pádel" (github.com/LucasPar08/la-cabra-padel): 2 contra 2 en una
 * pista de 10×20 m, la bola en 3D con las reglas del pádel (bote antes de la pared, un bote por lado,
 * cristal, malla, por 3 y por 4, salida de pista, punto de oro, tie-break), los cuatro golpes (GOLPE,
 * REMATE, GLOBO y DEJADA: la bola decide si sale drive, volea, bandeja, víbora…) y la máquina que
 * juega de pareja y de rival. Acá quedó solo el partido: sin carrera, ni torneos, ni entrenamiento.
 *
 * Cualquiera de los cuatro puede ser una persona (contra la compu o en línea) o un bot. No toca la
 * pantalla: avisa lo que pasa con `hooks` (sonidos, efectos, carteles y el final) para que el
 * navegador lo dibuje y el servidor lo reenvíe.
 */
export const W = 10;
export const L = 20;
export const RED_Y = 10;
export const RED_ALT = 0.92;
export const PARED = 3.0;
export const LINEA_SAQUE = 6.95;
export const ALT_FONDO = 4.0;
export const REJA_Y0 = 4;
export const REJA_Y1 = 16;
const G = 10.5; // gravedad un pelín más alta que la real: juego más vivo
const REST_SUELO = 0.62;
const REST_PARED = 0.7;
const REST_REJA = 0.38;
const ROCE = 0.86;
const R_BOLA = 0.1;
export const DUR_SWING = 0.34; // ventana del golpe: generosa para el celular
const PAUSA_PUNTO = 1.05;
export const PASO = 1 / 120;

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss() {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export const ladoDe = (y) => (y >= RED_Y ? 0 : 1); // 0 = abajo · 1 = arriba

// ---------------------------------------------------------------- estilos, dificultad y jugadores
/** Las parejas rivales no son todas iguales: cada una juega a algo. */
export const ARQUETIPOS = [
  { id: 'muro', nom: { es: 'globo y paciencia', en: 'lobs and patience' }, globo: 1.28, remate: 0.8 },
  { id: 'red', nom: { es: 'todo a la red', en: 'all at the net' }, globo: 0.8, remate: 1.12 },
  { id: 'potencia', nom: { es: 'potencia y remate', en: 'power and smashes' }, globo: 0.85, remate: 1.38 },
  { id: 'joven', nom: { es: 'jóvenes sin miedo', en: 'young and fearless' }, globo: 0.94, remate: 1.28 },
  { id: 'veterana', nom: { es: 'oficio y colocación', en: 'craft and placement' }, globo: 1.22, remate: 0.84 },
];
export const DIFICULTADES = {
  facil: { rival: 12, cal: 0.1, alcance: 0.16 },
  normal: { rival: 8, cal: 0.07, alcance: 0.1 },
  dificil: { rival: 0, cal: 0.02, alcance: 0.03 },
};
/** Una persona: su velocidad, alcance y lo bien que le salen los golpes. */
export function paramsHumano(dif, asistencia) {
  const D = DIFICULTADES[dif] || DIFICULTADES.normal;
  return { vel: 5, alcance: 1.24 + D.alcance + (asistencia ? 0.1 : 0), bonusCal: 0.04 + D.cal, umbralPorTres: 0.8, bonusPared: 0.05, hab: 0.62, reaccion: 0.16 };
}
/** La pareja de la máquina juega con cabeza: falla poco y llega a casi todo. */
export function paramsPareja() {
  return { vel: 4.6, alcance: 1.2, hab: 0.72, reaccion: 0.16, multFallo: 0.62, agresivo: 0.55, globeador: 0.35 };
}
/** edge = vuestro nivel menos el suyo (con la dificultad): negativo, son mejores. */
export function paramsRival(dif, arq) {
  const e = clamp((DIFICULTADES[dif] || DIFICULTADES.normal).rival, -25, 25);
  return {
    vel: clamp(4.35 - 0.045 * e, 3.5, 5.3),
    alcance: 1.15,
    hab: clamp(0.56 - 0.018 * e, 0.28, 0.88),
    reaccion: clamp(0.2 + 0.008 * e, 0.1, 0.34),
    agresivo: clamp(0.5 * (arq ? arq.remate : 1), 0.3, 0.75),
    globeador: clamp(0.35 * (arq ? arq.globo : 1), 0.22, 0.5),
  };
}

/* dist = metros desde la red hasta donde bota la bola en el otro campo */
const TIROS = {
  saque: { T: 1.05, dist: [4.2, 6.4] },
  drive: { T: 0.82, dist: [5.8, 8.8] },
  plano: { T: 0.6, dist: [6.4, 9.0] },
  volea: { T: 0.62, dist: [3.8, 7.4] },
  globo: { T: 1.95, dist: [7.9, 9.4] },
  remate: { T: 0.36, dist: [2.6, 5.2] },
  vibora: { T: 0.52, dist: [5.2, 8.4] },
  bandeja: { T: 0.8, dist: [5.6, 8.2] },
  dejada: { T: 0.95, dist: [0.9, 2.3] },
  chiquita: { T: 0.8, dist: [2.8, 4.6] },
};
/* Lo que arriesga cada golpe por sí mismo, además de lo bien que lo pegues */
const RIESGO_TIRO = { plano: 1.35, remate: 1.12, vibora: 1.05, dejada: 1.2, chiquita: 1.05 };
/* El efecto de cada golpe: cortado (bota bajo y muere en el cristal), liftado (bota y corre) o la víbora, que se abre */
const EFECTO_TIRO = { saque: 'corte', bandeja: 'corte', volea: 'corte', dejada: 'corte', chiquita: 'corte', vibora: 'lateral', drive: 'liftado', globo: 'liftado' };
export const ERRORES_PUNTO = ['red', 'noPasa', 'fuera', 'paredDirecta', 'paredSuCampo', 'faltaSaque', 'dobleFalta', 'rejaDirecta', 'saqueReja'];
const FALTAS_SAQUE = ['red', 'noPasa', 'faltaSaque', 'paredSuCampo', 'paredDirecta', 'rejaDirecta', 'saqueReja', 'fuera'];

function nuevaBola() {
  return { x: 5, y: 15, z: 0.9, vx: 0, vy: 0, vz: 0, botes: 0, golpeo: null, cruzo: false, viva: true, saque: false, porTres: false, ultimoTiro: null, golpeador: null, pared: false, efecto: null, tocoRed: false, letForzado: false };
}

function crearJugador(id, lado, carril, humano, cfg) {
  return Object.assign(
    { id, lado, carril, carrilBase: carril, humano, x: carril === 'izq' ? 2.7 : 7.3, y: lado === 0 ? 17.5 : 2.5, vx: 0, vy: 0, vel: 5, alcance: 1.3, hab: 0.6, reaccion: 0.18, agresivo: 0.5, globeador: 0.35, swing: 0, cd: 0, anim: 0, pedido: 'golpe', ultimoMov: -9, ultimoTiro: null, fuera: false, asistencia: true, golpeAuto: false, input: { ax: 0, ay: 0, accion: null }, apunte: null },
    cfg,
  );
}

/**
 * Arma un partido.
 * cfg: { juegos: 3|4|6, sets: 1|3, escena, equipos: [nombre0, nombre1],
 *        jugadores: [4 × { humano, carril: 'izq'|'der', params, nombre, color, … }] (0 y 1 abajo, 2 y 3 arriba) }
 * hooks: { sonido(tipo, dato), efecto(tipo, …), aviso({ …datos del punto }), ayuda(id, clave), fin(resultado), vibrar(id, ms) }
 */
export function crearPartido(cfg, hooks = {}) {
  const h = {
    sonido() {},
    efecto() {},
    aviso() {},
    ayuda() {},
    fin() {},
    vibrar() {},
    ...hooks,
  };
  const P = {
    cfg,
    escena: cfg.escena || { tipo: 'pabellon', gente: 0.8 },
    equipos: cfg.equipos || ['A', 'B'],
    estado: 'saque',
    t: 0,
    tGolpe: 0,
    timer: 0,
    lento: 0,
    fiesta: 0,
    juegosGanar: [3, 4, 6].includes(cfg.juegos) ? cfg.juegos : 3,
    setsGanar: cfg.sets === 3 ? 2 : 1,
    setsG: [0, 0],
    marcadorSets: [],
    nJuego: 0,
    tb: false,
    tbSaca: 0,
    acabado: false,
    saqueN: 1,
    sacaAhora: null,
    puntos: [0, 0],
    juegos: [0, 0],
    sacaLado: Math.random() < 0.5 ? 0 : 1,
    saqueDe: 0,
    saqueX: 5,
    rally: 0,
    prediccion: [],
    bola: nuevaBola(),
    puntosJugados: 0,
    ultimoGanador: null,
    salida: null,
    stats: { puntos: [0, 0], rallyMax: 0, porTres: [0, 0], oros: [0, 0], golpes: {}, perfectos: {} },
    jug: cfg.jugadores.map((c, i) => crearJugador(i, i < 2 ? 0 : 1, c.carril || (i % 2 ? 'der' : 'izq'), !!c.humano, c)),
  };

  // ---------------------------------------------------------------- la bola y las reglas
  /* Un paso de física. Con `sim` no se aplican reglas: sirve para predecir */
  function pasoBola(b, dt, sim) {
    const py = b.y;
    b.vz -= G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.golpeo !== null && !b.cruzo && py >= RED_Y !== b.y >= RED_Y) {
      if (b.z < RED_ALT) {
        if (sim) return 'red';
        b.y = py;
        b.vy *= -0.15;
        b.vx *= 0.3;
        return regla(b, 'red');
      }
      b.cruzo = true;
      /* el saque que roza la cinta y entra es let */
      if (b.saque && (b.z < RED_ALT + 0.07 || b.letForzado)) {
        b.tocoRed = true;
        b.vy *= 0.86;
        if (!sim) h.sonido('red');
      }
    }
    if (b.z <= 0 && b.vz < 0) {
      b.z = 0;
      b.vz = -b.vz * REST_SUELO;
      b.vx *= ROCE;
      b.vy *= ROCE;
      const r = sim ? simBote(b) : regla(b, 'bote');
      if (r) return r;
    }
    /* devuelta desde fuera de la pista: no choca con la malla hasta que vuelve a entrar */
    if (b.fueraPista) {
      if (b.x > R_BOLA && b.x < W - R_BOLA && b.y > R_BOLA && b.y < L - R_BOLA) b.fueraPista = false;
      else return null;
    }
    if (b.x < R_BOLA || b.x > W - R_BOLA) {
      if (b.z > PARED) return sim ? 'fuera' : regla(b, 'fuera', 'lateral');
      const reja = b.y > REJA_Y0 && b.y < REJA_Y1;
      b.x = clamp(b.x, R_BOLA, W - R_BOLA);
      b.vx = -b.vx * (reja ? REST_REJA : restPared(b));
      if (reja) rebotarReja(b, sim, 'x');
      const r = sim ? simPared(b) : regla(b, 'pared', reja ? 'reja' : 'cristal');
      if (r) return r;
    }
    if (b.y < R_BOLA || b.y > L - R_BOLA) {
      if (b.z > ALT_FONDO) return sim ? 'fuera' : regla(b, 'fuera', 'fondo');
      const reja = b.z > PARED;
      b.y = clamp(b.y, R_BOLA, L - R_BOLA);
      b.vy = -b.vy * (reja ? REST_REJA : restPared(b));
      if (reja) rebotarReja(b, sim, 'y');
      const r = sim ? simPared(b) : regla(b, 'pared', reja ? 'reja' : 'cristal');
      if (r) return r;
    }
    return null;
  }
  /* la bola cortada sale muerta del cristal */
  const restPared = (b) => REST_PARED * (b.efecto === 'corte' ? 0.8 : 1);
  /* la malla no devuelve la bola limpia: la frena y la desvía (al predecir, sin azar) */
  function rebotarReja(b, sim, eje) {
    b.vz *= 0.6;
    if (sim) return;
    b.vx += gauss() * 0.7;
    b.vy += gauss() * 0.7;
    b.vz += gauss() * 0.4;
    if (eje === 'x') b.vx = b.x < W / 2 ? Math.abs(b.vx) : -Math.abs(b.vx);
    else b.vy = b.y < L / 2 ? Math.abs(b.vy) : -Math.abs(b.vy);
  }
  /* Al botar manda el efecto: el remate perfecto sale de la pista, lo cortado bota bajo, lo liftado
     corre y la víbora se abre hacia el lateral */
  function reboteRemate(b) {
    if (b.botes !== 1) return;
    if (b.porTres) {
      if (Math.abs(b.x - W / 2) > 2.4) {
        // por 3: por encima de la malla del lateral
        const lat = Math.max(0.4, b.x < W / 2 ? b.x : W - b.x);
        const vxl = 9;
        const t = lat / vxl;
        b.vx = (b.x < W / 2 ? -1 : 1) * vxl;
        b.vz = (PARED + 0.6 + 0.5 * G * t * t) / t;
        b.vy *= 0.6;
      } else {
        // por 4: por encima del fondo
        const hasta = Math.max(0.8, b.vy > 0 ? L - b.y : b.y);
        const vy = Math.max(6, Math.abs(b.vy) * 0.7);
        const t = hasta / vy;
        b.vy = Math.sign(b.vy || -1) * vy;
        b.vz = (ALT_FONDO + 0.6 + 0.5 * G * t * t) / t;
      }
      return;
    }
    if (b.efecto === 'corte') {
      b.vz *= 0.8;
      b.vx *= 0.92;
      b.vy *= 0.92;
    } else if (b.efecto === 'liftado') {
      b.vz *= 1.07;
      b.vx *= 1.04;
      b.vy *= 1.04;
    } else if (b.efecto === 'lateral') {
      b.vz *= 0.72;
      b.vx += (b.x < W / 2 ? -1 : 1) * 1.3;
    }
  }
  function simBote(b) {
    if (!b.cruzo) return 'corta';
    if (ladoDe(b.y) === b.golpeo) return 'vuelve';
    b.botes++;
    reboteRemate(b);
    return b.botes >= 2 ? 'dobleBote' : null;
  }
  function simPared(b) {
    if (!b.cruzo || b.botes === 0) return 'paredDirecta';
    b.pared = true;
    return null;
  }
  function enCajaSaque(b) {
    const rec = 1 - b.golpeo;
    const fondo = rec === 1 ? b.y >= RED_Y - LINEA_SAQUE - 0.15 && b.y <= RED_Y : b.y <= RED_Y + LINEA_SAQUE + 0.15 && b.y >= RED_Y;
    const cruzado = P.saqueX < 5 ? b.x >= 4.85 : b.x <= 5.15;
    return fondo && cruzado;
  }
  function motivoDobleBote(b) {
    if (b.ultimoTiro === 'dejada' || b.ultimoTiro === 'chiquita') return 'dejada';
    if (b.ultimoTiro === 'vibora') return 'vibora';
    if (b.ultimoTiro === 'remate' || b.ultimoTiro === 'plano') return 'remate';
    return 'dobleBote';
  }
  function regla(b, ev, extra) {
    const pega = b.golpeo;
    if (pega === null) return null;
    const recibe = 1 - pega;
    if (ev === 'red') {
      h.sonido('red');
      return terminar(recibe, 'red');
    }
    if (ev === 'bote') {
      if (!b.cruzo) return terminar(recibe, 'noPasa');
      if (ladoDe(b.y) === pega) return terminar(pega, 'noDevuelven');
      b.botes++;
      if (b.saque && b.botes === 1) {
        if (!enCajaSaque(b)) return terminar(recibe, 'faltaSaque');
        if (b.tocoRed) return repetirSaque();
      }
      reboteRemate(b);
      if (b.botes >= 2) return terminar(pega, b.saque ? 'ace' : motivoDobleBote(b));
      h.sonido('bote');
      h.efecto('bote', b.x, b.y);
      return null;
    }
    if (ev === 'pared') {
      if (!b.cruzo) return terminar(recibe, 'paredSuCampo');
      if (b.botes === 0) return terminar(recibe, extra === 'reja' ? 'rejaDirecta' : 'paredDirecta');
      if (b.saque && extra === 'reja') return terminar(recibe, 'saqueReja');
      b.pared = true; // ya se puede sacar de la pared
      if (extra === 'reja') {
        h.sonido('reja');
        h.efecto('reja', b.x, b.y, b.z);
        P.prediccion = predecirBola(b, 3, P.t - P.tGolpe);
      } else {
        h.sonido('cristal');
        h.efecto('cristal', b.x, b.y, b.z);
      }
      return null;
    }
    if (ev === 'fuera') {
      if (b.cruzo && b.botes >= 1 && ladoDe(b.y) === recibe) {
        if (extra !== 'fondo' && intentarSalida(b, recibe)) return 'salida'; // por el lateral se puede salir a buscarla
        return terminar(pega, extra === 'fondo' ? 'por4' : 'por3', { porTres: true });
      }
      return terminar(recibe, 'fuera');
    }
    return null;
  }
  /* En el saque, cualquier error es falta: con la primera hay segundo saque; con la segunda, doble falta */
  function terminar(ganador, motivo, extra) {
    const b = P.bola;
    if (!b.viva) return 'fin';
    b.viva = false;
    if (b.saque && ganador !== b.golpeo && FALTAS_SAQUE.includes(motivo)) {
      if (P.saqueN !== 2) {
        faltaSaque(motivo);
        return 'fin';
      }
      motivo = 'dobleFalta';
    }
    finPunto(ganador, motivo, extra || {});
    return 'fin';
  }
  /* Adónde va a ir la bola: la usan la máquina, la asistencia y las sugerencias */
  function predecirBola(b, maxT, t0) {
    const c = Object.assign({}, b);
    const out = [];
    const dt = 1 / 60;
    for (let t = dt; t <= maxT; t += dt) {
      const r = pasoBola(c, dt, true);
      out.push({ t: (t0 || 0) + t, x: c.x, y: c.y, z: c.z, botes: c.botes, cruzo: c.cruzo, saque: c.saque, pared: c.pared });
      if (r) break;
    }
    return out;
  }
  function actualizarBola(dt) {
    const b = P.bola;
    if (!b.viva || P.estado !== 'juego') return;
    for (let i = 0; i < 3; i++) if (pasoBola(b, dt / 3, false)) break;
    /* red de seguridad: una bola que no se decide en 7 s es del que la pegó */
    if (b.viva && P.t - P.tGolpe > 7) terminar(b.golpeo === null ? 1 : b.golpeo, 'bolaMuerta');
  }

  // ---------------------------------------------------------------- los golpes
  function tiroHacia(b, tx, ty, T) {
    return { vx: (tx - b.x) / T, vy: (ty - b.y) / T, vz: -b.z / T + 0.5 * G * T };
  }
  function pasaRed(b, v, margen) {
    if (Math.abs(v.vy) < 1e-4) return false;
    const tn = (RED_Y - b.y) / v.vy;
    if (tn <= 0) return true;
    return b.z + v.vz * tn - 0.5 * G * tn * tn >= RED_ALT + margen;
  }
  function golpear(j, tipo, calidad, apuntarX, prof) {
    const b = P.bola;
    const T = TIROS[tipo];
    /* Dos cosas distintas: la dispersión normal (dónde bota dentro de la pista) y el FALLO, que es
       explícito. Cuanto peor el contacto, más probable fallar: a la red, larga o ancha. */
    const disp = (1 - calidad) * 0.9 + 0.1;
    /* con el joystick se elige la profundidad: adelante, al fondo; atrás, corta */
    const largo = prof > 0 && tipo !== 'dejada' && tipo !== 'chiquita' ? T.dist[1] + 0.5 : prof < 0 ? Math.max(1.2, T.dist[0] - 1) : rnd(T.dist[0], T.dist[1]);
    let d = clamp(largo + gauss() * disp * 0.5, 0.8, 9.5);
    let tx = apuntarX != null ? apuntarX : j.x < 5 ? rnd(6.2, 8.8) : rnd(1.2, 3.8);
    tx = clamp(tx + gauss() * disp * 0.7, 0.5, W - 0.5);
    const mf = (j.multFalloTiro && j.multFalloTiro[tipo]) || j.multFallo || 1;
    const aLaLinea = apuntarX != null && Math.abs(apuntarX - W / 2) > 3.4 ? 1.25 : 1; // apuntar pegado a la pared arriesga más
    const pFallo = clamp((0.02 + Math.pow(1 - calidad, 2) * 0.4) * mf * (RIESGO_TIRO[tipo] || 1) * aLaLinea, 0.015, 0.55);
    let fallo = Math.random() < pFallo ? pick(['red', 'larga', 'ancha', 'larga']) : null;
    if (tipo === 'saque') {
      /* el primer saque se arriesga más; el segundo entra casi siempre */
      const pF = clamp((P.saqueN === 2 ? 0.03 : 0.11) * (1.35 - calidad) * mf, 0.008, 0.3);
      fallo = Math.random() < pF ? pick(['red', 'largo', 'largo', 'cruce']) : null;
      if (fallo === 'largo') d = rnd(7.15, 8.2);
      if (fallo === 'cruce') tx = P.saqueX < W / 2 ? rnd(3.3, 4.6) : rnd(5.4, 6.7);
    }
    if ((tipo === 'dejada' || tipo === 'chiquita') && fallo === 'larga') fallo = 'red'; // la dejada que sale mal muere en la red
    if (fallo === 'larga') d = rnd(10.3, 11.4);
    if (fallo === 'ancha') tx = Math.random() < 0.5 ? rnd(-0.8, -0.3) : rnd(W + 0.3, W + 0.8);
    const ty = j.lado === 0 ? RED_Y - d : RED_Y + d;
    const mt = (j.multTTiro && j.multTTiro[tipo]) || j.multT || 1;
    let TT = T.T * (1.15 - 0.3 * calidad) * mt;
    let v = tiroHacia(b, tx, ty, TT);
    for (let k = 0; k < 14 && !pasaRed(b, v, 0.12); k++) {
      TT *= 1.08;
      v = tiroHacia(b, tx, ty, TT);
    }
    if (fallo === 'red') v.vz *= 0.5;
    const dePared = b.pared && b.botes >= 1;
    Object.assign(b, {
      vx: v.vx,
      vy: v.vy,
      vz: v.vz,
      golpeo: j.lado,
      botes: 0,
      cruzo: false,
      saque: tipo === 'saque',
      pared: false,
      efecto: EFECTO_TIRO[tipo] || null,
      tocoRed: false,
      salioDePared: dePared,
      letForzado: tipo === 'saque' && !fallo && Math.random() < 0.03,
      porTres: tipo === 'remate' && calidad >= (j.umbralPorTres || 0.78),
      ultimoTiro: tipo,
      golpeador: j.id,
    });
    P.tGolpe = P.t;
    P.rally++;
    P.prediccion = predecirBola(b, 4);
    /* Nadie lee la bola perfecta: cuanto más rápida y peor el que defiende, más se equivoca al principio */
    for (const o of P.jug)
      if (o.lado !== j.lado && !o.humano) {
        const e = (1 - o.hab) * 2.2 + clamp((Math.hypot(v.vx, v.vy) - 9) / 9, 0, 1.2);
        o.lectura = { dx: gauss() * e, dy: gauss() * e * 0.8, t0: P.t };
      }
    j.anim = 0.22;
    j.cd = 0.18;
    j.ultimoTiro = tipo;
    if (j.humano) {
      h.vibrar(j.id, tipo === 'remate' || tipo === 'plano' ? 28 : 12);
      P.stats.golpes[j.id] = (P.stats.golpes[j.id] || 0) + 1;
    }
    h.efecto('golpe', b.x, b.y, b.z, tipo, calidad);
    h.sonido('golpe', tipo === 'remate' || tipo === 'plano' ? 1 : calidad * 0.75);
  }
  function alcanzable(j) {
    const b = P.bola;
    if (P.estado !== 'juego' || !b.viva || b.golpeo === null || b.golpeo === j.lado) return false;
    if (!b.cruzo || ladoDe(b.y) !== j.lado || (b.saque && b.botes === 0)) return false;
    return Math.hypot(b.x - j.x, b.y - j.y) <= j.alcance && b.z <= 2.9;
  }
  function moverHacia(j, tx, ty, vel) {
    const dx = tx - j.x;
    const dy = ty - j.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) {
      j.vx *= 0.6;
      j.vy *= 0.6;
      return;
    }
    const s = Math.min(vel, d * 6);
    j.vx = (dx / d) * s;
    j.vy = (dy / d) * s;
  }
  function aplicarMovimiento(j, dt) {
    const m = j.fuera ? 2.4 : 0; // en una salida de pista se corre por fuera
    j.x = clamp(j.x + j.vx * dt, 0.35 - m, W - 0.35 + m);
    j.y = clamp(j.y + j.vy * dt, j.lado === 0 ? RED_Y + 0.45 : 0.35, j.lado === 0 ? L - 0.35 : RED_Y - 0.45);
    if (j.fuera && j.x > 0.35 && j.x < W - 0.35 && P.estado !== 'salida') j.fuera = false;
  }

  // ---------------------------------------------------------------- las personas
  /* El botón decide la intención y la bola decide el golpe que sale */
  function tipoHumano(j, accion) {
    const b = P.bola;
    const cercaRed = Math.abs(j.y - RED_Y) < 5.2;
    if (accion === 'globo') return 'globo';
    if (accion === 'dejada') return cercaRed || b.botes === 0 ? 'dejada' : 'chiquita';
    if (accion === 'remate') {
      if (b.z > 1.75 && cercaRed) return 'remate';
      if (b.z > 1.2) return 'vibora';
      return 'plano';
    }
    if (b.z > 1.65) return 'bandeja';
    if (b.botes === 0) return 'volea';
    return 'drive';
  }
  /** El joystick en coordenadas del jugador: para el de arriba, la pantalla está dada vuelta. */
  function ejeDe(j) {
    let x = j.input.ax || 0;
    let y = j.input.ay || 0;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return j.lado === 0 ? { x, y } : { x: -x, y: -y };
  }
  /* Apuntar: izquierda/derecha elige el lado (paralelo o cruzado), adelante = al fondo, atrás = corta */
  function apuntarHumano(j, eje) {
    const hayX = Math.abs(eje.x) > 0.3;
    const hayY = Math.abs(eje.y) > 0.45;
    if (!hayX && !hayY) return null;
    const adelante = j.lado === 0 ? eje.y < 0 : eje.y > 0;
    const tx = hayX ? clamp(W / 2 + eje.x * 3.9, 0.9, W - 0.9) : null;
    const prof = hayY ? (adelante ? 1 : -1) : 0;
    let nombre = '';
    if (hayX) nombre = Math.abs(tx - W / 2) < 1.2 ? 'medio' : tx > W / 2 === j.x > W / 2 ? 'paralelo' : 'cruzado';
    return { tx, prof, nombre };
  }
  function actualizarHumano(j, dt) {
    if (j.ia) return actualizarIA(j, dt); // se desconectó o es una prueba automática: juega la máquina
    const eje = ejeDe(j);
    const mov = Math.hypot(eje.x, eje.y) > 0.12;
    j.apunte = alcanzable(j) || j.swing > 0 ? apuntarHumano(j, eje) : null; // la diana que se ve en la pista
    if (mov) {
      j.vx = eje.x * j.vel;
      j.vy = eje.y * j.vel;
      j.ultimoMov = P.t;
    } else if (j.asistencia && P.t - (j.ultimoMov || -9) > 0.2) {
      const o = objetivoJugador(j);
      moverHacia(j, o.x, o.y, j.vel * 0.92);
    } else {
      j.vx *= 0.75;
      j.vy *= 0.75;
    }
    aplicarMovimiento(j, dt);
    if (j.input.accion) {
      if (j.swing <= 0) j.swing = DUR_SWING;
      j.pedido = j.input.accion; // cambiar de idea dentro de la ventana también vale
      j.input.accion = null;
    }
    /* golpe automático: si no pulsás nada sale el golpe básico; los especiales siguen siendo tuyos */
    if (j.golpeAuto && j.swing <= 0 && alcanzable(j) && P.t - (j.tAuto || -9) > 0.3 && (P.bola.z < 1.45 || P.bola.z > 1.7)) {
      j.swing = DUR_SWING * 0.78;
      j.pedido = 'golpe';
      j.tAuto = P.t;
    }
    if (j.swing > 0) {
      if (alcanzable(j)) {
        const b = P.bola;
        const prog = 1 - j.swing / DUR_SWING;
        const d = Math.hypot(b.x - j.x, b.y - j.y);
        const dificultad = clamp((Math.hypot(b.vx, b.vy) - 9) / 16, 0, 0.25);
        const tipo = tipoHumano(j, j.pedido);
        const dePared = b.pared && b.botes >= 1 && tipo !== 'bandeja';
        let cal = (1 - Math.abs(prog - 0.4) / 0.6) * (1 - 0.3 * clamp(d / j.alcance, 0, 1)) + 0.15 + (j.bonusCal || 0) - dificultad;
        if (dePared) cal += j.bonusPared || 0;
        cal = clamp(cal, 0.15, 1);
        const ap = apuntarHumano(j, eje);
        golpear(j, tipo, cal, ap ? ap.tx : null, ap ? ap.prof : 0);
        if (cal >= 0.88) {
          P.stats.perfectos[j.id] = (P.stats.perfectos[j.id] || 0) + 1;
          h.efecto('texto', j.x, j.y - 0.9, dePared ? 'salidaPerfecta' : `perfecto:${tipo}`, '#F5C542');
        } else if (dePared) h.efecto('texto', j.x, j.y - 0.9, 'salidaPared', '#7FD3F7');
        else if (tipo !== 'drive' && tipo !== 'volea') h.efecto('texto', j.x, j.y - 0.9, `golpe:${tipo}`, COLOR_GOLPE[tipo]);
        else if (ap && ap.nombre) h.efecto('texto', j.x, j.y - 0.9, `apunte:${ap.nombre}`, '#F4F6F8');
        j.swing = 0;
      } else j.swing -= dt;
    }
    if (j.anim > 0) j.anim -= dt;
    j.sug = j.asistencia ? sugerencia(j) : null;
  }
  /* Con la asistencia, brilla el botón que conviene para la bola que viene */
  function sugerencia(j) {
    const b = P.bola;
    if (P.estado !== 'juego' || !b.viva || b.golpeo === null || b.golpeo === j.lado) return null;
    const pasado = P.t - P.tGolpe;
    let mejor = null;
    let dMin = 3.5;
    for (const s of P.prediccion) {
      if (s.t < pasado || ladoDe(s.y) !== j.lado || !s.cruzo || (s.saque && s.botes === 0) || s.z > 2.9) continue;
      if (s.botes === 0 && Math.abs(s.y - RED_Y) > 5.5) continue;
      const d = Math.hypot(s.x - j.x, s.y - j.y);
      if (d < dMin) {
        dMin = d;
        mejor = s;
      }
    }
    if (!mejor) return null;
    const enRed = P.jug.filter((o) => o.lado !== j.lado && Math.abs(o.y - RED_Y) < 4.3).length;
    const cercaRed = Math.abs(j.y - RED_Y) < 5.2;
    if (mejor.z > 1.75 && cercaRed) return 'remate';
    if (enRed === 2 && !cercaRed) return 'globo';
    if (enRed === 0 && cercaRed) return 'dejada';
    return 'golpe';
  }

  // ---------------------------------------------------------------- la máquina
  function esMiBola(j, s) {
    const comp = P.jug.find((o) => o.lado === j.lado && o.id !== j.id);
    if (!comp) return true;
    if (j.carril === 'izq' ? s.x >= 5.4 : s.x < 4.6) return false;
    if (s.x >= 4.6 && s.x < 5.4) return Math.hypot(s.x - j.x, s.y - j.y) <= Math.hypot(s.x - comp.x, s.y - comp.y);
    return true;
  }
  function objetivoJugador(j) {
    const b = P.bola;
    if (P.estado === 'juego' && b.viva && b.golpeo !== null && b.golpeo !== j.lado && P.t - P.tGolpe >= (j.humano && !j.ia ? 0 : j.reaccion)) {
      const pasado = P.t - P.tGolpe;
      const ajuste = j.lado === 0 ? 0.3 : -0.3;
      let reserva = null;
      for (const s of P.prediccion) {
        if (s.t < pasado || ladoDe(s.y) !== j.lado || !s.cruzo || (s.saque && s.botes === 0)) continue;
        const ok = s.botes >= 1 ? s.z >= 0.2 && s.z <= 1.6 : s.z >= 0.6 && s.z <= 2.3 && Math.abs(s.y - RED_Y) < 5.5;
        if (!ok || !esMiBola(j, s)) continue;
        if (!reserva) reserva = s;
        if (Math.hypot(s.x - j.x, s.y - j.y) / j.vel <= s.t - pasado + 0.06) return conLectura(j, s, ajuste);
      }
      if (reserva) return conLectura(j, reserva, ajuste);
    }
    return posicionBase(j);
  }
  function conLectura(j, s, ajuste) {
    const L0 = j.lectura;
    if (!L0 || (j.humano && !j.ia)) return { x: s.x, y: s.y + ajuste, va: true };
    const k = clamp(1 - ((P.t - L0.t0) / (s.t + 0.001)) * 0.7, 0.3, 1); // el error se corrige al acercarse la bola
    return { x: s.x + L0.dx * k, y: s.y + ajuste + L0.dy * k, va: true };
  }
  function posicionBase(j) {
    const b = P.bola;
    const x = j.carril === 'izq' ? 2.7 : 7.3;
    let arriba = P.estado === 'juego' && b.viva && b.golpeo === j.lado;
    if (P.estado === 'juego' && b.viva && b.golpeo !== null && b.golpeo !== j.lado && ['globo', 'remate', 'vibora'].includes(b.ultimoTiro)) arriba = false;
    return { x, y: arriba ? (j.lado === 0 ? 12.7 : 7.3) : j.lado === 0 ? 17.5 : 2.5, va: false };
  }
  function actualizarIA(j, dt) {
    const o = objetivoJugador(j);
    moverHacia(j, o.x, o.y, j.vel * (o.va ? 1 : 0.7));
    aplicarMovimiento(j, dt);
    if (j.cd > 0) j.cd -= dt;
    if (j.anim > 0) j.anim -= dt;
    j.apunte = null;
    if (P.estado === 'saque' && P.saqueDe === j.id) {
      if (P.timer <= 0) sacar(j, clamp(j.hab + 0.15 + gauss() * 0.08, 0.3, 1));
      return;
    }
    if (j.cd <= 0 && alcanzable(j)) decidirIA(j);
  }
  function decidirIA(j) {
    const b = P.bola;
    const rivales = P.jug.filter((o) => o.lado !== j.lado);
    const enRed = rivales.filter((o) => Math.abs(o.y - RED_Y) < 4.3).length;
    const cercaRed = Math.abs(j.y - RED_Y) < 5;
    let tipo;
    if (b.z > 1.7) tipo = cercaRed && Math.random() < j.agresivo ? (b.z > 2 ? 'remate' : 'vibora') : Math.random() < 0.3 ? 'vibora' : 'bandeja';
    else if (enRed >= 1 && Math.random() < j.globeador) tipo = 'globo';
    else if (b.botes === 0) tipo = 'volea';
    else if (enRed === 0 && cercaRed && Math.random() < 0.22) tipo = 'dejada';
    else if (enRed === 2 && !cercaRed && Math.random() < 0.18) tipo = 'chiquita';
    else tipo = 'drive';
    const cerca = rivales.slice().sort((p, q) => Math.abs(p.x - b.x) - Math.abs(q.x - b.x))[0];
    /* devolver un remate o una bola muy baja o muy alta cuesta más */
    const dificultad = clamp((Math.hypot(b.vx, b.vy) - 8) / 14, 0, 0.35) + (b.z > 2.3 || b.z < 0.25 ? 0.12 : 0);
    golpear(j, tipo, clamp(j.hab + gauss() * 0.12 - dificultad, 0.12, 0.97), cerca.x < 5 ? rnd(6.2, 8.9) : rnd(1.1, 3.8));
  }
  function sacar(j, calidad) {
    const b = P.bola;
    Object.assign(b, { x: j.x, y: j.y + (j.lado === 0 ? -0.35 : 0.35), z: 0.9, viva: true });
    P.saqueX = j.x;
    P.estado = 'juego';
    golpear(j, 'saque', calidad, j.x < 5 ? rnd(6.2, 8.6) : rnd(1.4, 3.8));
  }

  // ---------------------------------------------------------------- salida de pista
  /* La bola que se va por el lateral se puede ir a buscar fuera, por la puerta */
  function intentarSalida(b, recibe) {
    const lado = b.x < W / 2 ? -1 : 1;
    const puertaX = lado < 0 ? 0 : W;
    const puertaY = recibe === 0 ? RED_Y + 1.3 : RED_Y - 1.3;
    const fx = puertaX + lado * 1.7;
    const fy = clamp(b.y, recibe === 0 ? RED_Y + 0.8 : 1.2, recibe === 0 ? L - 1.2 : RED_Y - 0.8);
    let mejor = null;
    for (const j of P.jug) {
      if (j.lado !== recibe) continue;
      const t = (Math.hypot(j.x - puertaX, j.y - puertaY) + Math.hypot(puertaX - fx, puertaY - fy)) / Math.max(3, j.vel);
      if (!mejor || t < mejor.t) mejor = { j, t };
    }
    if (!mejor || mejor.t > 2.4) return false;
    const j = mejor.j;
    const humano = j.humano && !j.ia;
    P.salida = { id: j.id, fin: P.t + (humano ? 1.25 : 0.85), x: fx, y: fy, lado, recibe, pidio: false, margen: 2.4 - mejor.t, humano };
    P.estado = 'salida';
    j.fuera = true;
    j.input.accion = null;
    h.aviso({ tipo: 'salida', id: j.id, lado: j.lado, humano, dur: humano ? 1.25 : 0.85 });
    h.sonido('grada');
    P.fiesta = 1.2;
    return true;
  }
  function actualizarSalida(dt) {
    const sa = P.salida;
    const b = P.bola;
    for (const j of P.jug) {
      if (j.id === sa.id) moverHacia(j, sa.x, sa.y, j.vel * 1.15);
      else {
        const o = posicionBase(j);
        moverHacia(j, o.x, o.y, j.vel * 0.7);
      }
      aplicarMovimiento(j, dt);
      if (j.anim > 0) j.anim -= dt;
    }
    /* la bola cae fuera, por donde corre el que sale */
    const k = Math.min(1, dt * 2.6);
    b.x += (sa.x + sa.lado * 0.3 - b.x) * k;
    b.y += (sa.y - b.y) * k;
    b.z = Math.max(0.9, b.z - dt * 2.2);
    const j = P.jug[sa.id];
    if (sa.humano && j.input.accion) {
      sa.pidio = true;
      j.input.accion = null;
    }
    if (P.t >= sa.fin) resolverSalida();
  }
  function resolverSalida() {
    const sa = P.salida;
    const j = P.jug[sa.id];
    const b = P.bola;
    const p = sa.humano ? (sa.pidio ? clamp(0.5 + sa.margen * 0.18 + (j.bonusCal || 0), 0.35, 0.85) : 0) : clamp(0.22 + sa.margen * 0.22 + ((j.hab || 0.6) - 0.55), 0.1, 0.7);
    P.salida = null;
    P.estado = 'juego';
    if (Math.random() >= p) {
      b.viva = true;
      return terminar(1 - sa.recibe, 'por3', { porTres: true });
    }
    j.x = sa.x;
    j.y = sa.y;
    Object.assign(b, { x: sa.x - sa.lado * 0.35, y: sa.y, z: 1, fueraPista: true, viva: true });
    golpear(j, 'globo', clamp(0.55 + (j.hab || 0.6) * 0.3, 0.45, 0.9), sa.lado < 0 ? rnd(1.8, 4.2) : rnd(5.8, 8.2));
    b.fueraPista = true;
    h.efecto('texto', j.x, j.y, 'devueltaFuera', '#7FD3F7');
    h.sonido('grada');
    P.fiesta = 1.6;
  }

  // ---------------------------------------------------------------- el partido
  function prepararSaque(repite) {
    if (!repite) P.saqueN = 1;
    /* quién saca: por juegos; en el tie-break, uno el primero y luego de dos en dos */
    const n = P.puntos[0] + P.puntos[1];
    let lado = P.sacaLado;
    let idx = Math.floor(P.nJuego / 2) % 2; // el turno de saque sigue de un set al otro
    if (P.tb) {
      const k = Math.floor((n + 1) / 2);
      lado = k % 2 === 0 ? P.tbSaca : 1 - P.tbSaca;
      idx = (Math.floor(P.nJuego / 2) + Math.floor(k / 2)) % 2;
    }
    const equipo = P.jug.filter((j) => j.lado === lado);
    const servidor = equipo[idx];
    /* se saca cruzado y alternando lado (el primer punto, desde la derecha). Cada uno conserva su
       posición, drive o revés: su pareja lo espera en la red */
    const derecha = n % 2 === 0;
    const xSaque = (lado === 0) === derecha ? 7.3 : 2.7;
    const xResto = W - xSaque;
    for (const j of P.jug) j.carril = j.carrilBase;
    P.saqueDe = servidor.id;
    P.sacaAhora = lado;
    for (const j of P.jug) {
      j.x = j === servidor ? xSaque : j.carril === 'izq' ? 2.7 : 7.3;
      if (j.lado === lado) j.y = j === servidor ? (lado === 0 ? 17.4 : 2.6) : lado === 0 ? 12.8 : 7.2;
      else j.y = Math.abs(j.x - xResto) < 1 ? (j.lado === 0 ? 18.1 : 1.9) : j.lado === 0 ? 15.6 : 4.4; // resta al fondo; su pareja, más adelante
      j.vx = j.vy = 0;
      j.swing = 0;
      j.cd = 0;
      j.anim = 0;
      j.fuera = false;
      j.apunte = null;
      j.input.accion = null;
    }
    P.bola = Object.assign(nuevaBola(), { x: servidor.x + (lado === 0 ? 0.3 : -0.3), y: servidor.y + (lado === 0 ? -0.35 : 0.35), z: 0.5 });
    P.estado = 'saque';
    P.rally = 0;
    P.prediccion = [];
    P.timer = servidor.humano && !servidor.ia ? 2.2 : 0.8;
    h.ayuda(servidor.humano && !servidor.ia ? servidor.id : null, P.saqueN === 2 ? 'saque2' : 'saque');
  }
  function finPunto(ganador, motivo, extra) {
    P.ultimoGanador = ganador; // para que festejen
    const oro = !P.tb && P.puntos[0] === 3 && P.puntos[1] === 3;
    const st = P.stats;
    P.estado = 'punto';
    P.timer = PAUSA_PUNTO;
    P.puntosJugados++;
    st.rallyMax = Math.max(st.rallyMax, P.rally);
    st.puntos[ganador]++;
    if (extra.porTres) st.porTres[ganador]++;
    if (oro) st.oros[ganador]++;
    P.puntos[ganador]++;
    let que = oro ? 'oro' : 'punto';
    if (P.tb) {
      const a = P.puntos[ganador];
      const o = P.puntos[1 - ganador];
      if (a >= 7 && a - o >= 2) {
        P.juegos[ganador]++;
        P.tb = false;
        P.puntos = [0, 0];
        P.nJuego++;
        P.sacaLado = 1 - P.tbSaca; // el set siguiente lo empieza sacando quien restó primero en el tie-break
        que = cerrarSet(ganador);
      } else que = 'tb';
    } else if (P.puntos[ganador] >= 4) {
      P.juegos[ganador]++;
      P.puntos = [0, 0];
      P.sacaLado = 1 - P.sacaLado;
      P.nJuego++;
      const a = P.juegos[ganador];
      const o = P.juegos[1 - ganador];
      const N = P.juegosGanar;
      que = 'juego';
      if (a >= N && a - o >= 2) que = cerrarSet(ganador);
      else if (a === N && o === N) {
        P.tb = true;
        P.tbSaca = P.sacaLado;
        que = 'empiezaTb';
      }
    }
    h.aviso({ tipo: 'punto', ganador, motivo, que, oro, puntos: P.puntos.slice(), juegos: P.juegos.slice(), sets: P.setsG.slice(), marcadorSets: P.marcadorSets.map((s) => s.slice()), dur: PAUSA_PUNTO });
    h.ayuda(null, '');
    h.sonido('punto', ganador);
    /* el público: aplaude los puntos buenos y los peloteos largos, y se viene arriba al final */
    if (P.acabado) {
      h.sonido('ovacion');
      P.fiesta = 2.6;
    } else if (extra.porTres || oro || P.rally >= 9 || ['por3', 'por4', 'dejada', 'remate', 'vibora', 'ace'].includes(motivo) || que === 'set') {
      h.sonido('grada');
      P.fiesta = 1.5;
    }
    h.efecto('sacudir', extra.porTres ? 12 : 3);
    if (['por3', 'por4', 'dejada', 'remate', 'vibora', 'dobleBote', 'ace'].includes(motivo)) {
      P.lento = 0.45;
      h.efecto('confeti', ganador);
    }
  }
  /* Set terminado: si alguien llega a los sets que hacen falta se acaba el partido; si no, empieza otro */
  function cerrarSet(ganador) {
    P.marcadorSets.push(P.juegos.slice());
    P.setsG[ganador]++;
    if (P.setsG[ganador] >= P.setsGanar) {
      P.acabado = true;
      return 'partido';
    }
    P.juegos = [0, 0];
    return 'set';
  }
  /* Falta en el primer saque: se saca otra vez. El saque que toca la red y entra es let: se repite */
  function faltaSaque(motivo) {
    P.estado = 'falta';
    P.timer = 0.95;
    P.saqueN = 2;
    h.aviso({ tipo: 'falta', motivo, dur: 0.95 });
    h.ayuda(null, '');
  }
  function repetirSaque() {
    P.bola.viva = false;
    P.estado = 'falta';
    P.timer = 0.85;
    h.aviso({ tipo: 'let', dur: 0.85 });
    return 'fin';
  }
  function terminarPartido() {
    P.estado = 'fin';
    h.fin({ ganador: P.setsG[0] > P.setsG[1] ? 0 : 1, sets: P.marcadorSets.map((s) => s.slice()), setsG: P.setsG.slice(), stats: P.stats });
  }

  /** Un paso de 1/120 s. P.lento pide cámara lenta después de un golpe ganador: la aplica quien llama. */
  function actualizar(dt) {
    if (P.estado === 'fin') return;
    P.t += dt;
    if (P.timer > 0) P.timer -= dt;
    if (P.fiesta > 0) P.fiesta -= dt;
    if (P.estado === 'punto' || P.estado === 'falta') {
      for (const j of P.jug) {
        j.vx *= 0.9;
        j.vy *= 0.9;
        j.input.accion = null;
        aplicarMovimiento(j, dt);
        if (j.anim > 0) j.anim -= dt;
      }
      if (P.timer <= 0) {
        if (P.estado === 'falta') prepararSaque(true);
        else if (P.acabado) terminarPartido();
        else prepararSaque();
      }
    } else if (P.estado === 'saque') {
      const s = P.jug[P.saqueDe];
      P.bola.z = 0.08 + Math.abs(Math.sin(P.t * 4.4)) * 0.62; // bota la bola antes de sacar, como manda el reglamento
      for (const j of P.jug) if (j !== s) j.input.accion = null;
      if (s.humano && !s.ia) {
        if (s.input.accion || P.timer <= 0) {
          s.input.accion = null;
          h.ayuda(null, '');
          sacar(s, 0.8 + 0.2 * Math.random());
        }
      } else if (P.timer <= 0) {
        h.ayuda(null, '');
        sacar(s, clamp(s.hab + 0.15 + gauss() * 0.08, 0.3, 1));
      }
    } else if (P.estado === 'salida') {
      actualizarSalida(dt);
    } else {
      for (const j of P.jug) (j.humano ? actualizarHumano : actualizarIA)(j, dt);
      actualizarBola(dt);
    }
  }

  prepararSaque();
  return {
    P,
    actualizar,
    alcanzable,
    /** Lo que manda una persona: joystick (en pantalla) y el botón que tocó. */
    entrada(id, inp) {
      const j = P.jug[id];
      if (!j || !j.humano) return;
      j.input.ax = clamp(Number(inp.ax) || 0, -1, 1);
      j.input.ay = clamp(Number(inp.ay) || 0, -1, 1);
      if (inp.accion && ['golpe', 'remate', 'globo', 'dejada'].includes(inp.accion)) j.input.accion = inp.accion;
    },
    /** Si una persona se va (o se corta), juega la máquina por ella hasta que vuelva. */
    ponerIA(id, on) {
      const j = P.jug[id];
      if (!j) return;
      j.ia = !!on;
      if (on) Object.assign(j, { reaccion: j.reaccion ?? 0.16, agresivo: j.agresivo ?? 0.5, globeador: j.globeador ?? 0.35, hab: Math.max(j.hab || 0.6, 0.62) });
    },
  };
}

export const COLOR_GOLPE = { remate: '#FF9F43', vibora: '#FF9F43', plano: '#FF9F43', globo: '#7FD3F7', dejada: '#E4F3EF', chiquita: '#E4F3EF', bandeja: '#DCF54A', volea: '#DCF54A', drive: '#DCF54A' };
export const NOM_PUNTO = ['0', '15', '30', '40'];
