/**
 * Julay's Donas — todo el contenido del juego: ingredientes (y el día en que aparecen), clientes,
 * clientes exigentes, decoraciones del local, logros, la historia y los textos en español e inglés.
 */

// ------------------------------------------------------------------ colores (paleta tierra)

export const C = {
  tinta: '#3b2a20',
  tinta2: '#6b5545',
  crema: '#f4ead8',
  papel: '#fbf5ea',
  terracota: '#c8553d',
  terracota2: '#a5432f',
  mostaza: '#d4a017',
  mostaza2: '#e8c35a',
  oliva: '#6a994e',
  oliva2: '#8fb46e',
  petroleo: '#2f6690',
  petroleo2: '#5a8db8',
  ciruela: '#7b4b94',
  ciruela2: '#9a72ad',
  rosa: '#c47a8a',
  rosa2: '#e0a7b3',
  madera: '#9c6b45',
  madera2: '#7a5034',
  madera3: '#b88a5e',
  pared: '#efe2cb',
  acero: '#a39d95',
  acero2: '#7d7770',
  aceite: '#d9a441',
  aceite2: '#c08a2c',
};

export const PIELES = ['#f6d7c3', '#eec19f', '#d9a27c', '#b97c55', '#8d5a3b', '#5f3b27', '#fbe6d6', '#4a2b1d'];
/** Las pieles en el orden en que se eligen (de la más clara a la más oscura). */
export const ORDEN_PIELES = [6, 0, 1, 2, 3, 4, 5, 7];

/** Colores de ojos. */
export const OJOS = { marron: '#6b4226', miel: '#a8742e', verde: '#5f7f4a', azul: '#4f7896', gris: '#7e858a', negro: '#2b211c' };

export const PELOS = {
  negro: '#2b211c',
  'castano-oscuro': '#4a3021',
  castano: '#6e4630',
  'castano-claro': '#94653f',
  rubio: '#c9a052',
  'rubio-claro': '#e3c98a',
  pelirrojo: '#b0552e',
  canoso: '#b9b3ab',
  blanco: '#e9e4dc',
  rosa: '#c47a8a',
  petroleo: '#2f6690',
};

/** Colores de ropa para el vestidor (y para los clientes). */
export const ROPA = ['#c8553d', '#d4a017', '#6a994e', '#2f6690', '#7b4b94', '#c47a8a', '#f4ead8', '#3b2a20', '#5a8db8', '#8fb46e', '#a39d95', '#9c6b45', '#8c3a28', '#e8c35a', '#4b6b3a', '#e0a7b3', '#d6c7b0', '#5f7f8a'];

// ------------------------------------------------------------------ ingredientes
// day: el día en que aparece. Los colores van de crudo a dorado, tostado y quemado.

export const MASAS = [
  { id: 'vainilla', day: 1, name: { es: 'Vainilla', en: 'Vanilla' }, crudo: '#f1dfb8', dorado: '#d6a057', tostado: '#a8662e', quemado: '#4a2e1c' },
  { id: 'chocolate', day: 1, name: { es: 'Chocolate', en: 'Chocolate' }, crudo: '#9a6a4f', dorado: '#6e4432', tostado: '#4d2d20', quemado: '#24160f' },
  { id: 'frutilla', day: 6, name: { es: 'Frutilla', en: 'Strawberry' }, crudo: '#f0c6c2', dorado: '#d9997f', tostado: '#a86656', quemado: '#4a2b24' },
];

export const FORMAS = [
  { id: 'anillo', day: 1, name: { es: 'Anillo', en: 'Ring' } },
  { id: 'bola', day: 1, name: { es: 'Bola rellena', en: 'Filled ball' }, relleno: 'siempre' },
  { id: 'baston', day: 4, name: { es: 'Bastón', en: 'Long john' }, relleno: 'a veces' },
];

export const RELLENOS = [
  { id: 'ddl', day: 1, name: { es: 'Dulce de leche', en: 'Dulce de leche' }, color: '#a86a2c' },
  { id: 'crema', day: 3, name: { es: 'Crema pastelera', en: 'Custard' }, color: '#ecd08a' },
  { id: 'mermelada', day: 7, name: { es: 'Mermelada', en: 'Jam' }, color: '#b8404c' },
  { id: 'choco', day: 11, name: { es: 'Chocolate', en: 'Chocolate' }, color: '#4e2c1f' },
];

export const BANOS = [
  { id: 'choco', day: 1, name: { es: 'Chocolate', en: 'Chocolate' }, color: '#5b3524', brillo: '#7d5340' },
  { id: 'blanco', day: 1, name: { es: 'Glaseado', en: 'Glaze' }, color: '#f5ecdf', brillo: '#fffaf2' },
  { id: 'frutilla', day: 2, name: { es: 'Frutilla', en: 'Strawberry' }, color: '#e0a0aa', brillo: '#eebdc4' },
  { id: 'ddl', day: 5, name: { es: 'Dulce de leche', en: 'Dulce de leche' }, color: '#b5783a', brillo: '#c99256' },
  { id: 'limon', day: 9, name: { es: 'Limón', en: 'Lemon' }, color: '#e8d47e', brillo: '#f2e3a4' },
  { id: 'mora', day: 13, name: { es: 'Mora', en: 'Blackberry' }, color: '#8a5d8f', brillo: '#a67eaa' },
];

export const HILOS = [
  { id: 'choco', day: 2, name: { es: 'Chocolate', en: 'Chocolate' }, color: '#4a2a1c' },
  { id: 'blanco', day: 4, name: { es: 'Chocolate blanco', en: 'White chocolate' }, color: '#f8f1e6' },
  { id: 'ddl', day: 8, name: { es: 'Dulce de leche', en: 'Dulce de leche' }, color: '#a5692a' },
  { id: 'frutilla', day: 12, name: { es: 'Frutilla', en: 'Strawberry' }, color: '#c45a6a' },
];

/** Toppings que se espolvorean: se puntúa que cubran toda la dona, parejo. */
export const TOPPINGS = [
  { id: 'granas', day: 1, name: { es: 'Granas', en: 'Sprinkles' }, colores: ['#c8553d', '#d4a017', '#6a994e', '#2f6690', '#c47a8a', '#f4ead8'], forma: 'grana' },
  { id: 'coco', day: 3, name: { es: 'Coco rallado', en: 'Coconut' }, colores: ['#fbf6ee', '#efe6d6'], forma: 'hebra' },
  { id: 'mani', day: 5, name: { es: 'Maní picado', en: 'Peanuts' }, colores: ['#c9995f', '#b5844c', '#ddb47e'], forma: 'trozo' },
  { id: 'chispas', day: 7, name: { es: 'Chispas', en: 'Choc chips' }, colores: ['#3b2219', '#4e2e22'], forma: 'gota' },
  { id: 'azucar', day: 10, name: { es: 'Azúcar impalpable', en: 'Powdered sugar' }, colores: ['#ffffff', '#f6f0e6'], forma: 'polvo' },
  { id: 'nueces', day: 14, name: { es: 'Nueces', en: 'Walnuts' }, colores: ['#9a6a3c', '#87582f'], forma: 'trozo' },
];

