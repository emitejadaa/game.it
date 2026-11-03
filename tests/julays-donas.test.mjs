/** Julay’s Donas: puntajes de cada estación, pedidos según el día, el exigente, la dificultad y un pedido hecho de punta a punta. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPedido, notaLado, notaFritura, notaMasa, notaDecorado, notaEspera, notaFinal, tolerancia } from '../public/games/julays-donas/orders.js';
import { CLIENTES, EXIGENTES, MASAS, FORMAS, RELLENOS, BANOS, HILOS, TOPPINGS, PIEZAS, DIFICULTADES, exigenteDelDia, byId } from '../public/games/julays-donas/data.js';
import { Dia } from '../public/games/julays-donas/dia.js';
import { zonaFritura, lugaresFreidora } from '../public/games/julays-donas/mejoras.js';
import { partidaNueva } from '../public/games/julays-donas/guardado.js';
import { donaIdeal } from '../public/games/julays-donas/art.js';

/** Números al azar con semilla, para que las pruebas den siempre lo mismo. */
const rng = (s = 1) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const partida = (dia, extra = {}) => ({ ...partidaNueva('Prueba'), dia, ...extra });

test('fritura: dorada en la zona justa; cruda o quemada no suma', () => {
  assert.equal(notaLado(1), 1);
  assert.equal(notaLado(0.3), 0);
  assert.equal(notaLado(2.2), 0);
  assert.ok(notaLado(0.8) > 0 && notaLado(0.8) < 1);
  const pedido = { donas: [{}, {}] };
  assert.equal(notaFritura(pedido, [{ coc: [1, 1] }, { coc: [1.05, 0.95] }]), 100);
  assert.equal(notaFritura(pedido, [{ coc: [1, 1] }, null]), 50);
  // el termómetro agranda la zona justa
  const [a, b] = zonaFritura(partida(3));
  const [ta, tb] = zonaFritura(partida(3, { mejoras: { termometro: 1 } }));
  assert.ok(ta < a && tb > b);
  assert.equal(notaLado(1.2, [ta, tb]), 1);
  assert.ok(notaLado(1.2) < 1);
});

test('masa y espera: forma y masa correctas, y la paciencia según cuántas donas', () => {
  const pedido = { donas: [{ masa: 'chocolate', forma: 'anillo' }] };
  assert.equal(notaMasa(pedido, [{ masa: 'chocolate', forma: 'anillo' }]), 100);
  assert.equal(notaMasa(pedido, [{ masa: 'vainilla', forma: 'anillo' }]), 50);
  assert.equal(notaEspera(10, 1), 100);
  assert.ok(tolerancia(2) > tolerancia(1));
  assert.ok(notaEspera(tolerancia(1) + 60, 1) < 100);
  assert.ok(notaEspera(tolerancia(1) + 60, 1, 1, true) < notaEspera(tolerancia(1) + 60, 1));
});

test('los pedidos solo usan lo que ya apareció ese día (y las bolas siempre van rellenas)', () => {
  const r = rng(7);
  const listas = { masa: MASAS, forma: FORMAS, relleno: RELLENOS, bano: BANOS, hilos: HILOS };
  for (let dia = 1; dia <= 21; dia++)
    for (const c of [...CLIENTES, ...EXIGENTES]) {
      for (let k = 0; k < 15; k++) {
        const { donas } = crearPedido(c, dia, r, { exigente: EXIGENTES.includes(c) });
        assert.ok(donas.length >= 1 && donas.length <= 3);
        for (const d of donas) {
          for (const [cat, lista] of Object.entries(listas)) if (d[cat]) assert.ok(byId(lista, d[cat]).day <= dia, `${cat} ${d[cat]} el día ${dia}`);
          for (const t of d.toppings) assert.ok(byId(TOPPINGS, t).day <= dia);
          if (d.pieza) assert.ok(byId(PIEZAS, d.pieza.id).day <= dia);
          if (d.forma === 'bola') assert.ok(d.relleno, 'una bola sin relleno');
          if (d.forma === 'anillo') assert.equal(d.relleno, null);
        }
      }
    }
});

