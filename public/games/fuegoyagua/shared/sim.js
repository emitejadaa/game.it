/**
 * Fuego y Agua — la simulación, pura y determinista (paso fijo de 1/120 s): dos personajes (Llama y Gota) que
 * corren y saltan por un templo de bloques con rampas a 45°, charcos de lava, agua y barro verde (la lava apaga a
 * Gota, el agua apaga a Llama y el barro, a los dos), gemas de cada color, botones que se mantienen apretados,
 * palancas que se empujan, plataformas y compuertas que se mueven, cajas que se empujan y puertas de salida.
 * Coordenadas en baldosas; y crece hacia abajo; cada cuerpo se ubica por el centro de abajo (sus pies).
 */

export const DT = 1 / 120;
export const P = { g: 40, jump: 15.6, run: 7, accG: 70, accA: 40, w: 0.7, h: 1.2, stepUp: 0.45, maxFall: 24, push: 4.2 };
export const POOL = 0.42; // los charcos están 0,42 más hondos que el piso
export const T = { E: 0, S: 1, UR: 2, UL: 3, LAVA: 4, WATER: 5, GOO: 6 };
const CH = { '#': T.S, '/': T.UR, '\\': T.UL, L: T.LAVA, W: T.WATER, G: T.GOO };
const EPS = 1e-6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

/** Arma el mundo de un nivel: mapa ASCII + objetos (botones, palancas, plataformas, cajas). */
export function load(level) {
  const rows = level.map;
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  const W = { w, h, tiles, gems: [], doors: {}, chars: {}, movers: [], buttons: [], levers: [], boxes: [], time: 0, steps: 0, won: false, dead: null, winT: 0, events: [] };
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`fila ${y} de ${level.id}: ${rows[y].length} columnas en vez de ${w}`);
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (CH[c] != null) tiles[y * w + x] = CH[c];
      else if (c === 'r' || c === 'b') W.gems.push({ x: x + 0.5, y: y + 0.5, k: c === 'r' ? 'F' : 'W', got: false });
      else if (c === 'F' || c === 'A') W.chars[c === 'F' ? 'F' : 'W'] = body(c === 'F' ? 'F' : 'W', x + 0.5, y + 1);
      else if (c === 'D' || c === 'E') W.doors[c === 'D' ? 'F' : 'W'] = { x0: x, x1: x + 2, y: y + 1, open: 0 };
    }
  }
  for (const o of level.objects || []) {
    if (o.t === 'button') W.buttons.push({ x: o.x, y: o.y + 1, link: o.link, pressed: false, down: 0, color: o.color || '#d9a62e' });
    else if (o.t === 'lever') W.levers.push({ x: o.x, y: o.y + 1, link: o.link, on: !!o.on, a: o.on ? 1 : -1, color: o.color || '#d9a62e' });
    else if (o.t === 'mover') W.movers.push({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, x0: o.x, y0: o.y, x1: o.x + (o.dx || 0), y1: o.y + (o.dy || 0), k: 0, speed: o.speed || 3, color: o.color || '#d9a62e', active: false, inv: !!o.inv });
    else if (o.t === 'box') W.boxes.push({ kind: 'box', x: o.x + 0.5, y: o.y + 1, w: 0.96, h: 0.96, vx: 0, vy: 0, ground: false });
  }
  if (!W.chars.F || !W.chars.W || !W.doors.F || !W.doors.W) throw new Error(`nivel ${level.id}: faltan personajes o puertas`);
  return W;
}

function body(k, x, y) {
  return { kind: 'char', k, x, y, w: P.w, h: P.h, vx: 0, vy: 0, ground: false, face: 1, jumpHeld: false, atDoor: false, on: null, walk: 0, landed: 0 };
}

export const tileAt = (W, x, y) => (x < 0 || y < 0 || x >= W.w || y >= W.h ? T.S : W.tiles[y * W.w + x]);
export const isPool = (t) => t >= T.LAVA;

