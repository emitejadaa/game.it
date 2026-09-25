/**
 * Datos técnicos que acompañan a un reporte si la persona lo permite: versión publicada,
 * dispositivo, preferencias y los últimos errores de JavaScript del portal y de los juegos
 * (los juegos los mandan por el SDK). Nada personal: ni correo, ni historial, ni cookies.
 * Los errores viven solo en memoria mientras la pestaña está abierta.
 */
/* global __BUILD__ */
import * as prefs from './prefs.js';
import { platform } from './device.js';

const MAX = 20;
const errors = [];

const clip = (v, n) => String(v ?? '').slice(0, n);
const shortFile = (f) => clip(f, 300).replace(location.origin, '');

/** Registra un error. `src`: 'portal' o el id del juego. */
export function record(src, e) {
  const entry = {
    at: new Date().toISOString(),
    src,
    message: clip(e.message, 300),
    file: shortFile(e.source || e.file),
    line: +e.line || 0,
    col: +e.col || 0,
    stack: clip(e.stack, 1200),
    count: 1,
  };
  const last = errors[errors.length - 1];
  if (last && last.src === src && last.message === entry.message && last.file === entry.file) {
    last.count++;
    last.at = entry.at;
    return;
  }
  errors.push(entry);
  if (errors.length > MAX) errors.shift();
}

export function listen() {
  addEventListener('error', (e) => {
    if (!e.filename && e.message === 'Script error.') return; // scripts de otros dominios (anuncios): sin datos útiles
    record('portal', { message: e.message, source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack });
  });
  addEventListener('unhandledrejection', (e) =>
    record('portal', { message: `unhandled rejection: ${e.reason?.message ?? e.reason}`, stack: e.reason?.stack }),
  );
}

/** Lo que se envía con el reporte (y lo que la persona ve en "Ver qué se envía"). */
export function snapshot(gameId) {
  const p = prefs.get();
  const r = prefs.resolved();
  const conn = navigator.connection;
  return {
    build: typeof __BUILD__ === 'object' ? __BUILD__ : null,
    page: location.pathname + location.hash,
    game: gameId || null,
    platform: platform(),
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    screen: `${screen.width}×${screen.height} @${Math.round(devicePixelRatio * 100) / 100}x`,
    viewport: `${innerWidth}×${innerHeight}`,
    cores: navigator.hardwareConcurrency || null,
    memoryGb: navigator.deviceMemory || null,
    touchPoints: navigator.maxTouchPoints || 0,
    network: conn ? { type: conn.effectiveType || null, rttMs: conn.rtt ?? null } : null,
    online: navigator.onLine,
    prefs: { theme: r.theme, reducedMotion: r.reducedMotion, glow: p.glow, showFps: p.showFps, keys: p.keys, touch: p.touch, lang: p.lang },
    errors: errors.filter((e) => e.src === 'portal' || e.src === gameId).slice(-10),
  };
}
