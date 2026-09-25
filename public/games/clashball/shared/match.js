/**
 * Clashball — un partido. Mismo código en el servidor (autoritativo), en el cliente online
 * (predicción) y en los modos sin conexión.
 *
 * Reglas y tiempos como HaxBall:
 *  - estado 0 saque: los jugadores no cruzan la mitad y el equipo que no saca no entra al círculo;
 *    el reloj está quieto hasta que la pelota se mueve.
 *  - estado 1 en juego: el reloj corre; si la pelota cruza una línea de gol, gol.
 *  - estado 2 gol: 150 ticks de festejo y vuelta a posiciones; saca el equipo que recibió el gol.
 *  - con tiempo cumplido y empate se sigue jugando (gol de oro).
 *  - estado 3 final: 300 ticks y termina.
 * Patada: al apretar se "arma"; mientras está armada patea todas las pelotas a menos de 4 px del
 * borde (fuerza = kickStrength · invMass de la pelota) y se desarma. Hay que soltar para volver a patear.
 */
import { step, crosses, disc, F } from './physics.js';
import { buildStadium } from './stadiums.js';

export const TEAM = { SPEC: 0, RED: 1, BLUE: 2 };
export const KEY = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, KICK: 16 };
export const TPS = 60;
export const DIR = [0, -1, 1];
const TEAM_FLAG = [0, F.red, F.blue];
const KO_FLAG = [0, F.redKO, F.blueKO];
const PLAYER_MASK = F.ball | F.red | F.blue | F.wall; // 39
const DIAG = 1 / Math.SQRT2;
const KICK_MIN = 2; // ticks mínimos entre dos patadas
const GOAL_TICKS = 150;
const END_TICKS = 300;

const r3 = (v) => Math.round(v * 1000) / 1000;

export class Match {
  /**
   * @param {object} o
   * @param {string} o.stadium  id del estadio
   * @param {string} o.mode     classic | futsal | ice | chaos
   * @param {number} o.scoreLimit  0 = sin límite
   * @param {number} o.timeLimit   minutos, 0 = sin límite
   * @param {Array} o.players   [{ id, team, name, avatar, bot }]
   */
  constructor({ stadium = 'classic', mode = 'classic', scoreLimit = 3, timeLimit = 3, players = [] } = {}) {
    this.cfg = { stadium, mode, scoreLimit, timeLimit };
    this.st = buildStadium(stadium, mode);
    this.world = { discs: [], planes: this.st.planes, segments: this.st.segments, vertices: this.st.vertices };
    const b = this.st.ball;
    this.balls = this.st.ballSpawns.map(([x, y]) => ({
      d: disc({ x, y, r: b.r, invMass: b.invMass, damping: b.damping, bCoef: b.bCoef, cMask: F.all, cGroup: F.ball | F.kick | F.score }),
      x0: x,
      y0: y,
      px: x,
      py: y,
      touch: [null, null, null],
    }));
    this.posts = this.st.posts;
    this.players = [];
    this.tick = 0;
    this.state = 0;
    this.timer = 0;
    this.time = 0; // ticks jugados (solo corre en estado 1)
    this.score = [0, 0, 0];
    this.koTeam = TEAM.RED;
    this.winner = 0;
    this.over = false;
    this.events = [];
    this.hits = [];
    this.stats = {};
    this.poss = [0, 0, 0];
    this.kinds = [];
    for (const p of players) this.addPlayer(p, false);
    this.resetPositions();
  }

  // ---------------------------------------------------------------- jugadores
  player(id) {
    return this.players.find((p) => p.id === id);
  }

  stat(p) {
    return (this.stats[p.id] ||= { name: p.name, team: p.team, goals: 0, assists: 0, og: 0, kicks: 0, touches: 0, bot: !!p.bot });
  }

  /** Agrega un jugador. Si entra con el partido en curso aparece al costado de su arco (como HaxBall). */
  addPlayer({ id, team = 0, name = '', avatar = '', bot = null }, spawn = true) {
    let p = this.player(id);
    if (!p) {
      p = { id, team: 0, name, avatar, bot, input: 0, kicking: false, cd: 0, d: null };
      this.players.push(p);
    }
    p.name = name || p.name;
    if (avatar !== undefined) p.avatar = avatar;
    this.setTeam(id, team, spawn);
    return p;
  }