/** Piezas que se ponen de a una: se puntúa la cantidad y que queden bien repartidas. */
export const PIEZAS = [
  { id: 'frutilla', day: 6, name: { es: 'Frutillas', en: 'Strawberries' }, color: '#c8443c' },
  { id: 'merengue', day: 9, name: { es: 'Merenguitos', en: 'Meringues' }, color: '#fbf3e6' },
  { id: 'confite', day: 12, name: { es: 'Confites', en: 'Candies' }, color: '#d4a017' },
  { id: 'cereza', day: 15, name: { es: 'Cerezas', en: 'Cherries' }, color: '#a8232f' },
];

export const CATEGORIAS = { masa: MASAS, forma: FORMAS, relleno: RELLENOS, bano: BANOS, hilos: HILOS, topping: TOPPINGS, pieza: PIEZAS };
export const byId = (list, id) => list.find((x) => x.id === id);
export const disponibles = (list, day) => list.filter((x) => x.day <= day);

// ------------------------------------------------------------------ clientes
// look: lo que usa el dibujo (art.js). likes: preferencias para armar los pedidos.

export const CLIENTES = [
  {
    id: 'tito', day: 1, name: 'Tito',
    look: { genero: 'hombre', skin: 2, hair: 'flequillo', hairColor: 'castano', body: 'nene', shirt: C.mostaza, pants: '#52677a', hat: 'gorra', hatColor: C.petroleo },
    likes: { masa: ['chocolate'], bano: ['choco'], topping: ['granas', 'chispas'], forma: ['anillo'] },
    line: { es: '¡Mucho chocolate, porfa!', en: 'Lots of chocolate, please!' },
  },
  {
    id: 'lola', day: 1, name: 'Lola',
    look: { genero: 'mujer', skin: 1, hair: 'rulos', hairColor: 'pelirrojo', body: 'adulto', shirt: C.rosa, style: 'vestido', pants: C.rosa, earrings: true, freckles: true },
    likes: { bano: ['frutilla'], forma: ['bola'], relleno: ['mermelada', 'crema'], pieza: ['frutilla'] },
    line: { es: 'Algo rosadito y rico.', en: 'Something pink and yummy.' },
  },
  {
    id: 'rulo', day: 1, name: 'Rulo',
    look: { genero: 'hombre', skin: 3, hair: 'corto', hairColor: 'negro', body: 'adulto', shirt: C.oliva, style: 'camisa', pants: '#5b4a3c', beard: 'bigote' },
    likes: { masa: ['vainilla'], forma: ['anillo'], relleno: ['ddl'], bano: ['blanco', 'ddl'] },
    line: { es: 'Lo de siempre: clásico y bien hecho.', en: 'The usual: classic and well made.' },
  },
  {
    id: 'sofi', day: 2, name: 'Sofi',
    look: { genero: 'mujer', skin: 0, hair: 'colita', hairColor: 'rubio', body: 'adulto', shirt: C.petroleo, pants: '#3e4a59', glasses: 'redondos' },
    likes: { bano: ['blanco'], topping: ['coco'], forma: ['bola'], relleno: ['crema'] },
    line: { es: '¿Tienen algo con coco?', en: 'Anything with coconut?' },
  },
  {
    id: 'cacho', day: 2, name: 'Don Cacho',
    look: { genero: 'hombre', skin: 2, hair: 'pelado', hairColor: 'canoso', body: 'robusto', shirt: C.terracota, style: 'camisa', pants: '#4b3d33', beard: 'bigote' },
    likes: { relleno: ['ddl'], bano: ['ddl', 'choco'], hilos: ['ddl'], forma: ['bola', 'baston'] },
    line: { es: 'Dulce de leche, que no falte.', en: 'Dulce de leche, always.' },
  },
  {
    id: 'mica', day: 3, name: 'Mica',
    look: { genero: 'mujer', skin: 4, hair: 'afro', hairColor: 'castano-oscuro', body: 'adulto', shirt: C.mostaza, pants: '#6b4a3a', earrings: true },
    likes: { masa: ['chocolate'], topping: ['chispas', 'granas'], bano: ['choco'] },
    line: { es: '¡Que tenga chispitas!', en: 'With little chips, please!' },
  },
  {
    id: 'nacho', day: 3, name: 'Nacho',
    look: { genero: 'hombre', skin: 1, hair: 'jopo', hairColor: 'castano-claro', body: 'alto', shirt: C.oliva, style: 'buzo', pants: '#3e4a59', headband: C.terracota },
    likes: { forma: ['baston'], relleno: ['crema'], topping: ['mani'] },
    line: { es: 'Necesito energía para el partido.', en: 'I need energy for the match.' },
  },
  {
    id: 'flor', day: 4, name: 'Flor',
    look: { genero: 'mujer', skin: 2, hair: 'largo', hairColor: 'castano', body: 'adulto', shirt: C.ciruela, style: 'vestido', pants: C.ciruela, flower: C.rosa },
    likes: { masa: ['frutilla'], bano: ['frutilla', 'blanco'], pieza: ['frutilla', 'merengue'] },
    line: { es: 'Algo lindo para la tarde.', en: 'Something pretty for the afternoon.' },
  },
  {
    id: 'beto', day: 4, name: 'Beto',
    look: { genero: 'hombre', skin: 3, hair: 'corto', hairColor: 'canoso', body: 'robusto', shirt: C.petroleo2, style: 'camisa', pants: '#2f3b4a', hat: 'gorra', hatColor: C.petroleo, beard: 'barba' },
    likes: { forma: ['baston'], relleno: ['ddl'], bano: ['choco'] },
    line: { es: 'Rápido, que dejé el colectivo en doble fila.', en: 'Quick, my bus is double-parked.' },
  },
  {
    id: 'juana', day: 5, name: 'Juana',
    look: { genero: 'mujer', skin: 0, hair: 'trenzas', hairColor: 'rubio-claro', body: 'adulto', shirt: C.oliva2, pants: '#55606b', glasses: 'cuadrados', freckles: true },
    likes: { bano: ['limon', 'blanco'], topping: ['azucar', 'coco'], forma: ['anillo'] },
    line: { es: 'Para estudiar necesito una dona.', en: 'I need a donut to study.' },
  },
  {
    id: 'toto', day: 5, name: 'Toto',
    look: { genero: 'hombre', skin: 2, hair: 'rulos', hairColor: 'castano', body: 'nene', shirt: C.rosa2, pants: '#52677a', hat: 'helice' },
    likes: { topping: ['granas'], pieza: ['confite'], bano: ['frutilla', 'blanco'] },
    line: { es: '¡Con muchos colores!', en: 'With lots of colors!' },
  },
  {
    id: 'martina', day: 6, name: 'Martina',
    look: { genero: 'mujer', skin: 3, hair: 'rodete', hairColor: 'negro', body: 'adulto', shirt: C.petroleo2, style: 'guardapolvo', pants: '#55606b', stethoscope: true },
    likes: { masa: ['vainilla'], relleno: ['crema'], pieza: ['frutilla'], bano: ['blanco'] },
    line: { es: 'Un antojo entre guardia y guardia.', en: 'A treat between shifts.' },
  },
  {
    id: 'fede', day: 6, name: 'Fede',
    look: { genero: 'hombre', skin: 1, hair: 'largo', hairColor: 'castano-claro', body: 'alto', shirt: C.mostaza, pants: '#3e4a59', beard: 'barba' },
    likes: { masa: ['chocolate'], topping: ['mani', 'nueces'], hilos: ['ddl', 'choco'] },
    line: { es: 'Algo con onda, ¿viste?', en: 'Something cool, you know?' },
  },
  {
    id: 'olga', day: 7, name: 'Olga',
    look: { genero: 'mujer', skin: 1, hair: 'rodete', hairColor: 'blanco', body: 'adulto', shirt: C.ciruela, style: 'saco', pants: '#4b3d52', necklace: true, glasses: 'redondos' },
    likes: { bano: ['blanco', 'mora'], pieza: ['merengue'], forma: ['bola'] },
    line: { es: 'Algo delicado, por favor.', en: 'Something dainty, please.' },
  },
  {
    id: 'lucho', day: 8, name: 'Lucho',
    look: { genero: 'hombre', skin: 4, hair: 'rapado', hairColor: 'negro', body: 'robusto', shirt: C.terracota, style: 'bombero', pants: '#3b2a20', beard: 'barba' },
    likes: { forma: ['baston'], masa: ['chocolate'], topping: ['chispas'] },
    line: { es: '¡Una bien grande, que vengo de un incendio!', en: 'A big one, I just put out a fire!' },
  },
  {
    id: 'cami', day: 9, name: 'Cami',
    look: { genero: 'mujer', skin: 2, hair: 'flequillo', hairColor: 'petroleo', body: 'adulto', shirt: C.oliva, style: 'buzo', pants: '#3e4a59', hat: 'gorra-atras', hatColor: C.mostaza, earrings: true },
    likes: { pieza: ['confite'], topping: ['granas'], bano: ['frutilla'] },
    line: { es: 'Re colorida, dale.', en: 'Super colorful, come on.' },
  },
  {
    id: 'gaston', day: 10, name: 'Gastón',
    look: { genero: 'hombre', skin: 0, hair: 'jopo', hairColor: 'castano', body: 'alto', shirt: '#dfe6ea', style: 'camisa', pants: '#3e4a59', glasses: 'cuadrados', tie: C.petroleo },
    likes: { forma: ['anillo'], hilos: ['ddl', 'choco'], bano: ['ddl'] },
    line: { es: 'Tengo reunión en diez minutos.', en: 'I have a meeting in ten minutes.' },
  },
  {
    id: 'valen', day: 11, name: 'Valen',
    look: { genero: 'mujer', skin: 5, hair: 'trenzas', hairColor: 'negro', body: 'adulto', shirt: C.mostaza, pants: '#6b4a3a', earrings: true },
    likes: { masa: ['chocolate'], topping: ['coco'], pieza: ['cereza', 'frutilla'] },
    line: { es: 'Sorprendeme.', en: 'Surprise me.' },
  },
  {
    id: 'bruno', day: 12, name: 'Bruno',
    look: { genero: 'hombre', skin: 2, hair: 'corto', hairColor: 'castano-oscuro', body: 'robusto', shirt: C.crema, style: 'camisa', pants: '#5b4a3c', hat: 'boina', hatColor: C.tinta, beard: 'bigote' },
    likes: { masa: ['vainilla'], relleno: ['crema', 'choco'], hilos: ['blanco'] },
    line: { es: 'A ver si son tan buenas como dicen…', en: "Let's see if they're as good as they say…" },
  },
  {
    id: 'ruth', day: 13, name: 'Ruth',
    look: { genero: 'mujer', skin: 0, hair: 'colita', hairColor: 'pelirrojo', body: 'adulto', shirt: C.rosa, pants: '#6a7a5a', hat: 'sombrero', hatColor: C.mostaza2, freckles: true },
    likes: { bano: ['mora', 'limon'], pieza: ['cereza'], topping: ['nueces'] },
    line: { es: 'Me dijeron que acá están las mejores donas.', en: 'They told me the best donuts are here.' },
  },
];

