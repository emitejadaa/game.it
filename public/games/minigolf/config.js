/**
 * Dirección del servidor de salas online.
 * - En desarrollo (localhost) usa el servidor local: `npm run server` en la raíz del repo.
 * - En desarrollo se puede forzar otra con ?server=ws://… (en producción se ignora por seguridad).
 */
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const q = local ? new URLSearchParams(location.search).get('server') : null;

export const SERVER_URL = q || (local ? `ws://${location.hostname}:8787` : 'wss://gameit-server-fy2t.onrender.com');
