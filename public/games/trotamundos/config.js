/* Trotamundos — ajustes del cliente. */

/**
 * Clave opcional de la Maps Embed API de Google (gratis y sin límite, pero pide una clave de Google Cloud).
 * Vacía = se usa el embed de "Compartir → Insertar", que no pide clave. Es la vía estable si Google cambiara ese embed.
 */
export const EMBED_KEY = '';

/** Estilo vectorial del mapa de marcar: OpenFreeMap (gratis y sin clave). */
export const ESTILO_MAPA = 'https://tiles.openfreemap.org/styles/positron';

/** Segundos máximos de espera a que cargue el visor antes de arrancar igual el reloj de la ronda. */
export const TOPE_CARGA_S = 8;