/**
 * Clientes exigentes: siempre son los últimos del día y miran todo con lupa. "estricto" es el
 * exponente con el que se endurece cada nota (más alto, más exigente) y "foco" la estación que más
 * les importa. Julay viene cada 7 días: es la más exigente de todos.
 */
export const EXIGENTES = [
  {
    id: 'pocha', day: 1, name: 'Doña Pocha', estricto: 1.35, foco: 'fritura', fuerza: 1.8,
    look: { genero: 'mujer', skin: 1, hair: 'rodete', hairColor: 'canoso', body: 'robusto', shirt: C.ciruela, style: 'chal', pants: '#4b3d52', glasses: 'redondos' },
    line: { es: 'Ni cruda ni quemada, ¿estamos?', en: 'Not raw, not burnt. Got it?' },
    likes: { masa: ['vainilla'], relleno: ['ddl'], bano: ['blanco'] },
  },
  {
    id: 'lombardi', day: 3, name: 'Profe Lombardi', estricto: 1.4, foco: 'decorado', fuerza: 1.8,
    look: { genero: 'hombre', skin: 2, hair: 'pelado', hairColor: 'canoso', body: 'alto', shirt: C.terracota, style: 'saco', pants: '#3b2a20', beard: 'bigote', glasses: 'cuadrados', bow: C.mostaza },
    line: { es: 'Voy a corregir cada detalle.', en: "I'll grade every detail." },
    likes: { bano: ['choco', 'blanco'], hilos: ['blanco', 'choco'], topping: ['granas'] },
  },
  {
    id: 'morena', day: 5, name: 'Chef Morena', estricto: 1.45, foco: 'masa', fuerza: 1.9,
    look: { genero: 'mujer', skin: 4, hair: 'rodete', hairColor: 'negro', body: 'adulto', shirt: '#f6f0e6', style: 'chaqueta', pants: '#3b2a20', hat: 'chef', earrings: true },
    line: { es: 'En mi cocina, la masa es sagrada.', en: 'In my kitchen, dough is sacred.' },
    likes: { masa: ['chocolate', 'frutilla'], forma: ['baston', 'bola'], relleno: ['crema'] },
  },
  {
    id: 'crocante', day: 9, name: 'Capitán Crocante', estricto: 1.4, foco: 'espera', fuerza: 2,
    look: { genero: 'hombre', skin: 3, hair: 'jopo', hairColor: 'rubio', body: 'alto', shirt: C.petroleo, style: 'heroe', pants: C.petroleo, cape: C.terracota, mask: C.terracota },
    line: { es: '¡El tiempo vuela, ciudadano!', en: 'Time flies, citizen!' },
    likes: { topping: ['mani', 'chispas'], bano: ['ddl', 'choco'], forma: ['anillo'] },
  },
];

export const JULAY = {
  id: 'julay', day: 7, name: 'Julay', estricto: 1.7, foco: null, fuerza: 1.7, julay: true,
  look: { genero: 'mujer', skin: 2, hair: 'rulos', hairColor: 'castano-oscuro', body: 'adulto', shirt: C.mostaza, style: 'remera', pants: '#3b2a20', glasses: 'redondos', scarf: C.terracota, earrings: true, apron: C.crema },
  line: { es: 'Vine a probar cómo anda mi local.', en: 'I came to taste how my shop is doing.' },
  likes: {},
};

/** El exigente de cada día: Julay cada 7 días; si no, los que ya aparecieron, rotando. */
export function exigenteDelDia(day) {
  if (day % 7 === 0) return JULAY;
  const ya = EXIGENTES.filter((e) => e.day <= day);
  return ya[(day - 1) % ya.length];
}

