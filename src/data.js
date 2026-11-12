// Todo el balance del juego vive acá: una máquina, receta o nivel nuevo se agrega en esta tabla.
// La plata va siempre en enteros.

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // este, sur, oeste, norte

export const STEP = 0.1;        // paso fijo de la simulación, en segundos
export const BELT_TIME = 0.4;   // lo que tarda un producto en cruzar una celda de cinta
export const STUCK_AFTER = 2.5; // segundos quieto antes de avisar que no tiene salida
export const QUEUE_MAX = 7;
export const LATE_PAY = 0.55;
export const GRACE = 20;        // segundos después del plazo antes de que el cliente se vaya
export const HEARTS = 5;
export const REFUND = 0.5;
export const CAP = { grillRaw: 3, grillCooked: 2, stock: 8, inv: 8 };
export const TIMES = { cook: 5, assemble: 4, grillOut: 0.42, stockOut: 0.52, assemblyOut: 0.55 };

// emits: qué saca una fuente · every: cada cuántos segundos · onDemand: sólo si hay pedidos que lo pidan
// carries: lleva productos de paso como una cinta (no es máquina para el diagnóstico) · noTurn: girarla no cambia nada
export const KINDS = {
  belt:     { cost: 2, carries: true },
  splitter: { cost: 35, carries: true },
  bridge:   { cost: 60, carries: true, noTurn: true },
  raw:      { cost: 30, emits: 'raw', every: 2.1 },
  bun:      { cost: 25, emits: 'bun', every: 2.0, onDemand: true },
  cheese:   { cost: 25, emits: 'cheese', every: 2.3, onDemand: true },
  grill:    { cost: 60 },
  stock:    { cost: 40 },
  assembly: { cost: 90 },
  dispatch: { cost: 50 },
};
// Mejoras: un solo nivel por máquina, se compran desde el inspector. burners: carnes a la vez en la parrilla ·
// assemble: segundos por pedido en la armadora · stock: carnes que guarda el almacén.
export const UPGRADES = {
  grill:    { cost: 140, burners: 2 },
  assembly: { cost: 180, assemble: 2.5 },
  stock:    { cost: 60, stock: 16 },
};
export const BUILD_ORDER =['belt', 'splitter', 'bridge', 'raw', 'bun', 'cheese', 'grill', 'stock', 'assembly', 'dispatch'];

// Qué fuente hace falta para cada ingrediente de una receta.
export const SOURCE_OF = { bun: 'bun', patty: 'raw', cheese: 'cheese' };
export const INGREDIENTS = ['bun', 'patty', 'cheese'];

export const RECIPES = {
  classic: { bun: 1, patty: 1, cheese: 0, price: 24, deadline: 45, level: 1, weight: 30 },
  cheese:  { bun: 1, patty: 1, cheese: 1, price: 31, deadline: 52, level: 2, weight: 42 },
  double:  { bun: 1, patty: 2, cheese: 1, price: 43, deadline: 60, level: 3, weight: 28 },
};

// El modo libre conserva los plazos largos del prototipo.
export const SANDBOX_DEADLINE = { classic: 85, cheese: 98, double: 112 };
export const SANDBOX_INTERVAL = 17;

// Diagnóstico de cuello de botella. tau: segundos en que el acumulado de cada celda decae a 1/e (pesa más
// el último minuto) · tie: diferencia de trabajo que se toma como empate · minWork: con menos trabajo que
// esto no hay cuello de botella · jam: proporción bloqueada desde la que la capa de atascos marca la celda.
export const DIAG = { tau: 60, tie: 0.02, minWork: 0.05, jam: 0.5 };

export const START_MONEY = 100;
export const orderInterval = level => Math.max(3.5, 13 - 2.5 * (level - 1)); // segundos entre clientes
export const deliveriesFor = level => level * level + 3 * level; // entregas acumuladas para pasar de `level`

export const LOT = {
  career: { w: 12, h: 7 },
  sandbox: { w: 17, h: 10 },
  growW: 4, growH: 2, maxExpansions: 5,
  cost: n => 150 * (n + 1),
};

