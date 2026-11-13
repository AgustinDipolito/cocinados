// Simulación pura: sin DOM, sin three y sin reloj del sistema. El estado es un objeto plano
// (se guarda con JSON) y todo lo que pasa se anuncia en state.events para que lo dibuje quien quiera.
import {
  DIRS, BELT_TIME, STUCK_AFTER, QUEUE_MAX, LATE_PAY, GRACE, HEARTS, REFUND, CAP, TIMES, KINDS,
  SOURCE_OF, INGREDIENTS, RECIPES, SANDBOX_DEADLINE, SANDBOX_INTERVAL, START_MONEY, orderInterval,
  deliveriesFor, LOT, LOTS, LOTGEN, DIAG, UPGRADES, PUZZLES, PUZZLE_REFUND, PUZZLE_ORDER, PICKS, UNDO, GROUP,
} from './data.js';

export const SAVE_VERSION = 8;

function rand(s) { // mulberry32: el azar sale de la semilla guardada, así una partida se puede repetir
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const make = (kind, dir = 0) => ({
  // cooking: lo que tiene cada hornalla ocupada, de la más vieja a la más nueva (segundos que le faltan; 0 = lista sin lugar)
  // up: tiene su mejora (UPGRADES)
  kind, dir, item: null, cooldown: 0, rawCount: 0, cooked: 0, cooking: [], up: false, store: 0,
  inv: { bun: 0, patty: 0, cheese: 0 }, job: null, output: null,
  item2: null, turn: 0, // item2: carril norte-sur del puente (item lleva el este-oeste) · turn: a qué salida le toca en el divisor o el filtro
  pick: PICKS[0], // lo que el filtro saca por los costados
  diag: { work: 0, blocked: 0, wait: 0, idle: 0 }, // segundos recientes en cada estado (ver track)
});

// Una celda que no es piso (agujero o columna del local) vale false en s.cells: no es válida, at() la da null
// y así queda inerte en todo recorrido. null es piso vacío.
export const valid = (s, x, y) => x >= 0 && x < s.W && y >= 0 && y < s.H && s.cells[y * s.W + x] !== false;
export const at = (s, x, y) => (valid(s, x, y) ? s.cells[y * s.W + x] : null);
const put = (s, x, y, kind, dir = 0) => { s.cells[y * s.W + x] = make(kind, dir); };
const emit = (s, type, data) => s.events.push({ type, ...data });
const isCareer = s => s.mode === 'career';
const paid = s => s.mode !== 'sandbox'; // Carrera y desafío cobran; el modo libre no
const isPuzzle = s => s.mode === 'puzzle';

export const cost = (s, kind) => (paid(s) ? KINDS[kind].cost : 0);
export const upgradeCost = (s, kind) => (paid(s) ? UPGRADES[kind].cost : 0);
/** Lo que devuelve borrar o reemplazar la máquina c: la mitad de lo invertido en ella (máquina más mejora); en un desafío, todo. */
export const refund = (s, c) => Math.floor((cost(s, c.kind) + (c.up ? upgradeCost(s, c.kind) : 0)) * (isPuzzle(s) ? PUZZLE_REFUND : REFUND));
// Lo que la mejora cambia: cada lugar que lee estos valores lee los de la celda.
export const burners = c => (c.up ? UPGRADES.grill.burners : 1);
export const stockCap = c => (c.up ? UPGRADES.stock.stock : CAP.stock);
export const assembleTime = c => (c.up ? UPGRADES.assembly.assemble : TIMES.assemble);
export const expandCost = s => (isCareer(s) ? LOT.cost(s.expansions) : 0);
export const canExpand = s => !isPuzzle(s) && s.expansions < LOT.maxExpansions;
/** [ancho, alto] que suma cada ampliación del local de la partida. */
export const lotGrow = s => lotOf(s.lot, s.lotSeed).grow ?? [LOT.growW, LOT.growH];
/** Si el local está abierto. best(local): el récord { level } de ese local, o null. La apertura no depende de la semilla. */
export const lotOpen = (key, best) => { const u = LOTS[key].unlock; return !u || (best(u[0])?.level ?? 0) >= u[1]; };

let genCache = null; // el último local generado: la escena lo pide en cada cuadro
/** El local como datos: el de LOTS, o el generado con esa semilla si el local es de los que se generan (gen). */
export function lotOf(key, seed) {
  const L = LOTS[key];
  if (!L.gen) return L;
  if (genCache?.key !== key || genCache.seed !== seed) genCache = { key, seed, lot: { ...L, ...generateLot(seed) } };
  return genCache.lot;
}

/**
 * Sala de La sorpresa. Los agujeros tocan el borde de arriba o el izquierdo (ampliar suma a la derecha y abajo).
 * La cocina es la línea de El clásico trasladada y a veces espejada; nada de columnas tocándola, ni en diagonal,
 * y el costado libre de la armadora es piso, para que siempre se pueda sumar el queso.
 */
function generateLot(seed) {
  const r = { seed: (seed ^ 0x2545F491) | 0 }; // mezclada: el local no se correlaciona con el azar de los pedidos
  const int = (a, b) => a + Math.floor(rand(r) * (b - a + 1));
  const w = int(...LOTGEN.w), h = int(...LOTGEN.h), shape = int(0, 3), hw = int(2, 4), hh = int(1, 3);
  const holes = [
    [], [[0, 0, hw - 1, hh - 1]], // sin agujero · muesca arriba a la izquierda
    (x0 => [[x0, 0, x0 + hw - 1, hh - 1]])(int(2, w - 3 - hw)), // entrada en la pared de arriba, lejos de las esquinas
    (y0 => [[0, y0, hw - 1, y0 + hh - 1]])(int(1, h - 2 - hh)), // muesca en el borde izquierdo
  ][shape];
  const inHole = (x, y) => holes.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  const floor = (x, y) => x >= 0 && x < w && y >= 0 && y < h && !inHole(x, y);
  // la línea clásica ocupa x 1..10 e y 1..3; la armadora está en (7, 3) y su costado libre en (7, 4)
  const place = (ox, oy, flip) => {
    const Y = y => oy + (flip ? 3 - y : y - 1);
    const kitchen = LOTS.classic.kitchen.map(([k, x, y, d = 0, x2 = x, y2 = y]) => {
      const [ya, yb] = [Y(y), Y(y2)].sort((a, b) => a - b);
      return [k, ox + x - 1, ya, flip && d % 2 ? 4 - d : d, ox + x2 - 1, yb];
    });
    return { kitchen, free: [ox + 6, Y(4)] };
  };
  let k = null;
  for (let i = 0; i < LOTGEN.tries && !k; i++) {
    const cand = place(int(0, w - 10), int(0, h - 3), rand(r) < 0.5);
    const cells = cand.kitchen.flatMap(([, x, y, , x2, y2]) => Array.from({ length: (x2 - x + 1) * (y2 - y + 1) }, (_, j) => [x + (j % (x2 - x + 1)), y + Math.floor(j / (x2 - x + 1))]));
    if ([...cells, cand.free].every(([x, y]) => floor(x, y))) k = cand;
  }
  if (!k) { holes.length = 0; k = place(int(0, w - 10), 1, rand(r) < 0.5); } // sin agujero, en la fila 1 entra siempre con el costado de la armadora
  const near = (x, y) => k.kitchen.some(([, x0, y0, , x1, y1]) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1);
  const pillars = [], want = int(...LOTGEN.pillars);
  for (let i = 0; i < 200 && pillars.length < want; i++) {
    const x = int(0, w - 1), y = int(0, h - 1);
    if (floor(x, y) && !near(x, y) && !pillars.some(p => p[0] === x && p[1] === y)) pillars.push([x, y, x, y]);
  }
  return { w, h, holes, pillars, kitchen: k.kitchen };
}
export const deadline = (s, key) => (paid(s) ? RECIPES[key].deadline : SANDBOX_DEADLINE[key]);
export const delivered = s => s.stats.onTime + s.stats.late;
export const lost = s => s.stats.expired + s.stats.turnedAway;

/** Pone las piezas iniciales del local, marca sus máquinas fijas y lo que no es piso. */
function buildLot(s, lot) {
  const rects = (list, f) => { for (const [x0, y0, x1, y1] of list ?? []) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(x, y); };
  for (const [kind, x, y, dir = 0, x2 = x, y2 = y] of lot.kitchen) rects([[x, y, x2, y2]], (px, py) => put(s, px, py, kind, dir));
  for (const [x, y] of lot.fixed ?? []) at(s, x, y).fixed = true;
  rects(lot.holes, (x, y) => { s.cells[y * s.W + x] = false; });
  rects(lot.pillars, (x, y) => { s.cells[y * s.W + x] = false; });
}

/** En un desafío, lot es la clave del desafío (PUZZLES), que es también la de su local. */
export function newGame(mode = 'career', seed = 1, lot = mode === 'career' ? 'classic' : 'sandbox') {
  const L = lotOf(lot, seed), { w, h } = L;
  const s = {
    v: SAVE_VERSION, mode, lot, lotSeed: LOTS[lot].gen ? seed : null, W: w, H: h, cells: Array(w * h).fill(null), orders: [], events: [],
    time: 0, autoClock: 0, autoOrders: true, orderId: 1, itemId: 1, seed,
    money: mode === 'career' ? START_MONEY : mode === 'puzzle' ? PUZZLES[lot].budget : 0, hearts: HEARTS, level: 1, expansions: 0, over: false,
    stats: { onTime: 0, late: 0, expired: 0, turnedAway: 0, waste: 0, earned: 0 },
    script: 0, result: null, // desafío: cuántos pedidos del guion ya llegaron · 'won' | 'expired' | 'timeout' al terminar
    undo: [], // grupos de acciones para deshacer, del más viejo al más nuevo (ver «deshacer»)
    skip: false, tips: {}, // skip: después de un grupo se saltea la llegada siguiente · tips: grupo -> cuántos salieron a tiempo
  };
  buildLot(s, L);
  if (isPuzzle(s)) { for (const c of s.cells) if (c) c.fixed = true; feed(s); } // las piezas dadas del desafío no se tocan
  else for (const key of isCareer(s) ? ['classic'] : ['classic', 'cheese', 'double']) addOrder(s, key);
  return s;
}

// ---------- pedidos ----------

const hasKind = (s, kind) => s.cells.some(c => c && c.kind === kind);

/** Los clientes piden lo que la cocina ofrece: receta desbloqueada y con sus fuentes construidas. */
export function availableRecipes(s) {
  const keys = Object.keys(RECIPES);
  if (!isCareer(s)) return keys;
  return keys.filter(k => {
    const r = RECIPES[k];
    return s.level >= r.level && INGREDIENTS.every(i => !r[i] || hasKind(s, SOURCE_OF[i]));
  });
}

// Vida de un pedido (order.status):
//   'pending'    nadie lo está haciendo
//   'assembling' una armadora tiene su trabajo (cell.job)
//   'transit'    su hamburguesa existe: en la salida de la armadora o en una cinta
// Sale de la lista al entregarse (finishOrder) o al irse el cliente (expireOrders). Si se destruye su
// trabajo o su hamburguesa (loseContents) vuelve a 'pending'. Una hamburguesa puede sobrevivir a su
// pedido: si llega al despacho cuando el cliente ya se fue, es desperdicio.
export function addOrder(s, key, manual = false, group = null) {
  if (s.over || (manual && isPuzzle(s))) return false; // en un desafío los pedidos son los del guion
  if (s.orders.length >= QUEUE_MAX) { if (manual) emit(s, 'queueFull'); return false; }
  if (!availableRecipes(s).includes(key)) return false;
  const o = { id: s.orderId++, recipeKey: key, createdAt: s.time, due: s.time + deadline(s, key), status: 'pending', group };
  s.orders.push(o);
  emit(s, 'order', { id: o.id, group });
  return true;
}

/** Desafío: llegan los pedidos del guion cuyo momento ya pasó. */
function feed(s) {
  const list = PUZZLES[s.lot].orders;
  // el que encuentra la cola llena se va, y eso pierde el desafío como un pedido vencido (judge)
  while (s.script < list.length && s.time >= list[s.script][0] - 1e-9) if (!addOrder(s, list[s.script++][1])) s.stats.turnedAway++;
}

/** Desafío: se gana al entregar todos a tiempo; se pierde al vencerse uno (o entregarse tarde, o encontrar la cola llena) o al pasar el límite. */
function judge(s) {
  const P = PUZZLES[s.lot];
  const result = s.stats.late || s.stats.turnedAway || s.orders.some(o => s.time > o.due) ? 'expired'
    : s.stats.onTime === P.orders.length ? 'won' : s.time >= P.limit ? 'timeout' : null;
  if (!result) return;
  s.over = true;
  s.result = result;
  emit(s, 'puzzleEnd', { result });
}

/**
 * Estrellas de un desafío terminado: una por ganar, otra por gastar como mucho P.spend y otra por terminar con
 * como mucho P.belts cintas (las dadas cuentan). Perder da cero. spent: lo que se gastó del presupuesto.
 */
export function puzzleStars(s) {
  const P = PUZZLES[s.lot], spent = P.budget - s.money, belts = s.cells.filter(c => c?.kind === 'belt').length;
  const won = s.result === 'won', spendOk = spent <= P.spend, beltsOk = belts <= P.belts;
  return { won, spent, belts, spendOk, beltsOk, stars: won ? 1 + spendOk + beltsOk : 0 };
}

/** Si el desafío está abierto: el primero siempre; los otros, con al menos una estrella en el anterior. stars(clave): las mejores. */
export const puzzleOpen = (key, stars) => { const i = PUZZLE_ORDER.indexOf(key); return i === 0 || stars(PUZZLE_ORDER[i - 1]) > 0; };

/**
 * Llega un cliente; en Carrera desde GROUP.level, con lugar para dos y suerte, llegan dos que comparten group (el id
 * del primero) y se saltea la llegada siguiente: el ritmo promedio no cambia. Bajo el nivel no se tira el azar del
 * grupo, así las partidas de nivel 1 y 2 siguen siendo las mismas para la misma semilla.
 */
function arrive(s) {
  const key = randomRecipe(s);
  if (!isCareer(s) || s.level < GROUP.level || s.orders.length + 2 > QUEUE_MAX || rand(s) >= GROUP.chance) return addOrder(s, key);
  const g = s.orderId;
  addOrder(s, key, false, g);
  addOrder(s, randomRecipe(s), false, g);
  s.skip = true;
}

/** Un pedido de grupo dejó la cola: si es el segundo a tiempo de su grupo, propina. onTime: salió entregado a tiempo. */
function groupLeft(s, o, onTime, x, y) {
  if (o.group == null) return;
  const n = (s.tips[o.group] ?? 0) + (onTime ? 1 : 0);
  if (n === 2) { s.money += GROUP.tip; s.stats.earned += GROUP.tip; emit(s, 'tip', { x, y, amount: GROUP.tip }); }
  if (s.orders.some(p => p.group === o.group)) s.tips[o.group] = n; else delete s.tips[o.group];
}

function randomRecipe(s) {
  const keys = availableRecipes(s);
  let r = rand(s) * keys.reduce((n, k) => n + RECIPES[k].weight, 0);
  return keys.find(k => (r -= RECIPES[k].weight) < 0) ?? keys[0];
}

const ZERO = () => ({ bun: 0, patty: 0, cheese: 0 });

/**
 * El reparto en el papel de los pedidos en espera entre las armadoras (no se guarda: se recalcula cada vez).
 * Lo que va de paso hacia una sola armadora cuenta como inventario de ella; lo que todavía puede ir a varias, o a
 * ninguna máquina pero sí a algo que lo recibe, queda suelto (loose); lo que no llega a nada que lo reciba
 * no cuenta (si no, un pan varado en una cinta sin salida tapaba para siempre el que faltaba). Cada pedido en
 * espera, el más urgente primero, va a la armadora que más lo cubre con lo que le queda; con empate, a la menos
 * cargada (la que ya arma o recibió pedidos en este reparto), y si no a la primera. Lo que le falta a cada una queda en short; los pedidos sin ninguna armadora suman en orphan.
 */
function share(s) {
  const asm = new Map(), loose = ZERO(), orphan = ZERO();
  s.cells.forEach((c, i) => { if (c?.kind === 'assembly') asm.set(i, { inv: { ...c.inv }, load: c.job || c.output ? 1 : 0, short: ZERO() }); });
  s.cells.forEach((c, i) => {
    if (!c || !KINDS[c.kind].carries) return;
    for (const item of [c.item, c.item2]) {
      if (!item || !INGREDIENTS.includes(item.type)) continue;
      const to = new Set(), x = i % s.W, y = (i - x) / s.W;
      for (const d of exits(c, item.d, item.type)) reach(s, x, y, d, to, item.type);
      if (to.size === 1) asm.get([...to][0]).inv[item.type]++;
      else if (exits(c, item.d, item.type).some(d => arrives(s, x, y, d, item.type))) loose[item.type]++; // lo que no llega a nada que lo reciba no viaja
    }
  });
  for (const o of s.orders.filter(o => o.status === 'pending').sort((a, b) => a.due - b.due)) {
    const r = RECIPES[o.recipeKey], cover = a => INGREDIENTS.reduce((n, i) => n + Math.min(a.inv[i], r[i]), 0);
    let best = null;
    for (const a of asm.values()) if (!best || cover(a) > cover(best) || (cover(a) === cover(best) && a.load < best.load)) best = a;
    for (const i of INGREDIENTS) {
      if (!best) { orphan[i] += r[i]; continue; }
      best.short[i] += Math.max(0, r[i] - best.inv[i]);
      best.inv[i] = Math.max(0, best.inv[i] - r[i]);
    }
    if (best) best.load++;
  }
  return { asm, loose, orphan };
}

/**
 * Cuánto falta fabricar de un ingrediente para los pedidos en espera, descontando lo que ya viaja: lo que les
 * falta a las armadoras según el reparto (share), menos lo suelto. Con una sola armadora da lo mismo que restar
 * su inventario y todo lo que va en cinta. Sumar el inventario de todas trababa: media receta en cada una parecía una entera.
 */
export function pendingNeed(s, kind) {
  const { asm, loose, orphan } = share(s);
  let need = orphan[kind] - loose[kind];
  for (const a of asm.values()) need += a.short[kind];
  return Math.max(0, need);
}

/**
 * Cuánto tiene que soltar la fuente o el almacén de (x, y): lo que les falta a las armadoras a las que llega su
 * salida, menos lo suelto. Así una línea no le manda pan a su armadora mientras el pedido espera en la de al lado.
 * Si su salida no llega a ninguna armadora, vale la necesidad de toda la cocina, como antes.
 */
export function sourceNeed(s, x, y) {
  const c = at(s, x, y), kind = c.kind === 'stock' ? 'patty' : KINDS[c.kind].emits;
  const to = reach(s, x, y, c.dir, new Set(), kind);
  if (!to.size) return pendingNeed(s, kind);
  const { asm, loose } = share(s);
  let need = -loose[kind];
  for (const i of to) need += asm.get(i).short[kind];
  return Math.max(0, need);
}

function finishOrder(s, id, x, y) {
  const i = s.orders.findIndex(o => o.id === id);
  if (i < 0) { s.stats.waste++; emit(s, 'waste', { x, y }); return; } // el cliente ya se había ido
  const o = s.orders[i], late = s.time > o.due;
  const amount = late ? Math.round(RECIPES[o.recipeKey].price * LATE_PAY) : RECIPES[o.recipeKey].price;
  s.orders.splice(i, 1);
  s.stats[late ? 'late' : 'onTime']++;
  s.stats.earned += amount;
  if (!isPuzzle(s)) s.money += amount; // en un desafío el presupuesto es lo que hay
  emit(s, 'delivered', { id, x, y, amount, late });
  groupLeft(s, o, !late, x, y);
  while (isCareer(s) && delivered(s) >= deliveriesFor(s.level)) {
    s.level++;
    s.hearts = Math.min(HEARTS, s.hearts + 1);
    const unlocked = Object.keys(RECIPES).filter(k => RECIPES[k].level === s.level);
    emit(s, 'levelup', { level: s.level, unlocked });
  }
}

/** cause: 'expired' (se le venció el plazo) | 'turnedAway' (encontró la cola llena). */
function loseHeart(s, cause) {
  s.stats[cause]++;
  s.hearts--;
  if (s.hearts <= 0) { s.over = true; emit(s, 'gameover'); }
}

function expireOrders(s) {
  for (let i = s.orders.length - 1; i >= 0 && !s.over; i--) {
    const o = s.orders[i];
    if (s.time <= o.due + GRACE) continue;
    s.orders.splice(i, 1);
    emit(s, 'expired', { id: o.id });
    groupLeft(s, o, false);
    loseHeart(s, 'expired');
  }
}

// ---------- construir ----------

const holdsStuff = c => !!(c.item || c.item2 || c.store || c.cooked || c.rawCount || c.output || c.job || c.cooking.length
  || c.inv.bun || c.inv.patty || c.inv.cheese);

/** Lo que había adentro se pierde; si era la hamburguesa de un pedido, el pedido vuelve a la cola. */
function loseContents(s, c) {
  if (!holdsStuff(c)) return;
  s.stats.waste++;
  for (const id of [c.item?.orderId, c.item2?.orderId, c.output?.orderId, c.job?.orderId]) {
    const o = id && s.orders.find(o => o.id === id);
    if (o) o.status = 'pending';
  }
}

/** Devuelve { ok } o { ok:false, reason } con reason 'same' | 'money' | 'out' | 'fixed' (máquina fija del local). */
export function place(s, x, y, kind, dir = 0) {
  if (!valid(s, x, y) || s.over) return { ok: false, reason: 'out' };
  if (KINDS[kind].noTurn) dir = 0; // el puente no tiene frente: girarlo no cambia nada
  const cur = at(s, x, y);
  if (cur?.fixed) return { ok: false, reason: 'fixed' };
  if (cur && cur.kind === kind) { // misma máquina: sólo se gira, gratis y sin perder lo que tiene
    if (cur.dir === dir) return { ok: false, reason: 'same' };
    note(s, x, y, cur, 0, true);
    cur.dir = dir;
    return { ok: true };
  }
  const price = cost(s, kind) - (cur ? refund(s, cur) : 0);
  if (paid(s) && s.money < price) return { ok: false, reason: 'money' };
  note(s, x, y, cur, paid(s) ? -price : 0);
  if (cur) loseContents(s, cur);
  s.money -= price;
  put(s, x, y, kind, dir);
  return { ok: true };
}

export function erase(s, x, y) {
  const cur = at(s, x, y);
  if (!cur || cur.fixed || s.over) return false;
  note(s, x, y, cur, refund(s, cur));
  loseContents(s, cur);
  s.money += refund(s, cur);
  s.cells[y * s.W + x] = null;
  return true;
}

/**
 * Mejora la máquina de (x, y): un solo nivel, vive en la celda, sobrevive a girar y se pierde al reemplazar.
 * Devuelve { ok } o { ok:false, reason } con reason 'out' | 'none' (no se mejora) | 'done' (ya mejorada) | 'money'.
 */
export function upgrade(s, x, y) {
  const c = at(s, x, y);
  if (!c || s.over) return { ok: false, reason: 'out' };
  if (!UPGRADES[c.kind]) return { ok: false, reason: 'none' };
  if (c.up) return { ok: false, reason: 'done' };
  const price = upgradeCost(s, c.kind);
  if (paid(s) && s.money < price) return { ok: false, reason: 'money' };
  if (!c.fixed) note(s, x, y, c, paid(s) ? -price : 0, true);
  s.money -= price;
  c.up = true;
  return { ok: true };
}

// ---------- deshacer ----------
// s.undo: grupos (arreglos) de acciones, del más viejo al más nuevo. Una acción es
//   { x, y, t, prev, money, keep }: t, el tiempo de juego en que se hizo · prev, la máquina que había
//   ({ kind, dir, up, pick }) o null si era piso vacío · money, cuánto cambió la plata (negativo si se cobró) ·
//   keep, la máquina sigue siendo la misma (giro o mejora): deshacer le devuelve dirección y mejora sin vaciarla.
// Se guardan coordenadas y no índices: ampliar el terreno cambia el índice de cada celda, no su x e y.

/** Abre un grupo: todo lo que se anote hasta el próximo undoMark se deshace junto. */
export function undoMark(s) {
  if (!s.undo.length || s.undo.at(-1).length) s.undo.push([]);
}

function note(s, x, y, c, money, keep = false) {
  if (!s.undo.length) s.undo.push([]);
  s.undo.at(-1).push({ x, y, t: s.time, money, keep, prev: c && { kind: c.kind, dir: c.dir, up: c.up, pick: c.pick } });
  let n = s.undo.reduce((k, g) => k + g.length, 0);
  while (n > UNDO.max && s.undo.length > 1) n -= s.undo.shift().length; // de a grupos enteros, nunca el que se está armando
}

/** El último grupo con algo, sacando los vacíos de arriba; o null. */
function lastGroup(s) {
  while (s.undo.length && !s.undo.at(-1).length) s.undo.pop();
  return s.undo.at(-1) ?? null;
}

const stale = (s, g) => s.time - g[0].t > UNDO.window;

/** Si hay algo para deshacer todavía dentro de la ventana. */
export const canUndo = s => { const g = !s.over && lastGroup(s); return !!g && !stale(s, g); };

/**
 * Deshace el último grupo, de la última acción a la primera. { ok: true, n } o { ok: false, reason } con 'none',
 * 'late' (pasó UNDO.window desde la más vieja; el grupo se descarta) o 'money' (devolver el reembolso de un borrado
 * no alcanza; el grupo queda).
 */
export function undo(s) {
  const g = !s.over && lastGroup(s);
  if (!g) return { ok: false, reason: 'none' };
  if (stale(s, g)) { s.undo.pop(); return { ok: false, reason: 'late' }; }
  const owe = g.reduce((m, a) => m + a.money, 0);
  if (paid(s) && owe > 0 && s.money < owe) return { ok: false, reason: 'money' };
  for (const a of [...g].reverse()) {
    const cur = at(s, a.x, a.y), p = a.prev;
    if (a.keep && cur?.kind === p.kind) Object.assign(cur, { dir: p.dir, up: p.up });
    else {
      if (cur) loseContents(s, cur);
      s.cells[a.y * s.W + a.x] = p && Object.assign(make(p.kind, p.dir), { up: p.up, pick: p.pick });
    }
    s.money -= a.money;
  }
  s.undo.pop();
  return { ok: true, n: g.length };
}

/** El terreno crece hacia la derecha y hacia abajo: nada de lo construido cambia de celda, y lo que no era piso sigue sin serlo. */
export function expand(s) {
  if (!canExpand(s) || s.over) return { ok: false, reason: 'max' };
  const price = expandCost(s);
  if (isCareer(s) && s.money < price) return { ok: false, reason: 'money' };
  const [gw, gh] = lotGrow(s), W = s.W + gw, H = s.H + gh, cells = Array(W * H).fill(null);
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) cells[y * W + x] = s.cells[y * s.W + x];
  Object.assign(s, { W, H, cells, money: s.money - price, expansions: s.expansions + 1 });
  emit(s, 'expanded');
  return { ok: true };
}

