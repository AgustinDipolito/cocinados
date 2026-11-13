# FICHA — Burger Belt (carpeta `cocinados`)

**Producto.** Juego de automatización para navegador: se arma una cocina de comida rápida con cintas
y máquinas para entregar pedidos a tiempo. Un jugador, sin servidor. Se despliega como archivos
estáticos (`dist/`). El prototipo original queda en `burger_belt_prototipo.html`, sólo de referencia.

**Alcance.** No se asume un idioma (español e inglés desde el primer día), ni mouse (se juega con
dedo y con teclado), ni pantalla grande (teléfono parado y apaisado), ni conexión (todo va en el
paquete), ni una GPU fuerte. La plata del juego no es una moneda real: se muestra con `$` y nada más.

**Stack.** JavaScript con módulos ES, sin framework ni TypeScript. three.js para el 3D, Vite para
armar. Guardado en `localStorage`. Dependencias: `three`, `@fontsource/fredoka`; de desarrollo,
`vite` y `puppeteer-core` (usa el Chrome instalado). No se agrega otra sin motivo escrito acá.

**Sistema visual.** Tokens en `:root` de `src/style.css`: tinta sobre papel crema; el amarillo
`--action` va sólo sobre lo que se toca o lo elegido; verde, ámbar y rojo son estados. Seis tamaños
de letra (12, 14, 17, 22, 32 y 52 px). Piso de toque de 44 px. Radios: panel 16, botón 12. Movimiento:
`--t-tap` 100 ms, `--t-hover` 160, `--t-toast` 200, `--t-sheet` 260, `--t-float` 1100, curva
`--ease-out`. Letra Fredoka 500 y 600, empaquetada. Un solo tema: el HUD flota sobre una escena 3D
que ya tiene su propia luz. La paleta 3D vive en `C` de `src/models.js`. Los íconos del HUD son
miniaturas sacadas de los mismos modelos 3D, más unos pocos trazos SVG propios; nunca emoji.

**Controles.** `npm test`: motor (economía, pedidos, niveles, guardado, azar con semilla) y catálogo
de frases (claves y huecos iguales en todos los idiomas, ninguna frase pedida que falte ni sobre,
voseo, sin exclamaciones). `npm run shots`: sobre el juego armado y dibujado mide solapes y paneles
fuera de la ventana (caja pintada), tamaños de letra contra los seis de la ficha, la letra que cargó,
toque mínimo, nombre de cada control, clases sin regla, textos sin resolver, bloques de prosa, y que
cada herramienta tenga su miniatura; además juega con clics y toques de verdad (construir, ampliar,
perder, elegir local cerrado y abierto y jugar cada local nuevo, guardar, recargar y continuar, cambiar de partida). `node tools/mutate.mjs`: rompe el código
de a una cosa y exige que `npm test` se ponga rojo. `node tools/mutate.mjs --check` sólo comprueba que el texto de cada
mutación siga apareciendo una vez en su archivo (tarda un segundo y no corre ninguna prueba).