test('el último del día es exigente: Julay cada 7 días y los demás se turnan', () => {
  assert.equal(exigenteDelDia(1).id, 'pocha');
  assert.equal(exigenteDelDia(7).id, 'julay');
  assert.equal(exigenteDelDia(14).id, 'julay');
  for (let d = 1; d <= 30; d++) {
    const e = exigenteDelDia(d);
    if (d % 7) assert.ok(e.day <= d, `${e.id} todavía no apareció el día ${d}`);
  }
  // un exigente pone notas más duras con el mismo trabajo
  const notas = { espera: 90, masa: 100, fritura: 85, decorado: 80 };
  const comun = notaFinal(notas, null, 5).total;
  const exigente = notaFinal(notas, byId(EXIGENTES, 'morena'), 5).total;
  assert.ok(exigente < comun);
});

test('dificultad: más o menos clientes, paciencia y zona de la freidora; Medio es el ritmo de siempre', () => {
  for (let dia = 1; dia <= 25; dia++) {
    const n = (dif) => new Dia(partida(dia, { dificultad: dif }), rng(dia)).lista.length;
    assert.ok(n('facil') <= n('medio') && n('medio') <= n('dificil'), `día ${dia}`);
    // los clientes nuevos de ese día siempre vienen
    for (const dif of Object.keys(DIFICULTADES)) {
      const lista = new Dia(partida(dia, { dificultad: dif }), rng(dia)).lista.map((c) => c.id);
      for (const c of CLIENTES.filter((c) => c.day === dia)) assert.ok(lista.includes(c.id), `${c.id} el día ${dia} en ${dif}`);
    }
  }
  const p = (dif) => new Dia(partida(5, { dificultad: dif })).pacienciaDe(CLIENTES[0]);
  assert.ok(p('facil') > p('medio') && p('medio') > p('dificil'));
  const ancho = (dif) => {
    const [a, b] = zonaFritura(partida(5, { dificultad: dif }));
    return b - a;
  };
  assert.ok(ancho('facil') > ancho('medio') && ancho('medio') > ancho('dificil'));
  assert.equal(lugaresFreidora(partida(5)), 4);
  assert.equal(lugaresFreidora(partida(5, { mejoras: { freidora6: 1 } })), 6);
});

test('un pedido de punta a punta: llega, pide, se hace perfecto y se entrega con 100', () => {
  const dia = new Dia(partida(4), rng(3));
  const paso = () => dia.update(0.1);
  let vueltas = 0;
  while (!dia.puedeTomar() && vueltas++ < 2000) paso();
  assert.ok(dia.puedeTomar(), 'nadie llegó a la caja');
  const tk = dia.tomarPedido();
  while (!dia.tickets.includes(tk) && vueltas++ < 4000) paso();
  assert.ok(dia.tickets.includes(tk), 'el ticket no quedó colgado');
  // masa y fritura: cada lado se saca en su punto
  for (const spec of tk.pedido.donas) {
    const d = dia.cortar(tk, spec.masa, spec.forma);
    assert.ok(dia.meterAlAceite(d));
    const slot = dia.freidora.indexOf(d);
    while (d.coc[0] < 1) paso();
    assert.equal(dia.tocarEnAceite(slot), 'vuelta');
    while (d.coc[1] < 1) paso();
    assert.equal(dia.tocarEnAceite(slot), 'sacar');
  }
  assert.equal(dia.estadoTicket(tk), 'decorado');
  // decorado perfecto: lo mismo que la dona del ticket
  tk.pedido.donas.forEach((spec, i) => {
    const d = tk.hechas[i];
    const ideal = donaIdeal(spec);
    if (spec.relleno) d.relleno = { id: spec.relleno, cant: 1 };
    if (spec.bano) d.bano = { id: spec.bano, cob: 1 };
    if (spec.hilos) d.hilos[spec.hilos] = 0.4;
    for (const t of spec.toppings) d.tops[t] = 0.9;
    d.piezas = ideal.piezas;
  });
  assert.equal(notaDecorado(tk.pedido, tk.hechas), 100);
  const res = dia.entregar(tk);
  assert.equal(res.notas.masa, 100);
  assert.equal(res.notas.fritura, 100);
  assert.equal(res.notas.decorado, 100);
  assert.ok(res.total >= 95, `total ${res.total}`);
  assert.ok(res.propina > 0);
});
