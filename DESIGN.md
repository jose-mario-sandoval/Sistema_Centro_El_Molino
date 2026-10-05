# Centro El Molino: sistema de diseño

Neumorfismo accesible. Este documento es el contrato: define los tokens, las primitivas de relieve
y las reglas que cualquier pantalla debe cumplir. El prototipo de validación
(`docs/prototipo/centro-el-molino-neumorfico.html`) es su implementación de referencia.

Todos los valores de color de este documento están **verificados**, no estimados. El script que los
comprueba vive junto al prototipo; los ratios que aparecen abajo son su salida.

---

## 1. Principio rector

La app la usan personas mayores, algunas con poca soltura tecnológica, y es el **único** canal entre
quienes viven en la casa y quienes cocinan. Si alguien no entiende un control, no tiene forma de
avisar que hoy no come.

De ahí la única regla que manda sobre todas las demás:

> **La forma comunica la función, y nunca comunica sola.**

- **Elevado** = esto se toca.
- **Hundido** = esto ya está elegido, o es un campo donde escribís.
- **Plano** = esto solo se lee.

El relieve es una metáfora física, no un convenio aprendido: un botón que se hunde al elegirlo se
entiende sin explicación. Pero el relieve **nunca viaja solo**. Todo estado se comunica por canales
redundantes: relieve + color + icono + texto. Quitale el color y sigue leyéndose; quitale las
sombras y sigue leyéndose.

Por eso el neumorfismo puro no sirve acá: su gracia es justamente quitar bordes y contraste. Lo que
se conserva es su física; lo que se descarta es su ascetismo.

---

## 2. Color

Base **pergamino cálido**, heredada del proyecto. No es una decisión nostálgica: el neumorfismo
necesita un tono medio para que la sombra clara tenga a dónde ir. `#FFFFFF` no puede ser neumórfico;
`#F1EDE3` sí. Y evita el gris-lavanda frío con azul eléctrico que es el neumorfismo de stock.

**En neumorfismo, fondo y superficie son el mismo color.** No existe `--superficie`. Las tarjetas no
son blancas: son mesetas de pergamino elevadas.

### 2.1 Neutros y acentos

| Token | Claro / suave | Claro / alto | Oscuro / suave | Oscuro / alto |
|---|---|---|---|---|
| `--fondo` | `#F1EDE3` | `#F1EDE3` | `#252219` | `#252219` |
| `--tinta` | `#2A251E` | `#2A251E` | `#EDE7D8` | `#EDE7D8` |
| `--tinta-suave` | `#6E6555` | `#554E42` | `#B4AA95` | `#B5AC97` |
| `--tinta-tenue` | `#736A5A` | `#554E42` | `#928873` | `#B3AC9E` |
| `--acento` | `#3F5D46` | `#3A5540` | `#6E9A78` | `#94B49B` |
| `--dorado` | `#8C6432` | `#664924` | `#CBA063` | `#CEA66C` |
| `--peligro` | `#B4483A` | `#86352B` | `#D98C7F` | `#DE9C90` |

Ratios de contraste sobre `--fondo`, verificados:

```
CLARO suave   tinta 13.00  tinta-suave 4.91  tinta-tenue 4.56  acento 6.27  dorado 4.51  peligro 4.57
CLARO alto    tinta 13.00  tinta-suave 7.03  tinta-tenue 7.03  acento 7.04  dorado 7.06  peligro 7.02
OSCURO suave  tinta 12.88  tinta-suave 6.90  tinta-tenue 4.53  acento 4.96  dorado 6.62  peligro 6.06
OSCURO alto   tinta 12.88  tinta-suave 7.05  tinta-tenue 7.05  acento 7.01  dorado 7.03  peligro 7.01
```

Tres correcciones respecto de la paleta anterior, por incumplimiento medido:

- `--ink-faint: #9C9280` daba **2.63:1** y se usaba en textos de 10.5px. Reemplazado por `#736A5A`.
- `--gold: #A9793C` daba **3.27:1**. Reemplazado por `#8C6432`.
- En modo `alto`, `--tinta-suave` y `--tinta-tenue` **colapsan al mismo valor**. Es deliberado: a
  7:1 ya no hay margen para tres niveles de gris, y la jerarquía pasa a expresarse por tamaño y
  peso, no por claridad.

### 2.2 Los seis estados de comida

Se conservan los nombres de token `--st-<estado>` y `--st-<estado>-bg`, porque
`comidas/_componentes/insignia-estado.tsx` los construye por interpolación de cadena y tiene tres
llamadores. **Cambiar esos nombres rompe código.** Los valores sí cambian.

| Estado | Claro suave | Claro alto | Oscuro suave | Oscuro alto | Fondo claro | Fondo oscuro |
|---|---|---|---|---|---|---|
| `si` | `#3F5D46` | `#36503C` | `#78A181` | `#AAC3AF` | `#E1E8DE` | `#26332A` |
| `no` | `#AB4437` | `#7C3228` | `#D98C7F` | `#E2A89E` | `#F5DFDB` | `#3A2521` |
| `temprano` | `#855F2F` | `#614522` | `#CBA063` | `#D5B180` | `#F1E4CF` | `#332A1B` |
| `tarde` | `#7A5C3E` | `#5A442E` | `#B4906A` | `#C8AE92` | `#EBE0D2` | `#2E2619` |
| `bolsa` | `#4B6988` | `#364C63` | `#8FB2D6` | `#9ABADA` | `#DEE6ED` | `#1F2C38` |
| `enfermo` | `#8B4B63` | `#69384A` | `#CC93A9` | `#D4A4B6` | `#EEDCE2` | `#33212A` |

Cada estado cumple dos gates: **texto sobre su propio fondo** (≥4.5 en suave, ≥7 en alto) y **borde
sobre pergamino** (≥3), porque el borde del chip es uno de los canales redundantes.

`no`, `temprano` y `bolsa` estaban por debajo de AA en la paleta anterior (4.19, 3.05 y 4.41) y se
oscurecieron conservando tono y saturación.

### 2.3 Icono por estado: el canal que no depende del color

`si` (verde) y `no` (rojo) son el par que un daltónico deuteranope **no distingue**. El color nunca
es el único portador:

| Estado | Icono | Etiqueta |
|---|---|---|
| `si` | Visto (✓) | Sí comer |
| `no` | Cruz (✕) | No comer |
| `temprano` | Sol saliendo | Comer temprano |
| `tarde` | Luna | Comer tarde |
| `bolsa` | Bolsa | En bolsa |
| `enfermo` | Termómetro | Enfermo |

Para `si` y `no` se descartó el plato con cubiertos (y el plato tachado) a favor del visto y la
cruz: son los dos símbolos más universalmente leídos que existen, y el icono acá no tiene que
explicar la comida, sino **distinguir las seis opciones entre sí**. La etiqueta de texto, que siempre
lo acompaña, se encarga del resto.

"Sin definir" usa una **campana**, el mismo signo que el aviso push que dispara cuando una comida
está por cerrar.