/**
 * Las tres dificultades. «Medio» es el ritmo de siempre. clientes: cuántos comunes vienen cada día
 * (sin contar al exigente); espacio: cuánto tardan en llegar uno tras otro; paciencia: cuánto
 * esperan tranquilos; punto: la zona justa de la freidora; propinas: cuánto más (o menos) dejan.
 */
export const DIFICULTADES = {
  facil: { name: { es: 'Fácil', en: 'Easy' }, desc: { es: 'Menos clientes, más paciencia y la fritura más fácil.', en: 'Fewer customers, more patience and easier frying.' }, clientes: (d) => Math.min(5, 3 + Math.floor(d / 5)), espacio: 1.3, paciencia: 1.35, punto: [0.84, 1.26], propinas: 1 },
  medio: { name: { es: 'Medio', en: 'Medium' }, desc: { es: 'El ritmo de siempre.', en: 'The usual pace.' }, clientes: (d) => Math.min(7, 2 + Math.ceil(d / 3)), espacio: 1, paciencia: 1, punto: [0.9, 1.15], propinas: 1 },
  dificil: { name: { es: 'Difícil', en: 'Hard' }, desc: { es: 'Más clientes, menos paciencia… y más propina.', en: 'More customers, less patience… and bigger tips.' }, clientes: (d) => Math.min(8, 2 + Math.ceil(d / 2)), espacio: 0.8, paciencia: 0.8, punto: [0.93, 1.1], propinas: 1.25 },
};
export const dificultadDe = (save) => DIFICULTADES[save?.dificultad] || DIFICULTADES.medio;

/** Cuántos clientes comunes vienen cada día (sin contar al exigente), en dificultad media. */
export const clientesPorDia = (day) => DIFICULTADES.medio.clientes(day);

// ------------------------------------------------------------------ decoración del local

export const SLOTS = [
  { id: 'pared', name: { es: 'Paredes', en: 'Walls' } },
  { id: 'piso', name: { es: 'Piso', en: 'Floor' } },
  { id: 'alfombra', name: { es: 'Alfombra', en: 'Rug' } },
  { id: 'mesas', name: { es: 'Mesas', en: 'Tables' } },
  { id: 'ventana', name: { es: 'Ventana', en: 'Window' } },
  { id: 'cuadro', name: { es: 'Cuadro', en: 'Picture' } },
  { id: 'estante', name: { es: 'Pared derecha', en: 'Right wall' } },
  { id: 'techo', name: { es: 'Techo', en: 'Ceiling' } },
  { id: 'rincon', name: { es: 'Rincón', en: 'Corner' } },
  { id: 'mostrador', name: { es: 'Mostrador', en: 'Counter' } },
];

