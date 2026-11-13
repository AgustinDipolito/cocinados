// La fila de clientes en la vereda: quién está, dónde y con qué marca. Es vista, no juego: lee los pedidos
// y los eventos del cuadro y no decide nada de la partida. Sin three ni DOM, para probarla con node.

// gap: distancia entre dos personas de la fila · speed: celdas por segundo de juego · look: segundos que
// mira la fila llena quien llega antes de volverse.
export const CROWD = { gap: 0.8, speed: 1.6, look: 1.2, size: 1.45 };

/** Estado de un pedido, el mismo de su tarjeta: '' a tiempo, 'soon' por vencer, 'late' vencido. */
export function orderRisk(o, time) {
  const left = o.due - time, total = o.due - o.createdAt;
  return left < 0 ? 'late' : left < total * 0.3 ? 'soon' : '';
}

/**
 * La vereda del frente del local (el lado sin pared). z: carril de la fila; lane: carril de paso, más afuera;
 * la cabeza de la fila queda en headX y la fila crece hacia -x; se llega por enterX y se cobra yéndose por
 * leaveX; z0..z1 y x0..x1 es la losa de la vereda. Toma el terreno entero para que un local con otra forma
 * calcule acá su frente sin cambiar a quien la usa.
 */
export function curb({ W, H }) {
  const z0 = H + 0.5;
  return { z0, z1: z0 + 1.8, z: z0 + 0.5, lane: z0 + 1.25, headX: Math.min(W - 1.5, W / 2 + 2), enterX: -2, leaveX: W + 2, x0: -2.5, x1: W + 2.5 };
}

export const newCrowd = () => ({ people: new Map(), seq: 0, fresh: true });

/** Primero se corre de carril, después camina a lo largo de la vereda. Devuelve si se movió. */
function walk(p, d) {
  const z0 = p.z, x0 = p.x, dz = p.tz - p.z;
  if (dz) {
    const m = Math.min(Math.abs(dz), d);
    p.z = m === Math.abs(dz) ? p.tz : p.z + Math.sign(dz) * m;
    p.heading = dz > 0 ? 0 : Math.PI;
    d -= m;
  }
  const dx = p.tx - p.x;
  if (dx && d > 0) {
    p.x = Math.abs(dx) <= d ? p.tx : p.x + Math.sign(dx) * d;
    p.heading = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  return p.x !== x0 || p.z !== z0;
}

/**
 * Avanza la fila un cuadro y devuelve las personas a dibujar.
 * orders: los pedidos en cola, en orden de llegada. events: los eventos del cuadro. time: tiempo de la partida.
 * dt: segundos de juego desde el cuadro anterior. c: la vereda (curb). still: movimiento reducido, nadie camina.
 * Persona: { key, look, x, z, heading, walking, queued, mark } con mark '' | 'soon' | 'late' | 'angry' | null.
 *   en la fila   -> queued, va a su lugar (headX - puesto * gap) y lleva la marca de su pedido
 *   cobró        -> sale por leaveX, sin marca
 *   se le venció -> vuelve por enterX con marca de enojo
 *   cola llena   -> llega por el carril de paso, mira la fila y vuelve enojado; no es de ningún pedido
 * Un pedido que deja la cola sin evento (otra partida, reinicio) se borra en el acto.
 */
export function stepCrowd(crowd, orders, events, time, dt, c, still) {
  const P = crowd.people, place = still || crowd.fresh;
  crowd.fresh = false;
  const gone = new Map();
  let turned = 0;
  for (const e of events) {
    if (e.type === 'delivered' && e.id != null) gone.set(e.id, 'paid');
    else if (e.type === 'expired') gone.set(e.id, 'angry');
    else if (e.type === 'turnedAway') turned++;
  }
  const queued = new Set();
  orders.forEach((o, i) => {
    queued.add(o.id);
    let p = P.get(o.id);
    if (!p) P.set(o.id, p = { key: o.id, look: o.id, x: c.enterX, z: c.z, heading: Math.PI / 2, queued: true });
    p.tx = c.headX - i * CROWD.gap; p.tz = c.z;
    if (place) { p.x = p.tx; p.z = p.tz; }
    p.mark = orderRisk(o, time);
  });
  for (const [key, p] of P) {
    if (!p.queued || queued.has(key)) continue;
    const why = gone.get(key);
    if (!why || still) { P.delete(key); continue; }
    Object.assign(p, { queued: false, mark: why === 'angry' ? 'angry' : null, tx: why === 'angry' ? c.enterX : c.leaveX, tz: c.lane, leaving: true });
  }
  if (!still) for (let i = 0; i < turned; i++) {
    const key = 'v' + crowd.seq++;
    P.set(key, { key, look: 1000 + crowd.seq, x: c.enterX, z: c.lane, tx: c.headX - orders.length * CROWD.gap, tz: c.lane, heading: Math.PI / 2, queued: false, mark: null, wait: CROWD.look });
  }
  for (const [key, p] of P) {
    p.walking = walk(p, CROWD.speed * dt);
    if (p.x !== p.tx || p.z !== p.tz) continue;
    if (!p.walking && !p.leaving) p.heading = Math.PI / 2; // quieto en la fila: mira hacia la cabeza
    if (p.leaving) P.delete(key);
    else if (p.wait !== undefined && (p.wait -= dt) <= 0) Object.assign(p, { mark: 'angry', tx: c.enterX, leaving: true, wait: undefined });
  }
  return [...P.values()];
}