Trazo mínimo 2px. Los iconos son `currentColor`, nunca color fijo.

### 2.4 Los tipos de evento: un color por arcángel, y siempre su sigla

El calendario pinta cada tipo con su color tradicional, como Google Calendar: **San Miguel rojo, San
Gabriel azul, San Rafael verde, Otro gris**. Tokens `--ev-<tipo>` (texto, borde y relleno de la
marca) y `--ev-<tipo>-bg` (tinte), con los nombres del enum en guion (`--ev-san-miguel`). Como los
seis estados, **los nombres son contrato**: `varsTipo()` (`lib/calendario/tipos.ts`) los arma por
interpolación.

| Tipo | Claro suave | Claro alto | Oscuro suave | Oscuro alto | Tinte claro | Tinte oscuro |
|---|---|---|---|---|---|---|
| `san_rafael` | `#123D20` | `#0E3319` | `#BFF2CA` | `#C4F4CE` | `#CFE3D2` | `#293E2E` |
| `san_gabriel` | `#2F52A8` | `#1E3F8A` | `#98B0EA` | `#B4C6F6` | `#DEE2F3` | `#2E3243` |
| `san_miguel` | `#B51D3A` | `#960033` | `#E9707A` | `#FFA3B4` | `#FAE4E3` | `#3D2627` |
| `otro` | `#6B6458` | `#4B463D` | `#BFB8AC` | `#D7D1C6` | `#E9E5DE` | `#33302B` |

Contraste del color sobre su tinte / sobre el pergamino (la marca es el mismo par: sigla en
pergamino sobre el color), verificado por `tests/unit/calendario/colores-evento.test.ts`, que lee
`globals.css`:

```
CLARO suave   SR 9.08/10.48  SG 5.63/6.21  SM 5.39/5.61  OT 4.66/5.01
CLARO alto    SR 10.34/11.93 SG 7.63/8.42  SM 7.37/7.66  OT 7.46/8.01
OSCURO suave  SR 9.20/12.69  SG 5.89/7.37  SM 4.69/5.34  OT 6.67/8.07
OSCURO alto   SR 9.42/13.00  SG 7.47/9.34  SM 7.41/8.44  OT 8.65/10.46
```

Reglas que salieron de medir (ΔE00, simulación Machado 2009 de protanopía, deuteranopía y
tritanopía):

- **Rojo y verde se separan por luminosidad, no solo por tono.** Con deuteranopía (la más común) un
  rojo y un verde de igual claridad son el mismo marrón. Por eso, en tema claro el verde de San Rafael
  es el más oscuro y el gris de Otro el más claro; en oscuro, al revés (el verde, casi blanco). ΔE00
  mínimo entre marcas en claro suave: 25 normal, 12 deuteranopía, 17 tritanopía. Con protanopía el
  rojo se oscurece hasta parecerse al verde (7): ahí distingue la sigla, y por eso **la sigla nunca
  falta**. En contraste alto los cuatro colores quedan en un rango estrecho de luminosidad (7:1 manda):
  el canal principal es la sigla y el borde.
- **San Miguel no es el rojo de estado.** `--peligro` y "No comer" son ladrillo (tono 35° en Lab);
  San Miguel es carmesí (22°, más croma), ΔE00 10–12 con ellos, y siempre lleva "SM".
- **La marca:** relleno del color con la sigla en pergamino (`MARCA_TIPO`: SR, SG, SM, Otro), por
  CSS (`data-marca`), así no entra en el texto del evento ni en su nombre accesible, que ya dice el
  tipo completo. Junto al nombre completo (chips, pastilla, formulario) "Otro" es el cuadrito gris sin
  letras: la ausencia de letras también lo distingue. En la cuadrícula del teléfono, si la sigla no
  entra en la columna, queda la inicial (`INICIAL_TIPO`: R, G, M; Otro, punto gris).
- **Tinte + marca, nunca franja lateral** (§8). Administración recibe el tipo solo de los eventos que
  le piden algo, y los ve con el mismo color y la misma marca; el título, nunca. En la lista y en el
  diálogo del día lleva la pastilla con el nombre completo, sin repetir el pedido (para ella el texto
  del evento ya es el pedido).

---

## 3. Relieve

```css
--luz:    #FFFBF2;  /* claro */   --sombra: #C9C0AC;
--luz:    #332F23;  /* oscuro */  --sombra: #14120D;

--relieve-alto:  -8px -8px 16px var(--luz),  8px  8px 16px var(--sombra);
--relieve:       -4px -4px  8px var(--luz),  4px  4px  8px var(--sombra);
--relieve-bajo:  -2px -2px  4px var(--luz),  2px  2px  4px var(--sombra);
--hundido:       inset 3px 3px 7px var(--sombra), inset -3px -3px 7px var(--luz);
--hundido-suave: inset 2px 2px 4px var(--sombra), inset -2px -2px 4px var(--luz);
```

**La métrica correcta para el relieve es ΔL\* (CIE), no el ratio WCAG.** El ratio se comprime cerca
del negro y declara "invisible" una sombra que se ve perfectamente en tema oscuro. Gate: cada
sombra ≥ 4 ΔL\* respecto del fondo, y la suma de ambas ≤ 26 para que la superficie siga leyéndose
como una sola pieza.

```
CLARO   dL* sombra 15.9 / luz 4.9
OSCURO  dL* sombra  7.8 / luz 6.2
```

El relieve claro es asimétrico a propósito: el pergamino ya está cerca del techo de luminosidad, así
que queda poco margen hacia arriba y mucho hacia abajo. Coincide con cómo cae la luz real, y un
relieve marcado es **deseable** acá: el neumorfismo sutil es precisamente el que no se entiende.

**La base oscura sube de `#1B1914` a `#252219`** (el antiguo `--surface`). Con `#1B1914` la sombra no
tenía recorrido hacia abajo y el relieve desaparecía.

### Radios

`--r-sm: 12px` · `--r-md: 18px` · `--r-lg: 26px` · `--r-full: 999px`

Los 3px anteriores son incompatibles con el relieve: una sombra suave sobre una esquina viva se lee
como un error de renderizado.

### Lo que el relieve no traduce

La cuadrícula de líneas capilares (`gap:1px` sobre un fondo `--line`) que usan hoy `.plan-grid` y
`.cal-grid` **no funciona** con sombras suaves. Ambas se reconstruyen como teselas individuales
elevadas con separación real, que además hace cada celda tocable.

---

## 4. Tipografía

```css
html { font-size: 112.5%; }  /* 18px */
```

Todo lo demás en `rem`. El ajuste de tamaño del usuario cambia **solo ese porcentaje** y escala la
interfaz entera. Sin tamaños fraccionarios: los `12.5px` / `13.5px` / `10.5px` actuales desaparecen.

