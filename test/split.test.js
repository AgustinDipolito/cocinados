// Etapa 3: reparto de ingredientes entre varias armadoras, divisor y puente. Tiempo simulado y semilla fija.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, RECIPES, INGREDIENTS, KINDS } from '../src/data.js';

const run = (s, seconds) => { for (let i = 0; i < Math.round(seconds / STEP) && !s.over; i++) sim.step(s, STEP); return s; };

/** Un modo libre vacío, sin pedidos automáticos, para armar a mano. */
function blank() {
  const s = sim.newGame('sandbox', 1);
  s.autoOrders = false; s.orders.length = 0; s.cells.fill(null);
  return s;
}

/**
 * Dos líneas iguales, cada una con su almacén y su pan: la de la fila 1 se recorre primero.
 * Almacén → cinta → armadora → cinta → despacho, y el pan entra a la armadora desde abajo.
 */
function twoLines(invFirst, invSecond, store) {
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  for (const y of [1, 5]) {
    put(0, y, 'stock'); put(1, y, 'belt'); put(2, y, 'assembly'); put(3, y, 'belt'); put(4, y, 'dispatch');
    put(2, y + 2, 'bun', 3); put(2, y + 1, 'belt', 3);
    sim.at(s, 0, y).store = store;
  }
  Object.assign(sim.at(s, 2, 1).inv, invFirst);
  Object.assign(sim.at(s, 2, 5).inv, invSecond);
  sim.addOrder(s, 'double', true);
  return s;
}

test('reparto: una carne en cada armadora y un pedido doble: el almacén suelta la que falta y se entrega', () => {
  // Sumando el inventario de las dos armadoras daba cero carnes faltantes: ningún almacén soltaba y ninguna armaba.
  const s = twoLines({ patty: 1 }, { bun: 1, patty: 1, cheese: 1 }, 4);
  assert.deepEqual(INGREDIENTS.map(i => sim.pendingNeed(s, i)), [0, 1, 0], 'pan, carne y queso que faltan');
  run(s, 20);
  assert.equal(s.stats.onTime, 1, 'el pedido doble quedó trabado');
});

test('reparto: pan en una armadora y las carnes en la otra tampoco traba (restar el máximo no alcanza)', () => {
  const s = twoLines({ bun: 1 }, { patty: 2, cheese: 1 }, 0);
  assert.deepEqual(INGREDIENTS.map(i => sim.pendingNeed(s, i)), [1, 0, 0], 'pan, carne y queso que faltan');
  run(s, 20);
  assert.equal(s.stats.onTime, 1, 'el pedido doble quedó trabado');
});

test('reparto: con una sola armadora la necesidad es la de antes (pedidos menos inventario menos lo que viaja)', () => {
  const before = (s, kind) => { // la cuenta anterior a la etapa 3, copiada tal cual
    let need = 0;
    for (const o of s.orders) if (o.status === 'pending') need += RECIPES[o.recipeKey][kind] || 0;
    for (const c of s.cells) {
      if (!c) continue;
      if (c.kind === 'assembly') need -= c.inv[kind] || 0;
      if (c.kind === 'belt' && c.item && c.item.type === kind) need--;
    }
    return Math.max(0, need);
  };
  let compared = 0, positive = 0;
  for (const [mode, seed] of [['career', 7], ['sandbox', 42], ['sandbox', 3]]) {
    const s = sim.newGame(mode, seed);
    for (let i = 0; i < 4000 && !s.over; i++) {
      if (i % 37 === 0 && mode === 'sandbox') sim.addOrder(s, ['classic', 'cheese', 'double'][i % 3], true);
      sim.step(s, STEP);
      for (const k of INGREDIENTS) {
        const n = sim.pendingNeed(s, k);
        assert.equal(n, before(s, k), `${k} en ${mode} ${seed}, paso ${i}`);
        compared++; if (n > 0) positive++;
      }
      s.cells.forEach((c, j) => { // y lo que suelta cada fuente a demanda y cada almacén es esa misma necesidad
        const kind = c?.kind === 'stock' ? 'patty' : c && KINDS[c.kind].onDemand && KINDS[c.kind].emits;
        if (kind) assert.equal(sim.sourceNeed(s, j % s.W, Math.floor(j / s.W)), before(s, kind), `${c.kind} en ${mode} ${seed}, paso ${i}`);
      });
    }
  }
  assert.ok(compared > 30000 && positive > 1000, `comparó ${compared} veces, ${positive} con necesidad`);
});

