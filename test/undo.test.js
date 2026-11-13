// Deshacer: la plata y la celda vuelven como estaban, dentro de una ventana de tiempo de juego.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, KINDS, UNDO, LOT } from '../src/data.js';

const run = (s, seconds) => { for (let i = 0; i < Math.round(seconds / STEP) && !s.over; i++) sim.step(s, STEP); return s; };
const snap = (s, x, y) => { const c = sim.at(s, x, y); return c && [c.kind, c.dir, c.up, c.pick]; };

function career() { const s = sim.newGame('career', 1); s.money = 1000; return s; }

test('deshacer: pieza nueva, reemplazo, borrado y mejora dejan plata y celda como estaban (Carrera, desafío y libre)', () => {
  const puzzle = sim.newGame('puzzle', 1, 'pzBudget');
  puzzle.money = 1000;
  for (const s of [career(), puzzle, sim.newGame('sandbox', 1)]) {
    const where = s.mode;
    const check = (act, x, y) => {
      const money = s.money, cell = snap(s, x, y);
      sim.undoMark(s);
      act();
      assert.notDeepEqual([s.money, snap(s, x, y)], [money, cell], where);
      assert.equal(sim.undo(s).ok, true, where);
      assert.deepEqual([s.money, snap(s, x, y)], [money, cell], where);
    };
    check(() => sim.place(s, 0, 4, 'grill', 1), 0, 4); // nueva
    sim.undoMark(s); sim.place(s, 0, 4, 'grill', 1); sim.upgrade(s, 0, 4);
    check(() => sim.place(s, 0, 4, 'stock', 2), 0, 4); // reemplazo de una mejorada: el neto ya descontaba el reembolso
    assert.equal(sim.at(s, 0, 4).up, true, `${where}: la mejora volvió`);
    check(() => sim.erase(s, 0, 4), 0, 4); // borrado
    sim.undoMark(s); sim.erase(s, 0, 4); sim.place(s, 0, 4, 'grill');
    check(() => sim.upgrade(s, 0, 4), 0, 4); // mejora
    assert.equal(sim.at(s, 0, 4).diag.work, 0);
    assert.equal(sim.at(s, 0, 4).fixed, undefined);
  }
});

test('deshacer: un giro vuelve la dirección y conserva el contenido, sin cobrar ni desperdiciar', () => {
  const s = run(sim.newGame('career', 1), 60);
  const stock = sim.at(s, 5, 1), stored = stock.store, money = s.money;
  assert.ok(stored > 0);
  sim.undoMark(s);
  sim.place(s, 5, 1, 'stock', 1);
  assert.deepEqual(sim.undo(s), { ok: true, n: 1 });
  assert.equal(sim.at(s, 5, 1), stock);
  assert.deepEqual([stock.dir, stock.store, s.money, s.stats.waste], [0, stored, money, 0]);
});

test('deshacer: un filtro reemplazado vuelve con lo que elegía', () => {
  const s = career();
  sim.undoMark(s); sim.place(s, 0, 5, 'filter', 1); sim.setPick(s, 0, 5, 'bun');
  sim.undoMark(s); sim.place(s, 0, 5, 'belt');
  sim.undo(s);
  assert.deepEqual(snap(s, 0, 5), ['filter', 1, false, 'bun']);
});

test('deshacer: un arrastre de varias cintas se deshace junto y en orden inverso', () => {
  const s = career(), money = s.money;
  sim.undoMark(s);
  for (let x = 0; x < 5; x++) sim.place(s, x, 5, 'belt');
  sim.place(s, 2, 5, 'grill'); // la misma celda dos veces en el grupo: el orden inverso la deja vacía
  sim.undoMark(s); sim.place(s, 0, 6, 'belt'); // otro gesto
  assert.equal(sim.undo(s).n, 1);
  assert.equal(sim.at(s, 0, 6), null);
  assert.deepEqual(sim.undo(s), { ok: true, n: 6 });
  for (let x = 0; x < 5; x++) assert.equal(sim.at(s, x, 5), null);
  assert.equal(s.money, money);
  assert.equal(sim.undo(s).reason, 'none');
});

test('deshacer: pasada la ventana no se deshace y el grupo se va; en pausa la ventana no corre', () => {
  const s = career();
  sim.undoMark(s); sim.place(s, 0, 5, 'grill');
  assert.equal(sim.canUndo(s), true);
  run(s, UNDO.window + 0.5);
  assert.equal(sim.canUndo(s), false);
  assert.deepEqual(sim.undo(s), { ok: false, reason: 'late' });
  assert.equal(sim.at(s, 0, 5).kind, 'grill');
  assert.equal(sim.undo(s).reason, 'none', 'el grupo vencido se descartó');
  sim.undoMark(s); sim.place(s, 1, 5, 'grill');
  for (let i = 0; i < 1000; i++) sim.canUndo(s); // en pausa: nadie llama a step
  assert.equal(sim.undo(s).ok, true);
});

