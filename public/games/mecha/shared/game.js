/**
 * Mecha Corta — la partida (la usan el navegador contra la compu y el servidor online).
 *
 * Una bomba pasa de mano en mano. El que la tiene ve una sílaba y tiene que escribir una palabra
 * que la contenga (que exista y que nadie haya usado en la partida); si lo logra, la bomba pasa al
 * siguiente con otra sílaba. La mecha dura un tiempo al azar que no se ve: si explota en tu turno
 * perdés una vida. Usar todas las letras del abecedario (menos las raras) da una vida extra.
 * Gana el último que queda. Solo (práctica): se juega hasta perder todas las vidas.
 *
 * io: emit(view) · event(ev) · timer(name, ms, fn) · clear(name) · over(result) · now()
 */
import { ALPHA, norm } from './dict.js';

export const MAX_LIVES = 3;
export const MIN_TURN = 3000; // tiempo mínimo con la bomba en la mano
export const FUSES = { short: [7000, 16000], normal: [11000, 26000], long: [16000, 34000] };
const PROMPT_TRIES = 2; // explosiones con la misma sílaba antes de cambiarla

// compu: cuánto tarda en pensar, qué tan rápido escribe y qué tan seguido se traba
export const BOT = {
  1: { think: [1600, 3600], cps: 5.5, miss: 0.18, typo: 0.1 },
  2: { think: [900, 2200], cps: 8.5, miss: 0.08, typo: 0.06 },
  3: { think: [500, 1300], cps: 12, miss: 0.03, typo: 0.03 },
};

export class Bomb {
  /**
   * players: [{ id, name, color, bot: 0 | 1..3 }]
   * opts: { lives, diff: 1..3, fuse: 'short'|'normal'|'long' }
   */
  constructor({ players, opts, dict, io, rng }) {
    this.players = players.map((p) => ({ ...p, lives: 0, alive: true, letters: new Set(), words: 0, away: false }));
    this.opts = { lives: 2, diff: 2, fuse: 'normal', ...opts };
    this.dict = dict;
    this.lang = dict.lang;
    this.alpha = ALPHA[this.lang];
    this.io = io;
    this.rng = rng;
    this.gid = Math.floor(rng() * 1e9);
    this.seq = 0;
    this.phase = 'idle';
    this.used = new Set();
    this.recent = [];
    this.typing = '';
    this.winner = -1;
    this.last = null;
  }

  get solo() {
    return this.players.length === 1;
  }

  start() {
    for (const p of this.players) {
      p.lives = clampLives(this.opts.lives);
      p.alive = true;
      p.letters.clear();
      p.words = 0;
    }
    this.used.clear();
    this.phase = 'play';
    this.winner = -1;
    this.turn = Math.floor(this.rng() * this.players.length);
    this.prompt = this.pick();
    this.tries = 0;
    this.startedAt = this.io.now();
    this.light();
    this.changed();
  }

  pick() {
    const pool = this.dict.pool(this.opts.diff);
    let s = pool[0];
    for (let k = 0; k < 20; k++) {
      s = pool[Math.floor(this.rng() * pool.length)];
      if (!this.recent.includes(s)) break;
    }
    this.recent.push(s);
    if (this.recent.length > 40) this.recent.shift();
    return s;
  }

  /** Enciende una mecha nueva. */
  light() {
    const [a, b] = FUSES[this.opts.fuse] || FUSES.normal;
    this.boomAt = this.io.now() + a + this.rng() * (b - a);
    this.armFuse();
  }
  armFuse() {
    this.io.timer('fuse', Math.max(0, this.boomAt - this.io.now()), () => this.explode());
  }

