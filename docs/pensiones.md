# Administradora y Pensiones

La ampliación del 20 de octubre de 2026 está en [donaciones, exención y avisos de pagos](pensiones-2026-10-20.md).
Esa guía complementa esta entrega inicial e incluye las migraciones nuevas y la activación pendiente por UUID.
La integración del 21 de octubre está en [presupuesto e ingresos por donaciones](pensiones-2026-10-21.md),
con su migración, verificaciones y pasos de despliegue.
La actualización del 26 de octubre está en [Pensiones de la casa y envío de donaciones](pensiones-2026-10-26.md).

La entrega inicial se implementó sobre `b572f76`. Las verificaciones históricas indicadas más abajo
corresponden a esa entrega; no acreditan la aplicación de migraciones ni pruebas a producción.

## Comportamiento y decisiones

- `administradora` es un rol nuevo, con etiqueta **Administradora**. Conserva las vistas y
  capacidades actuales de Administración en Comidas, Mensajes, Calendario y Ajustes, incluida
  privacidad por siglas y avisos de cocina. Ninguno tiene comidas propias. El Director puede
  crear cuentas y asignar el rol desde Ajustes. Administradora no es un rol exclusivo de una
  cuenta: el Director puede asignarlo a varias cuentas existentes en **Ajustes → Gestión de
  usuarios → Rol**. El despliegue no convierte ni modifica cuentas automáticamente.
  Administración y Administradora comparten la identidad genérica `Administración N` / `AN`,
  sin revelar nombres personales; sus etiquetas de rol son distintas.
- Administración no tiene acceso a Pensiones, sus acciones, tablas ni archivos. El Director
  edita cuotas; Director y Residente consultan y registran sus pagos propios en «Marcar pensiones».
  Solo el Director puede gestionar los de residentes y otros directores activos desde
  «Pensiones de la casa», conservando titular y autor del registro por separado.
  Presupuesto y Resúmenes son exclusivos de Director y Administradora; solo esta última sube PDF.
  «Resúmenes» conserva `/pensiones/reporte` y las categorías «Resúmenes Económicos» y
  «Otros documentos», con sus cargas, descargas y máximo de 12 PDF por categoría.
- Categoría y monto son individuales e independientes del rol. Los montos se almacenan en
  centavos enteros, entre 1 y 100 000 000 ($0.01–$1,000,000.00), sin multiplicar decimales de
  punto flotante. Sin cuota aplicable no se puede marcar un pago.
- Una cuota entra en vigor el primer día del mes elegido, desde el mes actual en adelante.
  Se permite sustituir su configuración en ese mismo mes de vigencia. No hay cambios retroactivos.
  La participación se registra por mes al crear, desactivar, reactivar o cambiar el rol de la
  cuenta. Estos cambios rigen desde el mes actual; no alteran meses pasados. Las cuentas de
  desarrollo `fuera_de_conteos` conservan su regla exclusiva de comidas: no determina Pensiones.
- Cada pago guarda período, categoría, monto y fecha originales. Incluso los pagos adelantados
  mantienen ese valor en el presupuesto si después cambia la cuota o se desactiva la cuenta.
  El presupuesto suma las cuotas aplicables de participantes del período y los snapshots ya pagados;
  nunca suma todos los adelantos al mes de registro. No se inventan presupuestos anteriores a la puesta
  en marcha. Las personas participantes sin cuota se anuncian y aportan cero hasta configurarla.
- «Ingresos por donaciones» es un concepto económico compartido de la casa, con monto mensual
  esperado y un solo registro de envío por mes y año. No requiere usuario, credenciales ni residente
  ficticio, y no forma parte de los conteos de personas. Solo el Director configura el monto con
  vigencia y registra el envío del dinero a la administración. El panel es independiente de «Mi pensión»
  y conserva el comportamiento desplegable. Sus etiquetas son «Registrar envío», «Enviado»,
  «Pendiente de envío» y «Enviado el…». Las tablas/RPC existentes conservan sus nombres
  de recepción y todos sus datos; «Pendiente de recibir» sigue usándose en Presupuesto.