// ---------- máquinas ----------

/** d: hacia dónde viaja el producto al entrar. El divisor sólo recibe por atrás. */
const accepts = (cell, type, d) => {
  switch (cell?.kind) {
    case 'belt': case 'bridge': case 'dispatch': return true;
    case 'splitter': return d === cell.dir;
    case 'filter': return d === cell.dir; // también sólo por atrás
    case 'grill': return type === 'raw';
    case 'stock': return type === 'patty';
    case 'assembly': return INGREDIENTS.includes(type);
    default: return false;
  }
};

function receive(s, cell, x, y, item, fx, fy, d) {
  if (!accepts(cell, item.type, d)) return false;
  switch (cell.kind) {
    case 'belt': case 'splitter': case 'filter': case 'bridge': { // el puente tiene dos carriles: cada producto va al de su eje
      const slot = cell.kind === 'bridge' && d % 2 ? 'item2' : 'item';
      if (cell[slot]) return false;
      cell[slot] = Object.assign(item, { fx, fy, d, t0: s.time, readyAt: s.time + BELT_TIME });
      return true;
    }
    case 'grill': if (cell.rawCount >= CAP.grillRaw) return false; cell.rawCount++; return true;
    case 'stock': if (cell.store >= stockCap(cell)) return false; cell.store++; return true;
    case 'assembly': if (cell.inv[item.type] >= CAP.inv) return false; cell.inv[item.type]++; return true;
    case 'dispatch':
      if (item.type === 'burger') finishOrder(s, item.orderId, x, y);
      else { s.stats.waste++; emit(s, 'waste', { x, y }); }
      return true;
  }
}

