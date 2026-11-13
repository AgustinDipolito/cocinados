// Tope de piezas por nivel y ritmo sin techo: sin ellos, dos islas de siete celdas jugaban para siempre.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, LIMITS, CAREER_LOTS, ORDERS, orderInterval } from '../src/data.js';

/** El Clásico con plata de sobra. */
function rich(level = 1) { const s = sim.newGame('career', 1); s.money = 1e6; s.level = level; return s; }
const freeCells = s => s.cells.flatMap((c, i) => (c === null ? [[i % s.W, Math.floor(i / s.W)]] : []));

/** Una isla de siete celdas sin cintas en la fila y, sobre el Clásico vacío. */
const ISLAND = [['raw', 0, 0, 0], ['grill', 1, 0, 0], ['stock', 2, 0, 0], ['assembly', 3, 0, 0], ['dispatch', 4, 0, 0], ['bun', 3, -1, 1], ['cheese', 3, 1, 3]];
function island(up = false, seed = 1) {
  const s = sim.newGame('career', seed);
  s.money = 1e6;
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) sim.erase(s, x, y);
  for (const [k, x, y, d] of ISLAND) assert.deepEqual(sim.place(s, x, 1 + y, k, d), { ok: true }, k);
  if (up) { sim.upgrade(s, 1, 1); sim.upgrade(s, 3, 1); }
  return s;
}

test('nivel 1: no entra una segunda fuente de carne, ni un segundo despacho, ni una segunda parrilla, y la plata no cambia', () => {
  const s = rich();
  for (const kind of ['raw', 'dispatch', 'grill', 'stock', 'assembly', 'bun']) {
    assert.deepEqual(sim.place(s, 0, 5, kind, 0), { ok: false, reason: 'limit' }, kind);
    assert.equal(sim.at(s, 0, 5), null);
  }
  assert.equal(s.money, 1e6);
  s.money = 0; // el tope se mira antes que la plata
  assert.equal(sim.place(s, 0, 5, 'grill', 0).reason, 'limit');
});

test('en el nivel de cada lista entra una más y no dos', () => {
  for (const [kind, levels] of Object.entries(LIMITS)) levels.forEach((level, i) => {
    const s = rich(level);
    const free = freeCells(s);
    let r;
    while (sim.countOf(s, kind) < i + 5 && (r = sim.place(s, ...free.shift(), kind, 0)).ok);
    assert.equal(r.reason, 'limit', `${kind} en el nivel ${level}`);
    assert.equal(sim.countOf(s, kind), i + 1, `${kind} en el nivel ${level}`);
    if (i) { s.level = level - 1; assert.equal(sim.limitOf(s, kind), i, `${kind} un nivel antes`); }
  });
});

test('cintas, divisor, filtro y puente no tienen tope', () => {
  const s = rich(), free = freeCells(s);
  for (const kind of ['belt', 'splitter', 'filter', 'bridge']) {
    for (let k = 0; k < 8; k++) assert.equal(sim.place(s, ...free.shift(), kind, 0).ok, true, kind);
    assert.deepEqual([sim.limitOf(s, kind), sim.nextLimit(s, kind)], [Infinity, null]);
  }
});

test('girar no se frena, ni con el tope lleno ni pasado', () => {
  const s = rich();
  assert.deepEqual(sim.place(s, 3, 1, 'grill', 1), { ok: true });
  s.level = LIMITS.grill[1]; sim.place(s, 0, 5, 'grill', 0); s.level = 1; // dos parrillas en el nivel 1
  assert.deepEqual(sim.place(s, 0, 5, 'grill', 2), { ok: true });
});

