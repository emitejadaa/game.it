/**
 * Truco — la mesa: reparte, lleva las bazas, los cantos (truco, envido y flor), los puntos, el tiempo de cada uno, la
 * compu y lo que ve cada jugador (nadie recibe las cartas de los demás). La usan igual el navegador (contra la compu y
 * el truco del día) y el servidor (online); cambia solo `io`:
 *
 *   io.emit(seat, view)      manda el estado a un jugador humano
 *   io.timer(name, ms, fn)   programa algo (uno por nombre)
 *   io.clear(name)
 *   io.over(standings)       terminó la partida
 *
 * `dealFn(hand)` (opcional) da el mazo de cada mano en vez de mezclar con `rng`: en el truco del día todos reciben
 * las mismas cartas.
 */
import { DECK, TRUCO, teamOf, shuffled, bazaWinner, handWinner, envido, envidoNext, envidoAccepted, envidoRejected, envidoResult, envidoCards, florResult, hasFlor, trucoValue, trucoRejected, pieOf, isPie } from './rules.js';
import { decide } from './bot.js';

/** Pausas (ms) para que se pueda seguir lo que pasa. */
export const PACE = { DEAL: 1150, BAZA: 1050, ENV: 2700, ENV_NO: 1100, FLOR: 1600, HAND: 3600, BOT: 700, BOT_RAND: 700, CALL: 550 };

export class Table {
  /**
   * seats: [{ id, name, color, bot: 0 (humano) | 1..3 (nivel) }] — 2 o 4; los equipos son asiento % 2.
   * opts: { target: 15 | 30, flor: bool, turnMs: 0 | tiempo para cada jugada, first: quién es mano en la primera }
   */
  constructor({ seats, opts, io, rng, dealFn = null, botRng = null }) {
    this.seats = seats.map((s, i) => ({ ...s, team: teamOf(i), away: false }));
    this.opts = { target: 30, flor: false, turnMs: 0, ...opts };
    this.io = io;
    this.rng = rng;
    this.botRng = botRng || rng;
    this.dealFn = dealFn;
    this.scores = [0, 0];
    this.phase = 'idle';
    this.h = null;
    this.log = [];
    this.evid = 0;
    this.seq = 0;
    this.wait = false;
    this.deadline = 0;
    this.result = null;
    this.handNum = 0;
    this.mano = 0;
    this.stats = { hands: 0, truco: [0, 0], envido: [0, 0] };
    this.gid = Math.floor(rng() * 1e9);
  }

  get n() {
    return this.seats.length;
  }

  start() {
    this.scores = [0, 0];
    this.handNum = 0;
    this.result = null;
    this.phase = 'play';
    this.stats = { hands: 0, truco: [0, 0], envido: [0, 0] };
    this.log = [];
    this.gid = Math.floor(this.rng() * 1e9);
    this.mano = this.opts.first ?? Math.floor(this.rng() * this.n);
    this.newHand();
  }

  // ---------------------------------------------------------------- mano
  newHand() {
    this.clearTimers();
    const n = this.n;
    const deck = this.dealFn ? this.dealFn(this.handNum) : shuffled(DECK, this.rng);
    const dealt = Array.from({ length: n }, (_, s) => [deck[s], deck[s + n], deck[s + 2 * n]]);
    this.h = {
      num: this.handNum,
      mano: this.mano,
      dealt,
      cards: dealt.map((c) => c.slice()),
      bazas: [{ lead: this.mano, plays: [], res: null, win: -1 }],
      turn: this.mano,
      pending: null,
      truco: { level: 0, owner: -1 },
      env: { state: 'open', chain: [], result: null }, // open | done | void (la flor lo anula)
      flor: { sung: [], done: false, result: null },
      calls: [],
      over: false,
      end: null,
    };
    this.push({ k: 'deal', num: this.handNum, mano: this.mano });
    this.hold(PACE.DEAL);
  }

  /** Quién tiene que hacer algo ahora (o -1 si nadie: pausa, mano terminada). */
  actor() {
    const h = this.h;
    if (this.phase !== 'play' || !h || h.over || this.wait) return -1;
    return h.pending ? h.pending.to : h.turn;
  }

