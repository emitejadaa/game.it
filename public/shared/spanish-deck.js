/**
 * La baraja española de 40 cartas dibujada en SVG (la usan Truco, Escoba y los demás juegos de naipes), copiando el
 * naipe clásico que se juega en Argentina: colores planos y vivos con contorno negro, números negros en las esquinas,
 * oros con su flor, copas rojas, amarillas y verdes, espadas celestes con puño rojo, bastos verdes y rojos con nudos,
 * las pintas (los cortes del marco que dicen el palo: ninguno los oros, uno las copas, dos las espadas, tres los
 * bastos), los anchos grandes y la sota, el caballo y el rey de cuerpo entero.
 * Una carta es un texto con el número y el palo ('1e' ancho de espadas, '7o', '12c', '4b'; e espadas · b bastos ·
 * o oros · c copas). Cada carta es una imagen (data URI) que se arma una sola vez.
 */
const num = (c) => parseInt(c, 10);
const suit = (c) => c[c.length - 1];
const f = (v) => +(+v).toFixed(2);

const W = 200, H = 300;
/** Colores del naipe. */
const C = {
  line: '#151210',
  yellow: '#f8e03a', yellow2: '#e3b521',
  red: '#e2332a', red2: '#a81d16',
  green: '#63ba45', green2: '#2c8a3a',
  sky: '#36aee4', sky2: '#1b72b4', sky3: '#b9e4f8',
  blue: '#2f5fb8', blue2: '#1d3f86',
  skin: '#fcdcbc', skin2: '#e7ad8a', cheek: '#f39a86',
  white: '#ffffff', paper: '#fffefb',
  brown: '#9a5a26', hair: '#5a3418', beard: '#8a5a32',
  horse: '#f2c13e', horse2: '#c98a22', mane: '#a2551f',
  ribbon: '#bfe6f6',
};

