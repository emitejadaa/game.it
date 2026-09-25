/**
 * Billar — mesa en 3D con three.js, vista desde arriba (cámara ortográfica). Las bolas tienen
 * textura propia (número, franja) y giran según su velocidad angular real, así se ve el efecto.
 * En pantallas verticales la mesa se gira 90°.
 */
import * as THREE from '/vendor/three.min.js';
import { L, W, R, POCKETS } from './shared/physics.js';

export const BALL_COLORS = ['#f6f4ee', '#f5b301', '#1f4fd6', '#e2262d', '#6b2cb8', '#ff7b1c', '#138a45', '#8c1c22', '#131313'];
export const ballColor = (n) => BALL_COLORS[n <= 8 ? n : n - 8];
export const FELTS = {
  blue: ['#1d5f94', '#0f3a5f'],
  green: ['#1f7d4b', '#114a2c'],
  red: ['#93202f', '#5c121c'],
  purple: ['#50309a', '#2f1a5e'],
  teal: ['#0f7c7c', '#084848'],
};
const FRAME = 11; // ancho del marco (cm)
const FELT_Z = 1;
const BALL_Z = FELT_Z + R;
const CUE_Z = 14;

const sx = (x) => x - L / 2;
const sy = (y) => W / 2 - y;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function ballTexture(n) {
  return canvasTex(512, 256, (g, w, h) => {
    const color = ballColor(n);
    const stripe = n >= 9;
    g.fillStyle = stripe || n === 0 ? '#f6f4ee' : color;
    g.fillRect(0, 0, w, h);
    if (stripe) {
      g.fillStyle = color;
      g.fillRect(0, h * 0.27, w, h * 0.46);
    }
    if (n === 0) {
      // puntos discretos para que se note el giro de la blanca
      g.fillStyle = 'rgba(200,40,50,.85)';
      for (const [u, v] of [[0.25, 0.5], [0.75, 0.5], [0, 0.5], [0.5, 0.5]]) {
        g.beginPath();
        g.arc(u * w, v * h, 7, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    for (const u of [0.25, 0.75]) {
      g.fillStyle = '#fbfaf5';
      g.beginPath();
      g.ellipse(u * w, h / 2, 40, 40, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#141414';
      g.font = `800 ${n > 9 ? 42 : 50}px Manrope, Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n), u * w, h / 2 + 2);
      if (n === 6 || n === 9) g.fillRect(u * w - 11, h / 2 + 24, 22, 4);
    }
  });
}

export class Table {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.position.set(0, 0, 500);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-70, 90, 160);
    this.scene.add(sun);
    this.k = 4;
    this.camX = 0;
    this.camY = 0;
    this.portrait = false;
    this.buildTable('blue');
    this.buildBalls();
    this.buildCue();
  }

  // ------------------------------------------------------------ mesa
  buildTable(felt) {
    this.version = (this.version || 0) + 1;
    if (this.table) this.root.remove(this.table);
    const g = new THREE.Group();
    this.table = g;
    const [feltA, feltB] = FELTS[felt] || FELTS.blue;
    this.feltColor = feltA;
    // marco de madera
    const rounded = (x0, y0, x1, y1, r) => {
      const s = new THREE.Shape();
      s.moveTo(x0 + r, y0);
      s.lineTo(x1 - r, y0);
      s.quadraticCurveTo(x1, y0, x1, y0 + r);
      s.lineTo(x1, y1 - r);
      s.quadraticCurveTo(x1, y1, x1 - r, y1);
      s.lineTo(x0 + r, y1);
      s.quadraticCurveTo(x0, y1, x0, y1 - r);
      s.lineTo(x0, y0 + r);
      s.quadraticCurveTo(x0, y0, x0 + r, y0);
      return s;
    };
    const wood = canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#3a2216';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        c.strokeStyle = `rgba(${20 + Math.random() * 40},${10 + Math.random() * 20},5,${0.12 + Math.random() * 0.2})`;
        c.lineWidth = 1 + Math.random() * 3;
        c.beginPath();
        const y = Math.random() * h;
        c.moveTo(0, y);
        c.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 20, w * 0.7, y + (Math.random() - 0.5) * 20, w, y + (Math.random() - 0.5) * 10);
        c.stroke();
      }
    });
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    const halfL = L / 2 + FRAME;
    const halfW = W / 2 + FRAME;
    const glow = new THREE.Mesh(new THREE.ShapeGeometry(rounded(-halfL - 0.9, -halfW - 0.9, halfL + 0.9, halfW + 0.9, 7)), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent || '#00f0ff') }));
    glow.position.z = -2.2;
    this.glowMesh = glow;
    g.add(glow);
    const frameGeo = new THREE.ExtrudeGeometry(rounded(-halfL, -halfW, halfL, halfW, 6), { depth: 2, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.8, bevelSegments: 2 });
    frameGeo.translate(0, 0, -2);
    const uvScale = 1 / 60;
    const pos = frameGeo.attributes.position;
    const uv = frameGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * uvScale, pos.getY(i) * uvScale * 0.25);
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshPhongMaterial({ map: wood, shininess: 40, specular: 0x332211 }));
    g.add(frame);
    // paño
    const feltTex = canvasTex(1024, 512, (c, w, h) => {
      c.fillStyle = feltA;
      c.fillRect(0, 0, w, h);
      const grad = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.62);
      grad.addColorStop(0, 'rgba(255,255,255,.12)');
      grad.addColorStop(1, 'rgba(0,0,0,.28)');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
      // textura del paño
      const img = c.getImageData(0, 0, w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 10;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
      }
      c.putImageData(img, 0, 0);
      // línea de salida y punto de pie
      const px = (x) => ((x + 4) / (L + 8)) * w;
      const py = (y) => ((y + 4) / (W + 8)) * h;
      c.strokeStyle = 'rgba(255,255,255,.14)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(px(L / 4), py(0));
      c.lineTo(px(L / 4), py(W));
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,.3)';
      for (const x of [L / 4, L * 0.73]) {
        c.beginPath();
        c.arc(px(x), py(W / 2), 4, 0, Math.PI * 2);
        c.fill();
      }
    });
    const felt3 = new THREE.Mesh(new THREE.PlaneGeometry(L + 8, W + 8), new THREE.MeshLambertMaterial({ map: feltTex }));
    felt3.position.z = FELT_Z;
    g.add(felt3);
    // bandas (siguen la forma de las mandíbulas de las troneras)
    const C = 6.2;
    const S = 5.4;
    const T = 3.6; // hasta dónde llega la banda (hacia el marco)
    const polys = [
      [[C, 0], [L / 2 - S, 0], [L / 2 - S - 0.9, -T], [C - T, -T]],
      [[L / 2 + S, 0], [L - C, 0], [L - C + T, -T], [L / 2 + S + 0.9, -T]],
      [[C, W], [C - T, W + T], [L / 2 - S - 0.9, W + T], [L / 2 - S, W]],
      [[L / 2 + S, W], [L / 2 + S + 0.9, W + T], [L - C + T, W + T], [L - C, W]],
      [[0, C], [-T, C - T], [-T, W - C + T], [0, W - C]],
      [[L, C], [L, W - C], [L + T, W - C + T], [L + T, C - T]],
    ];
    const cushionMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(feltB), shininess: 8 });
    for (const poly of polys) {
      const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(sx(x), sy(y))));
      const geo = new THREE.ExtrudeGeometry(s, { depth: 1.8, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.6, bevelSegments: 2 });
      geo.translate(0, 0, FELT_Z);
      g.add(new THREE.Mesh(geo, cushionMat));
    }
    // troneras
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x040405 });
    const rimMat = new THREE.MeshPhongMaterial({ color: 0x2c2f36, shininess: 80, specular: 0x888888 });
    POCKETS.forEach(([x, y], i) => {
      const r = i === 1 || i === 4 ? 5.1 : 5.6;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 40), holeMat);
      hole.position.set(sx(x), sy(y), 2.6);
      g.add(hole);
      const rim = new THREE.Mesh(new THREE.RingGeometry(r, r + 1.3, 40), rimMat);
      rim.position.set(sx(x), sy(y), 2.62);
      g.add(rim);
    });
    // marcas (diamantes)
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xe9e2cf });
    const dot = new THREE.CircleGeometry(0.75, 16);
    const put = (x, y) => {
      const m = new THREE.Mesh(dot, dotMat);
      m.position.set(sx(x), sy(y), 0.9);
      g.add(m);
    };
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      put((L / 8) * i, -FRAME / 2 - 1.5);
      put((L / 8) * i, W + FRAME / 2 + 1.5);
    }
    for (let i = 1; i < 4; i++) {
      put(-FRAME / 2 - 1.5, (W / 4) * i);
      put(L + FRAME / 2 + 1.5, (W / 4) * i);
    }
    this.root.add(g);
  }

  setAccent(hex) {
    this.version = (this.version || 0) + 1;
    this.accent = hex;
    this.glowMesh?.material.color.set(hex);
    this.cueRing?.material.color.set(hex);
  }

  // ------------------------------------------------------------ bolas
  buildBalls() {
    const geo = new THREE.SphereGeometry(R, 32, 22);
    const shadowTex = canvasTex(64, 64, (c) => {
      const grad = c.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0,0,0,.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 64);
    });
    const shadowGeo = new THREE.PlaneGeometry(R * 3, R * 3);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    this.balls = [];
    for (let n = 0; n <= 15; n++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: ballTexture(n), shininess: 90, specular: 0x777777 }));
      // orientación inicial al azar para que no se vean todas iguales
      mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      const shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
      this.root.add(shadow);
      this.root.add(mesh);
      this.balls.push({ n, mesh, shadow, fall: null, shown: true });
    }
  }

  /**
   * Ubica las bolas. `balls` es el estado de la física; `dt` (s) para girar según wx, wy, wz.
   * Las embocadas se animan cayendo hacia el centro de la tronera.
   */
  syncBalls(balls, dt, now) {
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3();
    for (const b of balls) {
      const v = this.balls[b.n];
      if (!v) continue;
      const m = v.mesh;
      if (b.on) {
        v.fall = null;
        m.visible = true;
        v.shadow.visible = true;
        m.scale.setScalar(1);
        m.position.set(sx(b.x), sy(b.y), BALL_Z);
        v.shadow.position.set(sx(b.x) + R * 0.45, sy(b.y) - R * 0.45, FELT_Z + 0.05);
        v.shadow.material.opacity = 1;
        // giro real: la reflexión en y cambia el signo de wx y wz
        const wx = -b.wx;
        const wy = b.wy;
        const wz = -b.wz;
        const w = Math.hypot(wx, wy, wz);
        if (w > 1e-4 && dt > 0) {
          axis.set(wx / w, wy / w, wz / w);
          q.setFromAxisAngle(axis, w * dt);
          m.quaternion.premultiply(q);
        }
      } else {
        if (!v.fall && m.visible && b.pocket !== undefined && now !== undefined) v.fall = { t: now, x: m.position.x, y: m.position.y, p: b.pocket };
        if (v.fall) {
          const k = Math.min(1, (now - v.fall.t) / 260);
          const [px, py] = POCKETS[v.fall.p];
          m.position.set(v.fall.x + (sx(px) - v.fall.x) * k, v.fall.y + (sy(py) - v.fall.y) * k, BALL_Z - k * 3.4);
          m.scale.setScalar(1 - k * 0.35);
          v.shadow.material.opacity = 1 - k;
          if (k >= 1) {
            m.visible = false;
            v.shadow.visible = false;
          }
        } else {
          m.visible = false;
          v.shadow.visible = false;
        }
      }
    }
  }

  // ------------------------------------------------------------ taco
  buildCue() {
    const g = new THREE.Group();
    const seg = (r0, r1, len, color, x, opts = {}) => {
      const geo = new THREE.CylinderGeometry(r1, r0, len, 20, 1);
      geo.rotateZ(-Math.PI / 2); // a lo largo de +x
      const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, shininess: opts.shiny ?? 50, specular: 0x444444 }));
      mesh.position.x = x + len / 2;
      g.add(mesh);
      return mesh;
    };
    // la punta queda en x = 0 y el taco se extiende hacia +x (se orienta al revés del tiro)
    seg(0.62, 0.62, 0.9, 0x2e7fd6, 0);
    seg(0.64, 0.66, 2.4, 0xf2efe6, 0.9, { shiny: 90 });
    seg(0.66, 0.95, 88, 0xe7c794, 3.3);
    this.cueRing = seg(0.95, 1.0, 1.4, 0x00f0ff, 91.3, { shiny: 100 });
    seg(1.0, 1.35, 52, 0x2a1810, 92.7, { shiny: 70 });
    seg(1.35, 1.4, 3, 0x111111, 144.7);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(147, 2.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    shadow.position.set(73.5 + 1.6, -1.6, -(CUE_Z - FELT_Z - 0.1));
    g.add(shadow);
    g.position.z = CUE_Z;
    g.visible = false;
    this.cue = g;
    this.root.add(g);
  }

  /** Taco apuntando en la dirección `a` (radianes, en coordenadas de la mesa) y tirado hacia atrás. */
  setCue(visible, x, y, a, pull = 0, alpha = 1) {
    const c = this.cue;
    c.visible = visible;
    if (!visible) return;
    const back = R + 1.2 + pull;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    c.position.x = sx(x - dx * back);
    c.position.y = sy(y - dy * back);
    c.rotation.z = Math.atan2(dy, -dx); // apunta hacia -dirección (en coordenadas de escena y va invertida)
    c.traverse((o) => {
      if (o.material) {
        o.material.transparent = alpha < 1;
        o.material.opacity = o === c.children[c.children.length - 1] ? 0.28 * alpha : alpha;
      }
    });
  }

  // ------------------------------------------------------------ vista
  layout(w, h, area, portrait) {
    this.w = w;
    this.h = h;
    this.portrait = portrait;
    const ow = L + FRAME * 2 + 2;
    const oh = W + FRAME * 2 + 2;
    const tw = portrait ? oh : ow;
    const th = portrait ? ow : oh;
    this.k = Math.min((area.x1 - area.x0) / tw, (area.y1 - area.y0) / th);
    const cx = (area.x0 + area.x1) / 2;
    const cy = (area.y0 + area.y1) / 2;
    this.root.rotation.z = portrait ? -Math.PI / 2 : 0;
    const k = this.k;
    this.camX = (w / 2 - cx) / k;
    this.camY = (cy - h / 2) / k;
    const cam = this.camera;
    cam.left = -w / 2 / k;
    cam.right = w / 2 / k;
    cam.top = h / 2 / k;
    cam.bottom = -h / 2 / k;
    cam.position.set(this.camX, this.camY, 500);
    cam.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.version = (this.version || 0) + 1;
  }

  toScreen(x, y) {
    let X = sx(x);
    let Y = sy(y);
    if (this.portrait) [X, Y] = [Y, -X];
    return [this.w / 2 + (X - this.camX) * this.k, this.h / 2 - (Y - this.camY) * this.k];
  }

  fromScreen(px, py) {
    let X = (px - this.w / 2) / this.k + this.camX;
    let Y = -(py - this.h / 2) / this.k + this.camY;
    if (this.portrait) [X, Y] = [-Y, X];
    return [X + L / 2, W / 2 - Y];
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
