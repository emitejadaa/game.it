/* Aim Trainer 3D — game.it
 * Primera persona con pistola, 3 modos de comportamiento de objetivos:
 *  - Grilla: varios objetivos quietos; al acertar aparece otro en otro lugar.
 *  - Rastreo: un objetivo que se mueve de forma impredecible; mantené la mira encima con el clic apretado.
 *  - Reflejos: aparece uno por vez, se achica y desaparece; medí tu tiempo de reacción.
 * Cada ronda se configura (tiempo, dificultad, velocidad, tamaño, cantidad, color, sensibilidad, FOV…)
 * y al terminar muestra estadísticas y vuelve a la configuración.
 */
import * as THREE from '/vendor/three.min.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];

const TXT = {
  tagline: { es: 'Entrená puntería en 3D. Configurá cada ronda.', en: 'Train your aim in 3D. Configure every round.' },
  grid: { es: 'Grilla', en: 'Gridshot' },
  gridD: { es: 'Varios objetivos quietos. Velocidad y precisión.', en: 'Several static targets. Speed and precision.' },
  track: { es: 'Rastreo', en: 'Tracking' },
  trackD: { es: 'Un objetivo esquivo. Mantené la mira encima.', en: 'One evasive target. Keep your crosshair on it.' },
  flick: { es: 'Reflejos', en: 'Reflex' },
  flickD: { es: 'Aparecen de a uno y se achican. Reaccioná rápido.', en: 'One at a time, shrinking. React fast.' },
  duration: { es: 'Duración', en: 'Duration' },
  difficulty: { es: 'Dificultad', en: 'Difficulty' },
  easy: { es: 'Fácil', en: 'Easy' },
  normal: { es: 'Normal', en: 'Normal' },
  hard: { es: 'Difícil', en: 'Hard' },
  speed: { es: 'Velocidad', en: 'Speed' },
  size: { es: 'Tamaño', en: 'Size' },
  targets: { es: 'Objetivos (grilla)', en: 'Targets (grid)' },
  sens: { es: 'Sensibilidad', en: 'Sensitivity' },
  fov: { es: 'Campo de visión', en: 'Field of view' },
  color: { es: 'Color de objetivos', en: 'Target color' },
  room: { es: 'Sala', en: 'Room' },
  auto: { es: 'Auto', en: 'Auto' },
  dark: { es: 'Oscura', en: 'Dark' },
  light: { es: 'Clara', en: 'Light' },
  crosshair: { es: 'Mira', en: 'Crosshair' },
  start: { es: 'EMPEZAR RONDA', en: 'START ROUND' },
  startHint: { es: 'Se bloquea el mouse · Esc para pausar', en: 'Mouse gets locked · Esc to pause' },
  time: { es: 'tiempo', en: 'time' },
  score: { es: 'puntos', en: 'score' },
  acc: { es: 'precisión', en: 'accuracy' },
  streak: { es: 'racha', en: 'streak' },
  paused: { es: 'PAUSA', en: 'PAUSED' },
  resume: { es: 'CONTINUAR', en: 'RESUME' },
  endRound: { es: 'Terminar ronda', en: 'End round' },
  settings: { es: 'Configuración', en: 'Settings' },
  again: { es: 'REPETIR RONDA', en: 'PLAY AGAIN' },
  timeline: { es: 'Aciertos en el tiempo', en: 'Hits over time' },
  results: { es: 'RESULTADOS', en: 'RESULTS' },
  hits: { es: 'aciertos', en: 'hits' },
  misses: { es: 'fallos', en: 'misses' },
  reaction: { es: 'reacción media', en: 'avg reaction' },
  bestReaction: { es: 'mejor reacción', en: 'best reaction' },
  onTarget: { es: 'en el objetivo', en: 'on target' },
  bestStreak: { es: 'mejor racha', en: 'best streak' },
  hps: { es: 'aciertos/seg', en: 'hits/sec' },
  expired: { es: 'se escaparon', en: 'expired' },
  newBest: { es: 'récord de la sesión', en: 'session best' },
  lockFail: { es: 'Hacé clic para capturar el mouse', en: 'Click to capture the mouse' },
};
const tr = (k) => G.t(TXT[k]);

