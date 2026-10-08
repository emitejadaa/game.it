/* Trotamundos — textos en español rioplatense (es) y en inglés (en).
 * Los marcadores {nombre} se reemplazan con las variables que se pasan a traducir(). */
export const TEXTOS = {
  // menú
  kicker: { es: 'Geografía en 360°', en: '360° geography' },
  titulo: { es: 'Trotamundos', en: 'Globetrotter' },
  lema: {
    es: 'Te dejamos en un lugar del mundo. Mirá a tu alrededor, movete por la calle y marcá en el mapa dónde creés que estás.',
    en: 'We drop you somewhere in the world. Look around, walk down the street and mark on the map where you think you are.',
  },
  m_famosos: { es: 'Sitios famosos', en: 'Famous places' },
  m_famosos_s: { es: 'Monumentos y lugares conocidos', en: 'Landmarks and well-known spots' },
  m_azar: { es: 'Lugares al azar', en: 'Random places' },
  m_azar_s: { es: 'Cualquier calle del mundo', en: 'Any street in the world' },
  m_pais: { es: 'País o región', en: 'Country or region' },
  m_pais_s: { es: 'Elegí dónde jugar', en: 'Pick where to play' },
  m_diario: { es: 'Desafío diario', en: 'Daily challenge' },
  m_online: { es: 'Online', en: 'Online' },
  m_online_s: { es: 'De 2 a 10 jugadores', en: '2 to 10 players' },
  atajos: {
    es: 'Atajos: Espacio o Enter adivinar · M mapa · H pista · R volver al inicio · N siguiente · Esc cerrar',
    en: 'Shortcuts: Space or Enter guess · M map · H hint · R back to start · N next · Esc close',
  },
  reintentar: { es: 'Reintentar', en: 'Retry' },
  datosRed: { es: 'No pudimos descargar los lugares del juego. Revisá tu conexión.', en: "We couldn't download the game's places. Check your connection." },
  datosFaltan: { es: 'Faltan datos del juego ({archivo}). Avisá a quien mantiene el portal.', en: 'Game data is missing ({archivo}). Let the portal maintainers know.' },
  entendido: { es: 'Entendido', en: 'Got it' },
  menu: { es: 'Menú', en: 'Menu' },
  volver: { es: 'Volver', en: 'Back' },

  // online (el cliente online completo reemplaza online.js)
  onlineTitulo: { es: 'Online: próximamente', en: 'Online: coming soon' },
  onlineProximamente: {
    es: 'Estamos preparando las salas para jugar de a 2 a 10 jugadores. Mientras tanto, jugá en solitario.',
    en: "We're getting the rooms ready for 2 to 10 players. In the meantime, play solo.",
  },
  onlineError: { es: 'No pudimos abrir el modo online. Probá de nuevo más tarde.', en: "We couldn't open online mode. Try again later." },

  // opciones
  op_famosos: { es: 'Monumentos y sitios conocidos de todo el mundo.', en: 'Landmarks and well-known sites from around the world.' },
  op_azar: { es: 'Calles de cualquier país, distintos en cada partida.', en: 'Streets from any country, different every game.' },
  op_pais: { es: 'Elegí un país, Latinoamérica o un continente.', en: 'Pick a country, Latin America or a continent.' },
  op_diario: { es: 'Los mismos 5 lugares para todos, todos los días.', en: 'The same 5 places for everyone, every day.' },
  donde: { es: 'Dónde', en: 'Where' },
  a_mundo: { es: 'Mundo', en: 'World' },
  a_latam: { es: 'Latinoamérica', en: 'Latin America' },
  c_AF: { es: 'África', en: 'Africa' },
  c_AS: { es: 'Asia', en: 'Asia' },
  c_EU: { es: 'Europa', en: 'Europe' },
  c_NA: { es: 'Norteamérica', en: 'North America' },
  c_SA: { es: 'Sudamérica', en: 'South America' },
  c_OC: { es: 'Oceanía', en: 'Oceania' },
  nLugares: { es: '{n} lugares', en: '{n} places' },
  faltanLugares: { es: 'Faltan lugares', en: 'Not enough places' },
  faltanLugaresMsg: { es: 'Todavía no hay suficientes lugares para jugar acá. Probá con otra opción.', en: "There aren't enough places to play here yet. Try another option." },
  otroPais: { es: 'Otro país', en: 'Another country' },
  sinPaises: { es: 'No hay países con ese nombre y suficientes lugares.', en: 'No country with that name and enough places.' },
  azarNota: { es: 'Se sortean lugares de países distintos: no se repiten en la partida.', en: 'Places are drawn from different countries and never repeat in a game.' },
  tiempo: { es: 'Tiempo por ronda', en: 'Time per round' },
  sinLimite: { es: 'Sin límite', en: 'No limit' },
  congelado: { es: 'Congelado', en: 'Frozen' },
  congelado_s: { es: 'No podés moverte, girar ni hacer zoom: solo mirar.', en: "You can't move, turn or zoom: just look." },
  diarioInfo: {
    es: 'Hoy ({fecha}): 5 lugares iguales para todos, {min} minutos por ronda y se puede caminar. Cambia a las 0 h de Argentina.',
    en: 'Today ({fecha}): 5 places, the same for everyone, {min} minutes per round and you can walk around. Resets at midnight in Argentina.',
  },
  jugar: { es: 'Jugar', en: 'Play' },

  // ronda
  r_aria: { es: 'Ronda en juego: vista de calle y mapa para marcar', en: 'Round in play: street view and map to mark your guess' },
  visorTitulo: { es: 'Vista de calle en 360°', en: '360° street view' },
  cargandoVista: { es: 'Cargando la vista…', en: 'Loading the view…' },
  ronda: { es: 'Ronda {n}/{total}', en: 'Round {n}/{total}' },
  quedan: { es: 'Tiempo restante: {t}', en: 'Time left: {t}' },
  b_reiniciar: { es: 'Volver al inicio', en: 'Back to start' },
  b_reiniciar_t: { es: 'Volver al punto de partida (R)', en: 'Go back to the starting point (R)' },
  b_pista: { es: 'Pista', en: 'Hint' },
  b_pista_t: { es: 'Pedir una pista (H)', en: 'Get a hint (H)' },
  b_pista_n: { es: 'Pista {n}/3', en: 'Hint {n}/3' },
  b_pista_fin: { es: 'Sin más pistas', en: 'No more hints' },
  b_pista_ad: { es: 'Pista: mirá un anuncio para recibirla', en: 'Hint: watch an ad to get it' },
  b_nocarga: { es: '¿No carga?', en: "Won't load?" },
  b_nocarga_t: { es: 'Pantalla negra o sin imagen: probar otra ubicación', en: 'Black screen or no imagery: try another location' },
  b_salir: { es: 'Salir', en: 'Quit' },
  b_salir_t: { es: 'Salir de la partida (Esc)', en: 'Quit the game (Esc)' },
  vistaReiniciada: { es: 'Volviste al punto de partida.', en: 'Back at the starting point.' },
  otraUbicacion: { es: 'Probamos con otro lugar. No perdés nada.', en: "We picked another place. You lose nothing." },
  sinMasLugares: { es: 'No quedan más lugares para cambiar.', en: 'No more places to switch to.' },
  sinPistas: { es: 'Ya usaste las 3 pistas de esta ronda.', en: "You've used all 3 hints this round." },
  pistaSinAnuncio: { es: 'Para recibir la pista hay que ver el anuncio completo.', en: 'You need to watch the whole ad to get the hint.' },
  pistaDada: { es: 'Pista {n}: el lugar está dentro del círculo naranja (radio de unos {km} km).', en: 'Hint {n}: the place is inside the orange circle (radius of about {km} km).' },
  enPausa: { es: 'En pausa', en: 'Paused' },
  salirTitulo: { es: '¿Salir de la partida?', en: 'Quit this game?' },
  salirTexto: { es: 'Vas a perder el avance de esta partida.', en: "You'll lose this game's progress." },
  seguir: { es: 'Seguir jugando', en: 'Keep playing' },
  salirMenu: { es: 'Salir al menú', en: 'Quit to menu' },

  // mapa
  mapa: { es: 'Mapa', en: 'Map' },
  mapa_abrir: { es: 'Abrir el mapa para marcar dónde estás', en: 'Open the map to mark where you are' },
  mapa_fijar: { es: 'Fijar', en: 'Pin open' },
  mapa_cerrar: { es: 'Cerrar mapa', en: 'Close map' },
  mapa_centro: { es: 'Poner el pin en el centro del mapa', en: 'Drop the pin at the center of the map' },
  mapaEtiqueta: { es: 'Mapa: tocá o hacé clic para marcar dónde creés que estás', en: 'Map: tap or click to mark where you think you are' },
  mapaError: { es: 'No se pudo cargar el mapa. Revisá tu conexión.', en: "The map couldn't load. Check your connection." },
  marcaElMapa: { es: 'Marcá un punto en el mapa', en: 'Mark a spot on the map' },
  adivinar: { es: 'Adivinar', en: 'Guess' },
  marcaPrimero: { es: 'Primero marcá un punto en el mapa.', en: 'Mark a spot on the map first.' },

  // resultado
  vos: { es: 'Vos', en: 'You' },
  estuviste: { es: 'Estuviste a {d}', en: 'You were {d} away' },
  seAcabo: { es: 'Se acabó el tiempo', en: "Time's up" },
  sinPin: { es: 'No marcaste nada', en: "You didn't mark anything" },
  elLugar: { es: 'El lugar era: {lugar}', en: 'The place was: {lugar}' },
  puntos: { es: 'puntos', en: 'points' },
  totalParcial: { es: 'Total: {n} de {max}', en: 'Total: {n} of {max}' },
  siguiente: { es: 'Siguiente ronda', en: 'Next round' },
  verResumen: { es: 'Ver el resumen', en: 'See the summary' },

  // resumen
  finDiario: { es: 'Desafío diario · {fecha}', en: 'Daily challenge · {fecha}' },
  finTitulo: { es: 'Fin de la partida', en: 'Game over' },
  f1: { es: '¡A seguir viajando! El mundo es grande.', en: 'Keep traveling! The world is big.' },
  f2: { es: 'Buen comienzo: cada partida te hace más viajero.', en: 'Good start: every game makes you a better traveler.' },
  f3: { es: 'Nada mal, tenés ojo para los detalles.', en: 'Not bad, you have an eye for detail.' },
  f4: { es: '¡Muy bien! Conocés el mundo.', en: 'Very good! You know the world.' },
  f5: { es: '¡Increíble! Sos un mapa con patas.', en: "Incredible! You're a walking atlas." },
  otraVez: { es: 'Jugar otra vez', en: 'Play again' },
  copiar: { es: 'Copiar resultado', en: 'Copy result' },
  copiado: { es: '¡Copiado!', en: 'Copied!' },
  noCopiado: { es: 'No se pudo copiar.', en: "Couldn't copy." },
  compartirTitulo: { es: 'Trotamundos · Diario {fecha}', en: 'Globetrotter · Daily {fecha}' },
};

/** Texto de `clave` en `lang` ('es' | 'en') con las variables {x} reemplazadas. Si falta, devuelve la clave (se nota al probar). */
export function traducir(lang, clave, vars = {}) {
  const e = TEXTOS[clave];
  if (!e) return clave;
  const s = e[lang] ?? e.es ?? clave;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}
