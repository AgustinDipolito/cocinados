// Todos los modelos se arman a mano con primitivas: no hay archivos de arte.
// Cada máquina mira hacia +X (su salida); quien la coloca la gira según la dirección de la celda.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RECIPES, TIMES, PICKS } from './data.js';
import { stockCap, assembleTime } from './sim.js';
import { curb } from './crowd.js';

// ---------- paleta 3D ----------
export const C = {
  bg: 0x1d2a3a, slab: 0x2b3a4d, tileA: '#ead9bd', tileB: '#c9a47c', grout: '#a98863',
  wall: 0xf0dfc4, wainscot: 0x2f7f8c, window: 0xbfe9ff,
  steel: 0xcfd6dc, darkSteel: 0x3c444d, rubber: '#3a4048', chevron: '#59616c',
  meatBox: 0xe5533d, bunBox: 0xd99a55, cheeseBox: 0xf6c22e, grill: 0x4a5560, stock: 0x3f9fc4,
  assembly: 0x8a6fe0, dispatch: 0x3fae7d, cream: 0xfff3dd, wood: 0xb9824f, arrow: 0xffd23f,
  bun: 0xe2a455, bunIn: 0xf5dfae, raw: 0xe0707a, patty: 0x6e3d24, cheese: 0xffc526, sesame: 0xfff3cf,
  ember: 0xff5a1a, lamp: 0xffa040, bag: 0xc79a62, gold: 0xf2c14e, knob: 0xd9413a,
  ok: 0x52d68a, bad: 0xff5d4d, select: 0xffd23f, hover: 0xffffff, frameEdge: 0x2a1f17, robot: 0xff8a2b,
  sidewalk: 0x8f98a3, curb: 0x6b7480,
};

const std = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const toy = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3 });

export const M = {
  steel: std(C.steel, 0.3, 0.85), darkSteel: std(C.darkSteel, 0.5, 0.6), black: std(0x16181b, 0.7, 0.2),
  cream: toy(C.cream), wood: std(C.wood, 0.75), arrow: std(C.arrow, 0.5, 0, { emissive: C.arrow, emissiveIntensity: 0.35 }),
  meatBox: toy(C.meatBox), bunBox: toy(C.bunBox), cheeseBox: toy(C.cheeseBox), grill: toy(C.grill),
  stock: toy(C.stock), assembly: toy(C.assembly), dispatch: toy(C.dispatch),
  bun: std(C.bun, 0.55), bunIn: std(C.bunIn, 0.8), raw: std(C.raw, 0.5), patty: std(C.patty, 0.85),
  cheese: std(C.cheese, 0.4), sesame: std(C.sesame, 0.6), bag: std(C.bag, 0.9), gold: std(C.gold, 0.25, 0.9),
  knob: toy(C.knob), robot: toy(C.robot), lamp: std(0x331a08, 0.5, 0, { emissive: C.lamp, emissiveIntensity: 1.6 }),
  pennant: std(C.gold, 0.35, 0.6, { side: THREE.DoubleSide }),
  barBg: new THREE.MeshBasicMaterial({ color: 0x1a2330 }), barFg: new THREE.MeshBasicMaterial({ color: C.arrow }),
};

// ---------- geometría compartida ----------
const geos = new Map();
const geo = (key, build) => geos.get(key) ?? (geos.set(key, build()), geos.get(key));
const mesh = (g, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
};
/** Caja de bordes redondeados apoyada con su centro en (x, y, z). */
export const box = (w, h, d, m, x = 0, y = 0, z = 0, r = 0.04) =>
  mesh(geo(`b${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2))), m, x, y, z);
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 24) =>
  mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y, z);
const group = (...kids) => { const g = new THREE.Group(); kids.length && g.add(...kids); return g; };
/** Apoya una pieza sobre la altura y (las piezas nacen apoyadas en y = 0). */
const putAt = (o, x, y, z) => { o.position.x = x; o.position.y += y; o.position.z = z; return o; };

// ---------- texturas dibujadas ----------
function canvasTexture(size, draw, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** La goma de la cinta, con flechas que apuntan a +X. Una sola textura: al correrla se mueven todas. */
export const beltTexture = canvasTexture(128, (g, s) => {
  g.fillStyle = C.rubber; g.fillRect(0, 0, s, s);
  g.strokeStyle = C.chevron; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const x of [8, 72]) { g.beginPath(); g.moveTo(x, 28); g.lineTo(x + 36, 64); g.lineTo(x, 100); g.stroke(); }
});
M.belt = new THREE.MeshStandardMaterial({ map: beltTexture, roughness: 0.9 });
M.rubber = std(C.rubber, 0.9); // goma lisa y quieta: el divisor, y el carril del puente por el que no entra nada

const floorTexture = canvasTexture(256, (g, s) => {
  const h = s / 2;
  for (let i = 0; i < 4; i++) {
    g.fillStyle = (i % 2) ^ (i >> 1) ? C.tileB : C.tileA;
    g.fillRect((i % 2) * h, (i >> 1) * h, h, h);
  }
  g.strokeStyle = C.grout; g.lineWidth = 3;
  for (const p of [0, h, s]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
});

const awningTexture = canvasTexture(64, (g, s) => {
  g.fillStyle = '#fff6e6'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#3fae7d'; g.fillRect(0, 0, s / 2, s);
});
awningTexture.repeat.set(3, 1);
M.awning = new THREE.MeshStandardMaterial({ map: awningTexture, roughness: 0.8, side: THREE.DoubleSide });

function spriteTexture(draw) { return canvasTexture(128, draw, false); }
export const alertTexture = spriteTexture((g, s) => {
  g.fillStyle = '#e23b2e'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.44, 0, 7); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = `700 ${s * 0.66}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', s / 2, s * 0.54);
});
/** Marca de la capa de atascos: rombo ámbar con dos barras de «detenido». Forma distinta del aviso redondo. */
export const jamTexture = spriteTexture((g, s) => {
  const r = s * 0.44, c = s / 2;
  g.beginPath(); g.moveTo(c, c - r); g.lineTo(c + r, c); g.lineTo(c, c + r); g.lineTo(c - r, c); g.closePath();
  g.fillStyle = '#e8941a'; g.fill();
  g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = '#2a1f17'; g.stroke();
  g.fillStyle = '#2a1f17';
  for (const x of [c - s * 0.11, c + s * 0.04]) g.fillRect(x, c - s * 0.15, s * 0.07, s * 0.3);
});