function send(s, x, y, c, item, d = c.dir) {
  const [dx, dy] = DIRS[d], nx = x + dx, ny = y + dy, next = at(s, nx, ny);
  return next ? receive(s, next, nx, ny, item, x, y, d) : false;
}

const SPLIT = [0, 1, 3]; // salidas del divisor, relativas a su dirección: frente, costado derecho, costado izquierdo
/**
 * Por dónde puede seguir un producto de tipo `type` que entró a una celda de paso viajando hacia d, en el orden en
 * que lo intenta. El filtro saca el elegido sólo por los costados (por turnos) y el resto sólo por el frente; con
 * type null (no se sabe qué viene) da las tres.
 */
function exits(c, d, type = null) {
  if (c.kind === 'bridge') return [d]; // sigue derecho por su carril y sale por el lado opuesto
  if (c.kind === 'splitter') return [0, 1, 2].map(k => (c.dir + SPLIT[(c.turn + k) % 3]) % 4);
  if (c.kind === 'filter') {
    const sides = [0, 1].map(k => (c.dir + SPLIT[1 + (c.turn + k) % 2]) % 4);
    return type == null ? [c.dir, ...sides] : type === c.pick ? sides : [c.dir];
  }
  return [c.dir];
}

/** Cambia lo que elige el filtro de (x, y): gratis, no pierde lo que lleva. { ok } o { ok:false, reason } 'out' | 'fixed' | 'same'. */
export function setPick(s, x, y, type) {
  const c = at(s, x, y);
  if (c?.kind !== 'filter' || s.over) return { ok: false, reason: 'out' };
  if (c.fixed) return { ok: false, reason: 'fixed' };
  if (c.pick === type) return { ok: false, reason: 'same' };
  c.pick = type;
  return { ok: true };
}