- «Presupuesto mensual» reúne lo esperado por pensiones e ingresos por donaciones del período;
  «Real mensual» suma lo registrado como recibido; «Pendiente de recibir» es su
  diferencia, nunca negativa. El porcentaje usa esos mismos importes, con cero cuando no hay
  presupuesto y un máximo de 100 %. Recibir una donación aumenta una sola vez el real mensual,
  reduce el pendiente y conserva el presupuesto esperado: el importe ya estaba incluido.
  La vista anual consulta las mismas filas de cada mes y usa «Presupuesto anual» para el total
  esperado y «Real anual» para el total recibido;
  TypeScript no vuelve a agregar las donaciones que ya devuelve SQL.
- La recepción conserva importe, fecha y Director que la registró. Se atribuye al mes y año
  seleccionados, independientemente de la fecha real de registro. La clave primaria del período y
  el candado compartido impiden que dos Directores dupliquen el ingreso. Las recepciones ya
  guardadas aparecen automáticamente y conservan sus snapshots al cambiar la configuración de
  períodos posteriores. Administradora consulta los totales y pendientes en el resumen.
  La lista mensual «Ingresos del período» muestra únicamente ingresos recibidos, con su etiqueta
  y monto: las personas aparecen por siglas, los abonos parciales por lo ya pagado y «Ingresos
  por donaciones» solo después de su recepción. La vista anual conserva su desglose; no se
  expone el autor de recepción ni se ofrecen controles de escritura a Administradora.
- La exención de la cuenta «Dani y José» continúa vinculada a su UUID verificado y vigencia,
  sin deducirla del nombre. No crea cuotas de cero para otras cuentas ni elimina cuotas o abonos
  anteriores; los pagos históricos reales permanecen en los importes recibidos del mes y del año.
- Confirmar declara el pago válido inmediatamente, sin comprobantes ni aprobación. La RPC
  determina identidad y cuota, valida el lote completo y serializa pagos/configuración por
  persona. Un mes admite varios abonos parciales, cada uno con su ID, y la suma no supera su cuota.
  El navegador conserva una copia de lo esperado, lo ya pagado y el importe revisado: SQL los
  comprueba bajo el mismo candado para rechazar confirmaciones obsoletas. La acción distingue
  movimientos nuevos de los históricos antes de notificar. No existe edición, borrado ni reversión
  de pagos.
- El historial abarca todos los años. Las consultas extensas se paginan para evitar el recorte
  silencioso de PostgREST. Las cuentas con cuotas o pagos se desactivan; las FK impiden su
  eliminación física y Ajustes explica el motivo.
- El mes actual se determina en `America/El_Salvador`. La interfaz admite períodos 2000–2200.
  Las cuotas y los pagos no pueden registrarse para meses sin vigencia aplicable.
- Presupuesto devuelve nombres al Director y solo siglas a Administradora desde una RPC
  protegida. No se mandan nombres completos en ese payload, ni se conceden tablas crudas a
  Administradora. **Límite existente:** `perfiles` sigue legible por PostgREST para cualquier
  cuenta activa. La protección de nombres del resto de la app es del servidor, y esta entrega
  no afirma que exista seguridad por columna en `perfiles`.
- Las acciones revalidan Pensiones; Realtime actualiza las sesiones con lectura RLS autorizada.
  Un sondeo cada 30 segundos mientras la pestaña está visible y el retorno a ella cubren
  desconexiones y el presupuesto de Administradora, que no recibe filas crudas de pagos.

## Activación de la entrega inicial, en este orden

1. Ejecutar el flujo de CI con Supabase temporal: integración y E2E. Revisar el artefacto
   `database-types` y confirmar su paridad con `lib/supabase/database.types.ts`.
2. Revisar las migraciones pendientes con `npm run db:aplicar -- --dry-run`, con `.env.local`
   apuntando al proyecto correcto. Este comando usa producción según la configuración habitual
   del repositorio; no se ejecutó como parte de las verificaciones de esta entrega.