// ================= configuración (solo en memoria: los juegos no guardan datos) =================
const CFG = { mode: 'grid', duration: 60, difficulty: 'normal', speed: 1, size: 1, count: 3, sens: 1, fov: 90, color: 'accent', room: 'auto', cross: 'plus' };
const DIFF = {
  easy: { r: 0.42, v: 1.3, life: 2.2 },
  normal: { r: 0.32, v: 2.1, life: 1.4 },
  hard: { r: 0.22, v: 3.2, life: 0.9 },
};
const COLORS = ['accent', 'cyan', 'magenta', 'lime', 'amber', 'red', 'random'];
const bestScores = {}; // por modo+dificultad, solo esta sesión

// ================= escena =================
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(90, 1, 0.03, 100);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.7, 6);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.2);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 8, 6);
scene.add(key);
const flashLight = new THREE.PointLight(0xffc27a, 0, 6);
camera.add(flashLight);
flashLight.position.set(0.3, -0.2, -0.8);

// sala: caja con grilla de líneas finas dibujada en un canvas
let roomMesh = null;
function gridTexture(bg, line, accent) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }
  g.strokeStyle = accent;
  g.globalAlpha = 0.5;
  g.strokeRect(1, 1, 510, 510);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function buildRoom() {
  if (roomMesh) {
    scene.remove(roomMesh);
    roomMesh.geometry.dispose();
    roomMesh.material.map.dispose();
    roomMesh.material.dispose();
  }
  const dark = CFG.room === 'dark' || (CFG.room === 'auto' && G.prefs.theme === 'dark');
  const col = G.prefs.colors;
  const tex = gridTexture(dark ? '#0b0b12' : '#e9e9f0', dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)', col.accent);
  tex.repeat.set(6, 3);
  roomMesh = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 18), new THREE.MeshLambertMaterial({ map: tex, side: THREE.BackSide }));
  roomMesh.position.set(0, 3.5, 0);
  scene.add(roomMesh);
  scene.background = new THREE.Color(dark ? '#07070a' : '#f3f3f7');
  hemi.intensity = dark ? 1.1 : 1.6;
}

// ================= pistola (low poly) =================
const gun = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b3e4c, roughness: 0.45, metalness: 0.3 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x5a5e70, roughness: 0.35, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.6 });
  gun.userData.accent = accentMat;
  const add = (w, h, d, x, y, z, m, rx = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    gun.add(mesh);
    return mesh;
  };
  add(0.07, 0.08, 0.36, 0, 0.02, -0.12, mid); // corredera
  add(0.06, 0.05, 0.32, 0, -0.04, -0.1, dark); // armazón
  add(0.06, 0.16, 0.08, 0, -0.12, 0.02, dark, -0.25); // empuñadura
  add(0.012, 0.012, 0.3, 0, 0.065, -0.12, accentMat); // línea de acento
  add(0.02, 0.02, 0.02, 0, 0.075, -0.29, accentMat); // mira delantera
  const trig = add(0.012, 0.04, 0.02, 0, -0.08, -0.05, mid);
  gun.userData.trigger = trig;
  // fogonazo
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0, depthWrite: false }));
  flash.position.set(0, 0.02, -0.34);
  gun.add(flash);
  gun.userData.flash = flash;
}
gun.position.set(0.3, -0.27, -0.62);
// luz suave propia para que el arma se lea en salas oscuras
const gunLight = new THREE.PointLight(0xffffff, 1.2, 2);
gunLight.position.set(0.1, 0.3, 0);
camera.add(gunLight);
camera.add(gun);
const gunBase = gun.position.clone();
const recoil = { z: 0, rx: 0 };
const sway = { x: 0, y: 0 };

// ================= objetivos y partículas =================
const sphere = new THREE.SphereGeometry(1, 28, 20);
const ringGeo = new THREE.TorusGeometry(1.18, 0.035, 8, 48);
const targets = [];
const sparks = [];
const sparkGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);

function targetColor() {
  const c = G.prefs.colors;
  if (CFG.color === 'random') return new THREE.Color(c[['cyan', 'magenta', 'lime', 'amber', 'violet', 'red'][(Math.random() * 6) | 0]]);
  return new THREE.Color(CFG.color === 'accent' ? c.accent : c[CFG.color]);
}

function makeTarget(pos, radius) {
  const color = targetColor();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.35 });
  const mesh = new THREE.Mesh(sphere, mat);
  mesh.position.copy(pos);
  mesh.scale.setScalar(0.001);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  mesh.add(ring);
  scene.add(mesh);
  const t = { mesh, ring, radius, born: performance.now(), vel: new THREE.Vector3(), life: 0, dying: 0 };
  targets.push(t);
  return t;
}