**Componentes.** `box`/`cyl`/`stack`/`progressBar`/`outArrow` en `src/models.js` para armar modelos;
`buildMachine(kind)`, `buildItem(item)`, `burger(receta)`. En el HUD (`src/hud.js`): `stat`, `btn`,
`tool`, `img` (miniatura), `plan(local)` (mini plano SVG desde la máscara), `confirm(título, consecuencia, acción)`, `toast`, `floater`, `pct` (proporción
como «62 %»). Diagnóstico en `src/sim.js`: `diagShares(celda)` (proporciones `{ work, blocked, wait, idle }`
o null), `bottleneck(s)` (`{ x, y, kind, shares, upstream }` o null), `upstreamBlocked(s, x, y)`, `lost(s)`
(perdidos por plazo más por cola llena). En la escena, `setJams(on)` y `shownJams()` (para el arnés).
Reparto en `src/sim.js`: `pendingNeed(s, ingrediente)` (lo que pide la cocina), `sourceNeed(s, x, y)` (lo que tiene que soltar
la fuente a demanda o el almacén de esa celda), `isStuck(s, x, y, slot)` (`slot` `'item'` o `'item2'`, el carril vertical del puente).
`BRIDGE_TOP` en `models.js` (altura del carril alto del puente, la usa `SURFACE` de la escena).
Fila de clientes en `src/crowd.js` (vista pura, sin three ni DOM, probada con node): `orderRisk(pedido, tiempo)`
(`''`, `'soon'`, `'late'`: la usan la tarjeta y la marca del cliente), `curb(terreno)` (la vereda: carriles,
cabeza de la fila, entrada y salida), `newCrowd()`, `stepCrowd(crowd, pedidos, eventos, tiempo, dt, vereda, quieto)`.
`buildCustomer(look)` en `models.js`; `shownCustomers()` en la escena (para el arnés).
Mejoras en `src/sim.js`: `upgrade(s, x, y)` (mismo contrato que `place`: `ok` o `reason` `'out' | 'none' | 'done' | 'money'`),
`upgradeCost(s, kind)`, `refund(s, celda)` (la mitad de máquina más mejora: el único lugar que calcula un reembolso), y los
valores de la celda `burners(c)`, `stockCap(c)`, `assembleTime(c)`. `buildMachine(kind, up)` arma el modelo mejorado.
Indicador de mejora: `upgradeHint(s)` en `sim.js` (`{ x, y, kind }` o null: el cuello de botella cuando trabaja desde
`DIAG.busy`, tiene mejora sin comprar y la plata alcanza); en la escena, `setHint(celda)` y `shownHint()` (para el arnés).
Puente: `bridgeFlow(s, x, y)` en `sim.js` (`[esteOeste, norteSur]`, la dirección en que corre cada carril o null si nada entra).
Locales: `lotOf(clave, semilla)` en `sim.js` es la única puerta a un local de Carrera como datos (el de `LOTS`, o el generado).
Vista: `scene.turn(s, inset, q)` (gira un cuarto, devuelve `rot`), `setTurn(rot)`, `viewTurn()`; `ui.rot` en `main.js`.
Dirección de pantalla = `(dirección del mundo + rot) % 4`.
Deshacer en `sim.js`: `undoMark(s)` (abre un grupo: lo que se construye hasta el próximo se deshace junto), `undo(s)`
(`{ ok, n }` o `reason` `'none' | 'late' | 'money'`), `canUndo(s)`; `s.undo` es una lista de grupos de acciones
`{ x, y, t, prev, money, keep }`. Filtro: `setPick(s, x, y, tipo)` (`ok` o `reason` `'out' | 'fixed' | 'same'`), `PICKS` en
`data.js`, `exits(c, d, tipo)`. Grupos: `GROUP` en `data.js`, pedido con `group`, evento `tip` con `{ x, y, amount }`.
Topes: `LIMITS` en `data.js`; `countOf(s, tipo)`, `limitOf(s, tipo)` (`Infinity` fuera de Carrera o sin tope), `nextLimit(s, tipo)`
(el nivel en que entra otra, o null); `place` puede dar `reason: 'limit'`. Ritmo: `ORDERS` y `orderInterval(nivel)` en `data.js`.
Una máquina nueva con tope se anota también en `LIMITS`.
Desafíos en `src/sim.js`: `puzzleStars(s)` (`{ won, spent, belts, spendOk, beltsOk, stars }`), `puzzleOpen(clave, estrellas)`;
en el HUD, `stars(n, total)` (estrellas llenas y huecas en SVG) y `showPuzzleEnd(s, siguiente)`.

**Idiomas.** Español (origen, voseo, sin exclamaciones) e inglés. Mecanismo: `STRINGS` y `t()` en
`src/i18n.js`; `t()` tira error si la clave no existe y la prueba compara idiomas.

**Arnés.** Lo que se corre antes de subir: `node --test --test-concurrency=1` (148 pruebas, entre medio minuto y minuto y medio), `npm run build`
(1 s, y falla si un módulo importa un nombre que no existe) y `node tools/mutate.mjs --check`. `npm run shots` NO se corre
más en la máquina del dueño: dos corridas en paralelo con WebGL por software la reiniciaron (2026-11-12), y las capturas no
se vuelven a tomar. Lo que el arnés medía en pantalla lo mira el dueño jugando, después de publicar. `tools/shots.mjs`
queda en el repositorio como estaba: su última corrida completa, antes de la ronda de testers, midió 120 pantallas; los
pasos que sumó esa ronda (vista girada, deshacer, filtro, La sorpresa y su enlace, barra del teléfono) están escritos y
nunca corrieron. Quien lo corra en otra máquina, que espere fallas del propio arnés. Sus capturas iban a `shots/`, entre ellas la capa de atascos prendida con un clic, el divisor y el puente puestos con clics,
el inspector de la parrilla sin plata para mejorarla y ya mejorada, y el primer desafío resuelto con clics hasta su hoja de cierre. Corre con WebGL por software. El
recorrido comprueba tres veces que la fila de la vereda es la cola de pedidos, en orden, en su lugar y sin panel encima. `npm run shots -- phone-es` corre una sola.

