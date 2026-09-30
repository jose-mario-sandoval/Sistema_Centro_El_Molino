# Calendario: filtros por tipo con colores de cada arcángel, ausencias y pedidos a cocina — plan

> **Para agentes:** SUB-SKILL REQUERIDO: superpowers:test-driven-development y
> superpowers:verification-before-completion. Los pasos usan casillas (`- [ ]`).

**Pedido del usuario:** "En el calendario todavía no veo la sección de filtros, y esos filtros tienen
que tener su código de color: San Gabriel, San Rafael y San Miguel con colores distintos que se
distingan también en el calendario, como Google Calendar". Aclarado: se filtran **los 4 tipos**
(San Rafael, San Gabriel, San Miguel, Otro), **"Mis ausencias"** (las marcas del calendario grande) y
**"Solo eventos con pedido a cocina"**; colores **tradicionales**: San Miguel rojo, San Gabriel azul,
San Rafael verde, Otro gris.

**Arquitectura:** sin migración ni cambios de servidor. El filtrado es del lado del navegador sobre
los eventos que la página ya cargó; la lógica es pura (`lib/calendario/filtros.ts`) y el componente
es una capa fina. La elección se guarda en el dispositivo (`localStorage`).

**Referencias:** `DESIGN.md` §1 (relieve), §2 (contraste), §4 (56px, piso `--t-xs`, excepción de la
cuadrícula del mes), §5 (contraste alto), §8 (sin franjas laterales), §12 (anclas E2E);
`docs/superpowers/specs/2026-09-21-eventos-mensajes-comidas-design.md` §1 (categorías).

---

## Decisiones

- **Administración no ve nada de esto.** Ni sección de filtros, ni marcas, ni colores, ni
  `data-tipo`: sus eventos llegan sin tipo (`eventos_para_cocina()`), y su calendario queda como hoy.
  El E2E de privacidad se amplía: su HTML no contiene etiquetas de categoría ni la sección.
- **Qué se filtra:** una lista de "ocultos" con seis claves: los cuatro tipos, `ausencias` y
  `sin_pedido` ("Solo eventos con pedido a cocina" = ocultar los que no piden nada: ni
  `requiere_cocina` ni `requiere_otro_texto`). Un evento se ve si su tipo no está oculto y, con
  `sin_pedido`, si pide algo. Por defecto no se oculta nada.
- **"Mis ausencias"** oculta las marcas del calendario grande (borde punteado + valija en la
  cuadrícula, etiqueta en la lista). El diálogo del día sigue diciendo "Marcaste que no vas a estar":
  es el detalle del día y avisa que las comidas están canceladas. La tarjeta "Mis ausencias" de abajo
  no se toca.
- **Chips = interruptores con `aria-pressed`.** Mostrado = hundido + visto (✓), como toda opción
  elegida (DESIGN §1); oculto = elevado (se toca para volver a mostrarlo) + ojo tachado + "Oculto"
  escrito. Nunca solo el color. "Solo eventos con pedido a cocina" es `role="switch"` con su propio
  chip (icono de la cocina, "Sí"/"No" escrito). 56px de alto.
- **Teléfono:** la fila no entra (6 chips ≈ 5 filas), así que en un contenedor angosto (consulta de
  contenedor en `rem`, sigue a la letra) los filtros van detrás de un botón **"Filtros"** con
  `aria-expanded`; en escritorio se ven siempre. Lo oculto sigue a la vista por el aviso.
- **Aviso:** si algo está oculto, arriba de la tarjeta del calendario: *"Estás ocultando: San Miguel y
  Mis ausencias."* + **"Mostrar todo"**. Región `aria-live` que existe siempre (anuncia al cambiar).
- **Ocultos por día:** en la cuadrícula, ojo tachado + "2 ocultos" (en el teléfono, ojo + "2"); en
  la lista, los días con todo oculto no se listan, los días con parte oculta dicen "+1 oculto", y al
  final "N eventos ocultos por los filtros este mes"; en el diálogo del día, *"Hay 2 eventos ocultos
  por los filtros."* + "Mostrarlos" (los muestra en el diálogo sin cambiar los filtros). El nombre
  accesible del día dice los tipos y cuántos están ocultos.
- **Colores y marcas:** tokens `--ev-<tipo>` (texto, borde, relleno de la marca) y `--ev-<tipo>-bg`
  (tinte) en `:root`, oscuro (media query y `[data-theme=dark]`) y contraste alto. Marca corta
  `MARCA_TIPO` = SR / SG / SM / Otro, siempre junto al color: relleno sólido con la sigla. Donde el
  nombre completo va al lado (chips, pastilla, formulario) la marca de "Otro" es el cuadrito gris sin
  letras (así no se lee "Otro Otro"). `varsTipo(tipo)` como `varsEstado`. Sin franjas laterales (§8):
  tinte + marca.
  - Cuadrícula: `.cal-event` con tinte y la marca como `::before` (el texto del evento no cambia: el
    E2E compara `.cal-event` con "19:30 Charla de prueba").
  - Puntos del teléfono: la marca con su sigla (SR/SG/SM) y "Otro" como punto gris sin letras.
  - Lista, diálogo del día (`.pastilla-tipo` en su color, ahora también "Otro") y el selector de
    tipo del formulario (la marca al lado de cada opción).