const S = (w = 1.8) => `stroke="${C.line}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const g = (x, y, r, k, body) => `<g transform="translate(${f(x)},${f(y)})${r ? ` rotate(${f(r)})` : ''}${k !== 1 ? ` scale(${f(k)})` : ''}">${body}</g>`;
const ring = (n, r, fn) => Array.from({ length: n }, (_, i) => fn(Math.cos((i / n) * Math.PI * 2 - Math.PI / 2) * r, Math.sin((i / n) * Math.PI * 2 - Math.PI / 2) * r, i)).join('');

// ---------------------------------------------------------------- los palos (centrados en 0,0)
/** Una flor de pétalos redondos (la de los oros). */
function flower(r, petals, fill, mid, k = 0.42) {
  const pr = r * k;
  return `${ring(petals, r - pr, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(pr)}" fill="${fill}" ${S(1.2)}/>`)}<circle r="${f(r * 0.42)}" fill="${mid}" ${S(1.2)}/>`;
}
/** Oro (radio 30): moneda amarilla con un anillo y la flor en el centro con su punto. */
function oro() {
  return `<circle r="30" fill="${C.yellow}" ${S(2)}/>
  <circle r="25" fill="none" ${S(1.2)}/>
  ${ring(16, 27.5, (x, y) => `<path d="M${f(x * 0.93)},${f(y * 0.93)} L${f(x * 1.04)},${f(y * 1.04)}" ${S(1)}/>`)}
  ${flower(19, 8, C.yellow, C.yellow, 0.4)}
  <circle r="2.6" fill="${C.line}"/>`;
}
/** Copa (alto 64): boca roja, cuerpo amarillo, nudo verde y pie amarillo con borde verde. */
function copa() {
  return `<path d="M-24,-26 C-25,-6 -14,6 -5,8 H5 C14,6 25,-6 24,-26 Z" fill="${C.yellow}" ${S(2)}/>
  <path d="M-23.6,-20 C-23,-14 -21.5,-10 -19,-7 H19 C21.5,-10 23,-14 23.6,-20 Z" fill="${C.red}" ${S(1.3)}/>
  <path d="M-12,-7 Q0,4 12,-7" fill="none" ${S(1.2)}/>
  <ellipse cy="-26" rx="24" ry="6" fill="${C.red}" ${S(2)}/>
  <ellipse cy="-25" rx="17" ry="3" fill="${C.red2}"/>
  <path d="M-5,8 H5 L4,13 H-4 Z" fill="${C.yellow}" ${S(1.5)}/>
  <ellipse cy="15.5" rx="8.5" ry="4" fill="${C.green}" ${S(1.5)}/>
  <path d="M-4,19 H4 L5,23 H-5 Z" fill="${C.yellow}" ${S(1.5)}/>
  <path d="M-5,23 C-8,27 -18,28 -20,32 H20 C18,28 8,27 5,23 Z" fill="${C.yellow}" ${S(1.8)}/>
  <path d="M-20,32 H20 V34.5 H-20 Z" fill="${C.green}" ${S(1.5)}/>`;
}
/** Espada de largo L con la punta arriba (el pomo en y = L/2): hoja celeste, gavilán amarillo y puño rojo. */
function espada(L = 200, w = 1) {
  const t = -L / 2;
  const gy = L / 2 - 30 * w; // gavilán
  const bw = 4.6 * w;
  return `<path d="M0,${f(t)} L${f(bw)},${f(t + 10 * w)} V${f(gy)} H${f(-bw)} V${f(t + 10 * w)} Z" fill="${C.sky}" ${S(1.6)}/>
  <path d="M${f(-bw * 0.3)},${f(t + 12 * w)} V${f(gy - 3)}" stroke="${C.sky3}" stroke-width="${f(1.6 * w)}" stroke-linecap="round"/>
  <path d="M${f(-15 * w)},${f(gy - 3 * w)} Q${f(-17 * w)},${f(gy + 4 * w)} ${f(-10 * w)},${f(gy + 4 * w)} H${f(10 * w)} Q${f(17 * w)},${f(gy + 4 * w)} ${f(15 * w)},${f(gy - 3 * w)} Q${f(8 * w)},${f(gy + 1 * w)} 0,${f(gy + 1 * w)} Q${f(-8 * w)},${f(gy + 1 * w)} ${f(-15 * w)},${f(gy - 3 * w)} Z" fill="${C.yellow}" ${S(1.4)}/>
  <path d="M${f(-4 * w)},${f(gy + 4 * w)} H${f(4 * w)} L${f(3.4 * w)},${f(gy + 20 * w)} H${f(-3.4 * w)} Z" fill="${C.red}" ${S(1.4)}/>
  <path d="M${f(-3.6 * w)},${f(gy + 9 * w)} H${f(3.6 * w)} M${f(-3.4 * w)},${f(gy + 14 * w)} H${f(3.4 * w)}" ${S(1)}/>
  <circle cy="${f(gy + 24.5 * w)}" r="${f(4.8 * w)}" fill="${C.yellow}" ${S(1.4)}/>`;
}
/** Basto de largo L, grueso arriba y fino en el mango, con nudos; `red`: el rojo con nudos verdes (se alternan). */
function basto(L = 200, w = 1, red = false) {
  const t = -L / 2, b = L / 2;
  const hw = 11 * w, lw = 5 * w;
  const body = red ? C.red : C.green, knot = red ? C.green : C.red, dark = red ? C.red2 : C.green2;
  const at = (k) => hw - (hw - lw) * k; // medio ancho a una fracción del largo (desde arriba)
  // el contorno con bultos: los nudos sobresalen de un lado y del otro
  const ks = [0.18, 0.38, 0.58, 0.78];
  const side = (sg) =>
    ks
      .map((k, i) => {
        const y = t + L * k;
        const a = at(k);
        const out = sg === (i % 2 ? 1 : -1) ? 5 * w : 2 * w;
        return `L${f(sg * a)},${f(y - L * 0.05)} Q${f(sg * (a + out))},${f(y - L * 0.02)} ${f(sg * (a + out * 0.5))},${f(y + L * 0.03)} L${f(sg * at(k + 0.06))},${f(y + L * 0.07)}`;
      })
      .join(' ');
  const rightDown = side(1);
  const leftUp = ks
    .map((k, i) => ({ k, i }))
    .reverse()
    .map(({ k, i }) => {
      const y = t + L * k;
      const a = at(k);
      const out = -1 === (i % 2 ? 1 : -1) ? 5 * w : 2 * w;
      return `L${f(-at(k + 0.06))},${f(y + L * 0.07)} L${f(-(a + out * 0.5))},${f(y + L * 0.03)} Q${f(-(a + out))},${f(y - L * 0.02)} ${f(-a)},${f(y - L * 0.05)}`;
    })
    .join(' ');
  const outline = `M0,${f(t)} C${f(hw * 0.7)},${f(t)} ${f(hw)},${f(t + 6 * w)} ${f(hw)},${f(t + L * 0.1)} ${rightDown} L${f(lw)},${f(b)} L${f(-lw)},${f(b)} ${leftUp} L${f(-hw)},${f(t + L * 0.1)} C${f(-hw)},${f(t + 6 * w)} ${f(-hw * 0.7)},${f(t)} 0,${f(t)} Z`;
  const knots = ks
    .map((k, i) => {
      const sg = i % 2 ? 1 : -1;
      return `<ellipse cx="${f(sg * (at(k) + 1.2 * w))}" cy="${f(t + L * k)}" rx="${f(2.6 * w)}" ry="${f(3.4 * w)}" fill="${knot}" ${S(1.1)}/>`;
    })
    .join('');
  return `<path d="${outline}" fill="${body}" ${S(1.8)}/>
  <path d="M${f(-hw * 0.45)},${f(t + L * 0.1)} C${f(-hw * 0.5)},${f(t + L * 0.45)} ${f(-lw * 0.5)},${f(b - L * 0.25)} ${f(-lw * 0.4)},${f(b - 6)}" stroke="${C.yellow}" stroke-width="${f(1.8 * w)}" fill="none" stroke-linecap="round" opacity=".7"/>
  <path d="M${f(hw * 0.3)},${f(t + L * 0.26)} q${f(-2 * w)},5 0,10 M${f(hw * 0.1)},${f(t + L * 0.66)} q${f(-2 * w)},4 0,8" stroke="${dark}" stroke-width="${f(1.4 * w)}" fill="none" stroke-linecap="round"/>
  ${knots}
  <ellipse cy="${f(b)}" rx="${f(lw)}" ry="${f(2 * w)}" fill="${C.yellow}" ${S(1.2)}/>`;
}

/** Una espada o un basto largo con centro (x,y), girado r grados (0: punta o cabeza arriba). */
const long = (s, x, y, r, L, w = 1, red = false) => g(x, y, r, 1, s === 'e' ? espada(L, w) : basto(L, w, red));
/** Un oro o una copa, del tamaño k. */
const pip = (s, x, y, k = 1) => g(x, y, 0, k, s === 'o' ? oro() : copa());

