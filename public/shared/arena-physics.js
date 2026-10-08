/**
 * Física de discos para las arenas en tiempo real (Sumo, Rey de la Colina). Pura: sin DOM, sin azar y sin
 * Date.now(), así la corre igual el servidor, el modo sin conexión y la predicción del cliente.
 *
 *  - Paso fijo de 1/30 s (TPS = 30). Unidades: píxeles y píxeles por segundo. Matemática determinista: solo
 *    suma, resta, producto, división y raíz cuadrada (nada de seno / coseno dentro de la simulación).
 *  - Un disco tiene masa (`invMass`), velocidad y amortiguación. Choques elásticos disco contra disco con
 *    coeficiente de restitución `e` (≤ 1: nunca ganan energía) y separación por masa; rebote contra paredes.
 *  - "Disco controlado" (la persona o un bot): empuja con un vector de movimiento (mx, my) de módulo ≤ 1,
 *    tiene una dirección de mirada (fx, fy) y habilidades con recarga: Empujón (dash, b = 1) y Onda (b = 2).
 *
 * Entrada de una persona (misma forma que `net/input.js`): [seq, paso, d, b]
 *   d = código de movimiento 0..80 (ax, ay enteros en -4..4 → (ax + 4) × 9 + (ay + 4); 40 = quieto)
 *   b = 0 nada · 1 Empujón · 2 Onda (si el juego la tiene)
 * El código manda lo que se mantiene apretado desde ese paso: solo hay un mensaje cuando cambia (no 30 por segundo).
 *
 *   queueInputs(p, list, tick, maxAct)  servidor: valida y encola (devuelve false si el mensaje está mal formado)
 *   applyInputs(p, list, tick)          aplica las que ya les toca (k <= paso), en orden y sin repetir (s <= p.seq)
 *   stepMotion(p)                       un paso de un disco: aceleración, amortiguación, avance y recargas
 *   stepOwn(p, list, tick)              applyInputs + stepMotion: es la predicción del disco propio en el cliente
 *   collideAll(discs, e, onHit)         choques entre todos los pares
 */
export const TPS = 30;
export const DT = 1 / TPS;

export const CTRL = {
  acc: 28, // velocidad (px/s) que gana por paso con la entrada al máximo
  damping: 0.9, // por paso: la velocidad terminal es acc × damping / (1 - damping) ≈ 252 px/s
  dashSpeed: 360, // px/s que suma el Empujón en la dirección de la mirada
  dashTicks: 9, // pasos que dura (el disco pesa más mientras tanto)
  dashCd: 36, // recarga: 1,2 s
  dashMass: 0.55, // multiplica la inversa de la masa mientras dura el Empujón (más pesado)
  waveCd: 180, // recarga de la Onda: 6 s
  maxSpeed: 900, // tope de seguridad
  inboxMax: 8,
  kPast: 12, // una entrada puede venir fechada hasta 12 pasos atrás o adelante
  kAhead: 12,
};
export const RESTITUTION = 0.85;

// ---------------------------------------------------------------- código de movimiento
const LV = 4;
export const MOVE_STILL = LV * 9 + LV; // 40
export const MOVE_UP = LV * 9; // ax = 0, ay = -4
export const MOVE_X = new Float64Array(81);
export const MOVE_Y = new Float64Array(81);
for (let ax = -LV; ax <= LV; ax++) {
  for (let ay = -LV; ay <= LV; ay++) {
    let x = ax / LV;
    let y = ay / LV;
    const l = Math.sqrt(x * x + y * y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    MOVE_X[(ax + LV) * 9 + (ay + LV)] = x;
    MOVE_Y[(ax + LV) * 9 + (ay + LV)] = y;
  }
}

/** Código de movimiento de un vector (x, y) cualquiera: se recorta a módulo 1 y se redondea a cuartos. */
export function encodeMove(x, y) {
  const l = Math.sqrt(x * x + y * y);
  if (!(l > 0)) return MOVE_STILL;
  if (l > 1) {
    x /= l;
    y /= l;
  }
  const ax = Math.max(-LV, Math.min(LV, Math.round(x * LV)));
  const ay = Math.max(-LV, Math.min(LV, Math.round(y * LV)));
  return (ax + LV) * 9 + (ay + LV);
}
export const validMove = (c) => Number.isInteger(c) && c >= 0 && c <= 80;

// ---------------------------------------------------------------- discos
/** Disco controlable. `invMass0` es la inversa de la masa en reposo (el Empujón la baja un rato). */
export function newDisc(o = {}) {
  const invMass = o.invMass ?? 1;
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 18,
    invMass,
    invMass0: invMass,
    damping: CTRL.damping,
    mx: 0,
    my: 0,
    mc: MOVE_STILL, // código del movimiento apretado
    fx: 0,
    fy: -1, // hacia dónde mira (el Empujón sale para ahí)
    fc: MOVE_UP, // código de la mirada (arriba)
    dashCd: 0,
    dashT: 0,
    waveCd: 0,
    seq: 0, // última entrada aplicada
    inSeq: 0, // última entrada aceptada en la cola
    lastK: 0,
    inbox: [],
    ...o,
  };
}

