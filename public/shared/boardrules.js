/**
 * Reglas de Tateti y 4 en línea. Compartidas por el cliente (CPU y local) y el servidor (online).
 * Tablero: array plano; celdas con -1 (vacía), 0 o 1 (jugador).
 */
const LINES3 = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const tictactoe = {
  cells: 9,
  empty: () => new Array(9).fill(-1),
  moves: (b) => b.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0),
  legal: (b, i) => Number.isInteger(i) && i >= 0 && i < 9 && b[i] === -1,
  /** Devuelve la celda donde queda la ficha. */
  apply(b, i, p) {
    b[i] = p;
    return i;
  },
  check(b) {
    for (const l of LINES3) if (b[l[0]] !== -1 && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { winner: b[l[0]], line: l };
    return { winner: -1, line: null, full: b.every((v) => v !== -1) };
  },
};

export const C4 = { cols: 7, rows: 6 };
export const connect4 = {
  cells: 42,
  empty: () => new Array(42).fill(-1),
  // en 4 en línea el movimiento es la columna
  moves: (b) => [3, 2, 4, 1, 5, 0, 6].filter((c) => b[c] === -1),
  legal: (b, c) => Number.isInteger(c) && c >= 0 && c < 7 && b[c] === -1,
  apply(b, c, p) {
    for (let r = C4.rows - 1; r >= 0; r--) {
      const i = r * 7 + c;
      if (b[i] === -1) {
        b[i] = p;
        return i;
      }
    }
    return -1;
  },
  check(b) {
    const at = (r, c) => (r < 0 || r >= 6 || c < 0 || c >= 7 ? -2 : b[r * 7 + c]);
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 7; c++) {
        const v = at(r, c);
        if (v < 0) continue;
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          const line = [r * 7 + c];
          for (let k = 1; k < 4 && at(r + dr * k, c + dc * k) === v; k++) line.push((r + dr * k) * 7 + c + dc * k);
          if (line.length === 4) return { winner: v, line };
        }
      }
    return { winner: -1, line: null, full: b.slice(0, 7).every((v) => v !== -1) };
  },
};
