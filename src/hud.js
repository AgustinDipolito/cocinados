// El HUD es HTML encima del lienzo 3D. Lee el estado y avisa los toques con actions.*; no toca la simulación.
import { BUILD_ORDER, RECIPES, KINDS, CAP, UPGRADES, QUEUE_MAX, HEARTS, PUZZLES, deliveriesFor } from './data.js';
import { at, cost, refund, upgradeCost, burners, stockCap, assembleTime, expandCost, canExpand, lotGrow, sourceNeed, availableRecipes, isStuck, delivered, lost, diagShares, bottleneck, puzzleStars, lotOf, canUndo, countOf, limitOf, nextLimit } from './sim.js';
import { t, LANGS, getLang } from './i18n.js';
import { orderRisk } from './crowd.js';

const svg = d => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  pause: svg('M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'),
  play: svg('M8 5l11 7-11 7z'),
  speed: svg('M4 6l8 6-8 6zM12 6l8 6-8 6z'),
  help: '<span class="ico q" aria-hidden="true">?</span>',
  restart: svg('M12 5V2L7.5 6 12 10V7a5 5 0 11-5 5H5a7 7 0 107-7z'),
  exit: svg('M10 4H5v16h5v-2H7V6h3zM14 8l-1.4 1.4 1.6 1.600H9v2h5.200l-1.6 1.600L14 16l4-4z'),
  rotate: svg('M12 5V2L7.5 6 12 10V7a5 5 0 11-5 5H5a7 7 0 107-7z'),
  inspect: svg('M6 3l13 9.5-5.6.900 3.3 6.1-2.1 1.1-3.3-6.100L7 18.500z'),
  erase: svg('M8 4h8l1 2h3v2H4V6h3zM6 9h12l-1 11H7z'),
  expand: svg('M4 4h7v2H7.400l4.3 4.3-1.4 1.400L6 7.400V11H4zM20 20h-7v-2h3.600l-4.3-4.3 1.4-1.4 4.3 4.300V13h2z'),
  close: svg('M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.400z'),
  heart: svg('M12 20.500l-1.3-1.200C5.4 14.5 3 12.3 3 9.2 3 6.8 4.9 5 7.2 5c1.4 0 2.8.700 3.6 1.800l1.2 1.5 1.2-1.500C14 5.7 15.4 5 16.8 5 19.1 5 21 6.8 21 9.200c0 3.1-2.4 5.3-7.7 10.100z'),
  more: svg('M5 10a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4z'),
  arrow: svg('M4 10.500h10V6l7 6-7 6v-4.500H4z'),
  upgrade: svg('M12 3l8 8h-5v9H9v-9H4z'),
  lock: svg('M8 10V7a4 4 0 118 0v3h2v11H6V10zm2 0h4V7a2 2 0 10-4 0z'),
  view: svg('M12 4V1L8 5l4 4V6a6 6 0 015.3 8.8l1.46 1.46A8 8 0 0012 4zm0 14a6 6 0 01-5.3-8.8L5.24 7.74A8 8 0 0012 20v3l4-4-4-4z'), // girar la vista: dos flechas en círculo
  undo: svg('M9 4L3 9.5 9 15v-4h6a3.5 3.5 0 010 7h-4v2.5h4a6 6 0 000-12H9z'), // flecha que vuelve
  jams: svg('M12 2l10 10-10 10L2 12zM9.4 8v8h1.8V8zM12.8 8v8h1.8V8z'), // la misma marca que la capa de atascos
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clock = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const money = n => `$${n}`;
const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
/** n estrellas llenas de total: llenas y huecas, la forma dice lo mismo que el color. */
const stars = (n, total = 3) => `<svg class="stars" viewBox="0 0 ${24 * total} 24" width="${18 * total}" height="18" aria-hidden="true">${
  Array.from({ length: total }, (_, i) => `<path class="${i < n ? 'on' : 'off'}" transform="translate(${24 * i})" d="${STAR}"/>`).join('')}</svg>`;
