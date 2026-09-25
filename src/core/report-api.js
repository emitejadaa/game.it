/**
 * Cliente de la API de reportes. Contrato que implementa el servidor (JSON en ambos sentidos):
 *
 *   POST {endpoint}/code     { email, lang, website, captcha? }
 *        → 200 { resendIn, expiresIn }            manda un código de 6 dígitos al correo
 *   POST {endpoint}/verify   { email, code }
 *        → 200 { token, expiresAt, left }         token de sesión (días), left = reportes que quedan hoy
 *   POST {endpoint}          { game, kind, freq, text, notify, context, website, elapsed }
 *        Authorization: Bearer <token>
 *        → 201 { id, left }
 *
 *   kind: 'bug' | 'idea' | 'other'   freq: 'always' | 'sometimes' | 'once' | null
 *   website: campo trampa (lo completan solo los bots)   elapsed: ms desde que se mostró el formulario
 *
 * Errores: 4xx/5xx con { error, retryIn?, attemptsLeft? }. Códigos:
 *   invalid_email · disposable · blocked · captcha · rate_limited · bad_code · expired ·
 *   too_many_attempts · session · quota · too_short · too_long · duplicate · server
 *   (y 'network' lo genera este cliente si no hay respuesta).
 *
 * Sin `endpoint` (modo demo) responde un servidor simulado en el navegador con los mismos
 * límites que va a tener el real. Para probar los errores: un correo que empiece con
 * "bloqueado@" está bloqueado y los de dominios temporales (mailinator.com…) se rechazan.
 */
import cfg from '../report.config.js';

export const demo = !cfg.endpoint;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normEmail = (e) => String(e || '').trim().toLowerCase();

const ok = (data) => ({ ok: true, ...data });
const fail = (error, extra) => ({ ok: false, error, ...extra });

// ------------------------------------------------------------------ servidor real
async function call(path, body, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(cfg.endpoint.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      credentials: 'omit',
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return ok(data);
    const fallback = res.status === 401 ? 'session' : res.status === 429 ? 'rate_limited' : 'server';
    return fail(typeof data.error === 'string' ? data.error : fallback, {
      retryIn: +data.retryIn || 0,
      attemptsLeft: data.attemptsLeft ?? null,
    });
  } catch {
    return fail('network');
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ servidor simulado (modo demo)
const DB_KEY = 'gameit:report:demo';
const L = {
  codeTtl: 10 * 60e3, // el código vence a los 10 minutos
  resendSec: 60, // espera entre códigos para el mismo correo
  codesPerHour: 5,
  attempts: 5, // intentos por código
  perDay: 5, // reportes por correo cada 24 h
  sessionMs: cfg.sessionDays * 864e5,
  dupMs: 10 * 60e3, // mismo texto repetido dentro de esta ventana = duplicado
  minFillMs: 3000, // escrito en menos tiempo: se marca como sospechoso (no se descarta)
};
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com', 'temp-mail.org', 'tempmail.com',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'maildrop.cc', 'dispostable.com', 'throwawaymail.com',
]);
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const latency = () => new Promise((r) => setTimeout(r, 450 + Math.random() * 450));
const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

function load() {
  try {
    const db = JSON.parse(localStorage.getItem(DB_KEY));
    if (db && typeof db === 'object') return { codes: db.codes || {}, reports: db.reports || [] };
  } catch {}
  return { codes: {}, reports: [] };
}
function save(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {}
}

const leftToday = (db, email, now) =>
  L.perDay - db.reports.filter((r) => r.email === email && now - r.at < 864e5).length;

function sessionFrom(token) {
  try {
    const s = JSON.parse(atob(String(token).replace(/^demo\./, '')));
    return s && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

const fake = {
  async code({ email, website }) {
    await latency();
    email = normEmail(email);
    if (!EMAIL_RE.test(email) || email.length > 254) return fail('invalid_email');
    if (DISPOSABLE.has(email.split('@')[1])) return fail('disposable');
    if (email.startsWith('bloqueado@')) return fail('blocked');
    const db = load();
    const now = Date.now();
    const rec = db.codes[email] || { sent: [] };
    rec.sent = rec.sent.filter((t) => now - t < 3600e3);
    const last = rec.sent[rec.sent.length - 1] || 0;
    if (now - last < L.resendSec * 1000) return fail('rate_limited', { retryIn: Math.ceil((last + L.resendSec * 1000 - now) / 1000) });
    if (rec.sent.length >= L.codesPerHour) return fail('rate_limited', { retryIn: Math.ceil((rec.sent[0] + 3600e3 - now) / 1000) });
    if (website) return ok({ resendIn: L.resendSec, expiresIn: L.codeTtl / 1000 }); // bot: no se "manda" nada
    rec.sent.push(now);
    rec.code = String(rand(1e6)).padStart(cfg.codeLength, '0');
    rec.exp = now + L.codeTtl;
    rec.attempts = 0;
    db.codes[email] = rec;
    save(db);
    return ok({ resendIn: L.resendSec, expiresIn: L.codeTtl / 1000, demoCode: rec.code });
  },

  async verify({ email, code }) {
    await latency();
    email = normEmail(email);
    const db = load();
    const rec = db.codes[email];
    const now = Date.now();
    if (!rec?.code) return fail('expired');
    if (rec.attempts >= L.attempts) return fail('too_many_attempts');
    if (now > rec.exp) return fail('expired');
    if (String(code) !== rec.code) {
      rec.attempts++;
      save(db);
      const attemptsLeft = L.attempts - rec.attempts;
      return attemptsLeft > 0 ? fail('bad_code', { attemptsLeft }) : fail('too_many_attempts');
    }
    rec.code = null; // un código sirve una sola vez
    save(db);
    const exp = now + L.sessionMs;
    return ok({ token: 'demo.' + btoa(JSON.stringify({ email, exp })), expiresAt: exp, left: leftToday(db, email, now) });
  },

  async report(token, r) {
    await latency();
    const s = sessionFrom(token);
    if (!s) return fail('session');
    const db = load();
    const now = Date.now();
    const text = String(r.text || '').trim();
    if (text.length < cfg.minChars) return fail('too_short');
    if (text.length > cfg.maxChars) return fail('too_long');
    const mine = db.reports.filter((x) => x.email === s.email && now - x.at < 864e5);
    if (mine.length >= L.perDay) return fail('quota', { retryIn: Math.ceil((mine[0].at + 864e5 - now) / 1000) });
    const norm = text.toLowerCase().replace(/\s+/g, ' ');
    if (mine.some((x) => now - x.at < L.dupMs && x.norm === norm)) return fail('duplicate');
    let id = 'R-';
    for (let i = 0; i < 5; i++) id += ID_ALPHABET[rand(ID_ALPHABET.length)];
    // bot (completó el campo trampa): el servidor responde igual pero no guarda nada
    if (r.website) return ok({ id, left: L.perDay - mine.length - 1 });
    const saved = { id, at: now, email: s.email, norm, ...r, text, suspect: !(r.elapsed >= L.minFillMs) };
    db.reports = [...db.reports, saved].slice(-50);
    save(db);
    console.info('[game.it · reportes demo] reporte que recibiría el servidor:', saved);
    return ok({ id, left: L.perDay - mine.length - 1 });
  },
};

// ------------------------------------------------------------------ API pública
export const requestCode = (body) => (demo ? fake.code(body) : call('/code', body));
export const verifyCode = (body) => (demo ? fake.verify(body) : call('/verify', body));
export const sendReport = (token, report) => (demo ? fake.report(token, report) : call('', report, token));