function removeTarget(t, pop) {
  if (pop) {
    t.dying = performance.now();
    burst(t.mesh.position, t.mesh.material.color);
  } else {
    scene.remove(t.mesh);
    t.mesh.material.dispose();
    t.ring.material.dispose();
  }
  const i = targets.indexOf(t);
  if (i >= 0) targets.splice(i, 1);
  if (pop) dyingTargets.push(t);
}
const dyingTargets = [];

function burst(pos, color) {
  if (G.prefs.reducedMotion) return;
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(sparkGeo, mat);
    m.position.copy(pos);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 3);
    scene.add(m);
    sparks.push({ m, v, born: performance.now() });
  }
}

// zona de aparición (pared del fondo y un poco de profundidad)
const AREA = { x: 3.6, y0: 0.9, y1: 3.8, z0: -2.4, z1: -0.9 };
function randomPos(depth = true) {
  return new THREE.Vector3(
    (Math.random() * 2 - 1) * AREA.x,
    AREA.y0 + Math.random() * (AREA.y1 - AREA.y0),
    depth ? AREA.z0 + Math.random() * (AREA.z1 - AREA.z0) : AREA.z0,
  );
}
function freePos(r) {
  for (let k = 0; k < 30; k++) {
    const p = randomPos(false);
    // en la grilla se ubica en celdas para que se sienta "grilla"
    p.x = Math.round(p.x / 1.1) * 1.1;
    p.y = AREA.y0 + Math.round((p.y - AREA.y0) / 1.0) * 1.0;
    if (targets.every((t) => t.mesh.position.distanceTo(p) > (t.radius + r) * 2.2)) return p;
  }
  return randomPos(false);
}

// ================= ronda =================
const R = {
  state: 'config', // config | countdown | play | paused | results
  mode: 'grid',
  t0: 0,
  elapsed: 0,
  duration: 60,
  score: 0,
  shots: 0,
  hits: 0,
  streak: 0,
  bestStreak: 0,
  reactions: [],
  expired: 0,
  onTarget: 0,
  firing: 0,
  timeline: [],
  nextSpawn: 0,
  trackT: null,
};

function params() {
  const d = DIFF[CFG.difficulty];
  return { r: d.r * CFG.size, v: d.v * CFG.speed, life: d.life / Math.sqrt(CFG.speed) };
}

function clearTargets() {
  for (const t of [...targets]) removeTarget(t, false);
}

function beginRound() {
  Object.assign(R, {
    mode: CFG.mode,
    duration: CFG.duration,
    score: 0,
    shots: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
    reactions: [],
    expired: 0,
    onTarget: 0,
    elapsed: 0,
    timeline: [],
    nextSpawn: 0,
    trackT: null,
  });
  clearTargets();
  camera.fov = CFG.fov;
  camera.updateProjectionMatrix();
  yaw = 0;
  pitch = 0.08;
  gun.userData.accent.color.set(G.prefs.colors.accent);
  gun.userData.accent.emissive.set(G.prefs.colors.accent);
  updateHud();
  countdown();
}

function countdown() {
  R.state = 'countdown';
  showScreen(null);
  $('hud').hidden = false;
  $('cross').classList.add('on');
  lock();
  const el = $('count');
  let n = 3;
  const step = () => {
    if (R.state !== 'countdown') return;
    if (n === 0) {
      el.textContent = '';
      R.state = 'play';
      R.t0 = performance.now();
      spawnInitial();
      sound('go');
      return;
    }
    el.textContent = n;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    sound('count');
    n--;
    setTimeout(step, 650);
  };
  step();
}

function spawnInitial() {
  const p = params();
  if (R.mode === 'grid') for (let i = 0; i < CFG.count; i++) makeTarget(freePos(p.r), p.r);
  else if (R.mode === 'track') {
    const t = makeTarget(new THREE.Vector3(0, 2.4, AREA.z0 + 0.5), p.r * 1.35);
    t.goal = randomPos(true);
    R.trackT = t;
  } else R.nextSpawn = performance.now() + 400;
}

function endRound() {
  if (R.state !== 'play' && R.state !== 'paused') return;
  R.state = 'results';
  clearTargets();
  unlock();
  $('hud').hidden = true;
  $('cross').classList.remove('on');
  sound('end');
  showResults();
}

// ================= disparo =================
const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
let mouseDown = false;