**Inscripciones.** Una máquina nueva se anota en: `KINDS` y `BUILD_ORDER` (`data.js`); `accepts`,
`receive`, `process` u `output` (`sim.js`); su caso en `cellState` (`sim.js`: cuándo trabaja, está
bloqueada, espera o está libre); `builders` (`models.js`); `SURFACE` si apoya productos
(`scene.js`); `inspectorText` (`hud.js`); `kind_`, `kindLong_`, `kindHint_` en los dos idiomas.
Si lleva productos de paso (como cinta, divisor y puente): `carries: true` en `KINDS` (la saca del cuello de botella y de las
proporciones del inspector, la mueve en `step` y la cuenta como lo que viaja), su caso en `exits` y en `receive` (`sim.js`),
y el arrastre de cinta en `main.js` pasa por encima sin reemplazarla. Si girarla no cambia nada, `noTurn: true` (queda en
dirección 0, el inspector no ofrece Girar). Una fuente a demanda nueva se regula con `sourceNeed`.
Si la pieza elige por tipo de producto (como el filtro), todo recorrido de celdas de paso le pasa el tipo a `exits` cuando
lo conoce (`carry`, `arrives`, `reach`, `isStuck`, el reparto). Toda acción nueva que construye anota su deshacer (`note`
en `sim.js`) y quien la dispara en `main.js` llama antes a `sim.undoMark`.
La barra de herramientas sale de `BUILD_ORDER` y con el filtro son quince botones. En notebook cada herramienta toma el
ancho de su nombre (`style.css`). En teléfono parado es una grilla de 7 por 2 sin desplazamiento, y «Ampliar» sale de la
grilla a la barra de arriba, dentro de «más»; en apaisado, grilla de 3 por 5. Una pieza más ya no entra en ninguna de las
dos grillas: antes de sumarla hay que decidir qué sale o cómo se agrupa. En notebook los botones de la barra de arriba van sólo
con ícono (el nombre queda en `title` y `aria-label`) para que entre en un renglón.
Una forma nueva de que un pedido deje la cola: su evento con `id` y su motivo de salida en `stepCrowd` (`crowd.js`);
sin evento, el cliente desaparece en el acto. Una forma nueva de local: su frente en `curb` (`crowd.js`).
Una mejora: `UPGRADES` (`data.js`), su valor de celda en `sim.js` (como `burners`/`stockCap`/`assembleTime`, y todo lugar que
lea el valor base pasa a leer ése), su pieza en el constructor del modelo (`builders[kind](up)`), y `upHint_`/`upDone_` en los
dos idiomas (familia en `test/i18n.test.js`).
Una receta: `RECIPES`, `SANDBOX_DEADLINE` y `recipe_`. Un ingrediente: `INGREDIENTS`, `SOURCE_OF`,
`buildItem`, `item_` y la familia en `test/i18n.test.js`.
Un local nuevo se anota en: `LOTS` (tamaño, `holes`, `pillars`, `kitchen`, `fixed`, `grow`, `unlock`) y, si es de
Carrera, `CAREER_LOTS` (`data.js`); `lot_` en los dos idiomas; su prueba de primera entrega sale sola de `CAREER_LOTS`
en `test/lots.test.js`. Los agujeros van arriba o a la izquierda (ampliar suma piso a la derecha y abajo).
Un local generado lleva `gen: true` en `LOTS` y sale de `generateLot(semilla)` (`sim.js`, rangos en `LOTGEN`); nadie fuera
de `sim.js` lee `LOTS[clave]` de un local de Carrera: pasa por `lotOf`.
Lo que depende de hacia dónde mira la cámara (flecha de Girar, leyenda de la herramienta, flechas del teclado, WASD) pasa
por `ui.rot`; lo que trabaja en celdas (arrastre de cinta, fantasma) no.
Un desafío nuevo se anota en: su local en `LOTS` con la misma clave (prefijo `pz`), su fila en `PUZZLES` (`budget`, `orders`
como `[segundo, receta]`, `limit`, `spend`, `belts`; el orden de la tabla es el del inicio), `puzzle_` en los dos idiomas, y
su solución en `SOLUTIONS` de `test/puzzles.test.js`: la prueba la juega y exige tres estrellas, y exige que sin hacer nada
no se gane. Si enseña una pieza, una prueba del atajo sin esa pieza que pierde. Ningún desafío entra sin solución que pase.