test('reemplazar cuenta para el tope de la pieza nueva, no para el de la vieja', () => {
  const s = rich();
  assert.equal(sim.place(s, 3, 1, 'stock', 0).reason, 'limit'); // ya hay un almacén
  assert.equal(sim.at(s, 3, 1).kind, 'grill');
  assert.deepEqual(sim.place(s, 3, 1, 'belt', 0), { ok: true }); // la parrilla se fue: otra entra en otro lado
  assert.deepEqual(sim.place(s, 0, 5, 'grill', 0), { ok: true });
  const t = rich(LIMITS.stock[1]); // con lugar para un segundo almacén, reemplazar la parrilla por uno anda
  assert.deepEqual(sim.place(t, 3, 1, 'stock', 0), { ok: true });
  assert.deepEqual([sim.countOf(t, 'stock'), sim.countOf(t, 'grill')], [2, 0]);
});

test('deshacer devuelve lo que había sin mirar el tope', () => {
  const s = rich();
  sim.undoMark(s); sim.place(s, 3, 1, 'belt', 0); // la parrilla se va
  sim.undoMark(s); sim.place(s, 0, 5, 'grill', 0); // y entra otra en otro lado
  s.undo.pop(); // la nueva queda fuera del deshacer: lo que sigue devuelve la vieja con el tope ya lleno
  assert.deepEqual(sim.undo(s), { ok: true, n: 1 });
  assert.deepEqual([sim.at(s, 3, 1).kind, sim.countOf(s, 'grill'), sim.limitOf(s, 'grill')], ['grill', 2, 1]);
});

test('limitOf y nextLimit según el nivel y el modo', () => {
  const at = (level, kind, mode = 'career') => { const s = sim.newGame(mode, 1); s.level = level; return [sim.limitOf(s, kind), sim.nextLimit(s, kind)]; };
  assert.deepEqual(at(1, 'raw'), [1, 7]);
  assert.deepEqual(at(6, 'raw'), [1, 7]);
  assert.deepEqual(at(7, 'raw'), [2, 12]);
  assert.deepEqual(at(16, 'raw'), [4, null]);
  assert.deepEqual(at(1, 'cheese'), [1, 11]);
  assert.deepEqual(at(5, 'grill'), [2, 6]);
  assert.deepEqual(at(15, 'grill'), [6, null]);
  assert.deepEqual(at(40, 'assembly'), [6, null]);
  assert.deepEqual(at(1, 'dispatch'), [1, null]);
  assert.deepEqual(at(30, 'dispatch'), [1, null]);
  assert.deepEqual(at(1, 'belt'), [Infinity, null]);
  assert.deepEqual(at(1, 'grill', 'sandbox'), [Infinity, null]);
  assert.deepEqual(at(1, 'dispatch', 'sandbox'), [Infinity, null]);
  const p = sim.newGame('puzzle', 1, 'pzLine');
  assert.deepEqual([sim.limitOf(p, 'raw'), sim.nextLimit(p, 'raw')], [Infinity, null]);
  assert.equal(sim.countOf(rich(), 'belt'), 12);
});

test('en un desafío y en Modo libre se puede poner de todo', () => {
  for (const s of [sim.newGame('sandbox', 1), sim.newGame('puzzle', 1, 'pzHall')]) {
    s.money = 1e6;
    const free = freeCells(s);
    for (const kind of ['raw', 'dispatch', 'grill', 'assembly']) for (let k = 0; k < 3; k++) assert.equal(sim.place(s, ...free.shift(), kind, 0).ok, true, `${s.mode} ${kind}`);
  }
});

test('una partida guardada con más piezas que el tope sigue jugando y no deja sumar otra', () => {
  const s = rich();
  s.level = LIMITS.raw[2]; sim.place(s, 0, 5, 'raw', 0); sim.place(s, 1, 5, 'raw', 0); s.level = 1; // tres fuentes de carne en el nivel 1
  const r = sim.deserialize(sim.serialize(s));
  assert.equal(sim.countOf(r, 'raw'), 3);
  for (let i = 0; i < 600 && !r.over; i++) sim.step(r, STEP);
  assert.ok(r.stats.onTime >= 1, 'la cocina siguió entregando');
  assert.equal(sim.countOf(r, 'raw'), 3, 'lo que estaba, quedó');
  assert.equal(sim.place(r, 2, 5, 'raw', 0).reason, 'limit');
  sim.erase(r, 0, 5);
  assert.equal(sim.place(r, 0, 5, 'raw', 0).reason, 'limit', 'borrar una de tres no hace lugar');
});