/** precio en monedas (0 = viene con el local); bonus = % más de paciencia de los clientes. logro: se gana, no se compra. */
export const DECO = [
  { id: 'pared-crema', slot: 'pared', precio: 0, bonus: 0, name: { es: 'Crema lisa', en: 'Plain cream' } },
  { id: 'pared-rayas', slot: 'pared', precio: 40, bonus: 3, name: { es: 'Rayas terracota', en: 'Terracotta stripes' } },
  { id: 'pared-lunares', slot: 'pared', precio: 55, bonus: 3, name: { es: 'Lunares', en: 'Polka dots' } },
  { id: 'pared-azulejos', slot: 'pared', precio: 75, bonus: 4, name: { es: 'Azulejos', en: 'Tiles' } },
  { id: 'pared-ladrillo', slot: 'pared', precio: 95, bonus: 5, name: { es: 'Ladrillo', en: 'Brick' } },
  { id: 'pared-madera', slot: 'pared', precio: 70, bonus: 4, name: { es: 'Madera', en: 'Wood paneling' } },
  { id: 'pared-flores', slot: 'pared', precio: 85, bonus: 4, name: { es: 'Empapelado con flores', en: 'Floral wallpaper' } },

  { id: 'piso-damero', slot: 'piso', precio: 0, bonus: 0, name: { es: 'Damero', en: 'Checkered' } },
  { id: 'piso-madera', slot: 'piso', precio: 45, bonus: 3, name: { es: 'Madera', en: 'Wood' } },
  { id: 'piso-calcareo', slot: 'piso', precio: 85, bonus: 5, name: { es: 'Baldosas calcáreas', en: 'Patterned tiles' } },
  { id: 'piso-ajedrez', slot: 'piso', precio: 55, bonus: 3, name: { es: 'Ajedrez grande', en: 'Big checkers' } },
  { id: 'piso-hexagonos', slot: 'piso', precio: 75, bonus: 4, name: { es: 'Hexágonos', en: 'Hexagon tiles' } },

  { id: 'alfombra-lisa', slot: 'alfombra', precio: 30, bonus: 2, name: { es: 'Alfombra lisa', en: 'Plain rug' } },
  { id: 'alfombra-rayas', slot: 'alfombra', precio: 45, bonus: 3, name: { es: 'Alfombra rayada', en: 'Striped rug' } },
  { id: 'alfombra-redonda', slot: 'alfombra', precio: 60, bonus: 3, name: { es: 'Alfombra tejida', en: 'Braided rug' } },

  { id: 'mesas-madera', slot: 'mesas', precio: 0, bonus: 0, name: { es: 'Mesas de madera', en: 'Wooden tables' } },
  { id: 'mesas-cafe', slot: 'mesas', precio: 50, bonus: 3, name: { es: 'Mesitas de café', en: 'Café tables' } },
  { id: 'mesas-retro', slot: 'mesas', precio: 85, bonus: 4, name: { es: 'Mesas retro', en: 'Retro diner tables' } },
  { id: 'mesas-picnic', slot: 'mesas', precio: 70, bonus: 4, name: { es: 'Manteles a cuadros', en: 'Gingham tablecloths' } },
  { id: 'mesas-marmol', slot: 'mesas', precio: 100, bonus: 5, name: { es: 'Mesas de mármol', en: 'Marble tables' } },

  { id: 'cortinas', slot: 'ventana', precio: 25, bonus: 2, name: { es: 'Cortinas', en: 'Curtains' } },
  { id: 'macetero', slot: 'ventana', precio: 40, bonus: 3, name: { es: 'Macetero con flores', en: 'Flower box' } },
  { id: 'letras', slot: 'ventana', precio: 55, bonus: 3, name: { es: 'Letras pintadas', en: 'Painted lettering' } },

  { id: 'cuadro-dona', slot: 'cuadro', precio: 20, bonus: 2, name: { es: 'Cuadro de dona', en: 'Donut painting' } },
  { id: 'cuadro-barrio', slot: 'cuadro', precio: 35, bonus: 3, name: { es: 'Postal del barrio', en: 'Neighborhood print' } },
  { id: 'reloj-dona', slot: 'cuadro', precio: 50, bonus: 3, name: { es: 'Reloj de dona', en: 'Donut clock' } },
  { id: 'cuadro-julay', slot: 'cuadro', precio: 45, bonus: 3, name: { es: 'Retrato de Julay', en: 'Portrait of Julay' } },
  { id: 'espejo', slot: 'cuadro', precio: 60, bonus: 3, name: { es: 'Espejo redondo', en: 'Round mirror' } },
  { id: 'cuadro-oro', slot: 'cuadro', logro: 'decorado-100', bonus: 4, name: { es: 'Dona de oro', en: 'Golden donut' } },
  { id: 'foto-pocha', slot: 'cuadro', logro: 'pocha', bonus: 4, name: { es: 'Foto con Doña Pocha', en: 'Photo with Doña Pocha' } },
  { id: 'diploma-julay', slot: 'cuadro', logro: 'julay', bonus: 6, name: { es: 'Diploma de Julay', en: "Julay's diploma" } },

  { id: 'pizarra', slot: 'estante', precio: 25, bonus: 2, name: { es: 'Pizarra con precios', en: 'Price board' } },
  { id: 'guirnalda', slot: 'estante', precio: 30, bonus: 2, name: { es: 'Guirnalda', en: 'Garland' } },
  { id: 'estante-frascos', slot: 'estante', precio: 45, bonus: 3, name: { es: 'Estante con frascos', en: 'Jar shelf' } },
  { id: 'plantas-colgantes', slot: 'estante', precio: 55, bonus: 3, name: { es: 'Plantas colgantes', en: 'Hanging plants' } },
  { id: 'reloj-cucu', slot: 'estante', precio: 75, bonus: 4, name: { es: 'Reloj cucú', en: 'Cuckoo clock' } },
  { id: 'mural-barrio', slot: 'estante', logro: 'barrio', bonus: 6, name: { es: 'Mural del barrio', en: 'Neighborhood mural' } },

  { id: 'banderines', slot: 'techo', precio: 25, bonus: 2, name: { es: 'Banderines', en: 'Bunting' } },
  { id: 'lamparas', slot: 'techo', precio: 40, bonus: 3, name: { es: 'Lámparas colgantes', en: 'Pendant lamps' } },
  { id: 'ventilador', slot: 'techo', precio: 55, bonus: 3, name: { es: 'Ventilador de techo', en: 'Ceiling fan' } },
  { id: 'luces', slot: 'techo', precio: 50, bonus: 3, name: { es: 'Guirnalda de lamparitas', en: 'String lights' } },
  { id: 'donas-colgantes', slot: 'techo', precio: 65, bonus: 4, name: { es: 'Móvil de donas', en: 'Donut mobile' } },

  { id: 'planta-chica', slot: 'rincon', precio: 15, bonus: 2, name: { es: 'Planta', en: 'Plant' } },
  { id: 'planta-grande', slot: 'rincon', precio: 35, bonus: 3, name: { es: 'Monstera', en: 'Monstera' } },
  { id: 'maquina-chicles', slot: 'rincon', precio: 60, bonus: 4, name: { es: 'Máquina de chicles', en: 'Gumball machine' } },
  { id: 'rockola', slot: 'rincon', precio: 110, bonus: 6, name: { es: 'Rockola', en: 'Jukebox' } },
  { id: 'perchero', slot: 'rincon', precio: 30, bonus: 2, name: { es: 'Perchero', en: 'Coat rack' } },
  { id: 'gato', slot: 'rincon', precio: 80, bonus: 4, name: { es: 'Gato dormilón', en: 'Sleepy cat' } },
  { id: 'bici', slot: 'rincon', precio: 95, bonus: 5, name: { es: 'Bici de reparto', en: 'Delivery bike' } },
  { id: 'planta-gigante', slot: 'rincon', logro: 'diez-felices', bonus: 5, name: { es: 'Palmera de dona', en: 'Donut palm' } },

  { id: 'campanita', slot: 'mostrador', precio: 10, bonus: 1, name: { es: 'Campanita', en: 'Service bell' } },
  { id: 'florero', slot: 'mostrador', precio: 18, bonus: 2, name: { es: 'Florero', en: 'Flower vase' } },
  { id: 'frasco-propinas', slot: 'mostrador', precio: 30, bonus: 1, propinas: 0.15, name: { es: 'Frasco de propinas', en: 'Tip jar' } },
  { id: 'vitrina', slot: 'mostrador', precio: 85, bonus: 4, name: { es: 'Vitrina con donas', en: 'Donut display case' } },
  { id: 'cactus', slot: 'mostrador', precio: 15, bonus: 1, name: { es: 'Cactus', en: 'Cactus' } },
  { id: 'pecera', slot: 'mostrador', precio: 60, bonus: 3, name: { es: 'Pecera', en: 'Fishbowl' } },
  { id: 'torre-donas', slot: 'mostrador', precio: 75, bonus: 4, name: { es: 'Torre de donas', en: 'Donut tower' } },
  { id: 'freidora-oro', slot: 'mostrador', logro: 'fritura-perfecta', bonus: 4, propinas: 0.1, name: { es: 'Freidora de oro', en: 'Golden fryer' } },
];

export const DECO_INICIAL = { pared: 'pared-crema', piso: 'piso-damero', mesas: 'mesas-madera' };

/** Colores a elección (gratis): qué se pinta, con qué paleta y su color de fábrica. */
const PASTELES = ['#efe2cb', '#f1d9c9', '#e9e4cf', '#dfe6d6', '#d9e3e6', '#ead7e0', '#f2e3b8', '#e6d3c2', '#e4dcef', '#f5ece0'];
const FUERTES = ['#c8553d', '#d4a017', '#6a994e', '#2f6690', '#7b4b94', '#c47a8a', '#3b2a20', '#5f7f8a', '#8c3a28', '#4b6b3a'];
const MADERAS = ['#9c6b45', '#7a5034', '#b88a5e', '#5a3d2b', '#c8553d', '#2f6690', '#6a994e', '#d4a017', '#f4ead8', '#7b4b94'];
export const COLORES_LOCAL = [
  { id: 'pared', name: { es: 'Paredes', en: 'Walls' }, paleta: PASTELES, base: '#efe2cb' },
  { id: 'toldo', name: { es: 'Toldo', en: 'Awning' }, paleta: FUERTES, base: '#c8553d' },
  { id: 'cartel', name: { es: 'Cartel', en: 'Sign' }, paleta: FUERTES, base: '#c8553d' },
  { id: 'puerta', name: { es: 'Puerta', en: 'Door' }, paleta: MADERAS, base: '#9c6b45' },
  { id: 'mesas', name: { es: 'Mesas', en: 'Tables' }, paleta: MADERAS, base: '#9c6b45' },
  { id: 'mostrador', name: { es: 'Mostrador', en: 'Counter' }, paleta: MADERAS, base: '#9c6b45' },
];

// ------------------------------------------------------------------ mejoras de cocina

