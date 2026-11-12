// Arranque: une la simulación, la escena 3D y el HUD, y traduce mouse, dedos y teclado en acciones.
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import './style.css';
import { STEP, DIRS, QUEUE_MAX, BUILD_ORDER, RECIPES, SOURCE_OF, INGREDIENTS, KINDS, CAREER_LOTS, PUZZLE_ORDER } from './data.js';
import * as sim from './sim.js';
import { createScene } from './scene.js';
import { createHud } from './hud.js';
import { t, setLang, getLang, STRINGS } from './i18n.js';

const SPEEDS = [1, 3, 6], DRAG_PX = 6, SAVE_EVERY = 5000;
const store = {
  get(k) { try { return localStorage.getItem('bb.' + k); } catch { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem('bb.' + k) : localStorage.setItem('bb.' + k, v); } catch { /* sin almacenamiento se juega igual */ } },
};
const canvas = document.getElementById('scene');
function applyLang(l) { setLang(l); canvas.setAttribute('aria-label', t('boardLabel')); }
applyLang(store.get('lang') ?? (navigator.language.startsWith('es') ? 'es' : 'en'));

const scene = createScene(canvas);
const ui = { tool: 'inspect', dir: 0, selected: null, cursor: null, playing: true, speed: 1, jams: false, lot: 'classic', puzzle: PUZZLE_ORDER[0] }; // lot: el local elegido en el inicio · puzzle: el desafío en juego
let game = sim.newGame('career', 1), started = false, acc = 0;

const loadSave = mode => sim.deserialize(store.get('save.' + mode) ?? '');
// El récord es por local; el de El clásico sigue en la clave de antes, así el récord guardado hasta ahora es el suyo.
const bestKey = lot => (lot === 'classic' ? 'best' : 'best.' + lot);
const loadBest = lot => { try { return JSON.parse(store.get(bestKey(lot))); } catch { return null; } };
// Las mejores estrellas de cada desafío, aparte de las partidas: un desafío es corto y no se guarda a medias.
const loadStars = () => { try { return JSON.parse(store.get('puzzles')) ?? {}; } catch { return {}; } };
const starsOf = key => loadStars()[key] ?? 0;
const save = () => { if (started && !game.over && game.mode !== 'puzzle') store.set('save.' + game.mode, sim.serialize(game)); };
const fit = () => scene.fit(game, hud.insets());

const actions = {
  setTool(tool) { ui.tool = tool; hover(null); },
  rotate() { ui.dir = (ui.dir + 1) % 4; },
  togglePause() { ui.playing = !ui.playing; },
  cycleSpeed() { ui.speed = SPEEDS[(SPEEDS.indexOf(ui.speed) + 1) % SPEEDS.length]; },
  toggleJams() { ui.jams = !ui.jams; scene.setJams(ui.jams); },
  addOrder(key) { sim.addOrder(game, key, true); },
  setAuto(on) { game.autoOrders = on; },
  expand() { const r = sim.expand(game); if (r.reason === 'money') noMoney(sim.expandCost(game)); },
  help() { hud.showHelp(); },
  closeInspector() { select(null); },
  rotateSelected() { const c = selectedCell(); if (c) sim.place(game, ui.selected.x, ui.selected.y, c.kind, (c.dir + 1) % 4); },
  eraseSelected() { if (ui.selected) sim.erase(game, ui.selected.x, ui.selected.y); },
  upgradeSelected() {
    const c = selectedCell();
    if (c && sim.upgrade(game, ui.selected.x, ui.selected.y).reason === 'money') noMoney(sim.upgradeCost(game, c.kind));
  },
  askRestart() {
    hud.confirm(t('confirmRestartTitle'), game.mode === 'puzzle' ? t('confirmRestartPuzzle') : t('confirmRestartBody'), t('actRestart'), () => begin(game.mode, true));
  },
  exit() { save(); started = false; hud.close('dlgOver'); hud.setVisible(false); showStart(); },
  start(mode) { begin(mode, false); },
  pickLot(lot) { ui.lot = lot; showStart(); },
  startPuzzle(key) { if (sim.puzzleOpen(key, starsOf)) { ui.puzzle = key; begin('puzzle', true); } },
  startNew(mode) {
    if (mode === 'career' && !sim.lotOpen(ui.lot, loadBest)) return;
    if (!loadSave(mode) || (started && game.over)) return begin(mode, true);
    hud.confirm(t('confirmNewTitle'), t('confirmNewBody', { mode: t(mode === 'career' ? 'modeCareer' : 'modeSandbox') }), t('actNewGame'), () => begin(mode, true));
  },
  setLang(l) {
    const helpOpen = !!document.querySelector('#dlgHelp[open]');
    applyLang(l); store.set('lang', l); hud.refresh();
    if (!started) showStart();
    if (helpOpen) hud.showHelp();
  },
};
const hud = createHud(document.getElementById('ui'), actions, scene.thumbnails());