/** Cajas sólidas que tocan el rectángulo (baldosas, charcos más hondos, plataformas y, si corresponde, cajas). */
function solids(W, x0, y0, x1, y1, self, withBoxes) {
  const out = [];
  for (let ty = Math.floor(y0); ty <= Math.floor(y1 - EPS); ty++) {
    for (let tx = Math.floor(x0); tx <= Math.floor(x1 - EPS); tx++) {
      const t = tileAt(W, tx, ty);
      if (t === T.S) out.push({ x0: tx, y0: ty, x1: tx + 1, y1: ty + 1, tile: true });
      else if (isPool(t)) out.push({ x0: tx, y0: ty + POOL, x1: tx + 1, y1: ty + 1, tile: true });
    }
  }
  for (const m of W.movers) out.push({ x0: m.x, y0: m.y, x1: m.x + m.w, y1: m.y + m.h, mover: m });
  if (withBoxes) for (const b of W.boxes) if (b !== self) out.push({ x0: b.x - b.w / 2, y0: b.y - b.h, x1: b.x + b.w / 2, y1: b.y, box: b });
  return out.filter((s) => s.x1 > x0 + EPS && s.x0 < x1 - EPS && s.y1 > y0 + EPS && s.y0 < y1 - EPS);
}
const rectOf = (b) => [b.x - b.w / 2, b.y - b.h, b.x + b.w / 2, b.y];

/** Mueve un cuerpo en x resolviendo choques; los personajes suben escalones chicos y empujan cajas. */
function moveX(W, b, dx) {
  if (!dx) return 0;
  const x0 = b.x;
  b.x += dx;
  let pushed = false;
  for (let it = 0; it < 4; it++) {
    const hit = solids(W, ...rectOf(b), b, true);
    if (!hit.length) break;
    const s = hit[0];
    // escalón chico (bordes de charcos, puntas de rampas)
    if (b.kind === 'char' && b.ground && !s.box && s.y0 >= b.y - P.stepUp && s.y0 < b.y) {
      const y = b.y;
      b.y = s.y0;
      if (!solids(W, ...rectOf(b), b, true).length) continue;
      b.y = y;
    }
    if (s.box && b.kind === 'char' && !pushed) {
      // empujar la caja (más lento que corriendo); si no se puede mover, la próxima vuelta frena contra ella
      pushed = true;
      moveX(W, s.box, dx > 0 ? b.x + b.w / 2 - s.x0 + EPS : b.x - b.w / 2 - s.x1 - EPS);
      b.vx = clamp(b.vx, -P.push, P.push);
      continue;
    }
    if (dx > 0) b.x = Math.min(b.x, s.x0 - b.w / 2 - EPS);
    else b.x = Math.max(b.x, s.x1 + b.w / 2 + EPS);
    b.vx = 0;
  }
  return b.x - x0;
}

/** Mueve un cuerpo en y: aterriza sobre lo sólido o se golpea la cabeza. */
function moveY(W, b, dy) {
  b.ground = false;
  b.on = null;
  if (!dy) dy = EPS * 2;
  b.y += dy;
  const hit = solids(W, ...rectOf(b), b, true);
  if (!hit.length) return;
  if (dy > 0) {
    const top = Math.min(...hit.map((s) => s.y0));
    b.y = top;
    b.vy = 0;
    b.ground = true;
    b.on = hit.find((s) => s.y0 === top && s.mover)?.mover || hit.find((s) => s.y0 === top && s.box)?.box || null;
  } else {
    const bot = Math.max(...hit.map((s) => s.y1));
    b.y = bot + b.h;
    b.vy = 0;
  }
}

/** Altura del piso de una rampa debajo de (x, y), o null. */
export function slopeAt(W, x, y) {
  const tx = Math.floor(x);
  for (const ty of [Math.floor(y - 0.06), Math.floor(y + 0.06)]) {
    const t = tileAt(W, tx, ty);
    if (t === T.UR) return ty + 1 - (x - tx);
    if (t === T.UL) return ty + (x - tx);
  }
  return null;
}

