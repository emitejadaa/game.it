/**
 * Canchas y modos de Voleyball.
 *
 * Vista de costado, como los mapas de vóley de HaxBall: x es el ancho (la red está en x = 0, el rojo
 * juega a la izquierda) e y es la altura, hacia abajo como en la pantalla: el piso está en y = 0 y
 * el borde de arriba del mapa en y = −height. La pelota tiene gravedad y los jugadores no: flotan y
 * se mueven en las 8 direcciones con la física de Clashball, sin salir del mapa. La pelota los
 * atraviesa (solo se le pega con la patada), rebota en las paredes de los costados y arriba no tiene
 * techo: si sube mucho sale del mapa y vuelve a caer.
 *
 * Unidades: las de HaxBall (píxeles y ticks de 1/60 s).
 */
import { F, plane } from './physics.js';

/** Altura de la red desde el piso. */
export const NET_H = 100;

export const PLAYER_PHYSICS = Object.freeze({
  radius: 15,
  bCoef: 0.5,
  invMass: 0.5,
  damping: 0.96,
  acceleration: 0.11,
  kickingAcceleration: 0.08, // apretando se mueve más lento, como en HaxBall
  kickingDamping: 0.96,
});

export const BALL_PHYSICS = Object.freeze({
  r: 9,
  gravity: 0.085,
  damping: 0.995,
  bCoef: 0.55, // rebote en las paredes y la red
  floorBCoef: 0.45, // pique en el piso (ya es punto: solo se ve)
});

/** El golpe: como la patada de HaxBall, sale desde el centro del jugador hacia la pelota. */
export const KICK = Object.freeze({
  strength: 6, // impulso (la patada de HaxBall es 5)
  carry: 0.5, // cuánto conserva de la velocidad que traía la pelota
  run: 0.5, // cuánto suma ir hacia la pelota al pegarle
  range: 5, // distancia al borde del jugador hasta la que llega (HaxBall: 4)
  max: 10, // velocidad máxima de la pelota después de un golpe
});

export const MODES = {
  classic: {
    name: { es: 'Clásico', en: 'Classic' },
    desc: { es: 'Rápida y bombeada, como siempre', en: 'Fast and lofted, the usual' },
  },
  beach: {
    name: { es: 'Playa', en: 'Beach' },
    desc: { es: 'Pelota liviana que flota: más fácil de sostener', en: 'Light floaty ball: easier rallies' },
    ball: { gravity: 0.065 },
    kick: { strength: 5.3 },
    player: { acceleration: 0.1, kickingAcceleration: 0.07 },
  },
  turbo: {
    name: { es: 'Turbo', en: 'Turbo' },
    desc: { es: 'Saques y remates bombazo, todo más rápido', en: 'Rocket serves and spikes, all faster' },
    ball: { gravity: 0.12 },
    kick: { strength: 7.2, max: 11.5 },
    player: { acceleration: 0.13, kickingAcceleration: 0.095 },
  },
};

/**
 * cw: de la red a la pared; height: del piso al borde de arriba del mapa; serve: fuerza extra del
 * saque, para que desde el fondo llegue a toda la cancha rival.
 */
export const COURTS = {
  small: { name: { es: 'Chica', en: 'Small' }, cw: 240, height: 290, serve: 0.95 },
  classic: { name: { es: 'Clásica', en: 'Classic' }, cw: 300, height: 310, serve: 1.1 },
  big: { name: { es: 'Grande', en: 'Big' }, cw: 370, height: 330, serve: 1.18 },
};

/** Cancha sugerida según jugadores por equipo. */
export function autoCourt(perTeam) {
  if (perTeam <= 1) return 'small';
  if (perTeam <= 3) return 'classic';
  return 'big';
}

export const resolveCourt = (id, perTeam) => (COURTS[id] ? id : autoCourt(perTeam));

/** Arma la cancha con la física del modo. */
export function buildCourt(id, modeId = 'classic') {
  const def = COURTS[id] || COURTS.classic;
  const mode = MODES[modeId] || MODES.classic;
  const { cw, height } = def;
  const ball = { ...BALL_PHYSICS, ...(mode.ball || {}) };
  const st = {
    id: COURTS[id] ? id : 'classic',
    mode: MODES[modeId] ? modeId : 'classic',
    cw,
    height,
    netH: NET_H,
    serveX: Math.min(cw - 52, 250), // dónde espera la pelota del saque
    serveY: -112,
    planes: [],
    player: { ...PLAYER_PHYSICS, ...(mode.player || {}) },
    ball,
    kick: { ...KICK, serve: def.serve, ...(mode.kick || {}) },
  };
  // piso, borde de arriba y paredes (para los jugadores; la pelota rebota en stepBall)
  const o = { bCoef: 0 };
  st.planes.push(plane(0, -1, 0, o), plane(0, 1, -height, o), plane(1, 0, -cw, o), plane(-1, 0, -cw, o));
  // la red y la barrera de arriba: nadie pasa al otro lado (rojo en x ≤ −r, azul en x ≥ r)
  st.planes.push(plane(-1, 0, 0, { cMask: F.red, bCoef: 0.1 }), plane(1, 0, 0, { cMask: F.blue, bCoef: 0.1 }));
  return st;
}
