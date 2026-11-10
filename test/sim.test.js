// Pruebas del motor. Ninguna mira el reloj: todo corre sobre tiempo simulado y una semilla fija.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, KINDS, HEARTS, LOT, START_MONEY, RECIPES, QUEUE_MAX } from '../src/data.js';

const run = (s, seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) sim.step(s, STEP); return s; };
const kinds = s => s.cells.filter(Boolean).map(c => c.kind);

test('carrera: la cocina inicial entrega a tiempo el primer pedido y lo cobra', () => {
  const s = sim.newGame('career', 1);
  while (!s.stats.onTime && s.time < 60 && !s.over) sim.step(s, STEP); // una partida cerrada no avanza: sin !s.over el bucle no termina
  assert.ok(s.time < RECIPES.classic.deadline, `tardó ${s.time.toFixed(1)} s`);
  assert.equal(s.money, START_MONEY + RECIPES.classic.price);
  assert.equal(s.stats.late + s.stats.expired + s.stats.waste, 0);
  assert.ok(s.events.some(e => e.type === 'delivered' && e.amount === RECIPES.classic.price && e.x === 10 && e.y === 3));
});

test('modo libre: la cocina del prototipo entrega las tres recetas', () => {
  const s = sim.newGame('sandbox', 1);
  assert.deepEqual([s.W, s.H], [17, 10]);
  assert.equal(kinds(s).length, 39); // las mismas 39 piezas del prototipo
  s.autoOrders = false;
  run(s, 60);
  assert.equal(s.stats.onTime, 3);
  assert.equal(s.money, 24 + 31 + 43);
  assert.equal(s.orders.length, 0);
});

test('la misma semilla da la misma partida, y guardar y volver no la cambia', () => {
  // En modo libre salen las tres recetas, así que el azar decide de verdad qué pide cada cliente.
  const recipes = s => { const seen = []; for (let i = 0; i < 4000; i++) { sim.step(s, STEP); for (const e of s.events.splice(0)) if (e.type === 'order') seen.push(s.orders.find(o => o.id === e.id).recipeKey); } return seen.join(); };
  const a = run(sim.newGame('sandbox', 42), 400), b = run(sim.newGame('sandbox', 42), 150);
  const restored = sim.deserialize(sim.serialize(b));
  assert.notEqual(restored, null);
  run(restored, 250);
  assert.equal(sim.serialize(restored), sim.serialize(a));
  const menu = recipes(sim.newGame('sandbox', 42));
  assert.equal(new Set(menu.split(',')).size, 3, 'en 400 s tendrían que salir las tres recetas');
  assert.equal(recipes(sim.newGame('sandbox', 42)), menu);
  assert.notEqual(recipes(sim.newGame('sandbox', 43)), menu);
});

test('un producto tarda 0,4 s en cruzar cada celda de cinta', () => {
  const s = sim.newGame('sandbox', 1);
  s.autoOrders = false;
  sim.place(s, 0, 0, 'raw', 0);
  for (let x = 1; x <= 6; x++) sim.place(s, x, 0, 'belt', 0);
  const arrival = x => { while (!sim.at(s, x, 0).item && s.time < 30) sim.step(s, STEP); return s.time; };
  const t1 = arrival(1), t6 = arrival(6);
  assert.ok(t6 - t1 > 5 * 0.4 - 0.01 && t6 - t1 < 5 * 0.5 + 0.01, `cinco celdas en ${(t6 - t1).toFixed(2)} s`);
});

test('un guardado roto o de otra versión se descarta', () => {
  assert.equal(sim.deserialize('no es json'), null);
  assert.equal(sim.deserialize(JSON.stringify({ ...sim.newGame(), v: 99 })), null);
  assert.equal(sim.deserialize(''), null);
});

test('construir cuesta, borrar devuelve la mitad y sin dinero no se construye', () => {
  const s = sim.newGame('career', 1);
  assert.deepEqual(sim.place(s, 0, 5, 'grill', 0), { ok: true });
  assert.equal(s.money, START_MONEY - KINDS.grill.cost);
  assert.equal(sim.place(s, 1, 5, 'assembly', 0).reason, 'money');
  assert.equal(sim.at(s, 1, 5), null);
  assert.equal(s.money, START_MONEY - KINDS.grill.cost);
  assert.equal(sim.erase(s, 0, 5), true);
  assert.equal(s.money, START_MONEY - KINDS.grill.cost / 2);
  assert.equal(sim.place(s, 99, 99, 'belt', 0).reason, 'out');
});

test('girar una máquina es gratis y no pierde lo que tiene adentro', () => {
  const s = run(sim.newGame('career', 1), 60);
  const stock = sim.at(s, 5, 1), money = s.money, stored = stock.store;
  assert.ok(stored > 0);
  assert.deepEqual(sim.place(s, 5, 1, 'stock', 1), { ok: true });
  assert.equal(sim.at(s, 5, 1), stock);
  assert.deepEqual([stock.dir, stock.store, s.money, s.stats.waste], [1, stored, money, 0]);
  assert.equal(sim.place(s, 5, 1, 'stock', 1).reason, 'same');
});

