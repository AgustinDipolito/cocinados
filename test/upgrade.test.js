// Etapa 4: mejoras de máquina. Tiempo simulado y semilla fija.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, KINDS, UPGRADES, CAP, START_MONEY, QUEUE_MAX } from '../src/data.js';

const run = (s, seconds, each = () => {}) => {
  for (let i = 0; i < Math.round(seconds / STEP) && !s.over; i++) { each(s); sim.step(s, STEP); }
  return s;
};

/** Un modo libre vacío, sin pedidos automáticos, para armar a mano. */
function blank() {
  const s = sim.newGame('sandbox', 1);
  s.autoOrders = false; s.orders.length = 0; s.cells.fill(null);
  return s;
}

test('doble hornalla: la parrilla mejorada cocina dos carnes a la vez y saca el doble', () => {
  const out = up => {
    const s = blank();
    sim.place(s, 0, 0, 'raw'); sim.place(s, 1, 0, 'grill'); sim.place(s, 2, 0, 'belt'); sim.place(s, 3, 0, 'dispatch');
    if (up) assert.deepEqual(sim.upgrade(s, 1, 0), { ok: true });
    let most = 0;
    run(s, 120, s => { most = Math.max(most, sim.at(s, 1, 0).cooking.length); });
    return { cooked: s.stats.waste, most }; // cada carne cocida que llega al despacho cuenta como desperdicio
  };
  const one = out(false), two = out(true);
  assert.equal(one.most, 1);
  assert.equal(two.most, 2);
  assert.ok(one.cooked >= 20 && one.cooked <= 24, `una hornalla: ${one.cooked} carnes en 120 s`);
  assert.ok(two.cooked >= 1.8 * one.cooked, `doble hornalla: ${two.cooked} contra ${one.cooked}`);
});

test('segundo brazo: la armadora mejorada arma cada pedido en 2,5 s y entrega más', () => {
  const made = up => {
    const s = blank();
    sim.place(s, 0, 0, 'assembly'); sim.place(s, 1, 0, 'belt'); sim.place(s, 2, 0, 'dispatch');
    if (up) sim.upgrade(s, 0, 0);
    run(s, 120, s => { // la cola siempre llena y los ingredientes siempre a mano: sólo cuenta el armado
      while (s.orders.length < QUEUE_MAX) sim.addOrder(s, 'classic', true);
      Object.assign(sim.at(s, 0, 0).inv, { bun: CAP.inv, patty: CAP.inv });
      const job = sim.at(s, 0, 0).job;
      if (job && job.left > sim.assembleTime(sim.at(s, 0, 0))) assert.fail('un trabajo más largo que el armado de la celda');
    });
    return s.stats.onTime;
  };
  const one = made(false), two = made(true);
  assert.ok(one >= 26 && one <= 30, `un brazo: ${one} pedidos en 120 s`);
  assert.ok(two >= 1.45 * one, `segundo brazo: ${two} contra ${one}`);
});

test('estantes: el almacén mejorado guarda 16 carnes', () => {
  const held = up => {
    const s = blank(); // sin pedidos el almacén no suelta nada: se llena
    sim.place(s, 0, 0, 'raw'); sim.place(s, 1, 0, 'grill'); sim.place(s, 2, 0, 'belt'); sim.place(s, 3, 0, 'stock');
    if (up) sim.upgrade(s, 3, 0);
    return run(s, 200).cells[3].store;
  };
  assert.equal(held(false), CAP.stock);
  assert.equal(held(true), UPGRADES.stock.stock);
});

test('mejorar: cobra, una sola vez, sin plata no, sólo parrilla, armadora y almacén, y en modo libre es gratis', () => {
  const s = sim.newGame('career', 1); // parrilla (3,1), almacén (5,1), armadora (7,3), $100
  assert.deepEqual(sim.upgrade(s, 3, 1), { ok: false, reason: 'money' });
  assert.deepEqual([s.money, sim.at(s, 3, 1).up], [START_MONEY, false]);
  assert.deepEqual(sim.upgrade(s, 5, 1), { ok: true });
  assert.equal(s.money, START_MONEY - UPGRADES.stock.cost);
  assert.deepEqual(sim.upgrade(s, 5, 1), { ok: false, reason: 'done' });
  assert.equal(s.money, START_MONEY - UPGRADES.stock.cost);
  for (const [x, y] of [[2, 1], [1, 1], [10, 3]]) assert.equal(sim.upgrade(s, x, y).reason, 'none'); // cinta, proveedor, despacho
  assert.equal(sim.upgrade(s, 0, 0).reason, 'out');
  assert.deepEqual(Object.keys(UPGRADES).sort(), ['assembly', 'grill', 'stock']);
  const free = sim.newGame('sandbox', 1);
  for (const [x, y] of [[4, 1], [7, 1], [10, 5]]) assert.deepEqual(sim.upgrade(free, x, y), { ok: true });
  assert.equal(free.money, 0);
});

