/**
 * Datos de Colmena (public/games/colmena/data/):
 *
 *   words-{es,en}.txt     palabras comunes de 4 letras o más (una por línea, sin tildes), que están en el diccionario de
 *                         Mecha Corta Y entre las ~40 mil más frecuentes de las listas de subtítulos (hermitdave/FrequencyWords,
 *                         CC BY-SA 4.0: se usan solo para decidir qué palabras son comunes y NO se copian al repo).
 *   puzzles-{es,en}.json  730 desafíos ['abcdefg', 'c'] (letras ordenadas, letra central), mezclados una vez con semilla fija.
 *                         El desafío n.º N es puzzles[(N − 1) % 730].
 *
 *   node tools/daily/colmena-gen.mjs [carpeta-con-es_50k.txt-y-en_50k.txt]
 *
 * Los desafíos son deterministas (semilla por idioma). En el navegador las respuestas del día se calculan filtrando words-*.txt.
 * Ver también public/games/colmena/data/LEEME.txt.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decode, norm } from '../../public/games/mecha/shared/dict.js';
import { rng, shuffle } from '../../public/shared/daily.js';
import { answersFor, scoreWord, isPangram, MIN_LEN } from '../../public/games/colmena/logic.js';

const OUT = new URL('../../public/games/colmena/data/', import.meta.url);
const DICT = new URL('../../public/games/mecha/dict/', import.meta.url);
const SRC = process.argv[2] || '/tmp/claude-1000/-home-tejada-Desktop-game-it/8e4caaf3-97e7-4e2d-a9f6-a1eb036de658/scratchpad/data-src';
const TOP = 40000;
export const PUZZLES = 730;

// Letras que no entran en los desafíos (sí pueden estar en palabras, que simplemente nunca sirven):
//  es: k w x z q j ñ — raras o difíciles de tipear en un panal (la z se saca para que no haya tantos panales "z + vocal")
//  en: j q x z k w — raras; con ellas salen panales injustos
const BAN = { es: 'kwxzqjñ', en: 'jqxzkw' };
const MIN_ANS = 20;
const MAX_ANS = 60;
const MIN_PTS = 40;
const MAX_PTS = 250;
// el panagrama del desafío tiene que ser una palabra bien común (posición en la lista de frecuencias)
const PANGRAM_RANK = 22000;
// las palabras cortas son las que más basura traen (nombres, siglas, palabras de otro idioma): se les pide ser más frecuentes
const maxRank = (len) => (len === 4 ? 21000 : len === 5 ? 28000 : TOP);

// Groserías y palabras que no queremos como respuestas (raíces; coincide con el comienzo de la palabra).
const BAD = {
  es: /^(puta|puto|putas|putos|mierd|joder|jodid|jodo|cabron|culo|verga|polla|follar|follo|folla|maricon|marica|zorra|pendej|chingar|chinga|chingo|coger|cogi|pija|pete|mamada|concha|gilipoll|capullo|cojon|hostia|gonorrea|violar|violacion|violad|nazi|racis|negrata|sudaca|retrasad|mongol|subnormal|sidoso|travelo|trolo|boludo|boluda|pajero|pajera|paja|tetas|teta|sexo|sexual|porno|prostitut|semen|pene|vagina|orgasm|orina|mear|meo|cagar|cago|caga|cagad|pedo|culiar|culea|pinche|panocha|chocha|cojo)/,
  en: /^(fuck|shit|cunt|bitch|nigg|fagg|fag$|fags|whore|slut|dick|cock$|cocks|pussy|asshol|bastard|retard|rape|raped|raping|rapist|nazi|porn|sperm|penis|vagina|orgasm|piss|crap|damn|twat|wank|bugger|tits|boob|nude|naked|cum$|cums|jerk|horny|sex$|sexy|sexual|sexes|slave|queer|dyke|homo$|gay$)/,
};
// Nombres propios y palabras sueltas que se cuelan de las listas (agregar acá lo que se vaya encontrando).
const STOP = {
  es: new Set(['taxi', 'hola', 'chau', 'okey', 'dios', 'amen', 'sido']),
  en: new Set(['okay', 'yeah', 'hmm', 'huh', 'wow', 'ugh', 'gonna', 'gotta', 'wanna', 'lets', 'dont', 'cant', 'wont', 'didnt', 'isnt', 'doesnt', 'hello', 'hey', 'whoa', 'mmm']),
};

// Nombres de pila, lugares y palabras sueltas de otros idiomas que traen las listas de subtítulos y que además figuran
// en el diccionario (las listas no distinguen mayúsculas). Se completó mirando los desafíos generados.
const NAMES = new Set(
  `maria mary jane jean jeff jess jenny ginny gaby gabi bree bren brice sean tina nina noah omar otto ariel merle dino rach meng sora bitte troy mara
   luisa lucia lola lana luna rosa rosy vera nora olga paula laura sara sarah anna anne anita carla carlos pedro pablo juan jose luis mario marta
   diego sergio rafael hugo oscar ivan ruben julio julia silvia sofia elena irene elisa clara pilar teresa tomas andres alvaro adrian
   john jack jake jill jim joey kate katie kyle luke mike nick paul pete ryan sam tom tony alan alex andy amy ben bill bob brad carl chad dave dean eric fred
   gary gina greg hank ian karl liam lars owen ruth lucy lisa nova congo morse milan nasa tori nelson leone noel ness stetson tung ting duan rudd curran
   tana nona noni anata finito innit tian tuan nandu cade cate comm comte thang ronin frau eden mola`.split(/\s+/).filter(Boolean),
);

const freqOf = (lang) => {
  const rank = new Map();
  const lines = readFileSync(`${SRC}/${lang}_50k.txt`, 'utf8').split('\n');
  for (let i = 0; i < Math.min(TOP, lines.length); i++) {
    const tok = lines[i].split(' ')[0];
    if (!tok || /[^\p{L}]/u.test(tok)) continue; // sin apóstrofes, números ni guiones
    const w = norm(tok, lang);
    if (!rank.has(w)) rank.set(w, i);
  }
  return rank;
};

export function buildWords(lang) {
  const other = freqOf(lang === 'es' ? 'en' : 'es');
  const dict = new Set(decode(readFileSync(new URL(`${lang}.txt`, DICT), 'utf8')));
  const rank = freqOf(lang);
  const ban = BAN[lang];
  const out = [];
  for (const [w, r] of rank) {
    if (w.length < MIN_LEN || w.length > 14 || !dict.has(w) || r > maxRank(w.length)) continue;
    // mucho más frecuente en el otro idioma: es una palabra (o nombre) de ese idioma que se coló en los subtítulos
    if (other.has(w) && other.get(w) * 4 < r) continue;
    if ([...ban].some((c) => w.includes(c))) continue;
    if (BAD[lang].test(w) || STOP[lang].has(w) || NAMES.has(w)) continue;
    if (new Set(w).size < 3) continue; // "jajaja", "ahhhh"…
    if (/(.)\1\1/.test(w)) continue;
    out.push([w, r]);
  }
  // plural de algo que no existe ("xs" sin "x"): se descarta, suele ser un nombre propio o una sigla
  const keep = out.filter(([w]) => {
    if (lang !== 'en' || !w.endsWith('s') || /(ss|us|is)$/.test(w)) return true;
    return dict.has(w.slice(0, -1)) || (w.endsWith('es') && dict.has(w.slice(0, -2))) || (w.endsWith('ies') && dict.has(`${w.slice(0, -3)}y`));
  });
  return keep.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function run() {
  mkdirSync(OUT, { recursive: true });
  const report = {};
  for (const lang of ['es', 'en']) {
    const entries = buildWords(lang);
    const words = entries.map(([w]) => w);
    const rank = new Map(entries);
    writeFileSync(new URL(`words-${lang}.txt`, OUT), words.join('\n') + '\n');
    // ---- candidatos: cada conjunto de 7 letras que sale de un panagrama común
    const seen = new Set();
    const cands = [];
    const letterIdx = words.map((w) => new Set(w));
    for (let i = 0; i < words.length; i++) {
      if (letterIdx[i].size !== 7 || rank.get(words[i]) > PANGRAM_RANK) continue;
      const key = [...letterIdx[i]].sort().join('');
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push(key);
    }
    const good = [];
    for (const key of cands) {
      // la letra central: la que deja entre 20 y 60 palabras (si hay varias, la que más se acerca a 38)
      let best = null;
      for (const c of key) {
        const ans = answersFor(words, key, c);
        const pts = ans.reduce((s, w) => s + scoreWord(w, key), 0);
        if (ans.length < MIN_ANS || ans.length > MAX_ANS || pts < MIN_PTS || pts > MAX_PTS) continue;
        if (!ans.some((w) => isPangram(w, key))) continue;
        const d = Math.abs(ans.length - 38);
        if (!best || d < best.d) best = { key, c, d, n: ans.length, pts };
      }
      if (best) good.push(best);
    }
    const order = shuffle(rng(`colmena:${lang}`), good);
    const puzzles = order.slice(0, PUZZLES).map((p) => [p.key, p.c]);
    if (puzzles.length < PUZZLES) throw new Error(`${lang}: solo ${puzzles.length} desafíos válidos`);
    writeFileSync(new URL(`puzzles-${lang}.json`, OUT), JSON.stringify(puzzles) + '\n');
    report[lang] = { palabras: words.length, kb: Math.round(words.join('\n').length / 1024), conjuntos: cands.length, validos: good.length };
  }
  console.log(report);
}

if (import.meta.url === `file://${process.argv[1]}`) run();