// ---------------------------------------------------------------- disposición de los números
/** Oros y copas (el 3 en zigzag; el 4 con la cinta y la flor en el medio). [x, y, tamaño] */
const LAY = {
  2: [[100, 86, 1.5], [100, 214, 1.5]],
  3: [[88, 72, 1.18], [114, 150, 1.18], [86, 228, 1.18]],
  4: [[62, 70, 1.02], [138, 70, 1.02], [62, 230, 1.02], [138, 230, 1.02]],
  5: [[62, 66, 0.95], [138, 66, 0.95], [100, 150, 1.3], [62, 234, 0.95], [138, 234, 0.95]],
  6: [[64, 70, 0.92], [136, 70, 0.92], [64, 150, 0.92], [136, 150, 0.92], [64, 230, 0.92], [136, 230, 0.92]],
  7: [[64, 64, 0.86], [136, 64, 0.86], [100, 108, 0.86], [64, 152, 0.86], [136, 152, 0.86], [64, 236, 0.86], [136, 236, 0.86]],
};
/** La cinta celeste del 4 con su flor (sin letras). */
function ribbon() {
  return `<path d="M30,150 C44,138 60,160 76,148 L124,148 C140,160 156,138 170,150 L162,156 L170,162 C156,150 140,172 124,160 L76,160 C60,172 44,150 30,162 L38,156 Z" fill="${C.ribbon}" ${S(1.4)}/>
  <path d="M84,152 q-10,-12 -20,-6 M116,152 q10,-12 20,-6" stroke="${C.green2}" stroke-width="2" fill="none"/>
  <ellipse cx="68" cy="146" rx="6" ry="3" fill="${C.green}" ${S(1)} transform="rotate(-20 68 146)"/><ellipse cx="132" cy="146" rx="6" ry="3" fill="${C.green}" ${S(1)} transform="rotate(20 132 146)"/>
  <g transform="translate(100,150)">${ring(6, 9, (x, y, i) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="6" ry="4.2" fill="${i % 2 ? C.red : C.yellow}" ${S(1.1)} transform="rotate(${i * 60 + 90} ${f(x)} ${f(y)})"/>`)}<circle r="5" fill="${C.green}" ${S(1.2)}/></g>`;
}
/** Espadas y bastos: [x, y, ángulo, largo] (ángulo 0: punta arriba y puño abajo; 180: al revés). */
const LONG = {
  2: [[80, 146, 180, 236], [120, 154, 0, 236]],
  3: [[62, 150, 180, 232], [100, 150, 0, 248], [138, 150, 180, 232]],
  // el 4: cuatro en X, con el puño en las esquinas y la punta hacia el centro
  4: [[67, 92, 150, 104], [133, 92, 210, 104], [67, 208, 30, 104], [133, 208, -30, 104]],
  // el 5: una H (dos arriba, dos abajo y una acostada en el medio)
  5: [[56, 84, 180, 112], [144, 84, 180, 112], [56, 216, 0, 112], [144, 216, 0, 112], [100, 150, -90, 128]],
  6: [[56, 86, 180, 112], [100, 86, 180, 112], [144, 86, 180, 112], [56, 214, 0, 112], [100, 214, 0, 112], [144, 214, 0, 112]],
  7: [[56, 82, 180, 104], [100, 82, 180, 104], [144, 82, 180, 104], [56, 218, 0, 104], [100, 218, 0, 104], [144, 218, 0, 104], [100, 150, -90, 126]],
};
function pips(n, s) {
  if (s === 'e' || s === 'b') {
    const wd = s === 'b' ? (n <= 3 ? 1.55 : 1.3) : n <= 3 ? 1.15 : 0.95;
    const items = LONG[n].map(([x, y, r, L], i) => long(s, x, y, r, L, wd, s === 'b' && i % 2 === 1)).join('');
    const mid = n === 4 ? `<g transform="translate(100,150)">${ring(5, 6, (x, y, i) => `<circle cx="${f(x)}" cy="${f(y)}" r="4.4" fill="${i % 2 ? C.red : C.yellow}" ${S(1)}/>`)}<circle r="3.6" fill="${C.green}" ${S(1)}/></g>` : '';
    return items + mid;
  }
  return (n === 4 ? ribbon() : '') + LAY[n].map(([x, y, k]) => pip(s, x, y, k)).join('');
}

// ---------------------------------------------------------------- los anchos
function ace(s) {
  if (s === 'o') {
    // el ancho de oros: la moneda grande con una cara, la corona arriba, dos banderas y la base
    const flag = (sd) => `<path d="M${100 + sd * 44},214 L${100 + sd * 54},74" ${S(2.2)}/><circle cx="${100 + sd * 54}" cy="72" r="3.4" fill="${C.yellow}" ${S(1.2)}/>
      <path d="M${100 + sd * 53},78 C${100 + sd * 62},74 ${100 + sd * 68},84 ${100 + sd * 78},80 L${100 + sd * 76},108 C${100 + sd * 68},112 ${100 + sd * 62},102 ${100 + sd * 52},106 Z" fill="${sd < 0 ? C.red : C.sky}" ${S(1.5)}/>
      <path d="M${100 + sd * 53},92 C${100 + sd * 62},88 ${100 + sd * 68},97 ${100 + sd * 77},93" stroke="${C.yellow}" stroke-width="3.4" fill="none"/>`;
    return `${flag(-1)}${flag(1)}
      <path d="M52,220 H148 L156,240 H44 Z" fill="${C.red}" ${S(1.9)}/><path d="M58,220 H142 L145,228 H55 Z" fill="${C.yellow}" ${S(1.3)}/>
      <path d="M44,240 H156 V250 H44 Z" fill="${C.green}" ${S(1.7)}/>
      <path d="M62,208 C62,222 138,222 138,208" fill="${C.green}" ${S(1.5)}/>
      ${g(100, 158, 0, 1.75, `<circle r="30" fill="${C.yellow}" ${S(1.6)}/>${ring(28, 27.3, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.2" fill="${C.red}"/>`)}<circle r="24.5" fill="${C.yellow}" ${S(1.2)}/>`)}
      <ellipse cx="100" cy="160" rx="24" ry="28" fill="${C.skin}" ${S(1.7)}/>
      <path d="M77,156 Q76,132 100,130 Q124,132 123,156 Q117,141 100,141 Q83,141 77,156 Z" fill="${C.hair}" ${S(1.3)}/>
      <path d="M88,155 q3.4,-3.4 7,0 M105,155 q3.4,-3.4 7,0" ${S(1.5)} fill="none"/>
      <circle cx="91.5" cy="159" r="2.1" fill="${C.line}"/><circle cx="108.5" cy="159" r="2.1" fill="${C.line}"/>
      <path d="M100,160 l-2.6,7 h4.4" ${S(1.4)} fill="none"/>
      <path d="M90,172 Q100,168 110,172 Q105,177 100,175.5 Q95,177 90,172 Z" fill="${C.hair}" ${S(1.1)}/>
      <path d="M94,179 Q100,182 106,179" ${S(1.4)} fill="none"/>
      <path d="M76,120 L78,96 L88,108 L100,90 L112,108 L122,96 L124,120 Z" fill="${C.yellow}" ${S(1.7)}/>
      <path d="M76,118 H124 V126 H76 Z" fill="${C.red}" ${S(1.5)}/>
      <circle cx="100" cy="108" r="3.6" fill="${C.red}" ${S(1)}/><circle cx="78" cy="94" r="2.8" fill="${C.sky}" ${S(1)}/><circle cx="100" cy="88" r="3" fill="${C.sky}" ${S(1)}/><circle cx="122" cy="94" r="2.8" fill="${C.sky}" ${S(1)}/>
      <path d="M95,78 h10 M100,72 v12" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/><path d="M95,78 h10 M100,72 v12" stroke="${C.yellow}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  if (s === 'c')
    // el ancho de copas: la copa grande con tapa roja y su remate
    return `<g transform="translate(100,156) scale(1.04)">
      <path d="M-30,-40 C-31,-8 -20,14 -8,20 H8 C20,14 31,-8 30,-40 Z" fill="${C.yellow}" ${S(2.2)}/>
      <path d="M-29.4,-30 C-29,-20 -27,-12 -23,-6 H23 C27,-12 29,-20 29.4,-30 Z" fill="${C.red}" ${S(1.6)}/>
      ${[-18, -6, 6, 18].map((x) => `<path d="M${x - 5},-6 a5,5 0 0 0 10,0" fill="${C.green}" ${S(1.2)}/>`).join('')}
      ${[-16, 0, 16].map((x) => `<ellipse cx="${x}" cy="-18" rx="3.6" ry="4.4" fill="${C.yellow}" ${S(1.1)}/>`).join('')}
      <path d="M-36,-40 H36 L32,-48 H-32 Z" fill="${C.green}" ${S(1.8)}/>
      <path d="M-32,-48 C-30,-80 30,-80 32,-48 Z" fill="${C.red}" ${S(2)}/>
      <path d="M-24,-56 Q0,-66 24,-56" stroke="${C.yellow}" stroke-width="3" fill="none"/>
      ${[-16, 0, 16].map((x) => `<circle cx="${x}" cy="${x ? -62 : -66}" r="2.8" fill="${C.yellow}" ${S(0.9)}/>`).join('')}
      <path d="M-7,-74 Q-6,-86 0,-88 Q6,-86 7,-74 Z" fill="${C.yellow}" ${S(1.6)}/>
      <path d="M0,-88 L-8,-100 L0,-114 L8,-100 Z" fill="${C.green}" ${S(1.6)}/><circle cy="-118" r="4.6" fill="${C.red}" ${S(1.4)}/>
      <path d="M-8,20 H8 L7,30 H-7 Z" fill="${C.yellow}" ${S(1.8)}/>
      <ellipse cy="34" rx="15" ry="6.5" fill="${C.green}" ${S(1.8)}/>
      <path d="M-7,40 H7 L9,52 H-9 Z" fill="${C.yellow}" ${S(1.8)}/>
      <ellipse cy="55" rx="12" ry="4.5" fill="${C.red}" ${S(1.6)}/>
      <path d="M-10,58 C-16,68 -36,72 -42,84 H42 C36,72 16,68 10,58 Z" fill="${C.yellow}" ${S(2)}/>
      <path d="M-28,76 Q0,68 28,76" stroke="${C.red}" stroke-width="3" fill="none"/>
      <path d="M-46,84 H46 L40,96 H-40 Z" fill="${C.green}" ${S(2)}/></g>`;
  if (s === 'e')
    // el ancho de espadas: la espada grande en diagonal, con su guarda curva y la cinta
    return `<g transform="translate(104,156) rotate(156) scale(.9)">
      <path d="M0,-124 L11,-104 V64 H-11 V-104 Z" fill="${C.sky}" ${S(2.2)}/>
      <path d="M-3,-100 V60" stroke="${C.sky3}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M2,-96 V60" stroke="${C.sky2}" stroke-width="1.4"/>
      <path d="M-34,58 Q-40,74 -24,74 H24 Q40,74 34,58 Q16,68 0,68 Q-16,68 -34,58 Z" fill="${C.yellow}" ${S(2)}/>
      <circle cx="-34" cy="58" r="5.5" fill="${C.red}" ${S(1.5)}/><circle cx="34" cy="58" r="5.5" fill="${C.red}" ${S(1.5)}/>
      <path d="M-8,74 H8 L7,108 H-7 Z" fill="${C.red}" ${S(1.8)}/>
      <path d="M-7.6,82 H7.6 M-7.3,90 H7.3 M-7,98 H7" ${S(1.2)}/>
      <path d="M24,74 C40,84 30,108 10,112" stroke="${C.line}" stroke-width="6.6" fill="none" stroke-linecap="round"/><path d="M24,74 C40,84 30,108 10,112" stroke="${C.yellow}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
      <circle cy="116" r="10" fill="${C.yellow}" ${S(1.8)}/><circle cy="116" r="3.6" fill="${C.red}"/>
      <path d="M-8,100 C-26,104 -30,124 -18,134 M-18,134 l-4,10 M-18,134 l6,8" stroke="${C.line}" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      <path d="M-8,100 C-26,104 -30,124 -18,134 M-18,134 l-4,10 M-18,134 l6,8" stroke="${C.red}" stroke-width="2.8" fill="none" stroke-linecap="round"/></g>`;
  // el ancho de bastos: el garrote grande en diagonal, con ramitas de hojas rojas
  const twig = (x, y, r, k = 1) =>
    g(x, y, r, k, `<path d="M0,0 C6,-10 14,-14 22,-14" stroke="${C.green2}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="24" cy="-15" rx="6" ry="3.4" fill="${C.red}" ${S(1)} transform="rotate(-20 24 -15)"/>
      <ellipse cx="12" cy="-17" rx="5" ry="2.8" fill="${C.red}" ${S(1)} transform="rotate(-60 12 -17)"/>
      <ellipse cx="14" cy="-6" rx="5" ry="2.8" fill="${C.green}" ${S(1)} transform="rotate(10 14 -6)"/>`);
  return `<g transform="translate(100,150) rotate(34)">
    ${twig(-14, -62, -80, 1.25)}${twig(16, -34, 14, 1.25)}${twig(-12, 6, -150, 1.15)}${twig(12, 44, 34, 1.1)}${twig(-8, 76, -170, 1)}
    ${basto(222, 2.9)}</g>`;
}

// ---------------------------------------------------------------- sota, caballo y rey
function face(x, y, r, { beard = null, hair = C.hair, mustache = false } = {}) {
  const e = r * 0.34;
  return `<path d="M${f(x - r * 0.95)},${f(y - r * 0.2)} Q${f(x - r * 1.08)},${f(y + r * 0.8)} ${f(x - r * 0.6)},${f(y + r * 0.9)} L${f(x - r * 0.55)},${f(y - r * 0.2)} Z M${f(x + r * 0.95)},${f(y - r * 0.2)} Q${f(x + r * 1.08)},${f(y + r * 0.8)} ${f(x + r * 0.6)},${f(y + r * 0.9)} L${f(x + r * 0.55)},${f(y - r * 0.2)} Z" fill="${hair}" ${S(1.3)}/>
  <ellipse cx="${x}" cy="${y}" rx="${f(r * 0.84)}" ry="${r}" fill="${C.skin}" ${S(1.6)}/>
  <path d="M${f(x - e - r * 0.18)},${f(y - r * 0.32)} q${f(r * 0.18)},${f(-r * 0.12)} ${f(r * 0.36)},0 M${f(x + e - r * 0.18)},${f(y - r * 0.32)} q${f(r * 0.18)},${f(-r * 0.12)} ${f(r * 0.36)},0" ${S(1.2)} fill="none"/>
  <circle cx="${f(x - e)}" cy="${f(y - r * 0.08)}" r="${f(r * 0.1)}" fill="${C.line}"/><circle cx="${f(x + e)}" cy="${f(y - r * 0.08)}" r="${f(r * 0.1)}" fill="${C.line}"/>
  <path d="M${x},${f(y)} l${f(-r * 0.12)},${f(r * 0.32)} h${f(r * 0.18)}" stroke="${C.skin2}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <circle cx="${f(x - r * 0.5)}" cy="${f(y + r * 0.3)}" r="${f(r * 0.14)}" fill="${C.cheek}" opacity=".55"/><circle cx="${f(x + r * 0.5)}" cy="${f(y + r * 0.3)}" r="${f(r * 0.14)}" fill="${C.cheek}" opacity=".55"/>
  ${
    beard
      ? `<path d="M${f(x - r * 0.82)},${f(y + r * 0.15)} Q${f(x - r * 0.8)},${f(y + r * 1.5)} ${x},${f(y + r * 1.8)} Q${f(x + r * 0.8)},${f(y + r * 1.5)} ${f(x + r * 0.82)},${f(y + r * 0.15)} Q${f(x + r * 0.4)},${f(y + r * 0.48)} ${x},${f(y + r * 0.4)} Q${f(x - r * 0.4)},${f(y + r * 0.48)} ${f(x - r * 0.82)},${f(y + r * 0.15)} Z" fill="${beard}" ${S(1.4)}/>
      <path d="M${f(x - r * 0.28)},${f(y + r * 0.95)} q${f(r * 0.05)},${f(r * 0.4)} 0,${f(r * 0.55)} M${f(x + r * 0.28)},${f(y + r * 0.95)} q${f(-r * 0.05)},${f(r * 0.4)} 0,${f(r * 0.55)} M${x},${f(y + r * 1.0)} v${f(r * 0.6)}" stroke="${C.line}" stroke-width="1" opacity=".55" fill="none"/>`
      : ''
  }
  ${beard || mustache ? `<path d="M${f(x - r * 0.44)},${f(y + r * 0.52)} Q${x},${f(y + r * 0.28)} ${f(x + r * 0.44)},${f(y + r * 0.52)} Q${x},${f(y + r * 0.42)} ${f(x - r * 0.44)},${f(y + r * 0.52)} Z" fill="${beard || hair}" ${S(1.2)}/>` : ''}
  <path d="M${f(x - r * 0.2)},${f(y + r * 0.64)} Q${x},${f(y + r * 0.76)} ${f(x + r * 0.2)},${f(y + r * 0.64)}" ${S(1.3)} fill="none"/>`;
}
const hand = (x, y, r = 6) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${C.skin}" ${S(1.4)}/>`;
/** Una manga de (x1,y1) a (x2,y2) con su puño. */
const sleeve = (x1, y1, x2, y2, col, cuff, w = 13) =>
  `<path d="M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}" stroke="${C.line}" stroke-width="${w + 3.4}" stroke-linecap="round"/><path d="M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>
  <circle cx="${f(x2)}" cy="${f(y2)}" r="${f(w / 2 + 0.6)}" fill="${cuff}" ${S(1.3)}/>`;
