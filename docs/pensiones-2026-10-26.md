# Pensiones de la casa y envío de donaciones

Actualización del 26 de octubre de 2026. Esta guía complementa [Pensiones](pensiones.md).
La migración y el código se preparan en el repositorio; no se aplican a producción automáticamente.

## Comportamiento

- El registro del Director conserva **Ingresos por donaciones** y ahora usa **Registrar envío**,
  **Enviado**, **Pendiente de envío** y **Enviado el…**. La confirmación describe el envío del
  dinero a la administración. Se reutilizan las filas, fechas, importes, RPC y tablas anteriores
  de recepción, sin volver a registrar nada. Sigue existiendo un único registro compartido por
  período entre todos los Directores. Presupuesto conserva **Pendiente de recibir** y sus cálculos.
- **Pensiones de la casa** (`/pensiones/casa`) aparece exclusivamente al Director. El listado muestra
  residentes y otros directores activos, por nombre. No utiliza `fuera_de_conteos`, que solo afecta
  Comidas. La pensión del Director de la sesión continúa en **Marcar pensiones**.
- Elegir persona y año muestra categoría, cuota, importe pagado, saldo, estados e historial completo.
  Se reutiliza `MarcarPensiones` para pagos completos, parciales y varios meses. Antes de confirmar
  se muestran el titular, los períodos y el total. Cambiar persona o año reinicia el borrador.
- El servidor exige Director y comprueba titular activo Residente/Director, distinto del actor.
  SQL repite la autorización después de tomar el candado del titular. Las consultas del historial
  filtran siempre `usuario_id`, incluidas las propias del Director, aunque RLS permita leer más filas.
- `pensiones_pagos.usuario_id` sigue siendo el titular. La nueva columna `registrado_por` guarda
  quién registró el movimiento y se fija desde Auth. Los registros anteriores se atribuyen a su
  titular porque antes todos eran propios; no se modifican importes, fechas ni categorías.
  El historial personal muestra **Registrado por el Director** cuando ambas identidades difieren.
  Una cuenta autora de pagos ajenos debe desactivarse en lugar de eliminarse, para conservar
  esta trazabilidad; Ajustes lo explica antes de intentar borrar la cuenta.
- `registrar_abonos_pension` es el motor privado compartido por las RPC propias y ajenas.
  Usa el mismo candado por titular que cuotas, participación y exención, valida el lote completo y
  calcula la cuota del titular. Rechaza snapshots obsoletos, importes superiores al saldo y pagos
  de cuentas exentas. Conserva los snapshots históricos del primer abono de cada período.
- Los reintentos con snapshots obsoletos se rechazan sin insertar. Una petición de pago completo
  de un mes ya pagado devuelve cero movimientos nuevos. La RPC histórica `marcar_pensiones`
  conserva su contrato de devolver también los abonos anteriores.
- No se amplían las políticas de lectura existentes ni se conceden escrituras directas a la app.
  Residente sigue consultando y registrando solo lo propio; Administración y Administradora no
  pueden usar las RPC nuevas ni registrar pagos ajenos. Los helpers privados no son invocables
  por `authenticated` ni `anon`.
- Los movimientos nuevos programan el aviso existente a Administradora. La consulta del aviso
  conserva las siglas del titular, con reserva única por pago/dispositivo; un reintento no crea
  eventos ni avisos repetidos. No se incluyen nombres ni identidad del Director en el push.
- La revalidación de `/pensiones` actualiza la sesión que registra. Realtime, el sondeo de 30 segundos
  y el retorno a la pestaña conservan actualizadas las vistas personales y el presupuesto.
  La exención de «Dani y José» conserva su UUID y vigencia; esta migración no la activa ni la cambia.

## Archivos principales

- `app/(app)/pensiones/casa/page.tsx`: consulta de personas y años, exclusiva del Director.
- `app/(app)/pensiones/_componentes/marcar.tsx`: formulario compartido y atribución del historial.
- `app/(app)/pensiones/acciones.ts`, `lib/validacion/pensiones.ts`: pago ajeno con validación compartida.
- `lib/pensiones/consultas.ts`, `permisos.ts`, `tipos.ts`: lecturas autorizadas, navegación y autoría.
- Componentes `donacion.tsx`, `editar-donacion.tsx`, `marcar/page.tsx`, `acciones-donacion.ts`
  y `lib/pensiones/resumen-paneles.ts`: terminología del envío.
- `supabase/migrations/20261027020011_pensiones_de_la_casa.sql` y
  `lib/supabase/database.types.ts`: esquema, funciones y tipos regenerados.
