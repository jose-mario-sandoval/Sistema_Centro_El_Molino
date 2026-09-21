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

**Excepción única, documentada:** la cuadrícula mensual del calendario en teléfonos. Siete columnas
en 320px dejan días de ~36px de ancho. Cumple WCAG 2.2 AA (24px) pero no este contrato, y por eso en
el teléfono el calendario abre en **lista** y la cuadrícula queda detrás de *"Ver mes"*.

### Tres reglas de ancho que salieron de verificar, no de planificar

Las tres fallaron en el prototipo con letra "Muy grande" en un teléfono de 320px:

1. **Los márgenes siguen al ancho de la pantalla, no al tamaño de letra.** Si el relleno lateral de
   las superficies está en `rem`, subir la letra engorda los márgenes y deja *menos* sitio justo para
   el texto que se quiso agrandar. Token: `--marco: min(1.25rem, 4.5vw)`.
2. **Ningún `min-width` en `rem` dentro de una columna.** Crece con la letra hasta superar el ancho
   disponible. Siempre `min-width: min(13rem, 100%)`.
3. **Columnas de rejilla con `minmax(0, 1fr)`, nunca `1fr` a secas.** `1fr` tiene como mínimo su
   contenido: un solo título largo ensancha la columna entera y rompe la página.

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

Cada vez que la interfaz se vuelve a pintar, el foco vuelve al control que lo tenía: al elegir una
opción, el foco queda en esa opción; al tocar *Listo*, vuelve al botón que abrió la fila; al cambiar
de sección, pasa al contenido principal para que un lector de pantalla anuncie dónde quedó la persona.

---

## 8. Reglas de composición

- **Sin franjas laterales.** `border-left` de color como acento en tarjetas, hilos o avisos está
  prohibido. Los hilos de mensajes se marcan con sangría más superficie hundida, que es lo que un
  hilo es: contenido *dentro* de otro.
- **Sin tarjetas dentro de tarjetas.** En neumorfismo se lee como un error de profundidad. Lo que va
  dentro de una meseta elevada es plano o hundido, nunca elevado otra vez.
- **Sin modales como primer recurso.** El único modal justificado es la confirmación de borrado.
- **Una sola interacción para una sola pregunta.** Plan semanal y Semana responden ambas a "¿qué
  hacés con esta comida?" y por lo tanto usan **exactamente el mismo componente**, incluido el campo
  de hora o de nota cuando el estado lo pide. Quien aprende una ya sabe la otra. Es la decisión de
  mayor impacto de todo el rediseño.
- **Lo primero en pantalla es algo que todavía se puede cambiar.** En la semana en curso, hoy va
  primero; los días ya cerrados se pliegan al final. Un domingo, con la vista por semanas, seis de
  siete días están cerrados: sin este orden, la persona tendría que pasar por seis días bloqueados
  antes de llegar a algo útil.
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

## 12. Al portar a Next.js

Fuera del alcance del prototipo, pero decidido de antemano para no improvisarlo:

- `app/globals.css` se reescribe entero. Es la única capa visual: no hay Tailwind ni librería de UI.
- `NavegacionMovil` (hoy un `<select>` pelado) pasa a barra inferior fija de 4 destinos.
- `plan-editable.tsx` se unifica con `comida-del-dia.tsx`.
- `semana-administracion.tsx` pierde el scroll horizontal en favor de conteos más fichas.
- Configuraciones gana la sección Apariencia, con el driver de `data-*` que hoy falta: los hooks
  `[data-theme]` existen en CSS y **ningún `.tsx` los escribe**. El prototipo usa ese mismo
  atributo (`light` / `dark`, ausente = automático), así que el port solo tiene que escribirlo.
- El plan semanal de producción ya guarda `nota` (`plan_semanal.nota`). El componente unificado debe
  mostrar el campo de hora o de nota también en el plan, como hace el prototipo.
- **Tests.** Los E2E usan ~215 selectores semánticos que sobreviven un rediseño visual, pero ~15
  locators por clase CSS se romperían: `.sidebar`, `.feed-mensajes`, `.cal-event`, `.thread`,
  `.week-list .status-chip`, `.toast`, `.msg`, `.locked-banner`, `.sidebar .avatar`. O se conservan
  esos nombres como anclas estables, o se actualizan los specs. Conviene decidirlo antes de empezar.
