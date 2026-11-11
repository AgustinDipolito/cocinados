// Simulación pura: sin DOM, sin three y sin reloj del sistema. El estado es un objeto plano
// (se guarda con JSON) y todo lo que pasa se anuncia en state.events para que lo dibuje quien quiera.
import {
  DIRS, BELT_TIME, STUCK_AFTER, QUEUE_MAX, LATE_PAY, GRACE, HEARTS, REFUND, CAP, TIMES, KINDS,
  SOURCE_OF, INGREDIENTS, RECIPES, SANDBOX_DEADLINE, SANDBOX_INTERVAL, START_MONEY, orderInterval,
  deliveriesFor, LOT, DIAG,
} from './data.js';

export const SAVE_VERSION = 2;

function rand(s) { // mulberry32: el azar sale de la semilla guardada, así una partida se puede repetir
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const make = (kind, dir = 0) => ({
  kind, dir, item: null, cooldown: 0, rawCount: 0, cooked: 0, processing: null, store: 0,
  inv: { bun: 0, patty: 0, cheese: 0 }, job: null, output: null,
  diag: { work: 0, blocked: 0, wait: 0, idle: 0 }, // segundos recientes en cada estado (ver track)
});

export const valid = (s, x, y) => x >= 0 && x < s.W && y >= 0 && y < s.H;
export const at = (s, x, y) => (valid(s, x, y) ? s.cells[y * s.W + x] : null);
const put = (s, x, y, kind, dir = 0) => { s.cells[y * s.W + x] = make(kind, dir); };
const emit = (s, type, data) => s.events.push({ type, ...data });
const log = (s, key, p) => { s.log.unshift({ time: s.time, key, p }); if (s.log.length > 7) s.log.length = 7; };
const isCareer = s => s.mode === 'career';

export const cost = (s, kind) => (isCareer(s) ? KINDS[kind].cost : 0);
export const refund = (s, kind) => Math.floor(cost(s, kind) * REFUND);
export const expandCost = s => (isCareer(s) ? LOT.cost(s.expansions) : 0);
export const canExpand = s => s.expansions < LOT.maxExpansions;
export const deadline = (s, key) => (isCareer(s) ? RECIPES[key].deadline : SANDBOX_DEADLINE[key]);
export const delivered = s => s.stats.onTime + s.stats.late;
export const lost = s => s.stats.expired + s.stats.turnedAway;

function starterKitchen(s) {
  const row = (y, x0, x1, dir = 0) => { for (let x = x0; x <= x1; x++) put(s, x, y, 'belt', dir); };
  const col = (x, y0, y1, dir) => { for (let y = y0; y <= y1; y++) put(s, x, y, 'belt', dir); };
  if (isCareer(s)) { // una sola línea: clásica. El queso lo construye quien juega al llegar al nivel 2.
    put(s, 1, 1, 'raw'); put(s, 2, 1, 'belt'); put(s, 3, 1, 'grill'); put(s, 4, 1, 'belt');
    put(s, 5, 1, 'stock'); put(s, 6, 1, 'belt'); col(7, 1, 2, 1);
    put(s, 1, 3, 'bun'); row(3, 2, 6); put(s, 7, 3, 'assembly'); row(3, 8, 9); put(s, 10, 3, 'dispatch');
  } else { // la cocina del prototipo, celda por celda
    put(s, 1, 1, 'raw'); row(1, 2, 3); put(s, 4, 1, 'grill'); row(1, 5, 6); put(s, 7, 1, 'stock');
    row(1, 8, 9); col(10, 1, 4, 1);
    put(s, 1, 5, 'bun'); row(5, 2, 9); put(s, 10, 5, 'assembly'); row(5, 11, 13); put(s, 14, 5, 'dispatch');
    put(s, 1, 8, 'cheese'); row(8, 2, 9); col(10, 6, 8, 3);
  }
}

export function newGame(mode = 'career', seed = 1) {
  const { w, h } = LOT[mode];
  const s = {
    v: SAVE_VERSION, mode, W: w, H: h, cells: Array(w * h).fill(null), orders: [], log: [], events: [],
    time: 0, autoClock: 0, autoOrders: true, orderId: 1, itemId: 1, seed,
    money: mode === 'career' ? START_MONEY : 0, hearts: HEARTS, level: 1, expansions: 0, over: false,
    stats: { onTime: 0, late: 0, expired: 0, turnedAway: 0, waste: 0, earned: 0 },
  };
  starterKitchen(s);
  for (const key of isCareer(s) ? ['classic'] : ['classic', 'cheese', 'double']) addOrder(s, key);
  s.log.length = 0;
  log(s, 'logReady');
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
export function addOrder(s, key, manual = false) {
  if (s.over) return false;
  if (s.orders.length >= QUEUE_MAX) { if (manual) emit(s, 'queueFull'); return false; }
  if (!availableRecipes(s).includes(key)) return false;
  const o = { id: s.orderId++, recipeKey: key, createdAt: s.time, due: s.time + deadline(s, key), status: 'pending' };
  s.orders.push(o);
  log(s, 'logOrder', { id: o.id, recipe: key });
  emit(s, 'order', { id: o.id });
  return true;
}

function randomRecipe(s) {
  const keys = availableRecipes(s);
  let r = rand(s) * keys.reduce((n, k) => n + RECIPES[k].weight, 0);
  return keys.find(k => (r -= RECIPES[k].weight) < 0) ?? keys[0];
}

/** Cuánto falta fabricar de un ingrediente para los pedidos en espera, descontando lo que ya viaja. */
export function pendingNeed(s, kind) {
  let need = 0;
  for (const o of s.orders) if (o.status === 'pending') need += RECIPES[o.recipeKey][kind] || 0;
  for (const c of s.cells) {
    if (!c) continue;
    if (c.kind === 'assembly') need -= c.inv[kind] || 0;
    if (c.kind === 'belt' && c.item && c.item.type === kind) need--;
  }
  return Math.max(0, need);
}

function finishOrder(s, id, x, y) {
  const i = s.orders.findIndex(o => o.id === id);
  if (i < 0) { s.stats.waste++; log(s, 'logOrphan', { id }); emit(s, 'waste', { x, y }); return; } // el cliente ya se había ido
  const o = s.orders[i], late = s.time > o.due;
  const amount = late ? Math.round(RECIPES[o.recipeKey].price * LATE_PAY) : RECIPES[o.recipeKey].price;
  s.orders.splice(i, 1);
  s.stats[late ? 'late' : 'onTime']++;
  s.stats.earned += amount;
  s.money += amount;
  log(s, late ? 'logLate' : 'logDelivered', { id, recipe: o.recipeKey });
  emit(s, 'delivered', { x, y, amount, late });
  while (isCareer(s) && delivered(s) >= deliveriesFor(s.level)) {
    s.level++;
    s.hearts = Math.min(HEARTS, s.hearts + 1);
    const unlocked = Object.keys(RECIPES).filter(k => RECIPES[k].level === s.level);
    log(s, 'logLevel', { level: s.level });
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
    log(s, 'logExpired', { id: o.id, recipe: o.recipeKey });
    emit(s, 'expired', { id: o.id });
    loseHeart(s, 'expired');
  }
}

// ---------- construir ----------

const holdsStuff = c => !!(c.item || c.store || c.cooked || c.rawCount || c.output || c.job || c.processing !== null
  || c.inv.bun || c.inv.patty || c.inv.cheese);

/** Lo que había adentro se pierde; si era la hamburguesa de un pedido, el pedido vuelve a la cola. */
function loseContents(s, c) {
  if (!holdsStuff(c)) return;
  s.stats.waste++;
  for (const id of [c.item?.orderId, c.output?.orderId, c.job?.orderId]) {
    const o = id && s.orders.find(o => o.id === id);
    if (o) o.status = 'pending';
  }
}

/** Devuelve { ok } o { ok:false, reason } con reason 'same' | 'money' | 'out'. */
export function place(s, x, y, kind, dir = 0) {
  if (!valid(s, x, y) || s.over) return { ok: false, reason: 'out' };
  const cur = at(s, x, y);
  if (cur && cur.kind === kind) { // misma máquina: sólo se gira, gratis y sin perder lo que tiene
    if (cur.dir === dir) return { ok: false, reason: 'same' };
    cur.dir = dir;
    return { ok: true };
  }
  const price = cost(s, kind) - (cur ? refund(s, cur.kind) : 0);
  if (isCareer(s) && s.money < price) return { ok: false, reason: 'money' };
  if (cur) loseContents(s, cur);
  s.money -= price;
  put(s, x, y, kind, dir);
  return { ok: true };
}

export function erase(s, x, y) {
  const cur = at(s, x, y);
  if (!cur || s.over) return false;
  loseContents(s, cur);
  s.money += refund(s, cur.kind);
  s.cells[y * s.W + x] = null;
  return true;
}

/** El terreno crece hacia la derecha y hacia abajo: nada de lo construido cambia de celda. */
export function expand(s) {
  if (!canExpand(s) || s.over) return { ok: false, reason: 'max' };
  const price = expandCost(s);
  if (isCareer(s) && s.money < price) return { ok: false, reason: 'money' };
  const W = s.W + LOT.growW, H = s.H + LOT.growH, cells = Array(W * H).fill(null);
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) cells[y * W + x] = s.cells[y * s.W + x];
  Object.assign(s, { W, H, cells, money: s.money - price, expansions: s.expansions + 1 });
  emit(s, 'expanded');
  return { ok: true };
}

// ---------- máquinas ----------

const accepts = (cell, type) => {
  switch (cell?.kind) {
    case 'belt': case 'dispatch': return true;
    case 'grill': return type === 'raw';
    case 'stock': return type === 'patty';
    case 'assembly': return INGREDIENTS.includes(type);
    default: return false;
  }
};

function receive(s, cell, x, y, item, fx, fy) {
  if (!accepts(cell, item.type)) return false;
  switch (cell.kind) {
    case 'belt':
      if (cell.item) return false;
      cell.item = Object.assign(item, { fx, fy, t0: s.time, readyAt: s.time + BELT_TIME });
      return true;
    case 'grill': if (cell.rawCount >= CAP.grillRaw) return false; cell.rawCount++; return true;
    case 'stock': if (cell.store >= CAP.stock) return false; cell.store++; return true;
    case 'assembly': if (cell.inv[item.type] >= CAP.inv) return false; cell.inv[item.type]++; return true;
    case 'dispatch':
      if (item.type === 'burger') finishOrder(s, item.orderId, x, y);
      else { s.stats.waste++; log(s, 'logWaste'); emit(s, 'waste', { x, y }); }
      return true;
  }
}

function send(s, x, y, c, item) {
  const [dx, dy] = DIRS[c.dir], nx = x + dx, ny = y + dy, next = at(s, nx, ny);
  return next ? receive(s, next, nx, ny, item, x, y) : false;
}

/** Un producto quieto en una cinta que apunta a algo que nunca lo va a recibir. */
export function isStuck(s, x, y) {
  const c = at(s, x, y);
  if (c?.kind !== 'belt' || !c.item || s.time - c.item.readyAt < STUCK_AFTER) return false;
  const [dx, dy] = DIRS[c.dir];
  return !accepts(at(s, x + dx, y + dy), c.item.type);
}

const canMake = (c, r) => INGREDIENTS.every(i => c.inv[i] >= r[i]);

function process(s, c, dt) {
  if (c.kind === 'grill') {
    if (c.processing !== null) {
      c.processing -= dt;
      if (c.processing <= 0) {
        if (c.cooked < CAP.grillCooked) { c.cooked++; c.processing = null; } else c.processing = 0; // 0 = lista pero sin lugar: reintenta en cada paso
      }
    }
    if (c.processing === null && c.rawCount > 0) { c.rawCount--; c.processing = TIMES.cook; }
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
        c.job = { orderId: o.id, recipeKey: o.recipeKey, left: TIMES.assemble };
        log(s, 'logAssembling', { id: o.id, recipe: o.recipeKey });
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
    if (src.onDemand && pendingNeed(s, type) <= 0) return;
    if (out(type)) c.cooldown = src.every;
  } else if (c.kind === 'grill' && c.cooked > 0) {
    if (out('patty')) { c.cooked--; c.cooldown = TIMES.grillOut; }
  } else if (c.kind === 'stock' && c.store > 0 && pendingNeed(s, 'patty') > 0) {
    if (out('patty')) { c.store--; c.cooldown = TIMES.stockOut; }
  } else if (c.kind === 'assembly' && c.output) {
    if (send(s, x, y, c, c.output)) { c.output = null; c.cooldown = TIMES.assemblyOut; }
  }
}

export function step(s, dt) {
  if (s.over) return;
  s.time += dt;
  if (isCareer(s) || s.autoOrders) {
    s.autoClock += dt;
    const every = isCareer(s) ? orderInterval(s.level) : SANDBOX_INTERVAL;
    if (s.autoClock >= every) {
      s.autoClock -= every;
      if (!availableRecipes(s).length) { /* la cocina no ofrece nada: no llega nadie */ }
      else if (s.orders.length < QUEUE_MAX) addOrder(s, randomRecipe(s));
      else if (isCareer(s)) { log(s, 'logTurnedAway'); emit(s, 'turnedAway'); loseHeart(s, 'turnedAway'); } // cola llena: el cliente se va
    }
  }
  if (isCareer(s)) expireOrders(s);
  if (s.over) return;
  for (const c of s.cells) if (c) process(s, c, dt);
  // Un producto recién llegado a una cinta no está listo hasta BELT_TIME después (readyAt):
  // eso es lo que impide que cruce dos celdas en un mismo paso, sea cual sea el orden de recorrido.
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
    const c = at(s, x, y);
    if (c?.kind === 'belt' && c.item && c.item.readyAt <= s.time && send(s, x, y, c, c.item)) c.item = null;
  }
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
    const c = at(s, x, y);
    if (c) output(s, x, y, c, dt);
  }
  track(s, dt);
}

