// Pruebas de la fila de clientes (src/crowd.js): es vista, pero decide quién se dibuja, dónde y con qué marca.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { CROWD, orderRisk, curb, newCrowd, stepCrowd } from '../src/crowd.js';
import { STEP, QUEUE_MAX } from '../src/data.js';

const C = curb({ W: 12, H: 7 });
const order = (id, createdAt = 0, due = 45) => ({ id, recipeKey: 'classic', createdAt, due, status: 'pending' });
const queued = list => list.filter(p => p.queued);
/** Corre la fila con cuadros de 0,1 s hasta que se cumpla until, con tope. */
function settle(crowd, orders, until, time = 0) {
  let list;
  for (let i = 0; i < 400; i++) if (until(list = stepCrowd(crowd, orders, [], time, 0.1, C, false))) return list;
  assert.fail('la fila no llegó a la condición');
}

test('fila: el estado de la marca es el de la tarjeta (a tiempo, por vencer con el 30 % del plazo, vencido)', () => {
  const o = order(1, 0, 100);
  assert.equal(orderRisk(o, 0), '');
  assert.equal(orderRisk(o, 69), '');
  assert.equal(orderRisk(o, 71), 'soon');
  assert.equal(orderRisk(o, 100), 'soon');
  assert.equal(orderRisk(o, 100.1), 'late');
});

test('fila: una persona por pedido, en orden de llegada desde la cabeza, y al continuar ya están en su lugar', () => {
  const orders = [order(4), order(7, 30, 75), order(9, 40, 85)], crowd = newCrowd();
  const list = stepCrowd(crowd, orders, [], 64, 0.016, C, false);
  assert.deepEqual(list.map(p => [p.key, p.x, p.z, p.queued, p.walking]), [
    [4, C.headX, C.z, true, false], [7, C.headX - CROWD.gap, C.z, true, false], [9, C.headX - 2 * CROWD.gap, C.z, true, false]]);
  assert.deepEqual(list.map(p => p.mark), ['late', 'soon', '']);
});

test('fila: el que llega camina desde el costado hasta el final; el que cobra se va por el otro lado, sin enojo', () => {
  const crowd = newCrowd(), orders = [order(1)];
  stepCrowd(crowd, orders, [], 0, 0.016, C, false);
  orders.push(order(2, 1));
  let p = stepCrowd(crowd, orders, [], 1, 0.1, C, false).find(p => p.key === 2);
  assert.ok(p.walking && p.x < C.headX - CROWD.gap && p.x < C.enterX + 1, `apareció en ${p.x}`);
  assert.equal(p.heading, Math.PI / 2);
  settle(crowd, orders, l => l.find(p => p.key === 2 && !p.walking));
  orders.shift();
  p = stepCrowd(crowd, orders, [{ type: 'delivered', id: 1, x: 10, y: 3, amount: 24, late: false }], 2, 0.1, C, false).find(p => p.key === 1);
  assert.deepEqual([p.queued, p.mark, p.bag, p.walking, p.heading, p.x], [false, null, false, false, Math.PI, C.headX]);
  assert.deepEqual([p.grab.x, p.grab.y], [10, 3], 'la bolsa sale del despacho que entregó');
  let k = p.grab.k, waited = 0.1;
  const next = stepCrowd(crowd, orders, [], 2, 0.1, C, false).find(p => p.key === 2);
  assert.ok(next.walking && next.tx === C.headX, 'el de atrás no avanza a la cabeza mientras el que cobró espera');
  waited += 0.1;
  for (p = crowd.people.get(1); p.grab; waited += 0.1) {
    assert.ok(p.grab.k >= k && p.x === C.headX && !p.walking, 'mientras espera la bolsa no camina y la bolsa avanza');
    k = p.grab.k;
    p = stepCrowd(crowd, orders, [], 2, 0.1, C, false).find(p => p.key === 1);
  }
  assert.ok(k > 0.8 && Math.abs(waited - CROWD.grab) < 0.15, `esperó ${waited.toFixed(2)} s con k ${k}`);
  assert.deepEqual([p.bag, p.grab, p.tx, p.mark, p.leaving], [true, null, C.leaveX, null, true], 'sale con la bolsa por el lado de la caja');
  const end = settle(crowd, orders, l => !l.some(p => p.key === 1));
  assert.deepEqual(end.map(p => [p.key, p.x, p.queued]), [[2, C.headX, true]]);
});