/** Fija hacia dónde mira desde un código de movimiento (el Empujón sale para ahí). */
export function setFace(p, code) {
  p.fc = code;
  const x = MOVE_X[code];
  const y = MOVE_Y[code];
  const l = Math.sqrt(x * x + y * y) || 1;
  p.fx = x / l;
  p.fy = y / l;
}

/** Fija el movimiento desde un código; si empuja, también cambia la mirada. */
export function setMove(p, code) {
  p.mc = code;
  p.mx = MOVE_X[code];
  p.my = MOVE_Y[code];
  if (code !== MOVE_STILL) setFace(p, code);
}

/** Control directo (bots): vector libre; la mirada es exacta, sin redondear. */
export function steer(p, x, y) {
  const l = Math.sqrt(x * x + y * y);
  if (!(l > 1e-6)) {
    p.mx = p.my = 0;
    return;
  }
  const k = l > 1 ? 1 / l : 1;
  p.mx = x * k;
  p.my = y * k;
  p.fx = x / l;
  p.fy = y / l;
}

/** Empujón: suma velocidad hacia donde mira y pesa más unos pasos. false si todavía está recargando. */
export function dash(p) {
  if (p.dashCd > 0) return false;
  p.vx += p.fx * CTRL.dashSpeed;
  p.vy += p.fy * CTRL.dashSpeed;
  p.dashCd = CTRL.dashCd;
  p.dashT = CTRL.dashTicks;
  p.invMass = p.invMass0 * CTRL.dashMass;
  return true;
}

/** Onda: solo arranca la recarga; el empuje a los demás lo aplica el mundo del juego. false si recarga. */
export function wave(p) {
  if (p.waveCd > 0) return false;
  p.waveCd = CTRL.waveCd;
  return true;
}

/** Acción de una entrada (b): devuelve 1 / 2 si arrancó un Empujón / una Onda, 0 si no pasó nada. */
export function act(p, b) {
  if (b === 1) return dash(p) ? 1 : 0;
  if (b === 2) return wave(p) ? 2 : 0;
  return 0;
}

/**
 * Encola entradas de una persona: [[s, k, d, b], …] (las últimas, con redundancia). Valida todo.
 * Devuelve false si el mensaje está mal formado. `maxAct`: la acción más alta que el juego acepta (1 o 2).
 */
export function queueInputs(p, list, tick, maxAct = 1) {
  if (!Array.isArray(list) || list.length > 6) return false;
  for (const e of list) {
    if (!Array.isArray(e) || e.length < 4) return false;
    const [s, k, d, b] = e;
    if (!Number.isInteger(s) || !Number.isInteger(k) || !validMove(d) || !Number.isInteger(b) || b < 0 || b > maxAct) return false;
    if (s <= p.inSeq) continue; // repetida (viene con redundancia)
    if (p.inbox.length >= CTRL.inboxMax) continue;
    const kk = Math.max(p.lastK, Math.max(tick - CTRL.kPast, Math.min(tick + CTRL.kAhead, k)));
    p.lastK = kk;
    p.inSeq = s;
    p.inbox.push({ s, k: kk, d, b });
  }
  return true;
}

/**
 * Aplica las entradas pendientes que ya les toca (k <= paso), en orden y sin repetir. `onAct(p, qué)` se llama
 * cuando una acción arranca de verdad (el servidor lo usa para la Onda). Devuelve cuántas aplicó.
 */
export function applyInputs(p, list, tick, onAct) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.s <= p.seq) continue;
    if (e.k > tick) break;
    p.seq = e.s;
    setMove(p, e.d);
    if (e.b) {
      const a = act(p, e.b);
      if (a && onAct) onAct(p, a);
    }
    n++;
  }
  return n;
}

/** Un paso de un disco: acelera con la entrada, amortigua, avanza y baja las recargas. */
export function stepMotion(p) {
  p.vx = (p.vx + p.mx * CTRL.acc) * p.damping;
  p.vy = (p.vy + p.my * CTRL.acc) * p.damping;
  const s2 = p.vx * p.vx + p.vy * p.vy;
  if (s2 > CTRL.maxSpeed * CTRL.maxSpeed) {
    const k = CTRL.maxSpeed / Math.sqrt(s2);
    p.vx *= k;
    p.vy *= k;
  }
  p.x += p.vx * DT;
  p.y += p.vy * DT;
  if (p.dashCd > 0) p.dashCd--;
  if (p.dashT > 0 && --p.dashT === 0) p.invMass = p.invMass0;
  if (p.waveCd > 0) p.waveCd--;
}

/** Predicción del disco propio en el cliente (sin choques: eso lo corrige el servidor). */
export function stepOwn(p, list, tick) {
  applyInputs(p, list, tick);
  stepMotion(p);
}

