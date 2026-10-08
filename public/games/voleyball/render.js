/**
 * Voleyball — dibujo en canvas 2D, de costado como los mapas de vóley de HaxBall: el piso abajo (si
 * la pelota lo toca es punto), la red al medio con la barrera de los jugadores arriba, las paredes
 * a los costados y cielo abierto arriba: si la pelota se va del mapa, una flecha en el borde de
 * arriba la sigue para que todos sepan por dónde va a bajar.
 * El fondo se pre-dibuja en un canvas aparte (solo cambia al redimensionar); cada cuadro se dibujan
 * las sombras en el piso, la red, los jugadores, la pelota y los efectos. En un celular vertical la
 * cancha se ve más de cerca y la cámara sigue la pelota de costado.
 */
import { stepBall, ballCopy, kickVelocity } from './shared/match.js';

export const COLORS = {
  red: '#ff4b5c',
  redDark: '#b3202f',
  blue: '#3d8bff',
  blueDark: '#1b4fb0',
  ink: '#0a0f1c',
  ball: '#ffffff',
};
const TEAM = [null, COLORS.red, COLORS.blue];
const SKY = 26; // cielo que se ve arriba del borde del mapa
const GROUND = 30; // arena que se ve debajo de la línea del piso
const SIDEM = 10; // margen a los costados de las paredes

