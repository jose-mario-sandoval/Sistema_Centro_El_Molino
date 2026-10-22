# Resúmenes e ingresos por donaciones en el presupuesto

## Cambios

- Director y Administradora navegan a **Resúmenes** por la misma ruta
  `/pensiones/reporte`. Se conservan **Resúmenes Económicos**, **Otros documentos**,
  permisos de carga/descarga y retención de 12 PDF por categoría.
- Las etiquetas compartidas están en `lib/pensiones/etiquetas.ts`: **Presupuesto
  mensual**, **Presupuesto anual**, **Presupuesto ejecutado**, **Pendiente de recibir**
  e **Ingresos por donaciones**. Se aplican a configuración, recepción, navegación,
  presupuesto y etiquetas accesibles. El panel desplegable del Director conserva su
  separación de Mi pensión y dice «Registrá los pagos a la administración provenientes
  de donativos».
- `presupuesto_pensiones(date)` devuelve pensiones y un único concepto de donación.
  `concepto` distingue `pension` de `donacion`; la donación tiene `usuario_id = null`,
  sin perfil, residente, credenciales ni abono personal. Su etiqueta siempre es
  **Ingresos por donaciones**, incluso si la consulta devuelve un monto sin configurar.
  La lista mensual **Ingresos del período** muestra únicamente ingresos con un importe
  recibido mayor que cero, con su nombre o siglas y ese importe. Los abonos parciales
  muestran lo ya pagado; la donación aparece después de registrar su recepción.
  Los importes esperados y pendientes se consultan en el resumen del presupuesto;
  la vista anual conserva su desglose.
- El esperado es el snapshot de la recepción existente o, si aún está pendiente, el
  monto de la configuración vigente para ese período. El recibido es el snapshot de
  la recepción o cero. TypeScript suma estas filas una sola vez; no vuelve a sumar
  `donaciones_pensiones`. Recibir cambia el ejecutado y el pendiente, sin aumentar el
  esperado. El porcentaje usa recibido / esperado, limitado a 100 %.
- La consulta mensual y las doce consultas del año comparten esas reglas. Los
  conceptos están separados de los conteos y del resumen anual de personas.
  Los abonos parciales y los pagos históricos de cuentas exentas siguen sumándose.
- Se reutilizan las tablas, configuraciones y recepciones anteriores, con su PK por
  período, candado compartido y snapshot definitivo de monto, fecha y autor. No hay
  que volver a registrar donaciones. La fecha de recepción no determina el mes del
  presupuesto: lo determina `periodo`.
- Administradora recibe sólo siglas para personas y el concepto económico sin autor.
  No se amplían sus permisos sobre las tablas de donación ni sobre las RPC de
  configuración/recepción. Su sondeo existente actualiza el presupuesto; el Realtime
  de las tablas de donación conserva su lectura exclusiva del Director. Se mantienen
  las notificaciones existentes.

## Archivos

- Migración nueva: `supabase/migrations/20261021120000_presupuesto_donaciones.sql`.
- Modelo, consultas, etiquetas y cálculo anual: `lib/pensiones/{tipos,consultas,
  etiquetas,calculos,permisos,resumen-paneles}.ts`.
- Pantallas: `app/(app)/pensiones/presupuesto/page.tsx`,
  `_componentes/presupuesto-anual.tsx`, `_componentes/donacion.tsx`,
  `_componentes/editar-donacion.tsx`, `marcar/page.tsx`, `layout.tsx` y
  `acciones-donacion.ts`.
- Tipos generados: `lib/supabase/database.types.ts`.
- Pruebas nuevas: `tests/unit/pensiones/presupuesto-{donaciones,vistas}.test.ts`,
  `tests/integration/pensiones-presupuesto-donaciones.test.ts` y
  `tests/e2e/pensiones-presupuesto-donaciones.spec.ts`. También se actualizaron los
  fixtures de tipos y las expectativas de navegación, donación y exención existentes.
