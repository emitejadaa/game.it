/**
 * Caída Libre — el partido completo: jugadores y bots, rondas, ataques, basura y eliminaciones. Lo usan el servidor
 * (server/games/caida.js, que solo pone la red) y el modo sin conexión (el mismo código corriendo en el navegador),
 * así que no toca la red ni el reloj: recibe `t` (milisegundos del partido) en cada llamada y avisa por `out`.
 *
 * Modelo de autoridad: cada persona simula su tablero en su cliente (respuesta instantánea) y manda cada fijado
 * { t: 'lk', n, p, r, x, y, h, a }. Acá se reaplica sobre la copia del servidor con las mismas reglas (rules.js):
 *   n  número de fijado (empieza en 0; un fijado repetido o salteado no pasa)     p, r, x, y  pieza, rotación y posición
 *   h  1 si guardó (hold) antes de fijar                                          a  filas de basura que el cliente ya aplicó
 * Se valida que la pieza sea la que le toca de la bolsa, que la posición sea legal, apoyada y alcanzable desde donde
 * nace; después se calculan líneas, ataque, basura y KO y se contesta { t: 'ak', n, clr, sent, add: [{ rows, hole }] }.
 * La basura que entra la manda el servidor en `add` y el cliente la aplica "después de ese fijado"; mientras viaja,
 * el servidor sigue contando el tablero sin ella (`grid`) y la suma recién cuando el cliente confirma con `a`: así
 * ambos aplican las mismas cosas en el mismo orden aunque el cliente fije otra pieza antes de recibir el `ak`.
 * Algo no valida → { t: 'bd', grid, … } (tablero y cola reales) y el cliente se resincroniza; 4 fallas en 60 s = fuera.
 *
 * `out`: { to(num, msg) a una persona · all(msg) a todas · soft(msg) a todas salvo las que no dan abasto · kick(num) }.
 * Mensajes: reset · pl [[num, nombre, color, bot]] · me · rs { round, seed, in, n } · ak · bd · pg { n } · sm { p: [[num,
 * perfil, pendiente]] } (2 Hz) · at { f, to, n } · ko { n, by, r, left } · dead · wg { n, g, pend } (tablero que se mira) ·
 * lb { l, a, n } · end { win, res } · banned.
 */
import { W, H, CFG, Feed, PALETTE, newGrid, fits, supported, reachable, place, clearLines, addGarbage, isLockOut, spawnOf, profile, gridToString, attackFor, scoreOf, mulberry32 } from './rules.js';
import { brain, choose, nextDelay, BOT_NAMES } from './bots.js';

export const TARGETS = ['random', 'attackers', 'weakest', 'leader'];
export const MAX_NAME = 16;
const BAN_STRIKES = 4;

const DEFAULTS = {
  crowd: 12, // personas + bots
  bots: true,
  countMs: 3000, // cuenta regresiva antes de cada ronda
  overMs: 7000, // cuánto se ve el resultado antes de la ronda siguiente
  autoRound: true,
  afkMs: 30000, // sin fijar nada tanto tiempo = fuera
  smMs: 500, // resúmenes de los rivales: 2 por segundo
  wgMs: 250,
  lbMs: 1000,
  maxBotMoves: 6, // jugadas de bots por paso: las demás esperan al paso siguiente
  tide: true, // "la marea": desde cierto momento todos reciben basura que no se puede cancelar, cada vez más seguido
  tideStartMs: 140000,
  tideEveryMs: 12000,
  tideMinMs: 2500,
  burst: 8, // fijados seguidos permitidos…
  refill: 9, // …y fijados por segundo sostenidos (nadie humano pasa de ~6)
};

const clean = (v, n) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);

const maxHeight = (grid) => {
  let i = 0;
  while (i < grid.length && grid[i] === 0) i++;
  return H - ((i / W) | 0);
};

export class Match {
  constructor(o = {}) {
    this.o = { ...DEFAULTS, ...o };
    this.out = o.out;
    this.rnd = mulberry32(((o.seed ?? 1) ^ 0x5bd1e995) >>> 0);
    this.players = new Map();
    this.nextNum = 1;
    this.phase = 'idle'; // idle | count | play | over
    this.round = 0;
    this.seed = 0;
    this.t = 0;
    this.startAt = 0;
    this.overUntil = 0;
    this.aliveCount = 0;
    this.startCount = 0;
    this.botSeq = Math.floor(this.rnd() * BOT_NAMES.length);
    this.lastSm = 0;
    this.lastWg = 0;
    this.lastLb = 0;
    this.lastEnd = null;
    this.rejects = 0;
    this.tideAt = 0;
    this.tideN = 0;
  }