function slopes(W, b, wasGround) {
  const s = slopeAt(W, b.x, b.y);
  if (s == null) return;
  if (b.vy >= 0 && (b.y > s - EPS || (wasGround && s - b.y < 0.38))) {
    const y = b.y;
    b.y = s;
    if (solids(W, ...rectOf(b), b, true).length) {
      b.y = y;
      return;
    }
    b.vy = 0;
    b.ground = true;
  }
}

function stepChar(W, c, inp) {
  const want = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  const acc = c.ground ? P.accG : P.accA;
  if (want) {
    c.vx = clamp(c.vx + want * acc * DT, -P.run, P.run);
    c.face = want;
  } else {
    const d = (c.ground ? P.accG : P.accA * 0.6) * DT;
    c.vx = Math.abs(c.vx) <= d ? 0 : c.vx - Math.sign(c.vx) * d;
  }
  if (inp.u && c.ground && !c.jumpHeld) {
    c.vy = -P.jump;
    c.ground = false;
    W.events.push(`jump:${c.k}`);
  }
  c.jumpHeld = !!inp.u;
  c.vy = Math.min(c.vy + P.g * DT, P.maxFall);
  const wasGround = c.ground;
  const fallV = c.vy;
  moveX(W, c, c.vx * DT);
  moveY(W, c, c.vy * DT);
  slopes(W, c, wasGround);
  if (!wasGround && c.ground && fallV > 6) W.events.push(`land:${c.k}`);
  if (c.ground && Math.abs(c.vx) > 0.3) c.walk += Math.abs(c.vx) * DT;
}

function stepBox(W, b) {
  b.vy = Math.min(b.vy + P.g * DT, P.maxFall);
  b.vx = 0;
  const was = b.ground;
  moveY(W, b, b.vy * DT);
  if (!was && b.ground) W.events.push('box');
}

/** Plataformas: van hacia "prendida" mientras algo las activa y vuelven si no. Llevan lo que tienen arriba. */
function stepMovers(W) {
  const bodies = [W.chars.F, W.chars.W, ...W.boxes];
  for (const m of W.movers) {
    const has = (o) => (Array.isArray(o.link) ? o.link.includes(m.id) : o.link === m.id);
    const on = W.buttons.some((b) => has(b) && b.pressed) || W.levers.some((l) => has(l) && l.on);
    m.active = m.inv ? !on : on;
    const target = m.active ? 1 : 0;
    const len = Math.hypot(m.x1 - m.x0, m.y1 - m.y0) || 1;
    const step = (m.speed / len) * DT;
    const nk = m.k + clamp(target - m.k, -step, step);
    if (nk === m.k) continue;
    const nx = lerp(m.x0, m.x1, nk), ny = lerp(m.y0, m.y1, nk);
    const dx = nx - m.x, dy = ny - m.y;
    const riders = bodies.filter((b) => b.on === m || (Math.abs(b.y - m.y) < 0.03 && b.x + b.w / 2 > m.x + EPS && b.x - b.w / 2 < m.x + m.w - EPS && b.vy >= 0));
    const save = { x: m.x, y: m.y };
    const saved = riders.map((b) => ({ b, x: b.x, y: b.y }));
    m.x = nx;
    m.y = ny;
    let ok = true;
    for (const r of riders) {
      r.y += dy;
      if (dx) moveX(W, r, dx);
      if (solids(W, ...rectOf(r), r, true).some((s) => !(s.mover === m))) ok = false;
    }
    // no aplasta a nadie: si choca contra alguien que no lleva, frena
    if (ok) {
      for (const b of bodies) {
        if (riders.includes(b)) continue;
        const [x0, y0, x1, y1] = rectOf(b);
        if (x1 > m.x + EPS && x0 < m.x + m.w - EPS && y1 > m.y + EPS && y0 < m.y + m.h - EPS) ok = false;
      }
    }
    if (!ok) {
      m.x = save.x;
      m.y = save.y;
      for (const s of saved) {
        s.b.x = s.x;
        s.b.y = s.y;
      }
      continue;
    }
    m.k = nk;
  }
}

