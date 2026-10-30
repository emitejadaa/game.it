/**
 * La simulación de un día en el local: clientes que llegan y hacen fila, tickets, donas en cada
 * etapa (cruda, en el aceite, lista), la freidora que sigue cocinando aunque estés en otra estación,
 * y el puntaje cuando entregás un pedido. Sin dibujo: lo usan las estaciones y las pruebas.
 */
import { CLIENTES, DECO, exigenteDelDia, dificultadDe, byId } from './data.js';
import { crearPedido, COCCION, PUNTO, notaMasa, notaFritura, notaDecorado, notaEspera, notaFinal, propina, tolerancia, PACIENCIA } from './orders.js';
import { LUGARES } from './local.js';
import { tiene, zonaFritura, lugaresFreidora } from './mejoras.js';

/** Bonus de la decoración puesta: % de paciencia y fracción extra de propinas. */
export function bonusDeco(save) {
  let paciencia = 0;
  let propinas = 0;
  for (const id of Object.values(save.deco)) {
    const d = byId(DECO, id);
    if (!d) continue;
    paciencia += d.bonus || 0;
    propinas += d.propinas || 0;
  }
  return { paciencia: Math.min(40, paciencia), propinas };
}

let uid = 1;

export class Dia {
  /**
   * save: la partida (día, decoración, clientes conocidos…). rng: para pruebas.
   */
  constructor(save, rng = Math.random) {
    this.save = save;
    this.rng = rng;
    this.n = save.dia;
    this.t = 0;
    this.bonus = bonusDeco(save);
    this.tickets = [];
    this.actores = [];
    this.fila = [];
    this.freidora = new Array(lugaresFreidora(save)).fill(null);
    /** Zona justa de cada lado en la freidora (más ancha con el termómetro). */
    this.punto = zonaFritura(save);
    this.donas = [];
    this.nTicket = 0;
    this.resultados = [];
    this.eventos = [];
    this.exigenteDef = exigenteDelDia(this.n);
    this.lista = this.armarLista();
    this.total = this.lista.length + 1;
    this.llegaron = 0;
    this.exigenteLlego = false;
    this.proxima = 3;
    this.primerPedido = save.dia === 1 && !save.stats?.atendidos;
  }

  /** Quiénes vienen hoy: primero los nuevos, después conocidos al azar. */
  armarLista() {
    const nuevos = CLIENTES.filter((c) => c.day === this.n);
    const viejos = CLIENTES.filter((c) => c.day < this.n);
    const cant = dificultadDe(this.save).clientes(this.n);
    const lista = [...nuevos];
    const pool = [...viejos];
    while (lista.length < cant && pool.length) lista.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    // los nuevos no siempre primero: se mezclan, pero el primero del día 1 es siempre Tito
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    if (this.n === 1) lista.sort((a, b) => (a.id === 'tito' ? -1 : b.id === 'tito' ? 1 : 0));
    return lista.slice(0, cant);
  }

  emit(tipo, datos = {}) {
    this.eventos.push({ tipo, ...datos });
  }

  // ---------------------------------------------------------------- clientes

  pacienciaDe(def) {
    return (PACIENCIA[def.id] || 1) * (1 + this.bonus.paciencia / 100) * (tiene(this.save, 'turnos') ? 1.1 : 1) * dificultadDe(this.save).paciencia;
  }

  /** Separación entre llegadas: más tranquilo los primeros días. */
  espacio() {
    const base = this.n === 1 ? 26 : this.n <= 7 ? 22 : this.n <= 14 ? 19 : 16;
    return (base + this.rng() * 9) * dificultadDe(this.save).espacio;
  }

  llegar(def, exigente = false) {
    const a = {
      id: uid++,
      def,
      exigente,
      estado: 'fila',
      x: LUGARES.puerta.x,
      y: LUGARES.puerta.y,
      tx: LUGARES.puerta.x,
      ty: LUGARES.puerta.y,
      fase: 0,
      t0: this.t,
      animo: 'feliz',
      ticket: null,
      asiento: -1,
      burbuja: null,
    };
    this.actores.push(a);
    this.fila.push(a);
    this.reubicarFila();
    this.emit('llega', { actor: a });
    if (exigente) this.emit('exigente', { actor: a });
    return a;
  }

  reubicarFila() {
    this.fila.forEach((a, i) => {
      const p = i === 0 ? LUGARES.caja : LUGARES.fila[Math.min(i - 1, LUGARES.fila.length - 1)];
      a.tx = p.x - (i > 3 ? (i - 3) * 60 : 0);
      a.ty = p.y;
    });
  }