// ---------- propiedad: varias armadoras no se traban ----------

/** Línea compacta en la fila y desde la columna ox: carne, parrilla, almacén, armadora, cinta y despacho; pan y queso entran a la armadora de costado. */
function compactLine(s, ox, y, bunAbove = true) {
  const put = (x, yy, kind, dir = 0) => sim.place(s, x, yy, kind, dir);
  put(ox, y, 'raw'); put(ox + 1, y, 'grill'); put(ox + 2, y, 'stock'); put(ox + 3, y, 'assembly'); put(ox + 4, y, 'belt'); put(ox + 5, y, 'dispatch');
  put(ox + 3, bunAbove ? y - 1 : y + 1, 'bun', bunAbove ? 1 : 3);
  put(ox + 3, bunAbove ? y + 1 : y - 1, 'cheese', bunAbove ? 3 : 1);
}

const TOPOLOGIES = {
  'dos líneas separadas': s => { compactLine(s, 0, 1); compactLine(s, 0, 5); },
  'tres líneas separadas': s => { compactLine(s, 0, 1); compactLine(s, 0, 4); compactLine(s, 0, 7); },
  // El pan de la segunda línea se recorre antes que el de la primera, y su almacén después: las fuentes no salen en el mismo orden.
  'dos líneas cruzadas en el recorrido': s => { compactLine(s, 0, 1, false); compactLine(s, 8, 1, true); },
  'pan, queso y carne compartidos con divisores': s => {
    const put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
    put(6, 2, 'assembly'); put(7, 2, 'belt'); put(8, 2, 'dispatch');
    put(6, 6, 'assembly'); put(7, 6, 'belt'); put(8, 6, 'dispatch');
    put(0, 4, 'raw'); put(1, 4, 'belt'); put(2, 4, 'splitter'); // la carne se reparte entre dos parrillas
    put(2, 3, 'belt', 3); put(2, 2, 'belt'); put(3, 2, 'grill'); put(4, 2, 'stock'); put(5, 2, 'belt');
    put(2, 5, 'belt', 1); put(2, 6, 'belt'); put(3, 6, 'grill'); put(4, 6, 'stock'); put(5, 6, 'belt');
    put(5, 4, 'bun'); put(6, 4, 'splitter'); put(6, 3, 'belt', 3); put(6, 5, 'belt', 1); // un solo pan para las dos
    put(8, 4, 'cheese'); put(9, 4, 'splitter'); // un solo queso para las dos
    for (const [x, y] of [[9, 3], [9, 2]]) put(x, y, 'belt', 3);
    for (const x of [9, 8, 7]) put(x, 1, 'belt', 2);
    put(6, 1, 'belt', 1);
    put(9, 5, 'belt', 1); put(9, 6, 'belt', 1);
    for (const x of [9, 8, 7]) put(x, 7, 'belt', 2);
    put(6, 7, 'belt', 3);
  },
};