**Circuito.** Un dato del juego vive en el estado de `sim.js`, viaja al guardado con `serialize`,
vuelve con `deserialize` (que descarta versiones viejas: subir `SAVE_VERSION` al cambiar la forma),
y se lee en el HUD (`hud.js`) o en la escena (`scene.js`). Lo que no es del juego sino de la vista
(herramienta, dirección, selección, velocidad) vive en `ui` de `main.js` y no se guarda.

**Invariantes.**
- La simulación (`sim.js`, `data.js`) no toca DOM, three ni el reloj: paso fijo de 0,1 s y azar con semilla guardada.
- La plata va en enteros.
- La escena y el HUD dibujan el estado; no deciden nada del juego. Lo que pasa se anuncia en `state.events`.
- Todo el balance está en `data.js`.
- En Carrera los clientes piden sólo lo que la cocina ofrece (receta desbloqueada y con sus fuentes).
- Ampliar el terreno no mueve nada de lo construido, y lo que no era piso sigue sin serlo.
- Una celda que no es piso vale `false` en `s.cells` (null es piso vacío): `valid` la rechaza y `at` la da null, así queda
  inerte en todo recorrido del motor. Una máquina fija (`fixed` en la celda) no se borra, ni se reemplaza, ni se gira.
- Girar una máquina es gratis y no pierde su contenido.

**Lecciones.**
- Dos catálogos con la misma clave (`cheese` receta y `cheese` máquina) se pisaron en las miniaturas: la herramienta Queso mostraba una hamburguesa. Las claves de receta llevan prefijo `recipe_`, y el arnés compara miniaturas.
- Un control sobre un conjunto vacío dio verde: el medidor de letra miraba el HUD escondido detrás del inicio. Ahora falla si no midió ningún texto.
- La prueba que medía plata mientras el juego corría falló sólo en la corrida lenta. Lo que se mide, se mide en pausa.
- En el teléfono el HUD del escritorio apretado tapaba toda la cocina. La compacta es otra composición: barra de arriba plegable, y en apaisado las herramientas y los pedidos van a los costados.
- Borrar la cinta que llevaba una hamburguesa dejaba el pedido colgado para siempre (venía del prototipo). Ahora vuelve a la cola.

- Los modelos de los productos se guardaban por número y el número se repite entre partidas: al continuar otra partida, un queso se dibujaba como carne. Lo que se cachea por identificador se vacía al cambiar de partida.
- En Chrome el segundo Esc cierra una hoja aunque se cancele el primero: el inicio se cerraba y no quedaba cómo empezar. Una hoja que no se puede cerrar se vuelve a abrir en su `close`.
- Una prueba de toque midió las coordenadas antes de que el primer toque corriera la vista, y culpó al juego. Las coordenadas se miden justo antes de usarlas.
- Una espera sobre un juego en pausa no llega nunca. La condición y lo que depende de ella van en el mismo instante.
- Un bucle `while (s.time < T)` sobre una partida que cierra no termina: `step` ya no avanza. Todo bucle de prueba lleva `!s.over`.
- Los campos numéricos que se actualizan en cada paso se escriben por nombre (`d.work *= k`), no con `for…in`: el acceso por clave costaba el doble.
- Una espera de prueba «hasta que ya no esté» dio verde antes del primer paso: sobre la lista vacía, «nadie con ese número» es cierto. La condición se evalúa después de avanzar.
- Un editor dejó diez archivos con fin de línea CRLF en una copia de trabajo y el mutador marcó 21 mutaciones como VIEJA: sus textos de varios renglones no aparecían. El repositorio guarda LF (`.gitattributes`), pero el mutador lee el disco. Antes de creerle a una VIEJA se cuentan los `` por bytes (`tr -cd`), no con `grep` dentro de `$( )`, que en Git Bash los pierde y cuenta todos los renglones.
- El reparto del plan (cada pedido a la armadora que más lo cubre, menos todo lo que viaja) trababa con un pan compartido
  por divisor: el pan que esperaba en la cinta de una armadora llena tapaba la necesidad de la otra. Lo que va de paso
  hacia una sola armadora cuenta como inventario de ésa, no como suelto; la prueba de propiedad lo encontró.
