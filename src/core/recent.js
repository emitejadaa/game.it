/**
 * Historial local de juegos jugados (solo ids y fechas; los juegos no guardan progreso).
 * Se usa para "Jugados recientemente" y para recomendar juegos parecidos.
 */
import { GAMES, byId } from './registry.js';

const KEY = 'gameit:recent';
const MAX = 12;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.filter((r) => r && byId(r.id)) : [];
  } catch {
    return [];
  }
}

export function track(id) {
  const list = read();
  const prev = list.find((r) => r.id === id);
  const next = [{ id, at: Date.now(), plays: (prev?.plays || 0) + 1 }, ...list.filter((r) => r.id !== id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export const recent = (n = 6) => read().slice(0, n).map((r) => byId(r.id));

/** Recomienda juegos no jugados que comparten categorías/tags con lo jugado, ponderado por recencia y partidas. */
export function recommend(n = 6) {
  const hist = read();
  if (!hist.length) return [];
  const played = new Set(hist.map((r) => r.id));
  const weight = new Map();
  hist.forEach((r, i) => {
    const g = byId(r.id);
    const w = (1 / (i + 1)) * Math.log2(1 + r.plays);
    [...g.categories, ...g.tags].forEach((k) => weight.set(k, (weight.get(k) || 0) + w));
  });
  return GAMES.filter((g) => !played.has(g.id))
    .map((g) => ({ g, score: [...g.categories, ...g.tags].reduce((s, k) => s + (weight.get(k) || 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.g);
}