/** Si lo que sale de (x, y) hacia d puede llegar por celdas de paso a una máquina que reciba `type`. */
function arrives(s, x, y, d, type, seen = new Set()) {
  const nx = x + DIRS[d][0], ny = y + DIRS[d][1], c = at(s, nx, ny), i = ny * s.W + nx;
  if (!c || !KINDS[c.kind].carries) return accepts(c, type, d);
  if (!accepts(c, type, d) || seen.has(i * 4 + d)) return false;
  seen.add(i * 4 + d);
  return exits(c, d, type).some(e => arrives(s, nx, ny, e, type, seen));
}

/** Agrega a `to` el índice de cada armadora a la que puede llegar lo que sale de (x, y) hacia d por celdas de paso. type: qué es, o null. */
function reach(s, x, y, d, to, type = null, seen = new Set()) {
  const nx = x + DIRS[d][0], ny = y + DIRS[d][1], c = at(s, nx, ny), i = ny * s.W + nx;
  if (c?.kind === 'assembly') to.add(i);
  if (!c || !KINDS[c.kind].carries || !accepts(c, null, d) || seen.has(i * 4 + d)) return to;
  seen.add(i * 4 + d);
  for (const e of exits(c, d, type)) reach(s, nx, ny, e, to, type, seen);
  return to;
}

