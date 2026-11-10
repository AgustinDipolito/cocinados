// Un control que nunca falló no probó nada: rompe el código a propósito, de a una cosa, y comprueba que
// `npm test` se ponga rojo. Si el texto a romper ya no existe, avisa (la mutación quedó vieja).
// Uso: node tools/mutate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const MUTATIONS = [
  ['borrar devuelve todo en vez de la mitad', 'src/sim.js', 's.money += refund(s, cur.kind);', 's.money += cost(s, cur.kind);'],
  ['construir no cobra', 'src/sim.js', '  s.money -= price;\n  put(s, x, y, kind, dir);', '  put(s, x, y, kind, dir);'],
  ['se construye sin dinero', 'src/sim.js', "if (isCareer(s) && s.money < price) return { ok: false, reason: 'money' };\n  if (cur)", 'if (cur)'],
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
  ['una cinta frenada por una máquina llena se marca sin salida', 'src/sim.js', 'return !accepts(at(s, x + dx, y + dy), c.item.type);', 'return true;'],
  ['el ingrediente suelto no cuenta como desperdicio', 'src/sim.js', "else { s.stats.waste++; log(s, 'logWaste');", "else { log(s, 'logWaste');"],
  ['la hamburguesa sin cliente no se anota', 'src/sim.js', "log(s, 'logOrphan', { id }); ", ''],
  ['la armadora arranca otro trabajo con la salida ocupada', 'src/sim.js', 'if (!c.job && !c.output) {', 'if (!c.job) {'],
  ['los productos cruzan dos celdas por paso', 'src/sim.js', 'if (c.item === item && send(s, x, y, c, item)) c.item = null;', 'if (send(s, x, y, c, item)) c.item = null;'],
  ['falta una frase en inglés', 'src/i18n.js', "    logOrphan: 'The burger for order #{id} arrived after the customer had left.',\n", ''],
  ['una traducción pierde su hueco', 'src/i18n.js', "toastNoMoney: 'Not enough money: ${n} short.'", "toastNoMoney: 'Not enough money.'"],
  ['el español tutea', 'src/i18n.js', 'Elegí una máquina de la barra y tocá una celda.', 'Puedes elegir una máquina de la barra.'],
  ['una frase que nadie usa', 'src/i18n.js', "    tagline: 'Fábrica de hamburguesas',", "    tagline: 'Fábrica de hamburguesas',\n    huerfana: 'x',"],
  ['el código pide una frase que no existe', 'src/hud.js', "t('ordersEmpty')", "t('ordersVacio')"],
];

let bad = 0;
for (const [name, file, find, replace] of MUTATIONS) {
  const original = readFileSync(file, 'utf8');
  if (original.split(find).length !== 2) { console.log(`VIEJA   ${name}: el texto aparece ${original.split(find).length - 1} veces en ${file}`); bad++; continue; }
  writeFileSync(file, original.replace(find, () => replace));
  let red;
  try { red = spawnSync(process.execPath, ['--test'], { encoding: 'utf8' }).status !== 0; } finally { writeFileSync(file, original); }
  console.log(`${red ? 'roja   ' : 'VERDE  '} ${name}`);
  if (!red) bad++;
}
const clean = spawnSync(process.execPath, ['--test'], { encoding: 'utf8' }).status === 0;
console.log(`\n${MUTATIONS.length - bad} de ${MUTATIONS.length} mutaciones en rojo. Sin mutar: ${clean ? 'verde' : 'ROJO'}.`);
process.exit(bad || !clean ? 1 : 0);
