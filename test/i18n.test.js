// El catálogo de frases: ningún idioma se queda atrás del español y el código no pide frases que no existen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STRINGS, LANGS } from '../src/i18n.js';
import { KINDS, RECIPES, UPGRADES, CAREER_LOTS, PUZZLE_ORDER } from '../src/data.js';

const holes = s => (s.match(/\{\w+\}/g) ?? []).sort().join();
const code = readdirSync('src').filter(f => f.endsWith('.js') && f !== 'i18n.js').map(f => readFileSync(`src/${f}`, 'utf8')).join('\n');
// Familias de claves que se arman en el código con un prefijo y un dato.
const families = {
  kind_: Object.keys(KINDS), kindLong_: Object.keys(KINDS), kindHint_: Object.keys(KINDS),
  recipe_: Object.keys(RECIPES), item_: ['raw', 'patty', 'bun', 'cheese', 'burger'], dir: ['0', '1', '2', '3'],
  share_: ['work', 'blocked', 'wait', 'idle'],
  upHint_: Object.keys(UPGRADES), upDone_: Object.keys(UPGRADES),
  lot_: CAREER_LOTS,
  puzzle_: PUZZLE_ORDER, puzzleWhy_: ['expired', 'timeout'],
};
const familyKeys = Object.entries(families).flatMap(([p, list]) => list.map(k => p + k));

test('cada idioma tiene las mismas frases y los mismos huecos que el español', () => {
  assert.deepEqual(Object.keys(LANGS).sort(), Object.keys(STRINGS).sort());
  assert.ok(Object.keys(STRINGS).length >= 2, 'el control necesita al menos dos idiomas para comparar');
  for (const [lang, table] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(table).sort(), Object.keys(STRINGS.es).sort(), `claves de «${lang}»`);
    for (const k in table) {
      assert.equal(holes(table[k]), holes(STRINGS.es[k]), `huecos de «${k}» en «${lang}»`);
      assert.ok(table[k].trim(), `«${k}» vacía en «${lang}»`);
    }
  }
});

test('toda frase que el código pide existe, y toda frase del catálogo se usa', () => {
  const literal = [...code.matchAll(/'([a-z][A-Za-z]+)'/g)].map(m => m[1]);
  const asked = [...code.matchAll(/\bt\('(\w+)'\s*[,)]/g)].map(m => m[1]);
  assert.ok(asked.length > 40, 'se encontraron muy pocas llamadas a t()');
  for (const k of [...asked, ...familyKeys]) assert.ok(k in STRINGS.es, `falta la frase «${k}»`);
  const simLog = [...readFileSync('src/sim.js', 'utf8').matchAll(/'(log[A-Z]\w+)'/g)].map(m => m[1]); // las frases del registro las nombra el motor
  assert.ok(simLog.length >= 8, 'se encontraron muy pocas frases de registro');
  for (const k of simLog) assert.ok(k in STRINGS.es, `falta la frase «${k}»`);
  const used = new Set([...literal, ...familyKeys]);
  for (const k in STRINGS.es) assert.ok(used.has(k), `la frase «${k}» no se usa en ningún lado`);
});

test('un solo tratamiento: el español vosea y no mezcla tuteo ni usted', () => {
  const es = Object.values(STRINGS.es).join(' ');
  assert.doesNotMatch(es, /\b(puedes|tienes|quieres|eliges|empiezas|haz|pulsa|usted)\b/i);
  assert.doesNotMatch(Object.values(STRINGS.es).concat(Object.values(STRINGS.en)).join(' '), /!|¡|—/); // ni exclamaciones ni rayas
});