3. Aplicar las migraciones nuevas en orden y con transacción independiente por archivo:

   | Orden | Migración | Contenido |
   |---|---|---|
   | 1 | `20261019100000_rol_administradora.sql` | Agrega el enum y lo confirma antes de utilizarlo |
   | 2 | `20261019110000_administradora_herencia.sql` | Amplía solo permisos existentes de Administración |
   | 3 | `20261019120000_pensiones.sql` | Cuotas, participación, pagos, RLS y RPC |
   | 4 | `20261019130000_pensiones_reportes.sql` | Storage privado, reportes, retención y limpieza |

   `npm run db:aplicar` aplica los archivos pendientes y registra su historial. No envolver el
   enum y las migraciones dependientes en una única transacción manual. Si se usa SQL Editor,
   registrar después las versiones con `supabase migration repair`, según `CLAUDE.md`.
4. Desplegar el código después del esquema y justo junto a la ampliación de permisos. Las
   pantallas nuevas requieren las tablas/RPC nuevas; el código anterior no conoce Administradora.
5. En Ajustes, crear o asignar Administradora explícitamente. No hay conversión automática.
6. Como Director, configurar categoría, importe y vigencia de cada participante, incluido el
   propio. Verificar pagos propios y presupuesto usando cuentas de prueba autorizadas.

No se crean cuentas, cuotas ni pagos ficticios con las migraciones. El job de migraciones de
producción puede estar omitido por `SUPABASE_PROJECT_REF`; comprobar su ejecución, no asumirla.

## Almacenamiento y reportes

La migración crea el bucket **privado** `pensiones-reportes`, MIME `application/pdf`, máximo
**3 MiB (3 145 728 bytes)** por archivo. No hacerlo público ni agregar políticas de acceso
directo: una política restrictiva bloquea ese bucket para `anon` y `authenticated`, incluso
si posteriormente se agregan políticas permisivas generales. El servidor usa la llave secreta
solo después de comprobar sesión/rol y reservar la carga.

Categorías independientes: **Resúmenes Económicos** y **Otros documentos**. La segunda
es opcional. Se muestran de más reciente a más antiguo, con nombre y fecha de carga local.
Cada categoría conserva hasta 12 documentos disponibles. El archivo 13 se almacena antes de
finalizar una transacción que conserva el nuevo, retira el más antiguo de esa categoría y
encola su borrado físico. Un candado por categoría serializa cargas simultáneas.

La validación del servidor comprueba extensión, tamaño, cabecera `%PDF-…` y terminador `%%EOF`;
no confía en el MIME enviado. Es validación de formato, no un análisis antivirus ni un parser
completo del contenido PDF. `serverActions.bodySizeLimit = '4mb'` deja margen a FormData sin
superar el límite habitual del proveedor; el límite de documento sigue siendo 3 MiB.

Las descargas pasan por `/api/pensiones/reportes/[id]`: sesión activa, contraseña cambiada,
rol Director/Administradora y metadatos RLS se comprueban en cada petición. La respuesta usa
`attachment`, `no-store` y `nosniff`. No se entregan URLs firmadas reutilizables ni rutas privadas
al navegador. Conocer la URL de descarga o del objeto no concede permiso a otros roles.

La reserva durable existe **antes** de subir bytes. Si falla la carga nueva no se retira ningún
documento anterior. Si se pierde la respuesta de finalización se comprueba el resultado antes
de anunciar éxito. Reservas vencidas (una hora), cancelaciones y archivos huérfanos se reconcilian
mediante una cola durable; nunca se borra el archivo de un reporte vigente. Durante una falla
de Storage pueden quedar bytes privados pendientes de limpieza, inaccesibles por la app; se
reintentan hasta borrarse, sin dejar metadatos disponibles apuntando a un objeto eliminado.

Requiere las variables existentes `SUPABASE_SECRET_KEY` y `CRON_SECRET` en el servidor, y los
secretos Vault `url_app` (origen HTTPS de la app) y `cron_secret` (igual a `CRON_SECRET`). Ver
`supabase/snippets/configurar-vault.sql`. No se añadieron nuevas variables ni se modificó Vault.
`after()` intenta limpiar al terminar la carga; pg_cron llama por POST a
`/api/cron/pensiones-reportes` cada diez minutos como respaldo.