  /** Lo que puede hacer el asiento `seat` ahora. */
  legal(seat) {
    const none = { play: false, truco: null, envido: [], quiero: false, mazo: false };
    if (this.actor() !== seat) return none;
    const h = this.h;
    const tm = teamOf(seat);
    const first = h.bazas.length === 1 && !h.bazas[0].plays.some((p) => p.seat === seat);
    // de a cuatro el envido lo cantan solo los pies (el que repartió y el compañero del mano)
    const envOpen = h.env.state === 'open' && first && isPie(seat, h.mano, this.n);
    const p = h.pending;
    if (p?.kind === 'truco')
      // el envido está primero: contra el primer truco, si todavía no tiró en la primera
      return { play: false, quiero: true, mazo: false, truco: p.level < 3 ? TRUCO[p.level + 1] : null, envido: envOpen && p.level === 1 ? envidoNext([]) : [] };
    if (p?.kind === 'envido') return { play: false, quiero: true, mazo: false, truco: null, envido: envidoNext(p.chain) };
    return {
      play: true,
      quiero: false,
      mazo: true,
      truco: h.truco.level < 3 && (h.truco.owner === -1 || h.truco.owner === tm) ? TRUCO[h.truco.level + 1] : null,
      envido: envOpen && h.truco.level === 0 ? envidoNext([]) : [],
    };
  }

  /** Jugada del asiento `seat`: play { card } | truco | envido { kind } | quiero | noquiero | mazo. */
  act(seat, msg) {
    if (this.phase !== 'play' || !msg || typeof msg !== 'object') return false;
    const L = this.legal(seat);
    const h = this.h;
    switch (msg.t) {
      case 'play':
        if (!L.play || !h.cards[seat].includes(msg.card)) return false;
        this.play(seat, msg.card);
        return true;
      case 'truco':
        if (!L.truco) return false;
        this.callTruco(seat);
        return true;
      case 'envido':
        if (!L.envido.includes(msg.kind)) return false;
        this.callEnvido(seat, msg.kind);
        return true;
      case 'quiero':
      case 'noquiero':
        if (!L.quiero) return false;
        this.answer(seat, msg.t === 'quiero');
        return true;
      case 'mazo':
        if (!L.mazo) return false;
        this.mazo(seat);
        return true;
    }
    return false;
  }

  play(seat, card) {
    const h = this.h;
    h.cards[seat] = h.cards[seat].filter((c) => c !== card);
    const bi = h.bazas.length - 1;
    const bz = h.bazas[bi];
    bz.plays.push({ seat, card });
    this.push({ k: 'play', seat, card, baza: bi });
    if (bz.plays.length < this.n) {
      h.turn = (seat + 1) % this.n;
      this.proceed();
      return;
    }
    const w = bazaWinner(bz.plays);
    bz.res = w.team;
    bz.win = w.seat;
    this.push({ k: 'baza', i: bi, team: w.team, seat: w.seat });
    if (bi === 0 && this.resolveFlor()) return;
    const hw = handWinner(h.bazas.map((b) => b.res), teamOf(h.mano));
    if (hw !== null) {
      this.endHand(hw, trucoValue(h.truco.level), 'bazas');
      return;
    }
    h.bazas.push({ lead: w.seat, plays: [], res: null, win: -1 });
    h.turn = w.seat;
    this.hold(PACE.BAZA);
  }

  callTruco(seat) {
    const h = this.h;
    const p = h.pending;
    let level;
    if (p?.kind === 'truco') {
      // subir es querer lo anterior
      h.truco.level = p.level;
      h.truco.owner = teamOf(seat);
      level = p.level + 1;
      h.pending = { kind: 'truco', level, by: seat, to: p.by };
    } else {
      level = h.truco.level + 1;
      h.pending = { kind: 'truco', level, by: seat, to: this.trucoTo(seat, level) };
    }
    h.calls.push({ seat, what: TRUCO[level] });
    this.push({ k: 'call', seat, what: TRUCO[level], raise: p?.kind === 'truco' });
    this.proceed();
  }

  /**
   * Quién contesta un truco nuevo: el que sigue; pero si es el primer truco y el pie del otro equipo todavía puede
   * cantar el envido (el envido está primero), lo contesta él.
   */
  trucoTo(seat, level) {
    const h = this.h;
    const pie = pieOf(1 - teamOf(seat), h.mano, this.n);
    if (level === 1 && h.env.state === 'open' && h.bazas.length === 1 && !h.bazas[0].plays.some((p) => p.seat === pie)) return pie;
    return (seat + 1) % this.n;
  }