const pct = share => t('percent', { n: Math.round(share * 100) });
/** Mini plano de un local, trazado desde su máscara: piso claro, columnas y máquinas fijas oscuras. */
function plan(lot) {
  const cells = (list = []) => list.flatMap(([x0, y0, x1, y1]) => Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, (_, i) => [x0 + (i % (x1 - x0 + 1)), y0 + Math.floor(i / (x1 - x0 + 1))]));
  const gone = new Set([...cells(lot.holes), ...cells(lot.pillars)].map(String)), sq = ([x, y]) => `M${x} ${y}h1v1h-1z`;
  const floor = Array.from({ length: lot.w * lot.h }, (_, i) => [i % lot.w, Math.floor(i / lot.w)]).filter(c => !gone.has(String(c)));
  return `<svg class="plan" viewBox="-0.5 -0.5 ${lot.w + 1} ${lot.h + 1}" aria-hidden="true"><path class="floor" d="${floor.map(sq).join('')}"/>
    <path class="mark" d="${[...cells(lot.pillars), ...(lot.fixed ?? [])].map(sq).join('')}"/></svg>`;
}

export function createHud(root, actions, thumbs) {
  root.innerHTML = `
  <div id="hud" hidden>
    <header id="top" class="panel">
      <div id="stats"></div>
      <div id="controls"></div>
    </header>
    <section id="orders" aria-labelledby="ordersTitle">
      <h2 id="ordersTitle" class="sr"></h2>
      <div id="tickets"></div>
      <div id="orderAdd" class="panel"></div>
    </section>
    <div id="center"><div id="centerTop"><div id="status" class="chip" hidden></div><button id="undo" class="btn" data-act="undo" hidden></button></div><div id="toast" role="status" aria-live="polite"></div></div>
    <aside id="side">
      <section id="inspector" class="panel" hidden>
        <div class="panelHead"><h2 id="insTitle"></h2><button class="btn icon" data-act="closeInspector" id="insClose">${ICON.close}</button></div>
        <div id="insBody"></div>
        <div id="insActions"></div>
      </section>
    </aside>
    <nav id="tools" class="panel" role="toolbar"></nav>
  </div>
  <div id="floaters" aria-hidden="true"></div>
  <div id="live" class="sr" aria-live="polite"></div>
  <dialog id="dlgStart" class="sheet"></dialog>
  <dialog id="dlgHelp" class="sheet"></dialog>
  <dialog id="dlgConfirm" class="sheet"></dialog>
  <dialog id="dlgOver" class="sheet"></dialog>`;

  const $ = id => root.querySelector('#' + id);
  const cache = new Map();
  /** Escribe el HTML sólo si cambió, para no reemplazar un botón justo cuando lo están tocando. */
  const set = (id, html) => { if (cache.get(id) !== html) { cache.set(id, html); $(id).innerHTML = html; } };
  const img = (key, cls = 'thumb') => {
    if (!thumbs[key]) throw new Error(`Falta la miniatura «${key}»`);
    return `<img class="${cls}" src="${thumbs[key]}" alt="">`;
  };

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) actions[b.dataset.act](b.dataset.arg);
  });
  root.addEventListener('change', e => { if (e.target.id === 'autoOrders') actions.setAuto(e.target.checked); });
  for (const id of ['dlgStart', 'dlgOver']) $(id).addEventListener('cancel', e => e.preventDefault()); // no se cierran con Esc

  let more = false; // en compacta, lo secundario de la barra de arriba se despliega con un botón
  actions.toggleMore = () => { more = !more; };
  const stat = (label, value, cls = 'extra') => `<div class="stat ${cls}"><span>${label}</span><b>${value}</b></div>`;

  function renderTop(s, ui) {
    const career = s.mode === 'career', P = PUZZLES[s.lot], ex = expandInfo(s);
    let h = stat(t(career ? 'statMoney' : P ? 'statBudget' : 'statEarned'), money(s.money), 'main');
    if (P) h += stat(t('statTimeLeft'), clock(P.limit - s.time), 'main') + stat(t('statOrdersLeft'), P.orders.length - s.stats.onTime, 'main')
      + stat(t('statBelts'), t('ofMax', { n: puzzleStars(s).belts, max: P.belts }), 'main'); // la tercera estrella, a la vista
    if (career) {
      const hearts = Array.from({ length: HEARTS }, (_, i) => `<i class="${i < s.hearts ? 'on' : ''}">${ICON.heart}</i>`).join('');
      const prev = s.level > 1 ? deliveriesFor(s.level - 1) : 0, goal = deliveriesFor(s.level) - prev, done = delivered(s) - prev;
      h += `<div class="stat main"><span>${t('statHearts')}</span><b class="hearts" role="img" aria-label="${t('heartsOf', { n: s.hearts, max: HEARTS })}">${hearts}</b></div>`;
      h += `<div class="stat main" title="${t('levelProgress', { done, goal })}"><span>${t('statLevel')}</span><b>${s.level}</b>
        <progress max="${goal}" value="${done}" aria-label="${t('levelProgress', { done, goal })}"></progress></div>`;
    }
    $('top').classList.toggle('more', more);
    h += stat(t('statOnTime'), s.stats.onTime) + stat(t('statLate'), s.stats.late);
    if (career) h += stat(t('statLost'), lost(s));
    h += stat(t('statWaste'), s.stats.waste) + stat(t('statClock'), clock(s.time));
    set('stats', h);
    const btn = (act, icon, label, cls = '', text = '') =>
      `<button class="btn ${cls}" data-act="${act}" title="${label}" aria-label="${label}">${icon}<span class="lbl">${text || label}</span></button>`;
    set('controls',
      btn('togglePause', ui.playing ? ICON.pause : ICON.play, t(ui.playing ? 'actPause' : 'actResume'), ui.playing ? '' : 'primary')
      + `<button class="btn" data-act="cycleSpeed" title="${t('actSpeed')}" aria-label="${t('actSpeed')} ${ui.speed}×">${ICON.speed}<span>${ui.speed}×</span></button>`
      + btn('rotateView', ICON.view, t('actView'))
      + `<button class="btn moreBtn" data-act="toggleMore" aria-expanded="${more}" title="${t('actMore')}" aria-label="${t('actMore')}">${ICON.more}</button>`
      + `<button class="btn extra ${ui.jams ? 'on' : ''}" data-act="toggleJams" aria-pressed="${ui.jams}" title="${t('jamsLabel')}" aria-label="${t('jamsLabel')}">${ICON.jams}<span class="lbl">${t('actJams')}</span></button>`
      + btn('help', ICON.help, t('actHelp'), 'extra') + btn('askRestart', ICON.restart, t('actRestart'), 'extra') + btn('exit', ICON.exit, t('actExit'), 'extra')
      // Ampliar, en teléfono parado: la grilla de 7 por 2 no tiene lugar para la herramienta 15 (la hoja de estilo elige cuál se ve)
      + `<button class="btn extra expandTop ${ex.short ? 'short' : ''}" data-act="expand" ${ex.grow ? '' : 'disabled'} title="${ex.label} · ${ex.price}" aria-label="${ex.label} · ${ex.price}">${ICON.expand}<span class="lbl">${t('actExpand')}</span></button>`);
    $('status').hidden = ui.playing;
    set('status', t('statusPaused'));
    $('undo').hidden = !canUndo(s); // contextual: sólo mientras lo último construido todavía se puede deshacer
    set('undo', `${ICON.undo}<span>${t('actUndo')}</span>`);
  }

  /** Ampliar el terreno: si se puede, a qué medida, cuánto cuesta y si alcanza la plata. */
  function expandInfo(s) {
    const grow = canExpand(s), label = grow ? t('expandLabel', { w: s.W + lotGrow(s)[0], h: s.H + lotGrow(s)[1] }) : t('expandMax');
    return { grow, label, price: grow ? (expandCost(s) ? money(expandCost(s)) : t('free')) : '—', short: grow && s.mode === 'career' && s.money < expandCost(s) };
  }

  function renderOrders(s) {
    set('ordersTitle', t('ordersTitle'));
    const list = [...s.orders].sort((a, b) => a.due - b.due);
    set('tickets', list.length ? list.map(o => {
      const r = RECIPES[o.recipeKey], left = o.due - s.time, total = o.due - o.createdAt;
      const risk = orderRisk(o, s.time);
      const pct = Math.max(0, Math.min(100, left / total * 100));
      return `<article class="ticket panel ${risk}">
        ${img('recipe_' + o.recipeKey)}
        <div><h3>#${o.id} ${t('recipe_' + o.recipeKey)}${o.group != null ? ` <span class="groupTag">${t('orderGroup')}</span>` : ''}</h3>
        <p>${t(r.cheese ? 'orderNeedsCheese' : 'orderNeeds', r)}</p>
        <p>${t({ pending: 'orderPending', assembling: 'orderAssembling', transit: 'orderTransit' }[o.status])}</p></div>
        <div class="ticketFoot"><span class="timer">${left < 0 ? '+' : ''}${clock(Math.abs(left))}</span><span>${money(r.price)}</span></div>
        <div class="meter"><i style="width:${pct.toFixed(0)}%"></i></div>
      </article>`;
    }).join('') : `<p class="empty panel">${t('ordersEmpty')}</p>`);
    const add = availableRecipes(s).map(k =>
      `<button class="btn thumbBtn" data-act="addOrder" data-arg="${k}" title="${t('orderAdd', { recipe: t('recipe_' + k) })}" aria-label="${t('orderAdd', { recipe: t('recipe_' + k) })}">${img('recipe_' + k)}</button>`).join('');
    $('orderAdd').hidden = s.mode === 'puzzle'; // en un desafío los pedidos son los del guion
    set('orderAdd', `<span class="lead">${t('orderAddTitle')}</span>${add}`
      + (s.mode === 'sandbox' ? `<label class="check"><input type="checkbox" id="autoOrders" ${s.autoOrders ? 'checked' : ''}>${t('autoOrders')}</label>` : ''));
  }

  function renderTools(s, ui) {
    // full: llegó a su tope de este nivel. Sigue siendo elegible (para girar lo puesto y para que el intento explique).
    const tool = (id, pic, name, price, title, off = false, full = null) =>
      `<button class="tool ${ui.tool === id ? 'active' : ''} ${off && !full ? 'short' : ''} ${full ? 'full' : ''}" data-act="setTool" data-arg="${id}" aria-pressed="${ui.tool === id}" title="${esc(full ? `${title} ${full}` : title)}"${full ? ` aria-label="${esc(`${name}. ${full}`)}"` : ''}>
        ${pic}<span class="name">${name}</span>${price === null ? '' : `<span class="price">${full ? t('toolFull') : price ? money(price) : t('free')}</span>`}</button>`;
    // El tope de una pieza explicado (null si todavía entra otra): cuántas y en qué nivel se habilita la siguiente.
    const limitText = (k, last, next) => {
      if (countOf(s, k) < limitOf(s, k)) return null;
      const n = limitOf(s, k), level = nextLimit(s, k);
      return level == null ? t(last, { n }) : t(next, { n, level });
    };
    // El renglón de leyenda (sólo en compacta, donde los botones no llevan nombre): la herramienta elegida, su precio
    // (o su tope) y hacia dónde va a apuntar en pantalla.
    const sdir = (ui.dir + ui.rot) % 4, k = ui.tool, built = BUILD_ORDER.includes(k);
    const name = built ? t('kind_' + k) : t(k === 'erase' ? 'toolErase' : 'toolInspect');
    const capFull = built && limitText(k, 'toolCapFullLast', 'toolCapFull');
    const cap = (built && !KINDS[k].noTurn && k !== 'dispatch' ? t('toolCapDir', { name, dir: t('dir' + sdir) }) : t('toolCap', { name }))
      + (built ? ` · ${capFull || (cost(s, k) ? money(cost(s, k)) : t('free'))}` : '');
    let h = `<span class="toolCap">${cap}</span>` + tool('inspect', ICON.inspect, t('toolInspect'), null, t('toolInspect'));
    for (const k of BUILD_ORDER) h += tool(k, img(k), t('kind_' + k), cost(s, k), `${t('kindLong_' + k)}. ${t('kindHint_' + k, { max: CAP.stock })}`,
      s.mode !== 'sandbox' && s.money < cost(s, k), limitText(k, 'toastLimitLast', 'toastLimit'));
    h += tool('erase', ICON.erase, t('toolErase'), null, t('toolErase'));
    h += `<span class="sep"></span>
      <button class="tool" data-act="rotate" title="${t('rotateLabel', { dir: t('dir' + sdir) })}" aria-label="${t('rotateLabel', { dir: t('dir' + sdir) })}">
        <span class="dir" style="--turn:${sdir * 90}deg">${ICON.arrow}</span><span class="name">${t('actRotate')}</span><span class="price">R</span></button>`;
    const ex = expandInfo(s);
    h += `<button class="tool expandTool ${ex.short ? 'short' : ''}" data-act="expand" ${ex.grow ? '' : 'disabled'} title="${ex.label}" aria-label="${ex.label}">
        ${ICON.expand}<span class="name">${t('actExpand')}</span><span class="price">${ex.price}</span></button>`;
    set('tools', h);
    $('tools').setAttribute('aria-label', t('toolbarLabel'));
  }

  function inspectorText(s, x, y) {
    const c = at(s, x, y);
    if (!c) return [null, [t('insEmpty')]];
    const src = KINDS[c.kind], lines = [];
    if (src.carries) { // cinta, divisor y puente: lo que llevan y si quedó sin salida
      const what = item => (item ? t('item_' + item.type) : t('laneEmpty'));
      if (c.kind === 'bridge') lines.push(t('insBridge', { h: what(c.item), v: what(c.item2) }));
      else lines.push(c.item ? t('insBeltItem', { item: t('item_' + c.item.type) }) : t('insBeltEmpty'));
      if (c.kind === 'filter') lines.push(t('insFilter', { item: t('item_' + c.pick) }));
      for (const slot of ['item', 'item2']) if (isStuck(s, x, y, slot)) lines.push(`<strong class="bad">${t('insStuck', { item: t('item_' + c[slot].type) })}</strong>`);
    } else if (c.kind === 'grill') {
      lines.push(t('insGrill', { raw: c.rawCount, rawMax: CAP.grillRaw, cooked: c.cooked, cookedMax: CAP.grillCooked }));
      const busy = c.cooking.filter(left => left > 0), next = Math.min(...busy).toFixed(1);
      lines.push(!c.cooking.length ? t('insGrillIdle') : !busy.length ? t('insGrillFull')
        : burners(c) > 1 ? t('insGrillBusyMany', { n: busy.length, max: burners(c), s: next }) : t('insGrillBusy', { s: next }));
    } else if (c.kind === 'stock') lines.push(t('insStock', { n: c.store, max: stockCap(c), need: sourceNeed(s, x, y) }));
    else if (c.kind === 'assembly') {
      lines.push(t('insAssembly', { ...c.inv, max: CAP.inv }));
      lines.push(c.job ? t('insAssemblyJob', { id: c.job.orderId }) : c.output ? t('insAssemblyOut') : t('insAssemblyIdle'));
    } else if (src.emits) lines.push(src.onDemand ? t('insSourceDemand', { n: sourceNeed(s, x, y) }) : t('insSourceContinuous'));
    else lines.push(t('insDispatch'));
    if (c.fixed) lines.push(t('insFixed'));
    // la mejora: hecha, se dice; si no, la consecuencia va escrita antes del botón Mejorar (insActions)
    const up = { up: true }, base = { up: false }; // cada frase usa los huecos que le tocan
    if (UPGRADES[c.kind]) lines.push(t((c.up ? 'upDone_' : 'upHint_') + c.kind, {
      burners: burners(up), time: assembleTime(up).toLocaleString(getLang()), baseTime: assembleTime(base), stock: stockCap(up), baseStock: stockCap(base) }));
    return [c, lines];
  }

  function renderSide(s, ui) {
    const sel = ui.selected;
    $('inspector').hidden = !sel;
    if (sel) {
      const [c, lines] = inspectorText(s, sel.x, sel.y);
      set('insTitle', c ? `${img(c.kind, 'thumb small')}${t('kindLong_' + c.kind)}` : t('insTitle', sel));
      const sh = c && !KINDS[c.kind].carries && diagShares(c); // un renglón de datos, no prosa: cuánto pasó en cada estado
      set('insBody', lines.map(l => `<p>${l}</p>`).join('') + (sh ? `<div class="shares"><span class="cap">${t('sharesTitle')}</span>${
        ['work', 'blocked', 'wait', 'idle'].map(k => stat(t('share_' + k), pct(sh[k]), '')).join('')}</div>` : ''));
      const back = c ? refund(s, c) : 0, price = c && UPGRADES[c.kind] && !c.up ? upgradeCost(s, c.kind) : null;
      const short = price !== null && s.mode !== 'sandbox' && s.money < price; // se ve corto como las herramientas y dice cuánto falta
      const upBtn = price === null ? '' : `<button class="btn ${short ? 'short' : ''}" data-act="upgradeSelected">${ICON.upgrade}<span>${t('actUpgrade')}</span>
        <span class="price">${short ? t('upShort', { price, n: price - s.money }) : price ? money(price) : t('free')}</span></button>`;
      const pickBtn = c?.kind === 'filter' ? `<button class="btn" data-act="cyclePick">${ICON.rotate}<span>${t('actPick')}</span></button>` : '';
      set('insActions', c?.fixed ? upBtn : c ? `${upBtn}${pickBtn}${KINDS[c.kind].noTurn ? '' : `<button class="btn" data-act="rotateSelected">${ICON.rotate}<span>${t('actRotate')}</span></button>`}
        <button class="btn" data-act="eraseSelected">${ICON.erase}<span>${back ? t('actEraseRefund', { n: back }) : t('actErase')}</span></button>` : '');
      $('insClose').setAttribute('aria-label', t('actClose'));
    }
  }

  function update(s, ui) { renderTop(s, ui); renderOrders(s); renderTools(s, ui); renderSide(s, ui); }

  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /** Texto que sube desde un punto de la pantalla y se va: la paga de una entrega. */
  function floater(px, text, cls = '') {
    const el = document.createElement('span');
    el.className = 'floater ' + cls;
    el.textContent = text;
    el.style.left = px.x + 'px';
    el.style.top = px.y + 'px';
    $('floaters').append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  const announce = text => { $('live').textContent = text; };
  const langPicker = () => `<label class="lang">${t('language')} <select data-lang>${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${k === getLang() ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  root.addEventListener('change', e => { if (e.target.matches('[data-lang]')) actions.setLang(e.target.value); });
  const open = id => { const d = $(id); if (!d.open) d.showModal(); };
  const close = id => { const d = $(id); if (d.open) d.close(); };

  /**
   * saves = { career, sandbox } con el estado guardado de cada modo (o null). lots = [{ key, open, best }] de los
   * locales de Carrera en orden, con su récord (o null); lot = el elegido para una partida nueva.
   * puzzles = [{ key, open, stars }] de los desafíos en orden, con sus mejores estrellas.
   */
  function showStart(saves, lots, lot, puzzles, seed, dare = null) {
    const pick = lots.find(l => l.key === lot), lotName = k => t('lot_' + k), L = k => lotOf(k, seed);
    const gen = pick.open && L(lot).gen; // La sorpresa abierta: el número de sala y la marca a batir van en el mismo párrafo (el arnés cuenta bloques de prosa)
    const lotInfo = (pick.open ? (pick.best ? t('bestRecord', pick.best) : t('lotNoBest'))
      : t('lotLocked', { level: L(lot).unlock[1], lot: lotName(L(lot).unlock[0]) })) + (gen ? ' ' + t('lotSeedInfo', { seed }) : '')
      + (gen && dare ? ' ' + t('lotDare', { level: dare }) : '');
    const picker = `<div class="lots" role="group" aria-label="${t('lotsLabel')}">${lots.map(l => `<button class="btn lotBtn ${l.key === lot ? 'on' : ''}" data-act="pickLot" data-arg="${l.key}" aria-pressed="${l.key === lot}"
      aria-label="${l.open ? lotName(l.key) : t('lotClosedLabel', { lot: lotName(l.key) })}">${plan(L(l.key))}<span>${lotName(l.key)}</span>${l.open ? '' : ICON.lock}</button>`).join('')}</div>
      <p class="saved">${lotInfo}</p>${gen ? `<div class="row"><button class="btn" data-act="rerollLot">${t('rerollLot')}</button>
      <button class="btn" data-act="copyLotLink">${t('copyLotLink')}</button></div>` : ''}`;
    const mode = (m, name, hint, saved, extra = '') => `<section class="mode">
      <h2>${img(m === 'career' ? 'recipe_double' : 'assembly', 'thumb')}${name}</h2><p>${hint}</p>
      ${saves[m] ? `<p class="saved">${saved}</p>` : ''}${extra}
      <div class="row">${saves[m] ? `<button class="btn primary" data-act="start" data-arg="${m}">${t('actContinue')}</button>` : ''}
      <button class="btn ${saves[m] ? '' : 'primary'}" data-act="startNew" data-arg="${m}" ${m === 'career' && !pick.open ? 'disabled' : ''}>${t('actNewGame')}</button></div></section>`;
    const sc = saves.career;
    $('dlgStart').innerHTML = `<h1>Burger Belt</h1><p class="tagline">${t('tagline')}</p>
      <div class="modes">${mode('career', t('modeCareer'), t('modeCareerHint'), sc && t('savedCareer', { lot: lotName(sc.lot), level: sc.level, time: clock(sc.time) }), picker)}
      ${mode('sandbox', t('modeSandbox'), t('modeSandboxHint'), saves.sandbox && t('savedSandbox', { time: clock(saves.sandbox.time) }))}
      <section class="mode"><h2>${img('splitter', 'thumb')}${t('modePuzzle')}</h2><p>${t('modePuzzleHint')}</p>
      <div class="lots" role="group" aria-label="${t('puzzlesLabel')}">${puzzles.map(p => { const name = t('puzzle_' + p.key);
        return `<button class="btn lotBtn" data-act="startPuzzle" data-arg="${p.key}" ${p.open ? '' : 'disabled'}
        aria-label="${p.open ? t('puzzleLabel', { name, n: p.stars }) : t('puzzleClosedLabel', { name })}"><span>${name}</span>${p.open ? stars(p.stars) : ICON.lock}</button>`; }).join('')}</div></section></div>
      <div class="row between">${langPicker()}<button class="btn" data-act="help">${ICON.help}<span>${t('actHelp')}</span></button></div>`;
    open('dlgStart');
  }

  function showHelp() {
    $('dlgHelp').innerHTML = `<h1>${t('actHelp')}</h1>
      ${['helpGoal', 'helpBuild', 'helpCareer', 'helpKeys'].map(k => `<p>${t(k)}</p>`).join('')}
      <div class="row between">${langPicker()}<button class="btn primary" data-act="closeHelp">${t('actClose')}</button></div>`;
    open('dlgHelp');
  }

  /** Confirmación que nombra la consecuencia antes del botón. */
  function confirm(title, body, okLabel, onOk) {
    $('dlgConfirm').innerHTML = `<h1>${title}</h1><p>${body}</p>
      <div class="row end"><button class="btn" data-act="closeConfirm">${t('actCancel')}</button><button class="btn danger" data-act="confirmOk">${okLabel}</button></div>`;
    actions.confirmOk = () => { close('dlgConfirm'); onOk(); };
    open('dlgConfirm');
  }

  /** dare: el nivel a batir que trajo el enlace de esta sala, o null. En La sorpresa se ofrece copiar el enlace con la marca. */
  function showOver(s, isBest, dare = null) {
    const b = bottleneck(s); // las oraciones del diagnóstico van en un solo párrafo: la hoja suma un bloque de prosa, no dos
    const why = (b ? t('overBottleneck', { machine: t('kindLong_' + b.kind), pct: pct(b.shares.work) }) : t('overNoBottleneck'))
      + ' ' + t('overLost', { expired: s.stats.expired, turned: s.stats.turnedAway });
    // la marca del enlace se pasa con un nivel mayor; va en el párrafo de la cuenta final, sin sumar bloques de prosa
    const vs = dare ? ' ' + (s.level > dare ? t('dareWon', { level: s.level, target: dare }) : t('dareLost', { target: dare })) : '';
    $('dlgOver').innerHTML = `<h1>${t('overTitle')}</h1>
      <p>${t('overBody', { level: s.level, delivered: delivered(s), earned: s.stats.earned })}${vs}</p><p id="overWhy">${why}</p>${isBest ? `<p class="saved">${t('overBest')}</p>` : ''}
      <div class="row end">${s.lot === 'random' ? `<button class="btn" data-act="copyDareLink">${t('copyDareLink')}</button>` : ''}<button class="btn" data-act="exit">${t('actExit')}</button><button class="btn primary" data-act="startNew" data-arg="career">${t('actPlayAgain')}</button></div>`;
    open('dlgOver');
  }

  /** Cierre de un desafío: las estrellas (forma y texto), cada condición con su marca, qué faltó y cómo seguir. next: el siguiente, si se abrió. */
  function showPuzzleEnd(s, next) {
    const P = PUZZLES[s.lot], r = puzzleStars(s), row = (ok, text) => `<li>${stars(ok ? 1 : 0, 1)}<span>${text}</span></li>`;
    const tip = !r.won ? t('puzzleNextWin') : !r.spendOk ? t('puzzleNextSpend', { max: P.spend }) : !r.beltsOk ? t('puzzleNextBelts', { max: P.belts }) : '';
    $('dlgOver').innerHTML = `<h1>${t(r.won ? 'puzzleWonTitle' : 'puzzleLostTitle')}</h1>
      <p class="starLine">${stars(r.stars)}<span>${t('starsOf', { n: r.stars })}</span></p>${r.won ? '' : `<p>${t('puzzleWhy_' + s.result)}</p>`}
      <ul class="starList">${row(r.won, t('starWin', { n: P.orders.length }))}${row(r.won && r.spendOk, t('starSpend', { max: P.spend, n: r.spent }))}${
        row(r.won && r.beltsOk, t('starBelts', { max: P.belts, n: r.belts }))}</ul>${tip ? `<p>${tip}</p>` : ''}
      <div class="row end"><button class="btn" data-act="exit">${t('actExit')}</button>
      <button class="btn ${next ? '' : 'primary'}" data-act="startPuzzle" data-arg="${s.lot}">${t('actRetry')}</button>${
        next ? `<button class="btn primary" data-act="startPuzzle" data-arg="${next}">${t('actNext')}</button>` : ''}</div>`;
    open('dlgOver');
  }

  /**
   * Cuánto tapa el HUD de cada borde, para encuadrar la cocina en lo que queda libre.
   * Con withInspector cuenta también el inspector abierto: sirve para no tapar la celda que se inspecciona.
   */
  function insets(withInspector = false) {
    const W = innerWidth, H = innerHeight, box = id => $(id).getBoundingClientRect();
    const top = box('top'), orders = box('orders'), tools = box('tools'), ins = box('inspector');
    const wide = r => r.width > W * 0.6; // una zona ancha tapa una franja; una angosta, un costado
    const out = { top: (wide(orders) ? orders.bottom : top.bottom) + 8, bottom: 8, left: 8, right: 8 };
    if (wide(tools)) out.bottom = H - tools.top + 8; else out.left = tools.right + 8;
    if (!wide(orders)) out.right = W - orders.left + 8;
    if (withInspector && ins.width) { if (wide(ins)) out.bottom = Math.max(out.bottom, H - ins.top + 8); else out.right = Math.max(out.right, W - ins.left + 8); }
    return out;
  }

  Object.assign(actions, { closeHelp: () => close('dlgHelp'), closeConfirm: () => close('dlgConfirm') });
  const refresh = () => cache.clear();
  const setVisible = on => { $('hud').hidden = !on; };
  return { update, toast, floater, announce, showStart, showHelp, showOver, showPuzzleEnd, confirm, close, insets, refresh, setVisible, anyDialogOpen: () => !!root.querySelector('dialog[open]') };
}
