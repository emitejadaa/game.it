/**
 * Fuego y Agua — una solución guionada de cada nivel (para el piloto automático): las pruebas comprueban que con
 * estas teclas se gana con todas las gemas, así que cada nivel se puede terminar. La primera sirve de demo.
 */
const up = (id, k = 0.99) => (W) => W.movers.find((m) => m.id === id).k >= k;
const down = (id) => (W) => W.movers.find((m) => m.id === id).k <= 0.01;
// subir la escalera de la izquierda (de la planta del medio a la de arriba), igual en varios templos
const leftStairs = [['go', 7.8], ['jump', 5.6], ['jump', 3.6], ['jump', 1.6], ['jumpAt', 2.6, 7.4]];
// subir la escalera de la derecha (de abajo a la planta del medio) y saltar a la izquierda
const rightStairs = [['go', 27.0], ['jump', 28.7], ['jump', 30.7], ['jump', 32.9], ['go', 33.8], ['jumpAt', 32.5, 27.6]];

export const SOLUTIONS = {
  entrada: {
    F: [['jumpAt', 8.0, 13.2], ...rightStairs, ['jumpAt', 17.9, 13.0], ...leftStairs, ['go', 28.0]],
    W: [['jumpAt', 15.0, 20.2], ...rightStairs, ['jumpAt', 17.9, 13.0], ...leftStairs, ['go', 32.0]],
  },
  rampas: {
    F: [['jumpAt', 6.8, 11.8], ['go', 33.6], ['jumpAt', 32.4, 27.6], ['jumpAt', 26.6, 21.8], ['jumpAt', 20.6, 15.8], ['go', 1.5], ['jumpAt', 1.6, 6.5], ['jumpAt', 17.8, 22.8], ['go', 28.0]],
    W: [['jumpAt', 13.8, 18.8], ['go', 33.6], ['jumpAt', 32.4, 27.6], ['jumpAt', 20.6, 15.8], ['jumpAt', 13.6, 8.8], ['go', 1.5], ['jumpAt', 1.6, 6.5], ['jumpAt', 11.8, 16.8], ['go', 32.0]],
  },
  ascensor: {
    F: [['jumpAt', 11.6, 17.0], ['go', 24.5], ['await', 'wOn'], ['go', 26.5], ['signal', 'b1'], ['await', 'b2'], ['go', 28.9], ['signal', 'fReady'], ['until', down('e')], ['go', 31.5], ['signal', 'fOn'], ['until', up('e')], ['go', 26.5], ['jumpAt', 21.6, 16.8], ...leftStairs, ['go', 28.0]],
    W: [['jumpAt', 11.6, 17.0], ['go', 28.6], ['until', down('e')], ['go', 31.5], ['signal', 'wOn'], ['await', 'b1'], ['until', up('e')], ['go', 25.5], ['signal', 'b2'], ['await', 'fReady'], ['go', 23.6], ['until', down('e')], ['await', 'fOn'], ['go', 25.5], ['until', up('e')], ['wait', 0.4], ['jumpAt', 14.6, 9.8], ...leftStairs, ['go', 32.0]],
  },
  palanca: {
    F: [['jumpAt', 14.8, 19.8], ...rightStairs, ['jumpAt', 21.6, 16.8], ...leftStairs, ['go', 16.5], ['signal', 'f1'], ['await', 'w2'], ['go', 29.0]],
    W: [['jumpAt', 7.8, 12.8], ...rightStairs, ['jumpAt', 21.6, 16.8], ...leftStairs, ['await', 'f1'], ['until', up('g2')], ['go', 25.5], ['signal', 'w2'], ['until', (W) => W.chars.F.x > 23.6], ['go', 32.0]],
  },
  caja: {
    F: [['jumpAt', 9.8, 14.8], ['go', 28.6], ['jump', 29.5], ['jump', 31.2], ['jump', 33.0], ['go', 33.6], ['jumpAt', 32.4, 27.6], ['go', 21.36], ['until', up('g')], ['jump', 19.0], ['jumpAt', 11.2, 6.8], ...leftStairs.slice(0, 4), ['jumpAt', 2.6, 7.4], ['jumpAt', 13.8, 19.0], ['go', 28.0]],
    W: [['wait', 0.3], ['jumpAt', 14.8, 19.6], ['until', (W) => W.boxes[0].x > 29.4], ['go', 28.4], ['jump', 29.5], ['jump', 31.2], ['jump', 33.0], ['go', 33.6], ['jumpAt', 32.4, 27.6], ['until', up('g')], ['go', 22.4], ['jump', 19.0], ['jumpAt', 11.2, 6.8], ...leftStairs.slice(0, 4), ['jumpAt', 2.6, 7.4], ['jumpAt', 13.8, 19.0], ['go', 32.0]],
  },
  cruzados: {
    F: [['jumpAt', 7.6, 5.0], ['go', 1.4], ['go', 11.0], ['jump', 12.7], ['jump', 14.9], ['jump', 16.5], ['go', 16.6], ['jumpAt', 16.4, 12.0], ['until', up('gF')], ['jumpAt', 8.6, 3.8], ['go', 3.0]],
    W: [['jumpAt', 27.4, 30.0], ['go', 34.5], ['jump', 31.0], ['go', 24.4], ['jump', 23.2], ['jump', 21.0], ['jump', 19.5], ['go', 19.4], ['jumpAt', 19.6, 23.6], ['until', up('gW')], ['jumpAt', 27.4, 32.2], ['go', 33.0]],
  },
  vaiven: {
    F: [['jumpAt', 11.4, 15.6], ...rightStairs, ['go', 24.2], ['until', (W) => W.movers[0].k > 0.05], ['jump', 21.4], ['until', (W) => W.movers[0].x < 13.2], ['jump', 12.0], ['until', (W) => W.movers[0].k >= 0.99], ['go', 8.6], ['jumpAt', 8.2, 5.0], ['signal', 'fOff'], ...leftStairs, ['jumpAt', 21.6, 26.6], ['go', 29.0]],
    W: [['wait', 0.5], ['jumpAt', 11.4, 15.6], ...rightStairs, ['await', 'fOff'], ['go', 24.4], ['go', 26.6], ['until', down('p')], ['go', 24.2], ['until', (W) => W.movers[0].k > 0.05], ['jump', 21.4], ['until', (W) => W.movers[0].x < 10.6], ['jump', 11.6], ['until', (W) => W.movers[0].k >= 0.99], ['go', 8.6], ['jumpAt', 8.2, 5.0], ...leftStairs, ['jumpAt', 15.6, 20.6], ['go', 32.0]],
  },
  ascensores: {
    F: [['jumpAt', 12.6, 15.8], ['jumpAt', 18.8, 23.8], ['go', 24.2], ['await', 'wOn'], ['go', 25.5], ['signal', 'b1'], ['await', 'wB2'], ['go', 24.2], ['jumpAt', 23.4, 18.6], ['go', 4.5], ['signal', 'fOn'], ['until', up('e2')], ['jumpAt', 6.3, 10.8], ['jump', 12.0], ['jump', 14.0], ['jump', 15.8], ['go', 15.6], ['jumpAt', 15.5, 11.6], ['jumpAt', 9.6, 4.8], ['go', 3.0]],
    W: [['jumpAt', 12.0, 16.6], ['jumpAt', 19.8, 22.4], ['go', 28.6], ['until', down('e1')], ['go', 31.5], ['signal', 'wOn'], ['until', up('e1')], ['go', 27.3], ['signal', 'wB2'], ['await', 'fOn'], ['go', 28.5], ['until', up('e2')], ['wait', 0.5], ['jumpAt', 27.2, 23.8], ['jump', 21.8], ['jump', 19.8], ['jump', 18.2], ['go', 18.4], ['jumpAt', 18.5, 22.4], ['jumpAt', 24.6, 29.6], ['go', 33.0]],
  },
  compuertas: {
    F: [['jumpAt', 5.6, 11.0], ...rightStairs, ['jumpAt', 21.4, 17.8], ['jumpAt', 13.6, 8.8], ...leftStairs, ['go', 8.5], ['signal', 'f1'], ['await', 'w2'], ['until', up('c2')], ['go', 21.5], ['signal', 'f3'], ['await', 'w4'], ['until', up('c3')], ['go', 32.0]],
    W: [['wait', 0.2], ['jumpAt', 5.6, 11.0], ...rightStairs, ['jumpAt', 21.6, 16.8], ['jumpAt', 12.8, 10.6], ...leftStairs, ['await', 'f1'], ['until', up('c1')], ['go', 14.5], ['signal', 'w2'], ['await', 'f3'], ['until', up('c3')], ['go', 28.5], ['signal', 'w4'], ['until', (W) => W.chars.F.x > 26.2], ['go', 34.0]],
  },
  cima: {
    F: [['jumpAt', 4.4, 8.4], ['go', 15.5], ['signal', 'fA'], ['await', 'wB'], ['until', up('pc')], ['go', 28.6], ['jump', 29.5], ['jump', 31.2], ['jump', 32.6], ['signal', 'fUp'], ['await', 'wGo'], ['go', 33.6], ['jumpAt', 32.4, 27.6], ['go', 23.4], ['until', (W) => W.movers[1].k > 0.02], ['jump', (W) => W.movers[1].x + 1.6], ['until', (W) => W.movers[1].x < 12.2], ['jump', 13.0], ['until', (W) => W.movers[1].k >= 0.99], ['go', 5.6], ['signal', 'fOff'], ['jump', 3.6], ['jump', 1.6], ['jumpAt', 2.6, 7.4], ['jumpAt', 17.6, 21.6], ['go', 21.5], ['signal', 'k1'], ['await', 'k2w'], ['until', up('k2')], ['go', 30.5], ['signal', 'k3'], ['until', (W) => W.chars.W.x > 29.2], ['go', 32.0]],
    W: [['jumpAt', 8.0, 12.6], ['await', 'fA'], ['until', up('pc')], ['go', 19.6], ['go', 28.6], ['jump', 29.5], ['jump', 31.2], ['jump', 33.4], ['go', 33.5], ['signal', 'wB'], ['await', 'fUp'], ['go', 32.9], ['signal', 'wGo'], ['wait', 0.25], ['go', 33.6], ['jumpAt', 32.4, 27.6], ['await', 'fOff'], ['go', 23.6], ['go', 25.8], ['until', down('fe')], ['go', 23.4], ['until', (W) => W.movers[1].k > 0.02], ['jump', (W) => W.movers[1].x + 1.6], ['until', (W) => W.movers[1].x < 8.2], ['jump', 9.6], ['until', (W) => W.movers[1].k >= 0.99], ['go', 5.6], ['jump', 3.6], ['jump', 1.6], ['jumpAt', 2.6, 7.4], ['jumpAt', 12.6, 16.6], ['await', 'k1'], ['until', up('k1')], ['go', 25.5], ['signal', 'k2w'], ['await', 'k3'], ['until', up('k2')], ['go', 34.0]],
  },
};