/**
 * Mueve lo que lleva una celda de paso (slot 'item', o 'item2' en el puente). El divisor reparte por turnos:
 * una salida que no recibe ese producto o que está llena en este paso se saltea, y el turno pasa a la que
 * sigue de la que lo recibió.
 */
function carry(s, x, y, c, slot) {
  const item = c[slot];
  if (!item || item.readyAt > s.time) return;
  const out = exits(c, item.d, item.type);
  for (let k = 0; k < out.length; k++) {
    if (!send(s, x, y, c, item, out[k])) continue;
    c[slot] = null;
    if (c.kind === 'splitter') c.turn = (c.turn + k + 1) % 3;
    if (c.kind === 'filter' && item.type === c.pick) c.turn = (c.turn + k + 1) % 2; // el turno pasa al otro costado
    return;
  }
}

/** Un producto quieto en una celda de paso que no tiene ninguna salida que lo vaya a recibir nunca. */
export function isStuck(s, x, y, slot = 'item') {
  const c = at(s, x, y), item = c?.[slot];
  if (!item || s.time - item.readyAt < STUCK_AFTER) return false;
  return !exits(c, item.d, item.type).some(d => accepts(at(s, x + DIRS[d][0], y + DIRS[d][1]), item.type, d));
}

const canMake = (c, r) => INGREDIENTS.every(i => c.inv[i] >= r[i]);