// ---------- diagnóstico ----------

// En qué estado terminó el paso cada celda, leído de lo que quedó en ella después de mover y sacar:
//   'work'    trabajando (cocina, arma, saca a su ritmo, o lleva un producto que todavía cruza)
//   'blocked' tiene algo para sacar y el destino no lo recibe
//   'wait'    le falta insumo habiendo pedidos que lo piden
//   'idle'    libre
// Un producto quieto en una celda (cinta) está bloqueado; una cinta vacía está libre.
function cellState(s, c, need) {
  if (c.item) return c.item.readyAt > s.time ? 'work' : 'blocked';
  switch (c.kind) {
    case 'belt': return 'idle';
    case 'grill':
      if (c.processing > 0) return 'work';
      if (c.processing === 0 || (c.cooked > 0 && c.cooldown <= 0)) return 'blocked';
      if (c.cooldown > 0) return 'work';
      return need('patty') > 0 ? 'wait' : 'idle';
    case 'stock':
      if (c.cooldown > 0) return 'work';
      if (need('patty') > 0) return c.store > 0 ? 'blocked' : 'wait';
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
  return !src.onDemand || need(src.emits) > 0 ? 'blocked' : 'idle';
}

/** Acumulado reciente: todo decae con DIAG.tau y el estado de este paso suma dt. */
function track(s, dt) {
  const keep = Math.exp(-dt / DIAG.tau), needs = {}, need = k => (needs[k] ??= pendingNeed(s, k));
  for (const c of s.cells) {
    if (!c) continue;
    const d = c.diag;
    d.work *= keep; d.blocked *= keep; d.wait *= keep; d.idle *= keep;
    d[cellState(s, c, need)] += dt;
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
    const c = s.cells[i], shares = c && c.kind !== 'belt' && diagShares(c);
    if (!shares) continue;
    const x = i % s.W, y = Math.floor(i / s.W), cand = { x, y, kind: c.kind, shares, upstream: upstreamBlocked(s, x, y) };
    const w = shares.work, bw = best?.shares.work;
    if (!best || w > bw + DIAG.tie || (w >= bw - DIAG.tie && cand.upstream > best.upstream)) best = cand;
  }
  return best && best.shares.work >= DIAG.minWork ? best : null;
}

// ---------- guardado ----------

export const serialize = s => JSON.stringify({ ...s, events: [] });

export function deserialize(text) {
  try {
    const s = JSON.parse(text);
    return s && s.v === SAVE_VERSION && Array.isArray(s.cells) && s.cells.length === s.W * s.H ? s : null;
  } catch { return null; }
}
