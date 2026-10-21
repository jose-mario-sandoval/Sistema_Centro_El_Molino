# Pensiones: donación compartida, exención y avisos de pagos

Preparado en `feat/pensiones-donaciones-exencion-avisos`, desde `c06a448` (versión actual con
pagos parciales, presupuesto anual y eliminación autorizada de reportes). No se publicaron
pantallas ni se aplicaron migraciones a producción.

## Comportamiento

- `ETIQUETA_REPORTE` es la fuente de «Resúmenes Económicos» y «Otros documentos». Se conservan
  las claves `finanzas` y `otras_utilidades`, todos los PDF, sus permisos y sus descargas. No hay
  migración de registros o archivos de reportes: siguen siendo 12 por categoría, retirando el
  más antiguo solo después de incorporar correctamente el nuevo.
- El Director configura una única donación mensual de la casa en Editar. Se guarda en centavos,
  con vigencia desde un mes actual o futuro y continuidad hasta el próximo cambio. El apartado
  Donación de Marcar pensiones muestra los doce meses del año elegido y su estado. Sin monto,
  lo indica y no ofrece recepción. No depende de la cuota personal ni del número de Directores.
- La recepción tiene clave primaria por período. Configurar y recibir usan el mismo candado
  transaccional de casa, vuelven a verificar el rol activo y comparan el monto revisado. La primera
  recepción conserva monto, fecha y Director; las demás devuelven ese registro con `nueva=false`.
  Cambiar una vigencia conserva lo ya recibido. No hay acciones para editar, desmarcar o borrar.
  RLS y RPC limitan configuración, lectura y recepción a Directores. Realtime y el sondeo de
  treinta segundos actualizan las demás sesiones. La donación no crea abonos ni se multiplica.
- La exención usa una tabla singleton con un UUID y un mes de inicio. La cuenta muestra
  «Exento de pensión», importe cero, sin saldo ni pagos exigibles, y no figura entre quienes
  carecen de cuota. No suma a las metas desde su vigencia, en la vista mensual y anual.
  Conserva cuotas y movimientos previos, incluso adelantos que ya existieran, y los permisos
  de su rol. SQL protege cuotas y pagos con triggers y RPC; el formulario de cuota queda
  oculto para la cuenta exenta. Las demás cuentas siguen exigiendo cuotas positivas.
- El pago utiliza una envoltura de `marcar_pensiones` que identifica los nuevos UUID de abono
  bajo el mismo candado por persona. La RPC original mantiene su contrato de devolver también
  abonos anteriores. Los abonos explícitos requieren el snapshot de lo ya pagado para rechazar
  dobles clics o reintentos obsoletos. Solo los UUID nuevos programan `after()`.
- Cada abono nuevo tiene un evento durable, con el estado parcial/completo del momento de
  registrarlo. El aviso lleva solo siglas, importe del nuevo abono, mes/año y enlace al presupuesto.
  No consulta nombres ni los incluye en título, cuerpo, URL o etiqueta del dispositivo. Solo
  `administradora` activa, con la preferencia independiente `avisar_pensiones`, es destinataria.
  `administracion` queda excluida. Ajustes ofrece «Pagos de pensiones» solo a Administradora.
- La reserva atómica evento/dispositivo ocurre antes de llamar al proveedor push. Evita avisos
  repetidos incluso entre procesos concurrentes o con respuesta perdida. Como en mensajes, un
  fallo de transporte posterior a la reserva no se reintenta automáticamente, para evitar envíos
  ambiguos repetidos. Los fallos push se contienen y no revierten pagos. Sin movimiento nuevo,
  sin pago correcto o con importe cero, no hay aviso.
- Las cuentas referenciadas por donaciones o exención se desactivan: al intentar eliminarlas,
  Ajustes explica el motivo antes de llamar a Auth, conservando el historial.

## Migraciones nuevas

Aplicar después de las migraciones existentes, en orden, primero en Supabase temporal:

| Archivo | Contenido |
|---|---|
| `20261020120000_pensiones_exencion.sql` | Singleton sin activar, activación administrativa por UUID, protección SQL y estado en RPC mensual/anual |
| `20261020130000_pensiones_pagos_push.sql` | Preferencia independiente, eventos por abono, envoltura de movimientos nuevos y reserva por dispositivo |
| `20261020140000_pensiones_donaciones.sql` | Vigencias compartidas, recepción única e inmutable para la app, RLS/RPC y Realtime |

No se modificó ninguna migración anterior. No ejecutar `db:aplicar` desde este trabajo:
el procedimiento habitual del repositorio apunta a producción.

## Cuenta pendiente de identificar

Falta **el UUID real (`perfiles.id`) de la cuenta existente «Dani y José»**. La configuración local
no dispone de llaves API o credenciales de base de datos completas para verificarlo. La migración
deja `pensiones_exencion` vacía; no inventa un UUID, no crea cuentas y no exime por nombre.

Un responsable con acceso debe localizar la cuenta y comprobar que el resultado es único:

```sql
select id, usuario, siglas, rol, activo
from public.perfiles
where nombre = 'Dani y José';
```

