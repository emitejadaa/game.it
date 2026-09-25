/**
 * Chispa — la mesa: rondas, puntos, turnos de la compu, tiempo por turno y lo que ve cada jugador.
 * La usan igual el navegador (contra la compu) y el servidor (online); cambia solo `io`:
 *
 *   io.emit(seat, view)      manda el estado a un jugador humano
 *   io.timer(name, ms, fn)   programa algo (uno por nombre)
 *   io.clear(name)
 *   io.over(standings)       terminó la partida
 */
import { newRound, play, draw, pass, call, catchLast, roundPoints, sortHand, top } from './rules.js';
import { decide, LEVELS } from './bot.js';

const NEXT_MS = 9000; // pausa entre rondas
const DEAL_MS = 1900; // lo que tarda la animación de repartir

export class Table {
  /**
   * seats: [{ id, name, color, bot: 0 (humano) | 1..3 (nivel) }]
   * opts: { target: 0 (una ronda) | puntos, stack: bool, turnMs: 0 | ms }
   */
  constructor({ seats, opts, io, rng }) {
    this.seats = seats.map((s) => ({ ...s, score: 0, away: false }));
    this.opts = { target: 200, stack: true, turnMs: 0, ...opts };
    this.io = io;
    this.rng = rng;
    this.seq = 0;
    this.round = 0;
    this.phase = 'idle';
    this.s = null;
    this.ev = null;
    this.deadline = 0;
    this.result = null;
    this.nextAt = 0;
    this.dealer = Math.floor(rng() * seats.length);
    this.gid = Math.floor(rng() * 1e9); // identifica la partida (el cliente sabe cuándo empieza otra)
  }

  get n() {
    return this.seats.length;
  }

  start(bonus = null) {
    for (const s of this.seats) s.score = 0;
    this.round = 0;
    this.nextRound(bonus);
  }

  /** bonus: { seat, id } — carta extra para un jugador (premio por ver un anuncio). */
  nextRound(bonus = null) {
    this.io.clear('next');
    this.round++;
    this.dealer = (this.dealer + 1) % this.n;
    this.s = newRound(this.n, this.dealer, this.opts, this.rng);
    if (bonus) {
      // se busca la carta en el mazo y se agrega a la mano
      const i = this.s.draw.indexOf(bonus.id);
      if (i >= 0) {
        this.s.draw.splice(i, 1);
        this.s.hands[bonus.seat].push(bonus.id);
        sortHand(this.s.hands[bonus.seat]);
      }
    }
    this.phase = 'play';
    this.result = null;
    this.emitEv({ k: 'deal', dealer: this.dealer, round: this.round });
  }

  emitEv(ev) {
    this.ev = ev;
    this.seq++;
    this.update();
  }

  /** Jugada de un jugador: { t: 'play', id, color } | draw | pass | call | { t: 'catch', p }. */
  act(i, msg) {
    if (this.phase !== 'play' || !msg) return false;
    const s = this.s;
    const r = this.rng;
    let ev = null;
    if (msg.t === 'play') ev = play(s, i, Number(msg.id), msg.color === undefined ? undefined : Number(msg.color), r);
    else if (msg.t === 'draw') ev = draw(s, i, r);
    else if (msg.t === 'pass') ev = pass(s, i);
    else if (msg.t === 'call') ev = call(s, i);
    else if (msg.t === 'catch') ev = catchLast(s, i, Number(msg.p), r);
    if (!ev) return false;
    this.emitEv(ev);
    return true;
  }

  update() {
    const s = this.s;
    const io = this.io;
    if (s.winner >= 0 && this.phase === 'play') {
      const pts = roundPoints(s);
      const w = this.seats[s.winner];
      w.score += pts;
      const over = !this.opts.target || w.score >= this.opts.target;
      this.phase = over ? 'over' : 'end';
      this.result = { winner: s.winner, pts, hands: s.hands.map((h) => sortHand(h.slice())) };
      for (const k of ['turn', 'bot', 'catch']) io.clear(k);
      this.deadline = 0;
      this.nextAt = over ? 0 : Date.now() + NEXT_MS;
      this.broadcast();
      if (over) io.over?.(this.standings());
      else io.timer('next', NEXT_MS, () => this.nextRound());
      return;
    }
    this.schedule();
    this.broadcast();
  }

