// Etapa 7: desafíos. Cada uno tiene su solución de referencia, que se juega acá y tiene que dar las tres
// estrellas; y ninguno viene resuelto: sin hacer nada (o con el atajo que la pieza enseñada evita) no se gana.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, PUZZLES, PUZZLE_ORDER, LOTS, KINDS, UPGRADES } from '../src/data.js';

const belts = (x0, x1, y, dir = 0) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ['place', x0 + i, y, 'belt', dir]);
const vbelts = (x, y0, y1, dir = 1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => ['place', x, y0 + i, 'belt', dir]);
// las cintas de El cuello (juntan las dos parrillas) y el cruce de El examen, sin la pieza que decide
const NECK = [['place', 2, 1, 'belt', 0], ['place', 3, 1, 'belt', 1], ['place', 3, 2, 'belt', 0], ['place', 2, 3, 'belt', 0], ['place', 3, 3, 'belt', 3], ['place', 5, 2, 'belt', 0]];
const FINAL = [['place', 1, 3, 'belt', 0], ['place', 3, 3, 'bridge', 0], ...belts(1, 2, 1), ...vbelts(3, 1, 2), ['place', 3, 4, 'belt', 1], ['place', 3, 5, 'belt', 0]];
// [acción, x, y, máquina, dirección]: 'place' o 'upgrade' con las funciones públicas del motor.
export const SOLUTIONS = {
  pzLine: [...belts(2, 2, 1), ...belts(4, 5, 1), ...belts(7, 8, 1), ['place', 6, 2, 'belt', 3]],
  pzCheese: [['place', 6, 3, 'cheese', 3]],
  pzSplit: [['place', 2, 2, 'splitter', 0]],
  pzBridge: [['place', 2, 2, 'bridge', 0], ['place', 3, 2, 'belt', 1], ['place', 3, 3, 'belt', 1]],
  pzBudget: [['upgrade', 3, 2]],
  pzHall: [['place', 1, 0, 'grill', 1], ['place', 1, 1, 'assembly', 0], ['place', 1, 2, 'belt', 3], ...belts(2, 4, 1),
    ['place', 5, 1, 'belt', 3], ...belts(5, 6, 0), ['place', 7, 0, 'belt', 1], ...belts(7, 12, 1)],
  pzCross: [['place', 3, 3, 'bridge', 0], ['place', 3, 1, 'belt', 1], ...vbelts(1, 1, 2), ...belts(1, 2, 3), ['place', 4, 3, 'belt', 0], ['place', 5, 3, 'belt', 1]],
  pzIsland: [['place', 1, 0, 'grill', 0], ...belts(2, 5, 0), ...vbelts(6, 0, 2), ['place', 6, 3, 'belt', 2], ['place', 5, 3, 'assembly', 2],
    ...belts(1, 5, 6), ...vbelts(6, 4, 6, 3)],
  pzNeck: [...NECK, ['upgrade', 4, 2]],
  pzFinal: [...FINAL, ['place', 4, 0, 'raw', 1], ['place', 4, 1, 'grill', 2]],
};

function play(key, moves = []) {
  const s = sim.newGame('puzzle', 1, key);
  for (const [act, x, y, kind, dir] of moves) {
    const r = act === 'upgrade' ? sim.upgrade(s, x, y) : sim.place(s, x, y, kind, dir);
    assert.ok(r.ok, `${key}: ${act} ${kind ?? ''} en ${x},${y} falló (${r.reason})`);
  }
  for (let i = 0; i < (PUZZLES[key].limit + 5) / STEP && !s.over; i++) sim.step(s, STEP);
  return s;
}

for (const key of PUZZLE_ORDER) {
  test(`desafío ${key}: la solución de referencia gana con las tres estrellas`, () => {
    const s = play(key, SOLUTIONS[key]), r = sim.puzzleStars(s);
    assert.equal(s.result, 'won', `terminó en ${s.result} a los ${s.time.toFixed(1)} s`);
    assert.deepEqual([r.stars, r.spent <= PUZZLES[key].spend, r.belts <= PUZZLES[key].belts], [3, true, true], JSON.stringify(r));
    assert.equal(s.stats.onTime, PUZZLES[key].orders.length);
  });
  test(`desafío ${key}: sin hacer nada no se gana`, () => {
    const s = play(key);
    assert.ok(s.over && s.result !== 'won', `terminó en ${s.result}`);
    assert.equal(sim.puzzleStars(s).stars, 0);
  });
}