// ---------------------------------------------------------------- choques
/**
 * Choque elástico de dos discos. Los separa según la masa y intercambia velocidad con restitución `e`.
 * Devuelve la velocidad de acercamiento (0 si no se tocaban o ya se alejaban).
 */
export function collide(a, b, e = RESTITUTION) {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  const d2 = dx * dx + dy * dy;
  const R = a.r + b.r;
  if (d2 > R * R) return 0;
  const sum = a.invMass + b.invMass;
  if (sum === 0) return 0;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // justo encimados: se los separa por un eje fijo (determinista)
    dx = 1;
    dy = 0;
    d = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  const fa = a.invMass / sum;
  const over = R - d;
  a.x += dx * over * fa;
  a.y += dy * over * fa;
  b.x -= dx * over * (1 - fa);
  b.y -= dy * over * (1 - fa);
  const rv = dx * (a.vx - b.vx) + dy * (a.vy - b.vy);
  if (rv >= 0) return 0;
  const j = (-(1 + e) * rv) / sum; // impulso
  a.vx += dx * j * a.invMass;
  a.vy += dy * j * a.invMass;
  b.vx -= dx * j * b.invMass;
  b.vy -= dy * j * b.invMass;
  return -rv;
}

/** Todos los pares. `onHit(a, b, velocidad)` se llama por cada choque real. Devuelve la cantidad. */
export function collideAll(discs, e = RESTITUTION, onHit) {
  let n = 0;
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const s = collide(discs[i], discs[j], e);
      if (s > 0) {
        n++;
        if (onHit) onHit(discs[i], discs[j], s);
      }
    }
  }
  return n;
}

/** Rebote contra las paredes de un rectángulo centrado en (0, 0) de medio ancho `hw` y medio alto `hh`. Devuelve la velocidad del golpe. */
export function bounceRect(d, hw, hh, e = 0.8) {
  let hit = 0;
  const lx = hw - d.r;
  const ly = hh - d.r;
  if (d.x > lx) {
    d.x = lx;
    if (d.vx > 0) (hit = Math.max(hit, d.vx)), (d.vx = -d.vx * e);
  } else if (d.x < -lx) {
    d.x = -lx;
    if (d.vx < 0) (hit = Math.max(hit, -d.vx)), (d.vx = -d.vx * e);
  }
  if (d.y > ly) {
    d.y = ly;
    if (d.vy > 0) (hit = Math.max(hit, d.vy)), (d.vy = -d.vy * e);
  } else if (d.y < -ly) {
    d.y = -ly;
    if (d.vy < 0) (hit = Math.max(hit, -d.vy)), (d.vy = -d.vy * e);
  }
  return hit;
}

/** Empuje radial (la Onda): a todo disco de `list` a menos de `radius` de (cx, cy) le suma velocidad hacia afuera. */
export function blast(list, cx, cy, radius, power, skip) {
  let n = 0;
  for (const d of list) {
    if (d === skip) continue;
    const dx = d.x - cx;
    const dy = d.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > radius * radius) continue;
    const dist = Math.sqrt(d2);
    // más fuerte cerca; si están justo encima, hacia un eje fijo
    const k = (power * (1 - 0.5 * (dist / radius))) * d.invMass;
    if (dist < 1e-6) d.vx += k;
    else {
      d.vx += (dx / dist) * k;
      d.vy += (dy / dist) * k;
    }
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- ayudas para bots
/**
 * Tabla de frenado: distancia que recorre un disco que va a `v` px/s (de 10 en 10) si empuja con todo en contra
 * hasta pararse. Se calcula con la misma fórmula del paso (sin entrada se resbalaría 4 veces más lejos).
 */
const BRAKE = (() => {
  const t = [];
  for (let s = 0; s <= 1000; s += 10) {
    let v = s;
    let d = 0;
    while (v > 0.5) {
      v = Math.max(0, (v - CTRL.acc) * CTRL.damping);
      d += v * DT;
    }
    t.push(d);
  }
  return t;
})();
export function brakeDist(speed) {
  const i = Math.min(BRAKE.length - 2, speed / 10);
  const k = Math.floor(i);
  return BRAKE[k] + (BRAKE[k + 1] - BRAKE[k]) * (i - k);
}

export const speedOf = (d) => Math.sqrt(d.vx * d.vx + d.vy * d.vy);
/** Energía cinética total (para las pruebas: sin aceleración ni Empujones no puede subir). */
export const kinetic = (discs) => discs.reduce((s, d) => s + (0.5 * (d.vx * d.vx + d.vy * d.vy)) / (d.invMass || 1e-9), 0);
export const momentum = (discs) => discs.reduce((s, d) => ({ x: s.x + d.vx / (d.invMass || 1e-9), y: s.y + d.vy / (d.invMass || 1e-9) }), { x: 0, y: 0 });