| Token | rem | px @18 | Uso |
|---|---|---|---|
| `--t-xs` | 0.875 | 15.75 | Piso absoluto. Solo metadatos (hora de un mensaje) |
| `--t-sm` | 1 | 18 | Etiquetas, notas, secundario |
| `--t-base` | 1.111 | 20 | Cuerpo |
| `--t-lg` | 1.389 | 25 | Nombre del día, subtítulos |
| `--t-xl` | 1.75 | 31.5 | Título de pantalla |
| `--t-2xl` | 2.188 | 39 | Login |

Source Serif 4 para display, IBM Plex Sans para UI. Ya están cargadas vía `next/font`; la mezcla
serif/sans le da temperatura de casa y no de software administrativo.

Longitud de línea máxima **65ch** en texto corrido.

### Objetivos táctiles

**Mínimo 56×56px.** WCAG AAA pide 44; 56 es el número para manos mayores o con temblor. Separación
mínima de 8px entre objetivos contiguos. Es un gate verificable, y se verifica. Incluye a los
botones "chicos": una variante compacta puede tener menos texto o menos relleno, nunca menos alto.

**Tres excepciones, documentadas.** Las dos primeras son siete columnas de días en un teléfono:
cumplen WCAG 2.2 AA (24px) pero no este contrato. La tercera es de separación, no de tamaño.

1. **La cuadrícula mensual del calendario.** Siete columnas en 320px dejan días de ~36px de ancho;
   por eso en el teléfono el calendario abre en **lista** y la cuadrícula queda detrás de *"Ver mes"*.
   Ahí tampoco cede la letra: cada evento es su marca (§2.4) y, cuando la columna no alcanza (consulta
   de contenedor en `rem` sobre `.cal-grid`), la cabecera pasa a la inicial del día (el lector de
   pantalla oye el nombre entero) y la marca a la inicial del tipo, en lugar de achicarse por debajo
   de `--t-xs`.
2. **El mini calendario de ausencias** (`components/ui/mini-calendario.tsx`). Marcar una ausencia es
   tocar el primer y el último día en un mes, y eso no tiene lista equivalente: cada día mide ~43px
   de ancho a 375px (~39px en un teléfono con más margen, ~36px a 320px). Mitigaciones:
   - **Alto completo:** 56px siempre; el ancho es lo único que cede. El calendario va casi a sangre
     dentro de la tarjeta y con 3px entre días, para darle a cada día todo el ancho posible.
   - **La letra no cede:** ningún texto baja de `--t-xs`, a ningún ancho ni tamaño de letra. Si
     "Mié" no cabe a ese tamaño en la columna (320px con letra grande, o letra enorme por debajo de
     ~414px), la cabecera pasa a la inicial ("L M M J V S D") con una consulta de contenedor en `rem`,
     que sigue a la letra elegida; el lector de pantalla oye siempre el nombre entero.
   - **Resumen escrito antes de guardar:** *"Del 14 al 16 de octubre (3 días)."* debajo del
     calendario, en una región `aria-live`. Un toque errado se ve antes de que cuente, y se corrige
     tocando de nuevo; nada se guarda hasta *"Guardar ausencia"*. Tocar un día ya marcado no lo
     desmarca: si todo lo elegido ya estaba marcado no hay nada que guardar y el aviso manda a
     *"Quitar"*; si solo una parte, el resumen lo dice (sirve para alargar una ausencia).
   - **Ruta completa por teclado y lector de pantalla:** una sola parada de tabulación y flechas,
     Inicio/Fin y RePág/AvPág (patrón APG de selector de fecha); cada día se anuncia con su fecha
     completa, "hoy" y "ya marcado como ausente", y la selección con `aria-selected` en su celda.
3. **El "+ Extra" de cada comida en La casa** va en la esquina de arriba a la derecha del botón de su
   celda (lo pidió el usuario: "en la esquina de cada comida"), así que los dos objetivos se tocan sin
   los 8px de separación. Mitigaciones:
   - **Tamaño completo, sin comerse la celda:** lo que se toca es la pastilla con 4px a cada lado y
     56px de alto (nunca menos de 56×56); al lado y debajo de esa franja, la celda sigue siendo la
     celda. Es un botón hermano del de la celda, nunca uno dentro de otro.
   - **Su franja es suya:** la primera línea de la celda (*"N comen"*) deja libre ese ancho, así
     ningún texto de la celda queda debajo del *"+ Extra"*; en una celda angosta, *"comen"* baja a la
     línea siguiente, junto al número y no debajo de la pastilla.
   - **Distinto a la vista y al oído:** relleno de acento como un botón principal (el desglose de la
     celda es pergamino), icono **+** con *"Extra"* escrito, y nombre accesible completo: *"Agregar
     extra al almuerzo del miércoles 30/9"*.

### Tres reglas de ancho que salieron de verificar, no de planificar

Las tres fallaron en el prototipo con letra "Muy grande" en un teléfono de 320px:

1. **Los márgenes siguen al ancho de la pantalla, no al tamaño de letra.** Si el relleno lateral de
   las superficies está en `rem`, subir la letra engorda los márgenes y deja *menos* sitio justo para
   el texto que se quiso agrandar. Token: `--marco: min(1.25rem, 4.5vw)`.
2. **Ningún `min-width` en `rem` dentro de una columna.** Crece con la letra hasta superar el ancho
   disponible. Siempre `min-width: min(13rem, 100%)`.
3. **Columnas de rejilla con `minmax(0, 1fr)`, nunca `1fr` a secas.** `1fr` tiene como mínimo su
   contenido: un solo título largo ensancha la columna entera y rompe la página.

Y dos más que salieron de la cuadrícula del plan y las tarjetas de la semana:

4. **Cuántas columnas entran lo decide una container query en `rem`, no una media query.** En una
   media query el `rem` es siempre 16px; en una container query sigue a la letra elegida. Así, con
   letra "Grande" o "Muy grande", la cuadrícula del plan pasa a una celda por fila (con el nombre de
   la comida escrito) y las tarjetas de la semana a una sola columna, en lugar de achicar la letra
   para que entren. Lo mismo dentro de la burbuja: las seis opciones van 3×2 con el icono arriba si
   hay lugar, 2×3 en el teléfono y, cuando cada opción tiene ancho para el icono al lado de su texto,
   más bajitas (56px), para que la burbuja entre en la pantalla. Ojo: la consulta mide el ancho de
   *adentro* del contenedor, sin su relleno.
5. **`--t-xs` es el piso también dentro de una celda.** Una celda puede dejar de crecer al llegar a
   su ancho (`max(var(--t-xs), min(var(--t-sm), 4.8vw))` en la cuadrícula del plan), pero nunca baja
   de `--t-xs` del tamaño de letra elegido: si no entra, cambia la disposición (menos columnas, una
   celda por fila), no la letra. Por eso la semana tiene como mucho cuatro columnas: con el ancho
   máximo del contenido, siete tarjetas solo entraban achicando la letra por debajo del piso.
   Verificado a 320 / 375 / 768 / 1280 px con letra normal, grande y muy grande.

---

## 5. Preferencias de apariencia

