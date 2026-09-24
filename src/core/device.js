/**
 * Plataforma del dispositivo actual: 'mobile' (táctil como puntero principal: celulares y tablets)
 * o 'desktop' (mouse/trackpad disponible). Un iPad con trackpad cuenta como desktop.
 */
const coarse = matchMedia('(pointer: coarse)');
const anyFine = matchMedia('(any-pointer: fine)');

export const platform = () => (coarse.matches && !anyFine.matches ? 'mobile' : 'desktop');

/** Llama a `fn` cuando cambia la plataforma (p. ej. al conectar un mouse o en el emulador del navegador). */
export function onChange(fn) {
  let last = platform();
  const check = () => {
    const now = platform();
    if (now !== last) {
      last = now;
      fn(now);
    }
  };
  coarse.addEventListener('change', check);
  anyFine.addEventListener('change', check);
}