  removePlayer(id) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.players.splice(i, 1);
    this.rebuild();
  }

  setTeam(id, team, spawn = true) {
    const p = this.player(id);
    if (!p) return;
    team = team === 1 || team === 2 ? team : 0;
    if (p.team === team && (team === 0 || p.d)) return;
    p.team = team;
    p.input = 0;
    p.kicking = false;
    if (!team) p.d = null;
    else {
      const pp = this.st.player;
      p.d = disc({ r: pp.radius, invMass: pp.invMass, damping: pp.damping, bCoef: pp.bCoef, cMask: PLAYER_MASK, cGroup: TEAM_FLAG[team] });
      if (spawn) {
        p.d.x = DIR[team] * this.st.width;
        p.d.y = 0;
      }
      this.stat(p).team = team;
    }
    this.rebuild();
  }

  /** Orden de discos como HaxBall: pelotas, postes y jugadores en orden de llegada. */
  rebuild() {
    const D = [];
    const K = [];
    this.balls.forEach((b, i) => {
      D.push(b.d);
      K.push({ ball: i });
    });
    for (const d of this.posts) {
      D.push(d);
      K.push({ post: d.team });
    }
    for (const p of this.players)
      if (p.d) {
        D.push(p.d);
        K.push({ p });
      }
    this.world.discs = D;
    this.kinds = K;
  }

  setInput(id, bits) {
    const p = this.player(id);
    if (!p) return;
    bits &= 31;
    if (!(p.input & KEY.KICK) && bits & KEY.KICK) p.kicking = true;
    p.input = bits;
  }

  // ---------------------------------------------------------------- saque
  resetPositions() {
    this.state = 0;
    for (const b of this.balls) {
      Object.assign(b.d, { x: b.x0, y: b.y0, vx: 0, vy: 0 });
      b.touch = [null, null, null];
    }
    const count = [0, 0, 0];
    const sd = this.st.spawnDistance;
    for (const p of this.players) {
      if (!p.d) continue;
      const q = count[p.team]++;
      let h = (q + 1) >> 1;
      if (!(q & 1)) h = -h;
      Object.assign(p.d, { x: sd * DIR[p.team], y: 55 * h, vx: 0, vy: 0, cMask: PLAYER_MASK });
      p.kicking = false;
    }
  }

  // ---------------------------------------------------------------- tick
  step() {
    const ev = this.events;
    ev.length = 0;
    const pp = this.st.player;
    for (const p of this.players) {
      const d = p.d;
      if (!d) continue;
      if (!(p.input & KEY.KICK)) p.kicking = false;
      if (p.cd > 0) p.cd--;
      if (p.kicking && p.cd <= 0) {
        let kicked = false;
        for (let i = 0; i < this.balls.length; i++) {
          const b = this.balls[i].d;
          const dx = b.x - d.x;
          const dy = b.y - d.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist - b.r - d.r >= 4) continue;
          const nx = dx / dist;
          const ny = dy / dist;
          b.vx += pp.kickStrength * nx * b.invMass;
          b.vy += pp.kickStrength * ny * b.invMass;
          d.vx -= pp.kickback * nx * d.invMass;
          d.vy -= pp.kickback * ny * d.invMass;
          this.touch(i, p, true);
          kicked = true;
          ev.push({ t: 'kick', id: p.id, ball: i, x: b.x, y: b.y });
        }
        if (kicked) {
          p.kicking = false;
          p.cd = KICK_MIN;
          this.stat(p).kicks++;
        }
      }
      // movimiento: 8 direcciones, diagonal normalizada; al tener armada la patada acelera menos
      const bits = p.input;
      let x = (bits & KEY.RIGHT ? 1 : 0) - (bits & KEY.LEFT ? 1 : 0);
      let y = (bits & KEY.DOWN ? 1 : 0) - (bits & KEY.UP ? 1 : 0);
      if (x && y) {
        x *= DIAG;
        y *= DIAG;
      }
      if (x || y) {
        const a = p.kicking ? pp.kickingAcceleration : pp.acceleration;
        d.vx += x * a;
        d.vy += y * a;
      }
      d.damping = p.kicking ? pp.kickingDamping : pp.damping;
    }

    for (const b of this.balls) {
      b.px = b.d.x;
      b.py = b.d.y;
    }
    this.hits.length = 0;
    step(this.world, this.hits);
    this.readHits();

    switch (this.state) {
      case 0: {
        // si el equipo que saca se quedó sin jugadores, saca el otro (si no, el partido quedaría trabado)
        if (!this.players.some((p) => p.d && p.team === this.koTeam) && this.players.some((p) => p.d)) this.koTeam = this.koTeam === 1 ? 2 : 1;
        const mask = PLAYER_MASK | KO_FLAG[this.koTeam];
        for (const p of this.players) if (p.d) p.d.cMask = mask;
        if (this.balls.some((b) => b.d.vx !== 0 || b.d.vy !== 0)) {
          this.state = 1;
          ev.push({ t: 'kickoff' });
        }
        break;
      }
      case 1: {
        this.time++;
        for (const p of this.players) if (p.d) p.d.cMask = PLAYER_MASK;
        const top = this.balls[0].touch[0];
        if (top) this.poss[top.team]++;
        let scored = null;
        for (let i = 0; i < this.balls.length && !scored; i++) {
          const b = this.balls[i];
          for (const g of this.st.goals)
            if (crosses(g, b.d.x, b.d.y, b.px, b.py)) {
              scored = { g, i };
              break;
            }
        }
        if (scored) this.goal(scored.g, scored.i);
        else if (this.timeUp() && this.score[1] !== this.score[2]) this.end();
        break;
      }
      case 2: {
        if (--this.timer <= 0) {
          const { scoreLimit: sl } = this.cfg;
          if ((sl > 0 && (this.score[1] >= sl || this.score[2] >= sl)) || (this.timeUp() && this.score[1] !== this.score[2])) this.end();
          else {
            this.resetPositions();
            ev.push({ t: 'reset' });
          }
        }
        break;
      }
      case 3: {
        if (--this.timer <= 0 && !this.over) {
          this.over = true;
          ev.push({ t: 'over', winner: this.winner });
        }
        break;
      }
    }
    this.tick++;
  }

  timeUp() {
    return this.cfg.timeLimit > 0 && this.time >= this.cfg.timeLimit * 60 * TPS;
  }

  /** Con tiempo cumplido y empate: gol de oro. */
  get overtime() {
    return this.timeUp() && this.score[1] === this.score[2] && this.state < 3;
  }

  touch(i, p, kick = false) {
    const b = this.balls[i];
    const t = b.touch;
    // un toque cuenta si cambia quién la toca o si pasó un rato desde el último contacto
    if (t[0]?.id !== p.id || this.tick - (b.lastTick || 0) > 20) this.stat(p).touches++;
    b.lastTick = this.tick;
    if (t[0]?.id !== p.id) {
      t[2] = t[1];
      t[1] = t[0];
      t[0] = { id: p.id, team: p.team, tick: this.tick, kick };
    } else {
      t[0].tick = this.tick;
      t[0].kick ||= kick;
    }
  }

  readHits() {
    const K = this.kinds;
    for (const [a, b, v] of this.hits) {
      const ka = K[a];
      const kb = b >= 0 ? K[b] : null;
      const ball = ka?.ball ?? kb?.ball;
      if (ball === undefined) continue;
      const other = ka?.ball !== undefined ? kb : ka;
      if (other?.p) {
        this.touch(ball, other.p);
        if (v > 0.6) this.events.push({ t: 'touch', ball, v });
      } else if (other?.post) this.events.push({ t: 'post', ball, v });
      else if (!other && v > 0.5) this.events.push({ t: 'wall', ball, v });
    }
  }

  goal(g, ballIdx) {
    const conceded = g.team;
    const team = conceded === 1 ? 2 : 1;
    this.state = 2;
    this.timer = GOAL_TICKS;
    this.koTeam = conceded;
    this.score[team]++;
    let [last, prev, prev2] = this.balls[ballIdx].touch;
    const e = { t: 'goal', team, ball: ballIdx, scorer: null, assist: null, og: false, score: [this.score[1], this.score[2]] };
    const byId = (id) => this.player(id) || { id, name: this.stats[id]?.name || '?', team: this.stats[id]?.team };
    // remate desviado por un defensor (lo rozó menos de 0,75 s después de la patada): gol del que remató
    if (last && last.team !== team && prev?.team === team && prev.kick && last.tick - prev.tick < 45) {
      last = prev;
      prev = prev2;
    }
    if (last) {
      const s = byId(last.id);
      if (last.team === team) {
        e.scorer = { id: s.id, name: s.name };
        this.stat(s).goals++;
        if (prev && prev.team === team && prev.id !== last.id) {
          const a = byId(prev.id);
          e.assist = { id: a.id, name: a.name };
          this.stat(a).assists++;
        }
      } else {
        e.og = true;
        e.scorer = { id: s.id, name: s.name };
        this.stat(s).og++;
      }
    }
    this.events.push(e);
  }

  end() {
    this.state = 3;
    this.timer = END_TICKS;
    this.winner = this.score[1] > this.score[2] ? 1 : 2;
    this.events.push({ t: 'end', winner: this.winner, score: [this.score[1], this.score[2]] });
  }

  /** Resumen final: marcador, posesión y estadísticas por jugador. */
  summary() {
    const total = this.poss[1] + this.poss[2] || 1;
    return {
      score: [this.score[1], this.score[2]],
      winner: this.winner,
      time: Math.round(this.time / TPS),
      poss: [Math.round((this.poss[1] / total) * 100), Math.round((this.poss[2] / total) * 100)],
      stats: Object.entries(this.stats).map(([id, s]) => ({ id, ...s })),
    };
  }

  // ---------------------------------------------------------------- red
  /** Estado completo para sincronizar clientes (sin la geometría fija). */
  snapshot() {
    return {
      k: this.tick,
      s: this.state,
      tm: this.timer,
      ti: this.time,
      sc: [this.score[1], this.score[2]],
      ko: this.koTeam,
      w: this.winner,
      b: this.balls.map(({ d }) => [r3(d.x), r3(d.y), r3(d.vx), r3(d.vy)]),
      p: this.players.filter((p) => p.d).map((p) => [p.id, p.team, r3(p.d.x), r3(p.d.y), r3(p.d.vx), r3(p.d.vy), p.input, p.kicking ? 1 : 0, p.cd, p.d.cMask]),
    };
  }

  /** Aplica un estado del servidor. `info(id)` devuelve { name, avatar } para jugadores nuevos. */
  applySnapshot(s, info = () => ({})) {
    this.tick = s.k;
    this.state = s.s;
    this.timer = s.tm;
    this.time = s.ti;
    this.score[1] = s.sc[0];
    this.score[2] = s.sc[1];
    this.koTeam = s.ko;
    this.winner = s.w;
    s.b.forEach(([x, y, vx, vy], i) => {
      const b = this.balls[i];
      if (b) Object.assign(b.d, { x, y, vx, vy });
    });
    const seen = new Set();
    let changed = false;
    for (const [id, team, x, y, vx, vy, input, kicking, cd, mask] of s.p) {
      seen.add(id);
      let p = this.player(id);
      if (!p || p.team !== team || !p.d) {
        const inf = info(id) || {};
        p = this.addPlayer({ id, team, name: inf.name, avatar: inf.avatar }, false);
        changed = true;
      }
      Object.assign(p.d, { x, y, vx, vy, cMask: mask, damping: kicking ? this.st.player.kickingDamping : this.st.player.damping });
      p.input = input;
      p.kicking = !!kicking;
      p.cd = cd;
    }
    for (const p of [...this.players])
      if (!seen.has(p.id)) {
        this.players.splice(this.players.indexOf(p), 1);
        changed = true;
      }
    // mismo orden de discos que el servidor
    const order = s.p.map((e) => e[0]);
    this.players.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    this.rebuild();
    return changed;
  }
}
