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
  const zones = [...document.querySelectorAll('#top, #orders, #inspector, #log, #tools, #toast.show, #status')].filter(visible);
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

  // Carrera, tal como la encuentra quien llega: sin tocar nada.
  await click('[data-act=startNew][data-arg=career]');
  await noDialog();
  await shot('3-carrera-recien-abierta');
  const first = await page.evaluate(() => ({ tools: document.querySelectorAll('#tools .tool').length, orders: document.querySelectorAll('.ticket').length, money: window.__bb.game.money }));
  check(where, 'miniaturas', await page.evaluate(() => { // cada herramienta y cada receta con su propio dibujo
    const srcs = [...document.querySelectorAll('#tools img, #orderAdd img, .ticket img')].map(i => i.src);
    const tools = [...document.querySelectorAll('#tools img')].map(i => i.src);
    return tools.length === 8 && new Set(tools).size === 8 && !tools.includes(document.querySelector('.ticket img').src) && srcs.every(s => s.length > 2000);
  }), 'dos herramientas comparten miniatura, o una usa la de una receta');
  check(where, 'estado por omisión', first.tools === 12 && first.orders === 1 && first.money === 100, JSON.stringify(first));

  if (touch) { // un dedo queda apoyado mientras se abre una hoja; después, un toque tiene que seguir eligiendo
    const a = await page.evaluate(() => window.__bb.scene.project(1, 5, 0));
    const finger = await page.touchscreen.touchStart(a.x, a.y);
    await click('#controls [data-act=help]');
    await until('ayuda abierta con un dedo apoyado', () => document.querySelector('#dlgHelp[open]'));
    await finger.end();
    await click('[data-act=closeHelp]');
    await noDialog();
    const b = await page.evaluate(() => window.__bb.scene.project(5, 1, 0.3)); // se mide ahora: el primer toque pudo correr la vista
    await page.touchscreen.tap(b.x, b.y);
    await frames();
    check(where, 'toque', await page.evaluate(() => window.__bb.ui.selected?.x === 5 && window.__bb.ui.selected?.y === 1), 'después de una hoja abierta a mitad de un toque, el tablero no responde');
    await click('[data-act=closeInspector]');
  }

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
  await click('#log summary');
  await shot('4-carrera-jugando');
  await click('[data-act=closeInspector]');
  await click('#log summary');

  // Se construye con clics, en pausa (así la plata no cambia sola mientras se mide): un proveedor de queso y su cinta.
  await click('[data-act=togglePause]');
  await until('cartel de pausa', () => !document.querySelector('#status').hidden);
  const before = await page.evaluate(() => window.__bb.game.money);
  await click('[data-act=setTool][data-arg=cheese]');
  for (let i = 0; i < 3; i++) await page.keyboard.press('r'); // la salida, hacia arriba
  await clickCell(7, 5);
  await click('[data-act=setTool][data-arg=belt]');
  await clickCell(7, 4);
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

  // Final: sin despacho los clientes se van y la cocina cierra.
  await page.evaluate(() => { const b = window.__bb; b.sim.erase(b.game, 10, 3); b.advance(600); });
  await until('fin de la partida', () => document.querySelector('#dlgOver[open]'));
  await shot('6-fin');

  // Modo libre: la cocina del prototipo.
  await click('#dlgOver [data-act=exit]');
  await ready();
  await click('[data-act=startNew][data-arg=sandbox]');
  await noDialog();
  await page.evaluate(() => window.__bb.advance(70));
  await until('entregas del modo libre', () => window.__bb.game.stats.onTime >= 3);
  await shot('7-libre');
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

  // Lo guardado vuelve: se sale, se recarga la página y se continúa.
  await click('#controls [data-act=exit]');
  await ready();
  await page.reload();
  await ready();
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
