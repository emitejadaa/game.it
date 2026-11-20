/**
 * Disimulá — escena three.js.
 *
 * Nada de luces de three: la luz del escenario va horneada por cara (color de vértice =
 * lambert(normal) de shared/maps.js sobre MeshBasicMaterial) y el cuerpo usa un shader
 * propio con la MISMA fórmula. Así el color que calcula el CPU (pipeta, camuflaje,
 * servidor) es exactamente el que se ve. Render en espacio lineal, sin gestión de color.
 */
import * as THREE from '/vendor/three.min.js';
import { PATTERNS, facePattern, faceUv, lambert, LIGHT, getMap } from './shared/maps.js';

const G = window.GameIt;

// caras de una caja: [eje, signo, ejeU, ejeV] con el orden que deja la normal para afuera
const FACES = [
  [0, 1, 1, 2],
  [0, -1, 2, 1],
  [1, 1, 2, 0],
  [1, -1, 0, 2],
  [2, 1, 0, 1],
  [2, -1, 1, 0],
];

const texCache = new Map();
export function patternTexture(patId) {
  if (texCache.has(patId)) return texCache.get(patId);
  const p = PATTERNS[patId];
  const c = document.createElement('canvas');
  c.width = c.height = p.px;
  const g = c.getContext('2d');
  const img = g.createImageData(p.px, p.px);
  for (let j = 0; j < p.px; j++)
    for (let i = 0; i < p.px; i++) {
      const u = ((i + 0.5) / p.px) * p.tile;
      const v = (1 - (j + 0.5) / p.px) * p.tile;
      const col = p.fn(u, v);
      const o = (j * p.px + i) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  texCache.set(patId, tex);
  return tex;
}

/** Arma la geometría del mapa agrupada por patrón, con la luz horneada por vértice. */
function buildMapGroup(map) {
  const buckets = new Map(); // patId → { pos, uv, col, idx }
  const quad = (patId, verts, n, tile) => {
    let b = buckets.get(patId);
    if (!b) buckets.set(patId, (b = { pos: [], uv: [], col: [], idx: [] }));
    const base = b.pos.length / 3;
    const k = lambert(n[0], n[1], n[2]);
    for (const v of verts) {
      b.pos.push(v[0], v[1], v[2]);
      const [u, vv] = faceUv(v[0], v[1], v[2], n[0], n[1], n[2]);
      b.uv.push(u / tile, vv / tile);
      b.col.push(k, k, k);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const box of map.boxes) {
    for (const [axis, sign, ua, va] of FACES) {
      const n = [0, 0, 0];
      n[axis] = sign;
      const pat = facePattern(box, n[1]);
      const fixed = sign > 0 ? box.max[axis] : box.min[axis];
      const mk = (uVal, vVal) => {
        const v = [0, 0, 0];
        v[axis] = fixed;
        v[ua] = uVal;
        v[va] = vVal;
        return v;
      };
      quad(pat.id, [mk(box.min[ua], box.min[va]), mk(box.max[ua], box.min[va]), mk(box.max[ua], box.max[va]), mk(box.min[ua], box.max[va])], n, pat.tile);
    }
  }
  const group = new THREE.Group();
  for (const [patId, b] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.setIndex(b.idx);
    const mat = new THREE.MeshBasicMaterial({ map: patternTexture(patId), vertexColors: true });
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}

/**
 * Shader del cuerpo: color = atlas × intensidad × (ambiente + direccional·N·L) + brillo especular.
 * El brillo y el lustre son atributos por vértice (cada región tiene el suyo): así todo el personaje es UNA malla.
 */
export function bodyMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      glow: { value: 0 },
      time: { value: 0 },
      amb: { value: LIGHT.ambient },
      dir: { value: LIGHT.dir },
      L: { value: new THREE.Vector3(...LIGHT.L) },
    },
    vertexShader: `
      attribute float aBright; attribute float aGloss;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vBright; varying float vGloss;
      void main() {
        vUv = uv;
        vN = normal;
        vBright = aBright; vGloss = aGloss;
        vW = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float glow, time, amb, dir; uniform vec3 L;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vBright; varying float vGloss;
      void main() {
        vec3 n = normalize(vN);
        float k = amb + dir * max(0.0, dot(n, L));
        vec3 col = texture2D(map, vUv).rgb * vBright * k;
        vec3 V = normalize(cameraPosition - vW);
        col += vGloss * 0.4 * pow(max(dot(reflect(-L, n), V), 0.0), 24.0);
        col = mix(col, vec3(1.0, 0.85, 0.3), glow * (0.55 + 0.45 * sin(time * 5.0)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// en celular (puntero táctil) se baja la calidad de entrada: sin suavizado de bordes y menos píxeles; la resolución además se ajusta sola (autoScale)
const MOBILE = matchMedia('(pointer: coarse)').matches;
const MAX_DPR = MOBILE ? 1.25 : 1.75;

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
    this.inset = { x: 0, y: 0 };
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // sin gestión de color: paridad con el CPU
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 90);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.mapGroup = null;
    this.map = null;
    this.fx = [];
    this.pixelScale = 1;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.fpsT = 0;
    this.resize();
  }

  setMap(mapId) {
    this.clearFx();
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      this.mapGroup.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose?.();
      });
      this.mapGroup = null;
    }
    this.map = mapId ? getMap(mapId) : null;
    if (this.map) {
      this.mapGroup = buildMapGroup(this.map);
      this.scene.add(this.mapGroup);
      this.scene.background = new THREE.Color(this.map.sky[0] / 255, this.map.sky[1] / 255, this.map.sky[2] / 255);
    }
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR) * this.pixelScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyInset();
  }

  /**
   * Corre la imagen para que el centro de la escena caiga en el centro del espacio libre cuando un panel tapa un costado (x) o
   * el fondo (y) de la pantalla. Es un view offset de la cámara: los rayos (pintar, atrapar) lo respetan solos.
   */
  setInset(x, y) {
    if (this.inset.x === x && this.inset.y === y) return;
    this.inset = { x, y };
    this.applyInset();
  }

  applyInset() {
    const w = innerWidth;
    const h = innerHeight;
    const { x, y } = this.inset;
    if (x || y) this.camera.setViewOffset(w, h, -x / 2, y / 2, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Baja sola la resolución si caen los FPS (y la devuelve si sobran). */
  autoScale(dt) {
    this.fpsAcc += dt;
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT < 2) return;
    const avg = this.fpsAcc / this.fpsN;
    this.fpsAcc = this.fpsN = this.fpsT = 0;
    if (avg > 1 / 47 && this.pixelScale > 0.55) {
      this.pixelScale = Math.max(0.55, this.pixelScale - 0.15);
      this.resize();
    } else if (avg < 1 / 58 && this.pixelScale < 1) {
      this.pixelScale = Math.min(1, this.pixelScale + 0.1);
      this.resize();
    }
  }

  // ---------------- efectos ----------------
  /** Onda del silbido (también sirve para jugar sin sonido). */
  ripple(x, y, z, color = 0x9fe8ff) {
    const geo = new THREE.RingGeometry(0.22, 0.3, 36);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    this.scene.add(m);
    this.fx.push({ m, t: 0, kind: 'ripple' });
    const m2 = new THREE.Mesh(geo.clone(), mat.clone());
    m2.position.set(x, y, z);
    m2.rotation.x = Math.PI / 2;
    this.scene.add(m2);
    this.fx.push({ m: m2, t: -0.15, kind: 'ripple' });
  }

  /** Marca de los buscadores: un pin que flota unos segundos. */
  markPing(x, y, z, colorHex, ttl = 9) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, depthWrite: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 10), mat);
    cone.rotation.x = Math.PI;
    cone.position.y = 1.15;
    grp.add(cone);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.36, 28), mat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    grp.add(ring);
    grp.position.set(x, y, z);
    this.scene.add(grp);
    this.fx.push({ m: grp, t: 0, kind: 'mark', ttl });
    return grp;
  }

  /** ¡Pop! de color (capturas y pintura). */
  burst(x, y, z, colorHex, n = 16) {
    if (G.prefs.reducedMotion) n = Math.min(6, n);
    const geo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2.4 + 1;
      this.scene.add(m);
      this.fx.push({ m, t: 0, kind: 'spark', vx: Math.cos(a) * (1 + Math.random() * 2), vy: up, vz: Math.sin(a) * (1 + Math.random() * 2) });
    }
  }

  clearFx() {
    for (const f of this.fx) {
      this.scene.remove(f.m);
      f.m.traverse?.((o) => {
        o.geometry?.dispose();
        o.material?.dispose?.();
      });
    }
    this.fx.length = 0;
  }

  update(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      let dead = false;
      if (f.kind === 'ripple') {
        if (f.t > 0) {
          const k = f.t / 1.1;
          f.m.scale.setScalar(1 + k * 9);
          f.m.material.opacity = Math.max(0, 0.9 * (1 - k));
          dead = k >= 1;
        }
      } else if (f.kind === 'spark') {
        f.vy -= 7 * dt;
        f.m.position.x += f.vx * dt;
        f.m.position.y += f.vy * dt;
        f.m.position.z += f.vz * dt;
        f.m.rotation.x += dt * 9;
        f.m.rotation.y += dt * 7;
        dead = f.t > 1.1 || f.m.position.y < -0.5;
      } else if (f.kind === 'mark') {
        f.m.children[0].position.y = 1.15 + Math.sin(f.t * 4) * 0.08;
        f.m.children[0].rotation.y += dt * 2.5;
        const left = f.ttl - f.t;
        if (left < 1) for (const c of f.m.children) c.material.opacity = Math.max(0, left);
        dead = left <= 0;
      }
      if (dead) {
        this.scene.remove(f.m);
        f.m.traverse?.((o) => {
          o.geometry?.dispose();
          if (o.material && o.material.dispose) o.material.dispose();
        });
        this.fx.splice(i, 1);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

/** Vista previa 2D de un mapa (para el selector): cenital con el color medio de cada patrón. */
export function drawMapPreview(canvas, mapId) {
  const map = getMap(mapId);
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const Hh = canvas.height;
  const bb = map.bounds;
  const sx = W / (bb.max[0] - bb.min[0]);
  const sz = Hh / (bb.max[2] - bb.min[2]);
  const avg = (patId) => {
    const p = PATTERNS[patId];
    let r = 0;
    let gg = 0;
    let b = 0;
    for (let i = 0; i < 9; i++) {
      const c = p.fn((i % 3) * p.tile * 0.37, Math.floor(i / 3) * p.tile * 0.41);
      r += c[0];
      gg += c[1];
      b += c[2];
    }
    return `rgb(${(r / 9) | 0},${(gg / 9) | 0},${(b / 9) | 0})`;
  };
  g.fillStyle = `rgb(${map.sky.join(',')})`;
  g.fillRect(0, 0, W, Hh);
  const sorted = [...map.boxes].sort((a, b) => a.max[1] - b.max[1]);
  for (const box of sorted) {
    if (box.min[1] > 2.6) continue; // el techo no tapa la vista
    const pat = typeof box.pat === 'string' ? box.pat : box.pat.top || box.pat.side;
    g.fillStyle = avg(pat);
    g.fillRect((box.min[0] - bb.min[0]) * sx, (box.min[2] - bb.min[2]) * sz, (box.max[0] - box.min[0]) * sx, (box.max[2] - box.min[2]) * sz);
  }
}

export { THREE };