- **San Miguel no se confunde con los rojos de estado:** carmesí (tono 22° en Lab) contra el ladrillo
  de `--peligro`/"No comer" (35°), más croma, y siempre con "SM".
- **Valores medidos, no estimados** (script de contraste + simulación Machado 2009 de protanopía,
  deuteranopía y tritanopía): texto ≥4.5:1 sobre el tinte y sobre el fondo en suave, ≥7:1 en alto;
  marca ≥3:1 contra el fondo. Los cuatro colores se separan también por **luminosidad** (verde el más
  oscuro, gris el más claro en tema claro; al revés en oscuro), y la sigla hace el resto. Una prueba
  unitaria lee `globals.css` y verifica los contrastes en los cuatro modos.
- **Persistencia sin salto:** `localStorage` (`molino-calendario`, `{"ocultos":[...]}`), leído con
  `useSyncExternalStore` (el servidor pinta "todo a la vista"; sin errores de hidratación). Para que
  una recarga no muestre un instante lo oculto, un script previo al pintado en `<head>` (junto al de
  apariencia) copia lo guardado a `html[data-cal-oculta]`, y el CSS esconde esos eventos mientras el
  calendario no hidrató (`.zona-calendario:not([data-listo])`) y reserva el lugar del aviso. El script
  no nombra categorías ni ausencias (el HTML de Administración no las contiene); una prueba verifica
  que diga lo mismo que `leerFiltros`.

## Mapa de archivos

```
lib/calendario/tipos.ts                         + MARCA_TIPO, varsTipo, tienePedido
lib/calendario/filtros.ts                       nuevo — filtros: leer/escribir, alternar, visibles, ocultos, textos, script previo
app/(app)/calendario/_componentes/usar-filtros.ts   nuevo — hook (useSyncExternalStore + localStorage con try/catch)
app/layout.tsx                                  + script previo al pintado de filtros
app/(app)/calendario/page.tsx                   cabecera del mes como prop; conFiltros
app/(app)/calendario/_componentes/calendario-mes.tsx   zona con filtros, aviso, colores, ocultos por día
app/(app)/calendario/_componentes/filtros-calendario.tsx  nuevo — chips, interruptor y aviso
app/(app)/calendario/_componentes/modal-dia.tsx        ocultos del día + "Mostrarlos"
app/(app)/calendario/_componentes/insignias-evento.tsx pastilla del tipo con su color y marca
app/(app)/calendario/_componentes/campos-evento.tsx    marca junto a cada tipo
components/ui/iconos.tsx                        + icono "oculto" (ojo tachado)
app/globals.css                                 tokens --ev-*, chips, aviso, colores en cuadrícula/lista/puntos
DESIGN.md                                       §2.4 colores de evento, §8 filtros, §12 anclas
tests/unit/calendario/filtros.test.ts           nuevo
tests/unit/calendario/tipos.test.ts             + marcas y varsTipo
tests/unit/calendario/colores-evento.test.ts    nuevo — contrastes leídos de globals.css
tests/e2e/calendario.spec.ts                    + filtros (Director, Residente, Administración, teléfono)
```

## Tareas

- [ ] 1. `tipos.ts`: `MARCA_TIPO`, `varsTipo`, `tienePedido` (pruebas primero).
- [ ] 2. `filtros.ts`: modelo, lectura robusta (JSON roto, claves de más o de menos → por defecto),
      escritura, alternar, `eventoVisible`, `filtrarEventos`, `textoOcultos`, etiqueta accesible del
      día, script previo al pintado (pruebas primero, incluida la equivalencia script ↔ TypeScript).
- [ ] 3. Tokens `--ev-*` en los cuatro modos + prueba de contraste que lee `globals.css`.
- [ ] 4. Hook `usarFiltros` (almacén externo, memoria si `localStorage` falla, evento entre pestañas).
- [ ] 5. UI: sección Filtros, aviso, colores en cuadrícula/lista/puntos/diálogo/formulario, ocultos
      por día, script en `<head>`, CSS previo a la hidratación.
- [ ] 6. E2E: Director (chips, ocultar San Miguel, aviso, "Mostrar todo", recarga, solo cocina),
      Residente, Administración (sin filtros ni marcas ni categorías en el HTML), teléfono 375×812.
- [ ] 7. Verificación visual: arnés con los componentes reales, 320/375/768/1280 × claro/oscuro/alto/
      grande/enorme, lista y cuadrícula, diálogo y formulario; simulación de protanopía y
      deuteranopía.
- [ ] 8. `DESIGN.md`; lint, typecheck, unit, build; PR y CI.