const THEMES = {
  classic: { bg: '#0a0f1c', sky: ['#1d4d2b', '#2a6a3a'], stripe: ['#3c8a45', '#46974f'], sand: ['#f3dfa8', '#e0c27f'], line: '#ffffff', wall: '#24542d', post: '#3a4250', stands: true },
  beach: { bg: '#1d1030', sky: ['#ff8f5a', '#ffd7a0'], sea: ['#2b7fb6', '#1f6496'], sand: ['#f7e5b6', '#ebd096'], line: '#fffaf0', wall: 'rgba(255,255,255,0.35)', post: '#5a4636', sun: true },
  turbo: { bg: '#05070f', sky: ['#070b18', '#111a3a'], grid: 'rgba(45,226,230,0.08)', sand: ['#18244e', '#101a3c'], line: '#2de2e6', wall: '#f15bb5', post: '#2de2e6', neon: true },
};

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.field = document.createElement('canvas');
    this.st = null;
    this.cam = { x: 0, z: 1 };
    this.fx = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#fff';
    this.netWob = 0;
    this.trail = [];
    this.spin = 0;
    this.glow = true;
    this.reduced = false;
    this.touch = false; // hay controles táctiles: abajo en vertical, a los costados en horizontal
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

  setCourt(st) {
    if (this.st === st) return;
    this.st = st;
    this.fieldKey = '';
    this.trail.length = 0;
    this.fx.length = 0;
  }

  /**
   * Zoom que entra la cancha entera, con el marcador arriba y los controles táctiles abajo (celular
   * vertical) o a los costados (horizontal). Si así queda muy chica (celular vertical), se acerca y
   * la cámara sigue la pelota de costado.
   */
  layout() {
    const st = this.st;
    const portrait = this.H > this.W;
    const top = 62;
    const bottom = (this.touch && portrait ? 150 : 0) + 6;
    const side = this.touch && !portrait ? 150 : 0;
    const ww = st.cw * 2 + SIDEM * 2;
    const wh = st.height + SKY + GROUND;
    const fitH = (this.H - top - bottom) / wh;
    const fit = Math.min((this.W - 12 - side * 2) / ww, fitH);
    const near = Math.min(fitH, this.W / (st.cw * 1.12));
    const z = Math.max(0.3, fit < 0.8 && near > fit ? near : fit);
    const follow = z * ww > this.W + 1;
    // la cancha queda centrada en el lugar que sobra
    const free = this.H - top - bottom - wh * z;
    const y0 = top + Math.max(0, free) * 0.5 + (SKY + st.height) * z;
    return { z, follow, ww, y0 };
  }

  // ------------------------------------------------------------ fondo pre-dibujado
  drawField(z) {
    const st = this.st;
    const T = THEMES[st.mode] || THEMES.classic;
    const key = `${st.id}:${st.mode}:${z.toFixed(4)}:${this.dpr}:${this.glow}`;
    if (key === this.fieldKey) return;
    this.fieldKey = key;
    const s = z * this.dpr;
    const f = this.field;
    const X0 = -st.cw - SIDEM;
    const Y0 = -st.height - SKY;
    const ww = st.cw * 2 + SIDEM * 2;
    const wh = st.height + SKY + GROUND;
    f.width = Math.ceil(ww * s);
    f.height = Math.ceil(wh * s);
    const g = f.getContext('2d');
    g.setTransform(s, 0, 0, s, -X0 * s, -Y0 * s);
    const W = st.cw;
    const H = st.height;
    // cielo / fondo del estadio
    const sky = g.createLinearGradient(0, Y0, 0, 0);
    sky.addColorStop(0, T.sky[0]);
    sky.addColorStop(1, T.sky[1]);
    g.fillStyle = sky;
    g.fillRect(X0, Y0, ww, wh);
    if (T.stripe) {
      // pasto a rayas como los estadios de HaxBall, con la tribuna arriba del mapa
      const n = Math.ceil(ww / 40);
      for (let i = 0; i < n; i++) {
        g.fillStyle = T.stripe[i % 2];
        g.fillRect(X0 + i * 40, -H, 40, H);
      }
      const band = g.createLinearGradient(0, Y0, 0, -H);
      band.addColorStop(0, '#24314f');
      band.addColorStop(1, '#3b4d78');
      g.fillStyle = band;
      g.fillRect(X0, Y0, ww, SKY);
      const cols = ['#ff4b5c', '#ffd23f', '#3d8bff', '#ffffff', '#2de2e6', '#f15bb5'];
      g.globalAlpha = 0.55;
      for (let x = X0 + 4, i = 0; x < X0 + ww; x += 7, i++) {
        g.fillStyle = cols[(i * 7 + (i >> 2)) % cols.length];
        g.beginPath();
        g.arc(x, Y0 + 8 + ((i * 5) % 3) * 4, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#6b3b22';
      g.fillRect(X0, -H - 4, ww, 4);
    }
    if (T.sun) {
      g.fillStyle = 'rgba(255,240,200,0.85)';
      g.beginPath();
      g.arc(W * 0.55, -H * 0.62, 26, 0, Math.PI * 2);
      g.fill();
      const sea = g.createLinearGradient(0, -H * 0.3, 0, 0);
      sea.addColorStop(0, T.sea[0]);
      sea.addColorStop(1, T.sea[1]);
      g.fillStyle = sea;
      g.fillRect(X0, -H * 0.3, ww, H * 0.3);
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 1.2;
      for (let y = -H * 0.27; y < -6; y += 11)
        for (let x = X0 + ((-y * 7) % 30); x < X0 + ww; x += 46) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 14, y);
          g.stroke();
        }
      // el borde de arriba del mapa
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(X0, -H - 2, ww, 2);
    }
    if (T.grid) {
      g.strokeStyle = T.grid;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= W; x += 30)
        for (const sx of [-1, 1]) {
          g.moveTo(sx * x, -H);
          g.lineTo(sx * x, 0);
        }
      for (let y = -H; y < 0; y += 30) {
        g.moveTo(-W, y);
        g.lineTo(W, y);
      }
      g.stroke();
      g.fillStyle = 'rgba(241,91,181,0.35)';
      g.fillRect(X0, -H - 2, ww, 2);
    }
    // arena (debajo de la línea del piso)
    const sand = g.createLinearGradient(0, 0, 0, GROUND);
    sand.addColorStop(0, T.sand[0]);
    sand.addColorStop(1, T.sand[1]);
    g.fillStyle = sand;
    g.fillRect(X0, 0, ww, GROUND);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < ww * 0.35; i++) {
      const x = X0 + ((i * 97.13) % ww);
      const y = 3 + ((i * 31.7) % (GROUND - 5));
      g.fillRect(x, y, 1.2, 1.2);
    }
    // paredes de los costados (la pelota rebota)
    g.fillStyle = T.wall;
    g.fillRect(X0, Y0, SIDEM, wh);
    g.fillRect(W, Y0, SIDEM, wh);
    if (T.neon && this.glow) {
      g.shadowColor = T.wall;
      g.shadowBlur = 10;
    }
    g.strokeStyle = T.neon ? T.wall : 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-W, Y0);
    g.lineTo(-W, 0);
    g.moveTo(W, Y0);
    g.lineTo(W, 0);
    g.stroke();
    // línea del piso: la que define el punto
    if (T.neon && this.glow) {
      g.shadowColor = T.line;
      g.shadowBlur = 12;
    }
    g.strokeStyle = T.line;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-W, 0);
    g.lineTo(W, 0);
    g.stroke();
    g.shadowBlur = 0;
    // marca del lugar del saque de cada lado
    g.fillStyle = T.neon ? 'rgba(45,226,230,0.5)' : 'rgba(255,255,255,0.55)';
    for (const sx of [-1, 1]) g.fillRect(sx * st.serveX - 9, 3, 18, 3);
    // barrera de arriba de la red (los jugadores no la pasan, la pelota sí)
    g.strokeStyle = T.neon ? 'rgba(45,226,230,0.35)' : 'rgba(255,255,255,0.45)';
    g.lineWidth = 1.5;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(0, -H);
    g.lineTo(0, -st.netH - 4);
    g.stroke();
    g.setLineDash([]);
  }

  // ------------------------------------------------------------ efectos
  hit(x, y, color, kind) {
    if (this.reduced) return;
    const big = kind === 'spike' || kind === 'block' || kind === 'bomb';
    this.fx.push({ k: 'ring', x, y, t: 0, life: big ? 0.38 : 0.26, r0: 8, r1: big ? 46 : 28, color });
    if (big)
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.push({ k: 'dot', x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, t: 0, life: 0.35, color: '#fff', s: 2.5 });
      }
  }

  /** Arena que salta donde pica la pelota. */
  puff(x, y, v, color = null) {
    if (this.reduced) return;
    const n = Math.min(26, 6 + Math.round(v * 3));
    const sand = (THEMES[this.st?.mode] || THEMES.classic).sand[1];
    for (let i = 0; i < n; i++) {
      const a = Math.PI + Math.random() * Math.PI; // para arriba
      const sp = 30 + Math.random() * 45 * Math.min(2, v / 2);
      this.fx.push({ k: 'dot', x, y: -1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 320, t: 0, life: 0.45 + Math.random() * 0.3, color: color && i % 3 === 0 ? color : sand, s: 2 + Math.random() * 2 });
    }
  }

  net(v) {
    this.netWob = Math.min(1, 0.3 + v * 0.15);
  }

  point(team, x, y) {
    this.flash = 1;
    this.flashColor = TEAM[team];
    if (this.reduced) return;
    this.shake = 0.7;
    for (let i = 0; i < 60; i++) {
      const a = Math.PI + Math.random() * Math.PI;
      const v = 60 + Math.random() * 220;
      this.fx.push({ k: 'dot', x, y: Math.min(y, -2), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 380, t: 0, life: 0.8 + Math.random() * 0.6, color: i % 3 ? TEAM[team] : '#fff', s: 2 + Math.random() * 3 });
    }
    this.fx.push({ k: 'ring', x, y: 0, t: 0, life: 0.6, r0: 10, r1: 150, color: TEAM[team], flat: true });
  }

  // ------------------------------------------------------------ cuadro
  /**
   * @param {Match} m
   * @param {object} v  { alpha, me, offsets: Map, dt, names, aimFor }
   */
  frame(m, v) {
    const { ctx } = this;
    const st = this.st;
    this.resize();
    const L = this.layout();
    this.drawField(L.z);
    const dt = v.dt;
    const T = THEMES[st.mode] || THEMES.classic;
    const a = v.alpha;
    const lerp = (o, n) => (o === undefined ? n : o + (n - o) * a);
    const off = (key) => v.offsets?.get(key);

    // posiciones a dibujar (interpoladas entre ticks y suavizadas online)
    const b = m.ball;
    const bo = off('b');
    const ball = { x: lerp(b.ox, b.x) + (bo ? bo[0] : 0), y: lerp(b.oy, b.y) + (bo ? bo[1] : 0) };
    const players = m.players
      .filter((p) => p.d)
      .map((p) => {
        const o = off(p.id);
        return { p, x: lerp(p.d.ox, p.d.x) + (o ? o[0] : 0), y: lerp(p.d.oy, p.d.y) + (o ? o[1] : 0) };
      });
    const me = players.find((q) => q.p.id === v.me);

    // cámara: solo de costado y solo si la cancha no entra; sigue la pelota sin perder a mi jugador
    const z = L.z;
    const cam = this.cam;
    let tx = 0;
    if (L.follow) {
      const half = this.W / z / 2;
      tx = ball.x;
      if (me) tx = Math.max(me.x - half + 40, Math.min(me.x + half - 40, tx));
      const mx = Math.max(0, L.ww / 2 - half);
      tx = Math.max(-mx, Math.min(mx, tx));
    }
    const kc = cam.z !== z ? 1 : 1 - Math.exp(-dt * 5);
    cam.x += (tx - cam.x) * kc;
    cam.z = z;

    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, this.W, this.H);

    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      const amp = this.shake * 6;
      sx = (Math.random() * 2 - 1) * amp;
      sy = (Math.random() * 2 - 1) * amp;
      this.shake = Math.max(0, this.shake - dt * 2.4);
    }
    const cx = this.W / 2 + sx;
    const cy = L.y0 + sy;
    const toScreen = (x, y) => [cx + (x - cam.x) * z, cy + y * z];
    this.toScreen = toScreen;

    // fondo
    const [fx0, fy0] = toScreen(-st.cw - SIDEM, -st.height - SKY);
    ctx.drawImage(this.field, fx0, fy0, L.ww * z, (st.height + SKY + GROUND) * z);

    // sombras en el piso (la de la pelota ayuda a ver dónde va a caer)
    for (const q of players) {
      const [x] = toScreen(q.x, 0);
      const k = Math.max(0.35, 1 + q.y / 260);
      ctx.fillStyle = `rgba(0,0,0,${(0.18 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, cy + 2 * z, q.p.d.r * z * k, 3.2 * z * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (b.live) {
      const [x] = toScreen(ball.x, 0);
      const k = Math.max(0.3, 1 + ball.y / 320);
      ctx.fillStyle = `rgba(0,0,0,${(0.38 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, cy + 2 * z, b.r * z * (0.6 + k * 0.6), 3 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawNet(st, toScreen, z, T);

    // saque: por dónde sale la pelota si le pega ahora (solo para el que saca)
    if (m.state === 0 && v.aimFor && m.server === v.aimFor) {
      const sp = m.player(v.aimFor);
      if (sp?.d) this.drawServeAim(m, sp, toScreen, z);
    }

    for (const q of players) this.drawPlayer(q, v, toScreen, z);
    this.drawBall(m, ball, toScreen, z, dt);

    // efectos
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const e = this.fx[i];
      e.t += dt;
      const al = 1 - e.t / e.life;
      if (al <= 0) {
        this.fx.splice(i, 1);
        continue;
      }
      if (e.k === 'ring') {
        const [x, y] = toScreen(e.x, e.y);
        const rr = (e.r0 + (e.r1 - e.r0) * (1 - al * al)) * z;
        ctx.beginPath();
        if (e.flat) ctx.ellipse(x, y, rr, rr * 0.18, 0, 0, Math.PI * 2);
        else ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.lineWidth = 3 * al;
        ctx.strokeStyle = withAlpha(e.color, al * 0.85);
        ctx.stroke();
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 1 - dt * 1.5;
        if (e.g) e.vy += e.g * dt;
        else e.vy *= 1 - dt * 1.5;
        if (e.g && e.y > 0) {
          e.y = 0;
          e.vy *= -0.3;
        }
        const [x, y] = toScreen(e.x, e.y);
        ctx.fillStyle = withAlpha(e.color, al);
        const s = e.s * Math.max(0.6, z);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }

    // nombres
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (v.names !== false)
      for (const q of players) {
        const [x, y] = toScreen(q.x, q.y);
        const r = q.p.d.r * z;
        ctx.font = `600 ${Math.max(10, Math.round(11 * Math.min(1.2, z)))}px Rubik, system-ui, sans-serif`;
        const label = q.p.name || '';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(5,8,16,0.7)';
        ctx.strokeText(label, x, y + r + 10);
        ctx.fillStyle = q.p.id === v.me ? '#fff' : 'rgba(255,255,255,0.86)';
        ctx.fillText(label, x, y + r + 10);
      }

    if (this.flash > 0) {
      ctx.fillStyle = withAlpha(this.flashColor, this.flash * 0.22);
      ctx.fillRect(0, 0, this.W, this.H);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
    if (this.netWob > 0) this.netWob = Math.max(0, this.netWob - dt * 2.2);
  }

  drawNet(st, toScreen, z, T) {
    const { ctx } = this;
    const wob = this.netWob > 0 && !this.reduced ? Math.sin(performance.now() / 28) * this.netWob * 2.5 * z : 0;
    const [x, y0] = toScreen(0, 0);
    const [, y1] = toScreen(0, -st.netH);
    const w = Math.max(5, 7 * z);
    // malla: franja cuadriculada con la cinta blanca arriba
    ctx.save();
    ctx.translate(wob, 0);
    ctx.fillStyle = T.neon ? 'rgba(45,226,230,0.12)' : 'rgba(20,24,34,0.28)';
    ctx.fillRect(x - w / 2, y1, w, y0 - y1);
    ctx.strokeStyle = T.neon ? 'rgba(45,226,230,0.55)' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(4, 6 * z);
    for (let y = y1 + step; y < y0; y += step) {
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x + w / 2, y);
    }
    ctx.stroke();
    ctx.restore();
    // palo y cinta
    ctx.fillStyle = T.post;
    ctx.fillRect(x - 1.5 * z, y1, 3 * z, y0 - y1);
    if (T.neon && this.glow) {
      ctx.shadowColor = T.line;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = T.neon ? T.line : '#ffffff';
    ctx.fillRect(x - w / 2 - 1 + wob, y1 - 2 * z, w + 2, 4 * z);
    ctx.shadowBlur = 0;
    ctx.fillStyle = T.post;
    ctx.fillRect(x - 6 * z, y0 - 1, 12 * z, 3 * z);
  }

  /** Trayectoria que tendría el saque si le pega ahora desde donde está. */
  drawServeAim(m, sp, toScreen, z) {
    const { ctx } = this;
    const b = m.ball;
    const d = sp.d;
    const dx = b.x - d.x;
    const dy = b.y - d.y;
    const l = Math.hypot(dx, dy);
    const R = d.r + b.r + m.st.kick.range;
    if (l > R * 2.2) return;
    const c = ballCopy(b);
    [c.vx, c.vy] = l > 0.5 ? kickVelocity(m.st, 0, 0, dx / l, dy / l, d.vx, d.vy, true) : [0, -5];
    ctx.fillStyle = l <= R ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 70; i++) {
      const h = stepBall(c, m.st);
      if (h & 3) break;
      if (i % 4) continue;
      const [x, y] = toScreen(c.x, c.y);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.4, 2.2 * z * (1 - i / 90)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPlayer(q, v, toScreen, z) {
    const { ctx } = this;
    const { p } = q;
    const [x, y] = toScreen(q.x, q.y);
    const r = p.d.r * z;
    const col = TEAM[p.team];
    const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, lighten(col));
    gr.addColorStop(1, col);
    if (p.kicking && this.glow) {
      ctx.shadowColor = 'rgba(255,255,255,0.85)';
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.shadowBlur = 0;
    // borde blanco mientras tiene el golpe armado, como la patada de HaxBall
    ctx.lineWidth = p.kicking ? 3 : 2;
    ctx.strokeStyle = p.kicking ? '#ffffff' : COLORS.ink;
    ctx.stroke();
    if (p.id === v.me) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5 + Math.sin(performance.now() / 260) * 0.8, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.stroke();
    }
    if (p.avatar) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(r * 1.05)}px Rubik, system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(p.avatar, x, y + 1);
    }
  }

  drawBall(m, ball, toScreen, z, dt) {
    const { ctx } = this;
    const b = m.ball;
    const [x, y] = toScreen(ball.x, ball.y);
    const r = b.r * z;
    const tt = m.state === 1 ? m.sideTeam : 0;
    const n = m.state === 1 ? m.sideTouches : 0;
    const edge = n ? TEAM[tt] : COLORS.ink;
    // arriba del mapa (cielo abierto): desaparece y una flecha en el borde de arriba la sigue de
    // costado, más chica cuanto más alto está
    const top = toScreen(0, -this.st.height)[1] + 3;
    if (y + r < top - 3) {
      const far = Math.min(1, (top - y) / (260 * z));
      const s = 1 - far * 0.45;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.moveTo(x, top - 1);
      ctx.lineTo(x - 9 * s, top + 12 * s);
      ctx.lineTo(x + 9 * s, top + 12 * s);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = edge;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, top + 21 * s, 5.5 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.stroke();
      this.trail.length = 0;
      return;
    }
    // estela cuando va rápido (remates)
    const sp = Math.hypot(b.vx, b.vy);
    const tr = this.trail;
    tr.push(x, y);
    if (tr.length > 18) tr.splice(0, 2);
    if (sp > 5.5 && !this.reduced && tr.length >= 6) {
      ctx.lineCap = 'round';
      for (let j = 2; j < tr.length; j += 2) {
        const al = j / tr.length;
        ctx.strokeStyle = `rgba(255,255,255,${(al * 0.4 * Math.min(1, (sp - 5.5) / 3)).toFixed(3)})`;
        ctx.lineWidth = r * 1.5 * al;
        ctx.beginPath();
        ctx.moveTo(tr[j - 2], tr[j - 1]);
        ctx.lineTo(tr[j], tr[j + 1]);
        ctx.stroke();
      }
    }
    // pelota de vóley: blanca con gajos amarillos y azules que giran según avanza
    this.spin += (b.vx >= 0 ? 1 : -1) * Math.hypot(b.vx, b.vy) * dt * 0.9;
    const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#e3e8f2');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.lineWidth = r * 0.42;
    const rot = this.spin;
    const cols = ['#ffd23f', '#2f6fe0', '#ffd23f'];
    for (let i = 0; i < 3; i++) {
      const ang = rot + (i * Math.PI * 2) / 3;
      ctx.strokeStyle = cols[i];
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * r * 1.05, y + Math.sin(ang) * r * 1.05, r * 0.95, ang + Math.PI * 0.62, ang + Math.PI * 1.38);
      ctx.stroke();
    }
    ctx.restore();
    // borde del color del equipo que la tiene (del lado en que está, si ya la tocó)
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // toques que lleva ese equipo (puntitos arriba de la pelota)
    if (n > 0 && n <= 3) {
      const dy = y - r - 7;
      for (let i = 0; i < 3; i++) {
        const dx = x + (i - 1) * 7;
        ctx.beginPath();
        ctx.arc(dx, dy, 2.6, 0, Math.PI * 2);
        if (i < n) {
          ctx.fillStyle = TEAM[tt];
          ctx.fill();
        }
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
      }
    }
  }
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 60);
  const g = Math.min(255, ((n >> 8) & 255) + 60);
  const b = Math.min(255, (n & 255) + 60);
  return `rgb(${r},${g},${b})`;
}

function withAlpha(hex, a) {
  if (hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
