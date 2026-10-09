/**
 * Lo mínimo de los juegos diarios que necesita el menú: el día de Argentina (UTC−3, igual que public/shared/daily.js)
 * y el resumen que cada juego deja en `gameit:daily:<id>` para mostrar "Nuevo" o "✓ Racha N" en su tarjeta.
 * (El código del navegador de los juegos vive en public/ y no se puede importar desde acá; tests/portal-daily.test.mjs
 * comprueba que las dos fechas coinciden.)
 */
export const today = (now = Date.now()) => new Date(now - 3 * 3600e3).toISOString().slice(0, 10);

/** Estado de hoy de un juego diario: { done, won, streak } o null si todavía no se jugó. */
export function status(id) {
  try {
    const m = JSON.parse(localStorage.getItem(`gameit:daily:${id}`));
    if (m && m.date === today()) return { done: !!m.done, won: !!m.won, streak: m.streak | 0 };
  } catch {}
  return null;
}
