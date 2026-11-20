/**
 * Disimulá — el maniquí en pantalla.
 *
 * Es UNA sola malla por personaje: las posiciones y las normales salen de shared/body.js (`skinBody`, la misma
 * geometría y las mismas UVs que usa el CPU) y se recalculan cuando cambia la pose o la animación. La piel es
 * continua entre los huesos, así que no hay tubos abiertos ni piezas sueltas al doblar el cuerpo. La pintura es
 * una CanvasTexture del atlas 128×128 (como mucho una subida por cuadro).
 *
 * Capas de movimiento (todas solo visuales, nada de esto viaja por la red):
 *   pose elegida (con transición suave al cambiar) + ajuste fino de articulaciones
 *   + respiración / ojeada en reposo + ciclo de caminata + sorpresa al ser atrapado.
 */
import { THREE, bodyMaterial } from './world.js';
import { ATLAS, BASE_COLOR, POSES, MAT_REGIONS, transforms, headPos, bodyMesh, skinBody, blendPose, sectionAtY } from './shared/body.js';

const G = window.GameIt;

function nameTexture(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(8,8,14,.72)';
  g.beginPath();
  g.roundRect(8, 10, 240, 44, 22);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(34, 32, 12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '700 26px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(name.slice(0, 14), 56, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// cuánto camina cada pose cuando el jugador se mueve (acostado o sentado no mueve las piernas)
const WALK_AMOUNT = { stand: 1, wall: 1, star: 0.6, crouch: 0.45, sit: 0, lie: 0 };
const POSE_SECONDS = 0.34; // lo que tarda en pasar de una pose a otra
const ease = (t) => t * t * (3 - 2 * t);

// geometría compartida entre todos los avatares: índices y UVs; cada uno tiene sus propias posiciones y normales
const MOBILE = matchMedia('(pointer: coarse)').matches; // en celular, la malla liviana
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const m = bodyMesh(MOBILE ? 0 : 1);
  SHARED = { m, uv: new THREE.BufferAttribute(m.uv, 2), index: new THREE.BufferAttribute(m.idx, 1) };
  return SHARED;
}

// ojos y cinta de la cabeza: se apoyan sobre la superficie real de la cabeza (los perfiles son los del cuerpo)
const EYE = { x: 0.068, y: 0.235 };
const BAND_Y = 0.29;

/** Cinta alrededor de la cabeza (la lleva el buscador, con el color del jugador): sigue la forma de la cabeza. */
function bandGeometry() {
  const sec = sectionAtY('head', BAND_Y);
  const rx = sec.rx + 0.003;
  const rz = sec.rz + 0.003;
  const SEG = 40;
  const SIDES = 10;
  const tn = 0.008; // espesor hacia afuera
  const ty = 0.024; // medio alto
  const pos = [];
  const idx = [];
  for (let i = 0; i <= SEG; i++) {
    const th = (i / SEG) * Math.PI * 2;
    const nx0 = Math.sin(th) / rx;
    const nz0 = Math.cos(th) / rz;
    const l = Math.hypot(nx0, nz0);
    const nx = nx0 / l;
    const nz = nz0 / l;
    const cx = rx * Math.sin(th);
    const cz = sec.cz + rz * Math.cos(th);
    for (let j = 0; j < SIDES; j++) {
      const ps = (j / SIDES) * Math.PI * 2;
      pos.push(cx + nx * tn * Math.cos(ps), BAND_Y + ty * Math.sin(ps), cz + nz * tn * Math.cos(ps));
    }
  }
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      const c = (i + 1) * SIDES + j;
      const d = (i + 1) * SIDES + ((j + 1) % SIDES);
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Avatar {
  constructor(world, { name = '', color = '#3ec1ff', seeker = false } = {}) {
    this.world = world;
    this.group = new THREE.Group();
    this.state = { pos: [0, 0, 0], yaw: 0, pose: 'stand', joints: [0, 0, 0, 0, 0, 0] };
    this.color = color;
    this.walkPhase = 0;
    this.speed = 0;
    this.moveK = 0; // 0 quieto → 1 caminando (suavizado, para que arranque y frene sin saltos)
    this.t = Math.random() * 20; // fase propia de la respiración
    this.idleT = 0; // la respiración se recalcula a ~14 Hz, no en cada cuadro
    this.blinkAt = 1 + Math.random() * 3;
    this.blinkT = 0;
    this.surpriseT = 0;
    this.dirtyPaint = true;
    this.needsPose = true;
    // transición entre poses
    this.shownPose = null;
    this.fromDef = null;
    this.blendT = 1;
    this.anim = null;

    // atlas de pintura → textura
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(ATLAS, ATLAS);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.paintData = null; // Uint8ClampedArray RGBA del atlas (alfa 0 = blanco de base)

    // el cuerpo: una malla, un material
    const sh = shared();
    this.mesh = sh.m;
    this.pos = new Float32Array(sh.m.n * 3);
    this.nor = new Float32Array(sh.m.n * 3);
    this.bright = new Float32Array(sh.m.n).fill(1);
    this.gloss = new Float32Array(sh.m.n);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.norAttr = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.brightAttr = new THREE.BufferAttribute(this.bright, 1);
    this.glossAttr = new THREE.BufferAttribute(this.gloss, 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.norAttr);
    geo.setAttribute('uv', sh.uv);
    geo.setAttribute('aBright', this.brightAttr);
    geo.setAttribute('aGloss', this.glossAttr);
    geo.setIndex(sh.index);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2); // se mueve con el personaje (ver refresh)
    this.body = new THREE.Mesh(geo, bodyMaterial(this.tex));
    this.body.frustumCulled = false;
    this.body.userData.isBody = true;
    this.meshes = [this.body]; // para los rayos (pintar y atrapar): salen de la malla ya deformada
    this.group.add(this.body);

    // ojos: bolas blancas achatadas con pupila, apoyadas en la cara y un poco hundidas (parte del cuerpo, no pegadas)
    const face = sectionAtY('head', EYE.y);
    const eyeZ = face.cz + face.rz * Math.sqrt(Math.max(0, 1 - (EYE.x / face.rx) ** 2));
    this.eyes = new THREE.Group();
    const eyeGeo = new THREE.SphereGeometry(0.042, 14, 10);
    const pupGeo = new THREE.SphereGeometry(0.0195, 10, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupMat = new THREE.MeshBasicMaterial({ color: 0x15151c });
    for (const sx of [-1, 1]) {
      const e = new THREE.Group();
      const ball = new THREE.Mesh(eyeGeo, eyeMat);
      ball.scale.z = 0.5;
      const pup = new THREE.Mesh(pupGeo, pupMat);
      pup.position.z = 0.019;
      pup.scale.z = 0.6;
      e.add(ball, pup);
      e.position.set(sx * EYE.x, EYE.y, eyeZ - 0.006);
      e.rotation.y = sx * 0.3; // sigue la curva de la cara
      this.eyes.add(e);
    }
    this.group.add(this.eyes);
    this.eyes.matrixAutoUpdate = false;

    // cinta del buscador (lleva el color del jugador) + cartel con el nombre
    this.band = new THREE.Mesh(bandGeometry(), new THREE.MeshBasicMaterial({ color }));
    this.band.matrixAutoUpdate = false;
    this.group.add(this.band);
    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name || ' ', color), depthTest: true, transparent: true }));
    this.nameSprite.scale.set(1.15, 0.29, 1);
    this.group.add(this.nameSprite);

    // sombra falsa
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d');
    const grad = sg.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0,0,0,.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(sc);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);

    this.setSeeker(seeker);
    this.setName(name, color);
    world.scene.add(this.group);
    this.flushPaint();
    this.refresh();
  }

  setName(name, color) {
    this.name = name;
    if (color) this.color = color;
    this.nameSprite.material.map?.dispose();
    this.nameSprite.material.map = nameTexture(name || ' ', this.color);
    this.band.material.color.set(this.color);
  }

  setSeeker(on) {
    this.seeker = on;
    this.band.visible = on;
    this.nameSprite.visible = on;
  }

  showName(on) {
    this.nameSprite.visible = on;
  }

  setState(partial) {
    Object.assign(this.state, partial);
    this.needsPose = true;
  }

  /** Marca el atlas para subirlo a la GPU (hasta una vez por cuadro). */
  setPaint(data) {
    this.paintData = data;
    this.dirtyPaint = true;
  }

  /** Brillo y lustre por región (cada vértice sabe a cuál pertenece). */
  setMats(mats) {
    this.mats = mats;
    const m = this.mesh;
    const perRegion = MAT_REGIONS.map((r) => [mats?.[r]?.bright ?? 1, mats?.[r]?.gloss ?? 0]);
    for (let k = 0; k < m.n; k++) {
      const r = perRegion[m.mat[k]];
      this.bright[k] = r[0];
      this.gloss[k] = r[1];
    }
    this.brightAttr.needsUpdate = true;
    this.glossAttr.needsUpdate = true;
  }

  highlight(on) {
    this.glow = on;
    if (!on) this.body.material.uniforms.glow.value = 0;
  }

  /** ¡Te encontraron!: levanta los brazos de golpe, se echa para atrás y los ojos se agrandan. */
  surprise() {
    this.surpriseT = 0.95;
  }

  flushPaint() {
    const d = this.img.data;
    const p = this.paintData;
    for (let i = 0; i < ATLAS * ATLAS; i++) {
      const o = i * 4;
      if (p && p[o + 3]) {
        d[o] = p[o];
        d[o + 1] = p[o + 1];
        d[o + 2] = p[o + 2];
      } else {
        d[o] = BASE_COLOR[0];
        d[o + 1] = BASE_COLOR[1];
        d[o + 2] = BASE_COLOR[2];
      }
      d[o + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.tex.needsUpdate = true;
    this.dirtyPaint = false;
  }

  /** La pose que se está mostrando: la elegida, o la mezcla con la anterior mientras dura la transición. */
  currentPoseDef() {
    const target = POSES[this.state.pose] || POSES.stand;
    if (this.shownPose !== this.state.pose) {
      // cambió la pose: arranca desde lo que se estaba viendo (si ya había otra transición en curso, desde ahí)
      this.fromDef = this.shownPose === null ? null : this.blendT < 1 ? blendPose(this.fromDef, POSES[this.shownPose] || POSES.stand, ease(this.blendT)) : POSES[this.shownPose] || POSES.stand;
      this.shownPose = this.state.pose;
      this.blendT = this.fromDef && !G.prefs.reducedMotion ? 0 : 1;
    }
    return this.blendT >= 1 || !this.fromDef ? target : blendPose(this.fromDef, target, ease(this.blendT));
  }

  refresh() {
    const st = { ...this.state, poseDef: this.currentPoseDef(), anim: this.anim };
    skinBody(this.mesh, st, this.pos, this.nor);
    this.posAttr.needsUpdate = true;
    this.norAttr.needsUpdate = true;
    const bs = this.body.geometry.boundingSphere;
    bs.center.set(this.state.pos[0], this.state.pos[1] + 0.9, this.state.pos[2]);
    bs.radius = 1.8;
    const tf = transforms(st);
    const head = tf.bones[2];
    const hm = head.m;
    for (const node of [this.eyes, this.band]) node.matrix.set(hm[0], hm[1], hm[2], head.p[0], hm[3], hm[4], hm[5], head.p[1], hm[6], hm[7], hm[8], head.p[2], 0, 0, 0, 1);
    const hp = headPos(this.state);
    this.nameSprite.position.set(hp[0], hp[1] + 0.5, hp[2]);
    const pose = POSES[this.state.pose] || POSES.stand;
    this.shadow.position.set(this.state.pos[0], this.state.pos[1] + 0.015, this.state.pos[2]);
    const sw = pose.hitR * 2.4;
    this.shadow.scale.set(sw, sw, 1);
    this.needsPose = false;
  }

  /** Por cuadro: transición de pose, respiración, caminata, sorpresa, parpadeo y subida de la pintura. */
  update(dt, time) {
    const calm = G.prefs.reducedMotion; // con "reducir movimiento" no hay respiración ni vaivén: solo lo necesario
    this.t += dt;
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / POSE_SECONDS);
      this.needsPose = true;
    }
    const walking = this.speed > 0.2;
    this.moveK += ((walking ? 1 : 0) - this.moveK) * Math.min(1, dt * 9);
    if (walking) this.walkPhase += dt * Math.min(this.speed, 7) * 2.7;
    if (this.surpriseT > 0) this.surpriseT = Math.max(0, this.surpriseT - dt);
    // lo que se mueve de verdad se recalcula en cada cuadro; la respiración, a ~14 Hz (no se nota y ahorra mucho en las partidas de 10)
    this.idleT += dt;
    if (walking || this.moveK > 0.02 || this.surpriseT > 0 || this.blendT < 1 || this.idleT >= 1 / 14) {
      this.idleT = 0;
      const anim = this.layers(calm);
      if (anim || this.anim) {
        this.anim = anim;
        this.needsPose = true;
      }
    }

    // ojos
    if (this.surpriseT > 0) {
      const k = 1 + Math.max(0, this.surpriseT - 0.5) * 2.4;
      for (const e of this.eyes.children) e.scale.set(k, k, k);
    } else {
      // parpadeo
      this.blinkT += dt;
      if (this.blinkT > this.blinkAt) {
        this.blinkT = 0;
        this.blinkAt = 1.6 + Math.random() * 3.4;
      }
      const b = this.blinkT < 0.13 ? Math.max(0.12, Math.abs(this.blinkT / 0.065 - 1)) : 1;
      for (const e of this.eyes.children) e.scale.set(1, b, 1);
    }
    if (this.glow) {
      this.body.material.uniforms.glow.value = 0.4;
      this.body.material.uniforms.time.value = time;
    }
    // detrás de la cámara no hay nada que ver: no se deforma la malla hasta que vuelva a quedar a la vista
    if (this.needsPose && !this.behindCamera()) this.refresh();
    if (this.dirtyPaint) this.flushPaint();
  }

  behindCamera() {
    const e = this.world.camera.matrixWorld.elements;
    const dx = this.state.pos[0] - e[12];
    const dy = this.state.pos[1] + 0.9 - e[13];
    const dz = this.state.pos[2] - e[14];
    return -(dx * e[8] + dy * e[9] + dz * e[10]) < -1.8; // el cuerpo mide ~2 m: con esa holgura nunca se corta a la vista
  }

  /** Suma las capas de movimiento (respiración + caminata + sorpresa). Devuelve null si no hay nada que animar. */
  layers(calm) {
    const A = {};
    const add = (bone, rx = 0, ry = 0, rz = 0) => {
      const a = (A[bone] ||= [0, 0, 0]);
      a[0] += rx;
      a[1] += ry;
      a[2] += rz;
    };
    let any = false;
    const lerpK = this.moveK;

    // respiración y ojeada: casi imperceptibles, igual para todos (no delatan a nadie)
    if (!calm) {
      const br = Math.sin(this.t * 1.7);
      const sway = Math.sin(this.t * 0.6) * Math.sin(this.t * 0.23);
      const idle = 1 - lerpK;
      add('torso', br * 0.012 * idle);
      add('head', -br * 0.008 * idle, sway * 0.09 * idle);
      add('uarmL', 0, 0, br * 0.01 * idle);
      add('uarmR', 0, 0, -br * 0.01 * idle);
      any = true;
    }

    // ciclo de caminata: piernas, rodillas, tobillos, brazos, cadera y torso en contrafase.
    // Con "reducir movimiento" camina más suave y sin rebote ni giros: es información de juego, no adorno.
    const amt = (WALK_AMOUNT[this.state.pose] ?? 0) * lerpK * (calm ? 0.55 : 1);
    if (amt > 0.01) {
      const f = this.walkPhase;
      const s = Math.sin(f);
      const c = Math.cos(f);
      const swing = 0.62 * amt;
      const knee = 1.05 * amt;
      add('thighL', -swing * s);
      add('thighR', swing * s);
      add('shinL', knee * Math.max(0, c));
      add('shinR', knee * Math.max(0, -c));
      add('footL', swing * s * 0.7 - knee * Math.max(0, c) * 0.35);
      add('footR', -swing * s * 0.7 - knee * Math.max(0, -c) * 0.35);
      add('uarmL', 0.5 * amt * s, 0, 0);
      add('uarmR', -0.5 * amt * s, 0, 0);
      add('foreL', -(0.18 + 0.32 * Math.max(0, -s)) * amt);
      add('foreR', -(0.18 + 0.32 * Math.max(0, s)) * amt);
      if (!calm) {
        add('torso', 0.04 * amt, -0.14 * amt * s, 0.025 * amt * c);
        add('head', 0, 0.14 * amt * s, -0.025 * amt * c);
        A.root = [0, 0.1 * amt * s, 0.03 * amt * c];
        A._y = 0.022 * amt * (Math.cos(2 * f) - 1);
      }
      any = true;
    }

    // sorpresa: brazos arriba de golpe, cabeza para atrás, un saltito
    if (this.surpriseT > 0) {
      const k = ease(Math.min(1, (0.95 - this.surpriseT) / 0.16)) * (this.surpriseT > 0.25 ? 1 : this.surpriseT / 0.25);
      add('uarmL', -0.25 * k, 0, -2.3 * k);
      add('uarmR', -0.25 * k, 0, 2.3 * k);
      add('foreL', -0.5 * k);
      add('foreR', -0.5 * k);
      add('head', -0.32 * k);
      add('torso', -0.12 * k);
      add('thighL', 0, 0, 0.12 * k);
      add('thighR', 0, 0, -0.12 * k);
      A._y = (A._y || 0) + 0.05 * k;
      any = true;
    }
    return any ? A : null;
  }

  dispose() {
    this.world.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o === this.body) {
        // los índices y las UVs son compartidos entre todos los avatares: solo se liberan los buffers propios
        o.geometry.dispose?.();
        o.material.dispose();
        return;
      }
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose?.();
        o.material.dispose?.();
      }
    });
    this.tex.dispose();
  }
}