/** Herramientas que cambian cómo se juega (no son decoración). est: la estación donde se usan. */
export const MEJORAS = [
  { id: 'mesa2', est: 'masa', precio: 120, name: { es: 'Segunda mesa de masa', en: 'Second dough table' }, desc: { es: 'Dos masas estiradas a la vez: pasás de una mesa a la otra sin perder ninguna.', en: 'Two rolled-out doughs at once: switch tables without losing either one.' } },
  { id: 'palote', est: 'masa', precio: 60, name: { es: 'Palote de mármol', en: 'Marble rolling pin' }, desc: { es: 'Estira la masa en la mitad de pasadas.', en: 'Rolls the dough out in half the strokes.' } },
  { id: 'freidora6', est: 'fritura', precio: 150, name: { es: 'Freidora grande', en: 'Big fryer' }, desc: { es: 'Seis lugares en el aceite en vez de cuatro.', en: 'Six spots in the oil instead of four.' } },
  { id: 'termometro', est: 'fritura', precio: 80, name: { es: 'Termómetro', en: 'Thermometer' }, desc: { es: 'El punto justo de cada lado dura más tiempo.', en: 'The just-right zone on each side lasts longer.' } },
  { id: 'manga', est: 'decorado', precio: 70, name: { es: 'Manga profesional', en: 'Pro piping bag' }, desc: { es: 'Rellena y baña más rápido, y frena un momento en la raya.', en: 'Fills and ices faster, and pauses for a moment at the line.' } },
  { id: 'pomo', est: 'decorado', precio: 50, name: { es: 'Pomo de punta ancha', en: 'Wide-tip bottle' }, desc: { es: 'Los hilos salen más gruesos: cubrís la dona con menos zigzag.', en: 'Thicker drizzle: cover the donut with fewer zigzags.' } },
  { id: 'espolvoreador', est: 'decorado', precio: 60, name: { es: 'Espolvoreador ancho', en: 'Wide shaker' }, desc: { es: 'Los toppings caen en una franja más ancha y más rápido.', en: 'Toppings fall in a wider band, and faster.' } },
  { id: 'libreta', est: 'mostrador', precio: 45, name: { es: 'Libreta rápida', en: 'Quick notepad' }, desc: { es: 'Anotás los pedidos en la mitad de tiempo.', en: 'You write down orders in half the time.' } },
  { id: 'turnos', est: 'mostrador', precio: 70, name: { es: 'Cartel de turnos', en: 'Queue number sign' }, desc: { es: 'Con número en mano, los clientes esperan 10% más tranquilos.', en: 'With a number in hand, customers wait 10% longer.' } },
];

// ------------------------------------------------------------------ logros (los "bonus")

export const LOGROS = [
  { id: 'primer-dia', monedas: 20, name: { es: 'Primer día', en: 'First day' }, desc: { es: 'Terminaste tu primer día en Julay’s Donas.', en: 'You finished your first day at Julay’s Donas.' } },
  { id: 'decorado-100', name: { es: 'Mano de artista', en: 'Artist’s hand' }, desc: { es: 'Un pedido con decorado perfecto.', en: 'An order with perfect decorating.' } },
  { id: 'fritura-perfecta', name: { es: 'Punto justo', en: 'Just right' }, desc: { es: 'Un pedido con la fritura perfecta.', en: 'An order fried to perfection.' } },
  { id: 'pocha', name: { es: 'Doña Pocha sonrió', en: 'Doña Pocha smiled' }, desc: { es: 'Más de 90 puntos con Doña Pocha.', en: 'Over 90 points with Doña Pocha.' } },
  { id: 'dia-redondo', monedas: 60, name: { es: 'Día redondo', en: 'Perfect day' }, desc: { es: 'Todos los clientes de un día con más de 80.', en: 'Every customer of a day scored over 80.' } },
  { id: 'diez-felices', name: { es: 'Barrio feliz', en: 'Happy block' }, desc: { es: '10 clientes con más de 90 puntos.', en: '10 customers with over 90 points.' } },
  { id: 'julay', name: { es: 'Julay aprueba', en: 'Julay approves' }, desc: { es: 'Más de 85 puntos con Julay.', en: 'Over 85 points with Julay.' } },
  { id: 'barrio', name: { es: 'Conocés a todos', en: 'You know everyone' }, desc: { es: 'Atendiste a todos los clientes del barrio.', en: 'You served every customer in the neighborhood.' } },
];

// ------------------------------------------------------------------ historia

/** Cómic del principio: cada viñeta tiene una escena (la dibuja art.js) y su texto. {n} = tu nombre. */
export const HISTORIA = [
  { escena: 'calle', es: 'Llegaste al barrio con una valija y un antojo: probar las famosas donas de Julay.', en: 'You arrived in the neighborhood with a suitcase and a craving: Julay’s famous donuts.' },
  { escena: 'valija', es: 'Pero Julay estaba cerrando: se iba de viaje por el mundo a buscar la receta de la dona perfecta.', en: 'But Julay was closing up: she was off around the world to find the recipe for the perfect donut.' },
  { escena: 'pregunta', es: '—¿Y vos quién sos? ¿Sabés hacer donas?\n—Ehh… ¡sí, claro! —dijiste, por las dudas.', en: '“And who are you? Can you make donuts?”\n“Uhh… sure!” you said, just in case.' },
  { escena: 'llaves', es: '—Entonces el local es tuyo hasta que vuelva. Anotá bien cada pedido, armá la masa, cuidá la fritura y decorá con amor.', en: '“Then the shop is yours until I’m back. Take each order carefully, shape the dough, watch the fryer and decorate with love.”' },
  { escena: 'despedida', es: '—Y ojo: el último cliente del día siempre es el más exigente. ¡Te mando postales, {n}!', en: '“And careful: the last customer of the day is always the toughest. I’ll send postcards, {n}!”' },
];

/** Los diálogos de la película del principio (globos y subtítulos). {n} = tu nombre. */
export const PELI = {
  julay1: { es: '¿Y vos quién sos? ¿Sabés hacer donas?', en: 'And who are you? Can you make donuts?' },
  yo1: { es: 'Ehh… ¡sí, claro!', en: 'Uhh… sure!' },
  narr3: { es: '…le dijiste, por las dudas.', en: '…you said, just in case.' },
  julay2: { es: 'Entonces el local es tuyo hasta que vuelva. Anotá bien cada pedido, armá la masa, cuidá la fritura y decorá con amor.', en: 'Then the shop is yours until I’m back. Take each order carefully, shape the dough, watch the fryer and decorate with love.' },
  julay3: { es: 'Y ojo: el último cliente del día siempre es el más exigente. ¡Te mando postales, {n}!', en: 'And careful: the last customer of the day is always the toughest. I’ll send postcards, {n}!' },
};

/** Postales de Julay: llegan al empezar esos días. */
export const POSTALES = [
  { day: 3, lugar: { es: 'Roma, Italia', en: 'Rome, Italy' }, es: 'Probé un bombolone relleno de crema pastelera. Te dejo la idea: ¡ya tenés crema para tus bolas!', en: 'I tried a bombolone filled with custard. Here’s the idea: you now have custard for your filled donuts!' },
  { day: 6, lugar: { es: 'Kioto, Japón', en: 'Kyoto, Japan' }, es: 'Acá las decoran con frutillas, una por una, bien repartidas. Probalo, que a los clientes les encanta.', en: 'Here they top them with strawberries, one by one, evenly spaced. Try it, customers love it.' },
  { day: 7, lugar: { es: 'De vuelta (por un día)', en: 'Back (for a day)' }, es: 'Hoy paso por el local a probar tus donas. No me trates distinto: soy una clienta más… la más exigente.', en: 'Today I’m dropping by to taste your donuts. Treat me like any customer… the toughest one.' },
  { day: 10, lugar: { es: 'Oaxaca, México', en: 'Oaxaca, Mexico' }, es: 'Conchas, churros y azúcar por todos lados. Te mando el truco del azúcar impalpable: lluvia pareja.', en: 'Conchas, churros and sugar everywhere. Here’s the powdered-sugar trick: an even snowfall.' },
  { day: 13, lugar: { es: 'París, Francia', en: 'Paris, France' }, es: 'Los beignets me hicieron llorar de alegría. ¿Cómo va mi local? Me contaron que el barrio está feliz.', en: 'The beignets made me cry with joy. How’s my shop? I hear the neighborhood is happy.' },
  { day: 17, lugar: { es: 'Salvador, Brasil', en: 'Salvador, Brazil' }, es: 'Sonhos con dulce de leche: ¡como en casa! Ya me falta poco para volver.', en: 'Sonhos with dulce de leche: just like home! I’ll be back soon.' },
  { day: 20, lugar: { es: 'Nueva York', en: 'New York' }, es: 'Probé mil donas y ninguna como las del barrio. Mañana vuelvo para quedarme. Preparate.', en: 'I tried a thousand donuts and none like ours. Tomorrow I’m coming back for good. Get ready.' },
];

