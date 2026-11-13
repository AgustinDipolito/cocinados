// Etapa 6: locales con forma. Tiempo simulado y semilla fija.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { STEP, RECIPES, START_MONEY, LOTS, CAREER_LOTS, LOT, LOTGEN, LIMITS } from '../src/data.js';

const run = (s, seconds) => { for (let i = 0; i < Math.round(seconds / STEP) && !s.over; i++) sim.step(s, STEP); return s; };
const floor = s => s.cells.map(c => c !== false);

for (const key of CAREER_LOTS) {
  test(`local ${key}: la cocina inicial entrega a tiempo el primer pedido y lo cobra`, () => {
    const s = sim.newGame('career', 1, key);
    assert.equal(s.lot, key);
    assert.deepEqual([s.W, s.H], [sim.lotOf(key, 1).w, sim.lotOf(key, 1).h]);
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
  s.level = LIMITS.raw[1]; sim.place(s, 3, 5, 'raw', 0); s.level = 1; sim.place(s, 4, 5, 'belt', 3); // la segunda fuente de carne entra en su nivel
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
    const L = sim.lotOf(key, 1), s = sim.newGame('career', 1, key), [gw, gh] = L.grow ?? [LOT.growW, LOT.growH];
    s.money = 1e6;
    sim.expand(s);
    assert.deepEqual([s.W, s.H], [L.w + gw, L.h + gh], key);
  }
});

test('cada local se abre llegando al nivel 4 en el anterior; El clásico está siempre abierto', () => {
  const best = rec => k => rec[k] ?? null;
  assert.ok(sim.lotOpen('classic', best({})));
  assert.ok(!sim.lotOpen('hall', best({})));
  assert.ok(!sim.lotOpen('hall', best({ classic: { level: 3 } })));
  assert.ok(sim.lotOpen('hall', best({ classic: { level: 4 } })));
  assert.ok(!sim.lotOpen('corner', best({ classic: { level: 9 } })));
  const chain = CAREER_LOTS.filter(k => !LOTS[k].gen); // los locales de forma fija se abren en cadena
  chain.slice(1).forEach((k, i) => assert.equal(LOTS[k].unlock[0], chain[i], `${k} se abre con el anterior`));
  assert.ok(sim.lotOpen('random', best({})), 'La sorpresa está siempre abierta: su enlace se comparte con quien nunca jugó');
});

// ---------- La sorpresa: sala generada con semilla ----------

const cellsOf = list => list.flatMap(([, x, y, , x2 = x, y2 = y]) => { const out = []; for (let j = y; j <= y2; j++) for (let i = x; i <= x2; i++) out.push([i, j]); return out; });
const inRange = (v, [a, b]) => v >= a && v <= b;
const shapeOf = L => (!L.holes.length ? 'none' : L.holes[0][0] === 0 && L.holes[0][1] === 0 ? 'corner' : L.holes[0][1] === 0 ? 'top' : 'left');
const flipped = L => L.kitchen.find(k => k[0] === 'raw')[2] > L.kitchen.find(k => k[0] === 'bun')[2];

test('sala generada: para 300 semillas, tamaño en rango, cocina sobre piso, agujeros arriba o a la izquierda, columnas lejos de la cocina', () => {
  const signs = new Set(), shapes = new Set(), flips = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const L = sim.lotOf('random', seed), s = sim.newGame('career', seed, 'random'), why = `semilla ${seed}`;
    assert.ok(inRange(L.w, LOTGEN.w) && inRange(L.h, LOTGEN.h), why);
    assert.deepEqual([s.W, s.H, s.lotSeed], [L.w, L.h, seed], why);
    const kitchen = cellsOf(L.kitchen);
    for (const [x, y] of kitchen) assert.ok(sim.valid(s, x, y) && sim.at(s, x, y), `${why}: la cocina pisa ${x},${y}`);
    for (const [x0, y0, x1, y1] of L.holes) {
      assert.ok(x0 === 0 || y0 === 0, `${why}: agujero lejos del borde de arriba o del izquierdo`);
      assert.ok(inRange(x1 - x0 + 1, [2, 4]) && inRange(y1 - y0 + 1, [1, 3]), why);
    }
    assert.ok(inRange(L.pillars.length, LOTGEN.pillars), `${why}: ${L.pillars.length} columnas`);
    for (const [px, py] of L.pillars) {
      assert.equal(sim.valid(s, px, py), false, why);
      assert.ok(!kitchen.some(([x, y]) => Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1), `${why}: columna ${px},${py} toca la cocina`);
    }
    const asm = L.kitchen.find(k => k[0] === 'assembly');
    assert.ok(sim.valid(s, asm[1], asm[2] + (flipped(L) ? -1 : 1)), `${why}: la armadora sin costado libre para el queso`);
    signs.add(JSON.stringify([L.w, L.h, L.holes, L.pillars]));
    shapes.add(shapeOf(L));
    flips.add(flipped(L));
  }
  assert.ok(signs.size >= 100, `sólo ${signs.size} salas distintas`);
  assert.deepEqual([...shapes].sort(), ['corner', 'left', 'none', 'top']);
  assert.equal(flips.size, 2, 'la cocina sale siempre con la misma orientación');
});

test('sala generada: la cocina inicial entrega a tiempo el primer pedido y lo cobra, en las 300 semillas', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s = sim.newGame('career', seed, 'random');
    while (!s.stats.onTime && s.time < 60 && !s.over) sim.step(s, STEP);
    assert.ok(s.stats.onTime === 1 && s.time < RECIPES.classic.deadline, `semilla ${seed}: tardó ${s.time.toFixed(1)} s`);
    assert.equal(s.money, START_MONEY + RECIPES.classic.price, `semilla ${seed}`);
  }
});

test('sala generada: la misma semilla da la misma sala y la misma partida; otra semilla, otra sala', () => {
  const a = JSON.stringify(sim.lotOf('random', 42));
  sim.lotOf('random', 43);
  assert.equal(JSON.stringify(sim.lotOf('random', 42)), a, 'el caché no cambia la sala');
  assert.equal(sim.serialize(run(sim.newGame('career', 42, 'random'), 90)), sim.serialize(run(sim.newGame('career', 42, 'random'), 90)));
  assert.notEqual(JSON.stringify(sim.lotOf('random', 43)), a);
  assert.equal(sim.newGame('career', 42, 'classic').lotSeed, null, 'un local común no guarda semilla');
});

test('sala generada: ampliar conserva lo que no es piso, y guardar y volver conserva la semilla y la forma', () => {
  let seed = 1;
  while (!sim.lotOf('random', seed).holes.length) seed++;
  const s = sim.newGame('career', seed, 'random');
  s.money = 1e6;
  const before = floor(s), W0 = s.W;
  assert.deepEqual(sim.expand(s), { ok: true });
  for (let i = 0; i < before.length; i++) assert.equal(sim.valid(s, i % W0, Math.floor(i / W0)), before[i]);
  sim.lotOf('random', seed + 1); // otra sala en el caché
  const back = sim.deserialize(sim.serialize(s));
  assert.deepEqual([back.lot, back.lotSeed], ['random', seed]);
  assert.deepEqual(floor(back), floor(s));
});