const dots = (pts, col, r = 2.2) => pts.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${col}" ${S(0.8)}/>`).join('');
/** Lo que levanta en la mano (x,y = la mano): la espada por el puño, el basto por el mango; oros y copas, en la palma. */
function held(s, x, y, L = 170, r = 0) {
  const a = (r * Math.PI) / 180;
  if (s === 'e') return long('e', x + Math.sin(a) * (L / 2 - 20), y - Math.cos(a) * (L / 2 - 20), r, L, 1.05);
  if (s === 'b') return long('b', x + Math.sin(a) * (L / 2 - 24), y - Math.cos(a) * (L / 2 - 24), r, L, 1.15);
  return pip(s, x, y - 20, 0.72);
}

/** Ropa de cada figura, como en el naipe. */
const SOTA = {
  o: { main: C.red, sleeve: C.green, cape: C.yellow, hose: C.blue, hat: C.red, trim: C.yellow, plume: C.red },
  c: { main: C.blue, sleeve: C.red, cape: C.green, hose: C.red, hat: C.blue, trim: C.yellow, plume: C.red },
  e: { main: C.yellow, sleeve: C.red, cape: C.green, hose: C.green, hat: C.green, trim: C.red, plume: C.yellow },
  b: { main: C.red, sleeve: C.blue, cape: C.yellow, hose: C.blue, hat: C.blue, trim: C.yellow, plume: C.yellow },
};
const CABALLO = {
  o: { main: C.red, sleeve: C.blue, skirt: C.yellow, hose: C.blue, hat: C.blue, trim: C.yellow, horse: '#d9933a', horse2: '#a8641f', mane: '#5a3418' },
  c: { main: C.green, sleeve: C.red, skirt: C.yellow, hose: C.red, hat: C.red, trim: C.yellow, horse: '#d9933a', horse2: '#a8641f', mane: '#5a3418' },
  e: { main: C.blue, sleeve: C.yellow, skirt: C.red, hose: C.yellow, hat: C.red, trim: C.yellow, horse: C.horse, horse2: C.horse2, mane: C.mane },
  b: { main: C.red, sleeve: C.green, skirt: C.blue, hose: C.green, hat: C.green, trim: C.yellow, horse: C.horse, horse2: C.horse2, mane: C.mane },
};
const REY = {
  o: { main: C.red, robe: C.yellow, sleeve: C.red, cape: C.green, trim: C.yellow },
  c: { main: C.green, robe: C.yellow, sleeve: C.green, cape: C.red, trim: C.yellow },
  e: { main: C.blue, robe: C.yellow, sleeve: C.blue, cape: C.red, trim: C.yellow },
  b: { main: C.blue, robe: C.red, sleeve: C.red, cape: C.green, trim: C.yellow },
};