/** Marca de «se puede mejorar»: disco dorado con flecha hacia arriba. Redonda y dorada, distinta del aviso rojo y del rombo. */
export const hintTexture = spriteTexture((g, s) => {
  const c = s / 2;
  g.beginPath(); g.arc(c, c, s * 0.42, 0, 7);
  g.fillStyle = '#f2c14e'; g.fill();
  g.lineWidth = 8; g.strokeStyle = '#2a1f17'; g.stroke();
  g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#fff8e8';
  g.beginPath(); g.moveTo(c, c + s * 0.22); g.lineTo(c, c - s * 0.2);
  g.moveTo(c - s * 0.16, c - s * 0.04); g.lineTo(c, c - s * 0.2); g.lineTo(c + s * 0.16, c - s * 0.04); g.stroke();
});

/** Marca sobre un cliente: cada estado con su forma (círculo, triángulo, cuadrado, estallido) además del color. */
function markTexture(fill, shape, glyph) {
  return spriteTexture((g, s) => {
    const c = s / 2;
    g.beginPath();
    shape(g, s, c);
    g.closePath();
    g.fillStyle = fill; g.fill();
    g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = '#2a1f17'; g.stroke();
    g.lineWidth = 11; g.lineCap = 'round'; g.strokeStyle = '#fff'; g.fillStyle = '#fff';
    g.beginPath(); glyph(g, s, c); g.stroke();
  });
}
const MARK_TEXTURES = {
  '': markTexture('#3fae7d', (g, s, c) => g.arc(c, c, s * 0.4, 0, 7), (g, s, c) => { // a tiempo: círculo con tilde
    g.moveTo(c - s * 0.17, c + s * 0.01); g.lineTo(c - s * 0.04, c + s * 0.14); g.lineTo(c + s * 0.18, c - s * 0.12);
  }),
  soon: markTexture('#e8941a', (g, s, c) => { g.moveTo(c, s * 0.08); g.lineTo(s * 0.93, s * 0.86); g.lineTo(s * 0.07, s * 0.86); }, (g, s, c) => { // por vencer: triángulo con «!»
    g.moveTo(c, s * 0.38); g.lineTo(c, s * 0.58); g.moveTo(c, s * 0.73); g.lineTo(c, s * 0.735);
  }),
  late: markTexture('#e23b2e', (g, s) => g.roundRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8, s * 0.12), (g, s, c) => { // vencido: cuadrado con reloj
    g.moveTo(c + s * 0.22, c); g.arc(c, c, s * 0.22, 0, 7); g.moveTo(c, c - s * 0.13); g.lineTo(c, c); g.lineTo(c + s * 0.1, c + s * 0.06);
  }),
  angry: markTexture('#9e1c14', (g, s, c) => { // enojado: estallido de puntas con un garabato
    for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10, r = s * (i % 2 ? 0.3 : 0.46); g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
  }, (g, s, c) => { g.moveTo(c - s * 0.16, c + s * 0.06); g.lineTo(c - s * 0.06, c - s * 0.08); g.lineTo(c + s * 0.04, c + s * 0.06); g.lineTo(c + s * 0.15, c - s * 0.08); }),
};
const MARKS = Object.fromEntries(Object.entries(MARK_TEXTURES).map(([k, map]) => [k, new THREE.SpriteMaterial({ map, depthTest: false })]));