document.getElementById('dlgStart').addEventListener('close', () => { if (!started) showStart(); });

function showStart() {
  hud.showStart({ career: loadSave('career'), sandbox: loadSave('sandbox') },
    CAREER_LOTS.map(key => ({ key, open: sim.lotOpen(key, loadBest), best: loadBest(key) })), ui.lot,
    PUZZLE_ORDER.map(key => ({ key, open: sim.puzzleOpen(key, starsOf), stars: starsOf(key) })));
}

// Fases de la sesión. No hay una variable de fase: se deducen, y `running` en frame() las junta.
//   inicio    -> !started (hoja dlgStart abierta, HUD oculto)
//   jugando   -> started && ui.playing && !game.over, sin hojas abiertas
//   en pausa  -> started && !ui.playing        · con una hoja abierta el tiempo tampoco corre
//   cerrada   -> game.over (hoja dlgOver; ya no se guarda ni avanza)
function begin(mode, fresh) {
  game = (!fresh && loadSave(mode)) || sim.newGame(mode, (Date.now() & 0x7fffffff) || 1, mode === 'career' ? ui.lot : mode === 'puzzle' ? ui.puzzle : undefined);
  if (mode === 'career') ui.lot = game.lot; // «Jugar de nuevo» repite el local
  Object.assign(ui, { tool: 'inspect', dir: 0, selected: null, cursor: null, playing: mode !== 'puzzle', speed: 1 }); // un desafío empieza en pausa para armar
  started = true; acc = 0;
  select(null); hover(null);
  hud.close('dlgStart'); hud.close('dlgOver');
  hud.setVisible(true);
  hud.update(game, ui);
  fit();
  save();
  if (mode === 'puzzle') hud.toast(t('toastPuzzleStart'));
  canvas.focus();
}

const selectedCell = () => ui.selected && sim.at(game, ui.selected.x, ui.selected.y);
let reveal = false; // al elegir una celda, el inspector que se abre no la tiene que tapar
function select(cell) { ui.selected = cell; scene.setSelected(cell); reveal = !!cell; }

/** Si la celda elegida quedó debajo del HUD, corre la vista hasta dejarla en la zona libre. */
function revealSelected() {
  reveal = false;
  const p = scene.project(ui.selected.x, ui.selected.y), i = hud.insets(true);
  const free = { l: i.left, t: i.top, r: innerWidth - i.right, b: innerHeight - i.bottom };
  if (p.x > free.l && p.x < free.r && p.y > free.t && p.y < free.b) return;
  scene.panPixels(game, p.x, p.y, (free.l + free.r) / 2, (free.t + free.b) / 2);
}
const noMoney = price => hud.toast(t('toastNoMoney', { n: price - game.money }));

/** Lo que cuesta de verdad poner `kind` en la celda (descontando lo que devuelve lo que hay). */
function netPrice(cell, kind) {
  const cur = sim.at(game, cell.x, cell.y);
  if (cur?.kind === kind) return 0;
  return sim.cost(game, kind) - (cur ? sim.refund(game, cur) : 0);
}

function hover(cell) {
  ui.cursor = cell;
  const cur = cell && sim.at(game, cell.x, cell.y), dir = KINDS[ui.tool]?.noTurn ? 0 : ui.dir; // el puente no gira
  const same = cur?.kind === ui.tool && cur.dir === dir; // ya está puesta así: el fantasma sólo la taparía
  const kind = BUILD_ORDER.includes(ui.tool) && !same && sim.valid(game, cell?.x, cell?.y) && !cur?.fixed ? ui.tool : null;
  scene.setHover(cell, kind, dir, !cell || !kind || game.mode === 'sandbox' || game.money >= netPrice(cell, kind));
}

function applyTool(cell, dir = ui.dir) {
  if (ui.tool === 'inspect') return select(cell);
  if (sim.at(game, cell.x, cell.y)?.fixed) return hud.toast(t('toastFixed'));
  if (ui.tool === 'erase') return sim.erase(game, cell.x, cell.y);
  const r = sim.place(game, cell.x, cell.y, ui.tool, dir);
  if (r.reason === 'money') noMoney(netPrice(cell, ui.tool));
}