- Con la necesidad de toda la cocina, en dos líneas separadas la segunda juntaba carne y nunca recibía pan: el pan de la
  primera se recorre antes y salía siempre. Cada fuente mira las armadoras a las que llega su salida.
- La barra de herramientas ya no entraba en 1024 px antes de sumar piezas (Girar cortado, Ampliar oculto) y el arnés no
  lo marcaba porque la barra se desplaza. Se miró la captura.
- En un desafío con la cola llena, esperar a que haya lugar corría el plazo del pedido y una cocina a media velocidad ganaba
  el desafío del divisor. El cliente que encuentra la cola llena pierde el desafío.
- `hidden` no esconde un panel con `display: flex` propio: hace falta `[hidden] { display: none; }` (pasó con «Pedir»).
- La niebla de la escena tenía distancias fijas (60 a 140) y el encuadre no: en teléfono parado o con el local ampliado la
  cámara quedaba más lejos que la niebla y todo se veía oscuro. Lo que depende de la distancia de la cámara se mira en la
  pantalla más angosta y con el local más grande.
- Un comando encadenado con `&&` corrió el mutador entero cuando el paso anterior había fallado a medias, y el tope de
  tiempo lo cortó con `src/sim.js` mutado. El mutador se corre solo, nunca al final de una cadena, y después de un corte
  se mira `git diff` de los archivos que muta.
- Dos corridas del arnés de capturas lanzadas a la vez (dos Chrome con WebGL por software) reiniciaron la PC del dueño.
  Una verificación que puede tumbar la máquina de quien la presta no se corre: se reemplaza por pruebas, armado y lectura.
- Una expresión regular escrita por un agente perdió su barra invertida (`\d` quedó `d`) y `#sala=` no leía ningún número;
  `node --check` no lo ve. Lo que lee una URL lleva su comprobación en el arnés con una URL de verdad.
- En la hoja de cierre, dos oraciones nuevas van en un solo párrafo: el arnés cuenta bloques de prosa. Un renglón de datos (proporciones del inspector) va como `.stat`, no como párrafo.

**Entrega.** `npm run build` deja el juego en `dist/`, con rutas relativas: se sirve desde cualquier
carpeta. Las capturas quedan en `shots/`. El repositorio está en GitHub (`origin`). `.github/workflows/deploy.yml`
publica `dist/` en GitHub Pages con cada push a `main`, después de correr `npm test`. Nadie ve el juego dibujado antes
de publicar: la prueba en pantalla es el QA del dueño sobre lo publicado, y lo que encuentra entra en la ronda siguiente.

**Decidido.**
- three.js y no Flutter: Flutter no tiene un 3D maduro para sombras, materiales y cámara; el prototipo ya era web.
- Gráficos hechos a mano con primitivas (cajas redondeadas, cilindros, texturas de lienzo): sin archivos de arte.
- La simulación conserva las reglas del prototipo; cambian los tiempos (parrilla 5 s, armado 4 s) para que la presión exista.
- Tres modos: Carrera (economía, niveles, reputación, final), Modo libre (el prototipo: todo gratis, pedidos a mano, sin final)
  y Desafíos (`puzzle`). Un desafío: presupuesto fijo (las entregas no suman; borrar devuelve todo, `PUZZLE_REFUND`), piezas
  dadas fijas, pedidos por guion sin azar con el plazo de Carrera, sin reputación ni niveles ni ampliar ni pedir a mano;
  empieza en pausa para armar. Se gana al entregar todos a tiempo; se pierde al vencerse uno, al llegar uno con la cola
  llena o al pasar el límite (`s.result`, evento `puzzleEnd`). Estrellas: ganar, gastar como mucho `spend`, terminar con
  como mucho `belts` cintas (las dadas cuentan). Un desafío no se guarda a medias; las mejores estrellas van en
  `bb.puzzles` y cada uno se abre con una estrella en el anterior. `isCareer` decide niveles, reputación y azar; `paid` (no
  libre) decide costos y plazos.
