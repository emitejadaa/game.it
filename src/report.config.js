/**
 * Reportes de problemas e ideas, sin cuentas: la persona verifica su correo con un código y
 * después puede mandar reportes desde ese dispositivo durante `sessionDays`.
 *
 * - `endpoint`: base de la API de reportes en el servidor (por ejemplo '/api/reports' cuando todo
 *   corra en el VPS). Vacío = **modo demo**: el flujo completo funciona en el navegador, no se
 *   envían correos ni reportes y el código aparece en pantalla. El contrato de la API está en
 *   `src/core/report-api.js`.
 * - `turnstileSiteKey`: clave pública de Cloudflare Turnstile (captcha invisible, gratis). Vacía =
 *   sin captcha. Protege el pedido de código para que nadie use el formulario para llenar de
 *   correos una casilla ajena; el servidor valida el token.
 *
 * Los límites de acá son solo de la interfaz: los que cuentan los aplica el servidor.
 */
export default {
  endpoint: '',
  turnstileSiteKey: '',
  codeLength: 6,
  minChars: 20,
  maxChars: 2000,
  sessionDays: 7,
};
