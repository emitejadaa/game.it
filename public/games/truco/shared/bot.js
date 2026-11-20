/**
 * Truco — la compu. Decide solo con lo que ve su asiento (la misma vista que recibe una persona): sus cartas, las
 * jugadas, los cantos, los puntos que se dijeron y, de a cuatro, la seña del envido del compañero. Para estimar cuánto
 * gana reparte muchas veces las cartas que no vio entre los demás (respetando lo que se sabe: el envido declarado,
 * quién tiene flor) y juega cada mano hasta el final con una política simple. Los cantos de los rivales pesan: el que canta truco suele tener con qué.
 *
 * Niveles: 1 fácil (pocas cuentas, se equivoca, casi no miente), 2 normal y 3 difícil (más cuentas, lee los cantos y
 * miente mejor).
 */
import { DECK, power, envido, hasFlor, teamOf, bazaWinner, handWinner, envidoNext, envidoAccepted, envidoRejected, trucoValue, trucoRejected, faltaValue } from './rules.js';

const LV = {
  1: { k: 22, noise: 0.16, bluff: 0.04, read: 0, envRead: 0, sloppy: 0.22, envT: 0.72 },
  2: { k: 60, noise: 0.05, bluff: 0.09, read: 4, envRead: 3.5, sloppy: 0.04, envT: 0.66 },
  3: { k: 130, noise: 0, bluff: 0.14, read: 7, envRead: 2.6, sloppy: 0, envT: 0.63 },
};
const CALL_T = [0, 0.72, 0.8, 0.88]; // probabilidad de ganar la mano para cantar truco, retruco, vale cuatro
const RAISE_T = [0, 0, 0.77, 0.86]; // para subir cuando te cantan
const ACCEPT_T = [0, 0.38, 0.35, 0.32]; // para querer

const sig = (x) => 1 / (1 + Math.exp(-x));
const byPower = (a, b) => power(a) - power(b);

/** Lo que sabe el asiento a partir de su vista. */
function know(v) {
  const h = v.hand;
  const n = v.n;
  const played = Array.from({ length: n }, () => []);
  for (const b of h.bazas) for (const p of b.plays) played[p.seat].push(p.card);
  const seen = new Set([...h.dealt, ...played.flat()]);
  const exact = {};
  let cap = 99;
  const er = h.env.result;
  if (er?.yes && er.said) {
    cap = 0;
    for (const s of er.said)
      if (s.pts !== null && s.pts !== undefined) {
        exact[s.seat] = s.pts;
        cap = Math.max(cap, s.pts);
      }
  }
  // de a cuatro, la seña del compañero: sus puntos de envido
  if (n === 4 && typeof h.partnerEnv === 'number' && exact[(v.me + 2) % 4] === undefined) exact[(v.me + 2) % 4] = h.partnerEnv;
  // quién cantó qué en esta mano (para leer a los rivales)
  const truco = new Set(), env = new Set();
  for (const c of h.calls || []) {
    if (teamOf(c.seat) === teamOf(v.me)) continue;
    if (c.what === 'truco' || c.what === 'retruco' || c.what === 'vale4' || c.what === 'quiero-truco') truco.add(c.seat);
    if (c.what === 'envido' || c.what === 'real' || c.what === 'falta') env.add(c.seat);
  }
  const acted = new Set(h.bazas[0].plays.map((p) => p.seat));
  // si el rival canta casi siempre, sus cantos dicen poco
  const st = v.stats || { hands: 0, truco: [0, 0], envido: [0, 0] };
  const op = 1 - teamOf(v.me);
  const often = (x) => {
    const rate = (x + 1) / (st.hands + 3);
    return rate > 0.45 ? Math.max(0.2, 1 - (rate - 0.45) * 2.2) : 1;
  };
  return {
    trust: often(st.truco[op]),
    trustEnv: often(st.envido[op]),
    n,
    me: v.me,
    team: teamOf(v.me),
    played,
    pool: DECK.filter((c) => !seen.has(c)),
    left: v.seats.map((s) => s.left),
    mine: h.mine.slice(),
    exact,
    cap,
    flor: !!v.flor,
    florSung: new Set(h.florSung),
    acted,
    readTruco: truco,
    readEnv: env,
    mano: h.mano,
  };
}

