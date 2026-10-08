/**
 * Sumo / Rey de la Colina — entrada del navegador: teclado (según la preferencia flechas / WASD del portal), joystick virtual
 * flotante en la mitad izquierda de la pantalla y botones a la derecha. Lo único que entrega es un vector de movimiento
 * (`vector()`) y avisos de Empujón / Onda; cómo se manda a la red lo decide el juego (ver MoveGate en logic.js).
 *
 *   const ctl = new Controls({ stage: canvas, stick, knob, dashBtn, waveBtn, enabled: () => jugando, onDash, onWave });
 *   ctl.vector() → [x, y]      ctl.release()  al pausar / perder el foco
 * Los punteros del joystick y de los botones se capturan (setPointerCapture): arrastrar fuera del elemento sigue valiendo.
 */
import { keysVector, stickVector } from './logic.js';

const G = window.GameIt;
const DASH_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight']);
const WAVE_KEYS = new Set(['KeyE', 'KeyQ', 'KeyF']);

export class Controls {
  constructor({ stage, stick, knob, dashBtn, waveBtn, enabled, onDash, onWave, radius = 52 }) {
    Object.assign(this, { stage, stick, knob, dashBtn, waveBtn, enabled, onDash, onWave, radius });
    this.keys = { up: false, down: false, left: false, right: false };
    this.sv = [0, 0]; // vector del joystick
    this.pid = null;
    this.ox = 0;
    this.oy = 0;
    this.attach();
  }

  attach() {
    addEventListener('keydown', (e) => this.keydown(e));
    addEventListener('keyup', (e) => this.keyup(e));
    addEventListener('blur', () => this.release());
    const st = this.stage;
    st.addEventListener('pointerdown', (e) => {
      // el joystick es solo para dedos y lápiz, en la mitad izquierda
      if (e.pointerType === 'mouse' || this.pid !== null || !this.enabled() || e.clientX > innerWidth * 0.55) return;
      this.pid = e.pointerId;
      this.ox = e.clientX;
      this.oy = e.clientY;
      st.setPointerCapture?.(e.pointerId);
      this.stick.style.left = `${this.ox}px`;
      this.stick.style.top = `${this.oy}px`;
      this.stick.classList.add('on');
      this.knob.style.transform = 'translate(-50%, -50%)';
    });
    st.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pid) return;
      let dx = e.clientX - this.ox;
      let dy = e.clientY - this.oy;
      const l = Math.hypot(dx, dy);
      if (l > this.radius) {
        // el punto de apoyo acompaña al dedo cuando se pasa: no hace falta volver al centro para cambiar de dirección
        const k = (l - this.radius) / l;
        this.ox += dx * k;
        this.oy += dy * k;
        dx = e.clientX - this.ox;
        dy = e.clientY - this.oy;
        this.stick.style.left = `${this.ox}px`;
        this.stick.style.top = `${this.oy}px`;
      }
      this.sv = stickVector(dx, dy, this.radius);
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e) => {
      if (e.pointerId !== this.pid) return;
      this.pid = null;
      this.sv = [0, 0];
      this.stick.classList.remove('on');
      this.stick.style.left = '';
      this.stick.style.top = '';
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    const btn = (el, fn) => {
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('down');
        if (this.enabled()) fn();
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => el.classList.remove('down'));
    };
    btn(this.dashBtn, () => this.onDash());
    btn(this.waveBtn, () => this.onWave?.());
  }

  keydown(e) {
    if (e.target.closest?.('input, select, textarea')) return;
    const name = G.dir(e);
    if (name) {
      if (this.enabled()) e.preventDefault();
      this.keys[name] = true;
      return;
    }
    if (!this.enabled()) return;
    if (DASH_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.onDash();
    } else if (WAVE_KEYS.has(e.code) && this.onWave) {
      e.preventDefault();
      if (!e.repeat) this.onWave();
    }
  }

  keyup(e) {
    const name = G.dir(e);
    if (name) this.keys[name] = false;
  }

  /** Vector de movimiento actual: las teclas mandan sobre el joystick. */
  vector() {
    if (!this.enabled()) return [0, 0];
    const k = keysVector(this.keys);
    return k[0] || k[1] ? k : this.sv;
  }

  /** Suelta todo (pausa, pérdida de foco, pantalla de muerte). */
  release() {
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    this.sv = [0, 0];
    this.pid = null;
    this.stick.classList.remove('on');
    this.stick.style.left = '';
    this.stick.style.top = '';
  }
}
