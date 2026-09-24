/**
 * Evolución — motor del juego (sin DOM, se puede simular en Node).
 *
 * Economía: una sola moneda (Energía). 6 eras con 4 criaturas cada una (costo ×1.15 por unidad).
 * En cada evolución se elige 1 de 3 rumbos (árbol de decisiones de la partida). Al extinguirte
 * (prestigio) ganás ADN ancestral para el árbol de mutaciones permanente.
 */

// ================= datos =================
export const ERAS = [
  { id: 'soup', name: { es: 'Sopa primordial', en: 'Primordial soup' }, evo: 0 },
  { id: 'ocean', name: { es: 'Océano', en: 'Ocean' }, evo: 1e5 },
  { id: 'land', name: { es: 'Tierra firme', en: 'Dry land' }, evo: 3e8 },
  { id: 'civ', name: { es: 'Civilización', en: 'Civilization' }, evo: 2e12 },
  { id: 'space', name: { es: 'Espacio', en: 'Outer space' }, evo: 5e16 },
  { id: 'cosmos', name: { es: 'Cosmos', en: 'Cosmos' }, evo: 1e22 },
];

const g = (id, era, es, en, base, prod, des, den) => ({ id, era, name: { es, en }, desc: { es: des, en: den }, base, prod });
export const GENS = [
  g('amino', 0, 'Aminoácido', 'Amino acid', 15, 0.1, 'Las piezas de la vida, flotando.', 'The building blocks of life, adrift.'),
  g('proto', 0, 'Protocélula', 'Protocell', 100, 1, 'Una burbuja que se niega a reventar.', 'A bubble that refuses to pop.'),
  g('ribo', 0, 'Ribosoma', 'Ribosome', 1100, 8, 'Fabrica proteínas sin descanso.', 'Builds proteins nonstop.'),
  g('mito', 0, 'Mitocondria', 'Mitochondrion', 12000, 47, 'La central eléctrica de la célula.', 'The powerhouse of the cell.'),
  g('alga', 1, 'Alga', 'Alga', 1.3e5, 260, 'Convierte la luz en energía.', 'Turns light into energy.'),
  g('jelly', 1, 'Medusa', 'Jellyfish', 1.4e6, 1400, 'Flota, brilla y no piensa.', 'Floats, glows, thinks of nothing.'),
  g('trilo', 1, 'Trilobite', 'Trilobite', 2e7, 7800, 'Armadura para el fondo del mar.', 'Armor for the seabed.'),
  g('fish', 1, 'Pez', 'Fish', 3.3e8, 44000, 'Aletas, escamas y ambición.', 'Fins, scales and ambition.'),
  g('frog', 2, 'Anfibio', 'Amphibian', 5.1e9, 2.6e5, 'Un pie en el agua y otro en tierra.', 'One foot in water, one on land.'),
  g('lizard', 2, 'Reptil', 'Reptile', 7.5e10, 1.6e6, 'Toma sol y conquista desiertos.', 'Sunbathes and conquers deserts.'),
  g('dino', 2, 'Dinosaurio', 'Dinosaur', 1e12, 1e7, 'Enorme, ruidoso y encantador.', 'Huge, loud and charming.'),
  g('mammal', 2, 'Mamífero', 'Mammal', 1.4e13, 6.5e7, 'Pelo, leche y curiosidad.', 'Fur, milk and curiosity.'),
  g('tribe', 3, 'Tribu', 'Tribe', 1.7e14, 4.3e8, 'Fuego, historias y cooperación.', 'Fire, stories and teamwork.'),
  g('village', 3, 'Aldea', 'Village', 2.1e15, 2.9e9, 'Cosechas y primeros mercados.', 'Harvests and first markets.'),
  g('city', 3, 'Ciudad', 'City', 2.6e16, 2.1e10, 'Luces que no se apagan.', 'Lights that never go out.'),
  g('factory', 3, 'Fábrica', 'Factory', 3.1e17, 1.5e11, 'Engranajes que sueñan con estrellas.', 'Gears dreaming of stars.'),
  g('sat', 4, 'Satélite', 'Satellite', 7.1e18, 1.1e12, 'Ojos en órbita.', 'Eyes in orbit.'),
  g('moon', 4, 'Colonia lunar', 'Moon colony', 1.2e20, 8.3e12, 'Casas bajo cúpulas de vidrio.', 'Homes under glass domes.'),
  g('station', 4, 'Estación orbital', 'Orbital station', 1.9e21, 6.4e13, 'Una ciudad que gira.', 'A spinning city.'),
  g('dyson', 4, 'Esfera de Dyson', 'Dyson sphere', 3e22, 5.1e14, 'Abrazar una estrella entera.', 'Hugging a whole star.'),
  g('ark', 5, 'Nave generacional', 'Generation ship', 5e24, 4e15, 'Siglos de viaje, siglos de vida.', 'Centuries of travel and life.'),
  g('galaxy', 5, 'Galaxia', 'Galaxy', 8e25, 3.2e16, 'Cien mil millones de soles propios.', 'A hundred billion suns of your own.'),
  g('cluster', 5, 'Cúmulo galáctico', 'Galaxy cluster', 1.3e27, 2.6e17, 'Galaxias que bailan juntas.', 'Galaxies dancing together.'),
  g('baby', 5, 'Universo bebé', 'Baby universe', 2e28, 2.1e18, 'Un cosmos nuevo, recién nacido.', 'A brand-new cosmos.'),
];
export const GEN_BY_ID = Object.fromEntries(GENS.map((x) => [x.id, x]));