test('si se borra la cinta que lleva una hamburguesa, el pedido vuelve a la cola y se rehace', () => {
  const s = sim.newGame('career', 1);
  let cell = null;
  for (let i = 0; i < 400 && !cell; i++) { sim.step(s, STEP); for (const x of [8, 9]) if (sim.at(s, x, 3).item?.type === 'burger') cell = x; }
  assert.ok(cell, 'la hamburguesa nunca salió de la armadora');
  assert.equal(s.orders[0].status, 'transit');
  sim.erase(s, cell, 3);
  assert.equal(s.orders[0].status, 'pending');
  assert.equal(s.stats.waste, 1);
  sim.place(s, cell, 3, 'belt', 0);
  run(s, 20);
  assert.ok(!s.orders.some(o => o.id === 1), 'el pedido 1 no se rehízo');
  assert.ok(s.stats.onTime >= 1);
});

test('ampliar el terreno cobra, agranda y no mueve nada de lo construido', () => {
  const s = sim.newGame('career', 1);
  assert.equal(sim.expand(s).reason, 'money');
  s.money = 1000;
  const before = kinds(s).join();
  assert.deepEqual(sim.expand(s), { ok: true });
  assert.deepEqual([s.W, s.H, s.money], [LOT.career.w + LOT.growW, LOT.career.h + LOT.growH, 1000 - LOT.cost(0)]);
  assert.equal(kinds(s).join(), before);
  assert.equal(sim.at(s, 10, 3).kind, 'dispatch');
  assert.deepEqual(sim.place(s, s.W - 1, s.H - 1, 'belt', 0), { ok: true });
  run(s, 25);
  assert.ok(s.stats.onTime >= 1, 'la cocina dejó de entregar después de ampliar');
  s.money = 1e6;
  for (let i = 0; i < 20 && sim.canExpand(s); i++) sim.expand(s);
  assert.equal(sim.expand(s).reason, 'max');
});

test('carrera: los clientes sólo piden lo que la cocina ofrece', () => {
  const s = sim.newGame('career', 5);
  assert.deepEqual(sim.availableRecipes(s), ['classic']);
  s.money = 500;
  sim.place(s, 0, 6, 'cheese', 0); // con el proveedor construido pero sin el nivel, tampoco
  assert.deepEqual(sim.availableRecipes(s), ['classic']);
  sim.erase(s, 0, 6);
  s.level = 3; // desbloqueadas, pero sin proveedor de queso todavía no se ofrecen
  assert.deepEqual(sim.availableRecipes(s), ['classic']);
  assert.equal(sim.addOrder(s, 'cheese', true), false);
  sim.place(s, 7, 5, 'cheese', 3);
  assert.deepEqual(sim.availableRecipes(s), ['classic', 'cheese', 'double']);
});

test('carrera: con el queso conectado se entregan las tres recetas', () => {
  const s = sim.newGame('career', 5);
  s.level = 3; s.money = 500;
  sim.place(s, 7, 5, 'cheese', 3); sim.place(s, 7, 4, 'belt', 3);
  for (const k of ['cheese', 'double']) assert.equal(sim.addOrder(s, k, true), true);
  run(s, 60);
  assert.ok(!s.orders.some(o => o.id <= 3), 'alguno de los tres primeros pedidos no se entregó');
  assert.ok(s.stats.earned >= 24 + 31 + 43);
  assert.equal(s.stats.waste, 0);
});

test('carrera: subir de nivel devuelve reputación y acelera a los clientes', () => {
  const s = run(sim.newGame('career', 1), 60);
  assert.equal(s.level, 2);
  assert.ok(s.events.some(e => e.type === 'levelup' && e.level === 2 && e.unlocked.includes('cheese')));
});

test('carrera: sin despacho los clientes se van, baja la reputación y la cocina cierra', () => {
  const s = sim.newGame('career', 1);
  sim.erase(s, 10, 3);
  run(s, 66);
  assert.equal(s.hearts, HEARTS - 1); // el primer pedido vence a los 45 s más 20 de gracia
  assert.equal(s.over, false);
  run(s, 600);
  assert.equal(s.over, true);
  assert.equal(s.hearts, 0);
  assert.ok(s.events.some(e => e.type === 'gameover'));
  const frozen = sim.serialize(s);
  run(s, 30);
  assert.equal(sim.serialize(s), frozen); // una partida cerrada ya no avanza
  assert.equal(sim.place(s, 0, 0, 'belt', 0).ok, false);
});

test('carrera: la cocina inicial aguanta los primeros niveles y después exige crecer', () => {
  const s = sim.newGame('career', 7);
  while (s.level < 4 && s.time < 600 && !s.over) sim.step(s, STEP);
  assert.equal(s.level, 4);
  assert.equal(s.hearts, HEARTS, 'no debería perder reputación antes del nivel 4');
  run(s, 900);
  assert.equal(s.over, true, 'sin construir nada, la presión tiene que cerrar la cocina');
});

