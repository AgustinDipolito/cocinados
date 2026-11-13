// La escena 3D: dibuja el estado de la simulación, no decide nada del juego.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BELT_TIME, BUILD_ORDER, RECIPES, DIAG, LOTS } from './data.js';
import { isStuck, diagShares, valid } from './sim.js';
import { C, BRIDGE_TOP, beltTexture, alertTexture, jamTexture, buildMachine, buildItem, buildLot, buildGhost, tileFrame, burger, buildCustomer } from './models.js';
import { CROWD, curb, newCrowd, stepCrowd } from './crowd.js';

const PITCH = THREE.MathUtils.degToRad(54); // cuánto mira hacia abajo la cámara
const SURFACE = { belt: 0.185, assembly: 0.47, bridge: BRIDGE_TOP + 0.005 }; // altura a la que apoya un producto (bridge: carril alto del puente)
const smooth = p => p * p * (3 - 2 * p);
const inRects = (list, x, y) => (list ?? []).some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  scene.fog = new THREE.Fog(C.bg, 60, 140);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  // Poca luz de relleno y un sol fuerte: las sombras son las que dan el volumen.
  scene.add(new THREE.HemisphereLight(0xffe9cc, 0x4a5a78, 0.55));
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 5;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 300);
  const view = { tx: 0, tz: 0, dist: 20, fitDist: 20 };

  const world = new THREE.Group(), itemLayer = new THREE.Group(), alerts = new THREE.Group(), jams = new THREE.Group(), crowdLayer = new THREE.Group();
  scene.add(world, itemLayer, alerts, jams, crowdLayer);
  let crowd = newCrowd(), crowdT = 0, crowdShown = []; const people = new Map(); // la fila de la vereda (crowd.js) y su modelo por persona
  let jamsOn = false;
  const selectFrame = tileFrame(C.select), hoverFrame = tileFrame(C.hover);
  scene.add(selectFrame, hoverFrame);

  let lot = null, lotKey = '', machines = [], items = new Map(), ghost = null, ghostKind = null;
  let shown = null; // la partida que se está dibujando
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v3 = new THREE.Vector3();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function placeCamera() {
    camera.position.set(view.tx, view.dist * Math.sin(PITCH), view.tz + view.dist * Math.cos(PITCH));
    camera.lookAt(view.tx, 0, view.tz);
    camera.updateMatrixWorld();
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function rebuildLot(s) {
    if (lot) world.remove(lot);
    const shape = LOTS[s.lot]; // agujeros y columnas: ampliar no los mueve, así que valen los del local
    lot = buildLot(s.W, s.H, (x, y) => inRects(shape.holes, x, y), (x, y) => inRects(shape.pillars, x, y));
    world.add(lot);
    for (const m of machines) if (m) world.remove(m.root);
    machines = Array(s.W * s.H).fill(null);
    const span = Math.max(s.W, s.H) * 0.75 + 3;
    sun.target.position.set(s.W / 2, 0, s.H / 2);
    sun.position.set(s.W / 2 - span * 0.55, span * 1.5, s.H / 2 + span * 0.7);
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 4 });
    sun.shadow.camera.updateProjectionMatrix();
  }

  function syncMachines(s, t, playing) {
    for (let i = 0; i < s.cells.length; i++) {
      const c = s.cells[i], key = c ? c.kind + (c.up ? '+' : '') : ''; // mejorar cambia el modelo
      let m = machines[i];
      if ((m?.key ?? '') !== key) {
        if (m) world.remove(m.root);
        m = machines[i] = c ? { key, root: buildMachine(c.kind, c.up) } : null;
        if (m) {
          m.root.position.set((i % s.W) + 0.5, 0, Math.floor(i / s.W) + 0.5);
          if (m.root.userData.ui) m.root.userData.ui.rotation.x = -PITCH;
          world.add(m.root);
        }
      }
      if (!m) continue;
      m.root.userData.body.rotation.y = -c.dir * Math.PI / 2;
      m.root.userData.update?.(c, t, playing);
    }
  }

  function syncItems(s, t) {
    const seen = new Set();
    let alertN = 0;
    const show = (item, x, y, z) => {
      let o = items.get(item.id);
      if (!o) { o = buildItem(item); items.set(item.id, o); itemLayer.add(o); }
      o.position.set(x, y, z);
      seen.add(item.id);
    };
    for (let i = 0; i < s.cells.length; i++) {
      const c = s.cells[i];
      if (!c) continue;
      const x = i % s.W, y = Math.floor(i / s.W);
      for (const slot of ['item', 'item2']) { // item2: el carril alto del puente, que sube mientras entra
        const it = c[slot];
        if (!it) continue;
        const p = smooth(THREE.MathUtils.clamp((t - it.t0) / BELT_TIME, 0, 1));
        const px = THREE.MathUtils.lerp(it.fx, x, p) + 0.5, pz = THREE.MathUtils.lerp(it.fy, y, p) + 0.5;
        const py = slot === 'item2' ? THREE.MathUtils.lerp(SURFACE.belt, SURFACE.bridge, p) : SURFACE.belt;
        show(it, px, py, pz);
        if (isStuck(s, x, y, slot)) {
          let a = alerts.children[alertN++];
          if (!a) { a = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture, depthTest: false })); a.scale.setScalar(0.5); alerts.add(a); }
          a.visible = true;
          a.position.set(px, py + 0.77, pz);
        }
      }
      if (c.output) show(c.output, x + 0.54, SURFACE.assembly, y + 0.48);
    }
    for (let i = alertN; i < alerts.children.length; i++) alerts.children[i].visible = false;
    for (const [id, o] of items) if (!seen.has(id)) { itemLayer.remove(o); items.delete(id); }
  }

  /** Capa de atascos: una marca sobre cada celda que pasó trabada al menos DIAG.jam del último minuto. */
  function syncJams(s) {
    let n = 0;
    if (jamsOn) for (let i = 0; i < s.cells.length; i++) {
      if ((diagShares(s.cells[i])?.blocked ?? 0) < DIAG.jam) continue;
      let m = jams.children[n++];
      if (!m) { m = new THREE.Sprite(new THREE.SpriteMaterial({ map: jamTexture, depthTest: false })); m.scale.setScalar(0.55); m.renderOrder = 7; jams.add(m); }
      m.visible = true;
      m.position.set((i % s.W) + 0.5, 1.35, Math.floor(i / s.W) + 0.5);
    }
    for (let i = n; i < jams.children.length; i++) jams.children[i].visible = false;
  }

  /** La fila de clientes: crowd.js decide quién está y dónde; acá sólo se le pone un modelo a cada uno. */
  function syncCrowd(s, t, events) {
    const c = curb(s), dt = Math.max(0, t - crowdT); // tiempo de juego: en pausa nadie camina, y con 6× caminan a 6×
    crowdT = t;
    crowdShown = stepCrowd(crowd, s.orders, events, s.time, dt, c, reducedMotion.matches);
    const seen = new Set();
    for (const p of crowdShown) {
      let o = people.get(p.key);
      if (!o) { o = buildCustomer(p.look); people.set(p.key, o); crowdLayer.add(o); }
      o.position.set(p.x, 0, p.z);
      o.rotation.y = p.heading;
      o.scale.setScalar(CROWD.size * THREE.MathUtils.clamp(Math.min(p.x - c.enterX, c.leaveX - p.x) / 0.8, 0, 1)); // asoma y se pierde en las puntas de la vereda
      o.userData.update(p.mark, p.walking, t);
      seen.add(p.key);
    }
    for (const [key, o] of people) if (!seen.has(key)) { crowdLayer.remove(o); people.delete(key); }
  }

  /**
   * Dibuja un cuadro. t es el tiempo de simulación con su fracción, para que el movimiento no salte.
   * events: los que anunció la simulación desde el cuadro anterior (la fila los usa para saber quién cobró o se fue).
   */
  function render(s, t, dt, playing, events = []) {
    if (s !== shown) { // otra partida: sus productos y pedidos repiten números, así que no se reusa ningún modelo
      shown = s;
      for (const o of items.values()) itemLayer.remove(o);
      items.clear();
      for (const o of people.values()) crowdLayer.remove(o);
      people.clear();
      crowd = newCrowd(); crowdT = t; // la partida nueva o recuperada arranca con cada cliente en su lugar
    }
    const key = `${s.lot}:${s.W}x${s.H}`;
    if (key !== lotKey) { lotKey = key; rebuildLot(s); }
    syncMachines(s, t, playing);
    syncItems(s, t);
    syncJams(s);
    syncCrowd(s, t, events);
    if (playing && !reducedMotion.matches) beltTexture.offset.x -= dt / BELT_TIME; // con movimiento reducido la goma queda quieta
    renderer.render(scene, camera);
  }

  /** Celda bajo un punto de la pantalla, o null si cae fuera del terreno o en lo que no es piso. */
  function pick(s, clientX, clientY) {
    const g = groundAt(clientX, clientY);
    if (!g) return null;
    const x = Math.floor(g.x), y = Math.floor(g.z);
    return valid(s, x, y) ? { x, y } : null;
  }

  function groundAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera({ x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 }, camera);
    return ray.ray.intersectPlane(ground, new THREE.Vector3());
  }

  /** Posición en pantalla (px) de un punto del terreno. */
  function project(x, y, height = 0) {
    v3.set(x + 0.5, height, y + 0.5).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height };
  }

  function clampView(s) {
    view.tx = THREE.MathUtils.clamp(view.tx, 0, s.W);
    view.tz = THREE.MathUtils.clamp(view.tz, 0, curb(s).z1); // hasta el cordón de la vereda
    view.dist = THREE.MathUtils.clamp(view.dist, 6, view.fitDist * 1.4);
    placeCamera();
  }

  /** Arrastrar: el punto del piso que estaba bajo el dedo sigue bajo el dedo. */
  function panPixels(s, fromX, fromY, toX, toY) {
    const a = groundAt(fromX, fromY), b = groundAt(toX, toY);
    if (!a || !b) return;
    view.tx += a.x - b.x; view.tz += a.z - b.z;
    clampView(s);
  }
  function pan(s, dx, dz) { view.tx += dx; view.tz += dz; clampView(s); }
  function zoom(s, factor) { view.dist *= factor; clampView(s); }
  function lookAt(s, x, y) { view.tx = x + 0.5; view.tz = y + 0.5; clampView(s); }

  /** Encuadra el terreno entero dentro de la parte de la pantalla que el HUD deja libre. */
  function fit(s, inset) {
    resize();
    const r = canvas.getBoundingClientRect();
    const safe = { l: inset.left, t: inset.top, r: r.width - inset.right, b: r.height - inset.bottom };
    const c = curb(s); // el frente es el cordón de la vereda, y por encima de la fila entran las marcas de los clientes
    const corners = [[0, 0, -0.3], [s.W, 0, -0.3], [0, 2, -0.3], [s.W, 2, -0.3], [-0.5, 0, c.z1], [s.W + 0.5, 0, c.z1], [c.headX, 1.4 * CROWD.size, c.z]];
    const bounds = () => {
      const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
      for (const [x, y, z] of corners) {
        v3.set(x, y, z).project(camera);
        const px = (v3.x + 1) / 2 * r.width, py = (1 - v3.y) / 2 * r.height;
        b.l = Math.min(b.l, px); b.r = Math.max(b.r, px); b.t = Math.min(b.t, py); b.b = Math.max(b.b, py);
      }
      return b;
    };
    view.tx = s.W / 2; view.tz = s.H / 2;
    for (view.dist = 6; view.dist < 200; view.dist *= 1.04) {
      placeCamera();
      const b = bounds();
      if (b.r - b.l <= safe.r - safe.l && b.b - b.t <= safe.b - safe.t) break;
    }
    for (let i = 0; i < 4; i++) { // centra lo encuadrado en la zona libre
      const b = bounds();
      const from = groundAt(r.left + (b.l + b.r) / 2, r.top + (b.t + b.b) / 2), to = groundAt(r.left + (safe.l + safe.r) / 2, r.top + (safe.t + safe.b) / 2);
      if (!from || !to) break;
      view.tx += from.x - to.x; view.tz += from.z - to.z;
      placeCamera();
    }
    view.fitDist = view.dist;
  }

  function setSelected(cell) {
    selectFrame.visible = !!cell;
    if (cell) selectFrame.position.set(cell.x + 0.5, 0, cell.y + 0.5);
  }

  /** Cursor sobre una celda: marco siempre, y la máquina fantasma si hay una herramienta de construir. */
  function setHover(cell, kind, dir, ok) {
    hoverFrame.visible = !!cell;
    if (ghostKind !== kind) {
      if (ghost) scene.remove(ghost);
      ghost = kind ? buildGhost(kind) : null;
      if (ghost) scene.add(ghost);
      ghostKind = kind;
    }
    if (ghost) ghost.visible = !!cell;
    if (!cell) return;
    hoverFrame.position.set(cell.x + 0.5, 0, cell.y + 0.5);
    if (ghost) {
      ghost.position.set(cell.x + 0.5, 0.01, cell.y + 0.5);
      ghost.userData.body.rotation.y = -dir * Math.PI / 2;
      ghost.userData.material.color.set(ok ? C.ok : C.bad);
    }
  }

  /** Miniaturas para el HUD, sacadas de los mismos modelos del juego. Devuelve { clave: dataURL }. */
  function thumbnails(size = 144) {
    const out = {}, stage = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    stage.environment = scene.environment;
    stage.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(-2, 4, 3);
    stage.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3), key);
    cam.position.set(2.2, 3.1, 3.4);
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearAlpha(0);
    const shoot = (name, obj, lookY, half) => {
      stage.add(obj);
      Object.assign(cam, { left: -half, right: half, top: half, bottom: -half });
      cam.lookAt(0, lookY, 0);
      cam.updateProjectionMatrix();
      renderer.render(stage, cam);
      out[name] = canvas.toDataURL('image/png');
      stage.remove(obj);
    };
    for (const kind of BUILD_ORDER) { const low = kind === 'belt' || kind === 'splitter'; shoot(kind, buildMachine(kind), low ? 0.1 : 0.5, low ? 0.72 : 0.95); }
    for (const k in RECIPES) shoot('recipe_' + k, burger(k), 0.14, 0.27);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    resize();
    return out;
  }

  resize();
  placeCamera();
  /** Para las pruebas: qué modelo se está dibujando para cada producto. */
  const shownItems = () => [...items].map(([id, o]) => ({ id, type: o.userData.type }));
  /** Para las pruebas: las celdas que la capa de atascos está marcando. */
  const shownJams = () => jams.children.filter(m => m.visible).map(m => ({ x: Math.floor(m.position.x), y: Math.floor(m.position.z) }));
  const setJams = on => { jamsOn = on; };
  /** Para las pruebas: los clientes dibujados. queued: está en la fila (key es el número de su pedido); settled: llegó a su lugar. */
  const shownCustomers = () => crowdShown.map(p => ({ key: p.key, queued: p.queued, mark: p.mark, x: p.x, z: p.z, settled: p.x === p.tx && p.z === p.tz }));
  return { render, pick, project, pan, panPixels, zoom, lookAt, fit, resize, setSelected, setHover, thumbnails, shownItems, shownJams, setJams, shownCustomers };
}