/** Rumbos: uno por evolución (índice = era destino - 1). */
export const PATHS = [
  [
    { id: 'pred', name: { es: 'Depredador', en: 'Predator' }, desc: { es: 'Clics ×6, +1% de la producción por clic y 5% de críticos (×20).', en: 'Clicks ×6, +1% of production per click and 5% criticals (×20).' } },
    { id: 'symb', name: { es: 'Simbionte', en: 'Symbiont' }, desc: { es: 'Cada tipo de criatura que tengas da +3% de producción.', en: 'Each creature type you own gives +3% production.' } },
    { id: 'mut', name: { es: 'Mutante', en: 'Mutant' }, desc: { es: 'Mutaciones doradas el doble de seguido y 50% más largas.', en: 'Golden mutations twice as often and 50% longer.' } },
  ],
  [
    { id: 'herd', name: { es: 'Manada', en: 'Herd' }, desc: { es: '+2% de producción por cada 10 criaturas.', en: '+2% production per 10 creatures.' } },
    { id: 'slow', name: { es: 'Metabolismo lento', en: 'Slow metabolism' }, desc: { es: 'Todas las criaturas cuestan 20% menos.', en: 'All creatures cost 20% less.' } },
    { id: 'brain', name: { es: 'Neuronas', en: 'Neurons' }, desc: { es: '+25% de producción y cada clic suma 2% de la producción.', en: '+25% production and each click adds 2% of production.' } },
  ],
  [
    { id: 'war', name: { es: 'Conquista', en: 'Conquest' }, desc: { es: 'Habilidad: ganá 20 min de producción al instante (recarga 8 min).', en: 'Ability: gain 20 min of production instantly (8 min cooldown).' } },
    { id: 'trade', name: { es: 'Comercio', en: 'Trade' }, desc: { es: 'Interés: +0,03%/s de tu energía (hasta 5× tu producción).', en: 'Interest: +0.03%/s of your energy (up to 5× production).' } },
    { id: 'sci', name: { es: 'Ciencia', en: 'Science' }, desc: { es: 'Un autoclic hace 8 clics por segundo.', en: 'An autoclicker does 8 clicks per second.' } },
  ],
  [
    { id: 'expand', name: { es: 'Expansión', en: 'Expansion' }, desc: { es: '×1,4 de producción por cada era alcanzada.', en: '×1.4 production per era reached.' } },
    { id: 'machine', name: { es: 'Máquinas', en: 'Machines' }, desc: { es: 'Criaturas de Civilización y Espacio producen ×3.', en: 'Civilization and Space creatures produce ×3.' } },
    { id: 'harmony', name: { es: 'Armonía', en: 'Harmony' }, desc: { es: 'Mutaciones doradas el doble de fuertes y 50% más seguido.', en: 'Golden mutations twice as strong and 50% more frequent.' } },
  ],
  [
    { id: 'trans', name: { es: 'Trascendencia', en: 'Transcendence' }, desc: { es: '×2 de ADN ancestral al extinguirte.', en: '×2 ancestral DNA when you go extinct.' } },
    { id: 'entropy', name: { es: 'Entropía', en: 'Entropy' }, desc: { es: '+10% de producción por cada cifra de tu energía.', en: '+10% production per digit of your energy.' } },
    { id: 'sing', name: { es: 'Singularidad', en: 'Singularity' }, desc: { es: 'Cada clic suma 10% de tu producción por segundo.', en: 'Each click adds 10% of your production per second.' } },
  ],
];