  /** El primero de la fila está parado en la caja, listo para pedir. */
  puedeTomar() {
    const a = this.fila[0];
    return a && a.estado === 'fila' && Math.hypot(a.x - LUGARES.caja.x, a.y - LUGARES.caja.y) < 4;
  }

  /** Tomar el pedido del primero de la fila: crea el ticket. Devuelve el ticket. */
  tomarPedido() {
    if (!this.puedeTomar()) return null;
    const a = this.fila[0];
    const def = a.def;
    const ex = a.exigente ? def : null;
    const pedido = crearPedido(def, this.n, this.rng, { exigente: !!ex, simple: this.primerPedido });
    this.primerPedido = false;
    a.estado = 'pidiendo';
    a.tPedido = a.tPedidoTotal = tiene(this.save, 'libreta') ? 1.3 : 2.6;
    const tk = { id: uid++, n: ++this.nTicket, actor: a, cliente: def, exigente: ex, pedido, hechas: pedido.donas.map(() => null), creado: this.t, entregado: false };
    a.ticket = tk;
    this.emit('pide', { actor: a, ticket: tk });
    return tk;
  }

  asientoLibre() {
    const ocupados = new Set(this.actores.filter((a) => a.asiento >= 0 && a.estado !== 'fuera').map((a) => a.asiento));
    for (let i = 0; i < LUGARES.asientos.length; i++) if (!ocupados.has(i)) return i;
    return -1;
  }

  // ---------------------------------------------------------------- donas

  /** Nueva dona cruda para un ticket (la corta la estación de masa). */
  cortar(tk, masa, forma) {
    // va al primer lugar vacío que coincida; si ninguno coincide, al primer lugar vacío
    let i = tk.pedido.donas.findIndex((s, k) => !tk.hechas[k] && s.masa === masa && s.forma === forma);
    if (i < 0) i = tk.hechas.findIndex((h) => !h);
    if (i < 0) return null;
    const d = { id: uid++, ticket: tk, slot: i, masa, forma, coc: [0, 0], lado: 0, etapa: 'cruda', relleno: null, bano: null, lineas: [], parts: [], piezas: [], hilos: {}, tops: {}, cells: {} };
    tk.hechas[i] = d;
    this.donas.push(d);
    return d;
  }

  /** Tirar una dona (quemada, mal hecha…): el lugar del ticket queda vacío y hay que hacerla de nuevo. */
  tirar(d) {
    if (!d) return;
    const k = this.freidora.indexOf(d);
    if (k >= 0) this.freidora[k] = null;
    if (d.ticket.hechas[d.slot] === d) d.ticket.hechas[d.slot] = null;
    d.etapa = 'tirada';
    this.donas = this.donas.filter((x) => x !== d);
    this.emit('tirar');
  }

  crudas() {
    return this.donas.filter((d) => d.etapa === 'cruda');
  }

  listas() {
    return this.donas.filter((d) => d.etapa === 'lista');
  }

  meterAlAceite(d, slot = this.freidora.indexOf(null)) {
    if (!d || d.etapa !== 'cruda' || slot < 0 || this.freidora[slot]) return false;
    this.freidora[slot] = d;
    d.etapa = 'aceite';
    d.lado = 0;
    d.avisado = false;
    this.emit('aceite');
    return true;
  }

  /** Tocar una dona en el aceite: la primera vez se da vuelta; la segunda, sale. */
  tocarEnAceite(slot) {
    const d = this.freidora[slot];
    if (!d) return null;
    if (d.lado === 0) {
      d.lado = 1;
      d.avisado = false;
      d.giro = 1;
      this.emit('vuelta');
      return 'vuelta';
    }
    this.freidora[slot] = null;
    d.etapa = 'lista';
    this.emit('sacar', { dona: d });
    return 'sacar';
  }

  // ---------------------------------------------------------------- tickets

  /** Qué le falta a un ticket: 'masa' | 'fritura' | 'decorado'. */
  estadoTicket(tk) {
    if (tk.hechas.some((h) => !h)) return 'masa';
    if (tk.hechas.some((h) => h.etapa !== 'lista')) return 'fritura';
    return 'decorado';
  }

  pendientes() {
    return this.tickets.filter((t) => !t.entregado);
  }

