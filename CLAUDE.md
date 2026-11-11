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
perder, guardar, recargar y continuar, cambiar de partida). `node tools/mutate.mjs`: rompe el código
de a una cosa y exige que `npm test` se ponga rojo.

**Componentes.** `box`/`cyl`/`stack`/`progressBar`/`outArrow` en `src/models.js` para armar modelos;
`buildMachine(kind)`, `buildItem(item)`, `burger(receta)`. En el HUD (`src/hud.js`): `stat`, `btn`,
`tool`, `img` (miniatura), `confirm(título, consecuencia, acción)`, `toast`, `floater`, `pct` (proporción
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

**Idiomas.** Español (origen, voseo, sin exclamaciones) e inglés. Mecanismo: `STRINGS` y `t()` en
`src/i18n.js`; `t()` tira error si la clave no existe y la prueba compara idiomas.

**Arnés.** `npm run check` = `npm test` (1 s) → `npm run build` (1 s) → `npm run shots` (unos 9 min:
6 corridas, 72 capturas en `shots/`, entre ellas la capa de atascos prendida con un clic, el divisor y el puente puestos con clics,
y el inspector de la parrilla sin plata para mejorarla y ya mejorada, WebGL por software; el
recorrido comprueba tres veces que la fila de la vereda es la cola de pedidos, en orden, en su lugar y sin panel encima). `npm run shots -- phone-es` corre una sola.

**Inscripciones.** Una máquina nueva se anota en: `KINDS` y `BUILD_ORDER` (`data.js`); `accepts`,
`receive`, `process` u `output` (`sim.js`); su caso en `cellState` (`sim.js`: cuándo trabaja, está
bloqueada, espera o está libre); `builders` (`models.js`); `SURFACE` si apoya productos
(`scene.js`); `inspectorText` (`hud.js`); `kind_`, `kindLong_`, `kindHint_` en los dos idiomas.
Si lleva productos de paso (como cinta, divisor y puente): `carries: true` en `KINDS` (la saca del cuello de botella y de las
proporciones del inspector, la mueve en `step` y la cuenta como lo que viaja), su caso en `exits` y en `receive` (`sim.js`),
y el arrastre de cinta en `main.js` pasa por encima sin reemplazarla. Si girarla no cambia nada, `noTurn: true` (queda en
dirección 0, el inspector no ofrece Girar). Una fuente a demanda nueva se regula con `sourceNeed`.
La barra de herramientas sale de `BUILD_ORDER`: con catorce piezas entra en 1024 px porque en notebook cada herramienta
toma el ancho de su nombre (`style.css`); en teléfono se desplaza.
Una forma nueva de que un pedido deje la cola: su evento con `id` y su motivo de salida en `stepCrowd` (`crowd.js`);
sin evento, el cliente desaparece en el acto. Una forma nueva de local: su frente en `curb` (`crowd.js`).
Una mejora: `UPGRADES` (`data.js`), su valor de celda en `sim.js` (como `burners`/`stockCap`/`assembleTime`, y todo lugar que
lea el valor base pasa a leer ése), su pieza en el constructor del modelo (`builders[kind](up)`), y `upHint_`/`upDone_` en los
dos idiomas (familia en `test/i18n.test.js`).
Una receta: `RECIPES`, `SANDBOX_DEADLINE` y `recipe_`. Un ingrediente: `INGREDIENTS`, `SOURCE_OF`,
`buildItem`, `item_` y la familia en `test/i18n.test.js`.

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
- Ampliar el terreno no mueve nada de lo construido.
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
- El reparto del plan (cada pedido a la armadora que más lo cubre, menos todo lo que viaja) trababa con un pan compartido
  por divisor: el pan que esperaba en la cinta de una armadora llena tapaba la necesidad de la otra. Lo que va de paso
  hacia una sola armadora cuenta como inventario de ésa, no como suelto; la prueba de propiedad lo encontró.
- Con la necesidad de toda la cocina, en dos líneas separadas la segunda juntaba carne y nunca recibía pan: el pan de la
  primera se recorre antes y salía siempre. Cada fuente mira las armadoras a las que llega su salida.
- La barra de herramientas ya no entraba en 1024 px antes de sumar piezas (Girar cortado, Ampliar oculto) y el arnés no
  lo marcaba porque la barra se desplaza. Se miró la captura.
- En la hoja de cierre, dos oraciones nuevas van en un solo párrafo: el arnés cuenta bloques de prosa. Un renglón de datos (proporciones del inspector) va como `.stat`, no como párrafo.

**Entrega.** `npm run build` deja el juego en `dist/`, con rutas relativas: se sirve desde cualquier
carpeta. Las capturas quedan en `shots/`. El repositorio está en GitHub (`origin`). `.github/workflows/deploy.yml`
publica `dist/` en GitHub Pages con cada push a `main`, después de correr `npm test`; la corrida del
navegador (`npm run shots`) no corre ahí: se corre a mano antes de subir.

**Decidido.**
- three.js y no Flutter: Flutter no tiene un 3D maduro para sombras, materiales y cámara; el prototipo ya era web.
- Gráficos hechos a mano con primitivas (cajas redondeadas, cilindros, texturas de lienzo): sin archivos de arte.
- La simulación conserva las reglas del prototipo; cambian los tiempos (parrilla 5 s, armado 4 s) para que la presión exista.
- Dos modos: Carrera (economía, niveles, reputación, final) y Modo libre (el prototipo: todo gratis, pedidos a mano, sin final).
- La cinta toma la dirección del arrastre; `R` sigue girando a mano.
- Los paneles del HUD llevan sombra y la barra de construcción flota centrada: flotan de verdad sobre una escena 3D.
- El aviso rojo en una cinta es sólo para un producto sin salida, no para una cinta frenada por una máquina llena.
- La armadora elige el pedido más urgente que pueda completar (regla del prototipo): una doble puede esperar mientras salen simples.
- Sin sonido por ahora.
- Diagnóstico de cuello de botella: cada celda lleva `diag` (segundos recientes en trabajo, bloqueo, espera y
  libre), que decae con `DIAG.tau` = 60 s y se actualiza al final de `step` leyendo lo que quedó en la celda.
  Se guarda, girar lo conserva, reemplazar o borrar lo pierde. El cuello es la máquina (no cinta) con más
  trabajo; con empate (`DIAG.tie`) gana la que tiene más bloqueo aguas arriba; bajo `DIAG.minWork`, ninguna.
  Una línea cortada aguas abajo señala igual a la que más trabajó: la causa la muestra la capa de atascos.
- La capa de atascos es vista (`ui.jams`, no se guarda): rombo ámbar con dos barras sobre cada celda con
  bloqueo desde `DIAG.jam`. El botón va en la barra de arriba como secundario (en compacta, dentro de «más»).
- `stats.expired` cuenta sólo plazos vencidos y `stats.turnedAway` la cola llena; «Perdidos» muestra `lost(s)`.
- Clientes visibles: una persona por pedido en la vereda del frente (`curb`), en orden de llegada con la cabeza a la
  derecha; llegan por la izquierda, al cobrar salen por la derecha, al vencer vuelven por la izquierda con el estallido
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
  dónde viaja y sale por el lado opuesto. No gira: queda en dirección 0.
- Arrastre: la cinta pasa por encima de divisores y puentes (así se dibuja la segunda línea a través del puente); un toque
  sí los reemplaza. Divisor y puente se ponen de a uno, con la dirección de `R`.
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
