/* Stack — game.it
 * Apilá bloques que se deslizan: lo que sobresale se corta y cae. Los aciertos perfectos encadenan
 * combos y hacen crecer el bloque. Three.js con cámara ortográfica isométrica.
 */
import * as THREE from '/vendor/three.min.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);

const TXT = {
  start: { es: 'Tocá, hacé clic o apretá espacio', en: 'Tap, click or press space' },
  again: { es: 'Tocá para jugar de nuevo', en: 'Tap to play again' },
  score: { es: 'altura', en: 'height' },
  best: { es: 'mejor (sesión)', en: 'best (session)' },
  perfect: { es: 'perfectos', en: 'perfect' },
  combo: { es: 'perfecto', en: 'perfect' },
};
const tr = (k) => G.t(TXT[k]);

const H = 0.32; // alto de cada bloque
const BASE = 3; // ancho inicial
const TOL = 0.09; // tolerancia de "perfecto"

// ================= escena =================
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
camera.position.set(8, 8, 8);
camera.lookAt(0, 0, 0);
const camTarget = new THREE.Vector3(0, 0, 0);
let zoom = 1;
let zoomTarget = 1;

scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(5, 12, 3);
scene.add(sun);

const box = new THREE.BoxGeometry(1, 1, 1);
const ringGeo = new THREE.RingGeometry(0.98, 1, 64, 1);
ringGeo.rotateX(-Math.PI / 2);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  const aspect = w / h;
  const view = aspect < 1 ? 7.2 : 5.4; // en vertical se aleja un poco
  camera.left = (-view * aspect) / 2;
  camera.right = (view * aspect) / 2;
  camera.top = view / 2;
  camera.bottom = -view / 2;
  camera.updateProjectionMatrix();
}

// ================= colores =================
let hue0 = Math.random() * 360;
const colorAt = (i) => new THREE.Color().setHSL((((hue0 + i * 7) % 360) + 360) / 360 % 1, 0.62, G.prefs.theme === 'dark' ? 0.56 : 0.62);
function paintBackground(i) {
  const h = (hue0 + i * 7 + 180) % 360;
  const dark = G.prefs.theme === 'dark';
  document.body.style.setProperty('--top', `hsl(${h} ${dark ? 35 : 55}% ${dark ? 18 : 78}%)`);
  document.body.style.setProperty('--bottom', `hsl(${(h + 40) % 360} ${dark ? 40 : 60}% ${dark ? 6 : 92}%)`);
}

// ================= estado =================
const S = {
  state: 'start', // start | play | over
  stack: [], // { mesh, x, z, w, d }
  moving: null, // { mesh, axis, x, z, w, d, dir, speed }
  debris: [],
  rings: [],
  combo: 0,
  perfects: 0,
  best: 0,
};

