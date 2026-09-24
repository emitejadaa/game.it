/**
 * Reglas de la partida (turnos, golpes, puntajes). La usan el modo local del cliente
 * y el servidor online, así las reglas son idénticas en los dos.
 */
import { HOLES, COURSES, MAX_STROKES } from './holes.js';

export const COLORS = ['#ff5a5f', '#3ec1ff', '#ffc93c', '#7bd389'];

export class Match {
  /**
   * @param {{ course: number[], players: {id:string,name:string,color?:string}[] }} opts
   */
  constructor({ course, players }) {
    this.course = course;
    this.players = players.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: p.color || COLORS[i % COLORS.length],
      scores: [],
      strokes: 0,
      done: false,
      ball: null,
      active: true,
    }));
    this.holeIdx = -1;
    this.turn = null;
    this.state = 'playing'; // playing | between | finished
  }

  get hole() {
    return HOLES[this.course[this.holeIdx]];
  }

  get par() {
    return this.hole.par;
  }

  player(id) {
    return this.players.find((p) => p.id === id);
  }

  /** Arranca el siguiente hoyo. Devuelve false si terminó el recorrido. */
  nextHole() {
    this.holeIdx++;
    if (this.holeIdx >= this.course.length) {
      this.state = 'finished';
      this.turn = null;
      return false;
    }
    const [tx, ty] = this.hole.tee;
    // "honor": empieza quien mejor anotó el hoyo anterior
    const order = [...this.players].sort((a, b) => (a.scores.at(-1) ?? 0) - (b.scores.at(-1) ?? 0));
    this.players.forEach((p) => {
      p.strokes = 0;
      p.done = !p.active;
      p.ball = { x: tx, y: ty };
    });
    this.state = 'playing';
    this.turn = order.find((p) => !p.done)?.id ?? null;
    if (!this.turn) return this.finishHole();
    return true;
  }

  /** Aplica el resultado de un tiro. Devuelve info del evento de puntaje si el jugador terminó. */
  applyShot(id, res) {
    const p = this.player(id);
    if (!p || this.turn !== id || p.done) return null;
    p.strokes += 1 + (res.water ? 1 : 0);
    p.ball = { x: res.x, y: res.y };
    let outcome = null;
    if (res.holed) {
      p.done = true;
      outcome = { id, strokes: p.strokes, rel: p.strokes - this.par, label: label(p.strokes, this.par) };
    } else if (p.strokes >= MAX_STROKES) {
      p.strokes = MAX_STROKES;
      p.done = true;
      outcome = { id, strokes: p.strokes, rel: p.strokes - this.par, label: 'max' };
    }
    this.advance();
    return outcome;
  }

  /** Turno perdido (tiempo agotado): suma un golpe sin mover la pelota. */
  skip(id, penalty = 1) {
    const p = this.player(id);
    if (!p || this.turn !== id) return null;
    p.strokes += penalty;
    let outcome = null;
    if (p.strokes >= MAX_STROKES) {
      p.strokes = MAX_STROKES;
      p.done = true;
      outcome = { id, strokes: p.strokes, rel: p.strokes - this.par, label: 'max' };
    }
    this.advance();
    return outcome;
  }

  /** Pasa el turno al siguiente jugador que no terminó el hoyo. */
  advance() {
    const n = this.players.length;
    const cur = this.players.findIndex((p) => p.id === this.turn);
    for (let k = 1; k <= n; k++) {
      const p = this.players[(cur + k) % n];
      if (!p.done && p.active) {
        this.turn = p.id;
        return;
      }
    }
    this.finishHole();
  }

  finishHole() {
    this.turn = null;
    for (const p of this.players) if (p.scores.length === this.holeIdx) p.scores.push(p.active ? p.strokes : MAX_STROKES);
    this.state = this.holeIdx >= this.course.length - 1 ? 'finished' : 'between';
    return false;
  }

  /** Un jugador se fue: termina sus hoyos con el máximo y no vuelve a tener turno. */
  deactivate(id) {
    const p = this.player(id);
    if (!p) return;
    p.active = false;
    if (!p.done) {
      p.done = true;
      p.strokes = MAX_STROKES;
    }
    if (this.turn === id) this.advance();
  }

  standings() {
    return this.players
      .map((p) => ({ id: p.id, name: p.name, color: p.color, total: sum(p.scores), rel: sum(p.scores) - this.parTotal(p.scores.length), active: p.active }))
      .sort((a, b) => b.active - a.active || a.total - b.total);
  }

  parTotal(n = this.course.length) {
    return this.course.slice(0, n).reduce((s, i) => s + HOLES[i].par, 0);
  }

  toJSON() {
    return {
      course: this.course,
      holeIdx: this.holeIdx,
      turn: this.turn,
      state: this.state,
      players: this.players.map(({ id, name, color, scores, strokes, done, ball, active }) => ({ id, name, color, scores, strokes, done, ball, active })),
    };
  }

  static from(json) {
    const m = new Match({ course: json.course, players: json.players });
    Object.assign(m, { holeIdx: json.holeIdx, turn: json.turn, state: json.state });
    m.players = json.players.map((p) => ({ ...p }));
    return m;
  }
}

const sum = (a) => a.reduce((s, v) => s + v, 0);

export function label(strokes, par) {
  if (strokes === 1) return 'ace';
  const rel = strokes - par;
  return rel <= -3 ? 'albatross' : rel === -2 ? 'eagle' : rel === -1 ? 'birdie' : rel === 0 ? 'par' : rel === 1 ? 'bogey' : rel === 2 ? 'double' : 'over';
}

export { COURSES };