- La cinta toma la dirección del arrastre; `R` sigue girando a mano.
- Los paneles del HUD llevan sombra y la barra de construcción flota centrada: flotan de verdad sobre una escena 3D.
- El aviso rojo en una cinta es sólo para un producto sin salida, no para una cinta frenada por una máquina llena.
- La armadora elige el pedido más urgente que pueda completar (regla del prototipo): una doble puede esperar mientras salen simples.
- Sin sonido por ahora.
- Locales con forma: la forma es el nivel. Un local es datos (`LOTS`) y no sabe de modos, para que un desafío sea un local
  más. El clásico es la Carrera de antes, celda por celda; el Modo libre conserva su terreno (`LOTS.sandbox`). Cada local
  se abre con nivel 4 en el anterior, leído del récord, que es por local (`best.<local>`; el de El clásico sigue en `best`).
  El récord se escribe al cerrar la cocina, como antes: llegar al nivel 4 y salir sin perder todavía no abre el siguiente.
- Diagnóstico de cuello de botella: cada celda lleva `diag` (segundos recientes en trabajo, bloqueo, espera y
  libre), que decae con `DIAG.tau` = 60 s y se actualiza al final de `step` leyendo lo que quedó en la celda.
  Se guarda, girar lo conserva, reemplazar o borrar lo pierde. El cuello es la máquina (no cinta) con más
  trabajo; con empate (`DIAG.tie`) gana la que tiene más bloqueo aguas arriba; bajo `DIAG.minWork`, ninguna.
  Una línea cortada aguas abajo señala igual a la que más trabajó: la causa la muestra la capa de atascos.
- La capa de atascos es vista (`ui.jams`, no se guarda): rombo ámbar con dos barras sobre cada celda con
  bloqueo desde `DIAG.jam`. El botón va en la barra de arriba como secundario (en compacta, dentro de «más»).
- `stats.expired` cuenta sólo plazos vencidos y `stats.turnedAway` la cola llena; «Perdidos» muestra `lost(s)`.
- Clientes visibles: una persona por pedido en la vereda del frente (`curb`), en orden de llegada con la cabeza hacia la
  derecha; llegan por la izquierda, al cobrar reciben su bolsa y salen por la derecha, al vencer vuelven por la izquierda con el estallido
  de enojo; con la cola llena uno llega por el carril de afuera, mira y se vuelve enojado. Marcas: círculo verde con
  tilde (a tiempo), triángulo ámbar con «!» (por vencer), cuadrado rojo con reloj (vencido), estallido (enojo). Caminan en
  tiempo de juego (en pausa quietos, con 6× a 6×). Con movimiento reducido o al cambiar de partida, cada uno en su lugar
  sin caminar. La escena recibe los eventos del cuadro en `render(…, events)`; `delivered` lleva `id`.
- Reparto entre armadoras (`share` en `sim.js`, sin estado nuevo: se recalcula cada vez). Lo que va de paso hacia una sola
  armadora cuenta como su inventario; lo que puede ir a varias o a ninguna queda suelto. Cada pedido en espera, el más urgente
  primero, va a la armadora que más lo cubre; con empate, a la menos cargada (arma, tiene salida o ya recibió pedidos en este
  reparto); si no, a la primera. `pendingNeed` es la suma de lo que les falta menos lo suelto; `sourceNeed` es lo mismo pero
  sólo sobre las armadoras a las que llega la salida de esa celda (si no llega a ninguna, vale `pendingNeed`, como antes).
  Con una sola armadora las dos dan exactamente la cuenta de antes (lo prueba `test/split.test.js`). La armadora sigue
  eligiendo el pedido más urgente que pueda completar: el reparto sólo regula a las fuentes y al almacén.
  Un producto de paso cuenta como suelto sólo si puede llegar a algo que lo reciba (`arrives`): lo varado en una cinta
  sin salida no cuenta como que viaja. Es el único caso en que una sola armadora se aparta de la cuenta vieja, que ahí
  se trababa; lo encontró la prueba de cocinas mixtas (un divisor con un costado a una cinta muerta).
- Divisor (`splitter`, $35): recibe sólo por atrás, lleva un producto como una cinta y lo saca por turnos (`turn`) entre
  frente, costado derecho y costado izquierdo; una salida que no recibe ese producto o está llena se saltea y el turno
  sigue a la que lo recibió. Sin ninguna salida posible se marca sin salida como una cinta.
- Puente (`bridge`, $60): carril este-oeste en `item` (bajo) y norte-sur en `item2` (alto); cada producto guarda en `d` hacia
  dónde viaja y sale por el lado opuesto. No gira: queda en dirección 0. A la vista: el carril bajo pasa como una cinta por
  el arco de dos vigas de acero, y el alto es una pasarela con rampas; cada carril lleva la goma de flechas corriendo en su
  sentido real (`bridgeFlow`) o goma lisa si nada entra por él, y el producto sube y baja por las rampas.
