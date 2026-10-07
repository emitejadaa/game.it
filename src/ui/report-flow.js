/**
 * Máquina de estados del reporte de problemas. Es pura (sin DOM, sin red, sin reloj propio: el tiempo entra
 * por parámetro), así se prueba con node:test. report.js la usa para saber en qué paso está el usuario,
 * qué falta para avanzar y qué mostrar cuando algo falla.
 *
 * Pasos: email → code → where → type → text → done. Cada paso hace una sola pregunta.
 */

export const STEPS = ['email', 'code', 'where', 'type', 'text', 'done'];
export const TYPES = ['bug', 'lag', 'mejora', 'idea', 'otro'];
export const HOME = 'home';
export const CODE_LEN = 6;
export const MIN_TEXT = 10;
export const MAX_TEXT = 1500;
export const RESEND_SECS = 30;

/** Estado inicial: `email` es el que se recordó de la vez anterior (si hay). */
export function create({ email = '' } = {}) {
  return {
    step: 'email',
    email, // lo que se escribió (puede ser un borrador)
    sentTo: '', // el correo al que se mandó el código
    code: '',
    resendAt: 0, // instante (ms) desde el que se puede reenviar
    token: null,
    tokenUntil: 0,
    where: null, // 'home' o el id de un juego
    preset: null, // juego desde el que se abrió (preselección de la lista)
    fromGame: false,
    type: null,
    text: '',
    meta: true, // incluir datos del dispositivo
    query: '', // filtro de la lista de juegos
  };
}

// ---------- validaciones ----------
export const normalizeEmail = (s) => String(s ?? '').trim();

