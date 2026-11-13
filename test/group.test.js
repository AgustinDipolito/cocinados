// Grupos: desde GROUP.level, a veces llegan dos clientes juntos; propina si los dos salen a tiempo. Semilla fija.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, GROUP, QUEUE_MAX, RECIPES, GRACE } from '../src/data.js';

/** Carrera en el nivel dado; la cola se vacía después de cada paso para que siempre haya lugar. Cuenta llegadas. */
function arrivals(level, seconds, seed = 3, keep = 0) {
  const s = sim.newGame('career', seed);
  s.level = level; s.orders.length = 0; s.events.length = 0; // fuera el pedido inicial: cuenta sólo las llegadas
  const steps = []; // por paso con llegadas: los group de los pedidos que llegaron
  for (let i = 0; i < Math.round(seconds / STEP) && !s.over; i++) {
    while (s.orders.length < keep) s.orders.push({ id: -1, recipeKey: 'classic', createdAt: s.time, due: s.time + 1e9, status: 'transit', group: null });
    sim.step(s, STEP);
    const got = s.events.splice(0).filter(e => e.type === 'order');
    if (got.length) steps.push(got);
    s.orders.length = 0;
  }
  return { s, steps };
}

test('grupos: bajo GROUP.level no hay grupos y el azar es el de siempre', () => {
  const { s, steps } = arrivals(GROUP.level - 1, 2000);
  assert.ok(steps.length > 100);
  assert.equal(s.seed, (3 + steps.length * 0x6D2B79F5) | 0, 'una sola tirada por llegada, la de la receta');
  assert.ok(steps.every(g => g.length === 1 && g[0].group === null));
  // una partida de nivel 1 a 3 con y sin grupos posibles es la misma hasta llegar al nivel de los grupos
  const was = GROUP.level, play = () => { const s = sim.newGame('career', 7); while (s.level < was && !s.over) sim.step(s, STEP); return sim.serialize(s); };
  const a = play();
  GROUP.level = 99;
  try { assert.equal(play(), a); } finally { GROUP.level = was; }
});

test('grupos: desde el nivel llegan dos con el mismo group en el mismo paso, cerca de GROUP.chance de las veces', () => {
  const { steps } = arrivals(5, 3000);
  const pairs = steps.filter(g => g.length === 2);
  assert.ok(steps.every(g => g.length <= 2));
  for (const [a, b] of pairs) assert.deepEqual([a.group, b.group, b.id], [a.id, a.id, a.id + 1]);
  assert.ok(steps.filter(g => g.length === 1).every(g => g[0].group === null));
  const share = pairs.length / steps.length;
  assert.ok(steps.length > 600 && Math.abs(share - GROUP.chance) < 0.05, `${pairs.length} grupos en ${steps.length} llegadas`);
});

test('grupos: después de un grupo se saltea la llegada siguiente, así el ritmo de pedidos no sube', () => {
  const count = () => arrivals(5, 3000).steps.reduce((n, g) => n + g.length, 0);
  const withGroups = count(), was = GROUP.chance;
  GROUP.chance = 0;
  let without;
  try { without = count(); } finally { GROUP.chance = was; }
  assert.ok(Math.abs(withGroups / without - 1) < 0.06, `${withGroups} pedidos con grupos y ${without} sin`);
});

test('grupos: con la cola a un lugar del tope no se forma grupo', () => {
  const { steps } = arrivals(5, 1500, 3, QUEUE_MAX - 1);
  assert.ok(steps.length > 200);
  assert.ok(steps.every(g => g.length === 1 && g[0].group === null));
});

/** Carrera con dos pedidos de grupo listos para entregar por la cinta (9, 3) del despacho (10, 3). */
function pair() {
  const s = sim.newGame('career', 1);
  s.level = GROUP.level; s.orders.length = 0; s.autoOrders = false; s.autoClock = -1e9; // nadie más llega
  sim.addOrder(s, 'classic', true, 50); sim.addOrder(s, 'classic', true, 50);
  for (const o of s.orders) o.status = 'transit'; // la cocina no los arma: los entrega la prueba
  const deliver = o => { sim.at(s, 9, 3).item = { id: 900 + o.id, type: 'burger', orderId: o.id, recipeKey: 'classic', d: 0, readyAt: 0 }; for (let i = 0; i < 3; i++) sim.step(s, STEP); };
  return { s, deliver, a: s.orders[0], b: s.orders[1] };
}

test('grupos: propina exacta, una vez, cuando los dos salen a tiempo', () => {
  const { s, deliver, a, b } = pair(), money = s.money, earned = s.stats.earned;
  assert.deepEqual([a.group, b.group], [50, 50]);
  deliver(a);
  assert.ok(!s.events.some(e => e.type === 'tip'));
  deliver(b);
  assert.deepEqual(s.events.filter(e => e.type === 'tip'), [{ type: 'tip', x: 10, y: 3, amount: GROUP.tip }]);
  assert.equal(s.money, money + 2 * RECIPES.classic.price + GROUP.tip);
  assert.equal(s.stats.earned, earned + 2 * RECIPES.classic.price + GROUP.tip);
  assert.deepEqual(s.tips, {});
});

test('grupos: sin propina si uno sale tarde o se vence', () => {
  let { s, deliver, a, b } = pair();
  a.due = s.time - 1; // el primero sale tarde
  deliver(a); deliver(b);
  assert.equal(s.stats.late, 1);
  assert.ok(!s.events.some(e => e.type === 'tip'));
  ({ s, deliver, a, b } = pair());
  b.due = s.time - GRACE - 1; // el segundo se vence antes de que salga el primero
  sim.step(s, STEP);
  assert.equal(s.stats.expired, 1);
  deliver(a);
  assert.ok(!s.events.some(e => e.type === 'tip'));
  assert.deepEqual(s.tips, {});
});

test('grupos: guardar y volver conserva group', () => {
  const { s } = pair();
  const r = sim.deserialize(sim.serialize(s));
  assert.deepEqual(r.orders.map(o => o.group), [50, 50]);
});
