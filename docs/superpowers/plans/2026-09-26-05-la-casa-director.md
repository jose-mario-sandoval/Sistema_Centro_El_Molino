# "La casa" del Director — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [x]`) para el seguimiento.

**Objetivo:** el Director ve y cambia, de cualquier persona activa con comidas (Director o
Residente), su semana, su plan semanal y sus ausencias, con los **mismos cierres** que todos; la
persona ve "la cambió el Director". Además agrega "extras" manuales (día + comida + cantidad + nota
opcional para la cocina) que Administración ve sumados a los del enlace público, sin nombres.

**Arquitectura:** una sola regla de permiso en la base, `puedo_gestionar_comidas_de(usuario)`, que
usan las políticas de `plan_semanal`, `selecciones_comida` y `ausencias` y las funciones nuevas
`guardar_seleccion_de` / `volver_a_plan_de` (las de siempre pasan a envolverlas con `auth.uid()`).
Todo sigue siendo `security invoker` + RLS, así que `comida_editable()` y el congelado aplican igual
para el Director. "Quién cambió" lo escriben triggers (`modificado_por`, `creado_por`), nunca el
cliente. En TypeScript, la vista de la casa reutiliza `armarSemanaPersona` por persona y pivota por
día y comida, con el mismo `resumenComida` que Administración.

**Stack:** Next.js 16 (App Router), TypeScript, Supabase/Postgres 17 (RLS, pg_cron), zod 4, Vitest,
Playwright.

**Referencias:** spec compartido `docs/superpowers/specs/2026-09-26-mensajes-comidas-calendario-design.md`
§5 (rama `claude/mensajes-admin-fijados`) · congelado: `docs/superpowers/specs/2026-09-21-ausencias-design.md`
§"El congelado" · `guardar_seleccion` vigente en `20260921180100_ausencias.sql` · políticas en
`20260917103835_comidas.sql` y `20260921180100_ausencias.sql` · `extras_de_la_semana` en
`20260921201000_extras_administracion.sql`.

**Entrega en dos fases, misma rama (`claude/comidas-la-casa`):** fase A = base de datos y capa de
datos (sin pantallas nuevas); fase B = pantallas, después de que se mergeen los PR 2–4 (reutiliza
la celda de desglose, las tarjetas/cuadrícula y el mini calendario).

---

## Decisiones de esta pista

- **Permiso en un solo lugar.** `puedo_gestionar_comidas_de(p_usuario)`: uno mismo si es Director o
  Residente; otra persona solo si quien llama es Director y el objetivo está activo con rol Director
  o Residente (`tiene_comidas`). Administración nunca. `coalesce(..., false)`: cuenta inactiva o sin
  sesión = no. `tiene_comidas` no se expone a `authenticated` (solo la usa la otra, que es
  `security definer`).
- **Nombres nuevos, sin sobrecarga.** `guardar_seleccion_de(p_usuario, …)` y
  `volver_a_plan_de(p_usuario, …)` llevan el cuerpo de siempre; `guardar_seleccion` y
  `volver_a_plan` pasan a llamarlas con `auth.uid()`. Mismos códigos (42501, MOL01, MOL04): las
  pruebas existentes siguen valiendo. El 42501 dice "Solo Directores y Residentes eligen sus
  comidas" para uno mismo y "Solo el Director elige las comidas de otra persona…" para otra.
- **Quién cambió, por trigger.** `selecciones_comida.modificado_por`, `plan_semanal.modificado_por`,
  `ausencias.creado_por`: cuando `current_user = 'authenticated'`, `nullif(auth.uid(), usuario_id)`.
  null = la propia persona, el congelado o el servidor. Los triggers **no** son `security definer`
  (tienen que ver `authenticated`). Si la persona vuelve a cambiar su comida, `modificado_por`
  vuelve a null.
- **El Director lee todo, Administración no gana nada.** Lectura de `plan_semanal` y
  `selecciones_comida`: la propia, Administración o Director. `ausencias`: la dueña (Director o
  Residente) o el Director; Administración sigue sin leerla (solo `ausentes_en()`).
- **Congelado del plan (hueco que existía).** Editar `plan_semanal` entre el cierre de una comida y
  el job de 5 minutos cambiaba una comida ya contada. Trigger `before insert or update or delete`
  en `plan_semanal`, `security definer`, que congela **solo la celda tocada** (ese día de semana y
  esa comida) con el mismo `congelar_comidas_de`, que gana dos parámetros opcionales
  (`p_dia_semana`, `p_comida`). Solo la celda: cargar un plan fila por fila no congela nada más
  (cada fila nueva no tenía plan antes), y cambiar el lunes no toca el martes.