/** Reparte las cartas que no se vieron. Devuelve { hands, w } (cartas en mano de cada uno y el peso de ese reparto). */
function sample(K, rng, P) {
  const read = P.read * K.trust;
  let hands = null;
  for (let tries = 0; tries < 40; tries++) {
    const pool = K.pool.slice();
    hands = [];
    let ok = true;
    for (let s = 0; s < K.n; s++) {
      if (s === K.me) {
        hands.push(K.mine.slice());
        continue;
      }
      const hs = [];
      for (let j = 0; j < K.left[s]; j++) hs.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      hands.push(hs);
      const full = K.played[s].concat(hs);
      if (ok && full.length === 3) {
        const e = envido(full);
        if (K.exact[s] !== undefined ? e !== K.exact[s] : e > K.cap) ok = false;
        if (K.flor && (K.florSung.has(s) || K.acted.has(s)) && K.florSung.has(s) !== hasFlor(full)) ok = false;
      }
    }
    if (ok) break;
  }
  let w = 1;
  if (read) {
    for (const s of K.readTruco) {
      const full = K.played[s].concat(hands[s]);
      const str = full.reduce((a, c) => a + power(c), 0) / (full.length * 14);
      w *= 0.08 + sig((str - 0.52) * read);
    }
    if (P.envRead) for (const s of K.readEnv) {
      if (K.exact[s] !== undefined) continue;
      const full = K.played[s].concat(hands[s]);
      w *= 0.15 + sig((envido(full) - 24.5) / (P.envRead / K.trustEnv));
    }
  }
  return { hands, w };
}

/** La carta que tiraría cualquiera sin pensar mucho (para jugar las manos imaginadas). */
function policy(hand, plays, seat, bi) {
  const sorted = hand.slice().sort(byPower);
  if (!plays.length) return bi === 0 && sorted.length === 3 ? sorted[1] : sorted[sorted.length - 1];
  let best = -1, bestTeam = -1, tied = false;
  for (const p of plays) {
    const pw = power(p.card);
    if (pw > best) {
      best = pw;
      bestTeam = teamOf(p.seat);
      tied = false;
    } else if (pw === best && teamOf(p.seat) !== bestTeam) tied = true;
  }
  if (bestTeam === teamOf(seat) && !tied) return sorted[0];
  const win = sorted.find((c) => power(c) > best);
  if (win) return win;
  if (bi > 0) {
    const tie = sorted.find((c) => power(c) === best);
    if (tie) return tie;
  }
  return sorted[0];
}

/** Juega la mano hasta el final desde la vista (con `first` como mi próxima carta, si se da). Devuelve el equipo ganador. */
function playout(v, hands, first) {
  const h = v.hand;
  const n = v.n;
  const res = h.bazas.filter((b) => b.res !== null && b.res !== undefined).map((b) => b.res);
  let cur = h.bazas[h.bazas.length - 1];
  let plays = cur.res !== null && cur.res !== undefined ? [] : cur.plays.slice();
  let bi = res.length;
  let turn = h.turn >= 0 ? h.turn : cur.lead;
  if (!plays.length && cur.res !== null && cur.res !== undefined) turn = cur.win;
  let firstUsed = !first;
  for (let guard = 0; guard < 16; guard++) {
    while (plays.length < n) {
      const s = turn;
      let card;
      if (!firstUsed && s === v.me) {
        card = first;
        firstUsed = true;
      } else card = policy(hands[s], plays, s, bi);
      if (!card) return teamOf(v.me) ^ 1; // no debería pasar
      hands[s] = hands[s].filter((c) => c !== card);
      plays.push({ seat: s, card });
      turn = (s + 1) % n;
    }
    const w = bazaWinner(plays);
    res.push(w.team);
    const hw = handWinner(res, teamOf(h.mano));
    if (hw !== null) return hw;
    plays = [];
    bi++;
    turn = w.seat;
  }
  return teamOf(h.mano);
}