  /** ¿El equipo `team` todavía podía cantar el envido? (primera baza, sin envido jugado ni truco querido, su pie sin tirar) */
  envidoPending(team) {
    const h = this.h;
    if (h.env.state !== 'open' || h.bazas.length !== 1 || h.truco.level > 0) return false;
    if (this.opts.flor && florResult(h.dealt, h.mano)) return false; // la flor anula el envido
    const pie = pieOf(team, h.mano, this.n);
    return !h.bazas[0].plays.some((p) => p.seat === pie);
  }

  callEnvido(seat, kind) {
    const h = this.h;
    const p = h.pending;
    if (p?.kind === 'envido') h.pending = { kind: 'envido', chain: [...p.chain, kind], by: seat, to: p.by, resume: p.resume };
    else {
      // en su turno, o contra el truco (el truco queda esperando la respuesta); lo contesta el pie del otro equipo
      const resume = p?.kind === 'truco' ? p : null;
      h.pending = { kind: 'envido', chain: [kind], by: seat, to: pieOf(1 - teamOf(seat), h.mano, this.n), resume };
    }
    h.calls.push({ seat, what: kind });
    this.push({ k: 'call', seat, what: kind, chain: h.pending.chain.slice() });
    this.proceed();
  }

  answer(seat, yes) {
    const h = this.h;
    const p = h.pending;
    if (p.kind === 'truco') {
      h.calls.push({ seat, what: yes ? 'quiero-truco' : 'noquiero-truco' });
      this.push({ k: 'answer', seat, yes, what: TRUCO[p.level] });
      h.pending = null;
      if (!yes) return this.endHand(teamOf(p.by), trucoRejected(p.level), 'noquiero');
      h.truco.level = p.level;
      h.truco.owner = teamOf(seat);
      return this.proceed();
    }
    // envido: después vuelve el truco que estaba esperando, si había
    h.calls.push({ seat, what: yes ? 'quiero-envido' : 'noquiero-envido' });
    this.push({ k: 'answer', seat, yes, what: 'envido', chain: p.chain.slice() });
    h.pending = p.resume || null;
    h.env.state = 'done';
    h.env.chain = p.chain.slice();
    const { target } = this.opts;
    if (!yes) {
      const pts = envidoRejected(p.chain, this.scores, target);
      const team = teamOf(p.by);
      h.env.result = { yes: false, winner: team, pts };
      this.push({ k: 'envido', yes: false, winner: team, pts });
      if (this.award(team, pts)) return;
      return this.hold(PACE.ENV_NO);
    }
    const r = envidoResult(h.dealt, h.mano);
    const pts = envidoAccepted(p.chain, this.scores, target);
    // lo que dice cada equipo: primero el más cercano a la mano y después el otro, que dice "son mejores" o "son
    // buenas"; los puntos de los dos se muestran siempre, para que se vea cuánto tenía cada uno
    const order = [0, 1].sort((a, b) => ((r.seat[a] - h.mano + this.n) % this.n) - ((r.seat[b] - h.mano + this.n) % this.n));
    const said = [{ seat: r.seat[order[0]], pts: r.pts[order[0]] }];
    said.push({ seat: r.seat[order[1]], pts: r.pts[order[1]], buenas: r.winner !== order[1] });
    h.env.result = { yes: true, winner: r.winner, pts, said, seat: r.seat[r.winner] };
    this.push({ k: 'envido', yes: true, winner: r.winner, pts, said });
    if (this.award(r.winner, pts)) return;
    this.hold(PACE.ENV);
  }

  /**
   * Irse al mazo entrega lo que vale la mano; si el envido todavía se podía cantar (en la primera, antes de que se
   * juegue), el otro equipo se lleva además 1 por el envido: 2 si no se cantó nada.
   */
  mazo(seat) {
    const h = this.h;
    const env = this.envidoPending(teamOf(seat)) ? 1 : 0;
    h.calls.push({ seat, what: 'mazo' });
    this.push({ k: 'mazo', seat });
    this.endHand(1 - teamOf(seat), trucoValue(h.truco.level) + env, 'mazo', env);
  }