function sota(s) {
  const P = SOTA[s];
  // levanta lo suyo con la mano del lado izquierdo de la carta; la espada, derecha delante del cuerpo
  const lh = s === 'e' ? [64, 180] : s === 'b' ? [62, 140] : [52, 108];
  return `
  <path d="M84,204 L82,262 H96 L99,204 Z M101,204 L104,262 H118 L116,204 Z" fill="${P.hose}" ${S(1.7)}/>
  <path d="M80,262 C80,256 96,256 97,262 V268 H76 Q75,262 80,262 Z M103,262 C104,256 120,256 120,262 Q125,262 124,268 H103 Z" fill="${C.line}"/>
  <path d="M80,116 C70,124 64,150 66,190 L86,196 L84,130 Z M120,116 C130,124 140,150 138,190 L116,196 L118,130 Z" fill="${P.cape}" ${S(1.6)}/>
  <path d="M78,116 Q100,108 122,116 L130,206 Q100,214 70,206 Z" fill="${P.main}" ${S(1.8)}/>
  <path d="M70,206 Q100,214 130,206 L129,198 Q100,206 71,198 Z" fill="${P.trim}" ${S(1.3)}/>
  <path d="M92,116 L100,200 L108,116" fill="${P.sleeve}" ${S(1.4)}/>
  ${dots([[100, 132], [100, 146], [100, 160], [100, 188]], P.trim, 2.4)}
  <path d="M72,170 H128" stroke="${C.line}" stroke-width="8"/><path d="M72,170 H128" stroke="${C.brown}" stroke-width="5"/>
  <rect x="94" y="165" width="12" height="10" rx="2" fill="${C.yellow}" ${S(1.2)}/>
  ${s === 'e' ? held(s, lh[0], lh[1], 150) : ''}
  ${sleeve(122, 124, 132, 182, P.sleeve, P.trim)}${hand(132, 188)}
  ${s !== 'e' ? held(s, lh[0], lh[1], 140, s === 'b' ? 6 : 0) : ''}
  ${sleeve(78, 124, lh[0] + 3, lh[1] + 5, P.sleeve, P.trim)}
  ${hand(lh[0] + 2, lh[1] + 4, 6.5)}
  <path d="M84,116 Q100,126 116,116 L113,108 Q100,114 87,108 Z" fill="${C.white}" ${S(1.3)}/>
  ${face(100, 88, 18)}
  <path d="M80,80 Q80,62 100,62 Q120,62 120,80 Q113,71 100,71 Q87,71 80,80 Z" fill="${C.hair}" ${S(1.3)}/>
  <path d="M74,72 Q98,50 128,68 Q124,74 118,73 Q98,64 80,77 Z" fill="${P.hat}" ${S(1.6)}/>
  <path d="M76,73 Q100,64 124,71" stroke="${P.trim}" stroke-width="3" fill="none"/>
  <path d="M118,64 Q134,40 150,48 Q136,52 124,68" fill="${P.plume}" ${S(1.2)}/>`;
}
function rey(s) {
  const P = REY[s];
  // levanta lo suyo con la mano del lado izquierdo de la carta (la espada derecha, el basto al hombro)
  const lh = s === 'e' ? [62, 178] : s === 'b' ? [64, 160] : [56, 116];
  const ermine = (d) => `<path d="${d}" stroke="${C.white}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${C.line}" stroke-width="10" stroke-dasharray="1.6 8" fill="none" opacity=".85"/>`;
  return `
  <path d="M70,120 Q100,108 130,120 L154,268 H46 Z" fill="${P.cape}" ${S(1.8)}/>
  <path d="M80,122 Q100,114 120,122 L138,268 H62 Z" fill="${P.main}" ${S(1.8)}/>
  <path d="M90,124 L84,268 H116 L110,124 Z" fill="${P.robe}" ${S(1.5)}/>
  ${[150, 176, 202, 228, 254].map((y) => `<path d="M${f(88 - (y - 124) * 0.05)},${y} H${f(112 + (y - 124) * 0.05)}" stroke="${C.line}" stroke-width="1.2"/>${dots([[94, y - 12], [106, y - 12]], P.main, 2)}`).join('')}
  ${ermine('M58,262 H142')}
  ${dots([[74, 150], [126, 150], [70, 190], [130, 190], [66, 230], [134, 230]], P.trim, 2.6)}
  <path d="M76,172 H124" stroke="${C.line}" stroke-width="8"/><path d="M76,172 H124" stroke="${C.yellow}" stroke-width="5"/>
  ${sleeve(124, 128, 134, 196, P.sleeve, C.white, 14)}${hand(134, 203, 7)}
  ${held(s, lh[0], lh[1], s === 'e' ? 150 : 140, s === 'b' ? 6 : 0)}
  ${sleeve(76, 128, lh[0] + 4, lh[1] + 8, P.sleeve, C.white, 14)}
  ${hand(lh[0] + 2, lh[1] + 6, 7)}
  <path d="M76,118 Q100,136 124,118 L120,110 Q100,124 80,110 Z" fill="${C.white}" ${S(1.3)}/>
  ${face(100, 88, 18, { beard: C.beard, hair: C.beard })}
  <path d="M78,78 L80,48 L90,62 L100,42 L110,62 L120,48 L122,78 Z" fill="${C.yellow}" ${S(1.6)}/>
  <path d="M78,72 H122 V80 H78 Z" fill="${C.red}" ${S(1.4)}/>
  <circle cx="100" cy="62" r="3.4" fill="${C.red}" ${S(1)}/><circle cx="80" cy="47" r="2.6" fill="${C.red}" ${S(0.8)}/><circle cx="100" cy="41" r="2.8" fill="${C.sky}" ${S(0.8)}/><circle cx="120" cy="47" r="2.6" fill="${C.red}" ${S(0.8)}/>`;
}
function caballo(s) {
  const P = CABALLO[s];
  const hc = P.horse, hc2 = P.horse2;
  const tall = s === 'e' || s === 'b';
  const leg = (d) => `<path d="${d}" fill="${hc}" ${S(1.7)}/>`;
  // el caballo mira a la izquierda y camina; el jinete levanta lo suyo con la mano izquierda
  return `
  <path d="M150,188 Q176,192 176,234 Q170,212 156,208 Q166,232 162,248 Q154,222 146,206 Z" fill="${P.mane}" ${S(1.4)}/>
  ${leg('M136,206 L150,236 L144,266 H134 L138,238 L124,212 Z')}${leg('M120,214 L120,266 H110 L106,216 Z')}
  ${leg('M82,212 L64,236 L70,266 H60 L52,234 L68,206 Z')}${leg('M96,216 L94,266 H84 L84,216 Z')}
  <path d="M132,266 h14 v4 h-16 Z M108,266 h14 v4 h-16 Z M82,266 h14 v4 h-16 Z M58,266 h14 v4 h-16 Z" fill="${C.line}"/>
  <ellipse cx="102" cy="192" rx="52" ry="28" fill="${hc}" ${S(1.9)}/>
  <path d="M60,204 Q102,222 140,206" stroke="${hc2}" stroke-width="4" fill="none" opacity=".7"/>
  <path d="M74,184 Q64,152 54,122 L32,134 Q40,170 56,198 Z" fill="${hc}" ${S(1.9)}/>
  <path d="M56,118 Q40,104 24,124 Q16,138 24,146 L42,142 Z" fill="${hc}" ${S(1.9)}/>
  <path d="M52,116 L50,102 L42,114" fill="${hc}" ${S(1.5)}/>
  <circle cx="37" cy="126" r="2.4" fill="${C.line}"/><path d="M26,138 h4" ${S(1.5)}/>
  <path d="M54,120 Q66,146 72,178" stroke="${P.mane}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M40,128 L80,152" stroke="${C.red}" stroke-width="2.4"/>
  <path d="M70,168 Q102,158 134,170 L132,206 Q102,214 72,204 Z" fill="${P.skirt}" ${S(1.7)}/>
  <path d="M72,204 Q102,214 132,206 L131,198 Q102,206 73,196 Z" fill="${P.trim}" ${S(1.2)}/>
  ${dots([[86, 182], [102, 186], [118, 182]], P.trim, 2.4)}
  <path d="M88,128 Q102,118 116,128 L120,176 H84 Z" fill="${P.main}" ${S(1.7)}/>
  <path d="M88,166 H116" stroke="${C.line}" stroke-width="7"/><path d="M88,166 H116" stroke="${C.yellow}" stroke-width="4"/>
  <path d="M100,176 L96,214 L108,216 L110,176 Z" fill="${P.hose}" ${S(1.5)}/><path d="M92,214 h18 l2,6 h-22 Z" fill="${C.line}"/>
  ${held(s, 84, tall ? 116 : 108, 104, s === 'b' ? 8 : 0)}
  ${sleeve(92, 134, 86, tall ? 118 : 112, P.sleeve, P.trim, 11)}
  ${hand(85, tall ? 115 : 109, 6)}
  ${sleeve(112, 134, 124, 158, P.sleeve, P.trim, 11)}${hand(126, 161, 6)}
  ${face(102, 106, 14, { mustache: true })}
  <path d="M84,100 Q102,72 122,100 Q116,92 102,92 Q88,92 84,100 Z" fill="${P.hat}" ${S(1.5)}/>
  <path d="M86,100 H120" stroke="${P.trim}" stroke-width="3"/>
  <path d="M114,88 Q132,70 142,78 Q130,80 120,94" fill="${C.yellow}" ${S(1.1)}/>`;
}

