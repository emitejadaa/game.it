/** Minúsculas, sin tildes (la ñ se conserva) y solo las letras válidas del idioma: así se comparan los intentos. */
export function norm(w, lang = 'es') {
  const s = String(w || '')
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ');
  return lang === 'es' ? s.replace(/[^a-zñ]/g, '') : s.replace(/[^a-z]/g, '');
}