  nextAlive(i) {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const j = (i + k) % n;
      if (this.players[j].alive) return j;
    }
    return i;
  }

  /** El jugador de turno escribe (se muestra en vivo a los demás). */
  type(i, text) {
    if (this.phase !== 'play' || i !== this.turn) return;
    this.typing = String(text || '').slice(0, 30);
    this.io.event({ t: 'tp', p: i, w: this.typing });
  }

  /** Manda una palabra. Devuelve { ok } o { ok: false, why: prompt|used|nope|short|turn }. */
  submit(i, raw) {
    if (this.phase !== 'play' || i !== this.turn) return { ok: false, why: 'turn' };
    const w = norm(raw, this.lang).slice(0, 30);
    let why = null;
    if (w.length < 2) why = 'short';
    else if (!w.includes(this.prompt)) why = 'prompt';
    else if (this.used.has(w)) why = 'used';
    else if (!this.dict.has(w)) why = 'nope';
    if (why) {
      this.io.event({ t: 'bad', p: i, w, why });
      return { ok: false, why };
    }
    const p = this.players[i];
    this.used.add(w);
    p.words++;
    for (const ch of w) if (this.alpha.includes(ch)) p.letters.add(ch);
    let bonus = false;
    if (p.letters.size >= this.alpha.length) {
      p.letters.clear();
      if (p.lives < MAX_LIVES) {
        p.lives++;
        bonus = true;
      }
    }
    this.last = { p: i, w, prompt: this.prompt };
    this.io.event({ t: 'ok', p: i, w, prompt: this.prompt, bonus });
    this.turn = this.nextAlive(i);
    this.prompt = this.pick();
    this.tries = 0;
    this.typing = '';
    // el que recibe la bomba tiene al menos unos segundos
    const now = this.io.now();
    if (this.boomAt - now < MIN_TURN) {
      this.boomAt = now + MIN_TURN;
      this.armFuse();
    }
    this.changed();
    return { ok: true };
  }

  explode() {
    if (this.phase !== 'play') return;
    const i = this.turn;
    const p = this.players[i];
    p.lives--;
    if (p.lives <= 0) {
      p.lives = 0;
      p.alive = false;
    }
    this.io.event({ t: 'boom', p: i, dead: !p.alive, prompt: this.prompt });
    this.typing = '';
    this.io.clear('bot');
    const alive = this.players.filter((x) => x.alive);
    if (this.solo ? !alive.length : alive.length <= 1) {
      this.phase = 'over';
      this.winner = this.solo ? -1 : this.players.indexOf(alive[0]);
      this.io.clear('fuse');
      this.changed();
      this.io.over?.(this.result());
      return;
    }
    this.tries++;
    if (this.tries >= PROMPT_TRIES) {
      this.prompt = this.pick();
      this.tries = 0;
    }
    if (!p.alive || !this.solo) this.turn = this.nextAlive(i);
    this.light();
    this.changed();
  }

  result() {
    return {
      winner: this.winner,
      ms: this.io.now() - this.startedAt,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, words: p.words, alive: p.alive, lives: p.lives })),
    };
  }

  /** Un jugador se desconecta o vuelve (mientras no está, se le pasa la bomba igual y explota). */
  setAway(i, away) {
    const p = this.players[i];
    if (!p) return;
    p.away = away;
    this.changed(false);
  }

  /** Vuelve a la partida con una vida (premio por ver un anuncio, solo contra la compu). */
  revive(i) {
    const p = this.players[i];
    if (!p || p.alive || this.phase !== 'play') return false;
    p.alive = true;
    p.lives = 1;
    this.changed(false);
    return true;
  }

  /** Se fue de la partida: queda afuera. */
  remove(i) {
    const p = this.players[i];
    if (!p || !p.alive || this.phase !== 'play') return;
    p.alive = false;
    p.lives = 0;
    const alive = this.players.filter((x) => x.alive);
    if (alive.length <= 1 && !this.solo) {
      this.phase = 'over';
      this.winner = alive.length ? this.players.indexOf(alive[0]) : -1;
      this.io.clear('fuse');
      this.io.clear('bot');
      this.changed();
      this.io.over?.(this.result());
      return;
    }
    if (this.turn === i) {
      this.turn = this.nextAlive(i);
      this.typing = '';
      if (this.boomAt - this.io.now() < MIN_TURN) {
        this.boomAt = this.io.now() + MIN_TURN;
        this.armFuse();
      }
    }
    this.changed();
  }

  changed(bump = true) {
    if (bump) this.seq++;
    this.io.emit(this.view());
    if (bump && this.phase === 'play') this.botTurn();
  }

  view() {
    return {
      gid: this.gid,
      seq: this.seq,
      phase: this.phase,
      lang: this.lang,
      alpha: this.alpha,
      maxLives: MAX_LIVES,
      prompt: this.prompt,
      turn: this.turn,
      typing: this.typing,
      used: this.used.size,
      winner: this.winner,
      last: this.last,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, lives: p.lives, alive: p.alive, letters: [...p.letters].join(''), words: p.words, away: p.away })),
    };
  }

  // ---------------------------------------------------------------- compu
  botTurn() {
    const i = this.turn;
    const p = this.players[i];
    this.io.clear('bot');
    if (!p?.bot || this.phase !== 'play') return;
    const L = BOT[p.bot] || BOT[2];
    const r = this.rng;
    // las sílabas raras cuestan más
    const rare = this.dict.rarity(this.prompt);
    const hard = rare < 1500 ? 1.6 : rare < 5000 ? 1.2 : 1;
    const think = (L.think[0] + r() * (L.think[1] - L.think[0])) * hard;
    this.io.timer('bot', think, () => this.botTry(i, this.seq, L, L.miss * hard * hard));
  }

  botTry(i, seq, L, miss) {
    if (this.seq !== seq || this.turn !== i || this.phase !== 'play') return;
    const r = this.rng;
    if (r() < miss) {
      // se traba: escribe la sílaba, la borra y lo vuelve a intentar más tarde
      this.typeOut(i, seq, this.prompt, L, () =>
        this.io.timer('bot', 500 + r() * 700, () => {
          if (this.seq !== seq) return;
          this.type(i, '');
          this.io.timer('bot', 1500 + r() * 2500, () => this.botTry(i, seq, L, miss * 0.5));
        }),
      );
      return;
    }
    const cands = this.dict.find(this.prompt, this.used, r);
    if (!cands.length) return;
    // los fáciles eligen palabras cortas; los difíciles buscan letras que les faltan
    const pl = this.players[i];
    let best = cands[0];
    let bs = -Infinity;
    for (const w of cands) {
      let sc = r() * 3;
      if (pl.bot === 1) sc -= w.length * 0.6;
      else {
        sc -= Math.abs(w.length - (pl.bot === 3 ? 9 : 7)) * 0.4;
        for (const ch of new Set(w)) if (this.alpha.includes(ch) && !pl.letters.has(ch)) sc += pl.bot === 3 ? 1.2 : 0.4;
      }
      if (sc > bs) {
        bs = sc;
        best = w;
      }
    }
    if (r() < L.typo && best.length > 4) {
      // error de tipeo: manda algo mal y después lo corrige
      const k = 1 + Math.floor(r() * (best.length - 2));
      const bad = best.slice(0, k) + best[k + 1] + best[k] + best.slice(k + 2);
      this.typeOut(i, seq, bad, L, () => {
        const res = this.submit(i, bad);
        if (!res.ok) this.io.timer('bot', 400 + r() * 500, () => this.seq === seq && this.typeOut(i, seq, best, L, () => this.submit(i, best)));
      });
      return;
    }
    this.typeOut(i, seq, best, L, () => this.submit(i, best));
  }

  /** Escribe letra por letra (los demás lo ven en vivo) y al final llama a done. */
  typeOut(i, seq, word, L, done) {
    let k = 0;
    const step = () => {
      if (this.seq !== seq || this.turn !== i || this.phase !== 'play') return;
      if (k >= word.length) {
        if (!word.length) this.type(i, '');
        done?.();
        return;
      }
      k++;
      this.type(i, word.slice(0, k));
      this.io.timer('bot', (1000 / L.cps) * (0.6 + this.rng() * 0.8), step);
    };
    step();
  }
}

const clampLives = (n) => Math.max(1, Math.min(MAX_LIVES, Math.round(n) || 2));