// ---------- comida ----------
/** Altura del carril alto del puente (donde apoyan sus productos). */
export const BRIDGE_TOP = 0.64;
const PATTY_H = 0.07, CHEESE_H = 0.025, BUN_H = 0.05;
const patty = (m = M.patty) => cyl(0.15, 0.15, PATTY_H, m, 0, PATTY_H / 2, 0);
const cheeseSlice = () => { const o = box(0.3, CHEESE_H, 0.3, M.cheese, 0, CHEESE_H / 2, 0, 0.01); o.rotation.y = Math.PI / 4; return o; };
const bunBottom = () => cyl(0.16, 0.14, BUN_H, M.bun, 0, BUN_H / 2, 0);
function bunTop() {
  const dome = mesh(geo('dome', () => new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), M.bun);
  dome.scale.y = 0.62;
  const g = group(dome, cyl(0.165, 0.165, 0.012, M.bunIn, 0, 0.006, 0));
  for (let i = 0; i < 7; i++) { // semillas de sésamo
    const a = i * 2.4, r = i ? 0.085 : 0, y = Math.sqrt(1 - (r / 0.17) ** 2) * 0.17 * 0.62;
    const seed = mesh(geo('seed', () => new THREE.SphereGeometry(0.014, 8, 6)), M.sesame, Math.cos(a) * r, y, Math.sin(a) * r);
    seed.scale.set(1, 0.5, 1.6); seed.rotation.y = a;
    g.add(seed);
  }
  return g;
}

/** Apila piezas de abajo hacia arriba. Devuelve el grupo y deja las capas en userData.layers. */
function stack(parts) {
  const g = group();
  let y = 0;
  g.userData.layers = parts.map(([o, h]) => { o.position.y += y; y += h; g.add(o); return o; });
  g.userData.height = y;
  return g;
}

export function burger(recipeKey) {
  const r = RECIPES[recipeKey] ?? RECIPES.classic, parts = [[bunBottom(), BUN_H]];
  for (let i = 0; i < r.patty; i++) {
    parts.push([patty(), PATTY_H]);
    if (r.cheese) parts.push([cheeseSlice(), CHEESE_H]);
  }
  parts.push([bunTop(), 0.11]);
  return stack(parts);
}

const ITEM_SCALE = 1.3;
export function buildItem(item) {
  const g = {
    raw: () => patty(M.raw), patty: () => patty(), cheese: cheeseSlice,
    bun: () => stack([[bunBottom(), BUN_H], [bunTop(), 0.11]]),
    burger: () => burger(item.recipeKey),
  }[item.type]();
  const root = group(g);
  root.userData.type = item.type;
  root.scale.setScalar(ITEM_SCALE);
  return root;
}

// ---------- piezas comunes de las máquinas ----------
/** Flecha amarilla que marca por dónde sale el producto. */
function outArrow(y) {
  const shape = geo('arrow', () => {
    const s = new THREE.Shape();
    s.moveTo(0.1, 0); s.lineTo(-0.06, 0.11); s.lineTo(-0.06, -0.11); s.closePath();
    return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  });
  const o = mesh(shape, M.arrow, 0.36, y + 0.004, 0);
  o.castShadow = false;
  return o;
}
const chute = () => box(0.14, 0.2, 0.46, M.darkSteel, 0.47, 0.12, 0, 0.03);

function progressBar(y) {
  const plane = geo('bar', () => new THREE.PlaneGeometry(1, 1));
  const bg = new THREE.Mesh(plane, M.barBg), fg = new THREE.Mesh(plane, M.barFg);
  bg.scale.set(0.66, 0.13, 1);
  fg.position.z = 0.002;
  const g = group(bg, fg);
  g.position.set(0, y, 0);
  g.visible = false;
  g.userData.set = p => { // p entre 0 y 1; fuera de eso la barra se esconde
    g.visible = p >= 0;
    const w = 0.6 * Math.max(0.02, Math.min(1, p));
    fg.scale.set(w, 0.08, 1);
    fg.position.x = -0.3 + w / 2;
  };
  return g;
}

/** Banderín dorado en la esquina de atrás de una máquina mejorada: una forma propia además del color. No gira con la máquina. */
function pennant() {
  const flag = mesh(geo('pennant', () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0.5, -0.15); s.lineTo(0, -0.3); s.closePath();
    return new THREE.ShapeGeometry(s);
  }), M.pennant, 0.02, 1.6, 0);
  const g = group(cyl(0.025, 0.025, 1.62, M.steel, 0, 0.81, 0, 8), flag);
  g.position.set(-0.42, 0, -0.42);
  return g;
}

/** Muestra los primeros n de una lista de mallas. */
const showCount = (list, n) => list.forEach((o, i) => { o.visible = i < n; });

const SURFACE_BELT = 0.185; // altura de la goma de una cinta, donde llegan las rampas del puente
/** Tramo de goma con flechas a lo largo de +X. La u va de 0 a len: un tramo corto muestra un pedazo, sin estirar la flecha. */
function beltStrip(len, wid, x, y) {
  const s = mesh(geo(`strip${len},${wid}`, () => {
    const g = new THREE.PlaneGeometry(len, wid), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
    return g.rotateX(-Math.PI / 2);
  }), M.belt, x, y, 0);
  s.castShadow = false;
  return s;
}
/** Viga lateral del puente: trapecio que acompaña las rampas, con un arco abierto por donde pasa el carril bajo. */
const bridgeBeam = () => geo('bridgeBeam', () => {
  const top = BRIDGE_TOP + 0.06, s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(-0.3, 0); s.lineTo(-0.3, 0.3);
  s.absarc(0, 0.3, 0.3, Math.PI, 0, true); // arco de 0,6 de ancho que llega a 0,6, la cara de abajo del tramo plano
  s.lineTo(0.3, 0); s.lineTo(0.5, 0); s.lineTo(0.5, SURFACE_BELT + 0.06);
  s.lineTo(0.25, top); s.lineTo(-0.25, top); s.lineTo(-0.5, SURFACE_BELT + 0.06); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
});