/** Probabilidad de ganar la mano tirando cada carta (y la mejor). */
function cardOdds(v, K, rng, P) {
  const cands = [...new Set(K.mine)];
  const tot = Object.fromEntries(cands.map((c) => [c, 0]));
  let wsum = 0;
  for (let i = 0; i < P.k; i++) {
    const s = sample(K, rng, P);
    wsum += s.w;
    for (const c of cands) {
      const hands = s.hands.map((x) => x.slice());
      if (playout(v, hands, c) === K.team) tot[c] += s.w;
    }
  }
  const odds = cands.map((c) => ({ card: c, p: wsum ? tot[c] / wsum : 0.5 }));
  odds.sort((a, b) => b.p - a.p || byPower(a.card, b.card));
  return odds;
}

/** Probabilidad de ganar la mano desde acá sin elegir carta (cuando hay que contestar un canto). */
function handOdds(v, K, rng, P) {
  if (v.hand.turn === v.me && K.mine.length) return cardOdds(v, K, rng, P)[0].p;
  let win = 0, wsum = 0;
  for (let i = 0; i < P.k; i++) {
    const s = sample(K, rng, P);
    wsum += s.w;
    if (playout(v, s.hands, null) === K.team) win += s.w;
  }
  return wsum ? win / wsum : 0.5;
}

/** Probabilidad de que mi equipo gane el envido. */
function envidoOdds(v, K, rng, P) {
  const order = Array.from({ length: K.n }, (_, k) => (K.mano + k) % K.n);
  let win = 0, wsum = 0;
  const N = Math.max(40, P.k * 2);
  for (let i = 0; i < N; i++) {
    const s = sample(K, rng, P);
    const best = [-1, -1], pos = [99, 99];
    order.forEach((seat, k) => {
      const full = seat === K.me ? v.hand.dealt : K.played[seat].concat(s.hands[seat]);
      const e = envido(full);
      const tm = teamOf(seat);
      if (e > best[tm]) {
        best[tm] = e;
        pos[tm] = k;
      }
    });
    const w = best[0] !== best[1] ? (best[0] > best[1] ? 0 : 1) : pos[0] < pos[1] ? 0 : 1;
    wsum += s.w;
    if (w === K.team) win += s.w;
  }
  return wsum ? win / wsum : 0.5;
}

/** La falta envido vale la pena si con ella se gana la partida (ya en las buenas) o si el rival está por ganar. */
const faltaOk = (my, op, falta, target) => op >= target - 5 || (my >= target / 2 && my + falta >= target);

const noisy = (p, P, rng) => Math.max(0, Math.min(1, p + (rng() * 2 - 1) * P.noise));

/** ¿Canto envido (y cuál)? */
function envidoCall(v, K, rng, P, kinds) {
  const mine = Math.max(envido(v.hand.dealt), v.hand.partnerEnv ?? 0);
  const pe = noisy(envidoOdds(v, K, rng, P), P, rng);
  const my = v.scores[K.team], op = v.scores[1 - K.team];
  const falta = faltaValue(v.scores, v.target);
  if (pe > 0.9 && kinds.includes('falta') && faltaOk(my, op, falta, v.target)) return 'falta';
  if (pe > 0.88 && kinds.includes('real') && rng() < 0.6) return 'real';
  if (pe > P.envT) return 'envido';
  // mentir: a veces se canta sin nada
  if (mine <= 23 && rng() < P.bluff * 0.7) return 'envido';
  return null;
}

