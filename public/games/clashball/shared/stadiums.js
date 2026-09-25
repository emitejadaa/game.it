/**
 * Estadios y modos de Clashball.
 *
 * Los estadios reproducen la geometría de los mapas originales de HaxBall (Classic, Small, Big,
 * Huge, Rounded, Hockey y Big Hockey): planos exteriores, líneas de la cancha que solo frenan la
 * pelota, redes curvas, postes (discos fijos de radio 8), barrera del saque inicial en el círculo
 * central y distancia de aparición = 0,75 · ancho de la cancha.
 *
 * Los modos cambian la física de jugadores y pelota (valores por tick, como HaxBall).
 */
import { F, vertex, plane, segment, disc } from './physics.js';

export const PLAYER_PHYSICS = Object.freeze({
  radius: 15,
  bCoef: 0.5,
  invMass: 0.5,
  damping: 0.96,
  acceleration: 0.1,
  kickingAcceleration: 0.07,
  kickingDamping: 0.96,
  kickStrength: 5,
  kickback: 0,
});

export const BALL_PHYSICS = Object.freeze({ r: 10, bCoef: 0.5, invMass: 1, damping: 0.99 });

export const MODES = {
  classic: {
    name: { es: 'Clásico', en: 'Classic' },
    desc: { es: 'Las físicas de siempre', en: 'The original physics' },
  },
  futsal: {
    name: { es: 'Futsal', en: 'Futsal' },
    desc: { es: 'Pelota chica y pesada, pases rápidos', en: 'Small heavy ball, quick passing' },
    player: { bCoef: 0, acceleration: 0.11, kickingAcceleration: 0.083, kickStrength: 5 },
    ball: { r: 6.4, invMass: 1.5, bCoef: 0.4, damping: 0.99 },
  },
  ice: {
    name: { es: 'Hielo', en: 'Ice' },
    desc: { es: 'Pista de hockey: patinás y cuesta frenar', en: 'Hockey rink: you slide and brake late' },
    player: { acceleration: 0.055, kickingAcceleration: 0.04, damping: 0.98, kickingDamping: 0.98, kickStrength: 5.5 },
    ball: { damping: 0.995, bCoef: 0.6 },
    rink: true,
  },
  chaos: {
    name: { es: 'Caos', en: 'Chaos' },
    desc: { es: 'Tres pelotas a la vez', en: 'Three balls at once' },
    balls: 3,
  },
};

export const STADIUMS = {
  small: { name: { es: 'Chica', en: 'Small' }, args: ['classic', 420, 200, 320, 130, 55, 70] },
  classic: { name: { es: 'Clásica', en: 'Classic' }, args: ['classic', 420, 200, 370, 170, 64, 75] },
  rounded: { name: { es: 'Redondeada', en: 'Rounded' }, args: ['classic', 420, 200, 370, 170, 64, 75, 75] },
  big: { name: { es: 'Grande', en: 'Big' }, args: ['classic', 600, 270, 550, 240, 80, 80] },
  huge: { name: { es: 'Enorme', en: 'Huge' }, args: ['classic', 750, 350, 700, 320, 100, 80] },
  hockey: { name: { es: 'Hockey', en: 'Hockey' }, args: ['hockey', 420, 204, 398, 182, 68, 120, 75, 100] },
  bighockey: { name: { es: 'Hockey grande', en: 'Big hockey' }, args: ['hockey', 600, 270, 550, 240, 90, 160, 75, 150] },
};

/** Estadio sugerido según jugadores por equipo y modo. */
export function autoStadium(perTeam, mode) {
  if (MODES[mode]?.rink) return perTeam <= 2 ? 'hockey' : 'bighockey';
  if (perTeam <= 2) return 'classic';
  if (perTeam <= 4) return 'big';
  return 'huge';
}

export const resolveStadium = (id, perTeam, mode) => (STADIUMS[id] ? id : autoStadium(perTeam, mode));

// ------------------------------------------------------------------ construcción
function base(id, width, height) {
  return {
    id,
    width,
    height,
    vertices: [],
    segments: [],
    planes: [],
    goals: [],
    posts: [],
    bg: null,
    spawnDistance: 0,
  };
}

/** Red y postes de un arco (función v5 de HaxBall). dir = 1 derecha (azul), -1 izquierda (rojo). */
function goal(st, x, dir, gy, team, cMask = F.ball) {
  const o = { cMask, cGroup: F.wall, bCoef: 0.1 };
  const a = vertex(x + 8 * dir, -gy, o);
  const b = vertex(x + 8 * dir, gy, o);
  const c = vertex(x + 30 * dir, 22 - gy, o);
  const d = vertex(x + 30 * dir, gy - 22, o);
  st.vertices.push(a, b, c, d);
  st.segments.push(segment(a, c, { ...o, curve: 90 * dir, net: team }));
  st.segments.push(segment(d, c, { ...o, net: team }));
  st.segments.push(segment(d, b, { ...o, curve: 90 * dir, net: team }));
  st.posts.push(disc({ x, y: -gy, r: 8, invMass: 0, team }), disc({ x, y: gy, r: 8, invMass: 0, team }));
  st.goals.push({ team, x0: x, y0: -gy, x1: x, y1: gy });
}

