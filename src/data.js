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
export const BUILD_ORDER = ['belt', 'splitter', 'bridge', 'raw', 'bun', 'cheese', 'grill', 'stock', 'assembly', 'dispatch'];

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
