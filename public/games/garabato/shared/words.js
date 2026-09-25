/**
 * Garabato — palabras para dibujar (listas propias). Cosas, animales, lugares, acciones y
 * personajes fáciles de reconocer en un dibujo rápido; de una a tres palabras.
 */
export const WORDS = {
  es: `
abeja, abrazo, abrigo, aguacate, águila, ajedrez, alas, alfombra, almohada, ancla, anillo, antena, anteojos, araña, árbol,
arco iris, arena, ardilla, astronauta, auriculares, autobús, auto, avión, avispa, bailarina, ballena, banana, bandera, barba,
barco, barril, basura, bate, batería, bebé, bicicleta, bigote, billetera, boca, bolsa, bombero, bombilla, bosque, botella,
botón, boxeo, brazo, brócoli, brújula, bruja, buzo, caballo, cabra, cactus, cadena, café, caja fuerte, calabaza, calavera,
calcetín, calendario, cama, camaleón, cámara, camello, camión, campana, canasta, candado, cangrejo, canguro, cañón, caracol,
carpa, carta, cascada, casco, castillo, cebra, cepillo de dientes, cerdo, cereza, cerebro, chimenea, chocolate, cine,
cinturón, circo, cisne, ciudad, clavo, cocinero, cocodrilo, cohete, collar, columpio, cometa, computadora, conejo, copa,
corazón, corbata, corona, cuchara, cuchillo, cuerda, dado, delfín, diamante, diente, dinosaurio, dragón, ducha, elefante,
enchufe, escalera, escoba, escudo, espada, espejo, esqueleto, estrella, estrella de mar, faro, fantasma, flamenco, flecha,
flor, foca, fogata, fresa, fuente, fútbol, gafas de sol, galleta, gallina, gato, gigante, globo, gorila, gorra, guante,
guitarra, gusano, hacha, hada, hamaca, hamburguesa, helado, helicóptero, hielo, hipopótamo, hoja, hongo, hormiga, horno,
hueso, huevo, iglú, imán, isla, jaula, jirafa, juguete, koala, lámpara, lápiz, lavarropas, león, libro, limón, linterna,
llave, lluvia, lobo, loro, luna, lupa, maceta, maleta, mancha, mano, manzana, mapa, mariposa, martillo, máscara, medusa,
mesa, micrófono, microondas, mochila, mono, montaña, moño, mosca, moto, murciélago, música, naranja, nariz, nave espacial,
nido, nieve, nube, ojo, ola, oreja, oso, oso polar, oveja, paleta, palmera, paloma, pan, panda, pantalón, papel, paracaídas,
paraguas, pato, payaso, peine, pelota, pera, perro, pez, piano, pie, piedra, pingüino, pino, pintor, piña, pirámide, pirata,
pizza, planta, plátano, playa, pluma, policía, pollo, pulpo, puente, puerta, pulsera, queso, radio, rana, ratón, rayo, reloj,
remera, reina, rey, robot, rodilla, rompecabezas, rosa, rueda, sandía, sandwich, sartén, semáforo, serpiente, silla,
sirena, sobre, sofá, sol, sombrero, sombrilla, submarino, tambor, taza, teclado, teléfono, telescopio, televisor, tenedor,
tenis, tiburón, tigre, tijera, tobogán, tomate, tornado, toro, tortuga, tractor, tren, trompeta, tulipán, uva, vaca, vampiro,
vela, velero, ventana, ventilador, volcán, yate, yoyó, zanahoria, zapatilla, zapato, zorro, correr, dormir, nadar, saltar,
bailar, llorar, cocinar, pescar, volar, estornudar, bostezar, escalar, cantar, reír, leer
`,
  en: `
airplane, alarm clock, alien, anchor, angel, ant, apple, arrow, astronaut, avocado, axe, baby, backpack, balloon, banana,
bandage, basket, bat, bathtub, beach, bear, beard, bed, bee, bell, belt, bicycle, bird, birthday cake, boat, bone, book,
boot, bottle, bow tie, bowling, brain, bread, bridge, broccoli, broom, bubble, bucket, bus, butterfly, cactus, cake, camel,
camera, campfire, candle, candy, cannon, car, carrot, castle, cat, caterpillar, chair, cheese, cherry, chess, chicken,
chimney, circus, city, clock, cloud, clown, coffee, comb, compass, computer, cookie, cow, crab, crocodile, crown, cup,
dice, dinosaur, doctor, dog, dolphin, donut, door, dragon, drum, duck, eagle, ear, earth, egg, elephant, envelope, eye,
fairy, fence, fire truck, fish, flag, flamingo, flashlight, flower, fly, football, fork, fox, frog, ghost, giraffe, glasses,
glove, goat, gorilla, grapes, guitar, hair, hammer, hamburger, hammock, hand, hat, headphones, heart, helicopter, hippo,
honey, horse, hot dog, house, ice cream, igloo, island, jellyfish, jungle, kangaroo, key, king, kite, knife, koala, ladder,
lamp, leaf, lemon, light bulb, lighthouse, lightning, lion, lipstick, lock, lollipop, magnet, map, mask, microphone,
microwave, mirror, money, monkey, moon, mosquito, motorcycle, mountain, mouse, mushroom, mustache, nest, nose, octopus,
onion, owl, paint, palm tree, panda, parachute, parrot, peach, pear, pen, pencil, penguin, piano, pig, pillow, pineapple,
pirate, pizza, planet, plant, police car, popcorn, potato, pumpkin, puzzle, queen, rabbit, rain, rainbow, robot, rocket,
rose, sandwich, saw, scarf, school, scissors, sea, shark, sheep, shell, ship, shoe, shower, skateboard, skeleton, skull,
snail, snake, snowman, soap, sock, sofa, spaghetti, spider, spoon, squirrel, star, starfish, strawberry, submarine, sun,
sunglasses, swan, sword, table, telescope, tent, tiger, toilet, tomato, tooth, toothbrush, tornado, tractor, traffic light,
train, treasure, tree, trophy, truck, trumpet, turtle, umbrella, unicorn, vampire, violin, volcano, waterfall, watermelon,
whale, wheel, window, witch, wolf, worm, zebra, zipper, run, sleep, swim, jump, dance, cry, cook, fish, fly, sneeze, yawn,
climb, sing, laugh, read
`,
};

for (const k of Object.keys(WORDS))
  WORDS[k] = [
    ...new Set(
      WORDS[k]
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ];

/** Para comparar: minúsculas, sin tildes ni signos, espacios simples. */
export function clean(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ')
    .replace(/[^a-zñ0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distancia de edición (para avisar "¡casi!"). */
export function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Pista: guiones por letra, espacios entre palabras, y las letras ya reveladas. */
export function mask(word, shown) {
  return [...word].map((ch, i) => (ch === ' ' ? ' ' : shown.has(i) ? ch : '_')).join('');
}