/** Final: cuando Julay vuelve (día 21 en adelante) y le encanta lo que encuentra. */
export const FINAL = [
  { escena: 'final-1', es: '—Di la vuelta al mundo buscando la dona perfecta… y estaba acá, en mi propio local.', en: '“I went around the world looking for the perfect donut… and it was here, in my own shop.”' },
  { escena: 'final-2', es: '—{n}, desde hoy este local también es tuyo. Julay’s Donas ahora tiene dos donistas.', en: '“{n}, from today this shop is yours too. Julay’s Donas now has two donut makers.”' },
];

// ------------------------------------------------------------------ textos de la interfaz

export const TXT = {
  jugar: { es: 'Jugar', en: 'Play' },
  seguir: { es: 'Seguir', en: 'Continue' },
  nueva: { es: 'Nueva partida', en: 'New game' },
  comoSeJuega: { es: 'Cómo se juega', en: 'How to play' },
  vestidor: { es: 'Vestidor', en: 'Wardrobe' },
  dificultad: { es: 'Dificultad', en: 'Difficulty' },
  musica: { es: 'Música', en: 'Music' },
  si2: { es: 'Sí', en: 'On' },
  no2: { es: 'No', en: 'Off' },
  decorar: { es: 'Mejorar el local', en: 'Upgrade the shop' },
  cocinaTab: { es: 'Cocina', en: 'Kitchen' },
  coloresTab: { es: 'Colores', en: 'Colors' },
  comprada: { es: 'Ya la tenés', en: 'Owned' },
  mejoraCocina: { es: 'Herramientas para trabajar más rápido y mejor.', en: 'Tools to work faster and better.' },
  coloresGratis: { es: 'Pintar es gratis: tocá un color.', en: 'Painting is free: tap a color.' },
  mesa: { es: 'Mesa {n}', en: 'Table {n}' },
  estirada: { es: 'estirada', en: 'rolled' },
  vacia: { es: 'vacía', en: 'empty' },
  siguienteDia: { es: 'Abrir el día {d}', en: 'Open day {d}' },
  abrir: { es: '¡Abrir el local!', en: 'Open the shop!' },
  saltar: { es: 'Saltar', en: 'Skip' },
  siguiente: { es: 'Siguiente', en: 'Next' },
  listo: { es: 'Listo', en: 'Done' },
  volver: { es: 'Volver', en: 'Back' },
  salir: { es: 'Volver al inicio', en: 'Back to title' },
  salirJuego: { es: 'Salir del juego', en: 'Exit game' },
  pausa: { es: 'Pausa', en: 'Paused' },
  dia: { es: 'Día {d}', en: 'Day {d}' },
  monedas: { es: 'monedas', en: 'coins' },
  clientesHoy: { es: '{a} de {b} clientes', en: '{a} of {b} customers' },
  tomarPedido: { es: 'Tomar pedido', en: 'Take order' },
  entregar: { es: 'Entregar', en: 'Serve' },
  tirar: { es: 'Tirar', en: 'Toss' },
  tirarMasa: { es: 'Tirar la masa', en: 'Toss the dough' },
  tirarDona: { es: 'Tirar esta dona', en: 'Toss this donut' },
  aFreir: { es: '¡A la freidora!', en: 'To the fryer!' },
  estaciones: { mostrador: { es: 'Mostrador', en: 'Counter' }, masa: { es: 'Masa', en: 'Dough' }, fritura: { es: 'Fritura', en: 'Fryer' }, decorado: { es: 'Decorado', en: 'Decorate' } },
  crudas: { es: 'Para freír', en: 'To fry' },
  escurridor: { es: 'Escurridor', en: 'Draining rack' },
  sinPedido: { es: 'Elegí un pedido de arriba', en: 'Pick an order from the rail' },
  nadaParaMasa: { es: 'No hay pedidos esperando masa', en: 'No orders waiting for dough' },
  nadaParaDecorar: { es: 'Todavía no hay donas fritas para decorar', en: 'No fried donuts to decorate yet' },
  enFreidora: { es: 'en la freidora', en: 'frying' },
  falta: { es: 'falta', en: 'missing' },
  cruda: { es: 'cruda', en: 'raw' },
  categoriasDeco: { relleno: { es: 'Relleno', en: 'Filling' }, bano: { es: 'Baño', en: 'Icing' }, hilos: { es: 'Hilos', en: 'Drizzle' }, topping: { es: 'Toppings', en: 'Toppings' }, pieza: { es: 'Piezas', en: 'Pieces' } },
  notas: { espera: { es: 'Espera', en: 'Waiting' }, masa: { es: 'Masa', en: 'Dough' }, fritura: { es: 'Fritura', en: 'Frying' }, decorado: { es: 'Decorado', en: 'Decorating' } },
  propina: { es: 'Propina', en: 'Tip' },
  total: { es: 'Total', en: 'Total' },
  exigente: { es: 'Cliente exigente', en: 'Tough customer' },
  nuevoCliente: { es: 'Cliente nuevo', en: 'New customer' },
  nuevosHoy: { es: 'Hoy vienen por primera vez', en: 'First visit today' },
  nuevosIngredientes: { es: 'Ingredientes nuevos', en: 'New ingredients' },
  ultimoDelDia: { es: 'El último del día', en: 'Last of the day' },
  postal: { es: 'Postal de Julay', en: 'Postcard from Julay' },
  finDia: { es: 'Fin del día {d}', en: 'End of day {d}' },
  atendidos: { es: 'Clientes atendidos', en: 'Customers served' },
  promedio: { es: 'Puntaje promedio', en: 'Average score' },
  ganaste: { es: 'Ganaste', en: 'You earned' },
  logroNuevo: { es: '¡Bonus!', en: 'Bonus!' },
  decoGanada: { es: 'Ganaste una decoración: {x}', en: 'You won a decoration: {x}' },
  monedasGanadas: { es: '+{x} monedas', en: '+{x} coins' },
  paciencia: { es: '+{x}% de paciencia', en: '+{x}% patience' },
  propinasMas: { es: '+{x}% de propinas', en: '+{x}% tips' },
  comprar: { es: 'Comprar', en: 'Buy' },
  usar: { es: 'Usar', en: 'Use' },
  usando: { es: 'En uso', en: 'In use' },
  bloqueado: { es: 'Se gana con un logro', en: 'Won with an achievement' },
  sinPlata: { es: 'Te faltan monedas', en: 'Not enough coins' },
  pacienciaTotal: { es: 'Los clientes esperan {x}% más', en: 'Customers wait {x}% longer' },
  tuNombre: { es: 'Tu nombre', en: 'Your name' },
  quienSos: { es: '¿Quién sos?', en: 'Who are you?' },
  azar: { es: 'Al azar', en: 'Random' },
  piel: { es: 'Piel', en: 'Skin' },
  pelo: { es: 'Pelo', en: 'Hair' },
  colorPelo: { es: 'Color de pelo', en: 'Hair color' },
  ojos: { es: 'Ojos', en: 'Eyes' },
  cara: { es: 'Cara', en: 'Face' },
  anteojos: { es: 'Anteojos', en: 'Glasses' },
  sombrero: { es: 'Gorro', en: 'Hat' },
  remera: { es: 'Remera', en: 'Shirt' },
  delantal: { es: 'Delantal', en: 'Apron' },
  ropa: { es: 'Ropa', en: 'Clothes' },
  peinado: { es: 'Peinado', en: 'Hairstyle' },
  barba: { es: 'Barba', en: 'Facial hair' },
  detalles: { es: 'Detalles', en: 'Details' },
  colorGorro: { es: 'Color del gorro', en: 'Hat color' },
  pestanasVestidor: {
    cuerpo: { es: 'Cuerpo', en: 'Body' },
    cara: { es: 'Cara', en: 'Face' },
    pelo: { es: 'Pelo', en: 'Hair' },
    arriba: { es: 'Arriba', en: 'Top' },
    abajo: { es: 'Abajo', en: 'Bottom' },
    delantal: { es: 'Delantal', en: 'Apron' },
    extras: { es: 'Extras', en: 'Extras' },
  },
  soy: { es: 'Soy', en: 'I am' },
  contextura: { es: 'Contextura', en: 'Build' },
  formaOjos: { es: 'Ojos', en: 'Eyes' },
  colorOjos: { es: 'Color de ojos', en: 'Eye color' },
  prenda: { es: 'Prenda', en: 'Garment' },
  color: { es: 'Color', en: 'Color' },
  estampado: { es: 'Estampado', en: 'Pattern' },
  colorEstampado: { es: 'Color del estampado', en: 'Pattern color' },
  calzado: { es: 'Calzado', en: 'Shoes' },
  colorCalzado: { es: 'Color del calzado', en: 'Shoe color' },
  estilo: { es: 'Estilo', en: 'Style' },
  cuello: { es: 'En el cuello', en: 'Neck' },
  colorCuello: { es: 'Color', en: 'Color' },
  plaquita: { es: 'Tu nombre va en la plaquita del delantal.', en: 'Your name goes on the apron’s name tag.' },
  ninguno: { es: 'Nada', en: 'None' },
  confirmarNueva: { es: 'Se borra la partida guardada. ¿Empezar de nuevo?', en: 'Your saved game will be erased. Start over?' },
  confirmarSalir: { es: 'Si salís ahora, el día empieza de nuevo la próxima vez. ¿Salir?', en: 'If you quit now, the day restarts next time. Quit?' },
  si: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  girar: { es: 'Girá el celular para jugar', en: 'Rotate your phone to play' },
  jugarIgual: { es: 'Jugar igual', en: 'Play anyway' },
  holaPedido: { es: '¡Hola! ¿Qué te preparo?', en: 'Hi! What can I make you?' },
  graciasVuelva: { es: '¡Gracias, vuelva pronto!', en: 'Thanks, come again!' },
  local: { es: 'Julay’s Donas', en: 'Julay’s Donas' },
  modoLibre: { es: 'Julay volvió: ahora el local es de los dos. ¡Seguí atendiendo al barrio!', en: 'Julay is back: the shop belongs to both of you now. Keep serving the neighborhood!' },
};

