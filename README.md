# Centro El Molino para la comunicacion con administracion

Sistema web interno del centro: comidas, mensajes, calendario, pensiones y configuraciones.

- **Diseño (spec):** `docs/superpowers/specs/2026-09-16-produccion-centro-el-molino-design.md`
- **Planes de implementación:** `docs/superpowers/plans/`
- **Prototipo original y su README:** `docs/prototipo/`

## Stack

Next.js 16 (App Router) + TypeScript · Supabase (Postgres, Auth, Realtime, pg_cron) · Vercel.

## Puesta en marcha (sin Docker)

1. Node 24 y `npm ci`.
2. Copiar `.env.example` a `.env.local` y completar con los datos del proyecto de Supabase. `CONTRASENA_DEMO` es la contraseña de las cuentas demo: es **un solo valor para todo el equipo** (mínimo 12 caracteres; el comando para generarla está en `.env.example`), compartido por un gestor de contraseñas. Ejecutar `datos-demo` con otro valor la cambia para todos.
3. `npm run datos-demo -- --confirmar` (solo antes del lanzamiento) y `npm run dev`.
4. Entrar con el usuario `demo.residente` y la contraseña de `CONTRASENA_DEMO` (u otra cuenta demo: `demo.director`, `demo.sacerdote`, `demo.numerario`, `demo.administracion`).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas unitarias (local) |
| `npm run test:integracion` / `npm run test:e2e` | Solo en CI (abortan fuera de Supabase local) |
| `npm run db:aplicar` | Aplica migraciones al proyecto por el Session pooler (`.env.local`) |
| `npm run db:tipos` | Regenera tipos desde el proyecto (requiere CLI logueada; alternativa: artefacto `database-types` de CI) |
| `npm run crear-director -- --nombre "…" --siglas XX --usuario …` | Crea un Director con contraseña temporal (entra con ese usuario) |
| `npm run datos-demo -- --confirmar` | Cuentas y datos demo (usuarios `demo.…`) con la contraseña de `CONTRASENA_DEMO`; a las cuentas que ya existen se la actualiza (sirve para rotarla) |
| `npm run limpiar-datos-demo -- --confirmar` | Borra todo lo demo (checklist de lanzamiento) |
| `npm run borrar-correos` | Dice cuántas cuentas tienen todavía un correo real en Auth; con `-- --confirmar` se los reemplaza por direcciones internas (no tiene vuelta atrás) |

## Reglas de trabajo

Para los cambios de comidas, notas de dieta, avisos, reacciones en respuestas y ausencias del
15 de octubre de 2026, ver [la guía de revisión local](docs/revision-local-2026-10-15.md): incluye
las tres migraciones pendientes, comandos de aplicación, pruebas por rol y verificaciones realizadas.

- Ramas `feat/...` desde `master`, PR con revisión y CI en verde.
- Migraciones con `npx supabase migration new <nombre>`; comprobar que se aplicaron con la Action de migraciones o `npm run db:aplicar`. El workflow de producción solo corre si está definida la variable `SUPABASE_PROJECT_REF` y están configurados sus secretos (ver `CLAUDE.md`).
- Funcionalidades con tablas nuevas: primero un PR de esquema, después el PR de pantallas (ver el índice de planes).
- Despliegue: Vercel (integración con Git) publica cada push a `master`.
- El repo debe seguir siendo **público** (requisito de Vercel Hobby).

## Activar la limpieza del registro de moderación

La migración `20261014130000_registro_moderacion_retencion.sql` limita la lectura al Director y
programa la limpieza diaria con pg_cron, ya habilitado por la migración de comidas. Cada entrada
vence tres meses calendario después de `eliminado_en`, calculados en UTC (por ejemplo, 31 de enero
→ 30 de abril); RLS la oculta desde ese instante y el job la borra en su siguiente ejecución.
La migración también elimina inmediatamente las entradas que ya vencieron.

Antes o junto con el merge, desde la rama que contiene la migración y con `.env.local` configurado
para el proyecto correcto:

1. Ejecutar `npm run db:aplicar -- --dry-run` y revisar **todas** las migraciones pendientes.
2. Ejecutar `npm run db:aplicar` para aplicarlas y registrarlas en el historial de Supabase.
3. Comprobar en el SQL Editor que existe un único job activo:

```sql
select jobid, jobname, schedule, command, username, database, active
from cron.job
where jobname = 'limpiar-registro-moderacion';
```

Debe mostrar `30 3 * * *`, `CALL public.limpiar_registro_moderacion()` y `active = true`.
Con pg_cron en UTC, se ejecuta a las 21:30 de El Salvador. Después de su primera ejecución,
comprobar el resultado:

```sql
select status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'limpiar-registro-moderacion')
order by start_time desc
limit 5;
```

## Reglas de negocio principales

Resumen; el detalle completo está en el spec.

- Roles: Director, Residente, Administración y Administradora (roles distintos; no se convierten cuentas automáticamente).
- Comidas por comida (desayuno, almuerzo, cena) con 6 estados; la semana parte del Plan semanal.
- Hora límite por comida (mismo día o día anterior) fijada por el Director; se editan fechas desde hoy hasta tres meses calendario después, ambos días incluidos, según la fecha del servidor en `America/El_Salvador`. Si el día no existe en el mes destino, se usa el último de ese mes.
- Solo el Director crea, edita y elimina eventos.
- Cuentas: solo el Director las crea; se desactivan en lugar de borrarse; contraseña temporal obligatoria.

## Activar Administradora y Pensiones

La implementación y sus pasos de activación están en [la guía de Pensiones](docs/pensiones.md).
Aplicá primero las cuatro migraciones `20261019…`, en orden de timestamp, y después desplegá
las pantallas. El valor del enum se agrega en una migración independiente. No se modifican roles
de cuentas existentes ni se crean cuotas ficticias.

Los reportes usan el bucket privado `pensiones-reportes` creado por la migración, con PDF de
hasta 3 MiB y 12 documentos por categoría. La limpieza durable requiere `CRON_SECRET` y los
secretos Vault `url_app` / `cron_secret` ya usados por los avisos. La guía detalla su verificación.

## Activar los tres meses editables de comidas

Aplicar `supabase/migrations/20261015130000_comidas_tres_meses.sql` antes o junto con el
despliegue de las pantallas. Con `.env.local` configurado para el proyecto correcto:

```powershell
npm run db:aplicar -- --dry-run
npm run db:aplicar
```

El primer comando muestra todas las migraciones pendientes. La nueva migración reemplaza
`comida_editable()`, que ya usan RLS y las RPC de guardar y volver al plan, tanto propias como
del Director. Conserva permisos, horas límite y cierres. No requiere nuevas variables de
entorno, cambios de configuración ni regenerar tipos.

El cálculo compartido de la aplicación está en `lib/comidas/periodo.ts`; los casos de
`tests/fixtures/casos-comidas.json` comprueban su paridad con SQL. Las pruebas de integración
verifican guardado y relectura a futuro y en el último día, rechazo por RLS/RPC del día siguiente,
ausencias y permisos; los E2E verifican la navegación y la última semana parcialmente editable.
Se ejecutan en el Supabase temporal de CI, nunca contra producción.