// ---------- mouse y dedos ----------
const pointers = new Map();
let gesture = null; // { mode: 'paint' | 'pan' | 'tap' | 'right' | 'pinch', ... }

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (!started) return;
  if (e.isPrimary) { pointers.clear(); gesture = null; } // el primer dedo empieza de cero: borra lo que haya quedado colgado
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { gesture = { mode: 'pinch' }; hover(null); return; }
  const cell = scene.pick(game, e.clientX, e.clientY), base = { x: e.clientX, y: e.clientY, moved: false };
  if (e.button === 1) gesture = { ...base, mode: 'pan', moved: true };
  else if (e.button === 2) gesture = { ...base, mode: 'right' };
  else if (ui.tool === 'inspect') gesture = { ...base, mode: 'tap' };
  else { gesture = { mode: 'paint', last: cell }; if (cell) applyTool(cell); }
});

canvas.addEventListener('pointermove', e => {
  const prev = pointers.get(e.pointerId);
  if (prev && gesture?.mode === 'pinch' && pointers.size === 2) {
    const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
    const before = Math.hypot(prev.x - other.x, prev.y - other.y), now = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    if (before > 0 && now > 0) scene.zoom(game, before / now);
    scene.panPixels(game, (prev.x + other.x) / 2, (prev.y + other.y) / 2, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
  } else if (prev && gesture && gesture.mode !== 'paint') {
    if (!gesture.moved && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > DRAG_PX) gesture.moved = true;
    if (gesture.moved) scene.panPixels(game, prev.x, prev.y, e.clientX, e.clientY);
  } else if (prev && gesture?.mode === 'paint') {
    const cell = scene.pick(game, e.clientX, e.clientY), last = gesture.last;
    if (cell && (!last || cell.x !== last.x || cell.y !== last.y)) {
      const d = last ? DIRS.findIndex(([dx, dy]) => dx === cell.x - last.x && dy === cell.y - last.y) : -1;
      // La cinta toma la dirección del arrastre y pasa por encima de divisores y puentes sin reemplazarlos: así se
      // dibuja la segunda línea a través de un puente. Un toque sí los reemplaza. Divisor y puente se ponen de a uno.
      const keep = c => { const k = sim.at(game, c.x, c.y)?.kind; return k !== 'belt' && KINDS[k]?.carries; };
      if (ui.tool === 'belt' && d >= 0) { ui.dir = d; for (const c of [last, cell]) if (!keep(c)) applyTool(c, d); }
      else if ((ui.tool === 'belt' && !keep(cell)) || ui.tool === 'erase') applyTool(cell);
      gesture.last = cell;
    }
  }
  if (prev) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.pointerType === 'mouse' && started) hover(scene.pick(game, e.clientX, e.clientY));
});

function pointerEnd(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (e.type === 'pointerup' && gesture && !gesture.moved) {
    const cell = scene.pick(game, e.clientX, e.clientY);
    if (gesture.mode === 'tap') select(cell);
    if (gesture.mode === 'right' && cell) sim.erase(game, cell.x, cell.y);
  }
  if (!pointers.size) gesture = null;
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover(null); });
canvas.addEventListener('wheel', e => { e.preventDefault(); if (started) scene.zoom(game, Math.exp(e.deltaY * 0.0012)); }, { passive: false });

// ---------- teclado ----------
const ARROWS = { ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3 }, CAMERA = { d: 0, s: 1, a: 2, w: 3 };

function describe(cell) {
  const c = sim.at(game, cell.x, cell.y);
  return t('cellAnnounce', { ...cell, what: c ? t('kindLong_' + c.kind) : sim.valid(game, cell.x, cell.y) ? t('cellEmpty') : t('cellBlocked') });
}