test('el problema: en Carrera ya no se arma la segunda isla', () => {
  const s = island();
  assert.deepEqual(sim.place(s, 6, 1, 'raw', 0), { ok: false, reason: 'limit' });
  assert.deepEqual(sim.place(s, 10, 1, 'dispatch', 0), { ok: false, reason: 'limit' });
});

test('las cocinas iniciales de Carrera (y de La sorpresa con cualquier semilla) cumplen el tope del nivel 1', () => {
  const games = [...CAREER_LOTS.map(k => sim.newGame('career', 1, k))];
  for (let seed = 1; seed <= 60; seed++) games.push(sim.newGame('career', seed, 'random'));
  for (const s of games) for (const kind of Object.keys(LIMITS)) {
    assert.ok(sim.countOf(s, kind) <= sim.limitOf(s, kind), `${s.lot} ${s.lotSeed ?? ''}: ${kind}`);
  }
});

// ---------- ritmo ----------

test('ritmo: los niveles 1 a 5 son los de siempre; desde el 6 baja el 12 % por nivel sin pasar de ORDERS.min', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(orderInterval), [13, 10.5, 8, 5.5, 3.5]);
  for (let l = 6; l < 80; l++) {
    const a = orderInterval(l - 1), b = orderInterval(l);
    assert.ok(b >= ORDERS.min, `nivel ${l}`);
    if (a * 0.88 >= ORDERS.min) assert.ok(Math.abs(b - a * 0.88) < 1e-9, `nivel ${l}: ${b} contra ${a}`);
    else assert.equal(b, ORDERS.min);
  }
  assert.ok(orderInterval(6) < 3.5, 'pasado el nivel 5 sigue apretando');
  assert.equal(orderInterval(200), ORDERS.min);
});

test('ritmo: la mejor isla que el tope deja (parrilla y armadora mejoradas) termina cerrando, y levelup trae lo que se habilita', () => {
  const s = island(true);
  const more = {};
  while (!s.over && s.time < 20 * 60) { // medido: cierra cerca de los 8 minutos, en el nivel 10
    sim.step(s, STEP);
    for (const e of s.events.splice(0)) if (e.type === 'levelup') more[e.level] = e.more;
  }
  assert.ok(s.over, `a los ${(s.time / 60).toFixed(1)} minutos sigue abierta, en el nivel ${s.level}`);
  assert.ok(s.level >= 9, `cerró en el nivel ${s.level}`);
  assert.deepEqual(more[2], []);
  assert.deepEqual(more[3], ['grill', 'stock']);
  assert.deepEqual(more[4], ['assembly']);
  assert.deepEqual(more[5], []);
  assert.deepEqual(more[6], ['grill', 'stock']);
  assert.deepEqual(more[7], ['raw', 'assembly']);
  assert.deepEqual(more[9], ['bun', 'grill', 'stock']);
});

test('ritmo: con intervalos cortos llega como mucho un cliente por paso y no se pierden llegadas', () => {
  const s = rich(40); // intervalo en ORDERS.min
  s.orders.length = 0;
  let arrivals = 0;
  const steps = 600;
  for (let i = 0; i < steps && !s.over; i++) {
    const before = s.orderId;
    sim.step(s, STEP);
    arrivals += s.events.splice(0).filter(e => e.type === 'order' || e.type === 'turnedAway').length;
    assert.ok(s.orderId - before <= 2, 'más de una llegada por paso'); // un grupo trae dos de una vez
    assert.ok(s.autoClock < orderInterval(s.level) + STEP, 'el reloj de llegadas acumula deuda');
    if (s.over) break;
  }
  assert.ok(arrivals > 0);
});