Tres atributos en `<html>`, persistidos. En el prototipo, `localStorage`. En la app, columnas del
perfil **más** `localStorage`, para que se apliquen sin esperar al servidor.

| Atributo | Valores | Efecto |
|---|---|---|
| `data-theme` | ausente (automático) · `light` · `dark` | Conmuta el bloque de tokens. Es el mismo atributo que `globals.css` ya tiene cableado |
| `data-contraste` | `suave` · `alto` | Ver abajo |
| `data-texto` | `normal` · `grande` · `enorme` | `html` a 112.5% / 125% / 143% (18 / 20 / 23px) |

### Qué hace exactamente `contraste: alto`

1. `--luz` y `--sombra` pasan a `transparent`: el relieve desaparece por completo.
2. Todo lo que era elevado recibe `border: 2px solid var(--tinta)`.
3. Todo lo que era hundido recibe `border: 2px solid` del color de su estado.
4. Los neutros suben a sus valores de 7:1.

**Este es el punto que hace defendible todo el sistema.** El relieve es la capa por defecto, no un
requisito. Quien no lo distingue pide bordes y obtiene bordes, sin perder una sola función ni un
solo dato. Un sistema que no puede apagar su propia estética no es accesible.

Se respetan además:

- `prefers-contrast: more` → fuerza `alto` si la persona no eligió explícitamente.
- `prefers-reduced-motion: reduce` → anula toda transición.
- `prefers-color-scheme` → decide el tema cuando `data-theme` no está.

Las preferencias son alcanzables **desde el login**, antes de autenticarse: quien no puede leer la
pantalla tampoco puede entrar a arreglarla.

El disparador es **"Aa"**, no un icono de engranaje ni de controles deslizantes: es el signo que la
gente mayor ya asocia con el tamaño de letra. Y **nunca flota sobre contenido tocable**. Un botón
flotante en la esquina tapó, en tres pantallas distintas, un control real. En el login va fijo
arriba a la derecha; dentro de la app vive en la barra superior (teléfono) o en el lateral
(escritorio).

---

## 6. Movimiento

Una sola transición en todo el sistema: el paso de elevado a hundido al elegir.

```css
transition: box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1),
            background-color 180ms cubic-bezier(0.22, 1, 0.36, 1);
```

Ease-out-quart. Sin rebote, sin elástico. No se animan propiedades de layout.

---

## 7. Foco

```css
:focus-visible { outline: 3px solid var(--acento); outline-offset: 3px; }
```

3px y offset positivo, porque un anillo de 2px pegado al borde se pierde dentro del degradado de la
sombra. Donde `overflow:hidden` lo recortaría, se usa `outline-offset: -3px`, nunca `outline: none`.

Cada vez que la interfaz se vuelve a pintar, el foco vuelve al control que lo tenía: al abrir una
burbuja, entra a la opción marcada; al elegir una opción, el foco queda en esa opción; al tocar
*Listo* o Escape, vuelve al botón que abrió la burbuja; al cambiar de sección, pasa al contenido
principal para que un lector de pantalla anuncie dónde quedó la persona.

---

## 8. Reglas de composición

- **Sin franjas laterales.** `border-left` de color como acento en tarjetas, hilos o avisos está
  prohibido. Los hilos de mensajes se marcan con sangría más superficie hundida, que es lo que un
  hilo es: contenido *dentro* de otro.
- **Sin tarjetas dentro de tarjetas.** En neumorfismo se lee como un error de profundidad. Lo que va
  dentro de una meseta elevada es plano o hundido, nunca elevado otra vez.
- **Sin modales como primer recurso.** El único modal justificado es la confirmación de borrado.
- **Una sola interacción para una sola pregunta: tocá la comida y se abre una burbuja junto a
  ella.** Plan semanal, Semana y La casa del Director responden a "¿qué hacés con esta comida?" y
  por lo tanto se usan igual y con **exactamente las mismas piezas**: el botón de la comida (la celda
  del plan, la comida en la tarjeta del día, el nombre de la persona), la `Burbuja` que abre junto a
  él y, adentro, `PanelOpciones` (la bandeja de las seis opciones) y `EditorNota` (el campo de hora
  o de nota cuando el estado lo pide). Quien aprende una pantalla ya sabe las otras. Es la decisión
  de mayor impacto de todo el rediseño.
- **La nota se comporta igual en todas partes, y lo escrito nunca se pierde en silencio.** Un estado
  sin nota se guarda al tocarlo. Uno que la pide (temprano, tarde, enfermo) abre el campo, que toma
  el foco. Lo escrito se guarda con "Guardar" **y también al cerrar**: "Listo", volver a tocar la
  comida, tocar fuera de la burbuja o pasar a otra comida. Si la nota está vacía o no sirve, no se
  cierra nada (y ese toque fuera no hace nada más: si era un enlace, no navega): el motivo aparece
  debajo del campo ("…Si no querés cambiarla, tocá 'Cancelar'") y el foco vuelve a él. Solo Escape y
  "Cancelar" descartan, porque son pedidos explícitos; elegir otra opción la reemplaza. Nada se
  guarda al salir del campo: guardar en ese momento dejaba el toque siguiente sin efecto mientras se
  guardaba. Entre temprano y tarde la hora ya escrita se conserva. La lógica es una sola
  (`resolverBorrador` + `useBorradorNota`) para que Plan, Semana y La casa no puedan diferir.
- **El plan se edita en la cuadrícula.** Siete filas (días) × tres columnas (comidas), a todo ancho.
  Cada celda es un botón con icono + texto corto + color (la hora debajo en temprano y tarde;
  "Falta" con la campana si no está definida). Tocarla abre las opciones en una burbuja junto a ella,
  una a la vez. En el teléfono el nombre del día va en su propia línea y la cabecera de comidas
  queda fija arriba mientras se recorre la semana; con letra grande en el teléfono cada celda ocupa
  la fila y dice "Desayuno · Temprano 07:30". Si un guardado falla, el aviso dice qué celda volvió
  atrás ("No se pudo guardar el almuerzo del martes…").
- **La semana en tarjetas por día; cada comida, un botón.** Siete tarjetitas resumen las tres
  comidas de cada día con icono + texto corto + color, nunca solo icono; toda la semana se ve de un
  vistazo. La tarjeta no se toca entera: es una bandeja (hundida) y lo que se toca son sus tres
  comidas, botones elevados con el color de su estado, como las celdas del plan (*"Desayuno ✓ Sí"*,
  56px, nombre accesible *"Desayuno del lunes 28/9: Sí comer. Cambiar"*). Tocar una abre su burbuja;
  no hay un panel del día debajo. Una comida cerrada es plana y no es un botón: se lee lo que quedó
  y, en un día a medio cerrar (hoy), candado + *"Cerrada"* escritos; un día cerrado entero es una
  tarjeta plana que lo dice una vez (*"Cerrado"*). Al entrar a la semana en curso, si la tarjeta de
  hoy no se ve (un jueves en el teléfono), la página empieza en ella; si hoy ya cerró entero, en el
  primer día que todavía tenga algo por cambiar: lo primero que se ofrece es algo que se puede
  cambiar.