  schedule() {
    const s = this.s;
    const io = this.io;
    io.clear('turn');
    io.clear('bot');
    io.clear('catch');
    this.deadline = 0;
    const cur = this.seats[s.turn];
    const extra = this.ev?.k === 'deal' ? DEAL_MS : this.ev?.k === 'play' && this.ev.draw ? 500 : 0;
    if (cur.bot || cur.away) {
      const ms = (cur.bot ? 850 + this.rng() * 850 : 1600) + extra;
      io.timer('bot', ms, () => this.botMove(s, s.turn));
    } else if (this.opts.turnMs) {
      const ms = this.opts.turnMs + extra;
      this.deadline = Date.now() + ms;
      io.timer('turn', ms, () => this.autoMove(s, s.turn));
    }
    // la compu agarra al que se quedó con una carta sin avisar
    if (s.last >= 0) {
      let lv = 0;
      let who = -1;
      this.seats.forEach((x, k) => {
        if (k !== s.last && x.bot > lv) {
          lv = x.bot;
          who = k;
        }
      });
      if (who >= 0) {
        const [a, b] = LEVELS[lv].catchMs;
        const target = s.last;
        io.timer('catch', a + this.rng() * (b - a), () => {
          if (this.s === s && s.last === target) this.act(who, { t: 'catch', p: target });
        });
      }
    }
  }

  botMove(s, i) {
    if (this.s !== s || this.phase !== 'play' || s.turn !== i) return;
    const seat = this.seats[i];
    const level = seat.bot || 1;
    const d = decide(s, i, level, this.rng);
    // avisa antes de jugar la anteúltima (a veces se olvida)
    if (d.t === 'play' && s.hands[i].length === 2 && !s.called[i] && (seat.bot ? this.rng() < LEVELS[level].call : true)) this.act(i, { t: 'call' });
    if (!this.act(i, d)) this.act(i, { t: s.drew >= 0 ? 'pass' : 'draw' });
  }

  /** Se acabó el tiempo del turno: roba (y pasa). */
  autoMove(s, i) {
    if (this.s !== s || this.phase !== 'play' || s.turn !== i) return;
    if (s.drew >= 0) return this.act(i, { t: 'pass' });
    this.act(i, { t: 'draw' });
    if (this.s === s && s.turn === i && s.drew >= 0) this.act(i, { t: 'pass' });
  }

  /** Un jugador se desconectó (o volvió): mientras no está, juega solo. */
  setAway(i, away) {
    const seat = this.seats[i];
    if (!seat || seat.away === away) return;
    seat.away = away;
    if (this.phase === 'play' && this.s.turn === i) this.schedule();
    this.broadcast();
  }

  /** Un jugador se fue: lo reemplaza la compu. */
  toBot(i) {
    const seat = this.seats[i];
    if (!seat) return;
    seat.bot = 2;
    seat.away = false;
    if (this.phase === 'play') this.schedule();
    this.broadcast();
  }

  standings() {
    return this.seats.map((x, i) => ({ seat: i, id: x.id, name: x.name, color: x.color, score: x.score })).sort((a, b) => b.score - a.score);
  }

  broadcast() {
    this.seats.forEach((x, i) => {
      if (!x.bot) this.io.emit(i, this.view(i));
    });
  }

  view(i) {
    const s = this.s;
    let ev = this.ev;
    if (ev?.ids && ev.p !== i) {
      ev = { ...ev };
      delete ev.ids;
    }
    const now = Date.now();
    return {
      gid: this.gid,
      seq: this.seq,
      phase: this.phase,
      round: this.round,
      me: i,
      target: this.opts.target,
      stack: this.opts.stack,
      turnMs: this.opts.turnMs,
      dealer: this.dealer,
      seats: this.seats.map((x, k) => ({ name: x.name, color: x.color, bot: x.bot, away: x.away, n: s.hands[k].length, score: x.score, called: s.called[k] })),
      hand: sortHand(s.hands[i].slice()),
      top: top(s),
      color: s.color,
      turn: s.turn,
      dir: s.dir,
      pending: s.pending,
      drew: s.turn === i ? s.drew : -1,
      last: s.last,
      deck: s.draw.length,
      ev,
      left: this.deadline ? Math.max(0, this.deadline - now) : 0,
      next: this.nextAt ? Math.max(0, this.nextAt - now) : 0,
      result: this.result,
    };
  }
}