  /** La flor se canta sola la primera vez que el que la tiene debe jugar o contestar en la primera baza. */
  singFlor(seat) {
    const h = this.h;
    h.flor.sung.push(seat);
    h.calls.push({ seat, what: 'flor' });
    this.push({ k: 'call', seat, what: 'flor' });
    // la flor anula el envido (si había uno cantado, queda sin efecto)
    if (h.env.state === 'open') h.env.state = 'void';
    if (h.pending?.kind === 'envido') h.pending = h.pending.resume || null;
    this.hold(PACE.FLOR);
  }

  /** Cobra la flor (al terminar la primera baza o la mano). Devuelve true si con eso terminó la partida. */
  resolveFlor() {
    const h = this.h;
    if (!this.opts.flor || h.flor.done) return false;
    h.flor.done = true;
    const r = florResult(h.dealt, h.mano);
    if (!r) return false;
    h.flor.result = r;
    for (const s of r.seats) if (!h.flor.sung.includes(s)) h.flor.sung.push(s);
    this.push({ k: 'flor', winner: r.winner, pts: r.pts, seats: r.seats, against: r.against, show: { seat: r.best, cards: h.dealt[r.best].slice() } });
    return this.award(r.winner, r.pts);
  }

  endHand(team, pts, why, env = 0) {
    const h = this.h;
    h.over = true;
    h.pending = null;
    if (this.resolveFlor()) return;
    const show = [];
    const er = h.env.result;
    if (er?.yes) show.push({ seat: er.seat, cards: envidoCards(h.dealt[er.seat]) });
    h.end = { team, pts, why, show, env };
    // cuánto canta cada equipo (lo ve cualquiera en la mesa; la compu lo usa para no comerse los amagues)
    this.stats.hands++;
    for (const tm of [0, 1]) {
      if (h.calls.some((c) => teamOf(c.seat) === tm && c.what === 'truco')) this.stats.truco[tm]++;
      if (h.calls.some((c) => teamOf(c.seat) === tm && ['envido', 'real', 'falta'].includes(c.what))) this.stats.envido[tm]++;
    }
    this.push({ k: 'hand', team, pts, why, show, truco: h.truco.level, env });
    if (this.award(team, pts)) return;
    this.mano = (h.mano + 1) % this.n;
    this.handNum++;
    this.clearTimers();
    this.deadline = 0;
    this.io.timer('next', PACE.HAND, () => this.newHand());
    this.broadcast();
  }

  /** Suma puntos; si alguno llega al final, termina la partida (y devuelve true). */
  award(team, pts) {
    this.scores[team] = Math.min(this.opts.target, this.scores[team] + pts);
    if (this.scores[team] < this.opts.target) return false;
    this.finish(team);
    return true;
  }

  finish(team) {
    this.phase = 'over';
    this.clearTimers();
    this.deadline = 0;
    this.wait = false;
    if (this.h) {
      this.h.over = true;
      this.h.pending = null;
    }
    this.result = { winner: team, scores: this.scores.slice() };
    this.push({ k: 'over', team });
    this.broadcast();
    this.io.over?.(this.standings());
  }

  // ---------------------------------------------------------------- tiempos y compu
  clearTimers() {
    for (const k of ['turn', 'bot', 'resume', 'next']) this.io.clear(k);
  }

  /** Una pausa en la que nadie juega (para ver la baza, los puntos, el reparto). */
  hold(ms) {
    this.wait = true;
    this.io.clear('turn');
    this.io.clear('bot');
    this.deadline = 0;
    this.io.timer('resume', ms, () => {
      this.wait = false;
      this.proceed();
    });
    this.broadcast();
  }

  proceed() {
    const h = this.h;
    if (this.phase !== 'play' || this.wait || !h || h.over) return this.broadcast();
    const a = this.actor();
    if (this.opts.flor && a >= 0 && h.bazas.length === 1 && hasFlor(h.dealt[a]) && !h.flor.sung.includes(a)) return this.singFlor(a);
    this.schedule();
    this.broadcast();
  }

