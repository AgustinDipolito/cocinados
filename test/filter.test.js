// Filtro: saca por los costados el producto elegido (por turnos) y deja seguir derecho al resto. Tiempo simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, PICKS } from '../src/data.js';

const run = (s, seconds) => { for (let i = 0; i < Math.round(seconds / STEP) && !s.over; i++) sim.step(s, STEP); return s; };

function blank() {
  const s = sim.newGame('sandbox', 1);
  s.autoOrders = false; s.orders.length = 0; s.cells.fill(null);
  return s;
}

/**
 * Carne cruda (sale sola) entra por atrás a un filtro en (1, 2) que mira al este y elige `pick`.
 * Costado derecho (sur) y costado izquierdo (norte) terminan en despachos salvo que sides los cambie; cuenta lo que llega a cada uno.
 */
function rig(pick, { front = 'dispatch', right = 'dispatch', left = 'dispatch' } = {}) {
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(0, 2, 'raw'); put(1, 2, 'filter');
  sim.setPick(s, 1, 2, pick);
  if (front) { put(2, 2, 'belt'); put(3, 2, front); }
  if (right) { put(1, 3, 'belt', 1); put(1, 4, right); }
  if (left) { put(1, 1, 'belt', 3); put(1, 0, left); }
  const got = { front: 0, right: 0, left: 0 }, name = { '3,2': 'front', '1,4': 'right', '1,0': 'left' };
  for (let i = 0; i < 600; i++) {
    sim.step(s, STEP);
    for (const e of s.events.splice(0)) if (e.type === 'waste') got[name[`${e.x},${e.y}`]]++;
  }
  return { s, got };
}

test('filtro: arranca eligiendo el primero de PICKS', () => {
  const s = blank();
  sim.place(s, 0, 0, 'filter');
  assert.equal(sim.at(s, 0, 0).pick, PICKS[0]);
});

test('filtro: el elegido sale por los dos costados por turnos y nunca por el frente', () => {
  const { got } = rig('raw');
  assert.equal(got.front, 0);
  assert.ok(got.right >= 12 && Math.abs(got.right - got.left) <= 1, JSON.stringify(got));
});

test('filtro: lo que no es el elegido sale por el frente y nunca por un costado', () => {
  const { got } = rig('bun');
  assert.ok(got.front >= 25, JSON.stringify(got));
  assert.deepEqual([got.right, got.left], [0, 0]);
});

test('filtro: con un costado que no lo recibe, o lleno, va todo al otro', () => {
  let { got } = rig('raw', { right: 'stock' }); // el almacén no recibe carne cruda
  assert.ok(got.left >= 25 && got.front === 0, JSON.stringify(got));
  ({ got } = rig('raw', { left: 'belt' })); // una cinta sin salida: se llena con la primera
  assert.ok(got.right >= 25 && got.front === 0, JSON.stringify(got));
});

test('filtro: con los dos costados sin receptor el elegido espera, no sigue derecho, y se marca sin salida', () => {
  const { s, got } = rig('raw', { right: null, left: null });
  assert.deepEqual(got, { front: 0, right: 0, left: 0 });
  assert.ok(sim.at(s, 1, 2).item && sim.isStuck(s, 1, 2));
});

test('filtro: el que no es elegido con el frente sin receptor espera, no sale de costado, y se marca sin salida', () => {
  const { s, got } = rig('bun', { front: 'stock' });
  assert.deepEqual([got.right, got.left], [0, 0]);
  assert.ok(sim.isStuck(s, 2, 2), 'la cinta del frente apunta a algo que no recibe carne cruda');
  sim.erase(s, 2, 2);
  run(s, 5);
  assert.ok(sim.isStuck(s, 1, 2), 'el filtro sin frente posible');
});