- Referencias de funcionamiento: `DESIGN.md` y `docs/pensiones.md`.

## Verificación

- `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`: aprobados.
  Vitest ejecutó **97 archivos y 1,600 pruebas**; incluyen renderizado de las vistas
  mensual y anual, los cálculos antes/después, conteos, exención y parciales.
- PostgreSQL 18.4 temporal, aislado en este equipo: se aplicaron las **43 migraciones**
  desde cero en transacciones. Se sembró una recepción **antes** de aplicar la nueva
  migración y se comprobó que aparecía sin volver a registrarla. Pasaron el ejemplo
  mensual, porcentaje, doce meses/totales anuales, snapshots, fecha distinta del
  período, permisos y privacidad. **12 recepciones concurrentes** entre dos Directores
  produjeron un único ingreso.
- Un segundo banco temporal pasó las regresiones SQL existentes: pagos parciales e
  idempotencia, exención por UUID, historiales, 12 PDF por categoría con cargas
  concurrentes/fallidas, 8 pagos concurrentes y 12 reservas push concurrentes.
  Auth, Storage, Vault, cron y HTTP tienen sustitutos locales en esos bancos; esto
  verifica PostgreSQL y RLS, pero no sustituye las suites completas con Supabase.
- `npm run test:integracion` se intentó: la guarda de entorno lo detuvo por ausencia
  de Supabase local configurado. Las pruebas no accedieron a producción.
- `npm run test:e2e -- pensiones` se intentó: el servidor de prueba no pudo iniciar
  correctamente porque faltan la URL y la llave de Supabase local. Se detuvo la
  ejecución antes de cualquier caso; los E2E quedan pendientes del entorno de CI.
- `npx playwright test pensiones --list`, con variables ficticias locales, descubrió
  correctamente **19 casos en 4 archivos**. Esto verifica descubrimiento, no ejecución.
- Revisión visual aislada con página/componentes, CSS y fuentes reales, sustituyendo
  únicamente consultas, sesión y acciones: **121 escenarios** de Director y
  Administradora a 320/375/1280 px, texto normal/enorme, claro/oscuro y contraste
  suave/alto. Sin desbordes ni errores JavaScript. Se corrigieron los enlaces anuales
  «Ver el mes» para usar el botón existente de al menos 56 px; las 24 variantes anuales
  se repitieron y todos los controles cumplen el objetivo táctil. Esta revisión no
  sustituye los E2E autenticados. Evidencia local en
  `.verificacion/presupuesto-donaciones-20261021/` (directorio ignorado por Git).
- Los tipos se regeneraron desde el esquema temporal con el generador oficial
  `@supabase/postgres-meta` 0.100.0, sin edición manual. Además de `concepto` en la RPC,
  el generador añade metadatos `ComputedFields`, `__InternalSupabase` y el formato
  actualizado de argumentos vacíos. El CI habitual debe volver a generar y comparar
  el artefacto `database-types` antes de activar la actualización.

## Activación

1. Ejecutar el workflow `base-de-datos` en Supabase temporal y aprobar integración y
   E2E. Comparar/descargar su artefacto `database-types` mediante el procedimiento de
   `CLAUDE.md`.
2. Aplicar las migraciones pendientes en orden, incluida
   `20261021120000_presupuesto_donaciones.sql`, **antes de desplegar la aplicación**.
   La nueva consulta exige la columna `concepto`. No modifica ni elimina datos.
3. Desplegar la aplicación y comprobar una recepción existente, un mes pendiente y el
   año completo como Director y Administradora. No se requieren datos de ejemplo,
   usuarios nuevos, nuevas variables de entorno ni cambios en Storage o notificaciones.
4. Mantener la configuración por UUID de la exención existente de Dani y José. Esta
   actualización no activa ni cambia esa configuración.

No se aplicaron migraciones a producción ni se desplegó desde este trabajo.