- `app/(app)/configuraciones/acciones.ts`: impide eliminar cuentas autoras de pagos ajenos.
- Pruebas de Casa en `tests/unit/pensiones/casa-*.test.ts`,
  `tests/integration/pensiones-casa.test.ts` y `tests/e2e/pensiones-casa.spec.ts`;
  pruebas de donaciones y navegación actualizadas.

## Verificación de esta entrega

- `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`: aprobados;
  **100 archivos y 1,655 pruebas unitarias**.
  El build usa las variables ficticias del CI. Su primer intento no pudo descargar Google Fonts
  en el sandbox; el segundo, con red habilitada, compiló y verificó TypeScript correctamente.
- Banco PostgreSQL real y aislado: 44 migraciones aplicadas en transacciones separadas.
  Incluye actualización con abonos normales y un adelanto real de una cuenta ya exenta;
  el backfill conserva exactamente los importes, fechas e históricos y restaura su trigger.
  Aprobados permisos por rol, objetivos inválidos, RLS, helpers privados, titular Residente y
  otro Director, cuotas distintas, pagos parciales/múltiples, lote atómico, snapshots,
  presupuesto y lectura personal. Diez sesiones simultáneas del titular y Director crean
  un único abono; se comprueba también desactivación mientras espera el candado.
- Avisos en SQL: siglas del titular, evento por abono y reserva idempotente por dispositivo;
  no hay eventos nuevos ante reintentos ni pagos ficticios para la cuenta exenta.
- Banco de regresión previo aprobado: pagos, roles, reportes con Storage simulado, presupuesto
  anual, donaciones compartidas (12 registros concurrentes), push y exención.
- Tipos generados desde la base temporal y sincronizados con el artefacto oficial
  `database-types` del [CI 40440360084](https://github.com/jose-mario-sandoval/Sistema_Centro_El_Molino/actions/runs/40440360084),
  correspondiente al commit `11c9dfd`. No editados a mano.
- QA visual e interacción con página, componentes, CSS y fuentes reales y backend simulado:
  64 combinaciones a 320/375/768/1280 px, letra normal/enorme, claro/oscuro, contraste suave/alto
  y estados normales/exentos. Sin desbordamientos, controles menores de 56 px ni errores JS;
  comprobados confirmación, foco, payload de abonos y reinicio por persona/año.
- Integración y E2E con Auth, PostgREST y Storage reales de Supabase están preparadas para
  el CI temporal. No se ejecutaron localmente ni contra producción. El banco SQL y el arnés
  visual no sustituyen esas pruebas.

## Activación

1. Ejecutar el CI con Supabase temporal para integración y E2E. Comparar el artefacto
   `database-types` con los tipos del repositorio. Las pruebas rechazan bases remotas.
2. Con `.env.local` configurado para el proyecto correcto, revisar **todas** las pendientes:

   ```powershell
   npm run db:aplicar -- --dry-run
   ```

3. Aplicar las pendientes en orden, incluida `20261027020011_pensiones_de_la_casa.sql`:

   ```powershell
   npm run db:aplicar
   ```

   Hacerlo antes o junto al despliegue: las consultas nuevas seleccionan `registrado_por`.
   No volver a ejecutar los registros de donaciones ni crear cuentas/cuotas/pagos de prueba
   en producción. No se necesitan variables, permisos de Storage ni preferencias nuevas.
4. Desplegar y comprobar el registro de donación existente, las pestañas por rol, la consulta
   de un residente y otro Director, y el historial personal. Para probar escrituras, utilizar
   únicamente cuentas/períodos autorizados: los pagos son definitivos.
5. Verificar historial y presupuesto desde otras sesiones, y el aviso de Administradora con
   las siglas del titular. La confirmación y su reintento deben producir un solo movimiento/aviso.

Comprobaciones SQL de lectura después de aplicar:

```sql
select count(*) as pagos_sin_autor
from public.pensiones_pagos where registrado_por is null;

select usuario_id, periodo, sum(abono_centavos) as pagado, max(monto_centavos) as cuota
from public.pensiones_pagos group by usuario_id, periodo
having sum(abono_centavos) > max(monto_centavos);

select has_function_privilege('authenticated',
  'public.registrar_abonos_pension(uuid,boolean,date[],integer[],integer[],integer[])', 'execute')
  as helper_expuesto;
```

Se esperan cero pagos sin autor, ninguna fila con exceso y `helper_expuesto = false`.
Verificar el historial de migraciones; no asumir que el workflow de producción se ejecutó.