  /** Entregar el pedido: calcula el puntaje y la propina. Devuelve el resultado. */
  entregar(tk) {
    if (tk.entregado || this.estadoTicket(tk) !== 'decorado') return null;
    tk.entregado = true;
    const a = tk.actor;
    const espera = this.t - a.t0;
    const ex = tk.exigente;
    const notas = {
      espera: notaEspera(espera, tk.pedido.donas.length, this.pacienciaDe(a.def), !!ex),
      masa: notaMasa(tk.pedido, tk.hechas),
      fritura: notaFritura(tk.pedido, tk.hechas, this.punto),
      decorado: notaDecorado(tk.pedido, tk.hechas),
    };
    const fin = notaFinal(notas, ex, this.n);
    const res = {
      ticket: tk,
      actor: a,
      crudas: notas,
      notas: fin.notas,
      total: fin.total,
      propina: Math.round(propina(fin.total, tk.pedido.donas.length, !!ex, this.bonus.propinas) * dificultadDe(this.save).propinas),
      espera,
    };
    this.resultados.push(res);
    for (const d of tk.hechas) this.donas = this.donas.filter((x) => x !== d);
    a.estado = 'retira';
    a.tx = LUGARES.retiro.x;
    a.ty = LUGARES.retiro.y;
    a.asiento = -1;
    this.emit('entrega', { resultado: res });
    return res;
  }

  /** Después del cartel de puntaje, el cliente se va. */
  despedir(a) {
    a.estado = 'sale';
    a.tx = LUGARES.puerta.x;
    a.ty = LUGARES.puerta.y;
  }

  get terminado() {
    return this.exigenteLlego && this.llegaron >= this.lista.length && this.actores.every((a) => a.estado === 'fuera' || a.estado === 'sale') && this.resultados.length >= this.total;
  }

  // ---------------------------------------------------------------- tiempo

  update(dt) {
    this.t += dt;
    // llegadas: si hay lugar en la fila y llegó la hora
    if (this.llegaron < this.lista.length) {
      if (this.t >= this.proxima && this.fila.length < 4) {
        this.llegar(this.lista[this.llegaron++]);
        this.proxima = this.t + this.espacio();
      }
    } else if (!this.exigenteLlego) {
      // el exigente es el último: cuando ya pidieron todos y no hay demasiado pendiente
      const sinPedir = this.fila.length;
      if (!sinPedir && this.pendientes().length <= 2 && this.t >= this.proxima) {
        this.exigenteLlego = true;
        this.llegar(this.exigenteDef, true);
      }
    }
    // clientes
    for (const a of this.actores) {
      if (a.estado === 'fuera') continue;
      // caminar: arrancan y frenan de a poco (nada de moverse a velocidad fija)
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      const vmax = 240;
      if (d > 1.5) {
        const objetivo = Math.min(vmax, 50 + d * 3);
        const v = a.v || 0;
        a.v = v + Math.sign(objetivo - v) * Math.min(Math.abs(objetivo - v), 700 * dt);
        const paso = Math.min(d, a.v * dt);
        a.x += (dx / d) * paso;
        a.y += (dy / d) * paso;
        a.fase += dt * (0.45 + 0.55 * (a.v / vmax));
        a.camina = true;
        if (Math.abs(dx) > 2) a.dir = Math.sign(dx);
      } else {
        a.x = a.tx;
        a.y = a.ty;
        a.v = 0;
        a.camina = false;
      }
      if (a.estado === 'pidiendo') {
        a.tPedido -= dt;
        if (a.tPedido <= 0) {
          a.estado = 'esperando';
          this.tickets.push(a.ticket);
          this.fila.shift();
          this.reubicarFila();
          a.asiento = this.asientoLibre();
          const p = a.asiento >= 0 ? LUGARES.asientos[a.asiento] : { x: 560 + (a.id % 3) * 30, y: 520 };
          a.tx = p.x;
          a.ty = p.y;
          this.emit('ticket', { ticket: a.ticket });
        }
      }
      if (a.estado === 'sale' && d <= 1) a.estado = 'fuera';
      // humor según cuánto espera
      if (a.estado === 'fila' || a.estado === 'esperando') {
        const tol = tolerancia(a.ticket ? a.ticket.pedido.donas.length : 1, this.pacienciaDe(a.def));
        const e = this.t - a.t0;
        a.animo = e < tol ? 'feliz' : e < tol + 55 ? 'normal' : e < tol + 110 ? 'molesto' : 'enojado';
      }
    }
    // freidora: el lado de abajo se sigue cocinando
    this.freidora.forEach((d, i) => {
      if (!d) return;
      d.coc[d.lado] += COCCION * dt;
      if (d.giro) d.giro = Math.max(0, d.giro - dt * 3);
      if (!d.avisado && d.coc[d.lado] >= this.punto[0]) {
        d.avisado = true;
        this.emit('punto', { slot: i, lado: d.lado });
      }
      if (!d.quemaAviso && d.coc[d.lado] >= 1.45) {
        d.quemaAviso = true;
        this.emit('quema', { slot: i });
      }
    });
  }

  /** ¿Hay que mirar la freidora? (algo en su punto o pasándose) */
  freidoraAvisa() {
    return this.freidora.some((d) => d && d.coc[d.lado] >= this.punto[0]);
  }
}