  // ------------------------------------------------------------ jugadores
  addPlayer({ id = '', name = '', color = 0, bot = false, level = 2 } = {}) {
    const p = {
      num: this.nextNum++,
      id,
      name: clean(name, MAX_NAME) || (bot ? 'Bot' : 'Jugador'),
      color: Math.abs(color | 0) % PALETTE.length,
      bot: !!bot,
      auto: false, // persona desconectada que juega un bot
      play: false, // participa de la ronda actual
      alive: false,
      target: 'random',
      brain: bot ? brain(level) : null,
      botTarget: level === 1 ? 'random' : level === 2 ? 'attackers' : 'weakest',
    };
    this.blank(p);
    this.players.set(p.num, p);
    if (this.phase === 'count') this.prepare(p);
    return p;
  }

  blank(p) {
    Object.assign(p, {
      grid: newGrid(),
      feed: null,
      unconf: [], // basura que el servidor ya mandó en un `ak` y el cliente todavía no confirmó con `a`
      gBase: 0, // filas de basura ya sumadas a `grid`
      gCum: 0, // filas de basura mandadas en total
      locks: 0,
      combo: -1,
      pending: [], // basura que todavía no entró: { rows, hole, at }
      lastAtt: 0,
      lastAttAt: -1e9,
      watch: 0,
      kos: 0,
      lines: 0,
      sent: 0,
      pieces: 0,
      rank: 0,
      cause: '',
      won: false,
      strikes: [],
      tokens: this.o.burst,
      tokAt: 0,
      bdAt: -1e9,
      lastLockAt: 0,
      nextAt: 0,
    });
  }

  /** Deja a un jugador listo para la ronda que se está armando. */
  prepare(p) {
    this.blank(p);
    p.feed = new Feed(this.seed);
    p.alive = true;
    p.play = true;
    p.tokAt = this.t;
    p.lastLockAt = this.startAt;
    if (p.bot || p.auto) p.nextAt = this.startAt + 300 + this.rnd() * nextDelay(p.brain || brain(2), this.rnd);
    this.startCount++;
    this.aliveCount++;
  }