test('fila: al vencer se va enojado por donde vino; sin evento (otra partida) se borra en el acto', () => {
  const crowd = newCrowd(), orders = [order(1), order(2), order(3)];
  stepCrowd(crowd, orders, [], 0, 0.016, C, false);
  orders.splice(1, 1);
  let list = stepCrowd(crowd, orders, [{ type: 'expired', id: 2 }], 70, 0.1, C, false);
  const p = list.find(p => p.key === 2);
  assert.deepEqual([p.queued, p.mark, p.tx, p.tz, p.bag, p.grab], [false, 'angry', C.enterX, C.lane, false, null], 'el enojado se va sin bolsa');
  orders.pop();
  list = stepCrowd(crowd, orders, [], 70, 0.1, C, false);
  assert.ok(!list.some(p => p.key === 3), 'un pedido que se fue sin evento sigue dibujado');
  assert.deepEqual(queued(list).map(p => p.key), [1]);
  list = settle(crowd, orders, l => !l.some(p => p.key === 2), 70);
  assert.deepEqual(list.map(p => p.key), [1]);
});

test('fila: con la cola llena, el que llega mira la fila y se vuelve enojado, sin ocupar un lugar', () => {
  const crowd = newCrowd(), orders = Array.from({ length: QUEUE_MAX }, (_, i) => order(i + 1));
  stepCrowd(crowd, orders, [], 0, 0.016, C, false);
  let list = stepCrowd(crowd, orders, [{ type: 'turnedAway' }], 0, 0.016, C, false);
  const v = list.find(p => !p.queued);
  assert.ok(v, 'el que encontró la cola llena no aparece');
  assert.equal(queued(list).length, QUEUE_MAX);
  assert.equal(v.tx, C.headX - QUEUE_MAX * CROWD.gap);
  assert.deepEqual([v.mark, v.bag, v.grab], [null, false, null]);
  list = settle(crowd, orders, l => l.find(p => p.key === v.key)?.mark === 'angry');
  assert.equal(list.find(p => p.key === v.key).tx, C.enterX);
  list = settle(crowd, orders, l => !l.some(p => p.key === v.key));
  assert.equal(list.length, QUEUE_MAX);
});

test('fila: con movimiento reducido nadie camina, aparecen y desaparecen en el acto', () => {
  const crowd = newCrowd(), orders = [order(1)];
  stepCrowd(crowd, orders, [], 0, 0.016, C, true);
  orders.push(order(2, 1));
  let list = stepCrowd(crowd, orders, [{ type: 'turnedAway' }], 1, 0.016, C, true);
  assert.deepEqual(list.map(p => [p.key, p.x, p.walking]), [[1, C.headX, false], [2, C.headX - CROWD.gap, false]]);
  orders.shift();
  list = stepCrowd(crowd, orders, [{ type: 'delivered', id: 1 }], 2, 0.016, C, true);
  assert.deepEqual(list.map(p => [p.key, p.x, p.walking]), [[2, C.headX, false]]);
});

test('fila: jugando una partida, la fila es siempre la cola de pedidos, y cada salida lleva su motivo', () => {
  const s = sim.newGame('career', 3), crowd = newCrowd(), seen = { paid: 0, angry: 0, visitor: 0 };
  let removed = 0;
  for (let i = 0; i < 9000 && !s.over; i++) {
    if (i === 1500) sim.erase(s, 10, 3); // sin despacho: los pedidos vencen y la cola se llena
    sim.step(s, STEP);
    const events = s.events.splice(0), before = new Set(crowd.people.keys());
    const list = stepCrowd(crowd, s.orders, events, s.time, STEP, curb(s), false);
    assert.deepEqual(queued(list).map(p => p.key), s.orders.map(o => o.id), `a los ${s.time.toFixed(1)} s`);
    for (const p of list) {
      if (!before.has(p.key) && !p.queued) seen.visitor++;
      if (before.has(p.key) && !p.queued && p.leaving && p.tx === curb(s).leaveX && p.mark === null && p.bag) seen.paid++;
      if (p.mark === 'angry' && typeof p.key === 'number') seen.angry++;
      assert.ok(!(p.mark === 'angry' && (p.bag || p.grab)), 'un enojado con bolsa');
    }
    removed += [...before].filter(k => !crowd.people.has(k)).length;
  }
  assert.ok(s.over, 'la partida tendría que cerrarse sin despacho');
  assert.ok(s.stats.onTime > 0 && seen.paid > 0, 'nadie se fue cobrado: ¿el evento de entrega dice qué pedido?');
  assert.ok(s.stats.expired > 0 && seen.angry > 0, 'nadie se fue enojado');
  assert.ok(s.stats.turnedAway > 0 && seen.visitor > 0, 'nadie encontró la cola llena');
  assert.ok(removed > 0);
});

test('fila: dos que llegan en el mismo cuadro (un grupo) no nacen encimados: el segundo, un lugar más atrás', () => {
  const crowd = newCrowd(), orders = [order(1)];
  stepCrowd(crowd, orders, [], 0, 0.016, C, false);
  orders.push(order(2, 1), order(3, 1));
  const list = stepCrowd(crowd, orders, [], 1, 0, C, false);
  const x = k => list.find(p => p.key === k).x;
  assert.deepEqual([x(2), x(3)], [C.enterX, C.enterX - CROWD.gap]);
});