function aimedTarget() {
  ray.setFromCamera(center, camera);
  const hits = ray.intersectObjects(
    targets.map((t) => t.mesh),
    false,
  );
  return hits.length ? targets.find((t) => t.mesh === hits[0].object) : null;
}

function fire() {
  kick();
  if (R.state !== 'play') return;
  if (R.mode === 'track') return; // en rastreo cuenta el tiempo con la mira encima
  R.shots++;
  const t = aimedTarget();
  const now = performance.now();
  if (t) {
    R.hits++;
    R.streak++;
    R.bestStreak = Math.max(R.bestStreak, R.streak);
    const react = now - t.born;
    R.reactions.push(react);
    R.timeline.push(now - R.t0);
    let pts;
    if (R.mode === 'grid') pts = 100 + Math.min(R.streak, 20) * 5;
    else pts = Math.max(50, Math.round(1000 - react * 0.6));
    R.score += pts;
    floatText(`+${pts}`);
    hitMarker();
    sound('hit', R.streak);
    removeTarget(t, true);
    if (R.mode === 'grid') makeTarget(freePos(params().r), params().r);
    else R.nextSpawn = now + 250 + Math.random() * 600;
  } else {
    R.streak = 0;
    sound('miss');
  }
  updateHud();
}

function kick() {
  recoil.z = 0.09;
  recoil.rx = 0.22;
  const f = gun.userData.flash;
  f.material.opacity = 1;
  f.rotation.z = Math.random() * Math.PI;
  flashLight.intensity = 3;
  $('cross').classList.remove('fire');
  void $('cross').offsetWidth;
  $('cross').classList.add('fire');
  if (R.mode !== 'track' || R.state !== 'play') sound('shot');
}

// ================= control de cámara =================
let yaw = 0;
let pitch = 0.08;
function lock() {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    p?.catch?.(() => canvas.requestPointerLock());
  } catch {
    canvas.requestPointerLock();
  }
}
function unlock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
const locked = () => document.pointerLockElement === canvas;

document.addEventListener('pointerlockchange', () => {
  if (!locked() && (R.state === 'play' || R.state === 'countdown')) pause();
});
document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  // algunos navegadores mandan saltos enormes al bloquear el mouse: se ignoran
  if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
  const k = 0.0022 * CFG.sens * (CFG.fov / 90);
  yaw -= e.movementX * k;
  pitch -= e.movementY * k;
  yaw = Math.max(-1.25, Math.min(1.25, yaw));
  pitch = Math.max(-1.2, Math.min(1.2, pitch));
  sway.x += e.movementX * 0.00012;
  sway.y += e.movementY * 0.00012;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!locked()) {
    if (R.state === 'play' || R.state === 'countdown') lock();
    return;
  }
  mouseDown = true;
  fire();
});
addEventListener('mouseup', () => (mouseDown = false));

function pause() {
  if (R.state === 'countdown') {
    R.state = 'paused';
    R.pausedCountdown = true;
  } else {
    R.state = 'paused';
    R.pausedCountdown = false;
  }
  R.pausedAt = performance.now();
  mouseDown = false;
  showScreen('pause');
}
function resume() {
  showScreen(null);
  if (R.pausedCountdown) return countdown();
  const dt = performance.now() - R.pausedAt;
  R.t0 += dt;
  R.nextSpawn += dt;
  for (const t of targets) t.born += dt;
  R.state = 'play';
  lock();
}
G.onPause(() => R.state === 'play' && (unlock(), pause()));