function process(s, c, dt) {
  if (c.kind === 'grill') { // una carne por hornalla (burners); la más vieja pasa primero a las cocidas
    for (let i = 0; i < c.cooking.length; i++) {
      if ((c.cooking[i] -= dt) > 0) continue;
      if (c.cooked < CAP.grillCooked) { c.cooked++; c.cooking.splice(i--, 1); } else c.cooking[i] = 0; // 0 = lista pero sin lugar: reintenta en cada paso
    }
    while (c.cooking.length < burners(c) && c.rawCount > 0) { c.rawCount--; c.cooking.push(TIMES.cook); }
  } else if (c.kind === 'assembly') { // libre | con trabajo (job) | con hamburguesa lista (output): nunca job y output a la vez
    if (c.job) {
      c.job.left -= dt;
      if (c.job.left <= 0) {
        c.output = { id: s.itemId++, type: 'burger', orderId: c.job.orderId, recipeKey: c.job.recipeKey };
        const o = s.orders.find(o => o.id === c.job.orderId);
        if (o) o.status = 'transit';
        c.job = null;
      }
    }
    if (!c.job && !c.output) {
      const o = s.orders.filter(o => o.status === 'pending').sort((a, b) => a.due - b.due)
        .find(o => canMake(c, RECIPES[o.recipeKey]));
      if (o) {
        const r = RECIPES[o.recipeKey];
        for (const i of INGREDIENTS) c.inv[i] -= r[i];
        o.status = 'assembling';
        c.job = { orderId: o.id, recipeKey: o.recipeKey, left: assembleTime(c) };
      }
    }
  }
}