  schedule() {
    const io = this.io;
    io.clear('turn');
    io.clear('bot');
    this.deadline = 0;
    const a = this.actor();
    if (a < 0) return;
    const s = this.seats[a];
    const last = this.log[this.log.length - 1];
    if (s.bot || s.away) {
      const extra = last && (last.k === 'call' || last.k === 'answer') ? PACE.CALL : 0;
      const ms = s.bot ? PACE.BOT + extra + this.botRng() * PACE.BOT_RAND : 650 + extra;
      io.timer('bot', ms, () => this.botStep(a));
    } else if (this.opts.turnMs) {
      this.deadline = Date.now() + this.opts.turnMs;
      // se le acabó el tiempo: la compu juega esa vez por él
      io.timer('turn', this.opts.turnMs, () => this.botStep(a));
    }
  }

  botStep(a) {
    if (this.actor() !== a) return;
    const seat = this.seats[a];
    const msg = decide(this.view(a), seat.bot || 2, this.botRng);
    if (msg && this.act(a, msg)) return;
    // por las dudas (no debería pasar)
    const L = this.legal(a);
    if (L.quiero) this.act(a, { t: 'quiero' });
    else if (L.play) this.act(a, { t: 'play', card: this.h.cards[a][0] });
  }

  /** Un jugador se desconectó (o volvió): mientras no está, juega la compu por él. */
  setAway(i, away) {
    const seat = this.seats[i];
    if (!seat || seat.away === away) return;
    seat.away = away;
    if (this.actor() === i) this.schedule();
    this.broadcast();
  }

  /** Un jugador se fue: lo reemplaza la compu. */
  toBot(i) {
    const seat = this.seats[i];
    if (!seat) return;
    seat.bot = 2;
    seat.away = false;
    if (this.actor() === i) this.schedule();
    this.broadcast();
  }

  standings() {
    const w = this.result ? this.result.winner : this.scores[0] >= this.scores[1] ? 0 : 1;
    return this.seats
      .map((x, i) => ({ seat: i, id: x.id, name: x.name, color: x.color, team: x.team, score: this.scores[x.team], won: x.team === w }))
      .sort((a, b) => Number(b.won) - Number(a.won) || a.seat - b.seat);
  }

  // ---------------------------------------------------------------- lo que ve cada uno
  push(ev) {
    ev.id = ++this.evid;
    this.log.push(ev);
    if (this.log.length > 40) this.log.shift();
    this.seq++;
  }

  broadcast() {
    this.seq++;
    this.seats.forEach((x, i) => {
      if (!x.bot) this.io.emit(i, this.view(i));
    });
  }

  view(i) {
    const h = this.h;
    const p = h?.pending;
    return {
      gid: this.gid,
      seq: this.seq,
      phase: this.phase,
      n: this.n,
      me: i,
      target: this.opts.target,
      flor: !!this.opts.flor,
      scores: this.scores.slice(),
      seats: this.seats.map((x, k) => ({ name: x.name, color: x.color, bot: x.bot, away: x.away, team: x.team, left: h ? h.cards[k].length : 0 })),
      hand: h && {
        num: h.num,
        mano: h.mano,
        turn: h.turn,
        actor: this.actor(),
        wait: this.wait,
        over: h.over,
        mine: h.cards[i].slice(),
        dealt: h.dealt[i].slice(),
        // la seña del envido: de a cuatro, mientras se puede cantar, cada uno sabe los puntos de su compañero
        partnerEnv: this.n === 4 && h.bazas.length === 1 && h.env.state === 'open' ? envido(h.dealt[(i + 2) % 4]) : null,
        bazas: h.bazas.map((b) => ({ lead: b.lead, plays: b.plays.map((x) => ({ ...x })), res: b.res, win: b.win })),
        pending: p ? { kind: p.kind, level: p.level ?? 0, chain: p.chain ? p.chain.slice() : null, by: p.by, to: p.to, resume: !!p.resume } : null,
        truco: { ...h.truco },
        env: { state: h.env.state, chain: h.env.chain.slice(), result: h.env.result ? { ...h.env.result } : null },
        florSung: h.flor.sung.slice(),
        calls: h.calls.map((c) => ({ ...c })),
        end: h.end,
      },
      can: this.legal(i),
      ev: this.log.slice(-24).map((e) => ({ ...e })),
      left: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      turnMs: this.opts.turnMs,
      result: this.result,
      stats: { hands: this.stats.hands, truco: this.stats.truco.slice(), envido: this.stats.envido.slice() },
    };
  }
}
