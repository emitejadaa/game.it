/**
 * Cuentas para Ecuación y Cálculo (juegos diarios). Todo con aritmética exacta (fracciones de enteros), sin
 * `eval` ni decimales: el mismo desafío sale igual en todos los navegadores.
 *
 * Gramática: expr := término (('+' | '-') término)* · término := número (('*' | '/') número)* · número := dígitos
 * sin ceros a la izquierda (el "0" solo vale). Sin paréntesis ni números negativos escritos.
 */

// ---------------------------------------------------------------- fracciones
const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};
const frac = (n, d = 1) => {
  const g = gcd(n, d);
  return d < 0 ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g };
};
const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
const div = (a, b) => frac(a.n * b.d, a.d * b.n);
export const fracEq = (a, b) => a.n * b.d === b.n * a.d;

// ---------------------------------------------------------------- análisis
/**
 * Descompone una expresión en términos: [{ sign: +1|-1, nums: [..], dens: [..] }] (los números como enteros).
 * Devuelve null si no cumple la gramática.
 */
export function parseTerms(str) {
  if (!/^[0-9+\-*/]+$/.test(str)) return null;
  const terms = [];
  let i = 0;
  let sign = 1;
  const n = str.length;
  const number = () => {
    const s = i;
    while (i < n && str[i] >= '0' && str[i] <= '9') i++;
    const txt = str.slice(s, i);
    if (!txt || (txt.length > 1 && txt[0] === '0') || txt.length > 7) return null;
    return Number(txt);
  };
  for (;;) {
    const term = { sign, nums: [], dens: [] };
    const first = number();
    if (first === null) return null;
    term.nums.push(first);
    while (i < n && (str[i] === '*' || str[i] === '/')) {
      const op = str[i++];
      const v = number();
      if (v === null) return null;
      (op === '*' ? term.nums : term.dens).push(v);
    }
    terms.push(term);
    if (i >= n) return terms;
    sign = str[i] === '+' ? 1 : -1;
    i++;
  }
}

/** Valor exacto ({n, d}) de una expresión, o null si es inválida (sintaxis o división por cero). */
export function evaluate(str) {
  const terms = parseTerms(str);
  if (!terms) return null;
  let total = frac(0);
  for (const t of terms) {
    let v = frac(t.nums[0]);
    for (const x of t.nums.slice(1)) v = mul(v, frac(x));
    for (const x of t.dens) {
      if (x === 0) return null;
      v = div(v, frac(x));
    }
    total = t.sign > 0 ? add(total, v) : sub(total, v);
  }
  return total;
}
export const isInt = (f) => f.d === 1;

/**
 * Forma canónica para saber si dos cuentas son "la misma" salvo el orden de lo que se suma o se multiplica
 * (2+3*4 = 3*4+2 = 4*3+2). Dos cuentas distintas con el mismo valor (2*6 y 3*4) NO son la misma.
 */
export function canon(str) {
  const terms = parseTerms(str);
  if (!terms) return null;
  return terms
    .map((t) => `${t.sign > 0 ? '+' : '-'}${[...t.nums].sort((a, b) => a - b).join('*')}${t.dens.length ? '/' + [...t.dens].sort((a, b) => a - b).join('/') : ''}`)
    .sort()
    .join('');
}

// ---------------------------------------------------------------- ecuaciones (Ecuación)
/**
 * Valida un intento de ecuación: devuelve null si vale, o una clave de error:
 *   'oneEq' (tiene que haber un solo "="), 'syntax' (algo no es una cuenta válida), 'notEqual' (los lados no dan lo mismo).
 */
export function checkEquation(str) {
  const parts = str.split('=');
  if (parts.length !== 2) return 'oneEq';
  const [l, r] = parts.map(evaluate);
  if (!l || !r) return 'syntax';
  return fracEq(l, r) ? null : 'notEqual';
}

/** Arma una cuenta de operandos al azar con `ops` operadores y `digits` dígitos en total. Devuelve el texto o null. */
function randomExpr(rnd, nOps, digits, noZero = true) {
  const operands = nOps + 1;
  if (digits < operands) return null;
  // reparte los dígitos entre los operandos (al menos uno cada uno)
  const sizes = Array(operands).fill(1);
  for (let k = digits - operands; k > 0; k--) sizes[Math.floor(rnd() * operands)]++;
  if (sizes.some((s) => s > 4)) return null;
  const nums = sizes.map((s) => {
    if (s === 1) return String((noZero ? 1 : 0) + Math.floor(rnd() * (noZero ? 9 : 10)));
    return String(Math.pow(10, s - 1) + Math.floor(rnd() * 9 * Math.pow(10, s - 1)));
  });
  let out = nums[0];
  for (let i = 1; i < operands; i++) out += '+-*/'[Math.floor(rnd() * 4)] + nums[i];
  return out;
}

/**
 * Ecuación secreta del día: 8 caracteres con un solo "=" y valores enteros (por ejemplo "12+34=46" o "45=9*5").
 * Se prueba con la secuencia del generador hasta dar con una válida; el resultado depende solo de `rnd`.
 */
export function randomEquation(rnd) {
  for (let tries = 0; tries < 20000; tries++) {
    const nOps = 1 + Math.floor(rnd() * 3);
    const lhsChars = 2 + Math.floor(rnd() * 5); // dígitos del lado izquierdo
    const digits = lhsChars;
    const lhs = randomExpr(rnd, nOps, digits);
    if (!lhs) continue;
    if (/(^|[*/])1(?![0-9])/.test(lhs) && /[*/]/.test(lhs)) continue; // sin multiplicar ni dividir por 1
    const v = evaluate(lhs);
    if (!v || !isInt(v) || v.n < 0) continue;
    const rhs = String(v.n);
    const eq = rnd() < 0.3 ? `${rhs}=${lhs}` : `${lhs}=${rhs}`;
    if (eq.length !== 8) continue;
    if (checkEquation(eq)) continue;
    return eq;
  }
  throw new Error('randomEquation: sin resultado');
}

// ---------------------------------------------------------------- cálculos (Cálculo)
/** Cálculo secreto de 6 caracteres con su resultado: { calc: '12+3*5', target: 27 }. */
export function randomCalc(rnd) {
  for (let tries = 0; tries < 20000; tries++) {
    const nOps = 1 + Math.floor(rnd() * 2);
    const digits = 6 - nOps; // 6 caracteres en total
    const calc = randomExpr(rnd, nOps, digits);
    if (!calc || calc.length !== 6) continue;
    if (/(^|[*/])1(?![0-9])/.test(calc) && /[*/]/.test(calc)) continue; // sin multiplicar o dividir por 1
    const v = evaluate(calc);
    if (!v || !isInt(v) || v.n < 2 || v.n > 9999) continue;
    return { calc, target: v.n };
  }
  throw new Error('randomCalc: sin resultado');
}