test('propiedad: con dos y tres armadoras, 300 s de pedidos se entregan todos y ninguno queda trabado', () => {
  for (const [name, build] of Object.entries(TOPOLOGIES)) for (const seed of [1, 2, 3, 4]) {
    const s = blank();
    build(s);
    let r = seed * 2654435761 >>> 0, asked = 0;
    const rnd = n => Math.floor(((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32) * n);
    for (let i = 0; i < 3000; i++) {
      if (i % 50 === 0 && sim.addOrder(s, ['classic', 'cheese', 'double'][rnd(3)], true)) asked++;
      sim.step(s, STEP);
    }
    run(s, 120);
    const where = `${name}, semilla ${seed}`;
    assert.ok(asked >= 55, `${where}: se pidieron sólo ${asked}`);
    assert.deepEqual(s.orders.map(o => `#${o.id} ${o.recipeKey} ${o.status}`), [], `${where}: pedidos trabados`);
    assert.equal(s.stats.onTime, asked, where);
  }
});

// ---------- divisor ----------

/** Carne cruda (sale sola, sin pedidos) entra a un divisor en (1, 2) que mira al este; cuenta cuántas llegan a cada despacho. */
function splitterRig(front) {
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(0, 2, 'raw'); put(1, 2, 'splitter');
  put(1, 3, 'belt', 1); put(1, 4, 'dispatch'); // costado derecho (sur)
  put(1, 1, 'belt', 3); put(1, 0, 'dispatch'); // costado izquierdo (norte)
  front(put);
  const got = {};
  for (let i = 0; i < 600; i++) {
    sim.step(s, STEP);
    for (const e of s.events.splice(0)) if (e.type === 'waste') got[`${e.x},${e.y}`] = (got[`${e.x},${e.y}`] ?? 0) + 1;
  }
  return { s, got };
}

test('divisor: reparte por turnos entre el frente y los dos costados', () => {
  const { got } = splitterRig(put => { put(2, 2, 'belt'); put(3, 2, 'dispatch'); });
  const n = [got['3,2'], got['1,4'], got['1,0']];
  assert.ok(n.every(k => k >= 8) && Math.max(...n) - Math.min(...n) <= 1, `frente, derecha e izquierda: ${n}`);
});

test('divisor: una salida que nunca recibiría el producto no cuenta en los turnos', () => {
  const { s, got } = splitterRig(put => put(2, 2, 'stock')); // el almacén no recibe carne cruda
  const n = [got['1,4'], got['1,0']];
  assert.ok(n.every(k => k >= 12) && Math.abs(n[0] - n[1]) <= 1, `derecha e izquierda: ${n}`);
  assert.equal(sim.at(s, 2, 2).store, 0);
});

test('divisor: una salida llena se saltea y las otras siguen recibiendo', () => {
  const { s, got } = splitterRig(put => put(2, 2, 'belt')); // el frente es una cinta sin salida: se llena con la primera
  assert.ok(sim.at(s, 2, 2).item, 'la cinta del frente tendría que estar ocupada');
  assert.ok(got['1,4'] >= 12 && got['1,0'] >= 12, `derecha ${got['1,4']}, izquierda ${got['1,0']}`);
  assert.equal(sim.isStuck(s, 1, 2), false, 'el divisor tiene salida');
});

test('divisor: sólo recibe por atrás, y sin ninguna salida posible se marca sin salida', () => {
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(1, 0, 'raw', 1); put(1, 1, 'belt', 1); put(1, 2, 'splitter'); // la cinta le llega de costado
  put(4, 0, 'raw', 1); put(4, 1, 'splitter', 1); put(5, 1, 'grill'); put(3, 1, 'stock'); // de frente y a los costados, nada que reciba carne... salvo la parrilla
  put(7, 0, 'raw', 1); put(7, 1, 'splitter', 1); // sin nada alrededor
  run(s, 10);
  assert.equal(sim.at(s, 1, 2).item, null, 'entró por el costado');
  assert.equal(sim.isStuck(s, 1, 1), true, 'la cinta que apunta al costado del divisor no tiene salida');
  assert.equal(sim.isStuck(s, 4, 1), false, 'la parrilla recibe carne cruda: hay salida aunque esté llena');
  assert.ok(sim.at(s, 7, 1).item && sim.isStuck(s, 7, 1), 'un divisor sin salidas se marca como una cinta');
});

// ---------- puente ----------

/** Dos líneas de carne cruda que se cruzan en un puente en (2, 2): una de oeste a este y otra de norte a sur. */
function crossing(rotate = 0) {
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(0, 2, 'raw'); put(1, 2, 'belt'); put(2, 2, 'bridge', rotate); put(3, 2, 'belt'); put(4, 2, 'dispatch');
  put(2, 0, 'raw', 1); put(2, 1, 'belt', 1); put(2, 3, 'belt', 1); put(2, 4, 'dispatch');
  return s;
}

test('puente: dos líneas se cruzan sin mezclarse, cada una en su carril y a la vez', () => {
  const s = crossing(), got = {};
  let both = 0;
  for (let i = 0; i < 600; i++) {
    sim.step(s, STEP);
    const b = sim.at(s, 2, 2);
    if (b.item && b.item2) both++;
    for (const e of s.events.splice(0)) if (e.type === 'waste') got[`${e.x},${e.y}`] = (got[`${e.x},${e.y}`] ?? 0) + 1;
  }
  assert.deepEqual(Object.keys(got).sort(), ['2,4', '4,2'], 'cada producto sale por el lado opuesto al que entró');
  assert.ok(got['2,4'] >= 25 && got['4,2'] >= 25, JSON.stringify(got));
  assert.ok(both > 0, 'los dos carriles nunca llevaron algo a la vez');
});

test('puente: girarlo no tiene efecto', () => {
  const s = crossing(3);
  assert.equal(sim.at(s, 2, 2).dir, 0);
  assert.equal(sim.place(s, 2, 2, 'bridge', 1).reason, 'same');
  run(s, 20);
  assert.ok(s.stats.waste >= 16, 'el puente girado dejó de cruzar');
  assert.equal(sim.isStuck(s, 1, 2) || sim.isStuck(s, 2, 1), false);
});

test('puente: borrarlo con una hamburguesa en el segundo carril devuelve el pedido a la cola', () => {
  const s = blank();
  sim.place(s, 2, 2, 'bridge');
  sim.addOrder(s, 'classic', true);
  const o = s.orders[0];
  o.status = 'transit';
  sim.at(s, 2, 2).item2 = { id: 99, type: 'burger', orderId: o.id, recipeKey: 'classic', fx: 2, fy: 1, d: 1, t0: 0, readyAt: 0 };
  sim.erase(s, 2, 2);
  assert.equal(o.status, 'pending');
  assert.equal(s.stats.waste, 1);
});

test('puente y divisor: lo que llevan cuenta como lo que viaja; lo varado sin salida no, y se marca', () => {
  const s = blank();
  sim.place(s, 6, 6, 'assembly'); // lejos y sin conectar
  sim.addOrder(s, 'classic', true);
  assert.equal(sim.pendingNeed(s, 'bun'), 1);
  sim.place(s, 0, 0, 'bridge');
  Object.assign(sim.at(s, 0, 0), { item2: { id: 7, type: 'bun', fx: 0, fy: -1, d: 1, t0: 0, readyAt: 0 } });
  sim.place(s, 0, 1, 'dispatch'); // algo que lo recibe: va de paso
  assert.equal(sim.pendingNeed(s, 'bun'), 0, 'el pan del carril vertical del puente no cuenta');
  sim.erase(s, 0, 1); // ahora no llega a nada: no viaja, y no tapa el pan que falta
  assert.equal(sim.pendingNeed(s, 'bun'), 1, 'el pan varado sin salida cuenta como si viajara');
  run(s, 3);
  assert.equal(sim.isStuck(s, 0, 0, 'item2'), true, 'el carril vertical apunta a una celda vacía');
  assert.ok(sim.diagShares(sim.at(s, 0, 0)).blocked > 0.5, 'el puente trabado no cuenta como trabado');
  sim.erase(s, 0, 0);
  sim.place(s, 3, 0, 'splitter'); sim.place(s, 4, 0, 'dispatch');
  sim.at(s, 3, 0).item = { id: 8, type: 'bun', fx: 2, fy: 0, d: 0, t0: 0, readyAt: 0 };
  assert.equal(sim.pendingNeed(s, 'bun'), 0, 'el pan del divisor no cuenta');
});

test('reparto: cada fuente suelta para las armadoras a las que llega, no para la de al lado', () => {
  const s = twoLines({}, { patty: 1 }, 0); // la segunda armadora cubre más del pedido doble: el pan es para ella
  assert.equal(sim.pendingNeed(s, 'bun'), 1);
  assert.deepEqual([sim.sourceNeed(s, 2, 3), sim.sourceNeed(s, 2, 7)], [0, 1], 'pan de la primera línea y de la segunda');
  run(s, 6);
  assert.deepEqual([sim.at(s, 2, 1).inv.bun, sim.at(s, 2, 5).inv.bun], [0, 1], 'el pan fue a la armadora equivocada');
});

test('reparto: lo que espera en la cinta de una armadora llena no le tapa el pan a la otra', () => {
  // Un pan compartido por divisor: la armadora de abajo está llena de pan y tiene otro esperando en su cinta.
  const s = blank(), put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(0, 2, 'bun'); put(1, 2, 'splitter');
  put(1, 1, 'belt', 3); put(1, 0, 'assembly'); put(2, 0, 'dispatch');
  put(1, 3, 'belt', 1); put(1, 4, 'assembly'); put(2, 4, 'dispatch');
  Object.assign(sim.at(s, 1, 0).inv, { patty: 1, cheese: 1 });
  sim.at(s, 1, 4).inv.bun = 8;
  sim.at(s, 1, 3).item = { id: 50, type: 'bun', fx: 1, fy: 2, d: 1, t0: 0, readyAt: 0 };
  sim.addOrder(s, 'cheese', true);
  assert.equal(sim.pendingNeed(s, 'bun'), 1, 'el pan que va a la armadora llena no le sirve a la de arriba');
  run(s, 15);
  assert.equal(s.stats.onTime, 1, 'el pedido quedó trabado');
});

// ---------- propiedad: cocinas mixtas ----------

/** Una línea compacta cuyo pan pasa por un divisor: el frente va a la armadora y los costados a otra cosa. */
function splitBunLine(s, sides) {
  const put = (x, y, kind, dir = 0) => sim.place(s, x, y, kind, dir);
  put(0, 2, 'raw'); put(1, 2, 'grill'); put(2, 2, 'stock'); put(3, 2, 'assembly'); put(4, 2, 'belt'); put(5, 2, 'dispatch');
  put(3, 3, 'cheese', 3); put(3, 0, 'bun', 1); put(3, 1, 'splitter', 1); // el divisor mira al sur: su frente es la armadora
  sides(put);
}

const MIXED = {
  'dos armadoras con divisores y una tercera en línea separada (al costado)': s => { TOPOLOGIES['pan, queso y carne compartidos con divisores'](s); compactLine(s, 11, 2); },
  'dos armadoras con divisores y una tercera en línea separada (abajo, pan por debajo)': s => { TOPOLOGIES['pan, queso y carne compartidos con divisores'](s); compactLine(s, 11, 7, false); },
  'un divisor reparte el pan entre la armadora y una cinta sin salida': s => splitBunLine(s, put => { put(2, 1, 'belt', 2); put(1, 1, 'belt', 2); put(4, 1, 'belt'); }),
  'un divisor reparte el pan entre la armadora y el despacho': s => splitBunLine(s, put => { put(2, 1, 'belt', 2); put(1, 1, 'belt', 2); put(0, 1, 'dispatch'); put(4, 1, 'belt'); put(5, 1, 'dispatch'); }),
};

test('propiedad: en cocinas mixtas, 300 s de pedidos se entregan todos y ninguno queda trabado', () => {
  for (const [name, build] of Object.entries(MIXED)) for (const seed of [1, 2, 3, 4]) {
    const s = blank();
    build(s);
    let r = seed * 2654435761 >>> 0, asked = 0;
    const rnd = n => Math.floor(((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32) * n);
    for (let i = 0; i < 3000; i++) {
      if (i % 50 === 0 && sim.addOrder(s, ['classic', 'cheese', 'double'][rnd(3)], true)) asked++;
      sim.step(s, STEP);
    }
    run(s, 120);
    const where = `${name}, semilla ${seed}`;
    if (process.env.MIXED_REPORT) console.log(`${where}: pedidos ${asked}, a tiempo ${s.stats.onTime}, tarde ${s.stats.late}, en cola ${s.orders.length}, desperdicio ${s.stats.waste}`);
    assert.deepEqual(s.orders.map(o => `#${o.id} ${o.recipeKey} ${o.status}`), [], `${where}: pedidos trabados`);
    assert.equal(s.stats.onTime + s.stats.late, asked, where);
  }
});

// ---------- bridgeFlow: hacia dónde corre cada carril del puente ----------

/** Un modo libre vacío con un puente en (3, 3). */
function flowBoard() {
  const s = sim.newGame('sandbox', 1);
  s.autoOrders = false; s.orders.length = 0; s.cells.fill(null);
  sim.place(s, 3, 3, 'bridge');
  return s;
}

test('bridgeFlow: una cinta desde cada uno de los cuatro lados marca su carril y su sentido', () => {
  const cases = [[2, 3, 0, [0, null]], [3, 2, 1, [null, 1]], [4, 3, 2, [2, null]], [3, 4, 3, [null, 3]]];
  for (const [x, y, d, want] of cases) {
    const s = flowBoard();
    sim.place(s, x, y, 'belt', d);
    assert.deepEqual(sim.bridgeFlow(s, 3, 3), want, `cinta en ${x},${y} hacia ${d}`);
    sim.place(s, x, y, 'belt', (d + 2) % 4);
    assert.deepEqual(sim.bridgeFlow(s, 3, 3), [null, null], 'una cinta que se aleja no alimenta');
  }
  assert.deepEqual(sim.bridgeFlow(flowBoard(), 3, 3), [null, null], 'sin vecinos, nada');
});

test('bridgeFlow: divisor de costado, máquina, despacho y otro puente en cadena', () => {
  let s = flowBoard();
  sim.place(s, 3, 2, 'splitter', 0); // mira al este: su costado derecho (sur) da al puente
  assert.deepEqual(sim.bridgeFlow(s, 3, 3), [null, 1]);
  s = flowBoard();
  sim.place(s, 2, 3, 'grill', 0);
  assert.deepEqual(sim.bridgeFlow(s, 3, 3), [0, null]);
  sim.place(s, 2, 3, 'dispatch', 0);
  assert.deepEqual(sim.bridgeFlow(s, 3, 3), [null, null], 'el despacho no saca');
  s = flowBoard();
  sim.place(s, 4, 3, 'bridge'); sim.place(s, 5, 3, 'bridge'); sim.place(s, 6, 3, 'belt', 2);
  assert.deepEqual(sim.bridgeFlow(s, 3, 3), [2, null], 'la cadena de puentes lleva el sentido de la cinta');
  sim.place(s, 6, 3, 'belt', 0);
  assert.deepEqual(sim.bridgeFlow(s, 3, 3), [null, null]);
  sim.place(s, 2, 3, 'bridge');
  assert.deepEqual(sim.bridgeFlow(s, 4, 3), [null, null], 'puentes sin cinta no se alimentan entre sí');
});

test('bridgeFlow: un carril con producto manda su sentido, aunque una cinta empuje al revés', () => {
  const s = flowBoard();
  sim.place(s, 2, 3, 'belt', 0);
  sim.at(s, 3, 3).item = { id: 1, type: 'bun', d: 2, readyAt: 0 };
  sim.at(s, 3, 3).item2 = { id: 2, type: 'bun', d: 3, readyAt: 0 };
  assert.deepEqual(sim.bridgeFlow(s, 3, 3), [2, 3]);
});