export function validEmail(s) {
  const e = normalizeEmail(s);
  return e.length > 0 && e.length <= 254 && !/\.\./.test(e) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

/** Deja solo dígitos y corta en 6 (pegar "123 456" o "123-456" funciona). */
export const cleanCode = (s) => String(s ?? '').replace(/\D/g, '').slice(0, CODE_LEN);
export const codeComplete = (s) => cleanCode(s).length === CODE_LEN;

export const textLen = (s) => String(s ?? '').trim().length;
export const textOk = (s) => textLen(s) >= MIN_TEXT && String(s).length <= MAX_TEXT;

/** ¿Se puede avanzar desde el paso actual? */
export function canAdvance(st) {
  switch (st.step) {
    case 'email':
      return validEmail(st.email);
    case 'code':
      return codeComplete(st.code);
    case 'where':
      return !!st.where;
    case 'type':
      return TYPES.includes(st.type);
    case 'text':
      return textOk(st.text);
    default:
      return false;
  }
}

// ---------- progreso ----------
/** Segmento actual del riel (1 a 5). "Gracias" deja el riel completo. */
export const railIndex = (step) => Math.min(5, STEPS.indexOf(step) + 1) || 1;

/** ¿Se muestra la flecha para volver? Dónde no la tiene: ya se verificó el correo y no hay a dónde volver. */
export const canGoBack = (step) => ['code', 'type', 'text'].includes(step);

// ---------- reenvío del código ----------
export const resendLeft = (st, now) => Math.max(0, Math.ceil((st.resendAt - now) / 1000));
export const canResend = (st, now) => resendLeft(st, now) === 0;

/** ¿Sigue valiendo la verificación? (el token vence a los 30 min) */
export const tokenValid = (st, now) => !!st.token && now < st.tokenUntil;

// ---------- lugares (paso "Dónde") ----------
/** Orden: Inicio, el juego desde el que se abrió (si hay) y el resto del catálogo. */
export function placesList(games, presetId = null) {
  const list = [{ id: HOME, home: true }];
  const cur = presetId && games.find((g) => g.id === presetId);
  if (cur) list.push({ id: cur.id, game: cur, current: true });
  for (const g of games) if (!cur || g.id !== cur.id) list.push({ id: g.id, game: g });
  return list;
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Filtra por palabras (sin acentos). `labelOf(item)` devuelve el texto visible de cada fila. */
export function filterPlaces(items, query, labelOf) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((it) => {
    const hay = `${norm(labelOf(it))} ${norm(it.id)}`;
    return words.every((w) => hay.includes(w));
  });
}

// ---------- errores ----------
/**
 * Qué mostrar y qué hacer cuando una llamada falla con `code`.
 * `key` es la clave de texto; `shake` sacude el control; `clearCode` vacía las casillas; `to` manda a otro paso.
 */
export function errorFx(code) {
  switch (code) {
    case 'invalid_email':
      return { key: 'report.email.bad', shake: true };
    case 'invalid_code':
      return { key: 'report.code.bad', shake: true, clearCode: true };
    case 'code_expired':
      return { key: 'report.code.expired', shake: true, clearCode: true };
    case 'too_many_attempts':
      return { key: 'report.code.many', clearCode: true };
    case 'rate_limited':
      return { key: 'report.rate' };
    case 'token_expired':
      return { key: 'report.session', to: 'email' };
    case 'too_long':
      return { key: 'report.text.long' };
    case 'offline':
      return { key: 'report.offline' };
    default:
      return { key: 'report.fail' };
  }
}

// ---------- transiciones ----------
/**
 * Aplica una acción y devuelve el estado nuevo (nunca muta el anterior). Una acción que no corresponde al
 * paso actual devuelve el mismo estado: así un clic tardío o duplicado no rompe el flujo.
 */
export function reduce(st, a) {
  switch (a.type) {
    case 'open': {
      // después de "Gracias" se reinicia (conservando el correo); a mitad de camino se retoma donde estaba
      let base = st.step === 'done' ? create({ email: st.email }) : st;
      const gameId = a.gameId || null;
      // si lo elegido era solo la preselección de la vez anterior y ahora se abre desde otro lugar, se vuelve a preseleccionar
      // (no se reporta sobre un juego equivocado); lo que la persona eligió a mano se respeta
      if (base.where !== null && base.where === base.preset && base.preset !== gameId) {
        base = { ...base, where: null, step: ['type', 'text'].includes(base.step) ? 'where' : base.step };
      }
      const preset = base.where === null ? gameId : base.preset;
      return { ...base, preset, fromGame: !!gameId };
    }
    case 'email':
      return st.step === 'email' ? { ...st, email: String(a.value ?? '').slice(0, 254) } : st;
    case 'codeRequested': {
      if (st.step !== 'email' && st.step !== 'code') return st;
      const email = normalizeEmail(a.email ?? st.email);
      if (!validEmail(email)) return st;
      const resendIn = Number.isFinite(a.resendIn) ? a.resendIn : RESEND_SECS;
      // al reenviar (ya en "code") se conservan las casillas; al venir del correo arranca limpio
      return {
        ...st,
        step: 'code',
        email,
        sentTo: email,
        code: st.step === 'code' ? st.code : '',
        resendAt: a.now + resendIn * 1000,
      };
    }
    case 'cooldown': // el servidor pidió esperar (rate_limited { retryIn })
      return st.step === 'code' ? { ...st, resendAt: a.now + a.secs * 1000 } : st;
    case 'code':
      return st.step === 'code' ? { ...st, code: cleanCode(a.value) } : st;
    case 'verified':
      if (st.step !== 'code' || !codeComplete(st.code)) return st;
      return { ...st, step: 'where', token: a.token ?? 'ok', tokenUntil: a.now + (a.expiresIn ?? 1800) * 1000 };
    case 'changeEmail':
      return st.step === 'code' ? { ...st, step: 'email', code: '', token: null } : st;
    case 'query':
      return st.step === 'where' ? { ...st, query: String(a.value ?? '') } : st;
    case 'pickWhere':
      return st.step === 'where' ? { ...st, where: a.id } : st;
    case 'pickType':
      return st.step === 'type' && TYPES.includes(a.value) ? { ...st, type: a.value } : st;
    case 'text':
      return st.step === 'text' ? { ...st, text: String(a.value ?? '').slice(0, MAX_TEXT) } : st;
    case 'meta':
      return st.step === 'text' ? { ...st, meta: !!a.on } : st;
    case 'next':
      if (st.step === 'where' && st.where) return { ...st, step: 'type', query: '' };
      if (st.step === 'type' && TYPES.includes(st.type)) return { ...st, step: 'text' };
      return st;
    case 'back':
      if (st.step === 'code') return { ...st, step: 'email', code: '', token: null };
      if (st.step === 'type') return { ...st, step: 'where' };
      if (st.step === 'text') return { ...st, step: 'type' };
      return st;
    case 'goto':
      // desde el detalle se puede volver a tocar "dónde" o "tipo" (las etiquetas de arriba)
      return st.step === 'text' && (a.step === 'where' || a.step === 'type') ? { ...st, step: a.step } : st;
    case 'sent':
      return st.step === 'text' ? { ...st, step: 'done', id: a.id ?? null } : st;
    case 'tokenExpired':
      return { ...st, step: 'email', code: '', token: null };
    case 'reset':
      return create({ email: st.email });
    default:
      return st;
  }
}

// ---------- datos para el backend ----------
/** Cuerpo de `POST /report`. `meta` solo viaja si el usuario dejó tildada la casilla. */
export function buildPayload(st, meta) {
  const p = { where: st.where, type: st.type, text: String(st.text).trim() };
  if (st.meta && meta) p.meta = meta;
  return p;
}

/** "Chrome · Android · ES": lo que se muestra junto a la casilla de datos del dispositivo. */
export function deviceLabel(ua = '', lang = 'es') {
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /chrome|crios|chromium/i.test(ua)
          ? 'Chrome'
          : /safari/i.test(ua)
            ? 'Safari'
            : '';
  const os = /android/i.test(ua)
    ? 'Android'
    : /iphone|ipad|ipod/i.test(ua)
      ? 'iOS'
      : /windows/i.test(ua)
        ? 'Windows'
        : /mac os|macintosh/i.test(ua)
          ? 'macOS'
          : /linux|x11|cros/i.test(ua)
            ? 'Linux'
            : '';
  return [browser, os, String(lang).toUpperCase()].filter(Boolean).join(' · ');
}
