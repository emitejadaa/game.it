import games from 'virtual:games';
import { pick } from './i18n.js';

export const CATEGORIES = [
  'arcade',
  'aventura',
  'accion',
  'puzzle',
  'deporte',
  'carreras',
  'estrategia',
  'historia',
  'online',
  'multijugador',
  'clasicos',
  'casual',
];

const base = (id) => `/games/${id}/`;
const isAbsolute = (u) => /^https?:\/\//.test(u);

/** Normaliza los game.json: completa rutas y valores por defecto. */
export const GAMES = games
  .map((g) => ({
    categories: [],
    tags: [],
    sdk: true,
    orientation: 'any',
    order: 100,
    ...g,
    entry: isAbsolute(g.entry || '') ? g.entry : base(g.id) + (g.entry || 'index.html'),
    thumbnail: g.thumbnail ? (isAbsolute(g.thumbnail) ? g.thumbnail : base(g.id) + g.thumbnail) : null,
  }))
  .sort((a, b) => a.order - b.order || String(pick(a.title)).localeCompare(pick(b.title)));

export const byId = (id) => GAMES.find((g) => g.id === id);

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Búsqueda por título, categorías y tags (sin acentos, por palabras). */
export function search(query, category, catLabel) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return GAMES.filter((g) => {
    if (category && category !== 'all' && !g.categories.includes(category)) return false;
    if (!words.length) return true;
    const hay = norm(
      [pick(g.title), pick(g.description), ...g.tags, ...g.categories, ...g.categories.map(catLabel)].join(' '),
    );
    return words.every((w) => hay.includes(w));
  });
}