// ---------------------------------------------------------------- la carta
/** El marco con sus pintas: cortes arriba y abajo según el palo. */
function frame(s) {
  const gaps = { o: 0, c: 1, e: 2, b: 3 }[s];
  const x0 = 12, x1 = W - 12, y0 = 12, y1 = H - 12;
  const gw = 10, gs = 7;
  const span = gaps * gw + (gaps - 1) * gs;
  const cuts = [];
  for (let i = 0; i < gaps; i++) {
    const a = W / 2 - span / 2 + i * (gw + gs);
    cuts.push([a, a + gw]);
  }
  const edge = (y) => {
    let d = `M${x0},${y}`;
    for (const [a, b] of cuts) d += ` H${a} M${b},${y}`;
    return d + ` H${x1}`;
  };
  return `<path d="${edge(y0)} ${edge(y1)} M${x0},${y0} V${y1} M${x1},${y0} V${y1}" stroke="${C.line}" stroke-width="1.6" fill="none"/>`;
}
function index(n) {
  const big = n >= 10;
  const t = `<text font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${big ? 24 : 27}" fill="${C.line}" text-anchor="middle" stroke="${C.paper}" stroke-width="4" paint-order="stroke">`;
  const one = `${t}<tspan x="${big ? 29 : 27}" y="${big ? 38 : 40}">${n}</tspan></text>`;
  return `${one}<g transform="rotate(180 100 150)">${one}</g>`;
}
export function cardSVG(card) {
  const n = num(card), s = suit(card);
  let art;
  if (n === 1) art = ace(s);
  else if (n <= 7) art = pips(n, s);
  else art = n === 10 ? sota(s) : n === 11 ? caballo(s) : rey(s);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="13" fill="${C.paper}" stroke="#9fb9c6" stroke-width="2.4"/>
  ${frame(s)}${art}${index(n)}</svg>`;
}
function star(r1, r2, k) {
  let d = '';
  for (let i = 0; i < k * 2; i++) {
    const a = (Math.PI * i) / k - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    d += `${i ? 'L' : 'M'}${f(Math.cos(a) * r)},${f(Math.sin(a) * r)}`;
  }
  return d + 'Z';
}
export function backSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>
  <pattern id="lat" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#8c1c2b"/><path d="M0,8 H16 M8,0 V16" stroke="#b8323f" stroke-width="2"/><circle cx="8" cy="8" r="2.2" fill="#f2c440"/></pattern>
  <radialGradient id="med" r=".7"><stop offset="0" stop-color="#fff4b8"/><stop offset="1" stop-color="#e0a526"/></radialGradient></defs>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="14" fill="#fbf3e2" stroke="#a89878" stroke-width="2.4"/>
  <rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="8" fill="url(#lat)" stroke="#5e0f1a" stroke-width="2"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="5" fill="none" stroke="#f2c440" stroke-width="2"/>
  <ellipse cx="100" cy="150" rx="46" ry="60" fill="#5e0f1a" stroke="#f2c440" stroke-width="3"/>
  <ellipse cx="100" cy="150" rx="38" ry="52" fill="url(#med)" stroke="#8a5a0c" stroke-width="2"/>
  <path d="${star(30, 13, 8)}" transform="translate(100 150)" fill="#c0392b" stroke="#7a1e14" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="100" cy="150" r="9" fill="#f2c440" stroke="#7a1e14" stroke-width="1.5"/></svg>`;
}

const cache = new Map();
const uri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s*\n\s*/g, ' '))}`;
/** La imagen de una carta (o del dorso, con `null`). */
export function cardURL(card) {
  const k = card || 'back';
  let u = cache.get(k);
  if (!u) cache.set(k, (u = uri(card ? cardSVG(card) : backSVG())));
  return u;
}