/** Árbol de mutaciones permanente (se compra con ADN ancestral). */
export const TREE = [
  { id: 'f1', br: 0, cost: 1, name: { es: 'Genes resistentes', en: 'Tough genes' }, desc: { es: '+15% de producción.', en: '+15% production.' } },
  { id: 'f2', br: 0, cost: 5, req: 'f1', name: { es: 'ADN basura útil', en: 'Useful junk DNA' }, desc: { es: '+35% de producción.', en: '+35% production.' } },
  { id: 'f3', br: 0, cost: 20, req: 'f2', name: { es: 'Memoria genética', en: 'Genetic memory' }, desc: { es: 'Empezás con 10 aminoácidos y 5 protocélulas.', en: 'Start with 10 amino acids and 5 protocells.' } },
  { id: 'f4', br: 0, cost: 80, req: 'f3', name: { es: 'Hiperevolución', en: 'Hyperevolution' }, desc: { es: 'Producción ×2.', en: 'Production ×2.' } },
  { id: 'f5', br: 0, cost: 300, req: 'f4', name: { es: 'Panspermia', en: 'Panspermia' }, desc: { es: 'Las evoluciones cuestan 90% menos.', en: 'Evolutions cost 90% less.' } },
  { id: 'f6', br: 0, cost: 1500, req: 'f5', name: { es: 'Eternidad', en: 'Eternity' }, desc: { es: 'Producción ×3.', en: 'Production ×3.' } },
  { id: 'i1', br: 1, cost: 1, name: { es: 'Reflejos', en: 'Reflexes' }, desc: { es: 'Clics ×2.', en: 'Clicks ×2.' } },
  { id: 'i2', br: 1, cost: 5, req: 'i1', name: { es: 'Olfato', en: 'Keen senses' }, desc: { es: 'Mutaciones doradas 30% más seguido.', en: 'Golden mutations 30% more often.' } },
  { id: 'i3', br: 1, cost: 20, req: 'i2', name: { es: 'Garras de hueso', en: 'Bone claws' }, desc: { es: 'Cada clic suma 1% de la producción.', en: 'Each click adds 1% of production.' } },
  { id: 'i4', br: 1, cost: 80, req: 'i3', name: { es: 'Suerte ancestral', en: 'Ancestral luck' }, desc: { es: 'Efectos de mutaciones doradas +50%.', en: 'Golden mutation effects +50%.' } },
  { id: 'i5', br: 1, cost: 300, req: 'i4', name: { es: 'Frenesí eterno', en: 'Eternal frenzy' }, desc: { es: 'Los frenesíes duran el doble.', en: 'Frenzies last twice as long.' } },
  { id: 'i6', br: 1, cost: 1500, req: 'i5', name: { es: 'Instinto divino', en: 'Divine instinct' }, desc: { es: '10% de clics críticos ×50 en cualquier rumbo.', en: '10% critical clicks ×50 on any path.' } },
  { id: 'a1', br: 2, cost: 1, name: { es: 'Eficiencia', en: 'Efficiency' }, desc: { es: 'Criaturas 7% más baratas.', en: 'Creatures 7% cheaper.' } },
  { id: 'a2', br: 2, cost: 5, req: 'a1', name: { es: 'Herencia', en: 'Inheritance' }, desc: { es: 'Empezás cada vida con 5.000 de energía.', en: 'Start every life with 5,000 energy.' } },
  { id: 'a3', br: 2, cost: 20, req: 'a2', name: { es: 'Plasticidad', en: 'Plasticity' }, desc: { es: 'Los rumbos son 50% más fuertes.', en: 'Paths are 50% stronger.' } },
  { id: 'a4', br: 2, cost: 80, req: 'a3', name: { es: 'Especiación', en: 'Speciation' }, desc: { es: '+10% de producción por cada rumbo elegido.', en: '+10% production per chosen path.' } },
  { id: 'a5', br: 2, cost: 300, req: 'a4', name: { es: 'Híbridos', en: 'Hybrids' }, desc: { es: 'En cada evolución elegís 2 rumbos.', en: 'Pick 2 paths at every evolution.' } },
  { id: 'a6', br: 2, cost: 1500, req: 'a5', name: { es: 'Omnievolución', en: 'Omnievolution' }, desc: { es: 'Todos los rumbos quedan activos.', en: 'Every path is active.' } },
];
export const TREE_BY_ID = Object.fromEntries(TREE.map((n) => [n.id, n]));

// ---------------- mejoras ----------------
const TIER_AT = [1, 5, 25, 50, 100, 150, 200];
const TIER_COST = [10, 50, 500, 5e4, 5e6, 5e8, 5e10];
const TIER_NAME = {
  es: ['refinado', 'acelerado', 'simbiótico', 'blindado', 'cuántico', 'ancestral', 'trascendente'],
  en: ['refined', 'accelerated', 'symbiotic', 'armored', 'quantum', 'ancestral', 'transcendent'],
};
export const UPGRADES = [];
for (const gen of GENS)
  TIER_AT.forEach((at, k) =>
    UPGRADES.push({
      id: `${gen.id}${k}`,
      kind: 'gen',
      gen: gen.id,
      at,
      cost: gen.base * TIER_COST[k],
      name: { es: `${gen.name.es} ${TIER_NAME.es[k]}`, en: `${TIER_NAME.en[k][0].toUpperCase() + TIER_NAME.en[k].slice(1)} ${gen.name.en.toLowerCase()}` },
      desc: { es: `${gen.name.es}: producción ×2.`, en: `${gen.name.en}: production ×2.` },
    }),
  );