- **`congelar_comidas_de` ya no toca comidas cerradas** (`comidas_cerradas`). Una comida cerrada ya
  fue congelada por el job: quien no tiene fila quedó "Sin definir" para siempre. Sin este cuidado,
  editar un plan (o quitar una ausencia) escribía el valor nuevo en una comida cerrada "Sin
  definir". Límite conocido que se mantiene (igual que con ausencias): una comida vencida, sin
  congelar y "Sin definir" no se puede congelar como tal (no hay fila que la represente); si en esos
  ≤ 5 minutos la persona crea el plan de esa celda, el job la congela con el plan nuevo.
- **Extras manuales en su propia tabla.** `extras_manuales` (fecha, comida, cantidad 1–50, nota
  ≤ 200 recortada, `creado_por`, `creado_en`). Solo el Director inserta, desde hoy (hora de la casa)
  aunque esa comida ya haya cerrado (un invitado de último momento; la pantalla avisa), y borra solo
  mientras la comida no cerró (`comida_sin_cerrar()`: hora límite y `comidas_cerradas`, sin la
  ventana editable). `creado_por` con `on delete set null`: la historia de la cocina sobrevive al
  borrado de una cuenta. Lee solo el Director. Sin UPDATE: se quita y se vuelve a agregar.
  `extras_de_la_semana()` conserva firma y tipo, suma enlace + manuales y responde a Administración
  **y** al Director. `extras_manuales_de_la_semana()` (`security definer`, mismos roles) devuelve
  `id, fecha, tiempo_comida, cantidad, nota` **sin autor**: una sola consulta sirve a la lista del
  Director (el `id` es para "Quitar") y a las notas de Administración (el `id` es un uuid sin
  información; sirve de `key`).
- **Filtrar explícito donde se confiaba en RLS.** Con el Director leyendo todo, `listarMisAusencias`
  pasa a `listarAusenciasDe(usuarioId, hoy)` con `.eq('usuario_id', …)` (si no, su propio panel y
  los marcadores del calendario mostrarían las ausencias de todos) y `quitarAusencia` filtra por
  `usuario_id` además de `id`. `obtenerSemanaPropia`/`obtenerPlanPropio` pasan a
  `obtenerSemanaDe`/`obtenerPlanDe` (ya filtraban; ahora traen `modificado_por`).
- **Objetivo de una acción, puro.** `usuarioObjetivo(perfil, pedido)` en `lib/comidas/permisos.ts`:
  sin pedido o uno mismo → uno mismo; otra persona → solo el Director; Administración nunca. La
  base lo vuelve a exigir (objetivo inactivo o de Administración → 42501).
