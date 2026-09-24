/**
 * Base para partidas "en paralelo" en tiempo real (Drift Neon, Doodle): el servidor fija el inicio
 * sincronizado, reenvía la posición de cada jugador a los demás y arma la tabla final.
 * La física corre en cada cliente; el servidor valida tiempos/puntajes para evitar trampas groseras.
 */
const STATE_MIN_MS = 45; // como mucho ~22 estados por segundo por jugador

export function raceGame({ maxPlayers = 4, countdownMs = 4000, maxMs = 10 * 60e3, graceAfterFirstMs = 45e3, defaults = {}, settings, onStart, validateFinish, rank }) {
  function finish(room, api) {
    const d = room.data;
    if (!d || d.over) return;
    d.over = true;
    const done = [...d.results];
    for (const p of api.players()) if (!done.some((r) => r.id === p.id)) done.push({ id: p.id, name: p.name, color: p.color, dnf: true, ...(d.partial?.[p.id] || {}) });
    api.end({ results: rank(done) });
  }

  function maybeEnd(room, api) {
    const d = room.data;
    const alive = api.players().filter((p) => p.connected && !d.results.some((r) => r.id === p.id));
    if (!alive.length) finish(room, api);
  }

  return {
    minPlayers: 1,
    maxPlayers,
    defaults,
    settings,
    view(room) {
      const d = room.data;
      return d ? { race: { startAt: d.startAt, ...d.pub, results: d.results } } : { race: null };
    },
    start(room, api) {
      room.data = { startAt: Date.now() + countdownMs, results: [], last: new Map(), pub: {}, partial: {}, over: false };
      onStart(room, room.data);
      api.setTimer('max', countdownMs + maxMs, () => finish(room, api));
    },
    message(room, api, p, msg) {
      const d = room.data;
      if (msg.t === 'state') {
        const now = Date.now();
        if (now - (d.last.get(p.id) || 0) < STATE_MIN_MS) return;
        d.last.set(p.id, now);
        const s = Array.isArray(msg.s) ? msg.s.slice(0, 8).map(Number) : null;
        if (!s || s.some((v) => !Number.isFinite(v))) return false;
        api.broadcast({ t: 'state', id: p.id, s }, p.id);
        return;
      }
      if (msg.t === 'finish') {
        if (d.results.some((r) => r.id === p.id)) return;
        const r = validateFinish(room, d, p, msg);
        if (!r) return false;
        const entry = { id: p.id, name: p.name, color: p.color, ...r };
        d.results.push(entry);
        api.broadcast({ t: 'finished', ...entry, place: d.results.length });
        api.touch();
        if (d.results.length === 1 && graceAfterFirstMs) api.setTimer('grace', graceAfterFirstMs, () => finish(room, api));
        maybeEnd(room, api);
        api.sync();
      }
    },
    leave(room, api) {
      maybeEnd(room, api);
    },
    onDisconnect(room, api) {
      maybeEnd(room, api);
    },
  };
}