  humans() {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  /** Alguien se fue del todo: si estaba jugando queda eliminado. */
  leave(num, t = this.t) {
    const p = this.players.get(num);
    if (!p) return;
    this.t = t;
    if (p.play && p.alive && this.phase === 'count') {
      this.startCount--;
      this.aliveCount--;
      this.players.delete(num);
      return;
    }
    if (p.play && p.alive && this.phase === 'play') this.eliminate(p, 'left', 0, t);
    this.players.delete(num);
  }

  /** Una persona se desconectó (true) o volvió (false): mientras no está, un bot juega por ella. */
  setAuto(num, on) {
    const p = this.players.get(num);
    if (!p || p.bot) return;
    if (on && !p.auto) {
      const tg = this.trueGrid(p);
      p.grid = tg.g === p.grid ? p.grid : tg.g.slice();
      p.unconf = [];
      p.gBase = p.gCum;
      p.brain = brain(2);
      p.nextAt = this.t + nextDelay(p.brain, this.rnd);
    }
    p.auto = !!on;
  }

  hello(num, m) {
    const p = this.players.get(num);
    if (!p) return undefined;
    const c = Number(m?.color);
    if (!Number.isInteger(c) || c < 0 || c >= PALETTE.length) return false;
    if (c !== p.color) {
      p.color = c;
      this.out.all({ t: 'pl', p: this.table() });
    }
    return true;
  }

  setTarget(num, mode) {
    const p = this.players.get(num);
    if (!p) return undefined;
    if (!TARGETS.includes(mode)) return false;
    p.target = mode;
    return true;
  }

  watch(num, n) {
    const p = this.players.get(num);
    if (!p) return undefined;
    if (!Number.isInteger(n) || n < 0 || n > 1e6) return false;
    p.watch = this.players.get(n)?.alive ? n : 0;
    return true;
  }

  table() {
    return [...this.players.values()].map((p) => [p.num, p.name, p.color, p.bot ? 1 : 0]);
  }

  // ------------------------------------------------------------ rondas
  /** Empieza una ronda nueva con todos los que están: los bots se rearman hasta completar `crowd`. */
  newRound(t) {
    this.t = t;
    this.round++;
    this.seed = (this.rnd() * 4294967296) >>> 0;
    for (const p of [...this.players.values()]) if (p.bot) this.players.delete(p.num);
    const want = this.o.bots ? Math.max(0, this.o.crowd - this.humans()) : 0;
    for (let i = 0; i < want; i++) {
      const n = this.botSeq++;
      this.addPlayer({ name: BOT_NAMES[n % BOT_NAMES.length], color: n % PALETTE.length, bot: true, level: this.o.levels ? this.o.levels[i % this.o.levels.length] : 1 + (n % 3) });
    }
    this.phase = 'count';
    this.startAt = t + this.o.countMs;
    this.startCount = 0;
    this.aliveCount = 0;
    this.lastEnd = null;
    this.lastSm = this.lastWg = this.lastLb = t;
    for (const p of this.players.values()) prepareReset(this, p);
    this.tideN = 0;
    this.tideAt = this.o.tide && this.startCount >= 2 ? this.startAt + this.o.tideStartMs : 0;
    this.out.all({ t: 'pl', p: this.table() });
    this.out.all({ t: 'rs', round: this.round, seed: this.seed, in: this.o.countMs, n: this.startCount });
    this.sendLb();
  }

  step(t) {
    this.t = t;
    if (this.phase === 'count') {
      if (t >= this.startAt) this.phase = 'play';
    } else if (this.phase === 'over') {
      if (this.o.autoRound && t >= this.overUntil) this.newRound(t);
      return;
    }
    if (this.phase !== 'play') return;

    // bots (y personas desconectadas), repartidos en el tiempo
    let moves = 0;
    for (const p of this.players.values()) {
      if (!(p.bot || p.auto) || !p.alive || !p.play || p.nextAt > t) continue;
      if (moves++ >= this.o.maxBotMoves) break;
      this.botMove(p, t);
      if (this.phase !== 'play') return;
    }
    // quien no fija nada por mucho rato queda afuera
    for (const p of this.players.values()) {
      if (p.bot || p.auto || !p.alive || !p.play || t - p.lastLockAt <= this.o.afkMs) continue;
      this.eliminate(p, 'afk', 0, t);
      if (this.phase !== 'play') return;
    }
    if (this.tideAt && t >= this.tideAt) this.tide(t);
    if (t - this.lastSm >= this.o.smMs) {
      this.lastSm = t;
      this.sendSummaries();
    }
    if (t - this.lastWg >= this.o.wgMs) {
      this.lastWg = t;
      this.sendWatch();
    }
    if (t - this.lastLb >= this.o.lbMs) {
      this.lastLb = t;
      this.sendLb();
    }
  }

  // ------------------------------------------------------------ jugadas
  botMove(p, t) {
    const urgent = this.pendRows(p) > 0 || maxHeight(p.grid) > 12;
    const c = choose(p.grid, p.feed, p.brain, this.rnd, urgent);
    p.nextAt = t + nextDelay(p.brain, this.rnd);
    if (!c) return this.eliminate(p, 'top', this.killerOf(p, t), t);
    const res = this.commit(p, c.kind, c.r, c.x, c.y, c.hold, t);
    if (res.cause) this.eliminate(p, res.cause, this.killerOf(p, t), t);
  }

  /** Un fijado de una persona. Devuelve true (atendido), false (mal formado) o undefined (no es para este jugador). */
  lock(num, m, t) {
    this.t = t;
    const p = this.players.get(num);
    if (!p || p.bot) return undefined;
    if (this.phase === 'count' && t >= this.startAt) this.phase = 'play'; // el reloj de 100 ms puede ir un paso atrasado
    if (this.phase !== 'play' || !p.play || !p.alive || p.auto) return true; // llegó tarde: no pasa nada
    const ok = m && [m.n, m.p, m.r, m.x, m.y, m.h, m.a].every(Number.isInteger);
    if (!ok || m.p < 1 || m.p > 7 || m.r < 0 || m.r > 3 || m.x < -4 || m.x > W || m.y < -4 || m.y > H || (m.h !== 0 && m.h !== 1) || m.a < 0 || m.n < 0) return false;
    p.tokens = Math.min(this.o.burst, p.tokens + ((t - p.tokAt) / 1000) * this.o.refill);
    p.tokAt = t;
    if (p.tokens < 1) return this.reject(p, 'rate', t);
    p.tokens -= 1;
    if (m.n !== p.locks) {
      // lo que sigue a un fijado rechazado ya venía en camino: no cuenta como otra falta
      if (m.n > p.locks && t - p.bdAt < 1500) return true;
      return this.reject(p, m.n < p.locks ? 'replay' : 'seq', t);
    }
    if (m.a !== p.gBase) {
      const i = p.unconf.findIndex((u) => u.cum === m.a);
      if (i < 0) return this.reject(p, 'ack', t);
      for (const u of p.unconf.splice(0, i + 1)) addGarbage(p.grid, u.rows, u.hole);
      p.gBase = m.a;
    }
    const exp = p.feed.expected(m.h);
    if (!exp || exp !== m.p) return this.reject(p, m.h && !exp ? 'hold' : 'piece', t);
    if (!supported(p.grid, m.p, m.r, m.x, m.y) || !reachable(p.grid, m.p, m.r, m.x, m.y)) return this.reject(p, 'pos', t);

    const res = this.commit(p, m.p, m.r, m.x, m.y, !!m.h, t);
    const ak = { t: 'ak', n: m.n, clr: res.clr, sent: res.sent, pend: this.pendRows(p) };
    if (res.cx) ak.cx = res.cx;
    if (res.adds.length) ak.add = res.adds;
    this.out.to(num, ak);
    if (res.cause) this.eliminate(p, res.cause, this.killerOf(p, t), t);
    return true;
  }

  /**
   * Aplica un fijado ya validado (o de un bot): líneas, combo, ataque, cancelación con la basura pendiente y entrada
   * de basura nueva. Devuelve lo que pasó; `cause` ≠ '' si el jugador perdió (quien llama lo elimina).
   */
  commit(p, kind, r, x, y, usedHold, t) {
    if (usedHold) p.feed.hold();
    const lockOut = isLockOut(kind, r, y);
    place(p.grid, kind, r, x, y);
    const clr = clearLines(p.grid);
    p.pieces++;
    p.lines += clr;
    p.locks++;
    p.lastLockAt = t;
    let atk = 0;
    if (clr > 0) atk = attackFor(clr, ++p.combo);
    else p.combo = -1;
    // tus líneas primero cancelan la basura que te venía (menos la de la marea)
    let cx = 0;
    for (let i = 0; i < p.pending.length && atk > 0; ) {
      const it = p.pending[i];
      if (it.hard) {
        i++;
        continue;
      }
      const d = Math.min(it.rows, atk);
      it.rows -= d;
      atk -= d;
      cx += d;
      if (!it.rows) p.pending.splice(i, 1);
      else i++;
    }
    const sent = atk > 0 ? this.attack(p, atk, t) : 0;
    p.sent += sent;
    // sin líneas en este fijado, entra la basura que ya esperó su segundo
    const adds = this.takeReady(p, t, clr > 0);
    let over = false;
    for (const a of adds) {
      if (p.bot || p.auto) over = addGarbage(p.grid, a.rows, a.hole) || over;
      else p.unconf.push({ rows: a.rows, hole: a.hole, cum: (p.gCum += a.rows) });
    }
    p.feed.next();
    const tg = this.trueGrid(p);
    const sp = spawnOf(p.feed.active);
    let cause = '';
    if (lockOut || over || tg.over) cause = 'top';
    else if (!fits(tg.g, sp.kind, sp.r, sp.x, sp.y)) cause = 'block';
    return { clr, sent, cx, adds, cause };
  }

  /** Basura que entra ahora: la que ya esperó su segundo (solo si no hubo líneas) y la de la marea (siempre). */
  takeReady(p, t, cleared) {
    const adds = [];
    let room = CFG.garbageCap;
    for (let i = 0; i < p.pending.length && room > 0; ) {
      const it = p.pending[i];
      if (it.at > t || (cleared && !it.hard)) {
        i++;
        continue;
      }
      const d = Math.min(it.rows, room);
      adds.push({ rows: d, hole: it.hole });
      it.rows -= d;
      room -= d;
      if (!it.rows) p.pending.splice(i, 1);
      else i++;
    }
    return adds;
  }

  /** La marea sube: una fila más para todos los que siguen vivos, y la próxima viene antes. */
  tide(t) {
    this.tideN++;
    const every = Math.max(this.o.tideMinMs, this.o.tideEveryMs * Math.pow(0.88, this.tideN));
    this.tideAt = t + every;
    for (const p of this.players.values()) {
      if (!p.alive || !p.play) continue;
      p.pending.push({ rows: 1, hole: Math.floor(this.rnd() * W), at: t, hard: true });
      if (!p.bot && !p.auto) this.out.to(p.num, { t: 'pg', n: this.pendRows(p) });
    }
    this.out.all({ t: 'tide', n: this.tideN });
  }

  pendRows(p) {
    let n = 0;
    for (const it of p.pending) n += it.rows;
    return n;
  }

  /** Tablero con la basura que ya viajó hacia el cliente. `over`: algo quedó fuera del techo. */
  trueGrid(p) {
    if (!p.unconf.length) return { g: p.grid, over: false };
    const g = p.grid.slice();
    let over = false;
    for (const u of p.unconf) over = addGarbage(g, u.rows, u.hole) || over;
    return { g, over };
  }

  // ------------------------------------------------------------ ataques
  attack(p, rows, t) {
    const tp = this.pickTarget(p, t);
    if (!tp) return 0;
    const add = Math.min(rows, CFG.garbageQueueCap - this.pendRows(tp));
    if (add <= 0) return 0;
    tp.pending.push({ rows: add, hole: Math.floor(this.rnd() * W), at: t + CFG.garbageDelayMs });
    tp.lastAtt = p.num;
    tp.lastAttAt = t;
    this.out.all({ t: 'at', f: p.num, to: tp.num, n: add });
    if (!tp.bot && !tp.auto) this.out.to(tp.num, { t: 'pg', n: this.pendRows(tp) });
    return add;
  }

  /** A quién va el ataque, según el modo elegido: al azar, a quien te ataca, al más débil (pila más alta) o al líder. */
  pickTarget(p, t) {
    const c = [];
    for (const q of this.players.values()) if (q !== p && q.alive && q.play) c.push(q);
    if (!c.length) return null;
    const mode = p.bot ? p.botTarget : p.target;
    let pick = null;
    if (mode === 'attackers') {
      const q = this.players.get(p.lastAtt);
      if (q && q.alive && q.play && t - p.lastAttAt <= CFG.koWindowMs) pick = q;
    } else if (mode === 'weakest') {
      let best = -1;
      for (const q of c) {
        const h = maxHeight(q.grid);
        if (h > best) (best = h), (pick = q);
      }
    } else if (mode === 'leader') {
      let best = -1;
      for (const q of c) {
        const s = scoreOf(q.lines, q.sent, q.kos);
        if (s > best) (best = s), (pick = q);
      }
    }
    return pick || c[Math.floor(this.rnd() * c.length)];
  }

  killerOf(p, t) {
    const q = this.players.get(p.lastAtt);
    return q && t - p.lastAttAt <= CFG.koWindowMs ? q.num : 0;
  }

  // ------------------------------------------------------------ eliminaciones y final
  eliminate(p, cause, by, t) {
    if (!p.alive || !p.play) return;
    p.alive = false;
    p.cause = cause;
    p.rank = this.aliveCount;
    this.aliveCount--;
    p.pending = [];
    p.unconf = [];
    const killer = by ? this.players.get(by) : null;
    if (killer) killer.kos++;
    const st = this.statsOf(p, t);
    this.out.all({ t: 'ko', n: p.num, by: killer ? killer.num : 0, r: p.rank, left: this.aliveCount });
    if (!p.bot && !p.auto) {
      p.watch = killer?.alive ? killer.num : this.leaderNum(p);
      this.out.to(p.num, { t: 'dead', rank: p.rank, of: this.startCount, by: killer ? killer.num : 0, cause, st, w: p.watch });
    }
    this.sendLb();
    this.checkEnd(t);
  }

  statsOf(p, t) {
    return { lines: p.lines, sent: p.sent, kos: p.kos, pieces: p.pieces, time: Math.max(0, Math.round(t - this.startAt)), score: scoreOf(p.lines, p.sent, p.kos) };
  }

  /** El que mira una persona eliminada si no eligió a nadie: el líder vivo. */
  leaderNum(except) {
    let best = null;
    let bs = -1;
    for (const q of this.players.values()) {
      if (q === except || !q.alive || !q.play) continue;
      const s = scoreOf(q.lines, q.sent, q.kos);
      if (s > bs) (bs = s), (best = q);
    }
    return best ? best.num : 0;
  }

  checkEnd(t) {
    if (this.phase !== 'play') return;
    if (this.aliveCount > (this.startCount >= 2 ? 1 : 0)) return;
    let win = null;
    for (const p of this.players.values()) if (p.alive && p.play) win = p;
    if (win) {
      win.rank = 1;
      win.won = true;
    }
    this.phase = 'over';
    this.overUntil = t + this.o.overMs;
    const res = [...this.players.values()]
      .filter((p) => p.play)
      .sort((a, b) => a.rank - b.rank)
      .map((p) => [p.num, p.rank, p.kos, p.lines, p.sent, scoreOf(p.lines, p.sent, p.kos)]);
    this.lastEnd = { t: 'end', round: this.round, win: win ? win.num : 0, res, next: this.o.autoRound ? this.o.overMs : 0 };
    this.out.all(this.lastEnd);
    this.sendLb();
  }

  // ------------------------------------------------------------ rechazos (anti-trampa)
  reject(p, why, t) {
    this.rejects++;
    p.strikes = p.strikes.filter((s) => t - s < 60000);
    p.strikes.push(t);
    if (p.strikes.length >= BAN_STRIKES) {
      this.out.to(p.num, { t: 'banned' });
      this.eliminate(p, 'cheat', 0, t);
      this.out.kick?.(p.num);
      return true;
    }
    if (why !== 'rate') {
      this.out.to(p.num, this.bdMsg(p, why));
      p.bdAt = t;
    }
    return true;
  }

  /** Estado real de un jugador (tablero, cola, guardado, basura): resincroniza al cliente. */
  bdMsg(p, why = '') {
    const tg = this.trueGrid(p);
    if (tg.g !== p.grid) p.grid = tg.g;
    p.unconf = [];
    p.gBase = p.gCum;
    return { t: 'bd', grid: gridToString(p.grid), ...p.feed.state(), n: p.locks, a: p.gCum, pend: this.pendRows(p), cb: p.combo, el: Math.max(0, Math.round(this.t - this.startAt)), why };
  }

  // ------------------------------------------------------------ difusión
  sendSummaries() {
    const list = [];
    for (const p of this.players.values()) if (p.play && p.alive) list.push([p.num, profile(this.trueGrid(p).g), this.pendRows(p)]);
    this.out.soft({ t: 'sm', p: list });
  }

  /** Cada persona que mira un tablero ajeno (eliminada o esperando) recibe ese tablero completo. */
  sendWatch() {
    let cache = null;
    for (const p of this.players.values()) {
      if (p.bot || p.auto || (p.alive && p.play)) continue;
      let q = this.players.get(p.watch);
      if (!q || !q.alive || !q.play) {
        const n = this.leaderNum(p);
        q = this.players.get(n);
        p.watch = n;
      }
      if (!q) continue;
      cache ??= new Map();
      let m = cache.get(q.num);
      if (!m) cache.set(q.num, (m = { t: 'wg', n: q.num, g: gridToString(this.trueGrid(q).g), pend: this.pendRows(q) }));
      this.out.to(p.num, m);
    }
  }

  /** Vivos por puntaje y, abajo, los eliminados por puesto. Filas: [num, puntaje, KOs, puesto (0 = sigue vivo)]. */
  leaderboard(n = 10) {
    const rows = [...this.players.values()].filter((p) => p.play).map((p) => [p.num, scoreOf(p.lines, p.sent, p.kos), p.kos, p.alive ? 0 : p.rank]);
    const alive = rows.filter((r) => r[3] === 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const out = rows.filter((r) => r[3] !== 0).sort((a, b) => a[3] - b[3]);
    return alive.concat(out).slice(0, n);
  }

  sendLb() {
    this.out.soft({ t: 'lb', l: this.leaderboard(10), a: this.aliveCount, n: this.startCount });
  }

  // ------------------------------------------------------------ al entrar o reconectar
  meMsg(p) {
    return { t: 'me', num: p.num, round: this.round, phase: this.phase, seed: this.seed, play: p.play, alive: p.alive, in: this.phase === 'count' ? Math.max(0, Math.round(this.startAt - this.t)) : 0, n: this.startCount, left: this.aliveCount, tg: p.target };
  }

  /** Todo lo que necesita quien entra (o vuelve) para ponerse al día. */
  joinMessages(num) {
    const p = this.players.get(num);
    if (!p) return [];
    const msgs = [{ t: 'reset' }, { t: 'pl', p: this.table() }, this.meMsg(p), { t: 'lb', l: this.leaderboard(10), a: this.aliveCount, n: this.startCount }];
    if (p.play && p.alive && (this.phase === 'count' || this.phase === 'play')) msgs.push(this.bdMsg(p, 'join'));
    if (this.phase === 'over' && this.lastEnd) msgs.push(this.lastEnd);
    return msgs;
  }
}

/** Al empezar la ronda cada jugador arranca de cero (los desconectados siguen con su bot). */
function prepareReset(m, p) {
  m.prepare(p);
  p.watch = 0;
}