test('cada desafío obliga a usar su pieza: el atajo sin ella pierde', () => {
  for (const d of [0, 1, 3]) assert.notEqual(play('pzSplit', [['place', 2, 2, 'belt', d]]).result, 'won', `cinta ${d} en vez del divisor`);
  for (const d of [0, 1]) assert.notEqual(play('pzBridge', [['place', 2, 2, 'belt', d], ['place', 3, 2, 'belt', 1], ['place', 3, 3, 'belt', 1]]).result, 'won', `cinta ${d} en vez del puente`);
  for (const d of [0, 1]) assert.notEqual(play('pzBridge', [['place', 2, 2, 'splitter', d], ['place', 3, 2, 'belt', 1], ['place', 3, 3, 'belt', 1]]).result, 'won', `divisor ${d} en vez del puente`);
  assert.ok(PUZZLES.pzBudget.budget < UPGRADES.assembly.cost, 'en el presupuesto justo no entra el segundo brazo');
  assert.ok(PUZZLES.pzSplit.budget < KINDS.raw.cost + KINDS.splitter.cost, 'no alcanza para una segunda carne');
  const noBridge = d => SOLUTIONS.pzCross.map(m => (m[3] === 'bridge' ? ['place', 3, 3, 'belt', d] : m));
  for (const d of [0, 1]) assert.notEqual(play('pzCross', noBridge(d)).result, 'won', `cinta ${d} en vez del puente`);
  for (const d of [0, 1]) assert.notEqual(play('pzCross', SOLUTIONS.pzCross.map(m => (m[3] === 'bridge' ? ['place', 3, 3, 'splitter', d] : m))).result, 'won', `divisor ${d} en vez del puente`);
  assert.ok(PUZZLES.pzCross.budget < 2 * KINDS.bridge.cost, 'no alcanza para dos puentes: pan y queso cruzan juntos');
  assert.notEqual(play('pzNeck', NECK).result, 'won', 'sin mejora');
  assert.notEqual(play('pzNeck', [...NECK, ['upgrade', 1, 1]]).result, 'won', 'mejorar una parrilla en vez de la armadora');
  assert.ok(PUZZLES.pzNeck.budget < UPGRADES.assembly.cost + UPGRADES.grill.cost, 'no alcanza para mejorar las dos');
  assert.notEqual(play('pzFinal', FINAL).result, 'won', 'una sola parrilla sin mejorar no da con las dobles');
  for (const d of [0, 1]) assert.notEqual(play('pzFinal', [...SOLUTIONS.pzFinal.map(m => (m[3] === 'bridge' ? ['place', 3, 3, 'belt', d] : m))]).result, 'won', `El examen: cinta ${d} en vez del puente`);
});

test('reglas del modo: piezas dadas fijas, guion sin azar, sin pedidos a mano, entregas que no suman y borrar que devuelve todo', () => {
  const s = sim.newGame('puzzle', 1, 'pzLine');
  assert.ok(s.cells.filter(Boolean).every(c => c.fixed), 'las piezas dadas vienen fijas');
  assert.equal(s.cells.filter(Boolean).length, LOTS.pzLine.kitchen.length);
  assert.deepEqual([s.money, s.orders.length], [PUZZLES.pzLine.budget, 1], 'el pedido del segundo 0 ya está al abrir');
  assert.equal(sim.addOrder(s, 'classic', true), false, 'no se pide a mano');
  assert.equal(sim.expand(s).ok, false, 'no se amplía');
  assert.ok(sim.place(s, 2, 1, 'belt', 0).ok);
  assert.equal(s.money, PUZZLES.pzLine.budget - KINDS.belt.cost);
  assert.ok(sim.erase(s, 2, 1));
  assert.equal(s.money, PUZZLES.pzLine.budget, 'borrar devuelve el total');
  const b = sim.newGame('puzzle', 1, 'pzBudget');
  b.cells.forEach(c => { if (c) c.fixed = false; }); // para medir el reembolso de una máquina mejorada
  sim.upgrade(b, 3, 2); sim.erase(b, 3, 2);
  assert.equal(b.money, PUZZLES.pzBudget.budget + KINDS.grill.cost, 'borrar devuelve también la mejora');
  // el guion es el mismo con cualquier semilla, y las entregas no suman al presupuesto
  const a = play('pzLine', SOLUTIONS.pzLine), z = sim.newGame('puzzle', 999, 'pzLine');
  for (const [, x, y, kind, dir] of SOLUTIONS.pzLine) sim.place(z, x, y, kind, dir);
  for (let i = 0; i < 2000 && !z.over; i++) sim.step(z, STEP);
  assert.deepEqual([z.time, z.stats], [a.time, a.stats]);
  assert.equal(a.money, PUZZLES.pzLine.budget - 12);
  assert.ok(a.stats.earned > 0);
});