Verificar después de aplicar:

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'pensiones-reportes';

select jobname, schedule, command from cron.job
where jobname = 'limpiar-reportes-pensiones';

select categoria, count(*) from public.pensiones_reportes group by categoria;
select count(*) as pendientes from public.pensiones_reportes_limpieza;
```

Debe haber un único job con `*/10 * * * *`, bucket privado y máximo 12 fichas por categoría.
Comprobar también las ejecuciones en `cron.job_run_details` y la respuesta HTTP del trabajador:
el éxito del job SQL solo acredita que se despachó la petición, no que Storage ya se limpió.

## Verificación y alcance de la entrega inicial

- `npm run lint`: aprobado.
- `npm run typecheck`: aprobado con tipos regenerados.
- `npm test`: **88 archivos y 1,493 casos aprobados**.
- `npm run build`: aprobado usando las variables ficticias del CI. La primera ejecución en
  sandbox falló al descargar Google Fonts; la repetición con red habilitada terminó correctamente.
- Las 36 migraciones se aplicaron desde cero en PostgreSQL 18 temporal local, con transacción
  separada por archivo. Las comprobaciones SQL pasaron para permisos, cuotas distintas, montos
  históricos, presupuestos pasados ante cambios de cuenta, pagos concurrentes (ocho llamadas), lotes
  atómicos, privacidad de presupuesto y retención concurrente 12+12 de reportes.
- Los tipos están sincronizados con el artefacto oficial `database-types` del CI
  [39340566874](https://github.com/jose-mario-sandoval/Sistema_Centro_El_Molino/actions/runs/39340566874),
  generado desde Supabase temporal con todas las migraciones. No se editaron a mano.
- Ese CI aprobó las **401 pruebas de integración**, incluidas Auth, RLS y Storage de Supabase.
- El banco SQL local simula Auth, Vault, Storage, cron y net. El CI complementa esa revisión
  con Auth, RLS y Storage reales del Supabase temporal. Los E2E se ejecutan exclusivamente
  en ese entorno, sin pruebas contra producción. La ejecución del cron remoto y la revisión
  con residentes mayores siguen siendo verificaciones pendientes.
- La revisión visual aislada usa componentes, CSS y fuentes reales con backend/router simulados:
  130 casos a 320/375/768/1280 px, letra normal/enorme, claro/oscuro y contraste suave/alto.
  Se revisaron capturas y se corrigieron recortes de controles nativos sin reducir el texto.
  Este arnés no verifica autenticación ni sustituye las pruebas E2E del CI.

Las pruebas añadidas cubren herencia de Administradora; exclusión de Administración; escritura
de cuotas exclusiva del Director; pagos propios, duplicados y concurrencia; cuotas diferentes;
historia y presupuestos por período; nombres/siglas; reportes autorizados; límites independientes;
cargas fallidas; limpieza reintentable; y navegación móvil accesible.

## Archivos

La lógica nueva está en `lib/pensiones/`, las validaciones en `lib/validacion/pensiones.ts` y
`reportes-pensiones.ts`, y las pantallas/acciones en `app/(app)/pensiones/`. Se agregaron las rutas
de descarga y cron, y cuatro migraciones nuevas. La integración existente modifica roles,
visibilidad, cuentas, comidas, mensajes, calendario, push, navegación, estilos y documentación.
El siguiente inventario contiene los archivos concretos de esta entrega.

- `.gitignore`
- `app/(app)/calendario/page.tsx`
- `app/(app)/comidas/plan/page.tsx`
- `app/(app)/comidas/semana/page.tsx`
- `app/(app)/configuraciones/_componentes/fila-cuenta.tsx`
- `app/(app)/configuraciones/_componentes/formulario-mi-cuenta.tsx`
- `app/(app)/configuraciones/_componentes/modal-cambiar-rol.tsx`
- `app/(app)/configuraciones/_componentes/modal-nueva-cuenta.tsx`
- `app/(app)/configuraciones/acciones.ts`
- `app/(app)/layout.tsx`
- `app/(app)/mensajes/_componentes/cola-moderacion.tsx`
- `app/(app)/mensajes/_componentes/formulario-publicar.tsx`
- `app/(app)/mensajes/_componentes/tarjeta-mensaje.tsx`
- `app/(app)/mensajes/acciones.ts`
- `app/(app)/pensiones/_componentes/editar-cuota.tsx`
- `app/(app)/pensiones/_componentes/marcar.tsx`
- `app/(app)/pensiones/_componentes/pestanas.tsx`
- `app/(app)/pensiones/_componentes/refrescar.tsx`
- `app/(app)/pensiones/_componentes/reportes-pensiones.tsx`
- `app/(app)/pensiones/_componentes/selector-periodo.tsx`
- `app/(app)/pensiones/acciones.ts`
- `app/(app)/pensiones/acciones-reporte.ts`
- `app/(app)/pensiones/editar/page.tsx`
- `app/(app)/pensiones/error.tsx`
- `app/(app)/pensiones/layout.tsx`
- `app/(app)/pensiones/loading.tsx`
- `app/(app)/pensiones/marcar/page.tsx`
- `app/(app)/pensiones/page.tsx`
- `app/(app)/pensiones/presupuesto/page.tsx`
- `app/(app)/pensiones/reporte/page.tsx`
- `app/api/cron/pensiones-reportes/route.ts`
- `app/api/pensiones/reportes/[id]/route.ts`
- `app/globals.css`
- `CLAUDE.md`
- `components/app/estructura.tsx`
- `components/app/navegacion.tsx`
- `components/ui/iconos.tsx`
- `DESIGN.md`
- `docs/pensiones.md`
- `eslint.config.mjs`
- `lib/calendario/consultas.ts`
- `lib/comidas/casa.ts`
- `lib/comidas/permisos.ts`
- `lib/mensajes/feed.ts`
- `lib/mensajes/fijados.ts`
- `lib/pensiones/calculos.ts`
- `lib/pensiones/consultas.ts`
- `lib/pensiones/paginacion.ts`
- `lib/pensiones/permisos.ts`
- `lib/pensiones/reportes.ts`
- `lib/pensiones/reportes-consultas.ts`
- `lib/pensiones/reportes-limpieza.ts`
- `lib/pensiones/tipos.ts`
- `lib/perfiles/roles.ts`
- `lib/perfiles/visibilidad.ts`
- `lib/push/destinatarios.ts`
- `lib/push/preferencias.ts`
- `lib/supabase/database.types.ts`
- `lib/validacion/configuraciones.ts`
- `lib/validacion/pensiones.ts`
- `lib/validacion/reportes-pensiones.ts`
- `next.config.ts`
- `README.md`
- `supabase/migrations/20261019100000_rol_administradora.sql`
- `supabase/migrations/20261019110000_administradora_herencia.sql`
- `supabase/migrations/20261019120000_pensiones.sql`
- `supabase/migrations/20261019130000_pensiones_reportes.sql`
- `tests/e2e/pensiones.spec.ts`
- `tests/integration/administradora.test.ts`
- `tests/integration/pensiones.test.ts`
- `tests/integration/pensiones-reportes.test.ts`
- `tests/soporte/usuarios-prueba.ts`
- `tests/unit/configuraciones/acciones.test.ts`
- `tests/unit/configuraciones/validacion.test.ts`
- `tests/unit/mensajes/acciones.test.ts`
- `tests/unit/pensiones/acciones.test.ts`
- `tests/unit/pensiones/calculos.test.ts`
- `tests/unit/pensiones/paginacion.test.ts`
- `tests/unit/pensiones/reportes.test.ts`
- `tests/unit/pensiones/reportes-acciones.test.ts`
- `tests/unit/pensiones/reportes-cron.test.ts`
- `tests/unit/pensiones/reportes-descarga.test.ts`
- `tests/unit/pensiones/reportes-limpieza.test.ts`
- `tests/unit/perfiles/administradora.test.ts`
- `tsconfig.json`
