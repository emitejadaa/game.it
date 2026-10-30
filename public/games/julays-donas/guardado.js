/**
 * La partida guardada en este dispositivo (localStorage). Se guarda al terminar cada día: si salís
 * en la mitad, el día empieza de nuevo.
 */
import { DECO, DECO_INICIAL, PIELES, PELOS, ROPA, OJOS } from './data.js';
import { completarLook } from './personas.js';

const KEY = 'gameit:julays-donas:partida';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Un personaje al azar para empezar (después se cambia en el vestidor). */
export function lookAlAzar() {
  const genero = pick(['mujer', 'hombre']);
  const m = genero === 'mujer';
  return completarLook({
    genero,
    body: pick(['adulto', 'adulto', 'alto', 'robusto']),
    skin: Math.floor(Math.random() * PIELES.length),
    hair: pick(m ? ['largo', 'ondas', 'melena', 'colita', 'coletas', 'rodete', 'trenzas', 'rulos', 'afro', 'flequillo'] : ['corto', 'raya', 'jopo', 'rulos', 'rapado', 'afro', 'flequillo', 'mohicano', 'largo']),
    hairColor: pick(Object.keys(PELOS).filter((k) => !['blanco', 'canoso'].includes(k))),
    eyes: pick(['punto', 'grande', 'pestanas', 'almendra']),
    eyeColor: pick(Object.keys(OJOS)),
    beard: !m && Math.random() < 0.35 ? pick(['bigote', 'barba', 'candado']) : null,
    glasses: pick([null, null, null, 'redondos', 'cuadrados', 'gato']),
    freckles: Math.random() < 0.3,
    earrings: Math.random() < (m ? 0.5 : 0.15),
    style: pick(['remera', 'remera', 'camisa', 'chomba', 'polera', 'musculosa', 'buzo']),
    shirt: pick(ROPA),
    estampa: pick(['liso', 'liso', 'liso', 'rayas', 'lunares', 'cuadros', 'flores']),
    shirt2: pick([ROPA[6], ROPA[7], ROPA[1]]),
    abajo: pick(m ? ['pantalon', 'jean', 'pollera', 'short'] : ['pantalon', 'jean', 'short']),
    pants: pick(['#3b2a20', '#5a8db8', '#4b6b3a', '#9c6b45', '#2f6690', '#d6c7b0']),
    calzado: pick(['zapatillas', 'botas', 'zapatos']),
    shoes: pick(ROPA),
    delantal: pick(['pechera', 'pechera', 'cintura']),
    apron: pick([ROPA[6], ROPA[0], ROPA[1], ROPA[2], ROPA[3]]),
    apronEstampa: pick(['liso', 'liso', 'rayas', 'cuadros', 'lunares']),
    apron2: pick([ROPA[0], ROPA[6], ROPA[3]]),
    hat: pick([null, null, 'panuelo', 'gorra', 'gorro', 'boina', m ? 'mono' : 'chef']),
    hatColor: pick(ROPA),
    cuello: pick([null, null, null, 'panuelo', 'mono', 'collar']),
    cuelloColor: pick(ROPA),
  });
}

export function partidaNueva(nombre = '', look = lookAlAzar()) {
  return {
    v: 1,
    nombre,
    look,
    dia: 1,
    monedas: 0,
    deco: { ...DECO_INICIAL },
    compradas: DECO.filter((d) => d.precio === 0).map((d) => d.id),
    mejoras: {},
    colores: {},
    dificultad: 'medio',
    conocidos: [],
    logros: [],
    stats: { atendidos: 0, felices90: 0, mejor: 0, puntos: 0 },
    postales: [],
    final: false,
  };
}

export function cargar() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1 && s.look) return { ...partidaNueva(s.nombre, s.look), ...s, look: completarLook(s.look), mejoras: { ...s.mejoras }, colores: { ...s.colores }, deco: { ...DECO_INICIAL, ...s.deco }, stats: { ...partidaNueva().stats, ...s.stats } };
  } catch {}
  return null;
}

export function guardar(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function borrar() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