test('se pierde al vencerse un pedido, al encontrar la cola llena, al pasar el límite, y la estrella de gasto se mide', () => {
  const s = play('pzLine');
  assert.equal(s.result, 'expired');
  assert.ok(s.time > 45 && s.time < 46, `se perdió a los ${s.time}`);
  const t = sim.newGame('puzzle', 1, 'pzLine');
  for (const [, x, y, kind, dir] of SOLUTIONS.pzLine) sim.place(t, x, y, kind, dir);
  t.orders.forEach(o => { o.due = 1e9; }); PUZZLES.pzLine.orders.push([1e8, 'classic']); // un pedido que nunca llega
  try { for (let i = 0; i < 2000 && !t.over; i++) sim.step(t, STEP); } finally { PUZZLES.pzLine.orders.pop(); }
  assert.equal(t.result, 'timeout');
  const q = play('pzSplit'); // sin divisor no sale nada: el octavo cliente encuentra la cola llena y eso pierde
  assert.deepEqual([q.result, q.stats.turnedAway, q.time < 20], ['expired', 1, true]);
  const w = play('pzLine', [...SOLUTIONS.pzLine, ['place', 0, 0, 'belt', 0]]), r = sim.puzzleStars(w);
  assert.deepEqual([w.result, r.stars, r.spendOk, r.beltsOk], ['won', 1, false, false]);
  // la segunda y la tercera estrella piden algo: estas soluciones ganan, pero gastan o tienden de más
  const stars = (key, moves) => { const g = play(key, moves), k = sim.puzzleStars(g); return [g.result, k.stars, k.spendOk, k.beltsOk]; };
  assert.deepEqual(stars('pzCross', [['place', 3, 1, 'bridge', 0], ['place', 3, 3, 'belt', 1], ...belts(1, 2, 1), ...vbelts(1, 2, 3, 3), ...belts(4, 4, 1), ...vbelts(5, 1, 3)]),
    ['won', 1, false, false], 'El cruce: cruzar arriba lleva más cintas');
  assert.deepEqual(stars('pzIsland', [['place', 1, 0, 'grill', 0], ...belts(2, 6, 0), ...vbelts(7, 0, 2), ['place', 7, 3, 'belt', 2], ['place', 6, 3, 'assembly', 2],
    ['place', 5, 3, 'belt', 2], ...belts(1, 6, 6), ...vbelts(7, 4, 6, 3)]), ['won', 1, false, false], 'La isla: la armadora afuera del hueco');
  assert.deepEqual(stars('pzNeck', [...NECK.filter(m => !(m[1] === 2 && m[2] === 1)), ['place', 2, 1, 'belt', 3], ['place', 2, 0, 'belt', 0], ['place', 3, 0, 'belt', 1], ['upgrade', 4, 2]]),
    ['won', 1, false, false], 'El cuello: un rodeo por arriba');
  assert.deepEqual(stars('pzFinal', [...FINAL, ['upgrade', 4, 3]]), ['won', 2, false, true], 'El examen: la mejora gasta de más');
});

test('desafíos: se abren en orden, el estado se guarda y vuelve', () => {
  const best = rec => k => rec[k] ?? 0;
  assert.ok(sim.puzzleOpen(PUZZLE_ORDER[0], best({})));
  assert.ok(!sim.puzzleOpen(PUZZLE_ORDER[1], best({})));
  assert.ok(sim.puzzleOpen(PUZZLE_ORDER[1], best({ [PUZZLE_ORDER[0]]: 1 })));
  assert.ok(!sim.puzzleOpen(PUZZLE_ORDER[2], best({ [PUZZLE_ORDER[0]]: 3 })));
  const s = sim.newGame('puzzle', 1, 'pzSplit');
  sim.place(s, 2, 2, 'splitter', 0);
  for (let i = 0; i < 100; i++) sim.step(s, STEP);
  const back = sim.deserialize(sim.serialize(s));
  for (let i = 0; i < 300; i++) { sim.step(s, STEP); sim.step(back, STEP); }
  assert.equal(sim.serialize(back), sim.serialize(s));
});
