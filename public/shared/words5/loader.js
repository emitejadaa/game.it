/** Carga las listas de Quinteto y Cuarteto: palabras válidas, respuestas posibles y cómo mostrarlas (con tilde). */
import { norm } from '/shared/words5/norm.js';

const fetchText = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(u);
  return r.text();
};

export async function loadWords5(lang) {
  const [allowed, answers] = await Promise.all([fetchText(`/shared/words5/allowed-${lang}.txt`), fetchText(`/shared/words5/answers-${lang}.json`).then(JSON.parse)]);
  return { allowed: new Set(allowed.split('\n')), answers, display: new Map(answers.map((a) => [norm(a, lang), a])) };
}

/** Teclado QWERTY (con Ñ en español). */
export const KEYS5 = {
  es: [[...'qwertyuiop'], [...'asdfghjklñ'], ['ENTER', ...'zxcvbnm', 'DEL']],
  en: [[...'qwertyuiop'], [...'asdfghjkl'], ['ENTER', ...'zxcvbnm', 'DEL']],
};