test('modo libre: nada cuesta, la cola tiene tope y nunca se cierra', () => {
  const s = sim.newGame('sandbox', 1);
  assert.equal(sim.cost(s, 'assembly'), 0);
  sim.erase(s, 14, 5);
  for (let i = 0; i < 50 && sim.addOrder(s, 'double', true); i++);
  assert.equal(s.orders.length, QUEUE_MAX);
  assert.ok(s.events.some(e => e.type === 'queueFull'));
  run(s, 900);
  assert.equal(s.over, false);
  assert.equal(s.hearts, HEARTS);
});

test('una cinta que apunta a algo que no recibe su producto se marca sin salida', () => {
  const s = sim.newGame('sandbox', 1);
  sim.place(s, 0, 0, 'raw', 0); sim.place(s, 1, 0, 'belt', 0); // la cinta termina en una celda vacía
  run(s, 2);
  assert.equal(sim.isStuck(s, 1, 0), false); // todavía no esperó lo suficiente
  run(s, 4);
  assert.equal(sim.isStuck(s, 1, 0), true);
  // una cinta frenada porque el almacén está lleno no es un problema: no se marca
  run(s, 120);
  assert.equal(sim.at(s, 7, 1).store, 8);
  assert.ok(sim.at(s, 6, 1).item);
  assert.equal(sim.isStuck(s, 6, 1), false);
});

test('un ingrediente suelto en el despacho cuenta como desperdicio', () => {
  const s = sim.newGame('sandbox', 1);
  s.autoOrders = false;
  sim.place(s, 0, 0, 'raw', 0); sim.place(s, 1, 0, 'dispatch', 0);
  run(s, 1);
  assert.ok(s.stats.waste >= 1);
});

test('una entrega pasada de plazo paga el 55 %, redondeado a entero', () => {
  const s = sim.newGame('career', 1);
  sim.erase(s, 10, 3);
  run(s, 50); // el primer pedido vence a los 45 s; el cliente espera 20 más
  assert.deepEqual(sim.place(s, 10, 3, 'dispatch', 0), { ok: true });
  run(s, 3);
  assert.equal(s.stats.late, 1);
  assert.ok(s.events.some(e => e.type === 'delivered' && e.late && e.amount === 13));
  assert.ok(Number.isInteger(s.money));
});

test('una hamburguesa que llega cuando el cliente ya se fue es desperdicio, y queda anotada', () => {
  const s = sim.newGame('career', 1);
  sim.erase(s, 10, 3);
  run(s, 70); // el pedido 1 venció y se fue; su hamburguesa sigue esperando en la cinta
  assert.ok(!s.orders.some(o => o.id === 1));
  const waste = s.stats.waste;
  sim.place(s, 10, 3, 'dispatch', 0);
  run(s, 2);
  assert.ok(s.stats.waste > waste);
  assert.ok(s.log.some(l => l.key === 'logOrphan' && l.p.id === 1));
});

test('invariante: el estado de cada pedido coincide con lo que hay en la cocina, aun construyendo y borrando al azar', () => {
  const kindsToPlace = Object.keys(KINDS);
  let checked = 0;
  for (const mode of ['career', 'sandbox']) for (let seed = 1; seed <= 8; seed++) {
    const s = sim.newGame(mode, seed);
    s.money = 1e6;
    let r = seed * 7919;
    const rnd = n => Math.floor(((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32) * n);
    for (let i = 0; i < 2500 && !s.over; i++) {
      if (rnd(50) === 0) {
        const x = rnd(s.W), y = rnd(s.H);
        if (rnd(3) === 0) sim.erase(s, x, y); else sim.place(s, x, y, kindsToPlace[rnd(kindsToPlace.length)], rnd(4));
      }
      sim.step(s, STEP);
      const jobs = new Map(), burgers = new Map(), add = (m, id) => m.set(id, (m.get(id) ?? 0) + 1);
      for (const c of s.cells) {
        if (!c) continue;
        assert.ok(!(c.job && c.output), 'una armadora con trabajo y salida a la vez');
        if (c.job) add(jobs, c.job.orderId);
        if (c.output) add(burgers, c.output.orderId);
        if (c.item?.type === 'burger') add(burgers, c.item.orderId);
      }
      for (const o of s.orders) {
        const want = { pending: [0, 0], assembling: [1, 0], transit: [0, 1] }[o.status];
        assert.deepEqual([jobs.get(o.id) ?? 0, burgers.get(o.id) ?? 0], want, `pedido #${o.id} en «${o.status}» (${mode}, semilla ${seed}, paso ${i})`);
        checked++;
      }
    }
  }
  assert.ok(checked > 10000, 'el invariante casi no miró pedidos');
});