// Locales: la forma del terreno es el nivel. Un local no sabe de modos, así un desafío puede ser un local más.
//   w, h      tamaño inicial
//   holes     rectángulos [x0, y0, x1, y1] fuera del local: no son piso (el borde lleva pared)
//   pillars   rectángulos de columnas: tampoco son piso, y se ven como columnas
//   kitchen   piezas iniciales [máquina, x, y, dirección, x2, y2]: de (x, y) a (x2, y2) si es una tira
//   fixed     celdas [x, y] cuya máquina no se borra, ni se reemplaza, ni se gira (sí se inspecciona)
//   grow      [ancho, alto] que suma cada ampliación, a la derecha y abajo (sin grow, LOT.growW y LOT.growH)
//   unlock    [local, nivel]: se abre al llegar a ese nivel en ese local (sin unlock, abierto)
// Los agujeros se ponen arriba o a la izquierda: ampliar suma piso a la derecha y abajo, y un agujero en
// esos bordes quedaría rodeado de piso nuevo.
export const LOTS = {
  classic: { ...LOT.career, kitchen: [ // una sola línea: clásica. El queso lo construye quien juega al llegar al nivel 2.
    ['raw', 1, 1], ['belt', 2, 1], ['grill', 3, 1], ['belt', 4, 1], ['stock', 5, 1], ['belt', 6, 1], ['belt', 7, 1, 1, 7, 2],
    ['bun', 1, 3], ['belt', 2, 3, 0, 6, 3], ['assembly', 7, 3], ['belt', 8, 3, 0, 9, 3], ['dispatch', 10, 3]] },
  hall: { w: 16, h: 4, grow: [4, 1], unlock: ['classic', 4], kitchen: [
    ['raw', 1, 1], ['belt', 2, 1], ['grill', 3, 1], ['belt', 4, 1], ['stock', 5, 1], ['belt', 6, 1, 0, 9, 1],
    ['assembly', 10, 1], ['belt', 11, 1, 0, 12, 1], ['dispatch', 13, 1], ['bun', 10, 3, 3], ['belt', 10, 2, 3]] },
  corner: { w: 12, h: 8, holes: [[0, 0, 7, 4]], unlock: ['hall', 4], kitchen: [ // el despacho en la punta del brazo corto
    ['raw', 0, 6], ['belt', 1, 6], ['grill', 2, 6], ['belt', 3, 6], ['stock', 4, 6], ['belt', 5, 6, 0, 8, 6],
    ['assembly', 9, 6, 3], ['bun', 11, 6, 2], ['belt', 10, 6, 2], ['belt', 9, 1, 3, 9, 5], ['dispatch', 9, 0]] },
  columns: { ...LOT.career, pillars: [[4, 2, 4, 2], [7, 2, 7, 2], [4, 4, 4, 4], [7, 4, 7, 4]], unlock: ['corner', 4], kitchen: [
    ['raw', 1, 1], ['belt', 2, 1], ['grill', 3, 1], ['belt', 4, 1], ['stock', 5, 1], ['belt', 6, 1, 0, 7, 1], ['belt', 8, 1, 1, 8, 2],
    ['bun', 1, 3], ['belt', 2, 3, 0, 7, 3], ['assembly', 8, 3], ['belt', 9, 3, 0, 10, 3], ['dispatch', 11, 3]] },
  island: { ...LOT.career, fixed: [[6, 3]], unlock: ['columns', 4], kitchen: [ // el despacho fijo en el medio
    ['raw', 0, 1], ['belt', 1, 1], ['grill', 2, 1], ['belt', 3, 1], ['stock', 4, 1], ['belt', 5, 1, 1, 5, 2],
    ['bun', 0, 3], ['belt', 1, 3, 0, 4, 3], ['assembly', 5, 3], ['dispatch', 6, 3]] },
  sandbox: { ...LOT.sandbox, kitchen: [ // la cocina del prototipo, celda por celda
    ['raw', 1, 1], ['belt', 2, 1, 0, 3, 1], ['grill', 4, 1], ['belt', 5, 1, 0, 6, 1], ['stock', 7, 1], ['belt', 8, 1, 0, 9, 1], ['belt', 10, 1, 1, 10, 4],
    ['bun', 1, 5], ['belt', 2, 5, 0, 9, 5], ['assembly', 10, 5], ['belt', 11, 5, 0, 13, 5], ['dispatch', 14, 5],
    ['cheese', 1, 8], ['belt', 2, 8, 0, 9, 8], ['belt', 10, 6, 3, 10, 8]] },
};
export const CAREER_LOTS = ['classic', 'hall', 'corner', 'columns', 'island']; // el orden del inicio