function output(s, x, y, c, dt) {
  c.cooldown = Math.max(0, c.cooldown - dt);
  if (c.cooldown > 0) return;
  const src = KINDS[c.kind];
  const out = type => send(s, x, y, c, { id: s.itemId++, type });
  if (src.emits) {
    const type = src.emits;
    if (src.onDemand && sourceNeed(s, x, y) <= 0) return;
    if (out(type)) c.cooldown = src.every;
  } else if (c.kind === 'grill' && c.cooked > 0) {
    if (out('patty')) { c.cooked--; c.cooldown = TIMES.grillOut; }
  } else if (c.kind === 'stock' && c.store > 0 && sourceNeed(s, x, y) > 0) {
    if (out('patty')) { c.store--; c.cooldown = TIMES.stockOut; }
  } else if (c.kind === 'assembly' && c.output) {
    if (send(s, x, y, c, c.output)) { c.output = null; c.cooldown = TIMES.assemblyOut; }
  }
}

export function step(s, dt) {
  if (s.over) return;
  s.time += dt;
  if (isPuzzle(s)) feed(s);
  else if (isCareer(s) || s.autoOrders) {
    s.autoClock += dt;
    const every = isCareer(s) ? orderInterval(s.level) : SANDBOX_INTERVAL;
    if (s.autoClock >= every) {
      s.autoClock -= every;
      if (s.skip) s.skip = false; // la llegada que ya vino adelantada con el grupo
      else if (!availableRecipes(s).length) { /* la cocina no ofrece nada: no llega nadie */ }
      else if (s.orders.length < QUEUE_MAX) arrive(s);
      else if (isCareer(s)) { emit(s, 'turnedAway'); loseHeart(s, 'turnedAway'); } // cola llena: el cliente se va
    }
  }
  if (isCareer(s)) expireOrders(s);
  if (s.over) return;
  for (const c of s.cells) if (c) process(s, c, dt);
  // Un producto recién llegado a una cinta no está listo hasta BELT_TIME después (readyAt):
  // eso es lo que impide que cruce dos celdas en un mismo paso, sea cual sea el orden de recorrido.
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
    const c = at(s, x, y);
    if (!c || !KINDS[c.kind].carries) continue;
    carry(s, x, y, c, 'item');
    if (c.kind === 'bridge') carry(s, x, y, c, 'item2');
  }
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
    const c = at(s, x, y);
    if (c) output(s, x, y, c, dt);
  }
  track(s, dt);
  if (isPuzzle(s)) judge(s);
}

// ---------- diagnóstico ----------