- **La burbuja: junto a lo que se tocó, no encima de todo.** Es una capa pasajera, elevada, con una
  flecha que señala el botón que la abrió y borde de acento (en contraste alto, más grueso y sin
  sombras). No es una tarjeta dentro de otra (va en un portal sobre la página, no dentro de nada) ni
  un modal: no oscurece, no bloquea, y la página sigue ahí.
  - **Dónde va:** debajo del botón; arriba si abajo no entra y arriba sí; si no entra en ningún lado,
    debajo, y la página baja hasta dejar el botón arriba, debajo de lo que esté fijo ahí (la cabecera
    de comidas del plan: su `scroll-margin-top`); la barra inferior del teléfono no cuenta como lugar
    libre. Siempre dentro de la pantalla con 16px de margen; en el teléfono ocupa todo el ancho menos
    ese margen. Una vez abierta no salta de lado al crecer (aparece el campo de la hora) ni cuando el
    teclado achica la pantalla; si está arriba del botón y crece, la página sube lo mismo, así lo que
    se estaba tocando no se corre bajo el dedo.
  - **Lo que se tocó no se mueve en la pantalla.** Si el botón cambia de lugar en la página mientras
    la burbuja está abierta (en La casa, la persona pasa al grupo de lo que eligió y su nombre se pinta
    más abajo), la página se mueve lo mismo: el nombre y su burbuja quedan donde estaban y es la
    lista la que se corre.
  - **Cómo se va:** "Listo" o volver a tocar el botón; un toque fuera (desplazar la página no es un
    toque); Escape (descarta); Tab desde su último control. Tocar otra comida cierra esta con las
    reglas de "Listo" y abre aquella: una burbuja a la vez. Un doble toque (o un dedo que rebota) no
    la abre y la cierra: volver a tocar el mismo botón en los 400ms después de abrirla no hace nada.
  - **Teclado y lector:** el botón lleva `aria-expanded`, `aria-controls` y `aria-haspopup="dialog"`;
    la burbuja es un `role="dialog"` (no modal) nombrado por su título. Aunque está al final de la
    página, el orden de tabulación es el de un *disclosure*: Tab desde el botón entra, Mayús+Tab
    desde su primer control vuelve al botón y Tab desde el último sale al control que sigue al botón.
    Se acepta a propósito que el gesto de "siguiente" de VoiceOver/TalkBack la encuentre al final de
    la página: al abrirla el foco ya está adentro (en la opción marcada) y al cerrarla vuelve al botón,
    así que el lector la anuncia en el momento en que se abre.
  - **Sin API Popover ni anclas de CSS:** los iPhone con iOS 15 no los tienen. La posición la calcula
    JavaScript (`lib/burbuja.ts`, con pruebas) y la burbuja va en `position:absolute` sobre la
    página, no `fixed`: se mueve con lo que se desplaza, el teclado del teléfono no la deja flotando
    en otro lado y, si es más alta que la pantalla, se llega a su final desplazando como siempre.
- **"Mañana" nunca se esconde detrás de un control de paginación.** Al final de la semana en curso
  hay un botón grande, *"Ver la semana que viene"*, con el motivo escrito. Cada domingo, "mañana" es
  la semana siguiente.
- **Sin tablas con scroll horizontal.** En el teléfono, cada fila pasa a ser una ficha con sus
  etiquetas escritas. En la vista de Administración, cada comida ocupa una línea (etiqueta a la
  izquierda, respuesta a la derecha), así caben dos personas por pantalla en lugar de una.
- **La barra inferior nunca parte una palabra.** Las cuatro etiquetas dejan de crecer al llegar al
  ancho disponible (`min(var(--t-xs), 4.2vw)`), como hace iOS con su barra de pestañas: siempre van
  junto a su icono, y el contenido de la página sí escala entero. El ancho se reparte según lo que
  cada etiqueta necesita, no en cuartos iguales: "Calendario" necesita 79px y "Ajustes" 54.
- **Una rejilla de solo iconos lleva leyenda escrita.** La matriz del plan en la vista de
  Administración muestra solo icono y color, así que cada celda tiene nombre accesible y la pantalla
  explica cada icono con su texto.
- **"La casa" del Director es la tabla de la cocina con nombres, no una pantalla nueva.** La misma
  tabla que ve Administración (un día por fila, una comida por columna, el mismo desglose y el mismo
  apilado en el teléfono), pero cada celda es un botón elevado dentro de su hueco. Tocarla abre,
  **debajo de la fila de su día** (una fila más de la tabla, a todo el ancho, también apilada) y no
  en un modal, quiénes comen: agrupados por lo que eligieron (título de grupo con icono + texto +
  color, *"Sin definir (2)"* primero, después el orden de la cocina), y cada nombre es un botón de
  56px que abre, en una burbuja junto a él, la comida de esa persona con las mismas piezas de
  siempre (`ContenidoComida` → `PanelOpciones` + `EditorNota`) y los mismos cierres; su título dice
  de quién es (*"Almuerzo de Juan, miércoles 30/9"*; el Director, *"Tu almuerzo…"*) y al pie va
  *"Ver la semana de Juan"*. Si al guardar la persona pasa a otro grupo, la burbuja sigue junto a su
  nombre. Como va dentro de la tarjeta de la tabla, el panel es una bandeja hundida, no otra tarjeta.
  Al abrirlo, el foco va a su título y la fila sube hasta arriba; si la fila apilada es más alta que
  la pantalla (teléfono, letra grande), sube el panel: lo que se abrió siempre se ve. *"Cerrar"*
  devuelve el foco a la celda. Lo que cambia es la voz: *"¿Va a almorzar…?"*, *"según su plan"*,
  *"Volver a su plan"*, *"Elegí qué hace Juan con el almuerzo"*, *"Indicá qué puede comer"*
  (`lib/comidas/voz.ts`).
- **La página de una persona dice de quién es.** `/comidas/casa/[persona]` reutiliza las tarjetas,
  la cuadrícula y el mini calendario tal cual, bajo el título *"Comidas de Juan"* y la frase *"Lo que
  cambies acá es de Juan, no tuyo"*. Sus vistas son *"Su semana"*, *"Su plan"*, *"Sus ausencias"*,
  con icono, en un control segmentado (bandeja hundida, segmentos rectos, el elegido hundido y
  teñido de acento), para que no se confundan con las pestañas de arriba, que son las del propio
  Director (ahí sigue marcada *"La casa"*, y el texto bajo *"Comidas"* habla de la casa, no de
  *"tu plan"*).
- **Lo cerrado en La casa se dice escrito.** Una comida cerrada es plana (se toca igual, para ver
  quiénes comieron) y lleva candado + *"Cerrada"*; un día cerrado entero lo dice una vez en su fila,
  como su tarjeta en la Semana. Dentro, la burbuja de cada persona es de solo lectura: lo que quedó,
  con candado y *"Cerrada: ya no se puede cambiar."*
