// Abre el juego ya armado (dist/) en un Chrome real, lo juega con clics de verdad, mide el HUD dibujado
// y saca capturas a shots/. Uso: npm run build && npm run shots   (CHROME=ruta para usar otro navegador)
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = resolve('dist'), OUT = resolve('shots');
const CHROME = process.env.CHROME ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const VIEWPORTS = { desktop: [1440, 900], laptop: [1024, 640], phone: [390, 844], landscape: [844, 390] };
const MAX_FONT_SIZES = 6, TOUCH = 44, WAIT = { timeout: 60000 };

const server = createServer(async (req, res) => {
  const file = join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  try { res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
await mkdir(OUT, { recursive: true });

const failures = [];
process.on('exit', code => { if (code && failures.length) console.error(`Problemas juntados:\n- ${failures.join('\n- ')}`); });
const check = (where, name, ok, detail = '') => { if (!ok) failures.push(`${where} · ${name} · ${detail}`); };

/** Corre adentro de la página: mide lo dibujado, no el código. */
function measure(maxSizes, touch) {
  const visible = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden]'); };
  const scope = [...document.querySelectorAll('dialog[open]')].at(-1) ?? document.getElementById('hud'); // la hoja de más arriba, o el HUD
  const out = { problems: [] };
  const painted = el => { // la caja recortada contra cada ancestro con scroll: lo que de verdad se pinta
    let { left, top, right, bottom } = el.getBoundingClientRect();
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
      const r = p.getBoundingClientRect();
      left = Math.max(left, r.left); top = Math.max(top, r.top); right = Math.min(right, r.right); bottom = Math.min(bottom, r.bottom);
    }
    return { left, top, right, bottom };
  };
  // 1. paneles: ninguno pisa a otro ni se sale de la ventana
  const zones = [...document.querySelectorAll('#top, #orders, #inspector, #tools, #toast.show, #status, #undo')].filter(visible);
  const rects = zones.map(z => [z.id, painted(z)]);
  for (const [id, r] of rects) if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.problems.push(`${id} se sale de la ventana`);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, ra] = rects[i], [b, rb] = rects[j];
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 2 && h > 2) out.problems.push(`${a} pisa a ${b} (${w.toFixed(0)}×${h.toFixed(0)} px)`);
  }
  // 2. letra: la que se pidió es la que cargó, y no hay más tamaños que los de la ficha
  const sizes = new Set();
  for (const el of scope.querySelectorAll('*')) {
    if (!visible(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    sizes.add(getComputedStyle(el).fontSize);
    if (!getComputedStyle(el).fontFamily.startsWith('Fredoka')) out.problems.push(`letra fuera del token en <${el.tagName.toLowerCase()}>`);
  }
  out.sizes = [...sizes].sort((a, b) => parseFloat(a) - parseFloat(b));
  if (!out.sizes.length) out.problems.push('no se midió ningún texto: el control miró un conjunto vacío');
  if (out.sizes.length > maxSizes) out.problems.push(`${out.sizes.length} tamaños de letra: ${out.sizes.join(', ')}`);
  if (![500, 600].every(w => [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Fredoka' && f.weight == w && f.status === 'loaded'))) out.problems.push('la letra Fredoka no cargó en sus dos pesos');
  // 3. toque: cada control mide al menos el piso, y tiene nombre
  for (const el of scope.querySelectorAll('button, select, summary, label.check')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect(), name = (el.getAttribute('aria-label') ?? el.textContent).trim();
    // recortado por un ancestro que no se puede desplazar en ese eje: lo que queda afuera no se alcanza nunca
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom }, lost = 0;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p), q = p.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { const l = Math.max(box.l, q.left), rr = Math.min(box.r, q.right); if (/hidden|clip/.test(cs.overflowX)) lost += (box.r - box.l) - Math.max(0, rr - l); box.l = l; box.r = rr; }
      if (cs.overflowY !== 'visible') { const t = Math.max(box.t, q.top), bb = Math.min(box.b, q.bottom); if (/hidden|clip/.test(cs.overflowY)) lost += (box.b - box.t) - Math.max(0, bb - t); box.t = t; box.b = bb; }
    }
    if (lost > 2) out.problems.push(`control recortado sin desplazamiento (${lost.toFixed(0)} px): ${name.slice(0, 30)}`);
    if (r.width < touch - 0.5 || r.height < touch - 0.5) out.problems.push(`control chico (${r.width.toFixed(0)}×${r.height.toFixed(0)}): ${name.slice(0, 30)}`);
    if (!name && el.tagName !== 'SELECT') out.problems.push(`control sin nombre: ${el.outerHTML.slice(0, 60)}`);
  }
  // 4. hoja de estilo: cada clase usada tiene su regla
  const walk = r => (r.cssRules?.length ? [...r.cssRules].flatMap(walk).concat(r.selectorText ?? []) : [r.selectorText ?? '']);
  const selectors = [...document.styleSheets].flatMap(s => [...s.cssRules]).flatMap(walk).join(' ');
  const classes = new Set([...document.querySelectorAll('[class]')].flatMap(e => [...e.classList]));
  for (const c of classes) if (!new RegExp(`\\.${c}(?![\\w-])`).test(selectors)) out.problems.push(`clase sin regla: .${c}`);
  if (classes.size < 10) out.problems.push('se examinaron menos de 10 clases');
  // 5. nada corre la página de costado, y ningún texto quedó como plantilla sin resolver
  if (document.documentElement.scrollWidth > innerWidth + 1) out.problems.push('la página se corre de costado');
  const bad = scope.innerText.match(/.{0,20}(undefined|NaN|\{\w+\}|\[object).{0,20}/);
  if (bad) out.problems.push(`texto sin resolver: ${bad[0]}`);
  // 6. prosa: bloques de texto que no son dato
  out.prose = [...scope.querySelectorAll('p')].filter(p => visible(p) && !p.closest('.ticket') && p.textContent.length > 40).length;
  return out;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const summary = [];

const only = process.argv[2]; // npm run shots -- phone-es  -> una sola pantalla
const runs = ['es', 'en'].flatMap(lang => Object.keys(VIEWPORTS).map(vp => [lang, vp]))
  .filter(([lang, vp]) => (only ? `${vp}-${lang}` === only : lang === 'es' || vp === 'desktop' || vp === 'phone'));

// Las pantallas corren de a tres a la vez: tarda menos, y se ve si alguna espera depende del apuro.
const PARALLEL = 3;
const pool = async (list, job) => { const q = [...list]; await Promise.all(Array.from({ length: PARALLEL }, async () => { while (q.length) await job(q.shift()); })); };
await pool(runs, async ([lang, vp]) => {
  const [width, height] = VIEWPORTS[vp];
  const context = await browser.createBrowserContext(); // cada pantalla arranca sin partidas guardadas
  const page = await context.newPage();
  const where = `${vp}-${lang}`;
  page.on('console', m => { if (m.type() === 'error') failures.push(`${where} · consola: ${m.text()}`); });
  page.on('pageerror', e => failures.push(`${where} · error: ${e.message}`));
  await page.setViewport({ width, height, deviceScaleFactor: 1, hasTouch: vp === 'phone' || vp === 'landscape' });
  await page.evaluateOnNewDocument(l => { if (!localStorage.getItem('bb.lang')) localStorage.setItem('bb.lang', l); }, lang);

  /** Espera una condición con tope, y dice cuál no llegó. */
  const until = (label, fn, ...args) => page.waitForFunction(fn, WAIT, ...args).catch(() => { throw new Error(`${where}: no llegó «${label}»`); });
  const ready = () => until('pantalla de inicio', () => window.__bb && document.querySelector('#dlgStart[open]') && document.fonts.status === 'loaded');
  const shot = async (name, { maxProse = 3 } = {}) => {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const m = await page.evaluate(measure, MAX_FONT_SIZES, TOUCH);
    for (const p of m.problems) check(where, name, false, p);
    check(where, name, m.prose <= maxProse, `${m.prose} bloques de prosa (máximo ${maxProse})`);
    await page.screenshot({ path: join(OUT, `${where}-${name}.png`) });
    summary.push({ pantalla: `${where}-${name}`, letras: m.sizes.join(' '), prosa: m.prose });
  };
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const touch = vp === 'phone' || vp === 'landscape';
  const click = sel => page.evaluate(s => document.querySelector(s).click(), sel);
  const noDialog = () => until('sin hojas abiertas', () => !document.querySelector('dialog[open]'));
  const clickCell = async (x, y) => { const p = await page.evaluate((x, y) => window.__bb.scene.project(x, y, 0.3), x, y); await page.mouse.click(p.x, p.y); };
  /** La fila de la vereda: una persona por pedido en cola, en orden de llegada desde la cabeza, cada una en su lugar y a la vista. */
  const checkQueue = async label => {
    const r = await page.evaluate(() => {
      const { game, scene } = window.__bb, list = scene.shownCustomers().filter(p => p.queued).sort((a, b) => b.x - a.x);
      const hidden = list.filter(p => [0.1, 1.15 * 1.45].some(h => { const q = scene.project(p.x - 0.5, p.z - 0.5, h); return document.elementFromPoint(q.x, q.y)?.id !== 'scene'; }));
      return { shown: list.map(p => p.key).join(), want: game.orders.map(o => o.id).join(), loose: list.filter(p => !p.settled).length, hidden: hidden.map(p => p.key).join() };
    });
    check(where, label, r.want && r.shown === r.want, `clientes ${r.shown || 'ninguno'}, pedidos ${r.want || 'ninguno'}`);
    check(where, label, !r.loose, `${r.loose} clientes fuera de su lugar`);
    check(where, label, !r.hidden, `clientes tapados por un panel o fuera de la ventana: ${r.hidden}`);
  };

  page.setDefaultNavigationTimeout(120000); // el WebGL por software de la prueba tarda en arrancar
  await page.goto(url);
  await ready();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape'); // Chrome deja cerrar una hoja al segundo Esc
  await frames();
  check(where, 'inicio', await page.evaluate(() => !!document.querySelector('#dlgStart[open]')), 'Esc cierra el inicio y no queda cómo empezar');
  await shot('1-inicio');
  check(where, 'inicio', await page.evaluate(() => document.getElementById('hud').hidden), 'el HUD se ve detrás del inicio');
  await click('[data-act=help]');
  await until('ayuda abierta', () => document.querySelector('#dlgHelp[open]'));
  await shot('2-ayuda', { maxProse: 4 }); // hoja de ayuda: exenta de la regla de tres, se informa su número
  await click('[data-act=closeHelp]');

  // El primer desafío con clics de verdad: abre en pausa con su primer pedido, se tienden las seis cintas, se reanuda
  // y se gana con las tres estrellas; la hoja de cierre ofrece el siguiente y el progreso queda guardado.
  check(where, 'desafíos', await page.evaluate(() => document.querySelector('[data-act=startPuzzle][data-arg=pzCheese]')?.disabled), 'el segundo desafío está abierto sin ganar el primero');
  await click('[data-act=startPuzzle][data-arg=pzLine]');
  await noDialog();
  check(where, 'desafío', await page.evaluate(() => { const { game, ui } = window.__bb; return game.mode === 'puzzle' && !ui.playing && game.orders.length === 1 && !document.querySelector('#status').hidden; }), 'el desafío no abre en pausa con su primer pedido');
  await shot('1b-desafio-recien-abierto');
  await click('[data-act=setTool][data-arg=belt]');
  for (const [x, y] of [[2, 1], [4, 1], [5, 1], [7, 1], [8, 1]]) await clickCell(x, y); // las coordenadas se miden justo antes de cada clic
  for (let i = 0; i < 3; i++) await page.keyboard.press('r');
  await clickCell(6, 2);
  await until('seis cintas, cobradas', () => { const { game, sim } = window.__bb; return game.money === 8 && sim.at(game, 6, 2)?.dir === 3; });
  await click('[data-act=setTool][data-arg=inspect]');
  await click('[data-act=togglePause]');
  await page.evaluate(() => window.__bb.advance(60));
  await until('hoja de cierre del desafío', () => document.querySelector('#dlgOver[open] [data-act=startPuzzle]'));
  check(where, 'desafío', await page.evaluate(() => window.__bb.game.result === 'won' && JSON.parse(localStorage.getItem('bb.puzzles')).pzLine === 3
    && !!document.querySelector('#dlgOver [data-act=startPuzzle][data-arg=pzCheese]')), 'no ganó con tres estrellas, no lo guardó o no ofrece el siguiente');
  await shot('1c-desafio-cierre');
  await click('#dlgOver [data-act=exit]');
  await ready();
  check(where, 'desafíos', await page.evaluate(() => !document.querySelector('[data-act=startPuzzle][data-arg=pzCheese]').disabled), 'ganar el primero no abre el segundo');

  // Carrera, tal como la encuentra quien llega: sin tocar nada.
  await click('[data-act=startNew][data-arg=career]');
  await noDialog();
  await shot('3-carrera-recien-abierta');
  const first = await page.evaluate(() => ({ tools: document.querySelectorAll('#tools .tool').length, orders: document.querySelectorAll('.ticket').length, money: window.__bb.game.money }));
  check(where, 'miniaturas', await page.evaluate(() => { // cada herramienta y cada receta con su propio dibujo
    const srcs = [...document.querySelectorAll('#tools img, #orderAdd img, .ticket img')].map(i => i.src);
    const tools = [...document.querySelectorAll('#tools img')].map(i => i.src);
    return tools.length === 11 && new Set(tools).size === 11 && !tools.includes(document.querySelector('.ticket img').src) && srcs.every(s => s.length > 2000);
  }), 'dos herramientas comparten miniatura, o una usa la de una receta');
  check(where, 'estado por omisión', first.tools === 15 && first.orders === 1 && first.money === 100, JSON.stringify(first));
  await checkQueue('fila al abrir'); // el primer cliente espera unos 25 s: la fila no cambia mientras se mide
  if (touch) check(where, 'barra del teléfono', await page.evaluate(want => { // enteras, sin desplazar: 14 en parado (Ampliar va arriba), 15 apaisado
    const bar = document.getElementById('tools'), tools = [...bar.querySelectorAll('.tool')].filter(el => el.getBoundingClientRect().width > 0);
    return bar.scrollWidth <= bar.clientWidth + 1 && bar.scrollHeight <= bar.clientHeight + 1 && tools.length === want
      && tools.every(el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
  }, vp === 'phone' ? 14 : 15), 'la barra de herramientas se desplaza, deja herramientas fuera de la ventana o no tiene las que tocan');
  if (vp === 'phone') { // en parado, Ampliar está en la barra de arriba, dentro de «más»
    await click('[data-act=toggleMore]');
    await until('barra de arriba desplegada', () => document.querySelector('#top.more'));
    check(where, 'ampliar arriba', await page.evaluate(() => { const r = document.querySelector('#top [data-act=expand]').getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }), 'Ampliar no está en la barra de arriba desplegada');
    await click('[data-act=toggleMore]');
    await until('barra de arriba plegada', () => !document.querySelector('#top.more'));
  }

  if (touch) { // un dedo queda apoyado mientras se abre una hoja; después, un toque tiene que seguir eligiendo
    const a = await page.evaluate(() => window.__bb.scene.project(1, 5, 0));
    const finger = await page.touchscreen.touchStart(a.x, a.y);
    await click('#controls [data-act=help]');
    await until('ayuda abierta con un dedo apoyado', () => document.querySelector('#dlgHelp[open]'));
    await finger.end();
    await click('[data-act=closeHelp]');
    await noDialog();
    // El primer toque eligió su celda (1,5) y la vista se corrió para mostrarla. Se suelta la selección y se toca
    // esa misma celda, que seguro quedó a la vista; las coordenadas se miden recién ahora.
    await frames();
    await click('[data-act=closeInspector]');
    await until('selección suelta', () => !window.__bb.ui.selected);
    const b = await page.evaluate(() => window.__bb.scene.project(1, 5, 0));
    check(where, 'toque', await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.id === 'scene', b), 'la celda del toque quedó debajo de un panel');
    await page.touchscreen.tap(b.x, b.y);
    await frames();
    check(where, 'toque', await page.evaluate(() => window.__bb.ui.selected?.x === 1 && window.__bb.ui.selected?.y === 5), 'después de una hoja abierta a mitad de un toque, el tablero no responde');
    await click('[data-act=closeInspector]');
  }

  // Girar la vista con el botón: un cuarto, y una celda a la vista se elige igual con la vista girada. Después se vuelve
  // con Q a la vista de siempre, que es la que supone todo el resto del recorrido.
  const viewStill = (label, rot) => until(label, r => { // quieta: dos lecturas seguidas, un cuadro aparte, coinciden
    const { ui, scene } = window.__bb, p = scene.project(0, 0), k = p.x.toFixed(1) + ',' + p.y.toFixed(1);
    const same = window.__lastView === k; window.__lastView = k;
    return ui.rot === r && scene.viewTurn() === r && same;
  }, rot);
  await page.evaluate(() => { window.__lastView = null; });
  await click('[data-act=rotateView]');
  await viewStill('vista girada y quieta', 1);
  check(where, 'vista girada', await page.evaluate(() => {
    const { game, sim, scene } = window.__bb;
    for (let y = 0; y < game.H; y++) for (let x = 0; x < game.W; x++) {
      if (!sim.valid(game, x, y)) continue;
      const p = scene.project(x, y);
      if (document.elementFromPoint(p.x, p.y)?.id !== 'scene') continue; // tapada por un panel o fuera de la ventana
      const c = scene.pick(game, p.x, p.y);
      return c?.x === x && c?.y === y;
    }
    return false; // ninguna celda a la vista: el control no miró nada
  }), 'con la vista girada, la celda proyectada no es la que se elige');
  await shot('3b-vista-girada');
  await page.evaluate(() => { window.__lastView = null; });
  await page.keyboard.press('q');
  await viewStill('vista de siempre otra vez', 0);

  // Se juega: pasa el tiempo y se inspecciona una máquina con un clic de verdad.
  await page.evaluate(() => window.__bb.advance(47));
  await until('primera entrega en pantalla', () => window.__bb.game.stats.onTime > 0 && document.querySelector('#stats').textContent.includes('$' + window.__bb.game.money));
  await clickCell(3, 1);
  await until('inspector de la parrilla', () => window.__bb.ui.selected?.x === 3 && !document.querySelector('#inspector').hidden);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  check(where, 'inspector', await page.evaluate(() => { // la celda inspeccionada no queda debajo de un panel
    const p = window.__bb.scene.project(3, 1, 0.3);
    return document.elementFromPoint(p.x, p.y)?.id === 'scene';
  }), 'el inspector tapa la celda que se inspecciona');
  await shot('4-carrera-jugando');

  // Mejorar la parrilla desde el inspector, en pausa: sin plata el botón se ve corto, dice cuánto falta y no cobra;
  // con plata mejora, el inspector lo dice y el botón ya no está.
  await click('[data-act=togglePause]');
  await until('cartel de pausa', () => !document.querySelector('#status').hidden);
  await page.evaluate(() => { window.__bb.game.money = 100; });
  await until('Mejorar corto, con lo que falta', () => document.querySelector('[data-act=upgradeSelected].short')?.textContent.includes('$40'));
  await shot('4b-mejorable-sin-dinero');
  await page.evaluate(() => { document.querySelector('#toast').textContent = ''; }); // el aviso se apaga a los 3,2 s: se mira su texto, que queda
  await click('[data-act=upgradeSelected]');
  await until('aviso de que no alcanza para mejorar', () => document.querySelector('#toast').textContent.includes('$40'));
  check(where, 'mejorar sin dinero', await page.evaluate(() => { const { game, sim } = window.__bb; return game.money === 100 && !sim.at(game, 3, 1).up; }), 'cobró o mejoró sin plata');
  await page.evaluate(() => { window.__bb.game.money = 300; });
  await until('Mejorar con plata', () => document.querySelector('[data-act=upgradeSelected]:not(.short)'));
  await frames();
  // La marca dorada dibuja lo que dice el motor (puede ser ninguna si la parrilla todavía no llega a no dar abasto).
  const hintMatch = () => page.evaluate(() => { const { game, sim, scene } = window.__bb, a = sim.upgradeHint(game), b = scene.shownHint();
    return a ? b?.x === a.x && b?.y === a.y : b === null; });
  check(where, 'marca de mejora', await hintMatch(), 'la marca dorada no coincide con upgradeHint');
  await click('[data-act=upgradeSelected]');
  await until('parrilla mejorada, cobrada y sin botón', () => { const { game, sim } = window.__bb;
    return sim.at(game, 3, 1).up && game.money === 160 && !document.querySelector('[data-act=upgradeSelected]') && !document.querySelector('#inspector').hidden; });
  await frames();
  check(where, 'marca de mejora', await hintMatch() && await page.evaluate(() => { const h = window.__bb.scene.shownHint(); return !(h?.x === 3 && h?.y === 1); }), 'la marca sigue sobre la parrilla mejorada');
  await shot('4c-mejorada');
  await click('[data-act=closeInspector]');
  await click('[data-act=togglePause]');

  // Se construye con clics, en pausa (así la plata no cambia sola mientras se mide): un proveedor de queso y su cinta.
  await click('[data-act=togglePause]');
  await until('cartel de pausa', () => !document.querySelector('#status').hidden);
  const before = await page.evaluate(() => window.__bb.game.money);
  const buildCheese = async () => {
    await click('[data-act=setTool][data-arg=cheese]');
    await clickCell(7, 5);
    await until('queso puesto', () => { const { sim, game } = window.__bb; return sim.at(game, 7, 5)?.kind === 'cheese'; });
    const mid = await page.evaluate(() => window.__bb.game.money); // la plata entre los dos gestos
    await click('[data-act=setTool][data-arg=belt]');
    await clickCell(7, 4);
    return mid;
  };
  for (let i = 0; i < 3; i++) await page.keyboard.press('r'); // la salida, hacia arriba
  const afterCheese = await buildCheese();
  // Deshacer con clics, en pausa: el botón aparece; un clic saca la cinta y devuelve su plata, otro saca el queso.
  await until('cinta puesta y Deshacer a la vista', () => { const { sim, game } = window.__bb, r = document.querySelector('#undo').getBoundingClientRect();
    return sim.at(game, 7, 4)?.kind === 'belt' && r.width > 0 && r.height > 0; });
  await shot('5a-deshacer-a-la-vista');
  await click('#undo');
  await until('cinta deshecha', m => { const { sim, game } = window.__bb; return !sim.at(game, 7, 4) && sim.at(game, 7, 5)?.kind === 'cheese' && game.money === m; }, afterCheese);
  await click('#undo');
  await until('queso deshecho', m => { const { sim, game } = window.__bb; return !sim.at(game, 7, 5) && game.money === m; }, before);
  await buildCheese(); // se vuelve a construir lo mismo, así el resto del recorrido sigue igual
  await until('queso construido y cobrado', m => { const { sim, game } = window.__bb; return sim.at(game, 7, 5)?.kind === 'cheese' && sim.at(game, 7, 4)?.dir === 3 && game.money === m - 27; }, before);
  await click('[data-act=togglePause]');
  await page.evaluate(() => window.__bb.advance(90));
  await until('se entrega una con queso', () => window.__bb.game.stats.earned % 24 !== 0);

  // Ampliar: la primera vez alcanza; la segunda no, y tiene que avisar sin cobrar.
  await page.evaluate(() => { window.__bb.game.money = 160; });
  await click('[data-act=expand]');
  await until('terreno ampliado', () => window.__bb.game.W === 16 && window.__bb.game.money === 10);
  await click('[data-act=expand]');
  await until('aviso de que no alcanza', () => document.querySelector('#toast.show'));
  check(where, 'ampliar sin dinero', await page.evaluate(() => window.__bb.game.money === 10 && window.__bb.game.expansions === 1), 'cobró o amplió sin plata');
  await shot('5-ampliado-y-sin-dinero');

  // Capa de atascos: sin despacho la línea se traba; el botón (en compacta, dentro de «más») marca esas celdas.
  await page.evaluate(() => { const b = window.__bb; b.sim.erase(b.game, 10, 3); b.game.hearts = 5; b.advance(60); });
  await click('[data-act=togglePause]');
  await until('cartel de pausa', () => !document.querySelector('#status').hidden);
  const compact = await page.evaluate(() => getComputedStyle(document.querySelector('[data-act=toggleMore]')).display !== 'none');
  if (compact) { await click('[data-act=toggleMore]'); await until('barra de arriba desplegada', () => document.querySelector('#top.more')); }
  check(where, 'atascos', await page.evaluate(() => { const r = document.querySelector('[data-act=toggleJams]').getBoundingClientRect(); return r.width > 0 && r.height > 0; }), 'el botón de atascos no se ve');
  await click('[data-act=toggleJams]');
  await until('capa de atascos prendida', () => window.__bb.ui.jams && document.querySelector('[data-act=toggleJams]').getAttribute('aria-pressed') === 'true');
  await frames();
  check(where, 'atascos', await page.evaluate(() => { // marca exactamente las celdas trabadas, y alguna hay
    const { game, sim, scene } = window.__bb, key = c => `${c.x},${c.y}`;
    const want = game.cells.map((c, i) => ({ c, x: i % game.W, y: Math.floor(i / game.W) })).filter(({ c }) => (sim.diagShares(c)?.blocked ?? 0) >= 0.5).map(key).sort();
    const shown = scene.shownJams().map(key).sort();
    return !game.over && want.length > 0 && want.join() === shown.join();
  }), 'la capa no marca las celdas trabadas');
  await checkQueue('fila con la cola cargada');
  await shot('5b-atascos');
  await click('[data-act=toggleJams]');
  await frames();
  check(where, 'atascos', await page.evaluate(() => !window.__bb.ui.jams && window.__bb.scene.shownJams().length === 0), 'la capa no se apaga');
  if (compact) await click('[data-act=toggleMore]');
  await click('[data-act=togglePause]');

  // Final: sin despacho los clientes se van y la cocina cierra.
  await page.evaluate(() => { const b = window.__bb; b.sim.erase(b.game, 10, 3); b.advance(600); });
  await until('fin de la partida', () => document.querySelector('#dlgOver[open]'));
  check(where, 'fin', await page.evaluate(() => { const s = window.__bb.game.stats, p = document.getElementById('overWhy')?.textContent ?? '';
    return p.includes(String(s.expired)) && p.includes(String(s.turnedAway)); }), 'la hoja de cierre no reparte los clientes perdidos');
  await shot('6-fin');

  // Locales: sin récord en El clásico, El pasillo está cerrado y dice qué falta; con nivel 4 en cada uno se abren todos.
  await click('#dlgOver [data-act=exit]');
  await ready();
  await click('[data-act=pickLot][data-arg=hall]');
  await until('local cerrado elegido', () => document.querySelector('[data-arg=hall][aria-pressed=true]'));
  check(where, 'local cerrado', await page.evaluate(() => document.querySelector('[data-act=startNew][data-arg=career]').disabled), 'deja empezar un local cerrado');
  await shot('6b-local-cerrado');
  await page.evaluate(() => { for (const k of ['best', 'best.hall', 'best.corner', 'best.columns']) localStorage.setItem('bb.' + k, JSON.stringify({ level: 4, earned: 400 })); });
  let seed = null; // La sorpresa: la semilla que muestra el inicio
  for (const lot of ['hall', 'corner', 'columns', 'island', 'random']) {
    await click(`[data-act=pickLot][data-arg=${lot}]`);
    await until('local abierto elegido', l => document.querySelector(`[data-arg=${l}][aria-pressed=true]`) && !document.querySelector('[data-act=startNew][data-arg=career]').disabled, lot);
    if (lot === 'hall') await shot('6c-locales');
    if (lot === 'random') { // la sala va en la URL y en el párrafo del local; «Otra sala» cambia semilla y plano
      const room = () => page.evaluate(() => ({ hash: location.hash, seed: window.__bb.ui.lotSeed,
        plan: document.querySelector('[data-act=pickLot][data-arg=random] .plan').innerHTML,
        info: document.querySelector('[data-act=rerollLot]')?.parentElement.previousElementSibling.textContent ?? '' }));
      const a = await room();
      check(where, 'la sorpresa', a.hash === '#sala=' + a.seed && a.info.includes(String(a.seed)), JSON.stringify({ hash: a.hash, seed: a.seed }));
      await click('[data-act=rerollLot]');
      await until('otra sala', s0 => window.__bb.ui.lotSeed !== s0 && location.hash === '#sala=' + window.__bb.ui.lotSeed, a.seed);
      const b = await room();
      check(where, 'la sorpresa', b.plan !== a.plan && b.info.includes(String(b.seed)), 'otra sala no cambió el plano o el número');
      seed = b.seed;
    }
    await click('[data-act=startNew][data-arg=career]');
    if (await page.evaluate(() => !!document.querySelector('#dlgConfirm[open]'))) await click('[data-act=confirmOk]');
    await noDialog();
    await page.evaluate(() => window.__bb.advance(45));
    await click('[data-act=togglePause]');
    await until('primera entrega del local, en pausa', l => window.__bb.game.lot === l && window.__bb.game.stats.onTime > 0 && !document.querySelector('#status').hidden, lot);
    if (lot === 'random') check(where, 'la sorpresa', await page.evaluate(n => window.__bb.game.lotSeed === n, seed), 'la partida no usa la semilla mostrada');
    if (lot === 'corner') { // tocar donde no hay piso no elige nada
      await clickCell(2, 2);
      await frames();
      check(where, 'local con forma', await page.evaluate(() => !window.__bb.ui.selected), 'se eligió una celda sin piso');
    }
    if (lot === 'island') { // la máquina fija se inspecciona, pero no se borra ni se gira
      await clickCell(6, 3);
      await until('inspector del despacho fijo', () => window.__bb.ui.selected?.x === 6 && !document.querySelector('#inspector').hidden);
      check(where, 'máquina fija', await page.evaluate(() => !document.querySelector('[data-act=eraseSelected], [data-act=rotateSelected]')), 'la máquina fija ofrece borrar o girar');
    }
    await shot(`6d-local-${lot}`);
    await click('#controls [data-act=exit]');
    await ready();
  }
  // Modo libre: la cocina del prototipo.
  await click('[data-act=startNew][data-arg=sandbox]');
  await noDialog();
  await page.evaluate(() => window.__bb.advance(70));
  await until('entregas del modo libre', () => window.__bb.game.stats.onTime >= 3);
  await shot('7-libre');

  // Divisor y puente con clics de verdad, en pausa: se ponen de a uno, y una cinta arrastrada pasa por encima del puente sin borrarlo.
  await click('[data-act=togglePause]');
  await until('cartel de pausa', () => !document.querySelector('#status').hidden);
  const cellAt = (x, y) => page.evaluate((x, y) => window.__bb.scene.project(x, y, 0.2), x, y);
  await click('[data-act=setTool][data-arg=bridge]');
  await clickCell(13, 2);
  await click('[data-act=setTool][data-arg=splitter]');
  await clickCell(15, 7);
  await click('[data-act=setTool][data-arg=belt]');
  for (const [i, [x, y]] of [[12, 2], [13, 2], [14, 2]].entries()) { // las coordenadas se miden justo antes de usarlas
    const p = await cellAt(x, y);
    if (i === 0) { await page.mouse.move(p.x, p.y); await page.mouse.down(); } else await page.mouse.move(p.x, p.y, { steps: 6 });
  }
  await page.mouse.up();
  await until('divisor, puente y cinta cruzada', () => { const { sim, game } = window.__bb, k = (x, y) => sim.at(game, x, y)?.kind;
    return k(15, 7) === 'splitter' && k(13, 2) === 'bridge' && k(12, 2) === 'belt' && k(14, 2) === 'belt' && sim.at(game, 14, 2).dir === 0; });
  for (const [i, [x, y]] of [[13, 2], [13, 3]].entries()) { // un arrastre que empieza sobre el puente tampoco lo borra
    const p = await cellAt(x, y);
    if (i === 0) { await page.mouse.move(p.x, p.y); await page.mouse.down(); } else await page.mouse.move(p.x, p.y, { steps: 6 });
  }
  await page.mouse.up();
  await until('arrastre desde el puente', () => { const { sim, game } = window.__bb;
    return sim.at(game, 13, 2)?.kind === 'bridge' && sim.at(game, 13, 3)?.kind === 'belt' && sim.at(game, 13, 3).dir === 1; });
  await click('[data-act=setTool][data-arg=inspect]');
  await clickCell(13, 2);
  await until('inspector del puente', () => window.__bb.ui.selected?.x === 13 && !document.querySelector('#inspector').hidden);
  await shot('7b-divisor-y-puente');
  await click('[data-act=closeInspector]');
  // Filtro con clics: se pone, se inspecciona y «Cambiar ingrediente» pasa al siguiente.
  await click('[data-act=setTool][data-arg=filter]');
  await clickCell(13, 7);
  await until('filtro puesto', () => { const { sim, game } = window.__bb; return sim.at(game, 13, 7)?.kind === 'filter'; });
  await click('[data-act=setTool][data-arg=inspect]');
  await clickCell(13, 7);
  await until('inspector del filtro', () => window.__bb.ui.selected?.x === 13 && document.querySelector('[data-act=cyclePick]'));
  const pick0 = await page.evaluate(() => { const { sim, game } = window.__bb; return sim.at(game, 13, 7).pick; });
  await click('[data-act=cyclePick]');
  await until('el filtro eligió otro ingrediente', p => { const { sim, game } = window.__bb, c = sim.at(game, 13, 7); return c.pick && c.pick !== p; }, pick0);
  await shot('7c-filtro');
  await click('[data-act=closeInspector]');
  await click('[data-act=togglePause]');

  await click('[data-act=askRestart]');
  await until('confirmación', () => document.querySelector('#dlgConfirm[open]'));
  await shot('8-confirmar');
  await click('[data-act=closeConfirm]');

  // Otra partida con un producto del mismo número y otro tipo: al cambiar de partida cada producto lleva su modelo.
  await until('un producto que no es carne cruda, en una cinta', () => { // cuando aparece, en el mismo instante se pausa y se arma la otra partida
    const { sim, game, ui } = window.__bb, shown = game.cells.find(c => c?.item && c.item.type !== 'raw')?.item;
    if (!shown) return false;
    ui.playing = false;
    const other = sim.newGame('career', 1);
    sim.erase(other, 3, 1); // sin parrilla, la carne cruda se queda quieta en su cinta y sigue ahí al mirar
    while (!other.cells.some(c => c?.item)) sim.step(other, 0.1);
    other.cells.find(c => c?.item).item.id = shown.id; // carne cruda con el número de un producto que está en pantalla
    localStorage.setItem('bb.save.career', sim.serialize(other));
    return true;
  });
  await frames();
  await click('#controls [data-act=exit]');
  await ready();
  await click('[data-act=start][data-arg=career]');
  await noDialog();
  await click('[data-act=togglePause]');
  await frames();
  check(where, 'modelos al cambiar de partida', await page.evaluate(() => {
    const { game, scene } = window.__bb, want = new Map();
    for (const c of game.cells) { if (c?.item) want.set(c.item.id, c.item.type); if (c?.output) want.set(c.output.id, 'burger'); }
    const shown = scene.shownItems();
    return shown.length > 0 && shown.length === want.size && shown.every(i => want.get(i.id) === i.type);
  }), 'un producto se dibuja con el modelo de la partida anterior');
  await checkQueue('fila al continuar otra partida'); // los clientes de la partida recuperada ya están en su lugar, ninguno de la anterior

  // Lo guardado vuelve: se sale, se recarga la página y se continúa.
  await click('#controls [data-act=exit]');
  await ready();
  await page.evaluate(() => { location.hash = '#sala=4242&nivel=6'; }); // un enlace compartido con su marca: al abrir elige esa sala
  await page.reload();
  await ready();
  check(where, 'enlace de sala', await page.evaluate(() => { const { ui } = window.__bb;
    return ui.lot === 'random' && ui.lotSeed === 4242 && !!document.querySelector('[data-act=pickLot][data-arg=random][aria-pressed=true]'); }), 'abrir con #sala=4242 no elige esa sala');
  check(where, 'marca a batir', await page.evaluate(() => { const { ui } = window.__bb, info = document.querySelector('[data-act=rerollLot]')?.parentElement.previousElementSibling.textContent ?? '';
    return ui.dare?.seed === 4242 && ui.dare?.level === 6 && /\b6\b/.test(info) && location.hash === '#sala=4242&nivel=6'; }), 'el enlace con nivel no deja la marca, o el párrafo del local no la nombra');
  check(where, 'continuar', await page.evaluate(() => !!document.querySelector('[data-act=start][data-arg=sandbox]')), 'no ofrece continuar la partida guardada');
  await click('[data-act=start][data-arg=sandbox]');
  await noDialog();
  check(where, 'continuar', await page.evaluate(() => window.__bb.game.time >= 70 && window.__bb.game.stats.onTime >= 3), 'la partida no volvió como estaba');
  await context.close();
});

await browser.close();
server.close();
console.table(summary);
if (failures.length) { console.error(`\n${failures.length} problema(s)`); process.exit(1); }
console.log(`\nSin problemas en ${summary.length} pantallas. Capturas en shots/`);