/** Reacciones según el puntaje. */
export const REACCIONES = [
  { min: 95, es: ['¡Es perfecta!', '¡La mejor dona de mi vida!', '¡Diez puntos!'], en: ['It’s perfect!', 'Best donut of my life!', 'Ten out of ten!'] },
  { min: 80, es: ['¡Riquísima!', '¡Muy buena, gracias!', 'Tal cual la pedí.'], en: ['Delicious!', 'Very good, thanks!', 'Just how I ordered it.'] },
  { min: 60, es: ['Está bien.', 'Zafa.', 'Podría ser mejor…'], en: ['It’s okay.', 'Not bad.', 'Could be better…'] },
  { min: 35, es: ['Mmm… no es lo que pedí.', 'Me esperaba más.'], en: ['Hmm… not what I ordered.', 'I expected more.'] },
  { min: 0, es: ['¿Esto es una dona?', 'Ay, no…'], en: ['Is this a donut?', 'Oh no…'] },
];

/** Consejos del primer día (tutorial): se muestran según lo que está pasando. */
export const AYUDA = {
  tomar: { es: 'Llegó tu primer cliente. Tocá «Tomar pedido».', en: 'Your first customer is here. Tap “Take order”.' },
  irMasa: { es: 'El pedido quedó en un ticket arriba. Andá a la estación de Masa.', en: 'The order is on a ticket up top. Go to the Dough station.' },
  elegirMasa: { es: 'Elegí la masa que pide el ticket (a la derecha).', en: 'Pick the dough the ticket asks for (on the right).' },
  estirar: { es: 'Pasá el palote: arrastrá de un lado al otro sobre la masa.', en: 'Roll it out: drag back and forth across the dough.' },
  cortar: { es: 'Elegí el cortador de la forma del ticket y tocá la masa para cortar.', en: 'Pick the cutter shaped like the ticket and tap the dough to cut.' },
  irFritura: { es: '¡Bien! Las donas ya están en la Fritura.', en: 'Nice! The donuts are waiting at the Fryer.' },
  meter: { es: 'Tocá (o arrastrá) la dona cruda para meterla al aceite.', en: 'Tap (or drag) the raw donut to drop it in the oil.' },
  darVuelta: { es: 'Cuando la aguja entre en la zona verde, tocá la dona para darla vuelta.', en: 'When the needle hits the green zone, tap the donut to flip it.' },
  sacar: { es: 'Cuando el otro lado también esté dorado, tocala para sacarla.', en: 'When the other side is golden too, tap it to take it out.' },
  irDecorado: { es: 'Ya está frita. Andá a Decorado.', en: 'It’s fried. Go to Decorate.' },
  rellenar: { es: 'Relleno: mantené apretado sobre la dona y soltá cuando llegue a la raya.', en: 'Filling: press and hold on the donut, let go at the line.' },
  banar: { es: 'Baño: elegí el sabor y mantené apretado sobre la dona hasta cubrirla.', en: 'Icing: pick the flavor and hold on the donut until it’s covered.' },
  hilos: { es: 'Hilos: arrastrá en zigzag por encima de la dona.', en: 'Drizzle: drag in zigzags over the donut.' },
  toppings: { es: 'Toppings: pasá el dedo por toda la dona para espolvorear parejo.', en: 'Toppings: sweep over the whole donut to sprinkle evenly.' },
  piezas: { es: 'Piezas: tocá la dona para poner cada una, bien repartidas.', en: 'Pieces: tap the donut to place each one, evenly spaced.' },
  entregar: { es: 'Cuando quede como en el ticket, tocá «Entregar».', en: 'When it matches the ticket, tap “Serve”.' },
};