- **Quién cambió se ve donde se mira, sin abrir nada.** La comida que cambió el Director lleva lápiz
  + *"Director"*, en la tarjeta del día y en la celda del plan por igual, con la leyenda escrita
  arriba (*"Director = la cambió el Director, no vos."*). Al abrir, la marca de origen de la comida
  dice *"la cambió el Director"* (también la burbuja del plan y el nombre accesible del botón), y la
  ausencia, *"La marcó el Director"*. Nunca el lápiz solo.
- **Extras para la cocina: desde la comida misma, sin nombres, y avisando antes.** Cada comida de La
  casa, desde hoy, lleva en su esquina *"+ Extra"* (ver §4, excepción 3). Su burbuja ya sabe el día
  y la comida (*"Extras para el almuerzo del miércoles 30/9"*): la cantidad con botones − y + de
  56px, una nota opcional con la advertencia escrita *"La cocina lee esta nota: no escribas
  nombres."* y *"Agregar"*; debajo, los extras que ya tiene esa comida, cada uno con *"Quitar"* (y
  su confirmación) mientras la comida no cerró. La celda muestra *"+N extra"* y las notas, como la
  ve la cocina. Si la comida ya cerró (hoy) el *"+"* sigue: se puede agregar igual (un invitado de
  último momento), pero antes aparece, con candado y borde punteado, *"Esa comida ya cerró: la
  cocina puede no verlo a tiempo."* Un extra de una comida cerrada ya no ofrece *"Quitar"*: muestra
  el candado y *"Cerrada"*. Días pasados: sin *"+"*. Lo escrito sin agregar no se pierde en silencio,
  pero tampoco se agrega solo (un toque accidental haría cocinar de más): *"Cerrar"*, un toque fuera
  o pasar a otra comida no cierran y preguntan *"¿Agregar o descartar?"*; Escape descarta. La
  pregunta y sus dos respuestas aparecen **debajo** de *"Agregar"* y *"Cerrar"*, que no se mueven: un
  doble toque en *"Cerrar"* cae dos veces en *"Cerrar"* (sigue preguntando), nunca en *"Descartar"*.
- **Instalar la app: una franja arriba del contenido, no un modal, y nunca en la computadora.** En el
  teléfono o la tablet, mientras la app se usa desde el navegador, la primera tarjeta del contenido
  (elevada, icono del teléfono + *"Instalá El Molino en tu teléfono"* + para qué sirve) ofrece
  *"Instalar"* y *"Ahora no"*. Donde el navegador sabe instalar (Android, Chrome, Edge),
  *"Instalar"* abre su diálogo; en iPhone y iPad despliega **en el lugar** una bandeja hundida con
  tres pasos, cada uno con su dibujo (el teléfono con la barra donde está Compartir, abajo o arriba
  según el aparato; el cuadrado con el más; el ícono nuevo), su número y su texto; en los demás, la
  instrucción del menú. *"Ahora no"* la guarda una semana y la tarjeta *"Instalar la app"* de Ajustes
  queda para después. Donde no hay forma de saber si ya se instaló (iPhone, iPad), con los pasos
  abiertos aparece *"Ya la instalé"*: 60 días sin ofrecerla. Si la desinstalan, vuelve sola (el
  navegador vuelve a ofrecer instalar). Se ve desde el primer pintado (lo decide un script de `<head>`, como la
  apariencia): nada salta cuando carga. Ya instalada, la misma franja ofrece *"Activá los avisos en
  este teléfono"* (también con *"Ahora no"*) y el permiso se pide recién al tocar. Si el ancho no
  alcanza (320px o letra grande) el icono sube sobre el título y el dibujo de cada paso sobre su
  texto, por consulta de contenedor en `rem`; la letra no se achica.