/** Contestar un envido: quiero, no quiero o subir. */
function envidoAnswer(v, K, rng, P) {
  const p = v.hand.pending;
  const my = v.scores[K.team], op = v.scores[1 - K.team];
  const acc = envidoAccepted(p.chain, v.scores, v.target);
  const rej = envidoRejected(p.chain, v.scores, v.target);
  const pe = noisy(envidoOdds(v, K, rng, P), P, rng);
  const next = envidoNext(p.chain);
  if (pe > 0.84 && next.length) {
    const falta = faltaValue(v.scores, v.target);
    if (next.includes('falta') && pe > 0.92 && faltaOk(my, op, falta, v.target)) return { t: 'envido', kind: 'falta' };
    if (next.includes('real')) return { t: 'envido', kind: 'real' };
    if (next.includes('envido')) return { t: 'envido', kind: 'envido' };
  }
  if (op + rej >= v.target) return { t: 'quiero' }; // no querer es perder igual
  let need = (acc - rej) / (2 * acc) + 0.07;
  if (op + acc >= v.target) need = Math.max(need, 0.55); // si pierdo, pierdo la partida
  if (my + acc >= v.target) need -= 0.08;
  return pe > need ? { t: 'quiero' } : { t: 'noquiero' };
}

/** Contestar un truco: quiero, no quiero o subir. */
function trucoAnswer(v, K, rng, P) {
  const p = v.hand.pending;
  const my = v.scores[K.team], op = v.scores[1 - K.team];
  const pw = noisy(handOdds(v, K, rng, P), P, rng);
  const lvl = p.level;
  if (lvl < 3 && v.can.truco && pw > RAISE_T[lvl + 1]) return { t: 'truco' };
  if (op + trucoRejected(lvl) >= v.target) return lvl < 3 && v.can.truco && pw > 0.6 ? { t: 'truco' } : { t: 'quiero' };
  let need = ACCEPT_T[lvl];
  if (op + trucoValue(lvl) >= v.target) need += 0.1;
  if (my + trucoValue(lvl) >= v.target) need -= 0.06;
  // de vez en cuando se banca un truco con poco
  if (pw > need || rng() < P.bluff * 0.5) return { t: 'quiero' };
  return { t: 'noquiero' };
}

/**
 * Qué hace la compu con la vista `v` de su asiento. Devuelve un mensaje para la mesa:
 * { t: 'play', card } | { t: 'truco' } | { t: 'envido', kind } | { t: 'quiero' } | { t: 'noquiero' }.
 */
export function decide(v, level, rng) {
  const P = LV[level] || LV[2];
  const L = v.can;
  const h = v.hand;
  if (!h || !L) return null;
  const K = know(v);
  if (L.quiero) {
    if (h.pending.kind === 'envido') return envidoAnswer(v, K, rng, P);
    if (L.envido.length) {
      const kind = envidoCall(v, K, rng, P, L.envido);
      if (kind) return { t: 'envido', kind };
    }
    return trucoAnswer(v, K, rng, P);
  }
  if (!L.play) return null;
  if (L.envido.length) {
    const kind = envidoCall(v, K, rng, P, L.envido);
    if (kind) return { t: 'envido', kind };
  }
  const odds = cardOdds(v, K, rng, P);
  let pick = odds[0];
  if (P.sloppy && rng() < P.sloppy) pick = odds[Math.floor(rng() * odds.length)];
  if (L.truco) {
    const lvl = h.truco.level + 1;
    const pw = noisy(odds[0].p, P, rng);
    const my = v.scores[K.team];
    // con la mano ganada se canta para sumar; en la primera a veces se espera (que canten ellos y subir)
    const first = h.bazas.length === 1;
    const slow = first && pw > 0.9 && rng() < 0.35;
    const want = (0.5 + (0.45 * (pw - CALL_T[lvl])) / (1 - CALL_T[lvl])) * (first ? 0.75 : 1);
    if (pw > CALL_T[lvl] && !slow && rng() < want) return { t: 'truco' };
    if (my + trucoRejected(lvl) >= v.target && pw > 0.45) return { t: 'truco' }; // con un no quiero ya se gana
    // mentir: con poco, si los rivales mostraron cartas bajas
    const seenOp = K.played.filter((_, s) => teamOf(s) !== K.team).flat();
    const lowOp = seenOp.length && seenOp.every((c) => power(c) <= 7);
    if (pw < 0.4 && rng() < P.bluff * (lowOp ? 1.6 : 0.7)) return { t: 'truco' };
  }
  return { t: 'play', card: pick.card };
}

// para las pruebas
export const _internal = { know, sample, policy, playout, cardOdds, envidoOdds };