Verificar que es la cuenta correcta de Director o Residente, no otra cuenta con el mismo nombre.
Si no hay un resultado inequívoco, conservar la exención sin activar. Con el UUID verificado,
ejecutar como mantenimiento (SQL Editor o `service_role`, nunca desde el navegador):

```sql
select public.activar_exencion_pension('UUID_VERIFICADO'::uuid);
select usuario_id, desde from public.pensiones_exencion;
```

El texto `UUID_VERIFICADO` es un marcador, no un identificador real. La función toma el primer
día del mes corriente en `America/El_Salvador` al activarse (octubre de 2026 si se activa este mes).
Si se difiere la activación, el inicio será ese otro mes. No cambia meses anteriores.
Repetir con el mismo UUID conserva la fecha original; intentar otro UUID se rechaza.
Ningún rol de la aplicación puede activar o ampliar la excepción.

## Activación y configuración externa

1. Ejecutar el CI del repositorio en su Supabase temporal con todas las migraciones; aprobar
   integración y E2E. Descargar y comparar el artefacto `database-types` según `CLAUDE.md`.
   El archivo preparado se generó automáticamente con el generador oficial `postgres-meta`
   desde PostgreSQL temporal con el esquema completo, sin editar tipos a mano; queda pendiente
   contrastarlo con el artefacto generado por Supabase de CI.
2. Revisar las tres migraciones y las demás pendientes antes de una activación autorizada.
   Aplicar el esquema antes de desplegar las pantallas que consultan las tablas/RPC nuevas.
3. Verificar y activar el UUID conforme al apartado anterior. Sin ese paso, las reglas normales
   de cuota siguen vigentes para todas las cuentas.
4. Configurar la donación como Director y probar dos sesiones de Director, incluidas una cuota
   personal ya pagada y la cuenta exenta. Comprobar que una recepción no crea pagos personales.
5. Confirmar las variables VAPID ya existentes en el servidor y la suscripción/permisos del
   dispositivo. En Ajustes de Administradora verificar «Pagos de pensiones». No requiere una
   variable, secreto Vault ni cron nuevos. Una preferencia habilitada no concede permisos al
   dispositivo si la persona no los otorgó.
6. Probar un abono parcial y el abono final con cuentas de prueba autorizadas; revisar siglas,
   importe nuevo, período y enlace. Administración no debe recibir nada. Confirmar en las
   tablas privadas del servidor una reserva por abono/dispositivo.

## Verificación de esta entrega

- `npm run lint`: aprobado.
- `npm run typecheck`: aprobado.
- `npm test`: 94 archivos y 1,582 casos aprobados.
- Banco PostgreSQL temporal: las 42 migraciones se aplicaron desde cero en transacciones
  independientes. Pasaron permisos SQL/RLS, pagos parciales y conservación de snapshots,
  ocho llamadas concurrentes de pago, doce recepciones concurrentes de donación y doce reservas
  concurrentes push. Se verificaron la exención única, cuotas normales positivas, historia
  intacta, los doce períodos del presupuesto anual y la recepción por un Director exento.
  También pasó la retención existente de doce PDF por categoría y la conservación ante carga
  fallida. Auth, Storage, Vault, cron y HTTP están simulados en este banco.
- `npm run test:integracion` y `npm run test:e2e`: se intentaron y abortaron en sus guardas de
  entorno porque no hay Supabase local configurado. No se ejecutaron contra producción.
  Las nuevas suites están listas para el entorno temporal del workflow `base-de-datos`.
- Playwright descubrió correctamente las 16 pruebas de Pensiones en tres archivos con
  `npx playwright test pensiones --list`; esto solo comprueba descubrimiento, no ejecución E2E.
- `npm run build`: aprobado con las variables ficticias de CI.
- Revisión visual aislada: 49 escenarios a 320/375/1280 px, letra normal/enorme,
  claro/oscuro y contraste suave/alto; sin desbordes, controles menores de 56 px o errores JS.
  Incluye foco de teclado en la confirmación de donación. Usa componentes, CSS y fuentes reales
  con acciones simuladas; no sustituye autenticación ni E2E de Supabase.

## Archivos principales

- Pantallas/componentes/acciones: `app/(app)/pensiones/`, sin cambios al almacenamiento de PDF.
- Reglas, consultas y etiquetas: `lib/pensiones/`; validación: `lib/validacion/pensiones.ts`.
- Push: `lib/push/cargas-pensiones.ts`, `avisos-pensiones.ts`, `enviar.ts` y `preferencias.ts`;
  persistencia en `lib/validacion/push.ts` y Ajustes, incluidos sus mensajes de conservación.
- Tipos generados: `lib/supabase/database.types.ts`; las tres migraciones del cuadro anterior.
- Pruebas nuevas de donaciones, exención y push en `tests/unit/`, `tests/integration/` y
  `tests/e2e/`, con fixtures y expectativas de reportes/preferencias existentes actualizados.
- Documentación: `README.md`, `CLAUDE.md`, `DESIGN.md`, `docs/pensiones.md` y esta guía.

El inventario completo se obtiene desde la rama con `git diff c06a448...HEAD --name-only`.