// ---------- máquinas ----------
// Cada constructor devuelve { body, ui?, update?(cell, t, playing) }.
// body gira con la dirección; ui (barras) queda mirando a la cámara.

const builders = {
  belt() {
    const top = mesh(geo('beltTop', () => new THREE.PlaneGeometry(1, 0.7).rotateX(-Math.PI / 2)), M.belt, 0, 0.181, 0);
    top.castShadow = false;
    return {
      body: group(
        box(1, 0.18, 0.86, M.darkSteel, 0, 0.09, 0, 0.03), top,
        box(1, 0.05, 0.06, M.steel, 0, 0.2, 0.4, 0.02), box(1, 0.05, 0.06, M.steel, 0, 0.2, -0.4, 0.02),
      ),
    };
  },

  /** Divisor: base de cinta con goma lisa, entrada abierta por atrás y una flecha por cada salida. */
  splitter() {
    const top = mesh(geo('padTop', () => new THREE.PlaneGeometry(0.86, 0.86).rotateX(-Math.PI / 2)), M.rubber, 0, 0.181, 0);
    top.castShadow = false;
    const body = group(box(0.98, 0.18, 0.98, M.darkSteel, 0, 0.09, 0, 0.05), top, cyl(0.09, 0.09, 0.02, M.arrow, 0, 0.19, 0, 6));
    for (const turn of [0, 1, 3]) { const g = group(outArrow(0.185)); g.rotation.y = -turn * Math.PI / 2; body.add(g); }
    for (const z of [-0.43, 0.43]) body.add(box(0.06, 0.07, 0.12, M.steel, -0.46, 0.21, z, 0.02)); // las dos jambas de la entrada
    return { body };
  },

  /**
   * Filtro: la misma base del divisor (el producto pasa a la altura de cinta), flecha al frente y a cada costado, y un
   * cartel en la esquina de atrás que lo distingue: un poste con una bandejita que muestra el ingrediente elegido.
   */
  filter() {
    const top = mesh(geo('padTop', () => new THREE.PlaneGeometry(0.86, 0.86).rotateX(-Math.PI / 2)), M.rubber, 0, 0.181, 0);
    top.castShadow = false;
    const body = group(box(0.98, 0.18, 0.98, M.darkSteel, 0, 0.09, 0, 0.05), top);
    for (const turn of [0, 1, 3]) { const g = group(outArrow(0.185)); g.rotation.y = -turn * Math.PI / 2; body.add(g); }
    for (const z of [-0.43, 0.43]) body.add(box(0.06, 0.07, 0.12, M.steel, -0.46, 0.21, z, 0.02));
    // el cartel, fuera del paso: poste de 0,18 a 0,75 y bandeja arriba, en la esquina de atrás a la izquierda
    const holder = group(); holder.position.set(-0.36, 0.775, -0.36); holder.scale.setScalar(0.55);
    body.add(cyl(0.02, 0.02, 0.57, M.steel, -0.36, 0.465, -0.36, 8), cyl(0.13, 0.13, 0.025, M.steel, -0.36, 0.7625, -0.36), holder);
    let shown = null; // el ingrediente puesto en la bandeja: se rearma sólo cuando cambia
    const show = type => {
      if (type === shown) return;
      holder.clear();
      holder.add(buildItem(type === 'burger' ? { type, recipeKey: 'classic' } : { type }));
      shown = type;
    };
    show(PICKS[0]); // fantasma y miniatura de la barra
    return { body, update: c => show(c.pick ?? PICKS[0]) };
  },

  /**
   * Puente: un carril bajo que pasa por debajo (este-oeste) y una pasarela con rampas (norte-sur) apoyada en dos
   * vigas con arco. Cada carril se modela a lo largo de su propio +X, como una cinta, y se gira hacia donde corre.
   * update recibe flow = [esteOeste, norteSur] (bridgeFlow): dirección con flechas, o null con goma lisa quieta.
   */
  bridge() {
    const lane = (...kids) => { const g = group(...kids); g.userData.belts = kids.filter(o => o.material === M.belt); return g; };
    const low = lane(box(1, 0.18, 0.56, M.darkSteel, 0, 0.09, 0, 0.03), beltStrip(1, 0.48, 0, 0.181),
      box(1, 0.05, 0.04, M.steel, 0, 0.2, 0.26, 0.015), box(1, 0.05, 0.04, M.steel, 0, 0.2, -0.26, 0.015));
    // pasarela: rampa de subida, tramo plano a BRIDGE_TOP entre -0,25 y 0,25, rampa de bajada hasta la altura de cinta
    const rise = BRIDGE_TOP - SURFACE_BELT, slope = Math.atan2(rise, 0.25), ramp = Math.hypot(rise, 0.25), midY = (BRIDGE_TOP + SURFACE_BELT) / 2;
    const deck = (len, x, y, a) => { const s = beltStrip(len, 0.48, 0, 0.001), g = group(box(len, 0.04, 0.52, M.darkSteel, 0, -0.02, 0, 0.01), s); g.position.set(x, y, 0); g.rotation.z = a; return [g, s]; };
    const parts = [deck(ramp, -0.375, midY, slope), deck(0.5, 0, BRIDGE_TOP, 0), deck(ramp, 0.375, midY, -slope)];
    const high = group(...parts.map(([g]) => g), ...[-0.3, 0.3].map(z => mesh(bridgeBeam(), M.steel, 0, 0, z - 0.02)));
    high.userData.belts = parts.map(([, s]) => s);
    // d: hacia dónde corre (índice de DIRS) o null; axis: la dirección por omisión, que fija el eje del carril
    const orient = (g, d, axis) => {
      g.rotation.y = -(d ?? axis) * Math.PI / 2;
      for (const s of g.userData.belts) s.material = d == null ? M.rubber : M.belt;
    };
    orient(low, 0, 0); orient(high, 1, 1); // sin flow (miniatura y fantasma): bajo hacia el este, alto hacia el sur
    return {
      body: group(low, high),
      update(c, t, playing, flow) {
        if (!flow) return;
        orient(low, flow[0], 0);
        orient(high, flow[1], 1);
      },
    };
  },

  raw: () => source(M.meatBox, () => patty(M.raw), PATTY_H),
  bun: () => source(M.bunBox, () => stack([[bunBottom(), BUN_H], [bunTop(), 0.11]]), 0.16),
  cheese: () => source(M.cheeseBox, cheeseSlice, CHEESE_H),

  grill() {
    const ember = mesh(geo('ember', () => new THREE.PlaneGeometry(0.72, 0.72).rotateX(-Math.PI / 2)),
      std(0x220a00, 0.9, 0, { emissive: C.ember, emissiveIntensity: 0.3 }), 0, 0.575, 0);
    ember.castShadow = false;
    const body = group(box(0.92, 0.5, 0.92, M.grill, 0, 0.25, 0, 0.06), box(0.84, 0.08, 0.84, M.black, 0, 0.53, 0, 0.03), ember, chute(), outArrow(0.57));
    for (let i = 0; i < 7; i++) body.add(box(0.74, 0.025, 0.03, M.darkSteel, 0, 0.59, -0.33 + i * 0.11, 0.01));
    for (let i = 0; i < 3; i++) { const k = cyl(0.045, 0.045, 0.04, M.knob, -0.22 + i * 0.22, 0.32, 0.47); k.rotation.x = Math.PI / 2; body.add(k); }
    const y = 0.605;
    const raws = [0, 1, 2].map(i => putAt(patty(M.raw), -0.22, y + i * PATTY_H, -0.2));
    // una carne en cocción por hornalla: la segunda sólo aparece en la doble hornalla, que cocina dos a la vez
    const cooking = [[-0.05, 0.18], [0.25, 0.22]].map(([x, z]) => putAt(patty(M.raw.clone()), x, y, z));
    const cooked = [0, 1].map(i => putAt(patty(), 0.24, y + i * PATTY_H, -0.14));
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const smoke = [0, 1, 2].map(() => { const s = new THREE.Mesh(geo('puff', () => new THREE.SphereGeometry(0.09, 10, 8)), smokeMat.clone()); return s; });
    body.add(...raws, ...cooking, ...cooked, ...smoke);
    const bar = progressBar(1.25), from = new THREE.Color(C.raw), to = new THREE.Color(C.patty);
    return {
      body, ui: bar,
      update(c, t, playing) {
        const busy = c.cooking.length > 0, next = Math.min(...c.cooking.filter(left => left > 0)); // la próxima que sale
        showCount(raws, c.rawCount); showCount(cooked, c.cooked); showCount(cooking, c.cooking.length);
        c.cooking.forEach((left, i) => cooking[i]?.material.color.lerpColors(from, to, Math.min(1, 1 - left / TIMES.cook)));
        ember.material.emissiveIntensity = busy ? 1.5 + Math.sin(t * 6) * 0.25 : 0.3;
        bar.userData.set(next < Infinity ? 1 - next / TIMES.cook : -1);
        smoke.forEach((s, i) => {
          const k = (t * 0.6 + i / 3) % 1;
          s.visible = busy && playing;
          s.position.set(-0.05 + Math.sin(i * 2 + k * 3) * 0.06, 0.7 + k * 0.7, 0.18);
          s.scale.setScalar(0.5 + k);
          s.material.opacity = 0.35 * (1 - k);
        });
      },
    };
  },

  stock(up) {
    const body = group(
      box(0.92, 0.46, 0.92, M.stock, 0, 0.23, 0, 0.06), box(0.8, 0.04, 0.8, M.steel, 0, 0.47, 0, 0.02), chute(), outArrow(0.49),
      cyl(0.025, 0.025, 0.6, M.steel, -0.38, 0.76, -0.38, 10), cyl(0.025, 0.025, 0.6, M.steel, 0.38, 0.76, -0.38, 10),
      box(0.86, 0.07, 0.14, M.steel, 0, 1.06, -0.38, 0.03), box(0.74, 0.03, 0.08, M.lamp, 0, 1.02, -0.38, 0.01),
    );
    if (up) { // estantes: dos parantes más adelante y un estante de rejilla a media altura
      for (const x of [-0.38, 0.38]) body.add(cyl(0.025, 0.025, 0.6, M.steel, x, 0.76, 0.38, 10));
      for (const z of [-0.38, 0.38]) body.add(box(0.8, 0.025, 0.04, M.steel, 0, 0.8, z, 0.01));
    }
    const patties = Array.from({ length: stockCap({ up }) }, (_, i) =>
      putAt(patty(), -0.19 + (i % 2) * 0.38, 0.49 + (i >> 2) * PATTY_H, -0.05 + ((i >> 1) % 2) * 0.34));
    body.add(...patties);
    return { body, update: c => showCount(patties, c.store) };
  },

  assembly(up) {
    const body = group(box(0.94, 0.42, 0.94, M.assembly, 0, 0.21, 0, 0.06), box(0.84, 0.05, 0.84, M.wood, 0, 0.445, 0, 0.02), chute(), outArrow(0.47));
    const top = 0.47;
    // Bandejas de ingredientes recibidos (hasta tres a la vista de cada uno).
    const trays = {
      bun: [0, 1, 2].map(i => putAt(bunBottom(), -0.28, top + i * BUN_H, 0.28)),
      patty: [0, 1, 2].map(i => putAt(patty(), 0, top + i * PATTY_H, 0.3)),
      cheese: [0, 1, 2].map(i => putAt(cheeseSlice(), 0.27, top + i * CHEESE_H, 0.28)),
    };
    for (const k in trays) body.add(...trays[k]);
    // Brazo: hombro -> codo -> pinza. Con la mejora hay un segundo brazo en la otra esquina de atrás.
    const robot = (x, turn) => {
      const claw = group(box(0.2, 0.05, 0.07, M.darkSteel, 0, 0, 0, 0.02), box(0.04, 0.12, 0.07, M.steel, -0.09, -0.06, 0, 0.015), box(0.04, 0.12, 0.07, M.steel, 0.09, -0.06, 0, 0.015));
      claw.position.y = 0.4;
      const fore = group(box(0.1, 0.4, 0.1, M.robot, 0, 0.2, 0, 0.04), cyl(0.075, 0.075, 0.14, M.darkSteel, 0, 0, 0, 16), claw);
      fore.children[1].rotation.x = Math.PI / 2;
      fore.position.y = 0.46;
      const arm = group(box(0.12, 0.46, 0.12, M.robot, 0, 0.23, 0, 0.05), fore);
      const shoulder = group(cyl(0.13, 0.16, 0.12, M.darkSteel, 0, 0.06, 0, 20), arm);
      arm.position.y = 0.1;
      shoulder.position.set(x, top, -0.27);
      shoulder.rotation.y = turn; // el brazo se dobla hacia el centro de la tabla
      body.add(shoulder);
      return { arm, fore };
    };
    const robots = up ? [robot(-0.27, -Math.PI / 4), robot(0.27, -3 * Math.PI / 4)] : [robot(-0.27, -Math.PI / 4)];
    const wip = group(); wip.position.set(0.04, top, -0.02); body.add(wip);
    const bar = progressBar(1.35);
    let wipKey = null;
    return {
      body, ui: bar,
      update(c, t) {
        for (const k in trays) showCount(trays[k], c.inv[k]);
        const p = c.job ? Math.max(0, 1 - c.job.left / assembleTime(c)) : -1; // mejorada a mitad de un trabajo: arranca de cero
        bar.userData.set(c.job && c.job.left > 0 ? p : -1);
        const key = c.job ? c.job.recipeKey : null;
        if (key !== wipKey) { wip.clear(); if (key) wip.add(burger(key)); wipKey = key; }
        if (key) { const layers = wip.children[0].userData.layers; showCount(layers, Math.ceil(Math.max(0, p) * layers.length)); }
        robots.forEach(({ arm, fore }, i) => { // los dos brazos van a contratiempo
          const work = c.job ? Math.sin(t * 7 + i * Math.PI) : 0;
          arm.rotation.z = c.job ? -0.55 + work * 0.12 : -0.15;
          fore.rotation.z = c.job ? -1.25 - work * 0.25 : -2.2;
        });
      },
    };
  },

  dispatch() {
    const awning = box(1.0, 0.04, 0.62, M.awning, 0, 1.28, -0.2, 0.01);
    awning.rotation.x = 0.28;
    const bell = mesh(geo('bell', () => new THREE.SphereGeometry(0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.gold, 0.28, 0.5, 0.24);
    return {
      body: group(
        box(0.94, 0.44, 0.94, M.dispatch, 0, 0.22, 0, 0.06), box(0.98, 0.06, 0.98, M.cream, 0, 0.47, 0, 0.03),
        cyl(0.025, 0.025, 0.86, M.steel, -0.42, 0.9, -0.42, 10), cyl(0.025, 0.025, 0.86, M.steel, 0.42, 0.9, -0.42, 10),
        awning, bell, cyl(0.012, 0.012, 0.03, M.gold, 0.28, 0.58, 0.24, 8),
        box(0.24, 0.3, 0.16, M.bag, -0.2, 0.65, -0.1, 0.02), box(0.24, 0.04, 0.17, M.cream, -0.2, 0.8, -0.1, 0.01),
      ),
    };
  },
};

function source(mat, makeFood, foodH) {
  const body = group(box(0.9, 0.56, 0.9, mat, 0, 0.28, 0, 0.08), box(0.78, 0.06, 0.78, M.steel, 0, 0.58, 0, 0.02), chute(), outArrow(0.61));
  for (const [x, z, n] of [[-0.18, -0.16, 3], [0.17, -0.12, 2], [-0.02, 0.2, 2]]) {
    for (let i = 0; i < n; i++) body.add(putAt(makeFood(), x, 0.61 + i * foodH, z));
  }
  return { body };
}

/** up: la máquina tiene su mejora (cambia el modelo y lleva el banderín). */
export function buildMachine(kind, up = false) {
  const { body, ui, update } = builders[kind](up);
  const root = group(body);
  if (ui) root.add(ui);
  if (up) root.add(pennant());
  root.userData = { body, ui, update };
  return root;
}

// ---------- clientes ----------
const SHIRTS = [C.meatBox, C.stock, C.assembly, C.dispatch, C.cheeseBox, C.robot, C.wainscot];
const SKINS = [C.bunIn, C.bun, C.wood, C.patty], HAIRS = [C.frameEdge, C.patty, C.darkSteel, C.gold], PANTS = [C.darkSteel, C.slab, C.grill];
const toys = new Map(), toyOf = color => toys.get(color) ?? (toys.set(color, toy(color)), toys.get(color));
/** Pierna o brazo que cuelga de su articulación (y), para balancearlo al caminar. */
const limb = (w, h, m, x, y) => { const g = group(box(w, h, 0.09, m, 0, -h / 2, 0, 0.035)); g.position.set(x, y, 0); return g; };

/** Bolsa de papel del pedido, apoyada en y = 0 (los mismos materiales que la del despacho). */
export const buildBag = () => group(box(0.16, 0.2, 0.11, M.bag, 0, 0.1, 0, 0.02), box(0.16, 0.03, 0.115, M.cream, 0, 0.2, 0, 0.01));

/** Un cliente mirando a +Z. look (entero) elige la variante de colores. update(mark, walking, t, bag): marca sobre la cabeza ('' | 'soon' | 'late' | 'angry' | null), paso y la bolsa en la mano. */
export function buildCustomer(look) {
  const h = Math.imul(look, 2654435761) >>> 0, of = (list, k) => toyOf(list[(h >>> k) % list.length]);
  const shirt = of(SHIRTS, 0), skin = of(SKINS, 8);
  const legs = [-0.075, 0.075].map(x => limb(0.1, 0.3, of(PANTS, 24), x, 0.3)), arms = [-0.2, 0.2].map(x => limb(0.07, 0.27, shirt, x, 0.6));
  const head = mesh(geo('head', () => new THREE.SphereGeometry(0.13, 18, 12)), skin, 0, 0.77, 0);
  const hair = mesh(geo('hair', () => new THREE.SphereGeometry(0.138, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)), of(HAIRS, 16), 0, 0.79, -0.012);
  const eyes = [-0.047, 0.047].map(x => mesh(geo('eye', () => new THREE.SphereGeometry(0.02, 8, 6)), M.black, x, 0.78, 0.118));
  const body = group(...legs, ...arms, box(0.32, 0.34, 0.2, shirt, 0, 0.47, 0, 0.08), head, hair, ...eyes);
  const bag = buildBag(); // cuelga de la mano derecha y se balancea con el brazo
  bag.position.set(0.04, -0.47, 0); bag.visible = false;
  arms[1].add(bag);
  const sign = new THREE.Sprite(MARKS['']);
  sign.scale.setScalar(0.42); sign.position.y = 1.15; sign.renderOrder = 8;
  const root = group(body, sign);
  root.userData.update = (mark, walking, t, hasBag = false) => {
    bag.visible = hasBag;
    sign.visible = mark != null;
    if (sign.visible) sign.material = MARKS[mark];
    const swing = walking ? Math.sin(t * 11) * 0.6 : 0;
    legs[0].rotation.x = arms[1].rotation.x = swing;
    legs[1].rotation.x = arms[0].rotation.x = -swing;
    body.position.y = walking ? Math.abs(swing) * 0.05 : 0;
  };
  return root;
}

// ---------- el local ----------
/**
 * Piso, paredes y vereda del local. hole(x, y): la celda está fuera del local (no se dibuja como piso y su
 * borde lleva pared) · pillar(x, y): columna. Las paredes van por cada borde norte, oeste y este entre piso y
 * lo que no es piso; el frente (sur) queda abierto hacia la vereda.
 */
export function buildLot(W, H, hole = () => false, pillar = () => false) {
  const g = group();
  g.userData.tall = []; // lo alto del fondo (paño de pared y ventanas): la escena lo esconde al mirar desde el norte
  const tall = (...o) => { g.userData.tall.push(...o); return o; };
  const tex = floorTexture.clone();
  tex.repeat.set(W / 2, H / 2);
  tex.needsUpdate = true;
  const floor = mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), W / 2, 0, H / 2);
  floor.castShadow = false;
  const slab = box(W + 1, 0.5, H + 1, std(C.slab, 0.8), W / 2, -0.26, H / 2, 0.12);
  const wallM = std(C.wall, 0.9), band = toy(C.wainscot);
  const glass = std(C.window, 0.2, 0, { emissive: C.window, emissiveIntensity: 0.55 });
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !hole(x, y);
  g.add(floor, slab);
  // cada tramo de pared junta las celdas seguidas que tienen el mismo borde (una pared por tramo, sin costuras)
  const runs = (n, edge, f) => { for (let i = 0, a = -1; i <= n; i++) { const on = i < n && edge(i); if (on && a < 0) a = i; if (!on && a >= 0) { f(a, i); a = -1; } } };
  for (let y = 0; y < H; y++) runs(W, x => inside(x, y) && !inside(x, y - 1), (a, b) => g.add( // pared del fondo, alta
    ...tall(box(b - a + 0.5, 1.9, 0.25, wallM, (a + b) / 2, 0.95, y - 0.125, 0.04)), box(b - a + 0.52, 0.62, 0.27, band, (a + b) / 2, 0.31, y - 0.125, 0.04)));
  for (let x = 0; x <= W; x++) for (const [side, dx] of [[x, -1], [x - 1, 1]]) // pared de costado, baja: al oeste y al este del piso
    runs(H, y => inside(side, y) && !inside(side + dx, y), (a, b) => g.add(box(0.25, 0.7, b - a + 0.25, wallM, x + dx * 0.125, 0.35, (a + b) / 2 - 0.125, 0.04)));
  const outside = std(C.bg, 0.9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (hole(x, y)) { // tapa el piso y el borde de la losa: se ve el fondo, como fuera del local
      const x0 = x ? x : -0.6, x1 = x < W - 1 ? x + 1 : W + 0.6, z0 = y ? y : -0.6;
      g.add(box(x1 - x0, 0.6, y + 1 - z0, outside, (x0 + x1) / 2, -0.29, (z0 + y + 1) / 2, 0.01));
    } else if (pillar(x, y)) g.add(box(0.72, 2.3, 0.72, wallM, x + 0.5, 1.15, y + 0.5, 0.06), box(0.76, 0.62, 0.76, band, x + 0.5, 0.31, y + 0.5, 0.06));
  }
  const c = curb({ W, H }), cx = (c.x0 + c.x1) / 2; // la vereda del frente, donde hace fila la gente
  g.add(box(c.x1 - c.x0, 0.5, c.z1 - c.z0, std(C.sidewalk, 0.85), cx, -0.25, (c.z0 + c.z1) / 2, 0.1),
    box(c.x1 - c.x0, 0.08, 0.14, std(C.curb, 0.8), cx, 0, c.z1 - 0.07, 0.03));
  for (let x = 2; x + 1.5 <= W; x += 4) { // una ventana cada cuatro celdas, donde la pared del fondo es la del frente del terreno
    if (inside(x, 0) && inside(x + 1, 0)) g.add(...tall(box(1.7, 0.8, 0.06, M.wood, x + 0.75, 1.25, 0.01, 0.06), box(1.5, 0.62, 0.08, glass, x + 0.75, 1.25, 0.02, 0.04)));
  }
  return g;
}

