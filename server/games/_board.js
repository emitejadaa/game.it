/** Fábrica para juegos de tablero por turnos de 2 jugadores (Tateti, 4 en línea). */
const TURN_MS = 30e3;
const NEXT_ROUND_MS = 2800;

export function boardGame(rules) {
  function newRound(room, api) {
    const d = room.data;
    d.board = rules.empty();
    d.result = null;
    d.last = -1;
    d.round++;
    d.turn = d.round % 2 === 1 ? 0 : 1; // el que empieza se alterna
    scheduleTurn(room, api);
  }

  function scheduleTurn(room, api) {
    const d = room.data;
    d.deadline = Date.now() + TURN_MS;
    api.setTimer('turn', TURN_MS, () => {
      // tiempo agotado: juega una movida al azar por el jugador
      const moves = rules.moves(d.board);
      play(room, api, d.turn, moves[Math.floor(Math.random() * moves.length)], true);
    });
  }

  function play(room, api, idx, move, timeout = false) {
    const d = room.data;
    const cell = rules.apply(d.board, move, idx);
    d.last = cell;
    api.touch();
    const r = rules.check(d.board);
    api.broadcast({ t: 'move', by: d.order[idx], move, cell, timeout });
    if (r.winner >= 0 || r.full) {
      api.clearTimer('turn');
      const winner = r.winner >= 0 ? d.order[r.winner] : null;
      d.result = { winner, line: r.line };
      if (winner) d.score[winner] = (d.score[winner] || 0) + 1;
      else d.score.draws++;
      d.deadline = 0;
      api.setTimer('next', NEXT_ROUND_MS, () => {
        newRound(room, api);
        api.sync();
      });
    } else {
      d.turn = 1 - d.turn;
      scheduleTurn(room, api);
    }
    api.sync();
  }

  return {
    minPlayers: 2,
    maxPlayers: 2,
    view(room) {
      const d = room.data;
      if (!d) return { match: null };
      return {
        match: {
          board: d.board,
          order: d.order,
          turn: d.result ? null : d.order[d.turn],
          score: d.score,
          round: d.round,
          result: d.result,
          last: d.last,
          deadline: d.deadline ? d.deadline - Date.now() : 0,
        },
      };
    },
    start(room, api) {
      const ids = api.players().map((p) => p.id);
      room.data = { order: ids.slice(0, 2), score: { draws: 0 }, round: 0 };
      newRound(room, api);
    },
    message(room, api, p, msg) {
      if (msg.t !== 'move') return false;
      const d = room.data;
      const idx = d.order.indexOf(p.id);
      if (idx < 0 || d.result || d.turn !== idx) return api.send(p.id, { t: 'error', code: 'not_your_turn' });
      const move = Number(msg.move);
      if (!rules.legal(d.board, move)) return false;
      play(room, api, idx, move);
    },
    leave(room, api, id) {
      api.broadcast({ t: 'opponent_left', id });
      api.toLobby();
    },
  };
}