function block(x, y, z, w, d, i) {
  const mat = new THREE.MeshLambertMaterial({ color: colorAt(i) });
  const m = new THREE.Mesh(box, mat);
  m.scale.set(w, H, d);
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

function reset() {
  for (const b of S.stack) scene.remove(b.mesh);
  for (const b of S.debris) scene.remove(b.mesh);
  if (S.moving) scene.remove(S.moving.mesh);
  S.stack = [];
  S.debris = [];
  S.moving = null;
  S.combo = 0;
  S.perfects = 0;
  hue0 = Math.random() * 360;
  // base alta para que la torre "salga" del suelo
  const base = block(0, -H * 6, 0, BASE, BASE, 0);
  base.scale.y = H * 12;
  S.stack.push({ mesh: base, x: 0, z: 0, w: BASE, d: BASE });
  camTarget.set(0, 0, 0);
  zoomTarget = 1;
  paintBackground(0);
  setScore(0);
}

function spawn() {
  const top = S.stack[S.stack.length - 1];
  const i = S.stack.length;
  const axis = i % 2 ? 'x' : 'z';
  const range = 4.2;
  const x = axis === 'x' ? -range : top.x;
  const z = axis === 'z' ? -range : top.z;
  const mesh = block(x, i * H - H / 2 + H / 2, z, top.w, top.d, i);
  mesh.position.y = (i - 0.5) * H;
  S.moving = { mesh, axis, x, z, w: top.w, d: top.d, dir: 1, range, speed: Math.min(6.5, 3.2 + i * 0.045) };
}

// ================= jugar =================
function place() {
  const m = S.moving;
  if (!m) return;
  const top = S.stack[S.stack.length - 1];
  const i = S.stack.length;
  const ax = m.axis;
  const size = ax === 'x' ? m.w : m.d;
  const delta = ax === 'x' ? m.x - top.x : m.z - top.z;
  const overlap = size - Math.abs(delta);
  S.moving = null;

  if (overlap <= 0) {
    // cayó entero: fin
    S.debris.push({ mesh: m.mesh, vy: 0, vr: (Math.random() - 0.5) * 3, axis: ax, dir: Math.sign(delta) });
    return gameOver();
  }

  if (Math.abs(delta) < TOL) {
    // perfecto: queda alineado y, con combo, crece un poco
    S.combo++;
    S.perfects++;
    m.x = top.x;
    m.z = top.z;
    if (S.combo >= 3) {
      if (ax === 'x') m.w = Math.min(BASE, m.w + 0.12);
      else m.d = Math.min(BASE, m.d + 0.12);
    }
    ring(m.x, (i - 0.5) * H - H / 2, m.z, Math.max(m.w, m.d));
    showCombo();
    sound('perfect', S.combo);
  } else {
    S.combo = 0;
    const cut = Math.abs(delta);
    const newSize = overlap;
    const center = (ax === 'x' ? top.x : top.z) + delta / 2;
    // pedazo que cae
    const fallCenter = center + Math.sign(delta) * (newSize / 2 + cut / 2);
    const piece = block(ax === 'x' ? fallCenter : m.x, m.mesh.position.y, ax === 'z' ? fallCenter : m.z, ax === 'x' ? cut : m.w, ax === 'z' ? cut : m.d, i);
    S.debris.push({ mesh: piece, vy: 0, vr: (Math.random() * 1.5 + 1) * Math.sign(delta), axis: ax, dir: Math.sign(delta) });
    if (ax === 'x') {
      m.w = newSize;
      m.x = center;
    } else {
      m.d = newSize;
      m.z = center;
    }
    sound('place');
  }
  m.mesh.scale.set(m.w, H, m.d);
  m.mesh.position.set(m.x, (i - 0.5) * H, m.z);
  // pequeño "rebote" al asentar
  m.mesh.userData.land = performance.now();
  S.stack.push({ mesh: m.mesh, x: m.x, z: m.z, w: m.w, d: m.d });
  setScore(S.stack.length - 1);
  paintBackground(i);
  camTarget.y = (i - 1) * H;
  spawn();
}

function gameOver() {
  S.state = 'over';
  const score = S.stack.length - 1;
  S.best = Math.max(S.best, score);
  sound('over');
  // la cámara se aleja para mostrar la torre entera
  zoomTarget = Math.max(1, (S.stack.length * H) / 4.5);
  camTarget.y = (S.stack.length * H) / 2 - 1;
  $('stats').innerHTML = `<div><b>${score}</b>${tr('score')}</div><div><b>${S.best}</b>${tr('best')}</div><div><b>${S.perfects}</b>${tr('perfect')}</div>`;
  setTimeout(() => {
    $('over').classList.add('on');
    G.gameplay(false); // fin de partida: en computadora el portal puede mostrar un banner al costado
  }, 500);
}

function start() {
  ensureAudio();
  $('start').classList.remove('on');
  $('over').classList.remove('on');
  reset();
  S.state = 'play';
  G.gameplay(true);
  spawn();
}

function action() {
  if (G.paused) return;
  if (S.state === 'play') place();
  else if (S.state === 'start') start();
  else if (S.state === 'over' && $('over').classList.contains('on')) start();
}

function setScore(n) {
  const el = $('score');
  el.textContent = n;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function showCombo() {
  const el = $('combo');
  el.textContent = S.combo > 1 ? `${tr('combo')} ×${S.combo}` : tr('combo');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function ring(x, y, z, size) {
  if (G.prefs.reducedMotion) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const r = new THREE.Mesh(ringGeo, mat);
  r.position.set(x, y + H + 0.01, z);
  r.scale.setScalar(size * 0.7);
  scene.add(r);
  S.rings.push({ mesh: r, born: performance.now(), size });
}

// ================= bucle =================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused) return;

  const m = S.moving;
  if (m && S.state === 'play') {
    const k = m.axis === 'x' ? 'x' : 'z';
    m[k] += m.dir * m.speed * dt;
    if (m[k] > m.range) {
      m[k] = m.range;
      m.dir = -1;
    } else if (m[k] < -m.range) {
      m[k] = -m.range;
      m.dir = 1;
    }
    m.mesh.position[k] = m[k];
  }
  for (const d of S.debris) {
    d.vy -= 18 * dt;
    d.mesh.position.y += d.vy * dt;
    d.mesh.position[d.axis] += d.dir * 0.8 * dt;
    if (d.axis === 'x') d.mesh.rotation.z -= d.vr * dt;
    else d.mesh.rotation.x += d.vr * dt;
  }
  S.debris = S.debris.filter((d) => {
    if (d.mesh.position.y < camTarget.y - 30) {
      scene.remove(d.mesh);
      d.mesh.material.dispose();
      return false;
    }
    return true;
  });
  for (const r of S.rings) {
    const k = (now - r.born) / 650;
    r.mesh.scale.setScalar(r.size * (0.7 + k * 0.6));
    r.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
  }
  S.rings = S.rings.filter((r) => {
    if (now - r.born > 650) {
      scene.remove(r.mesh);
      r.mesh.material.dispose();
      return false;
    }
    return true;
  });
  // rebote del último bloque apoyado
  const topB = S.stack[S.stack.length - 1];
  if (topB?.mesh.userData.land) {
    const k = (now - topB.mesh.userData.land) / 250;
    topB.mesh.scale.y = k < 1 ? H * (1 - Math.sin(k * Math.PI) * 0.18) : H;
  }

  // cámara suave
  const f = 1 - Math.exp(-dt * 5);
  const look = new THREE.Vector3(0, camera.position.y - 8, 0);
  look.y += (camTarget.y - look.y) * f;
  camera.position.set(8, look.y + 8, 8);
  camera.lookAt(0, look.y, 0);
  zoom += (zoomTarget - zoom) * f;
  camera.zoom = 1 / zoom;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
}

// ================= entrada =================
addEventListener('pointerdown', (e) => {
  if (e.button === 0) action();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === 'Enter' || G.dir(e) === 'down') {
    e.preventDefault();
    if (!e.repeat) action();
  }
});

// ================= sonido =================
let ac = null;
function ensureAudio() {
  if (ac) return ac.state === 'suspended' && ac.resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) ac = new AC();
}
function beep(f, dur, type = 'triangle', vol = 0.2, at = 0) {
  if (!ac) return;
  const v = G.prefs.volume.sfx;
  if (!v) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(vol * v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function sound(k, combo = 0) {
  // los perfectos suben de tono por la escala mayor
  const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
  if (k === 'perfect') beep(440 * 2 ** (scale[Math.min(combo - 1, scale.length - 1)] / 12), 0.25, 'sine', 0.25);
  else if (k === 'place') beep(220, 0.08, 'triangle', 0.22);
  else if (k === 'over') [330, 262, 196].forEach((f, i) => beep(f, 0.3, 'sawtooth', 0.08, i * 0.12));
}

// ================= arranque =================
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  $('start-hint').textContent = tr('start');
  $('over-hint').textContent = tr('again');
  S.stack.forEach((b, i) => b.mesh.material.color.copy(colorAt(i)));
  paintBackground(Math.max(0, S.stack.length - 1));
}, true);
G.onPause(() => ac?.suspend());
G.onResume(() => ac?.resume());
addEventListener('resize', resize);
resize();
reset();
requestAnimationFrame(frame);
G.gameplay(false);
G.ready();