addEventListener('keydown', e => {
  if (!started || hud.anyDialogOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName, key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const onButton = tag === 'BUTTON' || tag === 'SUMMARY';
  if (key === 'r') actions.rotate();
  else if (key === ' ' && !onButton) actions.togglePause();
  else if (key === 'Escape') { actions.setTool('inspect'); select(null); }
  else if (key in CAMERA) scene.pan(game, ...DIRS[CAMERA[key]]);
  else if (key === '+' || key === '=') scene.zoom(game, 0.88);
  else if (key === '-') scene.zoom(game, 1.14);
  else if (e.target === canvas && key in ARROWS) {
    const [dx, dy] = DIRS[ARROWS[key]], from = ui.cursor ?? ui.selected ?? { x: 0, y: 0 };
    const cell = { x: Math.max(0, Math.min(game.W - 1, from.x + (ui.cursor ? dx : 0))), y: Math.max(0, Math.min(game.H - 1, from.y + (ui.cursor ? dy : 0))) };
    hover(cell);
    scene.lookAt(game, cell.x, cell.y);
    hud.announce(describe(cell));
  } else if (e.target === canvas && key === 'Enter' && ui.cursor) { applyTool(ui.cursor); hud.announce(describe(ui.cursor)); }
  else if (e.target === canvas && (key === 'Delete' || key === 'Backspace') && ui.cursor) { sim.erase(game, ui.cursor.x, ui.cursor.y); hud.announce(describe(ui.cursor)); }
  else return;
  e.preventDefault();
});

// ---------- lo que la simulación anuncia ----------
function levelToast(ev) {
  let text = t('toastLevel', { level: ev.level });
  for (const k of ev.unlocked) {
    text += ' ' + t('toastUnlocked', { recipe: t('recipe_' + k) });
    const missing = INGREDIENTS.find(i => RECIPES[k][i] && !game.cells.some(c => c?.kind === SOURCE_OF[i]));
    if (missing) text += ' ' + t('toastNeedsSource', { source: t('kindLong_' + SOURCE_OF[missing]).toLowerCase() });
  }
  hud.toast(text);
}

/** Atiende lo que anunció la simulación y lo devuelve, para que la escena también lo dibuje. */
function drainEvents() {
  const events = game.events.splice(0);
  for (const ev of events) {
    if (ev.type === 'delivered') hud.floater(scene.project(ev.x, ev.y, 1.3), `+$${ev.amount}`, ev.late ? 'late' : 'ok');
    else if (ev.type === 'waste') hud.floater(scene.project(ev.x, ev.y, 1.3), t('floatWaste'), 'bad');
    else if (ev.type === 'levelup') levelToast(ev);
    else if (ev.type === 'expired') hud.toast(t('toastExpired'));
    else if (ev.type === 'turnedAway') hud.toast(t('toastTurnedAway'));
    else if (ev.type === 'queueFull') hud.toast(t('toastQueueFull', { n: QUEUE_MAX }));
    else if (ev.type === 'expanded') { hud.update(game, ui); fit(); hud.toast(t('toastExpanded')); }
    else if (ev.type === 'gameover') {
      const best = loadBest(game.lot), isBest = !best || game.level > best.level || (game.level === best.level && game.stats.earned > best.earned);
      if (isBest) store.set(bestKey(game.lot), JSON.stringify({ level: game.level, earned: game.stats.earned }));
      store.set('save.career', null);
      hud.showOver(game, isBest);
    } else if (ev.type === 'puzzleEnd') {
      const all = loadStars(), next = PUZZLE_ORDER[PUZZLE_ORDER.indexOf(game.lot) + 1];
      all[game.lot] = Math.max(all[game.lot] ?? 0, sim.puzzleStars(game).stars);
      store.set('puzzles', JSON.stringify(all));
      hud.showPuzzleEnd(game, next && sim.puzzleOpen(next, starsOf) ? next : null);
    }
  }
  return events;
}

// ---------- el bucle ----------
let last = performance.now(), lastSave = last;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); // una pestaña que vuelve del fondo no adelanta la partida
  last = now;
  const running = started && ui.playing && !game.over && !hud.anyDialogOpen();
  if (running) {
    acc += dt * ui.speed;
    while (acc >= STEP) { sim.step(game, STEP); acc -= STEP; }
  }
  const events = drainEvents();
  if (ui.selected && !sim.valid(game, ui.selected.x, ui.selected.y)) select(null);
  if (ui.cursor) hover(ui.cursor);
  scene.render(game, game.time + (running ? acc : 0), dt, running, events);
  if (started) hud.update(game, ui);
  if (reveal && ui.selected) revealSelected();
  if (now - lastSave > SAVE_EVERY) { lastSave = now; save(); }
  requestAnimationFrame(frame);
}

addEventListener('resize', () => { if (started) fit(); else scene.resize(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

// Para las pruebas automáticas (tools/shots.mjs); no cambia nada de la interfaz.
window.__bb = { get game() { return game; }, ui, sim, actions, scene, advance(seconds) { for (let i = 0; i < seconds / STEP; i++) sim.step(game, STEP); }, langs: Object.keys(STRINGS), getLang };

scene.fit(game, { top: 8, bottom: 8, left: 8, right: 8 });
showStart();
requestAnimationFrame(frame);