- Sin registro de actividad: los testers no le vieron uso y ocupaba pantalla. Se borró del estado, del HUD y de las frases;
  lo que pasa se sigue anunciando en `state.events` (avisos, flotantes, fila de clientes).
- Girar la vista: en cuartos, con el botón de la barra de arriba (siempre visible, también en compacta) o con Q y E, con
  una animación corta (sin ella con movimiento reducido). Gira alrededor de lo que se está mirando; si la vista estaba
  encuadrada, vuelve a encuadrar. Desde el norte la pared alta del fondo se esconde y queda su zócalo. Cada partida
  empieza con la vista de siempre. La vista no se guarda.
- Sin niebla en la escena: con distancia fija oscurecía todo al alejar (local ampliado, teléfono parado).
- Indicador de mejora: marca dorada con flecha sobre la máquina de `upgradeHint`, y un aviso la primera vez por tipo de
  máquina en cada partida. No cambia la herramienta: quien la toca con Inspeccionar llega a «Mejorar».
- La bolsa: el cliente que cobró espera `CROWD.grab` en su lugar mirando a la cocina mientras una bolsa viaja en arco desde
  el despacho que entregó, y se va con ella en la mano. El enojado y el de la cola llena no llevan bolsa.
- Barra de herramientas en compacta: grilla sin desplazamiento (7 columnas en teléfono parado, 3 en apaisado), cada botón
  con su dibujo y sin nombre; el nombre, el precio y hacia dónde va a apuntar la pieza van en un renglón de leyenda arriba.
- La sorpresa (`random`): local de Carrera generado con semilla (tamaño, una muesca o ninguna, columnas sueltas y la línea
  de El clásico trasladada y a veces espejada; ninguna columna toca la cocina inicial). La semilla de la sala es también la
  de los pedidos: misma sala, mismos clientes. Va en la URL (`#sala=<número>`), con «Otra sala» y «Copiar enlace» en el
  inicio. El récord es por local, sin distinguir semilla. Está abierta desde el principio y fuera de la cadena de
  locales: un enlace compartido no puede recibir a nadie con un candado.
- Deshacer: revierte el último gesto de construcción (pieza nueva, reemplazo, giro, borrado, mejora; un arrastre entero
  es un gesto) y devuelve la plata exacta, no la mitad. Vale `UNDO.window` segundos de juego desde la acción: sin ese
  plazo, usar una máquina un rato y deshacerla sería un alquiler gratis. En pausa el plazo no corre. La máquina que vuelve
  viene vacía; lo que la acción había perdido no se recupera. Ampliar no se deshace. El botón «Deshacer» aparece arriba,
  junto al cartel de pausa, sólo mientras hay algo que deshacer; también Z y Ctrl+Z.
- Filtro (`filter`, $45): recibe sólo por atrás y lleva un producto como una cinta. El ingrediente elegido (`pick`, uno
  de `PICKS`) sale por los costados por turnos y nunca por el frente; todo lo demás sale por el frente y nunca por un
  costado. Se elige desde el inspector («Cambiar ingrediente»), gratis y sin perder el contenido. A la vista: la base del
  divisor más un cartel en la esquina de atrás con el ingrediente en miniatura.
- Grupos: en Carrera, desde el nivel `GROUP.level`, una llegada de cada cuatro (`GROUP.chance`) trae dos clientes juntos,
  si hay lugar para los dos. Son dos pedidos comunes con su plazo; si los dos salen a tiempo dejan `GROUP.tip` de
  propina. Después de un grupo se saltea la llegada siguiente: el ritmo promedio no cambia, cambia que hay tandas. Bajo
  el nivel no se tira ese azar, así las partidas de nivel 1 y 2 son las mismas de antes para la misma semilla. Nació de
  «pedidos de a varios»: se descartó el pedido de varias hamburguesas que debían salir juntas, por difícil de coincidir.
- Marca a batir: el enlace de una sala puede llevar `&nivel=<n>`. El inicio dice «Te desafían a pasar el nivel n» y la
  hoja de cierre dice si se pasó; desde esa hoja se copia el enlace con la marca propia. Sin servidor: la marca viaja en
  el enlace y nadie la comprueba.