// ================= bucle =================
let last = performance.now();
const tmp = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  camera.rotation.set(pitch, yaw, 0);

  // pistola: retroceso con resorte y balanceo por movimiento del mouse
  recoil.z += (0 - recoil.z) * (1 - Math.exp(-dt * 18));
  recoil.rx += (0 - recoil.rx) * (1 - Math.exp(-dt * 14));
  sway.x *= Math.exp(-dt * 8);
  sway.y *= Math.exp(-dt * 8);
  const bob = R.state === 'play' ? Math.sin(now / 420) * 0.004 : Math.sin(now / 900) * 0.006;
  gun.position.set(gunBase.x - sway.x, gunBase.y + sway.y + bob, gunBase.z + recoil.z);
  gun.rotation.set(recoil.rx, sway.x * 2, 0);
  const f = gun.userData.flash;
  f.material.opacity *= Math.exp(-dt * 30);
  flashLight.intensity *= Math.exp(-dt * 30);

  if (R.state === 'play') {
    R.elapsed = now - R.t0;
    const left = R.duration * 1000 - R.elapsed;
    if (left <= 0) {
      endRound();
    } else {
      updateTime(left);
      stepMode(now, dt);
    }
  }

  // aparición / desaparición animada
  for (const t of targets) {
    const k = Math.min(1, (now - t.born) / 180);
    let s = t.radius * (k < 1 ? 1 - (1 - k) ** 3 * 1.0 : 1);
    if (R.mode === 'flick' && t.life) s *= Math.max(0.05, 1 - (now - t.born) / t.life);
    t.mesh.scale.setScalar(Math.max(0.001, s));
    t.ring.rotation.z += dt * 1.5;
  }
  for (let i = dyingTargets.length - 1; i >= 0; i--) {
    const t = dyingTargets[i];
    const k = (now - t.dying) / 140;
    t.mesh.scale.setScalar(Math.max(0.001, t.radius * (1 + k * 0.6)));
    t.mesh.material.transparent = true;
    t.mesh.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) {
      scene.remove(t.mesh);
      t.mesh.material.dispose();
      t.ring.material.dispose();
      dyingTargets.splice(i, 1);
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.v.y -= 9 * dt;
    s.m.position.addScaledVector(s.v, dt);
    s.m.rotation.x += dt * 8;
    const k = (now - s.born) / 450;
    s.m.scale.setScalar(Math.max(0.01, 1 - k));
    if (k >= 1) {
      scene.remove(s.m);
      sparks.splice(i, 1);
    }
  }
  renderer.render(scene, camera);
}

function stepMode(now, dt) {
  const p = params();
  if (R.mode === 'track') {
    const t = R.trackT;
    if (!t) return;
    // movimiento esquivo: persigue un punto que cambia, con aceleración limitada
    if (!t.goal || t.mesh.position.distanceTo(t.goal) < 0.4 || Math.random() < dt * 0.9) t.goal = randomPos(true);
    tmp.subVectors(t.goal, t.mesh.position).normalize().multiplyScalar(p.v * 2.2);
    t.vel.lerp(tmp, 1 - Math.exp(-dt * 2.4));
    t.mesh.position.addScaledVector(t.vel, dt);
    const on = aimedTarget() === t;
    const active = on && mouseDown;
    if (active) {
      R.onTarget += dt * 1000;
      R.score += Math.round(dt * 150);
      if (Math.random() < dt * 12) {
        kick();
        sound('tick');
      }
      if (Math.floor((now - R.t0) / 250) !== R.lastTickBucket) {
        R.lastTickBucket = Math.floor((now - R.t0) / 250);
        R.timeline.push(now - R.t0);
        R.hits++;
      }
    } else if (mouseDown && Math.random() < dt * 12) kick();
    t.mesh.material.emissiveIntensity = active ? 1.2 : on ? 0.7 : 0.35;
    R.firing += mouseDown ? dt * 1000 : 0;
    if (Math.floor(now / 200) % 2 === 0) updateHud();
  } else if (R.mode === 'flick') {
    if (!targets.length && now >= R.nextSpawn) {
      const t = makeTarget(randomPos(true), p.r * 1.1);
      t.life = p.life * 1000;
    }
    for (const t of [...targets]) {
      if (t.life && now - t.born > t.life) {
        R.expired++;
        R.streak = 0;
        removeTarget(t, false);
        sound('expire');
        R.nextSpawn = now + 300 + Math.random() * 500;
        updateHud();
      }
    }
  }
}

// ================= HUD =================
function updateTime(left) {
  const s = Math.ceil(left / 1000);
  const el = $('h-time');
  if (el.textContent !== String(s)) {
    el.textContent = s;
    el.parentElement.classList.toggle('low', s <= 5);
    if (s <= 3) sound('count');
  }
}
function accuracy() {
  if (R.mode === 'track') return R.elapsed ? R.onTarget / R.elapsed : 0;
  const total = R.shots + (R.mode === 'flick' ? R.expired : 0);
  return total ? R.hits / total : 0;
}
function updateHud() {
  $('h-score').textContent = R.score.toLocaleString();
  const a = accuracy();
  $('h-acc').textContent = R.shots || R.mode === 'track' ? `${Math.round(a * 100)}%` : '—';
  $('h-streak').textContent = R.mode === 'track' ? `${(R.onTarget / 1000).toFixed(1)}s` : R.streak;
}
function hitMarker() {
  const h = $('hitmark');
  h.classList.remove('show');
  void h.offsetWidth;
  h.classList.add('show');
}
function floatText(txt) {
  const f = $('float');
  f.textContent = txt;
  f.classList.remove('show');
  void f.offsetWidth;
  f.classList.add('show');
}

