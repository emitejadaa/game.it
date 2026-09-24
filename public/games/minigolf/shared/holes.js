/**
 * Definición de los hoyos. Coordenadas en "unidades de mundo" (≈ px a escala 1).
 * Compartido por el cliente y el servidor: cualquier cambio acá cambia la física de ambos.
 *
 * outline : polígono del borde exterior (pared).
 * blocks  : polígonos de paredes interiores.
 * zones   : superficies y efectos → sand | ice | water | slope(force) | boost(dir, speed)
 *           con rect:[x,y,w,h] o circle:[x,y,r].
 * bumpers : [x, y, r] rebotadores.
 * movers  : bar (gira sobre pivot) | slider (va y viene entre from/to).
 * portals : pares [ax, ay, bx, by].
 */
const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

export const HOLES = [
  {
    name: { es: 'Calentamiento', en: 'Warm-up' },
    par: 2,
    outline: rect(0, 0, 700, 260),
    tee: [90, 130],
    cup: [610, 130],
    blocks: [],
    zones: [],
    bumpers: [[350, 58, 20]],
    movers: [],
    portals: [],
  },
  {
    name: { es: 'La Ele', en: 'The L' },
    par: 3,
    outline: [
      [0, 0],
      [600, 0],
      [600, 520],
      [380, 520],
      [380, 210],
      [0, 210],
    ],
    tee: [80, 105],
    cup: [490, 430],
    blocks: [rect(250, 0, 30, 70)],
    zones: [{ type: 'sand', circle: [540, 90, 55] }],
    bumpers: [],
    movers: [],
    portals: [],
  },
  {
    name: { es: 'El Molino', en: 'The Windmill' },
    par: 3,
    outline: rect(0, 0, 820, 260),
    tee: [70, 130],
    cup: [750, 130],
    blocks: [rect(395, 0, 30, 40), rect(395, 220, 30, 40)],
    zones: [],
    bumpers: [],
    movers: [
      { kind: 'bar', pivot: [410, 130], len: 190, w: 18, speed: 1.5, phase: 0 },
      { kind: 'bar', pivot: [410, 130], len: 190, w: 18, speed: 1.5, phase: Math.PI / 2 },
    ],
    portals: [],
  },
  {
    name: { es: 'Pinball', en: 'Pinball' },
    par: 3,
    outline: rect(0, 0, 720, 440),
    tee: [60, 220],
    cup: [660, 220],
    blocks: [],
    zones: [],
    bumpers: [
      [240, 120, 28],
      [240, 320, 28],
      [390, 220, 32],
      [530, 110, 26],
      [530, 330, 26],
    ],
    movers: [],
    portals: [],
  },
  {
    name: { es: 'La Laguna', en: 'The Pond' },
    par: 3,
    outline: rect(0, 0, 820, 420),
    tee: [70, 210],
    cup: [745, 210],
    blocks: [],
    zones: [
      { type: 'water', rect: [260, 0, 300, 170] },
      { type: 'water', rect: [260, 250, 300, 170] },
      { type: 'sand', circle: [660, 330, 60] },
    ],
    bumpers: [],
    movers: [{ kind: 'slider', size: [34, 34], from: [410, 190], to: [410, 230], period: 1.6, phase: 0 }],
    portals: [],
  },
  {
    name: { es: 'Hielo y Arena', en: 'Ice & Sand' },
    par: 4,
    outline: rect(0, 0, 820, 380),
    tee: [80, 80],
    cup: [720, 290],
    blocks: [rect(270, 0, 40, 265), rect(510, 115, 40, 265)],
    zones: [
      { type: 'ice', rect: [0, 0, 270, 380] },
      { type: 'sand', rect: [330, 280, 160, 100] },
      { type: 'ice', rect: [550, 0, 270, 115] },
    ],
    bumpers: [[410, 60, 22]],
    movers: [],
    portals: [],
  },
  {
    name: { es: 'Pistones', en: 'Pistons' },
    par: 3,
    outline: rect(0, 0, 820, 300),
    tee: [60, 150],
    cup: [760, 150],
    blocks: [],
    zones: [],
    bumpers: [],
    movers: [
      { kind: 'slider', size: [30, 110], from: [270, 55], to: [270, 245], period: 2.4, phase: 0 },
      { kind: 'slider', size: [30, 110], from: [410, 55], to: [410, 245], period: 1.8, phase: 0.5 },
      { kind: 'slider', size: [30, 110], from: [550, 55], to: [550, 245], period: 2.8, phase: 0.25 },
    ],
    portals: [],
  },
  {
    name: { es: 'Las Rampas', en: 'The Ramps' },
    par: 3,
    outline: rect(0, 0, 720, 520),
    tee: [70, 90],
    cup: [630, 100],
    blocks: [],
    zones: [
      { type: 'slope', rect: [200, 0, 320, 520], force: [0, 300] },
      { type: 'water', rect: [200, 455, 320, 65] },
      { type: 'boost', rect: [95, 230, 70, 60], dir: [1, 0], speed: 620 },
    ],
    bumpers: [[630, 330, 24]],
    movers: [],
    portals: [],
  },
  {
    name: { es: 'Gran Final', en: 'Grand Finale' },
    par: 4,
    outline: rect(0, 0, 920, 520),
    tee: [80, 440],
    cup: [820, 440],
    blocks: [rect(440, 260, 40, 260)],
    zones: [{ type: 'sand', circle: [650, 300, 50] }],
    bumpers: [
      [760, 330, 22],
      [300, 120, 22],
    ],
    movers: [
      { kind: 'bar', pivot: [460, 150], len: 230, w: 18, speed: -1.2, phase: 0.3 },
      { kind: 'slider', size: [40, 40], from: [600, 60], to: [860, 60], period: 3, phase: 0 },
    ],
    portals: [[260, 440, 700, 180]],
  },
];

/** Recorridos disponibles: lista de índices de hoyos. */
export const COURSES = {
  3: [0, 2, 6],
  6: [0, 1, 2, 4, 6, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

export const MAX_STROKES = 10;

export function bounds(h) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of h.outline) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