- Topes por nivel (`LIMITS`, sólo Carrera): un despacho en todo el juego; una fuente de cada ingrediente, una parrilla, un
  almacén y una armadora al empezar, y una más de cada una en los niveles de su lista. Cintas, divisor, filtro y puente no
  tienen tope. Nació de una medición: dos «islas» de 7 celdas sin ninguna cinta (carne, parrilla, almacén, armadora y
  despacho en fila, pan y queso pegados a la armadora) jugaban 30 minutos, llegaban al nivel 21 y no perdían un cliente.
  Con una sola fuente y un solo despacho la isla no se copia: crecer es repartir y juntar. La herramienta que llegó a su
  tope se ve apagada y dice «Tope»; el intento avisa cuándo se habilita otra, y subir de nivel dice qué se habilitó
  (`levelup.more`). Deshacer restaura sin mirar el tope, y una partida guardada con piezas de más no se recorta.
- Ritmo sin techo (`ORDERS`): los niveles 1 a 5 como siempre (13, 10,5, 8, 5,5 y 3,5 s entre clientes); desde el 6 cada
  nivel espera un 12 % menos. Antes el ritmo quedaba fijo en 3,5 s y pasado el nivel 5 el juego se ponía más fácil (los
  testers pedían a mano). Ahora toda cocina cierra y el puntaje es el nivel. Medido con plata de sobra: la isla sola
  cierra en el nivel 6 o 7 a los 6 minutos; con parrilla y armadora mejoradas, en el 9 o 10 a los 8; la cocina inicial de
  El clásico sin tocar, en el 7 a los 6.
- Sigue abierto: una sola isla mejorada todavía llega al nivel 9 sin cintas, porque una máquina le pasa el producto a la de
  al lado. Si los testers siguen armándola, las palancas que quedan son que todo viaje por cinta, o proveedores contra la
  pared del fondo y despacho al frente. Son reglas del prototipo: se cambian con permiso.
- Descartada una segunda familia de producto (freidora por tandas): no le gustó al dueño del juego.
- Diez desafíos. Los cuatro de la segunda tanda combinan piezas ya enseñadas: El cruce (un solo puente alcanza si pan y
  queso viajan juntos), El rodeo (despacho rodeado de columnas), El cuello (mejorar la armadora, no la parrilla) y El
  examen (una parrilla nueva sale más barata que la mejora). El almacén no tiene desafío: con el motor actual una cinta
  en su lugar gana igual, porque la armadora ya junta ocho carnes.
- Arrastre: la cinta pasa por encima de divisores y puentes (así se dibuja la segunda línea a través del puente), también
  cuando el arrastre empieza encima de uno; un toque sí los reemplaza, y se decide al soltar. Divisor y puente se ponen de a uno, con la dirección de `R`.
- Mejoras (`UPGRADES`): parrilla de doble hornalla ($140, dos carnes a la vez), armadora con segundo brazo ($180, 2,5 s),
  almacén con estantes ($60, 16 carnes). Un solo nivel: `up` (booleano) en la celda; se guarda, girar lo conserva, reemplazar
  o borrar lo pierde; borrar devuelve la mitad de máquina más mejora; en Modo libre es gratis. Se compra con «Mejorar» en el
  inspector: la consecuencia va escrita en el cuerpo, antes del botón; sin plata el botón se ve corto y su precio dice cuánto
  falta (además del rojo) y el toque avisa con `toastNoMoney`; mejorada, el inspector lo dice y el botón no está. A la vista:
  banderín dorado en la esquina de atrás (no gira con la máquina), segundo brazo, estantes con parantes, segunda carne en la
  parrilla. La escena cachea el modelo con clave `kind` más `+` si está mejorada.
- Parrilla: `cooking` es un arreglo, una entrada por hornalla ocupada, de la más vieja a la más nueva, con los segundos que le
  faltan; 0 es lista sin lugar (reintenta en cada paso). Con una hornalla se comporta exactamente como el viejo `processing`.
  El reloj por carne de la etapa 5 se monta dejando que la entrada siga bajando de 0 (su edad es el negativo) en lugar de fijarla.
- Ninguna máquina de estados explícita: se auditaron ocho (pedido, parrilla, armadora, sesión, gesto, HUD, cachés de la escena) y todas son chicas o derivadas. Lo que las cuida es el invariante de `test/sim.test.js` y los comentarios de fase en `sim.js` y `main.js`.

**Con permiso.** Publicar el juego, crear el repositorio o hacer commits, cambiar el nombre «Burger
Belt», cambiar las reglas heredadas del prototipo, agregar una dependencia.