// ================= resultados =================
function showResults() {
  const secs = R.elapsed / 1000;
  const avg = R.reactions.length ? R.reactions.reduce((a, b) => a + b, 0) / R.reactions.length : 0;
  const bestR = R.reactions.length ? Math.min(...R.reactions) : 0;
  const keyB = `${R.mode}-${CFG.difficulty}-${CFG.duration}`;
  const isBest = !bestScores[keyB] || R.score > bestScores[keyB];
  if (isBest && R.score > 0) bestScores[keyB] = R.score;
  const acc = Math.round(accuracy() * 100);
  const cells = [[tr('score'), R.score.toLocaleString(), true, isBest && R.score > 0 ? tr('newBest') : '']];
  if (R.mode === 'track') {
    cells.push([tr('onTarget'), `${acc}%`], [tr('onTarget'), `${(R.onTarget / 1000).toFixed(1)}s`], [tr('time'), `${secs.toFixed(0)}s`]);
  } else {
    cells.push(
      [tr('acc'), `${acc}%`],
      [tr('hits'), R.hits],
      [tr('misses'), R.shots - R.hits],
      [tr('reaction'), avg ? `${Math.round(avg)} ms` : '—'],
      [tr('bestReaction'), bestR ? `${Math.round(bestR)} ms` : '—'],
      [tr('bestStreak'), R.bestStreak],
      [tr('hps'), (R.hits / Math.max(1, secs)).toFixed(2)],
    );
    if (R.mode === 'flick') cells.push([tr('expired'), R.expired]);
  }
  $('r-title').textContent = tr('results');
  $('r-sub').textContent = `${tr(R.mode)} · ${tr(CFG.difficulty)} · ${CFG.duration}s`;
  $('r-stats').innerHTML = cells
    .map(([k, v, main, extra], i) => `<div class="st${main ? ' main' : ''}" style="--i:${i}"><small>${k}</small><b>${v}</b>${extra ? `<em>${extra}</em>` : ''}</div>`)
    .join('');
  // aciertos por tramo de 5 segundos
  const buckets = Math.max(1, Math.ceil(R.duration / 5));
  const counts = new Array(buckets).fill(0);
  for (const t of R.timeline) counts[Math.min(buckets - 1, Math.floor(t / 5000))]++;
  const max = Math.max(1, ...counts);
  $('r-chart').innerHTML = counts.map((c, i) => `<i style="--h:${Math.max(2, (c / max) * 100)}%;--i:${i}" title="${c}"></i>`).join('');
  showScreen('results');
}

// ================= pantallas y config =================
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  G.gameplay(!id); // en menús, pausa y resultados el portal puede mostrar un banner aparte
}

const MODES = [
  ['grid', 'm-grid', '<circle cx="30%" cy="35%" r="9"/><circle cx="55%" cy="65%" r="9"/><circle cx="75%" cy="30%" r="9"/>'],
  ['track', 'm-track', '<circle cx="50%" cy="50%" r="11"/>'],
  ['flick', 'm-flick', '<circle cx="62%" cy="45%" r="12"/>'],
];
function renderConfig() {
  $('modes').innerHTML = MODES.map(
    ([m, cls, svg]) => `<button class="mode ${cls}${CFG.mode === m ? ' on' : ''}" data-mode="${m}"><svg>${svg}</svg><b>${tr(m)}</b><small>${tr(m + 'D')}</small></button>`,
  ).join('');
  $$('.seg[data-k]').forEach((s) => $$(`.seg[data-k="${s.dataset.k}"] button`).forEach((b) => b.classList.toggle('on', String(CFG[s.dataset.k]) === b.dataset.v)));
  $$('input[type=range][data-k]').forEach((r) => {
    r.value = CFG[r.dataset.k];
    syncRange(r);
  });
  const c = G.prefs.colors;
  $('sw-color').innerHTML = COLORS.map(
    (k) => `<button class="${k === 'random' ? 'rand' : ''}${CFG.color === k ? ' on' : ''}" data-color="${k}" style="--c:${k === 'accent' ? c.accent : c[k] || '#fff'}" title="${k}"></button>`,
  ).join('');
  $('cross').dataset.s = CFG.cross;
  document.documentElement.style.setProperty('--cc', CFG.color === 'random' || CFG.color === 'accent' ? c.accent : c[CFG.color]);
}
function syncRange(r) {
  const k = r.dataset.k;
  const v = Number(r.value);
  r.style.setProperty('--v', `${((v - r.min) / (r.max - r.min)) * 100}%`);
  const out = { speed: `×${v.toFixed(1)}`, size: `×${v.toFixed(1)}`, count: v, sens: v.toFixed(2), fov: `${v}°` }[k];
  $(`o-${k === 'count' ? 'count' : k}`).textContent = out;
}