const CLICK_UP = [
  ['c0', 100, 10, 'Membrana sensible', 'Sensitive membrane', 'x2'],
  ['c1', 600, 60, 'Flagelo', 'Flagellum', 'x2'],
  ['c2', 1.5e4, 250, 'Reflejo celular', 'Cellular reflex', 'eps'],
  ['c3', 2e6, 600, 'Sistema nervioso', 'Nervous system', 'eps'],
  ['c4', 5e9, 1500, 'Pulgar oponible', 'Opposable thumb', 'eps'],
  ['c5', 2e14, 3000, 'Herramientas', 'Tools', 'eps'],
  ['c6', 1e19, 6000, 'Inteligencia artificial', 'Artificial intelligence', 'eps'],
  ['c7', 1e25, 10000, 'Voluntad cósmica', 'Cosmic will', 'eps'],
];
for (const [id, cost, clicks, es, en, eff] of CLICK_UP)
  UPGRADES.push({ id, kind: 'click', cost, clicks, eff, name: { es, en }, desc: eff === 'x2' ? { es: 'Clics ×2.', en: 'Clicks ×2.' } : { es: 'Cada clic suma 1% de tu producción.', en: 'Each click adds 1% of your production.' } });
const GLOBAL_UP = [
  ['Caldo espeso', 'Thick broth'],
  ['Corrientes cálidas', 'Warm currents'],
  ['Fotosíntesis', 'Photosynthesis'],
  ['Mareas', 'Tides'],
  ['Arrecifes', 'Reefs'],
  ['Cadena alimenticia', 'Food chain'],
  ['Selección natural', 'Natural selection'],
  ['Sangre caliente', 'Warm blood'],
  ['Migraciones', 'Migrations'],
  ['Lenguaje', 'Language'],
  ['Agricultura', 'Agriculture'],
  ['Electricidad', 'Electricity'],
  ['Cohetes', 'Rockets'],
  ['Fusión nuclear', 'Nuclear fusion'],
  ['Terraformación', 'Terraforming'],
  ['Materia oscura', 'Dark matter'],
  ['Agujeros de gusano', 'Wormholes'],
  ['Multiverso', 'Multiverse'],
];
GLOBAL_UP.forEach(([es, en], i) => {
  const era = Math.floor(i / 3);
  const k = i % 3;
  const base = era === 0 ? 3000 : ERAS[era].evo;
  UPGRADES.push({ id: `g${i}`, kind: 'global', era, cost: base * [0.6, 6, 60][k], mult: [1.1, 1.15, 1.25][k], name: { es, en }, desc: { es: `Producción +${[10, 15, 25][k]}%.`, en: `Production +${[10, 15, 25][k]}%.` } });
});
// mejoras exclusivas de cada rumbo
const PATH_UP = {
  pred: [['Colmillos', 'Fangs', 'crit ×2 de daño', 'critical ×2 power'], ['Cacería', 'Hunt', 'clics +5% de la producción', 'clicks +5% of production']],
  symb: [['Micorrizas', 'Mycorrhiza', 'simbiosis +2% por tipo', 'symbiosis +2% per type'], ['Ecosistema', 'Ecosystem', 'producción ×1.5', 'production ×1.5']],
  mut: [['Radiación', 'Radiation', 'mutaciones +50% más seguido', 'mutations 50% more often'], ['ADN inestable', 'Unstable DNA', 'efectos de mutación ×1.5', 'mutation effects ×1.5']],
  herd: [['Estampida', 'Stampede', 'manada: +1% por cada 5', 'herd: +1% per 5'], ['Líder alfa', 'Alpha leader', 'producción ×1.5', 'production ×1.5']],
  slow: [['Hibernación', 'Hibernation', 'criaturas otro 10% más baratas', 'creatures another 10% cheaper'], ['Longevidad', 'Longevity', 'producción ×1.6', 'production ×1.6']],
  brain: [['Corteza', 'Cortex', 'clics +3% de la producción', 'clicks +3% of production'], ['Conciencia', 'Consciousness', 'producción ×1.5', 'production ×1.5']],
  war: [['Imperio', 'Empire', 'Conquista da 40 min', 'Conquest gives 40 min'], ['Estrategia', 'Strategy', 'Conquista recarga en 5 min', 'Conquest recharges in 5 min']],
  trade: [['Rutas de seda', 'Silk roads', 'interés ×2', 'interest ×2'], ['Banca', 'Banking', 'tope de interés ×3', 'interest cap ×3']],
  sci: [['Microscopios', 'Microscopes', 'autoclic ×2', 'autoclicker ×2'], ['Método científico', 'Scientific method', 'mejoras 25% más baratas', 'upgrades 25% cheaper']],
  expand: [['Colonias', 'Colonies', 'expansión ×1.5 por era', 'expansion ×1.5 per era'], ['Frontera infinita', 'Endless frontier', 'producción ×1.5', 'production ×1.5']],
  machine: [['Autómatas', 'Automata', 'máquinas ×5', 'machines ×5'], ['Nanobots', 'Nanobots', 'producción ×1.5', 'production ×1.5']],
  harmony: [['Resonancia', 'Resonance', 'mutaciones duran ×1.5', 'mutations last ×1.5'], ['Gaia', 'Gaia', 'producción ×1.5', 'production ×1.5']],
  trans: [['Iluminación', 'Enlightenment', 'ADN ×1.5 más', 'DNA ×1.5 more'], ['Ascensión', 'Ascension', 'producción ×2', 'production ×2']],
  entropy: [['Caos', 'Chaos', 'entropía +5% por cifra', 'entropy +5% per digit'], ['Muerte térmica', 'Heat death', 'producción ×2', 'production ×2']],
  sing: [['Horizonte de eventos', 'Event horizon', 'clics +10% de la producción', 'clicks +10% of production'], ['Big Bang', 'Big Bang', 'producción ×2', 'production ×2']],
};
PATHS.forEach((opts, ti) =>
  opts.forEach((p) =>
    PATH_UP[p.id].forEach(([es, en, des, den], k) =>
      UPGRADES.push({ id: `${p.id}${k}`, kind: 'path', path: p.id, cost: ERAS[ti + 1].evo * [2, 40][k], name: { es, en }, desc: { es: des[0].toUpperCase() + des.slice(1) + '.', en: den[0].toUpperCase() + den.slice(1) + '.' } }),
    ),
  ),
);
export const UP_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// ================= utilidades =================
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg'];
export function fmtNum(n, dec = 2) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toLocaleString('es-AR');
  const e = Math.floor(Math.log10(n) / 3);
  if (e >= SUFFIX.length) return n.toExponential(2);
  const v = n / 10 ** (e * 3);
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : dec)} ${SUFFIX[e]}`;
}
export const totalGens = (s) => Object.values(s.gens).reduce((a, b) => a + b, 0);

// ---------------- logros ----------------
export const ACHIEVEMENTS = [];
const ach = (id, es, en, test) => ACHIEVEMENTS.push({ id, name: { es, en }, test });
[1e3, 1e6, 1e9, 1e12, 1e15, 1e18, 1e21, 1e24, 1e27, 1e30].forEach((v, i) =>
  ach(`e${i}`, `Energía: ${fmtNum(v)}`, `Energy: ${fmtNum(v)}`, (s) => s.total >= v),
);
[10, 100, 1000, 10000, 50000].forEach((v, i) => ach(`k${i}`, `${fmtNum(v)} clics`, `${fmtNum(v)} clicks`, (s) => s.stats.clicks >= v));
ERAS.forEach((e, i) => i && ach(`era${i}`, `Llegaste a: ${e.name.es}`, `Reached: ${e.name.en}`, (s) => s.era >= i));
[1, 5, 10, 25].forEach((v, i) => ach(`p${i}`, `${v} extinción${v > 1 ? 'es' : ''}`, `${v} extinction${v > 1 ? 's' : ''}`, (s) => s.meta.prestiges >= v));
[1, 10, 50, 150].forEach((v, i) => ach(`m${i}`, `${v} ${v > 1 ? 'mutaciones doradas' : 'mutación dorada'}`, `${v} golden mutation${v > 1 ? 's' : ''}`, (s) => s.stats.events >= v));
[50, 250, 1000, 2500].forEach((v, i) => ach(`c${i}`, `${v} criaturas`, `${v} creatures`, (s) => totalGens(s) >= v));
[10, 1e4, 1e7, 1e10, 1e13, 1e16, 1e19, 1e22, 1e25].forEach((v, i) => ach(`s${i}`, `${fmtNum(v)} por segundo`, `${fmtNum(v)} per second`, (s) => s.eps >= v));
GENS.forEach((gg) => ach(`h${gg.id}`, `100 × ${gg.name.es}`, `100 × ${gg.name.en}`, (s) => (s.gens[gg.id] || 0) >= 100));
ach('allpaths', 'Recorriste 5 rumbos', 'Walked 5 paths', (s) => s.paths.length >= 5);
ach('tree6', 'Árbol frondoso (6 mutaciones)', 'Leafy tree (6 mutations)', (s) => s.meta.tree.length >= 6);
ach('tree18', 'Árbol completo', 'Complete tree', (s) => s.meta.tree.length >= 18);

// ================= estado =================
export function newMeta() {
  return { adn: 0, adnTotal: 0, tree: [], prestiges: 0, allTime: 0, bestEra: 0, achievements: [] };
}

export function newRun(meta) {
  const s = {
    v: 1,
    meta,
    energy: 0,
    total: 0,
    gens: {},
    upgrades: [],
    era: 0,
    paths: [],
    buffs: [],
    eps: 0,
    time: 0,
    abilityReady: 0,
    nextEvent: 90,
    stats: { clicks: 0, events: 0, crits: 0, spentClicks: 0 },
  };
  if (has(s, 'f3')) Object.assign(s.gens, { amino: 10, proto: 5 });
  if (has(s, 'a2')) s.energy = 5000;
  recalc(s);
  return s;
}

export const has = (s, treeId) => s.meta.tree.includes(treeId);
export const hasUp = (s, id) => s.upgrades.includes(id);
export function pathActive(s, id) {
  if (has(s, 'a6')) {
    const ti = PATHS.findIndex((o) => o.some((p) => p.id === id));
    return s.era > ti; // todos los rumbos de las eras alcanzadas
  }
  return s.paths.includes(id);
}
const pathPow = (s) => (has(s, 'a3') ? 1.5 : 1);

// ================= cálculos =================
function costMul(s) {
  let m = 1;
  if (pathActive(s, 'slow')) m *= 1 - 0.2 * pathPow(s);
  if (hasUp(s, 'slow0')) m *= 0.9;
  if (has(s, 'a1')) m *= 0.93;
  return Math.max(0.3, m);
}

export function genCost(s, id, n = 1) {
  const gg = GEN_BY_ID[id];
  const owned = s.gens[id] || 0;
  const r = 1.15;
  return (gg.base * costMul(s) * r ** owned * (r ** n - 1)) / (r - 1);
}

export function maxAffordable(s, id) {
  const gg = GEN_BY_ID[id];
  const owned = s.gens[id] || 0;
  const r = 1.15;
  const unit = gg.base * costMul(s) * r ** owned;
  if (s.energy < unit) return 0;
  return Math.floor(Math.log((s.energy * (r - 1)) / unit + 1) / Math.log(r));
}

export function upgradeCost(s, u) {
  let c = u.cost;
  if (pathActive(s, 'sci') && hasUp(s, 'sci1')) c *= 0.75;
  return c;
}

export function evoCost(s) {
  const next = ERAS[s.era + 1];
  if (!next) return Infinity;
  return next.evo * (has(s, 'f5') ? 0.1 : 1);
}

/** Multiplicador de producción de una criatura. */
export function genMult(s, gg) {
  let m = 1;
  for (let k = 0; k < 7; k++) if (hasUp(s, `${gg.id}${k}`)) m *= 2;
  if (pathActive(s, 'machine') && (gg.era === 3 || gg.era === 4)) m *= (hasUp(s, 'machine0') ? 5 : 3) * (pathPow(s) > 1 ? 1.5 : 1);
  return m;
}

/** Multiplicador global (todo lo que afecta a la producción entera). */
export function globalMult(s) {
  let m = 1;
  for (const u of s.upgrades) {
    const up = UP_BY_ID[u];
    if (up?.kind === 'global') m *= up.mult;
  }
  const P = pathPow(s);
  if (pathActive(s, 'symb')) m *= 1 + (hasUp(s, 'symb0') ? 0.05 : 0.03) * P * GENS.filter((x) => (s.gens[x.id] || 0) > 0).length;
  if (pathActive(s, 'herd')) m *= 1 + 0.02 * P * Math.floor(totalGens(s) / (hasUp(s, 'herd0') ? 5 : 10));
  if (pathActive(s, 'brain')) m *= 1 + 0.25 * P;
  if (pathActive(s, 'expand')) m *= ((hasUp(s, 'expand0') ? 1.5 : 1.4) * (P > 1 ? 1.1 : 1)) ** (s.era + 1);
  if (pathActive(s, 'entropy')) m *= 1 + (hasUp(s, 'entropy0') ? 0.15 : 0.1) * P * Math.max(0, Math.log10(Math.max(1, s.energy)));
  for (const id of ['symb1', 'herd1', 'brain1', 'expand1', 'machine1', 'harmony1']) if (hasUp(s, id)) m *= 1.5;
  if (hasUp(s, 'slow1')) m *= 1.6;
  for (const id of ['trans1', 'entropy1', 'sing1']) if (hasUp(s, id)) m *= 2;
  // árbol
  if (has(s, 'f1')) m *= 1.15;
  if (has(s, 'f2')) m *= 1.35;
  if (has(s, 'f4')) m *= 2;
  if (has(s, 'f6')) m *= 3;
  if (has(s, 'a4')) m *= 1 + 0.1 * s.paths.length;
  // cada evolución multiplica la producción ×1,5
  m *= 1.5 ** s.era;
  // ADN sin gastar: +1% cada uno; logros: +1% cada uno
  m *= 1 + 0.01 * s.meta.adn;
  m *= 1 + 0.01 * s.meta.achievements.length;
  // mutaciones activas
  for (const b of s.buffs) if (b.type === 'frenzy') m *= b.mult;
  return m;
}

export function recalc(s) {
  const gm = globalMult(s);
  let base = 0;
  for (const gg of GENS) {
    const n = s.gens[gg.id] || 0;
    if (n) base += n * gg.prod * genMult(s, gg);
  }
  s.eps = base * gm;
  s.clickVal = clickValue(s);
  return s.eps;
}

/** Producción por segundo de UNA unidad de esa criatura (con todos los multiplicadores). */
export function unitEps(s, id, gm = globalMult(s)) {
  const gg = GEN_BY_ID[id];
  return gg.prod * genMult(s, gg) * gm;
}

/** Energía por segundo del autoclic de la Ciencia (0 si no está activo). */
export function autoClickRate(s) {
  if (!pathActive(s, 'sci')) return 0;
  return s.clickVal * 8 * (hasUp(s, 'sci0') ? 2 : 1) * pathPow(s);
}

export function clickValue(s) {
  let v = 1;
  if (hasUp(s, 'c0')) v *= 2;
  if (hasUp(s, 'c1')) v *= 2;
  if (has(s, 'i1')) v *= 2;
  if (pathActive(s, 'pred')) v *= 6 * pathPow(s);
  let epsPct = 0;
  for (let i = 2; i < 8; i++) if (hasUp(s, `c${i}`)) epsPct += 0.01;
  if (has(s, 'i3')) epsPct += 0.01;
  if (pathActive(s, 'brain')) epsPct += 0.02 * pathPow(s) + (hasUp(s, 'brain0') ? 0.03 : 0);
  if (pathActive(s, 'pred')) epsPct += 0.01 + (hasUp(s, 'pred1') ? 0.05 : 0);
  if (pathActive(s, 'sing')) epsPct += 0.1 * pathPow(s) + (hasUp(s, 'sing0') ? 0.1 : 0);
  v += s.eps * epsPct;
  for (const b of s.buffs) if (b.type === 'clickfrenzy') v *= b.mult;
  return v;
}

// ================= acciones =================
/** Clic sobre el organismo. Devuelve { value, crit }. */
export function click(s, rnd = Math.random) {
  let v = s.clickVal;
  let crit = false;
  const critChance = (pathActive(s, 'pred') ? 0.05 : 0) + (has(s, 'i6') ? 0.1 : 0);
  if (critChance && rnd() < critChance) {
    crit = true;
    v *= has(s, 'i6') ? 50 : 20 * (hasUp(s, 'pred0') ? 2 : 1);
    s.stats.crits++;
  }
  gain(s, v);
  s.stats.clicks++;
  return { value: v, crit };
}

export function gain(s, v) {
  s.energy += v;
  s.total += v;
  s.meta.allTime += v;
}

export function buyGen(s, id, n = 1) {
  const gg = GEN_BY_ID[id];
  if (!gg || gg.era > s.era || n < 1) return false;
  const c = genCost(s, id, n);
  if (c > s.energy) return false;
  s.energy -= c;
  s.gens[id] = (s.gens[id] || 0) + n;
  recalc(s);
  return true;
}

/** Mejoras visibles ahora (desbloqueadas y no compradas), ordenadas por precio. */
export function availableUpgrades(s) {
  return UPGRADES.filter((u) => {
    if (hasUp(s, u.id)) return false;
    if (u.kind === 'gen') return (s.gens[u.gen] || 0) >= u.at;
    if (u.kind === 'click') return s.stats.clicks >= u.clicks && s.total >= u.cost * 0.3;
    if (u.kind === 'global') return s.era >= u.era && s.total >= u.cost * 0.2;
    if (u.kind === 'path') return pathActive(s, u.path);
    return false;
  }).sort((a, b) => upgradeCost(s, a) - upgradeCost(s, b));
}

export function buyUpgrade(s, id) {
  const u = UP_BY_ID[id];
  if (!u || hasUp(s, id)) return false;
  const c = upgradeCost(s, u);
  if (c > s.energy) return false;
  s.energy -= c;
  s.upgrades.push(id);
  recalc(s);
  return true;
}

export const canEvolve = (s) => s.era < ERAS.length - 1 && s.energy >= evoCost(s);
export const pathsPerEvolution = (s) => (has(s, 'a5') ? 2 : 1);

/** Evoluciona a la era siguiente eligiendo rumbo(s). */
export function evolve(s, pathIds) {
  if (!canEvolve(s)) return false;
  const opts = PATHS[s.era].map((p) => p.id);
  const chosen = [...new Set(pathIds)].filter((p) => opts.includes(p)).slice(0, pathsPerEvolution(s));
  if (!chosen.length) return false;
  s.energy -= evoCost(s);
  s.era++;
  s.paths.push(...chosen);
  s.meta.bestEra = Math.max(s.meta.bestEra, s.era);
  recalc(s);
  return true;
}

// ---------------- habilidad Conquista ----------------
export const abilityCooldown = (s) => (hasUp(s, 'war1') ? 300 : 480);
export function useAbility(s) {
  if (!pathActive(s, 'war') || s.time < s.abilityReady) return 0;
  const mins = hasUp(s, 'war0') ? 40 : 20;
  const v = s.eps * 60 * mins * pathPow(s);
  gain(s, v);
  s.abilityReady = s.time + abilityCooldown(s);
  return v;
}

// ---------------- mutaciones doradas ----------------
export function eventInterval(s) {
  let f = 1;
  if (pathActive(s, 'mut')) f *= 2 * pathPow(s);
  if (hasUp(s, 'mut0')) f *= 1.5;
  if (pathActive(s, 'harmony')) f *= 1.5;
  if (has(s, 'i2')) f *= 1.3;
  return [60 / f, 150 / f];
}
function eventPower(s) {
  let p = 1;
  if (pathActive(s, 'harmony')) p *= 2 * pathPow(s);
  if (hasUp(s, 'mut1')) p *= 1.5;
  if (has(s, 'i4')) p *= 1.5;
  return p;
}
function eventDur(s) {
  let d = 1;
  if (pathActive(s, 'mut')) d *= 1.5;
  if (hasUp(s, 'harmony0')) d *= 1.5;
  if (has(s, 'i5')) d *= 2;
  return d;
}
/** Se atrapó una mutación dorada: aplica un efecto al azar. */
export function catchEvent(s, rnd = Math.random) {
  s.stats.events++;
  const P = eventPower(s);
  const D = eventDur(s);
  const r = rnd();
  let res;
  if (r < 0.45) {
    s.buffs.push({ type: 'frenzy', mult: 1 + 6 * P, until: s.time + 45 * D, dur: 45 * D });
    res = { type: 'frenzy', mult: 1 + 6 * P, dur: 45 * D };
  } else if (r < 0.85) {
    const v = Math.min(s.energy * 0.15 * P, s.eps * 900 * P) + 13 * P;
    gain(s, v);
    res = { type: 'lucky', value: v };
  } else {
    s.buffs.push({ type: 'clickfrenzy', mult: 77 * P, until: s.time + 12 * D, dur: 12 * D });
    res = { type: 'clickfrenzy', mult: 77 * P, dur: 12 * D };
  }
  recalc(s);
  return res;
}

// ---------------- extinción (prestigio) ----------------
export const canPrestige = (s) => s.era >= 2 && prestigeGain(s) >= 1;
export function prestigeGain(s) {
  // crece con el orden de magnitud de lo producido en esta vida (no explota con números enormes)
  const mag = Math.log10(Math.max(1, s.total)) - 8;
  let adn = mag > 0 ? Math.floor(10 * mag ** 1.5) : 0;
  if (pathActive(s, 'trans')) adn *= 2 * (hasUp(s, 'trans0') ? 1.5 : 1);
  return Math.floor(adn);
}
export function prestige(s) {
  const gainAdn = prestigeGain(s);
  if (!canPrestige(s)) return null;
  s.meta.adn += gainAdn;
  s.meta.adnTotal += gainAdn;
  s.meta.prestiges++;
  return newRun(s.meta);
}

export function buyNode(meta, id) {
  const n = TREE_BY_ID[id];
  if (!n || meta.tree.includes(id)) return false;
  if (n.req && !meta.tree.includes(n.req)) return false;
  if (meta.adn < n.cost) return false;
  meta.adn -= n.cost;
  meta.tree.push(id);
  return true;
}

// ================= tiempo =================
/** Avanza el juego dt segundos. Devuelve logros nuevos. */
export function tick(s, dt) {
  s.time += dt;
  // mutaciones que terminan
  const before = s.buffs.length;
  s.buffs = s.buffs.filter((b) => b.until > s.time);
  if (s.buffs.length !== before) recalc(s);
  gain(s, s.eps * dt);
  // autoclic de la Ciencia
  if (pathActive(s, 'sci')) gain(s, autoClickRate(s) * dt);
  // interés del Comercio
  if (pathActive(s, 'trade')) {
    const rate = 0.0003 * (hasUp(s, 'trade0') ? 2 : 1) * pathPow(s);
    const cap = s.eps * 5 * (hasUp(s, 'trade1') ? 3 : 1);
    gain(s, Math.min(s.energy * rate, cap) * dt);
  }
  if (pathActive(s, 'entropy')) recalc(s);
  return checkAchievements(s);
}

export function checkAchievements(s) {
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (s.meta.achievements.includes(a.id)) continue;
    if (a.test(s)) {
      s.meta.achievements.push(a.id);
      got.push(a);
    }
  }
  if (got.length) recalc(s);
  return got;
}

// ================= guardado =================
export function serialize(s) {
  return JSON.stringify({ ...s, meta: s.meta });
}
export function deserialize(json) {
  const o = JSON.parse(json);
  if (!o || o.v !== 1 || !o.meta) throw new Error('bad save');
  const s = newRun(Object.assign(newMeta(), o.meta));
  Object.assign(s, o, { meta: s.meta });
  recalc(s);
  return s;
}