test('reembolso: borrar o reemplazar devuelve la mitad de lo invertido, mejora incluida; reemplazar pierde la mejora', () => {
  const s = sim.newGame('career', 1);
  s.money = 1000;
  sim.upgrade(s, 3, 1);
  assert.equal(s.money, 1000 - UPGRADES.grill.cost);
  assert.equal(sim.refund(s, sim.at(s, 3, 1)), (KINDS.grill.cost + UPGRADES.grill.cost) / 2);
  sim.erase(s, 3, 1);
  assert.equal(s.money, 1000 - UPGRADES.grill.cost + (KINDS.grill.cost + UPGRADES.grill.cost) / 2);
  const before = s.money;
  sim.upgrade(s, 7, 3);
  sim.place(s, 7, 3, 'dispatch', 0); // reemplazar descuenta lo que devuelve la armadora mejorada
  assert.equal(s.money, before - UPGRADES.assembly.cost - KINDS.dispatch.cost + (KINDS.assembly.cost + UPGRADES.assembly.cost) / 2);
  sim.place(s, 7, 3, 'assembly', 0);
  assert.equal(sim.at(s, 7, 3).up, false);
  assert.equal(sim.refund(s, sim.at(s, 7, 3)), KINDS.assembly.cost / 2);
});

test('girar una máquina mejorada es gratis y conserva la mejora y lo que tiene adentro', () => {
  const s = run(sim.newGame('career', 1), 60);
  s.money += UPGRADES.stock.cost;
  sim.upgrade(s, 5, 1);
  const stock = sim.at(s, 5, 1), money = s.money, stored = stock.store;
  assert.ok(stored > 0);
  assert.deepEqual(sim.place(s, 5, 1, 'stock', 1), { ok: true });
  assert.equal(sim.at(s, 5, 1), stock);
  assert.deepEqual([stock.up, stock.store, s.money], [true, stored, money]);
});

test('guardar y volver conserva las mejoras, y la partida sigue igual', () => {
  const a = sim.newGame('career', 7);
  a.money = 1000;
  for (const [x, y] of [[3, 1], [5, 1], [7, 3]]) sim.upgrade(a, x, y);
  run(a, 90);
  const b = sim.deserialize(sim.serialize(a));
  assert.deepEqual(b.cells.filter(c => c?.up).map(c => c.kind).sort(), ['assembly', 'grill', 'stock']);
  run(a, 120); run(b, 120);
  assert.equal(sim.serialize(b), sim.serialize(a));
  assert.equal(sim.deserialize(JSON.stringify({ ...sim.newGame(), v: sim.SAVE_VERSION - 1 })), null, 'un guardado de la etapa anterior se descarta');
});

test('diagnóstico: la doble hornalla con las dos carnes listas y sin lugar cuenta como trabada', () => {
  const s = blank();
  sim.place(s, 0, 0, 'raw'); sim.place(s, 1, 0, 'grill'); sim.place(s, 2, 0, 'belt'); // la cinta no lleva a ningún lado
  sim.upgrade(s, 1, 0);
  run(s, 120);
  const g = sim.at(s, 1, 0);
  assert.deepEqual([g.cooked, g.cooking], [CAP.grillCooked, [0, 0]]);
  assert.ok(sim.diagShares(g).blocked > 0.5, `bloqueada ${sim.diagShares(g).blocked.toFixed(2)}`);
});

// upgradeHint lee el diagnóstico: acá se escribe a mano para fijar quién trabaja cuánto.
function busy(mode, x, y, work, rest = 100 - work) {
  const s = sim.newGame(mode, 1);
  for (const c of s.cells) if (c) c.diag = { work: 0, blocked: 0, wait: 0, idle: 100 };
  sim.at(s, x, y).diag = { work, blocked: 0, wait: 0, idle: rest };
  return s;
}

test('indicador de mejora: la parrilla que no da abasto se señala si la plata alcanza, y si no, no', () => {
  const s = busy('career', 3, 1, 90);
  s.money = UPGRADES.grill.cost;
  assert.deepEqual(sim.upgradeHint(s), { x: 3, y: 1, kind: 'grill' });
  s.money = UPGRADES.grill.cost - 1;
  assert.equal(sim.upgradeHint(s), null, 'sin plata no se sugiere');
  s.money = 1e6;
  sim.upgrade(s, 3, 1);
  assert.equal(sim.upgradeHint(s), null, 'ya mejorada');
});

test('indicador de mejora: nada si el cuello no tiene mejora o si la cocina está tranquila; en Modo libre no hace falta plata', () => {
  const src = busy('career', 1, 1, 95);
  src.money = 1e6;
  assert.equal(sim.bottleneck(src).kind, 'raw');
  assert.equal(sim.upgradeHint(src), null, 'una fuente no se mejora');
  const calm = busy('career', 3, 1, 70);
  calm.money = 1e6;
  assert.equal(sim.bottleneck(calm).kind, 'grill');
  assert.equal(sim.upgradeHint(calm), null, 'con trabajo bajo DIAG.busy no se sugiere');
  const free = busy('sandbox', 4, 1, 90);
  assert.equal(free.money, 0);
  assert.deepEqual(sim.upgradeHint(free), { x: 4, y: 1, kind: 'grill' });
});