- **Los filtros del calendario se ven, y lo oculto se dice.** Arriba de la tarjeta del mes (Director
  y Residente; Administración no: ve todo lo que le piden, y su `.zona-calendario` sale con
  `data-listo` desde el servidor para que lo oculto en ese dispositivo no le esconda nada): un chip
  por tipo con su color y su
  marca, *"Mis ausencias"* y, en su línea, *"Solo eventos con pedido a cocina"* (un `switch` con
  *"Sí"*/*"No"* escrito). Cada chip es un interruptor (`aria-pressed`): **mostrado = hundido + visto +
  *"Visible"***, como toda opción elegida; **oculto = elevado + ojo tachado + *"Oculto"*** (se toca
  para volver a verlo), y su marca queda hueca. *"Visible"* y *"Oculto"* ocupan el mismo ancho: tocar
  un chip no corre a los demás, y el siguiente toque cae donde se apuntó. En un contenedor angosto
  (consulta en `rem`) los chips van detrás de un botón *"Filtros · 2 ocultos"* con `aria-expanded`.
  Si algo está oculto, siempre a la vista (al final de la sección, fuera de lo plegable):
  *"Estás ocultando: San Miguel y Mis ausencias."* con *"Mostrar todo"* (una persona mayor puede
  ocultar algo sin querer y creer que los eventos desaparecieron). Un día con todo oculto no queda
  vacío y normal: ojo tachado + *"2 ocultos"* en la cuadrícula, *"+1 evento oculto por los filtros"*
  en la lista (los días con todo oculto no se listan, y al final dice cuántos hay en el mes), y en el
  diálogo del día *"Hay 2 eventos ocultos por los filtros."* con *"Mostrarlos"*, que los muestra ahí
  sin tocar los filtros; cada uno así mostrado dice *"Oculto por los filtros"* y ofrece *"Mostrar San
  Miguel en el calendario"*.
- **Lo que se acaba de guardar nunca desaparece.** Si el Director agrega o edita un evento de un tipo
  oculto (o sin pedido con *"Solo eventos con pedido a cocina"*), el diálogo del día lo sigue
  listando, marcado como oculto y con *"Mostrar San Miguel en el calendario"*, y el aviso lo explica:
  *"Evento agregado. No se ve en el calendario porque «San Miguel» está oculto en los filtros."* (en
  plural para una serie). Si desapareciera, parecería que no se guardó y se cargaría dos veces: dos
  pedidos para la cocina. Los avisos largos duran lo que hace falta para leerlos (~70 ms por letra,
  entre 2,6 y 10 s).
- **Recargar no hace saltar nada.** La elección se recuerda en el dispositivo; al recargar, un script
  en `<head>` copia lo guardado a `html[data-cal-oculta]` (y cuántos, en `data-cal-oculta-n`) antes de
  pintar. Mientras `.zona-calendario` no tenga `data-listo`, el CSS esconde esos eventos, eleva sus
  chips, calla *"Visible"* y la cuenta de *"Filtros"* (dirían "todo a la vista", lo del servidor) y
  reserva el alto del aviso: una fila en un contenedor ancho; en uno angosto, una línea por cosa
  oculta, más una o dos cuanto más angosto, y el botón debajo. Medido a 320/375/768/1280 ×
  normal/grande/enorme: la tarjeta se corre a lo sumo ~25px al hidratar (sin reservar, hasta ~200).

---

## 9. Estados que la interfaz debe saber decir

| Estado | Cómo se ve | Por qué |
|---|---|---|
| **Sin definir** | Hueco hundido y vacío, borde punteado, con la pregunta escrita: *"¿Vas a almorzar el martes?"* | Es el estado de fallo que el sistema persigue con notificaciones push. Dejó de ser texto gris chico: la ausencia se ve como un agujero, que es lo que es |
| **Según tu plan** | Marca de origen explícita junto al estado | Se hereda del plan semanal; la persona no lo eligió hoy |
| **Cambiada** | Marca de origen distinta, más "Volver a mi plan" | Excepción puntual sobre el patrón |
| **Cerrada** | Fila hundida y apagada, con el motivo: *"El almuerzo cerró a las 10:00"* | El motivo va en la fila, no en un banner lejos del control |

---

## 10. Accesibilidad que ya existe y no se pierde

El código actual tiene trabajo hecho y bien hecho. El port debe conservarlo:

- `aria-pressed` en los chips de estado, `aria-current` en navegación, `aria-live="polite"` en los
  avisos, `aria-busy` al guardar.
- La distinción deliberada entre **`disabled`** (control realmente no disponible) y
  **`aria-disabled`** (ocupado guardando), para no perder el foco del teclado a media acción.
- La utilidad `.sr-only`.
- Modal con foco de entrada y restauración al cerrar.

Y un defecto ya anotado en el checklist de lanzamiento que el rediseño corrige: al abrir un día
vacío del calendario **no se enfoca ningún campo de texto**, para no disparar el teclado del
teléfono.

---

## 11. Verificación

Ninguna de estas comprobaciones es opcional; todas son automatizables salvo la última, que es la
única que decide de verdad.

| Qué | Criterio |
|---|---|
| Contraste | Las 4 combinaciones {claro, oscuro} × {suave, alto}, más los 6 estados. ≥7:1 en `alto`, ≥4.5:1 en `suave`, ≥3:1 bordes |
| Relieve | ΔL\* ≥ 4 por sombra, suma ≤ 26, en ambos temas |
| Objetivos táctiles | Ningún elemento interactivo por debajo de 56×56, ni a menos de 8px de su vecino |
| Teclado | Recorrido completo sin mouse, foco visible en todo momento sobre el relieve |
| Zoom | 200% y 400% sin scroll horizontal ni recortes (WCAG 1.4.10) |
| Contraste alto | Ningún elemento que solo se distinguiera por la sombra queda indistinguible |
| **Personas** | 2–3 residentes mayores completan las tareas sin ayuda. Ver `docs/prototipo/README-neumorfico.md` |

### Resultado sobre el prototipo

| Comprobación | Resultado |
|---|---|
| Contraste, 4 modos × neutros y 6 estados | 0 fallos |
| Relieve | Claro ΔL\* 15.9 / 4.9 · Oscuro 7.8 / 6.2 |
| 3 roles × 5 pantallas × 3 tamaños × 2 contrastes, a **320px**, con filas abiertas | 90 combinaciones: 0 desbordes, 0 controles bajo 56×56, 0 etiquetas partidas |
| Navegación por la barra real | 15 de 15 |
| Foco tras abrir, elegir, cerrar y cambiar de sección | Nunca se pierde |
| Flujo completo de la tarea 2 (plan → semana → cocina) | La hora del plan llega al conteo de la cocina |

Lo que la verificación encontró y corrigió, para no repetirlo en el port: la navegación principal
**no respondía** (sus botones vivían fuera del contenedor que escuchaba los toques); un botón
flotante tapaba controles reales; la barra inferior se desbordaba con letra grande; y tres
mínimos en `rem` rompían la página a 320px.

Queda sin verificar en automático: el zoom del navegador al 200% y 400%, y el recorrido con un lector
de pantalla real (VoiceOver o TalkBack).

---

## 12. En la app

El diseño ya está en la app Next.js. Dónde vive cada pieza:

| Pieza | Archivo |
|---|---|
| Tokens, relieve y todos los estilos | `app/globals.css` (única capa visual: no hay Tailwind ni librería de UI) |
| Preferencias de apariencia: lectura, reglas y script previo al pintado | `lib/apariencia.ts` |
| Controles de apariencia y botón "Aa" | `components/ui/apariencia.tsx` |
| Iconos (uno por estado de comida) | `components/ui/iconos.tsx` |
| Lateral, barra superior y barra inferior | `components/app/estructura.tsx`, `components/app/navegacion.tsx` |
| Marca: el escudo de El Molino (lateral, barra superior, inicio de sesión) | `components/app/escudo.tsx` con `components/app/marca/escudo.png`; íconos de la app (teléfono, Apple) en `components/app/monograma.tsx`; pestaña del navegador `app/icon.png` |
| La burbuja (junto a lo que se tocó: portal, posición, foco, cierre) | `components/ui/burbuja.tsx`; dónde va y cuánto desplazar, puro y con pruebas, en `lib/burbuja.ts` |
| La interacción única de comidas | `app/(app)/comidas/_componentes/panel-opciones.tsx` (seis opciones) y `editor-nota.tsx` (hora o nota); `contenido-comida.tsx` las compone dentro de la burbuja de una comida de un día (Semana y La casa), con el guardado optimista de `usar-comida-del-dia.ts` |
| Plan semanal: la cuadrícula editable | `plan-editable.tsx`; guardado por celda en `usar-plan-editable.ts`; claves, títulos y nombres accesibles en `lib/comidas/plan.ts` |
| Semana: tarjetas por día | `semana-persona.tsx`; textos cortos, día cerrado, nombre de cada comida y qué tarjeta se trae a la vista al entrar en `lib/comidas/vista.ts` (`textoCorto`, `diaCerrado`, `etiquetaComidaTarjeta`, `diaParaMostrar`) |
| Traer a la vista lo que se abrió debajo (la tarjeta de hoy al entrar, quiénes comen) | `app/(app)/comidas/_componentes/revelar.ts` (la burbuja se revela sola) |
| Mini calendario para marcar un rango de días (ausencias) | `components/ui/mini-calendario.tsx`; su lógica pura (toques, teclado, límites, resumen) en `lib/calendario/seleccion-rango.ts` |
| Nombres de mes y de día, sin `Intl` (iguales en servidor y navegador) | `lib/fechas/etiquetas.ts` |
| La casa del Director: tabla, quiénes comen y extras | `app/(app)/comidas/casa/` (`tabla-casa.tsx`, `burbuja-extra.tsx`, `[persona]/page.tsx`); textos y cálculos en `lib/comidas/casa.ts`; segunda y tercera persona en `lib/comidas/voz.ts` |
| Instalar la app y activar los avisos (franja de arriba y tarjeta de Ajustes) | `components/app/invitaciones.tsx`, `components/app/instalar.tsx`; qué mostrar, pasos y script de `<head>`, puros y con pruebas, en `lib/pwa/instalar.ts`; el evento del navegador en `lib/pwa/instalacion.ts` |
| Colores y marcas de los tipos de evento | Tokens `--ev-*` en `app/globals.css`; `MARCA_TIPO`, `INICIAL_TIPO` y `varsTipo` en `lib/calendario/tipos.ts`; la marca, `app/(app)/calendario/_componentes/marca-tipo.tsx` |
| Filtros del calendario | `filtros-calendario.tsx` (chips, interruptor y aviso) y `usar-filtros.ts` (el dispositivo); qué se ve, textos, nombre accesible del día, almacén y script previo al pintado, puros y con pruebas, en `lib/calendario/filtros.ts` |

Decisiones tomadas al portar:

- **Las clases que usan los E2E se conservaron como anclas** (`.sidebar`, `.msg`, `.thread`,
  `.feed-mensajes`, `.cal-day`, `.cal-event`, `.toast`, `.locked-banner`, `.week-list`,
  `.status-chip`), y también la tabla de Administración: en el teléfono se apila con CSS, sin
  cambiar su estructura. Con las tarjetas de la semana se sumaron `.tarjetas-semana` (que conserva
  `.week-list`) y `.tarjeta-dia` (la bandeja de un día, `section` nombrada *"Miércoles 30/9"*); con
  la cuadrícula del plan, `.cuadro-plan` y `.celda-plan`. Cada comida de la Semana es
  `.comida-tarjeta[data-fecha][data-comida]`: un `button` si se puede cambiar, plana y sin botón si
  cerró. Lo que se abre al tocar una comida (Semana, Plan, un nombre o un *"+ Extra"* de La casa) es
  la `.burbuja`, que los specs buscan por su rol y su título:
  `getByRole('dialog', { name: 'Almuerzo del miércoles 30/9' })`. Ya no existen `.panel-dia`,
  `.cuadro-panel`, `.estado-actual` ni `.persona-comida`. Solo cambiaron los specs donde cambió la
  interacción (tocar la comida y elegir en su burbuja) y el título de la sección. El mini calendario de ausencias usa **anclas propias**
  (`.mini-calendario .mini-dia[data-fecha]`) y nunca `.cal-day`: los E2E del calendario grande
  buscan `.cal-day[data-fecha=…]` como único. La casa del Director suma
  `.tabla-casa td[data-fecha][data-comida] .celda-casa` (el botón de cada comida), `.panel-casa`
  dentro de `tr.fila-panel` (quiénes comen, con un `role="group"` por estado nombrado *"Sin definir
  (2)"*), `.sub-tabs`/`.sub-tab` (las vistas de una persona), `.celda-director`
  (lo que cambió el Director), `.persona-casa` (el nombre que abre su burbuja),
  `.celda-casa-marco` con `.extra-mas` (el *"+ Extra"* de cada comida, hermano del botón de la
  celda) y `.fila-extra` (cada extra ya agregado, dentro de su burbuja). Con los filtros del
  calendario, `.cal-event` sigue siendo el evento y su texto no cambia (la sigla es un `::before`); con
  tipo lleva `data-tipo`, `data-marca` y `data-inicial` (también para Administración). Lo que puede
  comer quien está enfermo va en `.nota-parte`, debajo de su `.parte`. Se suman la sección
  nombrada *"Filtros"* (`.filtros-cal`, por su rol: `getByRole('region', { name: 'Filtros' })`), sus
  chips `.chip-filtro[data-filtro]` (botones con `aria-pressed`, nombrados por el tipo: *"San
  Miguel"*), el `switch` *"Solo eventos con pedido a cocina"*, el aviso `.aviso-filtros` (dentro de la
  sección), lo oculto de un día (`.cal-ocultos` en la cuadrícula, `.aviso-ocultos-dia` en su diálogo,
  y en cada evento oculto que se lista ahí, `.mostrar-filtro`) y `.zona-calendario`,
  que envuelve filtros, aviso y tarjeta (`data-listo` una vez hidratada).
- **La tabla de Administración se apila por el ancho de su tarjeta, no de la pantalla** (contenedor
  `tabla-admin` sobre `.admin-table-scroll`, umbral 34rem). En una media query el `rem` es siempre
  16px; en una consulta de contenedor sigue al tamaño de letra elegido, así que con letra "Muy
  grande" la tabla se apila antes de que el desglose de cada comida deje de caber en su columna.
  34rem es el menor umbral sin desbordes con las fuentes reales entre 320 y 1700px (la rejilla deja
  de desbordar en ~31.8rem): así una tablet vertical con letra normal ve la tabla y no fichas. Los
  navegadores sin consultas de contenedor (iOS 15) apilan por pantalla, a 40rem.
- **"Configuraciones" pasó a llamarse "Ajustes"** en pantalla: "Configuraciones" no cabe en la
  barra inferior, y "Ajustes" es el nombre que la gente ya conoce del teléfono. La ruta sigue
  siendo `/configuraciones`.
- **El atributo de tema es `data-theme`** (`light` / `dark`, ausente = automático), el mismo que
  ya esperaban los estilos anteriores.
- **Las preferencias viven en el dispositivo y también en la cuenta.** `localStorage` las aplica
  antes de pintar (un script en `<head>`), así nadie ve un instante de letra chica; una prueba
  unitaria verifica que ese script y la lógica en TypeScript den lo mismo en todas las
  combinaciones. La cuenta (`perfiles.apariencia_*`, opcionales: nulo = nunca eligió) hace que
  sigan a la persona entre dispositivos. Al abrir la app con sesión **la cuenta manda**, y lo que
  solo estaba en el dispositivo sube una vez para no perderse (`conciliar` en `lib/apariencia.ts`).
  En el login no hay cuenta: ahí solo se guarda en el dispositivo.
- **El diálogo de un día del calendario enfoca el diálogo y no su campo de texto**, para que el
  teléfono no abra el teclado sin que nadie lo pida (defecto anotado en el checklist de lanzamiento).
- **La marca es el escudo del Centro Cultural, y el nombre va escrito aparte.** El logo original
  trae "EL MOLINO / CENTRO CULTURAL" en azul oscuro, que en modo oscuro no se lee: en pantalla se usa
  solo el escudo (imagen decorativa, `alt=""`) y el nombre es texto real que sigue el tema. Los
  íconos de la app lo ponen sobre el crema de fondo, con la zona segura de los maskable. El archivo
  que hay mide 68×81 px: en los usos grandes (inicio de sesión, ícono de 512 px) se ve blando hasta
  que llegue una versión en alta resolución o SVG, que se cambia en `components/app/marca/`.
- **Dos reglas más que salieron de verificar la app** en 320px con letra "Muy grande": la barra
  superior (escudo y avatar) va en px y el nombre se recorta, porque si creciera con la letra no
  entraría; y en Mensajes el avatar va en la línea del nombre, porque mensaje, hilo y respuesta
  anidados reservaban cada uno una columna y a la respuesta le quedaban ~90px.