- **Voz.** `lib/comidas/voz.ts`: segunda persona (la propia persona: "¿Vas a almorzar…?", "según tu
  plan", "Volver a mi plan") y tercera (el Director mirando a otra: "¿Va a almorzar…?", "según su
  plan", "Volver a su plan"). "la cambió el Director" en las dos voces cuando `cambiadaPorOtro`
  (solo un Director puede cambiar la comida de otra persona). Se conecta ya en `comida-del-dia.tsx`.
- **Resumen idéntico al de Administración.** `armarSemanaDeLaCasa` usa `resumenComida` sobre los
  mismos valores efectivos; una prueba compara contra `armarDiaAdministracion` con el mismo
  escenario.
- **Pruebas de integración: limpiar el plan antes que las selecciones.** Con el trigger nuevo,
  borrar un plan congela lo vencido de esa celda; si las selecciones se borran antes, quedan filas
  sueltas para la prueba siguiente.

---

## Mapa de archivos (fase A)

```
supabase/migrations/20260926110000_comidas_director.sql   permiso, columnas, triggers, políticas, *_de, congelado del plan
supabase/migrations/20260926110100_extras_manuales.sql    tabla, RLS, extras_de_la_semana(), extras_manuales_de_la_semana()
lib/supabase/database.types.ts                            a mano, en el formato del generador (CI lo confirma)
lib/supabase/filas-completas.ts                           exigirFilasCompletas (idéntico al del PR 2)
lib/comidas/permisos.ts                                   usuarioObjetivo
lib/comidas/voz.ts                                        textos en segunda/tercera persona
lib/comidas/tipos.ts                                      SeleccionGuardada.cambiadaPorOtro, ValorPlan
lib/comidas/vista.ts                                      modificado_por en filas; valorTrasGuardar(porOtro); armarSemanaDeLaCasa; agruparPorEstado
lib/comidas/consultas.ts                                  obtenerSemanaDe, obtenerPlanDe, obtenerSemanaDeLaCasa, obtenerNotasExtras
lib/ausencias/{tipos,consultas}.ts                        Ausencia.marcadaPorOtro; listarAusenciasDe
lib/validacion/{comidas,ausencias}.ts                     usuarioId opcional; esquemaExtra, esquemaQuitarExtra
app/(app)/comidas/acciones.ts                             *_de con el objetivo; guardarPlan del objetivo
app/(app)/comidas/casa/acciones.ts                        nuevo: agregarExtra, quitarExtra
app/(app)/calendario/acciones-ausencias.ts                usuarioId opcional; quitar filtra por usuario
app/(app)/comidas/_componentes/comida-del-dia.tsx         textos desde voz.ts ("la cambió el Director")
app/(app)/calendario/_componentes/panel-ausencias.tsx     "Solo vos y el Director ven estas fechas."
app/(app)/{calendario,comidas/semana,comidas/plan}/page.tsx  nombres nuevos de las consultas
tests/unit/comidas/{permisos,voz,vista,validacion,reglas,acciones}.test.ts
tests/unit/ausencias/{ausencias,acciones}.test.ts · tests/unit/supabase/filas-completas.test.ts
tests/integration/comidas-director.test.ts                nuevo (espejo del banco)
tests/integration/{ausencias,comidas}.test.ts             reglas nuevas + orden de limpieza
tests/e2e/comidas.spec.ts                                 orden de limpieza
```

---

## Fase A — base de datos y capa de datos

Hecha. Banco local (`probar-la-casa.mjs`, scratchpad): 151 comprobaciones en verde; en
`probar-ausencias.mjs` solo cambia, a propósito, "el Director ve 0 ausencias ajenas". Las pruebas
de integración nuevas y actualizadas corren en CI.

### Tarea 1: migración `20260926110000_comidas_director.sql`

- [x] **Paso 1:** banco (`probar-la-casa.mjs` en el scratchpad): escribir los casos primero y verlos
  fallar contra las migraciones actuales — lectura por rol (Director lee todo; residente solo lo
  suyo; Administración sin ausencias); `guardar_seleccion_de` (Director por residente → persona +
  `modificado_por`; igual a la referencia borra; cerrada → MOL01; objetivo Administración o inactivo
  → 42501; residente por otro → 42501; Director por sí mismo → null; la persona vuelve a cambiar →
  null); `volver_a_plan_de` con la misma matriz; escrituras directas del Director en `plan_semanal`
  (también director2 sobre director); ausencia del Director para un residente sobre comidas vencidas
  (congela antes, `creado_por`), la quita; residente2 no; congelado del plan (editar tras el cierre no
  cambia el valor; solo la celda; comida cerrada "Sin definir" no se toca; cascada de cuenta); el job
  sigue congelando con `modificado_por` null; las pruebas de ausencias de siempre siguen pasando.
- [x] **Paso 2:** escribir la migración; `node probar-la-casa.mjs` (con `RAIZ_REPO` = este worktree)
  hasta TODO BIEN, y `probar-ausencias.mjs` contra la rama.
- [x] **Paso 3:** commit.

### Tarea 2: migración `20260926110100_extras_manuales.sql`

- [x] **Paso 1:** banco: RLS (residente/Administración no insertan ni leen; Director inserta desde
  hoy, no en el pasado, `creado_por` = él; borra desde hoy), checks (cantidad 1–50, nota recortada
  ≤ 200), `extras_de_la_semana` suma enlace + manuales para Administración y Director, residente
  recibe `[]`; `extras_manuales_de_la_semana` sin autor. Ver fallar.
- [x] **Paso 2:** migración; banco verde. **Paso 3:** commit.

### Tarea 3: tipos de Supabase y `exigirFilasCompletas`

- [x] **Paso 1:** `database.types.ts` a mano: columnas nuevas (Row/Insert/Update + relaciones), tabla
  `extras_manuales`, funciones nuevas y `congelar_comidas_de` con args opcionales, en orden
  alfabético como el generador.
- [x] **Paso 2:** `lib/supabase/filas-completas.ts` + prueba, idénticos a los del PR 2.
- [x] **Paso 3:** typecheck. Commit.

### Tarea 4: `usuarioObjetivo` y validación

- [x] **Paso 1:** pruebas: `tests/unit/comidas/permisos.test.ts` (Director → otro id; residente →
  solo él; Administración nunca; pedido vacío/igual = uno mismo); `validacion.test.ts` y
  `ausencias.test.ts` (`usuarioId` opcional y uuid; `esquemaExtra`: fecha, comida, cantidad entera
  1–50 también como texto, nota recortada ≤ 200 y vacía → null; `esquemaQuitarExtra`). Ver fallar.
- [x] **Paso 2:** implementar. Verde. Commit.

### Tarea 5: vista — `cambiadaPorOtro`, `armarSemanaDeLaCasa`, `agruparPorEstado`

- [x] **Paso 1:** pruebas en `vista.test.ts`/`reglas.test.ts`: `valorEfectivo` deja pasar
  `cambiadaPorOtro`; `armarSemanaPersona` lo marca desde `modificado_por` (y no agrega la clave si es
  null: las pruebas con `toEqual` siguen iguales); `planDesdeFilas` idem; `valorTrasGuardar(…,
  porOtro)`; `armarSemanaDeLaCasa` (7 días × 3 comidas, personas en orden, `abierta`/`cierre`,
  ausencias por persona) y **paridad del resumen** con `armarDiaAdministracion`;
  `agruparPorEstado` (sin definir primero, solo grupos con personas, etiquetas). Ver fallar.
- [x] **Paso 2:** implementar. Verde. Commit.

### Tarea 6: `voz.ts` y "la cambió el Director" en `comida-del-dia.tsx`

- [x] **Paso 1:** `tests/unit/comidas/voz.test.ts`: pregunta, origen, botón de volver y etiqueta de
  nota en las dos voces. Ver fallar.
- [x] **Paso 2:** implementar; `comida-del-dia.tsx` usa `voz.ts` con voz propia. Verde. Commit.

### Tarea 7: consultas

- [x] **Paso 1:** `obtenerSemanaDe(usuarioId, lunes)` y `obtenerPlanDe(usuarioId)` (con
  `modificado_por`); `listarAusenciasDe(usuarioId, hoy)` con `marcadaPorOtro`;
  `obtenerSemanaDeLaCasa(lunes)` (solo Director: personas de `listarPerfiles`, planes y selecciones
  con `{ count: 'exact' }` + `exigirFilasCompletas`, ausencias, cerradas, horas límite);
  `obtenerNotasExtras(lunes)`. Páginas actuales con los nombres nuevos.
- [x] **Paso 2:** typecheck + tests. Commit.

### Tarea 8: acciones

- [x] **Paso 1:** pruebas con cliente falso (`tests/unit/comidas/acciones.test.ts`,
  `tests/unit/ausencias/acciones.test.ts`): `guardarSeleccion`/`volverAPlan` llaman a `*_de` con el
  objetivo (propio por defecto; el del pedido para el Director; residente con otro id → fallo sin
  tocar la base); `guardarPlan` escribe `usuario_id` del objetivo; `marcarAusencia` lee `usuarioId`
  del formulario; `quitarAusencia` filtra por `usuario_id`; `agregarExtra` (solo Director, no en el
  pasado, inserta con `creado_por`) y `quitarExtra` (0 filas → "ya no existe"). Ver fallar.
- [x] **Paso 2:** implementar (`app/(app)/comidas/casa/acciones.ts` nuevo). Verde. Commit.

### Tarea 9: pruebas de integración y textos

- [x] **Paso 1:** `tests/integration/comidas-director.test.ts` (espejo del banco, limpia
  `extras_manuales`); actualizar `ausencias.test.ts` (el Director ve las de todos) y
  `comidas.test.ts` (`extras_de_la_semana` responde al Director); orden de limpieza plan → selecciones
  en integración y e2e.
- [x] **Paso 2:** "Solo vos y el Director ven estas fechas." en el panel de ausencias.
- [x] **Paso 3:** lint + typecheck + test + banco. Commit. `git push -u origin claude/comidas-la-casa`
  (sin PR todavía).

---

## Fase B — pantallas (con los PR 1–4 adentro)

- [x] Revisión de la fase A: un extra se quita solo mientras su comida no cerró
  (`comida_sin_cerrar()`, sin la ventana editable: uno de dentro de semanas se puede quitar) y se
  agrega desde hoy aunque haya cerrado (la pantalla avisa antes); `extras_manuales.creado_por` pasa a
  `on delete set null`; INSERT solo de las columnas que elige el Director; comentarios de
  `modificado_por`/`creado_por` corregidos; borrar una celda del plan sin filas afectadas ya no dice
  que guardó.
- [x] Traer los PR 1–4 (#22, #20, #21, #23) con merge, no con rebase: el repo mergea con squash y un
  merge posterior de `origin/master` los absorbe. `filas-completas.ts` coincide con el del PR 2.
- [x] Regenerar `database.types.ts` desde el artefacto del CI (tras el push): salió idéntico al
  escrito a mano.
- [x] Subpestaña **"La casa"** en `PestanasComidas` (solo Director) → `/comidas/casa`
  (`exigirRol('director')`): navegación de semana, "Ver la semana de: [persona]" (formulario GET),
  tabla de la semana con la celda de desglose del PR 2 (modo botón) usando `obtenerSemanaDeLaCasa`;
  al tocar una celda, debajo "Almuerzo del miércoles 23/9" con `agruparPorEstado` (nombres reales);
  cada nombre abre su `ComidaDelDia` en línea con `usuarioId` y voz ajena (solo lectura si cerró).
- [x] "Agregar extra" (día, comida, cantidad con − y +, nota con el aviso "La cocina lee esta nota:
  no escribas nombres", aviso si la comida ya cerró) → `agregarExtra`; lista de extras de la semana
  (`obtenerNotasExtras`) con "Quitar" solo mientras la comida no cerró → `quitarExtra`.
- [x] **`/comidas/casa/[persona]`**: Semana (tarjetas del PR 4), Plan (cuadrícula del PR 4) y
  Ausencias (mini calendario del PR 3) de esa persona, en tercera persona (`voz.ts`), pasando
  `usuarioId` a las acciones. Persona inválida, inactiva o de Administración → 404.
- [x] La persona ve "La marcó el Director" en sus ausencias (`marcadaPorOtro`) y "la cambió el
  Director" en la celda del plan (`cambiadaPorOtro` del plan: panel y nombre accesible).
- [x] Administración ve las notas de los extras (`notasPorComida`) debajo de "+N extra".
- [x] e2e (`tests/e2e/comidas-casa.spec.ts`): Director cambia la comida de un residente → el
  residente ve "la cambió el Director"; "Ver la semana de" → plan y ausencia del residente, que ve
  "La marcó el Director"; comida cerrada en solo lectura; extra manual con nota → Administración ve
  la cifra y la nota, sin nombres; sin pestaña ni acceso para Residente y Administración; "Mis
  ausencias" del Director solo con las suyas; teléfonos de 320 y 375px.
- [x] DESIGN.md §8 y §12 (La casa, anclas). CLAUDE.md no está en `master` (PR aparte): sus reglas
  nuevas van en la descripción del PR.
- [x] Barrido visual: banco estático (esbuild + Playwright) a 320/375/768/1280 × claro, oscuro,
  alto, alto oscuro, grande y enorme, con paneles cerrados y abiertos: sin scroll lateral, sin
  controles de menos de 56px y ninguna letra bajo `--t-xs` en lo nuevo.
- [x] Abrir el PR con CI en verde (#24).
- [x] Segunda revisión: "quiénes comen" como una fila más de la tabla, debajo del día tocado, con el
  foco en su título (y a la vista también cuando la fila apilada es más alta que la pantalla);
  la página de una persona titulada "Comidas de Juan" con "Su semana"/"Su plan"/"Sus ausencias" en
  un control segmentado propio y el texto de "Comidas" de la casa; paridad `comida_sin_cerrar` ↔
  `comidaSinCerrar` con casos compartidos; "Indicá qué puede comer" en tercera persona; el foco no se
  pierde al quitar un extra o una ausencia; "Cambió el Director" a la vista en la tarjeta del día y
  "Director" en la celda del plan (con leyenda).
- [x] Traer de nuevo el PR #21 (piso de letra del mini calendario) antes del último push.