$('config').addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]');
  if (m) {
    CFG.mode = m.dataset.mode;
    sound('ui');
    return renderConfig();
  }
  const sb = e.target.closest('.seg[data-k] button');
  if (sb) {
    const k = sb.parentElement.dataset.k;
    CFG[k] = isNaN(Number(sb.dataset.v)) ? sb.dataset.v : Number(sb.dataset.v);
    if (k === 'room') buildRoom();
    sound('ui');
    return renderConfig();
  }
  const sw = e.target.closest('[data-color]');
  if (sw) {
    CFG.color = sw.dataset.color;
    sound('ui');
    renderConfig();
  }
});
$('config').addEventListener('input', (e) => {
  const r = e.target.closest('input[type=range][data-k]');
  if (!r) return;
  CFG[r.dataset.k] = Number(r.value);
  syncRange(r);
});
$('start').onclick = () => {
  ensureAudio();
  beginRound();
};
document.body.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (!a) return;
  ensureAudio();
  sound('ui');
  if (a === 'resume') resume();
  else if (a === 'end') endRound();
  else if (a === 'again') beginRound();
  else if (a === 'config') {
    if (R.state === 'paused') {
      R.state = 'config';
      clearTargets();
    }
    R.state = 'config';
    $('hud').hidden = true;
    $('cross').classList.remove('on');
    renderConfig();
    showScreen('config');
  }
});
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && R.state === 'results') beginRound();
});

// ================= sonido =================
let ac = null;
let noiseBuf = null;
function ensureAudio() {
  if (ac) return ac.state === 'suspended' && ac.resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
}
function beep(f0, f1, dur, type = 'sine', vol = 0.2, at = 0) {
  if (!ac) return;
  const v = G.prefs.volume.sfx;
  if (!v) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol * v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(vol, freq) {
  if (!ac || !G.prefs.volume.sfx) return;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = vol * G.prefs.volume.sfx;
  s.connect(f).connect(g).connect(ac.destination);
  s.start();
}
function sound(k, streak = 0) {
  if (k === 'shot') {
    noise(0.5, 2200);
    beep(160, 60, 0.08, 'square', 0.12);
  } else if (k === 'hit') beep(900 + Math.min(streak, 12) * 40, 1400 + Math.min(streak, 12) * 40, 0.07, 'triangle', 0.2);
  else if (k === 'miss') beep(200, 120, 0.06, 'sine', 0.08);
  else if (k === 'tick') beep(1500, 1500, 0.02, 'square', 0.03);
  else if (k === 'expire') beep(300, 150, 0.15, 'sawtooth', 0.06);
  else if (k === 'count') beep(660, 660, 0.08, 'square', 0.08);
  else if (k === 'go') beep(990, 990, 0.18, 'square', 0.1);
  else if (k === 'end') [880, 660, 990].forEach((f, i) => beep(f, f, 0.14, 'triangle', 0.12, i * 0.1));
  else if (k === 'ui') beep(700, 500, 0.04, 'square', 0.05);
}

// ================= arranque =================
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  $$('[data-t]').forEach((n) => (n.textContent = tr(n.dataset.t)));
  buildRoom();
  renderConfig();
}, true);
addEventListener('resize', resize);
resize();
// en el menú, la cámara se mueve suave de fondo
(function idle(now) {
  if (R.state === 'config') {
    yaw = Math.sin(now / 4000) * 0.25;
    pitch = 0.05 + Math.sin(now / 3100) * 0.04;
  }
  requestAnimationFrame(idle);
})(0);
requestAnimationFrame(frame);
G.gameplay(R.state === 'play' || R.state === 'countdown');
G.ready();