/** Marco cuadrado apoyado en el piso, para la celda elegida y la del cursor. */
export function tileFrame(color) {
  const g = group();
  // dos pasadas: un borde oscuro ancho y encima el color, para que se lea sobre el piso claro
  for (const [c, t, order] of [[C.frameEdge, 0.14, 5], [color, 0.07, 6]]) {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, depthTest: false });
    const e = 0.5 - 0.07;
    for (const [w, d, x, z] of [[1 + t - 0.14, t, 0, e], [1 + t - 0.14, t, 0, -e], [t, 1 + t - 0.14, e, 0], [t, 1 + t - 0.14, -e, 0]]) {
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
      o.position.set(x, 0.02, z);
      o.renderOrder = order;
      g.add(o);
    }
  }
  g.visible = false;
  return g;
}

/** Copia translúcida de una máquina, para ver dónde va a quedar antes de colocarla. */
export function buildGhost(kind) {
  const root = buildMachine(kind);
  const m = new THREE.MeshBasicMaterial({ color: C.ok, transparent: true, opacity: 0.55, depthWrite: false });
  root.traverse(o => { if (o.isMesh) { o.material = m; o.castShadow = o.receiveShadow = false; } });
  root.userData.material = m;
  if (root.userData.ui) root.userData.ui.visible = false;
  return root;
}
