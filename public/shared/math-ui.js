/** Teclas y símbolos de los juegos de cuentas (Ecuación y Cálculo). */
const SHOW = { '*': '×', '/': '÷', '-': '−' };
export const mathLabel = (t) => SHOW[t] || t;

/** Token que corresponde a una tecla física: dígitos, + − * / (también "x" y ":"), y "=" si se permite. */
export function mathFromEvent(e, withEq) {
  const k = e.key;
  if (/^[0-9]$/.test(k) || k === '+' || k === '-' || k === '*' || k === '/') return k;
  if (k === 'x' || k === 'X') return '*';
  if (k === ':') return '/';
  if (withEq && k === '=') return '=';
  return null;
}

export const mathKeyRows = (withEq) => [[...'1234567890'], [...'+-*/', ...(withEq ? ['='] : []), 'ENTER', 'DEL']];