function contact(b, x0, x1, y0, y1) {
  const [bx0, by0, bx1, by1] = rectOf(b);
  return bx1 > x0 && bx0 < x1 && by1 > y0 && by0 < y1;
}

/** Un paso de simulación. input = { F: { l, r, u }, W: { l, r, u } } */
export function step(W, input) {
  W.events = [];
  if (W.won || W.dead) {
    if (W.won) W.winT += DT;
    return W;
  }
  W.steps++;
  W.time = W.steps * DT;
  stepMovers(W);
  for (const b of W.boxes) stepBox(W, b);
  for (const k of ['F', 'W']) stepChar(W, W.chars[k], input[k] || {});
  // botones: apretados por cualquiera que esté parado encima
  const bodies = [W.chars.F, W.chars.W, ...W.boxes];
  for (const bt of W.buttons) {
    const was = bt.pressed;
    bt.pressed = bodies.some((b) => b.ground !== false && Math.abs(b.y - bt.y) < 0.12 && b.x + b.w / 2 > bt.x + 0.12 && b.x - b.w / 2 < bt.x + 0.88);
    if (bt.pressed !== was) W.events.push(bt.pressed ? 'press' : 'release');
    bt.down += ((bt.pressed ? 1 : 0) - bt.down) * 0.3;
  }
  // palancas: se empujan caminando contra el mango
  for (const lv of W.levers) {
    for (const c of [W.chars.F, W.chars.W]) {
      // solo caminando: saltando por encima no se mueve
      if (!c.ground || !contact(c, lv.x + 0.1, lv.x + 0.9, lv.y - 1, lv.y)) continue;
      if (c.vx > 0.8 && !lv.on) {
        lv.on = true;
        W.events.push('lever');
      } else if (c.vx < -0.8 && lv.on) {
        lv.on = false;
        W.events.push('lever');
      }
    }
    lv.a += ((lv.on ? 1 : -1) - lv.a) * 0.25;
  }
  // charcos, gemas y puertas
  for (const k of ['F', 'W']) {
    const c = W.chars[k];
    const [x0, y0, x1, y1] = rectOf(c);
    for (let tx = Math.floor(x0 + 0.12); tx <= Math.floor(x1 - 0.12); tx++) {
      for (let ty = Math.floor(y0); ty <= Math.floor(y1 - EPS); ty++) {
        const t = tileAt(W, tx, ty);
        if (!isPool(t)) continue;
        if (y1 > ty + 0.12 && x1 - 0.12 > tx && x0 + 0.12 < tx + 1) {
          if (t === T.GOO || (t === T.LAVA && k === 'W') || (t === T.WATER && k === 'F')) {
            W.dead = { k, t, x: c.x, y: c.y };
            W.events.push(`die:${k}`);
            return W;
          }
        }
      }
    }
    for (const gm of W.gems) {
      if (gm.got || gm.k !== k) continue;
      if (contact(c, gm.x - 0.38, gm.x + 0.38, gm.y - 0.38, gm.y + 0.38)) {
        gm.got = true;
        W.events.push(`gem:${k}`);
      }
    }
    const d = W.doors[k];
    const was = c.atDoor;
    c.atDoor = c.ground && Math.abs(c.y - d.y) < 0.1 && c.x > d.x0 + 0.25 && c.x < d.x1 - 0.25;
    if (c.atDoor && !was) W.events.push(`door:${k}`);
  }
  for (const k of ['F', 'W']) W.doors[k].open += ((W.chars[k].atDoor ? 1 : 0) - W.doors[k].open) * 0.12;
  if (W.chars.F.atDoor && W.chars.W.atDoor) {
    W.won = true;
    W.events.push('win');
  }
  return W;
}

/** Nota del nivel como en el original: A con todas las gemas y en tiempo, B con una de las dos, C si no. */
export function grade(W, par) {
  const all = W.gems.every((g) => g.got);
  const fast = W.time <= par;
  return all && fast ? 'A' : all || fast ? 'B' : 'C';
}
export const gemsGot = (W) => W.gems.filter((g) => g.got).length;
