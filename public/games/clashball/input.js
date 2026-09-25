/**
 * Clashball — entrada: teclado, joystick (Gamepad API) y controles táctiles → bits de HaxBall
 * (1 arriba, 2 abajo, 4 izquierda, 8 derecha, 16 patear).
 */
import { KEY } from './shared/match.js';

const G = window.GameIt;
const ARROWS = { ArrowUp: KEY.UP, ArrowDown: KEY.DOWN, ArrowLeft: KEY.LEFT, ArrowRight: KEY.RIGHT };
const WASD = { KeyW: KEY.UP, KeyS: KEY.DOWN, KeyA: KEY.LEFT, KeyD: KEY.RIGHT };
// Ctrl izquierdo no: Ctrl+W cerraría la pestaña mientras se juega con WASD
const KICK_SOLO = ['KeyX', 'Space', 'ControlRight', 'KeyK', 'KeyL', 'Numpad0'];
const KICK_P1 = ['Space', 'KeyC', 'KeyV', 'ShiftLeft', 'KeyF'];
const KICK_P2 = ['Enter', 'NumpadEnter', 'Numpad0', 'ControlRight', 'ShiftRight', 'Period', 'Slash', 'Minus'];
export const GAME_CODES = new Set([...Object.keys(ARROWS), ...Object.keys(WASD), ...KICK_SOLO, ...KICK_P1, ...KICK_P2]);

const down = new Set();
const touch = { x: 0, y: 0, kick: false };
let enabled = false;

const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');

addEventListener('keydown', (e) => {
  if (typing(e.target)) return;
  down.add(e.code);
  if (enabled && GAME_CODES.has(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => {
  down.clear();
  touch.kick = false;
  touch.x = touch.y = 0;
});

/** Mientras se juega, flechas/espacio no mueven la página ni activan botones. */
export function setEnabled(v) {
  enabled = v;
  if (v && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

const map = (tbl) => {
  let b = 0;
  for (const c in tbl) if (down.has(c)) b |= tbl[c];
  return b;
};
const any = (codes) => codes.some((c) => down.has(c));

function clean(b) {
  // teclas opuestas a la vez: se anulan
  if ((b & KEY.UP) && (b & KEY.DOWN)) b &= ~(KEY.UP | KEY.DOWN);
  if ((b & KEY.LEFT) && (b & KEY.RIGHT)) b &= ~(KEY.LEFT | KEY.RIGHT);
  return b;
}

function pad(i) {
  const p = navigator.getGamepads?.()[i];
  if (!p || !p.connected) return 0;
  const ax = p.axes[0] || 0;
  const ay = p.axes[1] || 0;
  const btn = (n) => !!p.buttons[n]?.pressed;
  let b = 0;
  if (ay < -0.4 || btn(12)) b |= KEY.UP;
  if (ay > 0.4 || btn(13)) b |= KEY.DOWN;
  if (ax < -0.4 || btn(14)) b |= KEY.LEFT;
  if (ax > 0.4 || btn(15)) b |= KEY.RIGHT;
  if (btn(0) || btn(1) || btn(2) || btn(5) || btn(7)) b |= KEY.KICK;
  return b;
}

/** Botón de pausa del joystick (Start). */
export function padPause() {
  for (const p of navigator.getGamepads?.() || []) if (p?.buttons[9]?.pressed) return true;
  return false;
}

/**
 * Bits de un jugador. slot 0: jugador único (teclado según preferencias + joystick 1 + táctil);
 * slot 1 / 2: dos jugadores en el mismo teclado.
 */
export function bits(slot = 0) {
  let b = 0;
  if (slot === 0) {
    const k = G.prefs.keys;
    if (k !== 'wasd') b |= map(ARROWS);
    if (k !== 'arrows') b |= map(WASD);
    if (any(KICK_SOLO)) b |= KEY.KICK;
    b |= pad(0) | touchBits();
  } else if (slot === 1) {
    b |= map(WASD) | pad(0);
    if (any(KICK_P1)) b |= KEY.KICK;
  } else {
    b |= map(ARROWS) | pad(1);
    if (any(KICK_P2)) b |= KEY.KICK;
  }
  return clean(b);
}

function touchBits() {
  let b = touch.kick ? KEY.KICK : 0;
  const { x, y } = touch;
  const l = Math.hypot(x, y);
  if (l < 0.3) return b;
  // 8 sectores de 45°
  const a = Math.atan2(y, x);
  const s = Math.round(a / (Math.PI / 4));
  const dirs = [KEY.RIGHT, KEY.RIGHT | KEY.DOWN, KEY.DOWN, KEY.DOWN | KEY.LEFT, KEY.LEFT, KEY.LEFT | KEY.UP, KEY.UP, KEY.UP | KEY.RIGHT];
  return b | dirs[(s + 8) % 8];
}

/** Rota los bits de dirección de pantalla a mundo cuando la cancha está girada. */
export function rotate(b, rot, flip) {
  if (!rot) return b;
  const u = b & KEY.UP;
  const d = b & KEY.DOWN;
  const l = b & KEY.LEFT;
  const r = b & KEY.RIGHT;
  let o = b & KEY.KICK;
  if (flip > 0) {
    if (u) o |= KEY.RIGHT;
    if (d) o |= KEY.LEFT;
    if (r) o |= KEY.DOWN;
    if (l) o |= KEY.UP;
  } else {
    if (u) o |= KEY.LEFT;
    if (d) o |= KEY.RIGHT;
    if (r) o |= KEY.UP;
    if (l) o |= KEY.DOWN;
  }
  return o;
}

/** Joystick virtual (aparece donde se apoya el dedo) y botón de patear. */
export function initTouch(zone, stick, knob, kickBtn) {
  let id = null;
  let ox = 0;
  let oy = 0;
  const R = 52;
  const home = () => {
    stick.style.left = '';
    stick.style.top = '';
    stick.style.bottom = '';
    knob.style.transform = '';
    stick.classList.remove('on');
  };
  zone.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    zone.setPointerCapture(id);
    const r = zone.getBoundingClientRect();
    ox = e.clientX;
    oy = e.clientY;
    stick.style.left = `${e.clientX - r.left - 62}px`;
    stick.style.top = `${e.clientY - r.top - 62}px`;
    stick.style.bottom = 'auto';
    stick.classList.add('on');
    touch.x = touch.y = 0;
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.x = dx / R;
    touch.y = dy / R;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    touch.x = touch.y = 0;
    home();
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  const kd = (e) => {
    e.preventDefault();
    touch.kick = true;
    kickBtn.classList.add('on');
  };
  const ku = () => {
    touch.kick = false;
    kickBtn.classList.remove('on');
  };
  kickBtn.addEventListener('pointerdown', kd);
  kickBtn.addEventListener('pointerup', ku);
  kickBtn.addEventListener('pointercancel', ku);
  kickBtn.addEventListener('pointerleave', ku);
}

export const isDown = (code) => down.has(code);