test('deshacer un borrado sin plata da money y no cambia nada', () => {
  const s = career();
  sim.undoMark(s); sim.place(s, 0, 5, 'assembly');
  sim.undoMark(s); sim.erase(s, 0, 5);
  s.money = 10;
  assert.deepEqual(sim.undo(s), { ok: false, reason: 'money' });
  assert.deepEqual([s.money, sim.at(s, 0, 5)], [10, null]);
  s.money = KINDS.assembly.cost / 2;
  assert.equal(sim.undo(s).ok, true, 'el grupo quedó');
  assert.deepEqual([s.money, sim.at(s, 0, 5).kind], [0, 'assembly']);
});

test('deshacer una pieza que ya recibió un producto cuenta desperdicio y devuelve el pedido', () => {
  const s = sim.newGame('career', 1);
  let x = null;
  for (let i = 0; i < 400 && x == null; i++) { sim.step(s, STEP); if (sim.at(s, 9, 3).item?.type === 'burger') x = 9; }
  assert.ok(x, 'la hamburguesa nunca llegó');
  sim.undoMark(s); sim.place(s, 9, 3, 'belt', 1); // un giro: no se pierde
  sim.undo(s);
  assert.equal(s.stats.waste, 0);
  sim.erase(s, 8, 3); sim.undoMark(s); sim.place(s, 8, 3, 'belt');
  const o = s.orders[0];
  o.status = 'transit';
  sim.at(s, 8, 3).item = { id: 77, type: 'burger', orderId: o.id, recipeKey: 'classic', d: 0, readyAt: s.time + 9 };
  sim.at(s, 9, 3).item = null;
  const waste = s.stats.waste;
  sim.undo(s);
  assert.equal(sim.at(s, 8, 3), null);
  assert.equal(s.stats.waste, waste + 1);
  assert.equal(o.status, 'pending');
});

test('deshacer: las piezas fijas de un desafío no entran nunca, y ampliar no se deshace', () => {
  const s = sim.newGame('puzzle', 1, 'pzNeck');
  sim.undoMark(s);
  assert.equal(sim.upgrade(s, 4, 2).ok, true); // la armadora dada se mejora, pero no se anota
  assert.equal(sim.place(s, 4, 2, 'assembly', 1).reason, 'fixed');
  assert.equal(sim.erase(s, 4, 2), false);
  assert.equal(sim.undo(s).reason, 'none');
  const c = career();
  sim.undoMark(c); sim.place(c, 0, 5, 'belt');
  sim.undoMark(c); sim.expand(c);
  const W = c.W;
  assert.deepEqual(sim.undo(c), { ok: true, n: 1 }, 'deshace la cinta, no la ampliación');
  assert.equal(sim.at(c, 0, 5), null);
  assert.equal(c.W, W);
});

test('deshacer después de ampliar usa las coordenadas, no el índice', () => {
  const s = career();
  sim.undoMark(s); sim.place(s, 3, 5, 'grill');
  sim.expand(s);
  assert.equal(sim.undo(s).ok, true);
  assert.equal(sim.at(s, 3, 5), null);
  assert.equal(s.money, 1000 - LOT.cost(0), 'devolvió la parrilla entera y la ampliación quedó cobrada');
});

test('deshacer: el estado con undo se guarda y vuelve igual', () => {
  const s = career();
  sim.undoMark(s); sim.place(s, 0, 5, 'filter', 1); sim.setPick(s, 0, 5, 'cheese');
  sim.undoMark(s); sim.erase(s, 0, 5);
  const r = sim.deserialize(sim.serialize(s));
  assert.deepEqual(r.undo, s.undo);
  assert.equal(sim.undo(r).ok, true);
  assert.deepEqual(snap(r, 0, 5), ['filter', 1, false, 'cheese']);
});

test('deshacer: nunca recuerda más de UNDO.max acciones, y descarta las más viejas por grupos enteros', () => {
  const s = sim.newGame('sandbox', 1);
  for (let g = 0; g < 20; g++) { sim.undoMark(s); for (let k = 0; k < 3; k++) sim.place(s, k, 9, g % 2 ? 'belt' : 'grill'); }
  assert.equal(s.undo.reduce((n, g) => n + g.length, 0), UNDO.max);
  assert.ok(s.undo.every(g => g.length === 3));
});
