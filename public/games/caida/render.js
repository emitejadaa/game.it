/**
 * Caída Libre — dibujo en canvas 2D.
 *  - Cada bloque es un sprite pre-renderizado (borde neón y relleno translúcido); el brillo sale de ese sprite y solo si el
 *    portal tiene el brillo prendido: nunca shadowBlur por cuadro.
 *  - La grilla del tablero es una imagen cacheada que se vuelve a armar solo al cambiar el tamaño o el tema.
 *  - Los rivales se dibujan como "perfil de alturas" (columnas); el tablero que se mira, completo.
 *  - Las líneas de ataque viajan de un tablero al otro; con "reducir movimiento" no viajan, solo destellan, y no hay temblor ni partículas.
 * Todo en píxeles CSS (el contexto ya trae la escala del dispositivo).
 */
import { W, H, HIDDEN, VISIBLE, GARBAGE, SHAPES, PIECE_COLORS, PALETTE } from './shared/rules.js';

const TAU = Math.PI * 2;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}
const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dark = true;
    this.glow = true;
    this.motion = true;
    this.sprites = new Map();
    this.grid = null;
    this.beams = [];
    this.flashes = []; // { rows: [..], age } filas limpiadas
    this.locks = []; // { cells, age } celdas recién fijadas
    this.rise = 0; // ms que lleva la animación de basura entrando (0 = quieta)
    this.riseRows = 0;
    this.shakeMs = 0;
    this.shakeAmp = 0;
    this.attacked = 0; // ms de destello rojo del borde cuando te mandan basura
    this.theme({});
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.sprites.clear();
    this.grid = null;
  }

  theme(p) {
    this.dark = p.theme !== 'light';
    this.glow = p.glow !== false;
    this.motion = !p.reducedMotion;
    this.accent = p.colors?.accent || '#00f0ff';
    this.bg = p.colors?.bg || (this.dark ? '#07070a' : '#f3f3f7');
    this.panel = this.dark ? '#0b0b12' : '#fbfbfe';
    this.edge = this.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.16)';
    this.ink = this.dark ? '#ffffff' : '#15151c';
    this.mute = this.dark ? '#8a8a9c' : '#5f5f70';
    this.danger = this.dark ? '#ff3b5c' : '#d4143a';
    this.kinds = PIECE_COLORS.map((c) => (this.dark ? c : shade(c, 0.74)));
    this.players = PALETTE.map((c) => (this.dark ? c : shade(c, 0.74)));
    this.sprites.clear();
    this.grid = null;
  }

  // ------------------------------------------------------------ sprites
  /** Bloque de `kind` (1..7, 8 = basura, 0 = fantasma de `ghost`) de `c` píxeles. */
  sprite(kind, c, ghostColor) {
    const key = `${kind}|${c}|${ghostColor || ''}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const pad = this.glow ? Math.ceil(c * 0.45) : 1;
    const size = Math.ceil(c + pad * 2);
    const dpr = this.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(size * dpr);
    cv.height = Math.ceil(size * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const col = kind === 0 ? ghostColor : kind === GARBAGE ? (this.dark ? '#9a9aae' : '#6c6c80') : this.kinds[kind - 1];
    const r = Math.max(2, c * 0.16);
    const x = pad + 1;
    const y = pad + 1;
    const w = c - 2;
    g.beginPath();
    g.roundRect(x, y, w, w, r);
    if (kind === 0) {
      g.strokeStyle = alpha(col, 0.55);
      g.lineWidth = Math.max(1.5, c * 0.07);
      g.stroke();
    } else {
      const grad = g.createLinearGradient(x, y, x, y + w);
      grad.addColorStop(0, alpha(col, this.dark ? 0.5 : 0.62));
      grad.addColorStop(1, alpha(col, this.dark ? 0.2 : 0.38));
      g.fillStyle = grad;
      g.fill();
      if (this.glow && kind !== GARBAGE) {
        g.shadowColor = col;
        g.shadowBlur = c * 0.5; // una sola vez, al armar el sprite
      }
      g.strokeStyle = col;
      g.lineWidth = Math.max(1.6, c * 0.085);
      g.stroke();
      g.shadowBlur = 0;
      // brillo interno arriba a la izquierda
      g.strokeStyle = this.dark ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.75)';
      g.lineWidth = Math.max(1, c * 0.05);
      g.beginPath();
      g.moveTo(x + r + 1, y + c * 0.16);
      g.lineTo(x + w - r - 1, y + c * 0.16);
      g.moveTo(x + c * 0.16, y + r + 1);
      g.lineTo(x + c * 0.16, y + w - r - 1);
      g.stroke();
      if (kind === GARBAGE) {
        // rayas diagonales: se nota que es basura y no una pieza
        g.save();
        g.beginPath();
        g.roundRect(x, y, w, w, r);
        g.clip();
        g.strokeStyle = this.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)';
        g.lineWidth = Math.max(1, c * 0.07);
        for (let k = -w; k < w * 2; k += c * 0.34) {
          g.beginPath();
          g.moveTo(x + k, y + w);
          g.lineTo(x + k + w, y);
          g.stroke();
        }
        g.restore();
      }
    }
    s = { cv, pad, size };
    this.sprites.set(key, s);
    return s;
  }

  cellAt(kind, px, py, c, ghostColor) {
    const s = this.sprite(kind, c, ghostColor);
    this.ctx.drawImage(s.cv, px - s.pad, py - s.pad, s.size, s.size);
  }

  /** Mosaico de la grilla del tablero propio: 10×20 celdas con líneas finas. */
  gridImage(c) {
    if (this.grid && this.grid.c === c) return this.grid.cv;
    const dpr = this.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(10 * c * dpr);
    cv.height = Math.ceil((VISIBLE + 1) * c * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = this.panel;
    g.fillRect(0, 0, 10 * c, (VISIBLE + 1) * c);
    g.strokeStyle = this.dark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.07)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < 10; x++) (g.moveTo(Math.round(x * c) + 0.5, c), g.lineTo(Math.round(x * c) + 0.5, (VISIBLE + 1) * c));
    for (let y = 2; y <= VISIBLE; y++) (g.moveTo(0, Math.round(y * c) + 0.5), g.lineTo(10 * c, Math.round(y * c) + 0.5));
    g.stroke();
    // la fila de arriba (donde nacen las piezas) más apagada
    g.fillStyle = this.dark ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.06)';
    g.fillRect(0, 0, 10 * c, c);
    this.grid = { c, cv };
    return cv;
  }

  // ------------------------------------------------------------ efectos
  /** Filas limpiadas (índices de tablero) para el destello. */
  clearRows(rows) {
    if (this.motion && rows.length) this.flashes.push({ rows: rows.slice(), age: 0 });
  }

  lockCells(cells) {
    if (this.motion) this.locks.push({ cells, age: 0 });
  }

  /** Basura que entró: el tablero sube suave y, si fue mucha, tiembla un poco. */
  garbage(rows) {
    this.attacked = 320;
    if (!this.motion) return;
    this.rise = 1;
    this.riseRows = rows;
    if (rows >= 3) {
      this.shakeMs = 220;
      this.shakeAmp = Math.min(5, rows);
    }
  }

  /** Línea de ataque de un punto a otro. */
  beam(from, to, n, color) {
    this.beams.push({ from, to, n, color, age: 0, dur: this.motion ? 480 : 260 });
    if (this.beams.length > 24) this.beams.shift();
  }

  step(dt) {
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < 220);
    for (const l of this.locks) l.age += dt;
    this.locks = this.locks.filter((l) => l.age < 160);
    for (const b of this.beams) b.age += dt;
    this.beams = this.beams.filter((b) => b.age < b.dur);
    if (this.rise) this.rise = this.rise + dt / 160 >= 1.001 ? 0 : this.rise + dt / 160;
    if (this.shakeMs > 0) this.shakeMs = Math.max(0, this.shakeMs - dt);
    if (this.attacked > 0) this.attacked = Math.max(0, this.attacked - dt);
  }

  // ------------------------------------------------------------ cuadro
  /**
   * f: { lay, now, dt, own: { grid, piece, ghostY, hold, canHold, next, pend, dead }, watch: { grid, name, color, pend } | null,
   *      rivals (RivalBoards), order: [num], players: Map, me, target: num, count: ms | 0, demo: [{grid, x, y, c}] | null }
   */
  draw(f) {
    const ctx = this.ctx;
    const { lay } = f;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.step(f.dt);

    if (f.demo) {
      for (const d of f.demo) this.drawDemo(d);
      return;
    }
    // rivales (detrás del tablero propio)
    this.drawRivals(f);

    const b = lay.board;
    let ox = 0;
    let oy = 0;
    if (this.shakeMs > 0) {
      const k = this.shakeMs / 220;
      ox = Math.sin(f.now / 18) * this.shakeAmp * k;
      oy = Math.cos(f.now / 23) * this.shakeAmp * k * 0.6;
    }
    ctx.save();
    ctx.translate(ox, oy);
    const view = f.watch || f.own;
    this.drawBoard(lay, view, f);
    this.drawPreviews(lay, f);
    this.drawMeter(lay, f.watch ? f.watch.pend : f.own.pend, f.now);
    ctx.restore();
    this.drawBeams(f);
    void b;
  }

  drawBoard(lay, view, f) {
    const ctx = this.ctx;
    const c = lay.cell;
    const b = lay.board;
    const top = b.y - c; // fila de nacimiento
    ctx.drawImage(this.gridImage(c), b.x, top, 10 * c, (VISIBLE + 1) * c);
    // borde: neón; rojo si la pila está alta o te acaban de mandar basura
    const high = this.heightOf(view.grid) >= 17;
    let col = f.watch ? this.players[view.color % this.players.length] : this.accent;
    let lw = 2;
    if (this.attacked > 0 && !f.watch) {
      col = this.danger;
      lw = 3;
    } else if (high) {
      col = this.danger;
      if (this.motion) lw = 2 + Math.sin(f.now / 120) * 1;
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = col;
    ctx.strokeRect(b.x - 1, top - 1, 10 * c + 2, (VISIBLE + 1) * c + 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, top, 10 * c, (VISIBLE + 1) * c);
    ctx.clip();
    let dy = 0;
    if (this.rise) dy = this.riseRows * c * (1 - this.rise) * (1 - this.rise);
    const grid = view.grid;
    // filas ocultas 1 (la de nacimiento) y las 20 visibles
    for (let y = HIDDEN - 1; y < H; y++) {
      const py = top + (y - (HIDDEN - 1)) * c + dy;
      for (let x = 0; x < W; x++) {
        const v = grid[y * W + x];
        if (v) this.cellAt(v, b.x + x * c, py, c);
      }
    }
    if (view.piece && !f.watch) {
      const p = view.piece;
      const s = SHAPES[p.kind][p.r];
      if (view.ghostY > p.y) for (let i = 0; i < 8; i += 2) this.ghostCell(p.kind, b.x + (p.x + s[i]) * c, top + (view.ghostY + s[i + 1] - (HIDDEN - 1)) * c, c);
      for (let i = 0; i < 8; i += 2) this.cellAt(p.kind, b.x + (p.x + s[i]) * c, top + (p.y + s[i + 1] - (HIDDEN - 1)) * c + dy, c);
    }
    // destellos: pieza recién fijada y filas limpiadas
    for (const l of this.locks) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - l.age / 160)})`;
      for (const [cx, cy] of l.cells) ctx.fillRect(b.x + cx * c, top + (cy - (HIDDEN - 1)) * c, c, c);
    }
    for (const fl of this.flashes) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - fl.age / 220)})`;
      for (const r of fl.rows) ctx.fillRect(b.x, top + (r - (HIDDEN - 1)) * c, 10 * c, c);
    }
    ctx.restore();
    if (f.watch) {
      ctx.fillStyle = this.dark ? 'rgba(0,0,0,0.0)' : 'rgba(0,0,0,0)';
    }
  }

  ghostCell(kind, px, py, c) {
    this.cellAt(0, px, py, c, this.kinds[kind - 1]);
  }

  heightOf(grid) {
    let i = 0;
    while (i < grid.length && grid[i] === 0) i++;
    return H - ((i / W) | 0);
  }

  /** Una pieza chica centrada en una caja (guardado y cola). */
  drawPiece(kind, bx, by, bw, bh, s, dim) {
    const sh = SHAPES[kind][0];
    let minX = 9;
    let maxX = 0;
    let minY = 9;
    let maxY = 0;
    for (let i = 0; i < 8; i += 2) {
      minX = Math.min(minX, sh[i]);
      maxX = Math.max(maxX, sh[i]);
      minY = Math.min(minY, sh[i + 1]);
      maxY = Math.max(maxY, sh[i + 1]);
    }
    const w = (maxX - minX + 1) * s;
    const h = (maxY - minY + 1) * s;
    const ox = bx + (bw - w) / 2 - minX * s;
    const oy = by + (bh - h) / 2 - minY * s;
    const ctx = this.ctx;
    if (dim) ctx.globalAlpha = 0.35;
    for (let i = 0; i < 8; i += 2) this.cellAt(kind, ox + sh[i] * s, oy + sh[i + 1] * s, s);
    ctx.globalAlpha = 1;
  }

  drawPreviews(lay, f) {
    const ctx = this.ctx;
    const s = lay.preview;
    const own = f.own;
    const draw = (box, label) => {
      ctx.fillStyle = this.panel;
      ctx.strokeStyle = this.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(box.x + 0.5, box.y + 0.5, box.w, box.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.mute;
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, box.x + box.w / 2, box.y + 11);
    };
    const t = f.text || {};
    draw(lay.hold, t.hold || 'HOLD');
    draw(lay.next, t.next || 'NEXT');
    if (f.watch) return;
    const hb = lay.hold;
    if (own.hold) this.drawPiece(own.hold, hb.x, hb.y + 12, hb.w, hb.h - 12, s, !own.canHold);
    const nb = lay.next;
    const slot = (nb.h - 12) / nb.n;
    for (let i = 0; i < nb.n && own.next && own.next[i]; i++) this.drawPiece(own.next[i], nb.x, nb.y + 12 + i * slot, nb.w, slot, s);
  }

  /** Medidor de basura pendiente: una barra roja que sube desde abajo. */
  drawMeter(lay, pend, now) {
    const ctx = this.ctx;
    const m = lay.meter;
    ctx.fillStyle = this.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(m.x, m.y, m.w, m.h);
    if (pend > 0) {
      const hh = Math.min(m.h, (pend / VISIBLE) * m.h);
      ctx.fillStyle = this.danger;
      const pulse = this.motion && pend >= 6 ? 0.7 + 0.3 * Math.sin(now / 90) : 1;
      ctx.globalAlpha = pulse;
      ctx.fillRect(m.x, m.y + m.h - hh, m.w, hh);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------ rivales
  drawRivals(f) {
    const { lay, rivals, order, players } = f;
    const m = lay.minis.m;
    if (!m) return;
    const ctx = this.ctx;
    const bw = 10 * m;
    const bh = 20 * m;
    order.forEach((num, i) => {
      const pos = lay.minis.pos[i];
      const r = rivals.map.get(num);
      if (!pos || !r) return;
      const pl = players.get(num);
      const col = this.players[(pl?.color ?? 0) % this.players.length];
      const out = !r.alive;
      const x = pos.x;
      const y = pos.y;
      ctx.globalAlpha = out ? 0.4 : 1;
      ctx.fillStyle = this.panel;
      ctx.fillRect(x, y, bw, bh);
      // perfil de alturas
      const cw = bw / W;
      let mh = 0;
      for (let cx = 0; cx < W; cx++) {
        const hgt = Math.min(VISIBLE, r.shown[cx]);
        if (r.shown[cx] > mh) mh = r.shown[cx];
        if (hgt <= 0.05) continue;
        ctx.fillStyle = alpha(col, out ? 0.35 : 0.5);
        ctx.fillRect(x + cx * cw, y + bh - hgt * m, cw - (cw > 3 ? 1 : 0), hgt * m);
        ctx.fillStyle = col;
        ctx.fillRect(x + cx * cw, y + bh - hgt * m, cw - (cw > 3 ? 1 : 0), Math.max(1, m * 0.7));
      }
      if (r.pend > 0) {
        ctx.fillStyle = this.danger;
        ctx.fillRect(x + bw - Math.max(2, m * 0.5), y + bh - Math.min(bh, r.pend * m), Math.max(2, m * 0.5), Math.min(bh, r.pend * m));
      }
      // borde: color del jugador; rojo si la pila está alta; blanco si es el que se mira; destello si recibe un ataque
      let bc = alpha(col, 0.75);
      let lw = 1;
      if (mh >= 16 && !out) bc = this.danger;
      if (f.watching === num) (bc = this.ink), (lw = 2);
      if (r.hit > 0) (bc = this.danger), (lw = 2);
      if (f.target === num && !out) lw = Math.max(lw, 2);
      ctx.strokeStyle = bc;
      ctx.lineWidth = lw;
      ctx.strokeRect(x - 0.5, y - 0.5, bw + 1, bh + 1);
      if (r.hit > 0 && this.motion) {
        ctx.fillStyle = `rgba(255,59,92,${0.25 * (r.hit / 260)})`;
        ctx.fillRect(x, y, bw, bh);
      }
      ctx.globalAlpha = 1;
      if (out) {
        ctx.fillStyle = this.ink;
        ctx.font = `700 ${Math.max(9, Math.min(16, bw / 2.4))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(r.rank ? `#${r.rank}` : '✕', x + bw / 2, y + bh / 2 + 4);
      }
      if (lay.minis.lab) {
        ctx.fillStyle = out ? this.mute : this.ink;
        ctx.font = '500 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        let name = pl?.name || '';
        while (name.length > 1 && ctx.measureText(name).width > bw + 6) name = name.slice(0, -1);
        ctx.fillText(name, x + bw / 2, y + bh + 10);
      }
    });
  }

  /** Centro de un rival (para las líneas de ataque), o del tablero propio si es `me`. */
  centerOf(f, num) {
    const { lay } = f;
    if (num === f.me) return { x: lay.board.x + lay.board.w / 2, y: lay.board.y + lay.board.h * 0.5 };
    const i = f.order.indexOf(num);
    const pos = lay.minis.pos[i];
    if (!pos) return null;
    return { x: pos.x + (10 * lay.minis.m) / 2, y: pos.y + (20 * lay.minis.m) / 2 };
  }

  drawBeams(f) {
    const ctx = this.ctx;
    for (const bm of this.beams) {
      const k = bm.age / bm.dur;
      const a = bm.from;
      const b = bm.to;
      const w = 1.5 + Math.min(4, bm.n) * 0.9;
      if (!this.motion) {
        // sin movimiento: un destello fijo sobre el que recibe
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.fillStyle = bm.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 10 + bm.n * 2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      const e = 1 - (1 - Math.min(1, k * 1.15)) ** 3;
      const tail = Math.max(0, e - 0.28);
      const x0 = a.x + (b.x - a.x) * tail;
      const y0 = a.y + (b.y - a.y) * tail;
      const x1 = a.x + (b.x - a.x) * e;
      const y1 = a.y + (b.y - a.y) * e;
      ctx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3;
      ctx.strokeStyle = bm.color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.fillStyle = this.dark ? '#fff' : bm.color;
      ctx.beginPath();
      ctx.arc(x1, y1, w * 0.9, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------ fondo del menú
  drawDemo(d) {
    const ctx = this.ctx;
    const c = d.c;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = this.panel;
    ctx.fillRect(d.x, d.y, 10 * c, VISIBLE * c);
    ctx.strokeStyle = this.edge;
    ctx.strokeRect(d.x - 0.5, d.y - 0.5, 10 * c + 1, VISIBLE * c + 1);
    for (let y = HIDDEN; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = d.grid[y * W + x];
        if (v) this.cellAt(v, d.x + x * c, d.y + (y - HIDDEN) * c, c);
      }
    if (d.piece) {
      const s = SHAPES[d.piece.kind][d.piece.r];
      for (let i = 0; i < 8; i += 2) {
        const py = d.piece.y + s[i + 1] - HIDDEN;
        if (py >= 0) this.cellAt(d.piece.kind, d.x + (d.piece.x + s[i]) * c, d.y + py * c, c);
      }
    }
    ctx.globalAlpha = 1;
  }
}