/** Barrera del saque: línea central + medio círculo según qué equipo saca (función eh). */
function kickoffBarrier(st, ko, h) {
  const o = { bCoef: 0.1, cGroup: F.redKO | F.blueKO, cMask: F.red | F.blue };
  const a = vertex(0, -h, o);
  const b = vertex(0, -ko, o);
  const c = vertex(0, ko, o);
  const d = vertex(0, h, o);
  st.vertices.push(a, b, c, d);
  const hidden = { ...o, vis: false };
  st.segments.push(segment(a, b, hidden), segment(c, d, hidden));
  st.segments.push(segment(b, c, { ...hidden, cGroup: F.redKO, curve: 180 }));
  st.segments.push(segment(c, b, { ...hidden, cGroup: F.blueKO, curve: 180 }));
}

/** Esquinas redondeadas que solo frenan la pelota (función _h). */
function corners(st, w, h, r) {
  if (r <= 0) return;
  const V = (x, y) => {
    const v = vertex(x, y, { cMask: 0 });
    st.vertices.push(v);
    return v;
  };
  const o = { bCoef: 1, cMask: F.ball, vis: false };
  st.segments.push(segment(V(-w + r, -h), V(-w, -h + r), { ...o, curve: -90 }));
  st.segments.push(segment(V(-w + r, h), V(-w, h - r), { ...o, curve: 90 }));
  st.segments.push(segment(V(w - r, h), V(w, h - r), { ...o, curve: -90 }));
  st.segments.push(segment(V(w - r, -h), V(w, -h + r), { ...o, curve: 90 }));
}

function outer(st, width, height) {
  const o = { bCoef: 0 };
  st.planes.push(plane(0, 1, -height, o), plane(0, -1, -height, o), plane(1, 0, -width, o), plane(-1, 0, -width, o));
}

function classicStadium(id, width, height, bw, bh, gy, ko, corner = 0) {
  const st = base(id, width, height);
  st.bg = { type: 'grass', w: bw, h: bh, ko, corner, goalLine: 0, goalY: gy };
  st.spawnDistance = Math.min(400, 0.75 * bw);
  outer(st, width, height);
  goal(st, bw, 1, gy, 2);
  goal(st, -bw, -1, gy, 1);
  kickoffBarrier(st, ko, height);
  st.planes.push(plane(0, 1, -bh, { cMask: F.ball }), plane(0, -1, -bh, { cMask: F.ball }));
  const V = (x, y) => {
    const v = vertex(x, y, { cMask: 0 });
    st.vertices.push(v);
    return v;
  };
  const tl = V(-bw, -bh);
  const tr = V(bw, -bh);
  const rt = V(bw, -gy);
  const rb = V(bw, gy);
  const br = V(bw, bh);
  const bl = V(-bw, bh);
  const lb = V(-bw, gy);
  const lt = V(-bw, -gy);
  const o = { cMask: F.ball, vis: false };
  st.segments.push(segment(tr, rt, o), segment(rb, br, o), segment(bl, lb, o), segment(lt, tl, o));
  corners(st, bw, bh, corner);
  return st;
}

function hockeyStadium(id, width, height, bw, bh, gy, goalLine, ko, corner) {
  const st = base(id, width, height);
  st.bg = { type: 'hockey', w: bw, h: bh, ko, corner, goalLine, goalY: gy };
  st.spawnDistance = Math.min(400, 0.75 * (bw - goalLine));
  outer(st, width, height);
  goal(st, bw - goalLine, 1, gy, 2, F.all);
  goal(st, -bw + goalLine, -1, gy, 1, F.all);
  kickoffBarrier(st, ko, height);
  st.planes.push(
    plane(0, 1, -bh, { cMask: F.ball }),
    plane(0, -1, -bh, { cMask: F.ball }),
    plane(1, 0, -bw, { cMask: F.ball }),
    plane(-1, 0, -bw, { cMask: F.ball }),
  );
  corners(st, bw, bh, corner);
  return st;
}

/** Arma el estadio con la física del modo. */
export function buildStadium(id, modeId = 'classic') {
  const def = STADIUMS[id] || STADIUMS.classic;
  const mode = MODES[modeId] || MODES.classic;
  const [kind, ...args] = def.args;
  const st = kind === 'hockey' ? hockeyStadium(id, ...args) : classicStadium(id, ...args);
  st.mode = MODES[modeId] ? modeId : 'classic';
  st.player = { ...PLAYER_PHYSICS, ...(mode.player || {}) };
  st.ball = { ...BALL_PHYSICS, ...(mode.ball || {}) };
  const n = mode.balls || 1;
  const ko = st.bg.ko;
  const side = ko + (st.bg.h - ko) / 2;
  st.ballSpawns = n === 1 ? [[0, 0]] : [[0, 0], [0, -side], [0, side]].slice(0, n);
  return st;
}
