// Etapa 6: locales con forma. Tiempo simulado y semilla fija.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, RECIPES, START_MONEY, LOTS, CAREER_LOTS, LOT } from '../src/data.js';

const run = (s, seconds) => { for (let i = 0; i < Math.round(seconds / STEP) && !s.over; i++) sim.step(s, STEP); return s; };
const floor = s => s.cells.map(c => c !== false);

for (const key of CAREER_LOTS) {
  test(`local ${key}: la cocina inicial entrega a tiempo el primer pedido y lo cobra`, () => {
    const s = sim.newGame('career', 1, key);
    assert.equal(s.lot, key);
    assert.deepEqual([s.W, s.H], [LOTS[key].w, LOTS[key].h]);
    while (!s.stats.onTime && s.time < 60 && !s.over) sim.step(s, STEP);
    assert.ok(s.stats.onTime === 1 && s.time < RECIPES.classic.deadline, `tardó ${s.time.toFixed(1)} s`);
    assert.equal(s.money, START_MONEY + RECIPES.classic.price);
    assert.equal(s.stats.late + s.stats.expired + s.stats.waste, 0);
  });
}

test('El clásico es la Carrera de siempre: mismo terreno y misma partida que sin elegir local', () => {
  assert.deepEqual([LOTS.classic.w, LOTS.classic.h], [LOT.career.w, LOT.career.h]);
  assert.equal(sim.serialize(run(sim.newGame('career', 7, 'classic'), 120)), sim.serialize(run(sim.newGame('career', 7), 120)));
  assert.equal(sim.newGame('career', 1).cells.filter(c => c === false).length, 0);
});

test('lo que no es piso: no se construye, no se borra, no recibe productos y sigue así al ampliar', () => {
  const s = sim.newGame('career', 1, 'columns');
  s.money = 1e6;
  assert.equal(s.cells.filter(c => c === false).length, 4);
  assert.equal(sim.valid(s, 4, 2), false);
  assert.equal(sim.at(s, 4, 2), null);
  assert.deepEqual(sim.place(s, 4, 2, 'belt', 0), { ok: false, reason: 'out' });
  assert.equal(sim.erase(s, 4, 2), false);
  // una cinta que apunta a una columna: el producto queda sin salida y nunca entra
  sim.place(s, 3, 5, 'raw', 0); sim.place(s, 4, 5, 'belt', 3);
  run(s, 10);
  assert.equal(s.cells[2 * s.W + 4], false);
  assert.ok(sim.isStuck(s, 4, 5), 'la cinta que da contra la columna se marca sin salida');
  const L = sim.newGame('career', 1, 'corner');
  L.money = 1e6;
  const before = floor(L), W0 = L.W;
  assert.deepEqual(sim.place(L, 0, 0, 'belt', 0), { ok: false, reason: 'out' });
  assert.deepEqual(sim.expand(L), { ok: true });
  for (let i = 0; i < before.length; i++) {
    const x = i % W0, y = Math.floor(i / W0);
    assert.equal(sim.valid(L, x, y), before[i], `celda ${x},${y}`);
  }
  assert.ok(sim.valid(L, L.W - 1, 0) && sim.valid(L, 0, L.H - 1), 'lo que suma la ampliación es piso');
  const back = sim.deserialize(sim.serialize(L));
  assert.deepEqual(floor(back), floor(L), 'guardar conserva la forma');
  assert.equal(back.lot, 'corner');
});

test('una máquina fija no se borra, ni se reemplaza, ni se gira, pero se inspecciona y trabaja', () => {
  const s = sim.newGame('career', 1, 'island');
  s.money = 1e6;
  const c = sim.at(s, 6, 3);
  assert.ok(c.fixed && c.kind === 'dispatch');
  assert.equal(sim.erase(s, 6, 3), false);
  assert.deepEqual(sim.place(s, 6, 3, 'belt', 0), { ok: false, reason: 'fixed' });
  assert.deepEqual(sim.place(s, 6, 3, 'dispatch', 1), { ok: false, reason: 'fixed' });
  assert.equal(sim.at(s, 6, 3), c);
  assert.equal(s.money, 1e6, 'no cobró ni devolvió nada');
  assert.ok(sim.erase(s, 5, 3), 'lo que no es fijo se borra como siempre');
  assert.ok(sim.deserialize(sim.serialize(s)).cells[3 * s.W + 6].fixed, 'guardar conserva la marca');
});

test('ampliar suma lo que dice cada local', () => {
  for (const key of CAREER_LOTS) {
    const s = sim.newGame('career', 1, key), [gw, gh] = LOTS[key].grow ?? [LOT.growW, LOT.growH];
    s.money = 1e6;
    sim.expand(s);
    assert.deepEqual([s.W, s.H], [LOTS[key].w + gw, LOTS[key].h + gh], key);
  }
});

test('cada local se abre llegando al nivel 4 en el anterior; El clásico está siempre abierto', () => {
  const best = rec => k => rec[k] ?? null;
  assert.ok(sim.lotOpen('classic', best({})));
  assert.ok(!sim.lotOpen('hall', best({})));
  assert.ok(!sim.lotOpen('hall', best({ classic: { level: 3 } })));
  assert.ok(sim.lotOpen('hall', best({ classic: { level: 4 } })));
  assert.ok(!sim.lotOpen('corner', best({ classic: { level: 9 } })));
  CAREER_LOTS.slice(1).forEach((k, i) => assert.equal(LOTS[k].unlock[0], CAREER_LOTS[i], `${k} se abre con el anterior`));
});
