/**
 * Espacios de anuncios (Google AdSense) en zonas muertas del menú.
 *
 * Reglas: cada espacio se pide una sola vez (nunca se refresca solo), lleva la etiqueta
 * "Publicidad", se puede cerrar (queda oculto `dismissHours`) y se colapsa si AdSense no tiene
 * anuncio para mostrar o si un bloqueador lo impide. Nunca se crean anuncios dentro de un juego.
 */
import cfg from '../ads.config.js';

const HIDE_KEY = (name) => `gameit:ads:hidden:${name}`;
const preview = new URLSearchParams(location.search).get('ads') === 'preview';
const mounted = new Set();

const dismissed = (name) => {
  try {
    const at = Number(localStorage.getItem(HIDE_KEY(name)));
    return at > 0 && Date.now() - at < cfg.dismissHours * 3600e3;
  } catch {
    return false;
  }
};

function collapse(slot) {
  if (slot.hidden) return;
  slot.classList.add('closing');
  setTimeout(() => {
    slot.hidden = true;
    slot.classList.remove('closing', 'on');
  }, 420);
}

function watchFill(slot, ins) {
  // AdSense marca el bloque con data-ad-status="unfilled" cuando no hay anuncio: se colapsa.
  new MutationObserver(() => {
    if (ins.dataset.adStatus === 'unfilled') collapse(slot);
    else if (ins.dataset.adStatus === 'filled') slot.classList.add('filled');
  }).observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
  // Script bloqueado o sin respuesta: sin iframe después de unos segundos, se colapsa.
  setTimeout(() => {
    if (!ins.querySelector('iframe') && ins.dataset.adStatus !== 'filled') collapse(slot);
  }, 9000);
}

function mount(slot) {
  const name = slot.dataset.slot;
  if (mounted.has(name)) return;
  const id = cfg.slots?.[name];
  if (!cfg.enabled || (!preview && (!cfg.client || !id)) || dismissed(name)) return;
  mounted.add(name);

  const body = slot.querySelector('.ad-body');
  slot.hidden = false;
  requestAnimationFrame(() => slot.classList.add('on'));

  if (preview) {
    body.innerHTML = '<div class="ad-preview adsbygoogle-size"><span></span></div>';
    const box = body.firstElementChild;
    const size = () => (box.firstElementChild.textContent = `${box.offsetWidth}×${box.offsetHeight}`);
    size();
    addEventListener('resize', size);
    return;
  }

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle adsbygoogle-size';
  ins.style.display = 'inline-block';
  ins.dataset.adClient = cfg.client;
  ins.dataset.adSlot = id;
  body.appendChild(ins);
  watchFill(slot, ins);
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    collapse(slot);
  }
}

/** Monta los espacios visibles. Llamar cuando el menú está en pantalla (no detrás de un juego). */
export function show() {
  document.querySelectorAll('.ad-slot[data-slot]').forEach(mount);
}

export function init() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.ad-close');
    if (!b) return;
    const slot = b.closest('.ad-slot');
    try {
      localStorage.setItem(HIDE_KEY(slot.dataset.slot), String(Date.now()));
    } catch {}
    collapse(slot);
  });
}
