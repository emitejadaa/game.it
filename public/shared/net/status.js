/**
 * Chip de estado de conexión para los juegos online: ping en ms y aviso "Reconectando…" (es/en).
 * La lógica de textos y niveles es pura (se prueba desde Node); el DOM se crea recién en `new StatusChip()`.
 * Estilos: arena.css (`.ar-chip`). El texto de estado va en una región aria-live; el ping, que cambia seguido, no se anuncia.
 */
const TXT = {
  es: { reconnecting: 'Reconectando…', lost: 'Sin conexión', ok: 'Conectado', ping: (n) => `${n} ms`, connecting: 'Conectando…' },
  en: { reconnecting: 'Reconnecting…', lost: 'Offline', ok: 'Connected', ping: (n) => `${n} ms`, connecting: 'Connecting…' },
};

/** Nivel de calidad según el ping. */
export const pingLevel = (ms) => (ms < 90 ? 'good' : ms < 180 ? 'ok' : ms < 300 ? 'warn' : 'bad');

/**
 * @param state 'ok' | 'connecting' | 'reconnecting' | 'lost'
 * @returns { text, label, level, live }  text: lo que se ve · label: lo que anuncia el lector de pantalla · live: ¿es un aviso de problema?
 */
export function chipModel({ state = 'ok', ping = 0, lang = 'es' } = {}) {
  const t = TXT[lang] || TXT.es;
  if (state === 'reconnecting' || state === 'connecting') return { text: t[state], label: t[state], level: 'reconnecting', live: true };
  if (state === 'lost') return { text: t.lost, label: t.lost, level: 'bad', live: true };
  const n = Math.round(ping);
  return { text: n > 0 ? t.ping(n) : t.ok, label: t.ok, level: n > 0 ? pingLevel(n) : 'ok', live: false };
}

export class StatusChip {
  constructor(parent, { lang = 'es' } = {}) {
    this.lang = lang;
    this.state = 'ok';
    this.ping = 0;
    const el = document.createElement('div');
    el.className = 'ar-chip';
    el.innerHTML = '<i class="ar-chip-dot" aria-hidden="true"></i><span class="ar-chip-text" aria-hidden="true"></span><span class="ar-sr" role="status" aria-live="polite"></span>';
    parent.appendChild(el);
    this.el = el;
    this.textEl = el.querySelector('.ar-chip-text');
    this.srEl = el.querySelector('.ar-sr');
    this.render();
  }

  setLang(lang) {
    this.lang = lang;
    this.render();
  }

  setPing(ms) {
    this.ping = ms;
    this.render();
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.render();
  }

  render() {
    const m = chipModel({ state: this.state, ping: this.ping, lang: this.lang });
    if (this.textEl.textContent !== m.text) this.textEl.textContent = m.text;
    this.el.dataset.level = m.level;
    const sr = m.live ? m.label : '';
    if (this.srEl.textContent !== sr) this.srEl.textContent = sr; // solo se anuncian los problemas
  }

  destroy() {
    this.el.remove();
  }
}