test('filtro: sólo recibe por atrás', () => {
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(1, 0, 'raw', 1); put(1, 1, 'belt', 1); put(1, 2, 'filter'); put(2, 2, 'dispatch'); put(1, 3, 'dispatch');
  run(s, 10);
  assert.equal(s.stats.waste, 0);
  assert.equal(sim.isStuck(s, 1, 1), true);
});

test('setPick: cambia el destino del próximo, no pierde el que lleva, girar lo conserva y una pieza fija no cambia', () => {
  const s = blank();
  sim.place(s, 1, 2, 'filter');
  sim.at(s, 1, 2).item = { id: 5, type: 'bun', d: 0, readyAt: 99 };
  assert.deepEqual(sim.setPick(s, 1, 2, 'bun'), { ok: true });
  assert.equal(sim.setPick(s, 1, 2, 'bun').reason, 'same');
  assert.equal(sim.at(s, 1, 2).item.id, 5);
  sim.place(s, 1, 2, 'filter', 2);
  assert.deepEqual([sim.at(s, 1, 2).pick, sim.at(s, 1, 2).item.id], ['bun', 5]);
  assert.equal(sim.setPick(s, 0, 0, 'bun').reason, 'out', 'ahí no hay filtro');
  sim.at(s, 1, 2).fixed = true;
  assert.equal(sim.setPick(s, 1, 2, 'raw').reason, 'fixed');
  assert.equal(sim.at(s, 1, 2).pick, 'bun');
});

test('filtro: una fuente a demanda detrás de un filtro sólo cuenta las armadoras a las que su producto llega', () => {
  // El pan entra al filtro: si lo elige va por el costado sur a la armadora A; si no, por el frente a la B.
  // El pedido se lo lleva B (empate, la primera en el recorrido).
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(0, 2, 'bun'); put(1, 2, 'filter'); put(2, 2, 'assembly'); put(1, 3, 'belt', 1); put(1, 4, 'assembly');
  sim.setPick(s, 1, 2, 'bun');
  sim.addOrder(s, 'classic', true);
  assert.equal(sim.pendingNeed(s, 'bun'), 1);
  assert.equal(sim.sourceNeed(s, 0, 2), 0, 'el pan elegido sólo llega a A, que no tiene pedido');
  sim.setPick(s, 1, 2, 'raw');
  assert.equal(sim.sourceNeed(s, 0, 2), 1, 'ahora el pan sigue derecho hasta B');
});

test('filtro: una troncal con pan y carne mezclados y dos filtros que los sacan a dos armadoras entrega sin trabarse', () => {
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(0, 3, 'bun'); for (let x = 1; x <= 4; x++) put(x, 3, 'belt'); // la troncal corre al este por y = 3
  put(2, 0, 'raw', 1); put(2, 1, 'grill', 1); put(2, 2, 'stock', 1); // la carne cocida baja a la troncal
  put(5, 3, 'filter'); sim.setPick(s, 5, 3, 'bun'); // el pan va por los costados, una vuelta a cada armadora
  put(5, 2, 'belt'); put(5, 4, 'belt');
  put(6, 3, 'filter'); sim.setPick(s, 6, 3, 'patty'); // la carne, a las dos armadoras por turnos
  put(6, 2, 'assembly'); put(7, 2, 'belt'); put(8, 2, 'dispatch');
  put(6, 4, 'assembly'); put(7, 4, 'belt'); put(8, 4, 'dispatch');
  let asked = 0;
  for (let i = 0; i < 3000; i++) {
    if (i % 60 === 0 && sim.addOrder(s, 'classic', true)) asked++;
    sim.step(s, STEP);
  }
  run(s, 60);
  assert.ok(asked >= 45, `se pidieron ${asked}`);
  assert.deepEqual(s.orders.map(o => `#${o.id} ${o.status}`), [], 'pedidos trabados');
  assert.equal(s.stats.onTime, asked);
  assert.ok(sim.at(s, 6, 2).diag.work > 1 && sim.at(s, 6, 4).diag.work > 1, 'armaron las dos');
});
