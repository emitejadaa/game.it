/**
 * Dirección del servidor de salas online.
 * - En desarrollo (localhost) usa el servidor local: `npm run server` en la raíz del repo.
 * - Se puede forzar otra con ?server=wss://… en la URL del juego.
 */
const q = new URLSearchParams(location.search).get('server');
const local = ['localhost', '127.0.0.1'].includes(location.hostname);

export const SERVER_URL = q || (local ? `ws://${location.hostname}:8787` : 'wss://gameit-server.onrender.com');
