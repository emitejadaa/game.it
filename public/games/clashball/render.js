/**
 * Clashball — dibujo en canvas 2D.
 * La cancha se pre-dibuja en un canvas aparte (solo cambia al redimensionar); cada cuadro se
 * dibujan discos, efectos y nombres. En pantallas verticales la cancha se gira 90°.
 */
export const COLORS = {
  red: '#ff4b5c',
  redDark: '#b3202f',
  blue: '#3d8bff',
  blueDark: '#1b4fb0',
  ink: '#0a0f1c',
  ball: '#ffffff',
  line: 'rgba(255,255,255,0.86)',
};
const TEAM = [null, COLORS.red, COLORS.blue];
const TEAM_DARK = [null, COLORS.redDark, COLORS.blueDark];

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.field = document.createElement('canvas');
    this.st = null;
    this.cam = { x: 0, y: 0, z: 1, rot: 0 };
    this.fx = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#fff';
    this.trails = new Map();
    this.glow = true;
    this.reduced = false;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.fieldKey = '';
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = this.cv.clientWidth;
    const H = this.cv.clientHeight;
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.fieldKey = '';
  }

  setStadium(st) {
    if (this.st === st) return;
    this.st = st;
    this.fieldKey = '';
    this.trails.clear();
    this.fx.length = 0;
  }

  /** Zoom que entra la cancha completa, con un mínimo para que los discos se vean bien. */
  layout() {
    const st = this.st;
    const rot = this.H > this.W * 1.08 ? 1 : 0;
    const vw = rot ? this.H : this.W;
    const vh = rot ? this.W : this.H;
    const padX = 24;
    const padY = 70;
    const fit = Math.min(vw / (st.width * 2 + padX), (vh - padY) / (st.height * 2 + 10));
    const minZ = Math.min(0.62, Math.max(0.5, Math.min(vw, vh) / 700));
    const z = Math.max(minZ, Math.min(1.6, fit));
    return { rot, z, follow: z > fit + 0.001, vw, vh };
  }

  // ------------------------------------------------------------ cancha pre-dibujada
  drawField(z) {
    const st = this.st;
    const key = `${st.id}:${st.mode}:${z.toFixed(4)}:${this.dpr}:${this.glow}`;
    if (key === this.fieldKey) return;
    this.fieldKey = key;
    const s = z * this.dpr;
    const f = this.field;
    f.width = Math.ceil(st.width * 2 * s);
    f.height = Math.ceil(st.height * 2 * s);
    const g = f.getContext('2d');
    g.setTransform(s, 0, 0, s, st.width * s, st.height * s);
    const bg = st.bg;
    const ice = bg.type === 'hockey';

    // alrededores
    g.fillStyle = ice ? '#1d2a3a' : '#1f4a2c';
    g.fillRect(-st.width, -st.height, st.width * 2, st.height * 2);
    if (!ice) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = -st.width; x < st.width; x += 16) g.fillRect(x, -st.height, 8, st.height * 2);
    }

    // superficie
    const path = new Path2D();
    rounded(path, -bg.w, -bg.h, bg.w * 2, bg.h * 2, bg.corner);
    g.save();
    g.clip(path);
    if (ice) {
      const gr = g.createLinearGradient(0, -bg.h, 0, bg.h);
      gr.addColorStop(0, '#eef7fc');
      gr.addColorStop(1, '#d9ebf5');
      g.fillStyle = gr;
      g.fillRect(-bg.w, -bg.h, bg.w * 2, bg.h * 2);
      g.globalAlpha = 0.18;
      g.strokeStyle = '#9fc6dc';
      g.lineWidth = 1;
      for (let i = 0; i < 70; i++) {
        const x = ((i * 97) % (bg.w * 2)) - bg.w;
        const y = ((i * 57) % (bg.h * 2)) - bg.h;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 30 + (i % 5) * 9, y + ((i % 3) - 1) * 6);
        g.stroke();
      }
      g.globalAlpha = 1;
    } else {
      const bands = 14;
      const bw = (bg.w * 2) / bands;
      for (let i = 0; i < bands; i++) {
        g.fillStyle = i % 2 ? '#3f9150' : '#46995a';
        g.fillRect(-bg.w + i * bw, -bg.h, bw + 0.5, bg.h * 2);
      }
      const vg = g.createRadialGradient(0, 0, bg.h * 0.4, 0, 0, bg.w * 1.2);
      vg.addColorStop(0, 'rgba(255,255,255,0.06)');
      vg.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = vg;
      g.fillRect(-bg.w, -bg.h, bg.w * 2, bg.h * 2);
    }
    g.restore();

    // líneas
    const line = ice ? 'rgba(200,40,60,0.8)' : COLORS.line;
    g.lineWidth = 3;
    g.lineCap = 'round';
    if (this.glow && !ice) {
      g.shadowColor = 'rgba(255,255,255,0.45)';
      g.shadowBlur = 6;
    }
    g.strokeStyle = ice ? '#2a3a4d' : line;
    g.stroke(path);
    g.strokeStyle = line;
    g.beginPath();
    g.moveTo(0, -bg.h);
    g.lineTo(0, bg.h);
    g.stroke();
    g.strokeStyle = ice ? 'rgba(40,110,200,0.75)' : line;
    g.beginPath();
    g.arc(0, 0, bg.ko, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = g.strokeStyle;
    g.beginPath();
    g.arc(0, 0, 4, 0, Math.PI * 2);
    g.fill();
    if (ice) {
      g.strokeStyle = 'rgba(200,40,60,0.8)';
      for (const sx of [-1, 1]) {
        const gx = sx * (bg.w - bg.goalLine);
        g.beginPath();
        g.moveTo(gx, -bg.h);
        g.lineTo(gx, bg.h);
        g.stroke();
        g.strokeStyle = 'rgba(40,110,200,0.6)';
        g.beginPath();
        g.moveTo(sx * bg.w * 0.33, -bg.h);
        g.lineTo(sx * bg.w * 0.33, bg.h);
        g.stroke();
        g.strokeStyle = 'rgba(200,40,60,0.8)';
      }
    } else {
      // arcos de esquina y área del arco (decorativos, sin física)
      g.globalAlpha = 0.55;
      const c = bg.corner ? 0 : 1;
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          if (c) {
            g.beginPath();
            g.arc(sx * bg.w, sy * bg.h, 12, sy < 0 ? (sx < 0 ? 0 : Math.PI / 2) : sx < 0 ? -Math.PI / 2 : Math.PI, sy < 0 ? (sx < 0 ? Math.PI / 2 : Math.PI) : sx < 0 ? 0 : -Math.PI / 2);
            g.stroke();
          }
        }
      for (const sx of [-1, 1]) {
        const r = bg.goalY + 26;
        g.beginPath();
        g.arc(sx * bg.w, 0, r, sx < 0 ? -Math.PI / 2 : Math.PI / 2, sx < 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.shadowBlur = 0;

    // redes
    for (const s of st.segments) {
      if (!s.vis || !s.net) continue;
      g.beginPath();
      segPath(g, s);
      g.strokeStyle = ice ? '#33475e' : 'rgba(10,15,28,0.85)';
      g.lineWidth = 2;
      g.stroke();
    }
    for (const gl of st.goals) {
      const dir = gl.team === 2 ? 1 : -1;
      const x = gl.x0;
      const depth = 30;
      g.save();
      g.beginPath();
      g.rect(Math.min(x, x + dir * depth), gl.y0, depth, gl.y1 - gl.y0);
      g.clip();
      g.fillStyle = dir > 0 ? 'rgba(61,139,255,0.18)' : 'rgba(255,75,92,0.18)';
      g.fillRect(x - depth, gl.y0, depth * 2, gl.y1 - gl.y0);
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 1;
      for (let k = -gl.y1; k < gl.y1 + depth * 2; k += 7) {
        g.beginPath();
        g.moveTo(x - depth, k);
        g.lineTo(x + depth, k + depth * 2);
        g.moveTo(x - depth, k + depth * 2);
        g.lineTo(x + depth, k);
        g.stroke();
      }
      g.restore();
      // línea de gol
      g.strokeStyle = dir > 0 ? 'rgba(61,139,255,0.9)' : 'rgba(255,75,92,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, gl.y0);
      g.lineTo(x, gl.y1);
      g.stroke();
    }
    // postes
    for (const p of st.posts) {
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fillStyle = TEAM[p.team];
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = COLORS.ink;
      g.stroke();
      g.beginPath();
      g.arc(p.x - 2, p.y - 2, 2.2, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fill();
    }
  }

  // ------------------------------------------------------------ efectos
  kick(x, y, color) {
    if (this.reduced) return;
    this.fx.push({ k: 'ring', x, y, t: 0, life: 0.28, r0: 12, r1: 34, color });
  }

  post(x, y) {
    if (this.reduced) return;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.push({ k: 'dot', x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, t: 0, life: 0.4, color: '#fff', s: 2 });
    }
  }

  goal(team, x, y) {
    this.flash = 1;
    this.flashColor = TEAM[team];
    if (this.reduced) return;
    this.shake = 1;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 260;
      this.fx.push({ k: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.7 + Math.random() * 0.6, color: i % 3 ? TEAM[team] : '#fff', s: 2 + Math.random() * 3 });
    }
    this.fx.push({ k: 'ring', x, y, t: 0, life: 0.6, r0: 10, r1: 160, color: TEAM[team] });
  }

  // ------------------------------------------------------------ cuadro
  /**
   * @param {Match} m
   * @param {object} v  { alpha, me, focusTeam, offsets: Map, dt, names }
   */
  frame(m, v) {
    const { ctx } = this;
    const st = this.st;
    this.resize();
    const L = this.layout();
    this.drawField(L.z);
    const dt = v.dt;
    const lerp = (d, key) => {
      const a = v.alpha;
      const ox = d.ox ?? d.x;
      const oy = d.oy ?? d.y;
      const off = v.offsets?.get(key);
      return [ox + (d.x - ox) * a + (off ? off[0] : 0), oy + (d.y - oy) * a + (off ? off[1] : 0)];
    };

    // posiciones a dibujar
    const balls = m.balls.map((b, i) => lerp(b.d, 'b' + i));
    const players = m.players.filter((p) => p.d).map((p) => ({ p, pos: lerp(p.d, p.id) }));
    const me = players.find((x) => x.p.id === v.me);

    // cámara: sigue la pelota sin perder de vista a mi jugador
    const cam = this.cam;
    let tx = 0;
    let ty = 0;
    if (L.follow) {
      const [bx, by] = balls[0];
      tx = bx;
      ty = by;
      const hw = L.vw / L.z / 2 - 60;
      const hh = (L.vh - 60) / L.z / 2 - 50;
      if (me) {
        tx = Math.max(me.pos[0] - hw, Math.min(me.pos[0] + hw, tx));
        ty = Math.max(me.pos[1] - hh, Math.min(me.pos[1] + hh, ty));
      }
      const mx = Math.max(0, st.width - L.vw / L.z / 2);
      const my = Math.max(0, st.height - (L.vh - 60) / L.z / 2);
      tx = Math.max(-mx, Math.min(mx, tx));
      ty = Math.max(-my, Math.min(my, ty));
    }
    const k = cam.rot !== L.rot || cam.z !== L.z ? 1 : 1 - Math.exp(-dt * 6);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.z = L.z;
    cam.rot = L.rot;
    // en vertical, mi arco abajo
    const flip = L.rot && v.focusTeam === 2 ? -1 : 1;

    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, this.W, this.H);

    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      const a = this.shake * 7;
      sx = (Math.random() * 2 - 1) * a;
      sy = (Math.random() * 2 - 1) * a;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    // transformación mundo → pantalla
    const z = L.z;
    const cx = this.W / 2 + sx;
    const cy = this.H / 2 + sy + (L.rot ? 0 : 22);
    const toScreen = (x, y) => {
      const dx = (x - cam.x) * z;
      const dy = (y - cam.y) * z;
      return L.rot ? [cx + dy * flip, cy - dx * flip] : [cx + dx, cy + dy];
    };
    this.toScreen = toScreen;
    ctx.save();
    ctx.translate(cx, cy);
    if (L.rot) ctx.rotate(flip > 0 ? -Math.PI / 2 : Math.PI / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(this.field, -st.width, -st.height, st.width * 2, st.height * 2);

    // sombras
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const { p, pos } of players) {
      ctx.beginPath();
      ctx.arc(pos[0] + 3, pos[1] + 4, p.d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    balls.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x + 2.5, y + 3.5, m.balls[i].d.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // estela de la pelota
    balls.forEach(([x, y], i) => {
      const d = m.balls[i].d;
      let tr = this.trails.get(i);
      if (!tr) this.trails.set(i, (tr = []));
      tr.push(x, y);
      if (tr.length > 20) tr.splice(0, 2);
      const sp = Math.hypot(d.vx, d.vy);
      if (sp < 2.2 || this.reduced || tr.length < 6) return;
      ctx.lineCap = 'round';
      for (let j = 2; j < tr.length; j += 2) {
        const a = j / tr.length;
        ctx.strokeStyle = `rgba(255,255,255,${(a * 0.35 * Math.min(1, (sp - 2.2) / 3)).toFixed(3)})`;
        ctx.lineWidth = d.r * 1.6 * a;
        ctx.beginPath();
        ctx.moveTo(tr[j - 2], tr[j - 1]);
        ctx.lineTo(tr[j], tr[j + 1]);
        ctx.stroke();
      }
    });

    // jugadores
    for (const { p, pos } of players) {
      const [x, y] = pos;
      const r = p.d.r;
      const col = TEAM[p.team];
      const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      gr.addColorStop(0, lighten(col));
      gr.addColorStop(1, col);
      if (p.kicking && this.glow) {
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 12;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = p.kicking ? 3 : 2;
      ctx.strokeStyle = p.kicking ? '#ffffff' : COLORS.ink;
      ctx.stroke();
      if (p.id === v.me) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5 + Math.sin(performance.now() / 260) * 0.8, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.stroke();
      }
    }

    // pelotas
    balls.forEach(([x, y], i) => {
      const d = m.balls[i].d;
      const gr = ctx.createRadialGradient(x - d.r * 0.35, y - d.r * 0.4, 1, x, y, d.r);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, i ? ['#fff', '#ffe066', '#9ff3ff'][i] : '#e8ecf5');
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.ink;
      ctx.stroke();
    });

    // efectos
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const e = this.fx[i];
      e.t += dt;
      const a = 1 - e.t / e.life;
      if (a <= 0) {
        this.fx.splice(i, 1);
        continue;
      }
      if (e.k === 'ring') {
        const rr = e.r0 + (e.r1 - e.r0) * (1 - a * a);
        ctx.beginPath();
        ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
        ctx.lineWidth = 3 * a;
        ctx.strokeStyle = withAlpha(e.color, a * 0.8);
        ctx.stroke();
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 1 - dt * 2.5;
        e.vy *= 1 - dt * 2.5;
        ctx.fillStyle = withAlpha(e.color, a);
        ctx.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s);
      }
    }
    ctx.restore();

    // avatares y nombres (en pantalla, siempre derechos)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { p, pos } of players) {
      const [x, y] = toScreen(pos[0], pos[1]);
      const r = p.d.r * z;
      if (p.avatar) {
        ctx.font = `700 ${Math.round(r * 1.05)}px Rubik, system-ui, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.fillText(p.avatar, x, y + 1);
      }
      if (v.names !== false) {
        ctx.font = `600 ${Math.max(10, Math.round(11 * Math.min(1.2, z)))}px Rubik, system-ui, sans-serif`;
        const label = p.name || '';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(5,8,16,0.7)';
        ctx.strokeText(label, x, y + r + 11);
        ctx.fillStyle = p.id === v.me ? '#fff' : 'rgba(255,255,255,0.85)';
        ctx.fillText(label, x, y + r + 11);
      }
    }

    if (this.flash > 0) {
      ctx.fillStyle = withAlpha(this.flashColor, this.flash * 0.28);
      ctx.fillRect(0, 0, this.W, this.H);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
  }
}

function rounded(p, x, y, w, h, r) {
  if (!r) return p.rect(x, y, w, h);
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

/** Traza un segmento recto o curvo (mismo arco que usa la física). */
function segPath(g, s) {
  const { v0, v1 } = s;
  if (!Number.isFinite(s.curveF)) {
    g.moveTo(v0.x, v0.y);
    g.lineTo(v1.x, v1.y);
    return;
  }
  const mx = (v0.x + v1.x) / 2;
  const my = (v0.y + v1.y) / 2;
  let ux = mx - s.cx;
  let uy = my - s.cy;
  let ul = Math.hypot(ux, uy);
  if (ul < 1e-9) {
    ux = -(v1.y - v0.y);
    uy = v1.x - v0.x;
    ul = Math.hypot(ux, uy);
  }
  const sgn = s.curveF > 0 ? 1 : -1;
  const am = Math.atan2((uy / ul) * sgn, (ux / ul) * sgn);
  const a0 = Math.atan2(v0.y - s.cy, v0.x - s.cx);
  const a1 = Math.atan2(v1.y - s.cy, v1.x - s.cx);
  const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const ccw = !(norm(am - a0) < norm(a1 - a0));
  g.moveTo(v0.x, v0.y);
  g.arc(s.cx, s.cy, s.arcR, a0, a1, ccw);
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 60);
  const g = Math.min(255, ((n >> 8) & 255) + 60);
  const b = Math.min(255, (n & 255) + 60);
  return `rgb(${r},${g},${b})`;
}

function withAlpha(hex, a) {
  if (hex[0] !== '#') return hex;
  const n = parseInt(hex.length === 4 ? hex.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3').slice(1) : hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
