// Un control que nunca falló no probó nada: rompe el código a propósito, de a una cosa, y comprueba que
// `npm test` se ponga rojo. Si el texto a romper ya no existe, avisa (la mutación quedó vieja).
// Uso: node tools/mutate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const MUTATIONS = [
  ['borrar devuelve todo en vez de la mitad', 'src/sim.js', 's.money += refund(s, cur);', 's.money += cost(s, cur.kind);'],
  ['construir no cobra', 'src/sim.js', '  s.money -= price;\n  put(s, x, y, kind, dir);', '  put(s, x, y, kind, dir);'],
  ['se construye sin dinero', 'src/sim.js', "if (paid(s) && s.money < price) return { ok: false, reason: 'money' };\n  if (cur)", 'if (cur)'],
  ['girar reconstruye la máquina', 'src/sim.js', '    cur.dir = dir;\n    return { ok: true };', '    put(s, x, y, kind, dir);\n    return { ok: true };'],
  ['el pedido no vuelve a la cola', 'src/sim.js', "if (o) o.status = 'pending';", 'if (o) o.status = o.status;'],
  ['ampliar desordena las celdas', 'src/sim.js', 'cells[y * W + x] = s.cells[y * s.W + x];', 'cells[y * s.W + x] = s.cells[y * s.W + x];'],
  ['recetas sin mirar el nivel', 'src/sim.js', 'return s.level >= r.level && INGREDIENTS.every', 'return INGREDIENTS.every'],
  ['recetas sin mirar las fuentes', 'src/sim.js', '&& INGREDIENTS.every(i => !r[i] || hasKind(s, SOURCE_OF[i]));', ';'],
  ['el cliente que se va no baja la reputación', 'src/sim.js', '  s.hearts--;\n  if (s.hearts <= 0)', '  if (s.hearts <= 0)'],
  ['la cola llena no echa a nadie', 'src/sim.js', "else if (isCareer(s)) { log(s, 'logTurnedAway')", "else if (false) { log(s, 'logTurnedAway')"],
  ['la entrega tardía paga completo', 'src/sim.js', 'late ? Math.round(RECIPES[o.recipeKey].price * LATE_PAY) : ', ''],
  ['subir de nivel no pasa nunca', 'src/sim.js', 'delivered(s) >= deliveriesFor(s.level)) {', 'delivered(s) >= Infinity) {'],
  ['el azar no usa la semilla', 'src/sim.js', '  s.seed = (s.seed + 0x6D2B79F5) | 0;\n  let t = s.seed;', '  let t = (Math.random() * 2 ** 32) | 0;'],
  ['se acepta un guardado de otra versión', 'src/sim.js', 's.v === SAVE_VERSION && ', ''],
  ['la partida cerrada sigue avanzando', 'src/sim.js', 'export function step(s, dt) {\n  if (s.over) return;', 'export function step(s, dt) {'],
  ['una cinta frenada por una máquina llena se marca sin salida', 'src/sim.js', 'return !exits(c, item.d).some(', 'return true || exits(c, item.d).some('],
  ['el ingrediente suelto no cuenta como desperdicio', 'src/sim.js', "else { s.stats.waste++; log(s, 'logWaste');", "else { log(s, 'logWaste');"],
  ['la hamburguesa sin cliente no se anota', 'src/sim.js', "log(s, 'logOrphan', { id }); ", ''],
  ['la armadora arranca otro trabajo con la salida ocupada', 'src/sim.js', 'if (!c.job && !c.output) {', 'if (!c.job) {'],
  ['los productos cruzan la cinta sin esperar', 'src/sim.js', 'if (!item || item.readyAt > s.time) return;', 'if (!item) return;'],
  ['guardar pierde la semilla', 'src/sim.js', 'JSON.stringify({ ...s, events: [] })', 'JSON.stringify({ ...s, events: [], seed: 1 })'],
  ['el acumulado no decae', 'src/sim.js', 'd.work *= keep; d.blocked *= keep; d.wait *= keep; d.idle *= keep;', ''],
  ['el diagnóstico decae con otro tiempo', 'src/data.js', 'tau: 60,', 'tau: 600,'],
  ['una cinta con su producto quieto cuenta como trabajando', 'src/sim.js', "return (c.item && c.item.readyAt <= s.time) || (c.item2 && c.item2.readyAt <= s.time) ? 'blocked' : 'work';", "return 'work';"],
  ['la parrilla con la carne lista y sin lugar no cuenta como trabada', 'src/sim.js', "if (c.cooking.length || (c.cooked > 0 && c.cooldown <= 0)) return 'blocked';", ''],
  ['la armadora con la salida ocupada no cuenta como trabada', 'src/sim.js', "if (c.output && c.cooldown <= 0) return 'blocked';", ''],
  ['la armadora sin ingredientes no cuenta como esperando', 'src/sim.js', "return s.orders.some(o => o.status === 'pending') ? 'wait' : 'idle';", "return 'idle';"],
  ['una fuente que no puede sacar no cuenta como trabada', 'src/sim.js', "return !src.onDemand || own() > 0 ? 'blocked' : 'idle';", "return 'idle';"],
  ['el cuello de botella elige la que menos trabaja', 'src/sim.js', 'w > bw + DIAG.tie', 'w < bw - DIAG.tie'],
  ['el empate no mira aguas arriba', 'src/sim.js', '&& cand.upstream > best.upstream', '&& false'],
  ['aguas arriba mira la celda equivocada', 'src/sim.js', 'const n = at(s, x - dx, y - dy);', 'const n = at(s, x + dx, y + dy);'],
  ['las cintas cuentan para el cuello de botella', 'src/sim.js', 'c && !KINDS[c.kind].carries && diagShares(c)', 'c && diagShares(c)'],
  ['hay cuello de botella aunque ninguna máquina trabaje', 'src/sim.js', 'best && best.shares.work >= DIAG.minWork ? best : null', 'best'],
  ['reemplazar conserva el acumulado', 'src/sim.js', '  put(s, x, y, kind, dir);\n  return { ok: true };', '  put(s, x, y, kind, dir);\n  if (cur) at(s, x, y).diag = cur.diag;\n  return { ok: true };'],
  ['guardar pierde los acumulados', 'src/sim.js', 'JSON.stringify({ ...s, events: [] })', 'JSON.stringify({ ...s, events: [], cells: s.cells.map(c => c && { ...c, diag: { work: 0, blocked: 0, wait: 0, idle: 0 } }) })'],
  ['la cola llena cuenta como plazo vencido', 'src/sim.js', "loseHeart(s, 'turnedAway')", "loseHeart(s, 'expired')"],
  ['el total de perdidos olvida la cola llena', 'src/sim.js', 'export const lost = s => s.stats.expired + s.stats.turnedAway;', 'export const lost = s => s.stats.expired;'],
  ['la entrega no dice qué pedido', 'src/sim.js', "emit(s, 'delivered', { id, x, y, amount, late });", "emit(s, 'delivered', { x, y, amount, late });"],
  ['la fila marca por vencer con otro umbral', 'src/crowd.js', 'left < total * 0.3', 'left < total * 0.5'],
  ['la fila marca el vencido como por vencer', 'src/crowd.js', "left < 0 ? 'late'", "left < 0 ? 'soon'"],
  ['la fila no sigue el orden de llegada', 'src/crowd.js', 'p.tx = c.headX - i * CROWD.gap;', 'p.tx = c.headX - (orders.length - 1 - i) * CROWD.gap;'],
  ['el cliente nuevo aparece en su lugar sin caminar', 'src/crowd.js', 'x: c.enterX, z: c.z, heading', 'x: c.headX - i * CROWD.gap, z: c.z, heading'],
  ['al continuar los clientes llegan caminando', 'src/crowd.js', 'place = still || crowd.fresh', 'place = still'],
  ['con movimiento reducido el que llega camina', 'src/crowd.js', 'still || crowd.fresh', 'crowd.fresh'],
  ['el que cobra se va enojado', 'src/crowd.js', "mark: why === 'angry' ? 'angry' : null", "mark: 'angry'"],
  ['el que se le venció se va por el lado de la caja', 'src/crowd.js', "tx: why === 'angry' ? c.enterX : c.leaveX", 'tx: c.leaveX'],
  ['un pedido que se fue sin evento queda dibujado', 'src/crowd.js', 'if (!why || still) { P.delete(key); continue; }', 'if (still) { P.delete(key); continue; }'],
  ['el que encuentra la cola llena no aparece', 'src/crowd.js', "else if (e.type === 'turnedAway') turned++;", ''],
  ['el que mira la cola llena no se vuelve nunca', 'src/crowd.js', '(p.wait -= dt) <= 0', '(p.wait -= 0) < 0'],
  ['falta una frase en inglés', 'src/i18n.js', "    logOrphan: 'The burger for order #{id} arrived after the customer had left.',\n", ''],
  ['una traducción pierde su hueco', 'src/i18n.js', "toastNoMoney: 'Not enough money: ${n} short.'", "toastNoMoney: 'Not enough money.'"],
  ['el español tutea', 'src/i18n.js', 'Elegí una máquina de la barra y tocá una celda.', 'Puedes elegir una máquina de la barra.'],
  ['una frase que nadie usa', 'src/i18n.js', "    tagline: 'Fábrica de hamburguesas',", "    tagline: 'Fábrica de hamburguesas',\n    huerfana: 'x',"],
  ['el código pide una frase que no existe', 'src/hud.js', "t('ordersEmpty')", "t('ordersVacio')"],
  // etapa 3: reparto entre armadoras, divisor y puente
  ['el reparto manda cada pedido a la primera armadora', 'src/sim.js', 'cover(a) > cover(best) || (cover(a) === cover(best) && a.load < best.load)', 'false'],
  ['con empate el reparto no mira la carga', 'src/sim.js', ' || (cover(a) === cover(best) && a.load < best.load)', ''],
  ['el reparto no descuenta lo que ya asignó', 'src/sim.js', '      best.inv[i] = Math.max(0, best.inv[i] - r[i]);\n', ''],
  ['lo que va hacia una sola armadora queda suelto', 'src/sim.js', 'if (to.size === 1) asm.get([...to][0]).inv[item.type]++;', 'if (false) asm.get([...to][0]).inv[item.type]++;'],
  ['cada fuente suelta según toda la cocina', 'src/sim.js', 'if (!to.size) return pendingNeed(s, kind);', 'return pendingNeed(s, kind);'],
  ['el segundo carril del puente no cuenta como lo que viaja', 'src/sim.js', 'for (const item of [c.item, c.item2]) {\n      if (!item || !INGREDIENTS', 'for (const item of [c.item]) {\n      if (!item || !INGREDIENTS'],
  ['el divisor no reparte por turnos', 'src/sim.js', "    if (c.kind === 'splitter') c.turn = (c.turn + k + 1) % 3;\n", ''],
  ['el turno del divisor no saltea la salida que no recibe', 'src/sim.js', 'c.turn = (c.turn + k + 1) % 3', 'c.turn = (c.turn + 1) % 3'],
  ['el divisor espera a la salida llena', 'src/sim.js', 'if (!send(s, x, y, c, item, out[k])) continue;', 'if (!send(s, x, y, c, item, out[k])) return;'],
  ['el divisor recibe de costado', 'src/sim.js', "case 'splitter': return d === cell.dir;", "case 'splitter': return true;"],
  ['el puente saca todo por su frente', 'src/sim.js', "if (c.kind === 'bridge') return [d];", "if (c.kind === 'bridge') return [c.dir];"],
  ['el puente mezcla los dos carriles', 'src/sim.js', "const slot = cell.kind === 'bridge' && d % 2 ? 'item2' : 'item';", "const slot = 'item';"],
  ['el puente gira', 'src/sim.js', '  if (KINDS[kind].noTurn) dir = 0;', ''],
  ['borrar el puente no devuelve el pedido del segundo carril', 'src/sim.js', 'c.item2?.orderId, c.output', 'c.output'],
  ['lo varado en una cinta sin salida cuenta como lo que viaja', 'src/sim.js', 'else if (exits(c, item.d).some(d => arrives(s, x, y, d, item.type))) loose', 'else loose'],
  ['el puente trabado en su segundo carril no cuenta como trabado', 'src/sim.js', ' || (c.item2 && c.item2.readyAt <= s.time)', ''],
  // etapa 4: mejoras de máquina
  ['la mejora no cobra', 'src/sim.js', '  s.money -= price;\n  c.up = true;', '  c.up = true;'],
  ['se mejora sin dinero', 'src/sim.js', "if (paid(s) && s.money < price) return { ok: false, reason: 'money' };\n  s.money -= price;\n  c.up", 's.money -= price;\n  c.up'],
  ['se mejora dos veces', 'src/sim.js', "  if (c.up) return { ok: false, reason: 'done' };\n", ''],
  ['se mejora cualquier máquina', 'src/sim.js', "  if (!UPGRADES[c.kind]) return { ok: false, reason: 'none' };\n", ''],
  ['en modo libre mejorar cobra', 'src/sim.js', '(paid(s) ? UPGRADES[kind].cost : 0)', 'UPGRADES[kind].cost'],
  ['el reembolso olvida la mejora', 'src/sim.js', '(c.up ? upgradeCost(s, c.kind) : 0)', '0'],
  ['la doble hornalla cocina de a una', 'src/sim.js', '(c.up ? UPGRADES.grill.burners : 1)', '1'],
  ['el segundo brazo no acelera', 'src/sim.js', '(c.up ? UPGRADES.assembly.assemble : TIMES.assemble)', 'TIMES.assemble'],
  ['los estantes no agrandan el almacén', 'src/sim.js', '(c.up ? UPGRADES.stock.stock : CAP.stock)', 'CAP.stock'],
  ['reemplazar conserva la mejora', 'src/sim.js', '  put(s, x, y, kind, dir);\n  return { ok: true };', '  put(s, x, y, kind, dir);\n  if (cur) at(s, x, y).up = cur.up;\n  return { ok: true };'],
  ['girar pierde la mejora', 'src/sim.js', '    cur.dir = dir;\n    return { ok: true };', '    cur.dir = dir;\n    cur.up = false;\n    return { ok: true };'],
  ['guardar pierde la mejora', 'src/sim.js', 'JSON.stringify({ ...s, events: [] })', 'JSON.stringify({ ...s, events: [], cells: s.cells.map(c => c && { ...c, up: false }) })'],
  ['se construye donde no hay piso', 'src/sim.js', ' && s.cells[y * s.W + x] !== false;', ';'],
  ['una máquina fija se reemplaza o se gira', 'src/sim.js', "  if (cur?.fixed) return { ok: false, reason: 'fixed' };\n", ''],
  ['una máquina fija se borra', 'src/sim.js', 'if (!cur || cur.fixed || s.over) return false;', 'if (!cur || s.over) return false;'],
  ['las máquinas fijas del local no se marcan', 'src/sim.js', '  for (const [x, y] of lot.fixed ?? []) at(s, x, y).fixed = true;\n', ''],
  ['las columnas del local son piso', 'src/sim.js', '  rects(lot.pillars, (x, y) => { s.cells[y * s.W + x] = false; });\n', ''],
  ['ampliar no mira el local', 'src/sim.js', 'LOTS[s.lot].grow ?? [LOT.growW, LOT.growH]', '[LOT.growW, LOT.growH]'],
  // etapa 7: desafíos
  ['en un desafío borrar devuelve la mitad', 'src/sim.js', '(isPuzzle(s) ? PUZZLE_REFUND : REFUND)', 'REFUND'],
  ['las piezas dadas del desafío no vienen fijas', 'src/sim.js', 'for (const c of s.cells) if (c) c.fixed = true; ', ''],
  ['el guion no trae pedidos', 'src/sim.js', 'if (isPuzzle(s)) feed(s);\n  else if', 'if (false) feed(s);\n  else if'],
  ['en un desafío se pide a mano', 'src/sim.js', ' || (manual && isPuzzle(s))', ''],
  ['en un desafío las entregas suman al presupuesto', 'src/sim.js', 'if (!isPuzzle(s)) s.money += amount;', 's.money += amount;'],
  ['un pedido vencido no pierde el desafío', 'src/sim.js', " || s.orders.some(o => s.time > o.due) ? 'expired'", " ? 'expired'"],
  ['la cola llena no pierde el desafío', 'src/sim.js', ' || s.stats.turnedAway || ', ' || '],
  ['el límite no termina el desafío', 'src/sim.js', "s.time >= P.limit ? 'timeout'", "false ? 'timeout'"],
  ['se gana sin entregar todo', 'src/sim.js', "s.stats.onTime === P.orders.length ? 'won'", "s.stats.onTime >= 1 ? 'won'"],
  ['la estrella de gasto no mira el gasto', 'src/sim.js', 'spendOk = spent <= P.spend', 'spendOk = true'],
  ['la estrella de cintas no las cuenta', 'src/sim.js', 'beltsOk = belts <= P.belts', 'beltsOk = true'],
  ['perder da estrellas', 'src/sim.js', 'stars: won ? 1 + spendOk + beltsOk : 0', 'stars: 1 + spendOk + beltsOk'],
  ['un desafío se abre sin ganar el anterior', 'src/sim.js', 'stars(PUZZLE_ORDER[i - 1]) > 0', 'true'],
  ['el desafío del divisor se gana con una cinta', 'src/data.js', "orders: every(12, 2.5, 'classic')", "orders: every(6, 5, 'classic')"],
  ['un local se abre sin llegar al nivel', 'src/sim.js', '>= LOTS[key].unlock[1]', '>= 0'],
];

const TIMEOUT = 180000;
let bad = 0;
for (const [name, file, find, replace] of MUTATIONS) {
  const original = readFileSync(file, 'utf8');
  if (original.split(find).length !== 2) { console.log(`VIEJA   ${name}: el texto aparece ${original.split(find).length - 1} veces en ${file}`); bad++; continue; }
  writeFileSync(file, original.replace(find, () => replace));
  let run;
  try { run = spawnSync(process.execPath, ['--test'], { encoding: 'utf8', timeout: TIMEOUT }); } finally { writeFileSync(file, original); }
  const hung = run.error?.code === 'ETIMEDOUT', red = run.status !== 0 && !hung;
  console.log(`${hung ? 'COLGADA' : red ? 'roja   ' : 'VERDE  '} ${name}`); // una prueba que se cuelga no es un rojo: es un bucle sin tope
  if (!red) bad++;
}
const clean = spawnSync(process.execPath, ['--test'], { encoding: 'utf8' }).status === 0;
console.log(`\n${MUTATIONS.length - bad} de ${MUTATIONS.length} mutaciones en rojo. Sin mutar: ${clean ? 'verde' : 'ROJO'}.`);
process.exit(bad || !clean ? 1 : 0);
