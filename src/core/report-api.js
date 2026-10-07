/**
 * Cliente de la API de reportes. Mientras REPORT_API esté vacía usa un stub: demora 500–900 ms como una red
 * real, acepta cualquier código y no manda nada a ningún lado. Para conectar el backend solo hay que poner
 * la URL base acá (o en VITE_REPORT_API al construir); la interfaz no cambia.
 *
 * Contrato HTTP (todo JSON; los errores vienen como { error: '<código>', ... }):
 *
 *   POST {REPORT_API}/report/code    { email, lang }
 *     200 { resendIn: 30 }
 *     400 invalid_email · 429 rate_limited { retryIn }
 *
 *   POST {REPORT_API}/report/verify  { email, code }
 *     200 { token, expiresIn: 1800 }
 *     400 invalid_code { attemptsLeft } · 410 code_expired · 429 too_many_attempts
 *
 *   POST {REPORT_API}/report         Authorization: Bearer <token>
 *     { where: 'home'|'<gameId>', type: 'bug'|'lag'|'mejora'|'idea'|'otro', text,
 *       meta?: { lang, platform, theme, ua, viewport, url, inGame, build, at } }
 *     201 { id }
 *     401 token_expired · 413 too_long · 429 rate_limited
 *
 * QA sin backend: ?report=fail:<código>[:<llamada>] hace fallar el stub, p. ej.
 *   ?report=fail:invalid_code              (el código nunca es correcto)
 *   ?report=fail:rate_limited              (falla al pedir el código)
 *   ?report=fail:rate_limited:send         (falla al enviar el reporte)
 *   ?report=fail:offline                   (sin conexión, en todas las llamadas)
 * <llamada> es code | verify | send; si se omite, cada código falla donde corresponde
 * (invalid_code en verify, token_expired en send, etc.) y los demás en todas.
 */

const REPORT_API = import.meta.env?.VITE_REPORT_API || '';

/** Error con código del contrato (`code`) y datos extra de la respuesta (`data`). */
export class ReportError extends Error {
  constructor(code, data = {}) {
    super(code);
    this.name = 'ReportError';
    this.code = code;
    this.data = data;
  }
}

const DEFAULT_CALL = {
  invalid_email: 'code',
  invalid_code: 'verify',
  code_expired: 'verify',
  too_many_attempts: 'verify',
  token_expired: 'send',
  too_long: 'send',
};

/** Lee ?report=fail:<código>[:<llamada>]; devuelve { code, call } o null. */
export function parseFail(search) {
  const v = new URLSearchParams(search).get('report') || '';
  const m = v.match(/^fail:([a-z_]+)(?::(code|verify|send))?$/);
  return m ? { code: m[1], call: m[2] || DEFAULT_CALL[m[1]] || null } : null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const delay = () => wait(500 + Math.random() * 400);

async function stub(call, ok) {
  await delay();
  if (navigator.onLine === false) throw new ReportError('offline');
  const f = parseFail(location.search);
  if (f && (!f.call || f.call === call)) {
    const data = f.code === 'rate_limited' ? { retryIn: 30 } : f.code === 'invalid_code' ? { attemptsLeft: 2 } : {};
    throw new ReportError(f.code, data);
  }
  return ok();
}

async function http(path, body, token) {
  let res;
  try {
    res = await fetch(`${REPORT_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ReportError('offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ReportError(data.error || `http_${res.status}`, data);
  return data;
}

/** Pide un código de 6 dígitos para el correo. Resuelve { resendIn }. */
export function requestCode(email, lang) {
  if (REPORT_API) return http('/report/code', { email, lang });
  return stub('code', () => ({ resendIn: 30 }));
}

/** Verifica el código. Resuelve { token, expiresIn }. (El stub acepta cualquiera.) */
export function verifyCode(email, code) {
  if (REPORT_API) return http('/report/verify', { email, code });
  return stub('verify', () => ({ token: `stub-${Date.now().toString(36)}`, expiresIn: 1800 }));
}

/** Manda el reporte. Resuelve { id }. */
export function sendReport(payload, token) {
  if (REPORT_API) return http('/report', payload, token);
  return stub('send', () => {
    console.info('[report] (stub) reporte listo para enviar', payload);
    return { id: `stub-${Date.now().toString(36)}` };
  });
}