// En qué estado terminó el paso cada celda, leído de lo que quedó en ella después de mover y sacar:
//   'work'    trabajando (cocina, arma, saca a su ritmo, o lleva un producto que todavía cruza)
//   'blocked' tiene algo para sacar y el destino no lo recibe
//   'wait'    le falta insumo habiendo pedidos que lo piden
//   'idle'    libre
// Un producto quieto en una celda de paso (cinta, divisor, puente) está bloqueado; una vacía está libre.
function cellState(s, c, need, own) { // need(ingrediente): lo que pide la cocina · own(): lo que tiene que soltar esta celda (sourceNeed)
  if (c.item || c.item2) return (c.item && c.item.readyAt <= s.time) || (c.item2 && c.item2.readyAt <= s.time) ? 'blocked' : 'work';
  switch (c.kind) {
    case 'belt': case 'splitter': case 'filter': case 'bridge': return 'idle';
    case 'grill':
      if (c.cooking.some(left => left > 0)) return 'work';
      if (c.cooking.length || (c.cooked > 0 && c.cooldown <= 0)) return 'blocked';
      if (c.cooldown > 0) return 'work';
      return need('patty') > 0 ? 'wait' : 'idle';
    case 'stock':
      if (c.cooldown > 0) return 'work';
      if (own() > 0) return c.store > 0 ? 'blocked' : 'wait';
      return 'idle';
    case 'assembly':
      if (c.output && c.cooldown <= 0) return 'blocked';
      if (c.job || c.cooldown > 0) return 'work';
      return s.orders.some(o => o.status === 'pending') ? 'wait' : 'idle';
    case 'dispatch': return s.orders.length ? 'wait' : 'idle';
  }
  const src = KINDS[c.kind];
  if (!src?.emits) return 'idle';
  if (c.cooldown > 0) return 'work';
  return !src.onDemand || own() > 0 ? 'blocked' : 'idle';
}

/** Acumulado reciente: todo decae con DIAG.tau y el estado de este paso suma dt. */
function track(s, dt) {
  const keep = Math.exp(-dt / DIAG.tau), needs = {}, need = k => (needs[k] ??= pendingNeed(s, k));
  for (let i = 0; i < s.cells.length; i++) {
    const c = s.cells[i];
    if (!c) continue;
    const d = c.diag;
    d.work *= keep; d.blocked *= keep; d.wait *= keep; d.idle *= keep;
    d[cellState(s, c, need, () => sourceNeed(s, i % s.W, Math.floor(i / s.W)))] += dt;
  }
}

/** Proporciones { work, blocked, wait, idle } (suman 1) del acumulado de una celda, o null sin datos. */
export function diagShares(c) {
  const d = c?.diag, total = d ? d.work + d.blocked + d.wait + d.idle : 0;
  return total > 0 ? { work: d.work / total, blocked: d.blocked / total, wait: d.wait / total, idle: d.idle / total } : null;
}

/** La mayor proporción bloqueada entre las celdas que sacan hacia (x, y). */
export function upstreamBlocked(s, x, y) {
  let max = 0;
  DIRS.forEach(([dx, dy], d) => {
    const n = at(s, x - dx, y - dy);
    if (n?.dir === d) max = Math.max(max, diagShares(n)?.blocked ?? 0);
  });
  return max;
}

/**
 * La máquina (no cinta) que frena la cocina: la de mayor proporción trabajando; con empate (DIAG.tie),
 * la de mayor proporción bloqueada aguas arriba. Devuelve { x, y, kind, shares, upstream } o null si no
 * hay datos o ninguna llega a DIAG.minWork.
 */
export function bottleneck(s) {
  let best = null;
  for (let i = 0; i < s.cells.length; i++) {
    const c = s.cells[i], shares = c && !KINDS[c.kind].carries && diagShares(c);
    if (!shares) continue;
    const x = i % s.W, y = Math.floor(i / s.W), cand = { x, y, kind: c.kind, shares, upstream: upstreamBlocked(s, x, y) };
    const w = shares.work, bw = best?.shares.work;
    if (!best || w > bw + DIAG.tie || (w >= bw - DIAG.tie && cand.upstream > best.upstream)) best = cand;
  }
  return best && best.shares.work >= DIAG.minWork ? best : null;
}

/**
 * La mejora que conviene: el cuello de botella cuando no da abasto (trabajo desde DIAG.busy), tiene mejora,
 * no la tiene puesta y la plata alcanza. { x, y, kind } o null.
 */
export function upgradeHint(s) {
  const b = bottleneck(s), c = b && at(s, b.x, b.y);
  if (!c || b.shares.work < DIAG.busy || !UPGRADES[c.kind] || c.up || s.money < upgradeCost(s, c.kind)) return null;
  return { x: b.x, y: b.y, kind: c.kind };
}

/**
 * Hacia dónde corre cada carril del puente de (x, y): [esteOeste, norteSur], cada uno una dirección (DIRS) o null
 * si nada entra por él. Si el carril lleva un producto, su d; si no, la primera punta cuyo vecino saca hacia el puente.
 */
export const bridgeFlow = (s, x, y) => [0, 1].map(axis => laneFlow(s, x, y, axis, [axis, axis + 2]));

/** dirs: los sentidos a probar. Otro puente se mira sólo en ese sentido, así una cadena avanza en línea recta y termina. */
function laneFlow(s, x, y, axis, dirs) {
  const item = at(s, x, y)?.[axis ? 'item2' : 'item'];
  if (item) return item.d;
  for (const d of dirs) { // quien alimenta el sentido d está detrás, en (x - dx, y - dy)
    const nx = x - DIRS[d][0], ny = y - DIRS[d][1], n = at(s, nx, ny);
    if (!n || n.kind === 'dispatch') continue;
    if (n.kind === 'bridge' ? laneFlow(s, nx, ny, axis, [d]) === d
      : n.kind === 'splitter' || n.kind === 'filter' ? SPLIT.some(k => (n.dir + k) % 4 === d) : n.dir === d) return d;
  }
  return null;
}

// ---------- guardado ----------

export const serialize = s => JSON.stringify({ ...s, events: [] });

export function deserialize(text) {
  try {
    const s = JSON.parse(text);
    return s && s.v === SAVE_VERSION && Array.isArray(s.cells) && s.cells.length === s.W * s.H ? s : null;
  } catch { return null; }
}
